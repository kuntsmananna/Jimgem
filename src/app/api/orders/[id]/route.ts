import { NextRequest, NextResponse } from "next/server";
import { updateOrder, updateOrderFields, deleteOrder, type OrderInput, type EditableField } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Two shapes of update share this route. A body carrying `contentLines`
 * is a full replace from the order form; anything else is a partial field
 * patch from an inline table cell. Sheet-sourced orders are ordinary DB
 * rows since the import change (see sheetImport.ts), so both paths apply
 * to every order — there is no separate override path any more.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();
  try {
    if (Array.isArray(body?.contentLines)) {
      return NextResponse.json(await updateOrder(Number(id), body as OrderInput));
    }
    await updateOrderFields(Number(id), body as Partial<Record<EditableField, string | number | null>>);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to update order ${id}:`, error);
    return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteOrder(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete order ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete order." }, { status: 500 });
  }
}
