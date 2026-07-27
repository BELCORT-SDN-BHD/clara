// @frozen
//
// FROZEN — the interview core, v2. Two additions over v1 and nothing else:
//
//   F1  a registration validator that accepts every Malaysian business shape (the v1 one
//       anchored on a leading digit and refused a state-prefixed ROB number outright, so a
//       sole-proprietor client could not be onboarded at all).
//   F2  a segment driver that can ask CONDITIONAL FOLLOW-UPS and can surface a VISIBLE WARNING
//       before the echo-confirm — the machinery the entity-type-aware framework question needs.
//
// WHY THIS FILE IMPORTS v1 RATHER THAN COPYING IT. The versioning law (ARCHITECTURE Appendix A)
// requires that a deployed body never CHANGE; it does not require that a new version re-type
// its unchanged parts. `interview.v1.core.ts` is frozen and hash-locked, so importing it is the
// strongest available guarantee that v1's validators, hook-token format, owner-binding and
// plan-item defaults are byte-identical in v2 — a copy could drift under a later edit while
// both files still passed the freeze-lint (each hashing its own bytes). The review diff is then
// exactly the two changes above, which is the point.
//
// P19 is unchanged and re-proved by the same discipline: validate BEFORE any echo, echo-confirm
// BEFORE any persist, nothing persisted on a refusal, no secret in any question/echo/item.

import {
  askAndConfirmSegment,
  defaultItem,
  hookToken,
  firmOwnerMatches,
  interviewRunBinding,
  isAffirmative,
  tinExempt,
  validateEmail,
  validateEnum,
  validateFye,
  validateMsic,
  validateNonEmpty,
  validateOptionalText,
  validateSsm,
  validateTin,
  validateTurnover,
  TURNOVER_BANDS,
  type AskFn,
  type ItemKind,
  type ItemState,
  type OwnerMarker,
  type PlanItemInput,
  type Prompt,
  type Resolution,
  type Scope,
  type Segment,
  type SegmentResult,
  type Validation,
} from "./interview.v1.core.js";
import { classifyBusinessRegistration, describeBusinessRegistrationForms, normalizeRegistration } from "../lib/malaysian-registration.mjs";

// Everything unchanged is re-exported from ONE place so a v2 module never has to reach back
// into v1 by hand (and so a reader sees the whole v2 surface in one import).
export {
  askAndConfirmSegment,
  defaultItem,
  hookToken,
  firmOwnerMatches,
  interviewRunBinding,
  isAffirmative,
  tinExempt,
  validateEmail,
  validateEnum,
  validateFye,
  validateMsic,
  validateNonEmpty,
  validateOptionalText,
  validateSsm,
  validateTin,
  validateTurnover,
  TURNOVER_BANDS,
};
export type { AskFn, ItemKind, ItemState, OwnerMarker, PlanItemInput, Prompt, Resolution, Scope, Segment, SegmentResult, Validation };

// ---------------------------------------------------------------------------
// F1 — the business/company registration validator.
// ---------------------------------------------------------------------------

/**
 * Validate an SSM / ROB / ROC registration number for the interview.
 *
 * Accepts the legacy numeric form (`1475415-P`), the STATE-PREFIXED business form
 * (`SA1234567-X` — the shape v1 refused, and the whole of finding F1), the unified 12-digit
 * form with or without a check letter, and the combined print (`202401047756 (1593602-X)`)
 * that real certificates and letterheads actually carry.
 *
 * Records an OBJECT, not a bare string: `{ registration, normalized, form }`. The normalized
 * key is the counterparty registry's own (strip non-alphanumerics, lowercase), so the identity
 * a firm types at onboarding and the identity a vendor prints on an invoice compare without
 * anyone re-deriving the rule at the comparison site. `registration` stays verbatim — the
 * combined print normalizes to the concatenation of both numbers, which is exactly what the
 * registry stores, so canonicalising it down to one half would LOSE the match.
 */
export function validateBusinessRegistration(raw: unknown): Validation {
  const verdict = classifyBusinessRegistration(raw);
  if (!verdict.ok) return { ok: false, reason: String(verdict.reason) };
  const value = { registration: String(verdict.value), normalized: String(verdict.normalized), form: String(verdict.form) };
  return { ok: true, value, echo: `registration ${value.registration}` };
}

