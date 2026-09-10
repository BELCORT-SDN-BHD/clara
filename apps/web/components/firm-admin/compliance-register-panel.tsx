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
// #627 REBUILD: moved off `lib/parts/hooks.ts`'s `useHydratedPart`, whose
// `applyFailure` flattens every failure to a bare `err`(string)/`clr` pair —
// losing the `WireErrorKind` a caller needs to tell "your account can't read
// this yet" (403 forbidden) apart from "the read genuinely failed"
// (5xx/transport/malformed). `lib/firm/use-async-read.ts` keeps the RAW
// thrown error, so the same `classifyTaxReadOutcome` + `ErrorMessage` pairing
// this ticket's client Tax tab uses now applies here too — one five-state
// read model for both surfaces this ticket owns (client Tax, firm compliance
// settings), never two independently-drifting ones. The per-row card/`<dl>`
// layout is UNCHANGED: at 320px it already reads without any horizontal
// scroll (no genuinely two-dimensional table exists here to need the
// labelled-viewport treatment `components/ui/table.tsx` provides elsewhere).

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { ErrorMessage } from "@/components/firm/data-state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadComplianceRegister, type ComplianceClientWatch, type ComplianceWatchState } from "@/lib/firm-admin/compliance";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { fmtCents } from "@/lib/firm-admin/money";
import { classifyTaxReadOutcome } from "@/lib/tax/read-state";
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

// N4 (independent review, fix-required, 2026-08-28): `future_method_status`
// is `compliance_watches_future_method_status_check`'s own closed four-value
// domain (rig census) — the same closed-world-lookup pattern this file
// already uses for `state` above, applied to a second column this build had
// typed and read but never rendered.
const KNOWN_FUTURE_METHOD_STATUSES = ["not_assessed", "attested_below", "attested_above", "expired"] as const;
type KnownFutureMethodStatus = (typeof KNOWN_FUTURE_METHOD_STATUSES)[number];

export function ComplianceRegisterPanel() {
  const t = useTranslations("FirmAdminCompliance.compliance");

  const clientsState = useAsyncRead(() => loadClientRegister(sessionTokenAccessor));
  const registerState = useAsyncRead(() => loadComplianceRegister(sessionTokenAccessor));
  const register = registerState.data;
  const rows = register?.clients ?? [];
  const outcome = classifyTaxReadOutcome({
    loading: registerState.loading,
    error: registerState.error,
    isEmpty: rows.length === 0,
  });

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientRow>();
    for (const c of clientsState.data ?? []) map.set(c.id, c);
    return map;
  }, [clientsState.data]);

  const clientsErrorMessage = clientsState.error
    ? clientsState.error instanceof Error
      ? clientsState.error.message
      : String(clientsState.error)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* P6-T (FS-8): one sentence linking this firm-wide threshold watch to
          the client-scoped Tax tab's own draft story (裁-34). */}
      <p className="text-xs text-muted-foreground">{t("taxTabPointer")}</p>
      {register?.staleEvaluator ? <StateBanner tone="warning">{t("staleEvaluator")}</StateBanner> : null}
      {/* F3(a) (independent review, fix-required, 2026-08-28): before this
          fix, a failed client-names read was silently swallowed — the
          register still rendered RM figures with no disclosure that the
          client column had fallen back to raw UUIDs. Review law 2: absence
          is not evidence, so a degraded read must say so. */}
      {clientsErrorMessage ? (
        <StateBanner tone="warning">
          {t("clientNamesUnavailable")} ({clientsErrorMessage})
        </StateBanner>
      ) : null}
      {outcome === "loading" ? <LoadingState>{t("loading")}</LoadingState> : null}
      {outcome === "denied" || outcome === "error" ? <ErrorMessage error={registerState.error} /> : null}
      {/* "Successful, no data" gets its own status region (#627) — the same
          role="status" treatment the client Tax tab applies, so a screen
          reader announces "no open compliance watches" as its own state
          rather than silent muted prose. */}
      {outcome === "empty" ? (
        <div role="status">
          <EmptyState>{t("empty")}</EmptyState>
        </div>
      ) : null}
      {outcome === "ok" ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <ComplianceClientRow key={`${row.client_id}:${row.service_group}`} row={row} clientName={clientsById.get(row.client_id)?.name ?? null} />
          ))}
        </ul>
      ) : null}
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
          <dt>{t("screeningProxy")}</dt>
          <dd className="text-foreground">{fmtCents(row.screening_proxy_cents, t("centsUnsafe"))}</dd>
        </div>
        <div>
          <dt>{t("earliestCrossing")}</dt>
          <dd className="text-foreground">{row.earliest_crossing_month ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("applicationDue")}</dt>
          <dd className="text-foreground">{row.application_due ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("futureMethodStatus")}</dt>
          <dd className="text-foreground">
            {row.future_method_status && (KNOWN_FUTURE_METHOD_STATUSES as readonly string[]).includes(row.future_method_status)
              ? t(`futureMethodStatuses.${row.future_method_status as KnownFutureMethodStatus}`)
              : (row.future_method_status ?? "—")}
          </dd>
        </div>
      </dl>
    </li>
  );
}
