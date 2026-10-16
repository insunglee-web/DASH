// 환경 변수 목록은 docs/implementation-plan.md 3장과 .env.example을 함께 고친다.
// 값 자체는 절대 화면이나 로그에 내보내지 않는다. 설정 화면에는 "설정됨/없음"만 보여준다.

export type EnvGroup = "기본" | "로그인" | "DB" | "작업 스케줄" | "캘린더" | "Notion" | "NAVER WORKS";

export const ENV_KEYS: { key: string; group: EnvGroup; required: boolean; label: string }[] = [
  { key: "APP_BASE_URL", group: "기본", required: true, label: "배포 주소" },
  { key: "SESSION_SECRET", group: "로그인", required: true, label: "세션 서명 비밀값" },
  { key: "GITHUB_CLIENT_ID", group: "로그인", required: true, label: "GitHub OAuth App ID" },
  { key: "GITHUB_CLIENT_SECRET", group: "로그인", required: true, label: "GitHub OAuth App 비밀값" },
  { key: "ALLOWED_GITHUB_USER_ID", group: "로그인", required: true, label: "로그인 허용 GitHub 숫자 ID" },
  { key: "DATABASE_URL", group: "DB", required: true, label: "Supabase 연결 풀러 주소" },
  { key: "TOKEN_ENCRYPTION_KEY", group: "DB", required: true, label: "토큰 암호화 키" },
  { key: "CRON_SECRET", group: "작업 스케줄", required: true, label: "작업 호출 비밀값" },
  { key: "GAS_CALENDAR_WEBAPP_URL", group: "캘린더", required: true, label: "Apps Script 웹 앱 URL" },
  { key: "GAS_CALENDAR_SHARED_SECRET", group: "캘린더", required: true, label: "Apps Script 서명 비밀값" },
  { key: "NOTION_INTERNAL_TOKEN", group: "Notion", required: true, label: "Notion 연결 토큰" },
  { key: "NOTION_MEETING_ROOT_PAGE_ID", group: "Notion", required: true, label: "회의록 상위 페이지 ID" },
  { key: "NAVERWORKS_CLIENT_ID", group: "NAVER WORKS", required: true, label: "Client ID" },
  { key: "NAVERWORKS_CLIENT_SECRET", group: "NAVER WORKS", required: true, label: "Client Secret" },
];

export function isSet(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim() !== "";
}

export function requireEnv(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[key];
  if (!value || value.trim() === "") throw new Error(`${key} 환경 변수가 설정되지 않았습니다.`);
  return value;
}

export function envStatus(env: NodeJS.ProcessEnv = process.env) {
  return ENV_KEYS.map((item) => ({ ...item, set: isSet(item.key, env) }));
}

export const isProduction = () => process.env.NODE_ENV === "production";
