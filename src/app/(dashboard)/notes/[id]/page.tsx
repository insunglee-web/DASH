import { notFound } from "next/navigation";
import { NotionDoc } from "@/components/notion-doc";
import { Card, EmptyState, PageHeader, TextLink } from "@/components/ui";
import { currentUser } from "@/lib/auth/current-user";
import { formatYmdWithWeekday } from "@/lib/date";
import { getNote } from "@/lib/notion/queries";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const user = await currentUser();
  if (!user.ok) {
    return <EmptyState title="DB에 연결하지 못했습니다" description="설정 화면에서 DB 연결 상태를 확인해 주세요." />;
  }
  const note = await getNote(user.userId, id);
  if (!note) notFound();

  return (
    <>
      <PageHeader
        title={note.titleSuffix ?? note.title}
        subtitle={note.meetingDate ? formatYmdWithWeekday(note.meetingDate) : "날짜 미확인"}
        actions={
          <>
            <TextLink href="/notes">목록</TextLink>
            {note.url ? (
              <a href={note.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                Notion에서 열기
              </a>
            ) : null}
          </>
        }
      />
      <Card title="본문">
        {note.hasContent ? (
          <div className="max-w-3xl">
            <NotionDoc blocks={note.blocks} />
            {note.truncated ? (
              <p className="mt-4 text-sm text-muted">본문이 길어 일부만 표시합니다. 전체 내용은 Notion에서 확인해 주세요.</p>
            ) : null}
          </div>
        ) : (
          <EmptyState title="본문을 아직 가져오지 않았습니다" description="다음 동기화 때 가져옵니다." />
        )}
      </Card>
    </>
  );
}
