import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";

const SESSION_COOKIE_NAME = "jimgem_session";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: SESSION_COOKIE_NAME,
  });

  if (!session.userId) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - /login (the page itself, to avoid a redirect loop)
     * - /api/backup/cron, which is called by the schedule rather than by a
     *   person: it has no session to present, and carries the cron secret
     *   instead — the route refuses to run without it.
     * - Next.js internals (_next/static, _next/image)
     * - favicon.ico and other static files
     */
    "/((?!login|api/backup/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
