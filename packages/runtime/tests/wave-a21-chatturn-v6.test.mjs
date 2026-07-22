// Wave-A2.1 chatTurn_v6 — unit tests for the PROMPT-ONLY delta (SST registration-watch
// surfacing framing, the CONDITIONAL purchase leg shape, direction-first vocabulary) AND
// the regression that the draft schema STRUCTURE + the tool mapping + the rest of the
// closure are unchanged from v5.
//
// These assertions are deliberately CLAUSE-level, not keyword-level: every prohibition and
// every permission is asserted as a whole sentence with its polarity, so deleting any one of
// them fails a test. The prompt is compared with its whitespace normalised (the source is a
// hand-wrapped string array — line breaks are formatting, not meaning).
// STUBBED pools (no DB). Mirrors wave-a2-chatturn-v5-journal.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const { z } = await import("zod");
const prompt = await import("../workflows/chatTurn.v6.prompt.ts");
const promptV5 = await import("../workflows/chatTurn.v5.prompt.ts");
const toolsMod = await import("../workflows/chatTurn.v6.tools.ts");

const { draftJournalEntryInputSchema, SYSTEM_PROMPT_V6 } = prompt;
const { runDraftJournalEntry, buildToolsV6 } = toolsMod;

/** The prompt with its hand-wrapping collapsed, so a clause can be asserted whole. */
const P6 = SYSTEM_PROMPT_V6.replace(/\s+/g, " ");

const has = (hay, needle, why) => assert.ok(hay.includes(needle), `${why}\n  MISSING CLAUSE: ${needle}`);
const lacks = (hay, needle, why) => assert.ok(!hay.includes(needle), `${why}\n  CLAUSE MUST BE GONE: ${needle}`);

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

// --- the purchase leg shape is CONDITIONAL on the facts (contract §4, WA21-R1) -------

test("v6 prompt makes the purchase leg shape conditional on a STATED tax, both branches", () => {
  has(P6, "The LEG SHAPE depends on one thing — whether the document's extracted facts STATE a tax amount.", "the conditional is the headline of the supplier-bill lane");
  has(
    P6,
    "* NO stated tax in the facts: a TWO-leg entry — the expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same GROSS.",
    "the no-stated-tax branch is 2 legs, expense GROSS + AP GROSS",
  );
  has(
    P6,
    "* A STATED tax amount in the facts: a THREE-leg visibility split — the expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the stated tax figure from the facts",
    "the stated-tax branch is 3 legs: expense NET + exactly one tied tax leg equal to the stated tax",
  );
  has(
    P6,
    "(choose the account carrying the sst_purchase_cost special type in the chart of accounts), and the Accounts Payable CREDIT for the GROSS.",
    "the tied leg is the sst_purchase_cost account and AP stays GROSS",
  );
  has(
    P6,
    "When the facts state a tax amount NEVER put the gross on the expense leg and NEVER drop the tied tax leg; when they state none, NEVER invent one.",
    "the three failure modes (gross-with-tax, dropped tax leg, invented tax) are each forbidden",
  );
});

test("v6 prompt carries no UNCONDITIONAL gross-to-expense instruction (the v5 contradiction)", () => {
  lacks(P6, "propose the entry GROSS to expense with an equal credit to the", "the unconditional gross-to-expense rule contradicted the 3-leg split");
});

test("v6 prompt keeps the SST doctrine guards on the purchase tax leg", () => {
  has(P6, "Malaysian SST has NO input-tax credit", "the no-input-tax-credit doctrine (WA21-R1)");
  has(P6, "the tax leg is a VISIBILITY split of the expense cost, never a recoverable asset, and never an sst_output leg (output tax is sales-only).", "never a recoverable asset, never sst_output");
  has(P6, "A stated-tax purchase draft is human-review-only (it is never autoposted).", "no purchase autopost sanction in this wave");
});

// --- the SST registration watch: what may be said, and what may never be -------------

test("v6 prompt requires unprompted surfacing with basis AND verification status together", () => {
  has(P6, "SURFACE IT UNPROMPTED:", "the watch is surfaced unprompted (Gate W headline)");
  has(P6, "point the professional to the review queue.", "surfacing routes to the review queue");
  has(
    P6,
    'When you quote any figure, ALWAYS pair it with its basis label ("a DB-computed screening estimate") and its verification status (the coverage / future-method attestation state) — a figure without BOTH is never acceptable.',
    "a quoted figure needs BOTH the basis label and the verification status",
  );
  has(P6, 'basis "db_computed_screening_estimate", permitted_use "surface_and_request_professional_review_only"', "the DB's own basis + permitted_use tokens are named");
});

