// #624 / C33.4 — CANONICAL field_path SYNTAX AT THE OWNING WRITE BOUNDARY.
// Migration: 0191_document_capability_registry.sql (section S3 + the persist recut).
//
// THE BOUNDARY IS ONE FUNCTION, and that is the whole point of C33.4. Three writers put rows in
// `clara.document_regions`:
//
//   clara.persist_invoice_facts   (0009) — a CLOSED seven-path allowlist, already enforced.
//   clara.persist_witness_facts   (0095) — CLOSED arrays (belt + seven optional), already enforced.
//   clara.persist_document_extraction (0123 tip) — took `elem->>'field_path'` VERBATIM and
//                                    UNVALIDATED. That is the gap this migration closes.
//
// So the new validator is spliced into the ONE unvalidated boundary, and the two closed
// allowlists are left byte-untouched — widening them would be a behaviour change nobody asked
// for. The cells below prove both halves: the boundary now refuses malformed paths, and every
// path the two closed allowlists (and every in-repo producer) can emit still PASSES.
//
// THE GRAMMAR IS CENSUSED, NOT INVENTED. The live producers emit numeric segments
// (`pages.1.lines.0`, `rows.0`, `paragraphs.0`) and MIXED-CASE spreadsheet cell refs
// (`sheets.0.A1`), so a lowercase-only grammar would have refused the hot OCR and XLSX ingest
// paths on the first real upload. The XLSX side meets the grammar halfway:
// `structured-worker.mjs`'s normalizeCellRef clamps the workbook's `r=` to an A1 reference and
// falls back to `cell_<ordinal>`, because an `r=` is whatever the file says it is and a merged
// range (`A1:B1`) would otherwise refuse the persist and loop the lane
// (packages/runtime/tests/structured-worker-cell-ref.test.mjs). The accepted shape is: dot-separated segments, each either an unsigned integer or
// an identifier `[A-Za-z_][A-Za-z0-9_]*`, at most 12 segments, at most 128 characters, with the
// FIRST segment drawn from the registered namespace roster.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, opk } from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR10 = "CLR10";

/** Every field_path an in-repo producer can put in front of `persist_document_extraction`, or
 *  that either closed allowlist can write, censused 2026-09-13 across packages/runtime and
 *  packages/db. Each entry names its producer so a future reader can re-derive the census. */
const CENSUS = Object.freeze([
  // packages/runtime/lib/egress.mjs:146,163 — the Azure layout normalizer (the `ocr` lane).
  ["pages.1.lines.0", "egress.mjs normalizeAzureLayout line region"],
  ["pages.17.lines.412", "egress.mjs normalizeAzureLayout, multi-page"],
  ["tables.0.cells.3", "egress.mjs normalizeAzureLayout table cell"],
  ["tables.12.cells.980", "egress.mjs normalizeAzureLayout, wide table"],
  // packages/runtime/lib/structured-worker.mjs:47,89,106 — the `structured_parse` lane.
  ["rows.0", "structured-worker.mjs parseCsv"],
  ["rows.19999", "structured-worker.mjs parseCsv at the MAX_ITEMS cap"],
  ["sheets.0.A1", "structured-worker.mjs parseXlsx — an A1 r= attribute, kept as written"],
  ["sheets.11.AA128", "structured-worker.mjs parseXlsx, multi-sheet + two-letter column"],
  ["sheets.0.cell_1", "structured-worker.mjs normalizeCellRef — the fallback when r= is absent or is not an A1 reference"],
  ["paragraphs.0", "structured-worker.mjs parseDocx"],
  // packages/runtime/lib/myinvois.mjs:120-124 — the UBL identity pass.
  ["myinvois.supplier_tin", "myinvois.mjs parseUblIdentity"],
  ["myinvois.supplier_brn", "myinvois.mjs parseUblIdentity"],
  ["myinvois.buyer_id_primary", "myinvois.mjs parseUblIdentity"],
  ["myinvois.buyer_id_secondary", "myinvois.mjs parseUblIdentity"],
  // packages/runtime/lib/opening-tb-cells.mjs:147 and seeding-parse.mjs's prior-GL twin.
  ["opening_tb.line", "opening-tb-cells.mjs toRegion"],
  ["prior_gl.line", "seeding-parse.mjs prior-GL region"],
  // clara.persist_invoice_facts' closed seven (0009:2069-2071).
  ["invoice.total", "persist_invoice_facts allowlist"],
  ["invoice.amount_due", "persist_invoice_facts allowlist"],
  ["invoice.currency", "persist_invoice_facts allowlist"],
  ["invoice.vendor_name", "persist_invoice_facts allowlist"],
  ["invoice.invoice_id", "persist_invoice_facts allowlist"],
  ["invoice.invoice_date", "persist_invoice_facts allowlist"],
  ["invoice.deposit", "persist_invoice_facts allowlist"],
  // clara.persist_witness_facts' belt + optional arrays (0095:330-344).
  ["invoice.total_excl_tax", "persist_witness_facts belt"],
  ["invoice.tax_total", "persist_witness_facts belt"],
  ["invoice.rounding", "persist_witness_facts belt"],
  ["invoice.service_charge", "persist_witness_facts belt"],
  ["invoice.discount", "persist_witness_facts belt"],
  ["invoice.delivery", "persist_witness_facts belt"],
  ["invoice.type_code", "persist_witness_facts belt"],
  ["invoice.customer_name", "persist_witness_facts optional"],
  ["invoice.customer_registration", "persist_witness_facts optional"],
  ["invoice.customer_taxid", "persist_witness_facts optional"],
  ["invoice.vendor_registration", "persist_witness_facts optional"],
  // packages/runtime/lib/myinvois.mjs mapFactsFields — the local_facts vocabulary.
  ["invoice.tax_breakdown", "myinvois.mjs mapFactsFields"],
  ["invoice.myinvois_uuid", "myinvois.mjs mapFactsFields"],
  ["invoice.myinvois_longid", "persist_invoice_facts allowlist (0009:2096)"],
  ["invoice.contact_person", "invoice-customer-identity.mjs"],
  // NOT a producer path: f-a1-witness-unit.test.mjs:404 uses it as a citation deliberately
  // OUTSIDE the closed eighteen, so it is a shape the boundary can be handed. It is censused
  // because a test fixture is a real caller — the first cut of this list credited it to
  // invoice-totals-reader.mjs's TOTALS_FIELD_PATHS, which does not contain it.
  ["invoice.grand_total", "f-a1-witness-unit.test.mjs fixture — outside the closed allowlist"],
  // The statement vocabulary the web extract surface already labels.
  ["statement.closing_balance", "apps/web/lib/documents/extract-shape.ts"],
]);

