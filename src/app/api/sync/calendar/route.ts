import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { syncCalendar } from "@/lib/calendar/sync";

// 설정·일정 화면의 "지금 동기화" 버튼
export const maxDuration = 300;

export async function POST() {
  const user = await currentUser();
  if (!user.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: user.reason === "db_error" ? 500 : 401 });
  const result = await syncCalendar(user.userId, { budgetMs: 240_000 });
  return NextResponse.json(result);
}
