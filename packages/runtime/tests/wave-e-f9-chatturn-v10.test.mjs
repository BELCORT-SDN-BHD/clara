// WAVE E / THE F6–F9 FIX BATCH — the companion suite for chatTurn_v9 -> chatTurn_v10
// (H1 ACCEPTANCE FINDING F9, ADR-064 §3). No chatTurn-only evidence suite existed before
// this file; it follows wave-e-f9-autodraft-v7.test.mjs's shape, which in turn follows
// wave-7a-autodraft-v6.test.mjs's.
//
// WHY THE CHAT LANE BUMPS TOO, AND IS NOT A COURTESY BUMP. F9's mis-transcription recurred
// on the CHAT door as well as the unattended one: the H1 record shows the same wrong hex
// group cited on a separate chat-lane attempt against the same document
// (wave-7a-acceptance-h1.md:773-790). Both families carry their OWN literal copy of the
// evidence schema and the draft wrapper by design, so both had to change.
//
// The cut-and-compare fidelity instrument's exact claim (and its limits) is stated in
// wave-e-f9-testkit.mjs's header; it is not restated here.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  src, dropHeader, rename, cutLines, line, stubPools,
  SCRAMBLED_EXTRACT, REGION_TOTAL, REGION_VENDOR, REGION_DATE, LINES,
} from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const promptV10 = await import("../workflows/chatTurn.v10.prompt.ts");
const promptV9 = await import("../workflows/chatTurn.v9.prompt.ts");
const toolsV10 = await import("../workflows/chatTurn.v10.tools.ts");
const errorsV10 = await import("../workflows/chatTurn.v10.errors.ts");
const registryMod = await import("../workflows/registry.ts");

const { resolveEvidenceRegions, runDraftJournalEntry } = toolsV10;

/** v9 -> v10 token rename, applied to the OLD side. Multi-digit first is irrelevant here
 *  (no v10 token exists in v9), but the pairs are the generator's own list so the two can
 *  never drift. */
const V9_TO_V10 = [
  ["chatTurn.v9.", "chatTurn.v10."],
  ["chatTurn_v9", "chatTurn_v10"],
  ["SYSTEM_PROMPT_V9", "SYSTEM_PROMPT_V10"],
  ["toTypedParts_v9", "toTypedParts_v10"],
  ["messageFromParts_v9", "messageFromParts_v10"],
  ["loadTaskStepV9", "loadTaskStepV10"],
  ["loadContextStepV9", "loadContextStepV10"],
  ["runModelSegmentStepV9", "runModelSegmentStepV10"],
  ["buildToolsV9", "buildToolsV10"],
];
const oldBody = (name) => rename(dropHeader(src(`chatTurn.v9.${name}`)), V9_TO_V10);
const newBody = (name) => dropHeader(src(`chatTurn.v10.${name}`));

// ===========================================================================
// 1. VERSION FIDELITY
// ===========================================================================

for (const name of ["infra.ts", "impl.ts", "ts"]) {
  test(`chatTurn.v10.${name} is a PURE version-rename of v9 — whole-body, token-for-token (header aside)`, () => {
    assert.equal(newBody(name), oldBody(name), `chatTurn.v10.${name} must differ from v9 only in the version tokens and its header narrative`);
  });
}

