"use client";

// C1/C3/C6 — THE DIRECT ACCOUNTING ENTRY POINT for a staff expense claim (#638).
//
// IT IS A SIBLING of `periodic-adjustment-form.tsx`, NOT A WIDENING OF IT, and the difference is
// what the human is asked for. That form asks for PARTICULARS of a period; this one asks for a
// CLAIM — who claimed, what they itemised, when it was incurred and when it posts, and which of
// reimbursement / advance application / already settled it is — and the DOOR derives the entry from
// them. So the two share their mechanism (the draft and its intent identity, the lost-response arm,
// the refusal-to-control mapping, the line preview) and differ in their subject, which is exactly
// how the runtime route and the database door are split too.
//
// THE FORM SENDS NO LINES AT ALL, and that is the one real difference from both siblings.
// `clara.admit_staff_expense_claim_work` takes the claim and derives the balanced journal itself
// (`clara._claim_journal_basis`), so a browser that also posted lines would be a second, drifting
// statement of the same claim. The grid below is a PREVIEW of the derivation, disabled, so the
// preparer sees the accounting fact their claim produces before they admit it.
//
// THE FOUR THINGS THIS COMPONENT OWNS, each a rule from the refresh spec's shared control contract
// (§3) rather than a preference:
//
//   THE DRAFT AND ITS INTENT IDENTITY. `intentKey` is minted once, when the draft starts, and
//   travels with the draft in `sessionStorage` under user+firm+client — so a lost acknowledgement
//   resolves to the Work already admitted rather than admitting a second one, and a scope switch
//   cannot carry a draft into another client's books. The mechanism is `lib/work/journal-draft.ts`'s,
//   reused rather than re-derived; only the storage key differs.
//
//   THE LOST-RESPONSE ARM. §3: "Show checking/reconnecting and read the current receipt/state
//   BEFORE allowing a distinct resubmit." A network failure is an UNKNOWN, not an error, and this
//   form resolves it by re-POSTing the same intent key exactly once.
//
//   A BUSINESS REFUSAL IS NEVER A TOAST. Every refusal renders as a `StateBanner` in the form,
//   carrying the runtime's own words, with the one next action that actually exists.
//
//   THE SETTLEMENT SWITCH DOES NOT DISCARD ANYTHING (appendix D #46: a Radio Group, with
//   FieldSet/legend, for one durable answer from a small mutually exclusive set). `ClaimDraft`
//   holds every arm's account, and switching changes which one is read, validated and submitted. A
//   preparer who starts a reimbursement, realises it discharges an advance and switches back finds
//   their payable account where they left it.
//
// THE CLAIMANT IS AN ENROLMENT HANDLE, NOT A PERSON RECORD (DECISIONS D4). The form asks for the
// account the firm keeps for that person; when that account has no live enrolment yet it asks, BY
// NAME and BEFORE admission (#721's rule), for the three things 0043's register requires to enrol
// somebody — the name it will carry, a written attestation, and an explicit "this account is
// dedicated to one person". They cannot be asked later: the enrolment happens inside the admission
// transaction.
//
// THE ATTACHMENT IS GENUINELY OPTIONAL (C1). The evidence chooser is the composer's OWN component,
// mounted here; a claim with a photographed receipt and a claim with a sentence in an email are
// both lawful, and the form says so rather than implying a required upload.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { JournalBasisFields, fieldElementId, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { EvidenceChooser, useEvidenceReads } from "@/components/accounting/evidence-chooser";
import { useFirmScope } from "@/components/firm-scope-provider";
import { StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { Money } from "@/components/journals/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { listCoaAccounts } from "@/lib/journals/api";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { canOpenClientLeaf, staffExpenseClaimsHref, workDetailHref, type NavigationScope } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { submitStaffExpenseClaimWork, type SubmitClaimWorkResult } from "@/lib/work/api";
import type { EvidenceDocument, SpokenForDocumentRow } from "@/lib/work/evidence";
import { fieldForServerPath, type JournalFieldId } from "@/lib/work/journal-basis";
import {
  defaultDraftStorage,
  newIntentKey,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import {
  CLAIM_SETTLEMENTS,
  ITEM_DESCRIPTION_MAX_CHARS,
  INSTRUCTION_MAX_CHARS,
  ATTESTATION_MAX_CHARS,
  IDENTIFIER_MAX_CHARS,
  PERSON_LABEL_MAX_CHARS,
  PENDING_FACT_MAX_CHARS,
  claimTotalCents,
  defaultMemo,
  derivedLines,
  emptyClaimDraft,
  emptyClaimItem,
  fieldForClaimPath,
  firstInvalidClaimField,
  isPendingItem,
  toClaimWire,
  validateClaimDraft,
  type ClaimDraft,
  type ClaimFieldId,
  type ClaimFormFieldId,
  type ClaimIssue,
  type ClaimSettlement,
} from "@/lib/work/staff-expense-claim";
import {
  clearClaimDraft,
  readClaimDraft,
  writeClaimDraft,
  type StoredClaimDraft,
} from "@/lib/work/staff-expense-claim-draft";
import { listStaffAdvanceEnrolments, type StaffAdvanceEnrolmentRow } from "@/lib/work/staff-expense-claim-reads";
import type { CoaAccountRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** The DOM id of one claim control. A separate namespace from the basis grid's
 *  (`journal-basis-…`) and from the adjustment form's, so no two vocabularies collide on one page. */
export function claimFieldId(field: ClaimFieldId): string {
  return `staff-expense-claim-${field.replace(/\./g, "-")}`;
}

/** What the form is doing right now. Every arm is a state a human can be told about; there is no
 *  combined "error" bucket, because "the server refused this claim", "the connection dropped" and
 *  "you may not do this" need three different next actions. */
type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  /** The lost-response resolution is in flight — the SAME intent key, re-sent. */
  | { kind: "checking" }
  | { kind: "conflict"; workId: string | null }
  /** The chosen SOURCE DOCUMENT already backs a posted entry. A DIFFERENT arm from `conflict`
   *  because the next action is the opposite one: this refusal opens impact or correction on the
   *  entry that already stands there and must NEVER be resolved by rotating the intent key. */
  | { kind: "sourceConflict"; entryId: string | null }
  | { kind: "denied" }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string }
  /** No answer, twice. The draft is intact and a human decides what to do. */
  | { kind: "lost"; message: string }
  /** The server refused. `field` is already mapped onto a control, or null for a form-level one. */
  | { kind: "rejected"; field: ClaimFormFieldId | null; reason: string | null };

export function StaffExpenseClaimForm({ clientId }: { clientId: string }) {
  // `useRouter` IS CALLED HERE AND NOWHERE BELOW — next/navigation's hook THROWS outside an App
  // Router tree, so a View that called it could not be mounted by a node cell at all. The wrapper
  // owns the router; the View takes a plain callback. (`journal-composer.tsx`'s own split.)
  const router = useRouter();
  return (
    <StaffExpenseClaimFormView
      clientId={clientId}
      scope={useFirmScope()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** Exported for the cells; production reads scope from context and navigates with the router. */
export function StaffExpenseClaimFormView({
  clientId,
  scope,
  navigate,
  submit = submitStaffExpenseClaimWork,
  storage,
  session = sessionTokenAccessor,
  loadAccounts,
  loadEnrolments,
  loadDocuments,
  loadSpokenFor,
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof submitStaffExpenseClaimWork;
  storage?: DraftStorage | null;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  /** The live staff-advance enrolments, injectable for the same reason `loadAccounts` is. */
  loadEnrolments?: () => Promise<StaffAdvanceEnrolmentRow[] | null>;
  loadDocuments?: () => Promise<EvidenceDocument[]>;
  loadSpokenFor?: () => Promise<SpokenForDocumentRow[]>;
}) {
  const t = useTranslations("StaffExpenseClaim");
  const tc = useTranslations("JournalComposer");
  /** #634's evidence copy, which spans this door, the composer and the late-attachment dialog. */
  const tmj = useTranslations("ManualJournal");
  const go = navigate;

  // THE DRAFT SCOPE, or null. A caller whose firm/user could not be read does NOT get a partial
  // key — it gets no persistence at all, and the form says so rather than promising a reload
  // recovery it cannot deliver (§3).
  const draftScope: JournalDraftScope | null = useMemo(
    () =>
      scope.firm_id && scope.user_id
        ? { userId: scope.user_id, firmId: scope.firm_id, clientId }
        : null,
    [scope.firm_id, scope.user_id, clientId],
  );
  const store = storage === undefined ? defaultDraftStorage() : storage;

  // ONE LAZY INITIALISER, so the restore happens before the first paint rather than as an effect
  // that would flash an empty form first.
  const [restored] = useState<StoredClaimDraft | null>(
    () => (draftScope === null ? null : readClaimDraft(draftScope, store)));
  const [intentKey, setIntentKey] = useState(() => restored?.intentKey ?? newIntentKey());
  const [draft, setDraft] = useState<ClaimDraft>(() => restored?.draft ?? emptyClaimDraft());
  const [documentId, setDocumentId] = useState<string | null>(() => restored?.documentId ?? null);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  /** Issues are shown only AFTER a submit attempt — a form that reds every field before anyone has
   *  typed is telling a human off for not having started. */
  const [showIssues, setShowIssues] = useState(false);

  const accountsRead = useAsyncRead<CoaAccountRow[]>(() =>
    loadAccounts ? loadAccounts() : listCoaAccounts(session, clientId),
  );
  const enrolmentsRead = useAsyncRead<StaffAdvanceEnrolmentRow[] | null>(() =>
    loadEnrolments ? loadEnrolments() : listStaffAdvanceEnrolments(clientId, { session }),
  );
  const evidence = useEvidenceReads(clientId, { session, loadDocuments, loadSpokenFor });
  const accounts = accountsRead.data ?? [];
  const enrolments = enrolmentsRead.data ?? null;

  /** `null` while the chart has not been read — the unknown-account rule is SKIPPED then rather
   *  than guessed (see `validateClaimDraft`'s own note). */
  const knownCodes = useMemo(
    () => (accountsRead.data === null
      ? null
      : new Set(accountsRead.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accountsRead.data],
  );
  const enrolledCodes = useMemo(
    () => (enrolments === null ? null : new Set(enrolments.map((e) => e.account_code))),
    [enrolments],
  );
  /** True when the chosen claimant account has NO live enrolment — the case that needs the three
   *  enrol answers. Unknown (the register could not be read) counts as "new", the conservative
   *  direction: asking for an attestation that turns out to be unnecessary costs a sentence, and
   *  the door ignores it when the enrolment already exists. */
  const claimantIsNew = draft.claimantAccountCode.trim() !== ""
    && (enrolledCodes === null || !enrolledCodes.has(draft.claimantAccountCode.trim()));

  const issues: ClaimIssue[] = useMemo(
    () => (showIssues ? validateClaimDraft(draft, knownCodes, enrolledCodes) : []),
    [showIssues, draft, knownCodes, enrolledCodes],
  );
  const lines = useMemo(() => derivedLines(draft), [draft]);
  const total = claimTotalCents(draft);

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
    setKept(writeClaimDraft(draftScope, { intentKey, draft, documentId }, store));
  }, [draftScope, intentKey, draft, documentId, store]);

  const busy = phase.kind === "submitting" || phase.kind === "checking";

  // THE FOCUS TARGETS, held as REFS rather than looked up by id — `journal-basis-fields.tsx`'s own
  // note for why. A field that unmounts (another settlement's account) clears its entry, so
  // `focusField` never calls `.focus()` on a detached node.
  const fields = useRef(new Map<ClaimFormFieldId, FieldNode>());
  const registerField = useCallback((field: ClaimFormFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);
  const registerBasisField = useCallback(
    (field: JournalFieldId, node: FieldNode | null) => registerField(field, node),
    [registerField],
  );

  // FOCUS HAPPENS AFTER THE RENDER THAT ENABLES THE CONTROL. Measured on the sibling form's own
  // walk: while a submit is in flight every control carries `disabled`, and `.focus()` on a
  // DISABLED element is a silent no-op. A TICK, not the field, is the state, so two identical
  // refusals in a row still move focus.
  const focusTarget = useRef<ClaimFormFieldId | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusField = (field: ClaimFormFieldId) => {
    focusTarget.current = field;
    setFocusTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (focusTick === 0) return; // the mount, which must not steal focus
    const field = focusTarget.current;
    if (field !== null) fields.current.get(field)?.focus();
  }, [focusTick]);

  const set = <K extends keyof ClaimDraft>(key: K, value: ClaimDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (phase.kind === "rejected") setPhase({ kind: "editing" });
  };

  const setItem = (index: number, patch: Partial<ClaimDraft["items"][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
    if (phase.kind === "rejected") setPhase({ kind: "editing" });
  };

  const addItem = () => setDraft((current) => ({ ...current, items: [...current.items, emptyClaimItem()] }));
  const removeItem = (index: number) =>
    setDraft((current) => ({
      ...current,
      // NEVER BELOW ONE. A claim with no items is not a claim, and a form that could reach that
      // state would be offering a submit the door refuses by name.
      items: current.items.length <= 1 ? current.items : current.items.filter((_, i) => i !== index),
    }));

  /** Applies ONE runtime answer. Split out because the lost-response arm calls it for a second
   *  attempt, and two copies of this mapping would be two places a status could be classified
   *  differently. SYNCHRONOUS: every arm paints from the answer it was given. */
  const apply = (result: SubmitClaimWorkResult): void => {
    if (result.kind === "accepted") {
      // The draft is retired ONLY now: until the runtime named the Work, the typed claim was the
      // only copy that existed.
      if (draftScope !== null) clearClaimDraft(draftScope, store);
      go(workDetailHref(clientId, result.workId));
      return;
    }
    if (result.kind === "invalid_basis") {
      // TWO VOCABULARIES, ONE MAPPER EACH, AND THE ORDER IS NOT ARBITRARY. `claim.<key>` is this
      // form's own; everything else is the basis's, and the preview grid is rendered by the very
      // same component the composer uses, so its mapper is reused verbatim.
      const field = fieldForClaimPath(result.field) ?? fieldForServerPath(result.field);
      setPhase({ kind: "rejected", field, reason: result.reason });
      if (field !== null) focusField(field);
      return;
    }
    if (result.kind === "conflict") {
      setPhase({ kind: "conflict", workId: result.workId });
      return;
    }
    if (result.kind === "source_conflict") {
      // THE CHOICE IS PRESERVED, and the control is focused: the document the preparer picked stays
      // picked so they can see WHICH one is spoken for, and the only forward moves are "open that
      // entry" or "choose another document" — never a resubmit of this same intent.
      setPhase({ kind: "sourceConflict", entryId: result.entryId });
      focusField("evidence");
      return;
    }
    if (result.kind === "denied") {
      setPhase({ kind: "denied" });
      return;
    }
    if (result.kind === "not_found") {
      setPhase({ kind: "notFound" });
      return;
    }
    setPhase(result.kind === "lost"
      ? { kind: "lost", message: result.message }
      : { kind: "unavailable", message: (result as { message: string }).message });
  };

  const send = async () => {
    const claim = toClaimWire(draft, knownCodes, enrolledCodes);
    if (claim === null) return; // unreachable: the caller validated first
    // OMITTED ENTIRELY when there is no document — the route reads an absent and an empty list
    // identically (`toDbSourceRefs`), and sending `[]` would be the same request with more bytes.
    const cited = documentId === null ? {} : { sourceRefs: [{ kind: "document" as const, documentId }] };
    const body = { clientId, intentKey, claim, ...cited };
    setPhase({ kind: "submitting" });
    const first = await submit(session, body);
    if (first.kind !== "lost") {
      apply(first);
      return;
    }
    // THE LOST-RESPONSE RESOLUTION. No answer was observed, so the Work may already exist. Re-send
    // the SAME intent key: the database resolves it to the row it already has (`replayed: true`) or
    // admits it for the first time. Exactly once.
    setPhase({ kind: "checking" });
    apply(await submit(session, body));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // the local duplicate-submit guard; the server's idempotency is the real one
    // …AND THE ONE REFUSAL THIS FORM MUST NEVER RE-SEND. The same intent with the same spoken-for
    // document gets the same 409 for ever; the chooser's own onChange clears the phase, so a NEW
    // choice is accepted in the tick it is made.
    if (phase.kind === "sourceConflict") return;
    setShowIssues(true);
    const found = validateClaimDraft(draft, knownCodes, enrolledCodes);
    if (found.length > 0) {
      setPhase({ kind: "editing" });
      const field = firstInvalidClaimField(found);
      if (field !== null) focusField(field);
      return;
    }
    void send();
  };

  // THE VIEWER ARM. The route still renders — an address a human typed deserves an explanation —
  // but it renders the DENIED state and no form at all (裁-187). The floor lives in the one registry
  // beside every other floor, and the server refuses regardless.
  if (!canOpenClientLeaf(scope, "staffExpenseClaim")) {
    return (
      <StateBanner tone="warning" title={tc("denied.title")}>
        {tc("denied.body")}
      </StateBanner>
    );
  }

  const issueFor = (field: ClaimFieldId) => issues.find((i) => i.field === field);
  const rejectedOn = (field: ClaimFieldId) => phase.kind === "rejected" && phase.field === field;
  const errorFor = (field: ClaimFieldId): string => {
    const issue = issueFor(field);
    return issue === undefined ? "" : t(`issues.${issue.code}`);
  };
  const describedBy = (field: ClaimFieldId, hasHint: boolean) =>
    hasHint
      ? `${claimFieldId(field)}-help ${claimFieldId(field)}-error`
      : `${claimFieldId(field)}-error`;
  const controlProps = (field: ClaimFieldId, hasHint = false) => ({
    id: claimFieldId(field),
    ref: (node: FieldNode | null) => registerField(field, node),
    disabled: busy,
    "aria-invalid": issueFor(field) !== undefined || rejectedOn(field) ? (true as const) : undefined,
    "aria-describedby": describedBy(field, hasHint),
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* THE SETTLEMENT SWITCH — a Radio Group inside a FieldSet with a legend (appendix D #46:
          "one durable answer from a small mutually exclusive set, with FieldSet/legend"). Switching
          changes WHICH account is read and submitted; every arm's typed value survives. */}
      <FieldSet data-invalid={issueFor("settlement") !== undefined || undefined}>
        <FieldLegend variant="label" className="mb-0">{t("settlement.label")}</FieldLegend>
        <FieldDescription id={`${claimFieldId("settlement")}-help`}>{t("settlement.help")}</FieldDescription>
        <RadioGroup
          name="staff-expense-claim-settlement"
          value={draft.settlement}
          disabled={busy}
          onValueChange={(next) => set("settlement", next as ClaimSettlement)}
          aria-describedby={`${claimFieldId("settlement")}-help`}
        >
          {CLAIM_SETTLEMENTS.map((option) => {
            const labelId = `${claimFieldId("settlement")}-${option}-label`;
            const descriptionId = `${claimFieldId("settlement")}-${option}-description`;
            return (
              <label key={option} className="flex items-start gap-2 text-sm font-normal text-foreground">
                <RadioGroupItem
                  value={option}
                  className="mt-0.5"
                  aria-labelledby={labelId}
                  aria-describedby={descriptionId}
                />
                <span className="flex flex-col gap-0.5">
                  <span id={labelId} className="font-medium">{t(`settlement.options.${option}`)}</span>
                  <span id={descriptionId} className="text-xs text-muted-foreground">
                    {t(`settlement.help_${option}`)}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </FieldSet>

      {/* THE CLAIMANT. An enrolment handle, never a person record — see this file's header. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">{t("claimant.heading")}</h2>
        <Field field="claimantAccountCode" errorText={errorFor("claimantAccountCode")}
          label={t("claimant.accountCode")} hint={t("claimant.accountCodeHelp")}>
          <AccountPicker field="claimantAccountCode" value={draft.claimantAccountCode}
            accounts={accounts} props={controlProps("claimantAccountCode", true)}
            onPick={(v) => set("claimantAccountCode", v)} placeholder={t("accountPlaceholder")} />
        </Field>
        {claimantIsNew ? (
          <>
            <p className="text-xs text-muted-foreground" data-testid="claimant-new">{t("claimant.newHelp")}</p>
            <Field field="claimantPersonLabel" errorText={errorFor("claimantPersonLabel")}
              label={t("claimant.personLabel")}>
              <Input {...controlProps("claimantPersonLabel")} value={draft.claimantPersonLabel}
                maxLength={PERSON_LABEL_MAX_CHARS}
                onChange={(e) => set("claimantPersonLabel", e.target.value)} />
            </Field>
            <Field field="claimantAttestation" errorText={errorFor("claimantAttestation")}
              label={t("claimant.attestation")} hint={t("claimant.attestationHelp")}>
              <Textarea {...controlProps("claimantAttestation", true)} rows={2}
                value={draft.claimantAttestation} maxLength={ATTESTATION_MAX_CHARS}
                onChange={(e) => set("claimantAttestation", e.target.value)} />
            </Field>
            <Field field="claimantConfirmDedicated" errorText={errorFor("claimantConfirmDedicated")}
              label={t("claimant.confirmDedicated")}>
              <label className="flex items-start gap-2 text-sm font-normal text-foreground">
                <input
                  {...controlProps("claimantConfirmDedicated")}
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.claimantConfirmDedicated}
                  onChange={(e) => set("claimantConfirmDedicated", e.target.checked)}
                />
                <span>{t("claimant.confirmDedicatedBody")}</span>
              </label>
            </Field>
          </>
        ) : null}
        <Field field="claimantIdentifier" errorText={errorFor("claimantIdentifier")}
          label={t("claimant.identifier")} hint={t("claimant.identifierHelp")}>
          <Input {...controlProps("claimantIdentifier", true)} value={draft.claimantIdentifier}
            maxLength={IDENTIFIER_MAX_CHARS}
            onChange={(e) => set("claimantIdentifier", e.target.value)} />
        </Field>
      </section>

      {/* THE TWO DATES, LABELLED DISTINCTLY. §3's dates-and-money rule: "Label posting/as-of/due
          dates distinctly. Allow precise typing alongside Calendar/Date Picker." A native date
          input is typeable, works at 320 px and at 200 % zoom, keeps the EXACT ISO value with no
          timezone shift, and carries the platform's own picker. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field field="incurredDate" errorText={errorFor("incurredDate")} label={t("incurredDate")}
          hint={t("incurredDateHelp")}>
          <Input {...controlProps("incurredDate", true)} type="date" value={draft.incurredDate}
            onChange={(e) => set("incurredDate", e.target.value)} />
        </Field>
        <Field field="postingDate" errorText={errorFor("postingDate")} label={t("postingDate")}
          hint={t("postingDateHelp")}>
          <Input {...controlProps("postingDate", true)} type="date" value={draft.postingDate}
            onChange={(e) => set("postingDate", e.target.value)} />
        </Field>
      </div>

      {/* THE ITEMISATION. One row per line the claimant itemised; an item that names the fact it is
          still waiting for posts nothing and holds the rest up not at all (AC3's per-item
          continuation, designed inside one claim). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">{t("items.heading")}</h2>
        <p className="text-xs text-muted-foreground" id={`${claimFieldId("items")}-help`}>{t("items.help")}</p>
        <p id={`${claimFieldId("items")}-error`} className="text-xs text-error" role="alert">
          {errorFor("items")}
        </p>
        {draft.items.map((item, index) => {
          const f = (key: string) => `items.${index}.${key}` as ClaimFieldId;
          const waiting = isPendingItem(item);
          return (
            <div key={`claim-item-${index}`} className="flex flex-col gap-3 rounded-md border border-border p-3"
              data-testid={`claim-item-${index}`}>
              <Field field={f("description")} errorText={errorFor(f("description"))} label={t("items.description")}>
                <Input {...controlProps(f("description"))} value={item.description}
                  maxLength={ITEM_DESCRIPTION_MAX_CHARS}
                  onChange={(e) => setItem(index, { description: e.target.value })} />
              </Field>
              {waiting ? null : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field field={f("expenseAccountCode")} errorText={errorFor(f("expenseAccountCode"))}
                    label={t("items.expenseAccountCode")}>
                    <AccountPicker field={f("expenseAccountCode")} value={item.expenseAccountCode}
                      accounts={accounts} props={controlProps(f("expenseAccountCode"))}
                      onPick={(v) => setItem(index, { expenseAccountCode: v })}
                      placeholder={t("accountPlaceholder")} />
                  </Field>
                  <Field field={f("amountCents")} errorText={errorFor(f("amountCents"))} label={t("items.amountCents")}>
                    <MoneyInput {...controlProps(f("amountCents"))} cents={item.amountCents} mode="unsigned"
                      onValueChange={(c) => c.ok && setItem(index, { amountCents: c.cents ?? 0 })} />
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field field={f("incurredDate")} errorText={errorFor(f("incurredDate"))}
                  label={t("items.incurredDate")} hint={t("items.incurredDateHelp")}>
                  <Input {...controlProps(f("incurredDate"), true)} type="date" value={item.incurredDate}
                    onChange={(e) => setItem(index, { incurredDate: e.target.value })} />
                </Field>
                <Field field={f("pendingFact")} errorText={errorFor(f("pendingFact"))}
                  label={t("items.pendingFact")} hint={t("items.pendingFactHelp")}>
                  <Input {...controlProps(f("pendingFact"), true)} value={item.pendingFact}
                    maxLength={PENDING_FACT_MAX_CHARS}
                    onChange={(e) => setItem(index, { pendingFact: e.target.value })} />
                </Field>
              </div>
              {/* TAX FACTS, CARRIED VERBATIM. There is no tax vocabulary in this beta and nothing
                  here is interpreted: what the claimant's receipt says is stored beside the item and
                  shown back on the register. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${claimFieldId(f("description"))}-tax`}>{t("items.suppliedTax")}</Label>
                <p className="text-xs text-muted-foreground">{t("items.suppliedTaxHelp")}</p>
                <Input
                  id={`${claimFieldId(f("description"))}-tax`}
                  value={item.suppliedTaxNote}
                  disabled={busy}
                  maxLength={500}
                  onChange={(e) => setItem(index, { suppliedTaxNote: e.target.value })}
                />
              </div>
              {draft.items.length > 1 ? (
                <div>
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => removeItem(index)}>
                    {t("items.remove")}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={addItem}>
            {t("items.add")}
          </Button>
        </div>
        {/* THE TOTAL, SHOWN RATHER THAN TYPED. It is the claimant's own itemisation added up, and
            the browser never sends it: the door derives the same figure and refuses any claim whose
            items do not sum to it. Rendered through the ONE money component from exact minor units. */}
        <p className="text-sm text-muted-foreground" data-testid="claim-total">
          {t("items.totalLabel")} <Money cents={total} />
        </p>
      </section>

      {/* THE SETTLEMENT'S ONE CREDIT LEG. Only the active arm's control is rendered; the others keep
          their typed values in the draft. */}
      {draft.settlement === "reimbursement" ? (
        <Field field="payableAccountCode" errorText={errorFor("payableAccountCode")}
          label={t("payableAccountCode")} hint={t("payableAccountCodeHelp")}>
          <AccountPicker field="payableAccountCode" value={draft.payableAccountCode}
            accounts={accounts} props={controlProps("payableAccountCode", true)}
            onPick={(v) => set("payableAccountCode", v)} placeholder={t("accountPlaceholder")} />
        </Field>
      ) : null}
      {draft.settlement === "advance_application" ? (
        <>
          <Field field="advanceAccountCode" errorText={errorFor("advanceAccountCode")}
            label={t("advanceAccountCode")} hint={t("advanceAccountCodeHelp")}>
            <AccountPicker field="advanceAccountCode" value={draft.advanceAccountCode}
              accounts={accounts} props={controlProps("advanceAccountCode", true)}
              onPick={(v) => set("advanceAccountCode", v)} placeholder={t("accountPlaceholder")} />
          </Field>
          {/* NO SILENT FIFO (WD-R10). The claim says WHICH advance it discharges; the register
              never guesses, and the database refuses a claim that does not name one. */}
          <Field field="advanceId" errorText={errorFor("advanceId")} label={t("advanceId")}
            hint={t("advanceIdHelp")}>
            <Input {...controlProps("advanceId", true)} value={draft.advanceId}
              onChange={(e) => set("advanceId", e.target.value)} />
          </Field>
        </>
      ) : null}
      {draft.settlement === "already_settled" ? (
        <Field field="paymentAccountCode" errorText={errorFor("paymentAccountCode")}
          label={t("paymentAccountCode")} hint={t("paymentAccountCodeHelp")}>
          <AccountPicker field="paymentAccountCode" value={draft.paymentAccountCode}
            accounts={accounts} props={controlProps("paymentAccountCode", true)}
            onPick={(v) => set("paymentAccountCode", v)} placeholder={t("accountPlaceholder")} />
        </Field>
      ) : null}

      <Field field="sourceKind" errorText={errorFor("sourceKind")} label={t("sourceKind.label")}
        hint={t("sourceKind.help")}>
        <NativeSelect {...controlProps("sourceKind", true)} className="w-full" value={draft.sourceKind}
          onChange={(e) => set("sourceKind", e.target.value as ClaimDraft["sourceKind"])}>
          <option value="instruction">{t("sourceKind.options.instruction")}</option>
          <option value="document">{t("sourceKind.options.document")}</option>
        </NativeSelect>
      </Field>

      <Field field="instruction" errorText={errorFor("instruction")} label={t("instruction")}
        hint={t("instructionHelp")}>
        <Textarea {...controlProps("instruction", true)} rows={2} value={draft.instruction}
          maxLength={INSTRUCTION_MAX_CHARS}
          onChange={(e) => set("instruction", e.target.value)} />
      </Field>

      {/* C1's OPTIONAL ATTACHMENT — the composer's OWN chooser, mounted here. A claim evidenced by
          a photographed receipt and a claim evidenced by a sentence are both lawful. The refusal it
          can attract is named beside it: a cited document that is no longer an active, byte-verified
          filing of this client comes back as a 400 whose `field` is `sourceRefs[N]`, which
          `fieldForServerPath` maps onto THIS control. */}
      <EvidenceChooser
        clientId={clientId}
        reads={evidence}
        value={documentId}
        disabled={busy}
        invalid={phase.kind === "sourceConflict" || (phase.kind === "rejected" && phase.field === "evidence")}
        errorText={phase.kind === "rejected" && phase.field === "evidence" ? tmj("evidence.invalid") : ""}
        registerField={(node) => registerField("evidence", node)}
        onChange={(next) => {
          setDocumentId(next);
          // A REFUSAL ABOUT THE OLD CHOICE IS RETIRED BY MAKING A NEW ONE.
          if (phase.kind === "sourceConflict" || (phase.kind === "rejected" && phase.field === "evidence")) {
            setPhase({ kind: "editing" });
          }
        }}
      />

      {/* THE ENTRY THIS CLAIM PRODUCES. Rendered through the SAME line table the composer uses, and
          DISABLED: the browser sends no lines at all, so letting a preparer edit them here would be
          offering an act that never reaches the wire. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">{t("preview.heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("preview.body")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldElementId("postingDate")}>{tc("postingDate")}</Label>
            <Input id={fieldElementId("postingDate")} type="date" value={draft.postingDate} disabled readOnly />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldElementId("memo")}>{tc("memo")}</Label>
            <Input id={fieldElementId("memo")} value={defaultMemo(draft)} disabled readOnly />
          </div>
        </div>
        <JournalBasisFields
          lines={lines}
          onChange={() => undefined}
          accounts={accounts}
          issues={[]}
          disabled
          registerField={registerBasisField}
        />
      </section>

      {/* THE CHART READ IS A SEPARATE FAILURE FROM THE FORM'S. A preparer who knows the code can
          still submit; the commit rechecks every account against the live chart anyway. */}
      {accountsRead.error !== null ? (
        <StateBanner tone="warning" action={
          <Button type="button" variant="outline" size="sm" onClick={() => void accountsRead.reload()}>
            {tc("retry")}
          </Button>
        }>
          {tc("accountsUnavailable")}
        </StateBanner>
      ) : null}

      <ClaimPhaseBanner
        phase={phase}
        clientId={clientId}
        onRetry={() => void send()}
        onNewIntent={() => {
          // A CONFLICT IS THE ONE PLACE THE IDENTITY MAY BE ROTATED, and the rule is §3's: "Same
          // operation identity for retries; NEW INTENT gets a new identity."
          setIntentKey(newIntentKey());
          setPhase({ kind: "editing" });
        }}
      />

      <p className="text-xs text-muted-foreground">{kept ? tc("draftKept") : tc("draftNotKept")}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || phase.kind === "sourceConflict"}>
          {busy ? tc("submitting") : t("submit")}
        </Button>
        {/* A NAMED STATUS, not only a disabled button — §3's short-mutation rule; a live region
            because "Checking…" REPLACES "Submitting…" mid-flight. */}
        <span role="status" className="text-sm text-muted-foreground">
          {phase.kind === "submitting" ? tc("submitting") : phase.kind === "checking" ? tc("checking") : ""}
        </span>
        <Link href={staffExpenseClaimsHref(clientId)}
          className="text-sm font-medium text-primary underline underline-offset-2">
          {t("history.link")}
        </Link>
      </div>
    </form>
  );
}

/**
 * One labelled control with its error slot, wired by `aria-describedby` so a screen reader reads the
 * rule WITH the field rather than in a list at the end of the form.
 *
 * IT IS A TOP-LEVEL COMPONENT, AND THAT IS A FIX RATHER THAN A STYLE CHOICE — the sibling form's own
 * measured note: declared inside a render body it is a NEW component type on every render, so React
 * unmounts and remounts its whole subtree on every keystroke and the focused input is replaced
 * mid-typing. The unit harness cannot see it; a browser walk can.
 */
function Field({
  field,
  label,
  hint,
  errorText,
  children,
}: {
  field: ClaimFieldId;
  label: string;
  hint?: string;
  errorText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={claimFieldId(field)}>{label}</Label>
      {hint === undefined ? null : (
        <p id={`${claimFieldId(field)}-help`} className="text-xs text-muted-foreground">{hint}</p>
      )}
      {children}
      <p id={`${claimFieldId(field)}-error`} className="text-xs text-error" role="alert">
        {errorText}
      </p>
    </div>
  );
}

/** The client's ACTIVE chart as a native select, with a free-text fallback when the chart could not
 *  be read — the same degradation the composer's line picker makes, for the same reason. */
function AccountPicker({
  field,
  value,
  accounts,
  props,
  onPick,
  placeholder,
}: {
  field: ClaimFieldId;
  value: string;
  accounts: readonly CoaAccountRow[];
  props: Record<string, unknown>;
  onPick: (value: string) => void;
  placeholder: string;
}) {
  const active = accounts.filter((a) => a.is_active);
  if (active.length === 0) {
    return <Input {...props} value={value} placeholder={placeholder} onChange={(e) => onPick(e.target.value)} />;
  }
  return (
    <NativeSelect {...props} className="w-full" value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">{placeholder}</option>
      {active.map((a) => (
        <option key={`${field}-${a.account_code}`} value={a.account_code}>
          {a.account_code} — {a.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Every non-editing phase, as ONE inline banner with ONE next action. */
function ClaimPhaseBanner({
  phase,
  clientId,
  onRetry,
  onNewIntent,
}: {
  phase: Phase;
  clientId: string;
  onRetry: () => void;
  onNewIntent: () => void;
}) {
  const t = useTranslations("StaffExpenseClaim");
  const tc = useTranslations("JournalComposer");
  const tmj = useTranslations("ManualJournal");
  if (phase.kind === "editing" || phase.kind === "submitting" || phase.kind === "checking") return null;

  if (phase.kind === "sourceConflict") {
    // NO "TRY AGAIN", AND NO NEW INTENT KEY. The document is spoken for; rotating the identity and
    // pressing again is exactly the second effect the rule prevents.
    return (
      <StateBanner tone="error" title={tmj("sourceConflict.title")}>
        {tmj("sourceConflict.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "rejected") {
    return (
      <StateBanner tone="error" title={t("rejected.title")} code={phase.reason ?? undefined}>
        {t("rejected.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "conflict") {
    return (
      <StateBanner
        tone="error"
        title={tc("conflict.title")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onNewIntent}>
              {tc("conflict.newDraft")}
            </Button>
            {/* THE LINK IS OFFERED ONLY WHEN THE RESPONSE NAMED THE WORK: a card never invents a
                destination. */}
            {phase.workId === null ? null : (
              <Link href={workDetailHref(clientId, phase.workId)}
                className="text-sm font-medium text-primary underline underline-offset-2">
                {tc("conflict.link")}
              </Link>
            )}
          </div>
        }
      >
        {tc("conflict.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "denied") {
    return <StateBanner tone="warning" title={tc("denied.title")}>{tc("denied.body")}</StateBanner>;
  }
  if (phase.kind === "notFound") {
    return <StateBanner tone="neutral" title={tc("notFound.title")}>{tc("notFound.body")}</StateBanner>;
  }
  // `lost` and `unavailable` share a shape and differ in what they SAY: one reports that nothing was
  // admitted, the other that nobody can tell yet. Both keep the draft and both offer the same next
  // action — press again, with the SAME intent key.
  return (
    <StateBanner
      tone="error"
      title={phase.kind === "lost" ? tc("lost.title") : tc("unavailable.title")}
      code={phase.message}
      action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>{tc("retry")}</Button>}
    >
      {phase.kind === "lost" ? tc("lost.body") : tc("unavailable.body")}
    </StateBanner>
  );
}
