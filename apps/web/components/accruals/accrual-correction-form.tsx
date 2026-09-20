"use client";

// #936 — THE ACCRUAL CORRECTION FORM.
//
// A DEDICATED ROUTE, `/correct`, NEVER `/edit` — the same distinction `plan-revise-form.tsx`'s own
// header states for its `/revise` route: `clara.correct_accrual_adjustment` writes a SUCCESSOR
// accrual-detail row and supersedes the plan's live revision; it does not mutate the row on screen.
// The database's own append-only trigger admits exactly one update to the row being corrected — the
// one-way `corrected_by_accrual_id` stamp — and this form never touches it directly.
//
// FEWER FIELDS THAN CREATE, ON PURPOSE. `clara.correct_accrual_adjustment` takes no purpose, no
// authority and no schedule argument: the plan's purpose is unchanged, and the schedule
// (frequency/day_rule/day_of_month/timezone) and the authority window (effective_from/effective_to)
// are the LIVE revision's own, carried through server-side (the migration's own header — see
// packages/db/migrations/0284_accrual_correction.sql). This form therefore edits exactly the nine
// particulars `lib/work/accrual-draft.ts`'s `AccrualCorrectionDraft` names — amount, both account
// legs, the service period, the method, the instruction, the memo and the source document — and
// renders the frozen authority window as READ-ONLY information beside the term it brackets, never
// as a control this surface could send.
//
// A THIN LOADER OVER THE REAL VIEW (`plan-revise-form.tsx`'s own split): `AccrualCorrectionForm`
// reads the accrual first and mounts `AccrualCorrectionFormView` only once it has, so the view's
// state initialisers — which run ONCE — never seed themselves from an accrual that has not
// resolved. AN ALREADY-CORRECTED ACCRUAL SAYS SO RATHER THAN RENDERING A FORM THAT CAN ONLY REFUSE
// (裁-187's rule, the same one `plan-revise-form.tsx` applies to an ended plan): the door's own
// `accrual_already_corrected` refusal is answered here by never offering the control at all, with a
// link to the successor that already exists.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { StateBanner } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";
import { JournalBasisFields, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { EvidenceChooser, useEvidenceReads } from "@/components/accounting/evidence-chooser";
import { useFirmScope } from "@/components/firm-scope-provider";
import { AccrualBoundaryStatement } from "./accrual-statement";
import { methodLabel } from "./accruals-list";
import { listCoaAccounts } from "@/lib/journals/api";
import type { CoaAccountRow } from "@/lib/journals/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { isDoorRefusal } from "@/lib/doors";
import {
  correctAccrual, derivedAccrualLines, loadAccrual,
  type AccrualCorrected, type AccrualDetail,
} from "@/lib/accruals/api";
import {
  accrualFieldElementId, fieldForAccrualPath, firstInvalidAccrualField, toAccrualParticulars,
  validateAccrualCorrectionDraft,
  type AccrualCorrectionDraft, type AccrualFieldId, type AccrualIssue,
} from "@/lib/work/accrual-draft";
import { accrualDetailHref, accrualsHref } from "@/lib/navigation/tree";
import { hasNavigationAccess } from "@/lib/firm/navigation";
import type { NavigationScope } from "@/lib/navigation/tree";

/** Present for every governed accrual write: bookkeeper+, body-enforced inside
 *  `clara.correct_accrual_adjustment` exactly as it is inside `create_accrual_adjustment`. */
const ACCRUAL_WRITE_FLOOR = { minimumRole: "bookkeeper" } as const;

/** The row being corrected, as this form's starting draft. `memo` has no top-level field on
 *  `clara.get_accrual_adjustment`'s own answer — only the derived journal basis's `memo`, which
 *  DEFAULTS TO THE PURPOSE when none was stated (`clara._accrual_journal_basis`) — so a basis memo
 *  that still equals the purpose is read back as unstated rather than as a false restatement. */
function draftFromAccrual(row: AccrualDetail): AccrualCorrectionDraft {
  const basisMemo = row.plan.basis?.memo ?? "";
  return {
    expenseAccountCode: row.expense_account_code,
    liabilityAccountCode: row.liability_account_code,
    amountCents: row.amount_cents,
    servicePeriodStart: row.service_period_start,
    servicePeriodEnd: row.service_period_end,
    method: (row.method?.rule as AccrualCorrectionDraft["method"]) ?? "stated_amount",
    instruction: row.instruction,
    memo: basisMemo === row.purpose ? "" : basisMemo,
    sourceDocumentId: row.source_document_id ?? "",
  };
}

export function AccrualCorrectionForm({ clientId, accrualId }: { clientId: string; accrualId: string }) {
  const t = useTranslations("Accruals");
  const router = useRouter();
  const scope = useFirmScope();
  const accrual = useAsyncRead(() => loadAccrual(accrualId));
  const row = accrual.data;

  return (
    <div className="flex flex-col gap-6">
      <AccrualBoundaryStatement />
      <DataState
        loading={accrual.loading}
        error={accrual.error}
        isEmpty={row === null}
        emptyMessage={t("detailNotFound")}
      >
        {row === null ? null : row.corrected_by_accrual_id !== null ? (
          <StateBanner
            tone="neutral"
            title={t("alreadyCorrectedTitle")}
            action={
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={accrualDetailHref(clientId, row.corrected_by_accrual_id)}
              >
                {t("openSuccessor")}
              </Link>
            }
          >
            {t("alreadyCorrectedBody")}
          </StateBanner>
        ) : (
          <AccrualCorrectionFormView
            clientId={clientId}
            row={row}
            scope={scope}
            navigate={(href) => router.push(href)}
          />
        )}
      </DataState>
    </div>
  );
}

type Phase =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "rejected"; field: AccrualFieldId | null; code: string; reason: string | null; message: string }
  | { kind: "denied"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "lost"; message: string };

