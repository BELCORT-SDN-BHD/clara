// The C-b acceptance finding (2026-07-31, found by the FIRST live statement ingest): the
// 0017 authoritative-extraction trigger supersedes KIND-BLIND — in the ordinary pipeline
// order (intake OCR → classify verdict → human kind-stamp) every statement's layout
// geometry arrives at reader-1 already "superseded" by a doc_classify extraction, and the
// original `superseded_by is null` filter returned ZERO regions for EVERY real document.
// The invoice lane never noticed because it reads extraction ENVELOPES, not regions —
// reader-1 is the first regions-reader that runs after a classify in real order, and the
// batteries staged regions without a subsequent classify mint, so only live could catch it.
//
// These cells stage the REAL order against the REAL trigger and pin the kind-honest read:
// a classify verdict must NOT starve the geometry; a genuine later re-OCR MUST win.
//
// SECOND ERA (2026-08-18, migration 0089 — F-A1 PR-1): the 0017 trigger itself went
// KIND-SCOPED, so a doc_classify verdict no longer supersedes the ocr row AT ALL — the
// hazard the first cell was minted for is now structurally impossible for cross-kind
// landings, and its mandatory setup asserts the NEW live shape (ocr stays unsuperseded).
// The cell is kept, not deleted: reader-1's kind-honest filter must stay correct under
// BOTH shapes (statement-layout-reader.mjs:111 only treats an ocr row as dead when its
// superseder is ITSELF an ocr row — true in either era), and the within-kind half of the
// original hazard still exists and is pinned by the re-OCR cell below.

import { after, test } from "node:test";
import assert from "node:assert/strict";

import * as rig from "./rig.mjs";
import { seedVerifiedDocument } from "./matcher-testkit.mjs";
import { readStatementLayoutRegions } from "../lib/statement-layout-reader.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "document pipeline not ready on this rig";

after(async () => { await rig.endPool(); });

async function seedExtraction({ firm, document, engineId, engineKind, versionN = 1 }) {
  const r = await rig.rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
       values($1,$2,$3,$4,$5,'done',1) returning id`,
    [firm, document, engineId, engineKind, versionN],
  );
  return r.rows[0].id;
}

async function seedRegion({ firm, extraction, fieldPath, textContent }) {
  await rig.rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}',$3,$4,0.99)`,
    [firm, extraction, fieldPath, textContent],
  );
}

test("a doc_classify verdict does NOT starve reader-1: since 0089 it never supersedes the ocr row, and the geometry stays readable in the real pipeline order", { skip }, async () => {
  const { firm, owner } = await rig.buildFirm();
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });

  // 1. The intake OCR pass lands first (geometry).
  const ocr = await seedExtraction({
    firm, document, engineId: "azure-di:prebuilt-layout:2024-11-30", engineKind: "ocr",
  });
  await seedRegion({ firm, extraction: ocr, fieldPath: "line", textContent: "BEGINNING BALANCE 0.00" });
  await seedRegion({ firm, extraction: ocr, fieldPath: "line", textContent: "ENDING BALANCE 0.00" });

  // 2. Then the classifier verdicts land — the REAL trigger fires on each insert. Since
  //    0089 (kind-scoped supersede) a doc_classify verdict touches ONLY its own kind:
  //    the OCR row must come out of this with superseded_by still NULL.
  await seedExtraction({ firm, document, engineId: "clara-classify-llm:v1", engineKind: "doc_classify" });
  await seedExtraction({ firm, document, engineId: "clara-classify-human:v1", engineKind: "doc_classify" });

  const sup = await rig.rootQuery(
    `select e.superseded_by from clara.document_extractions e where e.id = $1`, [ocr]);
  assert.equal(sup.rows[0]?.superseded_by, null,
    "mandatory setup: since 0089 the REAL trigger leaves the ocr row UNSUPERSEDED by a doc_classify verdict — the exact live shape (the pre-0089 kind-blind supersede is the hazard this cell was minted for, now structurally gone)");

  const regions = await rig.asRoot((client) => readStatementLayoutRegions(client, { documentId: document, firmId: firm }));
  assert.equal(regions.length, 2, "reader-1 still reads the geometry — a classify verdict replaces classify authority, never the page");
  assert.equal(regions[0].extraction_id, String(ocr), "and it reads it from the ORIGINAL ocr extraction");
});

test("a genuine later re-OCR DOES replace the geometry: newest ocr wins, the old one is honestly dead", { skip }, async () => {
  const { firm, owner } = await rig.buildFirm();
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });

  const ocr1 = await seedExtraction({
    firm, document, engineId: "azure-di:prebuilt-layout:2024-11-30", engineKind: "ocr", versionN: 1,
  });
  await seedRegion({ firm, extraction: ocr1, fieldPath: "line", textContent: "OLD READ" });
  // A classify lands between the two reads (the realistic order for a re-OCR after a
  // mis-read) — it must not confuse the kind-honest pick either way.
  await seedExtraction({ firm, document, engineId: "clara-classify-llm:v1", engineKind: "doc_classify" });
  const ocr2 = await seedExtraction({
    firm, document, engineId: "azure-di:prebuilt-layout:2024-11-30", engineKind: "ocr", versionN: 2,
  });
  await seedRegion({ firm, extraction: ocr2, fieldPath: "line", textContent: "NEW READ" });

  const regions = await rig.asRoot((client) => readStatementLayoutRegions(client, { documentId: document, firmId: firm }));
  assert.equal(regions.length, 1, "exactly the newest ocr read's regions");
  assert.equal(regions[0].extraction_id, String(ocr2), "the LATER re-OCR wins");
  assert.equal(regions[0].text_content, "NEW READ");
});
