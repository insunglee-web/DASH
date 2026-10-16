import "server-only";
import { getDb } from "@/db/client";
import { auditLog } from "@/db/schema";
import { describeError } from "../security/mask";

/** 쓰기 작업 감사 로그. 일정 제목·설명 같은 내용은 남기지 않는다(security.md 4장). */
export async function audit(
  userId: string,
  action: string,
  target: string | null,
  result: "success" | "failure",
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb().insert(auditLog).values({ userId, action, target, result, detail: detail ?? null });
  } catch (error) {
    console.error("[audit] 기록 실패", describeError(error));
  }
}
