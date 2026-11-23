import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GOOGLE_FLOW_COOKIE, startFlow } from "@/lib/googleOAuth";

export const runtime = "nodejs";

/**
 * The redirect out to Google's account picker (v0.96).
 *
 * Outside the session gate (see `proxy.ts`) — nobody has a session yet.
 * The state and PKCE verifier ride in a short-lived httpOnly cookie scoped
 * to the callback, and are checked when Google sends the person back.
 */
export async function GET(request: NextRequest) {
  const flow = startFlow(request.nextUrl.origin);
  if (!flow) {
    // Not configured: say so on the login page rather than a bare 500.
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_FLOW_COOKIE, flow.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the return from Google is a top-level navigation
    // from another site, which Strict would send without this cookie.
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(flow.url);
}
