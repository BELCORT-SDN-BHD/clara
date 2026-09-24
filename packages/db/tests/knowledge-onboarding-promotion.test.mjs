// #644 — A5/A6 answers become Knowledge. This battery owns CB-AE2E-007/009/030's actual finding:
// clara.commit_client_onboarding (0017:2751-2842) writes NOTHING into any fact register, so an
// interview answer has always been a rendered card and a plan item, never saved Knowledge.
// Migration: 0192_client_knowledge_records.sql; gated on the LIVE CATALOG, never on the number.
//
// THE MAP IS DATA, AND THIS BATTERY READS IT. clara.knowledge_plan_item_map is the owner-ratifiable
// item_key -> knowledge_key contract; the cells below assert the mapping the migration seeded,
// and that an item key OUTSIDE it is deliberately not promoted.

import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { assertRaises, endPool, humanQuery, roleQuery, rootQuery, opk, ROLES } from "./rig-fixtures.mjs";
import {
  committedPlan, fyePairWallCohortApplied, knowledgeCohortApplied, knowledgeWorld,
} from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 13;
const PAIR_EXPECTED_CELLS = 1; // kp.14 -- #1031's pair-wall cohort (0310 + 0317) on top of 0192
let live = false;
let pairWallLive = false;
let executed = 0;
let pairExecuted = 0;

before(async () => {
  live = await knowledgeCohortApplied();
  pairWallLive = live && await fyePairWallCohortApplied();
});
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  if (pairWallLive) {
    assert.equal(pairExecuted, PAIR_EXPECTED_CELLS, `expected ${PAIR_EXPECTED_CELLS} pair-wall cell(s) to run, ${pairExecuted} did`);
  }
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

/** #1031's own gate, layered on top of `gate()` exactly as knowledge-fye-day.test.mjs's does: a
 *  database missing 0192 entirely reports THAT (deferring to `gate()`, never a second reason); a
 *  database carrying 0192 but not the pair-wall cohort reports the pair-wall reason. */
function pairGate(t) {
  if (live) {
    if (pairWallLive) return false;
    if (process.env.CLARA_ALLOW_MISSING_FYE_PAIR_WALL_0310 === "1") {
      console.warn("SKIP knowledge-onboarding-promotion (pair-wall cell): the 0310/0317 cohort is not applied (explicit pre-integration run).");
      t.skip("fye pair-wall cohort absent -- explicit pre-integration run");
      return true;
    }
    assert.fail("the fye pair-wall cohort is required for a focused run: apply 0310_knowledge_fye_pair_wall.sql and 0317_knowledge_fye_pair_applicability.sql");
  }
  return gate(t);
}

function pairCell(name, fn) {
  test(name, async (t) => {
    if (pairGate(t)) return;
    pairExecuted += 1;
    await fn(t);
  });
}

// TWO CALL SHAPES, and the difference is the point. The HUMAN lane carries its firm in the
// session (clara.jwt_firm()), so `p_firm` is an optional belt there. The MACHINE lane carries no
// claims at all, so `p_firm` is REQUIRED of it and verified against the plan's own firm —
// otherwise the only thing deciding which tenant a promotion writes into is a plan id.
const PROMOTE = `select clara.promote_plan_answers_to_knowledge(
  p_plan => $1, p_op_key => $2, p_promote_firm_scope => $3) as r`;
const PROMOTE_BOUND = `select clara.promote_plan_answers_to_knowledge(
  p_plan => $1, p_op_key => $2, p_promote_firm_scope => $3, p_firm => $4) as r`;

const promoteAsHuman = (sub, plan, { opKey = opk("kn_pr"), firmScope = false, firm } = {}) =>
  (firm === undefined
    ? humanQuery(sub, PROMOTE, [plan, opKey, firmScope])
    : humanQuery(sub, PROMOTE_BOUND, [plan, opKey, firmScope, firm])).then((r) => r.rows[0].r);
