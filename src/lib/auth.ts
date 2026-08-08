import bcrypt from "bcryptjs";
import { getDb } from "./db";

export interface StaffAccount {
  id: number;
  name: string;
  username: string;
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
  }>("SELECT id, name, username, password_hash FROM staff WHERE username = $1", [username]);

  const row = result.rows[0];
  if (!row) return null;

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) return null;

  return { id: row.id, name: row.name, username: row.username };
}
