// reconModel.ts pure-logic tests (no DOM, no DB — the bank/model.test.ts house
// style). Covers the defensive mappers, the tie-state fail-closed law, the
// stale-ack gating, the void-unwind composition, and the exception label helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBankReconciliationView, reconTieState, outstandingStaleUnacked, canCompleteReconciliation,
  deriveVoidUnwindCount, toBankLineException, exceptionDispositionLabel, exceptionKindLabel,
  toUnmatchedLine,
  type BankReconciliationView, type ReconTermSet,
} from "./reconModel";

function mkTerms(p: Partial<ReconTermSet> = {}): ReconTermSet {
  return {
    opening_anchor_cents: 0, statement_opening_cents: null, gl_prime_cents: 100000, uncleared_total_cents: -5000,
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
    status: "open", terms: mkTerms(),
    snapshot: { outstanding_entries: [], outstanding_group_items: [], outstanding_lines: [], exceptions: [], opening_lineage: [], shapeOk: true },
    stale_outstanding_ids: [], precondition_met: true, chain_ok: true, can_complete: true, blockers: [],
    completed_by: null, completed_at: null, voided_by: null, voided_at: null, voided_reason: null,
    voided_receipt: null,
    ...p,
  };
}

// --- toBankReconciliationView mode inference + defensive mapping ---------------

