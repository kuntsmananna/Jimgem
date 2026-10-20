"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";

/**
 * What a page says when it could not be drawn — almost always the
 * database being unreachable for a moment, a deploy landing mid-click, or
 * a phone's connection dropping at a venue.
 *
 * Before this, Next's bare default page stood in, which reads as the app
 * being gone rather than a page that did not load. It says what probably
 * happened, that nothing was lost (a page that failed to *read* wrote
 * nothing), and offers the one thing to do. `retry` re-fetches the page
 * from the server, which is what a transient failure needs; the reference
 * code is the `digest` Next prints beside the real error in the server log,
 * so "it said 3f9a…" finds it there. The real message never reaches the
 * browser in production.
 */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  const button = "press rounded-xl px-4 py-2 text-sm font-semibold";

  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        title="This page didn’t load"
        hint="Usually a dropped connection or the server waking up. Nothing you saved has been lost — try again in a moment."
        actions={
          <>
            <button onClick={retry} className={`${button} bg-black text-cream`}>
              Try again
            </button>
            <a href="/orders" className={`${button} bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)]`}>
              Go to Orders
            </a>
          </>
        }
      />
      {digest && <p className="mt-3 text-center text-xs text-ink-soft">Reference: {digest}</p>}
    </div>
  );
}
