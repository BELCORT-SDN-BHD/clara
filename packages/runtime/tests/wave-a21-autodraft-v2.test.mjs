// Wave-A2.1 autoDraft_v2 — unit tests for the PROMPT-ONLY delta (the purchase 3-leg
// visibility split when facts state a tax amount + the sst_registration_watch awareness
// note that the UNATTENDED sweep may mention but never acts on) AND the regression that
// the settle-outcome reducer, the CLR->refusal map, and the draft wrapper are byte-
// identical to v1 (the wrapper still stamps supplier_bill; the sweep stays client- +
// document-pinned). STUBBED pools (no DB). Mirrors wave-a-autodraft-closure.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/autoDraft.v2.prompt.ts");
const errors = await import("../workflows/autoDraft.v2.errors.ts");
const toolsMod = await import("../workflows/autoDraft.v2.tools.ts");

const { toAutoDraftOutcome, isDoubleCodedReason, SYSTEM_PROMPT_AUTODRAFT_V2, DRAFT_TOOL } = prompt;
const { refusalFromDbError, noDraftRefusal } = errors;
const { runDraftJournalEntry } = toolsMod;

// --- the v2 PROMPT delta (the load-bearing framing) ------------------------

test("v2 prompt teaches the purchase 3-leg visibility split (WA21-R1)", () => {
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /visibility split/i, "frames the split");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /NO input-tax credit/i, "states the no-input-tax-credit doctrine");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /sst_purchase_cost/, "points at the special-type account by name");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /never invent a tax figure/i, "forbids inventing an unstated tax figure");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /VENDOR, never a customer/, "purchase-direction vocabulary");
});

test("v2 prompt notes sst_registration_watch may be mentioned but the sweep never acts on it", () => {
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /sst_registration_watch/, "aware of the context-pack block");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /a DB-computed screening estimate/, "carries the basis label");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /NEVER acts on it/i, "the unattended sweep never acts on the watch");
  assert.match(SYSTEM_PROMPT_AUTODRAFT_V2, /never multiply by 8%/i, "forbids the ×8% tax-due computation");
});

// --- the settle-outcome reducer is UNCHANGED from v1 (regression) ----------

const drafted = (entryId) => [
  { type: "tool-call", toolCallId: "x", toolName: DRAFT_TOOL, input: {} },
  { type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: true, je_review: { type: "je_review", entry_id: entryId, revision_token: "r", client_id: "c", document_id: "d", provenance_tier: "model_read" } } },
];
const refused = (refusal) => [{ type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: false, refusal } }];

test("v2 reducer: a successful draft -> drafted{entryId}; both double_coded reasons -> noop_existing", () => {
  assert.equal(toAutoDraftOutcome(drafted("entry-9")).kind, "drafted");
  for (const reason of ["double_coded", "already_coded"]) {
    assert.equal(toAutoDraftOutcome(refused({ type: "refusal", code: "CLR29", reason, message: "x" })).kind, "noop_existing");
  }
  assert.equal(isDoubleCodedReason("double_coded"), true);
  assert.equal(isDoubleCodedReason("currency_unsupported"), false);
});

test("v2 error map is oracle-safe (CLR21 detail, 42501 -> CLR03, generic leaks no SQL)", () => {
  assert.equal(refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }).reason, "currency_unsupported");
  assert.equal(refusalFromDbError({ code: "42501" }).code, "CLR03");
  const generic = refusalFromDbError({ code: "XXOTHER", message: "select * from clara.secret" });
  assert.equal(generic.code, "internal");
  assert.doesNotMatch(generic.message, /select/i, "no SQL text leaks");
  assert.equal(noDraftRefusal().reason, "coding_incomplete");
});

// --- the draft wrapper is UNCHANGED from v1 (client- + document-pinned, supplier_bill) ---

const DOC = "11111111-1111-1111-1111-111111111111";
const baseInput = {
  posting_date: "2025-10-15",
  lines: [
    { account_code: "600-000", debit_cents: 1000, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
  ],
  document_id: DOC,
  vendor: { new: { name: "BRIGHTPATH SDN BHD" } },
  evidence: [{ region_id: "22222222-2222-2222-2222-222222222222", quote: "1000" }],
};
const ctx = { firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7" };

function stubPools({ verifiedFiling = true, extract = null } = {}) {
  const captured = { writeParams: null, writeCalled: false };
  const readClient = {
    query: async (sql) => {
      if (/from clara\.document_filings/.test(sql)) {
        return { rows: verifiedFiling ? [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }] : [], rowCount: verifiedFiling ? 1 : 0 };
      }
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: extract }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const writeClient = {
    query: async (_sql, params) => {
      captured.writeCalled = true;
      captured.writeParams = params;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9", status: "draft" } }], rowCount: 1 };
    },
  };
  const mintClient = { query: async () => ({ rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 }) };
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn(mintClient),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
  };
  return captured;
}

test("v2 wrapper success: fetches sha256/resolution/books/op_key server-side, stamps supplier_bill", async () => {
  const cap = stubPools({ extract: null });
  const r = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(r.ok, true);
  assert.equal(r.je_review.entry_id, "entry-9");
  const p = cap.writeParams;
  assert.equal(p[0], "c1", "client pinned");
  assert.equal(p[5], DOC, "document pinned from the task, not model-chosen");
  assert.equal(p[8], `code-doc:task-7:${DOC}`, "stable op_key");
  assert.equal(p[13], "supplier_bill", "coding_kind marker unchanged");
});

test("v2 wrapper refuses (CLR11) a draft naming a DIFFERENT document than the task's — no write", async () => {
  const cap = stubPools();
  const r = await runDraftJournalEntry(ctx, { ...baseInput, document_id: "99999999-9999-9999-9999-999999999999" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR11");
  assert.equal(cap.writeCalled, false, "a mismatched document never reaches the writer");
});
