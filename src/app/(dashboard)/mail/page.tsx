import { Card, EmptyState, PageHeader } from "@/components/ui";

const LEVELS = [
  { key: "urgent", label: "긴급", className: "text-urgent" },
  { key: "important", label: "중요", className: "text-important" },
  { key: "normal", label: "일반", className: "text-muted" },
  { key: "low", label: "낮음", className: "text-muted" },
];

export default function MailPage() {
  return (
    <>
      <PageHeader title="메일" subtitle="NAVER WORKS 받은메일함 · 메타데이터만 저장" />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="중요도">
        {LEVELS.map((level) => (
          <span
            key={level.key}
            className={`inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium ${level.className}`}
          >
            {level.label}
          </span>
        ))}
      </div>
      <Card title="메일 목록">
        <EmptyState
          title="5단계에서 구현합니다"
          description="NAVER WORKS 앱 승인 후 연결하면 규칙 기반으로 분류한 메일과 분류 근거가 표시됩니다."
        />
      </Card>
    </>
  );
}
