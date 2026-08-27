// F-A4 PR-1c -- battery part 4: the RUNGS AND WALLS the double review found shipping with no cell
// that fires them, plus the two schedule/floor attacks the reviewers described. Parts 1-3 are
// f-a4-pr1c-close-agent-limb / -walls-census / -settle-door; all four share f-a4-pr1c-fixtures.mjs.
//
// WHY THESE CELLS EXIST (fix order FIX-5/6/10): judgement logic that never fires in a battery is
// judgement logic nobody has read at runtime. B3 (`drawer1_not_clean`) and B14
// (`reopen_correction_in_flight`) are refusal branches that decide whether a year may freeze; C-5
// is the ONE path in this limb that writes to the books, and it is exactly FIX-1's worst case
// (an ACTED catch-up whose receipt must be honest). Each cell drives the real wrapper through a
// real wake session and then asserts the receipt census, not just the answer.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  opk, getPool,
} from "./wave-a-fixtures.mjs";
import { ROLES, asRole } from "./rig-helpers.mjs";
import {
  beginClose, finalizeClose, reopenFY, reopenerFor, birthCounterparty, forceControlMismatch,
  EXPN, BANK1,
} from "./x56-fixtures.mjs";
import {
  RATIONALE, MODEL, caught, derivedOpKey, callWake, mintClosePrepSession, VERBS,
  receiptById, tokens, inPeriodDraft, ensureLimb, limbGate, scene,
} from "./f-a4-pr1c-fixtures.mjs";

const gate = (t) => limbGate(t, markSkip);

before(async () => { await ensureLimb(noteLane); });
after(async () => {
  printLaneNotes("f-a4-pr1c-rungs");
  printSkipCount("f-a4-pr1c-rungs");
  await endPool();
});

// =====================================================================================
// FIX-10 · B3 -- drawer 1 must be clean on a FRESH dry run, and `unknown` is not clean.
// =====================================================================================

test("fa4c.R1 (FIX-10/B3) a drawer-1 check off `pass` refuses the freeze, and the receipt names the failing check", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r1");
  // FORCE a drawer-1 identity off `pass` through the estate's own machinery rather than by
  // rewriting an evaluator: an AR control account with a real GL movement and no matching
  // subledger item makes ar_control_tie read `mismatch`. The x56 fixture routes both legs of its
  // P&L entries through BANK1 precisely so the control accounts stay untouched at zero -- so one
  // entry that DOES touch AR1 is the smallest true break.
  // The AR control account cannot simply be posted to: every control-class line requires a
  // counterparty (the estate own subledger rule, measured). x56 ships the purpose-built
  // fixture for exactly this prestate — a phantom open_items row naming a REAL counterparty but
  // grounded on an entry that never touched the control account, so the subledger side carries a
  // balance the GL side does not. It is a FIXTURE SHORTCUT to a prestate, declared as such in
  // its own docstring, not a claim about how the mismatch would arise in production.
  const cp = await birthCounterparty(sc.alice, { client: sc.client, name: "FA4C R1 Debtor", kind: "customer" });
  await forceControlMismatch(sc.alice, {
    client: sc.client, domain: "ar", groundEntry: sc.revenueEntry, counterparty: cp, cents: 5000,
  });

  // Measure FIRST -- a cell that assumes the break exists is the vacuous-green class. The dry run
  // is the same body rung B3 reads.
  const dry = await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });
  const drawer1 = dry.result.checks.filter((c) => c.drawer === 1);
  const unclean = drawer1.filter((c) => c.state !== "pass" && c.state !== "not_measurable_before_finalize");
  if (unclean.length === 0) {
    // The fixture could not break a drawer-1 identity through a governed door on this frontier.
    // Say so and skip rather than assert a wall that was never armed (law 2).
    markSkip();
    noteLane("fa4c.R1: no drawer-1 identity could be broken through a governed door -- B3's firing arm not driven here");
    t.skip("B3's fixture could not arm a drawer-1 break on this frontier");
    return;
  }

  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const refused = await VERBS.begin(s2, { fy: sc.fy });
  assert.equal(refused.status, "refused", `B3 must refuse an unclean drawer 1: ${JSON.stringify(tokens(refused))}`);
  const rung = refused.rung_vector.find((v) => v.token === "drawer1_not_clean");
  assert.ok(rung, "the refusal is drawer1_not_clean, by token");
  assert.ok(Array.isArray(rung.failing) && rung.failing.length >= 1,
    "and it NAMES the failing check(s) rather than saying only that something failed");
  const st = await rootQuery("select status from clara.fiscal_years where id=$1", [sc.fy]);
  assert.equal(st.rows[0].status, "open", "the year never flipped");

  // MUTANT: the same fixture with the drawer-1 break removed must PROCEED, or this cell is
  // measuring something other than B3. A fresh scene is the control.
  const clean = await scene("r1ctl");
  const ok = await VERBS.begin(clean.s, { fy: clean.fy });
  assert.equal(ok.status, "acted",
    `the control year (drawer 1 clean) freezes: ${JSON.stringify(tokens(ok))}`);
});

