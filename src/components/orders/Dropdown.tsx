"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePopoverDismiss } from "@/components/useOverlayDismiss";
import { useIsMobile } from "@/components/useMediaQuery";
import { Sheet } from "@/components/Sheet";
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
  /**
   * What is currently chosen, shown beside the label. A node rather than a
   * string so a summary can drop a word below the breakpoint — see
   * `FilterDropdown`, where "3 selected" has to become "3" for three of
   * these to share one phone-width row.
   */
  summary: ReactNode;
  /** Filled when the control is narrowing something, plain when it isn't. */
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /*
    On a phone the list is a sheet from the bottom edge, not a popover
    under the chip — the app's standing answer for a menu (see `Sheet`),
    and here also the only one that works: three of these sit in one row,
    so the third's `absolute left-0` popover would open off the right of
    the screen, and right-aligning it instead breaks the moment the row
    wraps and that chip is on the left.

    No hydration flash to manage: neither branch exists until `open`, and
    nothing is open on the first paint.
  */
  const mobile = useIsMobile();
  // Disarmed in sheet mode, or a tap *inside* the sheet — which portals to
  // the body, outside this container — would read as an outside click.
  usePopoverDismiss(open && !mobile, containerRef, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={label}
        aria-label={label}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition max-md:px-3.5 max-md:py-2 max-md:text-sm ${
          active ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
        }`}
      >
        <span className={active ? "text-cream/70" : ""} aria-hidden={!!icon}>
          {icon ?? `${label}:`}
        </span>
        <span>{summary}</span>
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open &&
        (mobile ? (
          // Titled with the written label, which is also what tells you
          // which filter the chip's icon stood for.
          <Sheet title={label} onClose={() => setOpen(false)}>
            <div className="px-3 pb-6">{children(() => setOpen(false))}</div>
          </Sheet>
        ) : (
          <div className="motion-drop absolute top-full left-0 z-30 mt-1 min-w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
            {children(() => setOpen(false))}
          </div>
        ))}
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
              /* A cursor hits a 26px row; a finger does not. Below the
                 breakpoint every row here is a 44px target — the size the
                 bottom bar's cells were built to. */
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold hover:bg-black/5 max-md:min-h-11 max-md:gap-2.5 max-md:px-3 max-md:text-sm ${
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
  /*
    "3 selected" is 66px of a 358px phone row that has to hold three of
    these, so below the breakpoint it is just "3" — the chip's icon has
    already said which filter it is, and the desktop wording is untouched
    because the word is hidden rather than rewritten.
  */
  const summary =
    selected.size === 0 ? (
      "All"
    ) : selected.size === 1 ? (
      (options.find((o) => selected.has(o.value))?.label ?? "1 selected")
    ) : (
      <>
        {selected.size}
        <span className="max-md:hidden"> selected</span>
      </>
    );

  return (
    <Dropdown label={label} icon={icon} summary={summary} active={active}>
      {() => (
        <>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs hover:bg-black/5 max-md:min-h-11 max-md:gap-2.5 max-md:px-3 max-md:text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-black max-md:h-4 max-md:w-4"
              />
              <span className="flex-1 font-semibold text-ink">{option.label}</span>
              <span className="text-ink-soft">{option.count}</span>
            </label>
          ))}
          {active && (
            <button
              onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-ink-soft hover:bg-black/5 hover:text-ink max-md:min-h-11 max-md:px-3 max-md:text-sm"
            >
              Clear
            </button>
          )}
        </>
      )}
    </Dropdown>
  );
}
