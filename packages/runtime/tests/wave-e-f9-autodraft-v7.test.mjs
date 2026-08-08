// WAVE E / THE F6–F9 FIX BATCH — the companion suite for autoDraft_v6 -> autoDraft_v7
// (H1 ACCEPTANCE FINDING F9, ADR-064 §3). The v6 counterpart is
// wave-7a-autodraft-v6.test.mjs; this file follows its four jobs, scoped to F9's delta.
//
// THE FINDING THESE CELLS EXIST FOR. The drafting model mis-transcribed ONE hex group of a
// 36-char region UUID (…-4c6d-… for the true …-4fce-…) across INDEPENDENT attempts, and the
// DB evidence wall correctly refused CLR21 evidence_invalid every time
// (wave-7a-acceptance-h1.md:773-790). v7 removes the transcription surface: the toolface
// takes a small `region_idx`, and the wrapper resolves it to a region_id server-side.
//
// FOUR JOBS:
//   1. VERSION FIDELITY — every one of the 6 new files is v6 modulo the documented delta.
//      Three pure renames get a whole-body token-for-token compare; the three with a real
//      delta get the cut-and-compare instrument (wave-e-f9-testkit.mjs's own header states
//      exactly what that instrument proves and what it does not).
//   2. THE TOOLFACE — the schema no longer HAS a region_id field, and the model-facing
//      strings that teach the idx are pinned exactly.
//   3. RESOLUTION — resolveEvidenceRegions is pure, so it is tested by execution: by FIELD
//      not by position, unknown idx, unnameable regions, duplicates, hint ordering.
//   4. THE WRAPPER — end to end through runDraftJournalEntry with a stubbed pool: the DB
//      receives a region_id (never an idx), a bad idx never reaches the writer at all, and
//      the refusal carries the valid set.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  src, dropHeader, rename, cutLines, line, stubPools,
  SCRAMBLED_EXTRACT, REGION_TOTAL, REGION_VENDOR, REGION_DATE, LINES,
} from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const promptV7 = await import("../workflows/autoDraft.v7.prompt.ts");
const promptV6 = await import("../workflows/autoDraft.v6.prompt.ts");
const toolsV7 = await import("../workflows/autoDraft.v7.tools.ts");
const errorsV7 = await import("../workflows/autoDraft.v7.errors.ts");
const registryMod = await import("../workflows/registry.ts");

const { resolveEvidenceRegions, runDraftJournalEntry } = toolsV7;

/** v6 -> v7 token rename, applied to the OLD side so the two bodies compare on equal footing. */
const V6_TO_V7 = [
  ["autoDraft.v6.", "autoDraft.v7."],
  ["autoDraft_v6", "autoDraft_v7"],
  ["SYSTEM_PROMPT_AUTODRAFT_V6", "SYSTEM_PROMPT_AUTODRAFT_V7"],
];
const oldBody = (name) => rename(dropHeader(src(`autoDraft.v6.${name}`)), V6_TO_V7);
const newBody = (name) => dropHeader(src(`autoDraft.v7.${name}`));

// ===========================================================================
// 1. VERSION FIDELITY
// ===========================================================================

for (const name of ["infra.ts", "impl.ts", "ts"]) {
  test(`autoDraft.v7.${name} is a PURE version-rename of v6 — whole-body, token-for-token (header aside)`, () => {
    assert.equal(newBody(name), oldBody(name), `autoDraft.v7.${name} must differ from v6 only in the version tokens and its header narrative`);
  });
}

test("autoDraft.v7.prompt.ts differs from v6 ONLY in the citation instruction and the evidence schema element", () => {
  const cutNew = cutLines(newBody("prompt.ts"), [
    {
      label: "prompt/citation instruction",
      from: '  "the document\'s extracted invoice facts and cite them. CITE A REGION BY ITS `idx` — the small",',
      to: '  "back to the region itself.",',
      lines: 4,
    },
    {
      label: "prompt/region_idx field",
      from: "          region_idx: z",
      to: "            ),",
      lines: 9,
    },
    {
      label: "prompt/evidence array describe",
      from: "      .describe(",
      to: "      ),",
      lines: 5,
    },
  ]);
  const cutOld = cutLines(oldBody("prompt.ts"), [
    line("prompt/old citation instruction", '  "the document\'s extracted invoice facts and cite them (region id + exact quote per amount).",'),
    line("prompt/old region_id field", "          region_id: z.string().uuid(),"),
    line(
      "prompt/old evidence array describe",
      '      .describe("Cited facts (region id + exact quote) backing the amounts — REQUIRED for a document-bound draft."),',
    ),
  ]);
  assert.equal(cutNew, cutOld, "outside the three documented spans, autoDraft.v7.prompt.ts must be a version-renamed copy of v6 — every other schema field, the whole system prompt body and every typed-part shape are carried");
});

