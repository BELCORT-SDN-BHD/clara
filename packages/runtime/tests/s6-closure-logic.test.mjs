// Slice-6 chatTurn_v2 closure logic — unit tests for the FROZEN TypeScript closure
// (part promotion + dedup, the CLR->refusal map, and the draft_journal_entry wrapper)
// with STUBBED pools (no DB, no 0009). The .ts modules are loaded through tsx's ESM
// loader; only prompt/errors/tools/infra are touched (none import "workflow"), so no
// world context is needed.

import { test, before } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/chatTurn.v2.prompt.ts");
const errors = await import("../workflows/chatTurn.v2.errors.ts");
const toolsMod = await import("../workflows/chatTurn.v2.tools.ts");

const { toTypedParts_v2, hasCodingIntent, findClarifyCall, attachmentStub, DRAFT_TOOL } = prompt;
const { refusalFromDbError, readToolRefusalMessage, isAuthorityOrOracleError, sessionUnboundRefusal } = errors;
const { runDraftJournalEntry } = toolsMod;

// --- part promotion + dedup (C-19) -----------------------------------------

test("toTypedParts_v2 promotes a successful draft tool result to a top-level je_review part", () => {
  const je = { type: "je_review", entry_id: "e1", revision_token: "t1", client_id: "c1", document_id: "d1", provenance_tier: "model_read" };
  const content = [
    { type: "tool-call", toolCallId: "x", toolName: DRAFT_TOOL, input: {} },
    { type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: true, je_review: je } },
  ];
  const parts = toTypedParts_v2(content);
  assert.equal(parts.filter((p) => p.type === "je_review").length, 1, "exactly one je_review promoted");
  assert.ok(parts.some((p) => p.type === "tool_result"), "the tool_result part is still present");
  assert.equal(parts.find((p) => p.type === "je_review").entry_id, "e1");
});

test("toTypedParts_v2 promotes a refused draft tool result to a top-level refusal part", () => {
  const refusal = { type: "refusal", code: "CLR21", reason: "amount_conflict", message: "no" };
  const content = [{ type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: false, refusal } }];
  const parts = toTypedParts_v2(content);
  assert.equal(parts.filter((p) => p.type === "refusal").length, 1);
  assert.equal(parts.find((p) => p.type === "refusal").reason, "amount_conflict");
});

test("toTypedParts_v2 dedups a repeated je_review (replay safety)", () => {
  const je = { type: "je_review", entry_id: "e1", revision_token: "t1", client_id: "c1", document_id: "d1", provenance_tier: "verified" };
  const content = [
    { type: "tool-result", toolCallId: "a", toolName: DRAFT_TOOL, output: { ok: true, je_review: je } },
    { type: "tool-result", toolCallId: "b", toolName: DRAFT_TOOL, output: { ok: true, je_review: je } },
  ];
  assert.equal(toTypedParts_v2(content).filter((p) => p.type === "je_review").length, 1, "deduped by entry_id");
});

test("hasCodingIntent / findClarifyCall / attachmentStub", () => {
  assert.equal(hasCodingIntent([{ type: "tool-call", toolName: DRAFT_TOOL, toolCallId: "z", input: {} }]), true);
  assert.equal(hasCodingIntent([{ type: "text", text: "hi" }]), false);
  const c = findClarifyCall([{ type: "tool-call", toolName: "clarify", toolCallId: "q", input: { question: "which?" } }]);
  assert.equal(c.question, "which?");
  assert.match(attachmentStub("doc-1"), /\[attachment: doc-1\]/);
  assert.match(attachmentStub("doc-1"), /read_document/);
});

// --- the CLR -> typed refusal map (per-layer, oracle-safe) ------------------

test("refusalFromDbError maps CLR21 with a DETAIL reason token", () => {
  const r = refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' });
  assert.equal(r.type, "refusal");
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "currency_unsupported");
  assert.ok(r.message.length > 0);
});

