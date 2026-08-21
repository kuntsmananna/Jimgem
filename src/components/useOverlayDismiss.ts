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

/**
 * Closes a popover on an outside click or Escape.
 *
 * The lighter half of the pair above: a popover is anchored to the
 * control that opened it and leaves the page usable behind it, so it
 * wants neither the scroll lock nor the nesting count — only the two
 * gestures that mean "I'm done with this".
 *
 * Shared by the Orders toolbar's dropdowns and the order form's preset
 * overflow list, which had grown two copies of the same effect.
 */
export function usePopoverDismiss(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const handler = useRef(onClose);
  useEffect(() => {
    handler.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) handler.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /*
       * Captured and stopped, not merely handled: the popover can be open
       * *inside* an overlay that also closes on Escape, and both listen on
       * `document`. Bubbling, the overlay's listener runs too and one
       * keystroke dismisses the preset list and the half-typed order
       * behind it. Capturing runs this first; stopping it keeps the
       * keystroke from ever reaching the overlay.
       */
      e.stopPropagation();
      handler.current();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, ref]);
}
