// 0042 Wave D-b — the AUTO-REVERSAL PAIR (WDB-G1/G2, design §2.4/§2.5) and the UNIFIED
// RAMP CLOCK's reset law (§2.3). The pair-CORRECTION machine (reverse/approve/cancel and
// its walls) lives in the sibling `x42-pair-correction.test.mjs`; the split is only the
// repo's 500-line file ceiling.
//
// The claim under test is narrow and strong: ONE approval of an auto_reverse occurrence
// births the APPROVED mirror in the same act — dated next-period day 1, lines swapped,
// linked by `auto_reversal_of` (never by reversal_of/reversed_by), with the mirror's
// events preceding the occurrence's and the receipt minted after both.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from the design + ABI only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, CLR,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, EXPB, ACCR, ACCR2, mon, addDays, occurrenceMemo, mirrorMemo,
  runManual, reversePair, reverseEntry, cancelPairReversal, accrualLines,
  adjWorld, freshAdjClient, soloAdjClient, freshAdjFirm, liveTemplate, approveDraft,
  withdrawAs, setFirmThreshold, firmThresholdOf,
  entryRowOf, entryLinesOf, mirrorOf, receiptForEntry, runRowsForTemplate, stampedEntries,
  eventsOfEntry, eventsOfClient, eventCount, rampClock, pairRows, indexDefs,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-pair");
  printSkipCount("x42-pair");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b auto-reversal pair battery");

const sumDebits = (lines) => lines.reduce((n, l) => n + Number(l.debit_cents), 0);
const minSeq = (events) => Math.min(...events.map((e) => Number(e.seq)));
const maxSeq = (events) => Math.max(...events.map((e) => Number(e.seq)));

/** An auto_reverse template plus ONE approved occurrence — i.e. a born pair. */
async function bornPair(label, { period = mon(-3), cents = 60_000, memo = "Accrued rent", ...over } = {}) {
  const client = await freshAdjClient(label);
  const tpl = await liveTemplate({
    client, label, start: period.start, cents, memo, autoReverse: true, ...over });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r.status, "drafted", `${label}: the occurrence drafts before the single approving act`);
  await approveDraft(w.users.alice, r.entry_id);
  const mirror = await mirrorOf(r.entry_id);
  assert.ok(mirror, `${label}: ONE approval births the mirror (WDB-G2)`);
  return { client, tpl, period, occurrence: r.entry_id, mirror, memo, cents };
}

// ===========================================================================
// x42.r — THE PAIR ITSELF.
// ===========================================================================

