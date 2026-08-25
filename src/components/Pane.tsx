import type { ReactNode } from "react";

/**
 * The lid itself, as one class.
 *
 * Every surface that wears the band hangs it off its container's `p-6` the
 * same way — negative margins out to the card's edge, the top corners
 * rounded to match, the band's own two tokens. `PaneHeader` and `Modal`
 * arrange different things inside it (a title and one action against a
 * title, a centred slot and a close button), but the lid is one thing and
 * is stated once: the alternative is a padding or radius change that has
 * to be made twice and silently drifts if it isn't.
 */
export const BAND_CLASS =
  "-mx-6 -mt-6 mb-4 rounded-t-card bg-band px-6 py-4 text-band-ink";

/**
 * The header a pane wears: a band carrying the title, what the pane is
 * for, and whatever one action it offers. Worn by every Settings pane, by
 * the Clients list, and — through `BAND_CLASS` — by every popup's title
 * row, which is why this lives here rather than in `settings/`. Its two
 * colours are `--color-band` and `--color-band-ink` (globals.css) — a
 * darker cast of the app's own cream, not black.
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
    <div className={`${BAND_CLASS} flex items-start justify-between gap-3`}>
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-xs opacity-60">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * The button shape a pane's header action takes: the band's own two
 * colours, swapped. Stated as tokens rather than cream-on-black so that
 * re-lighting the band re-lights its button with it.
 */
export const PANE_ACTION_CLASS =
  "rounded-full bg-band-ink px-3 py-1 text-xs font-semibold text-band transition hover:bg-band-ink/85";

/**
 * "This pane's table isn't there yet — run that migration."
 *
 * A migration ships with the code and is applied by hand, so a pane can
 * outrun its own table by a few minutes. Each such pane says the same
 * thing in the same tone, and in the app's own tile colour rather than a
 * raw amber picked per pane: the two that say it are reporting a chore,
 * not an alarm.
 */
export function MigrationNeeded({ script }: { script: string }) {
  return (
    <p className="mt-3 rounded-lg bg-tile-peach px-3 py-2 text-xs font-semibold text-ink" role="status">
      Not recording yet — run <code className="font-mono">{script}</code> against the database.
    </p>
  );
}
