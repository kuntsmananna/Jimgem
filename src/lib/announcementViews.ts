import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getSession } from "./session";
import { announcementsFor, MAX_ANNOUNCEMENT_PAGES, type Announcement } from "./announcement";
import type { Role } from "./roles";

/**
 * The announcements this person has not dismissed yet and is meant to see,
 * newest first and at most `MAX_ANNOUNCEMENT_PAGES` — empty when there is
 * nothing to show.
 *
 * Empty whenever there is nothing safe to show, including when migration
 * 032 has not been run: with nowhere to record the dismissal, the popup
 * would come back on every page load, which is worse than not announcing
 * at all. Any other failure is logged and also answers null — a popup is
 * never the reason a page fails to render.
 */
export async function getUnseenAnnouncements(role: Role | null): Promise<Announcement[]> {
  if (!role) return [];
  const forRole = announcementsFor(role);
  if (forRole.length === 0) return [];
  try {
    const session = await getSession();
    if (!session.userId) return [];
    const { rows } = await getDb().query(
      "SELECT announcement_id FROM announcement_views WHERE staff_id = $1 AND announcement_id = ANY($2)",
      [session.userId, forRole.map((announcement) => announcement.id)],
    );
    const seen = new Set(rows.map((row) => row.announcement_id as string));
    return forRole.filter((announcement) => !seen.has(announcement.id)).slice(0, MAX_ANNOUNCEMENT_PAGES);
  } catch (error) {
    if (isMissingTable(error, "announcement_views")) {
      await reportMissingTable("announcement_views", "migrate-032-announcement-views.sql");
    } else {
      console.error("Couldn't read the announcement state:", error);
    }
    return [];
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
