// Wave A — autoDraft_v1 FROZEN closure logic (no DB, no world). The .ts closure modules
// (prompt/errors/tools/infra — none import "workflow") are loaded through tsx's ESM loader,
// mirroring s6-closure-logic.test.mjs. Proves the settle-outcome reducer (incl. BOTH
// double_coded reasons -> noop_existing), the question-shaped classifier, the CLR->refusal
// map, and the draft_journal_entry wrapper with STUBBED pools. MUST pass at build time.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/autoDraft.v1.prompt.ts");
const errors = await import("../workflows/autoDraft.v1.errors.ts");
const toolsMod = await import("../workflows/autoDraft.v1.tools.ts");

const { toAutoDraftOutcome, isQuestionShaped, isDoubleCodedReason, DRAFT_TOOL } = prompt;
const { refusalFromDbError, noDraftRefusal, noFilingRefusal } = errors;
const { runDraftJournalEntry } = toolsMod;

const drafted = (entryId) => [
  { type: "tool-call", toolCallId: "x", toolName: DRAFT_TOOL, input: {} },
  { type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: true, je_review: { type: "je_review", entry_id: entryId, revision_token: "r", client_id: "c", document_id: "d", provenance_tier: "model_read" } } },
];
const refused = (refusal) => [{ type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: false, refusal } }];

// --- the settle-outcome reducer --------------------------------------------

test("toAutoDraftOutcome: a successful draft -> drafted{entryId}", () => {
  assert.deepEqual(toAutoDraftOutcome(drafted("entry-9")), { kind: "drafted", entryId: "entry-9", jeReview: { type: "je_review", entry_id: "entry-9", revision_token: "r", client_id: "c", document_id: "d", provenance_tier: "model_read" } });
});

test("toAutoDraftOutcome: BOTH double_coded reasons map to a SUCCESS-shaped noop_existing (WA-L8)", () => {
  for (const reason of ["double_coded", "already_coded"]) {
    const o = toAutoDraftOutcome(refused({ type: "refusal", code: "CLR29", reason, message: "already coded" }));
    assert.equal(o.kind, "noop_existing", `${reason} -> noop_existing`);
  }
});

test("toAutoDraftOutcome: a terminal refusal (CLR23 vendor) -> refused{refusal}", () => {
  const o = toAutoDraftOutcome(refused({ type: "refusal", code: "CLR23", message: "vendor conflict" }));
  assert.equal(o.kind, "refused");
  assert.equal(o.refusal.code, "CLR23");
});

test("toAutoDraftOutcome: no draft, no refusal (the model explained a block in prose) -> none", () => {
  assert.deepEqual(toAutoDraftOutcome([{ type: "text", text: "This bill is in USD; I did not draft it." }]), { kind: "none" });
});

test("isDoubleCodedReason + isQuestionShaped classify the sweep-refusal handling", () => {
  assert.equal(isDoubleCodedReason("double_coded"), true);
  assert.equal(isDoubleCodedReason("already_coded"), true);
  assert.equal(isDoubleCodedReason("currency_unsupported"), false);
  assert.equal(isQuestionShaped({ type: "refusal", code: "CLR23", message: "x" }), true, "vendor conflict is question-worthy");
  assert.equal(isQuestionShaped({ type: "refusal", code: "CLR21", reason: "currency_unsupported", message: "x" }), true);
  assert.equal(isQuestionShaped({ type: "refusal", code: "internal", message: "x" }), false, "a transient fault is not a question");
  assert.equal(isQuestionShaped(undefined), false);
});

// --- the CLR -> typed refusal map (oracle-safe) ----------------------------

test("refusalFromDbError maps CLR21 detail, CLR29 double_coded, native uniques, and 42501 — never leaking SQL", () => {
  assert.equal(refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }).reason, "currency_unsupported");
  assert.equal(refusalFromDbError({ code: "CLR29", detail: '{"reason":"double_coded"}' }).reason, "double_coded");
  assert.equal(refusalFromDbError({ code: "23505", constraint: "counterparty_aliases_live_uniq" }).code, "CLR23");
  assert.equal(refusalFromDbError({ code: "23503" }).code, "CLR11", "FK breach -> not-found collapse");
  assert.equal(refusalFromDbError({ code: "42501" }).code, "CLR03");
  const generic = refusalFromDbError({ code: "XXOTHER", message: "select * from clara.secret" });
  assert.equal(generic.code, "internal");
  assert.doesNotMatch(generic.message, /select/i, "no SQL text leaks");
  assert.equal(noDraftRefusal().reason, "coding_incomplete");
  assert.equal(noFilingRefusal().code, "CLR02");
});

// --- the draft_journal_entry wrapper (stubbed pools, client- + document-pinned) --------------

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

function stubPools({ verifiedFiling = true, extract = null, writeThrows = null, receipt = null } = {}) {
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
    query: async (sql, params) => {
      captured.writeCalled = true;
      captured.writeParams = params;
      if (writeThrows) throw writeThrows;
      return { rows: [{ receipt: receipt ?? { entry_id: "entry-9", revision_token: "rev-9", status: "draft" } }], rowCount: 1 };
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

test("draft wrapper success: returns je_review + fetches sha256/resolution/books/op_key server-side, stamps supplier_bill", async () => {
  const cap = stubPools({ extract: null });
  const r = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(r.ok, true);
  assert.equal(r.je_review.entry_id, "entry-9");
  const p = cap.writeParams;
  assert.equal(p[0], "c1", "client pinned");
  assert.equal(p[1], "res-1", "resolution fetched server-side");
  assert.equal(p[5], DOC, "document pinned from the task, not model-chosen");
  assert.equal(p[6], "sha-abc", "sha256 fetched server-side");
  assert.equal(p[8], `code-doc:task-7:${DOC}`, "stable op_key");
  assert.equal(p[9], 7, "books_version fetched server-side");
  assert.equal(p[13], "supplier_bill", "coding_kind marker");
});

test("draft wrapper refuses (CLR11) a draft naming a DIFFERENT document than the task's — no write", async () => {
  const cap = stubPools();
  const r = await runDraftJournalEntry(ctx, { ...baseInput, document_id: "99999999-9999-9999-9999-999999999999" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR11");
  assert.equal(cap.writeCalled, false, "a mismatched document never reaches the writer");
});

test("draft wrapper refuses (CLR02) when no active verified filing exists", async () => {
  stubPools({ verifiedFiling: false });
  const r = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR02");
});

test("draft wrapper maps a DB refusal (CLR23) from the writer to a typed refusal", async () => {
  stubPools({ writeThrows: Object.assign(new Error("vendor conflict"), { code: "CLR23" }) });
  const r = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR23");
});
