"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarPlus, RefreshCw } from "lucide-react";
import type { CalendarConnection } from "@/lib/calendarSync";
import { MigrationNeeded, PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import { whenText } from "@/components/LastEdited";
import { sendWrite } from "@/components/saveError";
import { JellyHop } from "@/components/JellyLoader";

/**
 * Your Google Calendar (v0.97) — one per admin, so this pane is about the
 * person looking at it, not the team: each admin connects their own, and
 * sees only their own connection here.
 *
 * Connecting is a link, not a fetch: it leaves the app for Google's
 * consent screen and comes back to `?tab=team&calendar=<outcome>`, which
 * is what `outcome` reports. Everything after that is automatic — a sync
 * runs after every order save and again nightly — so Sync now is a
 * reassurance, not a chore.
 */
export function CalendarPanel({
  connection,
  configured,
  outcome,
}: {
  connection: CalendarConnection;
  /** Google sign-in's OAuth client is set up; without it there is nothing to connect through. */
  configured: boolean;
  outcome?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(() => outcomeNote(outcome));

  async function syncNow() {
    setBusy("sync");
    setNote(null);
    const { response, error } = await sendWrite("calendar sync", "/api/calendar", { method: "POST" });
    if (response && !error) {
      const body = (await response.json().catch(() => ({}))) as { written?: number; removed?: number };
      const changed = (body.written ?? 0) + (body.removed ?? 0);
      setNote({ tone: "ok", text: changed === 0 ? "Already up to date." : `${changed} event${changed === 1 ? "" : "s"} updated.` });
      router.refresh();
    } else {
      setNote({ tone: "error", text: error ?? "Couldn't sync." });
    }
    setBusy(null);
  }

  async function disconnect() {
    setBusy("disconnect");
    setNote(null);
    const { response, error } = await sendWrite("disconnect", "/api/calendar", { method: "DELETE" });
    if (response && !error) router.refresh();
    else setNote({ tone: "error", text: error ?? "Couldn't disconnect." });
    setBusy(null);
  }

  const connectHref = "/api/auth/google/calendar";

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Your Google Calendar"
        description="Every order in a calendar of its own — at its start time when it has one (🎉), with its delivery as a second event (🚚) — updated a few seconds after any change. No prices are sent."
        action={
          connection.available && configured && (!connection.connected || connection.needsReconnect) ? (
            <a href={connectHref} className={`flex items-center gap-1.5 ${PANE_ACTION_CLASS}`}>
              <CalendarPlus size={14} />
              {connection.needsReconnect ? "Connect again" : "Connect"}
            </a>
          ) : undefined
        }
      />

      {!connection.available ? (
        <MigrationNeeded script="scripts/migrate-037-calendar-sync.sql" />
      ) : !configured ? (
        <p className="mt-3 text-sm text-ink-soft">
          Needs Google sign-in to be set up first (the OAuth client in Vercel&apos;s environment variables).
        </p>
      ) : !connection.connected ? (
        <p className="mt-3 text-sm text-ink-soft">
          Not connected. <span className="font-semibold text-ink">Connect</span> adds a calendar called{" "}
          <span className="font-semibold text-ink">Gems orders</span> to the Google account you choose. It can only
          write there, never to the rest of your calendar.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-ink">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              Writing to <span className="font-semibold" data-private>{connection.googleEmail}</span>
              {connection.lastSyncedAt && (
                <span className="text-ink-soft"> · last updated {whenText(connection.lastSyncedAt)}</span>
              )}
            </span>
          </p>
          {connection.needsReconnect ? (
            <p className="rounded-lg bg-tile-peach px-3 py-2 text-xs font-semibold text-ink" role="status">
              Google stopped accepting this connection. Press Connect again to pick it back up.
            </p>
          ) : (
            connection.lastError && (
              <p className="text-xs font-semibold text-red-700" role="alert">
                The last update didn&apos;t go through: {connection.lastError}
              </p>
            )
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!connection.needsReconnect && (
              <button
                onClick={syncNow}
                disabled={busy !== null}
                className={`flex items-center gap-1.5 ${PANE_ACTION_CLASS} disabled:opacity-60`}
              >
                {busy === "sync" ? <JellyHop /> : <RefreshCw size={13} />}
                Sync now
              </button>
            )}
            <button
              onClick={disconnect}
              disabled={busy !== null}
              className="press text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-60 max-md:min-h-9 max-md:text-sm"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect and remove the calendar"}
            </button>
          </div>
        </div>
      )}

      {note && (
        <p
          className={`mt-3 text-xs font-semibold ${note.tone === "ok" ? "text-accent" : "text-red-700"}`}
          role={note.tone === "ok" ? "status" : "alert"}
        >
          {note.text}
        </p>
      )}
    </section>
  );
}

/** What coming back from Google says, read once from `?calendar=`. */
function outcomeNote(outcome: string | undefined): { tone: "ok" | "error"; text: string } | null {
  switch (outcome) {
    case "connected":
      return { tone: "ok", text: "Connected. Your orders are on their way to the calendar — give it a minute." };
    case "cancelled":
      return { tone: "error", text: "Not connected — Google's screen was cancelled." };
    case "error":
      return { tone: "error", text: "Couldn't connect the calendar. Try again." };
    case "unconfigured":
      return { tone: "error", text: "Google sign-in isn't set up yet, so there is nothing to connect through." };
    default:
      return null;
  }
}
