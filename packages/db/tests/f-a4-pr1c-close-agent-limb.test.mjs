// F-A4 PR-1c -- THE CLOSE-DOMAIN AGENT LIMB battery, part 1: the ladder, the freeze and the
// proposal round trip. Part 2 (law 71's wall, Tier C, the oracles and the roster census) is
// f-a4-pr1c-walls-census.test.mjs; both share f-a4-pr1c-fixtures.mjs.
//
// CONTRACT-BLIND: written from docs/plan/active/close-key-1-design.md v2 + its two annexes
// (§3.1 the verb set, §3.2 the ladder, §3.4 begin/abandon, §3.5 the dry run, §3.7 the proposal,
// §3.8 the receipts; Annex A.1/A.3 the mechanism, E.1/E.2/E.3/E.4 the shapes and the closed
// refusal vocabulary), never from the migration's own SQL text. Every wake call goes through a
// REAL clara_wake_interactive session with a REAL task-bound credential, so a missing grant, a
// missing allowlist row or an argument-name divergence is a finding HERE.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  opk, approveEntry, filedDocument, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import { ROLES, CLR, asRole } from "./rig-helpers.mjs";
import { beginClose, attestClose, EXPN, BANK1 } from "./x56-fixtures.mjs";
import {
  RATIONALE, MODEL, caught, derivedOpKey, mintClosePrepSession, mintUnboundClosePrep,
  VERBS, receiptById, proposalRows, tokens, inPeriodDraft, inPeriodDraftFull,
  ensureLimb, limbGate, scene,
} from "./f-a4-pr1c-fixtures.mjs";

const gate = (t) => limbGate(t, markSkip);

/** The B13 fixture shortcut, in one place with its own name so the cell that calls it reads as
 *  what it is. See fa4c.B1b's header for the adjudication and its limits. */
async function stampBeltFlag(entry) {
  const r = await asRole(ROLES.fnOwner, (c) => c.query(
    `update clara.journal_entries set flags = flags || '{"depreciation_charges": true}'::jsonb
       where id = $1 returning flags ? 'depreciation_charges' as ok`, [entry]));
  assert.equal(r.rows[0]?.ok, true, "the belt flag is on the draft (the prestate this cell needs)");
}

before(async () => { await ensureLimb(noteLane); });
after(async () => {
  printLaneNotes("f-a4-pr1c");
  printSkipCount("f-a4-pr1c");
  await endPool();
});

// =====================================================================================
// A -- THE LADDER: Tier A raises (nothing durable); Tier B's two universal rungs write a
// typed non-act receipt and COMMIT, so the reason survives.
// =====================================================================================

