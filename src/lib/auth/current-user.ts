import "server-only";
import { ensureAppUser } from "../db/user";
import { describeError } from "../security/mask";
import { currentSession } from "./current";

export type CurrentUser = { ok: true; userId: string; login: string } | { ok: false; reason: "no_session" | "db_error" };

/** 화면에서 쓰는 현재 사용자. DB를 쓸 수 없으면 화면이 안내 문구를 보여주도록 실패를 돌려준다. */
export async function currentUser(): Promise<CurrentUser> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "no_session" };
  try {
    return { ok: true, userId: await ensureAppUser(session), login: session.login };
  } catch (error) {
    console.error("[db] 사용자 조회 실패", describeError(error));
    return { ok: false, reason: "db_error" };
  }
}
