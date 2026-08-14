"use client";

import { useEffect, useState } from "react";
import {
  type Order,
  type OrderInput,
  lineAssignedUnits,
  linePackedUnits,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { OrderDetailsPanel } from "./OrderDetailsPanel";
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
      {/* Real tabs: joined along a shared baseline, the active one sitting
          on the panel below it. The pill pair they replaced read as two
          separate buttons rather than one control with a body. */}
      <div role="tablist" className="-mx-6 mb-4 flex gap-1 border-b border-line px-6">
        {(["details", "content"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 rounded-t-lg border border-b-0 px-5 py-2 text-xs font-bold capitalize transition ${
              tab === id
                ? "border-line bg-card text-ink"
                : "border-transparent bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {id}
            {id === "content" && totalUnits > 0 && (
              <span className="font-semibold text-ink-soft">{nf.format(totalUnits)}u</span>
            )}
            {id === "content" && unbalanced.length > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Some units have no flavour" />
            )}
          </button>
        ))}
      </div>

      {/*
        One fixed-height, scrolling body holding both panels, so the popup
        is exactly the same size on either tab. Letting it size to its
        contents made the whole dialog jump and re-centre on every switch.
      */}
      <div className="h-[26rem] overflow-y-auto pr-1">

      <div role="tabpanel" className={tab === "details" ? "" : "hidden"}>
        <OrderDetailsPanel
          draft={draft}
          onChange={setDraft}
          totalUnits={totalUnits}
          onOpenContent={() => setTab("content")}
        />
      </div>

      {/*
        Kept mounted while hidden, not unmounted: switching tabs would
        otherwise throw away which package line was open and any
        half-typed number in it.
      */}
      <div role="tabpanel" className={tab === "content" ? "" : "hidden"}>
        <PackageLineEditor
          lines={lines}
          onChange={setLines}
          flavors={flavors}
          packageTypes={packageTypes}
          presets={presets}
        />
      </div>

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
