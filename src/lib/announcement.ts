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
  /** Who it is for. These features are money, which a staff login never sees. */
  audience: Role[];
  title: string;
  lede: string;
  items: { icon: "amount" | "card" | "filter"; title: string; text: string }[];
}

export const ANNOUNCEMENT: Announcement = {
  id: "v0.71-paid-by",
  audience: ["admin"],
  title: "What's new",
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
};
