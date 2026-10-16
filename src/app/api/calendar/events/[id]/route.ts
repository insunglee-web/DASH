import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { isValidYmd } from "@/lib/date";
import { deleteEvent, updateEvent, type EventPatch } from "@/lib/calendar/write";

function parsePatch(body: unknown): EventPatch | string {
  if (typeof body !== "object" || body === null) return "입력값이 올바르지 않습니다.";
  const v = body as Record<string, unknown>;
  const patch: EventPatch = {};
  if (typeof v.title === "string") {
    const title = v.title.trim();
    if (!title || title.length > 200) return "제목은 1~200자로 입력해 주세요.";
    patch.title = title;
  }
  if (typeof v.location === "string") patch.location = v.location.slice(0, 500);
  if (typeof v.description === "string") patch.description = v.description.slice(0, 2000);
  if (typeof v.start === "string" || typeof v.end === "string") {
    const start = Date.parse(String(v.start));
    const end = Date.parse(String(v.end));
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "시작·종료 시각이 올바르지 않습니다.";
    patch.start = new Date(start).toISOString();
    patch.end = new Date(end).toISOString();
  }
  if (typeof v.startDate === "string") {
    if (!isValidYmd(v.startDate)) return "날짜는 YYYYMMDD 형식으로 입력해 주세요.";
    patch.startDate = v.startDate;
    if (typeof v.endDate === "string" && v.endDate) {
      if (!isValidYmd(v.endDate) || v.endDate <= v.startDate) return "종료일이 올바르지 않습니다.";
      patch.endDate = v.endDate;
    }
  }
  return patch;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/calendar/events/[id]">) {
  const user = await currentUser();
  if (!user.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  const patch = parsePatch(await request.json().catch(() => null));
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  const result = await updateEvent(user.userId, id, patch);
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/calendar/events/[id]">) {
  const user = await currentUser();
  if (!user.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  const result = await deleteEvent(user.userId, id);
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status });
}