const promoteAsRuntime = (plan, { opKey = opk("kn_pr"), firmScope = false, firm } = {}) =>
  (firm === undefined
    ? roleQuery(ROLES.runtime, PROMOTE, [plan, opKey, firmScope])
    : roleQuery(ROLES.runtime, PROMOTE_BOUND, [plan, opKey, firmScope, firm])).then((r) => r.rows[0].r);
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
  fye_day: "financial_year_end_day", // #898 -- v4/v5 CLIENT interview only, mapped by 0240
  currency: "default_currency",
  sst_regime: "sst_regime",
  mpers_eligibility: "mpers_eligibility",
  framework: "reporting_framework",
  accounting_basis: "accounting_basis",
  coa_seed_decision: "coa_seed_decision",
};

// #898: `fye_day` is a v4/v5-only interview item (D7's FYE_DAY_SEGMENT_V4) -- `v2ClientAnswers`
// below answers the v2 inventory alone and never names it, so a promotion of a v2 plan promotes
// EXPECTED_MAP minus that one row. The two constants diverge on purpose; kp.01 below still reads
// the FULL map (all eleven rows, whatever interview version answers them).
const EXPECTED_MAP_V2 = Object.fromEntries(
  Object.entries(EXPECTED_MAP).filter(([itemKey]) => itemKey !== "fye_day"));

cell("kp.01 the map is exactly the eleven item keys the live interview produces, each naming a real knowledge key", async () => {
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
  assert.equal(before_.knowledge_version, "0", "the watermark is emitted as text, never a lossy JSON number");
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
    Object.fromEntries(r.promoted.map((p) => [p.item_key, p.knowledge_key])), EXPECTED_MAP_V2);
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
  const runtimeFirm = await assertRaises("CLR04",
    () => promoteAsRuntime(firmPlan, { firmScope: true, firm: w.firm }),
    "the runtime lane promoting a firm default");
  assert.equal(reasonOf(runtimeFirm), "firm_scope_requires_admin");

  const ok = await promoteAsHuman(w.admin, firmPlan, { firmScope: true });
  assert.equal(ok.scope_kind, "firm");
  assert.equal(ok.client_id, null);
  // #654 (0220): THE FIRM-SCOPE ELIGIBILITY WALL NOW REACHES THIS DOOR, and that is the intended
  // consequence of owner ruling D8 rather than a regression. `currency` maps to
  // `default_currency`, one of the three keys a firm may default; `fye` maps to
  // `financial_year_end_month`, a CLIENT-IDENTITY fact ("this business closes in December") that a
  // firm may not hold on every client's behalf. The promotion door catches a per-item CLR10 and
  // WITHHOLDS the item by name rather than aborting the whole act (0192:1711-1717), so one answer
  // is promoted and one is withheld, carrying the wall's own reason verbatim in its detail.
  assert.equal(ok.promoted.length, 1, `expected one promoted item, got ${JSON.stringify(ok.promoted)}`);
  assert.equal(ok.promoted[0].knowledge_key, "default_currency");
  assert.equal(ok.withheld.length, 1, `expected one withheld item, got ${JSON.stringify(ok.withheld)}`);
  assert.equal(ok.withheld[0].knowledge_key, "financial_year_end_month");
  assert.equal(ok.withheld[0].reason, "refused");
  assert.equal(ok.withheld[0].sqlstate, "CLR10");
  assert.match(String(ok.withheld[0].detail), /knowledge_scope_not_firm_defaultable/,
    "the withheld item must carry the eligibility wall's own reason, not a generic refusal");
  const rows = await rootQuery(
    "select scope_kind, client_id, knowledge_key from clara.knowledge_records where firm_id=$1 order by knowledge_key",
    [w.firm]);
  assert.equal(rows.rows.every((r) => r.scope_kind === "firm" && r.client_id === null), true);
  assert.deepEqual(rows.rows.map((r) => r.knowledge_key), ["default_currency"],
    "the refused key must not have landed at firm scope");
});

cell("kp.09 the RUNTIME lane promotes a committed client plan with no JWT, recorded as clara_runtime", async () => {
  const w = await knowledgeWorld("p9");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: { turnover: { value: "RM5M-25M", answeredBy: w.bookkeeper },
               msic: { value: "47211", answeredBy: w.bookkeeper } } });
  const r = await promoteAsRuntime(plan, { firm: w.firm });
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
    `select clara.get_knowledge_pack(p_client => $1, p_purpose => $2, p_firm => $3) as r`,
    [w.clientA, "wiki_coding", w.firm]).then((r) => r.rows[0].r);
  assert.equal(pack.status, "ok");
  assert.equal(pack.records.length, 10);
  assert.equal(Number(pack.knowledge_version), Number(register.knowledge_version),
    "the human register and the runtime pack must agree on the version they read");
});

