import { NextResponse, type NextRequest } from "next/server";
import { checkBearer } from "@/lib/security/compare";

// Supabase Cron이 5분마다 호출한다 (docs/architecture.md 7장).
// 실제 동기화는 6단계에서 구현한다. 지금은 인증과 응답 형식만 갖춘다.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ran: [], note: "동기화 작업은 아직 구현되지 않았습니다." });
}
