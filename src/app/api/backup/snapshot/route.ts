import { NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/backup";
import { refuseNonAdmin } from "@/lib/guard";

export const maxDuration = 60;

/**
 * Take one now — for the minute before doing something that makes you
 * nervous, rather than waiting for tonight. Behind the session gate like
 * every other route here.
 */
export async function POST() {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  try {
    return NextResponse.json(await captureSnapshot("manual"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
