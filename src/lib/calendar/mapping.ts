import { addDays, isValidYmd, seoulDayRange, type Ymd } from "../date";
import type { BridgeEvent } from "../gas/client";

// Apps Script 브리지 응답 ↔ DB 행 변환. DB 의존성이 없어 단위 테스트로 검증한다.

export type EventRow = {
  icalUid: string;
  instanceStart: Date;
  lastUpdatedRemote: Date | null;
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

export function toEventRow(event: BridgeEvent): EventRow {
  return {
    icalUid: event.icalUid,
    instanceStart: new Date(event.instanceStart),
    lastUpdatedRemote: event.lastUpdated ? new Date(event.lastUpdated) : null,
    summary: event.title ?? "",
    location: event.location || null,
    description: event.description || null,
    startAt: event.allDay || !event.start ? null : new Date(event.start),
    endAt: event.allDay || !event.end ? null : new Date(event.end),
    startDate: event.allDay ? event.startDate : null,
    endDate: event.allDay ? event.endDate : null,
    isAllDay: event.allDay,
    isRecurring: event.recurring,
  };
}

/**
 * 종일 일정이 그날에 걸치는지. Apps Script의 종일 종료일은 마지막 날의 다음 날(배타적)로 온다고 보고,
 * 종료일이 시작일과 같거나 없으면 하루짜리로 처리한다(실제 값은 PoC에서 확인).
 */
export function allDayCovers(startDate: string, endDate: string | null, ymd: Ymd): boolean {
  if (ymd < startDate) return false;
  if (!endDate || endDate <= startDate) return ymd === startDate;
  return ymd < endDate;
}

/** 종일 일정의 마지막 날(표시용) */
export function allDayLastDate(startDate: string, endDate: string | null): string {
  if (!endDate || endDate <= startDate) return startDate;
  return addDays(endDate, -1);
}

/** 시간 지정 일정이 서울 기준 그날에 걸치는지 */
export function timedOverlaps(startAt: Date, endAt: Date, ymd: Ymd): boolean {
  const { start, end } = seoulDayRange(ymd);
  return startAt < end && endAt > start;
}

export type EventInput =
  | { calendarId: string; title: string; allDay: true; startDate: string; endDate?: string; location?: string; description?: string }
  | { calendarId: string; title: string; allDay: false; start: string; end: string; location?: string; description?: string };

/** 화면 입력값 검사. 오류 문구를 돌려준다. */
export function validateEventInput(input: unknown): { ok: true; value: EventInput } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "입력값이 올바르지 않습니다." };
  const v = input as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (!title || title.length > 200) return { ok: false, error: "제목은 1~200자로 입력해 주세요." };
  if (typeof v.calendarId !== "string" || !v.calendarId) return { ok: false, error: "캘린더를 선택해 주세요." };
  const location = typeof v.location === "string" ? v.location.slice(0, 500) : undefined;
  const description = typeof v.description === "string" ? v.description.slice(0, 2000) : undefined;

  if (v.allDay === true) {
    if (typeof v.startDate !== "string" || !isValidYmd(v.startDate)) {
      return { ok: false, error: "날짜는 YYYYMMDD 형식으로 입력해 주세요." };
    }
    let endDate: string | undefined;
    if (typeof v.lastDate === "string" && v.lastDate) {
      if (!isValidYmd(v.lastDate) || v.lastDate < v.startDate) return { ok: false, error: "종료일이 올바르지 않습니다." };
      // 화면은 마지막 날을 받고, 브리지에는 배타적 종료일을 보낸다
      if (v.lastDate > v.startDate) endDate = addDays(v.lastDate, 1);
    }
    return { ok: true, value: { calendarId: v.calendarId, title, allDay: true, startDate: v.startDate, endDate, location, description } };
  }

  if (typeof v.start !== "string" || typeof v.end !== "string") return { ok: false, error: "시작·종료 시각을 입력해 주세요." };
  const start = Date.parse(v.start);
  const end = Date.parse(v.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: "시각 형식이 올바르지 않습니다." };
  if (end <= start) return { ok: false, error: "종료 시각은 시작 시각보다 늦어야 합니다." };
  return {
    ok: true,
    value: {
      calendarId: v.calendarId,
      title,
      allDay: false,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      location,
      description,
    },
  };
}
