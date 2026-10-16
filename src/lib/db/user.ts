import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appUser } from "@/db/schema";
import { describeError } from "../security/mask";
import type { Session } from "../auth/session";

/** 로그인한 GitHub 계정의 app_user 행을 만들거나 갱신하고 id를 돌려준다. */
export async function ensureAppUser(session: Pick<Session, "uid" | "login">): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(appUser)
    .values({ githubUserId: session.uid, githubLogin: session.login })
    .onConflictDoUpdate({ target: appUser.githubUserId, set: { githubLogin: session.login } })
    .returning({ id: appUser.id });
  return row.id;
}

export async function findAppUserId(githubUserId: number): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.githubUserId, githubUserId));
  return row?.id ?? null;
}

export type DbStatus = { ok: true; latencyMs: number } | { ok: false; error: string };

/** 설정 화면용 DB 연결 확인 */
export async function checkDb(): Promise<DbStatus> {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
