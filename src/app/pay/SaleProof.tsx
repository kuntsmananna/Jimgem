import { getSaleProof } from "@/lib/eventSales";
import { getContentPresets, getFlavors, getPackageTypes } from "@/lib/settings";
import { NEUTRAL, presetSummaries, trayCubes } from "@/lib/eventPresets";
import { SaleProofView } from "@/components/events/SaleProofView";
import type { PayLang } from "./copy";

/**
 * What a customer who paid for an event sale sees (v0.102): the proof
 * screen to show the staff — the sale's own colour and code with a clock
 * that ticks, what was taken, and for a self-service sale the staff's
 * "handed over" tap — then their tray of jelly to play with. A sale rung
 * up by staff has the register's own green screen, so it opens on the
 * thank-you. Two screens rather than one long one (v0.102.1, the owner's
 * call): nobody scrolled down to the tray and the links under the proof.
 *
 * It renders inside the card of `PayShell`, pulling its coloured top out
 * to the card's edges.
 */
export async function SaleProof({ token, lang, amount }: { token: string; lang: PayLang; amount: number }) {
  const proof = await getSaleProof(token);
  if (!proof) return null;
  const [presets, flavors, packageTypes] = await Promise.all([
    getContentPresets(true),
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

