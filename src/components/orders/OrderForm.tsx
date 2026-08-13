"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  type Order,
  type OrderInput,
  type PaymentStatus,
  type ProductionStatus,
  lineAssignedUnits,
  linePackedUnits,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { Field, TextInput, SelectInput } from "@/components/Field";
import {
  PackageLineEditor,
  toDraftLines,
  toPackageLines,
  type DraftPackageLine,
} from "./PackageLineEditor";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function draftFromOrder(order?: Order): OrderInput {
  if (!order) {
    return {
      date: new Date().toISOString().slice(0, 10),
      customer: "",
      customerType: "",
      location: "",
      guests: null,
      deliveryCost: null,
      mirrors: null,
      packageLines: [],
      totalAmount: 0,
      deposit: 0,
      paymentStatus: "unpaid",
      productionStatus: "queue",
      notes: "",
    };
  }
  return {
    date: order.date,
    customer: order.customer,
    customerType: order.customerType,
    location: order.location,
    guests: order.guests,
    deliveryCost: order.deliveryCost,
    mirrors: order.mirrors,
    packageLines: order.packageLines,
    totalAmount: order.totalAmount,
    deposit: order.deposit,
    paymentStatus: order.paymentStatus,
    productionStatus: order.productionStatus ?? "queue",
    notes: order.notes,
  };
}

/**
 * The order form itself, with no surrounding chrome — rendered both in
 * the Add-order modal and in the row-click details pane so the two can
 * never drift apart.
 */
export function OrderForm({
  order,
  flavors,
  packageTypes,
  presets,
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  onSaved: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const isEdit = !!order;
  const [draft, setDraft] = useState<OrderInput>(() => draftFromOrder(order));
  const [lines, setLines] = useState<DraftPackageLine[]>(() => toDraftLines(order?.packageLines ?? []));
  const [busy, setBusy] = useState(false);

  const unitsPerPackage = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  // Lines whose flavours don't add up to what they pack. Reported, not
  // enforced: plenty of orders are booked before anyone knows the mix,
  // and refusing to save one loses the booking to protect a total nobody
  // is reading yet. The count is what units-sold and the flavour chart
  // may disagree about until it's filled in.
  const unbalanced = lines.filter((line) => linePackedUnits(line, unitsPerPackage) !== lineAssignedUnits(line));
  const unassignedUnits = unbalanced.reduce(
    (sum, line) => sum + Math.max(0, linePackedUnits(line, unitsPerPackage) - lineAssignedUnits(line)),
    0,
  );
  const overAssignedUnits = unbalanced.reduce(
    (sum, line) => sum + Math.max(0, lineAssignedUnits(line) - linePackedUnits(line, unitsPerPackage)),
    0,
  );

  const canSave = draft.customer.trim().length > 0 && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    // "replace" is explicit: this sends the whole order, not a patch.
    await fetch(isEdit ? `/api/orders/${order!.key}` : "/api/orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "replace", ...draft, packageLines: toPackageLines(lines) }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label="Date">
          <TextInput
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Customer">
          <TextInput
            value={draft.customer}
            onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <TextInput
            value={draft.customerType}
            onChange={(e) => setDraft({ ...draft, customerType: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <TextInput
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </Field>
        <Field label="Guests">
          <TextInput
            type="number"
            value={draft.guests ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                guests: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="Mirrors">
          <TextInput
            type="number"
            value={draft.mirrors ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                mirrors: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="Delivery ₪">
          <TextInput
            type="number"
            value={draft.deliveryCost ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                deliveryCost: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="Amount ₪">
          <TextInput
            type="number"
            value={draft.totalAmount}
            onChange={(e) => setDraft({ ...draft, totalAmount: Number(e.target.value) })}
          />
        </Field>
        <Field label="Deposit ₪">
          <TextInput
            type="number"
            value={draft.deposit}
            onChange={(e) => setDraft({ ...draft, deposit: Number(e.target.value) })}
          />
        </Field>
        <Field label="Payment status">
          <SelectInput
            value={draft.paymentStatus}
            onChange={(e) =>
              setDraft({
                ...draft,
                paymentStatus: e.target.value as PaymentStatus,
              })
            }
          >
            {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Production status">
          <SelectInput
            value={draft.productionStatus}
            onChange={(e) =>
              setDraft({
                ...draft,
                productionStatus: e.target.value as ProductionStatus,
              })
            }
          >
            {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((s) => (
              <option key={s} value={s}>
                {PRODUCTION_STATUS_LABEL[s]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Notes">
          <TextInput value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
      </div>

      {/*
        Content is set apart from the text fields above on purpose: it is
        picked and dragged, not typed.
      */}
      <div className="mt-6">
        <PackageLineEditor
          lines={lines}
          onChange={setLines}
          flavors={flavors}
          packageTypes={packageTypes}
          presets={presets}
        />
      </div>

      {unbalanced.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-amber-700" role="status">
          {overAssignedUnits > 0 &&
            `${nf.format(overAssignedUnits)} more units are assigned to flavours than the packaging holds. `}
          {unassignedUnits > 0 && `${nf.format(unassignedUnits)} units still need a flavour. `}
          You can still save and come back to it.
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSave}
          className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-40"
        >
          {isEdit ? "Save changes" : "Save order"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink"
        >
          {cancelLabel}
        </button>
      </div>
    </>
  );
}
