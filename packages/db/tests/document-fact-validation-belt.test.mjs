// #624 — THE VALIDATION/EVIDENCE INVARIANT, PINNED ON BOTH SIDES.
//
// THE INVARIANT, stated once so nothing below has to be re-derived from a trigger body:
//
//   A row in clara.document_fact_validations is a measurement of the rows it cites, and it stays
//   one. The invoice verdict is computed at COMMIT from the header insert, over the
//   clara.document_regions of that extraction; the statement verdict is computed the same way
//   over the clara.bank_statement_lines of that statement. A validation row is APPEND-ONLY, so
//   a CHILD row arriving in a LATER transaction than its header — a lone region, a lone line —
//   would leave the recorded verdict describing evidence that no longer exists in that shape.
//   That is not a supported writer path, and both sides REFUSE it rather than record a second,
//   contradictory answer.
//
// WHY IT NEEDS A TEST AT ALL. A trigger that fires only on the HEADER table is structurally
// blind to a child insert: that write touches no header row, so it dodges the recorder entirely.
// 0038:2300-2305 names the hazard for the statement/line pair and answers it by putting the belt
// on the child table too. 0191 §S7a-bis gives clara.document_regions the same property — with
// one deliberate difference: the region-side trigger REFUSES rather than re-records, because the
// validation row is append-only and a second recorder would either destroy that property or lose
// its recomputation to `on conflict do nothing` (the stale row again, wearing a fix).
//
// EVERY CELL HERE IS A MEASUREMENT, not a restatement of the migration. Cell 1 is the positive
// control the whole design rests on (the supported path writes a verdict that AGREES with its
// regions, and is not refused). Cells 2 and 3 walk both sides of the region belt's `when`. Cell 4
// is the statement half, proven against 0038's own belt rather than assumed from its comment.
// Cell 5 is the estate-wide sweep: no validation row on this database disagrees with the rows it
// cites, whoever wrote it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, opk, withActor, insertUser } from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR10 = "CLR10";
const IDENTITY = "invoice.six_term_identity";

/** A CLOSING invoice: 94.30 net + 3.77 service + 5.66 tax + 0.02 rounding = 103.75 gross. */
const CLOSING = [
  ["invoice.total", 10_375],
  ["invoice.total_excl_tax", 9_430],
  ["invoice.tax_total", 566],
  ["invoice.service_charge", 377],
  ["invoice.rounding", 2],
];

let live = false;
let executed = 0;
const EXPECTED_CELLS = 5;

async function cohortApplied() {
  const r = await rootQuery(`select
      to_regclass('clara.document_fact_validations') is not null
      and to_regprocedure('clara._invoice_identity_verdict(uuid)') is not null as ok`);
  return r.rows[0].ok === true;
}

before(async () => { live = await cohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY === "1") {
    console.warn("SKIP document-fact-validation-belt: the cohort is not applied (explicit pre-integration run).");
    t.skip("document-capability cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("document-fact-validation-belt is required for a focused run: apply 0191_document_capability_registry.sql");
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

const REGION_INSERT = `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
    field_path, text_content, monetary_raw, monetary_cents)
  values ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,$5,$6)`;

/** A firm with one facts extraction whose regions land in the SAME transaction — the shape every
 *  in-repo writer (persist_document_extraction, persist_invoice_facts, persist_witness_facts)
 *  produces, reproduced here without a task ceremony because the SUBJECT is the trigger's timing. */
async function seedFactsExtraction(regions = CLOSING) {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`belt_${opk("firm")}`])).rows[0].id;
  const doc = await seedVerifiedDocument({ firm, filename: "belt.pdf", grantClassifyConsent: false });
  const engine = `clara-fixture:0191-belt-${opk("e")}`;
  const extraction = await withActor({ transaction: true }, async (c) => {
    const id = (await c.query(
      `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope)
       values ($1,$2,$3,'invoice_facts',1,'done',1,'{}'::jsonb) returning id`,
      [firm, doc.documentId, engine])).rows[0].id;
    for (const [path, cents] of regions) {
      await c.query(REGION_INSERT, [firm, id, path, (cents / 100).toFixed(2), (cents / 100).toFixed(2), cents]);
    }
    return id;
  });
  return { firm, documentId: doc.documentId, extraction, engine };
}

const recorded = (extraction) => rootQuery(
  `select check_name, outcome, detail, engine_id from clara.document_fact_validations
    where extraction_id=$1 order by check_name`, [extraction]).then((r) => r.rows);

const rederived = (extraction) => rootQuery(
  "select outcome, detail from clara._invoice_identity_verdict($1)", [extraction]).then((r) => r.rows[0]);

// ---------------------------------------------------------------------------------------------
// 1. THE POSITIVE CONTROL.
// ---------------------------------------------------------------------------------------------