// =====================================================================================
// FIX-10 · B14 -- a reopened year with a correction in flight, and the TA-P11 claim that the
// rung and the clock read the SAME population.
// =====================================================================================

test("fa4c.R2 (FIX-10/B14) a reopened year with an unapproved in-period draft refuses the re-freeze, and close_prep_due drops the same year", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r2");
  // Close the year for real, then reopen it -- the only lawful way to reach `reopened`.
  const run = await beginClose(sc.alice, { fy: sc.fy });
  assert.ok(run.close_run_id);
  const fin = await finalizeClose(sc.alice, { fy: sc.fy, selfAttestation: "fa4c r2 self-attestation" });
  assert.ok(fin.receipt_id, `finalize produced a receipt: ${JSON.stringify(fin)}`);
  const reopener = await reopenerFor(sc.alice, { closer: sc.alice, alternate: sc.bob });
  await reopenFY(reopener, {
    fy: sc.fy, reason: "fa4c r2: a correction is needed", correctionTarget: { check_key: "unapproved_drafts_in_period" },
    attestation: "fa4c r2 attestation" });
  let st = await rootQuery("select status from clara.fiscal_years where id=$1", [sc.fy]);
  assert.equal(st.rows[0].status, "reopened", "the year is genuinely reopened (the rung's own precondition)");

  // THE CORRECTION IN FLIGHT: an unapproved draft dated inside the reopened year.
  const draft = await inPeriodDraft(sc.bob,
    { client: sc.client, postingDate: "2025-08-08", memo: "fa4c r2 correction", debit: EXPN, credit: BANK1, cents: 4321 });
  assert.ok(draft, "the correction draft stands");

  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const refused = await VERBS.begin(s2, { fy: sc.fy });
  assert.equal(refused.status, "refused");
  assert.ok(tokens(refused).includes("reopen_correction_in_flight"),
    `blocking the human's own fix behind CLR19 is what B14 exists to prevent: ${JSON.stringify(tokens(refused))}`);

  // TA-P11's OWN CLAIM, measured: the rung and clause (1) of close_prep_due read the SAME
  // population through _close_gate_drafts, so the clock must NOT offer a year the rung would
  // then refuse -- otherwise the lane wakes for a freeze it can never perform, every day.
  await rootQuery(
    "update clara.wake_credentials set created_at = now() - interval '3 days' where client_id=$1", [sc.client]);
  const dueWhileInFlight = await roleQuery(ROLES.runtime,
    "select * from clara.close_prep_due() where fiscal_year_id = $1", [sc.fy]);
  assert.equal(dueWhileInFlight.rows.length, 0,
    "the clock does not wake her for a year B14 would refuse");

  // POST THE CORRECTION -> both the rung and the clock change their minds together.
  const rev = await rootQuery(
    "select revision_token as t from clara.journal_entries where id=$1", [draft]).catch(() => null);
  await humanQuery(sc.alice,
    "select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r",
    [draft, rev?.rows?.[0]?.t ?? null, opk("fa4c-r2-ap")]).catch(() => null);
  const stillDraft = await rootQuery("select status from clara.journal_entries where id=$1", [draft]);
  if (stillDraft.rows[0].status !== "draft") {
    // THE CLOCK IS ASKED FIRST, and the order is load-bearing: beginning the close would put a
    // live run on the year, and clause (4) of close_prep_due drops a year with a run in progress
    // — correctly, and for a completely different reason than the one this cell is measuring.
    // Asking after the freeze would read a green that says nothing about B14's predicate.
    await rootQuery(
      "update clara.wake_credentials set created_at = now() - interval '3 days' where client_id=$1", [sc.client]);
    const dueAfter = await roleQuery(ROLES.runtime,
      "select * from clara.close_prep_due() where fiscal_year_id = $1", [sc.fy]);
    assert.equal(dueAfter.rows.length, 1,
      "the clock re-admits the same year once the correction is posted -- one reading of 'a correction is in flight', shared with the rung");
    assert.equal(dueAfter.rows[0].reason, "retry_after_refusal",
      "and it says WHY it is offering the year again, rather than leaving the caller to derive it");

    // NOW the rung: it stops refusing on the very predicate the clock just cleared.
    const s3 = await mintClosePrepSession(sc.firm, sc.client);
    const after = await VERBS.begin(s3, { fy: sc.fy });
    assert.ok(!tokens(after).includes("reopen_correction_in_flight"),
      `once the correction is posted the rung stops refusing -- the wall is not permanent: ${JSON.stringify(tokens(after))}`);
  } else {
    noteLane("fa4c.R2: the correction draft could not be approved on this frontier -- the post-correction half is not driven");
  }
});

