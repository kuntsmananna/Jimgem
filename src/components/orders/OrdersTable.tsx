"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatOrderDate,
  orderWeekday,
  hasDelivery,
  displayCount,
  isBooked,
  stageMap,
  orderUnits,
  unitsPerPackageMap,
  withDelivery,
  type Order,
  type OrderDisplay,
  type OrderInput,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { Info, Pencil } from "lucide-react";
import { UnitsIcon } from "@/lib/icons";
import { useOrderTypes } from "@/components/OrderTypesContext";
import { useStages } from "@/components/ProductionStagesContext";
import { HoverCard } from "@/components/HoverCard";
import { saveError } from "@/components/saveError";
import { ContentHoverCard } from "./ContentHoverCard";
import { EditableCell } from "./EditableCell";
import { EventTypeChip } from "./EventTypeChip";
import { PaymentStatusSelect, ProductionStatusSelect } from "./StatusSelects";
import { useColumnWidths } from "./useColumnWidths";
import { count, currency } from "@/lib/money";


/**
 * The header row's height, watched.
 *
 * The day headings stick directly under it, and the header is not a fixed
 * height: it is one line of 11px text until a column is dragged narrow
 * enough to wrap its label, and then it is two. A number written into the
 * CSS would be right until the first drag; a `ResizeObserver` is right
 * always, and costs one observer for the whole table.
 */
function useHeadHeight(ref: React.RefObject<HTMLTableRowElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const watch = new ResizeObserver(() => setHeight(row.getBoundingClientRect().height));
    watch.observe(row);
    return () => watch.disconnect();
  }, [ref]);
  return height;
}

/** Anything the row click must not hijack, because it does its own job. */
const INTERACTIVE = "button, input, select, textarea, a, label";

/**
 * The list cut into days — the same division the phone's cards have had
 * since v0.44.0, brought back here because people liked reading it that
 * way and asked for it on the laptop too.
 *
 * A **run boundary, not a grouping pass**: `getOrders` returns
 * `ORDER BY date DESC, id DESC`, so orders of one day already arrive
 * together and this only has to notice where one day stops. Sorting here
 * would be a second opinion about the list's order, and the day a heading
 * announced could then disagree with the rows under it.
 */
function byDay(orders: Order[]): { date: string; orders: Order[] }[] {
  const days: { date: string; orders: Order[] }[] = [];
  for (const order of orders) {
    const last = days[days.length - 1];
    if (last && last.date === order.date) last.orders.push(order);
    else days.push({ date: order.date, orders: [order] });
  }
  return days;
}

/**
 * The columns, in order, so each one has a name a stored width can be
 * keyed by (see `useColumnWidths`).
 *
 * **The body's cells are written out in this order and have to stay in
 * it** — a `<colgroup>` matches by position, so a column inserted here
 * without the matching `<td>` would silently re-width every cell after it.
 */
