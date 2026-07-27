// interview_v2 — the v2 INVENTORIES driven end to end, and the durability discipline the v2
// workflow bodies inherit unchanged from the frozen v1 spine (hook tokens, the plan-write CAS,
// the firm commit-receipt verification). Companion to wave-b-interview-v2.test.mjs (the F2
// option table + driver) and wave-b-interview-v2-registration.test.mjs (F1).
//
// The end-to-end drives are the real regression net for the DB-coupled item keys: commit_client_
// onboarding reads first_year_zero_opening / carry_down_deferred BY NAME, so a v2 that renamed or
// reshaped them would pass every unit assertion and then fail to activate a client.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1core = await import("../workflows/interview.v1.core.ts");
const v1q = await import("../workflows/interview.v1.questions.ts");
const core = await import("../workflows/interview.v2.core.ts");
const fw = await import("../workflows/interview.v2.frameworks.ts");
const q = await import("../workflows/interview.v2.questions.ts");
const writer = await import("../workflows/interview.v1.writer.ts");
const { scriptedAsk, ANSWER, containsSecretShape, stubRuntime } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegmentV2, segmentApplies, questionOf, hookToken } = core;
const { FIRM_SEGMENTS_V2, CLIENT_SEGMENTS_V2, buildFirmPlanItemsV2 } = q;
const { verifyFirmCommitReceipt, updatePlanWithCas } = writer;

const firmSeg = (k) => FIRM_SEGMENTS_V2.find((s) => s.key === k);
const clientSeg = (k) => CLIENT_SEGMENTS_V2.find((s) => s.key === k);

/** Drive one v2 segment with a scripted answer sequence. */
async function drive(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegmentV2(seg, s.ask, prior);
  return { res, asked: s.asked, remaining: s.remaining() };
}
// ===========================================================================
// The inventories, driven end to end.
// ===========================================================================

/** Drive a whole inventory with a per-segment script map, honouring appliesTo. */
async function driveInventory(segments, scripts) {
  const collected = {};
  const asked = [];
  const items = [];
  let answered = 0;
  let skipped = 0;
  let inapplicable = 0;
  for (const seg of segments) {
    if (!segmentApplies(seg, collected)) {
      inapplicable += 1;
      continue;
    }
    const script = scripts[seg.key];
    assert.ok(script, `no script for segment ${seg.key}`);
    const s = scriptedAsk(script);
    const res = await askAndConfirmSegmentV2(seg, s.ask, collected);
    asked.push(...s.asked);
    assert.notEqual(res.outcome, "cancelled", `${seg.key} should not cancel`);
    assert.notEqual(res.outcome, "expired", `${seg.key} should not expire`);
    if (res.outcome === "skipped") {
      skipped += 1;
      continue;
    }
    collected[seg.key] = res.value;
    items.push(...res.items);
    answered += 1;
  }
  return { collected, asked, items, answered, skipped, inapplicable };
}

const OK = (v) => [ANSWER(v), ANSWER("yes")];

test("FIRM v2 drives end to end for a Sdn Bhd — the screen fires, both axes are recorded", async () => {
  const out = await driveInventory(FIRM_SEGMENTS_V2, {
    legal_name: OK("ACME ADVISORY SDN BHD"),
    ssm: OK("202401001234-K"),
    entity_type: OK("Sdn Bhd"),
    address: OK("1 Jalan Ampang, 50450 Kuala Lumpur"),
    mia: OK("skip"),
    bookkeeper_email: OK("bk@acme.my"),
    turnover: OK("RM1M-5M"),
    tin: OK("C2584563222"),
    fye: OK("12"),
    currency: OK("MYR"),
    mpers_eligibility: OK("no"),
    framework: [ANSWER("MPERS"), ANSWER("2025"), ANSWER("yes")],
    accounting_basis: OK("accrual"),
  });
  assert.equal(out.inapplicable, 0, "a Sdn Bhd is asked every segment");
  assert.equal(out.skipped, 1, "MIA skipped");
  assert.equal(out.answered, 12);
  assert.equal(out.collected.entity_type, "sdn_bhd");
  assert.equal(out.collected.ssm.normalized, "202401001234k");
  assert.equal(out.collected.mpers_eligibility.determination, "eligible");
  assert.equal(out.collected.framework.framework_code, "MPERS");
  assert.equal(out.collected.framework.framework_version, "MPERS_2025");
  assert.equal(out.collected.framework.mpers_eligibility, "eligible", "the determination rides on the framework record");
  assert.equal(out.collected.accounting_basis.accounting_basis, "ACCRUAL");
});

