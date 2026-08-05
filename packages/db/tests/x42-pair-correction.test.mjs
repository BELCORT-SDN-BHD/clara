// 0042 Wave D-b — the PAIR-CORRECTION MACHINE (design §2.4): reverse_adjustment_pair,
// approve_pair_reversal, cancel_pair_reversal, and the four walls that make the receipt
// the ONLY authorization channel for a pair draft (`_wdb_reversal_blocked`, hook arm (1),
// `revise_entry` and `withdraw_draft`).
//
// Split out of `x42-pair.test.mjs` only because the repo enforces a 500-line file
// ceiling; `node --test tests/` discovers both automatically.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from the design + ABI only.
// Every refusal is asserted by its pinned ERRCODE + detail.reason (ABI §F); the two walls
// ABI §F leaves unnamed (the double-reverse pair walls) assert the SQLSTATE and record
// the observed reason as a lane note for the assembly lane to promote.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refuses, refusesCode, caught,
  T, CLR38, CLR39, CLR10, EXPA, ACCR, mon, mytToday,
  runManual, reversePair, approvePairReversal, cancelPairReversal, reverseEntry,
  reviseEntry, withdrawDraft, accrualLines,
  adjWorld, freshAdjClient, liveTemplate, approveDraft,
  entryRowOf, entryLinesOf, mirrorOf, pairRows, pairRow, eventsOfEntry,
  firmThresholdOf, stampedEntries, runRowsForTemplate,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-pair-correction");
  printSkipCount("x42-pair-correction");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b pair-correction battery");

const sumDebits = (lines) => lines.reduce((n, l) => n + Number(l.debit_cents), 0);

/** An auto_reverse template plus ONE approved occurrence — a born pair. `cents` decides
 *  whether the later correction is low-stakes (completes at once) or high-stakes (parks
 *  both corrections as drafts on a `pending` receipt). */
