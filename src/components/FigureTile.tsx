/**
 * A figure on a phone's list page: a small caps label over a 24px value,
 * in a low-contrast fill (v0.81). The Orders and Expenses pages lead with
 * a row of these, above their filters — the figures are what the page is
 * opened to read. `note` is a short qualifier under the value ("incl.
 * VAT"), for a figure that means nothing without it.
 */
export function FigureTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-2xl bg-ink/[0.06] px-3 py-2.5">
      <span className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">{label}</span>
      <span className="mt-1 truncate font-display text-2xl leading-none font-extrabold tabular-nums">{value}</span>
      {note && <span className="mt-1 truncate text-[11px] font-semibold text-ink-soft">{note}</span>}
    </div>
  );
}
