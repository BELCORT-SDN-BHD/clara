// Wave-B battery — RATCHET ROUND-2 cells, cut from the R2 memo + orchestrator
// pins (SQL unread). [R2-F1] extraction-FACT binding · [R2-F2] filing
// retirement/move vs live wiki citations (+ the two-session race) · [R2-F4]
// CONTRIBUTOR tracking on the Gate-O commit · [R2-F6] reconcile_sweep_runs
// inactive-client guard. Cells encode the FIXED behavior — pending-fix until
// the fix lane lands is the correct state.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR30 as CLR_OPENING, CLR31 as CLR_WIKI, ROLES, rootQuery, opk,
  assertRaisesOneOf, endPool, printLaneNotes, getPool,
  fail0017, wbEnsureReady,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, WB_COA,
  createOpeningSeed, recordOpeningTargetsParsed, seedTbLineRegion,
  filedDocument, fileDocument, freshResolution, publishWikiPage, retireWikiPage,
  pageRow, updatePlan, commitOnboarding, planRevision, clientRow,
  insertUser, addMember, createClient, upsertAccountClassed,
  primeReadyFiling, admitAutodraft, beginAutodraft, reconcileSweepRuns, shaHex, wikiKey, draftEntryV3,
  previewCorrection, proposeCorrection, approveCorrection,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null; // tie-doc seed host for the F1 probes
let doc = null;
let seed = null;

const F1_REFUSALS = [CLR_OPENING, CLR.provenance, CLR.badRequest];

const oneLine = (over = {}) => ({
  line_key: `f1_${opk("x").slice(-8)}`, account_code: WB_COA.cash,
  source_label: "Cash and bank", debit_cents: 10_500_000, credit_cents: 0, ...over,
});

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: onb.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: onb.client, plan: onb.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  seed = sr.seed_id ?? sr.id;
});
after(async () => { printLaneNotes("wb-r2"); await endPool(); });

test("META: 0017 applied — the R2 battery is armed", async () => {
  fail0017(live);
  assert.ok(seed, "the tie-document seed staged");
});

test("[R2-F1a]: a REAL region binds its FACTS — wrong cents/account/sign each refuse; the matching line passes", async () => {
  fail0017(live);
  const record = (line, ref) => recordOpeningTargetsParsed({
    seed, document: doc.documentId, lines: [{ ...line, extraction_ref: ref }] });
  const facts = oneLine(); // region text: "1000 Cash and bank RM 105,000.00 DR"
  const refCents = await seedTbLineRegion(w.firms.A, doc, facts);
  await assertRaisesOneOf(F1_REFUSALS, () => record(oneLine({ debit_cents: 99 }), refCents),
    "a genuine region blessing FABRICATED cents (the memo's critical reproduction)");
  const refAcct = await seedTbLineRegion(w.firms.A, doc, facts);
  await assertRaisesOneOf(F1_REFUSALS, () => record(oneLine({ account_code: WB_COA.expense }), refAcct),
    "a genuine region blessing the WRONG account");
  const refSign = await seedTbLineRegion(w.firms.A, doc, facts);
  await assertRaisesOneOf(F1_REFUSALS, () => record(oneLine({ debit_cents: 0, credit_cents: 10_500_000 }), refSign),
    "a genuine region blessing the WRONG side (Dr text, Cr target)");
  const refOk = await seedTbLineRegion(w.firms.A, doc, facts);
  const ok = await record(facts, refOk);
  assert.ok(ok, "the extraction-matching target records (the honest positive path)");
});

test("[R2-F1b]: a STALE superseded extraction version refuses — only the latest accepted extraction binds", async () => {
  fail0017(live);
  const v1ref = await seedTbLineRegion(w.firms.A, doc, oneLine());
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-fixture:v2','ocr',2,'done',1)`,
    [randomUUID(), w.firms.A, doc.documentId]);
  await assertRaisesOneOf(F1_REFUSALS, () => recordOpeningTargetsParsed({
    seed, document: doc.documentId,
    lines: [{ ...oneLine(), extraction_ref: v1ref }],
  }), "a v1 region under a newer done extraction (stale versions must not bless targets)");
});