async function bornPair(label, { cents = 60_000, period = mon(-3), client = null } = {}) {
  client = client ?? (await freshAdjClient(label));
  const tpl = await liveTemplate({
    client, label, start: period.start, cents, autoReverse: true,
    lines: accrualLines(cents), memo: "Accrued rent" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r.status, "drafted", `${label}: the occurrence drafts before the single approving act`);
  await approveDraft(w.users.alice, r.entry_id);
  const mirror = await mirrorOf(r.entry_id);
  assert.ok(mirror, `${label}: the pair was born`);
  return { client, tpl, period, occurrence: r.entry_id, mirror, cents };
}

/** A HIGH-STAKES born pair with its correction already parked `pending`. */
async function pendingPair(label) {
  const client = await freshAdjClient(label);
  const cents = (await firmThresholdOf(client)) + 350_000;
  const p = await bornPair(label, { cents, client });
  const receipt = await reversePair(w.users.bob, {
    client: p.client, occurrence: p.occurrence, reason: `x42 ${label}: over-accrued` });
  assert.equal(receipt.status, "pending",
    `${label}: a high-stakes pair correction parks both corrections as DRAFTS on a pending receipt`);
  return { ...p, receipt };
}

// ===========================================================================
// x42.c — reverse / approve / cancel.
// ===========================================================================

test("x42.c1 low-stakes reverse_adjustment_pair is ONE transaction: the receipt completes, both correction mirrors are approved with origin='reversal' and MYT act dates, and both halves' reversed_by is stamped", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("c1", { cents: 58_400 });
  const before = await pairRows(p.client);
  assert.equal(before.length, 0, "no pair-reversal receipt exists yet");

  const rec = await reversePair(w.users.bob, {
    client: p.client, occurrence: p.occurrence, reason: "x42 c1: accrual raised twice" });
  assert.ok(rec.pair_id, `the envelope names pair_id (got ${JSON.stringify(rec)})`);
  assert.equal(rec.status, "completed", "…and completes in the same transaction (low stakes)");
  assert.ok(rec.occurrence_correction_id, "…naming the occurrence's correction");
  assert.ok(rec.mirror_correction_id, "…and the mirror's");

  const row = await pairRow(rec.pair_id);
  assert.equal(row.status, "completed", "the receipt row records the completed status");
  assert.ok(row.completed_at, "…with completed_at stamped on the approving→completed edge (the ramp clock)");
  assert.equal(row.template_id, p.tpl.id, "…template_id stamped at INSERT (the ramp clock's filter)");
  assert.equal(row.occurrence_id, p.occurrence, "…occurrence_id");
  assert.equal(row.mirror_id, p.mirror.id, "…mirror_id");
  assert.equal(row.occurrence_correction_id, rec.occurrence_correction_id, "…and both correction ids");
  assert.equal(row.mirror_correction_id, rec.mirror_correction_id, "…recorded on the receipt itself");
  assert.equal(row.maker, w.users.bob, "…with the caller as maker");

  // [RECUT, as-built ladder round 5 — the CORRECT-AND-RE-RUN DOUBLE.] This cell used to
  // assert both corrections carried the MYT ACT date. That assertion was faithful to the law
  // as written and the law was wrong: MEASURED on a rig, an annual accrual of RM50,000
  // corrected and re-run left the FY expense at RM100,000.00 and the FY accrual liability at
  // RM100,000.00, permanently, because a correction dated outside the period never clears the
  // period the re-run then re-fills. The ruling dates each correction from THE HALF IT
  // REVERSES (the pair's two entries sit on two different dates by construction, so one act
  // date could never have cleared both months). The MYT clock is NOT gone — it is the DEFAULT
  // clara._wdb_correction_posting_date returns for every entry carrying none of the registered
  // period stamps, which x42.cd5 measures on an ordinary entry. (Round 6 renamed that body from
  // _adj_ to _wdb_ and re-keyed it on the stamp REGISTRY, because the depreciation lane carried
  // the identical shape under a different flag key and was outside the round-5 fix entirely —
  // x42.pc1 is that lane's money cell.)
  for (const [label, correctionId, halfId] of [
    ["the occurrence correction", rec.occurrence_correction_id, p.occurrence],
    ["the mirror correction", rec.mirror_correction_id, p.mirror.id],
  ]) {
    const c = await entryRowOf(correctionId);
    const half = await entryRowOf(halfId);
    assert.equal(c.status, "approved", `${label} is approved in the same transaction`);
    assert.equal(c.origin, "reversal", `${label} carries origin='reversal' (the §8 census)`);
    assert.equal(c.maker_actor, w.users.bob, `${label}'s maker is the CALLER, not the template signer`);
    assert.equal(c.last_human_editor, w.users.bob, `…and so is its last_human_editor`);
    assert.equal(String(c.posting_date), String(half.posting_date),
      `${label} is dated ON THE HALF IT REVERSES, so the half's own period clears — never on the act date, which would leave the period standing and let the re-run double it`);
    assert.notEqual(String(c.posting_date).slice(0, 10), mytToday(),
      `${label}: and this fixture's periods are historic, so the act date is provably NOT what was written`);
    assert.equal(c.reversal_of, halfId, `${label} points at its half through reversal_of`);
    assert.equal(sumDebits(await entryLinesOf(correctionId)), p.cents,
      `${label} carries the half's amount to the sen (CLR05 symmetry)`);
    assert.equal((await entryRowOf(halfId)).reversed_by, correctionId,
      `…and the half's reversed_by names it`);
  }
  assert.equal((await runRowsForTemplate(p.tpl.id)).length, 1,
    "the correction mints NO second adjustment_runs receipt");
});

