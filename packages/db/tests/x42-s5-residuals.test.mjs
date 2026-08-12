// Wave D-b (0042) — x42.s5: THE D-a RESIDUAL FIXES (design §6; ABI §D/§E/§F).
//   x42.s5.1  G10 — `dispose_fixed_asset` refuses a SECOND proposal while an outstanding
//             disposal draft sits on the asset — CLR39 `disposal_draft_outstanding`.
//             Withdraw OR approve the first draft and a new disposal proceeds.
//   x42.s5.2  G11 — the 64-EDGE WRITER GUARD, all THREE minting paths: (a)
//             `revise_fixed_asset_particulars`, (b) the partial-split successor
//             (`dispose_fixed_asset`'s `p_cost_portion_cents`), (c) the K6 opening-item
//             replacement. Each refuses the 65th supersede edge (CLR37
//             `fa_lineage_too_deep`); the 64th edge SUCCEEDS on every path (64/65 parity).
//   x42.s5.3  G12 — `fixed_assets.cost_cents` gains NOT NULL; BOTH 0017 validator sites
//             that let a NULL slip through pre-0042 gain a cost-only IS NULL disjunct — the
//             composer site and the seed/activation site, reached via `draft_opening_item`
//             and `seed_fixed_asset` respectively (both refuse by name; see the adjudication
//             below for why one errcode, not two, is the correct reading).
//   x42.s5.4  G14 — the split-month advisory: a revision successor whose `effective_from`
//             falls past day 1 surfaces a derived (never stored) advisory via
//             `get_fixed_asset` AND the revise response; a day-1 successor and a disposal
//             split's continuing successor carry none. No arithmetic change — proven by
//             running the period.
//
// CONTRACT-BLIND: authored from docs/plan/completed/wave-d-b-design.md §6 + -abi.md §D/§E/§F +
// docs/plan/completed/wave-d-contract.md §4 ONLY — never 0042's SQL. The 0041 LIVE surface
// (0041_wave_d_a_fa_register.sql + x41-fa-fixtures.mjs) is fair precedent — it is what
// G10/G11/G12/G14 recut, additively. Every refusal is asserted by its PINNED reason token
// (ABI §F) and, where stated (G10's CLR39 vs 0041's pre-existing CLR37 on the SAME token;
// G12's CLR10 vs CLR31), by its errcode too — a divergence at integration is a FINDING.
//
// THE NAMED DISCREPANCY, NOW ADJUDICATED (integration pass). This file was authored
// expecting G12's two sites to give (a)/(b) DIFFERENT errcodes for the identical
// missing-cost_cents defect. They cannot: `seed_fixed_asset` delegates to
// `_draft_opening_item_core`, and BOTH validator arms live in that one body, reading the one
// `p_item->'asset'`, with the CLR10 lines-pass arm strictly before the CLR31 register-pass
// arm. The BUILD is right; x42.s5.3b now asserts CLR10 by name and pins the far arm with a
// catalog probe. Design §6.3's "both sites" is an instruction about SPLICE SITES.
//
// G11's three chains are each built to depth 63 CHEAPLY via chained revisions (design
// §6.2) before the path-under-test mints the boundary 64th/65th edge — the x41.u4
// (x41-round46.test.mjs) precedent. Path (c) needs a raw fixture write too — see x42.s5.2c.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf, noteLane, markSkip, endPool, printLaneNotes, printSkipCount,
  refuses, caught, reasonToken, approveEntry, upsertAccountClassed,
  COST, ACCUM, EXPENSE, BANK, GAIN, LOSS, mon, dayIn,
  faWorld, faRow, chargeRows, entryRowOf, openingItemRowsOf,
  freshFaClient, buyAsset, completeSL, reviseParticulars, disposeAsset, disposeAndSettle,
  getFixedAsset, kSeededFaClient, liveAuthority, earnRamp, runAndSettle, wb,
} from "./x41-fa-world.mjs";
import { withdrawDraft } from "./s6-fixtures.mjs";
import {
  x42S5Ready, x42S5SkipHere, lineageDepth, chainDate, reviseChain, findAdvisory,
  draftOpeningCoreMarkerCount, baselineMissingCost,
} from "./x42-s5-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42S5Ready();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x42-s5-residuals");
  printSkipCount("x42-s5-residuals");
  await endPool();
});

