"use client";

// C8/C11 — THE DIRECT ACCOUNTING ENTRY POINT for a periodic stock adjustment or a supplied
// payroll/statutory obligation (#643).
//
// IT IS A SIBLING OF `journal-composer.tsx`, NOT A WIDENING OF IT, and the difference is what the
// human is asked for. The composer asks for a BALANCED ENTRY and takes it verbatim. This form asks
// for PARTICULARS — a period, a method, two counted figures or one movement, the accounts each
// leg plays — and DERIVES the entry from them. So the two share their mechanism (the draft and its
// intent identity, the lost-response arm, the refusal-to-control mapping, the line grid) and
// differ in their subject, which is exactly how the runtime route and the database door are split
// too.
//
// THE THREE THINGS THIS COMPONENT OWNS, each a rule from the refresh spec's shared control
// contract (§3) rather than a preference:
//
//   THE DRAFT AND ITS INTENT IDENTITY. `intentKey` is minted once, when the draft starts, and
//   travels with the draft in `sessionStorage` under user+firm+client — so a lost acknowledgement
//   resolves to the Work already admitted rather than admitting a second one, and a scope switch
//   cannot carry a draft into another client's books. The mechanism is
//   `lib/work/journal-draft.ts`'s, reused rather than re-derived; only the storage key differs.
//
//   THE LOST-RESPONSE ARM. §3: "Show checking/reconnecting and read the current receipt/state
//   BEFORE allowing a distinct resubmit." A network failure is an UNKNOWN, not an error, and this
//   form resolves it by re-POSTing the same intent key exactly once.
//
//   A BUSINESS REFUSAL IS NEVER A TOAST. Every refusal renders as a `StateBanner` in the form,
//   carrying the runtime's own words, with the one next action that actually exists.
//
// THE TYPE SWITCH DOES NOT DISCARD ANYTHING. `AdjustmentDraft` holds BOTH halves, and switching
// changes which one is read, validated and submitted. A preparer who starts a stock adjustment,
// realises it is a payroll accrual and switches back finds their figures where they left them.
//
// THE EVIDENCE CHOOSER IS THE COMPOSER'S OWN COMPONENT, not a second one. #643's third acceptance
// line asks that this operation be reachable "from the direct Accounting entry point AND from an
// upload/reference", and on this door the upload/reference entrance IS the chooser: the preparer
// picks a document the client has already filed, it travels as `source_refs [{kind:'document'}]`
// through `POST /api/work/periodic-adjustment` into `clara._admit_accounting_work_core`, and the
// posting core re-reads it at commit and binds it to the entry through `clara.entry_evidence_links`
// exactly as the journal lane does. The control, its two reads and their degradation rules live in
// `components/accounting/evidence-chooser.tsx` and are MOUNTED here — one control, one set of ids,
// one refusal vocabulary. What this form keeps is what the chooser deliberately does not decide:
// which refusal is on screen (`stale_basis` / `not_filed` on a cited document that is no longer
// filed, or the 409 when it already backs a posted entry) and what the next action is.
//
// THE LINE GRID IS A PREVIEW, NOT AN EDITOR, and that is the whole point of this journey. C-29
// asks that closing stock not be simulated with a balancing journal, and migration 0194's
// `clara._assert_adjustment_relationships` refuses an entry whose lines do not say what the
// particulars say. So the grid renders the DERIVED entry — the same derivation the database
// re-derives — disabled, so a preparer sees the exact accounting fact their particulars produce
// and cannot submit one that contradicts them. It is the SAME `JournalBasisFields` the composer
// uses: one line table, one money control, one account vocabulary.

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
import { listCoaAccounts } from "@/lib/journals/api";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { canOpenClientLeaf, journalEntryHref, workDetailHref, type NavigationScope } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { submitPeriodicAdjustmentWork, type SubmitJournalWorkResult } from "@/lib/work/api";
import { findEntryClient, type EvidenceDocument, type SpokenForDocumentRow } from "@/lib/work/evidence";
import { fieldForServerPath, type JournalFieldId } from "@/lib/work/journal-basis";
import {
  defaultDraftStorage,
  newIntentKey,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import {
  ADJUSTMENT_PURPOSES,
  COUNT_REFERENCE_MAX_CHARS,
  INSTRUCTION_MAX_CHARS,
  OBLIGATION_EXPENSE_DEFAULTS,
  OBLIGATION_KINDS,
  PARTICULARS_SOURCE_MAX_CHARS,
  STATUTORY_LIABILITY_DEFAULTS,
  STOCK_METHODS,
  defaultMemo,
  derivedLines,
  emptyAdjustmentDraft,
  fieldForAdjustmentPath,
  firstInvalidAdjustmentField,
  movementCents,
  toAdjustmentWire,
  validateAdjustmentDraft,
  type AdjustmentDraft,
  type AdjustmentFieldId,
  type AdjustmentFormFieldId,
  type AdjustmentIssue,
  type AdjustmentPurpose,
  type ObligationKind,
} from "@/lib/work/periodic-adjustment";
import {
  clearAdjustmentDraft,
  readAdjustmentDraft,
  writeAdjustmentDraft,
  type StoredAdjustmentDraft,
} from "@/lib/work/periodic-adjustment-draft";
import type { CoaAccountRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** How long the form waits for the CLAIMANT of a `source_conflict` refusal before it stops
 *  waiting. The refusal is already painted by then, so this bounds a cosmetic upgrade and nothing a
 *  person is blocked on: when it fires, the banner keeps its sentence and simply offers no link.
 *  The composer's own constant, and its reasoning (a `fetch` with neither signal nor timeout never
 *  gives up), restated here rather than imported so neither form owns the other's clock. */
const CLAIMANT_READ_TIMEOUT_MS = 5000;

/** The DOM id of one particulars control. A separate namespace from the basis grid's
 *  (`journal-basis-…`) so the two vocabularies can never collide on one page. */
export function adjustmentFieldId(field: AdjustmentFieldId): string {
  return `periodic-adjustment-${field}`;
}

/** What the form is doing right now. Every arm is a state a human can be told about; there is no
 *  combined "error" bucket, because "the server refused these particulars", "the connection
 *  dropped" and "you may not do this" need three different next actions. */
type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  /** The lost-response resolution is in flight — the SAME intent key, re-sent. */
  | { kind: "checking" }
  | { kind: "conflict"; workId: string | null }
  /** The chosen SOURCE DOCUMENT already backs a posted entry. A DIFFERENT arm from `conflict`
   *  because the next action is the opposite one: this refusal opens impact or correction on the
   *  entry that already stands there and must NEVER be resolved by rotating the intent key. */
  | {
      kind: "sourceConflict";
      entryId: string | null;
      /** The CLAIMANT client of `entryId` — not necessarily this one, because the evidence
       *  invariant is firm-wide (`uq_entry_evidence_links_document` carries no client column).
       *  Null means it could not be resolved, and then no link is offered. */
      entryClientId: string | null;
      entryClientName: string | null;
    }
  | { kind: "denied" }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string }
  /** No answer, twice. The draft is intact and a human decides what to do. */
  | { kind: "lost"; message: string }
  /** The server refused. `field` is already mapped onto a control, or null for a form-level one. */
  | { kind: "rejected"; field: AdjustmentFormFieldId | null; reason: string | null };

