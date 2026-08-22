"use client";

import { Info } from "lucide-react";
import { HoverCard } from "@/components/HoverCard";

/**
 * A small (i) beside a control, explaining what it does.
 *
 * For the buttons whose consequence isn't visible from their label —
 * "Sync now" says nothing about what is read, from where, or what it
 * costs. The note belongs next to the button rather than in the pane's
 * description, which is read once and then never again.
 *
 * The text is also the button's accessible name, so it is not lost to
 * anyone who never hovers: `HoverCard` shows on mouse enter alone, and a
 * tooltip nobody can reach is a tooltip that isn't there.
 *
 * Colour comes from whatever it sits in — `currentColor` at 60% — so the
 * same tip works in a header band and on a cream card.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <HoverCard
      width={280}
      height={150}
      className="flex shrink-0 items-center"
      render={() => <p className="text-xs leading-relaxed text-ink-soft">{text}</p>}
    >
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="rounded-full p-0.5 opacity-60 transition hover:opacity-100"
      >
        <Info size={14} />
      </button>
    </HoverCard>
  );
}
