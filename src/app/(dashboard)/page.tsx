import { DateNav, resolveYmd } from "@/components/date-nav";
import { NoteLink } from "@/components/notion-doc";
import { Card, EmptyState, PageHeader, StatusBadge, TextLink } from "@/components/ui";
import { currentUser } from "@/lib/auth/current-user";
import { notesForDate, type NoteSummary } from "@/lib/notion/queries";
import { eventsForDay, lastCalendarSync, type CalendarEvent } from "@/lib/calendar/queries";
import { EventItem } from "@/components/event-item";

async function loadNotes(ymd: string): Promise<NoteSummary[] | null> {
  const user = await currentUser();
  if (!user.ok) return null;
  try {
    return await notesForDate(user.userId, ymd);
  } catch {
    return null;
  }
}

async function loadEvents(ymd: string): Promise<{ events: CalendarEvent[] | null; calendarSynced: boolean }> {
  const user = await currentUser();
  if (!user.ok) return { events: null, calendarSynced: false };
  try {
    const [events, last] = await Promise.all([eventsForDay(user.userId, ymd), lastCalendarSync(user.userId)]);
    return { events, calendarSynced: Boolean(last?.lastSuccessAt) };
  } catch {
    return { events: null, calendarSynced: false };
  }
}

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const ymd = resolveYmd((await searchParams).d);
  const notes = await loadNotes(ymd);
  const notionReady = Boolean(process.env.NOTION_INTERNAL_TOKEN);
  const { events, calendarSynced } = await loadEvents(ymd);

  return (
    <>
      <PageHeader title="오늘" actions={<DateNav basePath="/" ymd={ymd} />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          title="일정"
          badge={
            events === null ? (
              <StatusBadge tone="warn">DB 오류</StatusBadge>
            ) : calendarSynced ? (
              <StatusBadge tone="ok">{events.length}건</StatusBadge>
            ) : (
              <StatusBadge tone="off">연동 전</StatusBadge>
            )
          }
          footer={<TextLink href={`/calendar?d=${ymd}`}>일정 전체 보기</TextLink>}
        >
          {events === null ? (
            <EmptyState title="DB에 연결하지 못했습니다" description="설정 화면에서 DB 연결 상태를 확인해 주세요." />
          ) : !calendarSynced ? (
            <EmptyState title="아직 캘린더를 가져오지 않았습니다" description="일정 화면에서 '캘린더 지금 동기화'를 눌러 주세요." />
          ) : events.length === 0 ? (
            <EmptyState title="이 날짜에 일정이 없습니다" />
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <EventItem key={event.id} event={event} editable={false} testMode />
              ))}
            </ul>
          )}
        </Card>
        <Card title="중요 메일" badge={<StatusBadge tone="off">연동 전</StatusBadge>} footer={<TextLink href="/mail">메일 전체 보기</TextLink>}>
          <EmptyState
            title="아직 NAVER WORKS가 연결되지 않았습니다"
            description="연결하면 긴급·중요로 분류된 메일 상위 5건이 표시됩니다."
          />
        </Card>
        <Card
          title="회의록"
          badge={
            notes === null ? (
              <StatusBadge tone="warn">DB 오류</StatusBadge>
            ) : notionReady ? (
              <StatusBadge tone="ok">{notes.length}건</StatusBadge>
            ) : (
              <StatusBadge tone="off">연동 전</StatusBadge>
            )
          }
          footer={<TextLink href="/notes">회의록 전체 보기</TextLink>}
        >
          {notes === null ? (
            <EmptyState title="DB에 연결하지 못했습니다" description="설정 화면에서 DB 연결 상태를 확인해 주세요." />
          ) : notes.length === 0 ? (
            <EmptyState
              title={notionReady ? "이 날짜의 회의록이 없습니다" : "아직 Notion이 연결되지 않았습니다"}
              description={`「놀발 업무일지 및 미팅록」에서 제목이 ${ymd}로 시작하는 페이지가 여기에 표시됩니다.`}
            />
          ) : (
            <ul className="-mx-3">
              {notes.map((note) => (
                <li key={note.id}>
                  <NoteLink id={note.id}>
                    <p className="font-medium">{note.titleSuffix ?? note.title}</p>
                    {!note.hasContent ? <p className="text-xs text-muted">본문 대기 중</p> : null}
                  </NoteLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
