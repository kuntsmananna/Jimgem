"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Radar } from "lucide-react";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import type { SumitUsage } from "@/lib/sumitBudget";

/**
 * Runs the read-only SUMIT probe and shows its report. Deliberately a raw
 * text block rather than a designed panel: it is throwaway scaffolding for
 * designing the integration, meant to be read once and copied out, and a
 * fixed-width report survives that trip where a laid-out one wouldn't.
 */
export function SumitProbePanel({ usage }: { usage: SumitUsage }) {
  // The meter governs the probe too, not just the sync. It is the heavier
  // spender of the two, so a live button at 225/225 would promise a report
  // that `sumitPost` refuses on its first call and throws away.
  const spent = usage.available && usage.used >= usage.budget;
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runProbe() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/sumit/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Probe failed.");
      else setReport(body.report as string);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function copyReport() {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader
        title={
          <span className="flex items-center gap-2">
            SUMIT probe
            {/* The one control in Settings that can spend most of a month's
                API budget in a single press, so it says so before it is
                pressed rather than in the meter afterwards. */}
            <span className="rounded-full bg-tile-peach px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-ink uppercase">
              Advanced only
            </span>
          </span>
        }
        description={<>Reconnaissance for designing the integration. Read-only, and it goes away once that is built.</>}
        action={<button
          onClick={runProbe}
          disabled={busy || spent}
          className={`flex items-center gap-2 ${PANE_ACTION_CLASS} disabled:opacity-60`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
          {busy ? "Reading SUMIT…" : "Run SUMIT probe"}
        </button>}
      />
      <p className="mt-1 text-xs text-ink-soft">
        Looks at what SUMIT holds — documents, customers, expenses by month — and lines it up against the orders here.
        Read-only: nothing is written to SUMIT or to this database. It exists to design the integration, and goes away
        once that&apos;s built.
      </p>

      {/* Stated as a cost, not as a scolding: the number is what makes the
          warning act on anyone, and it is the reason August went over. */}
      <p className="mt-3 rounded-xl bg-tile-peach px-3 py-2 text-xs font-medium text-ink">
        <span className="font-bold">Don&apos;t press this in normal use.</span> One run spends about 30 of the month&apos;s
        250 SUMIT calls, and repeated runs are most of why August went over. It answers questions about the integration&apos;s
        design, not about the business — nothing here changes what the app shows.
      </p>

      {spent && (
        <p className="mt-2 text-[11px] font-semibold text-red-700">
          The month&apos;s call budget is spent, so the probe is paused until the 1st.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">

        {report && (
          <button
            onClick={copyReport}
            className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy report"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}

      {report && (
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl bg-black/90 p-4 text-[11px] leading-relaxed text-cream">
          {report}
        </pre>
      )}
    </section>
  );
}