test("autoDraft.v7.errors.ts is PURELY ADDITIVE over v6 — two new blocks, and not one existing line touched", () => {
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
  assert.equal(cutNew, oldBody("errors.ts"), "with its two new blocks removed, autoDraft.v7.errors.ts must be BYTE-IDENTICAL to v6 — the CLR map, every reason message and every other factory are carried, not re-typed");
});

test("autoDraft.v7.tools.ts differs from v6 ONLY in the documented resolution spans", () => {
  const cutNew = cutLines(newBody("tools.ts"), [
    line(
      "tools/errors import",
      'import { refusalFromDbError, directionFamilyMismatchRefusal, evidenceIdxUnresolvedRefusal, type RegionIdxHint } from "./autoDraft.v7.errors.js";',
    ),
    {
      label: "tools/ExtractRegion doc",
      from: "/** One region of the get_document_extract shape (regions[] of a done extraction). `id` and",
      to: " *  here — a region missing either is simply not citable (see resolveEvidenceRegions). */",
      lines: 5,
    },
    { label: "tools/ExtractRegion id+idx", from: "  id?: string;", to: "  idx?: number;", lines: 2 },
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
      '        "Read this document\'s stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",',
    ),
    {
      label: "tools/draft tool description",
      from: '        "This is a proposal, not a posting. Provide coding_kind, lines, document_id, counterparty, and an evidence array citing " +',
      to: '        "each amount by its region `idx` from read_document (never a region id) — never set " +',
      lines: 2,
    },
  ]);
  const cutOld = cutLines(oldBody("tools.ts"), [
    line("tools/old errors import", 'import { refusalFromDbError, directionFamilyMismatchRefusal } from "./autoDraft.v7.errors.js";'),
    line("tools/old ExtractRegion doc", "/** One region of the get_document_extract shape (regions[] of a done extraction). */"),
    line("tools/old writer arg 12", "          JSON.stringify(input.evidence),"),
    line(
      "tools/old read_document description",
      '        "Read this document\'s stored extraction: filing state, invoice facts (when present), bounded text, and region ids to cite as evidence.",',
    ),
    line(
      "tools/old draft tool description",
      '        "This is a proposal, not a posting. Provide coding_kind, lines, document_id, counterparty, and an evidence array — never set " +',
    ),
  ]);
  assert.equal(cutNew, cutOld, "outside the documented spans, autoDraft.v7.tools.ts must be a version-renamed copy of v6 — the direction-family check, readInvoiceFactState, the counterparty derivation and every other writer arg are carried");
});

// ===========================================================================
// 2. THE TOOLFACE — the schema, and the model-facing strings.
// ===========================================================================

const baseDraft = {
  coding_kind: "supplier_bill",
  posting_date: "2026-01-31",
  lines: LINES,
  document_id: "11111111-1111-4111-8111-111111111111",
  counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
};
const parse = (evidence) => promptV7.draftJournalEntryInputSchema.safeParse({ ...baseDraft, evidence });

test("the evidence element is { region_idx, quote, field_path? } — a region_idx is REQUIRED and a region_id is not accepted in its place", () => {
  assert.equal(parse([{ region_idx: 1, quote: "RM 1,000.00" }]).success, true, "a plain region_idx + quote is the accepted shape");
  assert.equal(parse([{ region_idx: 2, quote: "RM 1,000.00", field_path: "invoice.total" }]).success, true, "field_path stays optional");
  assert.equal(parse([{ region_id: REGION_TOTAL, quote: "RM 1,000.00" }]).success, false, "a uuid where the idx belongs must be REFUSED — the transcription surface is gone, not merely discouraged");
  assert.equal(parse([{ quote: "RM 1,000.00" }]).success, false, "region_idx is required");
});

test("region_idx is a 1-based INTEGER: 0, a negative, a fraction and a numeric string are all refused", () => {
  for (const bad of [0, -1, 1.5, "1"]) {
    assert.equal(parse([{ region_idx: bad, quote: "q" }]).success, false, `region_idx=${JSON.stringify(bad)} must be refused`);
  }
  assert.equal(parse([{ region_idx: 1, quote: "q" }]).success, true);
});

