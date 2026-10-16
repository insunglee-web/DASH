import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function NotesPage() {
  return (
    <>
      <PageHeader title="회의록" subtitle="Notion 「놀발 업무일지 및 미팅록」 · 읽기 전용" />
      <Card title="날짜별 회의록">
        <EmptyState
          title="3단계에서 구현합니다"
          description="제목의 날짜(YYYYMMDD)로 정렬하고, 날짜를 읽지 못한 페이지는 '날짜 미확인'으로 따로 보여줍니다."
        />
      </Card>
    </>
  );
}
