import { google, sheets_v4 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

let authClient: InstanceType<typeof google.auth.GoogleAuth> | undefined;
let sheetsClient: sheets_v4.Sheets | undefined;

function getGoogleAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (authClient) return authClient;

  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!encoded) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not set. See .env.local.example.",
    );
  }

  const credentials = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf-8"),
  );

  authClient = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  return authClient;
}

function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;
  sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  return sheetsClient;
}

export async function getSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return (response.data.values as string[][]) ?? [];
}

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface CellData {
  value: string;
  backgroundColor: RgbColor | undefined;
}

/**
 * Like getSheetValues, but also returns each cell's effective background
 * color. Needed for sheets that encode meaning (e.g. order payment status)
 * as row/cell color rather than a data column.
 */
export async function getSheetValuesWithFormatting(
  spreadsheetId: string,
  range: string,
): Promise<CellData[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)",
  });

  const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  return rowData.map((row) =>
    (row.values ?? []).map((cell) => {
      const bg = cell.effectiveFormat?.backgroundColor;
      return {
        value: cell.formattedValue ?? "",
        backgroundColor: bg
          ? {
              red: bg.red ?? 0,
              green: bg.green ?? 0,
              blue: bg.blue ?? 0,
            }
          : undefined,
      };
    }),
  );
}
