"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_STATUS_LABEL, PRODUCTION_STATUS_LABEL, type Order, type PaymentStatus, type ProductionStatus } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { OrdersTable } from "./OrdersTable";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersCalendar } from "./OrdersCalendar";
import { AddOrderForm } from "./AddOrderForm";

type View = "table" | "kanban" | "calendar";

export function OrdersClient({
  orders,
  flavors,
  packageTypes,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("table");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const filtered = useMemo(
    () => (paymentFilter === "all" ? orders : orders.filter((o) => o.paymentStatus === paymentFilter)),
    [orders, paymentFilter],
  );

  function refresh() {
    router.refresh();
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.key))));
  }

  async function batchSetStatus(status: ProductionStatus) {
    setBatchBusy(true);
    await Promise.all(
      Array.from(selectedKeys).map((key) =>
        fetch("/api/orders/production-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, status }),
        }),
      ),
    );
    setBatchBusy(false);
    setSelectedKeys(new Set());
    refresh();
  }

  async function duplicateOrder(id: number) {
    await fetch(`/api/orders/${id}/duplicate`, { method: "POST" });
    refresh();
  }

  async function deleteOrder(id: number) {
    if (!confirm("Delete this order? This can't be undone.")) return;
    await fetch(`/api/orders/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-full bg-card p-1">
          {(["table", "kanban", "calendar"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                view === v ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream"
        >
          {adding ? "Cancel" : "+ Add order"}
        </button>
      </div>

      {adding && (
        <AddOrderForm
          flavors={flavors}
          packageTypes={packageTypes}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPaymentFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            paymentFilter === "all" ? "bg-black text-cream" : "bg-card text-ink-soft"
          }`}
        >
          All
        </button>
        {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setPaymentFilter(status)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              paymentFilter === status ? "bg-black text-cream" : "bg-card text-ink-soft"
            }`}
          >
            {PAYMENT_STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      {selectedKeys.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2">
          <span className="text-sm font-semibold text-ink">{selectedKeys.size} selected</span>
          <span className="text-sm text-ink-soft">Set production status:</span>
          {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((status) => (
            <button
              key={status}
              disabled={batchBusy}
              onClick={() => batchSetStatus(status)}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-black/5 disabled:opacity-50"
            >
              {PRODUCTION_STATUS_LABEL[status]}
            </button>
          ))}
          <button onClick={() => setSelectedKeys(new Set())} className="ml-auto text-xs font-semibold text-ink-soft">
            Clear
          </button>
        </div>
      )}

      {view === "table" && (
        <OrdersTable
          orders={filtered}
          flavors={flavors}
          packageTypes={packageTypes}
          selectedKeys={selectedKeys}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onChanged={refresh}
          onDuplicate={duplicateOrder}
          onDelete={deleteOrder}
        />
      )}
      {view === "kanban" && (
        <OrdersKanban orders={filtered} flavors={flavors} packageTypes={packageTypes} onChanged={refresh} />
      )}
      {view === "calendar" && <OrdersCalendar orders={filtered} />}
    </div>
  );
}
