// Accounting-Work routes (#623, contract §Runtime). The SECOND trusted-ingress boundary in this
// package, and it is deliberately the same shape as the first (src/chatRoutes.ts): every route
// resolves the principal through lib/authz (JWT → live membership) before any DB work, the
// database verb re-checks that principal's role and client access for itself, and the verb's
// structured errors are mapped to HTTP by an exported predicate a cell can drive.
//
// ADMISSION IS `clara.admit_journal_work` — ONE atomic transaction: the authority recheck, the
// basis validation, the `(firm, intent_key)` idempotency, the Work row with its server-assigned
// `logical_op_id`, and the queued `accounting_work` task. AFTER it commits we enqueue the durable
// run best-effort, exactly as the chat turn route does and for the same reason: the workflow's
// first step CAS-binds itself, so a failed enqueue here is recoverable by the reconciler's
// `accounting_work` arm and is never a lost Work.
//
// WHY 202 AND NOT 201. The response acknowledges an ADMITTED intent, not a posted entry. The
// entry is posted seconds later by a claraWork_v1 run under a wake credential minted OBO this
// same human, with the period, the chart, the control-account rule and their live role all
// rechecked AT COMMIT. A 201 would read as "created the entry", which is the single most
// consequential thing this surface could get wrong.
//
// THE MALFORMED-ID RULE IS #614's LESSON, KEPT: a client id or a work id that is not a uuid is a
// NOT-FOUND, never a database error. The guard runs before any query so a malformed id cannot
// reach Postgres and come back as a 500 that reads like an outage.
//
// WHAT THIS FILE NEEDS FROM MIGRATION 0178, stated here so a deploy can check it rather than
// discover it: EXECUTE on `clara.admit_journal_work` and `clara.retry_accounting_work` for the
// role the runtime pool SET ROLEs to (the way `clara.begin_chat_turn` is granted), and SELECT on
// `clara.accounting_work` for that same role — the read route below joins it directly rather than
// through a verb, exactly as the chat session list reads `clara.chat_sessions`. Without the
// SELECT the read route 500s while admission still works, which is the confusing half-state worth
// naming in advance.
//
// WIRE FIELD PATHS — ONE VOCABULARY, AND IT IS THE DATABASE'S.
//
// A 400 from this surface has two machine-readable slots, `field` and `reason`, and both of them
// are spelled the way migration 0178 spells them, whether the refusal came from this file or from
// `clara._assert_journal_basis`:
//
//   field    `basis` | `posting_date` | `memo` | `currency` | `lines` | `lines[N]` |
//            `lines[N].account_code` | `lines[N].debit_cents` | `lines[N].credit_cents` |
//            `lines[N].description`  — snake_case, no `basis.` prefix, and N is 1-BASED because
//            SQL's `with ordinality` counts from one and the database generates the path FROM
//            that ordinal (0178's header states this and says zero-based consumers subtract one
//            at THEIR edge). This route iterates a JavaScript array, so it adds one; `linePath`
//            is the only place that arithmetic happens.
//   reason   the database's `constraint` token: `object` | `present` | `iso_date` | `nonempty` |
//            `myr` | `array` | `at_least_two` | `exactly_one_side` | `integer_cents` |
//            `nonnegative_integer_cents` | `balanced` | `nonzero_total` | `max_length`, plus the
//            one route-only token `text` (see `toDbBasis`). #634 adds the evidence array's own
//            tokens on the same footing — `object` | `kind` | `document_id` | `uuid` |
//            `at_most_one_document` | `not_filed` — because `invalid_source_ref` is field-scoped
//            exactly as `invalid_basis` is, and `not_filed` is reachable only from the database.
//            For a non-field CLR10 the reason is the database's typed `detail.reason` instead
//            (`invalid_intent_key`, …).
//
//            #643 adds ONE MORE PREFIX on the same footing: `adjustment.<key>`, the typed
//            particulars of a periodic stock adjustment or a supplied payroll obligation
//            (migration 0194's own spelling). The database spells the key snake_case and the
//            browser posts it camelCase, so `toWireField` re-spells it — the SECOND and last
//            translation this route performs, beside `source_refs` → `sourceRefs`, and it is a
//            total function rather than a table so a new field cannot fall out of step. Its
//            reasons are the database's own: `invalid_adjustment` folds to its `constraint`
//            exactly as `invalid_basis` does, and `adjustment_all_zero`, `adjustment_lines_mismatch`,
//            `adjustment_account_relationship`, `advance_not_enrolled`, `scope_overbroad`,
//            `stale_basis` and the three `correction_target_*` tokens ride back under their own
//            names. A locked period is CLR19 `write_into_closed_period`, which `workErrorStatus`
//            maps for the first time here — see its own note for why that code could not reach
//            this surface before.
//
//            #638 adds ONE MORE PREFIX on the same footing: `claim.<key>`, the typed particulars
//            of a staff expense claim (migration 0221's own spelling), including the nested
//            `claim.claimant.<key>` and the 1-BASED `claim.items[N].<key>`. The same total
//            `_x` -> `X` re-speller serves it, so a field the schema gains cannot fall out of
//            step. Its reasons are the database's own: `invalid_claim` folds to its `constraint`
//            exactly as `invalid_basis` does, and `claimant_missing`, `claimant_not_enrolled`,
//            `incurred_date_missing`, `incurred_after_posting`, `item_account_not_expense`,
//            `items_do_not_sum`, `claim_all_zero`, `payable_account_is_control`,
//            `advance_not_enrolled`, `advance_allocation_mismatch` and the three
//            `correction_target_*` tokens ride back under their own names.
//
// WHY IT MATTERS ENOUGH TO STATE. `apps/web/lib/work/journal-basis.ts`'s `fieldForServerPath` is
// the ONE mapper from a wire path onto a focusable control, and it was written against the
// database's spelling. This route used to answer `basis.postingDate` / `basis.lines[0].accountCode`
// — a second, camelCase, zero-based vocabulary that mapper does not know — so a 400 raised HERE
// (the earlier, cheaper half of the very same validation) put no error beside any control and
// focused nothing, while the identical refusal from the DATABASE did. Two spellings of one
// contract is a mapper that is right half the time; there is now one.
//
// THE READ ROUTE IS NARROW ON PURPOSE. The web reads `clara.accounting_work`,
// `clara.operation_receipts`, `clara.journal_entries` and `clara.journal_lines` through their own
// RLS as the signed-in human; `GET /api/work/:workId` exists for the lost-response check and for
// the e2e, and it returns the task's `workflow_run_id` as a BOOLEAN — whether the Work is bound
// to a run is the operable fact, and the engine's run id is not a thing a browser needs.

