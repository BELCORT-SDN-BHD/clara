// 0041 Wave D-a — the FA REGISTER battery, part 2: PARTICULARS (design §2.3) ·
// PER-ASSET DUE-NESS + the STRAIGHT-LINE arithmetic (§3.1) · the RUN VERB's
// sequencing and mode laws (§3.2/§3.3) · the RAMP (§1.4) · STALE proposals.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Every date descends from the DB's
// own Asia/Kuala_Lumpur anchor month; a monthly period is due only once the month has
// ENDED, so mon(0) is never due and mon(-1) is the newest that is.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, noteLane, endPool, printLaneNotes, printSkipCount, approveEntry, reverseEntry,
  CLR, assertRaises, x41EnsureReady, skip41, refuses, caught, reasonToken, T, SKIP_REASONS,
  ACCUM, EXPENSE, mon, dayIn, monthSpan, completeParticulars, reviseParticulars,
  proposeAuthority, signAuthority, retireAuthorityVerb, runPeriod, runManual, runDue,
  getFixedAsset, getAuthority, faWorld, faRow, chargeRows, clientCharges, runRows,
  authorityRows, entryRowOf, accumulatedAt, glNet, liveRanges, assertNoOverlaps, freshFaClient,
  buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle, drainDue, kSeededFaClient,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-depreciation");
  printSkipCount("x41-depreciation");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a depreciation battery");

/** Sum of an asset's LIVE charge amounts. */
const chargedTotal = async (asset) => (await liveRanges(asset)).reduce((n, r) => n + r.amount, 0);

// ===========================================================================
// x41.c — PARTICULARS: the completion window and the two change doors.
// ===========================================================================

test("x41.c1 the completion window: complete-once, the driver trio both ways, unknown keys refused, and the CA metadata trio captured but inert", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("c1");
  const sub = w.users.alice;
  const start = mon(-2);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 3) });

  // Driver-trio violations, BOTH ways (design §1.1).
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "reducing_balance", useful_life_months: 60, residual_cents: 0, start_date: start.start } }),
  T.particularsInvalid, "reducing_balance WITHOUT a rate");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "reducing_balance", rate_bps: 2000, residual_cents: 0, start_date: start.start } }),
  T.particularsInvalid, "reducing_balance WITHOUT a life (RB needs life for termination — convention 2)");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "straight_line", useful_life_months: 60, rate_bps: 2000, residual_cents: 0, start_date: start.start } }),
  T.particularsInvalid, "straight_line WITH a rate");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "none", useful_life_months: 60, residual_cents: 0, start_date: start.start } }),
  T.particularsInvalid, "method 'none' WITH a life");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "straight_line", useful_life_months: 60, residual_cents: 0 } }),
  T.particularsInvalid, "a completion with NO start_date (the in-service date is required for EVERY method)");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: start.start, salvage_cents: 5 } }),
  T.particularsInvalid, "a completion carrying an UNKNOWN key");
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "declining_balance", useful_life_months: 60, residual_cents: 0, start_date: start.start } }),
  T.particularsInvalid, "an unknown METHOD (the CHECK widened to exactly three — WD-R3)");

  assert.equal((await faRow(asset.id)).depreciation_method, null, "every refusal left the row untouched (still un-completed)");

  // The lawful completion — including the inert CA trio (WD-R12).
  await completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "straight_line", useful_life_months: 36, residual_cents: 3_000, start_date: start.start,
    description: "Lathe #4", ca_class: "plant_and_machinery", is_commercial_vehicle: false, is_new: true,
  } });
  const row = await faRow(asset.id);
  assert.equal(row.depreciation_method, "straight_line", "the method landed");
  assert.equal(Number(row.useful_life_months), 36, "…the life");
  assert.equal(Number(row.residual_cents), 3_000, "…the residual");
  assert.equal(row.depreciation_start_date, start.start, "…the in-service date");
  assert.equal(row.ca_class, "plant_and_machinery", "the CA trio is captured (WD-R12)");
  assert.equal(row.is_commercial_vehicle, false, "…is_commercial_vehicle");
  assert.equal(row.is_new, true, "…is_new");

  // Complete-once: the window is evaluated on OLD, so the completing UPDATE could not
  // refuse ITSELF (proved by the success above) but a SECOND one must.
  await refuses(() => completeParticulars(sub, { client, asset: asset.id, particulars: {
    method: "straight_line", useful_life_months: 48, residual_cents: 0, start_date: start.start } }),
  T.particularsAlreadyComplete, "a SECOND complete_fixed_asset_particulars on the same asset");

  // Inertness: the CA trio changes no arithmetic. The projected schedule is the
  // money clock only.
  const detail = await getFixedAsset(sub, asset.id);
  const monthly = Math.floor((360_000 - 3_000) / 36);
  assert.ok(detail.schedule?.length, "get_fixed_asset projects a DB-computed schedule (never client-side)");
  assert.equal(Number(detail.schedule[0].projected_cents), monthly,
    `the first projected month = floor((cost − residual)/life) = ${monthly}`);
});

