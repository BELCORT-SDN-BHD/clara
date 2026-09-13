// #624 — THE REGISTRY AND THE RUNTIME MUST AGREE, and the OFX finding that the registry records.
//
// The capability registry (clara.document_capabilities, 0191) states, per (format, kind), what
// Clara can actually do. Its BYTE-EXTRACTION column is a claim about code that lives in THIS
// package — `packages/runtime/lib/intake-lanes.mjs`'s `laneSnapshot` decides which lane and which
// engine a freshly sealed document is finalized into, and the DB has no way to see it. A registry
// that drifts from `laneSnapshot` is worse than no registry: it would state a capability with the
// authority of a published table while the code did something else. So this battery reads BOTH
// sides and refuses a disagreement.
//
// THE OFX CELLS ARE THE OTHER HALF, and they are the measurement behind C-37 ("Confirm supported
// OFX/XLSX intake against actual extractors and fixtures; no support promise from a filename
// alone"). A reader DOES exist — `parseStatementOfx` — so it would be easy to write `ofx x
// bank_statement = supported` and be wrong. What the cells below prove, by running the real
// parser and the real corroboration verdict over a real OFX document, is that an OFX statement
// can be PARSED and can never be CORROBORATED, because the format carries no opening balance and
// deriving one would make the chain check tautological. The registry says `unsupported` for that
// pair, and this is the evidence.

process.env.RELAY_TEST_MODE ??= "1";

import { after, test } from "node:test";
import assert from "node:assert/strict";

import * as fx from "./relay-fixtures.mjs";
import { laneSnapshot } from "../lib/intake-lanes.mjs";
import { parseStatementOfx, parseStatementCsv } from "../lib/statement-parse.mjs";
import { corroborateChain, preflightRead, StatementRefusal } from "../lib/statement-corroboration.mjs";

const READY = await ready();
const skip = READY ? false : "clara.document_capabilities is absent — apply 0191_document_capability_registry.sql";

async function ready() {
  const r = await fx.rootQuery("select to_regclass('clara.document_capabilities') is not null as ok");
  return r.rows[0].ok === true;
}

after(async () => { await fx.endPool(); });

/** Every format the registry publishes, with the ONE byte-extraction verdict and engine each
 *  carries (the migration's tail asserts both are format-invariant, so `min()` is the value). */
async function registryFormats() {
  const r = await fx.rootQuery(
    `select format, min(mime_type) as mime_type, min(byte_extraction) as byte_extraction,
            min(engine_byte) as engine_byte
       from clara.document_capabilities group by format order by format`);
  return r.rows;
}

test("#624 every laneSnapshot branch matches its registry row — byte extraction and engine both", { skip }, async () => {
  const rows = await registryFormats();
  assert.ok(rows.length >= 12, "the registry must publish every admitted format");
  const mismatches = [];
  for (const row of rows) {
    const lane = laneSnapshot(row.format);
    // `lane === 'none'` IS the store-only lane: the bytes are sealed and NO intake-time reader
    // runs. Every other lane reads the bytes. That is the whole mapping, and it is the only
    // place this test is allowed to have an opinion.
    const expected = lane.lane === "none" ? "stored_only" : "supported";
    if (row.byte_extraction !== expected) {
      mismatches.push(`${row.format}: laneSnapshot lane=${lane.lane} implies ${expected}, registry says ${row.byte_extraction}`);
    }
    if (row.engine_byte !== lane.engineId) {
      mismatches.push(`${row.format}: laneSnapshot engine ${lane.engineId}, registry says ${row.engine_byte}`);
    }
  }
  assert.deepEqual(mismatches, [],
    "the registry states a byte-extraction capability the intake lane map does not perform");
});

