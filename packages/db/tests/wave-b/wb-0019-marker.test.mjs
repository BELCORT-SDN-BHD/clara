// Wave-B battery — migration 0019 §2: THE STALE MARKER (citation/ref columns,
// the reason CHECK, the paired-presence CHECK, and the three index-coverage
// predicate shapes with their EXPLAIN-backed plan proof). CONTRACT-BLIND; FAILS
// below 0019.
//
// AMBIGUITIES this lane encodes:
//   [D19-3] §2 pins the required index COVERAGE, not the definitions ("the exact
//           index definitions are the builder's"). Encoded as a shape assertion:
//           for each required predicate at least one index on that relation whose
//           `pg_get_indexdef` names the required column(s). A coverage contract
//           has no exact-set test; a divergence here is an adjudication request.
//   [D19-4] §9 "Plan coverage" offers the builder TWO options (seed enough rows,
//           OR force enable_seqscan=off and assert the index is usable) and says
//           "the battery pins which". THIS LANE PINS OPTION 2: each canonical
//           statement is EXPLAINed inside a subtransaction with
//           `set local enable_seqscan=off`, and the cell FAILS if the plan still
//           contains a Seq Scan of wiki_page_citations or wiki_page_refs — i.e.
//           no usable index exists for that predicate at all.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  PG, rootQuery, getPool, opk,
  assertRaises, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, hasColumn,
  buildWaveBWorld, filedDocument, publishWikiPage,
  pageRow, citationRows, refRows, indexDefs,
  WB_STALE_COLS, WB_STALE_RELATIONS, WB_STALE_REASON,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let page = null; // a published page whose current version carries a doc citation
let doc = null;

/** Column metadata straight from information_schema (blind catalog inspection). */
async function colMeta(table, col) {
  const r = await rootQuery(
    `select data_type, is_nullable, column_default from information_schema.columns
      where table_schema='clara' and table_name=$1 and column_name=$2`, [table, col]);
  return r.rows[0] ?? null;
}

