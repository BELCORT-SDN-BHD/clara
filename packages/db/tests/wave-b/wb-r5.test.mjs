// Wave-B battery — RATCHET ROUND-5 [R5-F1]: the opening-draft writers MUST emit
// `entry.drafted` per created draft (AMB-13 now LOCKED). Cut straight from
// ratchet-r5-memo.md + the AMB-13 binding adjudication
// (docs/plan/research/wave-b/0017-ambiguity-adjudications.md:40) + the AS-BUILT
// GENERIC draft family's OBSERVABLE behavior (probed at run time). The 0017 SQL is
// NEVER read (ADR-029 contract-blind discipline) — a divergence is a FINDING, not a
// silent edit.
//
// AMB-13 (binding): "K3 event emission follows the AS-BUILT draft-family convention
// exactly ... the battery encodes no assert either way; the ratchet locks the final
// behavior." R5 is that ratchet. Before the fix these cells FAIL (pending-fix): the OB
// writers audit-then-finish without _append_event, so no entry.drafted exists,
// books_version never advances, and a stale context token survives the book change.
//
// CONTRACT-BLIND; FAILS (never skips) below 0017. House discipline: serial runner,
// row-scoped (unique per-test onboarding clients/seeds; never TRUNCATE). The two
// finalized supersede sets are staged+approved in `before` (the proven
// wb-k-supersede-fa structure) so the supersede cell holds no approve→supersede in a
// single test body.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, rootQuery, opk,
  assertRaises, endPool, printLaneNotes, noteLane,
  fail0017, wbEnsureReady, fnExists, packHuman,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc,
  createOpeningSeed, draftOpeningItem, stageFullSet, stageBeeSet,
  approveOpeningSeed, supersedeOpeningItem, seedFixedAsset, planRevision,
  draftEntryV3, freshResolution, upsertAccountClassed,
  eventsOf, faRow, openingItemRows, WB_COA,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let ref = null;  // the GENERIC entry.drafted reference (probed once in `before`)
let supA = null; // finalized 5-item set for the REPLACEMENT supersede
let supB = null; // finalized BEE set for the PURE-NULL (reversal-only) supersede

const res = (sub, client, docId) =>
  freshResolution(sub, client, docId ? { subjectKind: "document", subjectId: docId } : {});

/** entry.drafted events for EXACTLY one created draft (type-scoped + entry_id exact). */
async function draftedFor(firm, entryId) {
  return (await eventsOf(firm, "entry.drafted", entryId)).filter((e) => e.entry_id === entryId);
}
const payloadKeys = (ev) => Object.keys(ev?.payload ?? {}).sort();
const firmMaxSeq = async (firm) =>
  Number((await rootQuery("select coalesce(max(seq),0)::int as n from clara.domain_events where firm_id=$1", [firm])).rows[0].n);

/** Stage an onboarding client + a tie-document opening seed → {client, plan, seed, doc}. */
async function stageOpeningSeed(sub) {
  const onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: onb.client });
  const r = await createOpeningSeed(sub ?? w.users.bob, {
    client: onb.client, plan: onb.plan, asOf: "2026-01-01",
    tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  return { ...onb, seed: r.seed_id ?? r.id, doc };
}

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();

  // Reference capture: the GENERIC draft family emits entry.drafted — the convention
  // the OB writers must match. Probed from OBSERVABLE behavior, never the SQL.
  const g = await draftEntryV3(w.users.alice, {
    client: w.clients.A1, resolution: freshResolution(w.users.alice, w.clients.A1),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 2_200, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 2_200 },
    ],
    opKey: opk("r5ref"),
  });
  const evs = await draftedFor(w.firms.A, g.entry_id);
  ref = { count: evs.length, ev: evs[0] ?? null };

  // supA — a finalized 5-item set (ar:cust1 gets the REPLACEMENT supersede).
  const onbA = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onbA.client);
  const stA = await stageFullSet(w.users.bob, { owner: w.users.alice, client: onbA.client, plan: onbA.plan, firm: w.firms.A });
  await approveOpeningSeed(w.users.hana, {
    seed: stA.seed, planRevision: await planRevision(onbA.plan), tieSha256: stA.doc.sha256,
    entryRevisions: stA.revMap, opKey: opk("r5baseA"),
  });
  supA = { onb: onbA, ...stA };

  // supB — a finalized BEE set (a gl item gets the PURE-NULL reversal-only supersede).
  const onbB = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onbB.client);
  const stB = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: onbB.client, plan: onbB.plan });
  await approveOpeningSeed(w.users.hana, {
    seed: stB.seed, planRevision: await planRevision(onbB.plan), tieSha256: stB.doc.sha256,
    entryRevisions: stB.revMap, opKey: opk("r5baseB"),
  });
  supB = { onb: onbB, ...stB };
});
after(async () => { printLaneNotes("wb-r5"); await endPool(); });

