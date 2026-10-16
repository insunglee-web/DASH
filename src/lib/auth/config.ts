import "server-only";
import { isProduction, requireEnv } from "../env";
import type { GithubConfig } from "./github";

export const OAUTH_STATE_COOKIE = "pd_oauth_state";
export const CALLBACK_PATH = "/api/auth/github/callback";

/** OAuth redirect에 쓸 기준 주소. 운영에서는 APP_BASE_URL을 반드시 쓴다. */
export function baseUrl(requestOrigin: string): string {
  const configured = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (isProduction()) throw new Error("APP_BASE_URL 환경 변수가 설정되지 않았습니다.");
  return requestOrigin;
}

export function githubConfig(requestOrigin: string): GithubConfig {
  return {
    clientId: requireEnv("GITHUB_CLIENT_ID"),
    clientSecret: requireEnv("GITHUB_CLIENT_SECRET"),
    redirectUri: `${baseUrl(requestOrigin)}${CALLBACK_PATH}`,
  };
}

export function allowedGithubUserId(): number {
  const id = Number(requireEnv("ALLOWED_GITHUB_USER_ID"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("ALLOWED_GITHUB_USER_ID는 숫자 ID여야 합니다.");
  return id;
}
