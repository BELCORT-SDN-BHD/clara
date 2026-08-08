// WAVE E / THE F6–F9 FIX BATCH — the companion suite for autoDraft_v6 -> autoDraft_v7
// (H1 ACCEPTANCE FINDING F9, ADR-064 §3), including the FIX ROUND that closed the
// cross-model review's CRITICAL: Codex #1 and the native reviewer's Finding 1, which both
// showed that resolving a cited INDEX against a freshly-fetched region set lets a
// re-extraction rebind that index to a different region while the untouched wall accepts it.
//
// THE DEFECT, MEASURED BEFORE THE FIX (native reviewer's probe, re-run on this lane's rig):
//   T0  idx=1 invoice.currency | idx=2 invoice.amount_due "RM 5,000.00" | idx=3 invoice.total …
//   ->  the model cites region_idx=2, quote "RM 5,000.00"
//   T1  an invoice_facts extraction lands; every index is renumbered
//   ->  cited idx=2 now names invoice.total (a DIFFERENT extraction's region, same text)
//   ->  WALL: ACCEPTED. recorded evidence field_path 'invoice.total'
// The recorded label is what the corroboration bound and the supplier-bill shape check
// select on, so a race could promote an entry's provenance tier off uncited evidence.
//
// SIX JOBS:
//   1. VERSION FIDELITY — the three pure renames whole-body; prompt.ts and errors.ts by
//      cut-and-compare; tools.ts by POSITIVE equality of every carried region (its evidence
//      path is now a rewrite, and masking a rewrite would be a mask over the whole subject).
//   2. THE TOOLFACE — region_idx and (fix round) field_path are REQUIRED; the prose teaches
//      read-before-cite; the model-facing strings are pinned exactly.
//   3. RESOLUTION — pure, by execution: by field not position, and each of the five gates.
//   4. CLASSIFICATION — staleness is a SYSTEM condition: never evidence_invalid, never
//      question-shaped. A genuine mislabel inside a read snapshot still IS evidence_invalid.
//   5. THE WRAPPER — end to end, including THE DRIFT CELL (this cell fails on the pre-fix
//      resolver and passes after; that experiment is recorded in the PR body).
//   6. Registry sanity.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  src, dropHeader, rename, cutLines, line, slice, fnBody, stubPools, cite,
  READ_EXTRACT, DRIFTED_EXTRACT, COLLIDING_EXTRACT, PRE_0054_EXTRACT,
  REGION_TOTAL, REGION_VENDOR, REGION_DATE, LINES,
} from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const promptV7 = await import("../workflows/autoDraft.v7.prompt.ts");
const promptV6 = await import("../workflows/autoDraft.v6.prompt.ts");
const toolsV7 = await import("../workflows/autoDraft.v7.tools.ts");
const errorsV7 = await import("../workflows/autoDraft.v7.errors.ts");
const registryMod = await import("../workflows/registry.ts");

const { resolveEvidenceRegions, runDraftJournalEntry, extractRev, newReadSnapshots } = toolsV7;

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
    assert.equal(newBody(name), oldBody(name));
  });
}

test("autoDraft.v7.prompt.ts differs from v6 ONLY in the citation prose and the evidence element", () => {
  const cutNew = cutLines(newBody("prompt.ts"), [
    {
      label: "prompt/citation instruction",
      from: '  "the document\'s extracted invoice facts and cite them. CITE A REGION BY ITS `idx` — the small",',
      to: '  "and you simply read again and re-cite; that is a normal outcome, not an error to explain away.",',
      lines: 7,
    },
    { label: "prompt/region_idx", from: "          region_idx: z", to: "            ),", lines: 10 },
    { label: "prompt/field_path", from: "          field_path: z", to: "            ),", lines: 8 },
    { label: "prompt/evidence array describe", from: "      .describe(", to: "      ),", lines: 5 },
  ]);
  const cutOld = cutLines(oldBody("prompt.ts"), [
    line("prompt/old citation instruction", '  "the document\'s extracted invoice facts and cite them (region id + exact quote per amount).",'),
    line("prompt/old region_id field", "          region_id: z.string().uuid(),"),
    line("prompt/old field_path", "          field_path: z.string().optional(),"),
    line("prompt/old array describe", '      .describe("Cited facts (region id + exact quote) backing the amounts — REQUIRED for a document-bound draft."),'),
  ]);
  assert.equal(cutNew, cutOld, "outside the documented spans, autoDraft.v7.prompt.ts must be a version-renamed copy of v6");
});