test("META: 0017 applied — the three opening-draft writers exist; the GENERIC family emits the entry.drafted reference", async () => {
  fail0017(live);
  for (const fn of ["draft_opening_item", "seed_fixed_asset", "supersede_opening_item"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
  }
  assert.equal(ref.count, 1, "the generic draft family emits exactly one entry.drafted (the as-built convention)");
  assert.ok(ref.ev.entry_id, "the reference entry.drafted carries entry_id");
  assert.ok(ref.ev.client_id, "the reference entry.drafted is client-attributed");
  noteLane(`[R5-F1] generic entry.drafted payload keys = [${payloadKeys(ref.ev).join(",")}]`);
});

test("[R5-F1] draft_opening_item emits EXACTLY ONE entry.drafted — correctly attributed, generic payload shape", async () => {
  fail0017(live);
  const s = await stageOpeningSeed();
  const r = await draftOpeningItem(w.users.bob, {
    client: s.client, seed: s.seed, resolution: res(w.users.bob, s.client, s.doc.documentId),
    document: s.doc.documentId, sha256: s.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "r5:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 250_000, credit_cents: 0 }],
  });
  const evs = await draftedFor(w.firms.A, r.entry_id);
  assert.equal(evs.length, 1, "exactly one entry.drafted per created opening draft (AMB-13 locked)");
  assert.equal(evs[0].entry_id, r.entry_id, "the event carries the created draft's entry_id");
  assert.equal(evs[0].client_id, s.client, "the event is attributed to the opening client");
  assert.deepEqual(payloadKeys(evs[0]), payloadKeys(ref.ev), "payload shape matches the generic draft family");
});

test("[R5-F1] seed_fixed_asset emits EXACTLY ONE entry.drafted for its acquisition OB entry", async () => {
  fail0017(live);
  const onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  for (const [code, name, type] of [
    [WB_COA.faAsset, "Plant & Machinery", "asset"],
    [WB_COA.faAccum, "Accum Depreciation P&M", "asset"],
    [WB_COA.faExp, "Depreciation Expense", "expense"],
  ]) {
    await upsertAccountClassed(w.users.alice, { client: onb.client, code, name, type });
  }
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: onb.client });
  const sr = await createOpeningSeed(w.users.bob, {
    client: onb.client, plan: onb.plan, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const r = await seedFixedAsset(w.users.bob, {
    client: onb.client, seed: sr.seed_id ?? sr.id,
    asset: {
      description: "Delivery van", acquired_date: "2024-03-01", cost_cents: 500_000,
      useful_life_months: 60, depreciation_method: "straight_line",
      asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
      depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
      depreciation_start_date: "2024-03-01", residual_cents: 0, item_key: "r5:fa:van",
    },
  });
  const fa = await faRow(r.fixed_asset_id ?? r.asset_id);
  assert.ok(fa?.acquisition_entry_id, "seed_fixed_asset linked an acquisition entry (AMB-8)");
  const evs = await draftedFor(w.firms.A, fa.acquisition_entry_id);
  assert.equal(evs.length, 1, "seed_fixed_asset emits one entry.drafted for the acquisition OB entry");
  assert.equal(evs[0].entry_id, fa.acquisition_entry_id, "the event carries the acquisition entry_id");
  assert.equal(evs[0].client_id, onb.client, "attributed to the FA client");
  assert.deepEqual(payloadKeys(evs[0]), payloadKeys(ref.ev), "payload shape matches the generic draft family");
});

test("[R5-F1] supersede_opening_item emits ONE entry.drafted per created draft — 2 for replacement, 1 for pure-NULL", async () => {
  fail0017(live);

  // (a) REPLACEMENT supersede on the pre-finalized supA → reversal draft + replacement draft = TWO.
  const arItem = (await openingItemRows(supA.seed)).find((i) => i.item_key === "ar:cust1");
  assert.ok(arItem, "the AR item to supersede exists");
  const rep = await supersedeOpeningItem(w.users.bob, {
    item: arItem.id,
    replacement: {
      item: {
        item_kind: "ar_open_item", item_key: "ar:cust1:v2", amount_cents: 3_000_000,
        counterparty_id: arItem.counterparty_id, item_ref: "SI-100R", item_date: "2025-12-15",
      },
    },
  });
  const reversalId = rep.reversal_entry_id ?? rep.reversal_id;
  const replItem = (await openingItemRows(supA.seed)).find((i) => i.item_key === "ar:cust1:v2");
  assert.ok(reversalId, `the supersede receipt names the reversal draft (got ${JSON.stringify(rep)})`);
  assert.ok(replItem?.entry_id, "the replacement item drafted its own entry");
  const revEvs = await draftedFor(w.firms.A, reversalId);
  const repEvs = await draftedFor(w.firms.A, replItem.entry_id);
  assert.equal(revEvs.length, 1, "the reversal draft emits one entry.drafted");
  assert.equal(repEvs.length, 1, "the replacement draft emits one entry.drafted");
  assert.equal(revEvs[0].entry_id, reversalId, "reversal event carries the reversal entry_id");
  assert.equal(repEvs[0].client_id, supA.onb.client, "replacement event is attributed to the client");

  // (b) PURE-NULL supersede (reversal-only) on the pre-finalized supB → ONE entry.drafted.
  const glItem = (await openingItemRows(supB.seed)).find((i) => i.item_key === "gl:cash");
  assert.ok(glItem, "a finalized gl item to reversal-only-supersede exists");
  const nul = await supersedeOpeningItem(w.users.bob, { item: glItem.id, replacement: null, opKey: opk("r5nul") });
  const nulRevId = nul.reversal_entry_id ?? nul.reversal_id;
  assert.ok(nulRevId, "the pure-NULL supersede still drafts a reversal");
  const nulEvs = await draftedFor(w.firms.A, nulRevId);
  assert.equal(nulEvs.length, 1, "the pure-NULL (reversal-only) supersede emits exactly one entry.drafted");
  assert.equal(nulEvs[0].entry_id, nulRevId, "the reversal-only event carries the reversal entry_id");
});

test("[R5-F1] CONSEQUENCE: an opening draft advances books_version — a pre-draft pack token goes STALE (CLR12)", async () => {
  fail0017(live);
  const s = await stageOpeningSeed();
  // Record the resolution FIRST so the opening draft is the only book-moving event
  // between the token capture and the staleness assert.
  const resolution = await res(w.users.bob, s.client, s.doc.documentId);
  const pack0 = await packHuman(w.users.bob, { client: s.client });
  const v0 = Number(pack0?.books_version ?? await firmMaxSeq(w.firms.A));
  if (pack0 == null) noteLane("[R5-F1] get_context_pack returned null for an onboarding client — used firm max seq as the token (shape finding)");
  // Sanity: v0 is CURRENT before the draft (the non-human freshness gate accepts it).
  await rootQuery("select clara.assert_books_current(p_firm => $1, p_client => $2, p_version => $3)", [w.firms.A, s.client, v0]);

  await draftOpeningItem(w.users.bob, {
    client: s.client, seed: s.seed, resolution,
    document: s.doc.documentId, sha256: s.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "r5:cons" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100_000, credit_cents: 0 }],
  });

  const v1 = Number((await packHuman(w.users.bob, { client: s.client }))?.books_version ?? await firmMaxSeq(w.firms.A));
  assert.ok(v1 > v0, `books_version advances after the opening draft (${v0} -> ${v1})`);
  await assertRaises(CLR.stale, () =>
    rootQuery("select clara.assert_books_current(p_firm => $1, p_client => $2, p_version => $3)", [w.firms.A, s.client, v0]),
    "the pre-draft books_version token is now STALE (CLR12) — stale context cannot survive the opening draft");
});

