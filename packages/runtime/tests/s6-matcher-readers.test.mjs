// Slice-6 C-7 reader isolation (0009-GATED). 0009 lets a document carry a SECOND
// completed extraction — the semantic invoice_facts lane (engine_kind='invoice_facts')
// whose regions are supplier facts (invoice.vendor_name, invoice.total, …). The matcher's
// name/alias attribution must read ONLY the positional raw-text lanes ('ocr' /
// 'structured_parse'); reading the facts lane would let a supplier's vendor_name
// false-match a client and pollute the cited region_ids. The runtime fix pins
// readMatchInputs to `engine_kind in ('ocr','structured_parse')`. INTERFACE-PINS §5(A);
// companion §5 (Reads always select an EXPLICIT completed engine_kind, never "current").

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  skip,
  rootQuery,
  asRuntime,
  buildFirmWithClients,
  seedVerifiedDocument,
  seedExtraction,
  seedRegion,
  emitExtractionCompleted,
  drainMatcher,
  candidatesForDoc,
} from "./matcher-testkit.mjs";
import { readMatchInputs } from "../lib/matcher.mjs";

// 0009 widens the document_extractions.engine_kind CHECK to include 'invoice_facts';
// seeding such a row (below) requires 0009, so skip cleanly until it is applied.
async function factsLaneReady() {
  const r = await rootQuery(
    `select 1 from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_extractions' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%invoice_facts%' limit 1`,
  );
  return r.rowCount > 0;
}
const skip6 = skip || ((await factsLaneReady()) ? false : "Slice-6 (0009) invoice_facts engine_kind absent — migrate 0009 first");

/** Seed a completed invoice_facts extraction + one semantic region on a document. */
async function seedFactsRegion({ firm, document, fieldPath, textContent }) {
  const ext = (
    await rootQuery(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
         values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','invoice_facts',1,'done',1) returning id`,
      [firm, document],
    )
  ).rows[0].id;
  const region = (
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
         values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}',$3,$4,0.99) returning id`,
      [firm, ext, fieldPath, textContent],
    )
  ).rows[0].id;
  return { ext, region };
}

test("readMatchInputs returns only ocr/structured_parse regions, excluding invoice_facts", { skip: skip6 }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const clientName = (await rootQuery("select name from clara.clients where id=$1", [clients[0]])).rows[0].name;
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });

  const ocrExt = await seedExtraction({ firm, document }); // engine_kind='ocr'
  const ocrRegion = await seedRegion({ firm, extraction: ocrExt, fieldPath: "pages.1.lines.1", textContent: "ACME SUPPLIES SDN BHD" });
  // The false-match bait: a facts vendor_name region whose text EQUALS a client name.
  const facts = await seedFactsRegion({ firm, document, fieldPath: "invoice.vendor_name", textContent: clientName });

  const inputs = await asRuntime((c) => readMatchInputs(c, { firmId: firm, documentId: document }));
  const ids = inputs.regions.map((r) => r.regionId);
  assert.ok(ids.includes(ocrRegion), "the ocr region is read");
  assert.ok(!ids.includes(facts.region), "the invoice_facts vendor_name region is EXCLUDED");
  assert.equal(inputs.regions.length, 1, "only the single positional-lane region is returned");
  assert.ok(!inputs.regions.some((r) => r.text === clientName), "the client-name bait never enters the read set");
});

test("matcher lane-2 does not false-match a client via an invoice_facts vendor_name region", { skip: skip6 }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const clientName = (await rootQuery("select name from clara.clients where id=$1", [clients[0]])).rows[0].name;
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });

  const ocrExt = await seedExtraction({ firm, document });
  // No ocr region names any client; only a facts vendor_name region equals the client name.
  await seedFactsRegion({ firm, document, fieldPath: "invoice.vendor_name", textContent: clientName });
  await emitExtractionCompleted({ firm, document, extraction: ocrExt });

  await drainMatcher(firm);

  const cands = await candidatesForDoc(document);
  assert.equal(cands.length, 0, "no lane-2 candidate — the facts vendor_name never entered the matcher read set");
});
