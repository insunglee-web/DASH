import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { signBridgeRequest, type BridgeAction } from "../src/lib/gas/client";
import { toYmd } from "../src/lib/date";

// apps-script/Code.gs를 Google 서비스 모의 객체 위에서 실제로 실행해
// 서버 서명과 브리지 검증, 허용 목록, 테스트 모드 보호가 맞물리는지 확인한다.

const SECRET = "s".repeat(40);
const BLUE = "bluecanyon@group.calendar.google.com";
const PRIMARY = "me@gmail.com";
const code = readFileSync(fileURLToPath(new URL("../apps-script/Code.gs", import.meta.url)), "utf8");

class FakeEvent {
  deleted = false;
  constructor(
    public id: string,
    public title: string,
    public start: Date,
    public end: Date,
    public allDay = false,
    public recurring = false,
    public lastUpdated = new Date("2026-10-01T00:00:00Z"),
    public location = "",
    public description = "",
  ) {}
  touch() {
    this.lastUpdated = new Date(this.lastUpdated.getTime() + 1000);
  }
  getId() { return this.id; }
  getTitle() { return this.title; }
  getStartTime() { return this.start; }
  getEndTime() { return this.end; }
  getAllDayStartDate() { return this.start; }
  getAllDayEndDate() { return this.end; }
  isAllDayEvent() { return this.allDay; }
  isRecurringEvent() { return this.recurring; }
  getLastUpdated() { return this.lastUpdated; }
  getLocation() { return this.location; }
  getDescription() { return this.description; }
  setTitle(v: string) { this.title = v; this.touch(); return this; }
  setLocation(v: string) { this.location = v; this.touch(); return this; }
  setDescription(v: string) { this.description = v; this.touch(); return this; }
  setTime(s: Date, e: Date) { this.start = s; this.end = e; this.touch(); return this; }
  setAllDayDate(d: Date) { this.start = d; this.end = new Date(d.getTime() + 86400000); this.touch(); return this; }
  setAllDayDates(s: Date, e: Date) { this.start = s; this.end = e; this.touch(); return this; }
  deleteEvent() { this.deleted = true; }
}

class FakeCalendar {
  events: FakeEvent[] = [];
  private seq = 0;
  constructor(public id: string, public name: string) {}
  getId() { return this.id; }
  getName() { return this.name; }
  getColor() { return "#1e88e5"; }
  getEvents(from: Date, to: Date) {
    return this.events.filter((e) => !e.deleted && e.start < to && e.end > from);
  }
  createEvent(title: string, start: Date, end: Date, options: { location?: string; description?: string; guests?: string }) {
    if (options && "guests" in options) throw new Error("guests must not be passed");
    const event = new FakeEvent(`new-${++this.seq}@google.com`, title, start, end, false, false, new Date("2026-10-16T00:00:00Z"), options?.location ?? "", options?.description ?? "");
    this.events.push(event);
    return event;
  }
  createAllDayEvent(title: string, start: Date, endOrOptions?: Date | object) {
    const end = endOrOptions instanceof Date ? endOrOptions : new Date(start.getTime() + 86400000);
    const event = new FakeEvent(`allday-${++this.seq}@google.com`, title, start, end, true);
    this.events.push(event);
    return event;
  }
}

let props: Record<string, string>;
let cache: Map<string, string>;
let calendars: Record<string, FakeCalendar>;
let doPost: (e: unknown) => { content: string };

function loadBridge() {
  const context = vm.createContext({
    console: { log: () => undefined, error: () => undefined },
    Date,
    JSON,
    Math,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
      }),
    },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      // 실제 Apps Script처럼 부호 있는 바이트 배열을 돌려준다
      computeHmacSha256Signature: (value: string, key: string) =>
        Array.from(createHmac("sha256", key).update(value, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes: number[]) => Buffer.from(bytes.map((b) => b & 0xff)).toString("base64"),
      // 브리지는 Asia/Seoul, yyyyMMdd 형식으로만 호출한다
      formatDate: (date: Date) => toYmd(date),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content: string) => ({ content, setMimeType() { return this; } }),
    },
    CalendarApp: {
      getCalendarById: (id: string) => calendars[id] ?? null,
      getAllOwnedCalendars: () => Object.values(calendars),
    },
  });
  vm.runInContext(code, context);
  doPost = context.doPost as typeof doPost;
}