test("v6 prompt forbids each watch misuse individually", () => {
  has(P6, "NEVER present it as a legal determination of SST liability;", "never a legal determination");
  has(P6, "NEVER multiply it by 8% or compute tax due;", "never the ×8% tax-due computation");
  has(P6, "NEVER infer or assert a registration status (that is sticky, human-recorded state).", "never infer OR assert a registration status");
  has(P6, "The only permitted use is to surface it and request professional review.", "the permitted_use ceiling is stated in prose");
});

test("v6 prompt relays ONLY the watch's own explicit fields — no model-sourced statute", () => {
  has(
    P6,
    "Relay ONLY the explicit, non-null fields the watch block itself carries, verbatim and never recomputed — `application_due` is the ONE deadline field it supplies.",
    "only non-null fields that exist in the block; application_due is the single deadline field 0016 supplies",
  );
  has(
    P6,
    "Every other statutory deadline, rate, period or citation belongs to the professional and to the review-queue card, which renders the statutory qualification independently of you: NEVER assert one from your own knowledge, and NEVER state a deadline for a field the block leaves null.",
    "any other statute is the professional's and the card's, never the model's",
  );
  // 0016's get_context_pack watch block supplies application_due and NOTHING about when tax
  // becomes chargeable, and carries no citation field — so the prompt must not hard-code either.
  lacks(P6, "M+1", "the M+1 formula is not a field the DB states");
  lacks(P6, "M+2", "the M+2 tax-chargeable formula is not a field the DB states");
  lacks(P6, "Service Tax Act", "the statutory citation is not a field the DB states");
  lacks(P6, "with their citations", "the block carries no citation field to relay");
});

test("v6 prompt states the future-method law (WA21-R6) with its false-comfort prohibition", () => {
  has(P6, "`future_method_status` is HUMAN-ATTESTED or `not_assessed`.", "the future method is attested or not assessed — never a third thing");
  has(P6, "NEVER infer the future method from ledger trends, historical figures, or anything else,", "never inferred from ledger trends");
  has(
    P6,
    'NEVER describe a client as "below threshold", "not liable", or "no issue" when the future method is unassessed or its attestation is absent or expired',
    "no false comfort while the future method is unassessed/absent/expired",
  );
  has(P6, "say the future method has not been attested and send the professional to the review queue.", "the honest alternative is named");
});

// --- professional vigilance stays evidence-shaped, never a threshold judgement -------

test("v6 vigilance surfaces evidence inconsistency, never an independent taxability call", () => {
  has(
    P6,
    "a document whose stated tax is missing or inconsistent with its own stated figures, a date/total inconsistency, or a counterparty name change.",
    "the vigilance examples are internal-evidence inconsistencies (date/total + rename preserved)",
  );
  has(
    P6,
    "You NEVER determine taxability, a registration threshold, or a threshold crossing yourself: that is DB-owned (the SST registration watch below) and professional judgement — point at the watch and the review queue instead.",
    "taxability and threshold crossings are DB-owned, not model-determined",
  );
  has(P6, "A surfaced anomaly is a note or a clarify, NEVER a figure you compute or book.", "the inherited compute/book prohibition is preserved");
  lacks(P6, "above the SST registration threshold with no SST charged", "the old example invited an independent threshold judgement");
});

// --- direction-first vocabulary (contract §6.2) --------------------------------------

test("v6 prompt keeps direction-first vocabulary, evidence-led not caller-led", () => {
  has(P6, "the CUSTOMER on a sales-direction document, the VENDOR on a purchase-direction document.", "customer for sales, vendor for purchase");
  has(P6, "Direction follows the counterparty and document evidence, never the caller-selected coding_kind.", "direction follows evidence, not the caller's coding_kind");
  has(P6, "The database owns every number: never compute, sum, or invent a figure", "the cardinal invariant is still stated");
});

// --- the model-facing SCHEMA surface teaches the same conditional --------------------
// The zod .describe() text is prompt surface the model reads alongside the system prompt: a
// schema description that still said "expense debit(s) gross" would re-introduce finding 1.

