"use client";

/**
 * A single-select spread: every option visible at once as a chip, rather
 * than one value behind a dropdown.
 *
 * The form's four categorical fields — order type, payment status, stage
 * and delivery — are all short, owner-managed lists that are read far
 * more often than they are changed, and a dropdown spends a click and a
 * popover hiding eight things to show one. Spread out, the answer and the
 * alternatives are the same glance.
 *
 * **Colour is carried by the chosen chip only.** Nine saturated pills at
 * once is a rainbow that says nothing about which is selected, so an
 * unchosen option is a quiet outline and takes its colour on selection —
 * the same reading the Orders table gives a Type cell.
 */
export interface SpreadOption {
  /** The stored value. */
  value: string;
  label: string;
  /** The option's own colour, worn only while chosen. */
  color?: string;
  icon?: React.ReactNode;
  /**
   * Set on an option that is only here because the order already uses it
   * — an archived row, or a value that was never on the list. It stays
   * selectable so opening the form and closing it can't retype the order,
   * and says why it looks different.
   */
  retired?: boolean;
}

/**
 * Builds the option list for a value list that archives.
 *
 * The three rules every picker in this app follows, in one place: live
 * rows are offered, an archived row is offered only while this order
 * still uses it, and a value that resolves to no row at all still gets a
 * chip so saving cannot silently drop it.
 */
export function spreadOptions<T>(
  rows: T[],
  current: string,
  read: (row: T) => Omit<SpreadOption, "retired"> & { archivedAt?: string | null },
  /**
   * What to call a value that resolves to no row at all.
   *
   * Defaults to the stored value, which is right for a list orders
   * reference by name (order types). For an id- or key-keyed list it is
   * not: a deleted destination would render a chip reading "7" and a
   * missing stage one reading "paid-closed". Those callers pass something
   * legible instead.
   */
  labelFor: (value: string) => string = (value) => value,
): SpreadOption[] {
  const options: SpreadOption[] = [];
  for (const row of rows) {
    const { archivedAt, ...option } = read(row);
    if (!archivedAt) options.push(option);
    else if (option.value === current) options.push({ ...option, retired: true });
  }
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: labelFor(current), retired: true });
  }
  return options;
}

export function ChipSpread({
  label,
  value,
  options,
  onChange,
  showLabel = true,
  size = "sm",
}: {
  label: string;
  value: string;
  options: SpreadOption[];
  onChange: (value: string) => void;
  /**
   * `md` for a spread that is the subject of its row rather than one of
   * several stacked under captions — the package sizes on a content line.
   * A prop rather than a second component: the two differ by padding and
   * a point of type, and drawn as separate components they drifted apart
   * within a day of each other being written.
   */
  size?: "sm" | "md";
  /**
   * Drop the visible caption where a `GroupLabel` right above already
   * names the field — two headings for one row of chips reads as two
   * fields. The label still reaches screen readers as the group's name.
   */
  showLabel?: boolean;
}) {
  /*
   * The captioned form wraps the chips in a column; the uncaptioned one is
   * just the chips. Rendering the wrapper either way put a non-shrinking
   * block in the middle of the package line's flex row, which pushed Save
   * and delete onto a second line.
   */
  const chips = (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.value)}
              title={option.retired ? `${option.label} — no longer on the list` : option.label}
              /*
                `keeps-color` because a chosen chip's fill *is* the answer:
                without it the hover rule would recolor the one pill on the
                row that must not change.

                Every state carries a 1px border, selected included. The
                chosen chip used a `ring` instead, which draws outside the
                box rather than in it — so it came out 2px shorter than the
                chips beside it and its label looked cropped by its own
                pill.
              */
              className={`keeps-color flex shrink-0 items-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition ${
                size === "md" ? "px-3 py-1 text-xs" : "px-2.5 py-1 text-[11px]"
              } ${
                on
                  ? option.color
                    ? "border-ink/30 text-ink shadow-sm"
                    : "border-black bg-black text-cream"
                  : `text-ink-soft hover:text-ink ${
                      option.retired ? "border-dashed border-line" : "border-line hover:border-ink"
                    }`
              }`}
              style={on && option.color ? { background: option.color } : undefined}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
    </div>
  );

  if (!showLabel) return chips;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink uppercase">{label}</span>
      {chips}
    </div>
  );
}
