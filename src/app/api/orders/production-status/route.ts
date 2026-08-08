import { NextRequest, NextResponse } from "next/server";
import { setProductionStatus, type ProductionStatus } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * POST body: { key: string, status: ProductionStatus }. A single endpoint
 * handles both Sheet-sourced ("sheet:<row>") and DB orders (numeric id)
 * since Sheet keys contain a colon that doesn't fit cleanly as a dynamic
 * route segment.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { key: string; status: ProductionStatus };
  try {
    await setProductionStatus(body.key, body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to set production status for ${body.key}:`, error);
    return NextResponse.json({ error: "Failed to set production status." }, { status: 500 });
  }
}
