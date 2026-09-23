// #990 — the OPTIONAL per-line SOURCE CITATION a bank-statement line can carry: the page and
// region it was read from on the machine (OCR/witness) intake lane, and which stored extraction
// it came from — never on the CSV/structured or hand-keyed lanes, which have no page concept at
// all. Migration: 0291_bank_statement_line_citation.sql.
//
// THE SEAM. `clara._persist_statement_core_v2`'s own atomic insert into
// `clara.bank_statement_lines` — 0038 §4.2's own residual, restated verbatim by every witness
// recut since ("per-line region citations are not carried"). Cells 990.a-990.c drive it through
// the REAL door (`clara.persist_statement_facts_v2`, the live `statementFacts_v3` workflow's own
// call), never a raw fixture insert — a citation on a witness-lane line is provenance, and a
// test that fabricated one by hand would prove nothing about the writer. Cell 990.d drives the
// SAME core directly as root (`coreV2Direct`, the one door reachable outside p_task) because the
// wrong-lane refusal is a property of the core's own wiring contract, unreachable through
// `persist_statement_facts_v2` (which always calls it with ingest_mode='witness'). Cell 990.e
// proves the READ side: `clara.get_bank_line_matching_context` — the Matching tab's own
// detail-pane door — surfaces the same citation_page the writer banked.
//
// TICKET VERIFICATION (2026-09-20, this lane). #990's Agent Brief (AI-drafted at triage) frames
// "the OCR lane" as running "two readers under two engine ids" — 0038's ORIGINAL two-Azure-
// reader design. The LIVE lane (`statementFacts_v3` -> `persist_statement_facts_v2` ->
// `_persist_statement_core_v2`) has since moved to the witness pair: two engine KINDS
// (`llm_text_facts`/`llm_vision_facts`) sharing ONE engine_id (0098 §3.7/§3.9) — the opposite
// shape from what the brief describes. The brief is stale on the MECHANISM but its ASK still
// stands: `bank_statement_lines` carries no page/region column on this branch, and the owner's
// ruling (2026-09-20, "build it now") still binds. "The OCR lane" below therefore means
// ingest_mode IN ('ocr','witness') — the core's own `v_two` flag, which is what
// `_persist_statement_core_v2` actually gates on. 'ocr' is a dead-but-still-valid input on this
// function (the ancestor `clara._persist_statement_core` serves the real structured/human
// callers today and is untouched by this file); 'witness' is the one a real caller reaches.
//
// WHY THE EXTRACTION ID IS NEVER CALLER-SUPPLIED. `citation_extraction_id` is always v_ext1 —
// the document_extractions row the SAME transaction just banked reader1's own read into (the
// core's step 11) — so "which stored extraction it came from" is a fact the persist core proves
// about itself, never one it trusts a payload to state. Cell 990.a asserts exactly that equality
// rather than merely asserting the column is non-null.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, assertRaisesReason } from "./s6-helpers.mjs";
import {
  registerAccount, witnessChain, stmtHeader, witnessReaders,
  filedStatementDoc, statementWitnessTask, persistV2, coreV2Direct, ymBounds,
} from "./f-a1-statements-fixtures.mjs";

const CLR10 = "CLR10";

/** The #990 migration's STABLE STEM, probed against clara.schema_migrations — never a file
 *  listing, and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "bank_statement_line_citation$";

let live = false;
let world = null;
let executed = 0;
const EXPECTED_CELLS = 5;

async function laneReady() {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
    return r.rows[0].n > 0;
  } catch {
    return false;
  }
}

before(async () => {
  live = await laneReady();
  if (!live) return;
  world = await buildWorld();
});
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_BANK_STATEMENT_LINE_CITATION === "1") {
    console.warn("SKIP bank-statement-line-citation: 0291 is not applied (explicit pre-integration run).");
    t.skip("#990 bank_statement_lines citation columns absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#990: clara.bank_statement_lines carries no source-citation columns. "
    + "Apply 0291_bank_statement_line_citation.sql — a skip is not evidence.");
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

/** Land one live witness statement end-to-end (fresh account, fresh document, fresh task) whose
 *  reader1 lines optionally carry a `{page, region}` citation each — the fixture file's own
 *  `landWitnessStatement` does not offer that knob, so this is a local, minimal variant of it. */
async function landCitedWitnessStatement(client, { linesWithCitation = true } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const reader1Lines = ch.lines.map((l, i) => (linesWithCitation
    ? { ...l, page: i + 1, region: { polygon: [0.1, 0.2 + i * 0.1, 0.9, 0.25 + i * 0.1] } }
    : { ...l }));
  const reader2Lines = ch.lines.map((l) => ({ ...l })); // reader2 never carries a citation
  const payload = witnessReaders(engineId, h, reader1Lines, h, reader2Lines);
  const result = await persistV2(taskId, payload);
  return { result, firm, acct, ch, doc };
}

test("META: clara.bank_statement_lines carries the #990 citation columns", (t) => { gate(t); });

