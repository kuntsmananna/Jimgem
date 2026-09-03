"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import type { SumitUsage } from "@/lib/sumitBudget";
import { InfoTip } from "@/components/InfoTip";

interface SyncResult {
  documents: number;
  revenueDetailed: number;
  detailsDeferred: number;
  detailsFailed: number;
  clientsLinked: number;
  callsUsed: number;
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
export function SumitSyncPanel({
  lastSync,
  documentCount,
  usage,
}: {
  lastSync: string | null;
  documentCount: number;
  /** This month's metered calls — see sumitBudget.ts. */
  usage: SumitUsage;
}) {
  const spent = usage.available && usage.used >= usage.budget;
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
      <PaneHeader
        title="SUMIT documents"
        description={<>Copied here so clients and orders can show them. Nothing is ever written to SUMIT.</>}
        action={
          <div className="flex items-center gap-2">
            <InfoTip
              label="Sync now"
              text="Reads the documents SUMIT issued in the last 30 days — and up to a year ahead, since invoices get dated forward — into Jimgem's copy, adding new ones and updating any that changed. One API call, plus one per invoice whose VAT breakdown has never been fetched."
            />
            <button
              onClick={() => run()}
              disabled={busy || spent}
              className={`flex items-center gap-2 ${PANE_ACTION_CLASS} disabled:opacity-60`}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        }
      />
      <p className="text-xs text-ink-soft">
        {documentCount > 0 ? `${documentCount} documents on file` : "Nothing synced yet"}
        {lastSync ? `, last synced ${new Date(lastSync).toLocaleString()}` : ""}.
      </p>

      {/*
        The meter, in the open. SUMIT's plan includes 250 calls a month and
        charges ₪0.09 past that — a limit nobody can see is one you find
        out about by exceeding it, which is exactly what happened in August.
      */}
      <div className="mt-4 flex flex-col gap-1.5">
        {/* The meter can only report what it has recorded. Until migration
            020 has been run against this database there is no log to read,
            and saying "0 of 225" would be a reassuring lie. */}
        {!usage.available ? (
          <p className="text-[11px] text-ink-soft">
            Calls aren&apos;t being counted yet — run{" "}
            <code className="font-semibold">scripts/migrate-020-sumit-call-log.sql</code> against
            the database and the meter appears here.
          </p>
        ) : (
        <>
        <div className="flex items-baseline justify-between text-xs max-md:flex-wrap max-md:gap-x-2">
          <span className="font-semibold text-ink">
            {usage.used} of {usage.budget} calls this month
          </span>
          <span className="text-ink-soft">
            plan allows {usage.limit}
            {usage.failed > 0 && ` · ${usage.failed} failed (they count too)`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full rounded-full transition-all ${spent ? "bg-red-700" : "bg-accent"}`}
            style={{ width: `${Math.min(100, (usage.used / usage.budget) * 100)}%` }}
          />
        </div>
        {spent && (
          <p className="text-[11px] font-semibold text-red-700">
            Budget spent — syncing is paused until the 1st. Calls past the plan cost ₪0.09 each.
          </p>
        )}
        </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* The routine sync looks back 30 days. Everything is for the first
            run, and for the rare case of a document backdated past that. */}
        <button
          onClick={() => run(3650)}
          disabled={busy || spent}
          className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft transition hover:bg-black/5 hover:text-ink disabled:opacity-60"
        >
          Sync everything
        </button>
        <InfoTip
          label="Sync everything"
          text="The same, reaching back ten years instead of thirty days. For the first run, or for a document dated before the routine window. It spends a call on every invoice never priced before, so it is not the one to press nightly."
        />
      </div>

      {result && (
        <p className="mt-3 text-xs font-semibold text-ink">
          {result.documents} documents from {result.from} to {result.to}, for {result.callsUsed}{" "}
          {result.callsUsed === 1 ? "call" : "calls"}.
          <span className="font-medium text-ink-soft">
            {" "}
            {result.revenueDetailed} newly priced with VAT detail
            {result.clientsLinked > 0 && `, ${result.clientsLinked} clients linked to SUMIT by name`}
            {result.detailsDeferred > 0 &&
              `. ${result.detailsDeferred} left without a breakdown — the budget ran out, they'll be picked up next run`}
            {result.detailsFailed > 0 &&
              `. ${result.detailsFailed} refused their breakdown — the call was spent, the next run tries again`}
            .
          </span>
        </p>
      )}
      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
    </section>
  );
}
