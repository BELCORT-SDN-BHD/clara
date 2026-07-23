// Wave-B interview ROUTES — authz-SHAPE logic for the answer/cancel/state binding cluster
// (F1/F5/F7/F8), the wave-a-document-route pattern: the .ts route module loads through tsx's
// ESM loader and only its PURE exported helpers are exercised (no express, no engine, no DB), so
// the binding + receipt-filtering discipline is proven without a server. Runs serially.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const routes = await import("../src/interviewRoutes.ts");
const core = await import("../workflows/interview.v1.core.ts");
const { AuthError } = await import("../lib/authz.mjs");
const { containsSecretShape } = await import("./wave-b-interview-testkit.mjs");

const { buildFirmReceipt, validateAnswerValue, promptExpectsFirmReceipt, reduceRunMarkers } = routes;
const { firmOwnerMatches, interviewRunBinding } = core;

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// --- F1: firm-scope binding (owner marker) ----------------------------------

test("firmOwnerMatches binds a firm run to its principal; a non-owner / wrong scope / null is refused", () => {
  const owner = { type: "interview_owner", scope: "firm", principalUserId: "sub-1" };
  assert.equal(firmOwnerMatches(owner, "sub-1"), true, "the bound principal matches");
  assert.equal(firmOwnerMatches(owner, "sub-2"), false, "a different sub is refused (→ route 404)");
  assert.equal(firmOwnerMatches({ type: "interview_owner", scope: "client", planId: UUID_A }, "sub-1"), false, "a client marker never satisfies a firm bind");
  assert.equal(firmOwnerMatches({ type: "interview_owner", scope: "firm" }, "sub-1"), false, "a marker without principalUserId is refused");
  assert.equal(firmOwnerMatches(null, "sub-1"), false, "a missing marker is fail-closed");
});

// --- F1/F5: client-scope binding (the durable 'interview_run' item) ----------

test("interviewRunBinding reads the plan→run binding from BOTH the snake row and the camel snapshot", () => {
  const snake = [{ item_key: "legal_name", answer: { v: "x" } }, { item_key: "interview_run", answer: { run_id: "run-9" } }];
  assert.equal(interviewRunBinding(snake), "run-9", "route row shape (item_key/answer)");
  const camel = [{ itemKey: "interview_run", answer: { run_id: "run-9" } }];
  assert.equal(interviewRunBinding(camel), "run-9", "writer snapshot shape (itemKey)");
});

test("interviewRunBinding is null when unbound or malformed (an unbound plan → route starts a new run; F5 idempotency uses the bound value)", () => {
  assert.equal(interviewRunBinding([{ item_key: "legal_name", answer: { v: 1 } }]), null, "no interview_run item");
  assert.equal(interviewRunBinding([{ item_key: "interview_run", answer: {} }]), null, "no run_id in answer");
  assert.equal(interviewRunBinding([{ item_key: "interview_run", answer: null }]), null, "null answer");
  assert.equal(interviewRunBinding([]), null, "empty plan");
});

test("F1: a mismatched planId↔runId binding is a refusal (the route 404s before resumeHook)", () => {
  const items = [{ item_key: "interview_run", answer: { run_id: "run-REAL" } }];
  // The route compares interviewRunBinding(items) === supplied runId; a foreign runId does not match.
  assert.notEqual(interviewRunBinding(items), "run-ATTACKER", "a caller-supplied foreign runId never matches the plan's binding");
  assert.equal(interviewRunBinding(items) === "run-REAL", true);
});

// --- F7/F8: firm commit receipt is rebuilt (extra fields dropped) ------------

test("buildFirmReceipt accepts the create_firm SNAKE shape (migration 0017) and the camel shape", () => {
  assert.deepEqual(buildFirmReceipt({ firm_id: UUID_A, plan_id: UUID_B }), { firmId: UUID_A, planId: UUID_B }, "snake");
  assert.deepEqual(buildFirmReceipt({ firmId: UUID_A, planId: UUID_B }), { firmId: UUID_A, planId: UUID_B }, "camel");
});

