// #929 (riders wave 3, lane 05) -- `clara._plan_overlap_warning` LOSES ITS 0045 TEMPLATE ARM. The
// accounting-plan overlap advisory 0281 (#909) widened to name a sibling plan ALONGSIDE a live
// 0045 adjustment template now names ONLY the sibling plan: the template arm 0281's own header
// called "moot" once #929 lands is gone, by name, from the function body.
//
// This is step 3 of 3 of the 0045 recurring-adjustment template lane's retirement (#788 owner
// ruling 2026-09-18): #927 closed the three human-write doors, #928 retired the daily runtime
// sweep, this ticket drops the LAST live surface the lane still reached through the plan lane.
//
// The claims this battery exists to prove (the ticket's own Agent Brief, "Remaining scope"):
//
//   1. `_plan_overlap_warning`'s template arm is retired: a live `clara.adjustment_templates` row
//      -- however it got there, historical residue or a rig fixture planted by direct INSERT --
//      no longer contributes an entry to the advisory, alone or alongside a sibling plan.
//   2. The sibling-plan arm (#909) is the ONLY arm left: `kind` can only ever read
//      `'accounting_plan_overlap'` now; no entry is ever keyed by `template_id` again.
//   3. Nothing downstream needed to change in the FORMS: the three plan-creating doors and their
//      web forms read only `.name`, never `.kind` or `.template_id` (0281's own header).
//
// …and the two the FIX ROUND added to 0283 (2026-09-23), both of them defects in the arm that
// SURVIVES the retirement rather than in the retirement itself:
//
//   4. FIX 1 (ADV-L05-03 / L05-SPEC-09) — the surviving arm self-excludes the caller's own plan BY
//      IDENTITY, not by basis value, so two plans with byte-identical bases (the TOTAL overlap,
//      which this rig's own seed mints four at a time) warn about each other instead of hiding.
//      The two-argument signature that carried the by-value exclusion is dropped with it.
//   5. FIX 2 (ADV-L05-04) — all three plan-creating doors take the client advisory rung
//      (203005004) above any plan row lock, so two CONCURRENT creations for one client serialise
//      and the second is warned about the first instead of both answering null.
//
// SEAM: `clara.create_accounting_plan` and `clara.revise_accounting_plan`, the shared doors both
// `plan-overlap-sibling-arm.test.mjs` (#909) and `accounting-plans.test.mjs`'s own
// `p640.schedule.overlap` (#640) already treat as the seam for this function.
//
// CONTRACT-BLIND against the ticket's own Agent Brief, frontier-gated on migration 0283's own
// STABLE STEM (`retire_plan_overlap_template_arm$`) -- never `plan_overlap_sibling_arm$` (0281),
// which a database can carry WITHOUT this ticket's retirement.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTxn, raceTwoHumanCalls } from "./rig-txn.mjs";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, buildWorkWorld, freshWorkClient, opk, basis,
  instructionRef, createAccountingPlan, createAccountingPlanCall, reviseAccountingPlan,
} from "./accrual-adjustments-fixtures.mjs";

const MIGRATION = "0283_retire_plan_overlap_template_arm.sql";
const STEM = "retire_plan_overlap_template_arm$";
const FN = "clara._plan_overlap_warning(uuid,jsonb,uuid)";
const FN_ACL = "{clara_fn_owner=X/clara_fn_owner}";

/** The three callers 0283 RECUTS (its fix round's FIX 1 and FIX 2), by their post-recut
 *  sha256(prosrc) MEASURED on this rig after the migration applied. Until the fix round these were
 *  NON-regression pins at the pre-images 0280/0281/0282 all name (84b67058... / 87c9f1e9... /
 *  b3bd1006...); 0283 now moves all three, and those pre-image values survive as the FRESH-APPLY
 *  half of 0283's own prestate. This file's own outside-in re-proof that the migration's text
 *  produced exactly these bodies, never transcribed from the migration's own header. */
