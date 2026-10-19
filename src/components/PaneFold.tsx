"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";

/*
 * A side pane that folds away to a narrow rail and back — the Expenses
 * page's periods and charts, and the Orders page's figures. The choice is
 * kept in a cookie by each page, so the server paints it folded or open
 * from the start (see `paneFolds.ts`).
 */

/** How wide a folded pane's rail is. */
export const RAIL_WIDTH = "2.5rem";

/**
 * A folded pane, still on the page.
 *
 * The whole rail is the button that brings it back, and it carries the
 * pane's name turned on its side: a bare arrow says something is hidden
 * without saying what. Expenses' periods rail says which period is
 * showing, which is the one thing that pane was answering while it was
 * open.
 *
 * The label reads bottom-to-top (`vertical-rl` turned 180°), the way a
 * book spine does.
 */
export function PaneRail({
  label,
  side,
  onExpand,
}: {
  label: string;
  /** Which flank it sits on — the arrow points back out toward the pane. */
  side: "left" | "right";
  onExpand: () => void;
}) {
  const Arrow = side === "left" ? ChevronsRight : ChevronsLeft;
  return (
    <button
      onClick={onExpand}
      title={`Show ${label}`}
      aria-label={`Show ${label}`}
      // Its own width, so a rail is the same on a page that lays it out in
      // a grid track (Expenses) and one that does not (Orders' aside, where
      // it would otherwise shrink to the width of its arrow).
      style={{ width: RAIL_WIDTH }}
      className="flex min-w-0 flex-col items-center gap-3 rounded-card border border-line bg-card py-3 text-ink-soft transition hover:bg-black/5 hover:text-ink"
    >
      <Arrow size={15} />
      <span
        className="truncate text-[11px] font-bold tracking-[0.14em] uppercase"
        style={{ writingMode: "vertical-rl", rotate: "180deg" }}
      >
        {label}
      </span>
    </button>
  );
}

/** The fold control inside an open pane, pointing at the edge it folds to. */
export function FoldButton({
  side,
  title,
  onClick,
}: {
  side: "left" | "right";
  title: string;
  onClick: () => void;
}) {
  const Arrow = side === "left" ? ChevronsLeft : ChevronsRight;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-full p-1 text-ink-soft transition hover:bg-black/5 hover:text-ink"
    >
      <Arrow size={15} />
    </button>
  );
}
