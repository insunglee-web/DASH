import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gcalCalendar, gcalEvent } from "@/db/schema";
import { audit } from "../db/audit";
import { BridgeError, callCalendarBridge, type BridgeEvent } from "../gas/client";
import { toEventRow, type EventInput } from "./mapping";
import { eventForWrite } from "./queries";
import { bridgeErrorMessage } from "./sync";

// 일정 쓰기 (F3-2): 브리지로 Google Calendar를 바꾼 뒤 DB 캐시를 맞춘다. 결과는 감사 로그에 남긴다.

export type WriteResult = { ok: true; id?: string } | { ok: false; error: string; status: number };

function fail(error: unknown): WriteResult {
  if (error instanceof BridgeError) {
    const status = error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : 400;
    return { ok: false, error: bridgeErrorMessage(error), status };
  }
  return { ok: false, error: "일정을 저장하지 못했습니다.", status: 500 };
}

async function writableCalendarRow(userId: string, googleCalendarId: string) {
  const [row] = await getDb()
    .select({ id: gcalCalendar.id })
    .from(gcalCalendar)
    .where(
      and(
        eq(gcalCalendar.userId, userId),
        eq(gcalCalendar.googleCalendarId, googleCalendarId),
        eq(gcalCalendar.isWritable, true),
      ),
    );
  return row ?? null;
}

async function upsertFromBridge(calendarRowId: string, event: BridgeEvent): Promise<string> {
  const row = toEventRow(event);
  const [saved] = await getDb()
    .insert(gcalEvent)
    .values({ calendarId: calendarRowId, ...row })
    .onConflictDoUpdate({ target: [gcalEvent.calendarId, gcalEvent.icalUid, gcalEvent.instanceStart], set: row })
    .returning({ id: gcalEvent.id });
  return saved.id;
}

export async function createEvent(userId: string, input: EventInput): Promise<WriteResult> {
  const calendar = await writableCalendarRow(userId, input.calendarId);
  if (!calendar) return { ok: false, error: "쓰기가 허용된 캘린더가 아닙니다.", status: 403 };
  try {
    const event = await callCalendarBridge<BridgeEvent>("createEvent", input);
    const id = await upsertFromBridge(calendar.id, event);
    await audit(userId, "calendar.event.create", id, "success");
    return { ok: true, id };
  } catch (error) {
    await audit(userId, "calendar.event.create", null, "failure", { code: (error as BridgeError).code });
    return fail(error);
  }
}

export type EventPatch = {
  title?: string;
  location?: string;
  description?: string;
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
};

async function target(userId: string, eventId: string) {
  const row = await eventForWrite(userId, eventId);
  if (!row) return { error: { ok: false, error: "일정을 찾을 수 없습니다.", status: 404 } as WriteResult };
  if (!row.writable) return { error: { ok: false, error: "쓰기가 허용되지 않은 캘린더입니다.", status: 403 } as WriteResult };
  if (row.isRecurring) return { error: { ok: false, error: "반복 일정은 Google Calendar에서 수정해 주세요.", status: 400 } as WriteResult };
  if (!row.lastUpdatedRemote) return { error: { ok: false, error: "일정 정보를 다시 동기화해 주세요.", status: 409 } as WriteResult };
  return { row };
}

export async function updateEvent(userId: string, eventId: string, patch: EventPatch): Promise<WriteResult> {
  const found = await target(userId, eventId);
  if ("error" in found) return found.error!;
  const { row } = found;
  try {
    const event = await callCalendarBridge<BridgeEvent>("updateEvent", {
      calendarId: row.googleCalendarId,
      icalUid: row.icalUid,
      instanceStart: row.instanceStart.toISOString(),
      expectedLastUpdated: row.lastUpdatedRemote!.toISOString(),
      patch,
    });
    // 시작 시각이 바뀌면 회차 키가 바뀌므로 기존 행을 지우고 새로 저장한다
    await getDb().delete(gcalEvent).where(eq(gcalEvent.id, row.id));
    const id = await upsertFromBridge(row.calendarRowId, event);
    await audit(userId, "calendar.event.update", id, "success");
    return { ok: true, id };
  } catch (error) {
    await audit(userId, "calendar.event.update", eventId, "failure", { code: (error as BridgeError).code });
    return fail(error);
  }
}

export async function deleteEvent(userId: string, eventId: string): Promise<WriteResult> {
  const found = await target(userId, eventId);
  if ("error" in found) return found.error!;
  const { row } = found;
  try {
    await callCalendarBridge("deleteEvent", {
      calendarId: row.googleCalendarId,
      icalUid: row.icalUid,
      instanceStart: row.instanceStart.toISOString(),
      expectedLastUpdated: row.lastUpdatedRemote!.toISOString(),
    });
    await getDb().delete(gcalEvent).where(eq(gcalEvent.id, row.id));
    await audit(userId, "calendar.event.delete", eventId, "success");
    return { ok: true };
  } catch (error) {
    await audit(userId, "calendar.event.delete", eventId, "failure", { code: (error as BridgeError).code });
    return fail(error);
  }
}
