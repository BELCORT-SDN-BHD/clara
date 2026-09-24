// #1036 (riders wave 4, lane 04) — the agent-lane prepayment wake door
// (`clara.wake_establish_prepayment_schedule`) stops proposing a retired 0045 adjustment template.
// Migration: 0315_prepayment_wake_reroute.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_wake_reroute$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_schedule_obo_twin$` idiom.
//
// WHAT THE FIX ROUND CHANGED, AND WHY THIS FILE'S SUBJECT MOVED WITH IT (ADV-01 / L04-SPEC-02).
// The first cut of #1036 rerouted the wrapper onto `clara._prepayment_schedule_core`'s new 'wake'
// lane AND gave that lane its own plan step, `clara._prepayment_plan_core_wake`, which wrote a
// `clara.accounting_plans` row with `authorised_by = clara.agent_user_id()`. Measured on this rig:
// the agent user holds ZERO `clara.firm_memberships` rows, and `clara._plan_admit_occurrence`
// hands the plan's `authorised_by` to `clara.admit_journal_work`, which raises CLR11
// `client_not_found` for an author with no membership. So that plan was configured and could never
// post — every month, forever — which is the failure 0308's own `clara._assert_plan_schedule`
// comment calls the worst this lane can have. The wall the first cut stepped around
// (`clara._authority_ref_refusal`, narrowed by #977/0250 and quoted by 0307 as "the wall that
// stops a wake run or an autodraft from authorising its own amortisation schedule") is the
// estate's accounting-authority control, and it was right.
//
// So the lane now REFUSES at configuration time, by name, and writes nothing: an unattended
// `close_prep` wake names no directing human (`clara.mint_wake_credential_for_task` forbids
// `on_behalf_of` BY CONSTRUCTION, 0138:827-830), so it authorises no amortisation plan. The
// ticket's real deliverable — `clara._propose_adjustment_template_core` loses its last caller and
// the wake can never mint a retired 0045 template again — is unchanged and is proved below.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the door's behaviour, driven for real.
//
// EVERY REROUTE CELL DRIVES THE WAKE DOOR ON A REAL `clara_wake_interactive` SESSION —
// `wake12(session, …)`, minted through `clara.mint_wake_credential_for_task` exactly as the
// production close-prep lane would, never a direct `clara_fn_owner` call to the core. A cell that
// drove the core directly would prove nothing about the wrapper's own delegation or its ACL.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTxn } from "./rig-txn.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { instructionRef } from "./accounting-plans-fixtures.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, wake12, caught, opk,
} from "./f-a4-pr2a-fixtures.mjs";
let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(() => {}); });
after(async () => {
  if (skipped > 0) {
    console.log(`p1036: ${skipped} cell(s) skipped -- probed at the live catalog`);
  }
});

/** The agent identity every wake act is attributed to (0002's one fixed row). */
const AGENT = "00000000-0000-4000-8000-000000c1a7a0";

// A SECOND, INDEPENDENT gate, on THIS ticket's own migration: the F-A4 PR-2a frontier (`hasPR2A`)
// is true from 0140 onward, long before #1036 exists, so a cell here needs its OWN stem check --
// `plan-overlap-template-arm-retired.test.mjs`'s own idiom for a lane-specific frontier layered
// on top of a shared one.
let rerouted = null;
async function hasReroute() {
  if (rerouted !== null) return rerouted;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'prepayment_wake_reroute$'");
  rerouted = Number(r.rows[0].n) > 0;
  return rerouted;
}
function gate(t) {
  if (prepayGate(t, markSkip)) return true;
  return false;
}
async function rerouteGate(t) {
  if (gate(t)) return true;
  if (!(await hasReroute())) {
    if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE !== "1") {
      throw new Error(
        "#1036 premise 0315_prepayment_wake_reroute.sql is not applied (no prepayment_wake_reroute$ "
        + "row in clara.schema_migrations) and CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE is unset "
        + "-- this is a FOCUSED run and must fail loudly, not skip. Preload "
        + "./tests/prepayment-wake-reroute-preintegration-gate.mjs for an estate sweep against a "
        + "pre-#1036 chain.");
    }
    markSkip();
    t.skip("#1036 (0315_prepayment_wake_reroute) not applied -- probed at the live catalog");
    return true;
  }
  return false;
}

/** The human door, called for real — the CONTRAST every refusal cell below is measured against.
 *  Mirrors clara.create_prepayment_schedule's own seven arguments. */
