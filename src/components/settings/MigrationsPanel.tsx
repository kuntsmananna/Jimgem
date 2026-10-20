import { CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { PaneHeader } from "@/components/Pane";
import type { MigrationStatus } from "@/lib/migrations";

/**
 * Which hand-run migrations this database has had — read from what each
 * one leaves behind, see `src/lib/migrations.ts`.
 *
 * What is missing leads, by name and file, because that is the only line
 * here anybody acts on; the full list is folded under it, since a column
 * of thirty ticks is a ledger read once. No server work beyond the read,
 * so a plain server component rather than a client one.
 */
export function MigrationsPanel({ migrations }: { migrations: MigrationStatus[] }) {
  const missing = migrations.filter((m) => m.state === "missing");
  const applied = migrations.filter((m) => m.state === "applied").length;

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Migrations"
        description="Database changes that are run by hand. Checked against what each one leaves in the database, so it is right however long ago it was run."
      />

      {missing.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <CircleCheck size={16} className="text-accent" aria-hidden />
          All {applied} have been run on this database.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold text-ink">
            {missing.length === 1 ? "One hasn't" : `${missing.length} haven't`} been run on this database yet:
          </p>
          {missing.map((m) => (
            <div key={m.id} className="rounded-lg bg-tile-peach px-3 py-2 text-xs text-ink">
              <span className="flex items-center gap-1.5 font-semibold">
                <CircleAlert size={13} aria-hidden />
                {m.id} · {m.title}
              </span>
              <span className="mt-0.5 block">
                Paste <code className="font-mono break-all">{m.script}</code> into the database console.
              </span>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">Every migration</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {migrations.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-ink">
              {m.state === "applied" ? (
                <CircleCheck size={13} className="shrink-0 text-accent" aria-label="Run" />
              ) : m.state === "missing" ? (
                <CircleAlert size={13} className="shrink-0 text-due" aria-label="Not run" />
              ) : (
                <CircleDashed size={13} className="shrink-0 text-ink-soft" aria-label="Data only" />
              )}
              <span className="w-8 shrink-0 font-mono text-ink-soft">{m.id}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              {m.state === "data-only" && <span className="shrink-0 text-ink-soft">data only — nothing to check</span>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
