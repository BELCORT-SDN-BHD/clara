// Wave-B firmInterview_v1 — closure-logic tests for the salvaged 11-Q firm-bootstrap
// interview: question sequencing, salvaged validators (SSM new+old, TIN gated by turnover,
// email, fye, enum synonyms), echo-back gating, validator-refusal-persists-nothing (P19),
// cancel path, buildFirmPlanItems (O7 intended-record), and the P19 no-secret negative.
// STUBBED ask + pools; no WDK engine, no DB. Runs serially (node --test-concurrency=1).

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const core = await import("../workflows/interview.v1.core.ts");
const q = await import("../workflows/interview.v1.questions.ts");
const writer = await import("../workflows/interview.v1.writer.ts");
const { scriptedAsk, ANSWER, CANCEL, EXPIRE, containsSecretShape, stubRuntime } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegment, validateSsm, validateTin, validateEmail, validateFye, validateEnum, hookToken } = core;
const { FIRM_SEGMENTS, buildFirmPlanItems } = q;
const { verifyFirmCommitReceipt } = writer;
const segByKey = (k) => FIRM_SEGMENTS.find((s) => s.key === k);

/** Drive one segment with a scripted answer + confirm. */
async function driveOne(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegment(seg, s.ask, prior);
  return { res, asked: s.asked };
}

// --- validators (salvaged) --------------------------------------------------

test("validateSsm accepts modern 12-digit AND old ROC forms; rejects garbage", () => {
  assert.equal(validateSsm("202401001234-K").ok, true, "modern SSM");
  assert.equal(validateSsm("1050274-A").ok, true, "old ROC SSM (not 12 digits)");
  assert.equal(validateSsm("hello").ok, false);
  assert.equal(validateSsm("").ok, false);
});

test("validateTin shape; validateEmail; validateFye 1-12", () => {
  assert.equal(validateTin("IG56003500070").ok, true);
  assert.equal(validateTin("C2584563222").ok, true);
  assert.equal(validateTin("$$$").ok, false);
  assert.equal(validateEmail("a@b.com").ok, true);
  assert.equal(validateEmail("nope").ok, false);
  assert.equal(validateFye("12").ok, true);
  assert.equal(validateFye("13").ok, false);
  assert.equal(validateFye("0").ok, false);
});

test("entity-type enum normalizes Malaysian synonyms without re-asking", () => {
  const v = validateEnum("entity type", ["sdn_bhd", "sole_prop"], { "sendirian_berhad": "sdn_bhd" });
  assert.equal(v("Sendirian Berhad").ok, true);
  assert.equal(v("Sendirian Berhad").value, "sdn_bhd");
  assert.equal(v("sdn_bhd").value, "sdn_bhd");
  assert.equal(v("random").ok, false);
});

test("TIN is gated by the collected turnover band (exempt when <RM1M)", async () => {
  const tinSeg = segByKey("tin");
  // Under <RM1M a 'skip' is lawful and stored as null.
  const exempt = await driveOne(tinSeg, [ANSWER("skip"), ANSWER("yes")], { turnover: "<RM1M" });
  assert.equal(exempt.res.outcome, "answered");
  assert.equal(exempt.res.value, null);
  // Above <RM1M a blank/garbage TIN must be refused (re-asked), not accepted.
  const notExempt = segByKey("tin").validate("", { turnover: "RM1M-5M" });
  assert.equal(notExempt.ok, false);
});

// --- sequencing + echo-back gating ------------------------------------------

