import { NextRequest, NextResponse } from "next/server";
import { updateOrder, deleteOrder, type OrderInput } from "@/lib/orders";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as OrderInput;
  try {
    const order = await updateOrder(Number(id), body);
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
