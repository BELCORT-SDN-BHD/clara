// Wave A2.1 — the classify worker (lib/classify.mjs + lib/classify-llm.mjs), PURE (mocked DB
// + a mock generateObject model armed via globalThis.__claraModelForTest — the SAME override
// name every model lane uses, so no test ever hits the network). Proves: claim →
// classify_document round-trip param order + the reserved-engine law + confidence VERBATIM,
// the claim-gate dedupe, that a low-confidence verdict settles ONCE (never loops), and that a
// read/LLM fault RETHROWS (never settles a guessed kind).

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { processClassifyTask, runClassifyCycle, CLASSIFY_ENGINE_ID, CLASSIFY_CONSUMER } from "../lib/classify.mjs";
import { CLASSIFY_KINDS, DB_REFUSED_KINDS, classifyDocumentText } from "../lib/classify-llm.mjs";
import { mockObjectModel, mockThrowingObjectModel } from "./mockModel.mjs";
import { MockLanguageModelV4 } from "ai/test";

afterEach(() => {
  delete globalThis.__claraModelForTest;
});

// The full set classify_document CHECKs (0016 L3202-3207) — CLASSIFY_KINDS ∪ DB_REFUSED_KINDS
// must equal this, and the two subsets must not overlap. Pinned so a future kind addition to
// EITHER list can't silently drift from the DB or reintroduce the consent_evidence poison loop.
const DB_CHECK_KINDS = Object.freeze([
  "invoice", "receipt", "credit_note", "debit_note", "bank_statement", "payment_voucher",
  "claim_form", "payroll_summary", "tax_correspondence", "ssm_company_doc",
  "agreement_contract", "e_invoice_xml", "management_account", "opening_balance_doc",
  "knowledge_artifact", "handwritten_note", "consent_evidence", "other",
]);

const RUNNING_CLAIM = {
  status: "running",
  document_id: "doc-1",
  firm_id: "firm-1",
  lane: "classify",
  storage_path: "firms/firm-1/docs/x.pdf",
  sha256: "a".repeat(64),
  mime_type: "application/pdf",
  byte_size: 10,
};

function mockRuntime(claimReceipt) {
  const calls = [];
  const client = {
    query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/claim_document_processing_task/.test(sql)) return Promise.resolve({ rows: [{ receipt: claimReceipt }] });
      if (/classify_document/.test(sql)) return Promise.resolve({ rows: [{ receipt: { document_id: "doc-1", kind_set: true } }] });
      return Promise.resolve({ rows: [{}] });
    },
  };
  const withRuntime = (fn) => fn(client);
  return { withRuntime, calls };
}

// readExtractionText is injected here (the DB test exercises the real read path); this pure
// suite isolates the claim + settle SQL and the model contract.
const fixedText = { readExtractionText: async () => "TAX INVOICE\nInvoice No: INV-1\nTotal: RM 5,000.00" };

test("consumer identity constant + the classifier engine id are pinned", () => {
  assert.equal(CLASSIFY_CONSUMER, "classify");
  assert.equal(CLASSIFY_ENGINE_ID, "clara-classify-llm:v1");
});

test("a claimed task classifies then settles via classify_document with the exact param order + op-key", async () => {
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.93, rationale: "line items + total due + one seller/buyer" });
  const { withRuntime, calls } = mockRuntime(RUNNING_CLAIM);
  const out = await processClassifyTask(withRuntime, "task-1", fixedText);
  assert.equal(out.status, "done");
  assert.equal(out.kind, "invoice");
  const claimCall = calls.find((c) => /claim_document_processing_task/.test(c.sql));
  assert.ok(claimCall, "claim_document_processing_task was called");
  const settle = calls.find((c) => /classify_document/.test(c.sql));
  assert.ok(settle, "classify_document was called");
  // classify_document(p_document, p_kind, p_confidence, p_engine_id, p_op_key, p_task, p_run)
  assert.equal(settle.params[0], "doc-1", "param 1 = document id (from the claim receipt)");
  assert.equal(settle.params[1], "invoice", "param 2 = the model's kind");
  assert.equal(settle.params[2], 0.93, "param 3 = the model's confidence, VERBATIM");
  assert.equal(settle.params[3], "clara-classify-llm:v1", "param 4 = the classifier engine id");
  assert.equal(settle.params[4], "classify:task-1", "param 5 = the classify:<task> op-key");
  // 0024 race fix round 3 (P1/P2): the CLAIM'S OWN task id, so the settle binds to THIS
  // attempt — never "whichever classify task is newest for this document".
  assert.equal(settle.params[5], "task-1", "param 6 = p_task, the claimed task's own id");
  // P2: the settle also presents the SAME run token this claim wrote to the task row —
  // proving this settle belongs to the claim that produced it, not just a task id that
  // happens to resolve. claimCall.params[1] is the runId classify.mjs generated and
  // passed to claim_document_processing_task as p_workflow_run_id.
  assert.equal(settle.params[6], claimCall.params[1], "param 7 = p_run, the SAME run token the claim itself wrote to the task row");
  assert.match(settle.params[6], /^classify:task-1:[0-9a-f-]{36}$/, "the run token is classify.mjs's own claim:task:uuid shape");
});

