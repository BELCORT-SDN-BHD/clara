// F-A4 PR-1c -- THE CLOSE-DOMAIN AGENT LIMB battery, part 3: clara.settle_close_proposal, the
// proposal carrier's terminal human door. Parts 1 and 2 are f-a4-pr1c-close-agent-limb.test.mjs
// (the ladder, the freeze, the proposal round trip) and f-a4-pr1c-walls-census.test.mjs (law 71,
// Tier C, the oracles, the roster census); all three share f-a4-pr1c-fixtures.mjs.
//
// ITS OWN FILE, not a third cell in part 1: the settle door is the answer to a finding this lane
// RAISED (adopted/withdrawn had no writer, so a proposal stuck `open` for ever and the partial
// unique index then blocked the lane from proposing again on that run), and a reviewer looking for
// "what closed that gap" should find one file rather than a cell buried among the freeze cells.
//
// CONTRACT-BLIND: driven from Annex I.1's review-card row ("adopt … decline with a reason") and
// Annex E.4's state domain, never from the migration's SQL text.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  humanQuery, rootQuery, endPool, printLaneNotes, printSkipCount, noteLane, markSkip, opk,
} from "./wave-a-fixtures.mjs";
import { CLR } from "./rig-helpers.mjs";
import { EXPN, BANK1 } from "./x56-fixtures.mjs";
import {
  caught, mintClosePrepSession, VERBS, proposalRows, tokens, inPeriodDraft,
  ensureLimb, limbGate, scene,
} from "./f-a4-pr1c-fixtures.mjs";

const gate = (t) => limbGate(t, markSkip);

const settle = (sub, { proposal, state, reason = null, opKey }) =>
  humanQuery(sub, "select clara.settle_close_proposal($1,$2,$3,$4) as r",
    [proposal, state, reason, opKey]);

before(async () => { await ensureLimb(noteLane); });
after(async () => {
  printLaneNotes("f-a4-pr1c-settle");
  printSkipCount("f-a4-pr1c-settle");
  await endPool();
});

test("fa4c.S1 the settle door's walls: attest_close_exception's own floor, a closed two-state domain, and a decline that must say why", async (t) => {
  if (gate(t)) return;
  const sc = await scene("s1");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-01", memo: "fa4c s1 draft", debit: EXPN, credit: BANK1, cents: 700 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  const proposed = await VERBS.propose(sc.s, {
    run, drafted: [{ check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: accepted." }] });
  assert.equal(proposed.status, "acted", `propose: ${JSON.stringify(tokens(proposed))}`);
  const pid = proposed.result.proposal_id;

  // THE FLOOR IS attest_close_exception's, and bob is the instrument that proves it: a bookkeeper
  // WITHOUT close_and_attest -- the same actor part 1's D2 cell uses against begin_close. Settling
  // is the other half of the act the capability governs (adopting authorises the very attestations
  // the reviewer is about to sign), so a lower floor here would be a side door onto key ②.
  const lowFloor = await caught(() => settle(sc.bob, { proposal: pid, state: "adopted", opKey: opk("fa4c-s1low") }));
  assert.equal(lowFloor?.code, CLR.authz, "a bookkeeper without close_and_attest cannot settle");
  assert.match(String(lowFloor?.detail ?? ""), /capability_missing/);

  // ONLY TWO STATES. `superseded` is the LANE's own stamp (written by _agent_close_proposal_core
  // when it replaces its predecessor) and `open` is a birth state; both refuse by TOKEN, not by a
  // raw CHECK violation, so a caller's typo is readable.
  for (const bad of ["superseded", "open", "adopted_maybe", null]) {
    const e = await caught(() => settle(sc.alice,
      { proposal: pid, state: bad, reason: "x", opKey: opk(`fa4c-s1bad`) }));
    assert.equal(e?.code, CLR.badRequest, `${bad} refuses CLR10`);
    assert.match(String(e?.detail ?? ""), /close_proposal_state_invalid/, `${bad} refuses by token`);
  }

  // A WITHDRAWAL MUST SAY WHY (abandon_close's own shape). An adoption need not: the attestations
  // it authorises each carry their own reason, per item.
  const noReason = await caught(() => settle(sc.alice,
    { proposal: pid, state: "withdrawn", reason: "   ", opKey: opk("fa4c-s1noreason") }));
  assert.equal(noReason?.code, CLR.badRequest);
  assert.match(String(noReason?.detail ?? ""), /fact_basis_missing/);

  // A FOREIGN proposal is NOT FOUND -- no existence oracle across firms.
  const other = await scene("s1b");
  const cross = await caught(() => settle(other.alice,
    { proposal: pid, state: "adopted", opKey: opk("fa4c-s1x") }));
  assert.equal(cross?.code, CLR.notFound, "a proposal outside the caller's firm is not found");

  // NONE of the above moved the row.
  const rows = await proposalRows(run);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "open", "every refusal left the proposal exactly as it was");
});

test("fa4c.S2 adopt and withdraw each FREE the run for a fresh proposal, settling never deletes, and a second settle refuses", async (t) => {
  if (gate(t)) return;
  const sc = await scene("s2");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-02", memo: "fa4c s2 draft", debit: EXPN, credit: BANK1, cents: 800 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  const drafted = [{ check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: accepted." }];
  const first = await VERBS.propose(sc.s, { run, drafted });
  const pid = first.result.proposal_id;

  // ADOPT. THE POINT OF THE WHOLE DOOR: uq_close_proposal_live is a partial unique index over
  // state='open', so until the row settles the lane can never propose again on this run -- which
  // is precisely the stuck lifecycle this verb was ruled in to close.
  const adopted = await settle(sc.alice, { proposal: pid, state: "adopted", opKey: opk("fa4c-s2adopt") });
  assert.equal(adopted.rows[0].r.state, "adopted");
  assert.ok(adopted.rows[0].r.settled_by, "and the answer records WHO settled it");
  let rows = await proposalRows(run);
  assert.equal(rows.length, 1, "settling is not a delete -- the row is still there (law 6)");
  assert.equal(rows[0].state, "adopted");
  assert.equal(rows[0].settle_reason, null, "an adoption carries no reason; its attestations do");
  assert.ok(rows[0].settled_at, "and both halves of the stamp landed");

  const second = await VERBS.propose(await mintClosePrepSession(sc.firm, sc.client), { run, drafted });
  assert.equal(second.status, "acted",
    `the run takes a FRESH proposal once the first is settled: ${JSON.stringify(tokens(second))}`);
  const pid2 = second.result.proposal_id;
  assert.notEqual(pid2, pid);
  assert.equal(second.result.superseded_proposal_id, null,
    "and it supersedes nothing -- there was no LIVE predecessor to supersede");

  // A SECOND settle on an already-settled proposal refuses BY TOKEN at the verb. The settle-only
  // trigger underneath is the structural backstop, not the message a reviewer should have to read.
  const again = await caught(() => settle(sc.alice,
    { proposal: pid, state: "withdrawn", reason: "changed my mind", opKey: opk("fa4c-s2again") }));
  assert.equal(again?.code, "CLR41");
  assert.match(String(again?.detail ?? ""), /close_proposal_already_settled/);

  // WITHDRAW the successor, with its mandatory reason on the record, and the run frees again.
  const wdKey = opk("fa4c-s2wd");
  const reason = "the reviewer disagrees with the drafted basis";
  const withdrawn = await settle(sc.alice,
    { proposal: pid2, state: "withdrawn", reason, opKey: wdKey });
  assert.equal(withdrawn.rows[0].r.state, "withdrawn");
  rows = await proposalRows(run);
  assert.equal(rows.length, 2, "BOTH rows survive");
  assert.equal(rows.filter((p) => p.state === "open").length, 0, "no live proposal stands");
  assert.equal(rows.find((p) => p.id === pid2).settle_reason, reason,
    "and the decline's reason is on the record, not just in the answer");
  const third = await VERBS.propose(await mintClosePrepSession(sc.firm, sc.client), { run, drafted });
  assert.equal(third.status, "acted", "a withdrawal frees the run exactly as an adoption does");

  // OP-KEY IDEMPOTENCY: the SAME key replays the stored result rather than raising
  // already_settled -- a retried click is a replay, not a second judgement.
  const replay = await settle(sc.alice, { proposal: pid2, state: "withdrawn", reason, opKey: wdKey });
  assert.equal(replay.rows[0].r.state, "withdrawn", "the settle is an ordinary idempotent op");
  assert.equal(replay.rows[0].r.proposal_id, pid2);
  rows = await proposalRows(run);
  assert.equal(rows.filter((p) => p.id === pid2).length, 1, "and the replay minted nothing new");
});

