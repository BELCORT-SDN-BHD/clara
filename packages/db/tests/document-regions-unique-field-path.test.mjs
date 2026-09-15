// #778 — ONE REGION PER (extraction_id, field_path).
// Migration: 0201_document_regions_unique_field_path.sql.
//
// WHAT WAS WRONG. clara.document_regions carried exactly one index over that pair —
// `ix_document_regions_extraction`, created NON-unique alongside the table in
// 0007_document_pipeline.sql — and no live writer deduplicated against it. Two `<c r="A1">`
// cells in one XLSX sheet both resolve to `sheets.0.A1` (structured-worker.mjs's
// `sheetCellRegion` builds `sheets.${sheetIndex}.${cell.ref}`), both pass
// clara._assert_field_path independently, and both landed as their own row silently claiming the
// same cell. clara.persist_invoice_facts had the same shape one lane over: it loops over
// `p_fields` and inserts one region per element, and its own conflict guard deliberately LETS
// identical duplicates through.
//
// WHAT 0201 DOES, and why the merge arm is `do nothing` rather than an UPDATE.
// clara.document_regions is APPEND-ONLY: `t_document_regions_append_only` fires BEFORE UPDATE OR
// DELETE and clara._tf_append_only raises CLR08 unconditionally, so `on conflict ... do update`
// would be refused by the table's own belt. Absorbing the second write keeps the FIRST row's
// evidence, which is the only merge an append-only table can express.
//
// THE CELLS. 1 is the structure: the unique key exists at the pair, the plain index that backs
// the extraction scan survives, and both triggers (the append-only belt and 0191's deferred
// fact-validation belt) survive. 2 is the ticket's own case, driven through the REAL writer.
// 3 and 4 are the invoice-facts lane: an identical-duplicate payload still lands ONE row and is
// NOT refused (the behaviour that writer has today), while a DISAGREEING duplicate is still
// forfeited with CLR10 — the absorb must not silence the guard. 5 is the append-only belt,
// re-measured because a unique key is worthless if UPDATE has quietly become reachable. 6 is
// 0191's deferred belt, which must still append its next revision for a later identity region.
// 7 is the NULL arm: field_path is nullable by design, NULLs are DISTINCT in a btree unique
// index, and a region without a named field must still be able to repeat. 8 confirms — by
// reading the installed body, not by assertion — that clara.persist_witness_facts needed no
// recut: its belt loop walks an array of distinct field names and its optional loop selects
// `distinct on (c.field_path)`, so it is duplicate-free at source. 9 is the ONE EXCLUSION: the key
// is PARTIAL, and `opening_tb.line` sits outside it — 0017's ck_document_regions_opening_fact_0017
// pins that literal for every opening-balance fact and packages/runtime/lib/opening-tb-cells.mjs
// emits one region per trial-balance ROW at it, so a forty-line trial balance is forty lawful rows
// at one key. A total key would not have reddened a battery, it would have absorbed thirty-nine
// balances in silence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, opk, withActor } from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR08 = "CLR08";
const CLR10 = "CLR10";

/** The #778 migration's STABLE STEM, probed against clara.schema_migrations — never a file
 *  listing, and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "document_regions_unique_field_path$";

/** A CLOSING invoice, the 0191 belt fixture's own arithmetic: 94.30 + 3.77 + 5.66 + 0.02 = 103.75. */
const CLOSING = [
  ["invoice.total", 10_375],
  ["invoice.total_excl_tax", 9_430],
  ["invoice.tax_total", 566],
  ["invoice.service_charge", 377],
  ["invoice.rounding", 2],
];

const REGION_INSERT = `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
    field_path, text_content, monetary_raw, monetary_cents)
  values ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,$5,$6)`;

let live = false;
let executed = 0;
const EXPECTED_CELLS = 9;

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
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_REGIONS_UNIQUE === "1") {
    console.warn("SKIP document-regions-unique-field-path: 0201 is not applied (explicit pre-integration run).");
    t.skip("#778 document_regions unique key absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#778: the unique key on clara.document_regions(extraction_id, field_path) is absent. "
    + "Apply 0201_document_regions_unique_field_path.sql — a skip is not evidence.",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

/** A firm + a verified document, minted straight through root because the SUBJECT of every cell
 *  below is a write boundary, not the intake ceremony. */
async function seedWorld(tag) {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`dru_${opk(tag)}`])).rows[0].id;
  const client = (await rootQuery("insert into clara.clients(firm_id,name) values ($1,$2) returning id",
    [firm, `dru_${opk(tag)}`])).rows[0].id;
  const doc = await seedVerifiedDocument({ firm, client, filename: `${tag}.xlsx`, grantClassifyConsent: false });
  return { firm, client, documentId: doc.documentId };
}

