// #624 — THE VALIDATION/EVIDENCE LAW, PINNED ON BOTH SIDES.
//
// THE LAW, stated once so nothing below has to be re-derived from a trigger body:
//
//   A row in clara.document_fact_validations is a measurement of the rows it cited AT THE MOMENT
//   IT WAS TAKEN, and it is never changed afterwards. The invoice verdict's first revision is
//   computed at COMMIT from the header insert, over the clara.document_regions of that
//   extraction; the statement verdict is computed the same way over the
//   clara.bank_statement_lines of that statement. A CHILD row arriving in a LATER transaction
//   than its header would leave the recorded verdict describing evidence that no longer exists in
//   that shape — so the region side RE-DERIVES at commit and, if the verdict actually moved,
//   APPENDS the next revision for that (extraction, check_name). Nothing is updated, nothing is
//   deleted, and nothing is refused. Readers take the highest revision.
//
// THE TWO SIDES ARE DELIBERATELY ASYMMETRIC, and that is measured here rather than glossed. The
// statement side (0038's own belt on clara.bank_statement_lines, a MERGED migration) REFUSES a
// lone later line with CLR10, because a statement's declared `line_count` is part of the document
// as filed rather than a verdict derived from it. The region side does not: a later region is new
// information about the same extraction, and the honest answer is a new measurement.
//
// WHY THE REGION SIDE CHANGED. 0191's first cut refused too (CLR10
// `fact_validation_would_go_stale`), reasoning that no in-repo writer lands a region late. That
// was true of the WRITERS and false of the ESTATE: at wave-2 integration (CI run 34793833626) it
// reddened 291 db cells and 7 runtime cells, including cells whose re-derived verdict was
// IDENTICAL to the recorded one. The property worth protecting was never "children may not arrive
// late"; it was "the current verdict describes the rows on file", and an append gives that
// without refusing a write the trigger agrees with.
//
// EVERY CELL HERE IS A MEASUREMENT, not a restatement of the migration. Cell 1 is the positive
// control the whole design rests on (the supported path writes ONE verdict, at revision 1, that
// agrees with its regions). Cells 2–4 walk the region belt: unchanged verdict → no row; changed
// verdict → exactly one appended revision, the earlier row untouched and the DOOR reading the new
// one; a path outside the `when` → not queued at all. Cell 5 is the same-transaction collapse (a
// commit that moves the identity adds ONE revision, not one per region). Cell 6 is the statement
// half, proven against 0038's own belt rather than assumed from its comment. Cell 7 is the
// estate-wide sweep: no CURRENT validation row on this database disagrees with the rows it cites,
// whoever wrote it. Cell 8 is the firm boundary on both read lanes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool, opk, withActor, insertUser, mintWake, ROLES } from "./rig-fixtures.mjs";
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
const EXPECTED_CELLS = 8;

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

/** A firm + client + FILED document + one facts extraction whose regions land in the SAME
 *  transaction — the shape every in-repo writer (persist_document_extraction,
 *  persist_invoice_facts, persist_witness_facts) produces, reproduced here without a task
 *  ceremony because the SUBJECT is the trigger's timing. Filed to a client so the cells below can
 *  read the verdict back through the real door, `clara.get_document_state(document, client)`,
 *  rather than only off the table. */
async function seedFactsExtraction(regions = CLOSING) {
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`belt_${opk("firm")}`])).rows[0].id;
  const client = (await rootQuery("insert into clara.clients(firm_id,name) values ($1,$2) returning id",
    [firm, `belt_${opk("client")}`])).rows[0].id;
  const doc = await seedVerifiedDocument({ firm, client, filename: "belt.pdf", grantClassifyConsent: false });
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
  return { firm, client, documentId: doc.documentId, extraction, engine };
}

/** EVERY revision on file for this extraction, oldest first — the cells below assert on the
 *  history as well as on the current answer, because "append-only" is a claim about what did NOT
 *  change, and a cell that reads only the latest row cannot see an overwrite. */
