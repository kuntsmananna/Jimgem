import { NextRequest, NextResponse } from "next/server";
import { endSessions, updateStaffName, resetStaffPassword, updateStaffRole, LastAdminError } from "@/lib/settings";
import { getSession } from "@/lib/session";
import { refuseNonAdmin } from "@/lib/guard";
import { ROLES, type Role } from "@/lib/roles";

export const runtime = "nodejs";

/**
 * Rename an account, reset its password, or change what it may see.
 *
 * Admin only, checked against the database rather than the cookie — this
 * is the route that hands out access, so it is the one where a role read
 * from a snapshot taken at sign-in is least good enough.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/settings/staff/[id]">) {
  const refusal = await refuseNonAdmin();
  if (refusal) return refusal;

  const { id } = await ctx.params;
  const numericId = Number(id);
  const body = await request.json();

  try {
    if (body.password) {
      if (String(body.password).length < 8) {
        return NextResponse.json({ error: "A password needs 8 characters or more." }, { status: 400 });
      }
      await resetStaffPassword(numericId, body.password);
      await signOutElsewhere(numericId);
      return NextResponse.json({ ok: true });
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as Role)) {
        return NextResponse.json({ error: "Pick a role." }, { status: 400 });
      }
      const staff = await updateStaffRole(numericId, body.role as Role);
      await signOutElsewhere(numericId, staff.role);
      return NextResponse.json(staff);
    }
    const staff = await updateStaffName(numericId, body.name);
    return NextResponse.json(staff);
  } catch (error) {
    // Not a 500: the database did exactly what it was asked, and the
    // answer is a sentence the panel can print.
    if (error instanceof LastAdminError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(`Failed to update staff/${id}:`, error);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}

/**
 * Ends the account's other sessions after its role or password changed —
 * a demoted admin's open browser, or a phone left signed in by somebody
 * who has gone. When the account is the caller's own, this browser is
 * moved on with it rather than signed out mid-sentence: changing your own
 * password should not end the session you changed it from.
 */
async function signOutElsewhere(id: number, role?: Role): Promise<void> {
  const version = await endSessions(id);
  if (version === null) return;
  const session = await getSession();
  if (session.userId !== id) return;
  session.version = version;
  if (role) session.role = role;
  await session.save();
}
