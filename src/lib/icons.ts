/**
 * Icon lookups for the free-text values the business actually uses.
 *
 * Both customer type and expense category are owner-editable — customer
 * type is typed by hand into the Sheet, expense categories are managed in
 * Settings — so neither can be a closed enum. Each map covers the values
 * in use today and falls back to a neutral icon for anything new, rather
 * than breaking or leaving a gap.
 *
 * Client-safe: pure data and lucide components, no server-only imports
 * (see CLAUDE.md's note on orderTypes.ts for why that matters).
 */

import {
  Bike,
  Box,
  Boxes,
  ChefHat,
  Cpu,
  GlassWater,
  Megaphone,
  PartyPopper,
  Receipt,
  Store,
  Tag,
  User,
  Users,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * A single jelly cube — what a "unit" actually is, as opposed to the
 * stacked-boxes mark that means packaging. Exported as one alias so the
 * KPI tile, the order form and anything else counting units can't drift
 * onto different icons.
 */
export const UnitsIcon: LucideIcon = Box;

interface EventType {
  label: string;
  Icon: LucideIcon;
}

/**
 * Customer/event types as they appear in the Sheet's "סוג לקוח" column,
 * with English labels for the UI. Sheet-sourced customer and location
 * text stays in its original language (see CLAUDE.md), but this column is
 * a small closed-ish vocabulary acting as a category, so it is labelled
 * like the rest of the UI chrome.
 */
const EVENT_TYPES: Record<string, EventType> = {
  "לקוח פרטי": { label: "Private", Icon: User },
  "חברת הפקה": { label: "Production co.", Icon: Video },
  "חברת הייטק": { label: "Hi-tech", Icon: Cpu },
  חתונה: { label: "Wedding", Icon: GlassWater },
  'אירוע יח"צ': { label: "PR event", Icon: PartyPopper },
  "אירוע יח״צ": { label: "PR event", Icon: PartyPopper },
  מעדניה: { label: "Deli", Icon: Store },
  "מסיבת רווקות": { label: "Bachelorette", Icon: PartyPopper },
};

/**
 * Falls back to the raw value as its own label — an unrecognised type is
 * still worth showing, just without a translation or a specific icon.
 */
export function eventType(rawValue: string): EventType | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  return EVENT_TYPES[trimmed] ?? { label: trimmed, Icon: Tag };
}

const EXPENSE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  Waitressing: Users,
  Delivery: Bike,
  "Instagram & Branding": Megaphone,
  "Alcohol & Raw Materials": UtensilsCrossed,
  "Kitchen Equipment": ChefHat,
  "Packaging & Serving": Boxes,
};

export function expenseCategoryIcon(categoryName: string): LucideIcon {
  return EXPENSE_CATEGORY_ICONS[categoryName.trim()] ?? Receipt;
}
