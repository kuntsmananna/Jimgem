import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { after } from "next/server";
import {
  GOOGLE_FLOW_COOKIE,
  exchangeCode,
  fetchIdentity,
  identityFromCode,
  parseFlowCookie,
  sameToken,
} from "@/lib/googleOAuth";
import { accountForVerifiedEmail, startSession } from "@/lib/auth";
import { callerIsAdmin } from "@/lib/guard";
import { getSession } from "@/lib/session";
import { appUrlFor, saveCalendarConnection, syncCalendars } from "@/lib/calendarSync";
import { recordAttempt } from "@/lib/loginThrottle";
import { STAFF_HOME } from "@/lib/roles";

export const runtime = "nodejs";
// Connecting a calendar ends with its first sync, which writes every
// coming order.
export const maxDuration = 60;

/**
 * Where Google sends the person back (v0.96).
 *
 * In order: the flow cookie is read and cleared (one use only), the state
 * must match it, the code is exchanged server-side for a **verified**
 * address, and that address must be on an account — `staff.email`, set in
 * Settings → Team. Every refusal lands on the login page with a reason; none
 * of them creates an account, because there is still no self-service
 * signup. The attempt is written to `login_attempts` under the address, so
 * the sign-in log shows Google sign-ins beside password ones.
 */
export async function GET(request: NextRequest) {
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, request.url));

  const cookieStore = await cookies();
  const flow = parseFlowCookie(cookieStore.get(GOOGLE_FLOW_COOKIE)?.value);
  cookieStore.delete({ name: GOOGLE_FLOW_COOKIE, path: "/api/auth/google" });

  const params = request.nextUrl.searchParams;
  const toSettings = (outcome: string) =>
    NextResponse.redirect(new URL(`/settings?tab=team&calendar=${outcome}`, request.url));
  // The person pressed Cancel on Google's screen: not an error worth a
  // red line, just back where they started.
  if (params.get("error") === "access_denied") {
    return flow?.kind === "calendar" ? toSettings("cancelled") : NextResponse.redirect(new URL("/login", request.url));
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!flow || !code || !state || !sameToken(state, flow.state)) {
    return flow?.kind === "calendar" ? toSettings("error") : back("google");
  }

  if (flow.kind === "calendar") return connectCalendar(request, code, flow.verifier, toSettings);

  let identity;
  try {
    identity = await identityFromCode(code, flow.verifier, request.nextUrl.origin);
  } catch (error) {
    console.error("Google sign-in failed:", error);
    return back("google");
  }
  if (!identity) return back("google");

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const account = await accountForVerifiedEmail(identity.email);
  await recordAttempt(identity.email, ip, account !== null);
  if (!account) return back("google-unknown");

  await startSession(account);
  return NextResponse.redirect(new URL(account.role === "admin" ? "/" : STAFF_HOME, request.url));
}

/**
 * The calendar half of the callback (v0.97). The caller must still be a
 * signed-in admin — this route is outside the session gate, so it asks.
 * The Google account need not be the one they sign in with: whoever's
 * calendar they choose on Google's screen is the one that fills.
 */
async function connectCalendar(
  request: NextRequest,
  code: string,
  verifier: string,
  toSettings: (outcome: string) => NextResponse,
): Promise<NextResponse> {
  if (!(await callerIsAdmin())) return NextResponse.redirect(new URL("/login", request.url));
  const session = await getSession();
  try {
    const tokens = await exchangeCode(code, verifier, request.nextUrl.origin);
    // No refresh token means no way to write later — Google sends one only
    // on a fresh consent, which the calendar flow always asks for.
    if (!tokens?.refreshToken) return toSettings("error");
    const identity = await fetchIdentity(tokens.accessToken);
    if (!identity) return toSettings("error");
    await saveCalendarConnection(session.userId, identity.email, tokens.refreshToken, tokens.accessToken);
  } catch (error) {
    console.error("Connecting a Google Calendar failed:", error);
    return toSettings("error");
  }
  // The first fill can take a while for a busy season: done after the
  // redirect, so the person lands back in Settings straight away.
  const staffId = session.userId;
  const appUrl = appUrlFor(request.nextUrl.origin);
  after(async () => {
    await syncCalendars({ staffId, appUrl }).catch((error) => console.error("First calendar sync failed:", error));
  });
  return toSettings("connected");
}
