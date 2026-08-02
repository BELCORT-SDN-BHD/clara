// 0041 Wave D-a — the FA REGISTER battery, part 4: DISPOSAL (WD-R7, design §4) ·
// THE PARTIAL COST-PORTION SPLIT (§4.3) · THE REVERSAL MATRIX (§2.4).
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Disposal is PROPOSAL-shaped: the
// verb builds ONE entry carrying flags.fa_disposal (contract §5) and the approve-time
// hook executes it, so a maker-checker window never strands register state.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, noteLane, endPool, printLaneNotes, printSkipCount, approveEntry, idOf, x41EnsureReady,
  skip41, refuses, T, COST, EXPENSE, BANK, GAIN, LOSS, AR1, AP1, OTHER, mon, dayIn,
  disposeAsset, runPeriod, getFixedAsset, listFixedAssets, faRegisterTie,
  faWorld, faRow, faRows, entryRowOf, entryLinesOf, eventCount, accumulatedAt,
  registerAccumulatedAt, liveRanges,
  assertNoOverlaps, freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  disposeAndSettle, reverseAndSettle,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-disposal");
  printSkipCount("x41-disposal");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a disposal battery");
const sumOf = (ranges) => ranges.reduce((n, r) => n + r.amount, 0);

/** A completed, authority-bearing client with one SL asset already charged for its
 *  first month — the standard disposal fixture.
 *
 *  [ASSEMBLY] `settlePrior` also runs month −2, so that a disposal dated in month −1 leaves
 *  NO earlier uncharged due period. Design §4.1 makes that a VALIDATION of the dispose verb
 *  ("no due period EARLIER than the disposal month uncharged"), which is what keeps §3.1's
 *  "through the period end (or disposal month)" confined to the disposal's OWN period — a
 *  mid-FY annual disposal still carries that FY's months, which is §3.1's "the stub is that
 *  asset's only in-year charge". Cells whose subject is the disposal arithmetic settle the
 *  prior month; x41.g4 is the cell that probes the validation itself. */
async function disposableAsset(label, { cost = 360_000, life = 36, settlePrior = false } = {}) {
  const client = await freshFaClient(label);
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: cost, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life, start: start.start, description: `x41 ${label}` });
  await liveAuthority(client);
  await earnRamp(client, start);
  if (settlePrior) await runAndSettle(client, mon(-2));
  return { client, asset: await faRow(asset.id), start, monthly: Math.floor(cost / life) };
}

// ===========================================================================
// x41.g — DISPOSAL.
// ===========================================================================

