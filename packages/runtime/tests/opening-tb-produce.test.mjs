// #656 — the IN-LINE `opening_tb.line` producer wiring (`lib/opening-tb-produce.mjs`), and the
// one statement in `normalizeAzureLayout` that calls it. PURE unit tests, no DB.
//
// WHAT THIS BATTERY IS FOR. `packages/runtime/lib/opening-tb-cells.mjs` has been written, tested
// and called by NOTHING since Wave B; the consumer half (`opening-parse.mjs` →
// `clara.record_opening_targets_parsed`) has been live and unreachable for just as long. #656
// wires the two together at the OCR pass (orchestrator ruling D13.1: in-line, one non-frozen
// module, no new processing lane). The reader's own grammar is covered next door by
// `kdoc-opening-tb-cells.test.mjs` / `kdoc-opening-tb-adversarial.test.mjs` — the cells here are
// about the WIRING's three obligations, which are the ones that can break an OCR pass that is
// otherwise perfectly good:
//
//   1. it NEVER throws (a producer fault must not fail the extraction the document already got);
//   2. it emits NOTHING but a NAMED REASON when the reader says `null` (not a trial balance) or
//      `refused` (it is one and cannot be used) — never a partial set;
//   3. the regions it does emit are byte-compatible with `clara.persist_document_extraction`'s
//      `p_regions` element shape and re-derive to the same triple through `parseOpeningTbLine`,
//      the mirror of the DB's own `_derive_opening_region_fact`.
//
// The geometry comes from `kdoc-opening-tb-testkit.mjs`, measured off a real Malaysian General
// Ledger; a synthetic layout with invented coordinates would prove nothing about a reader whose
// whole job is geometry.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { produceOpeningTbRegions, OPENING_TB_FIELD_PATH } from "../lib/opening-tb-produce.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { parseOpeningTbLine } from "../lib/opening-parse.mjs";
import { BALANCED, HEADER, cell, tbRow } from "./kdoc-opening-tb-testkit.mjs";

/** The shape `normalizeAzureLayout` builds for one `tables.N.cells.M` region (egress.mjs:154-172):
 *  BOTH page spellings in the locator, and the table field_path the producer filters on. */
const asTableRegion = (c, index) => ({
  locator_kind: "page_polygon",
  locator: { page: c.locator.page_number, page_number: c.locator.page_number, polygon: c.locator.polygon },
  field_path: `tables.0.cells.${index}`,
  text_content: c.text_content,
  engine_confidence: 0.98,
  monetary_raw: null,
  monetary_cents: null,
});

const tableRegions = (cells) => cells.map(asTableRegion);

/** An Azure `prebuilt-layout` payload whose ONE table carries `cells`. */
const azurePayload = (cells) => ({
  analyzeResult: {
    content: "synthetic",
    pages: [{ pageNumber: 1, width: 8.27, height: 11.69, unit: "inch", lines: [] }],
    tables: [{
      rowCount: cells.length,
      columnCount: 4,
      cells: cells.map((c) => ({
        content: c.text_content,
        confidence: 0.98,
        boundingRegions: [{ pageNumber: c.locator.page_number, polygon: c.locator.polygon }],
      })),
    }],
  },
});

const TASK = { engineId: "azure-di:prebuilt-layout:2024-11-30", versionN: 1 };

// ---------------------------------------------------------------------------
// 1 — the conservative default: NOTHING, with a reason.
// ---------------------------------------------------------------------------

test("a printed GENERAL LEDGER yields zero regions and a NAMED reason — never a silent empty set", () => {
  const ledger = [
    cell(0.45, 1.15, "Date"),
    cell(2.04, 1.15, "Description 1"),
    cell(5.85, 1.15, "Debit (MYR)"),
    cell(6.64, 1.15, "Credit (MYR)"),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
    cell(0.45, 1.51, "10/6/2025"),
    cell(2.04, 1.51, "D & DREAM PROPERTIES SDN BHD"),
    cell(6.64, 1.51, "207,974.15"),
  ];
  const out = produceOpeningTbRegions(tableRegions(ledger));
  assert.deepEqual(out.regions, [], "a ledger read as a trial balance would fabricate an opening basis");
  assert.equal(out.status, "not_a_trial_balance");
  assert.ok(typeof out.reason === "string" && out.reason.length > 0, "the caller must learn WHY nothing was emitted");
  assert.deepEqual(out.refusals, []);
  assert.equal(out.totals, null);
});

test("no table cells at all (a page of lines only) yields zero regions and a reason", () => {
  const out = produceOpeningTbRegions([
    { field_path: "pages.1.lines.0", text_content: "INVOICE", locator: { page_number: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] } },
  ]);
  assert.deepEqual(out.regions, []);
  assert.equal(out.status, "not_a_trial_balance");
  assert.equal(out.reason, "no table cells on this extraction");
});

// ---------------------------------------------------------------------------
// 2 — ALL-OR-NOTHING: a refusal forfeits the document and NAMES every failing row.
// ---------------------------------------------------------------------------