import express from "express";
import { start } from "workflow/api";
import { authenticate, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";

const DEFAULT_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type WireLine = { accountCode?: unknown; debitCents?: unknown; creditCents?: unknown; description?: unknown };
type WireBasis = { postingDate?: unknown; memo?: unknown; currency?: unknown; lines?: unknown };
type WireSourceRef = { kind?: unknown; documentId?: unknown };

/** A 400 payload: the offending field and the machine-readable reason, so the composer can put
 *  the error beside the control that produced it instead of showing one banner for everything. */
export type InvalidBasis = { error: "invalid_basis"; field: string; reason: string };

function invalid(field: string, reason: string): InvalidBasis {
  return { error: "invalid_basis", field, reason };
}

/** The DB's own path for a line field, 1-BASED (see the WIRE FIELD PATHS note in this file's
 *  header). `i` is the JavaScript array index this route iterated with. */
function linePath(i: number, field?: string): string {
  return field === undefined ? `lines[${i + 1}]` : `lines[${i + 1}].${field}`;
}

/** THE FROZEN TOOL SCHEMA'S CAPS, RESTATED AT THE FIRST DOOR. `claraWork.v1.tools.ts` spells the
 *  echoed basis `memo: z.string().trim().min(1).max(4000)` and `description: z.string().max(2000)`,
 *  and that file is FROZEN (spelled without the literal freeze marker: scripts/check-frozen-
 *  workflows.mjs treats ANY file containing that marker as a frozen root and hash-locks its whole
 *  relative import closure, so a prose mention here would freeze this route, lib/authz.mjs,
 *  lib/pools.mjs and workflows/registry.ts — the one file that must never be frozen).
 *  Without these two checks an over-long memo was ADMITTED — the Work
 *  row existed, a run was queued, real budget was spent — and then died inside the segment when
 *  the model echoed the basis back, settling the Work `failed` for something the composer could
 *  have shown the typist at submit time. Migration 0178's `clara._assert_journal_basis` carries
 *  the same two caps; this is the earlier, more legible half.
 *
 *  THE MEASUREMENTS ARE THE SCHEMA'S, NOT A ROUNDING OF THEM. Zod's `.trim()` transforms BEFORE
 *  `.max()`, so the memo cap is measured on the TRIMMED string; `description` carries no `.trim()`,
 *  so its cap is measured on the RAW one. A route that measured both the same way would refuse a
 *  memo the run could post, or admit one it could not. */
export const MEMO_MAX_CHARS = 4000;
export const LINE_DESCRIPTION_MAX_CHARS = 2000;

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Shape-validate the WIRE basis and translate it into the DATABASE's own field spelling. The
 * database re-validates every one of these and is the authority; this is the earlier, more
 * legible half whose job is to name the field. Exported so a cell drives THIS function rather
 * than a copy of its predicate (the `turnErrorStatus` precedent).
 *
 * NO FLOATING POINT ANYWHERE. Cents arrive as integers and stay integers; a non-integer is
 * refused by name rather than rounded, because a rounded cent is a wrong ledger.
 */
export function toDbBasis(raw: unknown): { ok: true; basis: Record<string, unknown> } | { ok: false; error: InvalidBasis } {
  if (!raw || typeof raw !== "object") return { ok: false, error: invalid("basis", "object") };
  const basis = raw as WireBasis;
  if (typeof basis.postingDate !== "string" || basis.postingDate.trim() === "") {
    return { ok: false, error: invalid("posting_date", "present") };
  }
  if (!DATE_RE.test(basis.postingDate)) return { ok: false, error: invalid("posting_date", "iso_date") };
  if (typeof basis.memo !== "string" || basis.memo.trim() === "") {
    return { ok: false, error: invalid("memo", "nonempty") };
  }
  // The TRIMMED length, because the frozen tool schema trims before it caps (see MEMO_MAX_CHARS).
  if (basis.memo.trim().length > MEMO_MAX_CHARS) return { ok: false, error: invalid("memo", "max_length") };
  if (basis.currency !== "MYR") return { ok: false, error: invalid("currency", "myr") };
  if (!Array.isArray(basis.lines)) return { ok: false, error: invalid("lines", "array") };
  if (basis.lines.length < 2) return { ok: false, error: invalid("lines", "at_least_two") };
  const lines: Array<Record<string, unknown>> = [];
  let debit = 0;
  let credit = 0;
  for (let i = 0; i < basis.lines.length; i += 1) {
    const line = basis.lines[i] as WireLine;
    if (!line || typeof line !== "object") return { ok: false, error: invalid(linePath(i), "object") };
    if (typeof line.accountCode !== "string" || line.accountCode.trim() === "") {
      return { ok: false, error: invalid(linePath(i, "account_code"), "nonempty") };
    }
    if (!isInteger(line.debitCents)) return { ok: false, error: invalid(linePath(i, "debit_cents"), "integer_cents") };
    if (line.debitCents < 0) return { ok: false, error: invalid(linePath(i, "debit_cents"), "nonnegative_integer_cents") };
    if (!isInteger(line.creditCents)) return { ok: false, error: invalid(linePath(i, "credit_cents"), "integer_cents") };
    if (line.creditCents < 0) return { ok: false, error: invalid(linePath(i, "credit_cents"), "nonnegative_integer_cents") };
    const oneSided = (line.debitCents > 0 && line.creditCents === 0) || (line.creditCents > 0 && line.debitCents === 0);
    if (!oneSided) return { ok: false, error: invalid(linePath(i), "exactly_one_side") };
    // `text` is the ONE constraint token below that migration 0178 has no analogue for, and it is
    // here rather than left to the database on purpose: 0178 reads the narration with `->>`, which
    // coerces a number to its text form and never type-checks it, so a numeric description would
    // be ADMITTED and then refused inside the run by `claraWork.v1.tools.ts`'s frozen
    // `z.string().max(2000).nullish()` — admitted-but-unpostable, the exact failure the two caps
    // above exist to prevent.
    if (line.description !== undefined && line.description !== null && typeof line.description !== "string") {
      return { ok: false, error: invalid(linePath(i, "description"), "text") };
    }
    // The RAW length — that schema does not trim (see LINE_DESCRIPTION_MAX_CHARS).
    if (typeof line.description === "string" && line.description.length > LINE_DESCRIPTION_MAX_CHARS) {
      return { ok: false, error: invalid(linePath(i, "description"), "max_length") };
    }
    debit += line.debitCents;
    credit += line.creditCents;
    lines.push({
      account_code: line.accountCode,
      debit_cents: line.debitCents,
      credit_cents: line.creditCents,
      description: line.description === undefined || line.description === null ? null : line.description,
    });
  }
  if (debit !== credit) return { ok: false, error: invalid("lines", "balanced") };
  if (debit === 0) return { ok: false, error: invalid("lines", "nonzero_total") };
  return {
    ok: true,
    basis: { posting_date: basis.postingDate, memo: basis.memo, currency: "MYR", lines },
  };
}

/**
 * #634 — THE OPTIONAL EVIDENCE ON AN ADMISSION, translated into the database's own shape.
 *
 * EVIDENCE IS OPTIONAL, AND ABSENCE IS NOT A REFUSAL. An omitted, null or empty `sourceRefs` is a
 * documentless Work — the C3 expert path #623 shipped, unchanged. The one supported kind on THIS
 * door is `document`: `chat_task` refs are the FROZEN `chatTurn.v18` lane's to mint (it puts the
 * conversation's own task and session on the Work), and a browser asserting one would be a client
 * claiming provenance it does not have.
 *
 * The field paths are 1-BASED and spelled `sourceRefs[N]`, which is the WIRE spelling of the
 * database's own `source_refs[N]` (see `toWireField`). One vocabulary, one mapper — the same law
 * the WIRE FIELD PATHS note in this file's header states for the basis.
 */
export function toDbSourceRefs(
  raw: unknown,
): { ok: true; sourceRefs: Array<Record<string, unknown>> } | { ok: false; error: InvalidBasis } {
  if (raw === undefined || raw === null) return { ok: true, sourceRefs: [] };
  if (!Array.isArray(raw)) return { ok: false, error: invalid("sourceRefs", "array") };
  const refs: Array<Record<string, unknown>> = [];
  let documents = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const path = `sourceRefs[${i + 1}]`;
    const ref = raw[i] as WireSourceRef;
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      return { ok: false, error: invalid(path, "object") };
    }
    if (ref.kind !== "document") return { ok: false, error: invalid(path, "kind") };
    documents += 1;
    // At most ONE document per Work in this ticket (multi-document evidence is out of scope).
    // Refused HERE as well as in the database because the composer can put the error beside the
    // control, and because a Work admitted with two would be unpostable anyway.
    if (documents > 1) return { ok: false, error: invalid(path, "at_most_one_document") };
    if (typeof ref.documentId !== "string" || !UUID_RE.test(ref.documentId)) {
      return { ok: false, error: invalid(path, "uuid") };
    }
    refs.push({ kind: "document", document_id: ref.documentId });
  }
  return { ok: true, sourceRefs: refs };
}

/**
 * #643 — THE TYPED PARTICULARS OF A PERIODIC ADJUSTMENT, translated into the database's own shape.
 *
 * SHAPE ONLY, AND DELIBERATELY THIN. `clara._assert_adjustment_basis` (migration 0194) is the
 * authority and re-checks every rule — the method vocabulary, the derived movement, the counted
 * date inside its own period, the all-zero refusal, every length cap — at admission AND again at
 * commit. This function exists to name the FIELD for the composer and to refuse the two things the
 * database cannot diagnose helpfully: a payload that is not an object at all, and a number that is
 * not an integer (jsonb `->>` coerces a string to text, so `"1200"` would be ADMITTED and then be
 * a stored figure nobody typed).
 *
 * THE PURPOSE DECIDES THE SHAPE. A discriminated union, not one object with optional halves: a
 * payroll obligation carrying `inventoryAccountCode` is not a shape the database can refuse
 * helpfully — it is a shape this door must never produce.
 *
 * NOTHING IS DEFAULTED AND NOTHING IS COMPUTED. Every value below is the caller's; the one
 * arithmetic the lane does (`closing − opening`) is the DATABASE's own consistency check against
 * the movement the caller supplied.
 */
export type WireAdjustment = Record<string, unknown>;

const ADJUSTMENT_STRINGS: Record<string, ReadonlyArray<[string, string, number, boolean]>> = {
  // [wire key, db key, max chars, required]
  periodic_stock_adjustment: [
    ["method", "method", 64, true],
    ["inventoryAccountCode", "inventory_account_code", 64, true],
    ["costAccountCode", "cost_account_code", 64, true],
    ["countedAt", "counted_at", 10, false],
    ["countReference", "count_reference", 200, false],
    ["instruction", "instruction", MEMO_MAX_CHARS, true],
  ],
  payroll_obligation: [
    ["obligationKind", "obligation_kind", 64, true],
    ["expenseAccountCode", "expense_account_code", 64, true],
    ["liabilityAccountCode", "liability_account_code", 64, true],
    ["advanceAccountCode", "advance_account_code", 64, false],
    ["paymentAccountCode", "payment_account_code", 64, false],
    ["particularsSource", "particulars_source", 500, true],
    ["instruction", "instruction", MEMO_MAX_CHARS, true],
  ],
};

const ADJUSTMENT_CENTS: Record<string, ReadonlyArray<[string, string, boolean]>> = {
  // [wire key, db key, required]
  periodic_stock_adjustment: [
    ["openingCents", "opening_cents", false],
    ["closingCents", "closing_cents", false],
    ["adjustmentCents", "adjustment_cents", true],
  ],
  // #797 · `settledCents` is OPTIONAL and unsigned: migration 0212 made the settlement split a
  // real particular, so the key has to reach the database or the web control could never be
  // server-refusable. Absent means absent — an explicit 0 is a different fact (0212 refuses it
  // beside a named payment account by name), so it is carried rather than dropped as falsy.
  payroll_obligation: [
    ["amountCents", "amount_cents", true],
    ["settledCents", "settled_cents", false],
  ],
};

