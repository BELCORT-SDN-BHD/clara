// #639 [0216] — 完成资产购入与登记，独立等待缺失折旧资料.
//
// THE CELL THAT DEFINES THE TICKET IS `p639.birth.work_lane`, AND IT IS WRITTEN FIRST. Before
// 0216 it fails at COMMIT with CLR40 `fa_belt_unregistered_movement`: the Work lane's posting core
// (`clara._record_journal_entry_core`, 0195:2110-2113) approves with a raw
// `update ... set status='approved'` and calls no subledger hook, so no register row is born, and
// the DEFERRED belt `t_je_fa_movement_belt` (0041:2741-2743) refuses the whole transaction at
// COMMIT — after the operation receipt (0195:2130) and the Work result (0195:2194) were written.
// Everything 0216 adds is whatever makes that cell green without moving a pinned body.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`humanQuery` / `roleQuery` / the wake
// credential), never `rootQuery` — DECISIONS §1.10. Root appears only as a readback.
//
// FRONTIER-GATED on the `fixed_asset_acquisition$` stem, never on a number. A FOCUSED invocation
// (without `--import ./tests/fixed-asset-acquisition-preintegration-gate.mjs`) FAILS LOUDLY when
// 0216 is absent, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAcq, gateWorkLane, ACQ, BIRTH_TRIGGER, BELT_TRIGGER, FA_PARTICULARS_FIELDS,
  acqWorld, acqClient, acqBasis, armedAcquisition, postAcquisition, workLaneAcquisition,
  completeParticularsFor, openWorkQuestion, answerWorkQuestion, pendingQuestion,
  assetForEntry, triggerOrderOnJournalEntries, approvePathBodies, faHookCallers,
  documentLaneAcquisition,
  subledgerHookCallers, entryCountOf, committedReceiptCountOf, assetCountOf,
  buyAsset, completeParticulars, getFixedAsset, listFixedAssets, upsertFaProfile,
  reverseAndSettle, approvedEntry, faRow, entryRowOf, eventCount,
  workRow, receiptsForWork, mintClientObo, wakeRecordJournalEntry,
  withActor, ROLES,
  COST, ACCUM2, EXPENSE2, BANK, LAND, AP1, SHARE,
  mon, dayIn, opk, rootQuery, humanQuery, namedCall,
  refuses, caught, reasonToken, noteLane, printLaneNotes, printSkipCount, endPool,
  x41EnsureReady, kSeededFaClient, freshEnrolledFaClient, freshResolution, wb,
} from "./fixed-asset-acquisition-fixtures.mjs";

let live = false;
before(async () => {
  live = await x41EnsureReady();
});
after(async () => {
  printLaneNotes("p639 fixed-asset acquisition");
  printSkipCount("p639 fixed-asset acquisition");
  await endPool();
});

/** Every cell needs 0041 (the register), 0178 (the Work lane) and 0216 (this slice). */
async function gate(t, { needAcq = true } = {}) {
  if (!live) {
    t.skip("0041 is not applied — the #639 battery is dormant");
    return true;
  }
  if (await gateWorkLane(t)) return true;
  if (needAcq && await gateAcq(t)) return true;
  return false;
}

// ===========================================================================================
// 1 · THE BIRTH. The lane the ticket names, the ordering premise under it, and the exclusions.
// ===========================================================================================

test("p639.birth.work_lane an acquisition posted through clara.wake_record_journal_entry commits the entry, the register row, the receipt and the Work result in ONE transaction", async (t) => {
  if (await gate(t)) return;
  const client = await acqClient("birth_work_lane");
  const before = {
    entries: await entryCountOf(client),
    receipts: await committedReceiptCountOf(client),
    assets: await assetCountOf(client),
  };

  const a = await armedAcquisition({ client });
  const out = await postAcquisition(a);

  assert.equal(out.posted, true, "work_lane: the production command POSTED");
  assert.equal(out.replayed, false);
  assert.ok(out.entry_id && out.receipt_id, "work_lane: the answer names entry AND receipt");

  // ONE transaction: the entry, the register row and the receipt all landed, and nothing else did.
  assert.equal(await entryCountOf(client), before.entries + 1, "work_lane: exactly ONE new entry");
  assert.equal(await committedReceiptCountOf(client), before.receipts + 1,
    "work_lane: exactly ONE committed receipt");
  assert.equal(await assetCountOf(client), before.assets + 1,
    "work_lane: exactly ONE register row — the birth the Work lane never had");

  const born = await assetForEntry(out.entry_id);
  assert.equal(born.length, 1, "work_lane: the register row is keyed to the approving entry");
  const asset = born[0];
  assert.equal(String(asset.cost_cents), "850000", "work_lane: EXACT minor units, never a float");
  assert.equal(asset.asset_account_code, COST);
  assert.equal(asset.acquired_date, a.basis.posting_date,
    "work_lane: the acquisition date is the posting date, never a timezone-shifted one");
  assert.equal(asset.status, "active");
  assert.ok(asset.acquisition_line_id, "work_lane: the row names the cost LINE it was born from");
  assert.equal(asset.depreciation_start_date, null,
    "work_lane: particulars are absent — the acquisition is complete WITHOUT them");
  assert.equal(asset.useful_life_months, null);

  // …and the Work carries its own outcome, under the initiator's live authority.
  const w = await workRow(a.work_id);
  assert.equal(w.result.entry_id, out.entry_id, "work_lane: the Work names the entry it posted");
  assert.equal(w.result.receipt_id, out.receipt_id);
  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts.length, 1, "work_lane: ONE operation receipt");
  assert.equal(receipts[0].on_behalf_of, a.author,
    "work_lane: the receipt names the human whose authority was rechecked at commit");

  // The register row is visible through the PRODUCTION read, under a least-privileged persona.
  const w2 = await acqWorld();
  const read = await listFixedAssets(w2.users.carol, client); // viewer — the register is viewer-floored
  const row = read.assets.find((x) => x.id === asset.id);
  assert.ok(row, "work_lane: the viewer's register read shows the new asset");
  assert.equal(row.particulars_complete, false,
    "work_lane: …and shows it as waiting on depreciation particulars");
});

test("p639.birth.fire_order the birth trigger is a DEFERRED constraint trigger on clara.journal_entries that fires BEFORE t_je_fa_movement_belt", async (t) => {
  if (await gate(t)) return;
  const trig = await triggerOrderOnJournalEntries();
  const names = trig.map((r) => r.tgname);
  const birth = trig.find((r) => r.tgname === BIRTH_TRIGGER);
  const belt = trig.find((r) => r.tgname === BELT_TRIGGER);
  assert.ok(birth, `fire_order: ${BIRTH_TRIGGER} is installed on clara.journal_entries`);
  assert.ok(belt, `fire_order: ${BELT_TRIGGER} is still installed`);
  assert.equal(birth.is_constraint, true, "fire_order: the birth is a CONSTRAINT trigger…");
  assert.equal(birth.tgdeferrable, true, "fire_order: …deferrable…");
  assert.equal(birth.tginitdeferred, true, "fire_order: …and INITIALLY DEFERRED, like the belt");

  // THE MEASUREMENT, not the assumption. PostgreSQL fires the deferred after-trigger queue at
  // COMMIT in the order the events were queued, and for one row event that order is ALPHABETICAL
  // BY TRIGGER NAME. Measured here on a scratch relation carrying the two REAL names — created,
  // fired through `set constraints all immediate` (which flushes the queue in its own order) and
  // rolled back, so the probe leaves no debris.
  const order = await measuredDeferredOrder();
  noteLane(`fire_order: measured deferred firing order = ${order.join(" -> ")}`);
  assert.deepEqual(order, [BIRTH_TRIGGER, BELT_TRIGGER],
    "fire_order: the birth fires FIRST — this is option B's whole premise");

  // …and the catalog agrees, which is the invariant a later trigger rename must not break.
  assert.ok(names.indexOf(BIRTH_TRIGGER) < names.indexOf(BELT_TRIGGER),
    "fire_order: the birth trigger's NAME sorts before the belt's");
});

