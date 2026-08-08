"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/expenses", label: "Expenses" },
  { href: "/biz-plan", label: "Biz Plan" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ name }: { name: string }) {
  const activeHref = usePathname();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/95 px-8 py-4 backdrop-blur">
      <div className="flex items-center gap-8">
        <span className="font-display text-xl font-extrabold tracking-tight text-ink">Gems</span>
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
        <span className="text-sm font-medium text-ink-soft">{name}</span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/5"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
