// 0056 (Wave E lane beta, the close model) rig -- PART 8: the campaign's SEVENTH
// catch (f226f7c, S9b) -- approve_opening_correction's NEW _assert_correction_pin_
// neutral guard. While a pinned close stands for a client, a correction batch
// (a supersession's reversal mirror + its replacement draft) must net EXACTLY
// ZERO per balance-sheet account; a genuine non-zero movement refuses
// CLR41/close_pinned_reopen_first naming the measured bs_deltas. Pre-close (no
// pin standing yet), the guard is an early-return no-op.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG
// (_assert_correction_pin_neutral's live body IS read for MY OWN authorial
// grounding of the assertion shape, per established practice -- never cited as
// the test's basis).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, freshActiveClient, proposeFY, openFY, addDaysStr,
  beginClose, finalizeClose, setupCloseCoa, plainEntry, BANK1, RE1, REVN, EXPN,
  verifyClose,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 rest-d suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-d"); printSkipCount("x56-rest-d"); await endPool(); });

/** A close-capable client (freshActiveClient + bootstrap_client_plan, same door
 *  as the A19g seed-arm) with its GENESIS opening seed approved BEFORE any
 *  close-model activity exists (as_of predates FY(n) entirely, so
 *  _opening_seed_basis's real-activity union finds nothing yet -- no doubling,
 *  and no prior close receipt exists at THIS approval, so the pin-tie is a
 *  no-op, matching the design's own "first-FY case"). One active opening_item
 *  (BANK1 debit genesisCents) is the correction target for every cell below.
 *  Returns { client, plan, seed, itemId } with the seed 'finalized'. */
async function genesisSeededClient(owner, drafter, tag, genesisCents = 100_000) {
  const client = await freshActiveClient(owner, tag);
  await setupCloseCoa(owner, client);
  await humanQuery(owner, "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => $5, p_op_key => $6) as r",
    [client, "905-C56", `OBE (${tag})`, "equity", "opening_balance_equity", opk(`x56-obe-${tag}`)]);
  const plan = (await humanQuery(owner, "select clara.bootstrap_client_plan(p_client => $1, p_op_key => $2) as r", [client, opk(`x56-boot-${tag}`)])).rows[0].r.plan_id;

  const asOf = "2026-06-01"; // genuinely before any close-model FY exists yet
  const seedR = await wb.createOpeningSeed(owner, { client, plan, asOf });
  const seed = seedR.seed_id ?? seedR.id;
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "genesis-bank", account_code: BANK1, source_label: `${tag} genesis`, debit_cents: genesisCents, credit_cents: 0, provenance_kind: "keyed", entered_by: drafter } });
  // The obe_plug's own auto-generated RE contra leg (credit genesisCents) is
  // ALSO part of "actual" (_opening_seed_basis) and needs its own matching
  // target -- the same requirement discovered building the A19g seed-arm.
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "genesis-re", account_code: RE1, source_label: `${tag} genesis RE`, debit_cents: 0, credit_cents: genesisCents, provenance_kind: "keyed", entered_by: drafter } });
  const d1 = await wb.draftOpeningItem(drafter, {
    client, seed, resolution: wb.keyedRes(drafter, { client, seed }),
    item: { item_kind: "gl_balance", item_key: "genesis-bank" },
    lines: [{ account_code: BANK1, debit_cents: genesisCents, credit_cents: 0 }],
  });
  // A single gl_balance item's own auto-generated OBE offset leg does not net
  // to zero on its own (measured in the A19g seed-arm work) -- an obe_plug
  // closes the loop (amount=-genesisCents -> OBE debit genesisCents,
  // cancelling BANK1's auto OBE credit; the RE credit side is harmless here,
  // simply accumulating as this client's retained earnings from inception).
  const d2 = await wb.draftOpeningItem(drafter, {
    client, seed, resolution: wb.keyedRes(drafter, { client, seed }),
    item: { item_kind: "obe_plug", item_key: "genesis-plug", amount_cents: -genesisCents },
  });
  // owner approves (distinct from drafter) -- maker-checker, per-item.
  await wb.approveOpeningSeed(owner, { seed, planRevision: await wb.planRevision(plan), entryRevisions: wb.revMapOf([d1, d2]), opKey: opk(`x56-genesis-${tag}`) });
  const itemRow = (await rootQuery("select id from clara.opening_items where seed_id=$1 and item_key='genesis-bank' and state='active'", [seed])).rows[0];
  const plugRow = (await rootQuery("select id from clara.opening_items where seed_id=$1 and item_key='genesis-plug' and state='active'", [seed])).rows[0];
  return { client, plan, seed, itemId: itemRow.id, plugItemId: plugRow.id, genesisCents };
}

/** Closes a clean FY (2027) for an already-genesis-seeded client, pinning
 *  BANK1 = genesisCents + 300000 (revenue-expense net), RE1 = -300000. */
