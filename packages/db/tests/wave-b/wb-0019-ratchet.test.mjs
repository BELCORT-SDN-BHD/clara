// Wave-B battery — migration 0019 RATCHET R1 HARDENING. FAILS (never skips) below 0019.
//
// PROVENANCE — READ THIS BEFORE TREATING IT LIKE ITS SIBLINGS. Every other wb-0019-*
// lane is CONTRACT-BLIND: written from docs/plan/wave-b-migration-0019-design.md v1.0
// with the SQL unread (ADR-029 discipline), so a divergence there is a finding about the
// build. This file is the OPPOSITE and deliberately so — it was written AFTER a
// cross-model adversarial review of the as-built 0019 returned NOT-MERGEABLE, from the
// ADJUDICATED fixes for its findings. It pins mechanisms (which row is locked, in which
// order, at which isolation level) that no contract sentence could have specified,
// because the contract legislates OUTCOMES and these are the mechanisms that make the
// outcomes reachable. Keeping it separate keeps the blind lanes' provenance honest.
//
// The four findings it closes:
//   R1-1 (HIGH)   the writer's select-then-update race: eligibility was SAMPLED, not
//                 LOCKED, so a concurrent republish could mark a now-SUPERSEDED-version
//                 citation and a concurrent retire_wiki_page could mark a RETIRED page's
//                 rows — both of which §3 says are NEVER touched.
//   R1-2 (HIGH)   the client-row lock does NOT order publication against retirement under
//                 REPEATABLE READ (a lock without an UPDATE is not a serialization
//                 failure), so a pinned-snapshot publisher could commit a permanently
//                 UNMARKED citation to an already-retired filing.
//   R1-4 (MEDIUM) the §9 closed-set scan filtered on `prosecdef`, so a SECURITY INVOKER
//                 helper reading wiki_pages — reachable from a patched definer, and
//                 running with that definer's authority — was invisible to it.
//   R1-5 (LOW)    the drift guard proved "the client lock precedes the retirement UPDATE",
//                 which is also true of the order that DEADLOCKS.
//
// The two-session cells follow the rig convention exactly (wb-0019-guard.test.mjs:188):
// raw pooled connections, an explicit `begin`, a PROVEN block via waitBlockedByOrThrow
// (never a sleep), and `rollback`/`reset role`/`reset all` before release. Each cell is a
// genuine regression proof — against the PRE-fix bodies the writer took no lock at all,
// so the block would never be observed and waitBlockedByOrThrow would throw.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR31 as CLR_WIKI, ROLES, rootQuery, opk, getPool,
  endPool, printLaneNotes,
  fail0019, wbEnsureReady19, fnSource, waitBlockedByOrThrow,
  buildWaveBWorld, createClient, filedDocument,
  publishWikiPage, pageRow, versionRows, citationRows, refRows, pageCitationRows,
  shaHex, wikiKey, WB_STALE_REASON, WB_0019_WHITELIST_SIGS, authorizedWikiCallerFacts,
} from "./wb-fixtures.mjs";

const CORE_SIG = "clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,"
  + "text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)";

/** Whitespace-stripped, lower-cased prosrc — the 0017 drift-guard idiom (0017:1863). */
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, "");

const PUBLISH_SQL =
  `select clara.publish_wiki_page_version(p_client => $1, p_slug => $2,
     p_page_kind => 'profile', p_title => 'Ratchet', p_counterparty => null,
     p_content => $3, p_content_sha256 => $4, p_storage_key => $5,
     p_citations => $6::jsonb, p_refs => $7::jsonb,
     p_synthesis => 'deterministic', p_engine_id => null,
     p_projected_from_seq => null, p_op_key => $8) as r`;

const MARK_SQL =
  `select clara.mark_wiki_citations_stale(p_client => $1, p_document => $2,
     p_reason => $3, p_op_key => $4) as r`;

const cite = (d) => JSON.stringify([{ source_kind: "document", document_id: d }]);
const docRef = (d) => JSON.stringify([{ ref_kind: "document", document_id: d }]);

/** publish_wiki_page_version params for `slug` on `client`, citing + reffing `document`. */
const pubParams = (firm, client, slug, document, content, tag) => {
  const digest = shaHex(content);
  return [client, slug, content, digest, wikiKey(firm, client, digest),
    cite(document), docRef(document), opk(tag)];
};

