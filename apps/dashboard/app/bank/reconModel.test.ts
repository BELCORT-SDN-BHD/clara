// reconModel.ts pure-logic tests (no DOM, no DB — the bank/model.test.ts house
// style). Covers the defensive mappers, the tie-state fail-closed law, the
// stale-ack gating, the void-unwind composition, and the rule/exception
// label helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBankReconciliationView, reconTieState, outstandingStaleUnacked, canCompleteReconciliation,
  deriveVoidUnwindCount, toBankLineException, exceptionDispositionLabel, exceptionKindLabel,
  toBankRule, bankRuleProposalLabel, candidateMeetsEvidenceFloor, toUnmatchedLine,
  type BankReconciliationView, type ReconTermSet,
} from "./reconModel";

function mkTerms(p: Partial<ReconTermSet> = {}): ReconTermSet {
  return {
    opening_anchor_cents: 0, gl_prime_cents: 100000, uncleared_total_cents: -5000,
    unmatched_capacity_prime_cents: 2000, excepted_cents: 0,
    computed_closing_cents: 97000, statement_closing_cents: 97000, difference_cents: 0,
    ...p,
  };
}

function mkView(p: Partial<BankReconciliationView> = {}): BankReconciliationView {
  return {
    mode: "preview", recon_id: null, statement_id: "stmt-1", bank_account_id: "acc-1",
    coa_account_code: "601-000", prior_statement_id: null, prior_reconciliation_id: null,
    first_period_exemption: true, period_start: "2026-04-01", period_end: "2026-04-30",
    status: "open", terms: mkTerms(), snapshot: { outstanding_entries: [], outstanding_lines: [], exceptions: [], opening_lineage: [] },
    stale_outstanding_ids: [], precondition_met: true, chain_ok: true,
    completed_by: null, completed_at: null, voided_by: null, voided_at: null, voided_reason: null,
    ...p,
  };
}

// --- toBankReconciliationView mode inference + defensive mapping ---------------

test("toBankReconciliationView infers 'receipt' mode from a complete/void status, 'preview' otherwise", () => {
  const complete = toBankReconciliationView({ statement_id: "s1", status: "complete", recon_id: "r1" });
  assert.equal(complete.mode, "receipt");
  const voided = toBankReconciliationView({ statement_id: "s1", status: "void", recon_id: "r1" });
  assert.equal(voided.mode, "receipt");
  const openish = toBankReconciliationView({ statement_id: "s1", status: "open" });
  assert.equal(openish.mode, "preview");
  const absent = toBankReconciliationView({ statement_id: "s1" });
  assert.equal(absent.mode, "preview");
  assert.equal(absent.status, "open");
});

test("toBankReconciliationView degrades garbage input to a safe empty preview, never throws", () => {
  const v = toBankReconciliationView("nope");
  assert.equal(v.statement_id, "");
  assert.equal(v.mode, "preview");
  assert.deepEqual(v.stale_outstanding_ids, []);
  assert.equal(v.terms.difference_cents, null);
});

// --- reconTieState: renders DB terms verbatim, fails closed on an unknown/
//     incomplete shape (never a fake "tied") ------------------------------------

test("reconTieState: a zero difference across a full term set reads 'tied'", () => {
  assert.equal(reconTieState({ terms: mkTerms({ difference_cents: 0 }) }), "tied");
});

test("reconTieState: a nonzero difference reads 'variance', the DB's own number, not recomputed", () => {
  assert.equal(reconTieState({ terms: mkTerms({ difference_cents: 1234 }) }), "variance");
});

test("reconTieState: ANY missing term fails closed to 'unavailable', never a fake tie", () => {
  for (const key of Object.keys(mkTerms()) as (keyof ReconTermSet)[]) {
    const terms = mkTerms({ [key]: null });
    assert.equal(reconTieState({ terms }), "unavailable", `missing ${key} must read unavailable`);
  }
});

test("reconTieState: a non-finite/garbage term also fails closed", () => {
  const terms = mkTerms({ difference_cents: Number.NaN });
  assert.equal(reconTieState({ terms }), "unavailable");
});

// --- stale-outstanding ack gating -----------------------------------------------

test("outstandingStaleUnacked returns exactly the ids not yet in the acked set", () => {
  const view = mkView({ stale_outstanding_ids: ["a", "b", "c"] });
  assert.deepEqual(outstandingStaleUnacked(view, new Set(["b"])), ["a", "c"]);
  assert.deepEqual(outstandingStaleUnacked(view, new Set(["a", "b", "c"])), []);
});

test("canCompleteReconciliation gates on EVERY stale id being acknowledged by id", () => {
  const view = mkView({ stale_outstanding_ids: ["a", "b"] });
  assert.equal(canCompleteReconciliation(view, new Set()), false, "no acks yet");
  assert.equal(canCompleteReconciliation(view, new Set(["a"])), false, "one of two acked");
  assert.equal(canCompleteReconciliation(view, new Set(["a", "b"])), true, "both acked");
});

