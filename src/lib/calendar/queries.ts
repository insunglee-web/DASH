import "server-only";
import { and, asc, eq, gt, gte, isNotNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gcalCalendar, gcalEvent, syncState } from "@/db/schema";
import { addDays, seoulDayRange, type Ymd } from "../date";
import { allDayCovers, timedOverlaps } from "./mapping";

export type CalendarEvent = {
  id: string;
  calendarName: string;
  calendarColor: string | null;
  writable: boolean;
  summary: string;
  location: string | null;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  isRecurring: boolean;
};

const columns = {
  id: gcalEvent.id,
  calendarName: gcalCalendar.summary,
  calendarColor: gcalCalendar.color,
  writable: gcalCalendar.isWritable,
  summary: gcalEvent.summary,
  location: gcalEvent.location,
  description: gcalEvent.description,
  startAt: gcalEvent.startAt,
  endAt: gcalEvent.endAt,
  startDate: gcalEvent.startDate,
  endDate: gcalEvent.endDate,
  isAllDay: gcalEvent.isAllDay,
  isRecurring: gcalEvent.isRecurring,
};

/** 서울 기준 [fromYmd, toYmd] 기간에 걸치는 일정 */
export async function eventsBetween(userId: string, fromYmd: Ymd, toYmd: Ymd): Promise<CalendarEvent[]> {
  const start = seoulDayRange(fromYmd).start;
  const end = seoulDayRange(toYmd).end;
  return getDb()
    .select(columns)
    .from(gcalEvent)
    .innerJoin(gcalCalendar, eq(gcalCalendar.id, gcalEvent.calendarId))
    .where(
      and(
        eq(gcalCalendar.userId, userId),
        eq(gcalCalendar.isVisible, true),
        or(
          and(isNotNull(gcalEvent.startAt), lt(gcalEvent.startAt, end), gt(gcalEvent.endAt, start)),
          and(
            eq(gcalEvent.isAllDay, true),
            lte(gcalEvent.startDate, toYmd),
            or(gt(gcalEvent.endDate, fromYmd), gte(gcalEvent.startDate, fromYmd)),
          ),
        ),
      ),
    )
    .orderBy(asc(gcalEvent.isAllDay), asc(gcalEvent.startAt), asc(gcalEvent.startDate));
}

/** 하루치: 종일 일정 먼저, 그다음 시간순 */
export async function eventsForDay(userId: string, ymd: Ymd): Promise<CalendarEvent[]> {
  const rows = await eventsBetween(userId, ymd, ymd);
  return filterDay(rows, ymd);
}

export function filterDay(rows: CalendarEvent[], ymd: Ymd): CalendarEvent[] {
  const day = rows.filter((e) =>
    e.isAllDay && e.startDate
      ? allDayCovers(e.startDate, e.endDate, ymd)
      : e.startAt && e.endAt
        ? timedOverlaps(e.startAt, e.endAt, ymd)
        : false,
  );
  return [...day.filter((e) => e.isAllDay), ...day.filter((e) => !e.isAllDay)];
}

export async function eventsForWeek(userId: string, fromYmd: Ymd): Promise<{ ymd: Ymd; events: CalendarEvent[] }[]> {
  const toYmd = addDays(fromYmd, 6);
  const rows = await eventsBetween(userId, fromYmd, toYmd);
  return Array.from({ length: 7 }, (_, i) => {
    const ymd = addDays(fromYmd, i);
    return { ymd, events: filterDay(rows, ymd) };
  });
}

export async function writableCalendars(userId: string) {
  return getDb()
    .select({ id: gcalCalendar.id, googleId: gcalCalendar.googleCalendarId, name: gcalCalendar.summary })
    .from(gcalCalendar)
    .where(and(eq(gcalCalendar.userId, userId), eq(gcalCalendar.isWritable, true)));
}

/** 수정·삭제할 일정과 그 캘린더 정보 */
export async function eventForWrite(userId: string, eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const [row] = await getDb()
    .select({
      id: gcalEvent.id,
      calendarRowId: gcalCalendar.id,
      googleCalendarId: gcalCalendar.googleCalendarId,
      writable: gcalCalendar.isWritable,
      icalUid: gcalEvent.icalUid,
      instanceStart: gcalEvent.instanceStart,
      lastUpdatedRemote: gcalEvent.lastUpdatedRemote,
      isRecurring: gcalEvent.isRecurring,
      isAllDay: gcalEvent.isAllDay,
    })
    .from(gcalEvent)
    .innerJoin(gcalCalendar, eq(gcalCalendar.id, gcalEvent.calendarId))
    .where(and(eq(gcalCalendar.userId, userId), eq(gcalEvent.id, eventId)));
  return row ?? null;
}

export async function lastCalendarSync(userId: string) {
  const [row] = await getDb()
    .select({ lastSuccessAt: syncState.lastSuccessAt, failures: syncState.consecutiveFailures })
    .from(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.source, "calendar")));
  return row ?? null;
}