// Readiness lives in x42-s5-helpers.mjs (the two-part 0041-anchor + 0042-catalog gate).
const skipHere = (t) => x42S5SkipHere(t, live);

const TOO_DEEP = "fa_lineage_too_deep";

// The lineage walker (`lineageDepth`), the chained-revision date + driver (`chainDate` /
// `reviseChain`), the both-arms catalog probe (`draftOpeningCoreMarkerCount`) and the
// advisory reader (`findAdvisory`) all live in x42-s5-helpers.mjs — instruments, not cells,
// and this file sits at the repo's 500-line ceiling.

// ===========================================================================
// x42.s5.1 — G10: THE SECOND-DISPOSAL DRAFT GUARD (both lawful remedies).
// ===========================================================================

test("x42.s5.1 G10: an outstanding disposal draft refuses a SECOND dispose_fixed_asset with CLR39 disposal_draft_outstanding; withdrawing OR approving the first draft each let a new disposal proceed", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s51");
  const start = mon(-3);
  // High-stakes (well above the firm's RM10,000 threshold, the x41.g5 precedent) so BOTH
  // proposals below DRAFT and stay genuinely outstanding for the second call to meet.
  const buyOne = () => buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  const complete = (asset) => completeSL(client, asset.id, { life: 24, start: start.start, description: "x42 s5.1" });
  const proposeFirst = (asset) => disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.1 first disposal",
  });

  // --- REMEDY 1: withdraw the outstanding draft. ---
  const { asset: assetW } = await buyOne();
  await complete(assetW);
  const firstW = await proposeFirst(assetW);
  const firstEntryW = idOf(firstW, "entry_id", "id");
  assert.ok(firstEntryW, `dispose_fixed_asset names its entry (got ${JSON.stringify(firstW)})`);
  const firstRowW = await entryRowOf(firstEntryW);
  assert.equal(firstRowW.status, "draft", "mandatory setup: the high-stakes disposal really DRAFTS and stays outstanding");

  const err = await refuses(() => disposeAsset(w.users.alice, {
    client, asset: assetW.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.1 second disposal (must refuse)",
  }), "disposal_draft_outstanding", "a second dispose_fixed_asset while the first draft is outstanding");
  assert.equal(err.code, "CLR39",
    `G10's second-draft guard is a NEW 0042 door on dispose_fixed_asset itself and must raise CLR39 — the SAME reason token at the pre-existing revise-door raises CLR37 instead, so the errcode discriminates which door fired (got ${err.code})`);
  const disposalEntries = (await rootQuery(
    "select id from clara.journal_entries where client_id=$1 and flags ? 'fa_disposal' order by created_at", [client])).rows;
  assert.deepEqual(disposalEntries.map((r) => r.id), [firstEntryW], "the refused second call minted NO poison draft");
  assert.equal((await faRow(assetW.id)).status, "active", "…and the register row is untouched — still active");

  await withdrawDraft(w.users.alice, {
    entry: firstEntryW, expectedRevision: firstRowW.revision_token, reason: "x42 s5.1 withdraw to clear the freeze",
    opKey: opk("x42s51wd"),
  });
  assert.equal((await entryRowOf(firstEntryW)).status, "withdrawn", "the first draft is withdrawn");
  const second = await disposeAndSettle(w.users.alice, {
    client, asset: assetW.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.1 disposal after withdraw",
  });
  assert.ok(second.entryId, "a new disposal proceeds once the outstanding draft is withdrawn");
  assert.equal((await faRow(assetW.id)).status, "disposed", "…and the register row really disposes this time");

  // --- REMEDY 2: approve the outstanding draft instead, on a SECOND asset. ---
  const { asset: assetA } = await buyOne();
  await complete(assetA);
  const firstA = await proposeFirst(assetA);
  const firstEntryA = idOf(firstA, "entry_id", "id");
  const firstRowA = await entryRowOf(firstEntryA);
  assert.equal(firstRowA.status, "draft", "mandatory setup: the second asset's disposal also drafts");
  await refuses(() => disposeAsset(w.users.alice, {
    client, asset: assetA.id, disposalDate: mon(-1).end, proceedsCents: 1,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.1 second disposal on asset A (must refuse)",
  }), "disposal_draft_outstanding", "a second dispose_fixed_asset on asset A while its first is outstanding");
  // A DISTINCT checker: the dispose verb stamps last_human_editor = the maker.
  await approveEntry(w.users.hana, { entry: firstEntryA, expectedRevision: firstRowA.revision_token, opKey: opk("x42s51bapr") });
  assert.equal((await faRow(assetA.id)).status, "disposed", "…and approving the outstanding draft ALSO clears the freeze — the register row disposes");

  // Now disposed — a THIRD attempt refuses for a pre-existing reason, never this guard.
  const err3 = await caught(() => disposeAsset(w.users.alice, {
    client, asset: assetA.id, disposalDate: mon(0).end, proceedsCents: 1, proceedsAccount: BANK,
  }));
  assert.ok(err3, "a third disposal attempt on an already-disposed asset is refused");
  assert.notEqual(reasonToken(err3), "disposal_draft_outstanding",
    `…for a reason OTHER than the second-draft guard (got reason='${reasonToken(err3)}')`);
  noteLane("x42.s5.1 G10: second-draft guard fires by name+errcode; both withdraw and approve clear the freeze for a fresh disposal");
});

