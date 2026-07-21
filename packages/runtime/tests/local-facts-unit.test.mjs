// Wave A2 — the local_facts consumer (lib/local-facts.mjs), PURE (mocked DB + injected
// parse). Proves the claim-gated idempotency, the happy claim→parse→persist path, and the
// terminal-vs-transient failure split. No live DB, no worker thread (deps.parseFacts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { processLocalFactsTask } from "../lib/local-facts.mjs";

// A withRuntime that answers claim/persist/fail by SQL and records every call.
function mockRuntime(claimReceipt) {
  const calls = [];
  const client = {
    query(sql, params) {
      calls.push({ sql, params });
      if (/claim_document_processing_task/.test(sql)) return Promise.resolve({ rows: [{ receipt: claimReceipt }] });
      if (/persist_invoice_facts/.test(sql)) return Promise.resolve({ rows: [{ receipt: { ok: true } }] });
      if (/fail_invoice_facts/.test(sql)) return Promise.resolve({ rows: [{ receipt: { status: "failed" } }] });
      return Promise.resolve({ rows: [{}] });
    },
  };
  const withRuntime = (fn) => fn(client);
  return { withRuntime, calls };
}

const services = () => ({
  taskTempPath: () => "/tmp/task.bin",
  removeTempFile: async () => {},
  downloadCanonical: async () => {},
});

const okParse = async () => ({
  fields: [{ field_path: "invoice.total", value_raw: "1060.00", page: 1, polygon: [], confidence: null }],
  rawSha256: "deadbeef",
  normalizationVersion: "clara-myinvois-norm:v1",
  pagesUsed: 1,
  envelope: {},
});

test("a NOT-claimed task (held/deduped) neither parses nor persists — the claim gate dedupes", async () => {
  let parsed = false;
  const { withRuntime, calls } = mockRuntime({ status: "deduped" });
  const out = await processLocalFactsTask(withRuntime, "task-1", services(), {
    parseFacts: async () => ((parsed = true), okParse()),
  });
  assert.equal(out.status, "deduped");
  assert.equal(parsed, false, "no parse on a non-claimed task");
  assert.ok(!calls.some((c) => /persist_invoice_facts/.test(c.sql)), "no persist on a non-claimed task");
});

test("a claimed task parses then persists the facts through persist_invoice_facts", async () => {
  const claim = { status: "running", document_id: "d1", firm_id: "f1", storage_path: "firms/f1/docs/x.xml", sha256: "abc", mime_type: "application/xml", byte_size: 10 };
  const { withRuntime, calls } = mockRuntime(claim);
  const out = await processLocalFactsTask(withRuntime, "task-2", services(), { parseFacts: okParse });
  assert.equal(out.status, "done");
  const persist = calls.find((c) => /persist_invoice_facts/.test(c.sql));
  assert.ok(persist, "persist_invoice_facts was called");
  assert.equal(persist.params[0], "task-2");
  assert.deepEqual(JSON.parse(persist.params[1]), [{ field_path: "invoice.total", value_raw: "1060.00", page: 1, polygon: [], confidence: null }]);
  assert.equal(persist.params[2], "deadbeef"); // rawSha256
  assert.equal(persist.params[3], "clara-myinvois-norm:v1"); // normalizationVersion
});

test("a claimed task carrying no storage metadata is no-work (never parses)", async () => {
  const { withRuntime, calls } = mockRuntime({ status: "running" }); // no storage_path/sha256
  const out = await processLocalFactsTask(withRuntime, "task-3", services(), { parseFacts: okParse });
  assert.equal(out.status, "no_work");
  assert.ok(!calls.some((c) => /persist_invoice_facts/.test(c.sql)));
});

test("a terminal parse fault fails the task via fail_invoice_facts (never persists)", async () => {
  const claim = { status: "running", storage_path: "p", sha256: "s" };
  const { withRuntime, calls } = mockRuntime(claim);
  const out = await processLocalFactsTask(withRuntime, "task-4", services(), {
    parseFacts: async () => {
      throw Object.assign(new Error("not UBL"), { code: "corrupt" });
    },
  });
  assert.equal(out.status, "failed");
  assert.equal(out.code, "corrupt");
  assert.ok(calls.some((c) => /fail_invoice_facts/.test(c.sql)), "the task was failed");
  assert.ok(!calls.some((c) => /persist_invoice_facts/.test(c.sql)), "a failed parse never persists");
});

test("a transient storage fault RETHROWS (left for re-drive), never a terminal fail", async () => {
  const claim = { status: "running", storage_path: "p", sha256: "s" };
  const { withRuntime, calls } = mockRuntime(claim);
  await assert.rejects(
    processLocalFactsTask(withRuntime, "task-5", { ...services(), downloadCanonical: async () => { throw Object.assign(new Error("s3 down"), { code: "storage_error" }); } }, { parseFacts: okParse }),
    /s3 down/,
  );
  assert.ok(!calls.some((c) => /fail_invoice_facts/.test(c.sql)), "a transient fault is not a terminal fail");
});
