// F-A1 witnessFacts_v1 — THE LOCATOR-KEY BATTERY: a positive cell and its negative twin.
//
// `normalizeAzureLayout` (lib/egress.mjs) now writes BOTH page spellings — `page` for the F-A1
// witness estate (clara.witness_citation_regions 0095:301, the writer's fact locator 0095:565/605,
// clara.evaluate_witness_identity_v1's page grouping 0091:150/166) and `page_number` for the
// pre-F-A1 readers (0028:275-276, 0028:306-307, 0030:268-269, statement-layout-reader.mjs:152,
// table-cell-geometry.mjs:46). The fix is at the SOURCE because 0091's leaf is a frozen evaluator
// closure member: re-minting it as a `_v2` over a key spelling is not worth the ceremony.
//
// WHY THIS FILE IS A PAIR. Before the change, a witness pair's fact regions landed with a NULL
// page, so the identity leaf's geometry test refused on EVERY document — fail-closed, but
// vacuous: the D12 defense would never have fired in production. A cell that only proved
// "refuses" could not tell those two states apart. So the POSITIVE cell drives real producer
// output all the way to a NON-VACUOUS identity verdict, and the NEGATIVE twin pins the shape that
// is still on disk.
//
// THE NAMED INTERIM LIMITATION, measured by the twin rather than remembered: clara.document_regions
// is append-only and nothing back-fills it, so OCR committed BEFORE this producer changed carries
// `page_number` only. A witness run over such a document still publishes a null page and its
// identity verdicts still refuse until that document is re-OCR'd. AMOUNTS ARE UNAFFECTED — C2's
// geometry conjunct anchors on the polygon, not the page — which the twin also asserts.
//
// Real Postgres migrated 0001→0095; the model is the only mocked thing.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as fx from "./relay-fixtures.mjs";
import {
  buildWitnessSituation, readFactRegions, readWitnessIdentity, readWitnessState,
  seedAzureRegions, witnessMock, witnessServices, witnessWire,
} from "./f-a1-witness-fixtures.mjs";
import { persistWitnessPair, runWitnessTextRead, runWitnessVisionRead } from "../workflows/witnessFacts.v1.behavior.mjs";

const READY = await witnessReady();
const skip = READY ? false : "F-A1 witness estate absent";
const withRuntime = (fn) => fx.asRuntime(fn);
let tmpRoot;
const services = () => witnessServices(tmpRoot);

async function witnessReady() {
  const r = await fx.rootQuery(
    `select to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
        and to_regprocedure('clara.evaluate_witness_identity_v1(uuid,uuid,boolean)') is not null as ok`);
  return r.rows[0].ok === true;
}

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  tmpRoot = await mkdtemp(join(base, "clara-witness-loc-"));
});
after(async () => {
  delete globalThis.__claraModelForTest;
  await fx.endPool();
  await rm(tmpRoot, { recursive: true, force: true });
});

/** Four party blocks laid out so the geometry test has a real answer: each registration sits one
 *  unit below its OWN name and ~45 units from the other party's, so the strictly-closer test
 *  resolves rather than tying. Plus the amount lines, so the same document also corroborates.
 *  Rectangles are expanded to four-corner polygons by the fixture, exactly as Azure emits them. */
const PARTY_LINES = [
  { text: "ACME SUPPLIES SDN BHD", box: [0, 0, 10, 2] },
  { text: "Co. Reg. No. 201901000001", box: [0, 3, 10, 5] },
  { text: "BILL TO: KOPITIAM ENTERPRISE", box: [0, 50, 10, 52] },
  { text: "Reg No: 202205000002", box: [0, 53, 10, 55] },
  { text: "TOTAL DUE RM 103.75 nett", box: [0, 60, 10, 62] },
  { text: "SUBTOTAL RM 94.30", box: [0, 63, 10, 65] },
  { text: "SST 6% RM 5.66", box: [0, 66, 10, 68] },
  { text: "SERVICE CHARGE RM 3.77", box: [0, 69, 10, 71] },
  { text: "ROUNDING ADJ RM 0.02", box: [0, 72, 10, 74] },
  { text: "Currency stated: MYR only", box: [0, 75, 10, 77] },
  { text: "Doc Type Code: 01", box: [0, 78, 10, 80] },
];

/** The eleven belt citations plus the FOUR identity blocks, cited through the optional reference
 *  paths (which carry their quoted rendering in the citation itself — 0095 §10). */
function partyCitations(published) {
  const idx = (needle) => published.find((r) => r.text_content.includes(needle)).idx;
  return [
    { field_path: "invoice.total", region_idx: idx("TOTAL DUE"), raw: null },
    { field_path: "invoice.total_excl_tax", region_idx: idx("SUBTOTAL"), raw: null },
    { field_path: "invoice.tax_total", region_idx: idx("SST"), raw: null },
    { field_path: "invoice.service_charge", region_idx: idx("SERVICE CHARGE"), raw: null },
    { field_path: "invoice.rounding", region_idx: idx("ROUNDING"), raw: null },
    { field_path: "invoice.currency", region_idx: idx("Currency stated"), raw: null },
    { field_path: "invoice.type_code", region_idx: idx("Doc Type Code"), raw: null },
    { field_path: "invoice.vendor_name", region_idx: idx("ACME SUPPLIES"), raw: "ACME SUPPLIES SDN BHD" },
    { field_path: "invoice.vendor_registration", region_idx: idx("201901000001"), raw: "201901000001" },
    { field_path: "invoice.customer_name", region_idx: idx("KOPITIAM"), raw: "KOPITIAM ENTERPRISE" },
    { field_path: "invoice.customer_registration", region_idx: idx("202205000002"), raw: "202205000002" },
  ];
}

