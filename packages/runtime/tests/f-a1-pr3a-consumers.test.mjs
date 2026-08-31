// F-A1 PR-3a — the autoDraft_v8 / chatTurn_v12 consumer-widening battery (design
// docs/plan/active/f-a1-witness-pair-design.md §3.8, the M7 selection rule; Annex C's
// idx-stability cell). Companion to autoDraft.v8.tools.ts / chatTurn.v12.tools.ts — see those
// files' headers for the single statement of what changed and why.
//
// SECTION 1's TEST BODIES touch no DB (registry sanity + the widened kind literal is really
// present in source — the bundle-grep companion after `pnpm --filter @clara/runtime build`);
// the FILE as a whole is not DB-free — rig.mjs refuses to load without a reachable DB target
// in the environment, and the readiness probes below run at import time regardless of which
// section's tests actually execute.
// SECTION 2 goes through the REAL `clara.get_document_extract` RPC against a live rig (never a
// hand-typed JS fixture for the cross-regime cells) — the point being that `readInvoiceFactState`'s
// `extracted_at` parsing has to survive whatever string Postgres actually serializes a
// `timestamptz` to, not an assumed ISO format.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import * as fa1 from "./f-a1-pr3a-testkit.mjs";
import { stubPools } from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const registryMod = await import("../workflows/registry.ts");
const toolsV8 = await import("../workflows/autoDraft.v8.tools.ts");
const toolsV7 = await import("../workflows/autoDraft.v7.tools.ts");
const toolsV12 = await import("../workflows/chatTurn.v12.tools.ts");

// Readiness probes run BEFORE any test() registration (the authz-db.test.mjs ordering): a
// top-level await interspersed AFTER some test() calls races node:test's own completion
// detection for a single-file run (observed: the file's `after` hook fired and closed the pool
// while these awaits were still in flight, then a later query threw "pool after end").
const RUNTIME_READY = await rig.runtimeReady();
const DOC_READY = RUNTIME_READY ? await rig.documentPipelineReady() : false;
const WITNESS_READY = DOC_READY ? await fa1.witnessReady() : false;
const skip = WITNESS_READY ? false : "F-A1 PR-1 chain (0089-0095) not applied on this rig";

after(async () => {
  await rig.endPool();
});

// ===========================================================================
// 1. Registry sanity + the widened kind literal, in source.
// ===========================================================================

// F-A6 PR-2 moved the chatTurn pin v14 -> v15 (the audited freeform read); autoDraft is
// untouched. v14's assertion does not become wrong, it becomes a POLICY (c) assertion — the
// same ladder every prior bump added to. EXTENDED, never re-cut.
// P6-1 (Q8's four-card wire bump) moved it again, v15 -> v16, and v15 joins the same ladder for
// the same reason. autoDraft is still untouched — stated because this cell's subject is the
// PAIR, and a bump that moved only one of them is exactly what it exists to notice.
test("registry.ts pins autoDraft_v9/chatTurn_v16 and still exports superseded v8/v15/v14/v13/v12 (policy (c))", () => {
  assert.equal(registryMod.workflows.autoDraft.name, "autoDraft_v9");
  assert.equal(registryMod.workflows.chatTurn.name, "chatTurn_v16");
  assert.equal(typeof registryMod.autoDraft_v8, "function");
  assert.equal(typeof registryMod.chatTurn_v15, "function");
  assert.equal(typeof registryMod.chatTurn_v14, "function");
  assert.equal(typeof registryMod.chatTurn_v13, "function");
  assert.equal(typeof registryMod.chatTurn_v12, "function");
});

test("autoDraft.v8.tools.ts (source) carries the widened kind literal and never a bare cross-regime Math.max", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../workflows/autoDraft.v8.tools.ts", import.meta.url), "utf8");
  assert.ok(src.includes('"llm_text_facts"'), "v8 must filter to the witness text kind");
  assert.ok(src.includes('"invoice_facts"'), "v8 must still filter to the legacy kind");
  assert.ok(src.includes("resolveRegimeGeneration"), "the per-regime resolver must be present");
  assert.ok(src.includes("extractedAt"), "cross-regime precedence must read extracted_at");
});

// ===========================================================================
// 2. DB-backed cells. Gated: skip cleanly on a pre-PR-1 database; DRIFT (throw) on a
// half-applied one (fa1.witnessReady's own contract, mirroring packages/db/tests/f-a1-fixtures.mjs).
// ===========================================================================

