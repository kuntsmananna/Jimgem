"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useOverlayDismiss } from "./useOverlayDismiss";

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
  children,
}: {
  /** Omitted where the sheet's own first row already says what it is. */
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useOverlayDismiss(onClose);

  return createPortal(
    <div
      className="motion-veil fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="motion-rise max-h-[85dvh] w-full overflow-y-auto rounded-t-card border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {title !== undefined && (
          <div className="flex items-center gap-3 px-5 py-4">
            <h2 className="flex-1 truncate font-display text-base font-bold">{title}</h2>
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
