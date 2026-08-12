"use client";

import { useEffect } from "react";

/** How many overlays are currently open. */
let openCount = 0;

/**
 * Escape-to-close plus a page scroll lock, shared by every overlay
 * (Modal, OrderDetailsPane).
 *
 * The lock is reference-counted rather than set-and-clear: overlays nest
 * — the details pane hosts the order form, which can open a modal — and
 * two independent implementations meant the inner one restored
 * `overflow` on unmount while the outer was still open, letting the page
 * behind it scroll.
 */
export function useOverlayDismiss(onDismiss: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);

    openCount += 1;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = "";
    };
  }, [onDismiss]);
}
