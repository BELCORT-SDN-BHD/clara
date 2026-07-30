// bank/model.ts + bank/matchModel.ts pure-logic tests (no DOM, no DB — the
// queue/model.test.ts house style). Covers the defensive mappers, statement
// grouping, the bank_statement_tie banner state, line match labels, the matching
// workspace's selection/group-tie preview, the period-exception detector, the
// settlement-domain law (§4.6), and the refusal-copy lookup.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBankAccount, toBankStatement, toBankStatementLine, toOpenItem, toMatchCandidateEntry,
  groupStatementsByAccount, tieBannerState, tieVarianceCents, lineMatchLabel,
  type BankAccountRow, type BankStatementRow,
} from "./model";
import {
  toggleInSet, upsertEntryAllocation, removeEntryAllocation, matchGroupTiePreview,
  entryIsPeriodException, anyPeriodException, settlementDomainFor, describeBankRefusal,
  bankScreenState, REFUND_WORKAROUND_MESSAGE, isEligibleBankCoaAccount, isEligibleAdjustmentCoaAccount,
} from "./matchModel";

// --- defensive mappers ---------------------------------------------------------

test("toBankAccount degrades a missing bank_name_display to bank_name, never throws", () => {
  const a = toBankAccount({ id: "a1", bank_code: "MBB", bank_name: "Maybank", account_number: "1-2-3", coa_account_code: "601-000" });
  assert.equal(a.bank_name_display, "Maybank");
  assert.equal(a.active, true, "active defaults true when the read omits it");
});

test("toBankAccount on garbage input degrades to a safe empty row, never throws", () => {
  const a = toBankAccount("nope");
  assert.equal(a.id, "");
  assert.equal(a.bank_name_display, "");
});

test("toBankStatement reads the nested tie block or top-level fallback keys", () => {
  const nested = toBankStatement({ id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 100, closing_cents: 200, tie: { gl_balance_cents: 150, unmatched_cents: 50 } });
  assert.equal(nested.tie.gl_balance_cents, 150);
  const flat = toBankStatement({ id: "s2", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: 0, gl_balance_cents: 10, unmatched_cents: -10 });
  assert.equal(flat.tie.gl_balance_cents, 10);
  assert.equal(flat.tie.unmatched_cents, -10);
});

test("toBankStatementLine collapses an unrecognised match_state to 'unmatched' (fail-closed display)", () => {
  const l = toBankStatementLine({ id: "l1", statement_id: "s1", line_no: 1, entry_date: "2026-04-05", amount_cents: -500, match_state: "bogus" });
  assert.equal(l.match_state, "unmatched");
  const live = toBankStatementLine({ id: "l2", statement_id: "s1", line_no: 2, entry_date: "2026-04-06", amount_cents: 500, match_state: "live" });
  assert.equal(live.match_state, "live");
});

test("toOpenItem defaults an unrecognised domain to 'ar' (never 'ap' by accident)", () => {
  const i = toOpenItem({ id: "i1", counterparty_id: "cp1", item_kind: "invoice", item_date: "2026-04-01", amount_cents: 10000, entry_id: "e1", domain: "ap" });
  assert.equal(i.domain, "ap");
  const j = toOpenItem({ id: "i2", counterparty_id: "cp1", item_kind: "invoice", item_date: "2026-04-01", amount_cents: 10000, entry_id: "e1" });
  assert.equal(j.domain, "ar");
});

test("toMatchCandidateEntry falls back entry_id to id", () => {
  const e = toMatchCandidateEntry({ id: "e9", posting_date: "2026-04-10", debit_remaining_cents: 500 });
  assert.equal(e.entry_id, "e9");
  assert.equal(e.debit_remaining_cents, 500);
  assert.equal(e.credit_remaining_cents, null);
});

// --- statement grouping ---------------------------------------------------------