test("x41.c2 the prospective revision door (MPERS 17.19): supersede-forward with effective_from, refused at/behind a live charge", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("c2");
  const sub = w.users.alice;
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 240_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 24, start: start.start, description: "x41 revisable" });
  await liveAuthority(client);
  await earnRamp(client, start);

  // [ASSEMBLY] `p_particulars` is the SAME full particulars object on both change doors
  // (contract §2 states the key set once, for complete AND revise) — a revision states the
  // whole driver set that applies forward, not a patch over the predecessor's.
  const revised = { method: "straight_line", useful_life_months: 12, residual_cents: 0, start_date: start.start };

  // A revision effective ON OR BEFORE a live charge's period_end is refused.
  await refuses(() => reviseParticulars(sub, {
    client, asset: asset.id, particulars: revised, effectiveFrom: start.end,
  }), T.reviseEffectiveConflict, "a revision effective_from <= a live charge's period_end");

  const revFrom = mon(-1).start;
  await reviseParticulars(sub, { client, asset: asset.id, particulars: revised, effectiveFrom: revFrom });

  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "the predecessor flips 'superseded'");
  assert.equal(pred.superseded_at, revFrom, "…superseded_at = p_effective_from (an ACCOUNTING date)");
  assert.ok(pred.superseded_by_asset_id, "…and names the successor");
  const succ = await faRow(pred.superseded_by_asset_id);
  assert.equal(succ.effective_from, revFrom, "the successor is born with effective_from = p_effective_from");
  assert.equal(succ.acquisition_line_id, null, "successors carry acquisition_line_id NULL (the acquisition is reached upward)");
  assert.equal(succ.supersedes_asset_id, asset.id, "…and lineage upward to the predecessor");
  assert.equal(Number(succ.cost_cents), 240_000, "…inheriting cost");
  assert.equal(Number(succ.useful_life_months), 12, "…with the NEW particulars applying to FUTURE periods only");
});

test("x41.c3 carry-down completion surfaces money-vs-date clock divergence, and the MONEY clock is authoritative", async (t) => {
  if (skipHere(t)) return;
  // cost 500,000 · carried accumulated 100,000 · life 60 → the date clock says 60
  // months from the in-service date; the money clock says (500,000−0−100,000)/monthly
  // remain. The projected schedule must follow the MONEY clock, capped by life.
  // [ASSEMBLY] The carried accumulation must be HEAVY enough that the money clock lands
  // BELOW the life cap — otherwise "capped by life" is what binds and the cell proves the cap,
  // not the money clock. cost 500,000 · carried 400,000 · life 60 from 24 months back.
  const k = await kSeededFaClient("c3", { accum: 400_000 });
  const detail = await getFixedAsset(w.users.alice, k.assetId);
  const monthly = Math.floor((k.cost - 0) / 60);
  const money = Math.ceil((k.cost - 0 - k.accum) / monthly);
  // The DATE clock: from the first chargeable month (the month after the carry-down baseline)
  // through the last month of the 60-month life that began 24 months ago.
  const lifeMonths = monthSpan(mon(-5), mon(-24 + 59));
  assert.ok(money < lifeMonths,
    `the fixture really diverges: money clock ${money} months vs date clock ${lifeMonths}`);
  assert.ok(detail.schedule?.length, "get_fixed_asset projects a schedule for the carried asset");
  assert.ok(detail.schedule.length <= 60, "the projection never exceeds the useful life (capped by life)");
  assert.equal(detail.schedule.length, money,
    `the money clock governs: (cost − residual − accumulated)/monthly = ${money} months remain (got ${detail.schedule.length})`);
  noteLane(`x41.c3 money-clock divergence surfaced: date clock ${lifeMonths} months, money clock ${money}`);
});

