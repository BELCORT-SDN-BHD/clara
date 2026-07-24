// Wave-B battery — migration 0019 §1/§8/§9/§10: THE VETO IS GONE, THE
// SERIALIZER SURVIVES. Written by the CONTRACT-BLIND test lane straight from
// `docs/plan/wave-b-migration-0019-design.md` v1.0 (RATIFIED) — the 0019 SQL and
// the 0019 consumer-lib diff are NEVER read (ADR-029 discipline). A divergence
// between an expectation here and observed 0019 behavior is a FINDING for
// orchestrator adjudication, never a silent test edit.
//
// FAILS (never skips) below 0019 — fail0019.
//
// CODE NOTE (a trap this lane hit): the contract's "CLR32" is the RAW SQLSTATE,
// which is the as-built WIKI family (0017 raises errcode='CLR32' throughout
// _publish_wiki_page_version_core). In wb-helpers the wiki family is exported as
// `CLR31` (the design-doc LABEL) whose VALUE is "CLR32"; the export literally
// named `CLR32` has the VALUE "CLR33" (the lint family). Every 0019 cell imports
// the wiki family as CLR_WIKI and asserts the value, so the collision can never
// silently mis-assert.
//
// AMBIGUITIES this lane encodes (each marked [D19-n]; the lane report lists them
// all as adjudication requests, never decisions):
//   D19-1  §1 pins "a plain non-wiki client-row lock ... raising CLR11 when not
//          found" but not its statement shape. Encoded as a normalized-source
//          assertion: a `clara.clients ... for update` single statement, with a
//          CLR11 raise BETWEEN that lock and the `update ... set retired_at`.
//   D19-2  §10 R2-F2c's two-ordering table is silent on WHICH session's statement
//          starts first. Encoded as: the second session's statement is issued
//          while the first still holds the lock, and the block is PROVEN
//          (waitBlockedByOrThrow) before the first commits — the only staging in
//          which "acquires the client row first" is observable rather than assumed.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR31 as CLR_WIKI, ROLES, rootQuery, opk, getPool,
  assertRaises, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, fnSource, waitBlockedByOrThrow,
  buildWaveBWorld, filedDocument, freshResolution,
  publishWikiPage, pageRow, citationRows,
  markStale, runClientLint, openFinding, eventsOf,
  staleCiteKey, staleOpKey, WB_STALE_REASON,
  shaHex, wikiKey,
  previewCorrection, proposeCorrection, approveCorrection,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

/** Whitespace-stripped, lower-cased prosrc — the 0017 drift-guard idiom
 *  (0017:1863) applied to the INVERSE assertion. */
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, "");

const RETIRE_SQL =
  // NOTE (finding): the parameter is `p_filing_id` (0007:1434), NOT `p_filing`.
  `select clara.retire_document_filing(p_filing_id => $1, p_reason => $2,
     p_expected_revision => $3, p_op_key => $4) as r`;

const PUBLISH_SQL =
  `select clara.publish_wiki_page_version(p_client => $1, p_slug => $2,
     p_page_kind => 'profile', p_title => 'Boundary', p_counterparty => null,
     p_content => $3, p_content_sha256 => $4, p_storage_key => $5,
     p_citations => $6::jsonb, p_refs => '[]'::jsonb,
     p_synthesis => 'deterministic', p_engine_id => null,
     p_projected_from_seq => null, p_op_key => $7) as r`;

const filingRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [id])).rows[0].r;

const assertLiveBlockerToken = (src) =>
  assert.ok(norm(src).includes("livecitationblockers"),
    "retire_document_filing keeps the journal-entry live-blocker (0007:1449-1456)");

/** The publication params for `slug` on `client` citing `document`. */
const pubParams = (firm, client, slug, document, tag) => {
  const content = `# ${slug}\nboundary probe`;
  const digest = shaHex(content);
  return [client, slug, content, digest, wikiKey(firm, client, digest),
    JSON.stringify([{ source_kind: "document", document_id: document }]), opk(tag)];
};

