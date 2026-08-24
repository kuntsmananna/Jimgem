"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, DatabaseBackup, Download, Loader2 } from "lucide-react";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import { InfoTip } from "@/components/InfoTip";
import type { SnapshotSummary } from "@/lib/backup";

/**
 * The nightly backups, and what they hold.
 *
 * A list rather than a button: the point of an automatic safety net is
 * that nobody has to remember it, and the only way to believe it is
 * working is to see last night's copy sitting there with the right number
 * of orders in it. A run that suddenly holds half of them is visible here
 * before anyone goes looking.
 *
 * "Take one now" is for the minute before doing something risky. Restoring
 * is deliberately not a button anywhere — see the note in the pane.
 */
export function BackupPanel({ snapshots, armed }: { snapshots: SnapshotSummary[]; armed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takeOne() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/backup/snapshot", { method: "POST" });
      if (!response.ok) {
        setError(((await response.json()) as { error?: string }).error ?? "Backup failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const latest = snapshots[0];

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Backups"
        description="A copy of the whole database, taken every night."
        action={
          <button onClick={takeOne} disabled={busy} className={`flex items-center gap-2 ${PANE_ACTION_CLASS} disabled:opacity-60`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />}
            {busy ? "Copying…" : "Take one now"}
          </button>
        }
      />

      <div className="flex items-start gap-2">
        <p className="text-xs text-ink-soft">
          Every table, nightly at 04:00, keeping the last 14. Download one to keep a copy off this database
          — restoring from it is a deliberate job for an admin, not a button here.
        </p>
        <InfoTip
          label="What a backup covers"
          text="This protects against a bad edit, a batch action gone wrong, or a bug that quietly rewrites rows: the data is still there and some of it is wrong. It lives in the same database it copies, so for losing the database itself the answer is Neon's own point-in-time restore — and a downloaded copy kept somewhere else."
        />
      </div>

      {!armed && (
        <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
          Not armed yet — the snapshot table is missing. Run{" "}
          <code className="font-mono">scripts/migrate-027-snapshots.sql</code> against the database.
        </p>
      )}

      {armed && snapshots.length === 0 && (
        <p className="mt-3 text-xs font-semibold text-ink-soft">
          Nothing taken yet. The first one lands tonight, or press Take one now.
        </p>
      )}

      {snapshots.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-[11px] font-extrabold tracking-wide text-ink-soft uppercase">
            {latest && (
              <>
                Newest holds {orderCount(latest)} orders, {expenseCount(latest)} expenses
              </>
            )}
          </p>
          <ul className="divide-y divide-line/60">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="hover-line flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs">
                <CalendarClock size={13} className="shrink-0 text-ink-soft" />
                <span className="font-semibold">{WHEN.format(new Date(snapshot.takenAt))}</span>
                {snapshot.kind === "manual" && (
                  <span className="keeps-color chip-neutral rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-bold">
                    by hand
                  </span>
                )}
                <span className="text-ink-soft">
                  {rows(snapshot)} rows · {Math.round(snapshot.bytes / 1024)} KB
                </span>
                <span className="flex-1" />
                <a
                  href={`/api/backup/snapshot/${snapshot.id}`}
                  className="flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition hover:bg-black/[0.06]"
                  title="Download this backup as a file"
                >
                  <Download size={12} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
    </section>
  );
}

const rows = (snapshot: SnapshotSummary) =>
  Object.values(snapshot.rowCounts).reduce((total, count) => total + count, 0);
const orderCount = (snapshot: SnapshotSummary) => snapshot.rowCounts.orders ?? 0;
const expenseCount = (snapshot: SnapshotSummary) => snapshot.rowCounts.expenses ?? 0;

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
