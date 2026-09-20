// #891 — FIRM SETUP APPLICABILITY PREDICATES: an item that does not apply to this firm is not
// asked. Migration: 0257_firm_setup_applicability.sql. Frontier-gated on its own STABLE STEM
// (`firm_setup_applicability$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `firm_setup_polish$` / `onboarding_plan_firm_uniqueness$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, one cell per acceptance criterion:
//   AC1 — `p891.mpers.entity_type` — a Sdn Bhd is seeded (asked) the eligibility item through the
//     doors; another entity type is not, and stays unseeded across a later reconciliation.
//   AC2 — `p891.tin.turnover` — the TIN item follows the turnover answer both ways, including
//     turnover unanswered (undetermined — neither asked nor counted).
//   AC3 — `p891.counter.excludes` — the required counter counts a determined, seeded, applicable
//     conditional item on BOTH sides, and drops it from BOTH the moment its dependency is
//     corrected to make it inapplicable.
//   AC4 — `p891.answer.survives` — an item answered before it became inapplicable keeps its
//     answer; only its reported applicability (and required-ness) changes.
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona. The world is
// planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — the `firm-setup-polish.test.mjs` precedent — because the subject here is the
// applicability door and its two callers, not firm creation or membership.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const STEM = "firm_setup_applicability$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 4;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing (the
 *  `onboarding-plan-firm-uniqueness.test.mjs` idiom, verbatim). */
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

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing.
 *  Only the package run, which preloads `firm-setup-applicability-preintegration-gate.mjs`, turns
 *  the absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_APPLICABILITY === "1") {
    console.warn(`SKIP firm-setup-applicability: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-applicability lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #891 firm-setup-applicability lane is required for a focused run: apply 0257_firm_setup_applicability.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the root connection, `firm-setup-polish.test.mjs`'s own precedent: the
// subject is the applicability door and its two callers, and going through create_firm/
// claim_paid_firm would only add ways to fail for reasons that are not the subject.
// ---------------------------------------------------------------------------------------------
async function firmSetupWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fsa_${suffix}`]))
    .rows[0].id;
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `fsa admin ${suffix}`, `fsa_admin_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'admin','active')",
    [firm, admin]);
  /** The firm-scope plan exactly as `clara._create_firm_core` opens one (0145:492-494). */
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
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [opKey]).then((r) => r.rows[0].r);
const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);
const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("fsaans")],
  ).then((r) => r.rows[0].r);

const itemOf = (env, key) => env.items.find((i) => i.item_key === key);

// =============================================================================================
// AC1 — mpers_eligibility follows entity_type, through the doors.
// =============================================================================================

cell("p891.mpers.entity_type a Sdn Bhd is seeded the eligibility item through the doors; another entity type stays unseeded", async () => {
  const sdnBhd = await firmSetupWorld("t1a");
  await seed(sdnBhd.admin, opk("fsaseed1a"));
  let env = await readSetup(sdnBhd.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "undetermined",
    "entity_type is unanswered -- the eligibility screen cannot be determined yet");
  assert.equal(itemOf(env, "mpers_eligibility").state, "unseeded");

  await answer(sdnBhd.admin, {
    plan: sdnBhd.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sdn_bhd",
  });
  await seed(sdnBhd.admin, opk("fsaseed1b"));
  env = await readSetup(sdnBhd.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "applicable");
  assert.equal(itemOf(env, "mpers_eligibility").state, "pending",
    "the reconciliation after entity_type is answered must seed the now-applicable item");

  const soleProp = await firmSetupWorld("t1b");
  await seed(soleProp.admin, opk("fsaseed1c"));
  env = await readSetup(soleProp.admin);
  await answer(soleProp.admin, {
    plan: soleProp.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sole_prop",
  });
  await seed(soleProp.admin, opk("fsaseed1d"));
  env = await readSetup(soleProp.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "inapplicable");
  assert.equal(itemOf(env, "mpers_eligibility").state, "unseeded",
    "a non-Sdn-Bhd firm must never have the eligibility screen seeded");
});

// =============================================================================================
// AC2 — tin follows turnover, both ways, including turnover unanswered.
// =============================================================================================

cell("p891.tin.turnover the TIN item follows the turnover answer both ways, including turnover unanswered", async () => {
  const w = await firmSetupWorld("t2");
  await seed(w.admin, opk("fsaseed2a"));
  let env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").applicability, "undetermined");
  assert.equal(itemOf(env, "tin").state, "unseeded");

  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "turnover", answer: "<RM1M",
  });
  await seed(w.admin, opk("fsaseed2b"));
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").applicability, "inapplicable",
    "a firm below RM1M turnover is exempt -- TIN must never be seeded");
  assert.equal(itemOf(env, "tin").state, "unseeded");

  const above = await firmSetupWorld("t2b");
  await seed(above.admin, opk("fsaseed2c"));
  env = await readSetup(above.admin);
  await answer(above.admin, {
    plan: above.plan, revision: env.revision_token, itemKey: "turnover", answer: "RM1M-5M",
  });
  await seed(above.admin, opk("fsaseed2d"));
  env = await readSetup(above.admin);
  assert.equal(itemOf(env, "tin").applicability, "applicable");
  assert.equal(itemOf(env, "tin").state, "pending");
});

// =============================================================================================
// AC3 — the required counter counts a determined, seeded, applicable conditional item on both
// sides, and drops it from both the moment its dependency makes it inapplicable.
// =============================================================================================

cell("p891.counter.excludes the required counter includes a seeded, applicable conditional item on both sides, and excludes it from both once its dependency makes it inapplicable", async () => {
  const w = await firmSetupWorld("t3");
  await seed(w.admin, opk("fsaseed3a"));
  let env = await readSetup(w.admin);
  assert.equal(env.counter.required_total, 8, "the eight unconditional required rows, before any conditional item is ever seeded");
  assert.equal(env.counter.required_answered, 0);
  assert.equal(itemOf(env, "tin").required, false);

  // Turnover determines TIN applicable, but nobody has reconciled the checklist again yet -- the
  // counter must NOT move for an item nobody has seeded.
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "turnover", answer: "RM1M-5M",
  });
  env = await readSetup(w.admin);
  assert.equal(env.counter.required_total, 8,
    "an applicable-but-unseeded conditional item must not inflate the denominator");
  assert.equal(env.counter.required_answered, 1, "turnover itself is now answered");

  // Reconciling seeds TIN -- now it counts, unanswered, on the denominator alone.
  await seed(w.admin, opk("fsaseed3b"));
  env = await readSetup(w.admin);
  assert.equal(env.counter.required_total, 9, "a seeded, applicable TIN joins the required denominator");
  assert.equal(env.counter.required_answered, 1, "TIN is not yet answered");
  assert.equal(itemOf(env, "tin").required, true);

  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "tin", answer: "C1234567890",
  });
  env = await readSetup(w.admin);
  assert.equal(env.counter.required_total, 9);
  assert.equal(env.counter.required_answered, 2, "turnover and tin, both now answered");

  // Correcting turnover back under the exemption threshold makes TIN inapplicable LIVE -- excluded
  // from BOTH sides on the very next read, even though its own answer is untouched.
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "turnover", answer: "<RM1M",
  });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").applicability, "inapplicable");
  assert.equal(env.counter.required_total, 8, "TIN drops out of the denominator");
  assert.equal(env.counter.required_answered, 1, "…and out of the numerator -- only turnover (itself unconditional) remains counted");
  assert.equal(itemOf(env, "tin").required, false);
  assert.equal(itemOf(env, "tin").answer, "C1234567890", "the earlier answer is untouched by the exclusion");
});

// =============================================================================================
// AC4 — an item answered before it became inapplicable keeps its answer.
// =============================================================================================

cell("p891.answer.survives an item answered before it became inapplicable keeps its answer and is marked inapplicable, not deleted", async () => {
  const w = await firmSetupWorld("t4");
  await seed(w.admin, opk("fsaseed4a"));
  let env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sdn_bhd",
  });
  await seed(w.admin, opk("fsaseed4b"));
  env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "mpers_eligibility",
    answer: { determination: "eligible" },
  });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "applicable");
  assert.deepEqual(itemOf(env, "mpers_eligibility").answer, { determination: "eligible" });
  assert.equal(itemOf(env, "mpers_eligibility").state, "answered");

  // entity_type is corrected away from sdn_bhd -- mpers_eligibility's OWN row is never touched.
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sole_prop",
  });
  env = await readSetup(w.admin);
  const mpers = itemOf(env, "mpers_eligibility");
  assert.equal(mpers.applicability, "inapplicable", "re-derived live, off the corrected entity_type");
  assert.equal(mpers.state, "answered", "the plan item's own state is untouched -- nothing deletes it");
  assert.deepEqual(mpers.answer, { determination: "eligible" }, "the earlier answer survives the correction");
  assert.equal(mpers.required, false, "an inapplicable item is excluded from the required side too");
});
