import "server-only";
import { cookies } from "next/headers";
import { isProduction } from "../env";
import { decodeSession, sessionCookieName, type Session } from "./session";

/** 서버 컴포넌트에서 현재 로그인 세션을 읽는다. proxy가 이미 검증했지만 한 번 더 확인한다. */
export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName(isProduction()))?.value;
  return decodeSession(token, process.env.SESSION_SECRET ?? "", Date.now());
}