test("fa4c.A1 Tier A: no credential, wrong kind, unbound task, a crossed client pin and a hand-minted op key each refuse BEFORE any read", async (t) => {
  if (gate(t)) return;
  const sc = await scene("a1");

  // (a) no credential at all -> CLR03. A wake role with no secret bound reaches past the ACL and
  // dies on authority, which is the wall this cell means to prove.
  const noCred = await caught(() => roleQuery(ROLES.wakeInteractive,
    "select clara.wake_begin_close($1,$2,$3::jsonb,$4)",
    [sc.fy, RATIONALE, JSON.stringify(MODEL), derivedOpKey(sc.s.task, "wake_begin_close", sc.fy)]));
  assert.equal(noCred?.code, CLR.wake, "no wake credential -> CLR03");

  // (b) a credential of the WRONG KIND -> the allowlist refusal. No close_prep row was added for
  // any other kind, and no other kind's rows moved.
  const other = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    ["autodraft", sc.firm, null, sc.client]);
  const wrongKind = await caught(() => VERBS.listFy(
    { task: sc.s.task, secret: other.rows[0].secret }, { client: sc.client }));
  assert.equal(wrongKind?.code, CLR.wake, "an autodraft credential may not call a close_prep verb");

  // (c) a credential naming NO TASK -> wake_task_unbound. F14/D-13's whole point: no binding, no
  // act. It is a RAISE rather than a receipt precisely because a receipt cannot be written
  // without the task it is supposed to bind.
  const unbound = await mintUnboundClosePrep(sc.firm, sc.client);
  const noTask = await caught(() => VERBS.listFy(
    { task: sc.s.task, secret: unbound.secret }, { client: sc.client }));
  assert.equal(noTask?.code, CLR.wake, "an unbound credential refuses");
  assert.match(String(noTask?.detail ?? ""), /wake_task_unbound/, "and it says so by token");

  // (d) THE CLIENT PIN: a credential pinned to client X calling with client Y's fiscal year.
  const otherScene = await scene("a1b");
  const crossed = await caught(() => VERBS.begin(sc.s, { fy: otherScene.fy }));
  assert.equal(crossed?.code, CLR.wake, "a cross-client subject refuses at the pin");
  assert.match(String(crossed?.detail ?? ""), /wake_client_pin_mismatch/, "by its own token");

  // (e) A HAND-SUPPLIED op key that is not the derivation -> CLR10 op_key_not_derived (D-25).
  const forged = await caught(() => VERBS.begin(sc.s, { fy: sc.fy, opKey: "not-a-derived-key" }));
  assert.equal(forged?.code, CLR.badRequest, "an underived op key refuses CLR10");
  assert.match(String(forged?.detail ?? ""), /op_key_not_derived/, "by its own token");

  // (f) ZERO DURABLE EFFECT from any Tier-A refusal.
  const n = await rootQuery(
    `select (select count(*) from clara.agent_act_receipts where client_id=$1) as r,
            (select count(*) from clara.close_runs where client_id=$1) as runs`, [sc.client]);
  assert.equal(Number(n.rows[0].r), 0, "a Tier-A refusal writes no receipt");
  assert.equal(Number(n.rows[0].runs), 0, "and no close run");
});

test("fa4c.A2 Tier B universal rungs: a live hold and an incomplete receipt triple each REFUSE with a durable, readable receipt", async (t) => {
  if (gate(t)) return;
  const sc = await scene("a2");

  // B2 -- the triple. A blank rationale and a model missing its version are the two halves, and
  // the vector carries the failure rather than a raw constraint violation.
  const blank = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy, rationale: "   " });
  assert.equal(blank.status, "refused", "a blank rationale refuses");
  assert.deepEqual(tokens(blank), ["receipt_incomplete"], "typed receipt_incomplete");
  const rcpt = await receiptById(blank.receipt_id);
  assert.equal(rcpt.verdict, "refused", "the refusal is DURABLE -- the transaction committed");
  assert.equal(rcpt.via_wake_kind, "close_prep", "via_wake_kind is NOT NULL on the receipt (TA-P4)");
  assert.equal(rcpt.on_behalf_of, null, "on_behalf_of is NULL on the clocked lane, never inferred");
  assert.equal(rcpt.wake_task_id, sc.s.task, "and the receipt binds the TRIGGERING wake task");

  const noVersion = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy, model: { name: "m" } });
  assert.deepEqual(tokens(noVersion), ["receipt_incomplete"], "a model with no version refuses too");

  // B1 -- the hold, set through the HUMAN door, stopping the lane at its next write.
  await humanQuery(sc.alice,
    "select clara.hold_close_prep($1,$2,$3) as r", [sc.client, "rig: pause the lane", opk("fa4c-hold")]);
  const held = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });
  assert.equal(held.status, "refused", "a live hold stops the lane");
  assert.deepEqual(tokens(held), ["close_prep_held"], "typed close_prep_held");
  const beginHeld = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.ok(tokens(beginHeld).includes("close_prep_held"), "EVERY verb carries B1, not just the reads");

  // Release is a STAMP, never a delete: the history of who paused what survives.
  await humanQuery(sc.alice,
    "select clara.release_close_prep($1,$2,$3) as r", [sc.client, "rig: resume", opk("fa4c-rel")]);
  const rows = await rootQuery(
    "select released_at, release_reason from clara.close_prep_holds where client_id=$1", [sc.client]);
  assert.equal(rows.rows.length, 1, "the hold row survives its release");
  assert.ok(rows.rows[0].released_at, "stamped, not deleted");
  const after = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });
  assert.equal(after.status, "acted", "and the lane proceeds once released");

  // ARM-0 (law 68): a hold check that cannot identify its subject returns TRUE (held).
  const arm0 = await rootQuery("select clara._close_prep_hold_active(null,'close_prep') as h");
  assert.equal(arm0.rows[0].h, true, "ARM-0: a NULL client is HELD, never permitted");
});

