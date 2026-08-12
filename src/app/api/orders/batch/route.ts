import { NextRequest, NextResponse } from "next/server";
import {
  setPaymentStatus,
  setProductionStatus,
  duplicateOrder,
  deleteOrder,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orders";

export const runtime = "nodejs";

type BatchBody =
  | { action: "paymentStatus"; ids: number[]; status: PaymentStatus }
  | { action: "productionStatus"; ids: number[]; status: ProductionStatus }
  | { action: "duplicate"; ids: number[] }
  | { action: "delete"; ids: number[] };

/**
 * Applies one action to a selection of orders. Each id is attempted
 * independently and failures are counted rather than thrown, so the
 * caller can report partial success ("3 deleted, 1 failed") instead of
 * the whole batch appearing to have done nothing.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as BatchBody;
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  }

  const run = (id: number): Promise<unknown> => {
    switch (body.action) {
      case "paymentStatus":
        return setPaymentStatus(id, body.status);
      case "productionStatus":
        return setProductionStatus(id, body.status);
      case "duplicate":
        return duplicateOrder(id);
      case "delete":
        return deleteOrder(id);
      default:
        return Promise.reject(new Error("Unknown action."));
    }
  };

  const results = await Promise.allSettled(ids.map(run));
  const failed = results.filter((r) => r.status === "rejected");
  for (const failure of failed) {
    console.error(`Batch ${body.action} failed for one order:`, (failure as PromiseRejectedResult).reason);
  }

  return NextResponse.json({ succeeded: results.length - failed.length, failed: failed.length });
}
