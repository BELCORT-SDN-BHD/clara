"use client";

// clara.report_agent_receipts (0111:203-254) — a direct RLS read, firm-wide
// scope filtered client-side to this client. Fourteen-value closed `act`
// enum, rendered verbatim — never relabelled.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listReportAgentReceipts } from "@/lib/reports/api";
import type { SessionTokenAccessor } from "@/lib/session";

export function ReportAgentReceiptsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory.receipts");
  const { data: receipts, err } = useHydratedPart(session, (s) => listReportAgentReceipts(clientId, { session: s }));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={3}>{t("heading")}</SectionHeader>
      {/* P3 polish, microcopy: the loading state was a literal `…` — the one
          loading string in the product that never went through next-intl and
          the one that did not say WHAT was loading. Every other surface names
          it ("Loading the close plan…"), so this one does too. */}
      {err ? (
        <StateBanner tone="error">{err}</StateBanner>
      ) : !receipts ? (
        <LoadingState>{t("loading")}</LoadingState>
      ) : receipts.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {receipts.map((r) => (
            <div key={r.id} className="enter-content flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs">
              <span className="font-medium text-card-foreground">{r.act}</span>
              <Badge variant={r.outcome === "done" ? "default" : "destructive"}>{r.outcome}</Badge>
              <span className="font-mono text-muted-foreground">{r.model}/{r.model_version}</span>
              <span className="text-muted-foreground">{r.at}</span>
              {r.directed_by ? <span className="text-muted-foreground">{t("directedBy")} {r.directed_by.slice(0, 8)}</span> : null}
              {r.refusal_token ? <span className="font-mono text-error">{r.refusal_token}</span> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
