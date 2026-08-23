"use client";

import { useState } from "react";
import { TextInput, SelectInput } from "@/components/Field";

/**
 * Click-to-edit table cell. Both the display button and the edit control
 * are interactive elements, which is how the Orders table's row-click
 * guard knows to leave them alone (see OrdersTable's INTERACTIVE).
 *
 * Pass `options` for a field whose values come from a list the owner
 * manages, and the cell edits as a dropdown instead of free text.
 */
export function EditableCell({
  displayValue,
  editValue,
  type = "text",
  options,
  chip = false,
  renderIdle,
  onSave,
}: {
  displayValue: React.ReactNode;
  editValue: string;
  type?: "text" | "number" | "date";
  options?: { value: string; label: string }[];
  /** True when the value is drawn as a chip — see `.is-chip` in globals.css. */
  chip?: boolean;
  /**
   * Draws the idle cell yourself, and says when editing starts.
   *
   * For a value that is more than a value — the customer name is also a
   * link to the client — where clicking it has to do the other thing and
   * editing needs a control of its own. The editing half stays here, so
   * only the display is the caller's problem.
   */
  renderIdle?: (startEditing: () => void) => React.ReactNode;
  onSave: (raw: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(editValue);
  const [busy, setBusy] = useState(false);

  async function save(raw: string) {
    setBusy(true);
    await onSave(raw);
    setBusy(false);
    setEditing(false);
  }

  function startEditing() {
    setValue(editValue);
    setEditing(true);
  }

  if (!editing) {
    if (renderIdle) return <>{renderIdle(startEditing)}</>;
    return (
      <button
        onClick={startEditing}
        // `editable-cell` (globals.css) is what makes "this can be
        // edited" visible on hover, on cream and on the black a hovered
        // row turns.
        className={`editable-cell -mx-1 block w-full px-1 text-left ${chip ? "is-chip" : ""}`}
      >
        {displayValue}
      </button>
    );
  }

  if (options) {
    return (
      <SelectInput
        autoFocus
        value={value}
        disabled={busy}
        className="w-full"
        // Saved on pick rather than on blur: choosing from a list is the
        // whole edit, and waiting for a blur left the cell looking changed
        // while nothing had been written yet.
        onChange={(e) => {
          setValue(e.target.value);
          void save(e.target.value);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {/* An imported order can carry a value the owner hasn't added to
            the list. It stays selectable so opening the cell and closing it
            again can't silently retype the order. */}
        {editValue && !options.some((option) => option.value === editValue) && (
          <option value={editValue}>{editValue} (not on the list)</option>
        )}
      </SelectInput>
    );
  }

  return (
    <TextInput
      autoFocus
      type={type}
      value={value}
      disabled={busy}
      className="w-full"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => save(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