cell("990.a a witness-lane line WITH a page+region citation persists it, stamped with reader1's OWN extraction id — never a caller-supplied one",
  async () => {
    const { result } = await landCitedWitnessStatement(world.clients.A1);
    assert.equal(result.status, "done", `expected a clean witness persist (${JSON.stringify(result)})`);
    assert.ok(result.reader1_extraction_id, "the wrapper names reader1's own extraction id");
    const rows = (await rootQuery(
      `select line_no, citation_extraction_id, citation_page, citation_region
         from clara.bank_statement_lines where statement_id=$1 order by line_no`,
      [result.statement_id])).rows;
    assert.equal(rows.length, 3, "three lines land");
    for (const [i, row] of rows.entries()) {
      assert.equal(row.citation_extraction_id, result.reader1_extraction_id,
        "every citation is stamped with the SAME row this call banked reader1's read into");
      assert.equal(row.citation_page, i + 1, `line ${i + 1} carries its own printed page`);
      assert.deepEqual(row.citation_region, { polygon: [0.1, 0.2 + i * 0.1, 0.9, 0.25 + i * 0.1] },
        `line ${i + 1} carries its own region, not a shared/blurred one`);
    }
  });

cell("990.b a witness-lane line with NO citation persists with all three columns null — absence is never an error and never treated as a malformed row",
  async () => {
    const { result } = await landCitedWitnessStatement(world.clients.A2, { linesWithCitation: false });
    assert.equal(result.status, "done", `expected a clean witness persist (${JSON.stringify(result)})`);
    const rows = (await rootQuery(
      `select citation_extraction_id, citation_page, citation_region
         from clara.bank_statement_lines where statement_id=$1`, [result.statement_id])).rows;
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.citation_extraction_id, null);
      assert.equal(row.citation_page, null);
      assert.equal(row.citation_region, null);
    }
  });

cell("990.c a malformed per-line citation (a page with no region) is refused whole-statement, never silently dropped or truncated",
  async () => {
    const sub = world.users.dave; const client = world.clients.B1; // firm B's own owner
    const firm = await firmOf(client);
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 4);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
    const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    // Line 1 states a page with NO region — the both-or-neither shape the migration's guard
    // enforces on the RAW payload, before clara._stmt_lines_norm (untouched by this ticket) is
    // ever asked whether the numeric skeleton itself is sound.
    const badLines = ch.lines.map((l, i) => (i === 0 ? { ...l, page: 1 } : { ...l }));
    const payload = witnessReaders(engineId, h, badLines, h, ch.lines.map((l) => ({ ...l })));
    await assertRaisesReason(CLR10, "chain_broken", () => persistV2(taskId, payload),
      "990.c page without region");
    const left = (await rootQuery(
      "select count(*)::int as n from clara.bank_statements where document_id=$1", [doc.documentId])).rows[0].n;
    assert.equal(left, 0, "a refused persist leaves no statement row behind (the whole call is one transaction)");
  });

cell("990.d a citation supplied on a lane with no second reader (structured) is a runtime wiring error, refused before any header/account check",
  async () => {
    const sub = world.users.erin; const client = world.clients.S1; // firm S's own owner
    const firm = await firmOf(client);
    const { periodStart, periodEnd } = ymBounds(2026, 4);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000]);
    // The header is deliberately unregistered/unreadable-shaped: this cell's refusal must fire
    // BEFORE account binding or header corroboration ever run, so nothing downstream of the
    // guard needs to be well-formed for the assertion to be honest.
    const h = stmtHeader({ accountDigits: "000000000000", periodStart, periodEnd, ch });
    const doc = await filedStatementDoc(sub, client);
    const payload = {
      pages_used: 1,
      corroboration: { verdict: "chain_second_reader" },
      readers: {
        reader1: {
          engine_id: "structured-csv:v1",
          header: h,
          lines: ch.lines.map((l) => ({ ...l, page: 1, region: { polygon: [0, 0, 1, 1] } })),
        },
      },
    };
    await assertRaisesReason(CLR10, "internal",
      () => coreV2Direct({ firm, client, documentId: doc.documentId, payload, ingestMode: "structured", taskId: null, taskEngineId: null }),
      "990.d citation on the structured lane");
  });

cell("990.e clara.get_bank_line_matching_context (the Matching tab's own detail-pane door) surfaces the SAME citation_page the writer banked",
  async () => {
    const { result } = await landCitedWitnessStatement(world.clients.A2);
    const row = (await rootQuery(
      "select id, citation_page from clara.bank_statement_lines where statement_id=$1 order by line_no limit 1",
      [result.statement_id])).rows[0];
    assert.ok(row.citation_page > 0, "the fixture landed a real citation for this line");
    const ctx = (await humanQuery(world.users.alice,
      "select clara.get_bank_line_matching_context(p_line => $1::uuid) as result", [row.id])).rows[0].result;
    assert.equal(ctx.line.citation_page, row.citation_page,
      "the human-facing read names the same page the persist core stamped, never a re-derived or rounded one");
  });