test("fa4c.A3 the dry run ARMS NOTHING (F4's repair): no run, no gate rows, no status flip, and an ordinary human approve still succeeds after it", async (t) => {
  if (gate(t)) return;
  const sc = await scene("a3");
  const draft = await inPeriodDraftFull(sc.bob,
    { client: sc.client, postingDate: "2025-06-15", memo: "fa4c a3 draft", debit: EXPN, credit: BANK1, cents: 1000 });

  const before0 = await rootQuery(
    `select (select count(*) from clara.close_gate_results g join clara.close_runs r on r.id=g.close_run_id
              where r.client_id=$1) as gates,
            (select status from clara.fiscal_years where id=$2) as st`, [sc.client, sc.fy]);
  const dry = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });
  assert.equal(dry.status, "acted", "the dry run answers");
  assert.equal(dry.result.dry_run, true, "and says it is a dry run");
  assert.equal(dry.result.checks.length, 14, "over the whole fourteen-row catalog (census C15)");

  const post = await rootQuery(
    `select (select count(*) from clara.close_gate_results g join clara.close_runs r on r.id=g.close_run_id
              where r.client_id=$1) as gates,
            (select status from clara.fiscal_years where id=$2) as st,
            (select count(*) from clara.close_runs where client_id=$1) as runs`, [sc.client, sc.fy]);
  assert.equal(Number(post.rows[0].gates), Number(before0.rows[0].gates), "zero close_gate_results rows added");
  assert.equal(post.rows[0].st, before0.rows[0].st, "fiscal_years.status is unmoved");
  assert.equal(Number(post.rows[0].runs), 0, "and no run was opened");

  // THE POINT: CLR19 is not armed, so a human can still work the year.
  const ok = await approveEntry(sc.alice,
    { entry: draft.entry, expectedRevision: draft.revision, opKey: opk("fa4c-a3ap") });
  assert.ok(ok, "an ordinary approve on an FY-dated draft still succeeds after a dry run");

  // The two in-body drawer-1 checks report not_measurable_before_finalize, never a literal pass
  // (law 27(2) applied to our own read; registered risk R-6).
  const inBody = dry.result.checks.filter((c) =>
    ["pl_retained_earnings_roll", "opening_continuity_tie"].includes(c.check_key));
  assert.equal(inBody.length, 2, "both in-body checks are present");
  for (const c of inBody) {
    assert.equal(c.state, "not_measurable_before_finalize", `${c.check_key} is honest about what it cannot see`);
  }
});

// =====================================================================================
// B -- THE FREEZE (§3.4): B3/B4/B5 on begin, B6 on abandon.
// =====================================================================================

