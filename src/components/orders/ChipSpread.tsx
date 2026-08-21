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
): SpreadOption[] {
  const options: SpreadOption[] = [];
  for (const row of rows) {
    const { archivedAt, ...option } = read(row);
    if (!archivedAt) options.push(option);
    else if (option.value === current) options.push({ ...option, retired: true });
  }
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current, retired: true });
  }
  return options;
}

export function ChipSpread({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SpreadOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">{label}</span>
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
              */
              className={`keeps-color flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition ${
                on
                  ? option.color
                    ? "text-ink shadow-sm ring-[1.5px] ring-ink/25"
                    : "bg-black text-cream"
                  : `text-ink-soft hover:text-ink ${
                      option.retired
                        ? "border border-dashed border-line"
                        : "border border-line hover:border-ink"
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
    </div>
  );
}