const recorded = (extraction) => rootQuery(
  `select check_name, outcome, detail, engine_id, revision from clara.document_fact_validations
    where extraction_id=$1 order by check_name, revision`, [extraction]).then((r) => r.rows);

const rederived = (extraction) => rootQuery(
  "select outcome, detail from clara._invoice_identity_verdict($1)", [extraction]).then((r) => r.rows[0]);

/** The verdict as the DOOR answers it — `clara.get_document_state`, read by a human member of the
 *  document's own firm, which is how every surface sees this table. */
async function doorValidations(session, s) {
  const r = await humanQuery(session.user, "select clara.get_document_state($1::uuid,$2::uuid) as x",
    [s.documentId, s.client]);
  return (r.rows[0].x?.facts?.validations ?? []).filter((v) => v.check_name === IDENTITY);
}

// ---------------------------------------------------------------------------------------------
// 1. THE POSITIVE CONTROL.
// ---------------------------------------------------------------------------------------------

cell("the supported path records ONE verdict, at revision 1, that AGREES with the regions it cites", async () => {
  const s = await seedFactsExtraction();
  const rows = await recorded(s.extraction);
  assert.equal(rows.length, 1, "exactly one verdict per (extraction, check) on the supported path");
  assert.equal(rows[0].check_name, IDENTITY);
  assert.equal(rows[0].revision, 1, "a persist that lands header and regions together never appends");
  assert.equal(rows[0].outcome, "pass",
    "94.30 + 3.77 + 5.66 + 0.02 = 103.75 — the identity closes, so the record must say so");
  assert.equal(rows[0].detail.residual_cents, 0);
  assert.equal(rows[0].engine_id, s.engine, "the verdict names the engine that produced the reading");

  const now = await rederived(s.extraction);
  assert.equal(now.outcome, rows[0].outcome, "the recorded verdict and a re-derivation disagree already");
  assert.deepEqual(now.detail, rows[0].detail, "…and their terms disagree");
});

// ---------------------------------------------------------------------------------------------
// 2-4. THE REGION-SIDE BELT: append when the verdict moved, silence when it did not, and no queue
// entry at all outside the `when`.
// ---------------------------------------------------------------------------------------------

cell("a lone LATER region that does NOT move the verdict writes NOTHING — and is not refused", async () => {
  // THE CELL THE FIRST CUT GOT WRONG. A later `invoice.delivery` region whose raw text carries no
  // normalisable amount — "FREE", which clara._normalize_invoice_cents leaves NULL — is one of the
  // seven guarded paths, so it IS queued and the trigger DOES re-derive. But the verdict function
  // reads delivery through `max(monetary_cents) filter (...)` and strips NULLs out of `detail`,
  // so every term, the residual and the outcome come back exactly as recorded. Measured, not
  // assumed: a `delivery = 0` region does NOT work here, because 0 is a value and
  // `delivery_cents: 0` then joins the detail — which is a real change, and correctly appends.
  // The old trigger refused this write anyway — it asked "did this arrive late?" before "did
  // anything change?" — which is how a correct write came to fail for a reason its caller could
  // not act on.
  const s = await seedFactsExtraction();
  const before = await recorded(s.extraction);

  const err = await caught(() => rootQuery(REGION_INSERT,
    [s.firm, s.extraction, "invoice.delivery", "FREE", "FREE", null]));
  assert.equal(err, null, `a later region the belt AGREES with was refused: ${err?.code} ${err?.message}`);

  const now = await rederived(s.extraction);
  assert.deepEqual(now.detail, before[0].detail,
    "fixture premise: this later region really does leave the re-derived verdict identical");

  assert.deepEqual(await recorded(s.extraction), before,
    "an unchanged verdict must append nothing — a revision per late region would be noise, not history");
  const n = (await rootQuery(
    "select count(*)::int n from clara.document_regions where extraction_id=$1", [s.extraction])).rows[0].n;
  assert.equal(n, CLOSING.length + 1, "and the region itself must be on file");
});

