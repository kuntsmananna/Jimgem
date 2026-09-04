/**
 * A labelled figure: the label quiet, the value in the surface's own ink.
 *
 * The row shape the phone's cards use wherever they lay a record out as a
 * grid of named numbers — the Biz Plan's month cards and the Orders detail
 * card, which had a character-identical copy each before this was lifted.
 *
 * Deliberately **not** called `Field`: `src/components/Field.tsx` already
 * exports one, and that is the form `<label>` wrapper the order and expense
 * sheets are built from. Two unrelated `Field`s would be a reading hazard.
 *
 * `tabular-nums` because every caller's value is a number — a count, a unit
 * total or an amount — and a column of them should line up.
 */
export function Figure({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  /** Span both columns of a two-column grid, for a value that needs the room. */
  wide?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