async function closeFyOn(owner, prepSub, setup) {
  const startsOn = "2027-01-01";
  const proposal = await proposeFY(owner, { client: setup.client, startsOn });
  const opened = await openFY(owner, { client: setup.client, label: "catch7 FY1", startsOn, endsOn: proposal.ends_on });
  const midYear = addDaysStr(startsOn, 90);
  await plainEntry(prepSub, { client: setup.client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: midYear, memo: "catch7 revenue" });
  await plainEntry(prepSub, { client: setup.client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: midYear, memo: "catch7 expense" });
  await beginClose(owner, { fy: opened.fiscal_year_id });
  return finalizeClose(owner, { fy: opened.fiscal_year_id });
}

test("catch-7 non-neutral correction is REFUSED while a pin stands, naming bs_deltas", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const setup = await genesisSeededClient(owner, drafter, "c7nn");
  const closed = await closeFyOn(owner, drafter, setup);
  assert.ok(closed.receipt_id, "mandatory setup: FY(n) closes, pinning a position that includes the genesis balance");

  // Off by ONE CENT: reversal (auto) credits BANK1 100,000; replacement debits
  // BANK1 100,001 -- net delta on BANK1 = +1, a genuine post-pin movement.
  // supersede as drafter, approve as owner -- distinct, per-item maker-checker.
  const sup = await wb.supersedeOpeningItem(drafter, {
    item: setup.itemId,
    replacement: { item: { item_kind: "gl_balance", item_key: "genesis-bank-v2" }, lines: [{ account_code: BANK1, debit_cents: setup.genesisCents + 1, credit_cents: 0 }] },
  });
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id, sup.replacement_entry_id])) {
    if (!eid) continue;
    const e = (await rootQuery("select status, revision_token from clara.journal_entries where id=$1", [eid])).rows[0];
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  assert.ok(drafts.length >= 1, "mandatory setup: the supersede minted at least one draft to approve");

  const err = await caught(() => wb.approveOpeningCorrection(owner, { seed: setup.seed, entryRevisions: wb.revMapOf(drafts), opKey: opk("x56-c7nn-approve") }));
  assert.ok(err, "a non-neutral correction while pinned must be refused");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_identity_failed");
  assert.equal(det.refusal, "close_pinned_reopen_first");
  assert.ok(det.pinned_receipt_id, "names the pinned receipt");
  const bankDelta = (det.bs_deltas ?? []).find((d) => d.account_code === BANK1);
  assert.ok(bankDelta, "BANK1 appears in bs_deltas, naming the account that moved");
  assert.equal(bankDelta.net_delta_cents, 1, "names the exact 1-cent net movement");
});

test("catch-7 RIGHT ANSWER: a NEUTRAL correction (net zero per account) is ADMITTED even while a pin stands", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const setup = await genesisSeededClient(owner, drafter, "c7n");
  const closed = await closeFyOn(owner, drafter, setup);
  assert.ok(closed.receipt_id, "mandatory setup: FY(n) closes, pinning a position that includes the genesis balance");

  // EXACT SAME account and amount: reversal (auto) credits BANK1 100,000;
  // replacement debits BANK1 100,000 -- net delta on BANK1 = 0. A pure
  // metadata-only recomposition (e.g. correcting a memo/description), not a
  // balance-sheet move.
  const sup = await wb.supersedeOpeningItem(drafter, {
    item: setup.itemId,
    replacement: { item: { item_kind: "gl_balance", item_key: "genesis-bank-v2" }, lines: [{ account_code: BANK1, debit_cents: setup.genesisCents, credit_cents: 0 }] },
  });
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id, sup.replacement_entry_id])) {
    if (!eid) continue;
    const e = (await rootQuery("select status, revision_token from clara.journal_entries where id=$1", [eid])).rows[0];
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }

  const receipt = await wb.approveOpeningCorrection(owner, { seed: setup.seed, entryRevisions: wb.revMapOf(drafts), opKey: opk("x56-c7n-approve") });
  assert.ok(receipt, "a neutral correction succeeds even while the FY is pinned closed");
  const regRow = (await rootQuery("select state from clara.opening_seed_registry where id=$1", [setup.seed])).rows[0];
  assert.equal(regRow.state, "finalized", "the registry re-finalized after the neutral correction");
  const newItem = (await rootQuery("select id from clara.opening_items where seed_id=$1 and item_key='genesis-bank-v2' and state='active'", [setup.seed])).rows[0];
  assert.ok(newItem, "the replacement item is now the active one");

  // The pin itself is untouched by a neutral recomposition -- a fresh
  // recompute of the standing close receipt still verifies clean.
  const verified = await verifyClose(owner, { receipt: closed.receipt_id });
  assert.equal(verified.verified, true, "the standing close receipt still verifies after the neutral correction -- nothing pinned moved");
  assert.deepEqual(verified.strict.closing_position_diffs, [], "zero closing-position diffs on the fresh recompute");
});