test("evidence stays REQUIRED — .min(1) is carried, not relaxed by the schema change", () => {
  assert.equal(parse([]).success, false, "an empty evidence array must still be refused");
  assert.equal(promptV7.draftJournalEntryInputSchema.safeParse({ ...baseDraft }).success, false, "an omitted evidence array must still be refused");
});

const P7 = promptV7.SYSTEM_PROMPT_AUTODRAFT_V7.replace(/\s+/g, " ");
const P6 = promptV6.SYSTEM_PROMPT_AUTODRAFT_V6.replace(/\s+/g, " ");

test("v7's system prompt teaches the idx and forbids typing a region id — genuinely NEW, not carried", () => {
  const cite = "CITE A REGION BY ITS `idx` — the small integer read_document prints on every region — together with the exact quote for that amount.";
  const forbid = "NEVER type a region's long id: the tool does not accept one, and the server resolves your idx back to the region itself.";
  assert.ok(P7.includes(cite), `v7 must carry the idx citation rule\n  MISSING: ${cite}`);
  assert.ok(P7.includes(forbid), `v7 must carry the no-long-id rule\n  MISSING: ${forbid}`);
  assert.ok(!P6.includes("CITE A REGION"), "v6 must NOT already carry it — this is genuinely new this wave");
});

test("v6's own region-id citation sentence is GONE from v7 (a rule the schema contradicts is a rule the model breaks)", () => {
  const old = "cite them (region id + exact quote per amount).";
  assert.ok(P6.includes(old), "sanity: v6 really did carry the region-id citation sentence");
  assert.ok(!P7.includes(old), "v7 must NOT carry it");
});

test("v7 carries every OTHER load-bearing prompt invariant from v6, byte-for-byte", () => {
  const clauses = [
    "You never approve, post, or finalise anything, and a human approves every draft.",
    "The database owns every number: never compute, sum, or invent a figure",
    "This ledger is MYR-only.",
    "State any uncertainty qualitatively with alternatives — never a percentage, never a suspense account.",
    "This document was admitted into a BOUND direction — sales or purchase — before this run",
    "SALES INVOICE / SALES CREDIT NOTE leg shape:",
    "NEVER set counterparty.kind yourself: it is derived server-side from coding_kind",
    "Malaysian SST has NO input-tax credit",
  ];
  for (const c of clauses) {
    assert.ok(P7.includes(c), `v7 must carry: ${c}`);
    assert.ok(P6.includes(c), `…and it must be genuinely CARRIED — present in v6 too: ${c}`);
  }
});

test("the read_document and draft_journal_entry tool descriptions are EXACTLY the documented v7 text", () => {
  const toolsSrc = src("autoDraft.v7.tools.ts");
  assert.ok(
    toolsSrc.includes(
      '        "Read this document\'s stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",',
    ),
    "read_document's description must name the numbered regions and their idx",
  );
  assert.ok(
    toolsSrc.includes('        "each amount by its region `idx` from read_document (never a region id) — never set " +'),
    "the draft tool's description must tell the model to cite by idx and never by id",
  );
  assert.ok(!toolsSrc.includes("region ids to cite as evidence"), "v6's region-ids wording must be gone from v7");
});

// ===========================================================================
// 3. RESOLUTION — pure, exercised by execution.
// ===========================================================================

test("resolution is BY THE idx FIELD, not by array position — the fixture's array order is deliberately NOT its idx order", () => {
  const r = resolveEvidenceRegions(SCRAMBLED_EXTRACT, [
    { region_idx: 1, quote: "ACME SDN BHD" },
    { region_idx: 2, quote: "RM 1,000.00" },
    { region_idx: 3, quote: "2026-01-31" },
  ]);
  assert.equal(r.ok, true, `expected a resolution, got ${JSON.stringify(r)}`);
  assert.deepEqual(
    r.evidence.map((e) => e.region_id),
    [REGION_VENDOR, REGION_TOTAL, REGION_DATE],
    "idx 1/2/3 must resolve to the regions CARRYING those idx values — a positional resolver would have returned the array order (date, vendor, total)",
  );
  // The positional answer, spelled out so a future reader sees exactly what is excluded.
  assert.notDeepEqual(r.evidence.map((e) => e.region_id), [REGION_DATE, REGION_VENDOR, REGION_TOTAL]);
});

