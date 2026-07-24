// Wave-B battery — RATCHET ROUND-1 new-behavior cells, cut from the R1 memo's
// claims + the pins + the adjudications ledger (the 0017 SQL is still never
// read). EVERY [R1-Fn] cell encodes the FIXED behavior — they are EXPECTED to
// FAIL until the fix lane lands (pending-fix is the correct state).
// CLR_OPENING is the as-built opening-family code (AMB-17: literal CLR31).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR30 as CLR_OPENING, rootQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, WB_COA,
  createOpeningSeed, draftOpeningItem, recordOpeningTarget,
  recordOpeningTargetsParsed, stageBeeSet, revMapOf, planRevision,
  approveOpeningSeed, approveOpeningCorrection, supersedeOpeningItem,
  seedFixedAsset, openingItemRows, entryRow, entryLines, faRow, seedRegRow,
  approveEntry, reviseEntry, withdrawDraft, reverseEntry, freshResolution, keyedRes,
  commitOnboarding, updatePlan, clientRow, draftEntryV3,
  publishWikiPage, setBudget, WB_BUDGET_SEEDS, racePublishPages,
  createClient, upsertAccountClassed, recordParsedTargets,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

const resOn = (sub, client, doc = null) =>
  freshResolution(sub, client, doc ? { subjectKind: "document", subjectId: doc.documentId } : {});

/** A fresh onboarding client with CoA + a FINALIZED BEE set. */
async function finalizedSet() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("fin"),
  });
  return { ...o, ...st };
}

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-r1"); await endPool(); });

test("META: 0017 applied — the R1 pending-fix battery is armed", async () => {
  fail0017(live);
  assert.ok(w, "world built");
});

test("[R1-F1a]: generic approve/revise/withdraw each REFUSE an is_opening_balance draft (CLR31 named)", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan });
  const seed = sr.seed_id ?? sr.id;
  const d = await draftOpeningItem(w.users.bob, {
    // [AMB-0018-1] keyed lane → seed-bound mint (WB-R24(i)).
    client: o.client, seed, resolution: keyedRes(w.users.bob, { client: o.client, seed }),
    item: { item_kind: "gl_balance", item_key: "f1:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }],
  });
  await assertRaises(CLR_OPENING, () => approveEntry(w.users.hana, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("f1a"),
  }), "generic approve_entry on an OB draft (the K5 bypass the memo reproduced)");
  await assertRaises(CLR_OPENING, () => reviseEntry(w.users.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token,
    lines: [
      { account_code: WB_COA.cash, debit_cents: 2_000, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 2_000 },
    ],
    opKey: opk("f1b"),
  }), "generic revise_entry on an OB draft");
  await assertRaises(CLR_OPENING, () => withdrawDraft(w.users.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("f1c"),
  }), "generic withdraw_draft on an OB draft (would orphan the opening_items row)");
  assert.equal((await entryRow(d.entry_id)).status, "draft", "the OB draft is untouched — only the K family may mutate it");
  assert.equal((await seedRegRow(seed)).state, "open", "the registry stayed open (no side-door finalization)");
});

test("[R1-F1b]: generic reverse_entry REFUSES a K5-approved OB entry (corrections ride K6 only)", async () => {
  fail0017(live);
  const fin = await finalizedSet();
  const cashEntry = fin.drafts.cash.entry_id;
  await assertRaises(CLR_OPENING, () => reverseEntry(w.users.hana, {
    entry: cashEntry, reason: "generic reversal probe", opKey: opk("f1r"),
  }), "generic reverse_entry on an approved OB entry (would copy the flag onto a current-date reversal)");
});

test("[R1-F2a]: under a TIE-DOCUMENT registry the keyed human target writer REFUSES (document-primary is law)", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  await assertRaisesOneOf([CLR_OPENING, CLR.badRequest], () => recordOpeningTarget(w.users.bob, {
    seed: sr.seed_id ?? sr.id,
    line: { line_key: "keyed", account_code: WB_COA.cash, source_label: "keyed under doc",
      debit_cents: 500, credit_cents: 0, provenance_kind: "keyed", entered_by: w.users.bob },
  }), "a keyed target under a tie-document registry (the arbitrary-TB hazard)");
});