test("x42.c2 high-stakes: both corrections park as DRAFTS on a `pending` receipt, approving EITHER half alone refuses pair_draft_locked, and approve_pair_reversal approves BOTH atomically", async (t) => {
  if (skipHere(t)) return;
  const p = await pendingPair("c2");
  const row = await pairRow(p.receipt.pair_id);
  assert.equal(row.status, "pending", "the receipt is PENDING");
  assert.equal(row.completed_at, null, "…with completed_at NULL (the clock is untouched)");

  for (const [label, id] of [
    ["the occurrence correction", p.receipt.occurrence_correction_id],
    ["the mirror correction", p.receipt.mirror_correction_id],
  ]) {
    assert.equal((await entryRowOf(id)).status, "draft", `${label} is parked as a DRAFT`);
    // Hook arm (1): the RECEIPT is the authorization channel — a lone approve_entry on a
    // pair-correction draft is refused while the receipt is not `approving`.
    await refuses(() => approveDraft(w.users.alice, id), T.pairDraftLocked,
      `approving ${label} on its own`, { code: CLR39 });
    assert.equal((await entryRowOf(id)).status, "draft", `…and ${label} is still a draft`);
  }
  assert.equal((await pairRow(p.receipt.pair_id)).status, "pending", "the receipt never moved");

  // The ONE distinct checker approves the pair. bob made the corrections, so alice is the
  // distinct checker; the verb re-derives both corrections byte-exactly, CLR05s each and
  // completes the receipt in one transaction.
  const done = await approvePairReversal(w.users.alice, { client: p.client, pair: p.receipt.pair_id });
  assert.equal(done.status, "completed", "approve_pair_reversal completes the receipt");
  assert.equal(done.pair_id, p.receipt.pair_id, "…naming the same pair");
  const after = await pairRow(p.receipt.pair_id);
  assert.equal(after.status, "completed", "…the receipt row agrees");
  assert.ok(after.completed_at, "…and completed_at is finally stamped (the ramp clock's timestamp)");
  for (const [label, id, halfId] of [
    ["the occurrence correction", p.receipt.occurrence_correction_id, p.occurrence],
    ["the mirror correction", p.receipt.mirror_correction_id, p.mirror.id],
  ]) {
    assert.equal((await entryRowOf(id)).status, "approved", `${label} is approved`);
    assert.equal((await entryRowOf(halfId)).reversed_by, id, `…and its half's reversed_by is stamped`);
    assert.equal(sumDebits(await entryLinesOf(id)), p.cents, `…byte-exactly against its half (CLR05)`);
  }
});

test("x42.c3 cancel_pair_reversal: a blank reason is refused, the two drafts are WITHDRAWN with their events, the receipt goes cancelled, and a second pair on the same occurrence is then allowed", async (t) => {
  if (skipHere(t)) return;
  const p = await pendingPair("c3");
  const ids = [p.receipt.occurrence_correction_id, p.receipt.mirror_correction_id];

  await refusesCode(() => cancelPairReversal(w.users.bob, {
    client: p.client, pair: p.receipt.pair_id, reason: "   " }), [CLR10, "CLR22"],
  "cancelling a pair with a BLANK reason");
  assert.equal((await pairRow(p.receipt.pair_id)).status, "pending", "…and the receipt stayed pending");

  const cancelled = await cancelPairReversal(w.users.bob, {
    client: p.client, pair: p.receipt.pair_id, reason: "x42 c3: raised against the wrong template" });
  assert.equal(cancelled.status, "cancelled", "the cancel envelope reports 'cancelled'");
  const row = await pairRow(p.receipt.pair_id);
  assert.equal(row.status, "cancelled", "…the receipt row agrees");
  assert.equal(row.completed_at, null, "…and completed_at stays NULL (a cancelled pair never resets the clock)");

  for (const id of ids) {
    const e = await entryRowOf(id);
    assert.equal(e.status, "withdrawn", "each correction draft is withdrawn");
    assert.ok(e.withdrawal_reason && e.withdrawal_reason.trim() !== "", "…with a non-blank withdrawal reason");
    const ev = (await eventsOfEntry(id)).filter((x) => x.event_type === "entry.withdrawn");
    assert.equal(ev.length, 1, "…and exactly one entry.withdrawn event, exactly as the verb would emit it");
  }
  for (const halfId of [p.occurrence, p.mirror.id]) {
    assert.equal((await entryRowOf(halfId)).reversed_by, null,
      "neither half was left with a reversed_by pointing at a withdrawn correction");
  }

  // The partial unique covers pending+approving ONLY, so the occurrence is correctable again.
  const second = await reversePair(w.users.bob, {
    client: p.client, occurrence: p.occurrence, reason: "x42 c3: second attempt, correctly aimed" });
  assert.ok(second.pair_id, "a SECOND pair on the same occurrence is admitted once the first is cancelled");
  assert.notEqual(second.pair_id, p.receipt.pair_id, "…as a distinct receipt");
  assert.equal((await pairRows(p.client)).length, 2, "…and both receipts survive (no-delete)");
});

