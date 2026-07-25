// Wave-B battery — migration 0019 §5/§10: THE MONOTONIC `projected_from_seq`
// GUARD as a TYPED TERMINAL refusal (CLR32 / stale_projected_from_seq) on the
// supersede branch of `_publish_wiki_page_version_core`, with the full six-part
// functional rollback probe. CONTRACT-BLIND; FAILS below 0019.
//
// CODE NOTE: "CLR32" in the contract is the RAW SQLSTATE — the as-built WIKI
// family. wb-helpers exports it as CLR31 (design-doc label, value "CLR32"); the
// export named CLR32 has the value "CLR33" (lint). Imported here as CLR_WIKI and
// value-asserted in META so the collision cannot silently mis-assert.
//
// AMBIGUITIES this lane encodes:
//   [D19-8]  §5 pins `p_projected_from_seq <= prior.projected_from_seq` → refuse.
//            EQUAL is therefore a REFUSAL, not a pass. Asserted explicitly,
//            because "stale" colloquially reads as strictly-older and a `<`
//            implementation would leave the two-writer race open.
//   [D19-9]  §5 requires the refusal on the SUPERSEDE branch only, and says the
//            new-page branch and a null p_projected_from_seq both bypass. The
//            third NULL case — the PRIOR version's projected_from_seq being null
//            (every deterministic-ingest page, 0017:2264-2269) — is stated as a
//            guard condition ("the prior published version's projected_from_seq
//            is not null") and is asserted as a PUBLISH, not a refusal.
//            [0020 A5] The VEHICLE for that assertion moved. A5 reserves the
//            'sources/' slug namespace for deterministic ingest, so
//            publish_wiki_page_version can no longer supersede a source page. The
//            null-PRIOR case is proven on a non-source page published with a null
//            seq — the identical guard branch — and the old route is asserted as
//            the A5 refusal instead. Worth stating plainly: post-A5 a NON-NULL new
//            seq over an INGEST-MADE null prior is unreachable in production, since
//            the only writer permitted in that namespace passes null itself.
//   [D19-10] §5's rollback probe says "in a forced-rollback subtransaction". Here
//            each refused attempt IS its own autocommit statement, so the raise
//            rolls the whole statement back by construction — a stronger and
//            simpler staging than a nested savepoint, and the one the six
//            negative assertions are read against.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR31 as CLR_WIKI, ROLES, opk, getPool,
  assertRaises, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, has0020, fnSource, detailReason, waitBlockedByOrThrow,
  buildWaveBWorld, createClient, filedDocument,
  publishWikiPage, recordWikiIngest, pageRow, versionRows, wikiLogRows,
  auditRowsFor, opReceiptRow, eventsOf, shaHex, wikiKey,
} from "./wb-fixtures.mjs";

const PUB_FN = "publish_wiki_page_version";

let live = false;
let w = null;
let c1 = null; // the guard fixture client

const PUBLISH_SEQ_SQL =
  `select clara.publish_wiki_page_version(p_client => $1, p_slug => $2,
     p_page_kind => 'profile', p_title => 'Guard', p_counterparty => null,
     p_content => $3, p_content_sha256 => $4, p_storage_key => $5,
     p_citations => '[{"source_kind":"human_note","detail":{"note":"guard"}}]'::jsonb,
     p_refs => '[]'::jsonb, p_synthesis => 'deterministic', p_engine_id => null,
     p_projected_from_seq => $6::bigint, p_op_key => $7) as r`;

const seqParams = (client, slug, body, seq, tag) => {
  const content = `# ${slug}\n${body}`;
  const digest = shaHex(content);
  return [client, slug, content, digest, wikiKey(w.firms.A, client, digest), seq, opk(tag)];
};

const pub = (client, slug, over = {}) => publishWikiPage({
  client, firm: w.firms.A, slug, title: "Guard", ...over });

before(async () => {
  live = await wbEnsureReady19();
  if (!live) return;
  w = await buildWaveBWorld();
  c1 = await createClient(w.users.alice, { name: `d19g_${opk("x")}`, opKey: opk("cli") });
});
after(async () => { printLaneNotes("wb-0019-guard"); await endPool(); });

test("META: 0019 applied — the monotonic-guard battery is armed", async () => {
  fail0019(live);
  assert.equal(CLR_WIKI, "CLR32", "the contract's §5 'CLR32' is the as-built WIKI family SQLSTATE");
  assert.ok(c1, "a dedicated guard client is staged");
});

