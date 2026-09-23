"use client";

// #653 — THE CONFIGURE FORM. It asks four things and derives everything else.
//
// WHAT IT ASKS, and why each one is a human judgement rather than a derivation:
//   · WHICH posted prepayment — chosen from `clara.list_prepayment_attention`'s ARM B, which is
//     the evaluator's OWN predicate (approved, document-bound, exactly one debited asset line). A
//     free-text entry id would be a control whose only likely outcome is `prepayment_source_unfit`.
//   · WHICH INSTRUCTION authorises it — a Select over this client's own `clara.accounting_work`,
//     the plans form's own control (`plan-form.tsx`). `clara.create_accounting_plan` RESOLVES the
//     reference and refuses `authority_ref_unresolved` when it names nothing, so this cannot be
//     derived from the recognition: an entry id is never a Work id, and a form that sent one could
//     only ever be refused. A blocked submit beats a fabricated authority.
//   · WHICH expense account — a Select over the client's OWN chart (appendix D row 49; a Combobox
//     would be right for a large chart and the control degrades to one honestly by listing only
//     ACTIVE expense accounts).
//   · WHY that account — REQUIRED (appendix D row 18's pairing rule, and 0140's own
//     `prepayment_target_underivable`/`basis_missing`): a classification with no recorded grounds
//     is refused rather than saved unexplained.
//   · WHAT the schedule is for.
//
// WHAT IT DOES NOT ASK, and each absence is a rule:
//   · THE AMOUNT, THE PERIODS AND THE ALLOCATION — derived by the FROZEN
//     `clara.prepayment_schedule_v1` from the recognition entry's own prepaid leg and the
//     document's own service period. There is NO Calendar/Popover date picker on this form for the
//     same reason: the term is not this form's to state.
//   · THE CADENCE — monthly, each period's own month end. Migration 0223's `_assert_plan_schedule`
//     refuses a typed one for this kind, so a control here could only ever produce a refusal.
//
// THE PREVIEW IS A DISABLED TABLE, AFTER THE FACT. The door answers with the derived allocation;
// the form renders it read-only so a person can SEE what they configured before leaving the page.
// It is a preview, never an editor — #643's `periodic-adjustment-form.tsx` established the idiom
// and this lane needs it more, because these figures were not typed by anyone.
//
// A REFUSAL KEEPS THE DRAFT, NAMES ITSELF VERBATIM, AND SAYS THE PREPAYMENT IS STILL POSTED. That
// last sentence is #653's own: a create-time refusal leaves a prepaid asset on the books with
// nothing tracking it, and the person needs to know the money did not go away with their form.
// Never a toast (appendix C §3) — a StateBanner that stays.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { DataTableCard } from "@/components/common/data-table-card";
import { StateBanner } from "@/components/common/state";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import { PrepaymentBoundaryStatement, PrepaymentConfigurationStatement } from "./prepayment-statement";
import { listCoaAccounts } from "@/lib/journals/api";
// THE INSTRUCTION PICKER'S OWN READ, reused rather than re-cut. `lib/plans/api.ts` owns it, its
// header says why it lives there rather than in `lib/work/reads.ts`, and the amortisation plan this
// form configures cites authority through the SAME `clara.accounting_work` reference the plans form
// does — a second reader would be a second answer to one question.
import { listPlanAuthorityWork } from "@/lib/plans/api";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  createPrepaymentSchedule, loadPrepaymentAttention, recordPrepaymentStatedTerm,
  type AttentionUnscheduled, type PrepaymentCreated,
} from "@/lib/prepayments/api";
import {
  EMPTY_PREPAYMENT_DRAFT, PREPAYMENT_TIMEZONE, firstInvalidPrepaymentField,
  prepaymentFieldElementId, prepaymentRefusalKey, residualIndex, validatePrepaymentDraft,
  type PrepaymentDraft, type PrepaymentFieldId, type PrepaymentIssue,
} from "@/lib/prepayments/schedule";
import { prepaymentAccountsHref, prepaymentDetailHref, prepaymentsHref } from "@/lib/navigation/tree";
// #940 — the per-client PREPAYMENT-ACCOUNT ROSTER. The form reads it for ONE reason: arm B can now
// be empty because nothing is enrolled, which is a different fact with a different next act from
// "this client has nothing unamortised", and a single empty state for both would send a person
// looking for a prepayment that is sitting right there.
import { loadPrepaymentAccounts } from "@/lib/registers/prepayment-accounts";
import Link from "next/link";
import { isDoorRefusal } from "@/lib/doors";

