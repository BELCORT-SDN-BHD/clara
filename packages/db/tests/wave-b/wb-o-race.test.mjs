// Wave-B battery — GATE 1: the ANSWER half of the O5 concurrency story. A true
// two-session race against clara.update_onboarding_plan (runtime lane, PLAIN
// begin/READ COMMITTED — the writer serializes on a FOR UPDATE row-lock +
// revision_token CAS, not SSI: 0017:2643 FOR UPDATE -> 2655-2660 CLR06
// stale_plan). CONTRACT-BLIND; FAILS below 0017. Modeled on wb-k-approval's
// K5-RACE style but for the plan-answer writer.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, opk, rootQuery,
  endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists,
  buildWaveBWorld, onboardingClient,
  planRow, planItemRows, planRevisionRows,
  updatePlan, raceAnswerPlan,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

// Shared across the race + its follow-on (node:test runs a file's top-level
// tests in definition order — the follow-on resumes exactly where the race
// left off, matching the runtime updatePlanWithCas retry it stands in for).
let onbRace = null;
let n0Race = null;
let raceOut = null;

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-o-race"); await endPool(); });

test("META: 0017 applied — update_onboarding_plan exists (the O5 answer-CAS writer)", async () => {
  fail0017(live);
  assert.ok(await fnExists("update_onboarding_plan"), "clara.update_onboarding_plan exists");
});

test("O5 RACE (two-session): concurrent answers of ONE open plan — exactly ONE wins, the loser is CLR06 stale_plan", async () => {
  fail0017(live);
  onbRace = await onboardingClient(w.users.hana);
  const rev0 = onbRace.revision;
  n0Race = (await planRow(onbRace.plan)).revision_n;
  const len0 = (await planRevisionRows(onbRace.plan)).length;

  // Both answered_by are active firm-A bookkeepers (bob, grace — buildWaveBWorld's
  // wave-b extension) so the CAS race is the ONLY differentiator (0017:2661
  // membership floor cleared by both).
  raceOut = await raceAnswerPlan({
    plan: onbRace.plan, expectedRevision: rev0,
    itemsA: [{ item_kind: "capture", item_key: "bank_list", question: "banks?", state: "answered", answer: { value: "Maybank, CIMB" } }],
    answeredByA: w.users.bob,
    itemsB: [{ item_kind: "capture", item_key: "fye", question: "FYE?", state: "answered", answer: { value: "31 Dec" } }],
    answeredByB: w.users.grace,
  });

  assert.equal(raceOut.a?.ok, true, "session A (first to take the FOR UPDATE lock and rotate the token) wins");
  assert.equal(raceOut.b?.ok, false, "session B loses");
  assert.equal(raceOut.b.code, CLR.revision, "the loser is the plan-CAS class (CLR06)");
  if (raceOut.b.reason) {
    let detail = null;
    try { detail = JSON.parse(raceOut.b.reason); } catch { /* plain message, not a JSON detail */ }
    if (detail) assert.equal(detail.reason, "stale_plan", "typed reason");
  }

  const plan1 = await planRow(onbRace.plan);
  assert.equal(plan1.revision_n, n0Race + 1, "EXACTLY one write landed — the loser mutated nothing");
  assert.notEqual(plan1.revision_token, rev0, "the token rotated");
  assert.equal(plan1.revision_token, raceOut.a.result.revision_token, "the winner's token is live");
  assert.equal((await planRevisionRows(onbRace.plan)).length, len0 + 1,
    "exactly ONE post-image appended (append-only revisions not double-written)");

  const items = await planItemRows(onbRace.plan);
  assert.ok(items.some((i) => i.item_key === "bank_list"), "A's answer (bank_list) landed");
  assert.ok(!items.some((i) => i.item_key === "fye"), "B's answer (fye) never persisted");

  const receiptA = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='update_onboarding_plan' and op_key=$1",
    [raceOut.a.opKey]);
  assert.equal(receiptA.rows[0].n, 1, "op_receipts carries A's finished reservation");
  const receiptB = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='update_onboarding_plan' and op_key=$1",
    [raceOut.b.opKey]);
  assert.equal(receiptB.rows[0].n, 0,
    "ZERO rows for B's op_key — the loser's reservation rolled back with its txn; no poisoned receipt, a retry stays possible");
});

test("O5 RACE follow-on: the loser re-reads the live revision and retries ONCE to success (exactly-once, no lost answer — the DB substrate of the runtime updatePlanWithCas retry)", async () => {
  fail0017(live);
  const liveRev = (await planRow(onbRace.plan)).revision_token;
  const retry = await updatePlan({
    plan: onbRace.plan, expectedRevision: liveRev, answeredBy: w.users.grace,
    items: [{ item_kind: "capture", item_key: "fye", question: "FYE?", state: "answered", answer: { value: "31 Dec" } }],
    opKey: opk("retryB"),
  });
  assert.equal(retry.status, "updated", "the retry returns status 'updated'");
  const plan2 = await planRow(onbRace.plan);
  assert.equal(plan2.revision_n, n0Race + 2, "the retried answer landed on top of the winner");
  const items = await planItemRows(onbRace.plan);
  assert.ok(items.some((i) => i.item_key === "bank_list") && items.some((i) => i.item_key === "fye"),
    "planItemRows now contains BOTH 'bank_list' and 'fye' — no answer was lost; the CLR06 refusal was advisory, not destructive");
});
