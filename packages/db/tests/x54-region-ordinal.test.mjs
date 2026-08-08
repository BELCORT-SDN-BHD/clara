// x54 rig — migration 0054: clara.get_document_extract publishes a STABLE per-region
// ordinal (`idx`), so the drafting toolface can cite a region by INDEX instead of by a
// 36-character UUID (H1 ACCEPTANCE FINDING F9, ADR-064 §3).
//
// WHAT THIS FILE IS FOR. 0054's own tail asserts SHAPE — that the ordinal is installed,
// that it is derived from the (engine_kind, version_n, r.id) stability key, that the
// aggregate orders by it, that all twelve pre-existing region keys survived, and that the
// recut query parse-analyzes against the live catalog. None of that is BEHAVIOUR on
// fixtures it controls. Every cell below builds a document with regions it chose and reads
// what the function actually answers (the x49 division of labour, verbatim).
//
// THE FOUR PROPERTIES THE RUNTIME DEPENDS ON, each with its own cell:
//   1. PRESENT + DENSE — every region carries an integer idx, and the set is exactly 1..N.
//   2. ORDERED — regions[] arrives in idx order, so "the nth element" and "idx n" agree
//      for a reader that (wrongly) uses position; the runtime resolves by FIELD anyway,
//      and its own suite proves that, but a list that is NOT in order would be a trap for
//      every human reading a transcript.
//   3. STABLE — two independent calls answer the same idx for the same region. This is the
//      whole premise of the fix: the model reads the list through read_document and the
//      wrapper resolves the cited idx against a SECOND, separate call of the same RPC.
//   4. USABLE END TO END — the region an idx names really is citable: taking id + text at
//      an idx and drafting through the REAL evidence wall succeeds. The wall
//      (clara._write_entry_evidence) is untouched by 0054 and this cell is what proves the
//      ordinal did not quietly drift off the ids the wall reads.
//
// CONTRACT-BLIND where it can be: the cells name the OUTCOME (an ordinal is published,
// dense, ordered, stable, and citable), never the CTE that produces it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
} from "./a21-helpers.mjs";
import {
  seedCitedDocument, getDocumentExtract, mintInteractive, wakeDraftEntry, freshResolution,
  billLines, upsertPayableAccount, upsertAccountClassed, ev, entryRow, CODING_KIND,
} from "./s6-fixtures.mjs";

const AP = "400-000";
const EXP = "500-X54";
const VENDOR = { new: { name: "X54 SUPPLIES SDN BHD", registration_no: "202401000054" } };

let ready = false;
let has54 = false;
let world = null;

/** Is 0054 on this database? Read from the migration LEDGER, not from the function's
 *  source: a half-applied file is a different failure than an unapplied one. */
async function has0054() {
  try {
    const r = await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0054_%'");
    return r.rows[0].n === 1;
  } catch {
    return false;
  }
}

function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("rig not reachable / pre-Wave-A schema — x54 dormant");
    return true;
  }
  if (!has54) {
    markSkip();
    t.skip("0054 not applied (clara.schema_migrations has no '0054_%' row) — the region-ordinal battery is dormant");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  has54 = ready ? await has0054() : false;
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("x54ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Supplies", type: "expense", opKey: opk("x54exp") });
    }
  }
});

after(async () => {
  printLaneNotes("x54");
  printSkipCount("x54");
  await endPool();
});

/**
 * A filed document carrying a done OCR extraction with SEVERAL regions, plus a SECOND
 * done extraction of a different engine_kind with its own regions — so the ordinal has to
 * span more than one extraction, which is exactly the shape a real invoice-facts document
 * has (an ocr pass and an invoice_facts pass, both done).
 *
 * The extra regions are inserted RAW (the x49 idiom) because what is under test is the
 * READ, not the writer: seeding through persist_invoice_facts would drag its whole
 * corroboration contract into a test about an ordinal.
 */