test("autoDraft.v7.errors.ts is PURELY ADDITIVE over v6 — new blocks only, and not one existing line touched", () => {
  const cutNew = cutLines(newBody("errors.ts"), [
    {
      label: "errors/evidence failure types",
      from: "/** The (idx, field_path) pairs a resolution refusal echoes back so the model can re-cite,",
      to: "  | { kind: \"mislabelled\"; entries: MislabelledCitation[] };",
      lines: 21,
      trailingBlanks: 2,
    },
    // Four sub-spans rather than one, so each new declaration's LENGTH is pinned separately
    // and a body cannot grow inside a neighbour's mask.
    { label: "errors/system reasons + messages", from: "/** F9 FIX ROUND (coordinator ruling 2, from Codex #3 + native Finding 1). The conditions", to: "};", lines: 46, trailingBlanks: 1 },
    { label: "errors/validIdxHint", from: "/** The (idx, field_path) hint appended to an unknown-index refusal. Derived entirely from the", to: "}", lines: 10, trailingBlanks: 1 },
    { label: "errors/evidenceSystemRefusal", from: "export function evidenceSystemRefusal(reason: EvidenceSystemReason, hint?: string): RefusalPart {", to: "}", lines: 5, trailingBlanks: 1 },
    { label: "errors/refusalForEvidenceFailure", from: "/** Map a failed resolution to its refusal. The ONE place the two failure kinds are given", to: "}", lines: 13, trailingBlanks: 1 },
  ]);
  assert.equal(cutNew, oldBody("errors.ts"), "with its new blocks removed, autoDraft.v7.errors.ts must be BYTE-IDENTICAL to v6");
});

test("autoDraft.v7.tools.ts CARRIES every region v6 owned, byte-for-byte — the rewrite is confined to the evidence path", () => {
  const v7 = newBody("tools.ts");
  const v6 = oldBody("tools.ts");
  for (const name of ["normalizeCurrency", "readInvoiceFactState", "deriveCounterpartyKind", "allowedCodingKindsForDirection"]) {
    assert.equal(fnBody(v7, name), fnBody(v6, name), `${name} (doc comment included) must be byte-identical to v6`);
  }
  const carried = [
    ["the direction-family early check", "  // PR #204 / 7A-R2, THE BOUND FAMILY — the VERY FIRST check", "  try {"],
    ["the server-side read block", "    // 1. Server-side authoritative reads", "    const filing = server.filing"],
    ["the counterparty payload + op_key", "    // 2. Assemble writer args.", "    const receipt = await writeScoped"],
    ["the receipt handling + je_review", "    if (!receipt.entry_id || !receipt.revision_token)", "/**\n * Build the autoDraft tool set"],
    ["get_context_pack / coding_lane / get_draft_review", "    get_context_pack: tool({", "    [DRAFT_TOOL]: tool({"],
  ];
  for (const [label, from, to] of carried) {
    assert.equal(slice(v7, from, to, label), slice(v6, from, to, label), `the "${label}" region must be byte-identical to v6 — the fix round touches the evidence path and nothing else`);
  }
});

