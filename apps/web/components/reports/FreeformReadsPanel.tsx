"use client";

// The freeform read surface (0131) — a READ-ONLY history of clara.
// freeform_read_log. There is NO human "run a freeform read" door here:
// wake_freeform_read is agent-lane only — see lib/reports/types.ts's header.
// Every field is read verbatim, refusal_reason/rung_vector/relations_read/
// byte_count included (M6 + LOW, independent review): lib/reports/api.ts's
// listFreeformReads fetches BOTH the client-scoped AND firm-scoped arms
// (0131:550-553 forces client_scope NULL when scope='firm', so a single
// client_scope filter structurally excludes every firm-wide read) — a
// firm-scope row is labeled honestly here, never silently folded in as if it
// named this client, and never silently omitted either.

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
                  {r.outcome ?? t("armed")}
                </Badge>
                <span className="text-muted-foreground">{r.scope}</span>
                {r.scope === "firm" ? <Badge variant="secondary">{t("firmWide")}</Badge> : null}
                <span className="text-muted-foreground">{r.at}</span>
                {r.row_count !== null ? <span className="text-muted-foreground">{r.row_count} {t("rowsLabel")}</span> : null}
                {r.byte_count !== null ? <span className="text-muted-foreground">{r.byte_count.toLocaleString()} {t("bytesLabel")}</span> : null}
                {r.duration_ms !== null ? <span className="text-muted-foreground">{r.duration_ms}ms</span> : null}
              </div>
              <p className="text-card-foreground">{r.purpose}</p>
              {r.refusal_reason ? <p className="text-destructive">{r.refusal_reason}</p> : null}
              {r.relations_read && r.relations_read.length > 0 ? (
                <p className="font-mono text-muted-foreground">{t("relationsLabel")}: {r.relations_read.join(", ")}</p>
              ) : null}
              {r.rung_vector ? (
                <p className="font-mono text-muted-foreground">{t("rungVectorLabel")}: {JSON.stringify(r.rung_vector)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