// =====================================================================================
// FIX-5 · the SET CONSTRAINTS schedule bypass, attacked exactly as the reviewer described.
// =====================================================================================

test("fa4c.R3 (FIX-5) forcing the deferred wall IMMEDIATE cannot buy a second acted receipt for one transition", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r3");
  const begun = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(begun.status, "acted", `begin: ${JSON.stringify(tokens(begun))}`);
  const run = begun.result.close_run_id;

  // The wall's "exactly one" reads a COUNT at commit time, so a session that forces the trigger to
  // fire while the count is still 1 and then inserts a second matching receipt would satisfy the
  // trigger and still end with two. The index below is what makes the schedule irrelevant.
  const c = await getPool().connect();
  let err = null;
  try {
    await c.query("begin");
    await c.query("set role clara_fn_owner");
    await c.query("set constraints all immediate");
    await c.query(
      `insert into clara.agent_act_receipts(firm_id, client_id, act_kind, subject_kind, subject_id,
          acting_actor, on_behalf_of, via_wake_kind, wake_task_id, model_name, model_version,
          rationale, verdict, rung_vector, op_key)
        select firm_id, client_id, act_kind, subject_kind, subject_id,
          acting_actor, on_behalf_of, via_wake_kind, wake_task_id, model_name, model_version,
          rationale, verdict, rung_vector, op_key || ':second'
        from clara.agent_act_receipts
        where subject_kind='close_run' and subject_id=$1 and act_kind='begin_close' and verdict='acted'`,
      [run]);
    await c.query("commit");
  } catch (e) {
    err = e;
    try { await c.query("rollback"); } catch { /* aborted */ }
  } finally {
    try { await c.query("reset role"); } catch { /* best effort */ }
    try { await c.query("reset all"); } catch { /* best effort */ }
    c.release();
  }
  assert.ok(err, "a second ACTED receipt for one close-run transition is refused");
  assert.equal(err.code, "23505", "and it is refused by an INDEX, which no scheduling verb can move");

  const n = await rootQuery(
    `select count(*)::int as n from clara.agent_act_receipts
      where subject_kind='close_run' and subject_id=$1 and act_kind='begin_close' and verdict='acted'`, [run]);
  assert.equal(n.rows[0].n, 1, "exactly one acted receipt survives the attack");

  // POSITIVE CONTROL: the index is PARTIAL, so it must not block the run's OTHER transition.
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const abandoned = await VERBS.abandon(s2, { run });
  assert.equal(abandoned.status, "acted",
    `the abandon still receipts on the same run: ${JSON.stringify(tokens(abandoned))}`);
});

// =====================================================================================
// FIX-6 · the bookkeeper floor on the DIRECT read path.
// =====================================================================================

