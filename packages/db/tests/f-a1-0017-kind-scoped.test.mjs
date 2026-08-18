// Wave-F Track A, F-A1 PR-1 — the 0017 authority trigger's KIND-SCOPED supersede
// (docs/plan/active/f-a1-witness-pair-design.md SS3.9 / SS6.2 / D11).
//
// migrations/0089_f_a1_kind_scoped_supersede.sql replaces
// clara._tf_set_authoritative_extraction_0017() so that within-kind supersede
// bookkeeping is scoped to engine_kind, decoupled from the document-wide
// authoritative_extraction_id pointer (which stays exactly as it was: the
// (extracted_at,id)-max across ALL kinds). WITHOUT this, a one-transaction
// multi-kind witness pair (F-A1's llm_text_facts/llm_vision_facts) would
// supersede ITSELF by a uuid coin flip, permanently (superseded_by is a
// one-way once-only transition, 0007:663-676, CLR08).
//
// READINESS. Keyed on the LIVE CATALOG, never a migration number: this file's
// migration was authored UNNUMBERED (numbers are claimed at merge,
// .claude/rules/db-migrations.md; it landed as 0089 at PR-1 assembly), and the
// catalog key stays the right probe either way. `hasKindScopedSupersede()` reads the
// trigger function's own prosrc for the kind-scoping marker. Every cell in
// this file FAILS LOUDLY against a database that lacks the fix (the 0021-
// ratchet idiom, x1-helpers.mjs's fail0022): this file's entire purpose is to
// prove THIS migration, so a silent skip here would be the exact false-green
// the ratchet exists to catch.
//
// FIXTURES. document_extractions rows below are inserted RAW (superuser,
// below the writer layer) — the same "seed a second done facts lane, raw"
// idiom a21-adversarial.test.mjs already uses (lines ~588-596 there) to
// engineer a specific extraction-table shape no single writer would produce
// on its own. This is deliberate: no witness writer exists yet (PR-1 mints no
// witness work, SS6/D9), so the pair shape has to be engineered directly
// against the table the trigger actually fires on — which is exactly the
// surface the design's consumer census proved is centralized in SECURITY
// DEFINER writers in production (never a hand-write in the app or the agent).
// The two kinds used to stand in for the not-yet-existing llm_text_facts /
// llm_vision_facts are the CHECK-permitted 'doc_classify' and
// 'structured_parse' where the scenario is kind-generic, and the REAL
// 'ocr' -> 'invoice_facts' pair where the design names that exact case
// (SS3.9's cross-kind example, and the CLR31 consumer's own two branches).
//
// Contract-blind cells are marked (BLIND): they assert the OBSERVABLE
// contract (superseded_by / authoritative_extraction_id / the CLR31 refusal
// reason) without referring to this file's own SQL shape.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, assertRaises,
  seedCitedDocument, firmOf,
} from "./x1-helpers.mjs";
import { grantConsent } from "./wave-a-fixtures.mjs";
import { withTxn } from "./rig-txn.mjs";

let W = null;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await hasKindScopedSupersede();
  if (live) W = await buildWorld();
});
after(async () => { await endPool(); });

/** Reads the LIVE trigger function's own prosrc for the kind-scoping marker
 *  this migration installs. Never keyed on a migration number (this file's
 *  migration is unnumbered until merge). */
async function hasKindScopedSupersede() {
  const r = await rootQuery(
    `select position('v_kind_current' in prosrc) > 0 as has
       from pg_proc where oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure`,
  );
  return r.rows[0]?.has === true;
}

function gate() {
  if (!live) {
    throw new Error(
      "the kind-scoped 0017 trigger is NOT live (clara._tf_set_authoritative_extraction_0017"
      + " carries no 'v_kind_current' marker) -- apply"
      + " migrations/0089_f_a1_kind_scoped_supersede.sql (renumbered) first. This battery"
      + " is REQUIRED to fail against a pre-fix database.");
  }
}

