// #909 — `clara._plan_overlap_warning` GAINS A SIBLING-PLAN ARM: the accounting-plan overlap
// advisory now names an overlapping SIBLING accounting plan of the same client, not only a legacy
// live 0045 adjustment template. Still advisory (the Agent Brief's own words) — nothing here
// refuses a plan; the widened warning only names more of what already legitimately coexists.
//
// The claims this battery exists to prove (the ticket's own Agent Brief):
//
//   1. Two overlapping plans on one account warn EACH OTHER — not merely "whichever was created
//      second" — proven through BOTH doors the shared function serves: `create_accounting_plan`
//      (the later plan sees the earlier one immediately) and `revise_accounting_plan` (the
//      earlier plan, once its own schedule is touched again, now sees the later one too).
//   2. Non-overlapping account sets warn about nothing, even on a client already carrying an
//      overlapping sibling, and even across two clients that happen to share account codes.
//   3. The existing 0045 template-arm cells (`accounting-plans.test.mjs`'s own
//      `p640.schedule.overlap`) stay green, UNEDITED by this file. [UPDATE, #929/0283: this claim
//      described 0281 alone. #929 retires the template arm entirely, which DOES edit
//      `p640.schedule.overlap` (its own ticket, its own commit) — see that file's header.]
//   4. From-scratch apply (proven by the migration's own prestate/tail; this file assumes 0281 is
//      already applied and is frontier-gated on it).
//
// Plus the design decisions #909's own migration header states and pins:
//   5. The sibling arm reaches across all THREE plan kinds (recurring_journal, reversing_journal,
//      amortisation_schedule) — the exact "an accrual plan and an amortisation plan on the same
//      account" shape the Agent Brief's own "Current behavior" names.
//   6. An ENDED sibling stops warning; a PAUSED one keeps warning.
//   7. [RETIRED, #929/0283 — was: "A basis overlapping BOTH a live template and a sibling plan at
//      once keeps the template's own `kind` label (0909's documented, transitional choice) and
//      names both in one list." The cell that proved this, `p909.combined-with-template`, is
//      removed below: 0281's own header called this note "moot" once #929 deletes the template
//      arm, and it has been. The current-contract equivalent (a live template row is invisible,
//      alone or alongside a sibling plan) is proven in
//      `tests/plan-overlap-template-arm-retired.test.mjs`, frontier-gated on 0283.]
//   8. At least one of the three plan-creating doors OTHER than `create_accounting_plan` itself
//      is actually DRIVEN (the wave-3 addendum's own rule: "a door's behaviour is asserted only
//      after it was driven") — `clara.create_accrual_adjustment`, which calls
//      `clara.create_accounting_plan` directly (0222:1213) and is therefore the lightest of the
//      two outer doors to set up; `clara.create_prepayment_schedule` calls the SAME function the
//      SAME way (0223:1282, "THE PLAN. Through 0193's OWN door") and is not independently driven
//      here — claim 5's direct `amortisation_schedule` cells already exercise that exact code path.
//
// SEAM: `clara.create_accounting_plan` and `clara.revise_accounting_plan` (the shared door both
// the Agent Brief's "three plan-creating doors" line and #908's own battery already treat as the
// seam for this function), plus one real drive of `clara.create_accrual_adjustment` for claim 8.
//
// CONTRACT-BLIND against the ticket's own Agent Brief, frontier-gated on migration 0281's own
// STABLE STEM (`plan_overlap_sibling_arm$`) — never `accounting_plans$` (0193), which a database
// can carry WITHOUT this ticket's arm.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, buildWorkWorld, freshWorkClient, basis,
  instructionRef, createAccountingPlan, reviseAccountingPlan, pauseAccountingPlan,
  endAccountingPlan, PLAN_KIND,
  // the accrual door's own surface (claim 8)
  accrual, createAccrualAdjustment, freshAccrualClient,
} from "./accrual-adjustments-fixtures.mjs";

const MIGRATION = "0281_plan_overlap_sibling_arm.sql";
const STEM = "plan_overlap_sibling_arm$";
const FN_NAME = "_plan_overlap_warning";
const FN_ACL = "{clara_fn_owner=X/clara_fn_owner}";

