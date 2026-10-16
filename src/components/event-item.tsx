import { formatTimeKo, toYmd } from "@/lib/date";
import { allDayLastDate } from "@/lib/calendar/mapping";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { EventActions } from "./event-actions";

function timeLabel(e: CalendarEvent): string {
  if (e.isAllDay && e.startDate) {
    const last = allDayLastDate(e.startDate, e.endDate);
    return last === e.startDate ? "종일" : `종일 · ~${last}`;
  }
  return e.startAt && e.endAt ? `${formatTimeKo(e.startAt)}–${formatTimeKo(e.endAt)}` : "";
}

export function EventItem({ event, editable, testMode }: { event: CalendarEvent; editable: boolean; testMode: boolean }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: event.calendarColor ?? "var(--accent)" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="tabular text-xs text-muted">
          {timeLabel(event)} · {event.calendarName}
          {event.isRecurring ? " · 반복" : ""}
        </p>
        <p className="font-medium break-words">{event.summary || "(제목 없음)"}</p>
        {event.location ? <p className="text-sm text-muted break-words">{event.location}</p> : null}
        {editable && event.writable && !event.isRecurring ? (
          <EventActions
            testMode={testMode}
            initial={{
              id: event.id,
              title: event.summary,
              allDay: event.isAllDay,
              date: event.isAllDay ? (event.startDate ?? "") : event.startAt ? toYmd(event.startAt) : "",
              startTime: event.startAt ? formatTimeKo(event.startAt) : "09:00",
              endTime: event.endAt ? formatTimeKo(event.endAt) : "10:00",
              location: event.location ?? "",
            }}
          />
        ) : null}
      </div>
    </li>
  );
}