test("x42.r1 [WDB-G1/G2] ONE approval births the APPROVED pair: mirror dated period_end+1, lines swapped, memo prefixed, auto_reversal_of set and UNIQUE, reversal_of/reversed_by unused, headers copied verbatim, CLR05 symmetry", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("r1");
  const occ = await entryRowOf(p.occurrence);
  const mir = p.mirror;

  assert.equal(occ.status, "approved", "the occurrence is approved");
  assert.equal(mir.status, "approved", "…and the mirror is APPROVED in the same act, never left a draft");
  assert.equal(mir.posting_date, addDays(p.period.end, 1),
    "the mirror is dated next-period day 1 (WDB-G1) — period_end + 1 day");
  assert.equal(mir.origin, "scheduled_run", "the mirror is a scheduled_run writer (the §8 census)");
  assert.equal(mir.memo, mirrorMemo(occurrenceMemo(p.memo, "monthly", p.period.end)),
    "the mirror memo prefixes 'Auto-reversal: ' onto the occurrence memo");

  // LINKAGE: `auto_reversal_of` only, one direction, and UNIQUE.
  assert.equal(mir.auto_reversal_of, p.occurrence, "the mirror carries auto_reversal_of → the occurrence");
  assert.equal(occ.auto_reversal_of, null, "…and there is NO occurrence-side column");
  assert.equal(mir.reversal_of, null, "reversal_of is UNUSED on the mirror (ramp starvation + the correction dead-end)");
  assert.equal(occ.reversed_by, null, "…and reversed_by is UNUSED on the occurrence");
  assert.equal(mir.reversed_by, null, "…and on the mirror");
  const uq = (await indexDefs("journal_entries"))
    .filter((d) => /unique/i.test(d) && /auto_reversal_of/.test(d));
  assert.ok(uq.length >= 1, `auto_reversal_of carries a UNIQUE index (design §2.4) — got: ${uq.join(" | ") || "none"}`);

  // HEADERS copied verbatim, so is_high_stakes is provably equal on both halves.
  for (const [k, v] of [["is_opening_balance", false], ["is_year_end", false], ["tax_affecting", false]]) {
    assert.equal(occ[k], v, `the occurrence is born ${k}=${v}`);
    assert.equal(mir[k], occ[k], `…and the mirror copies ${k} VERBATIM`);
  }

  // LINES swapped, amounts equal to the sen — the CLR05 symmetry assertion.
  const ol = await entryLinesOf(p.occurrence);
  const ml = await entryLinesOf(mir.id);
  assert.equal(ml.length, ol.length, "the mirror carries the same number of legs");
  assert.equal(sumDebits(ml), sumDebits(ol),
    "CLR05 symmetry: occurrence and mirror amounts are equal to the sen");
  const side = (rows, code) => {
    const r = rows.find((x) => x.account_code === code);
    return { dr: Number(r.debit_cents), cr: Number(r.credit_cents) };
  };
  assert.deepEqual(side(ol, EXPA), { dr: p.cents, cr: 0 }, "the occurrence debits the expense");
  assert.deepEqual(side(ml, EXPA), { dr: 0, cr: p.cents }, "…and the mirror CREDITS it (swapped)");
  assert.deepEqual(side(ol, ACCR), { dr: 0, cr: p.cents }, "the occurrence credits the accrual");
  assert.deepEqual(side(ml, ACCR), { dr: p.cents, cr: 0 }, "…and the mirror DEBITS it");

  // The flags stamp: role='reversal', everything else the occurrence's.
  const os = occ.flags.recurring_adjustment;
  const ms = mir.flags.recurring_adjustment;
  assert.equal(ms.role, "reversal", "the mirror's stamp carries role='reversal' (ABI §B)");
  assert.equal(os.role, "occurrence", "…against the occurrence's role='occurrence'");
  assert.equal(ms.template_id, os.template_id, "…same template");
  assert.equal(ms.period_start, os.period_start, "…same period_start");
  assert.equal(ms.period_end, os.period_end, "…same period_end");
  assert.equal(ms.auto_reverse, true, "…auto_reverse true on both halves");
  assert.equal(ms.reversal_date, addDays(p.period.end, 1), "…and reversal_date = the mirror's own posting_date");

  // ACTORS: the mirror is made by the signer's identity and checked by whoever approved
  // the occurrence (design §2.4).
  assert.equal(mir.maker_actor, p.tpl.signedBy, "the mirror's maker is the template signer");
  assert.equal(mir.last_human_editor, p.tpl.signedBy, "…and so is its last_human_editor");
  assert.equal(mir.checker_actor, w.users.alice, "…while its checker is the occurrence's approving actor");
});