test("refusalFromDbError maps native constraints + structural 42501 (belt), never leaking SQL", () => {
  assert.equal(refusalFromDbError({ code: "23505", constraint: "counterparties_client_reg_uniq" }).code, "CLR23");
  assert.equal(refusalFromDbError({ code: "23505", constraint: "journal_entries_one_open_draft" }).reason, "double_coded");
  assert.equal(refusalFromDbError({ code: "23503" }).code, "CLR11", "FK breach collapses to not-found (no tenant oracle)");
  assert.equal(refusalFromDbError({ code: "42501" }).code, "CLR03", "structural agent-writer denial stays distinct");
  assert.equal(refusalFromDbError({ code: "CLR25" }).code, "CLR25");
  const generic = refusalFromDbError({ code: "SOMETHINGELSE", message: "select * from secret" });
  assert.equal(generic.code, "internal");
  assert.doesNotMatch(generic.message, /select/i, "no SQL text leaks");
});

test("readToolRefusalMessage is oracle-safe + isAuthorityOrOracleError classifies", () => {
  assert.equal(readToolRefusalMessage({ code: "CLR03" }), readToolRefusalMessage({ code: "42501" }));
  assert.ok(isAuthorityOrOracleError({ code: "CLR11" }));
  assert.ok(!isAuthorityOrOracleError({ code: "CLR07" }));
  assert.equal(sessionUnboundRefusal().reason, "session_unbound");
});

// --- the draft_journal_entry wrapper (stubbed pools) -----------------------

function stubPools({ extract = null, verifiedFiling = true, writeThrows = null } = {}) {
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
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9", status: "draft", filing_id: "fil-1" } }], rowCount: 1 };
    },
  };
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
    withRuntime: async (fn) => fn(readClient),
  };
  return captured;
}

const baseInput = {
  posting_date: "2025-10-15",
  lines: [
    { account_code: "600-000", debit_cents: 1000, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
  ],
  document_id: "11111111-1111-1111-1111-111111111111",
  vendor: { new: { name: "BRIGHTPATH SDN BHD" } },
  evidence: [{ region_id: "22222222-2222-2222-2222-222222222222", quote: "435,560.00" }],
};

test("draft wrapper refuses (session_unbound) with no client bound", async () => {
  stubPools();
  const r = await runDraftJournalEntry({ firmId: "f", clientId: null, createdBy: "u", taskId: "t1" }, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "session_unbound");
});

test("draft wrapper success path returns a je_review + fetches sha256/books/op_key server-side", async () => {
  const cap = stubPools({ extract: null }); // no verified total -> Tier B
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "task-7" }, baseInput);
  assert.equal(r.ok, true);
  assert.equal(r.je_review.entry_id, "entry-9");
  assert.equal(r.je_review.revision_token, "rev-9");
  assert.equal(r.je_review.provenance_tier, "model_read");
  // The model NEVER supplies these; the wrapper fetched/stamped them.
  const p = cap.writeParams;
  assert.equal(p[1], "res-1", "resolution fetched server-side");
  assert.equal(p[6], "sha-abc", "sha256 fetched server-side");
  assert.equal(p[8], "code-doc:task-7:11111111-1111-1111-1111-111111111111", "stable op_key");
  assert.equal(String(p[7]), "{}", "flags");
  assert.equal(p[9], 7, "books_version fetched server-side");
  assert.equal(p[13], "supplier_bill", "coding_kind marker stamped");
});

test("draft wrapper refuses non-MYR currency at either tier (before any write)", async () => {
  const cap = stubPools({ extract: { invoice_facts: { currency: "USD" } } });
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t" }, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "currency_unsupported");
  assert.equal(cap.writeCalled, false, "no draft is attempted on a currency refusal");
});

test("draft wrapper refuses amount_conflict on a Tier-A total mismatch", async () => {
  const cap = stubPools({ extract: { invoice_facts: { currency: "MYR", total: { cents: 500 } } } });
  // proposed credit total = 1000 != verified 500.
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t" }, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "amount_conflict");
  assert.equal(cap.writeCalled, false);
});

test("draft wrapper maps a DB refusal (CLR23) from the writer to a typed refusal", async () => {
  stubPools({ extract: null, writeThrows: Object.assign(new Error("vendor conflict"), { code: "CLR23" }) });
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t" }, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR23");
});

test("draft wrapper refuses (CLR02) when no active verified filing exists", async () => {
  stubPools({ verifiedFiling: false });
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t" }, baseInput);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR02");
});

before(() => {
  // isolate globalThis pollution between files
});