test("fa4c.R4 (FIX-6) a below-floor viewer reads NO receipt row directly, while the bookkeeper still does", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r4");
  await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });
  const planted = await rootQuery(
    "select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [sc.client]);
  assert.ok(planted.rows[0].n >= 1, "there is a real receipt to read (the cell is not vacuous)");

  // A VIEWER of the same firm. The direct table read must return nothing -- model names,
  // rationales, wake tasks and failing-rung vectors are a bookkeeper+ surface (TA-P4 (4)), and
  // before this fix the RLS policy asked only about the firm.
  const viewer = await rootQuery(
    `select u.id from clara.users u join clara.firm_memberships m on m.user_id = u.id
      where m.firm_id = $1 and m.status='active' and clara.role_rank(m.role) < clara.role_rank('bookkeeper')
      limit 1`, [sc.firm]);
  if (viewer.rows.length === 0) {
    markSkip();
    noteLane("fa4c.R4: this world has no below-floor member -- the viewer half is not driven");
    t.skip("no viewer-rank member in the fixture world");
    return;
  }
  const asViewer = await humanQuery(viewer.rows[0].id,
    "select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [sc.client]);
  assert.equal(asViewer.rows[0].n, 0, "a viewer reads ZERO receipt rows on the direct path");

  // The bookkeeper+ reader still works -- a floor that also locks out its legitimate consumers is
  // not a fix.
  const asBookkeeper = await humanQuery(sc.alice,
    "select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [sc.client]);
  assert.ok(asBookkeeper.rows[0].n >= 1, "the bookkeeper+ direct read still returns rows");
  const panel = await humanQuery(sc.alice, "select clara.list_agent_act_receipts($1,null) as r", [sc.client]);
  assert.ok(Array.isArray(panel.rows[0].r) && panel.rows[0].r.length >= 1, "and so does the gated reader");

  // MUTANT: the floor is IN THE POLICY, not merely in the reader -- read the live policy text.
  const pol = await rootQuery(
    `select pg_get_expr(p.polqual, p.polrelid) as q from pg_policy p
      join pg_class c on c.oid = p.polrelid
      where c.relname='agent_act_receipts' and p.polname='p_aar_human'`);
  assert.match(pol.rows[0].q, /actor_role_rank/,
    "the rank floor is part of the policy expression, so it binds every reader and not only the polite one");
});

// =====================================================================================
// FIX-1/FIX-10 · C-5 -- the ACTED depreciation catch-up, the one place this limb writes to the
// books, with the receipt census asserted afterward.
// =====================================================================================

test("fa4c.R5 (FIX-10/C-5 + FIX-1) the with-authority catch-up ACTS, and leaves exactly one honest ACTED receipt", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r5");
  // NO live authority yet: B9 refuses, and that refusal is durable.
  const s0 = await mintClosePrepSession(sc.firm, sc.client);
  const noAuth = await callWake(s0.secret, "wake_run_depreciation_catchup",
    [{ name: "p_client", cast: "uuid" }, { name: "p_through", cast: "date" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }],
    [sc.client, "2025-12-31", RATIONALE, JSON.stringify(MODEL),
      derivedOpKey(s0.task, "wake_run_depreciation_catchup", sc.client)]);
  assert.deepEqual(tokens(noAuth), ["depreciation_authority_absent"],
    "she executes an existing authority and never signs one");

  // A LIVE, HUMAN-SIGNED authority. propose is bookkeeper, sign is admin+ -- both HUMAN doors;
  // the lane only ever executes what a human already authorised.
  const proposed = await humanQuery(sc.bob,
    "select clara.propose_depreciation_authority(p_client => $1, p_cadence => $2, p_op_key => $3) as r",
    [sc.client, "monthly", opk("fa4c-r5-prop")]).catch(() => null);
  const authId = proposed?.rows?.[0]?.r?.authority_id ?? proposed?.rows?.[0]?.r?.id;
  if (!authId) {
    markSkip();
    noteLane("fa4c.R5: propose_depreciation_authority unavailable on this fixture -- the ACTED half is not driven");
    t.skip("no depreciation authority could be proposed for this client");
    return;
  }
  await humanQuery(sc.alice,
    "select clara.sign_depreciation_authority(p_client => $1, p_authority => $2, p_op_key => $3) as r",
    [sc.client, authId, opk("fa4c-r5-sign")]);
  const live = await rootQuery(
    "select count(*)::int as n from clara.fa_depreciation_authorities where client_id=$1 and status='live'",
    [sc.client]);
  assert.equal(live.rows[0].n, 1, "exactly one LIVE signed authority (B9's own precondition)");

  // THE ACTED PATH. This client has no enrolled assets, so the oracle answers nothing-due and the
  // 12-iteration loop exits on its first ask -- the ACT still happens, which is the point: this is
  // the branch that writes an ACTED receipt for a books-touching verb, and FIX-1's whole failure
  // mode was that branch returning some OTHER receipt's id.
  const s1 = await mintClosePrepSession(sc.firm, sc.client);
  const acted = await callWake(s1.secret, "wake_run_depreciation_catchup",
    [{ name: "p_client", cast: "uuid" }, { name: "p_through", cast: "date" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }],
    [sc.client, "2025-12-31", RATIONALE, JSON.stringify(MODEL),
      derivedOpKey(s1.task, "wake_run_depreciation_catchup", sc.client)]);
  assert.equal(acted.status, "acted", `the catch-up acts once its authority is live: ${JSON.stringify(tokens(acted))}`);
  assert.ok(Array.isArray(acted.result.periods_run), "and reports which periods it ran");

  // THE RECEIPT CENSUS -- FIX-1's coupling. The returned id must be an ACTED receipt for THIS
  // task, not the earlier refusal's.
  const r = await receiptById(acted.receipt_id);
  assert.equal(r.verdict, "acted", "the ACTED answer names an ACTED receipt");
  assert.equal(r.wake_task_id, s1.task, "bound to the task that performed it");
  assert.equal(r.act_kind, "depreciation_catchup");
  assert.deepEqual(r.rung_vector, [], "with an empty failing vector");
  assert.notEqual(acted.receipt_id, noAuth.receipt_id, "and it is NOT the earlier refusal's row");

  const census = await rootQuery(
    `select verdict, count(*)::int as n from clara.agent_act_receipts
      where client_id=$1 and act_kind='depreciation_catchup' group by verdict order by verdict`, [sc.client]);
  assert.deepEqual(census.rows, [{ verdict: "acted", n: 1 }, { verdict: "refused", n: 1 }],
    "one honest refusal and one honest act -- both durable, neither wearing the other's id");
});

