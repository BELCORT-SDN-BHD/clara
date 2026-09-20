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
import { assertRaises, rootQuery, endPool } from "./rig-fixtures.mjs";
import {
  auditRows, CAPS, CEILINGS, FIRST_INSERT, firmScene, setLimits, storedRow,
} from "./firm-document-limits-writer-fixtures.mjs";

/** The migration's STABLE STEM, probed against clara.schema_migrations — never a file listing,
 *  and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "firm_document_limits_writer$";

let live = false;
let executed = 0;
const EXPECTED_CELLS = 5;

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

// ===========================================================================
// CELL 2 — A WRITE NAMING ONE CAP LEAVES THE OTHER THREE AT THEIR STORED VALUES, and the
// receipt says which cap actually moved and what it moved FROM.
//
// The baseline here shares no value with the relation's first-insert values (100/1000/2/2), so
// "the other three were preserved" can never be mistaken for "the other three were reset to a
// default that happened to match" — the discipline firm-document-limits.test.mjs's own BASE
// constant established for 0196's trigger, re-used here one level up at the door.
// ===========================================================================
test("#960 cell 2 · a second write moves one cap, preserves three, and reports both sides", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("preserve");
  const base = { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 };
  await setLimits(scene.owner, base);

  const receipt = await setLimits(scene.owner, { pages_per_day: 77 });

  assert.deepEqual(receipt.caps, { ...base, pages_per_day: 77 },
    "only the named cap moved; the other three kept their stored values");
  assert.deepEqual(receipt.previous, base,
    "the receipt states what every cap was before this call");
  assert.deepEqual(receipt.changed, ["pages_per_day"],
    "the receipt names exactly the caps that actually moved");

  const row = await storedRow(scene.firm);
  for (const cap of CAPS) {
    assert.equal(row[cap], receipt.caps[cap], `${cap}: the stored row and the receipt agree`);
  }
  executed += 1;
});

// ===========================================================================
// CELL 3 — THE AUDIT ENTRY IS USAGE-BILLING EVIDENCE, so it is complete and attributable: the
// actor, the firm, and the BEFORE and AFTER value of every cap that changed.
//
// The owner's ruling says so in as many words — "every change must be receipted and audited as
// usage-billing evidence" — which is why this cell asserts a SHAPE (`changes` keyed by cap, each
// with old and new) rather than merely that a row exists. An audit that records only the new
// value cannot answer "what was it before this call", which is the question a bill disputes.
//
// THE ADMIN, NOT THE OWNER, drives this cell: the ruling admits both ranks, and an audit row
// that attributed a change to the firm's owner because the owner happens to be the firm's
// creator would be attributing it to the wrong person.
// ===========================================================================
test("#960 cell 3 · the audit row names the actor, the firm, and both sides of every changed cap", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("audit", ["admin"]);
  const admin = scene.members.admin;
  await setLimits(admin, { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 });

  await setLimits(admin, { pages_per_day: 77, ocr_concurrency: 3, llm_witness_concurrency: 9 });

  const rows = await auditRows(scene.firm);
  assert.equal(rows.length, 2, "one audit row per accepted write");
  const latest = rows[0];
  assert.equal(latest.firm_id, scene.firm, "the audit row names the firm");
  assert.equal(latest.actor, admin, "the audit row names the ACTOR, not the firm's owner");
  assert.equal(latest.outcome, "ok");
  assert.deepEqual(latest.args.changes, {
    pages_per_day: { old: 22, new: 77 },
    llm_witness_concurrency: { old: 4, new: 9 },
  }, "both sides of every cap that moved, and nothing for the cap re-named at its own value");
  assert.deepEqual(latest.args.caps, {
    docs_per_day: 11, pages_per_day: 77, ocr_concurrency: 3, llm_witness_concurrency: 9,
  }, "the resulting four caps ride the audit row too");
  executed += 1;
});

// ===========================================================================
// CELL 4 — THE ESTATE'S CEILING STANDS ABOVE WHATEVER A FIRM SETS, and the refusal names it.
//
// The owner's ruling: the firm sets its own caps freely, and "the estate's own safety limits
// stay the absolute ceiling above whatever a firm sets". No such maximum was expressed anywhere
// before this ticket (the four columns carry only `> 0`), so the door carries it.
//
// THE FOUR NUMBERS ARE THE SPEC, not a reading of the code: they are written here as literals,
// and `CEILINGS` in the fixtures module carries the same four with the reasoning. The cell
// drives BOTH SIDES of each boundary — the ceiling value itself is ACCEPTED and one more is
// REFUSED — so a green here cannot mean "the door refuses everything" or "the door refuses
// nothing".
// ===========================================================================
test("#960 cell 4 · the ceiling value is accepted, one above it is refused, and the refusal names the ceiling", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("ceiling");

  // The ceiling itself: accepted, all four at once.
  const receipt = await setLimits(scene.owner, CEILINGS);
  assert.deepEqual(receipt.caps, CEILINGS, "every cap may be set AT the estate ceiling");

  for (const cap of CAPS) {
    const err = await assertRaises("CLR10",
      () => setLimits(scene.owner, { [cap]: CEILINGS[cap] + 1 }), `${cap} above the ceiling`);
    assert.equal(JSON.parse(err.detail ?? "{}").reason, "cap_above_ceiling",
      `${cap}: the refusal is typed, not a bare CLR10`);
    assert.ok(err.message.includes(String(CEILINGS[cap])),
      `${cap}: the refusal must name the ceiling — got ${JSON.stringify(err.message)}`);
    assert.ok(err.message.includes(cap),
      `${cap}: the refusal must name the cap — got ${JSON.stringify(err.message)}`);
  }

  // NOT A SILENT NO-OP AND NOT A PARTIAL WRITE: the stored row is exactly what the accepted
  // call left, after four refusals.
  const row = await storedRow(scene.firm);
  for (const cap of CAPS) assert.equal(row[cap], CEILINGS[cap], `${cap}: unchanged by the refusals`);
  executed += 1;
});

// ===========================================================================
// CELL 5 — THE TWO MALFORMED CALLS ARE TYPED REFUSALS, never a raw constraint violation and
// never a silent no-op.
//
// (a) A cap at zero or below. The relation's own CHECKs say `> 0` (and the fourth column's says
//     `null or > 0`), so a bare insert would die on 23514 — a Postgres error string no surface
//     can render. The door mirrors the CHECK and refuses FIRST, exactly as
//     `clara.set_firm_high_stakes_threshold` does for the same reason (0022 §B's own comment).
//
// (b) A call that names NO cap at all. Every argument is optional, so this is reachable, and
//     riding it through would write an audit row and a receipt for a change that did not
//     happen — evidence of a thing that never occurred, in a trail that is billing evidence.
// ===========================================================================
test("#960 cell 5 · a non-positive cap and a call naming no cap at all are typed refusals", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("malformed");
  await setLimits(scene.owner, { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 });

  for (const cap of CAPS) {
    for (const bad of [0, -1]) {
      const err = await assertRaises("CLR10",
        () => setLimits(scene.owner, { [cap]: bad }), `${cap} = ${bad}`);
      assert.equal(JSON.parse(err.detail ?? "{}").reason, "invalid_cap",
        `${cap} = ${bad}: the refusal is typed`);
      assert.ok(err.message.includes(cap), `${cap} = ${bad}: the refusal names the cap`);
    }
  }

  const empty = await assertRaises("CLR10", () => setLimits(scene.owner, {}), "no cap named");
  assert.equal(JSON.parse(empty.detail ?? "{}").reason, "no_cap_named");

  const row = await storedRow(scene.firm);
  assert.deepEqual(
    { docs_per_day: row.docs_per_day, pages_per_day: row.pages_per_day,
      ocr_concurrency: row.ocr_concurrency, llm_witness_concurrency: row.llm_witness_concurrency },
    { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 },
    "nine refusals later the stored row is exactly what the one accepted call left");
  assert.equal((await auditRows(scene.firm)).length, 1, "a refused call writes no audit row");
  executed += 1;
});
