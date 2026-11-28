import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventByToken } from "@/lib/events";
import { getEventTally } from "@/lib/eventSales";
import { getContentPresets, getFlavors, getPackageTypes } from "@/lib/settings";
import { presetSummaries } from "@/lib/eventPresets";
import { payCopy } from "@/app/pay/copy";
import { PayShell, readPayLang } from "@/app/pay/PayShell";
import { ShopClient, type ShopProduct } from "@/components/events/ShopClient";

export const metadata: Metadata = { title: "Gems — הסל שלי / My basket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * An event stall's self-service shop (v0.102) — public, outside the session
 * gate, reached from the QR codes printed on the stall's signs: one per
 * box (`?add=<preset>` adds it) or one for the whole stall. The basket
 * lives on the customer's phone; checkout prices it on the server and
 * hands over to the ordinary payment page, whose thank-you is the proof
 * screen the customer shows the staff.
 */
export default async function ShopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await getEventByToken(token);
  if (!event) notFound();
  const lang = await readPayLang();
  const t = payCopy(lang);
  const langHref = (code: string) => `/shop/${token}/lang?to=${code}`;

  if (event.status !== "ready" || event.payMode === "staff") {
    return (
      <PayShell lang={lang} langHref={langHref}>
        <h1 className="font-display text-xl font-extrabold">{t.shopClosedTitle}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t.shopClosedText}</p>
      </PayShell>
    );
  }

  const [tally, presets, flavors, packageTypes] = await Promise.all([
    getEventTally(event.id),
    getContentPresets(true),
    getFlavors(true),
    getPackageTypes(true),
  ]);
  const summaries = new Map(presetSummaries(presets, flavors, packageTypes).map((p) => [p.id, p]));
  const products: ShopProduct[] = event.products.flatMap((p) => {
    const summary = summaries.get(p.presetId);
    if (!summary) return [];
    const left = event.countStock && p.brought !== null ? Math.max(0, p.brought - (tally.sold[p.presetId] ?? 0)) : null;
    return [{ presetId: p.presetId, name: summary.name, units: summary.units, price: p.price, color: summary.color, left }];
  });

  return (
    <PayShell lang={lang} langHref={langHref}>
      <ShopClient token={token} lang={lang} eventName={event.name} products={products} deals={event.deals} />
    </PayShell>
  );
}
