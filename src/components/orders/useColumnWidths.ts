"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

/** Per-viewer, per-browser: a column width is a preference, not data. */
const STORAGE_KEY = "jimgem:orders-columns";

/** Narrower than this and a column is a sliver with nothing readable in it. */
const MIN_WIDTH = 44;

/*
 * `localStorage` as an external store, so the stored widths can be read
 * with `useSyncExternalStore` — the same reason `useMediaQuery` uses it.
 * The server has no storage and answers `null`, the client corrects on
 * hydration in one pass, and an effect writing state (which would paint
 * the default table and then snap) is never in the picture.
 *
 * `getSnapshot` returns the raw string rather than a parsed object: React
 * compares snapshots by identity, and a fresh object every call would
 * re-render forever.
 */
let listeners: (() => void)[] = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // A private window or blocked site data: no stored widths, which is a
    // valid state — the table resizes for this session and forgets.
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Nothing to remember; the live widths still apply.
  }
  for (const listener of [...listeners]) listener();
}

/**
 * Only a complete set counts. A stored map missing a column — because one
 * was added since — would put `undefined` into a `<col>` and let the
 * browser resize that one alone against fourteen pinned neighbours.
 */
function parse(raw: string | null, ids: readonly string[]): Record<string, number> | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (!ids.every((id) => typeof stored[id] === "number")) return null;
    return Object.fromEntries(ids.map((id) => [id, stored[id] as number]));
  } catch {
    return null;
  }
}

/**
 * Draggable column widths for the Orders table.
 *
 * **Nothing changes until the first drag.** The table keeps the browser's
 * automatic layout — which is what fits those fifteen columns onto a
 * laptop today — and switches to a fixed one only when someone reaches for
 * a handle, at which point every column is frozen at the width it already
 * had. So a table nobody has resized looks exactly as it did, and one that
 * has been resized stays where it was put.
 *
 * The widths live in `localStorage` rather than in a cookie, unlike
 * `vatView` and the Expenses panes: those are read on the server to get
 * the first paint right, and nothing on the server has any use for a
 * column width.
 */
export function useColumnWidths(ids: readonly string[]) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const stored = useMemo(() => parse(raw, ids), [raw, ids]);
  /**
   * The live value while a handle is being pulled. Held here rather than
   * written through on every pointer move, which would hit storage sixty
   * times a second and re-render every subscriber with it.
   */
  const [dragging, setDragging] = useState<Record<string, number> | null>(null);
  const widths = dragging ?? stored;

  /** The header row, for measuring what the automatic layout worked out. */
  const headRef = useRef<HTMLTableRowElement>(null);

  const startResize = useCallback(
    (id: string, event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      /*
       * Freeze the whole table on the first drag: the other fourteen
       * columns keep the widths they are already showing, rather than
       * redistributing the moment one of them is pinned.
       */
      const cells = headRef.current?.children ?? [];
      const base =
        widths ??
        Object.fromEntries(
          ids.map((columnId, at) => [
            columnId,
            Math.round((cells[at] as HTMLElement | undefined)?.getBoundingClientRect().width ?? 100),
          ]),
        );
      const startWidth = base[id] ?? MIN_WIDTH;
      let latest = base;

      const onMove = (move: PointerEvent) => {
        latest = { ...base, [id]: Math.max(MIN_WIDTH, Math.round(startWidth + move.clientX - startX)) };
        setDragging(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        write(JSON.stringify(latest));
        setDragging(null);
      };

      /*
       * Listening on the window, not on the handle: the pointer leaves a
       * 8px strip immediately, and a drag that stops the moment it does is
       * not a drag. The cursor and the selection lock go on the body for
       * the same span, or the table's text highlights blue as you pull.
       */
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      setDragging(base);
    },
    [widths, ids],
  );

  /**
   * Back to the automatic layout, and forget. Bound to a double-click on a
   * handle, and the only "reset" that means anything: once a column is
   * pinned there is no natural width left for it to return to alone.
   */
  const reset = useCallback(() => {
    setDragging(null);
    write(null);
  }, []);

  return { widths, headRef, startResize, reset };
}
