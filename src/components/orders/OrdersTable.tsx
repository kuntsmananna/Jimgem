"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  formatOrderDate,
  orderWeekday,
  hasDelivery,
  displayCount,
  isBooked,
  stageMap,
  orderFlavorUnits,
  orderTotal,
  orderUnits,
  orderWeekdayLong,
  stillDue,
  todayIso,
  unitsPerPackageMap,
  PAYMENT_STATUS_LABEL,
  type Order,
  type OrderInput,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { BadgeCheck, HandPlatter, Info, Pencil, Sparkles, Truck, UserRound, type LucideIcon } from "lucide-react";
import { useOrderType, useOrderTypes } from "@/components/OrderTypesContext";
import { useStages } from "@/components/ProductionStagesContext";
import { HoverCard } from "@/components/HoverCard";
import { Tip } from "@/components/Tip";
import { saveError } from "@/components/saveError";
import { eventType, orderTypeIconElement } from "@/lib/icons";
import { AmountHoverCard } from "./AmountHoverCard";
import { ContentHoverCard } from "./ContentHoverCard";
import { EditableCell } from "./EditableCell";
import { usePaymentMethods } from "./PaymentMethodsContext";
import { useVatView } from "@/components/VatViewContext";
import { PaymentStatusSelect, ProductionStatusSelect, stageHint } from "./StatusSelects";
import { cubeColors } from "@/components/JellyLoader";
import { useColumnWidths } from "./useColumnWidths";
import { count, currency } from "@/lib/money";
import { useIsAdmin } from "@/components/RoleContext";

/** Anything the row click must not hijack, because it does its own job. */
const INTERACTIVE = "button, input, select, textarea, a, label";

/**
 * The columns, in order, so each one has a name a stored width can be
 * keyed by (see `useColumnWidths`).
 *
 * **The body's cells are written out in this order and have to stay in
 * it** — a `<colgroup>` matches by position, so a column inserted here
 * without the matching `<td>` would silently re-width every cell after it.
 *
 * In reading order since v0.78, and grouped: when, then the order itself
 * (its state, who, where, how many), then what the kitchen makes, then the
 * money. It was fifteen columns in the order each had been added, so
 * finding one fact in a row meant reading most of it. `group` is what the
 * labels over the header are drawn from.
 */
export const COLUMNS = [
  { id: "when", label: "", group: null },
  { id: "select", label: "", group: "The order" },
  { id: "status", label: "Status", group: "The order" },
  { id: "customer", label: "Customer", group: "The order" },
  { id: "location", label: "Where", group: "The order" },
  { id: "guests", label: "Guests", group: "The order" },
  { id: "units", label: "Units", group: "What to make" },
  { id: "extras", label: "Extras", group: "What to make" },
  { id: "amount", label: "Total", group: "Money" },
  { id: "due", label: "Still due", group: "Money" },
  { id: "payment", label: "Payment", group: "Money" },
] as const;

/**
 * Columns the Columns menu never offers. The day and the tick box are how
 * the list is read and worked rather than facts about an order, and with
 * both always there the table can never render with nothing in it.
 */
export const FIXED_COLUMNS: readonly string[] = ["when", "select"];

/** Right-aligned, in tabular figures: the columns that are numbers. */
const NUMERIC = new Set(["guests", "units", "amount", "due"]);

/**
 * The columns that are money.
 *
 * A staff account is never shown them and is never offered them in the
 * Columns menu — see `OrdersClient`, which folds them into the hidden set
 * rather than teaching the table a second way to leave a column out. Named
 * here beside `COLUMNS` so the two cannot drift: a money column added to
 * that list and forgotten here would be one a staff account could switch
 * back on.
 */
export const MONEY_COLUMNS = ["amount", "due", "payment"] as const;

