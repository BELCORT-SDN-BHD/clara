// Wave B autoDraft_v3 — unit tests for the wiki-aware pack delta (ADR-032, WB-R7,
// FORK-6, AMB-1/AMB-2, WB-R6(4)) AND the regression that every v2 clause, the draft
// schema STRUCTURE, the settle-outcome reducer, the CLR->refusal map, the draft
// wrapper, and the rest of the closure are unchanged from v2.
//
// Prompt assertions are deliberately CLAUSE-level, not keyword-level: every prohibition
// and every permission is asserted as a whole sentence with its polarity, so deleting any
// one of them fails a test. The prompt is compared with its whitespace normalised (the
// source is a hand-wrapped string array — line breaks are formatting, not meaning).
// STUBBED pools (no DB). Mirrors wave-a21-autodraft-v2.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const { z } = await import("zod");
const prompt = await import("../workflows/autoDraft.v3.prompt.ts");
const promptV2 = await import("../workflows/autoDraft.v2.prompt.ts");
const errors = await import("../workflows/autoDraft.v3.errors.ts");
const toolsMod = await import("../workflows/autoDraft.v3.tools.ts");
const toolsV2Mod = await import("../workflows/autoDraft.v2.tools.ts");

const { toAutoDraftOutcome, isDoubleCodedReason, SYSTEM_PROMPT_AUTODRAFT_V3, DRAFT_TOOL, draftJournalEntryInputSchema } = prompt;
const { refusalFromDbError, noDraftRefusal } = errors;
const { runDraftJournalEntry, buildAutoDraftTools } = toolsMod;
const { buildAutoDraftTools: buildAutoDraftToolsV2 } = toolsV2Mod;

/** The prompt with its hand-wrapping collapsed, so a clause can be asserted whole. */
const P3 = SYSTEM_PROMPT_AUTODRAFT_V3.replace(/\s+/g, " ");

const has = (hay, needle, why) => assert.ok(hay.includes(needle), `${why}\n  MISSING CLAUSE: ${needle}`);
const lacks = (hay, needle, why) => assert.ok(!hay.includes(needle), `${why}\n  CLAUSE MUST BE GONE: ${needle}`);

// ===========================================================================
// A stub pools rig. Every read client logs its calls IN ORDER (sql + params) so the
// FORK-6 GUC-before-pack ordering can be asserted, not just the end result.
// ===========================================================================

const DOC = "11111111-1111-1111-1111-111111111111";
const ctx = { firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7" };
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

function makeLoggingReadClient({ pack, extract = null }) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/select set_config/.test(sql)) return { rows: [{ set_config: params?.[0] }], rowCount: 1 };
      if (/from clara\.document_filings/.test(sql)) {
        return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      }
      if (/get_context_pack/.test(sql)) return { rows: [{ pack }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: extract }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, calls };
}

function stubPools({ readClient }) {
  const write = { params: null, called: false };
  const writeClient = {
    query: async (_sql, params) => {
      write.called = true;
      write.params = params;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
    },
  };
  const mintClient = { query: async () => ({ rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 }) };
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn(mintClient),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
  };
  return write;
}

// ===========================================================================
// FORK-6 GUC ordering + AMB-1 purpose literal — the model-facing get_context_pack TOOL
// ===========================================================================

test("v3 get_context_pack TOOL: set_config('clara.pack_consumer','v25',true) fires BEFORE the pack select, on the SAME client, and the pack call carries purpose wiki_coding", async () => {
  const { client, calls } = makeLoggingReadClient({ pack: { books_version: 7 } });
  stubPools({ readClient: client });
  const tools = buildAutoDraftTools(ctx);
  const result = await tools.get_context_pack.execute({});
  assert.ok(!("error" in (result ?? {})), `expected a pack result, got ${JSON.stringify(result)}`);

  const gucIdx = calls.findIndex((c) => /select set_config/.test(c.sql));
  const packIdx = calls.findIndex((c) => /get_context_pack/.test(c.sql));
  assert.ok(gucIdx >= 0, "the pack_consumer GUC must be set");
  assert.ok(packIdx >= 0, "the pack select must run");
  assert.ok(gucIdx < packIdx, "the GUC set_config must fire BEFORE the pack select, in the same transaction");
  assert.equal(calls[gucIdx].params[0], "v25", "the marker value is the literal 'v25'");
  assert.match(calls[gucIdx].sql, /clara\.pack_consumer/, "the GUC set targets clara.pack_consumer");
  assert.equal(calls[packIdx].params[0], "c1", "the pack call targets the SAME client the GUC was set for");
  assert.equal(calls[packIdx].params[1], "wiki_coding", "the tool's pack fetch carries purpose 'wiki_coding' (AMB-1)");
});

