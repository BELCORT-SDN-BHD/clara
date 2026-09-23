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
//   3. Nothing downstream needed to change: the three plan-creating doors and their web forms
//      read only `.name`, never `.kind` or `.template_id` (0281's own header, re-proven unmoved
//      here by the three callers' own non-regression pins).
//
// SEAM: `clara.create_accounting_plan`, the shared door both `plan-overlap-sibling-arm.test.mjs`
// (#909) and `accounting-plans.test.mjs`'s own `p640.schedule.overlap` (#640) already treat as
// the seam for this function.
//
// CONTRACT-BLIND against the ticket's own Agent Brief, frontier-gated on migration 0283's own
// STABLE STEM (`retire_plan_overlap_template_arm$`) -- never `plan_overlap_sibling_arm$` (0281),
// which a database can carry WITHOUT this ticket's retirement.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTxn } from "./rig-txn.mjs";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, buildWorkWorld, freshWorkClient, opk, basis,
  instructionRef, createAccountingPlan,
} from "./accrual-adjustments-fixtures.mjs";

const MIGRATION = "0283_retire_plan_overlap_template_arm.sql";
const STEM = "retire_plan_overlap_template_arm$";
const FN = "clara._plan_overlap_warning(uuid,jsonb)";
const FN_ACL = "{clara_fn_owner=X/clara_fn_owner}";

/** The three callers 0283's own prestate/tail pin as non-regression, MEASURED on this rig at 270
 *  migrations (0001->0282) before 0283 existed and asserted UNMOVED by 0283's own prestate/tail.
 *  This file's own outside-in re-proof, never transcribed. */
