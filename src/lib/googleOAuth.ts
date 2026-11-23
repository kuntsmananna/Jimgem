import crypto from "crypto";

/**
 * Sign in with Google (v0.96).
 *
 * The one module that reads `GOOGLE_OAUTH_CLIENT_ID` and
 * `GOOGLE_OAUTH_CLIENT_SECRET` — the rule `googleSheets.ts` follows for the
 * service account and `sumit.ts` for SUMIT's key. Neither may ever carry a
 * `NEXT_PUBLIC_` prefix. These are a *different* Google credential from the
 * Sheets service account: that one is the app reading a spreadsheet as
 * itself, this one is a person proving who they are.
 *
 * Plain `fetch` against Google's two endpoints rather than a library: the
 * whole protocol is one redirect out, one code exchange and one profile
 * read, and `googleapis` (already installed, for the Sheet) would pull its
 * auth stack onto the login path for three requests.
 *
 * **The scope is identity only** — `openid email profile`. The calendar
 * sync that follows will ask each admin for calendar access separately, at
 * the moment they connect a calendar; asking for it here would show every
 * person signing in a consent screen about their calendar.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

/** Cookie holding the state + PKCE verifier between the redirect out and back. */
export const GOOGLE_FLOW_COOKIE = "jimgem_google_flow";

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

function readConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Whether the login page should offer the button at all. Until the owner
 * has created the OAuth client and set both variables, the page stays
 * exactly as it was — a button that can only fail is worse than none.
 */
export function googleSignInEnabled(): boolean {
  return readConfig() !== null;
}

/** A random URL-safe string, for the state and the PKCE verifier. */
function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** RFC 7636's S256 challenge for a verifier. Pure, so it is tested. */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Where Google sends the person back to. Derived from the request's own
 * origin, so production and every preview deployment each come back to
 * themselves — **each origin has to be listed** as an authorised redirect
 * URI on the OAuth client, or Google refuses with `redirect_uri_mismatch`.
 */
export function callbackUrl(origin: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString();
}

export interface FlowStart {
  url: string;
  /** Stored in the flow cookie; compared on the way back. */
  cookieValue: string;
}

/**
 * The redirect out. `state` defends the callback against a forged return
 * (someone else's code landing in this browser); PKCE binds the code to
 * this browser's verifier, so a code intercepted on the way back is useless
 * without the cookie. `prompt=select_account` so somebody signed into two
 * Google accounts — a personal and a work one — picks, rather than being
 * signed in silently as whichever was used last.
 */
export function startFlow(origin: string): FlowStart | null {
  const config = readConfig();
  if (!config) return null;
  const state = randomToken();
  const verifier = randomToken(48);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTH_ENDPOINT}?${params}`, cookieValue: `${state}.${verifier}` };
}

/** Splits the flow cookie back into its two halves, or null if it is not one. */
export function parseFlowCookie(value: string | undefined): { state: string; verifier: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  return { state: value.slice(0, dot), verifier: value.slice(dot + 1) };
}

/** Constant-time string comparison, so the state check leaks nothing by timing. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export interface GoogleIdentity {
  email: string;
  name: string | null;
}

/**
 * The code exchange and the profile read, both server-to-server over TLS
 * with the client secret — which is what makes the answer trustworthy
 * without verifying a token's signature here: it came from Google directly,
 * not through the browser.
 *
 * Returns null on anything short of a **verified** address. A Google
 * account can be opened on any email address, and until its owner clicks
 * the link Google sends, nobody has proved they control it — so accepting
 * an unverified one would let a stranger open a Google account on a staff
 * member's address and sign in as them.
 */
export async function identityFromCode(code: string, verifier: string, origin: string): Promise<GoogleIdentity | null> {
  const config = readConfig();
  if (!config) return null;

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) {
    console.error("Google token exchange failed:", tokenResponse.status);
    return null;
  }
  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) return null;

  const profileResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) {
    console.error("Google profile read failed:", profileResponse.status);
    return null;
  }
  const profile = (await profileResponse.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!profile.email || profile.email_verified !== true) return null;
  return { email: profile.email.toLowerCase(), name: profile.name ?? null };
}
