// #644 — A5/A6 answers become Knowledge. This battery owns CB-AE2E-007/009/030's actual finding:
// clara.commit_client_onboarding (0017:2751-2842) writes NOTHING into any fact register, so an
// interview answer has always been a rendered card and a plan item, never saved Knowledge.
// Migration: 0192_client_knowledge_records.sql; gated on the LIVE CATALOG, never on the number.
//
// THE MAP IS DATA, AND THIS BATTERY READS IT. clara.knowledge_plan_item_map is the owner-ratifiable
// item_key -> knowledge_key contract; the cells below assert the mapping the migration seeded,
// and that an item key OUTSIDE it is deliberately not promoted.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertRaises, endPool, humanQuery, roleQuery, rootQuery, opk, ROLES } from "./rig-fixtures.mjs";
import { committedPlan, knowledgeCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 10;
let live = false;
let executed = 0;

before(async () => { live = await knowledgeCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_0192 === "1") {
    console.warn("SKIP knowledge-onboarding-promotion: the 0192 cohort is not applied (explicit pre-integration run).");
    t.skip("knowledge cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0192 knowledge cohort is required for a focused run: apply 0192_client_knowledge_records.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

const PROMOTE = `select clara.promote_plan_answers_to_knowledge(
  p_plan => $1, p_op_key => $2, p_promote_firm_scope => $3) as r`;

const promoteAsHuman = (sub, plan, { opKey = opk("kn_pr"), firmScope = false } = {}) =>
  humanQuery(sub, PROMOTE, [plan, opKey, firmScope]).then((r) => r.rows[0].r);
const promoteAsRuntime = (plan, { opKey = opk("kn_pr"), firmScope = false } = {}) =>
  roleQuery(ROLES.runtime, PROMOTE, [plan, opKey, firmScope]).then((r) => r.rows[0].r);
const listKnowledge = (sub, client) =>
  humanQuery(sub, "select clara.list_client_knowledge(p_client => $1) as r", [client])
    .then((r) => r.rows[0].r);
const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

/** The answers a committed v2 CLIENT interview leaves behind, in their real jsonb shapes
 *  (packages/runtime/workflows/interview.v2.questions.ts + .segments.ts). `who` answers them. */
function v2ClientAnswers(who, { policyAnsweredBy = who } = {}) {
  return {
    legal_name: { value: "Rig Trading Sdn Bhd", answeredBy: who },   // NOT mapped (identity, #647)
    ssm: { value: { registration: "202301234567", format_verified: true }, answeredBy: who }, // NOT mapped
    tin: { value: "C12345678900", answeredBy: who },                  // NOT mapped
    entity_type: { value: "sdn_bhd", answeredBy: who },
    msic: { value: "46900", answeredBy: who },
    turnover: { value: "RM1M-5M", answeredBy: who },
    fye: { value: 6, answeredBy: who },
    currency: { value: "MYR", answeredBy: who },
    sst_regime: { value: "service_tax", answeredBy: who },
    mpers_eligibility: { value: { determination: "eligible", test: "ca2016_s244_private_entity" }, answeredBy: who },
    framework: { value: { framework_code: "MPERS", framework_label: "MPERS", entity_type: "sdn_bhd", mpers_eligibility: "eligible" }, answeredBy: policyAnsweredBy },
    accounting_basis: { value: { accounting_basis: "accrual", accounting_basis_label: "Accrual", entity_type: "sdn_bhd" }, answeredBy: policyAnsweredBy },
    coa_seed_decision: { value: { seed: "lhdn_mpers_standard" }, answeredBy: who },
    first_year_zero_opening: { value: { opening: "zero" }, answeredBy: who },  // NOT mapped (a commit gate)
    sample_invoices: { value: { attached: false }, answeredBy: who },          // NOT mapped (a todo)
  };
}

// The mapping the migration seeds, re-stated here so a silent change to the catalog data is a
// RED rather than an invisible product decision. This is the table the owner ratifies.
const EXPECTED_MAP = {
  entity_type: "entity_type",
  msic: "msic",
  turnover: "turnover_band",
  fye: "financial_year_end_month",
  currency: "default_currency",
  sst_regime: "sst_regime",
  mpers_eligibility: "mpers_eligibility",
  framework: "reporting_framework",
  accounting_basis: "accounting_basis",
  coa_seed_decision: "coa_seed_decision",
};

cell("kp.01 the map is exactly the ten item keys the live interview produces, each naming a real knowledge key", async () => {
  const r = await rootQuery(
    `select m.item_key, m.knowledge_key, k.kind from clara.knowledge_plan_item_map m
       join clara.knowledge_keys k on k.knowledge_key = m.knowledge_key order by m.item_key`);
  const got = Object.fromEntries(r.rows.map((x) => [x.item_key, x.knowledge_key]));
  assert.deepEqual(got, EXPECTED_MAP);
  assert.equal(r.rows.filter((x) => x.kind === "policy").length, 2,
    "framework + accounting_basis are the two policy keys the map carries");
});

cell("kp.02 CB-AE2E-030: a COMMITTED plan alone puts nothing into Knowledge", async () => {
  const w = await knowledgeWorld("p2");
  await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin) });
  const before_ = await listKnowledge(w.admin, w.clientA);
  assert.deepEqual(before_.records, [],
    "committing an onboarding plan must not, by itself, have written Knowledge");
  assert.equal(before_.knowledge_version, 0);
});

cell("kp.03 promotion writes ONE asserted/interview record per MAPPED item, attributed to the answerer", async () => {
  const w = await knowledgeWorld("p3");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin) });
  const r = await promoteAsHuman(w.admin, plan);
  assert.equal(r.scope_kind, "client");
  assert.equal(r.client_id, w.clientA);
  assert.equal(r.promoted.length, 10, `promoted ${r.promoted.length}: ${JSON.stringify(r.promoted)}`);
  assert.equal(r.skipped.length, 0);
  assert.equal(r.withheld.length, 0, JSON.stringify(r.withheld));
  assert.deepEqual(
    Object.fromEntries(r.promoted.map((p) => [p.item_key, p.knowledge_key])), EXPECTED_MAP);
  const rows = await rootQuery(
    `select knowledge_key, source_kind, trust, revision_kind, revision_n, state, asserted_by,
            recorded_via, basis
       from clara.knowledge_records where client_id = $1 order by knowledge_key`, [w.clientA]);
  assert.equal(rows.rowCount, 10);
  for (const row of rows.rows) {
    assert.equal(row.source_kind, "interview");
    assert.equal(row.trust, "asserted");
    assert.equal(row.revision_kind, "capture");
    assert.equal(row.revision_n, 1);
    assert.equal(row.state, "live");
    assert.equal(row.asserted_by, w.admin, "asserted_by must be the person who answered");
    assert.equal(row.recorded_via, "human_ui");
    assert.match(row.basis, new RegExp(`Committed onboarding plan ${plan}`),
      "the basis must name the plan the answer came from");
  }
  // The real shapes survive verbatim.
  const fye = await rootQuery(
    "select value from clara.knowledge_records where client_id=$1 and knowledge_key='financial_year_end_month'",
    [w.clientA]);
  assert.equal(fye.rows[0].value, 6, "validateFye returns a NUMBER; the record must keep it as one");
  const fw = await rootQuery(
    "select value from clara.knowledge_records where client_id=$1 and knowledge_key='reporting_framework'",
    [w.clientA]);
  assert.equal(fw.rows[0].value.framework_code, "MPERS");
});