/** Two deferred constraint triggers carrying the two REAL names, on a throwaway relation inside a
 *  rolled-back transaction. `set constraints all immediate` fires the pending queue in queue
 *  order, which is exactly what COMMIT does. */
async function measuredDeferredOrder() {
  const { withActor } = await import("./rig-helpers.mjs");
  return withActor({ transaction: true }, async (c) => {
    await c.query("create table public._p639_fire_probe(id int primary key)");
    await c.query("create table public._p639_fire_log(seq serial, who text)");
    await c.query(
      "create function public._p639_fire_note() returns trigger language plpgsql as "
      + "$fn$ begin insert into public._p639_fire_log(who) values (TG_NAME); return null; end $fn$");
    // Created in the OPPOSITE order to the names, so a pass cannot be creation order in disguise.
    await c.query(
      `create constraint trigger ${BELT_TRIGGER} after insert on public._p639_fire_probe `
      + "deferrable initially deferred for each row execute function public._p639_fire_note()");
    await c.query(
      `create constraint trigger ${BIRTH_TRIGGER} after insert on public._p639_fire_probe `
      + "deferrable initially deferred for each row execute function public._p639_fire_note()");
    await c.query("insert into public._p639_fire_probe values (1)");
    const early = await c.query("select count(*)::int n from public._p639_fire_log");
    assert.equal(early.rows[0].n, 0, "fire_order: a deferred trigger has not fired at statement time");
    await c.query("set constraints all immediate");
    const r = await c.query("select who from public._p639_fire_log order by seq");
    throw Object.assign(new Error("__p639_rollback__"), { order: r.rows.map((x) => x.who) });
  }).catch((e) => {
    if (e?.message === "__p639_rollback__") return e.order;
    throw e;
  });
}

test("p639.birth.idempotent the document/human lane still births EXACTLY ONE row with the hook AND the trigger both live", async (t) => {
  if (await gate(t)) return;
  const client = await acqClient("birth_idempotent");
  const before = await assetCountOf(client);
  const { entry, asset } = await buyAsset({ client, cents: 640_000, postingDate: dayIn(mon(-1), 9) });
  assert.equal(await assetCountOf(client), before + 1,
    "idempotent: the hook's arm 4 and the new trigger agree on ONE row per cost line");
  const rows = await assetForEntry(entry);
  assert.equal(rows.length, 1, "idempotent: one register row keyed to the approving entry");
  assert.equal(rows[0].id, asset.id, "idempotent: …and it is the row the hook birthed, not a twin");
  assert.equal(await eventCount(client, "asset.acquired"), 1,
    "idempotent: ONE asset.acquired event — the trigger does not re-announce a row it did not birth");
});

test("p639.birth.exclusions opening entries, reversal mirrors, disposals and scheduled depreciation runs birth NOTHING", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("birth_exclusions");

  // (a) A reversal mirror. Buying then reversing leaves ONE row (unwound), never a second.
  const { entry, asset } = await buyAsset({ client, cents: 420_000, postingDate: dayIn(mon(-2), 4) });
  const countAfterBuy = await assetCountOf(client);
  await reverseAndSettle(w.users.alice, { entry, reason: "p639 exclusion probe", opKey: opk("p639rev") });
  assert.equal(await assetCountOf(client), countAfterBuy,
    "exclusions: a reversal MIRROR credits the enrolled cost account and births nothing");
  const unwound = await faRow(asset.id);
  assert.ok(unwound, "exclusions: …and the original row is still there, keyed to its own line");

  // (b) A `fa_disposal` entry. Its accumulated-depreciation relief is a DEBIT, and the day a freed
  //     accumulated code is re-enrolled as a cost account that debit would soft-birth a phantom.
  const flagged = await approvedEntry(w.users.alice, {
    client, postingDate: dayIn(mon(-1), 20), memo: "p639 disposal-flagged probe",
    flags: { fa_disposal: { probe: true } },
    lines: [
      { account_code: BANK, debit_cents: 10_000, credit_cents: 0, description: "proceeds" },
      { account_code: SHARE, debit_cents: 0, credit_cents: 10_000, description: "balancing" },
    ],
  }).catch((e) => e);
  if (flagged instanceof Error) {
    noteLane(`exclusions(b): the fa_disposal-flagged probe was refused (${flagged.code}) — recorded, not asserted`);
  } else {
    assert.equal(await assetCountOf(client), countAfterBuy,
      "exclusions: an fa_disposal-flagged entry births nothing");
  }

  // (c) A scheduled depreciation run. Today it debits the EXPENSE account, so the cost join misses;
  //     0216's guard closes the mechanical site itself so it needs BOTH guards to fail.
  const src = await rootQuery(
    "select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
    + "where n.nspname='clara' and p.proname='_tf_fa_acquisition_birth'");
  assert.equal(src.rowCount, 1, "exclusions: the birth trigger function exists");
  const body = src.rows[0].prosrc;
  for (const guard of ["is_opening_balance", "reversal_of", "fa_disposal", "scheduled_run"]) {
    assert.ok(body.includes(guard),
      `exclusions: the birth trigger carries the ${guard} exclusion in its own body`);
  }
  // A STRING SEARCH IS A BELT, NOT THE PROOF (round-1 review, 639-A5). The `scheduled_run` arm is
  // proven BEHAVIOURALLY by `p639.depreciation.independent`, which runs a real depreciation period
  // through the production command on an enrolled client and asserts the register count is
  // unmoved. The K-FAMILY OPENING arm (`is_opening_balance`, 0216 §B) is proven behaviourally
  // below by `p639.birth.opening_excluded` and `p639.birth.opening_admitted`, reusing the wave-b
  // opening-seed fixture helpers `kSeededFaClient` (x41-fa-world.mjs) already builds on — #884
  // corrected two things this comment used to get wrong: the refusal a gl-balance leg on an
  // enrolled account draws is raised by the BELT (`clara._tf_fa_movement_belt`, migration 0041's
  // arm (e)), not by this birth trigger, and its code is CLR40 `fa_k_gl_balance_on_enrolled`, not
  // CLR38. An opening-seed fixture already existed (kSeededFaClient) — this was a fixture to
  // WRITE two behavioural cells against, not a harness to build.
});

