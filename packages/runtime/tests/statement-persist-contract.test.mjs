// The runtime->DB persist SEAM for the statement lanes (as-built ladder BLOCKER, 2026-07-31,
// found independently by BOTH review lanes): the runtime's payload builder and
// `_persist_statement_core`'s parser are two halves of one wire contract that no battery
// crossed — the x38 cells synthesize the envelope themselves, and no runtime test imported
// the statement modules at all. These cells feed REAL fixture reads through the REAL
// builder (`corroborateChain` / `corroborateTwoReaders` -> `buildStatementPersistPayload`)
// and validate the result against the REAL DB normalizers on the rig — the exact functions
// `_persist_statement_core` parses the payload with. A key rename on either side of the
// seam fails HERE, not in production after a paid vendor read.

import { after, test } from "node:test";
import assert from "node:assert/strict";

import * as rig from "./rig.mjs";
import {
  corroborateChain,
  corroborateTwoReaders,
  buildStatementPersistPayload,
} from "../lib/statement-corroboration.mjs";

const READY = await rig.documentPipelineReady();
let HAS38 = false;
if (READY) {
  const r = await rig.asRoot((c) =>
    c.query("select 1 from clara.schema_migrations where version ~ '^0038_'"));
  HAS38 = r.rowCount > 0;
}
const skip = READY && HAS38 ? false : "0038 statement surface absent on this rig";

after(async () => { await rig.endPool(); });

/** A minimal, chain-true Maybank-shaped read (the corpus's own skeleton). */
function fixtureRead() {
  return {
    header: {
      institution_code: "MBB",
      account_number: "114-5-12345-67",
      account_number_normalized: "11451234567",
      currency: "MYR",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      statement_date: "2026-04-30",
      opening_cents: 100000,
      closing_cents: 130000,
      total_debit_cents: 20000,
      total_credit_cents: 50000,
    },
    lines: [
      { line_no: 1, entry_date: "2026-04-11", amount_cents: 50000, running_balance_cents: 150000, description: "deposit" },
      { line_no: 2, entry_date: "2026-04-12", amount_cents: -20000, running_balance_cents: 130000, description: "payment" },
    ],
  };
}

/** Run the DB's own normalizers over the payload's reader — the exact parse the core does. */
async function dbNormalizes(payload, readerKey) {
  const reader = payload?.readers?.[readerKey];
  assert.ok(reader, `the payload carries readers.${readerKey} (the DB's envelope, not a flat object)`);
  assert.ok(reader.engine_id, `readers.${readerKey}.engine_id is non-null (the core refuses 'internal' otherwise)`);
  const run = (sql, params) => rig.asRoot(async (c) => {
    await c.query("set role clara_fn_owner");
    try { return await c.query(sql, params); } finally { await c.query("reset role"); }
  });
  const hdr = await run("select clara._stmt_header_norm($1::jsonb) as h", [JSON.stringify(reader.header)]);
  const lines = await run("select clara._stmt_lines_norm($1::jsonb) as l", [JSON.stringify(reader.lines)]);
  return { header: hdr.rows[0].h, lines: lines.rows[0].l };
}

test("structured lane: the REAL builder's payload parses through the REAL DB normalizers", { skip }, async () => {
  const read = fixtureRead();
  const agreed = corroborateChain(read);
  const payload = buildStatementPersistPayload({
    ingestMode: "structured",
    agreed,
    reader1: { meta: { extraction_id: null, source: "structured", engine_id: "clara-statement-parse:v1" }, read },
    reader2: null,
    pagesUsed: 0,
  });
  assert.equal(typeof payload.pages_used, "number", "pages_used rides top-level (the budget settle reads it)");
  assert.ok(!payload.readers.reader2, "the structured lane ships NO reader2 — absence IS the lane signal");
  const n = await dbNormalizes(payload, "reader1");
  assert.equal(n.header.institution_code, "MBB");
  assert.equal(Number(n.header.opening_cents), 100000, "printed endpoints survive the normalizer");
  assert.equal(Number(n.header.closing_cents), 130000);
  assert.equal(JSON.parse(JSON.stringify(n.lines)).length, 2, "both lines normalize");
});

test("OCR lane: two agreeing readers build a payload whose BOTH readers parse; pages_used carried", { skip }, async () => {
  const r1 = fixtureRead();
  const r2 = fixtureRead();
  const agreed = corroborateTwoReaders(r1, r2);
  const payload = buildStatementPersistPayload({
    ingestMode: "ocr",
    agreed,
    reader1: { meta: { extraction_id: null, source: "layout_geometry", engine_id: "clara-statement-layout:v1" }, read: r1 },
    reader2: { meta: { extraction_id: null, source: "azure_bank_statement", engine_id: "azure-di:prebuilt-bankStatement.us:2024-11-30" }, read: r2 },
    pagesUsed: 4,
  });
  assert.equal(payload.pages_used, 4, "the vendor's real page count reaches the wrapper (the zero-settle budget hole)");
  await dbNormalizes(payload, "reader1");
  await dbNormalizes(payload, "reader2");
});
