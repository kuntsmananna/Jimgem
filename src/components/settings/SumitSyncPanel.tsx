"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

interface SyncResult {
  documents: number;
  revenueDetailed: number;
  clientsLinked: number;
  from: string;
  to: string;
}

/**
 * Pulls SUMIT's documents into the local mirror.
 *
 * Manual here, nightly on a schedule. SUMIT has no usable webhook — its
 * trigger API is CRM-folder based, built for Make and Zapier — so a pull is
 * the only way to notice a document, and this button is what makes "I just
 * issued an invoice" instant instead of tomorrow.
 */
export function SumitSyncPanel({ lastSync, documentCount }: { lastSync: string | null; documentCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(windowDays?: number) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/sumit/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(windowDays ? { windowDays } : {}),
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Sync failed.");
      else {
        setResult(body as SyncResult);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <h2 className="font-display text-base font-bold text-ink">SUMIT documents</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Invoices, receipts and payment requests, copied here so clients and orders can show them. Nothing is ever
        written to SUMIT. {documentCount > 0 ? `${documentCount} on file` : "Nothing synced yet"}
        {lastSync ? `, last synced ${new Date(lastSync).toLocaleString()}` : ""}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run()}
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {busy ? "Syncing…" : "Sync now"}
        </button>
        {/* The routine sync looks back 90 days. Everything is for the first
            run, and for the rare case of a document backdated past that. */}
        <button
          onClick={() => run(3650)}
          disabled={busy}
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        >
          Sync everything
        </button>
      </div>

      {result && (
        <p className="mt-3 text-xs font-semibold text-ink">
          {result.documents} documents from {result.from} to {result.to}.
          <span className="font-medium text-ink-soft">
            {" "}
            {result.revenueDetailed} priced with VAT detail
            {result.clientsLinked > 0 && `, ${result.clientsLinked} clients linked to SUMIT by name`}.
          </span>
        </p>
      )}
      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
    </section>
  );
}