test("p639.birth.opening_excluded a gl_balance opening leg on an ENROLLED fixed-asset account is refused CLR40 fa_k_gl_balance_on_enrolled naming the account, with NO register row and a full rollback", async (t) => {
  if (await gate(t, { needAcq: false })) return;
  // A FRESH onboarding client, its OWN chart, and COST/ACCUM/EXPENSE explicitly ENROLLED —
  // `freshEnrolledFaClient` (x41-fa-world.mjs), the SAME enrol-and-chart helper `kSeededFaClient`
  // (below) composes, so the two cells share one source of truth, not two independent copies of
  // it (#884 code review STD-1).
  const { w, o } = await freshEnrolledFaClient("884refuse");
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const seed = sr.seed_id ?? sr.id;
  // Pinned to the LITERAL zero the criterion names (code review L03-CRS5), not merely captured as
  // a before/after delta: a fixture that had already produced a register row before the refused
  // approval would otherwise still read green below.
  const beforeAssets = await assetCountOf(o.client);
  assert.equal(beforeAssets, 0,
    "opening_excluded: the fresh client must carry ZERO clara.fixed_assets rows before the refused approval");

  // THE ONE FACT ARM (e) IS ABOUT: a gl_balance leg naming the enrolled COST account directly —
  // never itemised as a fixed_asset opening item, which is exactly the shape 0041's own comment
  // says "would escape fa_k_gl_balance_on_enrolled" if the belt's opening arm looked no further
  // than "is this entry opening-dated". A SECOND, ordinary (un-enrolled) gl_balance item on SHARE
  // offsets the first item's own OBE contra so the SET's net OBE ties to zero
  // (`_opening_seed_obe_net`, checked by `_assert_opening_tie` ahead of the belt) — the K9 house
  // shape, never a change to what arm (e) is actually about.
  const cost884 = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: `884:${COST}` },
    lines: [{ account_code: COST, debit_cents: 500_000, credit_cents: 0 }],
  });
  const share884 = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "884:share" },
    lines: [{ account_code: SHARE, debit_cents: 0, credit_cents: 500_000 }],
  });
  assert.equal((await entryRowOf(cost884.entry_id)).status, "draft",
    "opening_excluded: the belt is deferred behind `when (status='approved')` — drafting alone must not trip it");

  // `_assert_opening_tie` (the K5 approve-time gate ahead of the belt) requires the drafted set's
  // NON-OBE accounts to match RECORDED target evidence exactly (`_opening_seed_deltas` excludes
  // the OBE account from its own comparison by construction — recording an OBE target here would
  // itself manufacture a mismatch, never the belt this cell is actually about) — so COST and
  // SHARE are tied to the tie document, the same way K9 ties its own multi-line set.
  await wb.recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa884", account_code: COST, source_label: "fa884", debit_cents: 500_000, credit_cents: 0 },
    { line_key: "share884", account_code: SHARE, source_label: "share884", debit_cents: 0, credit_cents: 500_000 },
  ] });

  const err = await refuses(async () => wb.approveOpeningSeed(w.users.hana, {
    seed, planRevision: await wb.planRevision(o.plan), tieSha256: doc.sha256,
    entryRevisions: wb.revMapOf([cost884, share884]), opKey: opk("884approve"),
  }), ACQ.kGlBalance, "opening_excluded: an opening gl_balance leg naming an ENROLLED fixed-asset account");
  assert.equal(err.code, "CLR40", `opening_excluded: the belt's own SQLSTATE (got ${err.code})`);
  // The criterion asks for the account code ON THE DETAIL (contract §4 pins DETAIL as the
  // structured discriminant; the prose message is not a machine-readable contract and could
  // drop the field while still mentioning it in English). detail is a jsonb_build_object(...)::text
  // (migration 0041), so parse it and check the field itself rather than substring-searching a
  // blob of message-or-detail — a later recut that drops account_code from the JSON while leaving
  // it interpolated into the message would otherwise leave this cell green.
  const detail = JSON.parse(err.detail);
  assert.equal(detail.account_code, COST,
    `opening_excluded: the refusal's DETAIL must name the account code ${COST} on account_code (got ${err.detail})`);

  // NO REGISTER ROW, AND A FULL ROLLBACK: the belt is a DEFERRED constraint trigger firing at
  // the approval statement's own commit, so its exception unwinds the whole approve — the entry
  // itself must still read back exactly as drafted, never left 'approved' with the register
  // write alone undone.
  assert.equal(await assetCountOf(o.client), beforeAssets,
    "opening_excluded: no clara.fixed_assets row was born by the refused approval");
  assert.equal((await entryRowOf(cost884.entry_id)).status, "draft",
    "opening_excluded: the COST opening entry is still 'draft' — the whole approval rolled back, not just the register write");
  assert.equal((await entryRowOf(share884.entry_id)).status, "draft",
    "opening_excluded: …and so is the SHARE entry in the same batch — the belt refuses the WHOLE approval, not one entry in it");
});

test("p639.birth.opening_admitted the itemised fixed_asset opening item is admitted; the birth trigger births NOTHING for it (the register row comes from the opening lane itself)", async (t) => {
  if (await gate(t, { needAcq: false })) return;
  const k = await kSeededFaClient("884admit");
  const entry = await entryRowOf(k.faEntryId);
  assert.equal(entry.status, "approved",
    "opening_admitted: the K opening entry was admitted at approve on an ALREADY-enrolled account");
  assert.equal(entry.is_opening_balance, true,
    "opening_admitted: …and it is a genuine opening-balance entry — the exact guard condition "
    + "clara._tf_fa_acquisition_birth's FIRST line tests");

  // EXACTLY ONE REGISTER ROW, NOT BORN BY THE ACQUISITION TRIGGER. If the birth trigger's own
  // `if new.is_opening_balance then return null; end if;` guard had NOT fired — or fired and
  // still tried to insert — this entry's SINGLE cost-debit line would either duplicate the row
  // the opening lane's own `_draft_opening_item_core` already inserted at draft time (0017 §…,
  // the `insert into clara.fixed_assets(...)` this ticket's triage cites), or collide with the
  // UNIQUE index on acquisition_line_id (x41.a4 pins that index exists). Neither happens: exactly
  // one row exists, and it is the SAME id seed_fixed_asset's own receipt named.
  const rows = await rootQuery(
    "select id from clara.fixed_assets where acquisition_entry_id=$1", [entry.id]);
  assert.equal(rows.rowCount, 1,
    "opening_admitted: exactly one register row ties to this opening entry");
  assert.equal(rows.rows[0].id, k.assetId,
    "opening_admitted: …and it is the row seed_fixed_asset's own receipt named at draft time, not a second one from the birth trigger");
});

// ===========================================================================================
// 2 · THE CENSUS the estate lacked. `x41-wave-d-a-fa.test.mjs:186` counts FUNCTIONS that mention
//     the hook, not approve PATHS — which is exactly how a fifth approve path shipped unnoticed.
// ===========================================================================================

