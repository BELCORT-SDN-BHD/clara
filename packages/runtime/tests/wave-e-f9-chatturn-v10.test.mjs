// WAVE E / THE F6–F9 FIX BATCH — the companion suite for chatTurn_v9 -> chatTurn_v10
// (H1 ACCEPTANCE FINDING F9, ADR-064 §3), including the FIX ROUND.
//
// WHY THE CHAT LANE BUMPS TOO, AND WHY ITS GATE IS STRICTER. F9's mis-transcription recurred
// on the CHAT door as well as the unattended one (wave-7a-acceptance-h1.md:773-790). And the
// chat lane has a hole the sweep does not: the model chooses BOTH which document to read and
// which to draft, so an index read from document A could be cited against document B. Under
// v9 the DB wall's own document join refused that structurally — the region_id simply did not
// belong to the drafted document. An INDEX has no such property: idx 2 exists in both. The
// per-document read gate is what restores it (native reviewer Finding 2).
//
// The fidelity instruments' exact claims and limits are stated in wave-e-f9-testkit.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  src, dropHeader, rename, cutLines, line, slice, fnBody, stubPools, cite,
  READ_EXTRACT, DRIFTED_EXTRACT, PRE_0054_EXTRACT, REGION_TOTAL, REGION_VENDOR, REGION_DATE, LINES,
} from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const promptV10 = await import("../workflows/chatTurn.v10.prompt.ts");
const promptV9 = await import("../workflows/chatTurn.v9.prompt.ts");
const toolsV10 = await import("../workflows/chatTurn.v10.tools.ts");
const errorsV10 = await import("../workflows/chatTurn.v10.errors.ts");
const registryMod = await import("../workflows/registry.ts");

const { resolveEvidenceRegions, runDraftJournalEntry, extractRev, newReadSnapshots } = toolsV10;

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
    assert.equal(newBody(name), oldBody(name));
  });
}

