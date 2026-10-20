"use client";

import { CalendarDays, MapPin, Pencil, UserRound } from "lucide-react";
import {
  type OrderInput,
  type OrderPackageLine,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
  formatOrderDate,
  linePackedUnits,
  lineAssignedUnits,
  orderWeekday,
  packageLineLabel,
  paymentBadgeClass,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { count } from "@/lib/money";
import { EventTypeChip } from "./EventTypeChip";
import { StageChip } from "./StageChip";
import { extraSlots } from "./OrdersTable";
import { GroupLabel } from "./OrderSheet";
import { PackedUnits } from "./PackageLineEditor";
import { usePaymentMethods } from "./PaymentMethodsContext";

/**
 * The last step of adding an order on a phone (v0.83): the whole order on
 * one screen before it is saved.
 *
 * The steps before it each show a third of the order, so this is the one
 * place a booking taken standing up can be read back whole — to the
 * customer, if they are standing there too. Each part is written the way
 * the Orders card writes it, so what you check here is what the list will
 * show, and each carries an **Edit** that jumps back to its step: a
 * review you cannot act on from is a summary, not a review. The money is
 * not here — the form puts the full money rail under this, since the
 * price is the thing most likely to be adjusted at the last moment.
 */
export function OrderReview({
  draft,
  lines,
  flavors,
  packageTypes,
  unitsPerPackage,
  onEdit,
}: {
  draft: OrderInput;
  lines: OrderPackageLine[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  unitsPerPackage: Map<number, number>;
  /** Back to step 0 (customer), 1 (event) or 2 (content). */
  onEdit: (step: number) => void;
}) {
  const method = usePaymentMethods().find((m) => m.id === draft.paymentMethodId);
  // Guests lead the event's chips, then whatever extras the order has.
  const eventChips = [
    ...(draft.guests !== null ? [{ icon: UserRound, short: `${count(draft.guests)} guests` }] : []),
    ...extraSlots(draft).filter((slot) => slot.on > 0),
  ];
  const flavorName = new Map(flavors.map((f) => [String(f.id), f.name]));
  const packageName = new Map(packageTypes.map((p) => [String(p.id), p.name]));
  const totalUnits = lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* The customer is the hero, in the tinted box every other step
          leads with (v0.84.4): the name at the Customer step's own size, and
          when and where behind the same two marks. */}
      <section className="rounded-card border border-line/70 bg-cream/70 px-4 py-3">
        <div className="flex items-start gap-2">
          <p
            data-private
            className="min-w-0 flex-1 font-display text-[28px] leading-tight font-extrabold tracking-tight break-words"
          >
            {draft.customer}
          </p>
          <button
            type="button"
            onClick={() => onEdit(0)}
            aria-label="Edit who it's for"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
          >
            <Pencil size={14} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
          <span className="flex items-center gap-1.5 tabular-nums">
            <CalendarDays size={15} aria-hidden className="text-ink-soft" />
            {orderWeekday(draft.date)} {formatOrderDate(draft.date)}
          </span>
          {draft.location && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin size={15} aria-hidden className="shrink-0 text-ink-soft" />
              <span data-private className="truncate">{draft.location}</span>
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StageChip stageKey={draft.productionStatus} />
          {draft.customerType && <EventTypeChip value={draft.customerType} />}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(draft.paymentStatus)}`}
          >
            {PAYMENT_STATUS_LABEL[draft.paymentStatus as PaymentStatus] ?? draft.paymentStatus}
            {method && <span className="font-normal opacity-70"> · {method.name}</span>}
          </span>
        </div>
      </section>

      {draft.notes && (
        <Section title="Notes" onEdit={() => onEdit(0)}>
          <p className="text-base whitespace-pre-line text-ink">{draft.notes}</p>
        </Section>
      )}

      <Section title="Event" onEdit={() => onEdit(1)}>
        {eventChips.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing added for the event.</p>
        ) : (
          // From the right, like every chip spread on the form's steps.
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {eventChips.map(({ icon: Icon, short }) => (
              <span
                key={short}
                className="flex items-center gap-1 rounded-full bg-band px-2.5 py-1 text-xs font-semibold text-ink"
              >
                <Icon size={13} aria-hidden />
                {short}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Content" onEdit={() => onEdit(2)}>
        {lines.length === 0 ? (
          <p className="text-sm text-ink-soft">No packages yet — it can be booked now and mixed later.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((line, at) => {
              const packed = linePackedUnits(line, unitsPerPackage);
              const open = packed - lineAssignedUnits(line);
              return (
                <li key={at}>
                  {/* A package a row: what it is on the left, its units on
                      the right, as the Content step writes them. */}
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-base font-bold">
                      {packageLineLabel(line, unitsPerPackage, packageName.get(String(line.packageTypeId)) ?? "")}
                    </span>
                    <PackedUnits packed={packed} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {line.flavors.length === 0
                      ? "No flavours yet"
                      : line.flavors.map((f) => `${f.units} ${flavorName.get(f.flavorId) ?? "?"}`).join(" · ")}
                    {open > 0 && line.flavors.length > 0 && (
                      <span className="font-semibold text-amber-800"> · {open} unassigned</span>
                    )}
                  </p>
                </li>
              );
            })}
            <li className="flex items-center justify-end gap-2 border-t border-current/12 pt-2">
              <span className="text-sm text-ink-soft">Total</span>
              <PackedUnits packed={totalUnits} />
            </li>
          </ul>
        )}
      </Section>
    </div>
  );
}

/**
 * A section after the hero: the form's own ruled heading (`GroupLabel`),
 * with its Edit at the right end of the rule, so the review reads as the
 * form folded shut rather than a summary of a different screen.
 */
function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section>
      <GroupLabel
        action={
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${title.toLowerCase()}`}
            className="press -my-1.5 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-accent"
          >
            <Pencil size={12} />
            Edit
          </button>
        }
      >
        {title}
      </GroupLabel>
      {children}
    </section>
  );
}