// ===========================================================================
// x42.s5.2 — G11: THE 64-EDGE WRITER GUARD, THREE MINTING PATHS.
// ===========================================================================

test("x42.s5.2a G11 path (a) revise_fixed_asset_particulars: the 64th edge succeeds, the 65th refuses CLR37 fa_lineage_too_deep", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s52a");
  const { asset } = await buyAsset({ client, cents: 300_000, postingDate: mon(-8).start, memo: "x42 s52a root" });
  await completeSL(client, asset.id, { life: 600, start: mon(-8).start, description: "x42 s52a" });
  const particulars = { method: "straight_line", useful_life_months: 600, residual_cents: 0, start_date: mon(-8).start };

  const t0 = Date.now();
  const leaf63 = await reviseChain(w.users.alice, client, asset.id, 63, particulars, "x42.s5.2a");
  noteLane(`x42.s5.2a built a 63-edge revision chain in ${Date.now() - t0} ms`);
  assert.equal(await lineageDepth(leaf63), 63, "mandatory setup: the cheap chain is really 63 edges deep");

  // THE 64th EDGE — parity: still admitted.
  await reviseParticulars(w.users.alice, { client, asset: leaf63, effectiveFrom: chainDate(63), particulars });
  const leaf64 = (await faRow(leaf63)).superseded_by_asset_id;
  assert.ok(leaf64, "G11 parity: the 64th edge SUCCEEDS on the revise path");
  assert.equal(await lineageDepth(leaf64), 64, "…landing at exactly depth 64");

  // THE 65th EDGE — refused, writer-side, by name.
  const err = await refuses(() => reviseParticulars(w.users.alice,
    { client, asset: leaf64, effectiveFrom: chainDate(64), particulars }), TOO_DEEP, "the 65th edge on the revise path");
  assert.equal(err.code, "CLR37", `writers: the 65th edge is pinned to CLR37 (ABI §F) — got ${err.code}`);
  assert.equal(await lineageDepth(leaf64), 64, "the refused 65th edge minted NO successor — depth is unchanged");
  assert.equal((await faRow(leaf64)).status, "active", "…and the depth-64 leaf stays active, not superseded");
});