/** A `running` task on `lane`. The binding CHECK (ck_processing_task_binding_f_a1) wants a
 *  workflow_run_id AND a started_at, so both are supplied. */
async function runningTask(world, lane, engineId) {
  const id = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane=$4),
       $4,'running',$5,now()) returning id`,
    [world.firm, world.documentId, engineId, lane, `rig-778-${opk("run")}`])).rows[0].id;
  // 0038's `clara._settle_processing_call` requires a reservation UNCONDITIONALLY (CLR18
  // 'processing-call reservation not found'), and nothing mints one for a hand-built task — the
  // same piece of harness f-a1-statements-fixtures.mjs:207 carries, for the same reason.
  await rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [world.firm, id]);
  return id;
}

const regionsAt = (extraction, path) => rootQuery(
  "select id, text_content, monetary_cents from clara.document_regions where extraction_id=$1 and field_path=$2 order by created_at, id",
  [extraction, path]).then((r) => r.rows);

// ---------------------------------------------------------------------------------------------
// 1. THE STRUCTURE.
// ---------------------------------------------------------------------------------------------

cell("the pair (extraction_id, field_path) is UNIQUE, the plain extraction index survives, and both region belts survive", async () => {
  const idx = (await rootQuery(
    `select i.relname as name, ix.indisunique as uniq,
            pg_get_indexdef(ix.indexrelid) as def
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
      where ix.indrelid = 'clara.document_regions'::regclass
      order by i.relname`)).rows;

  const unique = idx.filter((r) => r.uniq
    && /\(extraction_id, field_path\)/.test(r.def.replace(/\s+/g, " ")));
  assert.equal(unique.length, 1,
    `exactly one UNIQUE index at (extraction_id, field_path); got ${JSON.stringify(idx.map((r) => [r.name, r.uniq, r.def]))}`);

  // …and it is PARTIAL, by exactly the 0017-pinned literal. A key that quietly became TOTAL would
  // absorb every trial-balance line after the first (cell 9 is the other half of this claim).
  assert.match(unique[0].def, /WHERE \(field_path IS DISTINCT FROM 'opening_tb\.line'::text\)/,
    `the key must stay PARTIAL on the 0017-pinned opening literal (got ${unique[0].def})`);

  const plain = idx.find((r) => r.name === "ix_document_regions_extraction");
  assert.ok(plain, "ix_document_regions_extraction (0007) must survive — the extraction scan reads through it");
  assert.equal(plain.uniq, false, "…and it stays NON-unique: 0201 adds a key, it does not recut 0007's index");

  const trg = (await rootQuery(
    `select tgname from pg_trigger where tgrelid='clara.document_regions'::regclass and not tgisinternal
      order by tgname`)).rows.map((r) => r.tgname);
  assert.ok(trg.includes("t_document_regions_append_only"), `the append-only belt is gone: ${trg.join(", ")}`);
  assert.ok(trg.includes("t_document_regions_fact_validate"), `0191's deferred fact belt is gone: ${trg.join(", ")}`);
});

// ---------------------------------------------------------------------------------------------
// 2. THE TICKET'S OWN CASE — two `<c r="A1">` cells in one sheet.
// ---------------------------------------------------------------------------------------------

