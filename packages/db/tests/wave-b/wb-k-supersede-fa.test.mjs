// Wave-B battery — K6 the opening-dated supersede verb · K12 the B-12
// incremental lane (reopen → additive batch → whole-set tie) · K8/K9 the
// fixed-asset books-grade discipline (FORK-7). CONTRACT-BLIND; FAILS below 0017.
// [AMB-15] supersede_opening_item p_replacement shape — encoded as the K3-style
// {item, lines} object (null = reversal-only). Adjudication requested.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR30, rootQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady, checkDefs, hasColumn, detailReason,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc,
  createOpeningSeed, draftOpeningItem, recordParsedTargets,
  stageFullSet, WB_COA, revMapOf, planRevision,
  approveOpeningSeed, approveOpeningCorrection, supersedeOpeningItem,
  reopenOpeningSeed, seedFixedAsset,
  seedRegRow, openingItemRows, openingApprovalRows, entryRow, entryLines,
  faRow, eventsOf, freshResolution, upsertAccountClassed,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null;
let st = null; // the main FINALIZED 5-item set (approved in before)

const resOn = (sub, client, d) =>
  freshResolution(sub, client, d ? { subjectKind: "document", subjectId: d.documentId } : {});

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  st = await stageFullSet(w.users.bob, { owner: w.users.alice, client: onb.client, plan: onb.plan, firm: w.firms.A });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(onb.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("base"),
  });
});
after(async () => { printLaneNotes("wb-k-supersede-fa"); await endPool(); });

test("META: 0017 applied — the finalized base set stands", async () => {
  fail0017(live);
  assert.equal((await seedRegRow(st.seed)).state, "finalized", "base seed finalized");
});

test("K6: supersede drafts a reversal pair AT the opening date, both OB-flagged", async () => {
  fail0017(live);
  const arItem = (await openingItemRows(st.seed)).find((i) => i.item_key === "ar:cust1");
  assert.ok(arItem, "the AR item exists");
  const r = await supersedeOpeningItem(w.users.bob, {
    item: arItem.id,
    replacement: {
      item: { item_kind: "ar_open_item", item_key: "ar:cust1:v2", amount_cents: 3_000_000,
        counterparty_id: arItem.counterparty_id, item_ref: "SI-100R", item_date: "2025-12-15" },
    },
  });
  assert.ok(r, "supersede receipt returned");
  const reversalId = r.reversal_entry_id ?? r.reversal_id ?? null;
  assert.ok(reversalId, `receipt names the reversal draft (got ${JSON.stringify(r)})`);
  const rev = await entryRow(reversalId);
  assert.equal(rev.reversal_of, arItem.entry_id, "reversal_of set (reverse-not-delete)");
  assert.equal(rev.posting_date, "2026-01-01", "correction posts AT the as_of");
  assert.equal(rev.is_opening_balance, true, "the reversal is OB-flagged (SST exclusion covers corrections)");
  assert.equal(rev.status, "draft", "two-step: drafted, not yet approved");
  w._k6 = { arItem, receipt: r };
});

