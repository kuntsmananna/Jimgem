"use client";

import { createPortal } from "react-dom";
import { useOverlayDismiss } from "./useOverlayDismiss";

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[90vh] w-full ${wide ? "max-w-5xl" : "max-w-lg"} overflow-y-auto rounded-card border border-line bg-card p-6 shadow-xl`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-lg font-semibold text-ink-soft hover:bg-black/5 hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