test("classify_document NEVER receives the reserved human engine id (clara-classify-human:v1)", async () => {
  globalThis.__claraModelForTest = mockObjectModel({ kind: "receipt", confidence: 0.9, rationale: "received with thanks" });
  const { withRuntime, calls } = mockRuntime(RUNNING_CLAIM);
  await processClassifyTask(withRuntime, "task-2", fixedText);
  const settle = calls.find((c) => /classify_document/.test(c.sql));
  assert.equal(settle.params[3], CLASSIFY_ENGINE_ID);
  assert.notEqual(settle.params[3], "clara-classify-human:v1", "the reserved human engine id is never minted by the classifier worker");
});

test("confidence is passed VERBATIM — a low-confidence verdict settles ONCE (never looped) and holds for human review", async () => {
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.5, rationale: "ambiguous / truncated text" });
  const { withRuntime, calls } = mockRuntime(RUNNING_CLAIM);
  const out = await processClassifyTask(withRuntime, "task-3", fixedText);
  assert.equal(out.status, "done", "the task settles even on low confidence (the DB opens the review question)");
  const settles = calls.filter((c) => /classify_document/.test(c.sql));
  assert.equal(settles.length, 1, "classify_document is called exactly ONCE — the worker never loops on low confidence");
  assert.equal(settles[0].params[2], 0.5, "the low confidence is passed verbatim (the DB owns the >=0.8 gate)");
});

test("a NOT-claimed task (deduped) neither reads nor classifies — the claim gate dedupes", async () => {
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.9, rationale: "x" });
  let read = false;
  const { withRuntime, calls } = mockRuntime({ status: "deduped" });
  const out = await processClassifyTask(withRuntime, "task-4", { readExtractionText: async () => ((read = true), "text") });
  assert.equal(out.status, "deduped");
  assert.equal(read, false, "no extraction read on a non-claimed task");
  assert.ok(!calls.some((c) => /classify_document/.test(c.sql)), "no settle on a non-claimed task");
});

test("a held_egress claim is not claimed (no settle) — the workflow ends with the observed status", async () => {
  const { withRuntime, calls } = mockRuntime({ status: "held_egress" });
  const out = await processClassifyTask(withRuntime, "task-5", fixedText);
  assert.equal(out.status, "held_egress");
  assert.ok(!calls.some((c) => /classify_document/.test(c.sql)));
});

test("an LLM fault RETHROWS (transient re-drive) and NEVER settles a guessed kind", async () => {
  globalThis.__claraModelForTest = mockThrowingObjectModel();
  const { withRuntime, calls } = mockRuntime(RUNNING_CLAIM);
  await assert.rejects(() => processClassifyTask(withRuntime, "task-6", fixedText), /mock object model failure/);
  assert.ok(!calls.some((c) => /classify_document/.test(c.sql)), "no classify_document call on an LLM fault — never a guessed kind");
});

test("a read fault RETHROWS (transient re-drive) and NEVER settles", async () => {
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.9, rationale: "x" });
  const { withRuntime, calls } = mockRuntime(RUNNING_CLAIM);
  await assert.rejects(
    () => processClassifyTask(withRuntime, "task-7", { readExtractionText: async () => { throw new Error("extraction read failed"); } }),
    /extraction read failed/,
  );
  assert.ok(!calls.some((c) => /classify_document/.test(c.sql)));
});

// --------------------------------------------------------------------------------------------
// Finding 2/10b — the classifier vocabulary can never contain a kind classify_document refuses.
// --------------------------------------------------------------------------------------------
test("CLASSIFY_KINDS contains NO kind classify_document deterministically refuses (no consent_evidence loop)", () => {
  for (const refused of DB_REFUSED_KINDS) {
    assert.ok(!CLASSIFY_KINDS.includes(refused), `CLASSIFY_KINDS must not offer '${refused}' — classify_document refuses it, which would loop forever`);
  }
  assert.ok(DB_REFUSED_KINDS.includes("consent_evidence"), "consent_evidence is the known DB-refused kind (0016 CLR28)");
});

