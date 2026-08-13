"use client";

import { useEffect, useRef } from "react";

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
  /*
   * The callback is held in a ref so the effect can depend on nothing.
   * Callers now pass a guard that closes over "are there unsaved edits",
   * which is a different function on every render — as a dependency that
   * would tear down and re-run the whole effect on each keystroke,
   * cycling the scroll-lock count with it.
   */
  const handler = useRef(onDismiss);
  useEffect(() => {
    handler.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler.current();
    };
    document.addEventListener("keydown", onKey);

    openCount += 1;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = "";
    };
  }, []);
}
