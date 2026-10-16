import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { validateEventInput } from "@/lib/calendar/mapping";
import { createEvent } from "@/lib/calendar/write";

// 일정 생성 (로그인 세션 + 같은 출처 POST만, proxy에서 검사)
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = validateEventInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await createEvent(user.userId, parsed.value);
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status });
}
