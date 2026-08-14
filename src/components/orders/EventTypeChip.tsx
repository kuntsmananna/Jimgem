"use client";

import { eventType } from "@/lib/icons";
import { useOrderTypeColor } from "@/components/OrderTypesContext";

/**
 * The customer/event type as an icon + label pill. Shared by the Orders
 * table, the details pane and the Dashboard's Latest orders list — the
 * three had drifted to different text sizes when each kept its own copy.
 *
 * Renders nothing for a blank type, so callers that need the row to keep
 * its shape should reserve the space themselves via `className`.
 */
export function EventTypeChip({ value, className = "" }: { value: string; className?: string }) {
  /**
   * From Settings → Order types, matched by name. Undefined for a value
   * that isn't on the list — a Sheet import can write anything — and the
   * chip then falls back to the neutral tint it always had.
   */
  const color = useOrderTypeColor(value);
  const type = eventType(value);
  if (!type) return null;
  const { label, Icon } = type;

  // keeps-color when it carries a real fill (the colour *is* the
  // information), chip-neutral when it's the tint-of-surface fallback, so
  // that one still inverts with a hovered line. See globals.css.
  const base = "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink";
  return (
    <span
      title={label}
      className={`${color ? "keeps-color" : "chip-neutral bg-black/[0.06]"} ${base} ${className}`}
      style={color ? { background: color } : undefined}
    >
      <Icon size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