test("autoDraft.v7.tools.ts's writer args are v6's, except position 12 (the resolved evidence)", () => {
  const argsOf = (t) => slice(t, "        [\n          clientId,", "        ],\n      );", "writer args").split("\n").map((s) => s.trim()).filter(Boolean);
  const v7 = argsOf(newBody("tools.ts"));
  const v6 = argsOf(oldBody("tools.ts"));
  assert.equal(v7.length, v6.length, "the writer arity must not move");
  for (let i = 0; i < v7.length; i++) {
    if (v7[i] === "JSON.stringify(cited.evidence),") {
      assert.equal(v6[i], "JSON.stringify(input.evidence),", "position 12 is the ONE changed arg");
      continue;
    }
    assert.equal(v7[i], v6[i], `writer arg ${i + 1} must be carried from v6`);
  }
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
const parse = (evidence) => promptV7.draftJournalEntryInputSchema.safeParse({ ...baseDraft, evidence });

test("the evidence element is { region_idx, quote, field_path } — all three REQUIRED, and a region_id is not accepted in its place", () => {
  assert.equal(parse([cite(1, "RM 1,000.00", "invoice.total")]).success, true);
  assert.equal(parse([{ region_idx: 1, quote: "q" }]).success, false, "field_path is REQUIRED after the fix round (ruling 5) — it is the label the DB records and the tier logic selects on");
  assert.equal(parse([{ region_id: REGION_TOTAL, quote: "q", field_path: "invoice.total" }]).success, false, "a uuid where the idx belongs must be REFUSED");
  assert.equal(parse([cite(1, "q", "")]).success, true, "an EMPTY field_path is the sanctioned encoding for a region that printed none");
});

test("region_idx is a 1-based INTEGER and evidence stays REQUIRED", () => {
  for (const bad of [0, -1, 1.5, "1"]) assert.equal(parse([{ region_idx: bad, quote: "q", field_path: "p" }]).success, false, `region_idx=${JSON.stringify(bad)}`);
  assert.equal(parse([]).success, false);
  assert.equal(promptV7.draftJournalEntryInputSchema.safeParse({ ...baseDraft }).success, false);
});

const P7 = promptV7.SYSTEM_PROMPT_AUTODRAFT_V7.replace(/\s+/g, " ");
const P6 = promptV6.SYSTEM_PROMPT_AUTODRAFT_V6.replace(/\s+/g, " ");

test("v7's prompt teaches the idx, the READ-BEFORE-CITE contract and the echo-the-label rule — all genuinely new", () => {
  for (const c of [
    "CITE A REGION BY ITS `idx`",
    "NEVER type a region's long id",
    "Always call read_document in THIS run before you draft",
    "echo each cited region's own field_path exactly as it was printed",
    "If the document's extraction changed in between, the draft is refused",
  ]) {
    assert.ok(P7.includes(c), `v7 must carry: ${c}`);
    assert.ok(!P6.includes(c), `…and v6 must NOT: ${c}`);
  }
  assert.ok(P6.includes("cite them (region id + exact quote per amount)."), "sanity: v6 really did teach region-id citation");
  assert.ok(!P7.includes("cite them (region id + exact quote per amount)."), "…and v7 must not");
});

test("v7 carries every other load-bearing prompt invariant from v6, byte-for-byte", () => {
  for (const c of [
    "You never approve, post, or finalise anything, and a human approves every draft.",
    "The database owns every number: never compute, sum, or invent a figure",
    "This ledger is MYR-only.",
    "This document was admitted into a BOUND direction — sales or purchase — before this run",
    "SALES INVOICE / SALES CREDIT NOTE leg shape:",
    "Malaysian SST has NO input-tax credit",
  ]) {
    assert.ok(P7.includes(c), `v7 must carry: ${c}`);
    assert.ok(P6.includes(c), `…genuinely CARRIED — present in v6 too: ${c}`);
  }
});

// ===========================================================================
// 3. RESOLUTION — pure, by execution. `rev` is what read_document recorded.
// ===========================================================================

const readRev = extractRev(READ_EXTRACT);

test("resolution is BY THE idx FIELD, not by array position — the fixture's array order is deliberately NOT its idx order", () => {
  const r = resolveEvidenceRegions(READ_EXTRACT, [
    cite(1, "ACME SDN BHD", "invoice.vendor_name"),
    cite(2, "RM 1,000.00", "invoice.total"),
    cite(3, "2026-01-31", "invoice.invoice_date"),
  ], readRev);
  assert.equal(r.ok, true, `expected a resolution, got ${JSON.stringify(r)}`);
  assert.deepEqual(r.evidence.map((e) => e.region_id), [REGION_VENDOR, REGION_TOTAL, REGION_DATE]);
  assert.notDeepEqual(r.evidence.map((e) => e.region_id), [REGION_DATE, REGION_VENDOR, REGION_TOTAL], "the positional answer must be excluded, not merely unlikely");
});

test("GATE 1 — read-before-cite: with no recorded snapshot for this document, NOTHING resolves", () => {
  const r = resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total")], undefined);
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, "system");
  assert.equal(r.failure.reason, "evidence_not_read");
});

test("GATE 2 — THE DRIFT GATE: a snapshot that moved between the read and the draft REFUSES, even though the drifted region carries the identical quote (the measured silent-accept)", () => {
  // The model read READ_EXTRACT and cites idx 2 = the OCR invoice.total, "RM 1,000.00".
  // DRIFTED_EXTRACT's idx 2 is a DIFFERENT extraction's invoice.total with the SAME text —
  // so the DB wall could not tell, and did not, before this gate existed.
  const drifted = DRIFTED_EXTRACT.regions.find((x) => x.idx === 2);
  assert.notEqual(drifted.id, REGION_TOTAL, "fixture premise: idx 2 names a different region after the drift");
  assert.equal(drifted.text_content, "RM 1,000.00", "fixture premise: …carrying the SAME quote, so the wall cannot see the difference");
  const r = resolveEvidenceRegions(DRIFTED_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total")], readRev);
  assert.equal(r.ok, false, "the drifted snapshot must REFUSE — this is the CRITICAL both reviews raised");
  assert.equal(r.failure.reason, "evidence_snapshot_changed");
  assert.deepEqual(r.failure.valid, [], "no hint list on a renumber: the model must RE-READ, and a hint must never stand in for the read");
});

test("GATE 3 — a DUPLICATE idx in the fetched set REFUSES; first-wins would hand array order the authority the idx design removes", () => {
  const dup = { regions: [READ_EXTRACT.regions[1], { ...READ_EXTRACT.regions[2], idx: 1, id: REGION_DATE }] };
  const r = resolveEvidenceRegions(dup, [cite(1, "ACME SDN BHD", "invoice.vendor_name")], extractRev(dup));
  assert.equal(r.ok, false);
  assert.equal(r.failure.reason, "evidence_index_ambiguous");
});

test("GATE 4 — a PRE-0054 snapshot (ids, no ordinal) is named as unavailable, never reported as a bad citation", () => {
  const r = resolveEvidenceRegions(PRE_0054_EXTRACT, [cite(1, "RM 1,000.00", "invoice.total")], extractRev(PRE_0054_EXTRACT));
  assert.equal(r.ok, false);
  assert.equal(r.failure.reason, "evidence_index_unavailable");
  for (const empty of [null, {}, { regions: [] }, { regions: "nope" }]) {
    assert.equal(resolveEvidenceRegions(empty, [cite(1, "q", "p")], extractRev(empty)).failure.reason, "evidence_index_unavailable");
  }
});

test("GATE 5a — an UNKNOWN idx inside a matched snapshot reports what was cited AND the valid set, idx-ordered with labels", () => {
  const r = resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total"), cite(9, "x", "y")], readRev);
  assert.equal(r.ok, false);
  assert.equal(r.failure.reason, "evidence_index_unknown");
  assert.deepEqual(r.failure.citedIdx, [9]);
  assert.deepEqual(r.failure.valid, [
    { idx: 1, field_path: "invoice.vendor_name" },
    { idx: 2, field_path: "invoice.total" },
    { idx: 3, field_path: "invoice.invoice_date" },
  ]);
});

test("GATE 5b — the field_path CROSS-CHECK (ruling 5): a label the region does not carry is a MISLABEL, and the resolved evidence always carries the REGION's own label", () => {
  const bad = resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.amount_due")], readRev);
  assert.equal(bad.ok, false);
  assert.equal(bad.failure.kind, "mislabelled", "a wrong label inside a snapshot the model READ is bad evidence, not a system condition");
  assert.deepEqual(bad.failure.entries, [{ idx: 2, cited: "invoice.amount_due", actual: "invoice.total" }]);

  const pathless = { regions: [{ ...READ_EXTRACT.regions[1], field_path: null }] };
  const rev = extractRev(pathless);
  const claimed = resolveEvidenceRegions(pathless, [cite(1, "ACME SDN BHD", "invoice.total")], rev);
  assert.equal(claimed.failure.kind, "mislabelled", "claiming a label for a region that has none is the mislabel-promotes-tier vector, closed at the toolface");
  const honest = resolveEvidenceRegions(pathless, [cite(1, "ACME SDN BHD", "")], rev);
  assert.equal(honest.ok, true, "a pathless region stays CITABLE — the model echoes the empty label rather than inventing one");
  assert.ok(!("field_path" in honest.evidence[0]), "…and no field_path is sent to the DB, so the recorded row matches the region");

  const good = resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total")], readRev);
  assert.equal(good.evidence[0].field_path, "invoice.total", "the resolved label is read BACK OFF THE REGION — DB-sourced end to end, never the model's string");
});

test("the RESIDUAL is stated, not hidden: the same quote in two regions of ONE set still resolves by idx to the region the model read — no worse than the uuid era, and no better", () => {
  const rev = extractRev(COLLIDING_EXTRACT);
  const r = resolveEvidenceRegions(COLLIDING_EXTRACT, [cite(2, "RM 1,000.00", "invoice.amount_due")], rev);
  assert.equal(r.ok, true);
  assert.equal(r.evidence[0].region_id, COLLIDING_EXTRACT.regions[1].id, "idx picks the region, not the quote — a quote collision inside one snapshot is a wall-level residual this PR does not claim to fix");
});

test("extractRev is the MAPPING, not a proxy for it: reordering the array does not change it, but renumbering, re-identifying or re-generating a region does", () => {
  const reordered = { regions: [...READ_EXTRACT.regions].reverse() };
  assert.equal(extractRev(reordered), readRev, "array order is not identity");
  const renumbered = { regions: READ_EXTRACT.regions.map((r) => ({ ...r, idx: r.idx + 1 })) };
  assert.notEqual(extractRev(renumbered), readRev);
  const regenerated = { regions: READ_EXTRACT.regions.map((r) => (r.idx === 2 ? { ...r, extraction_id: "other" } : r)) };
  assert.notEqual(extractRev(regenerated), readRev, "the same idx pointing into a different extraction generation is a different snapshot");
});

// ===========================================================================
// 4. CLASSIFICATION — ruling 2's side effects.
// ===========================================================================

const SYSTEM_REASONS = ["evidence_not_read", "evidence_snapshot_changed", "evidence_index_unavailable", "evidence_index_unknown", "evidence_index_ambiguous"];

test("every SYSTEM reason refuses as `transient`, is NOT evidence_invalid, and is NOT question-shaped — no durable human question, no evidence-blame receipt", () => {
  for (const reason of SYSTEM_REASONS) {
    const r = errorsV7.evidenceSystemRefusal(reason);
    assert.equal(r.code, "transient", `${reason} must not borrow a CLR code`);
    assert.equal(r.reason, reason);
    assert.notEqual(r.reason, "evidence_invalid");
    assert.equal(promptV7.isQuestionShaped(r), false, `${reason} must NEVER open a scoped open-question — it is a system condition, not something a bookkeeper can answer`);
    assert.ok(r.message.length > 0);
    assert.ok(!/\d[\d,]*\.\d\d/.test(r.message), "a system message names no monetary figure");
  }
});

test("a genuine MISLABEL keeps the existing evidence_invalid discriminant AND stays question-shaped — the fix round narrows blame, it does not abolish it", () => {
  const r = errorsV7.refusalForEvidenceFailure({ kind: "mislabelled", entries: [{ idx: 2, cited: "invoice.total", actual: "invoice.amount_due" }] });
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "evidence_invalid");
  assert.equal(promptV7.isQuestionShaped(r), true, "bad evidence remains a human-answerable question, exactly as before");
  assert.ok(r.message.startsWith("The cited evidence does not match the document's extraction."), "the standard message must lead");
  assert.ok(r.message.includes('region_idx 2 is "invoice.amount_due", not "invoice.total"'));
});

test("the unknown-index refusal carries the valid set; the snapshot-changed refusal deliberately does NOT", () => {
  const unknown = errorsV7.refusalForEvidenceFailure({ kind: "system", reason: "evidence_index_unknown", citedIdx: [9], valid: [{ idx: 1, field_path: "invoice.total" }, { idx: 2, field_path: null }] });
  assert.ok(unknown.message.includes("1 (invoice.total)"));
  assert.ok(unknown.message.includes(", 2."));
  const moved = errorsV7.refusalForEvidenceFailure({ kind: "system", reason: "evidence_snapshot_changed", citedIdx: [2], valid: [] });
  assert.ok(!moved.message.includes("Valid region_idx"), "after a renumber the remedy is a RE-READ; a hint list would let the hint stand in for the read");
  assert.ok(/read_document again/.test(moved.message));
});

// ===========================================================================
// 5. THE WRAPPER, end to end.
// ===========================================================================

const DOC = "11111111-1111-1111-1111-111111111111";
const ctx = { firmId: "F", clientId: "c1", documentId: DOC, filingId: "fil-1", taskId: "task-7", direction: "purchase" };
const draftInput = (evidence) => ({ ...baseDraft, document_id: DOC, evidence });
/** The state read_document would have left behind for this document. */
const readsFor = (extract) => {
  const m = newReadSnapshots();
  m.set(DOC, extractRev(extract));
  return m;
};

test("wrapper: a citation from the snapshot the model read reaches the writer as a REGION_ID plus the REGION's own label — and no idx is ever sent to the DB", async () => {
  const w = stubPools(READ_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.deepEqual(JSON.parse(w.params[11]), [{ region_id: REGION_TOTAL, quote: "RM 1,000.00", field_path: "invoice.total" }]);
  assert.ok(!JSON.stringify(JSON.parse(w.params[11])).includes("region_idx"));
});

test("wrapper: THE DRIFT CELL — an extraction that lands between the read and the draft is REFUSED, and the writer is never reached (this cell FAILS on the pre-fix resolver)", async () => {
  const w = stubPools([DRIFTED_EXTRACT]); // the wrapper's own fetch sees the NEW set
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(r.ok, false, "the pre-fix resolver returned ok here and the wall then accepted the wrong region");
  assert.equal(r.refusal.code, "transient");
  assert.equal(r.refusal.reason, "evidence_snapshot_changed");
  assert.equal(w.writes, 0, "the DB writer must NEVER be reached with a citation bound to a set the model did not read");
});

test("wrapper: a run that never read this document is refused before any write — reading nothing licenses nothing", async () => {
  const w = stubPools(READ_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), newReadSnapshots());
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "evidence_not_read");
  assert.equal(w.writes, 0);
});