// ===========================================================================
// x41.d — DUE-NESS + THE STRAIGHT-LINE ARITHMETIC + THE RUN VERB'S LAWS.
// ===========================================================================

test("x41.d1 per-asset due-ness: a LATE completion catches up into the current run, charging exactly its uncharged in-service months", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d1");
  const m3 = mon(-3);
  const a = (await buyAsset({ client, cents: 360_000, postingDate: dayIn(m3, 1), memo: "x41 early" })).asset;
  const b = (await buyAsset({ client, cents: 180_000, postingDate: dayIn(m3, 2), memo: "x41 late" })).asset;
  await completeSL(client, a.id, { life: 36, start: m3.start, description: "x41 A" });
  await liveAuthority(client);
  await earnRamp(client, m3);
  await runAndSettle(client, mon(-2));

  assert.equal((await chargeRows(b.id)).length, 0, "the INCOMPLETE asset was skipped, not charged");
  const early = await runRows(client);
  const skippedReasons = early.flatMap((r) => (r.skipped ?? []).map((s) => s.reason));
  assert.ok(skippedReasons.includes("incomplete"),
    `the receipt counts the skip by NAME (contract §5) — got ${JSON.stringify(skippedReasons)}`);
  for (const reason of skippedReasons) assert.ok(SKIP_REASONS.includes(reason), `'${reason}' is a pinned skip reason`);

  // The LATE completion, back-dated to the same in-service month. Catch-up is reached by
  // DRAINING the oldest-unmet ladder (design §3.2's sequencing law + §3.4's sweep), not by
  // one forward call: the completion re-opens month −3 as the oldest unmet period, and a
  // later call while it is unmet is refused BY NAME (x41.d5 pins that refusal).
  await completeSL(client, b.id, { life: 36, start: m3.start, description: "x41 B" });
  const ladder = await drainDue(client);
  assert.ok(ladder.length >= 1, "the late completion really re-opened the ladder");
  assert.equal((await runDue(client)).due, false, "…and draining it leaves nothing due");

  const bRanges = await liveRanges(b.id);
  assertNoOverlaps(bRanges, "the caught-up asset");
  const covered = bRanges.reduce((n, r) => n + monthSpan(
    { y: Number(r.start.slice(0, 4)), m: Number(r.start.slice(5, 7)) },
    { y: Number(r.end.slice(0, 4)), m: Number(r.end.slice(5, 7)) },
  ), 0);
  assert.equal(covered, 3, `the late asset caught up over its THREE uncharged in-service months (got ${covered})`);
  const monthlyB = Math.floor(180_000 / 36);
  assert.equal(await chargedTotal(b.id), monthlyB * 3, "…charging exactly 3 × the monthly figure");
  assert.equal(await chargedTotal(a.id), Math.floor(360_000 / 36) * 3, "…and the on-time asset is charged for its three months too, never twice");
});

