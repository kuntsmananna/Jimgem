import { NextResponse } from "next/server";
import { importFromSheet } from "@/lib/sheetImport";

/**
 * Pulls Sheet rows the DB hasn't seen yet. Triggered from Settings, never
 * automatically — pages read Postgres alone (see sheetImport.ts).
 */
export async function POST() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEETS_SPREADSHEET_ID is not set." }, { status: 500 });
  }

  try {
    return NextResponse.json(await importFromSheet(spreadsheetId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