test("p639.census.approve_paths the subledger-hook caller set is the re-derived SIX, the FA hook has ONE caller, and the approve PATHS are enumerated by name", async (t) => {
  if (await gate(t, { needAcq: false })) return;
  const hookCallers = await faHookCallers();
  assert.deepEqual(hookCallers, ["_subledger_on_approve"],
    "census: clara._fa_on_approve is invoked from exactly ONE body — the subledger hook");
  // 0037:3840-3845 pinned FOUR. MEASURED on clara_639 the live set is SIX — 0056's close model
  // added `finalize_close` and `reopen_fiscal_year` — so 0216's tail re-derives and re-pins the
  // measured set rather than carrying a census that has been stale for two callers.
  const sub = await subledgerHookCallers();
  assert.deepEqual(sub.slice().sort(), [
    "_approve_entry_core", "_approve_opening_entry", "approve_wrong_client_correction",
    "finalize_close", "reopen_fiscal_year", "reverse_entry",
  ].sort(), `census: the subledger-hook caller set is the measured six (got ${sub.join(", ")})`);

  // AND THE CELL THE ESTATE NEVER HAD. The paths that set an entry `status='approved'` are a
  // SUPERSET of the hook's callers — that difference IS the #639 defect, and naming it is what
  // stops the next reader repeating `x41-wave-d-a-fa.test.mjs:186`'s mistake.
  const paths = await approvePathBodies();
  noteLane(`census: approve PATHS = ${paths.join(", ")}`);
  assert.ok(paths.includes("_record_journal_entry_core"),
    "census: the Work lane's posting core IS an approve path…");
  assert.ok(!sub.includes("_record_journal_entry_core"),
    "census: …and it does NOT call the subledger hook — the fact 0216's lane-agnostic trigger closes");
  assert.ok(paths.length >= sub.length,
    "census: every hook caller is an approve path, and there is at least one that is not");
});

// ===========================================================================================
// 3 · PROVENANCE. Stored: the document. Joined: the Work and the receipt.
// ===========================================================================================

test("p639.provenance.document acquisition_document_id is the approving entry's document, NULL for a composer entry; Work and receipt resolve by JOIN", async (t) => {
  if (await gate(t)) return;
  const client = await acqClient("provenance");
  const a = await armedAcquisition({ client });
  const out = await postAcquisition(a);
  const asset = (await assetForEntry(out.entry_id))[0];

  const entry = await entryRowOf(out.entry_id);
  assert.equal(entry.document_id, null,
    "provenance: a Work-lane acquisition carries NO document (0195 refuses a fabricated sha)");
  assert.equal(asset.acquisition_document_id, null,
    "provenance: …so the column is NULL rather than a fabricated id");

  // The Work and the receipt are DERIVED, never stamped: the receipt is inserted AFTER the approve
  // (0195:2130 vs :2110) and the Work result is built in the core (:2194), so an approve-time
  // write of either would stamp NULL forever.
  const w = await acqWorld();
  const detail = await getFixedAsset(w.users.bob, asset.id);
  assert.ok(detail.acquisition, "provenance: get_fixed_asset returns an acquisition block");
  assert.equal(detail.acquisition.entry_id, out.entry_id);
  assert.equal(detail.acquisition.work_id, a.work_id, "provenance: the Work is resolved BY JOIN");
  assert.equal(detail.acquisition.receipt_id, out.receipt_id,
    "provenance: the operation receipt is resolved BY JOIN");
  assert.equal(detail.acquisition.document_id, null);
  assert.equal(String(detail.acquisition.cost_cents), "850000",
    "provenance: exact cents on the acquisition block");
  assert.equal(detail.acquisition.currency, "MYR",
    "provenance: MYR only — the multi-currency deferral (PRD:127) is a stated boundary, not a hole");

  // …and nothing stored a receipt or a Work id on the register row.
  assert.ok(!("acquisition_receipt_id" in asset),
    "provenance: no acquisition_receipt_id column — an approve-time write would stamp NULL forever");
  assert.ok(!("acquisition_work_id" in asset), "provenance: …and no acquisition_work_id column");
});

test("p639.provenance.document_lane a hook-born row carries its source document through the READ, because 0017's immutability wall makes a back-fill unwritable", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("provenance_doc_lane");
  const filed = await documentLaneAcquisition(w.users.alice, {
    firm: w.firms.A, client, cents: 640_000, postingDate: dayIn(mon(-1), 7),
  });
  const rows = await assetForEntry(filed.entry);
  assert.equal(rows.length, 1, "document_lane: the document lane births exactly one register row");
  const asset = rows[0];

  // The COLUMN is null: `clara._fa_on_approve` arm 4 birthed this row at STATEMENT time, and
  // clara._tf_fixed_assets_immutable_0017 refuses any later write to a column outside its
  // post-approval allowlist. That trigger is not in #639's allowed recuts, so this is a
  // MEASURED boundary rather than an omission.
  assert.equal(asset.acquisition_document_id, null,
    "document_lane: the hook birthed this row, so the birth-time copy is NULL");

  // …and the READ resolves it anyway, from the acquisition entry, which is the authority.
  const detail = await getFixedAsset(w.users.bob, asset.id);
  assert.equal(detail.acquisition.document_id, filed.documentId,
    "document_lane: the read resolves the source document from the acquisition ENTRY");
  assert.equal(detail.acquisition.document_sha256, filed.sha256,
    "document_lane: …and names the exact bytes it was read from");
  assert.ok(detail.acquisition.document_filename,
    "document_lane: …and the filename a human recognises");
  assert.equal(detail.asset.acquisition_document_id, filed.documentId,
    "document_lane: the register row shape carries it too, so the list can link without a second read");

  // The entry and its register row agree, which is the invariant 0216's tail asserts estate-wide.
  const entry = await entryRowOf(filed.entry);
  assert.equal(entry.document_id, filed.documentId);
});

