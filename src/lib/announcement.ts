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
/**
 * The pictures and the item marks a page can name, each stated once.
 * `WhatsNew` maps both with a `Record` over these, so a key added here and
 * not drawn there is a type error rather than a page silently wearing the
 * wrong picture or no mark.
 */
export const ANNOUNCEMENT_ARTS = [
  "paid-by",
  "refresh",
  "orders-table",
  "jelly-mode",
  "prep-sheet",
  "food-cost",
  "due-soon",
] as const;
export type AnnouncementArt = (typeof ANNOUNCEMENT_ARTS)[number];

export const ITEM_ICON_KEYS = [
  "amount",
  "card",
  "filter",
  "palette",
  "lift",
  "hover",
  "jelly",
  "day",
  "columns",
  "extras",
  "select",
  "basket",
  "print",
  "recipe",
  "bell",
] as const;
export type ItemIcon = (typeof ITEM_ICON_KEYS)[number];

export interface Announcement {
  id: string;
  /**
   * The day it went out, as YYYY-MM-DD. A login created after this day was
   * never shown the old way, so it is not told what changed — see
   * `getSeenAnnouncements`.
   */
  released: string;
  /** Who it is for — a release about money is admin-only, since a staff login never sees money. */
  audience: Role[];
  /** Which picture heads it — see `WhatsNew`. */
  art: AnnouncementArt;
  /** This release's page heading. The popup itself is always titled "What's new". */
  title: string;
  lede: string;
  items: {
    icon: ItemIcon;
    title: string;
    text: string;
  }[];
}

export const ANNOUNCEMENTS: Announcement[] = [
  /*
   * v0.91-v0.93. The prep sheet is for everybody — it carries no money and
   * the kitchen is who uses it — so its shopping list is described here
   * too. What a jelly costs and who still owes are money, so they are an
   * admin's pages of their own. Newest first, like everything here.
   *
   * `released` is the day these reach main, not the day they were written:
   * a login created in between used the app without them and must still be
   * told. **Move it to the ship day if they ship later.**
   */
  {
    id: "v0.93-due-soon",
    released: "2026-10-31",
    audience: ["admin"],
    art: "due-soon",
    title: "Who still owes before the event",
    lede: "Events in the next 7 days that haven't been paid in full now say so, on the Orders page and the Dashboard.",
    items: [
      {
        icon: "bell",
        title: "One line, when it matters",
        text: "It shows only when something is owed, and opens into the orders it means — tap one to open it.",
      },
      {
        icon: "filter",
        title: "Not hidden by the filters",
        text: "It looks at every booked order, whatever the filters are set to — set aside while you search or use the calendar. Quotes and paid orders are never chased.",
      },
    ],
  },
  {
    id: "v0.92-food-cost",
    released: "2026-10-31",
    audience: ["admin"],
    art: "food-cost",
    title: "What a jelly costs to make",
    lede: "Add your ingredients and a recipe per flavour, and every order shows what its jelly costs and what is left after it.",
    items: [
      {
        icon: "amount",
        title: "Ingredients, by the pack",
        text: "Type them as the receipt says — a 700 ml bottle for ₪70. Settings → Flavors.",
      },
      {
        icon: "recipe",
        title: "A recipe per flavour",
        text: "What one batch makes and takes. The cost of one jelly is worked out as you type.",
      },
      {
        icon: "card",
        title: "In every order",
        text: "The money panel ends with Ingredients and what is left after them, before VAT. Units with no recipe are counted, never guessed.",
      },
    ],
  },
  {
    id: "v0.91-prep-sheet",
    released: "2026-10-31",
    audience: ["admin", "staff"],
    art: "prep-sheet",
    title: "The prep sheet",
    lede: "One page that adds up what the coming days' orders need: how much of each flavour, which trays, what the events need, and what to buy.",
    items: [
      {
        icon: "jelly",
        title: "How much of each flavour",
        text: "Units per flavour for today, 3, 7 or 14 days, largest first — and how many still have no flavour decided.",
      },
      {
        icon: "day",
        title: "Day by day",
        text: "Under the totals, the same orders by day: every package, its split, the extras and the note.",
      },
      {
        icon: "basket",
        title: "A shopping list",
        text: "Once ingredients and recipes are set up in Settings → Flavors: what these orders take against what's on the shelf, and how many packs to buy. Tap a count to update it.",
      },
      {
        icon: "print",
        title: "Find it, print it",
        text: "Prep sheet on the Orders page (Prep on a phone). It prints as a clean sheet for the kitchen.",
      },
    ],
  },
  // v0.79: jelly mode, for everyone — a toy, so worded as one. Re-announced
  // in v0.79.7 under a new id (it was "v0.79-jelly-mode") so the picture
  // with the phone reaches everyone who had already closed the first one;
  // renamed rather than duplicated, so a replay lists it once.
  {
    id: "v0.79.7-jelly-mode",
    released: "2026-10-19",
    audience: ["admin", "staff"],
    art: "jelly-mode",
    title: "Jelly mode",
    lede: "The little jelly blob beside the sparkle switches on jelly mode: the app's cubes, chips, buttons and icons wobble like the real thing — on a laptop and on your phone.",
    items: [
      {
        icon: "hover",
        title: "On a laptop",
        text: "Move the mouse past them and they wobble, harder and wider the faster you go — sweep it hard and the whole page shakes.",
      },
      {
        icon: "jelly",
        title: "On a phone",
        text: "Shake it, swing it or turn it and the chips, buttons and icons wobble and slowly settle. Find it in More (or the bottom bar).",
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
    released: "2026-10-19",
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
    released: "2026-10-19",
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
    released: "2026-10-18",
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
    released: "2026-10-18",
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
