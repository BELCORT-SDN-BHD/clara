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
  specialMarkerConflicts,
  markerConflictRefusal,
  type AccountRow,
  initApplyResults,
  withResult,
  applySummary,
  buildMpersLookup,
  COA_TEMPLATE,
  MPERS_ROLLUPS,
  STANDARD_BLOCKS,
  OPTIONAL_BLOCKS,
  templateAccounts,
  conflictingBlockKeys,
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

test("COA_TEMPLATE totals 196 accounts across every block, standard+optional partitioning cleanly", () => {
  const total = COA_TEMPLATE.reduce((n, b) => n + b.accounts.length, 0);
  assert.equal(total, 196);
  const standardTotal = STANDARD_BLOCKS.reduce((n, b) => n + b.accounts.length, 0);
  const optionalTotal = OPTIONAL_BLOCKS.reduce((n, b) => n + b.accounts.length, 0);
  assert.equal(
    standardTotal,
    145,
    "unchanged by rounds 3 and 4 — 190-OBE and then the eight company-officer accounts only MOVED between standard blocks",
  );
  assert.equal(optionalTotal, 51, "round 3 added the three sole-proprietorship equity accounts");
  assert.equal(standardTotal + optionalTotal, 196);
  assert.equal(STANDARD_BLOCKS.length, 11, "round 4 split company-officers out of four existing standard blocks");
  assert.equal(OPTIONAL_BLOCKS.length, 12);
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

test("no special_acc_type appears twice in any CO-SELECTABLE set of blocks — clara.uq_coa_special is UNIQUE per (client, value), so a second one would refuse mid-apply", () => {
  // Round 3: two blocks may now carry the same marker (the company and sole-proprietorship
  // equity shapes each need retained_earnings) — but ONLY if they are declared mutually
  // exclusive, so no selection the UI can build ever contains both.
  for (const block of COA_TEMPLATE) {
    const own = block.accounts.map((a) => a.special).filter(Boolean);
    assert.equal(new Set(own).size, own.length, `${block.key} carries a marker twice by itself`);
  }
  for (const a of COA_TEMPLATE) {
    for (const b of COA_TEMPLATE) {
      if (a.key === b.key) continue;
      if (conflictingBlockKeys(a.key).includes(b.key)) continue; // never co-selectable
      const shared = a.accounts
        .map((x) => x.special)
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .filter((s) => b.accounts.some((y) => y.special === s));
      assert.deepEqual(shared, [], `${a.key} and ${b.key} are co-selectable yet share marker(s) ${shared.join(", ")}`);
    }
  }
});

test("every duplicated special marker is covered by a SYMMETRIC mutual-exclusion declaration, and no two STANDARD blocks conflict", () => {
  const counts = new Map<string, string[]>();
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      if (acct.special) counts.set(acct.special, [...(counts.get(acct.special) ?? []), block.key]);
    }
  }
  // retained_earnings is the ONLY marker allowed to appear twice, and only across the two
  // entity shapes. A second sst_output/rounding/OBE duplicate would be a real defect.
  for (const [marker, blocks] of counts) {
    if (blocks.length === 1) continue;
    assert.equal(marker, "retained_earnings", `${marker} is duplicated across ${blocks.join(", ")}`);
    assert.deepEqual([...blocks].sort(), ["equity", "sole-proprietor"]);
  }
  // Symmetry: every declaration is made on both sides, so reading either block is enough.
  for (const block of COA_TEMPLATE) {
    for (const other of block.conflictsWith ?? []) {
      const target = COA_TEMPLATE.find((b) => b.key === other);
      assert.ok(target, `${block.key} conflicts with unknown block ${other}`);
      assert.ok(
        (target.conflictsWith ?? []).includes(block.key),
        `${other} must declare the conflict with ${block.key} back`,
      );
    }
  }
  // The default selection is every standard block — so two standard blocks conflicting
  // would make defaultSelectedBlockKeys() itself un-appliable.
  for (const a of STANDARD_BLOCKS) {
    for (const b of conflictingBlockKeys(a.key)) {
      assert.ok(
        !STANDARD_BLOCKS.some((s) => s.key === b),
        `${a.key} and ${b} are both standard yet mutually exclusive — the default selection would be invalid`,
      );
    }
  }
});

