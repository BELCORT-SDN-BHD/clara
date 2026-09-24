// #1036 (riders wave 4, lane 04) — the agent-lane prepayment wake door
// (`clara.wake_establish_prepayment_schedule`) stops proposing a retired 0045 adjustment template
// and lands in the SAME durable record a person's own configuration does. Migration:
// 0315_prepayment_wake_reroute.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_wake_reroute$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_schedule_obo_twin$` idiom.
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
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, wake12, caught, uniq, opk,
} from "./f-a4-pr2a-fixtures.mjs";
let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(() => {}); });
after(async () => {
  if (skipped > 0) {
    console.log(`p1036: ${skipped} cell(s) skipped -- probed at the live catalog`);
  }
});

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

/** The human door, called for real, so a refusal cell can compare it byte for byte against the
 *  wake's own answer. Mirrors clara.create_prepayment_schedule's own seven arguments. */
function humanCreate(sub, sc, { account = sc.target, basis = "human battery basis",
    purpose = "p1036 human comparison", opKey } = {}) {
  return humanQuery(sub,
    `select clara.create_prepayment_schedule($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7) as r`,
    [sc.client, sc.entry, account, basis, purpose,
      JSON.stringify({ kind: "chat_task", id: sc.entry }), // deliberately invalid ref; only used
                                                            // for the SHARED refusals below, never
                                                            // for a call expected to SUCCEED.
      opKey ?? opk("p1036-human")]).then((r) => r.rows[0].r);
}

// ---------------------------------------------------------------------------------------------
// AC1 — THE WAKE PRODUCES A REAL SCHEDULE, WITH ITS OCCURRENCES, AND NO ADJUSTMENT TEMPLATE.
// ---------------------------------------------------------------------------------------------
test("p1036.acted -- with close_prep ENABLED (a rolled-back flip), the wake door configures a real "
  + "prepayment schedule with its occurrences, and mints NO clara.adjustment_templates row",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036acted");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const templatesBefore = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where firm_id = $1", [sc.firm]);
  assert.equal(templatesBefore.rows[0].n, 0, "the scene already carries a template -- fixture leak");

  let r;
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
    // /wake-engine.mjs:392-397/:801-804), so this proves the reroute is unconditional on it too.
    r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  }, { commit: false });
  const after = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(after.rows[0].enabled, false, "the flag mutant leaked -- close_prep is left enabled");

  // THE SCHEDULE, real and inspectable.
  assert.equal(r.kind, "amortisation_schedule");
  assert.equal(r.configuration_only, true, "the wake posted books -- draft-only by construction");
  assert.ok(r.schedule_id, "no schedule_id in the wake's answer");
  assert.ok(r.plan_id, "no plan_id in the wake's answer");
  assert.equal(r.term_source, "document_service_period");
  assert.equal(r.period_count, 3);
  assert.equal(r.total_cents, sc.cents);
  assert.equal(r.prepaid_account_code, sc.prepaid);
  assert.equal(r.expense_account_code, sc.target);

  // THE OCCURRENCES -- the preview the plan step derives, exactly as a human's or a chat
  // configuration's own answer carries it.
  assert.equal(Array.isArray(r.next_occurrences), true);
  assert.equal(r.next_occurrences.length, 3, "the schedule's occurrence preview is missing periods");

  const row = await rootQuery(
    "select * from clara.prepayment_schedules where id = $1", [r.schedule_id]);
  assert.equal(row.rows.length, 1, "no clara.prepayment_schedules row for the wake's own schedule_id");
  assert.equal(row.rows[0].source_entry_id, sc.entry);
  assert.equal(row.rows[0].created_by, "00000000-0000-4000-8000-000000c1a7a0",
    "the schedule is not attributed to clara.agent_user_id()");

  const plan = await rootQuery(
    "select authority_kind, authority_ref, authorised_by, created_by from clara.accounting_plans where id = $1",
    [r.plan_id]);
  assert.equal(plan.rows[0].authority_kind, "explicit_instruction");
  assert.equal(plan.rows[0].authority_ref.kind, "agent_wake");
  assert.equal(plan.rows[0].authority_ref.wake_kind, "close_prep");
  assert.equal(plan.rows[0].authority_ref.task_id, sc.s.task, "the plan does not name the wake's own task");
  assert.equal(plan.rows[0].authorised_by, "00000000-0000-4000-8000-000000c1a7a0",
    "the plan claims a human authorised it -- it must be clara.agent_user_id()");
  assert.equal(plan.rows[0].created_by, "00000000-0000-4000-8000-000000c1a7a0");

  // AND NO ADJUSTMENT TEMPLATE -- the acceptance criterion's own second half.
  const templatesAfter = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where firm_id = $1", [sc.firm]);
  assert.equal(templatesAfter.rows[0].n, 0,
    "the wake minted a clara.adjustment_templates row -- the reroute did not take");
});

// ---------------------------------------------------------------------------------------------
// AC2 — THE WAKE'S IDEMPOTENCY: THE SAME WAKE TWICE YIELDS ONE SCHEDULE.
// ---------------------------------------------------------------------------------------------
test("p1036.idempotent -- the same wake driven twice, same session, same derived op key, yields "
  + "ONE schedule, byte-identical on replay",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036idem");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  const second = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.deepEqual(second, first, "a replay under the same derived op key answered differently");

  const rows = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where source_entry_id = $1", [sc.entry]);
  assert.equal(rows.rows[0].n, 1, "the replay minted a SECOND schedule row");

  const plans = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where id = $1", [first.plan_id]);
  assert.equal(plans.rows[0].n, 1);
});