test("FIRM v2 drives end to end for a SOLE PROP — v1's blocking pair now passes", async () => {
  const out = await driveInventory(FIRM_SEGMENTS_V2, {
    legal_name: OK("TAO BOOKKEEPING ENTERPRISE"),
    ssm: OK("SA1234567-X"), //  v1 refuses this outright — the interview could not be finished
    entity_type: OK("Sole Proprietor"),
    address: OK("22 Jalan SS2/24, 47300 Petaling Jaya"),
    mia: OK("skip"),
    bookkeeper_email: OK("bk@tao.my"),
    turnover: OK("<RM1M"),
    tin: OK("skip"),
    fye: OK("12"),
    currency: OK("MYR"),
    framework: OK("special purpose"),
    accounting_basis: OK("accrual"),
  });
  assert.equal(out.inapplicable, 1, "the Sdn Bhd-only private-entity screen was not asked");
  assert.equal(out.collected.mpers_eligibility, undefined);
  assert.equal(out.collected.ssm.form, "state_prefixed_business");
  assert.equal(out.collected.tin, null, "the <RM1M TIN exemption still fires — v1 behaviour preserved");
  assert.equal(out.collected.framework.framework_code, "SPECIAL_PURPOSE_TAX_MANAGEMENT");

  const items = buildFirmPlanItemsV2(out.collected);
  const keys = items.map((i) => i.item_key);
  assert.ok(keys.includes("ssm") && keys.includes("framework") && keys.includes("accounting_basis"));
  assert.ok(!keys.includes("mpers_eligibility"), "an unasked segment leaves no unanswered item behind");
  assert.ok(keys.includes("first_client_onboarding"), "the O7 first-client intent todo");
  const todo = items.find((i) => i.item_key === "first_client_onboarding");
  assert.equal(todo.state, "deferred");
  for (const it of items) assert.ok(["must_ask", "capture", "todo"].includes(it.item_kind), it.item_key);
});

test("CLIENT v2 drives end to end and preserves every DB-coupled item key", async () => {
  const out = await driveInventory(CLIENT_SEGMENTS_V2, {
    legal_name: OK("Acme Trading PLT"),
    entity_type: OK("PLT"),
    ssm: OK("202401047756 (1593602-X)"),
    turnover: OK("RM1M-5M"),
    tin: OK("C2584563222"),
    msic: OK("46900"),
    sst_regime: OK("service_tax"),
    sst_no: OK("skip"),
    statutory: OK("skip"),
    banks: OK("skip"),
    currency: OK("MYR"),
    fye: OK("6"),
    framework: OK("special purpose"),
    accounting_basis: OK("accrual"),
    coa_seed: OK("yes"),
    opening_position: OK("ongoing"),
    fa_depreciation: OK("no"),
    sample_invoices: OK("skip"),
  });
  assert.equal(out.inapplicable, 1, "an LLP is not asked the private-entity screen");
  const keys = out.items.map((i) => i.item_key);
  // AMB-11 + FORK-7 + O9: these keys are read BY NAME inside commit_client_onboarding.
  assert.ok(keys.includes("carry_down_deferred"), "AMB-11 commit vehicle preserved");
  assert.ok(keys.includes("fa_depreciation_method"), "FORK-7 shape preserved");
  assert.ok(keys.includes("coa_seed_decision"), "O9 decision preserved");
  const carry = out.items.find((i) => i.item_key === "carry_down_deferred");
  assert.equal(carry.item_kind, "todo");
  assert.equal(carry.state, "deferred");
  assert.equal(carry.answer.captured, false);
});

test("AMB-11: new_first_year still produces the first_year_zero_opening must_ask (byte-compatible with v1)", async () => {
  const v2 = await drive(clientSeg("opening_position"), [ANSWER("new_first_year"), ANSWER("yes")]);
  const v1 = await (async () => {
    const s = scriptedAsk([ANSWER("new_first_year"), ANSWER("yes")]);
    return v1core.askAndConfirmSegment(v1q.CLIENT_SEGMENTS.find((x) => x.key === "opening_position"), s.ask, {});
  })();
  assert.deepEqual(v2.res.items, v1.items, "the opening-position items are identical to v1's — the DB reads them by name");
});

test("segment ORDER law: entity_type precedes the screen, the framework and the basis; turnover precedes tin", () => {
  for (const [name, segs] of [["firm", FIRM_SEGMENTS_V2], ["client", CLIENT_SEGMENTS_V2]]) {
    const at = (k) => segs.findIndex((s) => s.key === k);
    assert.ok(at("entity_type") >= 0 && at("entity_type") < at("mpers_eligibility"), `${name}: the screen needs entity_type`);
    assert.ok(at("entity_type") < at("framework"), `${name}: the framework question is entity-aware`);
    assert.ok(at("mpers_eligibility") < at("framework"), `${name}: the determination must precede the framework`);
    assert.ok(at("framework") < at("accounting_basis"), `${name}: framework then basis`);
    assert.ok(at("turnover") >= 0 && at("turnover") < at("tin"), `${name}: adjudication 7 — the <RM1M exemption must be reachable`);
  }
});

