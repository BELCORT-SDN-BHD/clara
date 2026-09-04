// H-26 / H-27 / CB-AE2E-008 — HOW A PLAN ITEM'S ANSWER IS SAID OUT LOUD.
//
// THE DEFECT THIS CLOSES, measured. `OnboardingPlanItemRow.answer` is typed `unknown`
// (./types.ts) with an explicit "rendered as text, never re-parsed" posture, and three
// surfaces took that literally:
//   `OnboardingItemRow.tsx`      rendered `String(item.answer)`  → "[object Object]"
//   `OnboardingItemRow.tsx`      the same inside the amend dialog
//   `lib/interview/thread.ts`    `JSON.stringify(answer)`        → a raw JSON bubble
//   `lib/onboarding/resolution-history.ts` the same, on the superseded trail
// Only a HUMAN resolution is a string (`resolve_onboarding_plan_item` writes
// `answer=to_jsonb(p_resolution)`, 0017_wave_b.sql:2726). Every INTERVIEW-written answer is a
// jsonb OBJECT, so on the happy path — the whole client interview — every settled row read
// "[object Object]".
//
// THE CAPTURE SHAPES, read from their writers rather than assumed (each citation checked in
// this worktree):
//   ssm                      {registration, normalized, form, format_verified}
//                            interview.v2.core.ts:107 (verified) / :146 (the insist path,
//                            `form:"unrecognized", format_verified:false`)
//   framework                {framework_code, framework_label, …free_text/entered_as/
//                            framework_version}            interview.v2.segments.ts:186-222
//   accounting_basis         {accounting_basis, accounting_basis_label, …observed_basis/note/
//                            entered_as}                   interview.v2.segments.ts:245-270
//   mpers_eligibility        {determination, test, parent_test?}  interview.v2.segments.ts:377-406
//   coa_seed_decision        {seed}  — "firm_template" (v3.questions.ts:83) ·
//                            "lhdn_mpers_standard" (v2.questions.ts:104) · "manual" (both)
//   coa_chart_apply          {chart, applied}                     v3.questions.ts:89-97
//   first_year_zero_opening  {opening:"zero"}                     v2.questions.ts:63
//   carry_down_deferred      {opening:"carry_down", captured:false} v2.questions.ts:65
//   fa_depreciation_method   {non_straight_line:false}            v2.questions.ts:73
//   fa_nonstraightline_todo  {non_straight_line:true, captured:false} v2.questions.ts:74
//   sample_invoices          {attached:boolean}                   v2.questions.ts:107
//   interview_run            {run_id}                             clientOnboarding.v4.ts:102
// Every OTHER segment goes through `defaultItem` and stores the bare scalar, which already
// rendered fine and still passes straight through here.
//
// ============================ THE THREE RULES THIS MODULE KEEPS ============================
//
// 1. THE FALLBACK IS NEVER `JSON.stringify` AND NEVER `String(object)`. A shape a later
//    workflow `_vN` adds — or one this table gets wrong — renders as ordered `key: value`
//    lines built from the object's OWN keys, in the order the DB stored them. That reads
//    honestly instead of as a blob, and it is the same discipline
//    `ApplyStandardChartControl.tsx`'s "a seventh state renders its own name" arm applies to
//    an unrecognised `coa_chart_state`.
//
// 2. A KNOWN item_key WHOSE PAYLOAD DOES NOT MATCH falls back too. `format` is chosen by
//    item_key, but every formatter READS the fields it needs and returns `null` when they are
//    absent or the wrong type — an absent field is never treated as a value (review law 2), so
//    a drifted shape degrades to rule 1 rather than asserting prose the data does not support.
//
// 3. `warnings[]` IS NEVER SWALLOWED. `withWarnings` (interview.v2.core.ts:262-274) merges an
//    ACKNOWLEDGED practitioner warning onto the value — `{code, message, acknowledged,
//    acknowledged_by}` — and wraps a non-object value as `{value, warnings}` rather than losing
//    it. That acknowledgement is the professional-approval record on the answer, so it is
//    lifted out here and rendered as its OWN line carrying `acknowledged_by`, never folded into
//    the summary and never dropped. The `{value, warnings}` wrap is unwrapped, so it can never
//    render as a stray "value: …" field.
//
// I18N. This module owns no English. It returns a message KEY plus values (resolved by the
// caller's `useTranslations("ClientOnboarding.answer")`) for every phrase it can name, and
// VERBATIM DB text for everything it cannot — so the translator decides the wording and this
// module decides only what is true. `lib/documents/copy.ts`'s `queueStateLabelKey` is the same
// idiom; the difference is that the values here come from the row, so the two halves travel
// together.

