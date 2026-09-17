// #652 — THE ACCRUAL DRAFT, ITS OP-KEY LIFECYCLE, ITS FIELD MAPPER AND ITS LOCAL VALIDATION,
// driven as pure functions.
//
// WHAT EACH GROUP PINS:
//
//   scope.*   ONE INTENT KEY PER DECISION, and a draft NEVER crosses a scope. The key is the whole
//             of the lost-response story: `clara.create_accrual_adjustment` is idempotent on
//             `(firm, 'create_accrual_adjustment', op_key)`, so a resubmit after a lost
//             acknowledgement must carry the identity the database already knows — and a draft
//             filed under another user, firm or client is at another key and is simply never found.
//
//   parse.*   EVERY READ IS UNTRUSTED. What comes back is a string a previous build wrote, that a
//             human could have edited. Anything not fully recognised is `null`, because a
//             half-understood draft is worse than none: it would seed a form with figures nobody
//             typed. Cents in particular must be a SAFE INTEGER even coming out of storage.
//
//   field.*   ONE MAPPER, TWO PREFIXES. The typed particulars are `accrual.<key>` (0222's own
//             spelling) and the schedule refusals come back unprefixed from 0193's own validator.
//             A `field` path that does not name a control must answer null rather than a control
//             that does not exist — a focus call on a detached node is a silent no-op that looks
//             like the form ignoring the refusal.
//
//   valid.*   Every local refusal MIRRORS a rule the database enforces; nothing here is a rule of
//             its own. The two that matter most are the ones this ticket owns: a SILENT TERM and a
//             STATED ZERO, each named at the control the preparer typed in.
//
//   wire.*    `toAccrualParticulars` emits ONLY what 0222 reads, and `term_source` is always
//             `human_stated` — the form has no control for it, because a period a model read off a
//             document may not enter the durable record.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accrualDraftKey, accrualFieldElementId, clearAccrualDraft, emptyAccrualDraft,
  fieldForAccrualPath, firstInvalidAccrualField, readAccrualDraft, toAccrualParticulars,
  validateAccrualDraft, writeAccrualDraft,
  type AccrualDraft,
} from "./accrual-draft";
import type { DraftStorage } from "./journal-draft";

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CLIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCOPE = { userId: USER, firmId: FIRM, clientId: CLIENT };
const OTHER_SCOPE = { ...SCOPE, clientId: OTHER_CLIENT };

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function goodDraft(over: Partial<AccrualDraft> = {}): AccrualDraft {
  return {
    ...emptyAccrualDraft(),
    purpose: "Monthly office rent accrual",
    authorityWorkId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    expenseAccountCode: "6100",
    liabilityAccountCode: "2020",
    amountCents: 120000,
    servicePeriodStart: "2026-07-01",
    servicePeriodEnd: "2026-07-31",
    method: "stated_amount",
    instruction: "the client's standing instruction of 2026-06-30",
    // THE WINDOW SITS INSIDE THE STATED TERM (0222's SIXTH MEASUREMENT).
    effectiveFrom: "2026-07-01",
    effectiveTo: "2026-07-31",
    ...over,
  };
}

const KNOWN = new Set(["6100", "2020", "1150"]);

// ==============================================================================================
// 1 · The scope key and the op-key lifecycle.
// ==============================================================================================

test("652.scope: the key carries user, firm and client, and is this lane's own prefix", () => {
  const key = accrualDraftKey(SCOPE);
  assert.ok(key.startsWith("clara:accrual-draft"),
    `an accrual draft is not filed under the journal lane's prefix (got ${key})`);
  assert.ok(key.includes(USER) && key.includes(FIRM) && key.includes(CLIENT));
  assert.notEqual(accrualDraftKey(SCOPE), accrualDraftKey(OTHER_SCOPE));
});

test("652.scope: a scope change NEVER transfers a draft, and returning finds it again", () => {
  const store = memoryStorage();
  writeAccrualDraft(SCOPE, { opKey: "op-1", draft: goodDraft() }, store);
  assert.equal(readAccrualDraft(OTHER_SCOPE, store), null,
    "client B has no draft of client A's to find — the key rule, not a runtime comparison");
  assert.equal(readAccrualDraft(SCOPE, store)?.opKey, "op-1",
    "…and returning to A still finds it: a switch never DISCARDS work a human may come back to");
});

