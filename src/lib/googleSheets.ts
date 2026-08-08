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
