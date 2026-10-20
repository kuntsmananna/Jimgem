"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronUp, Ellipsis, Redo2, Trash2, Undo2 } from "lucide-react";
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
import { sendWrite } from "@/components/saveError";
import { useModalHeaderSlot } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { useIsMobile } from "@/components/useMediaQuery";
import { useUndoable, useUndoShortcuts } from "@/components/useUndoable";
import { OrderCustomerPanel } from "./OrderCustomerPanel";
import { OrderEventPanel } from "./OrderEventPanel";
import { OrderMoneyRail } from "./OrderMoneyRail";
import { OrderReview } from "./OrderReview";
import { GroupLabel, money } from "./OrderSheet";
import { useCanSeeMoney } from "@/components/RoleContext";
import {
  PackageLineEditor,
  toDraftLines,
  toPackageLines,
  type DraftPackageLine,
} from "./PackageLineEditor";
import { JellyHop } from "@/components/JellyLoader";

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
 * Adding an order on a phone is a sequence of steps, not three tabs
 * (v0.83, the owner's pick from three shapes): who it is for, the event,
 * what to make, then the whole order read back before it is saved. A
 * booking taken standing up is a conversation in that order, and a single
 * Next button carries it with one thumb — where tabs asked which of three
 * screens to fill in next and left the last one to be found. Editing
 * keeps the tabs: a correction is a jump to one field, not a walk.
 */
const STEPS = [
  { tab: "customer", title: "Who it's for" },
  { tab: "event", title: "The event" },
  { tab: "content", title: "What to make" },
  { tab: null, title: "Review and save" },
] as const;

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
      paymentMethodId: null,
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
    paymentMethodId: order.paymentMethodId,
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
  onDelete,
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
   * Delete this order. Drawn below the breakpoint only, like the expense
   * form's: on a laptop an order is deleted from the table's bulk bar,
   * which is reached through a hover-revealed checkbox — an affordance a
   * phone does not have and a card deliberately does not carry.
   */
  onDelete?: () => void;
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
   * Whether this form has a money side at all.
   *
   * `showMoney` rather than `money` because that name is already the
   * shekel formatter imported from `OrderSheet` — and a flag shadowing a
   * formatter is the kind of collision that compiles and then prints
   * "true" where an amount should be.
   */
  const showMoney = useCanSeeMoney();
  /*
   * Whether the tabs go in the dialog's title row or inline above the
   * panels. A phone's title row is a title and a close button with no
   * middle to lend, so below the breakpoint the form uses the inline
   * fallback the slot was invented to replace.
   */
  const mobile = useIsMobile();
  /** The step flow — a new order, on a phone. See `STEPS`. */
  const wizard = mobile && !isEdit;
  const [step, setStep] = useState(0);
  const onReview = wizard && step === STEPS.length - 1;
  /**
   * Set when Next is pressed on the first step with no name: the step says
   * why it did not move rather than refusing silently, and only once it
   * has been tried — the rule `ExpenseFormModal` follows.
   */
  const [nameMissing, setNameMissing] = useState(false);
  /** The phone's ⋯ sheet for an existing order: history, undo, delete. */
  const [actionsOpen, setActionsOpen] = useState(false);
  const panels = useRef<HTMLDivElement>(null);

  function goToStep(next: number) {
    setStep(next);
    const target = STEPS[next]?.tab;
    if (target) setTab(target);
    // Each step starts at its top, not wherever the last one was left.
    panels.current?.scrollTo({ top: 0 });
  }

  function next() {
    if (step === 0 && !draft.customer.trim()) {
      setNameMissing(true);
      return;
    }
    goToStep(step + 1);
  }

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
    const { error: failure } = await sendWrite("order", isEdit ? `/api/orders/${order!.key}` : "/api/orders", {
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
    // prevent — on a refused save, a failed one and one that never arrived.
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
      if (wizard) goToStep(2);
      else setTab("content");
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
        <div className="mb-4 max-md:mb-3 max-md:shrink-0">
          {wizard ? (
            <StepHeader step={step} />
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{tabs}</div>
              {/* Everything about an order that is not the order — when it
                  was last changed, undo, delete — behind one button, so the
                  bottom of the screen is the total and Save and nothing else. */}
              {mobile && isEdit && (
                <button
                  type="button"
                  onClick={() => setActionsOpen(true)}
                  aria-label="More actions"
                  className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-ink"
                >
                  <Ellipsis size={18} />
                </button>
              )}
            </div>
          )}
        </div>
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
        <div ref={panels} className="min-w-0 flex-1 overflow-y-auto pr-1 max-md:min-h-0">
          {/*
            Every panel stays mounted while hidden, not unmounted:
            switching tabs would otherwise throw away which package line
            was open and any half-typed number in it.
          */}
          <div role="tabpanel" className={tab === "customer" && !onReview ? "" : "hidden"}>
            <OrderCustomerPanel
              draft={priced}
              onChange={setDraft}
              clients={clients}
              newClientPhone={newClientPhone}
              onNewClientPhone={setNewClientPhone}
            />
          </div>

          <div role="tabpanel" className={tab === "event" && !onReview ? "" : "hidden"}>
            <OrderEventPanel draft={priced} onChange={setDraft} rates={rates} />
          </div>

          <div role="tabpanel" className={tab === "content" && !onReview ? "" : "hidden"}>
            <PackageLineEditor
              lines={lines}
              onChange={setLines}
              flavors={flavors}
              packageTypes={packageTypes}
              presets={presets}
            />
          </div>

          {onReview && (
            <div className="motion-fade">
              <OrderReview
                draft={priced}
                lines={toPackageLines(lines)}
                flavors={flavors}
                packageTypes={packageTypes}
                unitsPerPackage={unitsPerPackage}
                onEdit={goToStep}
              />
              {/* The money in full, last: the price is what is most often
                  adjusted at the end, so it is open here rather than behind
                  the total. */}
              {showMoney && (
                <div className="mt-5">
                  {/* Ruled like the review's other sections (v0.84.4), so the
                      rail's own unruled caption gives way to it. */}
                  <GroupLabel>
                    The price
                  </GroupLabel>
                  {railInSheet}
                </div>
              )}
            </div>
          )}
        </div>

        {/* The rail is a column beside the panels on a laptop. On a phone
            there is no room for a second column, so it moves behind the
            money bar below — same component, same props.

            Not rendered at all on a staff account: the rail *is* the
            money, every row of it, so there is nothing to strip out of it
            and the panels take the width back. */}
        {showMoney && <div className="w-[20rem] shrink-0 overflow-y-auto max-md:hidden">{rail}</div>}
      </div>

      {showMoney && moneyOpen && (
        <Sheet title="The order" onClose={() => setMoneyOpen(false)}>
          {/* The sheet's title row is the rail's heading here, so the
              rail drops its own — the same words twice, one above the
              other. */}
          <div className="px-4 pb-4">{railInSheet}</div>
        </Sheet>
      )}

      {mobile && (
        <PhoneFooter
          total={showMoney ? money(orderTotal(priced)) : null}
          balance={orderBalance(priced)}
          onOpenMoney={() => setMoneyOpen(true)}
          showTotal={showMoney && !onReview}
          message={
            failed ??
            (nameMissing && !draft.customer.trim() ? "Add who the order is for to continue." : null)
          }
          onBack={wizard && step > 0 ? () => goToStep(step - 1) : undefined}
          primary={
            wizard && !onReview
              ? { label: "Next", icon: true, onClick: next }
              : { label: isEdit ? "Save changes" : "Save order", onClick: submit, disabled: !canSave, busy }
          }
        />
      )}

      {mobile && actionsOpen && (
        <Sheet title="This order" onClose={() => setActionsOpen(false)}>
          <div className="flex flex-col gap-2 px-4 pb-5">
            {isEdit && (
              <div className="px-1 pb-1">
                <LastEdited at={order!.updatedAt} by={order!.updatedBy} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={form.undo}
                disabled={!form.canUndo}
                className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink/[0.06] text-sm font-semibold disabled:opacity-35"
              >
                <Undo2 size={16} />
                Undo
              </button>
              <button
                type="button"
                onClick={form.redo}
                disabled={!form.canRedo}
                className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink/[0.06] text-sm font-semibold disabled:opacity-35"
              >
                <Redo2 size={16} />
                Redo
              </button>
            </div>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  onDelete();
                }}
                className="press mt-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-700/30 text-sm font-semibold text-red-700"
              >
                <Trash2 size={16} />
                Delete this order
              </button>
            )}
          </div>
        </Sheet>
      )}

      {/* Actions right, status left: the buttons sit where the eye ends up
          after reading the form, and every popup in the app puts them
          there. Save is last, nearest the corner. */}
      {!mobile && (
      <div className="mt-6 flex items-center gap-2 max-md:mt-3 max-md:shrink-0 max-md:flex-wrap max-md:gap-y-2">
        {/* First in the row and so as far from Save as it goes — where the
            client card puts Archive and the expense form its own delete,
            for the same reason. Phone only: the desktop deletes from the
            table's bulk bar. */}
        {isEdit && onDelete && (
          <button
            onClick={onDelete}
            title="Delete this order"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft md:hidden"
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
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
          className="press rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink max-md:flex-1 max-md:py-2.5 max-md:text-sm"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          title={
            draft.customer.trim().length === 0 ? "Give the order a customer name first" : undefined
          }
          // Full strength while saving, so the loader inside reads as
          // working rather than as a button that has gone dead.
          className={`press inline-flex min-w-[6.5rem] items-center justify-center rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream max-md:flex-1 max-md:py-2.5 max-md:text-sm ${
            busy ? "" : "disabled:opacity-40"
          }`}
        >
          {busy ? <JellyHop label="Saving the order" /> : isEdit ? "Save changes" : "Save order"}
        </button>
      </div>
      )}

    </>
  );
}

/**
 * Where a new order is, on a phone: the step's name, how far along, and a
 * bar of four segments that fill as it goes. The name is the step's
 * question rather than a tab label, since it is the heading the screen
 * under it answers.
 */
function StepHeader({ step }: { step: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-extrabold">{STEPS[step]!.title}</h3>
        <span className="shrink-0 text-xs font-semibold text-ink-soft tabular-nums">
          {step + 1} of {STEPS.length}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
        {STEPS.map((_, at) => (
          <span key={at} className="h-1 overflow-hidden rounded-full bg-ink/10">
            <span
              className={`block h-full rounded-full bg-black transition-transform duration-300 ease-[var(--ease-entrance)] origin-left ${
                at <= step ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The bottom of the order form on a phone (v0.83): one bar, the total on
 * the left and the one thing to do next on the right.
 *
 * It replaced three stacked rows — the money strip, a row of Delete, the
 * edit caption and undo, and Cancel beside Save — about 170px of a 844px
 * screen, under a keyboard that takes half of what is left. Cancel went
 * because the close button in the header already is one (with the same
 * unsaved-changes guard), and the rest moved behind the ⋯ in the tab row.
 * The total stays, as a tap target that opens the money sheet: a price you
 * cannot see while changing what it prices is the thing the rail exists to
 * prevent.
 */
function PhoneFooter({
  total,
  balance,
  onOpenMoney,
  showTotal,
  message,
  onBack,
  primary,
}: {
  total: string | null;
  balance: number;
  onOpenMoney: () => void;
  showTotal: boolean;
  message: string | null;
  onBack?: () => void;
  primary: { label: string; onClick: () => void; icon?: boolean; disabled?: boolean; busy?: boolean };
}) {
  return (
    <div className="mt-3 shrink-0">
      {message && (
        <p className="mb-2 text-sm font-semibold text-red-700" role="alert">
          {message}
        </p>
      )}
      <div className="flex items-stretch gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="press flex w-12 shrink-0 items-center justify-center rounded-2xl bg-ink/[0.07] text-ink"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {showTotal && total !== null ? (
          <button
            type="button"
            onClick={onOpenMoney}
            className="money-rail flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-4 py-2 text-left"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-display text-lg leading-tight font-extrabold tabular-nums text-cream">
                {total}
              </span>
              <span className="truncate text-[11px] font-semibold text-cream/60 tabular-nums">
                {balance < 0 ? "overpaid " : ""}
                {money(Math.abs(balance))} {balance < 0 ? "" : "due"}
              </span>
            </span>
            <span className="flex-1" />
            <ChevronUp size={18} className="shrink-0 text-cream/55" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className={`press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-black px-6 text-base font-semibold text-cream ${
            showTotal && total !== null ? "shrink-0" : "flex-1"
          } ${primary.busy ? "" : "disabled:opacity-40"}`}
        >
          {primary.busy ? (
            <JellyHop label="Saving the order" />
          ) : (
            <>
              {primary.label}
              {primary.icon && <ArrowRight size={18} />}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