/** A pooled connection impersonating `role`, with a bounded statement_timeout. */
async function session(role, { jwtSub = null } = {}) {
  const c = await getPool().connect();
  await c.query(`set role ${role}`);
  if (jwtSub) {
    await c.query("select set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub: jwtSub, role: "authenticated" })]);
  }
  await c.query("set statement_timeout = '20s'");
  const pid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
  return { c, pid };
}

async function closeSessions(...sessions) {
  for (const s of sessions) {
    if (!s) continue;
    await s.c.query("rollback").catch(() => {});
    await s.c.query("reset role").catch(() => {});
    await s.c.query("reset all").catch(() => {});
    s.c.release();
  }
}

let live = false;
let w = null;

before(async () => {
  live = await wbEnsureReady19();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0019-ratchet"); await endPool(); });

test("META: 0019 applied — the ratchet-hardening lane is armed", async () => {
  fail0019(live);
  assert.equal(CLR_WIKI, "CLR32", "the wiki family SQLSTATE is 'CLR32'");
});

// ===========================================================================
// R1-1 — eligibility is LOCKED, not sampled.
// ===========================================================================

test("[R1-1 · two-session] REPUBLISH vs MARK: the writer blocks on the client row, then marks the NEW current version — the superseded citation is NEVER touched", async () => {
  fail0019(live);
  const client = await createClient(w.users.alice, { name: `d19r_rp_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "invoice" });
  await publishWikiPage({
    client, firm: w.firms.A, slug: "d19r-republish", title: "Ratchet",
    content: "# ratchet v1", citations: [{ source_kind: "document", document_id: d.documentId }],
    refs: [{ ref_kind: "document", document_id: d.documentId }],
  });
  const page = await pageRow(client, "d19r-republish");
  const v1 = page.current_version_id;

  let s1 = null, s2 = null;
  const out = { mark: null };
  try {
    // Session 1: a clean REPUBLISH. It takes clients FOR UPDATE (0017:2049-2053) and then
    // the page row, supersedes v1, and holds every lock until it commits.
    s1 = await session(ROLES.runtime);
    await s1.c.query("begin");
    await s1.c.query(PUBLISH_SQL,
      pubParams(w.firms.A, client, "d19r-republish", d.documentId, "# ratchet v2", "d19rrp"));

    // Session 2: the stale writer, issued WHILE session 1 still holds the client row.
    s2 = await session(ROLES.runtime);
    await s2.c.query("begin");
    const p2 = s2.c.query(MARK_SQL, [client, d.documentId, WB_STALE_REASON, opk("d19rrpm")])
      .then((r) => { out.mark = r.rows[0].r; })
      .catch((e) => { out.mark = { error: e.code, detail: e.detail ?? e.message }; });

    // THE regression proof: pre-fix the writer took no lock at all and would have
    // collected v1's citation id here and marked it outright.
    await waitBlockedByOrThrow(s2.pid, s1.pid, {
      what: "the clara.clients row lock held by the republishing session (0019 §3 LOCK 1)",
    });

    await s1.c.query("commit");
    await p2;
    await s2.c.query("commit");
  } finally {
    await closeSessions(s1, s2);
  }

  assert.ok(out.mark && !out.mark.error, `the mark completed (got ${JSON.stringify(out.mark)})`);
  const versions = await versionRows(page.id);
  assert.equal(versions.length, 2, "the republish landed a second version");
  const v2 = (await pageRow(client, "d19r-republish")).current_version_id;
  assert.notEqual(v2, v1, "…and it is the CURRENT version now");

  const all = await pageCitationRows(page.id);
  const oldCite = all.find((c) => c.version_id === v1);
  const newCite = all.find((c) => c.version_id === v2);
  assert.ok(oldCite && newCite, "both versions carry a citation to the document");
  assert.equal(oldCite.stale_at, null,
    "the SUPERSEDED version's citation is UNMARKED — §3: superseded-version citations are NEVER touched (this is the row the pre-fix collect-then-update marked)");
  assert.ok(newCite.stale_at,
    "…and the mark landed on the CURRENT version, re-evaluated under the locks");
  assert.equal(newCite.stale_reason, WB_STALE_REASON, "…with the single pinned reason");
  assert.equal(Number(out.mark.citations_marked), 1,
    "EXACTLY one citation was marked — not the superseded one as well");
});

test("[R1-1 · two-session] RETIRE-PAGE vs MARK: the writer blocks on the page row, then converges to a clean noop — a retired page's rows are NEVER touched", async () => {
  fail0019(live);
  const client = await createClient(w.users.alice, { name: `d19r_rt_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "invoice" });
  await publishWikiPage({
    client, firm: w.firms.A, slug: "d19r-retire", title: "Ratchet",
    content: "# ratchet retire", citations: [{ source_kind: "document", document_id: d.documentId }],
    refs: [{ ref_kind: "document", document_id: d.documentId }],
  });
  const page = await pageRow(client, "d19r-retire");

  let s1 = null, s2 = null;
  const out = { mark: null };
  try {
    // Session 1: retire_wiki_page. Since §3a it takes the CLIENT row FIRST (0019 §3a), then the
    // page row — so the writer (which also takes the client row first, LOCK 1) now blocks on the
    // shared CLIENT row here, not the page row. The re-evaluation still converges to a clean noop.
    s1 = await session(ROLES.authenticated, { jwtSub: w.users.alice });
    await s1.c.query("begin");
    await s1.c.query(
      "select clara.retire_wiki_page(p_page => $1, p_reason => $2, p_op_key => $3)",
      [page.id, "ratchet R1-1 retire-vs-mark", opk("d19rrt")]);

    s2 = await session(ROLES.runtime);
    await s2.c.query("begin");
    const p2 = s2.c.query(MARK_SQL, [client, d.documentId, WB_STALE_REASON, opk("d19rrtm")])
      .then((r) => { out.mark = r.rows[0].r; })
      .catch((e) => { out.mark = { error: e.code, detail: e.detail ?? e.message }; });

    await waitBlockedByOrThrow(s2.pid, s1.pid, {
      what: "the clara.clients row lock held by the retiring session (0019 §3 LOCK 1 — §3a made retire_wiki_page take the client row FIRST)",
    });

    await s1.c.query("commit");
    await p2;
    await s2.c.query("commit");
  } finally {
    await closeSessions(s1, s2);
  }

  assert.ok(out.mark && !out.mark.error, `the mark completed (got ${JSON.stringify(out.mark)})`);
  assert.equal((await pageRow(client, "d19r-retire")).state, "retired", "the page IS retired");
  assert.equal(out.mark.status, "noop",
    `the mark is a clean noop on a retired page (got ${JSON.stringify(out.mark)})`);
  assert.equal(Number(out.mark.citations_marked), 0, "…zero citations");
  assert.equal(Number(out.mark.refs_marked), 0, "…zero refs");
  const cites = await citationRows((await pageRow(client, "d19r-retire")).current_version_id);
  assert.equal(cites.filter((c) => c.stale_at !== null).length, 0,
    "the retired page's citations are UNMARKED — §3: retired-page rows are NEVER touched");
  assert.equal((await refRows(page.id)).filter((r) => r.stale_at !== null).length, 0,
    "…and so are its page-level document refs");
  const log = await rootQuery(
    "select count(*)::int as n from clara.wiki_log where client_id=$1 and action='mark_stale'", [client]);
  assert.equal(log.rows[0].n, 0, "a noop wrote NO wiki_log row (the positive-change-only posture survives the fix)");
});

test("[R1-1/R2-B1/R3-F1] the WIKI-PAGE lock graph is acyclic BY A SHARED PREFIX: EVERY wiki actor takes the clara.clients row before any wiki_pages row", async () => {
  fail0019(live);
  const writer = norm(await fnSource("mark_wiki_citations_stale"));
  const core = norm(await fnSource("_publish_wiki_page_version_core"));
  const retire = norm(await fnSource("retire_wiki_page"));

  // RATCHET R2 FINDING B1 — this cell USED to assert that retire_wiki_page takes NO client
  // row and is therefore "a LEAF in the wait-for graph". That reasoning was WRONG: after
  // locking its page row it calls _append_event, which upserts the firm's firm_event_seq
  // row (0005:482-484) — it holds a page while REQUESTING a shared per-firm row, the
  // textbook shape of a NON-leaf, and §3's added page lock closed a real cycle through it.
  // The fix is ordering, not argument: page retirement now takes client -> page like every
  // other wiki actor, so the reverse edge exists nowhere. All three are held to the SAME
  // rule below — no actor gets an exemption, and a future one must join the prefix too.
  //
  // RATCHET R3 FINDING F1 — what this shared prefix PROVES is bounded: the WIKI-PAGE lock
  // graph is acyclic among these three (each invoked one verb per transaction). It does NOT
  // prove the absence of the composed-transaction firm_event_seq <-> clients deadlock — a
  // pre-existing, schema-wide property of _append_event, retryable as 40P01, not introduced
  // by 0019 and with no instantiation in this one-verb-per-transaction system (0019 §3 header
  // residual). The assertions below prove exactly the client-before-page prefix, nothing more.
  for (const [name, src] of [
    ["mark_wiki_citations_stale", writer],
    ["_publish_wiki_page_version_core", core],
    ["retire_wiki_page", retire],
  ]) {
    const cl = src.search(/fromclara\.clients[a-z]*where[^;]*forupdate/);
    const pg = src.search(/fromclara\.wiki_pages[a-z]*where[^;]*forupdate/);
    assert.ok(cl >= 0, `${name} takes a clara.clients row FOR UPDATE`);
    assert.ok(pg >= 0, `${name} takes a clara.wiki_pages row FOR UPDATE`);
    assert.ok(cl < pg, `${name} takes the CLIENT row FIRST — the shared prefix that makes the graph acyclic`);
  }
  assert.ok(/fromclara\.wiki_pageswhereid=p_pageforupdate/.test(retire),
    "retire_wiki_page still locks the page row it retires");
  assert.ok(/orderbywp\.id/.test(writer),
    "the writer locks its page set in ASCENDING id order (two writers on one client are already excluded by the client row; the order is belt-and-braces)");
});

// ===========================================================================
// R1-2 — the isolation floor on the publication path.
// ===========================================================================

test("[R1-2] publication under REPEATABLE READ is REFUSED — typed CLR32/isolation_unsupported, on BOTH publishing wrappers", async () => {
  fail0019(live);
  const client = await createClient(w.users.alice, { name: `d19r_iso_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "invoice" });

  for (const [label, sql, params] of [
    ["publish_wiki_page_version", PUBLISH_SQL,
      pubParams(w.firms.A, client, "d19r-iso", d.documentId, "# iso rr", "d19riso")],
    // [0020 A6] p_note MUST be null. The deterministic-content floor refuses a non-null note
    // (CLR10 / source_note_not_permitted) in the WRAPPER, before the core's isolation floor is
    // reached. A noted probe would prove the note floor instead — the safety outcome is
    // identical (refused, nothing written), but the cell would stop testing what it names.
    ["record_wiki_source_ingest",
      "select clara.record_wiki_source_ingest(p_client => $1, p_document => $2, p_note => $3, p_op_key => $4) as r",
      [client, d.documentId, null, opk("d19risoi")]],
  ]) {
    const s = await session(ROLES.runtime);
    let err = null;
    try {
      await s.c.query("begin isolation level repeatable read");
      await s.c.query(sql, params);
    } catch (e) {
      err = e;
    } finally {
      await closeSessions(s);
    }
    assert.ok(err, `${label} must REFUSE under repeatable read (it returned instead)`);
    assert.equal(err.code, CLR_WIKI,
      `${label} refuses with the typed wiki family (got ${err.code} / ${err.detail ?? err.message})`);
    assert.match(String(err.detail ?? ""), /isolation_unsupported/,
      `${label} names the reason discriminant, so the refusal is distinguishable from a bad-state refusal`);
  }
  assert.equal((await pageRow(client, "d19r-iso")), null,
    "the refused publication left NO page behind (the raise aborts the whole transaction)");
});

test("[R1-2] READ COMMITTED and SERIALIZABLE both still publish — SERIALIZABLE is STRICTER and must NOT be refused", async () => {
  fail0019(live);
  for (const level of ["read committed", "serializable"]) {
    const client = await createClient(w.users.alice, { name: `d19r_ok_${opk("x")}`, opKey: opk("cli") });
    const d = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "invoice" });
    const s = await session(ROLES.runtime);
    try {
      await s.c.query(`begin isolation level ${level}`);
      await s.c.query(PUBLISH_SQL,
        pubParams(w.firms.A, client, "d19r-ok", d.documentId, `# iso ${level}`, "d19rok"));
      await s.c.query("commit");
    } finally {
      await closeSessions(s);
    }
    const page = await pageRow(client, "d19r-ok");
    assert.ok(page, `publication under ${level} SUCCEEDS — refusing it would break every caller that already runs there`);
    assert.equal((await versionRows(page.id)).length, 1, `…landing exactly one version under ${level}`);
  }
  const core = norm(await fnSource("_publish_wiki_page_version_core"));
  assert.ok(core.includes("current_setting('transaction_isolation')='repeatableread'"),
    "the guard tests for EQUALITY with 'repeatable read' — a `<> read committed` shape would wrongly refuse serializable");
});

test("[R1-2] the isolation floor is the FIRST thing the core does — it precedes every unlocked active-filing read it protects", async () => {
  fail0019(live);
  const core = norm(await fnSource("_publish_wiki_page_version_core"));
  const guard = core.indexOf("isolation_unsupported");
  const citeFloor = core.indexOf("wikicitationdocumentisnotactivelyfiledtothisclient");
  const refFloor = core.indexOf("wikirefdocumentisnotactivelyfiledtothisclient");
  const clientLock = core.search(/fromclara\.clients[a-z]*where[^;]*forupdate/);
  assert.ok(guard >= 0, "the core carries the isolation floor");
  assert.ok(citeFloor > guard, "…before the CLR02 citation active-filing floor (0017:2115-2121)");
  assert.ok(refFloor > guard, "…and before the CLR02 ref active-filing floor (0017:2157-2163)");
  assert.ok(clientLock > guard, "…and before the client-row lock whose ordering claim it repairs");
});

// ===========================================================================
// R1-4 — the closed-set scan covers INVOKER functions too.
// ===========================================================================

test("[R1-4] a SECURITY INVOKER helper reading wiki_pages IS caught by the live closed-set scan — and would have been INVISIBLE to a definers-only scan", async () => {
  fail0019(live);
  const whitelist = [];
  for (const sig of WB_0019_WHITELIST_SIGS) {
    const r = await rootQuery("select to_regprocedure($1)::oid::text as oid", [sig]);
    assert.ok(r.rows[0].oid && r.rows[0].oid !== "0", `${sig} resolves`);
    whitelist.push(r.rows[0].oid);
  }

  const RELATION_RE = "\\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs"
    + "|wiki_log|wiki_budgets|wiki_synthesis_holds)\\M";
  const CALL_EDGE_RE = "\\m(publish_wiki_page_version|_publish_wiki_page_version_core"
    + "|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold"
    + "|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack"
    + "|run_client_lint|run_lint_all|mark_wiki_citations_stale)\\M";

  // The wiki-touch set is a CAPABILITY SET that grows by EXPLICIT ENUMERATION: a later
  // migration's AUTHORIZED CALLER reaches wiki state by calling an AUDITED governed verb,
  // which the call-edge half cannot tell apart from an unaudited wrapper — so it must be
  // named (WB_0020_WHITELIST_SIGS, wb-helpers.mjs; unresolvable signatures are skipped, so
  // this cell is correct at 19 and at 20+ alike).
  //
  // THIS CELL'S MEANING IS THE DELTA, and the enumeration is applied to BOTH sides of it
  // precisely to preserve that: the widened scan minus the definers-only scan must be the
  // PLANTED ROGUE AND NOTHING ELSE. Subtracting the capability set from both sides keeps
  // `definersOnly.length === 0` as a real assertion — relaxing it to ">= 1" would have
  // made the cell pass for the wrong reason, with the authorized callers padding the
  // count and the actual delta unproven.
  const callers = await authorizedWikiCallerFacts({ relationRe: RELATION_RE, callEdgeRe: CALL_EDGE_RE });
  // TEETH — enumeration buys the CALL-EDGE capability only, and only while it is live.
  for (const c of callers) {
    assert.equal(c.namesRelation, false,
      `the authorized caller ${c.sig} NAMES a wiki relation directly — direct relation access is still a failure, for an authorized caller as much as for anyone`);
    assert.equal(c.callEdge, true,
      `${c.sig} is enumerated as an authorized wiki caller but carries NO call edge into the audited set — a dead exemption; remove it from WB_0020_WHITELIST_SIGS`);
  }
  const capabilitySet = [...whitelist, ...callers.map((c) => c.oid)];

  /** The 0019 §9 tail scan, parameterised by whether it filters on prosecdef. */
  const scan = async (client, definersOnly) => (await client.query(`
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' ${definersOnly ? "and p.prosecdef" : ""}
       and not (p.oid::text = any($1::text[]))
       and (p.prosrc ~* $2 or p.prosrc ~* $3)
     order by 1`, [capabilitySet, RELATION_RE, CALL_EDGE_RE])).rows.map((x) => x.sig);

  const probe = `_ratchet_probe_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const c = await getPool().connect();
  let widened = null, definersOnly = null, baseline = null;
  try {
    await c.query("begin");
    // The attack shape: an innocuously named SECURITY INVOKER helper that reads a wiki
    // relation. An authority DEFINER patched to call it contains no wiki token itself,
    // yet at run time current_user is still the DEFINER's owner — so the helper carries
    // the definer's authority and a wiki-derived veto is fully restored.
    await c.query(`create function clara.${probe}(p_client uuid) returns int
      language sql stable as $probe$
        select count(*)::int from clara.wiki_pages where client_id = p_client $probe$`);
    baseline = await scan(c, false);
    definersOnly = await scan(c, true);
    widened = baseline;
    await c.query("rollback");
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }

  assert.ok(widened.some((s) => s.includes(probe)),
    `the WIDENED scan (all clara functions) catches the invoker helper — got: ${widened.join(", ") || "(nothing)"}`);
  assert.ok(!definersOnly.some((s) => s.includes(probe)),
    "…and the definers-only scan does NOT — this is precisely the gap the fix closes, asserted rather than assumed");
  assert.equal(definersOnly.length, 0,
    `the definers-only scan is otherwise clean, so the delta is the probe alone (got ${definersOnly.join(", ") || "(nothing)"})`);
  assert.deepEqual(widened.filter((s) => !s.includes(probe)), [],
    `…and the widened scan returns the probe AND NOTHING ELSE, so the delta is exact in both directions — an authorized caller padding this list would mean the capability set was not subtracted from both sides (got ${widened.join(", ")})`);

  // …and the LIVE catalog, with no probe present, is clean under the WIDENED scan.
  const cLive = await getPool().connect();
  try {
    assert.deepEqual(await scan(cLive, false), [],
      `no clara function of ANY security type, outside the wiki-touch capability set (0019's twelve whitelisted signatures + ${callers.length} enumerated authorized caller(s)), names a wiki relation or carries a call edge`);
  } finally {
    cLive.release();
  }
});

// ===========================================================================
// R1-5 — the COMPLETE acquisition chain, mirrored in the live catalog.
// ===========================================================================

test("[R1-5] the live catalog pins the COMPLETE acquisition chain of both authority bodies, not merely 'before the UPDATE'", async () => {
  fail0019(live);
  const chains = {
    retire_document_filing: [
      ["the filing row FOR UPDATE", "select*intoffromclara.document_filingswhereid=p_filing_idforupdate"],
      ["the CLR17 already-retired guard", "raiseexception'filingisalreadyretired'usingerrcode='clr17'"],
      ["the CLR17 stale-revision guard", "raiseexception'stalefilingrevision'usingerrcode='clr17'"],
      ["the client row FOR UPDATE", "perform1fromclara.clientsclwherecl.id=f.client_idandcl.firm_id=f.firm_idforupdate"],
      ["the journal-entry live blocker", "fromclara.journal_entriesjewhereje.filing_id=f.id"],
      ["the retirement UPDATE", "updateclara.document_filingssetretired_at"],
    ],
    approve_wrong_client_correction: [
      ["the filing_corrections row FOR UPDATE", "select*intoxfromclara.filing_correctionswhereid=p_correctionforupdate"],
      ["the document_filings rows FOR UPDATE", "perform1fromclara.document_filingsfwheref.document_id=x.document_idandf.firm_id=c.firmorderbyf.idforupdate"],
      ["the CLR19 source-filing guard", "raiseexception'sourcefilingisnolongeractive'usingerrcode='clr19'"],
      ["the client row FOR UPDATE", "perform1fromclara.clientsclwherecl.id=x.from_clientandcl.firm_id=c.firmforupdate"],
      ["the entry locks", "forupdateofje"],
      ["the retirement UPDATE", "updateclara.document_filingssetretired_at"],
    ],
  };

  for (const [fn, chain] of Object.entries(chains)) {
    const src = norm(await fnSource(fn));
    let prev = -1, prevLabel = "(start of body)";
    for (const [label, token] of chain) {
      const at = src.indexOf(token);
      assert.ok(at >= 0, `${fn}: ${label} is present`);
      assert.ok(at > prev,
        `${fn}: ${label} still follows ${prevLabel} — hoisting the client lock above the filing lock keeps every token this assertion used to check while introducing a REAL deadlock (correction takes client→filing, a concurrent retirement takes filing→client)`);
      prev = at;
      prevLabel = label;
    }
  }
});

test("[R1-5] the client-row serializer keeps its CLR11 refusal AT the lock, in both bodies", async () => {
  fail0019(live);
  for (const fn of ["retire_document_filing", "approve_wrong_client_correction"]) {
    const src = norm(await fnSource(fn));
    const lock = src.search(/perform1fromclara\.clientscl[^;]*forupdate/);
    const clr11 = src.indexOf("raiseexception'filingclientnotinthesuppliedfirm'usingerrcode='clr11'");
    assert.ok(lock >= 0 && clr11 > lock,
      `${fn}: the CLR11 not-found refusal sits immediately after the lock it guards`);
    assert.ok(clr11 - lock < 200,
      `${fn}: …and immediately, not somewhere later in the body (gap ${clr11 - lock} chars)`);
  }
});

test("[R1-5] the core's SIGNATURE is unchanged by the ratchet — the whitelist, the freeze and every caller still resolve it", async () => {
  fail0019(live);
  const r = await rootQuery("select to_regprocedure($1)::oid::text as oid", [CORE_SIG]);
  assert.ok(r.rows[0].oid && r.rows[0].oid !== "0",
    "the publication core still resolves at its 0017 signature (the guards are body-only)");
});

// ===========================================================================
// R3-F7 — the §3a lock-order drift scan strips comments/literals (source-spoof-proof).
// ===========================================================================

test("[R3-F7] the §3a lock-order scan STRIPS comments and string literals — a commented-out client lock above a real page-first lock is CAUGHT (and would have SPOOFED the old scan)", async () => {
  fail0019(live);
  // The exact normalizations 0019's tail uses: STRIP = block/line comments + single-/dollar-quoted
  // literals then whitespace (R3-F7); RAW = the OLD whitespace-only form the finding spoofed.
  const STRIP = String.raw`regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(prosrc),'/\*.*?\*/',' ','g'),'--[^'||chr(10)||']*',' ','g'),'\$[a-z0-9_]*\$.*?\$[a-z0-9_]*\$',' ','g'),'''([^'']|'''')*''',' ','g'),'\s+','','g')`;
  const RAW = String.raw`regexp_replace(lower(prosrc),'\s+','','g')`;
  const LOCK = String.raw`for(?:nokeyupdate|keyshare|update|share)`;
  const PAGE = String.raw`fromclara\.wiki_pages[a-z]*where[^;]*` + LOCK;
  const CLI = String.raw`fromclara\.clients[a-z]*where[^;]*` + LOCK;
  const isViolator = async (client, norm, sig) => {
    const r = await client.query(
      `select regexp_instr(${norm}, $2) as page_at, regexp_instr(${norm}, $3) as client_at
         from pg_proc where oid = $1::regprocedure`, [sig, PAGE, CLI]);
    const p = Number(r.rows[0].page_at), cl = Number(r.rows[0].client_at);
    return p > 0 && (cl === 0 || cl > p); // the tail's violator predicate
  };

  const probe = `clara._f7_probe_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const c = await getPool().connect();
  let caught = null, spoofed = null;
  try {
    await c.query("begin");
    // A REAL page-first violator with NO real client lock — but a commented-out client lock sits
    // ABOVE the page lock, AND a decoy client lock hides inside a string literal, so a raw-prosrc
    // positional scan reads "client before page" and passes.
    await c.query(`create function ${probe}(p_client uuid) returns void
      language plpgsql as $probe$
      begin
        -- select 1 from clara.clients cl where cl.id = p_client for update;
        perform 'a decoy from clara.clients cl where cl.id = x for update';
        perform 1 from clara.wiki_pages wp where wp.client_id = p_client for update;
      end $probe$`);
    caught = await isViolator(c, STRIP, `${probe}(uuid)`);
    spoofed = await isViolator(c, RAW, `${probe}(uuid)`);
    await c.query("rollback");
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
  assert.equal(caught, true,
    "the STRIPPED scan CATCHES the page-first violator — the comment and the string literal no longer spoof the client-before-page order");
  assert.equal(spoofed, false,
    "…and the OLD whitespace-only scan MISSED it, proving the comment/literal strip is load-bearing (F7), not cosmetic");
});