// ---------------------------------------------------------------------------
// Fixtures — raw inserts below the writer layer (a21-adversarial precedent).
// ---------------------------------------------------------------------------

/** A bare document + firm/client, with NO extractions of its own (unlike
 *  seedCitedDocument, which always seeds one 'ocr' extraction + region —
 *  cells that want a clean slate use this; cells that want the real
 *  ocr-then-facts shape use seedCitedDocument directly). */
async function bareDoc(sub, client) {
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client });
  return { firm, documentId: cited.documentId, seededExtractionId: cited.extractionId, seededRegionId: cited.regionId };
}

/** Raw insert of ONE done document_extractions row, via the given queryer
 *  (rootQuery for a one-shot statement, or a withTxn client's bound query for
 *  a multi-statement transaction). Fires the REAL AFTER INSERT trigger. */
async function rawExtraction(q, { firm, document, kind, engineId, versionN = 1, extractedAt = null }) {
  const id = randomUUID();
  const r = await q(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count,extracted_at)
     values($1,$2,$3,$4,$5,$6,'done',1,coalesce($7::timestamptz, now()))
     returning id, extracted_at, superseded_by`,
    [id, firm, document, engineId, kind, versionN, extractedAt],
  );
  return r.rows[0];
}

/** Raw insert of a document_regions row bound to one extraction (minimal
 *  shape: the CLR31 consumer only needs a row to exist at the (extraction,
 *  region) pair it is handed). */
async function rawRegion(firm, extractionId) {
  const r = await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator)
     values($1,$2,'page_polygon','{}'::jsonb) returning id`,
    [firm, extractionId],
  );
  return r.rows[0].id;
}

async function extractionRow(id) {
  const r = await rootQuery(
    "select id, engine_kind, version_n, extracted_at, superseded_by from clara.document_extractions where id=$1",
    [id],
  );
  return r.rows[0];
}

async function pointerOf(document) {
  const r = await rootQuery("select authoritative_extraction_id from clara.documents where id=$1", [document]);
  return r.rows[0]?.authoritative_extraction_id ?? null;
}

/** The DETAIL {"reason":...} discriminant off a raised error (the s6-helpers.mjs
 *  reasonOf idiom — regex, not JSON.parse, since DETAIL is contract-pinned as a
 *  substring match, never assumed to be strictly-parseable standalone JSON). */
function reasonOf(err) {
  const m = /"reason"\s*:\s*"([a-z_]+)"/.exec(err?.detail ?? "");
  return m ? m[1] : null;
}

/** The (extracted_at,id)-max of two extraction rows, in the trigger's own comparison order —
 *  extracted_at first (as a real timestamp, not a Date-object reference), id (text) breaks a tie. */
function pairWinner(a, b) {
  const ta = a.extracted_at instanceof Date ? a.extracted_at.getTime() : Date.parse(a.extracted_at);
  const tb = b.extracted_at instanceof Date ? b.extracted_at.getTime() : Date.parse(b.extracted_at);
  if (ta !== tb) return ta > tb ? a : b;
  return a.id > b.id ? a : b;
}

// ===========================================================================
// The pair shapes — same-transaction TWO-kind inserts.
// ===========================================================================