async function humanCreate(sub, sc, { account = sc.target, basis = "human battery basis",
    purpose = "p1036 human comparison", ref = null, opKey } = {}) {
  const r = await humanQuery(sub,
    `select clara.create_prepayment_schedule($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7) as r`,
    [sc.client, sc.entry, account, basis, purpose,
      // An invalid ref unless a cell supplies a real one: the shared refusals below never reach
      // the plan step, and a cell that expects the door to SUCCEED passes `ref`.
      JSON.stringify(ref ?? { kind: "chat_task", id: sc.entry }),
      opKey ?? opk("p1036-human")]);
  return r.rows[0].r;
}

/** Every durable thing a wake call could leave behind, for one client. */
async function durableFootprint(sc) {
  const r = await rootQuery(
    `select (select count(*)::int from clara.prepayment_schedules where client_id = $1) as schedules,
            (select count(*)::int from clara.accounting_plans where client_id = $1) as plans,
            (select count(*)::int from clara.adjustment_templates where firm_id = $2) as templates,
            (select count(*)::int from clara.op_receipts where firm_id = $2
              and fn = 'create_prepayment_schedule') as reservations`,
    [sc.client, sc.firm]);
  return r.rows[0];
}

// ---------------------------------------------------------------------------------------------
// AC1 (as the fix round re-cut it) — THE WAKE REFUSES BY NAME AND WRITES NOTHING, AND THE HUMAN
// DOOR ON THE SAME SCENE CONFIGURES A SCHEDULE WHOSE PLAN CAN ACTUALLY POST.
// ---------------------------------------------------------------------------------------------
test("p1036.refused -- with close_prep ENABLED (a rolled-back flip), the wake door refuses CLR03 "
  + "wake_authority_absent, writes NO schedule, NO plan and NO adjustment template; the same scene "
  + "through the HUMAN door configures a schedule whose plan ADMITS its first occurrence",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036refused");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const before = await durableFootprint(sc);
  assert.equal(before.schedules, 0, "the scene already carries a schedule -- fixture leak");
  assert.equal(before.templates, 0, "the scene already carries a template -- fixture leak");

  let err;
  await withTxn(async (c) => {
    await c.query(
      `update clara.wake_engine_sources
          set enabled = true, enabled_by = $1::uuid, enabled_at = now()
        where source_key = 'close_prep'`, [sc.alice]);
    const flipped = await c.query(
      "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
    assert.equal(flipped.rows[0].enabled, true, "the mutant could not flip the flag");
    // THE ACT ITSELF, inside the SAME rolled-back transaction the flag flip lives in -- the wake
    // door does not consult this flag at all (the runtime's claim step does, packages/runtime/lib
    // /wake-engine.mjs:392-397/:801-804), so this proves the refusal is unconditional on it too:
    // enabling close_prep does NOT open the lane.
    err = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  }, { commit: false });
  const after = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(after.rows[0].enabled, false, "the flag mutant leaked -- close_prep is left enabled");

  assert.ok(err, "the wake door configured a schedule -- an unattended wake authorises no plan");
  assert.equal(err.code, "CLR03", "a wake-authority refusal is CLR03, the estate's own wake class");
  const detail = JSON.parse(err.detail);
  assert.equal(detail.reason, "wake_authority_absent");
  assert.equal(detail.lane, "wake");
  assert.equal(detail.wake_kind, "close_prep", "the refusal does not name the wake it refused");
  assert.equal(detail.remedy, "clara.create_prepayment_schedule",
    "the refusal must NAME the door that can configure this -- 0140's own 'the refusal names what "
    + "to record and where'");

  const post = await durableFootprint(sc);
  assert.deepEqual(post, before, "the refused wake left something durable behind");

  // ---- THE CONTRAST. The same recognition, the same client, through the HUMAN door: it
  // configures, and the plan it writes ADMITS its first occurrence for real. Without this the
  // refusal above could be hiding a broken scene rather than a ruled wall.
  const ref = await instructionRef({ client: sc.client, author: sc.bob });
  const human = await humanCreate(sc.alice, sc, { ref, opKey: opk("p1036-contrast") });
  assert.ok(human.schedule_id, "the human door refused a scene the wake refusal is measured on");
  const admitted = await rootQuery(
    "select clara._plan_admit_occurrence($1::uuid,$2::date,'primary','p1036') as r",
    [human.plan_id, human.next_occurrences[0].due_date]);
  assert.equal(admitted.rows[0].r.admitted, true,
    `the HUMAN lane's plan could not admit its own first occurrence: ${JSON.stringify(admitted.rows[0].r)}`);
  assert.ok(admitted.rows[0].r.work_id, "an admitted occurrence with no Work");
});