// ---------------------------------------------------------------------------------------------
// THE MULTIPLICITY KEY -- 0140's OWN CONCERN (W14), CARRIED FORWARD: two source entries amortised
// in ONE wake task must not collide on the ONE client-scoped op key _close_wake_ctx derives.
// ---------------------------------------------------------------------------------------------
test("p1036.multiplicity -- two source entries amortised in ONE wake task get TWO independent "
  + "schedules, not a collision on the task-scoped op key",
async (t) => {
  if (await rerouteGate(t)) return;
  const sc = await prepaidScene("p1036multi");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const { seedVerifiedDocument, fileDocument } = await import("./rig-docs-fixtures.mjs");
  const { draftEntryV3, approveEntry } = await import("./wave-a-reads.mjs");
  const { freshResolution } = await import("./wave-a-fixtures.mjs");
  const doc2 = await seedVerifiedDocument({ firm: sc.firm, client: null, filename: `p1036-${uniq()}.pdf` });
  await fileDocument(sc.alice, { document: doc2.documentId, client: sc.client, opKey: opk("p1036-file2") });
  const cents2 = 90000;
  const d2 = await draftEntryV3(sc.alice, {
    client: sc.client,
    resolution: await freshResolution(sc.alice, sc.client,
      { subjectKind: "document", subjectId: doc2.documentId }),
    memo: `p1036 second prepaid ${uniq()}`, postingDate: "2025-01-16",
    document: doc2.documentId, sha256: doc2.sha256,
    lines: [
      { account_code: sc.prepaid, debit_cents: cents2, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents2, description: "paid" },
    ],
    opKey: opk("p1036-draft2"),
  });
  await approveEntry(sc.bob, { entry: d2.entry_id, expectedRevision: d2.revision_token,
    opKey: opk("p1036-appr2") });
  await recordPeriod(sc.alice, { document: doc2.documentId, start: "2025-02-01", end: "2025-04-30" });

  const r1 = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  const r2 = await wake12(sc.s, { client: sc.client, entry: d2.entry_id, target: sc.target });
  assert.notEqual(r2.schedule_id, r1.schedule_id, "two source entries collapsed onto ONE schedule");
  assert.equal(r1.total_cents, sc.cents);
  assert.equal(r2.total_cents, cents2);

  const rows = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where source_entry_id = any($1::uuid[])",
    [[sc.entry, d2.entry_id]]);
  assert.equal(rows.rows[0].n, 2);
});

// ---------------------------------------------------------------------------------------------
// REFUSALS -- THE SAME VALIDATION, THE SAME REASON, A PERSON'S OWN CREATION GETS.
// ---------------------------------------------------------------------------------------------
test("p1036.refusals -- the wake refuses exactly the reasons the human door refuses, and writes "
  + "nothing on any of them",
async (t) => {
  if (await rerouteGate(t)) return;

  // (a) no expense account -- prepayment_target_underivable / account_missing, both lanes.
  {
    const sc = await prepaidScene("p1036refA");
    await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
    const wakeErr = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: "" }));
    assert.ok(wakeErr, "the wake accepted a blank expense account");
    assert.equal(JSON.parse(wakeErr.detail).reason, "prepayment_target_underivable");
    assert.equal(JSON.parse(wakeErr.detail).axis, "account_missing");

    const humanErr = await caught(() => humanCreate(sc.alice, sc, { account: "" }));
    assert.equal(JSON.parse(humanErr.detail).reason, JSON.parse(wakeErr.detail).reason);
    assert.equal(JSON.parse(humanErr.detail).axis, JSON.parse(wakeErr.detail).axis);
    assert.equal(humanErr.message, wakeErr.message, "the human and wake sentences differ");

    const rows = await rootQuery(
      "select count(*)::int as n from clara.prepayment_schedules where source_entry_id = $1", [sc.entry]);
    assert.equal(rows.rows[0].n, 0);
  }

  // (b) an unknown expense account code -- prepayment_target_ineligible / account_unknown.
  {
    const sc = await prepaidScene("p1036refB");
    await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
    const bogus = "99999999";
    const wakeErr = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: bogus }));
    assert.equal(JSON.parse(wakeErr.detail).reason, "prepayment_target_ineligible");
    assert.equal(JSON.parse(wakeErr.detail).axis, "account_unknown");
    const humanErr = await caught(() => humanCreate(sc.alice, sc, { account: bogus }));
    assert.deepEqual(JSON.parse(humanErr.detail), JSON.parse(wakeErr.detail));
  }

  // (c) the recognition already has a schedule -- prepayment_schedule_exists (CLR13), naming it.
  {
    const sc = await prepaidScene("p1036refC");
    await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
    const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
    const dup = await caught(() => humanCreate(sc.alice, sc));
    assert.ok(dup, "the human door configured a SECOND schedule for the same entry");
    assert.equal(JSON.parse(dup.detail).reason, "prepayment_schedule_exists");
    assert.equal(JSON.parse(dup.detail).schedule_id, first.schedule_id,
      "the duplicate refusal names a different schedule than the wake's own");
  }
});

// ---------------------------------------------------------------------------------------------
// THE TEMPLATE CORE -- RETIRED, WITH NO CALLER AND NO EXECUTABLE PATH FOR ANY APPLICATION ROLE.
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