test("v6 draft schema descriptions teach the conditional purchase leg shape", () => {
  const lines = draftJournalEntryInputSchema.shape.lines.description;
  has(lines, "supplier_bill when the facts state NO tax: expense debit(s) GROSS + one Accounts Payable credit GROSS (two legs).", "schema: the 2-leg branch");
  has(
    lines,
    "supplier_bill when the facts STATE a tax: expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY to the stated tax + one Accounts Payable credit GROSS (three legs) — never gross-to-expense with a tax leg, never a dropped tax leg.",
    "schema: the 3-leg branch with both failure modes forbidden",
  );
  const kind = draftJournalEntryInputSchema.shape.coding_kind.description;
  has(kind, "expense GROSS when the facts state NO tax; expense NET plus one tied sst_purchase_cost debit when they STATE a tax", "coding_kind description: the same conditional");
});

test("v6 draft TOOL description teaches the conditional purchase leg shape", () => {
  const tools = buildToolsV6({ firmId: "f", clientId: "c1", createdBy: "u" });
  const desc = tools.draft_journal_entry.description;
  has(desc, "with NO stated tax in the facts, expense debit(s) GROSS + an Accounts Payable credit GROSS with the supplier", "tool description: the 2-leg branch");
  has(
    desc,
    "with a STATED tax, expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY to the stated tax + the Accounts Payable credit GROSS",
    "tool description: the 3-leg branch",
  );
  lacks(desc, "a supplier bill (gross to expense + an Accounts Payable credit with the supplier)", "the unconditional v5 wording is gone");
});

// --- the draft schema STRUCTURE is identical to v5 (regression) ----------------------
// Structure only: field names, types and enum members. The description TEXT is deliberately
// NOT byte-identical to v5 (it carries the conditional purchase-leg rule above), so both
// schemas are compared as JSON Schema with every `description` stripped.

function structureOf(schema) {
  const strip = (n) => {
    if (Array.isArray(n)) return n.map(strip);
    if (n && typeof n === "object") {
      const out = {};
      for (const k of Object.keys(n)) {
        if (k === "description") continue;
        out[k] = strip(n[k]);
      }
      return out;
    }
    return n;
  };
  return strip(z.toJSONSchema(schema));
}

test("v6 draft schema structure (fields + enum members) is identical to v5", () => {
  const v6 = structureOf(draftJournalEntryInputSchema);
  const v5 = structureOf(promptV5.draftJournalEntryInputSchema);
  assert.deepEqual(v6, v5, "the v6 draft schema STRUCTURE must not drift from v5");
  assert.deepEqual(
    v6.properties.coding_kind.enum,
    ["supplier_bill", "sales_invoice", "sales_credit_note", "journal_entry"],
    "the four coding kinds are unchanged",
  );
});

// --- the rest of the closure is identical to v5 (regression) -------------------------

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");

/** Mask ONLY the draft tool's `description:` string — the one place finding 1 required a
 *  model-facing wording change inside an otherwise byte-frozen closure file. Everything
 *  before `[DRAFT_TOOL]: tool({` and from its `inputSchema:` onward is compared verbatim. */
function maskDraftToolDescription(text) {
  const start = text.indexOf("[DRAFT_TOOL]: tool({");
  assert.ok(start > 0, "the draft tool registration is present");
  const schemaAt = text.indexOf("inputSchema:", start);
  assert.ok(schemaAt > start, "the draft tool's inputSchema follows its description");
  return `${text.slice(0, start)}<DRAFT_TOOL description — compared separately>${text.slice(schemaAt)}`;
}

test("v6 closure (impl/infra/errors) is token-for-token identical to v5", () => {
  for (const part of ["impl", "infra", "errors"]) {
    assert.equal(
      asVN(src(`chatTurn.v6.${part}.ts`), 6),
      asVN(src(`chatTurn.v5.${part}.ts`), 5),
      `chatTurn.v6.${part}.ts must be a version-renamed copy of v5 — v6 is a PROMPT-ONLY delta`,
    );
  }
});

test("v6 tools file differs from v5 ONLY in the draft tool's description", () => {
  assert.equal(
    maskDraftToolDescription(asVN(src("chatTurn.v6.tools.ts"), 6)),
    maskDraftToolDescription(asVN(src("chatTurn.v5.tools.ts"), 5)),
    "outside the draft tool's description, v6 tools must be a version-renamed copy of v5",
  );
});

// --- the draft schema + tool mapping behave exactly as v5 (regression) ---------------

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
