// #633 AC3(b) — THE CAPABILITY REGISTRY AS AN INTAKE-SURFACE READ.
//
// #624's own battery (`document-capability-registry.test.mjs`) proves the CATALOGUE is
// total and truthful. This one proves the thing the WEB surface's honesty depends on,
// which is a different question: that the read the browser actually issues — one
// list-form select under a plain `clara_authenticated` persona — returns a catalogue it
// can join by CANONICAL MIME, and that an unseeded pair yields NO ROW so the surface's
// unknown-pair default is the only answer available.
//
//   p633.capability.registry — the persona read returns the seeded pairs with the four
//                              level columns plus basis/limits; EVERY canonical mime the
//                              intake allowlist admits resolves to exactly ONE registry
//                              format; an unseeded pair yields no row.
//
// NON-VACUITY, both directions: at least one `stored_only` (ofx) and at least one
// `supported` pair must exist, or "the levels are published" would be a claim about an
// empty set.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, ensureReady, endPool, buildWorld } from "./rig-fixtures.mjs";

/** The TWELVE canonical mimes `packages/runtime/lib/intake.mjs` admits after its own
 *  `MIME_ALIASES` canonicalisation (:33-50, applied at :88) — the ONLY spellings that can
 *  ever reach `clara.documents.mime_type`, because `finalize_document_intake` copies
 *  `i.declared_mime` straight through (0007:2012). Written out here rather than imported:
 *  packages/db never imports from packages/runtime, and a drift on either side should red
 *  this file rather than silently mislabel a row on the surface. */
const CANONICAL_MIMES = Object.freeze([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic",
  "application/xml",
  "text/csv",
  "text/tab-separated-values",
  "application/x-ofx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** VERBATIM `apps/web/lib/documents/capability-registry.ts`'s own projection. */
const WEB_REGISTRY_COLS = [
  "format", "document_kind", "mime_type", "custody", "byte_extraction",
  "typed_facts", "business_operation", "engine_id", "engine_byte",
  "registry_version", "basis", "limits",
];

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  const r = await rootQuery("select to_regclass('clara.document_capabilities') is not null as ok");
  ready = r.rows[0].ok === true;
  if (ready) world = await buildWorld();
});
after(async () => { await endPool(); });

function unready(t) {
  if (!ready) { t.skip("the capability registry (0191) is not present on this database"); return true; }
  return false;
}

test("p633.capability.registry — a plain authenticated persona reads the whole catalogue in ONE list-form select", async (t) => {
  if (unready(t)) return;
  // carol is a VIEWER — the lowest human rank. The registry carries no tenant column and
  // sits under a `for select … using (true)` policy (0191:267-268), so the lowest rank is
  // the right persona to prove the surface can read it at all.
  const rows = await humanQuery(
    world.users.carol,
    `select ${WEB_REGISTRY_COLS.join(", ")} from clara.document_capabilities`,
  );
  assert.deepEqual(rows.fields.map((f) => f.name), WEB_REGISTRY_COLS, "the web's projection is the registry's own column set");
  assert.ok(rows.rowCount >= 240, `the catalogue is 12 formats x 20 kinds — saw ${rows.rowCount} rows`);

  // NON-VACUITY on the levels themselves.
  const levels = new Set();
  for (const r of rows.rows) {
    for (const col of ["custody", "byte_extraction", "typed_facts", "business_operation"]) {
      assert.ok(typeof r[col] === "string" && r[col].length > 0, `${col} must be a published level, never null`);
      levels.add(r[col]);
    }
    assert.ok(typeof r.basis === "string" && r.basis.length > 0, "every pair carries its own written basis");
    assert.ok(r.limits !== null && typeof r.limits === "object", "limits is a jsonb object, possibly empty");
  }
  assert.ok(levels.has("stored_only"), "at least one pair is stored-only, or the honest tier is untested");
  assert.ok(levels.has("supported"), "at least one pair is supported, or the positive tier is untested");
});