test("fa4c.B1 wake_begin_close is the LAST act of preparation: it acts on a clean year and refuses on a live run and on an unclosed earlier year", async (t) => {
  if (gate(t)) return;
  const sc = await scene("b1");

  const acted = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(acted.status, "acted", `the freeze proceeded: ${JSON.stringify(tokens(acted))}`);
  const run = acted.result.close_run_id;
  assert.ok(run, "a close run was opened");

  // The ACTED receipt names the RUN, never the year: a year can lawfully be begun, abandoned and
  // begun again, so an FY-keyed receipt would make Tier C's count wrong on the second lawful begin.
  const r = await receiptById(acted.receipt_id);
  assert.equal(r.act_kind, "begin_close");
  assert.equal(r.subject_kind, "close_run");
  assert.equal(r.subject_id, run);
  assert.equal(r.verdict, "acted");
  assert.deepEqual(r.rung_vector, [], "an acted receipt carries an EMPTY failing vector");
  assert.equal(r.model_name, MODEL.name, "and the model triple, mechanically");
  assert.equal(r.model_version, MODEL.version);

  // B4 -- a second begin on the same FY, from a NEW wake task (a new task is a new operation, so
  // this is a re-measurement, not a replay).
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const again = await VERBS.begin(s2, { fy: sc.fy });
  assert.equal(again.status, "refused");
  assert.ok(tokens(again).includes("close_already_in_progress"), "the estate's own token string, reused (D-12)");

  // B5 -- ordering. A SECOND year on the same client, with the first still unclosed.
  const p = await humanQuery(sc.alice,
    "select clara.propose_fiscal_year($1,$2::date) as r", [sc.client, "2026-01-01"]);
  const fy2 = await humanQuery(sc.alice,
    "select clara.open_fiscal_year($1,$2,$3::date,$4::date,$5,$6) as r",
    [sc.client, "FY2026", "2026-01-01", p.rows[0].r.ends_on, null, opk("fa4c-fy2")]);
  const s3 = await mintClosePrepSession(sc.firm, sc.client);
  const outOfOrder = await VERBS.begin(s3, { fy: fy2.rows[0].r.fiscal_year_id });
  assert.equal(outOfOrder.status, "refused");
  assert.ok(tokens(outOfOrder).includes("close_ordering_violation"), "oldest-first, in the estate's own words");
});

test("fa4c.B1b rung B13 (D-22's recut): an outstanding belt draft dated AT OR BEFORE the FY end refuses the freeze; the same draft dated AFTER it does not", async (t) => {
  if (gate(t)) return;
  // ARM 2 of B13, and the sharper half of F13. The FA oracle answers
  // {due:false,'period_draft_outstanding'} whenever ANY depreciation draft stands -- a NOT-DUE
  // answer hiding a draft CLR19 will refuse forever once the year freezes. So the rung reads the
  // draft ITSELF, with the oracle's own predicate (status='draft' and flags ? 'depreciation_
  // charges') PLUS the date bound the oracle lacks. Both polarities, because a rung that refuses
  // everything is not a rung.
  //
  // FIXTURE SHORTCUT, DECLARED (the forceControlMismatch precedent, x56-fixtures.mjs): the ONLY
  // writer of the `depreciation_charges` flag is clara._fa_run_period_core, and standing up a
  // real FA register (a signed authority + an asset + a swept period) to reach ONE prestate would
  // make this cell an FA test wearing a close test's name. MEASURED, not assumed:
  // clara.draft_entry filters p_flags to its own known set, so the flag arrives `{}` -- caught by
  // this cell's first red. The flag is therefore stamped directly, as clara_fn_owner, on a draft
  // the governed door created. This reaches a PRESTATE; it claims nothing about how the flag
  // would arise in production. The stranded-PRIOR-YEAR half of D-22 (arm 1, design cell C-20 (i))
  // still needs the real register and is NOT covered here.
  const late = await scene("b1b_late");
  const lateDraft = await draftEntryV3(late.bob, {
    client: late.client, resolution: freshResolution(late.bob, late.client, { subjectKind: "manual", subjectId: null }),
    memo: "fa4c b1b: depreciation draft AFTER the year end", postingDate: "2026-06-30",
    flags: { depreciation_charges: true },
    lines: [
      { account_code: EXPN, debit_cents: 4200, credit_cents: 0, description: "dr" },
      { account_code: BANK1, debit_cents: 0, credit_cents: 4200, description: "cr" },
    ],
    opKey: opk("fa4c-b1b-late"),
  });
  assert.ok(lateDraft.entry_id, "the out-of-period depreciation draft stands");
  await stampBeltFlag(lateDraft.entry_id);
  const proceeds = await VERBS.begin(late.s, { fy: late.fy });
  assert.equal(proceeds.status, "acted",
    `a draft dated AFTER ends_on does not strand anything, so the freeze proceeds: ${JSON.stringify(tokens(proceeds))}`);

  const inside = await scene("b1b_in");
  const inDraft = await draftEntryV3(inside.bob, {
    client: inside.client, resolution: freshResolution(inside.bob, inside.client, { subjectKind: "manual", subjectId: null }),
    memo: "fa4c b1b: depreciation draft INSIDE the year", postingDate: "2025-11-30",
    flags: { depreciation_charges: true },
    lines: [
      { account_code: EXPN, debit_cents: 4200, credit_cents: 0, description: "dr" },
      { account_code: BANK1, debit_cents: 0, credit_cents: 4200, description: "cr" },
    ],
    opKey: opk("fa4c-b1b-in"),
  });
  assert.ok(inDraft.entry_id, "the in-period depreciation draft stands");
  await stampBeltFlag(inDraft.entry_id);
  const refused = await VERBS.begin(inside.s, { fy: inside.fy });
  assert.equal(refused.status, "refused");
  assert.ok(tokens(refused).includes("belt_period_unrun"),
    "freezing would strand a charge CLR19 then refuses forever");
  const rung = refused.rung_vector.find((v) => v.token === "belt_period_unrun");
  assert.ok(rung.reasons.includes("fa_draft_outstanding"),
    `the receipt NAMES which arm refused: ${JSON.stringify(rung.reasons)}`);
  const st = await rootQuery("select status from clara.fiscal_years where id=$1", [inside.fy]);
  assert.equal(st.rows[0].status, "open", "and the year never flipped");
});