test("652.scope: one op key per decision — it survives every rewrite of the same figures", () => {
  const store = memoryStorage();
  const draft = goodDraft();
  writeAccrualDraft(SCOPE, { opKey: "op-1", draft }, store);
  writeAccrualDraft(SCOPE, { opKey: "op-1", draft: { ...draft, memo: "typed a memo" } }, store);
  assert.equal(readAccrualDraft(SCOPE, store)?.opKey, "op-1",
    "a retry of the SAME decision rides the SAME key, which is what clara._reserve_op replays");
  assert.equal(readAccrualDraft(SCOPE, store)?.draft.memo, "typed a memo");
});

test("652.scope: a storage that refuses to be read or written is the same answer as an empty one", () => {
  const throwing: DraftStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(readAccrualDraft(SCOPE, throwing), null);
  assert.equal(writeAccrualDraft(SCOPE, { opKey: "op-1", draft: goodDraft() }, throwing), false,
    "…and the caller is TOLD, so it can say 'this browser is not keeping your draft' rather than "
    + "promising a reload recovery it cannot deliver");
  assert.doesNotThrow(() => clearAccrualDraft(SCOPE, throwing));
  assert.equal(readAccrualDraft(SCOPE, null), null, "…and no storage at all is not an error either");
});

test("652.scope: clearing retires exactly this scope's draft", () => {
  const store = memoryStorage();
  writeAccrualDraft(SCOPE, { opKey: "op-1", draft: goodDraft() }, store);
  writeAccrualDraft(OTHER_SCOPE, { opKey: "op-2", draft: goodDraft() }, store);
  clearAccrualDraft(SCOPE, store);
  assert.equal(readAccrualDraft(SCOPE, store), null);
  assert.equal(readAccrualDraft(OTHER_SCOPE, store)?.opKey, "op-2");
});

// ==============================================================================================
// 2 · The parser — every read untrusted.
// ==============================================================================================

test("652.parse: a round trip restores every field", () => {
  const store = memoryStorage();
  const draft = goodDraft({ dayRule: "day_of_month", dayOfMonth: "15", frequency: "quarterly" });
  writeAccrualDraft(SCOPE, { opKey: "op-1", draft }, store);
  assert.deepEqual(readAccrualDraft(SCOPE, store), { opKey: "op-1", draft });
});

test("652.parse: anything not fully recognised is null, not a partially seeded form", () => {
  const store = memoryStorage();
  const key = accrualDraftKey(SCOPE);
  const put = (value: unknown) => store.map.set(key, JSON.stringify(value));
  const draft = goodDraft();

  put("not an object");
  assert.equal(readAccrualDraft(SCOPE, store), null);
  store.map.set(key, "{ not json");
  assert.equal(readAccrualDraft(SCOPE, store), null);
  put({ draft });
  assert.equal(readAccrualDraft(SCOPE, store), null, "no op key is no identity");
  put({ opKey: "   ", draft });
  assert.equal(readAccrualDraft(SCOPE, store), null, "a blank op key is no identity either");
  put({ opKey: "op-1" });
  assert.equal(readAccrualDraft(SCOPE, store), null);
  put({ opKey: "op-1", draft: { ...draft, method: "straight_line" } });
  assert.equal(readAccrualDraft(SCOPE, store), null, "a rule outside the closed set");
  put({ opKey: "op-1", draft: { ...draft, frequency: "fortnightly" } });
  assert.equal(readAccrualDraft(SCOPE, store), null);
  put({ opKey: "op-1", draft: { ...draft, dayRule: "any_day" } });
  assert.equal(readAccrualDraft(SCOPE, store), null);
  put({ opKey: "op-1", draft: { ...draft, purpose: 7 } });
  assert.equal(readAccrualDraft(SCOPE, store), null, "a text field that is not text");
});