test("x41.g1 full disposal: ONE entry carrying the fa_disposal proposal, a stub charge THROUGH the disposal month, gain/loss to the named accounts, and asset.disposed", async (t) => {
  if (skipHere(t)) return;
  const { client, asset, monthly } = await disposableAsset("g1", { settlePrior: true });
  const dm = mon(-1);
  const before = await eventCount(client, "asset.disposed");
  const accumBefore = await accumulatedAt(asset.id, mon(-3).end);

  const receipt = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(dm, 20), proceedsCents: 300_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 sold the lathe",
  });
  const entry = idOf(receipt, "entry_id", "id");
  assert.ok(entry, `dispose_fixed_asset names its entry (got ${JSON.stringify(receipt)})`);

  const e = await entryRowOf(entry);
  assert.equal(e.status, "approved", "a routine disposal posts through the approve core immediately");
  assert.equal(e.posting_date, dayIn(dm, 20), "the entry is dated at the disposal date");
  assert.ok(e.flags?.fa_disposal, "the entry carries the fa_disposal proposal (contract §5)");
  assert.equal(e.flags.fa_disposal.asset_id, asset.id, "…naming the asset");
  assert.equal(Number(e.flags.fa_disposal.proceeds_cents), 300_000, "…the proceeds");
  assert.ok(Array.isArray(e.flags.fa_disposal.stub_charges), "…and the stub charges array");
  assert.equal(e.last_human_editor, w.users.alice, "…and last_human_editor = the MAKER (round-2 fold 8)");

  const row = await faRow(asset.id);
  assert.equal(row.status, "disposed", "the register row flips 'disposed'");
  assert.equal(row.disposed_at, dayIn(dm, 20), "…disposed_at = the disposal date (an ACCOUNTING date)");
  assert.equal(row.disposal_entry_id, entry, "…and disposal_entry_id names the entry (the round-2 immutability fold)");
  assert.equal(await eventCount(client, "asset.disposed"), before + 1, "asset.disposed emitted once");

  // Month grain both ends: the DISPOSAL MONTH is charged (convention 1).
  const ranges = await liveRanges(asset.id);
  assertNoOverlaps(ranges, "the disposed asset");
  const last = ranges[ranges.length - 1];
  assert.equal(last.end.slice(0, 7), dm.key, `the stub runs THROUGH the disposal month (got ${last.end})`);
  assert.equal(last.entry, entry, "…and the stub charge belongs to the DISPOSAL entry, not a run");
  assert.equal(sumOf(ranges) - accumBefore, monthly * 2,
    "months −2 (the run) and −1 (the stub, through the disposal month) are each charged exactly once");

  // Gain/loss: proceeds 300,000 vs NBV (cost − accumulated).
  const nbv = Number(row.cost_cents) - (await accumulatedAt(asset.id, dayIn(dm, 20)));
  const lines = await entryLinesOf(entry);
  const net = (code) => lines.filter((l) => l.account_code === code)
    .reduce((n, l) => n + Number(l.debit_cents) - Number(l.credit_cents), 0);
  assert.equal(net(COST), -Number(row.cost_cents), "the cost account is CREDITED with the whole cost");
  assert.equal(net(BANK), 300_000, "the proceeds account is debited with the proceeds");
  if (300_000 > nbv) {
    assert.equal(net(GAIN), -(300_000 - nbv), "a gain is credited to the named gain account (proceeds − NBV)");
    assert.equal(net(LOSS), 0, "…and the loss leg is OMITTED (zero-amount legs are never written)");
  } else {
    assert.equal(net(LOSS), nbv - 300_000, "a loss is debited to the named loss account (NBV − proceeds)");
    assert.equal(net(GAIN), 0, "…and the gain leg is OMITTED");
  }
});

test("x41.g2 zero-proceeds scrapping: a NULL proceeds account is lawful at zero proceeds, and the whole NBV lands on the loss account", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await disposableAsset("g2", { settlePrior: true });
  const dm = mon(-1);
  const receipt = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(dm, 15), proceedsCents: 0,
    proceedsAccount: null, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 scrapped",
  });
  const entry = idOf(receipt, "entry_id", "id");
  const lines = await entryLinesOf(entry);
  assert.ok(!lines.some((l) => Number(l.debit_cents) === 0 && Number(l.credit_cents) === 0),
    "zero-amount legs are OMITTED (design §4.1)");
  assert.ok(!lines.some((l) => l.account_code === GAIN), "a scrapping writes NO gain leg");
  const nbv = Number((await faRow(asset.id)).cost_cents) - (await accumulatedAt(asset.id, dayIn(dm, 15)));
  const lossNet = lines.filter((l) => l.account_code === LOSS)
    .reduce((n, l) => n + Number(l.debit_cents) - Number(l.credit_cents), 0);
  assert.equal(lossNet, nbv, "the whole remaining NBV lands on the loss account");
  assert.equal((await faRow(asset.id)).status, "disposed", "the asset is disposed");
});

test("x41.g3 disposal account validations: the proceeds account must be a non-control ASSET that is not the enrolled cost account; gain must be income and loss an expense", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await disposableAsset("g3", { settlePrior: true });
  const dm = mon(-1);
  const base = { client, asset: asset.id, disposalDate: dayIn(dm, 12), proceedsCents: 100_000, memo: "x41 validation" };

  // [ASSEMBLY · adjudication A2] These are REQUEST-shape refusals, not particulars refusals:
  // the shipped token is `disposal_request_invalid` and its `axis` names the offending
  // argument. The cell pins the token AND the axis, which is strictly stronger than the
  // lane's original guess of the particulars token.
  const axisOf = (err) => /"axis"\s*:\s*"([a-z_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;
  const badArg = async (o, axis, label) => {
    const err = await refuses(() => disposeAsset(w.users.alice, { ...base, ...o }),
      T.disposalRequestInvalid, label);
    assert.equal(axisOf(err), axis, `${label}: the refusal names axis '${axis}' (got '${axisOf(err)}')`);
  };
  await badArg({ proceedsAccount: COST }, "proceeds_account", "proceeds landing on the ENROLLED cost account");
  await badArg({ proceedsAccount: AR1 }, "proceeds_account", "proceeds landing on a CONTROL account (a credit sale needs a named non-control debtor)");
  await badArg({ proceedsAccount: OTHER }, "proceeds_account", "proceeds landing on an EXPENSE account");
  await badArg({ proceedsAccount: BANK, gainAccount: OTHER }, "gain_account", "a gain account that is not INCOME-typed");
  await badArg({ proceedsAccount: BANK, lossAccount: GAIN }, "loss_account", "a loss account that is not EXPENSE-typed");
  await badArg({ proceedsAccount: null }, "proceeds_account", "a NULL proceeds account with NON-ZERO proceeds");
  await badArg({ proceedsAccount: BANK, gainAccount: AP1 }, "gain_account", "a CONTROL gain account");
  assert.equal((await faRow(asset.id)).status, "active", "every refusal left the asset untouched");
});

