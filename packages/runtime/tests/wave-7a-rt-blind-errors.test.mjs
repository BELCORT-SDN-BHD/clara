// §7-A THE UNATTENDED SALES DRAFTER — CONTRACT-BLIND unit tests (PR #203 test lane,
// test-7a-rt-blind). Drives ONLY autoDraft.v6.errors.ts's exported types/functions —
// written from wave-7a-contract.md §4 (controls 2/6) and skeleton §2a item (e), not
// from the DB migration's actual CLR-raising logic (out of this lane's scope; PR-DB
// is a separate review/merge unit).
//
// skeleton §2a item (e) — "adds `tax_leg_missing` ..., `type_polarity_mismatch` ...
// and `sst_account_missing` ... **And make the generic messages direction-neutral**
// — adding tokens while leaving 'bill/supplier/vendor' wording leaves sales refusals
// purchase-worded."

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const errors = await import("../workflows/autoDraft.v6.errors.ts");
const { refusalFromDbError } = errors;

const PURCHASE_WORDS = /\b(bill|supplier|vendor)\b/i;

// ===========================================================================
// The three new §7-A refusal tokens.
// ===========================================================================

test("error map exports tax_leg_missing as a CLR21 reason", () => {
  const r = refusalFromDbError({ code: "CLR21", detail: '{"reason":"tax_leg_missing"}' });
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "tax_leg_missing");
  assert.ok(r.message && r.message.length > 0, "a specific message must be attached, not just the raw token");
});

test("error map exports type_polarity_mismatch as a CLR21 reason", () => {
  const r = refusalFromDbError({ code: "CLR21", detail: '{"reason":"type_polarity_mismatch"}' });
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "type_polarity_mismatch");
  assert.ok(r.message && r.message.length > 0);
});

test("error map exports sst_account_missing as a CLR10 reason (NOT CLR21) — the sales-side mirror of the purchase sst_purchase_cost precondition", () => {
  const r = refusalFromDbError({ code: "CLR10", detail: '{"reason":"sst_account_missing"}' });
  assert.equal(r.code, "CLR10", "sst_account_missing must ride CLR10 per skeleton §2a item (e)");
  assert.equal(r.reason, "sst_account_missing");
  assert.ok(r.message && r.message.length > 0);
});

test("a CLR10 WITHOUT a recognised reason still maps to the generic CLR10 message (sst_account_missing is not the only CLR10 cause)", () => {
  const r = refusalFromDbError({ code: "CLR10" });
  assert.equal(r.code, "CLR10");
  assert.equal(r.reason, undefined);
  assert.ok(r.message && r.message.length > 0);
});

// ===========================================================================
// Direction-neutrality of the GENERIC (non-reason-specific) messages.
// ===========================================================================

test("the GENERIC (non-reason-specific) messages are direction-neutral — none contain 'bill'/'supplier'/'vendor'", () => {
  for (const code of ["CLR01", "CLR02", "CLR03", "CLR10", "CLR11", "CLR21", "CLR23", "CLR26", "CLR28", "CLR29"]) {
    const r = refusalFromDbError({ code });
    assert.doesNotMatch(r.message, PURCHASE_WORDS, `the generic ${code} message must be direction-neutral, got: "${r.message}"`);
  }
});

test("an UNKNOWN CLR code collapses to the generic internal refusal, which is also direction-neutral", () => {
  const r = refusalFromDbError({ code: "CLR99" });
  assert.equal(r.code, "internal");
  assert.doesNotMatch(r.message, PURCHASE_WORDS);
});

test("the three NEW token-specific messages happen to be direction-neutral too — stricter than the contract requires (token-specific purchase messages MAY use these words per this lane's own brief), recorded as an observation, not asserted as a requirement beyond this", () => {
  const taxLeg = refusalFromDbError({ code: "CLR21", detail: '{"reason":"tax_leg_missing"}' });
  const polarity = refusalFromDbError({ code: "CLR21", detail: '{"reason":"type_polarity_mismatch"}' });
  const sst = refusalFromDbError({ code: "CLR10", detail: '{"reason":"sst_account_missing"}' });
  assert.doesNotMatch(taxLeg.message, PURCHASE_WORDS);
  assert.doesNotMatch(polarity.message, PURCHASE_WORDS);
  assert.doesNotMatch(sst.message, PURCHASE_WORDS);
});

test("native-constraint collapse (23505/23503/23514) and the structural 42501 mapping are unaffected — still produce oracle-safe, direction-neutral refusals", () => {
  const dupCounterparty = refusalFromDbError({ code: "23505", constraint: "counterparty_alias_uq" });
  assert.equal(dupCounterparty.code, "CLR23");
  const dupOther = refusalFromDbError({ code: "23505", constraint: "some_other_uq" });
  assert.equal(dupOther.code, "CLR21");
  assert.equal(dupOther.reason, "double_coded");
  const fk = refusalFromDbError({ code: "23503" });
  assert.equal(fk.code, "CLR11");
  const structural = refusalFromDbError({ code: "42501" });
  assert.equal(structural.code, "CLR03");
  for (const r of [dupCounterparty, dupOther, fk, structural]) {
    assert.doesNotMatch(r.message, PURCHASE_WORDS);
  }
});

test("CLR29 (the one-draft-per-filing no-op) preserves the double_coded reason default", () => {
  const r = refusalFromDbError({ code: "CLR29" });
  assert.equal(r.code, "CLR29");
  assert.equal(r.reason, "double_coded");
});