// ---------------------------------------------------------------------------------------------
// THE AUTHORITY WALL COMES FIRST — before every other reason this door can refuse, so a wake is
// never told "fix the expense account" about a lane that will refuse it whatever it sends.
// ---------------------------------------------------------------------------------------------
test("p1036.authority-first -- a wake call carrying an input the HUMAN door refuses by its own "
  + "name (a blank expense account) is still answered wake_authority_absent, and the human door "
  + "still answers its own reason for the same input",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036first");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const wakeErr = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: "" }));
  assert.ok(wakeErr, "the wake accepted a blank expense account");
  assert.equal(JSON.parse(wakeErr.detail).reason, "wake_authority_absent",
    "the wake was answered about its input instead of about its authority");

  const humanErr = await caught(() => humanCreate(sc.alice, sc, { account: "" }));
  assert.ok(humanErr, "the human door accepted a blank expense account");
  assert.equal(JSON.parse(humanErr.detail).reason, "prepayment_target_underivable");
  assert.equal(JSON.parse(humanErr.detail).axis, "account_missing");

  const post = await durableFootprint(sc);
  assert.equal(post.schedules, 0);
  assert.equal(post.plans, 0);
});

// ---------------------------------------------------------------------------------------------
// THE REFUSAL IS A STATE, NOT A FLAKE — and a wake under a FRESH close_prep credential answers the
// same way, so nothing accumulates across attempts.
// ---------------------------------------------------------------------------------------------
test("p1036.refusal-stable -- the same wake driven twice, and once more under a FRESH close_prep "
  + "credential, answers the identical refusal and leaves the estate byte-identical",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036stable");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const before = await durableFootprint(sc);

  const first = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  const second = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  assert.equal(second.code, first.code);
  assert.deepEqual(JSON.parse(second.detail), JSON.parse(first.detail));

  const { mintClosePrepSession } = await import("./f-a4-pr1c-fixtures.mjs");
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const third = await caught(() => wake12(s2, { client: sc.client, entry: sc.entry, target: sc.target }));
  // `task_id` is the ONE key that is EXPECTED to move: it names the mechanically-bound task of the
  // credential that asked, which is the whole point of quoting it back. Everything else must be
  // identical, and the moved key is asserted to be the new session's own task rather than merely
  // excluded.
  const bare = (d) => { const x = { ...JSON.parse(d) }; delete x.task_id; return x; };
  assert.deepEqual(bare(third.detail), bare(first.detail),
    "a fresh credential was answered differently -- the refusal is a session accident, not a state");
  assert.equal(JSON.parse(third.detail).task_id, s2.task,
    "the refusal does not name the task of the credential that actually asked");
  assert.equal(JSON.parse(first.detail).task_id, sc.s.task);

  assert.deepEqual(await durableFootprint(sc), before,
    "three refused wakes left something durable behind");
});