test("K6: approve_opening_correction — item superseded + linked, tie re-asserted, event emitted", async () => {
  fail0017(live);
  const { arItem } = w._k6;
  const items = await openingItemRows(st.seed);
  const openBatch = items.filter((i) => i.item_key === "ar:cust1:v2");
  assert.equal(openBatch.length, 1, "the replacement item row staged");
  const drafts = [];
  for (const eid of new Set([w._k6.receipt.reversal_entry_id ?? w._k6.receipt.reversal_id,
    openBatch[0].entry_id])) {
    const e = await entryRow(eid);
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  await approveOpeningCorrection(w.users.hana, {
    seed: st.seed, entryRevisions: revMapOf(drafts), opKey: opk("cor"),
  });
  const after1 = (await openingItemRows(st.seed)).find((i) => i.id === arItem.id);
  assert.equal(after1.state, "superseded", "the old item flipped superseded");
  assert.ok(after1.superseded_by_item, "superseded_by_item links the replacement");
  const evs = await eventsOf(w.firms.A, "opening_item.superseded", arItem.id);
  assert.equal(evs.length, 1, "opening_item.superseded emitted (LAST in the writer txn)");
});

test("K6: a SECOND supersede of the superseded item refuses", async () => {
  fail0017(live);
  await assertRaisesOneOf([CLR30, CLR.badRequest], () => supersedeOpeningItem(w.users.bob, {
    item: w._k6.arItem.id, replacement: null, opKey: opk("sup2"),
  }), "supersede on an already-superseded item");
});

test("K12: reopen is admin+ (bookkeeper refused), flips finalized→open, and is EVENTED", async () => {
  fail0017(live);
  await assertRaises(CLR.authz, () => reopenOpeningSeed(w.users.bob, { seed: st.seed }), "bookkeeper reopen");
  await reopenOpeningSeed(w.users.hana, { seed: st.seed, reason: "B-12: bank list arrived" });
  assert.equal((await seedRegRow(st.seed)).state, "open", "registry reopened");
  assert.equal((await eventsOf(w.firms.A, "opening_seed.reopened", st.seed)).length, 1, "opening_seed.reopened emitted");
});

test("K12: the K1 unique is untouched — a second seed STILL raises while reopened", async () => {
  fail0017(live);
  await assertRaises(CLR30, () => createOpeningSeed(w.users.bob, {
    client: onb.client, plan: onb.plan, opKey: opk("dupre"),
  }), "the double-seed RAISE holds forever (same registry row)");
});

test("K12: an ADDITIVE batch under the SAME as_of re-asserts the WHOLE opening set tie", async () => {
  fail0017(live);
  await upsertAccountClassed(w.users.alice, { client: onb.client, code: "930-000", name: "Capital Reserve", type: "equity" });
  await recordParsedTargets({ firm: w.firms.A, seed: st.seed, doc: st.doc, lines: [
    { line_key: "prepaid", account_code: WB_COA.expense, source_label: "prepaid", debit_cents: 1_000, credit_cents: 0 },
    { line_key: "capres", account_code: "930-000", source_label: "capres", debit_cents: 0, credit_cents: 1_000 },
  ] });
  const d1 = await draftOpeningItem(w.users.bob, {
    client: onb.client, seed: st.seed, resolution: resOn(w.users.bob, onb.client, st.doc),
    document: st.doc.documentId, sha256: st.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:prepaid" },
    lines: [{ account_code: WB_COA.expense, debit_cents: 1_000, credit_cents: 0 }] });
  const d2 = await draftOpeningItem(w.users.bob, {
    client: onb.client, seed: st.seed, resolution: resOn(w.users.bob, onb.client, st.doc),
    document: st.doc.documentId, sha256: st.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:capres" },
    lines: [{ account_code: "930-000", debit_cents: 0, credit_cents: 1_000 }] });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(onb.plan), tieSha256: st.doc.sha256,
    entryRevisions: revMapOf([d1, d2]), opKey: opk("addl"),
  });
  const reg = await seedRegRow(st.seed);
  assert.equal(reg.state, "finalized", "the additive batch re-finalizes");
  const approvals = await openingApprovalRows(st.seed);
  const batches = new Set(approvals.map((a) => a.batch_n));
  assert.ok(batches.size >= 2, `batch_n advanced across batches (got ${[...batches].join(",")})`);
});

test("K8: seed_fixed_asset — books-grade floor, baseline stamped, its OWN OB entry linked [AMB-8]", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  for (const [code, name, type] of [[WB_COA.faAsset, "Plant & Machinery", "asset"],
    [WB_COA.faAccum, "Accum Depr P&M", "asset"], [WB_COA.faExp, "Depreciation Expense", "expense"]]) {
    await upsertAccountClassed(w.users.alice, { client: o2.client, code, name, type });
  }
  const d2 = await openingDoc(w.users.alice, { firm: w.firms.A, client: o2.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: o2.client, plan: o2.plan, tieDocument: d2.documentId, tieSha256: d2.sha256 });
  const s2 = sr.seed_id ?? sr.id;
  const asset = {
    description: "Delivery van", acquired_date: "2024-03-01", cost_cents: 500_000,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
    depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
    depreciation_start_date: "2024-03-01", residual_cents: 0, item_key: "fa:van",
  };
  await assertRaises(CLR.badRequest, () => seedFixedAsset(w.users.bob, {
    client: o2.client, seed: s2, asset: { ...asset, acquired_date: null, item_key: "fa:bad" },
  }), "missing books-grade NOT NULL (acquired_date)");
  const err = await assertRaises(CLR30, () => seedFixedAsset(w.users.bob, {
    client: o2.client, seed: s2, asset: { ...asset, depreciation_method: "declining_balance", item_key: "fa:db" },
  }), "FORK-7: non-straight-line REFUSES per asset (CHECK not widened)");
  const reason = detailReason(err);
  if (reason) assert.equal(reason, "depreciation_method_unsupported", "typed FORK-7 reason");
  assert.match(await checkDefs("fixed_assets"), /straight_line/, "the depreciation CHECK is NOT widened this wave");
  const r = await seedFixedAsset(w.users.bob, { client: o2.client, seed: s2, asset });
  const faId = r.fixed_asset_id ?? r.asset_id;
  assert.ok(faId, `receipt names the register row (got ${JSON.stringify(r)})`);
  const fa = await faRow(faId);
  assert.equal(fa.baseline_as_of, "2026-01-01", "baseline_as_of = seed.as_of");
  assert.equal(Number(fa.accumulated_depreciation_cents), 100_000, "carried accum-dep is DB-validated human input");
  assert.ok(fa.acquisition_entry_id, "acquisition_entry_id NOT NULL on this path (P8 linkage)");
  const lines = await entryLines(fa.acquisition_entry_id);
  const leg = (code) => lines.find((l) => l.account_code === code);
  assert.equal(Number(leg(WB_COA.faAsset)?.debit_cents), 500_000, "K9: debit on the asset account = cost");
  assert.equal(Number(leg(WB_COA.faAccum)?.credit_cents), 100_000, "K9: credit on the accum account = carried accum");
  assert.equal(Number(leg(WB_COA.obe)?.credit_cents), 400_000, "NBV rides the OBE contra");
  w._k8 = { client: o2.client, plan: o2.plan, seed: s2, doc: d2, faId, fa };
});

