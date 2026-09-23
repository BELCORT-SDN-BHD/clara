// #857 AC2 — A TABLE CHECK ON clara.document_regions.field_path, FOR EVERY WRITER INCLUDING A
// RAW FIXTURE INSERT.
// Migration: 0290_document_regions_field_path_check.sql.
//
// THE SEAM. Every cell here writes directly to clara.document_regions with a plain `insert`
// through the root connection — never through clara.persist_document_extraction — because that
// is exactly the gap AC2 closes: clara._assert_field_path (0191) has always been reachable from
// ONE writer only, so a raw insert (which is what most of the 71 the ticket's own triage found
// already do) never ran the grammar at all. This file proves the NEW wall: `field_path` is a
// column, `insert into clara.document_regions(...)` is the public interface, and the brief's own
// AC2 says "a raw insert" three times.
//
// WHY THE ERRCODE IS CLR10, NOT 23514. clara._field_path_conforms (the CHECK's own boolean
// sibling) calls clara._assert_field_path internally; when that RAISES, the exception —
// errcode and all — propagates out of the INSERT exactly as it would from a direct call, never
// rewrapped into Postgres's generic check_violation. Cell 2 asserts the CODE, not just that
// SOMETHING was refused, because "refused" and "refused with the grammar's own typed code" are
// different claims and only the second is what AC2 asks for.
//
// THE TWO PLURAL LITERALS (0201's own two partial-unique-index exclusions) ARE ORDINARY
// REGISTERED-NAMESPACE PATHS to this CHECK — it is evaluated once PER ROW and carries no
// uniqueness concept, so it cannot see (and does not care) how many other rows share one path.
// Cell 6 inserts a REAL forty-row trial balance, the exact shape the ticket names, and proves
// every row lands; cell 7 is the second exclusion's parity case. Cell 8 proves the DIFFERENT
// wall — 0201's own unique key — is what refuses a duplicate at a NON-plural path, so a reader
// can tell the two mechanisms apart rather than crediting this file with a wall it does not own.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, opk } from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR10 = "CLR10";

/** The #857 migration's STABLE STEM, probed against clara.schema_migrations — never a file
 *  listing, and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "document_regions_field_path_check$";

const REGION_INSERT = `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
    field_path, text_content, monetary_raw, monetary_cents)
  values ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,$5,$6)`;

let live = false;
let executed = 0;
const EXPECTED_CELLS = 8;

async function laneReady() {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
    return r.rows[0].n > 0;
  } catch {
    return false;
  }
}

before(async () => { live = await laneReady(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_REGIONS_FIELD_PATH_CHECK === "1") {
    console.warn("SKIP document-regions-field-path-check: 0290 is not applied (explicit pre-integration run).");
    t.skip("#857 document_regions field_path CHECK absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#857: the CHECK constraint on clara.document_regions(field_path) is absent. "
    + "Apply 0290_document_regions_field_path_check.sql — a skip is not evidence.",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

/** A firm + a verified document + a real extraction, minted straight through root because the
 *  SUBJECT of every cell below is the table's own write boundary, not the intake ceremony. */