function mkAccount(p: Partial<BankAccountRow>): BankAccountRow {
  return {
    id: "acc1", bank_code: "MBB", bank_name: "Maybank", bank_name_display: "Maybank current",
    account_number: "1-2-3", account_number_normalized: "123", coa_account_code: "601-000",
    coa_account_name: "Bank — Maybank", active: true, created_at: null, deactivated_at: null,
    deactivated_reason: null, ...p,
  };
}
function mkStatement(p: Partial<BankStatementRow>): BankStatementRow {
  return {
    id: "s1", bank_account_id: "acc1", document_id: null, period_start: "2026-04-01",
    period_end: "2026-04-30", statement_date: null, opening_cents: 0, closing_cents: 0,
    total_debit_cents: null, total_credit_cents: null, line_count: 0, status: "live",
    ingest_mode: "ocr", superseded_by: null, voided_by: null, voided_at: null, voided_reason: null,
    created_at: null, tie: { gl_balance_cents: null, unmatched_cents: null }, ...p,
  };
}

test("groupStatementsByAccount sorts active accounts first, then statements newest-period-first", () => {
  const accounts = [mkAccount({ id: "a-inactive", active: false, bank_name_display: "Old" }), mkAccount({ id: "a-active", active: true, bank_name_display: "Current" })];
  const statements = [
    mkStatement({ id: "s-apr", bank_account_id: "a-active", period_end: "2026-04-30" }),
    mkStatement({ id: "s-may", bank_account_id: "a-active", period_end: "2026-05-31" }),
  ];
  const groups = groupStatementsByAccount(accounts, statements);
  assert.deepEqual(groups.map((g) => g.account.id), ["a-active", "a-inactive"]);
  assert.deepEqual(groups[0]?.statements.map((s) => s.id), ["s-may", "s-apr"]);
  assert.deepEqual(groups[1]?.statements, [], "an account with zero statements still gets an (empty) group");
});

// --- the bank_statement_tie banner (cheap read half — NOT reconciliation) ------

test("tieBannerState is 'unavailable' until both tie figures are present", () => {
  assert.equal(tieBannerState(mkStatement({ closing_cents: 100 })), "unavailable");
});
test("tieBannerState is 'tied' exactly when gl_balance + unmatched == closing", () => {
  const st = mkStatement({ closing_cents: 1000, tie: { gl_balance_cents: 700, unmatched_cents: 300 } });
  assert.equal(tieBannerState(st), "tied");
  assert.equal(tieVarianceCents(st), 0);
});
test("tieBannerState is 'variance' when the identity does not hold, with a signed variance", () => {
  const st = mkStatement({ closing_cents: 1000, tie: { gl_balance_cents: 700, unmatched_cents: 200 } });
  assert.equal(tieBannerState(st), "variance");
  assert.equal(tieVarianceCents(st), 100);
});

test("lineMatchLabel labels all three states", () => {
  assert.equal(lineMatchLabel("unmatched"), "unmatched");
  assert.equal(lineMatchLabel("pending"), "pending checker");
  assert.equal(lineMatchLabel("live"), "matched");
});

// --- COA picker predicates (design §4.1/§4.6) -----------------------------------

test("isEligibleBankCoaAccount demands active, asset-typed, non-control", () => {
  assert.equal(isEligibleBankCoaAccount({ account_code: "601-000", name: "Bank", account_type: "asset", account_class: null, is_active: true }), true);
  assert.equal(isEligibleBankCoaAccount({ account_code: "300-000", name: "AR", account_type: "asset", account_class: "receivable", is_active: true }), false, "control-class refused");
  assert.equal(isEligibleBankCoaAccount({ account_code: "601-000", name: "Bank", account_type: "asset", account_class: null, is_active: false }), false, "inactive refused");
});
test("isEligibleAdjustmentCoaAccount demands active, non-control, expense-or-income", () => {
  assert.equal(isEligibleAdjustmentCoaAccount({ account_code: "700-000", name: "Bank charges", account_type: "expense", account_class: null, is_active: true }), true);
  assert.equal(isEligibleAdjustmentCoaAccount({ account_code: "601-000", name: "Bank", account_type: "asset", account_class: null, is_active: true }), false);
});

// --- matchModel: selection + group-tie preview ----------------------------------

test("toggleInSet adds then removes", () => {
  let s = toggleInSet(new Set<string>(), "l1");
  assert.deepEqual([...s], ["l1"]);
  s = toggleInSet(s, "l1");
  assert.deepEqual([...s], []);
});

