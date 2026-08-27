// F-A4 PR-2a -- Annex A's MED-8 group (W23, W24) plus residual 1's definer-path control (W22) and
// residual 5's honesty demonstration (W28).
//
// MED-8 is the churn guard: an incoming proposal may supersede a live one only on a MOVED DIGEST or
// a STRICT SUPERSET of its (check_key, item_key) PAIR set. Everything else refuses and leaves the
// live proposal `open`, because a supersession that cannot truthfully say why it happened should
// not be written.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, rootQuery, caught,
} from "./f-a4-pr2a-fixtures.mjs";
import {
  scene, VERBS, inPeriodDraft, proposalRows, tokens, mintClosePrepSession,
} from "./f-a4-pr1c-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

const CHECK = "unapproved_drafts_in_period";

/** A close run with TWO outstanding drafted items, so a proposal has pairs to carry and a SUBSET is
 *  a meaningful thing to draft. The item_key IS the draft entry's id -- PR-1c's own cells build it
 *  exactly this way, so this battery keys the same way rather than inventing a second convention.
 *  Both drafts are planted BEFORE begin_close, because the freeze makes the year unwritable. */
async function runWithItems(tag, drafts = 2) {
  const sc = await scene(tag);
  const ids = [];
  for (let i = 0; i < drafts; i++) {
    ids.push(await inPeriodDraft(sc.alice, {
      client: sc.client, postingDate: `2025-03-0${i + 1}`, memo: `med8 ${tag} ${i}`,
      debit: "574-C56", credit: "170-C56", cents: 1500 + i }));
  }
  const begun = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(begun.status, "acted", `begin_close: ${JSON.stringify(tokens(begun))}`);
  return { sc, ids, pairs: ids.map((id) => ({ check_key: CHECK, item_key: id })),
    run: begun.result.close_run_id };
}

const drafted = (pairs, text = "Clara: the professional's drafted words for this item.") =>
  pairs.map((p) => ({ ...p, text }));

test("fa4p2a.W23-digest a NEW outstanding item under an ALREADY-COVERED check MOVES that check's digest", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE CRUX MEASUREMENT behind design Annex D.1a's ruling, driven here so the ruling rests on a
  // cell rather than on a transcript. Two worlds identical but for the number of outstanding drafts
  // under the SAME check: if the digests differ, real growth moves the digest and therefore arrives
  // through ARM (1), never meeting B11 -- which is what makes B11 correct exactly as 0138 shipped
  // it, and what makes D.1's original justifying example a mis-derivation rather than a defect.
  const a = await runWithItems("w23d1", 1);
  const b = await runWithItems("w23d2", 2);
  const g = async (run) => (await rootQuery(
    `select measured_digest, measured from clara.close_gate_results
      where close_run_id=$1 and check_key=$2`, [run, CHECK])).rows[0];
  const ga = await g(a.run), gb = await g(b.run);
  assert.ok(ga && gb, "the check did not measure on one of the runs");
  // The payload carries the item list OUTRIGHT -- so this is visible, not inferred.
  assert.equal(ga.measured.draft_count, 1);
  assert.equal(gb.measured.draft_count, 2);
  assert.notEqual(ga.measured_digest, gb.measured_digest,
    "a second outstanding item under the same check did NOT move the digest -- legitimate growth would then be unreachable and B11 would need to become pair-aware (design Annex D.1a's other fork)");
  noteLane(`W23-digest: draft_count 1 -> ${ga.measured_digest}, 2 -> ${gb.measured_digest}`);
});

