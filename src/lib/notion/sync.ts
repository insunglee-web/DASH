import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notionPage, notionPageContent, notionRoot, syncRun, syncState } from "@/db/schema";
import { addDays, parseMeetingTitle, todayYmd } from "../date";
import { DeferredError } from "../http/retry";
import { describeError } from "../security/mask";
import { normalizeId, notionConfigFromEnv, notionUrl, pageTitle, retrievePage, NotionError } from "./client";
import { fetchPageContent, plainText } from "./render";
import { collectChildPages } from "./tree";

// Notion 회의록 동기화 (architecture.md 3장, 7장)
// 1) 상위 페이지 아래 하위 페이지 목록 수집 → 2) 제목에서 날짜 추출 → 3) 바뀐 페이지와 최근 14일 페이지의 본문 수집

export type NotionSyncResult = {
  status: "success" | "partial" | "failed" | "skipped" | "deferred";
  pagesFound: number;
  pagesChanged: number;
  contentsFetched: number;
  apiCalls: number;
  message?: string;
};

const LEASE_MS = 5 * 60 * 1000;
const RECENT_DAYS = 14;
/** 본문 하나를 더 읽기 전에 남겨 둘 최소 시간 */
const CONTENT_RESERVE_MS = 20_000;

export async function syncNotion(userId: string, options: { budgetMs?: number } = {}): Promise<NotionSyncResult> {
  const db = getDb();
  const startedAt = Date.now();
  const deadline = startedAt + (options.budgetMs ?? 240_000);
  const result: NotionSyncResult = { status: "success", pagesFound: 0, pagesChanged: 0, contentsFetched: 0, apiCalls: 0 };

  // 실행 잠금: 이전 실행이 진행 중이면 건너뛴다
  const leaseUntil = new Date(startedAt + LEASE_MS);
  const [lease] = await db
    .insert(syncState)
    .values({ userId, source: "notion", leaseUntil })
    .onConflictDoUpdate({
      target: [syncState.userId, syncState.source],
      set: { leaseUntil },
      setWhere: sql`${syncState.leaseUntil} is null or ${syncState.leaseUntil} < now()`,
    })
    .returning({ userId: syncState.userId });
  if (!lease) return { ...result, status: "skipped", message: "이미 동기화가 진행 중입니다." };

  const [run] = await db.insert(syncRun).values({ userId, source: "notion" }).returning({ id: syncRun.id });

  try {
    const config = { ...notionConfigFromEnv(deadline), onCall: () => void result.apiCalls++ };
    const rootId = normalizeId(process.env.NOTION_MEETING_ROOT_PAGE_ID ?? "");
    if (!rootId) throw new NotionError(0, "not_configured", "NOTION_MEETING_ROOT_PAGE_ID가 설정되지 않았습니다.");
    const maxDepth = Math.min(Math.max(Number(process.env.NOTION_MAX_DEPTH ?? "2") || 2, 1), 4);

    const rootPage = await retrievePage(config, rootId);
    const [root] = await db
      .insert(notionRoot)
      .values({ userId, notionPageId: rootId, title: pageTitle(rootPage), maxDepth })
      .onConflictDoUpdate({ target: notionRoot.notionPageId, set: { title: pageTitle(rootPage), maxDepth } })
      .returning({ id: notionRoot.id });

    const found = await collectChildPages(config, rootId, maxDepth);
    result.pagesFound = found.length;

    const existing = await db
      .select({
        id: notionPage.id,
        notionPageId: notionPage.notionPageId,
        lastEditedTime: notionPage.lastEditedTime,
        contentSyncedEditedTime: notionPage.contentSyncedEditedTime,
        title: notionPage.title,
      })
      .from(notionPage)
      .where(eq(notionPage.rootId, root.id));
    const byNotionId = new Map(existing.map((row) => [row.notionPageId, row]));

    const recentFrom = addDays(todayYmd(), -RECENT_DAYS);
    const contentQueue: { id: string; notionPageId: string; lastEdited: Date | null }[] = [];

    for (const page of found) {
      const parsed = parseMeetingTitle(page.title);
      const lastEdited = page.lastEditedTime ? new Date(page.lastEditedTime) : null;
      const before = byNotionId.get(page.id);
      if (!before || before.title !== page.title || before.lastEditedTime?.getTime() !== lastEdited?.getTime()) {
        result.pagesChanged++;
      }
      const [row] = await db
        .insert(notionPage)
        .values({
          rootId: root.id,
          notionPageId: page.id,
          parentNotionPageId: page.parentId,
          title: page.title,
          meetingDate: parsed.date,
          titleSuffix: parsed.suffix,
          weekdayMismatch: parsed.weekdayMismatch,
          dateSource: parsed.date ? "title" : "unparsed",
          url: notionUrl(page.id),
          createdTime: page.createdTime ? new Date(page.createdTime) : null,
          lastEditedTime: lastEdited,
          archived: false,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: notionPage.notionPageId,
          set: {
            rootId: root.id,
            parentNotionPageId: page.parentId,
            title: page.title,
            meetingDate: parsed.date,
            titleSuffix: parsed.suffix,
            weekdayMismatch: parsed.weekdayMismatch,
            dateSource: parsed.date ? "title" : "unparsed",
            lastEditedTime: lastEdited,
            archived: false,
            syncedAt: new Date(),
          },
        })
        .returning({ id: notionPage.id, contentSyncedEditedTime: notionPage.contentSyncedEditedTime });

      const neverFetched = row.contentSyncedEditedTime === null;
      const edited = lastEdited !== null && row.contentSyncedEditedTime?.getTime() !== lastEdited.getTime();
      // child_page 블록의 수정 시각이 본문 수정을 늘 반영하는지는 확인 전이라, 최근 회의록은 매번 다시 읽는다
      const recent = parsed.date !== null && parsed.date >= recentFrom;
      if (neverFetched || edited || recent) contentQueue.push({ id: row.id, notionPageId: page.id, lastEdited });
    }

    // 더 이상 보이지 않는 페이지는 보관 처리
    const foundIds = found.map((p) => p.id);
    await db
      .update(notionPage)
      .set({ archived: true })
      .where(
        foundIds.length > 0
          ? and(eq(notionPage.rootId, root.id), notInArray(notionPage.notionPageId, foundIds))
          : eq(notionPage.rootId, root.id),
      );

    // 최근 날짜부터 본문을 읽는다
    const dates = new Map(found.map((p) => [p.id, parseMeetingTitle(p.title).date ?? ""]));
    contentQueue.sort((a, b) => (dates.get(b.notionPageId) ?? "").localeCompare(dates.get(a.notionPageId) ?? ""));

    for (const item of contentQueue) {
      if (Date.now() > deadline - CONTENT_RESERVE_MS) {
        result.status = "partial";
        result.message = `시간 예산을 넘어 본문 ${contentQueue.length - result.contentsFetched}건은 다음 동기화에서 읽습니다.`;
        break;
      }
      const content = await fetchPageContent(config, item.notionPageId);
      await db
        .insert(notionPageContent)
        .values({
          pageId: item.id,
          blocks: content.blocks,
          plainText: plainText(content.blocks).slice(0, 50_000),
          blockCount: content.blockCount,
          truncated: content.truncated,
        })
        .onConflictDoUpdate({
          target: notionPageContent.pageId,
          set: {
            blocks: content.blocks,
            plainText: plainText(content.blocks).slice(0, 50_000),
            blockCount: content.blockCount,
            truncated: content.truncated,
          },
        });
      await db.update(notionPage).set({ contentSyncedEditedTime: item.lastEdited }).where(eq(notionPage.id, item.id));
      result.contentsFetched++;
    }
  } catch (error) {
    if (error instanceof DeferredError) {
      result.status = "deferred";
      result.message = "Notion 호출 한도에 걸려 다음 동기화로 미뤘습니다.";
    } else {
      result.status = "failed";
      result.message =
        error instanceof NotionError ? notionErrorMessage(error) : `동기화 중 오류: ${describeError(error)}`;
      console.error("[notion] 동기화 실패", describeError(error));
    }
  }

  const ok = result.status === "success" || result.status === "partial";
  await db
    .update(syncRun)
    .set({
      finishedAt: new Date(),
      status: result.status,
      itemsFetched: result.pagesFound,
      itemsChanged: result.pagesChanged,
      apiCalls: result.apiCalls,
      errorMessage: result.message ?? null,
    })
    .where(eq(syncRun.id, run.id));
  await db
    .update(syncState)
    .set({
      leaseUntil: null,
      ...(ok
        ? { lastSuccessAt: new Date(), consecutiveFailures: 0 }
        : { consecutiveFailures: sql`${syncState.consecutiveFailures} + 1` }),
    })
    .where(and(eq(syncState.userId, userId), inArray(syncState.source, ["notion"])));

  return result;
}

function notionErrorMessage(error: NotionError): string {
  if (error.code === "not_configured") return error.message;
  if (error.status === 401) return "Notion 토큰이 올바르지 않습니다. NOTION_INTERNAL_TOKEN을 확인해 주세요.";
  if (error.status === 404 || error.status === 403) {
    return "회의록 상위 페이지에 접근할 수 없습니다. 「놀발 업무일지 및 미팅록」 → ••• → Connections에서 연결을 추가했는지 확인해 주세요.";
  }
  return `Notion 오류(${error.status} ${error.code})`;
}
