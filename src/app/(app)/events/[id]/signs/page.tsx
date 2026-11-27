import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdminPage } from "@/lib/guard";
import { getEvent } from "@/lib/events";
import { getContentPresets, getFlavors, getPackageTypes } from "@/lib/settings";
import { presetSummaries } from "@/lib/eventPresets";
import { dealLabel, type EventDeal } from "@/lib/eventTypes";
import { appUrlFor } from "@/lib/calendarSync";
import { GemsLogo } from "@/components/GemsLogo";
import { MigrationNeeded } from "@/components/Pane";
import { PrintButton } from "@/components/events/PrintButton";

export const dynamic = "force-dynamic";

const shekels = (n: number) => `₪${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** An SVG QR code as markup — generated here from our own address, so safe to inline. */
function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2A2520", light: "#FFFFFF" } });
}

function Qr({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="aspect-square w-full rounded-2xl border border-line bg-white p-3 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The deals that cover a box, in both languages. */
function dealsFor(deals: EventDeal[], presetId: number | null) {
  return deals
    .filter((d) => presetId === null || d.presetIds.length === 0 || d.presetIds.includes(presetId))
    .map((d) => ({ he: dealLabel(d, "he"), en: dealLabel(d, "en") }));
}

/**
 * The self-service signs for an event's table (v0.102), to print: a sign
 * per box with its own QR (scanning adds that box to the basket), or one
 * sign for the stall, as the event's setup chose. Both languages on every
 * sign. The QR points at the production address, never a preview's — a
 * printed sign outlives the deployment it was printed from.
 */
export default async function EventSignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  const [, event, presets, flavors, packageTypes, requestHeaders] = await Promise.all([
    requireAdminPage(),
    getEvent(id),
    getContentPresets(),
    getFlavors(true),
    getPackageTypes(true),
    headers(),
  ]);
  if (!event) notFound();

  const back = (
    <Link href={`/events/${id}`} className="text-sm font-semibold text-accent hover:underline">
      ← {event.name}
    </Link>
  );
  if (!event.publicToken) {
    return (
      <div className="mx-auto max-w-xl">
        {back}
        <div className="mt-4">
          <MigrationNeeded script="scripts/migrate-042-event-shop.sql" />
        </div>
      </div>
    );
  }

  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shop = `${appUrlFor(`${proto}://${host}`)}/shop/${event.publicToken}`;
  const summaries = new Map(presetSummaries(presets, flavors, packageTypes).map((p) => [p.id, p]));
  const products = event.products.flatMap((p) => {
    const summary = summaries.get(p.presetId);
    return summary ? [{ ...p, name: summary.name, units: summary.units }] : [];
  });

  const productSigns =
    event.qrMode === "product"
      ? await Promise.all(products.map(async (p) => ({ ...p, svg: await qrSvg(`${shop}?add=${p.presetId}`) })))
      : [];
  const stallSvg = event.qrMode === "stall" ? await qrSvg(shop) : null;

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          {back}
          <h1 className="font-display mt-1 text-2xl font-extrabold">Signs for the table</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {event.qrMode === "product"
              ? "One sign per box — scanning a box's QR adds it to the customer's basket. Four to an A4 page."
              : "One sign for the stall — customers scan it and pick their boxes on their phone."}
            {event.status !== "ready" && " The shop opens once the event is saved as ready to sell."}
          </p>
        </div>
        <PrintButton />
      </div>

      {event.payMode === "staff" && (
        <p className="mt-4 rounded-2xl bg-band px-4 py-3 text-sm print:hidden">
          This event is set to staff-only payment, so the shop won&rsquo;t take orders. Choose self-service or both in its
          setup first.
        </p>
      )}

      {stallSvg && (
        <section className="mt-6 flex flex-col items-center rounded-card border border-line bg-card p-10 text-center print:mt-0 print:h-[277mm] print:justify-center print:border-0">
          <GemsLogo className="h-16 w-auto text-brand" />
          <p className="font-display mt-6 text-4xl font-extrabold" dir="rtl">
            סרקו, בחרו ושלמו
          </p>
          <p className="font-display mt-1 text-2xl font-extrabold text-ink-soft">Scan, pick and pay</p>
          <div className="mt-6 w-72">
            <Qr svg={stallSvg} label="QR code for the stall's shop" />
          </div>
          <ul className="mt-6 flex flex-col gap-1 text-lg font-bold">
            {products.map((p) => (
              <li key={p.presetId}>
                {p.name} · <span dir="ltr">{shekels(p.price)}</span>
              </li>
            ))}
          </ul>
          {dealsFor(event.deals, null).map((d, i) => (
            <p key={i} className="mt-3 rounded-full bg-band px-4 py-1.5 text-base font-bold">
              <span dir="rtl">{d.he}</span> · {d.en}
            </p>
          ))}
          <p className="mt-6 text-sm text-ink-soft" dir="rtl">
            אחרי התשלום מראים לצוות את מסך האישור · Show the staff your confirmation after paying
          </p>
        </section>
      )}

      {productSigns.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:mt-0 print:grid-cols-2 print:gap-0">
          {productSigns.map((p) => {
            const deals = dealsFor(event.deals, p.presetId);
            return (
              <section
                key={p.presetId}
                className="flex break-inside-avoid flex-col items-center rounded-card border border-line bg-card p-6 text-center print:h-[138mm] print:rounded-none print:border-dashed"
              >
                <GemsLogo className="h-10 w-auto text-brand" />
                <p className="font-display mt-3 text-[28px] leading-tight font-extrabold" dir="auto">
                  {p.name}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  <span dir="rtl">קופסה של {p.units}</span> · Box of {p.units}
                </p>
                <p className="font-display mt-1 text-4xl font-extrabold" dir="ltr">
                  {shekels(p.price)}
                </p>
                <div className="mt-3 w-40 print:w-[52mm]">
                  <Qr svg={p.svg} label={`QR code that adds ${p.name} to the basket`} />
                </div>
                <p className="mt-3 text-base font-bold" dir="rtl">
                  סרקו להוספה לסל
                </p>
                <p className="text-sm font-semibold text-ink-soft">Scan to add to your basket</p>
                {deals[0] && (
                  <p className="mt-2 rounded-full bg-band px-3 py-1 text-sm font-bold">
                    <span dir="rtl">{deals[0].he}</span> · {deals[0].en}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {products.length === 0 && (
        <p className="mt-6 rounded-2xl bg-band px-4 py-3 text-sm">Add boxes to the event first — the signs are made from them.</p>
      )}
    </div>
  );
}