// =============================================================================================
// REVIEW ROUND — B1: the promotion lane is picked from the CALLER, not from an absent claim.
// =============================================================================================

cell("kp.11 a claims-less or malformed-claims clara_authenticated session CANNOT reach the machine lane", async () => {
  const w = await knowledgeWorld("p11");
  const other = await knowledgeWorld("p11b");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: { msic: { value: "47211", answeredBy: w.admin },
               turnover: { value: "RM1M-5M", answeredBy: w.admin } } });

  // THE HOLE, EXACTLY. clara.jwt_sub() answers NULL for absent claims, unparseable claims and a
  // non-uuid `sub` (0002:339-352). The first cut read that null as "therefore the runtime" and the
  // machine arm had no firm check at all -- so any session on clara_authenticated whose claims were
  // missing or malformed could promote ANY firm's committed plan. 0042:396-418 closed the same
  // class; the fix here is 0042's own role witness.
  const noClaims = await assertRaises("CLR03",
    () => roleQuery(ROLES.authenticated, PROMOTE, [plan, opk("kn_pr"), false]),
    "promotion from clara_authenticated with NO claims");
  assert.equal(reasonOf(noClaims), "no_promotion_context");

  const badSub = await assertRaises("CLR03",
    () => humanQuery("not-a-uuid", PROMOTE, [plan, opk("kn_pr"), false]),
    "promotion with a non-uuid sub (clara.jwt_sub() answers null)");
  assert.equal(reasonOf(badSub), "no_promotion_context");

  // …and NOTHING landed on either attempt.
  const none = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where client_id = $1", [w.clientA]);
  assert.equal(none.rows[0].n, 0, "a refused promotion must leave no record behind");

  // The HUMAN lane still refuses another firm's plan with the no-existence-oracle refusal…
  await assertRaises("CLR11", () => promoteAsHuman(other.admin, plan),
    "a human admin of ANOTHER firm promoting this plan");
  // …a below-floor human of the RIGHT firm is still CLR04…
  await assertRaises("CLR04", () => promoteAsHuman(w.bookkeeper, plan),
    "a bookkeeper of the right firm");
  // …and the runtime role witness still works, which is the half that makes this a gate and not a
  // wall: the same plan promotes cleanly for clara_runtime.
  const ok = await promoteAsRuntime(plan, { firm: w.firm });
  assert.equal(ok.promoted.length, 2, JSON.stringify(ok));
});

// =============================================================================================
// REVIEW ROUND — B1, THE OTHER HALF: the machine lane needs an EXPLICIT, VERIFIED firm binding.
//
// Refusing a claims-less human-shaped call (kp.11) closes only one side of the hole. The other
// side is that the machine arm, once entered, decided WHICH TENANT IT WROTE INTO from the plan id
// alone: `select * into p from clara.onboarding_plans where id = p_plan` inside a clara_fn_owner
// definer sees every firm's plans, so a mis-addressed or attacker-chosen id promoted into
// whichever firm owned it, with nothing in the call saying which firm the caller meant.
//
// clara.capture_knowledge_for is the shape this follows: the runtime lane NAMES the subject it
// means and the door verifies it. So the promotion door takes `p_firm`, REQUIRES it of the
// machine lane, and refuses (CLR11, the no-existence-oracle refusal) when it is not the plan's own
// firm. The human lane keeps deriving its firm from the session and treats a supplied `p_firm` as
// a belt that must agree.
// =============================================================================================