/** Drive the consumer lane's DB half: the retirement event's seq → the pinned
 *  `wikistale:<client>:<seq>` op key → mark_wiki_citations_stale. */
async function consumeRetirement(firm, client, document) {
  const evs = await eventsOf(firm, "document.filing_retired", document);
  assert.ok(evs.length >= 1, "the retirement emitted document.filing_retired (0007:1462 / 0009:2561-2563)");
  const seq = Number(evs[evs.length - 1].seq);
  return markStale({ client, document, opKey: staleOpKey(client, seq) });
}

const citesOfCurrent = async (client, slug) => {
  const page = await pageRow(client, slug);
  return page ? citationRows(page.current_version_id) : [];
};

before(async () => {
  live = await wbEnsureReady19();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0019-veto"); await endPool(); });

test("META: 0019 applied — the wiki authority boundary battery is armed", async () => {
  fail0019(live);
  assert.equal(CLR_WIKI, "CLR32", "the wiki family SQLSTATE is 'CLR32' (the contract's §5 code)");
  const migs = await rootQuery("select version from clara.schema_migrations where version ~ '^0019_'");
  assert.equal(migs.rows.length, 1, `exactly one applied 0019_* migration (got ${migs.rows.map((x) => x.version).join(",")})`);
});

test("[0019 §1/§9]: the veto helper is DROPPED — to_regprocedure resolves to NULL", async () => {
  fail0019(live);
  // §9 amendment 7: to_regprocedure, NOT to_regproc — to_regproc takes a bare
  // name and errors/misresolves on an argument list (the 0011:4132-4136 precedent).
  const r = await rootQuery(
    "select to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') as reg");
  assert.equal(r.rows[0].reg, null,
    "clara._assert_filing_wiki_unreferenced is GONE (the only reader of wiki tables among authority fns)");
  const anyOverload = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_assert_filing_wiki_unreferenced'");
  assert.equal(anyOverload.rows.length, 0, "…and no overload of that name survives either");
});

test("[0019 §1/§9]: both authority bodies lost the veto and KEPT a client-row lock + CLR11, before the retirement UPDATE", async () => {
  fail0019(live);
  for (const fn of ["retire_document_filing", "approve_wrong_client_correction"]) {
    const n = norm(await fnSource(fn));
    assert.ok(n.length > 0, `${fn} exists`);
    assert.ok(!n.includes("_assert_filing_wiki_unreferenced"),
      `${fn} no longer calls the veto helper (normalized-source scan)`);
    // [D19-1] the lock's shape is not pinned beyond "clara.clients ... for update".
    const lock = n.search(/clara\.clients[^;]*forupdate/);
    assert.ok(lock >= 0, `${fn} retains a plain clara.clients ... for update serializer (§1: the lock, not the veto)`);
    const upd = n.indexOf("updateclara.document_filingssetretired_at");
    assert.ok(upd >= 0, `${fn} still performs the retirement UPDATE`);
    assert.ok(lock < upd,
      `${fn}: the client-row lock PRECEDES the retirement UPDATE (the 0017 pins' ordering idiom, preserved for the lock)`);
    assert.ok(n.slice(lock, upd).includes("clr11"),
      `${fn}: the lock carries its not-found CLR11 refusal at that position`);
  }
});

test("[0019 §1/§9]: the PER-FUNCTION non-wiki blockers survive the patch (never both-in-both)", async () => {
  fail0019(live);
  const ret = norm(await fnSource("retire_document_filing"));
  assert.ok((ret.match(/clr17/g) ?? []).length >= 2,
    "retire_document_filing keeps BOTH CLR17 guards (already-retired 0007:1447 + stale-revision 0007:1448)");
  assert.ok(ret.includes("livecitationblockers"),
    "retire_document_filing keeps the journal-entry live-blocker (0007:1449-1456)");
  const cor = norm(await fnSource("approve_wrong_client_correction"));
  assert.ok(cor.includes("sourcefilingisnolongeractive") && cor.includes("clr19"),
    "approve_wrong_client_correction keeps its CLR19 source-filing guard (0009:2456)");
  assert.ok(!ret.includes("sourcefilingisnolongeractive"),
    "…and the retirement body did NOT inherit the correction's guard (per-function, not both-in-both)");
});

test("[R2-F2a INVERTED]: retiring a filing under a LIVE wiki citation now SUCCEEDS; the source goes stale and lint surfaces it", async () => {
  fail0019(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "d19-f2a", title: "F2a",
    citations: [{ source_kind: "document", document_id: d.documentId }],
  });
  const f = await filingRow(d.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  const r = await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 f2a: retirement proceeds in the authority domain",
    expectedRevision: f.revision_token,
  });
  assert.ok(r !== undefined, "the retirement PROCEEDS — the veto no longer refuses (WB-R21)");
  assert.ok((await filingRow(d.filingId)).retired_at, "the filing is retired");
  const before1 = await citesOfCurrent(w.clients.A1, "d19-f2a");
  assert.equal(before1.filter((c) => c.document_id === d.documentId)[0]?.stale_at, null,
    "the citation is still UNMARKED until the consumer runs (the mark is event-driven, not in-txn)");
  const receipt = await consumeRetirement(w.firms.A, w.clients.A1, d.documentId);
  assert.equal(receipt.status, "marked", `the consumer's mark reports 'marked' (got ${JSON.stringify(receipt)})`);
  assert.ok(Number(receipt.citations_marked) >= 1, "…and marked at least the live citation");
  const after1 = (await citesOfCurrent(w.clients.A1, "d19-f2a")).find((c) => c.document_id === d.documentId);
  assert.ok(after1.stale_at, "the live citation carries stale_at");
  assert.equal(after1.stale_reason, WB_STALE_REASON, "…with the single pinned reason");
  const page = await pageRow(w.clients.A1, "d19-f2a");
  assert.equal(page.state, "active", "the page is NOT retired or hidden — marked, never dropped (ADR-004)");
  const lint = await runClientLint({ client: w.clients.A1 });
  assert.notEqual(lint.status, "failed", `the belt did not degrade (receipt ${JSON.stringify(lint)})`);
  const finding = await openFinding(w.clients.A1, "stale_citation");
  assert.ok(finding, "a stale_citation finding opened (the visible half of WB-R21)");
  assert.equal(finding.dedupe_key, staleCiteKey(page.id, d.documentId), "the §6 dedupe grain");
});