test("p639.refusal.locked_period an acquisition into a CLOSED fiscal year is refused by name and leaves no entry, no receipt and no register row", async (t) => {
  if (await gate(t)) return;
  // A DEDICATED client, and the closed year is SEEDED HERE. `freshFaClient` (x41-fa-world.mjs:162)
  // creates no `clara.fiscal_years` row at all, so a cell that only SELECTS one can never assert —
  // which is exactly what this cell did until round-1 review measured it ("cell recorded, not
  // asserted", 18/18 green with zero assertions). The precedent it was told to copy,
  // `work-journal-post.test.mjs`'s `w623.post.closed-period` (:517-527), INSERTs the year for the
  // same reason and asserts the seeding was mandatory. `clara.fiscal_years` is append-only, so the
  // year is seeded on a client of this cell's own rather than on a shared one.
  const w = await acqWorld();
  const client = await acqClient("refusal_locked");
  const postingDate = dayIn(mon(-1), 15);
  const seeded = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
     values((select firm_id from clara.clients where id=$1), $1, 'p639 closed FY',
            date_trunc('year', $2::date)::date,
            (date_trunc('year', $2::date) + interval '1 year' - interval '1 day')::date,
            1, 'closed', 'asserted', $3)
     returning id, status, starts_on, ends_on`, [client, postingDate, w.users.alice]);
  assert.ok(seeded.rows[0]?.id,
    "locked_period: MANDATORY SETUP — without a genuinely closed fiscal year the refusal is unproven");
  assert.equal(seeded.rows[0].status, "closed",
    "locked_period: …and the seeded year really is CLOSED, read back from the catalog");

  // The period wall is the ESTATE's (clara._tf_period_wall, 0056) and the typed pre-check is
  // 0194's; seeding the year straight to `closed` is a FIXTURE shortcut around the close lane,
  // which needs a whole readiness run this cell is not about. Stated rather than hidden.
  const before = {
    entries: await entryCountOf(client),
    receipts: await committedReceiptCountOf(client),
    assets: await assetCountOf(client),
  };
  const a = await armedAcquisition({
    client, basis: acqBasis({ cents: 120_000, postingDate }),
  });
  const err = await caught(() => postAcquisition(a));
  assert.ok(err, "locked_period: the acquisition is refused");
  assert.equal(err.code, "CLR19",
    `locked_period: …by the estate's period SQLSTATE (got ${err.code}: ${err.message})`);
  assert.equal(reasonToken(err), ACQ.closedPeriod,
    "locked_period: …and by the typed reason a surface can map to the period control");
  assert.equal(await entryCountOf(client), before.entries,
    "locked_period: no journal entry survives the refusal");
  assert.equal(await committedReceiptCountOf(client), before.receipts,
    "locked_period: …no committed receipt…");
  assert.equal(await assetCountOf(client), before.assets,
    "locked_period: …and no half-born register row (the acquisition/journal pair cannot mismatch)");
});

// ===========================================================================================
// 4 · THE READ. Acquisition SEPARATE from particulars, schedule and charges (AC5/AC8).
// ===========================================================================================

test("p639.read.acquisition_block get_fixed_asset returns acquisition apart from particulars/schedule/charges, under a VIEWER", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("read_block");
  const { out } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];

  const detail = await getFixedAsset(w.users.carol, asset.id); // viewer floor
  for (const key of ["asset", "acquisition", "particulars", "schedule", "charges", "history"]) {
    assert.ok(key in detail, `read: the detail carries a separate '${key}' block`);
  }
  assert.equal(detail.particulars.complete, false,
    "read: particulars are their OWN block, and they are incomplete");
  assert.equal(detail.particulars.method, null);
  assert.equal(detail.particulars.start_date, null);
  assert.deepEqual(detail.schedule, [],
    "read: no schedule can be projected until the particulars are answered");
  assert.equal(detail.acquisition.entry_id, out.entry_id,
    "read: …while the acquisition is complete and names its journal entry");
  assert.equal(detail.asset.acquisition_entry_id, out.entry_id,
    "read: _fa_asset_json projects the acquisition entry on every row shape");
  assert.ok("acquisition_line_id" in detail.asset);
  assert.ok("acquisition_document_id" in detail.asset);

  // The LIST read carries the same three projections, so the register can link without a second read.
  const list = await listFixedAssets(w.users.carol, client);
  const row = list.assets.find((x) => x.id === asset.id);
  assert.equal(row.acquisition_entry_id, out.entry_id);
  assert.equal(row.particulars_complete, false);
  assert.equal(list.incomplete_count >= 1, true,
    "read: the register's own incomplete count names this asset's class of row");
});

// ===========================================================================================
// 5 · REFUSALS. Each one names the dependent field/action and erases nothing (AC7).
// ===========================================================================================

test("p639.refusal.viewer the runtime particulars door refuses OBO a viewer by name, and changes nothing", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("refusal_viewer");
  const { out } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];

  const err = await refuses(() => completeParticularsFor({
    client, asset: asset.id, obo: w.users.carol,
    particulars: { method: "straight_line", useful_life_months: 60, start_date: dayIn(mon(-1), 15) },
  }), ACQ.insufficientRole, "refusal.viewer");
  assert.equal(err.code, "CLR04", "refusal.viewer: an authority refusal, not an input refusal");

  const after = await faRow(asset.id);
  assert.equal(after.depreciation_method, null, "refusal.viewer: the asset is NOT erased or half-written");
  assert.equal(after.depreciation_start_date, null);
});

test("p639.refusal.credit_leg a credit-financed acquisition on the Work lane is refused BY NAME, and names the other door", async (t) => {
  if (await gate(t)) return;
  const client = await acqClient("refusal_credit");
  const before = { entries: await entryCountOf(client), assets: await assetCountOf(client) };
  const a = await armedAcquisition({
    client,
    basis: acqBasis({ creditAccount: AP1, memo: "Compressor purchased on supplier credit" }),
  });
  const err = await refuses(() => postAcquisition(a), ACQ.genericControlLeg, "refusal.credit_leg");
  assert.equal(err.code, "CLR10");
  assert.equal(await entryCountOf(client), before.entries,
    "refusal.credit_leg: a refusal leaves NO journal rows behind");
  assert.equal(await assetCountOf(client), before.assets,
    "refusal.credit_leg: …and no half-born register row");
  noteLane(
    "refusal.credit_leg: a generic Work basis may not carry a payable leg (0178:1355-1367), so a "
    + "credit-financed acquisition reaches the register only through intake -> coding. Boundary, "
    + "not a hole.");
});

test("p639.settle.clr40_classification a commit-time CLR40 carries the SQLSTATE and typed reason claraWork classifies, and leaves nothing behind", async (t) => {
  if (await gate(t)) return;
  const client = await acqClient("settle_clr40");
  // Reducing the cost of an enrolled fixed-asset account is a NAMED deferral the belt still
  // refuses AT COMMIT, and it is the remaining commit-time CLR40 on this journey after 0216.
  const { entry } = await buyAsset({ client, cents: 300_000, postingDate: dayIn(mon(-2), 6) });
  assert.ok(entry);
  const before = { entries: await entryCountOf(client), receipts: await committedReceiptCountOf(client) };
  const a = await armedAcquisition({
    client,
    basis: {
      posting_date: dayIn(mon(-1), 3), memo: "supplier rebate on the compressor", currency: "MYR",
      lines: [
        { account_code: BANK, debit_cents: 50_000, credit_cents: 0, description: "rebate received" },
        { account_code: COST, debit_cents: 0, credit_cents: 50_000, description: "cost reduced" },
      ],
    },
  });
  const err = await refuses(() => postAcquisition(a), ACQ.costAdjustmentDeferred, "settle.clr40");
  assert.equal(err.code, "CLR40",
    "settle.clr40: the belt's SQLSTATE is CLR40 — claraWork's classifier keys on (code, reason)");
  assert.equal(reasonToken(err), ACQ.costAdjustmentDeferred,
    "settle.clr40: …and the typed reason the classifier reads is on the DETAIL");
  assert.equal(await entryCountOf(client), before.entries,
    "settle.clr40: a COMMIT-time refusal rolls the whole transaction back — no entry survives");
  assert.equal(await committedReceiptCountOf(client), before.receipts,
    "settle.clr40: …and the receipt that had already been written is gone with it");
  noteLane(
    "settle.clr40 SPECIFICATION: CLR40 is absent from claraWork.v1.errors.ts's (code, reason) table "
    + "and from its CLR default list (CLR03/04/10/11/12/19), so classifyWorkError returns kind "
    + "'invariant' -> the Work settles FAILED with error.code='CLR40', "
    + "agent_tasks.error_code='internal', recoverable:false. Asserted against the deployed "
    + "classifier in packages/runtime/tests/fixed-asset-acquisition.test.mjs.");
});

