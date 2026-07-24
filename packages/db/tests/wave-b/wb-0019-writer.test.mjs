// Wave-B battery — migration 0019 §3/§10: THE STALE-MARK WRITER
// `clara.mark_wiki_citations_stale(p_client,p_document,p_reason,p_op_key)`.
// Scope precision · the closed receipt · the THREE distinct idempotency cases ·
// positive-change-only audit · the amendment-4 NO-EVENT proof · the runtime-only
// ACL. CONTRACT-BLIND; FAILS below 0019.
//
// AMBIGUITIES this lane encodes:
//   [D19-5] §3 says an unrecognised `p_reason` is "a typed refusal" without
//           naming the SQLSTATE. Encoded as one-of {CLR10 (the malformed-args
//           family every wiki wrapper uses for op_key/lifecycle) or CLR32 (the
//           wiki family)}. A third code at integration is a finding.
//   [D19-6] §4 forbids the LANE from ever calling the writer with a null client
//           or document ("never a call with nulls"), but the contract says
//           nothing about what the WRITER does when called that way. Encoded as
//           the only assertion the contract's words support: it must never
//           silently mark — either a typed refusal or a zero-count 'noop'.
//   [D19-7] §10 asks for "cross-firm / cross-client isolation". Cross-FIRM is
//           structurally unreachable, not merely refused: wiki_page_citations'
//           FK is (document_id, firm_id) → documents(id, firm_id) (0017:906-907)
//           and the ref FK likewise (0017:946-947), so another firm's page can
//           never cite a firm-A document in the first place. The cell asserts the
//           reachable half (cross-client) and pins the structural half by FK.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR31 as CLR_WIKI, PG, ROLES, rootQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, roleCanExecute,
  buildWaveBWorld, filedDocument, fileDocument, freshResolution,
  publishWikiPage, retireWikiPage, pageRow, citationRows, refRows,
  wikiLogRows, auditRowsFor, opReceiptRow, markStale,
  WB_STALE_REASON,
} from "./wb-fixtures.mjs";
import { maxSeq } from "../rig-events-helpers.mjs";

const FN = "mark_wiki_citations_stale";
const SIG = "clara.mark_wiki_citations_stale(uuid,uuid,text,text)";

let live = false;
let w = null;
let doc = null; // the marked document (filed to A1)
let live1 = null; // an ACTIVE page: v1 cites doc (superseded), v2 cites doc + refs doc
let dead1 = null; // a RETIRED page citing + reffing the same doc
let markKey = null;
let markReceipt = null;

const cite = (document) => [{ source_kind: "document", document_id: document }];
const ref = (document) => [{ ref_kind: "document", document_id: document }];
const docCitesOf = async (page, document) =>
  (await citationRows((await pageRow2(page)).current_version_id)).filter((c) => c.document_id === document);
const pageRow2 = async (p) =>
  (await rootQuery("select to_jsonb(x) as r from clara.wiki_pages x where x.id=$1", [p])).rows[0].r;

before(async () => {
  live = await wbEnsureReady19();
  if (!live) return;
  w = await buildWaveBWorld();
  doc = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  // ACTIVE page, two versions: v1's citation becomes a SUPERSEDED-version row.
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-w-live",
    title: "Live", content: "# live v1", citations: cite(doc.documentId), refs: ref(doc.documentId) });
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-w-live",
    title: "Live", content: "# live v2", citations: cite(doc.documentId), refs: ref(doc.documentId) });
  live1 = (await pageRow(w.clients.A1, "d19-w-live")).id;
  // RETIRED page citing + reffing the same document.
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-w-dead",
    title: "Dead", content: "# dead", citations: cite(doc.documentId), refs: ref(doc.documentId) });
  dead1 = (await pageRow(w.clients.A1, "d19-w-dead")).id;
  await retireWikiPage(w.users.bob, { page: dead1, reason: "0019 writer-scope fixture" });
});
after(async () => { printLaneNotes("wb-0019-writer"); await endPool(); });

test("META: 0019 applied — the writer battery is armed", async () => {
  fail0019(live);
  assert.ok(live1 && dead1, "an active two-version page and a retired page both cite the same document");
});

