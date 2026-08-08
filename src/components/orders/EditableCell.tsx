"use client";

import { useState } from "react";

/**
 * Click-to-edit table cell. Only rendered as editable for DB orders —
 * Sheet orders are read-only except for production status (see
 * StatusSelects.tsx), so callers pass editable=false for those.
 */
export function EditableCell({
  editable,
  displayValue,
  editValue,
  type = "text",
  onSave,
}: {
  editable: boolean;
  displayValue: React.ReactNode;
  editValue: string;
  type?: "text" | "number" | "date";
  onSave: (raw: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(editValue);
  const [busy, setBusy] = useState(false);

  if (!editable) {
    return <span>{displayValue}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(editValue);
          setEditing(true);
        }}
        className="-mx-1 block w-full rounded px-1 text-left hover:bg-black/5"
      >
        {displayValue}
      </button>
    );
  }

  async function save() {
    setBusy(true);
    await onSave(value);
    setBusy(false);
    setEditing(false);
  }

  return (
    <input
      autoFocus
      type={type}
      value={value}
      disabled={busy}
      className="input w-full"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