/** The narrow slice of next-intl's `t` this module needs. A caller passes
 *  `useTranslations("ClientOnboarding.answer")` through `answerTranslator` below. */
export type AnswerTranslator = (key: string, values?: Record<string, string | number>) => string;

export type FormattedAnswer = {
  /** The settled answer, as one line. Never `[object Object]`, never a JSON blob. Empty
   *  string when there is genuinely no answer — the CALLER decides what to say about that
   *  (`OnboardingItemRow` already guards null/undefined with its own honest wording). */
  text: string;
  /** Acknowledged warnings, one rendered line each, in the order they were acknowledged. */
  warnings: string[];
  /** True ONLY when the answer positively recorded `format_verified: false` — the escape-hatch
   *  registration (interview.v2.core.ts:143). An absent flag is NOT unverified: the writer
   *  states verification AFFIRMATIVELY for exactly this reason (its own comment at :98-105),
   *  so inferring it from an absent marker would mark every correctly-recognised registration
   *  as unverified. */
  unverified: boolean;
};

/** Item keys the interview writes for its OWN bookkeeping, which are not questions anyone
 *  answered. `interview_run` binds the plan to a runtime run (`clientOnboarding.v4.ts:102`,
 *  `question: null`) and is written in state `answered`, so it counted toward the N/N header
 *  and rendered a row reading "interview_run · [object Object]".
 *
 *  ONE LIST, TWO SURFACES. `lib/interview/thread.ts` already had a private copy of this set;
 *  the checklist card had none, so the two surfaces disagreed about what is internal. Both now
 *  import this one. */
export const INTERNAL_ITEM_KEYS: ReadonlySet<string> = new Set(["interview_run"]);

export function isInternalItemKey(itemKey: string): boolean {
  return INTERNAL_ITEM_KEYS.has(itemKey);
}

// --------------------------------------------------------------------------------------
// Reading the raw value — every read is POSITIVE, and returns null when it cannot be made.
// --------------------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** A scalar, exactly as stored. `null`/`undefined` yield the empty string so a caller's own
 *  "no answer recorded" wording wins rather than this module inventing a dash. */
function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Rule 1's renderer — ordered `key: value` over an object's OWN keys, in stored order.
 *  A nested object recurses (one level of `key: sub: value` reads better than a blob, and a
 *  deeper nest is still lines rather than JSON); an array joins its elements. There is no
 *  `JSON.stringify` and no `String(object)` anywhere on this path.
 *
 *  DEPTH IS BOUNDED. `MAX_DEPTH` stops a cyclic or pathologically deep jsonb from recursing
 *  forever — at the floor the value renders as the honest, non-committal `…` rather than
 *  either throwing or claiming a value nobody read. */
const MAX_DEPTH = 4;

export function verbatimText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return scalarText(value);
  }
  if (depth >= MAX_DEPTH) return "…";
  if (Array.isArray(value)) {
    return value.map((entry) => verbatimText(entry, depth + 1)).filter((part) => part !== "").join(", ");
  }
  const record = asRecord(value);
  if (record === null) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(record)) {
    const rendered = verbatimText(raw, depth + 1);
    parts.push(rendered === "" ? `${key}: —` : `${key}: ${rendered}`);
  }
  return parts.join(" · ");
}

// --------------------------------------------------------------------------------------
// The acknowledged-warning lift (rule 3).
// --------------------------------------------------------------------------------------

type AcknowledgedWarning = { code: string; message: string; acknowledgedBy: string | null };

function readWarnings(raw: unknown): AcknowledgedWarning[] {
  if (!Array.isArray(raw)) return [];
  const out: AcknowledgedWarning[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (record === null) continue;
    const message = str(record.message);
    const code = str(record.code);
    if (message === null && code === null) continue;
    out.push({
      code: code ?? "",
      message: message ?? "",
      acknowledgedBy: str(record.acknowledged_by),
    });
  }
  return out;
}

