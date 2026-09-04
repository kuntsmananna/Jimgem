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
 * **This is the string Tailwind itself emits for `max-md:`** (read out of
 * the built CSS), and it is copied rather than re-expressed on purpose.
 * `max-width: 767px` reads like the same thing and is not — the unit is
 * the difference, and it is not a rounding-error difference.
 *
 * A media query's `rem` resolves against the *browser's default font size*,
 * not against `:root`'s (setting `html { font-size: 32px }` changes
 * nothing — verified). Someone who raises that default to 32px for
 * readability therefore moves Tailwind's breakpoint to 1536px, and at an
 * 800px window every `max-md:` rule fires while `(max-width: 767px)` stays
 * false: the CSS lays the page out as a phone while this hook still says
 * desktop, so the mobile tree is never built and its section comes out
 * empty. Measured, not reasoned about.
 *
 * (The 1px band between 767 and 768 that this was also meant to close does
 * not appear to be reachable in Chromium, where the media-query viewport
 * rounds to an integer. Copying Tailwind's own string covers it anyway,
 * across engines that may not round alike.)
 *
 * Where a difference can be expressed in CSS it should be; this is reserved
 * for the places that need a different tree rather than a different look.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("not all and (min-width: 48rem)");
}
