// Pure tests for the plan-as-document model (settled dashboard plan §3.2 / F15 / L5).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OnboardingPlanItemRow, OnboardingPlanRow, OnboardingPlanRevisionRow } from "../../shared/onboardingApi";
import {
  groupItems, stillToCapture, openingPositionFromPlan, commitReadiness,
  classifyCommitRefusal, isStalePlan, classifyBootstrapRefusal, revisionsRecord,
} from "./model";

function mkItem(p: Partial<OnboardingPlanItemRow>): OnboardingPlanItemRow {
  return {
    id: "i", plan_id: "pl", firm_id: "f", item_kind: "capture", item_key: "k", question: "Q?",
    answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...p,
  };
}
function mkPlan(p: Partial<OnboardingPlanRow>): OnboardingPlanRow {
  return {
    id: "pl", firm_id: "f", scope_kind: "client", client_id: "c", state: "open", revision_token: "rev1",
    revision_n: 3, committed_at: null, committed_by: null, review_maker: "u1", reviewed_at: "t", contributors: ["u1"],
    commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
    created_at: "t", updated_at: "t", ...p,
  };
}

// --- grouping + still-to-capture ------------------------------------------------

test("groupItems buckets by kind", () => {
  const g = groupItems([
    mkItem({ item_kind: "must_ask", item_key: "legal_name" }),
    mkItem({ item_kind: "capture", item_key: "tin" }),
    mkItem({ item_kind: "todo", item_key: "carry_down_deferred" }),
  ]);
  assert.equal(g.must_ask.length, 1);
  assert.equal(g.capture.length, 1);
  assert.equal(g.todo.length, 1);
});

test("stillToCapture lists unsatisfied required items + deferred todos", () => {
  const items = [
    mkItem({ item_key: "legal_name", item_kind: "must_ask", required_for_commit: true, state: "answered" }),
    mkItem({ item_key: "fye", item_kind: "must_ask", required_for_commit: true, state: "pending" }),
    mkItem({ item_key: "carry_down_deferred", item_kind: "todo", state: "deferred" }),
    mkItem({ item_key: "banks", item_kind: "capture", state: "pending" }), // optional pending → not outstanding
  ];
  const out = stillToCapture(items).map((i) => i.item_key).sort();
  assert.deepEqual(out, ["carry_down_deferred", "fye"]);
});

// --- opening position -----------------------------------------------------------

test("openingPositionFromPlan reads the AMB-11 item keys", () => {
  assert.equal(openingPositionFromPlan([mkItem({ item_key: "first_year_zero_opening", state: "answered", item_kind: "must_ask" })]), "zero");
  assert.equal(openingPositionFromPlan([mkItem({ item_key: "carry_down_deferred", state: "deferred", item_kind: "todo" })]), "carry_down");
  assert.equal(openingPositionFromPlan([mkItem({ item_key: "tin", state: "answered" })]), null);
});

// --- commit readiness (local preview of the DB gate) ----------------------------

test("commitReadiness: ready when open, required satisfied, opening present", () => {
  const items = [
    mkItem({ item_key: "legal_name", required_for_commit: true, state: "answered", item_kind: "must_ask" }),
    mkItem({ item_key: "first_year_zero_opening", state: "answered", item_kind: "must_ask", required_for_commit: true }),
  ];
  const r = commitReadiness(mkPlan({ state: "open" }), items);
  assert.equal(r.ready, true);
  assert.deepEqual(r.blockers, []);
});

test("commitReadiness: blocks on unresolved required + missing opening + non-open plan", () => {
  const items = [mkItem({ item_key: "fye", required_for_commit: true, state: "pending", item_kind: "must_ask" })];
  const r = commitReadiness(mkPlan({ state: "committed" }), items);
  assert.equal(r.ready, false);
  const kinds = r.blockers.map((b) => b.kind).sort();
  assert.deepEqual(kinds, ["opening_position_unconfirmed", "plan_not_open", "required_unresolved"]);
});

test("commitReadiness: a finalized seed satisfies the opening requirement without a plan item", () => {
  const items = [mkItem({ item_key: "legal_name", required_for_commit: true, state: "answered", item_kind: "must_ask" })];
  const r = commitReadiness(mkPlan({ state: "open" }), items, { seedFinalized: true });
  assert.equal(r.ready, true);
});

// --- commit-refusal classification (the CLR envelope) ---------------------------

test("classifyCommitRefusal maps the governed CLR envelope", () => {
  assert.equal(classifyCommitRefusal({ clr: "CLR06", reason: "stale_plan" }).kind, "stale_plan");
  assert.equal(classifyCommitRefusal({ clr: "CLR05", reason: "distinct_checker" }).kind, "distinct_checker");
  assert.equal(classifyCommitRefusal({ clr: "CLR05", reason: "self_attestation" }).kind, "self_attestation");
  assert.equal(classifyCommitRefusal({ clr: "CLR05", reason: "checker_required" }).kind, "checker_required");
  assert.equal(classifyCommitRefusal({ clr: "CLR10", message: "an opening position is required before activation" }).kind, "opening_required");
  assert.equal(classifyCommitRefusal({ clr: "CLR10", message: "required onboarding questions remain unresolved" }).kind, "required_unresolved");
  const other = classifyCommitRefusal({ clr: "CLR11", message: "not in your firm" });
  assert.equal(other.kind, "other");
  assert.equal(isStalePlan({ clr: "CLR06", reason: "stale_plan" }), true);
  assert.equal(isStalePlan({ clr: "CLR05", reason: "distinct_checker" }), false);
});

test("classifyBootstrapRefusal reads the detail reason token", () => {
  assert.equal(classifyBootstrapRefusal({ reason: "active_client_bootstrap_required" }), "not_active");
  assert.equal(classifyBootstrapRefusal({ reason: "active_client_plan_already_exists" }), "plan_exists");
  assert.equal(classifyBootstrapRefusal({ reason: "whatever" }), "other");
});

// --- revisions record -----------------------------------------------------------

test("revisionsRecord folds the append-only snapshots into a timeline", () => {
  const revs: OnboardingPlanRevisionRow[] = [
    { id: "r2", plan_id: "pl", revision_n: 2, snapshot: { state: "open", items: [{}, {}] }, created_at: "t2" },
    { id: "r1", plan_id: "pl", revision_n: 1, snapshot: { state: "open", items: [] }, created_at: "t1" },
  ];
  const out = revisionsRecord(revs);
  assert.deepEqual(out.map((r) => r.revision_n), [1, 2]);
  assert.equal(out[1]!.item_count, 2);
  assert.equal(out[0]!.state, "open");
});