type FieldNode = { focus: () => void };

export function PrepaymentForm({
  clientId,
  /** The recognition prefilled from an attention row, so arm B's "configure the schedule" lands on
   *  a form that already knows which prepayment it is about. */
  entryId = null,
}: {
  clientId: string;
  entryId?: string | null;
}) {
  const t = useTranslations("Prepayments");
  const router = useRouter();

  const accounts = useAsyncRead(() => listCoaAccounts(sessionTokenAccessor, clientId));
  const attention = useAsyncRead(() => loadPrepaymentAttention(clientId));
  const instructions = useAsyncRead(() => listPlanAuthorityWork(clientId));
  // #940 — HYDRATE, NEVER ASSUME. `roster.data === null` means "not answered yet, or the read
  // failed", and the empty-roster sentence below is gated on a real EMPTY ARRAY: an absent answer
  // is not evidence of an empty roster, which is the false-absence class review law 2 exists for.
  const roster = useAsyncRead(() => loadPrepaymentAccounts(sessionTokenAccessor, clientId));
  const rosterEmpty = roster.data !== null && roster.data.length === 0;

  const [draft, setDraft] = useState<PrepaymentDraft>({
    ...EMPTY_PREPAYMENT_DRAFT,
    sourceEntryId: entryId ?? "",
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [created, setCreated] = useState<PrepaymentCreated | null>(null);

  // ONE OP KEY PER SUBMITTED DECISION: minted on the first attempt and reused for every retry of
  // the SAME figures, so a lost response replays through `clara._reserve_op` rather than asking a
  // second question. Changing a field renews it — that is a different decision. Migration 0223
  // asks its reservation BEFORE the duplicate check so this replay actually wins.
  const opKeyRef = useRef<string | null>(null);
  const renewKey = () => {
    opKeyRef.current = null;
  };
  const opKey = () => {
    if (opKeyRef.current === null) opKeyRef.current = crypto.randomUUID();
    return opKeyRef.current;
  };

  const unscheduled: readonly AttentionUnscheduled[] = attention.data?.unscheduled ?? [];
  const chosen = unscheduled.find((r) => r.entry_id === draft.sourceEntryId) ?? null;
  // #939 -- WHICH CARRIER the chosen recognition's term lives in. The read says so; the fallback
  // reproduces the pre-0305 answer for a database at an earlier frontier, where a recognition with
  // no document could not be chosen at all.
  const chosenCarrier = chosen === null
    ? null
    : chosen.term_carrier ?? (chosen.document_id === null ? "human_stated" : "document_service_period");

  const expenseAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.is_active && a.account_type === "expense"),
    [accounts.data],
  );
  const knownExpense = useMemo(
    () => (accounts.data === null ? null : new Set(expenseAccounts.map((a) => a.account_code))),
    [accounts.data, expenseAccounts],
  );

  const issues: PrepaymentIssue[] = validatePrepaymentDraft(draft, knownExpense);

  const fields = useRef(new Map<PrepaymentFieldId, FieldNode>());
  const register = (field: PrepaymentFieldId, node: FieldNode | null) => {
    if (node === null) fields.current.delete(field);
    else fields.current.set(field, node);
  };

  // The prefill arrives from the URL; when the attention read lands later it is already chosen.
  useEffect(() => {
    if (entryId !== null && draft.sourceEntryId === "") setDraft((d) => ({ ...d, sourceEntryId: entryId }));
  }, [entryId, draft.sourceEntryId]);

  const message = (field: PrepaymentFieldId): string | null => {
    if (!attempted) return null;
    const issue = issues.find((i) => i.field === field);
    if (issue === undefined) return null;
    const codes: Record<string, string> = {
      sourceRequired: t("issueSourceRequired"),
      authorityRequired: t("issueAuthorityRequired"),
      accountRequired: t("issueAccountRequired"),
      accountUnknown: t("issueAccountUnknown"),
      basisRequired: t("issueBasisRequired"),
      purposeRequired: t("issuePurposeRequired"),
    };
    return codes[issue.code] ?? issue.code;
  };

  const patch = (next: Partial<PrepaymentDraft>) => {
    renewKey();
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const submit = async () => {
    setAttempted(true);
    const found = validatePrepaymentDraft(draft, knownExpense);
    if (found.length > 0) {
      fields.current.get(firstInvalidPrepaymentField(found))?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const answer = await createPrepaymentSchedule({
        clientId,
        sourceEntryId: draft.sourceEntryId,
        expenseAccountCode: draft.expenseAccountCode.trim(),
        expenseAccountBasis: draft.expenseAccountBasis.trim(),
        purpose: draft.purpose.trim(),
        // The instruction is a Work of THIS client, CHOSEN above. There is no fallback: the door
        // resolves this reference, and the recognition entry's own id would resolve to nothing.
        authorityRef: { kind: "accounting_work", id: draft.authorityWorkId },
        opKey: opKey(),
      });
      setCreated(answer);
      setBusy(false);
      if (answer.overlap_warning === null) {
        router.push(prepaymentDetailHref(clientId, answer.schedule_id));
      }
    } catch (e) {
      // THE DRAFT IS KEPT (appendix C §3). Every field a person typed is still on screen, and the
      // banner below names the database's own refusal plus the sentence that matters most here:
      // the prepayment itself is still posted and still needs a schedule.
      setFailure(e);
      setBusy(false);
    }
  };

  // THE TYPED DISCRIMINANT, from the governed refusal itself. A transport failure is not a
  // refusal and carries no `reason`, so it falls through to the database's own words below
  // rather than being dressed as one of this lane's tokens.
  const refusalKey = prepaymentRefusalKey(
    failure !== null && isDoorRefusal(failure) ? failure.reason : null);
  // #940 — THE AXIS, not just the reason. `prepayment_source_unfit` covers five different facts;
  // the roster one is the only one whose remedy is on ANOTHER page, so it is the only one that
  // needs a link. Read off the refusal's own typed detail, never inferred from its message.
  const notEnrolled = failure !== null && isDoorRefusal(failure)
    && failure.detail?.axis === "prepaid_account_not_enrolled";

  return (
    <div className="flex flex-col gap-6">
      <PrepaymentBoundaryStatement />
      <PrepaymentConfigurationStatement />

      {failure === null ? null : (
        <StateBanner tone="error" title={t("refusalTitle")}>
          <span className="flex flex-col gap-1">
            <span>{refusalKey === "unknown" ? null : t(refusalKey)}</span>
            {/* THE DATABASE'S OWN WORDS, always — a refusal this build has not enumerated is still
                legible rather than reduced to a key path. */}
            <ErrorMessage error={failure} />
            {notEnrolled ? (
              <span className="flex flex-col gap-1 text-xs">
                <span>{t("refusalNotEnrolled")}</span>
                <Link className="underline" href={prepaymentAccountsHref(clientId)}>
                  {t("refusalNotEnrolledLink")}
                </Link>
              </span>
            ) : null}
            <span className="text-xs">{t("refusalPostedAnyway")}</span>
          </span>
        </StateBanner>
      )}

      {created?.overlap_warning == null ? null : (
        <StateBanner
          tone="warning"
          title={t("overlapTitle")}
          action={
            <Button variant="outline" size="sm" onClick={() => router.push(prepaymentsHref(clientId))}>
              {t("overlapContinue")}
            </Button>
          }
        >
          {t("overlapBody", {
            templates: created.overlap_warning.templates.map((x) => x.name).join(", "),
          })}
        </StateBanner>
      )}

      {/* #940 — WHY THERE MAY BE NOTHING TO CHOOSE. The roster gates amortisation ahead of the
          shared eligibility wall, so a client with no enrolled account has an EMPTY arm B however
          many prepayments it has posted. Said here, above the control, with the panel one click
          away — a person should never have to guess that the list is empty for a reason. */}
      {rosterEmpty ? (
        <StateBanner tone="warning" title={t("rosterEmptyTitle")}>
          <span className="flex flex-col gap-1">
            <span>{t("rosterEmptyBody")}</span>
            <Link className="underline" href={prepaymentAccountsHref(clientId)}>
              {t("rosterEmptyLink")}
            </Link>
          </span>
        </StateBanner>
      ) : null}

      <p className="max-w-prose text-sm text-muted-foreground">
        {t("derivedNote", { timezone: PREPAYMENT_TIMEZONE })}
      </p>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={prepaymentFieldElementId("sourceEntry")}>
            {t("fieldSource")}
          </label>
          <p className="max-w-prose text-xs text-muted-foreground">{t("sourceNote")}</p>
          <DataState
            loading={attention.loading}
            error={attention.error}
            isEmpty={unscheduled.length === 0}
            emptyMessage={t("sourceEmpty")}
          >
            <NativeSelect
              id={prepaymentFieldElementId("sourceEntry")}
              ref={(node) => register("sourceEntry", node)}
              value={draft.sourceEntryId}
              disabled={busy}
              aria-invalid={message("sourceEntry") === null ? undefined : true}
              aria-describedby={`${prepaymentFieldElementId("sourceEntry")}-error`}
              onChange={(e) => patch({ sourceEntryId: e.target.value })}
            >
              <option value="">{t("sourceChoose")}</option>
              {/* #939 -- A MEMO-ONLY RECOGNITION SAYS SO IN THE OPTION ITSELF. Without it the two
                  lanes look identical in this list and the term question that follows arrives with
                  no explanation. */}
              {unscheduled.map((row) => (
                <option key={row.entry_id} value={row.entry_id}>
                  {`${(row.amount_cents / 100).toFixed(2)} on ${row.posting_date} — ${row.prepaid_account_code}`
                    + (row.document_id === null ? ` (${t("sourceOptionNoDocument")})` : "")}
                </option>
              ))}
            </NativeSelect>
          </DataState>
          {/* THE TERM IS NOT THIS FORM'S TO DERIVE. When the chosen recognition has no live term,
              say so HERE rather than letting the door refuse after a submit -- and say which act
              produces one, because the two lanes have different answers. A DOCUMENT-bound
              recognition's term is recorded on its document, somewhere else entirely. A MEMO-ONLY
              one has nowhere else: the term is a statement by the person in front of the screen,
              so the act belongs on this page and is offered here. */}
          {chosen !== null && !chosen.has_live_term && chosenCarrier === "document_service_period" ? (
            <StateBanner tone="warning">{t("sourceNeedsTerm")}</StateBanner>
          ) : null}
          {chosen !== null && !chosen.has_live_term && chosenCarrier === "human_stated" ? (
            <>
              <StateBanner tone="warning">{t("sourceNeedsStatedTerm")}</StateBanner>
              <StatedTermStatement
                clientId={clientId}
                entryId={chosen.entry_id}
                busy={busy || attention.busy}
                act={attention.act}
              />
            </>
          ) : null}
          <FieldError id={`${prepaymentFieldElementId("sourceEntry")}-error`}>
            {message("sourceEntry")}
          </FieldError>
        </div>

        {/* THE INSTRUCTION, and it is a field rather than a derivation. The door resolves it
            against this client's own Work; when the client has none, the empty state says so
            instead of offering a control whose every value would be refused. */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={prepaymentFieldElementId("authority")}>
            {t("fieldAuthority")}
          </label>
          <p className="max-w-prose text-xs text-muted-foreground">{t("authorityNote")}</p>
          <DataState
            loading={instructions.loading}
            error={instructions.error}
            isEmpty={(instructions.data?.rows ?? []).length === 0}
            emptyMessage={t("authorityEmpty")}
          >
            <NativeSelect
              id={prepaymentFieldElementId("authority")}
              ref={(node) => register("authority", node)}
              value={draft.authorityWorkId}
              disabled={busy}
              aria-invalid={message("authority") === null ? undefined : true}
              aria-describedby={`${prepaymentFieldElementId("authority")}-error`}
              onChange={(e) => patch({ authorityWorkId: e.target.value })}
            >
              <option value="">{t("authorityChoose")}</option>
              {(instructions.data?.rows ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.memo ?? w.intent_key} — {String(w.created_at ?? "").slice(0, 10)}
                </option>
              ))}
            </NativeSelect>
          </DataState>
          <FieldError id={`${prepaymentFieldElementId("authority")}-error`}>
            {message("authority")}
          </FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={prepaymentFieldElementId("expenseAccount")}>
            {t("fieldExpense")}
          </label>
          <p className="max-w-prose text-xs text-muted-foreground">{t("expenseNote")}</p>
          {accounts.error !== null ? <StateBanner tone="warning">{t("accountsUnavailable")}</StateBanner> : null}
          <NativeSelect
            id={prepaymentFieldElementId("expenseAccount")}
            ref={(node) => register("expenseAccount", node)}
            value={draft.expenseAccountCode}
            disabled={busy}
            aria-invalid={message("expenseAccount") === null ? undefined : true}
            aria-describedby={`${prepaymentFieldElementId("expenseAccount")}-error`}
            onChange={(e) => patch({ expenseAccountCode: e.target.value })}
          >
            <option value="">{t("expenseChoose")}</option>
            {expenseAccounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} — {a.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError id={`${prepaymentFieldElementId("expenseAccount")}-error`}>
            {message("expenseAccount")}
          </FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={prepaymentFieldElementId("expenseBasis")}>
            {t("fieldExpenseBasis")}
          </label>
          <p className="max-w-prose text-xs text-muted-foreground">{t("expenseBasisNote")}</p>
          <Textarea
            id={prepaymentFieldElementId("expenseBasis")}
            ref={(node) => register("expenseBasis", node)}
            value={draft.expenseAccountBasis}
            disabled={busy}
            required
            aria-invalid={message("expenseBasis") === null ? undefined : true}
            aria-describedby={`${prepaymentFieldElementId("expenseBasis")}-error`}
            onChange={(e) => patch({ expenseAccountBasis: e.target.value })}
          />
          <FieldError id={`${prepaymentFieldElementId("expenseBasis")}-error`}>
            {message("expenseBasis")}
          </FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={prepaymentFieldElementId("purpose")}>
            {t("fieldPurpose")}
          </label>
          <p className="max-w-prose text-xs text-muted-foreground">{t("purposeNote")}</p>
          <Input
            id={prepaymentFieldElementId("purpose")}
            ref={(node) => register("purpose", node)}
            value={draft.purpose}
            disabled={busy}
            aria-invalid={message("purpose") === null ? undefined : true}
            aria-describedby={`${prepaymentFieldElementId("purpose")}-error`}
            onChange={(e) => patch({ purpose: e.target.value })}
          />
          <FieldError id={`${prepaymentFieldElementId("purpose")}-error`}>{message("purpose")}</FieldError>
        </div>
      </section>

      {created === null ? null : <DerivedAllocation created={created} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? t("saving") : t("submitCreate")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => router.push(prepaymentsHref(clientId))}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/** THE DERIVED ALLOCATION, DISABLED. A preview of what each period posts — never an editor, and
 *  never a set of figures anybody typed. */
function DerivedAllocation({ created }: { created: PrepaymentCreated }) {
  const t = useTranslations("Prepayments");
  const residual = residualIndex(created.period_lines);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="prepayment-allocation-heading">
      <h2 id="prepayment-allocation-heading" className="text-base font-semibold">
        {t("allocationHeading")}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">{t("allocationBody")}</p>
      <fieldset disabled className="m-0 border-0 p-0">
        <DataTableCard label={t("allocationTableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colPeriod")}</TableHead>
              <TableHead>{t("colPostsOn")}</TableHead>
              <TableHead>{t("colAmount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {created.period_lines.map((line, i) => (
              <TableRow key={line.period_end}>
                <TableCell className="text-muted-foreground">
                  {line.period_start} – {line.period_end}
                </TableCell>
                {/* EACH PERIOD POSTS ON ITS OWN `period_end`, which is what makes the
                    `period_end = due_date` join exact. Showing the period and the posting date in
                    two columns is how a reader can see that for themselves. */}
                <TableCell>{line.period_end}</TableCell>
                <TableCell>
                  <Money cents={Number(line.amount_cents)} />
                  {i === residual ? (
                    <span className="block text-xs text-muted-foreground">{t("residualNote")}</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </fieldset>
    </section>
  );
}

/**
 * #939 — THE ONE ACT THAT MAKES A MEMO-ONLY PREPAYMENT SCHEDULABLE.
 *
 * It lives on the configure form rather than behind its own page because it is not a separate
 * errand: the person is here to amortise this prepayment, and stating the period is the first half
 * of that. `clara.record_prepayment_stated_term` is a bookkeeper-floored human door with NO agent
 * grant and no wake wrapper — Clara may ask the two-date question and never answers it — so every
 * value below is typed by the person, and none of them is prefilled from anything a model produced.
 *
 * THE REASON IS REQUIRED, and this form refuses a blank one before the door does. A term with no
 * stated grounds is the unexplained judgement the whole fact-with-a-basis discipline exists to
 * prevent, and the door's own `prepayment_stated_term_reason_missing` is the backstop rather than
 * the first line.
 *
 * HYDRATE-NEVER-TRUST: the write runs inside `attention.act`, which re-reads the attention band
 * unconditionally afterwards. The prompt above disappears because the DATABASE now reports a live
 * term, never because this component decided it had succeeded.
 *
 * ONE OP KEY PER STATEMENT, renewed whenever a field changes — a retry of the SAME dates replays
 * through `clara._reserve_op`; a different statement is a different decision.
 */
function StatedTermStatement({
  clientId, entryId, busy, act,
}: {
  clientId: string;
  entryId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("Prepayments");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const keyRef = useRef<string | null>(null);
  const opKey = () => {
    if (keyRef.current === null) keyRef.current = crypto.randomUUID();
    return keyRef.current;
  };
  const renew = () => { keyRef.current = null; };

  const issues: string[] = [];
  if (start.trim() === "" || end.trim() === "") issues.push(t("stateTermIssueDates"));
  else if (end < start) issues.push(t("stateTermIssueOrder"));
  if (reason.trim() === "") issues.push(t("stateTermIssueReason"));

  const submit = async () => {
    setAttempted(true);
    if (issues.length > 0) return;
    const ok = await act(async () => {
      try {
        await recordPrepaymentStatedTerm({
          clientId, sourceEntryId: entryId,
          periodStart: start, periodEnd: end, reason: reason.trim(), opKey: opKey(),
        });
      } catch (e) {
        setFailure(e);
        throw e;
      }
    });
    if (ok) { setFailure(null); setAttempted(false); }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      aria-labelledby="prepayment-stated-term-heading"
      data-testid="prepayment-state-term"
    >
      <h3 id="prepayment-stated-term-heading" className="text-sm font-semibold">
        {t("stateTermHeading")}
      </h3>
      <p className="max-w-prose text-xs text-muted-foreground">{t("stateTermBody")}</p>
      {failure === null ? null : (
        <StateBanner tone="error" title={t("stateTermRefusalTitle")}>
          <ErrorMessage error={failure} />
        </StateBanner>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="prepayment-stated-term-start">
          {t("stateTermStart")}
        </label>
        <Input
          id="prepayment-stated-term-start"
          type="date"
          value={start}
          disabled={busy}
          onChange={(e) => { renew(); setStart(e.target.value); }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="prepayment-stated-term-end">
          {t("stateTermEnd")}
        </label>
        <Input
          id="prepayment-stated-term-end"
          type="date"
          value={end}
          disabled={busy}
          onChange={(e) => { renew(); setEnd(e.target.value); }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="prepayment-stated-term-reason">
          {t("stateTermReason")}
        </label>
        <Textarea
          id="prepayment-stated-term-reason"
          value={reason}
          disabled={busy}
          required
          onChange={(e) => { renew(); setReason(e.target.value); }}
        />
      </div>
      {!attempted || issues.length === 0 ? null : (
        <p className="text-xs text-error" role="alert">{issues[0]}</p>
      )}
      <div>
        <Button
          id="prepayment-stated-term-submit"
          size="sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? t("stateTermSaving") : t("stateTermSubmit")}
        </Button>
      </div>
    </section>
  );
}

/** One control's error, beside the control and wired by `aria-describedby` — the same shape
 *  `plan-form.tsx` uses, so a prepayment field and a plan field read alike. */
function FieldError({ id, children }: { id: string; children: string | null }) {
  return (
    <p id={id} className="text-xs text-error" role={children === null ? undefined : "alert"}>
      {children ?? ""}
    </p>
  );
}
