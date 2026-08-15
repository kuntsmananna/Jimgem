"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/expenses", label: "Expenses" },
  { href: "/biz-plan", label: "Biz Plan" },
  { href: "/settings", label: "Settings" },
];

/**
 * Two words max, so "TMP QA" gives TQ and a one-word name gives one
 * letter rather than two from the same word.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function Nav({ name, version }: { name: string; version: string }) {
  const activeHref = usePathname();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/95 px-8 py-4 backdrop-blur">
      <div className="flex items-center gap-8">
        <Link
          href="/"
          aria-label="Gems — dashboard"
          className="font-display text-xl font-extrabold tracking-tight text-ink transition hover:opacity-70"
        >
          Gems
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? activeHref === "/" : activeHref.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-black text-cream" : "text-ink-soft hover:bg-black/5 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {/* On every page rather than just the Dashboard — it's how you tell
            which version you're looking at. */}
        <span
          title="App version"
          className="font-mono text-[11px] text-ink-soft/70 tabular-nums"
        >
          {version}
        </span>

        {/* Avatar and name are one chip: two separate elements read as two
            controls, and only one of them is a control at all. */}
        <span className="flex items-center gap-2 rounded-full bg-black/[0.06] py-1 pr-3 pl-1">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[11px] font-bold text-cream"
          >
            {initials(name)}
          </span>
          <span className="text-sm font-semibold text-ink">{name}</span>
        </span>

        <form action={logout}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-black hover:text-cream"
          >
            <LogOut size={15} />
          </button>
        </form>
      </div>
    </header>
  );
}
