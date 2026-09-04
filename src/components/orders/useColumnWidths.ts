"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

/** Narrower than this and a column is a sliver with nothing readable in it. */
const MIN_WIDTH = 44;

/*
 * `localStorage` as an external store, so what is stored can be read with
 * `useSyncExternalStore` — the same reason `useMediaQuery` uses it. The
 * server has no storage and answers `null`, the client corrects on
 * hydration in one pass, and an effect writing state (which would paint
 * the default table and then snap) is never in the picture.
 *
 * `read` returns the raw string rather than a parsed value: React compares
 * snapshots by identity, and a fresh object every call would re-render
 * forever.
 *
 * A factory because several things keep one of these — the table's widths,
 * which columns are hidden, the phone's chosen card shape — and the
 * plumbing is the part that would otherwise have been copied.
 */
export function persisted(key: string) {
  let listeners: (() => void)[] = [];

  return {
    subscribe(onChange: () => void) {
      listeners.push(onChange);
      return () => {
        listeners = listeners.filter((listener) => listener !== onChange);
      };
    },
    read(): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        // A private window or blocked site data: nothing stored, which is
        // a valid state — the table obeys for this session and forgets.
        return null;
      }
    },
    write(value: string | null) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Nothing to remember; the live value still applies.
      }
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * One remembered string, read the way the widths are — through
 * `useSyncExternalStore`, so the server's `null` is corrected on hydration
 * in a single pass instead of painting a default and then snapping.
 */
export function usePersistedChoice<T extends string>(
  store: ReturnType<typeof persisted>,
  /** The offered options, first one being the default. Taking the default
   *  from the list rather than as a second argument makes "a fallback that
   *  is not one of the options" unrepresentable. */
  options: readonly { id: T }[],
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(store.subscribe, store.read, () => null);
  const known = options.some((option) => option.id === raw);
  return [known ? (raw as T) : options[0].id, (next: T) => store.write(next)];
}

/** Per-viewer, per-browser: both of these are preferences, not data. */
const widthStore = persisted("jimgem:orders-columns");
const hiddenStore = persisted("jimgem:orders-hidden-columns");

/**
 * Hand the table back to the browser's automatic layout, from anywhere.
 *
 * Exported so the columns menu can offer it without the widths themselves
 * being lifted out of `OrdersTable` and drilled back down: the store
 * notifies its subscribers, and the table re-renders from that.
 */
export function resetColumnWidths() {
  widthStore.write(null);
}

/** What a column with no stored width of its own is given. */
const DEFAULT_WIDTH = 100;

/**
 * The stored widths, with anything missing filled in.
 *
 * A column can legitimately have no stored width: it was hidden when the
 * table was last sized, or it was added to the code since. Left
 * `undefined` in a `<col>` under `table-fixed` it would take whatever
 * space is left over — which is nothing at all once the other fourteen
 * add up to more than the table — so it gets a plain default instead and
 * can be dragged from there. Nothing stored at all still means the
 * automatic layout, which is what `null` says.
 */
function parse(raw: string | null, ids: readonly string[]): Record<string, number> | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (!ids.some((id) => typeof stored[id] === "number")) return null;
    return Object.fromEntries(
      ids.map((id) => [id, typeof stored[id] === "number" ? (stored[id] as number) : DEFAULT_WIDTH]),
    );
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
  const raw = useSyncExternalStore(widthStore.subscribe, widthStore.read, () => null);
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
        /*
          Merged into whatever is stored rather than replacing it: the
          table only ever sizes the columns it is *showing*, and a straight
          replace would drop the widths of any that are hidden — so showing
          one again would leave `parse` unable to answer for it and drop
          the whole table back to the automatic layout.
        */
        const stored = (() => {
          try {
            return JSON.parse(widthStore.read() ?? "{}") as Record<string, number>;
          } catch {
            return {};
          }
        })();
        widthStore.write(JSON.stringify({ ...stored, ...latest }));
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
    resetColumnWidths();
  }, []);

  return { widths, headRef, startResize, reset };
}

/**
 * Which columns the table is not showing.
 *
 * Everything is visible by default, so nothing changes for anyone who
 * never opens the menu — the same rule the widths follow. The stored list
 * is sanitised against the ids it is asked about, so a column dropped from
 * the table later cannot linger in storage and quietly hide a new one that
 * happens to reuse its name.
 */
export function useHiddenColumns(ids: readonly string[]) {
  const raw = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.read, () => null);

  const hidden = useMemo(() => {
    if (!raw) return new Set<string>();
    try {
      const stored = JSON.parse(raw) as unknown;
      if (!Array.isArray(stored)) return new Set<string>();
      return new Set(ids.filter((id) => stored.includes(id)));
    } catch {
      return new Set<string>();
    }
  }, [raw, ids]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      hiddenStore.write(JSON.stringify([...next]));
    },
    [hidden],
  );

  const showAll = useCallback(() => hiddenStore.write(null), []);

  return { hidden, toggle, showAll };
}
