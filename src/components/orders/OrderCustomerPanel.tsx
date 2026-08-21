"use client";

import {
  PAYMENT_STATUS_LABEL,
  type OrderInput,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { TextInput, TextArea } from "@/components/Field";
import { useOrderTypes } from "@/components/OrderTypesContext";
import { useStages } from "@/components/ProductionStagesContext";
import { orderTypeIconElement } from "@/lib/icons";
import type { Client } from "@/lib/clients";
import { ChipSpread, spreadOptions } from "./ChipSpread";
import { ClientPicker } from "./ClientPicker";
import { GroupLabel } from "./OrderSheet";

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
  onChange: (draft: OrderInput) => void;
  clients: Client[];
  /** Phone for a client this order is about to create — see OrderForm. */
  newClientPhone: string;
  onNewClientPhone: (phone: string) => void;
}) {
  const orderTypes = useOrderTypes();
  const stages = useStages();
  const set = (patch: Partial<OrderInput>) => onChange({ ...draft, ...patch });

  return (
    <div className="flex min-h-full flex-col">
      <GroupLabel>The customer</GroupLabel>
      {/*
        The name is the headline, not a field: it is how you know which
        order is open, and at 14px in a grid cell it never read that way.
        Date and location ride beside it — they are the rest of "which
        order", and each is one short value that would waste a row.
      */}
      <div className="flex items-end gap-5">
        <ClientPicker
          clients={clients}
          name={draft.customer}
          clientId={draft.clientId}
          phone={newClientPhone}
          onPick={(patch) => set(patch)}
          onPhone={onNewClientPhone}
        />
        <label className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">Date</span>
          <TextInput
            type="date"
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
            aria-label="Date"
            className="w-[9rem] text-sm tabular-nums"
          />
        </label>
        <label className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">Location</span>
          <TextInput
            value={draft.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Location"
            aria-label="Location"
            className="w-56 text-sm"
          />
        </label>
      </div>

      {/*
        The classifications get the wide side and the notes the narrow
        one: nine order types wrap to three rows and need the room, while
        notes are read as a block whatever width they get.
      */}
      <div className="mt-6 grid flex-1 grid-cols-[1.45fr_1fr] gap-x-8">
        <section className="flex min-w-0 flex-col gap-4">
          <GroupLabel>How it is classed</GroupLabel>
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
            options={spreadOptions(stages, draft.productionStatus, (s) => ({
              value: s.key,
              label: s.label,
              color: s.color,
              archivedAt: s.archivedAt,
            }))}
          />
        </section>

        <section className="flex min-w-0 flex-col">
          <GroupLabel>Notes</GroupLabel>
          {/* Keeps its box whether filled or not, unlike the single-line
              fields: an unbordered block of text has nothing to say where
              the writing area ends. */}
          <TextArea
            rows={9}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            aria-label="Notes"
            placeholder="Anything worth remembering about this order"
            className="w-full flex-1 border-line bg-cream/40 px-2.5 py-2 text-sm"
          />
        </section>
      </div>
    </div>
  );
}