cell("the supported path records a verdict that AGREES with the regions it cites — and is not refused", async () => {
  const s = await seedFactsExtraction();
  const rows = await recorded(s.extraction);
  assert.equal(rows.length, 1, "exactly one verdict per (extraction, check)");
  assert.equal(rows[0].check_name, IDENTITY);
  assert.equal(rows[0].outcome, "pass",
    "94.30 + 3.77 + 5.66 + 0.02 = 103.75 — the identity closes, so the record must say so");
  assert.equal(rows[0].detail.residual_cents, 0);
  assert.equal(rows[0].engine_id, s.engine, "the verdict names the engine that produced the reading");

  const now = await rederived(s.extraction);
  assert.equal(now.outcome, rows[0].outcome, "the recorded verdict and a re-derivation disagree already");
  assert.deepEqual(now.detail, rows[0].detail, "…and their terms disagree");
});

// ---------------------------------------------------------------------------------------------
// 2 & 3. THE REGION-SIDE BELT, BOTH SIDES OF ITS `when`.
// ---------------------------------------------------------------------------------------------

cell("a lone LATER region carrying an identity term is REFUSED — the recorded verdict cannot go stale", async () => {
  const s = await seedFactsExtraction();
  const before = await recorded(s.extraction);

  const err = await caught(() => rootQuery(REGION_INSERT,
    [s.firm, s.extraction, "invoice.discount", "50.00", "50.00", 5_000]));

  assert.ok(err, "a lone later region was ACCEPTED — the recorded verdict now describes regions that are not on file");
  assert.equal(err.code, CLR10, `expected ${CLR10}, got ${err.code}: ${err.message}`);
  assert.match(err.message, /not a supported writer path/);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "fact_validation_would_go_stale",
    "the refusal must name its reason so a caller can tell it from an arithmetic failure");

  assert.deepEqual(await recorded(s.extraction), before, "the refusal must leave the record untouched");
  const n = (await rootQuery(
    "select count(*)::int n from clara.document_regions where extraction_id=$1", [s.extraction])).rows[0].n;
  assert.equal(n, CLOSING.length, "and must leave no region behind");
});

cell("a lone LATER region that CANNOT move the identity is admitted — the belt narrows, it does not forbid", async () => {
  // The trigger's `when` names the seven terms the verdict is a function of. Anything else — an
  // OCR line, a spreadsheet cell, a non-monetary invoice reference — is not queued at all, which
  // is what keeps a 50,000-cell XLSX ingest off the deferred-trigger queue. The claim that this
  // is a COST narrowing rather than a protection one is only true if the admitted write really
  // cannot stale the verdict, so that is what is measured here rather than asserted.
  const s = await seedFactsExtraction();
  const before = await recorded(s.extraction);

  for (const path of ["pages.1.lines.0", "sheets.0.A1", "invoice.currency", "invoice.vendor_name"]) {
    const err = await caught(() => rootQuery(REGION_INSERT, [s.firm, s.extraction, path, "MYR", null, null]));
    assert.equal(err, null, `${path} was refused, but it is not a term of the identity`);
  }

  const now = await rederived(s.extraction);
  assert.equal(now.outcome, before[0].outcome, "an admitted region moved the outcome — the `when` is too narrow");
  assert.deepEqual(now.detail, before[0].detail, "an admitted region moved the identity's terms — the `when` is too narrow");
  assert.deepEqual(await recorded(s.extraction), before, "and no second verdict was written");
});

// ---------------------------------------------------------------------------------------------
// 4. THE STATEMENT HALF — 0038's own belt, which 0191 RELIES ON rather than duplicating.
// ---------------------------------------------------------------------------------------------