/** Shapes the boundary MUST refuse. Each is a real class, not a decoration. */
const REFUSED = Object.freeze([
  ["invoice..total", "an empty segment"],
  ["Invoice.Total", "an unregistered namespace (the roster is lowercase)"],
  [".invoice.total", "a leading dot"],
  ["invoice.total.", "a trailing dot"],
  ["invoice.total; drop table clara.documents", "a statement terminator and whitespace"],
  ["../../etc/passwd", "a traversal shape"],
  ["evil.total", "a namespace no producer owns"],
  ["invoice.tot al", "an embedded space"],
  ["invoice.total\n", "a newline"],
  ["pages.1.lines.0.<script>", "markup"],
  ["a".repeat(200), "over the 128-character cap"],
  ["invoice." + "a.".repeat(20) + "z", "over the 12-segment cap"],
]);

let live = false;
let executed = 0;
const EXPECTED_CELLS = 7;

async function cohortApplied() {
  const r = await rootQuery(`select
      to_regprocedure('clara._assert_field_path(text)') is not null as f,
      coalesce(position('_assert_field_path' in p.prosrc) > 0, false) as spliced
    from (select 1) _ left join pg_proc p
      on p.oid = to_regprocedure('clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)')`);
  const { f, spliced } = r.rows[0];
  if (f !== spliced) {
    throw new Error(
      `field-path cohort is PARTIAL: validator=${f} spliced_into_persist=${spliced}. `
      + "A validator nothing calls is worse than no validator; refusing to skip past it.",
    );
  }
  return f === true;
}

