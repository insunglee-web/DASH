import { DateNav, resolveYmd } from "@/components/date-nav";
import { EventForm } from "@/components/event-form";
import { EventItem } from "@/components/event-item";
import { SyncButton } from "@/components/sync-button";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { currentUser } from "@/lib/auth/current-user";
import { eventsForWeek, lastCalendarSync, writableCalendars } from "@/lib/calendar/queries";
import { formatTimeKo, formatYmdWithWeekday, toYmd, todayYmd } from "@/lib/date";

// Apps Script의 TEST_MODE 기본값이 true라 제목 안내를 항상 보여준다. 실제 판단은 브리지가 한다.
const TEST_MODE_HINT = true;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ymd = resolveYmd((await searchParams).d);
  const header = (
    <PageHeader title="일정" subtitle="Google Calendar · 선택한 날부터 7일" actions={<DateNav basePath="/calendar" ymd={ymd} />} />
  );

  const user = await currentUser();
  if (!user.ok) {
    return (
      <>
        {header}
        <EmptyState title="DB에 연결하지 못했습니다" description="설정 화면에서 DB 연결 상태를 확인해 주세요." />
      </>
    );
  }

  const [week, writable, lastSync] = await Promise.all([
    eventsForWeek(user.userId, ymd),
    writableCalendars(user.userId),
    lastCalendarSync(user.userId),
  ]);
  const today = todayYmd();
  const total = week.reduce((n, d) => n + d.events.length, 0);

  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="일정" badge={<StatusBadge tone={total > 0 ? "ok" : "off"}>{total}건</StatusBadge>}>
          {lastSync === null ? (
            <EmptyState title="아직 캘린더를 가져오지 않았습니다" description="오른쪽의 '캘린더 지금 동기화'를 눌러 주세요." />
          ) : (
            <div className="flex flex-col gap-4">
              {week.map(({ ymd: day, events }) => (
                <section key={day}>
                  <h3 className={`tabular mb-1 text-sm font-semibold ${day === today ? "text-accent" : "text-muted"}`}>
                    {formatYmdWithWeekday(day)}
                    {day === today ? " · 오늘" : ""}
                  </h3>
                  {events.length === 0 ? (
                    <p className="py-1 text-sm text-muted">일정 없음</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {events.map((event) => (
                        <EventItem key={`${day}-${event.id}`} event={event} editable testMode={TEST_MODE_HINT} />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="새 일정">
            {writable.length === 0 ? (
              <p className="text-sm text-muted">
                쓰기가 허용된 캘린더가 없습니다. Apps Script의 WRITE_CALENDAR_IDS를 확인한 뒤 동기화해 주세요.
              </p>
            ) : (
              <EventForm
                calendars={writable}
                testMode={TEST_MODE_HINT}
                initial={{
                  calendarId: writable[0].googleId,
                  title: "[테스트] ",
                  allDay: false,
                  date: ymd,
                  startTime: "10:00",
                  endTime: "11:00",
                }}
              />
            )}
          </Card>
          <Card title="동기화">
            <p className="mb-3 text-sm text-muted">
              마지막 동기화: {lastSync?.lastSuccessAt ? `${toYmd(lastSync.lastSuccessAt)} ${formatTimeKo(lastSync.lastSuccessAt)}` : "없음"}
              {lastSync && lastSync.failures > 0 ? ` · 연속 실패 ${lastSync.failures}회` : ""}
            </p>
            <SyncButton endpoint="/api/sync/calendar" label="캘린더 지금 동기화" />
          </Card>
        </div>
      </div>
    </>
  );
}
