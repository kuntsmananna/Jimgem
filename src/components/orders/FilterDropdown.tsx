"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/**
 * Multi-select filter as a dropdown. Replaces a row of one-at-a-time
 * pills: several statuses can be ticked together (Unpaid + Deposit paid,
 * say), and the whole control costs one button of height instead of a
 * full row per filter group.
 */
export function FilterDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  /** Empty means "no filter" — every value passes. */
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          active ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
        }`}
      >
        <span className={active ? "text-cream/70" : ""}>{label}:</span>
        <span>{summary}</span>
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 min-w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
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
        </div>
      )}
    </div>
  );
}