/** The accepted-forms sentence, for the question text (a person is told the shapes UP FRONT,
 *  not only after a refusal). */
export const registrationFormsSentence = (): string => describeBusinessRegistrationForms();

/** The minimum substantive content an UNVERIFIED registration may be recorded with. Mirrors the
 *  invoice gate's own floor (three alphanumerics): below it there is no identity to record, only
 *  a person hitting enter, and an escape hatch that accepts "  " is not a hatch but a hole. */
const MIN_UNVERIFIED_KEY_LENGTH = 3;

/**
 * THE ESCAPE HATCH (owner ruling, 2026-07-27: "warning + record unverified").
 *
 * Called by the driver only when this segment REFUSED an answer and the person has now typed the
 * same answer again. Returns the value to record, or null to keep re-asking.
 *
 * WHY THIS EXISTS. A validator that can only refuse is the shape of finding F1 itself: v1 refused
 * a legitimate state-prefixed ROB number, and the interview had no way to proceed — the firm was
 * simply unable to onboard. Widening the grammar fixed the four families we know about; it cannot
 * fix the family nobody has met yet. So the LAST word belongs to the human in front of the
 * document, not to the regex: after one refusal that shows the accepted formats, insistence is
 * taken as "I am looking at the certificate and this is what it says".
 *
 * WHAT IT REFUSES TO DO IS THE POINT. It never records the value SILENTLY: the driver raises a
 * warning park, the acknowledgement is persisted next to the answer, and the record is marked
 * `form: 'unrecognized', verified: false` so a reviewer sees exactly which identities the product
 * vouched for and which it merely took down. Onboarding never blocks; the record is never
 * dishonest about what it is.
 *
 * Sameness is judged on the REGISTRY KEY, not the raw string: someone who retypes the same number
 * with different spacing or punctuation has insisted, not answered afresh.
 */
export function insistUnverifiedRegistration(raw: unknown, previouslyRefused: unknown): Validation | null {
  const key = normalizeRegistration(raw);
  if (key.length < MIN_UNVERIFIED_KEY_LENGTH) return null;
  if (key !== normalizeRegistration(previouslyRefused)) return null;
  const registration = String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return {
    ok: true,
    value: { registration, normalized: key, form: "unrecognized", verified: false },
    echo: `registration ${registration} — NOT a recognised Malaysian format, recorded UNVERIFIED for review`,
  };
}

/** True iff a recorded registration answer is the unverified kind (the marker a reviewer, a plan
 *  reader, or a later lane keys off — one definition so nobody re-derives it). */
export function isUnverifiedRegistration(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { verified?: unknown }).verified === false;
}

// ---------------------------------------------------------------------------
// F2 — the v2 segment shape: conditional follow-ups + a visible warning park.
// ---------------------------------------------------------------------------

/** One acknowledged warning, as it is recorded next to the answer. */
export type AcknowledgedWarning = { code: string; message: string; acknowledged: true };

/**
 * A follow-up question asked AFTER a segment's main answer validates and BEFORE its echo
 * confirm. `fold` either folds the follow-up's value into the segment value (returning the new
 * value + echo) or RESTARTS the segment with a reason — which is how a refusal that can only be
 * known after a second question (a company naming cash as its reporting basis) still lands as a
 * loud re-ask of the original question rather than a silent acceptance.
 */
export type FollowUp = {
  question: string;
  validate: (raw: unknown, prior: Readonly<Record<string, unknown>>) => Validation;
  fold: (value: unknown, followUpValue: unknown) => { value: unknown; echo: string } | { restart: string };
};