test("[0019 §5/§9]: the guard is PRESENT in _publish_wiki_page_version_core (reason literal + the supersede comparison)", async () => {
  fail0019(live);
  const src = await fnSource("_publish_wiki_page_version_core");
  assert.ok(src.length > 0, "the publication core exists");
  assert.ok(src.includes("stale_projected_from_seq"), "the typed reason literal is in the core's body");
  assert.ok(/projected_from_seq/.test(src), "the core compares projected_from_seq");
  assert.ok(src.includes("CLR32"), "…and raises the wiki-family SQLSTATE");
  // The wrapper's op-key dedupe still hashes projected_from_seq (0017:2205-2211),
  // so the guard governs only a DIFFERENT-key stale-seq write.
  assert.ok((await fnSource(PUB_FN)).includes("projected_from_seq"),
    "publish_wiki_page_version still hashes projected_from_seq into its reservation");
});

test("[0019 §5]: an OLDER-seq supersede with a fresh op key raises CLR32 / stale_projected_from_seq", async () => {
  fail0019(live);
  await pub(c1, "d19-g-older", { content: "# v1 at 100", projectedFromSeq: 100 });
  const err = await assertRaises(CLR_WIKI, () => pub(c1, "d19-g-older", {
    content: "# v2 at 99", projectedFromSeq: 99, opKey: opk("d19gold"),
  }), "a supersede at a seq OLDER than the prior published version's");
  assert.equal(detailReason(err), "stale_projected_from_seq",
    `the refusal is typed with the pinned reason (detail: ${err.detail})`);
});

test("[0019 §5/D19-8]: an EQUAL seq also refuses — the comparison is <=, not <", async () => {
  fail0019(live);
  await pub(c1, "d19-g-equal", { content: "# v1 at 200", projectedFromSeq: 200 });
  const err = await assertRaises(CLR_WIKI, () => pub(c1, "d19-g-equal", {
    content: "# v2 at 200", projectedFromSeq: 200, opKey: opk("d19geq"),
  }), "a supersede at the SAME seq as the prior published version");
  assert.equal(detailReason(err), "stale_projected_from_seq", "…with the same typed reason");
  // …and a strictly NEWER seq still publishes (the guard is additive, not a wall).
  await pub(c1, "d19-g-equal", { content: "# v2 at 201", projectedFromSeq: 201, opKey: opk("d19gnew") });
  const page = await pageRow(c1, "d19-g-equal");
  const vs = await versionRows(page.id);
  assert.equal(vs.length, 2, "exactly two versions — the newer-seq write superseded");
  assert.equal(Number(vs[1].projected_from_seq), 201, "the current version carries the newer seq");
});

test("[0019 §5]: the SIX-PART functional rollback probe — nothing at all survives the refusal", async () => {
  fail0019(live);
  await pub(c1, "d19-g-rollback", { content: "# v1 at 300", projectedFromSeq: 300 });
  const page = await pageRow(c1, "d19-g-rollback");
  const before1 = {
    versions: await versionRows(page.id),
    logs: (await wikiLogRows(c1)).length,
    events: (await eventsOf(w.firms.A, "wiki.page_published", page.id)).length,
    audits: (await auditRowsFor(PUB_FN)).length,
  };
  const key = opk("d19groll");
  await assertRaises(CLR_WIKI, () => pub(c1, "d19-g-rollback", {
    content: "# v2 at 250", projectedFromSeq: 250, opKey: key,
  }), "the stale-seq supersede under a KNOWN op key");

  const after1 = await versionRows(page.id);
  // (1) no new version row; (2) the prior version is STILL 'published'.
  assert.equal(after1.length, before1.versions.length, "(1) NO new wiki_page_versions row");
  assert.equal(after1[after1.length - 1].state, "published",
    "(2) the prior version is still 'published', never flipped to 'superseded'");
  assert.equal(JSON.stringify(after1), JSON.stringify(before1.versions), "…the version rows are byte-identical");
  // (3) no audit_log row for the publish wrapper under that op key.
  assert.equal((await auditRowsFor(PUB_FN, key)).length, 0, "(3) NO audit_log row for that op key");
  assert.equal((await auditRowsFor(PUB_FN)).length, before1.audits, "…and none at all was added");
  // (4) no wiki_log row (publish OR supersede) for that attempt.
  assert.equal((await wikiLogRows(c1)).length, before1.logs, "(4) NO wiki_log row (neither 'publish' nor 'supersede')");
  // (5) no wiki.page_published domain event for that attempt.
  assert.equal((await eventsOf(w.firms.A, "wiki.page_published", page.id)).length, before1.events,
    "(5) NO wiki.page_published event — the wrapper's side effects never ran");
  // (6) NO op_receipts row AT ALL — stronger than "no completed receipt": the
  // reservation is inserted before the core runs (0004:48-52), so the raise rolls
  // the reservation back too.
  assert.equal(await opReceiptRow(PUB_FN, key), null, "(6) NO op_receipts row at all for that op key");
});

