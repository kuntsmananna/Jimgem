"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { PANE_ACTION_CLASS, PaneHeader } from "./Pane";

interface ImportResult {
  ordersImported: number;
  ordersAlreadyPresent: number;
  ordersUndated: number;
  expenseItemsImported: number;
  expenseItemsAlreadyPresent: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Manual Sheet → DB import. Pages read Postgres alone, so this is the
 * only moment the Google Sheet is read at all (see sheetImport.ts).
 */
export function ImportPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/import-sheet", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Import failed.");
      } else {
        setResult(body as ImportResult);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Google Sheet"
        description={<>Rows already imported are left alone, so dashboard edits are never overwritten.</>}
        action={<button
        onClick={runImport}
        disabled={busy}
        className={`flex items-center gap-2 ${PANE_ACTION_CLASS} disabled:opacity-60`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {busy ? "Importing…" : "Import from Google Sheet"}
      </button>}
      />
      <p className="text-xs text-ink-soft">
        The dashboard reads its own database, not the sheet. Import when you&apos;ve added rows to the sheet and
        want them here.
      </p>

      

      {result && (
        <p className="mt-3 text-xs font-semibold text-ink">
          Imported {plural(result.ordersImported, "order", "orders")} and{" "}
          {plural(result.expenseItemsImported, "expense amount", "expense amounts")}.
          <span className="font-medium text-ink-soft">
            {" "}
            {result.ordersAlreadyPresent + result.expenseItemsAlreadyPresent} already present, left alone.
            {result.ordersUndated > 0 &&
              ` ${plural(result.ordersUndated, "sheet row has", "sheet rows have")} no date and can't be imported.`}
          </span>
        </p>
      )}
      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
    </section>
  );
}
