// Wave B chatTurn_v7 — unit tests for the wiki-aware pack delta (ADR-032, WB-R6/WB-R7,
// FORK-6, AMB-1/AMB-2, WB-R6(4)) AND the regression that every v6 clause, the draft
// schema STRUCTURE, the tool mapping, and the rest of the closure are unchanged from v6.
//
// Prompt assertions are deliberately CLAUSE-level, not keyword-level: every prohibition
// and every permission is asserted as a whole sentence with its polarity, so deleting any
// one of them fails a test. The prompt is compared with its whitespace normalised (the
// source is a hand-wrapped string array — line breaks are formatting, not meaning).
// STUBBED pools (no DB). Mirrors wave-a21-chatturn-v6.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const { z } = await import("zod");
const prompt = await import("../workflows/chatTurn.v7.prompt.ts");
const promptV6 = await import("../workflows/chatTurn.v6.prompt.ts");
const toolsMod = await import("../workflows/chatTurn.v7.tools.ts");
const toolsV6Mod = await import("../workflows/chatTurn.v6.tools.ts");
const implMod = await import("../workflows/chatTurn.v7.impl.ts");

const { draftJournalEntryInputSchema, SYSTEM_PROMPT_V7 } = prompt;
const { runDraftJournalEntry, buildToolsV7 } = toolsMod;
const { buildToolsV6 } = toolsV6Mod;
const { loadContextStepV7 } = implMod;

/** The prompt with its hand-wrapping collapsed, so a clause can be asserted whole. */
const P7 = SYSTEM_PROMPT_V7.replace(/\s+/g, " ");

const has = (hay, needle, why) => assert.ok(hay.includes(needle), `${why}\n  MISSING CLAUSE: ${needle}`);
const lacks = (hay, needle, why) => assert.ok(!hay.includes(needle), `${why}\n  CLAUSE MUST BE GONE: ${needle}`);

// ===========================================================================
// A stub pools rig. Every read client logs its calls IN ORDER (sql + params) so the
// FORK-6 GUC-before-pack ordering can be asserted, not just the end result.
// ===========================================================================

function makeLoggingReadClient({ pack }) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/select set_config/.test(sql)) return { rows: [{ set_config: params?.[0] }], rowCount: 1 };
      if (/from clara\.document_filings/.test(sql)) {
        return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      }
      if (/get_context_pack/.test(sql)) return { rows: [{ pack }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: null }], rowCount: 1 };
      if (/from clara\.chat_messages/.test(sql)) return { rows: [], rowCount: 0 };
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
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
    withRuntime: async (fn) => fn(readClient),
  };
  return write;
}