// ---------------------------------------------------------------------------------------------
// THE AGENT PLAN LANE IS ABSENT, NOT MERELY UNUSED (the fix round's own census cell).
// ---------------------------------------------------------------------------------------------
test("p1036.no-agent-plan-lane -- no clara function writes an accounting plan under the agent's "
  + "own authority: clara._prepayment_plan_core_wake does not exist, no body inserts such a plan, "
  + "and a driven wake adds none",
async (t) => {
  if (await rerouteGate(t)) return;

  const fn = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_prepayment_plan_core_wake'`);
  assert.equal(fn.rows[0].n, 0,
    "clara._prepayment_plan_core_wake still exists -- the agent plan lane was left callable");

  // NOT A NAME CHECK: any body that inserts into clara.accounting_plans with the agent identity
  // is caught here whatever it is called.
  const writers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc ilike '%insert into clara.accounting_plans%'
        and p.prosrc ilike '%agent_user_id%'`);
  assert.deepEqual(writers.rows, [],
    `a clara body writes an accounting plan under the agent identity: ${JSON.stringify(writers.rows)}`);

  // THE DELTA, NOT THE TOTAL. This rig is never rebuilt from scratch and carries the plans this
  // file's FIRST cut minted before the fix round dropped that lane (they are inert: the lane is
  // closed and those plans can admit nothing). The claim that can be made on ANY database, and is
  // the one that matters, is that driving the door today adds none.
  const count = async () => Number((await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where authorised_by = $1::uuid",
    [AGENT])).rows[0].n);
  const before = await count();
  const sc = await prepaidScene("p1036noagent");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const err = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  assert.equal(JSON.parse(err.detail).reason, "wake_authority_absent");
  assert.equal(await count(), before,
    "a driven wake minted an accounting plan authorised by the agent -- it could never admit an "
    + "occurrence, because clara.agent_user_id() holds no firm membership");
});

// ---------------------------------------------------------------------------------------------
// THE TEMPLATE CORE -- RETIRED, WITH NO CALLER AND NO EXECUTABLE PATH FOR ANY APPLICATION ROLE.
// (The ticket's real deliverable, unchanged by the fix round.)
// ---------------------------------------------------------------------------------------------
test("p1036.template-core-retired -- clara._propose_adjustment_template_core has NO caller anywhere "
  + "in the clara schema and is executable by no application role; the retired agent core refuses "
  + "unconditionally at its own exact signature",
async (t) => {
  if (await rerouteGate(t)) return;

  // NO CALLER, BY NAME, across the WHOLE schema -- not "the two known callers are gone", the
  // stronger claim the ticket asks for.
  const callers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc ilike '%_propose_adjustment_template_core%'`);
  assert.deepEqual(callers.rows, [], `clara._propose_adjustment_template_core still has a caller: ${JSON.stringify(callers.rows)}`);

  // NOT EXECUTABLE BY ANY APPLICATION ROLE, positively -- the ACL names only the owner.
  const acl = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as a
       from pg_proc p where p.oid = to_regprocedure(
         'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)')`);
  assert.equal(acl.rows[0].a, "clara_fn_owner=X/clara_fn_owner",
    "the template core is executable by an application role");

  // THE MUTANT: a real EXECUTE grant, in a rolled-back transaction, makes the ACL half go red.
  await withTxn(async (c) => {
    await c.query(
      `grant execute on function clara._propose_adjustment_template_core(
         jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text) to clara_runtime`);
    const flipped = await c.query(
      `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as a
         from pg_proc p where p.oid = to_regprocedure(
           'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)')`);
    assert.match(flipped.rows[0].a, /clara_runtime/, "the mutant grant did not take");
  }, { commit: false });
  const after = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as a
       from pg_proc p where p.oid = to_regprocedure(
         'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)')`);
  assert.equal(after.rows[0].a, "clara_fn_owner=X/clara_fn_owner", "the mutant grant leaked");

  // THE RETIRED AGENT CORE ITSELF refuses unconditionally, at its own exact pre-#1036 signature,
  // driven directly as its owner (it is ungranted -- no application role can reach it at all).
  const err = await caught(() => rootQuery(
    `select clara._agent_prepayment_schedule_core(
       '{}'::jsonb, gen_random_uuid(), gen_random_uuid(), 'x', 'y', 'z', '{}'::jsonb, 'k')`));
  assert.ok(err, "the retired agent core answered instead of refusing");
  assert.equal(JSON.parse(err.detail).reason, "prepayment_agent_core_retired");
});

// ---------------------------------------------------------------------------------------------
// THE WRAPPER'S OWN SHAPE -- UNCHANGED NAME, ARGUMENTS AND ACL (the ticket's own words: "same
// name and arguments"; "the wake allowlist row for the door is unchanged").
// ---------------------------------------------------------------------------------------------
test("p1036.wrapper-shape -- wake_establish_prepayment_schedule keeps its exact seven-argument "
  + "signature, its clara_wake_interactive-only ACL, and its one close_prep allowlist row",
async (t) => {
  if (await rerouteGate(t)) return;

  const sig = "clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)";
  const row = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl,
            pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef
       from pg_proc p where p.oid = to_regprocedure($1)`, [sig]);
  assert.equal(row.rows.length, 1, "wrapper 12 does not resolve at its exact pre-#1036 signature");
  assert.match(row.rows[0].acl, /clara_wake_interactive=X\/clara_fn_owner/);
  assert.doesNotMatch(row.rows[0].acl, /clara_runtime=|clara_agent_ro=|clara_wake_proactive=|clara_authenticated=/);
  assert.equal(row.rows[0].owner, "clara_fn_owner");
  assert.equal(row.rows[0].secdef, true);

  const allow = await rootQuery(
    `select coalesce(array_agg(wake_kind order by wake_kind), '{}'::text[]) as kinds
       from clara.wake_fn_allowlist where function_name = 'wake_establish_prepayment_schedule'`);
  assert.deepEqual(allow.rows[0].kinds, ["close_prep"]);

  const total = await rootQuery(
    "select count(*)::int as n from clara.wake_fn_allowlist where wake_kind = 'close_prep'");
  assert.equal(total.rows[0].n, 13, "the close_prep allowlist moved -- #1036 must not touch it");
});
