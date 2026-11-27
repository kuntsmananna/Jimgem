import { cookies } from "next/headers";
import { GemsLogo } from "@/components/GemsLogo";
import { INSTAGRAM_URL, PAY_LANG_COOKIE, payCopy, payLang, SITE_URL, type PayLang } from "./copy";

/**
 * The frame every customer-facing payment page sits in (v0.99, redrawn in
 * v0.99.4): the official mark, a language switch, one card, and a quiet
 * footer with the website and Instagram. Nothing of the dashboard around it.
 *
 * Laid out the way hosted checkouts are — Stripe's, Apple's sheet — one
 * column, the amount the largest thing on the page, the details as a short
 * list of label and value, one dark button, and a line of reassurance
 * under it. The card is narrow on a laptop too, since a payment link is
 * nearly always opened on a phone.
 */
export function PayShell({
  lang,
  token,
  back,
  langHref,
  children,
}: {
  lang: PayLang;
  token?: string;
  /** Which page the language switch comes back to. */
  back?: "page" | "done";
  /** Where the switch goes instead, for a page outside `/pay` (the shop). */
  langHref?: (code: PayLang) => string;
  children: React.ReactNode;
}) {
  const t = payCopy(lang);
  return (
    <div
      dir={t.dir}
      lang={lang}
      className="flex min-h-dvh flex-col items-center bg-cream px-4 pt-6 pb-8 text-ink"
    >
      <div dir="ltr" className="flex w-full max-w-sm items-center justify-between">
        <a href={SITE_URL} aria-label="Gems Cocktail Bites" className="block">
          <GemsLogo className="h-12 w-auto text-brand" />
        </a>
        {/* Two plain links, the current one filled — the same place and the
            same order in both languages, so it never moves under a thumb.
            Choosing sets a cookie and comes straight back. */}
        <div role="group" aria-label="Language" className="flex rounded-full bg-band p-[3px]">
          {(["he", "en"] as const).map((code) => (
            <a
              key={code}
              href={langHref ? langHref(code) : `/pay/${token}/lang?to=${code}&back=${back}`}
              aria-current={lang === code ? "true" : undefined}
              className={`flex h-8 min-w-11 items-center justify-center rounded-full px-3 text-sm font-bold ${
                lang === code ? "bg-card text-ink shadow-sm" : "text-ink-soft"
              }`}
            >
              {code === "he" ? "עב" : "EN"}
            </a>
          ))}
        </div>
      </div>

      <main className="motion-rise mt-6 w-full max-w-sm rounded-[24px] border border-line bg-card p-6 shadow-[0_18px_40px_-28px_rgb(60_30_10/0.45)]">
        {children}
      </main>

      <footer className="mt-auto flex items-center gap-4 pt-8 text-sm font-semibold text-ink-soft">
        <a href={SITE_URL} className="hover:text-ink">
          gem-bites.com
        </a>
        <span aria-hidden>·</span>
        <a href={INSTAGRAM_URL} className="hover:text-ink" dir="ltr">
          Instagram
        </a>
      </footer>
    </div>
  );
}

/** The customer's chosen language, from the cookie the switch writes. */
export async function readPayLang(): Promise<PayLang> {
  return payLang((await cookies()).get(PAY_LANG_COOKIE)?.value);
}

/** A shekel figure as the customer reads it — ₪1,234 or ₪1,234.50. */
export function shekels(n: number): string {
  return `₪${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** A label and its value, one row of the card's short list. */
export function PayRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-end text-[15px] font-semibold">{children}</dd>
    </div>
  );
}
