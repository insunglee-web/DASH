"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// 일정 만들기·수정 폼. 날짜는 YYYYMMDD로 입력받고, 시각은 서울 기준으로 서버에 보낸다.

export type EventFormInitial = {
  id?: string;
  calendarId?: string;
  title: string;
  allDay: boolean;
  date: string;
  lastDate?: string;
  startTime: string;
  endTime: string;
  location?: string;
};

type Props = {
  calendars: { googleId: string; name: string }[];
  initial: EventFormInitial;
  testMode: boolean;
  onDone?: () => void;
};

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-[15px]";

function toIso(ymd: string, hhmm: string): string | null {
  if (!/^\d{8}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hhmm}:00+09:00`;
}

export function EventForm({ calendars, initial, testMode, onDone }: Props) {
  const router = useRouter();
  const editing = Boolean(initial.id);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EventFormInitial>(key: K, value: EventFormInitial[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let body: Record<string, unknown>;
    if (form.allDay) {
      // 수정할 때는 날짜를 바꾼 경우에만 보낸다(여러 날짜 종일 일정이 하루로 줄지 않게)
      body = editing
        ? { title: form.title, location: form.location ?? "", ...(form.date !== initial.date ? { startDate: form.date } : {}) }
        : { calendarId: form.calendarId, title: form.title, allDay: true, startDate: form.date, lastDate: form.lastDate, location: form.location };
    } else {
      const start = toIso(form.date, form.startTime);
      const end = toIso(form.date, form.endTime);
      if (!start || !end) {
        setError("날짜는 YYYYMMDD, 시각은 HH:MM 형식으로 입력해 주세요.");
        return;
      }
      body = editing
        ? { title: form.title, location: form.location ?? "", start, end }
        : { calendarId: form.calendarId, title: form.title, allDay: false, start, end, location: form.location };
    }

    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/calendar/events/${initial.id}` : "/api/calendar/events", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "저장하지 못했습니다.");
        return;
      }
      router.refresh();
      onDone?.();
      if (!editing) setForm({ ...initial });
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {!editing ? (
        <label className="flex flex-col gap-1 text-sm">
          캘린더
          <select className={input} value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)}>
            {calendars.map((c) => (
              <option key={c.googleId} value={c.googleId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        제목
        <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
        {testMode ? <span className="text-xs text-muted">테스트 모드: 제목이 [테스트]로 시작해야 저장됩니다.</span> : null}
      </label>
      {!editing ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-5 w-5" />
          종일
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {form.allDay ? "시작일" : "날짜"}
          <input
            className={`${input} tabular`}
            value={form.date}
            onChange={(e) => set("date", e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="YYYYMMDD"
            pattern="\d{8}"
            required
          />
        </label>
        {form.allDay && !editing ? (
          <label className="flex flex-col gap-1 text-sm">
            마지막 날(선택)
            <input
              className={`${input} tabular`}
              value={form.lastDate ?? ""}
              onChange={(e) => set("lastDate", e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              placeholder="YYYYMMDD"
            />
          </label>
        ) : null}
      </div>
      {!form.allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            시작
            <input type="time" className={input} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            종료
            <input type="time" className={input} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} required />
          </label>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        장소(선택)
        <input className={input} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} maxLength={500} />
      </label>
      {error ? (
        <p role="alert" className="rounded-lg bg-urgent/10 px-3 py-2 text-sm text-urgent">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || (!editing && calendars.length === 0)}
          className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "저장 중…" : editing ? "수정 저장" : "일정 만들기"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-border px-4 text-sm">
            취소
          </button>
        ) : null}
      </div>
    </form>
  );
}
