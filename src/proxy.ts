import { NextResponse, type NextRequest } from "next/server";
import {
  cookieMaxAgeSeconds,
  decodeSession,
  encodeSession,
  needsRefresh,
  sessionCookieName,
} from "@/lib/auth/session";

// 모든 화면과 API는 로그인 세션이 있어야 한다.
// 예외: 로그인 화면, GitHub 로그인 흐름, 작업 엔드포인트(/api/jobs/*는 CRON_SECRET으로 따로 검증)

const PUBLIC_PATHS = ["/login", "/api/auth/github/start", "/api/auth/github/callback"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/jobs/");
}

function expectedOrigin(request: NextRequest): string {
  return process.env.APP_BASE_URL?.replace(/\/+$/, "") || request.nextUrl.origin;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");

  // CSRF: 상태를 바꾸는 API 요청은 같은 출처에서 온 것만 받는다
  if (isApi && !SAFE_METHODS.has(request.method)) {
    if (request.headers.get("origin") !== expectedOrigin(request)) {
      return NextResponse.json({ error: "잘못된 요청 출처입니다." }, { status: 403 });
    }
  }

  const production = process.env.NODE_ENV === "production";
  const cookieName = sessionCookieName(production);
  const secret = process.env.SESSION_SECRET ?? "";
  const now = Date.now();
  const session = decodeSession(request.cookies.get(cookieName)?.value, secret, now);

  if (!session) {
    if (isApi) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  if (needsRefresh(session, now)) {
    const refreshed = { ...session, seen: now };
    response.cookies.set(cookieName, encodeSession(refreshed, secret), {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: cookieMaxAgeSeconds(refreshed, now),
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
