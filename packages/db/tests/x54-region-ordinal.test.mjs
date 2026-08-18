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
// THE PROPERTIES THE RUNTIME DEPENDS ON, each with its own cell:
//   1. PRESENT + DENSE — every region carries an integer idx, and the set is exactly 1..N.
//   2. ORDERED — regions[] arrives in idx order (a list that is not would be a trap for
//      every human reading a transcript, even though the runtime resolves by FIELD).
//   3. STABLE WITHIN A GENERATION — two independent calls answer the same idx for the same
//      region, and the char budget does not move the mapping.
//   4. USABLE END TO END — the region an idx names really is citable through the REAL,
//      untouched evidence wall, so the ordinal has not drifted off the ids that wall reads.
//   5. THE DRIFT WITNESSES (h/i) — what happens ACROSS generations, which is why the
//      runtime binds resolution to the snapshot it read.
//
// CONTRACT-BLIND where it can be: the cells name the OUTCOME (an ordinal is published,
// dense, ordered, stable, and citable), never the CTE that produces it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, markSkip, noteLane,
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
let applied = false;
let appliedAs = null;
let world = null;

/** THE LEDGER GATE, KEYED ON THE STABLE SUFFIX — NEVER ON THE NUMBER.
 *
 *  WHY (the standard minted by the F6 native review, which DEMONSTRATED the failure; the
 *  repo's own RC3 lesson is the citation — wave-d-b-asbuilt-part2.md:100). Numbers are claimed
 *  at MERGE time, so the number is the one part of this identity GUARANTEED to move, and a
 *  gate pinned to `'0054_%'` goes SILENTLY DORMANT when it does: every cell skips, the file
 *  reports 0 pass / N skip, node exits 0, CI green over a battery that measured nothing.
 *
 *  AND A SKIP MUST EARN ITSELF. "No ledger row" is lawful evidence of "not applied" ONLY
 *  when the CAPABILITY is absent too. Three states, three answers:
 *    * capability absent  + no row -> genuinely unapplied. The one lawful SKIP.
 *    * capability PRESENT + no row -> the gate has lost its subject (renamed away from the
 *                                     suffix it keys on). RAISES — the exact dormancy trap
 *                                     this standard closes, which a skip would hide.
 *    * capability absent  + a row  -> HALF-APPLIED, a third failure. RAISES.
 *  Absence is not evidence; a derived state is not evidence. Both directions are measured. */
const LEDGER_RE = "^[0-9]{4}_region_ordinal$";

/** The ledger rows for THIS migration, whatever number it merged as. `null` means
 *  clara.schema_migrations itself is unreadable (a pre-migration database). */
async function ledgerVersions() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ $1 order by version", [LEDGER_RE]);
    return r.rows.map((x) => x.version);
  } catch {
    return null;
  }
}

/** THE CAPABILITY, read from the CATALOG — the instrument production itself uses — never
 *  from the migrations directory: only the shipped body can answer whether the ordinal is
 *  actually published. */
