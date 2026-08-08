import { NextRequest, NextResponse } from "next/server";
import { getSheetValues } from "@/lib/googleSheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const spreadsheetId =
    searchParams.get("spreadsheetId") ??
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range =
    searchParams.get("range") ?? process.env.GOOGLE_SHEETS_DEFAULT_RANGE;

  if (!spreadsheetId || !range) {
    return NextResponse.json(
      {
        error:
          "Missing spreadsheetId/range. Pass as query params or set GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_DEFAULT_RANGE.",
      },
      { status: 400 },
    );
  }

  try {
    const rows = await getSheetValues(spreadsheetId, range);
    // TODO: once the target sheet's layout is known, add a helper that
    // maps the header row to keyed objects instead of returning raw rows.
    return NextResponse.json({ spreadsheetId, range, rows });
  } catch (error) {
    console.error("Failed to fetch Google Sheet values:", error);
    return NextResponse.json(
      { error: "Failed to fetch sheet data." },
      { status: 500 },
    );
  }
}
