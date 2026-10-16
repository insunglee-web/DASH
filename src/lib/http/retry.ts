// 외부 API 공통 재시도 로직 (docs/architecture.md 7장 재시도 정책)
// - 429, 529: Retry-After / rateLimit-reset을 따르고 요청 종류와 상관없이 재시도
// - 500/502/503/504, 네트워크 오류: 멱등 요청만 재시도
// - 그 외 응답은 그대로 돌려주고 호출한 쪽에서 해석한다(401 → 토큰 갱신 등)
// - 기다려야 할 시간이 실행 예산(deadline)을 넘으면 DeferredError로 다음 실행에 넘긴다

export class DeferredError extends Error {
  constructor(
    readonly retryAt: Date,
    readonly reason: string,
  ) {
    super(`재시도 대기 시간이 실행 예산을 넘어 ${retryAt.toISOString()} 이후로 미룹니다 (${reason})`);
    this.name = "DeferredError";
  }
}

export type RetryOptions = {
  /** GET/HEAD/DELETE 등 다시 보내도 안전한 요청인지. 기본: 메서드로 판단 */
  idempotent?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 이 시각(epoch ms)을 넘겨서 기다려야 하면 DeferredError */
  deadline?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
};

const RETRY_ALWAYS = new Set([429, 529]);
const RETRY_IF_IDEMPOTENT = new Set([500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "DELETE", "PUT"]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After(초 또는 HTTP 날짜) 또는 NAVER WORKS rateLimit-reset(초)을 밀리초로 */
export function serverRequestedDelayMs(headers: Headers, now: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const reset = headers.get("ratelimit-reset");
  if (reset) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return null;
}

export function backoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  // ±20% 지터
  return Math.round(exp * (0.8 + random() * 0.4));
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const idempotent = options.idempotent ?? IDEMPOTENT_METHODS.has(method);
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 16000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt++) {
    let response: Response | null = null;
    let networkError: unknown = null;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      networkError = error;
    }

    let retryable: boolean;
    let reason: string;
    if (response) {
      if (RETRY_ALWAYS.has(response.status)) {
        retryable = true;
      } else if (RETRY_IF_IDEMPOTENT.has(response.status)) {
        retryable = idempotent;
      } else {
        return response;
      }
      reason = `HTTP ${response.status}`;
    } else {
      retryable = idempotent;
      reason = "네트워크 오류";
    }

    if (!retryable || attempt >= maxAttempts) {
      if (response) return response;
      throw networkError;
    }

    const requested = response ? serverRequestedDelayMs(response.headers, now()) : null;
    const delay = requested ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs, random);
    if (options.deadline !== undefined && now() + delay > options.deadline) {
      throw new DeferredError(new Date(now() + delay), reason);
    }
    // 재시도 전에 본문을 비워 연결을 돌려준다
    await response?.body?.cancel().catch(() => undefined);
    await sleep(delay);
  }
}
