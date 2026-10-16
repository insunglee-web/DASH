const ERROR_MESSAGES: Record<string, string> = {
  config: "로그인 설정(GitHub OAuth App, SESSION_SECRET 등)이 아직 준비되지 않았습니다.",
  state: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  denied: "GitHub에서 로그인을 취소했습니다.",
  github: "GitHub와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  forbidden: "이 대시보드에 접근할 수 없는 계정입니다.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const error = (await searchParams).error;
  const message = typeof error === "string" ? (ERROR_MESSAGES[error] ?? "로그인에 실패했습니다.") : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-bold">업무 대시보드</h1>
        <p className="mt-2 text-sm text-muted">일정, 메일, 회의록을 한 화면에서 확인합니다.</p>
        {message ? (
          <p role="alert" className="mt-5 rounded-lg bg-urgent/10 px-3 py-2.5 text-sm text-urgent">
            {message}
          </p>
        ) : null}
        <a
          href="/api/auth/github/start"
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 font-medium text-background hover:opacity-90"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub로 로그인
        </a>
      </div>
    </div>
  );
}
