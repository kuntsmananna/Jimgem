"use client";

import { currency } from "@/lib/money";

export interface BreakdownSlice {
  label: string;
  value: number;
  /** Any CSS background — a colour, or a flavour's own. */
  color: string;
}

/**
 * A part-of-whole chart as ranked bars (v0.77), where there used to be a
 * donut.
 *
 * The owner's pick of three, and the one that reads accurately: a bar's
 * length is compared against a straight edge, where an arc's share is
 * guessed by angle, and the second- and third-largest slices of a ring
 * were close enough to need their percentages read to be told apart. Each
 * row carries its figure and its share in words, so nothing hides behind
 * a hover the way the donut's centre readout did — which on a phone was
 * the one figure that chart existed to give, and could not be reached.
 *
 * Largest first, every bar measured against the largest — so the top one
 * always runs the full track and the rest are read against it — and a
 * total under them. Works at any width without a phone variant: a row is
 * a line of text over a bar.
 */
export function BarBreakdown({
  slices,
  valueFormat = currency,
}: {
  slices: BreakdownSlice[];
  valueFormat?: (value: number) => string;
}) {
  const ranked = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = ranked.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="text-sm text-ink-soft">No data for this period.</p>;
  const largest = ranked[0].value;

  return (
    <div className="flex flex-col gap-3 tabular-nums">
      <ul className="motion-stagger flex flex-col gap-3">
        {ranked.map((slice) => (
          <li key={slice.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink">{slice.label}</span>
              <span className="shrink-0 text-ink-soft">
                <b className="font-bold text-ink">{valueFormat(slice.value)}</b> · {Math.round((slice.value / total) * 100)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-cream">
              <div
                className="motion-bar h-full rounded-full"
                style={{ width: `${(slice.value / largest) * 100}%`, background: slice.color }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-line pt-2.5">
        <span className="text-xs text-ink-soft">Total</span>
        <span className="font-display text-lg font-extrabold tracking-tight text-ink">{valueFormat(total)}</span>
      </div>
    </div>
  );
}