// ===========================================================================================
// 6 · THE PARTICULARS. The human door is 0041's; the `_for` overload is this slice's, OBO the
//     initiator, and NEITHER writes a journal.
// ===========================================================================================

test("p639.particulars.for_overload the runtime overload completes ONCE OBO the initiator, refuses a demoted initiator by name, and moves no journal", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("for_overload");
  const { out, author } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];
  const entriesBefore = await entryCountOf(client);

  const start = dayIn(mon(-1), 15);
  const done = await completeParticularsFor({
    client, asset: asset.id, obo: author,
    particulars: {
      method: "straight_line", useful_life_months: 60, residual_cents: 0,
      start_date: start, description: "Air compressor, workshop bay 2",
    },
  });
  assert.equal(done.particulars_complete, true, "for_overload: the particulars are complete");
  assert.equal(await entryCountOf(client), entriesBefore,
    "for_overload: answering writes NO second journal — the acquisition already posted");

  const row = await faRow(asset.id);
  assert.equal(row.depreciation_method, "straight_line");
  assert.equal(row.useful_life_months, 60);
  assert.equal(row.depreciation_start_date, start);
  assert.equal(row.description, "Air compressor, workshop bay 2",
    "for_overload: the placeholder name is replaced by the answered one");

  // COMPLETE-ONCE, through the overload as through the human door.
  await refuses(() => completeParticularsFor({
    client, asset: asset.id, obo: author,
    particulars: { method: "straight_line", useful_life_months: 36, start_date: start },
  }), ACQ.particularsAlreadyComplete, "for_overload.once");

  // A DEMOTED initiator is refused BY NAME — the live-authority recheck this overload exists for.
  const client2 = await acqClient("for_overload_demoted");
  const second = await workLaneAcquisition({ client: client2, author: w.users.grace });
  const asset2 = (await assetForEntry(second.out.entry_id))[0];
  const membership = (await rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [w.firms.A, w.users.grace])).rows[0].id;
  const setRole = (role, key) => humanQuery(w.users.alice, namedCall("set_member_role", [
    { name: "p_membership", cast: "uuid" }, { name: "p_role", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [membership, role, opk(key)]);
  await setRole("viewer", "p639demote");
  await refuses(() => completeParticularsFor({
    client: client2, asset: asset2.id, obo: w.users.grace,
    particulars: { method: "none", start_date: start },
  }), ACQ.insufficientRole, "for_overload.demoted");
  // …restore, so a sibling cell sharing this world is not surprised.
  await setRole("bookkeeper", "p639restore");
});

test("p639.particulars.race two runtime sessions arriving TOGETHER produce exactly ONE effect, and the loser is refused by name", async (t) => {
  if (await gate(t)) return;
  // ROUND-1 REVIEW (adversarial 639-A3). The whole point of a complete-ONCE door is what happens
  // when two callers arrive together, and this battery had no two-session cell at all — every
  // "complete once" assertion was sequential, which proves the guard only for a caller that can
  // SEE the first write. The door takes `pg_advisory_xact_lock(203005004, hashtext(client))` and
  // then `clara.fixed_assets … for update` (0216 §D); this cell drives both from two REAL
  // `clara_runtime` sessions with a COMMIT barrier between them.
  const client = await acqClient("particulars_race");
  const { out, author } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];
  const entriesBefore = await entryCountOf(client);
  const start = dayIn(mon(-1), 15);

  const call = (c, months, key) => c.query(namedCall("complete_fixed_asset_particulars_for", [
    { name: "p_client", cast: "uuid" }, { name: "p_asset", cast: "uuid" },
    { name: "p_particulars", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
    { name: "p_obo", cast: "uuid" },
  ]), [client, asset.id, JSON.stringify({
    method: "straight_line", useful_life_months: months, residual_cents: 0, start_date: start,
  }), key, author]);

  let release = null;
  const barrier = new Promise((r) => { release = r; });
  let firstIsHolding = null;
  const firstHasRun = new Promise((r) => { firstIsHolding = r; });

  // SESSION 1 — writes, then HOLDS its transaction open on the barrier.
  const s1 = withActor({ role: ROLES.runtime, transaction: true }, async (c) => {
    const r = await call(c, 60, opk("p639-race-1"));
    firstIsHolding();
    await barrier;
    return r.rows[0].result;
  });
  await firstHasRun;

  // SESSION 2 — a DIFFERENT op key (so this is a genuine second act, never a replay), entering
  // while session 1 still holds the locks. It must BLOCK, not race past.
  const s2 = withActor({ role: ROLES.runtime, transaction: true }, (c) => call(c, 36, opk("p639-race-2")))
    .then((r) => ({ ok: true, result: r.rows[0].result }), (e) => ({ ok: false, error: e }));
  await new Promise((r) => setTimeout(r, 400));
  release();

  const first = await s1;
  const second = await s2;
  assert.equal(first.particulars_complete, true, "race: session 1 completed the particulars");
  assert.equal(second.ok, false,
    `race: session 2 must NOT also succeed (it returned ${JSON.stringify(second.result)})`);
  assert.equal(second.error.code, "CLR37",
    `race: …and it is refused by the door, not by a constraint (got ${second.error.code}: ${second.error.message})`);
  assert.equal(reasonToken(second.error), ACQ.particularsAlreadyComplete,
    "race: …by the complete-once name a surface can act on");

  // EXACTLY ONE EFFECT, and it is the WINNER'S. A last-writer-wins door would show 36 here.
  const row = await faRow(asset.id);
  assert.equal(row.useful_life_months, 60,
    "race: the register carries session 1's answer — the loser wrote nothing");
  assert.equal(row.depreciation_start_date, start);
  assert.equal(await entryCountOf(client), entriesBefore,
    "race: …and neither session wrote a journal entry (answering is not a posting)");
});

test("p639.particulars.replay the SAME op key replays the identical receipt; the same key with DIFFERENT args is refused", async (t) => {
  if (await gate(t)) return;
  // The other half of 639-A3's ask. `_reserve_op` is the estate's idempotency instrument and this
  // door rides it; a replay that quietly did the work twice, or a key reused for a different
  // answer that quietly succeeded, would both be invisible to every other cell in this file.
  const client = await acqClient("particulars_replay");
  const { out, author } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];
  const entriesBefore = await entryCountOf(client);
  const key = opk("p639-replay");
  const particulars = {
    method: "straight_line", useful_life_months: 48, residual_cents: 0,
    start_date: dayIn(mon(-1), 15), description: "Replayed answer",
  };

  const first = await completeParticularsFor({ client, asset: asset.id, particulars, opKey: key, obo: author });
  const again = await completeParticularsFor({ client, asset: asset.id, particulars, opKey: key, obo: author });
  assert.deepEqual(again, first,
    "replay: the same key and the same args return the IDENTICAL receipt, not a second act");
  assert.equal(await entryCountOf(client), entriesBefore,
    "replay: …and no journal entry appears on either call");
  const row = await faRow(asset.id);
  assert.equal(row.useful_life_months, 48);

  // The same key carrying DIFFERENT args is a different act wearing the same name.
  const err = await caught(() => completeParticularsFor({
    client, asset: asset.id, opKey: key, obo: author,
    particulars: { ...particulars, useful_life_months: 24 },
  }));
  assert.ok(err, "replay: a key reused with different args is refused");
  assert.equal(err.code, "CLR10",
    `replay: …by the estate's op-key SQLSTATE (got ${err.code}: ${err.message})`);
  assert.match(String(err.message), /op_key reused/i,
    "replay: …and the message names the reuse, so a caller can tell it from a validation refusal");
  assert.equal((await faRow(asset.id)).useful_life_months, 48,
    "replay: …and the register still carries the FIRST answer");
});

