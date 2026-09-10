// #629 — THE FIELD GRAMMAR, ON THE BROWSER'S SIDE.
//
// THIS IS NOT THE AUTHORITY AND IT NEVER PRETENDS TO BE. `clara._assert_work_answer` (migration
// 0180) is what decides whether an answer is well-formed, and it is the only thing that CAN decide
// the two rules a browser has no standing on: whether an account code is active in this client's
// chart, and whether the question is still open at the moment of the write. What lives here is the
// cheap half — required, integer cents, ISO date, a value that is one of the declared options,
// length — so a person is told about a typo before a round trip, and so the form can focus the
// first invalid control without waiting for the server to name one.
//
// THE TWO IMPLEMENTATIONS MUST AGREE ON THE PART THEY SHARE, and the way they are kept in step is
// that both are written from the SAME field grammar and both name the SAME `constraint` tokens
// (`required`, `integer_cents`, `iso_date`, `option`, `max_length`). A local refusal and a server
// refusal therefore render through one copy path, and a divergence shows up as a server refusal on
// a field the browser passed — which is a finding about this file, not a mystery.
//
// MONEY IS INTEGER MINOR UNITS AND NOTHING ELSE. The composer's own exact-cent discipline, applied
// to a question field: what a person types is parsed to an integer number of cents or refused, and
// no float ever exists in between. `1200.5` is not "rounded to 1201" — it is refused, because the
// alternative is inventing half a cent nobody entered.

import type { WorkAnswerDraft, WorkAnswerValue, WorkQuestionField } from "./questions";

export type FieldProblem = { field: string; constraint: string };

/** TRUE unless the wire explicitly said false. The database's own default, restated: a field that
 *  omits `required` IS required, and reading absence as optional would let a model ship a question
 *  whose answer nobody has to fill in. */
export function isRequired(field: WorkQuestionField): boolean {
  return field.required !== false;
}

/** The declared options of a choice field, or an empty list. */
export function optionsOf(field: WorkQuestionField): { value: string; label: string }[] {
  return Array.isArray(field.options) ? field.options : [];
}

/** Is this draft value empty? A blank string and a null are the same thing to a person: they typed
 *  nothing. `0` is NOT empty — a zero-cent answer is a real answer and refusing it as blank would
 *  be the classic falsy-check defect. */
export function isBlank(value: WorkAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.trim() === "";
}

/**
 * Parse a typed money string to INTEGER CENTS, or null when it is not one.
 *
 * ACCEPTS what a person actually types for an amount in ringgit and sen — `1200.00`, `1,200.00`,
 * `1200`, `.50`, a leading `-` — and converts it EXACTLY, by string surgery on the two decimal
 * places rather than by `Math.round(Number(x) * 100)`. That multiplication is the defect this
 * function exists to avoid: `Number("1234.35") * 100` is 123434.99999999999, and rounding it is a
 * coin flip the ledger pays for.
 *
 * REFUSES more than two decimal places rather than truncating: `1200.555` is not 1200.55 or
 * 1200.56, it is a number this lane has no representation for, and the person needs to be told.
 */
export function parseMoneyToCents(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (text === "") return null;
  const m = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (m === null) return null;
  const [, sign, whole, frac] = m;
  if ((whole ?? "") === "" && (frac ?? "") === "") return null;
  const cents = Number(`${whole || "0"}${(frac ?? "").padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents)) return null;
  return sign === "-" ? -cents : cents;
}

/** Integer cents back to the text a person edits. Exact by construction: a division would
 *  reintroduce the float this lane refuses. */
export function centsToText(cents: number): string {
  const negative = cents < 0;
  const digits = String(Math.abs(cents)).padStart(3, "0");
  const whole = digits.slice(0, -2);
  const frac = digits.slice(-2);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** A real calendar date in ISO form. `2026-02-30` matches the shape and is not a date, so the
 *  round-trip through `Date` is the check rather than the regex alone. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/**
 * Validate ONE field's draft value. Returns the violated `constraint` token, or null.
 *
 * `account` IS DELIBERATELY NOT VALIDATED BEYOND "NOT BLANK". Whether a code is active in this
 * client's chart is the database's question, asked against a table this form does not own, and a
 * browser-side allowlist built from a chart read would go stale between the read and the write.
 * The server names the field on refusal, and the form focuses it — which is the honest division.
 */
export function validateField(field: WorkQuestionField, value: WorkAnswerValue | undefined): string | null {
  if (isBlank(value)) return isRequired(field) ? "required" : null;
  const text = typeof value === "string" ? value : String(value);
  switch (field.kind) {
    case "money":
      return typeof value === "number"
        ? Number.isSafeInteger(value) ? null : "integer_cents"
        : parseMoneyToCents(text) === null ? "integer_cents" : null;
    case "date":
      return isIsoDate(text) ? null : "iso_date";
    case "choice":
      return optionsOf(field).some((o) => o.value === text) ? null : "option";
    case "account":
      return null;
    default:
      return text.length > 4000 ? "max_length" : null;
  }
}

/** Every problem in a draft, in FIELD ORDER — so "focus the first invalid control" is the first
 *  element of this list and never a second sort. */
export function validateDraft(fields: readonly WorkQuestionField[], draft: WorkAnswerDraft): FieldProblem[] {
  const out: FieldProblem[] = [];
  for (const field of fields) {
    const constraint = validateField(field, draft[field.key]);
    if (constraint !== null) out.push({ field: field.key, constraint });
  }
  return out;
}

/**
 * The answer object the door takes, built from a validated draft.
 *
 * A BLANK OPTIONAL FIELD IS OMITTED, never sent as `null` or `""`. `clara._assert_work_answer`
 * treats an explicit null as absent for an optional field and refuses it for a required one, so
 * either would work — but the ACCEPTED ANSWER is what every surface renders afterwards, and an
 * answer carrying `{"memo": null}` reads as "somebody answered 'nothing'" rather than "nobody was
 * asked to". The record is the point.
 *
 * MONEY BECOMES A JSON NUMBER, and an integer one: the door refuses `"120000"` (a string) and
 * `1200.5` (not an integer), and both refusals would be this function's fault rather than the
 * person's.
 */
export function buildAnswer(
  fields: readonly WorkQuestionField[],
  draft: WorkAnswerDraft,
  note?: string | null,
): Record<string, unknown> {
  const answer: Record<string, unknown> = {};
  for (const field of fields) {
    const value = draft[field.key];
    if (isBlank(value)) continue;
    if (field.kind === "money") {
      const cents = typeof value === "number" ? value : parseMoneyToCents(String(value));
      if (cents !== null) answer[field.key] = cents;
      continue;
    }
    answer[field.key] = typeof value === "string" ? value.trim() : value;
  }
  if (typeof note === "string" && note.trim() !== "") answer.note = note.trim();
  return answer;
}

/** How a question is presented: ONE field is a single Field; two to six is a bounded stepper with a
 *  review step. Spelled once so the form, its tests and the browser walk agree on the boundary. */
export function isSingleField(fields: readonly WorkQuestionField[]): boolean {
  return fields.length <= 1;
}

/** The step indices of a stepper: one per field, plus a final REVIEW step. */
export function stepCount(fields: readonly WorkQuestionField[]): number {
  return fields.length + 1;
}
