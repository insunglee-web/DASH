import { NoteLink } from "@/components/notion-doc";
import { Card, EmptyState, PageHeader, StatusBadge, TextLink } from "@/components/ui";
import { currentUser } from "@/lib/auth/current-user";
import { formatYmdWithWeekday } from "@/lib/date";
import { listNotes, type NoteSummary } from "@/lib/notion/queries";

function NoteRow({ note }: { note: NoteSummary }) {
  return (
    <li>
      <NoteLink id={note.id}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{note.titleSuffix ?? note.title}</p>
            {note.meetingDate ? <p className="tabular text-xs text-muted">{formatYmdWithWeekday(note.meetingDate)}</p> : null}
          </div>
          <div className="flex shrink-0 gap-1">
            {note.weekdayMismatch ? <StatusBadge tone="warn">요일 확인</StatusBadge> : null}
            {!note.hasContent ? <StatusBadge tone="off">본문 대기</StatusBadge> : null}
          </div>
        </div>
      </NoteLink>
    </li>
  );
}

export default async function NotesPage() {
  const user = await currentUser();
  const header = <PageHeader title="회의록" subtitle="Notion 「놀발 업무일지 및 미팅록」 · 읽기 전용" />;

  if (!user.ok) {
    return (
      <>
        {header}
        <Card title="날짜별 회의록">
          <EmptyState title="DB에 연결하지 못했습니다" description="설정 화면에서 DB 연결 상태를 확인해 주세요." />
        </Card>
      </>
    );
  }

  const notes = await listNotes(user.userId);
  const dated = notes.filter((n) => n.meetingDate);
  const undated = notes.filter((n) => !n.meetingDate);

  // 날짜별 묶음
  const groups = new Map<string, NoteSummary[]>();
  for (const note of dated) groups.set(note.meetingDate!, [...(groups.get(note.meetingDate!) ?? []), note]);

  return (
    <>
      {header}
      {notes.length === 0 ? (
        <Card title="날짜별 회의록">
          <EmptyState
            title="아직 가져온 회의록이 없습니다"
            description="Notion 연결 후 설정 화면에서 '회의록 지금 동기화'를 눌러 주세요."
            action={<TextLink href="/settings">설정으로 이동</TextLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card title={`날짜별 회의록 (${dated.length})`}>
            <div className="flex flex-col gap-4">
              {[...groups.entries()].map(([ymd, items]) => (
                <section key={ymd}>
                  <h3 className="tabular mb-1 px-3 text-sm font-semibold text-muted">{formatYmdWithWeekday(ymd)}</h3>
                  <ul>
                    {items.map((note) => (
                      <NoteRow key={note.id} note={note} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
          <Card title={`날짜 미확인 (${undated.length})`}>
            {undated.length === 0 ? (
              <p className="text-sm text-muted">제목에서 날짜를 읽지 못한 페이지가 없습니다.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted">제목이 YYYYMMDD로 시작하지 않는 페이지입니다(연/월 폴더 페이지 포함).</p>
                <ul>
                  {undated.map((note) => (
                    <NoteRow key={note.id} note={note} />
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