test("the quote and the optional field_path ride through unchanged; an omitted field_path is OMITTED, never nulled", () => {
  const r = resolveEvidenceRegions(SCRAMBLED_EXTRACT, [
    { region_idx: 2, quote: "RM 1,000.00", field_path: "invoice.total" },
    { region_idx: 1, quote: "ACME SDN BHD" },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.evidence[0], { region_id: REGION_TOTAL, quote: "RM 1,000.00", field_path: "invoice.total" });
  assert.deepEqual(r.evidence[1], { region_id: REGION_VENDOR, quote: "ACME SDN BHD" });
  assert.ok(!("field_path" in r.evidence[1]), "an omitted field_path must not become an explicit undefined/null key on the DB payload");
});

test("an UNKNOWN idx refuses and reports BOTH what was cited and the full valid set, idx-ordered with field_paths", () => {
  const r = resolveEvidenceRegions(SCRAMBLED_EXTRACT, [{ region_idx: 2, quote: "RM 1,000.00" }, { region_idx: 9, quote: "nope" }]);
  assert.equal(r.ok, false, "an idx that names no region must refuse the WHOLE draft, never silently drop the citation");
  assert.deepEqual(r.citedIdx, [9]);
  assert.deepEqual(r.valid, [
    { idx: 1, field_path: "invoice.vendor_name" },
    { idx: 2, field_path: "invoice.total" },
    { idx: 3, field_path: "invoice.invoice_date" },
  ]);
});

test("a region the extraction cannot NAME (no id, or no integer idx) is not citable — and never positionally guessed at", () => {
  const extract = {
    regions: [
      { idx: 1, field_path: "invoice.total" }, // no id
      { id: REGION_VENDOR, field_path: "invoice.vendor_name" }, // no idx
      { idx: "2", id: REGION_DATE, field_path: "invoice.invoice_date" }, // idx is a string, not an integer
      { idx: 4, id: REGION_TOTAL, field_path: null }, // citable, null field_path
    ],
  };
  const bad = resolveEvidenceRegions(extract, [{ region_idx: 1, quote: "x" }]);
  assert.equal(bad.ok, false, "an idx whose region carries no id must not resolve");
  assert.deepEqual(bad.valid, [{ idx: 4, field_path: null }], "only the fully-named region is offered as valid, and a null field_path is reported as null");
  const good = resolveEvidenceRegions(extract, [{ region_idx: 4, quote: "x" }]);
  assert.equal(good.ok, true);
  assert.equal(good.evidence[0].region_id, REGION_TOTAL);
});

test("a DUPLICATE idx keeps the FIRST occurrence — never a silent last-write-wins", () => {
  const extract = {
    regions: [
      { idx: 1, id: REGION_VENDOR, field_path: "invoice.vendor_name" },
      { idx: 1, id: REGION_TOTAL, field_path: "invoice.total" },
    ],
  };
  const r = resolveEvidenceRegions(extract, [{ region_idx: 1, quote: "x" }]);
  assert.equal(r.ok, true);
  assert.equal(r.evidence[0].region_id, REGION_VENDOR, "the first region carrying that idx wins");
});

test("THE DEPLOY-ORDER HAZARD, pinned: a PRE-0054 extract (regions with ids but NO idx) resolves nothing and refuses — v7 on an unmigrated DB is a fail-closed drafting stop, never a silent mis-citation", () => {
  // This is the shape clara.get_document_extract returns BEFORE migration 0054. It is why
  // 0054's header states the order as BINDING: DB first, then the runtime image. The
  // failure mode is loud and safe (every draft refuses with an empty valid set), but it IS
  // a full stop, and a reviewer should be able to see the exact behaviour here rather than
  // infer it.
  const preMigration = {
    regions: [
      { id: REGION_VENDOR, field_path: "invoice.vendor_name", text_content: "ACME SDN BHD", engine_kind: "invoice_facts", version_n: 1 },
      { id: REGION_TOTAL, field_path: "invoice.total", text_content: "RM 1,000.00", engine_kind: "invoice_facts", version_n: 1 },
    ],
  };
  const r = resolveEvidenceRegions(preMigration, [{ region_idx: 1, quote: "RM 1,000.00" }]);
  assert.equal(r.ok, false, "with no idx published, NOTHING is citable — the resolver must not fall back to array position");
  assert.deepEqual(r.valid, [], "and the hint list is honestly empty rather than inventing ordinals the DB never published");
});

test("a missing / empty / non-array regions payload resolves NOTHING and refuses with an empty valid set", () => {
  for (const extract of [null, undefined, {}, { regions: null }, { regions: "not an array" }, { regions: [] }]) {
    const r = resolveEvidenceRegions(extract, [{ region_idx: 1, quote: "x" }]);
    assert.equal(r.ok, false, `extract ${JSON.stringify(extract)} must refuse, never resolve`);
    assert.deepEqual(r.valid, []);
    assert.deepEqual(r.citedIdx, [1]);
  }
});

test("the refusal message names the cited idx and lists the valid ones with their field_paths, on the CARRIED evidence_invalid token", () => {
  const refusal = errorsV7.evidenceIdxUnresolvedRefusal([9, 12], [
    { idx: 1, field_path: "invoice.vendor_name" },
    { idx: 2, field_path: null },
  ]);
  assert.equal(refusal.code, "CLR21");
  assert.equal(refusal.reason, "evidence_invalid", "the token must be the EXISTING one — a new token would fork isQuestionShaped, the dashboard copy and the settle record for a case that is the same case");
  assert.ok(refusal.message.startsWith("The cited evidence does not match the document's extraction."), "the standard message must lead, so any consumer matching on it still matches");
  assert.ok(refusal.message.includes("region_idx 9, 12"), "the cited idx values must be named");
  assert.ok(refusal.message.includes("1 (invoice.vendor_name)"), "a valid idx must be listed with its field_path");
  assert.ok(refusal.message.includes(", 2."), "a valid idx with no field_path is listed bare");
  assert.ok(!/\d[\d,]*\.\d\d/.test(refusal.message), "the hint must carry no monetary figure — it names idx values and field paths, nothing the tool has not already shown the model");
  const empty = errorsV7.evidenceIdxUnresolvedRefusal([1], []);
  assert.ok(empty.message.includes("Valid region_idx values: none."), "an extraction with no citable region says so plainly");
});

test("evidence_invalid stays QUESTION-SHAPED, so the sweep's open-question behaviour is unchanged by where the refusal is raised", () => {
  assert.equal(promptV7.isQuestionShaped(errorsV7.evidenceIdxUnresolvedRefusal([9], [])), true);
});

// ===========================================================================
// 4. THE WRAPPER, end to end.
// ===========================================================================

const DOC = "11111111-1111-1111-1111-111111111111";
const ctx = { firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7", direction: "purchase" };
const draftInput = (evidence) => ({ ...baseDraft, document_id: DOC, evidence });

test("wrapper: a resolvable idx reaches the writer as a REGION_ID — the DB contract is still uuid-based, and no idx is ever sent", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([{ region_idx: 2, quote: "RM 1,000.00", field_path: "invoice.total" }]));
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  const evidenceArg = JSON.parse(write.params[11]); // arg 12 (0-indexed 11)
  assert.deepEqual(evidenceArg, [{ region_id: REGION_TOTAL, quote: "RM 1,000.00", field_path: "invoice.total" }]);
  assert.ok(!JSON.stringify(evidenceArg).includes("region_idx"), "the DB must never receive an idx — clara._write_entry_evidence reads region_id and nothing else");
});

