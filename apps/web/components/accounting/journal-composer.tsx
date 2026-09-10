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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { businessToday } from "@/lib/business-date";
import { listCoaAccounts } from "@/lib/journals/api";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { canOpenClientLeaf, workDetailHref, type NavigationScope } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { submitJournalWork, type SubmitJournalWorkResult } from "@/lib/work/api";
import {
  fieldForServerPath,
  firstInvalidField,
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
}: {
  clientId: string;
  scope: NavigationScope & { firm_id?: string; user_id?: string };
  navigate: (href: string) => void;
  submit?: typeof submitJournalWork;
  storage?: DraftStorage | null;
  session?: SessionTokenAccessor;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
}) {
  const t = useTranslations("JournalComposer");
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

  const draft = useMemo(() => ({ postingDate, memo, lines }), [postingDate, memo, lines]);
  const issues: JournalIssue[] = useMemo(
    () => (showIssues ? validateJournalDraft(draft, knownCodes) : []),
    [showIssues, draft, knownCodes],
  );

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
    setKept(writeJournalDraft(draftScope, { intentKey, ...draft }, store));
  }, [draftScope, intentKey, draft, store]);

  const busy = phase.kind === "submitting" || phase.kind === "checking";

  // THE FOCUS TARGETS, held as REFS rather than looked up by id — see
  // `RegisterField`'s own note for why. A field that unmounts (a removed line)
  // clears its entry, so `focusField` never calls `.focus()` on a detached node.
  const fields = useRef(new Map<JournalFieldId, FieldNode>());
  const registerField = useCallback((field: JournalFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  }, []);
  const focusField = (field: JournalFieldId) => {
    fields.current.get(field)?.focus();
  };

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
    setPhase({ kind: "submitting" });
    const first = await submit(session, { clientId, intentKey, basis });
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
    apply(await submit(session, { clientId, intentKey, basis }));
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
        <Textarea
          id={fieldElementId("memo")}
          ref={(node) => registerField("memo", node)}
          rows={2}
          value={memo}
          disabled={busy}
          aria-invalid={issues.some((i) => i.field === "memo") ? true : undefined}
          aria-describedby={`${fieldElementId("memo")}-error`}
          onChange={(e) => setMemo(e.target.value)}
        />
        <p id={`${fieldElementId("memo")}-error`} className="text-xs text-error" role="alert">
          {issues.find((i) => i.field === "memo") ? t("issues.memoRequired") : ""}
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
        <Button type="submit" disabled={busy}>
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
