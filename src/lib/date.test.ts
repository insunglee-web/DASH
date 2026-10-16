import { describe, expect, it } from "vitest";
import {
  addDays,
  formatTimeKo,
  formatYmdWithWeekday,
  isValidYmd,
  parseMeetingTitle,
  seoulDayRange,
  toYmd,
  weekdayKo,
} from "./date";

describe("toYmd", () => {
  it("서울 기준으로 날짜를 바꾼다", () => {
    // UTC 20261015 15:00 = 서울 20261016 00:00
    expect(toYmd(new Date("2026-10-15T15:00:00Z"))).toBe("20261016");
    expect(toYmd(new Date("2026-10-15T14:59:59Z"))).toBe("20261015");
  });
});

describe("isValidYmd", () => {
  it("실제 달력 날짜만 허용한다", () => {
    expect(isValidYmd("20261016")).toBe(true);
    expect(isValidYmd("20240229")).toBe(true);
    expect(isValidYmd("20260230")).toBe(false);
    expect(isValidYmd("20261301")).toBe(false);
    expect(isValidYmd("2026-10-16")).toBe(false);
  });
});

describe("seoulDayRange / addDays", () => {
  it("서울 자정 기준 구간을 돌려준다", () => {
    const { start, end } = seoulDayRange("20261016");
    expect(start.toISOString()).toBe("2026-10-15T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });

  it("월과 연도 경계를 넘는다", () => {
    expect(addDays("20261231", 1)).toBe("20270101");
    expect(addDays("20260301", -1)).toBe("20260228");
  });
});

describe("weekday", () => {
  it("요일과 표시 형식", () => {
    expect(weekdayKo("20261016")).toBe("금");
    expect(formatYmdWithWeekday("20260709")).toBe("20260709 (목)");
    expect(formatTimeKo(new Date("2026-10-16T00:30:00Z"))).toBe("09:30");
  });
});

describe("parseMeetingTitle", () => {
  it("날짜 + 요일", () => {
    expect(parseMeetingTitle("20260709 목")).toEqual({
      date: "20260709",
      suffix: null,
      weekdayInTitle: "목",
      weekdayMismatch: false,
    });
    expect(parseMeetingTitle("20260710 금").weekdayMismatch).toBe(false);
  });

  it("날짜 + 주제", () => {
    expect(parseMeetingTitle("20260906 사업계획")).toEqual({
      date: "20260906",
      suffix: "사업계획",
      weekdayInTitle: null,
      weekdayMismatch: false,
    });
  });

  it("요일이 실제와 다르면 표시만 한다", () => {
    const parsed = parseMeetingTitle("20260709 금");
    expect(parsed.date).toBe("20260709");
    expect(parsed.weekdayMismatch).toBe(true);
  });

  it("날짜만 있는 제목", () => {
    expect(parseMeetingTitle(" 20261016 ").date).toBe("20261016");
  });

  it("날짜를 읽지 못하는 제목", () => {
    expect(parseMeetingTitle("회의록 모음").date).toBeNull();
    expect(parseMeetingTitle("20260230 화").date).toBeNull();
    expect(parseMeetingTitle("2026-07-09 목").date).toBeNull();
  });
});
