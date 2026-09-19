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

import {
  produceOpeningTbRegions, OPENING_TB_FIELD_PATH, OPENING_TB_REFUSAL_ENVELOPE_KEY,
  disagreeingOpeningRegion,
} from "../lib/opening-tb-produce.mjs";
import { cellsToOpeningTb as realRead } from "../lib/opening-tb-cells.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { parseOpeningTbLine, OPENING_TB_REFUSAL_ENVELOPE_KEY as PARSE_SIDE_REFUSAL_KEY } from "../lib/opening-parse.mjs";
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

// ---------------------------------------------------------------------------
// 6 — THE REFUSAL MUST SURVIVE THE PASS (#656 fix-round, adversarial A1).
//
// The wiring used to read ONLY `.regions` off the producer's envelope, so a trial balance the
// reader REFUSED (it does not balance; one row is OCR-mangled) came out of `normalizeAzureLayout`
// byte-indistinguishable from a document that is not a trial balance at all: zero regions, no
// reason, nothing downstream could tell the two apart. The consumer then answered its
// keyed-fallback signal (`no_opening_tb_lines`) and the face offered an INFORMATION banner —
// "key the balances instead" — over a document whose printed figures the machine had just found
// internally inconsistent. That is the one failure mode D13.2 exists to prevent.
//
// The reason now travels on the EXTRACTION ENVELOPE, the free jsonb `persist_document_extraction`
// already stores verbatim (`0009:148` reads `envelope->>'corroboration_ineligible'` the same way —
// the house idiom for a producer marker, and the reason this needs no new field_path, no CHECK
// widening and no migration).
// ---------------------------------------------------------------------------

test("a REFUSED trial balance leaves its reason on the ENVELOPE — a refusal is never byte-identical to 'not a trial balance'", () => {
  const unbalanced = [
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
  ];
  const out = normalizeAzureLayout(azurePayload(unbalanced), TASK);
  assert.equal(out.regions.filter((r) => r.field_path === OPENING_TB_FIELD_PATH).length, 0,
    "all-or-nothing: a refused read emits no line");
  const refusal = out.envelope[OPENING_TB_REFUSAL_ENVELOPE_KEY];
  assert.ok(refusal, "the refusal must be carried, not discarded — nothing else downstream can state it");
  assert.equal(refusal.status, "refused");
  assert.match(refusal.reason, /does not balance/, "the reason is the producer's own, verbatim");
  assert.ok(Array.isArray(refusal.refusals), "every failing row travels with it");
});

test("a REFUSED row-level read carries the failing ROW KEYS, so the reason can send a person to the line", () => {
  const withBadRow = [...BALANCED(), ...tbRow(2.83, { code: "920-000", label: "RESERVES", dr: "9OO.00" })];
  const out = normalizeAzureLayout(azurePayload(withBadRow), TASK);
  const refusal = out.envelope[OPENING_TB_REFUSAL_ENVELOPE_KEY];
  assert.equal(refusal.status, "refused");
  assert.match(refusal.reason, /unparseable_amount/);
  assert.ok(refusal.refusals.length >= 1);
  assert.ok(refusal.refusals.every((r) => typeof r.row_key === "string" && r.row_key.length > 0));
});

test("a document that is NOT a trial balance carries NO refusal marker — the keyed fallback stays the keyed fallback", () => {
  const ledger = [
    cell(0.45, 1.15, "Date"), cell(2.04, 1.15, "Description 1"),
    cell(5.85, 1.15, "Debit (MYR)"), cell(6.64, 1.15, "Credit (MYR)"),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
  ];
  const out = normalizeAzureLayout(azurePayload(ledger), TASK);
  assert.equal(OPENING_TB_REFUSAL_ENVELOPE_KEY in out.envelope, false,
    "a document nobody claims is a trial balance must not be reported as a refused one");
  // …and neither does a clean read, or every good extraction would carry a refusal key.
  const ok = normalizeAzureLayout(azurePayload(BALANCED()), TASK);
  assert.equal(OPENING_TB_REFUSAL_ENVELOPE_KEY in ok.envelope, false);
  assert.equal(ok.regions.filter((r) => r.field_path === OPENING_TB_FIELD_PATH).length, 5);
});

test("the envelope key the PRODUCER writes is the one the CONSUMER reads — pinned in both directions", () => {
  assert.equal(OPENING_TB_REFUSAL_ENVELOPE_KEY, "opening_tb_refusal");
  assert.equal(OPENING_TB_REFUSAL_ENVELOPE_KEY, PARSE_SIDE_REFUSAL_KEY,
    "opening-parse.mjs reads this key back out of the stored envelope; a drift here is a silent "
    + "return to the defect A1 named");
});