export type SegmentV2 = Omit<Segment, "question"> & {
  /** The question text. Static, or built from the prior answers (the entity-aware option list). */
  question: string;
  questionFor?: (prior: Readonly<Record<string, unknown>>) => string;
  /** Ask this segment at all? Absent ⇒ always. (The MPERS-eligibility screen is a Sdn Bhd's
   *  question only; asking it of a sole proprietor would be noise, and asking it of a Bhd would
   *  be asking a question the law already answers.) */
  appliesTo?: (prior: Readonly<Record<string, unknown>>) => boolean;
  /** Follow-ups, evaluated in order; each may decline (null) for the value in hand. */
  followUps?: ReadonlyArray<(value: unknown, prior: Readonly<Record<string, unknown>>) => FollowUp | null>;
  /** THE ESCAPE HATCH. Consulted ONLY when `validate` refused AND this segment already refused a
   *  previous answer: "the person has been shown why, and typed it again — may it be recorded
   *  as-is?" Returning a value never bypasses anything, because a hatch-recorded value is
   *  expected to raise a `warn`, so the record is acknowledged and marked. Null keeps re-asking.
   *  The driver deliberately does NOT decide what "the same answer again" means — that is domain
   *  judgement (the same registration typed with different punctuation is still insistence). */
  onInsist?: (raw: unknown, previouslyRefused: unknown, prior: Readonly<Record<string, unknown>>) => Validation | null;
  /** Warnings to surface before the echo-confirm. Empty ⇒ no warning park. */
  warn?: (value: unknown, prior: Readonly<Record<string, unknown>>) => ReadonlyArray<{ code: string; message: string }>;
};

/** Should this segment be asked, given what is known so far? */
export function segmentApplies(seg: SegmentV2, prior: Readonly<Record<string, unknown>>): boolean {
  return seg.appliesTo ? seg.appliesTo(prior) === true : true;
}

/** The question this segment asks right now. */
export function questionOf(seg: SegmentV2, prior: Readonly<Record<string, unknown>>): string {
  return seg.questionFor ? seg.questionFor(prior) : seg.question;
}

/**
 * Attach acknowledged warnings to a recorded value.
 *
 * A warning that is shown and then not written down is a warning that never happened, so this
 * never drops one: an object value gains a `warnings` array; a non-object value is WRAPPED
 * (`{ value, warnings }`) rather than losing the acknowledgement. In practice every
 * warning-bearing segment records an object, and the wrap is the fail-safe, not the path.
 */
export function withWarnings(value: unknown, warnings: ReadonlyArray<{ code: string; message: string }>): unknown {
  if (warnings.length === 0) return value;
  const acknowledged: AcknowledgedWarning[] = warnings.map((w) => ({ code: w.code, message: w.message, acknowledged: true }));
  const isPlainObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isPlainObject) return { value, warnings: acknowledged };
  const prior = (value as { warnings?: unknown }).warnings;
  const merged = Array.isArray(prior) ? [...(prior as AcknowledgedWarning[]), ...acknowledged] : acknowledged;
  return { ...(value as Record<string, unknown>), warnings: merged };
}

/**
 * Drive ONE v2 segment to a terminal SegmentResult, parking via `ask`.
 *
 *   1. ask the question ('q'), with any prior refusal reason prefixed;
 *   2. a lawful skip on a skippable segment ends the segment 'skipped';
 *   3. a refusal re-asks the SAME question carrying the reason — nothing is persisted (P19);
 *   4. NEW — each applicable follow-up is asked ('q'); a follow-up may fold its answer into the
 *      value, or restart the segment with a reason;
 *   5. NEW — any warnings are surfaced in ONE acknowledgement park and, once acknowledged, are
 *      recorded on the value; declining re-asks the question;
 *   6. the final value is echoed and confirmed ('c'); only a confirmed segment returns
 *      'answered', and only then does the caller persist.
 *
 * PARK PHASES ARE DELIBERATELY 'q' AND 'c' ONLY, and every park carries the SEGMENT's own key.
 * The shipped dashboard folds any phase that is not 'c' to 'q' and maps `seg` to the "step N"
 * ordinal, so a follow-up renders as a text box, a warning renders with the yes/change
 * affordance, and the progress indicator keeps working — with no dashboard change, which this
 * lane is not permitted to make.
 */
