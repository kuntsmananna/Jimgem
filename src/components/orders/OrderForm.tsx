"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type Order,
  type OrderInput,
  type PriceKey,
  type Prices,
  ORDER_EXTRAS,
  lineAssignedUnits,
  linePackedUnits,
  repriceOrder,
  unitsPerPackageMap,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { useModalHeaderSlot } from "@/components/Modal";
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
      mirrors: null,
      waitresses: null,
      kosher: false,
      packageLines: [],
      totalAmount: 0,
      deliveryCost: null,
      mirrorsCost: null,
      waitressCost: null,
      kosherCost: null,
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
    mirrors: order.mirrors,
    waitresses: order.waitresses,
    kosher: order.kosher,
    packageLines: order.packageLines,
    totalAmount: order.totalAmount,
    deliveryCost: order.deliveryCost,
    mirrorsCost: order.mirrorsCost,
    waitressCost: order.waitressCost,
    kosherCost: order.kosherCost,
    deposit: order.deposit,
    paymentStatus: order.paymentStatus,
    productionStatus: order.productionStatus ?? "queue",
    notes: order.notes,
  };
}

/**
 * Which amounts on a stored order were set by hand.
 *
 * Derived by asking what the rates *would* have produced and seeing where
 * the order disagrees, rather than recorded in a column. That keeps
 * opening an order from silently rewriting its money — an amount already
 * agreed with a customer stays exactly as it is — while an amount that
 * matches the standard rate is still free to follow a change to the thing
 * it prices.
 *
 * A new order starts with nothing overridden: it has no amounts yet, so
 * there is nothing for the rates to disagree with.
 */
function manualAmounts(draft: OrderInput, prices: Prices, units: number): Set<PriceKey> {
  const auto = repriceOrder(draft, prices, new Set(), units);
  const manual = new Set<PriceKey>();
  if (draft.totalAmount !== auto.totalAmount) manual.add("unit");
  for (const extra of ORDER_EXTRAS) {
    if (extra.applies(draft) && (draft[extra.cost] ?? 0) !== (auto[extra.cost] ?? 0)) {
      manual.add(extra.priceKey);
    }
  }
  return manual;
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
  prices,
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
  /** The owner's standard rates — see `priced` below for how they apply. */
  prices: Prices;
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
    const packed = unitsPerPackageMap(packageTypes);
    const units = lines.reduce((sum, line) => sum + linePackedUnits(line, packed), 0);
    return { draft, lines, payload: serialize(draft, lines), manual: manualAmounts(draft, prices, units) };
  });
  const [draft, setDraft] = useState<OrderInput>(initial.draft);
  // Grows as amounts are typed over, and shrinks when one is handed back
  // to the rate. Held here rather than in `draft` because it describes how
  // the draft is being edited, not anything the order stores.
  const [manual, setManual] = useState<ReadonlySet<PriceKey>>(initial.manual);
  const [lines, setLines] = useState<DraftPackageLine[]>(initial.lines);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"details" | "content">("details");

  const unitsPerPackage = unitsPerPackageMap(packageTypes);
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

  /*
   * The draft with the standard rates applied — derived, never stored.
   * `draft` stays what was typed; this is what the panel shows and what
   * submit() sends.
   *
   * Deriving it is what makes the money side right when the *Content* tab
   * changes the unit count, which is a different tab and a different piece
   * of state. Writing the price into `draft` from an effect instead would
   * mean the two could be briefly out of step, and every path that touches
   * a line would have to remember to reprice.
   */
  const priced = repriceOrder(draft, prices, manual, totalUnits);

  // Comparing what a save *would* send against what it started as makes
  // "dirty" mean "differs from the stored order" rather than "was
  // touched", so typing a character and undoing it stops warning. It
  // compares the priced draft, because that is what a save writes.
  const dirty = serialize(priced, lines) !== initial.payload;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const canSave = draft.customer.trim().length > 0 && !busy;

  const headerSlot = useModalHeaderSlot();
  // A segmented pill rather than folder tabs: at the title's own height,
  // beside it, the joined-baseline treatment had no panel edge left to
  // sit on and read as two loose buttons.
  const tabs = (
    <div role="tablist" className="flex items-center gap-0.5 rounded-full bg-cream p-0.5">
      {(["details", "content"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1 text-xs font-bold capitalize transition ${
            tab === id ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {id}
          {id === "content" && totalUnits > 0 && (
            <span className={`font-semibold ${tab === id ? "text-cream/70" : "text-ink-soft"}`}>
              {nf.format(totalUnits)}u
            </span>
          )}
          {id === "content" && unbalanced.length > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Some units have no flavour" />
          )}
        </button>
      ))}
    </div>
  );

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    // "replace" is explicit: this sends the whole order, not a patch.
    await fetch(isEdit ? `/api/orders/${order!.key}` : "/api/orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "replace", ...priced, packageLines: toPackageLines(lines) }),
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

        They ride in the dialog's title row when there is one, which buys
        back the whole row plus its rule — worth having in a popup already
        tall enough to crowd a laptop. Rendered inline when there is no
        modal around them, so the form still works on its own.
      */}
      {headerSlot ? createPortal(tabs, headerSlot) : <div className="mb-4">{tabs}</div>}

      {/*
        One fixed-height, scrolling body holding both panels, so the popup
        is exactly the same size on either tab. Letting it size to its
        contents made the whole dialog jump and re-centre on every switch.
      */}
      <div className="h-[26rem] overflow-y-auto pr-1">

      <div role="tabpanel" className={tab === "details" ? "" : "hidden"}>
        <OrderDetailsPanel
          draft={priced}
          onChange={setDraft}
          totalUnits={totalUnits}
          prices={prices}
          manual={manual}
          onManualChange={setManual}
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

      {/* Actions right, status left: the buttons sit where the eye ends up
          after reading the form, and every popup in the app puts them
          there. Save is last, nearest the corner. */}
      <div className="mt-6 flex items-center gap-2">
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

        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink"
        >
          {cancelLabel}
        </button>
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
      </div>
    </>
  );
}
