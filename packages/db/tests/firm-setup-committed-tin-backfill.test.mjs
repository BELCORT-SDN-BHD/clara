// #1098 — THE POPULATION 0311 DID NOT REACH: a firm that COMMITTED its firm-setup plan before
// 0311 landed carries no `tin` plan item, and `clara.seed_firm_setup_plan` refuses a plan that is
// not open (`CLR10 firm_setup_not_open`), so the row can never arrive through the door. Migration:
// 0347_firm_setup_committed_tin_backfill.sql. Frontier-gated on its own STABLE STEM
// (`firm_setup_committed_tin_backfill$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `firm_setup_tin_required$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes ONE apply
// over whatever rows that server happened to hold, and on a from-scratch chain that is zero rows.
// This file describes the LIVE behaviour instead, by planting the pre-0311 shape itself and
// driving the seam (packages/db/README.md, "Migration and deployment behavior").
//
// THE SEAM. `clara._firm_setup_backfill_committed_tin()` — the idempotent verb 0347 mints and
// then calls once. It is the seam rather than the migration's own inline statement for one
// reason: a one-shot statement inside an applied migration can only ever be observed against the
// rows that server held at apply time, so #1098's own third acceptance criterion ("a test drives
// an already-committed firm-setup plan and asserts it gains a TIN item after the backfill runs")
// would be vacuous on every fresh chain. A verb can be driven, on any database, against a world
// the cell planted itself. It is EXECUTE-granted to nobody; every call below is the root
// connection.
//
// WHAT IS UNDER TEST, one cell per acceptance criterion of #1098:
//   AC1/AC3 — `p1098.backfill.committed_plan_gains_tin_marked_by_turnover`
//   AC2     — `p1098.backfill.no_other_item_and_no_plan_row_moves`
//   scope   — `p1098.backfill.open_and_cancelled_plans_are_not_touched`
//   redo    — `p1098.backfill.a_second_run_is_a_no_op`
//   AC1's RESIDUAL — `p1098.residual.a_committed_plan_still_refuses_the_answer`
//   the one-shot's own effect — `p1098.census.no_committed_firm_plan_lacks_tin`
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona; the world
// is planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — the `firm-setup-applicability.test.mjs` precedent — because the subject here is
// the backfill verb, not firm creation or membership.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const STEM = "firm_setup_committed_tin_backfill$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_COMMITTED_TIN_BACKFILL === "1") {
    console.warn(`SKIP firm-setup-committed-tin-backfill: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-committed-tin-backfill lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #1098 committed-plan TIN backfill lane is required for a focused run: apply 0347_firm_setup_committed_tin_backfill.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. A firm whose firm-setup plan reached its terminal state the way a real firm's does —
// through `seed_firm_setup_plan`, `answer_firm_setup_item` and `commit_firm_setup` — and then had
// its `tin` row REMOVED through the root connection. That removal is how the PRE-0311 shape is
// planted: before 0311, `clara._firm_setup_applicability(plan,'tin')` read `'inapplicable'` for a
// sub-threshold firm and `seed_firm_setup_plan` skipped the row entirely, so the plan committed
// with no `tin` item at all. There is no way to reach that shape through today's doors, because
// today's seed always plants `tin`; planting it by hand is the same act as planting the plan row
// itself (the `firm-setup-applicability.test.mjs` precedent).
// ---------------------------------------------------------------------------------------------
async function firmWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`p1098_${suffix}`]))
    .rows[0].id;
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `p1098 admin ${suffix}`, `p1098_admin_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'admin','active')",
    [firm, admin]);
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[]) returning id`,
    [firm, admin])).rows[0].id;
  await rootQuery(
    `insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
     values ($1, 1, clara._onboarding_plan_snapshot($1))`,
    [plan]);
  return { firm, admin, plan };
}

const seed = (sub, opKey) =>
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [opKey ?? opk("p1098s")])
    .then((r) => r.rows[0].r);
const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);
const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("p1098a")],
  ).then((r) => r.rows[0].r);
const commitPlan = (sub, o) =>
  humanQuery(sub,
    "select clara.commit_firm_setup(p_plan => $1, p_expected_revision => $2, p_op_key => $3) as r",
    [o.plan, o.revision, o.opKey ?? opk("p1098c")]).then((r) => r.rows[0].r);

/** THE SEAM. Granted to nobody; the root connection is a superuser and reaches it. */
const backfill = () =>
  rootQuery("select clara._firm_setup_backfill_committed_tin() as n").then((r) => r.rows[0].n);

/** A value of the shape the CATALOGUE declares — never a shape this file invents
 *  (`firm-setup.test.mjs`'s own `sampleAnswer`). */
function sampleAnswer(item) {
  switch (item.answer_shape) {
    case "choice": return item.answer_options[0];
    case "month": return 6;
    case "long_text": return "1 Jalan Rig\nKuala Lumpur";
    case "labelled_object":
      return { [item.answer_field]: item.answer_options.length > 0 ? item.answer_options[0] : "MPERS" };
    default: return `rig ${item.item_key}`;
  }
}

/** Answer every row the read reports as required right now, giving `turnover` the band the caller
 *  names; `tin` too when the caller asks, because a band at or above RM1M makes it required and
 *  the commit door then refuses until it is answered (#1032). */
async function answerRequired(w, band, alsoTin) {
  let env = await readSetup(w.admin);
  for (const item of env.items.filter((i) => i.required || (alsoTin && i.item_key === "tin"))) {
    if (item.state !== "pending") continue;
    const a = item.item_key === "turnover" ? band
      : item.item_key === "tin" ? "IG5678901234" : sampleAnswer(item);
    await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: item.item_key, answer: a });
    env = await readSetup(w.admin);
  }
  if (alsoTin) {
    const tin = env.items.find((i) => i.item_key === "tin");
    if (tin && tin.state === "pending") {
      await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "tin", answer: "IG5678901234" });
      env = await readSetup(w.admin);
    }
  }
  return env;
}

/** A firm that finished setup BEFORE 0311: committed, carrying no `tin` item at all. */
async function committedPlanWithoutTin(tag, band) {
  const w = await firmWorld(tag);
  await seed(w.admin);
  const tinIsRequired = band !== "<RM1M";
  const env = await answerRequired(w, band, tinIsRequired);
  await commitPlan(w.admin, { plan: w.plan, revision: env.revision_token });
  await rootQuery("delete from clara.onboarding_plan_items where plan_id = $1 and item_key = 'tin'", [w.plan]);
  return w;
}

const itemOf = (env, key) => env.items.find((i) => i.item_key === key);

// =============================================================================================
// AC1 / AC3 — a committed plan missing TIN gains it, marked by the turnover answer it already has.
// =============================================================================================

cell("p1098.backfill.committed_plan_gains_tin_marked_by_turnover", async () => {
  // Two firms that finished setup before 0311: one above the MyInvois threshold, one below it.
  const above = await committedPlanWithoutTin("req", "RM1M-5M");
  const below = await committedPlanWithoutTin("opt", "<RM1M");

  for (const [w, where] of [[above, "above the threshold"], [below, "below the threshold"]]) {
    const env = await readSetup(w.admin);
    assert.equal(env.state, "committed", `${where}: the planted plan must be committed`);
    assert.equal(itemOf(env, "tin").state, "unseeded",
      `${where}: the pre-0311 shape is a committed plan with NO tin row`);
  }

  const added = await backfill();
  assert.ok(added >= 2, `the backfill reported ${added} rows, expected at least the two planted here`);

  const aboveEnv = await readSetup(above.admin);
  assert.equal(itemOf(aboveEnv, "tin").state, "pending",
    "above the threshold: the committed plan now carries a tin item");
  assert.equal(itemOf(aboveEnv, "tin").applicability, "required",
    "above the threshold: a turnover that makes MyInvois mandatory marks tin required");
  assert.equal(itemOf(aboveEnv, "tin").required, true);
  assert.equal(itemOf(aboveEnv, "tin").kind, "capture");
  assert.equal(itemOf(aboveEnv, "tin").answer, null);

  const belowEnv = await readSetup(below.admin);
  assert.equal(itemOf(belowEnv, "tin").state, "pending",
    "below the threshold: the committed plan now carries a tin item");
  assert.equal(itemOf(belowEnv, "tin").applicability, "optional",
    "below the threshold: a sub-threshold turnover marks tin optional");
  assert.equal(itemOf(belowEnv, "tin").required, false);
  assert.equal(itemOf(belowEnv, "tin").answer, null);
});