test("[R2-F2a]: retiring a filing with a LIVE wiki citation REFUSES named; after the page retires, it succeeds", async () => {
  fail0017(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await fileDocument(w.users.alice, {
    document: d.documentId, client: w.clients.A2,
    resolution: await freshResolution(w.users.alice, w.clients.A2, { subjectKind: "document", subjectId: d.documentId }),
  });
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "f2-cited", title: "F2",
    citations: [{ source_kind: "document", document_id: d.documentId }],
  });
  const filing = (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [d.filingId])).rows[0].r;
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  const err = await assertRaisesOneOf([CLR.badRequest, CLR_WIKI, "CLR17"], () => retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "f2 retire probe", expectedRevision: filing.revision_token,
  }), "retiring the citing client's filing under a LIVE wiki citation");
  assert.match(err.message, /wiki/i, "the refusal NAMES the wiki citation blocker");
  const page = await pageRow(w.clients.A1, "f2-cited");
  await retireWikiPage(w.users.bob, { page: page.id, reason: "release the filing" });
  const filing2 = (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [d.filingId])).rows[0].r;
  const r = await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "f2 retire after page retire", expectedRevision: filing2.revision_token,
  });
  assert.ok(r !== undefined, "with the citing page retired, the filing retirement proceeds");
});

test("[R2-F2b]: a correction MOVE of the filing refuses under a live citation (the other transition verb)", async () => {
  fail0017(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "f2-moved", title: "F2m",
    citations: [{ source_kind: "document", document_id: d.documentId }],
  });
  // R2 reconcile: the correction lane RE-FILES to the destination, so the
  // cardinal attribution invariant demands an authoritative DESTINATION
  // resolution first — without it the lane correctly refused CLR01 before the
  // transition verb (fixture defect acknowledged; dispute resolved impl-side).
  await freshResolution(w.users.alice, w.clients.A2, { subjectKind: "document", subjectId: d.documentId });
  await assertRaisesOneOf([CLR.badRequest, CLR_WIKI, "CLR17"], async () => {
    const prev = await previewCorrection(w.users.alice, { document: d.documentId, fromClient: w.clients.A1, toClient: w.clients.A2 });
    const prop = await proposeCorrection(w.users.alice, {
      document: d.documentId, fromClient: w.clients.A1, toClient: w.clients.A2, reason: "f2 move probe", opKey: opk("mv") });
    await approveCorrection(w.users.hana, {
      correction: prop?.correction_id ?? prop?.id ?? prop,
      planHash: prop?.plan_hash ?? prev?.plan_hash, opKey: opk("mva") });
  }, "moving the filing away from the citing client (cross-client provenance would persist)");
});

test("[R2-F2c]: a publication RACING a retirement cannot slip through (two-session — never both-ok)", async () => {
  fail0017(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await fileDocument(w.users.alice, {
    document: d.documentId, client: w.clients.A2,
    resolution: await freshResolution(w.users.alice, w.clients.A2, { subjectKind: "document", subjectId: d.documentId }),
  });
  const filing = (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [d.filingId])).rows[0].r;
  const content = "# f2 race";
  const digest = shaHex(content);
  const publishSql = `select clara.publish_wiki_page_version(p_client => $1, p_slug => 'f2-race',
    p_page_kind => 'profile', p_title => 'Race', p_counterparty => null, p_content => $2,
    p_content_sha256 => $3, p_storage_key => $4, p_citations => $5::jsonb, p_refs => '[]'::jsonb,
    p_synthesis => 'deterministic', p_engine_id => null, p_projected_from_seq => null, p_op_key => $6) as r`;
  const retireSql = `select clara.retire_document_filing(p_filing => $1, p_reason => 'f2 race retire',
    p_expected_revision => $2, p_op_key => $3) as r`;
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { pub: null, ret: null };
  try {
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    await c1.query(publishSql, [w.clients.A1, content, digest, wikiKey(w.firms.A, w.clients.A1, digest),
      JSON.stringify([{ source_kind: "document", document_id: d.documentId }]), opk("rcp")]);

    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.alice, role: "authenticated" })]);
    const p2 = c2.query(retireSql, [d.filingId, filing.revision_token, opk("rcr")])
      .then(() => { out.ret = { ok: true }; })
      .catch((e) => { out.ret = { ok: false, code: e.code }; });

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
  assert.ok(!(out.pub?.ok && out.ret?.ok),
    `the race must serialize — a page must never end active citing a retired filing (pub=${JSON.stringify(out.pub)} ret=${JSON.stringify(out.ret)})`);
  const page = await pageRow(w.clients.A1, "f2-race");
  if (page && page.state === "active") {
    const f = (await rootQuery("select retired_at from clara.document_filings where id=$1", [d.filingId])).rows[0];
    assert.equal(f.retired_at, null, "an ACTIVE citing page implies the filing is still live");
  }
});

