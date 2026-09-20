// #895 — 0218 FIRM-SETUP MIGRATION POLISH: the three SQL defects #648's own fix round found and
// left while 0218 was deliberately byte-frozen. Migration: 0256_firm_setup_polish.sql.
// Frontier-gated on its own STABLE STEM (`firm_setup_polish$`), never its number — numbers are
// claimed at merge (packages/db/README.md) — the `onboarding_plan_firm_uniqueness$` /
// `legal_acceptance$` / `checkout_convergence$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, one cell per acceptance criterion:
//   AC1 — `p895.seed.noop` — a reconciliation that adds no item leaves the plan's own CAS token,
//     revision number and revision history untouched, while the audit row and domain event still
//     fire (seeded=0); a FIRST seed still bumps all three.
//   AC2 — `p895.read.honest_no_plan` — `clara.get_firm_setup()` reads counter={0,0} for a firm
//     with NO firm-scope plan at all, never a fraction borrowed from the catalogue alone.
//   AC3 — `p895.facts.state_filter` — a WITHDRAWN firm default leaves `confirmed_facts`, a LIVE
//     one stays, and a SUPERSEDED one (the record a correction retires) is absent.
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona. The world
// is planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — same as `firm-setup.test.mjs`'s own `plantFirmPlan` — because the subject here
// is the two recut doors, not firm creation or membership.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const STEM = "firm_setup_polish$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

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

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing —
 *  the `onboarding-plan-firm-uniqueness.test.mjs` idiom, verbatim. Only the package run, which
 *  preloads `firm-setup-polish-preintegration-gate.mjs`, turns the absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_POLISH === "1") {
    console.warn(`SKIP firm-setup-polish: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-polish lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #895 firm-setup-polish lane is required for a focused run: apply 0256_firm_setup_polish.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the root connection, `firm-setup.test.mjs`'s own precedent: the
// subject is the two recut doors, and going through create_firm/claim_paid_firm would only add
// ways to fail for reasons that are not the subject.
// ---------------------------------------------------------------------------------------------
async function firmSetupWorld(tag, { withPlan = true } = {}) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fsp_${suffix}`]))
    .rows[0].id;
  const owner = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [owner, `fsp owner ${suffix}`, `fsp_owner_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'owner','active')",
    [firm, owner]);
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `fsp admin ${suffix}`, `fsp_admin_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'admin','active')",
    [firm, admin]);
  let plan = null;
  if (withPlan) plan = await plantFirmPlan(firm, owner);
  return { firm, admin, owner, plan };
}

