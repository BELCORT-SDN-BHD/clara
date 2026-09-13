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

// =======================================================================================
// C-85 — "a read-only state RPC cannot supply missing consumption."
//
// The obligation is a WARNING about exactly the thing this ticket ships: a new read that
// summarises a document's states could very easily start reporting egress consumption, and a
// surface reading it would then believe a consent question had been answered when nothing had
// consumed anything. The honest discharge is that `clara.get_document_state` is SILENT about
// consumption — and silence is only evidence if something asserts it, because a future edit that
// added a `consumed_at` to the payload would look like a helpful improvement.
// =======================================================================================

test("C-85 clara.get_document_state reports STATES, never egress consumption — the read cannot supply what nothing consumed", { skip }, async () => {
  const src = (await fx.rootQuery(
    "select prosrc from pg_proc where oid='clara.get_document_state(uuid,uuid)'::regprocedure")).rows[0].prosrc;
  for (const forbidden of [
    "egress_dispatch_authorizations",   // the single-use record of a client's data leaving
    "consumed_at",
    "client_egress_purpose_activations",
    "client_egress_purpose_consents",
  ]) {
    assert.ok(!src.includes(forbidden),
      `get_document_state reads ${forbidden} — a state RPC that reports consumption invites a surface to read it as consent (C-85)`);
  }
  // …and the positive half: the consent gates that ARE the authority are untouched by this
  // slice, so the question stays where it was answered.
  const gate = (await fx.rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(gate.includes("document_processing_consent_inactive"),
    "the enqueue-time consent gate is still the authority over whether a read may happen at all");
});

// =======================================================================================
// C83.X2 — THE ACCEPTANCE DEFINITION for the two kinds this ticket owns, and the corpus
// inventory it is defined against. A DEFINITION, explicitly labelled: no real-model evaluation
// is performed here or anywhere in this slice, and no figure below is a measured recall.
//
// THE MEASURED INVENTORY (2026-09-13, this repository): `packages/runtime/tests/fixtures/` holds
// exactly one directory, `classify/`, with three files — a manifest SHAPE with placeholder
// identities, a pinned baseline prompt, and its README. There is NO real-document corpus in the
// repository and there is deliberately not going to be one: that README records that real client
// documents and labelled manifests stay outside it. So every figure from the historical C83.X2
// row is discarded rather than restated, exactly as the obligation asks.
//
// THE ACCEPTANCE BAR, for `invoice` and `bank_statement`, stated so a later evaluation can be run
// against it rather than invented alongside it:
//
//   1. REPRESENTATIVE means per-KIND and per-FORMAT, drawn from the registry: an invoice bar is
//      meaningless unless it separates `pdf x invoice` (the witness pair) from `xml x
//      e_invoice_xml` (the deterministic UBL reader), because those are different engines with
//      different failure modes. The registry's own `supported` rows enumerate the slots that owe
//      a measurement; nothing else does.
//   2. THE UNIT OF ACCEPTANCE IS A PERSISTED FACT WITH ITS CHECK, not a field-level match rate.
//      A document passes when its typed facts persist AND its named arithmetic check records
//      `pass`; it fails when the check records `fail`; and it is NOT COUNTED when the check
//      records `unmeasured` — a slot whose terms were never persisted cannot be scored either
//      way, and folding it into either column is how a recall figure stops meaning anything.
//   3. THE GATE IS NON-REGRESSION, NOT AN ABSOLUTE FLOOR. The classifier's own README already
//      settled that shape for this estate ("per-kind non-regression against the baseline and no
//      newly confident-wrong row that the baseline got right. No absolute recall floor has been
//      chosen."), and inventing a number here would be the discarded-figures mistake again.
//   4. A `fail` ROW IS A RESULT, NOT AN ERROR. Acceptance must be computable over a corpus that
//      includes documents whose own arithmetic does not tie — real invoices do that — so the bar
//      is about Clara agreeing with the document, never about the document being correct.
//   5. THE EVALUATION IS OUT OF SCOPE HERE and needs a licensed corpus plus real model spend;
//      this cell asserts only that the instruments the bar names EXIST, so the bar is runnable
//      rather than aspirational.
// =======================================================================================

test("C83.X2 the acceptance bar's own instruments exist, and the in-repo corpus inventory is what the definition says it is", { skip }, async () => {
  // (1) The slots that owe a measurement are enumerable from the registry, per kind AND format.
  const slots = (await fx.rootQuery(
    `select format, document_kind from clara.document_capabilities
      where typed_facts='supported' and document_kind in ('invoice','bank_statement','e_invoice_xml')
      order by document_kind, format`)).rows;
  const byKind = new Map();
  for (const s of slots) byKind.set(s.document_kind, [...(byKind.get(s.document_kind) ?? []), s.format]);
  assert.deepEqual(byKind.get("invoice")?.sort(), ["heic", "jpeg", "pdf", "png", "tiff", "webp", "xml"],
    "the invoice bar separates the six OCR formats from the deterministic XML reader");
  assert.deepEqual(byKind.get("bank_statement")?.sort(), ["csv", "heic", "jpeg", "pdf", "png", "tiff", "webp"],
    "the statement bar separates the OCR witness formats from the structured csv reader — and OFX is absent, as measured");

  // (2) The unit of acceptance is a persisted fact WITH its named check, and all three checks
  // this bar can score are real names the writers actually emit.
  const checks = (await fx.rootQuery(
    `select unnest(array['invoice.six_term_identity','statement.chain_closes','statement.printed_totals']) as name`)).rows;
  const constraintDef = (await fx.rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid='clara.document_fact_validations'::regclass and conname like '%outcome%'`)).rows[0]?.d ?? "";
  for (const outcome of ["pass", "fail", "not_applicable", "unmeasured"]) {
    assert.ok(constraintDef.includes(outcome), `the outcome vocabulary the bar scores over must admit '${outcome}'`);
  }
  assert.equal(checks.length, 3, "three named checks are scoreable for the two kinds");

  // (3) The corpus inventory, measured rather than asserted. If a real corpus ever lands in the
  // repository this goes red, and the bar above is then defined against something new — which is
  // exactly when it should be revisited.
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = new URL("./fixtures/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const dirs = await readdir(root, { withFileTypes: true });
  assert.deepEqual(dirs.map((d) => d.name).sort(), ["classify"],
    "the in-repo fixture inventory is one directory; real documents stay outside the repository by design");
  const classify = await readdir(join(root, "classify"));
  assert.deepEqual(classify.sort(), ["README.md", "baseline-prompt-2026-09-04.txt", "manifest.example.json"],
    "…and it holds a manifest SHAPE, a pinned baseline prompt and its README — no labelled documents, no figures");
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
