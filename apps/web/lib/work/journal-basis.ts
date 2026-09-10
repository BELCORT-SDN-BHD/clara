// The composer's own validation — pure functions over a draft, no React, no DB,
// no fetch. Split out of the component for the reason lib/journals/balance.ts
// gives for its own split: a rule about MONEY that lives inside a render body is
// a rule nobody can test without a DOM.
//
// WHAT THIS IS NOT. It is not the authority on whether a journal entry may be
// admitted. `clara.admit_journal_work` revalidates every rule below at admission
// and `clara.wake_record_journal_entry` revalidates the accounting ones AGAIN at
// commit, against the client's live chart and the live period lock — which is
// why this module deliberately does not attempt the two checks it could only
// guess at (is the period open, is this a control account). It exists so a
// preparer sees a mistake beside the field that holds it instead of as a refusal
// thirty seconds later, and every rule here is a MIRROR of one the database
// enforces, never a rule of its own.
//
// NO FLOATING POINT ANYWHERE. Amounts arrive already parsed to integer cents by
// the house `MoneyInput` (lib/bank/money.ts's exact string parser); this module
// only ever compares and adds integers, and it REJECTS a non-integer rather than
// rounding one — a draft restored from `sessionStorage` is untrusted input like
// any other persisted payload.

import type { JournalBasisWire } from "./api";

/** One line of the draft, in the composer's own shape. Deliberately the same
 *  field names as `lib/journals/types.ts`'s `EntryLineInput` — the manual
 *  compose ceremony (#634 owns its rebuild) edits exactly this shape, so the two
 *  surfaces stay one vocabulary and a line can be moved between them. */
export type JournalDraftLine = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

export type JournalDraftInput = {
  postingDate: string;
  memo: string;
  lines: JournalDraftLine[];
};

/**
 * The address of the control an issue belongs beside. A STRING, not an index,
 * because the composer uses it as the element `id` it focuses and as the
 * `aria-describedby` target — one vocabulary for "which control", so a rule
 * cannot name a field the form does not render.
 */
export type JournalFieldId =
  | "postingDate"
  | "memo"
  | "lines"
  | `line.${number}.account`
  | `line.${number}.description`
  | `line.${number}.debit`
  | `line.${number}.credit`;

export type JournalIssueCode =
  | "postingDateRequired"
  | "postingDateInvalid"
  | "memoRequired"
  | "memoTooLong"
  | "tooFewLines"
  | "accountRequired"
  | "accountUnknown"
  | "descriptionTooLong"
  | "amountRequired"
  | "amountBothSides"
  | "amountNotExact"
  | "unbalanced";

export type JournalIssue = { field: JournalFieldId; code: JournalIssueCode };

/**
 * THE TWO LENGTH CAPS, AND WHERE THEY COME FROM.
 *
 * Neither is this form's preference. They are the FROZEN tool schema's
 * (`packages/runtime/workflows/claraWork.v1.tools.ts`:
 * `memo: z.string().trim().min(1).max(4000)`, `description: z.string().max(2000)`),
 * restated at this door because a basis longer than them is ADMITTED-BUT-
 * UNPOSTABLE: `POST /api/work/journal` and migration 0178 both refuse it with
 * `max_length`, and a run that somehow received one could not echo it back
 * through the tool that posts it.
 *
 * THE TWO ARE MEASURED DIFFERENTLY, and the asymmetry is the schema's, not a
 * slip: zod TRIMS the memo before it caps it, and does NOT trim a line
 * narration. So the memo cap is on the trimmed string and the description cap is
 * on the raw one — exactly what `toDbBasis` measures at the runtime door
 * (`packages/runtime/src/workRoutes.ts`'s `MEMO_MAX_CHARS` /
 * `LINE_DESCRIPTION_MAX_CHARS`).
 */
export const MEMO_MAX_CHARS = 4000;
export const LINE_DESCRIPTION_MAX_CHARS = 2000;

/** How much of a cap must be spent before the count is worth showing — a TENTH
 *  left. A counter that is on screen from the first keystroke is a number nobody
 *  is reading; one that appears at 3,600 characters is telling a preparer
 *  something they are about to need. */
const NEAR_CAP_FRACTION = 10;

/** Characters still available under a cap. Negative when the value is already
 *  over it — which a `maxLength` control cannot produce, but a draft restored
 *  from storage can. */
export function charsLeft(value: string, cap: number): number {
  return cap - value.length;
}

/** Whether the remaining-count belongs on screen for this value. */
export function showCharsLeft(value: string, cap: number): boolean {
  return charsLeft(value, cap) <= Math.ceil(cap / NEAR_CAP_FRACTION);
}

