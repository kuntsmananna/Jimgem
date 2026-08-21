"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayDismiss } from "./useOverlayDismiss";

/**
 * The empty middle of the modal's title row, offered to whatever is
 * inside the modal.
 *
 * Held as state rather than a ref so a consumer re-renders once the slot
 * exists — a ref would still be null on the first pass and the portal
 * would never mount.
 */
const HeaderSlot = createContext<HTMLElement | null>(null);

/**
 * The title row's centre, for a control that belongs beside the title
 * rather than below it — the order form's tabs, which cost a whole row of
 * their own inside an already tall dialog.
 *
 * Null when the content isn't in a `Modal` at all, so callers must have a
 * sensible inline fallback rather than assuming the slot is there.
 */
export function useModalHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlot);
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useOverlayDismiss(onClose);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        /*
          A wide dialog takes 80% of the viewport rather than a fixed
          64rem. The order form outgrew that: three tabs and a money rail
          need the room, and on a 1680px laptop a 1024px popup was leaving
          a third of the screen dimmed for no reason. It stays a popup —
          the page behind it is still what you came from — just one that
          uses the screen it is given.
        */
        className={`max-h-[90vh] w-full ${wide ? "max-w-[80vw]" : "max-w-lg"} overflow-y-auto rounded-card border border-line bg-card p-6 shadow-xl`}
      >
        {/*
          Title and close both take equal space so whatever sits in the
          slot is centred on the dialog, not on the gap left over after a
          title of whatever length.
        */}
        <div className="flex items-center gap-4">
          <h2 className="flex-1 truncate font-display text-lg font-bold text-ink">{title}</h2>
          <div ref={setSlot} className="flex shrink-0 items-center" />
          <div className="flex flex-1 justify-end">
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full px-2 py-1 text-lg font-semibold text-ink-soft hover:bg-black/5 hover:text-ink"
            >
              ×
            </button>
          </div>
        </div>
        <div className="mt-4">
          <HeaderSlot.Provider value={slot}>{children}</HeaderSlot.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
