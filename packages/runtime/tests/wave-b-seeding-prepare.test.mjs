// Wave B — R2 prior-GL seeding-prepare lane, AFTER #1012 RETIRED IT
// (0288_seeding_lane_retired.sql; owner ruling 2026-09-20 on #983). PURE unit tests for the
// grammar, the self-contained XLSX reader (a hand-built ZIP+XML fixture — no external lib), the
// header-convention column map and the entries→proposals builder — all unchanged, because the
// deterministic READ half of this lane is what the Client KB inherits. The DB-backed half now
// proves the other side of the retirement: the parse still runs exactly as it did, and the
// audited writer answers its typed refusal, so `prepareSeeding` relays 410
// {status:"retired", reason:"seeding_lane_retired"} and NO batch is created on any input.
// The route that fronted it (src/seedingRoutes.ts) is deleted, so nothing calls this path in
// the running process at all.
//
// The 409 {existing:true, batchId} cell is GONE rather than silently dropped: its whole subject
// was the (client, sha) open-batch unique tripping on a SECOND create, and no first create can
// happen again. DB tests skip cleanly when the 0017 surface is absent. Serial, RELAY_TEST_MODE.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import {
  parsePriorGlLine,
  normalizeName,
  colIndex,
  mapHeaderColumns,
  readXlsxSheet,
  looksLikeXlsx,
  rowsToEntries,
  regionsToEntries,
  entriesToProposals,
  seedingOpKey,
  mapSeedingDbError,
  UnparseableError,
  prepareSeeding,
} from "../lib/seeding-parse.mjs";
import { runWikiProjectionCycle, WIKI_PROJECTION_CONSUMER } from "../lib/wiki-projection.mjs";
import { AuthError } from "../lib/authz.mjs";
import * as rig from "./rig.mjs";

// ---------------------------------------------------------------------------
// A minimal STORED/DEFLATE zip writer so the XLSX reader gets a real fixture.
// ---------------------------------------------------------------------------

function makeZip(entries, { compress = true } = {}) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const raw = Buffer.from(e.content, "utf8");
    const method = compress ? 8 : 0;
    const data = compress ? deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, data);
    central.push({ name: nameBuf, method, comp: data.length, uncomp: raw.length, localOffset: offset });
    offset += lh.length + nameBuf.length + data.length;
  }
  const cd = [];
  let cdSize = 0;
  for (const c of central) {
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(c.method, 10);
    ch.writeUInt32LE(c.comp, 20);
    ch.writeUInt32LE(c.uncomp, 24);
    ch.writeUInt16LE(c.name.length, 28);
    ch.writeUInt32LE(c.localOffset, 42);
    cd.push(ch, c.name);
    cdSize += ch.length + c.name.length;
  }
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...local, ...cd, eocd]);
}

// A real xlsx package carries `[Content_Types].xml`; the byte-sniff (F-M13) requires it.
const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `</Types>`;
const SS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">` +
  `<si><t>Date</t></si><si><t>Vendor</t></si><si><t>Account</t></si><si><t>Acme Supplies</t></si></sst>`;
const SHEET_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
  `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
  `<row r="2"><c r="A2" t="str"><v>2025-03-14</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>5000</v></c></row>` +
  `</sheetData></worksheet>`;
// Sparse worksheet: the header is physical row 1, the data is physical row 7 (rows 2-6 omitted).
const SPARSE_SHEET_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
  `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
  `<row r="7"><c r="A7" t="str"><v>2025-03-14</v></c><c r="B7" t="s"><v>3</v></c><c r="C7"><v>5000</v></c></row>` +
  `</sheetData></worksheet>`;