const RECUT = [
  { fn: "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)",
    sha: "99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424" },
  { fn: "clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)",
    sha: "8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886" },
  { fn: "clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)",
    sha: "31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5" },
];

let world = null;
let ready = false;

before(async () => {
  world = await buildWorkWorld();
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_PLAN_OVERLAP_TEMPLATE_ARM_RETIRED !== "1") {
    throw new Error(
      `#929 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) ` +
      "and CLARA_ALLOW_MISSING_PLAN_OVERLAP_TEMPLATE_ARM_RETIRED is unset -- this is a FOCUSED " +
      "run and must fail loudly, not skip. Preload " +
      "./tests/plan-overlap-template-arm-retired-preintegration-gate.mjs for an estate sweep " +
      "against a pre-#929 chain.");
  }
});
after(async () => {
  printLaneNotes("plan-overlap-template-arm-retired");
  printSkipCount("plan-overlap-template-arm-retired");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return true; }
  return false;
}

const ALICE = () => world.users.alice;

/** Plants a live 0045 template row directly -- the retired lane's own doors can never create one
 *  any more (#927), so a direct INSERT is the only way this shape can still exist: either
 *  historical residue predating the retirement, or a rig fixture, exactly as
 *  `plan-overlap-sibling-arm.test.mjs`'s own pre-#929 "Rig combo/overlap template" cells did. */
