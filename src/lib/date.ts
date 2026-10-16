// 날짜 표기는 YYYYMMDD, 기준 시간대는 Asia/Seoul(UTC+9, 서머타임 없음)이다.

export const APP_TIME_ZONE = "Asia/Seoul";
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export type WeekdayKo = (typeof WEEKDAYS_KO)[number];

export type Ymd = string;

export function parseYmd(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (month < 1 || month > 12 || day < 1) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function isValidYmd(value: string): boolean {
  return parseYmd(value) !== null;
}

/** 주어진 시각을 서울 기준 YYYYMMDD로 바꾼다. */
export function toYmd(date: Date): Ymd {
  const seoul = new Date(date.getTime() + SEOUL_OFFSET_MS);
  const y = seoul.getUTCFullYear().toString().padStart(4, "0");
  const m = (seoul.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = seoul.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

export function todayYmd(now: Date = new Date()): Ymd {
  return toYmd(now);
}

function requireYmd(value: string) {
  const parsed = parseYmd(value);
  if (!parsed) throw new Error(`잘못된 날짜 형식: ${value}`);
  return parsed;
}

/** 서울 기준 그날 00:00 ~ 다음날 00:00 구간(UTC 시각). */
export function seoulDayRange(ymd: Ymd): { start: Date; end: Date } {
  const { year, month, day } = requireYmd(ymd);
  const start = new Date(Date.UTC(year, month - 1, day) - SEOUL_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function addDays(ymd: Ymd, days: number): Ymd {
  return toYmd(new Date(seoulDayRange(ymd).start.getTime() + days * DAY_MS));
}

export function weekdayKo(ymd: Ymd): WeekdayKo {
  const { year, month, day } = requireYmd(ymd);
  return WEEKDAYS_KO[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 화면 표시용: "20261016 (금)" */
export function formatYmdWithWeekday(ymd: Ymd): string {
  return `${ymd} (${weekdayKo(ymd)})`;
}

/** 서울 기준 "HH:MM" */
export function formatTimeKo(date: Date): string {
  const seoul = new Date(date.getTime() + SEOUL_OFFSET_MS);
  const h = seoul.getUTCHours().toString().padStart(2, "0");
  const m = seoul.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export type MeetingTitle = {
  /** 제목에서 읽은 날짜. 읽지 못하면 null */
  date: Ymd | null;
  /** 날짜 뒤 주제(예: "사업계획"). 요일 한 글자만 있으면 null */
  suffix: string | null;
  /** 제목에 적힌 요일 한 글자 */
  weekdayInTitle: WeekdayKo | null;
  /** 제목의 요일이 실제 요일과 다르면 true */
  weekdayMismatch: boolean;
};

const TITLE_PATTERN = /^\s*(\d{8})(?:\s+(.+?))?\s*$/;

/** Notion 회의록 제목 해석. 예: "20260709 목", "20260906 사업계획" */
export function parseMeetingTitle(title: string): MeetingTitle {
  const match = TITLE_PATTERN.exec(title);
  if (!match || !isValidYmd(match[1])) {
    return { date: null, suffix: null, weekdayInTitle: null, weekdayMismatch: false };
  }
  const date = match[1];
  const rest = match[2]?.trim() ?? "";
  if (rest === "") {
    return { date, suffix: null, weekdayInTitle: null, weekdayMismatch: false };
  }
  if ((WEEKDAYS_KO as readonly string[]).includes(rest)) {
    const weekdayInTitle = rest as WeekdayKo;
    return {
      date,
      suffix: null,
      weekdayInTitle,
      weekdayMismatch: weekdayInTitle !== weekdayKo(date),
    };
  }
  return { date, suffix: rest, weekdayInTitle: null, weekdayMismatch: false };
}