test("[0019 §5]: NULL-SAFE — the new-page branch, a null p_projected_from_seq, and a null-seq PRIOR all still publish", async () => {
  fail0019(live);
  // (i) the new-page branch has no prior — any seq publishes.
  await pub(c1, "d19-g-null-new", { content: "# fresh page at 1", projectedFromSeq: 1 });
  assert.ok(await pageRow(c1, "d19-g-null-new"), "(i) a brand-new page publishes at any seq (no prior to compare)");
  // (ii) a null p_projected_from_seq bypasses the guard even against a high prior.
  await pub(c1, "d19-g-null-arg", { content: "# v1 at 500", projectedFromSeq: 500 });
  await pub(c1, "d19-g-null-arg", { content: "# v2 with a null seq", projectedFromSeq: null, opKey: opk("d19gna") });
  const argPage = await pageRow(c1, "d19-g-null-arg");
  assert.equal((await versionRows(argPage.id)).length, 2,
    "(ii) a null p_projected_from_seq publishes — deterministic ingest must never be blocked");
  // (iii/[D19-9]) a PRIOR whose projected_from_seq is null is not comparable, so the guard
  // bypasses. The vehicle is a NON-source page published with a null seq, which reaches the
  // identical branch (`pv.projected_from_seq is not null` fails ⇒ no refusal).
  //
  // [D19-9 / 0020 A5] It USED to be an ingest-made source page. 0020 amendment A5 RESERVES
  // the 'sources/' slug namespace for deterministic ingest, so publish_wiki_page_version can
  // no longer supersede a source page — see (iv). The prior-side null case is unchanged and
  // still fully reachable; only the vehicle moved. Note what A5 also means: a non-null new
  // seq over an INGEST-made null prior is now unreachable in production entirely, because the
  // only writer that may touch that slug passes null itself.
  await pub(c1, "d19-g-null-prior", { content: "# v1 with a null seq", projectedFromSeq: null });
  const nullPriorPage = await pageRow(c1, "d19-g-null-prior");
  assert.equal((await versionRows(nullPriorPage.id))[0].projected_from_seq, null,
    "the prior version carries a NULL projected_from_seq");
  await pub(c1, "d19-g-null-prior", {
    content: "# republished over a null-seq prior", projectedFromSeq: 1, opKey: opk("d19gnp") });
  assert.equal((await versionRows(nullPriorPage.id)).length, 2,
    "(iii) a supersede over a NULL-seq prior publishes — the guard is null-safe on BOTH sides");

  // (iv) the deterministic-ingest page itself: its version still carries a null seq (the 0019
  // fact), and under 0020 A5 the reserved namespace is what now refuses the old vehicle.
  const src = await filedDocument(w.users.alice, { firm: w.firms.A, client: c1, kind: "bank_statement" });
  await recordWikiIngest({ client: c1, document: src.documentId });
  const ingestPage = await pageRow(c1, `sources/${src.documentId}`);
  assert.ok(ingestPage, "the deterministic ingest minted its source page");
  assert.equal((await versionRows(ingestPage.id))[0].projected_from_seq, null,
    "…whose version carries a NULL projected_from_seq (0017:2264-2269, unchanged by A5)");
  if (await has0020()) {
    const err = await assertRaises(CLR_WIKI, () => pub(c1, `sources/${src.documentId}`, {
      pageKind: "period_context", content: "# a synthesized supersede of a source page",
      projectedFromSeq: 1, opKey: opk("d19gnp2") }),
      "publish_wiki_page_version superseding a deterministic source page under 0020 A5");
    assert.equal(detailReason(err), "reserved_slug_namespace",
      "(iv) A5: the sources/ namespace belongs to deterministic ingest — the refusal is the"
      + " NAMESPACE reservation, not the monotonic guard, and it fires BEFORE any seq comparison");
    assert.equal((await versionRows(ingestPage.id)).length, 1, "…and nothing was written");
  } else {
    await pub(c1, `sources/${src.documentId}`, {
      pageKind: "period_context", content: "# republished over a null-seq prior",
      projectedFromSeq: 1, opKey: opk("d19gnp2") });
    assert.equal((await versionRows(ingestPage.id)).length, 2,
      "(iv) pre-A5: the namespace is unreserved, so the old vehicle still supersedes");
  }
});