test("[R2-F2b INVERTED]: a correction MOVE under a live citation SUCCEEDS; the SOURCE client's sources stale, the destination's do not", async () => {
  fail0019(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "d19-f2b", title: "F2b",
    citations: [{ source_kind: "document", document_id: d.documentId }],
  });
  // The correction lane RE-FILES to the destination, so the cardinal attribution
  // invariant demands an authoritative DESTINATION resolution first (the wb-r2
  // reconcile finding, carried forward verbatim).
  await freshResolution(w.users.alice, w.clients.A2, { subjectKind: "document", subjectId: d.documentId });
  const prev = await previewCorrection(w.users.alice, {
    document: d.documentId, fromClient: w.clients.A1, toClient: w.clients.A2 });
  const prop = await proposeCorrection(w.users.alice, {
    document: d.documentId, fromClient: w.clients.A1, toClient: w.clients.A2,
    reason: "0019 f2b: the move proceeds", opKey: opk("d19mv") });
  const applied = await approveCorrection(w.users.hana, {
    correction: prop?.correction_id ?? prop?.id ?? prop,
    planHash: prop?.plan_hash ?? prev?.plan_hash, opKey: opk("d19mva") });
  assert.ok(applied !== undefined, "the wrong-client correction MOVE proceeds (the veto no longer refuses)");
  // The destination is now the actively-filed client, so an A2 page may lawfully
  // cite the same document (its CLR02 floor passes).
  await publishWikiPage({
    client: w.clients.A2, firm: w.firms.A, slug: "d19-f2b-dest", title: "F2b dest",
    citations: [{ source_kind: "document", document_id: d.documentId }],
  });
  // The event carries client_id = x.from_client (0009:2561-2563) — the SOURCE.
  const evs = await eventsOf(w.firms.A, "document.filing_retired", d.documentId);
  const ev = evs[evs.length - 1];
  assert.equal(ev.client_id, w.clients.A1,
    "the correction's document.filing_retired names the SOURCE client (the citing client whose provenance goes stale)");
  const receipt = await consumeRetirement(w.firms.A, w.clients.A1, d.documentId);
  assert.equal(receipt.status, "marked", `the source client's sources are marked (got ${JSON.stringify(receipt)})`);
  const src = (await citesOfCurrent(w.clients.A1, "d19-f2b")).find((c) => c.document_id === d.documentId);
  assert.ok(src.stale_at, "the SOURCE client's citation is stale");
  const dest = (await citesOfCurrent(w.clients.A2, "d19-f2b-dest")).find((c) => c.document_id === d.documentId);
  assert.equal(dest.stale_at, null,
    "the DESTINATION client's citation is untouched — the mark is (firm, client, document)-scoped");
});

