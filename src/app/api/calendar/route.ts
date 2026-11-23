import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { getSession } from "@/lib/session";
import { appUrlFor, disconnectCalendar, syncCalendars } from "@/lib/calendarSync";

export const runtime = "nodejs";
// A first sync writes every coming order, one call each.
export const maxDuration = 60;

/**
 * "Sync now" for the signed-in admin's own calendar. Answers with what the
 * run did, so the pane can say "3 updated" rather than just "done".
 */
export async function POST(request: NextRequest) {
  const refusal = await refuseNonAdmin();
  if (refusal) return refusal;
  const session = await getSession();
  const [result] = await syncCalendars({ staffId: session.userId, appUrl: appUrlFor(request.nextUrl.origin) });
  if (!result) return NextResponse.json({ error: "No calendar is connected." }, { status: 409 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}

/** "Disconnect": removes the Gems calendar from their Google account and forgets the connection. */
export async function DELETE() {
  const refusal = await refuseNonAdmin();
  if (refusal) return refusal;
  const session = await getSession();
  await disconnectCalendar(session.userId);
  return NextResponse.json({ ok: true });
}