test("x42.r2 event order + receipt: the mirror's events PRECEDE the occurrence's approval, adjustment.posted fires ONCE per occurrence with the ABI §G payload, and the receipt is minted after both", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("r2", { cents: 71_500 });

  const mirEvents = await eventsOfEntry(p.mirror.id);
  const occEvents = await eventsOfEntry(p.occurrence);
  assert.ok(mirEvents.length >= 1, "the mirror emitted its own events");
  const occApproved = occEvents.filter((e) => e.event_type === "entry.approved");
  assert.equal(occApproved.length, 1, "the occurrence emitted exactly one entry.approved");
  assert.ok(maxSeq(mirEvents) < Number(occApproved[0].seq),
    `the mirror's events PRECEDE the occurrence's approval (mirror max seq ${maxSeq(mirEvents)} < occurrence approved seq ${occApproved[0].seq})`);
  // ADJUDICATED AT ASSEMBLY. This cell originally also asserted
  // `minSeq(mirEvents) > minSeq(occEvents)` — "the mirror's events follow the occurrence's
  // own DRAFTING, so the order is drafted → mirror → approved". Measured against the build,
  // NEITHER half ever emits `entry.drafted`: both are born by the SS9.5 DIRECT INSERT (the
  // poster mints the occurrence, `_adj_on_approve` mints the mirror), and a direct-INSERT
  // draft does not travel through `draft_entry`, which is the only emitter of that event.
  // So no drafting event exists to order anything against, and the original pair of
  // assertions was jointly unsatisfiable: it required some occurrence event BEFORE the
  // mirror's and the occurrence's approval AFTER it.
  //
  // The design's actual law (§2.4) is the simple one — "the mirror's events precede the
  // occurrence's" — so that is what is pinned here, in its strong form (every mirror event
  // precedes every occurrence event), plus the SS9.5 fact that makes it so.
  assert.ok(maxSeq(mirEvents) < minSeq(occEvents),
    `every mirror event precedes every occurrence event (design §2.4: the mirror's events ` +
    `precede the occurrence's) — mirror max seq ${maxSeq(mirEvents)} < occurrence min seq ${minSeq(occEvents)}`);
  assert.equal(
    [...mirEvents, ...occEvents].filter((e) => e.event_type === "entry.drafted").length, 0,
    "neither half emits entry.drafted — both are SS9.5 direct-INSERT drafts, which never " +
    "travel through draft_entry (this is WHY the mirror can precede the occurrence at all)");

  // adjustment.posted — ONE per occurrence, ABI §G payload, never one for the mirror.
  const posted = await eventsOfClient(p.client, "adjustment.posted");
  assert.equal(posted.length, 1, "exactly ONE adjustment.posted event per occurrence (design §2.5)");
  const ev = posted[0];
  assert.equal(ev.entry_id, p.occurrence, "…carried on the OCCURRENCE, not the mirror");
  const receipt = await receiptForEntry(p.occurrence);
  assert.ok(receipt, "the adjustment_runs receipt exists");
  assert.deepEqual(Object.keys(ev.payload).sort(), [
    "amount_cents", "period_end", "period_start", "reversal_entry_id", "run_id", "template_id",
  ], `the payload is EXACTLY the ABI §G allowlist (got ${Object.keys(ev.payload).sort().join(",")})`);
  assert.equal(ev.payload.template_id, p.tpl.id, "…template_id");
  assert.equal(ev.payload.run_id, receipt.id, "…run_id names the receipt");
  assert.equal(ev.payload.period_start, p.period.start, "…period_start (a DATE, not a label)");
  assert.equal(ev.payload.period_end, p.period.end, "…period_end");
  assert.equal(Number(ev.payload.amount_cents), p.cents, "…amount_cents");
  assert.equal(ev.payload.reversal_entry_id, p.mirror.id, "…and reversal_entry_id names the mirror");
  assert.ok(Number(ev.seq) > maxSeq(mirEvents),
    "the receipt's event is emitted AFTER the mirror's — the receipt is minted last (design §2.4)");

  // The receipt itself (ABI §D 2).
  assert.equal(receipt.template_id, p.tpl.id, "the receipt names the template");
  assert.equal(receipt.period_start, p.period.start, "…the period_start");
  assert.equal(receipt.period_end, p.period.end, "…the period_end");
  assert.equal(receipt.entry_id, p.occurrence, "…the occurrence entry (UNIQUE)");
  assert.equal(receipt.reversal_entry_id, p.mirror.id, "…and the mirror");
  assert.equal(Number(receipt.amount_cents), p.cents, "…with the occurrence amount");
  assert.equal(receipt.mode, (await entryRowOf(p.occurrence)).flags.recurring_adjustment.mode,
    "…and mode READ FROM THE FLAGS STAMP, never re-derived");
});

test("x42.r3 the signer-approves-own HIGH-STAKES cell: in a solo firm the signer's own approval takes the attestation branch and the mirror inherits both the approving actor and the attestation", async (t) => {
  if (skipHere(t)) return;
  const { client, sub } = await soloAdjClient("r3");
  const threshold = await firmThresholdOf(client);
  const cents = threshold + 300_000;
  const period = mon(-3);
  const tpl = await liveTemplate({
    client, label: "r3", start: period.start, cents, autoReverse: true, memo: "Accrued bonus",
    lines: accrualLines(cents), proposer: sub, signer: sub });
  const r = await runManual(sub, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r.status, "drafted", "a high-stakes occurrence always drafts (WCA-R7)");

  // Without an attestation the SOLO self-approval is refused by name.
  const bare = await caught(() => approveDraft(sub, r.entry_id));
  assert.equal(bare?.code, CLR.makerChecker, "the signer's bare self-approval is refused CLR05");
  assert.equal(reasonToken(bare), "self_attestation",
    `…on the SELF-ATTESTATION arm (a solo firm has one eligible checker) — got '${reasonToken(bare)}'`);

  const attestation = "x42 r3: sole practitioner reviewed the signed template and this month's charge";
  await approveDraft(sub, r.entry_id, { attestation });
  const occ = await entryRowOf(r.entry_id);
  assert.equal(occ.self_approval_attestation, attestation, "the occurrence records the attestation");
  const mir = await mirrorOf(r.entry_id);
  assert.ok(mir, "…and the pair is still born in the same act");
  assert.equal(mir.status, "approved", "…approved");
  assert.equal(mir.checker_actor, sub, "the mirror inherits the APPROVING actor");
  assert.equal(mir.self_approval_attestation, attestation,
    "…and the occurrence's just-stamped attestation, re-read after the outer UPDATE (design §2.4)");
});