async function multiRegionDoc(sub, client) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  // Two more regions on the SAME (ocr) extraction.
  const extra = [];
  for (const [path, text] of [["invoice.vendor_name", "X54 SUPPLIES SDN BHD"], ["invoice.invoice_date", "2026-03-15"]]) {
    const r = await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0) returning id`,
      [firm, cited.extractionId, path, text],
    );
    extra.push(r.rows[0].id);
  }
  // A SECOND done extraction, different engine_kind, with its own two regions.
  const ext2 = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-fixture:x54','invoice_facts',1,'done',1)`,
    [ext2, firm, cited.documentId],
  );
  for (const [path, text] of [["invoice.total", "RM 5,000.00"], ["invoice.currency", "MYR"]]) {
    const r = await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0) returning id`,
      [firm, ext2, path, text],
    );
    extra.push(r.rows[0].id);
  }
  return { ...cited, firm, extractionId2: ext2, extraRegionIds: extra };
}

const regionsOf = (extract) => {
  assert.ok(extract && Array.isArray(extract.regions), `get_document_extract must return a regions[] array (got ${JSON.stringify(extract)?.slice(0, 200)})`);
  return extract.regions;
};

// ===========================================================================
// META — a partial apply can never green this suite silently.
// ===========================================================================

test("x54 META: 0054 is applied exactly once, and clara.get_document_extract exists at exactly one signature", async (t) => {
  if (skipHere(t)) return;
  const mig = await rootQuery("select version from clara.schema_migrations where version like '0054_%'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0054_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
  const fns = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='get_document_extract'",
  );
  assert.equal(fns.rows[0].n, 1, "an overload would leave the pre-0054 shape reachable");
});

// ===========================================================================
// 1-2. PRESENT + DENSE + ORDERED.
// ===========================================================================

test("x54.a every region carries an INTEGER idx, the set is exactly 1..N (dense, no gaps, no duplicates), and regions[] arrives in idx ORDER", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const extract = await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 });
  const regions = regionsOf(extract);
  assert.ok(regions.length >= 5, `the fixture seeded 5 regions across two done extractions, got ${regions.length}`);

  for (const r of regions) {
    assert.equal(typeof r.idx, "number", `every region must carry a numeric idx (got ${JSON.stringify(r.idx)})`);
    assert.ok(Number.isInteger(r.idx), `idx must be an integer (got ${r.idx})`);
  }
  const idxs = regions.map((r) => r.idx);
  assert.deepEqual(
    [...idxs].sort((a, b) => a - b),
    Array.from({ length: regions.length }, (_, i) => i + 1),
    `the ordinal must be DENSE 1..N — a sparse or duplicated idx makes "cite region 3" ambiguous, which is the whole defect this fix removes (got ${JSON.stringify(idxs)})`,
  );
  assert.deepEqual(idxs, [...idxs].sort((a, b) => a - b), `regions[] must arrive in idx order (got ${JSON.stringify(idxs)})`);
});

test("x54.b the ordinal spans BOTH done extractions — it indexes the list the reader is actually shown, not one extraction at a time", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const regions = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const kinds = new Set(regions.map((r) => r.engine_kind));
  assert.ok(kinds.size >= 2, `the fixture has two done extraction kinds, got ${[...kinds].join(",")}`);
  const perExtraction = new Map();
  for (const r of regions) perExtraction.set(r.extraction_id, (perExtraction.get(r.extraction_id) ?? 0) + 1);
  assert.ok(perExtraction.size >= 2, "regions from both extractions must be present");
  // One flat 1..N sequence across both, not two restarting sequences.
  assert.equal(new Set(regions.map((r) => r.idx)).size, regions.length, "an idx that restarts per extraction would collide across the flat list");
});

test("x54.c the ADDITIVE promise holds — every pre-0054 region key is still published beside the new idx", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const region = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }))[0];
  const expected = [
    "id", "extraction_id", "engine_kind", "version_n", "locator_kind", "locator",
    "field_path", "text_content", "engine_confidence", "monetary_raw", "monetary_cents",
  ];
  for (const k of expected) {
    assert.ok(k in region, `region key "${k}" must survive the recut — the live frozen consumers and the dashboard read these`);
  }
  assert.deepEqual(
    Object.keys(region).sort(),
    [...expected, "idx"].sort(),
    "the region envelope must be EXACTLY the eleven carried keys plus idx — an unaccounted-for key crosses the DB↔surface seam unmeasured",
  );
});

// ===========================================================================
// 3. STABLE — the property the runtime's second, independent RPC call depends on.
// ===========================================================================

test("x54.d STABILITY: two independent calls answer the SAME idx for the same region (the model reads the list on one call; the wrapper resolves the cited idx on another)", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const first = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const second = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const mapOf = (rs) => Object.fromEntries(rs.map((r) => [String(r.idx), r.id]));
  assert.deepEqual(mapOf(second), mapOf(first), "the idx -> region_id mapping must be identical across calls");
  assert.deepEqual(second.map((r) => r.idx), first.map((r) => r.idx), "…and so must the order");
});

test("x54.e STABILITY under a DIFFERENT char budget: a smaller p_max_chars truncates region TEXT but never renumbers or drops a region", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const full = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const tight = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1, maxChars: 40 }));
  assert.equal(tight.length, full.length, "the budget caps TEXT, not the region roster — a budget-dependent roster would make an idx mean different things to different callers");
  assert.deepEqual(
    Object.fromEntries(tight.map((r) => [String(r.idx), r.id])),
    Object.fromEntries(full.map((r) => [String(r.idx), r.id])),
    "the idx -> region_id mapping must not move with the char budget",
  );
});

// ===========================================================================
// 4. USABLE END TO END, through the REAL, UNTOUCHED evidence wall.
// ===========================================================================

test("x54.f the region an idx names is genuinely citable: taking (id, text) at a chosen idx and drafting through the real evidence wall succeeds — 0054 did not drift the ordinal off the ids clara._write_entry_evidence reads", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const regions = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  // Pick a region by ORDINAL, exactly as the runtime resolution does, and cite the id it
  // names. Deliberately NOT regions[0]: an off-by-one or a positional resolver would pass
  // a first-element test by luck.
  const target = regions.find((r) => r.idx === 2);
  assert.ok(target, "the fixture must have an idx 2");
  assert.ok(typeof target.id === "string" && target.id.length === 36, "the region an idx names must carry its own id — the wall reads that, not the idx");
  assert.ok(typeof target.text_content === "string" && target.text_content.length > 0, "…and its stored text, which the wall re-checks the quote against");

  const cred = await mintInteractive(doc.firm);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: doc.documentId });
  const draft = await wakeDraftEntry(cred, {
    client: clients.A1, resolution: res, lines: billLines(EXP, AP, 500000),
    document: doc.documentId, sha256: doc.sha256, vendor: VENDOR,
    evidence: [ev(target.id, target.text_content, target.field_path)],
    codingKind: CODING_KIND, opKey: opk("x54ev"),
  });
  assert.ok(draft.entry_id, "a draft citing the region an idx names must be accepted by the wall");
  assert.equal((await entryRow(draft.entry_id)).status, "draft");
});

test("x54.g the wall is UNCHANGED by 0054: an id that names no region of this document is still refused, and this file must never be the reason that stops being true", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await multiRegionDoc(users.alice, clients.A1);
  const cred = await mintInteractive(doc.firm);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: doc.documentId });
  let raised = null;
  try {
    await wakeDraftEntry(cred, {
      client: clients.A1, resolution: res, lines: billLines(EXP, AP, 500000),
      document: doc.documentId, sha256: doc.sha256, vendor: VENDOR,
      evidence: [ev(randomUUID(), "bogus quote", "invoice.total")],
      codingKind: CODING_KIND, opKey: opk("x54bad"),
    });
  } catch (e) {
    raised = e;
  }
  assert.ok(raised, "citing a region that does not belong to the document must still RAISE");
  assert.equal(raised.code, "CLR21", `expected CLR21, got ${raised.code}: ${raised.message}`);
  assert.match(String(raised.detail ?? ""), /evidence_invalid/, "…on the evidence_invalid discriminant, exactly as before 0054");
});