export async function askAndConfirmSegmentV2(
  seg: SegmentV2,
  ask: AskFn,
  prior: Readonly<Record<string, unknown>>,
): Promise<SegmentResult> {
  let prefix = "";
  // The raw answer this segment last REFUSED — the only state the driver keeps across rounds, and
  // it exists solely so `onInsist` can tell a fresh wrong answer from a repeated one.
  let lastRefused: unknown = undefined;
  // Bounded only by human patience (the salvage law): a cancel/expire is the sole non-answer exit.
  for (;;) {
    const q = await ask({ seg: seg.key, phase: "q", question: prefix + questionOf(seg, prior) });
    if (q.kind !== "answer") return terminal(q);
    if (seg.skippable && isSkip(q.value)) return { outcome: "skipped" };

    const v = seg.validate(q.value, prior);
    // THE ESCAPE HATCH (owner ruling): a refusal re-asks ONCE showing the accepted formats; the
    // same answer typed again is taken as insistence and recorded — loudly, never silently, since
    // the value it returns carries the marker its `warn` fires on. lastRefused starts undefined,
    // so the FIRST refusal can never hatch: a person must have been told why before insisting.
    const insisted = !v.ok && seg.onInsist && lastRefused !== undefined ? seg.onInsist(q.value, lastRefused, prior) : null;
    if (!v.ok && !(insisted && insisted.ok)) {
      lastRefused = q.value;
      prefix = `${v.reason}\n\n`;
      continue;
    }
    const accepted = insisted && insisted.ok ? insisted : (v as Extract<Validation, { ok: true }>);

    let value = accepted.value;
    let echo = accepted.echo;
    let restartReason: string | null = null;

    for (const makeFollowUp of seg.followUps ?? []) {
      const followUp = makeFollowUp(value, prior);
      if (!followUp) continue;
      const outcome = await driveFollowUp(seg, followUp, ask, prior, value);
      if (outcome.kind === "terminal") return outcome.result;
      if (outcome.kind === "restart") {
        restartReason = outcome.reason;
        break;
      }
      value = outcome.value;
      echo = outcome.echo;
    }
    if (restartReason !== null) {
      prefix = `${restartReason}\n\n`;
      continue;
    }

    const warnings = seg.warn ? seg.warn(value, prior) : [];
    if (warnings.length > 0) {
      const body = warnings.map((w) => `⚠ ${w.message}`).join("\n\n");
      const w = await ask({
        seg: seg.key,
        phase: "c",
        question: `${body}\n\nRecord the answer anyway, with this noted on the record? (yes / change)`,
      });
      if (w.kind !== "answer") return terminal(w);
      if (!isAffirmative(w.value)) {
        prefix = ""; // declined the warning → re-ask the plain question
        continue;
      }
      value = withWarnings(value, warnings);
    }

    const c = await ask({ seg: seg.key, phase: "c", question: `I recorded: ${echo}. Is that correct? (yes / change)` });
    if (c.kind !== "answer") return terminal(c);
    if (!isAffirmative(c.value)) {
      prefix = "";
      continue;
    }
    // The item records the question AS ASKED (the entity-aware text), not the static fallback —
    // a plan that says "which framework?" when the person was shown a Sdn Bhd's option list is a
    // plan that cannot be audited against what happened.
    const asked: Segment = { ...(seg as Segment), question: questionOf(seg, prior) };
    const items = seg.toItems ? seg.toItems(value, asked) : [defaultItem(asked, value)];
    return { outcome: "answered", value, answeredBy: c.answeredBy, items, echo };
  }
}

type FollowUpOutcome =
  | { kind: "value"; value: unknown; echo: string }
  | { kind: "restart"; reason: string }
  | { kind: "terminal"; result: SegmentResult };

/** Ask ONE follow-up to a verdict, re-asking on its own refusals exactly as the main question does. */
async function driveFollowUp(
  seg: SegmentV2,
  followUp: FollowUp,
  ask: AskFn,
  prior: Readonly<Record<string, unknown>>,
  value: unknown,
): Promise<FollowUpOutcome> {
  let prefix = "";
  for (;;) {
    const a = await ask({ seg: seg.key, phase: "q", question: prefix + followUp.question });
    if (a.kind !== "answer") return { kind: "terminal", result: terminal(a) };
    const fv = followUp.validate(a.value, prior);
    if (!fv.ok) {
      prefix = `${fv.reason}\n\n`;
      continue;
    }
    const folded = followUp.fold(value, fv.value);
    if ("restart" in folded) return { kind: "restart", reason: folded.restart };
    return { kind: "value", value: folded.value, echo: folded.echo };
  }
}

/** A skip, exactly as v1 reads one (kept here because v1 does not export it). */
function isSkip(raw: unknown): boolean {
  const s = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim().toLowerCase();
  return s === "skip" || s === "none" || s === "";
}

function terminal(r: Resolution): SegmentResult {
  return r.kind === "expired" ? { outcome: "expired" } : { outcome: "cancelled" };
}
