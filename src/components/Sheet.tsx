"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useOverlayDismiss } from "./useOverlayDismiss";

/** How far a sheet has to be pulled before letting go closes it, in px. */
const DISMISS_PULL = 90;

/**
 * A panel from the bottom edge of a phone.
 *
 * The `Modal` beside it is a centred dialog, which is right for a record
 * you have opened and wrong for a menu or a set of controls: those are
 * reached from the bottom of the screen and belong there, within a thumb's
 * travel. The two share `useOverlayDismiss`, so Escape, the body scroll
 * lock and the nesting count behave identically.
 *
 * Portalled, like `Modal`, so a sheet opened from inside a scrolling list
 * is not clipped by it. `md:hidden` is deliberately *not* here — a caller
 * decides whether it is mobile-only, and every caller so far renders one
 * only below the breakpoint anyway.
 */
export function Sheet({
  title,
  onClose,
  tone = "cream",
  children,
}: {
  /** Omitted where the sheet's own first row already says what it is. */
  title?: string;
  onClose: () => void;
  /**
   * `ink` for a sheet that is part of the app's chrome — the nav's More,
   * which is the bottom bar opened up and wears the bar's black. `cream`
   * for one holding controls over the page's own content, like the Orders
   * filters, which belongs to the page rather than to the frame.
   */
  tone?: "cream" | "ink";
  children: React.ReactNode;
}) {
  useOverlayDismiss(onClose);
  /*
   * Pulling a sheet down by its body closes it (v0.80), the way every
   * sheet on a phone does — the grabber says so, and a sheet only an X
   * could close was the one thing in the app a thumb could not throw away.
   *
   * Only from the top of its own scroll: a sheet longer than the screen
   * scrolls first and pulls only once it is back at the top, or reading
   * down a list and up again would close it. Written to the element rather
   * than through state, since it moves on every touch event; a pull short
   * of `DISMISS_PULL` springs back.
   */
  const panel = useRef<HTMLDivElement>(null);
  const pull = useRef<{ from: number | null; by: number }>({ from: null, by: 0 });

  function settle(close: boolean) {
    const el = panel.current;
    const by = pull.current.by;
    pull.current = { from: null, by: 0 };
    if (!el) return;
    if (close && by > DISMISS_PULL) {
      el.style.transition = "transform 180ms ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(onClose, 170);
    } else {
      el.style.transition = "transform 220ms var(--ease-entrance)";
      el.style.transform = "";
    }
  }

  return createPortal(
    <div
      className="motion-veil fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        onTouchStart={(event) => {
          pull.current = { from: (panel.current?.scrollTop ?? 1) <= 0 ? event.touches[0]!.clientY : null, by: 0 };
        }}
        onTouchMove={(event) => {
          const el = panel.current;
          const from = pull.current.from;
          if (from === null || !el) return;
          const dy = event.touches[0]!.clientY - from;
          if (dy <= 0 || el.scrollTop > 0) {
            pull.current.by = 0;
            el.style.transform = "";
            return;
          }
          pull.current.by = dy;
          el.style.transition = "none";
          // Resisting a little as it goes, like a sheet held by its top edge.
          el.style.transform = `translateY(${dy * 0.85}px)`;
        }}
        onTouchEnd={() => settle(true)}
        onTouchCancel={() => settle(false)}
        className={`motion-sheet max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-card border-t pb-[env(safe-area-inset-bottom)] ${
          tone === "ink" ? "on-ink border-cream/15" : "border-line bg-card"
        }`}
      >
        {/* The grabber: says the sheet can be pulled down, which it can. */}
        <div aria-hidden className="flex justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-current opacity-20" />
        </div>
        {title !== undefined && (
          <div className="flex items-center gap-3 px-5 pt-1 pb-3">
            <h2 className="flex-1 truncate font-display text-lg font-bold">{title}</h2>
            <SheetClose onClose={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The close button, exported so a sheet that builds its own first row —
 * the nav's, which puts an avatar and a name there — uses the same one.
 */
export function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft"
    >
      <X size={18} />
    </button>
  );
}