test("[0019 §3]: the writer exists with the pinned signature, SECURITY DEFINER, pinned search_path and fn owner", async () => {
  fail0019(live);
  const reg = await rootQuery("select to_regprocedure($1) as reg", [SIG]);
  assert.ok(reg.rows[0].reg, `${SIG} exists with EXACTLY the pinned signature`);
  const r = await rootQuery(`
    select p.prosecdef, p.proconfig, p.proargnames, pg_get_userbyid(p.proowner) as owner,
           pg_get_function_result(p.oid) as result
      from pg_proc p where p.oid=$1::regprocedure`, [SIG]);
  const row = r.rows[0];
  assert.equal(row.prosecdef, true, "SECURITY DEFINER");
  // pg NORMALISES proconfig to "search_path=clara, pg_temp" (a space after the comma),
  // so compare whitespace-insensitively rather than pinning the literal.
  assert.ok((row.proconfig ?? []).some((c) => c.replace(/\s+/g, "") === "search_path=clara,pg_temp"),
    `search_path=clara,pg_temp is pinned (got ${JSON.stringify(row.proconfig)})`);
  assert.equal(row.owner, ROLES.fnOwner, "created under set role clara_fn_owner");
  assert.match(row.result, /jsonb/, "returns jsonb (the closed receipt)");
  assert.deepEqual(row.proargnames, ["p_client", "p_document", "p_reason", "p_op_key"],
    "the pinned NAMED argument list, in order");
  const overloads = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1", [FN]);
  assert.equal(overloads.rows[0].n, 1, "exactly ONE overload (the §9 whitelist pins identity by signature)");
});

test("[0019 §3/§9]: the ACL is runtime-ONLY — every other app role is refused at the ROLE level, PUBLIC holds nothing", async () => {
  fail0019(live);
  assert.equal(await roleCanExecute(ROLES.runtime, FN), true, "clara_runtime executes");
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleCanExecute(role, FN), false, `${role} holds NO EXECUTE on ${FN}`);
  }
  // …and the refusal is STRUCTURAL, not body-enforced: the call itself is 42501.
  await assertRaises(PG.insufficientPrivilege, () => markStale({
    client: w.clients.A1, document: doc.documentId, role: ROLES.authenticated,
  }), "the human lane calling the stale writer");
  await assertRaises(PG.insufficientPrivilege, () => markStale({
    client: w.clients.A1, document: doc.documentId, role: ROLES.agentRo,
  }), "the agent lane calling the stale writer");
  const pub = await rootQuery(`
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=$1
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'))`, [FN]);
  assert.equal(pub.rows.length, 0, "PUBLIC-execute sweep = 0 on the new fn");
});

test("[0019 §3/D19-5]: an unrecognised p_reason is a TYPED REFUSAL and marks nothing", async () => {
  fail0019(live);
  await assertRaisesOneOf([CLR.badRequest, CLR_WIKI], () => markStale({
    client: w.clients.A1, document: doc.documentId, reason: "invented_reason",
  }), "a p_reason outside the column CHECK's allowed set");
  const marked = await docCitesOf(live1, doc.documentId);
  assert.equal(marked.filter((c) => c.stale_at).length, 0, "the refused call marked NOTHING");
});

