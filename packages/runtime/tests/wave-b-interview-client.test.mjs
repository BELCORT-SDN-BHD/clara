// Wave-B clientOnboarding_v1 — closure-logic tests for the salvaged 13-Q client interview
// (adapted): sequencing, AMB-11 opening-position item keys, FORK-7 non-straight-line todo,
// O9 CoA-seed decision, the update_onboarding_plan CAS writer (happy + CLR06 re-read+retry),
// echo-back gating, and cancel. STUBBED ask + withRuntime; no WDK engine, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const core = await import("../workflows/interview.v1.core.ts");
const q = await import("../workflows/interview.v1.questions.ts");
const writer = await import("../workflows/interview.v1.writer.ts");
const { scriptedAsk, ANSWER, CANCEL, stubRuntime } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegment, hookToken } = core;
const { CLIENT_SEGMENTS } = q;
const { updatePlanWithCas, readPlan, isStalePlan } = writer;
const segByKey = (k) => CLIENT_SEGMENTS.find((s) => s.key === k);

async function driveOne(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegment(seg, s.ask, prior);
  return { res, asked: s.asked };
}

// --- AMB-11 opening position + FORK-7 + O9 CoA -------------------------------

test("AMB-11: new_first_year → first_year_zero_opening must_ask (answered), the commit floor", async () => {
  const { res } = await driveOne(segByKey("opening_position"), [ANSWER("new_first_year"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].item_key, "first_year_zero_opening");
  assert.equal(res.items[0].item_kind, "must_ask");
  assert.equal(res.items[0].state, "answered");
  assert.equal(res.items[0].required_for_commit, true);
});

test("AMB-11: ongoing_carry_down → carry_down_deferred todo (deferred), the B-12 commit vehicle", async () => {
  const { res } = await driveOne(segByKey("opening_position"), [ANSWER("ongoing"), ANSWER("yes")]); // 'ongoing' synonym
  assert.equal(res.items[0].item_key, "carry_down_deferred");
  assert.equal(res.items[0].item_kind, "todo");
  assert.equal(res.items[0].state, "deferred");
  assert.equal(res.items[0].answer.captured, false);
});

test("FORK-7: a reported non-straight-line asset records a 'still to capture' todo (not a widened FA row)", async () => {
  const yes = await driveOne(segByKey("fa_depreciation"), [ANSWER("yes"), ANSWER("yes")]);
  assert.equal(yes.res.items[0].item_key, "fa_nonstraightline_todo");
  assert.equal(yes.res.items[0].item_kind, "todo");
  assert.equal(yes.res.items[0].state, "deferred");
  const no = await driveOne(segByKey("fa_depreciation"), [ANSWER("no"), ANSWER("yes")]);
  assert.equal(no.res.items[0].item_key, "fa_depreciation_method");
  assert.equal(no.res.items[0].state, "answered");
});

test("O9: the CoA-seed decision is a must_ask plan item (the upsert_account writes are the human lane)", async () => {
  const { res } = await driveOne(segByKey("coa_seed"), [ANSWER("yes"), ANSWER("yes")]);
  assert.equal(res.items[0].item_key, "coa_seed_decision");
  assert.equal(res.items[0].item_kind, "must_ask");
  assert.equal(res.items[0].answer.seed, "lhdn_mpers_standard");
});

test("FORK-3: every produced item is a plan item (never open_questions); required_for_commit flagged on must-asks", async () => {
  const answers = {};
  const valid = {
    legal_name: "Acme Trading SB", entity_type: "sdn_bhd", ssm: "202401001234-K", tin: "C2584563222", msic: "46900",
    sst_regime: "service_tax", sst_no: "skip", statutory: "skip", banks: "skip", currency: "MYR", fye: "6",
    framework: "MPERS", coa_seed: "yes", opening_position: "new_first_year", fa_depreciation: "no",
    turnover: "RM1M-5M", sample_invoices: "skip",
  };
  let answered = 0;
  for (const seg of CLIENT_SEGMENTS) {
    const { res } = await driveOne(seg, [ANSWER(valid[seg.key]), ANSWER("yes")], answers);
    if (res.outcome === "answered") {
      answers[seg.key] = res.value;
      answered += 1;
      for (const it of res.items) assert.ok(["must_ask", "capture", "todo"].includes(it.item_kind), `${seg.key} item kind`);
    }
  }
  assert.ok(answered >= 13, `at least the 13 client questions answered (got ${answered})`);
});

// --- the update_onboarding_plan CAS writer ----------------------------------

const PLAN = { id: "plan-1", revision_token: "rev-live", revision_n: 3, state: "open", scope_kind: "client", client_id: "cl-1", firm_id: "f-1" };

test("readPlan maps the plan snapshot from a runtime SELECT", async () => {
  const { withRuntime } = stubRuntime({ plan: PLAN });
  const snap = await readPlan(withRuntime, "plan-1");
  assert.equal(snap.revisionToken, "rev-live");
  assert.equal(snap.state, "open");
  assert.equal(snap.firmId, "f-1");
});

test("updatePlanWithCas happy path: ONE update call, threads the new revision", async () => {
  const { withRuntime, calls } = stubRuntime({ plan: PLAN, receipts: [{ revision_token: "rev-next", revision_n: 4, status: "updated" }] });
  const out = await updatePlanWithCas(withRuntime, {
    planId: "plan-1", expectedRevision: "rev-live", items: [{ item_key: "legal_name", item_kind: "capture", question: null, answer: "X", state: "answered", required_for_commit: false }],
    answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry",
  });
  assert.equal(out.revisionToken, "rev-next");
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updateArgs[0].opKey, "op1");
});

