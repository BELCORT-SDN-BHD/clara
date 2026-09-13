"use client";

// #640 — THE PLAN FORM, used for BOTH create and revise.
//
// ONE FORM, TWO SUBMITS, because the two are the same decision made at different times: "this is
// the schedule and this is what it posts". Revising is not an edit — `clara.revise_accounting_plan`
// SUPERSEDES the live revision and writes a new one, and past occurrences keep naming the revision
// they ran under — so the form is pre-filled from the live revision and the page above says which
// act the submit performs.
//
// THE AUTHORITY IS A CHOICE FROM REAL ROWS, NOT A TEXT BOX. `clara.create_accounting_plan`
// RESOLVES `authority_ref` against `clara.accounting_work` in the SAME firm and the SAME client;
// a Knowledge preference, a calculation policy or a remembered chat resolves to nothing and the
// door refuses `authority_ref_unresolved`. Offering a free-text field would be offering a control
// whose only possible outcome is that refusal, so the picker lists this client's own Work — the
// instructions that actually exist — and the form refuses to submit without one. That is #640's
// "a sufficiently scoped instruction or existing explicit authority" made operable rather than
// asserted. A REVISION offers no picker at all: the authority is frozen on the plan row.
//
// THE BASIS IS THE COMPOSER'S OWN EDITOR AND THE COMPOSER'S OWN VALIDATOR — `JournalBasisFields`
// and `validateJournalDraft` (lib/work/journal-basis.ts), not a second money surface. Exact cents
// through `MoneyInput`, no floating point anywhere, and the same per-field issue vocabulary, so a
// line that would be refused at admission is refused here beside the control that holds it.
//
// THE POSTING DATE ON THE STORED BASIS IS `effective_from`, AND IT IS A PLACEHOLDER. Every
// occurrence replaces it with its own due date (`clara._plan_occurrence_basis`), so the form does
// not offer a posting-date control at all — a date the schedule overrides would be a control that
// lies. The detail surface says the same thing in words beside the basis table.
//
// A FAILED SUBMIT FOCUSES THE FIRST INVALID CONTROL and never clears the draft (appendix C §3,
// "Field validation": preserve user input, focus the first invalid field).

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { StateBanner } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";
import { ErrorMessage } from "@/components/firm/data-state";
import { JournalBasisFields, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { PlanBoundaryStatement } from "./plan-statement";
import { listCoaAccounts } from "@/lib/journals/api";
import { listAccountingWork } from "@/lib/work/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  createPlan, revisePlan, toPlanBasis,
  type PlanCreated, type PlanDetail, type PlanKind, type PlanOverlapWarning,
} from "@/lib/plans/api";
import {
  PLAN_DAY_OF_MONTH_MAX, PLAN_DAY_RULES, PLAN_FREQUENCIES, PLAN_KINDS, PLAN_TIMEZONE,
  dayOfMonthForWire, effectiveToForWire, firstInvalidPlanField, planFieldElementId,
  validatePlanSchedule, type PlanFieldId, type PlanIssue, type PlanScheduleDraft,
} from "@/lib/plans/schedule";
import {
  firstInvalidField, validateJournalDraft,
  type JournalDraftLine, type JournalFieldId, type JournalIssue,
} from "@/lib/work/journal-basis";
import { planDetailHref, plansHref } from "@/lib/navigation/tree";

