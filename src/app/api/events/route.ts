import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { currentEditor } from "@/lib/editor";
import { createEvent } from "@/lib/events";
import { parseEventInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/** Creates an event with its products and deals. Admin only — it is priced. */
export async function POST(request: NextRequest) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = parseEventInput(raw);
  if (!parsed.ok) return badRequest(parsed.error);
  const id = await createEvent(parsed.value, await currentEditor());
  return NextResponse.json({ id });
}