test("chatTurn.v10.prompt.ts differs from v9 ONLY in the three citation sentences and the evidence schema element", () => {
  const cutNew = cutLines(newBody("prompt.ts"), [
    {
      label: "prompt/citation instruction",
      from: '  "from the document\'s extracted facts and cite them. CITE A REGION BY ITS `idx` — the small",',
      to: '  "region\'s long id: the tool does not accept one, and the server resolves your idx for you.",',
      lines: 3,
    },
    {
      label: "prompt/read_document sentence",
      from: '  "bounded text, and the numbered regions — each carries an `idx` you cite as evidence). You",',
      to: '  "never receive the raw image bytes.",',
      lines: 2,
    },
    {
      label: "prompt/provide-the-lines sentence",
      from: '  "Provide the lines, the document_id, the counterparty, and an evidence array (the region\'s",',
      to: '  "produces a review card; it is NOT a posting. State",',
      lines: 3,
    },
    { label: "prompt/region_idx field", from: "        region_idx: z", to: "          ),", lines: 9 },
    { label: "prompt/evidence array describe", from: "    .describe(", to: "    ),", lines: 5 },
  ]);
  const cutOld = cutLines(oldBody("prompt.ts"), [
    line("prompt/old citation instruction", '  "from the document\'s extracted facts and cite them.",'),
    line("prompt/old read_document sentence", '  "bounded text, and region ids you cite as evidence). You never receive the raw image bytes.",'),
    {
      label: "prompt/old provide-the-lines sentence",
      from: '  "Provide the lines, the document_id, the counterparty, and an evidence array (region id +",',
      to: '  "exact quote for each cited fact). This produces a review card; it is NOT a posting. State",',
      lines: 2,
    },
    line("prompt/old region_id field", "        region_id: z.string().uuid(),"),
    line(
      "prompt/old evidence array describe",
      '    .describe("Cited facts (region id + exact quote) backing the amounts — REQUIRED for a document-bound draft."),',
    ),
  ]);
  assert.equal(cutNew, cutOld, "outside the documented spans, chatTurn.v10.prompt.ts must be a version-renamed copy of v9 — the clarify tool, every other schema field, v9's own anti-primacy sentence and every typed-part shape are carried");
});

test("chatTurn.v10.errors.ts is PURELY ADDITIVE over v9 — two new blocks, and not one existing line touched", () => {
  const cutNew = cutLines(newBody("errors.ts"), [
    {
      label: "errors/RegionIdxHint",
      from: "/** The (idx, field_path) pairs a resolution refusal echoes back so the model can re-cite —",
      to: "export type RegionIdxHint = { idx: number; field_path: string | null };",
      lines: 7,
      trailingBlanks: 2,
    },
    {
      label: "errors/evidenceIdxUnresolvedRefusal",
      from: "/** F9 (ADR-064 §3): the EARLY, runtime-labelled refusal for a cited `region_idx` that names",
      to: "}",
      lines: 27,
      trailingBlanks: 1,
    },
  ]);
  assert.equal(cutNew, oldBody("errors.ts"), "with its two new blocks removed, chatTurn.v10.errors.ts must be BYTE-IDENTICAL to v9");
});

test("chatTurn.v10.tools.ts differs from v9 ONLY in the documented resolution spans", () => {
  const cutNew = cutLines(newBody("tools.ts"), [
    line(
      "tools/errors import",
      'import { refusalFromDbError, sessionUnboundRefusal, evidenceIdxUnresolvedRefusal, type RegionIdxHint } from "./chatTurn.v10.errors.js";',
    ),
    {
      label: "tools/ExtractRegion id+idx",
      from: "  /** F9: the two handles this closure reads — `idx` is what the MODEL cites (the DB's",
      to: "  idx?: number;",
      lines: 6,
    },
    {
      label: "tools/resolveEvidenceRegions",
      from: "/** One cited fact as the model supplies it (region INDEX + quote), and the resolved shape",
      to: "}",
      lines: 54,
      trailingBlanks: 1,
    },
    {
      label: "tools/resolution call site",
      from: "    // F9 (ADR-064 §3): resolve the model's cited region INDEXES into the region ids the DB",
      to: "    }",
      lines: 12,
      trailingBlanks: 1,
    },
    line("tools/writer arg 12", "          JSON.stringify(cited.evidence),"),
    line(
      "tools/read_document description",
      '        "Read one document\'s stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",',
    ),
    {
      label: "tools/draft tool description",
      from: '        "Provide coding_kind, lines, document_id, an evidence array citing each amount by its region `idx` from " +',
      to: '        "read_document (never a region id), and the counterparty (required except on a journal_entry) — " +',
      lines: 2,
    },
  ]);
  const cutOld = cutLines(oldBody("tools.ts"), [
    line("tools/old errors import", 'import { refusalFromDbError, sessionUnboundRefusal } from "./chatTurn.v10.errors.js";'),
    line("tools/old writer arg 12", "          JSON.stringify(input.evidence),"),
    line(
      "tools/old read_document description",
      '        "Read one document\'s stored extraction: filing state, invoice facts (when present), bounded text, and region ids to cite as evidence.",',
    ),
    line(
      "tools/old draft tool description",
      '        "Provide coding_kind, lines, document_id, an evidence array, and the counterparty (required except on a journal_entry) — " +',
    ),
  ]);
  assert.equal(cutNew, cutOld, "outside the documented spans, chatTurn.v10.tools.ts must be a version-renamed copy of v9 — the session-unbound refusal, readInvoiceFactState, the journal_entry->NULL mapping and every other read tool are carried");
});