const xlsxFixture = (opts) => makeZip([
  { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
  { name: "xl/sharedStrings.xml", content: SS_XML },
  { name: "xl/worksheets/sheet1.xml", content: SHEET_XML },
], opts);
const sparseXlsxFixture = (opts) => makeZip([
  { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
  { name: "xl/sharedStrings.xml", content: SS_XML },
  { name: "xl/worksheets/sheet1.xml", content: SPARSE_SHEET_XML },
], opts);

// ---------------------------------------------------------------------------
// PURE unit tests.
// ---------------------------------------------------------------------------

test("parsePriorGlLine derives a normalized GL entry from anchored evidence", () => {
  assert.deepEqual(parsePriorGlLine("2025-03-14 Acme Supplies Sdn Bhd 5000 RM 1,200.00 DR"),
    { date: "2025-03-14", counterparty: "Acme Supplies Sdn Bhd", accountCode: "5000", amountCents: 120_000, side: "debit" });
  assert.deepEqual(parsePriorGlLine("2025-09-01 Beta Trading 300-A00 RM 5,000.00 DR"),
    { date: "2025-09-01", counterparty: "Beta Trading", accountCode: "300-A00", amountCents: 500_000, side: "debit" });
  assert.equal(parsePriorGlLine("not a gl line"), null);
  assert.equal(parsePriorGlLine("2025-03-14 Acme 5000 USD 1.00 DR"), null);
});

test("normalizeName matches the DB's counterparty normalization", () => {
  assert.equal(normalizeName("Acme Supplies Sdn. Bhd."), "acmesuppliessdnbhd");
  assert.equal(normalizeName("  Beta-Trading #1 "), "betatrading1");
});

test("colIndex maps A1-style refs to 0-based columns", () => {
  assert.equal(colIndex("A1"), 0);
  assert.equal(colIndex("C7"), 2);
  assert.equal(colIndex("AA3"), 26);
  assert.equal(colIndex("bad"), -1);
});

test("mapHeaderColumns finds the mandatory pair or throws honestly", () => {
  const cols = mapHeaderColumns(["Date", "Vendor", "Account", "Debit"]);
  assert.equal(cols.counterparty, 1);
  assert.equal(cols.accountCode, 2);
  assert.equal(cols.date, 0);
  assert.throws(() => mapHeaderColumns(["foo", "bar"]), (e) => e instanceof UnparseableError && e.reason === "unrecognized_columns");
});

test("readXlsxSheet reads shared strings + inline + numeric cells (DEFLATE) + PHYSICAL row numbers", () => {
  const { rows, rowNums } = readXlsxSheet(xlsxFixture({ compress: true }));
  assert.deepEqual(rows[0], ["Date", "Vendor", "Account"]);
  assert.deepEqual(rows[1], ["2025-03-14", "Acme Supplies", "5000"]);
  assert.deepEqual(rowNums, [1, 2], "physical <row r> attributes, parallel to rows");
});

test("readXlsxSheet reads a STORED (uncompressed) workbook too", () => {
  const { rows } = readXlsxSheet(xlsxFixture({ compress: false }));
  assert.deepEqual(rows[1], ["2025-03-14", "Acme Supplies", "5000"]);
});

test("readXlsxSheet is SPARSE-AWARE: a data row at <row r=\"7\"> keeps its physical number (F-M14)", () => {
  const { rows, rowNums } = readXlsxSheet(sparseXlsxFixture());
  assert.deepEqual(rows[1], ["2025-03-14", "Acme Supplies", "5000"]);
  assert.deepEqual(rowNums, [1, 7], "the array index (1) is NOT the physical row (7)");
});

test("readXlsxSheet 422s honestly on a non-zip buffer", () => {
  assert.throws(() => readXlsxSheet(Buffer.from("this is not a zip file at all")),
    (e) => e instanceof UnparseableError && e.reason === "not_a_zip");
});

test("looksLikeXlsx sniffs BY BYTES (F-M13): true for a workbook, false for non-zip / a zip lacking [Content_Types].xml", () => {
  assert.equal(looksLikeXlsx(xlsxFixture()), true);
  assert.equal(looksLikeXlsx(Buffer.from("%PDF-1.4 a scanned prior GL, definitely not a zip")), false);
  // A ZIP that is NOT an OOXML package (no [Content_Types].xml) is refused honestly.
  const bareZip = makeZip([{ name: "xl/worksheets/sheet1.xml", content: SHEET_XML }]);
  assert.equal(looksLikeXlsx(bareZip), false);
});

test("xlsx rows → entries → typed proposals (vendor_account_rule + wiki_fact)", () => {
  const sheet = readXlsxSheet(xlsxFixture());
  const proposals = entriesToProposals(rowsToEntries(sheet.rows, sheet.rowNums));
  assert.equal(proposals.length, 2);
  const rule = proposals.find((p) => p.proposal_kind === "vendor_account_rule");
  assert.equal(rule.proposal_key, "rule:acmesupplies:5000");
  assert.equal(rule.payload.account_code, "5000");
  assert.equal(rule.payload.name, "Acme Supplies");
  assert.equal(rule.evidence.occurrence_count, 1);
  assert.deepEqual(rule.evidence.date_span, { first: "2025-03-14", last: "2025-03-14" });
  const fact = proposals.find((p) => p.proposal_kind === "wiki_fact");
  assert.equal(fact.proposal_key, "wiki:acmesupplies");
  assert.equal(fact.payload.wiki.slug, "prior-gl/acmesupplies");
  assert.equal(fact.payload.wiki.page_kind, "recurring_pattern");
  assert.match(fact.payload.wiki.content, /^# Prior-GL activity — Acme Supplies/);
});

test("regionsToEntries groups repeats and preserves line cites + date span", () => {
  const regions = [
    { region_id: "r1", text_content: "2025-01-02 Acme Supplies 5000 RM 1,200.00 DR" },
    { region_id: "r2", text_content: "2025-11-30 Acme Supplies 5000 RM 800.00 DR" },
    { region_id: "r3", text_content: "   " }, // a BLANK region is not a source row (skipped)
  ];
  const proposals = entriesToProposals(regionsToEntries(regions));
  const rule = proposals.find((p) => p.proposal_kind === "vendor_account_rule");
  assert.equal(rule.evidence.occurrence_count, 2);
  assert.deepEqual(rule.evidence.date_span, { first: "2025-01-02", last: "2025-11-30" });
  assert.equal(rule.evidence.line_cites.length, 2);
  assert.equal(rule.evidence.line_cites[0].region_id, "r1");
});

test("regionsToEntries (F-H5): a NONBLANK non-parsing region fails the WHOLE parse, naming it", () => {
  const regions = [
    { region_id: "r1", text_content: "2025-01-02 Acme Supplies 5000 RM 1,200.00 DR" }, // valid
    { region_id: "r2", text_content: "not a prior GL line" },                          // nonblank, unparseable
  ];
  assert.throws(() => regionsToEntries(regions),
    (e) => e instanceof UnparseableError
      && /prior_gl\.line region\(s\) did not parse/.test(e.reason) && /r2/.test(e.reason));
});

test("rowsToEntries carries the PHYSICAL worksheet row in each cite (F-M14, sparse-aware)", () => {
  const rows = [["Date", "Vendor", "Account"], ["2025-03-14", "Acme Supplies", "5000"]];
  const entries = rowsToEntries(rows, [1, 7]); // the data row is physically row 7
  assert.equal(entries.length, 1);
  assert.equal(entries[0].cite.row, 7, "the PHYSICAL row, not the array index (which is 1)");
});

test("rowsToEntries skips a fully BLANK data row but FAILS a nonblank unparseable one (F-H5, physical rows)", () => {
  // A blank trailing row is fine; a nonblank row with no account fails the whole parse.
  assert.equal(rowsToEntries(
    [["Date", "Vendor", "Account"], ["2025-03-14", "Acme Supplies", "5000"], ["", "", ""]],
    [1, 2, 3],
  ).length, 1, "the blank row is skipped, not a failure");
  assert.throws(() => rowsToEntries(
    [["Date", "Vendor", "Account"], ["2025-03-14", "Acme Supplies", "5000"], ["", "Totals (no account)", ""]],
    [1, 2, 9],
  ), (e) => e instanceof UnparseableError && /xlsx data row\(s\) did not parse/.test(e.reason) && /9/.test(e.reason));
});

test("seedingOpKey is the pinned shape; mapSeedingDbError maps refusals", () => {
  assert.equal(seedingOpKey("cli-1", "abc"), "seedprep:cli-1:abc");
  assert.deepEqual(mapSeedingDbError({ code: "CLR34", detail: '{"reason":"not_prior_gl"}' }),
    { http: 422, body: { status: "unparseable", reason: "not_prior_gl" } });
  assert.equal(mapSeedingDbError({ code: "CLR02", detail: '{"reason":"x"}' }).http, 409);
  assert.equal(mapSeedingDbError(new Error("boom")), null);
  // #1012 (0288): the retirement maps to 410 Gone — never 409/422, which a caller would read
  // as "retry" or "fix the source". The DB's own sentence travels verbatim.
  assert.deepEqual(
    mapSeedingDbError({ code: "CLR34", detail: '{"reason":"seeding_lane_retired"}', message: "the prior-GL seeding lane is retired" }),
    { http: 410, body: { status: "retired", reason: "seeding_lane_retired", message: "the prior-GL seeding lane is retired" } });
});

// ---------------------------------------------------------------------------
// DB-backed — the extraction-facts path → create_seeding_batch (+ 409, + 422).
// ---------------------------------------------------------------------------

async function seedingReady() {
  try {
    const r = await rig.rootQuery(
      `select to_regprocedure('clara.create_seeding_batch(uuid,uuid,jsonb,text)') is not null as batch,
              to_regprocedure('clara.get_document_for_human_read(uuid,uuid)') is not null as docread,
              to_regprocedure('clara.begin_client_onboarding(text,text)') is not null as onb,
              to_regprocedure('clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)') is not null as doc`,
    );
    const o = r.rows[0];
    return o.batch && o.docread && o.onb && o.doc;
  } catch {
    return false;
  }
}

const READY = await seedingReady();
const skip = READY ? false : "Wave-B (0017) seeding surface absent";

/** Build an onboarding client + CoA + a verified filed prior_gl doc, optionally with
 *  `prior_gl.line` extraction regions. */
async function buildSeedingFixture(label, { regionTexts = null, kind = "prior_gl", mime = "application/pdf" } = {}) {
  const { owner, firm } = await rig.buildFirm(label);
  const onb = await rig.asHuman(owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`${label}_onb_${randomUUID().slice(0, 6)}`, rig.opk("onb")]));
  const { client_id: client } = onb.rows[0].r;
  for (const [code, name, type, klass] of [["5000", "Office Expense", "expense", null], ["300-A00", "Trade Debtors", "asset", "receivable"]]) {
    await rig.asHuman(owner, (c) => c.query("select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r", [client, code, name, type, null, rig.opk("acct"), klass]));
  }
  const sha = rig.sha(`${label}-${randomUUID()}`);
  const path = `firms/${firm}/docs/${sha}.pdf`;
  const doc = await rig.asRoot((c) =>
    c.query("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
      [firm, client, sha, "prior_gl.pdf", mime, 4096, path, owner, 1, kind, null, null]));
  const documentId = doc.rows[0].r.document_id;
  if (regionTexts) {
    const ext = await rig.asRoot((c) =>
      c.query("insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count) values ($1,$2,'rig-ocr:1','ocr',1,'done',1) returning id",
        [firm, documentId]));
    for (const text of regionTexts) {
      await rig.asRoot((c) =>
        c.query("insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content) values ($1,$2,'page_polygon','{\"page\":1}'::jsonb,'prior_gl.line',$3)",
          [firm, ext.rows[0].id, text]));
    }
  }
  return { owner, firm, client, documentId, sha };
}

after(() => rig.endPool());

test("#1012: prior_gl.line facts still parse into typed proposals, and the audited writer answers its RETIREMENT — 410, no batch", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-ok", {
    regionTexts: [
      "2025-03-14 Acme Supplies Sdn Bhd 5000 RM 1,200.00 DR",
      "2025-06-20 Acme Supplies Sdn Bhd 5000 RM 800.00 DR",
      "2025-09-01 Beta Trading 300-A00 RM 5,000.00 DR",
    ],
  });
  const out = await rig.asRuntime((c) =>
    prepareSeeding(c, { clientId: fx.client, documentId: fx.documentId, principal: { sub: fx.owner, firmId: fx.firm } }));
  assert.equal(out.http, 410, JSON.stringify(out.body));
  assert.equal(out.body.status, "retired");
  assert.equal(out.body.reason, "seeding_lane_retired");
  assert.match(out.body.message, /retired/i, "the DB's own sentence travels verbatim");
  assert.equal(out.body.batchId, undefined, "no batch id, because no batch");

  // The refusal is the LAST step, not the first: this source parsed to completion, which is
  // what makes the answer a RETIREMENT (410) and not a parse failure (422). The empty write
  // below is the other half of that claim.
  const b = await rig.rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [fx.client]);
  assert.equal(b.rows[0].n, 0, "no seeding batch exists for this client");
  const props = await rig.rootQuery("select count(*)::int as n from clara.seeding_proposals where client_id=$1", [fx.client]);
  assert.equal(props.rows[0].n, 0, "and no proposal either");
});

