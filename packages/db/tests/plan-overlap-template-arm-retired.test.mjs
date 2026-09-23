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