async function seedWorld(tag) {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`drfp_${opk(tag)}`])).rows[0].id;
  const client = (await rootQuery("insert into clara.clients(firm_id,name) values ($1,$2) returning id",
    [firm, `drfp_${opk(tag)}`])).rows[0].id;
  const doc = await seedVerifiedDocument({ firm, client, filename: `${tag}.pdf`, grantClassifyConsent: false });
  const extraction = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
     values ($1,$2,$3,'ocr',1,'done',1,'{}'::jsonb) returning id`,
    [firm, doc.documentId, `clara-fixture:0290-${opk("e")}`])).rows[0].id;
  return { firm, client, documentId: doc.documentId, extraction };
}

// ---------------------------------------------------------------------------------------------
// 1. THE STRUCTURE.
// ---------------------------------------------------------------------------------------------

cell("the CHECK calls the boolean sibling, which is IMMUTABLE and ungranted to every role", async () => {
  const con = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.document_regions'::regclass
        and conname = 'ck_document_regions_field_path_grammar'`)).rows[0];
  assert.ok(con, "ck_document_regions_field_path_grammar is absent");
  assert.equal(con.def, "CHECK (clara._field_path_conforms(field_path))");

  const fn = (await rootQuery(
    `select provolatile, prosecdef, proowner::regrole::text as owner,
            has_function_privilege('public', oid, 'execute') as public_exec
       from pg_proc where oid = 'clara._field_path_conforms(text)'::regprocedure`)).rows[0];
  assert.equal(fn.provolatile, "i", "clara._field_path_conforms must be IMMUTABLE");
  assert.equal(fn.prosecdef, false, "clara._field_path_conforms must be INVOKER, not DEFINER");
  assert.equal(fn.owner, "clara_fn_owner");
  assert.equal(fn.public_exec, false, "PUBLIC must not have EXECUTE");

  for (const role of ["clara_authenticated", "clara_agent_ro", "clara_runtime"]) {
    const r = await rootQuery(
      "select has_function_privilege($1, 'clara._field_path_conforms(text)'::regprocedure, 'execute') as ok",
      [role]);
    assert.equal(r.rows[0].ok, false, `${role} must not have EXECUTE on clara._field_path_conforms`);
  }

  // clara._assert_field_path (the neighbour body this CHECK wraps) is untouched.
  const assertFn = (await rootQuery(
    `select provolatile from pg_proc where oid = 'clara._assert_field_path(text)'::regprocedure`)).rows[0];
  assert.equal(assertFn.provolatile, "i");
});

// ---------------------------------------------------------------------------------------------
// 2. AN UNREGISTERED-NAMESPACE RAW INSERT IS REFUSED WITH THE GRAMMAR'S OWN CLR10.
// ---------------------------------------------------------------------------------------------

cell("a raw insert with an unregistered namespace is refused with CLR10, never a bare 23514, naming the path", async () => {
  const world = await seedWorld("ns");
  const err = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, world.extraction, "evil.total", "raw fixture, unregistered namespace", null, null]));
  assert.ok(err, "an unregistered-namespace field_path was accepted by a raw insert");
  assert.equal(err.code, CLR10, `expected ${CLR10}, got ${err.code} -- ${err.message}`);
  assert.match(err.message, /evil\.total/, "the refusal must name the offending path");

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1", [world.extraction])).rows[0].n;
  assert.equal(n, 0, "a refused insert must leave no row behind");
});

// ---------------------------------------------------------------------------------------------
// 3. A SYNTACTICALLY MALFORMED RAW INSERT IS ALSO REFUSED WITH CLR10 -- THE WALL IS THE WHOLE
//    GRAMMAR, NOT ONLY THE NAMESPACE CHECK.
// ---------------------------------------------------------------------------------------------

cell("a raw insert with a syntactically malformed path (uppercase namespace, embedded space, empty segment) is refused with CLR10", async () => {
  const world = await seedWorld("syn");
  const REFUSED = ["Invoice.Total", "invoice..total", "invoice.tot al", "a".repeat(200)];
  const survivors = [];
  for (const bad of REFUSED) {
    const err = await caught(() => rootQuery(REGION_INSERT,
      [world.firm, world.extraction, bad, "raw fixture, malformed", null, null]));
    if (!err) { survivors.push(bad); continue; }
    if (err.code !== CLR10) survivors.push(`${bad} (got ${err.code}: ${err.message})`);
  }
  assert.deepEqual(survivors, [], "every malformed shape must be refused with CLR10");
});

// ---------------------------------------------------------------------------------------------
// 4. NULL STILL INSERTS -- field_path IS NULLABLE BY DESIGN, UNCHANGED BY THIS FILE.
// ---------------------------------------------------------------------------------------------

cell("a raw insert with a NULL field_path still inserts -- the column stays nullable by design", async () => {
  const world = await seedWorld("null");
  const err = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, world.extraction, null, "raw fixture, no named field", null, null]));
  assert.equal(err, null, `a NULL field_path must not raise (got ${err?.code}: ${err?.message})`);

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path is null",
    [world.extraction])).rows[0].n;
  assert.equal(n, 1);
});

// ---------------------------------------------------------------------------------------------
// 5. A WELL-FORMED RAW INSERT STILL INSERTS, ACROSS EVERY REGISTERED NAMESPACE.
// ---------------------------------------------------------------------------------------------

