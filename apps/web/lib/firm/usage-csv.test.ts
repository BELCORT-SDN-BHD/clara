// #635 — the model-usage CSV's bytes, asserted where they can be READ.
//
// THE BROWSER WALK CANNOT DO THIS, and that is an orchestrator ruling rather than a gap
// (brief §4, `p635.measure.download_instrument`): Playwright's `download` event does not fire
// under this harness (`e2e/documents-viewer-walk.spec.ts:498-501`), so the walk asserts the
// object-URL RECORDER — a URL was created, an anchor carried the filename, the URL was revoked —
// and the CONTENT is asserted here.

import test from "node:test";
import assert from "node:assert/strict";

import { buildUsageCsv, csvField, usageCsvFilename, USAGE_CSV_COLUMNS } from "./usage-csv";
import type { FirmUsageRow } from "./commercial-reads";

function row(over: Partial<FirmUsageRow> = {}): FirmUsageRow {
  return {
    scope: "firm",
    callKind: "chat",
    calls: 3,
    inputTokens: 1_500_000,
    outputTokens: 250_000,
    pricedCalls: 3,
    unpricedCalls: 0,
    spendCents: 175,
    priceCurrency: "USD",
    ...over,
  };
}

const CONTEXT = {
  firmName: "Tan & Partners",
  fromDate: "2026-09-01",
  toDate: "2026-09-30",
  currency: "USD",
  dropped: 0,
};

test("p635.csv.provenance_header the first two lines carry the firm, the exact UTC window and the currency", () => {
  const csv = buildUsageCsv([row()], CONTEXT);
  const lines = csv.split("\r\n");
  assert.match(lines[0]!, /Tan & Partners/, "the firm's name — a spreadsheet loses every label the page carried");
  assert.match(lines[0]!, /2026-09-01 to 2026-09-30 \(UTC\)/,
    "the EXACT window the door used, not 'September' — in Malaysia those are different days");
  assert.match(lines[1]!, /Provider price in USD, not your books/,
    "the same sentence the screen carries, so the column cannot be read as ringgit");
  assert.match(lines[1]!, /nothing here posts to a ledger/);
});

test("p635.csv.columns_and_order the header row is the door's own column list and the rows are not reordered or summed", () => {
  const rows = [
    row({ scope: "firm", callKind: "chat" }),
    row({ scope: "platform", callKind: "reporting", calls: 9, spendCents: 400 }),
    row({ scope: "firm", callKind: "document_extraction", calls: 1, spendCents: 12 }),
  ];
  const csv = buildUsageCsv(rows, CONTEXT);
  const lines = csv.split("\r\n");
  assert.equal(lines[2], USAGE_CSV_COLUMNS.join(","), "the column header is the door's own list, in its own order");
  assert.equal(lines[3]!.startsWith("firm,chat,"), true, "row 1 is the first row given");
  assert.equal(lines[4]!.startsWith("platform,reporting,"), true, "row 2 is the second — the buckets are NOT regrouped");
  assert.equal(lines[5]!.startsWith("firm,document_extraction,"), true);
  // NO TOTAL ROW. 0110:718-727 refuses to fold the two buckets into one figure; a total here
  // would be this module making an addition the door deliberately declined to make.
  assert.equal(lines.filter((l) => l.length > 0).length, 6, "two header lines, one column row, three data rows — and no total");
  assert.equal(csv.endsWith("\r\n"), true, "RFC 4180 line endings, which is also what Excel expects");
});

test("p635.csv.quoting a field with a comma, a quote or a newline is quoted and its quotes doubled", () => {
  assert.equal(csvField("chat"), "chat", "a plain field is not quoted");
  assert.equal(csvField("read, then write"), '"read, then write"');
  assert.equal(csvField('say "hello"'), '"say ""hello"""');
  assert.equal(csvField("line\nbreak"), '"line\nbreak"');
  assert.equal(csvField(1234), "1234", "a number is a number");

  // AND IT REALLY BITES ON A DATABASE VALUE: `call_kind` is whatever 0110 recorded, and a future
  // one carrying a comma must not shift every column to its right.
  const csv = buildUsageCsv([row({ callKind: "chat, clarify" })], CONTEXT);
  assert.match(csv, /firm,"chat, clarify",3,/);
});

test("p635.csv.unpriced_travels a period with unpriced calls says so IN THE FILE, not only on the screen", () => {
  const priced = buildUsageCsv([row()], CONTEXT);
  assert.match(priced, /Every call in this period has a price on record\./);
  assert.doesNotMatch(priced, /no price on record and are counted/);

  const partial = buildUsageCsv(
    [row({ pricedCalls: 2, unpricedCalls: 1 }), row({ scope: "platform", pricedCalls: 0, unpricedCalls: 4, spendCents: 0 })],
    CONTEXT,
  );
  assert.match(partial, /5 calls in this period have no price on record and are counted but not priced\./,
    "the count is summed across every row — a file that said 'complete' when the screen said otherwise would be the worse lie");
});

test("p635.csv.empty_period an empty period still states its window and its currency", () => {
  const csv = buildUsageCsv([], CONTEXT);
  const lines = csv.split("\r\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 3, "two provenance lines and the column header — and no fabricated zero row");
  assert.match(lines[1]!, /Provider price in USD/,
    "the currency is passed in, not read off a first row that does not exist");
});

test("p635.csv.filename names the month in the door's own frame", () => {
  assert.equal(usageCsvFilename("2026-09"), "clara-model-usage-2026-09-utc.csv");
});

test("p635.csv.dropped_rows the provenance header carries what the file is MISSING, not only what it holds", () => {
  // FIX ROUND 1 (adversarial A4). A row the build could not decode leaves the table; a file that
  // says nothing about it reads as a complete period, which is the same defect as a silently
  // zeroed row one step further along.
  const complete = buildUsageCsv([row()], CONTEXT);
  assert.doesNotMatch(complete.split("\r\n")[1]!, /could not be read/,
    "nothing was dropped, so nothing is claimed");

  const partial = buildUsageCsv([row()], { ...CONTEXT, dropped: 2 });
  const lines = partial.split("\r\n");
  assert.match(lines[1]!, /2 rows returned for this period could not be read and are NOT in this file/);
  assert.equal(lines[2], USAGE_CSV_COLUMNS.join(","), "the column header is still the third line");
  assert.equal(lines[3]!.startsWith("firm,chat,"), true, "and the rows still start on the fourth");
});
