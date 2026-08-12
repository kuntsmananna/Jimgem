"use client";

import { useMemo, useState } from "react";
import { Boxes, Package, PackageOpen } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  type Order,
  type OrderContentLine,
  type OrderInput,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { flavorGradient } from "./ContentChips";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * Quantities keyed by id, for each of the form's two content lists. Held
 * as maps rather than a line array so a card can be blanked and refilled
 * without the row disappearing and reappearing under the cursor.
 */
type Quantities = Record<string, number>;

const PACKAGE_ICONS = [Package, Boxes, PackageOpen];

function draftFromOrder(order?: Order): OrderInput {
  if (!order) {
    return {
      date: new Date().toISOString().slice(0, 10),
      customer: "",
      customerType: "",
      location: "",
      guests: null,
      deliveryCost: null,
      mirrors: null,
      contentLines: [],
      totalAmount: 0,
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
    deliveryCost: order.deliveryCost,
    mirrors: order.mirrors,
    contentLines: order.contentLines,
    totalAmount: order.totalAmount,
    deposit: order.deposit,
    paymentStatus: order.paymentStatus,
    productionStatus: order.productionStatus ?? "queue",
    notes: order.notes,
  };
}

function quantitiesFrom(lines: OrderContentLine[], kind: OrderContentLine["kind"]): Quantities {
  const result: Quantities = {};
  for (const line of lines) {
    if (line.kind !== kind) continue;
    const id = line.kind === "package" ? line.packageTypeId : line.flavorId;
    result[id] = (result[id] ?? 0) + line.quantity;
  }
  return result;
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
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  onSaved: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const isEdit = !!order;
  const [draft, setDraft] = useState<OrderInput>(() => draftFromOrder(order));
  const [packageQty, setPackageQty] = useState<Quantities>(() =>
    quantitiesFrom(order?.contentLines ?? [], "package"),
  );
  const [flavorQty, setFlavorQty] = useState<Quantities>(() => quantitiesFrom(order?.contentLines ?? [], "flavor"));
  const [busy, setBusy] = useState(false);

  const unitsPerPackage = useMemo(
    () => new Map(packageTypes.map((p) => [String(p.id), p.unitsPerPackage])),
    [packageTypes],
  );

  const packagedUnits = Object.entries(packageQty).reduce(
    (sum, [id, qty]) => sum + qty * (unitsPerPackage.get(id) ?? 0),
    0,
  );
  const assignedUnits = Object.values(flavorQty).reduce((sum, qty) => sum + qty, 0);

  // An order with no content at all is allowed — plenty of orders are
  // booked before anyone knows the mix. What isn't allowed is a flavour
  // split that disagrees with the packaging, which would make units-sold
  // and the flavour chart contradict each other.
  const contentEmpty = packagedUnits === 0 && assignedUnits === 0;
  const contentBalanced = contentEmpty || packagedUnits === assignedUnits;
  const canSave = draft.customer.trim().length > 0 && contentBalanced && !busy;

  function buildContentLines(): OrderContentLine[] {
    return [
      ...Object.entries(packageQty)
        .filter(([, qty]) => qty > 0)
        .map(([packageTypeId, quantity]): OrderContentLine => ({ kind: "package", packageTypeId, quantity })),
      ...Object.entries(flavorQty)
        .filter(([, qty]) => qty > 0)
        .map(([flavorId, quantity]): OrderContentLine => ({ kind: "flavor", flavorId, quantity })),
    ];
  }

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    const body = JSON.stringify({ ...draft, contentLines: buildContentLines() });
    await fetch(isEdit ? `/api/orders/${order!.key}` : "/api/orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    setBusy(false);
    onSaved();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label="Date">
          <input
            type="date"
            className="input"
            placeholder=" "
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Customer">
          <input
            className="input"
            placeholder=" "
            value={draft.customer}
            onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <input
            className="input"
            placeholder=" "
            value={draft.customerType}
            onChange={(e) => setDraft({ ...draft, customerType: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <input
            className="input"
            placeholder=" "
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </Field>
        <Field label="Guests">
          <input
            type="number"
            className="input"
            placeholder=" "
            value={draft.guests ?? ""}
            onChange={(e) => setDraft({ ...draft, guests: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Mirrors">
          <input
            type="number"
            className="input"
            placeholder=" "
            value={draft.mirrors ?? ""}
            onChange={(e) => setDraft({ ...draft, mirrors: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Delivery ₪">
          <input
            type="number"
            className="input"
            placeholder=" "
            value={draft.deliveryCost ?? ""}
            onChange={(e) => setDraft({ ...draft, deliveryCost: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Amount ₪">
          <input
            type="number"
            className="input"
            placeholder=" "
            value={draft.totalAmount}
            onChange={(e) => setDraft({ ...draft, totalAmount: Number(e.target.value) })}
          />
        </Field>
        <Field label="Deposit ₪">
          <input
            type="number"
            className="input"
            placeholder=" "
            value={draft.deposit}
            onChange={(e) => setDraft({ ...draft, deposit: Number(e.target.value) })}
          />
        </Field>
        <Field label="Payment status">
          <select
            className="input"
            value={draft.paymentStatus}
            onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value as PaymentStatus })}
          >
            {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Production status">
          <select
            className="input"
            value={draft.productionStatus}
            onChange={(e) => setDraft({ ...draft, productionStatus: e.target.value as ProductionStatus })}
          >
            {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((s) => (
              <option key={s} value={s}>
                {PRODUCTION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input
            className="input"
            placeholder=" "
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
      </div>

      {/*
        Content is set apart from the text fields above on purpose: it is
        picked, not typed. Cards with nothing entered stay dimmed so the
        eye lands only on what's actually in the order.
      */}
      <div className="mt-6 rounded-card bg-cream/60 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold text-ink">Packaging</h3>
          <p className="text-xs font-semibold text-ink-soft">{nf.format(packagedUnits)} units</p>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {packageTypes.map((pkg, i) => {
            const Icon = PACKAGE_ICONS[i % PACKAGE_ICONS.length];
            return (
              <ContentCard
                key={pkg.id}
                title={pkg.name}
                subtitle={`${nf.format(pkg.unitsPerPackage)} ${pkg.unitsPerPackage === 1 ? "unit" : "units"} each`}
                quantity={packageQty[String(pkg.id)] ?? 0}
                unitLabel="packs"
                onChange={(qty) => setPackageQty((prev) => ({ ...prev, [String(pkg.id)]: qty }))}
                swatch={
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/[0.06] text-ink">
                    <Icon size={16} />
                  </span>
                }
              />
            );
          })}
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold text-ink">Flavors</h3>
          <p
            className={`text-xs font-semibold ${contentBalanced ? "text-ink-soft" : "text-amber-700"}`}
            role={contentBalanced ? undefined : "alert"}
          >
            {nf.format(assignedUnits)} / {nf.format(packagedUnits)} units assigned
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {flavors.map((flavor) => (
            <ContentCard
              key={flavor.id}
              title={flavor.name}
              subtitle={flavor.isAlcoholic ? "Alcoholic" : "Non-alcoholic"}
              quantity={flavorQty[String(flavor.id)] ?? 0}
              unitLabel="units"
              onChange={(qty) => setFlavorQty((prev) => ({ ...prev, [String(flavor.id)]: qty }))}
              swatch={
                <span
                  className="h-8 w-8 rounded-xl shadow-sm"
                  style={{ background: flavorGradient(flavor) }}
                  aria-hidden
                />
              }
            />
          ))}
        </div>

        {!contentBalanced && (
          <p className="mt-3 text-xs font-semibold text-amber-700">
            {assignedUnits > packagedUnits
              ? `${nf.format(assignedUnits - packagedUnits)} more units assigned to flavors than the packaging holds.`
              : `${nf.format(packagedUnits - assignedUnits)} units still need a flavor.`}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSave}
          title={contentBalanced ? undefined : "Flavor quantities must add up to the packaged units"}
          className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-40"
        >
          {isEdit ? "Save changes" : "Save order"}
        </button>
        <button onClick={onCancel} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink">
          {cancelLabel}
        </button>
      </div>
    </>
  );
}

function ContentCard({
  title,
  subtitle,
  quantity,
  unitLabel,
  onChange,
  swatch,
}: {
  title: string;
  subtitle: string;
  quantity: number;
  unitLabel: string;
  onChange: (quantity: number) => void;
  swatch: React.ReactNode;
}) {
  const active = quantity > 0;
  return (
    <label
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition ${
        active ? "border-line bg-card" : "border-transparent bg-card/50 opacity-45 hover:opacity-80"
      }`}
    >
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-soft">{subtitle}</span>
      </span>
      <input
        type="number"
        min={0}
        value={quantity === 0 ? "" : quantity}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        placeholder="0"
        className="w-16 rounded-lg border border-line bg-cream px-2 py-1 text-right text-sm font-semibold text-ink outline-none focus:border-accent"
      />
      <span className="w-10 shrink-0 text-[11px] text-ink-soft">{unitLabel}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