// =====================================================================================
// FIX-1 · the two retry directions the reviewers rig-reproduced, now proven closed.
// =====================================================================================

test("fa4c.R6 (FIX-1) an outcome-changed retry on ONE task never returns the other outcome's receipt", async (t) => {
  if (gate(t)) return;
  const sc = await scene("r6");
  const s = await mintClosePrepSession(sc.firm, sc.client);
  const call = () => VERBS.dryRun(s, { client: sc.client, fy: sc.fy });

  // ACTED first.
  const acted = await call();
  assert.equal(acted.status, "acted");
  const actedReceipt = await receiptById(acted.receipt_id);
  assert.equal(actedReceipt.verdict, "acted");

  // Now HOLD the lane and retry with the SAME derived op key inside the SAME task: the outcome
  // changes. Before the fix this returned the ACTED row and the refusal left no trace at all.
  await humanQuery(sc.alice, "select clara.hold_close_prep($1,$2,$3) as r",
    [sc.client, "fa4c r6: brake", opk("fa4c-r6-hold")]);
  const refused = await call();
  assert.equal(refused.status, "refused", "the retry genuinely refuses");
  assert.notEqual(refused.receipt_id, acted.receipt_id,
    "and it does NOT return the acted receipt's id");
  const refusedReceipt = await receiptById(refused.receipt_id);
  assert.equal(refusedReceipt.verdict, "refused", "the refusal has its own durable row -- it left a trace");
  assert.deepEqual(refusedReceipt.rung_vector.map((v) => v.token), ["close_prep_held"]);
  assert.equal(refusedReceipt.op_key, actedReceipt.op_key, "both rows carry the SAME derived op key");

  // AND BACK: release the hold and retry again on the same task. The acted outcome REPLAYS the
  // original acted row (D-25's own semantics) rather than minting a second act.
  await humanQuery(sc.alice, "select clara.release_close_prep($1,$2,$3) as r",
    [sc.client, "fa4c r6: resume", opk("fa4c-r6-rel")]);
  const again = await call();
  assert.equal(again.status, "acted");
  assert.equal(again.receipt_id, acted.receipt_id,
    "a same-outcome retry REPLAYS the stored row -- the design's replay semantics are unchanged");

  const rows = await rootQuery(
    `select verdict, count(*)::int as n from clara.agent_act_receipts
      where wake_task_id=$1 and act_kind='close_dry_run' group by verdict order by verdict`, [s.task]);
  assert.deepEqual(rows.rows, [{ verdict: "acted", n: 1 }, { verdict: "refused", n: 1 }],
    "exactly two rows for the task: one act, one refusal, each once");

  // MUTANT: the identity guard itself. A hand-planted row wearing this act's key but ANOTHER
  // task's identity must not be returned -- the read-back has to refuse it.
  const foreign = await mintClosePrepSession(sc.firm, sc.client);
  const bad = await caught(() => asRole(ROLES.fnOwner, (c) => c.query(
    `insert into clara.agent_act_receipts(firm_id, client_id, act_kind, subject_kind, subject_id,
        acting_actor, on_behalf_of, via_wake_kind, wake_task_id, model_name, model_version,
        rationale, verdict, rung_vector, op_key)
      values ($1,$2,'close_dry_run','fiscal_year',$3, clara.agent_user_id(), null, 'close_prep',
        $4, 'm', 'v', 'r', 'acted', '[]'::jsonb, $5)`,
    [sc.firm, sc.client, sc.fy, foreign.task, actedReceipt.op_key])));
  assert.ok(bad, "a second ACTED row for the same (firm, kind, subject, op_key, vector) is refused by uq_aar");
  assert.equal(bad.code, "23505", "by the unique key, structurally");
});