test("P19: no secret-shaped key appears in any v2 question, echo or plan item", async () => {
  for (const segs of [FIRM_SEGMENTS_V2, CLIENT_SEGMENTS_V2]) {
    for (const seg of segs) {
      for (const entity of fw.ENTITY_TYPES_V2) {
        assert.equal(containsSecretShape({ q: questionOf(seg, { entity_type: entity }) }), false, seg.key);
      }
    }
  }
  const { res } = await drive(firmSeg("framework"), [ANSWER("other"), ANSWER("a lender's covenant"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(containsSecretShape(res.items), false);
  assert.equal(containsSecretShape(buildFirmPlanItemsV2({ legal_name: "ACME", framework: res.value })), false);
});

// ===========================================================================
// Durability discipline — the v2 workflows reuse the v1 durable spine unchanged, so the same
// properties are asserted here against the same modules the v2 bodies import.
// ===========================================================================

test("durability: the hook token is deterministic per run + park index (route-reconstructible after a kill)", () => {
  assert.equal(hookToken("firm", "run-abc", 0), "fi:run-abc:0");
  assert.equal(hookToken("client", "run-9", 4), "co:run-9:4");
  assert.equal(hookToken("firm", "run-abc", 7), hookToken("firm", "run-abc", 7), "stable across replay");
  assert.equal(hookToken, v1core.hookToken, "v2 resumes through the SAME token format — a v1-era park is addressable by the v2 route");
});

test("durability: park indices are monotonic across a whole v2 drive, and every one maps to a distinct token", async () => {
  const out = await driveInventory(FIRM_SEGMENTS_V2, {
    legal_name: OK("ACME"), ssm: OK("1475415-P"), entity_type: OK("sole_prop"), address: OK("1 Jalan"),
    mia: OK("skip"), bookkeeper_email: OK("bk@acme.my"), turnover: OK("<RM1M"), tin: OK("skip"),
    fye: OK("12"), currency: OK("MYR"), framework: OK("tax basis"), accounting_basis: OK("accrual"),
  });
  const tokens = out.asked.map((_, i) => hookToken("firm", "run-x", i));
  assert.equal(new Set(tokens).size, tokens.length, "no two parks of a run share a hook token");
  assert.ok(out.asked.length >= 22, `a full firm drive parks at least twice per answered segment (got ${out.asked.length})`);
});

test("durability: the CAS writer the v2 bodies import still refuses to overwrite a concurrently-edited key (F6)", async () => {
  const PLAN = { id: "plan-1", revision_token: "rev-live", revision_n: 3, state: "open", scope_kind: "client", client_id: "cl-1", firm_id: "f-1" };
  const foreignSameKey = [{ item_key: "framework", state: "answered", answer: { framework_code: "MFRS" }, answered_by: "dash-1" }];
  const { withRuntime, calls } = stubRuntime({ plan: PLAN, items: foreignSameKey, failCas: 1 });
  const out = await updatePlanWithCas(withRuntime, {
    planId: "plan-1", expectedRevision: "rev-STALE",
    items: [{ item_key: "framework", item_kind: "must_ask", question: null, answer: { framework_code: "MPERS" }, state: "answered", required_for_commit: true }],
    answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry", knownItems: { framework: null },
  });
  assert.equal(out.status, "stale_conflict");
  assert.deepEqual(out.conflictingKeys, ["framework"]);
  assert.equal(calls.updates.length, 1, "no last-writer-wins retry");
});

test("durability: the firm commit receipt is still verified against live state before any write (F2)", async () => {
  const FIRM_ID = "f1111111-1111-4111-8111-111111111111";
  const PLAN_ID = "d1111111-1111-4111-8111-111111111111";
  const OWNER = "50000000-0000-4000-8000-000000000001";
  const firmPlan = { id: PLAN_ID, scope_kind: "firm", state: "open", firm_id: FIRM_ID };
  const ok = stubRuntime({ plan: firmPlan, principal: { firm_id: FIRM_ID, role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(ok.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), true);
  const foreign = stubRuntime({ plan: firmPlan, principal: { firm_id: "f2222222-2222-4222-8222-222222222222", role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(foreign.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false);
});

// ===========================================================================
// v1 REGRESSION — the frozen v1 inventories still behave exactly as their own battery asserts.
// ===========================================================================

test("v1 regression: the frozen v1 inventories and validators are untouched by this change", async () => {
  assert.equal(v1q.FIRM_SEGMENTS.length, 11, "v1 still asks its 11 questions");
  assert.equal(v1q.CLIENT_SEGMENTS.length, 17);
  assert.deepEqual([...v1q.FRAMEWORKS], ["MPERS", "MFRS"], "v1's two-option framework list is preserved for parked runs");
  assert.deepEqual([...v1q.ENTITY_TYPES], ["sdn_bhd", "sole_prop", "partnership", "llp", "other"]);
  const s = scriptedAsk([ANSWER("MPERS"), ANSWER("yes")]);
  const res = await v1core.askAndConfirmSegment(v1q.FIRM_SEGMENTS.find((x) => x.key === "framework"), s.ask, {});
  assert.equal(res.value, "MPERS", "a v1 framework answer is still a bare string — its parked runs are unaffected");
  assert.deepEqual(s.asked.map((a) => a.phase), ["q", "c"], "v1 opens no follow-up or warning park");
});
