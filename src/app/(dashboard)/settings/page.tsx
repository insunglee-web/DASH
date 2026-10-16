import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { currentSession } from "@/lib/auth/current";
import { envStatus } from "@/lib/env";

export default async function SettingsPage() {
  const session = await currentSession();
  const status = envStatus();
  const groups = [...new Set(status.map((item) => item.group))];
  const missing = status.filter((item) => item.required && !item.set).length;

  return (
    <>
      <PageHeader title="설정" subtitle="연동 상태와 환경 변수 준비 상황" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card
          title="환경 변수"
          badge={
            missing === 0 ? (
              <StatusBadge tone="ok">모두 설정됨</StatusBadge>
            ) : (
              <StatusBadge tone="warn">{missing}개 미설정</StatusBadge>
            )
          }
        >
          <p className="mb-4 text-sm text-muted">값은 표시하지 않고 설정 여부만 보여줍니다.</p>
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group}>
                <h3 className="mb-2 text-sm font-semibold">{group}</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {status
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm">{item.label}</p>
                          <p className="truncate font-mono text-xs text-muted">{item.key}</p>
                        </div>
                        {item.set ? <StatusBadge tone="ok">설정됨</StatusBadge> : <StatusBadge tone="off">없음</StatusBadge>}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <Card title="계정">
          <p className="text-sm">
            로그인: <span className="font-medium">@{session?.login ?? "-"}</span>
          </p>
          <form action="/api/auth/logout" method="post" className="mt-4">
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
            >
              로그아웃
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
