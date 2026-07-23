// Pure carry-down model tests (LANE D3). The node:test + tsx rig (no jsdom). These pin
// the DB-payload builders (the exact shapes the 0017 writers expect), the AMB-3 revision
// map, the ceremony verb pick, the dry-run view-model (tone read off DB deltas, never
// recomputed), and the governed-refusal copy — all with DB-free fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDryRun, deltaTone, deltaUnavailable, obeIsNil, dryRunTies, dryRunVerdict, dryRunSummary,
  buildRevisionMap, ceremonyKind, ceremonyIsMixed, compoundAckSentence,
  refusalLabel, refusalHint,
  type OpeningDryRun, type ApprovalSetEntry,
} from "./openingModel";
import {
  parseCents, buildKeyedTargetLine, buildGlLikeItem, buildSubledgerItem,
  buildSignedEquityItem, buildFixedAssetEnvelope, equityNetSignNote, obePlugSignNote,
} from "./openingPayloads";

// --- parseCents (the safe-integer guard the WA hard gate demands) ----------------

test("parseCents accepts whole strings/ints, rejects junk and unsafe values", () => {
  assert.equal(parseCents("100"), 100);
  assert.equal(parseCents("-250"), -250);
  assert.equal(parseCents(4200), 4200);
  assert.equal(parseCents("1.5"), null);
  assert.equal(parseCents("abc"), null);
  assert.equal(parseCents(""), null);
  assert.equal(parseCents(1.5), null);
  assert.equal(parseCents("99999999999999999999"), null, "beyond safe integer → null, never a wrong amount");
});

// --- keyed target line (record_opening_target, keyed lane) -----------------------

test("buildKeyedTargetLine puts the amount on the chosen side, keeps account/label optional", () => {
  const r = buildKeyedTargetLine({ lineKey: "cash", side: "debit", amountCents: "5000", accountCode: "1000", sourceLabel: "Cash at bank" });
  assert.ok(r.ok && r.payload.line_key === "cash");
  assert.ok(r.ok && r.payload.debit_cents === 5000 && r.payload.credit_cents === 0);
  assert.ok(r.ok && r.payload.account_code === "1000" && r.payload.source_label === "Cash at bank");
  const cr = buildKeyedTargetLine({ lineKey: "loan", side: "credit", amountCents: "9000" });
  assert.ok(cr.ok && cr.payload.credit_cents === 9000 && cr.payload.debit_cents === 0);
  assert.ok(cr.ok && !("account_code" in cr.payload), "no account code key when blank");
});

test("buildKeyedTargetLine rejects a missing key or a non-positive amount", () => {
  assert.equal(buildKeyedTargetLine({ lineKey: "  ", side: "debit", amountCents: "10" }).ok, false);
  assert.equal(buildKeyedTargetLine({ lineKey: "x", side: "debit", amountCents: "0" }).ok, false);
  assert.equal(buildKeyedTargetLine({ lineKey: "x", side: "debit", amountCents: "-1" }).ok, false);
});

// --- gl_balance / bank_uncleared (p_lines lane; DB appends the OBE contra) --------

test("buildGlLikeItem builds item + legs; the UI never adds the OBE/RE contra", () => {
  const r = buildGlLikeItem({ kind: "gl_balance", itemKey: "inventory", legs: [{ accountCode: "1300", side: "debit", amountCents: "120000" }] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payload.item.item_kind, "gl_balance");
    assert.equal(r.payload.item.item_key, "inventory");
    assert.deepEqual(r.payload.lines, [{ account_code: "1300", debit_cents: 120000, credit_cents: 0 }]);
  }
});

test("bank_uncleared requires ref + instrument date (WB-R12)", () => {
  const missing = buildGlLikeItem({ kind: "bank_uncleared", itemKey: "chq-1", legs: [{ accountCode: "1000", side: "credit", amountCents: "500" }] });
  assert.equal(missing.ok, false);
  const ok = buildGlLikeItem({ kind: "bank_uncleared", itemKey: "chq-1", itemRef: "CHQ-001", itemDate: "2026-06-30", legs: [{ accountCode: "1000", side: "credit", amountCents: "500" }] });
  assert.ok(ok.ok && ok.payload.item.item_ref === "CHQ-001" && ok.payload.item.item_date === "2026-06-30");
});

test("buildGlLikeItem rejects an empty legs list or a bad leg amount", () => {
  assert.equal(buildGlLikeItem({ kind: "gl_balance", itemKey: "x", legs: [] }).ok, false);
  assert.equal(buildGlLikeItem({ kind: "gl_balance", itemKey: "x", legs: [{ accountCode: "1", side: "debit", amountCents: "0" }] }).ok, false);
  assert.equal(buildGlLikeItem({ kind: "gl_balance", itemKey: "x", legs: [{ accountCode: "", side: "debit", amountCents: "5" }] }).ok, false);
});

