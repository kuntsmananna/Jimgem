"use client";

import { Search, X } from "lucide-react";
import { TextInput } from "@/components/Field";
import { HeaderSlot } from "@/components/HeaderSlot";

/**
 * Two sizes, one field. `sm` is the toolbar box every page has always
 * carried; `md` is the phone header's, which is a taller target and set at
 * 16px — under that, iOS Safari magnifies the page on focus and leaves it
 * magnified, and `.input`'s own 16px rule loses to the `text-xs` utility
 * here (components lose to utilities, whatever the order in the file).
 *
 * A `size` rather than a second component or a className the call site
 * hand-tunes: that drift is what produced five copies of the segmented
 * pill before `ChipSpread` and `Segmented` took a `size` of their own.
 */
const SIZES = {
  sm: { field: "py-1.5 pr-7 pl-7.5 text-xs", icon: 13, left: "left-2.5", clear: "right-1.5", x: 12 },
  md: { field: "py-2.5 pr-9 pl-9 text-base", icon: 15, left: "left-3", clear: "right-2.5", x: 15 },
} as const;

/**
 * The one search field, shared by Orders, Expenses and Clients.
 *
 * A search box is a *control*, not a value on a sheet, so it carries
 * `fields-lit` and keeps its fill whether or not anything is typed — the
 * app's default (a filled field drops to bare text) would leave a live
 * search reading as a stray word in the toolbar.
 *
 * The clear button only exists while there is something to clear: a
 * permanent × on an empty box invites a click that does nothing, and the
 * icon on the left already says what the field is.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  size = "sm",
  className = "w-56",
}: {
  value: string;
  onChange: (value: string) => void;
  /** What can be searched, named — "Search name, phone, email". */
  placeholder: string;
  /** The accessible name, when the placeholder is a list rather than a label. */
  label: string;
  /** `md` for the phone header — a thumb's target, and 16px. See SIZES. */
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const scale = SIZES[size];
  return (
    <div className={`fields-lit relative flex items-center ${className}`}>
      <Search
        size={scale.icon}
        aria-hidden
        className={`pointer-events-none absolute ${scale.left} text-current opacity-50`}
      />
      {/* `TextInput` rather than a bare `.input`, which is the rule the
          primitive exists for: it carries the placeholder that
          `:placeholder-shown` needs to classify the field. */}
      <TextInput
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        // A stroke, unlike every other field in the app: those sit in a
        // sheet where an outline would be one edge too many, while this one
        // sits alone in a toolbar with nothing around it to say where it
        // starts. `border-ink/15` rather than `border-line` so it is also
        // visible on the Clients band, which is close to `line` in tone.
        className={`w-full border-ink/15 focus:border-accent ${scale.field}`}
        // Escape clears rather than closing anything: this sits inside
        // pages whose overlays also listen for it, and a search box that
        // swallowed the key would strand a half-typed query.
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          title="Clear search"
          className={`absolute ${scale.clear} rounded-full p-0.5 opacity-60 transition hover:opacity-100`}
        >
          <X size={scale.x} />
        </button>
      )}
    </div>
  );
}

/**
 * A page's search box, in both of the places it belongs.
 *
 * On a laptop it is where it has always been — in the page's own toolbar,
 * beside the controls it narrows. On a phone it is in the header, right of
 * the wordmark: the header is otherwise two thirds empty below the
 * breakpoint, and a search box was costing the page a whole row above the
 * list it searches. It is also `sticky` up there, so the field stays put
 * as the list scrolls under it.
 *
 * Both are rendered and each is hidden at the other's width, rather than
 * one moving on `useIsMobile`: the header copy is inside a `md:hidden`
 * slot and this one carries `max-md:hidden`, so nothing depends on
 * hydration having happened and neither can flash. They share the caller's
 * state, so they are one field in every sense but the DOM.
 */
export function PageSearch({
  value,
  onChange,
  placeholder,
  label,
  className = "w-56",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  /** The toolbar copy's width. The header copy always fills its slot. */
  className?: string;
}) {
  const props = { value, onChange, placeholder, label };
  return (
    <>
      <SearchInput {...props} className={`${className} max-md:hidden`} />
      <HeaderSlot>
        <SearchInput {...props} size="md" className="w-full" />
      </HeaderSlot>
    </>
  );
}

/**
 * Does this row match what was typed?
 *
 * Every field is joined and lower-cased once, and the needle is split on
 * whitespace so "anna 054" finds the same row as "054 anna" — a name and
 * a phone are two facts about one client, not a phrase.
 *
 * Nulls are dropped rather than stringified: "null" is a word, and it
 * would match a search for "nul".
 */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const needles = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return needles.every((needle) => haystack.includes(needle));
}