test("x41.g4 the per-asset precondition: an EARLIER uncharged due period refuses the disposal; an incomplete asset refuses; and a carry-down with NO authority disposes lawfully", async (t) => {
  if (skipHere(t)) return;
  // (a) incomplete
  const c1 = await freshFaClient("g4a");
  const { asset: incomplete } = await buyAsset({ client: c1, cents: 100_000, postingDate: dayIn(mon(-2), 3) });
  await refuses(() => disposeAsset(w.users.alice, {
    client: c1, asset: incomplete.id, disposalDate: mon(-1).end, proceedsCents: 0, proceedsAccount: null,
  }), T.particularsIncomplete, "disposing an asset whose particulars are still pending");

  // (b) an EARLIER due period is uncharged
  const c2 = await freshFaClient("g4b");
  const start = mon(-3);
  const { asset } = await buyAsset({ client: c2, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(c2, asset.id, { life: 36, start: start.start, description: "x41 g4b" });
  await liveAuthority(c2);
  // [ASSEMBLY · adjudication A2] The precondition is design §4.1's own Validation and it has
  // its own pinned token — the lane's disjunction collapses to a positive pin.
  await refuses(() => disposeAsset(w.users.alice, {
    client: c2, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 0, proceedsAccount: null,
  }), T.periodEarlierUnmet,
  "disposing while an EARLIER due period is still uncharged (the per-asset precondition)");

  await earnRamp(c2, start);
  await runAndSettle(c2, mon(-2));
  const ok = await disposeAsset(w.users.alice, {
    client: c2, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 0, proceedsAccount: null,
  });
  assert.ok(ok, "once the earlier periods are charged the disposal is admitted");

  // (c) a client with NO authority at all: the precondition is vacuous.
  const c3 = await freshFaClient("g4c");
  const { asset: a3 } = await buyAsset({ client: c3, cents: 120_000, postingDate: dayIn(mon(-3), 2) });
  await completeSL(c3, a3.id, { life: 24, start: mon(-3).start, description: "x41 g4c" });
  const noAuth = await disposeAsset(w.users.alice, {
    client: c3, asset: a3.id, disposalDate: mon(-1).end, proceedsCents: 50_000, proceedsAccount: BANK,
  });
  assert.ok(noAuth, "no depreciation authority is REQUIRED to dispose (the precondition is over DUE periods, and none exist)");
  assert.equal((await faRow(a3.id)).status, "disposed", "…and the asset really disposed");
  // [ASSEMBLY] The stub is NOT conditioned on an authority: depreciation to the disposal date
  // is the asset's own economics (design §4.1 "the stub depreciation through the disposal
  // month"), while the authority governs only the periodic RUN lane. So the disposal still
  // charges the three in-service months — mon(−3)..mon(−1) — in ONE terminal stub.
  const stub = await liveRanges(a3.id);
  assert.ok(stub.length >= 1, "the disposal still charges depreciation to the disposal date");
  assert.equal(stub[0].start, mon(-3).start, "…starting at the in-service month");
  assert.equal(stub[stub.length - 1].end, mon(-1).end, "…and running THROUGH the disposal month");
});

test("x41.g5 the pending-disposal freeze: while an un-dead disposal draft dated <= period end exists, the run SKIPS that asset by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("g5");
  const start = mon(-3);
  // High-stakes so the disposal DRAFTS and the maker-checker window really opens.
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 12, start: start.start, description: "x41 g5" });
  await liveAuthority(client);
  const ramp = await runPeriod({ client, periodStart: start.start, periodEnd: start.end });
  const e0 = await entryRowOf(ramp.entry_id);
  await approveEntry(w.users.alice, { entry: ramp.entry_id, expectedRevision: e0.revision_token, opKey: opk("x41g5r") });

  const draftDisposal = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-2).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, memo: "x41 pending disposal",
  });
  const dEntry = idOf(draftDisposal, "entry_id", "id");
  assert.equal((await entryRowOf(dEntry)).status, "draft", "the high-stakes disposal DRAFTS for a distinct checker");

  const run = await runPeriod({ client, periodStart: mon(-2).start, periodEnd: mon(-2).end });
  if (run.status === "noop") {
    noteLane("x41.g5 the run found nothing due at all with the disposal frozen — the freeze is total");
  } else {
    const reasons = (run.skipped ?? []).map((s) => s.reason);
    assert.ok(reasons.includes("disposal_draft_outstanding"),
      `the run SKIPS an asset with an outstanding disposal draft, BY NAME (got ${JSON.stringify(reasons)})`);
  }
});