/* The three callers' sha256(prosrc) pins this file used to carry (84b67058… / 87c9f1e9… /
 * b3bd1006…) are REMOVED, for exactly the reason the template-arm pins below were: they stopped
 * being an invariant true across every frontier "0281 or later" the moment 0283 landed. 0283's fix
 * round RECUTS all three (the client advisory rung, and the caller's own plan id passed to this
 * function), so a hard pin here would be a claim about which migrations are applied, dressed up as
 * a claim about 0281. The pre-images live on as the FRESH-APPLY half of 0283's own prestate, and
 * the post-recut bodies are pinned outside-in in
 * tests/plan-overlap-template-arm-retired.test.mjs's own RECUT list, frontier-gated on 0283. */

let world = null;
let ready = false;

before(async () => {
  world = await buildWorkWorld();
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_PLAN_OVERLAP_SIBLING_ARM !== "1") {
    throw new Error(
      `#909 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) ` +
      "and CLARA_ALLOW_MISSING_PLAN_OVERLAP_SIBLING_ARM is unset -- this is a FOCUSED run and " +
      "must fail loudly, not skip. Preload " +
      "./tests/plan-overlap-sibling-arm-preintegration-gate.mjs for an estate sweep against a " +
      "pre-#909 chain.");
  }
});
after(async () => {
  printLaneNotes("plan-overlap-sibling-arm");
  printSkipCount("plan-overlap-sibling-arm");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return true; }
  return false;
}

const ALICE = () => world.users.alice;

test("p909.mutual — two plans on one client whose accounts intersect warn EACH OTHER, through BOTH doors the shared function serves", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p909mutual");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";

  const planA = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig mutual plan A",
    effectiveFrom: from, basis: basis({ memo: "Rig mutual A basis", cents: 50000 }),
  });
  assert.equal(planA.overlap_warning, null, "no sibling exists yet");

  const planB = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig mutual plan B",
    effectiveFrom: from, basis: basis({ memo: "Rig mutual B basis", cents: 75000 }),
  });
  assert.ok(planB.overlap_warning, "B sees A, created through create_accounting_plan");
  assert.equal(planB.overlap_warning.kind, "accounting_plan_overlap");
  assert.equal(planB.overlap_warning.templates.length, 1);
  assert.equal(planB.overlap_warning.templates[0].name, "Rig mutual plan A");
  assert.equal(planB.overlap_warning.templates[0].plan_id, planA.plan_id);
  assert.equal(planB.overlap_warning.templates[0].cadence, "monthly");
  assert.ok(planB.overlap_warning.templates[0].accounts.includes("6100"),
    "the warning names the intersecting account code");

  // MUTUAL, not merely "whichever was created second": A's own schedule, re-evaluated through
  // revise_accounting_plan (the shared function's OTHER caller), now sees B too.
  const revisedA = await reviseAccountingPlan(ALICE(), {
    plan: planA.plan_id, effectiveFrom: from,
    basis: basis({ memo: "Rig mutual A basis", cents: 50000 }),
  });
  assert.ok(revisedA.overlap_warning, "A, revised, now sees B");
  assert.equal(revisedA.overlap_warning.kind, "accounting_plan_overlap");
  assert.equal(revisedA.overlap_warning.templates.length, 1);
  assert.equal(revisedA.overlap_warning.templates[0].name, "Rig mutual plan B");
  assert.equal(revisedA.overlap_warning.templates[0].plan_id, planB.plan_id);
});

test("p909.cross-kind — the sibling arm reaches across all three plan kinds, cumulatively", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p909kinds");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";

  const recurring = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, kind: PLAN_KIND.recurring, purpose: "Rig kinds recurring",
    effectiveFrom: from, basis: basis({ memo: "Rig kinds recurring basis" }),
  });
  assert.equal(recurring.overlap_warning, null, "first plan, no sibling yet");

  const reversing = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, kind: PLAN_KIND.reversing, purpose: "Rig kinds reversing",
    dayRule: "day_of_month", dayOfMonth: 15, reversalDayRule: "next_period_first_day",
    effectiveFrom: from, basis: basis({ memo: "Rig kinds reversing basis" }),
  });
  assert.ok(reversing.overlap_warning,
    "a reversing_journal plan sees the recurring_journal sibling -- the exact 'an accrual plan "
    + "... warns about neither each other' shape the Agent Brief's own Current behavior names");
  assert.equal(reversing.overlap_warning.templates.length, 1);
  assert.equal(reversing.overlap_warning.templates[0].name, "Rig kinds recurring");

  const amortisation = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, kind: "amortisation_schedule", purpose: "Rig kinds amortisation",
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    effectiveFrom: from, basis: basis({ memo: "Rig kinds amortisation basis" }),
  });
  assert.ok(amortisation.overlap_warning,
    "an amortisation_schedule plan sees BOTH earlier siblings -- '... and an amortisation plan "
    + "on the same account warn about neither each other' answered");
  assert.equal(amortisation.overlap_warning.templates.length, 2);
  const names = amortisation.overlap_warning.templates.map((x) => x.name).sort();
  assert.deepEqual(names, ["Rig kinds recurring", "Rig kinds reversing"].sort());
});