test("[R1-F2b]: extraction_ref must bind a REAL stored extraction row (an any-object ref refuses)", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  await assertRaisesOneOf([CLR_OPENING, CLR.badRequest, CLR.notFound], () => recordOpeningTargetsParsed({
    seed: sr.seed_id ?? sr.id, document: doc.documentId,
    lines: [{ line_key: "fab", account_code: WB_COA.cash, source_label: "fabricated",
      debit_cents: 777, credit_cents: 0,
      extraction_ref: { extraction_id: randomUUID(), region_id: randomUUID() } }],
  }), "a fabricated extraction_ref (no stored extraction evidence)");
});

test("[R1-F2c]: K5 REVALIDATES every filing/hash — a retired tie filing aborts the approval", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  await rootQuery(
    `update clara.document_filings set retired_at=now(), retired_by=$2,
       retirement_reason='R1-F2c staleness probe', revision_token=gen_random_uuid()
     where id=$1`, [st.doc.filingId, w.users.alice]);
  await assertRaisesOneOf([CLR_OPENING, CLR.provenance], async () => approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("f2c"),
  }), "approval over a tie document whose active filing went stale");
});

test("[R1-F3]: ONE canonical tie basis — a pre-as_of approved entry makes a doc-only-matching K5 REFUSE (never pass-then-lint-critical)", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  await commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) });
  const d = await draftEntryV3(w.users.alice, {
    client: o.client, resolution: freshResolution(w.users.alice, o.client),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 4_400, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 4_400 },
    ],
    postingDate: "2026-01-01", opKey: opk("f3pre"),
  });
  await approveEntry(w.users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("f3ap") });
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  await assertRaises(CLR_OPENING, async () => approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("f3"),
  }), "K5 over the memo's reproduction: targets match the document but ignore the pre-as_of ledger entry (dry-run, K5, and lint must share ONE basis)");
});

test("[R1-F7]: the page-count hard cap holds under a TWO-SESSION race at cap-1 (exactly one NEW slug wins)", async () => {
  fail0017(live);
  const c2 = await createClient(w.users.alice, { name: `wbr1cap_${opk("x")}`, opKey: opk("cli") });
  await setBudget("max_pages_per_client", 2);
  try {
    await publishWikiPage({ client: c2, firm: w.firms.A, slug: "base", title: "base" });
    const out = await racePublishPages({ firm: w.firms.A, client: c2, slugA: "race-x", slugB: "race-y" });
    const wins = [out.a?.ok, out.b?.ok].filter(Boolean).length;
    assert.equal(wins, 1, `EXACTLY one publish may take the last slot (got a=${JSON.stringify(out.a)} b=${JSON.stringify(out.b)})`);
    const n = await rootQuery("select count(*)::int as n from clara.wiki_pages where client_id=$1", [c2]);
    assert.ok(n.rows[0].n <= 2, `the ratified cap is never exceeded (got ${n.rows[0].n} pages)`);
  } finally {
    await setBudget("max_pages_per_client", WB_BUDGET_SEEDS.max_pages_per_client);
  }
});

