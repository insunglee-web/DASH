import Link from "next/link";
import { addDays, formatYmdWithWeekday, isValidYmd, todayYmd, type Ymd } from "@/lib/date";

/** ?d=YYYYMMDD 값을 읽는다. 없거나 잘못되면 오늘 */
export function resolveYmd(value: string | string[] | undefined): Ymd {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && isValidYmd(raw) ? raw : todayYmd();
}

export function DateNav({ basePath, ymd }: { basePath: string; ymd: Ymd }) {
  const today = todayYmd();
  const btn =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-muted";
  return (
    <div className="flex items-center gap-2">
      <Link href={`${basePath}?d=${addDays(ymd, -1)}`} className={btn} aria-label="이전 날짜">
        ‹
      </Link>
      <span className="tabular min-w-36 text-center text-[17px] font-semibold">{formatYmdWithWeekday(ymd)}</span>
      <Link href={`${basePath}?d=${addDays(ymd, 1)}`} className={btn} aria-label="다음 날짜">
        ›
      </Link>
      {ymd !== today ? (
        <Link href={basePath} className={btn}>
          오늘
        </Link>
      ) : null}
    </div>
  );
}