test("[R2-F4]: CONTRIBUTOR tracking — the substantive ANSWERER cannot commit; a clean third admin can", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana); // B opens (blank)
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.alice, // A answers substantively
    items: [
      { item_kind: "must_ask", item_key: "fye", question: "FYE?", state: "answered", answer: { value: "31 Dec" } },
      { item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" },
    ] });
  await assertRaisesOneOf([CLR.makerChecker], async () => commitOnboarding(w.users.alice, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f4a"),
  }), "the memo's laundering reproduction: B opens, A answers, A commits — ANY substantive contributor is disqualified");
  const ivan = await insertUser(w.prefix, "ivan");
  await addMember(w.users.alice, { firm: w.firms.A, user: ivan, role: "admin", opKey: opk("mem") });
  await commitOnboarding(ivan, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f4b") });
  assert.equal((await clientRow(o.client)).status, "active", "a CLEAN third admin commits");
});

test("[R2-F6]: reconcile_sweep_runs RECOVERS the active client's staged work and leaves the inactive twin byte-untouched", async () => {
  fail0017(live);
  // R3 repair (memo 6a): both clients stage a GENUINELY RECOVERABLE shape —
  // open sweep run + admitted attempt + a coding_attempts row binding a DRAFT
  // entry, no sweep_run_item yet (the as-built recovery predicate). The ACTIVE
  // control must provably recover (item minted, attempt idled, task
  // completed, run finalized); the archived twin's rows stay byte-identical.
  const stageRecoverable = async (tag) => {
    const c = await createClient(w.users.alice, { name: `wbr2f6${tag}_${opk("x")}`, opKey: opk("cli") });
    await upsertAccountClassed(w.users.alice, { client: c, code: "400-000", name: "Trade Creditors", type: "liability", accountClass: "payable" });
    await upsertAccountClassed(w.users.alice, { client: c, code: "500-A01", name: "Purchases", type: "expense" });
    await upsertAccountClassed(w.users.alice, { client: c, code: WB_COA.cash, name: "Cash", type: "asset" });
    await upsertAccountClassed(w.users.alice, { client: c, code: WB_COA.sales, name: "Sales", type: "income" });
    // R3 repair (memo 6a, PROBED): the sweep admits only READY-lane filings —
    // a birth-requiring vendor draws lane_changed/vendor_unresolved and mints
    // NO attempt (my earlier readyFiling stage compared null==null, the exact
    // vacuity the memo called). primeReadyFiling resolves to an EXISTING vendor.
    const rf = await primeReadyFiling(w.users.alice, { client: c, amount: 400_000, vendorName: `F6 PRIMED ${tag}` });
    // lift the sweep metering (the wave-a-budget setFirmLimit idiom): a large
    // daily token limit AND max_concurrent_sweeps — each stage auto-opens its
    // own run, and the second admission would otherwise draw the cap's
    // refused_budget. The RECONCILER, not the metering gate, is under test.
    const lim = await rootQuery(
      "update clara.firm_limits set daily_token_limit = $2, max_concurrent_sweeps = $3 where firm_id=$1",
      [w.firms.A, 10_000_000, 10]);
    if (lim.rowCount === 0) {
      await rootQuery(
        "insert into clara.firm_limits (firm_id, daily_token_limit, max_concurrent_sweeps) values ($1,$2,$3) on conflict (firm_id) do update set daily_token_limit=$2, max_concurrent_sweeps=$3",
        [w.firms.A, 10_000_000, 10]).catch(() => {});
    }
    const admit = await admitAutodraft({ filing: rf.filingId });
    const budgetCtx = async () => JSON.stringify({
      limits: (await rootQuery("select to_jsonb(l) as r from clara.firm_limits l where l.firm_id=$1", [w.firms.A])).rows[0]?.r ?? null,
      usage: (await rootQuery("select to_jsonb(u) as r from clara.firm_usage_daily u where u.firm_id=$1", [w.firms.A])).rows.map((x) => x.r),
      openRuns: (await rootQuery("select count(*)::int as n from clara.sweep_runs where firm_id=$1 and state='open'", [w.firms.A])).rows[0].n,
    });
    assert.equal(admit.outcome ?? admit.status, "admitted",
      `the stage is GENUINELY admitted (got ${JSON.stringify(admit)}; ctx ${await budgetCtx()})`);
    const attempt = (await rootQuery("select to_jsonb(a) as r from clara.autodraft_attempts a where a.filing_id=$1", [rf.filingId])).rows[0].r;
    assert.ok(attempt?.task_id, "an attempt row with a task exists (no vacuous nulls)");
    await beginAutodraft({ task: attempt.task_id }); // queued→running: the completion branch's as-built predicate
    const d = await draftEntryV3(w.users.alice, {
      client: c, resolution: freshResolution(w.users.alice, c),
      lines: [
        { account_code: WB_COA.cash, debit_cents: 2_100, credit_cents: 0 },
        { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 2_100 },
      ],
      opKey: opk(`f6${tag}`),
    });
    await rootQuery(
      `insert into clara.coding_attempts(firm_id, client_id, task_id, filing_id, document_id, entry_id, part_payload)
       values ($1,$2,$3,$4,$5,$6,'{}'::jsonb)`,
      [w.firms.A, c, attempt.task_id, rf.filingId, rf.documentId, d.entry_id, ]);
    return { client: c, rf, attempt, entry: d.entry_id };
  };
  const act = await stageRecoverable("A");
  const dead = await stageRecoverable("B");
  await rootQuery("update clara.clients set status='archived' where id=$1", [dead.client]);
  const snap = async (s) => (await rootQuery(
    `select jsonb_build_object(
       'attempt', (select to_jsonb(a) from clara.autodraft_attempts a where a.filing_id=$1),
       'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.filing_id),'[]'::jsonb) from clara.sweep_run_items i where i.filing_id=$1),
       'task', (select to_jsonb(t) from clara.agent_tasks t where t.id=$2)) as r`,
    [s.rf.filingId, s.attempt.task_id])).rows[0].r;
  const dead0 = await snap(dead);
  await reconcileSweepRuns();
  const actAfter = await snap(act);
  assert.equal(actAfter.items.length, 1, "ACTIVE control: the recovery branch minted its sweep_run_item");
  assert.equal(actAfter.items[0].outcome, "drafted", "…as 'drafted' with the recovered entry");
  assert.equal(actAfter.items[0].entry_id, act.entry, "…binding the staged draft");
  assert.equal(actAfter.attempt.state, "idle", "ACTIVE control: the attempt idled (recovery proven)");
  assert.equal(actAfter.task.status, "completed", "ACTIVE control: the agent task completed");
  const run = (await rootQuery("select state from clara.sweep_runs where id=$1", [act.attempt.run_id])).rows[0];
  assert.equal(run.state, "finalized", "ACTIVE control: the finalize branch closed the run (both branches proven)");
  assert.equal(JSON.stringify(await snap(dead)), JSON.stringify(dead0),
    "the archived twin — SAME recoverable shape — is byte-untouched (attempt, items, task)");
});