test("p909.no-overlap — disjoint account codes warn about nothing, even on a busy client, and even across two clients sharing the same codes", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p909noverlap");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";

  const busy = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig no-overlap busy sibling",
    effectiveFrom: from, basis: basis({ memo: "Rig no-overlap busy basis" }),
  });
  assert.equal(busy.overlap_warning, null);

  const disjoint = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig no-overlap disjoint plan",
    effectiveFrom: from,
    basis: basis({ debitAccount: "9100", creditAccount: "9200", memo: "Rig disjoint basis" }),
  });
  assert.equal(disjoint.overlap_warning, null,
    "an entirely disjoint account set warns nothing, despite a busy client");

  const other = await freshWorkClient(ALICE(), "p909noverlap2");
  const ref2 = await instructionRef({ client: other, author: ALICE() });
  const isolated = await createAccountingPlan(ALICE(), {
    client: other, authorityRef: ref2, purpose: "Rig no-overlap isolated plan",
    effectiveFrom: from, basis: basis({ memo: "Rig isolated basis, same codes as the busy client" }),
  });
  assert.equal(isolated.overlap_warning, null,
    "no sibling of THIS client exists, so no warning even though the codes match another client's");
});

test("p909.status — an ENDED sibling stops warning; a PAUSED sibling keeps warning", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "p909status");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = "2026-07-01";

  const toEnd = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig status to-be-ended",
    effectiveFrom: from, basis: basis({ memo: "Rig status ended basis" }),
  });
  const toPause = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig status to-be-paused",
    effectiveFrom: from, basis: basis({ memo: "Rig status paused basis" }),
  });

  await endAccountingPlan(ALICE(), { plan: toEnd.plan_id, reason: "rig ended for p909.status" });
  await pauseAccountingPlan(ALICE(), { plan: toPause.plan_id, reason: "rig paused for p909.status" });

  const probe = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig status probe",
    effectiveFrom: from, basis: basis({ memo: "Rig status probe basis" }),
  });
  assert.ok(probe.overlap_warning, "the paused sibling still warns");
  const names = probe.overlap_warning.templates.map((x) => x.name);
  assert.ok(names.includes("Rig status to-be-paused"), "a paused plan is still named");
  assert.ok(!names.includes("Rig status to-be-ended"), "an ended plan is never named");
});

// p909.combined-with-template — RETIRED by #929/0283. This cell used to prove that a basis
// overlapping BOTH a live 0045 template and a sibling plan kept the template's own kind label and
// named both (0281's own documented, transitional choice for the then-empty combined case). 0281's
// own header predicted this note would become moot once #929 deleted the template arm; it has —
// the template arm no longer exists, so there is no "combined" case left to prove here. The
// equivalent proof for the CURRENT contract (a live template row is invisible, alone or alongside
// a sibling plan) now lives in tests/plan-overlap-template-arm-retired.test.mjs's
// "p929.template-alone" and "p929.template-with-sibling" cells, frontier-gated on 0283.

