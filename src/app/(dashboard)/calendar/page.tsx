import { DateNav, resolveYmd } from "@/components/date-nav";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ymd = resolveYmd((await searchParams).d);
  return (
    <>
      <PageHeader title="일정" subtitle="Google Calendar (Apps Script 브리지)" actions={<DateNav basePath="/calendar" ymd={ymd} />} />
      <Card title="일정 목록">
        <EmptyState
          title="4단계에서 구현합니다"
          description="일/주 보기와 단일 일정 생성·수정·삭제가 들어갑니다. 쓰기는 허용한 캘린더(처음에는 블루캐니언워터파크)에서만 됩니다."
        />
      </Card>
    </>
  );
}
