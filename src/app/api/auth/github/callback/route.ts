import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, allowedGithubUserId, githubConfig } from "@/lib/auth/config";
import { exchangeCode, fetchGithubUser, revokeToken } from "@/lib/auth/github";
import { cookieMaxAgeSeconds, encodeSession, sessionCookieName } from "@/lib/auth/session";
import { ensureAppUser } from "@/lib/db/user";
import { isProduction, requireEnv } from "@/lib/env";
import { safeEqual } from "@/lib/security/compare";
import { describeError } from "@/lib/security/mask";

function fail(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/github" });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (params.get("error")) return fail(request, "denied");
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return fail(request, "state");
  }

  let config;
  let sessionSecret: string;
  let allowedId: number;
  try {
    config = githubConfig(request.nextUrl.origin);
    sessionSecret = requireEnv("SESSION_SECRET");
    allowedId = allowedGithubUserId();
  } catch {
    return fail(request, "config");
  }

  let user: { id: number; login: string };
  try {
    const accessToken = await exchangeCode(config, code);
    try {
      user = await fetchGithubUser(accessToken);
    } finally {
      await revokeToken(config, accessToken);
    }
  } catch (error) {
    console.error("[auth] GitHub 로그인 실패", describeError(error));
    return fail(request, "github");
  }

  if (user.id !== allowedId) {
    console.warn("[auth] 허용되지 않은 GitHub 계정의 로그인 시도", user.id);
    return fail(request, "forbidden");
  }

  const now = Date.now();
  const session = { uid: user.id, login: user.login, iat: now, seen: now };

  // DB가 아직 준비되지 않았어도 로그인은 되게 한다
  try {
    await ensureAppUser(session);
  } catch (error) {
    console.error("[auth] app_user 저장 실패", describeError(error));
  }
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/github" });
  response.cookies.set(sessionCookieName(isProduction()), encodeSession(session, sessionSecret), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAgeSeconds(session, now),
  });
  return response;
}
