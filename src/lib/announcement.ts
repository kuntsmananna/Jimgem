import type { Role } from "./roles";

/**
 * The releases being announced, each shown once to each person on their
 * next visit (see `WhatsNew` and `getSeenAnnouncements` and `unseenFor`).
 *
 * Client-safe: plain data, read by the server to decide what to show and
 * by the popup to draw it.
 *
 * **To announce the next release, put a new entry at the top of
 * `ANNOUNCEMENTS` with a new `id`.** Dismissals are recorded per id, so a
 * new one is unseen by everybody. Somebody who missed a release — away for
 * a week, or the release before was not for their role — gets every one
 * they have not seen in a single popup, a page each, newest first.
 */
export interface Announcement {
  id: string;
  /** Who it is for — a release about money is admin-only, since a staff login never sees money. */
  audience: Role[];
  /** Which picture heads it — see `WhatsNew`. */
  art: "paid-by" | "refresh" | "orders-table" | "jelly-mode";
  /** This release's page heading. The popup itself is always titled "What's new". */
  title: string;
  lede: string;
  items: {
    icon: "amount" | "card" | "filter" | "palette" | "lift" | "hover" | "jelly" | "day" | "columns" | "extras" | "select";
    title: string;
    text: string;
  }[];
}

export const ANNOUNCEMENTS: Announcement[] = [
  // v0.79: jelly mode, for everyone — a toy, so worded as one.
  {
    id: "v0.79-jelly-mode",
    audience: ["admin", "staff"],
    art: "jelly-mode",
    title: "Jelly mode",
    lede: "A little cube beside the sparkle switches on jelly mode: the app's cubes, chips and tiles wobble like the real thing.",
    items: [
      {
        icon: "hover",
        title: "On a laptop",
        text: "Move the mouse past them and they wobble, harder the faster you go.",
      },
      {
        icon: "jelly",
        title: "On a phone",
        text: "Shake it and everything bounces; tilt it and the jelly leans. Find it in More (or the bottom bar).",
      },
      {
        icon: "lift",
        title: "Never in the way",
        text: "It holds still while a popup is open or you’re typing, and it’s off again next visit.",
      },
    ],
  },
  /*
   * v0.78, the admin half: the money columns and the tick boxes, neither of
   * which a staff account has — so it is a page of its own rather than
   * items on the shared one that would describe things they cannot see.
   */
  {
    id: "v0.78-orders-money",
    audience: ["admin"],
    art: "paid-by",
    title: "Still due, and paid by in the badge",
    lede: "The money end of each order now says what still has to be collected, and how it was paid sits inside the payment badge.",
    items: [
      {
        icon: "amount",
        title: "Still due",
        text: "Replaces the Deposit column: what is left to collect, in amber, or “Paid” in green once it’s settled.",
      },
      {
        icon: "card",
        title: "Paid by, inside the badge",
        text: "The payment badge shows how it was paid as an icon. Click it to change the status or the method in one list.",
      },
      {
        icon: "select",
        title: "Select inside the row",
        text: "The tick box is the first thing in each row, and every box stays showing once you’ve ticked one.",
      },
    ],
  },
  /*
   * v0.78: the Orders list reorganised, for everyone. Worded without money,
   * like v0.74's, because a staff login gets the same table less its money
   * columns — so it says nothing about Still due or the payment badge.
   */
  {
    id: "v0.78-orders-table",
    audience: ["admin", "staff"],
    art: "orders-table",
    title: "The orders list, reorganised",
    lede: "Each order now reads left to right in the same order every time: when, the order, what to make — so one row is quicker to read and two are easier to compare.",
    items: [
      {
        icon: "day",
        title: "The day in the margin",
        text: "The date sits in its own column, once per day, with today in green. The list no longer stops for a heading.",
      },
      {
        icon: "extras",
        title: "Extras at a glance",
        text: "Display, waitresses, kosher and delivery are one column of marks — lit when the order has it, with a count when there’s more than one.",
      },
      {
        icon: "hover",
        title: "Every mark explains itself",
        text: "Point at any icon, figure or badge and a label says what it means, straight away.",
      },
    ],
  },
  /*
   * v0.74: the new look, for everyone. Worded without money on purpose — a
   * staff login sees this one too, and "hover the amount" would describe a
   * column they have not got.
   */
  {
    id: "v0.74-refresh",
    audience: ["admin", "staff"],
    art: "refresh",
    title: "A new look",
    lede: "A fresh coat of jelly: Jimgem has a new look — warmer, calmer and quicker to read, with more of what you need on one screen.",
    items: [
      {
        icon: "palette",
        title: "Warmer and easier on the eye",
        text: "A softer cream, a new typeface and slimmer figures, so the lists get the room.",
      },
      {
        icon: "lift",
        title: "Rows that lift",
        text: "The row under your pointer rises out of the list instead of turning black, and more of them fit on screen.",
      },
      {
        icon: "hover",
        title: "The detail is a hover away",
        text: "Point at a figure, a status or a row of flavour cubes to see what’s behind it.",
      },
      {
        icon: "jelly",
        title: "Jelly while you wait",
        text: "Pages load with a little heap of jelly, and an empty list now tells you why — with the button that fixes it.",
      },
    ],
  },
  // v0.71: the money one, so admins only.
  {
    id: "v0.71-paid-by",
    audience: ["admin"],
    art: "paid-by",
    title: "Paid by, and the whole amount",
    lede: "Every order's money now tells the whole story — and remembers how it was paid.",
    items: [
      {
        icon: "amount",
        title: "Amount is the whole order",
        text: "Jelly, delivery, display, waitressing and kosher, less any discount, VAT in. Hover it for the breakdown.",
      },
      {
        icon: "card",
        title: "Paid by",
        text: "Cash, credit card or bank transfer — set it in the table's new column or in the order form. Edit the list in Settings → Lists.",
      },
      {
        icon: "filter",
        title: "Filter by how they paid",
        text: "A new Paid by filter beside Payment, including the orders nobody has marked yet.",
      },
    ],
  },
];

