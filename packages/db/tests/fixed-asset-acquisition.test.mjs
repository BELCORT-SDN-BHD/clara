// #639 [0201] — 完成资产购入与登记，独立等待缺失折旧资料.
//
// THE CELL THAT DEFINES THE TICKET IS `p639.birth.work_lane`, AND IT IS WRITTEN FIRST. Before
// 0201 it fails at COMMIT with CLR40 `fa_belt_unregistered_movement`: the Work lane's posting core
// (`clara._record_journal_entry_core`, 0195:2110-2113) approves with a raw
// `update ... set status='approved'` and calls no subledger hook, so no register row is born, and
// the DEFERRED belt `t_je_fa_movement_belt` (0041:2741-2743) refuses the whole transaction at
// COMMIT — after the operation receipt (0195:2130) and the Work result (0195:2194) were written.
// Everything 0201 adds is whatever makes that cell green without moving a pinned body.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`humanQuery` / `roleQuery` / the wake
// credential), never `rootQuery` — DECISIONS §1.10. Root appears only as a readback.
//
// FRONTIER-GATED on the `fixed_asset_acquisition$` stem, never on a number. A FOCUSED invocation
// (without `--import ./tests/fixed-asset-acquisition-preintegration-gate.mjs`) FAILS LOUDLY when
// 0201 is absent, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAcq, gateWorkLane, ACQ, BIRTH_TRIGGER, BELT_TRIGGER, FA_PARTICULARS_FIELDS,
  acqWorld, acqClient, acqBasis, armedAcquisition, postAcquisition, workLaneAcquisition,
  completeParticularsFor, openWorkQuestion, answerWorkQuestion, pendingQuestion,
  assetForEntry, triggerOrderOnJournalEntries, approvePathBodies, faHookCallers,
  subledgerHookCallers, entryCountOf, committedReceiptCountOf, assetCountOf,
  buyAsset, completeParticulars, getFixedAsset, listFixedAssets, upsertFaProfile,
  reverseAndSettle, approvedEntry, faRow, entryRowOf, eventCount,
  workRow, receiptsForWork, mintClientObo, wakeRecordJournalEntry,
  COST, ACCUM2, EXPENSE2, BANK, LAND, AP1, SHARE,
  mon, dayIn, opk, rootQuery, humanQuery, namedCall,
  refuses, caught, reasonToken, noteLane, printLaneNotes, printSkipCount, endPool,
  x41EnsureReady,
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

/** Every cell needs 0041 (the register), 0178 (the Work lane) and 0201 (this slice). */
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
  //     0201's guard closes the mechanical site itself so it needs BOTH guards to fail.
  const src = await rootQuery(
    "select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
    + "where n.nspname='clara' and p.proname='_tf_fa_acquisition_birth'");
  assert.equal(src.rowCount, 1, "exclusions: the birth trigger function exists");
  const body = src.rows[0].prosrc;
  for (const guard of ["is_opening_balance", "reversal_of", "fa_disposal", "scheduled_run"]) {
    assert.ok(body.includes(guard),
      `exclusions: the birth trigger carries the ${guard} exclusion in its own body`);
  }
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
  // added `finalize_close` and `reopen_fiscal_year` — so 0201's tail re-derives and re-pins the
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
    "census: …and it does NOT call the subledger hook — the fact 0201's lane-agnostic trigger closes");
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
  // refuses AT COMMIT, and it is the remaining commit-time CLR40 on this journey after 0201.
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