test("[R1-F9]: obe_plug rides AMB-4 — lines REFUSED, amount from p_item, BOTH polarities resolve the OBE marker", async () => {
  fail0017(live);
  // polarity 1: cash Dr residual → OBE Cr 1,000 → plug must DEBIT OBE (amount -1000 per AMB-5)
  const oA = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, oA.client);
  const srA = await createOpeningSeed(w.users.bob, { client: oA.client, plan: oA.plan });
  const seedA = srA.seed_id ?? srA.id;
  // [AMB-0018-1] keyed lane → one seed-bound mint reused across seedA's items
  // (incl. the obe_plug-lines refusal probe, so it reaches the CLR10 lines check
  // rather than being blocked earlier at the binding assert).
  await draftOpeningItem(w.users.bob, {
    client: oA.client, seed: seedA, resolution: keyedRes(w.users.bob, { client: oA.client, seed: seedA }),
    item: { item_kind: "gl_balance", item_key: "f9:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }] });
  await assertRaises(CLR.badRequest, () => draftOpeningItem(w.users.bob, {
    client: oA.client, seed: seedA, resolution: keyedRes(w.users.bob, { client: oA.client, seed: seedA }),
    item: { item_kind: "obe_plug", item_key: "f9:pluglines", amount_cents: -1_000 },
    lines: [{ account_code: WB_COA.expense, debit_cents: 1_000, credit_cents: 0 }],
  }), "obe_plug with caller-supplied lines (AMB-4: any supplied lines are REJECTED)");
  const plugA = await draftOpeningItem(w.users.bob, {
    client: oA.client, seed: seedA, resolution: keyedRes(w.users.bob, { client: oA.client, seed: seedA }),
    item: { item_kind: "obe_plug", item_key: "f9:plug", amount_cents: -1_000 },
  });
  // AMB-4 CLARIFICATION (fix-round 1 ruling): the plug is one ITEM minting one
  // BALANCED entry — the OBE leg + the marker-resolved RE contra (a one-line
  // entry would violate the cardinal double-entry law).
  const linesA = await entryLines(plugA.entry_id);
  assert.equal(linesA.length, 2, "the plug mints exactly TWO legs (OBE + RE contra)");
  const obeA = linesA.find((l) => l.account_code === WB_COA.obe);
  const reA = linesA.find((l) => l.account_code === WB_COA.re);
  assert.ok(obeA && reA, "both legs resolved by MARKER, never literal codes");
  assert.equal(Number(obeA.debit_cents), 1_000, "negative amount = Dr on OBE (AMB-5 balance-sheet sign)");
  assert.equal(Number(reA.credit_cents), 1_000, "the RE contra balances the plug");
  // polarity 2: sharecap Cr residual → OBE Dr 1,000 → plug must CREDIT OBE (+1000)
  const oB = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, oB.client);
  const srB = await createOpeningSeed(w.users.bob, { client: oB.client, plan: oB.plan });
  const seedB = srB.seed_id ?? srB.id;
  await draftOpeningItem(w.users.bob, {
    client: oB.client, seed: seedB, resolution: keyedRes(w.users.bob, { client: oB.client, seed: seedB }),
    item: { item_kind: "gl_balance", item_key: "f9:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000 }] });
  const plugB = await draftOpeningItem(w.users.bob, {
    client: oB.client, seed: seedB, resolution: keyedRes(w.users.bob, { client: oB.client, seed: seedB }),
    item: { item_kind: "obe_plug", item_key: "f9:plug", amount_cents: 1_000 },
  });
  const linesB = await entryLines(plugB.entry_id);
  assert.equal(linesB.length, 2, "two balanced legs on the positive polarity too");
  const obeB = linesB.find((l) => l.account_code === WB_COA.obe);
  const reB = linesB.find((l) => l.account_code === WB_COA.re);
  assert.equal(Number(obeB?.credit_cents), 1_000, "positive amount = Cr on the OBE marker");
  assert.equal(Number(reB?.debit_cents), 1_000, "the RE contra balances on the debit side");
});

test("[R1-F10]: a K6 fixed-asset correction leaves EXACTLY ONE active register row with lineage", async () => {
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
  const asset = {
    description: "Forklift", acquired_date: "2024-06-01", cost_cents: 500_000,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
    depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
    depreciation_start_date: "2024-06-01", residual_cents: 0, item_key: "fa:fork",
  };
  const far = await seedFixedAsset(w.users.bob, { client: o.client, seed, asset });
  const faId = far.fixed_asset_id ?? far.asset_id;
  await recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: WB_COA.faAsset, source_label: "fa", debit_cents: 500_000, credit_cents: 0 },
    { line_key: "faacc", account_code: WB_COA.faAccum, source_label: "faacc", debit_cents: 0, credit_cents: 100_000 },
    { line_key: "cap", account_code: WB_COA.shareCap, source_label: "cap", debit_cents: 0, credit_cents: 400_000 },
  ] });
  const cap = await draftOpeningItem(w.users.bob, {
    client: o.client, seed, resolution: resOn(w.users.bob, o.client, doc),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 400_000 }] });
  const faEntry = await entryRow((await faRow(faId)).acquisition_entry_id);
  await approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(o.plan), tieSha256: doc.sha256,
    entryRevisions: revMapOf([cap, { entry_id: faEntry.id, revision_token: faEntry.revision_token }]),
    opKey: opk("f10base"),
  });
  const faItem = (await openingItemRows(seed)).find((i) => i.item_kind === "fixed_asset");
  // the landed F10 shape refuses a bare reversal ("requires a replacement
  // baseline") — the corrected register baseline rides the supersede call.
  await supersedeOpeningItem(w.users.bob, {
    item: faItem.id,
    replacement: {
      item: { item_kind: "fixed_asset", item_key: "fa:fork:v2" },
      asset: { ...asset, item_key: "fa:fork:v2" },
    },
    opKey: opk("f10sup"),
  });
  const faId2 = (await rootQuery(
    "select id from clara.fixed_assets where client_id=$1 and id <> $2 order by created_at desc limit 1",
    [o.client, faId])).rows[0]?.id;
  assert.ok(faId2, "the replacement register row was staged by the supersede");
  // [R2-F3] the STAGED-CORRECTION INTERVAL (memo finding 3): the replacement is
  // 'pending' — visible, NOT active — so exactly one asset is ever active;
  // abandoning K6 can never leave two.
  const midActive = await rootQuery(
    "select id from clara.fixed_assets where client_id=$1 and status='active'", [o.client]);
  assert.equal(midActive.rows.length, 1, `[R2-F3] exactly ONE active asset BETWEEN supersede and K6 (got ${midActive.rows.length})`);
  assert.equal(midActive.rows[0].id, faId, "[R2-F3] the predecessor stays the active one until K6");
  assert.equal((await faRow(faId2)).status, "pending", "[R2-F3] the replacement stages as 'pending' (visible-not-active)");
  const drafts = [];
  for (const row of await rootQuery(
    "select id, revision_token from clara.journal_entries where client_id=$1 and status='draft'", [o.client]).then((r) => r.rows)) {
    drafts.push({ entry_id: row.id, revision_token: row.revision_token });
  }
  await approveOpeningCorrection(w.users.hana, { seed, entryRevisions: revMapOf(drafts), opKey: opk("f10cor") });
  const active = await rootQuery(
    "select id from clara.fixed_assets where client_id=$1 and status='active'", [o.client]);
  assert.equal(active.rows.length, 1, `EXACTLY one active register row after the correction (got ${active.rows.length})`);
  assert.equal(active.rows[0].id, faId2, "the replacement asset is the active one");
  const old = await faRow(faId);
  assert.notEqual(old.status, "active", "the superseded asset left the active register");
  assert.ok(JSON.stringify(old).includes(faId2) || JSON.stringify(await faRow(faId2)).includes(faId),
    "lineage links the two register rows");
});