/** The firm-scope plan exactly as `clara._create_firm_core` opens one (0145:492-494). */
async function plantFirmPlan(firm, opener) {
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[]) returning id`,
    [firm, opener])).rows[0].id;
  await rootQuery(
    `insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
     values ($1, 1, clara._onboarding_plan_snapshot($1))`,
    [plan]);
  return plan;
}

const planRow = (plan) =>
  rootQuery("select * from clara.onboarding_plans where id = $1", [plan]).then((r) => r.rows[0]);
const revisionCount = (plan) =>
  rootQuery("select count(*)::int as n from clara.onboarding_plan_revisions where plan_id = $1", [plan])
    .then((r) => r.rows[0].n);
const auditCount = (firm, fn) =>
  rootQuery("select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = $2", [firm, fn])
    .then((r) => r.rows[0].n);
const events = (firm, type) =>
  rootQuery("select payload from clara.domain_events where firm_id = $1 and event_type = $2 order by seq",
    [firm, type]).then((r) => r.rows.map((x) => x.payload));

const seed = (sub, opKey) =>
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [opKey]).then((r) => r.rows[0].r);
const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);
const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("fspans")],
  ).then((r) => r.rows[0].r);
const withdraw = (sub, o) =>
  humanQuery(sub,
    "select clara.withdraw_knowledge(p_record => $1, p_reason => $2, p_op_key => $3) as r",
    [o.record, o.reason, o.opKey ?? opk("fspwd")],
  ).then((r) => r.rows[0].r);
const correct = (sub, o) =>
  humanQuery(sub,
    "select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3, p_op_key => $4) as r",
    [o.record, JSON.stringify(o.value), o.reason, o.opKey ?? opk("fspcorr")],
  ).then((r) => r.rows[0].r);

// =============================================================================================
// AC1 — DEFECT 1: a no-op reconciliation leaves the plan alone; a real one still bumps.
// =============================================================================================

cell("p895.seed.noop a second seed that adds zero items leaves revision/token/history unchanged; the first seed still bumps all three", async () => {
  const w = await firmSetupWorld("t1");
  const before = await planRow(w.plan);
  assert.equal(before.revision_n, 1);
  assert.equal(await revisionCount(w.plan), 1);

  // FIRST SEED: the plan is empty (claim-path shape). #891: entity_type/turnover are both
  // unanswered, so mpers_eligibility/tin are both UNDETERMINED and stay unseeded; this inserts the
  // other ten catalogue rows -- still a real reconciliation, and it still bumps token, revision_n
  // and history exactly as before. #935: plus the three education tips (no predicate at all):
  // thirteen.
  const first = await seed(w.admin, opk("fspseed1"));
  assert.equal(first.seeded, 13);
  const afterFirst = await planRow(w.plan);
  assert.equal(afterFirst.revision_n, 2, "a real reconciliation must still advance the revision");
  assert.notEqual(afterFirst.revision_token, before.revision_token);
  assert.equal(await revisionCount(w.plan), 2);
  assert.equal(first.revision_token, afterFirst.revision_token);
  assert.equal(first.revision_n, 2);

  // SECOND SEED, a DIFFERENT op_key (not a replay): every DETERMINABLE catalogue row is already on
  // the plan (#891: mpers_eligibility/tin stay UNDETERMINED -- entity_type/turnover are still
  // unanswered -- so neither is seedable yet either), so this reconciliation adds nothing.
  const second = await seed(w.admin, opk("fspseed2"));
  assert.equal(second.seeded, 0, "no further item is seedable while entity_type/turnover remain unanswered");
  const afterSecond = await planRow(w.plan);
  assert.equal(afterSecond.revision_n, 2, "a no-op reconciliation must not advance the revision");
  assert.equal(afterSecond.revision_token, afterFirst.revision_token,
    "a no-op reconciliation must not rotate the CAS token");
  assert.equal(await revisionCount(w.plan), 2, "a no-op reconciliation must not append a revision snapshot");
  assert.equal(second.revision_token, afterFirst.revision_token);
  assert.equal(second.revision_n, 2);
  assert.equal(second.state, "open");
  assert.equal(second.catalogue_total, 15);

  // …but the act is STILL an act: the audit row and the domain event fire both times, the second
  // one carrying seeded=0, so "an admin reconciled and nothing was missing" stays a readable fact.
  assert.equal(await auditCount(w.firm, "seed_firm_setup_plan"), 2);
  const seededEvents = await events(w.firm, "firm_setup.seeded");
  assert.equal(seededEvents.length, 2);
  assert.equal(seededEvents[0].seeded, 13);
  assert.equal(seededEvents[1].seeded, 0);
  assert.equal(seededEvents[0].revision_n, 2);
  assert.equal(seededEvents[1].revision_n, 2, "the no-op event still names the CURRENT (unmoved) revision");
});

// =============================================================================================
// AC2 — DEFECT 2: get_firm_setup's counter is plan-aware.
// =============================================================================================

cell("p895.read.honest_no_plan get_firm_setup reads an honest zero-over-zero counter for a firm with no firm-scope plan at all", async () => {
  const w = await firmSetupWorld("t2", { withPlan: false });
  const env = await readSetup(w.admin);
  assert.equal(env.plan_id, null, "this cell's whole premise is a firm with NO plan");
  assert.equal(env.seeded, false);
  // DEFECT 2 itself: before the fix this read counter.required_total off the catalogue's constant
  // (8, today), independent of plan_id — a real-looking fraction for a plan that does not exist.
  assert.deepEqual(env.counter, { required_answered: 0, required_total: 0 },
    "a plan-less firm must read NO progress, not a fraction borrowed from the catalogue alone");
  // The catalogue's OWN size is untouched by this fix -- it is a constant about the vocabulary,
  // not a claim about this firm's plan. #935: fifteen now (the twelve plus the three tips).
  assert.equal(env.catalogue_total, 15);
  assert.equal(env.confirmed_facts.length, 0);
});

// =============================================================================================
// AC3 — DEFECT 3: confirmed_facts filters on r.state = 'live', matching the per-item join.
// =============================================================================================

cell("p895.facts.state_filter a withdrawn firm default leaves confirmed_facts, a live one stays, a superseded one is absent", async () => {
  const w = await firmSetupWorld("t3");
  await seed(w.admin, opk("fspseed3"));
  let env = await readSetup(w.admin);

  // KEY A ("currency"): answered, then WITHDRAWN. DEFECT 3's own shape -- withdraw_knowledge
  // leaves `superseded_at` NULL (ck_knowledge_records_state forces that for BOTH live and
  // withdrawn), so `superseded_at is null` alone can never exclude it. `record_id` is the STABLE
  // thread identity (shared by every revision of the same fact); `revision_id` (clara.
  // knowledge_records.id) is the one PHYSICAL row a given revision lives on -- capture,
  // correction and withdrawal each mint a NEW `revision_id` under the SAME `record_id`
  // (`clara._knowledge_row_json`, 0192 §D.7).
  const currencyItem = env.items.find((i) => i.item_key === "currency");
  const ansA = await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "currency",
    answer: currencyItem.answer_options[0],
  });
  const recordA = ansA.knowledge.record_id;
  const revA1 = ansA.knowledge.revision_id;
  env = await readSetup(w.admin);
  assert.ok(env.confirmed_facts.some((f) => f.revision_id === revA1 && f.state === "live"),
    "the freshly captured currency default must be live and present before withdrawal");

  // KEY B ("accounting_basis"): answered, then CORRECTED -- the original revision becomes
  // SUPERSEDED and a NEW revision, under the SAME record_id, becomes LIVE.
  const basisItem = env.items.find((i) => i.item_key === "accounting_basis");
  const ansB = await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "accounting_basis",
    answer: { [basisItem.answer_field]: "accrual" },
  });
  const recordB = ansB.knowledge.record_id;
  const revB1 = ansB.knowledge.revision_id;

  const wd = await withdraw(w.admin, { record: recordA, reason: "probe: no longer this firm's stated default" });
  const revAWithdrawn = wd.revision_id;
  const correctedB = await correct(w.admin, {
    record: recordB, value: { [basisItem.answer_field]: "modified cash" },
    reason: "probe: firm restated its accounting basis",
  });
  const revB2 = correctedB.revision_id;
  assert.equal(correctedB.record_id, recordB, "a correction stays on the SAME record_id thread");
  assert.notEqual(revB2, revB1, "a correction must mint a NEW revision_id for the live revision");

  env = await readSetup(w.admin);
  const factRevisionIds = env.confirmed_facts.map((f) => f.revision_id);
  const factStates = Object.fromEntries(env.confirmed_facts.map((f) => [f.revision_id, f.state]));

  // WITHDRAWN leaves confirmed_facts entirely (DEFECT 3's own repro: the withdrawal's own revision
  // never appears, and currency's knowledge_key has no other live revision to take its place).
  assert.ok(!factRevisionIds.includes(revAWithdrawn),
    "a withdrawn firm default's revision must not appear in confirmed_facts");
  assert.ok(!env.confirmed_facts.some((f) => f.knowledge_key === "default_currency"),
    "no revision of the withdrawn currency default may appear in confirmed_facts");
  // SUPERSEDED (the pre-correction revision) is absent -- this half already worked before #895,
  // proven here so the cell states the WHOLE acceptance criterion rather than half of it.
  assert.ok(!factRevisionIds.includes(revB1),
    "a superseded revision must not appear in confirmed_facts");
  // LIVE (the post-correction revision) stays, exactly once for this knowledge_key.
  assert.ok(factRevisionIds.includes(revB2), "the live, corrected revision must appear in confirmed_facts");
  assert.equal(factStates[revB2], "live");
  assert.equal(env.confirmed_facts.filter((f) => f.knowledge_key === "accounting_basis").length, 1);

  // Direct catalog cross-check, independent of the door's own answer: revAWithdrawn really is
  // withdrawn, revB1 really is superseded, revB2 really is live, on clara.knowledge_records itself
  // -- all three sharing exactly the two record_id threads this cell minted.
  const rows = (await rootQuery(
    "select id, record_id, state, superseded_at from clara.knowledge_records where id = any($1::uuid[])",
    [[revAWithdrawn, revB1, revB2]])).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[revAWithdrawn].record_id, recordA);
  assert.equal(byId[revAWithdrawn].state, "withdrawn");
  assert.equal(byId[revAWithdrawn].superseded_at, null);
  assert.equal(byId[revB1].record_id, recordB);
  assert.equal(byId[revB1].state, "superseded");
  assert.notEqual(byId[revB1].superseded_at, null);
  assert.equal(byId[revB2].record_id, recordB);
  assert.equal(byId[revB2].state, "live");
  assert.equal(byId[revB2].superseded_at, null);
});
