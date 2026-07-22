// Wave-A2 chatTurn_v4 sales-direction closure — unit tests for the v4 draft wrapper
// (coding_kind passthrough + the kind-neutral counterparty field) and the new CLR21
// sales reason tokens, with STUBBED pools (no DB). Mirrors s6-closure-logic.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/chatTurn.v4.prompt.ts");
const errors = await import("../workflows/chatTurn.v4.errors.ts");
const toolsMod = await import("../workflows/chatTurn.v4.tools.ts");

const { draftJournalEntryInputSchema } = prompt;
const { refusalFromDbError } = errors;
const { runDraftJournalEntry } = toolsMod;

function stubPools({ writeThrows = null } = {}) {
  const captured = { writeParams: null, writeCalled: false };
  const readClient = {
    query: async (sql) => {
      if (/from clara\.document_filings/.test(sql)) {
        return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      }
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const writeClient = {
    query: async (_sql, params) => {
      captured.writeCalled = true;
      captured.writeParams = params;
      if (writeThrows) throw writeThrows;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
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

const salesInput = {
  coding_kind: "sales_invoice",
  posting_date: "2025-04-30",
  lines: [
    { account_code: "300-000", debit_cents: 20797415, credit_cents: 0 },
    { account_code: "500-000", debit_cents: 0, credit_cents: 20797415 },
  ],
  document_id: "11111111-1111-4111-8111-111111111111",
  counterparty: { new: { name: "D & DREAM PROPERTIES SDN BHD" } },
  evidence: [{ region_id: "22222222-2222-4222-8222-222222222222", quote: "207,974.15" }],
};

test("v4 schema requires coding_kind and accepts the sales shape", () => {
  assert.ok(draftJournalEntryInputSchema.safeParse(salesInput).success, "sales_invoice input parses");
  const withoutKind = { ...salesInput };
  delete withoutKind.coding_kind;
  assert.equal(draftJournalEntryInputSchema.safeParse(withoutKind).success, false, "coding_kind is required");
  assert.equal(
    draftJournalEntryInputSchema.safeParse({ ...salesInput, coding_kind: "nonsense" }).success,
    false,
    "unknown kinds refuse",
  );
});

test("v4 wrapper passes coding_kind=sales_invoice + the counterparty through to the writer", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-sales" }, salesInput);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(captured.writeCalled, true);
  assert.equal(captured.writeParams[13], "sales_invoice", "coding_kind reaches wake_draft_entry p14");
  assert.equal(captured.writeParams[10], JSON.stringify(salesInput.counterparty), "counterparty reaches p11");
});

test("v4 wrapper still passes supplier_bill through unchanged", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry(
    { firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-bill" },
    {
      ...salesInput,
      coding_kind: "supplier_bill",
      lines: [
        { account_code: "610-000", debit_cents: 1000, credit_cents: 0 },
        { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
      ],
    },
  );
  assert.equal(r.ok, true);
  assert.equal(captured.writeParams[13], "supplier_bill");
});

test("v4 error map speaks the 0015 sales reason tokens", () => {
  const dup = refusalFromDbError({ code: "CLR21", detail: '{"reason":"duplicate_sales"}' });
  assert.equal(dup.reason, "duplicate_sales");
  assert.match(dup.message, /sales document/i);
  const dir = refusalFromDbError({ code: "CLR21", detail: '{"reason":"direction_unresolved"}' });
  assert.equal(dir.reason, "direction_unresolved");
  assert.match(dir.message, /direction/i);
  const cp = refusalFromDbError({ code: "CLR23" });
  assert.match(cp.message, /counterparty/i, "CLR23 is kind-neutral in v4");
  const clr30 = refusalFromDbError({ code: "CLR30" });
  assert.equal(clr30.code, "CLR30", "a raw CLR30 maps to a typed refusal, not the generic internal");
  assert.match(clr30.message, /direction/i);
});