test("fa4p2a.W23 (MED-8) a strict SUBSET with unmoved digests REFUSES, and the live proposal stays OPEN", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const { sc, pairs, run } = await runWithItems("w23");
  const first = await VERBS.propose(sc.s, { run, drafted: drafted(pairs) });
  assert.equal(first.status, "acted", `the first proposal was refused: ${JSON.stringify(first).slice(0, 250)}`);
  const live = (await proposalRows(run)).find((p) => p.state === "open");
  assert.ok(live, "no open proposal after the first draft");

  // A FRESH TASK drafting a strict SUBSET, with every digest unmoved. Nothing has moved -- the
  // request simply shrank -- so B11b must refuse rather than stamping the live proposal
  // `superseded` with a sentence that is not true of anything that happened.
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const shrunk = await VERBS.propose(s2, { run, drafted: drafted(pairs.slice(0, 1)) });
  assert.equal(shrunk.status, "refused",
    `a strict subset superseded a live proposal: ${JSON.stringify(shrunk).slice(0, 250)}`);
  // *** WHICH RUNG REFUSES IT IS AN OPEN COLLISION, pinned rather than decided (reported to the
  // conductor 2026-08-27; this assertion flips with the ruling). ***
  // B11 -- shipped in 0138, and NOT recut for this -- fires on an exact match of `bound_digests`,
  // which is a check_key -> digest MAP. A subset of PAIRS under ONE check_key leaves that map
  // IDENTICAL, so B11 refuses first and B11b is never consulted. The outcome is the one MED-8
  // wants (refused; the live proposal stays open; nothing is superseded on a false sentence) and
  // it arrives under the OTHER token. B11b's own arm is reachable only when the KEY SET changes.
  assert.ok(tokens(shrunk).some((k) => k === "close_proposal_no_state_change" || k === "close_proposal_exists"),
    `expected the churn to be refused by B11b or B11, got ${tokens(shrunk).join(",")}`);
  const after = await proposalRows(run);
  assert.equal(after.filter((p) => p.state === "open").length, 1,
    "the live proposal did not stay open");
  assert.equal(after.find((p) => p.state === "open").id, live.id,
    "a DIFFERENT proposal is now open -- the live one was superseded after all");
  assert.equal(after.length, 1, "the refused draft wrote a proposal row");

  // THE SHARED CEILING (the same one W24 states, because the two share it rather than each having
  // their own): ARM (1)'s supersede -- and with it the dropped-pair naming its settle_reason owes
  // -- is NOT driven here. It needs a check's digest to move BETWEEN two proposals on one run, and
  // `begin_close` freezes the year so `unapproved_drafts_in_period` cannot move that way mid-run.
  // The MECHANISM is proven by W23-digest; the same-run TRANSITION is carried by name to PR-2b/PR-3
  // rather than manufactured by planting into a frozen year.
});

test("fa4p2a.W24 (MED-8) the STRICT-SUPERSET arm is over PAIRS, and the TRADE case still refuses", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const { sc, pairs, run } = await runWithItems("w24");

  // RULED 2026-08-27 (design Annex D.1a) AFTER THE MEASUREMENT BELOW: Annex D.1's justifying
  // example was MIS-DERIVED, and B11 is right as 0138 shipped it.
  //
  // The example said live {(A,i1)} vs incoming {(A,i1),(A,i2)} is legitimate growth a check_key
  // reading would wrongly refuse. But in an UNCHANGED WORLD those two proposals differ only in how
  // many items the AGENT CHOSE to draft -- nothing measured moved -- and B11's map-equality refusal
  // is then the honest answer. Real growth moves the check's digest (cell W23-digest proves it), so
  // it arrives through ARM (1) and never meets B11 at all.
  //
  // This cell therefore pins the UNCHANGED-WORLD arm: same key set, same digests, agent drafts more
  // items -> B11 refuses, and nothing is superseded on a sentence that would not be true.
  const one = await VERBS.propose(sc.s, { run, drafted: drafted(pairs.slice(0, 1)) });
  assert.equal(one.status, "acted");
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const grown = await VERBS.propose(s2, { run, drafted: drafted(pairs) });
  assert.equal(grown.status, "refused",
    `growth under one check_key is currently refused by B11; if this now ACTS, arm (2) has been made reachable and this cell should assert the supersession and its settle_reason instead: ${JSON.stringify(grown).slice(0, 250)}`);
  assert.deepEqual(tokens(grown), ["close_proposal_exists"],
    "the refusal came from somewhere other than B11 -- the collision has moved");
  // WHAT IS TRUE EITHER WAY: nothing was superseded on a false sentence, and exactly one proposal
  // is open. That is MED-8's actual safety property, and it holds under both readings.
  const rows = await proposalRows(run);
  assert.equal(rows.filter((p) => p.state === "open").length, 1);
  assert.equal(rows.filter((p) => p.state === "superseded").length, 0,
    "a proposal was superseded despite the refusal");

  // ================= THE SHARED CEILING, stated in BOTH cells that share it =================
  // NEITHER ARM (1)'s SUPERSEDE NOR ARM (2)'s SUPERSET IS DRIVEN BY THIS BATTERY, and they share
  // ONE reason rather than two. Both need the world to MOVE between two proposals on the same run:
  // arm (1) needs a check's digest to change, arm (2) needs the pair set to grow by a NEW key. For
  // `unapproved_drafts_in_period` neither can happen mid-run, because `begin_close` FREEZES the
  // year -- the wall fa4c.B1b and fa4c.G1b already pin -- so no new draft can appear in the period
  // after the run starts.
  //
  // WHAT IS PROVEN ANYWAY: cell W23-digest shows the digest DOES move with the item set, which is
  // the mechanism arm (1) rides and the fact design Annex D.1a's ruling rests on. What is NOT
  // proven is the same-run TRANSITION.
  //
  // NOTHING IS PLANTED TO FAKE IT. A fixture that mutated a frozen year to manufacture the
  // transition would be testing the plant, not the guard. CARRIED BY NAME to PR-2b/PR-3, where the
  // runtime's own wake cycles drive real mid-run movement across separate runs.
  // ==========================================================================================
});

