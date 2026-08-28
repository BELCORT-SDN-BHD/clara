"use client";

// T1 — `list_agent_act_receipts` (port-wave-plan §4 T1; TA-P4's "bookkeeper+
// read surface" requirement, migration 0138). Read-only — this IS the
// `agent_receipt` part's WORKBENCH half named in port-wave-plan part2 §8.1
// ("three of the four [P6] parts have a workbench half in T1 … shipping the
// card before the workbench would mean a card whose 'open the full object'
// destination does not exist"). The chat-rail CARD itself (a proactive
// `agent_receipt` typed part) is the P6 four-part wire bump's own scope, not
// this train's — recorded here, not fabricated as a NotBuiltNote, because the
// workbench destination below is real and live.
//
// Client-scoped (the door takes p_client + optional p_since, no p_fy).

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listAgentActReceipts } from "@/lib/close/api";
import type { SessionTokenAccessor } from "@/lib/session";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { SectionHeader } from "@/components/common/section-header";

const VERDICT_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  pass: "default",
  fail: "destructive",
};

export function AgentActReceiptsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientClose.receipts");
  const receipts = useHydratedPart(session, (s) => listAgentActReceipts(clientId, null, { session: s }));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={3}>{t("heading")}</SectionHeader>
      {receipts.loading && receipts.data === null ? <LoadingState>{t("loading")}</LoadingState> : null}
      {receipts.err ? <StateBanner tone="error">{receipts.err}</StateBanner> : null}
      {receipts.data && receipts.data.length === 0 ? <EmptyState>{t("empty")}</EmptyState> : null}
      {receipts.data && receipts.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {receipts.data.map((r) => (
            <li key={r.receipt_id} className="enter-content flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-card-foreground">{r.act_kind}</span>
                <Badge variant={VERDICT_VARIANT[r.verdict] ?? "outline"}>{r.verdict}</Badge>
                <span className="text-xs text-muted-foreground">{r.subject_kind} · {r.subject_id}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {t("model")}: {r.model.name ?? t("unknownModel")} {r.model.version ?? ""} · {t("via")}: {r.via_wake_kind} · {businessDateTime(r.created_at)}
              </span>
              {r.rationale ? <span className="text-xs text-card-foreground">{r.rationale}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
