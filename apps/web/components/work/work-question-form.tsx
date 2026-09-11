"use client";

// #629 (B4) — THE ONE FORM. Rendered from the Work detail, from the Needs-you inbox and from a
// Clara rail card, over the SAME `clara.get_work_question` record, posting to the SAME
// `clara.answer_work_question` door. There is no per-surface variant, because the acceptance line
// is "render the same pending and settled record on B3/B4/B6 rather than creating surface-specific
// questions" and a second form is how two surfaces come to offer two answers.
//
// ONE FACT IS A FIELD; A RELATED SET IS A BOUNDED WALK. The interaction contract's own words. One
// declared field renders as a single `Field` and submits from there. Two to six render as a
// stepper with LOCAL next/back, per-step validation and a REVIEW step — local navigation only:
// this component owns the walk and the values, and the DATABASE owns whether the answer is
// acceptable, whether the question is still open and what happens next. §5: "Questionnaire owns
// local fields and progression; it cannot decide authority, persist its own competing question, or
// restart accounting from a stale tool part."
//
// THE SHADCN AI "QUESTIONNAIRE" ITEM WAS CHECKED AND IS NOT INSTALLABLE HERE. `apps/web/
// components.json` carries `"registries": {}` — no registry is configured — so the item cannot be
// added without first configuring a registry, which is a project-configuration change and (for the
// AI-elements family) a new npm dependency. The stepper below is therefore built on the primitives
// this project already has and has already contrast-checked: `Field`/`FieldGroup`, `Input`,
// `Textarea`, `RadioGroup`, `Select`, `Button`, `StateBanner`. Recorded as a decision with its
// evidence, not as a preference.
//
// FOUR THINGS THIS FORM WILL NOT DO.
//   · It will not force a guess. "Leave pending" is a first-class action beside Submit, because
//     the honest answer to "which date?" is sometimes "I need to check".
//   · It will not throw away a draft. A validation refusal, a conflict, a stale version and an
//     answered-elsewhere convergence all KEEP what was typed — a still-useful draft is exactly what
//     the contract refuses to discard, and the person may need it for a correction.
//   · It will not emit a second effect from a stale card. Every convergence RE-READS the
//     authoritative record and renders that; nothing here retries a write on its own.
//   · It will not announce WHERE SOMETHING ELSE ALREADY DOES. `announce` decides, and the default
//     is "self" because the honest default is the one that speaks: mounted on the Work detail or
//     expanded in a Needs-you row, this form IS the thing that changed and its banners carry the
//     computed `role` `StateBanner` gives them. Mounted in the Clara transcript — a log that
//     announces its own updates — it is passed `announce="none"`, and every state renders as the
//     same box with the same text and no live region at all. §5: one announcement owner per
//     transition, never two saying the same thing.
//
// THIS FORM OWNS NO MONEY PARSER AND NO MONEY CONTROL. `components/common/money-input.tsx` is the
// product's one cents-entry module — raw keystroke fidelity, exact string parsing, a typed
// accepted/refused result and the visible refusal copy — and the money field renders through it,
// exactly as the journal composer's line editor does. A question that asks for an amount and the
// composer that posts one must not disagree about what "1234,56" means.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/common/money-input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { StateBanner } from "@/components/common/state";
import {
  answerOpKey,
  answerWorkQuestion,
  clearWorkAnswerDraft,
  getWorkQuestion,
  readWorkAnswerDraft,
  workAnswerDraftKey,
  writeWorkAnswerDraft,
  type AnswerRefusal,
  type WorkAnswerDraft,
  type WorkQuestionField,
  type WorkQuestionRecord,
} from "@/lib/work/questions";
import {
  buildAnswer,
  isRequired,
  isSingleField,
  optionsOf,
  parseMoneyToCents,
  validateDraft,
  validateField,
} from "@/lib/work/question-fields";
import { formatCents } from "@/lib/bank/money";
import type { WorkAnswerValue, WorkQuestionAccount } from "@/lib/work/questions";