test("p909.accrual-door — clara.create_accrual_adjustment (an outer door, not the shared function directly) surfaces the widened warning", async (t) => {
  if (unready(t)) return;
  const client = await freshAccrualClient(ALICE(), "p909accrual");
  const ref = await instructionRef({ client, author: ALICE() });

  const sibling = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, purpose: "Rig accrual-door sibling",
    effectiveFrom: "2026-07-01",
    basis: basis({ debitAccount: "6100", creditAccount: "1150", memo: "Rig accrual-door sibling basis" }),
  });
  assert.equal(sibling.overlap_warning, null, "first plan on this client, no sibling yet");

  // A WINDOW WHOLLY AHEAD OF TODAY (2026-09-20 at authoring time), so no due date has arrived and
  // create_accrual_adjustment admits nothing inline -- this cell is about the WARNING, not about
  // occurrence admission, which has its own battery (accrual-adjustments.test.mjs).
  const acc = await createAccrualAdjustment(ALICE(), {
    client, authorityRef: ref, purpose: "Rig accrual for door test",
    accrual: accrual({ servicePeriodStart: "2027-01-01", servicePeriodEnd: "2027-03-31" }),
    effectiveFrom: "2027-01-01", effectiveTo: "2027-03-31",
  });
  assert.equal(acc.kind, "reversing_journal",
    "the accrual door rides create_accounting_plan's own reversing_journal contract");
  assert.ok(acc.overlap_warning, "the accrual door's OWN answer carries the widened warning");
  assert.equal(acc.overlap_warning.kind, "accounting_plan_overlap");
  assert.equal(acc.overlap_warning.templates.length, 1);
  assert.equal(acc.overlap_warning.templates[0].name, "Rig accrual-door sibling");
  assert.ok(acc.overlap_warning.templates[0].accounts.includes("6100"));
});

test("p909.tail — outside-in re-proof of 0281's own tail: the sibling arm is present, it self-excludes the caller's own plan, and the posture is unmoved", async (t) => {
  if (unready(t)) return;
  // Resolved BY NAME, not by signature: 0281 shipped `(uuid,jsonb)` and 0283's fix round replaced
  // it with `(uuid,jsonb,uuid)`. What is true at EVERY frontier from 0281 on is that clara carries
  // exactly ONE function of this name — which is itself the claim worth asserting here, since a
  // surviving second overload would be a second definition of "does this plan overlap".
  const r = await rootQuery(
    `select p.prosrc as src, pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
            p.provolatile as vol, coalesce(p.proacl::text,'(null)') as acl,
            coalesce(array_to_string(p.proconfig,','),'<none>') as cfg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = $1`,
    [FN_NAME]);
  assert.equal(r.rowCount, 1, "clara._plan_overlap_warning does not resolve at exactly one signature");
  const row = r.rows[0];
  assert.match(row.src, /accounting_plan_overlap/, "the new sibling-plan kind is missing");
  assert.match(row.src, /clara\.accounting_plans/, "the sibling arm no longer scans clara.accounting_plans");
  assert.match(row.src, /clara\.accounting_plan_revisions/, "the sibling arm no longer scans clara.accounting_plan_revisions");
  // THE SELF-EXCLUSION, stated the way it is true at every frontier from 0281 on: 0281 excluded
  // the caller's own plan by BASIS VALUE and 0283's fix round replaced that with the caller's own
  // plan ID (which is what closes the byte-identical-sibling blind spot). Either shape satisfies
  // 0281's own claim — that the door's own freshly-written row never warns about itself — and
  // p929.identical-basis proves the stronger post-0283 contract.
  assert.match(row.src, /is distinct from (?:p_basis|p_self_plan)/,
    "the self-exclusion guard is missing entirely -- the creating door would warn about its own row");
  // The two assertions that used to pin the 0045 template arm's own PRESENCE here
  // (adjustment_template_overlap / clara.adjustment_templates) were REMOVED by #929/0283, which
  // retires that arm -- their presence stopped being an invariant true across every frontier
  // "0281 or later" the moment 0283 landed. The ABSENCE proof now lives in
  // tests/plan-overlap-template-arm-retired.test.mjs's own "p929.tail" cell, frontier-gated on
  // 0283, so this cell keeps describing only what remains true unconditionally from 0281 on: the
  // sibling arm's own tokens, re-asserted above, and the posture/non-regression pins below.
  assert.equal(row.owner, "clara_fn_owner");
  assert.equal(row.secdef, true);
  assert.equal(row.vol, "s", "clara._plan_overlap_warning must stay STABLE");
  assert.equal(row.cfg, "search_path=clara, pg_temp");
  assert.equal(row.acl, FN_ACL, "0281 must not grant EXECUTE to any application role");
});
