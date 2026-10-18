import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getSession } from "./session";
import { ANNOUNCEMENT, type Announcement } from "./announcement";
import type { Role } from "./roles";

/**
 * The announcement this person has not dismissed yet, or null.
 *
 * Null whenever there is nothing safe to show, including when migration
 * 032 has not been run: with nowhere to record the dismissal, the popup
 * would come back on every page load, which is worse than not announcing
 * at all. Any other failure is logged and also answers null — a popup is
 * never the reason a page fails to render.
 */
export async function getUnseenAnnouncement(role: Role | null): Promise<Announcement | null> {
  if (!role || !ANNOUNCEMENT.audience.includes(role)) return null;
  try {
    const session = await getSession();
    if (!session.userId) return null;
    const { rows } = await getDb().query(
      "SELECT 1 FROM announcement_views WHERE staff_id = $1 AND announcement_id = $2",
      [session.userId, ANNOUNCEMENT.id],
    );
    return rows.length === 0 ? ANNOUNCEMENT : null;
  } catch (error) {
    if (isMissingTable(error, "announcement_views")) {
      await reportMissingTable("announcement_views", "migrate-032-announcement-views.sql");
    } else {
      console.error("Couldn't read the announcement state:", error);
    }
    return null;
  }
}

/** Records that the signed-in person has seen `id`. Idempotent. */
export async function markAnnouncementSeen(id: string): Promise<void> {
  const session = await getSession();
  if (!session.userId) return;
  await getDb().query(
    `INSERT INTO announcement_views (staff_id, announcement_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [session.userId, id],
  );
}