test("[R1-F11]: Gate O — the plan MAKER cannot commit activation (CLR05); a distinct admin can; solo rides the attestation", async () => {
  fail0017(live);
  const o = await onboardingClient(w.users.hana); // hana authors
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  await assertRaises(CLR.makerChecker, async () => commitOnboarding(w.users.hana, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f11a"),
  }), "the plan maker committing their own client activation");
  await commitOnboarding(w.users.alice, {
    client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan), opKey: opk("f11b") });
  assert.equal((await clientRow(o.client)).status, "active", "a DISTINCT eligible committer activates");
  // solo firm S: erin is the only member — the sanctioned attestation path
  const s = await onboardingClient(w.users.erin);
  await updatePlan({ plan: s.plan, expectedRevision: s.revision, answeredBy: w.users.erin,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  await assertRaises(CLR.makerChecker, async () => commitOnboarding(w.users.erin, {
    client: s.client, plan: s.plan, expectedPlanRevision: await planRevision(s.plan), opKey: opk("f11c"),
  }), "solo commit WITHOUT the attestation");
  await commitOnboarding(w.users.erin, {
    client: s.client, plan: s.plan, expectedPlanRevision: await planRevision(s.plan),
    attestation: "I attest sole-admin review of the onboarding commit", opKey: opk("f11d") });
  assert.equal((await clientRow(s.client)).status, "active", "the solo-firm attestation path activates");
});

test("[R1-F12]: K6 correction — maker=checker with a BAD tie yields CLR05 BEFORE any tie error", async () => {
  fail0017(live);
  // the maker must be ADMIN (hana) — a bookkeeper maker would trip the CLR04
  // approval floor before the checker separation could even be probed.
  const fin = await finalizedSet();
  const cashItem = (await openingItemRows(fin.seed)).find((i) => i.item_key === "gl:cash");
  const sup = await supersedeOpeningItem(w.users.hana, {
    item: cashItem.id, replacement: null, opKey: opk("f12sup"), // reversal-only → the tie is now BROKEN
  });
  const reversalId = sup.reversal_entry_id ?? sup.reversal_id;
  const rev = await entryRow(reversalId);
  await assertRaises(CLR.makerChecker, () => approveOpeningCorrection(w.users.hana, {
    seed: fin.seed, entryRevisions: revMapOf([{ entry_id: reversalId, revision_token: rev.revision_token }]),
    opKey: opk("f12"),
  }), "the correction maker approving their own correction under a broken tie (checker-separation must preflight the tie — the K5 DEF-1 order applied to K6)");
});
