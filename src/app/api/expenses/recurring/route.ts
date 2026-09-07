import { NextResponse } from "next/server";
import { rollForwardRecurring } from "@/lib/recurringExpenses";

export const runtime = "nodejs";

/**
 * Book the months every repeating expense is missing, on demand.
 *
 * The same job the nightly cron runs, behind the session gate rather than
 * behind `CRON_SECRET` — this one is a person pressing a button in
 * Settings, and `src/proxy.ts` has already established there is a session.
 *
 * Idempotent, so there is nothing to guard against a second press: the
 * unique index from migration 028 is what decides whether a month gets a
 * row, not this route.
 */
export async function POST() {
  try {
    return NextResponse.json(await rollForwardRecurring());
  } catch (error) {
    console.error("Failed to roll recurring expenses forward:", error);
    return NextResponse.json({ error: "Failed to book the repeating expenses." }, { status: 500 });
  }
}
