"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, HandPlatter, Printer, Sparkles, Truck } from "lucide-react";
import {
  formatOrderDate,
  orderUnits,
  orderWeekdayLong,
  packageLineLabel,
  stageMap,
  todayIso,
  unitsPerPackageMap,
  type DisplayOption,
  type Order,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { PREP_WINDOWS, prepDays, prepOrders, prepWindowEnd, summarizePrep, type PrepWindowId } from "@/lib/prep";
import { packageTypeIcon, UnitsIcon } from "@/lib/icons";
import { cubeColors } from "@/components/JellyLoader";
import { useStages } from "@/components/ProductionStagesContext";
import { Segmented } from "@/components/orders/OrderSheet";
import { FigureTile } from "@/components/FigureTile";
import { EmptyState } from "@/components/EmptyState";
import { EventTypeChip } from "@/components/orders/EventTypeChip";
import { extraSlots } from "@/components/orders/OrdersTable";
import { shoppingList, type FlavorRecipe, type Ingredient } from "@/lib/foodCost";
import { ShoppingList } from "./ShoppingList";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const PANE = "rounded-card bg-card/60 p-5 shadow-[inset_0_0_0_1px_var(--color-line)] max-md:p-4 print:shadow-none";

/**
 * The kitchen's prep sheet: what the coming days' orders add up to, then
 * the same orders day by day.
 *
 * Totals first, because "how much of each flavour" is the question this
 * page exists to answer and it is the one a list of orders answers worst;
 * the days follow for "and which of it goes out when". No money anywhere —
 * the page is the kitchen's, and the server sends it redacted orders.
 */
export function PrepClient({
  orders,
  flavors,
  packageTypes,
  displayOptions,
  ingredients,
  recipes,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  displayOptions: DisplayOption[];
  /** Sent without prices — see the page. Empty until migration 034 and a first ingredient. */
  ingredients: Ingredient[];
  recipes: FlavorRecipe[];
}) {
  const stages = useStages();
  const [windowId, setWindowId] = useState<PrepWindowId>("7d");
  const [includeQuotes, setIncludeQuotes] = useState(false);

  const unitsPerPackage = useMemo(() => unitsPerPackageMap(packageTypes), [packageTypes]);
  const flavorById = useMemo(() => new Map(flavors.map((f) => [String(f.id), f])), [flavors]);
  const packageById = useMemo(() => new Map(packageTypes.map((p) => [String(p.id), p])), [packageTypes]);
  const displayById = useMemo(() => new Map(displayOptions.map((d) => [d.id, d])), [displayOptions]);

  // The browser's today, not the server's: a Vercel function runs in UTC,
  // which is yesterday in Israel for two hours every night.
  const from = todayIso();
  const days = PREP_WINDOWS.find((w) => w.id === windowId)!.days;
  const to = prepWindowEnd(new Date(), days);

  const inWindow = useMemo(
    () => prepOrders(orders, stageMap(stages), { from, to, includeQuotes }),
    [orders, stages, from, to, includeQuotes],
  );
  const summary = useMemo(() => summarizePrep(inWindow, unitsPerPackage), [inWindow, unitsPerPackage]);
  const byDay = useMemo(() => prepDays(inWindow), [inWindow]);
  const largestFlavor = summary.flavors[0]?.units ?? 0;
  const shopping = useMemo(
    () => shoppingList(summary.flavors, summary.unassigned, recipes, ingredients, flavors),
    [summary, recipes, ingredients, flavors],
  );

  const range = days === 1 ? formatOrderDate(from) : `${formatOrderDate(from)} – ${formatOrderDate(to)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* The phone's header already names the page (PHONE_TITLES). */}
          <h1 className="font-display text-2xl font-extrabold max-md:hidden">Prep sheet</h1>
          <p className="text-sm font-semibold text-ink-soft">
            {range} · {summary.orderCount} order{summary.orderCount === 1 ? "" : "s"} to make
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Segmented
            label="How far ahead"
            value={windowId}
            onChange={setWindowId}
            options={PREP_WINDOWS.map((w) => ({ value: w.id, text: w.label }))}
            size="md"
          />
          <Segmented
            label="Quotes"
            value={includeQuotes}
            onChange={setIncludeQuotes}
            options={[
              { value: false, text: "Booked" },
              { value: true, text: "+ quotes" },
            ]}
            size="md"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="press flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream max-md:hidden"
          >
            <Printer size={15} aria-hidden />
            Print
          </button>
        </div>
      </div>

      {summary.orderCount === 0 ? (
        <EmptyState
          title={`Nothing to make ${days === 1 ? "today" : `in the next ${days} days`}`}
          hint={includeQuotes ? undefined : "Quotes are left out until they are booked."}
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
            <FigureTile label="Units" value={nf.format(summary.units)} />
            <FigureTile label="Orders" value={nf.format(summary.orderCount)} />
            <FigureTile
              label="No flavour yet"
              value={nf.format(summary.unassigned)}
              note={summary.unassigned ? "units to decide" : "every unit decided"}
            />
            <FigureTile label="Event days" value={nf.format(byDay.length)} />
          </div>

          <div className="grid grid-cols-[3fr_2fr] gap-5 max-md:grid-cols-1 print:grid-cols-[3fr_2fr]">
            <section className={PANE}>
              <h2 className="font-display text-base font-bold">Flavours</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {summary.flavors.map(({ flavorId, units }) => {
                  const flavor = flavorById.get(flavorId);
                  return (
                    <li key={flavorId} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 font-semibold">
                          {flavor && <span aria-hidden className="jelly-cube h-3.5 w-3.5 shrink-0" style={cubeColors(flavor)} />}
                          <span className="truncate">{flavor?.name ?? "Unknown flavour"}</span>
                        </span>
                        <span className="shrink-0 font-display text-lg font-extrabold tabular-nums">{nf.format(units)}</span>
                      </div>
                      <span aria-hidden className="h-1.5 rounded-full bg-ink/[0.06]">
                        <span
                          className="block h-full rounded-full bg-ink/70"
                          style={{ width: `${largestFlavor ? (units / largestFlavor) * 100 : 0}%` }}
                        />
                      </span>
                    </li>
                  );
                })}
                {summary.unassigned > 0 && (
                  <li className="flex items-baseline justify-between gap-3 rounded-lg bg-tile-peach px-2.5 py-1.5 text-sm font-semibold">
                    <span>Flavour not decided yet</span>
                    <span className="tabular-nums">{nf.format(summary.unassigned)}</span>
                  </li>
                )}
              </ul>
            </section>

            <div className="flex flex-col gap-5">
              <section className={PANE}>
                <h2 className="font-display text-base font-bold">Packages</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.packages.map(({ packageTypeId, packages }) => {
                    const type = packageById.get(packageTypeId);
                    const Icon = packageTypeIcon(type?.unitsPerPackage ?? 0);
                    return (
                      <li key={packageTypeId} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-semibold">
                          <Icon size={15} aria-hidden className="text-ink-soft" />
                          {type?.name ?? "Unknown package"}
                        </span>
                        <span className="font-display text-lg font-extrabold tabular-nums">× {nf.format(packages)}</span>
                      </li>
                    );
                  })}
                  {summary.eventUnits > 0 && (
                    <li className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <UnitsIcon size={15} aria-hidden className="text-ink-soft" />
                        Event totals (loose units)
                      </span>
                      <span className="font-display text-lg font-extrabold tabular-nums">{nf.format(summary.eventUnits)}</span>
                    </li>
                  )}
                </ul>
              </section>

              <section className={PANE}>
                <h2 className="font-display text-base font-bold">For the events</h2>
                <ul className="mt-3 flex flex-col gap-2 text-sm font-semibold">
                  {summary.displays.map(({ optionId, quantity }) => (
                    <Need key={optionId} icon={<Sparkles size={15} />} label={displayById.get(optionId)?.name ?? "Display"} value={quantity} />
                  ))}
                  <Need icon={<HandPlatter size={15} />} label="Waitresses" value={summary.waitresses} />
                  <Need icon={<BadgeCheck size={15} />} label="Kosher orders" value={summary.kosherOrders} />
                  <Need icon={<Truck size={15} />} label="Deliveries" value={summary.deliveries} />
                </ul>
              </section>
            </div>
          </div>

          {/* Only once there is something to shop for: before the first
              ingredient is added the list would only say it is empty. */}
          {ingredients.length > 0 && <ShoppingList rows={shopping.rows} untraced={shopping.untraced} />}

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-bold">Day by day</h2>
            {byDay.map(({ date, orders: dayOrders }) => (
              <div key={date} className="break-inside-avoid">
                <h3 className="mb-2 flex items-baseline gap-2 text-sm font-bold">
                  <span className={date === from ? "text-accent" : ""}>{date === from ? "Today" : orderWeekdayLong(date)}</span>
                  <span className="text-ink-soft">{formatOrderDate(date)}</span>
                  <span className="text-ink-soft">
                    · {nf.format(dayOrders.reduce((sum, o) => sum + orderUnits(o.packageLines, unitsPerPackage), 0))} units
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1 print:grid-cols-2">
                  {dayOrders.map((order) => (
                    <PrepOrderCard
                      key={order.key}
                      order={order}
                      unitsPerPackage={unitsPerPackage}
                      flavorById={flavorById}
                      packageById={packageById}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Need({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <li className={`flex items-center justify-between gap-3 ${value ? "" : "text-ink-soft"}`}>
      <span className="flex items-center gap-2">
        <span aria-hidden className="text-ink-soft">
          {icon}
        </span>
        {label}
      </span>
      <span className="font-display text-lg font-extrabold tabular-nums">{value ? nf.format(value) : "—"}</span>
    </li>
  );
}

/** One order as the kitchen reads it: who, how much, and every line's split. */
function PrepOrderCard({
  order,
  unitsPerPackage,
  flavorById,
  packageById,
}: {
  order: Order;
  unitsPerPackage: Map<number, number>;
  flavorById: Map<string, Flavor>;
  packageById: Map<string, PackageType>;
}) {
  const needs = extraSlots(order).filter((slot) => slot.on);
  return (
    <article className="break-inside-avoid rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p data-private className="truncate font-display text-lg font-extrabold">
            {order.customer || "No name"}
          </p>
          {order.customerType && <EventTypeChip value={order.customerType} short />}
        </div>
        <p className="flex shrink-0 items-center gap-1 font-display text-lg font-extrabold tabular-nums">
          <UnitsIcon size={14} aria-hidden className="text-ink-soft" />
          {nf.format(orderUnits(order.packageLines, unitsPerPackage))}
        </p>
      </div>
      {order.location && (
        <p data-private className="text-sm font-semibold text-ink-soft">
          {order.location}
        </p>
      )}

      <ul className="mt-2.5 flex flex-col gap-2">
        {order.packageLines.map((line, i) => (
          <li key={i} className="text-sm">
            <p className="font-bold">
              {packageLineLabel(line, unitsPerPackage, packageById.get(line.packageTypeId)?.name ?? "Unknown package")}
            </p>
            {line.flavors.length === 0 ? (
              <p className="text-sm font-semibold text-ink-soft">No flavours yet</p>
            ) : (
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {line.flavors.map((entry) => {
                  const flavor = flavorById.get(entry.flavorId);
                  return (
                    <span key={entry.flavorId} className="flex items-center gap-1.5 font-semibold">
                      {flavor && <span aria-hidden className="jelly-cube h-2.5 w-2.5" style={cubeColors(flavor)} />}
                      {flavor?.name ?? "Unknown"} <span className="tabular-nums text-ink-soft">{nf.format(entry.units)}</span>
                    </span>
                  );
                })}
              </p>
            )}
          </li>
        ))}
      </ul>

      {needs.length > 0 && (
        <p className="mt-2.5 flex flex-wrap gap-1.5">
          {needs.map(({ icon: Icon, short, label }) => (
            <span key={label} className="flex items-center gap-1 rounded-full bg-band px-2 py-0.5 text-xs font-semibold">
              <Icon size={12} aria-hidden />
              {short}
            </span>
          ))}
        </p>
      )}
      {order.notes && <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{order.notes}</p>}
    </article>
  );
}
