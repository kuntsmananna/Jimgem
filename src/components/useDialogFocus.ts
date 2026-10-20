"use client";

import { useCallback, useEffect, type KeyboardEvent } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus for a popup (`Modal`, `Sheet`), so it can be used from a keyboard.
 *
 * Three things a dialog owes someone who is not using a mouse, all
 * missing until v0.87: focus moves **into** it when it opens (unless
 * something inside has already taken it — an `autoFocus` field), Tab
 * **stays inside** it rather than walking the page behind the veil, and
 * focus goes **back** to whatever opened it when it closes, so the next
 * Tab continues from the row that was being worked rather than from the
 * top of the page.
 *
 * The trap only acts on a Tab whose target is inside this box: a `Sheet`
 * opened from inside a `Modal` portals out of it, but React still bubbles
 * its key events up through the Modal, which would otherwise pull focus
 * out of the sheet and back into the form underneath.
 */
export function useDialogFocus(box: HTMLElement | null) {
  useEffect(() => {
    if (!box) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [box]);

  return useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !box || !(event.target instanceof Node) || !box.contains(event.target)) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (event.shiftKey && (at === first || at === box)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && at === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [box],
  );
}
