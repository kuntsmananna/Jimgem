import { NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/backup";

export const maxDuration = 60;

/**
 * Take one now — for the minute before doing something that makes you
 * nervous, rather than waiting for tonight. Behind the session gate like
 * every other route here.
 */
export async function POST() {
  try {
    return NextResponse.json(await captureSnapshot("manual"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
