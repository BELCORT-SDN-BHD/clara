"use client";

// The freeform read surface (0131) — a READ-ONLY history of clara.
// freeform_read_log, filtered to this client's scope. There is NO human "run a
// freeform read" door here: wake_freeform_read is agent-lane only, and its own
// runtime wiring has not shipped — see lib/reports/types.ts's header. Every
// field is read verbatim, refusal_reason included.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listFreeformReads } from "@/lib/reports/api";
import type { SessionTokenAccessor } from "@/lib/session";

export function FreeformReadsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.freeform");
  const { data: reads, err } = useHydratedPart(session, (s) => listFreeformReads(clientId, { session: s }));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <header>
        <h2 className="text-base font-medium text-foreground">{t("heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      </header>

      <p className="rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground">{t("runNotice")}</p>

      {err ? (
        <p className="text-sm text-destructive">{t("error", { message: err })}</p>
      ) : !reads ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : reads.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reads.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.outcome === "ok" ? "default" : r.outcome === "refused" ? "destructive" : "outline"}>
                  {r.outcome ?? "armed"}
                </Badge>
                <span className="text-muted-foreground">{r.scope}</span>
                <span className="text-muted-foreground">{r.at}</span>
                {r.row_count !== null ? <span className="text-muted-foreground">{r.row_count} rows</span> : null}
                {r.duration_ms !== null ? <span className="text-muted-foreground">{r.duration_ms}ms</span> : null}
              </div>
              <p className="text-card-foreground">{r.purpose}</p>
              {r.refusal_reason ? <p className="text-destructive">{r.refusal_reason}</p> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
