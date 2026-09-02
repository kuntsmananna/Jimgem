"use client";

import { useEffect, useRef } from "react";

/** How many overlays are currently open. */
let openCount = 0;

/** Where the page was when the first of them opened. */
let lockedAt = 0;

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
    /*
     * `overflow: hidden` alone holds the page on a desktop and does
     * nothing on iOS Safari, where the page behind an overlay still
     * rubber-band scrolls — and, having scrolled, is back at the top when
     * the overlay closes. Taking the body out of flow is what actually
     * stops it, and it costs the scroll position, so that is saved and
     * restored. Only the outermost overlay does either: the count exists
     * because overlays nest, and an inner one restoring the position
     * would scroll the page while the outer is still open.
     */
    if (openCount === 0) {
      lockedAt = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockedAt}px`;
      document.body.style.insetInline = "0";
    }
    openCount += 1;

    /*
     * Escape closes the *innermost* overlay only. Overlays nest — the
     * order form's money sheet opens inside its modal — and both listen
     * on `document`, where neither `stopPropagation` nor listener order
     * helps: the outer one registered first, so it would fire first and
     * close the form out from under the sheet, unsaved-changes prompt and
     * all. Comparing this overlay's depth against the live count is what
     * decides, and it needs no coordination between them.
     */
    const depth = openCount;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && depth === openCount) handler.current();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount === 0) {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.insetInline = "";
        // Instant, not smooth: this is putting the page back where it
        // already was, not travelling anywhere.
        window.scrollTo({ top: lockedAt, behavior: "instant" });
      }
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
    const onPointerDown = (e: PointerEvent) => {
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
    // `pointerdown`, not `mousedown`: a touch only produces a mouse event
    // as a delayed compatibility gesture, and not at all when the tap is
    // consumed by a scroll — so on a phone the popover stayed open.
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, ref]);
}