test("fa4c.B2 wake_abandon_close at TA-P1 C's ruled width: a HUMAN-started run yields, an ATTESTED run does not", async (t) => {
  if (gate(t)) return;
  const sc = await scene("b2");
  // A HUMAN opens the run. D-20 hands her the abandon anyway -- started_by is READ and recorded,
  // never a refusal.
  const humanRun = (await beginClose(sc.alice, { fy: sc.fy })).close_run_id;
  const ok = await VERBS.abandon(sc.s, { run: humanRun });
  assert.equal(ok.status, "acted", `she may abandon a run she did not open: ${JSON.stringify(tokens(ok))}`);
  assert.ok(ok.started_by, "and the answer records WHOSE run it was, by column");
  const st = await rootQuery("select state from clara.close_runs where id=$1", [humanRun]);
  assert.equal(st.rows[0].state, "abandoned");

  // Now a run carrying a LIVE human attestation -- B6's wall. A drafts-in-period failure gives us
  // a drawer-2 item a professional can sign against.
  const draft = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-07-01", memo: "fa4c b2 draft", debit: EXPN, credit: BANK1, cents: 2500 });
  const run2 = (await beginClose(sc.alice, { fy: sc.fy })).close_run_id;
  await attestClose(sc.alice, {
    closeRun: run2, checkKey: "unapproved_drafts_in_period",
    reason: "rig: the professional accepts this draft in writing", itemKey: draft,
  });
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const walled = await VERBS.abandon(s2, { run: run2 });
  assert.equal(walled.status, "refused");
  assert.deepEqual(tokens(walled), ["close_run_attested"],
    "voiding a human's signed drawer-2 statement is not an act the register hands anyone");
  const still = await rootQuery("select state from clara.close_runs where id=$1", [run2]);
  assert.equal(still.rows[0].state, "in_progress", "and the refusal left the run exactly as it was");
});

// =====================================================================================
// C -- THE PROPOSAL ROUND TRIP. The sharpest cell in the battery: propose -> the HUMAN adopts
// through attest_close_exception(p_from_proposal) -> authorship and verbatim-adoption are
// stamped BY THE DOOR, never derived by string comparison afterwards (law 27(2)).
// =====================================================================================

