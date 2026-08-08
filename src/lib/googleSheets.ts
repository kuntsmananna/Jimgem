import { google, sheets_v4, drive_v3 } from "googleapis";

// spreadsheets.readonly for sheet data; drive.readonly (added deliberately,
// owner-approved) only for reading comment threads via the Drive API —
// Sheets' own API has no way to expose those. Both remain read-only; the
// sheet itself is still never written to.
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

let authClient: InstanceType<typeof google.auth.GoogleAuth> | undefined;
let sheetsClient: sheets_v4.Sheets | undefined;
let driveClient: drive_v3.Drive | undefined;

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

function getDriveClient(): drive_v3.Drive {
  if (driveClient) return driveClient;
  driveClient = google.drive({ version: "v3", auth: getGoogleAuth() });
  return driveClient;
}

export interface SheetComment {
  content: string;
  /** The cell's value at the time the comment was written, as its raw formatted text — no reliable cell-position anchor is exposed by the API. */
  quotedValue: string | null;
}

/**
 * All comment threads on the spreadsheet file, across every tab — the
 * Drive API's comment anchor doesn't expose a resolvable cell reference
 * (every comment's anchor has the same opaque uid regardless of tab), so
 * callers can only match comments back to cells by quoted value, and only
 * when that value is unambiguous. See financials.ts's best-effort match.
 */
export async function getFileComments(spreadsheetId: string): Promise<SheetComment[]> {
  const drive = getDriveClient();
  const comments: SheetComment[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.comments.list({
      fileId: spreadsheetId,
      fields: "nextPageToken,comments(content,quotedFileContent,resolved)",
      pageSize: 100,
      pageToken,
    });
    for (const comment of response.data.comments ?? []) {
      if (comment.resolved) continue;
      comments.push({
        content: comment.content ?? "",
        quotedValue: comment.quotedFileContent?.value?.trim() || null,
      });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return comments;
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
