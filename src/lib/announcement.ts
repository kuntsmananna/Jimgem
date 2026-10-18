import type { Role } from "./roles";

/**
 * The release currently being announced, shown once to each person on
 * their next visit (see `WhatsNew` and `getUnseenAnnouncement`).
 *
 * Client-safe: plain data, read by the server to decide whether to show it
 * and by the popup to draw it.
 *
 * **To announce the next release, change `id`.** Everyone who dismissed
 * the old one has a row for the old id only, so a new id is unseen by all
 * of them again. Reusing an id would show nothing to anyone who has
 * already closed it.
 */
export interface Announcement {
  id: string;
  /** Who it is for — a release about money is admin-only, since a staff login never sees money. */
  audience: Role[];
  /** Which picture heads it — see `WhatsNew`. */
  art: "paid-by" | "refresh";
  title: string;
  lede: string;
  items: { icon: "amount" | "card" | "filter" | "palette" | "lift" | "hover" | "jelly"; title: string; text: string }[];
}

/*
 * v0.74: the new look, for everyone. Worded without money on purpose — a
 * staff login sees this one too, and "hover the amount" would describe a
 * column they have not got.
 */
export const ANNOUNCEMENT: Announcement = {
  id: "v0.74-refresh",
  audience: ["admin", "staff"],
  art: "refresh",
  // Short, because a popup's title shares its header with the close
  // button and is cut off past ~14 characters on a phone.
  title: "What's new",
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
};