/** Who speaks when this form changes state. See the header: "self" is the default and the honest
 *  one; "none" is for a surface that already owns the announcement boundary. */
export type WorkQuestionAnnounce = "self" | "none";

export type WorkQuestionFormProps = {
  record: WorkQuestionRecord;
  /** The signed-in person, for the draft key's user half. */
  userId: string;
  /** Called with the ACCEPTED record after a successful answer, so the surface can re-read the
   *  Work it belongs to. The form does not navigate and does not reload the page. */
  onAnswered?: (record: WorkQuestionRecord) => void;
  /** Called when the surface should drop this question from its list (answered, or converged onto
   *  a settled record). A row leaving a list must not dump focus onto the body — the caller owns
   *  where focus goes, because only it knows what is left. */
  onSettled?: () => void;
  /** "Leave pending" — the surface decides what closing means (collapse the row, close the sheet).
   *  Absent means the affordance is not offered, which is correct on a page that IS the question. */
  onLeavePending?: () => void;
  /** Who announces (§5). Default "self". Pass "none" inside a surface that already owns the
   *  announcement boundary — the Clara transcript is the one that does. */
  announce?: WorkQuestionAnnounce;
  /** TRUE while a submit is in flight. A surface that can UNMOUNT this form (the Needs-you row's
   *  Close toggle) must not offer that while the write is out: unmounting cancels the form's own
   *  `alive` guard, the accepted answer never reaches `onAnswered`, and the row stays in a queue
   *  that has no poll to correct it. */
  onBusy?: (busy: boolean) => void;
  /** The client's chart, for an `account` field. Absent or empty means the control degrades to a
   *  typed code — honestly, and with the same server-side validation behind it. */
  accounts?: readonly WorkQuestionAccount[] | null;
};

type Phase = "editing" | "submitting" | "accepted" | "converged" | "denied";

