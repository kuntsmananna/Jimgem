import { NextRequest, NextResponse } from "next/server";
import { updateStaffName, resetStaffPassword } from "@/lib/settings";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/settings/staff/[id]">) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  const body = await request.json();

  try {
    if (body.password) {
      await resetStaffPassword(numericId, body.password);
      return NextResponse.json({ ok: true });
    }
    const staff = await updateStaffName(numericId, body.name);
    return NextResponse.json(staff);
  } catch (error) {
    console.error(`Failed to update staff/${id}:`, error);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}