test("wrapper: the pre-0054 deploy window refuses as a SYSTEM condition with NO question and NO evidence blame — and the identical input resolves once the ordinal is published", async () => {
  const w = stubPools(PRE_0054_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(PRE_0054_EXTRACT));
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "evidence_index_unavailable");
  assert.equal(promptV7.isQuestionShaped(r.refusal), false, "no durable human question in the deploy window");
  assert.notEqual(r.refusal.reason, "evidence_invalid", "and no evidence-blame receipt");
  assert.equal(w.writes, 0);
  // …and the SAME citation, once 0054 publishes the ordinal, goes through.
  const w2 = stubPools(READ_EXTRACT);
  const ok = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(ok.ok, true, "recovery needs no code change and no human — only the migration");
  assert.equal(w2.writes, 1);
});

test("wrapper: the carried v6 guards still fire FIRST — a foreign document_id is CLR11 and a purchase-bound sales_invoice is direction_family_mismatch, both before any resolution", async () => {
  const w1 = stubPools(READ_EXTRACT);
  const foreign = await runDraftJournalEntry(ctx, { ...draftInput([cite(2, "RM 1,000.00", "invoice.total")]), document_id: "99999999-9999-4999-8999-999999999999" }, readsFor(READ_EXTRACT));
  assert.equal(foreign.refusal.code, "CLR11");
  assert.equal(w1.writes, 0);
  const w2 = stubPools(READ_EXTRACT);
  const family = await runDraftJournalEntry(ctx, { ...draftInput([cite(2, "RM 1,000.00", "invoice.total")]), coding_kind: "sales_invoice" }, readsFor(READ_EXTRACT));
  assert.equal(family.refusal.reason, "direction_family_mismatch");
  assert.equal(w2.writes, 0);
});

