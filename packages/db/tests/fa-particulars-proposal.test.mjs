// #933 — THE PROPOSAL'S TRANSPORT, DRIVEN ON A LIVE DATABASE.
//
// WHAT THIS BATTERY IS FOR, AND WHY IT IS THE WHOLE "DATABASE SIDE" OF THIS TICKET. #933 puts a
// typed proposal block into the dependent particulars question so the three answering surfaces can
// pre-fill from it. The obvious way to carry a new typed thing is a new column, and this battery
// exists to prove that the estate ALREADY carries it: `clara.agent_interruptions.source_ref` is
// constrained to "null or a jsonb object" and nothing more (0180:183), and
// `clara.open_work_question` validates the FIELDS but passes `p_source_ref` through untouched
// (0180:579-589). If that is true, #933 needs NO migration — and "if that is true" is a claim
// about a live database, so it is MEASURED here rather than read off the file.
//
// FOUR THINGS ARE PROVEN, AND EACH ONE IS A DECISION SOMEBODY WOULD OTHERWISE HAVE TO TAKE ON
// TRUST:
//
//   p933.wire.verbatim       the extended source_ref is admitted and comes back KEY FOR KEY
//                            through the human's own read door. A jsonb round trip that reordered
//                            or dropped a key would make the surfaces disagree about the proposal.
//   p933.wire.answerable     the question carrying it still ANSWERS. An extra source_ref key must
//                            not touch `clara.answer_work_question`, and the honest way to know
//                            that is to drive the door.
//   p933.read.by_asset       the TWO REGISTER-SIDE entrances (the asset page dialog and the
//                            Needs-you inline form) hold an asset id and no question id, so they
//                            find the proposal by filtering `clara.agent_interruptions` on
//                            `source_ref->>'asset_id'` under the human role's own firm-scoped
//                            policy. That read is what `apps/web/lib/registers/fa-particulars-proposal.ts`
//                            issues; this cell is the grant and the policy behind it.
//   p933.read.firm_walled    …and a person of ANOTHER firm reads nothing at all for the same asset
//                            id — no row, and therefore no existence oracle either.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (DECISIONS §1.10). Root appears only as a
// readback, and each readback is marked as one.
//
// FRONTIER-GATED on 0216's STABLE STEM through the shared fixtures, never on a number.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAcq, gateWorkLane,
  acqWorld, acqClient, armedAcquisition, postAcquisition, assetForEntry,
  openWorkQuestion, answerWorkQuestion, pendingQuestion,
  workRow, mon, dayIn, opk, rootQuery, humanQuery,
  caught, printLaneNotes, printSkipCount, endPool, x41EnsureReady,
} from "./fixed-asset-acquisition-fixtures.mjs";

let live = false;
before(async () => {
  live = await x41EnsureReady();
});
after(async () => {
  printLaneNotes("p933 particulars proposal");
  printSkipCount("p933 particulars proposal");
  await endPool();
});

async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #933 battery is dormant");
    return true;
  }
  if (await gateWorkLane(t)) return true;
  if (await gateAcq(t)) return true;
  return false;
}

/**
 * THE BLOCK, WRITTEN OUT RATHER THAN IMPORTED, and that is deliberate.
 *
 * The derivation lives in `packages/runtime/lib/fa-particulars-proposal.ts` and is driven as a pure
 * function by its own battery. What is under test HERE is the TRANSPORT, so the block is a literal
 * of the contract's own shape: importing the deriver would make this cell agree with the deriver
 * by construction and prove nothing about the database.
 */
const PROPOSAL = Object.freeze({
  v: 1,
  method: "straight_line",
  useful_life_months: 60,
  rate_bps: null,
  residual_cents: 0,
  start_date: "2026-08-15",
  description: "Air compressor, workshop bay 2",
  basis: ["account_siblings", "acquisition_date", "firm_default_residual"],
  reason: "Every other completed asset on 1500 is depreciated straight line over 60 months, so I "
    + "propose the same. I propose 15 August 2026 — the acquisition's own posting date — as the "
    + "in-service date, and a nil residual, which is this firm's default.",
});

/** Post an acquisition and park the #639 question on it, with the proposal in the source_ref. */
async function parkedWithProposal(label, { proposal = PROPOSAL } = {}) {
  const w = await acqWorld();
  const client = await acqClient(label);
  const a = await armedAcquisition({ client });
  const out = await postAcquisition(a);
  const asset = (await assetForEntry(out.entry_id))[0];
  const opened = await openWorkQuestion({
    task: a.task_id,
    reason: "The acquisition is posted. Depreciation particulars are still outstanding.",
    sourceRef: proposal === null
      ? { kind: "fixed_asset", asset_id: asset.id }
      : { kind: "fixed_asset", asset_id: asset.id, proposal },
  });
  return { w, client, a, out, asset, opened };
}

test("p933.wire.verbatim the dependent question carries the proposal inside #639's own source_ref, and the human's read door returns it KEY FOR KEY", async (t) => {
  if (await gate(t)) return;
  const { w, a, asset, opened } = await parkedWithProposal("proposal_verbatim");

  assert.equal(opened.replayed, false);
  assert.equal(opened.question_version, 1);
  const parked = await workRow(a.work_id);
  assert.equal(parked.status, "awaiting_input", "wire: the Work still parks exactly as #639 leaves it");

  const q = await pendingQuestion(w.users.bob, a.work_id);
  assert.equal(q.source_ref.kind, "fixed_asset", "wire: #639's stanza is EXTENDED, never replaced");
  assert.equal(q.source_ref.asset_id, asset.id);
  assert.deepEqual(q.source_ref.proposal, PROPOSAL,
    "wire: every key of the block survives the jsonb round trip — a surface pre-filling from a "
    + "block the database had reshaped would disagree with the question it is answering");
  assert.deepEqual(
    Object.keys(q.source_ref.proposal).sort(),
    ["basis", "description", "method", "rate_bps", "reason", "residual_cents", "start_date", "useful_life_months", "v"],
    "wire: exactly the contract's nine keys, no more and no fewer");
});