export type JournalTotals = {
  debitCents: number;
  creditCents: number;
  /** debit − credit, in exact cents. Signed on purpose: "which side is short"
   *  is the question a preparer is actually asking, and an absolute value
   *  answers it only half the time. */
  differenceCents: number;
  balanced: boolean;
};

/** An ISO calendar date, and nothing else. `Date.parse` is NOT used: it accepts
 *  a dozen shapes the DB's `date` column does not, and it applies a timezone to
 *  a value that has none. The month/day ranges are checked by round-tripping
 *  through UTC, so 2026-02-31 fails rather than silently becoming March 3rd. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

/** The PRESENTATION sum, in exact integer cents — the same caveat
 *  lib/journals/balance.ts states about its own: this is what the preparer typed,
 *  not a figure the database owns. The DB's `_assert_balanced` is the real gate
 *  and this never overrides it. */
export function totalsOf(lines: readonly JournalDraftLine[]): JournalTotals {
  let debitCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    if (Number.isSafeInteger(line.debit_cents)) debitCents += line.debit_cents;
    if (Number.isSafeInteger(line.credit_cents)) creditCents += line.credit_cents;
  }
  return {
    debitCents,
    creditCents,
    differenceCents: debitCents - creditCents,
    balanced: debitCents === creditCents,
  };
}