test("[0019 §3/§10]: the mark hits LIVE sources ONLY — current-version citations + active-page document refs", async () => {
  fail0019(live);
  const seq0 = await maxSeq(w.firms.A);
  const logs0 = (await wikiLogRows(w.clients.A1)).length;
  const audits0 = (await auditRowsFor(FN)).length;
  markKey = opk("d19mark");
  markReceipt = await markStale({ client: w.clients.A1, document: doc.documentId, opKey: markKey });

  // --- the CLOSED receipt shape (§3) --------------------------------------
  assert.deepEqual(Object.keys(markReceipt).sort(),
    ["citations_marked", "document_id", "reason", "refs_marked", "status"],
    `the receipt is exactly {document_id, reason, citations_marked, refs_marked, status} (got ${JSON.stringify(markReceipt)})`);
  assert.equal(markReceipt.document_id, doc.documentId, "receipt.document_id");
  assert.equal(markReceipt.reason, WB_STALE_REASON, "receipt.reason");
  assert.equal(markReceipt.status, "marked", "status='marked' (counts are non-zero)");
  assert.equal(Number(markReceipt.citations_marked), 1,
    "EXACTLY the current-version citation — the superseded-version row is NEVER touched");
  assert.equal(Number(markReceipt.refs_marked), 1,
    "EXACTLY the active page's document ref — the retired page's ref is NEVER touched");

  // --- scope precision, row by row ----------------------------------------
  const livePage = await pageRow2(live1);
  const current = (await citationRows(livePage.current_version_id)).filter((c) => c.document_id === doc.documentId);
  assert.equal(current.length, 1, "the active page's current version cites the document once");
  assert.ok(current[0].stale_at, "…and it is MARKED");
  assert.equal(current[0].stale_reason, WB_STALE_REASON, "…with the pinned reason");
  const superseded = (await rootQuery(
    `select to_jsonb(c) as r from clara.wiki_page_citations c
       join clara.wiki_page_versions v on v.id=c.version_id
      where v.page_id=$1 and v.state='superseded' and c.document_id=$2`, [live1, doc.documentId])).rows.map((x) => x.r);
  assert.ok(superseded.length >= 1, "the superseded version still holds its own citation row (versioned, immutable)");
  for (const s of superseded) assert.equal(s.stale_at, null, "a SUPERSEDED-version citation stays UNMARKED");
  const liveRefs = await refRows(live1);
  assert.equal(liveRefs.filter((r) => r.stale_at).length, 1, "the active page's document ref is MARKED");
  const deadPage = await pageRow2(dead1);
  assert.equal(deadPage.state, "retired", "the control page is retired");
  for (const c of await citationRows(deadPage.current_version_id)) {
    assert.equal(c.stale_at, null, "a RETIRED page's citation stays UNMARKED");
  }
  for (const r of await refRows(dead1)) {
    assert.equal(r.stale_at, null, "a RETIRED page's ref stays UNMARKED");
  }

  // --- audit posture: positive changes ONLY (§3) ---------------------------
  const logs = (await wikiLogRows(w.clients.A1)).filter((l) => l.action === "mark_stale");
  assert.equal(logs.length, 1, "a 'marked' call writes EXACTLY ONE wiki_log(action='mark_stale')");
  assert.equal(String(logs[0].detail?.document_id), String(doc.documentId), "…whose detail carries document_id");
  assert.equal(logs[0].detail?.reason, WB_STALE_REASON, "…and reason");
  assert.equal(Number(logs[0].detail?.citations_marked), 1, "…and citations_marked");
  assert.equal(Number(logs[0].detail?.refs_marked), 1, "…and refs_marked");
  assert.ok((await wikiLogRows(w.clients.A1)).length > logs0, "the wiki_log grew");
  assert.equal((await auditRowsFor(FN)).length, audits0 + 1,
    "a 'marked' call writes EXACTLY ONE audit_log row (clara._audit, conditional on status='marked')");

  // --- amendment 4: NO EVENT, at all (the load-bearing negative) -----------
  assert.equal(await maxSeq(w.firms.A), seq0,
    "the firm event head is UNCHANGED — a stale mark appends nothing to domain_events, so it can never reach assert_books_current (0007:2665-2681) or the correction books-version check (0009:2449-2450)");
  const anyStaleEvent = await rootQuery(
    "select 1 from clara.domain_events where firm_id=$1 and event_type like 'wiki.%stale%'", [w.firms.A]);
  assert.equal(anyStaleEvent.rows.length, 0, "no wiki stale event of ANY name was appended");

  // --- the op receipt is ALWAYS written -----------------------------------
  const receipt = await opReceiptRow(FN, markKey);
  assert.ok(receipt, "the op receipt is written even though the audit is conditional");
});

test("[0019 §3 case (a)]: SAME op key + SAME args replays the ORIGINAL receipt byte-identically — no re-scan, no new audit row", async () => {
  fail0019(live);
  const logs0 = (await wikiLogRows(w.clients.A1)).filter((l) => l.action === "mark_stale").length;
  const audits0 = (await auditRowsFor(FN)).length;
  const replay = await markStale({ client: w.clients.A1, document: doc.documentId, opKey: markKey });
  assert.equal(JSON.stringify(replay), JSON.stringify(markReceipt),
    "the ORIGINAL receipt replays byte-identically — INCLUDING its original non-zero counts (0004:43-60)");
  assert.equal(Number(replay.citations_marked), 1, "…the replayed counts are the first call's, not a fresh zero scan");
  assert.equal((await wikiLogRows(w.clients.A1)).filter((l) => l.action === "mark_stale").length, logs0,
    "no new wiki_log row on a redelivery");
  assert.equal((await auditRowsFor(FN)).length, audits0, "no new audit_log row on a redelivery");
});

test("[0019 §3 case (b)]: a FRESH op key over already-marked rows returns a clean zero-match noop and PRESERVES the first stale_at", async () => {
  fail0019(live);
  const before1 = (await docCitesOf(live1, doc.documentId))[0];
  const logs0 = (await wikiLogRows(w.clients.A1)).filter((l) => l.action === "mark_stale").length;
  const audits0 = (await auditRowsFor(FN)).length;
  const again = await markStale({ client: w.clients.A1, document: doc.documentId, opKey: opk("d19repair") });
  assert.equal(Number(again.citations_marked), 0, "citations_marked = 0 (the stale_at is null filter matched nothing)");
  assert.equal(Number(again.refs_marked), 0, "refs_marked = 0");
  assert.equal(again.status, "noop", "status='noop' IFF citations_marked + refs_marked = 0");
  const after1 = (await docCitesOf(live1, doc.documentId))[0];
  assert.equal(String(after1.stale_at), String(before1.stale_at), "the FIRST call's stale_at is preserved (never re-stamped)");
  assert.equal((await wikiLogRows(w.clients.A1)).filter((l) => l.action === "mark_stale").length, logs0,
    "a 'noop' call writes NO wiki_log row (positive changes only)");
  assert.equal((await auditRowsFor(FN)).length, audits0, "a 'noop' call writes NO audit_log row");
});