async function plantLiveTemplate({ client, from, codes, name }) {
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
  await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, proposed_by, proposed_op_key,
        signed_by, signed_at)
       values ($1,$2,'live',$3,'monthly',$4,false,
               $5::jsonb,'rig #929 template', repeat('f',64), $6, $7, $6, now())`,
    [firm, client, name, from,
      JSON.stringify(codes.map((c, i) => ({ account_code: c, debit_cents: i === 0 ? 100 : 0, credit_cents: i === 0 ? 0 : 100 }))),
      ALICE(), opk(`p929-${name}`)]);
}

test("p929.template-alone -- a live 0045 template row, on its own, contributes NOTHING: overlap_warning is null even though the accounts intersect exactly", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p929alone");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";
  const probeBasis = basis({ memo: "Rig 929 alone basis" });
  const codes = probeBasis.lines.map((l) => l.account_code);

  await plantLiveTemplate({ client, from, codes, name: "Rig 929 alone template" });

  const probe = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig 929 alone probe",
    effectiveFrom: from, basis: probeBasis,
  });
  assert.ok(probe.plan_id, "the plan is created regardless -- still never a refusal");
  assert.equal(probe.overlap_warning, null,
    "the retired template arm names nothing any more, even for an exact account match");
});

test("p929.template-with-sibling -- a live 0045 template row ALONGSIDE a genuine sibling plan: the warning names only the sibling", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p929combo");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";
  const probeBasis = basis({ memo: "Rig 929 combo shared basis" });
  const codes = probeBasis.lines.map((l) => l.account_code);

  const sibling = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig 929 combo sibling plan",
    effectiveFrom: from, basis: basis({ memo: "Rig 929 combo sibling basis" }),
  });
  assert.equal(sibling.overlap_warning, null, "no sibling exists yet when this one is created");

  await plantLiveTemplate({ client, from, codes, name: "Rig 929 combo template" });

  const probe = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig 929 combo probe",
    effectiveFrom: from, basis: probeBasis,
  });
  assert.ok(probe.overlap_warning, "the sibling plan still warns");
  assert.equal(probe.overlap_warning.kind, "accounting_plan_overlap",
    "kind can only ever read accounting_plan_overlap now -- the template's own label is retired");
  assert.equal(probe.overlap_warning.templates.length, 1,
    "the legacy template row is invisible; ONLY the sibling plan is named (0281's own 'combined' case is moot)");
  assert.equal(probe.overlap_warning.templates[0].name, "Rig 929 combo sibling plan");
  assert.ok(probe.overlap_warning.templates[0].plan_id, "...keyed by plan_id, honestly");
  assert.equal(probe.overlap_warning.templates[0].template_id, undefined,
    "no entry is ever keyed by template_id any more -- that field belonged to the retired arm alone");
});

// ---------------------------------------------------------------------------------------------
// p929.identical-basis -- THE TOTAL-OVERLAP CASE THE SURVIVING ARM USED TO SWALLOW.
//
// 0281 (#909) gave `_plan_overlap_warning` no plan id, so the arm excluded the caller's OWN
// freshly-inserted plan BY BASIS VALUE (`r.basis is distinct from p_basis`). That excludes every
// OTHER plan carrying the same basis too -- and byte-identical bases are not a curiosity here: the
// rig's own seed mints four "Monthly office rent accrual" plans per client, 4 ms apart. So the one
// overlap a human most needs told, TOTAL overlap, was the one case that answered null.
//
// This cell drives both directions through the two doors the shared function serves, so the fix
// cannot be "delete the self-exclusion" (which would make every creation warn about itself).
// ---------------------------------------------------------------------------------------------
test("p929.identical-basis -- two plans with BYTE-IDENTICAL bases warn about each other, and neither is ever named by its own creation or its own revision", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p929identical");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";
  // ONE basis value, used verbatim for both plans: the exact shape the by-value self-exclusion
  // could not tell apart from "this is my own row".
  const shared = () => basis({ memo: "Rig 929 identical basis" });

  const planA = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig 929 identical plan A",
    effectiveFrom: from, basis: shared(),
  });
  assert.equal(planA.overlap_warning, null,
    "the first plan on this client has no sibling -- and must never name ITSELF");

  const planB = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig 929 identical plan B",
    effectiveFrom: from, basis: shared(),
  });
  assert.ok(planB.overlap_warning,
    "a sibling plan whose basis is byte-identical is a TOTAL overlap and must be named");
  assert.equal(planB.overlap_warning.kind, "accounting_plan_overlap");
  assert.equal(planB.overlap_warning.templates.length, 1,
    "exactly the one sibling -- not B itself as well");
  assert.equal(planB.overlap_warning.templates[0].plan_id, planA.plan_id);
  assert.equal(planB.overlap_warning.templates[0].name, "Rig 929 identical plan A");

  // …and through the OTHER door: A, revised to the very basis it already carries, names B and
  // never itself. A warning that names your own row teaches the reader to skip the key.
  const revisedA = await reviseAccountingPlan(ALICE(), {
    plan: planA.plan_id, effectiveFrom: from, basis: shared(),
  });
  assert.ok(revisedA.overlap_warning, "A, revised, sees B -- whose basis is identical to A's own");
  assert.equal(revisedA.overlap_warning.templates.length, 1,
    "the revising plan must never appear in its own warning");
  assert.equal(revisedA.overlap_warning.templates[0].plan_id, planB.plan_id);
  assert.equal(revisedA.overlap_warning.templates[0].name, "Rig 929 identical plan B");
});

// ---------------------------------------------------------------------------------------------
// p929.concurrent-creation -- THE WINDOW TWO SESSIONS USED TO WALK THROUGH.
//
// The advisory is computed INSIDE the creating transaction. Before the client rung, two sessions
// creating overlapping plans for one client each read the other's row as uncommitted and BOTH
// answered null -- the exact "may not fire depending on creation order" #909 was filed over,
// surviving into the concurrent case. The rung (203005004, the client rung
// clara.retire_adjustment_template already takes) makes the second session wait for the first and
// then SEE it.
//
// The waiting is OBSERVED in pg_locks, not timed, so a door that does not take the rung fails this
// cell in milliseconds instead of after a timeout.
// ---------------------------------------------------------------------------------------------
const CLIENT_RUNG = 203005004;

test("p929.concurrent-creation -- two sessions creating overlapping plans for ONE client serialise on the client rung, so the second is warned about the first instead of both answering null", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p929race");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";
  const common = { client, authorityRef: ref, effectiveFrom: from };

  const first = createAccountingPlanCall({
    ...common, purpose: "Rig 929 race plan FIRST",
    basis: basis({ memo: "Rig 929 race first basis", cents: 41000 }),
    opKey: opk("p929-race-a"),
  });
  const second = createAccountingPlanCall({
    ...common, purpose: "Rig 929 race plan SECOND",
    basis: basis({ memo: "Rig 929 race second basis", cents: 42000 }),
    opKey: opk("p929-race-b"),
  });

  const race = await raceTwoHumanCalls({
    subA: ALICE(), sqlA: first.sql, paramsA: first.params,
    subB: ALICE(), sqlB: second.sql, paramsB: second.params,
    lockClassId: CLIENT_RUNG,
  });

  assert.equal(race.bError, null, "the second creation must succeed -- this rung serialises, it never refuses");
  assert.ok(race.waited,
    "the second session never waited on the client advisory rung -- the two creations overlapped, "
    + "so each read the other's plan as uncommitted and the advisory can only answer null for both");
  assert.equal(race.a.overlap_warning, null,
    "the FIRST session sees nothing: the second session's row did not exist when it read");
  assert.ok(race.b.overlap_warning,
    "the SECOND session must see the first, exactly as it would have in sequence");
  assert.equal(race.b.overlap_warning.kind, "accounting_plan_overlap");
  assert.equal(race.b.overlap_warning.templates.length, 1);
  assert.equal(race.b.overlap_warning.templates[0].plan_id, race.a.plan_id);
  assert.equal(race.b.overlap_warning.templates[0].name, "Rig 929 race plan FIRST");
});

test("p929.tail -- outside-in re-proof of 0283's own tail: the template arm is gone by name, the two-argument signature with it, the surviving arm self-excludes by plan id, and each caller takes the client rung above any plan row lock", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select p.prosrc as src, pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
            p.provolatile as vol, coalesce(p.proacl::text,'(null)') as acl,
            coalesce(array_to_string(p.proconfig,','),'<none>') as cfg
       from pg_proc p where p.oid = to_regprocedure($1)`,
    [FN]);
  assert.equal(r.rowCount, 1, "clara._plan_overlap_warning does not resolve");
  const row = r.rows[0];

  // (T.1) THE TEMPLATE ARM IS GONE -- by name.
  assert.doesNotMatch(row.src, /adjustment_template_overlap/,
    "the retired adjustment_template_overlap kind is still present");
  assert.doesNotMatch(row.src, /clara\.adjustment_templates/,
    "the recut function still scans clara.adjustment_templates");

  // (T.2) THE SIBLING ARM SURVIVES, and its self-exclusion is now BY IDENTITY (0283's FIX 1).
  assert.match(row.src, /accounting_plan_overlap/, "the sibling-plan kind is missing");
  assert.match(row.src, /clara\.accounting_plans/, "the sibling arm no longer scans clara.accounting_plans");
  assert.match(row.src, /clara\.accounting_plan_revisions/, "the sibling arm no longer scans clara.accounting_plan_revisions");
  assert.match(row.src, /p\.id is distinct from p_self_plan/,
    "the self-exclusion no longer names the caller's own plan id");
  assert.doesNotMatch(row.src, /is distinct from p_basis/,
    "the by-value self-exclusion is still there -- a byte-identical sibling is still hidden by it");
  assert.match(row.src, /'active','paused'/, "the active/paused restriction is missing");

  // ...and the two-argument signature that carried the by-value exclusion is GONE, so nobody can
  // reach the old blind spot by calling the overload instead.
  const arity = await rootQuery(
    "select coalesce(array_agg(p.oid::regprocedure::text order by p.pronargs), '{}'::text[]) as sigs"
    + "  from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
    + " where n.nspname = 'clara' and p.proname = '_plan_overlap_warning'");
  assert.equal(arity.rows[0].sigs.length, 1,
    "clara._plan_overlap_warning must resolve at exactly one signature, not " + arity.rows[0].sigs.join(", "));
  assert.match(arity.rows[0].sigs[0], /\(uuid,jsonb,uuid\)$/,
    "the one surviving signature is not the three-argument one");

  // (T.3) POSTURE unmoved.
  assert.equal(row.owner, "clara_fn_owner");
  assert.equal(row.secdef, true);
  assert.equal(row.vol, "s", "clara._plan_overlap_warning must stay STABLE");
  assert.equal(row.cfg, "search_path=clara, pg_temp");
  assert.equal(row.acl, FN_ACL, "0283 must not grant EXECUTE to any application role");

  // (T.4) THE THREE RECUT CALLERS: each at the body 0283's own text produces, each taking the
  //       client rung (FIX 2) ABOVE any clara.accounting_plans row lock, each passing its own plan
  //       id to the advisory (FIX 1).
  for (const sig of RECUT) {
    const c = await rootQuery(
      `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha, p.prosrc as src
         from pg_proc p where p.oid = to_regprocedure($1)`, [sig.fn]);
    assert.equal(c.rows[0].sha, sig.sha,
      `${sig.fn} is not at the body 0283 writes -- either the migration changed or another ticket recut it`);
    const src = c.rows[0].src;
    const rung = src.indexOf("pg_advisory_xact_lock(203005004");
    assert.ok(rung > 0, `${sig.fn} does not take the client rung 203005004`);
    assert.match(src, /clara\._plan_overlap_warning\([^)]*, (?:v_plan|p_plan)\)/,
      `${sig.fn} calls the advisory without passing its own plan id`);
    const rowLock = src.indexOf("from clara.accounting_plans where id");
    if (rowLock > 0) {
      assert.ok(rung < rowLock,
        `${sig.fn} takes the client rung AFTER locking a clara.accounting_plans row -- 0238's order for this rung is the other way round`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// p1036.containment-closed -- THE ONE MINTING PATH `p929.containment` PINNED IS CLOSED, NOT
// MERELY HELD SHUT BY A FLAG.
//
// #927 closed `propose_adjustment_template` and `sign_adjustment_template`, #928 deleted the daily
// sweep, #929 (this migration) took the advisory's template arm. `p929.containment` (this file,
// until #1036) measured the ONE path the three left standing -- `clara.wake_establish_
// prepayment_schedule` -> `clara._agent_prepayment_schedule_core` ->
// `clara._propose_adjustment_template_core` -- and pinned that it was held shut only by
// `clara.wake_engine_sources.close_prep.enabled = false`, a runtime-side flag the DATABASE itself
// never reads (0138's own header on `packages/runtime/lib/wake-engine.mjs`'s claim step).
//
// #1036 (migration 0315_prepayment_wake_reroute.sql) closed that path from the OTHER end: the
// wrapper no longer reaches the agent core or the template core at all, at ANY flag setting --
// it lands in `clara.prepayment_schedules` through `clara._prepayment_schedule_core`'s new 'wake'
// lane instead (`prepayment-wake-reroute.test.mjs` drives it end to end, flag ENABLED, and
// measures the resulting schedule and the zero adjustment_templates rows). So the three
// containment facts `p929.containment` pinned -- the allowlist's one row, the wrapper's one grant,
// the flag's value -- are no longer load-bearing for safety: this cell re-measures them once, as
// the CURRENT (unchanged) shape rather than as a tripwire, and adds the one fact that actually
// closed the residual.
// ---------------------------------------------------------------------------------------------
let rerouted = null;
async function hasReroute() {
  if (rerouted !== null) return rerouted;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'prepayment_wake_reroute$'");
  rerouted = Number(r.rows[0].n) > 0;
  return rerouted;
}

test("p1036.containment-closed -- clara._propose_adjustment_template_core has NO caller anywhere in "
  + "clara (not merely an agent-core caller held shut by a flag); the wrapper's allowlist row, grant "
  + "and the close_prep flag are unchanged by the reroute", async (t) => {
  if (unready(t)) return;
  if (!(await hasReroute())) {
    if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE !== "1") {
      throw new Error(
        "#1036 premise 0315_prepayment_wake_reroute.sql is not applied and "
        + "CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE is unset -- this is a FOCUSED run and must "
        + "fail loudly, not skip. Preload ./tests/prepayment-wake-reroute-preintegration-gate.mjs "
        + "for an estate sweep against a pre-#1036 chain.");
    }
    t.skip("#1036 (0315_prepayment_wake_reroute) not applied");
    return;
  }

  // (1) THE RESIDUAL IS CLOSED, BY NAME, ACROSS THE WHOLE SCHEMA -- the stronger claim than
  //     "the agent core did not call it this time": NOTHING in clara mentions it any more.
  const callers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc ilike '%_propose_adjustment_template_core%'`);
  assert.deepEqual(callers.rows, [],
    `clara._propose_adjustment_template_core still has a caller: ${JSON.stringify(callers.rows)}`);

  // (2) THE TEMPLATE CORE ITSELF is unchanged: still resolves at one signature, still ungranted.
  const core = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_propose_adjustment_template_core'`);
  assert.equal(core.rowCount, 1, "the template core resolves at exactly one signature");
  assert.equal(core.rows[0].acl, "clara_fn_owner=X/clara_fn_owner",
    "the template core gained a grant -- it is reachable from an application role");

  // (3) THE WRAPPER'S OWN SHAPE IS UNCHANGED (the ticket's own words: "the wake allowlist row for
  //     the door is unchanged"), re-measured here rather than assumed from #1036's own report.
  const wrapper = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'wake_establish_prepayment_schedule'`);
  assert.equal(wrapper.rowCount, 1, "0140's prepayment wrapper resolves at exactly one signature");
  assert.match(wrapper.rows[0].acl, /clara_wake_interactive=X\/clara_fn_owner/);
  const allowKinds = (await rootQuery(
    `select coalesce(array_agg(wake_kind order by wake_kind), '{}'::text[]) as kinds
       from clara.wake_fn_allowlist
      where function_name = 'wake_establish_prepayment_schedule'`)).rows[0].kinds;
  assert.deepEqual(allowKinds, ["close_prep"]);

  // (4) THE FLAG IS UNTOUCHED BY THIS TICKET -- "out of scope: enabling the close_prep source on
  //     hosted" (the ticket's own words). Still exactly what #927/#929 left it.
  const src = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(src.rowCount, 1, "the close_prep wake source is absent -- 0133's two-row world moved");
  assert.equal(src.rows[0].enabled, false,
    "clara.wake_engine_sources.close_prep moved -- #1036 must not touch it");

  // (5) AND THE FLAG NO LONGER MATTERS FOR SAFETY EITHER WAY, driven for real: with it flipped
  //     true inside a rolled-back transaction, the wake still lands in clara.prepayment_schedules
  //     and mints no adjustment_templates row -- `prepayment-wake-reroute.test.mjs`'s p1036.acted
  //     drives this end to end; this cell only re-confirms the flag itself is inert to the
  //     residual, not to the whole door's behaviour.
  await withTxn(async (c) => {
    await c.query(
      `update clara.wake_engine_sources
          set enabled = true, enabled_by = $1::uuid, enabled_at = now()
        where source_key = 'close_prep'`, [ALICE()]);
    const flipped = await c.query(
      "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
    assert.equal(flipped.rows[0].enabled, true, "the mutant could not flip the flag");
    const stillNoCallers = await c.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.prosrc ilike '%_propose_adjustment_template_core%'`);
    assert.deepEqual(stillNoCallers.rows, [],
      "enabling the flag re-opened a caller of the template core -- the reroute is flag-conditional");
  }, { commit: false });
  const after = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(after.rows[0].enabled, false, "the flag mutant leaked");
});