// ===========================================================================
// 2. THE TOOLFACE
// ===========================================================================

const baseDraft = {
  coding_kind: "supplier_bill",
  posting_date: "2026-01-31",
  lines: LINES,
  document_id: "11111111-1111-4111-8111-111111111111",
  counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
};
const parse = (evidence) => promptV10.draftJournalEntryInputSchema.safeParse({ ...baseDraft, evidence });

test("the evidence element is { region_idx, quote, field_path? } — a region_idx is REQUIRED and a region_id is not accepted in its place", () => {
  assert.equal(parse([{ region_idx: 1, quote: "RM 1,000.00" }]).success, true);
  assert.equal(parse([{ region_idx: 2, quote: "RM 1,000.00", field_path: "invoice.total" }]).success, true);
  assert.equal(parse([{ region_id: REGION_TOTAL, quote: "RM 1,000.00" }]).success, false, "a uuid where the idx belongs must be REFUSED — the transcription surface is gone");
  assert.equal(parse([{ quote: "RM 1,000.00" }]).success, false);
});

test("region_idx is a 1-based INTEGER: 0, a negative, a fraction and a numeric string are all refused", () => {
  for (const bad of [0, -1, 1.5, "1"]) {
    assert.equal(parse([{ region_idx: bad, quote: "q" }]).success, false, `region_idx=${JSON.stringify(bad)} must be refused`);
  }
});

test("evidence stays REQUIRED — .min(1) is carried, not relaxed by the schema change", () => {
  assert.equal(parse([]).success, false);
  assert.equal(promptV10.draftJournalEntryInputSchema.safeParse({ ...baseDraft }).success, false);
});

test("the OTHER carried schema affordances still hold — the journal_entry kind and the optional counterparty", () => {
  const ev = [{ region_idx: 1, quote: "q" }];
  assert.equal(promptV10.draftJournalEntryInputSchema.safeParse({ ...baseDraft, coding_kind: "journal_entry", evidence: ev }).success, true);
  const noCp = { ...baseDraft };
  delete noCp.counterparty;
  assert.equal(promptV10.draftJournalEntryInputSchema.safeParse({ ...noCp, evidence: ev }).success, true, "counterparty stays optional in the chat lane (v5's generic voucher affordance)");
});

const P10 = promptV10.SYSTEM_PROMPT_V10.replace(/\s+/g, " ");
const P9 = promptV9.SYSTEM_PROMPT_V9.replace(/\s+/g, " ");

test("v10's system prompt teaches the idx in all three places, and v9 carries none of them", () => {
  const clauses = [
    "CITE A REGION BY ITS `idx` — the small integer read_document prints on every region — together with the exact quote.",
    "NEVER type a region's long id: the tool does not accept one, and the server resolves your idx for you.",
    "bounded text, and the numbered regions — each carries an `idx` you cite as evidence)",
    "an evidence array (the region's `idx` from read_document + the exact quote for each cited fact — never a region id)",
  ];
  for (const c of clauses) {
    assert.ok(P10.includes(c), `v10 must carry: ${c}`);
    assert.ok(!P9.includes(c), `…and v9 must NOT already carry it: ${c}`);
  }
});

