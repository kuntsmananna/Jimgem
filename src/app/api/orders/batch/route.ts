import { NextRequest, NextResponse } from "next/server";
import {
  setPaymentStatusMany,
  setProductionStatusMany,
  deleteOrdersMany,
  restoreOrdersMany,
  duplicateOrder,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orders";

import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

type BatchBody =
  | { action: "paymentStatus"; ids: number[]; status: PaymentStatus }
  | { action: "productionStatus"; ids: number[]; status: ProductionStatus }
  | { action: "duplicate"; ids: number[] }
  | { action: "delete"; ids: number[] }
  // The other half of delete: a deleted order is put aside, not destroyed,
  // so undoing one is a write of its own rather than a re-insert.
  | { action: "restore"; ids: number[] };

/**
 * Applies one action to a selection of orders, reporting how many landed
 * so the caller can say "3 deleted, 1 couldn't be" rather than implying
 * all-or-nothing.
 *
 * Status changes and deletes are single set-statements — one HTTP round
 * trip on Neon's driver instead of one per id (see db.ts). Duplicating
 * genuinely needs per-order work (it reads the row and its content lines
 * before inserting), so it stays a settled batch.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as BatchBody;
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  }

  const editor = await currentEditor();
  try {
    if (body.action === "duplicate") {
      const results = await Promise.allSettled(ids.map((id) => duplicateOrder(id)));
      const failed = results.filter((r) => r.status === "rejected");
      for (const failure of failed) {
        console.error("Batch duplicate failed for one order:", (failure as PromiseRejectedResult).reason);
      }
      return NextResponse.json({
        succeeded: results.length - failed.length,
        failed: failed.length,
      });
    }

    const affected =
      body.action === "paymentStatus"
        ? await setPaymentStatusMany(ids, body.status, editor)
        : body.action === "productionStatus"
          ? await setProductionStatusMany(ids, body.status, editor)
          : body.action === "restore"
            ? await restoreOrdersMany(ids)
            : await deleteOrdersMany(ids);

    return NextResponse.json({
      succeeded: affected,
      failed: ids.length - affected,
    });
  } catch (error) {
    console.error(`Batch ${body.action} failed:`, error);
    return NextResponse.json({ error: "Couldn't apply that to the selected orders." }, { status: 500 });
  }
}