test("[R2-F2c REWRITE / ordering 1]: PUBLICATION acquires the client row first — retirement BLOCKS, then BOTH succeed and the page ends STALE", async () => {
  fail0019(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const f = await filingRow(d.filingId);
  const c1 = await getPool().connect(); // publication (runtime)
  const c2 = await getPool().connect(); // retirement (human)
  const out = { pub: null, ret: null };
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("set statement_timeout = '20s'"); // hang bound only
    await c1.query("begin");
    await c1.query(PUBLISH_SQL, pubParams(w.firms.A, w.clients.A1, "d19-f2c-1", d.documentId, "d19p1"));

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("set statement_timeout = '20s'");
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: w.users.alice, role: "authenticated" })]);
    const p2 = c2.query(RETIRE_SQL, [d.filingId, "0019 f2c-1 retire", f.revision_token, opk("d19r1")])
      .then(() => { out.ret = { ok: true }; })
      .catch((e) => { out.ret = { ok: false, code: e.code, msg: e.message }; });
    // [D19-2] THE hazard pin: with the §1 client-row lock PRESENT the retirement
    // cannot proceed — and therefore cannot emit its event — until the
    // publication commits. Remove the lock and this block disappears, which is
    // exactly the "validated-but-uncommitted publication, consumer marks zero,
    // then commits an unmarked citation" hole §10/§11 name.
    await waitBlockedByOrThrow(pid2, pid1, { what: "the clara.clients row lock held by the publication" });

    await c1.query("commit").then(() => { out.pub = { ok: true }; }, (e) => { out.pub = { ok: false, code: e.code }; });
    await p2;
    if (out.ret?.ok) await c2.query("commit").catch((e) => { out.ret = { ok: false, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  assert.deepEqual(out.pub, { ok: true }, "publication-first: the publication COMMITS");
  assert.deepEqual(out.ret, { ok: true },
    `publication-first: the retirement then acquires the lock and ALSO succeeds (got ${JSON.stringify(out.ret)})`);
  // The invariant is NO UNMARKED INVALID END STATE — not "both always succeed".
  const receipt = await consumeRetirement(w.firms.A, w.clients.A1, d.documentId);
  assert.ok(Number(receipt.citations_marked) >= 1,
    `the consumer marked NON-ZERO — the serialized publication was visible to it (got ${JSON.stringify(receipt)})`);
  const cite = (await citesOfCurrent(w.clients.A1, "d19-f2c-1")).find((c) => c.document_id === d.documentId);
  assert.ok(cite?.stale_at, "the page ends STALE — the both-ok interleaving is lawful only WITH the mark");
});

test("[R2-F2c REWRITE / ordering 2]: RETIREMENT acquires the client row first — it succeeds and the publication FAILS CLR02", async () => {
  fail0019(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const f = await filingRow(d.filingId);
  const c1 = await getPool().connect(); // publication (runtime)
  const c2 = await getPool().connect(); // retirement (human)
  const out = { pub: null, ret: null };
  try {
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("set statement_timeout = '20s'");
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: w.users.alice, role: "authenticated" })]);
    await c2.query(RETIRE_SQL, [d.filingId, "0019 f2c-2 retire", f.revision_token, opk("d19r2")]);

    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("set statement_timeout = '20s'");
    await c1.query("begin");
    const p1 = c1.query(PUBLISH_SQL, pubParams(w.firms.A, w.clients.A1, "d19-f2c-2", d.documentId, "d19p2"))
      .then(() => { out.pub = { ok: true }; })
      .catch((e) => { out.pub = { ok: false, code: e.code, msg: e.message }; });
    await waitBlockedByOrThrow(pid1, pid2, { what: "the clara.clients row lock held by the retirement" });

    await c2.query("commit").then(() => { out.ret = { ok: true }; }, (e) => { out.ret = { ok: false, code: e.code }; });
    await p1;
    if (out.pub?.ok) await c1.query("commit").catch((e) => { out.pub = { ok: false, code: e.code }; });
    else await c1.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  assert.deepEqual(out.ret, { ok: true }, "retirement-first: the retirement succeeds");
  assert.equal(out.pub?.ok, false, `retirement-first: the publication must NOT commit (got ${JSON.stringify(out.pub)})`);
  assert.equal(out.pub?.code, CLR.provenance,
    `…it fails the active-filing floor CLR02 (0017:2115-2121 / 2157-2163), got ${out.pub?.code} — ${out.pub?.msg}`);
  assert.equal(await pageRow(w.clients.A1, "d19-f2c-2"), null,
    "no page exists — the refusal rolled the whole publication back");
});