function exactSide(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Every issue in the draft, IN DOM ORDER — posting date, memo, then each line
 * top to bottom, then the whole-form rules. The order is the contract: the
 * composer focuses `issues[0].field`, and "the FIRST invalid field" only means
 * anything if this list is in the order a human reads the form.
 *
 * `knownAccountCodes` is the client's ACTIVE chart, read from
 * `clara.coa_accounts` under RLS. `null` means the chart could not be read — and
 * then the unknown-account rule is SKIPPED rather than guessed: refusing every
 * account because a read failed would block a preparer over the UI's own
 * problem, and the commit rechecks each code against the live chart anyway.
 */
export function validateJournalDraft(
  draft: JournalDraftInput,
  knownAccountCodes: ReadonlySet<string> | null,
): JournalIssue[] {
  const issues: JournalIssue[] = [];

  if (draft.postingDate.trim() === "") issues.push({ field: "postingDate", code: "postingDateRequired" });
  else if (!isCalendarDate(draft.postingDate)) issues.push({ field: "postingDate", code: "postingDateInvalid" });

  // BLANK BEFORE TOO LONG: they are different instructions and only one can be
  // true, so the order is which one a human should read.
  if (draft.memo.trim() === "") issues.push({ field: "memo", code: "memoRequired" });
  else if (draft.memo.trim().length > MEMO_MAX_CHARS) issues.push({ field: "memo", code: "memoTooLong" });

  draft.lines.forEach((line, i) => {
    const code = line.account_code.trim();
    if (code === "") issues.push({ field: `line.${i}.account`, code: "accountRequired" });
    else if (knownAccountCodes !== null && !knownAccountCodes.has(code)) {
      issues.push({ field: `line.${i}.account`, code: "accountUnknown" });
    }

    // BETWEEN THE ACCOUNT AND THE AMOUNTS, because that is where the control
    // sits in the row — this list's order IS the focus order (see the header).
    // The RAW length, per the cap's own note.
    if ((line.description ?? "").length > LINE_DESCRIPTION_MAX_CHARS) {
      issues.push({ field: `line.${i}.description`, code: "descriptionTooLong" });
    }

    const debit = line.debit_cents;
    const credit = line.credit_cents;
    if (!exactSide(debit) || !exactSide(credit)) {
      // The offending SIDE, so the message lands on the control that holds it.
      issues.push({ field: exactSide(debit) ? `line.${i}.credit` : `line.${i}.debit`, code: "amountNotExact" });
    } else if (debit > 0 && credit > 0) {
      issues.push({ field: `line.${i}.credit`, code: "amountBothSides" });
    } else if (debit === 0 && credit === 0) {
      issues.push({ field: `line.${i}.debit`, code: "amountRequired" });
    }
  });

  // AFTER the per-line rules, deliberately. A draft with two blank lines is not
  // "unbalanced" — it is empty, and saying so at the top of the form while every
  // line also complains would bury the real instruction.
  if (draft.lines.length < 2) issues.push({ field: "lines", code: "tooFewLines" });
  else if (!totalsOf(draft.lines).balanced) issues.push({ field: "lines", code: "unbalanced" });

  return issues;
}

/** The control a failed submit moves focus to. Null when the draft is clean. */
export function firstInvalidField(issues: readonly JournalIssue[]): JournalFieldId | null {
  return issues[0]?.field ?? null;
}

/**
 * The draft, as the runtime's `POST /api/work/journal` accepts it — built ONLY
 * from a draft that has already validated clean, which is why this returns null
 * rather than a partially-shaped body when it has not. A wire body assembled
 * from an invalid draft is exactly how a UI ends up asking the database to
 * refuse something it could have caught.
 *
 * `currency` IS THE LITERAL "MYR" and is not taken from the draft, because the
 * draft has no currency field and inventing one would be a control the product
 * does not offer. Every basis this journey admits is in ringgit; the day a
 * second currency exists, it is a field on the form and a decision above this
 * function, not a default quietly widened here.
 */
export function toJournalBasisWire(
  draft: JournalDraftInput,
  knownAccountCodes: ReadonlySet<string> | null,
): JournalBasisWire | null {
  if (validateJournalDraft(draft, knownAccountCodes).length > 0) return null;
  return {
    postingDate: draft.postingDate,
    memo: draft.memo.trim(),
    currency: "MYR",
    lines: draft.lines.map((line) => {
      const description = (line.description ?? "").trim();
      return {
        accountCode: line.account_code.trim(),
        debitCents: line.debit_cents,
        creditCents: line.credit_cents,
        ...(description === "" ? {} : { description }),
      };
    }),
  };
}

/**
 * THE WIRE'S OWN `field` STRING, mapped onto a control this form renders.
 *
 * ONE VOCABULARY CROSSES `POST /api/work/journal`'s 400, AND IT IS THE
 * DATABASE'S. Whether the refusal came from `packages/runtime/src/workRoutes.ts`'s
 * `toDbBasis` (the earlier, cheaper half) or from migration 0178's
 * `clara._assert_journal_basis` (the authority), the body is the same shape with
 * the same spellings:
 *
 *     400 { "error": "invalid_basis", "field": <path>, "reason": <constraint> }
 *
 * and `field` is snake_case, carries NO `basis.` prefix, and indexes lines from
 * ONE:
 *
 *     basis | posting_date | memo | currency | lines | lines[N] |
 *     lines[N].account_code | lines[N].debit_cents | lines[N].credit_cents |
 *     lines[N].description
 *
 * IT IS 1-BASED BECAUSE SQL COUNTS FROM ONE. The DB generates the path from
 * `with ordinality`, the route adds one to its JavaScript index in a single
 * helper (`linePath`), and a zero-based consumer subtracts one AT ITS OWN EDGE.
 * This function is that edge for the browser: `lines[1]` is the FIRST row of the
 * form, `lines[2]` the second. Getting the offset wrong is not a cosmetic slip —
 * it focuses the wrong money control and reds a field the server never named.
 *
 * NOTHING camelCase IS ACCEPTED ANY MORE. An earlier reading also matched
 * `postingDate`, which is the WIRE REQUEST's spelling (`lib/work/api.ts`'s
 * `JournalBasisWire`), never a spelling any refusal comes back in. Keeping it
 * would have been a second vocabulary that no door speaks.
 *
 * `null` FOR ANYTHING ELSE, deliberately. `basis` and `currency` are real wire
 * paths with no control of their own (this form has no currency field: every
 * basis it can build is in ringgit), and an unrecognised path is a field name a
 * future build added. All three render as a form-level message carrying the
 * server's own `reason`, which is honest — instead of focusing whichever control
 * happened to share a prefix.
 */
export function fieldForServerPath(path: string | null): JournalFieldId | null {
  if (path === null) return null;
  if (path === "posting_date") return "postingDate";
  if (path === "memo") return "memo";
  if (path === "lines") return "lines";

  const line = /^lines\[(\d+)\](?:\.(account_code|debit_cents|credit_cents|description))?$/.exec(path);
  if (!line) return null;
  const ordinal = Number(line[1]);
  // ONE-BASED ON THE WIRE: `lines[0]` is not a path this vocabulary produces, so
  // it is refused rather than silently read as the first row.
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) return null;
  const index = ordinal - 1;

  switch (line[2]) {
    case "account_code":
      return `line.${index}.account`;
    case "debit_cents":
      return `line.${index}.debit`;
    case "credit_cents":
      return `line.${index}.credit`;
    case "description":
      return `line.${index}.description`;
    default:
      // A BARE `lines[N]` — the route raises it for `object` (a line that is not
      // an object, which this form cannot build) and for `exactly_one_side`,
      // which is a statement about the two AMOUNT controls. Debit is the first
      // of them in the row, so it is the one focus lands on.
      return `line.${index}.debit`;
  }
}