async function ordinalPublished() {
  try {
    const r = await rootQuery(
      "select position('''idx'',rr.idx' in p.prosrc) > 0 as has from pg_proc p where p.oid = 'clara.get_document_extract(uuid,uuid,int)'::regprocedure",
    );
    return r.rows[0]?.has === true;
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
  if (!applied) {
    markSkip();
    t.skip(`the region-ordinal migration is not applied (no ledger row matching /${LEDGER_RE}/ AND the ordinal is not published) — the battery is dormant`);
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    const versions = await ledgerVersions();
    const capable = await ordinalPublished();
    if (capable && (versions === null || versions.length === 0)) {
      throw new Error(
        `x54 GATE HAS LOST ITS SUBJECT: get_document_extract PUBLISHES the region ordinal, but no clara.schema_migrations row matches /${LEDGER_RE}/. Every cell would ` +
          "have SKIPPED and this file would have reported 0 pass with exit 0 — the renumber-dormancy trap. Re-key this gate to the suffix the migration now carries; " +
          "never let it skip (RC3, wave-d-b-asbuilt-part2.md:100).",
      );
    }
    if (!capable && versions !== null && versions.length > 0) {
      throw new Error(
        `x54 GATE: ${versions.join(", ")} is recorded as applied, but clara.get_document_extract does NOT publish the region ordinal. A HALF-APPLIED migration is a ` +
          "different failure from an unapplied one and must never read as dormancy.",
      );
    }
    if (versions !== null && versions.length > 1) {
      throw new Error(`x54 GATE: ${versions.length} ledger rows match /${LEDGER_RE}/ (${versions.join(", ")}) — this migration must exist exactly once.`);
    }
    applied = capable && versions !== null && versions.length === 1;
    appliedAs = applied ? versions[0] : null;
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

test("x54 META: the region-ordinal migration is applied exactly once — matched by STABLE SUFFIX, so a merge-time renumber cannot take this battery dormant — and get_document_extract exists at exactly one signature", async (t) => {
  if (skipHere(t)) return;
  const versions = await ledgerVersions();
  assert.deepEqual(versions, [appliedAs], `exactly one applied *_region_ordinal migration (got ${JSON.stringify(versions)})`);
  assert.match(appliedAs, /^[0-9]{4}_region_ordinal$/, "the ledger row keeps the four-digit prefix the runner requires");
  noteLane(`x54: the region-ordinal migration is applied as "${appliedAs}" — this gate keys on the SUFFIX, not that number`);
  const fns = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='get_document_extract'",
  );
  assert.equal(fns.rows[0].n, 1, "an overload would leave the pre-ordinal shape reachable");
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
  // F-A1 PR-1 (M7, additive read-seam widening) adds `extracted_at` beside idx. The RATCHET
  // is updated here, deliberately, for exactly the reason it exists: a key that shows up
  // unannounced is a finding; a key added by a reviewed migration that also documents WHY
  // (docs/plan/active/f-a1-witness-pair-design.md SS3.8, wall M7) is a conscious widening.
  assert.deepEqual(
    Object.keys(region).sort(),
    [...expected, "idx", "extracted_at"].sort(),
    "the region envelope must be EXACTLY the eleven original carried keys plus idx plus F-A1's extracted_at — an unaccounted-for key crosses the DB↔surface seam unmeasured",
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

// ===========================================================================
// 5. THE DRIFT WITNESSES (the cross-model review's CRITICAL, institutionalised at the DB
//    layer). NOTHING HERE IS A CLAIM THAT THE DB IS WRONG — the ordinal is doing exactly
//    what it is defined to do. These cells RECORD the two behaviours that make the
//    RUNTIME's snapshot gate necessary, so a future reader can never conclude the gate is
//    belt-and-braces: an index is only meaningful against the list it was read from, and
//    the wall (correctly, by its own contract) cannot tell a drifted region from the
//    intended one when both carry the cited text.
// ===========================================================================

/** A document whose ONLY done extraction is the 'ocr' one, with four regions. The drift
 *  cells need this rather than multiRegionDoc: `chosen` takes ONE extraction per
 *  engine_kind, so a document that already has an invoice_facts pass would simply swap
 *  which invoice_facts extraction is chosen instead of GAINING a generation, and nothing
 *  would renumber. Measured, not assumed — the first cut of these cells used
 *  multiRegionDoc and read `DRIFTED: false`. */
async function ocrOnlyDoc(sub, client) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  for (const [path, text] of [
    ["invoice.amount_due", "RM 5,000.00"],
    ["invoice.currency", "MYR"],
    ["invoice.vendor_name", "X54 SUPPLIES SDN BHD"],
  ]) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0)`,
      [firm, cited.extractionId, path, text],
    );
  }
  return { ...cited, firm };
}

/** Land a NEW extraction of a kind that sorts BEFORE 'ocr', with regions carrying the given
 *  texts. Every existing index is renumbered by construction — no randomness. */
async function landEarlierExtraction(firm, document, texts) {
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-fixture:x54drift','invoice_facts',1,'done',1)`,
    [ext, firm, document],
  );
  for (const [path, text] of texts) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0)`,
      [firm, ext, path, text],
    );
  }
  return ext;
}

test("x54.h THE SILENT DRIFT, witnessed: an extraction landing between two reads renumbers every index, and when the region now at the cited idx carries the SAME text the wall ACCEPTS it — this is why the runtime binds resolution to the snapshot the model read", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await ocrOnlyDoc(users.alice, clients.A1);
  const t0 = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const meant = t0.find((r) => r.idx === 1);
  assert.ok(meant, "T0 must have an idx 1");

  // Every region of the landing extraction carries the SAME text as the region the model
  // read at idx 1 — so whichever of them lands at idx 1 afterwards, the quote still matches
  // and the collision is DETERMINISTIC rather than a coin flip on region-id ordering.
  await landEarlierExtraction(doc.firm, doc.documentId, [
    ["invoice.total", meant.text_content],
    ["invoice.currency", meant.text_content],
  ]);

  const t1 = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const nowAt = t1.find((r) => r.idx === 1);
  assert.notEqual(nowAt.id, meant.id, "the ordinal must genuinely have renumbered — otherwise this cell proves nothing");
  assert.equal(nowAt.text_content, meant.text_content, "…and the region now at that index carries the SAME text the model quoted");

  // Cite the region the *index* now names, with the quote the model read at T0 — exactly what
  // an ungated wrapper would have sent. The wall's contract is document + done extraction +
  // quote-as-substring, and all three hold, so it accepts. Correctly, by its own contract.
  const cred = await mintInteractive(doc.firm);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: doc.documentId });
  const draft = await wakeDraftEntry(cred, {
    client: clients.A1, resolution: res, lines: billLines(EXP, AP, 500000),
    document: doc.documentId, sha256: doc.sha256, vendor: VENDOR,
    evidence: [ev(nowAt.id, meant.text_content, nowAt.field_path)],
    codingKind: CODING_KIND, opKey: opk("x54drift"),
  });
  assert.ok(draft.entry_id, "the wall accepts a drifted-but-text-compatible citation — it has no way to know which list the index came from");
  const rows = await rootQuery("select region_id from clara.entry_evidence where entry_id=$1", [draft.entry_id]);
  assert.equal(rows.rows[0].region_id, nowAt.id, "…and the evidence recorded is the DRIFTED region, not the one the model read");
  assert.notEqual(rows.rows[0].region_id, meant.id, "THE WITNESS: without the runtime's snapshot gate, a race binds evidence to a region nobody cited");
});

test("x54.i THE LOUD CONTRAST: when the drifted region's text does NOT contain the cited quote, the same wall refuses CLR21 evidence_invalid — the wall is not weak, it is answering a different question", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await ocrOnlyDoc(users.alice, clients.A1);
  const t0 = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const meant = t0.find((r) => r.idx === 1);
  await landEarlierExtraction(doc.firm, doc.documentId, [
    ["invoice.total", "TOTALLY DIFFERENT TEXT A"],
    ["invoice.currency", "TOTALLY DIFFERENT TEXT B"],
  ]);
  const t1 = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  const nowAt = t1.find((r) => r.idx === 1);
  assert.notEqual(nowAt.id, meant.id, "renumbered");
  assert.ok(!String(nowAt.text_content).includes(meant.text_content), "…to a region whose text cannot contain the cited quote");

  const cred = await mintInteractive(doc.firm);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: doc.documentId });
  let raised = null;
  try {
    await wakeDraftEntry(cred, {
      client: clients.A1, resolution: res, lines: billLines(EXP, AP, 500000),
      document: doc.documentId, sha256: doc.sha256, vendor: VENDOR,
      evidence: [ev(nowAt.id, meant.text_content, nowAt.field_path)],
      codingKind: CODING_KIND, opKey: opk("x54drift2"),
    });
  } catch (e) {
    raised = e;
  }
  assert.ok(raised, "a text-incompatible drift must RAISE");
  assert.equal(raised.code, "CLR21");
  assert.match(String(raised.detail ?? ""), /evidence_invalid/);
});

test("x54.j the ARRAY ORDER did not move: regions[] comes back in exactly the order the pre-0054 aggregate produced — (engine_kind, version_n, region id), measured against the tables, not against the function", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const doc = await ocrOnlyDoc(users.alice, clients.A1);
  await landEarlierExtraction(doc.firm, doc.documentId, [["invoice.total", "RM 5,000.00"]]);
  const regions = regionsOf(await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 }));
  // The pre-0054 order, re-derived INDEPENDENTLY from the base tables with the same triple
  // 0009/0011's aggregate used. If the recut had reordered the array, the live frozen
  // consumers would have shifted under it.
  const expected = await rootQuery(
    `select r.id from clara.document_regions r
       join clara.document_extractions e on e.id=r.extraction_id
      where e.document_id=$1 and e.status='done'
        and e.version_n = (select max(e2.version_n) from clara.document_extractions e2
                            where e2.document_id=e.document_id and e2.engine_kind=e.engine_kind and e2.status='done')
      order by e.engine_kind, e.version_n, r.id`,
    [doc.documentId],
  );
  assert.deepEqual(regions.map((r) => r.id), expected.rows.map((r) => r.id), "the recut is additive: same rows, same order, one extra key");
});

test("x54.k the SECOND-APPLY refusal is real, not merely present in the file: re-running 0054 against a database that already has it raises BY NAME and changes nothing", async (t) => {
  if (skipHere(t)) return;
  const sql = readFileSync(new URL("../migrations/0054_region_ordinal.sql", import.meta.url), "utf8");
  const before = await rootQuery("select prosrc from pg_proc where oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure");
  let raised = null;
  try {
    await rootQuery(sql);
  } catch (e) {
    raised = e;
  }
  assert.ok(raised, "a second apply must RAISE — a silent re-ship could overwrite a body somebody else has since changed");
  assert.match(String(raised.message ?? ""), /ALREADY emits an idx key/, `expected the by-name prestate refusal, got: ${raised.message}`);
  const after = await rootQuery("select prosrc from pg_proc where oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure");
  assert.equal(after.rows[0].prosrc, before.rows[0].prosrc, "…and the installed body must be byte-identical afterwards");
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
