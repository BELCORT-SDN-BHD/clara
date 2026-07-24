// Pure chart-of-accounts model tests (closes live-gate-run-2026-07-24 finding 1). The
// node:test + tsx rig (no jsdom — see test/bootstrap.mjs). These pin the account-code
// validator against the DB CHECK verbatim, the deterministic op_key derivation (WB-R19),
// the block-selection maths, the apply-result view-model, and — the one thing genuinely
// worth locking about a hand-authored data file — COA_TEMPLATE's own structural
// integrity (every code unique, every code DB-valid, tiers partition cleanly, the
// account total the header/task both claim). All DB-free fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAccountCode,
  ACCOUNT_CODE_HINT,
  ACCOUNT_TYPES,
  ACCOUNT_CLASSES,
  SPECIAL_ACC_TYPES,
  coaSeedOpKey,
  defaultSelectedBlockKeys,
  toggleBlockKey,
  selectionAccountCount,
  initApplyResults,
  withResult,
  applySummary,
  buildMpersLookup,
  COA_TEMPLATE,
  STANDARD_BLOCKS,
  OPTIONAL_BLOCKS,
  templateAccounts,
} from "./accountsModel";

// --- validateAccountCode (mirrors coa_accounts_account_code_check, 0009, verbatim) ---

test("validateAccountCode accepts 4-8 digit codes and the NNN-XXXX dashed form", () => {
  assert.equal(validateAccountCode("1000").ok, true);
  assert.equal(validateAccountCode("12345678").ok, true, "8 digits is the upper bound");
  assert.equal(validateAccountCode("900-A01").ok, true);
  assert.equal(validateAccountCode("190-OBE").ok, true);
  assert.equal(validateAccountCode("  1000  ").ok, true, "surrounding whitespace is trimmed first");
});

test("validateAccountCode rejects blanks, too-short/long digit runs, and malformed dashed codes", () => {
  assert.equal(validateAccountCode("").ok, false);
  assert.equal(validateAccountCode("   ").ok, false);
  assert.equal(validateAccountCode("123").ok, false, "3 digits is below the 4-digit floor");
  assert.equal(validateAccountCode("123456789").ok, false, "9 digits is above the 8-digit ceiling");
  assert.equal(validateAccountCode("90-A01").ok, false, "dashed form needs exactly 3 leading digits");
  assert.equal(validateAccountCode("900-A0123").ok, false, "dashed suffix caps at 4 chars");
  assert.equal(validateAccountCode("900-a01").ok, false, "dashed suffix must be uppercase per the DB CHECK");
  const bad = validateAccountCode("abc");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /account-code format/);
});

test("ACCOUNT_CODE_HINT names both accepted shapes (surfaced to the operator on refusal)", () => {
  assert.match(ACCOUNT_CODE_HINT, /4–8 digits/);
  assert.match(ACCOUNT_CODE_HINT, /NNN-XXXX|dash/i);
});

test("the option-list constants mirror the DB CHECKs exactly (0003/0009/0015/0017)", () => {
  assert.deepEqual(ACCOUNT_TYPES, ["asset", "liability", "equity", "income", "expense"]);
  assert.deepEqual(ACCOUNT_CLASSES, ["payable", "receivable"]);
  assert.deepEqual(SPECIAL_ACC_TYPES, [
    "rounding", "sst_output", "sst_purchase_cost", "opening_balance_equity", "retained_earnings",
  ]);
});

// --- coaSeedOpKey (WB-R19: same intent keeps its op_key) ------------------------------

test("coaSeedOpKey is deterministic — same client+code always yields the same op_key", () => {
  const a = coaSeedOpKey("client-1", "900-A01");
  const b = coaSeedOpKey("client-1", "900-A01");
  assert.equal(a, b, "a retry after a partial failure must send the IDENTICAL op_key");
  assert.match(a, /^coaseed:client-1:900-A01$/);
});

test("coaSeedOpKey varies by client and by code — never collides across either axis", () => {
  const base = coaSeedOpKey("client-1", "1000");
  assert.notEqual(base, coaSeedOpKey("client-2", "1000"), "different client, same code");
  assert.notEqual(base, coaSeedOpKey("client-1", "2000"), "same client, different code");
});

// --- block selection maths -------------------------------------------------------------

test("defaultSelectedBlockKeys pre-selects every standard block and none of the optional ones", () => {
  const keys = defaultSelectedBlockKeys();
  assert.deepEqual(keys, STANDARD_BLOCKS.map((b) => b.key));
  for (const block of COA_TEMPLATE) {
    assert.equal(keys.includes(block.key), block.tier === "standard", `${block.key} selection must match its tier`);
  }
});

test("toggleBlockKey adds an absent key and removes a present one, leaving others untouched", () => {
  const start = ["equity", "ppe"];
  assert.deepEqual(toggleBlockKey(start, "inventory"), ["equity", "ppe", "inventory"]);
  assert.deepEqual(toggleBlockKey(start, "ppe"), ["equity"]);
  assert.deepEqual(start, ["equity", "ppe"], "the input array is never mutated");
});

test("selectionAccountCount reads the count straight off the fixed template, never estimates", () => {
  assert.equal(selectionAccountCount([]), 0);
  assert.equal(selectionAccountCount(["equity"]), templateAccounts(["equity"]).length);
  const standard = defaultSelectedBlockKeys();
  assert.equal(selectionAccountCount(standard), templateAccounts(standard).length);
});

