import { NextRequest, NextResponse } from "next/server";
import { updateOrder, deleteOrder, setSheetOrderOverride, type OrderInput, type OverridableField } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * DB orders (numeric id) get a full OrderInput replace via updateOrder.
 * Sheet orders ("sheet:<row>") never get written to the Sheet — instead
 * the request body is treated as a partial field patch and stored in
 * order_overrides, merged in at read time (see orders.ts).
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();
  try {
    if (id.startsWith("sheet:")) {
      await setSheetOrderOverride(id, body as Partial<Record<OverridableField, string | number | null>>);
      return NextResponse.json({ ok: true });
    }
    const order = await updateOrder(Number(id), body as OrderInput);
    return NextResponse.json(order);
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