test("the tool set wires the gate: read_document RECORDS the snapshot it showed, and the draft tool is handed that same record", () => {
  const toolsSrc = src("autoDraft.v7.tools.ts");
  assert.ok(toolsSrc.includes("const reads = newReadSnapshots();"), "the tool set must own one read record per model-step execution");
  assert.ok(toolsSrc.includes("reads.set(ctx.documentId, extractRev(extract));"), "read_document must record the rev of what it returned");
  assert.ok(toolsSrc.includes("runDraftJournalEntry(ctx, input, reads)"), "the draft tool must be handed that record");
  const readIdx = toolsSrc.indexOf("reads.set(ctx.documentId");
  const returnIdx = toolsSrc.indexOf("return extract;", readIdx);
  assert.ok(readIdx > 0 && returnIdx > readIdx, "the record must be written before the extract is handed to the model");
});

// ===========================================================================
// 6. Registry sanity.
// ===========================================================================

test("registry.ts pins autoDraft: autoDraft_v7, and still exports the superseded autoDraft_v6 (policy (c))", () => {
  assert.equal(registryMod.workflows.autoDraft.name, "autoDraft_v7");
  assert.equal(typeof registryMod.autoDraft_v6, "function");
  assert.equal(typeof registryMod.autoDraft_v5, "function");
});