test("652.parse: cents must be a SAFE INTEGER even coming out of storage", () => {
  const store = memoryStorage();
  const key = accrualDraftKey(SCOPE);
  for (const bad of [12.5, "1200", null, Number.MAX_SAFE_INTEGER + 2]) {
    store.map.set(key, JSON.stringify({ opKey: "op-1", draft: { ...goodDraft(), amountCents: bad } }));
    assert.equal(readAccrualDraft(SCOPE, store), null,
      `amountCents=${JSON.stringify(bad)} must not seed a money field — that is the floating-point `
      + "coercion this lane forbids outright");
  }
});

// ==============================================================================================
// 3 · The field mapper.
// ==============================================================================================

test("652.field: 0222's own paths, 0193's schedule paths, and everything else", () => {
  assert.equal(fieldForAccrualPath("accrual.service_period_start"), "servicePeriodStart");
  // `term_source` has NO control — the form cannot send anything but `human_stated`, so a refusal
  // naming it is a form-level one rather than a control to focus.
  assert.equal(fieldForAccrualPath("accrual.term_source"), null);
  assert.equal(fieldForAccrualPath("accrual.amount_cents"), "amountCents");
  assert.equal(fieldForAccrualPath("accrual.expense_account_code"), "expenseAccountCode");
  assert.equal(fieldForAccrualPath("accrual.liability_account_code"), "liabilityAccountCode");
  assert.equal(fieldForAccrualPath("accrual.service_period_end"), "servicePeriodEnd");
  assert.equal(fieldForAccrualPath("accrual.instruction"), "instruction");
  assert.equal(fieldForAccrualPath("accrual.source_document_id"), "sourceDocumentId");
  assert.equal(fieldForAccrualPath("accrual.document_service_period_id"), null,
    "the bound-term id has no control of its own; its refusal is a form-level one");
  // `method.rule` folds onto the `method` control, which is the only control there is for it.
  assert.equal(fieldForAccrualPath("accrual.method.rule"), "method");
  assert.equal(fieldForAccrualPath("accrual.method"), "method");
  // 0193's `_assert_plan_schedule` raises UNPREFIXED — its vocabulary is not this lane's to
  // re-spell, so the mapper reads both.
  assert.equal(fieldForAccrualPath("day_of_month"), "dayOfMonth");
  assert.equal(fieldForAccrualPath("effective_from"), "effectiveFrom");
  assert.equal(fieldForAccrualPath("frequency"), "frequency");
  // And nothing else.
  assert.equal(fieldForAccrualPath(null), null);
  assert.equal(fieldForAccrualPath("lines[1].account_code"), null,
    "a journal-basis path is not this form's — it renders no editable line");
  assert.equal(fieldForAccrualPath("accrual.invented"), null);
});

test("652.field: the element id names one element, and the mapper's answers are all real ids", () => {
  assert.equal(accrualFieldElementId("amountCents"), "accrual-amountCents");
  for (const path of ["accrual.amount_cents", "accrual.instruction", "day_of_month", "effective_to"]) {
    const field = fieldForAccrualPath(path);
    assert.ok(field !== null, path);
    assert.ok(accrualFieldElementId(field).startsWith("accrual-"));
  }
});

// ==============================================================================================
// 4 · Local validation — every rule a mirror of one the database enforces.
// ==============================================================================================

test("652.valid: a complete accrual raises nothing", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft(), KNOWN), []);
});

test("652.valid: a SILENT TERM is named as one, at the control that holds it", () => {
  const start = validateAccrualDraft(goodDraft({ servicePeriodStart: "" }), KNOWN);
  assert.deepEqual(start, [{ field: "servicePeriodStart", code: "silentTerm" }],
    "not 'required' — the preparer has to go and find out, which is a different next move");
  const end = validateAccrualDraft(goodDraft({ servicePeriodEnd: "" }), KNOWN);
  assert.deepEqual(end, [{ field: "servicePeriodEnd", code: "silentTerm" }]);
  const order = validateAccrualDraft(
    goodDraft({ servicePeriodStart: "2026-07-31", servicePeriodEnd: "2026-07-01" }), KNOWN);
  assert.deepEqual(order, [{ field: "servicePeriodEnd", code: "servicePeriodOrder" }]);
});