cell("a raw insert with a well-formed path in any registered namespace still inserts", async () => {
  const world = await seedWorld("ok");
  const GOOD = ["invoice.total", "statement.closing_balance", "pages.1.lines.0", "sheets.0.A1",
    "myinvois.supplier_tin", "rows.0", "paragraphs.0", "tables.0.cells.3"];
  const failures = [];
  for (const path of GOOD) {
    const err = await caught(() => rootQuery(REGION_INSERT,
      [world.firm, world.extraction, path, "raw fixture, well-formed", null, null]));
    if (err) failures.push(`${path}: ${err.code} ${err.message}`);
  }
  assert.deepEqual(failures, [], "a well-formed path in a registered namespace must never be refused");

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1", [world.extraction])).rows[0].n;
  assert.equal(n, GOOD.length);
});

// ---------------------------------------------------------------------------------------------
// 6. THE FIRST PLURAL LITERAL -- A REAL FORTY-ROW TRIAL BALANCE INSERTS IN FULL, RAW.
// ---------------------------------------------------------------------------------------------

cell("a raw forty-row trial balance at opening_tb.line inserts in full -- the CHECK is per-row, not per-key", async () => {
  const world = await seedWorld("tb40");
  const ROWS = 40;
  const INSERT_TB = `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
      field_path, text_content, monetary_raw, monetary_cents,
      opening_account_code, opening_amount_cents, opening_side)
    values ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'opening_tb.line',
            $3,$4,$5,$6,$5,$7)`;
  const failures = [];
  for (let i = 0; i < ROWS; i += 1) {
    const account = String(1000 + i);
    const cents = 1_000 + i * 100;
    const side = i % 2 === 0 ? "debit" : "credit";
    const err = await caught(() => rootQuery(INSERT_TB,
      [world.firm, world.extraction, `${account} RM ${(cents / 100).toFixed(2)}`, (cents / 100).toFixed(2),
        cents, account, side]));
    if (err) failures.push(`row ${i} (${account}): ${err.code} ${err.message}`);
  }
  assert.deepEqual(failures, [], "every trial-balance row at opening_tb.line must insert");

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path='opening_tb.line'",
    [world.extraction])).rows[0].n;
  assert.equal(n, ROWS, "all forty rows must stand -- none absorbed or refused by the CHECK");
});

// ---------------------------------------------------------------------------------------------
// 7. THE SECOND PLURAL LITERAL -- prior_gl.line -- CARRIES THE SAME PARITY.
// ---------------------------------------------------------------------------------------------

cell("MANY prior_gl.line rows still insert raw on one extraction", async () => {
  const world = await seedWorld("gl");
  const LINES = 5;
  const failures = [];
  for (let i = 0; i < LINES; i += 1) {
    const err = await caught(() => rootQuery(REGION_INSERT,
      [world.firm, world.extraction, "prior_gl.line", `GL line ${i}`, null, null]));
    if (err) failures.push(`line ${i}: ${err.code} ${err.message}`);
  }
  assert.deepEqual(failures, [], "every prior_gl.line row must insert");

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path='prior_gl.line'",
    [world.extraction])).rows[0].n;
  assert.equal(n, LINES);
});

// ---------------------------------------------------------------------------------------------
// 8. THE DIFFERENT WALL -- a duplicate at a NON-plural path is refused by 0201's OWN unique key,
//    not by this CHECK, so the two mechanisms stay legible as separate claims.
// ---------------------------------------------------------------------------------------------

cell("a duplicate at a non-plural path is refused by 0201's unique key (23505), not by this CHECK (CLR10)", async () => {
  const world = await seedWorld("dupe");
  const first = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, world.extraction, "invoice.total", "first", null, null]));
  assert.equal(first, null, `the first insert must succeed (got ${first?.code})`);

  const dupe = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, world.extraction, "invoice.total", "second, same key", null, null]));
  assert.ok(dupe, "a second region at the same (extraction_id, field_path) must be refused");
  assert.equal(dupe.code, "23505", `expected 0201's unique violation (23505), got ${dupe.code}: ${dupe.message}`);

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path='invoice.total'",
    [world.extraction])).rows[0].n;
  assert.equal(n, 1, "only the first row stands");
});