test("a witness-regime document is SELECTED beside a legacy invoice_facts v3 document — both resolve correctly, neither drops", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a1");

  const legacyDoc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedLegacyInvoiceFacts({ firm, document: legacyDoc, versionN: 3, totalCents: 250000, confidence: 0.99 });
  const legacyExtract = await fa1.realExtract(owner, legacyDoc, client);
  const legacyState = toolsV8.readInvoiceFactState(legacyExtract);
  assert.equal(legacyState.corroborated, true, "legacy-only document must still corroborate under v8");
  assert.equal(legacyState.verifiedTotalCents, 250000);

  const witnessDoc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedWitnessPair({ firm, document: witnessDoc, versionN: 1, totalCents: 375000 });
  const witnessExtract = await fa1.realExtract(owner, witnessDoc, client);
  const witnessState = toolsV8.readInvoiceFactState(witnessExtract);
  assert.equal(witnessState.corroborated, true, "a witness-only document must be SELECTED, not dropped, by the widened filter");
  assert.equal(witnessState.verifiedTotalCents, 375000);
});

test("a legacy-only document's v8 outcome is BYTE-IDENTICAL to v7's outcome on the SAME real extract (no legacy behavior change)", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a2");
  const doc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedLegacyInvoiceFacts({ firm, document: doc, versionN: 2, totalCents: 88000, confidence: 0.97 });
  const extract = await fa1.realExtract(owner, doc, client);
  assert.deepEqual(toolsV8.readInvoiceFactState(extract), toolsV7.readInvoiceFactState(extract), "v8 must reproduce v7 exactly for a legacy-only document");
});

test("the confidence mirror: a witness region with NULL confidence passes v8's mirror when the DB verdict corroborates, and a low-confidence legacy generation does NOT corroborate — identically to v7", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a3");

  const witnessDoc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedWitnessPair({ firm, document: witnessDoc, versionN: 1, totalCents: 42000 });
  const witnessExtract = await fa1.realExtract(owner, witnessDoc, client);
  const totalRegion = witnessExtract.regions.find((r) => r.engine_kind === "llm_text_facts" && r.field_path === "invoice.total");
  assert.equal(totalRegion.engine_confidence, null, "fixture premise: a witness region really is engine_confidence NULL");
  assert.equal(toolsV8.readInvoiceFactState(witnessExtract).corroborated, true, "NULL confidence must not block a witness verdict — the DB gate carries no confidence term (0023 postverify)");

  const lowConfDoc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedLegacyInvoiceFacts({ firm, document: lowConfDoc, versionN: 1, totalCents: 42000, confidence: 0.5 });
  const lowConfExtract = await fa1.realExtract(owner, lowConfDoc, client);
  const v8Low = toolsV8.readInvoiceFactState(lowConfExtract);
  const v7Low = toolsV7.readInvoiceFactState(lowConfExtract);
  assert.equal(v8Low.corroborated, false, "a legacy generation below 0.95 confidence must still fail to corroborate under v8");
  assert.deepEqual(v8Low, v7Low, "…and the outcome must match v7's exactly");
});

test("cross-regime precedence: a witness pair minted AFTER a legacy v3 read WINS by extracted_at, and vice versa", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a4");

  // Case A: legacy first, witness lands later -> witness wins.
  const docA = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedLegacyInvoiceFacts({ firm, document: docA, versionN: 3, totalCents: 111100 });
  await new Promise((r) => setTimeout(r, 20)); // ensure clock_timestamp() actually advances
  await fa1.seedWitnessPair({ firm, document: docA, versionN: 1, totalCents: 222200 });
  const extractA = await fa1.realExtract(owner, docA, client);
  const stateA = toolsV8.readInvoiceFactState(extractA);
  assert.equal(stateA.verifiedTotalCents, 222200, "the FRESHER witness pair must win over the older legacy v3 by extracted_at, never by version_n");

  // Case B: witness first, legacy re-extraction lands later -> legacy wins.
  const docB = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedWitnessPair({ firm, document: docB, versionN: 1, totalCents: 333300 });
  await new Promise((r) => setTimeout(r, 20));
  await fa1.seedLegacyInvoiceFacts({ firm, document: docB, versionN: 4, totalCents: 444400 });
  const extractB = await fa1.realExtract(owner, docB, client);
  const stateB = toolsV8.readInvoiceFactState(extractB);
  assert.equal(stateB.verifiedTotalCents, 444400, "the FRESHER legacy re-extraction must win over the older witness pair by extracted_at");
});

