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
import { CLR, ROLES, asRole } from "./rig-helpers.mjs";
import { EXPN, BANK1 } from "./x56-fixtures.mjs";
import {
  caught, mintClosePrepSession, VERBS, proposalRows, tokens, inPeriodDraft,
  ensureLimb, limbGate, scene,
} from "./f-a4-pr1c-fixtures.mjs";

const gate = (t) => limbGate(t, markSkip);

const settle = (sub, { proposal, state, reason = null, opKey }) =>
  humanQuery(sub, "select clara.settle_close_proposal($1,$2,$3,$4) as r",
    [proposal, state, reason, opKey]);

/** Walk the review card's per-item half: attest_close_exception naming THIS proposal, which is
 *  what FIX-7's adoption wall counts. The real flow, not a shortcut around the wall. */
const adoptOneItem = (sub, { run, itemKey, proposal, text }) =>
  humanQuery(sub,
    `select clara.attest_close_exception(p_close_run => $1, p_check_key => $2, p_reason => $3,
       p_op_key => $4, p_item_key => $5, p_from_proposal => $6) as r`,
    [run, "unapproved_drafts_in_period", text, opk("fa4c-adopt-item"), itemKey, proposal]);

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

  // FIX-7: adoption is a claim that the professional signed the drafted work, so the door counts
  // the live agent-authored attestations before it will stamp it. Walk the ONE the card offers --
  // which is the real flow the review card performs, not a shortcut around the new wall.
  await adoptOneItem(sc.alice, { run, itemKey: d1, proposal: pid, text: "Clara: accepted." });

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

test("fa4c.S4 (FIX-7) 'adopted' must PROVE its attestations: zero linked signatures refuses, a partial walk refuses, the full walk lets it through", async (t) => {
  if (gate(t)) return;
  const sc = await scene("s4");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-04", memo: "fa4c s4 draft one", debit: EXPN, credit: BANK1, cents: 610 });
  const d2 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-05", memo: "fa4c s4 draft two", debit: EXPN, credit: BANK1, cents: 620 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  const pid = (await VERBS.propose(sc.s, { run, drafted: [
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: item one accepted." },
    { check_key: "unapproved_drafts_in_period", item_key: d2, text: "Clara: item two accepted." },
  ] })).result.proposal_id;

  // ZERO linked attestations. "Adopted" is a claim that a professional signed this work; stamping
  // it here would put a false professional record on a close, which is the class TA-P4 exists to
  // prevent.
  const none = await caught(() => settle(sc.alice,
    { proposal: pid, state: "adopted", opKey: opk("fa4c-s4none") }));
  assert.equal(none?.code, "CLR41", "an unattested proposal cannot be adopted");
  assert.match(String(none?.detail ?? ""), /close_proposal_attestations_missing/);

  // PARTIAL is still a lie -- one of the two items is signed, the other is not. The wall counts
  // coverage over the drafted set, not merely "some attestation exists".
  await adoptOneItem(sc.alice, { run, itemKey: d1, proposal: pid, text: "Clara: item one accepted." });
  const partial = await caught(() => settle(sc.alice,
    { proposal: pid, state: "adopted", opKey: opk("fa4c-s4part") }));
  assert.equal(partial?.code, "CLR41", "a partially-signed proposal cannot be adopted either");
  assert.match(String(partial?.detail ?? ""), /close_proposal_attestations_missing/);
  let rows = await proposalRows(run);
  assert.equal(rows[0].state, "open", "and both refusals left the proposal open");

  // The FULL walk lets it through -- the wall admits the honest flow, which is what stops it being
  // a wall that simply never opens.
  await adoptOneItem(sc.alice, { run, itemKey: d2, proposal: pid, text: "Clara: item two accepted." });
  const ok = await settle(sc.alice, { proposal: pid, state: "adopted", opKey: opk("fa4c-s4ok") });
  assert.equal(ok.rows[0].r.state, "adopted");

  // WITHDRAWAL proves nothing and needs nothing: declining is the refusal of that same work. A
  // fresh proposal on the freed run, settled straight to withdrawn with zero attestations.
  const pid2 = (await VERBS.propose(await mintClosePrepSession(sc.firm, sc.client), { run, drafted: [
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: re-drafted." },
  ] })).result.proposal_id;
  const wd = await settle(sc.alice,
    { proposal: pid2, state: "withdrawn", reason: "the reviewer rejects the basis", opKey: opk("fa4c-s4wd") });
  assert.equal(wd.rows[0].r.state, "withdrawn", "a decline needs no attestations");

  // MUTANT: with the coverage conjunct removed the first refusal above would have adopted an
  // entirely unsigned proposal. Proven by asking the live body whether the guard is actually
  // there -- a cell that only ever sees the refusal cannot tell a wall from a typo.
  const src = await rootQuery(
    `select p.prosrc as s from pg_proc p
      where p.oid='clara.settle_close_proposal(uuid,text,text,text)'::regprocedure`);
  assert.match(src.rows[0].s, /close_proposal_attestations_missing/,
    "the adoption wall is in the live body, not merely in this cell's expectations");
  assert.match(src.rows[0].s, /a\.authored_by = 'agent'/,
    "and it counts AGENT-authored attestations -- a human's own words are not evidence the drafted text was adopted");
  assert.match(src.rows[0].s, /a\.superseded_at is null/,
    "live ones only -- a superseded signature is not a standing one");
});

