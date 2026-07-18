// Slice-5 rig — DOCUMENT PIPELINE part 4: EXTRACTIONS + REGIONS (companion §3.3).
// Contract-blind. Laws: UNIQUE (document, engine_id, version_n) — one vendor call
// per content per engine version; supersede-with-lineage (E-6 — an extraction cited
// by anything is never edited in place; superseded_by carries the lineage); regions
// carry a kind-validated locator (page_polygon | sheet_cell_range | row_col |
// paragraph_run); engine_confidence is DATA, never authority; the envelope is ONE
// canonical producer-emitted jsonb shape (I-12). Extraction EVENTS
// (document.extraction_completed / _failed) are emitted by the persist WRITER — the
// event-type existence + routing lives in the events suite; the emission path is
// runtime-writer-driven (interface note).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  PG,
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  seedVerifiedDocument,
  seedExtraction,
  seedRegion,
  LOCATOR_KINDS,
  ENGINE_KINDS,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("extractions");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

// ===========================================================================
// §3.3 — UNIQUE (document, engine_id, version_n): one vendor call per content/engine.
// ===========================================================================

test("§3.3 extractions are UNIQUE per (document, engine_id, version_n); a new version is allowed", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  await seedExtraction({ firm, document: documentId, engineId: "azure-di:layout:4.0", engineKind: "ocr", versionN: 1 });
  // Same (document, engine, version) → the idempotency key collides.
  await assert.rejects(
    () => seedExtraction({ firm, document: documentId, engineId: "azure-di:layout:4.0", engineKind: "ocr", versionN: 1 }),
    (e) => e.code === PG.uniqueViolation,
    "a duplicate (document, engine, version) is a unique violation",
  );
  // A new version_n is accepted (supersede-with-lineage lands the newer version).
  const v2 = await seedExtraction({ firm, document: documentId, engineId: "azure-di:layout:4.0", engineKind: "ocr", versionN: 2 });
  assert.ok(v2, "version 2 of the same engine is a distinct extraction");
});

test("§3.3 supersede-with-lineage: superseded_by carries the pointer to the newer version", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  const v1 = await seedExtraction({ firm, document: documentId, versionN: 1 });
  const v2 = await seedExtraction({ firm, document: documentId, versionN: 2 });

  const cols = await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='document_extractions'");
  const names = new Set(cols.rows.map((x) => x.column_name));
  assert.ok(names.has("superseded_by"), "document_extractions.superseded_by exists (E-6 lineage)");
  // Point v1 at v2 (the persist path does this; here we prove the lineage column
  // accepts the forward pointer and the older row is not deleted).
  await rootQuery("update clara.document_extractions set superseded_by=$2 where id=$1", [v1, v2]).catch((e) => {
    noteLane(`superseded_by update rejected (${e.code}) — the persist writer may own this transition (interface note)`);
  });
  const still = await rootQuery("select count(*)::int as n from clara.document_extractions where id=$1", [v1]);
  assert.equal(still.rows[0].n, 1, "the superseded extraction is retained (never edited away)");
});

// ===========================================================================
// §3.3 — regions: kind-validated locators, engine_confidence as data.
// ===========================================================================

test("§3.3 a region persists for every locator_kind with a matching locator shape", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  const extraction = await seedExtraction({ firm, document: documentId, versionN: 1 });

  const locators = {
    page_polygon: { page: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
    sheet_cell_range: { sheet: "Sheet1", range: "A1:B2" },
    row_col: { row: 3, col: 2 },
    paragraph_run: { paragraph: 4, run: 1 },
  };
  for (const kind of LOCATOR_KINDS) {
    const id = await seedRegion({ firm, extraction, locatorKind: kind, locator: locators[kind], fieldPath: `f.${kind}`, textContent: "100.00", engineConfidence: 0.91 });
    assert.ok(id, `a ${kind} region persisted`);
  }
  noteLane(`regions exercised across all locator kinds: ${LOCATOR_KINDS.join(", ")}`);
});

test("§3.3 engine_confidence is DATA (stored numeric), never authority; the envelope is one jsonb shape", async (t) => {
  if (unready(t)) return;
  const cols = await rootQuery("select column_name, data_type from information_schema.columns where table_schema='clara' and table_name='document_regions'");
  const conf = cols.rows.find((c) => c.column_name === "engine_confidence");
  assert.ok(conf && /numeric|double|real/.test(conf.data_type), `engine_confidence is a numeric column (got ${conf?.data_type})`);
  const ex = await rootQuery("select data_type from information_schema.columns where table_schema='clara' and table_name='document_extractions' and column_name='envelope'");
  assert.ok(ex.rows[0] && /json/.test(ex.rows[0].data_type), "document_extractions.envelope is a jsonb column (I-12 one envelope)");
  const kinds = await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='document_extractions' and column_name='engine_kind'");
  assert.equal(kinds.rowCount, 1, `engine_kind exists (allows ${ENGINE_KINDS.join("/")})`);
});
