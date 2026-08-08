import { NextRequest, NextResponse } from "next/server";
import { duplicateOrder } from "@/lib/orders";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/orders/[id]/duplicate">) {
  const { id } = await ctx.params;
  try {
    const order = await duplicateOrder(Number(id));
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error(`Failed to duplicate order ${id}:`, error);
    return NextResponse.json({ error: "Failed to duplicate order." }, { status: 500 });
  }
}