const EMPTY_LINES: JournalDraftLine[] = [
  { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
  { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
];

export function PlanForm({
  clientId,
  /** Present for a REVISION: the plan whose live revision this form supersedes. */
  plan = null,
}: {
  clientId: string;
  plan?: PlanDetail | null;
}) {
  const t = useTranslations("Plans");
  const router = useRouter();
  const revising = plan !== null;
  const live = plan?.live_revision ?? null;

  const accounts = useAsyncRead(() => listCoaAccounts(sessionTokenAccessor, clientId));
  const instructions = useAsyncRead(() => listAccountingWork(clientId));

  const [schedule, setSchedule] = useState<PlanScheduleDraft>({
    purpose: plan?.purpose ?? "",
    kind: (plan?.kind as PlanKind) ?? "recurring_journal",
    authorityWorkId: "",
    frequency: live?.frequency ?? "monthly",
    dayRule: live?.day_rule ?? "day_of_month",
    dayOfMonth: live?.day_of_month === null || live?.day_of_month === undefined ? "1" : String(live.day_of_month),
    effectiveFrom: live?.effective_from ?? "",
    effectiveTo: live?.effective_to ?? "",
  });
  const [memo, setMemo] = useState(live?.basis.memo ?? "");
  const [lines, setLines] = useState<JournalDraftLine[]>(
    live === null
      ? EMPTY_LINES
      : live.basis.lines.map((l) => ({
          account_code: l.account_code,
          debit_cents: l.debit_cents,
          credit_cents: l.credit_cents,
          description: l.description ?? "",
        })),
  );
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [warning, setWarning] = useState<PlanOverlapWarning | null>(null);

  // ONE OP KEY PER SUBMITTED DECISION: minted on the first attempt and reused for every retry of
  // the SAME figures, so a lost response replays through `clara._reserve_op` rather than asking a
  // second question. Changing a field renews it — that is a different decision.
  const opKeyRef = useRef<string | null>(null);
  const renewKey = () => {
    opKeyRef.current = null;
  };
  const opKey = () => {
    if (opKeyRef.current === null) opKeyRef.current = crypto.randomUUID();
    return opKeyRef.current;
  };

  const knownAccounts = useMemo(
    () => (accounts.data === null ? null : new Set(accounts.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accounts.data],
  );

  // A REVISION CARRIES THE PLAN'S AUTHORITY FLOOR (0193's `effective_from_before_authority`); a
  // CREATE is the act that SETS it, so there is nothing to be below.
  const authorityFrom = revising && plan !== null ? plan.authority_from : null;
  const scheduleIssues: PlanIssue[] = validatePlanSchedule(schedule, { requireAuthority: !revising, authorityFrom });
  const basisIssues: JournalIssue[] = validateJournalDraft(
    { postingDate: schedule.effectiveFrom, memo, lines },
    knownAccounts,
  );

  const fields = useRef(new Map<string, FieldNode>());
  const registerScheduleField = (field: PlanFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(`s:${field}`);
    else fields.current.set(`s:${field}`, node);
  };
  const registerBasisField = (field: JournalFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(`b:${field}`);
    else fields.current.set(`b:${field}`, node);
  };

  const scheduleMessage = (field: PlanFieldId): string | null => {
    if (!attempted) return null;
    const issue = scheduleIssues.find((i) => i.field === field);
    if (issue === undefined) return null;
    const codes: Record<string, string> = {
      purposeRequired: t("issuePurposeRequired"),
      authorityRequired: t("issueAuthorityRequired"),
      frequencyInvalid: t("issueFrequencyInvalid"),
      dayRuleInvalid: t("issueDayRuleInvalid"),
      dayOfMonthRange: t("issueDayOfMonthRange"),
      effectiveFromRequired: t("issueEffectiveFromRequired"),
      effectiveFromInvalid: t("issueEffectiveFromInvalid"),
      effectiveFromBeforeAuthority: t("issueEffectiveFromBeforeAuthority", { date: authorityFrom ?? "" }),
      effectiveToInvalid: t("issueEffectiveToInvalid"),
      effectiveToBeforeFrom: t("issueEffectiveToBeforeFrom"),
      reversalCollides: t("issueReversalCollides"),
    };
    return codes[issue.code] ?? issue.code;
  };

  const submit = async () => {
    setAttempted(true);
    const s = validatePlanSchedule(schedule, { requireAuthority: !revising, authorityFrom });
    const b = validateJournalDraft({ postingDate: schedule.effectiveFrom, memo, lines }, knownAccounts);
    if (s.length > 0) {
      fields.current.get(`s:${firstInvalidPlanField(s)}`)?.focus();
      return;
    }
    if (b.length > 0) {
      fields.current.get(`b:${firstInvalidField(b)}`)?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const basis = toPlanBasis({ postingDate: schedule.effectiveFrom, memo, lines });
      if (revising && plan !== null) {
        await revisePlan({
          planId: plan.plan_id,
          kind: schedule.kind as PlanKind,
          frequency: schedule.frequency as never,
          dayRule: schedule.dayRule as never,
          dayOfMonth: dayOfMonthForWire(schedule),
          timezone: PLAN_TIMEZONE,
          effectiveFrom: schedule.effectiveFrom,
          effectiveTo: effectiveToForWire(schedule),
          basis,
          opKey: opKey(),
        });
        router.push(planDetailHref(clientId, plan.plan_id));
        return;
      }
      const created: PlanCreated = await createPlan({
        clientId,
        kind: schedule.kind as PlanKind,
        purpose: schedule.purpose.trim(),
        authorityRef: { kind: "accounting_work", id: schedule.authorityWorkId },
        frequency: schedule.frequency as never,
        dayRule: schedule.dayRule as never,
        dayOfMonth: dayOfMonthForWire(schedule),
        timezone: PLAN_TIMEZONE,
        effectiveFrom: schedule.effectiveFrom,
        effectiveTo: effectiveToForWire(schedule),
        basis,
        opKey: opKey(),
      });
      if (created.overlap_warning !== null) {
        // ADVISORY, PERSISTENT, AND IT DOES NOT BLOCK THE NAVIGATION AWAY — it is shown here and
        // the plan exists. A toast would be the one thing appendix C forbids for a boundary a
        // person has to act on.
        setWarning(created.overlap_warning);
        setBusy(false);
        return;
      }
      router.push(planDetailHref(clientId, created.plan_id));
    } catch (e) {
      setFailure(e);
      setBusy(false);
    }
  };

  const patch = (next: Partial<PlanScheduleDraft>) => {
    renewKey();
    setSchedule((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="flex flex-col gap-6">
      <PlanBoundaryStatement />
      {warning === null ? null : (
        <StateBanner tone="warning" title={t("overlapTitle")} action={
          <Button variant="outline" size="sm" onClick={() => router.push(plansHref(clientId))}>
            {t("overlapContinue")}
          </Button>
        }>
          {t("overlapBody", { templates: warning.templates.map((x) => x.name).join(", ") })}
        </StateBanner>
      )}
      {failure === null ? null : <ErrorMessage error={failure} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={planFieldElementId("purpose")}>{t("fieldPurpose")}</label>
          <Input
            id={planFieldElementId("purpose")}
            ref={(node) => registerScheduleField("purpose", node)}
            value={schedule.purpose}
            disabled={busy || revising}
            aria-invalid={scheduleMessage("purpose") === null ? undefined : true}
            aria-describedby={`${planFieldElementId("purpose")}-error`}
            onChange={(e) => patch({ purpose: e.target.value })}
          />
          {/* A REVISION CANNOT MOVE THE PURPOSE: `clara.accounting_plans` freezes it, so the
              control is read-only rather than a field whose edit would be refused. */}
          {revising ? <p className="text-xs text-muted-foreground">{t("purposeFrozen")}</p> : null}
          <FieldError id={`${planFieldElementId("purpose")}-error`}>{scheduleMessage("purpose")}</FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={planFieldElementId("kind")}>{t("fieldKind")}</label>
          <NativeSelect
            id={planFieldElementId("kind")}
            ref={(node) => registerScheduleField("kind", node)}
            value={schedule.kind}
            disabled={busy || revising}
            onChange={(e) => patch({ kind: e.target.value })}
          >
            {PLAN_KINDS.map((k) => (
              <option key={k} value={k}>{k === "recurring_journal" ? t("kindRecurring") : t("kindReversing")}</option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("kindNote")}</p>
        </div>

        {revising ? null : (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={planFieldElementId("authority")}>{t("fieldAuthority")}</label>
            <p className="max-w-prose text-xs text-muted-foreground">{t("authorityNote")}</p>
            <DataState
              loading={instructions.loading}
              error={instructions.error}
              isEmpty={(instructions.data?.rows ?? []).length === 0}
              emptyMessage={t("authorityEmpty")}
            >
              <NativeSelect
                id={planFieldElementId("authority")}
                ref={(node) => registerScheduleField("authority", node)}
                value={schedule.authorityWorkId}
                disabled={busy}
                aria-invalid={scheduleMessage("authority") === null ? undefined : true}
                aria-describedby={`${planFieldElementId("authority")}-error`}
                onChange={(e) => patch({ authorityWorkId: e.target.value })}
              >
                <option value="">{t("authorityChoose")}</option>
                {(instructions.data?.rows ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.basis?.memo ?? w.intent_key} — {String(w.created_at).slice(0, 10)}
                  </option>
                ))}
              </NativeSelect>
            </DataState>
            <FieldError id={`${planFieldElementId("authority")}-error`}>{scheduleMessage("authority")}</FieldError>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={planFieldElementId("frequency")}>{t("fieldFrequency")}</label>
            <NativeSelect
              id={planFieldElementId("frequency")}
              ref={(node) => registerScheduleField("frequency", node)}
              value={schedule.frequency}
              disabled={busy}
              onChange={(e) => patch({ frequency: e.target.value })}
            >
              {PLAN_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f === "monthly" ? t("frequencyMonthly") : f === "quarterly" ? t("frequencyQuarterly") : t("frequencyAnnual")}
                </option>
              ))}
            </NativeSelect>
            <FieldError id={`${planFieldElementId("frequency")}-error`}>{scheduleMessage("frequency")}</FieldError>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={planFieldElementId("dayRule")}>{t("fieldDayRule")}</label>
            <NativeSelect
              id={planFieldElementId("dayRule")}
              ref={(node) => registerScheduleField("dayRule", node)}
              value={schedule.dayRule}
              disabled={busy}
              onChange={(e) => patch({ dayRule: e.target.value })}
            >
              {PLAN_DAY_RULES.map((r) => (
                <option key={r} value={r}>{r === "day_of_month" ? t("dayRuleDayOfMonth") : t("dayRuleLastDay")}</option>
              ))}
            </NativeSelect>
            <FieldError id={`${planFieldElementId("dayRule")}-error`}>{scheduleMessage("dayRule")}</FieldError>
          </div>
          {schedule.dayRule === "day_of_month" ? (
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label className="text-sm font-medium" htmlFor={planFieldElementId("dayOfMonth")}>{t("fieldDayOfMonth")}</label>
              <Input
                id={planFieldElementId("dayOfMonth")}
                ref={(node) => registerScheduleField("dayOfMonth", node)}
                inputMode="numeric"
                value={schedule.dayOfMonth}
                disabled={busy}
                aria-invalid={scheduleMessage("dayOfMonth") === null ? undefined : true}
                aria-describedby={`${planFieldElementId("dayOfMonth")}-error`}
                onChange={(e) => patch({ dayOfMonth: e.target.value })}
              />
              {/* THE CEILING IS THE DATABASE'S AND IT IS EXPLAINED, not merely enforced. */}
              <p className="text-xs text-muted-foreground">{t("dayOfMonthNote", { max: PLAN_DAY_OF_MONTH_MAX })}</p>
              <FieldError id={`${planFieldElementId("dayOfMonth")}-error`}>{scheduleMessage("dayOfMonth")}</FieldError>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={planFieldElementId("effectiveFrom")}>{t("fieldEffectiveFrom")}</label>
            <Input
              id={planFieldElementId("effectiveFrom")}
              ref={(node) => registerScheduleField("effectiveFrom", node)}
              type="date"
              value={schedule.effectiveFrom}
              disabled={busy}
              aria-invalid={scheduleMessage("effectiveFrom") === null ? undefined : true}
              aria-describedby={`${planFieldElementId("effectiveFrom")}-error`}
              onChange={(e) => patch({ effectiveFrom: e.target.value })}
            />
            <FieldError id={`${planFieldElementId("effectiveFrom")}-error`}>{scheduleMessage("effectiveFrom")}</FieldError>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={planFieldElementId("effectiveTo")}>{t("fieldEffectiveTo")}</label>
            <Input
              id={planFieldElementId("effectiveTo")}
              ref={(node) => registerScheduleField("effectiveTo", node)}
              type="date"
              value={schedule.effectiveTo}
              disabled={busy}
              aria-invalid={scheduleMessage("effectiveTo") === null ? undefined : true}
              aria-describedby={`${planFieldElementId("effectiveTo")}-error`}
              onChange={(e) => patch({ effectiveTo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("effectiveToNote")}</p>
            <FieldError id={`${planFieldElementId("effectiveTo")}-error`}>{scheduleMessage("effectiveTo")}</FieldError>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t("timezoneNote", { timezone: PLAN_TIMEZONE })}</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="plan-memo">{t("fieldMemo")}</label>
          <Textarea
            id="plan-memo"
            value={memo}
            disabled={busy}
            aria-invalid={attempted && basisIssues.some((i) => i.field === "memo") ? true : undefined}
            onChange={(e) => {
              renewKey();
              setMemo(e.target.value);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("basisDateNote")}</p>
        {accounts.error !== null ? <StateBanner tone="warning">{t("accountsUnavailable")}</StateBanner> : null}
        <JournalBasisFields
          lines={lines}
          onChange={(next) => {
            renewKey();
            setLines(next);
          }}
          accounts={accounts.data ?? []}
          issues={attempted ? basisIssues : []}
          disabled={busy}
          registerField={registerBasisField}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? t("saving") : revising ? t("submitRevise") : t("submitCreate")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => router.push(plansHref(clientId))}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/** One control's error, rendered BESIDE the control and wired to it by `aria-describedby` — the
 *  same shape `journal-basis-fields.tsx` uses, so a plan field and a basis field read alike. */
function FieldError({ id, children }: { id: string; children: string | null }) {
  return (
    <p id={id} className="text-xs text-error" role={children === null ? undefined : "alert"}>
      {children ?? ""}
    </p>
  );
}
