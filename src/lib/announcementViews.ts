import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getSession } from "./session";
import { ANNOUNCEMENTS } from "./announcement";

/**
 * Every announcement id the signed-in person has dismissed, or null when
 * there is nothing safe to show — including when migration 032 has not
 * been run: with nowhere to record the dismissal, the popup would come
 * back on every page load, which is worse than not announcing at all. Any
 * other failure is logged and also answers null — a popup is never the
 * reason a page fails to render.
 *
 * Asks nothing about the role, so the app layout can run it alongside
 * `currentRole()` rather than after it; `unseenFor` does the filtering.
 */
export async function getSeenAnnouncements(): Promise<Set<string> | null> {
  try {
    const session = await getSession();
    if (!session.userId) return null;
    const [{ rows }, { rows: account }] = await Promise.all([
      getDb().query("SELECT announcement_id FROM announcement_views WHERE staff_id = $1", [session.userId]),
      getDb().query("SELECT created_at::date::text AS joined FROM staff WHERE id = $1", [session.userId]),
    ]);
    const seen = new Set(rows.map((row) => row.announcement_id as string));
    /*
     * A release that went out before this login existed counts as seen
     * (v0.87). "What's new" is news about a change, and somebody signing in
     * for the first time never saw the app before it — three pages of
     * "the table now reads left to right" is a changelog to them, not a
     * welcome. They can still read every release from the sparkle.
     */
    const joined = account[0]?.joined as string | undefined;
    if (joined) for (const announcement of ANNOUNCEMENTS) if (announcement.released < joined) seen.add(announcement.id);
    return seen;
  } catch (error) {
    if (isMissingTable(error, "announcement_views")) {
      await reportMissingTable("announcement_views", "migrate-032-announcement-views.sql");
    } else {
      console.error("Couldn't read the announcement state:", error);
    }
    return null;
  }
}

/** Records that the signed-in person has seen each of `ids`. Idempotent. */
export async function markAnnouncementsSeen(ids: string[]): Promise<void> {
  const session = await getSession();
  if (!session.userId || ids.length === 0) return;
  await getDb().query(
    `INSERT INTO announcement_views (staff_id, announcement_id)
     SELECT $1, id FROM unnest($2::text[]) AS id
     ON CONFLICT DO NOTHING`,
    [session.userId, ids],
  );
}