test("x42.s5.2b G11 path (b) the partial-split successor (dispose with p_cost_portion_cents < cost): the 64th edge succeeds, the 65th refuses CLR37 fa_lineage_too_deep", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s52b");
  const COST_CENTS = 5_000_000; // well below the RM10,000 threshold, so every small split auto-posts
  const { asset } = await buyAsset({ client, cents: COST_CENTS, postingDate: mon(-8).start, memo: "x42 s52b root" });
  await completeSL(client, asset.id, { life: 600, start: mon(-8).start, description: "x42 s52b" });
  const particulars = { method: "straight_line", useful_life_months: 600, residual_cents: 0, start_date: mon(-8).start };

  const t0 = Date.now();
  const leaf63 = await reviseChain(w.users.alice, client, asset.id, 63, particulars, "x42.s5.2b");
  noteLane(`x42.s5.2b built a 63-edge revision chain (the CHEAP base, design §6.2) in ${Date.now() - t0} ms`);
  assert.equal(await lineageDepth(leaf63), 63, "mandatory setup: the cheap base chain is 63 edges deep");
  assert.equal(Number((await faRow(leaf63)).cost_cents), COST_CENTS, "…and revision never touches cost — the split below has plenty of room");

  // THE 64th EDGE — via the SPLIT door (superseded_by_asset_id names the CONTINUING successor).
  const split1 = await disposeAndSettle(w.users.alice, {
    client, asset: leaf63, disposalDate: chainDate(63), proceedsCents: 500, proceedsAccount: BANK,
    gainAccount: GAIN, lossAccount: LOSS, costPortionCents: 1_000, memo: "x42 s5.2b 64th edge split",
  });
  assert.ok(split1.entryId, `G11 parity: the 64th edge SUCCEEDS on the partial-split path (got ${JSON.stringify(split1)})`);
  const leaf64 = (await faRow(leaf63)).superseded_by_asset_id;
  assert.ok(leaf64, "…and named a continuing successor");
  assert.equal(await lineageDepth(leaf64), 64, "…at exactly depth 64");
  assert.equal((await faRow(leaf64)).status, "active", "…the continuing successor stays active — splittable again");

  // THE 65th EDGE — refused; either door may own it (the x41.u4 tolerant-door precedent).
  const err = await caught(() => disposeAndSettle(w.users.alice, {
    client, asset: leaf64, disposalDate: chainDate(64), proceedsCents: 500, proceedsAccount: BANK,
    gainAccount: GAIN, lossAccount: LOSS, costPortionCents: 1_000, memo: "x42 s5.2b 65th edge split (must refuse)",
  }));
  assert.ok(err, "G11: the 65th edge on the partial-split path is refused");
  const got = reasonToken(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  assert.ok(got === TOO_DEEP || blob.includes(TOO_DEEP),
    `the 65th split edge must name '${TOO_DEEP}'; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`);
  assert.equal(await lineageDepth(leaf64), 64, "the refused 65th split minted NO successor — depth unchanged");
  noteLane(`x42.s5.2b G11 path (b): the 65th split edge refused with reason='${got}' code=${err.code}`);
});

