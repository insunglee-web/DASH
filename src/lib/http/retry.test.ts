import { describe, expect, it, vi } from "vitest";
import { maskSecrets } from "../security/mask";
import { DeferredError, backoffDelayMs, fetchWithRetry, serverRequestedDelayMs } from "./retry";
import { Limiter } from "./limiter";

function fakeFetch(responses: (Response | Error)[]) {
  const calls: RequestInit[] = [];
  const impl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
    const next = responses.shift();
    if (!next) throw new Error("응답이 더 없습니다");
    if (next instanceof Error) throw next;
    return next;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const noSleep = { sleep: async () => undefined, random: () => 0.5 };

describe("fetchWithRetry", () => {
  it("성공 응답은 바로 돌려준다", async () => {
    const { impl, calls } = fakeFetch([new Response("ok")]);
    const res = await fetchWithRetry("https://x", {}, { fetchImpl: impl, ...noSleep });
    expect(await res.text()).toBe("ok");
    expect(calls).toHaveLength(1);
  });

  it("429는 POST여도 Retry-After만큼 기다렸다 재시도한다", async () => {
    const sleeps: number[] = [];
    const { impl, calls } = fakeFetch([
      new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      new Response("ok"),
    ]);
    const res = await fetchWithRetry(
      "https://x",
      { method: "POST" },
      { fetchImpl: impl, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("NAVER WORKS rateLimit-reset 헤더를 따른다", () => {
    const headers = new Headers({ "rateLimit-reset": "7" });
    expect(serverRequestedDelayMs(headers, 0)).toBe(7000);
  });

  it("500은 GET만 재시도하고 POST는 그대로 돌려준다", async () => {
    const get = fakeFetch([new Response("", { status: 503 }), new Response("ok")]);
    expect((await fetchWithRetry("https://x", {}, { fetchImpl: get.impl, ...noSleep })).status).toBe(200);

    const post = fakeFetch([new Response("", { status: 503 }), new Response("ok")]);
    const res = await fetchWithRetry("https://x", { method: "POST" }, { fetchImpl: post.impl, ...noSleep });
    expect(res.status).toBe(503);
    expect(post.calls).toHaveLength(1);
  });

  it("401, 404는 재시도하지 않는다", async () => {
    const { impl, calls } = fakeFetch([new Response("", { status: 401 })]);
    expect((await fetchWithRetry("https://x", {}, { fetchImpl: impl, ...noSleep })).status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("네트워크 오류는 멱등 요청만 재시도한다", async () => {
    const get = fakeFetch([new Error("ECONNRESET"), new Response("ok")]);
    expect((await fetchWithRetry("https://x", {}, { fetchImpl: get.impl, ...noSleep })).status).toBe(200);

    const post = fakeFetch([new Error("ECONNRESET")]);
    await expect(
      fetchWithRetry("https://x", { method: "POST" }, { fetchImpl: post.impl, ...noSleep }),
    ).rejects.toThrow("ECONNRESET");
  });

  it("최대 횟수를 넘으면 마지막 응답을 돌려준다", async () => {
    const { impl, calls } = fakeFetch([
      new Response("", { status: 429 }),
      new Response("", { status: 429 }),
      new Response("", { status: 429 }),
    ]);
    const res = await fetchWithRetry("https://x", {}, { fetchImpl: impl, maxAttempts: 3, ...noSleep });
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(3);
  });

  it("대기 시간이 실행 예산을 넘으면 DeferredError", async () => {
    const { impl } = fakeFetch([new Response("", { status: 429, headers: { "Retry-After": "120" } })]);
    await expect(
      fetchWithRetry("https://x", {}, { fetchImpl: impl, now: () => 0, deadline: 60_000, ...noSleep }),
    ).rejects.toBeInstanceOf(DeferredError);
  });

  it("지수 백오프는 상한을 넘지 않는다", () => {
    expect(backoffDelayMs(1, 1000, 16000, () => 0.5)).toBe(1000);
    expect(backoffDelayMs(4, 1000, 16000, () => 0.5)).toBe(8000);
    expect(backoffDelayMs(10, 1000, 16000, () => 1)).toBe(19200);
    expect(backoffDelayMs(10, 1000, 16000, () => 0)).toBe(12800);
  });
});

describe("Limiter", () => {
  it("동시 실행 수를 제한한다", async () => {
    const limiter = new Limiter({ maxConcurrent: 2, minIntervalMs: 0 });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    };
    await Promise.all(Array.from({ length: 6 }, () => limiter.run(task)));
    expect(peak).toBe(2);
  });

  it("시작 간격을 지킨다", async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new Limiter({
      maxConcurrent: 5,
      minIntervalMs: 500,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await Promise.all([1, 2, 3].map(() => limiter.run(async () => undefined)));
    expect(waits).toEqual([500, 500]);
  });
});

describe("maskSecrets", () => {
  it("토큰과 비밀값을 가린다", () => {
    const masked = maskSecrets(
      'Authorization: Bearer abc.def-123 {"access_token":"xyz","refresh_token":"r1"} client_secret=s3 ntn_abcdefghijklmnop',
    );
    expect(masked).not.toMatch(/abc\.def|xyz|r1|s3|abcdefghijklmnop/);
    expect(masked).toContain("Bearer ***");
  });
});