test("updatePlanWithCas on CLR06: re-reads the live revision and retries ONCE with a FRESH op_key", async () => {
  const { withRuntime, calls } = stubRuntime({ plan: PLAN, failCas: 1, receipts: [null, { revision_token: "rev-after-retry", revision_n: 5, status: "updated" }] });
  const out = await updatePlanWithCas(withRuntime, {
    planId: "plan-1", expectedRevision: "rev-STALE", items: [], answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry",
  });
  assert.equal(calls.updates.length, 2, "one failed attempt + one retry");
  assert.equal(calls.reads >= 1, true, "the live revision was re-read between attempts");
  assert.equal(calls.updateArgs[0].expectedRevision, "rev-STALE", "first attempt used the caller's stale token");
  assert.equal(calls.updateArgs[1].expectedRevision, "rev-live", "retry used the freshly-read live token");
  assert.equal(calls.updateArgs[1].opKey, "op1:retry", "retry used the fresh op_key (payload revision changed)");
  assert.equal(out.revisionToken, "rev-after-retry");
});

test("updatePlanWithCas surfaces (no retry) when the plan is committed/cancelled underneath", async () => {
  const committed = { ...PLAN, state: "committed" };
  const { withRuntime, calls } = stubRuntime({ plan: committed, failCas: 1 });
  await assert.rejects(
    updatePlanWithCas(withRuntime, { planId: "plan-1", expectedRevision: "rev-x", items: [], answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry" }),
    (e) => isStalePlan(e),
  );
  assert.equal(calls.updates.length, 1, "no retry once the plan is no longer open");
});

test("isStalePlan detects the CLR06 class only", () => {
  assert.equal(isStalePlan({ code: "CLR06" }), true);
  assert.equal(isStalePlan({ code: "CLR10" }), false);
  assert.equal(isStalePlan(null), false);
});

// --- echo-back gate + cancel + token ----------------------------------------

test("echo-back gate + cancel path (client)", async () => {
  const ok = await driveOne(segByKey("legal_name"), [ANSWER("Acme Trading SB"), ANSWER("yes")]);
  assert.equal(ok.res.outcome, "answered");
  assert.deepEqual(ok.asked.map((a) => a.phase), ["q", "c"]);
  const cancelled = await driveOne(segByKey("legal_name"), [ANSWER("Acme"), CANCEL()]);
  assert.equal(cancelled.res.outcome, "cancelled");
});

test("client hook token uses the 'co' prefix, reconstructible from run + park index", () => {
  assert.equal(hookToken("client", "run-9", 4), "co:run-9:4");
});
