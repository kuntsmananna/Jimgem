import { NextRequest, NextResponse } from "next/server";
import { markAnnouncementSeen } from "@/lib/announcementViews";
import { ANNOUNCEMENT } from "@/lib/announcement";

export const runtime = "nodejs";

/**
 * Records that the signed-in person has dismissed the current "what's new"
 * popup. Only the current id is accepted — there is nothing to gain from
 * recording any other, and a typo would silently mark nothing.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (body.id !== ANNOUNCEMENT.id) {
    return NextResponse.json({ error: "Not the current announcement." }, { status: 400 });
  }
  try {
    await markAnnouncementSeen(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record the announcement as seen:", error);
    return NextResponse.json({ error: "Couldn't record that." }, { status: 500 });
  }
}
