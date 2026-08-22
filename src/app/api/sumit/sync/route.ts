import { NextRequest, NextResponse } from "next/server";
import { syncSumitDocuments } from "@/lib/sumitSync";

// A full-history pull fetches details per revenue document, which is well
// past the default serverless timeout.
export const maxDuration = 60;

/**
 * Pulls SUMIT documents into the local mirror. Triggered from Settings, and
 * on a schedule — never from a render path (see sumitSync.ts).
 *
 * Read-only against SUMIT: this writes to Postgres only.
 */
export async function POST(request: NextRequest) {
  if (!process.env.SUMIT_COMPANY_ID || !process.env.SUMIT_API_KEY) {
    return NextResponse.json({ error: "SUMIT_COMPANY_ID and SUMIT_API_KEY are not set." }, { status: 500 });
  }
  const { windowDays } = (await request.json().catch(() => ({}))) as { windowDays?: number };

  try {
    return NextResponse.json(await syncSumitDocuments(windowDays ? { windowDays } : {}));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
