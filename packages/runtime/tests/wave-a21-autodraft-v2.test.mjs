// Wave-A2.1 autoDraft_v2 — unit tests for the PROMPT-ONLY delta (the CONDITIONAL purchase
// leg shape, and the EXISTENCE-ONLY sst_registration_watch framing this unattended lane is
// held to) AND the regression that the settle-outcome reducer, the CLR->refusal map, the
// draft wrapper and the rest of the closure are unchanged from v1.
//
// These assertions are deliberately CLAUSE-level, not keyword-level: every prohibition and
// every permission is asserted as a whole sentence with its polarity, so deleting any one of
// them fails a test. The prompt is compared with its whitespace normalised (the source is a
// hand-wrapped string array — line breaks are formatting, not meaning).
// STUBBED pools (no DB). Mirrors wave-a-autodraft-closure.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const { z } = await import("zod");
const prompt = await import("../workflows/autoDraft.v2.prompt.ts");
const promptV1 = await import("../workflows/autoDraft.v1.prompt.ts");
const errors = await import("../workflows/autoDraft.v2.errors.ts");
const toolsMod = await import("../workflows/autoDraft.v2.tools.ts");

const { toAutoDraftOutcome, isDoubleCodedReason, SYSTEM_PROMPT_AUTODRAFT_V2, DRAFT_TOOL, draftJournalEntryInputSchema } = prompt;
const { refusalFromDbError, noDraftRefusal } = errors;
const { runDraftJournalEntry, buildAutoDraftTools } = toolsMod;

/** The prompt with its hand-wrapping collapsed, so a clause can be asserted whole. */
const P2 = SYSTEM_PROMPT_AUTODRAFT_V2.replace(/\s+/g, " ");

const has = (hay, needle, why) => assert.ok(hay.includes(needle), `${why}\n  MISSING CLAUSE: ${needle}`);
const lacks = (hay, needle, why) => assert.ok(!hay.includes(needle), `${why}\n  CLAUSE MUST BE GONE: ${needle}`);

// --- the purchase leg shape is CONDITIONAL on the facts (contract §4, WA21-R1) -------

test("v2 prompt makes the purchase leg shape conditional on a STATED tax, both branches", () => {
  has(P2, "The LEG SHAPE depends on one thing — whether the bill's extracted facts STATE a tax amount.", "the conditional is the headline of the leg guidance");
  has(
    P2,
    "* NO stated tax in the facts: a TWO-leg entry — the expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same GROSS.",
    "the no-stated-tax branch is 2 legs, expense GROSS + AP GROSS",
  );
  has(
    P2,
    "* A STATED tax amount in the facts: a THREE-leg VISIBILITY split — the expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the stated tax figure from the facts",
    "the stated-tax branch is 3 legs: expense NET + exactly one tied tax leg equal to the stated tax",
  );
  has(
    P2,
    "(choose the account carrying the sst_purchase_cost special type in the chart of accounts), and the Accounts Payable CREDIT for the GROSS.",
    "the tied leg is the sst_purchase_cost account and AP stays GROSS",
  );
  has(
    P2,
    "When the facts state a tax amount NEVER put the gross on the expense leg and NEVER drop the tied tax leg; when they state none, NEVER invent one.",
    "the three failure modes (gross-with-tax, dropped tax leg, invented tax) are each forbidden",
  );
});

test("v2 prompt carries no UNCONDITIONAL gross-to-expense instruction (the v1 contradiction)", () => {
  lacks(P2, "Draft the entry GROSS to the expense account code(s)", "the unconditional gross-to-expense rule contradicted the 3-leg split");
});

test("v2 prompt keeps the SST doctrine guards and the purchase-only direction", () => {
  has(P2, "Malaysian SST has NO input-tax credit", "the no-input-tax-credit doctrine (WA21-R1)");
  has(P2, "the tax leg is a visibility split of the expense cost, never a recoverable asset and never an sst_output leg.", "never a recoverable asset, never sst_output");
  has(P2, "This sweep only ever codes a supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.", "purchase-direction vocabulary");
  has(P2, "The database owns every number: never compute, sum, or invent a figure", "the cardinal invariant is still stated");
});

// --- the watch framing in the UNATTENDED lane is EXISTENCE-ONLY (contract §2.3 floor) --
// No human reads this run's output before it lands, so the safety floor is stricter than the
// attended chat lane: the sweep may say a watch is open and nothing else about it.

test("v2 prompt allows only an existence-level mention of the watch", () => {
  has(
    P2,
    "Because no human is watching this run, the ONLY thing you may ever say about it is that an SST registration watch is OPEN for this client and that the professional handles it in the review queue.",
    "the single permitted statement is existence + the review queue",
  );
});

test("v2 prompt forbids quoting anything from the watch and drawing any conclusion", () => {
  has(P2, "NEVER quote any figure, status, tier, window, or deadline from it,", "no figure, status/tier, window or deadline may be quoted");
  has(
    P2,
    'NEVER draw ANY conclusion from it: no liability, no registration status, no tax computation, no multiplying by 8%, no threshold judgement, no future-method inference, and never "below threshold" or "no issue".',
    "every conclusion class is forbidden individually, including the false-comfort phrasings (WA21-R6)",
  );
  has(P2, "This unattended sweep NEVER acts on it — surfacing and professional review belong to the attended chat lane.", "the never-acts rule and where surfacing belongs");
  lacks(P2, "You may MENTION it in the draft's note or rationale with", "the figure-with-a-label permission is withdrawn in the unattended lane");
  lacks(P2, "DB-computed screening estimate", "a basis label is only needed to quote a figure — which this lane may never do");
});