cell("kp.04 the UNMAPPED item keys are deliberately not promoted (identity is #647's, todos are nobody's)", async () => {
  const w = await knowledgeWorld("p4");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin) });
  await promoteAsHuman(w.admin, plan);
  const keys = (await rootQuery(
    "select knowledge_key from clara.knowledge_records where client_id=$1", [w.clientA]))
    .rows.map((r) => r.knowledge_key);
  for (const absent of ["legal_name", "ssm", "tin", "first_year_zero_opening", "sample_invoices"]) {
    assert.equal(keys.includes(absent), false, `${absent} must not be promoted in this slice`);
  }
});

cell("kp.05 a second promotion is a no-op: everything SKIPS, and an exact op_key replays its receipt", async () => {
  const w = await knowledgeWorld("p5");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin) });
  const key = opk("kn_replay");
  const first = await promoteAsHuman(w.admin, plan, { opKey: key });
  const replay = await promoteAsHuman(w.admin, plan, { opKey: key });
  assert.deepEqual(replay, first, "an exact op_key retry must replay its stored receipt");
  // A FRESH op_key is the real idempotency test: the records already exist, so every item skips.
  const again = await promoteAsHuman(w.admin, plan);
  assert.equal(again.promoted.length, 0);
  assert.equal(again.skipped.length, 10, JSON.stringify(again.skipped));
  const n = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where client_id=$1", [w.clientA]);
  assert.equal(n.rows[0].n, 10, "a replayed promotion duplicated records");
});

cell("kp.06 a POLICY answered by a bookkeeper is WITHHELD by name, never quietly recorded as policy", async () => {
  const w = await knowledgeWorld("p6");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin, { policyAnsweredBy: w.bookkeeper }) });
  const r = await promoteAsHuman(w.admin, plan);
  assert.equal(r.promoted.length, 8);
  assert.equal(r.withheld.length, 2);
  assert.deepEqual(r.withheld.map((x) => x.item_key).sort(), ["accounting_basis", "framework"]);
  assert.equal(r.withheld.every((x) => x.reason === "answerer_rank_insufficient"), true,
    JSON.stringify(r.withheld));
  const keys = (await rootQuery(
    "select knowledge_key from clara.knowledge_records where client_id=$1", [w.clientA]))
    .rows.map((x) => x.knowledge_key);
  assert.equal(keys.includes("reporting_framework"), false);
  assert.equal(keys.includes("accounting_basis"), false);
});

