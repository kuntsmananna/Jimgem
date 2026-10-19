"use client";

import { eventType, orderTypeIconElement } from "@/lib/icons";
import { useOrderType } from "@/components/OrderTypesContext";

/**
 * The customer/event type as an icon + label pill. Shared by the Orders
 * table, the order popup, the Kanban/calendar hover cards and the
 * Dashboard's list — the four had drifted to different text sizes when
 * each kept its own copy.
 *
 * Renders nothing for a blank type, so callers that need the row to keep
 * its shape should reserve the space themselves via `className`.
 */
/**
 * Words a phone card writes shorter (v0.81). The card's first line is the
 * customer's name and two chips, and every pixel a chip gives back goes to
 * the name — "Production company" alone took a third of the line. Matched
 * by the label's first word, so a renamed type keeps its abbreviation, and
 * the full name stays in the chip's title.
 */
const SHORT_FIRST_WORDS: Record<string, string> = {
  production: "Prod.",
};

function shortLabel(label: string): string {
  const first = label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return SHORT_FIRST_WORDS[first] ?? label;
}

export function EventTypeChip({
  value,
  className = "",
  short = false,
}: {
  value: string;
  className?: string;
  /** Abbreviate the label — the phone card, where the name wants the room. */
  short?: boolean;
}) {
  /**
   * From Settings → Order types, matched by name. Undefined for a value
   * that isn't on the list — a Sheet import can write anything — and the
   * chip then falls back to the neutral tint and the built-in icon guess.
   */
  const type = useOrderType(value);
  const fallback = eventType(value);
  if (!fallback) return null;

  // The owner's chosen icon wins; lib/icons.ts's guess covers the types
  // that came from the Sheet before the list existed.
  const icon = type ? orderTypeIconElement(type.icon, 11) : <fallback.Icon size={11} />;

  // keeps-color when it carries a real fill (the colour *is* the
  // information), chip-neutral when it's the tint-of-surface fallback, so
  // that one still inverts with a hovered line. See globals.css.
  const base =
    "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink";
  return (
    <span
      title={fallback.label}
      className={`${type ? "keeps-color" : "chip-neutral bg-black/[0.06]"} ${base} ${className}`}
      style={type ? { background: type.color } : undefined}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{short ? shortLabel(fallback.label) : fallback.label}</span>
    </span>
  );
}
