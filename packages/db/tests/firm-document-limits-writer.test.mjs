// #960 — THE FIRM'S OWN PROCESSING CAPS NOW HAVE A HUMAN WRITER.
// Migration: 0270_firm_document_limits_writer.sql (stem `firm_document_limits_writer$`).
//
// THE OWNER'S RULING (2026-09-20, on the ticket) IS THE CONTRACT: option C. The FIRM's own
// owner or admin sets all four document-processing caps freely — there is no operator gate and
// no operator-side surface. BELCORT will price by usage later, so every change is receipted and
// audited as usage-billing evidence, and the ESTATE's own safety ceiling stands above whatever
// a firm sets.
//
// WHY THIS BATTERY EXISTS BESIDE firm-document-limits.test.mjs RATHER THAN INSIDE IT. That file
// is #692's, and every cell in it runs as ROOT on purpose: before this ticket the relation had
// no human writer at all, so a cell that drove a role would have been testing the grant matrix
// rather than the trigger. This battery is the opposite shape — every cell drives the DOOR as a
// real `clara_authenticated` session — and folding the two together would blur which half a red
// cell is accusing.
//
// THE SEAM IS THE DOOR, and nothing here reaches around it: the caps are ARRANGED through
// `clara.set_firm_document_limits` and READ BACK from the relation (root, labelled) and from
// `clara.get_firm_commercial_state` (the shipped read). No cell writes the relation by hand.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-fixtures.mjs";
import { CAPS, FIRST_INSERT, firmScene, setLimits, storedRow } from "./firm-document-limits-writer-fixtures.mjs";

/** The migration's STABLE STEM, probed against clara.schema_migrations — never a file listing,
 *  and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "firm_document_limits_writer$";

let live = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
    live = r.rows[0].n > 0;
  } catch {
    live = false;
  }
});

after(async () => {
  if (live) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS_WRITER === "1") {
    console.warn("SKIP firm-document-limits-writer: 0270 is not applied (explicit pre-integration run).");
    t.skip("#960 firm document-limits writer absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#960: clara.set_firm_document_limits is absent. Apply packages/db/migrations/"
    + "0270_firm_document_limits_writer.sql, or preload tests/firm-document-limits-writer-"
    + "preintegration-gate.mjs for a deliberate pre-integration run.");
  return true;
}

// ===========================================================================
// CELL 1 — A FIRM WITH NO STORED ROW: the owner's FIRST write names ONE cap, and the receipt
// states ALL FOUR resulting caps, not only the one that was named.
//
// The three unnamed caps land on the relation's OWN first-insert values (100 / 1000 / 2 / 2),
// which `clara._tf_firm_document_limits_upsert` supplies and 0196's header states — an
// independent source of truth this battery reads off the trigger, never off the door.
// ===========================================================================
test("#960 cell 1 · a first write names one cap and the receipt states all four", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("first_write");

  assert.equal(await storedRow(scene.firm), null, "the fresh firm must start with no limits row");

  const receipt = await setLimits(scene.owner, { docs_per_day: 250 });

  assert.equal(receipt.firm_id, scene.firm, "the receipt names the caller's own firm");
  assert.deepEqual(receipt.caps, {
    docs_per_day: 250,
    pages_per_day: FIRST_INSERT.pages_per_day,
    ocr_concurrency: FIRST_INSERT.ocr_concurrency,
    llm_witness_concurrency: FIRST_INSERT.llm_witness_concurrency,
  }, "the receipt states every resulting cap, not only the changed one");

  const row = await storedRow(scene.firm);
  assert.ok(row, "the first write created the firm's row");
  for (const cap of CAPS) {
    assert.equal(row[cap], receipt.caps[cap], `${cap}: the stored row and the receipt agree`);
  }
  assert.equal(row.updated_by, scene.owner, "the row carries the acting owner");
  executed += 1;
});