const NONREGRESSION = [
  { fn: "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)",
    sha: "84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4" },
  { fn: "clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)",
    sha: "87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f" },
  { fn: "clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)",
    sha: "b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8" },
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

test("p929.tail -- outside-in re-proof of 0283's own tail: the template arm is gone by name, the sibling arm and the posture are unmoved, and the three callers are unmoved", async (t) => {
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

  // (T.2) THE SIBLING ARM SURVIVES, VERBATIM.
  assert.match(row.src, /accounting_plan_overlap/, "the sibling-plan kind is missing");
  assert.match(row.src, /clara\.accounting_plans/, "the sibling arm no longer scans clara.accounting_plans");
  assert.match(row.src, /clara\.accounting_plan_revisions/, "the sibling arm no longer scans clara.accounting_plan_revisions");
  assert.match(row.src, /is distinct from p_basis/, "the self-exclusion guard is missing");
  assert.match(row.src, /'active','paused'/, "the active/paused restriction is missing");

  // (T.3) POSTURE unmoved.
  assert.equal(row.owner, "clara_fn_owner");
  assert.equal(row.secdef, true);
  assert.equal(row.vol, "s", "clara._plan_overlap_warning must stay STABLE");
  assert.equal(row.cfg, "search_path=clara, pg_temp");
  assert.equal(row.acl, FN_ACL, "0283 must not grant EXECUTE to any application role");

  // (T.4) NON-REGRESSION: the three callers are BYTE-FOR-BYTE UNMOVED.
  for (const sig of NONREGRESSION) {
    const c = await rootQuery(
      `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
         from pg_proc p where p.oid = to_regprocedure($1)`, [sig.fn]);
    assert.equal(c.rows[0].sha, sig.sha, `${sig.fn} moved -- 0283 asserts it is untouched`);
  }
});

// ---------------------------------------------------------------------------------------------
// p929.containment -- THE ONE MINTING PATH THE THREE-TICKET RETIREMENT LEAVES STANDING, AND THE
// FLAG THAT HOLDS IT SHUT.
//
// #927 closed `propose_adjustment_template` and `sign_adjustment_template`, #928 deleted the daily
// sweep, #929 (this migration) took the advisory's template arm. None of the three touches
// `clara._propose_adjustment_template_core`, and it is still reachable -- ONE path, through the
// agent lane: `clara.wake_establish_prepayment_schedule` (0140's prepayment limb, granted to
// clara_wake_interactive and carried in `clara.wake_fn_allowlist`) calls
// `clara._agent_prepayment_schedule_core`, which calls that core, which INSERTS a `proposed`
// template row. After #927 such a row could never be signed, never be run, never be swept and is
// never named by the plan advisory -- exactly the orphan 0282's own live-template guard exists to
// prevent. Retiring or rerouting that limb is a product act the #788 split did not publish
// (it would retire the agent-lane prepayment feature, whose successor door
// `clara.create_prepayment_schedule` arrived at 0223), so it is NOT done here.
//
// What holds the path shut today is `clara.wake_engine_sources.close_prep.enabled = false`. Be
// exact about WHERE that flag bites, because it is not a database wall: the DB-side minter
// `clara.mint_wake_credential_for_task` is granted to clara_runtime and never reads the flag
// (which is why THIS database carries hundreds of close_prep credentials -- the batteries mint
// their own). The gate is the runtime's claim step, both halves of it:
// `packages/runtime/lib/wake-engine.mjs:392-397` (wake_outbox, held -> running) and `:801-804`
// (direct_queue, queued -> running) promote a close_prep task only
// `... and exists (select 1 from clara.wake_engine_sources where source_key=$2 and enabled)`,
// under the same `wake_source_gate:<key>` advisory lock `clara.set_wake_source_enabled` takes.
// So while the flag is false no close_prep workflow ever RUNS, and the wrapper is never called in
// production. That is a parked feature flag, not a closed door -- which is precisely why this
// cell exists. It goes RED the day someone unparks close_prep, and names what must happen first.
// Measured, not argued: the mutants below flip the flag, and widen the allowlist, inside
// rolled-back transactions and show the same predicates firing.
// ---------------------------------------------------------------------------------------------
test("p929.containment -- the agent prepayment limb is the ONE path left into clara.adjustment_templates, and it is held shut by close_prep being parked; unparking it re-opens a lane #927 retired", async (t) => {
  if (unready(t)) return;

  // (1) The core the human doors used to share is still there, and is UNGRANTED: no application
  //     role can call it directly, so the wrapper below is the only way in.
  const core = await rootQuery(
    `select p.oid::regprocedure::text as sig,
            coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_propose_adjustment_template_core'`);
  assert.equal(core.rowCount, 1, "the agent-lane propose core resolves at exactly one signature");
  assert.equal(core.rows[0].acl, "clara_fn_owner=X/clara_fn_owner",
    "the propose core gained a grant -- it is reachable from an application role, not only through the wrapper");

  // (2) The wrapper IS still wired: granted to clara_wake_interactive and on the allowlist. This
  //     is asserted POSITIVELY, so the cell cannot pass by the limb having quietly disappeared --
  //     if it is ever retired, this assertion is where that is recorded.
  const wrapper = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'wake_establish_prepayment_schedule'`);
  assert.equal(wrapper.rowCount, 1, "0140's prepayment wrapper resolves at exactly one signature");
  assert.match(wrapper.rows[0].acl, /clara_wake_interactive=X\/clara_fn_owner/,
    "the prepayment wrapper lost its clara_wake_interactive grant -- if the limb was retired, retire this cell with it");
  // `clara.assert_wake_allowed` -- the last gate inside `clara._close_wake_ctx` -- reads the
  // allowlist PER WAKE KIND. Asserting only that close_prep still carries the row would leave the
  // tripwire in (3) blind to the cheapest way to re-open this path: registering the SAME function
  // under a wake kind that is not parked at all. `interactive_client` is exactly such a kind --
  // it is minted from a live chat turn (`clara.mint_chat_close_credential`) and
  // `clara.wake_engine_sources` holds NO row for it, so the flag in (3) could never speak for it.
  // So the claim is the stronger one: this function is on the allowlist for EXACTLY ONE kind, and
  // that kind is the parked one.
  const allowKinds = async (q) => (await q(
    `select coalesce(array_agg(wake_kind order by wake_kind), '{}'::text[]) as kinds
       from clara.wake_fn_allowlist
      where function_name = 'wake_establish_prepayment_schedule'`)).rows[0].kinds;
  assert.deepEqual(await allowKinds(rootQuery), ["close_prep"],
    "clara.wake_fn_allowlist admits wake_establish_prepayment_schedule for a kind other than the "
    + "parked close_prep (or for none at all). Every other wake kind is LIVE, so the close_prep "
    + "flag asserted below no longer holds this path shut. Retire or reroute the limb at "
    + "clara.create_prepayment_schedule (0223) before widening this allowlist.");

  // The mutant for (2), in a transaction that is rolled back: a widening really is visible to the
  // reader above, so the assertion is watching something rather than restating a constant.
  await withTxn(async (c) => {
    await c.query(
      `insert into clara.wake_fn_allowlist(wake_kind, function_name)
       values ('interactive_client', 'wake_establish_prepayment_schedule')`);
    assert.deepEqual(await allowKinds((t, p) => c.query(t, p)),
      ["close_prep", "interactive_client"],
      "the mutant could not widen the allowlist, so the assertion above is not proven to be "
      + "watching anything");
  }, { commit: false });
  assert.deepEqual(await allowKinds(rootQuery), ["close_prep"],
    "the allowlist mutant leaked -- interactive_client is left holding the prepayment wrapper");

  // (3) THE TRIPWIRE. The flag that keeps the path unreachable.
  const src = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(src.rowCount, 1, "the close_prep wake source is absent -- 0133's two-row world moved");
  assert.equal(src.rows[0].enabled, false,
    "clara.wake_engine_sources.close_prep is ENABLED. The agent prepayment limb "
    + "(wake_establish_prepayment_schedule -> _agent_prepayment_schedule_core -> "
    + "_propose_adjustment_template_core) can now mint a 'proposed' clara.adjustment_templates row "
    + "that #927 left no door to sign, no belt to run and no advisory to name. Retire or reroute "
    + "that limb at clara.create_prepayment_schedule (0223) BEFORE unparking close_prep.");

  // (4) THE MUTANT, in a transaction that is rolled back: the assertion above is live, not a
  //     sentence about a value nobody ever changes.
  await withTxn(async (c) => {
    // `ck_wes_enabled_audit` requires the two audit stamps alongside the flag, so the mutant
    // flips the row the way a real unparking act would -- which is the shape the assertion above
    // has to be able to see.
    await c.query(
      `update clara.wake_engine_sources
          set enabled = true, enabled_by = $1::uuid, enabled_at = now()
        where source_key = 'close_prep'`, [ALICE()]);
    const flipped = await c.query(
      "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
    assert.equal(flipped.rows[0].enabled, true,
      "the mutant could not flip the flag, so (3) is not proven to be watching anything");
  }, { commit: false });
  const after = await rootQuery(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep'");
  assert.equal(after.rows[0].enabled, false, "the mutant leaked -- close_prep is left enabled");
});
