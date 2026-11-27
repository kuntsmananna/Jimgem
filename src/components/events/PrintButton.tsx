"use client";

import { Printer } from "lucide-react";

/** Print the page — the signs sheet's one control (v0.102). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="press flex h-10 items-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-cream"
    >
      <Printer size={16} aria-hidden />
      Print
    </button>
  );
}
