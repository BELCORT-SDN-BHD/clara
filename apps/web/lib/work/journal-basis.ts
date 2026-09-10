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
  | `line.${number}.debit`
  | `line.${number}.credit`;

export type JournalIssueCode =
  | "postingDateRequired"
  | "postingDateInvalid"
  | "memoRequired"
  | "tooFewLines"
  | "accountRequired"
  | "accountUnknown"
  | "amountRequired"
  | "amountBothSides"
  | "amountNotExact"
  | "unbalanced";

export type JournalIssue = { field: JournalFieldId; code: JournalIssueCode };

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

  if (draft.memo.trim() === "") issues.push({ field: "memo", code: "memoRequired" });

  draft.lines.forEach((line, i) => {
    const code = line.account_code.trim();
    if (code === "") issues.push({ field: `line.${i}.account`, code: "accountRequired" });
    else if (knownAccountCodes !== null && !knownAccountCodes.has(code)) {
      issues.push({ field: `line.${i}.account`, code: "accountUnknown" });
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
 * THE RUNTIME'S OWN `field` STRING, mapped onto a control this form renders.
 *
 * The 400 body carries the database's typed detail —
 * `{"reason":"invalid_basis","field":"lines[1].debit_cents"}` — and that is a
 * SERVER address, not a client one. Mapping it here rather than in the component
 * keeps the translation in one testable place, and returning `null` for anything
 * unrecognised is what stops a future field name from focusing the wrong control:
 * an unmapped refusal renders as a form-level message with the server's own text
 * beside it, which is honest, instead of pointing at whichever control happened
 * to match a prefix.
 */
export function fieldForServerPath(path: string | null): JournalFieldId | null {
  if (path === null) return null;
  if (path === "posting_date" || path === "postingDate") return "postingDate";
  if (path === "memo") return "memo";
  if (path === "lines") return "lines";
  const line = /^lines\[(\d+)\]\.(account_code|debit_cents|credit_cents)$/.exec(path);
  if (!line) return null;
  const index = Number(line[1]);
  if (!Number.isSafeInteger(index) || index < 0) return null;
  if (line[2] === "account_code") return `line.${index}.account`;
  return line[2] === "debit_cents" ? `line.${index}.debit` : `line.${index}.credit`;
}
