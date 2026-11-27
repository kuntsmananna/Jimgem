import { GemsLogo } from "@/components/GemsLogo";

/**
 * The frame every customer-facing payment page sits in: the mark, a card,
 * and nothing of the dashboard around it. In Hebrew and right to left —
 * these pages are the customer's, while the dashboard's chrome is English.
 */
export function PayShell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="he" className="flex min-h-dvh flex-col items-center bg-cream px-4 py-10 text-ink">
      <GemsLogo className="h-14 w-auto text-brand" />
      <main className="mt-6 w-full max-w-sm rounded-card border border-line bg-card p-6 text-center shadow-sm">
        {children}
      </main>
      <a href="https://gem-bites.com" className="mt-6 text-xs font-semibold text-ink-soft underline-offset-4 hover:underline">
        gem-bites.com
      </a>
    </div>
  );
}

/** A shekel figure as the customer reads it — ₪1,234 or ₪1,234.50. */
export function shekels(n: number): string {
  return `₪${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