export function OrdersTable({
  orders,
  flavors,
  packageTypes,
  presets,
  selectedKeys,
  openKey,
  onToggleSelect,
  onToggleAll,
  onChanged,
  onOpen,
  onOpenClient,
  emptyNote,
  hidden,
  onUndoable,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  /** Passed through to the content hover card, for naming a saved mix. */
  presets: ContentPreset[];
  selectedKeys: Set<string>;
  /** Row whose details pane is open — stays highlighted so you don't lose your place. */
  openKey: string | null;
  onToggleSelect: (key: string) => void;
  onToggleAll: () => void;
  onChanged: () => void;
  onOpen: (key: string) => void;
  /** Opens that client's card over this page — see OrdersClient. */
  onOpenClient: (clientId: number) => void;
  /** What to say when nothing is in view — names the active time scope. */
  emptyNote: string;
  /** Columns the owner has switched off — see `ColumnsMenu`. */
  hidden: ReadonlySet<string>;
  /** Offers a change back on the page's Undo bar — see `useUndoToast`. */
  onUndoable?: (message: string, undo: () => Promise<void>) => void;
}) {
  /*
   * Whether the tick boxes are drawn at all.
   *
   * Read from the context rather than taken as a prop, for the reason
   * `RoleContext` gives: the answer is the same everywhere and threading
   * it through would touch every caller to say one thing. Every bulk
   * action behind those boxes is an admin's — the batch route refuses the
   * lot — so on a staff account they would be a control that leads only to
   * a 403. Since v0.78 the column goes with them: the gutter the boxes used
   * to hang in is the day column now, so nothing depends on it being there.
   */
  const selectable = useIsAdmin();
  const { forOrder } = useVatView();
  const paymentMethods = usePaymentMethods();
  // From the app-layout provider rather than a prop — see OrderTypesContext.
  const orderTypes = useOrderTypes();
  // A row is provisional when its stage says it is not income yet — the
  // owner's flag, not the word "offer", so a second quote-like stage gets
  // the same treatment without another special case here.
  const stageIndex = stageMap(useStages());
  const unitsPerPackage = unitsPerPackageMap(packageTypes);
  const flavorById = new Map(flavors.map((flavor) => [String(flavor.id), flavor]));
  // Built once rather than per row: the list is the same for all 74 of
  // them, and a fresh array per row also denies the cell any reuse.
  const typeOptions = orderTypes
    // Archived types stay out of the picker. A row already carrying one
    // keeps it — `EditableCell` adds the current value when it is missing.
    .filter((type) => !type.archivedAt)
    .map((type) => ({ value: type.name, label: type.name }));
  const allSelected = orders.length > 0 && orders.every((o) => selectedKeys.has(o.key));
  const someSelected = selectedKeys.size > 0;
  const today = todayIso();
  // Desktop-only by construction: the phone renders `OrdersMobileList`
  // instead and this table is never on screen there.
  /*
    Everything downstream — the header, the `<colgroup>`, the body's cells
    and the stored widths — works off the *visible* list, and a `<col>`
    matches by position, so the three have to agree.
  */
  const visible = useMemo(
    () => COLUMNS.filter((column) => !hidden.has(column.id) && (selectable || column.id !== "select")),
    [hidden, selectable],
  );
  const show = (id: string) => visible.some((column) => column.id === id);
  // Memoised because the hook holds it as a dependency of its own; a fresh
  // array every render would re-parse the stored widths on each pass.
  const visibleIds = useMemo(() => visible.map((column) => column.id), [visible]);
  const { widths: pinned, headRef, startResize, reset } = useColumnWidths(visibleIds);
  /*
   * A table whose columns have been dragged is as wide as they add up to,
   * which on a big screen stopped it well short of the page (v0.78.1). The
   * room left over goes to the Customer column — the one with the most
   * text to show — rather than being shared out across all of them, which
   * is what made a column dragged narrower barely move. The stored widths
   * are untouched; this is only what is drawn.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const watch = new ResizeObserver(() => setRoom(box.clientWidth));
    watch.observe(box);
    return () => watch.disconnect();
  }, []);
  const widths = useMemo(() => {
    if (!pinned) return null;
    const used = visibleIds.reduce((sum, id) => sum + (pinned[id] ?? 0), 0);
    // `pr-6` on the table is the shadow's room, so it is not slack.
    const slack = room - 24 - used;
    const taker = visibleIds.includes("customer") ? "customer" : visibleIds[visibleIds.length - 1];
    return slack > 0 && taker ? { ...pinned, [taker]: (pinned[taker] ?? 0) + slack } : pinned;
  }, [pinned, room, visibleIds]);
  /*
    The labels over the header: one per run of neighbouring columns in the
    same group, spanning however many of them are on screen — so hiding
    Guests narrows "The order" rather than leaving a label over nothing.
  */
  const groups = useMemo(() => {
    const runs: { label: string | null; span: number }[] = [];
    for (const column of visible) {
      const last = runs[runs.length - 1];
      if (last && last.label === column.group) last.span++;
      else runs.push({ label: column.group, span: 1 });
    }
    return runs;
  }, [visible]);

  async function saveField(order: Order, patch: Partial<OrderInput>) {
    // Every order is a DB row since the import change, so a single-field
    // patch is all the API needs — no full-row replace, no override path.
    // `expectedUpdatedAt` is the version this row was rendered from: an
    // inline edit is quick, but the page it sits on can be an hour old.
    const response = await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", ...patch, expectedUpdatedAt: order.updatedAt }),
    });
    // A refused edit is announced rather than swallowed: the cell has
    // already shown the new value, so saying nothing would leave a number
    // on screen that isn't in the database. `onChanged` re-reads the row
    // and puts the real one back.
    const failure = await saveError(response, "order");
    if (failure) alert(failure);
    onChanged();
  }

  /**
   * One guard for the whole row rather than a stopPropagation on each
   * cell: clicking a value edits it in place, clicking anywhere else
   * opens the details pane. Stated once, so a new column can't silently
   * hijack an edit by forgetting to opt out.
   */
  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, key: string) {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    onOpen(key);
  }

  return (
    /*
      Padded at the bottom so a hovered row's shadow has room before the
      scroller clips it; the right-hand room is on the table itself (see
      below). `quiet-scroll` keeps the bar thin and pale.
    */
    <div ref={scroller} className="quiet-scroll max-h-[70vh] overflow-auto pb-6">
      {/*
        `border-separate` with a vertical gap is what makes each row a box
        rather than a band in a ledger — see the block in globals.css.

        **`w-full` until a column is dragged** (v0.76): a list with room to
        spare spreads across the page rather than stopping where its content
        does. Once the columns are pinned (`table-fixed`) the table is as
        wide as its `<col>`s add up to instead: at 100% a fixed table shares
        any width taken off one column back out across all of them, so a
        column dragged narrower barely moved while its neighbours grew.

        `pr-6` on the table, not the scroller: Chromium clips a hovered
        row's drop-shadow to the *table's* box, so room outside the table
        does nothing. The left has the day column inside it.

        `is-selecting` keeps every tick box showing once any is ticked — see
        `.pick-box` in globals.css.
      */}
      <table
        className={`border-separate border-spacing-x-0 border-spacing-y-1.5 pr-6 text-left text-sm ${
          widths ? "table-fixed" : "w-full"
        } ${someSelected ? "is-selecting" : ""}`}
      >
        {widths && (
          <colgroup>
            {visible.map(({ id }) => (
              <col key={id} style={{ width: widths[id] }} />
            ))}
          </colgroup>
        )}
        {/* Cream and opaque: it sits on the page, and the boxes scroll
            behind it rather than through it. */}
        <thead className="sticky top-0 z-20 bg-cream">
          <tr aria-hidden>
            {groups.map((group, at) => (
              <th key={at} colSpan={group.span} className="bg-cream px-2 pt-1">
                {group.label && (
                  <span className="block border-b border-line pb-1 text-[9.5px] font-bold tracking-[0.16em] text-ink-soft/70 uppercase">
                    {group.label}
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr ref={headRef} className="text-[10.5px] font-bold tracking-[0.06em] text-ink-soft uppercase">
            {visible.map(({ id, label }, at) => (
              <th
                key={id}
                // The day column has no title: every first row of a day
                // already says what it is, and a word over it was one more
                // thing to read before the first order.
                aria-label={id === "when" ? "Date" : undefined}
                className={`relative bg-cream px-2 pt-1.5 pb-1 ${NUMERIC.has(id) ? "text-right" : ""} ${
                  !widths && id === "when" ? "w-16" : ""
                } ${!widths && id === "select" ? "w-8" : ""}`}
              >
                {id === "select" ? (
                  <Tip label="Select every order in the list" className="inline-flex">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(box) => {
                        if (box) box.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={onToggleAll}
                      aria-label="Select all"
                      className="pick-box"
                    />
                  </Tip>
                ) : (
                  label
                )}
                {/*
                  The grab strip, straddling the column's right edge. It is
                  invisible until the pointer is on it: permanent hairlines
                  would draw the ledger this table is trying not to be.

                  Double-click hands the whole table back to the automatic
                  layout, which is the only "reset" that means anything —
                  once a column is pinned there is no natural width left
                  for it to return to on its own.

                  Not straddling on the last column, where there is no
                  boundary and half of an 8px strip hung past the table's
                  edge — which was once a permanent horizontal scrollbar.
                */}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize the ${label || id} column`}
                  onPointerDown={(event) => startResize(id, event)}
                  onDoubleClick={reset}
                  title="Drag to resize · double-click to reset"
                  className={`absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize justify-center opacity-0 transition hover:opacity-100 ${
                    at === visible.length - 1 ? "" : "translate-x-1/2"
                  }`}
                >
                  <span aria-hidden className="pointer-events-none h-full w-px bg-ink/30" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {/*
          One section for the whole list. The day used to be a heading row
          of its own, sticky under the header, which stopped the list at
          every date and put the first day's heading between the column
          titles and the rows they name. It is a column now: the date is
          written once, on its day's first row, out in the gutter, and the
          next day starts after a little more space than the rows have
          between them — a `.day-row` spacer, which no box rule reaches.
        */}
        <tbody className="orders-rows">
          {orders.map((order, at) => {
            const isSelected = selectedKeys.has(order.key);
            const isOpen = openKey === order.key;
            const firstOfDay = order.date !== orders[at - 1]?.date;
            const booked = isBooked(order, stageIndex);
            const due = stillDue(order);
            const method = paymentMethods.find((m) => m.id === order.paymentMethodId);

            return (
              <Fragment key={order.key}>
                {firstOfDay && at > 0 && (
                  <tr className="day-row" aria-hidden>
                    <th colSpan={visible.length} className="h-1 p-0" />
                  </tr>
                )}
                <tr
                  onClick={(e) => handleRowClick(e, order.key)}
                  // `is-offer` marks a quote rather than a booking — see
                  // globals.css for the dashed edge that says so.
                  className={`motion-row group cursor-pointer align-middle ${isOpen ? "is-open" : ""} ${
                    booked ? "" : "is-offer"
                  }`}
                  // The arrival cascade's place in line, capped so a long
                  // list is in within half a second — see `.motion-row`.
                  style={{ "--i": Math.min(at, 12) } as React.CSSProperties}
                >
                  {/*
                    The day, out in the gutter and written once — the first
                    cell is not part of the box (`> td:first-child` in
                    globals.css paints no surface), so a hovered row never
                    lights it. Today is the accent: a work queue is read
                    from "where am I now".
                  */}
                  {show("when") && (
                    <td className="whitespace-nowrap">
                      {firstOfDay && (
                        <DayLabel date={order.date} today={order.date === today} />
                      )}
                    </td>
                  )}
                  {/*
                    The tick box, the first thing *inside* the box. An
                    outline until ticked, and only there while the row is
                    hovered — or always, once anything is selected, so a
                    selection being built can be seen whole.
                  */}
                  {show("select") && (
                    <td>
                      <Tip label="Select this order for a bulk action" className="inline-flex">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(order.key)}
                          aria-label={`Select ${order.customer || "order"}`}
                          className="pick-box"
                        />
                      </Tip>
                    </td>
                  )}
                  {/* Status leads the order: it is what the table is
                      scanned by. A squared chip in the stage's own colour,
                      so it reads as the row's state rather than as another
                      of its values. */}
                  {show("status") && (
                    <td>
                      <HoverCard
                        width={220}
                        height={70}
                        tone="ink"
                        placement="below-left"
                        className="w-fit"
                        render={() => (
                          <p className="text-xs leading-relaxed text-cream/85">
                            {stageHint(stageIndex.get(order.productionStatus))}
                          </p>
                        )}
                      >
                        <ProductionStatusSelect order={order} onChanged={onChanged} />
                      </HoverCard>
                    </td>
                  )}
                  {show("customer") && (
                    <td>
                      <div className="flex items-center gap-2">
                        {/*
                          The event type is a small tinted mark beside the
                          name, where it was a chip of its own column — one
                          more coloured pill on a row that already had four.
                          It still edits from the owner's list: a typed
                          variant would render uncoloured and quietly become
                          a type of its own.
                        */}
                        <EditableCell
                          displayValue={order.customerType}
                          editValue={order.customerType}
                          options={typeOptions}
                          onSave={(raw) => saveField(order, { customerType: raw })}
                          renderIdle={(startEditing) => <TypeMark value={order.customerType} onEdit={startEditing} />}
                        />
                        {/*
                          The name is two things at once: the client it
                          belongs to, and a value that gets corrected.
                          Clicking it goes to the client, so editing moves to
                          a pencil that appears with the row's other hover
                          controls. An order booked before the client list
                          existed has no client to open and stays plain text.
                        */}
                        <EditableCell
                          displayValue={order.customer || "(no name)"}
                          editValue={order.customer}
                          onSave={(raw) => saveField(order, { customer: raw })}
                          renderIdle={(startEditing) => (
                            <span className="flex min-w-0 items-center gap-1">
                              {order.clientId === null ? (
                                <span className="truncate font-bold">{order.customer || "(no name)"}</span>
                              ) : (
                                <Tip label="Customer — click to open their card" className="min-w-0">
                                  <button
                                    onClick={() => onOpenClient(order.clientId!)}
                                    className="block max-w-full truncate font-bold hover:underline"
                                  >
                                    {order.customer || "(no name)"}
                                  </button>
                                </Tip>
                              )}
                              <button
                                onClick={startEditing}
                                title="Rename the customer on this order"
                                aria-label="Edit the customer name"
                                className="reveals-on-hover invisible shrink-0 rounded-full p-1 text-ink-soft transition group-hover:visible hover:bg-ink/10 hover:text-ink"
                              >
                                <Pencil size={11} />
                              </button>
                            </span>
                          )}
                        />
                        {/* The note behind an icon rather than under the
                            name: as a second line it set the row's height
                            off the longest note in view. */}
                        {order.notes && <NoteHint note={order.notes} />}
                        {order.needsReview && (
                          <Tip label="Best-effort parsed from legacy notes — please review">
                            <span className="keeps-color rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink">
                              review
                            </span>
                          </Tip>
                        )}
                      </div>
                    </td>
                  )}
                  {show("location") && (
                    <td className="max-w-[170px]">
                      <EditableCell
                        displayValue={
                          order.location ? (
                            <Tip label={`Where the event is: ${order.location}`} className="block truncate text-ink-soft">
                              {order.location}
                            </Tip>
                          ) : (
                            <span className="text-ink-soft/50">—</span>
                          )
                        }
                        editValue={order.location}
                        onSave={(raw) => saveField(order, { location: raw })}
                      />
                    </td>
                  )}
                  {show("guests") && (
                    <td className="text-right">
                      <EditableCell
                        type="number"
                        displayValue={
                          order.guests === null ? (
                            <span className="block text-right text-ink-soft/50">—</span>
                          ) : (
                            <Tip
                              label={`${count(order.guests)} guests`}
                              className="flex items-center justify-end gap-1 text-ink-soft tabular-nums"
                            >
                              <UserRound size={13} aria-hidden className="opacity-55" />
                              {count(order.guests)}
                            </Tip>
                          )
                        }
                        editValue={order.guests?.toString() ?? ""}
                        onSave={(raw) => saveField(order, { guests: raw === "" ? null : Number(raw) })}
                      />
                    </td>
                  )}
                  {show("units") && (
                    <td>
                      {/* The count is the scannable number; the packages and
                          their flavours are a hover away. */}
                      <div className="flex justify-end">
                        <ContentHoverCard
                          lines={order.packageLines}
                          flavors={flavors}
                          packageTypes={packageTypes}
                          presets={presets}
                          className="w-fit"
                        >
                          <UnitsCell
                            units={orderUnits(order.packageLines, unitsPerPackage)}
                            cubes={flavourCubes(order, flavorById)}
                          />
                        </ContentHoverCard>
                      </div>
                    </td>
                  )}
                  {show("extras") && (
                    <td>
                      <Extras order={order} />
                    </td>
                  )}
                  {show("amount") && (
                    <td>
                      {/* The whole order — jelly, every extra, discount and
                          VAT — in the nav's VAT convention, the same figure
                          the Kanban card and the order form's Total show.
                          Not edited in place: a total has no single column
                          to write back to, so a click opens the order. */}
                      <div className="flex justify-end">
                        <AmountHoverCard order={order}>
                          <span className="block w-fit cursor-help border-b border-dotted border-ink-soft/60 pb-px text-[13.5px] font-bold tabular-nums">
                            {currency(forOrder(order))}
                          </span>
                        </AmountHoverCard>
                      </div>
                    </td>
                  )}
                  {show("due") && (
                    <td className="text-right">
                      <Due order={order} due={due} booked={booked} />
                    </td>
                  )}
                  {show("payment") && (
                    <td>
                      <Tip
                        label={`${PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}${
                          method ? ` · ${method.name}` : " · not said how yet"
                        } — click to change`}
                        className="inline-flex"
                      >
                        <PaymentStatusSelect order={order} onChanged={onChanged} onUndoable={onUndoable} />
                      </Tip>
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
          {orders.length === 0 && (
            <tr className="day-row">
              {/* Names the window rather than saying "no matches": the
                  default scope is the next fortnight, and a quiet season
                  otherwise reads as the page being broken. */}
              <th colSpan={visible.length} className="px-2 py-8 text-center text-sm font-normal text-ink-soft">
                {emptyNote}
              </th>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The day, on its first row: the weekday small over the date large, so a
 * column of them reads as a calendar's margin. "Today" in place of the
 * weekday, in the accent.
 *
 * See `orderWeekday` for why an old imported order's weekday can be wrong.
 */
function DayLabel({ date, today }: { date: string; today: boolean }) {
  return (
    <Tip
      label={`${orderWeekdayLong(date)} ${formatOrderDate(date)}${today ? " — today" : ""}`}
      className={`flex flex-col leading-[1.1] ${today ? "text-accent" : ""}`}
    >
      <span className={`text-[10px] font-extrabold tracking-[0.14em] uppercase ${today ? "" : "text-ink-soft"}`}>
        {today ? "Today" : orderWeekday(date)}
      </span>
      <span className="font-display text-base font-extrabold tracking-[-0.01em]">{formatOrderDate(date)}</span>
    </Tip>
  );
}

/**
 * The event type as a tinted square beside the customer's name — the
 * owner's colour and icon from Settings, the built-in guess for a type
 * that is not on the list, and an empty dashed square for none. It is the
 * cell's edit control too, so it is a button.
 */
function TypeMark({ value, onEdit }: { value: string; onEdit: () => void }) {
  const type = useOrderType(value);
  const fallback = eventType(value);
  const label = fallback?.label ?? "";
  return (
    <Tip label={label ? `Event type: ${label} — click to change` : "No event type — click to set one"}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={label ? `Event type: ${label}. Change` : "Set the event type"}
        style={type ? { background: type.color } : undefined}
        className={`keeps-color press flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-ink ${
          type ? "" : fallback ? "bg-black/[0.06]" : "border border-dashed border-ink-soft/40"
        }`}
      >
        {type ? orderTypeIconElement(type.icon, 13) : fallback ? <fallback.Icon size={13} /> : null}
      </button>
    </Tip>
  );
}

/**
 * The four extras an order can carry, each with its mark, how many, what a
 * hover says and what the phone's card writes. Stated once so the table's
 * slots and the card's chips cannot disagree about what an order needs —
 * `hasDelivery` and `displayCount` are the predicates everything else uses.
 */
export function extraSlots(order: Order): { icon: LucideIcon; on: number; label: string; short: string }[] {
  const displays = displayCount(order.displays);
  const waitresses = order.waitresses ?? 0;
  const delivery = hasDelivery(order);
  return [
    {
      icon: Sparkles,
      on: displays,
      label: displays ? `Display × ${displays}` : "No display",
      short: `${displays} display${displays === 1 ? "" : "s"}`,
    },
    {
      icon: HandPlatter,
      on: waitresses,
      label: waitresses ? `Waitresses × ${waitresses}` : "No waitresses",
      short: `${waitresses} waitress${waitresses === 1 ? "" : "es"}`,
    },
    { icon: BadgeCheck, on: order.kosher ? 1 : 0, label: order.kosher ? "Kosher" : "Not kosher", short: "Kosher" },
    { icon: Truck, on: delivery ? 1 : 0, label: delivery ? "Delivery" : "No delivery — collected", short: "Delivery" },
  ];
}

/**
 * The four extras as fixed slots — display, waitresses, kosher, delivery.
 *
 * They were four columns of "Yes", "No" and "—", mostly empty answers
 * written as words that look alike at a glance. A slot is lit when the
 * order has it and faint when it does not, in the same place on every row,
 * so reading down the column shows what each event needs; a count rides
 * the corner where there is more than one. Read-only, like the Display
 * column was: a click opens the order, where each is set and priced.
 */
function Extras({ order }: { order: Order }) {
  const slots = extraSlots(order);
  return (
    <span className="flex gap-1">
      {slots.map(({ icon: Icon, on, label }) => (
        <Tip key={label} label={label}>
          <span
            className={`relative flex h-6 w-6 items-center justify-center rounded-[7px] ${
              on ? "bg-band text-ink" : "text-ink-soft opacity-25"
            }`}
          >
            <Icon size={14} aria-hidden />
            {on > 1 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-black px-[3px] text-center text-[9px] leading-3.5 font-extrabold text-cream tabular-nums">
                {on}
              </span>
            )}
          </span>
        </Tip>
      ))}
    </span>
  );
}

/**
 * What is still owed, where the deposit used to be. The deposit is the
 * past; what is still to collect is the job — so it is amber until it is
 * nothing, and then the word "Paid" in the accent.
 *
 * `stillDue`, so a row whose badge says Paid in full or Free / comp says
 * Paid here too even with no deposit typed in. Gross, like the figures
 * pane's Balance due: it is money a customer hands over. A quote owes
 * nothing yet, so its balance is drawn quiet.
 */
function Due({ order, due, booked }: { order: Order; due: number; booked: boolean }) {
  // Nothing priced yet is not "paid" — it is nothing to say.
  if (orderTotal(order) <= 0) return <span className="text-ink-soft/50">—</span>;
  if (due <= 0) {
    return (
      <Tip
        label={order.paymentStatus === "comp" ? "Free / comp — nothing to collect" : "Paid in full"}
        className="font-semibold text-accent"
      >
        Paid
      </Tip>
    );
  }
  return (
    <Tip
      label={
        // VAT included whichever way the nav's switch reads the Total
        // beside it — it is money a customer hands over — so it says so
        // rather than quoting a second total that disagrees with that one.
        booked
          ? `Still to collect, VAT included: ${currency(due)}`
          : "A quote — nothing is owed until it is booked"
      }
      className={`font-bold tabular-nums ${booked ? "text-due" : "text-ink-soft/70"}`}
    >
      {currency(due)}
    </Tip>
  );
}

/**
 * The order's note, one hover away.
 *
 * `cursor-help` and the outlined icon are the whole affordance: a filled
 * mark would read as a status, and this is neither good news nor bad.
 */
function NoteHint({ note }: { note: string }) {
  return (
    <HoverCard
      width={260}
      height={160}
      className="shrink-0"
      render={() => <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink">{note}</p>}
    >
      <Info size={13} className="cursor-help text-ink-soft" aria-label="Has a note" />
    </HoverCard>
  );
}

/**
 * The order's size as one number, with a sharp cube per flavour before it.
 *
 * The dotted underline is the affordance: `ContentHoverCard` wraps this
 * and spells the packages out. Deliberately no `title` or `Tip`: either
 * would open on top of the very card it was pointing at.
 */
function UnitsCell({ units, cubes }: { units: number; cubes: Flavor[] }) {
  if (units <= 0) return <span className="text-ink-soft/50">—</span>;
  return (
    <span className="flex w-fit cursor-help items-center gap-[3px] font-bold tabular-nums">
      {/* Largest share first, so a glance says what is in it before the
          hover card says how much. A tray with no mix decided yet shows one
          empty cube — the order the kitchen most needs to ask about. */}
      {cubes.length === 0 ? (
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 shadow-[inset_0_0_0_1.5px_var(--color-ink-soft)] opacity-50" />
      ) : (
        cubes.map((flavor) => (
          <span key={flavor.id} aria-hidden className="jelly-cube h-2.5 w-2.5 shrink-0" style={cubeColors(flavor)} />
        ))
      )}
      <span className="ml-1.5 border-b border-dotted border-ink-soft/60 pb-px">{count(units)}</span>
    </span>
  );
}

/** Up to four flavours on an order, largest share first. */
function flavourCubes(order: Order, flavorById: Map<string, Flavor>): Flavor[] {
  return orderFlavorUnits(order.packageLines)
    .sort((a, b) => b.units - a.units)
    .map((entry) => flavorById.get(entry.flavorId))
    .filter((flavor): flavor is Flavor => flavor !== undefined)
    .slice(0, 4);
}
