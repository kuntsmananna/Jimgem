"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, X } from "lucide-react";

/**
 * How long a notice stands. Longer than the Undo bar's offer is short:
 * this one says something went wrong, and it has to be read to be useful —
 * but it is never the only record, since every caller leaves the thing it
 * failed to change exactly as it was.
 */
const LINGER_MS = 10_000;

let current: { id: number; message: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function clear() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

/**
 * Says that something failed, in the app's own voice.
 *
 * It replaced `alert()`, which stopped the page dead behind a grey browser
 * box — on a phone, one that names the site's address above the message —
 * for what is usually a dropped connection and a "try again". A
 * module-level store rather than a context, because the callers are event
 * handlers spread over a dozen components, and threading a `notify` prop
 * to each would touch every one of them for one line. The newest message
 * replaces the last: two failures in a row are almost always the same one.
 */
export function notify(message: string) {
  if (timer) clearTimeout(timer);
  current = { id: ++nextId, message };
  timer = setTimeout(clear, LINGER_MS);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The one place notices are drawn, mounted once in the app layout. Above
 * the page and centred at the top — the Undo bar owns the bottom edge, and
 * the two can be up at once when an undo itself fails.
 */
export function Notices() {
  const notice = useSyncExternalStore(subscribe, () => current, () => null);
  if (notice === null) return null;

  return createPortal(
    // Centred by a full-width row rather than `-translate-x-1/2`, because
    // the entrance animates `transform` and would throw that off for its
    // first frames.
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex justify-center">
      <div
        key={notice.id}
        role="alert"
        className="motion-drop pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl bg-ink py-2.5 pr-2 pl-4 text-cream shadow-xl"
      >
        <CircleAlert size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
        <span className="text-sm font-semibold">{notice.message}</span>
        <button onClick={clear} aria-label="Dismiss" className="shrink-0 rounded-full p-1 opacity-70 transition hover:opacity-100">
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