test("fa4c.S5 (FIX-8) a proposal drafts at most one text per (check_key, item_key)", async (t) => {
  if (gate(t)) return;
  const sc = await scene("s5");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-06", memo: "fa4c s5 draft", debit: EXPN, credit: BANK1, cents: 630 });
  // BOTH drafts are planted before the freeze: once wake_begin_close flips the year to `closing`,
  // CLR19 refuses every new in-period write (F4's wall doing its job).
  const d2 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-05-07", memo: "fa4c s5 draft two", debit: EXPN, credit: BANK1, cents: 640 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  // TWO texts for ONE item. attest_close_exception resolves the adoption with `limit 1` over an
  // unordered array, so which text the reviewer ends up signing would be a coin flip and the
  // receipt could name a text the card never showed.
  const dup = await VERBS.propose(sc.s, { run, drafted: [
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: first wording." },
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: DIFFERENT wording." },
  ] });
  assert.equal(dup.status, "refused", `a duplicated item refuses: ${JSON.stringify(tokens(dup))}`);
  assert.ok(await proposalRows(run).then((r) => r.length === 0), "and nothing was stored");

  // The same shape with DISTINCT items is admitted -- the guard is about duplication, not arity.
  const ok = await VERBS.propose(await mintClosePrepSession(sc.firm, sc.client), { run, drafted: [
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: one." },
    { check_key: "unapproved_drafts_in_period", item_key: d2, text: "Clara: two." },
  ] });
  assert.equal(ok.status, "acted", `two distinct items are fine: ${JSON.stringify(tokens(ok))}`);

  // MUTANT: drive the trigger DIRECTLY with a hand-built duplicate row, as the owner, so the
  // refusal is the trigger's and not the agent core's shape rung. Without the trigger this insert
  // would succeed.
  const raw = await caught(() => asRole(ROLES.fnOwner, (c) => c.query(
    `insert into clara.close_proposals(firm_id, client_id, fiscal_year_id, close_run_id, state,
        proposed_by, bound_digests, drafted, narrative, model_name, model_version, rationale)
      values ($1,$2,$3,$4,'withdrawn', clara.agent_user_id(), '{}'::jsonb,
        $5::jsonb, 'n', 'm', 'v', 'r')`,
    [sc.firm, sc.client, sc.fy, run, JSON.stringify([
      { check_key: "k", item_key: "i", text: "a" }, { check_key: "k", item_key: "i", text: "b" }])])));
  assert.ok(raw, "the trigger refuses a hand-built duplicate too");
  assert.match(String(raw?.detail ?? ""), /close_proposal_drafted_duplicate_item/);
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
  await adoptOneItem(sc.alice, { run, itemKey: d1, proposal: pid, text: "Clara: accepted." });
  await settle(sc.alice, { proposal: pid, state: "adopted", opKey: opk("fa4c-s3adopt") });
  // SEPARATE STATEMENTS + TYPED CODE (FIX-9) -- see the twin cell's note in part 1.
  const del = await caught(() => asRole(ROLES.fnOwner, (c) =>
    c.query("delete from clara.close_proposals where id=$1", [pid])));
  assert.equal(del?.code, CLR.immutable, "a settled proposal cannot be deleted either, and says so by code");
});
