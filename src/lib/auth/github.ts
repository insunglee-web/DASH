import "server-only";
import { fetchWithRetry } from "../http/retry";

// GitHub OAuth App 로그인 (D-06). scope를 요청하지 않아 공개 프로필만 읽는다.
// 받은 access token은 사용자 확인 직후 폐기한다(저장하지 않음).

export type GithubConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function authorizeUrl(config: GithubConfig, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export async function exchangeCode(config: GithubConfig, code: string): Promise<string> {
  const res = await fetchWithRetry(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    },
    { maxAttempts: 2 },
  );
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`GitHub 토큰 교환 실패: ${body.error ?? res.status}`);
  }
  return body.access_token;
}

export async function fetchGithubUser(accessToken: string): Promise<{ id: number; login: string }> {
  const res = await fetchWithRetry("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "personal-dashboard",
    },
  });
  if (!res.ok) throw new Error(`GitHub 사용자 조회 실패: ${res.status}`);
  const body = (await res.json()) as { id?: unknown; login?: unknown };
  if (typeof body.id !== "number" || typeof body.login !== "string") {
    throw new Error("GitHub 사용자 응답 형식이 올바르지 않습니다.");
  }
  return { id: body.id, login: body.login };
}

/** 로그인 확인이 끝난 토큰을 GitHub에서 폐기한다. 실패해도 로그인은 계속한다. */
export async function revokeToken(config: GithubConfig, accessToken: string): Promise<void> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  await fetch(`https://api.github.com/applications/${encodeURIComponent(config.clientId)}/token`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "User-Agent": "personal-dashboard",
    },
    body: JSON.stringify({ access_token: accessToken }),
  }).catch(() => undefined);
}