test("a valid answer asks a confirm ('c') park BEFORE returning answered (echo-back gate)", async () => {
  const { res, asked } = await driveOne(segByKey("legal_name"), [ANSWER("ACME PLT"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(res.value, "ACME PLT");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "c"], "one question park then one confirm park");
  assert.match(asked[1].question, /Is that correct/);
});

test("a 'change'/no at the confirm re-asks the plain question (no persist)", async () => {
  const { res, asked } = await driveOne(segByKey("legal_name"), [ANSWER("Typo Ltd"), ANSWER("change"), ANSWER("ACME PLT"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(res.value, "ACME PLT");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "c", "q", "c"]);
});

test("validator refusal re-asks with the reason and persists NOTHING (P19) — no confirm until valid", async () => {
  const { res, asked } = await driveOne(segByKey("ssm"), [ANSWER("garbage"), ANSWER("202401001234-K"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(res.value, "202401001234-K");
  // The bad answer produced NO confirm park; the reason was prefixed onto the re-ask.
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "c"]);
  assert.match(asked[1].question, /SSM must be/);
});

test("cancel / expire at any park terminates cleanly with NO items", async () => {
  const c = await driveOne(segByKey("legal_name"), [CANCEL()]);
  assert.equal(c.res.outcome, "cancelled");
  assert.equal(c.res.items, undefined);
  const e = await driveOne(segByKey("legal_name"), [ANSWER("ACME"), EXPIRE()]);
  assert.equal(e.res.outcome, "expired");
});

test("the full 11-Q firm inventory drives in order to 11 answered segments", async () => {
  const answers = {};
  const valid = {
    legal_name: "ACME PLT", ssm: "202401001234-K", entity_type: "Sdn Bhd", address: "1 Jalan Ampang KL",
    mia: "skip", bookkeeper_email: "bk@acme.my", turnover: "RM1M-5M", tin: "C2584563222", fye: "12",
    currency: "MYR", framework: "MPERS",
  };
  let answered = 0;
  let skipped = 0;
  for (const seg of FIRM_SEGMENTS) {
    const { res } = await driveOne(seg, [ANSWER(valid[seg.key]), ANSWER("yes")], answers);
    assert.notEqual(res.outcome, "cancelled", `${seg.key} should not cancel`);
    if (res.outcome === "answered") {
      answers[seg.key] = res.value;
      answered += 1;
    } else if (res.outcome === "skipped") {
      skipped += 1;
    }
  }
  assert.equal(answered + skipped, 11, "all 11 firm questions processed");
  assert.equal(skipped, 1, "the optional MIA question was skipped");
  assert.equal(answered, 10);
  assert.equal(answers.entity_type, "sdn_bhd", "synonym normalized");
  assert.equal(answers.tin, "C2584563222", "TIN captured (non-exempt turnover)");
});

// --- O7 intended-record + P19 no-secret -------------------------------------

test("buildFirmPlanItems yields answered capture items + a first_client_onboarding todo", () => {
  const answers = { legal_name: "ACME PLT", ssm: "202401001234-K", fye: 12 };
  const items = buildFirmPlanItems(answers);
  const keys = items.map((i) => i.item_key);
  assert.ok(keys.includes("legal_name"));
  assert.ok(keys.includes("first_client_onboarding"), "the O7 first-client intent todo");
  const todo = items.find((i) => i.item_key === "first_client_onboarding");
  assert.equal(todo.item_kind, "todo");
  assert.equal(todo.state, "deferred");
  for (const it of items) assert.ok(["must_ask", "capture", "todo"].includes(it.item_kind));
});

test("P19: no secret-shaped key appears in any firm question, echo, or plan item", () => {
  for (const seg of FIRM_SEGMENTS) assert.equal(containsSecretShape({ q: seg.question }), false, seg.key);
  const items = buildFirmPlanItems({ legal_name: "ACME PLT", bookkeeper_email: "bk@acme.my" });
  assert.equal(containsSecretShape(items), false, "no admission_token/secret ever enters a plan item");
});

test("hookToken is deterministic per run + park index (route-reconstructible)", () => {
  assert.equal(hookToken("firm", "run-abc", 0), "fi:run-abc:0");
  assert.equal(hookToken("firm", "run-abc", 7), "fi:run-abc:7");
  assert.equal(hookToken("firm", "run-abc", 0), hookToken("firm", "run-abc", 0), "stable across replay");
});

// --- F2: the firm commit VERIFIES the receipt before writing anything --------

const FIRM_ID = "f1111111-1111-4111-8111-111111111111";
const PLAN_ID = "d1111111-1111-4111-8111-111111111111";
const OWNER = "50000000-0000-4000-8000-000000000001";
const firmPlan = { id: PLAN_ID, scope_kind: "firm", state: "open", firm_id: FIRM_ID };

test("F2: a verified receipt requires an OPEN firm plan of firmId AND the principal as active OWNER of it", async () => {
  const { withRuntime, calls } = stubRuntime({ plan: firmPlan, principal: { firm_id: FIRM_ID, role: "owner" } });
  const ok = await verifyFirmCommitReceipt(withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER });
  assert.equal(ok, true);
  assert.equal(calls.principalReads, 1, "membership rides resolve_chat_principal (clara_runtime cannot read firm_memberships)");
});

test("F2: a receipt pointing at a plan in a firm the principal does NOT own is refused (zero writes)", async () => {
  const { withRuntime } = stubRuntime({ plan: firmPlan, principal: { firm_id: "f2222222-2222-4222-8222-222222222222", role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false, "principal owns a DIFFERENT firm");
});

test("F2: a non-owner (admin) principal, a CLIENT-scope plan, a non-open plan, and a firmId mismatch are all refused", async () => {
  const notOwner = stubRuntime({ plan: firmPlan, principal: { firm_id: FIRM_ID, role: "admin" } });
  assert.equal(await verifyFirmCommitReceipt(notOwner.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false, "admin is not owner");

  const clientScope = stubRuntime({ plan: { ...firmPlan, scope_kind: "client" }, principal: { firm_id: FIRM_ID, role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(clientScope.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false, "a client-scope plan is not a firm bootstrap target");

  const committed = stubRuntime({ plan: { ...firmPlan, state: "committed" }, principal: { firm_id: FIRM_ID, role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(committed.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false, "a non-open plan is refused");

  const mismatch = stubRuntime({ plan: firmPlan, principal: { firm_id: FIRM_ID, role: "owner" } });
  assert.equal(await verifyFirmCommitReceipt(mismatch.withRuntime, { planId: PLAN_ID, firmId: "f9999999-9999-4999-8999-999999999999", principalUserId: OWNER }), false, "the receipt's firmId must equal the plan's firm_id");

  const noMembership = stubRuntime({ plan: firmPlan, principal: null });
  assert.equal(await verifyFirmCommitReceipt(noMembership.withRuntime, { planId: PLAN_ID, firmId: FIRM_ID, principalUserId: OWNER }), false, "no membership row → refused");
});
