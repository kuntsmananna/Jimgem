import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getSession } from "./session";

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
    const { rows } = await getDb().query("SELECT announcement_id FROM announcement_views WHERE staff_id = $1", [
      session.userId,
    ]);
    return new Set(rows.map((row) => row.announcement_id as string));
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
