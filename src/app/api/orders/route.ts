import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";
import { refuseNonAdmin } from "@/lib/guard";
import { parseOrderInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * Taking an order is a money job — it has to be priced — so this is an
 * admin's. A staff account may move an order along and change what the
 * event is (see the PATCH beside this), but not book one.
 */
export async function POST(request: NextRequest) {
  const refusal = await refuseNonAdmin();
  if (refusal) return refusal;

  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const parsed = parseOrderInput(body);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    const order = await createOrder(parsed.value, await currentEditor());
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    return NextResponse.json({ error: "Failed to create order." }, { status: 500 });
  }
}
