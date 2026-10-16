import "server-only";
import { and, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gcalCalendar, gcalEvent, syncRun, syncState } from "@/db/schema";
import { addDays, seoulDayRange, todayYmd } from "../date";
import { BridgeError, callCalendarBridge, type BridgeCalendar, type BridgeEvent } from "../gas/client";
import { describeError } from "../security/mask";
import { toEventRow } from "./mapping";

// 캘린더 동기화 (architecture.md 4-4): 기간 창(-7일 ~ +60일)을 통째로 다시 받아 DB와 맞춘다.

export const WINDOW_PAST_DAYS = 7;
export const WINDOW_FUTURE_DAYS = 60;
const LEASE_MS = 5 * 60 * 1000;

export type CalendarSyncResult = {
  status: "success" | "partial" | "failed" | "skipped";
  calendars: number;
  events: number;
  message?: string;
};

export function syncWindow(now = new Date()) {
  const today = todayYmd(now);
  return {
    from: seoulDayRange(addDays(today, -WINDOW_PAST_DAYS)).start,
    to: seoulDayRange(addDays(today, WINDOW_FUTURE_DAYS)).end,
  };
}

export async function syncCalendar(userId: string, options: { budgetMs?: number } = {}): Promise<CalendarSyncResult> {
  const db = getDb();
  const startedAt = Date.now();
  const deadline = startedAt + (options.budgetMs ?? 240_000);
  const result: CalendarSyncResult = { status: "success", calendars: 0, events: 0 };

  const leaseUntil = new Date(startedAt + LEASE_MS);
  const [lease] = await db
    .insert(syncState)
    .values({ userId, source: "calendar", leaseUntil })
    .onConflictDoUpdate({
      target: [syncState.userId, syncState.source],
      set: { leaseUntil },
      setWhere: sql`${syncState.leaseUntil} is null or ${syncState.leaseUntil} < now()`,
    })
    .returning({ userId: syncState.userId });
  if (!lease) return { ...result, status: "skipped", message: "이미 동기화가 진행 중입니다." };

  const [run] = await db.insert(syncRun).values({ userId, source: "calendar" }).returning({ id: syncRun.id });
  let apiCalls = 0;

  try {
    apiCalls++;
    const calendars = await callCalendarBridge<BridgeCalendar[]>("listCalendars", {}, { deadline });
    result.calendars = calendars.length;

    // 캘린더 목록 반영(브리지 허용 목록에서 빠진 캘린더는 일정과 함께 지운다)
    const seenCalendarIds = calendars.map((c) => c.id);
    const calendarRows = new Map<string, string>();
    for (const cal of calendars) {
      const [row] = await db
        .insert(gcalCalendar)
        .values({ userId, googleCalendarId: cal.id, summary: cal.name, isWritable: cal.writable, color: cal.color })
        .onConflictDoUpdate({
          target: [gcalCalendar.userId, gcalCalendar.googleCalendarId],
          set: { summary: cal.name, isWritable: cal.writable, color: cal.color },
        })
        .returning({ id: gcalCalendar.id, isVisible: gcalCalendar.isVisible });
      if (row.isVisible) calendarRows.set(cal.id, row.id);
    }
    await db
      .delete(gcalCalendar)
      .where(
        seenCalendarIds.length > 0
          ? and(eq(gcalCalendar.userId, userId), notInArray(gcalCalendar.googleCalendarId, seenCalendarIds))
          : eq(gcalCalendar.userId, userId),
      );

    const { from, to } = syncWindow();
    for (const [googleId, calendarRowId] of calendarRows) {
      if (Date.now() > deadline - 15_000) {
        result.status = "partial";
        result.message = "시간 예산을 넘어 일부 캘린더는 다음 동기화에서 가져옵니다.";
        break;
      }
      apiCalls++;
      const { events, truncated } = await callCalendarBridge<{ events: BridgeEvent[]; truncated: boolean }>(
        "listEvents",
        { calendarId: googleId, from: from.toISOString(), to: to.toISOString() },
        { deadline },
      );
      if (truncated) result.status = "partial";
      result.events += events.length;

      const keys: string[] = [];
      for (const event of events) {
        const row = toEventRow(event);
        keys.push(`${row.icalUid}|${row.instanceStart.toISOString()}`);
        await db
          .insert(gcalEvent)
          .values({ calendarId: calendarRowId, ...row, missingSince: null })
          .onConflictDoUpdate({
            target: [gcalEvent.calendarId, gcalEvent.icalUid, gcalEvent.instanceStart],
            set: { ...row, missingSince: null },
          });
      }

      // 기간 창 안에서 이번에 보이지 않은 일정은 삭제된 것으로 보고 캐시에서 지운다
      const windowRows = await db
        .select({ id: gcalEvent.id, icalUid: gcalEvent.icalUid, instanceStart: gcalEvent.instanceStart })
        .from(gcalEvent)
        .where(
          and(
            eq(gcalEvent.calendarId, calendarRowId),
            gte(gcalEvent.instanceStart, from),
            lt(gcalEvent.instanceStart, to),
          ),
        );
      const keySet = new Set(keys);
      const gone = windowRows.filter((r) => !keySet.has(`${r.icalUid}|${r.instanceStart.toISOString()}`)).map((r) => r.id);
      if (gone.length > 0) await db.delete(gcalEvent).where(inArray(gcalEvent.id, gone));

      await db.update(gcalCalendar).set({ lastWindowSyncedAt: new Date() }).where(eq(gcalCalendar.id, calendarRowId));
    }

    // 90일보다 오래된 캐시는 정리
    if (calendarRows.size > 0) {
      await db
        .delete(gcalEvent)
        .where(
          and(
            inArray(gcalEvent.calendarId, [...calendarRows.values()]),
            lt(gcalEvent.instanceStart, seoulDayRange(addDays(todayYmd(), -90)).start),
          ),
        );
    }
  } catch (error) {
    result.status = "failed";
    result.message = error instanceof BridgeError ? bridgeErrorMessage(error) : `동기화 중 오류: ${describeError(error)}`;
    console.error("[calendar] 동기화 실패", describeError(error));
  }

  const ok = result.status === "success" || result.status === "partial";
  await db
    .update(syncRun)
    .set({
      finishedAt: new Date(),
      status: result.status,
      itemsFetched: result.events,
      apiCalls,
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
    .where(and(eq(syncState.userId, userId), eq(syncState.source, "calendar")));
  return result;
}

export function bridgeErrorMessage(error: BridgeError): string {
  switch (error.code) {
    case "server_not_configured":
      return "Vercel에 GAS_CALENDAR_WEBAPP_URL 또는 GAS_CALENDAR_SHARED_SECRET이 없습니다.";
    case "not_configured":
      return "Apps Script의 SHARED_SECRET 스크립트 속성이 없거나 32자보다 짧습니다. 스크립트 속성을 확인해 주세요.";
    case "unauthorized":
      return "서명이 올바르지 않습니다. Apps Script의 SHARED_SECRET과 Vercel의 GAS_CALENDAR_SHARED_SECRET이 같은지 확인해 주세요.";
    case "expired":
      return "요청 시각이 맞지 않습니다. 잠시 후 다시 시도해 주세요.";
    case "forbidden":
      return "허용되지 않은 캘린더입니다. Apps Script의 READ_/WRITE_CALENDAR_IDS를 확인해 주세요.";
    case "test_mode":
    case "conflict":
    case "recurring_readonly":
    case "not_found":
    case "bad_request":
      return error.message;
    case "bad_response":
      return "브리지 응답을 읽지 못했습니다. 웹 앱 배포의 액세스 권한이 '모든 사용자'인지 확인해 주세요.";
    default:
      return `캘린더 브리지 오류(${error.code})`;
  }
}
