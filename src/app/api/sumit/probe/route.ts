import { NextResponse } from "next/server";
import { runSumitProbe } from "@/lib/sumitProbe";

/**
 * Read-only SUMIT reconnaissance, triggered from Settings → Data. Writes
 * nothing, to SUMIT or to the DB — the report it returns is the whole
 * result. Scaffolding for designing the integration, not part of it.
 */
export async function POST(request: Request) {
  if (!process.env.SUMIT_COMPANY_ID || !process.env.SUMIT_API_KEY) {
    return NextResponse.json(
      { error: "SUMIT_COMPANY_ID and SUMIT_API_KEY are not set on the server." },
      { status: 500 },
    );
  }

  // A full history pull is a lot of pages; the caller can narrow it.
  const { dateFrom } = (await request.json().catch(() => ({}))) as { dateFrom?: string };

  try {
    return NextResponse.json({ report: await runSumitProbe(dateFrom ? { dateFrom } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Probe failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