test("x42.c4 the double-reverse walls: a second pair while one is ACTIVE refuses, and so does reversing a half that is already reversed", async (t) => {
  if (skipHere(t)) return;
  const active = await pendingPair("c4a");
  await refusesCode(() => reversePair(w.users.bob, {
    client: active.client, occurrence: active.occurrence, reason: "x42 c4: second while pending" }),
  [CLR10, CLR39, CLR38], "a SECOND reverse_adjustment_pair while one is pending");
  assert.equal((await pairRows(active.client)).length, 1, "…and no second receipt was written");

  // …and once a pair has COMPLETED, the halves are reversed and cannot be reversed again.
  const done = await bornPair("c4b", { cents: 41_000 });
  await reversePair(w.users.bob, {
    client: done.client, occurrence: done.occurrence, reason: "x42 c4: first, completes" });
  await refusesCode(() => reversePair(w.users.bob, {
    client: done.client, occurrence: done.occurrence, reason: "x42 c4: again" }),
  [CLR10, CLR39, CLR38], "reversing an occurrence whose pair has already completed");
  assert.equal((await pairRows(done.client)).length, 1, "…and still exactly one receipt");
});

test("x42.c5 reverse_adjustment_pair on a SOLO occurrence refuses not_an_auto_pair — plain reverse_entry is its path", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("c5");
  const period = mon(-3);
  const tpl = await liveTemplate({ client, label: "c5", start: period.start, cents: 36_000 });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, r.entry_id);
  assert.equal(await mirrorOf(r.entry_id), null, "the solo occurrence has no mirror");

  await refuses(() => reversePair(w.users.bob, {
    client, occurrence: r.entry_id, reason: "x42 c5: wrong path" }), T.notAnAutoPair,
  "reverse_adjustment_pair on a non-auto_reverse occurrence", { code: CLR10 });
  assert.equal((await pairRows(client)).length, 0, "…and no pair receipt was written");

  // The sanctioned path DOES work on a solo occurrence.
  const rec = await reverseEntry(w.users.bob, {
    entry: r.entry_id, reason: "x42 c5: the right path", opKey: opk("x42c5rev") });
  assert.ok(rec, "plain reverse_entry is the solo occurrence's correction path (design §2.4)");
});

test("x42.c6 reverse_entry on EITHER half of a pair refuses adjustment_pair_locked — the 7th splice of _wdb_reversal_blocked", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("c6", { cents: 44_500 });
  for (const [label, id] of [["the OCCURRENCE half", p.occurrence], ["the MIRROR half", p.mirror.id]]) {
    await refuses(() => reverseEntry(w.users.bob, {
      entry: id, reason: `x42 c6: ${label}`, opKey: opk("x42c6rev") }), T.adjustmentPairLocked,
    `plain reverse_entry on ${label}`, { code: CLR39 });
    assert.equal((await entryRowOf(id)).reversed_by, null, `…and ${label} is untouched`);
  }
  assert.equal((await stampedEntries(p.tpl.id)).length, 2,
    "…so the template still carries exactly the two halves and no stray mirror");
});

test("x42.c7 revise_entry refuses both D-b shapes: any draft carrying a recurring_adjustment stamp (proposal_not_revisable) and any pair-correction draft named by a live receipt (pair_draft_locked)", async (t) => {
  if (skipHere(t)) return;
  // (a) an OCCURRENCE draft — the flags-key refusal.
  const client = await freshAdjClient("c7");
  const period = mon(-3);
  const tpl = await liveTemplate({
    client, label: "c7", start: period.start, cents: 47_000, autoReverse: true });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  const draft = await entryRowOf(r.entry_id);
  const newLines = accrualLines(47_001);
  await refuses(() => reviseEntry(w.users.bob, {
    entry: r.entry_id, lines: newLines, expectedRevision: draft.revision_token, opKey: opk("x42c7a") }),
  T.proposalNotRevisable, "revise_entry on a draft carrying the recurring_adjustment flags key",
  { code: CLR10 });
  assert.equal(sumDebits(await entryLinesOf(r.entry_id)), 47_000, "…and the draft's lines never moved");

  // (b) a PAIR-CORRECTION draft — the receipt-membership refusal.
  const p = await pendingPair("c7b");
  const corr = await entryRowOf(p.receipt.occurrence_correction_id);
  await refuses(() => reviseEntry(w.users.bob, {
    entry: p.receipt.occurrence_correction_id, lines: accrualLines(p.cents, { debit: EXPA, credit: ACCR }),
    expectedRevision: corr.revision_token, opKey: opk("x42c7b") }),
  T.pairDraftLocked, "revise_entry on a draft named by a pending pair receipt", { code: CLR39 });
  assert.equal((await entryRowOf(p.receipt.occurrence_correction_id)).status, "draft",
    "…and the correction draft is untouched");
});