test("652.valid: a STATED ZERO is refused at the amount, not at a derived line", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft({ amountCents: 0 }), KNOWN),
    [{ field: "amountCents", code: "amountRequired" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ amountCents: -1 }), KNOWN),
    [{ field: "amountCents", code: "amountRequired" }]);
});

test("652.valid: the two legs, their roles and their distinctness", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft({ expenseAccountCode: "" }), KNOWN),
    [{ field: "expenseAccountCode", code: "expenseAccountRequired" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ liabilityAccountCode: "" }), KNOWN),
    [{ field: "liabilityAccountCode", code: "liabilityAccountRequired" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ liabilityAccountCode: "6100" }), KNOWN),
    [{ field: "liabilityAccountCode", code: "accountsNotDistinct" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ expenseAccountCode: "9999" }), KNOWN),
    [{ field: "expenseAccountCode", code: "accountUnknown" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ expenseAccountCode: "9999" }), null), [],
    "…and with the chart unread the rule is SKIPPED rather than guessed: refusing a code because a "
    + "read has not returned would be the form inventing a rule the database does not have");
});

test("652.valid: the purpose, the authority and the instruction are each required by name", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft({ purpose: "  " }), KNOWN),
    [{ field: "purpose", code: "purposeRequired" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ authorityWorkId: "" }), KNOWN),
    [{ field: "authorityWorkId", code: "authorityRequired" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ instruction: " " }), KNOWN),
    [{ field: "instruction", code: "instructionRequired" }]);
});

test("652.valid: the schedule runs INSIDE the term it names, and an open-ended authority is refused", () => {
  // The three arms of 0222's window wall, mirrored at the control that holds each mistake. MEASURED
  // before the wall existed: a June authority under a July term posted three entries, two of them
  // describing a period they did not accrue for (review round 1, A1).
  assert.deepEqual(validateAccrualDraft(goodDraft({ effectiveTo: "" }), KNOWN),
    [{ field: "effectiveTo", code: "effectiveToRequired" }],
    "a cost belongs to a period that ENDS, so the schedule that accrues it ends too");
  assert.deepEqual(validateAccrualDraft(goodDraft({ effectiveFrom: "2026-06-01" }), KNOWN),
    [{ field: "effectiveFrom", code: "windowBeforeTerm" }],
    "the first entry would otherwise name a period it did not accrue for");
  assert.deepEqual(validateAccrualDraft(goodDraft({ effectiveTo: "2026-12-31" }), KNOWN),
    [{ field: "effectiveTo", code: "windowAfterTerm" }],
    "…and the last entry would post after the term it names had ended");
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ servicePeriodStart: "2026-07-01", servicePeriodEnd: "2026-09-30",
      effectiveFrom: "2026-08-01", effectiveTo: "2026-09-30" }), KNOWN),
    [], "a window strictly inside its term is fine: the term may be wider than the schedule");
});

test("652.valid: the schedule's two day-rule halves, and 0193's own reversal collision", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft({ dayRule: "day_of_month", dayOfMonth: "" }), KNOWN),
    [{ field: "dayOfMonth", code: "dayOfMonthRange" }]);
  assert.deepEqual(validateAccrualDraft(goodDraft({ dayRule: "day_of_month", dayOfMonth: "31" }), KNOWN),
    [{ field: "dayOfMonth", code: "dayOfMonthRange" }],
    "28 is the ceiling, and the ceiling is the point: a '31st of every month' schedule has no "
    + "unambiguous February");
  assert.deepEqual(validateAccrualDraft(goodDraft({ dayOfMonth: "15" }), KNOWN),
    [{ field: "dayOfMonth", code: "dayOfMonthAbsent" }]);
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ frequency: "monthly", dayRule: "day_of_month", dayOfMonth: "1" }), KNOWN),
    [{ field: "dayOfMonth", code: "reversalCollides" }],
    "a monthly accrual on the 1st would put period k's reversal on period k+1's own day");
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ frequency: "quarterly", dayRule: "day_of_month", dayOfMonth: "1" }), KNOWN),
    [], "…and a quarterly one does not collide: its next accrual is three months away");
});

