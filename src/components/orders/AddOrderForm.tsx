"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  type OrderContentLine,
  type OrderInput,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";

const emptyLine = (): OrderContentLine => ({ packageTypeId: "", flavorId: null, quantity: 1 });

const emptyDraft = (): OrderInput => ({
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
});

export function AddOrderForm({
  flavors,
  packageTypes,
  onSaved,
  onCancel,
}: {
  flavors: Flavor[];
  packageTypes: PackageType[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<OrderInput>(emptyDraft());
  const [lines, setLines] = useState<OrderContentLine[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  function updateLine(i: number, patch: Partial<OrderContentLine>) {
    setLines((prev) => prev.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
  }

  async function submit() {
    if (!draft.customer.trim()) return;
    setBusy(true);
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        contentLines: lines.filter((l) => l.packageTypeId && l.quantity > 0),
      }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <div className="rounded-xl border border-line bg-cream/50 p-4">
      <div className="grid grid-cols-4 gap-3">
        <Field label="Date">
          <input
            type="date"
            className="input"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Customer">
          <input
            className="input"
            value={draft.customer}
            onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <input
            className="input"
            value={draft.customerType}
            onChange={(e) => setDraft({ ...draft, customerType: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <input
            className="input"
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </Field>
        <Field label="Guests">
          <input
            type="number"
            className="input"
            value={draft.guests ?? ""}
            onChange={(e) => setDraft({ ...draft, guests: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Delivery ₪">
          <input
            type="number"
            className="input"
            value={draft.deliveryCost ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, deliveryCost: e.target.value ? Number(e.target.value) : null })
            }
          />
        </Field>
        <Field label="Mirrors">
          <input
            type="number"
            className="input"
            value={draft.mirrors ?? ""}
            onChange={(e) => setDraft({ ...draft, mirrors: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Amount ₪">
          <input
            type="number"
            className="input"
            value={draft.totalAmount}
            onChange={(e) => setDraft({ ...draft, totalAmount: Number(e.target.value) })}
          />
        </Field>
        <Field label="Deposit ₪">
          <input
            type="number"
            className="input"
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
          <input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-ink-soft">Content</p>
        <div className="mt-2 flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input"
                value={line.packageTypeId}
                onChange={(e) => updateLine(i, { packageTypeId: e.target.value })}
              >
                <option value="">Package…</option>
                {packageTypes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={line.flavorId ?? ""}
                onChange={(e) => updateLine(i, { flavorId: e.target.value || null })}
              >
                <option value="">Mix</option>
                {flavors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="input w-20"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              />
              <button
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-xs font-semibold text-ink-soft hover:text-ink"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="self-start text-xs font-semibold text-accent"
          >
            + Add line
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
        >
          Save order
        </button>
        <button onClick={onCancel} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
      {label}
      {children}
    </label>
  );
}
