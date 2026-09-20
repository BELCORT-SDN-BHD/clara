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
//
// #996 — mounts the SAME disposition read the needs-you inbox row and the client Tax tab already
// carry (C88.10's `get_compliance_watch_disposition`) on THIS register too. `compliance.clients`
// above deliberately carries no watch id, so `loadComplianceWatchDispositions`
// (lib/firm-admin/compliance.ts) resolves it from `list_review_queue`'s own
// `row_kind==='compliance_watch'` rows first — a SECOND, independent `useAsyncRead`, because a
// viewer below the bookkeeper floor can read this whole register but not one watch's
// acknowledge/snooze/resolve history: that read's own refusal must never turn into
// `registerState`'s error banner and blank the aggregate this section IS allowed to show. Its
// loader depends on `register` (the FIRST read's own result), which `useAsyncRead`'s mount effect
// cannot see yet on this component's very first render — `reload()` is called explicitly once
// `register` arrives, the same explicit-reload-on-dependency-change shape
// components/registers/aging-register.tsx already uses for its AR/AP toggle.

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { ErrorMessage } from "@/components/firm/data-state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  loadComplianceRegister,
  loadComplianceWatchDispositions,
  type ComplianceClientWatch,
  type ComplianceWatchState,
  type ComplianceWatchDispositions,
} from "@/lib/firm-admin/compliance";
import { lastDispositionAct, type WatchDisposition } from "@/lib/firm/compliance-disposition";
import { WatchDispositionLine } from "@/components/firm/compliance-watch-affordance";
import { useMemberNames, type MemberNameResolver } from "@/lib/members/use-member-names";
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

  // #996 — see this file's own header. `register` is null on this component's first render (its
  // OWN useAsyncRead mount effect has not resolved yet), so the dispositions loader starts from
  // `register?.clients ?? []` and this effect explicitly re-reads once the aggregate arrives.
  const dispositionsState = useAsyncRead(() => loadComplianceWatchDispositions(sessionTokenAccessor, register?.clients ?? []));
  useEffect(() => {
    if (register) void dispositionsState.reload();
  }, [register]);
  const dispositions: ComplianceWatchDispositions | null = dispositionsState.data;

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

  // ONE ROSTER READ FOR THE WHOLE REGISTER (fix round 2026-09-20, standards L10-STD-01, spec
  // S-996-1). `lib/members/use-member-names.ts`'s own header states the rule: "callers that show
  // many actors on one page should hold the hook ONCE at the panel level and pass `resolve` down,
  // rather than mounting it per row." This register is exactly that page — one row per (client,
  // service_group) across the whole firm — and each row's `WatchDispositionLine` names an actor.
  // The hook has no cache and no shared context, so before this fix a firm with N dispositioned
  // watches issued N identical `clara.firm_members_visible` reads. The count is pinned by
  // `compliance-register-panel.test.tsx`'s five-row cell.
  const memberNames = useMemberNames(sessionTokenAccessor);

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
      {/* #996 AC3 — the floor is stated ONCE for the whole register, never per row: a viewer's
          role does not change from one watch to the next, and this is an honest sentence, never
          the ErrorMessage banner registerState's own refusal would render (that refusal belongs
          to a DIFFERENT read, the aggregate above, which this session CAN read in full). */}
      {outcome === "ok" && dispositions?.flooredBelowBookkeeper ? (
        <StateBanner tone="warning">{t("dispositionsFloored")}</StateBanner>
      ) : null}
      {outcome === "ok" ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <ComplianceClientRow
              key={`${row.client_id}:${row.service_group}`}
              row={row}
              clientName={clientsById.get(row.client_id)?.name ?? null}
              disposition={dispositions?.byKey.get(`${row.client_id}:${row.service_group}`) ?? null}
              resolver={memberNames}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ComplianceClientRow({
  row,
  clientName,
  disposition,
  resolver,
}: {
  row: ComplianceClientWatch;
  clientName: string | null;
  disposition: WatchDisposition | null;
  /** The PANEL's one resolver, threaded down — never a per-row `useMemberNames`. */
  resolver: MemberNameResolver;
}) {
  const t = useTranslations("FirmAdminCompliance.compliance");
  // #996 AC2 — a watch with nothing recorded yet and a watch whose id this panel could not
  // resolve are indistinguishable here (lib/firm-admin/compliance.ts's own header): both leave
  // `act` null, and the row renders exactly as it did before this ticket.
  const act = lastDispositionAct(disposition);
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
      {/* #996 AC1 — the SAME rendering the needs-you inbox row and the client Tax tab already
          use for a recorded act, reused rather than a second copy of the wording. */}
      {act !== null ? (
        <WatchDispositionLine
          act={act}
          resolvedEvidence={disposition?.resolvedEvidence ?? null}
          resolver={resolver}
        />
      ) : null}
    </li>
  );
}