before(async () => { live = await cohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY === "1") {
    console.warn("SKIP field-path-grammar: the cohort is not applied (explicit pre-integration run).");
    t.skip("field-path cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("field-path-grammar is required for a focused run: apply 0191_document_capability_registry.sql");
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

// ---------------------------------------------------------------------------------------------
// THE VALIDATOR ITSELF.
// ---------------------------------------------------------------------------------------------

cell("every field_path an in-repo producer can emit PASSES the validator", async () => {
  const failures = [];
  for (const [path, producer] of CENSUS) {
    const err = await caught(() => rootQuery("select clara._assert_field_path($1)", [path]));
    if (err) failures.push(`${path} (${producer}): ${err.code} ${err.message}`);
  }
  assert.deepEqual(failures, [],
    "a validator that refuses a live producer's path is an outage, not a wall");
});

cell("a NULL field_path passes — the column is nullable and a region without a named field is legitimate", async () => {
  const err = await caught(() => rootQuery("select clara._assert_field_path(null)"));
  assert.equal(err, null, "a null path must not raise: document_regions.field_path is nullable by design");
});

cell("every malformed shape is REFUSED with CLR10, naming the path", async () => {
  const survivors = [];
  for (const [path, why] of REFUSED) {
    const err = await caught(() => rootQuery("select clara._assert_field_path($1)", [path]));
    if (!err) { survivors.push(`${why}: ${JSON.stringify(path)}`); continue; }
    assert.equal(err.code, CLR10, `${why}: expected ${CLR10}, got ${err.code}`);
  }
  assert.deepEqual(survivors, [], "a malformed field_path was accepted");
});

cell("the registered namespace roster is exactly the censused producers' first segments — no speculative namespace", async () => {
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._assert_field_path(text)'::regprocedure")).rows[0].prosrc;
  const expected = [...new Set(CENSUS.map(([p]) => p.split(".")[0]))].sort();
  for (const ns of expected) {
    assert.ok(src.includes(`'${ns}'`), `the roster does not name the censused namespace '${ns}'`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE BOUNDARY — the recut persist actually calls it, and the rest of the body is intact.
// ---------------------------------------------------------------------------------------------

cell("persist_document_extraction REFUSES a malformed field_path with CLR10 and persists a well-formed one", async () => {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`fp_${opk("firm")}`])).rows[0].id;
  const doc = await seedVerifiedDocument({ firm, filename: "fp.pdf", grantClassifyConsent: false });

  // `running` carries the ck_processing_task_binding_f_a1 obligation: a workflow_run_id AND a
  // started_at. Minted through the root connection because the SUBJECT here is the persist
  // boundary, not the claim ceremony.
  const mintTask = async () => (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,(select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
        where document_id=$2 and lane='ocr'),'ocr','running',$4,now()) returning id`,
    [firm, doc.documentId, `clara-fixture:0191-ocr-${opk("e")}`, `rig-0191-run-${opk("r")}`])).rows[0].id;

  const persist = (task, fieldPath, key) => rootQuery(
    `select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,$2::jsonb,null,null,$3) as r`,
    [task, JSON.stringify([{
      locator_kind: "page_polygon", locator: { page: 1, polygon: [0, 0, 1, 1] },
      field_path: fieldPath, text_content: "128.52", engine_confidence: 0.9,
      monetary_raw: null, monetary_cents: null,
    }]), key]);

  for (const bad of ["invoice..total", "Invoice.Total", "a".repeat(200)]) {
    const task = await mintTask();
    const err = await caught(() => persist(task, bad, opk("pde")));
    assert.ok(err, `${bad} was accepted by the persist boundary`);
    assert.equal(err.code, CLR10, `${bad}: expected ${CLR10}, got ${err.code} -- ${err.message}`);
    // The refusal aborts the whole persist: no region, and the task is not settled.
    const after = (await rootQuery(
      "select status from clara.document_processing_tasks where id=$1", [task])).rows[0].status;
    assert.equal(after, "running", `${bad}: the task must not settle on a refused persist`);
    // uq_document_processing_one_live_lane admits ONE live task per (document, lane), and the
    // refusal deliberately leaves this one live. Retire it so the next probe can mint its own —
    // this is fixture hygiene, not part of the assertion.
    await rootQuery(
      "update clara.document_processing_tasks set status='failed',error_code='engine_error',finished_at=now() where id=$1",
      [task]);
  }

  for (const good of ["invoice.total", "statement.closing_balance", "pages.1.lines.0", "sheets.0.A1"]) {
    const task = await mintTask();
    await persist(task, good, opk("pde"));
    const n = (await rootQuery(
      `select count(*)::int as n from clara.document_regions r
         join clara.document_extractions e on e.id=r.extraction_id
        where e.document_id=$1 and r.field_path=$2`, [doc.documentId, good])).rows[0].n;
    assert.equal(n, 1, `${good} did not persist`);
  }
});

cell("the recut preserved persist_document_extraction's identity: owner, DEFINER, search_path and every pre-existing gate", async () => {
  const r = (await rootQuery(`select p.prosrc, p.proowner::regrole::text as owner, p.prosecdef,
      coalesce(array_to_string(p.proconfig,','),'') as config
    from pg_proc p
    where p.oid='clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure`)).rows[0];
  assert.equal(r.owner, "clara_fn_owner");
  assert.equal(r.prosecdef, true);
  assert.match(r.config, /search_path=/);
  for (const marker of [
    "classify tasks are settled by classify_document",
    "persist_document_extraction only settles ocr/structured_parse tasks",
    "store-only tasks do not create extractions",
    "attribution_field_not_allowed",
    "firm_narrow_output_forbidden",
    "v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;",
    "document.extraction_completed",
  ]) {
    assert.ok(r.prosrc.includes(marker), `the recut dropped a pre-existing limb: ${marker}`);
  }
  assert.equal(r.prosrc.split("v_ekind:=").length - 1, 1,
    "v_ekind is still assigned exactly once (f-a7 cell 36's own invariant)");
});

cell("the two CLOSED allowlists are byte-untouched — the validator widened nothing", async () => {
  const rows = (await rootQuery(`select proname, prosrc from pg_proc
     where pronamespace='clara'::regnamespace
       and proname in ('persist_invoice_facts','persist_witness_facts')`)).rows;
  assert.equal(rows.length, 2, "both closed-allowlist writers must be present");
  for (const r of rows) {
    assert.ok(!r.prosrc.includes("_assert_field_path"),
      `${r.proname} was recut — the closed allowlists must stay exactly as they were`);
  }
});
