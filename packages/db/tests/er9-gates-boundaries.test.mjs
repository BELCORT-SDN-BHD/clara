// E-R9 SANDBOX ACCEPTANCE BATTERY — PART 3: the drawer-2 attestation cycle (the shape
// BEE's own close will walk), the closing-stock question for a services business in both
// directions, close/reopen ORDERING, the live-inert boundary, and the human-only grant
// matrix that makes the final close act a human act by construction.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip, waveAEnsureReady,
  draftEntryV3, freshResolution, upsertAccountClassed, approveEntry, opk, reviseEntry,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, hasB3, caught, cleanCloseableFY, freshActiveClient, recordClientFact,
  proposeFY, openFY, beginClose, attestClose, abandonClose, finalizeClose, verifyClose, reopenFY,
  listFiscalYears, grantCapability, plainEntry, attestCloseSig,
  AR1, AP1, RE1, REVN, EXPN, BANK1, addDaysStr,
} from "./x56-fixtures.mjs";
import {
  FY_START, REV_CENTS, EXP_CENTS,
  getClosePlan, entryRow, receiptRow, latestGates, fyStatus, detailOf,
} from "./er9-corpus-fixtures.mjs";

let ready = false, has56 = false, b3 = false, world = null, anchorFy = null;

function gate(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent — E-R9 gates battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied — close model absent"); return; }
  b3 = await hasB3();
  world = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("er9-gates-boundaries");
  printSkipCount("er9-gates-boundaries");
  await endPool();
});

/** A draft dated inside the fixture year — BEE's exact live blocker shape.
 *  DELIBERATELY NOT a control-account pair: a receivable/payable line carries its own
 *  counterparty requirement (CLR23, "every control-class line requires a counterparty"),
 *  which fires BEFORE the period wall and would make a wall cell assert the wrong guard. */
