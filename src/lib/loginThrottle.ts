import { getDb, isMissingTable, reportMissingTable } from "./db";

/**
 * The app's own brake on password guessing (migration 035).
 *
 * A Vercel Firewall rule already limits sign-in posts at the edge; this is
 * the lock that lives in the repo, so taking that rule away no longer
 * leaves the two well-known usernames open to unlimited guesses.
 *
 * Three limits over the last `WINDOW_MINUTES`, each counting only failures
 * since that key's last success:
 *
 * - **one name from one address** — the ordinary case of somebody trying
 *   passwords for Anna from one laptop;
 * - **one address, any names** — a script working down a list of names;
 * - **one name, from anywhere** — set high, because it is also the limit a
 *   stranger could use to lock somebody out: crossing it needs a spread of
 *   addresses, and the person locked out still gets in the moment the
 *   window passes.
 *
 * A refused sign-in does not check the password at all, so it costs no
 * bcrypt work and says nothing about whether the password was right.
 */

export const WINDOW_MINUTES = 15;
export const LIMITS = { nameAndAddress: 5, address: 20, name: 50 } as const;

export interface FailureCounts {
  nameAndAddress: number;
  address: number;
  name: number;
}

/** Whether these recent failures are enough to stop checking passwords. Pure, so it is tested. */
export function isThrottled(failures: FailureCounts): boolean {
  return (
    failures.nameAndAddress >= LIMITS.nameAndAddress ||
    failures.address >= LIMITS.address ||
    failures.name >= LIMITS.name
  );
}

/**
 * Recent failures for this name and address. Zeros — no throttle — until
 * migration 035 has been run: refusing every sign-in because the log is
 * missing would lock both founders out of their own dashboard.
 */
export async function recentFailures(username: string, ip: string): Promise<FailureCounts> {
  try {
    const { rows } = await getDb().query<{ name_and_address: string; address: string; name: string }>(
      `WITH recent AS (
         SELECT * FROM login_attempts WHERE at > now() - make_interval(mins => $3)
       )
       SELECT
         (SELECT count(*) FROM recent r WHERE NOT ok AND username = $1 AND ip = $2
            AND at > COALESCE((SELECT max(at) FROM recent WHERE ok AND username = $1 AND ip = $2), '-infinity')) AS name_and_address,
         (SELECT count(*) FROM recent r WHERE NOT ok AND ip = $2
            AND at > COALESCE((SELECT max(at) FROM recent WHERE ok AND ip = $2), '-infinity')) AS address,
         (SELECT count(*) FROM recent r WHERE NOT ok AND username = $1
            AND at > COALESCE((SELECT max(at) FROM recent WHERE ok AND username = $1), '-infinity')) AS name`,
      [username, ip, WINDOW_MINUTES],
    );
    const row = rows[0];
    return { nameAndAddress: Number(row.name_and_address), address: Number(row.address), name: Number(row.name) };
  } catch (error) {
    if (isMissingTable(error, "login_attempts")) {
      await reportMissingTable("login_attempts", "migrate-035-login-attempts.sql");
      return { nameAndAddress: 0, address: 0, name: 0 };
    }
    throw error;
  }
}

/** Writes one attempt and clears anything older than a day, in one statement. */
export async function recordAttempt(username: string, ip: string, ok: boolean): Promise<void> {
  try {
    await getDb().query(
      `WITH cleared AS (DELETE FROM login_attempts WHERE at < now() - interval '1 day')
       INSERT INTO login_attempts (username, ip, ok) VALUES ($1, $2, $3)`,
      [username, ip, ok],
    );
  } catch (error) {
    if (isMissingTable(error, "login_attempts")) return;
    throw error;
  }
}