function adjustmentInvalid(key: string, reason: string): InvalidBasis {
  return { error: "invalid_basis", field: `adjustment.${key}`, reason };
}

export function toDbAdjustment(
  purpose: string,
  raw: unknown,
): { ok: true; adjustment: Record<string, unknown> } | { ok: false; error: InvalidBasis } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: { error: "invalid_basis", field: "adjustment", reason: "object" } };
  }
  const wire = raw as WireAdjustment;
  const out: Record<string, unknown> = { currency: "MYR" };

  for (const key of ["periodStart", "periodEnd"] as const) {
    const db = key === "periodStart" ? "period_start" : "period_end";
    const value = wire[key];
    if (typeof value !== "string" || value.trim() === "") return { ok: false, error: adjustmentInvalid(db, "present") };
    if (!DATE_RE.test(value)) return { ok: false, error: adjustmentInvalid(db, "iso_date") };
    out[db] = value;
  }
  if (String(out.period_end) < String(out.period_start)) {
    return { ok: false, error: adjustmentInvalid("period_end", "order") };
  }

  for (const [key, db, max, required] of ADJUSTMENT_STRINGS[purpose] ?? []) {
    const value = wire[key];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      if (required) return { ok: false, error: adjustmentInvalid(db, db === "instruction" ? "nonempty" : "present") };
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: adjustmentInvalid(db, "text") };
    // The TRIMMED length, for the reason `MEMO_MAX_CHARS` states: the database measures the
    // trimmed string, and a door that measured the raw one would refuse a value it would accept.
    if (value.trim().length > max) return { ok: false, error: adjustmentInvalid(db, "max_length") };
    if (db === "counted_at" && !DATE_RE.test(value)) return { ok: false, error: adjustmentInvalid(db, "iso_date") };
    out[db] = value;
  }

  for (const [key, db, required] of ADJUSTMENT_CENTS[purpose] ?? []) {
    const value = wire[key];
    if (value === undefined || value === null) {
      if (required) return { ok: false, error: adjustmentInvalid(db, "present") };
      continue;
    }
    if (!isInteger(value)) return { ok: false, error: adjustmentInvalid(db, "integer_cents") };
    // A STOCK MOVEMENT IS SIGNED (a count below opening is a real, negative movement); everything
    // else is unsigned, exactly as the database's own `clara._adjustment_cents` reads them.
    if (db !== "adjustment_cents" && value < 0) {
      return { ok: false, error: adjustmentInvalid(db, "nonnegative_integer_cents") };
    }
    out[db] = value;
  }

  if (wire.correctsAdjustmentId !== undefined && wire.correctsAdjustmentId !== null) {
    if (typeof wire.correctsAdjustmentId !== "string" || !UUID_RE.test(wire.correctsAdjustmentId)) {
      return { ok: false, error: adjustmentInvalid("corrects_adjustment_id", "uuid") };
    }
    out.corrects_adjustment_id = wire.correctsAdjustmentId;
  }
  return { ok: true, adjustment: out };
}

/**
 * #638 — THE TYPED PARTICULARS OF A STAFF EXPENSE CLAIM, translated into the database's own shape.
 *
 * SHAPE ONLY, AND DELIBERATELY THIN. `clara._assert_claim_basis` (migration 0221) is the authority
 * and re-checks every rule — the claimant handle, the two dates, the itemisation and its exact sum,
 * the settlement vocabulary, the expense class of every item account, the non-control payable, the
 * advance's own capacity. This function exists to name the FIELD for the composer and to refuse the
 * two things the database cannot diagnose helpfully: a payload that is not an object at all, and a
 * number that is not an integer (jsonb `->>` coerces a string to text, so `"48000"` would be
 * ADMITTED and then be a stored figure nobody typed).
 *
 * `amountCents` IS NOT A WIRE FIELD. The claim total is DERIVED here from the non-pending items,
 * for the same reason `clara._claim_journal_basis` derives the lines: the database refuses a claim
 * whose items do not sum to its total (`items_do_not_sum`), so there is exactly one honest value
 * and a caller-supplied one could only ever disagree with it.
 *
 * SUPPLIED TAX FACTS ARE AN OPAQUE PASSTHROUGH. This beta has no tax vocabulary (0150:525 calls the
 * statutory tag a hint; PRD:124 defers tax preparation), and AC1 asks only that they be carried.
 */
export type WireClaimItem = {
  description?: unknown; expenseAccountCode?: unknown; amountCents?: unknown;
  suppliedTax?: unknown; incurredDate?: unknown; pendingFact?: unknown;
};
export type WireClaimant = {
  enrolmentId?: unknown; accountCode?: unknown; personLabel?: unknown; attestation?: unknown;
  confirmDedicated?: unknown; identifier?: unknown;
};
export type WireClaim = {
  claimant?: unknown; sourceKind?: unknown; instruction?: unknown; incurredDate?: unknown;
  postingDate?: unknown; items?: unknown; settlement?: unknown; payableAccountCode?: unknown;
  advanceAccountCode?: unknown; advanceId?: unknown; paymentAccountCode?: unknown;
  correctsClaimId?: unknown;
};

export const CLAIM_SETTLEMENTS = Object.freeze(["reimbursement", "advance_application", "already_settled"]);
const CLAIM_ITEM_DESCRIPTION_MAX_CHARS = 2000;

function claimInvalid(key: string, reason: string): InvalidBasis {
  return { error: "invalid_basis", field: `claim.${key}`, reason };
}

/** A required non-empty wire string, capped, with the DATABASE's own field path. */
function claimText(
  value: unknown, key: string, max: number, required: boolean,
): { ok: true; value: string | undefined } | { ok: false; error: InvalidBasis } {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) return { ok: false, error: claimInvalid(key, "nonempty") };
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") return { ok: false, error: claimInvalid(key, "text") };
  if (value.trim().length > max) return { ok: false, error: claimInvalid(key, "max_length") };
  return { ok: true, value: value.trim() };
}