async function draftInsideYear(client, cents, dayOffset, memo) {
  const d = await draftEntryV3(world.users.bob, {
    client,
    resolution: freshResolution(world.users.bob, client, { subjectKind: "manual", subjectId: null }),
    memo, postingDate: addDaysStr(FY_START, dayOffset),
    lines: [
      { account_code: EXPN, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: BANK1, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("er9-draft"),
  });
  return d.entry_id;
}

// =====================================================================================
// PHASE G — THE DRAWER-2 ATTESTATION CYCLE.
// =====================================================================================

test("R9.G1 an unapproved draft inside the year fails drawer 2 ITEMIZED: finalize refuses naming the missing item, a blanket attestation refuses, an unknown item refuses, a drawer-1 identity refuses outright — and the per-item attestation keeps who/why/which-item forever", async (t) => {
  if (gate(t)) return;
  const fx = await cleanCloseableFY(world.users.alice, {
    tag: "er9draft", prepSub: world.users.bob, startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
  const draftId = await draftInsideYear(fx.client, 55500, 35, "er9 rig: an unapproved invoice sitting inside the year");

  const begun = await beginClose(world.users.alice, { fy: fx.fy });
  const run = begun.close_run_id;
  const g = (await latestGates(run)).get("unapproved_drafts_in_period");
  assert.equal(g.state, "fail", "the drafts gate FAILS with a draft inside the year");
  assert.equal(g.measured.draft_count, 1, "and counts it");
  assert.equal(g.measured.drafts[0].entry_id, draftId, "and NAMES it — the gate is itemized, not a scalar verdict");

  const err = await caught(() => finalizeClose(world.users.alice, { fy: fx.fy }));
  assert.ok(err, "an unattested drawer-2 failure must refuse the close");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} — ${err.message})`);
  const det = detailOf(err);
  assert.equal(det.reason, "drawer2_unattested");
  assert.equal(det.check_key, "unapproved_drafts_in_period");
  assert.deepEqual(det.missing_items, [draftId], "the refusal names exactly which item carries no attestation");

  const blanket = await caught(() => attestClose(world.users.alice, {
    closeRun: run, checkKey: "unapproved_drafts_in_period",
    reason: "er9 rig: accepting the whole gate at once", itemKey: null,
  }));
  assert.ok(blanket, "a blanket attestation on an itemized gate must refuse — E-R2's ruled per-item shape");
  assert.equal(blanket.code, "CLR10", `expected CLR10 (got ${blanket.code} — ${blanket.message})`);
  assert.equal(detailOf(blanket).reason, "attest_item_required");
  assert.deepEqual(detailOf(blanket).outstanding_items, [draftId], "and hands back the item keys the caller must use");

  const bogus = await caught(() => attestClose(world.users.alice, {
    closeRun: run, checkKey: "unapproved_drafts_in_period",
    reason: "er9 rig: naming an item that is not outstanding", itemKey: randomUUID(),
  }));
  assert.ok(bogus, "an item that is not outstanding must refuse");
  assert.equal(detailOf(bogus).reason, "attest_item_unknown");

  const d1 = await caught(() => attestClose(world.users.alice, {
    closeRun: run, checkKey: "ar_control_tie", reason: "er9 rig: attempting to override an identity",
  }));
  assert.ok(d1, "a drawer-1 identity must refuse every attestation");
  assert.equal(d1.code, "CLR41");
  assert.equal(detailOf(d1).reason, "drawer1_identity_failed");
  assert.equal(detailOf(d1).drawer, 1, "and says which drawer it lives in — there is no override, for anybody");

  const att = await attestClose(world.users.alice, {
    closeRun: run, checkKey: "unapproved_drafts_in_period", itemKey: draftId,
    reason: "er9 rig: this draft duplicates an approved entry and will be discarded in FY2026",
  });
  assert.equal(att.item_key, draftId, "the attestation names the item it accepts");
  assert.ok(att.measured_digest, "and binds the digest it signed");
  assert.equal(att.attested_by, world.users.alice);

  const closed = await finalizeClose(world.users.alice, { fy: fx.fy });
  assert.ok(closed.receipt_id, "with the item attested, the close proceeds");
  const r = await receiptRow(closed.receipt_id);
  assert.equal(r.snapshot.attestations.length, 1, "the receipt keeps the attestation permanently");
  const a = r.snapshot.attestations[0];
  assert.equal(a.check_key, "unapproved_drafts_in_period");
  assert.equal(a.item_key, draftId, "with its ITEM key — bindable to the exact item years later");
  assert.equal(a.attested_by, world.users.alice, "and who accepted it");
  assert.match(a.reason, /duplicates an approved entry/, "and why, verbatim");
  assert.equal(a.superseded, false);

  assert.equal((await entryRow(draftId)).status, "draft",
    "the draft is STILL a draft — an attestation accepts an exception, it never approves anything");
});

test("R9.G1b THE YEAR FREEZES THE MOMENT begin_close RUNS: inside a 'closing' year no line may be written, changed or deleted — even on a DRAFT — so a blocker cannot be fixed mid-close; abandon_close is the lawful way back to an editable year", async (t) => {
  if (gate(t)) return;
  const fx = await cleanCloseableFY(world.users.alice, {
    tag: "er9freeze", prepSub: world.users.bob, startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
  const draftId = await draftInsideYear(fx.client, 33300, 30, "er9 rig: a draft raised BEFORE the close began");
  const begun = await beginClose(world.users.alice, { fy: fx.fy });
  assert.equal(await fyStatus(fx.fy), "closing", "mandatory setup: the year is mid-close");

  // (a) A NEW entry in the year cannot be given lines. The ENTRIES wall admits a bare draft
  // header (it refuses only approved-class touches); the LINES wall refuses any line whose
  // parent sits in a closing/closed year, whatever the parent's status — so in practice
  // nothing new can be raised.
  const newDraft = await caught(() => draftInsideYear(fx.client, 44400, 31, "er9 rig: a draft raised DURING the close"));
  assert.ok(newDraft, "a new entry cannot be raised inside a closing year");
  assert.equal(newDraft.code, "CLR19", `expected CLR19 (got ${newDraft.code} — ${newDraft.message})`);
  assert.match(newDraft.message, /its lines may not change/i, "and the LINES wall is what says so");

  // (b) The pre-existing draft cannot be approved either — the approved-class touch needs a
  // permit, and no application role can mint one.
  const d = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftId])).rows[0];
  const approve = await caught(() => approveEntry(world.users.alice, {
    entry: draftId, expectedRevision: d.revision_token, opKey: opk("er9-freeze-appr"),
  }));
  assert.ok(approve, "the blocking draft cannot be approved mid-close");
  assert.equal(approve.code, "CLR19", `expected CLR19 (got ${approve.code} — ${approve.message})`);
  assert.equal(detailOf(approve).reason, "write_into_closed_period");
  assert.equal(detailOf(approve).fy_status, "closing", "and it names the state the year is in");

  // (b2) THE CHANGE ARM: the pre-existing draft cannot be REVISED mid-close either. revise_entry
  // stays a draft-only verb (e.status<>'draft' never fires here — this draft still IS one) so it
  // reaches its own delete-then-reinsert of journal_lines, and THAT is what the lines wall bites
  // on — "whatever the parent's status" (a), not only the approved-class touch driven above.
  // Same bookkeeper principal (bob) the draft was raised by; same revision token, unrotated by
  // either refused attempt above.
  const revise = await caught(() => reviseEntry(world.users.bob, {
    entry: draftId,
    lines: [
      { account_code: EXPN, debit_cents: 22200, credit_cents: 0, description: "er9 rig: revised dr" },
      { account_code: BANK1, debit_cents: 0, credit_cents: 22200, description: "er9 rig: revised cr" },
    ],
    expectedRevision: d.revision_token,
    opKey: opk("er9-freeze-revise"),
  }));
  assert.ok(revise, "the pre-existing draft cannot be REVISED mid-close either");
  assert.equal(revise.code, "CLR19", `expected CLR19 (got ${revise.code} — ${revise.message})`);
  assert.match(revise.message, /its lines may not change/i, "and the LINES wall is what says so, exactly as for a fresh insert");
  assert.equal(detailOf(revise).reason, "write_into_closed_period");

  // (c) THE LAWFUL WAY BACK: abandon the close. The run is STAMPED, never deleted, and the
  // year normalizes to 'open' — editable again.
  const ab = await abandonClose(world.users.alice, {
    closeRun: begun.close_run_id, reason: "er9 rig: a blocker needs fixing, so the close stands down",
  });
  assert.equal(ab.state, "abandoned");
  assert.equal(await fyStatus(fx.fy), "open", "the year returns to 'open' — the ruled closing→open edge");
  const run = (await rootQuery("select * from clara.close_runs where id=$1", [begun.close_run_id])).rows[0];
  assert.equal(run.state, "abandoned");
  assert.equal(run.ended_by, world.users.alice);
  assert.match(run.end_reason, /a blocker needs fixing/, "the reason is on the permanent record");

  // And now the fix lands, and a FRESH run closes the year clean with no attestation at all.
  const approved = await approveEntry(world.users.alice, {
    entry: draftId, expectedRevision: d.revision_token, opKey: opk("er9-freeze-appr2"),
  });
  assert.ok(approved, "with the year open again the blocking draft approves normally");
  const begun2 = await beginClose(world.users.alice, { fy: fx.fy });
  assert.notEqual(begun2.close_run_id, begun.close_run_id, "a fresh run, not the abandoned one revived");
  assert.equal((await latestGates(begun2.close_run_id)).get("unapproved_drafts_in_period").state, "pass",
    "the drafts gate now PASSES on evidence — the blocker was fixed, not signed past");
  const closed = await finalizeClose(world.users.alice, { fy: fx.fy });
  assert.deepEqual((await receiptRow(closed.receipt_id)).snapshot.attestations, [],
    "and the receipt carries NO exception — the outcome to prefer whenever the fix is cheap");
});

test("R9.G2 an attestation that signed a state which has since MOVED refuses by name, hands back both digests, and re-attesting against the fresh measurement genuinely recovers", async (t) => {
  if (gate(t)) return;
  // THE DIGEST IS MOVED THROUGH AN AUDITED DOOR, not by editing the year. R9.G1b proves the
  // year's own entries are frozen the moment begin_close runs, so a gate whose evidence
  // lives OUTSIDE journal_entries is the honest way to reach this arm — and it is also the
  // realistic one: closing_stock_present reads the trade_nature client fact, and a fact
  // corrected mid-close is exactly the shape the staleness rule exists for.
  const client = await freshActiveClient(world.users.alice, "er9stale");
  for (const [code, name, type, opts] of [
    [AR1, "Trade Debtors (er9s)", "asset", { accountClass: "receivable" }],
    [AP1, "Trade Creditors (er9s)", "liability", { accountClass: "payable" }],
    [RE1, "Retained Earnings (er9s)", "equity", { special: "retained_earnings" }],
    [REVN, "Revenue (er9s)", "income", {}],
    [EXPN, "Expense (er9s)", "expense", {}],
    [BANK1, "Bank (er9s)", "asset", {}],
  ]) {
    await upsertAccountClassed(world.users.alice, { client, code, name, type, ...opts, opKey: opk("er9-coa") });
  }
  // F-A3/PR-1b drawer-2 arm 4 (TA-P14, ratified): this client's BANK1 is a plain asset leg,
  // never registered through add_bank_account -- zero clara.bank_accounts rows. Declared
  // truthfully through the governed door so this cell measures ITS OWN gate (closing_stock_present),
  // not the unrelated bank-registry wall.
  await recordClientFact(world.users.alice, {
    client, factKey: "banking_arrangement", factValue: "no_accounts",
    basis: "er9 rig: a genuinely bank-less client by fixture design", basisKind: "owner_instruction",
  });
  const proposal = await proposeFY(world.users.alice, { client, startsOn: FY_START });
  const opened = await openFY(world.users.alice, { client, label: "er9 stale FY1", startsOn: FY_START, endsOn: proposal.ends_on });
  await plainEntry(world.users.bob, {
    client, debit: EXPN, credit: BANK1, cents: 7000, postingDate: addDaysStr(FY_START, 50), memo: "er9 stale exp",
  });

  const begun = await beginClose(world.users.alice, { fy: opened.fiscal_year_id });
  const run = begun.close_run_id;
  const g0 = (await latestGates(run)).get("closing_stock_present");
  assert.equal(g0.state, "unknown", "mandatory setup: with no trade_nature fact the gate measures unknown");

  const att = await attestClose(world.users.alice, {
    closeRun: run, checkKey: "closing_stock_present",
    reason: "er9 rig: accepted as a services business against the state measured now",
  });
  assert.equal(att.item_key, "__gate__", "a scalar gate attests under __gate__");
  const signedDigest = att.measured_digest;

  // THE FACTS MOVE: the trade nature is corrected through the audited fact door.
  await recordClientFact(world.users.alice, {
    client, factKey: "trade_nature", factValue: "goods_trading",
    basis: "er9 rig: corrected mid-close — the client does trade goods after all",
    basisKind: "owner_instruction",
  });

  const err = await caught(() => finalizeClose(world.users.alice, { fy: opened.fiscal_year_id }));
  assert.ok(err, "a moved measurement must refuse the close");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} — ${err.message})`);
  const det = detailOf(err);
  assert.equal(det.reason, "close_attestation_stale",
    "the refusal is the STALENESS one — the attester signed a state that has since moved");
  assert.equal(det.check_key, "closing_stock_present");
  assert.equal(det.attested_digest, signedDigest, "and it names the digest that WAS signed");
  assert.notEqual(det.attested_digest, det.fresh_digest, "which differs from the fresh one, so the movement is auditable");

  // RECOVERY: re-attest against the fresh measurement. The stale row survives in history.
  const att2 = await attestClose(world.users.alice, {
    closeRun: run, checkKey: "closing_stock_present",
    reason: "er9 rig: re-attested against the fresh measurement — a goods trader with no closing-stock entry",
  });
  assert.equal(att2.superseded_id, att.attestation_id, "the fresh attestation names the one it superseded");
  assert.notEqual(att2.measured_digest, signedDigest, "and binds the digest that actually stands");

  const closed = await finalizeClose(world.users.alice, { fy: opened.fiscal_year_id });
  assert.ok(closed.receipt_id, "re-attesting against the fresh state genuinely recovers the close");
  const r = await receiptRow(closed.receipt_id);
  assert.equal(r.snapshot.attestations.length, 2, "BOTH attestations ride the permanent record");
  const live = r.snapshot.attestations.filter((a) => a.superseded === false);
  assert.equal(live.length, 1, "exactly one is live");
  assert.match(live[0].reason, /re-attested against the fresh measurement/, "and it is the fresh one");
  assert.ok(r.snapshot.attestations.some((a) => a.superseded === true),
    "while the SUPERSEDED one survives too — both sides of the recovery stay recoverable years later");
});

test("R9.G3 the closing-stock question for a SERVICES business, both directions: without the trade_nature fact the gate reads UNKNOWN and refuses attestably; recorded through the audited door it PASSES on its own evidence and no exception is written", async (t) => {
  if (gate(t)) return;
  const client = await freshActiveClient(world.users.alice, "er9nature");
  for (const [code, name, type, opts] of [
    [AR1, "Trade Debtors (er9)", "asset", { accountClass: "receivable" }],
    [AP1, "Trade Creditors (er9)", "liability", { accountClass: "payable" }],
    [RE1, "Retained Earnings (er9)", "equity", { special: "retained_earnings" }],
    [REVN, "Revenue (er9)", "income", {}],
    [EXPN, "Expense (er9)", "expense", {}],
    [BANK1, "Bank (er9)", "asset", {}],
  ]) {
    await upsertAccountClassed(world.users.alice, { client, code, name, type, ...opts, opKey: opk("er9-coa") });
  }
  // F-A3/PR-1b drawer-2 arm 4 (TA-P14, ratified): same declaration as R9.G2's identical
  // fixture shape -- a genuinely bank-less client, declared truthfully through the governed
  // door, so this cell measures ITS OWN gate (closing_stock_present / trade_nature), not the
  // unrelated bank-registry wall.
  await recordClientFact(world.users.alice, {
    client, factKey: "banking_arrangement", factValue: "no_accounts",
    basis: "er9 rig: a genuinely bank-less client by fixture design", basisKind: "owner_instruction",
  });
  const facts = (await rootQuery(
    `select count(*)::int as n from clara.client_facts
      where client_id=$1 and fact_key='trade_nature' and superseded_at is null`, [client])).rows[0].n;
  assert.equal(facts, 0, "mandatory setup: this client carries NO trade_nature fact — BEE's live shape today");

  const proposal = await proposeFY(world.users.alice, { client, startsOn: FY_START });
  const opened = await openFY(world.users.alice, { client, label: "er9 nature FY1", startsOn: FY_START, endsOn: proposal.ends_on });
  await plainEntry(world.users.bob, {
    client, debit: EXPN, credit: BANK1, cents: 5000, postingDate: addDaysStr(FY_START, 60), memo: "er9 nature exp",
  });
  const begun = await beginClose(world.users.alice, { fy: opened.fiscal_year_id });

  const g = (await latestGates(begun.close_run_id)).get("closing_stock_present");
  assert.equal(g.state, "unknown",
    "an ABSENT trade_nature makes the gate UNKNOWN — an unknown trade nature is not evidence of a service business");
  assert.equal(g.measured.reason, "trade_nature_fact_absent", "and it says exactly why");

  const err = await caught(() => finalizeClose(world.users.alice, { fy: opened.fiscal_year_id }));
  assert.ok(err, "an unknown drawer-2 state refuses exactly like a fail");
  assert.equal(err.code, "CLR41");
  const det = detailOf(err);
  assert.equal(det.reason, "drawer2_unattested");
  assert.equal(det.check_key, "closing_stock_present");
  assert.deepEqual(det.missing_items, ["__gate__"], "a scalar gate carries the single __gate__ item");

  // THE CLEAN FIX: record the fact through the audited door and the gate passes on its OWN
  // positive evidence. No attestation is needed, and none is written.
  await recordClientFact(world.users.alice, {
    client, factKey: "trade_nature", factValue: "services",
    basis: "er9 rig: a services business — recorded through the audited fact door before the close",
    basisKind: "owner_instruction",
  });
  const closed = await finalizeClose(world.users.alice, { fy: opened.fiscal_year_id });
  assert.ok(closed.receipt_id, "with the fact recorded, the close proceeds with no attestation at all");
  const r = await receiptRow(closed.receipt_id);
  assert.deepEqual(r.snapshot.attestations, [],
    "the receipt records NO exception — the gate passed on evidence, which is the outcome to prefer");
  const stored = r.snapshot.gates.find((x) => x.check_key === "closing_stock_present");
  assert.equal(stored.state, "pass", "the stored gate summary shows the pass");
  assert.equal((await verifyClose(world.users.alice, { receipt: closed.receipt_id })).verified, true);
});

// =====================================================================================
// PHASE H — ORDERING, THE ACTIVATION BOUNDARY, AND THE HUMAN-ONLY WALL.
// =====================================================================================

test("R9.H1 years close OLDEST-FIRST and reopen NEWEST-FIRST — both refuse by name — and a successor's opening ties to the prior receipt's PIN rather than being re-derived", async (t) => {
  if (gate(t)) return;
  const fx = await cleanCloseableFY(world.users.alice, {
    tag: "er9order", prepSub: world.users.bob, startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
  anchorFy = fx.fy;
  const p2 = await proposeFY(world.users.alice, { client: fx.client, startsOn: "2026-01-01" });
  assert.equal(p2.ends_on, "2026-12-31", "mandatory setup: the successor year is contiguous and full-length");
  const fy2 = await openFY(world.users.alice, {
    client: fx.client, label: "er9 order FY2", startsOn: "2026-01-01", endsOn: p2.ends_on,
  });
  const row2 = (await rootQuery("select ordinal, prior_fy_id from clara.fiscal_years where id=$1", [fy2.fiscal_year_id])).rows[0];
  assert.equal(row2.ordinal, 2);
  assert.equal(row2.prior_fy_id, fx.fy, "contiguity by construction: the successor names its predecessor");

  const err = await caught(() => beginClose(world.users.alice, { fy: fy2.fiscal_year_id }));
  assert.ok(err, "closing FY2 while FY1 is open must refuse");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} — ${err.message})`);
  assert.equal(detailOf(err).reason, "close_ordering_violation");

  await beginClose(world.users.alice, { fy: fx.fy });
  const c1 = await finalizeClose(world.users.alice, { fy: fx.fy });
  await beginClose(world.users.alice, { fy: fy2.fiscal_year_id });
  const c2 = await finalizeClose(world.users.alice, { fy: fy2.fiscal_year_id });

  const r2 = await receiptRow(c2.receipt_id);
  assert.equal(r2.prior_close_receipt_id, c1.receipt_id, "the successor receipt chains from the predecessor's");
  assert.equal(r2.snapshot.opening_tie.basis, "prior_receipt_pin",
    "and its opening is tied to the PRIOR RECEIPT'S PIN — never re-derived where a pin exists");
  assert.equal(r2.snapshot.opening_tie.prior_receipt_id, c1.receipt_id);
  assert.deepEqual(r2.snapshot.opening_tie.diffs, [], "with no divergence");
  assert.equal((await verifyClose(world.users.alice, { receipt: c1.receipt_id })).successor_tie,
    "consumed_by_successor_close", "and FY1's pin now reads as consumed by its successor");

  // HARD-ASSERTED, NEVER noteLane+skip: no CI leg runs er9-* against a pre-0085 chain (the
  // upgrade drills invoke single focused files, ci.yml:691,:762; er9-* is named nowhere in
  // ci.yml) — a false b3 reading here (a renumber, a broken version-regex, a partial apply)
  // would silently drop this reopen-ordering arm with the file staying green throughout. See
  // er9-reopen-recycle.test.mjs's before() for the matching hard assertion over that file's
  // whole 8-cell reopen half.
  assert.equal(b3, true,
    "B3 (0085/0086 ends_on reopen) must be present whenever 0056 is — a false reading is itself the bug, not a legitimate skip");
  await grantCapability(world.users.alice, {
    user: world.users.hana, capability: "reopen", reason: "er9 rig: key 3 for the ordering arm",
  });
  const reErr = await caught(() => reopenFY(world.users.hana, {
    fy: fx.fy, reason: "er9 rig: reopening FY1 while FY2 stands closed",
    correctionTarget: { entry_ids: [fx.revenueEntry] },
  }));
  assert.ok(reErr, "reopening an earlier year while a later one is closed must refuse");
  assert.equal(reErr.code, "CLR41", `expected CLR41 (got ${reErr.code} — ${reErr.message})`);
  assert.equal(detailOf(reErr).reason, "reopen_ordering_violation");
});

test("R9.H2 the model is LIVE-INERT until a human opens a year, and there is NO existence oracle: an absent fiscal year and a foreign firm's real one refuse identically, code and message", async (t) => {
  if (gate(t)) return;
  const client = await freshActiveClient(world.users.alice, "er9inert");
  assert.deepEqual(await listFiscalYears(world.users.alice, { client }), [],
    "a client with no fiscal year lists none — the close model does nothing at all until activation");

  const absent = await caught(() => getClosePlan(world.users.alice, randomUUID()));
  assert.ok(absent, "an absent fiscal year refuses");
  assert.equal(absent.code, "CLR11");
  assert.equal(detailOf(absent).reason, "fiscal_year_not_in_firm");

  assert.ok(anchorFy, "mandatory setup: R9.H1 left a real fiscal year to point the foreign read at");
  const foreign = await caught(() => getClosePlan(world.users.dave, anchorFy));
  assert.ok(foreign, "a foreign firm's real fiscal year refuses");
  assert.equal(foreign.code, absent.code, "same errcode as the absent case");
  assert.equal(foreign.message, absent.message,
    "and the SAME message — an absent id and a foreign one must be indistinguishable to the caller");
  assert.equal(detailOf(foreign).reason, "fiscal_year_not_in_firm");
});

test("R9.H3 the close verbs are HUMAN-ONLY: clara_authenticated can execute every one, and no agent, runtime, wake role or PUBLIC holds EXECUTE on any of them — the final close act cannot be performed by a machine", async (t) => {
  if (gate(t)) return;
  const fns = [
    "clara.propose_fiscal_year(uuid,date)",
    "clara.open_fiscal_year(uuid,text,date,date,text,text)",
    "clara.begin_close(uuid,text)",
    await attestCloseSig(),
    "clara.abandon_close(uuid,text,text)",
    "clara.finalize_close(uuid,text,text)",
    "clara.verify_close(uuid)",
    "clara.get_close_readiness(uuid,uuid)",
    "clara.list_fiscal_years(uuid)",
    "clara.get_close_plan(uuid)",
    "clara.grant_firm_capability(uuid,text,text,text)",
  ];
  if (b3) fns.push("clara.reopen_fiscal_year(uuid,text,jsonb,text,text)");

  // THE PROBE SET IS DERIVED FROM THE CATALOG, NEVER A HAND-MAINTAINED BLACKLIST — a role
  // invented later is covered by construction rather than by remembering to update this file.
  // 0022_extraction_slice_x1.sql:1550-1556 names the blacklist anti-pattern in prose (a direct
  // grant to a login role or "any role invented later" passes a four-name blacklist while a
  // stale notice still claims "clara_authenticated only"); this cell now follows the whitelist
  // shape it argues for. The two sanctioned EXECUTE holders on a close verb are clara_authenticated
  // (the human door) and clara_fn_owner (holds EXECUTE implicitly as the SECURITY DEFINER's
  // owner) — every OTHER clara_ role in pg_roles must hold none.
  const sanctioned = new Set(["clara_authenticated", "clara_fn_owner"]);
  const machineRoles = (await rootQuery(
    "select rolname from pg_roles where rolname ~ '^clara_' order by rolname",
  )).rows.map((r) => r.rolname).filter((r) => !sanctioned.has(r));
  // mandatory setup: today's estate (0002 six + 0006's two _login roles + 0009's
  // clara_wake_write_login) carries exactly seven non-sanctioned clara_ roles — the four the
  // old blacklist named PLUS clara_agent_read_login, clara_runtime_login, clara_wake_write_login,
  // which it silently missed. A role invented later only grows this set; it is never re-hardcoded
  // -- ROSTER EXTENSION (F-A3/PR-1b, DDL 7): clara_wake_bank + clara_wake_bank_login grow it to
  // nine. Both are already covered by this cell's OWN loop below (neither holds EXECUTE on any
  // close verb) -- this is a census update, not a weakening; no close verb's grantee set changed.
  assert.equal(machineRoles.length, 9,
    `mandatory setup: expected the nine known non-sanctioned clara_ roles (got ${machineRoles.length}: ${machineRoles.join(", ")})`);
  for (const expected of [
    "clara_agent_ro", "clara_agent_read_login", "clara_runtime", "clara_runtime_login",
    "clara_wake_interactive", "clara_wake_proactive", "clara_wake_write_login",
    "clara_wake_bank", "clara_wake_bank_login",
  ]) {
    assert.ok(machineRoles.includes(expected), `mandatory setup: the derived census includes ${expected}`);
  }

  for (const f of fns) {
    const exists = (await rootQuery("select to_regprocedure($1) is not null as ok", [f])).rows[0].ok;
    assert.equal(exists, true, `${f} exists at the pinned signature — a moved signature would make this cell vacuous`);
    const human = (await rootQuery("select has_function_privilege('clara_authenticated',$1,'execute') as p", [f])).rows[0].p;
    assert.equal(human, true, `clara_authenticated can execute ${f} — the human door is open`);
    for (const role of machineRoles) {
      const can = (await rootQuery("select has_function_privilege($1,$2,'execute') as p", [role, f])).rows[0].p;
      assert.equal(can, false, `${role} holds NO execute on ${f} — the close is a human act by construction`);
    }
    const pub = (await rootQuery("select has_function_privilege('public',$1,'execute') as p", [f])).rows[0].p;
    assert.equal(pub, false, `PUBLIC holds no execute on ${f}`);
  }

  // The capability floor itself: only a firm OWNER may hand out keys 2 and 3.
  const notOwner = await caught(() => grantCapability(world.users.bob, {
    user: world.users.carol, capability: "close_and_attest", reason: "er9 rig: a bookkeeper hands out a signing key",
  }));
  assert.ok(notOwner, "a non-owner may not grant a signing capability");
  assert.equal(notOwner.code, "CLR04", `expected CLR04 (got ${notOwner.code} — ${notOwner.message})`);
  assert.equal(detailOf(notOwner).capability, "owner");
});