test("x41.g6 stale disposal proposals are refused AT APPROVE by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("g6");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 12, start: start.start, description: "x41 g6" });
  await liveAuthority(client);
  const ramp = await earnRamp(client, start); // month −3 charged
  await runAndSettle(client, mon(-2)); // …and month −2, so the disposal's own precondition is met
  const drafted = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, memo: "x41 stale disposal",
  });
  const entry = idOf(drafted, "entry_id", "id");
  assert.equal((await entryRowOf(entry)).status, "draft", "the high-stakes disposal drafts");

  // The register moves on underneath the outstanding proposal.
  // [ASSEMBLY · round-3.5 fold G6] The lever here USED to be a particulars revision. G6
  // closed that door at its source — `revise_fixed_asset_particulars` now refuses while an
  // un-dead disposal draft is outstanding, expressly so that a mid-flight revision is
  // refused HONESTLY at the revise door instead of confusingly at approve. The staleness
  // law itself is unchanged and still owned by this cell; only the lever moves, to an act
  // the design still permits inside the maker-checker gap: reversing one of THIS asset's
  // own posted depreciation charges. That re-opens the period, so the stub the proposal
  // froze is no longer the stub the register would compute — the `stub` axis of
  // disposal_stale, distinct from x41.s3's `accum` axis (an ANCESTOR acting in the gap).
  await reverseAndSettle(w.users.alice, {
    entry: ramp.entryId, reason: "x41 g6 correction inside the maker-checker gap", opKey: opk("x41g6rev"),
  });
  const e = await entryRowOf(entry);
  // [ASSEMBLY] the disposal stamps last_human_editor = the MAKER (round-2 fold 8), so a
  // high-stakes disposal is approved by a DISTINCT checker — alice raised it, hana checks.
  const stale = await refuses(() => approveEntry(w.users.hana, {
    entry, expectedRevision: e.revision_token, opKey: opk("x41g6"),
  }), T.disposalStale, "approving a disposal proposal whose register state changed since it was made");
  noteLane(`x41.g6 the staleness axis the reversal-in-the-gap lever fires: '${/"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(stale?.detail ?? ""))?.[1] ?? "(none)"}'`);
  assert.equal((await faRow(asset.id)).status, "active",
    "the refused approve executed NOTHING (the asset is still an ACTIVE register row — no disposal, no partial state)");
});

// ===========================================================================
// x41.h — THE PARTIAL COST-PORTION SPLIT (WD-R7, design §4.3).
// ===========================================================================

