// Wave-B battery — RATCHET ROUND-3 cells, cut from the R3 memo + pins (SQL
// unread). [R3-F1] extraction-fact truth + one authoritative extraction ·
// [R3-F2] the legacy creator joins the onboarding path + the plan-bootstrap
// verb (B-12 for pre-0017 actives) · [R3-F3] pure-reversal makers and K5/K6
// CHECKERS join the contributor set · [R3-F4] initial fixed assets are
// 'pending' until K5. Expect pending-fix fails until the fix lane lands.
// [AMB-R3] the bootstrap verb's NAME is unpinned — encoded
// bootstrap_client_plan(p_client, p_op_key); a divergence is the finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR30 as CLR_OPENING, rootQuery, humanQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, WB_COA,
  createOpeningSeed, recordOpeningTargetsParsed, seedTbLineRegion,
  recordParsedTargets, draftOpeningItem, stageBeeSet, revMapOf, planRevision,
  approveOpeningSeed, supersedeOpeningItem, seedFixedAsset, faRow, entryRow,
  openingItemRows, seedRegRow, commitOnboarding, clientRow,
  insertUser, addMember, upsertAccountClassed, filedDocument, freshResolution,
  draftEntryV3,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let ivan = null; // the clean third admin
let uma = null; // the K6-checker probe admin

const F1_REFUSALS = [CLR_OPENING, CLR.provenance, CLR.badRequest];
const oneLine = (over = {}) => ({
  line_key: `f1_${opk("x").slice(-8)}`, account_code: WB_COA.cash,
  source_label: "Cash and bank", debit_cents: 10_500_000, credit_cents: 0, ...over,
});

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  ivan = await insertUser(w.prefix, "ivan");
  await addMember(w.users.alice, { firm: w.firms.A, user: ivan, role: "admin", opKey: opk("mem") });
  uma = await insertUser(w.prefix, "uma");
  await addMember(w.users.alice, { firm: w.firms.A, user: uma, role: "admin", opKey: opk("mem") });
});
after(async () => { printLaneNotes("wb-r3"); await endPool(); });

test("META: 0017 applied — the R3 battery is armed", async () => {
  fail0017(live);
  assert.ok(ivan, "the clean third admin staged");
});

test("[R3-F1a]: a caller opening_fact CONTRADICTING the region's evidence refuses; an agreeing one records", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const seed = sr.seed_id ?? sr.id;
  const facts = oneLine(); // region text: "1000 Cash and bank RM 105,000.00 DR"
  const refBad = await seedTbLineRegion(w.firms.A, doc, facts);
  await assertRaisesOneOf(F1_REFUSALS, () => recordOpeningTargetsParsed({
    seed, document: doc.documentId,
    lines: [{ ...facts, extraction_ref: refBad,
      opening_fact: { account_code: WB_COA.cash, amount_cents: 99, side: "debit" } }],
  }), "an explicit fact triple DISAGREEING with the region's evidence (the memo's invented-fact reproduction)");
  const refOk = await seedTbLineRegion(w.firms.A, doc, facts);
  const ok = await recordOpeningTargetsParsed({
    seed, document: doc.documentId,
    lines: [{ ...facts, extraction_ref: refOk,
      opening_fact: { account_code: WB_COA.cash, amount_cents: 10_500_000, side: "debit" } }],
  });
  assert.ok(ok, "an explicit fact AGREEING with the evidence records");
});

test("[R3-F1b]: cross-engine same-version ambiguity — the non-authoritative run refuses at PARSE and a stale-bound set refuses at K5", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  // a SECOND engine's done run at the SAME version lands AFTER the targets bound
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-other-engine:v9','ocr',1,'done',1)`,
    [randomUUID(), w.firms.A, st.doc.documentId]);
  // parse-time: a fresh target bound to the now NON-authoritative original run refuses
  const refStale = await seedTbLineRegion(w.firms.A, st.doc, oneLine());
  await assertRaisesOneOf(F1_REFUSALS, () => recordOpeningTargetsParsed({
    seed: st.seed, document: st.doc.documentId,
    lines: [{ ...oneLine(), extraction_ref: refStale }],
  }), "a target bound outside the ONE authoritative extraction pointer (cross-engine same-version)");
  // K5-time: the whole set was bound to the superseded generation — the approval refuses stale
  await assertRaisesOneOf([CLR_OPENING, CLR.provenance], async () => approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("f1b"),
  }), "K5 over targets bound to a stale extraction generation");
});

