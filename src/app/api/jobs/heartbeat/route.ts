import { NextResponse, type NextRequest } from "next/server";
import { checkBearer } from "@/lib/security/compare";

// Vercel Cron(하루 1회)이 호출한다. Vercel은 CRON_SECRET 환경 변수가 있으면
// Authorization: Bearer <CRON_SECRET> 헤더를 붙여 GET으로 호출한다.
// 마지막 tick 시각 점검은 6단계에서 구현한다.
export async function GET(request: NextRequest) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