test("v3 get_context_pack TOOL inputSchema refuses every purpose value except the literal 'wiki_coding'", () => {
  const tools = buildAutoDraftTools(ctx);
  const schema = tools.get_context_pack.inputSchema;
  assert.equal(schema.safeParse({}).success, true, "omitting purpose is allowed");
  assert.equal(schema.safeParse({ purpose: "wiki_coding" }).success, true, "the literal value is allowed");
  for (const bad of ["chat", "coding", "wiki", "WIKI_CODING", "", "anything-a-model-might-say"]) {
    assert.equal(
      schema.safeParse({ purpose: bad }).success,
      false,
      `a model-supplied free string ("${bad}") must be structurally refused by the schema`,
    );
  }
});

// ===========================================================================
// AMB-1 wiki-dark: the server-side draft-wrapper re-fetch KEEPS purpose "coding" and
// NEVER sets the GUC — it only needs books_version.
// ===========================================================================

test("v3 draft-wrapper re-fetch stays purpose 'coding' and NEVER sets clara.pack_consumer (AMB-1 wiki-dark)", async () => {
  const { client, calls } = makeLoggingReadClient({ pack: { books_version: 7 } });
  const write = stubPools({ readClient: client });
  const r = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(write.called, true);

  const gucCalls = calls.filter((c) => /select set_config/.test(c.sql));
  assert.equal(gucCalls.length, 0, "the draft-wrapper's internal re-fetch must never set the pack_consumer GUC");
  const packCall = calls.find((c) => /get_context_pack/.test(c.sql));
  assert.ok(packCall, "the wrapper still fetches the pack for books_version");
  assert.equal(packCall.params[1], "coding", "the wrapper's re-fetch keeps purpose 'coding' (AMB-1) — it stays wiki-dark");
});

// ===========================================================================
// WB-R6(3) — the W2 sweep/authority-boundary probe, runtime half: a wiki block in the
// pack must never change what reaches the write client for the same model input.
// ===========================================================================

// The 0019 §7 stale marker is NEW pack surface, and the contract (§10) requires this W2
// probe to run WITH it present: `stale_at`/`stale_reason` BY NAME on the enumerated
// citation object (0019 §7.3) and the derived page-level `has_stale_sources`. Unproven,
// staleness is new W2 exposure — a later refactor could consume `has_stale_sources`
// outside prompt construction and move the write arguments only when it is true, and a
// fixture carrying no stale metadata would keep passing byte-identity while production's
// MARKED pages quietly steered authority writes.
const WIKI_PAGE_STALE = {
  slug: "vendor-brightpath",
  title: "BRIGHTPATH SDN BHD",
  page_kind: "counterparty",
  version_n: 3,
  updated_at: "2026-07-20T02:11:04.882Z",
  has_stale_sources: true,
  citations: [
    {
      source_kind: "document",
      document_id: "8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
      entry_id: null,
      counterparty_id: null,
      detail: {},
      stale_at: "2026-07-23T09:14:55.201Z",
      stale_reason: "source_filing_retired",
    },
    {
      source_kind: "human_note",
      document_id: null,
      entry_id: null,
      counterparty_id: null,
      detail: { note: "net-30 confirmed by the client" },
      stale_at: null,
      stale_reason: null,
    },
  ],
  content: "Pays net-30.",
};