cell("an XLSX sheet declaring `r=\"A1\"` TWICE persists exactly ONE region at sheets.0.A1, and the persist is not refused", async () => {
  const world = await seedWorld("xlsx");
  const task = await runningTask(world, "structured_parse", `clara-fixture:0201-xlsx-${opk("e")}`);

  // The shape structured-worker.mjs's parseXlsx hands the writer for a workbook whose sheet
  // declares the same `r=` twice: `sheets.${sheetIndex}.${cell.ref}` for each <c>, with the raw
  // attribute kept in the locator. Both elements are well-formed and both name one cell.
  const regions = [
    { locator_kind: "sheet_cell_range", locator: { sheet: "Sheet1", range: "A1", raw_ref: "A1" },
      field_path: "sheets.0.A1", text_content: "FIRST", engine_confidence: 0.99 },
    { locator_kind: "sheet_cell_range", locator: { sheet: "Sheet1", range: "A1", raw_ref: "A1" },
      field_path: "sheets.0.A1", text_content: "SECOND", engine_confidence: 0.99 },
    { locator_kind: "sheet_cell_range", locator: { sheet: "Sheet1", range: "B1", raw_ref: "B1" },
      field_path: "sheets.0.B1", text_content: "NEIGHBOUR", engine_confidence: 0.99 },
  ];

  const err = await caught(() => rootQuery(
    "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,$2::jsonb,null,null,$3) as r",
    [task, JSON.stringify(regions), opk("pde778")]));
  assert.equal(err, null,
    `the duplicate cell must be ABSORBED, never an uncaught unique violation escaping to the caller (got ${err?.code}: ${err?.message})`);

  const extraction = (await rootQuery(
    "select id from clara.document_extractions where document_id=$1 and engine_kind='structured_parse'",
    [world.documentId])).rows[0].id;

  const a1 = await regionsAt(extraction, "sheets.0.A1");
  assert.equal(a1.length, 1, "two cells claiming A1 must leave ONE row, never two rows claiming one cell");
  assert.equal(a1[0].text_content, "FIRST",
    "the FIRST write's evidence is what stands — an append-only table cannot express any other merge");

  const b1 = await regionsAt(extraction, "sheets.0.B1");
  assert.equal(b1.length, 1, "the neighbouring cell is untouched — the absorb is per key, not per persist");

  const settled = (await rootQuery(
    "select status from clara.document_processing_tasks where id=$1", [task])).rows[0].status;
  assert.equal(settled, "done", "the persist still settles the task: a duplicate cell is absorbed, not a failure");
});

// ---------------------------------------------------------------------------------------------
// 3–4. THE INVOICE-FACTS LANE.
// ---------------------------------------------------------------------------------------------

cell("persist_invoice_facts still ACCEPTS an identical-duplicate invoice.total payload, and persists exactly one region for it", async () => {
  const world = await seedWorld("dupfacts");
  const task = await runningTask(world, "invoice_facts", `clara-fixture:0201-facts-${opk("e")}`);

  const fields = [
    { field_path: "invoice.total", page: 1, polygon: [], value_raw: "103.75", confidence: 0.99 },
    { field_path: "invoice.total", page: 1, polygon: [], value_raw: "103.75", confidence: 0.99 },
    { field_path: "invoice.currency", page: 1, polygon: [], value_raw: "MYR", confidence: 0.99 },
  ];
  const err = await caught(() => rootQuery(
    "select clara.persist_invoice_facts($1,$2::jsonb,$3,'v1',1,'{}'::jsonb) as r",
    [task, JSON.stringify(fields), "c".repeat(64)]));
  assert.equal(err, null,
    `an identical repeat is the payload this writer has always accepted (got ${err?.code}: ${err?.message})`);

  const extraction = (await rootQuery(
    "select id from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts'",
    [world.documentId])).rows[0].id;
  const totals = await regionsAt(extraction, "invoice.total");
  assert.equal(totals.length, 1, "the identical repeat collapses to ONE row at the key");
  assert.equal(Number(totals[0].monetary_cents), 10_375, "…carrying the value both elements stated");
  assert.equal((await regionsAt(extraction, "invoice.currency")).length, 1);
});

cell("…but a DISAGREEING duplicate still forfeits the extraction with CLR10 — the absorb must not silence the conflict guard", async () => {
  const world = await seedWorld("conflictfacts");
  const task = await runningTask(world, "invoice_facts", `clara-fixture:0201-conflict-${opk("e")}`);

  const fields = [
    { field_path: "invoice.total", page: 1, polygon: [], value_raw: "103.75", confidence: 0.99 },
    { field_path: "invoice.total", page: 1, polygon: [], value_raw: "203.75", confidence: 0.99 },
  ];
  const err = await caught(() => rootQuery(
    "select clara.persist_invoice_facts($1,$2::jsonb,$3,'v1',1,'{}'::jsonb) as r",
    [task, JSON.stringify(fields), "d".repeat(64)]));
  assert.ok(err, "two disagreeing totals must still forfeit the extraction, not be silently absorbed");
  assert.equal(err.code, CLR10, `expected ${CLR10}, got ${err.code}: ${err.message}`);
  assert.match(err.message, /conflicting duplicate facts/,
    "…and it must be the SAME refusal the writer raised before the key existed");

  const n = (await rootQuery(
    `select count(*)::int as n from clara.document_regions r
       join clara.document_extractions e on e.id = r.extraction_id
      where e.document_id=$1`, [world.documentId])).rows[0].n;
  assert.equal(n, 0, "the refusal rolled the whole persist back — no region survives it");
});

