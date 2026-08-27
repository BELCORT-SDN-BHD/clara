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
async function runWithItems(tag) {
  const sc = await scene(tag);
  const a = await inPeriodDraft(sc.alice, {
    client: sc.client, postingDate: "2025-03-01", memo: `med8 a ${tag}`,
    debit: "574-C56", credit: "170-C56", cents: 1500 });
  const b = await inPeriodDraft(sc.alice, {
    client: sc.client, postingDate: "2025-03-02", memo: `med8 b ${tag}`,
    debit: "574-C56", credit: "170-C56", cents: 2500 });
  const begun = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(begun.status, "acted", `begin_close: ${JSON.stringify(tokens(begun))}`);
  return { sc, pairs: [{ check_key: CHECK, item_key: a }, { check_key: CHECK, item_key: b }],
    run: begun.result.close_run_id };
}

const drafted = (pairs, text = "Clara: the professional's drafted words for this item.") =>
  pairs.map((p) => ({ ...p, text }));

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
});

test("fa4p2a.W24 (MED-8) the STRICT-SUPERSET arm is over PAIRS, and the TRADE case still refuses", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const { sc, pairs, run } = await runWithItems("w24");

  // *** ARM (2)'s STATED POSITIVE CONTROL IS CURRENTLY UNREACHABLE, and that is a real finding
  // rather than a fixture problem -- pinned here and reported to the conductor 2026-08-27. ***
  //
  // Annex D.1 gives the case exactly: live {(A,i1)}, incoming {(A,i1),(A,i2)} -- the same check_key
  // SET {A}, so "a check_key reading would refuse a proposal adding a genuinely new item under an
  // existing check -- legitimate growth, which is exactly what arm (2) exists to admit."
  //
  // But B11 refuses it FIRST. B11 was shipped by 0138 and compares `bound_digests`, a
  // check_key -> digest MAP, for exact equality -- and adding a second ITEM under the SAME check
  // leaves that map identical. So the growth Annex D.1 wants admitted is refused as
  // `close_proposal_exists` before B11b's superset arm is ever evaluated. Arm (2) can only be
  // reached when the KEY set changes, which is not the case the annex uses to justify it.
  //
  // The cell asserts what the estate DOES, and names what the design SAYS, so the two cannot drift
  // apart silently while a ruling is pending.
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