test("v3 W2 probe: write params are byte-identical whether the pack carries a wiki block or not — INCLUDING a block carrying 0019 stale metadata", async () => {
  const packNoWiki = { books_version: 7 };
  const packWithWiki = {
    books_version: 7,
    wiki: {
      last_projected_seq: 42,
      held: false,
      pages: [{ slug: "vendor-brightpath", title: "BRIGHTPATH SDN BHD", content: "Pays net-30." }],
      basis: "clara_maintained_advisory_notes",
      permitted_use: "inform_never_decide",
    },
  };
  const packWithStaleWiki = {
    books_version: 7,
    wiki: {
      last_projected_seq: 42,
      held: false,
      pages: [WIKI_PAGE_STALE],
      basis: "clara_maintained_advisory_notes",
      permitted_use: "inform_never_decide",
    },
  };
  // Guard the fixture itself: a silent shape drift would make the probe below vacuous.
  assert.equal(packWithStaleWiki.wiki.pages[0].has_stale_sources, true, "the fixture page IS marked");
  assert.equal(packWithStaleWiki.wiki.pages[0].citations[0].stale_reason, "source_filing_retired",
    "…and carries the named per-citation stale_reason (0019 §7)");
  assert.ok(packWithStaleWiki.wiki.pages[0].citations[0].stale_at, "…and stale_at");

  const { client: clientA } = makeLoggingReadClient({ pack: packNoWiki });
  const writeA = stubPools({ readClient: clientA });
  const rA = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(rA.ok, true);

  const { client: clientB } = makeLoggingReadClient({ pack: packWithWiki });
  const writeB = stubPools({ readClient: clientB });
  const rB = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(rB.ok, true);

  const { client: clientC } = makeLoggingReadClient({ pack: packWithStaleWiki });
  const writeC = stubPools({ readClient: clientC });
  const rC = await runDraftJournalEntry(ctx, baseInput);
  assert.equal(rC.ok, true);

  assert.deepEqual(writeA.params, writeB.params, "a wiki block present in the pack must not change the write params for an identical model input");
  assert.deepEqual(writeA.params, writeC.params, "…and neither does a wiki block whose sources are MARKED STALE (0019 §7 is inform-never-decide: the marker informs the prompt, never the write)");
});

test("v3 structural W2 check: no non-prompt source file reads the pack's wiki field to build draft params", () => {
  const nonPromptFiles = ["autoDraft.v3.tools.ts", "autoDraft.v3.impl.ts", "autoDraft.v3.infra.ts", "autoDraft.v3.errors.ts"];
  for (const name of nonPromptFiles) {
    const s = readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /\.wiki\b/, `${name} must never access a '.wiki' field of the pack`);
  }
});

// ===========================================================================
// Frozen-dark regression: v2's sources never gained pack_consumer / wiki_coding.
// ===========================================================================

test("v2 sources remain wiki-dark: neither pack_consumer nor wiki_coding appears anywhere in the frozen v2 closure", () => {
  for (const name of ["autoDraft.v2.ts", "autoDraft.v2.impl.ts", "autoDraft.v2.tools.ts", "autoDraft.v2.infra.ts", "autoDraft.v2.prompt.ts", "autoDraft.v2.errors.ts"]) {
    const s = readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /pack_consumer/, `${name} must not reference pack_consumer`);
    assert.doesNotMatch(s, /wiki_coding/, `${name} must not reference wiki_coding`);
  }
});

// ===========================================================================
// WB-R6(4)/WB-R7 — the new wiki prompt law for the unattended sweep, asserted
// clause-by-clause with polarity.
// ===========================================================================

test("v3 prompt introduces the wiki block's basis + permitted_use, and the inform-never-decide law", () => {
  has(P3, "Clara's wiki notes: the context pack may include a `wiki` block", "the wiki block is named");
  has(
    P3,
    "Clara-maintained advisory notes (basis `clara_maintained_advisory_notes`, permitted_use `inform_never_decide`) built from",
    "the wiki's own basis + permitted_use tokens are named verbatim",
  );
  has(P3, "Wiki content may INFORM this draft; it may NEVER decide one", "the inform-never-decide law is the headline");
  has(
    P3,
    "every DB gate, bound, floor, and autopost rule stays authoritative regardless of what the wiki says",
    "every DB gate/bound/floor/autopost rule stays authoritative regardless of the wiki (WB-R6)",
  );
});

test("v3 prompt keeps sweep drafts human-reviewed under the same acknowledgement floors (WB-R7)", () => {
  has(
    P3,
    "this sweep draft remains human-reviewed under the same acknowledgement floors as any other draft.",
    "WB-R7: a wiki-informed sweep draft is still human-reviewed like any other draft",
  );
});