test("a prior_gl with no parseable regions whose bytes are NOT an xlsx → 422 no_parse_source (byte-sniff)", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-nolines", {}); // no regions, pdf mime
  // F-M13: with no extraction regions the lane sniffs the SOURCE BYTES; a PDF is not xlsx.
  const out = await rig.asRuntime((c) =>
    prepareSeeding(c, {
      clientId: fx.client, documentId: fx.documentId, principal: { sub: fx.owner, firmId: fx.firm },
      deps: { fetchBytes: async () => Buffer.from("%PDF-1.4 a scanned prior GL, not a spreadsheet") },
    }));
  assert.equal(out.http, 422);
  assert.deepEqual(out.body, { status: "unparseable", reason: "no_parse_source" });
});

test("#1012: byte-sniff still decides xlsx-ness NOT the mime — and the writer answers its retirement", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-octet", { kind: "prior_gl", mime: "application/octet-stream" });
  const out = await rig.asRuntime((c) =>
    prepareSeeding(c, {
      clientId: fx.client, documentId: fx.documentId, principal: { sub: fx.owner, firmId: fx.firm },
      deps: { fetchBytes: async () => xlsxFixture() },
    }));
  // #1012: the byte-sniff claim is unchanged — the mime said octet-stream and the bytes still
  // decided xlsx-ness, because the parse reached the writer at all. What the writer answers now
  // is the retirement.
  assert.equal(out.http, 410, JSON.stringify(out.body));
  assert.equal(out.body.reason, "seeding_lane_retired");
  const b = await rig.rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [fx.client]);
  assert.equal(b.rows[0].n, 0, "no batch from a workbook either");
});