/** The announcements `role` is meant to see, newest first. */
export function announcementsFor(role: Role): Announcement[] {
  return ANNOUNCEMENTS.filter((announcement) => announcement.audience.includes(role));
}

/**
 * What closing the popup records, given the ids it showed: everything for
 * this role from the newest shown onwards. That covers the pages on screen
 * *and* the older ones `MAX_ANNOUNCEMENT_PAGES` cut off — recording only
 * the shown ones would leave those unseen, and they would open the popup
 * again on the next visit as exactly the changelog the cap exists to
 * drop. Starting from the newest *shown* rather than the newest of all is
 * what keeps a release deployed while the popup sat open from being
 * marked read unseen.
 *
 * Null when an id is not one this role could have been shown — a staff
 * login dismissing an admin-only release, or an id that no longer exists.
 */
export function dismissalFor(role: Role, shown: string[]): string[] | null {
  const forRole = announcementsFor(role);
  const positions = shown.map((id) => forRole.findIndex((announcement) => announcement.id === id));
  if (positions.length === 0 || positions.some((position) => position < 0)) return null;
  return forRole.slice(Math.min(...positions)).map((announcement) => announcement.id);
}

/**
 * At most this many pages in one popup. A login created today has seen
 * none of them, and a tour of every release since the spring is a
 * changelog rather than news; the oldest fall off the end.
 */
export const MAX_ANNOUNCEMENT_PAGES = 3;

/**
 * What the arrival popup shows `role`, given the ids already dismissed:
 * the ones not seen yet, newest first and at most `MAX_ANNOUNCEMENT_PAGES`.
 */
export function unseenFor(role: Role, seen: Set<string>): Announcement[] {
  return announcementsFor(role)
    .filter((announcement) => !seen.has(announcement.id))
    .slice(0, MAX_ANNOUNCEMENT_PAGES);
}
