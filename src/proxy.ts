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
     * - the web manifest and the home-screen icons. A `<link rel="manifest">`
     *   is fetched with credentials *omitted* unless it says otherwise, so
     *   gating it redirected even a signed-in owner's browser to /login and
     *   left it parsing an HTML page as the manifest: no `standalone`, no
     *   `/orders` start_url, no icon. Nothing in any of them is private —
     *   an app name, two colours and a mark.
     */
    "/((?!login|api/backup/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icons/).*)",
  ],
};
