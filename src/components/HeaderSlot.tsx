"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The empty right-hand side of the phone's header, offered to the page
 * inside it.
 *
 * Below the breakpoint the header carries a wordmark and nothing else —
 * the six pills, the VAT toggle, the version, the name and sign-out all
 * moved to the bottom bar — which left two thirds of a sticky row empty
 * while the page underneath spent a whole row of its own on a search box.
 * This hands that space back to whichever page has something to put in it.
 *
 * The mount point itself is `md:hidden` (see `Nav`), so anything portalled
 * here is mobile-only without a caller saying so, and without
 * `useIsMobile` — which would paint the desktop answer for one frame.
 *
 * Two contexts because the node is written by `Nav` and read by the page:
 * one carries the setter down to the header, the other carries the element
 * back down to everything else. Held as state rather than a ref for the
 * reason `useModalHeaderSlot` is: a ref is still null on the first pass
 * and the portal would never mount.
 */
const SlotNode = createContext<HTMLElement | null>(null);
const SetSlotNode = createContext<(node: HTMLElement | null) => void>(() => {});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <SetSlotNode.Provider value={setNode}>
      <SlotNode.Provider value={node}>{children}</SlotNode.Provider>
    </SetSlotNode.Provider>
  );
}

/**
 * Where the slot actually is. Rendered once, by `Nav`.
 *
 * `setNode` is a `useState` setter, which is stable across renders and is
 * only ever handed an element or null — never a function, which it would
 * otherwise read as an updater.
 */
export function HeaderSlotTarget({ className }: { className?: string }) {
  const setNode = useContext(SetSlotNode);
  return <div ref={setNode} className={className} />;
}

/**
 * Put something in the header. Renders nothing where there is no header —
 * `/login` has none, and neither does a component rendered outside the app
 * layout in a test.
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const node = useContext(SlotNode);
  return node ? createPortal(children, node) : null;
}