const publishedNumbering = (ocrId) =>
  fx.rootQuery("select idx, page, region_id, text_content from clara.witness_citation_regions($1) order by idx", [ocrId])
    .then((r) => r.rows);

async function runPair(s, citations) {
  witnessMock({ text: { ...witnessWire(), citations }, vision: witnessWire() });
  const textRead = await runWitnessTextRead(services(), withRuntime, s.taskId, s.claimDoc);
  const visionRead = await runWitnessVisionRead(services(), withRuntime, s.taskId, s.claimDoc);
  return persistWitnessPair(services(), withRuntime, s.taskId, textRead, visionRead);
}

// =======================================================================================

test("f-a1.pr2.q1 POSITIVE — regions from the REAL producer carry a page end to end, and the identity geometry is NON-VACUOUS", { skip }, async () => {
  const s = await buildWitnessSituation("azureproducer", { regions: [] });
  const seeded = await seedAzureRegions({ firm: s.firm, extraction: s.ocrId, lines: PARTY_LINES });

  // (1) THE PRODUCER ITSELF writes both keys — read off its own output, not off the DB, so this
  //     is a statement about normalizeAzureLayout rather than about what a fixture inserted.
  for (const r of seeded.regions) {
    assert.equal(r.locator.page, 1, "normalizeAzureLayout writes `page` (the witness estate's spelling)");
    assert.equal(r.locator.page_number, 1, "…and KEEPS `page_number` for its pre-F-A1 readers — additive, nothing moved");
  }

  // (2) the witness door publishes that page.
  const published = await publishedNumbering(s.ocrId);
  assert.equal(published.length, PARTY_LINES.length);
  for (const row of published) assert.equal(row.page, 1, "every published region carries its page");

  // (3) a real pair, citing the four identity blocks.
  const out = await runPair(s, partyCitations(published));

  // (4) the page survives the WRITER's locator build onto the fact region — the row the identity
  //     leaf actually groups on (0091:166 filters `(locator->>'page') ~ '^[0-9]+$'`).
  const facts = await readFactRegions(out.receipt.text_extraction_id);
  for (const path of ["invoice.vendor_name", "invoice.vendor_registration",
    "invoice.customer_name", "invoice.customer_registration"]) {
    const f = facts.find((r) => r.field_path === path);
    assert.ok(f, `${path} persisted as a fact region`);
    assert.equal(f.locator.page, 1, `${path}: the fact region carries the page`);
  }

  // (5) THE POINT. `corroborated` is returned ONLY when v_box grouped the block (which needs a
  //     numeric page), both distances computed, and the registration was strictly closer to its
  //     OWN party's name. Reaching it proves the geometry path is live — not the missing-anchor
  //     refusal that was the only reachable answer before the producer changed.
  const identity = await readWitnessIdentity(s.documentId, out.receipt.text_extraction_id, false);
  assert.equal(identity.vendor_registration_verdict, "corroborated",
    `the vendor registration sits 1 unit from its own name and ~45 from the buyer's — the distance test must resolve it (got ${JSON.stringify(identity)})`);
  assert.equal(identity.customer_registration_verdict, "corroborated");
  assert.equal(identity.identity_contest, false);
});

test("f-a1.pr2.q2 NEGATIVE TWIN — a pre-change `page_number`-only row still publishes a NULL page and refuses identity geometry, fail-closed", { skip }, async () => {
  const s = await buildWitnessSituation("legacylocator", { regions: [] });
  for (const [i, l] of PARTY_LINES.entries()) {
    const [x0, y0, x1, y1] = l.box;
    await fx.rootQuery(
      `insert into clara.document_regions (firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon',$3::jsonb,$4,$5,0.97)`,
      [s.firm, s.ocrId, JSON.stringify({ page_number: 1, polygon: [x0, y0, x1, y0, x1, y1, x0, y1] }),
        `pages.1.lines.${i}`, l.text],
    );
  }
  const published = await publishedNumbering(s.ocrId);
  for (const row of published) {
    assert.equal(row.page, null, "a `page_number`-only row publishes no page through the witness door");
    assert.ok(Number.isInteger(row.idx), "the IDX — what the citation contract actually depends on — is unaffected");
  }

  const out = await runPair(s, partyCitations(published));

  const identity = await readWitnessIdentity(s.documentId, out.receipt.text_extraction_id, false);
  assert.equal(identity.vendor_registration_verdict, "not_corroborated",
    "no numeric page -> the block falls out of v_box -> missing anchor -> REFUSES (fail-closed, never a guess)");
  assert.equal(identity.customer_registration_verdict, "not_corroborated");

  // And the limitation's boundary, asserted rather than assumed: the AMOUNT verdict on the very
  // same document is untouched, because C2 anchors on the polygon and not on the page.
  const verdict = await readWitnessState(s.documentId, out.receipt.text_extraction_id, out.receipt.vision_extraction_id);
  assert.equal(verdict.corroborated, true, "the amount path is unaffected by the page spelling");
});
