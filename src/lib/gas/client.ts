import { createHmac, randomBytes } from "node:crypto";
import { limiters } from "../http/limiter";
import { backoffDelayMs, fetchWithRetry } from "../http/retry";

// Apps Script 캘린더 브리지 클라이언트 (D-11). 서명 규칙은 apps-script/Code.gs와 같아야 한다.

export type BridgeAction = "ping" | "listCalendars" | "listEvents" | "createEvent" | "updateEvent" | "deleteEvent";

export type SignedBridgeRequest = {
  action: BridgeAction;
  /** JSON 문자열 그대로 서명하므로 객체가 아니라 문자열로 보낸다 */
  params: string;
  ts: number;
  nonce: string;
  sig: string;
};

export type BridgeEvent = {
  icalUid: string;
  title: string;
  allDay: boolean;
  start: string | null;
  end: string | null;
  startDate: string | null;
  endDate: string | null;
  instanceStart: string;
  location: string;
  description: string;
  recurring: boolean;
  lastUpdated: string;
};

export type BridgeCalendar = { id: string; name: string; color: string; writable: boolean };

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export function canonicalString(req: Pick<SignedBridgeRequest, "action" | "ts" | "nonce" | "params">): string {
  return [req.action, String(req.ts), req.nonce, req.params].join("\n");
}

export function signBridgeRequest(
  action: BridgeAction,
  params: object,
  secret: string,
  now: number = Date.now(),
  nonce: string = randomBytes(18).toString("base64url"),
): SignedBridgeRequest {
  const unsigned = { action, params: JSON.stringify(params), ts: Math.floor(now / 1000), nonce };
  const sig = createHmac("sha256", secret).update(canonicalString(unsigned), "utf8").digest("base64");
  return { ...unsigned, sig };
}

const READ_ACTIONS = new Set<BridgeAction>(["ping", "listCalendars", "listEvents"]);

export async function callCalendarBridge<T>(
  action: BridgeAction,
  params: object = {},
  options: { deadline?: number } = {},
): Promise<T> {
  const url = process.env.GAS_CALENDAR_WEBAPP_URL;
  const secret = process.env.GAS_CALENDAR_SHARED_SECRET;
  if (!url || !secret) throw new BridgeError("not_configured", "캘린더 브리지 환경 변수가 설정되지 않았습니다.");

  // 같은 nonce는 브리지가 거부하므로 재시도할 때마다 새로 서명한다.
  // 쓰기 요청은 이미 처리됐을 수 있어(중복 생성 위험) 재시도하지 않는다.
  const maxAttempts = READ_ACTIONS.has(action) ? 3 : 1;
  let response: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body = JSON.stringify(signBridgeRequest(action, params, secret));
    try {
      response = await limiters.gasCalendar.run(() =>
        fetchWithRetry(
          url,
          {
            method: "POST",
            // Apps Script 웹 앱은 응답을 다른 주소로 리다이렉트할 수 있다
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body,
          },
          { idempotent: false, maxAttempts: 1, deadline: options.deadline },
        ),
      );
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      continue;
    }
    if (response.status < 500 || attempt >= maxAttempts) break;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt, 1000, 4000, Math.random)));
  }
  if (!response) throw new BridgeError("unreachable", "캘린더 브리지에 연결하지 못했습니다.");

  const text = await response.text();
  let parsed: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BridgeError("bad_response", `브리지 응답을 해석하지 못했습니다 (HTTP ${response.status}).`);
  }
  if (!parsed.ok) {
    throw new BridgeError(parsed.error?.code ?? "unknown", parsed.error?.message ?? "브리지 오류");
  }
  return parsed.data as T;
}