test("toggleBlockKey drops EVERY conflicting block when the other entity shape is selected, and never re-adds on deselect", () => {
  const standard = defaultSelectedBlockKeys();
  assert.ok(standard.includes("equity"), "the company equity shape is the pre-selected default");
  assert.ok(standard.includes("company-officers"), "so is the company officers/distributions block");
  const soleProp = toggleBlockKey(standard, "sole-proprietor");
  assert.ok(soleProp.includes("sole-proprietor"));
  assert.ok(!soleProp.includes("equity"), "selecting the sole-proprietorship shape must drop the company shape");
  assert.ok(!soleProp.includes("company-officers"), "and the directors/dividends block with it");
  assert.ok(soleProp.includes("system"), "the System block (OBE + rounding) survives the swap — Gate K needs it");
  // Deselecting is pure removal: the operator's choice stands, nothing is restored.
  const back = toggleBlockKey(soleProp, "sole-proprietor");
  assert.ok(!back.includes("equity"));
  assert.ok(!back.includes("sole-proprietor"));
  // And the swap is reversible from the other direction.
  const backToCompany = toggleBlockKey(soleProp, "equity");
  assert.ok(backToCompany.includes("equity"));
  assert.ok(!backToCompany.includes("sole-proprietor"));
});

test("conflictingBlockKeys reads the declaration in BOTH directions and never returns the block itself", () => {
  assert.deepEqual(conflictingBlockKeys("equity"), ["sole-proprietor"]);
  assert.deepEqual(conflictingBlockKeys("company-officers"), ["sole-proprietor"]);
  assert.deepEqual([...conflictingBlockKeys("sole-proprietor")].sort(), ["company-officers", "equity"]);
  assert.deepEqual(conflictingBlockKeys("system"), [], "machinery conflicts with nothing — it ships with every shape");
  for (const b of COA_TEMPLATE) assert.ok(!conflictingBlockKeys(b.key).includes(b.key));
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

test("no NOTE or BLURB carries a quantum either — the second-pass review's finding that the rule was only pinned on names", () => {
  // Rule 2 exempts statutory citations (which carry years) and the MPERS twelve-month
  // classification criterion. What is never allowed anywhere is a rate or a money amount.
  const prose: Array<[string, string]> = [];
  for (const block of COA_TEMPLATE) {
    prose.push([`block ${block.key} blurb`, block.blurb]);
    for (const acct of block.accounts) if (acct.note) prose.push([`${acct.code} note`, acct.note]);
  }
  for (const [where, text] of prose) {
    assert.doesNotMatch(text, /\d\s?%|\bper cent\b/i, `${where} carries a percentage`);
    assert.doesNotMatch(text, /\bRM\s?\d/i, `${where} carries a ringgit amount`);
  }
});

test("every account's MPERS roll-up is one of the closed MPERS_ROLLUPS set — a new account must choose a mapping, never invent a string", () => {
  const allowed = new Set<string>(MPERS_ROLLUPS);
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) {
      assert.ok(allowed.has(acct.mpers), `${acct.code} maps to "${acct.mpers}", which is not in MPERS_ROLLUPS`);
    }
  }
});

test("every MPERS_ROLLUPS value is actually used — a dead roll-up means a mapping decision was abandoned", () => {
  const used = new Set(COA_TEMPLATE.flatMap((b) => b.accounts.map((a) => a.mpers)));
  for (const rollup of MPERS_ROLLUPS) assert.ok(used.has(rollup), `"${rollup}" is declared but unused`);
});

