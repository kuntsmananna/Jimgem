import { NextRequest, NextResponse } from "next/server";
import { createOrder, type OrderInput } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as OrderInput;
  try {
    const order = await createOrder(body, await currentEditor());
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    return NextResponse.json({ error: "Failed to create order." }, { status: 500 });
  }
}
