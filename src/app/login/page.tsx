import { login } from "./actions";
import { GemsLogo } from "@/components/GemsLogo";
import { googleSignInEnabled } from "@/lib/googleOAuth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = params?.error === "1";
  // Refused by the throttle (loginThrottle.ts) — said plainly, with how
  // long, so a person who mistyped a few times knows it will pass.
  const throttled = params?.error === "wait";
  // Google sign-in (v0.96): offered only once the OAuth client exists, and
  // its two failures worded apart — "not linked" has a fix an admin can
  // make, "couldn't" is worth simply trying again.
  const google = googleSignInEnabled();
  const googleUnknown = params?.error === "google-unknown";
  const googleFailed = params?.error === "google";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 shadow-sm">
        {/* The mark stands in for the wordmark here, and is given room:
            this is the one screen with nothing else on it. */}
        <GemsLogo className="h-14 w-auto text-brand" />
        <h1 className="sr-only">Gems</h1>
        <p className="mt-4 text-sm font-medium text-ink-soft">Sign in to continue</p>

        {google && (
          <>
            <a
              href="/api/auth/google"
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream/60"
            >
              <GoogleMark />
              Continue with Google
            </a>
            {googleUnknown && (
              <p className="mt-3 text-sm font-medium text-red-700">
                That Google account isn&apos;t linked to anyone here. Ask an admin to add your email in
                Settings → Team.
              </p>
            )}
            {googleFailed && (
              <p className="mt-3 text-sm font-medium text-red-700">Couldn&apos;t sign in with Google. Try again.</p>
            )}
            <div className="mt-6 flex items-center gap-3 text-xs font-semibold text-ink-soft">
              <span className="h-px flex-1 bg-line" />
              or with a password
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form action={login} className={`${google ? "mt-4" : "mt-6"} flex flex-col gap-4`}>
          <div>
            <label htmlFor="username" className="text-xs font-semibold text-ink-soft">
              Username or email
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              // A phone capitalises the first letter by default, and the
              // lookup is case-folded on this side anyway — but turning the
              // keyboard's corrections off keeps a stray space or a
              // capital from ever reaching the field in the first place.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-line bg-cream/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-semibold text-ink-soft">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-line bg-cream/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>

          {hasError && (
            <p className="text-sm font-medium text-red-700">
              Incorrect username or password.
            </p>
          )}
          {throttled && (
            <p className="text-sm font-medium text-red-700">
              Too many attempts. Wait 15 minutes and try again.
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream transition hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Google's "G", in its own four colours — the sign-in button guidelines ask
 * for the real mark, and lucide carries no brand icons.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
