"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat } from "lucide-react";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import type { RecurringSummary, RollForwardResult } from "@/lib/recurringExpenses";
import { currencyExact as currency } from "@/lib/money";

/**
 * What repeats every month, and the button that books it now.
 *
 * The rows appear on their own — the nightly cron rolls every series
 * forward — so this pane exists for the two moments that schedule cannot
 * serve: the first one, where marking rent recurring in the middle of a
 * month should not mean waiting until tomorrow to see anything happen, and
 * the one where the cron did not run and somebody needs to say so.
 *
 * It sits in Data beside the Sheet import and the SUMIT sync because it is
 * the same kind of thing: a job over the ledger, run on a schedule, with a
 * button for running it by hand.
 *
 * Pressing it twice writes nothing the second time. That is a property of
 * the database rather than of this button — see recurringExpenses.ts.
 */
export function RecurringPanel({ summary }: { summary: RecurringSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RollForwardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/expenses/recurring", { method: "POST" });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Couldn't book them.");
      else {
        setResult(body as RollForwardResult);
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
        title="Repeating expenses"
        description={
          <>Rent, insurance, the accountant — booked into each new month on their own, overnight.</>
        }
        action={
          <button
            onClick={run}
            disabled={busy || summary.series === 0}
            className={`flex items-center gap-2 ${PANE_ACTION_CLASS} disabled:opacity-60`}
            title={
              summary.series === 0
                ? "Nothing repeats yet — tick Monthly on an expense first"
                : "Write any months these are missing, now"
            }
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
            {busy ? "Booking…" : "Book this month"}
          </button>
        }
      />

      {summary.series === 0 ? (
        <p className="text-xs text-ink-soft">
          Nothing repeats yet. Open an expense and set <span className="font-semibold">Repeats</span>{" "}
          to Monthly, and it will be booked into every month from then on.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          <span className="font-semibold text-ink">
            {summary.series} {summary.series === 1 ? "cost repeats" : "costs repeat"}
          </span>{" "}
          every month, coming to{" "}
          <span className="font-semibold text-ink tabular-nums">{currency(summary.total)}</span> as
          charged ({currency(summary.netTotal)} before VAT). Each one lands on the same day of the
          month as the expense it was marked on.
        </p>
      )}

      {result && (
        <p className="mt-3 text-xs font-semibold text-ink">
          {result.created === 0
            ? "Nothing to book — every month already has its rows."
            : `${result.created} ${result.created === 1 ? "expense" : "expenses"} booked into ${result.months.join(", ")}.`}
        </p>
      )}
      {/*
        The refusal, said out loud. A series whose newest row is more than
        three months back is not booked at all — writing the gap would put
        a year of rent into months that already have their own — and a
        refusal nobody is told about is indistinguishable from a bug.
      */}
      {result && result.tooFarBack.length > 0 && (
        <p className="mt-2 rounded-xl bg-tile-peach/60 px-3 py-2 text-[11px] text-ink">
          {result.tooFarBack.length === 1 ? "One repeating cost was" : `${result.tooFarBack.length} repeating costs were`}{" "}
          left alone: the newest one is from {result.tooFarBack.join(", ")}, too far back to fill in
          without risking a month that already has it. Add this month&apos;s by hand and tick
          Monthly on that one instead.
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