test("[F5 fix] toBankReconciliationView infers 'receipt' mode from a complete status only, 'preview' otherwise — 'void' is DELETED from the fallback", () => {
  const complete = toBankReconciliationView({ statement_id: "s1", status: "complete", recon_id: "r1" });
  assert.equal(complete.mode, "receipt");
  // post-C6 the primary envelope's status is never 'void' — the voided_
  // receipt sidecar is the ONE shape for a void. A stray status:'void'
  // near-miss now degrades to 'preview', never a fabricated receipt view.
  const strayVoid = toBankReconciliationView({ statement_id: "s1", status: "void", recon_id: "r1" });
  assert.equal(strayVoid.mode, "preview", "a real server never emits this shape anymore; a near-miss degrades safely");
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

test("reconTieState: ANY missing IDENTITY term fails closed to 'unavailable', never a fake tie", () => {
  // statement_opening_cents [C1 — LANDED] is excluded on purpose: it is an
  // ADDITIONAL informational field (the statement's own printed opening,
  // distinct from the anchor), not one of the §3 identity's eight terms —
  // tie state must not depend on whether a caller happened to include it.
  const identityKeys = (Object.keys(mkTerms()) as (keyof ReconTermSet)[])
    .filter((k) => k !== "statement_opening_cents");
  for (const key of identityKeys) {
    const terms = mkTerms({ [key]: null });
    assert.equal(reconTieState({ terms }), "unavailable", `missing ${key} must read unavailable`);
  }
});

test("[C1 — LANDED] reconTieState ignores statement_opening_cents entirely — a null there never blocks a genuine tie", () => {
  assert.equal(reconTieState({ terms: mkTerms({ statement_opening_cents: null, difference_cents: 0 }) }), "tied");
  assert.equal(reconTieState({ terms: mkTerms({ statement_opening_cents: 5200000, difference_cents: 0 }) }), "tied", "a populated value doesn't gate it either — it was never part of the identity");
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

test("[D8/CX9 fix] canCompleteReconciliation is keyed OFF THE SERVER VERDICT ONLY — can_complete, never precondition_met/chain_ok inference", () => {
  const base = mkView({ stale_outstanding_ids: [] });
  assert.equal(canCompleteReconciliation({ ...base, status: "complete" }, new Set()), false, "not open");
  assert.equal(canCompleteReconciliation({ ...base, can_complete: false }, new Set()), false, "the DB named a blocker");
  // An UNREPORTED (null) verdict does NOT enable the button — fail-closed
  // (F-H6): absent means the DB lane has not landed can_complete yet, never
  // a silent "assume ready". precondition_met/chain_ok being true no longer
  // matters at all — the old client-side inference is gone (asserted via the
  // full view below, since canCompleteReconciliation's Pick type no longer
  // even accepts those fields as an input).
  assert.equal(canCompleteReconciliation({ ...base, can_complete: null }, new Set()), false, "null must fail closed, never re-derived from the retired fields");
  assert.equal(canCompleteReconciliation({ ...base, can_complete: true }, new Set()), true, "an explicit server true enables it regardless of the retired fields");
  assert.equal(
    canCompleteReconciliation(mkView({ can_complete: true, precondition_met: false, chain_ok: false }), new Set()),
    true,
    "a full view with can_complete:true wins even when the retired precondition_met/chain_ok look unready",
  );
});

test("[F1 fix — NEW CONTRACT] can_complete:true WITH stale ids present is now a REACHABLE server verdict (recon_outstanding_stale is excluded from the DB's own can_complete computation while still named in blockers) — the ack gate alone decides", () => {
  const staleOnly = { status: "open" as const, can_complete: true, stale_outstanding_ids: ["a", "b"] };
  assert.equal(canCompleteReconciliation(staleOnly, new Set()), false, "can_complete:true alone never unlocks it — every id must still be acked");
  assert.equal(canCompleteReconciliation(staleOnly, new Set(["a"])), false, "partial acks still block it");
  assert.equal(canCompleteReconciliation(staleOnly, new Set(["a", "b"])), true, "can_complete:true + every stale id acked unlocks it — the DB's new remedy path");
});

test("[F1 fix — NEW CONTRACT] a fixture with stale ids AND can_complete:false (an OTHER, genuine blocker) stays disabled no matter how many ids are acked", () => {
  const genuinelyBlocked = { status: "open" as const, can_complete: false, stale_outstanding_ids: ["a"] };
  assert.equal(canCompleteReconciliation(genuinelyBlocked, new Set(["a"])), false, "can_complete:false wins regardless of full ack coverage — a DIFFERENT blocker is still live");
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

// --- [D7/CX6 fix] the snapshot's REAL shapes, copied from the LITERAL
//     jsonb_build_object blocks in 0040_wave_c_c_tieout.sql's
//     clara._bank_recon_terms (~1150-1383) ------------------------------------

test("[D7 fix] the snapshot's outstanding_entry_sides money key is 'cents', not 'amount_cents' (0040:1184-1188)", () => {
  const v = toBankReconciliationView({
    statement_id: "s1", status: "open",
    snapshot: {
      outstanding_entry_sides: [{ entry_id: "e1", posting_date: "2026-04-05", age_days: 12, side: "debit", cents: -50000 }],
      outstanding_group_items: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [],
    },
  });
  assert.equal(v.snapshot.outstanding_entries[0]?.amount_cents, -50000, "read from the real 'cents' key");
});

test("[D7 fix] outstanding_group_items is mapped and rendered — previously dropped entirely (0040:1237-1241)", () => {
  const v = toBankReconciliationView({
    statement_id: "s1", status: "open",
    snapshot: {
      outstanding_entry_sides: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [],
      outstanding_group_items: [{ match_id: "m1", uncleared_cents: -2000, anchor_date: "2026-04-10", age_days: 5 }],
    },
  });
  assert.equal(v.snapshot.outstanding_group_items.length, 1);
  assert.equal(v.snapshot.outstanding_group_items[0]?.uncleared_cents, -2000);
});

test("[D7 fix] the snapshot's exceptions items key their id 'exception_id', carry no reason/resolved_by (0040:1279-1286)", () => {
  const v = toBankReconciliationView({
    statement_id: "s1", status: "open",
    snapshot: {
      outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [], bank_uncleared_opening: [],
      exceptions: [{
        exception_id: "exc1", line_id: "l1", statement_id: "s1", kind: "bank_error", status: "open",
        resolution_disposition: null, entry_date: "2026-04-02", age_days: 3, amount_cents: -7282804,
      }],
    },
  });
  const exc = v.snapshot.exceptions[0];
  assert.equal(exc?.exception_id, "exc1", "the real key to resolve against — a prior version read `.id`, always empty here");
  assert.equal(exc?.amount_cents, -7282804);
});

test("[D7 fix] shapeOk is false when a known collection is missing — a fail-closed signal, not silently 'clean'", () => {
  const shaped = toBankReconciliationView({ statement_id: "s1", status: "open", snapshot: {
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [],
  } });
  assert.equal(shaped.snapshot.shapeOk, true, "all five known arrays present (even empty) reads as a genuinely clean snapshot");

  const drifted = toBankReconciliationView({ statement_id: "s1", status: "open", snapshot: { outstanding_entry_sides: [] } });
  assert.equal(drifted.snapshot.shapeOk, false, "missing collections must never masquerade as a clean period");
});

test("[F15/CX6#4 fix] shapeOk is an EXACT allowlist — the two intentionally-ignored arrays don't trip it, but any OTHER unknown array key does", () => {
  const withIgnoredArrays = toBankReconciliationView({ statement_id: "s1", status: "open", snapshot: {
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [],
    reversal_pairs_excluded: [{ pair: 1 }], acknowledged_outstanding: ["id1"],
  } });
  assert.equal(withIgnoredArrays.snapshot.shapeOk, true, "reversal_pairs_excluded/acknowledged_outstanding are named-allowlisted, not just any extra key");

  const withUnknownArray = toBankReconciliationView({ statement_id: "s1", status: "open", snapshot: {
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [],
    outstanding_adjustments: [{ surprise: true }],
  } });
  assert.equal(withUnknownArray.snapshot.shapeOk, false, "a FUTURE, unmapped collection must fail closed even though every known array is present");
});

// --- [D8/CX9 — LANDED] can_complete/blockers; [C1 — LANDED] the distinct
//     opening/closing keys and derived_closing_cents ----------------------------

test("[D8/CX9 — LANDED] can_complete/blockers map when present; absent still reads fail-closed (an older/near-miss shape)", () => {
  const v = toBankReconciliationView({
    statement_id: "s1", status: "open", can_complete: false,
    blockers: ["pending_match_exists", "recon_difference_nonzero"],
  });
  assert.equal(v.can_complete, false);
  assert.deepEqual(v.blockers, ["pending_match_exists", "recon_difference_nonzero"]);

  const absent = toBankReconciliationView({ statement_id: "s1", status: "open" });
  assert.equal(absent.can_complete, null, "an absent verdict (a near-miss shape) still fails closed, never assumed ready");
  assert.deepEqual(absent.blockers, []);
});

test("[C1 — LANDED] the distinct opening_anchor_cents/statement_opening_cents/statement_closing_cents keys map directly", () => {
  const landed = toBankReconciliationView({
    statement_id: "s1", status: "complete",
    opening_anchor_cents: 5000000, statement_opening_cents: 5200000, statement_closing_cents: 5000000,
  });
  assert.equal(landed.terms.opening_anchor_cents, 5000000);
  assert.equal(landed.terms.statement_opening_cents, 5200000, "distinct from the anchor — the real, now-landed key");
  assert.equal(landed.terms.statement_closing_cents, 5000000);
});

test("[F16/CX6#5 fix] opening_anchor_cents NEVER falls back to the legacy flat opening_cents — a near-miss shape fails CLOSED to null rather than conflating the two", () => {
  const nearMiss = toBankReconciliationView({ statement_id: "s1", status: "complete", opening_cents: 5000000, closing_cents: 4800000 });
  assert.equal(nearMiss.terms.opening_anchor_cents, null, "the OLD conflation is dead — opening_cents is never treated as the anchor");
  // closing_cents keeps its OWN legacy fallback — only the anchor's
  // conflation with opening_cents is in scope for this fix.
  assert.equal(nearMiss.terms.statement_closing_cents, 4800000, "closing_cents's fallback is untouched by this fix");
});

test("[C1 — LANDED] computed_closing_cents reads derived_closing_cents on a PREVIEW — distinct from statement_closing_cents, never conflated", () => {
  const v = toBankReconciliationView({
    statement_id: "s1", status: "open", preview: true,
    statement_closing_cents: 800000, derived_closing_cents: 750000, difference_cents: -50000,
  });
  assert.equal(v.terms.statement_closing_cents, 800000, "the statement's own printed figure");
  assert.equal(v.terms.computed_closing_cents, 750000, "the DB's derived figure — a prior version of this mapper read closing_cents here, which now means the SAME thing as statement_closing_cents and would have hidden this difference");

  const noDerived = toBankReconciliationView({ statement_id: "s1", status: "open", preview: true, statement_closing_cents: 800000 });
  assert.equal(noDerived.terms.computed_closing_cents, null, "absent on a preview fails closed — never silently reused from statement_closing_cents");
});

test("[C1 — LANDED] computed_closing_cents on a RECEIPT is the statement figure by construction (no derived_closing_cents key exists there)", () => {
  const v = toBankReconciliationView({ statement_id: "s1", status: "complete", statement_closing_cents: 2000000 });
  assert.equal(v.terms.computed_closing_cents, 2000000);
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

// bank_rules (toBankRule/bankRuleProposalLabel/candidateMeetsEvidenceFloor) RETIRED with
// F-A3 PR-3 (Annex I) alongside their reconModel.ts definitions — see that file's own note.

// --- list_unmatched_lines ---------------------------------------------------------

test("toUnmatchedLine falls back id to line_id, degrades garbage safely", () => {
  const u = toUnmatchedLine({ id: "u1", statement_id: "s1", amount_cents: -500 });
  assert.equal(u.line_id, "u1");
  assert.equal(u.amount_cents, -500);
  const garbage = toUnmatchedLine("nope");
  assert.equal(garbage.line_id, "");
});