export function toDbClaim(
  raw: unknown,
): { ok: true; claim: Record<string, unknown> } | { ok: false; error: InvalidBasis } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: { error: "invalid_basis", field: "claim", reason: "object" } };
  }
  const wire = raw as WireClaim;

  // ---- the claimant handle ------------------------------------------------------------------
  if (!wire.claimant || typeof wire.claimant !== "object" || Array.isArray(wire.claimant)) {
    return { ok: false, error: claimInvalid("claimant", "object") };
  }
  const who = wire.claimant as WireClaimant;
  const claimant: Record<string, unknown> = {};
  if (who.enrolmentId !== undefined && who.enrolmentId !== null) {
    if (typeof who.enrolmentId !== "string" || !UUID_RE.test(who.enrolmentId)) {
      return { ok: false, error: claimInvalid("claimant.enrolment_id", "uuid") };
    }
    claimant.enrolment_id = who.enrolmentId;
  }
  for (const [wireKey, dbKey, max] of [
    ["accountCode", "account_code", 64],
    ["personLabel", "person_label", 200],
    ["attestation", "attestation", 2000],
    ["identifier", "identifier", 120],
  ] as ReadonlyArray<[keyof WireClaimant, string, number]>) {
    const got = claimText(who[wireKey], `claimant.${dbKey}`, max, false);
    if (!got.ok) return { ok: false, error: got.error };
    if (got.value !== undefined) claimant[dbKey] = got.value;
  }
  if (who.confirmDedicated !== undefined && who.confirmDedicated !== null) {
    if (typeof who.confirmDedicated !== "boolean") {
      return { ok: false, error: claimInvalid("claimant.confirm_dedicated", "boolean") };
    }
    claimant.confirm_dedicated = who.confirmDedicated;
  }
  if (claimant.enrolment_id === undefined && claimant.account_code === undefined) {
    // The database's own token, at the door: a claim that does not say who claimed.
    return { ok: false, error: { error: "invalid_basis", field: "claim.claimant", reason: "claimant_missing" } };
  }

  // ---- the two dates, which are DIFFERENT facts ----------------------------------------------
  for (const [wireKey, dbKey] of [["incurredDate", "incurred_date"], ["postingDate", "posting_date"]] as const) {
    const value = wire[wireKey];
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, error: claimInvalid(dbKey, dbKey === "incurred_date" ? "incurred_date_missing" : "present") };
    }
    if (!DATE_RE.test(value)) return { ok: false, error: claimInvalid(dbKey, "iso_date") };
  }
  const incurredDate = wire.incurredDate as string;
  const postingDate = wire.postingDate as string;
  if (incurredDate > postingDate) {
    return { ok: false, error: { error: "invalid_basis", field: "claim.incurred_date", reason: "incurred_after_posting" } };
  }

  if (wire.sourceKind !== "document" && wire.sourceKind !== "instruction") {
    return { ok: false, error: claimInvalid("source_kind", "source_kind") };
  }
  const instruction = claimText(wire.instruction, "instruction", MEMO_MAX_CHARS, true);
  if (!instruction.ok) return { ok: false, error: instruction.error };

  if (typeof wire.settlement !== "string" || !CLAIM_SETTLEMENTS.includes(wire.settlement)) {
    return { ok: false, error: claimInvalid("settlement", "settlement") };
  }

  // ---- the itemisation -----------------------------------------------------------------------
  if (!Array.isArray(wire.items)) return { ok: false, error: claimInvalid("items", "array") };
  if (wire.items.length < 1) return { ok: false, error: claimInvalid("items", "at_least_one") };
  const items: Array<Record<string, unknown>> = [];
  let total = 0;
  let live = 0;
  for (let i = 0; i < wire.items.length; i += 1) {
    const path = `items[${i + 1}]`;
    const item = wire.items[i] as WireClaimItem;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: claimInvalid(path, "object") };
    }
    const description = claimText(item.description, `${path}.description`, CLAIM_ITEM_DESCRIPTION_MAX_CHARS, true);
    if (!description.ok) return { ok: false, error: description.error };
    const one: Record<string, unknown> = { description: description.value };
    const pending = claimText(item.pendingFact, `${path}.pending_fact`, 120, false);
    if (!pending.ok) return { ok: false, error: pending.error };
    if (item.incurredDate !== undefined && item.incurredDate !== null) {
      if (typeof item.incurredDate !== "string" || !DATE_RE.test(item.incurredDate)) {
        return { ok: false, error: claimInvalid(`${path}.incurred_date`, "iso_date") };
      }
      one.incurred_date = item.incurredDate;
    }
    if (item.suppliedTax !== undefined && item.suppliedTax !== null) {
      if (typeof item.suppliedTax !== "object" || Array.isArray(item.suppliedTax)) {
        return { ok: false, error: claimInvalid(`${path}.supplied_tax`, "object") };
      }
      // CARRIED VERBATIM. No vocabulary exists to validate it against, and inventing one would be
      // building the lane PRD:124 defers.
      one.supplied_tax = item.suppliedTax;
    }
    if (pending.value !== undefined) {
      one.pending_fact = pending.value;
      if (item.amountCents !== undefined && item.amountCents !== null) {
        return { ok: false, error: claimInvalid(`${path}.amount_cents`, "absent") };
      }
      items.push(one);
      continue;
    }
    const code = claimText(item.expenseAccountCode, `${path}.expense_account_code`, 64, true);
    if (!code.ok) return { ok: false, error: code.error };
    one.expense_account_code = code.value;
    if (!isInteger(item.amountCents)) return { ok: false, error: claimInvalid(`${path}.amount_cents`, "integer_cents") };
    if (item.amountCents <= 0) {
      return { ok: false, error: claimInvalid(`${path}.amount_cents`, "positive_integer_cents") };
    }
    one.amount_cents = item.amountCents;
    total += item.amountCents;
    live += 1;
    items.push(one);
  }
  if (live === 0) {
    return { ok: false, error: { error: "invalid_basis", field: "claim.items", reason: "claim_all_zero" } };
  }

  const out: Record<string, unknown> = {
    claimant,
    source_kind: wire.sourceKind,
    instruction: instruction.value,
    incurred_date: incurredDate,
    posting_date: postingDate,
    items,
    amount_cents: total,
    currency: "MYR",
    settlement: wire.settlement,
  };

  // ---- the settlement's ONE credit leg --------------------------------------------------------
  const legs: ReadonlyArray<[string, keyof WireClaim, string]> = [
    ["reimbursement", "payableAccountCode", "payable_account_code"],
    ["advance_application", "advanceAccountCode", "advance_account_code"],
    ["already_settled", "paymentAccountCode", "payment_account_code"],
  ];
  const leg = legs.find(([settlement]) => settlement === wire.settlement)!;
  const account = claimText(wire[leg[1]], leg[2], 64, true);
  if (!account.ok) return { ok: false, error: account.error };
  out[leg[2]] = account.value;
  if (wire.settlement === "advance_application") {
    if (typeof wire.advanceId !== "string" || !UUID_RE.test(wire.advanceId)) {
      // No silent FIFO in this register (WD-R10): a claim says WHICH advance it discharges.
      return { ok: false, error: { error: "invalid_basis", field: "claim.advance_id", reason: "advance_allocation_mismatch" } };
    }
    out.advance_id = wire.advanceId;
  }
  if (wire.correctsClaimId !== undefined && wire.correctsClaimId !== null) {
    if (typeof wire.correctsClaimId !== "string" || !UUID_RE.test(wire.correctsClaimId)) {
      return { ok: false, error: claimInvalid("corrects_claim_id", "uuid") };
    }
    out.corrects_claim_id = wire.correctsClaimId;
  }
  return { ok: true, claim: out };
}

/** The WIRE shape of #655's typed trade-invoice particulars. camelCase in, the database's own
 *  snake_case out — the `toDbClaim` translation discipline, applied to a second typed payload. */
type WireTradeInvoice = {
  counterparty?: { id?: unknown; name?: unknown; registrationNo?: unknown; tin?: unknown };
  documentDate?: unknown;
  dueDate?: unknown;
  dueDateSource?: unknown;
  reference?: unknown;
  currency?: unknown;
  totalCents?: unknown;
  taxFacts?: unknown;
};

const tiInvalid = (field: string, reason: string): InvalidBasis =>
  ({ error: "invalid_basis", field: `invoice.${field}`, reason });

/**
 * Shape-validate the WIRE trade-invoice particulars and translate them into the database's own
 * field spelling. `clara._assert_trade_invoice_basis` re-validates every one of these and is the
 * authority — it alone holds the client's chart, the identity surface and the fiscal calendar.
 * This is the earlier, more legible half whose job is to NAME THE FIELD.
 *
 * IT REFUSES IN THE DOOR'S OWN VOCABULARY, never in a private one: the same `reason` tokens the
 * migration raises and `lib/trade-invoice-basis.ts` maps to messages, so a browser cannot tell the
 * two halves of one validation apart.
 *
 * NO FLOATING POINT ANYWHERE. `totalCents` arrives an integer and stays one; a non-integer is
 * refused by name rather than rounded, because a rounded cent is a wrong ledger.
 *
 * `taxFacts` IS CARRIED, NEVER VALIDATED (the #638 rule): an object or null, and nothing inspects
 * what is inside it.
 */
export function toDbTradeInvoice(
  raw: unknown,
): { ok: true; invoice: Record<string, unknown> } | { ok: false; error: InvalidBasis } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: { error: "invalid_basis", field: "invoice", reason: "invalid_kind" } };
  }
  const wire = raw as WireTradeInvoice;

  // ---- the party. Resolved at ADMISSION (D12a), never created here ---------------------------
  const cp = wire.counterparty;
  if (!cp || typeof cp !== "object" || Array.isArray(cp)) {
    return { ok: false, error: tiInvalid("counterparty", "party_unresolved") };
  }
  const party: Record<string, unknown> = {};
  if (cp.id !== undefined && cp.id !== null) {
    if (typeof cp.id !== "string" || !UUID_RE.test(cp.id)) {
      return { ok: false, error: tiInvalid("counterparty.id", "party_unresolved") };
    }
    party.id = cp.id;
  }
  for (const [wireKey, dbKey] of [["name", "name"], ["registrationNo", "registration_no"], ["tin", "tin"]] as const) {
    const v = (cp as Record<string, unknown>)[wireKey];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") return { ok: false, error: tiInvalid(`counterparty.${dbKey}`, "party_unresolved") };
    if (v.trim() === "") continue;
    if (v.trim().length > 200) return { ok: false, error: tiInvalid(`counterparty.${dbKey}`, "party_unresolved") };
    party[dbKey] = v.trim();
  }
  if (Object.keys(party).length === 0) {
    return { ok: false, error: tiInvalid("counterparty", "party_unresolved") };
  }

  // ---- the two dates and the due-date basis (D12c) --------------------------------------------
  if (typeof wire.documentDate !== "string" || !DATE_RE.test(wire.documentDate)) {
    return { ok: false, error: tiInvalid("document_date", "invalid_due_date") };
  }
  let dueDate: string | null = null;
  if (wire.dueDate !== undefined && wire.dueDate !== null && wire.dueDate !== "") {
    if (typeof wire.dueDate !== "string" || !DATE_RE.test(wire.dueDate)) {
      return { ok: false, error: tiInvalid("due_date", "invalid_due_date") };
    }
    if (wire.dueDate < wire.documentDate) {
      return { ok: false, error: tiInvalid("due_date", "invalid_due_date") };
    }
    dueDate = wire.dueDate;
  }
  // `counterparty_terms` is the DATABASE's answer and never the caller's: only it holds
  // `clara.counterparties.payment_terms_days`. A caller claiming it has invented a fact, so the
  // wire admits only the two a caller can actually know, and the door derives the third.
  let dueSource: string | undefined;
  if (wire.dueDateSource !== undefined && wire.dueDateSource !== null && wire.dueDateSource !== "") {
    if (wire.dueDateSource !== "stated" && wire.dueDateSource !== "absent") {
      return { ok: false, error: tiInvalid("due_date_source", "invalid_due_date") };
    }
    if ((wire.dueDateSource === "stated") !== (dueDate !== null)) {
      return { ok: false, error: tiInvalid("due_date_source", "invalid_due_date") };
    }
    dueSource = wire.dueDateSource;
  }

  // ---- the document's own number, the currency and the exact total ----------------------------
  let reference: string | null = null;
  if (wire.reference !== undefined && wire.reference !== null && wire.reference !== "") {
    if (typeof wire.reference !== "string") return { ok: false, error: tiInvalid("reference", "invalid_kind") };
    if (wire.reference.trim().length > 64) return { ok: false, error: tiInvalid("reference", "invalid_kind") };
    if (wire.reference.trim() !== "") reference = wire.reference.trim();
  }
  if (wire.currency !== undefined && wire.currency !== null && wire.currency !== "MYR") {
    return { ok: false, error: tiInvalid("currency", "invalid_kind") };
  }
  if (!isInteger(wire.totalCents)) return { ok: false, error: tiInvalid("total_cents", "invalid_total") };
  if ((wire.totalCents as number) <= 0) return { ok: false, error: tiInvalid("total_cents", "invalid_total") };

  let taxFacts: unknown = null;
  if (wire.taxFacts !== undefined && wire.taxFacts !== null) {
    if (typeof wire.taxFacts !== "object" || Array.isArray(wire.taxFacts)) {
      return { ok: false, error: tiInvalid("tax_facts", "invalid_kind") };
    }
    taxFacts = wire.taxFacts;
  }

  const out: Record<string, unknown> = {
    counterparty: party,
    document_date: wire.documentDate,
    due_date: dueDate,
    reference,
    currency: "MYR",
    total_cents: wire.totalCents,
    tax_facts: taxFacts,
  };
  if (dueSource !== undefined) out.due_date_source = dueSource;
  return { ok: true, invoice: out };
}

