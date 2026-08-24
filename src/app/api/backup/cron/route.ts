import { NextRequest, NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/backup";

// Reading every table and writing the document back is more work than a
// page render, and it runs while nobody is watching.
export const maxDuration = 60;

/**
 * The nightly snapshot, called by the schedule in `vercel.json`.
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

  try {
    return NextResponse.json(await captureSnapshot("nightly"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