test("x41.d2 the baseline lower bound: a carried asset is never charged for a month at or before baseline_as_of", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("d2");
  await liveAuthority(k.client);
  const baselineMonth = k.baselineAsOf.slice(0, 7);

  // The oldest unmet period must be the month AFTER the baseline, never the asset's
  // in-service month 24 months back (which would double-depreciate carried history).
  const due = await runDue(k.client);
  assert.equal(due.due, true, "a carried, complete asset makes a period due");
  assert.ok(due.period_start > k.baselineAsOf,
    `the oldest unmet period starts AFTER baseline_as_of ${k.baselineAsOf} (got ${due.period_start}) — the carry-down lower bound`);

  await earnRamp(k.client, mon(-5));
  const ranges = await liveRanges(k.assetId);
  for (const r of ranges) {
    assert.ok(r.start > k.baselineAsOf, `no charge range may start at or before the baseline (got ${r.start})`);
    assert.notEqual(r.start.slice(0, 7), baselineMonth, "…and never inside the baseline month itself");
  }
  assert.ok(ranges.length >= 1, "the run is non-vacuous — it really charged the carried asset");
});

test("x41.d3 a zero-charge period persists NOTHING, and a later backdated completion lets the next run lawfully charge the skipped month", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d3");
  const m3 = mon(-3);
  const { asset } = await buyAsset({ client, cents: 120_000, postingDate: dayIn(m3, 4) });
  await liveAuthority(client);

  // Nothing is complete: the run finds nothing due and PERSISTS NOTHING (design §1.5).
  const noop = await runPeriod({ client, periodStart: m3.start, periodEnd: m3.end });
  assert.equal(noop.status, "noop", `a nothing-due run returns a no-op json (got ${JSON.stringify(noop)})`);
  assert.equal((await runRows(client)).length, 0, "…and mints NO receipt (receipts exist only beside materialised ledger rows)");
  assert.equal((await clientCharges(client)).length, 0, "…and no ledger rows");
  const auth = await getAuthority(w.users.alice, client);
  assert.equal(auth.ramp_earned, false, "a zero-charge period earns NOTHING — the ramp predicate needs an approved un-reversed entry");

  // The backdated completion, then a later period: no receipt is in the way.
  await completeSL(client, asset.id, { life: 24, start: m3.start, description: "x41 backdated" });
  const out = await runAndSettle(client, m3);
  assert.notEqual(out.mode, "noop", "the re-called period now charges — no receipt collision exists by design (round-2 fold 1)");
  const ranges = await liveRanges(asset.id);
  assert.equal(ranges.length, 1, "exactly one charge range for the recovered month");
  assert.equal(ranges[0].start, m3.start, "…covering the skipped month itself");
});

test("x41.d4 straight-line final-month exactness: the last month charges cost − residual − accumulated EXACTLY, and accumulated lands on cost − residual", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d4");
  // [ASSEMBLY] The fixture starts at mon(−4), not mon(−3): the cell needs a FOURTH period
  // after the three charged ones, and mon(0) is the month IN PROGRESS — the run verb refuses
  // it by name (`period_request_invalid` / axis `not_ended`, which x41.f2's sibling arm pins).
  // A period is due only once it has ENDED, so the last usable period is mon(−1).
  const m4 = mon(-4);
  const last = mon(-2); // the third and final charged month
  // 100,000 over 3 months: floor(100000/3) = 33,333 · 33,333 · and the final month
  // absorbs 33,334 — the remainder that a naive equal split would lose.
  const { asset } = await buyAsset({ client, cents: 100_000, postingDate: dayIn(m4, 1) });
  await completeSL(client, asset.id, { life: 3, start: m4.start, description: "x41 three-month" });
  await liveAuthority(client);
  await earnRamp(client, m4);
  await runAndSettle(client, mon(-3));
  await runAndSettle(client, last);

  const ranges = (await liveRanges(asset.id)).sort((a, b) => (a.start < b.start ? -1 : 1));
  assert.equal(ranges.length, 3, `three monthly charges (got ${ranges.length})`);
  assert.equal(ranges[0].amount, 33_333, "month 1 = floor((cost − residual)/life)");
  assert.equal(ranges[1].amount, 33_333, "month 2 = the same floor");
  assert.equal(ranges[2].amount, 33_334, "the FINAL month charges the exact remainder (cost − residual − accumulated)");
  assert.equal(await accumulatedAt(asset.id, last.end), 100_000, "accumulated lands EXACTLY on cost − residual");

  // A fourth (ENDED) period charges nothing — fully depreciated is a NAMED skip.
  assert.equal((await runDue(client)).due, false, "a fully-depreciated asset makes NO further period due");
  const after = await runPeriod({ client, periodStart: mon(-1).start, periodEnd: mon(-1).end });
  if (after.status !== "noop") {
    const reasons = (after.skipped ?? []).map((s) => s.reason);
    assert.ok(reasons.includes("fully_depreciated"), `a fully-depreciated asset is skipped BY NAME (got ${JSON.stringify(reasons)})`);
  } else {
    const reasons = (after.skipped ?? []).map((s) => s.reason);
    assert.ok(reasons.includes("fully_depreciated"), `…and the no-op receipt still counts the skip BY NAME (got ${JSON.stringify(reasons)})`);
  }
  // The books agree with the register.
  assert.equal(await glNet(client, ACCUM, last.end), -100_000, "the accum GL account carries the same 100,000 (credit)");
  assert.equal(await glNet(client, EXPENSE, last.end), 100_000, "…and the expense account the same debit");
});

