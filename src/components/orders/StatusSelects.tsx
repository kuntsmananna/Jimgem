"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  paymentBadgeClass,
  type Order,
  type PaymentStatus,
  type ProductionStage,
  type ProductionStatus,
} from "@/lib/orderTypes";
import { JellyHop } from "@/components/JellyLoader";
import { saveError } from "@/components/saveError";
import { useStage, useStages } from "@/components/ProductionStagesContext";
import { paymentMethodIconElement } from "@/lib/icons";
import { usePaymentMethods } from "./PaymentMethodsContext";

/**
 * The payment status, as the badge it is everywhere else — and a click on
 * it opens the list of statuses (v0.73; it was a native `<select>` styled
 * as a badge, which opened the operating system's menu over the table).
 *
 * The list is **portalled to the page's top layer** at fixed coordinates,
 * like `HoverCard`, so a row below can never paint over it, and it opens
 * above the chip when there is no room beneath. Escape, a click anywhere
 * else or a scroll closes it. While the change saves the badge holds a
 * small jelly loader, and once it lands the page's Undo bar offers the
 * way back — a status chosen by a mis-click is otherwise a status nobody
 * notices changed.
 *
 * `keeps-color` because the colour *is* the information.
 */
export function PaymentStatusSelect({
  order,
  onChanged,
  onUndoable,
}: {
  order: Order;
  onChanged: () => void;
  /** Offers the change back on the page's Undo bar — see `useUndoToast`. */
  onUndoable?: (message: string, undo: () => Promise<void>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const chip = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const statuses = Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[];
  /*
   * How it was paid rides in the same badge and the same list (v0.78): the
   * method's icon sits inside the badge, and the list has a Paid by half
   * under the statuses. It was a column of its own beside this one — two
   * cells answering one question, "has this been paid, and how".
   */
  const allMethods = usePaymentMethods();
  const method = allMethods.find((m) => m.id === order.paymentMethodId) ?? null;
  const methods = allMethods.filter((m) => !m.archivedAt || m.id === order.paymentMethodId);

  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (at === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!chip.current?.contains(target) && !menu.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Captured and stopped, for the reason `usePopoverDismiss` gives.
      event.stopPropagation();
      close();
      chip.current?.focus();
    };
    // Fixed coordinates do not follow a scrolling page, so a scroll closes
    // the list rather than leaving it hanging where the chip used to be.
    const onScroll = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    menu.current?.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [at, close]);

  function open() {
    const rect = chip.current?.getBoundingClientRect();
    if (!rect) return;
    const height = statuses.length * 34 + 12 + (methods.length ? (methods.length + 1) * 34 + 30 : 0);
    const below = rect.bottom + 6 + height <= window.innerHeight - 8;
    setAt({
      left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
      // Held on screen when it fits neither below nor above: with the Paid
      // by half the list is ~400px, and on a short window a badge mid-page
      // opened it with its statuses above the top edge. It overlaps the
      // badge then, which is better than half a menu nobody can reach.
      top: below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - height),
    });
  }

  async function write(patch: { paymentStatus: PaymentStatus } | { paymentMethodId: number | null }): Promise<boolean> {
    const response = await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", ...patch }),
    });
    const failure = await saveError(response, "order");
    if (failure) alert(failure);
    return !failure;
  }

  async function choose(status: PaymentStatus) {
    close();
    if (status === order.paymentStatus) return;
    const before = order.paymentStatus;
    setBusy(true);
    const ok = await write({ paymentStatus: status });
    setBusy(false);
    onChanged();
    if (ok) {
      onUndoable?.(`${order.customer || "Order"} — ${PAYMENT_STATUS_LABEL[status]}`, async () => {
        await write({ paymentStatus: before });
        onChanged();
      });
    }
  }

  async function chooseMethod(id: number | null) {
    close();
    if (id === order.paymentMethodId) return;
    const before = order.paymentMethodId;
    setBusy(true);
    const ok = await write({ paymentMethodId: id });
    setBusy(false);
    onChanged();
    if (ok) {
      const name = allMethods.find((m) => m.id === id)?.name;
      onUndoable?.(`${order.customer || "Order"} — ${name ? `paid by ${name}` : "paid by cleared"}`, async () => {
        await write({ paymentMethodId: before });
        onChanged();
      });
    }
  }

  function onMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const now = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = (now + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }

  return (
    <>
      <button
        ref={chip}
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={at !== null}
        aria-label={`Payment: ${PAYMENT_STATUS_LABEL[order.paymentStatus]}${method ? `, by ${method.name}` : ""}. Change`}
        onClick={() => (at ? close() : open())}
        className={`press keeps-color inline-flex min-w-16 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${paymentBadgeClass(order.paymentStatus)}`}
      >
        {busy ? (
          <JellyHop size={5} label="Saving" />
        ) : (
          <>
            {method && <span className="shrink-0">{paymentMethodIconElement(method.name)}</span>}
            {PAYMENT_STATUS_LABEL[order.paymentStatus]}
            <ChevronDown size={11} aria-hidden className="opacity-60" />
          </>
        )}
      </button>
      {at !== null &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            aria-label="Payment status"
            onKeyDown={onMenuKey}
            style={{ left: at.left, top: at.top, width: MENU_WIDTH }}
            className="motion-drop fixed z-50 flex flex-col rounded-xl border border-line bg-card p-1.5 shadow-[0_18px_40px_-14px_rgb(120_80_60/0.4)]"
          >
            {statuses.map((status) => {
              const current = status === order.paymentStatus;
              return (
                <button
                  key={status}
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => choose(status)}
                  className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-ink outline-none transition-colors hover:bg-cream focus-visible:bg-cream"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${paymentBadgeClass(status)}`} aria-hidden />
                  <span className={`flex-1 ${current ? "font-bold" : "font-medium"}`}>{PAYMENT_STATUS_LABEL[status]}</span>
                  {current && <Check size={13} className="text-accent" aria-hidden />}
                </button>
              );
            })}
            {methods.length > 0 && (
              <>
                <p className="mt-1.5 border-t border-line px-2 pt-2 pb-1 text-[10px] font-bold tracking-[0.12em] text-ink-soft uppercase">
                  Paid by
                </p>
                {[{ id: null, name: "Not yet" }, ...methods].map((m) => {
                  const current = m.id === order.paymentMethodId;
                  return (
                    <button
                      key={m.id ?? "none"}
                      type="button"
                      role="option"
                      aria-selected={current}
                      onClick={() => chooseMethod(m.id)}
                      className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-ink outline-none transition-colors hover:bg-cream focus-visible:bg-cream"
                    >
                      <span className="flex w-3 shrink-0 justify-center text-ink-soft" aria-hidden>
                        {m.id !== null && paymentMethodIconElement(m.name)}
                      </span>
                      <span className={`flex-1 ${current ? "font-bold" : "font-medium"}`}>{m.name}</span>
                      {current && <Check size={13} className="text-accent" aria-hidden />}
                    </button>
                  );
                })}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

const MENU_WIDTH = 176;

/**
 * What a stage means, a hover away from its chip. The owner's stages carry
 * no description of their own, so this says the two things the flags on
 * the row actually decide: whether the order counts as money, and whether
 * it is done.
 */
export function stageHint(stage: ProductionStage | undefined): string {
  if (!stage) return "A status that is no longer on the list in Settings.";
  if (!stage.countsAsIncome) return "A quote — not counted as income until the customer says yes.";
  if (stage.isFinal) return "Done. Hidden by the default Status filter.";
  return "Booked and still to do — counted as income.";
}

/**
 * The stage picker, used by the table's Status column and the Kanban card.
 *
 * The options come from the owner's list rather than a fixed set, and the
 * pill wears the stage's own colour — which is what makes Status read as a
 * different kind of thing from the payment badge beside it.
 *
 * A stage already on an order stays selectable even once archived, so
 * opening the control and closing it cannot retype the order.
 */
export function ProductionStatusSelect({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const stages = useStages();
  const current = useStage(order.productionStatus);

  async function handleChange(status: ProductionStatus) {
    setBusy(true);
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", productionStatus: status }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <select
      value={order.productionStatus}
      disabled={busy}
      onChange={(e) => handleChange(e.target.value)}
      // `keeps-color` because the fill *is* the information here — a stage
      // given the row's cream text on hover would simply vanish.
      className={`keeps-color rounded-md border-0 px-1.5 py-1 text-[11px] font-bold text-ink outline-none ${
        current?.countsAsIncome === false ? "outline-1 outline-dashed outline-ink/35" : ""
      }`}
      style={{ background: current?.color ?? "var(--color-line)" }}
    >
      {stages
        .filter((stage) => !stage.archivedAt || stage.key === order.productionStatus)
        .map((stage) => (
          <option key={stage.key} value={stage.key}>
            {stage.label}
          </option>
        ))}
      {/* A stage removed from the list entirely still has to hold its
          place, or saving the row would move the order somewhere else. */}
      {!current && <option value={order.productionStatus}>{order.productionStatus}</option>}
    </select>
  );
}
