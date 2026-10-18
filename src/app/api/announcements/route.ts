import { NextRequest, NextResponse } from "next/server";
import { markAnnouncementsSeen } from "@/lib/announcementViews";
import { dismissalFor } from "@/lib/announcement";
import { currentRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Records that the signed-in person has closed the "what's new" popup.
 * The body names the pages it showed; what is recorded is worked out from
 * those by `dismissalFor`, which also covers the older releases the page
 * cap left out. An id this person's role could never have been shown is
 * refused rather than recorded — the audience rule is the server's to
 * keep, not the popup's.
 */
export async function POST(request: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const shown = Array.isArray(body.ids) && body.ids.every((id) => typeof id === "string") ? (body.ids as string[]) : [];
  const ids = dismissalFor(role, shown);
  if (!ids) {
    return NextResponse.json({ error: "Not an announcement for this account." }, { status: 400 });
  }
  try {
    await markAnnouncementsSeen(ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record the announcement as seen:", error);
    return NextResponse.json({ error: "Couldn't record that." }, { status: 500 });
  }
}
