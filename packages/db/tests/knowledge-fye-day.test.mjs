// #898 — THE FINANCIAL YEAR-END DAY BESIDE ITS MONTH IN KNOWLEDGE.
// Migration: 0240_financial_year_end_day.sql. Every cell gates on the LIVE CATALOG, never on the
// migration number (knowledge-fixtures.mjs `fyeDayCohortApplied`), the same discipline
// knowledge-onboarding-promotion.test.mjs and knowledge-firm-defaults.test.mjs both state.
//
// WHAT THESE CELLS ARE FOR, one per acceptance criterion of #898's Agent Brief:
//   AC1 — the catalogue carries the day key, typed and floored the SAME WAY the month key is, and
//         a value inside/outside its own range is admitted/refused through the real public door
//         (fd.01, fd.02).
//   AC2 — the map carries one row from the day's interview item (fye_day) to the key (fd.03).
//   AC3 — a firm-scope capture of the key is refused with the month key's typed reason (fd.04).
//   AC4 — a committed onboarding plan with a day answer promotes to a knowledge value equal to
//         the client row's day (fd.05).
// AC5 (from-scratch apply with prestate and tail proof) is the migration's own prestate/tail
// blocks, exercised by the single `pnpm db:migrate` apply this battery is gated on — RIG.md is
// explicit that a lane never re-runs a second from-scratch chain on its own cluster.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertRaises, endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";
import { committedPlan, fyeDayCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 5;
let live = false;
let executed = 0;

before(async () => { live = await fyeDayCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FYE_DAY_0240 === "1") {
    console.warn("SKIP knowledge-fye-day: the 0240 cohort is not applied (explicit pre-integration run).");
    t.skip("fye-day cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0240 fye-day cohort is required for a focused run: apply 0240_financial_year_end_day.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// Door wrapper, the same shape knowledge-firm-defaults.test.mjs's CAPTURE uses so the two
// batteries cannot drift into two dialects.
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p898"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

const setFyEnd = (sub, client, month, day, opKey = opk("p898_fy")) =>
  humanQuery(sub,
    "select clara.set_client_fy_end(p_client => $1, p_month => $2, p_day => $3, p_op_key => $4) as r",
    [client, month, day, opKey]).then((r) => r.rows[0].r);

const promote = (sub, plan, opKey = opk("p898_pr")) =>
  humanQuery(sub,
    "select clara.promote_plan_answers_to_knowledge(p_plan => $1, p_op_key => $2) as r",
    [plan, opKey]).then((r) => r.rows[0].r);

cell("fd.01 the catalogue carries financial_year_end_day, typed/floored the SAME WAY financial_year_end_month is", async () => {
  // `scope_default` was live when this file (0240) was authored and is asserted here no longer:
  // #913 (0241_knowledge_scope_default_drop.sql) dropped the column from clara.knowledge_keys as
  // a dead column (three writes, zero reads -- see that migration's own header). The scope-side
  // half of "typed/scoped/floored the SAME WAY" now lives at knowledge-scope-default-drop.test.mjs
  // (sd.03: the firm-eligibility wall, the mechanism that was ALWAYS the real one, still refuses
  // financial_year_end_month -- and by the same construction, financial_year_end_day -- at firm
  // scope; fd.04 below proves that for the day key specifically).
  const r = await rootQuery(
    `select kind, value_shape, validated_against, allowed_values, authority_bearing, min_role
       from clara.knowledge_keys where knowledge_key = 'financial_year_end_day'`);
  assert.equal(r.rowCount, 1, "financial_year_end_day must exist exactly once");
  const row = r.rows[0];
  assert.equal(row.kind, "assertion");
  assert.equal(row.value_shape, "number");
  assert.equal(row.validated_against, "range:day_1_31");
  assert.equal(row.allowed_values, null);
  assert.equal(row.authority_bearing, false);
  assert.equal(row.min_role, "bookkeeper", "the SAME floor financial_year_end_month carries");
});

cell("fd.02 capture_knowledge validates the day the SAME WAY it validates the month: 1 and 31 admitted, 0 and 32 refused", async () => {
  const w = await knowledgeWorld("fd2");
  const ok31 = await capture(w.bookkeeper, {
    key: "financial_year_end_day", value: 31, client: w.clientA,
    basis: "the client's year-end falls on the last day of the month",
  });
  assert.equal(ok31.status, "captured");
  const w2 = await knowledgeWorld("fd2b");
  const ok1 = await capture(w2.bookkeeper, {
    key: "financial_year_end_day", value: 1, client: w2.clientA,
    basis: "the client's year-end falls on the first day of the month",
  });
  assert.equal(ok1.status, "captured");

  for (const bad of [0, 32, 1.5]) {
    const w3 = await knowledgeWorld(`fd2_bad_${bad}`);
    const err = await assertRaises("CLR10", () => capture(w3.bookkeeper, {
      key: "financial_year_end_day", value: bad, client: w3.clientA,
      basis: "rig probe",
    }), `capture_knowledge(financial_year_end_day, ${bad})`);
    assert.match(err.detail ?? "", /knowledge_value_invalid/,
      `day ${bad} was refused for the wrong reason: ${err.message}`);
  }
});

cell("fd.03 the map carries exactly one row, fye_day -> financial_year_end_day", async () => {
  const r = await rootQuery(
    `select item_key, knowledge_key from clara.knowledge_plan_item_map where item_key = 'fye_day'`);
  assert.equal(r.rowCount, 1, "fye_day must map exactly once");
  assert.equal(r.rows[0].knowledge_key, "financial_year_end_day");
});

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

cell("fd.04 a firm-scope capture of financial_year_end_day is refused with financial_year_end_month's OWN typed reason -- no new code, D8's existing wall", async () => {
  const w = await knowledgeWorld("fd4");
  const dayErr = await assertRaises("CLR10", () => capture(w.owner, {
    key: "financial_year_end_day", scope: "firm", client: null, value: 15,
    basis: "the firm's standing position on financial_year_end_day",
  }), "capture_knowledge(firm, financial_year_end_day)");
  const monthErr = await assertRaises("CLR10", () => capture(w.owner, {
    key: "financial_year_end_month", scope: "firm", client: null, value: 6,
    basis: "the firm's standing position on financial_year_end_month",
  }), "capture_knowledge(firm, financial_year_end_month)");
  assert.equal(reasonOf(dayErr), "knowledge_scope_not_firm_defaultable");
  assert.equal(reasonOf(dayErr), reasonOf(monthErr),
    "the day key must be refused for the EXACT SAME reason the month key already is");
  assert.equal(
    await rootQuery(
      "select count(*)::int as n from clara.knowledge_records where knowledge_key = 'financial_year_end_day' and scope_kind = 'firm'",
    ).then((r) => r.rows[0].n),
    0, "no firm-scope row may have landed");
});

cell("fd.05 a committed onboarding plan's day answer promotes to a knowledge value EQUAL to the client row's own fy_end_day", async () => {
  const w = await knowledgeWorld("fd5");
  const set = await setFyEnd(w.bookkeeper, w.clientA, 6, 20);
  assert.equal(set.fy_end_month, 6);
  assert.equal(set.fy_end_day, 20);

  const plan = await committedPlan({ firm: w.firm, client: w.clientA, committedBy: w.admin,
    answers: {
      fye: { value: 6, answeredBy: w.admin },
      fye_day: { value: 20, answeredBy: w.admin },
    } });
  const r = await promote(w.admin, plan);
  assert.equal(r.skipped.length, 0);
  assert.equal(r.withheld.length, 0, JSON.stringify(r.withheld));
  assert.deepEqual(
    Object.fromEntries(r.promoted.map((p) => [p.item_key, p.knowledge_key])),
    { fye: "financial_year_end_month", fye_day: "financial_year_end_day" });

  const client = await rootQuery(
    "select fy_end_month, fy_end_day from clara.clients where id = $1", [w.clientA]);
  const knowledge = await rootQuery(
    `select knowledge_key, value from clara.knowledge_records
       where client_id = $1 and knowledge_key in ('financial_year_end_month','financial_year_end_day')
       order by knowledge_key`, [w.clientA]);
  const byKey = Object.fromEntries(knowledge.rows.map((row) => [row.knowledge_key, row.value]));
  assert.equal(client.rows[0].fy_end_month, 6);
  assert.equal(client.rows[0].fy_end_day, 20);
  assert.equal(byKey.financial_year_end_month, client.rows[0].fy_end_month,
    "the promoted month must equal the client row's own month");
  assert.equal(byKey.financial_year_end_day, client.rows[0].fy_end_day,
    "the promoted day must equal the client row's own day (AC4)");
});
