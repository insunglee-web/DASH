import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notionPage, notionPageContent, notionRoot, syncState } from "@/db/schema";
import type { DocBlock } from "./render";

export type NoteSummary = {
  id: string;
  title: string;
  meetingDate: string | null;
  titleSuffix: string | null;
  weekdayMismatch: boolean;
  url: string | null;
  lastEditedTime: Date | null;
  hasContent: boolean;
};

const summaryColumns = {
  id: notionPage.id,
  title: notionPage.title,
  meetingDate: notionPage.meetingDate,
  titleSuffix: notionPage.titleSuffix,
  weekdayMismatch: notionPage.weekdayMismatch,
  url: notionPage.url,
  lastEditedTime: notionPage.lastEditedTime,
  contentPageId: notionPageContent.pageId,
};

function baseQuery(userId: string) {
  return getDb()
    .select(summaryColumns)
    .from(notionPage)
    .innerJoin(notionRoot, eq(notionRoot.id, notionPage.rootId))
    .leftJoin(notionPageContent, eq(notionPageContent.pageId, notionPage.id))
    .where(and(eq(notionRoot.userId, userId), eq(notionPage.archived, false)))
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];
const toSummary = ({ contentPageId, ...rest }: Row): NoteSummary => ({ ...rest, hasContent: contentPageId !== null });

export async function listNotes(userId: string): Promise<NoteSummary[]> {
  const rows = await baseQuery(userId).orderBy(desc(notionPage.meetingDate), desc(notionPage.lastEditedTime));
  return rows.map(toSummary);
}

export async function notesForDate(userId: string, ymd: string): Promise<NoteSummary[]> {
  const rows = await getDb()
    .select(summaryColumns)
    .from(notionPage)
    .innerJoin(notionRoot, eq(notionRoot.id, notionPage.rootId))
    .leftJoin(notionPageContent, eq(notionPageContent.pageId, notionPage.id))
    .where(and(eq(notionRoot.userId, userId), eq(notionPage.archived, false), eq(notionPage.meetingDate, ymd)))
    .orderBy(notionPage.title);
  return rows.map(toSummary);
}

export async function getNote(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({ ...summaryColumns, blocks: notionPageContent.blocks, truncated: notionPageContent.truncated })
    .from(notionPage)
    .innerJoin(notionRoot, eq(notionRoot.id, notionPage.rootId))
    .leftJoin(notionPageContent, eq(notionPageContent.pageId, notionPage.id))
    .where(and(eq(notionRoot.userId, userId), eq(notionPage.id, id)));
  if (!row) return null;
  const { blocks, truncated, ...summary } = row;
  return { ...toSummary(summary), blocks: (blocks ?? []) as DocBlock[], truncated: truncated ?? false };
}

export async function lastNotionSync(userId: string) {
  const [row] = await getDb()
    .select({ lastSuccessAt: syncState.lastSuccessAt, failures: syncState.consecutiveFailures })
    .from(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.source, "notion")));
  return row ?? null;
}
