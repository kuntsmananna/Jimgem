"use client";

import { Redo2, Undo2 } from "lucide-react";
import type { Undoable } from "./useUndoable";

/**
 * The undo pair, for a popup's save row.
 *
 * A shortcut nobody can see is a shortcut nobody uses — and on a form with
 * three tabs the change being undone may be on a tab that isn't open, so
 * the buttons also say that something moved. Both forms that have a
 * history draw them, which is why they are here rather than written out
 * twice: the treatment of the disabled state is the sort of thing that
 * drifts the moment there are two copies.
 */
export function UndoRedo({ form }: { form: Pick<Undoable<never>, "undo" | "redo" | "canUndo" | "canRedo"> }) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        onClick={form.undo}
        disabled={!form.canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className={BUTTON}
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={form.redo}
        disabled={!form.canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        className={BUTTON}
      >
        <Redo2 size={14} />
      </button>
    </span>
  );
}

const BUTTON =
  "rounded-full p-1.5 text-ink-soft transition hover:bg-black/5 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent";