test("[0019 §3 case (c)]: the SAME op key with CHANGED args refuses CLR10 (the _reserve_op hash law)", async () => {
  fail0019(live);
  const other = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await assertRaises(CLR.badRequest, () => markStale({
    client: w.clients.A1, document: other.documentId, opKey: markKey,
  }), "the first call's op_key replayed with a different p_document");
});

test("[0019 §10/D19-7]: the mark is (firm, client, document)-scoped — another CLIENT's citation of the same document is untouched", async () => {
  fail0019(live);
  const shared = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await fileDocument(w.users.alice, {
    document: shared.documentId, client: w.clients.A2,
    resolution: await freshResolution(w.users.alice, w.clients.A2, {
      subjectKind: "document", subjectId: shared.documentId }),
  });
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-w-shared-a1",
    title: "Shared A1", content: "# shared a1", citations: cite(shared.documentId) });
  await publishWikiPage({ client: w.clients.A2, firm: w.firms.A, slug: "d19-w-shared-a2",
    title: "Shared A2", content: "# shared a2", citations: cite(shared.documentId) });
  const r = await markStale({ client: w.clients.A1, document: shared.documentId });
  assert.equal(Number(r.citations_marked), 1, "exactly the target client's citation is marked");
  const a1 = (await pageRow(w.clients.A1, "d19-w-shared-a1"));
  const a2 = (await pageRow(w.clients.A2, "d19-w-shared-a2"));
  assert.ok((await citationRows(a1.current_version_id))[0].stale_at, "client A1's citation IS marked");
  assert.equal((await citationRows(a2.current_version_id))[0].stale_at, null,
    "client A2's citation of the SAME document is UNTOUCHED");
  // Cross-FIRM is structurally unreachable, not merely refused.
  const fk = await rootQuery(`
    select pg_get_constraintdef(c.oid) as d from pg_constraint c
      join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='clara' and t.relname='wiki_page_citations' and c.contype='f'
       and pg_get_constraintdef(c.oid) like '%documents%'`);
  assert.ok(fk.rows.some((x) => /firm_id/.test(x.d)),
    "the citation→documents FK is firm-composite, so another FIRM's page can never cite this document at all");
});

test("[0019 §3/D19-6]: a null client or document NEVER silently marks", async () => {
  fail0019(live);
  const fresh = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-w-null",
    title: "Null probe", content: "# null probe", citations: cite(fresh.documentId) });
  for (const [client, document, label] of [
    [null, fresh.documentId, "a null p_client"],
    [w.clients.A1, null, "a null p_document"],
  ]) {
    let out = null;
    try { out = await markStale({ client, document, opKey: opk("d19null") }); } catch (e) { out = { raised: e.code }; }
    if (out?.raised) {
      assert.ok(String(out.raised).startsWith("CLR"), `${label} → a TYPED refusal (got ${out.raised})`);
    } else {
      assert.equal(out.status, "noop", `${label} → a zero-count noop, never a silent mark (got ${JSON.stringify(out)})`);
    }
  }
  const p = await pageRow(w.clients.A1, "d19-w-null");
  assert.equal((await citationRows(p.current_version_id))[0].stale_at, null, "nothing was marked by either probe");
});

test("[0019 §3]: wiki_log.action gained 'mark_stale' and NOTHING ELSE was added to the vocabulary", async () => {
  fail0019(live);
  const d = (await rootQuery(`
    select pg_get_constraintdef(c.oid) as d from pg_constraint c
      join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='clara' and t.relname='wiki_log' and c.contype='c'
       and pg_get_constraintdef(c.oid) like '%action%'`)).rows.map((x) => x.d).join(" ~~ ");
  assert.ok(d.includes("'mark_stale'"), `the wiki_log action CHECK gained 'mark_stale' (got ${d})`);
  for (const carried of ["'ingest'", "'publish'", "'supersede'", "'retire'", "'lint_pass'", "'hold'", "'release'"]) {
    assert.ok(d.includes(carried), `the 0017 action vocabulary is CARRIED: ${carried}`);
  }
});

test("[0019 §3]: an unknown client is not an existence oracle and marks nothing", async () => {
  fail0019(live);
  let out = null;
  try {
    out = await markStale({ client: randomUUID(), document: doc.documentId, opKey: opk("d19ghost") });
  } catch (e) { out = { raised: e.code }; }
  if (out?.raised) {
    assert.ok(["CLR11", CLR.badRequest, CLR_WIKI].includes(out.raised),
      `an unknown client refuses with a typed code (got ${out.raised})`);
  } else {
    assert.equal(out.status, "noop", `…or returns a zero-count noop (got ${JSON.stringify(out)})`);
  }
});
