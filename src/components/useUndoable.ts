"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a run of changes counts as one action.
 *
 * Typing a customer's name is one thing a person did, not fourteen, and an
 * undo that gave back "Ann" from "Anna" would be useless. Changes landing
 * within this window replace the top of the stack instead of pushing onto
 * it; a pause starts a new one.
 */
const COALESCE_MS = 500;

/**
 * How far back it remembers. Deep enough to cover a whole form-filling
 * session, bounded because each entry is a full copy of the draft.
 */
const LIMIT = 50;

type Update<T> = T | ((previous: T) => T);

function resolve<T>(next: Update<T>, previous: T): T {
  return typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
}

export interface Undoable<T> {
  value: T;
  set: (next: Update<T>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * State that remembers where it has been.
 *
 * A whole form's worth of state in one object rather than an undo per
 * field: an order is edited across three tabs and a money rail, and the
 * only useful step back is "the form as it was a moment ago" — undoing a
 * flavour split while the price it drove stayed put would be worse than no
 * undo at all.
 *
 * Snapshots are whole copies of `T`, which is affordable because a draft
 * is a few dozen fields and the stack is capped: the alternative — storing
 * inverse operations — needs every call site to describe its own undo, and
 * one that forgets leaves the history quietly lying.
 */
export function useUndoable<T>(initial: T): Undoable<T> {
  const [{ past, present, future }, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });
  const lastEdit = useRef(0);

  const set = useCallback((next: Update<T>) => {
    const now = Date.now();
    const continues = now - lastEdit.current < COALESCE_MS;
    lastEdit.current = now;
    setState((state) => {
      const value = resolve(next, state.present);
      // A setter that changed nothing is not a step: panels re-emit their
      // whole draft on every keystroke, and a no-op would still push.
      if (Object.is(value, state.present)) return state;
      return {
        // Continuing a run advances the present and leaves the past alone,
        // so undo lands before the run started rather than mid-word.
        past: continues && state.past.length > 0 ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: value,
        // Any new edit abandons the redo branch — the future it belonged
        // to is not the one being written any more.
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    // Reset the clock, or the next edit would coalesce into the restored
    // state and swallow the step just recovered.
    lastEdit.current = 0;
    setState((state) =>
      state.past.length === 0
        ? state
        : {
            past: state.past.slice(0, -1),
            present: state.past[state.past.length - 1]!,
            future: [state.present, ...state.future],
          },
    );
  }, []);

  const redo = useCallback(() => {
    lastEdit.current = 0;
    setState((state) =>
      state.future.length === 0
        ? state
        : { past: [...state.past, state.present], present: state.future[0]!, future: state.future.slice(1) },
    );
  }, []);

  return { value: present, set, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}

/** Inputs whose own undo stack is better than ours — see below. */
const TEXTUAL = new Set(["text", "search", "tel", "url", "email", "password", "number", ""]);

function typingInText(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return true;
  return active instanceof HTMLInputElement && TEXTUAL.has(active.type);
}

/**
 * ⌘Z / Ctrl+Z to undo, add Shift to redo, while `enabled`.
 *
 * Deliberately *not* while the caret is in a text field: the browser's own
 * undo works there at character and selection level, which is what someone
 * mid-word means by undo. Taking the key from it would trade a good undo
 * for a coarse one exactly where the good one exists. A controlled input's
 * native undo fires `input`, so React sees it and the two stay in step.
 */
export function useUndoShortcuts(undo: () => void, redo: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (typingInText()) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, enabled]);
}
