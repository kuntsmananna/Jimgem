/**
 * Best-effort extraction of structured fields (guests, delivery cost,
 * mirrors) from the Orders tab's free-form Hebrew פירוט (details) text.
 *
 * This is explicitly best-effort, not a reliable parse: phrasing varies
 * a lot row to row (see the real samples this was built against — dates
 * 7/5 through 8/8 of the Orders tab). Scalar fields (guests/delivery/
 * mirrors) have consistent-enough patterns to extract with reasonable
 * confidence; the full order *content* (package/flavor/quantity
 * breakdown) does not — free text like "150 מיקס ג'ין, וודקה, מרגריטה
 * ליצ'י" or "150 ליצ'י נקודות כחולות ונקודות כתומות" describes flavor
 * mixes in ways too varied to reliably split into typed line items, so
 * content is intentionally kept as one "legacy" text line rather than
 * guessed at — a wrong guess (understating/misattributing what's in an
 * order) is worse than clearly-labeled unstructured text.
 */

export interface ParsedDetails {
  guests: number | null;
  deliveryCost: number | null;
  mirrors: number | null;
  /** The original text, unmodified — always shown alongside any parsed fields. */
  legacyContent: string;
  /** True when parsing found little/nothing reliable — surface this in the UI, don't hide it. */
  needsReview: boolean;
}

const NO_DATA_MARKERS = ["טרם", "פרטים בהמשך"];

function extractGuests(text: string): number | null {
  const match = text.match(/(\d+)\s*אורח(?:ים|ות)/);
  return match ? Number(match[1]) : null;
}

function extractDeliveryCost(text: string): number | null {
  // "משלוח: 150", "משלוח - 120", "משלוח 200" — an amount right after the word.
  const withAmount = text.match(/משלוח[\s:\-]*(\d+)/);
  if (withAmount) return Number(withAmount[1]);
  return null; // "משלוח" mentioned with no amount — cost genuinely unknown, not 0
}

function extractMirrors(text: string): number | null {
  if (/ללא\s*מראה/.test(text)) return 0;
  const withCount = text.match(/(\d+)\s*מראות/);
  if (withCount) return Number(withCount[1]);
  if (/מראה/.test(text)) return 1; // bare "מראה" (singular, no count) = one mirror
  return null; // not mentioned at all
}

function hasAnyUnitCount(text: string): boolean {
  // A bare number anywhere (unit count, tray size, etc.) — the loosest
  // possible signal that this row has *some* quantifiable content.
  return /\d/.test(text);
}

export function parseOrderDetails(details: string): ParsedDetails {
  const text = details.trim();

  if (!text || NO_DATA_MARKERS.some((marker) => text === marker || text.startsWith(marker))) {
    return {
      guests: null,
      deliveryCost: null,
      mirrors: null,
      legacyContent: text,
      needsReview: true,
    };
  }

  const guests = extractGuests(text);
  const deliveryCost = extractDeliveryCost(text);
  const mirrors = extractMirrors(text);

  // Discount mentions ("קיבלו 30% הנחה", "(הנחה 15%)") carry real business
  // info — a different price than the line items imply — that none of our
  // structured fields capture. Flag rather than silently drop it.
  const hasUnexplainedDiscount = /הנחה/.test(text);

  const extractedAnything = guests !== null || deliveryCost !== null || mirrors !== null;
  const needsReview = hasUnexplainedDiscount || (!extractedAnything && !hasAnyUnitCount(text));

  return {
    guests,
    deliveryCost,
    mirrors,
    legacyContent: text,
    needsReview,
  };
}
