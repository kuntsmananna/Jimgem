"use client";

import Link from "next/link";
import { GemsLogo } from "@/components/GemsLogo";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { useVatView } from "@/components/VatViewContext";
import { VAT_VIEW_LABEL, type VatView } from "@/lib/vatView";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/clients", label: "Clients" },
  { href: "/expenses", label: "Expenses" },
  { href: "/biz-plan", label: "Biz Plan" },
  { href: "/settings", label: "Settings" },
];

/**
 * Two words max, so "TMP QA" gives TQ and a one-word name gives one
 * letter rather than two from the same word.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function Nav({ name, version }: { name: string; version: string }) {
  const activeHref = usePathname();
  return (
    /* Below the breakpoint this row keeps only the wordmark: the six
       pills, the VAT toggle, the version, the name and sign-out are ~1000px
       of content that cannot wrap, and they move to `MobileNav` — the bar
       along the bottom and the sheet behind More. */
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/95 px-8 py-4 backdrop-blur max-md:px-4">
      <div className="flex items-center gap-8">
        {/* The mark itself, and still the way back to the Dashboard.
            Sized by height, and 40px rather than the 32 that would match
            the pills beside it: the script's hairlines close up below
            about 40 and it stops reading as a word at all. */}
        <Link
          href="/"
          aria-label="Gems — dashboard"
          className="shrink-0 text-brand transition hover:opacity-70"
        >
          <GemsLogo className="h-10 w-auto" />
        </Link>
        <nav className="flex items-center gap-1 max-md:hidden">
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
      <div className="flex items-center gap-3 max-md:hidden">
        <VatViewToggle />
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

/**
 * Which convention every money figure on every page is shown in.
 *
 * In the nav rather than on each page: the figures it governs sit on four
 * different screens, and a per-page control would let the Dashboard and
 * the Biz Plan disagree about what a shekel means. Two options both worth
 * seeing, so a toggle rather than a dropdown — the same call the calendar's
 * Monthly/Weekly switch makes.
 */
export function VatViewToggle() {
  const { view, setView } = useVatView();
  return (
    /*
      Stated in `currentColor` and the `--segmented-*` pair rather than in
      ink and cream, so the same toggle sits on the nav's cream and on the
      black More sheet without either call site saying which. It is the
      idiom `.money-rail` already uses for the fields and pickers inside
      it: a surface re-tones what it contains by setting two properties.
    */
    <div className="segmented flex items-center rounded-full border border-current/20 p-0.5" role="group" aria-label="VAT view">
      {(["gross", "net"] as VatView[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setView(option)}
          aria-pressed={view === option}
          title={option === "gross" ? "Show what customers pay" : "Show figures with VAT taken out"}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            view === option
              ? "bg-[var(--segmented-fill)] text-[var(--segmented-ink)]"
              : "opacity-55 hover:opacity-100"
          }`}
        >
          {VAT_VIEW_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
