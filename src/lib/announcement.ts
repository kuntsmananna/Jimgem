import type { Role } from "./roles";

/**
 * The releases being announced, each shown once to each person on their
 * next visit (see `WhatsNew` and `getUnseenAnnouncements`).
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
  art: "paid-by" | "refresh";
  /** This release's page heading. The popup itself is always titled "What's new". */
  title: string;
  lede: string;
  items: { icon: "amount" | "card" | "filter" | "palette" | "lift" | "hover" | "jelly"; title: string; text: string }[];
}

export const ANNOUNCEMENTS: Announcement[] = [
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

/**
 * At most this many pages in one popup. A login created today has seen
 * none of them, and a tour of every release since the spring is a
 * changelog rather than news; the oldest fall off the end.
 */
export const MAX_ANNOUNCEMENT_PAGES = 3;
