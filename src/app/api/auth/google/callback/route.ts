import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GOOGLE_FLOW_COOKIE, identityFromCode, parseFlowCookie, sameToken } from "@/lib/googleOAuth";
import { accountForVerifiedEmail, startSession } from "@/lib/auth";
import { recordAttempt } from "@/lib/loginThrottle";
import { STAFF_HOME } from "@/lib/roles";

export const runtime = "nodejs";

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
  // The person pressed Cancel on Google's screen: not an error worth a
  // red line, just back where they started.
  if (params.get("error") === "access_denied") return NextResponse.redirect(new URL("/login", request.url));

  const code = params.get("code");
  const state = params.get("state");
  if (!flow || !code || !state || !sameToken(state, flow.state)) return back("google");

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
