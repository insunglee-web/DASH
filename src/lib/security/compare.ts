import { createHash, timingSafeEqual } from "node:crypto";

/** 길이 차이로 정보가 새지 않도록 해시를 비교하는 상수 시간 문자열 비교 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Authorization: Bearer <secret> 헤더 검증 */
export function checkBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match !== null && safeEqual(match[1], secret);
}
