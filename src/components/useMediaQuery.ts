"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * `useSyncExternalStore` rather than an effect writing state: the server
 * has no viewport and no pointer, so it answers `false` for everything and
 * the client corrects on hydration in the same pass — an effect would
 * paint once with the wrong answer and then again with the right one.
 *
 * `false` is the safe server answer for both of the questions the app
 * asks. A device that turns out to have no hover gets the quiet desktop
 * treatment for one frame; a device that turns out to be a phone gets the
 * desktop tree for one frame, hidden by CSS in the meantime. The reverse
 * default would show phone chrome to every laptop before correcting.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * True where the pointer cannot hover — a finger rather than a mouse.
 *
 * The question the app actually wants when it is deciding whether a
 * hover-revealed affordance is reachable. Deliberately not "is this a
 * small screen": a tablet with a trackpad hovers, and a touch laptop is
 * better served by the pointer it is being driven with.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(hover: none)");
}

/**
 * True below the layout breakpoint — the phone layouts.
 *
 * 768px, matching Tailwind's `md`, so a `max-md:` class and this hook
 * always agree about which side of the line the page is on. Where a
 * difference can be expressed in CSS it should be, and this reserved for
 * the places that need a different tree rather than a different look.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
