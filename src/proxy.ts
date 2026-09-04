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
     * - Next.js internals (_next/*)
     * - **anything ending in a static-asset extension** — which for this
     *   app means `public/`: the icons, the mark, the web manifest.
     *
     * That last one is a rule rather than a list on purpose. It used to
     * name each file, and the list was maintained by hand while
     * `scripts/make-icons.mjs` wrote new files into `public/` — so a file
     * added there was gated by default, and the failure was silent and
     * baffling: a `<link rel="manifest">` is fetched with credentials
     * *omitted*, so even a signed-in browser was redirected to /login and
     * parsed an HTML page as the manifest (no `standalone`, no `/orders`
     * start_url, no icon). Add-to-Home-Screen was broken that way for
     * three versions before anyone noticed.
     *
     * **It is an allowlist of extensions, not "any dot", and that is the
     * whole point.** "Any extension" was the obvious version and it is
     * unsafe here: Next serves a page's React Server Component payload at
     * `/orders.rsc`, `/settings.rsc` and so on, and those carry the page's
     * real data — every order, client and amount. A blanket dot-rule
     * un-gates them. Checked against the compiled matcher in
     * `.next/server/functions-config-manifest.json`, not by reading the
     * pattern.
     *
     * So: adding a file to `public/` needs no edit here; adding a whole
     * new *kind* of asset does. The trade is Next's own — `public/` is
     * public, so nothing secret goes in it.
     */
    "/((?!login|api/backup/cron|_next|[^?]*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|webmanifest|txt|xml|pdf|css|woff2?|ttf|otf|mp4|webm)$).*)",
  ],
};