/** Splits `{…value, warnings}` (the object merge) and `{value, warnings}` (the non-object
 *  wrap) back into the value that was answered and the warnings acknowledged on it. */
function unwrapWarnings(answer: unknown): { value: unknown; warnings: AcknowledgedWarning[] } {
  const record = asRecord(answer);
  if (record === null || !("warnings" in record)) return { value: answer, warnings: [] };
  const warnings = readWarnings(record.warnings);
  if (warnings.length === 0) return { value: answer, warnings: [] };
  // THE WRAP, recognised by its exact two-key shape — `withWarnings` builds `{value, warnings}`
  // and nothing else when the answered value was not a plain object. Recognising it by shape
  // rather than by an absent marker keeps a genuine capture that happens to carry a `value`
  // FIELD (none does today) from being unwrapped by accident.
  const keys = Object.keys(record);
  if (keys.length === 2 && keys.includes("value") && keys.includes("warnings")) {
    return { value: record.value, warnings };
  }
  const rest: Record<string, unknown> = { ...record };
  delete rest.warnings;
  return { value: rest, warnings };
}

// --------------------------------------------------------------------------------------
// The per-item_key table (rule 2 — every entry reads, and returns null rather than guessing).
// --------------------------------------------------------------------------------------

type Phrase = { key: string; values?: Record<string, string | number> };
type Shape = (record: Record<string, unknown>, t: AnswerTranslator) => string | null;

/** Joins the parts a shape produced. Only non-empty parts survive, so an absent optional
 *  field contributes nothing rather than a dangling separator. */
function join(parts: (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => typeof part === "string" && part !== "");
  return kept.length === 0 ? null : kept.join(" · ");
}

const phrase = (t: AnswerTranslator, p: Phrase): string => t(p.key, p.values);

const SHAPES: Record<string, Shape> = {
  ssm: (r, t) => {
    const registration = str(r.registration);
    if (registration === null) return null;
    const verified = bool(r.format_verified);
    if (verified === null) return null;
    return verified
      ? phrase(t, { key: "ssm.verified", values: { registration, form: str(r.form) ?? "" } })
      : phrase(t, { key: "ssm.unverified", values: { registration } });
  },

  framework: (r, t) => {
    const label = str(r.framework_label) ?? str(r.framework_code);
    if (label === null) return null;
    return join([
      phrase(t, { key: "framework.base", values: { framework: label } }),
      str(r.framework_version) === null
        ? null
        : phrase(t, { key: "framework.edition", values: { edition: str(r.framework_version)! } }),
      str(r.entered_as) === null
        ? null
        : phrase(t, { key: "framework.enteredAs", values: { entered: str(r.entered_as)! } }),
    ]);
  },

  accounting_basis: (r, t) => {
    const label = str(r.accounting_basis_label) ?? str(r.accounting_basis);
    if (label === null) return null;
    return join([
      phrase(t, { key: "accountingBasis.base", values: { basis: label } }),
      str(r.observed_basis) === null
        ? null
        : phrase(t, { key: "accountingBasis.observed", values: { observed: str(r.observed_basis)! } }),
    ]);
  },

  mpers_eligibility: (r, t) => {
    const determination = str(r.determination);
    if (determination === null) return null;
    // The three determinations the writer can produce. Anything else is a shape this table
    // does not know, and falls through to rule 1 rather than being folded into one of these.
    if (determination !== "eligible" && determination !== "ineligible" && determination !== "parent_unknown") return null;
    return phrase(t, { key: `mpersEligibility.${determination}` });
  },

  coa_seed_decision: (r, t) => {
    const seed = str(r.seed);
    if (seed === null) return null;
    // v3 writes `firm_template`; v2 (still live for any plan it wrote) writes
    // `lhdn_mpers_standard`. Both mean "the firm's standard chart"; `manual` is the client's
    // own. A FOURTH seed a later `_vN` mints falls through to rule 1.
    if (seed === "firm_template" || seed === "lhdn_mpers_standard") return phrase(t, { key: "coaSeed.standard" });
    if (seed === "manual") return phrase(t, { key: "coaSeed.manual" });
    return null;
  },

  coa_chart_apply: (r, t) => {
    const chart = str(r.chart);
    const applied = bool(r.applied);
    if (chart === null || applied === null) return null;
    if (chart !== "firm_template" && chart !== "lhdn_mpers_standard" && chart !== "manual") return null;
    if (chart === "manual") return phrase(t, { key: "coaChartApply.ownChart" });
    return phrase(t, { key: applied ? "coaChartApply.applied" : "coaChartApply.notApplied" });
  },

  first_year_zero_opening: (r, t) => (str(r.opening) === "zero" ? phrase(t, { key: "opening.zero" }) : null),

  carry_down_deferred: (r, t) => {
    if (str(r.opening) !== "carry_down") return null;
    const captured = bool(r.captured);
    if (captured === null) return null;
    return phrase(t, { key: captured ? "opening.carryDownCaptured" : "opening.carryDownPending" });
  },

  fa_depreciation_method: (r, t) => {
    const nonStraightLine = bool(r.non_straight_line);
    if (nonStraightLine === null) return null;
    return phrase(t, { key: nonStraightLine ? "fixedAssets.nonStraightLine" : "fixedAssets.straightLineOnly" });
  },

  fa_nonstraightline_todo: (r, t) => {
    if (bool(r.non_straight_line) !== true) return null;
    const captured = bool(r.captured);
    if (captured === null) return null;
    return phrase(t, { key: captured ? "fixedAssets.captured" : "fixedAssets.pending" });
  },

  sample_invoices: (r, t) => {
    const attached = bool(r.attached);
    if (attached === null) return null;
    return phrase(t, { key: attached ? "sampleInvoices.attached" : "sampleInvoices.none" });
  },

  interview_run: (r, t) => {
    const runId = str(r.run_id);
    return runId === null ? null : phrase(t, { key: "interviewRun", values: { runId } });
  },
};

