"use client";

// Turnover classification — the LIVE `clara.set_turnover_classification` door, given the user
// interface it has never had.
//
// THE DOOR HAS BEEN CALLABLE SINCE MIGRATION 0016 AND UNREACHABLE FROM ANYWHERE. It is
// EXECUTE-granted to `clara_authenticated`, hard-refuses an agent identity (CLR03) and is
// tail-asserted in its own migration's grant matrix. The gap was purely a missing surface, and
// the map calls it the single largest honest win on this tab.
//
// WHAT THE CONTROL OFFERS AND WHERE EACH CHOICE COMES FROM:
//   ACCOUNT   `loadChartOfAccounts` — the client's own chart, so the control cannot offer a code
//             the door would refuse as "not found on the client chart".
//   CLASS     the three values the live body's own guard admits. A fourth is refused CLR10; this
//             list exists so the control cannot OFFER one, never as a substitute for the DB's
//             check.
//   GROUP     the service groups THIS CLIENT'S OWN compliance envelope reports, plus "none".
//             `clara.sst_threshold_schedule` — the table the door validates against — carries no
//             `clara_authenticated` grant, so a human session genuinely cannot enumerate it. The
//             envelope is the only DB-owned source of group names a browser can see; offering a
//             free-text box instead would invite a value the door will reject.
//
// WHAT THE CONTROL DOES NOT DO, DELIBERATELY. It does not decide whether a move is
// "watch-lowering", and therefore does not pre-empt the admin+ rank check or the evidence
// requirement that ride on it. That predicate reads the classification in force at the effective
// date, which no human read exposes; re-deriving it in the browser would be a second, guessing
// copy of a rule the DB owns. The door decides, and its refusal renders VERBATIM.
//
// NO CEREMONY (裁-187). Every field below is an INPUT the door requires or accepts — there is no
// typed confirmation, no attestation tick and no second confirm. Evidence is offered because
// the door asks for it on some moves, not as a ritual.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { businessToday } from "@/lib/business-date";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  setTurnoverClassification,
  TURNOVER_CLASSIFICATIONS,
  type TurnoverClassification,
} from "@/lib/tax/sst-watch";

export function TurnoverClassificationPanel({
  clientId,
  /** The service groups this client's own compliance envelope reports. Empty is fine — the
   *  door accepts a null group. */
  serviceGroups,
  busy,
  act,
}: {
  clientId: string;
  serviceGroups: readonly string[];
  /** True while the workbench's SST-watch act cycle is in flight. */
  busy: boolean;
  /**
   * The workbench's OWN act-and-reload cycle, over the SST-watch read.
   *
   * THE RE-READ IS DELIBERATELY OF THE WATCH, NOT OF THE CHART. `set_turnover_classification`
   * writes `clara.client_turnover_accounts`, and NO human-reachable read of that table exists —
   * so there is nothing to re-read that would echo the write back directly. What the write
   * ultimately moves is this client's SST watch, and that IS readable, so the act reloads it.
   * The figures may not change on this reload: the evaluator that recomputes them runs on the
   * runtime lane (`evaluate_sst_watches_all` is granted to `clara_runtime` and deliberately not
   * to a human session), which is why the panel says so in words rather than implying the
   * numbers below it are now current.
   */
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ClientTax.turnoverClassification");
  const tc = useTranslations("Common");
  const chart = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));

  const [accountCode, setAccountCode] = useState("");
  const [classification, setClassification] = useState<TurnoverClassification>("included");
  const [serviceGroup, setServiceGroup] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(businessToday());

  const accounts = (chart.data ?? []).filter((row) => row.is_active);
  const canSubmit = accountCode !== "" && reason.trim() !== "" && effectiveFrom !== "";

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await act(() =>
      setTurnoverClassification(sessionTokenAccessor, {
        clientId,
        accountCode,
        classification,
        serviceGroup: serviceGroup === "" ? null : serviceGroup,
        reason: reason.trim(),
        evidence: evidence.trim(),
        effectiveFrom,
      }).then(() => undefined),
    );
    // Clear ONLY on success — a refusal must never discard what the professional typed.
    if (ok) {
      setReason("");
      setEvidence("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="max-w-prose text-xs text-muted-foreground">{t("explainer")}</p>
        {chart.error ? <ErrorMessage error={chart.error} /> : null}
        <DataState
          loading={chart.loading}
          error={null}
          isEmpty={accounts.length === 0}
          emptyMessage={t("noAccounts")}
        >
          <div className="enter-content flex flex-col gap-3">
            <NativeSelect
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              aria-label={t("accountLabel")}
              disabled={busy}
            >
              <option value="">{t("accountPlaceholder")}</option>
              {accounts.map((account) => (
                <option key={account.account_code} value={account.account_code}>
                  {account.account_code} — {account.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={classification}
              onChange={(e) => setClassification(e.target.value as TurnoverClassification)}
              aria-label={t("classificationLabel")}
              disabled={busy}
            >
              {TURNOVER_CLASSIFICATIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`classification.${value}`)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={serviceGroup}
              onChange={(e) => setServiceGroup(e.target.value)}
              aria-label={t("serviceGroupLabel")}
              disabled={busy}
            >
              <option value="">{t("serviceGroupNone")}</option>
              {serviceGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </NativeSelect>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              aria-label={t("effectiveFromLabel")}
              disabled={busy}
              className="motion-fast h-8 w-fit rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {/* REAL `<label>`s, not a placeholder doubling as the accessible name (review-557,
                N8). A placeholder DISAPPEARS the moment the professional types, so a name
                borrowed from it is a name that vanishes exactly when someone reviewing what
                they wrote needs it — and a screen reader's announcement then depends on how
                much has been typed. The label persists; the placeholder stays as the hint it
                is. `reason` is required by the door (CLR10 on a blank one) and says so; the
                evidence field is required only on a watch-lowering move, which the DB decides,
                so its label says "if" rather than promising either way. */}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("reasonLabel")}
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("evidenceLabel")}
              <Textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder={t("evidencePlaceholder")}
                disabled={busy}
              />
            </label>
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() => void submit()}
              disabled={busy || !canSubmit}
            >
              {busy ? tc("loading") : t("submit")}
            </Button>
          </div>
        </DataState>
        {/* What this control still cannot do, said plainly: there is no read that lists a
            client's existing classifications back, so the panel records a decision and cannot
            yet show the history of decisions. */}
        <NotBuiltNote className="text-xs">{t("notBuilt")}</NotBuiltNote>
      </CardContent>
    </Card>
  );
}