test("[0019 §5]: op_key dedupe is UNCHANGED — a same-key redelivery replays byte-identically, it never trips the guard", async () => {
  fail0019(live);
  const key = `wikiproj:${c1}:600`;
  const args = { content: "# dedupe at 600", projectedFromSeq: 600, opKey: key };
  await pub(c1, "d19-g-dedupe", args);
  const r1 = await pub(c1, "d19-g-dedupe", args);
  const r2 = await pub(c1, "d19-g-dedupe", args);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2),
    "the seq-embedded op_key replays byte-identically (a dedupe hit returns BEFORE the core is called, 0017:2205-2211)");
  const page = await pageRow(c1, "d19-g-dedupe");
  assert.equal((await versionRows(page.id)).length, 1, "exactly one version minted across three identical calls");
});

test("[0019 §10]: two-session same-window double writer — exactly ONE publishes, the stale-seq session refuses CLR32", async () => {
  fail0019(live);
  const c = await createClient(w.users.alice, { name: `d19grace_${opk("x")}`, opKey: opk("cli") });
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "d19-g-race", title: "Guard",
    content: "# race v1 at 700", projectedFromSeq: 700 });
  const s1 = await getPool().connect();
  const s2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    const pid1 = (await s1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await s1.query(`set role ${ROLES.runtime}`);
    await s1.query("set statement_timeout = '20s'");
    await s1.query("begin");
    await s1.query(PUBLISH_SEQ_SQL, seqParams(c, "d19-g-race", "session A at 701", 701, "d19gra"));

    const pid2 = (await s2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await s2.query(`set role ${ROLES.runtime}`);
    await s2.query("set statement_timeout = '20s'");
    await s2.query("begin");
    const p2 = s2.query(PUBLISH_SEQ_SQL, seqParams(c, "d19-g-race", "session B at 701", 701, "d19grb"))
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code, reason: e.detail ?? e.message }; });
    // Both sessions observed the SAME old value (700) before either committed —
    // the exact window the app-side currentProjectedSeq re-check cannot close.
    await waitBlockedByOrThrow(pid2, pid1, { what: "the clara.clients / wiki_pages row locks held by session A" });

    await s1.query("commit").then(() => { out.a = { ok: true }; }, (e) => { out.a = { ok: false, code: e.code }; });
    await p2;
    if (out.b?.ok) await s2.query("commit").catch((e) => { out.b = { ok: false, code: e.code }; });
    else await s2.query("rollback").catch(() => {});
  } finally {
    for (const s of [s1, s2]) {
      await s.query("rollback").catch(() => {});
      await s.query("reset role").catch(() => {});
      await s.query("reset all").catch(() => {});
      s.release();
    }
  }
  assert.deepEqual(out.a, { ok: true }, "session A publishes");
  assert.equal(out.b?.ok, false, `session B must NOT publish a duplicate version (got ${JSON.stringify(out.b)})`);
  assert.equal(out.b?.code, CLR_WIKI,
    `session B refuses with the typed guard, not a silent converge (got ${out.b?.code} / ${out.b?.reason})`);
  assert.match(String(out.b?.reason ?? ""), /stale_projected_from_seq/,
    "…naming stale_projected_from_seq, so the runtime can map it to already_projected rather than skipped_bad_state");
  const page = await pageRow(c, "d19-g-race");
  const vs = await versionRows(page.id);
  assert.equal(vs.length, 2, "EXACTLY one new version exists — the duplicate-version race is structurally closed");
  assert.equal(Number(vs[1].projected_from_seq), 701, "…carrying session A's seq");
});