test("x42.r4 arm (0) in force: approving the mirror mints NO second receipt and NO second event, and the mirror never counts toward the ramp", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("r4", { cents: 48_000 });

  assert.equal((await runRowsForTemplate(p.tpl.id)).length, 1,
    "ONE receipt for the pair — the mirror's approval mints no second adjustment_runs row (arm 0)");
  assert.equal(await receiptForEntry(p.mirror.id), null, "…and no receipt names the mirror as its entry");
  assert.equal(await eventCount(p.client, "adjustment.posted"), 1,
    "…and exactly one adjustment.posted event exists for the client");
  assert.equal(await mirrorOf(p.mirror.id), null, "…and the mirror births no mirror of its own (recursion bounds at depth 2)");

  // The ramp counts APPROVED, UN-REVERSED role='occurrence' entries only. Both halves are
  // approved right now, so the earned flag must come from the occurrence alone.
  const clock = await rampClock(p.tpl.id);
  assert.equal(clock.earned, true, "the approved occurrence earns autonomy");
  const reversals = await stampedEntries(p.tpl.id, "reversal");
  assert.equal(reversals.length, 1, "…with exactly one approved role='reversal' entry beside it");

  // Now remove the OCCURRENCE from the eligible set through the sanctioned door. The
  // mirror stays an approved entry of this template — if the ramp counted role='reversal'
  // rows (or ignored reversed_by), autonomy would survive. It must not.
  await reversePair(w.users.bob, { client: p.client, occurrence: p.occurrence, reason: "x42 r4 correction" });
  const occ = await entryRowOf(p.occurrence);
  assert.ok(occ.reversed_by, "the pair correction stamps the occurrence's reversed_by");
  const after = await rampClock(p.tpl.id);
  assert.equal(after.earned, false,
    "the mirror NEVER earns: with the only occurrence reversed, the template has no autonomy left");
  assert.ok((await stampedEntries(p.tpl.id, "reversal")).length >= 1,
    "…even though approved role='reversal' entries for the template still exist");
});

test("x42.r5 a NON-auto_reverse occurrence has no pair at all: no mirror is born and the receipt's reversal_entry_id is NULL", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r5");
  const period = mon(-3);
  const tpl = await liveTemplate({ client, label: "r5", start: period.start, cents: 39_000 });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, r.entry_id);

  assert.equal(await mirrorOf(r.entry_id), null, "a solo occurrence births NO mirror");
  assert.equal((await stampedEntries(tpl.id, "reversal")).length, 0, "…and no role='reversal' entry exists");
  const receipt = await receiptForEntry(r.entry_id);
  assert.ok(receipt, "the receipt is still minted");
  assert.equal(receipt.reversal_entry_id, null, "…with reversal_entry_id NULL");
  const posted = await eventsOfClient(client, "adjustment.posted");
  assert.equal(posted.length, 1, "…and one adjustment.posted event");
  assert.equal(posted[0].payload.reversal_entry_id, null, "…whose payload carries a null reversal_entry_id");
  assert.equal((await entryRowOf(r.entry_id)).flags.recurring_adjustment.auto_reverse, false,
    "…because the stamp says the template does not auto-reverse");
});

// ===========================================================================
// x42.k — THE UNIFIED RAMP CLOCK (design §2.3): both correction lanes reset it.
// ===========================================================================

/** Three approved occurrences on a template whose signature is backdated, so periods 2
 *  and 3 are NOT catch-up and genuinely auto-post. Returns the per-period receipts. */
