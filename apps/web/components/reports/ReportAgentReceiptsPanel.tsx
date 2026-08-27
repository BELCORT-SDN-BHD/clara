"use client";

// clara.report_agent_receipts (0111:203-254) — a direct RLS read, firm-wide
// scope filtered client-side to this client. Fourteen-value closed `act`
// enum, rendered verbatim — never relabelled.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listReportAgentReceipts } from "@/lib/reports/api";
import type { SessionTokenAccessor } from "@/lib/session";

export function ReportAgentReceiptsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory.receipts");
  const { data: receipts, err } = useHydratedPart(session, (s) => listReportAgentReceipts(clientId, { session: s }));

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">{t("heading")}</h3>
      {err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : !receipts ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {receipts.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
              <span className="font-medium text-card-foreground">{r.act}</span>
              <Badge variant={r.outcome === "done" ? "default" : "destructive"}>{r.outcome}</Badge>
              <span className="font-mono text-muted-foreground">{r.model}/{r.model_version}</span>
              <span className="text-muted-foreground">{r.at}</span>
              {r.directed_by ? <span className="text-muted-foreground">{t("directedBy")} {r.directed_by.slice(0, 8)}</span> : null}
              {r.refusal_token ? <span className="font-mono text-destructive">{r.refusal_token}</span> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
