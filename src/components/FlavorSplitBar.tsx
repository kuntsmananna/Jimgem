"use client";

import { useRef } from "react";
import { flavorBarGradient } from "@/lib/flavorStyle";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** One slice of the bar: which flavour, and how much of the total it takes. */
export interface SplitEntry {
  flavorId: string;
  units: number;
}

export interface BarFlavor {
  id: number;
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
}

/**
 * A flavour split as one draggable bar across a fixed total.
 *
 * Shared by the order form (total = a package line's units) and the
 * Settings preset editor (total = 100, so a slice is a percentage). The
 * two are the same control over a different denominator, and were worth
 * unifying rather than maintaining two drag implementations that would
 * drift.
 *
 * Whatever is left over is drawn as a real trailing segment rather than
 * empty track, which is what lets one gesture do both jobs: dragging a
 * divider moves amounts between two flavours, and dragging the last one
 * pulls from the leftover into a flavour.
 */
export function FlavorSplitBar({
  entries,
  total,
  flavors,
  onChange,
  leftoverLabel = "unassigned",
  formatValue = (value) => nf.format(value),
}: {
  entries: SplitEntry[];
  total: number;
  flavors: BarFlavor[];
  onChange: (entries: SplitEntry[]) => void;
  leftoverLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const assigned = entries.reduce((sum, e) => sum + e.units, 0);
  const leftover = total - assigned;
  const scale = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const nameOf = (flavorId: string) =>
    flavors.find((f) => String(f.id) === flavorId)?.name ?? "flavour";

  /**
   * Everything a drag needs is fixed for its whole duration — only the two
   * segments either side of the divider change — so it is captured once
   * here rather than re-read from props inside the listener, where it
   * would go stale.
   */
  function startDrag(event: React.PointerEvent, index: number) {
    event.preventDefault();
    const bar = barRef.current;
    if (!bar || total <= 0) return;

    const rect = bar.getBoundingClientRect();
    const before = entries.slice(0, index).reduce((sum, e) => sum + e.units, 0);
    const next = entries[index + 1];
    const pool = entries[index].units + (next ? next.units : Math.max(0, leftover));

    const move = (e: PointerEvent) => {
      const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const size = clamp(Math.round(fraction * total) - before, 0, pool);
      onChange(
        entries.map((entry, i) => {
          if (i === index) return { ...entry, units: size };
          if (i === index + 1) return { ...entry, units: pool - size };
          return entry;
        }),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // A handle sits at each running total. The last flavour only gets one
  // if there is leftover on its right to trade with.
  const handles = entries
    .map((entry, index) => ({
      index,
      at: entries.slice(0, index + 1).reduce((sum, e) => sum + e.units, 0),
      name: nameOf(entry.flavorId),
    }))
    .filter(({ index }) => index < entries.length - 1 || leftover > 0);

  return (
    <div
      ref={barRef}
      className="relative flex h-8 touch-none select-none overflow-hidden rounded-lg bg-line/50"
      role="img"
      aria-label="Flavour split"
    >
      {entries.map((entry, i) => {
        const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
        return (
          <div
            key={i}
            style={{
              flex: `0 0 ${scale(entry.units)}%`,
              background: flavor ? flavorBarGradient(flavor) : "var(--color-ink-soft)",
            }}
            title={`${flavor?.name ?? "Unknown"} — ${formatValue(entry.units)}`}
            className="grid place-items-center overflow-hidden whitespace-nowrap text-[10px] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
          >
            {scale(entry.units) > 9 ? formatValue(entry.units) : ""}
          </div>
        );
      })}

      {leftover > 0 && (
        <div
          style={{
            flex: `0 0 ${scale(leftover)}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent 0 6px, var(--color-line) 6px 12px)",
          }}
          title={`${formatValue(leftover)} ${leftoverLabel}`}
          className="grid place-items-center overflow-hidden whitespace-nowrap text-[10px] font-semibold text-ink-soft"
        >
          {scale(leftover) > 16 ? leftoverLabel : ""}
        </div>
      )}

      {handles.map((handle) => (
        <div
          key={handle.index}
          role="separator"
          aria-label={`Adjust ${handle.name}`}
          onPointerDown={(e) => startDrag(e, handle.index)}
          style={{ left: `${scale(handle.at)}%` }}
          className="group absolute top-0 -ml-2 grid h-full w-4 cursor-ew-resize place-items-center"
        >
          <span className="h-4 w-[3px] rounded-full bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] transition-all group-hover:h-6 group-hover:bg-white" />
        </div>
      ))}
    </div>
  );
}