test("(BLIND) same-transaction two-kind pair, TWO SEPARATE INSERT statements (the 0038:1781/1790 writer precedent) — NEITHER row superseded; pointer = the (extracted_at,id)-max of the pair", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  // Mirrors _persist_statement_core's OWN shape (0038:1781-1798): two separate
  // INSERT statements against document_extractions, one transaction, both
  // taking the transaction-scoped now() by default -- the exact condition
  // that makes the kind-blind trigger self-supersede a pair (SS3.9). Here the
  // two rows are DIFFERENT kinds (the witness-pair shape F-A1 introduces;
  // 0038's own reader1/reader2 pair is SAME kind -- see the coin-flip census
  // cell below for that pre-existing, untouched condition).
  const out = await withTxn(async (c) => {
    const q = (sql, params) => c.query(sql, params);
    const a = await rawExtraction(q, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:text" });
    const b = await rawExtraction(q, { firm, document: documentId, kind: "structured_parse", engineId: "fa1-rig:vision" });
    return { a, b };
  });
  const a = await extractionRow(out.a.id);
  const b = await extractionRow(out.b.id);
  assert.equal(a.superseded_by, null, "the first-inserted half of the pair is NOT superseded");
  assert.equal(b.superseded_by, null, "the second-inserted half of the pair is NOT superseded either");
  const winner = pairWinner(a, b);
  assert.equal(await pointerOf(documentId), winner.id,
    "the pointer lands on the (extracted_at,id)-max of the pair (deterministic given the two ids, "
    + "even though which specific row wins a same-instant tie is not predicted by this cell -- "
    + "the determinism cell below pins the case that matters operationally: distinct timestamps)");
});

