import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/current";
import { ensureAppUser } from "@/lib/db/user";
import { syncNotion } from "@/lib/notion/sync";
import { describeError } from "@/lib/security/mask";

// 설정 화면의 "지금 동기화" 버튼 (로그인 세션 + 같은 출처 POST만, proxy에서 검사)
export const maxDuration = 300;

export async function POST() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const userId = await ensureAppUser(session);
    const result = await syncNotion(userId, { budgetMs: 240_000 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sync] Notion 수동 동기화 실패", describeError(error));
    return NextResponse.json({ status: "failed", message: "DB에 연결하지 못했습니다." }, { status: 500 });
  }
}