const baseInput = {
  coding_kind: "supplier_bill",
  posting_date: "2025-10-15",
  lines: [
    { account_code: "600-000", debit_cents: 1000, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
  ],
  document_id: "11111111-1111-1111-1111-111111111111",
  counterparty: { new: { name: "BRIGHTPATH SDN BHD" } },
  evidence: [{ region_id: "22222222-2222-2222-2222-222222222222", quote: "1000" }],
};
const ctx = { firmId: "f", clientId: "c1", createdBy: "u", taskId: "t-1" };

// ===========================================================================
// FORK-6 GUC ordering + AMB-1 purpose literal — the model-facing get_context_pack TOOL
// ===========================================================================

test("v7 get_context_pack TOOL: set_config('clara.pack_consumer','v25',true) fires BEFORE the pack select, on the SAME client, and the pack call carries purpose wiki_coding", async () => {
  const { client, calls } = makeLoggingReadClient({ pack: { books_version: 7 } });
  stubPools({ readClient: client });
  const tools = buildToolsV7(ctx);
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

test("v7 get_context_pack TOOL inputSchema refuses every purpose value except the literal 'wiki_coding'", () => {
  const tools = buildToolsV7(ctx);
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

test("v7 loadContextStepV7: the pack fetch sets the GUC before the call and carries purpose wiki_coding", async () => {
  const { client, calls } = makeLoggingReadClient({ pack: { books_version: 11 } });
  stubPools({ readClient: client });
  const { contextPack } = await loadContextStepV7("sess-1", "c1", "f", "u");
  assert.deepEqual(contextPack, { books_version: 11 });
  const gucIdx = calls.findIndex((c) => /select set_config/.test(c.sql));
  const packIdx = calls.findIndex((c) => /get_context_pack/.test(c.sql));
  assert.ok(gucIdx >= 0 && gucIdx < packIdx, "loadContextStepV7 sets the GUC before its pack fetch too");
  assert.equal(calls[packIdx].params[1], "wiki_coding", "loadContextStepV7's model-feeding fetch carries purpose 'wiki_coding'");
});

test("v7 loadContextStepV7 still swallows a read failure to a null pack (unchanged from v6)", async () => {
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => {
      throw { code: "CLR10" };
    },
    withRuntime: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
  };
  const { contextPack } = await loadContextStepV7("sess-1", "c1", "f", "u");
  assert.equal(contextPack, null, "a below-floor OBO mint advises without the pack rather than throwing");
});

// ===========================================================================
// AMB-1 wiki-dark: the server-side draft-wrapper re-fetch KEEPS purpose "coding" and
// NEVER sets the GUC — it only needs books_version.
// ===========================================================================

test("v7 draft-wrapper re-fetch stays purpose 'coding' and NEVER sets clara.pack_consumer (AMB-1 wiki-dark)", async () => {
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
  slug: "vendor-acme",
  title: "ACME Sdn Bhd",
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

test("v7 W2 probe: write params are byte-identical whether the pack carries a wiki block or not — INCLUDING a block carrying 0019 stale metadata", async () => {
  const packNoWiki = { books_version: 7 };
  const packWithWiki = {
    books_version: 7,
    wiki: {
      last_projected_seq: 42,
      held: false,
      pages: [{ slug: "vendor-acme", title: "ACME Sdn Bhd", content: "Pays net-30." }],
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

test("v7 structural W2 check: no non-prompt source file reads the pack's wiki field to build draft params", () => {
  const nonPromptFiles = ["chatTurn.v7.tools.ts", "chatTurn.v7.impl.ts", "chatTurn.v7.infra.ts", "chatTurn.v7.errors.ts"];
  for (const name of nonPromptFiles) {
    const src = readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\.wiki\b/, `${name} must never access a '.wiki' field of the pack`);
  }
});

// ===========================================================================
// Frozen-dark regression: v6's sources never gained pack_consumer / wiki_coding.
// ===========================================================================

test("v6 sources remain wiki-dark: neither pack_consumer nor wiki_coding appears anywhere in the frozen v6 closure", () => {
  for (const name of ["chatTurn.v6.ts", "chatTurn.v6.impl.ts", "chatTurn.v6.tools.ts", "chatTurn.v6.infra.ts", "chatTurn.v6.prompt.ts", "chatTurn.v6.errors.ts"]) {
    const src = readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /pack_consumer/, `${name} must not reference pack_consumer`);
    assert.doesNotMatch(src, /wiki_coding/, `${name} must not reference wiki_coding`);
  }
});

// ===========================================================================
// WB-R6(4) — the new wiki prompt law, asserted clause-by-clause with polarity.
// ===========================================================================

test("v7 prompt introduces the wiki block's basis + permitted_use, and the inform-never-decide law", () => {
  has(P7, "Clara's wiki notes: the context pack may include a `wiki` block", "the wiki block is named");
  has(
    P7,
    "Clara-maintained advisory notes (basis `clara_maintained_advisory_notes`, permitted_use `inform_never_decide`) built from",
    "the wiki's own basis + permitted_use tokens are named verbatim",
  );
  has(
    P7,
    "Wiki content may INFORM a proposal; it may NEVER decide one",
    "the inform-never-decide law is the headline of the wiki clause",
  );
  has(
    P7,
    "every DB gate, bound, floor, and autopost rule stays authoritative regardless of what the wiki says.",
    "every DB gate/bound/floor/autopost rule stays authoritative regardless of the wiki (WB-R6)",
  );
});

test("v7 prompt requires a wiki-informed draft to cite the page by slug and title in the VISIBLE reasoning", () => {
  has(
    P7,
    "When a wiki page informs a draft, cite it in your VISIBLE reasoning by slug and title",
    "citation is required in the visible reasoning, not merely internally",
  );
  has(P7, "so the human reviewer can trace the note back to its source.", "the citation purpose is reviewer traceability");
});

test("v7 prompt states the projection-lag marker means possibly-stale, and books_version stays authoritative (WB-R3)", () => {
  has(
    P7,
    "The block's `last_projected_seq` versus the pack's `books_version` is a LAG MARKER: a gap means",
    "the lag marker headline names both fields",
  );
  has(P7, "the wiki notes are POSSIBLY STALE relative to the books.", "a lag means possibly stale, not a claim of certainty either way");
  has(
    P7,
    "The books_version freshness token stays authoritative regardless of the wiki's projection lag",
    "books_version remains THE authoritative freshness token (WB-R3), never superseded by the wiki",
  );
  has(P7, "never treat a wiki note as more current than the books.", "the failure mode (treating wiki as more current) is named and forbidden");
});

// ===========================================================================
// Carried v6 clauses persist byte-for-byte (regression) — the SST watch, the
// conditional purchase leg, and direction-first vocabulary.
// ===========================================================================

test("v7 carries the conditional purchase leg shape, both branches, unchanged from v6", () => {
  has(P7, "The LEG SHAPE depends on one thing — whether the document's extracted facts STATE a tax amount.", "the conditional headline persists");
  has(
    P7,
    "* NO stated tax in the facts: a TWO-leg entry — the expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same GROSS.",
    "the 2-leg branch persists",
  );
  has(
    P7,
    "* A STATED tax amount in the facts: a THREE-leg visibility split — the expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the stated tax figure from the facts",
    "the 3-leg branch persists",
  );
  lacks(P7, "propose the entry GROSS to expense with an equal credit to the", "the old unconditional gross-to-expense rule stays gone");
});

test("v7 carries the SST doctrine guards + no-autopost-on-purchase rule unchanged from v6", () => {
  has(P7, "Malaysian SST has NO input-tax credit", "the no-input-tax-credit doctrine persists");
  has(P7, "the tax leg is a VISIBILITY split of the expense cost, never a recoverable asset, and never an", "the visibility-split framing persists");
  has(P7, "A stated-tax purchase draft is human-review-only (it is never autoposted).", "the no-purchase-autopost sanction persists");
});

test("v7 carries the SST registration-watch surfacing + prohibition clauses unchanged from v6", () => {
  has(P7, "SURFACE IT UNPROMPTED:", "unprompted surfacing persists");
  has(
    P7,
    'When you quote any figure, ALWAYS pair it with its basis label ("a DB-computed screening estimate") and its verification status (the coverage / future-method attestation state) — a figure without BOTH is never acceptable.',
    "the basis+verification pairing law persists",
  );
  has(P7, "NEVER present it as a legal determination of SST liability;", "never a legal determination");
  has(P7, "NEVER multiply it by 8% or compute tax due;", "never the ×8% computation");
  has(P7, "NEVER infer or assert a registration status (that is sticky, human-recorded state).", "never infer or assert registration status");
  has(
    P7,
    "`future_method_status` is HUMAN-ATTESTED or `not_assessed`.",
    "the future-method law persists",
  );
});

test("v7 carries direction-first vocabulary and the cardinal invariant unchanged from v6", () => {
  has(P7, "the CUSTOMER on a sales-direction document, the VENDOR on a purchase-direction document.", "direction-first vocabulary persists");
  has(P7, "Direction follows the counterparty and document evidence, never the caller-selected coding_kind.", "direction-follows-evidence persists");
  has(P7, "The database owns every number: never compute, sum, or invent a figure", "the cardinal invariant persists");
});

// ===========================================================================
// The draft schema STRUCTURE + the draft TOOL description are UNCHANGED from v6.
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

test("v7 draft schema structure (fields + enum members) is identical to v6", () => {
  assert.deepEqual(structureOf(draftJournalEntryInputSchema), structureOf(promptV6.draftJournalEntryInputSchema));
});

test("v7 draft schema descriptions are BYTE-IDENTICAL to v6 (no schema-surface change in this wave)", () => {
  assert.equal(draftJournalEntryInputSchema.shape.lines.description, promptV6.draftJournalEntryInputSchema.shape.lines.description);
  assert.equal(draftJournalEntryInputSchema.shape.coding_kind.description, promptV6.draftJournalEntryInputSchema.shape.coding_kind.description);
});

test("v7 draft TOOL description is BYTE-IDENTICAL to v6 (only get_context_pack changed this wave)", () => {
  const v7desc = buildToolsV7(ctx).draft_journal_entry.description;
  const v6desc = buildToolsV6({ firmId: "f", clientId: "c1", createdBy: "u" }).draft_journal_entry.description;
  assert.equal(v7desc, v6desc);
});

// ===========================================================================
// Closure structural regression: errors.ts + infra.ts are pure version-renamed
// copies of v6 (no behavioural change); impl.ts + tools.ts differ from v6 ONLY in
// the known wiki-purpose/GUC regions (masked below).
// ===========================================================================

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta (the
 *  same convention chatTurn.v6.prompt.ts's header uses over v5) so it is EXPECTED to
 *  diverge; only the code from the first import onward is compared. */
const dropHeader = (text) => text.slice(text.indexOf("import "));

test("v7 errors.ts + infra.ts are token-for-token identical to v6 (version-renamed only)", () => {
  for (const part of ["errors", "infra"]) {
    assert.equal(
      asVN(src(`chatTurn.v7.${part}.ts`), 7),
      asVN(src(`chatTurn.v6.${part}.ts`), 6),
      `chatTurn.v7.${part}.ts must be a version-renamed copy of v6 — no behavioural change in this wave`,
    );
  }
});

/** Mask the loadContextStep function's body (the ONE place impl.ts changed this wave) so
 *  the rest of the file can be compared token-for-token. Anchored on text present
 *  byte-identically in both v6 and v7 (the comment prefix that opens it, and the comment
 *  that opens the NEXT function, which is untouched). */
function maskLoadContextStep(text) {
  const start = text.indexOf("/** Load prior transcript (attachment-aware, v2) + the client context pack (per-attempt");
  assert.ok(start > 0, "loadContextStep's doc comment is present");
  const end = text.indexOf("/** Recover a completed coding attempt for this task BEFORE any model call (C-12). A");
  assert.ok(end > start, "the next function's doc comment follows");
  return `${text.slice(0, start)}<loadContextStep — compared separately>${text.slice(end)}`;
}

test("v7 impl.ts differs from v6 ONLY inside loadContextStep's body (header narrative aside)", () => {
  assert.equal(
    maskLoadContextStep(dropHeader(asVN(src("chatTurn.v7.impl.ts"), 7))),
    maskLoadContextStep(dropHeader(asVN(src("chatTurn.v6.impl.ts"), 6))),
    "outside loadContextStep, v7 impl.ts must be a version-renamed copy of v6",
  );
});

/** Mask the get_context_pack tool registration (the ONE place tools.ts changed this
 *  wave) so the rest of the file — including the draft tool + the wrapper — can be
 *  compared token-for-token. Anchored on the tool key names, present in both versions. */
function maskGetContextPackTool(text) {
  const start = text.indexOf("get_context_pack: tool({");
  assert.ok(start > 0, "the get_context_pack tool registration is present");
  const end = text.indexOf("trial_balance: tool({", start);
  assert.ok(end > start, "the next tool registration follows");
  return `${text.slice(0, start)}<get_context_pack tool — compared separately>${text.slice(end)}`;
}

test("v7 tools.ts differs from v6 ONLY inside the get_context_pack tool registration (header narrative aside)", () => {
  assert.equal(
    maskGetContextPackTool(dropHeader(asVN(src("chatTurn.v7.tools.ts"), 7))),
    maskGetContextPackTool(dropHeader(asVN(src("chatTurn.v6.tools.ts"), 6))),
    "outside get_context_pack, v7 tools.ts (including the draft wrapper + draft tool) must be a version-renamed copy of v6",
  );
});
