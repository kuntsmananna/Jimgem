/**
 * The customer payment pages' words, in Hebrew and English (v0.99.4).
 *
 * The customer picks with the switch at the top of the page; the choice
 * is a cookie (`PAY_LANG_COOKIE`, set by `/pay/<token>/lang`) so it holds
 * across the trip to SUMIT and back to the thank-you page, whose address
 * SUMIT fixes and we cannot add to. Hebrew unless they choose otherwise.
 */

import type { PaymentLinkKind } from "@/lib/paymentLinkTypes";

export type PayLang = "he" | "en";

export const PAY_LANG_COOKIE = "gems_pay_lang";

export const INSTAGRAM_URL = "https://www.instagram.com/gems_cocktail_bites";
export const INSTAGRAM_HANDLE = "@gems_cocktail_bites";
export const SITE_URL = "https://gem-bites.com";

export function payLang(value: string | undefined): PayLang {
  return value === "en" ? "en" : "he";
}

const KIND: Record<PayLang, Record<PaymentLinkKind, string>> = {
  he: { deposit: "מקדמה", balance: "יתרת תשלום", full: "תשלום מלא", custom: "תשלום" },
  en: { deposit: "Deposit", balance: "Balance", full: "Full payment", custom: "Payment" },
};

export function payCopy(lang: PayLang) {
  const he = lang === "he";
  return {
    dir: he ? ("rtl" as const) : ("ltr" as const),
    kind: (kind: PaymentLinkKind) => KIND[lang][kind],
    forOrder: he ? "להזמנה מ-Gems" : "for your Gems order",
    name: he ? "על שם" : "Name",
    eventDate: he ? "תאריך האירוע" : "Event date",
    amount: he ? "לתשלום" : "Amount due",
    pay: he ? "לתשלום מאובטח" : "Pay securely",
    secure: he ? "התשלום מתבצע בדף המאובטח של SUMIT" : "You'll pay on SUMIT's secure page",
    receipt: he ? "הקבלה תישלח אליך למייל" : "Your receipt will be emailed to you",
    cancelledTry: he ? "התשלום לא הושלם. אפשר לנסות שוב." : "The payment wasn't completed. You can try again.",
    unavailable: he
      ? "לא הצלחנו לפתוח את דף התשלום כרגע. נסו שוב בעוד רגע, או כתבו לנו."
      : "We couldn't open the payment page just now. Try again in a moment, or message us.",
    linkClosedTitle: he ? "הלינק הזה כבר לא פעיל" : "This link is no longer active",
    linkClosedText: he ? "אם צריך לשלם, נשלח לך לינק חדש." : "If there's still something to pay, we'll send you a new link.",
    paidTitle: he ? "התשלום התקבל" : "Payment received",
    thanks: he ? "תודה! נתראה באירוע" : "Thank you — see you at the event",
    receiptOnWay: he ? "הקבלה בדרך אליך למייל." : "Your receipt is on its way to your inbox.",
    followTitle: he ? "בואו לעקוב אחרינו" : "Follow us",
    followText: he ? "טעמים חדשים, אירועים ומבצעים — קודם באינסטגרם." : "New flavours, events and offers — on Instagram first.",
    site: he ? "לאתר שלנו" : "Visit our website",
    pendingTitle: he ? "מאשרים את התשלום" : "Confirming your payment",
    pendingText: he
      ? "עדיין לא קיבלנו אישור מ-SUMIT. אם חויבת, נראה את זה אצלנו בקרוב — אין צורך לשלם שוב."
      : "SUMIT hasn't confirmed it yet. If you were charged we'll see it shortly — there's no need to pay again.",
  };
}
