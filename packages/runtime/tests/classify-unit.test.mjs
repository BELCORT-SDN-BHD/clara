// Wave A2.1 — the classify worker (lib/classify.mjs + lib/classify-llm.mjs), PURE (mocked DB
// + a mock generateObject model armed via globalThis.__claraModelForTest — the SAME override
// name every model lane uses, so no test ever hits the network). Proves: claim →
// classify_document round-trip param order + the reserved-engine law + confidence VERBATIM,
// the claim-gate dedupe, that a low-confidence verdict settles ONCE (never loops), and that a
// read/LLM fault RETHROWS (never settles a guessed kind).

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { processClassifyTask, CLASSIFY_ENGINE_ID, CLASSIFY_CONSUMER } from "../lib/classify.mjs";
import { mockObjectModel, mockThrowingObjectModel } from "./mockModel.mjs";

afterEach(() => {
  delete globalThis.__claraModelForTest;
});

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
  const settle = calls.find((c) => /classify_document/.test(c.sql));
  assert.ok(settle, "classify_document was called");
  // classify_document(p_document, p_kind, p_confidence, p_engine_id, p_op_key)
  assert.equal(settle.params[0], "doc-1", "param 1 = document id (from the claim receipt)");
  assert.equal(settle.params[1], "invoice", "param 2 = the model's kind");
  assert.equal(settle.params[2], 0.93, "param 3 = the model's confidence, VERBATIM");
  assert.equal(settle.params[3], "clara-classify-llm:v1", "param 4 = the classifier engine id");
  assert.equal(settle.params[4], "classify:task-1", "param 5 = the classify:<task> op-key");
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