test("[0019 §1]: the retirement path's own refusals are UNCHANGED — already-retired, stale revision, live journal entry", async () => {
  fail0019(live);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  // (a) stale revision.
  const a = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await assertRaises("CLR17", () => retireDocumentFiling(w.users.alice, {
    filing: a.filingId, reason: "0019 stale revision probe", expectedRevision: w.clients.A1,
  }), "a stale expected_revision (0007:1448)");
  // (b) already retired.
  const fa = await filingRow(a.filingId);
  await retireDocumentFiling(w.users.alice, {
    filing: a.filingId, reason: "0019 first retire", expectedRevision: fa.revision_token });
  const fa2 = await filingRow(a.filingId);
  await assertRaises("CLR17", () => retireDocumentFiling(w.users.alice, {
    filing: a.filingId, reason: "0019 second retire", expectedRevision: fa2.revision_token,
  }), "an already-retired filing (0007:1447)");
  // (c) the journal-entry live blocker (0007:1449-1456) keeps its BEHAVIOURAL
  // coverage in the §10 "VERIFY UNCHANGED" set — rig-docs-retention /
  // rig-docs-correction / rig-docs-filings-provenance — which stages a genuinely
  // filing-bound entry through the audited drafter (a raw insert cannot: the
  // 0007:858 CHECK pairs document_id with filing_id and the 0007:971 trigger
  // validates filing↔document congruence). Here the assertion is structural: the
  // patch did not remove the blocker from the body.
  assertLiveBlockerToken(await fnSource("retire_document_filing"));
});

test("[0019 §8]: Gate-W2's two-known-deviations allowance is RETIRED — zero authority fns reference wiki relations", async () => {
  fail0019(live);
  // The interim WB-R21 disposition recorded retire_document_filing +
  // approve_wrong_client_correction as a closed set of exactly TWO known
  // deviations. Post-0019 the audit expects ZERO exceptions.
  const r = await rootQuery(`
    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara'
       and p.proname in ('retire_document_filing','approve_wrong_client_correction')
       and (p.prosrc ~* '\\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\\M'
            or p.prosrc ~* '\\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|mark_wiki_citations_stale|_assert_filing_wiki_unreferenced)\\M')`);
  assert.equal(r.rows.length, 0,
    `the two former deviations now carry NEITHER a wiki relation token NOR a call edge into the wiki set: ${r.rows.map((x) => x.proname).join(",")}`);
});
