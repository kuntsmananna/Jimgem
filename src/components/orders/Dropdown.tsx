"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePopoverDismiss } from "@/components/useOverlayDismiss";
import { ChevronDown } from "lucide-react";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/**
 * The shell every toolbar dropdown shares: the pill that opens it, and a
 * popover that closes on an outside click or Escape.
 *
 * `children` is a function taking `close`, because what closes the popover
 * depends on the control inside it — picking one of four scopes is the
 * whole interaction and should close, ticking one of five payment states
 * is not.
 */
function Dropdown({
  label,
  icon,
  summary,
  active,
  children,
}: {
  label: string;
  /**
   * Shown in place of the written label, which then survives as the
   * button's title and its accessible name. Three toolbar pills each
   * spelling out what they filter cost more width than the values they
   * were showing.
   */
  icon?: ReactNode;
  /** What is currently chosen, shown beside the label. */
  summary: string;
  /** Filled when the control is narrowing something, plain when it isn't. */
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, containerRef, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={label}
        aria-label={label}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
          active ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
        }`}
      >
        <span className={active ? "text-cream/70" : ""} aria-hidden={!!icon}>
          {icon ?? `${label}:`}
        </span>
        <span>{summary}</span>
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 min-w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Pick exactly one — the time scope, and the calendar's monthly/weekly.
 *
 * Both were segmented pill rows. Four scope pills spent most of the
 * toolbar's width on a control changed a few times a day, and left no room
 * to centre the view switcher between the filters and Add order.
 */
export function SelectDropdown<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  active = true,
}: {
  label: string;
  /** Drawn instead of the written label — see Dropdown. */
  icon?: ReactNode;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Pass false for the value that narrows nothing, e.g. "All time". */
  active?: boolean;
}) {
  const summary = options.find((option) => option.id === value)?.label ?? "";

  return (
    <Dropdown label={label} icon={icon} summary={summary} active={active}>
      {(close) => (
        <>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                close();
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold hover:bg-black/5 ${
                option.id === value ? "text-ink" : "text-ink-soft"
              }`}
            >
              {/* A dot rather than a tick, so the row's text sits in the
                  same place as the checkbox rows in the filters beside it. */}
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.id === value ? "bg-ink" : "bg-transparent"}`}
              />
              {option.label}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/**
 * Multi-select filter as a dropdown. Replaces a row of one-at-a-time
 * pills: several statuses can be ticked together (Unpaid + Deposit paid,
 * say), and the whole control costs one button of height instead of a
 * full row per filter group.
 */
export function FilterDropdown<T extends string>({
  label,
  icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  /** Drawn instead of the written label — see Dropdown. */
  icon?: ReactNode;
  options: FilterOption<T>[];
  /** Empty means "no filter" — every value passes. */
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  function toggle(value: T) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const active = selected.size > 0;
  const summary =
    selected.size === 0
      ? "All"
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? "1 selected")
        : `${selected.size} selected`;

  return (
    <Dropdown label={label} icon={icon} summary={summary} active={active}>
      {() => (
        <>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs hover:bg-black/5"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-black"
              />
              <span className="flex-1 font-semibold text-ink">{option.label}</span>
              <span className="text-ink-soft">{option.count}</span>
            </label>
          ))}
          {active && (
            <button
              onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-ink-soft hover:bg-black/5 hover:text-ink"
            >
              Clear
            </button>
          )}
        </>
      )}
    </Dropdown>
  );
}