cell("a lone LATER region that MOVES the verdict appends ONE revision — the earlier row untouched, the door on the new one", async () => {
  const s = await seedFactsExtraction();
  const session = await firmSessions(s.firm, "rev");
  const before = await recorded(s.extraction);
  assert.equal(before.length, 1);
  assert.equal(before[0].outcome, "pass");

  // A 50.00 discount genuinely changes the arithmetic: 94.30 + 3.77 + 5.66 + 0.02 - 50.00 = 53.75,
  // which is 50.00 SHORT of the 103.75 total, so the identity that closed a moment ago no longer
  // does and the residual is negative (computed - total).
  const err = await caught(() => rootQuery(REGION_INSERT,
    [s.firm, s.extraction, "invoice.discount", "50.00", "50.00", 5_000]));
  assert.equal(err, null, `the append path raised instead of appending: ${err?.code} ${err?.message}`);

  const after = await recorded(s.extraction);
  assert.equal(after.length, 2, "a moved verdict must leave exactly two rows: the old measurement and the new one");
  assert.deepEqual(after[0], before[0],
    "the earlier revision was MODIFIED — append-only means the row that stood before is identical afterwards");
  assert.equal(after[1].revision, 2, "the appended row is the next revision, not a duplicate at the same one");
  assert.equal(after[1].outcome, "fail", "50.00 of discount breaks the identity, so the new measurement must say so");
  assert.equal(after[1].detail.residual_cents, -5_000,
    "the appended verdict must carry the terms it was derived from, not just an outcome");
  assert.equal(after[1].engine_id, s.engine, "…and still name the engine that produced the reading");

  const now = await rederived(s.extraction);
  assert.equal(now.outcome, after[1].outcome, "the CURRENT revision and a re-derivation disagree");
  assert.deepEqual(now.detail, after[1].detail, "…and their terms disagree");

  // THE DOOR IS THE POINT. Two rows on file must not become two contradicting checks on a surface.
  const shown = await doorValidations(session, s);
  assert.equal(shown.length, 1, "get_document_state showed the history — a surface must see ONE current verdict per check");
  assert.equal(shown[0].outcome, "fail", "…and it must be the LATEST revision, not the superseded one");
  assert.deepEqual(shown[0].detail, after[1].detail);
});

