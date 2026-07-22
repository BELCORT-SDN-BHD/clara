// Wave-A2.1 chatTurn_v6 — unit tests for the PROMPT-ONLY delta (SST registration-watch
// surfacing framing, purchase 3-leg visibility-split guidance, direction-first vocabulary)
// AND the regression that the draft schema + tool mapping are byte-identical to v5 (the
// journal_entry -> p14 NULL, optional counterparty -> p11 NULL, document kinds passthrough).
// STUBBED pools (no DB). Mirrors wave-a2-chatturn-v5-journal.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/chatTurn.v6.prompt.ts");
const toolsMod = await import("../workflows/chatTurn.v6.tools.ts");

const { draftJournalEntryInputSchema, SYSTEM_PROMPT_V6 } = prompt;
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

// --- the v6 PROMPT delta (the load-bearing framing) ------------------------

test("v6 prompt teaches SST registration-watch surfacing with basis label + the hard nots", () => {
  assert.match(SYSTEM_PROMPT_V6, /sst_registration_watch/, "names the context-pack block");
  assert.match(SYSTEM_PROMPT_V6, /a DB-computed screening estimate/, "carries the basis label verbatim");
  assert.match(SYSTEM_PROMPT_V6, /surface_and_request_professional_review_only/, "honors the permitted_use token");
  assert.match(SYSTEM_PROMPT_V6, /unprompted/i, "instructs unprompted surfacing (Gate W headline)");
  assert.match(SYSTEM_PROMPT_V6, /never multiply it by 8%/i, "forbids the ×8% tax-due computation");
  assert.match(SYSTEM_PROMPT_V6, /legal determination/i, "forbids presenting it as a legal determination");
  assert.match(SYSTEM_PROMPT_V6, /infer or assert a registration status/i, "forbids inferring registration status");
  assert.match(SYSTEM_PROMPT_V6, /Service Tax Act 2018/, "relays the s.13 deadline citation as the DB states it");
});

test("v6 prompt teaches the purchase 3-leg visibility split (WA21-R1)", () => {
  assert.match(SYSTEM_PROMPT_V6, /visibility split/i, "frames the split");
  assert.match(SYSTEM_PROMPT_V6, /NO input-tax credit/i, "states the no-input-tax-credit doctrine");
  assert.match(SYSTEM_PROMPT_V6, /sst_purchase_cost/, "points at the special-type account by name");
  assert.match(SYSTEM_PROMPT_V6, /human-review-only/i, "notes the lane is never autoposted");
  assert.match(SYSTEM_PROMPT_V6, /never invent a tax figure/i, "forbids inventing an unstated tax figure");
});

test("v6 prompt tightens direction-first vocabulary (customer/vendor, evidence-led)", () => {
  assert.match(SYSTEM_PROMPT_V6, /CUSTOMER on a sales-direction document/, "customer for sales");
  assert.match(SYSTEM_PROMPT_V6, /VENDOR on a purchase-direction document/, "vendor for purchase");
  assert.match(SYSTEM_PROMPT_V6, /never the caller-selected coding_kind/, "direction follows evidence, not the caller's kind");
});

// --- the draft schema + tool mapping are UNCHANGED from v5 (regression) ----

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

test("v6 schema accepts journal_entry with NO counterparty and still requires coding_kind", () => {
  assert.ok(draftJournalEntryInputSchema.safeParse(jvInput).success, "journal_entry without counterparty parses");
  const withoutKind = { ...jvInput };
  delete withoutKind.coding_kind;
  assert.equal(draftJournalEntryInputSchema.safeParse(withoutKind).success, false, "coding_kind stays required");
  assert.equal(
    draftJournalEntryInputSchema.safeParse({ ...jvInput, coding_kind: "nonsense" }).success,
    false,
    "unknown kinds still refuse",
  );
});

test("v6 wrapper maps journal_entry to NULL kind and NULL counterparty at the writer", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry({ firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-jv" }, jvInput);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(captured.writeParams[13], null, "journal_entry maps to NULL coding_kind (p14)");
  assert.equal(captured.writeParams[10], null, "omitted counterparty maps to NULL (p11)");
});

test("v6 wrapper still passes the document kinds + counterparty through verbatim", async () => {
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
  assert.equal(captured.writeParams[13], "sales_invoice", "coding_kind reaches wake_draft_entry p14");
  assert.equal(captured.writeParams[10], JSON.stringify({ existing_id: "33333333-3333-4333-8333-333333333333" }), "counterparty reaches p11");
});