test("(BLIND) same-transaction two-kind pair, ONE multi-row INSERT statement — both rows still end unsuperseded (the end-of-statement trigger-visibility hazard)", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  // AFTER-INSERT-FOR-EACH-ROW triggers on a SINGLE multi-row INSERT fire once
  // all of the statement's rows are already inserted -- so by the time the
  // FIRST row's trigger runs, the SECOND row is already visible in the table,
  // and vice versa (neither trigger invocation is "before" the other's row
  // exists, unlike two separate statements where the first is fully
  // superseded-and-pointer-updated before the second even begins). Under the
  // OLD kind-blind trigger this was the worst-case shape: row A's firing would
  // sweep row B (already visible, done, unsuperseded, different id) as an
  // "older" row and vice versa depending on tie-break order -- BOTH rows
  // could end up superseded and the pointer corrupted. Kind-scoping closes
  // this the same way it closes the two-statement shape: the within-kind
  // lookup for kind X never sees a kind-Y sibling, however visible it is.
  const idA = randomUUID();
  const idB = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count)
     values($1,$2,$3,'fa1-rig:text','doc_classify',1,'done',1),
           ($4,$2,$3,'fa1-rig:vision','structured_parse',1,'done',1)`,
    [idA, firm, documentId, idB],
  );
  const a = await extractionRow(idA);
  const b = await extractionRow(idB);
  assert.equal(a.superseded_by, null, "row A (single multi-row INSERT) is NOT superseded");
  assert.equal(b.superseded_by, null, "row B (single multi-row INSERT) is NOT superseded");
  const ptr = await pointerOf(documentId);
  assert.ok(ptr === idA || ptr === idB, "the pointer lands on one of the pair (the (extracted_at,id)-max)");
});

test("a two-kind pair with DISTINCT explicit extracted_at values lands the pointer on the LATER row, deterministically — no trigger special-case needed", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  // D11/addendum: the trigger is NOT special-cased for pairs. Determinism for
  // a real witness pair comes from the FUTURE writer stamping distinct
  // per-row extracted_at (clock_timestamp(), not a shared transaction now())
  // -- proved here with zero trigger changes: ordinary explicit timestamps,
  // the SAME (extracted_at,id) comparison the pointer block always used.
  // Anchored on Date.now(), not a fixed calendar date: bareDoc()'s own
  // seedCitedDocument call just minted an 'ocr' row stamped at the REAL now()
  // a moment ago, and it must not accidentally out-rank this cell's pair.
  const t0 = new Date(Date.now() + 3_600_000); // 1h in the future, unambiguous vs "just now"
  const t1 = new Date(t0.getTime() + 1_000); // 1s later still
  const early = await rawExtraction(rootQuery, {
    firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:text", extractedAt: t0.toISOString() });
  const later = await rawExtraction(rootQuery, {
    firm, document: documentId, kind: "structured_parse", engineId: "fa1-rig:vision", extractedAt: t1.toISOString() });
  assert.equal((await extractionRow(early.id)).superseded_by, null, "different kinds -- neither touches the other");
  assert.equal((await extractionRow(later.id)).superseded_by, null);
  assert.equal(await pointerOf(documentId), later.id,
    "the pointer lands on the row with the LATER extracted_at, regardless of which id is numerically larger");
});

// ===========================================================================
// Within-kind bookkeeping.
// ===========================================================================

test("within-kind: a same-kind v2 after v1 supersedes v1; the pointer repoints", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const v1 = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:v1", versionN: 1 });
  const v2 = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:v2", versionN: 2 });
  assert.equal((await extractionRow(v1.id)).superseded_by, v2.id, "v1 is superseded by v2 (same kind, newer)");
  assert.equal((await extractionRow(v2.id)).superseded_by, null, "v2 is live");
  assert.equal(await pointerOf(documentId), v2.id, "the pointer repoints to v2");
});

test("(BLIND) cross-kind: an invoice_facts row lands after the fixture's own ocr row — the ocr row is NOT superseded (the new behaviour) and the pointer moves to the invoice_facts row", async () => {
  gate();
  // Reuses seedCitedDocument's OWN 'ocr' extraction (the real production
  // shape SS3.9 names) rather than a synthetic stand-in kind, so this cell
  // pins the design's own worked example byte-for-byte.
  const seeded = await bareDoc(W.users.alice, W.clients.A1); // fresh doc + its own ocr row
  const ocrId = seeded.seededExtractionId;
  const facts = await rawExtraction(rootQuery, {
    firm: seeded.firm, document: seeded.documentId, kind: "invoice_facts", engineId: "fa1-rig:facts" });
  const ocrAfter = await extractionRow(ocrId);
  assert.equal(ocrAfter.superseded_by, null,
    "the ocr row is NOT superseded merely because a later-kind (invoice_facts) row landed -- "
    + "this is the exact behaviour change SS3.9 ships (under the pre-fix trigger this was "
    + "superseded, proven separately against a pre-fix database in the PR record)");
  assert.equal(await pointerOf(seeded.documentId), facts.id,
    "the pointer moves to the newer, different-kind row (document-wide comparison unchanged)");
  assert.equal(await extractionRow(facts.id).then((r) => r.superseded_by), null);
});

test("late-arriving OLDER same-kind row is superseded by the kind-max; the pointer is unmoved", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const now = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:now" });
  const older = await rawExtraction(rootQuery, {
    firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:older",
    extractedAt: new Date(Date.now() - 3600_000).toISOString() }); // 1h in the past
  assert.equal((await extractionRow(older.id)).superseded_by, now.id,
    "the late-arriving OLDER same-kind row is superseded by the kind-max (not vacuously live)");
  assert.equal((await extractionRow(now.id)).superseded_by, null, "the kind-max stays live");
  assert.equal(await pointerOf(documentId), now.id, "the pointer is unmoved");
});

test("a late-arriving OLDER row of a DIFFERENT kind, first/newest of its own kind, is NOT superseded and the pointer is unmoved", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const kindA = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:a" });
  const kindBOlder = await rawExtraction(rootQuery, {
    firm, document: documentId, kind: "structured_parse", engineId: "fa1-rig:b",
    extractedAt: new Date(Date.now() - 3600_000).toISOString() }); // older than kindA, but FIRST of kind B
  assert.equal((await extractionRow(kindBOlder.id)).superseded_by, null,
    "kind B's row is the first/newest of ITS kind (vacuously kind-max) -- NOT superseded, "
    + "even though it is chronologically older than kind A's row");
  assert.equal(await pointerOf(documentId), kindA.id,
    "the pointer is unmoved: kind B's row is older document-wide, so it never contended for the pointer");
});

// ===========================================================================
// The pre-existing SAME-KIND statement-reader-pair coin-flip — documented,
// never repaired (addendum item 2 / the migration's S0b(b)).
// ===========================================================================

test("(BLIND) the pre-existing same-kind statement-reader-pair coin-flip is UNTOUCHED by kind-scoping (reader1/reader2 stay one engine_kind by design)", async () => {
  gate();
  // Mirrors _persist_statement_core's actual shape (0038:1781-1798): two rows
  // sharing (document_id, engine_kind, version_n), DIFFERENT engine_id, via
  // two separate INSERT statements in one transaction. Both readers are the
  // SAME kind by design (SS2), so kind-scoping does not (and should not)
  // change this: exactly one of the pair still wins the tie-break. This cell
  // pins that the fix does NOT silently "fix" this too -- a change nobody
  // reviewed would be worse than the documented, named condition the
  // migration's S0b(b) census counts.
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const out = await withTxn(async (c) => {
    const q = (sql, params) => c.query(sql, params);
    const r1 = await rawExtraction(q, { firm, document: documentId, kind: "statement_facts", engineId: "fa1-rig:reader1" });
    const r2 = await rawExtraction(q, { firm, document: documentId, kind: "statement_facts", engineId: "fa1-rig:reader2" });
    return { r1, r2 };
  });
  const r1 = await extractionRow(out.r1.id);
  const r2 = await extractionRow(out.r2.id);
  const supersededCount = [r1, r2].filter((r) => r.superseded_by !== null).length;
  assert.equal(supersededCount, 1,
    "exactly ONE of the same-kind reader pair is superseded by the other (the coin-flip) -- "
    + "this is the PRE-EXISTING condition the migration documents and explicitly does not repair");
});

// ===========================================================================
// CLR31 — the consumer that distinguishes the two post-states.
// ===========================================================================

test("(BLIND) CLR31: citing a SUPERSEDED row raises extraction_not_accepted", async () => {
  gate();
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const v1 = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:v1" });
  const region = await rawRegion(firm, v1.id);
  await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:v2", versionN: 2 }); // supersedes v1
  assert.notEqual((await extractionRow(v1.id)).superseded_by, null, "mandatory setup: v1 is superseded");
  const err = await assertRaises("CLR31",
    () => rootQuery("select clara._assert_opening_extraction_ref($1,$2,$3::jsonb)",
      [firm, documentId, JSON.stringify({ extraction_id: v1.id, region_id: region })]),
    "citing a superseded extraction");
  assert.equal(reasonOf(err), "extraction_not_accepted", `expected reason extraction_not_accepted, got ${err.detail}`);
});

test("(BLIND) CLR31: citing an UNSUPERSEDED row that is not the pointer raises stale_extraction_version", async () => {
  gate();
  // The cross-kind post-state SS3.9 names directly: kind A's row is live
  // (never superseded -- a different kind never touches it) but the pointer
  // has moved to kind B's newer row. Citing kind A's row is neither
  // "accepted current" (it's not the pointer) nor "not accepted" (it was
  // never superseded) -- the design's second, distinct refusal reason.
  const { firm, documentId } = await bareDoc(W.users.alice, W.clients.A1);
  const kindA = await rawExtraction(rootQuery, { firm, document: documentId, kind: "doc_classify", engineId: "fa1-rig:a" });
  const region = await rawRegion(firm, kindA.id);
  await rawExtraction(rootQuery, { firm, document: documentId, kind: "structured_parse", engineId: "fa1-rig:b" }); // newer, different kind -> becomes pointer
  assert.equal((await extractionRow(kindA.id)).superseded_by, null, "mandatory setup: kind A's row is NOT superseded");
  assert.notEqual(await pointerOf(documentId), kindA.id, "mandatory setup: kind A's row is NOT the pointer");
  const err = await assertRaises("CLR31",
    () => rootQuery("select clara._assert_opening_extraction_ref($1,$2,$3::jsonb)",
      [firm, documentId, JSON.stringify({ extraction_id: kindA.id, region_id: region })]),
    "citing an unsuperseded non-pointer extraction");
  assert.equal(reasonOf(err), "stale_extraction_version", `expected reason stale_extraction_version, got ${err.detail}`);
});
