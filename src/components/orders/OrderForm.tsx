"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp } from "lucide-react";
import {
  type Order,
  type OrderInput,
  type AmountKey,
  type Rates,
  ORDER_EXTRAS,
  jellyTotal,
  lineAssignedUnits,
  linePackedUnits,
  orderBalance,
  orderTotal,
  repriceOrder,
  unitsPerPackageMap,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import type { Client } from "@/lib/clients";
import { LastEdited } from "@/components/LastEdited";
import { UndoRedo } from "@/components/UndoRedo";
import { saveError } from "@/components/saveError";
import { useModalHeaderSlot } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { useIsMobile } from "@/components/useMediaQuery";
import { useUndoable, useUndoShortcuts } from "@/components/useUndoable";
import { OrderCustomerPanel } from "./OrderCustomerPanel";
import { OrderEventPanel } from "./OrderEventPanel";
import { OrderMoneyRail } from "./OrderMoneyRail";
import { money } from "./OrderSheet";
import {
  PackageLineEditor,
  toDraftLines,
  toPackageLines,
  type DraftPackageLine,
} from "./PackageLineEditor";

/**
 * The form's three tabs, in the order an order is actually filled in:
 * who it is for, what the event needs, then what goes in the trays.
 *
 * Three rather than the two this replaced. Details had grown to hold the
 * customer, the event *and* the money in one 3-column sheet, which meant
 * every one of them was a third of a panel wide and the money — the part
 * read most often — could only be seen while that tab was open. Splitting
 * the first two frees the money to sit in a rail beside all three.
 */
const TABS = [
  { id: "customer", label: "Customer" },
  { id: "event", label: "Event" },
  { id: "content", label: "Content" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * `vatRate` is passed in rather than read here: a new order takes today's
 * rate as its own, and an existing one keeps whatever it was booked at.
 * That is the whole point of storing it on the row.
 */
function draftFromOrder(order: Order | undefined, vatRate: number): OrderInput {
  if (!order) {
    return {
      date: new Date().toISOString().slice(0, 10),
      customer: "",
      clientId: null,
      customerType: "",
      location: "",
      guests: null,
      mirrors: null,
      displays: [],
      waitresses: null,
      kosher: false,
      packageLines: [],
      totalAmount: 0,
      deliveryCost: null,
      deliveryOptionId: null,
      mirrorsCost: null,
      displayCost: null,
      waitressCost: null,
      kosherCost: null,
      discount: 0,
      discountIsPercent: false,
      vatMode: "included",
      vatRate,
      deposit: 0,
      paymentStatus: "unpaid",
      productionStatus: "queue",
      notes: "",
    };
  }
  return {
    date: order.date,
    customer: order.customer,
    clientId: order.clientId,
    customerType: order.customerType,
    location: order.location,
    guests: order.guests,
    mirrors: order.mirrors,
    displays: order.displays,
    waitresses: order.waitresses,
    kosher: order.kosher,
    packageLines: order.packageLines,
    totalAmount: order.totalAmount,
    deliveryCost: order.deliveryCost,
    deliveryOptionId: order.deliveryOptionId,
    mirrorsCost: order.mirrorsCost,
    displayCost: order.displayCost,
    waitressCost: order.waitressCost,
    kosherCost: order.kosherCost,
    discount: order.discount,
    discountIsPercent: order.discountIsPercent,
    vatMode: order.vatMode,
    vatRate: order.vatRate,
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
function manualAmounts(draft: OrderInput, rates: Rates, jelly: number): Set<AmountKey> {
  const auto = repriceOrder(draft, rates, new Set(), jelly);
  const manual = new Set<AmountKey>();
  if (draft.totalAmount !== auto.totalAmount) manual.add("jelly");
  for (const extra of ORDER_EXTRAS) {
    if (extra.applies(draft) && (draft[extra.cost] ?? 0) !== (auto[extra.cost] ?? 0)) {
      manual.add(extra.id);
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
  clients,
  rates,
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
  /** Everyone on file, for the customer field's picker. */
  clients: Client[];
  /** The owner's standard rates — see `priced` below for how they apply. */
  rates: Rates;
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
    const draft = draftFromOrder(order, rates.prices.vat_rate);
    const packed = unitsPerPackageMap(packageTypes);
    const lines = toDraftLines(order?.packageLines ?? [], presets, packed);
    const jelly = jellyTotal(toPackageLines(lines), packed, rates.prices);
    return { draft, lines, payload: serialize(draft, lines), manual: manualAmounts(draft, rates, jelly) };
  });
  /*
   * The three pieces of the form, under one undo history.
   *
   * One history rather than three, because a step back has to be
   * consistent: the flavour split drives the unit count, the unit count
   * drives the price, and which amounts are hand-set says how the price is
   * read. Undoing any of those without the others would leave the form
   * saying something nobody typed.
   *
   * `manual` rides along for the same reason — it describes how the draft
   * is being edited rather than anything the order stores, but an undo
   * that restored an amount and left it flagged as hand-set would put the
   * money back and then refuse to recompute it.
   */
  const form = useUndoable<{
    draft: OrderInput;
    lines: DraftPackageLine[];
    // Readonly here, like the prop the rail takes: the set is replaced on
    // every change, never mutated, which is what makes a snapshot of it a
    // snapshot rather than a live reference into the present.
    manual: ReadonlySet<AmountKey>;
  }>({ draft: initial.draft, lines: initial.lines, manual: initial.manual });
  const { draft, lines, manual } = form.value;
  const setForm = form.set;

  /*
   * The panels take plain setters and know nothing about the history.
   *
   * Deliberately no "did this actually change?" guard here: every panel
   * builds a fresh object, array or Set before calling back, so comparing
   * references would never be true and comparing structures would mean
   * deep-equalling the whole draft on every keystroke. A control that has
   * nothing to report says nothing instead — see `ChipSpread` and
   * `Segmented`, which is where a click on the already-chosen option used
   * to become a step in the history.
   */
  const setDraft = useCallback(
    (next: OrderInput) => setForm((state) => ({ ...state, draft: next })),
    [setForm],
  );
  const setLines = useCallback(
    (next: DraftPackageLine[]) => setForm((state) => ({ ...state, lines: next })),
    [setForm],
  );
  const setManual = useCallback(
    (next: ReadonlySet<AmountKey>) => setForm((state) => ({ ...state, manual: next })),
    [setForm],
  );

  useUndoShortcuts(form.undo, form.redo);
  const [busy, setBusy] = useState(false);
  /**
   * Set when the save did not go through — someone else changed the order
   * while this form was open, or the write failed outright. Either way the
   * form stays open holding the draft, which is the only copy of this
   * work. It stays until the form is closed: the one thing that must not
   * happen is the message vanishing while the work it describes is still
   * at risk.
   */
  const [failed, setFailed] = useState<string | null>(null);
  /*
   * The phone for a client this order is about to create. Held here rather
   * than on the draft because it belongs to the *client*, not the order —
   * and the client only exists once the order is saved, so that a
   * half-filled form abandoned halfway leaves nothing behind.
   */
  const [newClientPhone, setNewClientPhone] = useState("");
  const [tab, setTab] = useState<TabId>("customer");
  /**
   * The phone's money sheet — the rail, opened from the bar above the
   * save row. Desktop never sets it: the rail is on screen there.
   */
  const [moneyOpen, setMoneyOpen] = useState(false);
  /*
   * Whether the tabs go in the dialog's title row or inline above the
   * panels. A phone's title row is a title and a close button with no
   * middle to lend, so below the breakpoint the form uses the inline
   * fallback the slot was invented to replace.
   */
  const mobile = useIsMobile();

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
  const priced = repriceOrder(draft, rates, manual, jellyTotal(toPackageLines(lines), unitsPerPackage, rates.prices));

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
  // sit on and read as three loose buttons.
  // The track is white rather than cream: it sits inside the dialog's
  // header band, which is itself a shade of the cream, and two tones that
  // close together read as one smudged pill.
  const tabs = (
    /* On a phone the strip is the full width of the dialog and its track
       is a tint rather than white: inline under the band it would sit on
       `bg-card`, which is what it is, and the three pills would read as
       three loose buttons on nothing. */
    <div
      role="tablist"
      className="flex items-center gap-0.5 rounded-full bg-card p-0.5 max-md:w-full max-md:bg-ink/[0.07]"
    >
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1 text-xs font-bold transition max-md:flex-1 max-md:justify-center max-md:py-2 max-md:text-sm ${
            tab === id ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
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
    setFailed(null);
    /*
     * A name nobody has ordered under before becomes a client now, at
     * save, rather than as it was typed. If this fails the order is still
     * saved — with its customer name and no link — because losing a
     * booking to a failed lookup would be the worse outcome, and the
     * Clients page can link it afterwards.
     */
    let clientId = priced.clientId;
    if (clientId === null && priced.customer.trim()) {
      try {
        const response = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: priced.customer, phone: newClientPhone }),
        });
        if (response.ok) clientId = (await response.json()).id;
      } catch {
        // Left null: the order saves, the link doesn't.
      }
    }
    // "replace" is explicit: this sends the whole order, not a patch.
    // `expectedUpdatedAt` is the version this form was opened on, so the
    // save is refused rather than applied if someone else has since
    // changed the order — see StaleWriteError in orders.ts.
    const response = await fetch(isEdit ? `/api/orders/${order!.key}` : "/api/orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "replace",
        ...priced,
        clientId,
        packageLines: toPackageLines(lines),
        ...(isEdit ? { expectedUpdatedAt: order!.updatedAt } : {}),
      }),
    });
    setBusy(false);
    // The form stays open holding the draft: it is the only copy of this
    // work now, and closing it would be the loss the guard exists to
    // prevent — on a refused save and on a failed one alike.
    const failure = await saveError(response, "order");
    if (failure) {
      setFailed(failure);
      return;
    }
    onSaved();
  }

  /*
    One set of props, two placements: the column beside the panels on a
    laptop, and the money sheet on a phone. Only one is ever in the tree —
    each half is hidden at the other's width — and stating the nine props
    once is what stops the two drifting apart.
  */
  const railProps = {
    draft: priced,
    onChange: setDraft,
    totalUnits,
    unassignedUnits,
    overAssignedUnits,
    rates,
    manual,
    onManualChange: setManual,
    onOpenContent: () => {
      setTab("content");
      setMoneyOpen(false);
    },
  };
  const rail = <OrderMoneyRail {...railProps} />;
  const railInSheet = <OrderMoneyRail {...railProps} showHeading={false} />;

  return (
    <>
      {/*
        Three tabs rather than one long scroll: who the order is for, what
        the event needs and how the trays are packed are separate jobs,
        usually done at different times — an order is booked first and
        mixed later. The money rail beside them carries the unit count, so
        no tab has to restate it.

        They ride in the dialog's title row when there is one, which buys
        back the whole row plus its rule — worth having in a popup already
        tall enough to crowd a laptop. Rendered inline when there is no
        modal around them, so the form still works on its own.
      */}
      {headerSlot && !mobile ? (
        createPortal(tabs, headerSlot)
      ) : (
        /* On a phone the title row is a title and a close button and has
           no middle to lend, so the form falls back to the inline strip
           the slot was invented to replace. */
        <div className="mb-4 max-md:mb-3 max-md:shrink-0">{tabs}</div>
      )}

      {/*
        The panels scroll; the rail does not. Money and unit coverage stay
        on screen whichever tab is open, which is what the three-tab split
        bought — pricing an order is a conversation that moves between
        what the event is and what it costs, and a tab switch in the
        middle of that is a switch too many.

        One fixed-height, scrolling body holding every panel, so the popup
        is exactly the same size on every tab. Letting it size to its
        contents made the whole dialog jump and re-centre on each switch.
      */}
      <div className="flex h-[min(56vh,31rem)] gap-6 max-md:h-auto max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:gap-0">
        <div className="min-w-0 flex-1 overflow-y-auto pr-1 max-md:min-h-0">
          {/*
            Every panel stays mounted while hidden, not unmounted:
            switching tabs would otherwise throw away which package line
            was open and any half-typed number in it.
          */}
          <div role="tabpanel" className={tab === "customer" ? "" : "hidden"}>
            <OrderCustomerPanel
              draft={priced}
              onChange={setDraft}
              clients={clients}
              newClientPhone={newClientPhone}
              onNewClientPhone={setNewClientPhone}
            />
          </div>

          <div role="tabpanel" className={tab === "event" ? "" : "hidden"}>
            <OrderEventPanel draft={priced} onChange={setDraft} rates={rates} />
          </div>

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

        {/* The rail is a column beside the panels on a laptop. On a phone
            there is no room for a second column, so it moves behind the
            money bar below — same component, same props. */}
        <div className="w-[20rem] shrink-0 overflow-y-auto max-md:hidden">{rail}</div>
      </div>

      {/*
        The money bar: the rail's two figures, always on screen, opening
        the rail itself.

        The rail exists because a number you have to go and look at is a
        number nobody looks at, and on a phone there is no second column
        to keep it in. A strip above the buttons keeps the total and the
        balance in view while the panels scroll, and a tap brings up
        everything behind them — the amounts, the discount, the VAT mode
        and the deposit — from the bottom edge, which is where this app
        opens anything that is a set of controls rather than a record.

        Drawn in the rail's own black, so what opens is visibly the thing
        the strip is the front of.
      */}
      <button
        type="button"
        onClick={() => setMoneyOpen(true)}
        className="money-rail mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-left md:hidden"
      >
        <span className="flex flex-col">
          <span className="text-[10px] font-bold tracking-[0.1em] text-cream/55 uppercase">Total</span>
          <span className="font-display text-lg leading-tight font-extrabold tabular-nums text-cream">
            {money(orderTotal(priced))}
          </span>
        </span>
        <span className="flex flex-1 flex-col items-end">
          <span className="text-[10px] font-bold tracking-[0.1em] text-cream/55 uppercase">
            {orderBalance(priced) < 0 ? "Overpaid by" : "Balance due"}
          </span>
          <span className="font-display text-lg leading-tight font-extrabold tabular-nums text-cream">
            {money(Math.abs(orderBalance(priced)))}
          </span>
        </span>
        <ChevronUp size={18} className="shrink-0 text-cream/55" />
      </button>

      {moneyOpen && (
        <Sheet title="The order" onClose={() => setMoneyOpen(false)}>
          {/* The sheet's title row is the rail's heading here, so the
              rail drops its own — the same words twice, one above the
              other. */}
          <div className="px-4 pb-4">{railInSheet}</div>
        </Sheet>
      )}

      {/* Actions right, status left: the buttons sit where the eye ends up
          after reading the form, and every popup in the app puts them
          there. Save is last, nearest the corner. */}
      <div className="mt-6 flex items-center gap-2 max-md:mt-3 max-md:shrink-0 max-md:flex-wrap max-md:gap-y-2">
        {/* The caption leads the row, at its left end, where it costs no
            height: it should not make an already tall popup taller. */}
        {isEdit && <LastEdited at={order!.updatedAt} by={order!.updatedBy} />}
        {/* The shortcut, made visible — see UndoRedo. */}
        <UndoRedo form={form} />
        {failed && (
          <span className="text-xs font-semibold text-red-700" role="alert">
            {failed}
          </span>
        )}
        {/* Nothing here saves as you type, so say so while it's still fixable. */}
        {!failed && dirty && (
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

        {/* Unconditional, because everything to its left is not: a row
            saved before this was recorded has no caption, and the buttons
            still belong in the corner. */}
        {/* `basis-full` below the breakpoint turns the spacer into a line
            break, so the two buttons get a row to themselves and can be
            half the screen each — a 26px pill in a corner is a cursor's
            target. It stays a plain spacer on a laptop. */}
        <span className="flex-1 max-md:basis-full" />
        <button
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink max-md:flex-1 max-md:py-2.5 max-md:text-sm"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          title={
            draft.customer.trim().length === 0 ? "Give the order a customer name first" : undefined
          }
          className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-40 max-md:flex-1 max-md:py-2.5 max-md:text-sm"
        >
          {isEdit ? "Save changes" : "Save order"}
        </button>
      </div>

    </>
  );
}