test("v3 prompt requires a wiki-informed draft to cite the page by slug and title in the entry's memo (no transcript in this lane)", () => {
  has(
    P3,
    "When a wiki page informs this draft, cite it BY SLUG AND TITLE in the entry's memo",
    "citation lands in the memo, since this lane persists no transcript",
  );
  has(
    P3,
    "so the citation stays visible to the reviewing bookkeeper even though this unattended run keeps no transcript.",
    "the citation must stay visible to the human despite no transcript",
  );
});

test("v3 prompt states the projection-lag marker means possibly-stale, and books_version stays authoritative (WB-R3)", () => {
  has(P3, "The block's `last_projected_seq` versus the pack's `books_version` is a LAG MARKER: a gap means", "the lag marker headline names both fields");
  has(P3, "the wiki notes are POSSIBLY STALE relative to the books.", "a lag means possibly stale");
  has(
    P3,
    "The books_version freshness token stays authoritative regardless of the wiki's projection lag",
    "books_version remains authoritative (WB-R3)",
  );
  has(P3, "never treat a wiki note as more current than the books.", "the failure mode is named and forbidden");
});

// ===========================================================================
// Carried v2 clauses persist byte-for-byte (regression).
// ===========================================================================

test("v3 carries the conditional purchase leg shape, both branches, unchanged from v2", () => {
  has(P3, "The LEG SHAPE depends on one thing — whether the bill's extracted facts STATE a tax amount.", "the conditional headline persists");
  has(
    P3,
    "* NO stated tax in the facts: a TWO-leg entry — the expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same GROSS.",
    "the 2-leg branch persists",
  );
  has(
    P3,
    "* A STATED tax amount in the facts: a THREE-leg VISIBILITY split — the expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the stated tax figure from the facts",
    "the 3-leg branch persists",
  );
  lacks(P3, "Draft the entry GROSS to the expense account code(s)", "the old unconditional gross-to-expense rule stays gone");
});

test("v3 carries the SST doctrine guards and the purchase-only direction unchanged from v2", () => {
  has(P3, "Malaysian SST has NO input-tax credit", "the no-input-tax-credit doctrine persists");
  has(P3, "This sweep only ever codes a supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.", "purchase-direction vocabulary persists");
  has(P3, "The database owns every number: never compute, sum, or invent a figure", "the cardinal invariant persists");
});

test("v3 carries the EXISTENCE-ONLY watch framing unchanged from v2 (unattended floor stricter than chat)", () => {
  has(
    P3,
    "Because no human is watching this run, the ONLY thing you may ever say about it is that an SST registration watch is OPEN for this client and that the professional handles it in the review queue.",
    "the single permitted statement persists",
  );
  has(
    P3,
    'NEVER draw ANY conclusion from it: no liability, no registration status, no tax computation, no multiplying by 8%, no threshold judgement, no future-method inference, and never "below threshold" or "no issue".',
    "every conclusion class stays forbidden",
  );
  has(P3, "This unattended sweep NEVER acts on it — surfacing and professional review belong to the attended chat lane.", "the never-acts rule persists");
});

test("v3 has NO clarify and NO park tool — the sweep is unattended (unchanged from v2)", () => {
  const tools = buildAutoDraftTools(ctx);
  const names = Object.keys(tools);
  assert.deepEqual(names.filter((n) => /clarify|park|ask|question/i.test(n)), [], `no human-in-the-loop tool may exist: got ${names.join(",")}`);
  assert.ok(names.includes(DRAFT_TOOL), "the draft tool is present");
  lacks(P3, "call `clarify`", "the prompt must not instruct a clarify this lane cannot make");
});

// ===========================================================================
// The draft schema STRUCTURE + the settle-outcome reducer + the CLR->refusal map +
// the draft wrapper behavior are UNCHANGED from v2.
// ===========================================================================

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

test("v3 draft schema structure (fields + types) is identical to v2", () => {
  assert.deepEqual(structureOf(draftJournalEntryInputSchema), structureOf(promptV2.draftJournalEntryInputSchema));
});

test("v3 draft schema description text is BYTE-IDENTICAL to v2 (no schema-surface change in this wave)", () => {
  assert.equal(draftJournalEntryInputSchema.shape.lines.description, promptV2.draftJournalEntryInputSchema.shape.lines.description);
});