// --- ar/ap subledger + SST all-or-none (WB-R11) ----------------------------------

test("buildSubledgerItem sets amount + counterparty, lines null", () => {
  const r = buildSubledgerItem({ kind: "ar_open_item", itemKey: "inv-9", amountCents: "35000", counterpartyId: "cp-1", itemRef: "INV-9" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payload.item.amount_cents, 35000);
    assert.equal(r.payload.item.counterparty_id, "cp-1");
    assert.equal(r.payload.item.item_ref, "INV-9");
    assert.equal(r.payload.lines, null);
    assert.ok(!("sst_portion_cents" in r.payload.item), "no SST keys when none supplied");
  }
});

test("SST facts are all-or-none: all three fill, or a partial set is refused", () => {
  const partial = buildSubledgerItem({ kind: "ar_open_item", itemKey: "i", amountCents: "100", counterpartyId: "cp", sstPortionCents: "6" });
  assert.equal(partial.ok, false, "portion without rate+basis is refused");
  const all = buildSubledgerItem({ kind: "ap_open_item", itemKey: "i", amountCents: "10600", counterpartyId: "cp", sstPortionCents: "600", sstRateBp: "600", sstBasis: "service tax 6%" });
  assert.ok(all.ok);
  if (all.ok) {
    assert.equal(all.payload.item.sst_portion_cents, 600);
    assert.equal(all.payload.item.sst_rate_bp, 600);
    assert.equal(all.payload.item.sst_basis, "service tax 6%");
  }
});

test("buildSubledgerItem refuses a missing counterparty or non-positive amount", () => {
  assert.equal(buildSubledgerItem({ kind: "ar_open_item", itemKey: "i", amountCents: "100", counterpartyId: " " }).ok, false);
  assert.equal(buildSubledgerItem({ kind: "ar_open_item", itemKey: "i", amountCents: "0", counterpartyId: "cp" }).ok, false);
});

// --- equity_net / obe_plug signed (AMB-5) ----------------------------------------

test("buildSignedEquityItem carries a signed non-zero amount, lines null", () => {
  const pos = buildSignedEquityItem({ kind: "equity_net", itemKey: "re", amountCents: "6574797" });
  assert.ok(pos.ok && pos.payload.item.amount_cents === 6574797 && pos.payload.lines === null);
  const neg = buildSignedEquityItem({ kind: "obe_plug", itemKey: "plug", amountCents: "-1200" });
  assert.ok(neg.ok && neg.payload.item.amount_cents === -1200);
  assert.equal(buildSignedEquityItem({ kind: "equity_net", itemKey: "re", amountCents: "0" }).ok, false, "zero is refused");
});

test("AMB-5 sign notes describe the balance-sheet polarity, blank at zero/null", () => {
  assert.match(equityNetSignNote(500), /credit to retained earnings/);
  assert.match(equityNetSignNote(-500), /debit to retained earnings/);
  assert.equal(equityNetSignNote(0), "");
  assert.equal(equityNetSignNote(null), "");
  assert.match(obePlugSignNote(500), /credit to opening-balance-equity/);
  assert.match(obePlugSignNote(-500), /debit to opening-balance-equity/);
});

// --- fixed asset envelope (K8); FORK-7 method left to the DB -----------------------

test("buildFixedAssetEnvelope assembles a books-grade baseline, defaulting straight_line", () => {
  const r = buildFixedAssetEnvelope({
    itemKey: "fa-1", description: "Laptop", acquiredDate: "2025-01-10", costCents: "500000",
    accumulatedDepreciationCents: "100000", residualCents: "0", usefulLifeMonths: "36",
    depreciationStartDate: "2025-02-01", assetAccountCode: "1500", accumDeprAccountCode: "1590", deprExpenseAccountCode: "6500",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payload.cost_cents, 500000);
    assert.equal(r.payload.accumulated_depreciation_cents, 100000);
    assert.equal(r.payload.depreciation_method, "straight_line");
  }
});

test("a non-straight-line method passes through untouched — the DB owns the FORK-7 refusal", () => {
  const r = buildFixedAssetEnvelope({
    itemKey: "fa-2", description: "Truck", acquiredDate: "2025-01-10", costCents: "5000000",
    usefulLifeMonths: "60", depreciationStartDate: "2025-02-01", assetAccountCode: "1500",
    accumDeprAccountCode: "1590", deprExpenseAccountCode: "6500", depreciationMethod: "reducing_balance",
  });
  assert.ok(r.ok && r.payload.depreciation_method === "reducing_balance", "the UI never pre-empts the DB refusal");
});