export const COLUMNS = [
  { id: "select", label: "" },
  { id: "status", label: "Status" },
  { id: "date", label: "Date" },
  { id: "customer", label: "Customer" },
  { id: "type", label: "Type" },
  { id: "location", label: "Location" },
  { id: "guests", label: "Guests" },
  { id: "units", label: "Units" },
  { id: "mirrors", label: "Mirrors" },
  { id: "waitress", label: "Waitress" },
  { id: "kosher", label: "Kosher" },
  { id: "delivery", label: "Delivery" },
  { id: "amount", label: "Amount" },
  { id: "deposit", label: "Deposit" },
  { id: "payment", label: "Payment" },
] as const;

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
}) {
  // From the app-layout provider rather than a prop — see OrderTypesContext.
  const orderTypes = useOrderTypes();
  // A row is provisional when its stage says it is not income yet — the
  // owner's flag, not the word "offer", so a second quote-like stage gets
  // the same treatment without another special case here.
  const stageIndex = stageMap(useStages());
  const unitsPerPackage = unitsPerPackageMap(packageTypes);
  // Built once rather than per row: the list is the same for all 74 of
  // them, and a fresh array per row also denies the cell any reuse.
  const typeOptions = orderTypes
    // Archived types stay out of the picker. A row already carrying one
    // keeps it — `EditableCell` adds the current value when it is missing.
    .filter((type) => !type.archivedAt)
    .map((type) => ({ value: type.name, label: type.name }));
  const allSelected = orders.length > 0 && orders.every((o) => selectedKeys.has(o.key));
  // Desktop-only by construction: the phone renders `OrdersMobileList`
  // instead and this table is never on screen there.
  /*
    Everything downstream — the header, the `<colgroup>`, the body's cells
    and the stored widths — works off the *visible* list, and a `<col>`
    matches by position, so the three have to agree.
  */
  const visible = COLUMNS.filter((column) => !hidden.has(column.id));
  const show = (id: string) => !hidden.has(id);
  const days = useMemo(() => byDay(orders), [orders]);
  // Memoised because the hook holds it as a dependency of its own; a fresh
  // array every render would re-parse the stored widths on each pass.
  const visibleIds = useMemo(
    () => COLUMNS.filter((column) => !hidden.has(column.id)).map((column) => column.id),
    [hidden],
  );
  const { widths, headRef, startResize, reset } = useColumnWidths(visibleIds);
  const headHeight = useHeadHeight(headRef);

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
      No card around the list any more. Each order is its own box now
      (see `.orders-rows > tr > td` in globals.css), so a frame around the
      column of them is one edge too many — and the day headings are
      meant to sit *outside* the boxes, on the page's own cream, which
      they cannot do inside a white card.
    */
    <div className="max-h-[70vh] overflow-auto">
      {/*
        **No `min-width` floor.** There was a 1100px one, set when all
        fifteen columns showed, and it is what put a horizontal scrollbar
        under the table permanently: the content column is ~1130px on a
        1310px laptop, and the vertical scrollbar's own width took it under
        1100. With Date hidden by default the columns need far less than
        that, so the floor was reserving width nothing was using and
        charging a scrollbar for it. Auto layout already refuses to squeeze
        columns past their content — it scrolls when it genuinely has to,
        which is the behaviour the floor was approximating.

      */}
      {/*
        `table-fixed` only once the columns have been sized. Until then the
        browser's automatic layout is what fits fifteen columns into a
        laptop, and imposing a fixed one before anybody has asked would
        change the table for everyone who never touches a handle.
      */}
      {/*
        `border-separate` with a vertical gap is what makes each row a box
        rather than a band in a ledger — see the block in globals.css. The
        gap is vertical only, so nothing about the column widths changes.
      */}
      <table
        className={`w-full border-separate border-spacing-x-0 border-spacing-y-1.5 text-left text-sm ${
          widths ? "table-fixed" : ""
        }`}
      >
        {widths && (
          <colgroup>
            {visible.map(({ id }) => (
              <col key={id} style={{ width: widths[id] }} />
            ))}
          </colgroup>
        )}
        {/*
          Cream rather than the card white it was: with the frame gone the
          header sits on the page, and it has to be opaque or the boxes
          scroll through it.
        */}
        <thead className="sticky top-0 z-20 bg-cream">
          <tr ref={headRef} className="text-[11px] font-semibold text-ink-soft">
            {visible.map(({ id, label }, at) => (
              <th key={id} className={`relative bg-cream px-2 py-2 ${!widths && id === "select" ? "w-6" : ""}`}>
                {id === "select" ? (
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />
                ) : (
                  label
                )}
                {/*
                  The grab strip, straddling the column's right edge. It is
                  invisible until the pointer is on it: fifteen permanent
                  hairlines would draw the ledger this table's own notes
                  say it is trying not to be, and the border under the
                  header row already says where the columns are.

                  Double-click hands the whole table back to the automatic
                  layout, which is the only "reset" that means anything —
                  once a column is pinned there is no natural width left
                  for it to return to on its own.
                */}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize the ${label || "select"} column`}
                  onPointerDown={(event) => startResize(id, event)}
                  onDoubleClick={reset}
                  title="Drag to resize · double-click to reset"
                  /*
                    Straddling each boundary — except the last, where there
                    is no boundary to straddle and half of an 8px strip
                    hung 4px past the table's right edge. That was **the
                    permanent horizontal scrollbar**: not a column too wide
                    for the page, but an invisible handle overflowing the
                    scroller by 4px at every width, so the bar was there
                    even with the table sitting in a 1400px column with
                    room to spare. Measured before and after.
                  */
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
          Hover focus is pure CSS (see globals.css's .orders-rows): the
          hovered row comes forward and the rest recede. Tracking it in
          React state instead re-rendered all ~80 rows on every row-to-row
          mouse move.
        */}
        {/*
          **A `<tbody>` per day, heading and orders together.**

          That is what the element is for — a row group — and the heading
          has to be *inside* its day's group rather than in one of its own:
          a sticky cell can only stay put while its own section is on
          screen, so a heading alone in a section un-sticks the instant its
          single row scrolls, which is to say never sticks at all.

          Sharing the section means sharing `.orders-rows`, whose rules
          draw the box and turn it black on hover — everything a heading
          must not do. The heading is a **`<th>`** for exactly that reason:
          every one of those rules is written `> td`, so none of them can
          reach it, and the one that matches descendants instead carries
          the single `:not(.day-row)` this needs.
        */}
        {days.map((day, dayAt) => (
        <tbody className="orders-rows" key={day.date}>
          <tr className="day-row">
            {/*
              The gutter column, empty. It is what the checkbox hangs in
              (see the row below), and the heading skips it so its first
              letter lands exactly over the box's first value rather than
              out in the margin. A `<th>` like the heading beside it, and
              for the same reason: the box rules are all written `> td`.
            */}
            <th className="sticky z-10 bg-cream" style={{ top: headHeight }} />
            <th
              scope="colgroup"
              colSpan={visible.length - 1}
              /*
                **Sticky under the header**, so the day you are reading is
                always named — a long month otherwise scrolls its heading
                away and leaves a column of orders with no day on it.

                `top` is the header's *measured* height rather than a
                number written here: the header row is one line of 11px
                text today, and a column dragged narrow enough to wrap its
                label makes it two. A guessed offset would leave a gap or
                hide the heading behind the header the moment that
                happened.

                Cream and opaque for the same reason the header is: the
                boxes have to pass behind it, not through it. `z-10`
                against the header's `z-20`, so a heading on its way out
                goes under the header rather than over it.
              */
              style={{ top: headHeight }}
              /* `px-2`, the cells' own padding, so the heading and the
                 first value under it share a left edge. */
              className={`sticky z-10 bg-cream px-2 pb-1.5 text-left text-[11px] font-extrabold tracking-[0.14em] text-ink-soft uppercase ${
                dayAt === 0 ? "pt-2" : "pt-5"
              }`}
            >
              {/* The weekday first, then the date — "is that a Saturday"
                  is most of what a queue of dates is read for. See
                  `orderWeekday` for why an old imported order's can be
                  wrong. Nothing else: it carried the day's order count for
                  a version and the owner had it out again — the rows are
                  right there to be counted, and a heading is a label. */}
              <span className="text-ink">{orderWeekday(day.date)}</span>{" "}
              {formatOrderDate(day.date)}
            </th>
          </tr>
          {day.orders.map((order) => {
            const isSelected = selectedKeys.has(order.key);
            const isOpen = openKey === order.key;

            return (
              <tr
                key={order.key}
                onClick={(e) => handleRowClick(e, order.key)}
                // `is-offer` marks a quote rather than a booking — see
                // globals.css for the dashed edge that says so, which has
                // to survive the row turning black on hover.
                /* No border here: a row in a `border-separate` table cannot
                   paint one, and the box's edges are the cells'. */
                className={`group cursor-pointer align-top ${isOpen ? "is-open" : ""} ${
                  isBooked(order, stageIndex) ? "" : "is-offer"
                }`}
              >
                {/*
                  The tick box, in a gutter *beside* the box rather than
                  inside it — the owner's call, and it is what the box was
                  extending past its own content to hold. It is empty
                  almost always (it appears on hover, and this column has
                  no data of its own), so inside the box it was 30px of
                  nothing before every order's first value.

                  Still a real cell in the real column, so selection, the
                  select-all above it and the stored widths all work
                  exactly as they did; it simply opts out of the box —
                  `> td:first-child` in globals.css paints no surface and
                  no edge, and the *second* cell rounds and closes the
                  left end instead.
                */}
                {show("select") && (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(order.key)}
                      aria-label={`Select ${order.customer || "order"}`}
                      // Revealed on hover so the column reads as data, not
                      // controls — but a ticked box always stays visible.
                      className={isSelected ? "" : "reveals-on-hover invisible group-hover:visible"}
                    />
                  </td>
                )}
                {/* Status leads the row: it is what the table is scanned
                    by, and as the last column it sat past the fold on a
                    laptop. It is the one cell that is neither a pill nor
                    plain text — a squared chip in the stage's own colour,
                    so it reads as the row's state rather than as another
                    of its values. */}
                {show("status") && (
                  <td className="px-2 py-2">
                    <ProductionStatusSelect order={order} onChanged={onChanged} />
                  </td>
                )}
                {show("date") && (
                  <td className="px-2 py-2 whitespace-nowrap">
                    <EditableCell
                      type="date"
                      displayValue={formatOrderDate(order.date)}
                      editValue={order.date}
                      onSave={(raw) => saveField(order, { date: raw })}
                    />
                  </td>
                )}
                {show("customer") && (
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {/*
                        The name is two things at once: the client it belongs
                        to, and a value that gets corrected. Clicking it goes
                        to the client — the more useful of the two, and the
                        one there was no way to reach from here — so editing
                        moves to a pencil that appears with the row's other
                        hover controls.

                        An order booked before the client list existed has no
                        client to open, so it stays plain text and only the
                        pencil applies.
                      */}
                      <EditableCell
                        displayValue={order.customer || "(no name)"}
                        editValue={order.customer}
                        onSave={(raw) => saveField(order, { customer: raw })}
                        renderIdle={(startEditing) => (
                          <span className="flex min-w-0 items-center gap-1">
                            {order.clientId === null ? (
                              <span className="truncate">{order.customer || "(no name)"}</span>
                            ) : (
                              <button
                                onClick={() => onOpenClient(order.clientId!)}
                                title={`Open ${order.customer}'s client card`}
                                className="truncate hover:underline"
                              >
                                {order.customer || "(no name)"}
                              </button>
                            )}
                            <button
                              onClick={startEditing}
                              title="Rename the customer on this order"
                              aria-label="Edit the customer name"
                              className="reveals-on-hover invisible shrink-0 rounded-full p-1 text-ink-soft transition group-hover:visible hover:bg-cream/20 hover:text-cream"
                            >
                              <Pencil size={11} />
                            </button>
                          </span>
                        )}
                      />
                      {/*
                        The note lives behind an icon rather than under the
                        name. As a second line it set the row's height off the
                        longest note in view — three lines for one order pushed
                        every other row apart — and it is a detail you go
                        looking for, not one you scan.

                        Notes, not the Sheet's raw `details`: migration 004
                        folded those together, so this is the same text the
                        order form edits.
                      */}
                      {order.notes && <NoteHint note={order.notes} />}
                      {order.needsReview && (
                        <span
                          title="Best-effort parsed from legacy notes — please review"
                          className="keeps-color rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink"
                        >
                          review
                        </span>
                      )}
                    </div>

                  </td>
                )}
                {show("type") && (
                  <td className="px-2 py-2">
                    <EditableCell
                      displayValue={
                        order.customerType.trim() ? <EventTypeChip value={order.customerType} /> : "—"
                      }
                      editValue={order.customerType}
                      // The owner's list from Settings, not free text: a typed
                      // variant would render uncoloured and silently become a
                      // type of its own.
                      options={typeOptions}
                      onSave={(raw) => saveField(order, { customerType: raw })}
                    />
                  </td>
                )}
                {show("location") && (
                  <td className="max-w-[130px] px-2 py-2">
                    <EditableCell
                      displayValue={order.location || "—"}
                      editValue={order.location}
                      onSave={(raw) => saveField(order, { location: raw })}
                    />
                  </td>
                )}
                {show("guests") && (
                  <td className="px-2 py-2">
                    <EditableCell
                      type="number"
                      displayValue={order.guests ?? "—"}
                      editValue={order.guests?.toString() ?? ""}
                      onSave={(raw) =>
                        saveField(order, {
                          guests: raw === "" ? null : Number(raw),
                        })
                      }
                    />
                  </td>
                )}
                {show("units") && (
                  <td className="px-2 py-2">
                    {/* The count is the scannable number; the packages and
                        their flavours are a hover away. The dotted underline
                        is what says so — a row of bare numerals gives no
                        reason to point at one. */}
                    <ContentHoverCard
                      lines={order.packageLines}
                      flavors={flavors}
                      packageTypes={packageTypes}
                      presets={presets}
                      className="w-fit"
                    >
                      <UnitsCell units={orderUnits(order.packageLines, unitsPerPackage)} />
                    </ContentHoverCard>
                  </td>
                )}
                {show("mirrors") && (
                  <td className="px-2 py-2">
                    {/* Read-only here, unlike the counts either side of it:
                        an order can carry several display types at once, and
                        one number in a cell has nowhere to say which. The
                        order popup is where the split is set. */}
                    <DisplayCell displays={order.displays} />
                  </td>
                )}
                {show("waitress") && (
                  <td className="px-2 py-2">
                    <EditableCell
                      type="number"
                      displayValue={order.waitresses ?? "—"}
                      editValue={order.waitresses?.toString() ?? ""}
                      onSave={(raw) =>
                        saveField(order, {
                          waitresses: raw === "" ? null : Number(raw),
                        })
                      }
                    />
                  </td>
                )}
                {show("kosher") && (
                  <td className="px-2 py-2">
                    <YesNoCell value={order.kosher} onSave={(kosher) => saveField(order, { kosher })} />
                  </td>
                )}
                {show("delivery") && (
                  <td className="px-2 py-2">
                    {/* Whether there is delivery, not what it costs — the
                        price lives with the other extras on the order
                        sheet's money side. */}
                    <YesNoCell
                      value={hasDelivery(order)}
                      onSave={(on) => saveField(order, withDelivery(order, on))}
                    />
                  </td>
                )}
                {show("amount") && (
                  <td className="px-2 py-2 font-semibold">
                    <EditableCell
                      type="number"
                      displayValue={currency(order.totalAmount)}
                      editValue={String(order.totalAmount)}
                      onSave={(raw) => saveField(order, { totalAmount: Number(raw) || 0 })}
                    />
                  </td>
                )}
                {show("deposit") && (
                  <td className="px-2 py-2">
                    <EditableCell
                      type="number"
                      displayValue={currency(order.deposit)}
                      editValue={String(order.deposit)}
                      onSave={(raw) => saveField(order, { deposit: Number(raw) || 0 })}
                    />
                  </td>
                )}
                {show("payment") && (
                  <td className="px-2 py-2">
                    <PaymentStatusSelect order={order} onChanged={onChanged} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        ))}
        {orders.length === 0 && (
          <tbody>
            <tr>
              {/* Names the window rather than saying "no matches": the
                  default scope is the next fortnight, and a quiet season
                  otherwise reads as the page being broken. */}
              <td colSpan={visible.length} className="px-2 py-8 text-center text-sm text-ink-soft">
                {emptyNote}
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

/**
 * How many display items an order carries, across every type.
 *
 * A total rather than a breakdown: the column is scanned for "is there
 * anything to set up", and the popup answers which kinds.
 */
function DisplayCell({ displays }: { displays: OrderDisplay[] }) {
  const count = displayCount(displays);
  if (count === 0) return <span className="text-ink-soft">—</span>;
  return <span className="font-semibold tabular-nums">{count}</span>;
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
      render={() => (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink">{note}</p>
      )}
    >
      <Info size={13} className="cursor-help text-ink-soft" aria-label="Has a note" />
    </HoverCard>
  );
}

/**
 * A yes/no column, editing as a dropdown.
 *
 * `EditableCell` speaks strings, so the boolean has to be encoded
 * somewhere — here, once, rather than at each column that needs one.
 * A "yes" is written out and a "no" is a dash. Down a column where most
 * orders are neither kosher nor delivered, "No" repeated forty times is
 * forty words the eye has to read to find the two that say Yes; a dash
 * says the same thing without asking to be read. The dropdown still says
 * No in full, because there the two options have to be told apart.
 */
const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

function YesNoCell({ value, onSave }: { value: boolean; onSave: (value: boolean) => Promise<void> }) {
  return (
    <EditableCell
      displayValue={value ? "Yes" : <span className="text-ink-soft/50">–</span>}
      editValue={value ? "yes" : "no"}
      options={YES_NO}
      onSave={(raw) => onSave(raw === "yes")}
    />
  );
}

/**
 * The order's size as one number, standing in for the package-and-flavour
 * chips that used to fill this column. Those chips truncated on anything
 * with more than a line or two, and the total — the thing the column is
 * scanned for — was the part that got pushed out.
 *
 * The dotted underline is the affordance: `ContentHoverCard` wraps this
 * and spells the packages out, but a bare numeral gives no reason to point
 * at it. Nothing is underlined when there is nothing to elaborate on.
 */
function UnitsCell({ units }: { units: number }) {
  if (units <= 0) return <span className="text-ink-soft">—</span>;
  return (
    <span
      title="Hover for packages and flavours"
      className="flex w-fit cursor-help items-center gap-1.5 border-b border-dotted border-ink-soft/60 pb-px font-semibold tabular-nums"
    >
      <UnitsIcon size={12} className="shrink-0 text-ink-soft" />
      {count(units)}
    </span>
  );
}