test("652.valid: the authority window", () => {
  assert.deepEqual(validateAccrualDraft(goodDraft({ effectiveFrom: "" }), KNOWN),
    [{ field: "effectiveFrom", code: "effectiveFromRequired" }]);
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ servicePeriodStart: "2026-06-01", effectiveFrom: "2026-07-31",
      effectiveTo: "2026-06-30" }), KNOWN),
    [{ field: "effectiveTo", code: "effectiveToBeforeFrom" }]);
});

test("652.valid: a term too short for its own schedule is refused at the DAY RULE, not at the term", () => {
  // 0222's SEVENTH MEASUREMENT, mirrored at the control. MEASURED on a rig before the wall existed
  // (review round 2, NB1): a 2026-07-01..2026-07-15 term on a month-end rule was ACCEPTED, the plan
  // went live, and `clara.request_plan_catch_up` over the whole window answered
  // `{"events":[],"admitted":0}` — an accrual that can never accrue.
  const short = { servicePeriodEnd: "2026-07-15", effectiveTo: "2026-07-15" } as const;
  assert.deepEqual(validateAccrualDraft(goodDraft(short), KNOWN),
    [{ field: "dayRule", code: "scheduleYieldsNone" }],
    "the term is the fact a human stated; the day rule is the thing to change");
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ servicePeriodStart: "2026-07-10", servicePeriodEnd: "2026-07-10",
      effectiveFrom: "2026-07-10", effectiveTo: "2026-07-10" }), KNOWN),
    [{ field: "dayRule", code: "scheduleYieldsNone" }], "a one-day term is the same shape");
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ ...short, dayRule: "day_of_month", dayOfMonth: "20" }), KNOWN),
    [{ field: "dayOfMonth", code: "scheduleYieldsNone" }],
    "…and under a day-of-month rule the DAY is the number to change");
  // IT IS A WALL, NOT A BAN: the same half-month term with a day that falls inside it is fine.
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ ...short, dayRule: "day_of_month", dayOfMonth: "15" }), KNOWN),
    []);
  // AND IT NEVER PILES ONTO A MISTAKE ALREADY NAMED: a day out of range is the one issue raised.
  assert.deepEqual(
    validateAccrualDraft(goodDraft({ ...short, dayRule: "day_of_month", dayOfMonth: "31" }), KNOWN),
    [{ field: "dayOfMonth", code: "dayOfMonthRange" }]);
});

test("652.valid: the first invalid field is the first control in reading order", () => {
  const issues = validateAccrualDraft(emptyAccrualDraft(), KNOWN);
  assert.equal(firstInvalidAccrualField(issues), "purpose");
  assert.equal(firstInvalidAccrualField([]), null);
});

// ==============================================================================================
// 5 · The wire shape.
// ==============================================================================================

test("652.wire: toAccrualParticulars emits the DATABASE's own spelling and nothing else", () => {
  const out = toAccrualParticulars(goodDraft());
  assert.deepEqual(Object.keys(out).sort(), [
    "amount_cents", "currency", "expense_account_code", "instruction", "liability_account_code",
    "method", "service_period_end", "service_period_start", "term_source",
  ]);
  assert.equal(out.currency, "MYR");
  assert.deepEqual(out.method, { rule: "stated_amount" });
  assert.equal(out.term_source, "human_stated",
    "the form has no control for the term's source: a period a model read off a document may not "
    + "enter the durable record (0140's table comment, CONFIRMED AS LAW)");
});

test("652.wire: the optional particulars appear only when they were given, and are trimmed", () => {
  const bare = toAccrualParticulars(goodDraft());
  assert.equal("memo" in bare, false);
  assert.equal("source_document_id" in bare, false);
  const full = toAccrualParticulars(goodDraft({ memo: "  July rent  ", sourceDocumentId: " d-1 " }));
  assert.equal(full.memo, "July rent");
  assert.equal(full.source_document_id, "d-1");
});