function call(action: BridgeAction, params: object, opts: { secret?: string; now?: number; nonce?: string } = {}) {
  const signed = signBridgeRequest(action, params, opts.secret ?? SECRET, opts.now, opts.nonce);
  return callRaw(JSON.stringify(signed));
}

function callRaw(body: string) {
  const out = doPost({ postData: { contents: body } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action마다 응답 형태가 달라 테스트에서는 느슨하게 읽는다
  return JSON.parse(out.content) as { ok: boolean; data?: any; error?: { code: string } };
}

beforeEach(() => {
  props = { SHARED_SECRET: SECRET, READ_CALENDAR_IDS: PRIMARY, WRITE_CALENDAR_IDS: BLUE };
  cache = new Map();
  calendars = {
    [PRIMARY]: new FakeCalendar(PRIMARY, "개인"),
    [BLUE]: new FakeCalendar(BLUE, "블루캐니언워터파크"),
    "other@group.calendar.google.com": new FakeCalendar("other@group.calendar.google.com", "기타"),
  };
  loadBridge();
});

describe("요청 검증", () => {
  it("서버가 서명한 요청을 통과시킨다", () => {
    const res = call("ping", {});
    expect(res.ok).toBe(true);
    expect(res.data.testMode).toBe(true);
  });

  it("다른 비밀값, 변조, 시간 초과, 재사용을 거부한다", () => {
    expect(call("ping", {}, { secret: "x".repeat(40) }).error?.code).toBe("unauthorized");

    const signed = signBridgeRequest("listCalendars", {}, SECRET);
    expect(callRaw(JSON.stringify({ ...signed, params: '{"a":1}' })).error?.code).toBe("unauthorized");

    expect(call("ping", {}, { now: Date.now() - 10 * 60 * 1000 }).error?.code).toBe("expired");

    const once = JSON.stringify(signBridgeRequest("ping", {}, SECRET));
    expect(callRaw(once).ok).toBe(true);
    expect(callRaw(once).error?.code).toBe("replay");
  });

  it("비밀값이 설정되지 않으면 동작하지 않는다", () => {
    props.SHARED_SECRET = "short";
    expect(call("ping", {}).error?.code).toBe("not_configured");
  });

  it("형식이 틀린 본문을 거부한다", () => {
    expect(callRaw("not json").error?.code).toBe("bad_request");
    expect(callRaw("{}").error?.code).toBe("bad_request");
  });
});

describe("허용 목록", () => {
  it("읽기 목록에는 쓰기 허용 캘린더도 포함된다", () => {
    const res = call("listCalendars", {});
    expect(res.data).toEqual([
      { id: PRIMARY, name: "개인", color: "#1e88e5", writable: false },
      { id: BLUE, name: "블루캐니언워터파크", color: "#1e88e5", writable: true },
    ]);
  });

  it("허용되지 않은 캘린더는 읽기·쓰기를 거부한다", () => {
    const window = { from: "2026-10-01T00:00:00Z", to: "2026-10-31T00:00:00Z" };
    expect(call("listEvents", { calendarId: "other@group.calendar.google.com", ...window }).error?.code).toBe("forbidden");
    expect(
      call("createEvent", {
        calendarId: PRIMARY,
        title: "[테스트] 개인 캘린더",
        start: "2026-10-20T01:00:00Z",
        end: "2026-10-20T02:00:00Z",
      }).error?.code,
    ).toBe("forbidden");
  });

  it("조회 기간은 120일을 넘을 수 없다", () => {
    expect(
      call("listEvents", { calendarId: PRIMARY, from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" }).error?.code,
    ).toBe("bad_request");
  });
});

describe("일정 생성·수정·삭제 (테스트 모드)", () => {
  const base = { calendarId: BLUE };

  it("[테스트] 일정만 만들고, 게스트는 넘기지 않는다", () => {
    expect(
      call("createEvent", { ...base, title: "실제 일정", start: "2026-10-20T01:00:00Z", end: "2026-10-20T02:00:00Z" }).error?.code,
    ).toBe("test_mode");

    const created = call("createEvent", {
      ...base,
      title: "[테스트] 브리지 확인",
      start: "2026-10-20T01:00:00Z",
      end: "2026-10-20T02:00:00Z",
      location: "본사",
      guests: "someone@example.com",
    });
    expect(created.ok).toBe(true);
    expect(created.data.title).toBe("[테스트] 브리지 확인");
    expect(created.data.location).toBe("본사");
  });

  it("수정 시각이 다르면 충돌로 거부하고, 같으면 수정한다", () => {
    const created = call("createEvent", {
      ...base,
      title: "[테스트] 수정",
      start: "2026-10-20T01:00:00Z",
      end: "2026-10-20T02:00:00Z",
    }).data;
    const ref = { ...base, icalUid: created.icalUid, instanceStart: created.instanceStart };

    expect(
      call("updateEvent", { ...ref, expectedLastUpdated: "2020-01-01T00:00:00Z", patch: { title: "[테스트] 바꿈" } }).error?.code,
    ).toBe("conflict");

    const updated = call("updateEvent", {
      ...ref,
      expectedLastUpdated: created.lastUpdated,
      patch: { title: "[테스트] 바꿈", end: "2026-10-20T03:00:00Z" },
    });
    expect(updated.ok).toBe(true);
    expect(updated.data.title).toBe("[테스트] 바꿈");
    expect(updated.data.end).toBe("2026-10-20T03:00:00.000Z");

    // 테스트 모드에서는 제목에서 접두사를 뗄 수 없다
    expect(
      call("updateEvent", { ...ref, expectedLastUpdated: updated.data.lastUpdated, patch: { title: "접두사 제거" } }).error?.code,
    ).toBe("test_mode");
  });

  it("기존 실제 일정과 반복 일정은 수정·삭제하지 않는다", () => {
    const real = new FakeEvent("real@google.com", "블루캐니언 영업 회의", new Date("2026-10-21T01:00:00Z"), new Date("2026-10-21T02:00:00Z"));
    const recurring = new FakeEvent("rec@google.com", "[테스트] 반복", new Date("2026-10-22T01:00:00Z"), new Date("2026-10-22T02:00:00Z"), false, true);
    calendars[BLUE].events.push(real, recurring);

    const refOf = (e: FakeEvent) => ({
      ...base,
      icalUid: e.id,
      instanceStart: e.start.toISOString(),
      expectedLastUpdated: e.lastUpdated.toISOString(),
    });
    expect(call("deleteEvent", refOf(real)).error?.code).toBe("test_mode");
    expect(call("deleteEvent", refOf(recurring)).error?.code).toBe("recurring_readonly");
    expect(real.deleted).toBe(false);
  });

  it("[테스트] 일정을 삭제한다", () => {
    const created = call("createEvent", {
      ...base,
      title: "[테스트] 삭제",
      start: "2026-10-20T01:00:00Z",
      end: "2026-10-20T02:00:00Z",
    }).data;
    const res = call("deleteEvent", {
      ...base,
      icalUid: created.icalUid,
      instanceStart: created.instanceStart,
      expectedLastUpdated: created.lastUpdated,
    });
    expect(res.data).toEqual({ deleted: true });
    expect(call("listEvents", { ...base, from: "2026-10-19T00:00:00Z", to: "2026-10-21T00:00:00Z" }).data.events).toEqual([]);
  });

  it("종일 일정은 YYYYMMDD로 만든다", () => {
    const res = call("createEvent", { ...base, title: "[테스트] 종일", allDay: true, startDate: "20261020" });
    expect(res.ok).toBe(true);
    expect(res.data.allDay).toBe(true);
    expect(res.data.startDate).toBe("20261020");
    expect(call("createEvent", { ...base, title: "[테스트] 종일", allDay: true, startDate: "20261032" }).error?.code).toBe(
      "bad_request",
    );
  });

  it("TEST_MODE=false면 일반 제목도 허용한다", () => {
    props.TEST_MODE = "false";
    const res = call("createEvent", { ...base, title: "실제 일정", start: "2026-10-20T01:00:00Z", end: "2026-10-20T02:00:00Z" });
    expect(res.ok).toBe(true);
  });
});