async function threeEarned(label, { autoReverse, client, cents = 52_000, lines = null, proposer = null, signer = null, approver = null } = {}) {
  const w0 = await adjWorld();
  const periods = [mon(-5), mon(-4), mon(-3)];
  const tpl = await liveTemplate({
    client, label, start: periods[0].start, cents, lines, autoReverse,
    backdateSignTo: mon(-6).end, proposer, signer });
  const runs = [];
  for (const [i, p] of periods.entries()) {
    const r = await runManual(proposer ?? w0.users.bob, {
      client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
    if (i === 0) {
      assert.equal(r.status, "drafted", `${label}: occurrence #1 drafts — the one-time ramp`);
      await approveDraft(approver ?? w0.users.alice, r.entry_id);
    } else {
      assert.equal(r.status, "posted", `${label}: occurrence #${i + 1} auto-posts (ramp earned, not catch-up)`);
    }
    runs.push({ period: p, entry: r.entry_id, receipt: r });
  }
  assert.equal((await rampClock(tpl.id)).earned, true, `${label}: the ramp is earned before the correction`);
  return { tpl, periods, runs };
}

test("x42.k1 the PAIR reset: a completed pair correction un-earns autonomy — the corrected period's re-run DRAFTS and so does the NEXT period", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("k1");
  const { tpl, runs } = await threeEarned("k1", { autoReverse: true, client });
  const target = runs[1]; // a period in the middle, so "next" is unambiguous

  const pair = await reversePair(w.users.bob, {
    client, occurrence: target.entry, reason: "x42 k1: wrong accrual amount" });
  assert.equal(pair.status, "completed", "a low-stakes pair correction completes in one transaction");
  const clock = await rampClock(tpl.id);
  assert.equal(clock.earned, false,
    "every occurrence approved BEFORE completed_at stops counting — the clock reset (design §2.3)");

  // The CORRECTED period is unmet again, and its re-run must DRAFT.
  const again = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: target.period.start, periodEnd: target.period.end });
  assert.equal(again.status, "drafted", "the corrected period's re-run DRAFTS, never posts");
  await withdrawAs(w.users.bob, again.entry_id, "x42 k1: park the re-run to probe the next period");

  // …and so does the NEXT period, which was never touched by the correction.
  const next = mon(-2);
  const forward = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: next.start, periodEnd: next.end });
  assert.equal(forward.status, "drafted",
    "the NEXT period drafts too — a reversal un-earns until a fresh reviewed run passes");
  await approveDraft(w.users.alice, forward.entry_id);
  assert.equal((await rampClock(tpl.id)).earned, true, "…and that reviewed run re-earns autonomy");
  assert.equal((await pairRows(client)).length, 1, "exactly one pair-reversal receipt exists");
});

test("x42.k2 the SOLO reset: a plain reverse_entry on a non-auto_reverse occurrence un-earns the SAME clock — the next run DRAFTS", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("k2");
  const { tpl, runs } = await threeEarned("k2", { autoReverse: false, client });
  const target = runs[1];

  // A solo occurrence has no pair, so plain reverse_entry IS its correction path (§2.4).
  const rec = await reverseEntry(w.users.bob, {
    entry: target.entry, reason: "x42 k2: wrong month", opKey: opk("x42k2rev") });
  const mirrorId = rec?.reversal_entry_id ?? rec?.reversal_id ?? rec?.entry_id ?? rec?.id;
  assert.ok(mirrorId, `reverse_entry minted a mirror (got ${JSON.stringify(rec)})`);
  const m = await entryRowOf(mirrorId);
  if (m.status === "draft") await approveDraft(w.users.alice, mirrorId);
  assert.equal((await entryRowOf(mirrorId)).status, "approved",
    "the solo reversal mirror is approved — its approved_at IS the clock");
  assert.equal((await rampClock(tpl.id)).earned, false, "…and the clock reset");

  const next = mon(-2);
  const forward = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: next.start, periodEnd: next.end });
  assert.equal(forward.status, "drafted",
    "the next run DRAFTS — the unified clock reads BOTH correction lanes (design §2.3)");
});