test("p639.particulars.axes every refusal the particulars door raises names the dependent FIELD, never a bare failure", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("particulars_axes");
  const { out, author } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];

  const axisOf = async (particulars, label) => {
    const err = await refuses(() => completeParticularsFor({
      client, asset: asset.id, obo: author, particulars,
    }), ACQ.particularsInvalid, label);
    const d = JSON.parse(String(err.detail));
    return d.axis;
  };
  assert.equal(await axisOf({ method: "straight_line", useful_life_months: 60 }, "axes.start_date"),
    "start_date", "axes: a missing in-service date names start_date");
  assert.equal(await axisOf({ method: "straight_line", start_date: dayIn(mon(-1), 15) }, "axes.drivers"),
    "drivers", "axes: a straight line with no useful life names drivers");

  // …and the non-depreciable enrolment axis, on its own profile.
  const landClient = await acqClient("particulars_axes_land", { enrol: false });
  await upsertFaProfile(w.users.alice, { client: landClient, assetAccount: LAND });
  const land = await buyAsset({
    client: landClient, cents: 200_000, account: LAND, postingDate: dayIn(mon(-1), 2),
  });
  const err = await refuses(() => completeParticulars(w.users.bob, {
    client: landClient, asset: land.asset.id,
    particulars: { method: "straight_line", useful_life_months: 240, start_date: dayIn(mon(-1), 2) },
  }), ACQ.particularsInvalid, "axes.non_depreciable");
  assert.equal(JSON.parse(String(err.detail)).axis, "non_depreciable",
    "axes: a depreciable method on a land enrolment names non_depreciable");
});

// ===========================================================================================
// 7 · THE DEPENDENT QUESTION (#629's estate, reused rather than forked).
// ===========================================================================================

test("p639.question.dependent one versioned question parks the Work after posting; answering it completes the particulars and writes NO second journal", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("question_dependent");
  const a = await armedAcquisition({ client });
  const out = await postAcquisition(a);
  const asset = (await assetForEntry(out.entry_id))[0];
  const entriesAfterPost = await entryCountOf(client);

  // The run parks AFTER the acquisition committed — which is what "mark acquisition complete and
  // create one dependent versioned question" means mechanically.
  const opened = await openWorkQuestion({
    task: a.task_id,
    reason: "The acquisition is posted. Depreciation particulars are still outstanding.",
    sourceRef: { kind: "fixed_asset", asset_id: asset.id },
  });
  assert.equal(opened.replayed, false);
  assert.equal(opened.question_version, 1, "question: the first question of this Work is version 1");
  assert.equal(opened.work_id, a.work_id);

  const parked = await workRow(a.work_id);
  assert.equal(parked.status, "awaiting_input", "question: the Work waits…");
  assert.equal(parked.result.entry_id, out.entry_id, "question: …while its posted outcome stands");

  // The SAME question, from the register's own entrance — one record, many surfaces.
  const q = await pendingQuestion(w.users.bob, a.work_id);
  assert.equal(q.question_id, opened.question_id);
  assert.equal(q.question_version, 1);
  assert.equal(q.source_ref.asset_id, asset.id,
    "question: the question names the asset it depends on");
  assert.equal(q.fields.length, FA_PARTICULARS_FIELDS.length,
    "question: …and declares the particulars fields the form renders");

  // A STALE VERSION is refused by name and discards nothing.
  await refuses(() => answerWorkQuestion(w.users.bob, {
    question: opened.question_id, version: 99,
    // `residual_cents` is a `money` field, and clara._assert_work_answer demands an integer
    // NUMBER of cents rather than a string — exact minor units all the way down the lane.
    answer: {
      method: "straight_line", useful_life_months: "60", residual_cents: 0,
      start_date: dayIn(mon(-1), 15),
    },
  }), ACQ.staleQuestion, "question.stale");
  const stillPending = await pendingQuestion(w.users.bob, a.work_id);
  assert.equal(stillPending.question_id, opened.question_id,
    "question.stale: the question is still open — a stale answer discards no draft");

  // The answer lands…
  const answered = await answerWorkQuestion(w.users.bob, {
    question: opened.question_id, version: 1,
    answer: {
      method: "straight_line", useful_life_months: "60", rate_bps: "", residual_cents: 0,
      start_date: dayIn(mon(-1), 15), description: "Air compressor",
    },
  });
  assert.equal(answered.status, "answered");

  // …and the run applies it through the `_for` overload — no second journal, ever.
  const applied = await completeParticularsFor({
    client, asset: asset.id, obo: a.author,
    particulars: {
      method: "straight_line", useful_life_months: 60, residual_cents: 0,
      start_date: dayIn(mon(-1), 15), description: "Air compressor",
    },
  });
  assert.equal(applied.particulars_complete, true);
  assert.equal(await entryCountOf(client), entriesAfterPost,
    "question: applying the answer wrote NO second journal entry");
  const detail = await getFixedAsset(w.users.bob, asset.id);
  assert.equal(detail.particulars.complete, true);
  assert.equal(detail.acquisition.entry_id, out.entry_id,
    "question: …and the acquisition block is unchanged by the answer");
});

// ===========================================================================================
// 8 · CORRECTION. Reverse + rebook, made VISIBLE as a chain rather than re-linked (AC4).
// ===========================================================================================