test("p633.capability.registry — EVERY canonical intake mime resolves to exactly ONE registry format", async (t) => {
  if (unready(t)) return;
  const rows = await humanQuery(
    world.users.carol,
    "select distinct mime_type, format from clara.document_capabilities order by mime_type",
  );
  const byMime = new Map();
  for (const r of rows.rows) {
    const seen = byMime.get(r.mime_type);
    assert.equal(seen, undefined, `mime ${r.mime_type} maps to two formats (${seen} and ${r.format}) — the browser join would be ambiguous`);
    byMime.set(r.mime_type, r.format);
  }
  for (const mime of CANONICAL_MIMES) {
    assert.ok(
      byMime.has(mime),
      `the intake allowlist admits ${mime} but the registry publishes nothing for it — the surface would render "not published" for a format Clara actually takes`,
    );
  }
  assert.equal(byMime.size, CANONICAL_MIMES.length, "and the registry publishes no mime the intake lane cannot produce");
});

test("p633.capability.registry — OFX's honest stored-only byte extraction is a ROW, not a rendering convention", async (t) => {
  if (unready(t)) return;
  // C-37's headline. The reason is NOT "there is no OFX reader": `statement-parse.mjs:77`
  // has `parseStatementOfx`. It is `intake-lanes.mjs:45-51` — an OFX is store-only AT
  // INTAKE because the reader belongs to the DB-routed `statement_parse` task, not to
  // this trip, so an OFX never classified as a bank statement produces no extraction.
  const rows = await humanQuery(
    world.users.carol,
    "select byte_extraction, typed_facts, limits from clara.document_capabilities where format='ofx' and document_kind='bank_statement'",
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].byte_extraction, "stored_only", "an OFX is sealed and deliberately not read at intake");
  assert.equal(rows.rows[0].typed_facts, "unsupported", "and the format carries no opening balance, so the chain can never close");

  const all = await humanQuery(world.users.carol, "select count(*)::int n from clara.document_capabilities where format='ofx' and byte_extraction <> 'stored_only'");
  assert.equal(all.rows[0].n, 0, "EVERY ofx pair is stored-only at intake, not just the statement one");
});

test("p633.capability.registry — an unseeded pair yields NO ROW, so the surface's unknown default is the only honest answer", async (t) => {
  if (unready(t)) return;
  const bogusFormat = await humanQuery(
    world.users.carol,
    "select count(*)::int n from clara.document_capabilities where format = 'zip'",
  );
  assert.equal(bogusFormat.rows[0].n, 0, "a format outside the allowlist has no published levels");

  const bogusKind = await humanQuery(
    world.users.carol,
    "select count(*)::int n from clara.document_capabilities where document_kind = 'some_future_kind'",
  );
  assert.equal(bogusKind.rows[0].n, 0, "a kind outside the CHECK has no published levels either");

  // And the join key a browser would use for an unknown mime resolves to nothing at all.
  const bogusMime = await humanQuery(
    world.users.carol,
    "select count(*)::int n from clara.document_capabilities where mime_type = 'application/zip'",
  );
  assert.equal(bogusMime.rows[0].n, 0, "an unadmitted mime resolves to no format — the surface must claim nothing");
});

test("p633.capability.registry — the catalogue has NO tenant column, which is why it is read once and never polled", async (t) => {
  if (unready(t)) return;
  const cols = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='document_capabilities'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  for (const tenant of ["firm_id", "client_id"]) {
    assert.equal(names.includes(tenant), false, `a tenant column would make this a per-caller read; found ${tenant}`);
  }
  // Two different firms' personas read the SAME catalogue — the property the web's
  // "read once per mount, never on the poll clock" rests on.
  const a = await humanQuery(world.users.carol, "select count(*)::int n from clara.document_capabilities");
  const b = await humanQuery(world.users.dave, "select count(*)::int n from clara.document_capabilities");
  assert.equal(a.rows[0].n, b.rows[0].n, "the catalogue is global vocabulary, identical for every firm");
  assert.ok(a.rows[0].n > 0, "control: it is not empty for either of them");
});