/** Every CHECK constraint definition on a clara relation, joined. */
async function checkDefsOf(table) {
  const r = await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='c'`, [table]);
  return r.rows[0].d ?? "";
}

/** EXPLAIN `sql` with sequential scans DISABLED, inside a rolled-back txn.
 *  Returns every {nodeType, relation} pair in the plan tree. */
async function planNodes(sql, params) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("set local enable_seqscan = off");
    const r = await c.query(`explain (format json) ${sql}`, params);
    await c.query("rollback");
    const nodes = [];
    const walk = (n) => {
      if (n == null || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n["Node Type"]) nodes.push({ nodeType: n["Node Type"], relation: n["Relation Name"] ?? null });
      Object.values(n).forEach(walk);
    };
    walk(r.rows[0]["QUERY PLAN"]);
    return nodes;
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

async function assertNoSeqScan(label, sql, params) {
  const nodes = await planNodes(sql, params);
  const offenders = nodes.filter(
    (n) => n.nodeType === "Seq Scan" && WB_STALE_RELATIONS.includes(n.relation));
  assert.equal(offenders.length, 0,
    `${label}: no index covers the predicate — the plan still sequentially scans ${offenders.map((o) => o.relation).join(",")} with enable_seqscan=off (plan: ${JSON.stringify(nodes)})`);
}

before(async () => {
  live = await wbEnsureReady19();
  if (!live) return;
  w = await buildWaveBWorld();
  doc = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "d19-marker", title: "Marker",
    citations: [{ source_kind: "document", document_id: doc.documentId }],
    refs: [{ ref_kind: "document", document_id: doc.documentId }],
  });
  page = await pageRow(w.clients.A1, "d19-marker");
});
after(async () => { printLaneNotes("wb-0019-marker"); await endPool(); });

test("META: 0019 applied — the marker battery is armed", async () => {
  fail0019(live);
  assert.ok(page?.current_version_id, "a published page with a document citation AND a document ref is staged");
});

test("[0019 §2]: BOTH reference relations gain the SAME additive pair — nullable stale_at + stale_reason", async () => {
  fail0019(live);
  for (const rel of WB_STALE_RELATIONS) {
    for (const col of WB_STALE_COLS) {
      assert.ok(await hasColumn(rel, col), `clara.${rel}.${col} exists`);
    }
    const at = await colMeta(rel, "stale_at");
    assert.match(at.data_type, /timestamp with time zone/, `${rel}.stale_at is timestamptz`);
    assert.equal(at.is_nullable, "YES", `${rel}.stale_at is NULLABLE (additive — existing rows stay unmarked)`);
    assert.equal(at.column_default, null, `${rel}.stale_at carries NO default (a marker, never auto-set)`);
    const why = await colMeta(rel, "stale_reason");
    assert.match(why.data_type, /text|character varying/, `${rel}.stale_reason is text`);
    assert.equal(why.is_nullable, "YES", `${rel}.stale_reason is NULLABLE`);
  }
});

test("[0019 §2]: every EXISTING row is unmarked — the marker changes no read until a writer marks", async () => {
  fail0019(live);
  const cites = await citationRows(page.current_version_id);
  assert.ok(cites.length >= 1, "the published version carries its citations");
  for (const c of cites) {
    assert.equal(c.stale_at, null, "a freshly published citation is UNMARKED");
    assert.equal(c.stale_reason, null, "…with no reason");
  }
  const refs = await refRows(page.id);
  assert.ok(refs.length >= 1, "the page carries its document ref");
  for (const r of refs) {
    assert.equal(r.stale_at, null, "a freshly published ref is UNMARKED");
    assert.equal(r.stale_reason, null, "…with no reason");
  }
});

test("[0019 §2]: the reason CHECK is the single-valued extension seam ('source_filing_retired' only)", async () => {
  fail0019(live);
  for (const rel of WB_STALE_RELATIONS) {
    const defs = await checkDefsOf(rel);
    assert.ok(defs.includes(`'${WB_STALE_REASON}'`),
      `clara.${rel} CHECKs name '${WB_STALE_REASON}' (got: ${defs})`);
  }
  const cite = (await citationRows(page.current_version_id))[0];
  await assertRaises(PG.checkViolation, () => rootQuery(
    "update clara.wiki_page_citations set stale_at=now(), stale_reason='invented_reason' where id=$1", [cite.id]),
  "an unrecognised stale_reason on a citation");
  const ref = (await refRows(page.id))[0];
  await assertRaises(PG.checkViolation, () => rootQuery(
    "update clara.wiki_page_refs set stale_at=now(), stale_reason='invented_reason' where id=$1", [ref.id]),
  "an unrecognised stale_reason on a ref");
});

test("[0019 §2]: the PAIRED presence CHECK holds BOTH ways on both relations (the 0018:36-44 additive-pair pattern)", async () => {
  fail0019(live);
  const cite = (await citationRows(page.current_version_id))[0];
  const ref = (await refRows(page.id))[0];
  const probes = [
    ["wiki_page_citations", cite.id, "stale_at=now(), stale_reason=null", "a marked citation with NO reason"],
    ["wiki_page_citations", cite.id, `stale_at=null, stale_reason='${WB_STALE_REASON}'`, "a citation reason with NO stale_at"],
    ["wiki_page_refs", ref.id, "stale_at=now(), stale_reason=null", "a marked ref with NO reason"],
    ["wiki_page_refs", ref.id, `stale_at=null, stale_reason='${WB_STALE_REASON}'`, "a ref reason with NO stale_at"],
  ];
  for (const [rel, id, setter, label] of probes) {
    await assertRaises(PG.checkViolation, () => rootQuery(
      `update clara.${rel} set ${setter} where id=$1`, [id]), label);
  }
  // …and the well-formed pair is accepted on both relations (the positive control).
  await rootQuery(
    `update clara.wiki_page_citations set stale_at=now(), stale_reason=$2 where id=$1`, [cite.id, WB_STALE_REASON]);
  await rootQuery(
    `update clara.wiki_page_refs set stale_at=now(), stale_reason=$2 where id=$1`, [ref.id, WB_STALE_REASON]);
  assert.ok((await citationRows(page.current_version_id)).find((c) => c.id === cite.id).stale_at,
    "the well-formed citation pair is accepted");
  assert.ok((await refRows(page.id)).find((r) => r.id === ref.id).stale_at,
    "the well-formed ref pair is accepted");
  // Restore the fixture so the plan probes below run against a live-row shape.
  await rootQuery("update clara.wiki_page_citations set stale_at=null, stale_reason=null where id=$1", [cite.id]);
  await rootQuery("update clara.wiki_page_refs set stale_at=null, stale_reason=null where id=$1", [ref.id]);
});

test("[0019 §2/D19-3]: index COVERAGE exists for the writer, lint and read predicate shapes (the tables ship with none)", async () => {
  fail0019(live);
  const cite = await indexDefs("wiki_page_citations");
  const ref = await indexDefs("wiki_page_refs");
  const covers = (defs, ...cols) => defs.some((d) => cols.every((c) => d.includes(c)));
  // (1) writer + catch-up scan.
  assert.ok(covers(cite, "document_id"),
    `wiki_page_citations has an index on document_id (writer/catch-up scan) — got ${JSON.stringify(cite)}`);
  assert.ok(covers(ref, "document_id"),
    `wiki_page_refs has an index on document_id (writer/catch-up scan) — got ${JSON.stringify(ref)}`);
  // (2) lint scan: the stale-marked lookup + the page-join keys.
  assert.ok(covers(cite, "stale_at"), "wiki_page_citations has stale_at index coverage (the lint scan)");
  assert.ok(covers(ref, "stale_at"), "wiki_page_refs has stale_at index coverage (the lint scan)");
  assert.ok(covers(cite, "version_id"), "wiki_page_citations has version_id coverage (the page-join key)");
  assert.ok(covers(ref, "page_id"), "wiki_page_refs has page_id coverage (the page-join key)");
  // The inverted-lint side needs nothing new: uq_document_filing_active already
  // serves the NOT EXISTS probe (0007:93-94).
  const filings = await indexDefs("document_filings");
  assert.ok(filings.some((d) => d.includes("uq_document_filing_active")),
    "uq_document_filing_active still serves the inverted scan's NOT EXISTS probe");
});

test("[0019 §9/D19-4]: EXPLAIN plan coverage — no predicate shape falls back to a sequential scan", async () => {
  fail0019(live);
  await assertNoSeqScan("writer/catch-up (citations)",
    `select c.id from clara.wiki_page_citations c
       join clara.wiki_pages p on p.current_version_id=c.version_id
      where p.client_id=$1 and p.state='active' and c.document_id=$2 and c.stale_at is null`,
    [w.clients.A1, doc.documentId]);
  await assertNoSeqScan("writer/catch-up (refs)",
    `select r.id from clara.wiki_page_refs r
       join clara.wiki_pages p on p.id=r.page_id
      where p.client_id=$1 and p.state='active' and r.ref_kind='document'
        and r.document_id=$2 and r.stale_at is null`,
    [w.clients.A1, doc.documentId]);
  await assertNoSeqScan("lint scan (citations)",
    "select c.id from clara.wiki_page_citations c where c.stale_at is not null and c.client_id=$1",
    [w.clients.A1]);
  await assertNoSeqScan("lint scan (refs)",
    "select r.id from clara.wiki_page_refs r where r.stale_at is not null and r.client_id=$1",
    [w.clients.A1]);
  await assertNoSeqScan("has_stale_sources read predicate (citations)",
    "select 1 where exists(select 1 from clara.wiki_page_citations c where c.version_id=$1 and c.stale_at is not null)",
    [page.current_version_id]);
  await assertNoSeqScan("has_stale_sources read predicate (refs)",
    "select 1 where exists(select 1 from clara.wiki_page_refs r where r.page_id=$1 and r.stale_at is not null)",
    [page.id]);
});

test("[0019 §2]: a REPUBLISH deletes and re-creates refs — a ref's mark does NOT survive (refs are page-level MUTABLE rows)", async () => {
  fail0019(live);
  const ref0 = (await refRows(page.id))[0];
  await rootQuery(
    "update clara.wiki_page_refs set stale_at=now(), stale_reason=$2 where id=$1", [ref0.id, WB_STALE_REASON]);
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "d19-marker", title: "Marker v2",
    content: `# marker v2 ${opk("x")}`,
    citations: [{ source_kind: "document", document_id: doc.documentId }],
    refs: [{ ref_kind: "document", document_id: doc.documentId }],
  });
  const after1 = await refRows(page.id);
  assert.equal(after1.length, 1, "the republish left exactly one ref row (delete + re-insert, 0017:2134/2164-2166)");
  assert.notEqual(after1[0].id, ref0.id, "…a NEW row, not the marked one");
  assert.equal(after1[0].stale_at, null,
    "the re-created ref is UNMARKED — and correctly so: a republish re-validates every document ref against the CLR02 active-filing floor, so a surviving ref is provably live");
  // Citations, by contrast, are VERSIONED and IMMUTABLE: the superseded version
  // keeps its own rows untouched forever (0017:2128-2131).
  const v1Cites = await citationRows(page.current_version_id);
  const reread = await pageRow(w.clients.A1, "d19-marker");
  assert.notEqual(reread.current_version_id, page.current_version_id, "the republish moved the current-version pointer");
  const v2Cites = await citationRows(reread.current_version_id);
  assert.ok(v1Cites.length >= 1 && v2Cites.length >= 1,
    "both the superseded and the current version keep their OWN citation rows (citations are never deleted)");
  assert.equal(v1Cites.filter((c) => v2Cites.some((x) => x.id === c.id)).length, 0,
    "…and they are disjoint row sets");
});
