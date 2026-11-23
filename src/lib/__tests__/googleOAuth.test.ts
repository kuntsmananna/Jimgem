import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_SCOPE,
  callbackUrl,
  googleSignInEnabled,
  parseFlowCookie,
  pkceChallenge,
  sameToken,
  startFlow,
} from "../googleOAuth";

afterEach(() => vi.unstubAllEnvs());

describe("pkceChallenge", () => {
  it("matches RFC 7636's own S256 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("parseFlowCookie", () => {
  it("splits the flow kind, state and verifier", () => {
    expect(parseFlowCookie("signin.abc.def-ghi")).toEqual({ kind: "signin", state: "abc", verifier: "def-ghi" });
    expect(parseFlowCookie("calendar.s_1.v-2")).toEqual({ kind: "calendar", state: "s_1", verifier: "v-2" });
  });
  it("refuses anything that is not a known flow in three parts", () => {
    expect(parseFlowCookie(undefined)).toBeNull();
    expect(parseFlowCookie("")).toBeNull();
    expect(parseFlowCookie("abc.def")).toBeNull();
    expect(parseFlowCookie("admin.abc.def")).toBeNull();
    expect(parseFlowCookie("signin..def")).toBeNull();
    expect(parseFlowCookie("signin.abc.")).toBeNull();
    expect(parseFlowCookie("signin.a.b.c")).toBeNull();
  });
});

describe("sameToken", () => {
  it("is true only for an exact match", () => {
    expect(sameToken("abc", "abc")).toBe(true);
    expect(sameToken("abc", "abd")).toBe(false);
    expect(sameToken("abc", "abcd")).toBe(false);
  });
});

describe("callbackUrl", () => {
  it("comes back to whichever origin it left from", () => {
    expect(callbackUrl("https://jimgem.vercel.app")).toBe("https://jimgem.vercel.app/api/auth/google/callback");
    expect(callbackUrl("https://jimgem-git-x.vercel.app")).toBe(
      "https://jimgem-git-x.vercel.app/api/auth/google/callback",
    );
  });
});

describe("startFlow", () => {
  it("offers nothing until both credentials are set", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    expect(googleSignInEnabled()).toBe(false);
    expect(startFlow("https://x.test")).toBeNull();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "id");
    expect(googleSignInEnabled()).toBe(false);
  });

  it("asks for identity only, with PKCE bound to the cookie's verifier", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    const flow = startFlow("https://x.test")!;
    const url = new URL(flow.url);
    const cookie = parseFlowCookie(flow.cookieValue)!;

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/api/auth/google/callback");
    expect(url.searchParams.get("state")).toBe(cookie.state);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(cookie.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    // The secret never leaves the server.
    expect(flow.url).not.toContain("secret");
  });

  it("connecting a calendar asks for the narrow calendar scope and lasting access", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    const flow = startFlow("https://x.test", "calendar", "aviv@example.com")!;
    const url = new URL(flow.url);
    expect(url.searchParams.get("scope")).toBe(`openid email ${CALENDAR_SCOPE}`);
    expect(CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.app.created");
    expect(url.searchParams.get("access_type")).toBe("offline");
    // A refresh token comes back only on a fresh consent.
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("login_hint")).toBe("aviv@example.com");
    // Same callback as sign-in: no second redirect URI to register.
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/api/auth/google/callback");
    expect(parseFlowCookie(flow.cookieValue)?.kind).toBe("calendar");
  });

  it("signing in never asks for the calendar", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    const url = new URL(startFlow("https://x.test")!.url);
    expect(url.searchParams.get("scope")).not.toContain("calendar");
    expect(url.searchParams.get("access_type")).toBeNull();
    expect(parseFlowCookie(startFlow("https://x.test")!.cookieValue)?.kind).toBe("signin");
  });

  it("draws a fresh state every time", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    expect(startFlow("https://x.test")!.cookieValue).not.toBe(startFlow("https://x.test")!.cookieValue);
  });
});
