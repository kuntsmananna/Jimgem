import { NextRequest, NextResponse } from "next/server";
import { markAnnouncementsSeen } from "@/lib/announcementViews";
import { ANNOUNCEMENTS } from "@/lib/announcement";

export const runtime = "nodejs";

const KNOWN = new Set(ANNOUNCEMENTS.map((announcement) => announcement.id));

/**
 * Records that the signed-in person has dismissed the "what's new" popup,
 * for every page it showed them. Only ids still in `ANNOUNCEMENTS` are
 * accepted — there is nothing to gain from recording any other, and a typo
 * would silently mark nothing.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0 || !ids.every((id) => typeof id === "string" && KNOWN.has(id))) {
    return NextResponse.json({ error: "Not a current announcement." }, { status: 400 });
  }
  try {
    await markAnnouncementsSeen(ids as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record the announcement as seen:", error);
    return NextResponse.json({ error: "Couldn't record that." }, { status: 500 });
  }
}