test("[R3-F2a]: the LEGACY create_client births ONBOARDING + a plan — no Gate-O bypass", async () => {
  fail0017(live);
  // the RAW verb, bypassing the fixture bridge:
  const receipt = (await humanQuery(w.users.alice,
    "select clara.create_client(p_name => $1, p_op_key => $2) as r",
    [`wbr3_legacy_${opk("x")}`, opk("cli")])).rows[0].r;
  const client = receipt.client_id;
  assert.equal((await clientRow(client)).status, "onboarding", "the legacy creator now births 'onboarding'");
  const plan = await rootQuery(
    "select id from clara.onboarding_plans where client_id=$1 and state='open'", [client]);
  assert.equal(plan.rows.length, 1, "the birth minted its plan (the same Gate-O object)");
  await upsertAccountClassed(w.users.alice, { client, code: WB_COA.cash, name: "Cash", type: "asset" });
  await upsertAccountClassed(w.users.alice, { client, code: WB_COA.sales, name: "Sales", type: "income" });
  await assertRaises(CLR.badRequest, () => draftEntryV3(w.users.alice, {
    client, resolution: freshResolution(w.users.alice, client),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 700, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 700 },
    ],
    opKey: opk("byp"),
  }), "no operational bypass — the legacy birth is NOT postable before commit");
});

test("[R3-F2b]: the plan-bootstrap verb — idempotent, active STAYS active, and it unlocks the B-12 seed [AMB-R3]", async () => {
  fail0017(live);
  // a PRE-0017-shaped live client: active, planless (the RPR shape)
  const legacy = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1, $2, 'active') returning id",
    [w.firms.A, `wbr3_pre0017_${opk("x")}`])).rows[0].id;
  await seedOpeningCoa(w.users.alice, legacy);
  const call = (k) => humanQuery(w.users.hana,
    "select clara.bootstrap_client_plan(p_client => $1, p_op_key => $2) as r", [legacy, k]);
  const key = opk("boot");
  const r1 = (await call(key)).rows[0].r;
  const r2 = (await call(key)).rows[0].r;
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "idempotent (byte-identical replay)");
  const plans = await rootQuery("select id from clara.onboarding_plans where client_id=$1", [legacy]);
  assert.equal(plans.rows.length, 1, "exactly ONE plan bootstrapped");
  assert.equal((await clientRow(legacy)).status, "active", "the active client STAYS active");
  const ma = await filedDocument(w.users.alice, { firm: w.firms.A, client: legacy, kind: "management_account" });
  const seedR = await createOpeningSeed(w.users.bob, {
    client: legacy, plan: plans.rows[0].id, tieDocument: ma.documentId, tieSha256: ma.sha256 });
  assert.ok(seedR.seed_id ?? seedR.id, "the bootstrap UNLOCKS create_opening_seed (the B-12 positive receipt)");
});

test("[R3-F3a]: the correction-REVERSAL author joins the contributors — refused as Gate-O committer", async () => {
  fail0017(live);
  // PROBED nuance (report-flagged): a NULL-replacement supersede always breaks
  // the doc tie, so commit is POSITION-BLOCKED ('an opening position is
  // required') before the contributor check can be reached — that block itself
  // closes the pure-null laundering window at commit time, and the null-path
  // contributor RECORD is certified by the migration tail (R4 re-verifies).
  // The commit-REACHABLE form probed here: the reversal author supersedes WITH
  // a tie-preserving replacement in the same audited call; the correction is
  // checked by a clean admin; the REVERSAL AUTHOR must still be refused.
  const o = await onboardingClient(w.users.hana); // opener: hana
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan }); // makers: bob
  await approveOpeningSeed(w.users.hana, { // K5 checker: hana (already the opener)
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("f3base"),
  });
  const cashItem = (await openingItemRows(st.seed)).find((i) => i.item_key === "gl:cash");
  await supersedeOpeningItem(w.users.alice, {
    item: cashItem.id,
    replacement: {
      item: { item_kind: "gl_balance", item_key: "gl:cash:r3a" },
      lines: [{ account_code: WB_COA.cash, debit_cents: 10_500_000, credit_cents: 0 }],
    },
    opKey: opk("f3sup"),
  });
  const corrDrafts = (await rootQuery(
    "select id, revision_token from clara.journal_entries where client_id=$1 and status='draft'", [o.client]))
    .rows.map((r) => ({ entry_id: r.id, revision_token: r.revision_token }));
  const { approveOpeningCorrection } = await import("./wb-fixtures.mjs");
  await approveOpeningCorrection(uma, { seed: st.seed, entryRevisions: revMapOf(corrDrafts), opKey: opk("f3acor") });
  await assertRaises(CLR.makerChecker, async () => commitOnboarding(w.users.alice, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f3a"),
  }), "the reversal/correction author IS a substantive opening-position maker");
  await commitOnboarding(ivan, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f3b") });
  assert.equal((await clientRow(o.client)).status, "active", "a clean admin still commits");
});

