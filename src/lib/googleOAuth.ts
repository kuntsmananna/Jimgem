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
 * **Two flows share one callback.** Signing in asks for identity only
 * (`openid email profile`). Connecting a calendar (v0.97) is asked for
 * separately, by an admin who is already signed in, and adds
 * `calendar.app.created` — the narrowest calendar scope Google offers: the
 * app may make calendars of its own and write inside them, and cannot see
 * or change anything else in the person's calendar. Asking for it at
 * sign-in would show everyone a consent screen about their calendar. The
 * flow cookie carries which of the two it is, so the callback (one
 * registered redirect URI) knows what to do with the code.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** Make calendars of its own, and write only inside them. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

export type FlowKind = "signin" | "calendar";

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
 * without the cookie.
 *
 * Signing in uses `prompt=select_account`, so somebody signed into two
 * Google accounts picks rather than being signed in silently as whichever
 * was used last. Connecting a calendar uses `prompt=consent` with
 * `access_type=offline`, which is what makes Google hand back a refresh
 * token — the thing that lets the app keep writing to the calendar after
 * the person has gone — every time, including on a reconnect.
 */
export function startFlow(origin: string, kind: FlowKind = "signin", loginHint?: string): FlowStart | null {
  const config = readConfig();
  if (!config) return null;
  const state = randomToken();
  const verifier = randomToken(48);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: kind === "calendar" ? `openid email ${CALENDAR_SCOPE}` : "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  if (kind === "calendar") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    if (loginHint) params.set("login_hint", loginHint);
  } else {
    params.set("prompt", "select_account");
  }
  return { url: `${AUTH_ENDPOINT}?${params}`, cookieValue: `${kind}.${state}.${verifier}` };
}

/**
 * Splits the flow cookie back into its three parts, or null if it is not
 * one. A state and a verifier are base64url, which has no dot, so the dots
 * are unambiguous.
 */
export function parseFlowCookie(
  value: string | undefined,
): { kind: FlowKind; state: string; verifier: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [kind, state, verifier] = parts;
  if ((kind !== "signin" && kind !== "calendar") || !state || !verifier) return null;
  return { kind, state, verifier };
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

export interface GoogleTokens {
  accessToken: string;
  /** Only on a consent with `access_type=offline` — the calendar flow. */
  refreshToken: string | null;
}

/**
 * The code exchange, server-to-server over TLS with the client secret —
 * which is what makes the answer trustworthy without verifying a token's
 * signature here: it came from Google directly, not through the browser.
 */
export async function exchangeCode(code: string, verifier: string, origin: string): Promise<GoogleTokens | null> {
  const config = readConfig();
  if (!config) return null;
  const response = await fetch(TOKEN_ENDPOINT, {
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
  if (!response.ok) {
    console.error("Google token exchange failed:", response.status);
    return null;
  }
  const tokens = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token) return null;
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null };
}

/**
 * Who the token belongs to. Null on anything short of a **verified**
 * address. A Google account can be opened on any email address, and until
 * its owner clicks the link Google sends, nobody has proved they control
 * it — so accepting an unverified one would let a stranger open a Google
 * account on a staff member's address and sign in as them.
 */
export async function fetchIdentity(accessToken: string): Promise<GoogleIdentity | null> {
  const response = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    console.error("Google profile read failed:", response.status);
    return null;
  }
  const profile = (await response.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!profile.email || profile.email_verified !== true) return null;
  return { email: profile.email.toLowerCase(), name: profile.name ?? null };
}

/** Sign-in's two steps in one: the code to a verified identity, or null. */
export async function identityFromCode(code: string, verifier: string, origin: string): Promise<GoogleIdentity | null> {
  const tokens = await exchangeCode(code, verifier, origin);
  return tokens ? fetchIdentity(tokens.accessToken) : null;
}

/**
 * Google has withdrawn the refresh token — the person removed the app from
 * their Google account, changed their password, or (while the consent
 * screen is still in Testing) seven days have passed. Not a fault to retry:
 * the connection has to be made again.
 */
export class RefreshRevokedError extends Error {
  constructor() {
    super("Google no longer accepts this calendar connection. Connect it again.");
    this.name = "RefreshRevokedError";
  }
}

/** A fresh access token from a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const config = readConfig();
  if (!config) throw new Error("Google sign-in is not configured.");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new RefreshRevokedError();
    throw new Error(`Google token refresh failed (${response.status}).`);
  }
  const tokens = (await response.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("Google returned no access token.");
  return tokens.access_token;
}

/** Withdraws a token at Google. Best effort: a token already dead is fine. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
