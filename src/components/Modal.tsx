"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-card border border-line bg-card p-6 shadow-xl`}
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