// ---------------------------------------------------------------------------------------------
// 5–7. THE BELTS THE KEY MUST NOT DISTURB.
// ---------------------------------------------------------------------------------------------

cell("UPDATE and DELETE on document_regions are still refused with CLR08 — the merge arm could never have been an UPDATE", async () => {
  const world = await seedWorld("appendonly");
  const extraction = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
     values ($1,$2,$3,'ocr',1,'done',1,'{}'::jsonb) returning id`,
    [world.firm, world.documentId, `clara-fixture:0201-ao-${opk("e")}`])).rows[0].id;
  const region = (await rootQuery(
    `${REGION_INSERT} returning id`,
    [world.firm, extraction, "pages.1.lines.0", "TOTAL DUE RM 103.75", null, null])).rows[0].id;

  const upd = await caught(() => rootQuery(
    "update clara.document_regions set text_content='REWRITTEN' where id=$1", [region]));
  assert.ok(upd, "an UPDATE must still be refused");
  assert.equal(upd.code, CLR08, `UPDATE: expected ${CLR08}, got ${upd.code}: ${upd.message}`);

  const del = await caught(() => rootQuery("delete from clara.document_regions where id=$1", [region]));
  assert.ok(del, "a DELETE must still be refused");
  assert.equal(del.code, CLR08, `DELETE: expected ${CLR08}, got ${del.code}: ${del.message}`);

  assert.equal((await regionsAt(extraction, "pages.1.lines.0")).length, 1, "the row stands untouched");
});

cell("0191's deferred fact belt still APPENDS the next revision for a later identity region", async () => {
  const world = await seedWorld("belt");
  const engine = `clara-fixture:0201-belt-${opk("e")}`;
  const extraction = await withActor({ transaction: true }, async (c) => {
    const id = (await c.query(
      `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope)
       values ($1,$2,$3,'invoice_facts',1,'done',1,'{}'::jsonb) returning id`,
      [world.firm, world.documentId, engine])).rows[0].id;
    for (const [path, cents] of CLOSING) {
      await c.query(REGION_INSERT, [world.firm, id, path, (cents / 100).toFixed(2), (cents / 100).toFixed(2), cents]);
    }
    return id;
  });

  const recorded = () => rootQuery(
    `select outcome, revision, detail from clara.document_fact_validations
      where extraction_id=$1 and check_name='invoice.six_term_identity' order by revision`,
    [extraction]).then((r) => r.rows);

  const before = await recorded();
  assert.equal(before.length, 1, "the supported path records one verdict at revision 1");
  assert.equal(before[0].outcome, "pass");

  // A 50.00 discount is a DIFFERENT field_path, so the unique key never sees it; what it must not
  // have disturbed is the deferred belt that re-derives at commit.
  const err = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, extraction, "invoice.discount", "50.00", "50.00", 5_000]));
  assert.equal(err, null, `the append path raised instead of appending: ${err?.code} ${err?.message}`);

  const after = await recorded();
  assert.equal(after.length, 2, "a moved verdict appends exactly one revision");
  assert.deepEqual(after[0], before[0], "the earlier revision is byte-identical — append-only means append-only");
  assert.equal(after[1].revision, 2);
  assert.equal(after[1].outcome, "fail", "94.30 + 3.77 + 5.66 + 0.02 - 50.00 no longer equals 103.75");
});

cell("a NULL field_path still repeats freely — NULLs are DISTINCT in the key, and a region without a named field is legitimate evidence", async () => {
  const world = await seedWorld("nullpath");
  const extraction = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
     values ($1,$2,$3,'ocr',1,'done',1,'{}'::jsonb) returning id`,
    [world.firm, world.documentId, `clara-fixture:0201-null-${opk("e")}`])).rows[0].id;

  for (const text of ["ONE", "TWO"]) {
    const err = await caught(() => rootQuery(REGION_INSERT,
      [world.firm, extraction, null, text, null, null]));
    assert.equal(err, null, `a null-path region must still insert (${text}): ${err?.code} ${err?.message}`);
  }
  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path is null",
    [extraction])).rows[0].n;
  assert.equal(n, 2, "two null-path regions must both stand — the key narrows NAMED fields only");
});

// ---------------------------------------------------------------------------------------------
// 8. THE WRITER THAT NEEDED NOTHING.
// ---------------------------------------------------------------------------------------------

