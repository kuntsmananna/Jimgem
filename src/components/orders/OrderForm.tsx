"use client";

import { useEffect, useState } from "react";
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
import { useOrderTypes } from "@/components/OrderTypesContext";
import {
  NumberStepper,
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

/** Exactly what submit() sends, so "changed" means "would write something different". */
function serialize(draft: OrderInput, lines: DraftPackageLine[]): string {
  return JSON.stringify({ ...draft, packageLines: toPackageLines(lines) });
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
  onDirtyChange,
  cancelLabel = "Cancel",
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  onSaved: () => void;
  onCancel: () => void;
  /**
   * Fires when the form gains or loses unsaved edits, so the overlay
   * hosting it can warn before discarding them. Nothing in this form
   * saves on its own — unlike the Orders table's inline cells, which
   * commit on blur — and that difference is what made a closed pane look
   * like a failed save.
   */
  onDirtyChange?: (dirty: boolean) => void;
  cancelLabel?: string;
}) {
  const isEdit = !!order;
  // From the app-layout provider rather than a prop — see OrderTypesContext.
  const orderTypes = useOrderTypes();
  // Built once, so the starting values and the baseline they're compared
  // against can't drift apart — draftFromOrder stamps today's date for a
  // new order, and calling it twice could straddle midnight.
  const [initial] = useState(() => {
    const draft = draftFromOrder(order);
    const lines = toDraftLines(order?.packageLines ?? []);
    return { draft, lines, payload: serialize(draft, lines) };
  });
  const [draft, setDraft] = useState<OrderInput>(initial.draft);
  const [lines, setLines] = useState<DraftPackageLine[]>(initial.lines);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"details" | "content">("details");

  // Comparing what a save *would* send against what it started as makes
  // "dirty" mean "differs from the stored order" rather than "was
  // touched", so typing a character and undoing it stops warning.
  const dirty = serialize(draft, lines) !== initial.payload;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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

  const totalUnits = lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0);
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
      {/*
        Two tabs rather than one long scroll: the text fields and the
        packing are separate jobs, usually done at different times — an
        order is booked first and mixed later. The Content tab carries a
        unit count so you can see it is filled in without switching.
      */}
      <div className="mb-4 flex gap-0.5 rounded-full bg-cream p-0.5">
        {(["details", "content"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
              tab === id ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            {id}
            {id === "content" && totalUnits > 0 && (
              <span className={tab === id ? "text-cream/70" : "text-ink-soft/70"}>
                {nf.format(totalUnits)}u
              </span>
            )}
            {id === "content" && unbalanced.length > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Some units have no flavour" />
            )}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-2 gap-x-4 gap-y-2 ${tab === "details" ? "" : "hidden"}`}>
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
          {/*
            A dropdown over the managed list now, not free text. The blank
            option matters: an imported order can carry a type the owner
            hasn't added yet, and it has to stay selectable so saving the
            order doesn't silently retype it.
          */}
          <SelectInput
            value={draft.customerType}
            onChange={(e) => setDraft({ ...draft, customerType: e.target.value })}
          >
            <option value="">—</option>
            {orderTypes.map((type) => (
              <option key={type.id} value={type.name}>
                {type.name}
              </option>
            ))}
            {draft.customerType && !orderTypes.some((t) => t.name === draft.customerType) && (
              <option value={draft.customerType}>{draft.customerType} (not on the list)</option>
            )}
          </SelectInput>
        </Field>
        <Field label="Location">
          <TextInput
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </Field>
        {/* Counts, so they get the same stepper the package quantity has. */}
        <Field label="Guests">
          <NumberStepper
            label="guests"
            value={draft.guests}
            allowEmpty
            onChange={(guests) => setDraft({ ...draft, guests })}
          />
        </Field>
        <Field label="Mirrors">
          <NumberStepper
            label="mirrors"
            value={draft.mirrors}
            allowEmpty
            onChange={(mirrors) => setDraft({ ...draft, mirrors })}
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
        Kept mounted while hidden, not unmounted: switching tabs would
        otherwise throw away which package line was open and any
        half-typed number in it.
      */}
      <div className={tab === "content" ? "" : "hidden"}>
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
          title={
            draft.customer.trim().length === 0 ? "Give the order a customer name first" : undefined
          }
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

        {/* Nothing here saves as you type, so say so while it's still fixable. */}
        {dirty && (
          <span className="text-xs font-semibold text-amber-700" role="status">
            Unsaved changes
          </span>
        )}
        {/*
          The one reason Save is ever disabled. It used to give no
          explanation, so the button just looked broken.
        */}
        {draft.customer.trim().length === 0 && (
          <span className="text-xs text-ink-soft">Add a customer name to save</span>
        )}
      </div>
    </>
  );
}
