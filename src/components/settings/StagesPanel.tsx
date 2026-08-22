"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductionStage } from "@/lib/orderTypes";
import { ArchiveButton } from "./ArchiveButton";
import { PANE_ACTION_CLASS, PaneHeader } from "./Pane";

interface StageDraft {
  label: string;
  color: string;
  countsAsIncome: boolean;
  isFinal: boolean;
}

const BLANK: StageDraft = { label: "", color: "#e4e9f2", countsAsIncome: true, isFinal: false };

/**
 * Settings → Lists → Status. The stages an order moves through, and the
 * Kanban board's columns, in the order they are listed here.
 *
 * Orders store a stage's *key*, fixed when it is created, so renaming one
 * costs nothing and cannot retype the orders using it — unlike order
 * types, which orders reference by name.
 *
 * The two switches are the whole reason this is not just a list of names:
 * they carry behaviour the code used to spell against the words "offer"
 * and "delivered".
 */
export function StagesPanel({ items }: { items: ProductionStage[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<StageDraft>(BLANK);
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string) {
    if (!draft.label.trim()) return;
    setBusy(true);
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    setEditing(null);
    router.refresh();
  }

  const submit = () =>
    editing === "new"
      ? send("/api/settings/stages", "POST")
      : send(`/api/settings/stages/${editing}`, "PATCH");

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Status"
        description={<>Also the Kanban board&apos;s columns, in this order.</>}
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
          <StageEditor draft={draft} onChange={setDraft} busy={busy} onSave={submit} />
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            {editing === item.id ? (
              <div className="flex-1">
                <StageEditor draft={draft} onChange={setDraft} busy={busy} onSave={submit} />
              </div>
            ) : (
              <>
                <button
                  className="hover-line flex flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-ink"
                  onClick={() => {
                    setEditing(item.id);
                    setDraft({
                      label: item.label,
                      color: item.color,
                      countsAsIncome: item.countsAsIncome,
                      isFinal: item.isFinal,
                    });
                  }}
                >
                  {/* The same squared chip the table's Status cell draws,
                      so a stage looks here exactly as it will there. */}
                  <span
                    className="keeps-color shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-ink"
                    style={{ background: item.color }}
                  >
                    {item.label}
                  </span>
                  <span className="flex-1" />
                  <span className="shrink-0 text-[11px] text-ink-soft">
                    {[!item.countsAsIncome && "not income", item.isFinal && "final"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <ArchiveButton resource="stages" id={item.id} name={item.label} noun="status" />
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StageEditor({
  draft,
  onChange,
  busy,
  onSave,
}: {
  draft: StageDraft;
  onChange: (draft: StageDraft) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-cream/50 p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Status colour"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
          value={draft.color}
          onChange={(e) => onChange({ ...draft, color: e.target.value })}
        />
        <input
          autoFocus
          placeholder="Status name"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none focus:border-accent"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {/* Worded as what the stage *means* rather than as column names:
            these two decide whether the Biz Plan counts the order's money
            and whether the Orders table hides it by default. */}
        <Switch
          checked={draft.countsAsIncome}
          onChange={(countsAsIncome) => onChange({ ...draft, countsAsIncome })}
          label="Counts as income"
          hint="Off for a quote — kept out of revenue and the Biz Plan."
        />
        <Switch
          checked={draft.isFinal}
          onChange={(isFinal) => onChange({ ...draft, isFinal })}
          label="Finished"
          hint="Hidden from the Orders table unless you ask for it."
        />
      </div>

      <div className="mt-2 flex justify-end">
        <button
          onClick={onSave}
          disabled={busy || !draft.label.trim()}
          className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-cream disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-black"
      />
      <span>
        <span className="font-semibold text-ink">{label}</span>
        <span className="block text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}
