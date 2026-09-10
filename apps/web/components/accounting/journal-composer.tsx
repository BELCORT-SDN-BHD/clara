"use client";

// C3 — THE DIRECT ACCOUNTING ENTRY POINT for a documentless journal.
//
// A bookkeeper types a posting date, a memo and at least two exact-cent lines,
// and presses one button. What that button does is NOT "write a journal entry":
// it ADMITS a durable Work, and the persistent outcome the human is sent to is
// that Work's own page. The distinction is the whole ticket — the entry is
// posted later, by a run, through the database's own authority boundary, and
// this form is deliberately not in that path.
//
// THE THREE THINGS THIS COMPONENT OWNS, and each is a rule from the refresh
// spec's shared control contract (§3) rather than a preference:
//
//   THE DRAFT AND ITS INTENT IDENTITY. `intentKey` is minted once, when the
//   draft starts, and travels with the draft in `sessionStorage`
//   (lib/work/journal-draft.ts). Every attempt at THESE figures carries THAT
//   key, so a lost acknowledgement resolves to the Work already admitted rather
//   than admitting a second one. The draft is filed under user+firm+client, so a
//   scope switch cannot carry it into another client's books.
//
//   THE LOST-RESPONSE ARM. §3: "Show checking/reconnecting and read the current
//   receipt/state BEFORE allowing a distinct resubmit." A network failure is not
//   an error to show — it is an UNKNOWN, and this form resolves it by re-POSTing
//   the same intent key exactly once and reading what the database says. Only if
//   that second attempt also gets no answer does a human see a Retry.
//
//   A BUSINESS REFUSAL IS NEVER A TOAST. §3: "Inline Alert describes the concrete
//   constraint, current state and available next action. No generic red toast."
//   Every refusal below renders as a `StateBanner` in the form, carrying the
//   runtime's own words, with the one next action that actually exists.
//
// WHAT IT DOES NOT DO: paint an outcome. There is no optimistic "posted" state,
// no progress bar, no percentage. A 202 means ADMITTED, and the next thing the
// human sees is the Work's own page reading its real status from the database.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { JournalBasisFields, fieldElementId, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { useFirmScope } from "@/components/firm-scope-provider";
import { StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { businessToday } from "@/lib/business-date";
import { listCoaAccounts } from "@/lib/journals/api";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { canOpenClientLeaf, journalEntryHref, workDetailHref, type NavigationScope } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { submitJournalWork, type SubmitJournalWorkResult } from "@/lib/work/api";
import { listClientEvidenceDocuments, type EvidenceDocument } from "@/lib/work/evidence";
import {
  MEMO_MAX_CHARS,
  charsLeft,
  fieldForServerPath,
  firstInvalidField,
  showCharsLeft,
  toJournalBasisWire,
  validateJournalDraft,
  type JournalDraftLine,
  type JournalFieldId,
  type JournalIssue,
} from "@/lib/work/journal-basis";
import {
  clearJournalDraft,
  defaultDraftStorage,
  emptyDraftLines,
  newIntentKey,
  readJournalDraft,
  writeJournalDraft,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import type { CoaAccountRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** What the form is doing right now. Every arm is a state a human can be told
 *  about; there is no combined "error" bucket, because "the server refused
 *  these figures", "the connection dropped" and "you may not do this" need
 *  three different next actions. */
type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  /** The lost-response resolution is in flight — the SAME intent key, re-sent. */
  | { kind: "checking" }
  | { kind: "conflict"; workId: string | null }
  /** #634 — the chosen SOURCE DOCUMENT already backs a posted entry. A separate
   *  arm from `conflict` because the next action is the opposite one: this
   *  refusal opens IMPACT OR CORRECTION on the entry that already stands there,
   *  and must NOT offer a new intent key — rotating the identity and pressing
   *  again is exactly the second effect the rule prevents. */
  | { kind: "sourceConflict"; entryId: string | null }
  | { kind: "denied" }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string }
  /** No answer, twice. The draft is intact and a human decides what to do. */
  | { kind: "lost"; message: string }
  /** The runtime rejected the basis. `field` is already mapped onto a control. */
  | { kind: "rejected"; field: JournalFieldId | null; reason: string | null };

export function JournalComposer({ clientId }: { clientId: string }) {
  // `useRouter` IS CALLED HERE AND NOWHERE BELOW, deliberately: next/navigation's
  // hook THROWS ("invariant expected app router to be mounted") outside an App
  // Router tree, so a View that called it could not be mounted by a node cell at
  // all. The wrapper owns the router; the View takes a plain callback.
  const router = useRouter();
  return (
    <JournalComposerView
      clientId={clientId}
      scope={useFirmScope()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** Exported for the cells; production reads scope from context and navigates
 *  with the router. `submit`/`storage`/`loadAccounts` are injectable for the
 *  same reason `AccountingHubView`'s scope is: a node cell has no App Router and
 *  no `sessionStorage`, and a form's state machine is worth testing without one. */
export function JournalComposerView({
  clientId,
  scope,
  navigate,
  submit = submitJournalWork,
  storage,
  session = sessionTokenAccessor,
  loadAccounts,
  loadDocuments,
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof submitJournalWork;
  storage?: DraftStorage | null;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadDocuments?: () => Promise<EvidenceDocument[]>;
}) {
  const t = useTranslations("JournalComposer");
  /** #634's own copy lives in its own namespace (`ManualJournal`) rather than
   *  being folded into `JournalComposer` — the manual-JV journey spans this
   *  form, the Work detail's late attachment and the journals table, and one
   *  namespace for one journey keeps those three surfaces' words together. */
  const tm = useTranslations("ManualJournal");
  const go = navigate;

  // THE DRAFT SCOPE, or null. A caller whose firm/user could not be read does
  // NOT get a partial key — it gets no persistence at all, and the form says so
  // rather than promising a reload recovery it cannot deliver (§3).
  const draftScope: JournalDraftScope | null = useMemo(
    () =>
      scope.firm_id && scope.user_id
        ? { userId: scope.user_id, firmId: scope.firm_id, clientId }
        : null,
    [scope.firm_id, scope.user_id, clientId],
  );
  const store = storage === undefined ? defaultDraftStorage() : storage;

  // ONE LAZY INITIALISER, so the restore happens before the first paint rather
  // than as an effect that would flash an empty form first. `useState`'s
  // initialiser runs once per mount, and the route remounts per client (the
  // client layout's scope key), so a switch cannot carry state across.
  const [restored] = useState(() => (draftScope === null ? null : readJournalDraft(draftScope, store)));
  const [intentKey, setIntentKey] = useState(() => restored?.intentKey ?? newIntentKey());
  const [postingDate, setPostingDate] = useState(() => restored?.postingDate ?? businessToday());
  const [memo, setMemo] = useState(() => restored?.memo ?? "");
  const [lines, setLines] = useState<JournalDraftLine[]>(() => restored?.lines ?? emptyDraftLines());
  /** #634 — THE OPTIONAL SOURCE DOCUMENT. `null` is "no document", which is a
   *  CHOICE this journey supports rather than a missing value: the raw balanced
   *  JV is the expert path and evidence is optional where the operation permits
   *  it. It rides the draft under the SAME user+firm+client key and the SAME
   *  intent key, so a reload — or a lost response resolved by re-sending that
   *  key — carries the same evidence claim, never a different one. */
  const [documentId, setDocumentId] = useState<string | null>(() => restored?.documentId ?? null);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  /** Issues are shown only AFTER a submit attempt — a form that reds every field
   *  before anyone has typed is telling a human off for not having started. */
  const [showIssues, setShowIssues] = useState(false);

  const accountsRead = useAsyncRead<CoaAccountRow[]>(() =>
    loadAccounts ? loadAccounts() : listCoaAccounts(session, clientId),
  );
  const accounts = accountsRead.data ?? [];
  /** `null` while the chart has not been read — the unknown-account rule is
   *  SKIPPED then rather than guessed (see validateJournalDraft's own note). */
  const knownCodes = useMemo(
    () => (accountsRead.data === null ? null : new Set(accountsRead.data.filter((a) => a.is_active).map((a) => a.account_code))),
    [accountsRead.data],
  );

  // THE DOCUMENTS READ IS ITS OWN FAILURE, like the chart's: a preparer who
  // wanted no document is not blocked by a documents surface that is down, and
  // the admission door re-checks the document against the client's live filings
  // regardless. So it degrades to "no document" rather than to a dead form.
  const documentsRead = useAsyncRead<EvidenceDocument[]>(() =>
    loadDocuments ? loadDocuments() : listClientEvidenceDocuments(clientId, { session }),
  );
  const documents = documentsRead.data ?? [];

  const draft = useMemo(() => ({ postingDate, memo, lines }), [postingDate, memo, lines]);
  const issues: JournalIssue[] = useMemo(
    () => (showIssues ? validateJournalDraft(draft, knownCodes) : []),
    [showIssues, draft, knownCodes],
  );
  const memoIssue = issues.find((i) => i.field === "memo");

  // PERSIST ON EVERY EDIT. Not debounced: the payload is small, the storage is
  // synchronous, and a debounce is exactly how a draft goes missing when a tab
  // is closed a moment after the last keystroke.
  //
  // THE OUTCOME IS STATE, NOT A REF, and that is the difference between telling
  // a human the truth and telling them nothing: `writeJournalDraft` reports
  // whether the browser actually kept it (a private window, a quota refusal),
  // and a ref would record that answer where no re-render ever reads it — the
  // "this browser is not keeping your draft" line would then never appear.
  const [kept, setKept] = useState(draftScope !== null);
  useEffect(() => {
    if (draftScope === null) {
      setKept(false);
      return;
    }
    setKept(writeJournalDraft(draftScope, { intentKey, ...draft, documentId }, store));
  }, [draftScope, intentKey, draft, documentId, store]);

  const busy = phase.kind === "submitting" || phase.kind === "checking";

  // THE FOCUS TARGETS, held as REFS rather than looked up by id — see
  // `RegisterField`'s own note for why. A field that unmounts (a removed line)
  // clears its entry, so `focusField` never calls `.focus()` on a detached node.
  const fields = useRef(new Map<JournalFieldId, FieldNode>());
  const registerField = useCallback((field: JournalFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);

  /**
   * FOCUS HAPPENS AFTER THE RENDER THAT ENABLES THE CONTROL, and that ordering
   * is the whole reason this is an effect rather than a direct call.
   *
   * MEASURED, in a real browser (this ticket's own walk): while a submit is in
   * flight every control on this form carries `disabled`, and `.focus()` on a
   * DISABLED element is a silent no-op. The 400 arm below sets the phase to
   * `rejected` — which is what re-enables them — and then asked for focus in the
   * same tick, before React had re-rendered. So the server named a field, the
   * message appeared beside it, and focus stayed on the Submit button. The unit
   * harness could not see it: its stub `focus()` has no notion of `disabled`.
   *
   * A TICK, NOT THE FIELD, IS THE STATE. Two identical refusals in a row name
   * the same control, and a state that only held the field id would not change —
   * so the effect would not re-run and the second refusal would move nothing.
   */
  const focusTarget = useRef<JournalFieldId | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusField = (field: JournalFieldId) => {
    focusTarget.current = field;
    setFocusTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (focusTick === 0) return; // the mount, which must not steal focus
    const field = focusTarget.current;
    if (field !== null) fields.current.get(field)?.focus();
  }, [focusTick]);

  /** Applies ONE runtime answer. Split out because the lost-response arm calls
   *  it for a second attempt, and two copies of this mapping would be two places
   *  a status could be classified differently. */
  const apply = (result: SubmitJournalWorkResult): void => {
    if (result.kind === "accepted") {
      // The draft is retired ONLY now: until the runtime named the Work, the
      // typed figures were the only copy that existed.
      if (draftScope !== null) clearJournalDraft(draftScope, store);
      go(workDetailHref(clientId, result.workId));
      return;
    }
    if (result.kind === "invalid_basis") {
      const field = fieldForServerPath(result.field);
      setPhase({ kind: "rejected", field, reason: result.reason });
      if (field !== null) focusField(field);
      return;
    }
    if (result.kind === "conflict") {
      setPhase({ kind: "conflict", workId: result.workId });
      return;
    }
    if (result.kind === "source_conflict") {
      // THE CHOICE IS PRESERVED, and the control is focused: the document the
      // human picked stays picked so they can see WHICH one is spoken for, and
      // the only forward moves are "open that entry" or "choose another
      // document" — never a resubmit of this same intent.
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
    setPhase(result.kind === "lost" ? { kind: "lost", message: result.message } : { kind: "unavailable", message: result.message });
  };

  const send = async () => {
    const basis = toJournalBasisWire(draft, knownCodes);
    if (basis === null) return; // unreachable: the caller validated first
    // OMITTED ENTIRELY when there is no document — the route reads an absent and
    // an empty list identically, and sending `[]` would be the same request with
    // more bytes and one more shape for a reader to reason about.
    const evidence = documentId === null ? {} : { sourceRefs: [{ kind: "document" as const, documentId }] };
    setPhase({ kind: "submitting" });
    const first = await submit(session, { clientId, intentKey, basis, ...evidence });
    if (first.kind !== "lost") {
      apply(first);
      return;
    }
    // THE LOST-RESPONSE RESOLUTION. No answer was observed, so the Work may
    // already exist. Re-send the SAME intent key: the database resolves it to
    // the row it already has (`replayed: true`) or admits it for the first time.
    // Exactly once — a loop here would be a client deciding to hammer a runtime
    // that is already not answering.
    setPhase({ kind: "checking" });
    apply(await submit(session, { clientId, intentKey, basis, ...evidence }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // the local duplicate-submit guard; the server's idempotency is the real one
    setShowIssues(true);
    const found = validateJournalDraft(draft, knownCodes);
    if (found.length > 0) {
      setPhase({ kind: "editing" });
      const field = firstInvalidField(found);
      if (field !== null) focusField(field);
      return;
    }
    void send();
  };

  // THE VIEWER ARM. The route still renders — an address a human typed deserves
  // an explanation — but it renders the DENIED state and no form at all. The
  // floor lives in the one registry beside every other floor, and the server
  // refuses regardless (lib/navigation/tree.ts's own note on this leaf).
  if (!canOpenClientLeaf(scope, "journalComposer")) {
    return (
      <StateBanner tone="warning" title={t("denied.title")}>
        {t("denied.body")}
      </StateBanner>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldElementId("postingDate")}>{t("postingDate")}</Label>
          {/* A PLAIN DATE INPUT THAT ACCEPTS TYPING. §3's dates-and-money rule
              asks for precise typing alongside a picker; `type="date"` is the
              browser's own, which types AND picks and never guesses a locale
              order the way a free-text field would. The value is the ISO
              calendar day the database stores, with no timezone applied to it. */}
          <Input
            id={fieldElementId("postingDate")}
            ref={(node) => registerField("postingDate", node)}
            type="date"
            value={postingDate}
            disabled={busy}
            aria-invalid={issues.some((i) => i.field === "postingDate") ? true : undefined}
            aria-describedby={`${fieldElementId("postingDate")}-error`}
            onChange={(e) => setPostingDate(e.target.value)}
          />
          <p id={`${fieldElementId("postingDate")}-error`} className="text-xs text-error" role="alert">
            {issues.find((i) => i.field === "postingDate")
              ? t(`issues.${issues.find((i) => i.field === "postingDate")!.code}`)
              : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldElementId("memo")}>{t("memo")}</Label>
        {/* `maxLength` IS THE FROZEN TOOL SCHEMA'S CAP (lib/work/journal-basis.ts
            states where both caps come from), restated at the control so the
            browser stops rather than letting a preparer write four thousand and
            one characters the runtime will refuse by name. */}
        <Textarea
          id={fieldElementId("memo")}
          ref={(node) => registerField("memo", node)}
          rows={2}
          value={memo}
          disabled={busy}
          maxLength={MEMO_MAX_CHARS}
          aria-invalid={memoIssue === undefined ? undefined : true}
          aria-describedby={`${fieldElementId("memo")}-error ${fieldElementId("memo")}-left`}
          onChange={(e) => setMemo(e.target.value)}
        />
        {/* NEAR THE CAP ONLY, and never a live region — see the same treatment on
            a line's narration for why. */}
        <p id={`${fieldElementId("memo")}-left`} className="text-xs text-muted-foreground">
          {showCharsLeft(memo, MEMO_MAX_CHARS) ? t("charactersLeft", { count: charsLeft(memo, MEMO_MAX_CHARS) }) : ""}
        </p>
        <p id={`${fieldElementId("memo")}-error`} className="text-xs text-error" role="alert">
          {/* The ISSUE'S OWN code, not a fixed sentence: "enter a memo" and "this
              memo is too long" are different instructions, and the control has
              two rules now. */}
          {memoIssue === undefined ? "" : t(`issues.${memoIssue.code}`)}
        </p>
      </div>

      <JournalBasisFields
        lines={lines}
        onChange={setLines}
        accounts={accounts}
        issues={issues}
        disabled={busy}
        registerField={registerField}
      />

      {/* #634 — EVIDENCE, AND IT IS OPTIONAL.
          The raw balanced JV stays an EXPERT PATH: an entry may be recorded with
          no document at all, and this section says so in words rather than
          leaving a preparer to infer it from an empty control. "No document" is
          the DEFAULT OPTION and is selectable on purpose — a chooser whose empty
          state is only the absence of a choice cannot be re-chosen with the
          keyboard once something has been picked.

          A NATIVE <select> RATHER THAN A COMBOBOX. Appendix D asks for the
          simplest control that carries the job: this list is a client's filed
          documents (tens, not thousands), a native select is typeable, works at
          320 px and at 200 % zoom, needs no portal and no focus trap, and it is
          the one control every assistive technology already knows. */}
      <div className="flex flex-col gap-1.5">
        {/* A REAL `<label for>`, not a `<legend>`. MEASURED, on this ticket's own
            browser walk: a `<fieldset>`/`<legend>` around ONE control gives the
            group a name and leaves the `<select>` itself nameless — axe-core's
            `select-name` rule is critical about exactly that, and a screen
            reader landing on the control would hear no name at all. The other
            two controls on this form are labelled the same way; this one now
            matches them. */}
        <Label htmlFor={fieldElementId("evidence")}>{tm("evidence.legend")}</Label>
        <p id={`${fieldElementId("evidence")}-help`} className="text-xs text-muted-foreground">
          {tm("evidence.help")}
        </p>
        {/* `NativeSelect`, NOT a hand-rolled `<select>`: the account picker on
            every line and the late-attachment dialog both use it, and it is what
            carries the house focus ring, the disabled treatment and the
            `aria-invalid` border. A bare element here looked almost right and
            showed the browser's default focus outline instead of the product's —
            one control on this form behaving unlike every other. */}
        <NativeSelect
          id={fieldElementId("evidence")}
          ref={(node) => registerField("evidence", node)}
          className="w-full"
          value={documentId ?? ""}
          disabled={busy}
          aria-invalid={phase.kind === "sourceConflict" || (phase.kind === "rejected" && phase.field === "evidence") ? true : undefined}
          aria-describedby={`${fieldElementId("evidence")}-help ${fieldElementId("evidence")}-error`}
          onChange={(e) => {
            setDocumentId(e.target.value === "" ? null : e.target.value);
            // A REFUSAL ABOUT THE OLD CHOICE IS RETIRED BY MAKING A NEW ONE.
            // Leaving the conflict Alert up beside a document that is no longer
            // selected would be the form describing a state that has passed.
            if (phase.kind === "sourceConflict" || (phase.kind === "rejected" && phase.field === "evidence")) {
              setPhase({ kind: "editing" });
            }
          }}
        >
          <option value="">{tm("evidence.none")}</option>
          {documents.map((doc) => (
            <option key={doc.documentId} value={doc.documentId}>
              {evidenceOptionLabel(doc, tm)}
            </option>
          ))}
        </NativeSelect>
        <p id={`${fieldElementId("evidence")}-error`} className="text-xs text-error" role="alert">
          {phase.kind === "rejected" && phase.field === "evidence" ? tm("evidence.invalid") : ""}
        </p>
        {/* The documents read degrades ON ITS OWN, exactly as the chart read
            does: no document is a valid answer, so a failed list must not stop a
            submit. */}
        {documentsRead.error !== null ? (
          <StateBanner
            tone="warning"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void documentsRead.reload()}>
                {t("retry")}
              </Button>
            }
          >
            {tm("evidence.unavailable")}
          </StateBanner>
        ) : null}
      </div>

      {/* THE CHART READ IS A SEPARATE FAILURE FROM THE FORM'S. A preparer who
          knows the code can still submit; the commit rechecks every account
          against the live chart anyway. So this degrades rather than blocking. */}
      {accountsRead.error !== null ? (
        <StateBanner tone="warning" action={<Button type="button" variant="outline" size="sm" onClick={() => void accountsRead.reload()}>{t("retry")}</Button>}>
          {t("accountsUnavailable")}
        </StateBanner>
      ) : null}

      <ComposerPhaseBanner
        phase={phase}
        clientId={clientId}
        onRetry={() => void send()}
        onNewIntent={() => {
          // A CONFLICT IS THE ONE PLACE THE IDENTITY MAY BE ROTATED, and the
          // rule is §3's: "Same operation identity for retries; NEW INTENT gets
          // a new identity." The database has told us this key already names
          // DIFFERENT figures — so these figures are a new intent, and keeping
          // the old key would make every future submit answer the same 409. The
          // typed lines are kept; only the identity moves.
          setIntentKey(newIntentKey());
          setPhase({ kind: "editing" });
        }}
      />

      <p className="text-xs text-muted-foreground">{kept ? t("draftKept") : t("draftNotKept")}</p>

      <div className="flex flex-wrap items-center gap-3">
        {/* NO RESUBMIT OF A SPOKEN-FOR DOCUMENT. `sourceConflict` is the one
            refusal on this form that pressing again cannot change: the document
            already backs a posted entry, so the SAME intent re-sent gets the
            SAME 409 for ever. Leaving the button live said otherwise — the
            banner's own copy claims "no resubmit", and a control that still
            accepts the press is the product contradicting itself. The chooser's
            `onChange` clears the phase, so choosing another document (or "No
            document") re-enables it in the same tick the choice is made; that
            is the forward move, along with opening the entry that stands there. */}
        <Button type="submit" disabled={busy || phase.kind === "sourceConflict"}>
          {busy ? t("submitting") : t("submit")}
        </Button>
        {/* THE PENDING LABEL IS A NAMED STATUS, not only a disabled button —
            §3's short-mutation rule, and the reason it is a live region is that
            "Checking…" REPLACES "Submitting…" mid-flight and a human who cannot
            see the button must be told the difference. */}
        <span role="status" className="text-sm text-muted-foreground">
          {phase.kind === "submitting" ? t("submitting") : phase.kind === "checking" ? t("checking") : ""}
        </span>
      </div>
    </form>
  );
}

/** Every non-editing phase, as ONE inline banner with ONE next action. Split out
 *  so the form body above stays readable and so each arm's copy sits together
 *  where a reviewer can compare them. */
function ComposerPhaseBanner({
  phase,
  clientId,
  onRetry,
  onNewIntent,
}: {
  phase: Phase;
  clientId: string;
  /** Re-sends the SAME intent key. Offered only on the two arms where nothing
   *  is known to have been admitted or where the server said it is not
   *  accepting — never on a refusal, which a retry cannot change (doors.ts's
   *  own rule: a refusal is retired by the human changing something). */
  onRetry: () => void;
  /** Rotates the intent identity, keeping the typed figures. Offered on the
   *  conflict arm only — see its call site for why that is the one place. */
  onNewIntent: () => void;
}) {
  const t = useTranslations("JournalComposer");
  const tm = useTranslations("ManualJournal");
  if (phase.kind === "editing" || phase.kind === "submitting" || phase.kind === "checking") return null;

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
        title={t("conflict.title")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onNewIntent}>
              {t("conflict.newDraft")}
            </Button>
            {/* THE LINK IS OFFERED ONLY WHEN THE RESPONSE NAMED THE WORK. A card
                never invents a destination: without a work id there is no
                address to send anyone to, and `/clients/x/work/undefined` is a
                404 dressed as an affordance. */}
            {phase.workId === null ? null : (
              <Link
                href={workDetailHref(clientId, phase.workId)}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                {t("conflict.link")}
              </Link>
            )}
          </div>
        }
      >
        {t("conflict.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "sourceConflict") {
    // A PERSISTENT ALERT, AND NO RESUBMIT. The document is spoken for, so the
    // only honest forward moves are to look at the entry that already stands on
    // it (impact / correction) or to choose a different document — and neither
    // is "press submit again", which is why this arm offers no retry and no new
    // intent key, AND why the form's primary Submit is disabled for as long as
    // this phase stands (see its call site).
    return (
      <StateBanner
        tone="error"
        title={tm("sourceConflict.title")}
        action={
          phase.entryId === null ? undefined : (
            <Link
              href={journalEntryHref(clientId, phase.entryId)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {tm("sourceConflict.link")}
            </Link>
          )
        }
      >
        {tm("sourceConflict.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "denied") {
    return (
      <StateBanner tone="warning" title={t("denied.title")}>
        {t("denied.body")}
      </StateBanner>
    );
  }
  if (phase.kind === "notFound") {
    return (
      <StateBanner tone="neutral" title={t("notFound.title")}>
        {t("notFound.body")}
      </StateBanner>
    );
  }
  // `lost` and `unavailable` share a shape and differ in what they SAY: one
  // reports that nothing was admitted, the other that nobody can tell yet.
  // Both keep the draft and both offer the same next action — press again, with
  // the SAME intent key, so a Work that WAS admitted resolves instead of a
  // second one being created.
  return (
    <StateBanner
      tone="error"
      title={phase.kind === "lost" ? t("lost.title") : t("unavailable.title")}
      code={phase.message}
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      }
    >
      {phase.kind === "lost" ? t("lost.body") : t("unavailable.body")}
    </StateBanner>
  );
}

/** One document, as a single readable option: its filename, what KIND of
 *  document it is, and the date it belongs to. Built here rather than in the
 *  read so the words are translated and the shape stays a plain string — a
 *  native `<option>` renders text, not markup, and a screen reader reads exactly
 *  what is written here. */
function evidenceOptionLabel(
  doc: EvidenceDocument,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const name = doc.filename ?? t("evidence.unnamed");
  const kind = doc.kind ?? t("evidence.unknownKind");
  // The document's own business date when it has one; otherwise the day it was
  // filed to this client. Sliced to the calendar day rather than re-formatted:
  // this journey is about EXACT dates, and a locale re-render here would be a
  // second date format beside the posting-date control's ISO one.
  const date = (doc.financialDate ?? doc.filedAt).slice(0, 10);
  return t("evidence.option", { name, kind, date });
}
