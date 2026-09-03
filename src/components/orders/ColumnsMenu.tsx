"use client";

import { useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { usePopoverDismiss } from "@/components/useOverlayDismiss";
import { resetColumnWidths } from "./useColumnWidths";

/**
 * Which of the table's columns are on screen, and the way back to the
 * automatic widths.
 *
 * An icon rather than a labelled pill: it belongs to the table's *shape*
 * rather than to which orders are in play, so it sits with the search and
 * Add order on the right of the toolbar instead of among the filters. The
 * mark is `Settings2` and not `Columns3`, which the view switcher already
 * uses for Kanban — the same icon meaning two things one row apart is
 * worse than a less literal one.
 *
 * Rendered only on the table view. The board and the calendar have no
 * columns, so the control would be a button that does nothing.
 *
 * The rows are `FilterDropdown`'s, deliberately: this reads as one of the
 * toolbar's own menus rather than as a second kind of popover.
 */
export function ColumnsMenu({
  columns,
  hidden,
  onToggle,
  onShowAll,
}: {
  /** Every column that can be hidden, in the table's own order. */
  columns: readonly { id: string; label: string }[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, containerRef, () => setOpen(false));

  const shown = columns.filter((column) => !hidden.has(column.id));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title="Columns"
        aria-label="Choose which columns to show"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          hidden.size > 0 ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
        }`}
      >
        <Settings2 size={15} />
      </button>

      {open && (
        // Right-aligned: this sits at the end of the toolbar, where a
        // left-aligned popover would open off the edge of the page.
        <div className="motion-drop absolute top-full right-0 z-30 mt-1 min-w-56 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
          {columns.map((column) => {
            const visible = !hidden.has(column.id);
            // The last one standing cannot be turned off: a table of
            // nothing but checkboxes reads as a bug rather than a choice.
            const last = visible && shown.length === 1;
            return (
              <label
                key={column.id}
                className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs ${
                  last ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-black/5"
                }`}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={last}
                  onChange={() => onToggle(column.id)}
                  className="accent-black"
                />
                <span className="flex-1 font-semibold text-ink">{column.label}</span>
              </label>
            );
          })}

          <div className="mt-1 border-t border-line pt-1">
            {hidden.size > 0 && (
              <button
                type="button"
                onClick={onShowAll}
                className="w-full rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-ink-soft transition hover:bg-black/5 hover:text-ink"
              >
                Show all columns
              </button>
            )}
            {/*
              The widths live in `OrdersTable`, but their store is
              module-level and notifies its subscribers, so this can offer
              the reset without any of that being lifted out and drilled
              back down. It also makes the double-click-a-handle reset
              discoverable, which an invisible gesture never is.
            */}
            <button
              type="button"
              onClick={resetColumnWidths}
              className="w-full rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-ink-soft transition hover:bg-black/5 hover:text-ink"
            >
              Reset column widths
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