test("module coherence — a charge account never ships without the assets it belongs to", () => {
  // The second-pass review's finding: amortisation sat in the standard set while every
  // intangible asset was optional, so a default client got a charge with nothing to charge.
  const blockOf = (code: string) => COA_TEMPLATE.find((b) => b.accounts.some((a) => a.code === code))?.key;
  assert.equal(blockOf("900-AMO"), blockOf("220-SW1"), "amortisation must ship with the intangibles it amortises");
  assert.equal(blockOf("620-IMP"), blockOf("330-900"), "the inventory write-down charge must ship with the allowance");
  assert.equal(blockOf("530-IPG"), blockOf("230-FV1"), "investment-property fair-value movements must ship with the fair-value asset");
  assert.equal(blockOf("800-H01"), blockOf("470-H01"), "HP finance charges must ship with the HP liability");
  // Round 3: drawings reduce the capital account, so they ship together or not at all.
  assert.equal(blockOf("160-DRW"), blockOf("150-CAP"), "drawings must ship with the capital account they reduce");
  assert.equal(blockOf("100-CAP"), blockOf("150-CAP"), "contributed capital must ship with the capital account it feeds");
});

test("the two marker accounts the opening-balance carry-down resolves are BOTH reachable from every entity shape", () => {
  // Gate K's _draft_opening_item_core resolves opening_balance_equity AND retained_earnings
  // by marker and refuses outright if either is missing. OBE therefore lives in the System
  // block — standard, never conflicting — rather than inside a company-shaped equity block
  // that a sole proprietor has to swap out.
  const blockOf = (code: string) => COA_TEMPLATE.find((b) => b.accounts.some((a) => a.code === code))?.key;
  assert.equal(blockOf("190-OBE"), "system");
  assert.equal(blockOf("999-R00"), "system");
  const system = COA_TEMPLATE.find((b) => b.key === "system");
  assert.equal(system?.tier, "standard");
  assert.deepEqual(system?.conflictsWith ?? [], [], "the System block must never be swapped out by an entity choice");
  // Whichever equity shape is chosen, the selection carries exactly one of each marker.
  for (const shape of ["equity", "sole-proprietor"]) {
    const accts = templateAccounts(["system", shape]);
    assert.equal(accts.filter((a) => a.special === "opening_balance_equity").length, 1, `${shape} + system: one OBE`);
    assert.equal(accts.filter((a) => a.special === "retained_earnings").length, 1, `${shape} + system: one accumulated-equity marker`);
  }
});

test("the sole-proprietorship block carries no company-only concept — no shares, no dividends, no directors", () => {
  const block = COA_TEMPLATE.find((b) => b.key === "sole-proprietor");
  assert.ok(block);
  assert.equal(block.tier, "optional", "the company shape stays the pre-selected default");
  for (const acct of block.accounts) {
    assert.equal(acct.type, "equity", `${acct.code} is an equity account`);
    assert.doesNotMatch(acct.name, /\bshare|dividend|director/i, `${acct.code} name imports a company concept`);
  }
});

// The eight accounts a sole proprietorship must not receive. Round 3 named them in the
// blurb as an instruction to "also deselect" — an operation the workbench cannot perform,
// because panel 2 renders one checkbox per BLOCK and api.ts exposes no deactivate or
// delete. Round 4 moved them into the `company-officers` block instead, so the entity
// choice carries them. This asserts the OUTCOME, not the prose: a test that only proved
// eight strings appear in a sentence read as enforcement while enforcing nothing.
const COMPANY_OFFICER_CODES = ["250-DIR", "350-D01", "410-DIV", "420-D01", "472-DIR", "900-D01", "900-D04", "900-D05"];

