"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PAYMENT_STATUS_LABEL, formatOrderDate, type Order } from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { useOverlayDismiss } from "@/components/useOverlayDismiss";
import { EventTypeChip } from "./EventTypeChip";
import { OrderForm } from "./OrderForm";

/**
 * Right-side sheet holding the full, editable order — opened by clicking
 * a row on the Orders table or the Dashboard's Latest orders list. Wraps
 * the same OrderForm the Add-order modal uses, so editing behaves
 * identically wherever you start from.
 */
export function OrderDetailsPane({
  order,
  flavors,
  packageTypes,
  presets,
  onSaved,
  onClose,
}: {
  order: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  onSaved: () => void;
  onClose: () => void;
}) {
  useOverlayDismiss(onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-label={`Order — ${order.customer || "no name"}`}
        className="flex h-full w-full max-w-xl flex-col border-l border-line bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">{order.customer || "(no name)"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <span>{formatOrderDate(order.date)}</span>
              <EventTypeChip value={order.customerType} />
              <span>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</span>
              {order.source === "sheet" && <span className="text-ink-soft/70">imported from sheet</span>}
            </div>
            {order.details && <p className="mt-2 text-xs text-ink-soft">{order.details}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink-soft hover:bg-black/5 hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <OrderForm
            // Remount on a different order so the form's draft state is
            // rebuilt from the new row rather than kept from the old one.
            key={order.key}
            order={order}
            flavors={flavors}
            packageTypes={packageTypes}
            presets={presets}
            onSaved={onSaved}
            onCancel={onClose}
            cancelLabel="Close"
          />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
