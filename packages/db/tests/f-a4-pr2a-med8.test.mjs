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

const CHECK_B = "uncoded_documents";

/** A run with outstanding items under TWO DIFFERENT check_keys, which is what makes arm (2)
 *  drivable with the world FROZEN: the drafted set growing is the AGENT'S CHOICE, not a world
 *  event, so drafting {A} then {A,B} changes `bound_digests` (a new KEY appears) without anything
 *  measured moving. An unapproved draft gives check A; a filed, DATED, uncoded document gives
 *  check B -- the date is load-bearing, an undated document is simply out of the check's scope. */
async function runWithTwoChecks(tag) {
  const { seedVerifiedDocument, fileDocument } = await import("./rig-docs-fixtures.mjs");
  const { firmOf, opk } = await import("./wave-a-fixtures.mjs");
  const sc = await scene(tag);
  const entry = await inPeriodDraft(sc.alice, {
    client: sc.client, postingDate: "2025-03-01", memo: `med8 ${tag} A`,
    debit: "574-C56", credit: "170-C56", cents: 1500 });
  const firm = await firmOf(sc.client);
  const doc = await seedVerifiedDocument({
    firm, client: null, filename: `med8-${tag}.pdf`, financialDate: "2025-03-15" });
  await fileDocument(sc.alice, { document: doc.documentId, client: sc.client, opKey: opk("med8-file") });
  const begun = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(begun.status, "acted", `begin_close: ${JSON.stringify(tokens(begun))}`);
  const run = begun.result.close_run_id;
  // BOTH checks must really be failing, or the cell below would be drafting for items that are not
  // outstanding and proving nothing about growth.
  const failing = await rootQuery(
    "select check_key from clara.close_gate_results where close_run_id=$1 and state='fail' order by 1",
    [run]);
  assert.deepEqual(failing.rows.map((r) => r.check_key).sort(), [CHECK, CHECK_B].sort(),
    "the two-check fixture did not produce exactly the two expected failing checks");
  return { sc, run,
    pairA: { check_key: CHECK, item_key: entry },
    pairB: { check_key: CHECK_B, item_key: doc.documentId } };
}

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

  // ARM (1)'s CEILING (stated here as well as at W24, because this cell is where a reader meets the
  // subset case and would otherwise assume arm (1) is covered): arm (1)'s supersede -- and with it
  // the dropped-pair naming its settle_reason owes -- is NOT driven. Arm (1) fires on a MOVED
  // DIGEST, and a digest moves only when the MEASURED WORLD moves; `begin_close` freezes the year
  // for both of this fixture's checks, so no measurement can change between two proposals on one
  // run. Arm (2) is NOT subject to this and IS driven (W24-arm2): growth is the agent's choice, not
  // a world event. The MECHANISM behind arm (1) is proven by W23-digest; the same-run TRANSITION is
  // carried by name to PR-2b/PR-3 rather than manufactured by planting into a frozen year.
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

  // ============================ ARM (1)'s CEILING, on its TRUE reason ============================
  // ARM (2) IS NOW DRIVEN (cell W24-arm2). An earlier cut of this comment claimed both arms shared
  // one ceiling and gave the reason as "arm (2) needs the pair set to grow by a NEW key, which the
  // frozen year forbids". THAT REASON WAS WRONG, and the conclusion it supported was wrong with it:
  // the drafted set growing is the AGENT'S CHOICE, not a world event, so a two-check fixture
  // reaches strict_superset with the world entirely frozen. The right-conclusion-wrong-reason class
  // this train's own deviations register already names once -- here it was a WRONG conclusion
  // resting on a wrong reason, which is worse and is why the reason is now stated separately.
  //
  // WHAT REMAINS CEILING'D IS ARM (1) ALONE, and its reason is its own: arm (1) fires on a MOVED
  // DIGEST, and a digest can only move when the MEASURED WORLD moves. `begin_close` freezes the
  // year for both of this fixture's checks -- no new draft can appear in the period and no filing
  // can be coded -- so no measurement can change between two proposals on one run. That is a
  // property of the world, not of the agent's choice, which is exactly why arm (2) escaped it and
  // arm (1) does not.
  //
  // WHAT IS PROVEN ANYWAY: cell W23-digest shows the digest DOES move with the measured item set,
  // which is the mechanism arm (1) rides and the fact design Annex D.1a's ruling rests on. What is
  // NOT proven is the same-run TRANSITION, and with it arm (1)'s dropped-pair sentence.
  //
  // NOTHING IS PLANTED TO FAKE IT. A fixture that mutated a frozen year would test the plant, not
  // the guard. CARRIED BY NAME to PR-2b/PR-3, where the runtime's own wake cycles move the world
  // between passes.
  // ==============================================================================================
});