/** Exported for the cells; production reads scope from context and navigates with the router. */
export function AccrualCorrectionFormView({
  clientId,
  row,
  scope,
  navigate,
  submit = correctAccrual,
  session = sessionTokenAccessor,
  loadAccounts,
  newOpKey = () => crypto.randomUUID(),
}: {
  clientId: string;
  row: AccrualDetail;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof correctAccrual;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  newOpKey?: () => string;
}) {
  const t = useTranslations("Accruals");
  const go = navigate;

  // ONE STARTING DRAFT, from the row this component was handed — never re-seeded from a later
  // prop change (the same reason `plan-revise-form.tsx`'s thin loader exists): a re-render must
  // not silently discard what the preparer has already typed.
  const [draft, setDraft] = useState<AccrualCorrectionDraft>(() => draftFromAccrual(row));
  const [opKey, setOpKey] = useState(() => newOpKey());
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [showIssues, setShowIssues] = useState(false);
  const [resent, setResent] = useState(false);
  const [warning, setWarning] = useState<AccrualCorrected["overlap_warning"]>(null);

  const accountsRead = useAsyncRead<CoaAccountRow[]>(() =>
    loadAccounts ? loadAccounts() : listCoaAccounts(session, clientId));
  const evidence = useEvidenceReads(clientId, { session });

  const accounts = accountsRead.data ?? [];
  /** `null` while the chart has not been read — the unknown-account rule is SKIPPED then rather
   *  than guessed, the same reasoning `AccrualFormView`'s own `knownCodes` states. */
  const knownCodes = useMemo(
    () => (accountsRead.data === null
      ? null
      : new Set(accountsRead.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accountsRead.data],
  );

  // THE FIXED AUTHORITY WINDOW — read off the row, never off a control. `clara.
  // correct_accrual_adjustment` carries it through to the nested `revise_accounting_plan` call
  // unchanged, so a corrected term must still sit inside it.
  const window = { effectiveFrom: row.effective_from, effectiveTo: row.effective_to };

  const issues: AccrualIssue[] = showIssues ? validateAccrualCorrectionDraft(draft, window, knownCodes) : [];

  const lines = derivedAccrualLines({
    expenseAccountCode: draft.expenseAccountCode,
    liabilityAccountCode: draft.liabilityAccountCode,
    amountCents: draft.amountCents,
    servicePeriodStart: draft.servicePeriodStart,
    servicePeriodEnd: draft.servicePeriodEnd,
  });

  const busy = phase.kind === "saving";

  const fields = useRef(new Map<string, FieldNode>());
  const registerField = useCallback((field: AccrualFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);

  const focusTarget = useRef<AccrualFieldId | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusField = (field: AccrualFieldId) => {
    focusTarget.current = field;
    setFocusTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (focusTick === 0) return;
    const field = focusTarget.current;
    if (field !== null) fields.current.get(field)?.focus();
  }, [focusTick]);

  const set = <K extends keyof AccrualCorrectionDraft>(key: K, value: AccrualCorrectionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    // A CHANGED PARTICULAR IS A DIFFERENT DECISION (create form's own rule, unchanged here): the
    // op key is minted fresh, so a stale key can never be sent beside a figure it never covered.
    setOpKey(newOpKey());
    setResent(false);
    if (phase.kind === "rejected" || phase.kind === "failed" || phase.kind === "lost") {
      setPhase({ kind: "editing" });
    }
  };

  const applyFailure = (e: unknown) => {
    if (isDoorRefusal(e)) {
      if (e.code === "CLR04") {
        setPhase({ kind: "denied", message: e.message });
        return;
      }
      const detail = (e as { detail?: Record<string, unknown> | null }).detail;
      const rawField = typeof detail?.field === "string" ? detail.field : null;
      const field = fieldForAccrualPath(rawField);
      setPhase({ kind: "rejected", field, code: e.code, reason: e.reason ?? null, message: e.message });
      if (field !== null) focusField(field);
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    setPhase(/timeout|abort|network|fetch/i.test(message)
      ? { kind: "lost", message }
      : { kind: "failed", message });
  };

  const send = async (keyToUse: string) => {
    setPhase({ kind: "saving" });
    setWarning(null);
    try {
      const corrected = await submit({
        accrualId: row.accrual_id,
        accrual: toAccrualParticulars(draft),
        opKey: keyToUse,
      });
      if (corrected.overlap_warning !== null) {
        setWarning(corrected.overlap_warning);
        setPhase({ kind: "editing" });
        return;
      }
      // THE DESTINATION IS THE NEW ACCRUAL'S OWN ADDRESS, and it re-reads — the same
      // hydrate-never-trust rule `create`'s own submit follows.
      go(accrualDetailHref(clientId, corrected.accrual_id));
    } catch (e) {
      applyFailure(e);
    }
  };

  const onSubmit = async () => {
    setShowIssues(true);
    const found = validateAccrualCorrectionDraft(draft, window, knownCodes);
    if (found.length > 0) {
      const first = firstInvalidAccrualField(found);
      if (first !== null) focusField(first);
      return;
    }
    await send(opKey);
  };

  const message = (field: AccrualFieldId): string | null => {
    const issue = issues.find((i) => i.field === field);
    if (issue !== undefined) return issueText(t, issue.code);
    if (phase.kind === "rejected" && phase.field === field) return phase.message;
    return null;
  };

  if (!hasNavigationAccess(scope, ACCRUAL_WRITE_FLOOR)) {
    return <StateBanner tone="warning" title={t("deniedTitle")}>{t("deniedBody")}</StateBanner>;
  }

  return (
    <div className="flex flex-col gap-6">
      {warning === null ? null : (
        <StateBanner tone="warning" title={t("overlapTitle")} action={
          <Button variant="outline" size="sm" onClick={() => go(accrualsHref(clientId))}>
            {t("overlapContinue")}
          </Button>
        }>
          {t("overlapBody", { templates: warning.templates.map((x) => x.name).join(", ") })}
        </StateBanner>
      )}
      {phase.kind === "denied" ? (
        <StateBanner tone="warning" title={t("deniedTitle")}>{phase.message}</StateBanner>
      ) : null}
      {phase.kind === "failed" ? (
        <StateBanner tone="error" title={t("failedTitle")} action={
          <Button variant="outline" size="sm" onClick={() => void send(opKey)}>{t("retry")}</Button>
        }>
          {phase.message}
        </StateBanner>
      ) : null}
      {phase.kind === "lost" ? (
        <StateBanner tone="error" title={t("lostTitle")} action={
          resent ? undefined : (
            <Button variant="outline" size="sm" onClick={() => { setResent(true); void send(opKey); }}>
              {t("lostResend")}
            </Button>
          )
        }>
          {resent ? t("lostTwice") : t("lostBody")}
        </StateBanner>
      ) : null}
      {phase.kind === "rejected" && phase.field === null ? (
        <StateBanner
          tone="error"
          title={t("refusedTitle")}
          code={<>{phase.code}{phase.reason ? ` · ${phase.reason}` : ""}</>}
        >
          {phase.message}
        </StateBanner>
      ) : null}

      {/* THE FROZEN FACTS, read-only. Neither this form nor the door it calls can move them. */}
      <section className="flex flex-col gap-2">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t("fieldPurpose")}</dt>
            <dd className="text-sm">{row.purpose}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t("factWindow")}</dt>
            <dd className="text-sm">{t("windowFromTo", { from: row.effective_from, to: row.effective_to })}</dd>
          </div>
        </dl>
        <p className="max-w-prose text-xs text-muted-foreground">{t("correctionFrozenNote")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("termHeading")}</h3>
        <p className="max-w-prose text-xs text-muted-foreground">{t("termNote")}</p>
        <div className="flex flex-wrap gap-3">
          <Field
            id={accrualFieldElementId("servicePeriodStart")}
            label={t("fieldServicePeriodStart")}
            error={message("servicePeriodStart")}
            className="min-w-40 flex-1"
          >
            <Input
              id={accrualFieldElementId("servicePeriodStart")}
              ref={(node) => registerField("servicePeriodStart", node)}
              type="date"
              value={draft.servicePeriodStart}
              disabled={busy}
              aria-invalid={message("servicePeriodStart") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("servicePeriodStart")}-error`}
              onChange={(e) => set("servicePeriodStart", e.target.value)}
            />
          </Field>
          <Field
            id={accrualFieldElementId("servicePeriodEnd")}
            label={t("fieldServicePeriodEnd")}
            error={message("servicePeriodEnd")}
            className="min-w-40 flex-1"
          >
            <Input
              id={accrualFieldElementId("servicePeriodEnd")}
              ref={(node) => registerField("servicePeriodEnd", node)}
              type="date"
              value={draft.servicePeriodEnd}
              disabled={busy}
              aria-invalid={message("servicePeriodEnd") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("servicePeriodEnd")}-error`}
              onChange={(e) => set("servicePeriodEnd", e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">{t("fieldMethod")}</h4>
          <p className="text-sm">{methodLabel(t, draft.method)}</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("amountHeading")}</h3>
        <div className="flex flex-wrap gap-3">
          <Field
            id={accrualFieldElementId("amountCents")}
            label={t("fieldAmount")}
            error={message("amountCents")}
            className="min-w-40 flex-1"
          >
            <MoneyInput
              id={accrualFieldElementId("amountCents")}
              ref={(node) => registerField("amountCents", node)}
              cents={draft.amountCents}
              mode="unsigned"
              disabled={busy}
              aria-invalid={message("amountCents") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("amountCents")}-error`}
              onValueChange={(change) => {
                if (change.ok) set("amountCents", change.cents ?? 0);
              }}
            />
          </Field>
          <Field
            id={accrualFieldElementId("expenseAccountCode")}
            label={t("fieldExpenseLeg")}
            error={message("expenseAccountCode")}
            className="min-w-40 flex-1"
          >
            <NativeSelect
              id={accrualFieldElementId("expenseAccountCode")}
              ref={(node) => registerField("expenseAccountCode", node)}
              value={draft.expenseAccountCode}
              disabled={busy}
              aria-invalid={message("expenseAccountCode") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("expenseAccountCode")}-error`}
              onChange={(e) => set("expenseAccountCode", e.target.value)}
            >
              <option value="">{t("accountChoose")}</option>
              {accounts.filter((a) => a.is_active && a.account_type === "expense").map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} {a.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id={accrualFieldElementId("liabilityAccountCode")}
            label={t("fieldLiabilityLeg")}
            error={message("liabilityAccountCode")}
            hint={t("liabilityHint")}
            className="min-w-40 flex-1"
          >
            <NativeSelect
              id={accrualFieldElementId("liabilityAccountCode")}
              ref={(node) => registerField("liabilityAccountCode", node)}
              value={draft.liabilityAccountCode}
              disabled={busy}
              aria-invalid={message("liabilityAccountCode") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("liabilityAccountCode")}-error`}
              onChange={(e) => set("liabilityAccountCode", e.target.value)}
            >
              <option value="">{t("accountChoose")}</option>
              {accounts.filter((a) => a.is_active && a.account_type === "liability").map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} {a.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{t("derivedLinesNote")}</p>
        <JournalBasisFields
          lines={lines}
          onChange={() => {}}
          accounts={accounts}
          issues={[]}
          disabled
          registerField={() => {}}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("instructionHeading")}</h3>
        <Field id={accrualFieldElementId("instruction")} label={t("fieldInstruction")} error={message("instruction")} hint={t("instructionHint")}>
          <Textarea
            id={accrualFieldElementId("instruction")}
            ref={(node) => registerField("instruction", node)}
            value={draft.instruction}
            disabled={busy}
            aria-invalid={message("instruction") === null ? undefined : true}
            aria-describedby={`${accrualFieldElementId("instruction")}-error`}
            onChange={(e) => set("instruction", e.target.value)}
          />
        </Field>
        <Field id={accrualFieldElementId("memo")} label={t("fieldMemo")} error={message("memo")} hint={t("memoHint")}>
          <Input
            id={accrualFieldElementId("memo")}
            ref={(node) => registerField("memo", node)}
            value={draft.memo}
            disabled={busy}
            onChange={(e) => set("memo", e.target.value)}
          />
        </Field>
        <EvidenceChooser
          clientId={clientId}
          reads={evidence}
          value={draft.sourceDocumentId === "" ? null : draft.sourceDocumentId}
          onChange={(documentId) => set("sourceDocumentId", documentId ?? "")}
          disabled={busy}
          invalid={message("sourceDocumentId") !== null}
          errorText={message("sourceDocumentId") ?? ""}
          registerField={(node) => registerField("sourceDocumentId", node)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => void onSubmit()}>
          {busy ? t("saving") : t("submitCorrect")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => go(accrualDetailHref(clientId, row.accrual_id))}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}


function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {hint === undefined ? null : <p className="max-w-prose text-xs text-muted-foreground">{hint}</p>}
      {children}
      <p id={`${id}-error`} className="text-xs text-error" role={error === null ? undefined : "alert"}>
        {error ?? ""}
      </p>
    </div>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function issueText(t: Translate, code: string): string {
  const codes: Record<string, string> = {
    expenseAccountRequired: t("issueExpenseAccountRequired"),
    liabilityAccountRequired: t("issueLiabilityAccountRequired"),
    accountUnknown: t("issueAccountUnknown"),
    accountsNotDistinct: t("issueAccountsNotDistinct"),
    amountRequired: t("issueAmountRequired"),
    silentTerm: t("issueSilentTerm"),
    servicePeriodOrder: t("issueServicePeriodOrder"),
    windowBeforeTerm: t("issueWindowBeforeTerm"),
    windowAfterTerm: t("issueWindowAfterTerm"),
    instructionRequired: t("issueInstructionRequired"),
  };
  return codes[code] ?? code;
}