// ---------------------------------------------------------------------------
// 7 — A BAD REGION COSTS THE DOCUMENT ITS WHOLE EXTRACTION (#656 fix-round, adversarial A6).
//
// The wiring is KIND-BLIND by ruling (D13.1), and the module header used to price the worst case
// of a false positive at "a few extra evidence rows on a document nobody ever ties". That was one
// step short. `clara._derive_opening_region_fact` does not ignore a malformed `opening_tb.line`
// region: it RAISES CLR31 (`opening_extraction_monetary_mismatch` when `monetary_cents` disagrees
// with the text it re-derives), from inside `clara.persist_document_extraction`'s region loop
// (0017:1587) — which aborts the WHOLE persist and costs the document the extraction it earned,
// payslip regions and all. Before this branch no production caller emitted such a region, so the
// abort was structurally unreachable; it is reachable now, on every azure-di layout pass.
//
// So the adapter re-checks the DB's own invariant one layer earlier and drops the WHOLE set when
// it fails — the all-or-nothing law applied to the emission itself.
// ---------------------------------------------------------------------------

test("the emission guard catches a region whose monetary_cents disagrees with its own text", () => {
  const good = produceOpeningTbRegions(tableRegions(BALANCED())).regions;
  assert.equal(disagreeingOpeningRegion(good), null, "the real producer's own regions agree, every one");

  const drifted = good.map((r, i) => (i === 2 ? { ...r, monetary_cents: "999" } : r));
  const hit = disagreeingOpeningRegion(drifted);
  assert.ok(hit, "a region the DB would raise CLR31 over must never leave this module");
  assert.equal(hit.monetary_cents, "999");

  // The text is the other half of the same triple: a region whose text was rewritten after its
  // cents were computed is caught from the other side.
  assert.ok(disagreeingOpeningRegion(good.map((r, i) => (i === 0 ? { ...r, text_content: "310-000 CASH AT BANK RM 1.00 DR" } : r))));
});

test("a reader whose regions do not agree with their own text forfeits the WHOLE document, not the row", () => {
  // The injected reader is the seam: it returns a well-formed `ok` reading whose regions carry a
  // drifted `monetary_cents`, which is exactly what a future `toRegion` bug would produce.
  const out = produceOpeningTbRegions(tableRegions(BALANCED()), {
    readCells: (cells) => {
      const read = realRead(cells);
      return { ...read, regions: read.regions.map((r, i) => (i === 1 ? { ...r, monetary_cents: "1" } : r)) };
    },
  });
  assert.deepEqual(out.regions, [], "one contradicting region drops the set — never a partial basis");
  assert.equal(out.status, "refused");
  assert.match(out.reason, /does not agree with its own text|monetary/i);
  assert.ok(out.refusals.length >= 1, "the failing region is named");
});

// ---------------------------------------------------------------------------
// 8 — THE ELEMENT SHAPE, PINNED FOR THE MIRROR NEXT DOOR (#656 fix-round, adversarial A8).
//
// `packages/db/tests/opening-ledger-source.test.mjs`'s `produceTbRegions` helper drives the REAL
// `clara.persist_document_extraction`, but it hand-builds the region payload rather than calling
// this producer (packages/db has no dependency on packages/runtime, and adding a cross-package
// relative import to get one would be a new precedent for a test helper). So the twelve
// `p656.tie.*` cells prove the DATABASE's behaviour over a MIRROR of what this module emits — and
// if `toRegion` drifts, that whole family stays green while production breaks. The one place the
// real producer's bytes meet the real writer is the World leg
// (`tests/opening-ledger-source-e2e.mjs`).
//
// This cell is the pin that makes the drift loud HERE instead: it states the element shape in
// full. If it reds, the mirror at `opening-ledger-source.test.mjs:141-151` is stale and must move
// with it.
// ---------------------------------------------------------------------------

test("the emitted element shape is EXACTLY what the db battery's mirror writes — a drift reds here, loudly", () => {
  const [region] = produceOpeningTbRegions(tableRegions(BALANCED())).regions;
  assert.deepEqual(Object.keys(region).sort(),
    ["engine_confidence", "field_path", "locator", "locator_kind", "monetary_cents", "monetary_raw", "text_content"],
    "the key set the mirror in packages/db/tests/opening-ledger-source.test.mjs writes by hand");
  assert.equal(region.locator_kind, "page_polygon");
  assert.deepEqual(Object.keys(region.locator).sort(), ["page_number", "polygon"],
    "`persist_document_extraction` stores the locator verbatim; the mirror writes these two keys");
  assert.equal(region.field_path, "opening_tb.line");
  assert.equal(region.engine_confidence, null);
  assert.match(region.monetary_raw, /^[0-9,]+\.[0-9]{2}$/, "the printed figure, as the document set it");
  assert.match(region.monetary_cents, /^[0-9]+$/, "cents as a DECIMAL STRING — the DB casts (elem->>'monetary_cents')::bigint");
  assert.match(region.text_content, /^[0-9A-Z-]+ .+ RM [0-9,]+\.[0-9]{2} (DR|CR)$/,
    "the canonical text 0017's own regexp re-derives the triple from");
});
