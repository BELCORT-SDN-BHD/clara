"use client";

// #648 (journey A5) — THE FIRM SETUP ANSWER FORM.
//
// ONE FACT IS A FIELD; A BOUNDED RELATED SET IS A LOCAL WALK. The interaction contract's own words,
// and the same rule `components/work/work-question-form.tsx:8-15` already implements for a Work
// question. One item renders as a single `Field` and submits from there. A GROUP of two or more
// pending items — the firm's identity, its tax facts, its accounting policy — renders as a stepper
// with LOCAL next/back, per-step validation and a REVIEW step. Local navigation only: this
// component owns the walk and the values, and the DATABASE owns whether an answer is acceptable,
// whether the plan is still open and what the plan's current revision is.
//
// WHY NOT THE SHADCN "QUESTIONNAIRE" ITEM. `apps/web/components.json` carries `"registries": {}` —
// no registry is configured — so the item cannot be added without a project-configuration change
// and a new npm dependency. #629 recorded that decision with its evidence; this file reuses the
// primitives the project already has and has already contrast-checked (`Field`/`FieldGroup`,
// `Input`, `Textarea`, `RadioGroup`, `NativeSelect`, `Button`, `StateBanner`), which is also what
// the brief means by "reuse the shared question COMPONENTS and their rules".
//
// FOUR THINGS THIS FORM WILL NOT DO.
//   · It will not submit. The parent owns the writes, because the plan's CAS token rotates after
//     every accepted answer and only something holding the whole envelope can chain them.
//   · It will not discard a draft. Every keystroke is written to storage under user/firm/item, and
//     a stale-revision convergence keeps what was typed — it may be exactly what a correction needs.
//   · It will not force a guess. "Not now" is a first-class action beside Save for an OPTIONAL
//     item, and it opens the skip dialog rather than writing an empty answer.
//   · It will not announce where something else already does. `announce` decides; the default is
//     "self", because a form that has just been refused IS the thing that changed.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NativeSelect } from "@/components/common/native-select";
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
  clearFirmSetupDraft,
  firmSetupDraftKey,
  readFirmSetupDraft,
  writeFirmSetupDraft,
} from "@/lib/firm-setup/api";
import { buildAnswer, validateAnswer, type FirmSetupItem } from "@/lib/firm-setup/types";

/** A radio group stays readable up to six options; beyond that the native select is the honest
 *  control (eight legal forms is a list, not a choice a reader scans). */
const RADIO_MAX = 6;

export type FirmSetupSubmitEntry = { itemKey: string; answer: unknown; raw: string };

export type FirmSetupSubmitOutcome =
  | { ok: true }
  /** The plan moved under us: the parent has re-read it, and the draft is kept. */
  | { ok: false; kind: "stale" }
  /** The door refused this value. `itemKey` names the control to focus. */
  | { ok: false; kind: "invalid"; itemKey: string; message: string; code: string; reason: string | null }
  /** Rank, or a knowledge-register refusal with its own designed face. */
  | { ok: false; kind: "denied" | "already_live" | "failed"; message: string; code: string | null };