test("fa4p2a.W22 (residual 1) the rank conjunct breaks NO definer path, and a below-floor viewer still cannot read", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The census behind §G promised that folding the floor into the POLICY costs no live caller,
  // because every legitimate consumer is a definer door or a superuser rig read. This is that
  // promise driven rather than asserted -- and its control is the arm that must still refuse.
  const { sc, pairs, run } = await runWithItems("w22");
  await VERBS.propose(sc.s, { run, drafted: drafted(pairs) });

  // A BOOKKEEPER+ reads the proposal through the definer door, after the recut.
  const asBk = await humanQuery(sc.alice,
    "select count(*)::int as n from clara.close_proposals where close_run_id=$1", [run]);
  assert.ok(asBk.rows[0].n >= 1, "the bookkeeper's direct read broke -- the recut cost a legitimate consumer");

  // THE CONTROL: a below-floor viewer reads ZERO. Without this arm the cell could not tell a
  // working floor from an absent one.
  const viewer = await rootQuery(
    `select u.id from clara.users u join clara.firm_memberships m on m.user_id = u.id
      where m.firm_id=$1 and m.status='active'
        and clara.role_rank(m.role) < clara.role_rank('bookkeeper') limit 1`, [sc.firm]);
  if (viewer.rows.length === 0) {
    noteLane("fa4p2a.W22: no below-floor member in this world -- the control arm is PRINTED, not silent");
  } else {
    const asViewer = await humanQuery(viewer.rows[0].id,
      "select count(*)::int as n from clara.close_proposals where close_run_id=$1", [run]);
    assert.equal(asViewer.rows[0].n, 0, "a below-floor viewer read a model's rationale");
  }
});

test("fa4p2a.W28 (residual 5) the adopted arm's TRUE strength is stated in the catalog, not over-claimed", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The gap is real and named: close_attestations carries no from-proposal column, so `adopted`
  // proves a live agent-authored attestation ON THE RUN for that key pair -- not one naming THIS
  // proposal. FIX-7's comment over-claimed; §I recut it. This cell reads the CATALOG comment,
  // because that is where the truing had to land (0138 is an applied file and its bytes are frozen).
  const c = await rootQuery(
    `select obj_description(to_regprocedure('clara.settle_close_proposal(uuid,text,text,text)'), 'pg_proc') as d`);
  const d = c.rows[0].d ?? "";
  assert.ok(d.length > 0, "the settle door carries no comment at all");
  assert.match(d, /does NOT prove/i, "the comment does not state what the adopted arm fails to prove");
  assert.match(d, /from_proposal_id/, "the comment does not name the missing column");
  assert.match(d, /superseded predecessor/i,
    "the comment does not name the concrete consequence -- a predecessor's attestation covering a successor's item");
  // AND the uq_aar truing landed too, with the true seven-column spelling.
  const u = await rootQuery(
    `select obj_description(c.oid, 'pg_constraint') as d from pg_constraint c
      where c.conrelid='clara.agent_act_receipts'::regclass and c.conname='uq_aar'`);
  assert.match(u.rows[0].d ?? "", /SEVEN|rung_digest/,
    "uq_aar's comment does not carry the true column list");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0, `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
  void caught; void withTxn;
});
