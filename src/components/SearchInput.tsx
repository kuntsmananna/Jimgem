"use client";

import { Search, X } from "lucide-react";

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
  className = "w-56",
}: {
  value: string;
  onChange: (value: string) => void;
  /** What can be searched, named — "Search name, phone, email". */
  placeholder: string;
  /** The accessible name, when the placeholder is a list rather than a label. */
  label: string;
  className?: string;
}) {
  return (
    <div className={`fields-lit relative flex items-center ${className}`}>
      <Search
        size={13}
        aria-hidden
        className="pointer-events-none absolute left-2.5 text-current opacity-50"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="input w-full py-1.5 pr-7 pl-7.5 text-xs"
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
          className="absolute right-1.5 rounded-full p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
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