test("x41.d5 sequencing: draft-N blocks N+1 by name, an earlier unmet period refuses a later call, and the due probe never points into an outstanding draft", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d5");
  const m3 = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(m3, 1) });
  await completeSL(client, asset.id, { life: 36, start: m3.start, description: "x41 sequencing" });
  await liveAuthority(client);

  // Calling a LATER period while an earlier one is unmet is refused by name.
  await refuses(() => runPeriod({ client, periodStart: mon(-1).start, periodEnd: mon(-1).end }),
    T.periodEarlierUnmet, "a run for month −1 while month −3 is still unmet");

  // The ramp run drafts; while that draft lives, the NEXT period is refused by name…
  const first = await runPeriod({ client, periodStart: m3.start, periodEnd: m3.end });
  assert.equal(first.status, "drafted", "the ramp run DRAFTS (WD-R5)");
  await refuses(() => runPeriod({ client, periodStart: mon(-2).start, periodEnd: mon(-2).end }),
    T.periodDraftOutstanding, "month −2 while month −3's draft is outstanding (draft-N blocks N+1)");
  // …and re-calling the SAME period is refused the same way — the sweep can never
  // double-call (there is no receipt collision to rely on; the refusal is the law).
  await refuses(() => runPeriod({ client, periodStart: m3.start, periodEnd: m3.end }),
    T.periodDraftOutstanding, "re-calling the SAME period while its own draft is outstanding");

  const dueWhileDraft = await runDue(client);
  assert.equal(dueWhileDraft.due, false, "the sweep's due probe is FALSE while a draft is outstanding — the sweep never calls into the refusal");

  const e = await entryRowOf(first.entry_id);
  await approveEntry(w.users.alice, { entry: first.entry_id, expectedRevision: e.revision_token, opKey: opk("x41seqapr") });
  const dueAfter = await runDue(client);
  assert.equal(dueAfter.due, true, "once approved, the NEXT period becomes due");
  assert.equal(dueAfter.period_start, mon(-2).start, "…and it is the OLDEST unmet one (the sweep calls the oldest only)");
  assert.equal(dueAfter.cadence, "monthly", "…carrying the authority's cadence");
});

