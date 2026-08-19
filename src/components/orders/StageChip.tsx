"use client";

import { useStage } from "@/components/ProductionStagesContext";

/**
 * A production stage as a read-only chip, for the places that show an
 * order without editing it — the Kanban and calendar hover cards.
 *
 * Square-ish rather than a pill, and wearing the stage's own colour: the
 * table's Status cell is the same shape, so a stage reads as a different
 * kind of thing from the payment badge and the event-type chip beside it,
 * both of which are pills.
 *
 * `keeps-color` because the fill is the information — recoloured to the
 * cream text of a hovered black row, the chip would disappear.
 */
export function StageChip({ stageKey }: { stageKey: string }) {
  const stage = useStage(stageKey);

  return (
    <span
      className={`keeps-color rounded-md px-2 py-0.5 text-[11px] font-bold text-ink ${
        stage?.countsAsIncome === false ? "outline-1 outline-dashed outline-ink/35" : ""
      }`}
      style={{ background: stage?.color ?? "var(--color-line)" }}
    >
      {/* A stage removed from the list falls back to its stored key, so an
          order is never left with a blank where its status should be. */}
      {stage?.label ?? stageKey}
    </span>
  );
}