test("canCompleteReconciliation fails closed on status/precondition/chain — never a false 'true'", () => {
  const base = mkView({ stale_outstanding_ids: [] });
  assert.equal(canCompleteReconciliation({ ...base, status: "complete" }, new Set()), false, "not open");
  assert.equal(canCompleteReconciliation({ ...base, precondition_met: false }, new Set()), false, "unsettled lines");
  assert.equal(canCompleteReconciliation({ ...base, chain_ok: false }, new Set()), false, "period gap");
  // An UNREPORTED (null) precondition/chain does NOT enable the button either —
  // fail-closed on 'unavailable' (F-H6), only an explicit `true` enables it.
  assert.equal(canCompleteReconciliation({ ...base, precondition_met: null, chain_ok: null }, new Set()), false, "null must fail closed, not fail open");
  assert.equal(canCompleteReconciliation({ ...base, precondition_met: true, chain_ok: true }, new Set()), true, "explicit true on both enables it");
});

// --- void-unwind composition (design §3/§7) --------------------------------------

test("deriveVoidUnwindCount counts only LATER, LIVE, COMPLETE recons on the SAME account", () => {
  const target = { id: "s2", bank_account_id: "acc1", period_end: "2026-05-31", status: "live" };
  const statements = [
    { id: "s1", bank_account_id: "acc1", period_end: "2026-04-30", status: "live" }, // earlier — excluded
    target,
    { id: "s3", bank_account_id: "acc1", period_end: "2026-06-30", status: "live" }, // later, complete → counted
    { id: "s4", bank_account_id: "acc1", period_end: "2026-07-31", status: "live" }, // later, open → not counted
    { id: "s5", bank_account_id: "acc1", period_end: "2026-08-31", status: "void" }, // later but voided statement → excluded
    { id: "s6", bank_account_id: "acc2", period_end: "2026-06-30", status: "live" }, // different account → excluded
  ];
  const reconStatus = new Map<string, string>([["s3", "complete"], ["s4", "open"], ["s6", "complete"]]);
  assert.equal(deriveVoidUnwindCount(statements, target, reconStatus), 1);
});

test("deriveVoidUnwindCount is 0 when nothing later is complete", () => {
  const target = { id: "s1", bank_account_id: "acc1", period_end: "2026-04-30", status: "live" };
  const statements = [target, { id: "s2", bank_account_id: "acc1", period_end: "2026-05-31", status: "live" }];
  assert.equal(deriveVoidUnwindCount(statements, target, new Map()), 0);
});

// --- exceptions ------------------------------------------------------------------

test("toBankLineException maps and degrades defensively", () => {
  const e = toBankLineException({ id: "e1", line_id: "l1", kind: "disputed", reason: "under query", status: "open" });
  assert.equal(e.kind, "disputed");
  assert.equal(e.status, "open");
  const garbage = toBankLineException({});
  assert.equal(garbage.id, "");
  assert.equal(garbage.kind, "bank_error", "unrecognised kind degrades to the safe default");
});

test("exceptionDispositionLabel/exceptionKindLabel name every value and degrade unknowns to themselves", () => {
  assert.equal(exceptionDispositionLabel("matched_booking"), "matched to a booking");
  assert.equal(exceptionDispositionLabel("bank_corrective_line"), "bank corrective line (nets to a named pair)");
  assert.equal(exceptionDispositionLabel("written_off_adjustment"), "written off (adjustment entry)");
  assert.equal(exceptionDispositionLabel("something_else"), "something_else");
  assert.equal(exceptionKindLabel("bank_error"), "bank error");
  assert.equal(exceptionKindLabel("disputed"), "disputed");
});

// --- bank_rules --------------------------------------------------------------

test("toBankRule maps and defaults an unrecognised status to 'proposed'", () => {
  const r = toBankRule({ id: "r1", kind: "coding", status: "signed", proposal: { account_code: "620-000" } });
  assert.equal(r.status, "signed");
  const garbage = toBankRule({});
  assert.equal(garbage.status, "proposed");
});

test("bankRuleProposalLabel renders the match_settle vs coding shapes distinctly", () => {
  const settle = bankRuleProposalLabel({ kind: "match_settle", proposal: { domain: "ap", counterparty_name: "ACME Sdn Bhd" } });
  assert.match(settle, /match\/settle/);
  assert.match(settle, /AP/);
  assert.match(settle, /ACME/);
  const coding = bankRuleProposalLabel({ kind: "coding", proposal: { account_code: "620-000" } });
  assert.match(coding, /code/);
  assert.match(coding, /620-000/);
});

test("candidateMeetsEvidenceFloor is a PREVIEW of the ≥3 DB floor — never the authority", () => {
  assert.equal(candidateMeetsEvidenceFloor({ sighting_count: 2 }), false);
  assert.equal(candidateMeetsEvidenceFloor({ sighting_count: 3 }), true);
  assert.equal(candidateMeetsEvidenceFloor({ sighting_count: null }), false);
});

// --- list_unmatched_lines ---------------------------------------------------------

test("toUnmatchedLine falls back id to line_id, degrades garbage safely", () => {
  const u = toUnmatchedLine({ id: "u1", statement_id: "s1", amount_cents: -500 });
  assert.equal(u.line_id, "u1");
  assert.equal(u.amount_cents, -500);
  const garbage = toUnmatchedLine("nope");
  assert.equal(garbage.line_id, "");
});