test("x41.h1 the split is sen-exact: cost, accumulated and residual are pro-rated on the COST fraction and the CONTINUING remainder absorbs ALL the rounding", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("h1");
  const start = mon(-3);
  // 100,003 cents over 3 months with a 7-cent residual: a portion of 33,334 forces a
  // genuinely non-integral share on every one of the three pro-rated figures.
  const { asset } = await buyAsset({ client, cents: 100_003, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 3, residual: 7, start: start.start, description: "x41 splittable" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2));

  const dm = mon(-1);
  const original = await faRow(asset.id);
  const accumBefore = await accumulatedAt(asset.id, dm.end);
  const portion = 33_334;
  const receipt = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(dm, 18), proceedsCents: 20_000,
    proceedsAccount: BANK, memo: "x41 partial disposal", costPortionCents: portion,
  });
  const entry = idOf(receipt, "entry_id", "id");
  const splitDate = dayIn(dm, 18);

  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "the ORIGINAL flips 'superseded'");
  assert.equal(pred.superseded_at, splitDate, "…superseded_at = the split ENTRY's posting date (round-2 fold 3)");

  const rows = await faRows(client);
  const successors = rows.filter((r) => r.supersedes_asset_id === asset.id);
  assert.equal(successors.length, 2, "TWO successors are born (the disposed portion + the continuing remainder)");
  const disposedPart = successors.find((r) => r.status === "disposed");
  const continuing = successors.find((r) => r.status !== "disposed");
  assert.ok(disposedPart && continuing, "one successor is disposed immediately, the other keeps depreciating");
  assert.equal(pred.superseded_by_asset_id, continuing.id,
    "superseded_by_asset_id always names the CONTINUING successor (the split lineage law); the disposed portion is reachable upward only");

  assert.equal(Number(disposedPart.cost_cents), portion, "the disposed portion's cost = the stated cost portion (never a percentage — WD-R7)");
  assert.equal(Number(continuing.cost_cents), Number(original.cost_cents) - portion, "…and the remainder is the exact complement");
  // [ASSEMBLY] The split's accumulated basis is the accumulation AT THE DISPOSAL DATE, which
  // INCLUDES the terminal stub this very entry charges (design §4.1 charges the stub first,
  // then disposes cost + accumulated). The lane's expectation stopped at the pre-stub figure.
  const stubTotal = (await entryLinesOf(entry))
    .filter((l) => l.account_code === EXPENSE)
    .reduce((n, l) => n + Number(l.debit_cents) - Number(l.credit_cents), 0);
  assert.ok(stubTotal > 0, "the split entry really carries a terminal stub charge");
  const accumAt = accumBefore + stubTotal;
  const expectedAccumShare = Math.round(accumAt * portion / Number(original.cost_cents));
  // [ROUND-3 / fix-ledger F1] The pro-rating LAW is unchanged; only the instrument that
  // carries it moved. A baked `accumulated_depreciation_cents` now holds ONLY a carried/root
  // baseline share and NEVER ledger content ("the 8 broken clients' shape must become
  // unrepresentable"), so on a soft-born successor the column is 0 by construction and the
  // parent's charges reach it through the lineage read, pro-rated at READ time. Asserting the
  // column here would pin the very shape F1 abolished — so assert the READ, at the split date.
  assert.equal(Number(disposedPart.accumulated_depreciation_cents), 0,
    "a soft-born successor bakes NO ledger content (fix-ledger F1) — its share is pro-rated at read time");
  assert.equal(Number(continuing.accumulated_depreciation_cents), 0, "…on BOTH successors");
  const disposedAccum = await registerAccumulatedAt(disposedPart.id, splitDate);
  const continuingAccum = await registerAccumulatedAt(continuing.id, splitDate);
  assert.equal(disposedAccum, expectedAccumShare,
    `the disposed portion's accumulated share = round(accum-at-disposal × portion/cost) = ${expectedAccumShare}`);
  assert.equal(disposedAccum + continuingAccum, accumAt,
    "the two accumulated shares sum EXACTLY to the original's — the remainder absorbs the rounding");
  assert.equal(await registerAccumulatedAt(asset.id, splitDate), accumAt,
    "…and the predecessor's own ledger at the split date IS that total (the fixture is non-vacuous)");
  const expectedResidualShare = Math.round(Number(original.residual_cents) * portion / Number(original.cost_cents));
  assert.equal(Number(disposedPart.residual_cents), expectedResidualShare,
    `the residual share = round(residual × portion/cost) = ${expectedResidualShare} (round-2 fold: residual pro-rates too)`);
  assert.equal(Number(disposedPart.residual_cents) + Number(continuing.residual_cents), Number(original.residual_cents),
    "…and the residual shares sum EXACTLY to the original's");
  assert.equal(continuing.effective_from, splitDate, "both successors carry effective_from = the split entry's posting date");
  assert.equal(disposedPart.effective_from, splitDate, "…both of them");
  assert.equal(continuing.acquisition_line_id, null, "successors carry acquisition_line_id NULL (the acquisition is reached upward)");
  assert.ok(entry, "the split rode ONE entry");
});

