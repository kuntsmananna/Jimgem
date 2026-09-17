import bcrypt from "bcryptjs";
import { getDb, isMissingColumn } from "./db";
import type { Role } from "./roles";
import { getSession } from "./session";

export interface StaffAccount {
  id: number;
  name: string;
  username: string;
  role: Role;
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<StaffAccount | null> {
  const db = getDb();
  const result = await db.query<{
    id: number;
    name: string;
    username: string;
    password_hash: string;
    role?: string | null;
  }>(
    // `role` is selected through a fallback rather than assumed, for the
    // minutes between this deploying and migration 030 being pasted in:
    // signing in must not be the thing that breaks while a column is on
    // its way. Everyone is an admin there, which is what they were the
    // moment before.
    "SELECT id, name, username, password_hash, role FROM staff WHERE username = $1",
    [username],
  ).catch(async (error) => {
    if (!isMissingColumn(error, "role")) throw error;
    return db.query<{
      id: number;
      name: string;
      username: string;
      password_hash: string;
      role?: string | null;
    }>("SELECT id, name, username, password_hash FROM staff WHERE username = $1", [username]);
  });

  const row = result.rows[0];
  if (!row) return null;

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) return null;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    // Undefined only in the pre-migration window above; anything else
    // unrecognised is the least privileged of the two.
    role: row.role === undefined ? "admin" : row.role === "admin" ? "admin" : "staff",
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
 * No session, or an account since deleted, is `null` — and every caller
 * treats that as "not an admin", so the failure is closed.
 */
export async function currentRole(): Promise<Role | null> {
  try {
    const session = await getSession();
    if (!session.userId) return null;
    const db = getDb();
    const { rows } = await db
      .query<{ role?: string | null }>("SELECT role FROM staff WHERE id = $1", [session.userId])
      .catch(async (error) => {
        if (!isMissingColumn(error, "role")) throw error;
        return { rows: [{ role: "admin" }] };
      });
    if (rows.length === 0) return null;
    return rows[0].role === "admin" ? "admin" : "staff";
  } catch (error) {
    console.error("Couldn't read the signed-in role:", error);
    return null;
  }
}
