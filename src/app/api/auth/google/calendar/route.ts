import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GOOGLE_FLOW_COOKIE, startFlow } from "@/lib/googleOAuth";
import { callerIsAdmin } from "@/lib/guard";
import { getSession } from "@/lib/session";
import { staffEmail } from "@/lib/calendarSync";

export const runtime = "nodejs";

/**
 * "Connect Google Calendar" from Settings → Team (v0.97): the redirect out
 * to Google asking for calendar access.
 *
 * It sits under `/api/auth/google` so the flow cookie (scoped to that
 * path) reaches the shared callback, and the callback needs no second
 * redirect URI registered with Google. That puts it outside the session
 * gate, so it checks for itself that the caller is a signed-in admin.
 */
export async function GET(request: NextRequest) {
  if (!(await callerIsAdmin())) return NextResponse.redirect(new URL("/login", request.url));
  const session = await getSession();
  const flow = startFlow(request.nextUrl.origin, "calendar", await staffEmail(session.userId));
  if (!flow) return NextResponse.redirect(new URL("/settings?tab=team&calendar=unconfigured", request.url));

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_FLOW_COOKIE, flow.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(flow.url);
}
