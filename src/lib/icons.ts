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

import { createElement, type ReactElement } from "react";
import {
  Bike,
  Box,
  Boxes,
  Briefcase,
  Building2,
  Cake,
  Camera,
  ChefHat,
  Cpu,
  Gift,
  GlassWater,
  Grid2x2,
  Grid3x3,
  Heart,
  Megaphone,
  Music,
  Package,
  PartyPopper,
  Receipt,
  Star,
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

/**
 * The icons an order type can be given in Settings, keyed by a stable
 * string stored in `order_types.icon`. A fixed set rather than free text:
 * the value has to survive in the database and resolve back to a real
 * component, and an unknown key falls back to a neutral tag.
 */
export const ORDER_TYPE_ICONS: Record<string, LucideIcon> = {
  user: User,
  users: Users,
  wedding: GlassWater,
  party: PartyPopper,
  cake: Cake,
  hitech: Cpu,
  production: Video,
  store: Store,
  deli: UtensilsCrossed,
  megaphone: Megaphone,
  briefcase: Briefcase,
  building: Building2,
  gift: Gift,
  music: Music,
  camera: Camera,
  heart: Heart,
  star: Star,
  tag: Tag,
};

export const ORDER_TYPE_ICON_KEYS = Object.keys(ORDER_TYPE_ICONS);

function orderTypeIcon(key: string | null | undefined): LucideIcon {
  return (key && ORDER_TYPE_ICONS[key]) || Tag;
}

export function orderTypeIconElement(key: string | null | undefined, size = 12): ReactElement {
  return createElement(orderTypeIcon(key), { size });
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

/** The same lookup as an element — see `packageTypeIconElement` for why. */
export function expenseCategoryIconElement(categoryName: string, size = 13): ReactElement {
  return createElement(expenseCategoryIcon(categoryName), { size });
}

/**
 * A package's mark, chosen by **how much it holds** rather than by its
 * name.
 *
 * It was keyed by name — "Small tray", "Big tray", "Units" — which stopped
 * resolving the moment the owner renamed the list to "9 units", "12
 * units" and so on, leaving every package on the fallback box. Size is the
 * thing the name was standing in for anyway, and it keeps working whatever
 * a package ends up being called.
 *
 * Four steps of density, not a literal count: thirty cubes in a 14px icon
 * is a smudge. The point is only that a bigger package looks busier than a
 * smaller one, and that none of them look like the single cube meaning one
 * unit.
 */
const PACKAGE_DENSITY: { upTo: number; Icon: LucideIcon }[] = [
  // One unit is one cube, the same mark UnitsIcon carries everywhere else.
  { upTo: 1, Icon: UnitsIcon },
  { upTo: 10, Icon: Grid2x2 },
  { upTo: 24, Icon: Grid3x3 },
  // Past a 3x3 the grid family has nowhere left to go — lucide stops
  // there — so the biggest package becomes a stack instead of a denser
  // grid, which is the one shape that still reads as "more than that".
  { upTo: Number.POSITIVE_INFINITY, Icon: Boxes },
];

export function packageTypeIcon(unitsPerPackage: number): LucideIcon {
  if (unitsPerPackage <= 0) return Package;
  return (PACKAGE_DENSITY.find((step) => unitsPerPackage <= step.upTo) ?? PACKAGE_DENSITY[0]).Icon;
}

/**
 * The same lookup as an element rather than a component type. Binding a
 * looked-up component to a capitalized local inside a render counts as
 * creating a component during render, so call sites take the element —
 * same approach as ExpensesClient's CategoryIcon.
 */
export function packageTypeIconElement(unitsPerPackage: number, size = 14): ReactElement {
  return createElement(packageTypeIcon(unitsPerPackage), { size });
}