test("v3 draft TOOL description is BYTE-IDENTICAL to v2 (only get_context_pack changed this wave)", () => {
  const v3desc = buildAutoDraftTools(ctx)[DRAFT_TOOL].description;
  const v2desc = buildAutoDraftToolsV2({ firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7" })[DRAFT_TOOL].description;
  assert.equal(v3desc, v2desc);
});

test("v3 reducer: a successful draft -> drafted{entryId}; both double_coded reasons -> noop_existing (unchanged from v2)", () => {
  const drafted = (entryId) => [
    { type: "tool-call", toolCallId: "x", toolName: DRAFT_TOOL, input: {} },
    { type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: true, je_review: { type: "je_review", entry_id: entryId, revision_token: "r", client_id: "c", document_id: "d", provenance_tier: "model_read" } } },
  ];
  const refused = (refusal) => [{ type: "tool-result", toolCallId: "x", toolName: DRAFT_TOOL, output: { ok: false, refusal } }];
  assert.equal(toAutoDraftOutcome(drafted("entry-9")).kind, "drafted");
  for (const reason of ["double_coded", "already_coded"]) {
    assert.equal(toAutoDraftOutcome(refused({ type: "refusal", code: "CLR29", reason, message: "x" })).kind, "noop_existing");
  }
  assert.equal(isDoubleCodedReason("double_coded"), true);
  assert.equal(isDoubleCodedReason("currency_unsupported"), false);
});

test("v3 error map is oracle-safe (CLR21 detail, 42501 -> CLR03, generic leaks no SQL) (unchanged from v2)", () => {
  assert.equal(refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }).reason, "currency_unsupported");
  assert.equal(refusalFromDbError({ code: "42501" }).code, "CLR03");
  const generic = refusalFromDbError({ code: "XXOTHER", message: "select * from clara.secret" });
  assert.equal(generic.code, "internal");
  assert.doesNotMatch(generic.message, /select/i, "no SQL text leaks");
  assert.equal(noDraftRefusal().reason, "coding_incomplete");
});

test("v3 wrapper refuses (CLR11) a draft naming a DIFFERENT document than the task's — no write (unchanged from v2)", async () => {
  const { client } = makeLoggingReadClient({ pack: { books_version: 7 } });
  const write = stubPools({ readClient: client });
  const r = await runDraftJournalEntry(ctx, { ...baseInput, document_id: "99999999-9999-9999-9999-999999999999" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR11");
  assert.equal(write.called, false, "a mismatched document never reaches the writer");
});

// ===========================================================================
// Closure structural regression: errors.ts + infra.ts + impl.ts are pure version-
// renamed copies of v2 (no behavioural change); tools.ts differs from v2 ONLY in the
// get_context_pack tool registration (masked below).
// ===========================================================================

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so
 *  it is EXPECTED to diverge; only the code from the first import onward is compared. */
const dropHeader = (text) => text.slice(text.indexOf("import "));

test("v3 errors.ts + infra.ts + impl.ts are token-for-token identical to v2 (version-renamed only, header narrative aside)", () => {
  for (const part of ["errors", "infra", "impl"]) {
    assert.equal(
      dropHeader(asVN(src(`autoDraft.v3.${part}.ts`), 3)),
      dropHeader(asVN(src(`autoDraft.v2.${part}.ts`), 2)),
      `autoDraft.v3.${part}.ts must be a version-renamed copy of v2 — no behavioural change in this wave`,
    );
  }
});

/** Mask the get_context_pack tool registration (the ONE place tools.ts changed this
 *  wave) so the rest of the file — including the draft tool + the wrapper — can be
 *  compared token-for-token. Anchored on the tool key names, present in both versions. */
function maskGetContextPackTool(text) {
  const start = text.indexOf("get_context_pack: tool({");
  assert.ok(start > 0, "the get_context_pack tool registration is present");
  const end = text.indexOf("coding_lane: tool({", start);
  assert.ok(end > start, "the next tool registration follows");
  return `${text.slice(0, start)}<get_context_pack tool — compared separately>${text.slice(end)}`;
}

test("v3 tools.ts differs from v2 ONLY inside the get_context_pack tool registration (header narrative aside)", () => {
  assert.equal(
    maskGetContextPackTool(dropHeader(asVN(src("autoDraft.v3.tools.ts"), 3))),
    maskGetContextPackTool(dropHeader(asVN(src("autoDraft.v2.tools.ts"), 2))),
    "outside get_context_pack, v3 tools.ts (including the draft wrapper + draft tool) must be a version-renamed copy of v2",
  );
});