test("buildFixedAssetEnvelope refuses an incomplete baseline", () => {
  assert.equal(buildFixedAssetEnvelope({ itemKey: "", description: "x", acquiredDate: "2025-01-01", costCents: "1", usefulLifeMonths: "1", depreciationStartDate: "2025-01-01", assetAccountCode: "1", accumDeprAccountCode: "2", deprExpenseAccountCode: "3" }).ok, false);
  assert.equal(buildFixedAssetEnvelope({ itemKey: "k", description: "x", acquiredDate: "2025-01-01", costCents: "0", usefulLifeMonths: "1", depreciationStartDate: "2025-01-01", assetAccountCode: "1", accumDeprAccountCode: "2", deprExpenseAccountCode: "3" }).ok, false);
  assert.equal(buildFixedAssetEnvelope({ itemKey: "k", description: "x", acquiredDate: "2025-01-01", costCents: "100", usefulLifeMonths: "1", depreciationStartDate: "2025-01-01", assetAccountCode: "", accumDeprAccountCode: "2", deprExpenseAccountCode: "3" }).ok, false);
});

// --- AMB-3 revision map + ceremony verb -------------------------------------------

function mkEntry(p: Partial<ApprovalSetEntry>): ApprovalSetEntry {
  return { entry_id: "e1", revision_token: "r1", maker: "u1", posting_date: "2026-06-30", memo: null, is_reversal: false, item_kind: "gl_balance", item_key: "k1", supersedes_item_id: null, ...p };
}

test("buildRevisionMap maps every draft entry id → its DB revision token (AMB-3)", () => {
  const map = buildRevisionMap([mkEntry({ entry_id: "a", revision_token: "ra" }), mkEntry({ entry_id: "b", revision_token: "rb" })]);
  assert.deepEqual(map, { a: "ra", b: "rb" });
});

test("ceremonyKind: open plain drafts → initial; a reversal/supersede → correction; else null", () => {
  assert.equal(ceremonyKind("open", [mkEntry({})]), "initial");
  assert.equal(ceremonyKind("open", [mkEntry({ is_reversal: true, item_kind: null, item_key: null })]), "correction");
  assert.equal(ceremonyKind("open", [mkEntry({ supersedes_item_id: "old" })]), "correction");
  assert.equal(ceremonyKind("finalized", [mkEntry({})]), null, "a finalized seed is not approvable");
  assert.equal(ceremonyKind("open", []), null, "no drafts → nothing to approve");
});

test("ceremonyIsMixed flags a set carrying both correction and plain additive entries", () => {
  assert.equal(ceremonyIsMixed([mkEntry({ entry_id: "a" }), mkEntry({ entry_id: "b", is_reversal: true })]), true);
  assert.equal(ceremonyIsMixed([mkEntry({ entry_id: "a" }), mkEntry({ entry_id: "b" })]), false);
  assert.equal(ceremonyIsMixed([mkEntry({ entry_id: "a", is_reversal: true })]), false);
});

test("compoundAckSentence is ONE sentence citing OBE, entry count, as-of + the one-txn frame", () => {
  const s = compoundAckSentence(3, "2026-06-30", "RM 0.00", "initial");
  assert.match(s, /opening-balance-equity nets RM 0\.00/);
  assert.match(s, /3 draft entries/);
  assert.match(s, /ONE transaction/);
  assert.match(s, /as at 2026-06-30/);
  assert.match(s, /opening carry-down/);
  assert.match(compoundAckSentence(1, "2026-06-30", "RM 0.00", "correction"), /1 draft entry.*opening correction/s);
});

// --- dry-run view-model (tone read off DB deltas) ---------------------------------

function mkDry(p: Partial<OpeningDryRun>): OpeningDryRun {
  return {
    seed_id: "s1", client_id: "c1", as_of: "2026-06-30", state: "open", obe_net_cents: 0,
    deltas: [{ account_code: "1000", target_debit: 5000, target_credit: 0, actual_debit: 5000, actual_credit: 0, delta_debit: 0, delta_credit: 0 }],
    unmapped_labels: [], missing_must_asks: [], ...p,
  };
}

test("toDryRun narrows the DB envelope, degrading unknown shapes without crashing", () => {
  assert.equal(toDryRun(null), null);
  assert.equal(toDryRun({ client_id: "c" }), null, "no seed_id → null");
  const d = toDryRun({ seed_id: "s", client_id: "c", as_of: "2026-06-30", state: "open", obe_net_cents: 0, deltas: [{ account_code: "1000", delta_debit: 0, delta_credit: 0 }], unmapped_labels: [], missing_must_asks: [] });
  assert.ok(d && d.deltas.length === 1, "one delta row parsed");
  // F-H6: an absent amount stays NULL — the DB owns the figure, we never coerce it to 0
  // (a fabricated 0 would fake a tie/off verdict over data the DB did not return).
  assert.equal(d!.deltas[0]?.target_debit, null, "missing numeric fields stay null, never coerced to 0");
  assert.equal(deltaUnavailable(d!.deltas[0]!), true, "a partial row is unavailable, not a fake tie");
});