test("chatTurn.v10.prompt.ts differs from v9 ONLY in the citation prose and the evidence element", () => {
  const cutNew = cutLines(newBody("prompt.ts"), [
    {
      label: "prompt/citation instruction",
      from: '  "from the document\'s extracted facts and cite them. CITE A REGION BY ITS `idx` — the small",',
      to: '  "cited region\'s own field_path exactly as it was printed.",',
      lines: 7,
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
    { label: "prompt/region_idx", from: "        region_idx: z", to: "          ),", lines: 10 },
    { label: "prompt/field_path", from: "        field_path: z", to: "          ),", lines: 8 },
    { label: "prompt/evidence array describe", from: "    .describe(", to: "    ),", lines: 5 },
    // Fix round 3: a comment-only note recording that autoDraft's reducer defect was CHECKED
    // here and is structurally absent (toTypedParts_v10 is a map). Pinned by a cell below.
    { label: "prompt/reducer-absence note", from: " * THE FIX ROUND CHECKED THIS FOR autoDraft's REDUCER DEFECT AND IT IS STRUCTURALLY", to: " * Pinned by a cell rather than left as a claim (wave-e-f9-chatturn-v10.test.mjs).", lines: 12 },
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
    line("prompt/old field_path", "        field_path: z.string().optional(),"),
    line("prompt/old array describe", '    .describe("Cited facts (region id + exact quote) backing the amounts — REQUIRED for a document-bound draft."),'),
  ]);
  assert.equal(cutNew, cutOld, "outside the documented spans, chatTurn.v10.prompt.ts must be a version-renamed copy of v9");
});

test("chatTurn.v10.errors.ts is PURELY ADDITIVE over v9, except ONE widened type annotation", () => {
  const cutNew = cutLines(newBody("errors.ts"), [
    {
      label: "errors/evidence failure types",
      from: "/** The (idx, field_path) pairs a resolution refusal echoes back so the model can re-cite,",
      to: '  | { kind: "mislabelled"; entries: MislabelledCitation[] };',
      lines: 21,
      trailingBlanks: 2,
    },
    line("errors/runtimeRefusal reason widening", "export function runtimeRefusal(code: string, reason: Clr21Reason | EvidenceSystemReason | undefined, message: string): RefusalPart {"),
    { label: "errors/system reasons + messages", from: "/** F9 FIX ROUND (coordinator ruling 2, from Codex #3 + native Finding 1). The conditions", to: "};", lines: 55, trailingBlanks: 1 },
    { label: "errors/validIdxHint", from: "/** The (idx, field_path) hint appended to an unknown-index refusal. Derived entirely from the", to: "}", lines: 10, trailingBlanks: 1 },
    { label: "errors/evidenceSystemRefusal", from: "export function evidenceSystemRefusal(reason: EvidenceSystemReason, hint?: string): RefusalPart {", to: "}", lines: 5, trailingBlanks: 1 },
    { label: "errors/refusalForEvidenceFailure", from: "/** Map a failed resolution to its refusal. The ONE place the two failure kinds are given", to: "}", lines: 13, trailingBlanks: 1 },
  ]);
  const cutOld = cutLines(oldBody("errors.ts"), [
    line("errors/old runtimeRefusal signature", "export function runtimeRefusal(code: string, reason: Clr21Reason | undefined, message: string): RefusalPart {"),
  ]);
  assert.equal(cutNew, cutOld, "the ONLY edit to a carried line is runtimeRefusal's reason UNION — every mapping, message and factory is byte-identical to v9");
});

test("chatTurn.v10.tools.ts CARRIES every region v9 owned, byte-for-byte — the rewrite is confined to the evidence path", () => {
  const v10 = newBody("tools.ts");
  const v9 = oldBody("tools.ts");
  for (const name of ["normalizeCurrency", "readInvoiceFactState"]) {
    assert.equal(fnBody(v10, name), fnBody(v9, name), `${name} (doc comment included) must be byte-identical to v9`);
  }
  const carried = [
    ["the session-unbound guard + server reads", "  const clientId = ctx.clientId;\n  if (!clientId)", "    const filing = server.filing"],
    ["the counterparty passthrough + op_key", "    // 2. Assemble writer args.", "    const receipt = await writeScoped"],
    ["the receipt handling + je_review", "    if (!receipt.entry_id || !receipt.revision_token)", "/**\n * Build the v2 tool set for a segment."],
    ["list_unassigned_documents", "    list_unassigned_documents: tool({", "    read_document: tool({"],
    ["the client-scoped read tools", "    trial_balance: tool({", "    [DRAFT_TOOL]: tool({"],
  ];
  for (const [label, from, to] of carried) {
    assert.equal(slice(v10, from, to, label), slice(v9, from, to, label), `the "${label}" region must be byte-identical to v9`);
  }
});

// ===========================================================================
// 2. THE TOOLFACE
// ===========================================================================

const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";
const baseDraft = {
  coding_kind: "supplier_bill",
  posting_date: "2026-01-31",
  lines: LINES,
  document_id: DOC_A,
  counterparty: { existing_id: "33333333-3333-4333-8333-333333333333" },
};
const parse = (evidence) => promptV10.draftJournalEntryInputSchema.safeParse({ ...baseDraft, evidence });

test("the evidence element is { region_idx, quote, field_path } — all three REQUIRED, and a region_id is not accepted in its place", () => {
  assert.equal(parse([cite(1, "RM 1,000.00", "invoice.total")]).success, true);
  assert.equal(parse([{ region_idx: 1, quote: "q" }]).success, false, "field_path is REQUIRED after the fix round (ruling 5)");
  assert.equal(parse([{ region_id: REGION_TOTAL, quote: "q", field_path: "p" }]).success, false);
  assert.equal(parse([cite(1, "q", "")]).success, true, "an EMPTY field_path encodes a region that printed none");
  assert.equal(parse([]).success, false, "evidence stays REQUIRED");
});

test("the OTHER carried schema affordances still hold — the journal_entry kind and the optional counterparty", () => {
  const ev = [cite(1, "q", "p")];
  assert.equal(promptV10.draftJournalEntryInputSchema.safeParse({ ...baseDraft, coding_kind: "journal_entry", evidence: ev }).success, true);
  const noCp = { ...baseDraft };
  delete noCp.counterparty;
  assert.equal(promptV10.draftJournalEntryInputSchema.safeParse({ ...noCp, evidence: ev }).success, true);
});

const P10 = promptV10.SYSTEM_PROMPT_V10.replace(/\s+/g, " ");
const P9 = promptV9.SYSTEM_PROMPT_V9.replace(/\s+/g, " ");

test("v10's prompt teaches the idx, the PER-DOCUMENT read gate and the echo-the-label rule — all genuinely new", () => {
  for (const c of [
    "CITE A REGION BY ITS `idx`",
    "Call read_document for THAT document in this turn before you cite it",
    "reading one document never licenses citing another",
    "Echo each cited region's own field_path exactly as it was printed.",
  ]) {
    assert.ok(P10.includes(c), `v10 must carry: ${c}`);
    assert.ok(!P9.includes(c), `…and v9 must NOT: ${c}`);
  }
  for (const old of ["bounded text, and region ids you cite as evidence)", "an evidence array (region id + exact quote for each cited fact)"]) {
    assert.ok(P9.includes(old), `sanity: v9 carried: ${old}`);
    assert.ok(!P10.includes(old), `v10 must not: ${old}`);
  }
});

test("v10 carries every other load-bearing prompt invariant from v9, including v9's own anti-primacy sentence", () => {
  for (const c of [
    "A client-issued document — the client is the ISSUER, not the bill-to party — is NEVER coded here even if it superficially resembles a bill",
    "The database owns every number: never compute, sum, or invent a figure",
    "Direction first: from the extraction, decide which side the CLIENT is on.",
    "This ledger is MYR-only",
    "a clarify question AND its answer are VISIBLE TO THE WHOLE FIRM",
  ]) {
    assert.ok(P10.includes(c), `v10 must carry: ${c}`);
    assert.ok(P9.includes(c), `…genuinely CARRIED — present in v9 too: ${c}`);
  }
});

// ===========================================================================
// 3. RESOLUTION — the chat lane's own local copy, exercised independently.
// ===========================================================================

const readRev = extractRev(READ_EXTRACT);

test("resolution is BY THE idx FIELD, not by array position", () => {
  const r = resolveEvidenceRegions(READ_EXTRACT, [cite(1, "ACME SDN BHD", "invoice.vendor_name"), cite(2, "RM 1,000.00", "invoice.total")], readRev);
  assert.equal(r.ok, true, `expected a resolution, got ${JSON.stringify(r)}`);
  assert.deepEqual(r.evidence.map((e) => e.region_id), [REGION_VENDOR, REGION_TOTAL]);
});

test("THE DRIFT GATE: a snapshot that moved between the read and the draft REFUSES, even though the drifted region carries the identical quote", () => {
  const r = resolveEvidenceRegions(DRIFTED_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total")], readRev);
  assert.equal(r.ok, false);
  assert.equal(r.failure.reason, "evidence_snapshot_changed");
});

test("the other four gates: no read, duplicate idx, no ordinal, unknown idx", () => {
  assert.equal(resolveEvidenceRegions(READ_EXTRACT, [cite(2, "q", "invoice.total")], undefined).failure.reason, "evidence_not_read");
  const dup = { regions: [READ_EXTRACT.regions[1], { ...READ_EXTRACT.regions[2], idx: 1, id: REGION_DATE }] };
  assert.equal(resolveEvidenceRegions(dup, [cite(1, "q", "p")], extractRev(dup)).failure.reason, "evidence_index_ambiguous");
  assert.equal(resolveEvidenceRegions(PRE_0054_EXTRACT, [cite(1, "q", "p")], extractRev(PRE_0054_EXTRACT)).failure.reason, "evidence_index_unavailable");
  const unknown = resolveEvidenceRegions(READ_EXTRACT, [cite(9, "q", "p")], readRev);
  assert.equal(unknown.failure.reason, "evidence_index_unknown");
  assert.deepEqual(unknown.failure.valid.map((v) => v.idx), [1, 2, 3]);
});

test("the field_path CROSS-CHECK: a wrong label is a MISLABEL, a pathless region stays citable via the empty label, and the resolved label is the REGION's own", () => {
  assert.equal(resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.amount_due")], readRev).failure.kind, "mislabelled");
  const pathless = { regions: [{ ...READ_EXTRACT.regions[1], field_path: null }] };
  const rev = extractRev(pathless);
  assert.equal(resolveEvidenceRegions(pathless, [cite(1, "ACME SDN BHD", "invoice.total")], rev).failure.kind, "mislabelled");
  const honest = resolveEvidenceRegions(pathless, [cite(1, "ACME SDN BHD", "")], rev);
  assert.equal(honest.ok, true);
  assert.ok(!("field_path" in honest.evidence[0]));
  assert.equal(resolveEvidenceRegions(READ_EXTRACT, [cite(2, "RM 1,000.00", "invoice.total")], readRev).evidence[0].field_path, "invoice.total");
});

test("every SYSTEM reason is `transient`, never evidence_invalid; a genuine mislabel keeps evidence_invalid", () => {
  for (const reason of ["evidence_not_read", "evidence_snapshot_changed", "evidence_index_unavailable", "evidence_index_unknown", "evidence_index_ambiguous"]) {
    const r = errorsV10.evidenceSystemRefusal(reason);
    assert.equal(r.code, "transient");
    assert.notEqual(r.reason, "evidence_invalid");
  }
  const mis = errorsV10.refusalForEvidenceFailure({ kind: "mislabelled", entries: [{ idx: 2, cited: "invoice.total", actual: null }] });
  assert.equal(mis.code, "CLR21");
  assert.equal(mis.reason, "evidence_invalid");
  assert.ok(mis.message.includes("region_idx 2 is unlabelled"));
});

// ===========================================================================
// 4. THE WRAPPER, end to end — including the chat lane's own A/B document hole.
// ===========================================================================

const ctx = { firmId: "F", clientId: "c1", createdBy: "u1", taskId: "task-7" };
const draftInput = (evidence, document_id = DOC_A) => ({ ...baseDraft, document_id, evidence });
const readsFor = (extract, doc = DOC_A) => {
  const m = newReadSnapshots();
  m.set(doc, extractRev(extract));
  return m;
};

test("wrapper: a citation from the snapshot the model read reaches the writer as a REGION_ID plus the REGION's own label", async () => {
  const w = stubPools(READ_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.deepEqual(JSON.parse(w.params[11]), [{ region_id: REGION_TOTAL, quote: "RM 1,000.00", field_path: "invoice.total" }]);
});

test("wrapper: THE DRIFT CELL — an extraction landing between the read and the draft is REFUSED, and the writer is never reached", async () => {
  const w = stubPools([DRIFTED_EXTRACT]);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "evidence_snapshot_changed");
  assert.equal(w.writes, 0);
});

test("wrapper: THE A/B CELL (native Finding 2) — reading document A never licenses citing document B, even though idx 2 exists in both", async () => {
  const w = stubPools(READ_EXTRACT);
  // The run read A. The draft names B. Under v9 the DB wall refused this structurally (the
  // region_id did not belong to B); an index has no such property, so the gate must.
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")], DOC_B), readsFor(READ_EXTRACT, DOC_A));
  assert.equal(r.ok, false, "a citation must never cross documents");
  assert.equal(r.refusal.reason, "evidence_not_read");
  assert.equal(w.writes, 0);
});

test("wrapper: the read record is PER DOCUMENT — with B read too, the same draft goes through", async () => {
  const w = stubPools(READ_EXTRACT);
  const reads = readsFor(READ_EXTRACT, DOC_A);
  reads.set(DOC_B, extractRev(READ_EXTRACT));
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")], DOC_B), reads);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(w.writes, 1);
});

test("wrapper: the deploy window refuses as a SYSTEM condition, and the identical input resolves once the ordinal is published", async () => {
  const w = stubPools(PRE_0054_EXTRACT);
  const r = await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(PRE_0054_EXTRACT));
  assert.equal(r.refusal.reason, "evidence_index_unavailable");
  assert.notEqual(r.refusal.reason, "evidence_invalid");
  assert.equal(w.writes, 0);
  const w2 = stubPools(READ_EXTRACT);
  assert.equal((await runDraftJournalEntry(ctx, draftInput([cite(2, "RM 1,000.00", "invoice.total")]), readsFor(READ_EXTRACT))).ok, true);
  assert.equal(w2.writes, 1);
});

test("wrapper: the carried v9 guard still fires FIRST — an unbound session is still session_unbound", async () => {
  const w = stubPools(READ_EXTRACT);
  const r = await runDraftJournalEntry({ ...ctx, clientId: null }, draftInput([cite(2, "q", "invoice.total")]), readsFor(READ_EXTRACT));
  assert.equal(r.refusal.reason, "session_unbound");
  assert.equal(w.writes, 0);
});

test("the tool set wires the gate PER DOCUMENT: read_document records under the document it read, and the draft tool is handed that record", () => {
  const toolsSrc = src("chatTurn.v10.tools.ts");
  assert.ok(toolsSrc.includes("const reads = newReadSnapshots();"));
  assert.ok(toolsSrc.includes("reads.set(document_id, extractRev(extract));"), "keyed by THE DOCUMENT THAT WAS READ, not by the turn");
  assert.ok(toolsSrc.includes("reads.get(input.document_id)"), "and looked up by THE DOCUMENT BEING DRAFTED");
  assert.ok(toolsSrc.includes("runDraftJournalEntry(ctx, input, reads)"));
});

// ===========================================================================
// 5. THE RETRY LEG — checked here for autoDraft's reducer defect, and pinned ABSENT.
//     autoDraft's toAutoDraftOutcome collapsed a whole model loop to one terminal outcome
//     and returned on the FIRST draft result, so [transient, success] settled the run
//     failed (fixed in v7; the v7 suite owns those cells). The chat lane's analogue is
//     toTypedParts_v10 — a MAP, not a reducer — so the sequence must keep BOTH parts and
//     the card must still be there. Pinned rather than asserted in a comment.
// ===========================================================================

const draftResult = (output, id) => ({ type: "tool-result", toolCallId: id, toolName: "draft_journal_entry", output });
const TRANSIENT = { ok: false, refusal: { type: "refusal", code: "transient", reason: "evidence_snapshot_changed", message: "…re-read and re-cite." } };
const SUCCESS = {
  ok: true,
  je_review: { type: "je_review", entry_id: "entry-9", revision_token: "rev-9", client_id: "c1", document_id: DOC_A, provenance_tier: "model_read" },
};

test("THE RETRY SEQUENCE keeps BOTH parts and the card: [transient refusal, then a successful draft] promotes the refusal AND the je_review, in order — no collapse to the first result", () => {
  const parts = promptV10.toTypedParts_v10([
    { type: "tool-call", toolCallId: "call-1", toolName: "draft_journal_entry", input: {} },
    draftResult(TRANSIENT, "call-1"),
    { type: "tool-call", toolCallId: "call-2", toolName: "draft_journal_entry", input: {} },
    draftResult(SUCCESS, "call-2"),
  ]);
  const promoted = parts.filter((p) => p.type === "je_review" || p.type === "refusal");
  assert.deepEqual(promoted.map((p) => p.type), ["refusal", "je_review"], "both survive, in the order they happened — the transcript's honest record of 'the extraction moved, I re-read, here is the draft'");
  assert.equal(promoted[1].entry_id, "entry-9", "the card the human approves is present");
  assert.equal(promoted[0].reason, "evidence_snapshot_changed");
});

test("…and the chat lane settles on that transcript, not on a derived outcome — its C-19 terminal invariant is satisfied by the je_review, so no synthesized coding_incomplete refusal can bury a real draft", () => {
  const entry = src("chatTurn.v10.ts");
  assert.match(entry, /const hasTerminal = allParts\.some\(\(p\) => p\.type === "je_review" \|\| p\.type === "refusal" \|\| p\.type === "clarify"\);/);
  assert.match(entry, /if \(!hasTerminal\) pushPart\(allParts, codingIncompleteRefusal\(\)\);/);
  assert.doesNotMatch(src("chatTurn.v10.prompt.ts"), /export function toAutoDraftOutcome/, "the chat closure has no outcome reducer at all — the defect has no surface here");
});

// ===========================================================================
// 6. Registry sanity.
// ===========================================================================

// The pin moved v10 -> v11 at the Wave-E eta cutover (2026-08-15). This battery still owns
// v10's BODY, which is byte-untouched — v11 imports v10's infra and errors rather than
// copying them — so everything above stays exactly as it was. Only the pin assertion moves,
// and v10 joins the policy (c) roster it used to sit at the head of.
test("registry.ts pins chatTurn: chatTurn_v11, and still exports the superseded v10/v9/v8 (policy (c))", () => {
  assert.equal(registryMod.workflows.chatTurn.name, "chatTurn_v11");
  assert.equal(typeof registryMod.chatTurn_v10, "function");
  assert.equal(typeof registryMod.chatTurn_v9, "function");
  assert.equal(typeof registryMod.chatTurn_v8, "function");
});
