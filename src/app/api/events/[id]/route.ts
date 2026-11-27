import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { currentEditor } from "@/lib/editor";
import { deleteEvent, updateEvent } from "@/lib/events";
import { StaleWriteError } from "@/lib/orders";
import { parseEventInput, parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/** Saves an event over itself, refused with 409 if it moved on since it was opened. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such event.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = parseEventInput(raw);
  if (!parsed.ok) return badRequest(parsed.error);
  const expected = (raw as { expectedUpdatedAt?: unknown }).expectedUpdatedAt;
  try {
    await updateEvent(id, parsed.value, await currentEditor(), typeof expected === "string" ? expected : undefined);
  } catch (error) {
    if (error instanceof StaleWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

/** Puts an event aside. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such event.");
  await deleteEvent(id, await currentEditor());
  return NextResponse.json({ ok: true });
}