test("x42.c8 withdraw_draft on a pair draft refuses pair_draft_locked and the refusal NAMES cancel_pair_reversal as the remedy", async (t) => {
  if (skipHere(t)) return;
  const p = await pendingPair("c8");
  const id = p.receipt.mirror_correction_id;
  const e = await entryRowOf(id);
  const err = await refuses(() => withdrawDraft(w.users.bob, {
    entry: id, reason: "x42 c8: withdraw the half alone", expectedRevision: e.revision_token,
    opKey: opk("x42c8wd") }), T.pairDraftLocked, "withdraw_draft on a pair-correction draft",
  { code: CLR39 });
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  assert.ok(/cancel_pair_reversal/.test(blob),
    `the refusal names cancel_pair_reversal as the remedy (got: ${blob})`);
  assert.equal((await entryRowOf(id)).status, "draft", "…and the draft survives");

  // The named remedy really is the door.
  const cancelled = await cancelPairReversal(w.users.bob, {
    client: p.client, pair: p.receipt.pair_id, reason: "x42 c8: taking the named remedy" });
  assert.equal(cancelled.status, "cancelled", "cancel_pair_reversal is the sanctioned exit");
  assert.equal((await entryRowOf(id)).status, "withdrawn", "…and it withdraws the draft the verb refused to");
  noteLane("x42.c8: the withdraw refusal's remedy text was found and exercised");
});

test("x42.c9 the receipt is the authorization channel end to end: nothing about a pair changes while its receipt sits pending, and a cancelled receipt leaves no half reversed", async (t) => {
  if (skipHere(t)) return;
  const p = await pendingPair("c9");
  // A pending receipt authorizes NOTHING: neither half is reversed, no run receipt moved,
  // and the corrections carry the caller's identity rather than the signer's.
  for (const halfId of [p.occurrence, p.mirror.id]) {
    const h = await entryRowOf(halfId);
    assert.equal(h.reversed_by, null, "no half is reversed while the receipt is pending");
    assert.equal(h.status, "approved", "…and both halves remain approved");
  }
  assert.equal((await runRowsForTemplate(p.tpl.id)).length, 1, "the occurrence's run receipt is untouched");
  const corr = await entryRowOf(p.receipt.occurrence_correction_id);
  assert.equal(corr.maker_actor, w.users.bob, "the correction's maker is the CALLER (design §2.4)");
  // [RECUT, as-built ladder round 5 — see x42.c1.] The PARKED correction is dated from the
  // half it reverses too, and that matters more here than on the low-stakes path: a parked
  // pair crosses a maker-checker gap as a pair of DRAFTS, and clara.approve_pair_reversal
  // re-derives this very date before it flips the receipt.
  assert.equal(String(corr.posting_date), String((await entryRowOf(p.occurrence)).posting_date),
    "…dated on the OCCURRENCE it reverses, so approving the park clears the occurrence's own period");

  await cancelPairReversal(w.users.bob, {
    client: p.client, pair: p.receipt.pair_id, reason: "x42 c9: stand down" });
  for (const halfId of [p.occurrence, p.mirror.id]) {
    assert.equal((await entryRowOf(halfId)).reversed_by, null,
      "a cancelled receipt leaves BOTH halves un-reversed");
  }
  assert.equal((await caught(() => approvePairReversal(w.users.alice, {
    client: p.client, pair: p.receipt.pair_id }))) !== null, true,
  "…and a cancelled receipt can never be approved afterwards");
});