cell("a lone LATER region that CANNOT move the identity is not queued at all — the `when` narrows, it does not forbid", async () => {
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
// 5. THE SAME-TRANSACTION COLLAPSE.
// ---------------------------------------------------------------------------------------------

cell("several later identity regions in ONE transaction append ONE revision, not one per region", async () => {
  // THE RISK THE APPEND INTRODUCED, measured rather than reasoned about. Each queued region fires
  // its own deferred trigger. If they could not see each other's writes, a three-region back-fill
  // would leave three revisions — two of them describing region sets that never existed on their
  // own — and the "history" would be an artefact of trigger order rather than of what Clara
  // believed. It holds because a deferred trigger's SELECT sees rows an earlier deferred trigger
  // wrote in the same transaction, so the second and third find the verdict already current.
  const s = await seedFactsExtraction();
  const before = await recorded(s.extraction);

  const err = await caught(() => withActor({ transaction: true }, async (c) => {
    await c.query(REGION_INSERT, [s.firm, s.extraction, "invoice.discount", "50.00", "50.00", 5_000]);
    await c.query(REGION_INSERT, [s.firm, s.extraction, "invoice.delivery", "10.00", "10.00", 1_000]);
    await c.query(REGION_INSERT, [s.firm, s.extraction, "invoice.service_charge", "1.00", "1.00", 100]);
  }));
  assert.equal(err, null, `a multi-region back-fill was refused: ${err?.code} ${err?.message}`);

  const after = await recorded(s.extraction);
  assert.equal(after.length, 2, `one commit that moves the identity must add ONE revision; found ${after.length} rows`);
  assert.deepEqual(after[0], before[0], "the earlier revision must still be identical");
  assert.equal(after[1].revision, 2);

  const now = await rederived(s.extraction);
  assert.equal(now.outcome, after[1].outcome,
    "the single appended revision must describe the FULL region set the transaction left behind");
  assert.deepEqual(now.detail, after[1].detail);
});

// ---------------------------------------------------------------------------------------------
// 6. THE STATEMENT HALF — 0038's own belt, which 0191 RELIES ON rather than duplicating (and which keeps the STRICTER refusal).
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
// 7. THE ESTATE SWEEP.
// ---------------------------------------------------------------------------------------------

cell("NO CURRENT validation row on this database disagrees with the rows it cites", async () => {
  // The cells above prove the two write paths. This one proves the PROPERTY, over everything any
  // battery on this rig has written — including rows produced by the real persist bodies in the
  // runtime's own suites. A drifted row here means some writer reached the child table another
  // way and the belt did not catch up, which is precisely the thing it exists to make impossible.
  //
  // IT SWEEPS THE CURRENT REVISION ONLY, and that is the whole point of the revision. A
  // SUPERSEDED row is EXPECTED to disagree with the regions on file — it is the measurement that
  // stood before the later region landed, kept deliberately — so a sweep over every row would
  // flag exactly the history this design creates. `distinct on … order by revision desc` takes
  // the row a reader would get; a superseded row that failed to be superseded still shows up,
  // because then it IS the highest revision.
  const invoice = (await rootQuery(
    `with current as (
       select distinct on (v.extraction_id, v.check_name) v.extraction_id, v.outcome, v.detail
         from clara.document_fact_validations v
        where v.extraction_id is not null and v.check_name = $1
        order by v.extraction_id, v.check_name, v.revision desc)
     select c.extraction_id, c.outcome as recorded, d.outcome as now,
            c.detail as recorded_detail, d.detail as now_detail
       from current c
       cross join lateral clara._invoice_identity_verdict(c.extraction_id) d
      where c.outcome is distinct from d.outcome or c.detail is distinct from d.detail`,
    [IDENTITY])).rows;
  assert.deepEqual(invoice.map((r) => `${r.extraction_id}: recorded ${r.recorded}, now ${r.now}`), [],
    "a CURRENT invoice identity no longer describes its extraction's regions");

  // REVISIONS ARE CONTIGUOUS AND START AT 1, swept the same way. The belt computes the next
  // revision as `recorded.revision + 1` off the highest row it can see, so a gap or a zero would
  // mean either a row was deleted (the one thing append-only forbids) or two appends raced past
  // each other's read — and both are invisible to the agreement sweep above, which only ever
  // looks at the top of each stack.
  const stacks = (await rootQuery(
    `select extraction_id, check_name, count(*)::int as n, min(revision)::int as lo, max(revision)::int as hi
       from clara.document_fact_validations
      where extraction_id is not null
      group by extraction_id, check_name
     having min(revision) <> 1 or max(revision) <> count(*)`)).rows;
  assert.deepEqual(stacks.map((r) => `${r.extraction_id}/${r.check_name}: ${r.n} rows, ${r.lo}..${r.hi}`), [],
    "a validation stack is not 1..n contiguous — a row was deleted, or two appends took the same base");

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

// ---------------------------------------------------------------------------------------------
// 8. FIRM SCOPE, MEASURED ON BOTH LANES (#624 closure review, SHOULD 2).
// ---------------------------------------------------------------------------------------------

/** A firm with a human member and an interactive wake credential — the two SESSIONS 0191's two
 *  read policies are written against (`jwt_firm()` for `clara_authenticated`,
 *  `wake_firm()` for `clara_agent_ro`). Distinct users per firm, because
 *  `uq_membership_active_user` admits one active membership per user, total. */
async function firmSessions(firm, tag) {
  const user = await insertUser(`belt_${tag}`, opk("u"));
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'owner','active')",
    [firm, user]);
  const cred = await mintWake({ kind: "interactive", firm });
  return { user, secret: cred.secret };
}

const COUNT_FOR = "select count(*)::int n from clara.document_fact_validations where extraction_id = $1";

const humanCount = (sub, extraction) =>
  humanQuery(sub, COUNT_FOR, [extraction]).then((r) => r.rows[0].n);

const agentCount = (secret, extraction) =>
  withActor({ role: ROLES.agentRo, wakeSecret: secret, transaction: true },
    (c) => c.query(COUNT_FOR, [extraction])).then((r) => r.rows[0].n);

cell("a validation row is read FIRM-SCOPED on both lanes — a firm-B human and a firm-B agent each see none of firm A's", async () => {
  // WHY THIS CELL EXISTS. The fix round moved these policies off `clara.actor_firm_id()` — which
  // is `coalesce(wake_firm(), jwt_firm())` and which 0002:440-443 forbids as an AUTHORIZATION
  // basis — onto the per-lane predicates. What pinned that afterwards was 0191's tail, and the
  // tail counts POLICIES: three exist, so it is green. A predicate rewritten to `true`, or one
  // lane's policy silently widened to the other's accessor, keeps the count at three and keeps
  // the tail green. The closure review named that as the weak link in the whole boundary; this
  // cell measures the ROWS instead, which is the only thing a count of policies cannot fake.
  //
  // BOTH DIRECTIONS ARE ASSERTED. A zero on its own is not evidence — an empty table, a broken
  // grant, or a wake credential that resolves to nothing all produce it. So the positive control
  // comes first: firm A's own two sessions must SEE the row before firm B's seeing none means
  // anything.
  const a = await seedFactsExtraction();
  const sessionsA = await firmSessions(a.firm, "a");

  const firmB = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`belt_${opk("firm")}`])).rows[0].id;
  const sessionsB = await firmSessions(firmB, "b");

  const asRootCount = (await rootQuery(COUNT_FOR, [a.extraction])).rows[0].n;
  assert.equal(asRootCount, 1, "the fixture must have produced exactly one validation row to scope");

  // POSITIVE CONTROLS — the row is genuinely reachable from its OWN firm, on each lane.
  assert.equal(await humanCount(sessionsA.user, a.extraction), 1,
    "firm A's human cannot read firm A's own validation row — the grant or the human policy is broken, " +
    "and the cross-firm zeros below would then prove nothing");
  assert.equal(await agentCount(sessionsA.secret, a.extraction), 1,
    "firm A's agent cannot read firm A's own validation row — the agent policy or the wake credential is broken");

  // THE BOUNDARY ITSELF, one lane at a time. A validation row names an arithmetic outcome over
  // another firm's documents; leaking one leaks both the existence of that firm's document and a
  // judgement about its figures.
  assert.equal(await humanCount(sessionsB.user, a.extraction), 0,
    "a firm-B HUMAN session read firm A's validation rows — p_document_fact_validations_human is not jwt_firm()-scoped");
  assert.equal(await agentCount(sessionsB.secret, a.extraction), 0,
    "a firm-B AGENT session read firm A's validation rows — p_document_fact_validations_agent is not wake_firm()-scoped");

  // AND NEITHER LANE FALLS BACK TO THE OTHER'S ACCESSOR — the property `actor_firm_id()` did not
  // have. A wake secret in a HUMAN session must not become that session's firm: firm A's own
  // credential exists on this database, and handing it to firm B's human must still read zero.
  const borrowed = await withActor(
    { role: ROLES.authenticated, jwtSub: sessionsB.user, wakeSecret: sessionsA.secret, transaction: true },
    (c) => c.query(COUNT_FOR, [a.extraction]));
  assert.equal(borrowed.rows[0].n, 0,
    "a firm-A wake secret set in a firm-B HUMAN session exposed firm A's validation rows — " +
    "the human policy is reading something other than jwt_firm()");
});