test("fa4p2a.W24-arm2 (MED-8) a STRICT SUPERSET across two check_keys supersedes, and settle_reason names the newly-covered pair", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // ARM (2), DRIVEN END TO END -- including the `case v_arm` construction, which no other cell
  // reaches. The world is FROZEN throughout: begin_close ran before either proposal, and neither
  // proposal changes a measurement. What grows is the AGENT'S CHOICE of how many outstanding items
  // to draft for, which is exactly the growth arm (2) exists to admit.
  const { sc, run, pairA, pairB } = await runWithTwoChecks("w24a2");

  const first = await VERBS.propose(sc.s, { run, drafted: drafted([pairA]) });
  assert.equal(first.status, "acted", `first proposal refused: ${JSON.stringify(tokens(first))}`);
  const live = (await proposalRows(run)).find((p) => p.state === "open");
  assert.ok(live, "no open proposal after the first draft");
  assert.deepEqual(Object.keys(live.bound_digests).sort(), [CHECK],
    "the first proposal bound a key it did not draft for");

  // A FRESH TASK drafting BOTH pairs. bound_digests now carries a SECOND key, so B11's exact-map
  // equality does not fire and B11b is reached -- with v_moved EMPTY (check A's digest is
  // untouched) and v_added carrying B's pair. That is strict_superset, not moved_digest.
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const grown = await VERBS.propose(s2, { run, drafted: drafted([pairA, pairB]) });
  assert.equal(grown.status, "acted",
    `legitimate growth was refused: ${JSON.stringify(grown).slice(0, 300)}`);

  const rows = await proposalRows(run);
  const superseded = rows.find((p) => p.state === "superseded");
  assert.ok(superseded, "the predecessor was not superseded");
  assert.equal(superseded.id, live.id, "a DIFFERENT proposal was superseded");
  assert.equal(rows.filter((p) => p.state === "open").length, 1, "exactly one proposal stays open");

  // THE SENTENCE ITSELF -- arm (2) loses nothing by construction, so the reason names what was
  // ADDED, and it names it in the reader's form (`check_key / item_key`), not as raw jsonb.
  assert.match(superseded.settle_reason, /strict superset/i,
    `arm (2) did not write its own sentence: ${superseded.settle_reason}`);
  assert.match(superseded.settle_reason, /newly covered/i);
  assert.ok(superseded.settle_reason.includes(`${CHECK_B} / ${pairB.item_key}`),
    `the reason does not name the newly-covered pair in reader form: ${superseded.settle_reason}`);
  // AND IT DOES NOT NAME THE PAIR THAT WAS ALREADY COVERED -- a sentence that listed everything
  // would tell a reviewer nothing about what changed.
  assert.ok(!superseded.settle_reason.includes(pairA.item_key),
    `the reason names an already-covered pair: ${superseded.settle_reason}`);
});

