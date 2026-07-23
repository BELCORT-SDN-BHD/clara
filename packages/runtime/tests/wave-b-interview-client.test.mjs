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

const { askAndConfirmSegment, hookToken, interviewRunBinding } = core;
const { CLIENT_SEGMENTS } = q;
const { updatePlanWithCas, readPlan, isStalePlan, itemFingerprint, computeConflictingKeys, fingerprintMap } = writer;
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

// --- adjudication 7: the turnover-gated TIN exemption must be REACHABLE -------

test("segment order law: turnover precedes tin, so the <RM1M exemption can fire (native-review HIGH-1)", () => {
  const ti = CLIENT_SEGMENTS.findIndex((s) => s.key === "turnover");
  const ni = CLIENT_SEGMENTS.findIndex((s) => s.key === "tin");
  assert.ok(ti >= 0 && ni >= 0 && ti < ni, `turnover (${ti}) must precede tin (${ni})`);
});

test("a <RM1M client skips TIN to null; a >=RM1M client cannot skip it", async () => {
  // Drive in segment order exactly as the workflow does: turnover first, then tin.
  const prior = {};
  const t = await driveOne(segByKey("turnover"), [ANSWER("<RM1M"), ANSWER("yes")], prior);
  assert.equal(t.res.outcome, "answered");
  prior["turnover"] = t.res.value;
  const exempt = await driveOne(segByKey("tin"), [ANSWER("skip"), ANSWER("yes")], prior);
  assert.equal(exempt.res.outcome, "answered");
  assert.equal(exempt.res.value, null, "the exemption returns a null TIN");
  // The gate itself: with a higher band, 'skip' is refused by the validator.
  const gated = segByKey("tin").validate("skip", { turnover: "RM1M-5M" });
  assert.equal(gated.ok, false, "skip is refused when turnover >= RM1M");
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

test("updatePlanWithCas on CLR06 from an UNRELATED-item bump: re-reads the live revision and retries ONCE with a FRESH op_key (F6-safe)", async () => {
  // The re-read shows a foreign edit to entity_type — NOT our key (fye) — so the retry is safe.
  const foreignUnrelated = [{ item_key: "entity_type", state: "answered", answer: { v: "sdn_bhd" }, answered_by: "dash-1" }];
  const { withRuntime, calls } = stubRuntime({ plan: PLAN, items: foreignUnrelated, failCas: 1, receipts: [null, { revision_token: "rev-after-retry", revision_n: 5, status: "updated" }] });
  const out = await updatePlanWithCas(withRuntime, {
    planId: "plan-1", expectedRevision: "rev-STALE",
    items: [{ item_key: "fye", item_kind: "must_ask", question: null, answer: 6, state: "answered", required_for_commit: true }],
    answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry", knownItems: { fye: null },
  });
  assert.equal(out.status, "updated");
  assert.equal(calls.updates.length, 2, "one failed attempt + one retry");
  assert.equal(calls.reads >= 1, true, "the live revision was re-read between attempts");
  assert.equal(calls.updateArgs[0].expectedRevision, "rev-STALE", "first attempt used the caller's stale token");
  assert.equal(calls.updateArgs[1].expectedRevision, "rev-live", "retry used the freshly-read live token");
  assert.equal(calls.updateArgs[1].opKey, "op1:retry", "retry used the fresh op_key (payload revision changed)");
  assert.equal(out.revisionToken, "rev-after-retry");
});

test("F6: updatePlanWithCas on CLR06 where the re-read shows a foreign edit to OUR key → stale_conflict, NO overwrite", async () => {
  // A concurrent dashboard edit changed legal_name — the SAME key this write targets.
  const foreignSameKey = [{ item_key: "legal_name", state: "answered", answer: "DASHBOARD EDIT", answered_by: "dash-1" }];
  const { withRuntime, calls } = stubRuntime({ plan: PLAN, items: foreignSameKey, failCas: 1 });
  const out = await updatePlanWithCas(withRuntime, {
    planId: "plan-1", expectedRevision: "rev-STALE",
    items: [{ item_key: "legal_name", item_kind: "capture", question: null, answer: "INTERVIEW VALUE", state: "answered", required_for_commit: false }],
    answeredBy: "u-1", opKey: "op1", retryOpKey: "op1:retry", knownItems: { legal_name: null },
  });
  assert.equal(out.status, "stale_conflict", "the writer refuses to overwrite a concurrently-edited key");
  assert.deepEqual(out.conflictingKeys, ["legal_name"]);
  assert.equal(calls.updates.length, 1, "exactly ONE update attempt — the retry was NOT issued (no last-writer-wins)");
  assert.ok(Array.isArray(out.liveItems) && out.liveItems[0].itemKey === "legal_name", "the fresh live items are returned so the segment can re-echo");
});

test("F6 fingerprints: itemFingerprint is stable across key order; computeConflictingKeys flags only changed OUR keys", () => {
  // Key order does not matter (a re-read jsonb answer vs a JS-object answer compare equal).
  assert.equal(
    itemFingerprint({ state: "answered", answer: { a: 1, b: 2 } }),
    itemFingerprint({ state: "answered", answer: { b: 2, a: 1 } }),
  );
  assert.notEqual(itemFingerprint({ state: "answered", answer: { a: 1 } }), itemFingerprint({ state: "answered", answer: { a: 2 } }));
  assert.equal(itemFingerprint(null), null, "an absent item fingerprints to null");
  const known = fingerprintMap([{ itemKey: "legal_name", state: "answered", answer: "X" }]);
  const live = [{ itemKey: "legal_name", state: "answered", answer: "FOREIGN" }, { itemKey: "ssm", state: "answered", answer: "202401001234-K" }];
  const items = [{ item_key: "legal_name", item_kind: "capture", question: null, answer: "X", state: "answered", required_for_commit: false }];
  assert.deepEqual(computeConflictingKeys(items, known, live), ["legal_name"], "our key changed under us → conflict");
  const unchanged = computeConflictingKeys(items, fingerprintMap([{ itemKey: "legal_name", state: "answered", answer: "X" }]), [{ itemKey: "legal_name", state: "answered", answer: "X" }]);
  assert.deepEqual(unchanged, [], "our key unchanged → no conflict (an unrelated bump retries)");
});

// --- F5: the plan→run binding drives idempotent start + workflow-side supersede ----

test("F5: interviewRunBinding gives the idempotent-start / supersede decision", () => {
  const boundToOther = [{ item_key: "interview_run", answer: { run_id: "run-EXISTING" } }];
  // Route: a second /client/start on a bound plan returns the existing run (existing:true), starts nothing.
  assert.equal(interviewRunBinding(boundToOther), "run-EXISTING");
  // Workflow (A1): a run whose id differs from the plan's binding self-terminates 'superseded_by_existing_run'.
  const myRunId = "run-NEW";
  assert.equal(interviewRunBinding(boundToOther) !== myRunId, true, "a different bound run → superseded");
  assert.equal(interviewRunBinding([{ item_key: "interview_run", answer: { run_id: myRunId } }]) === myRunId, true, "our own binding → proceed (a replay)");
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

test("an answered client segment carries the sanitized echo (the interview_activity payload persistSegment forwards)", async () => {
  const { res } = await driveOne(segByKey("legal_name"), [ANSWER("Acme Trading SB"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(typeof res.echo, "string");
  assert.match(res.echo, /legal name/);
  assert.match(res.echo, /Acme Trading SB/);
});
