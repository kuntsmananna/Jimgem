"use client";

import { eventType } from "@/lib/icons";

/**
 * The customer/event type as an icon + label pill. Shared by the Orders
 * table, the details pane and the Dashboard's Latest orders list — the
 * three had drifted to different text sizes when each kept its own copy.
 *
 * Renders nothing for a blank type, so callers that need the row to keep
 * its shape should reserve the space themselves via `className`.
 */
export function EventTypeChip({ value, className = "" }: { value: string; className?: string }) {
  const type = eventType(value);
  if (!type) return null;
  const { label, Icon } = type;
  return (
    <span
      title={label}
      className={`flex w-fit items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink ${className}`}
    >
      <Icon size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
