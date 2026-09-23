"use client";

// #652 — THE ACCRUAL CONFIGURATION FORM.
//
// A ROUTE RATHER THAN A DIALOG, and appendix C §4 is explicit about why: "a long source comparison
// or multi-section accounting form uses a full detail destination". An accrual carries a purpose,
// an authority, two account legs, an amount, a SERVICE PERIOD, a selection method, an instruction
// and a schedule; putting that in an overlay would make a half-typed term one Escape away from gone.
//
// IT REFUSES BEFORE ADMISSION, which is this ticket's own ruling and the estate's standing one
// (`chatTurn.v19.tools.ts:37-41`): a missing particular is refused HERE, at the control that holds
// it, never admitted hoping a Work question completes the basis — because an admitted Work's basis
// is immutable. The PARK arm (a Work admitted from a document or an instruction whose term is
// genuinely absent) belongs to a `claraWork` successor and is not built here.
//
// THE AUTHORITY IS A CHOICE FROM REAL ROWS, NOT A TEXT BOX. `clara.create_accrual_adjustment`
// resolves `authority_ref` against `clara.accounting_work` in the SAME firm and the SAME client; a
// Knowledge preference, a calculation policy or a remembered chat resolves to nothing and the door
// refuses `authority_ref_unresolved`. Offering a free-text field would be offering a control whose
// only possible outcome is that refusal.
//
// THE TERM HAS NO "SOURCE" CONTROL, AND THAT ABSENCE IS THE LAW. `term_source` is always
// `human_stated`: a period a MODEL read off a document may not enter a durable record (0140's table
// comment, CONFIRMED AS LAW), and the only thing this surface can send is a term a person typed.
//
// THE POSTED LINES ARE DERIVED AND DISABLED. The preparer states an amount and two accounts; the
// two journal lines follow, rendered through the composer's OWN grid (`JournalBasisFields`) in its
// disabled form so what is previewed is what `clara._accrual_journal_basis` will build. Nothing
// this component computes is ever sent — the door derives its own basis and is the authority.
//
// A FAILED SUBMIT FOCUSES THE FIRST INVALID CONTROL AND NEVER CLEARS THE DRAFT (appendix C §3,
// "Field validation": preserve user input, focus the first invalid field). Every business refusal
// is a persistent `StateBanner`, never a toast.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { StateBanner } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";
import { JournalBasisFields, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { EvidenceChooser, useEvidenceReads } from "@/components/accounting/evidence-chooser";
import { useFirmScope } from "@/components/firm-scope-provider";
import { AccrualBoundaryStatement } from "./accrual-statement";
import { listCoaAccounts } from "@/lib/journals/api";
import type { CoaAccountRow } from "@/lib/journals/types";
import { listPlanAuthorityWork, type PlanAuthorityWork } from "@/lib/plans/api";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { isDoorRefusal } from "@/lib/doors";
import {
  ACCRUAL_DAY_OF_MONTH_MAX, ACCRUAL_DAY_RULES, ACCRUAL_FREQUENCIES, ACCRUAL_METHODS,
  accrualScheduleDues, createAccrual, derivedAccrualLines, type AccrualCreated,
} from "@/lib/accruals/api";
import { AccrualPeriodAmountsBlock } from "./accrual-period-amounts";
import {
  accrualDraftKey, accrualFieldElementId, clearAccrualDraft, emptyAccrualDraft,
  fieldForAccrualPath, firstInvalidAccrualField, readAccrualDraft, toAccrualParticulars,
  validateAccrualDraft, writeAccrualDraft,
  type AccrualDraft, type AccrualFieldId, type AccrualIssue, type StoredAccrualDraft,
} from "@/lib/work/accrual-draft";
import { defaultDraftStorage, type DraftStorage, type JournalDraftScope } from "@/lib/work/journal-draft";
import { accrualDetailHref, accrualsHref } from "@/lib/navigation/tree";
import { hasNavigationAccess } from "@/lib/firm/navigation";
import type { NavigationScope } from "@/lib/navigation/tree";

/** Everything the surface can be, as ONE value — so two states can never be painted at once. */
type Phase =
  | { kind: "editing" }
  | { kind: "saving" }
  /** The door refused. `field` is already mapped onto a control, or null for a form-level one. */
  | { kind: "rejected"; field: AccrualFieldId | null; code: string; reason: string | null; message: string }
  /** A viewer, or anyone the door refused on authority. The route still renders — an address a
   *  human typed deserves an explanation, not a blank. */
  | { kind: "denied"; message: string }
  /** Transport, not a refusal: nothing was decided, and the draft is intact. */
  | { kind: "failed"; message: string }
  /** No answer at all. The draft and its op key are intact, so the SAME decision can be re-sent
   *  exactly once more — `clara._reserve_op` replays it rather than making a second accrual. */
  | { kind: "lost"; message: string };

export function AccrualForm({ clientId }: { clientId: string }) {
  // `useRouter` IS CALLED HERE AND NOWHERE BELOW — next/navigation's hook THROWS outside an App
  // Router tree, so a View that called it could not be mounted by a node cell at all. The wrapper
  // owns the router; the View takes a plain callback (`journal-composer.tsx`'s own split).
  const router = useRouter();
  return (
    <AccrualFormView
      clientId={clientId}
      scope={useFirmScope()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** Exported for the cells; production reads scope from context and navigates with the router. */
/** The role this lane's WRITE door holds inside its own body (`clara.create_accrual_adjustment`,
 *  `_human_ctx(role_rank('bookkeeper'))`), stated once here and judged by the registry's own
 *  predicate. The database is the authority; this is what stops the surface offering a control
 *  that could only ever refuse. */
const ACCRUAL_WRITE_FLOOR = { minimumRole: "bookkeeper" } as const;

export function AccrualFormView({
  clientId,
  scope,
  navigate,
  submit = createAccrual,
  storage,
  session = sessionTokenAccessor,
  loadAccounts,
  loadAuthorities,
  newOpKey = () => crypto.randomUUID(),
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof createAccrual;
  storage?: DraftStorage | null;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadAuthorities?: () => Promise<PlanAuthorityWork>;
  newOpKey?: () => string;
}) {
  const t = useTranslations("Accruals");
  const go = navigate;

  // THE DRAFT SCOPE, or null. A caller whose firm/user could not be read does NOT get a partial key
  // — it gets no persistence at all, and the form says so rather than promising a reload recovery
  // it cannot deliver (§3, "Do not promise reload recovery from memory-only state").
  const draftScope: JournalDraftScope | null = useMemo(
    () => (scope.firm_id && scope.user_id ? { userId: scope.user_id, firmId: scope.firm_id, clientId } : null),
    [scope.firm_id, scope.user_id, clientId],
  );
  const store = storage === undefined ? defaultDraftStorage() : storage;

  // ONE LAZY INITIALISER, so the restore happens before the first paint rather than as an effect
  // that would flash an empty form first.
  const [restored] = useState<StoredAccrualDraft | null>(
    () => (draftScope === null ? null : readAccrualDraft(draftScope, store)));
  const [opKey, setOpKey] = useState(() => restored?.opKey ?? newOpKey());
  const [draft, setDraft] = useState<AccrualDraft>(() => restored?.draft ?? emptyAccrualDraft());
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  /** Issues are shown only AFTER a submit attempt — a form that reds every field before anyone has
   *  typed is telling a human off for not having started. */
  const [showIssues, setShowIssues] = useState(false);
  /** The lost-response arm re-sends the SAME key exactly once. A second silence is a question for a
   *  human, not a third attempt. */
  const [resent, setResent] = useState(false);
  const [warning, setWarning] = useState<AccrualCreated["overlap_warning"]>(null);

  const accountsRead = useAsyncRead<CoaAccountRow[]>(() =>
    loadAccounts ? loadAccounts() : listCoaAccounts(session, clientId));
  const authorities = useAsyncRead<PlanAuthorityWork>(() =>
    loadAuthorities ? loadAuthorities() : listPlanAuthorityWork(clientId, { session }));
  const evidence = useEvidenceReads(clientId, { session });

  const accounts = accountsRead.data ?? [];
  /** `null` while the chart has not been read — the unknown-account rule is SKIPPED then rather
   *  than guessed: refusing a code because a read has not returned would be the form inventing a
   *  rule the database does not have. */
  const knownCodes = useMemo(
    () => (accountsRead.data === null
      ? null
      : new Set(accountsRead.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accountsRead.data],
  );

  const issues: AccrualIssue[] = useMemo(
    () => (showIssues ? validateAccrualDraft(draft, knownCodes) : []),
    [showIssues, draft, knownCodes],
  );

  // #937 — the due dates THIS schedule produces, which the per-period block offers rather than
  // asking a preparer to type. Recomputed from the schedule controls, so moving the day rule moves
  // the list the same keystroke.
  const dues = useMemo(
    () => accrualScheduleDues(draft.frequency, draft.dayRule,
      draft.dayRule === "day_of_month" ? Number(draft.dayOfMonth.trim()) : null,
      draft.effectiveFrom, draft.effectiveTo),
    [draft.frequency, draft.dayRule, draft.dayOfMonth, draft.effectiveFrom, draft.effectiveTo],
  );

  // THE PREVIEW SHOWS THE FIRST PERIOD THAT WILL POST, not the window's total. Under
  // `stated_period_amount` the accrual's own `amount_cents` is the TOTAL and no entry ever carries
  // it; previewing it would be showing a line the ledger will not write.
  const previewPeriod = draft.method === "stated_period_amount"
    ? [...draft.periodAmounts].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
    : null;
  const lines = useMemo(
    () => derivedAccrualLines({
      expenseAccountCode: draft.expenseAccountCode,
      liabilityAccountCode: draft.liabilityAccountCode,
      amountCents: previewPeriod === null ? draft.amountCents : previewPeriod.amountCents,
      servicePeriodStart: draft.servicePeriodStart,
      servicePeriodEnd: draft.servicePeriodEnd,
      periodDueDate: previewPeriod?.dueDate ?? null,
    }).map((l) => ({ ...l, description: l.description })),
    [draft.expenseAccountCode, draft.liabilityAccountCode, draft.amountCents,
      draft.servicePeriodStart, draft.servicePeriodEnd, previewPeriod],
  );

  // PERSIST ON EVERY EDIT. Not debounced: the payload is small, the storage is synchronous, and a
  // debounce is exactly how a draft goes missing when a tab is closed a moment after the last
  // keystroke. The outcome is STATE, not a ref, so "this browser is not keeping your draft" can
  // actually appear.
  const [kept, setKept] = useState(draftScope !== null);
  useEffect(() => {
    if (draftScope === null) {
      setKept(false);
      return;
    }
    setKept(writeAccrualDraft(draftScope, { opKey, draft }, store));
  }, [draftScope, opKey, draft, store]);

  const busy = phase.kind === "saving";

  // THE FOCUS TARGETS, held as REFS rather than looked up by id — a field that unmounts clears its
  // entry, so `focusField` never calls `.focus()` on a detached node.
  const fields = useRef(new Map<string, FieldNode>());
  const registerField = useCallback((field: AccrualFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);

  // FOCUS HAPPENS AFTER THE RENDER THAT ENABLES THE CONTROL. Measured on the composer's own walk:
  // while a submit is in flight every control carries `disabled`, and `.focus()` on a DISABLED
  // element is a silent no-op. A TICK, not the field, is the state, so two identical refusals in a
  // row still move focus.
  const focusTarget = useRef<AccrualFieldId | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusField = (field: AccrualFieldId) => {
    focusTarget.current = field;
    setFocusTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (focusTick === 0) return; // the mount, which must not steal focus
    const field = focusTarget.current;
    if (field !== null) fields.current.get(field)?.focus();
  }, [focusTick]);

  const set = <K extends keyof AccrualDraft>(key: K, value: AccrualDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    // A CHANGED PARTICULAR IS A DIFFERENT DECISION, so it gets a different identity. Sending the
    // old key with new figures is an `op_key reused with different args` refusal, which is the
    // database telling the truth about a mistake this form can simply not make.
    setOpKey(newOpKey());
    setResent(false);
    if (phase.kind === "rejected" || phase.kind === "failed" || phase.kind === "lost") {
      setPhase({ kind: "editing" });
    }
  };

  /** Applies ONE door answer. Split out because the lost-response arm calls it for the second
   *  attempt, and two copies of this mapping would be two places an answer could be classified
   *  differently. */
  const applyFailure = (e: unknown) => {
    if (isDoorRefusal(e)) {
      if (e.code === "CLR04") {
        setPhase({ kind: "denied", message: e.message });
        return;
      }
      // THE WHOLE TYPED DETAIL, which `lib/wire.ts` already parsed off the refusal: `reason` is
      // its discriminant and `field` is the rest of the contract 0222 raises beside it. Read
      // defensively — a refusal whose contract carries no field is a FORM-level one, not a control
      // to focus, and focusing nothing is better than focusing the wrong thing.
      const detail = (e as { detail?: Record<string, unknown> | null }).detail;
      const rawField = typeof detail?.field === "string" ? detail.field : null;
      const field = fieldForAccrualPath(rawField);
      setPhase({ kind: "rejected", field, code: e.code, reason: e.reason ?? null, message: e.message });
      if (field !== null) focusField(field);
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    // A TIMEOUT OR AN ABORT IS "NO ANSWER", NOT "IT FAILED", and the difference is the whole of the
    // lost-response arm: the decision may or may not have been taken, so the only safe next move is
    // re-sending the SAME key, which `clara._reserve_op` replays.
    setPhase(/timeout|abort|network|fetch/i.test(message)
      ? { kind: "lost", message }
      : { kind: "failed", message });
  };

  const send = async (keyToUse: string) => {
    setPhase({ kind: "saving" });
    setWarning(null);
    try {
      const created = await submit({
        clientId,
        purpose: draft.purpose.trim(),
        authorityRef: { kind: "accounting_work", id: draft.authorityWorkId },
        accrual: toAccrualParticulars(draft),
        frequency: draft.frequency,
        dayRule: draft.dayRule,
        dayOfMonth: draft.dayRule === "day_of_month" ? Number(draft.dayOfMonth.trim()) : null,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
        opKey: keyToUse,
      });
      // THE DRAFT IS RETIRED ONLY NOW: until the door named the accrual, the typed particulars were
      // the only copy that existed.
      if (draftScope !== null) clearAccrualDraft(draftScope, store);
      if (created.overlap_warning !== null) {
        // ADVISORY, PERSISTENT, AND IT DOES NOT BLOCK THE NAVIGATION AWAY — the accrual exists.
        // `clara._plan_overlap_warning` only WARNS (0193:1155): three scheduled-adjustment carriers
        // can legitimately overlap, and adding a refusal on top of an advisory would be this
        // surface overruling the database.
        setWarning(created.overlap_warning);
        setPhase({ kind: "editing" });
        return;
      }
      go(accrualDetailHref(clientId, created.accrual_id));
    } catch (e) {
      applyFailure(e);
    }
  };

  const onSubmit = async () => {
    setShowIssues(true);
    const found = validateAccrualDraft(draft, knownCodes);
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

  // THE VIEWER ARM. The route still renders — an address a human typed deserves an explanation —
  // but it renders the DENIED state and no form at all. `clara.create_accrual_adjustment` is
  // bookkeeper+ inside its own body, so offering the form to a viewer would be offering a control
  // whose only possible outcome is a refusal (裁-187).
  //
  // THE FLOOR IS JUDGED BY THE ONE PREDICATE `lib/navigation/tree.ts` calls on every registry row
  // (`hasNavigationAccess`), against this lane's own floor rather than a registry LEAF: `accruals`
  // is a top-level `ACCOUNTING_ITEMS` segment, so `resolveActive` can never produce a leaf under it
  // and a `CLIENT_LEAVES` row minted to carry this floor would be a row nothing resolves to
  // (`tree.test.ts`'s reachability cell). The server refuses regardless.
  if (!hasNavigationAccess(scope, ACCRUAL_WRITE_FLOOR)) {
    return (
      <div className="flex flex-col gap-6">
        <AccrualBoundaryStatement />
        <StateBanner tone="warning" title={t("deniedTitle")}>{t("deniedBody")}</StateBanner>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AccrualBoundaryStatement />

      {kept ? null : <StateBanner tone="warning">{t("draftNotKept")}</StateBanner>}
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

      <section className="flex flex-col gap-3">
        <Field
          id={accrualFieldElementId("purpose")}
          label={t("fieldPurpose")}
          error={message("purpose")}
          hint={t("purposeHint")}
        >
          <Input
            id={accrualFieldElementId("purpose")}
            ref={(node) => registerField("purpose", node)}
            value={draft.purpose}
            disabled={busy}
            aria-invalid={message("purpose") === null ? undefined : true}
            aria-describedby={`${accrualFieldElementId("purpose")}-error`}
            onChange={(e) => set("purpose", e.target.value)}
          />
        </Field>

        <Field
          id={accrualFieldElementId("authorityWorkId")}
          label={t("fieldAuthority")}
          error={message("authorityWorkId")}
          hint={t("authorityHint")}
        >
          <DataState
            loading={authorities.loading}
            error={authorities.error}
            isEmpty={(authorities.data?.rows ?? []).length === 0}
            emptyMessage={t("authorityEmpty")}
          >
            <NativeSelect
              id={accrualFieldElementId("authorityWorkId")}
              ref={(node) => registerField("authorityWorkId", node)}
              value={draft.authorityWorkId}
              disabled={busy}
              aria-invalid={message("authorityWorkId") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("authorityWorkId")}-error`}
              onChange={(e) => set("authorityWorkId", e.target.value)}
            >
              <option value="">{t("authorityChoose")}</option>
              {(authorities.data?.rows ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.memo ?? w.intent_key} — {String(w.created_at).slice(0, 10)}
                </option>
              ))}
            </NativeSelect>
          </DataState>
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("termHeading")}</h3>
        {/* THE LAW, IN WORDS, BESIDE THE CONTROLS THAT CARRY IT. */}
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

        {/* THE SELECTION RULE IS NOW A REAL CHOICE (#937), because two rules are now PERFORMED and
            they post different cents. It was a STATEMENT while migration 0222 admitted one rule —
            a select listing rules that all post the same cents would have invited a preparer to
            record an intention the ledger never carries out. `stated_amount` accrues the one
            figure below in every period; `stated_period_amount` accrues the figure stated for each
            period, and a period nobody states is refused rather than filled in. */}
        <Field
          id={accrualFieldElementId("method")}
          label={t("fieldMethod")}
          error={message("method")}
          hint={t("methodHint")}
          className="min-w-40"
        >
          <NativeSelect
            id={accrualFieldElementId("method")}
            ref={(node) => registerField("method", node)}
            value={draft.method}
            disabled={busy}
            onChange={(e) => set("method", e.target.value as AccrualDraft["method"])}
          >
            {ACCRUAL_METHODS.map((rule) => (
              <option key={rule} value={rule}>{methodOption(t, rule)}</option>
            ))}
          </NativeSelect>
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("amountHeading")}</h3>
        <div className="flex flex-wrap gap-3">
          <Field
            id={accrualFieldElementId("amountCents")}
            label={draft.method === "stated_period_amount" ? t("fieldAmountTotal") : t("fieldAmount")}
            error={message("amountCents")}
            hint={draft.method === "stated_period_amount" ? t("amountTotalHint") : undefined}
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
              // THE REFUSED HALF IS THE CONTROL'S OWN, NOT THIS FORM'S. `MoneyInput` renders its
              // own typed refusal for an unparseable keystroke and answers `{ok:false}`; the draft
              // keeps the last accepted figure, so a mid-typing state never silently zeroes an
              // amount the preparer had already entered.
              onValueChange={(change) => {
                // A CLEARED FIELD IS ZERO, and zero is exactly what `validateAccrualDraft` refuses
                // by name (`amountRequired`) — so an emptied control reads as "state the amount"
                // rather than as a silently retained old figure.
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

        {/* #937 — THE PER-PERIOD BLOCK, present only under the rule that performs it. Under
            `stated_amount` there is nothing to state here and the block is not rendered at all. */}
        {draft.method === "stated_period_amount" ? (
          <AccrualPeriodAmountsBlock
            t={t}
            id={accrualFieldElementId("periodAmounts")}
            rows={draft.periodAmounts}
            dues={dues}
            totalCents={draft.amountCents}
            disabled={busy}
            error={message("periodAmounts")}
            onChange={(rows) => set("periodAmounts", rows)}
            registerField={(node) => registerField("periodAmounts", node)}
          />
        ) : null}

        {accountsRead.loading ? (
          // THE LOADING STATE IS THE SHAPE OF WHAT IS COMING, not a spinner: the preview grid is
          // two lines, so two line-height skeletons is an honest promise.
          <div className="flex flex-col gap-1" aria-hidden="true">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : null}
        {accountsRead.error === null ? null : (
          <StateBanner tone="warning">{t("accountsUnavailable")}</StateBanner>
        )}
        <p className="text-xs text-muted-foreground">{t("derivedLinesNote")}</p>
        {/* THE COMPOSER'S OWN GRID, DISABLED. What is previewed is what the door will derive, and
            the preparer cannot edit it: the lines follow the particulars by construction. */}
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
        <h3 className="text-sm font-medium">{t("scheduleHeading")}</h3>
        <div className="flex flex-wrap gap-3">
          <Field id={accrualFieldElementId("frequency")} label={t("fieldFrequency")} error={message("frequency")} className="min-w-40 flex-1">
            <NativeSelect
              id={accrualFieldElementId("frequency")}
              ref={(node) => registerField("frequency", node)}
              value={draft.frequency}
              disabled={busy}
              onChange={(e) => set("frequency", e.target.value as AccrualDraft["frequency"])}
            >
              {ACCRUAL_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f === "monthly" ? t("frequencyMonthly") : f === "quarterly" ? t("frequencyQuarterly") : t("frequencyAnnual")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id={accrualFieldElementId("dayRule")} label={t("fieldDayRule")} error={message("dayRule")} className="min-w-40 flex-1">
            <NativeSelect
              id={accrualFieldElementId("dayRule")}
              ref={(node) => registerField("dayRule", node)}
              value={draft.dayRule}
              disabled={busy}
              onChange={(e) => set("dayRule", e.target.value as AccrualDraft["dayRule"])}
            >
              {ACCRUAL_DAY_RULES.map((r) => (
                <option key={r} value={r}>{r === "day_of_month" ? t("dayRuleDayOfMonth") : t("dayRuleLastDay")}</option>
              ))}
            </NativeSelect>
          </Field>
          {draft.dayRule === "day_of_month" ? (
            <Field
              id={accrualFieldElementId("dayOfMonth")}
              label={t("fieldDayOfMonth")}
              error={message("dayOfMonth")}
              hint={t("dayOfMonthNote", { max: ACCRUAL_DAY_OF_MONTH_MAX })}
              className="min-w-40 flex-1"
            >
              <Input
                id={accrualFieldElementId("dayOfMonth")}
                ref={(node) => registerField("dayOfMonth", node)}
                inputMode="numeric"
                value={draft.dayOfMonth}
                disabled={busy}
                aria-invalid={message("dayOfMonth") === null ? undefined : true}
                aria-describedby={`${accrualFieldElementId("dayOfMonth")}-error`}
                onChange={(e) => set("dayOfMonth", e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <Field id={accrualFieldElementId("effectiveFrom")} label={t("fieldEffectiveFrom")} error={message("effectiveFrom")} className="min-w-40 flex-1">
            <Input
              id={accrualFieldElementId("effectiveFrom")}
              ref={(node) => registerField("effectiveFrom", node)}
              type="date"
              value={draft.effectiveFrom}
              disabled={busy}
              aria-invalid={message("effectiveFrom") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("effectiveFrom")}-error`}
              onChange={(e) => set("effectiveFrom", e.target.value)}
            />
          </Field>
          <Field
            id={accrualFieldElementId("effectiveTo")}
            label={t("fieldEffectiveTo")}
            error={message("effectiveTo")}
            hint={t("effectiveToNote")}
            className="min-w-40 flex-1"
          >
            <Input
              id={accrualFieldElementId("effectiveTo")}
              ref={(node) => registerField("effectiveTo", node)}
              type="date"
              value={draft.effectiveTo}
              disabled={busy}
              aria-invalid={message("effectiveTo") === null ? undefined : true}
              aria-describedby={`${accrualFieldElementId("effectiveTo")}-error`}
              onChange={(e) => set("effectiveTo", e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{t("timezoneNote")}</p>
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
        {/* THE OPTIONAL SOURCE DOCUMENT — the SAME control the composer and #643's form use, asking
            the same question. Evidence is optional here too: an accrual stated from a standing
            instruction is a complete accounting fact. */}
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
          {busy ? t("saving") : t("submitCreate")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => go(accrualsHref(clientId))}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/** One control with its label, its hint and its error — the FieldGroup/Field layout, so a label,
 *  its error and a focus call all name one element. */
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
      {/* A FIELD ERROR SITS BY ITS CONTROL (§3, "Field validation") and is wired to it by
          `aria-describedby`, so a screen reader reads the rule with the field rather than in a list
          at the end of the form. */}
      <p id={`${id}-error`} className="text-xs text-error" role={error === null ? undefined : "alert"}>
        {error ?? ""}
      </p>
    </div>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function methodOption(t: Translate, rule: string): string {
  // TWO RULES (#937), and an HONEST raw-value fallback for anything outside them (the
  // adjustments-register N10 idiom): a value this build has not enumerated prints as itself,
  // never as a key path.
  const labels: Record<string, string> = {
    stated_amount: t("methodStatedAmount"),
    stated_period_amount: t("methodStatedPeriodAmount"),
  };
  return labels[rule] ?? rule;
}

function issueText(t: Translate, code: string): string {
  const codes: Record<string, string> = {
    purposeRequired: t("issuePurposeRequired"),
    authorityRequired: t("issueAuthorityRequired"),
    expenseAccountRequired: t("issueExpenseAccountRequired"),
    liabilityAccountRequired: t("issueLiabilityAccountRequired"),
    accountUnknown: t("issueAccountUnknown"),
    accountsNotDistinct: t("issueAccountsNotDistinct"),
    amountRequired: t("issueAmountRequired"),
    silentTerm: t("issueSilentTerm"),
    servicePeriodOrder: t("issueServicePeriodOrder"),
    effectiveToRequired: t("issueEffectiveToRequired"),
    windowBeforeTerm: t("issueWindowBeforeTerm"),
    windowAfterTerm: t("issueWindowAfterTerm"),
    instructionRequired: t("issueInstructionRequired"),
    effectiveFromRequired: t("issueEffectiveFromRequired"),
    effectiveToBeforeFrom: t("issueEffectiveToBeforeFrom"),
    dayOfMonthRange: t("issueDayOfMonthRange"),
    dayOfMonthAbsent: t("issueDayOfMonthAbsent"),
    reversalCollides: t("issueReversalCollides"),
    scheduleYieldsNone: t("issueScheduleYieldsNone"),
    // #937 — one sentence per wall `clara._assert_accrual_period_amounts` raises.
    periodAmountsRequired: t("issuePeriodAmountsRequired"),
    periodDueDateRequired: t("issuePeriodDueDateRequired"),
    periodAmountRequired: t("issuePeriodAmountRequired"),
    periodAmountDuplicate: t("issuePeriodAmountDuplicate"),
    periodAmountsUnbalanced: t("issuePeriodAmountsUnbalanced"),
    periodRemainderMisplaced: t("issuePeriodRemainderMisplaced"),
    periodAmountMissing: t("issuePeriodAmountMissing"),
    periodAmountNotScheduled: t("issuePeriodAmountNotScheduled"),
  };
  return codes[code] ?? code;
}


export { accrualDraftKey };