test("[R3-F3b]: K5 AND K6 CHECKERS join the contributors (one policy) — each refused as committer", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana); // opener: hana
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan }); // makers: bob
  await approveOpeningSeed(w.users.alice, { // K5 checker: ALICE (otherwise clean on this plan)
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("f3c"),
  });
  await assertRaises(CLR.makerChecker, async () => commitOnboarding(w.users.alice, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f3d"),
  }), "the K5 checker is a contributor");
  // the K6 half (ordered addition): a tie-preserving correction checked by UMA
  const cashItem = (await openingItemRows(st.seed)).find((i) => i.item_key === "gl:cash");
  await supersedeOpeningItem(w.users.bob, {
    item: cashItem.id,
    replacement: {
      item: { item_kind: "gl_balance", item_key: "gl:cash:v2" },
      lines: [{ account_code: WB_COA.cash, debit_cents: 10_500_000, credit_cents: 0 }],
    },
    opKey: opk("f3sup2"),
  });
  const corrDrafts = (await rootQuery(
    "select id, revision_token from clara.journal_entries where client_id=$1 and status='draft'", [o.client]))
    .rows.map((r) => ({ entry_id: r.id, revision_token: r.revision_token }));
  const { approveOpeningCorrection } = await import("./wb-fixtures.mjs");
  await approveOpeningCorrection(uma, { seed: st.seed, entryRevisions: revMapOf(corrDrafts), opKey: opk("f3cor") });
  await assertRaises(CLR.makerChecker, async () => commitOnboarding(uma, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f3f"),
  }), "the K6 checker is a contributor — ONE policy across K5/K6 (the pin)");
  await commitOnboarding(ivan, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f3e") });
  assert.equal((await clientRow(o.client)).status, "active", "the clean admin commits");
});

test("[R3-F4]: an initial fixed asset is 'pending' while its entry is DRAFT and turns active EXACTLY at K5; a tampered baseline refuses", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  for (const [code, name, type] of [[WB_COA.faAsset, "P&M", "asset"], [WB_COA.faAccum, "Accum P&M", "asset"], [WB_COA.faExp, "Depr Exp", "expense"]]) {
    await upsertAccountClassed(w.users.alice, { client: o.client, code, name, type });
  }
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const seed = sr.seed_id ?? sr.id;
  const far = await seedFixedAsset(w.users.bob, { client: o.client, seed, asset: {
    description: "Initial rig asset", acquired_date: "2024-02-01", cost_cents: 500_000,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
    depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
    depreciation_start_date: "2024-02-01", residual_cents: 0, item_key: "fa:init",
  } });
  const faId = far.fixed_asset_id ?? far.asset_id;
  const fa0 = await faRow(faId);
  const faEntry = await entryRow(fa0.acquisition_entry_id);
  assert.equal(faEntry.status, "draft", "the acquisition entry is draft at seed time");
  assert.equal(fa0.status, "pending", "[R3-F4] draft entry ↔ PENDING asset (never active pre-approval)");
  await recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: WB_COA.faAsset, source_label: "fa", debit_cents: 500_000, credit_cents: 0 },
    { line_key: "faacc", account_code: WB_COA.faAccum, source_label: "faacc", debit_cents: 0, credit_cents: 100_000 },
    { line_key: "cap", account_code: WB_COA.shareCap, source_label: "cap", debit_cents: 0, credit_cents: 400_000 },
  ] });
  const cap = await draftOpeningItem(w.users.bob, {
    client: o.client, seed, resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 400_000 }] });
  const revs = revMapOf([cap, { entry_id: fa0.acquisition_entry_id, revision_token: faEntry.revision_token }]);
  await rootQuery("update clara.fixed_assets set accumulated_depreciation_cents = accumulated_depreciation_cents + 7000 where id=$1", [faId]);
  await assertRaises(CLR_OPENING, async () => approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(o.plan), tieSha256: doc.sha256, entryRevisions: revs, opKey: opk("f4bad"),
  }), "the baseline assert refuses a mismatched register row");
  assert.equal((await faRow(faId)).status, "pending", "still pending after the refused approval (atomicity)");
  await rootQuery("update clara.fixed_assets set accumulated_depreciation_cents = accumulated_depreciation_cents - 7000 where id=$1", [faId]);
  await approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(o.plan), tieSha256: doc.sha256, entryRevisions: revs, opKey: opk("f4ok"),
  });
  assert.equal((await faRow(faId)).status, "active", "[R3-F4] approved entry ↔ ACTIVE asset — exactly at K5");
  assert.equal((await seedRegRow(seed)).state, "finalized", "the set finalized");
});
