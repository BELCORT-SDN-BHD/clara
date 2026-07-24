// Migration-0018 blind battery — §4 TYPED REASONS ON commit_client_onboarding's
// CLR10s. The four free-text CLR10s gain DETAIL tokens; site 2 SPLITS into ordered
// branches with pinned precedence — (1) plan_not_open, (2) client_not_onboarding —
// then op_key_required, questions_unresolved, opening_position_required. Codes stay
// CLR10; messages stay human. A cell where BOTH split conditions are false pins the
// precedence (control falls through past the split). CONTRACT-BLIND; FAILS RED
// below 0018.
//
// [AMB-21a] The five tokens are asserted at CLR10 (CLR.badRequest). Each cell
//   isolates ONE failing condition (everything else valid) so the token fires
//   regardless of the as-built check ORDER; a wrong token at reconcile is a finding.
// [AMB-21b] op_key_required is provoked by a raw p_op_key => null call (the
//   commitOnboarding wrapper always supplies one).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, opk, rootQuery, humanQuery,
  assertRaisesReason, endPool, printLaneNotes, detailReason,
  fail0018, wbEnsureReady18,
  buildWaveBWorld, onboardingClient, updatePlan, commitOnboarding, planRevision,
  clientRow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

/** A fresh onboarding client whose plan carries ONE deferred carry-down item —
 *  a valid opening position, no unresolved must-asks. Ready to commit but for the
 *  one condition each cell breaks. */
async function commitReady() {
  const o = await onboardingClient(w.users.hana);
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  return o;
}

before(async () => {
  live = await wbEnsureReady18();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0018-commit-reasons"); await endPool(); });

test("META: 0018 applied", async () => {
  fail0018(live);
  assert.ok(w, "world built");
});

test("§4 token op_key_required: a null op_key on an otherwise-committable plan → CLR10 op_key_required", async () => {
  fail0018(live);
  const o = await commitReady();
  const rev = await planRevision(o.plan);
  await assertRaisesReason(CLR.badRequest, "op_key_required",
    () => humanQuery(w.users.alice,
      "select clara.commit_client_onboarding(p_client => $1, p_plan => $2, p_expected_plan_revision => $3, p_op_key => $4) as r",
      [o.client, o.plan, rev, null]),
    "commit with a null op_key");
});

test("§4 token questions_unresolved: an unresolved required must-ask (opening position present) → CLR10 questions_unresolved", async () => {
  fail0018(live);
  const o = await onboardingClient(w.users.hana);
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob, items: [
    { item_kind: "must_ask", item_key: "financial_year_end", question: "FYE?", required_for_commit: true },
    { item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" } ] });
  await assertRaisesReason(CLR.badRequest, "questions_unresolved",
    async () => commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) }),
    "commit with a pending required must-ask");
});

test("§4 token opening_position_required: no seed / no attestation / no deferral → CLR10 opening_position_required", async () => {
  fail0018(live);
  const o = await onboardingClient(w.users.hana);
  await assertRaisesReason(CLR.badRequest, "opening_position_required",
    async () => commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) }),
    "commit with no opening position of any kind");
});

test("§4 token plan_not_open (split branch 1, precedence (1)): re-committing a committed plan → CLR10 plan_not_open (wins over client_not_onboarding, both being applicable)", async () => {
  fail0018(live);
  const o = await commitReady();
  await commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) });
  assert.equal((await clientRow(o.client)).status, "active", "the client flipped active (plan now committed)");
  await assertRaisesReason(CLR.badRequest, "plan_not_open",
    async () => commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("recommit") }),
    "re-commit: plan committed AND client active — precedence pins plan_not_open FIRST");
});

test("§4 token client_not_onboarding (split branch 2): plan OPEN but client not onboarding → CLR10 client_not_onboarding", async () => {
  fail0018(live);
  const o = await commitReady();
  // Root-flip the client active while the plan stays OPEN — isolates branch (2):
  // plan_not_open is false (plan still open), so control reaches client_not_onboarding.
  await rootQuery("update clara.clients set status='active' where id=$1", [o.client]);
  await assertRaisesReason(CLR.badRequest, "client_not_onboarding",
    async () => commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("cno") }),
    "commit with an open plan but a non-onboarding client");
});

test("§4 both-false precedence: with BOTH split conditions false (plan open + client onboarding) control falls THROUGH the split — neither plan_not_open nor client_not_onboarding fires", async () => {
  fail0018(live);
  const o = await onboardingClient(w.users.hana);
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob, items: [
    { item_kind: "must_ask", item_key: "financial_year_end", question: "FYE?", required_for_commit: true },
    { item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" } ] });
  let err = null;
  try { await commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) }); }
  catch (e) { err = e; }
  assert.ok(err, "the commit still refuses (a later condition holds)");
  assert.equal(err.code, CLR.badRequest, `the refusal stays CLR10 (got ${err.code})`);
  const reason = detailReason(err);
  assert.ok(!["plan_not_open", "client_not_onboarding"].includes(reason),
    `both split conditions false → NEITHER split reason fires (got ${reason}) — the split never false-positives`);
  if (reason) assert.equal(reason, "questions_unresolved", "control fell through the split to the next check (questions_unresolved)");
});
