// Wave-A2 chatTurn_v5 journal_entry lane — unit tests for the NULL-kind mapping
// (journal_entry -> p14 NULL, optional counterparty -> p11 NULL) with STUBBED pools
// (no DB). Mirrors wave-a2-chatturn-v4-sales.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/chatTurn.v5.prompt.ts");
const toolsMod = await import("../workflows/chatTurn.v5.tools.ts");

const { draftJournalEntryInputSchema } = prompt;
const { runDraftJournalEntry } = toolsMod;

function stubPools() {
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

// A salary-accrual voucher shape: expenses debit, accrual liabilities credit, no counterparty.
const jvInput = {
  coding_kind: "journal_entry",
  posting_date: "2025-07-31",
  lines: [
    { account_code: "900-S01", debit_cents: 6000000, credit_cents: 0 },
    { account_code: "410-001", debit_cents: 0, credit_cents: 6000000 },
  ],
  document_id: "11111111-1111-4111-8111-111111111111",
  evidence: [{ region_id: "22222222-2222-4222-8222-222222222222", quote: "60,000.00" }],
};

test("v5 schema accepts journal_entry with NO counterparty and still requires coding_kind", () => {
  assert.ok(draftJournalEntryInputSchema.safeParse(jvInput).success, "journal_entry without counterparty parses");
  const withoutKind = { ...jvInput };
  delete withoutKind.coding_kind;
  assert.equal(draftJournalEntryInputSchema.safeParse(withoutKind).success, false, "coding_kind stays required");
  assert.ok(
    draftJournalEntryInputSchema.safeParse({ ...jvInput, counterparty: { existing_id: "33333333-3333-4333-8333-333333333333" } })
      .success,
    "a counterparty is still accepted when given",
  );
});

test("v5 wrapper maps journal_entry to NULL kind and NULL counterparty at the writer", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-jv" }, jvInput);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(captured.writeParams[13], null, "journal_entry maps to NULL coding_kind (p14)");
  assert.equal(captured.writeParams[10], null, "omitted counterparty maps to NULL (p11)");
});

test("v5 wrapper still passes the document kinds through verbatim", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry(
    { firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-sales" },
    {
      ...jvInput,
      coding_kind: "sales_invoice",
      lines: [
        { account_code: "300-000", debit_cents: 1000, credit_cents: 0 },
        { account_code: "500-000", debit_cents: 0, credit_cents: 1000 },
      ],
      counterparty: { existing_id: "33333333-3333-4333-8333-333333333333" },
    },
  );
  assert.equal(r.ok, true);
  assert.equal(captured.writeParams[13], "sales_invoice");
  assert.equal(captured.writeParams[10], JSON.stringify({ existing_id: "33333333-3333-4333-8333-333333333333" }));
});