// A genuinely non-neutral, single-supersession correction that ALSO keeps
// Wave-B's OWN pre-existing OBE-nil requirement satisfied turns out to be
// unreachable, TRIED not assumed: supersede_opening_item's reversal always
// mirrors the ORIGINAL item's own auto-generated OBE leg exactly, so any
// amount change leaves OBE off by precisely that delta -- and
// supersede_opening_item itself refuses a second call in the same open cycle
// ("opening item correction requires a finalized seed", measured directly),
// so no compensating item can join the same round to close the gap. A
// self-balanced multi-line replacement (no OBE leg at all) does not help
// either -- the REVERSAL still reintroduces the original's OBE contribution
// uncancelled. This is a K5 (Wave-B, pre-0056) constraint, not something
// _assert_correction_pin_neutral imposes -- so the SAME precedent A13c set
// (structural proof + a compatible behavioural probe, when the literal
// branch is blocked by an orthogonal constraint) applies here.
test("catch-7 pre-close: the guard's early-return is the FIRST substantive check in the live body (structural)", async (t) => {
  if (skip56(t)) return;
  const body = (await rootQuery(
    "select pg_get_functiondef('clara._assert_correction_pin_neutral(uuid)'::regprocedure) as def",
  )).rows[0].def;
  const returnIdx = body.search(/if v_receipt\.id is null then return; end if;/);
  const raiseIdx = body.search(/close_pinned_reopen_first/);
  assert.ok(returnIdx >= 0, "the no-pin early-return is present, textually");
  assert.ok(raiseIdx >= 0, "the refusal branch is present, textually");
  assert.ok(returnIdx < raiseIdx, "the early-return precedes the refusal -- no pin standing means the guard never reaches its own refusal branch");
});

test("catch-7 pre-close (behavioural): a correction succeeds normally with no pin standing -- the guard's early-return path is genuinely exercised, not merely read", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const setup = await genesisSeededClient(owner, drafter, "c7pre");
  // NO close_model FY is ever opened or closed for this client -- no pin
  // exists, so _assert_correction_pin_neutral's SELECT against close_receipts
  // finds nothing and returns before its own refusal branch can fire.
  const sup = await wb.supersedeOpeningItem(drafter, {
    item: setup.itemId,
    replacement: { item: { item_kind: "gl_balance", item_key: "genesis-bank-v2" }, lines: [{ account_code: BANK1, debit_cents: setup.genesisCents, credit_cents: 0 }] },
  });
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id, sup.replacement_entry_id])) {
    if (!eid) continue;
    const e = (await rootQuery("select status, revision_token from clara.journal_entries where id=$1", [eid])).rows[0];
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  const receipt = await wb.approveOpeningCorrection(owner, { seed: setup.seed, entryRevisions: wb.revMapOf(drafts), opKey: opk("x56-c7pre-approve") });
  assert.ok(receipt, "the correction succeeds with no pin standing");
  const noReceipt = (await rootQuery("select count(*)::int as n from clara.close_receipts where client_id=$1", [setup.client])).rows[0];
  assert.equal(noReceipt.n, 0, "mandatory confirmation: no close ever happened for this client -- the guard's early-return path is what was actually exercised, not the refusal branch");
});

// RULING-1 STRENGTHENING (team-lead, optional, <15 min): the SAME non-neutral
// batch that A19c-family reasoning shows leaves OBE off by 1 cent (the one
// used in the "refused while pinned" cell above) is attempted here with NO
// pin standing. If _assert_correction_pin_neutral's early-return had NOT
// fired, the refusal would be CLR41/close_pinned_reopen_first (the SAME
// token the pinned cell asserts). Instead it refuses CLR31 (K5's OWN,
// unrelated OBE-nil check) -- discriminating BY REFUSAL CODE that the guard
// genuinely stepped aside, not merely that "some correction, somewhere,
// succeeded pre-close" (the weaker claim the success-arm alone proves).
test("catch-7 pre-close (refusal-code discrimination): the SAME non-neutral (OBE-imbalanced) batch refuses CLR31 (K5's own tie), NEVER CLR41 (the pin guard) -- proving the early-return by which wall answers, not just that one exists", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const setup = await genesisSeededClient(owner, drafter, "c7disc");
  // NO close_model FY for this client -- no pin exists.
  const sup = await wb.supersedeOpeningItem(drafter, {
    item: setup.itemId,
    replacement: { item: { item_kind: "gl_balance", item_key: "genesis-bank-v2" }, lines: [{ account_code: BANK1, debit_cents: setup.genesisCents + 1, credit_cents: 0 }] },
  });
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id, sup.replacement_entry_id])) {
    if (!eid) continue;
    const e = (await rootQuery("select status, revision_token from clara.journal_entries where id=$1", [eid])).rows[0];
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  const err = await caught(() => wb.approveOpeningCorrection(owner, { seed: setup.seed, entryRevisions: wb.revMapOf(drafts), opKey: opk("x56-c7disc-approve") }));
  assert.ok(err, "an OBE-imbalanced correction still refuses -- just not from the pin guard");
  assert.equal(err.code, "CLR31", `expected CLR31 (K5's OBE-nil, got ${err.code} -- ${err.message})`);
  assert.notEqual(err.detail && JSON.parse(err.detail).refusal, "close_pinned_reopen_first", "NEVER the pin guard's refusal token -- it never got the chance to fire");
  const noReceipt = (await rootQuery("select count(*)::int as n from clara.close_receipts where client_id=$1", [setup.client])).rows[0];
  assert.equal(noReceipt.n, 0, "mandatory confirmation: no close ever happened for this client");
});