/** The WIRE spelling of a field path the DATABASE raised. Every path is the database's already —
 *  EXCEPT its evidence array, which it spells `source_refs` and the browser posts as `sourceRefs`,
 *  and #643's typed particulars, which it spells `adjustment.<snake_case>` and the browser posts
 *  as `adjustment.<camelCase>`. This is the ONE place those translations happen, for the same
 *  reason `linePath` is the one place the 1-based arithmetic happens.
 *
 *  THE PARTICULARS' HALF IS A FUNCTION, NOT A TABLE. Every key under `adjustment.` is a plain
 *  snake_case identifier, so `_x` → `X` is total and cannot fall out of step with a schema that
 *  gains a field; a hand-written map would be a second place to remember. */
function toWireField(field: string | null): string | null {
  if (field === null) return null;
  if (field.startsWith("source_refs")) return `sourceRefs${field.slice("source_refs".length)}`;
  if (field.startsWith("adjustment.")) {
    return `adjustment.${field.slice("adjustment.".length).replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())}`;
  }
  // #638 · the claim's own prefix, on the SAME footing and through the SAME total re-speller. It
  // covers the nested `claim.claimant.<key>` and the 1-based `claim.items[N].<key>` without a
  // table, because every key under it is a plain snake_case identifier and `items[3]` contains no
  // `_` followed by a lower-case letter.
  if (field.startsWith("claim.")) {
    return `claim.${field.slice("claim.".length).replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())}`;
  }
  return field;
}

/**
 * The admission route's COMPLETE refusal map, in the `turnErrorStatus` idiom. Keyed on the
 * `(code, detail.reason)` pair the database raises, because two CLR10s mean two different things
 * here — a malformed basis is the caller's mistake (400) and an intent-key payload conflict is a
 * genuine conflict with a Work that already exists (409).
 */
export function workErrorStatus(code: string | undefined, reason: string | null): number | null {
  if (code === "CLR10") {
    if (reason === "intent_payload_conflict") return 409;
    return 400;
  }
  if (code === "CLR11") return 404; // unknown / foreign client, or a Work that is not this firm's
  if (code === "CLR03" || code === "CLR04") return 403;
  // #643 · THE CLOSED-PERIOD WALL, reachable at ADMISSION for the first time on this surface.
  // `clara._assert_adjustment_relationships` raises CLR19 `write_into_closed_period` with a
  // `field` of `adjustment.period_end` before a Work row exists, so the honest answer is the
  // SAME 400 shape every other field-scoped refusal wears: the preparer changes the period, or
  // the firm reopens the year. Left unmapped it fell through to `{error:"internal"}` — a 500 for
  // an ordinary, actionable, entirely expected refusal. (The journal door reaches CLR19 only at
  // COMMIT, inside the run, where `claraWork.v1.errors.ts` classifies it; this door reaches it at
  // the HTTP boundary.)
  if (code === "CLR19") return 400;
  // CLR13 is the estate's "the state is not the one this act needs". `clara.retry_accounting_work`
  // raises it with reason `not_retryable` (the Work is not terminal, or its run is still live) and
  // with `operation_in_flight` (an uncommitted sibling holds the retry key). #630 adds
  // `not_takeable` (the Work is not orphaned, or its run is still live) on the same footing. All
  // are 409s.
  if (code === "CLR13") return 409;
  // An immutability refusal, and PostgreSQL's own unique_violation. Both mean "that state is
  // already spoken for", which is the chat route's reading of the same two codes.
  if (code === "CLR08") return 409;
  if (code === "23505") return 409;
  // #630 · POSTGRESQL'S OWN TRANSIENTS. `40P01` (deadlock_detected) and `40001`
  // (serialization_failure) say NOTHING ABOUT THE REQUEST: the statement did not run, no effect
  // exists, and sending it again is the whole remedy. Falling through to `null` answered
  // `500 {error:"internal"}` — an internal-failure page for something the human could simply press
  // again. 0184 removed the lock-order cycle that made 40P01 reachable in this lane; this is the
  // belt behind that fix, not a substitute for it.
  if (code === "40P01" || code === "40001") return 409;
  return null;
}

/** Every code `workErrorStatus` claims to map — read by the census cell in BOTH directions: a
 *  code here that these doors cannot raise is as much a lie as a raised code that is missing.
 *  The set is the LIVE catalog's, measured off `clara.admit_journal_work`,
 *  `clara.retry_accounting_work`, their call graph and the triggers on the two relations they
 *  write; CLR03 and CLR14 are deliberately ABSENT because neither door can raise them (the
 *  wake lane's CLR03s are classified by claraWork.v1.errors.ts, not by an HTTP status). */
export const WORK_MAPPED_CODES = Object.freeze([
  "CLR04", "CLR08", "CLR10", "CLR11", "CLR13", "23505",
  // #643 · the periodic-adjustment door's typed closed-period pre-check, raised at ADMISSION.
  "CLR19",
  // #630 · raised by the SERVER, never by a body — exempted from the prosrc census by name for
  // exactly the reason 23505 is.
  "40P01", "40001",
]);

/** Read the typed `detail.reason` off a raised error. PostgreSQL's own details are plain text, so
 *  a non-JSON detail yields null rather than a guess. */
export function reasonOf(err: unknown): string | null {
  const detail = (err as { detail?: unknown })?.detail;
  if (typeof detail !== "string" || detail.length === 0) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const reason = (parsed as { reason?: unknown }).reason;
      return typeof reason === "string" ? reason : null;
    }
  } catch {
    /* a plain-text detail carries no typed reason */
  }
  return null;
}

/** Read one string-valued key off a raised error's typed `detail` jsonb. PostgreSQL's own
 *  details are plain text, so a non-JSON detail yields null rather than a guess. */
export function detailField(err: unknown, key: string): string | null {
  const detail = (err as { detail?: unknown })?.detail;
  if (typeof detail !== "string" || detail.length === 0) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[key];
      return typeof value === "string" ? value : null;
    }
  } catch {
    /* a plain-text detail carries no typed field */
  }
  return null;
}

/** Read the typed `detail.field` off a raised error, for the 400 payload. */
function fieldOf(err: unknown): string | null {
  return detailField(err, "field");
}

function sendAuthError(res: express.Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
    return true;
  }
  return false;
}