/** Every item_key this module can say something specific about. Exported so a test can walk
 *  the table rather than re-listing it — a second list is a list that drifts. */
export const FORMATTED_ITEM_KEYS: readonly string[] = Object.keys(SHAPES);

// --------------------------------------------------------------------------------------
// The one entry point.
// --------------------------------------------------------------------------------------

/**
 * Render one plan item's stored answer.
 *
 * `itemKey` selects the shape; `answer` is the raw jsonb the DB returned; `t` resolves the
 * `ClientOnboarding.answer.*` namespace. See this file's header for the three rules.
 */
export function formatPlanItemAnswer(itemKey: string, answer: unknown, t: AnswerTranslator): FormattedAnswer {
  const { value, warnings } = unwrapWarnings(answer);
  const record = asRecord(value);

  const unverified = record !== null && record.format_verified === false;

  const warningLines = warnings.map((w) =>
    w.acknowledgedBy === null
      ? t("warning.line", { message: w.message || w.code })
      : t("warning.acknowledged", { message: w.message || w.code, by: w.acknowledgedBy }),
  );

  // A scalar (a human resolution, or any `defaultItem` segment) passes straight through.
  if (record === null) {
    return {
      text: Array.isArray(value) ? verbatimText(value) : scalarText(value),
      warnings: warningLines,
      unverified,
    };
  }

  const shape = SHAPES[itemKey];
  const named = shape ? shape(record, t) : null;

  return {
    // Rule 1 / rule 2: an unknown key, or a known key whose payload did not read, falls to the
    // ordered key:value rendering of the SAME object — never a blob, never a guess.
    text: named ?? verbatimText(record),
    warnings: warningLines,
    unverified,
  };
}

/**
 * The translator-free rendering, for a seam that has no `t` in hand.
 *
 * It is rule 1 ALONE — verbatim `key: value` lines — so it never claims the prose a shape
 * would have produced, and it can never emit `[object Object]` or a `{`. `lib/interview/
 * thread.ts`'s `echoAnswer` uses this as its default; the interview card passes the real
 * formatter in, so the seeded thread reads as prose in the product.
 */
export function verbatimAnswerText(answer: unknown): string {
  const { value } = unwrapWarnings(answer);
  return verbatimText(value);
}
