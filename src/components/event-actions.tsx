"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EventForm, type EventFormInitial } from "./event-form";

// 쓰기 허용 캘린더의 단일 일정에만 보이는 수정·삭제 버튼
export function EventActions({ initial, testMode }: { initial: EventFormInitial & { id: string }; testMode: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm(`'${initial.title}' 일정을 삭제할까요? Google Calendar에서도 삭제됩니다.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${initial.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(json.error ?? "삭제하지 못했습니다.");
      else router.refresh();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-3 rounded-lg border border-border p-3">
        <EventForm calendars={[]} initial={initial} testMode={testMode} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-lg border border-border px-3 text-xs">
          수정
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="min-h-9 rounded-lg border border-urgent/40 px-3 text-xs text-urgent disabled:opacity-60"
        >
          {busy ? "삭제 중…" : "삭제"}
        </button>
      </div>
      {error ? <p className="text-xs text-urgent">{error}</p> : null}
    </div>
  );
}