test("selecting the sole-proprietorship shape SEEDS no director or dividend account — the outcome, not the blurb", () => {
  const soleProp = toggleBlockKey(defaultSelectedBlockKeys(), "sole-proprietor");
  const seeded = new Set(templateAccounts(soleProp).map((a) => a.code));
  for (const code of COMPANY_OFFICER_CODES) {
    assert.ok(!seeded.has(code), `${code} must not survive the sole-proprietorship selection`);
  }
  // …and the company default is genuinely unchanged: the same eight still ship by default,
  // so this is a re-homing, not a silent deletion from the practice's standard set.
  const company = new Set(templateAccounts(defaultSelectedBlockKeys()).map((a) => a.code));
  for (const code of COMPANY_OFFICER_CODES) {
    assert.ok(company.has(code), `${code} must still ship in the company default`);
  }
  assert.equal(templateAccounts(defaultSelectedBlockKeys()).length, 145);
});

test("company-officers holds exactly those eight, is standard, and is declared against the sole-proprietor shape", () => {
  const block = COA_TEMPLATE.find((b) => b.key === "company-officers");
  assert.ok(block);
  assert.deepEqual(block.accounts.map((a) => a.code).sort(), [...COMPANY_OFFICER_CODES].sort());
  assert.equal(block.tier, "standard", "a company is still the default entity shape");
  assert.deepEqual(block.conflictsWith, ["sole-proprietor"]);
  // No marker rides on any of them — this block is entity-shaped for a LEGAL-FORM reason,
  // not a uq_coa_special one, and mixing the two reasons would hide the constraint.
  for (const a of block.accounts) assert.equal(a.special, undefined, `${a.code} carries no special marker`);
});

test("imported taxable services is gated SEPARATELY from SST registration — a non-registered recipient can still owe it", () => {
  const blockOf = (code: string) => COA_TEMPLATE.find((b) => b.accounts.some((a) => a.code === code))?.key;
  assert.notEqual(blockOf("430-ITS"), blockOf("430-SVT"), "430-ITS must not sit behind the registered-person gate");
  assert.equal(blockOf("900-SST"), "operating-expenses", "SST borne on purchases is a cost to registered and unregistered clients alike");
});

test("every OBE / retained-earnings marker in the template is typed equity — the DB's ck_coa_obe_equity/ck_coa_retained_earnings_equity would else refuse it", () => {
  const marked = COA_TEMPLATE.flatMap((b) => b.accounts).filter(
    (a) => a.special === "opening_balance_equity" || a.special === "retained_earnings",
  );
  assert.equal(marked.length, 3, "one OBE, plus one accumulated-equity marker per entity shape");
  for (const a of marked) assert.equal(a.type, "equity", `${a.code} carries ${a.special} on a non-equity account`);
});

test("the three sole-proprietor equity accounts map ONE account to ONE line, and agree with what they hold", () => {
  // Round 4 / finding 4: 100-CAP had been described as three incompatible things at once —
  // a movement roll-up, a standing balance the Form B capital figure is read off, and the
  // reverse of 160-DIV (which is a CLEARING account zeroed each year). The standing-balance
  // reading won, so the roll-up has to be the balance one. Pinned structurally, not by prose.
  const m = buildMpersLookup();
  assert.equal(m.get("100-CAP"), "Equity — proprietor's capital (no MPERS roll-up)", "contributed capital is a BALANCE");
  assert.equal(m.get("150-CAP"), "Equity — proprietor's capital (no MPERS roll-up)", "the accumulated position is a BALANCE");
  assert.equal(m.get("160-DRW"), "Equity — proprietor's capital movement (no MPERS roll-up)", "only drawings is a movement");
  // The marker sits on the accumulated account, never on contributed capital or drawings —
  // Gate K's carry-down resolves it by marker, so the wrong one would misdescribe the plug.
  const block = COA_TEMPLATE.find((b) => b.key === "sole-proprietor");
  assert.equal(block?.accounts.find((a) => a.code === "150-CAP")?.special, "retained_earnings");
  assert.equal(block?.accounts.find((a) => a.code === "100-CAP")?.special, undefined);
  assert.equal(block?.accounts.find((a) => a.code === "160-DRW")?.special, undefined);
  // Names must be distinguishable on screen: two accounts both reading "capital account"
  // with nothing to tell them apart is how a contribution lands in the accumulated line.
  const names = block?.accounts.map((a) => a.name) ?? [];
  assert.equal(new Set(names).size, names.length, "the three names are distinct");
});

