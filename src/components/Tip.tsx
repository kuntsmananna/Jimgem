"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { COARSE_POINTER, matchesNow } from "./useMediaQuery";
import { useCloseOnScroll } from "./useOverlayDismiss";

/**
 * A one-line label saying what a mark is, the moment the pointer arrives
 * (v0.78). For the Orders table's icons and figures — the type mark, each
 * extras slot, the amount still due — where a glyph alone is not enough
 * and the browser's own `title` takes a second to appear and is gone by the
 * time it is read.
 *
 * The lighter sibling of `HoverCard`: no width to state and nothing to
 * render lazily, just a short sentence centred above its trigger, below it
 * when there is no room above, and leaning in from whichever edge it would
 * otherwise run off. Portalled like `HoverCard`, so no cell clips it.
 *
 * Mouse only. On a touchscreen a tap on a row opens the order, and the
 * phone's cards spell these things out in words instead.
 */
export function Tip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [at, setAt] = useState<{ x: number; y: number; below: boolean; lean: "left" | "center" | "right" } | null>(
    null,
  );

  useCloseOnScroll(at !== null, () => setAt(null));

  return (
    <span
      className={className}
      onMouseEnter={(e) => {
        // Asked at the moment the pointer arrives rather than subscribed
        // to: the table mounts ten of these per row, and the answer only
        // matters here.
        if (matchesNow(COARSE_POINTER)) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const below = r.top < 56;
        const lean = x < 130 ? "left" : x > window.innerWidth - 130 ? "right" : "center";
        setAt({ x, y: below ? r.bottom + 7 : r.top - 7, below, lean });
      }}
      onMouseLeave={() => setAt(null)}
      // A press means the label has been read: it would otherwise sit over
      // the list or the field the press just opened.
      onPointerDown={() => setAt(null)}
    >
      {children}
      {at !== null &&
        createPortal(
          <span
            role="tooltip"
            style={{
              left: at.x,
              top: at.y,
              transform: `translate(${at.lean === "center" ? "-50%" : at.lean === "left" ? "-12px" : "calc(-100% + 12px)"}, ${
                at.below ? "0" : "-100%"
              })`,
            }}
            className="motion-fade pointer-events-none fixed z-50 w-max max-w-60 rounded-lg bg-black px-2.5 py-1.5 text-xs leading-snug text-cream shadow-[0_10px_24px_-10px_rgb(60_30_10/0.5)]"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
