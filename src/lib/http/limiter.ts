// 서비스별 호출 속도 제한
// NAVER WORKS: 동시 요청 5개 / Notion: 평균 초당 3회 → 여유를 두고 초당 2회

export type LimiterOptions = {
  maxConcurrent: number;
  /** 요청 시작 간 최소 간격(ms) */
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class Limiter {
  private active = 0;
  private lastStart = -Infinity;
  private readonly waiters: (() => void)[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly options: LimiterOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      await this.waitForInterval();
      return await task();
    } finally {
      this.release();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.active < this.options.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }

  // 시작 시각 간격은 순서대로 보장해야 하므로 체인으로 직렬화한다
  private waitForInterval(): Promise<void> {
    const turn = this.chain.then(async () => {
      const wait = this.lastStart + this.options.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = this.now();
    });
    this.chain = turn.catch(() => undefined);
    return turn;
  }
}

export const limiters = {
  naverworks: new Limiter({ maxConcurrent: 4, minIntervalMs: 300 }),
  notion: new Limiter({ maxConcurrent: 1, minIntervalMs: 500 }),
  gasCalendar: new Limiter({ maxConcurrent: 2, minIntervalMs: 0 }),
};
