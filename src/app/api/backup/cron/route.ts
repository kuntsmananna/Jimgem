import { NextRequest, NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/backup";
import { rollForwardRecurring } from "@/lib/recurringExpenses";
import { appUrlFor, syncCalendars } from "@/lib/calendarSync";
import { reconcileOpenLinks } from "@/lib/paymentLinks";

// Reading every table and writing the document back is more work than a
// page render, and it runs while nobody is watching.
export const maxDuration = 60;

/**
 * The nightly housekeeping, called by the schedule in `vercel.json`: the
 * database snapshot, and the rows every recurring expense owes the month.
 *
 * Two jobs on one schedule rather than two schedules, because they want
 * the same thing — to run once a night, unattended, behind the same secret
 * — and a second cron entry is a second thing that can be forgotten when
 * the first is changed. The roll-forward runs **first and independently**:
 * it is idempotent (see recurringExpenses.ts) and it is what the ledger
 * needs, so a snapshot failure must not be able to skip it, and its own
 * failure is reported without taking the backup down with it.
 *
 * Outside the session gate — a cron has no cookie — so the secret is what
 * stands in for it. Vercel sends `Authorization: Bearer $CRON_SECRET` on
 * every scheduled invocation once that variable is set in the project, and
 * this refuses to run at all while it is missing: an unauthenticated
 * endpoint that writes a copy of the whole database on request is worse
 * than a backup that hasn't started yet.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so the nightly backup is not armed." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  // Reported rather than thrown: a month of rent that failed to appear is
  // worth seeing in the cron's own log, and it is not a reason to skip the
  // backup that runs after it.
  let recurring: unknown;
  try {
    recurring = await rollForwardRecurring();
  } catch (error) {
    recurring = { error: error instanceof Error ? error.message : "Roll-forward failed." };
  }

  // The calendars' net (v0.97): every save already syncs, but a save whose
  // sync was cut short, or Google being down for a minute, is caught up
  // here. Reported, never thrown, for the reason the roll-forward is.
  let calendars: unknown;
  try {
    calendars = await syncCalendars({ appUrl: appUrlFor(request.nextUrl.origin) });
  } catch (error) {
    calendars = { error: error instanceof Error ? error.message : "Calendar sync failed." };
  }

  // Payment links whose customer paid and never came back to say so
  // (v0.99): one SUMIT call when any link is open, none otherwise.
  let payments: unknown;
  try {
    payments = await reconcileOpenLinks();
  } catch (error) {
    payments = { error: error instanceof Error ? error.message : "Payment check failed." };
  }

  try {
    return NextResponse.json({ recurring, calendars, payments, snapshot: await captureSnapshot("nightly") });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot failed.";
    return NextResponse.json({ recurring, calendars, payments, error: message }, { status: 500 });
  }
}