test("x42.s5.2c G11 path (c) the K6 opening-item replacement: the 64th edge succeeds, the 65th refuses CLR37 fa_lineage_too_deep", async (t) => {
  if (skipHere(t)) return;
  // First: prove the MECHANISM genuinely chains — one REAL K6 correction (supersede +
  // approve_opening_correction) off a K-seeded opening item, end to end.
  const k = await kSeededFaClient("s52c");
  const items = await openingItemRowsOf(k.seed);
  const faItem = items.find((i) => i.item_kind === "fixed_asset");
  assert.ok(faItem, "mandatory setup: the K-seed carries a fixed_asset opening item");

  const asset1 = {
    description: "x42 s5.2c K6 hop", acquired_date: mon(-24).start, cost_cents: k.cost,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
    accumulated_depreciation_cents: k.accum, depreciation_start_date: mon(-24).start, residual_cents: 0,
  };
  const sup1 = await wb.supersedeOpeningItem(w.users.bob, {
    item: faItem.id,
    replacement: { item: { item_kind: "fixed_asset", item_key: `${faItem.item_key}:s52c1` }, asset: asset1 },
    opKey: opk("x42s52c-k6-1"),
  });
  assert.ok(sup1?.replacement_entry_id, `the K6 supersede DRAFTED a replacement (got ${JSON.stringify(sup1)})`);
  const revs1 = await wb.revMapOf([
    { entry_id: sup1.reversal_entry_id, revision_token: sup1.reversal_revision_token },
    { entry_id: sup1.replacement_entry_id, revision_token: (await entryRowOf(sup1.replacement_entry_id)).revision_token },
  ]);
  await wb.approveOpeningCorrection(w.users.hana, { seed: k.seed, entryRevisions: revs1, opKey: opk("x42s52c-k6-1a") });
  const item1 = (await openingItemRowsOf(k.seed)).find((i) => i.item_key === `${faItem.item_key}:s52c1`);
  assert.ok(item1?.fixed_asset_id, "the approved K6 correction linked its opening item to a real register row");
  const id1 = item1.fixed_asset_id;
  assert.equal(await lineageDepth(id1), 1, "the ONE real K6 hop is genuinely a single supersede edge");
  noteLane("x42.s5.2c the K6 mechanism chains for real: one supersede+approve minted a live successor register row");

  // Now build the BULK of the depth cheaply, off id1, per design §6.2 ("Build lineage
  // cheaply by chaining revisions") — a revision successor is ordinary regardless of origin.
  const particulars = { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: mon(-24).start };
  const t0 = Date.now();
  const leaf63 = await reviseChain(w.users.alice, k.client, id1, 62, particulars, "x42.s5.2c");
  noteLane(`x42.s5.2c built a 62-edge cheap revision chain off the K6-born row in ${Date.now() - t0} ms`);
  assert.equal(await lineageDepth(leaf63), 63, "mandatory setup: 1 (K6) + 62 (revise) = 63 edges deep");
  await reviseParticulars(w.users.alice, { client: k.client, asset: leaf63, effectiveFrom: chainDate(62), particulars });
  const leaf64 = (await faRow(leaf63)).superseded_by_asset_id;
  assert.equal(await lineageDepth(leaf64), 64, "…and one more cheap revision reaches exactly depth 64 (the far boundary this cell needs)");

  // No audited verb lets item1 (the K6 anchor) TRACK a row reached only through revisions —
  // the K6 composer reads `old.fixed_asset_id` off the OPENING ITEM directly and no verb
  // re-points it; 64 real K6 hops would cost roughly double for no extra guard coverage.
  // item1 is retargeted at the cheap chain's leaves — a root fixture write, the
  // x41-fa-world.mjs "no audited verb reaches this shape" precedent (`approvedControlEntry`).
  // The lookup checks ONLY the opening item's `state='active'` (never the row's own
  // status), untouched by an UNAPPROVED supersede (the flip is in approve_opening_
  // correction, never called below) — item1 stays a lawful anchor across both retargets.
  let retargetsOk = true;
  try {
    await rootQuery("update clara.opening_items set fixed_asset_id=$1 where id=$2", [leaf64, item1.id]);
  } catch (e) {
    retargetsOk = false;
    markSkip();
    noteLane(`x42.s5.2c CONCERN: the fixture's raw retarget of opening_items.fixed_asset_id was refused (${e.code ?? "?"} ${e.message}) — opening_items likely carries an immutability trigger beyond the audited K6 path. The boundary cells could not be constructed this way; verify G11 path (c) via a different fixture once 0042 is assembled. The one-real-hop mechanism cell above still stands.`);
  }
  if (retargetsOk) {
    // ORDER: 65th FIRST, THEN 64th — measured at integration, and it is 0017/0018 law, not
    // anything 0042 changed. `supersede_opening_item` demands `s.state='finalized'` ("opening
    // item correction requires a finalized seed", CLR31 `registry_not_open`) and then, as its
    // own comment says, "K6 opens its own correction batch" by flipping the seed to 'open'.
    // An UNAPPROVED K6 draft therefore leaves the seed OPEN, and a second supersede in the
    // same batch never reaches the depth guard at all — the settled precedent is
    // wave-b/wb-0018-lane-guards.test.mjs §3 ("a second supersede while the seed is open
    // (sequential per-item ceremonies)"). A REFUSED call rolls its whole transaction back,
    // the seed flip included, so the far-boundary probe leaves the finalized seed the one
    // real approved hop above created — which is exactly what the parity draft then needs.
    // The 64/65 parity claim is untouched: 64 admitted, 65 refused, both on the K6 path.

    // --- THE 65th EDGE — refused, writer-side, by name and errcode. ---
    const err = await refuses(() => wb.supersedeOpeningItem(w.users.bob, {
      item: item1.id,
      replacement: { item: { item_kind: "fixed_asset", item_key: `${faItem.item_key}:s52c-65` }, asset: asset1 },
      opKey: opk("x42s52c-k6-65"),
    }), TOO_DEEP, "the 65th edge on the K6 path (from a retargeted depth-64 anchor)");
    assert.equal(err.code, "CLR37", `writers: the 65th edge is pinned to CLR37 (ABI §F) — got ${err.code}`);
    assert.equal((await openingItemRowsOf(k.seed)).some((i) => i.item_key === `${faItem.item_key}:s52c-65`), false,
      "the refused 65th K6 edge minted NO replacement opening item");

    // --- THE 64th EDGE — parity: still admitted, from the depth-63 anchor. ---
    await rootQuery("update clara.opening_items set fixed_asset_id=$1 where id=$2", [leaf63, item1.id]);
    const sup64 = await wb.supersedeOpeningItem(w.users.bob, {
      item: item1.id,
      replacement: { item: { item_kind: "fixed_asset", item_key: `${faItem.item_key}:s52c-64` }, asset: asset1 },
      opKey: opk("x42s52c-k6-64"),
    });
    assert.ok(sup64?.replacement_entry_id,
      `G11 parity: the 64th edge SUCCEEDS on the K6 path (from a retargeted depth-63 anchor) — got ${JSON.stringify(sup64)}`);
    const item64 = (await openingItemRowsOf(k.seed)).find((i) => i.item_key === `${faItem.item_key}:s52c-64`);
    assert.ok(item64?.fixed_asset_id, "the K6 64th-edge correction linked its opening item to a real register row");
    assert.equal(await lineageDepth(item64.fixed_asset_id), 64, "…landing at exactly depth 64 via the K6 path");
  }
});