// --- the pre-apply special-marker guard (F2) -------------------------------------------

const row = (code: string, name: string, special: string | null, active = true): AccountRow => ({
  account_code: code, name, account_type: "equity", account_class: null, special_acc_type: special, is_active: active,
});

test("specialMarkerConflicts is silent when the marker is absent, or sits on the SAME code", () => {
  const soleProp = templateAccounts(toggleBlockKey(defaultSelectedBlockKeys(), "sole-proprietor"));
  assert.deepEqual(specialMarkerConflicts(soleProp, []), [], "a fresh client has nothing to collide with");
  assert.deepEqual(
    specialMarkerConflicts(soleProp, [row("150-CAP", "Proprietor's capital account — accumulated", "retained_earnings")]),
    [],
    "re-applying the SAME selection is an ordinary upsert of the same row, not a conflict",
  );
  assert.deepEqual(
    specialMarkerConflicts(soleProp, [row("150-000", "Retained earnings", null)]),
    [],
    "an account with the marker CLEARED no longer blocks — this is the documented remedy",
  );
});

test("specialMarkerConflicts catches the real path: a company-seeded client switched to the sole-proprietorship shape", () => {
  const soleProp = templateAccounts(toggleBlockKey(defaultSelectedBlockKeys(), "sole-proprietor"));
  const existing = [row("150-000", "Retained earnings", "retained_earnings"), row("190-OBE", "Opening balance equity (system clearing)", "opening_balance_equity")];
  const found = specialMarkerConflicts(soleProp, existing);
  assert.equal(found.length, 1, "only the retained-earnings slot collides — OBE is the same code in both shapes");
  assert.deepEqual(found[0], {
    marker: "retained_earnings",
    wantedCode: "150-CAP",
    wantedName: "Proprietor's capital account — accumulated",
    existingCode: "150-000",
    existingName: "Retained earnings",
    existingActive: true,
  });
});

test("specialMarkerConflicts still refuses when the offending account is INACTIVE — uq_coa_special has no is_active predicate", () => {
  // Verified on a throwaway PG17 rig against the deployed clara.upsert_account: deactivating
  // 150-000 does NOT free the slot, while the carry-down (which only reads active accounts)
  // then refuses with CLR31. Deactivating is a trap, so the guard must not treat it as a fix.
  const soleProp = templateAccounts(toggleBlockKey(defaultSelectedBlockKeys(), "sole-proprietor"));
  const found = specialMarkerConflicts(soleProp, [row("150-000", "Retained earnings", "retained_earnings", false)]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.existingActive, false);
});

test("markerConflictRefusal names the ACTUAL blocking account, the remedy, and the deactivation trap", () => {
  // The DB cannot do this: clara.upsert_account maps every unique_violation to "a rounding
  // account already exists for this client" (0009, deployed), so a retained-earnings
  // collision is reported as a rounding one. Rig-confirmed verbatim.
  const msg = markerConflictRefusal([{
    marker: "retained_earnings",
    wantedCode: "150-CAP", wantedName: "Proprietor's capital account — accumulated",
    existingCode: "150-000", existingName: "Retained earnings", existingActive: true,
  }]);
  assert.match(msg, /nothing was written/i, "the refusal states that no write happened");
  assert.match(msg, /150-000/, "it names the account actually holding the marker");
  assert.match(msg, /Retained earnings/, "…by name, not just by code");
  assert.match(msg, /150-CAP/, "and the account the selection wanted to put it on");
  assert.match(msg, /blank/i, "it gives the remedy: re-save that code with the special field blank");
  assert.match(msg, /Deactivating.*does NOT work/s, "and says outright that deactivating is not the fix");
  assert.match(msg, /Retrying would not help/i, "and that a retry reproduces it rather than clearing it");
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