test("v9's own region-id citation wordings are GONE from v10", () => {
  for (const old of ["bounded text, and region ids you cite as evidence)", "an evidence array (region id + exact quote for each cited fact)"]) {
    assert.ok(P9.includes(old), `sanity: v9 really did carry: ${old}`);
    assert.ok(!P10.includes(old), `v10 must NOT carry: ${old}`);
  }
});

test("v10 carries every OTHER load-bearing prompt invariant from v9, including v9's own anti-primacy sentence", () => {
  const clauses = [
    "A client-issued document — the client is the ISSUER, not the bill-to party — is NEVER coded here even if it superficially resembles a bill",
    "The database owns every number: never compute, sum, or invent a figure",
    "Direction first: from the extraction, decide which side the CLIENT is on.",
    "This ledger is MYR-only",
    "Malaysian SST has NO input-tax credit",
    "a clarify question AND its answer are VISIBLE TO THE WHOLE FIRM",
  ];
  for (const c of clauses) {
    assert.ok(P10.includes(c), `v10 must carry: ${c}`);
    assert.ok(P9.includes(c), `…and it must be genuinely CARRIED — present in v9 too: ${c}`);
  }
});

// ===========================================================================
// 3. RESOLUTION — the chat lane's own local copy, exercised independently.
// ===========================================================================

test("resolution is BY THE idx FIELD, not by array position — the fixture's array order is deliberately NOT its idx order", () => {
  const r = resolveEvidenceRegions(SCRAMBLED_EXTRACT, [
    { region_idx: 1, quote: "ACME SDN BHD" },
    { region_idx: 2, quote: "RM 1,000.00" },
    { region_idx: 3, quote: "2026-01-31" },
  ]);
  assert.equal(r.ok, true, `expected a resolution, got ${JSON.stringify(r)}`);
  assert.deepEqual(r.evidence.map((e) => e.region_id), [REGION_VENDOR, REGION_TOTAL, REGION_DATE]);
  assert.notDeepEqual(r.evidence.map((e) => e.region_id), [REGION_DATE, REGION_VENDOR, REGION_TOTAL], "the positional answer must be excluded, not merely unlikely");
});

test("an UNKNOWN idx refuses and reports BOTH what was cited and the full valid set, idx-ordered with field_paths", () => {
  const r = resolveEvidenceRegions(SCRAMBLED_EXTRACT, [{ region_idx: 4, quote: "x" }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.citedIdx, [4]);
  assert.deepEqual(r.valid, [
    { idx: 1, field_path: "invoice.vendor_name" },
    { idx: 2, field_path: "invoice.total" },
    { idx: 3, field_path: "invoice.invoice_date" },
  ]);
});

test("a region the extraction cannot NAME is not citable, a duplicate idx keeps the FIRST, and an absent regions payload resolves nothing", () => {
  const unnameable = resolveEvidenceRegions({ regions: [{ idx: 1, field_path: "invoice.total" }] }, [{ region_idx: 1, quote: "x" }]);
  assert.equal(unnameable.ok, false, "a region with no id cannot be cited");
  const dup = resolveEvidenceRegions(
    { regions: [{ idx: 1, id: REGION_VENDOR }, { idx: 1, id: REGION_TOTAL }] },
    [{ region_idx: 1, quote: "x" }],
  );
  assert.equal(dup.ok, true);
  assert.equal(dup.evidence[0].region_id, REGION_VENDOR);
  for (const extract of [null, {}, { regions: [] }]) {
    const r = resolveEvidenceRegions(extract, [{ region_idx: 1, quote: "x" }]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.valid, []);
  }
});

test("THE DEPLOY-ORDER HAZARD, pinned: a PRE-0054 extract (regions with ids but NO idx) resolves nothing and refuses — v10 on an unmigrated DB is a fail-closed drafting stop, never a silent mis-citation", () => {
  const preMigration = {
    regions: [
      { id: REGION_VENDOR, field_path: "invoice.vendor_name", text_content: "ACME SDN BHD" },
      { id: REGION_TOTAL, field_path: "invoice.total", text_content: "RM 1,000.00" },
    ],
  };
  const r = resolveEvidenceRegions(preMigration, [{ region_idx: 1, quote: "RM 1,000.00" }]);
  assert.equal(r.ok, false, "with no idx published, NOTHING is citable — the resolver must not fall back to array position");
  assert.deepEqual(r.valid, [], "and the hint list is honestly empty rather than inventing ordinals the DB never published");
});

test("the refusal message names the cited idx and lists the valid ones, on the CARRIED evidence_invalid token", () => {
  const refusal = errorsV10.evidenceIdxUnresolvedRefusal([9], [{ idx: 1, field_path: "invoice.total" }]);
  assert.equal(refusal.code, "CLR21");
  assert.equal(refusal.reason, "evidence_invalid", "the token must be the EXISTING one — the dashboard's CLR21 copy for evidence_invalid still reads correctly for this case");
  assert.ok(refusal.message.startsWith("The cited evidence does not match the document's extraction."));
  assert.ok(refusal.message.includes("region_idx 9"));
  assert.ok(refusal.message.includes("1 (invoice.total)"));
  assert.ok(!/\d[\d,]*\.\d\d/.test(refusal.message), "the hint must carry no monetary figure");
});

// ===========================================================================
// 4. THE WRAPPER, end to end.
// ===========================================================================

const DOC = "11111111-1111-4111-8111-111111111111";
const ctx = { firmId: "F", clientId: "c1", createdBy: "u1", taskId: "task-7" };
const draftInput = (evidence) => ({ ...baseDraft, document_id: DOC, evidence });

test("wrapper: a resolvable idx reaches the writer as a REGION_ID — the DB contract is still uuid-based, and no idx is ever sent", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([{ region_idx: 2, quote: "RM 1,000.00", field_path: "invoice.total" }]));
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  const evidenceArg = JSON.parse(write.params[11]);
  assert.deepEqual(evidenceArg, [{ region_id: REGION_TOTAL, quote: "RM 1,000.00", field_path: "invoice.total" }]);
  assert.ok(!JSON.stringify(evidenceArg).includes("region_idx"), "the DB must never receive an idx");
});