// ===========================================================================
// x42.s5.3 — G12: cost_cents NOT NULL, BOTH 0017 VALIDATOR DOORS.
// ===========================================================================

/** A fresh onboarding client + seed + FA chart — shared setup for both G12 cells. */
async function freshOpeningSeedForFa(label) {
  const o = await wb.onboardingClient(w.users.hana, `x42s53_${label}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  for (const [code, name, type] of [
    [COST, "Plant & Machinery (x42 s53)", "asset"],
    [ACCUM, "Accum Depreciation (x42 s53)", "asset"],
    [EXPENSE, "Depreciation Expense (x42 s53)", "expense"],
  ]) {
    await upsertAccountClassed(w.users.alice, { client: o.client, code, name, type });
  }
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  return { client: o.client, plan: o.plan, seed: sr.seed_id ?? sr.id, doc };
}

// `baselineMissingCost` (the books-grade-complete FA baseline with cost_cents OMITTED) is in
// x42-s5-helpers.mjs — a fixture, not a cell, and this file is at the 500-line ceiling.

test("x42.s5.3a G12 the CLR10 composer door: draft_opening_item with a fixed_asset payload missing cost_cents refuses CLR10", async (t) => {
  if (skipHere(t)) return;
  const s = await freshOpeningSeedForFa("53a");
  const asset = baselineMissingCost("fa:x42s53a");
  const err = await caught(() => wb.draftOpeningItem(w.users.bob, {
    client: s.client, seed: s.seed,
    item: { item_kind: "fixed_asset", item_key: asset.item_key, asset },
    resolution: wb.freshResolution(w.users.bob, s.client, { subjectKind: "document", subjectId: s.doc.documentId }),
    document: s.doc.documentId, sha256: s.doc.sha256,
    opKey: opk("x42s53a"),
  }));
  assert.ok(err, "G12: a fixed_asset item whose baseline OMITS cost_cents is refused at the composer door");
  assert.equal(err.code, "CLR10",
    `the composer door (0017's FIRST fixed_asset validator block, via draft_opening_item) is pinned CLR10 (ABI §F / design §6.3) — got ${err.code} — ${err.message}`);
  assert.equal((await openingItemRowsOf(s.seed)).length, 0, "…and no opening item, register row, or draft entry was minted");
});

test("x42.s5.3b G12 the seed/activation verb: seed_fixed_asset with a payload missing cost_cents refuses by name at the composer arm (CLR10) — and the seed/activation arm carries the same disjunct, asserted in the catalog", async (t) => {
  if (skipHere(t)) return;
  const s = await freshOpeningSeedForFa("53b");
  const asset = baselineMissingCost("fa:x42s53b");
  const err = await caught(() => wb.seedFixedAsset(w.users.bob, { client: s.client, seed: s.seed, asset, opKey: opk("x42s53b") }));
  assert.ok(err, "G12: seed_fixed_asset with a baseline missing cost_cents is refused");
  // THE NAMED DISCREPANCY IN THIS FILE'S HEADER, ADJUDICATED AT INTEGRATION — the BUILD is
  // right and this cell's original CLR31 expectation was an over-reading. Design §6.3's "BOTH
  // 0017 validator sites" are two SPLICE SITES in ONE body, not two verbs; the mechanism and
  // the reason the far arm cannot fire are spelled out in full in the catalog assertion at the
  // foot of this cell, so that a red run PRINTS them. Asserting CLR31 here would have been
  // asserting an errcode the build cannot emit on this path.
  assert.equal(err.code, "CLR10",
    `seed_fixed_asset delegates to _draft_opening_item_core, whose composer arm refuses a NULL cost first and by name (ABI §F CLR10) — got ${err.code} — ${err.message}`);
  assert.match(String(err.message), /books-grade baseline is incomplete/,
    "…and it is the G12 books-grade refusal that fired, not a raw NOT NULL constraint violation");
  assert.equal((await openingItemRowsOf(s.seed)).length, 0, "…and no opening item, register row, or draft entry was minted");
  // THE FAR ARM, asserted the only honest way — a catalog probe, the [L2/6] tail-probe
  // precedent for a door closed by vacuity. "Both sites" is a real instruction: were the
  // register-pass arm left un-widened, any future refactor that moved the entry INSERT above
  // the lines pass would silently reopen the NULL-cost hole this cell exists to close.
  // [residue R3, ruled 2026-08-03: KEEP the dead disjunct, and say WHY in the text a red run
  // prints — else the next reader finds an arm no test reaches and deletes it.]
  assert.equal(await draftOpeningCoreMarkerCount("or v_cost is null"), 2,
    "G12 design §6.3: BOTH validator arms of _draft_opening_item_core carry the cost-only IS NULL "
    + "disjunct, and THE SECOND ONE IS DEAD ON PURPOSE. One body, two splice sites over the SAME "
    + "`p_item->'asset'`: the LINES pass (CLR10) runs strictly BEFORE the journal-entry INSERT, "
    + "the REGISTER pass (CLR31 tie_mismatch) strictly after it — so on a missing-cost payload the "
    + "first arm reads the identical value and refuses first, through EVERY public caller incl. "
    + "seed_fixed_asset (a thin wrapper onto this core). It is retained because the ORDER, not the "
    + "disjunct, is what makes it unreachable: move the INSERT above the lines pass and the CLR31 "
    + "arm is the only thing between a NULL cost and the register. DO NOT delete it for being "
    + "untested — it is untestable BEHAVIOURALLY, which is why it is pinned here (ABI §H.2).");
});

// ===========================================================================
// x42.s5.4 — G14: THE SPLIT-MONTH ADVISORY (derived, never stored; no arithmetic change).
//
// "NO ADVISORY" IS AN EMPTY ARRAY, NOT NULL — adjudicated at integration, the BUILD is
// right. `clara._fa_split_month_advisory` is `coalesce(jsonb_agg(...), '[]'::jsonb)` and
// `_fa_asset_json` publishes it beside a `split_month_advisory_count` of 0, so a quiet
// occurrence surfaces `[]`/0, never a null. Design §6.4 says the advisory is derived and
// surfaced; it never says its absence is spelled NULL — and a KEY that vanished entirely
// would be worse, since a reader could not tell "nothing to advise" from "this build has no
// advisory at all". `findAdvisory` (x42-s5-helpers.mjs) therefore measures EMPTINESS, and
// the `=== null` assertions below are unweakened: nothing advisory may be surfaced.
// ===========================================================================

test("x42.s5.4a G14: a revision effective PAST day 1 carries the advisory (get_fixed_asset AND the revise response) — and the predecessor still owns that whole month's charge, unchanged", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s54a");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 240_000, postingDate: start.start, memo: "x42 s5.4a" });
  await completeSL(client, asset.id, { life: 24, start: start.start, description: "x42 s5.4a" });
  await liveAuthority(client);
  await earnRamp(client, start); // month −3 charged on the (still) original row

  const effDay10 = dayIn(mon(-2), 10); // day 10 — PAST day 1
  const reviseResp = await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: effDay10,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: start.start },
  });
  const successorId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(successorId, "mandatory setup: the mid-month revision minted a successor");
  assert.equal((await faRow(asset.id)).status, "superseded", "…and the predecessor is superseded");

  assert.ok(findAdvisory(reviseResp) !== null, `G14: the revise response for a day-10 successor must carry the advisory (got ${JSON.stringify(reviseResp)})`);
  const gfa = await getFixedAsset(w.users.alice, successorId);
  assert.ok(findAdvisory(gfa) !== null, `G14: get_fixed_asset(successor) past day 1 must carry the advisory (got ${JSON.stringify(gfa)})`);

  const raw = await faRow(successorId); // NEVER STORED — no such column on the raw row.
  assert.ok(!Object.keys(raw).some((k) => /advisory/i.test(k)), `G14: the advisory is DERIVED, never persisted (got keys ${Object.keys(raw).join(",")})`);

  // NO ARITHMETIC CHANGE — the day-2+ month still belongs to the PREDECESSOR, unchanged.
  await runAndSettle(client, mon(-2));
  const predecessorCharges = await chargeRows(asset.id);
  const successorCharges = await chargeRows(successorId);
  assert.ok(predecessorCharges.some((c) => c.period_start === mon(-2).start && c.is_live),
    `G14 (day-2+ → predecessor, unchanged): the ancestor still owns mon(-2)'s WHOLE charge (got ${JSON.stringify(predecessorCharges)})`);
  assert.ok(!successorCharges.some((c) => c.period_start === mon(-2).start),
    `…and the successor charges NOTHING for that month (got ${JSON.stringify(successorCharges)})`);
});