cell("kp.07 a legacy v1-shaped answer is WITHHELD with its refusal, not fatal to the whole promotion", async () => {
  const w = await knowledgeWorld("p7");
  const answers = v2ClientAnswers(w.admin);
  // interview.v1 recorded `framework` as a plain enum STRING; v2 folds an object. A plan answered
  // under v1 must not abort a promotion that has nine other perfectly good answers.
  answers.framework = { value: "MPERS", answeredBy: w.admin };
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin, answers });
  const r = await promoteAsHuman(w.admin, plan);
  assert.equal(r.promoted.length, 9);
  assert.equal(r.withheld.length, 1);
  assert.equal(r.withheld[0].item_key, "framework");
  assert.equal(r.withheld[0].reason, "refused");
  assert.equal(r.withheld[0].sqlstate, "CLR10");
  assert.match(r.withheld[0].detail, /knowledge_value_invalid/);
});

cell("kp.08 an OPEN plan promotes nothing, and a firm plan needs the explicit firm-scope parameter", async () => {
  const w = await knowledgeWorld("p8");
  const open = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, state)
     values ($1,'client',$2,'open') returning id`, [w.firm, w.clientA])).rows[0].id;
  const err = await assertRaises("CLR10", () => promoteAsHuman(w.admin, open),
    "promoting an open plan");
  assert.equal(reasonOf(err), "plan_not_committed");

  const firmPlan = await committedPlan({ firm: w.firm, client: null, scopeKind: "firm",
    committedBy: w.admin,
    answers: { currency: { value: "MYR", answeredBy: w.admin },
               fye: { value: 12, answeredBy: w.admin } } });
  const noFlag = await assertRaises("CLR10", () => promoteAsHuman(w.admin, firmPlan),
    "promoting a firm plan without saying so");
  assert.equal(reasonOf(noFlag), "firm_scope_not_requested");
  const runtimeFirm = await assertRaises("CLR04", () => promoteAsRuntime(firmPlan, { firmScope: true }),
    "the runtime lane promoting a firm default");
  assert.equal(reasonOf(runtimeFirm), "firm_scope_requires_admin");

  const ok = await promoteAsHuman(w.admin, firmPlan, { firmScope: true });
  assert.equal(ok.scope_kind, "firm");
  assert.equal(ok.client_id, null);
  assert.equal(ok.promoted.length, 2);
  const rows = await rootQuery(
    "select scope_kind, client_id, knowledge_key from clara.knowledge_records where firm_id=$1 order by knowledge_key",
    [w.firm]);
  assert.equal(rows.rows.every((r) => r.scope_kind === "firm" && r.client_id === null), true);
});

cell("kp.09 the RUNTIME lane promotes a committed client plan with no JWT, recorded as clara_runtime", async () => {
  const w = await knowledgeWorld("p9");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: { turnover: { value: "RM5M-25M", answeredBy: w.bookkeeper },
               msic: { value: "47211", answeredBy: w.bookkeeper } } });
  const r = await promoteAsRuntime(plan);
  assert.equal(r.promoted.length, 2);
  const rows = await rootQuery(
    "select recorded_via, asserted_by, trust from clara.knowledge_records where client_id=$1", [w.clientA]);
  assert.equal(rows.rows.every((x) => x.recorded_via === "clara_runtime"), true,
    "the runtime lane must record itself as the writer");
  assert.equal(rows.rows.every((x) => x.asserted_by === w.bookkeeper), true,
    "…and must not impersonate: the attributed person is the one who answered");
  assert.equal(rows.rows.every((x) => x.trust === "asserted"), true);
});

cell("kp.10 promoted answers reach BOTH the C13 register and the runtime knowledge pack", async () => {
  const w = await knowledgeWorld("p10");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: v2ClientAnswers(w.admin) });
  await promoteAsHuman(w.admin, plan);
  const register = await listKnowledge(w.viewer, w.clientA);
  assert.equal(register.records.length, 10);
  assert.ok(register.knowledge_version > 0);
  assert.equal(register.records.every((r) => r.source_kind === "interview" && r.trust === "asserted"), true);
  const pack = await roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2) as r", [w.clientA, "wiki_coding"])
    .then((r) => r.rows[0].r);
  assert.equal(pack.status, "ok");
  assert.equal(pack.records.length, 10);
  assert.equal(Number(pack.knowledge_version), Number(register.knowledge_version),
    "the human register and the runtime pack must agree on the version they read");
});
