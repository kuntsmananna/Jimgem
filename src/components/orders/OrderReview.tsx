"use client";

import { Pencil, UserRound } from "lucide-react";
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
  const extras = extraSlots(draft).filter((slot) => slot.on > 0);
  const flavorName = new Map(flavors.map((f) => [String(f.id), f.name]));
  const packageName = new Map(packageTypes.map((p) => [String(p.id), p.name]));
  const totalUnits = lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0);

  return (
    <div className="flex flex-col gap-3">
      <Section title="Customer" onEdit={() => onEdit(0)}>
        <p className="font-display text-[22px] leading-[1.15] font-extrabold break-words">{draft.customer}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {orderWeekday(draft.date)} {formatOrderDate(draft.date)}
          {draft.location && ` · ${draft.location}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StageChip stageKey={draft.productionStatus} />
          {draft.customerType && <EventTypeChip value={draft.customerType} />}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(draft.paymentStatus)}`}
          >
            {PAYMENT_STATUS_LABEL[draft.paymentStatus as PaymentStatus] ?? draft.paymentStatus}
            {method && <span className="font-normal opacity-70"> · {method.name}</span>}
          </span>
        </div>
        {draft.notes && <p className="mt-2 text-sm whitespace-pre-line text-ink">{draft.notes}</p>}
      </Section>

      <Section title="Event" onEdit={() => onEdit(1)}>
        {draft.guests === null && extras.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing added for the event.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.guests !== null && (
              <span className="flex items-center gap-1 rounded-full bg-band px-2 py-0.5 text-[11px] font-semibold text-ink">
                <UserRound size={12} aria-hidden />
                {count(draft.guests)} guests
              </span>
            )}
            {extras.map(({ icon: Icon, short }) => (
              <span
                key={short}
                className="flex items-center gap-1 rounded-full bg-band px-2 py-0.5 text-[11px] font-semibold text-ink"
              >
                <Icon size={12} aria-hidden />
                {short}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Content · ${count(totalUnits)} units`} onEdit={() => onEdit(2)}>
        {lines.length === 0 ? (
          <p className="text-sm text-ink-soft">No packages yet — it can be booked now and mixed later.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((line, at) => {
              const packed = linePackedUnits(line, unitsPerPackage);
              const open = packed - lineAssignedUnits(line);
              return (
                <li key={at} className="text-sm">
                  <span className="font-bold">
                    {packageLineLabel(line, unitsPerPackage, packageName.get(String(line.packageTypeId)) ?? "")}
                  </span>
                  <span className="text-ink-soft">
                    {" "}
                    ·{" "}
                    {line.flavors.length === 0
                      ? "no flavours yet"
                      : line.flavors.map((f) => `${f.units} ${flavorName.get(f.flavorId) ?? "?"}`).join(", ")}
                    {open > 0 && line.flavors.length > 0 && ` · ${open} unassigned`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold tracking-[0.14em] uppercase">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="press -my-1 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-accent"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}
