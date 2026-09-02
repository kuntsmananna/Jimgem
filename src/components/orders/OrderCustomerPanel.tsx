"use client";

import {
  PAYMENT_STATUS_LABEL,
  type OrderInput,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { ExternalLink, MapPin } from "lucide-react";
import { TextInput, TextArea } from "@/components/Field";
import { useIsMobile } from "@/components/useMediaQuery";
import { useOrderTypes } from "@/components/OrderTypesContext";
import { useStages } from "@/components/ProductionStagesContext";
import { orderTypeIconElement } from "@/lib/icons";
import type { Client } from "@/lib/clients";
import { ChipSpread, spreadOptions } from "./ChipSpread";
import { ClientPicker } from "./ClientPicker";
import { FieldLabel } from "./OrderSheet";

/**
 * The Customer tab: who the order is for, when, where, and how it is
 * classed.
 *
 * Split out of what used to be a single Details sheet when the form went
 * to three tabs. The three classifications were `PillSelect` dropdowns
 * crowded onto one line under the name; with the tab to themselves they
 * are spread out as chips, so what an order *is* reads at a glance
 * instead of taking three clicks to check.
 */
export function OrderCustomerPanel({
  draft,
  onChange,
  clients,
  newClientPhone,
  onNewClientPhone,
}: {
  draft: OrderInput;
  clients: Client[];
  /** Phone for a client this order is about to create — see OrderForm. */
  newClientPhone: string;
  onNewClientPhone: (phone: string) => void;
  onChange: (draft: OrderInput) => void;
}) {
  const orderTypes = useOrderTypes();
  const stages = useStages();
  // Only the notes field asks: on a laptop its height comes from `flex-1`
  // against the money rail, and an inline height would fight that.
  const mobile = useIsMobile();
  const set = (patch: Partial<OrderInput>) => onChange({ ...draft, ...patch });

  return (
    /*
      Two columns from the top, so Notes starts level with the money rail
      beside it rather than a third of the way down the panel. What the
      order *is* reads straight down the wide side — name, when and where,
      then how it is classed — and the note about it sits alongside the
      whole of that.

      One column on a phone: 1.45fr of a 358px screen is 200px, and the
      note beside it would be a slot rather than a field.
    */
    <div className="grid min-h-full grid-cols-[1.45fr_1fr] gap-x-8 max-md:grid-cols-1 max-md:gap-y-5">
      <section className="flex min-w-0 flex-col">
        {/*
          No heading over this. The dialog is already titled "Edit order"
          and the first thing in it is the customer's name at 28px — a
          caption saying THE CUSTOMER above that labels the unmistakable.

          The name is the headline, not a field: it is how you know which
          order is open, and at 14px in a grid cell it never read that way.
        */}
        {/*
          The same field as the two under it — `.input`, so it fills when
          empty, drops to bare text when filled, and deepens on hover —
          only set at headline size. It used to be an underline, which
          made three fields on one line look like three different kinds of
          object for no reason other than their sizes.
        */}
        {/*
          The same field it was, with recognition added: clients already on
          file are offered as the name is typed, and picking one links the
          order to them. That link is what every client view and every
          SUMIT document hangs off — free text has nowhere to keep an id.
        */}
        <ClientPicker
          clients={clients}
          name={draft.customer}
          clientId={draft.clientId}
          phone={newClientPhone}
          onPick={(patch) => set(patch)}
          onPhone={onNewClientPhone}
        />

        {/*
          When and where, on the line under the name — they are the rest of
          "which order", and each is one short value that would waste a row
          of its own. Both go uncaptioned: a date field is self-evident,
          and the location box says "Location" until it has one, behind a
          pin so it reads as a place rather than as more free text.
        */}
        {/*
          The way to the client's own card, once the order has one.
          Deliberately a new tab: this popup is holding unsaved work, and a
          link that navigated away from it would trade an order for a
          lookup. Under the name rather than beside it — the name is a
          headline and a link tucked into its baseline would be read as
          part of it.
        */}
        {draft.clientId !== null && (
          <a
            href={`/clients?client=${draft.clientId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 flex w-fit items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
          >
            <ExternalLink size={11} />
            Open client card
          </a>
        )}

        <div className="mt-2.5 flex items-center gap-2.5">
          <TextInput
            type="date"
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
            aria-label="Date"
            // Sized to the date plus its button and no further: at 9.5rem the
            // picker sat at the far right of a box the date only half filled,
            // reading as a control belonging to nothing in particular.
            // Wider on a phone: the same date is 16px there, and the box
            // is sized to the date plus its picker button and no further.
            className="w-[8.5rem] shrink-0 px-2.5 py-1.5 text-sm tabular-nums max-md:w-[10.5rem]"
          />
          <label className="relative flex min-w-0 flex-1 items-center">
            <MapPin
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 text-ink-soft"
            />
            <TextInput
              value={draft.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Location"
              aria-label="Location"
              className="w-full py-1.5 pr-2.5 pl-8 text-sm"
            />
          </label>
        </div>

        {/* No heading here either: three captioned chip rows say what they
            are, and a section title over them was a heading for headings. */}
        <div className="mt-7 flex flex-col gap-4">
          <ChipSpread
            label="Order type"
            value={draft.customerType}
            onChange={(customerType) => set({ customerType })}
            options={[
              { value: "", label: "No type" },
              ...spreadOptions(orderTypes, draft.customerType, (t) => ({
                // Orders reference a type by name, not by id — see
                // CLAUDE.md on why an import must never be rejected by a
                // value that isn't on the list.
                value: t.name,
                label: t.name,
                color: t.color,
                icon: orderTypeIconElement(t.icon, 11),
                archivedAt: t.archivedAt,
              })),
            ]}
          />
          <ChipSpread
            label="Payment"
            value={draft.paymentStatus}
            onChange={(value) => set({ paymentStatus: value as PaymentStatus })}
            options={(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => ({
              value: s,
              label: PAYMENT_STATUS_LABEL[s],
            }))}
          />
          <ChipSpread
            label="Status"
            value={draft.productionStatus}
            onChange={(productionStatus) => set({ productionStatus })}
            options={spreadOptions(
              stages,
              draft.productionStatus,
              (s) => ({ value: s.key, label: s.label, color: s.color, archivedAt: s.archivedAt }),
              // Stages are stored by key, so a stage row that has gone
              // missing would otherwise draw a chip reading "paid-closed".
              () => "Unknown status",
            )}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col">
        {/* Captioned, not headed: one field wants its name directly above
            it, and a ruled group line over a single box separated it
            from nothing. */}
        <FieldLabel>Notes</FieldLabel>
        {/* Keeps its box whether filled or not, unlike the single-line
            fields: an unbordered block of text has nothing to say where
            the writing area ends. Runs the height of the panel, which is
            the height of the rail across from it.

            On a phone there is no second column, so `flex-1` resolves to
            the textarea's own two-row height and a long note shows three
            lines of itself. `autoGrow` follows the text instead, from a
            floor of eight lines so an empty field still looks like
            somewhere to write. */}
        <TextArea
          autoGrow={mobile}
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          aria-label="Notes"
          placeholder="Anything worth remembering about this order"
          className="w-full flex-1 border-line bg-cream/40 px-2.5 py-2 text-sm max-md:min-h-32"
        />
      </section>
    </div>
  );
}