test("x41.d6 the ramp is DERIVED, not stored: the first approved run earns autonomy, a reversal un-earns it, and no ramp column exists", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d6");
  const m3 = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(m3, 1) });
  await completeSL(client, asset.id, { life: 36, start: m3.start, description: "x41 ramp" });
  await liveAuthority(client);

  const cols = (await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='fa_depreciation_authorities'",
  )).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c) => /ramp|earned|autonom/i.test(c)),
    `the ramp carries NO column — it is a derived predicate over entries (got: ${cols.join(", ")})`);

  assert.equal((await getAuthority(w.users.alice, client)).ramp_earned, false, "before any approved run, autonomy is unearned");
  const ramp = await earnRamp(client, m3);
  assert.equal((await getAuthority(w.users.alice, client)).ramp_earned, true, "an APPROVED, un-reversed scheduled_run entry earns autonomy");

  const second = await runPeriod({ client, periodStart: mon(-2).start, periodEnd: mon(-2).end });
  assert.equal(second.status, "posted", "the SECOND run auto-posts (WD-R5)");

  // Reversing the earning entry un-earns until a fresh reviewed run passes.
  await reverseEntry(w.users.alice, { entry: second.entry_id, reason: "x41 unearn", opKey: opk("x41unearn") });
  await reverseEntry(w.users.alice, { entry: ramp.entryId, reason: "x41 unearn 2", opKey: opk("x41unearn2") });
  assert.equal((await getAuthority(w.users.alice, client)).ramp_earned, false,
    "reversing every scheduled_run entry UN-earns autonomy (design §1.4 — entries are the truth, never receipts)");
});

test("x41.d7 high-stakes: the run stamps last_human_editor = the authority SIGNER, so the signer's own approval is refused on the distinct-checker arm", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d7");
  const m3 = mon(-3);
  // A monthly charge above the firm's RM10,000 default threshold: 12,000,000 over 12
  // months = 1,000,000/month = RM10,000 — the ENTRY total is the high-stakes grain.
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(m3, 1) });
  await completeSL(client, asset.id, { life: 12, start: m3.start, description: "x41 high-stakes asset" });
  const auth = await liveAuthority(client);

  const first = await runPeriod({ client, periodStart: m3.start, periodEnd: m3.end });
  assert.equal(first.status, "drafted", "a high-stakes period DRAFTS for a distinct checker (WD-R5 / WCA-R7)");
  const e = await entryRowOf(first.entry_id);
  assert.equal(e.last_human_editor, auth.signedBy,
    "the run stamps last_human_editor = the authority signer (round-2 fold 8 — otherwise the distinct-checker intent never binds)");

  await assertRaises(CLR.makerChecker, () => approveEntry(auth.signedBy, {
    entry: first.entry_id, expectedRevision: e.revision_token, opKey: opk("x41hsself"),
  }), "the SIGNER approving their own machine-born high-stakes charge");
  const err = await caught(() => approveEntry(auth.signedBy, {
    entry: first.entry_id, expectedRevision: e.revision_token, opKey: opk("x41hsself2"),
  }));
  assert.equal(reasonToken(err), "distinct_checker", `…on the DISTINCT-CHECKER arm, not the attestation arm (got ${reasonToken(err)})`);

  // A distinct checker clears it.
  await approveEntry(w.users.alice, { entry: first.entry_id, expectedRevision: e.revision_token, opKey: opk("x41hsok") });
  assert.equal((await entryRowOf(first.entry_id)).status, "approved", "a DISTINCT checker approves it lawfully");

  // A high-stakes client keeps drafting every period (WD-R5's own text).
  const second = await runPeriod({ client, periodStart: mon(-2).start, periodEnd: mon(-2).end });
  assert.equal(second.status, "drafted", "…and every subsequent high-stakes period still drafts, ramp or no ramp");
});