test("fa4c.C1 propose -> human adopts: authored_by='agent' and adopted_verbatim is TRUE for the drafted words and FALSE for edited ones", async (t) => {
  if (gate(t)) return;
  const sc = await scene("c1");
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-03-03", memo: "fa4c c1 draft one", debit: EXPN, credit: BANK1, cents: 1100 });
  const d2 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-03-04", memo: "fa4c c1 draft two", debit: EXPN, credit: BANK1, cents: 1200 });
  // The third draft is planted BEFORE the freeze on purpose: once wake_begin_close flips the year
  // to `closing`, CLR19 refuses every new in-period write -- which is F4's wall doing exactly its
  // job, and a fixture that tried to plant it afterwards would be testing the wall, not the door.
  const d3 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-03-05", memo: "fa4c c1 draft three", debit: EXPN, credit: BANK1, cents: 1300 });

  const begun = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(begun.status, "acted", `begin: ${JSON.stringify(tokens(begun))}`);
  const run = begun.result.close_run_id;

  const textA = "Clara: this draft is an immaterial accrual the client confirmed by email on 2026-01-04.";
  const textB = "Clara: this draft duplicates an already-posted invoice and should be discarded.";
  const drafted = [
    { check_key: "unapproved_drafts_in_period", item_key: d1, text: textA },
    { check_key: "unapproved_drafts_in_period", item_key: d2, text: textB },
  ];
  const proposed = await VERBS.propose(sc.s, { run, drafted });
  assert.equal(proposed.status, "acted", `propose: ${JSON.stringify(tokens(proposed))}`);
  const pid = proposed.result.proposal_id;
  assert.ok(pid, "a durable proposal row, not a sentence in chat");
  assert.ok(proposed.result.bound_digests.unapproved_drafts_in_period,
    "and it BINDS the gate digest it was measured against");

  // THE HUMAN KEYS IT. attest_close_exception is a bookkeeper-floor human door behind the
  // close_and_attest capability; the agent holds neither.
  const adopted = await humanQuery(sc.alice,
    `select clara.attest_close_exception(p_close_run => $1, p_check_key => $2, p_reason => $3,
       p_op_key => $4, p_item_key => $5, p_from_proposal => $6) as r`,
    [run, "unapproved_drafts_in_period", textA, opk("fa4c-adopt1"), d1, pid]);
  assert.equal(adopted.rows[0].r.authored_by, "agent", "the door records WHO wrote the words");
  assert.equal(adopted.rows[0].r.adopted_verbatim, true, "and that they were adopted unchanged");

  const edited = await humanQuery(sc.alice,
    `select clara.attest_close_exception(p_close_run => $1, p_check_key => $2, p_reason => $3,
       p_op_key => $4, p_item_key => $5, p_from_proposal => $6) as r`,
    [run, "unapproved_drafts_in_period", `${textB} (edited by the reviewer)`, opk("fa4c-adopt2"), d2, pid]);
  assert.equal(edited.rows[0].r.authored_by, "agent", "still agent-authored");
  assert.equal(edited.rows[0].r.adopted_verbatim, false, "but NOT verbatim -- the reviewer changed it");

  // The stamps live on the ROW, not only in the answer.
  const rows = await rootQuery(
    `select item_key, authored_by, adopted_verbatim from clara.close_attestations
      where close_run_id=$1 and superseded_at is null order by item_key`, [run]);
  assert.equal(rows.rows.length, 2, "two live attestations");
  assert.deepEqual(rows.rows.map((x) => x.authored_by), ["agent", "agent"]);
  assert.equal(rows.rows.filter((x) => x.adopted_verbatim === true).length, 1);
  assert.equal(rows.rows.filter((x) => x.adopted_verbatim === false).length, 1);

  // A HUMAN-authored attestation (no proposal) still reads honestly as such.
  const own = await attestClose(sc.alice, {
    closeRun: run, checkKey: "unapproved_drafts_in_period", reason: "The reviewer's own words.", itemKey: d3 });
  assert.equal(own.authored_by, "human", "a human's own words are recorded as the human's");
  assert.equal(own.adopted_verbatim, null, "and verbatim-adoption is not a question that arises");
});