test("[R5-F1] ORDERING: entry.drafted rides the writer's transaction TAIL (append-event-last); the op is audited", async () => {
  fail0017(live);
  const s = await stageOpeningSeed();
  const resolution = await res(w.users.bob, s.client, s.doc.documentId);
  const seq0 = await firmMaxSeq(w.firms.A);
  const oKey = opk("r5ord");
  const r = await draftOpeningItem(w.users.bob, {
    client: s.client, seed: s.seed, resolution,
    document: s.doc.documentId, sha256: s.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "r5:ord" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100, credit_cents: 0 }],
    opKey: oKey,
  });
  const evs = await draftedFor(w.firms.A, r.entry_id);
  assert.equal(evs.length, 1, "one entry.drafted");
  const seq1 = await firmMaxSeq(w.firms.A);
  // batch-tail / append-event-last: the entry.drafted is the firm's highest-seq event,
  // and it is the ONLY new firm event this single-draft writer produced (nothing after it).
  assert.equal(Number(evs[0].seq), seq1, "entry.drafted is the firm's tail event (append-event-last)");
  assert.equal(seq1 - seq0, 1, "exactly one new firm event — the entry.drafted");
  // audit-then-events (observable half): the writer reserved/audited its governed op.
  const audited = (await rootQuery("select count(*)::int as n from clara.op_receipts where op_key=$1", [oKey])).rows[0].n;
  assert.equal(audited, 1, "the writer recorded its audited op-receipt for this op_key");
  noteLane("[R5-F1] strict audit-BEFORE-append statement order is a prosrc property (fix must preserve); the tail + op-receipt are the behavioral half asserted here");
});
