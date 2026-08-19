"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PAYMENT_STATUS_LABEL, formatOrderDate, type Order, type Prices } from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { useOverlayDismiss } from "@/components/useOverlayDismiss";
import { EventTypeChip } from "./EventTypeChip";
import { OrderForm } from "./OrderForm";

/**
 * Right-side sheet holding the full, editable order.
 *
 * **Currently unused.** Adding and editing both go through
 * OrderFormModal now, so there is one way to edit an order rather than
 * two that had to be kept in step. Kept rather than deleted because the
 * sheet layout may earn its place back for a side-by-side view — it is
 * wired for the same props and the same unsaved-changes guard, so
 * routing to it again is a one-line change in OrdersClient.
 */
export function OrderDetailsPane({
  order,
  flavors,
  packageTypes,
  presets,
  prices,
  onSaved,
  onClose,
}: {
  order: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  prices: Prices;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);

  /**
   * Every way out of the pane goes through here. The form saves only when
   * "Save changes" is pressed, but the Orders table's inline cells commit
   * on blur — so the habit this pane has to survive is "I edited it,
   * therefore it's saved". Escape and a stray click outside are the easy
   * ones to trigger by accident, and both used to bin the edit without a
   * word.
   */
  const requestClose = useCallback(() => {
    if (dirty && !confirm("Discard your unsaved changes to this order?")) return;
    onClose();
  }, [dirty, onClose]);

  useOverlayDismiss(requestClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
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
            {/*
              No `details` echo here: migration 004 folded it into notes,
              which the form below shows in an editable field a few lines
              down. Repeating it in the header would put the same text on
              screen twice, once uneditable — the exact confusion that
              change removed.
            */}
          </div>
          <button
            onClick={requestClose}
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
          prices={prices}
            onSaved={onSaved}
            onCancel={requestClose}
            onDirtyChange={setDirty}
            cancelLabel="Close"
          />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
