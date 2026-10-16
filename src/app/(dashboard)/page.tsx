import { DateNav, resolveYmd } from "@/components/date-nav";
import { Card, EmptyState, PageHeader, StatusBadge, TextLink } from "@/components/ui";

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const ymd = resolveYmd((await searchParams).d);

  return (
    <>
      <PageHeader title="오늘" actions={<DateNav basePath="/" ymd={ymd} />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="일정" badge={<StatusBadge tone="off">연동 전</StatusBadge>} footer={<TextLink href="/calendar">일정 전체 보기</TextLink>}>
          <EmptyState
            title="아직 캘린더가 연결되지 않았습니다"
            description="Apps Script 캘린더 브리지를 배포하면 이 날의 일정이 시간순으로 표시됩니다."
          />
        </Card>
        <Card title="중요 메일" badge={<StatusBadge tone="off">연동 전</StatusBadge>} footer={<TextLink href="/mail">메일 전체 보기</TextLink>}>
          <EmptyState
            title="아직 NAVER WORKS가 연결되지 않았습니다"
            description="연결하면 긴급·중요로 분류된 메일 상위 5건이 표시됩니다."
          />
        </Card>
        <Card
          title="회의록"
          badge={<StatusBadge tone="off">연동 전</StatusBadge>}
          footer={<TextLink href="/notes">회의록 전체 보기</TextLink>}
        >
          <EmptyState
            title="아직 Notion이 연결되지 않았습니다"
            description={`「놀발 업무일지 및 미팅록」에서 ${ymd} 날짜의 회의록이 표시됩니다.`}
          />
        </Card>
      </div>
    </>
  );
}