test("#1012: the xlsx byte path (injected fetchBytes) still parses a spreadsheet prior_gl — and creates no batch", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-xlsx", {
    kind: "prior_gl",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const out = await rig.asRuntime((c) =>
    prepareSeeding(c, {
      clientId: fx.client, documentId: fx.documentId,
      principal: { sub: fx.owner, firmId: fx.firm },
      deps: { fetchBytes: async () => xlsxFixture() },
    }));
  // #1012: Acme Supplies / 5000 still parses into one rule + one wiki_fact — the reader half is
  // untouched — and the audited writer answers the retirement instead of a receipt.
  assert.equal(out.http, 410, JSON.stringify(out.body));
  assert.equal(out.body.reason, "seeding_lane_retired");
  const b = await rig.rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [fx.client]);
  assert.equal(b.rows[0].n, 0, "the xlsx byte path creates no batch either");
});

test("STRICT (F-H5): one malformed prior_gl region fails the WHOLE prepare — 422 naming it, NO batch", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-strict", {
    regionTexts: [
      "2025-03-14 Acme Supplies 5000 RM 1,200.00 DR", // valid
      "garbage that is not a prior GL line at all",    // NONBLANK, unparseable
    ],
  });
  const out = await rig.asRuntime((c) =>
    prepareSeeding(c, { clientId: fx.client, documentId: fx.documentId, principal: { sub: fx.owner, firmId: fx.firm } }));
  assert.equal(out.http, 422, JSON.stringify(out.body));
  assert.equal(out.body.status, "unparseable");
  assert.match(out.body.reason, /prior_gl\.line region\(s\) did not parse/);
  const b = await rig.rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [fx.client]);
  assert.equal(b.rows[0].n, 0, "no partial batch from the survivor");
});