test("fa4p2a.W24-paircollision the pair key is a COMPOSITE: ('A','x|y') and ('A|x','y') are DISTINCT", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // LAW 3, at the expression the guard actually uses. item_key is only non-blank-validated, so it
  // may contain any character. Under a `check_key || '|' || item_key` key the two pairs below
  // produce the SAME text and are read as ONE -- and in the ROTATION direction that makes v_dropped
  // come back empty when a pair really was dropped, so B11b would SUPERSEDE on the strict-superset
  // arm where it must refuse. jsonb_build_array carries the two fields as two fields.
  //
  // CEILING, stated: this drives the EXPRESSION, not the ladder. The estate's check_key catalog has
  // no member spelled `A|x`, so the collision cannot be reached through the real verb -- which is
  // why the fix is worth having and why this control is written at the level the defect lives at.
  const r = await rootQuery(`
    select (jsonb_build_array('A','x|y') = jsonb_build_array('A|x','y')) as composite_collides,
           (('A' || '|' || 'x|y') = ('A|x' || '|' || 'y'))              as concat_collides,
           (select count(distinct jsonb_build_array(e ->> 'check_key', e ->> 'item_key'))::int
              from jsonb_array_elements($1::jsonb) as t(e))             as composite_distinct,
           (select count(distinct (e ->> 'check_key') || '|' || (e ->> 'item_key'))::int
              from jsonb_array_elements($1::jsonb) as t(e))             as concat_distinct`,
    [JSON.stringify([{ check_key: "A", item_key: "x|y" }, { check_key: "A|x", item_key: "y" }])]);
  const x = r.rows[0];
  assert.equal(x.concat_collides, true,
    "the separator form no longer collides -- this control is asserting a hazard that has moved");
  assert.equal(x.composite_collides, false, "the composite form collides -- law 3 is not satisfied");
  assert.equal(x.concat_distinct, 1, "the separator form counted two pairs as two -- control is stale");
  assert.equal(x.composite_distinct, 2,
    "the composite key merged two genuinely different pairs -- the shipped guard can drop a pair silently");

  // AND THE SHIPPED BODY USES THE COMPOSITE, read from the live catalog rather than assumed.
  const src = await rootQuery(
    "select prosrc from pg_proc where oid = to_regprocedure('clara._agent_close_proposal_core(jsonb,uuid,jsonb,text,text,jsonb,text)')");
  const body = src.rows[0].prosrc;
  // SPECIFIC TO THE TWO PAIR-SET AGGREGATES. A bare count of the composite idiom comes back THREE,
  // because 0138's own FIX-8 duplicate-item rung already keys on it with `count(distinct ...)` --
  // measured, not assumed, and counting all three would have made this control pass for a reason
  // that has nothing to do with B11b's pair sets.
  const aggregates = (body.match(
    /array_agg\(distinct jsonb_build_array\(x\.el ->> 'check_key', x\.el ->> 'item_key'\)\)/g) ?? []).length;
  assert.equal(aggregates, 2,
    `expected BOTH pair-set aggregates to use the composite, found ${aggregates}`);
  const preexisting = (body.match(
    /count\(distinct jsonb_build_array\(x\.el ->> 'check_key', x\.el ->> 'item_key'\)\)/g) ?? []).length;
  assert.equal(preexisting, 1,
    "FIX-8's duplicate-item rung no longer keys on the composite -- the idiom moved out from under this control");
  assert.doesNotMatch(body, /'check_key'\)\s*\|\|\s*'\|'/,
    "a separator-joined pair key survives in the shipped body");
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
  // THE CONTROL IS REQUIRED, NOT OPTIONAL (Codex C6). Noting its absence let the cell go green on a
  // world with no viewer -- and without the control it cannot tell a working floor from an absent
  // one, which is the only thing it is here to distinguish. It FAILS instead.
  assert.ok(viewer.rows.length > 0,
    "no below-floor member in this world: this cell cannot tell a working floor from an absent one without one, so it fails rather than notes. buildWorld mints one; if it stopped, fix the fixture.");
  const asViewer = await humanQuery(viewer.rows[0].id,
    "select count(*)::int as n from clara.close_proposals where close_run_id=$1", [run]);
  assert.equal(asViewer.rows[0].n, 0, "a below-floor viewer read a model's rationale");
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