test("x41.h2 effective_from gating: an as-of read BEFORE the split sees the ORIGINAL ALONE; after it, only the successors — and fa_register_tie holds at BOTH dates", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("h2");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 10_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 120, start: start.start, description: "x41 h2" });
  await liveAuthority(client);
  await earnRamp(client, start);
  // [ASSEMBLY] Month −2 is settled first: design §4.1 refuses a disposal while an EARLIER
  // due period is uncharged (x41.g4 is that cell). This cell's subject is elsewhere.
  await runAndSettle(client, mon(-2));

  const before = dayIn(mon(-2), 15);
  const tieBefore = await faRegisterTie(w.users.alice, client, before);
  assert.equal(tieBefore.tie, true, "the register ties to the GL BEFORE the split");

  const dm = mon(-1);
  await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(dm, 10), proceedsCents: 1_000_000,
    proceedsAccount: BANK, memo: "x41 h2 split", costPortionCents: 2_500_000,
  });

  // The round-2 RM100,000 false-break: without effective_from gating a pre-split
  // as-of read would see the original AND both successors and double-count.
  const tieBeforeAgain = await faRegisterTie(w.users.alice, client, before);
  assert.equal(tieBeforeAgain.tie, true, "the pre-split as-of read STILL ties after the split (effective-dated inclusion, design §1.1)");
  const acctBefore = tieBeforeAgain.accounts.find((a) => a.asset_account === COST);
  assert.equal(Number(acctBefore.register_cost_cents), 10_000_000,
    "the pre-split as-of read counts the ORIGINAL ALONE (the successors' effective_from is later)");
  assert.equal(Number(acctBefore.cost_diff_cents), 0, "…and the cost difference is EXACTLY zero");

  const after = dayIn(mon(0), 1);
  const tieAfter = await faRegisterTie(w.users.alice, client, after);
  assert.equal(tieAfter.tie, true, "…and the post-split as-of read ties too");
  const acctAfter = tieAfter.accounts.find((a) => a.asset_account === COST);
  assert.equal(Number(acctAfter.register_cost_cents), 10_000_000 - 2_500_000,
    "…counting only the CONTINUING successor (the disposed portion left the books)");
  assert.equal(Number(acctAfter.cost_diff_cents), 0, "…still exactly zero against the GL");
});

test("x41.h3 lineage reads BOTH directions: get_fixed_asset walks upward from either successor to the acquisition", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("h3");
  const start = mon(-3);
  const { entry, asset } = await buyAsset({ client, cents: 6_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 60, start: start.start, description: "x41 h3" });
  await liveAuthority(client);
  await earnRamp(client, start);
  // [ASSEMBLY] Month −2 is settled first: design §4.1 refuses a disposal while an EARLIER
  // due period is uncharged (x41.g4 is that cell). This cell's subject is elsewhere.
  await runAndSettle(client, mon(-2));
  await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 9), proceedsCents: 500_000,
    proceedsAccount: BANK, memo: "x41 h3 split", costPortionCents: 1_000_000,
  });

  const rows = await faRows(client);
  const successors = rows.filter((r) => r.supersedes_asset_id === asset.id);
  for (const s of successors) {
    const detail = await getFixedAsset(w.users.alice, s.id);
    const ids = (detail.lineage ?? []).map((x) => x.id);
    assert.ok(ids.includes(asset.id),
      `get_fixed_asset(${s.status}) walks UPWARD to the original (lineage: ${ids.join(", ")})`);
    const root = (detail.lineage ?? []).find((x) => x.id === asset.id);
    assert.ok(root, "…and the ORIGINAL is the row the walk lands on");
    // [ASSEMBLY] acquisition_entry_id is not one of contract §3's projected ASSET keys — the
    // lineage walk is what the read surfaces, and the birth identity is read off the register.
    assert.equal((await faRow(asset.id)).acquisition_entry_id, entry,
      "…and the original still names the acquisition entry (the birth identity is reached upward)");
  }
  const listed = await listFixedAssets(w.users.alice, client);
  const shown = listed.assets.map((a) => a.id);
  assert.ok(!shown.includes(asset.id) || listed.assets.find((a) => a.id === asset.id).status === "superseded",
    "the register list marks the original superseded rather than silently dropping it");
});
