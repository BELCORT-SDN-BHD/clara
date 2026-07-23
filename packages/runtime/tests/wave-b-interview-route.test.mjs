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

const { buildFirmReceipt, validateAnswerValue, promptExpectsFirmReceipt, reduceRunMarkers,
  toPendingPark, toTerminal, normalizeStatus, buildInterviewState, deriveInterviewChip } = routes;
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

// --- v2 (§3.1): activity fold + promptConsumed tracking ----------------------

test("reduceRunMarkers folds interview_activity chunks into activity[] in order; a fresh prompt re-opens the park, an activity/terminal consumes it", () => {
  // A parked run: q → c → confirm(activity) → next q. The LAST chunk is a fresh prompt, so the
  // park is OPEN again (promptConsumed=false); the confirmed segment is in activity[].
  const parked = reduceRunMarkers([
    { type: "interview_owner", scope: "firm", principalUserId: "sub-1" },
    { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q", question: "Legal name?" },
    { type: "interview_prompt", parkIndex: 1, seg: "legal_name", phase: "c", question: "I recorded: …" },
    { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" },
    { type: "interview_prompt", parkIndex: 2, seg: "ssm", phase: "q", question: "SSM?" },
  ]);
  assert.deepEqual(parked.activity, [{ kind: "answered", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" }]);
  assert.equal(parked.promptConsumed, false, "the last chunk is a fresh prompt → the park is open");
  assert.equal(parked.prompt.parkIndex, 2);

  // The transient computing state: the LAST chunk is the activity (confirmed, next prompt not yet
  // streamed) → the latest prompt is consumed (promptConsumed=true, no open park).
  const computing = reduceRunMarkers([
    { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q" },
    { type: "interview_prompt", parkIndex: 1, seg: "legal_name", phase: "c" },
    { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" },
  ]);
  assert.equal(computing.promptConsumed, true, "an activity after the latest prompt consumes it");
});

// --- v2 (§3.1): the pure projections -----------------------------------------

test("toPendingPark projects the typed park fields; op_key + expects ride ONLY when present", () => {
  assert.equal(toPendingPark(null), null, "no prompt → no pending park");
  const plain = toPendingPark({ type: "interview_prompt", parkIndex: 3, seg: "ssm", phase: "q", question: "SSM?", scope: "firm" });
  assert.deepEqual(plain, { parkIndex: 3, seg: "ssm", phase: "q", question: "SSM?" }, "an ordinary park has neither expects nor op_key");
  const commit = toPendingPark({ type: "interview_prompt", parkIndex: 11, seg: "commit", phase: "q", question: "…confirm", scope: "firm", expects: "create_firm_receipt", op_key: "op-123" });
  assert.equal(commit.expects, "create_firm_receipt");
  assert.equal(commit.op_key, "op-123", "F5: the commit op_key is a TYPED field the dashboard reads (no prose parsing)");
  assert.equal(containsSecretShape(commit), false, "op_key is an idempotency key, never a secret-shaped field");
});

test("toTerminal strips the stream type tag and passes the outcome payload through", () => {
  assert.equal(toTerminal(null), null);
  const t = toTerminal({ type: "interview_terminal", outcome: "firm_created", firmId: UUID_A, planId: UUID_B, answered: 10 });
  assert.deepEqual(t, { outcome: "firm_created", firmId: UUID_A, planId: UUID_B, answered: 10 });
  assert.equal(containsSecretShape(t), false, "a terminal carries navigable ids, never the admission token/receipt");
});

test("normalizeStatus: the terminal marker is authoritative (cancel/expire → cancelled); else the engine status maps to the §3.1 enum", () => {
  assert.equal(normalizeStatus("running", null), "running");
  assert.equal(normalizeStatus("running", { outcome: "cancelled" }), "cancelled", "a cancel returns normally, so only the terminal marker reveals it");
  assert.equal(normalizeStatus("complete", { outcome: "expired" }), "cancelled");
  assert.equal(normalizeStatus("running", { outcome: "firm_created" }), "complete", "any non-cancel terminal → complete");
  assert.equal(normalizeStatus("complete", null), "complete");
  assert.equal(normalizeStatus(null, null), "unknown", "no runId / indeterminate → unknown");
});

// --- v2 (§3.1): buildInterviewState — the exact /state body ------------------

const FIRM_MID_STREAM = [
  { type: "interview_owner", scope: "firm", principalUserId: "sub-1" },
  { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q", question: "What is the firm's registered legal name?", scope: "firm" },
  { type: "interview_prompt", parkIndex: 1, seg: "legal_name", phase: "c", question: "I recorded: legal name “ACME PLT”. Is that correct? (yes / change)", scope: "firm" },
  { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" },
  { type: "interview_prompt", parkIndex: 2, seg: "ssm", phase: "q", question: "What is the firm's SSM registration number?", scope: "firm" },
];

test("buildInterviewState (firm, parked mid-interview): pending_park set, activity folded, status running, chip awaiting_you", () => {
  const state = buildInterviewState(reduceRunMarkers(FIRM_MID_STREAM), { runId: "run-firm-1", scope: "firm", engineStatus: "running", plan: null, items: [] });
  assert.deepEqual(state.pending_park, { parkIndex: 2, seg: "ssm", phase: "q", question: "What is the firm's SSM registration number?" });
  assert.deepEqual(state.activity, [{ kind: "answered", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" }]);
  assert.equal(state.terminal, null);
  assert.equal(state.status, "running");
  assert.equal(state.run_id, "run-firm-1");
  assert.equal(state.scope, "firm");
  assert.equal(deriveInterviewChip(state), "awaiting_you", "pending_park && !terminal ⇒ awaiting_you");
  assert.equal(containsSecretShape(state), false, "no secret in the whole /state body (P19)");
});

test("buildInterviewState (firm, commit park): pending_park carries expects + typed op_key; chip awaiting_you; no secret", () => {
  const stream = [
    { type: "interview_owner", scope: "firm", principalUserId: "sub-1" },
    { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “ACME PLT”" },
    { type: "interview_prompt", parkIndex: 22, seg: "commit", phase: "q", scope: "firm", expects: "create_firm_receipt", op_key: "op-abc-123", question: "Firm profile ready (10 answers). To create the firm, the dashboard calls create_firm with this op_key and your admission token, then confirms here. (confirm / cancel)" },
  ];
  const state = buildInterviewState(reduceRunMarkers(stream), { runId: "run-firm-1", scope: "firm", engineStatus: "running", plan: null, items: [] });
  assert.equal(state.pending_park.expects, "create_firm_receipt");
  assert.equal(state.pending_park.op_key, "op-abc-123");
  assert.doesNotMatch(state.pending_park.question, /op-abc-123/, "the raw op_key stays OUT of the human prose (it rides the typed field)");
  assert.equal(deriveInterviewChip(state), "awaiting_you");
  assert.equal(containsSecretShape(state), false);
});

test("buildInterviewState (firm, terminal firm_created): pending_park null, terminal + activity surfaced, status complete, chip = outcome", () => {
  const stream = [
    ...FIRM_MID_STREAM,
    { type: "interview_prompt", parkIndex: 3, seg: "commit", phase: "q", scope: "firm", expects: "create_firm_receipt", op_key: "op-abc-123", question: "…confirm / cancel" },
    { type: "interview_terminal", outcome: "firm_created", firmId: UUID_A, planId: UUID_B, answered: 10 },
  ];
  const state = buildInterviewState(reduceRunMarkers(stream), { runId: "run-firm-1", scope: "firm", engineStatus: "complete", plan: null, items: [] });
  assert.equal(state.pending_park, null, "a terminal consumes the park → null pending_park");
  assert.deepEqual(state.terminal, { outcome: "firm_created", firmId: UUID_A, planId: UUID_B, answered: 10 });
  assert.equal(state.status, "complete");
  assert.equal(state.activity.length, 1, "the confirmed segment stays in activity[]");
  assert.equal(deriveInterviewChip(state), "firm_created", "a terminal ⇒ its outcome");
  assert.equal(containsSecretShape(state), false);
});

test("buildInterviewState (firm, cancelled): status cancelled, chip = cancelled", () => {
  const state = buildInterviewState(
    reduceRunMarkers([{ type: "interview_owner", scope: "firm", principalUserId: "sub-1" }, { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q" }, { type: "interview_terminal", outcome: "cancelled", answered: 0 }]),
    { runId: "run-firm-1", scope: "firm", engineStatus: "complete", plan: null, items: [] },
  );
  assert.equal(state.status, "cancelled");
  assert.equal(state.pending_park, null);
  assert.equal(deriveInterviewChip(state), "cancelled");
});

test("buildInterviewState (client scope): activity[] is [] — the plan page is the answer surface (R1 note); pending_park + plan/items still returned", () => {
  const clientStream = [
    { type: "interview_owner", scope: "client", planId: UUID_A },
    { type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q", question: "Legal name?" },
    { type: "interview_prompt", parkIndex: 1, seg: "legal_name", phase: "c", question: "confirm?" },
    { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “Acme Trading SB”" },
    { type: "interview_prompt", parkIndex: 2, seg: "entity_type", phase: "q", question: "Entity type?" },
  ];
  const plan = { id: UUID_A, state: "open", revision_token: "rev-1" };
  const items = [{ item_key: "legal_name", state: "answered" }];
  const state = buildInterviewState(reduceRunMarkers(clientStream), { runId: "run-client-1", scope: "client", engineStatus: "running", plan, items });
  assert.deepEqual(state.activity, [], "client scope MAY (and does) return [] — the plan items are authoritative");
  assert.deepEqual(state.pending_park, { parkIndex: 2, seg: "entity_type", phase: "q", question: "Entity type?" });
  assert.equal(state.plan, plan);
  assert.equal(state.items, items);
  assert.equal(deriveInterviewChip(state), "awaiting_you");
});

test("buildInterviewState (no runId, plan-only view): status unknown, no pending, activity []", () => {
  const plan = { id: UUID_A, state: "open" };
  const state = buildInterviewState(null, { runId: "", scope: "client", engineStatus: null, plan, items: [] });
  assert.equal(state.run_id, null);
  assert.equal(state.status, "unknown");
  assert.equal(state.pending_park, null);
  assert.deepEqual(state.activity, []);
  assert.equal(state.plan, plan);
});

test("deriveInterviewChip: running with no open park ⇒ working (the transient computing state)", () => {
  // The activity is the LAST chunk (confirmed, next prompt not yet streamed) → no open park.
  const state = buildInterviewState(
    reduceRunMarkers([{ type: "interview_prompt", parkIndex: 0, seg: "legal_name", phase: "q" }, { type: "interview_prompt", parkIndex: 1, seg: "legal_name", phase: "c" }, { type: "interview_activity", seg: "legal_name", phase: "c", echo: "legal name “X”" }]),
    { runId: "run-firm-1", scope: "firm", engineStatus: "running", plan: null, items: [] },
  );
  assert.equal(state.pending_park, null);
  assert.equal(state.status, "running");
  assert.equal(deriveInterviewChip(state), "working", "status 'running' with no pending_park ⇒ working");
});