cell("kp.12 the MACHINE lane cannot promote without an explicit firm binding, and a wrong one is CLR11", async () => {
  const w = await knowledgeWorld("p12");
  const other = await knowledgeWorld("p12b");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: { msic: { value: "47211", answeredBy: w.admin },
               turnover: { value: "RM1M-5M", answeredBy: w.admin } } });

  // THE HOLE, REPRODUCED. Before the fix this call SUCCEEDED: the runtime lane promoted a plan it
  // named nothing about, into whichever firm happened to own it.
  const unbound = await assertRaises("CLR10", () => promoteAsRuntime(plan),
    "the runtime lane promoting with no firm binding at all");
  assert.equal(reasonOf(unbound), "promotion_firm_required");

  // A BINDING THAT IS NOT THE PLAN'S FIRM is the no-existence-oracle refusal: absent and foreign
  // answer alike, so the call cannot be used to discover that a plan id exists elsewhere.
  await assertRaises("CLR11", () => promoteAsRuntime(plan, { firm: other.firm }),
    "the runtime lane naming another firm");

  // …and neither attempt wrote anything, in EITHER firm.
  const none = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where firm_id in ($1,$2)",
    [w.firm, other.firm]);
  assert.equal(none.rows[0].n, 0, "a refused promotion must leave no record behind");

  // THE HUMAN LANE keeps its session firm and treats p_firm as a belt that must agree.
  await assertRaises("CLR11", () => promoteAsHuman(w.admin, plan, { firm: other.firm }),
    "an admin naming a firm that is not their own");

  // The gate is a gate, not a wall: the correct binding promotes, and the human belt agrees.
  const ok = await promoteAsRuntime(plan, { firm: w.firm });
  assert.equal(ok.promoted.length, 2, JSON.stringify(ok));
  const replay = await promoteAsHuman(w.admin, plan, { firm: w.firm });
  assert.equal(replay.skipped.length, 2, JSON.stringify(replay));
});

// =============================================================================================
// REVIEW ROUND 2 — SHOULD-1: NO EXISTENCE ORACLE BELOW THE FLOOR.
//
// Closing the tenancy hole left one seam open. The door fetched the plan — `select … for update`
// — BEFORE it discriminated the lane and BEFORE it applied the admin floor, so a caller who
// could never promote anything still learned something from the refusal it got: a REAL plan id
// belonging to another firm answered CLR04 (the floor), while a random uuid answered CLR11 (not
// found). That is an existence oracle for a guessed id, and it also took a ROW LOCK on another
// firm's plan on the way to refusing.
//
// 0021's rule is that absent and foreign answer alike. The same reasoning applies one level up:
// a refusal must not depend on whether the object exists when the caller was never admitted to
// ask. The fix is a reorder — lane and floor first, then a plan lookup SCOPED to the firm the
// caller has already proved — so both arms answer with one SQLSTATE and one sentence.
// =============================================================================================

