"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";

/**
 * How long the offer stands.
 *
 * Long enough to notice a mistake and reach the mouse, short enough that
 * the bar isn't still sitting there when you have moved on to something
 * else. It only ever hides the offer — the row itself stays recoverable in
 * the database, so nothing is lost when this runs out.
 */
const LINGER_MS = 12_000;

interface Offer {
  message: string;
  undo: () => Promise<void> | void;
}

/**
 * "Deleted — Undo", for the one action in the app that can't be reached
 * again through the screen it happened on.
 *
 * A bar rather than a confirmation dialog in front of the delete: a
 * confirm asks everyone to prove they meant it every time, and is clicked
 * through without reading by the second week. This asks nothing, and is
 * there for the one time in fifty that the click was wrong.
 */
export function useUndoToast() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOffer(null);
  }, []);

  const show = useCallback(
    (message: string, undo: Offer["undo"]) => {
      if (timer.current) clearTimeout(timer.current);
      setOffer({ message, undo });
      timer.current = setTimeout(() => setOffer(null), LINGER_MS);
    },
    [],
  );

  // A pending timer on an unmounted page would fire into nothing; clearing
  // it also stops React warning about the state update behind it.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { offer, show, dismiss };
}

export function UndoToast({ offer, onDismiss }: { offer: Offer | null; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  if (offer === null) return null;

  return createPortal(
    // Portalled and fixed, like HoverCard: the bar belongs to the page, not
    // to the table row that raised it — which by then has been removed.
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-cream shadow-xl"
    >
      <span className="text-xs font-semibold whitespace-nowrap">{offer.message}</span>
      <button
        onClick={async () => {
          setBusy(true);
          await offer.undo();
          setBusy(false);
          onDismiss();
        }}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink transition hover:bg-cream/85 disabled:opacity-60"
      >
        <Undo2 size={13} />
        {busy ? "Undoing…" : "Undo"}
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full p-1 opacity-60 transition hover:opacity-100"
      >
        <X size={13} />
      </button>
    </div>,
    document.body,
  );
}