export function FirmSetupItemForm({
  items,
  userId,
  firmId,
  revision,
  onSubmit,
  onCancel,
  onSkip,
  announce = "self",
  busy = false,
}: {
  /** One item, or a group's pending items in catalogue order. */
  items: readonly FirmSetupItem[];
  userId: string;
  firmId: string;
  /** The plan revision these values were typed against — stored WITH the draft, never in its key. */
  revision: string | null;
  onSubmit: (entries: FirmSetupSubmitEntry[]) => Promise<FirmSetupSubmitOutcome>;
  onCancel: () => void;
  /** Offered only for an OPTIONAL item; the parent opens the skip dialog. */
  onSkip?: (item: FirmSetupItem) => void;
  announce?: "self" | "none";
  busy?: boolean;
}) {
  const t = useTranslations("FirmSetup");
  const silent = announce === "none";
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const idFor = useCallback((key: string) => `${uid}-fs-${key}`, [uid]);
  const single = items.length === 1;

  const draftKeys = useMemo(
    () => Object.fromEntries(items.map((i) => [i.item_key, firmSetupDraftKey({ userId, firmId, itemKey: i.item_key })])),
    [items, userId, firmId],
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.item_key, readFirmSetupDraft(draftKeys[i.item_key] ?? "")?.value ?? ""])));
  const [step, setStep] = useState(0);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<FirmSetupSubmitOutcome | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const controlRefs = useRef<Record<string, HTMLElement | null>>({});

  const setValue = useCallback(
    (itemKey: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [itemKey]: value };
        writeFirmSetupDraft(draftKeys[itemKey] ?? "", { value, revision });
        return next;
      });
      setProblems((prev) => (prev[itemKey] === undefined ? prev : { ...prev, [itemKey]: "" }));
    },
    [draftKeys, revision],
  );

  // FOCUS AFTER THE RENDER THAT MOUNTS THE CONTROL, never inside the handler: a bounded walk
  // submits from the REVIEW step, where the control the server named is not mounted at all, so a
  // focus call in the handler reaches a null ref and the refusal is invisible.
  useEffect(() => {
    if (focusTarget === null) return;
    const el = controlRefs.current[focusTarget];
    if (el) el.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const reviewing = !single && step >= items.length;
  const visible = single ? items : reviewing ? [] : [items[step]!];

  const advance = () => {
    const item = items[step];
    if (!item) return;
    const constraint = validateAnswer(item, values[item.item_key] ?? "");
    if (constraint !== null) {
      setProblems({ [item.item_key]: constraint });
      setFocusTarget(item.item_key);
      return;
    }
    setProblems({});
    setStep((s) => Math.min(s + 1, items.length));
    const next = items[step + 1];
    setFocusTarget(next ? next.item_key : null);
  };

  const back = () => {
    const target = items[Math.max(0, step - 1)];
    setStep((s) => Math.max(0, s - 1));
    setFocusTarget(target ? target.item_key : null);
  };

  const submit = useCallback(async () => {
    const found: Record<string, string> = {};
    for (const item of items) {
      const constraint = validateAnswer(item, values[item.item_key] ?? "");
      if (constraint !== null) found[item.item_key] = constraint;
    }
    if (Object.keys(found).length > 0) {
      setProblems(found);
      const firstKey = items.find((i) => found[i.item_key])?.item_key ?? null;
      if (firstKey && !single) setStep(items.findIndex((i) => i.item_key === firstKey));
      setFocusTarget(firstKey);
      return;
    }
    setOutcome(null);
    const entries: FirmSetupSubmitEntry[] = items.map((item) => ({
      itemKey: item.item_key,
      raw: values[item.item_key] ?? "",
      answer: buildAnswer(item, values[item.item_key] ?? ""),
    }));
    const result = await onSubmit(entries);
    setOutcome(result);
    if (result.ok) {
      // THE DRAFT IS CLEARED ONLY ON ACCEPTANCE. Every other outcome keeps it.
      for (const item of items) clearFirmSetupDraft(draftKeys[item.item_key] ?? "");
      return;
    }
    if (result.kind === "invalid") {
      setProblems({ [result.itemKey]: "server" });
      const index = items.findIndex((i) => i.item_key === result.itemKey);
      if (index >= 0 && !single) setStep(index);
      setFocusTarget(result.itemKey);
    }
  }, [draftKeys, items, onSubmit, single, values]);

  return (
    <div className="flex flex-col gap-4" data-testid="firm-setup-item-form">
      {!single ? (
        <p className="text-xs text-muted-foreground" data-testid="firm-setup-step">
          {reviewing
            ? t("form.reviewStep", { total: items.length })
            : t("form.fieldStep", { index: step + 1, total: items.length })}
        </p>
      ) : null}

      {outcome && !outcome.ok && outcome.kind === "stale" ? (
        <StateBanner tone="warning" silent={silent} data-testid="firm-setup-stale">
          {t("form.stale")}
        </StateBanner>
      ) : null}
      {outcome && !outcome.ok && outcome.kind === "already_live" ? (
        <StateBanner tone="warning" silent={silent} code={outcome.code ?? undefined} data-testid="firm-setup-already-live">
          {t("form.alreadyLive")}
        </StateBanner>
      ) : null}
      {outcome && !outcome.ok && outcome.kind === "denied" ? (
        <StateBanner tone="warning" silent={silent} code={outcome.code ?? undefined} data-testid="firm-setup-denied-write">
          {t("form.denied")}
        </StateBanner>
      ) : null}
      {outcome && !outcome.ok && outcome.kind === "failed" ? (
        <StateBanner tone="error" silent={silent} code={outcome.code ?? undefined} data-testid="firm-setup-failed">
          {t("form.failed")}
        </StateBanner>
      ) : null}

      <FieldGroup>
        {visible.map((item) => (
          <FirmSetupField
            key={item.item_key}
            item={item}
            value={values[item.item_key] ?? ""}
            problem={problems[item.item_key] ?? ""}
            serverMessage={
              outcome && !outcome.ok && outcome.kind === "invalid" && outcome.itemKey === item.item_key
                ? outcome.message
                : null
            }
            disabled={busy}
            id={idFor(item.item_key)}
            register={(el) => { controlRefs.current[item.item_key] = el; }}
            onChange={(v) => setValue(item.item_key, v)}
          />
        ))}
        {reviewing ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm" data-testid="firm-setup-review">
            {items.map((item) => (
              <div key={item.item_key} className="contents">
                <dt className="text-muted-foreground">{item.question}</dt>
                <dd className="wrap-anywhere">{values[item.item_key] || t("form.reviewBlank")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        {!single && step > 0 ? (
          <Button type="button" variant="outline" disabled={busy} data-testid="firm-setup-back" onClick={back}>
            {t("form.back")}
          </Button>
        ) : null}
        {!single && !reviewing ? (
          <Button type="button" disabled={busy} data-testid="firm-setup-next" onClick={advance}>
            {t("form.next")}
          </Button>
        ) : (
          <Button type="button" disabled={busy} data-testid="firm-setup-submit" onClick={() => void submit()}>
            {busy ? t("form.saving") : t("form.save")}
          </Button>
        )}
        {onSkip && single && items[0] && !items[0].required ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            data-testid="firm-setup-skip"
            onClick={() => onSkip(items[0]!)}
          >
            {t("form.skip")}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={busy} data-testid="firm-setup-cancel" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("form.draftHelp")}</p>
    </div>
  );
}

function FirmSetupField({
  item, value, problem, serverMessage, disabled, id, register, onChange,
}: {
  item: FirmSetupItem;
  value: string;
  problem: string;
  serverMessage: string | null;
  disabled: boolean;
  id: string;
  register: (el: HTMLElement | null) => void;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("FirmSetup");
  const invalid = problem !== "";
  const describedBy = invalid ? `${id}-error` : `${id}-note`;
  const options = item.answer_options;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={options.length > 0 && options.length <= RADIO_MAX ? undefined : id}>
          <FieldTitle>
            {item.question}
            {item.required ? <span aria-hidden="true"> *</span> : null}
          </FieldTitle>
          <FieldDescription id={`${id}-note`}>
            {item.required ? t("form.required") : t("form.optional")}
            {item.knowledge_key ? ` · ${t("form.reachesRegister")}` : ""}
          </FieldDescription>
        </FieldLabel>
      </FieldContent>

      {options.length > 0 && options.length <= RADIO_MAX ? (
        <RadioGroup
          value={value}
          onValueChange={onChange}
          aria-label={item.question}
          aria-describedby={describedBy}
          disabled={disabled}
        >
          {options.map((option, index) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <RadioGroupItem
                value={option}
                ref={index === 0 ? (el: HTMLElement | null) => register(el) : undefined}
              />
              <span>{option}</span>
            </label>
          ))}
        </RadioGroup>
      ) : options.length > 0 ? (
        <NativeSelect
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          ref={(el) => register(el)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full"
        >
          <option value="">{t("form.chooseValue")}</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </NativeSelect>
      ) : item.answer_shape === "long_text" ? (
        <Textarea
          id={id}
          rows={3}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          ref={(el) => register(el)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          inputMode={item.answer_shape === "month" ? "numeric" : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          ref={(el) => register(el)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {invalid ? (
        <FieldError id={`${id}-error`} data-testid={`firm-setup-error-${item.item_key}`}>
          {/* THE SERVER'S OWN SENTENCE, VERBATIM, where the server is the one who refused —
              never re-worded and never re-derived from a code. A LOCAL constraint gets the
              product's own wording, because no door has spoken yet. */}
          {serverMessage ?? t(`form.constraint.${problem}` as "form.constraint.required")}
        </FieldError>
      ) : null}
      {/* The catalogue's own note: why this fact is asked, what the interview asked verbatim, and
          every honest boundary it carries. Rendered rather than hidden, because those boundaries
          (an unverified registration format, a Sdn-Bhd-only statutory screen) are exactly what a
          practitioner needs before answering. */}
      <p className="text-xs text-muted-foreground">{item.note}</p>
    </Field>
  );
}