test("#624 the registry's canonical mimes are exactly the ones the runtime detector emits", { skip }, async () => {
  // Transcribed from packages/runtime/lib/scan.mjs's detector return values — the ONE place a
  // format token and a mime are bound together at intake.
  const DETECTOR = {
    pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", webp: "image/webp",
    tiff: "image/tiff", heic: "image/heic", xml: "application/xml", csv: "text/csv",
    tsv: "text/tab-separated-values", ofx: "application/x-ofx",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const rows = await registryFormats();
  assert.deepEqual(
    Object.fromEntries(rows.map((r) => [r.format, r.mime_type])),
    DETECTOR,
    "a format the detector emits that the registry does not name (or vice versa) is a capability nobody can state",
  );
});

// =======================================================================================
// THE OFX MEASUREMENT (C-37). A reader exists; corroboration is impossible. Both are proven.
// =======================================================================================

/** A minimal but REAL OFX 1.x SGML statement: an institution, an account, a period, two
 *  transactions and a LEDGERBAL. Everything the format can carry — which is the point. */
const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Maybank<FID>MBB</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>MYR
<BANKACCTFROM><BANKID>MBBEMYKL<ACCTID>514012345678<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260401<DTEND>20260430
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260403<TRNAMT>-1234.56<NAME>RIG STATIONERY SDN BHD</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260410<TRNAMT>500.00<NAME>CLIENT PAYMENT</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>9265.44<DTASOF>20260430</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("C-37 the OFX reader genuinely READS the file — the lines, the account, the period and the closing balance", () => {
  const read = parseStatementOfx(OFX);
  assert.equal(read.lines.length, 2, "both transactions parsed");
  assert.equal(read.lines[0].amount_cents, -123456);
  assert.equal(read.lines[1].amount_cents, 50000);
  assert.equal(read.header.account_number_normalized, "514012345678");
  assert.equal(read.header.currency, "MYR");
  assert.equal(read.header.period_start, "2026-04-01");
  assert.equal(read.header.period_end, "2026-04-30");
  assert.equal(read.header.closing_cents, 926544);
  assert.ok(read.receipt.notes.includes("ofx_carries_no_opening_or_printed_totals"),
    "the reader itself declares the limitation rather than leaving it to be discovered");
});

test("C-37 …and OFX can never CORROBORATE: opening_cents is null BY CONSTRUCTION, so the chain has no endpoint", () => {
  const read = parseStatementOfx(OFX);
  assert.equal(read.header.opening_cents, null,
    "the format has no opening-balance field; deriving one from closing - sum(amounts) would make the chain check tautological");

  // The structured lane's own preflight, with the SAME `requireTotals: false` the statement
  // workflow passes it — so this is the verdict production reaches, not a stricter one.
  const pre = preflightRead(read, { requireTotals: false });
  assert.ok(pre, "the preflight refuses");
  assert.equal(pre.code, "header_unreadable");
  assert.ok(pre.detail.missing_fields.includes("opening_cents"));

  assert.throws(
    () => corroborateChain(read),
    (err) => err instanceof StatementRefusal && err.code === "header_unreadable",
    "corroborateChain — the exact verdict statementFacts.v1's structured lane takes — refuses every OFX statement",
  );
});

test("C-37 DIFFERENTIAL: the SAME lane corroborates a CSV that states its own opening balance", () => {
  // The negative twin. Without it, the OFX refusal above could be a broken lane rather than a
  // format limitation — and the registry's `csv x bank_statement = supported` row would be
  // unproven in the same breath.
  //
  // SEPARATE DEBIT/CREDIT COLUMNS, deliberately — the shape a Malaysian banking portal actually
  // exports, and the one this reader can read without guessing. A single `Amount` column
  // carrying a BARE positive number is refused BY DESIGN: `applySign` returns null for an
  // unmarked money value, so a credit must state its direction (a `CR` marker, or its own
  // column). Measured while writing this cell — the first cut used a bare `500.00` and the
  // reader correctly SKIPPED that row rather than inventing a sign for it, which is the
  // refusal-biased posture statement-parse.mjs's own header promises.
  const csv = [
    "Bank,Maybank",
    "Account Number,514012345678",
    "Statement Date,30/04/2026",
    "Period,01/04/2026 to 30/04/2026",
    "Beginning Balance,10000.00",
    "Ending Balance,9265.44",
    "Total Debit,1234.56",
    "Total Credit,500.00",
    "Date,Description,Debit,Credit,Balance",
    "03/04/2026,RIG STATIONERY SDN BHD,1234.56,,8765.44",
    "10/04/2026,CLIENT PAYMENT,,500.00,9265.44",
  ].join("\n");
  const read = parseStatementCsv(csv);
  assert.equal(read.header.opening_cents, 1000000, "the CSV states its own opening balance");
  assert.equal(read.lines.length, 2, "both movements parsed — the vacuity control on the chain check below");
  const agreed = corroborateChain(read);
  assert.equal(agreed.corroboration.corroborated, true);
  assert.equal(agreed.corroboration.method, "chain_second_reader");
  assert.equal(agreed.corroboration.chain.closes, true,
    "10000.00 - 1234.56 + 500.00 = 9265.44 — the statement's own identity closes");
  assert.equal(agreed.corroboration.chain.totals_ok, true,
    "…and the PRINTED totals cross-check holds, which OFX has no field even to attempt");
});

test("#624 the registry's OFX and CSV rows are the two verdicts above, written down", { skip }, async () => {
  const ofx = (await fx.rootQuery(
    "select clara._document_capability('ofx','bank_statement') as c")).rows[0].c;
  const csv = (await fx.rootQuery(
    "select clara._document_capability('csv','bank_statement') as c")).rows[0].c;
  assert.equal(ofx.custody, "supported", "the bytes ARE kept — custody is real for OFX");
  assert.equal(ofx.byte_extraction, "stored_only");
  assert.equal(ofx.typed_facts, "unsupported",
    "the measured verdict: parse succeeds, corroboration cannot");
  assert.equal(ofx.limits.opening_balance, "absent_in_format");
  assert.equal(csv.typed_facts, "supported");
  assert.equal(csv.engine_id, "clara-statement-parse:v1");
});

test("#624 C-37's OTHER half: XLSX intake is byte-extraction only — no facts lane routes it, for any kind", { skip }, async () => {
  const rows = (await fx.rootQuery(
    `select document_kind, byte_extraction, typed_facts
       from clara.document_capabilities where format='xlsx' order by document_kind`)).rows;
  assert.ok(rows.length >= 20, "every kind is covered");
  for (const r of rows) {
    assert.equal(r.byte_extraction, "supported", `${r.document_kind}: the structured parser DOES read xlsx cells`);
    assert.notEqual(r.typed_facts, "supported",
      `${r.document_kind}: clara._enqueue_invoice_facts_core has no xlsx arm — no typed facts exist for any xlsx pair`);
  }
  // …and that is exactly what laneSnapshot says about the bytes, so the two halves agree.
  assert.equal(laneSnapshot("xlsx").lane, "structured_parse");
  assert.equal(laneSnapshot("xlsx").engineId, "clara-structured:v1");
});
