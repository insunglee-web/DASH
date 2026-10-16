import { describe, expect, it } from "vitest";
import { checkBearer, safeEqual } from "../security/compare";
import {
  ABSOLUTE_TTL_MS,
  IDLE_TTL_MS,
  REFRESH_INTERVAL_MS,
  decodeSession,
  encodeSession,
  needsRefresh,
} from "./session";

const secret = "test-secret-0123456789";
const t0 = 1_760_000_000_000;
const base = { uid: 12345, login: "insunglee-web", iat: t0, seen: t0 };

describe("session", () => {
  it("서명한 세션을 그대로 읽는다", () => {
    const token = encodeSession(base, secret);
    expect(decodeSession(token, secret, t0 + 1000)).toEqual(base);
  });

  it("다른 비밀값이나 변조된 값은 거부한다", () => {
    const token = encodeSession(base, secret);
    expect(decodeSession(token, "other-secret", t0)).toBeNull();
    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, uid: 1 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`, secret, t0)).toBeNull();
    expect(decodeSession(`${data}.`, secret, t0)).toBeNull();
    expect(decodeSession("garbage", secret, t0)).toBeNull();
    expect(decodeSession(undefined, secret, t0)).toBeNull();
  });

  it("유휴 12시간, 절대 7일이 지나면 만료된다", () => {
    const token = encodeSession(base, secret);
    expect(decodeSession(token, secret, t0 + IDLE_TTL_MS + 1)).toBeNull();
    const active = encodeSession({ ...base, seen: t0 + ABSOLUTE_TTL_MS - 1000 }, secret);
    expect(decodeSession(active, secret, t0 + ABSOLUTE_TTL_MS + 1)).toBeNull();
  });

  it("한 시간마다 활동 시각을 갱신한다", () => {
    expect(needsRefresh(base, t0 + REFRESH_INTERVAL_MS - 1)).toBe(false);
    expect(needsRefresh(base, t0 + REFRESH_INTERVAL_MS + 1)).toBe(true);
  });
});

describe("compare", () => {
  it("상수 시간 비교와 Bearer 검사", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(checkBearer("Bearer s3cret", "s3cret")).toBe(true);
    expect(checkBearer("Bearer wrong", "s3cret")).toBe(false);
    expect(checkBearer("s3cret", "s3cret")).toBe(false);
    expect(checkBearer(null, "s3cret")).toBe(false);
    expect(checkBearer("Bearer ", undefined)).toBe(false);
  });
});
