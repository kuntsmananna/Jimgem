import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = params?.error === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-ink">Gems</h1>
        <p className="mt-1 text-sm font-medium text-ink-soft">Sign in to continue</p>

        <form action={login} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="text-xs font-semibold text-ink-soft">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
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