test("wrapper: the array-order-vs-idx-order trap is closed end to end (idx 1 reaches the writer as the VENDOR region, not the array's first element)", async () => {
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
  assert.equal(r.ok, false, "no extraction means no citable region — fail closed");
  assert.equal(r.refusal.reason, "evidence_invalid");
  assert.equal(write.params, null);
});

test("wrapper: the carried v6 guards still fire FIRST — a foreign document_id is still CLR11, before any resolution", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, { ...draftInput([{ region_idx: 1, quote: "x" }]), document_id: "99999999-9999-4999-8999-999999999999" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.code, "CLR11");
  assert.equal(write.params, null);
});

test("wrapper: the carried direction-family guard still fires FIRST — a purchase-bound admission still refuses a sales_invoice", async () => {
  const write = stubPools(SCRAMBLED_EXTRACT);
  const r = await runDraftJournalEntry(ctx, { ...draftInput([{ region_idx: 1, quote: "x" }]), coding_kind: "sales_invoice" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "direction_family_mismatch");
  assert.equal(write.params, null);
});

// ===========================================================================
// 5. Registry sanity.
// ===========================================================================

test("registry.ts pins autoDraft: autoDraft_v7, and still exports the superseded autoDraft_v6 (policy (c))", () => {
  assert.equal(registryMod.workflows.autoDraft.name, "autoDraft_v7");
  assert.equal(typeof registryMod.autoDraft_v6, "function", "autoDraft_v6 must stay exported so no parked v6 run is stranded");
  assert.equal(typeof registryMod.autoDraft_v5, "function", "…and every earlier body stays exported too");
});