function shuttingDown(): boolean {
  const sup = (globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor;
  return sup?.shuttingDown === true;
}

/** Post-commit enqueue — BEST-EFFORT by design. The reconciler's `accounting_work` arm
 *  re-enqueues a queued+unbound task, and the workflow's claim step CAS-binds itself, so a
 *  duplicate start self-aborts and a failed start is deferred, never lost. */
async function enqueueWork(taskId: string): Promise<void> {
  try {
    await start(workflows.claraWork, [{ taskId }]);
  } catch (err) {
    console.error("[clara-runtime] work enqueue failed (reconciler will re-enqueue):", (err as Error)?.message ?? err);
  }
}

/**
 * The COMPLETE translation of one raised database error into an HTTP answer, or `null` when this
 * map does not claim the error (the caller logs it and answers 500). Exported so a cell drives
 * THIS function rather than a copy of its predicate — the same reason `toDbBasis` and
 * `workErrorStatus` are exported, and the only way to test the 409 body without an HTTP server.
 */
export function workErrorResponse(err: unknown): { status: number; body: Record<string, unknown> } | null {
  const code = (err as { code?: string })?.code;
  const reason = reasonOf(err);
  const status = workErrorStatus(code, reason);
  // #630 · A TRANSIENT IS NOT A CONFLICT WITH THE WORLD, and it must not be dressed as one. It
  // carries no `detail.reason` (PostgreSQL raised it, not a door), so it is answered here BEFORE
  // every reason-keyed arm below, under its own word: the surface says "that did not go through —
  // try again" rather than showing a state the Work is not in.
  if (code === "40P01" || code === "40001") {
    return { status: 409, body: { error: "transient", reason: "serialization" } };
  }
  // #630 · THE TAKEOVER'S BASIS GATE IS NOT A MALFORMED BASIS, so it does not wear the 400 body
  // below. `clara.take_over_accounting_work` refuses a `clara_interpreted` Work whose digest the
  // colleague has not confirmed, and the DIGEST IS THE WHOLE POINT OF THE REFUSAL: the surface
  // shows the interpreted basis, the human reads it, and the resubmit carries the digest back. A
  // body saying `{error:"invalid_basis", field:"basis"}` would tell them their input was wrong,
  // which it was not, and would carry nothing they could act on.
  if (reason === "basis_confirmation_required") {
    return {
      status: 400,
      body: {
        error: "basis_confirmation_required",
        basis_digest: detailField(err, "basis_digest"),
        basis_origin: detailField(err, "basis_origin"),
      },
    };
  }
  if (status === 400) {
    // `constraint` IS the reason on the wire for a field-scoped CLR10, so the route's own 400s and
    // the database's speak ONE vocabulary (see the WIRE FIELD PATHS note in this file's header).
    // Every other CLR10 has no constraint and rides back under its own typed reason.
    //
    // #634 · `invalid_source_ref` FOLDS TOO, and the reason is measured rather than symmetric for
    // its own sake. `toDbSourceRefs` above answers `object` / `kind` / `at_most_one_document` /
    // `uuid` — bare constraint tokens — while the database answers the SAME four plus `not_filed`,
    // the one only it can reach (is this an active, byte-verified filing of THIS client?), under
    // `reason: "invalid_source_ref"` with the token buried in `detail.constraint`. Unfolded, the
    // browser saw two different vocabularies for one refusal depending on WHICH half caught it,
    // and `not_filed` — the only case a preparer can actually act on — never reached the wire at
    // all. `lib/wire.ts` surfaces `detail.reason` and discards every other detail key, so folding
    // here is the only place it can happen.
    const constraint = detailField(err, "constraint");
    // #638 · `invalid_claim` folds on the same footing and for the same measured reason: the
    // route's own earlier validation answers bare constraint tokens (`object` / `nonempty` /
    // `integer_cents` / `iso_date` / …) while migration 0221 answers the SAME tokens buried in
    // `detail.constraint` under `reason: "invalid_claim"`. Unfolded, the browser saw two
    // vocabularies for one refusal depending on WHICH half caught it.
    const folds = reason === "invalid_basis" || reason === "invalid_source_ref" || reason === "invalid_claim";
    return {
      status: 400,
      body: {
        error: "invalid_basis",
        field: toWireField(fieldOf(err)) ?? "basis",
        reason: folds && constraint !== null ? constraint : (reason ?? "invalid_basis"),
      },
    };
  }
  if (status === 409) {
    if (reason === "source_already_posted") {
      // #634 · THE ENTRY ID IS THE WHOLE POINT OF THIS 409. The document the human chose already
      // backs a posted entry, and an attachment conflict OPENS IMPACT/CORRECTION rather than
      // becoming a second effect — so the answer carries the entry that already stands there and
      // the document that was refused, and the composer offers a link to it instead of a
      // resubmit of the same intent. Neither id is invented: a detail without one answers null.
      return {
        status: 409,
        body: {
          error: "source_already_posted",
          entry_id: detailField(err, "entry_id"),
          document_id: detailField(err, "document_id"),
        },
      };
    }
    if (reason === "not_retryable") {
      // The contract's 409 body: the machine-readable error AND the Work status that made the
      // retry illegal, which is what the detail's own `status` field carries.
      return { status: 409, body: { error: "not_retryable", status: detailField(err, "status") } };
    }
    if (reason === "not_takeable") {
      // #630 · the takeover's own 409, in the same shape and for the same reason: the surface
      // renders "this Work is not available to take over" beside the status that made it so.
      return { status: 409, body: { error: "not_takeable", status: detailField(err, "status") } };
    }
    // #721
    if (reason === "not_restatable" || reason === "already_superseded") {
      // #721 · the restate door's own 409s, in the same shape `not_retryable` and `not_takeable`
      // use: the machine-readable token AND the operable fact beside it — the status that made the
      // restatement illegal, or the successor that already exists. `reason` rides beside `error`
      // because the browser's one reader keys on it for every other refusal on this lane.
      return {
        status: 409,
        body: {
          error: reason,
          reason,
          status: detailField(err, "status"),
          superseded_by: detailField(err, "superseded_by"),
        },
      };
    }
    // #721
    if (reason === "work_cancelled" || reason === "work_settled") {
      // #630 · the BOUNDARY's own refusals, reachable here only through a door that calls the
      // posting core. The status is the operable fact: the surface converges on the Work's own row.
      return { status: 409, body: { error: reason, status: detailField(err, "status") } };
    }
    if (reason === "intent_payload_conflict") {
      // THE WORK ID IS THE WHOLE POINT OF THIS 409. `clara.admit_journal_work` puts the EXISTING
      // Work's id in the detail, and the composer's conflict Alert reads it to offer "this draft
      // was already submitted with different figures" WITH A LINK to that Work. Dropping it left
      // the human told they had a conflict and given no way to look at it — a dead end where the
      // database had supplied the exit.
      return { status: 409, body: { error: "intent_payload_conflict", work_id: detailField(err, "work_id") } };
    }
    return { status: 409, body: { error: "conflict" } };
  }
  if (status === 404) return { status: 404, body: { error: "not_found", message: "not found" } };
  if (status === 403) return { status: 403, body: { error: "forbidden", message: "not permitted" } };
  return null;
}

function sendAdmissionError(res: express.Response, err: unknown, label: string): void {
  const answer = workErrorResponse(err);
  if (answer !== null) {
    res.status(answer.status).json(answer.body);
    return;
  }
  console.error(`[clara-runtime] ${label} error:`, (err as Error)?.message ?? err);
  res.status(500).json({ error: "internal" });
}

export function workRoutes(): express.Router {
  const router = express.Router();

  // ---- C3 / B6 admission -------------------------------------------------
  router.post("/api/work/journal", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const body = (req.body ?? {}) as {
      clientId?: unknown; intentKey?: unknown; basis?: unknown; sourceRefs?: unknown;
    };
    if (typeof body.clientId !== "string" || !UUID_RE.test(body.clientId)) {
      // A malformed client id is a NOT-FOUND, never a database error (#614's lesson).
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      // C82.1: an empty or whitespace key is refused BEFORE any reservation. The database
      // refuses it too, and this answers with the DATABASE'S OWN BODY for that refusal —
      // `invalid_intent_key`, field `basis` (0178 raises it with no field, and the intent key is
      // not a control a human typed) — so the two halves of one validation cannot be told apart
      // by a client. See the WIRE FIELD PATHS note in this file's header.
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_intent_key" });
      return;
    }
    const translated = toDbBasis(body.basis);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }
    // #634 · OPTIONAL EVIDENCE. Validated at the same door and in the same vocabulary as the
    // basis; the database re-validates every element and is the authority (it alone can say
    // whether the document is an active verified filing of THIS client).
    const refs = toDbSourceRefs(body.sourceRefs);
    if (!refs.ok) {
      res.status(400).json(refs.error);
      return;
    }

    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.admit_journal_work($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text, $6::jsonb, $7::text) as receipt",
          [
            body.clientId, p.sub, body.intentKey, JSON.stringify(translated.basis), "user_direct",
            JSON.stringify(refs.sourceRefs), DEFAULT_MODEL,
          ],
        );
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
        } | null;
      });
      if (!admitted) {
        res.status(500).json({ error: "internal" });
        return;
      }
      // A replay returns the EXISTING Work and mints no task, so there is nothing to start; the
      // original run either already holds the task or the reconciler owns it.
      if (admitted.replayed !== true) await enqueueWork(admitted.task_id);
      res.status(202).json({
        work_id: admitted.work_id,
        task_id: admitted.task_id,
        logical_op_id: admitted.logical_op_id,
        status: admitted.status,
        replayed: admitted.replayed === true,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work admission");
    }
  });

  // ---- C8/C11 admission: a PERIODIC ADJUSTMENT -------------------------------
  //
  // A SIBLING OF `/api/work/journal`, not a widened version of it, and the reason is the same one
  // migration 0194 gives for keeping two database doors: the two take different payloads, are
  // reached by different surfaces, and one of them is named by a FROZEN chat tool whose signature
  // may not move. A single route with an optional `adjustment` would have made "no purpose" a
  // reachable state on the frozen lane.
  //
  // 202 FOR THE SAME REASON: the response acknowledges an ADMITTED intent, never a posted entry.
  // The entry, its `closing_stock` / `payroll_obligation` marker and its
  // `clara.periodic_adjustments` row are written seconds later by a claraWork run under a wake
  // credential minted OBO this same human — through the SAME frozen bundle a documentless journal
  // entry uses, because the typed particulars ride a column the run never reads.
  router.post("/api/work/periodic-adjustment", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const body = (req.body ?? {}) as {
      clientId?: unknown; intentKey?: unknown; purpose?: unknown; basis?: unknown;
      adjustment?: unknown; sourceRefs?: unknown;
    };
    if (typeof body.clientId !== "string" || !UUID_RE.test(body.clientId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_intent_key" });
      return;
    }
    // THE PURPOSE IS A CLOSED SET AT THE DOOR. The database refuses an unknown one too
    // (`invalid_purpose`), and this answers with that same body so the two halves of one
    // validation cannot be told apart by a client.
    if (body.purpose !== "periodic_stock_adjustment" && body.purpose !== "payroll_obligation") {
      res.status(400).json({ error: "invalid_basis", field: "purpose", reason: "invalid_purpose" });
      return;
    }
    const translated = toDbBasis(body.basis);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }
    const particulars = toDbAdjustment(body.purpose, body.adjustment);
    if (!particulars.ok) {
      res.status(400).json(particulars.error);
      return;
    }
    const refs = toDbSourceRefs(body.sourceRefs);
    if (!refs.ok) {
      res.status(400).json(refs.error);
      return;
    }

    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.admit_periodic_adjustment_work($1::uuid, $2::uuid, $3::text, $4::text,"
          + " $5::jsonb, $6::jsonb, $7::text, $8::jsonb, $9::text) as receipt",
          [
            body.clientId, p.sub, body.intentKey, body.purpose,
            JSON.stringify(translated.basis), JSON.stringify(particulars.adjustment),
            "user_direct", JSON.stringify(refs.sourceRefs), DEFAULT_MODEL,
          ],
        );
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
        } | null;
      });
      if (!admitted) {
        res.status(500).json({ error: "internal" });
        return;
      }
      if (admitted.replayed !== true) await enqueueWork(admitted.task_id);
      res.status(202).json({
        work_id: admitted.work_id,
        task_id: admitted.task_id,
        logical_op_id: admitted.logical_op_id,
        status: admitted.status,
        replayed: admitted.replayed === true,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "periodic adjustment admission");
    }
  });

  // ---- C1/C3/C6 admission: a STAFF EXPENSE CLAIM -----------------------------
  //
  // A SIBLING of `/api/work/periodic-adjustment`, not a widened version of it, and for the reason
  // migration 0221 gives for keeping a third database door: the three take different payloads and
  // are reached by different surfaces.
  //
  // ONE ARGUMENT, NOT TWO. Unlike the periodic-adjustment door, this one takes NO `basis`: the
  // claim IS the basis, and `clara.admit_staff_expense_claim_work` derives the balanced journal
  // from the itemisation and the settlement itself (`clara._claim_journal_basis`). A route that
  // also posted lines would be a second, drifting statement of the same claim — exactly what the
  // `adjustment_lines_mismatch` rung exists to catch on the other lane, and cheaper to make
  // impossible than to police.
  //
  // 202 FOR THE SAME REASON: the response acknowledges an ADMITTED intent, never a posted entry.
  // The claim ROW, however, is already durable when this returns — it is written inside the
  // admission transaction — which is why the 202 body carries `claim_id`.
  router.post("/api/work/staff-expense-claim", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const body = (req.body ?? {}) as {
      clientId?: unknown; intentKey?: unknown; claim?: unknown; sourceRefs?: unknown;
    };
    if (typeof body.clientId !== "string" || !UUID_RE.test(body.clientId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_intent_key" });
      return;
    }
    const translated = toDbClaim(body.claim);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }
    // C1 · THE ATTACHMENT IS GENUINELY OPTIONAL. An omitted, null or empty `sourceRefs` is a
    // documentless claim — a photographed receipt and a sentence in an email are both lawful
    // sources, and #638's own acceptance line says so.
    const refs = toDbSourceRefs(body.sourceRefs);
    if (!refs.ok) {
      res.status(400).json(refs.error);
      return;
    }

    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.admit_staff_expense_claim_work($1::uuid, $2::uuid, $3::text, $4::jsonb,"
          + " $5::text, $6::jsonb, $7::text) as receipt",
          [
            body.clientId, p.sub, body.intentKey, JSON.stringify(translated.claim),
            "user_direct", JSON.stringify(refs.sourceRefs), DEFAULT_MODEL,
          ],
        );
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
          claim_id: string;
        } | null;
      });
      if (!admitted) {
        res.status(500).json({ error: "internal" });
        return;
      }
      if (admitted.replayed !== true) await enqueueWork(admitted.task_id);
      res.status(202).json({
        work_id: admitted.work_id,
        task_id: admitted.task_id,
        logical_op_id: admitted.logical_op_id,
        status: admitted.status,
        replayed: admitted.replayed === true,
        claim_id: admitted.claim_id,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "staff expense claim admission");
    }
  });

  // ---- C3 · #655 · the trade-invoice admission, the FOURTH sibling ---------
  //
  // A SIBLING of `/api/work/journal`, `/api/work/periodic-adjustment` and
  // `/api/work/staff-expense-claim`, never a widened version of any of them, for the reason
  // migration 0221 gives for keeping a third database door: they take different payloads and are
  // reached by different surfaces.
  //
  // TWO ARGUMENTS, NOT ONE. Unlike the claim door, this one takes BOTH `invoice` and `basis`: a
  // trade invoice's journal is NOT derivable from its particulars — which expense account a bill
  // debits is a coding judgement, not an arithmetic one — so the door takes the basis the preparer
  // (or Clara) actually chose, and re-checks that exactly one control leg of the right domain
  // carries the stated total to the sen.
  //
  // BOTH THE HUMAN FORM AND, LATER, THE v21 CHAT TOOL POST THROUGH HERE, which is what makes ONE
  // `clara_runtime` door the whole lane's admission. There is no `clara_authenticated` twin.
  //
  // 202 FOR THE SAME REASON THE SIBLINGS DO: the response acknowledges an ADMITTED intent, never a
  // posted entry. The trade-invoice ROW, however, is already durable when this returns — it is
  // written inside the admission transaction — which is why the 202 body carries `invoice_id`, the
  // resolved `counterparty_id` and the DERIVED `due_date` / `due_date_source`.
  router.post("/api/work/trade-invoice", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const body = (req.body ?? {}) as {
      clientId?: unknown; intentKey?: unknown; kind?: unknown; invoice?: unknown;
      basis?: unknown; sourceRefs?: unknown;
    };
    if (typeof body.clientId !== "string" || !UUID_RE.test(body.clientId)) {
      // A malformed client id is a NOT-FOUND, never a database error (#614's lesson) — and it is
      // the same answer an unauthorised caller gets, so this door is not an existence oracle
      // either (migration 0225 section B states the same law for the door's own preamble).
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_intent_key" });
      return;
    }
    // THE KIND IS CHECKED HERE ONLY FOR ITS SHAPE. Whether a credit-note-shaped payload is
    // admitted is the DOOR's answer (`credit_shape_not_admitted`), and it is refused by name there
    // so the #666/#662 boundary is spoken once, in one place.
    if (typeof body.kind !== "string" || body.kind.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "kind", reason: "invalid_kind" });
      return;
    }
    const invoice = toDbTradeInvoice(body.invoice);
    if (!invoice.ok) {
      res.status(400).json(invoice.error);
      return;
    }
    const translated = toDbBasis(body.basis);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }
    // C1 · THE ATTACHMENT IS GENUINELY OPTIONAL. An omitted, null or empty `sourceRefs` is a
    // chat- or UI-stated invoice; a cited document is the other lawful source. Both are AC3's.
    const refs = toDbSourceRefs(body.sourceRefs);
    if (!refs.ok) {
      res.status(400).json(refs.error);
      return;
    }

    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.admit_trade_invoice_work($1::uuid, $2::uuid, $3::text, $4::text, $5::jsonb,"
          + " $6::jsonb, $7::text, $8::jsonb, $9::text) as receipt",
          [
            body.clientId, p.sub, body.intentKey, (body.kind as string).trim(),
            JSON.stringify(invoice.invoice), JSON.stringify(translated.basis),
            "user_direct", JSON.stringify(refs.sourceRefs), DEFAULT_MODEL,
          ],
        );
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
          invoice_id: string;
          kind: string;
          counterparty_id: string;
          due_date: string | null;
          due_date_source: string;
        } | null;
      });
      if (!admitted) {
        res.status(500).json({ error: "internal" });
        return;
      }
      if (admitted.replayed !== true) await enqueueWork(admitted.task_id);
      res.status(202).json({
        work_id: admitted.work_id,
        task_id: admitted.task_id,
        logical_op_id: admitted.logical_op_id,
        status: admitted.status,
        replayed: admitted.replayed === true,
        invoice_id: admitted.invoice_id,
        kind: admitted.kind,
        counterparty_id: admitted.counterparty_id,
        due_date: admitted.due_date,
        due_date_source: admitted.due_date_source,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      // D12(a) — `party_ambiguous` IS THE ONE REFUSAL THAT CARRIES DATA. The door raises it with
      // the candidate list VERBATIM in its typed detail, because the person has to pick and a
      // sentence they cannot act on is worse than no sentence. `sendAdmissionError` answers the
      // other thirteen faithfully but keeps only `detail.reason` (its own note at the
      // `invalid_source_ref` arm says why: the browser must not have to parse Postgres detail), so
      // this ONE arm is unfolded HERE, inside this lane's own route, rather than widening the
      // shared responder for every door in the file.
      if (reasonOf(err) === "party_ambiguous") {
        const raw = (err as { detail?: unknown })?.detail;
        let candidates: unknown[] = [];
        if (typeof raw === "string" && raw.length > 0) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const list = (parsed as Record<string, unknown>).candidates;
              if (Array.isArray(list)) candidates = list;
            }
          } catch {
            /* a plain-text detail carries no candidates — the banner is the door's sentence alone */
          }
        }
        res.status(400).json({
          error: "invalid_basis",
          field: fieldOf(err) ?? "invoice.counterparty",
          reason: "party_ambiguous",
          detail: { candidates },
        });
        return;
      }
      sendAdmissionError(res, err, "trade invoice admission");
    }
  });

  // ---- B3 retry: a NEW run for the SAME Work (same logical identity) ------
  router.post("/api/work/:workId/retry", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    const body = (req.body ?? {}) as { opKey?: unknown };
    if (typeof body.opKey !== "string" || body.opKey.trim() === "") {
      // The retry door's own C82.1 key gate, answering the database's body (`invalid_op_key`).
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_op_key" });
      return;
    }
    try {
      const retried = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query("select clara.retry_accounting_work($1::uuid, $2::uuid, $3::text) as receipt", [
          workId,
          p.sub,
          body.opKey,
        ]);
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
        } | null;
      });
      if (!retried) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (retried.replayed !== true) await enqueueWork(retried.task_id);
      res.status(202).json({
        work_id: retried.work_id,
        task_id: retried.task_id,
        logical_op_id: retried.logical_op_id,
        status: retried.status,
        replayed: retried.replayed === true,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work retry");
    }
  });

  // ---- B3 / B7 cancel: STOP THE REMAINING WORK ---------------------------
  //
  // It is NOT `clara.cancel_agent_task`, and the difference is the whole ticket. That door cancels
  // a RUN; this one cancels the WORK — the durable unit a human named ("Cancel Work") — and the
  // database decides between the two on ONE ordering boundary. The answer is the door's own jsonb
  // verbatim, because every arm of it is something the surface must render differently:
  // `{cancelled:true, status:'stopping'}` shows the stopping arm and keeps polling,
  // `{cancelled:false, reason:'already_completed', receipt_id, entry_id}` shows the receipt, and
  // `{cancelled:false, reason:'already_terminal'}` shows what the Work settled as.
  //
  // 200, not 202: unlike admission and retry there is nothing to enqueue. Either the terminal is
  // already written or the runtime's own control listener has been NOTIFYed inside the same
  // transaction and will abort the run without this route lifting a finger.
  router.post("/api/work/:workId/cancel", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    const body = (req.body ?? {}) as { opKey?: unknown };
    if (typeof body.opKey !== "string" || body.opKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_op_key" });
      return;
    }
    try {
      const cancelled = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query("select clara.cancel_accounting_work($1::uuid, $2::uuid, $3::text) as receipt", [
          workId,
          p.sub,
          body.opKey,
        ]);
        return (r.rows[0]?.receipt ?? null) as Record<string, unknown> | null;
      });
      if (!cancelled) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      res.status(200).json(cancelled);
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work cancel");
    }
  });

  // #721 ----------------------------------------------------------------------
  // ---- B3 restate: A REPLY THAT CHANGES THE BASIS BECOMES A NEW WORK -------
  //
  // NOT a second admission route, and not a cancel followed by an admission from the browser. The
  // owner's ruling of 2026-09-12 makes the two halves ONE act: the successor is admitted with
  // `supersedes` and the predecessor is cancelled with `superseded_by`, in one transaction, so no
  // state exists in which a firm has two live Works for one instruction — which is exactly what a
  // browser doing it in two calls would produce the moment the second one failed.
  //
  // 202 like admission, and for the identical reason: the answer acknowledges a NEW RUN, which is
  // enqueued below. The basis and evidence are validated HERE in the same vocabulary the journal
  // admission route uses (`toDbBasis` / `toDbSourceRefs`), so a preparer reads one set of field
  // paths whichever door they came through, and the database re-validates everything anyway.
  router.post("/api/work/:workId/restate", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    const body = (req.body ?? {}) as { intentKey?: unknown; basis?: unknown; sourceRefs?: unknown; opKey?: unknown };
    if (typeof body.opKey !== "string" || body.opKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_op_key" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_intent_key" });
      return;
    }
    const translated = toDbBasis(body.basis);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }
    const refs = toDbSourceRefs(body.sourceRefs);
    if (!refs.ok) {
      res.status(400).json(refs.error);
      return;
    }
    try {
      const restated = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.restate_accounting_work($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text, $6::jsonb, $7::text, $8::text) as receipt",
          [
            workId, p.sub, body.intentKey, JSON.stringify(translated.basis), "user_direct",
            JSON.stringify(refs.sourceRefs), DEFAULT_MODEL, body.opKey,
          ],
        );
        return (r.rows[0]?.receipt ?? null) as (Record<string, unknown> & {
          task_id?: string;
          replayed?: boolean;
        }) | null;
      });
      if (!restated) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (restated.replayed !== true && typeof restated.task_id === "string") await enqueueWork(restated.task_id);
      res.status(202).json(restated);
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work restate");
    }
  });
  // #721 ----------------------------------------------------------------------

  // ---- B3 take-over: a colleague picks up an orphaned Work ---------------
  //
  // 202 like retry, and for the identical reason: the answer acknowledges a NEW RUN of the SAME
  // logical identity, which is enqueued below exactly as a retry's is. `basisDigest` is optional on
  // the wire — a `user_direct` Work needs none, and a `clara_interpreted` one is refused 400
  // `basis_confirmation_required` carrying the digest the colleague must confirm.
  router.post("/api/work/:workId/take-over", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    const body = (req.body ?? {}) as { opKey?: unknown; basisDigest?: unknown };
    if (typeof body.opKey !== "string" || body.opKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_op_key" });
      return;
    }
    // A malformed digest is refused HERE rather than carried to the database, which would answer
    // `basis_confirmation_required` — true, but it would read as "you did not confirm" when the
    // honest diagnosis is "that is not a digest".
    if (body.basisDigest !== undefined && body.basisDigest !== null
        && (typeof body.basisDigest !== "string" || !/^[0-9a-f]{64}$/.test(body.basisDigest))) {
      res.status(400).json({ error: "invalid_basis", field: "basis", reason: "invalid_basis_digest" });
      return;
    }
    try {
      const taken = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.take_over_accounting_work($1::uuid, $2::uuid, $3::text, $4::text) as receipt",
          [workId, p.sub, body.opKey, body.basisDigest ?? null],
        );
        return (r.rows[0]?.receipt ?? null) as (Record<string, unknown> & {
          task_id?: string;
          replayed?: boolean;
        }) | null;
      });
      if (!taken) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (taken.replayed !== true && typeof taken.task_id === "string") await enqueueWork(taken.task_id);
      res.status(202).json(taken);
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work take-over");
    }
  });

  // ---- the lost-response check -------------------------------------------
  router.get("/api/work/:workId", async (req, res) => {
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    try {
      const found = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const w = await c.query(
          `select w.id, w.firm_id, w.client_id, w.purpose, w.status, w.initiator, w.initiator_role,
                  w.intent_key, w.logical_op_id, w.basis, w.basis_digest, w.basis_origin, w.source_refs,
                  w.adjustment_basis,
                  w.current_task_id, w.bundle, w.result, w.error, w.created_at, w.updated_at,
                  t.id as task_id, t.status as task_status, t.error_code as task_error_code,
                  (t.workflow_run_id is not null) as task_bound
             from clara.accounting_work w
             left join clara.agent_tasks t on t.id = w.current_task_id
            where w.id = $1 and w.firm_id = $2`,
          [workId, p.firmId],
        );
        return w.rows[0] ?? null;
      });
      if (!found) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      res.json({
        work: {
          id: found.id,
          firm_id: found.firm_id,
          client_id: found.client_id,
          purpose: found.purpose,
          status: found.status,
          initiator: found.initiator,
          initiator_role: found.initiator_role,
          intent_key: found.intent_key,
          logical_op_id: found.logical_op_id,
          basis: found.basis,
          basis_digest: found.basis_digest,
          basis_origin: found.basis_origin,
          source_refs: found.source_refs,
          // #643 · the TYPED PARTICULARS, when the Work has any. NULL for a journal entry, by the
          // column's own CHECK — the Work detail renders the block only when it is present.
          adjustment_basis: found.adjustment_basis,
          current_task_id: found.current_task_id,
          bundle: found.bundle,
          result: found.result,
          error: found.error,
          created_at: found.created_at,
          updated_at: found.updated_at,
        },
        task: {
          id: found.task_id,
          status: found.task_status,
          error_code: found.task_error_code,
          // The engine's run id is NOT served: whether the Work is bound to a run is the operable
          // fact, and a run id is an internal handle no browser needs.
          workflow_run_id: found.task_bound === true,
        },
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] work read error:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