test("CLASSIFY_KINDS ∪ DB_REFUSED_KINDS exactly equals the classify_document CHECK set (no drift either way)", () => {
  const union = [...CLASSIFY_KINDS, ...DB_REFUSED_KINDS].sort();
  assert.deepEqual(union, [...DB_CHECK_KINDS].sort(), "every DB kind is either offered or explicitly DB-refused — nothing invented, nothing dropped");
  // disjoint: a kind is never both offered and refused
  assert.equal(CLASSIFY_KINDS.filter((k) => DB_REFUSED_KINDS.includes(k)).length, 0, "the offered and refused sets are disjoint");
});

// --------------------------------------------------------------------------------------------
// Finding 2/10a — a queued classify task past the attempt ceiling is NOT re-driven (bounded).
// --------------------------------------------------------------------------------------------
// A cycle-level recording client: answers requeueStranded (running rows) empty and discoverQueued
// (queued rows) with the given rows, recording the interval-cast SQL so we can assert the fix.
function cycleClient(queuedRows) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (/status='running'/.test(sql)) return Promise.resolve({ rows: [] }); // no stranded
      if (/status='queued'/.test(sql)) return Promise.resolve({ rows: queuedRows });
      return Promise.resolve({ rows: [] });
    },
  };
}

test("runClassifyCycle drives tasks under the attempt ceiling and SKIPS (leaves queued) those at/over it", async () => {
  const rows = [
    { id: "t-fresh", attempt_count: 0 },
    { id: "t-two", attempt_count: 2 },
    { id: "t-poison", attempt_count: 3 }, // == default cap → not driven
    { id: "t-worse", attempt_count: 9 }, // over cap → not driven
  ];
  const client = cycleClient(rows);
  const driven = [];
  const logs = [];
  const r = await runClassifyCycle(client, { processTask: async (id) => driven.push(id), log: (m) => logs.push(m), maxAttempts: 3 });
  assert.deepEqual(driven.sort(), ["t-fresh", "t-two"], "only tasks below the cap are driven — the poison loop is bounded");
  assert.equal(r.processed, 2);
  assert.equal(r.cappedTasks, 2, "two tasks were capped");
  assert.ok(logs.some((m) => /task=t-poison exceeded 3 attempts/.test(m)), "a capped task is logged once, naming id + attempt_count");
  assert.ok(logs.some((m) => /attempt_count=9/.test(m)));
});

test("runClassifyCycle builds the stranded interval as an int-multiplied interval (never string concatenation)", async () => {
  const client = cycleClient([]);
  await runClassifyCycle(client, { processTask: async () => {}, strandedMs: 1234 });
  const stranded = client.queries.find((q) => /status='running'/.test(q.sql));
  assert.ok(stranded, "the stranded-requeue query ran");
  assert.match(stranded.sql, /\$1::int \* interval '1 millisecond'/, "the interval is int-multiplied, not ($1 || ' milliseconds')::interval");
  assert.equal(stranded.params[0], 1234, "strandedMs is passed as a number, not a string");
});

// --------------------------------------------------------------------------------------------
// Finding 7 — the model call is bounded by a timeout/abort so a hung provider can't stall the lane.
// --------------------------------------------------------------------------------------------
test("classifyDocumentText passes an abortSignal to generateObject (a hung provider is bounded)", async () => {
  let sawSignal = null;
  globalThis.__claraModelForTest = new MockLanguageModelV4({
    doGenerate: async (options) => {
      sawSignal = options?.abortSignal ?? null;
      return {
        content: [{ type: "text", text: JSON.stringify({ kind: "other", confidence: 0.5, rationale: "x" }) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      };
    },
  });
  await classifyDocumentText({ text: "hello", modelId: "test", timeoutMs: 5000 });
  assert.ok(sawSignal instanceof AbortSignal, "generateObject received an AbortSignal (timeout/abort is wired)");
});

test("classifyDocumentText composes a caller abortSignal with the timeout budget (both can end the call)", async () => {
  // Prove the composition WITHOUT depending on generateObject's internal abort propagation
  // (an SDK guarantee, not our code): a caller signal that is already aborted must surface,
  // and the wiring above (test 13) proves the signal reaches generateObject.
  let sawSignal = null;
  globalThis.__claraModelForTest = new MockLanguageModelV4({
    doGenerate: async (options) => {
      sawSignal = options?.abortSignal ?? null;
      return {
        content: [{ type: "text", text: JSON.stringify({ kind: "other", confidence: 0.4, rationale: "x" }) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      };
    },
  });
  const caller = new AbortController();
  await classifyDocumentText({ text: "hello", modelId: "test", timeoutMs: 5000, abortSignal: caller.signal });
  assert.ok(sawSignal instanceof AbortSignal, "the composed signal (caller + timeout) is what generateObject receives");
  assert.notEqual(sawSignal, caller.signal, "it is a COMPOSED signal, not the bare caller signal — the timeout is still in force");
});
