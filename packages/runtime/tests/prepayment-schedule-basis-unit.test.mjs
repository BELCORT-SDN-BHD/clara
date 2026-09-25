// #653 — THE CHAT-LANE BASIS MODULE, driven as pure functions.
//
// WHAT EACH CELL PINS:
//   schema.*   the tool's input is `.strict()` and is DELIBERATELY NARROW: it carries no amount,
//              no dates, no term, no cadence and no authority id, because every one of those is
//              either derived by the frozen evaluator or human-only by law. A model that could
//              pass one of them would be a model supplying an accounting fact.
//   mirror.*   the local refusal is a MIRROR: it refuses only what migration 0223 refuses, in the
//              database's own reason tokens, and it refuses nothing the database would accept.
//   payload.*  the door payload is the DATABASE's own parameter names in its own order, and the
//              authority is the CONVERSATION rather than anything the model named.
//   part.*     a successful call emits a CONFIGURATION part that says so — the one boundary a chat
//              surface must never blur, because the first occurrence is admitted by the belt.
//
// THE DATABASE IS THE AUTHORITY. `packages/db/tests/prepayment-schedule.test.mjs` owns every rule
// these cells mirror; this file only proves the mirror does not invent one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const mod = await import("../lib/prepayment-schedule-basis.ts");

const VALID = {
  source_entry_id: "9f1d8e2c-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  expense_account_code: "59000001",
  expense_account_basis: "The invoice narrates a twelve-month software subscription.",
  purpose: "Prepaid subscription amortisation",
};

// ==============================================================================================
// 1 · The schema.
// ==============================================================================================

test("schema.strict — the tool's input is exactly four fields, and an extra key is REFUSED rather than ignored", () => {
  const ok = mod.startPrepaymentScheduleWorkInputSchema.safeParse(VALID);
  assert.equal(ok.success, true, ok.success ? "" : JSON.stringify(ok.error?.issues));
  assert.deepEqual(Object.keys(ok.data).sort(), [
    "expense_account_basis", "expense_account_code", "purpose", "source_entry_id",
  ]);
  // The frozen tool schema family is `.strict()` estate-wide (0193:203-208 records what an unknown
  // key costs: the run's faithful echo fails validation and the Work settles failed/no_effect).
  const extra = mod.startPrepaymentScheduleWorkInputSchema.safeParse({ ...VALID, total_cents: 120000 });
  assert.equal(extra.success, false, "an unknown key is refused, never carried");
});

test("schema.no_accounting_facts — the schema offers NO amount, NO dates, NO term, NO cadence and NO authority id: every one of those is derived by the frozen evaluator or human-only by law", () => {
  const forbidden = [
    { total_cents: 120000 },
    { period_count: 12 },
    { term_start: "2026-01-01" },
    { term_end: "2026-12-31" },
    { frequency: "monthly" },
    { day_rule: "last_day_of_month" },
    { authority_ref: { kind: "accounting_work", id: VALID.source_entry_id } },
    { basis_kind: "human_stated" },
  ];
  for (const f of forbidden) {
    const r = mod.startPrepaymentScheduleWorkInputSchema.safeParse({ ...VALID, ...f });
    assert.equal(r.success, false, `${Object.keys(f)[0]} must not be an input this tool accepts`);
  }
});

test("schema.shape — a non-uuid source entry, a blank account code and a blank basis are all refused by the schema itself", () => {
  for (const bad of [
    { source_entry_id: "not-a-uuid" },
    { expense_account_code: "" },
    { expense_account_basis: "" },
    { purpose: "" },
  ]) {
    const r = mod.startPrepaymentScheduleWorkInputSchema.safeParse({ ...VALID, ...bad });
    assert.equal(r.success, false, `${Object.keys(bad)[0]} must be refused`);
  }
});

// ==============================================================================================
// 2 · The refusal mirror.
// ==============================================================================================

test("mirror.tokens — every token the mirror and the message map name is one a DOOR actually raises", () => {
  // The eleven prepayment tokens are 0140's OWN spellings, carried through 0223's door verbatim
  // rather than re-invented — which is the whole reason this module has a token table at all.
  //
  // THE THREE THE OBO TWIN ADDS (#1135 / #915's successor contract, 2026-09-25) ARE NOT 0223's,
  // and they are listed separately so that stays visible. `clara.create_prepayment_schedule_for`
  // (0307) is the door the chat lane reaches, and it carries a role floor and an actor the human
  // door does not: `authority_lost` and `insufficient_role` are CLR04 about the PERSON the turn
  // acts for, and `invalid_author` is CLR10 about the caller's own wiring and is never shown.
  const fromMigration0223 = [
    "authority_ref_unresolved",
    "client_inactive",
    "client_not_found",
    "invalid_purpose",
    "operation_in_flight",
    "prepayment_amount_below_period_granularity",
    "prepayment_schedule_exists",
    "prepayment_source_unfit",
    "prepayment_target_ineligible",
    "prepayment_target_underivable",
    "prepayment_term_underivable",
  ];
  const fromTheOboTwin = ["authority_lost", "insufficient_role", "invalid_author"];
  assert.deepEqual(
    Object.values(mod.PREPAYMENT_REFUSAL).sort(),
    [...fromMigration0223, ...fromTheOboTwin].sort(),
  );
  // and every one of the fourteen has a sentence of its own
  for (const token of Object.values(mod.PREPAYMENT_REFUSAL)) {
    assert.match(mod.prepaymentRefusalMessage(token, {}), /\S/, token);
  }
});