// --- COA_TEMPLATE's own structural integrity -------------------------------------------

test("COA_TEMPLATE totals 186 accounts across every block, standard+optional partitioning cleanly", () => {
  const total = COA_TEMPLATE.reduce((n, b) => n + b.accounts.length, 0);
  assert.equal(total, 186);
  const standardTotal = STANDARD_BLOCKS.reduce((n, b) => n + b.accounts.length, 0);
  const optionalTotal = OPTIONAL_BLOCKS.reduce((n, b) => n + b.accounts.length, 0);
  assert.equal(standardTotal, 142);
  assert.equal(optionalTotal, 44);
  assert.equal(standardTotal + optionalTotal, 186);
  for (const b of COA_TEMPLATE) assert.ok(b.tier === "standard" || b.tier === "optional", `${b.key} has a recognized tier`);
});

test("every block key is unique — templateAccounts() selects by key, so a duplicate would double-seed", () => {
  const keys = COA_TEMPLATE.map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every template account code is unique across the whole template (no cross-block collision)", () => {
  const codes = COA_TEMPLATE.flatMap((b) => b.accounts.map((a) => a.code));
  assert.equal(new Set(codes).size, codes.length);
});

test("every template account code passes the DB's own account-code CHECK", () => {
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      assert.equal(validateAccountCode(acct.code).ok, true, `${acct.code} (${block.key}) must be DB-valid`);
    }
  }
});

test("every template account_type/account_class/special value is one the DB CHECKs actually admit", () => {
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      assert.ok((ACCOUNT_TYPES as readonly string[]).includes(acct.type), `${acct.code} type`);
      if (acct.accountClass) assert.ok((ACCOUNT_CLASSES as readonly string[]).includes(acct.accountClass), `${acct.code} class`);
      if (acct.special) assert.ok((SPECIAL_ACC_TYPES as readonly string[]).includes(acct.special), `${acct.code} special`);
    }
  }
});

test("no special_acc_type appears twice anywhere in the template — clara.uq_coa_special is UNIQUE per client, so a second one would refuse mid-apply", () => {
  const specials = COA_TEMPLATE.flatMap((b) => b.accounts.map((a) => a.special).filter(Boolean));
  assert.equal(new Set(specials).size, specials.length, `duplicate special marker in ${specials.join(", ")}`);
});

test("no account NAME encodes a rate, percentage, threshold or effective date — the template's own standing rule 2", () => {
  // Statutory SECTION references (s.39(1)(l)) identify the rule and are allowed; a quantum
  // or a date is an effective-dated compliance fact that belongs in the tax engine.
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      assert.doesNotMatch(acct.name, /%|\bper cent\b/i, `${acct.code} name carries a percentage`);
      assert.doesNotMatch(acct.name, /\b(19|20)\d{2}\b/, `${acct.code} name carries a year`);
      assert.doesNotMatch(acct.name, /\bRM\s?\d/i, `${acct.code} name carries a ringgit threshold`);
    }
  }
});

test("every account carries an MPERS roll-up — the mapping is what makes an unofficial chart defensible", () => {
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      assert.ok(acct.mpers && acct.mpers.trim().length > 0, `${acct.code} has no MPERS roll-up`);
    }
  }
});

test("the two equity markers (OBE, retained earnings) are typed equity — the DB's ck_coa_obe_equity/ck_coa_retained_earnings_equity would else refuse them", () => {
  const obe = templateAccounts(["equity"]).find((a) => a.special === "opening_balance_equity");
  const re = templateAccounts(["equity"]).find((a) => a.special === "retained_earnings");
  assert.ok(obe && obe.type === "equity");
  assert.ok(re && re.type === "equity");
});

// --- apply-result view-model -----------------------------------------------------------

test("initApplyResults seeds every account as pending, keyed by code+name", () => {
  const rs = initApplyResults(templateAccounts(["equity"]));
  assert.equal(rs.length, templateAccounts(["equity"]).length);
  assert.ok(rs.every((r) => r.status === "pending"));
});

test("withResult patches exactly one row by index, leaving the rest untouched", () => {
  const rs = initApplyResults(templateAccounts(["system"]));
  const patched = withResult(rs, 0, { status: "ok" });
  assert.equal(patched[0]?.status, "ok");
  assert.equal(rs[0]?.status, "pending", "the original array is never mutated");
});

test("applySummary counts ok/error/pending without double-counting", () => {
  const rs = initApplyResults(templateAccounts(["system", "finance-tax"]));
  let r = withResult(rs, 0, { status: "ok" });
  r = withResult(r, 1, { status: "error", message: "refused" });
  const s = applySummary(r);
  assert.equal(s.ok, 1);
  assert.equal(s.error, 1);
  assert.equal(s.pending, r.length - 2);
});

// --- MPERS roll-up lookup ---------------------------------------------------------------

test("buildMpersLookup resolves every template code to its recorded MPERS line, and nothing else", () => {
  const m = buildMpersLookup();
  assert.equal(m.get("100-000"), "Equity — share capital");
  assert.equal(m.get("999-R00"), "Other operating expenses");
  assert.equal(m.get("not-a-real-code"), undefined, "an account the template never carried has no roll-up — never guessed");
});
