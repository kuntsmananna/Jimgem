import type { ReactNode } from "react";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { cubeColors } from "@/components/JellyLoader";

/**
 * What a list says when there is nothing in it: an empty tray with one
 * cube left in it, a sentence that names *why* it is empty, and the one
 * or two things you would do about it.
 *
 * A bare "No results" reads as the page being broken. Naming the reason —
 * the time window, the filters, a search — tells you which knob to turn,
 * and the buttons turn it.
 */
export function EmptyState({
  title,
  hint,
  actions,
  bare = false,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  /** Already inside a pane, so no box of its own — a box in a box is one edge too many. */
  bare?: boolean;
}) {
  return (
    <section
      className={`motion-rise flex flex-col items-center gap-2.5 text-center ${
        bare ? "px-4 py-10" : "rounded-card bg-card/35 px-6 py-14 shadow-[inset_0_0_0_1px_var(--color-line)]"
      }`}
    >
      <div aria-hidden className="mb-2 grid grid-cols-3 gap-1 rounded-lg p-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]">
        {Array.from({ length: 9 }, (_, i) =>
          i === 4 ? (
            <span key={i} className="jelly-cube h-5 w-5" style={cubeColors(SERIES_COLORS.royale)} />
          ) : (
            <span key={i} className="h-5 w-5 shadow-[inset_0_0_0_1.5px_var(--color-line)]" />
          ),
        )}
      </div>
      <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{title}</h2>
      {hint && <p className="max-w-sm text-sm text-ink-soft">{hint}</p>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </section>
  );
}