test("K9: the per-asset tie binds the K5 approval — a tampered register row aborts (CLR30)", async () => {
  fail0017(live);
  const { client, plan, seed: s2, doc: d2, faId, fa } = w._k8;
  await recordParsedTargets({ firm: w.firms.A, seed: s2, doc: d2, lines: [
    { line_key: "fa", account_code: WB_COA.faAsset, source_label: "fa", debit_cents: 500_000, credit_cents: 0 },
    { line_key: "faacc", account_code: WB_COA.faAccum, source_label: "faacc", debit_cents: 0, credit_cents: 100_000 },
    { line_key: "cap", account_code: WB_COA.shareCap, source_label: "cap", debit_cents: 0, credit_cents: 400_000 },
  ] });
  const cap = await draftOpeningItem(w.users.bob, {
    client, seed: s2, resolution: resOn(w.users.bob, client, d2),
    document: d2.documentId, sha256: d2.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 400_000 }] });
  const faEntry = await entryRow(fa.acquisition_entry_id);
  const revs = revMapOf([cap, { entry_id: fa.acquisition_entry_id, revision_token: faEntry.revision_token }]);
  await rootQuery("update clara.fixed_assets set accumulated_depreciation_cents = accumulated_depreciation_cents + 5000 where id=$1", [faId]);
  await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed: s2, planRevision: await planRevision(plan), tieSha256: d2.sha256,
    entryRevisions: revs, opKey: opk("k9bad"),
  }), "_assert_fa_baseline catches the drifted register row");
  await rootQuery("update clara.fixed_assets set accumulated_depreciation_cents = accumulated_depreciation_cents - 5000 where id=$1", [faId]);
  await approveOpeningSeed(w.users.hana, {
    seed: s2, planRevision: await planRevision(plan), tieSha256: d2.sha256,
    entryRevisions: revs, opKey: opk("k9ok"),
  });
  assert.equal((await seedRegRow(s2)).state, "finalized", "the FA set finalizes once the baseline ties (Wave D continues from NBV)");
});

test("K8: post-approval the register row is IMMUTABLE except the disposal allowlist", async () => {
  fail0017(live);
  const { faId } = w._k8;
  assert.ok(await hasColumn("fixed_assets", "updated_at"), "updated_at added (absent as-built)");
  const err = await rootQuery("update clara.fixed_assets set description='repainted van' where id=$1", [faId])
    .then(() => null, (e) => e);
  assert.ok(err, "editing a linked asset's description is refused (corrections ride K6 supersede)");
  // K14 explicitly reuses the existing CLR13-style state-immutability class.
  assert.ok([CLR.immutable, CLR.badRequest, "CLR13"].includes(err.code),
    `immutability trigger errcode (got ${err.code})`);
  await rootQuery("update clara.fixed_assets set status='disposed', disposed_at=current_date where id=$1", [faId]);
  assert.equal((await faRow(faId)).status, "disposed", "the Wave-D disposal allowlist (disposed_at/status/updated_at) passes");
});
