"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 8;

/**
 * Places the card beside the hovered element, flipping to its other side
 * rather than running off the edge — the Kanban's right-hand column, the
 * calendar's Saturday cell and the Orders table's rightmost columns all
 * sit against the viewport edge.
 *
 * `height` is an estimate used only to stop a tall card hanging off the
 * bottom. It cannot be measured before the card exists, and measuring
 * after would cost a second paint to move it.
 */
function position(rect: DOMRect, width: number, height: number): { left: number; top: number } {
  const fitsRight = rect.right + GAP + width <= window.innerWidth - GAP;
  const left = fitsRight ? rect.right + GAP : Math.max(GAP, rect.left - GAP - width);
  const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - height - GAP));
  return { left, top };
}

/**
 * Shows a floating card while its child is hovered.
 *
 * Rendered through a portal at fixed coordinates rather than as an
 * absolutely-positioned child, so it is never clipped by, or stacked
 * under, the cell or column it belongs to.
 *
 * `render` is a function, not a node: the Orders table mounts one of these
 * per row, and building seventy hidden cards to show one would do the work
 * seventy times over.
 */
export function HoverCard({
  width,
  height,
  className = "",
  render,
  children,
}: {
  width: number;
  /** Rough tallest height, for keeping the card on screen. */
  height: number;
  className?: string;
  render: () => ReactNode;
  children: ReactNode;
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  return (
    <div
      className={className}
      onMouseEnter={(e) => setAt(position(e.currentTarget.getBoundingClientRect(), width, height))}
      onMouseLeave={() => setAt(null)}
    >
      {children}

      {at !== null &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: at.left, top: at.top, width }}
            className="motion-fade pointer-events-none fixed z-50 rounded-card border border-line bg-card p-4 shadow-xl"
          >
            {render()}
          </div>,
          document.body,
        )}
    </div>
  );
}
