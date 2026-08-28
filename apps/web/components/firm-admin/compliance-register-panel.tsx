"use client";

// The firm-altitude compliance register (port-wave plan §4 T10, §5's
// workbench-panel column) — every non-resolved SST-registration watch across
// the firm, one row per (client, service_group). Reads
// lib/firm-admin/compliance.ts's `loadComplianceRegister`, which closes a
// NAMED gap: `list_review_queue`'s own `compliance` envelope object was on
// the wire since 0016 but never rendered (lib/firm/needs-you.ts's own header
// calls it out). The per-watch ack/snooze/resolve acts live on the needs-you
// row itself (components/firm/compliance-watch-affordance.tsx) — this panel
// is a pure, honest READ, no second write surface for the same doors.
//
// Error rendering follows components/reports/ExportRecipientsPanel.tsx's own
// pattern: useHydratedPart flattens a failure to `err`(string)/`clr` — that is
// NOT the raw error instance components/firm/data-state.tsx's ErrorMessage
// classifies via `instanceof`, so this panel renders the flattened pair
// directly rather than re-wrapping it through that component.

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadComplianceRegister, type ComplianceClientWatch, type ComplianceWatchState } from "@/lib/firm-admin/compliance";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { fmtCents } from "@/lib/firm-admin/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";

const STATE_VARIANT: Record<string, "outline" | "default" | "destructive" | "secondary"> = {
  monitored: "secondary",
  early_warning: "outline",
  crossed: "destructive",
  overdue: "destructive",
};

function stateVariant(state: ComplianceWatchState): "outline" | "default" | "destructive" | "secondary" {
  return STATE_VARIANT[state] ?? "outline";
}

export function ComplianceRegisterPanel() {
  const t = useTranslations("FirmAdminCompliance.compliance");

  const clientsState = useHydratedPart(sessionTokenAccessor, (session) => loadClientRegister(session));
  const { data: register, err, clr } = useHydratedPart(sessionTokenAccessor, (session) => loadComplianceRegister(session));

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientRow>();
    for (const c of clientsState.data ?? []) map.set(c.id, c);
    return map;
  }, [clientsState.data]);

  return (
    <div className="flex flex-col gap-3">
      {register?.staleEvaluator ? <StateBanner tone="warning">{t("staleEvaluator")}</StateBanner> : null}
      {!register ? (
        err ? (
          <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
            {err}
          </StateBanner>
        ) : (
          <LoadingState>{t("loading")}</LoadingState>
        )
      ) : register.clients.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <>
          {err ? (
            // The list is still real (a fresh reload after this failed) —
            // the failure renders ALONGSIDE it, never replacing it
            // (ExportRecipientsPanel.tsx's own "Low 8" precedent).
            <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
              {err}
            </StateBanner>
          ) : null}
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {register.clients.map((row) => (
              <ComplianceClientRow key={`${row.client_id}:${row.service_group}`} row={row} clientName={clientsById.get(row.client_id)?.name ?? null} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ComplianceClientRow({ row, clientName }: { row: ComplianceClientWatch; clientName: string | null }) {
  const t = useTranslations("FirmAdminCompliance.compliance");
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{clientName ?? row.client_id}</span>
        <Badge variant="secondary">{row.service_group}</Badge>
        <Badge variant={stateVariant(row.state)}>
          {(["monitored", "early_warning", "crossed", "overdue", "resolved"] as const).includes(
            row.state as "monitored" | "early_warning" | "crossed" | "overdue" | "resolved",
          )
            ? t(`state.${row.state as "monitored" | "early_warning" | "crossed" | "overdue" | "resolved"}`)
            : row.state}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>{t("confirmedIncluded")}</dt>
          <dd className="text-foreground">{fmtCents(row.confirmed_included_cents, t("centsUnsafe"))}</dd>
        </div>
        <div>
          <dt>{t("unknownOrMixed")}</dt>
          <dd className="text-foreground">{fmtCents(row.unknown_or_mixed_cents, t("centsUnsafe"))}</dd>
        </div>
        <div>
          <dt>{t("earliestCrossing")}</dt>
          <dd className="text-foreground">{row.earliest_crossing_month ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("applicationDue")}</dt>
          <dd className="text-foreground">{row.application_due ?? "—"}</dd>
        </div>
      </dl>
    </li>
  );
}