test("REVOCATION (F-H7): a reassert that lapses refuses BEFORE create_seeding_batch — no batch", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-revoke", {
    regionTexts: ["2025-03-14 Acme Supplies 5000 RM 1,200.00 DR"],
  });
  const reassert = async () => { throw new AuthError(403, "forbidden", "membership changed"); };
  await assert.rejects(
    () => rig.asRuntime((c) => prepareSeeding(c, {
      clientId: fx.client, documentId: fx.documentId, principal: { sub: fx.owner, firmId: fx.firm }, reassert,
    })),
    (e) => e instanceof AuthError && e.status === 403,
  );
  const b = await rig.rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [fx.client]);
  assert.equal(b.rows[0].n, 0, "the audited write never ran once authz lapsed");
});

test("F-M13 bound: an over-cap source is refused (422 no_parse_source) WITHOUT downloading", async () => {
  let fetched = false;
  const bigMeta = { sha256: "a".repeat(64), storage_path: `firms/${randomUUID()}/docs/${"a".repeat(64)}.xlsx`, byte_size: 9 * 1024 * 1024 };
  const stub = {
    query: async (sql) => (/get_document_for_human_read/.test(String(sql)) ? { rows: [{ d: bigMeta }] } : { rows: [] }),
  };
  const out = await prepareSeeding(stub, {
    clientId: randomUUID(), documentId: randomUUID(), principal: { sub: randomUUID(), firmId: randomUUID() },
    deps: { fetchBytes: async () => { fetched = true; return Buffer.from("x"); } },
  });
  assert.deepEqual(out, { http: 422, body: { status: "unparseable", reason: "no_parse_source" } });
  assert.equal(fetched, false, "an over-cap source never touches Storage");
});

