// Pure seeding tick-list model tests (no DB, no React).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupProposalsByKind, batchIsOpen, isDecidable, proposalStatusCopy, batchStatusCopy,
  proposalTargetLabel, PROPOSAL_KIND_ORDER,
} from "./model";
import type { SeedingBatch, SeedingProposal } from "../shared/seedingApi";

function mkBatch(p: Partial<SeedingBatch> = {}): SeedingBatch {
  return {
    id: "b1", firm_id: "f1", client_id: "c1", source_document_id: "d1",
    source_sha256: "a".repeat(64), state: "open",
    stats: { proposal_count: 3, refused_count: 0, ticked: null, declined: null, refused: null, still_proposed: null, source_document_id: "d1" },
    created_by: null, created_at: "2026-07-24T00:00:00Z", completed_at: null, completed_by: null,
    cancelled_at: null, cancelled_by: null, cancel_reason: null, ...p,
  };
}

function mkProposal(p: Partial<SeedingProposal> = {}): SeedingProposal {
  return {
    id: "p1", batch_id: "b1", firm_id: "f1", client_id: "c1",
    proposal_kind: "vendor_account_rule", proposal_key: "k1",
    payload: { name: "Acme Sdn Bhd", account_code: "5100" },
    evidence: { occurrence_count: 4, date_span: { from: "2026-01-01", to: "2026-06-30" }, line_cites: [], raw: {} },
    state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null,
    resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-24T00:00:00Z", ...p,
  };
}

test("groupProposalsByKind orders known kinds per PROPOSAL_KIND_ORDER, unknowns trail", () => {
  const rows = [
    mkProposal({ id: "a", proposal_kind: "wiki_fact" }),
    mkProposal({ id: "b", proposal_kind: "vendor_account_rule" }),
    mkProposal({ id: "c", proposal_kind: "counterparty_birth" }),
    mkProposal({ id: "d", proposal_kind: "mystery_kind" }),
  ];
  const groups = groupProposalsByKind(rows);
  assert.deepEqual(groups.map((g) => g.kind), [...PROPOSAL_KIND_ORDER, "mystery_kind"]);
  assert.equal(groups.find((g) => g.kind === "mystery_kind")?.label, "mystery_kind", "unknown kind label falls back to the raw token, never dropped");
});

test("groupProposalsByKind never drops rows and preserves per-group order", () => {
  const rows = [mkProposal({ id: "a" }), mkProposal({ id: "b" }), mkProposal({ id: "c", proposal_kind: "wiki_fact" })];
  const groups = groupProposalsByKind(rows);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  assert.equal(total, rows.length);
  assert.deepEqual(groups.find((g) => g.kind === "vendor_account_rule")?.rows.map((r) => r.id), ["a", "b"]);
});

test("batchIsOpen / isDecidable gate on state, never the row alone", () => {
  assert.equal(batchIsOpen(mkBatch({ state: "open" })), true);
  assert.equal(batchIsOpen(mkBatch({ state: "completed" })), false);
  assert.equal(batchIsOpen(null), false);

  assert.equal(isDecidable(mkProposal({ state: "proposed" }), true), true);
  assert.equal(isDecidable(mkProposal({ state: "proposed" }), false), false, "a closed batch makes every row terminal");
  assert.equal(isDecidable(mkProposal({ state: "ticked" }), true), false);
  assert.equal(isDecidable(mkProposal({ state: "refused" }), true), false, "a refused row is NEVER tickable");
  assert.equal(isDecidable(mkProposal({ state: "declined" }), true), false);
});

test("proposalStatusCopy renders the reason verbatim per terminal state", () => {
  assert.equal(proposalStatusCopy(mkProposal({ state: "proposed" })), "proposed — not yet ticked");
  assert.equal(proposalStatusCopy(mkProposal({ state: "ticked" })), "ticked");
  assert.equal(proposalStatusCopy(mkProposal({ state: "declined", decision_reason: "not needed" })), "declined: not needed");
  assert.equal(proposalStatusCopy(mkProposal({ state: "declined", decision_reason: null })), "declined");
  assert.equal(proposalStatusCopy(mkProposal({ state: "refused", refuse_reason: "control_account" })), "refused at parse: control_account");
});

test("batchStatusCopy covers the three terminal/non-terminal states", () => {
  assert.equal(batchStatusCopy(mkBatch({ state: "open" })), "Batch open.");
  assert.equal(batchStatusCopy(mkBatch({ state: "completed" })), "Batch completed.");
  assert.equal(batchStatusCopy(mkBatch({ state: "cancelled", cancel_reason: "duplicate source" })), "Batch cancelled: duplicate source");
  assert.equal(batchStatusCopy(mkBatch({ state: "cancelled", cancel_reason: null })), "Batch cancelled.");
});

test("proposalTargetLabel prefers name+account, falls back honestly to proposal_key", () => {
  assert.equal(proposalTargetLabel(mkProposal({ payload: { name: "Acme", account_code: "5100" } })), "Acme → 5100");
  assert.equal(proposalTargetLabel(mkProposal({ payload: { counterparty_name: "Beta" } })), "Beta");
  assert.equal(proposalTargetLabel(mkProposal({ payload: { account_code: "5200" } })), "5200");
  assert.equal(proposalTargetLabel(mkProposal({ payload: {}, proposal_key: "fallback-key" })), "fallback-key");
});
