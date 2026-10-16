"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { status: string; pagesFound?: number; contentsFetched?: number; message?: string };

const STATUS_LABEL: Record<string, string> = {
  success: "완료",
  partial: "일부 완료",
  skipped: "건너뜀",
  deferred: "나중에 다시 시도",
  failed: "실패",
};

export function SyncButton({ endpoint, label }: { endpoint: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      setResult((await res.json()) as Result);
      router.refresh();
    } catch {
      setResult({ status: "failed", message: "서버에 연결하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "동기화 중… (최대 몇 분)" : label}
      </button>
      {result ? (
        <p role="status" className={`text-sm ${result.status === "failed" ? "text-urgent" : "text-muted"}`}>
          {STATUS_LABEL[result.status] ?? result.status}
          {result.pagesFound !== undefined ? ` · 페이지 ${result.pagesFound}개, 본문 ${result.contentsFetched ?? 0}건` : ""}
          {result.message ? ` · ${result.message}` : ""}
        </p>
      ) : null}
    </div>
  );
}
