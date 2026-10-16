import { describe, expect, it } from "vitest";
import { seoulDateTime } from "../date";
import { allDayCovers, allDayLastDate, timedOverlaps, toEventRow, validateEventInput } from "./mapping";

describe("toEventRow", () => {
  it("시간 지정 일정과 종일 일정을 변환한다", () => {
    const timed = toEventRow({
      icalUid: "a@google.com",
      title: "[테스트] 회의",
      allDay: false,
      start: "2026-10-20T01:00:00.000Z",
      end: "2026-10-20T02:00:00.000Z",
      startDate: null,
      endDate: null,
      instanceStart: "2026-10-20T01:00:00.000Z",
      location: "",
      description: "",
      recurring: false,
      lastUpdated: "2026-10-16T00:00:00.000Z",
    });
    expect(timed.startAt?.toISOString()).toBe("2026-10-20T01:00:00.000Z");
    expect(timed.location).toBeNull();
    expect(timed.isAllDay).toBe(false);

    const allDay = toEventRow({
      icalUid: "b@google.com",
      title: "휴무",
      allDay: true,
      start: null,
      end: null,
      startDate: "20261020",
      endDate: "20261022",
      instanceStart: "2026-10-19T15:00:00.000Z",
      location: "",
      description: "",
      recurring: true,
      lastUpdated: "2026-10-16T00:00:00.000Z",
    });
    expect(allDay.startAt).toBeNull();
    expect(allDay.startDate).toBe("20261020");
    expect(allDay.isRecurring).toBe(true);
  });
});

describe("종일 일정 날짜", () => {
  it("종료일은 배타적으로 본다", () => {
    expect(allDayCovers("20261020", "20261022", "20261020")).toBe(true);
    expect(allDayCovers("20261020", "20261022", "20261021")).toBe(true);
    expect(allDayCovers("20261020", "20261022", "20261022")).toBe(false);
    expect(allDayCovers("20261020", "20261022", "20261019")).toBe(false);
    expect(allDayLastDate("20261020", "20261022")).toBe("20261021");
  });

  it("종료일이 없거나 같으면 하루짜리", () => {
    expect(allDayCovers("20261020", null, "20261020")).toBe(true);
    expect(allDayCovers("20261020", "20261020", "20261021")).toBe(false);
    expect(allDayLastDate("20261020", "20261020")).toBe("20261020");
  });
});

describe("timedOverlaps", () => {
  it("서울 날짜 경계로 판단한다", () => {
    // 서울 20261020 23:30 ~ 20261021 00:30
    const start = seoulDateTime("20261020", "23:30")!;
    const end = seoulDateTime("20261021", "00:30")!;
    expect(timedOverlaps(start, end, "20261020")).toBe(true);
    expect(timedOverlaps(start, end, "20261021")).toBe(true);
    expect(timedOverlaps(start, end, "20261022")).toBe(false);
    expect(start.toISOString()).toBe("2026-10-20T14:30:00.000Z");
  });
});

describe("validateEventInput", () => {
  it("시간 지정 일정", () => {
    const r = validateEventInput({
      calendarId: "cal",
      title: " [테스트] 확인 ",
      allDay: false,
      start: "2026-10-20T10:00:00+09:00",
      end: "2026-10-20T11:00:00+09:00",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        calendarId: "cal",
        title: "[테스트] 확인",
        allDay: false,
        start: "2026-10-20T01:00:00.000Z",
        end: "2026-10-20T02:00:00.000Z",
        location: undefined,
        description: undefined,
      },
    });
  });

  it("종일 일정의 마지막 날을 배타적 종료일로 바꾼다", () => {
    const r = validateEventInput({ calendarId: "cal", title: "[테스트] 휴가", allDay: true, startDate: "20261020", lastDate: "20261021" });
    expect(r.ok && r.value.allDay && r.value.endDate).toBe("20261022");
    const single = validateEventInput({ calendarId: "cal", title: "[테스트] 하루", allDay: true, startDate: "20261020", lastDate: "20261020" });
    expect(single.ok && single.value.allDay && single.value.endDate).toBeUndefined();
  });

  it("잘못된 입력을 거부한다", () => {
    expect(validateEventInput({ calendarId: "cal", title: "", allDay: false }).ok).toBe(false);
    expect(validateEventInput({ calendarId: "cal", title: "x", allDay: true, startDate: "20261032" }).ok).toBe(false);
    expect(
      validateEventInput({ calendarId: "cal", title: "x", allDay: false, start: "2026-10-20T11:00:00Z", end: "2026-10-20T10:00:00Z" }).ok,
    ).toBe(false);
    expect(validateEventInput({ title: "x", allDay: true, startDate: "20261020" }).ok).toBe(false);
  });
});
