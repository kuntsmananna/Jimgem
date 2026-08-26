"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCoarsePointer } from "./useMediaQuery";
import { usePopoverDismiss } from "./useOverlayDismiss";

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
/**
 * On a device with no hover, the same card opens on a tap.
 *
 * Without it these cards are simply unreachable, and they are not
 * decoration: `ContentHoverCard` holds an order's whole flavour
 * breakdown, `OrderHoverCard` holds the money that the Kanban card and
 * the calendar pill deliberately leave out, and `InfoTip` holds the only
 * statement of what a metered SUMIT call costs.
 *
 * Gated on the pointer, so on a mouse this branch does not exist and the
 * desktop behaviour is exactly what it was. Where a tapped child has its
 * own click — a Kanban card opens its order — both still happen; that is
 * tolerable because those two surfaces are not offered on a phone, and
 * fixing it properly means the card growing a dismiss affordance of its
 * own.
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
  const coarse = useCoarsePointer();
  const anchor = useRef<HTMLDivElement | null>(null);
  // The next tap anywhere else puts it away — the card itself is
  // `pointer-events-none`, so it cannot dismiss itself.
  usePopoverDismiss(coarse && at !== null, anchor, () => setAt(null));

  return (
    <div
      ref={anchor}
      className={className}
      onMouseEnter={(e) => {
        if (coarse) return;
        setAt(position(e.currentTarget.getBoundingClientRect(), width, height));
      }}
      onMouseLeave={() => {
        if (!coarse) setAt(null);
      }}
      onClick={(e) => {
        if (!coarse) return;
        setAt((open) =>
          open ? null : position(e.currentTarget.getBoundingClientRect(), width, height),
        );
      }}
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
