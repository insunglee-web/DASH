import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, githubConfig } from "@/lib/auth/config";
import { authorizeUrl } from "@/lib/auth/github";
import { isProduction } from "@/lib/env";

export async function GET(request: NextRequest) {
  let config;
  try {
    config = githubConfig(request.nextUrl.origin);
  } catch {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(authorizeUrl(config, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/api/auth/github",
    maxAge: 600,
  });
  return response;
}