test("idx-stability: the snapshot-map resolution survives a witness persist renumbering the OCR region idx", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a5");
  const doc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });

  // An 'ocr' extraction + region — witness kinds sort BEFORE 'ocr' (0054:280 / design §3.8),
  // so landing a witness pair afterward renumbers this region's idx.
  const ocrExtraction = (await rig.rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
       values($1,$2,'azure-di:prebuilt-layout:4.0','ocr',1,'done',1) returning id`,
    [firm, doc],
  )).rows[0].id;
  await rig.rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}',null,'RM 900.00',0.9)`,
    [firm, ocrExtraction],
  );

  const before = await fa1.realExtract(owner, doc, client);
  const ocrRegionBefore = before.regions.find((r) => r.engine_kind === "ocr");
  assert.ok(ocrRegionBefore, "fixture premise: the ocr region is citable before any witness persist");
  const readRev = toolsV8.extractRev(before);
  const citedIdx = ocrRegionBefore.idx;

  await fa1.seedWitnessPair({ firm, document: doc, versionN: 1, totalCents: 90000 });
  const after = await fa1.realExtract(owner, doc, client);
  const ocrRegionAfter = after.regions.find((r) => r.engine_kind === "ocr");
  assert.notEqual(ocrRegionAfter.idx, citedIdx, "fixture premise: the witness persist really did renumber the ocr region's idx");

  // A citation against the STALE snapshot refuses — never silently resolves the wrong region.
  const stale = toolsV8.resolveEvidenceRegions(after, [{ region_idx: citedIdx, quote: "RM 900.00", field_path: "" }], readRev);
  assert.equal(stale.ok, false);
  assert.equal(stale.failure.reason, "evidence_snapshot_changed");

  // A FRESH read + re-cite against the NEW snapshot succeeds.
  const freshRev = toolsV8.extractRev(after);
  const fresh = toolsV8.resolveEvidenceRegions(after, [{ region_idx: ocrRegionAfter.idx, quote: "RM 900.00", field_path: "" }], freshRev);
  assert.equal(fresh.ok, true, "re-reading and re-citing against the new snapshot must succeed");
  assert.equal(fresh.evidence[0].region_id, ocrRegionAfter.id);
});

test("chatTurn.v12: the SAME widening reaches provenance_tier through runDraftJournalEntry (its readInvoiceFactState is private, unlike autoDraft's)", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a6");
  const doc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedWitnessPair({ firm, document: doc, versionN: 1, totalCents: 60000 });
  const extract = await fa1.realExtract(owner, doc, client);

  stubPools(extract);
  const ctx = { firmId: firm, clientId: client, createdBy: owner, taskId: "task-f3a1" };
  const reads = toolsV12.newReadSnapshots();
  reads.set(doc, toolsV12.extractRev(extract));
  const draftInput = {
    coding_kind: "supplier_bill",
    posting_date: "2026-01-31",
    lines: [
      { account_code: "600-000", debit_cents: 60000, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 60000 },
    ],
    document_id: doc,
    counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
    evidence: [{ region_idx: extract.regions.find((r) => r.field_path === "invoice.total").idx, quote: "RM 600.00", field_path: "invoice.total" }],
  };
  const result = await toolsV12.runDraftJournalEntry(ctx, draftInput, reads);
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  assert.equal(result.je_review.provenance_tier, "verified", "a witness-corroborated document must reach chatTurn's DETECTED tier (the DB receipt is the true authority; this proves the FRIENDLY hint is no longer stale for a witness document)");
});

test("chatTurn.v12: buildToolsV12's compose-over-spread wiring, end to end — read_document and draft_journal_entry are the REAL built tool objects, sharing ONE reads map", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("f3a7");
  const doc = await fa1.seedFiledDocument({ firm, uploadedBy: owner, client });
  await fa1.seedWitnessPair({ firm, document: doc, versionN: 1, totalCents: 45000 });
  const extract = await fa1.realExtract(owner, doc, client);

  stubPools(extract);
  const ctx = { firmId: firm, clientId: client, createdBy: owner, taskId: "task-f3a7" };
  const tools = toolsV12.buildToolsV12(ctx);
  // read_document is the OVERRIDE, not v11's shadowed original — it must populate the SAME
  // `reads` map draft_journal_entry's own override reads from (the one real risk the
  // spread-over-buildToolsV11 composition carries: two DIFFERENT `reads` maps would silently
  // refuse every citation as evidence_not_read).
  const readResult = await tools.read_document.execute({ document_id: doc });
  assert.ok(readResult && typeof readResult === "object" && !("error" in readResult), `read_document must succeed, got ${JSON.stringify(readResult)}`);
  const totalRegion = readResult.regions.find((r) => r.field_path === "invoice.total");
  assert.ok(totalRegion, "fixture premise: the witness total region is readable");

  const draftResult = await tools.draft_journal_entry.execute({
    coding_kind: "supplier_bill",
    posting_date: "2026-01-31",
    lines: [
      { account_code: "600-000", debit_cents: 45000, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 45000 },
    ],
    document_id: doc,
    counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
    evidence: [{ region_idx: totalRegion.idx, quote: "RM 450.00", field_path: "invoice.total" }],
  });
  assert.equal(draftResult.ok, true, `expected ok, got ${JSON.stringify(draftResult)}`);
  assert.equal(draftResult.je_review.provenance_tier, "verified", "the REAL built tool set must reach the same witness-corroborated tier the direct runDraftJournalEntry call does");
});
