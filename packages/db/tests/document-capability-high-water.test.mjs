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
const EXPECTED_CELLS = 4;

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
                 and not t.tgisinternal)                                              as g2,
      to_regprocedure('clara._tf_document_capability_high_water_monotone()')          is not null as f3,
      to_regprocedure('clara._tf_document_capabilities_version_uniform()')            is not null as f4,
      exists (select 1 from pg_trigger t
               where t.tgrelid = 'clara.document_capability_version_high_water'::regclass
                 and t.tgname = 't_document_capability_high_water_monotone'
                 and not t.tgisinternal)                                              as g3,
      exists (select 1 from pg_constraint c
               where c.conname = 't_document_capabilities_version_uniform'
                 and c.connamespace = 'clara'::regnamespace
                 and c.condeferrable and c.condeferred)                               as g4`);
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

// ---------------------------------------------------------------------------------------------
// "BY ANY ROUTE" — the mark is only worth what it costs to remove. An INSERT wall that reads a
// relation anybody may delete from is a wall with a door beside it: delete the mark, re-insert
// low, and the registry is back where #846 found it. So the relation is append-only in the
// strong sense, and that is a REFUSAL rather than a habit.
// ---------------------------------------------------------------------------------------------

cell("the high-water mark itself is append-only: DELETE is refused, a lowering UPDATE is refused, a raise is admitted", async () => {
  const seen = await inRolledBackTxn(async (c) => {
    const mark = (await c.query(
      `select * from clara.document_capability_version_high_water ${PDF_INVOICE}`)).rows[0];
    assert.ok(mark, "the pair the probes use carries a high-water mark");

    await c.query("savepoint probe_delete");
    const del = await caught(() => c.query(
      `delete from clara.document_capability_version_high_water ${PDF_INVOICE}`));
    await c.query("rollback to savepoint probe_delete");

    await c.query("savepoint probe_lower");
    const lower = await caught(() => c.query(
      `update clara.document_capability_version_high_water set registry_version = $1 ${PDF_INVOICE}`,
      [mark.registry_version - 1]));
    await c.query("rollback to savepoint probe_lower");

    // A RAISE is the writer's own ordinary act and must still be admitted, or the mark could
    // never follow a republication.
    const raised = (await c.query(
      `update clara.document_capability_version_high_water set registry_version = $1 ${PDF_INVOICE}
         returning registry_version`, [mark.registry_version + 1])).rows[0].registry_version;

    return { del, lower, raised, mark: mark.registry_version };
  });

  assert.ok(seen.del, "a DELETE of the high-water mark was ACCEPTED — the wall has a door beside it");
  assert.equal(seen.del.code, CLR08, `expected ${CLR08} for the refused DELETE, got ${seen.del.code}`);
  assert.equal(JSON.parse(seen.del.detail ?? "{}").reason, "registry_version_high_water_append_only");

  assert.ok(seen.lower, "an UPDATE that LOWERS the high-water mark was ACCEPTED");
  assert.equal(seen.lower.code, CLR08, `expected ${CLR08} for the refused lowering, got ${seen.lower.code}`);
  assert.equal(JSON.parse(seen.lower.detail ?? "{}").reason, "registry_version_high_water_append_only");

  assert.equal(seen.raised, seen.mark + 1, "raising the high-water mark must still succeed");
});

// ---------------------------------------------------------------------------------------------
// #779's SECOND RESIDUAL — "every row published together carries the same integer" was a
// CONVENTION: a table-wide observation in the sibling battery, which a uniform BACKWARDS
// republish would satisfy anyway, and which nothing enforced at write time. The wall is DEFERRED
// on purpose: every multi-statement republish passes through a non-uniform intermediate state,
// so the transaction is judged on what it LEAVES, never on what it passed through.
// ---------------------------------------------------------------------------------------------

// THE ONE CELL THAT REALLY COMMITS, and the only honest way to prove a verdict reached AT
// COMMIT. Its safety rests on the gate above: `cohortApplied()` has already read the deferred
// constraint trigger out of pg_constraint, so the wall is PROVEN present before the transaction
// is opened and the COMMIT can only be refused. Measured while writing this file: with the wall
// absent the same transaction COMMITS and leaves the registry publishing two versions — which is
// exactly the defect, and exactly why no other probe in this battery commits anything.
cell("a transaction that ends with TWO distinct registry_versions is refused AT COMMIT, and the registry is untouched", async () => {
  const before = (await rootQuery(
    `select count(distinct registry_version)::int as versions, min(registry_version)::int as v
       from clara.document_capabilities`)).rows[0];

  const err = await asRoot(async (c) => {
    await c.query("begin");
    // Raising ONE pair is the whole hazard: the INSERT wall and 0207's UPDATE wall both admit it
    // (a raise for that pair is monotone), and until this cell's wall existed the registry simply
    // ended up publishing two versions at once.
    await c.query(`update clara.document_capabilities set registry_version = registry_version + 1 ${PDF_INVOICE}`);
    const caughtHere = await caught(() => c.query("commit"));
    // A refused COMMIT has already ended the transaction; this is belt-and-braces so a green
    // path can never leave the pooled connection inside one.
    await c.query("rollback").catch(() => {});
    return caughtHere;
  });

  assert.ok(err, "a transaction leaving TWO distinct registry_versions COMMITTED — cross-row uniformity is still only a convention");
  assert.equal(err.code, CLR08, `expected ${CLR08} at commit, got ${err.code}`);
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "registry_version_uniform",
    "the refusal must name the wall that fired, so a caller tells it apart from the per-pair walls");
  assert.equal(detail.column, "registry_version");
  assert.deepEqual(detail.versions, [before.v, before.v + 1],
    "the refusal names the distinct versions it found, in order");

  const after = (await rootQuery(
    `select count(distinct registry_version)::int as versions, min(registry_version)::int as v
       from clara.document_capabilities`)).rows[0];
  assert.deepEqual(after, before, "the refused COMMIT wrote NOTHING: the registry is exactly as it was");
});

cell("a UNIFORM publish passes the same wall: every row raised together is admitted", async () => {
  const seen = await inRolledBackTxn(async (c) => {
    const published = (await c.query("select min(registry_version)::int as v from clara.document_capabilities"))
      .rows[0].v;
    const moved = (await c.query(
      "update clara.document_capabilities set registry_version = registry_version + 1")).rowCount;
    // The wall is DEFERRED, so nothing has judged this transaction yet. `set constraints … immediate`
    // fires it NOW, which is the same verdict COMMIT would reach — proven by the cell above, whose
    // refusal came from a real COMMIT. Forcing it here is what lets this cell roll back afterwards
    // instead of republishing the live registry.
    await c.query("set constraints clara.t_document_capabilities_version_uniform immediate");
    const state = (await c.query(
      `select count(distinct registry_version)::int as versions, min(registry_version)::int as v
         from clara.document_capabilities`)).rows[0];
    return { published, moved, state };
  });

  assert.equal(seen.state.versions, 1, "a uniform publish leaves exactly one version on the table");
  assert.equal(seen.state.v, seen.published + 1, "…and it is the raised one");
  assert.ok(seen.moved >= 240,
    `the probe raised the WHOLE registry (12 formats x 20 kinds = 240 rows at authoring); it moved ${seen.moved}`);
});