cell("the statement side enforces the same invariant through 0038's belt: a lone LATER line is refused", async () => {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`belt_${opk("firm")}`])).rows[0].id;
  const client = (await rootQuery("insert into clara.clients(firm_id,name) values ($1,$2) returning id",
    [firm, `belt_${opk("client")}`])).rows[0].id;
  const doc = await seedVerifiedDocument({
    firm, client, filename: "stmt.pdf", kind: "bank_statement", grantClassifyConsent: false });
  await rootQuery(
    `insert into clara.coa_accounts(firm_id, client_id, account_code, name, account_type)
     values ($1,$2,'1000','Cash at bank','asset')`, [firm, client]);
  const account = (await rootQuery(
    `insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display, account_number,
        account_number_normalized, coa_account_code, created_by, created_at)
     values ($1,$2,'MBB','Malayan Banking Berhad (Maybank)',$3,$3,'1000',$4,now()) returning id`,
    [firm, client, String(Date.now()).slice(-12), await insertUser("belt", opk("u"))])).rows[0].id;

  // opening 100.00 + (30.00 - 5.00) = closing 125.00, and the printed totals agree with the lines.
  const LINES = [[1, "2026-01-05", 3_000], [2, "2026-01-09", -500]];
  const statement = await withActor({ transaction: true }, async (c) => {
    const id = (await c.query(
      `insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id,
          source_doc_sha256, filing_id, facts_hash, period_start, period_end, statement_date,
          opening_cents, closing_cents, total_debit_cents, total_credit_cents, line_count, ingest_mode)
       values ($1,$2,$3,$4,$5,$6,decode('00','hex'),'2026-01-01'::date,'2026-01-31'::date,
          '2026-01-31'::date,10000,12500,500,3000,$7,'structured') returning id`,
      [firm, client, account, doc.documentId, doc.sha256, doc.filingId, LINES.length])).rows[0].id;
    for (const [no, date, cents] of LINES) {
      await c.query(
        `insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
            line_no, entry_date, description, amount_cents)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8)`,
        [firm, client, id, account, no, date, `line ${no}`, cents]);
    }
    return id;
  });

  const rows = (await rootQuery(
    `select check_name, outcome, detail from clara.document_fact_validations
      where statement_id=$1 order by check_name`, [statement])).rows;
  assert.deepEqual(rows.map((r) => `${r.check_name}=${r.outcome}`),
    ["statement.chain_closes=pass", "statement.printed_totals=pass"],
    "the supported path records both statement checks");

  // The chain-NEUTRAL pair is the discriminating probe: +10.00 and -10.00 leave `opening + Σ =
  // closing` intact, so a chain-only check would not notice them — while they DO move the printed
  // debit/credit sums the second check compares. 0038's belt catches them on line_count alone.
  const err = await caught(() => withActor({ transaction: true }, async (c) => {
    for (const [no, cents] of [[3, 1_000], [4, -1_000]]) {
      await c.query(
        `insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
            line_no, entry_date, description, amount_cents)
         values ($1,$2,$3,$4,$5,'2026-01-20'::date,'later',$6)`,
        [firm, client, statement, account, no, cents]);
    }
  }));
  assert.ok(err, "a lone later pair of lines was ACCEPTED — the statement half of the invariant is unenforced");
  assert.equal(err.code, CLR10, `expected ${CLR10}, got ${err.code}: ${err.message}`);
  assert.match(err.message, /line\(s\)/,
    "0038's belt refuses on line_count congruence and says so");

  const stillTwo = (await rootQuery(
    "select count(*)::int n from clara.bank_statement_lines where statement_id=$1", [statement])).rows[0].n;
  assert.equal(stillTwo, LINES.length, "the refusal must leave no line behind");
});

// ---------------------------------------------------------------------------------------------
// 5. THE ESTATE SWEEP.
// ---------------------------------------------------------------------------------------------

cell("NO validation row on this database disagrees with the rows it cites", async () => {
  // The cells above prove the two write paths. This one proves the PROPERTY, over everything any
  // battery on this rig has written — including rows produced by the real persist bodies in the
  // runtime's own suites. A drifted row here means some writer reached the child table another
  // way, which is precisely the thing the belts exist to make impossible.
  const invoice = (await rootQuery(
    `select v.extraction_id, v.outcome as recorded, d.outcome as now,
            v.detail as recorded_detail, d.detail as now_detail
       from clara.document_fact_validations v
       cross join lateral clara._invoice_identity_verdict(v.extraction_id) d
      where v.extraction_id is not null and v.check_name = $1
        and (v.outcome is distinct from d.outcome or v.detail is distinct from d.detail)`,
    [IDENTITY])).rows;
  assert.deepEqual(invoice.map((r) => `${r.extraction_id}: recorded ${r.recorded}, now ${r.now}`), [],
    "a recorded invoice identity no longer describes its extraction's regions");

  // The line count is a SCALAR SUBQUERY, not a join: a statement carries two validation rows
  // (chain_closes + printed_totals), so joining both and counting lines multiplies the count by
  // two and reports every healthy statement as drifted. Measured — the first cut of this cell did
  // exactly that and accused a statement of carrying four lines when it carried two.
  const statements = (await rootQuery(
    `select s.id, s.line_count,
            (select count(*)::int from clara.bank_statement_lines l where l.statement_id = s.id) as actual
       from clara.bank_statements s
      where exists (select 1 from clara.document_fact_validations v where v.statement_id = s.id)
        and s.line_count <> (select count(*)::int from clara.bank_statement_lines l where l.statement_id = s.id)`)).rows;
  assert.deepEqual(statements.map((r) => `${r.id}: declares ${r.line_count}, carries ${r.actual}`), [],
    "a validated statement's declared line_count no longer matches the lines on file");
});