export function WorkQuestionForm({
  record, userId, onAnswered, onSettled, onLeavePending, onBusy,
  announce = "self", accounts = null,
}: WorkQuestionFormProps) {
  const t = useTranslations("WorkQuestion");
  const silent = announce === "none";
  /** EVERY CONTROL ID IN THIS FORM IS SCOPED TO THIS MOUNT. Needs-you lets two rows be expanded at
   *  once, and a `wq-posting_date` shared between them makes one row's `<label>` point at the
   *  other's input and one row's `aria-describedby` name the other's error. React's own per-mount
   *  id, sanitised the way `MoneyInput` sanitises it, is the scope. */
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const idFor = useCallback((key: string) => `${uid}-wq-${key}`, [uid]);
  const fields = useMemo(() => (Array.isArray(record.fields) ? record.fields : []), [record.fields]);
  const single = isSingleField(fields);
  const draftKey = useMemo(
    () =>
      workAnswerDraftKey({
        userId,
        firmId: record.firm_id,
        clientId: record.client_id,
        questionId: record.question_id,
        version: record.question_version,
      }),
    [userId, record.firm_id, record.client_id, record.question_id, record.question_version],
  );

  const [draft, setDraft] = useState<WorkAnswerDraft>(() => readWorkAnswerDraft(draftKey) ?? {});
  const [note, setNote] = useState<string>(() => String(readWorkAnswerDraft(draftKey)?.note ?? ""));
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>(record.status === "pending" ? "editing" : "converged");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<AnswerRefusal | null>(null);
  /** A field the SERVER named, to be focused once the step carrying it has actually rendered. A
   *  multi-field question submits from the REVIEW step, where no control is mounted, so focusing
   *  inside the submit handler reached a null ref and the refusal was invisible: the step is moved
   *  first, and the focus happens in an effect after that render. */
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [authoritative, setAuthoritative] = useState<WorkQuestionRecord>(record);
  const controlRefs = useRef<Record<string, HTMLElement | null>>({});
  /**
   * THE LAST ACCEPTED CENTS PER MONEY FIELD, and it exists for one measured reason.
   *
   * `MoneyInput` is CONTROLLED by `cents` and re-syncs its own raw text whenever that prop moves
   * away from what it last emitted (components/common/money-input.tsx:65-71) — which is right, and
   * which means a `cents` derived from the draft would CLEAR the box the instant a keystroke made
   * the draft unparseable: type `1200`, then a third decimal, and the text a person is in the
   * middle of correcting vanishes. So the prop is fed from the last value the control itself
   * accepted, which does not move on a refusal; the DRAFT still takes the refused text, so the
   * field's own validation names `integer_cents` and the draft survives a convergence with what
   * was actually typed.
   */
  const moneyCents = useRef<Record<string, number | null>>({});
  const moneySeeded = useRef(false);
  if (!moneySeeded.current) {
    // A RESTORED DRAFT must reach the control as cents, or a person who comes back to a half-filled
    // question sees an empty amount box beside a filled one.
    moneySeeded.current = true;
    for (const field of fields) {
      if (field.kind !== "money") continue;
      const raw = draft[field.key];
      moneyCents.current[field.key] = typeof raw === "number" ? raw : parseMoneyToCents(String(raw ?? ""));
    }
  }
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The draft is written on EVERY change rather than on a timer: a person who navigates away
  // mid-sentence has already lost the timer's window, and there is nothing expensive about a
  // handful of small string writes.
  const setValue = useCallback(
    (key: string, value: WorkAnswerValue) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        writeWorkAnswerDraft(draftKey, { ...next, note });
        return next;
      });
      setProblems((prev) => (prev[key] === undefined ? prev : { ...prev, [key]: "" }));
    },
    [draftKey, note],
  );

  const setNoteValue = useCallback(
    (value: string) => {
      setNote(value);
      writeWorkAnswerDraft(draftKey, { ...draft, note: value });
    },
    [draft, draftKey],
  );

  /** Focus the FIRST invalid control. The contract asks for the first invalid field or a linked
   *  error summary; this form has the controls in hand, so it focuses one. */
  const focusFirstProblem = useCallback((keys: readonly string[]) => {
    for (const key of keys) {
      const el = controlRefs.current[key];
      if (el) {
        el.focus();
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (focusTarget === null) return;
    const el = controlRefs.current[focusTarget];
    if (el) el.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const reread = useCallback(async (): Promise<WorkQuestionRecord | null> => {
    const fresh = await getWorkQuestion(record.question_id).catch(() => null);
    if (fresh && alive.current) setAuthoritative(fresh);
    return fresh;
  }, [record.question_id]);

  const submit = useCallback(async () => {
    const found = validateDraft(fields, draft);
    if (found.length > 0) {
      setProblems(Object.fromEntries(found.map((p) => [p.field, p.constraint])));
      focusFirstProblem(found.map((p) => p.field));
      return;
    }
    setPhase("submitting");
    setRefusal(null);
    const answer = buildAnswer(fields, draft, note);
    const outcome = await answerWorkQuestion(
      record.question_id,
      record.question_version,
      answer,
      // STABLE per (question, version, draft): a retry after a lost response REPLAYS rather than
      // answering twice, and an edited draft is a new intent with its own key.
      answerOpKey(record.question_id, record.question_version, { ...draft, note }),
    );
    if (!alive.current) return;
    if (outcome.ok) {
      clearWorkAnswerDraft(draftKey);
      const fresh = await reread();
      if (!alive.current) return;
      // THE RECEIPT IS AUTHORITY ENOUGH. A transient `get_work_question` failure after the door
      // ACCEPTED the answer used to leave `authoritative` on the pending record, so the accepted
      // view rendered dashes for the values and for the attribution — about an answer the database
      // had taken. The door's own receipt carries who, when and which version, and the answer is
      // the object this form just sent, so the settled record is reconstructed from the two rather
      // than from a read that did not happen.
      const settledRecord: WorkQuestionRecord = fresh ?? {
        ...authoritative,
        status: "answered",
        answer,
        answered_by: outcome.receipt.answered_by,
        answered_role: outcome.receipt.answered_role,
        answered_at: outcome.receipt.answered_at,
        question_version: outcome.receipt.question_version,
      };
      if (fresh === null) setAuthoritative(settledRecord);
      setPhase("accepted");
      onAnswered?.(settledRecord);
      onSettled?.();
      return;
    }
    setRefusal(outcome.refusal);
    if (outcome.refusal.kind === "invalid") {
      setPhase("editing");
      if (outcome.refusal.field) {
        const field = outcome.refusal.field;
        setProblems({ [field]: outcome.refusal.constraint ?? "invalid" });
        // BRING THE REFUSED FIELD BACK INTO VIEW. A bounded walk submits from the review step,
        // where the control the server named is not mounted at all — so the error rendered
        // nowhere and the focus call reached a null ref. The step is moved to the field first
        // (`note` is on the review step already, and so is every field of a single-field
        // question), and the focus happens in the effect above, after that render.
        const index = fields.findIndex((f) => f.key === field);
        if (index >= 0 && !single) setStep(index);
        setFocusTarget(field);
      }
      return;
    }
    if (outcome.refusal.kind === "in_flight") {
      // NOTHING MOVED. The same op key is held by this browser's own uncommitted previous press, so
      // the form stays a form: re-read (cheap, and it is what proves nothing moved), return to
      // editing with the draft intact, and leave the SAME Submit — which replays the SAME key —
      // in front of the person. Emphatically NOT `onSettled`: on Needs-you that drops the row.
      await reread();
      if (!alive.current) return;
      setPhase("editing");
      return;
    }
    if (outcome.refusal.kind === "converge") {
      // THE DRAFT SURVIVES. It is kept in state and in storage, and rendered as a note beside the
      // authoritative answer, because it may be exactly what a correction needs.
      await reread();
      if (!alive.current) return;
      setPhase("converged");
      onSettled?.();
      return;
    }
    if (outcome.refusal.kind === "denied") {
      setPhase("denied");
      return;
    }
    // Transport. Nothing is known about whether the answer landed, so the SAME key is offered
    // again — the next press replays rather than answers twice.
    setPhase("editing");
  }, [draft, draftKey, fields, focusFirstProblem, note, onAnswered, onSettled, record.question_id, record.question_version, reread]);

  const submitting = phase === "submitting";
  useEffect(() => { onBusy?.(submitting); }, [onBusy, submitting]);

  // ---------------------------------------------------------------------
  // Settled renderings.
  // ---------------------------------------------------------------------

  // THE ORDER OF THESE TWO IS LOAD-BEARING. A convergence lands on a record that is very often
  // `answered` — by somebody else — so an accepted-first check would render the winner's answer
  // with no explanation of why this person's own submit did not take, and no kept draft. The
  // convergence is the FRAME; the authoritative answer renders inside it.
  if (phase === "converged" || (record.status !== "pending" && phase !== "submitting" && phase !== "accepted")) {
    return (
      <div className="flex flex-col gap-3" data-testid="work-question-converged">
        <StateBanner tone="warning" silent={silent}>
          {t(convergeKeyFor(refusal, authoritative))}
        </StateBanner>
        {authoritative.status === "answered" ? <AcceptedAnswer record={authoritative} fields={fields} silent={silent} /> : null}
        <KeptDraft draft={draft} note={note} fields={fields} label={t("draftKept")} />
      </div>
    );
  }

  if (phase === "accepted" || (phase !== "submitting" && authoritative.status === "answered")) {
    return <AcceptedAnswer record={authoritative} fields={fields} silent={silent} />;
  }

  if (phase === "denied") {
    return (
      <div className="flex flex-col gap-3" data-testid="work-question-denied">
        <StateBanner tone="error" silent={silent}>{refusal?.message ?? t("denied")}</StateBanner>
        <KeptDraft draft={draft} note={note} fields={fields} label={t("draftKept")} />
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // The editing surface.
  // ---------------------------------------------------------------------

  const visible = single ? fields : step < fields.length ? [fields[step]!] : [];
  const reviewing = !single && step >= fields.length;
  const busy = phase === "submitting";

  const advance = () => {
    const field = fields[step];
    if (!field) return;
    const constraint = validateField(field, draft[field.key]);
    if (constraint !== null) {
      setProblems({ [field.key]: constraint });
      focusFirstProblem([field.key]);
      return;
    }
    setProblems({});
    setStep((s) => Math.min(s + 1, fields.length));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="work-question-form">
      <QuestionHeading record={record} />

      {!single ? (
        <p className="text-xs text-secondary-ink" data-testid="work-question-progress">
          {reviewing
            ? t("reviewStep", { total: String(fields.length) })
            : t("fieldStep", { index: String(step + 1), total: String(fields.length) })}
        </p>
      ) : null}

      {refusal?.kind === "failed" ? (
        <StateBanner tone="error" silent={silent} data-testid="work-question-failed">{t("failed")}</StateBanner>
      ) : null}
      {refusal?.kind === "in_flight" ? (
        <StateBanner tone="info" silent={silent}>
          <span data-testid="work-question-in-flight">{t("inFlight")}</span>
        </StateBanner>
      ) : null}
      {refusal?.kind === "invalid" && refusal.constraint === "op_key_conflict" ? (
        <StateBanner tone="warning" silent={silent}>{t("opKeyConflict")}</StateBanner>
      ) : null}

      <FieldGroup>
        {visible.map((field) => (
          <QuestionField
            key={field.key}
            field={field}
            value={draft[field.key]}
            problem={problems[field.key] ?? ""}
            disabled={busy}
            accounts={accounts}
            id={idFor(field.key)}
            silent={silent}
            cents={moneyCents.current[field.key] ?? null}
            onAcceptedCents={(c) => { moneyCents.current[field.key] = c; }}
            t={t}
            register={(el) => {
              controlRefs.current[field.key] = el;
            }}
            onChange={(v) => setValue(field.key, v)}
          />
        ))}

        {reviewing ? (
          <ReviewList fields={fields} draft={draft} label={t("reviewHeading")} />
        ) : null}

        {single || reviewing ? (
          <Field data-invalid={problems.note ? true : undefined}>
            <FieldContent>
              <FieldLabel htmlFor={idFor("note")}>
                <FieldTitle>{t("noteLabel")}</FieldTitle>
                <FieldDescription>{t("noteHelp")}</FieldDescription>
              </FieldLabel>
            </FieldContent>
            <Textarea
              id={idFor("note")}
              value={note}
              rows={2}
              disabled={busy}
              aria-invalid={problems.note ? true : undefined}
              aria-describedby={problems.note ? `${idFor("note")}-error` : undefined}
              // REGISTERED LIKE ANY OTHER CONTROL. `clara._assert_work_answer` can refuse the note
              // (it is the one key an answer may carry beyond the declared fields, and it has a
              // length cap), and an unregistered control is one the first-invalid focus cannot
              // reach and whose error nothing renders.
              ref={(el) => { controlRefs.current.note = el; }}
              onChange={(e) => setNoteValue(e.target.value)}
            />
            {problems.note ? (
              <FieldError id={`${idFor("note")}-error`} data-testid="work-question-error-note">
                {t(`constraint.${problems.note}` as never)}
              </FieldError>
            ) : null}
          </Field>
        ) : null}
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        {!single && step > 0 ? (
          <Button type="button" variant="outline" disabled={busy} data-testid="work-question-back" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            {t("back")}
          </Button>
        ) : null}
        {!single && !reviewing ? (
          <Button type="button" disabled={busy} data-testid="work-question-next" onClick={advance}>
            {t("next")}
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void submit()} data-testid="work-question-submit">
            {busy ? t("submitting") : t("submit")}
          </Button>
        )}
        {onLeavePending ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onLeavePending} data-testid="work-question-leave">
            {t("leavePending")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-secondary-ink">{t("leavePendingHelp")}</p>
    </div>
  );
}

/** The question itself: what is missing, why, and what a person is being asked about. Rendered
 *  identically on every surface — this block IS the "same question identity/version, missing fact,
 *  reason and supporting source" the acceptance line asks for. */
function QuestionHeading({ record }: { record: WorkQuestionRecord }) {
  const t = useTranslations("WorkQuestion");
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-foreground" data-testid="work-question-text">
        {record.question ?? t("noQuestionText")}
      </p>
      {record.reason ? (
        <p className="text-xs text-secondary-ink" data-testid="work-question-reason">
          {t("reasonLabel")} {record.reason}
        </p>
      ) : null}
      {record.context ? <p className="text-xs text-secondary-ink">{record.context}</p> : null}
      {/* THE SUPPORTING SOURCE (#629's own acceptance line: "the missing fact, reason and supporting
          source"). Rendered from the record, identically on B3, B4 and B6, and only when the run
          actually named one — an absent source prints nothing rather than "unknown". It is NOT a
          link: `source_ref` is an opaque object the database stores and does not resolve, so a
          route built from it here would be a 404 dressed as an affordance. */}
      {sourceRefText(record.source_ref) ? (
        <p className="text-xs text-secondary-ink" data-testid="work-question-source">
          {t("sourceLabel")} {sourceRefText(record.source_ref)}
        </p>
      ) : null}
      <p className="text-xs text-secondary-ink" data-testid="work-question-version">
        {t("versionLabel", { version: String(record.question_version) })}
      </p>
    </div>
  );
}

function QuestionField({
  field,
  value,
  problem,
  disabled,
  accounts,
  cents,
  id,
  silent,
  register,
  onChange,
  onAcceptedCents,
  t,
}: {
  field: WorkQuestionField;
  value: string | number | null | undefined;
  problem: string;
  disabled: boolean;
  accounts: readonly WorkQuestionAccount[] | null;
  register: (el: HTMLElement | null) => void;
  onChange: (value: WorkAnswerValue) => void;
  /** The cents a money control is CONTROLLED by, and the callback that moves it. See the
   *  `moneyCents` ref in the form: it is the last value this control ACCEPTED, never a value
   *  derived from the draft. */
  cents: number | null;
  onAcceptedCents: (cents: number | null) => void;
  /** This control's DOM id, scoped to the mounted form — see `idFor` in the form itself. */
  id: string;
  /** TRUE inside a surface that owns the announcement boundary — see the form's `announce` prop.
   *  The money control is the only FIELD that opens a live region of its own. */
  silent: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const text = value === undefined || value === null ? "" : String(value);
  const invalid = problem !== "";
  const describedBy = invalid ? `${id}-error` : undefined;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={field.kind === "choice" ? undefined : id}>
          <FieldTitle>
            {field.label}
            {isRequired(field) ? <span aria-hidden="true"> *</span> : null}
          </FieldTitle>
          <FieldDescription>
            {isRequired(field) ? t("required") : t("optional")}
            {field.unit ? ` · ${field.unit}` : ""}
            {field.kind === "money" ? ` · ${t("moneyHelp")}` : ""}
            {field.kind === "date" ? ` · ${t("dateHelp")}` : ""}
          </FieldDescription>
        </FieldLabel>
      </FieldContent>

      {field.kind === "choice" ? (
        <RadioGroup
          value={text}
          onValueChange={onChange}
          aria-label={field.label}
          aria-describedby={describedBy}
          disabled={disabled}
        >
          {optionsOf(field).map((option, index) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <RadioGroupItem
                value={option.value}
                ref={index === 0 ? (el: HTMLElement | null) => register(el) : undefined}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      ) : field.kind === "money" ? (
        // THE PRODUCT'S ONE CENTS CONTROL, the same one the journal composer's line editor mounts.
        // The DRAFT holds integer cents (a number), never the typed text: `buildAnswer` and
        // `validateField` both read a number straight through, and a draft that stored "1,200.00"
        // would have to be re-parsed by whatever read it next — which is how a second parser gets
        // born. A refused keystroke writes NOTHING to the draft (so the control keeps what was
        // typed and shows its own refusal copy) and raises the field's constraint instead.
        <MoneyInput
          id={id}
          mode="signed"
          zeroIsBlank={false}
          silentRefusal={silent}
          cents={cents}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          ref={register}
          onValueChange={(change) => {
            if (change.ok) {
              onAcceptedCents(change.cents);
              onChange(change.cents === null ? "" : formatCents(change.cents));
            } else {
              // The REFUSED TEXT, kept: `validateField` then names `integer_cents` by itself, and
              // the last accepted cents is deliberately NOT moved, so the control keeps showing
              // what the person is editing.
              onChange(change.refusal.input);
            }
          }}
        />
      ) : field.kind === "account" ? (
        // A CODE FROM THIS CLIENT'S CHART, offered rather than remembered — the header names a
        // Select and this is it. The chart is the caller's to supply (it is a client-scoped read,
        // and the form does not own one); WITHOUT it the control degrades to a typed code rather
        // than to an empty list, because an account picker with no accounts is worse than a box.
        // Either way `clara._assert_work_answer` is still the authority on whether the code is
        // active in this client's chart — this control only saves a person from typing it.
        accounts !== null && accounts.length > 0 ? (
          <Select value={text} onValueChange={(v) => onChange(typeof v === "string" ? v : "")} disabled={disabled}>
            <SelectTrigger
              id={id}
              aria-label={field.label}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              className="w-full"
              ref={register as (el: HTMLButtonElement | null) => void}
              data-testid={`work-question-account-${field.key}`}
            >
              <SelectValue placeholder={t("accountPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {accounts.filter((a) => a.is_active).map((a) => (
                <SelectItem key={a.account_code} value={a.account_code}>
                  {a.name ? `${a.account_code} · ${a.name}` : a.account_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={id}
            value={text}
            disabled={disabled}
            placeholder={t("accountCodePlaceholder")}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            ref={register}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      ) : field.kind === "text" ? (
        <Textarea
          id={id}
          value={text}
          rows={2}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          ref={register}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={text}
          disabled={disabled}
          // A TYPED ISO date, not a native date input: the contract asks for precise typing
          // alongside a picker, and a `type="date"` control renders a LOCALE-GUESSED order that a
          // person reading MYT cannot verify. `inputMode` keeps a numeric keypad on a phone.
          inputMode={field.kind === "date" ? "numeric" : undefined}
          placeholder={field.kind === "date" ? "YYYY-MM-DD" : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          ref={register}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {invalid ? (
        <FieldError id={`${id}-error`} data-testid={`work-question-error-${field.key}`}>
          {t(`constraint.${problem}` as never)}
        </FieldError>
      ) : null}
    </Field>
  );
}

function ReviewList({
  fields,
  draft,
  label,
}: {
  fields: readonly WorkQuestionField[];
  draft: WorkAnswerDraft;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid="work-question-review">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <dl className="grid gap-1 text-sm">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-wrap gap-2">
            <dt className="text-secondary-ink">{field.label}</dt>
            <dd className="wrap-anywhere text-foreground">{formatFieldValue(field, draft[field.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * ONE ANSWER VALUE, AS THE PERSON WHO GAVE IT WOULD READ IT.
 *
 * MONEY IS THE REASON THIS IS FIELD-AWARE. The answer object stores integer minor units, because
 * that is the only representation that cannot drift — but `String(120000)` on a settled surface
 * tells a person who typed `1,200.00` that the Work recorded one hundred and twenty thousand
 * ringgit. The stored value is right and the rendering was a misreport of money, which is the same
 * class of defect as a parser that multiplies by a hundred.
 *
 * A CHOICE RESOLVES TO ITS LABEL for the same reason: the answer carries the option's VALUE, which
 * is a token the question's author chose for the database, not the sentence the person clicked.
 */
function formatFieldValue(field: WorkQuestionField, value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (field.kind === "money") {
    const cents = typeof value === "number" ? value : parseMoneyToCents(String(value));
    return cents === null ? String(value) : formatCents(cents);
  }
  if (field.kind === "choice") {
    const option = optionsOf(field).find((o) => o.value === String(value));
    return option ? option.label : String(value);
  }
  return String(value);
}

/** The ACCEPTED record: who, when, which version, and the exact values. This is what replaces the
 *  form — a persistent outcome, never a toast. */
function AcceptedAnswer({
  record,
  fields,
  silent = false,
}: {
  record: WorkQuestionRecord;
  fields: readonly WorkQuestionField[];
  silent?: boolean;
}) {
  const t = useTranslations("WorkQuestion");
  const answer = record.answer ?? {};
  return (
    <div className="flex flex-col gap-2" data-testid="work-question-accepted">
      <StateBanner tone="info" silent={silent}>{t("accepted")}</StateBanner>
      <dl className="grid gap-1 text-sm">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-wrap gap-2">
            <dt className="text-secondary-ink">{field.label}</dt>
            <dd className="wrap-anywhere text-foreground" data-testid={`work-question-accepted-${field.key}`}>
              {formatFieldValue(field, answer[field.key])}
            </dd>
          </div>
        ))}
        {typeof answer.note === "string" && answer.note !== "" ? (
          <div className="flex flex-wrap gap-2">
            <dt className="text-secondary-ink">{t("noteLabel")}</dt>
            <dd className="wrap-anywhere text-foreground">{answer.note}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-secondary-ink" data-testid="work-question-attribution">
        {t("answeredBy", {
          role: record.answered_role ?? "—",
          at: record.answered_at ?? "—",
          version: String(record.question_version),
        })}
      </p>
    </div>
  );
}

/** A still-useful draft, kept visible after a convergence or a denial. NOT an input: the question
 *  is settled and re-offering a control would invite a second effect. */
function KeptDraft({
  draft,
  note,
  fields,
  label,
}: {
  draft: WorkAnswerDraft;
  note: string;
  fields: readonly WorkQuestionField[];
  label: string;
}) {
  const filled = fields.filter((f) => draft[f.key] !== undefined && String(draft[f.key] ?? "") !== "");
  if (filled.length === 0 && note.trim() === "") return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3" data-testid="work-question-kept-draft">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <dl className="grid gap-1 text-sm">
        {filled.map((field) => (
          <div key={field.key} className="flex flex-wrap gap-2">
            <dt className="text-secondary-ink">{field.label}</dt>
            <dd className="wrap-anywhere text-foreground">{formatFieldValue(field, draft[field.key])}</dd>
          </div>
        ))}
        {note.trim() !== "" ? (
          <div className="flex flex-wrap gap-2">
            <dt className="text-secondary-ink">{label}</dt>
            <dd className="wrap-anywhere text-foreground">{note}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** The supporting source as one readable line, or null. Exported so the cell that pins it drives
 *  the real reducer rather than a copy. */
export function sourceRefText(source: Record<string, unknown> | null | undefined): string | null {
  if (source === null || source === undefined || typeof source !== "object") return null;
  const kind = typeof source.kind === "string" && source.kind.trim() !== "" ? source.kind.trim() : null;
  if (kind === null) return null;
  const id = typeof source.id === "string" && source.id.trim() !== "" ? source.id.trim() : null;
  return id === null ? kind : `${kind} ${id}`;
}

/** WHICH convergence sentence to show. The refusal's own reason when there is one; otherwise the
 *  authoritative record's status, because a form mounted onto an already-settled question has no
 *  refusal to read. Both paths land on a CHECKED key — an unknown reason falls back rather than
 *  throwing a MISSING_MESSAGE. */
export function convergeKeyFor(refusal: AnswerRefusal | null, record: WorkQuestionRecord): string {
  const reason = refusal?.kind === "converge" ? refusal.reason : record.status;
  switch (reason) {
    case "already_answered":
    case "answered":
      return "convergeAnswered";
    case "stale_question":
      return "convergeStale";
    case "expired":
      return "convergeExpired";
    case "cancelled":
      return "convergeCancelled";
    case "basis_changed":
      return "convergeBasisChanged";
    case "state_changed":
      return "convergeStateChanged";
    default:
      return "convergeStateChanged";
  }
}