test("fa4c.C2 the proposal carrier is SUPERSEDE-never-delete: one live row per run, B11 refuses a duplicate at the same vector, a moved vector supersedes", async (t) => {
  if (gate(t)) return;
  // 2026 deliberately: the mover below is an UNDATED FILING, and PR-1a's undated gate is bounded by
  // `filed_at::date <= fy.ends_on` (D-18), so a filing made today only lands in the population of a
  // year that has not yet ended.
  const sc = await scene("c2", { startsOn: "2026-01-01" });
  const d1 = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2026-04-01", memo: "fa4c c2 draft", debit: EXPN, credit: BANK1, cents: 900 });
  const run = (await VERBS.begin(sc.s, { fy: sc.fy })).result.close_run_id;
  const drafted = [{ check_key: "unapproved_drafts_in_period", item_key: d1, text: "Clara: accepted." }];
  const first = await VERBS.propose(sc.s, { run, drafted });
  assert.equal(first.status, "acted", `propose: ${JSON.stringify(tokens(first))}`);

  // B11 -- a SECOND proposal at the SAME digest vector, from a new task, is a duplicate.
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const dup = await VERBS.propose(s2, { run, drafted });
  assert.equal(dup.status, "refused");
  assert.deepEqual(tokens(dup), ["close_proposal_exists"]);

  // MOVE a measurement, through a door the freeze does NOT wall. A second in-period DRAFT is
  // impossible here by design -- CLR19 refuses every books write into a `closing` year, which is
  // F4's wall doing its job -- but FILING a document is not a books write, so an undated filing
  // lands in PR-1a's `undated_documents` population even mid-close and moves that gate's digest
  // while the run's recorded one stays put.
  const undated = await filedDocument(sc.alice, { firm: sc.firm, client: sc.client });
  assert.ok(undated.filingId, "an undated filing exists");
  const movedDraft = [...drafted,
    { check_key: "undated_documents", item_key: undated.filingId, text: "Clara: this letter carries no date." }];
  const s3 = await mintClosePrepSession(sc.firm, sc.client);
  const stale = await VERBS.propose(s3, { run, drafted: movedDraft });
  assert.equal(stale.status, "refused");
  assert.deepEqual(tokens(stale), ["close_proposal_stale"], "a moved measurement invalidates the binding");

  // Re-measure the moved gate through the estate's own evaluator, then re-propose: the first
  // proposal is SUPERSEDED, never deleted, and exactly one row stays live.
  const reMeasured = await rootQuery(
    "select clara._evaluate_one_gate($1,'undated_documents') as r", [run]);
  assert.ok(reMeasured.rows[0].r, "the gate re-measured");
  const s4 = await mintClosePrepSession(sc.firm, sc.client);
  const second = await VERBS.propose(s4, { run, drafted: movedDraft });
  assert.equal(second.status, "acted", `re-propose: ${JSON.stringify(tokens(second))}`);
  assert.equal(second.result.superseded_proposal_id, first.result.proposal_id, "the predecessor is named");

  const all = await proposalRows(run);
  assert.equal(all.length, 2, "BOTH rows survive -- reverse-not-delete (law 6)");
  assert.equal(all.filter((p) => p.state === "open").length, 1, "exactly one live proposal");
  assert.equal(all.find((p) => p.id === first.result.proposal_id).state, "superseded");

  // NO DELETE PATH EXISTS, proven by trying it as the owner role rather than inferred from absence.
  const del = await caught(() => rootQuery(
    "set role clara_fn_owner; delete from clara.close_proposals where id=$1", [first.result.proposal_id]));
  assert.ok(del, "a delete on the proposal carrier is refused");
});