// --- the unattended lane has no human-in-the-loop primitive and stops at one draft ----

test("v2 has NO clarify and NO park tool — the sweep is unattended", () => {
  const tools = buildAutoDraftTools({ firmId: "F", clientId: "c1", documentId: "d", filingId: "fil-1", taskId: "task-7" });
  const names = Object.keys(tools);
  assert.deepEqual(names.filter((n) => /clarify|park|ask|question/i.test(n)), [], `no human-in-the-loop tool may exist: got ${names.join(",")}`);
  assert.ok(names.includes(DRAFT_TOOL), "the draft tool is present");
  lacks(P2, "call `clarify`", "the prompt must not instruct a clarify this lane cannot make");
  has(
    P2,
    "DO NOT draft and DO NOT guess: reply with a short plain-text explanation of exactly what is blocking the draft.",
    "the unattended non-draft path is a truthful explanation, not a guess",
  );
});

test("v2 model loop stops after the FIRST successful draft", () => {
  const impl = readFileSync(new URL("../workflows/autoDraft.v2.impl.ts", import.meta.url), "utf8");
  assert.match(impl, /stopWhen: \[stepCountIs\(8\), stoppedOnSuccessfulDraft\]/, "the loop is bounded and stops on a successful draft");
  assert.match(
    impl,
    /r\.toolName === DRAFT_TOOL && !!r\.output && typeof r\.output === "object" && \(r\.output as \{ ok\?: unknown \}\)\.ok === true/,
    "the stop predicate fires on a SUCCESSFUL draft result only (a refusal may still be explained)",
  );
});

// --- the model-facing SCHEMA + TOOL surface teach the same conditional ---------------

test("v2 draft schema + tool descriptions teach the conditional purchase leg shape", () => {
  const lines = draftJournalEntryInputSchema.shape.lines.description;
  has(lines, "When the facts state NO tax: expense debit(s) GROSS + one Accounts Payable credit GROSS (two legs).", "schema: the 2-leg branch");
  has(
    lines,
    "When the facts STATE a tax: expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY to the stated tax + one Accounts Payable credit GROSS (three legs) — never gross-to-expense with a tax leg, never a dropped tax leg.",
    "schema: the 3-leg branch with both failure modes forbidden",
  );
  const desc = buildAutoDraftTools({ firmId: "F", clientId: "c1", documentId: "d", filingId: "fil-1", taskId: "task-7" })[DRAFT_TOOL].description;
  has(desc, "with NO stated tax in the facts, expense debit(s) GROSS + a credit to Accounts Payable GROSS with the vendor", "tool description: the 2-leg branch");
  has(
    desc,
    "with a STATED tax, expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY to the stated tax + the Accounts Payable credit GROSS",
    "tool description: the 3-leg branch",
  );
  lacks(desc, "(gross to expense + a credit to Accounts Payable with the vendor)", "the unconditional v1 wording is gone");
});

// --- the draft schema STRUCTURE is identical to v1 (regression) ----------------------
// Structure only: field names and types. The description TEXT is deliberately NOT byte-
// identical to v1 (it carries the conditional purchase-leg rule above), so both schemas are
// compared as JSON Schema with every `description` stripped.

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

test("v2 draft schema structure (fields + types) is identical to v1", () => {
  assert.deepEqual(
    structureOf(draftJournalEntryInputSchema),
    structureOf(promptV1.draftJournalEntryInputSchema),
    "the v2 draft schema STRUCTURE must not drift from v1",
  );
});

// --- the rest of the closure is identical to v1 (regression) -------------------------

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
/** v1 named the prompt export SYSTEM_PROMPT_AUTODRAFT; v2 suffixes it — a rename, not a delta. */
const asVN = (text, n) => text.replaceAll("SYSTEM_PROMPT_AUTODRAFT_V2", "SYSTEM_PROMPT_AUTODRAFT").replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");

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

test("v2 closure (impl/infra/errors) is token-for-token identical to v1", () => {
  for (const part of ["impl", "infra", "errors"]) {
    assert.equal(
      asVN(src(`autoDraft.v2.${part}.ts`), 2),
      asVN(src(`autoDraft.v1.${part}.ts`), 1),
      `autoDraft.v2.${part}.ts must be a version-renamed copy of v1 — v2 is a PROMPT-ONLY delta`,
    );
  }
});

test("v2 tools file differs from v1 ONLY in the draft tool's description", () => {
  assert.equal(
    maskDraftToolDescription(asVN(src("autoDraft.v2.tools.ts"), 2)),
    maskDraftToolDescription(asVN(src("autoDraft.v1.tools.ts"), 1)),
    "outside the draft tool's description, v2 tools must be a version-renamed copy of v1",
  );
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
