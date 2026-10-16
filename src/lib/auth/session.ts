import { createHmac } from "node:crypto";
import { safeEqual } from "../security/compare";

// 대시보드 로그인 세션 (D-06: GitHub 로그인 + 허용 계정 1개)
// 쿠키 값: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// 서버 DB 없이 검증할 수 있어 proxy에서 바로 확인한다.

export const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000;
/** 마지막 활동 시각을 이 간격마다 갱신한다 */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export type Session = {
  /** GitHub 숫자 사용자 ID */
  uid: number;
  login: string;
  /** 발급 시각(ms) */
  iat: number;
  /** 마지막 활동 시각(ms) */
  seen: number;
};

export function sessionCookieName(production: boolean): string {
  // __Host- 접두사: Secure + Path=/ + Domain 없음을 브라우저가 강제한다
  return production ? "__Host-pd_session" : "pd_session";
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function encodeSession(session: Session, secret: string): string {
  const data = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function decodeSession(token: string | undefined, secret: string, now: number): Session | null {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(data, secret))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSession(parsed)) return null;
  if (now - parsed.iat > ABSOLUTE_TTL_MS) return null;
  if (now - parsed.seen > IDLE_TTL_MS) return null;
  if (parsed.iat > now + 60_000) return null;
  return parsed;
}

export function needsRefresh(session: Session, now: number): boolean {
  return now - session.seen > REFRESH_INTERVAL_MS;
}

/** 쿠키 수명은 절대 만료까지 남은 시간 */
export function cookieMaxAgeSeconds(session: Session, now: number): number {
  return Math.max(0, Math.floor((session.iat + ABSOLUTE_TTL_MS - now) / 1000));
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uid === "number" &&
    Number.isInteger(v.uid) &&
    typeof v.login === "string" &&
    typeof v.iat === "number" &&
    typeof v.seen === "number"
  );
}
