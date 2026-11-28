"use client";

import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";
import { HandOverButton, LiveClock } from "@/components/events/ProofClient";
import { JellyTray } from "@/components/events/JellyTray";
import { FollowUs } from "@/app/pay/FollowUs";
import { payCopy, type PayLang } from "@/app/pay/copy";
import { currencyExact } from "@/lib/money";

type CubeColor = { g: string; b: string; s: string };

const shekels = currencyExact;

/** Letters nobody reads as a digit or as each other across a stall. */
const CODE_LETTERS = "ACDEFHJKLMNPRTUVWXY";
/** Strong colours a member of staff can tell apart at arm's length. */
const PROOF_COLORS = ["#8e6bbf", "#d9577f", "#2f8f83", "#d9822b", "#3f6fb5", "#7a9a3a", "#b4533c", "#5b5f97"];

/** A sale's code and colour, from its id — "K7" on purple. */
export function saleMark(id: number): { code: string; color: string } {
  return {
    code: `${CODE_LETTERS[id % CODE_LETTERS.length]}${(Math.floor(id / CODE_LETTERS.length) % 9) + 1}`,
    color: PROOF_COLORS[id % PROOF_COLORS.length],
  };
}

/**
 * The proof screen and the thank-you after it, as two screens that each
 * fit a phone without scrolling (v0.102.1). A self-service sale that has
 * not been handed over opens on the **proof** — the sale's colour, code
 * and ticking clock, what was taken, the staff's tap — and moves on to the
 * **thank-you** by itself once that tap is saved; a small link moves on
 * early, and back, should the staff forget to tap. Anything else (a sale
 * rung up by staff, or already handed over) opens on the thank-you: the
 * jelly tray and the invitation to follow, under a short paid line that
 * still carries the code.
 */
export function SaleProofView({
  token,
  lang,
  amount,
  proof,
  items,
  cubes,
}: {
  token: string;
  lang: PayLang;
  amount: number;
  proof: { saleId: number; selfService: boolean; handedAt: string | null };
  items: { presetId: number; qty: number; name: string; color: CubeColor }[];
  cubes: CubeColor[];
}) {
  const t = payCopy(lang);
  const mark = saleMark(proof.saleId);
  const [view, setView] = useState<"proof" | "thanks">(proof.selfService && !proof.handedAt ? "proof" : "thanks");
  const Forward = lang === "he" ? ArrowLeft : ArrowRight;
  const Back = lang === "he" ? ArrowRight : ArrowLeft;

  if (view === "proof") {
    return (
      <div key="proof" className="motion-rise">
        <div className="-mx-6 -mt-6 rounded-t-[24px] px-5 pt-5 pb-5 text-center text-white" style={{ background: mark.color }}>
          <p className="font-display flex items-center justify-center gap-2 text-xl font-extrabold">
            <span className="motion-pop relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <span className="proof-ring absolute inset-0 rounded-full bg-white/40" aria-hidden />
              <CircleCheck size={22} strokeWidth={2.25} aria-hidden />
            </span>
            {t.paidProof} <span dir="ltr">{shekels(amount)}</span>
          </p>
          <p className="font-display mt-3 flex items-center justify-center gap-3 text-[40px] leading-none font-extrabold" dir="ltr">
            <span className="rounded-2xl bg-white px-3.5 py-1" style={{ color: mark.color }}>
              {mark.code}
            </span>
            <LiveClock />
          </p>
          <p className="mt-2.5 text-xs opacity-85">{t.codeNote}</p>
        </div>

        <h2 className="mt-4 text-sm font-bold text-ink-soft">{t.took(proof.saleId)}</h2>
        <ul className="motion-stagger mt-2 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.presetId} className="flex items-center gap-3 text-[17px] font-bold">
              <span
                className="jelly-cube h-6 w-6 shrink-0 rounded-[4px]"
                style={{ "--g": item.color.g, "--b": item.color.b, "--s": item.color.s } as CSSProperties}
                aria-hidden
              />
              <span>
                {item.qty} × {item.name}
              </span>
            </li>
          ))}
        </ul>

        <HandOverButton
          token={token}
          handedAt={proof.handedAt}
          label={t.handed}
          note={t.handedNote}
          doneLabel={t.handedDone("{time}")}
          onHanded={() => setTimeout(() => setView("thanks"), 1200)}
        />
        <button
          type="button"
          onClick={() => setView("thanks")}
          className="mx-auto mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent"
        >
          {t.toThanks}
          <Forward size={15} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div key="thanks" className="motion-rise">
      <div className="flex items-center gap-3">
        <span className="motion-pop flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-cream">
          <CircleCheck size={24} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight font-extrabold">{t.thanksBuy}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
            {t.paidProof} <span dir="ltr">{shekels(amount)}</span> ·
            <span className="rounded-md px-1.5 text-xs font-extrabold text-white" style={{ background: mark.color }} dir="ltr">
              {mark.code}
            </span>
          </p>
        </div>
      </div>

      {cubes.length > 0 && (
        <div className="mt-5 text-center">
          <p className="mb-2.5 text-sm font-bold">{t.yourTray}</p>
          <JellyTray cubes={cubes} shakeLabel={t.shake} />
        </div>
      )}

      <FollowUs lang={lang} title={t.followTitle} compact />

      {proof.selfService && (
        <button
          type="button"
          onClick={() => setView("proof")}
          className="mx-auto mt-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"
        >
          <Back size={15} aria-hidden />
          {t.backToProof}
        </button>
      )}
    </div>
  );
}