test("upsertEntryAllocation inserts, updates, and a zero amount removes the row", () => {
  let list = upsertEntryAllocation([], "e1", 500);
  assert.deepEqual(list, [{ entry_id: "e1", matched_cents: 500 }]);
  list = upsertEntryAllocation(list, "e1", 800);
  assert.deepEqual(list, [{ entry_id: "e1", matched_cents: 800 }]);
  list = upsertEntryAllocation(list, "e1", 0);
  assert.deepEqual(list, []);
});
test("removeEntryAllocation drops exactly the named entry", () => {
  const list = [{ entry_id: "e1", matched_cents: 100 }, { entry_id: "e2", matched_cents: 200 }];
  assert.deepEqual(removeEntryAllocation(list, "e1"), [{ entry_id: "e2", matched_cents: 200 }]);
});

test("matchGroupTiePreview ties exactly when line sum == entry sum + adjustment sum", () => {
  const lines = [toBankStatementLine({ id: "l1", amount_cents: -1000 }), toBankStatementLine({ id: "l2", amount_cents: -500 })];
  const entries = [{ entry_id: "e1", matched_cents: -1200 }];
  const adjustments = [{ account_code: "700-000", amount_cents: -300 }];
  const preview = matchGroupTiePreview(lines, entries, adjustments);
  assert.equal(preview.lineSum, -1500);
  assert.equal(preview.entrySum, -1200);
  assert.equal(preview.adjustmentSum, -300);
  assert.equal(preview.diffCents, 0);
  assert.equal(preview.ties, true);
});
test("matchGroupTiePreview reports a non-zero diff when it does not tie", () => {
  const lines = [toBankStatementLine({ id: "l1", amount_cents: -1000 })];
  const preview = matchGroupTiePreview(lines, [{ entry_id: "e1", matched_cents: -900 }], []);
  assert.equal(preview.diffCents, -100);
  assert.equal(preview.ties, false);
});

// --- period-exception detector (design §4.6 wrong_period ack) -------------------

test("entryIsPeriodException is true only when posting_date is strictly after period_end", () => {
  assert.equal(entryIsPeriodException("2026-05-02", "2026-04-30"), true);
  assert.equal(entryIsPeriodException("2026-04-30", "2026-04-30"), false);
  assert.equal(entryIsPeriodException(null, "2026-04-30"), false);
});
test("anyPeriodException scans only the SELECTED entries", () => {
  const entries = [toMatchCandidateEntry({ entry_id: "e1", posting_date: "2026-05-05" }), toMatchCandidateEntry({ entry_id: "e2", posting_date: "2026-04-10" })];
  assert.equal(anyPeriodException(entries, ["e2"], "2026-04-30"), false);
  assert.equal(anyPeriodException(entries, ["e1", "e2"], "2026-04-30"), true);
});

// --- settlement domain law (design §4.6: from counterparty KIND, never the sign) -

test("settlementDomainFor: customer+inflow -> receipt, vendor+outflow -> payment", () => {
  assert.equal(settlementDomainFor("customer", 10000), "receipt");
  assert.equal(settlementDomainFor("vendor", -10000), "payment");
});
test("settlementDomainFor: the two refund quadrants both refuse", () => {
  assert.equal(settlementDomainFor("customer", -10000), "refund_not_supported");
  assert.equal(settlementDomainFor("vendor", 10000), "refund_not_supported");
});

// --- refusal copy + screen state --------------------------------------------------

test("describeBankRefusal glosses named tokens and degrades unnamed ones to null", () => {
  assert.equal(describeBankRefusal("chain_broken"), "opening + Σ(line amounts) ≠ closing for this statement.");
  assert.equal(describeBankRefusal("refund_not_supported"), REFUND_WORKAROUND_MESSAGE);
  assert.equal(describeBankRefusal("some_future_code_not_yet_named"), null);
  assert.equal(describeBankRefusal(null), null);
});

test("bankScreenState: loading/error/empty/ideal", () => {
  assert.equal(bankScreenState({ loading: true, error: false, totalRows: 0 }), "loading");
  assert.equal(bankScreenState({ loading: false, error: true, totalRows: 0 }), "error");
  assert.equal(bankScreenState({ loading: false, error: false, totalRows: 0 }), "empty");
  assert.equal(bankScreenState({ loading: false, error: false, totalRows: 3 }), "ideal");
  assert.equal(bankScreenState({ loading: false, error: true, totalRows: 3 }), "ideal", "rows already shown stay row-driven");
});