test("p933.wire.answerable a question carrying the proposal still ANSWERS, and the accepted answer is the person's values, not the proposal", async (t) => {
  if (await gate(t)) return;
  const { w, a, opened } = await parkedWithProposal("proposal_answerable");

  // THE PERSON EDITS. The proposal says 60 months; this answer says 84 and a different residual —
  // the one thing #883's ruling turns on ("the applied particulars are what the person confirmed").
  const answered = await answerWorkQuestion(w.users.bob, {
    question: opened.question_id, version: 1,
    answer: {
      method: "straight_line", useful_life_months: "84", residual_cents: 150_000,
      start_date: dayIn(mon(-1), 20), description: "Air compressor, workshop bay 2",
    },
  });
  assert.equal(answered.status, "answered", "answerable: an extra source_ref key does not reach the answer door");

  const settled = await pendingQuestion(w.users.bob, a.work_id);
  assert.equal(settled, null, "answerable: the Work is no longer parked on a pending question");

  // READBACK (root): the stored answer is the EDIT, and the proposal it departed from is still on
  // the record beside it — which is what makes "who decided 84 months, and against what" answerable.
  const row = await rootQuery(
    "select answer, source_ref from clara.agent_interruptions where id = $1", [opened.question_id]);
  assert.equal(row.rows[0].answer.useful_life_months, "84",
    "answerable: the APPLIED value is the person's, never the proposal's 60");
  assert.equal(row.rows[0].answer.residual_cents, 150_000);
  assert.equal(row.rows[0].source_ref.proposal.useful_life_months, 60,
    "answerable: …and the proposal stands unedited beside it, so the departure is legible a year later");
});

test("p933.read.by_asset the two register-side entrances find the proposal by asset id alone, under the human role's own firm-scoped policy", async (t) => {
  if (await gate(t)) return;
  const { w, asset, opened } = await parkedWithProposal("proposal_by_asset");

  // THE EXACT READ `apps/web/lib/registers/fa-particulars-proposal.ts` ISSUES. The asset page
  // dialog and the Needs-you inline form hold an asset id and NO question id (the
  // `fixed_asset_incomplete` queue row carries `asset_id` and nothing else), so the question is
  // found by its source_ref — the same filter PostgREST compiles `source_ref->>asset_id=eq.<id>`
  // into, issued here as the human, so the GRANT and the POLICY behind it are what is proven.
  const r = await humanQuery(w.users.bob,
    `select id, source_ref from clara.agent_interruptions
      where status = 'pending' and work_id is not null and source_ref->>'asset_id' = $1
      order by created_at desc limit 2`, [asset.id]);
  assert.equal(r.rows.length, 1, "by_asset: exactly the one pending question this asset is parked on");
  assert.equal(r.rows[0].id, opened.question_id);
  assert.deepEqual(r.rows[0].source_ref.proposal, PROPOSAL,
    "by_asset: …and the block reaches the register's own entrances unchanged");
});

test("p933.read.firm_walled a person of ANOTHER firm reads nothing for the same asset id — no proposal and no existence oracle", async (t) => {
  if (await gate(t)) return;
  const { w, asset } = await parkedWithProposal("proposal_firm_walled");

  const r = await humanQuery(w.users.dave,
    `select id from clara.agent_interruptions
      where status = 'pending' and source_ref->>'asset_id' = $1`, [asset.id]);
  assert.equal(r.rows.length, 0,
    "firm_walled: p_agent_interruptions_human is `firm_id = clara.jwt_firm()`, so the row is not "
    + "merely redacted — it is not there, which is what makes the empty answer indistinguishable "
    + "from 'no such asset'");
});

test("p933.wire.object_only the carrier is lawful BECAUSE source_ref is constrained to an object — a non-object is refused, so an extra key is the only shape this ticket needs", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("proposal_object_only");
  const a = await armedAcquisition({ client });
  const out = await postAcquisition(a);
  const asset = (await assetForEntry(out.entry_id))[0];

  // A jsonb ARRAY is a lawful jsonb and an unlawful source_ref: 0180:183's CHECK is
  // `source_ref is null or jsonb_typeof(source_ref) = 'object'`. This is the cell that turns "no
  // migration is needed" from a reading of the file into a measurement.
  const err = await caught(() => openWorkQuestion({
    task: a.task_id,
    hookToken: opk("p933-objonly"),
    sourceRef: [{ kind: "fixed_asset", asset_id: asset.id, proposal: PROPOSAL }],
  }));
  assert.ok(err, "object_only: an array source_ref is refused rather than stored");

  // …and the object form, with the extra key, is admitted at the same task.
  const opened = await openWorkQuestion({
    task: a.task_id,
    hookToken: opk("p933-objonly-ok"),
    sourceRef: { kind: "fixed_asset", asset_id: asset.id, proposal: PROPOSAL },
  });
  assert.equal(opened.question_version, 1, "object_only: the object form is admitted");
});