test("wrapper: the array-order-vs-idx-order trap is closed end to end", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([{ region_idx: 1, quote: "ACME SDN BHD" }]));
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(JSON.parse(write.params[11])[0].region_id, REGION_VENDOR);
});

test("wrapper: an UNKNOWN idx refuses BEFORE the writer — the write pool is never reached, and the refusal carries the valid set", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([{ region_idx: 7, quote: "RM 1,000.00" }]));
  assert.equal(r.ok, false, `expected a refusal, got ${JSON.stringify(r)}`);
  assert.equal(r.refusal.code, "CLR21");
  assert.equal(r.refusal.reason, "evidence_invalid");
  assert.ok(r.refusal.message.includes("1 (invoice.vendor_name), 2 (invoice.total), 3 (invoice.invoice_date)"), `the valid set must be echoed, got: ${r.refusal.message}`);
  assert.equal(write.params, null, "the DB writer must NEVER be called for an unresolvable citation");
});

test("wrapper: when the extract read is unavailable the draft is REFUSED, never sent through with an unresolvable citation", async () => {
  const write = stubPools(null);
  const r = await runDraftJournalEntry(ctx, draftInput([{ region_idx: 1, quote: "x" }]));
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "evidence_invalid");
  assert.equal(write.params, null);
});

test("wrapper: the carried v9 guard still fires FIRST — an unbound session is still session_unbound, before any resolution", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry({ ...ctx, clientId: null }, draftInput([{ region_idx: 1, quote: "x" }]));
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "session_unbound");
  assert.equal(write.params, null);
});

// ===========================================================================
// 5. Registry sanity.
// ===========================================================================

test("registry.ts pins chatTurn: chatTurn_v10, and still exports the superseded chatTurn_v9 (policy (c))", () => {
  assert.equal(registryMod.workflows.chatTurn.name, "chatTurn_v10");
  assert.equal(typeof registryMod.chatTurn_v9, "function", "chatTurn_v9 must stay exported so no parked v9 run is stranded");
  assert.equal(typeof registryMod.chatTurn_v8, "function", "…and every earlier body stays exported too");
});