export function PeriodicAdjustmentForm({ clientId }: { clientId: string }) {
  // `useRouter` IS CALLED HERE AND NOWHERE BELOW — next/navigation's hook THROWS outside an App
  // Router tree, so a View that called it could not be mounted by a node cell at all. The wrapper
  // owns the router; the View takes a plain callback. (`journal-composer.tsx`'s own split.)
  const router = useRouter();
  return (
    <PeriodicAdjustmentFormView
      clientId={clientId}
      scope={useFirmScope()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** Exported for the cells; production reads scope from context and navigates with the router. */
export function PeriodicAdjustmentFormView({
  clientId,
  scope,
  navigate,
  submit = submitPeriodicAdjustmentWork,
  storage,
  session = sessionTokenAccessor,
  loadAccounts,
  loadDocuments,
  loadSpokenFor,
  resolveEntryClient = findEntryClient,
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof submitPeriodicAdjustmentWork;
  storage?: DraftStorage | null;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  /** The evidence chooser's two reads, injectable for the same reason `loadAccounts` is. */
  loadDocuments?: () => Promise<EvidenceDocument[]>;
  loadSpokenFor?: () => Promise<SpokenForDocumentRow[]>;
  /** Names the CLAIMANT client of the entry a `source_conflict` refusal points at. */
  resolveEntryClient?: typeof findEntryClient;
}) {
  const t = useTranslations("PeriodicAdjustment");
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
  const [restored] = useState<StoredAdjustmentDraft | null>(
    () => (draftScope === null ? null : readAdjustmentDraft(draftScope, store)));
  const [intentKey, setIntentKey] = useState(() => restored?.intentKey ?? newIntentKey());
  const [draft, setDraft] = useState<AdjustmentDraft>(() => restored?.draft ?? emptyAdjustmentDraft());
  const [postingDate, setPostingDate] = useState(() => restored?.postingDate ?? "");
  const [memo, setMemo] = useState(() => restored?.memo ?? "");
  /** #634's OPTIONAL source document, on this door too. `null` is "no document", which is a CHOICE
   *  this journey supports rather than a missing value — a stocktake is often evidenced by a count
   *  sheet and a supplied obligation by a payroll summary, but neither is required by the door. It
   *  rides the draft under the SAME key and the SAME intent key, so a reload — or a lost response
   *  resolved by re-sending that key — carries the same evidence claim, never a different one. */
  const [documentId, setDocumentId] = useState<string | null>(() => restored?.documentId ?? null);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  /** Issues are shown only AFTER a submit attempt — a form that reds every field before anyone has
   *  typed is telling a human off for not having started. */
  const [showIssues, setShowIssues] = useState(false);

  const accountsRead = useAsyncRead<CoaAccountRow[]>(() =>
    loadAccounts ? loadAccounts() : listCoaAccounts(session, clientId),
  );
  // THE EVIDENCE READS, with the estate's degradation posture already applied — see
  // `useEvidenceReads`' own note. Held here rather than inside the chooser because the
  // `sourceConflict` arm below reads the RAW advisory rows to name the claimant for free.
  const evidence = useEvidenceReads(clientId, { session, loadDocuments, loadSpokenFor });
  const accounts = accountsRead.data ?? [];
  /** `null` while the chart has not been read — the unknown-account rule is SKIPPED then rather
   *  than guessed (see `validateAdjustmentDraft`'s own note). */
  const knownCodes = useMemo(
    () => (accountsRead.data === null
      ? null
      : new Set(accountsRead.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accountsRead.data],
  );

  const issues: AdjustmentIssue[] = useMemo(
    () => (showIssues ? validateAdjustmentDraft(draft, knownCodes) : []),
    [showIssues, draft, knownCodes],
  );
  const lines = useMemo(() => derivedLines(draft), [draft]);
  const movement = movementCents(draft);

  // THE BASIS FIELDS FOLLOW THE PARTICULARS UNTIL A HUMAN TOUCHES THEM, and "touched" is decided
  // BY VALUE rather than by a flag: if what is in the box is still the previous derived default,
  // it moves with the particulars; the moment it differs, it is the preparer's and is left alone.
  // A boolean flag would have been a fourth thing to keep in the stored draft and a fourth thing
  // to get wrong on restore.
  const derivedPostingDate = draft.periodEnd;
  const derivedMemo = defaultMemo(draft);
  const lastDerived = useRef({ postingDate: derivedPostingDate, memo: derivedMemo });
  useEffect(() => {
    setPostingDate((current) => (current === lastDerived.current.postingDate || current === "" ? derivedPostingDate : current));
    setMemo((current) => (current === lastDerived.current.memo || current === "" ? derivedMemo : current));
    lastDerived.current = { postingDate: derivedPostingDate, memo: derivedMemo };
  }, [derivedPostingDate, derivedMemo]);

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
    setKept(writeAdjustmentDraft(draftScope, { intentKey, draft, postingDate, memo, documentId }, store));
  }, [draftScope, intentKey, draft, postingDate, memo, documentId, store]);

  const busy = phase.kind === "submitting" || phase.kind === "checking";

  // THE FOCUS TARGETS, held as REFS rather than looked up by id — `journal-basis-fields.tsx`'s own
  // note for why. A field that unmounts (the other half of the type switch) clears its entry, so
  // `focusField` never calls `.focus()` on a detached node.
  const fields = useRef(new Map<AdjustmentFormFieldId, FieldNode>());
  const registerField = useCallback((field: AdjustmentFormFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);
  /** The narrower callback `JournalBasisFields` takes. */
  const registerBasisField = useCallback(
    (field: JournalFieldId, node: FieldNode | null) => registerField(field, node),
    [registerField],
  );

  // FOCUS HAPPENS AFTER THE RENDER THAT ENABLES THE CONTROL. Measured on the composer's own walk:
  // while a submit is in flight every control carries `disabled`, and `.focus()` on a DISABLED
  // element is a silent no-op — so a refusal named a field, the message appeared beside it, and
  // focus stayed on the Submit button. A TICK, not the field, is the state, so two identical
  // refusals in a row still move focus.
  const focusTarget = useRef<AdjustmentFormFieldId | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusField = (field: AdjustmentFormFieldId) => {
    focusTarget.current = field;
    setFocusTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (focusTick === 0) return; // the mount, which must not steal focus
    const field = focusTarget.current;
    if (field !== null) fields.current.get(field)?.focus();
  }, [focusTick]);

  /**
   * THE CLAIMANT, RESOLVED AFTER THE REFUSAL IS ALREADY ON SCREEN — the composer's own effect, and
   * its reasoning verbatim: the banner must not wait on this, and this must not outlive the banner.
   * Bounded three ways (an `AbortSignal` the cleanup fires, a timeout that fires it anyway, and a
   * re-check of the phase before the answer is written), and it runs ONLY when the advisory rows did
   * not already answer, so the common path costs no read at all.
   */
  const conflictEntryId = phase.kind === "sourceConflict" ? phase.entryId : null;
  const claimantUnresolved = phase.kind === "sourceConflict" && phase.entryClientId === null;
  useEffect(() => {
    if (!claimantUnresolved || conflictEntryId === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAIMANT_READ_TIMEOUT_MS);
    void (async () => {
      const claimant = await resolveEntryClient(conflictEntryId, { session, signal: controller.signal })
        .catch(() => null);
      if (controller.signal.aborted || claimant === null) return;
      setPhase((current) => (
        current.kind === "sourceConflict" && current.entryId === conflictEntryId
          ? { ...current, entryClientId: claimant.clientId, entryClientName: claimant.clientName }
          : current));
    })();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [claimantUnresolved, conflictEntryId, resolveEntryClient, session]);

  const set = <K extends keyof AdjustmentDraft>(key: K, value: AdjustmentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (phase.kind === "rejected") setPhase({ kind: "editing" });
  };

  /** Switching the obligation kind re-offers ITS defaults — but only over a value that is still
   *  another kind's default. A code the preparer typed is theirs and survives the switch. */
  const setObligationKind = (kind: ObligationKind) => {
    setDraft((current) => {
      const liabilityIsDefault = Object.values(STATUTORY_LIABILITY_DEFAULTS).includes(current.liabilityAccountCode);
      const expenseIsDefault = Object.values(OBLIGATION_EXPENSE_DEFAULTS).includes(current.expenseAccountCode);
      return {
        ...current,
        obligationKind: kind,
        liabilityAccountCode: liabilityIsDefault ? STATUTORY_LIABILITY_DEFAULTS[kind] : current.liabilityAccountCode,
        expenseAccountCode: expenseIsDefault ? OBLIGATION_EXPENSE_DEFAULTS[kind] : current.expenseAccountCode,
      };
    });
    if (phase.kind === "rejected") setPhase({ kind: "editing" });
  };

  /** Applies ONE runtime answer. Split out because the lost-response arm calls it for a second
   *  attempt, and two copies of this mapping would be two places a status could be classified
   *  differently. SYNCHRONOUS: every arm paints from the answer it was given. */
  const apply = (result: SubmitJournalWorkResult): void => {
    if (result.kind === "accepted") {
      // The draft is retired ONLY now: until the runtime named the Work, the typed particulars
      // were the only copy that existed.
      if (draftScope !== null) clearAdjustmentDraft(draftScope, store);
      go(workDetailHref(clientId, result.workId));
      return;
    }
    if (result.kind === "invalid_basis") {
      // TWO VOCABULARIES, ONE MAPPER EACH, AND THE ORDER IS NOT ARBITRARY. `adjustment.<key>` is
      // this form's own; everything else is the basis's, and the basis grid is rendered by the
      // very same component the composer uses, so its mapper is reused verbatim.
      const field = fieldForAdjustmentPath(result.field) ?? fieldForServerPath(result.field);
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
      //
      // WHOSE ENTRY IT IS, WITHOUT WAITING FOR IT: the advisory rows this picker already holds
      // answer for free when they name the same entry the refusal does; otherwise the effect above
      // resolves it under an AbortSignal and a timeout. A refusal is never held back by a read of
      // advisory grade.
      const advisory = (evidence.spokenFor ?? []).find(
        (r) => r.document_id === result.documentId && r.entry_id === result.entryId,
      ) ?? null;
      setPhase({
        kind: "sourceConflict",
        entryId: result.entryId,
        entryClientId: advisory?.client_id ?? null,
        entryClientName: advisory?.client_name ?? null,
      });
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
    const adjustment = toAdjustmentWire(draft, knownCodes);
    if (adjustment === null) return; // unreachable: the caller validated first
    const basis = {
      postingDate,
      memo: memo.trim(),
      currency: "MYR" as const,
      lines: lines.map((l) => ({
        accountCode: l.account_code,
        debitCents: l.debit_cents,
        creditCents: l.credit_cents,
        ...(l.description ? { description: l.description } : {}),
      })),
    };
    // OMITTED ENTIRELY when there is no document — the route reads an absent and an empty list
    // identically (`toDbSourceRefs`), and sending `[]` would be the same request with more bytes.
    const cited = documentId === null ? {} : { sourceRefs: [{ kind: "document" as const, documentId }] };
    const body = { clientId, intentKey, purpose: draft.purpose, basis, adjustment, ...cited };
    setPhase({ kind: "submitting" });
    const first = await submit(session, body);
    if (first.kind !== "lost") {
      apply(first);
      return;
    }
    // THE LOST-RESPONSE RESOLUTION. No answer was observed, so the Work may already exist. Re-send
    // the SAME intent key: the database resolves it to the row it already has (`replayed: true`)
    // or admits it for the first time. Exactly once.
    setPhase({ kind: "checking" });
    apply(await submit(session, body));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // the local duplicate-submit guard; the server's idempotency is the real one
    // …AND THE ONE REFUSAL THIS FORM MUST NEVER RE-SEND. The same intent with the same spoken-for
    // document gets the same 409 for ever; the chooser's own onChange clears the phase, so a NEW
    // choice is accepted in the tick it is made. The composer's guard, for the composer's reason:
    // disabling the control leaves `onSubmit` reachable by any other route to the event.
    if (phase.kind === "sourceConflict") return;
    setShowIssues(true);
    const found = validateAdjustmentDraft(draft, knownCodes);
    if (found.length > 0) {
      setPhase({ kind: "editing" });
      const field = firstInvalidAdjustmentField(found);
      if (field !== null) focusField(field);
      return;
    }
    void send();
  };

  // THE VIEWER ARM. The route still renders — an address a human typed deserves an explanation —
  // but it renders the DENIED state and no form at all. The floor lives in the one registry beside
  // every other floor, and the server refuses regardless.
  if (!canOpenClientLeaf(scope, "periodicAdjustment")) {
    return (
      <StateBanner tone="warning" title={tc("denied.title")}>
        {tc("denied.body")}
      </StateBanner>
    );
  }

  const issueFor = (field: AdjustmentFieldId) => issues.find((i) => i.field === field);
  const rejectedOn = (field: AdjustmentFieldId) => phase.kind === "rejected" && phase.field === field;

  /** This render's message for one control, or "" — the only thing the field wrapper needs from
   *  the form. `Field` itself is a TOP-LEVEL component (see its own note for the measured reason a
   *  component declared inside a render body cannot be one). */
  const errorFor = (f: AdjustmentFieldId): string => {
    const issue = issueFor(f);
    return issue === undefined ? "" : t(`issues.${issue.code}`);
  };

  const describedBy = (field: AdjustmentFieldId, hasHint: boolean) =>
    hasHint
      ? `${adjustmentFieldId(field)}-help ${adjustmentFieldId(field)}-error`
      : `${adjustmentFieldId(field)}-error`;

  const textProps = (field: AdjustmentFieldId, hasHint = false) => ({
    id: adjustmentFieldId(field),
    ref: (node: FieldNode | null) => registerField(field, node),
    disabled: busy,
    "aria-invalid": issueFor(field) !== undefined || rejectedOn(field) ? (true as const) : undefined,
    "aria-describedby": describedBy(field, hasHint),
  });

  // `hasHint` FOR THE SAME REASON `textProps` TAKES IT: a control whose hint is not in its
  // `aria-describedby` has a hint only sighted readers get. Three money controls on this form carry
  // one (the explicit movement, the supplied amount, and the settled figure's derivation note).
  const moneyProps = (field: AdjustmentFieldId, hasHint = false) => ({
    id: adjustmentFieldId(field),
    ref: (node: FieldNode | null) => registerField(field, node),
    disabled: busy,
    "aria-invalid": issueFor(field) !== undefined || rejectedOn(field) ? (true as const) : undefined,
    "aria-describedby": describedBy(field, hasHint),
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* THE TYPE SWITCH. A native select over two stable options: it is typeable, works at 320 px
          and at 200 % zoom, needs no portal and no focus trap, and it is the one control every
          assistive technology already knows (Appendix D's Native Select disposition). */}
      <Field field="purpose" errorText={errorFor("purpose")} label={t("purpose.label")} hint={t("purpose.help")}>
        <NativeSelect
          {...textProps("purpose", true)}
          className="w-full"
          value={draft.purpose}
          onChange={(e) => set("purpose", e.target.value as AdjustmentPurpose)}
        >
          {ADJUSTMENT_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>{t(`purpose.options.${purpose}`)}</option>
          ))}
        </NativeSelect>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field field="periodStart" errorText={errorFor("periodStart")} label={t("periodStart")}>
          <Input {...textProps("periodStart")} type="date" value={draft.periodStart}
            onChange={(e) => set("periodStart", e.target.value)} />
        </Field>
        <Field field="periodEnd" errorText={errorFor("periodEnd")} label={t("periodEnd")}>
          <Input {...textProps("periodEnd")} type="date" value={draft.periodEnd}
            onChange={(e) => set("periodEnd", e.target.value)} />
        </Field>
      </div>

      {draft.purpose === "periodic_stock_adjustment" ? (
        <>
          <Field field="method" errorText={errorFor("method")} label={t("method.label")} hint={t("method.help")}>
            <NativeSelect
              {...textProps("method", true)}
              className="w-full"
              value={draft.method}
              onChange={(e) => set("method", e.target.value as AdjustmentDraft["method"])}
            >
              {STOCK_METHODS.map((method) => (
                <option key={method} value={method}>{t(`method.options.${method}`)}</option>
              ))}
            </NativeSelect>
          </Field>
          {draft.method === "opening_closing_count" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field field="openingCents" errorText={errorFor("openingCents")} label={t("openingCents")}>
                <MoneyInput {...moneyProps("openingCents")} cents={draft.openingCents} mode="unsigned"
                  onValueChange={(c) => c.ok && set("openingCents", c.cents ?? 0)} />
              </Field>
              <Field field="closingCents" errorText={errorFor("closingCents")} label={t("closingCents")}>
                <MoneyInput {...moneyProps("closingCents")} cents={draft.closingCents} mode="unsigned"
                  onValueChange={(c) => c.ok && set("closingCents", c.cents ?? 0)} />
              </Field>
            </div>
          ) : (
            <Field field="adjustmentCents" errorText={errorFor("adjustmentCents")} label={t("adjustmentCents")} hint={t("adjustmentCentsHelp")}>
              <MoneyInput {...moneyProps("adjustmentCents", true)} cents={draft.adjustmentCents} mode="signed"
                onValueChange={(c) => c.ok && set("adjustmentCents", c.cents ?? 0)} />
            </Field>
          )}
          {/* THE MOVEMENT, SHOWN RATHER THAN ASSUMED. It is the accountant's own subtraction and
              nothing else, and seeing it is how a preparer catches a transposed figure BEFORE the
              database refuses an all-zero or a contradicted movement. */}
          {/* RENDERED THROUGH THE ONE MONEY COMPONENT, never an ICU currency argument: `Money`
              takes exact minor units and is what every other amount on this journey goes through,
              so the movement is formatted the same way the derived entry's own totals are. An ICU
              `::currency` argument would have to be handed a divided number, which is arithmetic on
              money in a message file. */}
          <p className="text-sm text-muted-foreground" data-testid="movement">
            {movement === null ? t("movementUnknown") : (
              <>{t("movementLabel")} <Money cents={movement} /></>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field field="inventoryAccountCode" errorText={errorFor("inventoryAccountCode")} label={t("inventoryAccountCode")}>
              <AccountPicker field="inventoryAccountCode" value={draft.inventoryAccountCode}
                accounts={accounts} props={textProps("inventoryAccountCode")} onPick={(v) => set("inventoryAccountCode", v)}
                placeholder={t("accountPlaceholder")} />
            </Field>
            <Field field="costAccountCode" errorText={errorFor("costAccountCode")} label={t("costAccountCode")}>
              <AccountPicker field="costAccountCode" value={draft.costAccountCode}
                accounts={accounts} props={textProps("costAccountCode")} onPick={(v) => set("costAccountCode", v)}
                placeholder={t("accountPlaceholder")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field field="countedAt" errorText={errorFor("countedAt")} label={t("countedAt")} hint={t("countedAtHelp")}>
              <Input {...textProps("countedAt", true)} type="date" value={draft.countedAt}
                onChange={(e) => set("countedAt", e.target.value)} />
            </Field>
            <Field field="countReference" errorText={errorFor("countReference")} label={t("countReference")}>
              <Input {...textProps("countReference")} value={draft.countReference}
                maxLength={COUNT_REFERENCE_MAX_CHARS}
                onChange={(e) => set("countReference", e.target.value)} />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field field="obligationKind" errorText={errorFor("obligationKind")} label={t("obligationKind.label")} hint={t("obligationKind.help")}>
            <NativeSelect
              {...textProps("obligationKind", true)}
              className="w-full"
              value={draft.obligationKind}
              onChange={(e) => setObligationKind(e.target.value as ObligationKind)}
            >
              {OBLIGATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>{t(`obligationKind.options.${kind}`)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field field="amountCents" errorText={errorFor("amountCents")} label={t("amountCents")} hint={t("amountCentsHelp")}>
            <MoneyInput {...moneyProps("amountCents", true)} cents={draft.amountCents} mode="unsigned"
              onValueChange={(c) => c.ok && set("amountCents", c.cents ?? 0)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field field="expenseAccountCode" errorText={errorFor("expenseAccountCode")} label={t("expenseAccountCode")} hint={t("defaultedHint")}>
              <AccountPicker field="expenseAccountCode" value={draft.expenseAccountCode}
                accounts={accounts} props={textProps("expenseAccountCode", true)} onPick={(v) => set("expenseAccountCode", v)}
                placeholder={t("accountPlaceholder")} />
            </Field>
            <Field field="liabilityAccountCode" errorText={errorFor("liabilityAccountCode")} label={t("liabilityAccountCode")} hint={t("defaultedHint")}>
              <AccountPicker field="liabilityAccountCode" value={draft.liabilityAccountCode}
                accounts={accounts} props={textProps("liabilityAccountCode", true)} onPick={(v) => set("liabilityAccountCode", v)}
                placeholder={t("accountPlaceholder")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field field="paymentAccountCode" errorText={errorFor("paymentAccountCode")} label={t("paymentAccountCode")} hint={t("paymentAccountHelp")}>
              <AccountPicker field="paymentAccountCode" value={draft.paymentAccountCode}
                accounts={accounts} props={textProps("paymentAccountCode", true)} onPick={(v) => set("paymentAccountCode", v)}
                placeholder={t("accountNone")} />
            </Field>
            {/* LABELLED AS A DERIVATION, because that is what it is (adversarial migration-safety
                review, N3). 0194 has no `settled_cents` particular and the route has no such key:
                this figure exists to shape the third and fourth DERIVED lines, and the split is
                recoverable from the posted entry rather than from the record of the particulars.
                Saying so on the control is the honest alternative to letting a preparer assume the
                history will state it back. */}
            <Field field="settledCents" errorText={errorFor("settledCents")} label={t("settledCents")}
              hint={t("settledCentsHelp")}>
              <MoneyInput {...moneyProps("settledCents", true)} cents={draft.settledCents} mode="unsigned"
                onValueChange={(c) => c.ok && set("settledCents", c.cents ?? 0)} />
            </Field>
          </div>
          {/* THE ADVANCE ACCOUNT IS A PARTICULAR, AND THE FORM SAYS WHAT IT CAN AND CANNOT DO.
              `clara._adv_on_approve` refuses a credit on an enrolled staff-advance account that
              does not say WHICH advance it discharges, and `book_staff_advance_application` is the
              door that does. So this field records the control relationship (the database checks
              it is a live enrolment) and the recovery itself stays with the register that owns the
              allocation — #643's "do not invent missing settlement facts", said out loud rather
              than discovered at approve. */}
          <Field field="advanceAccountCode" errorText={errorFor("advanceAccountCode")} label={t("advanceAccountCode")} hint={t("advanceAccountHelp")}>
            <AccountPicker field="advanceAccountCode" value={draft.advanceAccountCode}
              accounts={accounts} props={textProps("advanceAccountCode", true)} onPick={(v) => set("advanceAccountCode", v)}
              placeholder={t("accountNone")} />
          </Field>
          <Field field="particularsSource" errorText={errorFor("particularsSource")} label={t("particularsSource")} hint={t("particularsSourceHelp")}>
            <Input {...textProps("particularsSource", true)} value={draft.particularsSource}
              maxLength={PARTICULARS_SOURCE_MAX_CHARS}
              onChange={(e) => set("particularsSource", e.target.value)} />
          </Field>
        </>
      )}

      <Field field="instruction" errorText={errorFor("instruction")} label={t("instruction")} hint={t("instructionHelp")}>
        <Textarea {...textProps("instruction", true)} rows={2} value={draft.instruction}
          maxLength={INSTRUCTION_MAX_CHARS}
          onChange={(e) => set("instruction", e.target.value)} />
      </Field>

      {/* THE UPLOAD/REFERENCE ENTRANCE — the composer's OWN chooser, mounted here. See this file's
          header for why #643's third acceptance line is satisfied by this control rather than by a
          second door. The refusal it can attract is named beside it: a cited document that is no
          longer an active, byte-verified filing of this client comes back as a 400 whose `field` is
          `sourceRefs[N]`, which `fieldForServerPath` maps onto THIS control. */}
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

      {/* THE ENTRY THESE PARTICULARS PRODUCE. Rendered through the SAME line table the composer
          uses, and DISABLED: the database re-derives this relationship and refuses an entry whose
          lines do not say what the particulars say, so letting a preparer edit them here would be
          offering an act the door cannot admit. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">{t("preview.heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("preview.body")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldElementId("postingDate")}>{tc("postingDate")}</Label>
            <Input
              id={fieldElementId("postingDate")}
              ref={(node) => registerField("postingDate", node)}
              type="date"
              value={postingDate}
              disabled={busy}
              aria-invalid={phase.kind === "rejected" && phase.field === "postingDate" ? true : undefined}
              onChange={(e) => setPostingDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldElementId("memo")}>{tc("memo")}</Label>
            <Input
              id={fieldElementId("memo")}
              ref={(node) => registerField("memo", node)}
              value={memo}
              disabled={busy}
              aria-invalid={phase.kind === "rejected" && phase.field === "memo" ? true : undefined}
              onChange={(e) => setMemo(e.target.value)}
            />
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

      <AdjustmentPhaseBanner
        phase={phase}
        clientId={clientId}
        onRetry={() => void send()}
        onNewIntent={() => {
          // A CONFLICT IS THE ONE PLACE THE IDENTITY MAY BE ROTATED, and the rule is §3's: "Same
          // operation identity for retries; NEW INTENT gets a new identity." The database has told
          // us this key already names DIFFERENT particulars — so these are a new intent, and
          // keeping the old key would make every future submit answer the same 409.
          setIntentKey(newIntentKey());
          setPhase({ kind: "editing" });
        }}
      />

      <p className="text-xs text-muted-foreground">{kept ? tc("draftKept") : tc("draftNotKept")}</p>

      <div className="flex flex-wrap items-center gap-3">
        {/* DISABLED WHILE A SOURCE CONFLICT STANDS, because the press cannot succeed: the same
            intent with the same spoken-for document gets the same 409 for ever, and a control that
            accepts the press is the product contradicting itself. The chooser's `onChange` clears
            the phase, so choosing another document (or "No document") re-enables it in the same
            tick the choice is made. */}
        <Button type="submit" disabled={busy || phase.kind === "sourceConflict"}>
          {busy ? tc("submitting") : t("submit")}
        </Button>
        {/* A NAMED STATUS, not only a disabled button — §3's short-mutation rule; a live region
            because "Checking…" REPLACES "Submitting…" mid-flight. */}
        <span role="status" className="text-sm text-muted-foreground">
          {phase.kind === "submitting" ? tc("submitting") : phase.kind === "checking" ? tc("checking") : ""}
        </span>
      </div>
    </form>
  );
}

/**
 * One labelled control with its error slot, wired by `aria-describedby` so a screen reader reads
 * the rule WITH the field rather than in a list at the end of the form.
 *
 * IT IS A TOP-LEVEL COMPONENT, AND THAT IS A FIX RATHER THAN A STYLE CHOICE. MEASURED, in a real
 * browser (this ticket's own walk, first cut): declared inside the form's render body it was a NEW
 * component type on every render, so React unmounted and remounted its whole subtree on every
 * keystroke — the focused input was replaced mid-typing, `registerField`'s ref churned, and every
 * walk cell that typed into more than one control saw an empty form. The unit harness could not see
 * it, because it settles between events and a remount between keystrokes looks like a working form.
 */
function Field({
  field,
  label,
  hint,
  errorText,
  children,
}: {
  field: AdjustmentFieldId;
  label: string;
  hint?: string;
  errorText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={adjustmentFieldId(field)}>{label}</Label>
      {hint === undefined ? null : (
        <p id={`${adjustmentFieldId(field)}-help`} className="text-xs text-muted-foreground">{hint}</p>
      )}
      {children}
      <p id={`${adjustmentFieldId(field)}-error`} className="text-xs text-error" role="alert">
        {errorText}
      </p>
    </div>
  );
}

/** The client's ACTIVE chart as a native select, with a free-text fallback when the chart could
 *  not be read — the same degradation the composer's line picker makes, for the same reason. */
function AccountPicker({
  field,
  value,
  accounts,
  props,
  onPick,
  placeholder,
}: {
  field: AdjustmentFieldId;
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
function AdjustmentPhaseBanner({
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
  const t = useTranslations("PeriodicAdjustment");
  const tc = useTranslations("JournalComposer");
  const tmj = useTranslations("ManualJournal");
  const tWalk = useTranslations("WalkFindings728");
  if (phase.kind === "editing" || phase.kind === "submitting" || phase.kind === "checking") return null;

  if (phase.kind === "sourceConflict") {
    // NO "TRY AGAIN", AND NO NEW INTENT KEY. The document is spoken for; rotating the identity and
    // pressing again is exactly the second effect the rule prevents. The only forward moves are to
    // open the entry that already stands on it, or to choose another document in the chooser above.
    //
    // THE CLAIMANT LINE SITS OUTSIDE THE LIVE REGION, and that is the composer's measured shape
    // (#728 delta review round 4, finding [7]): `StateBanner tone="error"` computes `role="alert"`,
    // an assertive region that re-announces the WHOLE box on any mutation — so the alert carries the
    // refusal and nothing else, and the late-arriving claimant line is a plain sibling with no role.
    const elsewhere = phase.entryClientId !== null && phase.entryClientId !== clientId;
    const claimantHref = phase.entryId === null || phase.entryClientId === null
      ? null
      : journalEntryHref(phase.entryClientId, phase.entryId);
    return (
      <div className="flex w-full max-w-prose flex-col items-start gap-1.5">
        <StateBanner tone="error" title={tmj("sourceConflict.title")}>
          {tmj("sourceConflict.body")}
        </StateBanner>
        {claimantHref === null ? null : (
          <p className="text-sm text-muted-foreground">
            {elsewhere ? (
              <>
                {tWalk("sourceConflictElsewhere", {
                  client: phase.entryClientName ?? tWalk("evidenceSpokenForUnnamedClient"),
                })}
                {" "}
              </>
            ) : null}
            <Link
              href={claimantHref}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {tmj("sourceConflict.link")}
            </Link>
          </p>
        )}
      </div>
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
  // `lost` and `unavailable` share a shape and differ in what they SAY: one reports that nothing
  // was admitted, the other that nobody can tell yet. Both keep the draft and both offer the same
  // next action — press again, with the SAME intent key.
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
