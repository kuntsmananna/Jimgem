import bcrypt from "bcryptjs";
import { getDb, isMissingColumn } from "./db";
import type { Role } from "./roles";
import { getSession } from "./session";

export interface StaffAccount {
  id: number;
  name: string;
  username: string;
  role: Role;
  /** `staff.session_version` — see `SessionData.version`. */
  sessionVersion: number;
}

interface StaffAuthRow {
  id: number;
  name: string;
  username: string;
  password_hash: string;
  role?: string | null;
  session_version?: number | null;
}

/**
 * Reads one staff row, dropping the columns a migration may not have
 * added yet rather than failing: `role` (030) and `session_version` (033).
 * Signing in must not be the thing that breaks in the minutes between a
 * deploy and the paste into the database console. Without `role` everyone
 * is an admin, which is what they were the moment before; without
 * `session_version` no session can be ended early, which is how it was.
 */
async function readStaff(where: "username" | "id", value: string | number): Promise<StaffAuthRow | undefined> {
  const db = getDb();
  for (const extra of ["role, session_version", "role", ""]) {
    const columns = ["id", "name", "username", "password_hash", extra].filter(Boolean).join(", ");
    try {
      const { rows } = await db.query<StaffAuthRow>(`SELECT ${columns} FROM staff WHERE ${where} = $1`, [value]);
      return rows[0];
    } catch (error) {
      if (!isMissingColumn(error, "session_version") && !isMissingColumn(error, "role")) throw error;
    }
  }
  return undefined;
}

function roleOf(row: StaffAuthRow): Role {
  // Undefined only before migration 030; anything else unrecognised is
  // the least privileged of the two.
  return row.role === undefined ? "admin" : row.role === "admin" ? "admin" : "staff";
}

/**
 * A bcrypt hash of a random string nobody knows, at the same cost as the
 * real ones, compared against when the username matches nobody.
 *
 * Returning before bcrypt for an unknown name answered in a millisecond
 * where a known name with a wrong password took ~80 — a stopwatch that
 * tells anyone which usernames exist. Comparing against this costs the
 * same time either way and can never match.
 */
const NO_SUCH_USER_HASH = "$2b$10$sT1EyUf.HsS/UXFs41fzC.gcmuUtC..Vzberh2zJTGfoomdKZELl2";

export async function verifyCredentials(username: string, password: string): Promise<StaffAccount | null> {
  const row = await readStaff("username", username);
  if (!row) {
    await bcrypt.compare(password, NO_SUCH_USER_HASH);
    return null;
  }

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) return null;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: roleOf(row),
    sessionVersion: row.session_version ?? 0,
  };
}

/**
 * What the person making this request may see, **read from the database
 * rather than from their cookie**.
 *
 * The cookie carries the role too, and `src/proxy.ts` uses that copy: it
 * runs on every request and cannot afford a query. But the cookie is a
 * snapshot from whenever they signed in, and this is the answer that
 * decides what data leaves the server — so it asks the row. Demoting
 * somebody then takes effect on their next page load rather than at their
 * next login, which is what anyone changing a permission expects.
 *
 * **A session issued before the account's role or password last changed
 * is no session at all** (`session_version`, migration 033): it reads as
 * `null`, so a demoted admin or somebody who has left is refused by every
 * route and page that asks this — not only the five pages that check for
 * an admin. No session, or an account since deleted, is `null` too, and
 * every caller treats that as "not an admin", so the failure is closed.
 */
export async function currentRole(): Promise<Role | null> {
  try {
    const session = await getSession();
    if (!session.userId) return null;
    const row = await readStaff("id", session.userId);
    if (!row) return null;
    if (row.session_version != null && row.session_version !== (session.version ?? 0)) return null;
    return roleOf(row);
  } catch (error) {
    console.error("Couldn't read the signed-in role:", error);
    return null;
  }
}