test("F-H6: dryRunVerdict withholds the tie verdict when any row is unavailable", () => {
  assert.equal(dryRunVerdict(mkDry({})), "ties", "a fully-available tied set ties");
  const withNull = mkDry({
    deltas: [{ account_code: "1000", target_debit: null, target_credit: 0, actual_debit: 0, actual_credit: 0, delta_debit: 0, delta_credit: 0 }],
  });
  assert.equal(deltaTone(withNull.deltas[0]!), "unavailable", "a null amount makes the line unavailable");
  assert.equal(dryRunVerdict(withNull), "unavailable", "the verdict is withheld, not 'ties'/'off'");
  assert.equal(dryRunTies(withNull), false, "an unavailable line can never tie");
  assert.equal(dryRunSummary(withNull).unavailableCount, 1, "the summary counts the unavailable line");
});

test("deltaTone ties iff both DB deltas are zero; obeIsNil reads the DB net", () => {
  assert.equal(deltaTone({ account_code: "x", target_debit: 0, target_credit: 0, actual_debit: 0, actual_credit: 0, delta_debit: 0, delta_credit: 0 }), "tied");
  assert.equal(deltaTone({ account_code: "x", target_debit: 0, target_credit: 0, actual_debit: 0, actual_credit: 0, delta_debit: 100, delta_credit: 0 }), "off");
  assert.equal(obeIsNil(mkDry({ obe_net_cents: 0 })), true);
  assert.equal(obeIsNil(mkDry({ obe_net_cents: 5 })), false);
  assert.equal(obeIsNil(mkDry({ obe_net_cents: null })), false);
});

test("dryRunTies requires every line tied, no unmapped labels, and OBE nil", () => {
  assert.equal(dryRunTies(mkDry({})), true);
  assert.equal(dryRunTies(mkDry({ obe_net_cents: 12 })), false);
  assert.equal(dryRunTies(mkDry({ unmapped_labels: [{ line_key: "z", source_label: "Zed" }] })), false);
  assert.equal(dryRunTies(mkDry({ deltas: [{ account_code: "1000", target_debit: 5000, target_credit: 0, actual_debit: 4000, actual_credit: 0, delta_debit: -1000, delta_credit: 0 }] })), false);
  assert.equal(dryRunTies(mkDry({ deltas: [] })), false, "no lines cannot tie");
});

test("dryRunSummary counts off-lines, unmapped, missing must-asks, and the overall tie", () => {
  const s = dryRunSummary(mkDry({
    deltas: [
      { account_code: "1000", target_debit: 5000, target_credit: 0, actual_debit: 5000, actual_credit: 0, delta_debit: 0, delta_credit: 0 },
      { account_code: "2000", target_debit: 0, target_credit: 3000, actual_debit: 0, actual_credit: 2000, delta_debit: 0, delta_credit: -1000 },
    ],
    unmapped_labels: [{ line_key: "z", source_label: "Zed" }],
    missing_must_asks: [{ item_key: "m", question: "?" }],
  }));
  assert.equal(s.lineCount, 2);
  assert.equal(s.offLineCount, 1);
  assert.equal(s.unmappedCount, 1);
  assert.equal(s.missingMustAskCount, 1);
  assert.equal(s.ties, false);
});

// --- governed refusal copy --------------------------------------------------------

test("refusalLabel renders CLR code + reason verbatim", () => {
  assert.equal(refusalLabel({ code: "CLR31", reason: "tie_mismatch" }), "CLR31 · tie_mismatch");
  assert.equal(refusalLabel({ code: "CLR11", reason: null }), "CLR11");
});

test("refusalHint explains the opening-family reason tokens, silent on generic codes", () => {
  assert.match(refusalHint("CLR31", "not_serializable"), /serializable/);
  assert.match(refusalHint("CLR05", "self_attestation"), /attestation is required/);
  assert.match(refusalHint("CLR05", "distinct_checker"), /different professional/);
  assert.match(refusalHint("CLR31", "depreciation_method_unsupported"), /straight-line/);
  assert.match(refusalHint("CLR31", "parsed_target_writer_required"), /parse action/);
  assert.equal(refusalHint("CLR04", null), "", "a generic authorization refusal carries no synthetic hint");
  assert.equal(refusalHint("CLR03", null), "Human bookkeeper+ only.");
});
