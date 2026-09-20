// #846 — THE CAPABILITY REGISTRY'S VERSION HIGH-WATER MARK, and the cross-row uniformity of a
// publish. Migration: 0244_document_capability_version_high_water.sql.
//
// WHAT THIS BATTERY IS FOR. #779's 0207 made `registry_version` monotonicity a database refusal
// for UPDATE transitions, and named TWO residuals in its own header rather than closing them:
//   1. a DELETE-then-INSERT at a lower version is a FIRST PUBLICATION to the database, so the
//      transition wall never sees it and the version silently goes backwards;
//   2. "every row published together carries the same integer" stayed a CONVENTION — a test-time
//      observation in document-capability-registry.test.mjs, which a uniform backwards republish
//      would satisfy anyway, and which nothing enforces at write time at all.
// 0244 closes both: an append-only HIGH-WATER relation that remembers the highest version each
// (format, document_kind) has ever published, read by an INSERT-side wall; and a DEFERRED
// constraint trigger that refuses, AT COMMIT, a transaction leaving more than one distinct
// version on the table.
//
// THE OWNER CONNECTION IS THE ONLY WRITER THERE IS, which is why every probe here runs through
// it. `clara.document_capabilities` is forced-RLS with an owner `for all` policy,
// `clara_authenticated` holds SELECT only and `clara_agent_ro` holds no table privilege at all,
// so a wall built out of grants or RLS would wall off exactly the roles that were never the
// hazard. 0207's header settled that argument; this file inherits it.
//
// EVERY PROBE IS ROLLED BACK. The sibling battery (document-capability-registry.test.mjs) asserts
// registry-wide invariants — exactly one distinct registry_version, the seeded OFX and CSV
// verdicts, one engine per format — so a probe write left behind would turn THAT file red rather
// than this one. The rollback-hygiene cell at the end re-reads both tables to prove it.

// EVERY CELL GATES ON THE LIVE CATALOG, never on a migration number — review law 3, and the
// sibling battery's own stated law. A PARTIAL cohort THROWS: a half-applied migration is a
// defect, not a reason to skip. A focused run against a chain that predates 0244 FAILS LOUDLY;
// only an estate sweep that preloads document-capability-high-water-preintegration-gate.mjs
// skips, and it says so.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRoot, endPool } from "./rig-fixtures.mjs";

/** The immutability / append-only family code, the one 0193's `_tf_accounting_plans_immutable`
 *  and 0207's `_tf_document_capabilities_version_monotone` already raise. #846's brief keeps it
 *  rather than minting a second spelling for the same fact. */
const CLR08 = "CLR08";

const PDF_INVOICE = "where format = 'pdf' and document_kind = 'invoice'";

const CAPABILITY_COLUMNS =
  "(format, document_kind, mime_type, custody, byte_extraction, typed_facts, business_operation, "
  + "engine_id, engine_byte, registry_version, basis, limits)";

/** The count WITH 0244 applied. The `after` hook asserts it, so a cell that silently stops
 *  running — the way a mis-gated cell does — fails the whole battery rather than passing by
 *  absence. */
const EXPECTED_CELLS = 1;

let live = false;
let executed = 0;

/** 0244's whole cohort, read from the LIVE CATALOG. Wholly present or wholly absent; anything
 *  between the two is a half-applied migration and is reported as such. */
async function cohortApplied() {
  const r = await rootQuery(`select
      to_regclass('clara.document_capability_version_high_water')                     is not null as t1,
      to_regprocedure('clara._tf_document_capabilities_version_high_water()')         is not null as f1,
      to_regprocedure('clara._tf_document_capabilities_high_water_record()')          is not null as f2,
      exists (select 1 from pg_trigger t
               where t.tgrelid = 'clara.document_capabilities'::regclass
                 and t.tgname = 't_document_capabilities_version_high_water'
                 and not t.tgisinternal)                                              as g1,
      exists (select 1 from pg_trigger t
               where t.tgrelid = 'clara.document_capabilities'::regclass
                 and t.tgname = 't_document_capabilities_high_water_record'
                 and not t.tgisinternal)                                              as g2`);
  const flags = Object.entries(r.rows[0]);
  const present = flags.filter(([, v]) => v).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(
      `the #846 high-water cohort is PARTIAL: ${flags.map(([k, v]) => `${k}=${v}`).join(" ")}. `
      + "A half-applied migration is a defect; refusing to skip past it.",
    );
  }
  return present === flags.length;
}

before(async () => { live = await cohortApplied(); });

after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY_HIGH_WATER === "1") {
    console.warn("SKIP document-capability-high-water: 0244's cohort is not applied (explicit pre-integration run).");
    t.skip("#846 high-water cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "document-capability-high-water is required for a focused run: apply "
    + "0244_document_capability_version_high_water.sql (or its numbered suite copy)",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

/** Run `fn(client)` inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn) {
  return asRoot(async (c) => {
    await c.query("begin");
    try {
      return await fn(c);
    } finally {
      await c.query("rollback");
    }
  });
}

/** Re-insert a captured registry row at `version`, every other column byte-identical. */
function reinsert(c, row, version) {
  return c.query(
    `insert into clara.document_capabilities ${CAPABILITY_COLUMNS}
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [row.format, row.document_kind, row.mime_type, row.custody, row.byte_extraction, row.typed_facts,
      row.business_operation, row.engine_id, row.engine_byte, version, row.basis, row.limits],
  );
}

const capturePdfInvoice = (c) =>
  c.query(`select * from clara.document_capabilities ${PDF_INVOICE}`).then((r) => r.rows[0]);

cell("a pair's published version survives DELETE: re-inserting BELOW it is refused with CLR08 and a named reason", async () => {
  const seen = await inRolledBackTxn(async (c) => {
    const row = await capturePdfInvoice(c);
    assert.ok(row.registry_version >= 2,
      `this probe lowers the published version by one and must stay above the registry_version >= 1 `
      + `positivity CHECK, so the refusal can only be the high-water wall; published is ${row.registry_version}`);
    await c.query(`delete from clara.document_capabilities ${PDF_INVOICE}`);
    // A savepoint, so the REFUSED insert aborts only its own sub-transaction and the rest of the
    // probe can still read the table afterwards.
    await c.query("savepoint probe_846");
    const err = await caught(() => reinsert(c, row, row.registry_version - 1));
    await c.query("rollback to savepoint probe_846");
    const present = (await c.query(`select count(*)::int as n from clara.document_capabilities ${PDF_INVOICE}`))
      .rows[0].n;
    return { err, published: row.registry_version, present };
  });

  assert.ok(seen.err,
    "a DELETE-then-INSERT below the published version was ACCEPTED — #779's first residual is still open");
  assert.equal(seen.err.code, CLR08,
    `expected the immutability-family code ${CLR08}, got ${seen.err.code}`);
  const detail = JSON.parse(seen.err.detail ?? "{}");
  assert.equal(detail.reason, "registry_version_high_water",
    "the refusal must carry a MACHINE-READABLE reason naming the wall that fired, so a caller "
    + "classifies it by code and reason rather than by message text");
  assert.equal(detail.column, "registry_version");
  assert.equal(detail.format, "pdf");
  assert.equal(detail.document_kind, "invoice");
  assert.equal(detail.from, seen.published, "the refusal names the HIGH WATER it was measured against");
  assert.equal(detail.to, seen.published - 1, "the refusal names the version that was attempted");
  assert.equal(seen.present, 0,
    "the refused INSERT left nothing behind: the row is still deleted inside the probe transaction");
});
