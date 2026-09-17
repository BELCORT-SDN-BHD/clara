"use client";

// #649 / owner ruling D7 — THE CLIENT'S FINANCIAL-YEAR END, ASKED RATHER THAN DERIVED.
//
// WHAT WAS MISSING. The interview asks which MONTH a client's financial year ends
// (`interview.v2.questions.ts`'s `fye` segment) and nothing else, while `clara.clients` admits a
// year end only as a month AND a day together (`ck_clients_fy_end`, 0041:778). So the canonical
// client record has never been writable from the interview's own answers — not "unwired",
// genuinely not expressible. The owner ruled the missing half is ASKED: last-day-of-month is a
// plausible guess, and a guess on a professional's record is an invented accounting fact.
//
// MONTH-END IS A BUTTON, NEVER A DEFAULT. `Use month end` fills the day with one click and says
// which day it is filling in, so the value on the record is one a person chose. Nothing here
// pre-fills it, and nothing here fills it on blur, on submit, or when the month changes.
//
// FEBRUARY SUGGESTS 28 and accepts 29 — see `lib/onboarding/fy-end.ts`'s header for why the
// suggestion is not the CHECK's ceiling.
//
// THE DATABASE IS STILL THE WALL. Everything this component refuses is refused again, and
// authoritatively, by `clara.settle_client_onboarding_facts` and the `clara.set_client_fy_end` it
// calls — a NULL day (CLR10 `fy_end_day_required`), an impossible calendar day (CLR37), a month
// contradicting the plan's recorded answer (CLR10 `fy_end_month_contradicts_plan`), a live ANNUAL
// cadence (CLR38). This is form shaping so a person is not sent on a round trip that is certain to
// be refused; it is not a second opinion about any of those rules.
//
// COMPOSED ON `Field`, not on ad-hoc label/error markup (appendix D #28, the
// `work-question-form.tsx:70` precedent): FieldGroup / Field / FieldLabel / FieldDescription /
// FieldError, with `aria-invalid` on the control the error belongs to.

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { monthEndDay, validateFyEnd, type FyEndDraft } from "@/lib/onboarding/fy-end";

/** Whether the human has typed anything at all. A blank pair is a deliberate "not now", not an
 *  error: the settle call is skipped and the dialog says so. */
export function fyEndDraftIsBlank(draft: FyEndDraft): boolean {
  return draft.month.trim() === "" && draft.day.trim() === "";
}

/** Whether Confirm must wait. A blank draft never blocks; a PARTIALLY or WRONGLY filled one does,
 *  because a person who started typing a year end meant to record one. */
export function fyEndDraftBlocks(draft: FyEndDraft, planMonth: number | null): boolean {
  if (fyEndDraftIsBlank(draft)) return false;
  return !validateFyEnd(draft, { monthOptional: planMonth !== null }).ok;
}

export function OnboardingFyEndField({
  draft,
  onChange,
  planMonth,
  disabled = false,
}: {
  draft: FyEndDraft;
  onChange: (next: FyEndDraft) => void;
  /** The month the plan's own `fye` answer recorded, or `null` when it recorded none. It is shown
   *  as a DESCRIPTION, never written into the field: a form that pre-filled it would be echoing
   *  the plan back at the settle door, which reads the plan itself. */
  planMonth: number | null;
  disabled?: boolean;
}) {
  const t = useTranslations("ClientOnboarding.fyEnd");
  const monthId = useId();
  const dayId = useId();

  const blank = fyEndDraftIsBlank(draft);
  const result = validateFyEnd(draft, { monthOptional: planMonth !== null });
  const problems = blank || result.ok ? [] : result.problems;
  const monthProblem = problems.find((p) => p.field === "month") ?? null;
  const dayProblem = problems.find((p) => p.field === "day") ?? null;

  const monthForSuggestion = (() => {
    const typed = draft.month.trim();
    if (/^\d{1,2}$/.test(typed)) {
      const n = Number(typed);
      if (n >= 1 && n <= 12) return n;
      return null;
    }
    return planMonth;
  })();
  const suggestion = monthForSuggestion === null ? null : monthEndDay(monthForSuggestion);

  return (
    <FieldGroup>
      <Field data-invalid={monthProblem ? "true" : undefined}>
        <FieldLabel htmlFor={monthId}>{t("monthLabel")}</FieldLabel>
        <Input
          id={monthId}
          inputMode="numeric"
          aria-label={t("monthLabel")}
          aria-invalid={monthProblem ? true : undefined}
          placeholder={t("monthPlaceholder")}
          value={draft.month}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, month: e.target.value })}
        />
        <FieldDescription>
          {planMonth === null ? t("monthNoPlanAnswer") : t("monthFromPlan", { month: planMonth })}
        </FieldDescription>
        {monthProblem ? <FieldError>{t(`monthError.${monthProblem.reason}` as "monthError.required")}</FieldError> : null}
      </Field>

      <Field data-invalid={dayProblem ? "true" : undefined}>
        <FieldLabel htmlFor={dayId}>{t("dayLabel")}</FieldLabel>
        <Input
          id={dayId}
          inputMode="numeric"
          aria-label={t("dayLabel")}
          aria-invalid={dayProblem ? true : undefined}
          placeholder={t("dayPlaceholder")}
          value={draft.day}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, day: e.target.value })}
        />
        <FieldDescription>{t("dayDescription")}</FieldDescription>
        {suggestion !== null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => onChange({ ...draft, day: String(suggestion) })}
          >
            {t("monthEndSuggestion", { day: suggestion })}
          </Button>
        ) : null}
        {dayProblem ? <FieldError>{t(`dayError.${dayProblem.reason}` as "dayError.required")}</FieldError> : null}
      </Field>

      <FieldDescription>{blank ? t("blankNote") : t("settleNote")}</FieldDescription>
    </FieldGroup>
  );
}
