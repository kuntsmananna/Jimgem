import { NextRequest, NextResponse } from "next/server";
import { updatePrice } from "@/lib/settings";
import { ZERO_PRICES, type PriceKey } from "@/lib/orderTypes";

export const runtime = "nodejs";

/**
 * Every rate key there is, taken from the `Prices` shape itself rather
 * than from a list of fields.
 *
 * It was built from PRICE_FIELDS, which is only the *add-on* rates — so
 * the moment jelly moved to its own pane the route started rejecting the
 * quantity tiers as unknown keys, silently. `ZERO_PRICES` is the one
 * place the full set is spelled out, and a key can only exist by being in
 * it.
 */
const KEYS = new Set<string>(Object.keys(ZERO_PRICES));

/**
 * Its own route rather than a case in `[resource]`: prices are a fixed
 * set of named amounts, not a list with ids, so there is no POST to add
 * one and no `[id]` to address.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (!KEYS.has(body.key)) {
    return NextResponse.json({ error: `Unknown price: ${body.key}` }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Amount must be a number, zero or more." }, { status: 400 });
  }

  try {
    await updatePrice(body.key as PriceKey, amount);
    return NextResponse.json({ key: body.key, amount });
  } catch (error) {
    console.error("Failed to update price:", error);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}