test("fa4c.S3 the lifecycle has no unreachable state: every value the CHECK admits now has a writer, and the human door is not one of them for 'superseded'", async (t) => {
  if (gate(t)) return;
  // The finding this door closes, stated as a census rather than as a story. `open` is the birth
  // state, `superseded` is the LANE's (proven live in part 1's C2), and adopted/withdrawn are this
  // door's (proven live in S2). A CHECK value with no writer is law 31's dead member; a CHECK value
  // with a writer nobody can reach is worse, because the row it governs sticks.
  // The ENUM form, not `like '%state%'`: ck_cp_state_settled matches that too and carries only one
  // of the four literals. Postgres renders `state in (...)` as `state = ANY (ARRAY[...])`.
  const def = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
      where c.conrelid='clara.close_proposals'::regclass and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%state = ANY%'`);
  assert.ok(def.rows[0]?.def, "the state-domain CHECK is the one being read");
  for (const v of ["open", "adopted", "withdrawn", "superseded"]) {
    assert.match(def.rows[0].def, new RegExp(`'${v}'`), `the domain admits ${v}`);
  }
  // The HUMAN door names only the two it may write -- read off its own prosrc, so a later widening
  // that let a reviewer stamp 'superseded' over the lane's own bookkeeping is a finding here.
  const src = await rootQuery(
    `select p.prosrc as s from pg_proc p
      where p.oid='clara.settle_close_proposal(uuid,text,text,text)'::regprocedure`);
  assert.match(src.rows[0].s, /p_state not in \('adopted', 'withdrawn'\)/,
    "the admissible set is the closed adopted/withdrawn pair");
  assert.doesNotMatch(src.rows[0].s, /'superseded'/,
    "and the human door never names the lane's own stamp");

  // There is no DELETE path, proven by trying it as the owner rather than inferred from absence.
  const sc = await scene("s3");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-03", memo: "fa4c s3 draft", debit: EXPN, credit: BANK1, cents: 900 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  const pid = (await VERBS.propose(sc.s, {
    run, drafted: [{ check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: accepted." }],
  })).result.proposal_id;
  await settle(sc.alice, { proposal: pid, state: "adopted", opKey: opk("fa4c-s3adopt") });
  const del = await caught(() => rootQuery(
    "set role clara_fn_owner; delete from clara.close_proposals where id=$1", [pid]));
  assert.ok(del, "a settled proposal cannot be deleted either");
});
