/**
 * What a payment link is, for the browser and the server alike — the
 * client-safe half of `paymentLinks.ts`, split the way `orderTypes.ts` is
 * from `orders.ts`.
 */

import { orderTotal, stillDue, type Order } from "./orderTypes";

/**
 * What a link asks for. `custom` is an amount typed by hand; the other
 * three are worked out from the order (see `suggestedAmount`).
 */
export const PAYMENT_LINK_KINDS = ["full", "deposit", "balance", "custom"] as const;
export type PaymentLinkKind = (typeof PAYMENT_LINK_KINDS)[number];

export const PAYMENT_LINK_KIND_LABEL: Record<PaymentLinkKind, string> = {
  deposit: "Deposit",
  balance: "Balance",
  full: "Whole order",
  custom: "Other amount",
};

/** The same, as the customer reads it — on the payment page and in the message. */
export const PAYMENT_LINK_KIND_HEBREW: Record<PaymentLinkKind, string> = {
  deposit: "מקדמה",
  balance: "יתרת תשלום",
  full: "תשלום מלא",
  custom: "תשלום",
};

export type PaymentLinkStatus = "open" | "paid" | "cancelled";

export interface PaymentLink {
  id: number;
  token: string;
  orderId: number | null;
  kind: PaymentLinkKind;
  amount: number;
  status: PaymentLinkStatus;
  paidAmount: number | null;
  paidAt: string | null;
  sumitDocumentId: number | null;
  createdAt: string;
  createdBy: string;
}

/** The deposit asked for when nobody says otherwise — half, the owner's usual. */
export const DEFAULT_DEPOSIT_PERCENT = 50;

/**
 * The amount a kind of link would ask for on this order, in whole shekels
 * for a deposit (half of ₪1,234.50 is asked as ₪617, not ₪617.25).
 */
export function suggestedAmount(order: Order, kind: PaymentLinkKind, depositPercent = DEFAULT_DEPOSIT_PERCENT): number {
  switch (kind) {
    case "deposit":
      return Math.round((orderTotal(order) * depositPercent) / 100);
    case "balance":
      return round2(stillDue(order));
    case "full":
      return round2(orderTotal(order));
    case "custom":
      return 0;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The customer's link: our page, which sends them on to SUMIT's. */
export function paymentPageUrl(appUrl: string, token: string): string {
  return `${appUrl}/pay/${token}`;
}

/**
 * An Israeli mobile as WhatsApp wants it — digits only, country code
 * first: 054-123 4567 → 972541234567. Null when there is nothing to dial.
 */
export function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return digits.length >= 9 ? digits : null;
}

/** The message that goes with the link, in Hebrew — it is for the customer. */
export function paymentMessage(input: {
  customer: string;
  kind: PaymentLinkKind;
  amount: number;
  /** "D/M" as the app writes dates. */
  date: string;
  url: string;
}): string {
  const first = input.customer.trim().split(/\s+/)[0] ?? "";
  const amount = `₪${input.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return [
    `היי${first ? ` ${first}` : ""} 🙂`,
    `מצרפת לינק ל${PAYMENT_LINK_KIND_HEBREW[input.kind]} עבור ההזמנה שלך מ-Gems לתאריך ${input.date}: ${amount}`,
    input.url,
    "תודה! 🍸",
  ].join("\n");
}
