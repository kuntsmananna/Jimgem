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

/**
 * Sets the language cookie on a redirect. Site-wide since v0.102, so the
 * shop and the payment pages share it; the older `/pay`-only cookie is
 * cleared beside it, or it would shadow the new one there.
 */
export function setPayLangCookie(response: Response, lang: PayLang) {
  const year = 60 * 60 * 24 * 365;
  response.headers.append("Set-Cookie", `${PAY_LANG_COOKIE}=${lang}; Path=/; Max-Age=${year}; SameSite=Lax; HttpOnly`);
  response.headers.append("Set-Cookie", `${PAY_LANG_COOKIE}=; Path=/pay; Max-Age=0; SameSite=Lax; HttpOnly`);
}

export function payLang(value: string | undefined): PayLang {
  return value === "en" ? "en" : "he";
}

const KIND: Record<PayLang, Record<PaymentLinkKind, string>> = {
  he: { deposit: "מקדמה", balance: "יתרת תשלום", full: "תשלום מלא", custom: "תשלום", sale: "רכישה באירוע" },
  en: { deposit: "Deposit", balance: "Balance", full: "Full payment", custom: "Payment", sale: "Event purchase" },
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
    // The self-service shop and the proof screen (v0.102).
    basket: he ? "הסל שלי" : "My basket",
    shopIntro: he ? "בחרו קופסאות, שלמו בטלפון והראו את מסך האישור לצוות." : "Pick your boxes, pay on your phone, and show the confirmation to the staff.",
    addedTitle: (name: string) => (he ? `${name} נוסף לסל` : `${name} added to your basket`),
    addedSub: he ? "סרקו עוד מוצר, או שלמו כשסיימתם" : "Scan another product, or pay when you're done",
    emptyBasket: he ? "הסל ריק עדיין — הוסיפו קופסה" : "Your basket is empty — add a box",
    add: he ? "הוספה" : "Add",
    less: he ? "אחד פחות" : "One less",
    more: he ? "אחד יותר" : "One more",
    soldOut: he ? "אזל" : "Sold out",
    left: (n: number) => (he ? `נשארו ${n}` : `${n} left`),
    deals: he ? "מבצעים" : "Deals",
    dealApplied: he ? "מבצע" : "Deal",
    total: he ? "סה״כ" : "Total",
    payTotal: he ? "לתשלום" : "Pay",
    afterPay: he
      ? "אחרי התשלום יופיע מסך אישור — מראים אותו לצוות ולוקחים את הקופסאות"
      : "After paying you'll get a confirmation — show it to the staff and take your boxes",
    shopClosedTitle: he ? "הדוכן לא מקבל הזמנות כאן כרגע" : "This stall isn't taking orders here right now",
    shopClosedText: he ? "אפשר לשלם אצל הצוות בדוכן." : "You can pay with the staff at the stall.",
    paidProof: he ? "שולם" : "Paid",
    codeNote: he ? "הקוד והצבע של העסקה · השעה רצה בזמן אמת" : "This sale's code and colour · the clock is live",
    took: (sale: number) => (he ? `מה לקחתי · עסקה ${sale}` : `What I took · sale ${sale}`),
    handed: he ? "לצוות: לחצו אחרי המסירה" : "Staff: tap once handed over",
    handedNote: he
      ? "אחרי הלחיצה המסך מסומן ״נמסר״ ואי אפשר להשתמש בו שוב"
      : "After the tap this screen reads “handed over” and can't be used again",
    handedDone: (time: string) => (he ? `נמסר ב-${time}` : `Handed over at ${time}`),
    thanksBuy: he ? "תודה שקניתם ב-Gems!" : "Thanks for buying Gems!",
    yourTray: he ? "המגש שלכם — נענעו אותו עם האצבע" : "Your tray — wobble it with a finger",
    shake: he ? "לנער את הטלפון 🍸" : "Shake the phone 🍸",
    pendingText: he
      ? "עדיין לא קיבלנו אישור מ-SUMIT. אם חויבת, נראה את זה אצלנו בקרוב — אין צורך לשלם שוב."
      : "SUMIT hasn't confirmed it yet. If you were charged we'll see it shortly — there's no need to pay again.",
  };
}
