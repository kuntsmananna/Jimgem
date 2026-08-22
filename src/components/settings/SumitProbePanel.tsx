"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Radar } from "lucide-react";

/**
 * Runs the read-only SUMIT probe and shows its report. Deliberately a raw
 * text block rather than a designed panel: it is throwaway scaffolding for
 * designing the integration, meant to be read once and copied out, and a
 * fixed-width report survives that trip where a laid-out one wouldn't.
 */
export function SumitProbePanel() {
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
      <h2 className="font-display text-base font-bold text-ink">SUMIT</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Looks at what SUMIT holds — documents, customers, expenses by month — and lines it up against the orders here.
        Read-only: nothing is written to SUMIT or to this database. It exists to design the integration, and goes away
        once that&apos;s built.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={runProbe}
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
          {busy ? "Reading SUMIT…" : "Run SUMIT probe"}
        </button>

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