test("x42.s5.4b G14: a revision effective ON day 1 carries NO advisory — and the successor still owns that whole month's charge, unchanged", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s54b");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 240_000, postingDate: start.start, memo: "x42 s5.4b" });
  await completeSL(client, asset.id, { life: 24, start: start.start, description: "x42 s5.4b" });
  await liveAuthority(client);
  await earnRamp(client, start); // month −3 charged
  await runAndSettle(client, mon(-2)); // month −2 charged

  const effDay1 = mon(-1).start; // day 1 — NOT past day 1
  const reviseResp = await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: effDay1,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: start.start },
  });
  const successorId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(successorId, "mandatory setup: the day-1 revision minted a successor");

  assert.equal(findAdvisory(reviseResp), null, `G14: a day-1 revise response must carry NO advisory (got ${JSON.stringify(reviseResp)})`);
  const gfa = await getFixedAsset(w.users.alice, successorId);
  assert.equal(findAdvisory(gfa), null, `G14: get_fixed_asset(successor) day-1 must carry NO advisory (got ${JSON.stringify(gfa)})`);

  await runAndSettle(client, mon(-1));
  const predecessorCharges = await chargeRows(asset.id);
  const successorCharges = await chargeRows(successorId);
  assert.ok(successorCharges.some((c) => c.period_start === mon(-1).start && c.is_live),
    `G14 (day-1 → successor, unchanged): the successor owns mon(-1)'s WHOLE charge (got ${JSON.stringify(successorCharges)})`);
  assert.ok(!predecessorCharges.some((c) => c.period_start === mon(-1).start),
    `…and the predecessor charges NOTHING for that month (got ${JSON.stringify(predecessorCharges)})`);
});