test("x42.k3 a CANCELLED pair receipt never resets the clock: after cancel the template still auto-posts", async (t) => {
  if (skipHere(t)) return;
  // A DEDICATED firm, because the only way to reach the pending (high-stakes) pair branch
  // and then observe a POSTED occurrence is to move the firm's high-stakes floor — a
  // surgery that must never touch the shared world (see the helper's setFirmThreshold).
  const { firm, client, users } = await freshAdjFirm("k3");
  const threshold = await firmThresholdOf(client);
  const cents = threshold + 400_000;
  const periods = [mon(-5), mon(-4)];
  const tpl = await liveTemplate({
    client, label: "k3", start: periods[0].start, cents, autoReverse: true,
    lines: accrualLines(cents), backdateSignTo: mon(-6).end,
    proposer: users.keeper, signer: users.admin });

  for (const p of periods) {
    const r = await runManual(users.keeper, {
      client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
    assert.equal(r.status, "drafted", `${p.key}: a high-stakes occurrence always drafts`);
    await approveDraft(users.owner, r.entry_id);
  }
  const second = (await stampedEntries(tpl.id, "occurrence"))[1];
  const pair = await reversePair(users.keeper, {
    client, occurrence: second.id, reason: "x42 k3: raised in error" });
  assert.equal(pair.status, "pending", "a HIGH-STAKES pair correction parks both corrections as drafts");

  const cancelled = await cancelPairReversal(users.keeper, { client, pair: pair.pair_id });
  assert.equal(cancelled.status, "cancelled", "the pair is cancelled");
  const row = (await pairRows(client))[0];
  assert.equal(row.status, "cancelled", "…and its receipt records it");
  assert.equal(row.completed_at, null,
    "…with completed_at NULL — the ramp clock's timestamp is stamped on approving→completed ONLY");
  assert.equal((await rampClock(tpl.id)).earned, true, "…so autonomy was never un-earned");

  // Lift the firm's floor so the SAME template stops being high-stakes; the mode is now
  // decided by the ramp alone, which the cancelled pair must not have touched.
  await setFirmThreshold(firm, cents * 10);
  assert.ok((await firmThresholdOf(client)) > cents, "the dedicated firm's floor is now above the charge");
  const next = mon(-3);
  const forward = await runManual(users.keeper, {
    client, template: tpl.id, periodStart: next.start, periodEnd: next.end });
  assert.equal(forward.status, "posted",
    "the next occurrence AUTO-POSTS — a cancelled pair receipt never reset the clock");
  noteLane(`x42.k3 ran on a dedicated firm ${firm} whose high-stakes floor was lifted after the cancel`);
});

test("x42.k4 ramp isolation: correcting template A never touches template B's clock", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("k4");
  const a = await threeEarned("k4a", { autoReverse: true, client });
  const b = await threeEarned("k4b", {
    autoReverse: true, client, cents: 27_000, lines: accrualLines(27_000, { debit: EXPB, credit: ACCR2 }) });

  const bReceiptsBefore = (await runRowsForTemplate(b.tpl.id)).length;
  assert.equal(bReceiptsBefore, 3, "B starts with one receipt per earned occurrence");

  await reversePair(w.users.bob, {
    client, occurrence: a.runs[2].entry, reason: "x42 k4: A corrected" });
  assert.equal((await rampClock(a.tpl.id)).earned, false, "template A un-earned");
  assert.equal((await rampClock(b.tpl.id)).earned, true, "…and template B did NOT");

  // THE ISOLATION MEASUREMENT, taken while A's correction is the only thing that happened:
  // correcting A must not mint, void or otherwise disturb a single receipt of B's.
  //
  // ADJUDICATED AT ASSEMBLY: this assertion originally ran at the END of the cell and
  // expected 3 — after the cell had itself posted a fourth B occurrence two lines earlier.
  // It read 4 and failed. The count was right and the instrument was wrong: an auto-posted
  // occurrence mints its receipt in `_adj_on_approve` arm (2), so B legitimately had four.
  // Measuring here — between A's correction and any new B activity — is what actually
  // isolates the variable the cell is named for.
  assert.equal((await runRowsForTemplate(b.tpl.id)).length, bReceiptsBefore,
    "…and B's receipt count is untouched by A's correction");

  const next = mon(-2);
  const aNext = await runManual(w.users.bob, {
    client, template: a.tpl.id, periodStart: next.start, periodEnd: next.end });
  assert.equal(aNext.status, "drafted", "A's next occurrence drafts");
  const bNext = await runManual(w.users.bob, {
    client, template: b.tpl.id, periodStart: next.start, periodEnd: next.end });
  assert.equal(bNext.status, "posted", "…while B's still auto-posts — the clock is per-template");
  assert.equal((await runRowsForTemplate(b.tpl.id)).length, bReceiptsBefore + 1,
    "…and B's own auto-post is the ONLY thing that added a receipt to B");
});
