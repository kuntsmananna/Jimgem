"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderType } from "@/lib/settings";
import { ORDER_TYPE_ICON_KEYS, orderTypeIconElement } from "@/lib/icons";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";

const DEFAULT_COLOR = "#f6d9a8";

interface TypeDraft {
  name: string;
  color: string;
  icon: string | null;
}

const BLANK: TypeDraft = { name: "", color: DEFAULT_COLOR, icon: "tag" };

/**
 * Settings → Lists → Order types. The kind of event an order is for, with
 * the colour and icon its chip gets everywhere it appears.
 *
 * Orders store the type's *name*, not its id (see schema.sql), so
 * renaming one here also renames it on every order that used it —
 * otherwise those orders would quietly lose their type.
 */
export function OrderTypesPanel({ items }: { items: OrderType[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<TypeDraft>(BLANK);
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    setEditing(null);
    router.refresh();
  }

  function submit() {
    if (!draft.name.trim()) return;
    if (editing === "new") return send("/api/settings/order-types", "POST", draft);
    return send(`/api/settings/order-types/${editing}`, "PATCH", draft);
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Order types"
        description={<>Shown as a coloured chip on every order.</>}
        action={<button
          onClick={() => {
            setEditing(editing === "new" ? null : "new");
            setDraft(BLANK);
          }}
          className={PANE_ACTION_CLASS}
        >
          {editing === "new" ? "Cancel" : "+ Add"}
        </button>}
      />

      {editing === "new" && (
        <div className="mt-3">
          <TypeEditor draft={draft} onChange={setDraft} busy={busy} onSave={submit} onCancel={() => setEditing(null)} />
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            {editing === item.id ? (
              <TypeEditor
                draft={draft}
                onChange={setDraft}
                busy={busy}
                onSave={submit}
                onCancel={() => setEditing(null)}
                onRemove={() => send(`/api/settings/order-types/${item.id}`, "PATCH", { archive: true })}
              />
            ) : (
              <button
                className="hover-line flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left"
                onClick={() => {
                  setEditing(item.id);
                  setDraft({ name: item.name, color: item.color, icon: item.icon });
                }}
              >
                <span
                  className="keeps-color flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-ink"
                  style={{ background: item.color }}
                >
                  {orderTypeIconElement(item.icon, 11)}
                  {item.name}
                </span>
                <span className="flex-1" />
                <span className="text-[11px] text-ink-soft">{item.color}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TypeEditor({
  draft,
  onChange,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  draft: TypeDraft;
  onChange: (draft: TypeDraft) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-cream/50 p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Type colour"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
          value={draft.color}
          onChange={(e) => onChange({ ...draft, color: e.target.value })}
        />
        <input
          autoFocus
          placeholder="Type name"
          className="flex-1 rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none focus:border-accent"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <span
          className="keeps-color flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-ink"
          style={{ background: draft.color }}
        >
          {orderTypeIconElement(draft.icon, 11)}
          {draft.name.trim() || "Preview"}
        </span>
      </div>

      {/* The whole set at once rather than a dropdown: there are eighteen,
          they're the point of the choice, and a picker you have to open to
          see defeats picking by eye. */}
      <div className="mt-2 flex flex-wrap gap-1">
        {ORDER_TYPE_ICON_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key}
            aria-pressed={draft.icon === key}
            onClick={() => onChange({ ...draft, icon: key })}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
              draft.icon === key
                ? "border-ink bg-black text-cream"
                : "border-line bg-card text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {orderTypeIconElement(key, 14)}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={busy || !draft.name.trim()}
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-xs font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
        <span className="flex-1" />
        {onRemove && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="text-xs font-semibold text-ink-soft hover:text-amber-700"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