cell("persist_witness_facts is duplicate-free AT SOURCE, so it carries no on-conflict clause — read off the installed body", async () => {
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.persist_witness_facts(uuid,jsonb,jsonb,integer)'::regprocedure"
  )).rows[0].prosrc;

  assert.ok(src.includes("foreach v_f in array v_belt loop"),
    "the belt loop must still walk an ARRAY of distinct field names — that is what makes it duplicate-free");
  assert.ok(src.includes("select distinct on (c.field_path)"),
    "the optional loop must still select `distinct on (c.field_path)` — the other half of the same property");
  assert.equal(src.split("insert into clara.document_regions").length - 1, 2,
    "still exactly two region inserts in this body");
  assert.ok(!/on conflict \(extraction_id,\s*field_path\)/i.test(src),
    "persist_witness_facts must stay UNRECUT at the region key: it cannot produce a duplicate there, so it needs no conflict arm");

  // …and the two writers that CAN produce one do carry it.
  const recut = (await rootQuery(
    `select proname, prosrc from pg_proc
      where pronamespace='clara'::regnamespace
        and proname in ('persist_document_extraction','persist_invoice_facts')`)).rows;
  assert.equal(recut.length, 2);
  for (const r of recut) {
    // The PREDICATE is part of the arm: an inference target must match the partial index's own
    // predicate, so an arm that lost the WHERE would raise 42P10 on the first duplicate cell
    // instead of absorbing it.
    assert.match(r.prosrc.replace(/\s+/g, " "),
      /on conflict \(extraction_id,field_path\) where field_path is distinct from 'opening_tb\.line' do nothing/,
      `${r.proname} does not resolve the region-key conflict deterministically at the PARTIAL key`);
  }
});

// ---------------------------------------------------------------------------------------------
// 9. THE ONE EXCLUSION — the opening lane.
// ---------------------------------------------------------------------------------------------

cell("MANY `opening_tb.line` regions still insert on ONE extraction — the opening lane is outside the key", async () => {
  // #778 / #213-lane: this is the exception the key was made PARTIAL for, and it is not a
  // convenience. 0017_wave_b.sql:759-765's ck_document_regions_opening_fact_0017 admits an opening
  // fact ONLY when `field_path='opening_tb.line'` — one literal, not a namespace — so every line of
  // a trial balance must live at that one path. packages/runtime/lib/opening-tb-cells.mjs builds
  // the region at :141-153, one per kept row at :233, and hands the whole list to
  // clara.persist_document_extraction at :387. A forty-line trial balance is forty lawful rows at
  // ONE (extraction_id, field_path); under a TOTAL key the `do nothing` arm would have absorbed
  // thirty-nine of them and left an opening balance holding a single line, silently.
  const world = await seedWorld("openingtb");
  const extraction = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
     values ($1,$2,$3,'ocr',1,'done',1,'{}'::jsonb) returning id`,
    [world.firm, world.documentId, `clara-fixture:0201-tb-${opk("e")}`])).rows[0].id;

  // Three trial-balance lines, the shape the producer emits: same path, distinct accounts, and the
  // 0017 opening-fact triple on each (which is what pins the literal in the first place).
  const LINES = [["1000", 250_000, "debit"], ["2000", 150_000, "credit"], ["3000", 100_000, "credit"]];
  for (const [account, cents, side] of LINES) {
    const err = await caught(() => rootQuery(
      `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path,
          text_content, monetary_raw, monetary_cents, opening_account_code, opening_amount_cents, opening_side)
       values ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'opening_tb.line',
               $3,$4,$5,$6,$5,$7)`,
      [world.firm, extraction, `${account} OPENING RM ${(cents / 100).toFixed(2)} ${side === "debit" ? "DR" : "CR"}`,
        (cents / 100).toFixed(2), cents, account, side]));
    assert.equal(err, null,
      `a trial balance is MANY lines at one path — ${account} was refused (${err?.code}: ${err?.message})`);
  }

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_regions where extraction_id=$1 and field_path='opening_tb.line'",
    [extraction])).rows[0].n;
  assert.equal(n, LINES.length, "every trial-balance line must stand — none absorbed by the key");

  // …and the exclusion is EXACTLY that literal: a neighbouring path on the same extraction is
  // still inside the key, so the exception cannot quietly widen into a namespace.
  await rootQuery(REGION_INSERT, [world.firm, extraction, "opening_tb.total", "TOTAL", null, null]);
  const dupe = await caught(() => rootQuery(REGION_INSERT,
    [world.firm, extraction, "opening_tb.total", "TOTAL AGAIN", null, null]));
  assert.ok(dupe, "`opening_tb.total` is NOT the pinned literal and must still be one row per extraction");
  assert.equal(dupe.code, "23505", `expected a unique violation, got ${dupe.code}: ${dupe.message}`);
});
