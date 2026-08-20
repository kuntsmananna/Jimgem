import { NextRequest, NextResponse } from "next/server";
import { deleteArchived, restoreArchived } from "@/lib/settings";

export const runtime = "nodejs";

/** Puts an archived row back on its list. */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  try {
    await restoreArchived(body.resource, Number(body.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to restore:", error);
    return NextResponse.json({ error: "Failed to restore." }, { status: 500 });
  }
}

/**
 * Removes an archived row for good.
 *
 * A foreign key from an order or an expense makes this fail, which is
 * exactly the case archiving exists for — so the refusal is turned into a
 * sentence the owner can act on rather than a 500.
 */
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  try {
    await deleteArchived(body.resource, Number(body.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/foreign key|violates/i.test(message)) {
      return NextResponse.json(
        { error: "Still in use by an order or an expense, so it can only stay archived." },
        { status: 409 },
      );
    }
    console.error("Failed to delete:", error);
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}