test("x42.s5.4c G14: a disposal split's continuing successor carries NO advisory, regardless of the disposal day (disposal splits are EXCLUDED)", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s54c");
  const { asset } = await buyAsset({ client, cents: 500_000, postingDate: mon(-6).start, memo: "x42 s5.4c" });
  await completeSL(client, asset.id, { life: 60, start: mon(-6).start, description: "x42 s5.4c" });

  const disposalDay15 = dayIn(mon(-1), 15); // day 15 — would trip the advisory on a REVISION
  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: disposalDay15, proceedsCents: 500, proceedsAccount: BANK,
    gainAccount: GAIN, lossAccount: LOSS, costPortionCents: 100_000, memo: "x42 s5.4c split",
  });
  assert.ok(split.entryId, "mandatory setup: the partial split posted");
  const continuingId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(continuingId, "…and named a continuing successor");

  const gfa = await getFixedAsset(w.users.alice, continuingId);
  assert.equal(findAdvisory(gfa), null, `G14: a disposal split's continuing successor carries NO advisory even on a day-15 disposal (got ${JSON.stringify(gfa)})`);
  const raw = await faRow(continuingId);
  assert.ok(!Object.keys(raw).some((k) => /advisory/i.test(k)), "…and no such column exists on the raw row either");
});
