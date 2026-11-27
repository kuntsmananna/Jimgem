import type { CSSProperties } from "react";
import { CircleCheck } from "lucide-react";
import { getSaleProof, type SaleProof as SaleProofData } from "@/lib/eventSales";
import { getContentPresets, getFlavors, getPackageTypes } from "@/lib/settings";
import { presetSummaries, trayCubes } from "@/lib/eventPresets";
import { HandOverButton, LiveClock } from "@/components/events/ProofClient";
import { JellyTray } from "@/components/events/JellyTray";
import { payCopy, type PayLang } from "./copy";
import { shekels } from "./PayShell";

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
 * What a customer who paid for an event sale sees (v0.102): the proof
 * screen to show the staff — the sale's own colour and code with a clock
 * that ticks, what was taken, and for a self-service sale the staff's
 * "handed over" tap — then their tray of jelly to play with. A sale rung
 * up by staff has the register's own green screen, so it gets the tray
 * and no hand-over button.
 *
 * It renders inside the card of `PayShell`, pulling its coloured top out
 * to the card's edges.
 */
export async function SaleProof({ token, lang, amount }: { token: string; lang: PayLang; amount: number }) {
  const proof = await getSaleProof(token);
  if (!proof) return null;
  const [presets, flavors, packageTypes] = await Promise.all([
    getContentPresets(),
    getFlavors(true),
    getPackageTypes(true),
  ]);
  const summaries = new Map(presetSummaries(presets, flavors, packageTypes).map((p) => [p.id, p]));
  return (
    <SaleProofView
      token={token}
      lang={lang}
      amount={amount}
      proof={proof}
      items={proof.items.map((item) => {
        const summary = summaries.get(item.presetId);
        return { presetId: item.presetId, qty: item.qty, name: summary?.name ?? "Gems", color: summary?.color ?? NEUTRAL };
      })}
      cubes={trayCubes(proof.items, presets, flavors, packageTypes)}
    />
  );
}

const NEUTRAL = { g: "#efe6df", b: "#d9cbc1", s: "#b9a89c" };
type CubeColor = { g: string; b: string; s: string };

/** The proof screen itself, from data — `SaleProof` reads it. */
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
  proof: Pick<SaleProofData, "saleId" | "selfService" | "handedAt">;
  items: { presetId: number; qty: number; name: string; color: CubeColor }[];
  cubes: CubeColor[];
}) {
  const t = payCopy(lang);
  const mark = saleMark(proof.saleId);
  return (
    <>
      <div className="-mx-6 -mt-6 rounded-t-[24px] px-6 pt-6 pb-7 text-center text-white" style={{ background: mark.color }}>
        <span className="motion-pop relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
          <span className="proof-ring absolute inset-0 rounded-full bg-white/40" aria-hidden />
          <CircleCheck size={34} strokeWidth={2} aria-hidden />
        </span>
        <p className="font-display mt-3 text-2xl font-extrabold">
          {t.paidProof} <span dir="ltr">{shekels(amount)}</span>
        </p>
        <p className="font-display mt-2 flex items-center justify-center gap-4 text-[44px] leading-none font-extrabold" dir="ltr">
          <span className="rounded-2xl bg-white px-4 py-1" style={{ color: mark.color }}>
            {mark.code}
          </span>
          <LiveClock />
        </p>
        <p className="mt-3 text-xs opacity-85">{t.codeNote}</p>
      </div>

      <h2 className="mt-5 text-sm font-bold text-ink-soft">{t.took(proof.saleId)}</h2>
      <ul className="motion-stagger mt-2 flex flex-col gap-2">
        {items.map((item) => {
          const color = item.color;
          return (
            <li key={item.presetId} className="flex items-center gap-3 text-[17px] font-bold">
              <span
                className="jelly-cube h-7 w-7 shrink-0 rounded-[5px]"
                style={{ "--g": color.g, "--b": color.b, "--s": color.s } as CSSProperties}
                aria-hidden
              />
              <span>
                {item.qty} × {item.name}
              </span>
            </li>
          );
        })}
      </ul>

      {proof.selfService && (
        <HandOverButton
          token={token}
          handedAt={proof.handedAt}
          label={t.handed}
          note={t.handedNote}
          doneLabel={t.handedDone("{time}")}
        />
      )}

      {cubes.length > 0 && (
        <div className="mt-6 border-t border-line pt-5 text-center">
          <p className="mb-3 text-sm font-bold">{t.yourTray}</p>
          <JellyTray cubes={cubes} shakeLabel={t.shake} />
        </div>
      )}
    </>
  );
}