test("F7: buildFirmReceipt DROPS every extra field — an admission_token can never reach the hook payload", () => {
  const receipt = buildFirmReceipt({ firm_id: UUID_A, plan_id: UUID_B, admission_token: "00000000-0000-4000-8000-000000000dead", secret: "x" });
  assert.deepEqual(Object.keys(receipt).sort(), ["firmId", "planId"], "only firmId + planId survive");
  assert.equal(containsSecretShape(receipt), false, "no secret-shaped key in the rebuilt receipt (P19)");
});

test("F8: a malformed receipt (missing/garbage uuid) is a 400 bad_receipt, never delivered", () => {
  for (const bad of [{}, { firm_id: UUID_A }, { plan_id: UUID_B }, { firm_id: "not-a-uuid", plan_id: UUID_B }, { firmId: 123, planId: UUID_B }, null]) {
    assert.throws(() => buildFirmReceipt(bad), (e) => e instanceof AuthError && e.status === 400 && e.code === "bad_receipt", `refused: ${JSON.stringify(bad)}`);
  }
});

// --- F7: a NON-receipt answer value is guarded (primitive/plain, ≤ 8KB) ------

test("validateAnswerValue accepts JSON primitives + plain objects/arrays", () => {
  for (const ok of ["yes", "202401001234-K", 12, true, false, null, { a: 1 }, [1, 2, 3], { nested: { x: [true] } }]) {
    assert.doesNotThrow(() => validateAnswerValue(ok), `accepts ${JSON.stringify(ok)}`);
  }
});

test("F7: validateAnswerValue refuses a non-plain object, a non-serializable value, and an oversized blob (400)", () => {
  assert.throws(() => validateAnswerValue(new Map([["a", 1]])), (e) => e instanceof AuthError && e.status === 400 && e.code === "bad_value", "Map is not plain");
  assert.throws(() => validateAnswerValue(() => 1), (e) => e instanceof AuthError && e.code === "bad_value", "a function is refused");
  assert.throws(() => validateAnswerValue(10n), (e) => e instanceof AuthError && e.code === "bad_value", "a bigint is refused");
  assert.throws(() => validateAnswerValue("x".repeat(8 * 1024 + 1)), (e) => e instanceof AuthError && e.code === "bad_value", "an oversized string is refused");
});

// --- the marker fold (owner=first, prompt/terminal=latest) -------------------

test("reduceRunMarkers folds a run's chunks: owner=FIRST, prompt/terminal=LATEST, latest=most-recent", () => {
  const chunks = [
    { type: "interview_owner", scope: "firm", principalUserId: "sub-1" },
    { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q" },
    { type: "interview_owner", scope: "firm", principalUserId: "IMPOSTER" }, // a later owner chunk never wins
    { type: "interview_prompt", parkIndex: 1, seg: "commit", phase: "q", expects: "create_firm_receipt" },
  ];
  const m = reduceRunMarkers(chunks);
  assert.equal(m.owner.principalUserId, "sub-1", "the FIRST owner marker is the binding (a forged later one is ignored)");
  assert.equal(m.prompt.parkIndex, 1, "the latest prompt is the current park");
  assert.equal(promptExpectsFirmReceipt(m.prompt), true, "the commit park expects a create_firm receipt (F7 routing)");
  assert.equal(promptExpectsFirmReceipt({ type: "interview_prompt", seg: "legal_name" }), false, "an ordinary prompt does not");
});

test("reduceRunMarkers latest prefers a terminal that arrives after the last prompt", () => {
  const m = reduceRunMarkers([
    { type: "interview_owner", scope: "client", planId: UUID_A },
    { type: "interview_prompt", parkIndex: 0 },
    { type: "interview_terminal", outcome: "interview_complete" },
  ]);
  assert.equal(m.latest.type, "interview_terminal");
  assert.equal(m.terminal.outcome, "interview_complete");
});
