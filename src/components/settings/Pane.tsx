import type { ReactNode } from "react";

/**
 * The header every Settings pane wears: a black band carrying the title,
 * what the pane is for, and whatever one action it offers.
 *
 * Drawn in negative for the same reason the order form's money rail is —
 * the tab is a wall of cream cards, and a heading set on the same surface
 * as its list read as the list's first row. A band gives each pane a lid,
 * so a column of them scans as separate things rather than one long sheet.
 *
 * Buttons inside it inherit the reversal: pass one and it sits on the
 * right of the title, in cream on black rather than the other way round.
 */
export function PaneHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** The pane's one action — an Add button, usually. */
  action?: ReactNode;
}) {
  return (
    <div className="-mx-6 -mt-6 mb-4 flex items-start justify-between gap-3 rounded-t-card bg-black px-6 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold text-cream">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-cream/60">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The button shape a pane's header action takes: cream on black. */
export const PANE_ACTION_CLASS =
  "rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink transition hover:bg-cream/85";