cell("kp.13 a BELOW-FLOOR caller learns nothing: a real foreign plan and a random uuid answer identically", async () => {
  const w = await knowledgeWorld("p13");
  const other = await knowledgeWorld("p13b");
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: { msic: { value: "47211", answeredBy: w.admin },
               turnover: { value: "RM1M-5M", answeredBy: w.admin } } });

  // THE ORACLE, REPRODUCED. Firm B's bookkeeper cannot promote anything anywhere; what the two
  // calls must not do is tell it apart.
  const real = await assertRaises("CLR04", () => promoteAsHuman(other.bookkeeper, plan),
    "a foreign bookkeeper naming a REAL plan of another firm");
  const absent = await assertRaises("CLR04", () => promoteAsHuman(other.bookkeeper, randomUUID()),
    "the same caller naming a plan id that exists nowhere");
  assert.equal(real.code, absent.code, "the two arms must answer with the SAME SQLSTATE");
  assert.equal(real.message, absent.message, "…and the same sentence");
  assert.equal(reasonOf(real), reasonOf(absent), "…and the same reason");

  // The ADMIN arms were already clean and stay clean: absent and foreign are both CLR11.
  const adminReal = await assertRaises("CLR11", () => promoteAsHuman(other.admin, plan),
    "a foreign ADMIN naming a real plan of another firm");
  const adminAbsent = await assertRaises("CLR11", () => promoteAsHuman(other.admin, randomUUID()),
    "a foreign admin naming a plan id that exists nowhere");
  assert.equal(adminReal.message, adminAbsent.message);

  // The MACHINE lane answers alike too, once it has named its firm (a firm it owns, a plan it
  // does not): the plan is looked up INSIDE that firm, so an id from elsewhere is simply absent.
  const machineForeign = await assertRaises("CLR11",
    () => promoteAsRuntime(plan, { firm: other.firm }),
    "the runtime naming its own firm and another firm's plan");
  const machineAbsent = await assertRaises("CLR11",
    () => promoteAsRuntime(randomUUID(), { firm: other.firm }),
    "the runtime naming its own firm and a plan id that exists nowhere");
  assert.equal(machineForeign.message, machineAbsent.message);

  // kp.11's claim survives the reorder: a below-floor human of the RIGHT firm is still CLR04…
  await assertRaises("CLR04", () => promoteAsHuman(w.bookkeeper, plan),
    "a bookkeeper of the plan's own firm");
  // …and nothing landed, in either firm.
  const none = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where firm_id in ($1,$2)",
    [w.firm, other.firm]);
  assert.equal(none.rows[0].n, 0, "a refused promotion must leave no record behind");

  // The gate is still a gate: the plan's own admin promotes it.
  const ok = await promoteAsHuman(w.admin, plan);
  assert.equal(ok.promoted.length, 2, JSON.stringify(ok));
});
// =============================================================================================
// kp.14 — #1031's OWN FIX ROUND (0317, review finding L06-SPEC-08). #1031's brief asked for this
// door's behaviour to be UNCHANGED. 0310's pair rule raises CLR37 (the client-row door's own
// typed reason), which was not among the two sqlstates this door's per-item `exception` arm
// caught, so ONE impossible pair on a committed plan raised straight out of the promotion loop
// and NOTHING was promoted -- entity_type, which has nothing to do with the year end, included.
// 0317 adds CLR37 to that arm, so the offending key alone is withheld, which IS this door's
// documented per-item behaviour.
// =============================================================================================

pairCell("kp.14 an IMPOSSIBLE year-end pair on a committed plan withholds that one key and promotes the rest, instead of aborting the whole promotion", async () => {
  const w = await knowledgeWorld("p14");
  // February plus the 31st: the pair clara.set_client_fy_end refuses on the client row, beside two
  // keys that have nothing to do with it. `promote_plan_answers_to_knowledge` walks its items in
  // item_key order (entity_type, fye, fye_day), so the month lands and the day is judged against it.
  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: {
      entity_type: { value: "sdn_bhd", answeredBy: w.admin },
      fye: { value: 2, answeredBy: w.admin },
      fye_day: { value: 31, answeredBy: w.admin },
    } });

  const receipt = await promoteAsHuman(w.admin, plan);

  // THE OTHER TWO KEYS SURVIVED. Before 0317 this receipt did not exist at all -- the call raised.
  assert.deepEqual(
    receipt.promoted.map((x) => x.knowledge_key).sort(),
    ["entity_type", "financial_year_end_month"],
    `the promotion lost a key that has nothing to do with the year-end pair: ${JSON.stringify(receipt)}`);

  // THE OFFENDING KEY ALONE IS WITHHELD, with the door's own per-item shape: the item key, the
  // knowledge key, `refused`, and the sqlstate and detail the rule raised.
  assert.equal(receipt.withheld.length, 1, JSON.stringify(receipt.withheld));
  const [withheld] = receipt.withheld;
  assert.equal(withheld.item_key, "fye_day");
  assert.equal(withheld.knowledge_key, "financial_year_end_day");
  assert.equal(withheld.reason, "refused");
  assert.equal(withheld.sqlstate, "CLR37");
  const detail = JSON.parse(withheld.detail);
  assert.equal(detail.reason, "fa_particulars_invalid");
  assert.equal(detail.axis, "fy_end");
  assert.equal(detail.month, 2, "the withheld detail names the month the day was judged against");
  assert.equal(detail.day, 31);

  // …AND THE DAY NEVER LANDED, so Knowledge still holds no pair the client row would refuse.
  const live_ = await listKnowledge(w.admin, w.clientA);
  assert.deepEqual(
    live_.records.map((r) => r.knowledge_key).sort(),
    ["entity_type", "financial_year_end_month"],
    "the refused day must not be live in Knowledge");
});