test("ONE unreadable row forfeits the WHOLE document: zero regions, and the reason NAMES the failing row", () => {
  const withBadRow = [
    ...BALANCED(),
    // `9OO.00` — the OCR-mangled figure the reader's own header records as the silent killer.
    ...tbRow(2.83, { code: "920-000", label: "RESERVES", dr: "9OO.00" }),
  ];
  const out = produceOpeningTbRegions(tableRegions(withBadRow));
  assert.deepEqual(out.regions, [], "the survivors must never ship as if they were the whole trial balance");
  assert.equal(out.status, "refused");
  assert.match(out.reason, /unparseable_amount/, "the reason carries the DB-facing refusal token");
  assert.ok(out.refusals.length >= 1, "every failing row is counted and named");
  assert.ok(out.refusals.every((r) => typeof r.row_key === "string" && r.row_key.length > 0),
    "a refusal without a row key cannot send a human to the right line");
});

test("a trial balance that does not BALANCE is refused whole, with the two sums in the reason", () => {
  const unbalanced = [
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
  ];
  const out = produceOpeningTbRegions(tableRegions(unbalanced));
  assert.deepEqual(out.regions, []);
  assert.equal(out.status, "refused");
  assert.match(out.reason, /does not balance/);
});

// ---------------------------------------------------------------------------
// 3 — the happy path, and the round trip the database will re-run.
// ---------------------------------------------------------------------------

test("a balanced trial balance yields one opening_tb.line region per line, each round-tripping through parseOpeningTbLine", () => {
  const out = produceOpeningTbRegions(tableRegions(BALANCED()));
  assert.equal(out.status, "ok");
  assert.equal(out.reason, null);
  assert.equal(out.regions.length, 5, "five printed lines, five regions");
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.totals, { debitCents: "13000000", creditCents: "13000000" });

  for (const region of out.regions) {
    assert.equal(region.field_path, OPENING_TB_FIELD_PATH);
    assert.equal(region.locator_kind, "page_polygon");
    assert.equal(typeof region.monetary_cents, "string",
      "cents travel as a DECIMAL STRING — JSON has no bigint and the DB casts (elem->>'monetary_cents')::bigint");
    const fact = parseOpeningTbLine(region.text_content);
    assert.ok(fact, `the DB's own grammar must re-derive ${region.text_content}`);
    assert.equal(String(fact.amountCents), region.monetary_cents,
      "the text and the independent second representation must agree — 0017 refuses the extraction otherwise");
  }
});

// ---------------------------------------------------------------------------
// 4 — it NEVER throws. A producer fault must not fail an OCR pass that is otherwise good.
// ---------------------------------------------------------------------------

test("never throws: null, a non-array, and a region whose locator is hostile all return the empty envelope", () => {
  for (const input of [null, undefined, 42, "tables", {}, [null], [{ field_path: "tables.0.cells.0" }],
    [{ field_path: "tables.0.cells.0", text_content: {}, locator: null }]]) {
    const out = produceOpeningTbRegions(input);
    assert.deepEqual(out.regions, [], `input ${JSON.stringify(input)} must emit nothing`);
    assert.ok(typeof out.reason === "string" && out.reason.length > 0);
  }
});

test("a reader that throws is contained: the envelope reports producer_error and emits nothing", () => {
  const hostile = [{
    field_path: "tables.0.cells.0",
    locator: { page_number: 1, get polygon() { throw new Error("hostile locator"); } },
    get text_content() { throw new Error("hostile text"); },
  }];
  const out = produceOpeningTbRegions(hostile);
  assert.deepEqual(out.regions, []);
  assert.equal(out.status, "producer_error");
  assert.match(out.reason, /hostile/);
});

// ---------------------------------------------------------------------------
// 5 — the IN-LINE wiring itself (`normalizeAzureLayout`).
// ---------------------------------------------------------------------------

test("normalizeAzureLayout APPENDS the opening_tb.line regions to the same regions array, and changes nothing else", () => {
  const cells = BALANCED();
  const out = normalizeAzureLayout(azurePayload(cells), TASK);

  const tableCells = out.regions.filter((r) => r.field_path.startsWith("tables."));
  assert.equal(tableCells.length, cells.length, "every table cell region is still emitted, unchanged");
  for (const r of tableCells) {
    assert.equal(r.locator.page, 1, "the `page` spelling survives — the F-A1 witness estate reads it");
    assert.equal(r.locator.page_number, 1, "…and so does `page_number`");
  }

  const opening = out.regions.filter((r) => r.field_path === OPENING_TB_FIELD_PATH);
  assert.equal(opening.length, 5, "the producer's five lines are appended in line");
  assert.ok(out.regions.indexOf(opening[0]) > out.regions.indexOf(tableCells[tableCells.length - 1]),
    "appended AFTER the cells they were read from");
});

test("normalizeAzureLayout appends NOTHING for a document that is not a trial balance, and still returns its cells", () => {
  const ledger = [
    cell(0.45, 1.15, "Date"),
    cell(2.04, 1.15, "Description 1"),
    cell(5.85, 1.15, "Debit (MYR)"),
    cell(6.64, 1.15, "Credit (MYR)"),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
  ];
  const out = normalizeAzureLayout(azurePayload(ledger), TASK);
  assert.equal(out.regions.filter((r) => r.field_path === OPENING_TB_FIELD_PATH).length, 0);
  assert.equal(out.regions.filter((r) => r.field_path.startsWith("tables.")).length, ledger.length);
});

test("normalizeAzureLayout still works on a payload with no tables at all", () => {
  const out = normalizeAzureLayout({
    analyzeResult: {
      content: "plain",
      pages: [{ pageNumber: 1, lines: [{ content: "HELLO", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }],
    },
  }, TASK);
  assert.equal(out.regions.length, 1);
  assert.equal(out.regions[0].field_path, "pages.1.lines.0");
});
