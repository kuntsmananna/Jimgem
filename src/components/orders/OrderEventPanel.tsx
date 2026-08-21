"use client";

import {
  hasDelivery,
  withDelivery,
  type OrderDisplay,
  type OrderInput,
  type Rates,
} from "@/lib/orderTypes";
import { ChipSpread, spreadOptions } from "./ChipSpread";
import { GroupLabel, SheetRow, YesNo, nf } from "./OrderSheet";
import { NumberStepper } from "./PackageLineEditor";

/**
 * The Event tab: how big the event is and what it needs beyond the jelly.
 *
 * These used to share a column with the customer's details, where they
 * read as one undifferentiated list of twelve values. They are a
 * different question — asked of the kitchen and the van rather than of
 * the customer — and now have the tab to say so.
 */
export function OrderEventPanel({
  draft,
  onChange,
  totalUnits,
  rates,
  onOpenContent,
}: {
  draft: OrderInput;
  onChange: (draft: OrderInput) => void;
  /** Units the Content tab packs, shown here so the two tabs agree. */
  totalUnits: number;
  rates: Rates;
  onOpenContent: () => void;
}) {
  const set = (patch: Partial<OrderInput>) => onChange({ ...draft, ...patch });
  const displayOptions = rates.displayOptions.filter(
    (option) => !option.archivedAt || quantityOf(draft.displays, option.id) > 0,
  );

  return (
    /*
      Stacked, not columns. The three groups — the event's counts, what it
      is shown on, how it gets there — are separate conversations and read
      fine one under the other, and a 13" laptop has no room for three of
      them side by side. Each group keeps its rows to a readable measure
      rather than stretching a stepper across the whole panel.
    */
    <div className="flex max-w-lg flex-col gap-5">
      <section className="flex min-w-0 flex-col">
        <GroupLabel>The event</GroupLabel>
        <SheetRow label="Guests">
          <NumberStepper
            label="guests"
            value={draft.guests}
            allowEmpty
            onChange={(guests) => set({ guests })}
          />
        </SheetRow>
        <SheetRow label="Waitresses">
          <NumberStepper
            label="waitresses"
            value={draft.waitresses}
            allowEmpty
            onChange={(waitresses) => set({ waitresses })}
          />
        </SheetRow>
        <SheetRow label="Kosher">
          <YesNo value={draft.kosher} onChange={(kosher) => set({ kosher })} label="Kosher" />
        </SheetRow>
        <SheetRow label="Units ordered">
          {/* Packed on the Content tab, so this reads it rather than
              editing it — and offers the trip there instead. */}
          <button
            type="button"
            onClick={onOpenContent}
            className="rounded-md px-1.5 py-0.5 text-sm tabular-nums text-ink underline decoration-line underline-offset-4 hover:bg-black/[0.04] hover:decoration-accent"
            title="Edit the packing on the Content tab"
          >
            {totalUnits > 0 ? nf.format(totalUnits) : "None yet"}
          </button>
        </SheetRow>
      </section>

      <section className="flex min-w-0 flex-col">
        <GroupLabel>On display</GroupLabel>
        {/*
          Flat and open, where the Details sheet had these folded under a
          Display heading. That fold existed to stop three display types
          lengthening a column they shared with Guests and Waitresses;
          with a heading of their own there is nothing left to protect,
          and folding two steppers away costs a click to answer a question
          the tab exists to answer.

          Archived options appear only while this order still has some, so
          a retired one can be cleared but never added.
        */}
        {displayOptions.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">
            No display options yet — add them in Settings.
          </p>
        ) : (
          displayOptions.map((option) => (
            <SheetRow key={option.id} label={option.name}>
              <NumberStepper
                label={option.name.toLowerCase()}
                value={quantityOf(draft.displays, option.id)}
                onChange={(quantity) =>
                  set({ displays: withDisplay(draft.displays, option.id, quantity) })
                }
              />
            </SheetRow>
          ))
        )}
      </section>

      {/*
        One row, label left and control right — the same shape every
        SheetRow above it has. As a headed section it drew a rule under
        two words and then put a pair of chips beneath, which read as a
        group with one empty row in it.
      */}
      <section className="flex min-w-0 items-center justify-between gap-4">
        <GroupLabel rule={false}>Getting it there</GroupLabel>
        {/*
          A destination sets the price; "Other" turns delivery on with
          none, which is the hand-typed case — an order can be booked for
          delivery before anyone has said where or what it costs. Whatever
          it ends up costing is typed on the money rail beside this, which
          grows a Delivery row the moment this stops saying "None".
        */}
        <ChipSpread
          label="Delivery"
          showLabel={false}
          value={hasDelivery(draft) ? String(draft.deliveryOptionId ?? "other") : "none"}
          onChange={(value) =>
            onChange(
              withDelivery(
                draft,
                value !== "none",
                value === "other" || value === "none" ? null : Number(value),
              ),
            )
          }
          options={[
            { value: "none", label: "None" },
            ...spreadOptions(
              rates.deliveryOptions,
              String(draft.deliveryOptionId ?? ""),
              (option) => ({
                value: String(option.id),
                label: option.name,
                archivedAt: option.archivedAt,
              }),
            ),
            { value: "other", label: "Other" },
          ]}
        />
      </section>
      {hasDelivery(draft) && (
        <p className="-mt-3 text-[11px] text-ink-soft">
            {draft.deliveryOptionId === null
            ? "Set what this one costs on the money rail."
            : "Priced from the destination — type over it on the rail if this trip is different."}
        </p>
      )}
    </div>
  );
}

/** How many of one display option this order carries. */
function quantityOf(displays: OrderDisplay[], optionId: number): number {
  return displays.find((entry) => entry.optionId === optionId)?.quantity ?? 0;
}

/**
 * Sets one option's quantity, dropping the row at zero.
 *
 * Zero rows are not stored: "none of this" and "never asked about this"
 * are the same thing for a display, and keeping the row would put an
 * empty line in every order that ever touched the stepper.
 */
function withDisplay(displays: OrderDisplay[], optionId: number, quantity: number): OrderDisplay[] {
  const rest = displays.filter((entry) => entry.optionId !== optionId);
  return quantity > 0 ? [...rest, { optionId, quantity }] : rest;
}
