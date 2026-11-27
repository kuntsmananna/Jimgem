"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { JellyHop } from "@/components/JellyLoader";

/**
 * The proof screen's live clock (v0.102): a screenshot of a paid screen
 * shows a frozen time, so a clock that ticks is what tells the staff it
 * is the real page. Seconds included for the same reason.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {now ? now.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"}
    </span>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * "Staff: tap once handed over." Once tapped the screen says when, so the
 * same proof shown again — or passed to a friend — reads as collected.
 */
export function HandOverButton({
  token,
  handedAt,
  label,
  note,
  doneLabel,
  onHanded,
}: {
  token: string;
  handedAt: string | null;
  label: string;
  note: string;
  /** With `{time}` where the time goes — a function cannot cross from the server. */
  doneLabel: string;
  /** Called once the tap is saved — the proof then gives way to the thank-you. */
  onHanded?: () => void;
}) {
  const [at, setAt] = useState(handedAt);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const tap = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/pay/${token}/handed`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { handedAt?: string };
      if (!response.ok || !body.handedAt) throw new Error();
      setAt(body.handedAt);
      onHanded?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (at) {
    return (
      <p className="motion-pop mt-4 flex h-14 items-center justify-center gap-2 rounded-full bg-band text-[17px] font-bold">
        <Check size={18} strokeWidth={2.5} aria-hidden />
        {doneLabel.replace("{time}", timeOf(at))}
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={tap}
        disabled={busy}
        className="press mt-4 flex h-14 w-full items-center justify-center rounded-full bg-black text-[17px] font-bold text-cream"
      >
        {busy ? <JellyHop /> : label}
      </button>
      <p className={`mt-2 text-center text-xs leading-relaxed ${failed ? "text-red-700" : "text-ink-soft"}`}>{note}</p>
    </>
  );
}