/** Drive the wiki_projection cycle for one firm to convergence (per-firm isolated). */
async function drainWiki(firm) {
  return rig.asRuntime(async (c) => {
    for (let i = 0; i < 30; i++) {
      await runWikiProjectionCycle(c, { onlyFirm: firm, batchSize: 100 });
      if ((await rig.checkpointSeq(firm, WIKI_PROJECTION_CONSUMER)) === (await rig.headSeq(firm))) return;
    }
    throw new Error(`drainWiki: firm ${firm} did not converge`);
  });
}

test("#1012 AC6: the projection worker still REPLAYS a historical ticked wiki_fact after the retirement — a deterministic page with prior_gl_line citations", { skip }, async () => {
  const fx = await buildSeedingFixture("wb-r2-seed-e2e");

  // HISTORY, PLANTED. Before 0288 this state was produced by prepareSeeding + a human admin
  // ticking the proposal. Neither door will run again, so the pre-retirement rows a hosted firm
  // still carries are written directly — which is exactly the state AC6 asks about: "the
  // projection worker still replays a historical decided event successfully after the
  // migration".
  const slug = "prior-gl/zeta-logistics";
  const content = "# Prior-GL activity — Zeta Logistics\n\nPosts to 5000 twice in 2025.";
  // ck_seeding_batches_terminal: a 'completed' batch must carry BOTH completion columns.
  const batch = (await rig.rootQuery(
    `insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256,
         state, stats, completed_at, completed_by)
       values ($1, $2, $3::uuid, $4, 'completed', '{}'::jsonb, now(), $5)
     returning id`, [fx.firm, fx.client, fx.documentId, fx.sha, fx.owner])).rows[0].id;
  const proposalId = (await rig.rootQuery(
    `insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind, proposal_key,
         payload, evidence, state, decided_by, decided_at)
       values ($1, $2, $3, 'wiki_fact', 'wiki:zeta', $4::jsonb, $5::jsonb, 'ticked', $6, now())
     returning id`,
    [batch, fx.firm, fx.client,
      JSON.stringify({ wiki: { slug, title: "Prior-GL activity — Zeta Logistics", page_kind: "recurring_pattern", content } }),
      JSON.stringify({ occurrence_count: 2, line_cites: [{ row: 12, text: "2025-02-10 Zeta Logistics 5000 RM 900.00 DR" }] }),
      fx.owner])).rows[0].id;
  // The decided event, through the estate's own appender, in the exact shape
  // clara.tick_seeding_proposal emitted before 0288 recut it.
  await rig.rootQuery(
    `select clara._append_event($1,'seeding.proposal_decided',$2,$3,null,null,null,$4,null,$5::jsonb)`,
    [fx.firm, fx.client, fx.owner, fx.documentId, JSON.stringify({
      batch_id: batch, proposal_id: proposalId, decision: "ticked", proposal_kind: "wiki_fact",
      resulting_rule_id: null, resulting_counterparty_id: null, wiki_dispatch_required: true,
    })]);

  // The deterministic wiki_fact lane publishes the page — unchanged by the retirement.
  await drainWiki(fx.firm);

  const page = await rig.rootQuery(
    `select p.page_kind, p.counterparty_id, v.synthesis, v.engine_id, v.content
       from clara.wiki_pages p join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.client_id=$1 and p.slug=$2`, [fx.client, slug]);
  assert.equal(page.rowCount, 1, "the historical fact page was published on replay");
  assert.equal(page.rows[0].synthesis, "deterministic");
  assert.equal(page.rows[0].engine_id, null, "no model — engine_id null");
  assert.equal(page.rows[0].counterparty_id, null);
  assert.match(page.rows[0].content, /^# Prior-GL activity — Zeta Logistics/, "content is the payload body verbatim");
  const cites = await rig.rootQuery(
    `select c.source_kind, c.document_id from clara.wiki_page_citations c
       join clara.wiki_page_versions v on v.id=c.version_id
       join clara.wiki_pages p on p.current_version_id=v.id
      where p.client_id=$1 and p.slug=$2`, [fx.client, slug]);
  assert.ok(cites.rows.length >= 1 && cites.rows.every((r) => r.source_kind === "prior_gl_line"), "prior_gl_line citations");
  assert.ok(cites.rows.every((r) => r.document_id === fx.documentId), "each cites the source prior-GL document");
});
