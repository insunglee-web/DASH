import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";
import { isProduction } from "@/lib/env";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete({ name: sessionCookieName(isProduction()), path: "/" });
  return response;
}