test("x41.d8 stale proposals are refused AT APPROVE: a depreciation draft whose register state moved on cannot be materialised", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d8");
  const m3 = mon(-3);
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(m3, 1) });
  await completeSL(client, asset.id, { life: 12, start: m3.start, description: "x41 stale" });
  await liveAuthority(client);
  const drafted = await runPeriod({ client, periodStart: m3.start, periodEnd: m3.end });
  assert.equal(drafted.status, "drafted", "the high-stakes ramp run leaves a draft (the maker-checker window)");

  // [ASSEMBLY] Move the register on underneath the outstanding proposal with an act that
  // really changes WHAT THE PROPOSAL CLAIMS for THIS period: a second asset, in service in
  // the same month, completed after the proposal was made. (A merely PROSPECTIVE revision no
  // longer qualifies — the predecessor row keeps carrying the months before effective_from,
  // which is exactly §3.1's Σ-segments law, so the period's charges are unchanged.)
  const { asset: late } = await buyAsset({ client, cents: 3_600_000, postingDate: dayIn(m3, 2), memo: "x41 stale late" });
  await completeSL(client, late.id, { life: 36, start: m3.start, description: "x41 stale second" });
  const e = await entryRowOf(drafted.entry_id);
  await refuses(() => approveEntry(w.users.alice, {
    entry: drafted.entry_id, expectedRevision: e.revision_token, opKey: opk("x41stale"),
  }), T.depreciationStale, "approving a depreciation proposal whose register state changed since it was made");
  assert.equal((await clientCharges(client)).length, 0, "the refused approve materialised NOTHING (one materialisation moment)");
});

test("x41.d9 the manual path is the machine path: identical mechanics, human context, firm-checked; and no authority at all refuses by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d9");
  const m3 = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(m3, 1) });
  await completeSL(client, asset.id, { life: 36, start: m3.start, description: "x41 manual" });

  await refuses(() => runManual(w.users.alice, { client, periodStart: m3.start, periodEnd: m3.end }),
    T.authorityNotLive, "run_depreciation_manual with NO live signed authority");
  await refuses(() => runPeriod({ client, periodStart: m3.start, periodEnd: m3.end }),
    T.authorityNotLive, "the machine verb with NO live signed authority");
  assert.equal((await runDue(client)).due, false, "…and the due probe stays false without an authority");

  const auth = await liveAuthority(client);
  const manual = await runManual(w.users.alice, { client, periodStart: m3.start, periodEnd: m3.end });
  assert.equal(manual.status, "drafted", "the manual path derives the SAME mode (the ramp still applies)");
  const e = await entryRowOf(manual.entry_id);
  assert.equal(e.origin, "scheduled_run", "…and stamps the same origin");
  assert.equal(e.last_human_editor, auth.signedBy, "…and the same signer stamp");

  // Firm check: a human from another firm cannot drive it.
  await assertRaises(CLR.notFound, () => runManual(w.users.dave, {
    client, periodStart: mon(-2).start, periodEnd: mon(-2).end,
  }), "a human from ANOTHER firm calling run_depreciation_manual");
});

test("x41.d10 the authority family: sign is admin+, a second live authority is refused by name, and cadence changes ride retire + re-sign", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("d10");
  const proposed = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  const id = proposed.authority_id ?? proposed.id;

  await assertRaises(CLR.authz, () => signAuthority(w.users.bob, { client, authority: id }),
    "a BOOKKEEPER signing a depreciation authority (WD-R9 floors it at admin+)");
  await signAuthority(w.users.hana, { client, authority: id });

  await refuses(async () => {
    const p2 = await proposeAuthority(w.users.bob, { client, cadence: "annual" });
    return signAuthority(w.users.hana, { client, authority: p2.authority_id ?? p2.id });
  }, T.authorityAlreadyLive, "signing a SECOND authority while one is live (the unique WHERE status='live')");

  await retireAuthorityVerb(w.users.hana, { client, authority: id, reason: "x41 cadence change" });
  const p3 = await proposeAuthority(w.users.bob, { client, cadence: "annual" });
  await signAuthority(w.users.hana, { client, authority: p3.authority_id ?? p3.id });
  const rows = (await authorityRows(client)).filter((a) => a.status === "live");
  assert.equal(rows.length, 1, "exactly one live authority after retire + re-sign");
  assert.equal(rows[0].cadence, "annual", "…carrying the NEW cadence (cadence changes are retire + re-sign, design §1.4)");
});