test("mirror.accepts — the mirror refuses NOTHING the database would accept: a well-shaped input passes it", () => {
  assert.equal(mod.localPrepaymentRefusal(VALID), null);
});

test("mirror.refuses — a whitespace-only account code or basis is refused with the DATABASE's own token and axis", () => {
  const noAccount = mod.localPrepaymentRefusal({ ...VALID, expense_account_code: "   " });
  assert.equal(noAccount.refusal, "prepayment_target_underivable");
  assert.equal(noAccount.axis, "account_missing");
  const noBasis = mod.localPrepaymentRefusal({ ...VALID, expense_account_basis: "   " });
  assert.equal(noBasis.refusal, "prepayment_target_underivable");
  assert.equal(noBasis.axis, "basis_missing");
});

test("mirror.shallow — the mirror asks NOTHING that needs a row: it never claims an entry is unfit, a term missing or an amount below granularity", () => {
  // Those three are the database's, and a model guessing any of them would be the invention this
  // lane exists to prevent. The mirror can only ever answer with the two shape tokens above.
  const answers = new Set();
  for (const probe of [
    VALID,
    { ...VALID, expense_account_code: "   " },
    { ...VALID, expense_account_basis: "   " },
    { ...VALID, purpose: "   " },
  ]) {
    const r = mod.localPrepaymentRefusal(probe);
    if (r) answers.add(r.refusal);
  }
  assert.deepEqual([...answers].sort(), ["invalid_purpose", "prepayment_target_underivable"]);
});

test("mirror.messages — the missing-term refusal names the HUMAN act, because no agent path to a service period exists or ever will", () => {
  const msg = mod.prepaymentRefusalMessage("prepayment_term_underivable", {
    missing: "document_service_periods", document_id: "d",
  });
  assert.match(msg, /service period/i);
  assert.match(msg, /person|human/i, "it names who must act");
  assert.match(msg, /never supply|I never/i, "…and says the model does not supply one");

  assert.match(mod.prepaymentRefusalMessage("prepayment_source_unfit"), /POSTED/);
  assert.match(
    mod.prepaymentRefusalMessage("prepayment_amount_below_period_granularity",
      { total_cents: 1, period_count: 2 }),
    /1 cents over 2 periods/);
  assert.match(mod.prepaymentRefusalMessage("prepayment_target_ineligible", { axis: "not_expense_class" }),
    /not_expense_class/);
  assert.equal(typeof mod.prepaymentRefusalMessage("something_new"), "string",
    "an unknown token still answers with a sentence rather than a key path");
});

// ==============================================================================================
// 3 · The door payload.
// ==============================================================================================

test("payload.names — the payload is the database's own parameter names, and the authority is the CONVERSATION rather than anything the model named", () => {
  const p = mod.prepaymentDoorPayload(VALID, {
    clientId: "c1", taskId: "t1", opKey: "op-1",
  });
  assert.deepEqual(Object.keys(p), [
    "p_client", "p_source_entry", "p_expense_account", "p_expense_basis",
    "p_purpose", "p_authority_ref", "p_op_key",
  ]);
  assert.deepEqual(p.p_authority_ref, { kind: "chat_task", id: "t1" },
    "the chat lane's authority is its own task — a model never names the row that authorises it");
  assert.equal(p.p_client, "c1");
  assert.equal(p.p_source_entry, VALID.source_entry_id);
  assert.equal(p.p_op_key, "op-1");
});

test("payload.trims — the two judged fields are trimmed exactly as the door trims them, so the mirror and the database agree on what was sent", () => {
  const p = mod.prepaymentDoorPayload(
    { ...VALID, expense_account_code: "  59000001  ", expense_account_basis: "  because  ", purpose: "  x  " },
    { clientId: "c1", taskId: "t1", opKey: "op-1" });
  assert.equal(p.p_expense_account, "59000001");
  assert.equal(p.p_expense_basis, "because");
  assert.equal(p.p_purpose, "x");
});

// ==============================================================================================
// 4 · The part.
// ==============================================================================================

test("part.configuration_only — a successful call emits a CONFIGURATION part that says so: the schedule has posted nothing, and the belt admits the first occurrence", () => {
  const part = mod.prepaymentSchedulePart({
    schedule_id: "s1", plan_id: "p1", total_cents: 100000, period_count: 12,
    effective_from: "2026-01-31", effective_to: "2026-12-31",
    expense_account_code: "59000001", prepaid_account_code: "19000001",
  });
  assert.equal(part.kind, "prepayment_schedule_configured");
  assert.equal(part.configurationOnly, true);
  assert.equal(part.planKind, "amortisation_schedule");
  assert.equal(part.totalCents, 100000);
  assert.equal(part.periodCount, 12);
  assert.equal(part.effectiveFrom, "2026-01-31");
  assert.equal(part.effectiveTo, "2026-12-31");
});
