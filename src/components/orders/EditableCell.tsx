"use client";

import { useState } from "react";
import { TextInput } from "@/components/Field";

/**
 * Click-to-edit table cell. Both the display button and the edit input
 * are interactive elements, which is how the Orders table's row-click
 * guard knows to leave them alone (see OrdersTable's INTERACTIVE).
 */
export function EditableCell({
  displayValue,
  editValue,
  type = "text",
  onSave,
}: {
  displayValue: React.ReactNode;
  editValue: string;
  type?: "text" | "number" | "date";
  onSave: (raw: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(editValue);
  const [busy, setBusy] = useState(false);

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
    <TextInput
      autoFocus
      type={type}
      value={value}
      disabled={busy}
      className="w-full"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