test("p639.correction.chain reverse + rebook births a second row and the History projection names predecessor and successor; in-place cost adjustment still refuses by name", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("correction_chain");
  const first = await buyAsset({ client, cents: 500_000, postingDate: dayIn(mon(-2), 8) });
  await reverseAndSettle(w.users.alice, {
    entry: first.entry, reason: "cost captured at the gross figure", opKey: opk("p639corr"),
  });
  const second = await buyAsset({ client, cents: 470_000, postingDate: dayIn(mon(-2), 9) });
  assert.notEqual(second.asset.id, first.asset.id,
    "correction: the re-booking births its OWN row, keyed to its own cost line");

  const predecessorDetail = await getFixedAsset(w.users.bob, first.asset.id);
  const successorDetail = await getFixedAsset(w.users.bob, second.asset.id);

  assert.ok(predecessorDetail.history.acquisition_reversed_by,
    "correction: the predecessor's History names the reversal mirror that unwound it");
  const succ = predecessorDetail.history.related.find((r) => r.asset_id === second.asset.id);
  assert.ok(succ, "correction: …and names the re-booked SUCCESSOR");
  assert.equal(succ.relation, "successor");
  const pred = successorDetail.history.related.find((r) => r.asset_id === first.asset.id);
  assert.ok(pred, "correction: the successor's History names the reversed PREDECESSOR");
  assert.equal(pred.relation, "predecessor");
  assert.ok(pred.link, "correction: …and says HOW the chain was derived rather than implying a stored link");

  // IN-PLACE cost adjustment is still refused BY NAME — the chain is the remedy, not an edit.
  const err = await caught(() => approvedEntry(w.users.alice, {
    client, postingDate: dayIn(mon(-1), 11), memo: "trim the compressor cost",
    lines: [
      { account_code: BANK, debit_cents: 30_000, credit_cents: 0, description: "rebate" },
      { account_code: COST, debit_cents: 0, credit_cents: 30_000, description: "cost reduced" },
    ],
  }));
  assert.ok(err, "correction: an in-place cost reduction is refused");
  assert.equal(reasonToken(err), ACQ.costAdjustmentDeferred,
    "correction: …by the name that tells the professional to reverse and re-book");
});

test("p639.correction.co_acquired two cost lines on ONE invoice birth two rows, and NEITHER supersedes the other", async (t) => {
  if (await gate(t)) return;
  // ROUND-1 REVIEW (adversarial 639-A2), measured: a two-cost-line supplier invoice is the
  // ORDINARY case (0041 §9.4 births one row per cost line), and the first cut of
  // `clara._fa_acquisition_history` told each sibling the other was its `successor` — because
  // they share the acquisition entry, therefore the document, therefore the `source_document`
  // arm, and `approved_at >= approved_at` is true in BOTH directions. On the very tab AC4 adds to
  // show corrections, that is a mutually contradictory accounting claim.
  const w = await acqWorld();
  const client = await acqClient("co_acquired");
  const filed = await documentLaneAcquisition(w.users.alice, {
    firm: w.firms.A, client, cents: 500_000, secondCostCents: 40_000,
    postingDate: dayIn(mon(-1), 9),
  });
  const rows = await assetForEntry(filed.entry);
  assert.equal(rows.length, 2,
    `co_acquired: ONE invoice with two cost lines births TWO register rows (got ${rows.length})`);

  for (const [self, other] of [[rows[0], rows[1]], [rows[1], rows[0]]]) {
    const detail = await getFixedAsset(w.users.bob, self.id);
    const rel = (detail.history.related ?? []).filter((r) => r.asset_id === other.id);
    assert.equal(rel.length, 1,
      `co_acquired: ${self.id} names its sibling exactly once (got ${JSON.stringify(rel)})`);
    assert.equal(rel[0].link, "co_acquired_on_same_document",
      "co_acquired: …by the link that says they were booked together…");
    assert.equal(rel[0].relation, "co_acquired",
      "co_acquired: …with an ORDERLESS relation: neither row supersedes the other");
    assert.notEqual(rel[0].relation, "successor",
      "co_acquired: …and above all NOT 'successor', which is what both rows used to claim");
    assert.equal(detail.history.chain_open, false,
      "co_acquired: a co-acquired sibling is not an open correction chain");
  }
});

// ===========================================================================================
// 9 · THE SECOND HALF OF AC6, RE-MEASURED (never copied): an incomplete asset is skipped ALONE.
// ===========================================================================================

test("p639.depreciation.independent an asset waiting on particulars is skipped ALONE and its neighbours still charge", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("depr_independent", { enrol: false });
  await upsertFaProfile(w.users.alice, {
    client, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2,
  });
  // ONE recently-ENDED month carries both acquisitions and the neighbour's in-service date, so
  // the run's own "oldest unmet period first" rule (0041, CLR38 period_earlier_unmet) is satisfied
  // by the period under test rather than by a second run this cell is not about.
  const period = mon(-1);
  const complete = await buyAsset({ client, cents: 360_000, postingDate: dayIn(period, 3) });
  await completeParticulars(w.users.bob, {
    client, asset: complete.asset.id,
    particulars: {
      method: "straight_line", useful_life_months: 36, residual_cents: 0,
      start_date: dayIn(period, 3), description: "complete neighbour",
    },
  });
  const { out } = await workLaneAcquisition({
    client, basis: acqBasis({ cents: 240_000, postingDate: dayIn(period, 4) }),
  });
  const waiting = (await assetForEntry(out.entry_id))[0];

  const { liveAuthority, runAndSettle } = await import("./x41-fa-world.mjs");
  await liveAuthority(client, "monthly");
  const run = await runAndSettle(client, period, { approveAs: w.users.alice });
  assert.notEqual(run.mode, "noop", "independent: the period ran");
  const skipped = run.receipt.skipped ?? [];
  const mine = skipped.filter((s) => s.asset_id === waiting.id);
  assert.equal(mine.length, 1,
    `independent: the waiting asset is skipped by id (skipped=${JSON.stringify(skipped)})`);
  assert.equal(mine[0].reason, "incomplete",
    "independent: …for the reason 'incomplete', by name — not a generic failure");
  assert.ok(Number(run.receipt.charged_cents) > 0,
    "independent: …while the complete neighbour still charged — the dependency is the ASSET'S, not the run's");

  // AND THE SCHEDULED RUN BIRTHS NOTHING — the `origin='scheduled_run'` exclusion, proven by
  // BEHAVIOUR here rather than only by the `prosrc` string search in `p639.birth.exclusions`
  // (round-1 review, 639-A5: a guard that is present but ineffective would pass a string search).
  // This is a real approved depreciation entry, posted by the production run, on a client whose
  // cost account IS enrolled.
  assert.equal(await assetCountOf(client), 2,
    "independent: a scheduled depreciation run births no register row — the two acquisitions are all");
});

// ===========================================================================================
// 10 · ISOLATION. Another firm's Work may not post into this client, and the reads are firm-walled.
// ===========================================================================================

test("p639.isolation.cross_firm a credential OBO another firm's member cannot post this client's acquisition, and the reads refuse by CLR11", async (t) => {
  if (await gate(t)) return;
  const w = await acqWorld();
  const client = await acqClient("isolation");
  const { out } = await workLaneAcquisition({ client });
  const asset = (await assetForEntry(out.entry_id))[0];

  const readErr = await caught(() => getFixedAsset(w.users.dave, asset.id));
  assert.ok(readErr, "isolation: another firm's member cannot read this asset");
  assert.equal(readErr.code, "CLR11",
    "isolation: …and is refused with the estate's no-oracle not-found, never a permission oracle");

  const a = await armedAcquisition({ client });
  const cred = await mintClientObo({ firm: w.firms.A, obo: w.users.alice, client });
  const err = await caught(() => wakeRecordJournalEntry(cred.secret, {
    client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, runId: a.runId,
  }));
  assert.ok(err, "isolation: a credential OBO a human who is not this Work's initiator is refused");
  assert.equal(reasonToken(err), ACQ.oboNotInitiator);
});
