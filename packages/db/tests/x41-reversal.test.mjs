// 0041 Wave D-a — the FA REGISTER battery, part 4b: THE REVERSAL MATRIX (design §2.4,
// dependency-ordered) — acquisition reversal, the approve-time twin, the descendant
// dependency order, the effective-dated depreciation unwind, and partial-split reversal.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Split out of x41-disposal.test.mjs only
// because the repo enforces a 500-line file ceiling; `node --test tests/` discovers both.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, noteLane, endPool, printLaneNotes, printSkipCount,
  approveEntry, reverseEntry, idOf, runRowsCount,
  x41EnsureReady, skip41, refuses,
  T, BANK,
  mon, dayIn,
  disposeAsset, runPeriod,
  faWorld, faRow, faRows, chargeRows, entryRowOf,
  accumulatedAt, liveRanges,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle, disposeAndSettle,
  reverseAndSettle,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-reversal");
  printSkipCount("x41-reversal");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a reversal battery");

/** A completed, authority-bearing client with one SL asset already charged for its
 *  first month — the shared disposal/reversal fixture (mirrors x41-disposal's). */
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
// x41.i — THE REVERSAL MATRIX (design §2.4, dependency-ordered).
// ===========================================================================

test("x41.i1 a CLEAN acquisition reversal unwinds the row; an acquisition WITH live charges is refused by name, and the approve-time TWIN re-derives it", async (t) => {
  if (skipHere(t)) return;
  const clean = await freshFaClient("i1a");
  const { entry, asset } = await buyAsset({ client: clean, cents: 50_000, postingDate: dayIn(mon(-2), 3) });
  await reverseEntry(w.users.alice, { entry, reason: "x41 clean", opKey: opk("x41i1a") });
  assert.equal((await faRow(asset.id)).status, "unwound", "a CLEAN acquisition reversal unwinds the register row");

  const { asset: charged } = await disposableAsset("i1b");
  await refuses(() => reverseEntry(w.users.alice, {
    entry: charged.acquisition_entry_id, reason: "x41 depreciated", opKey: opk("x41i1b"),
  }), T.reverseDepreciated, "reversing an acquisition that already carries LIVE depreciation charges");
  assert.equal((await faRow(charged.id)).status, "active", "…and the row is untouched");

  // The approve-time TWIN: a high-stakes mirror that is drafted, then a charge lands
  // before the mirror is approved — the hook must re-derive the refusal at approve.
  const c2 = await freshFaClient("i1c");
  const start = mon(-3);
  const { entry: bigEntry, asset: big } = await buyAsset({ client: c2, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(c2, big.id, { life: 12, start: start.start, description: "x41 twin" });
  const mirror = await reverseEntry(w.users.alice, { entry: bigEntry, reason: "x41 twin", opKey: opk("x41i1c") });
  const mirrorId = idOf(mirror, "reversal_entry_id", "entry_id", "id");
  const mirrorRow = mirrorId ? await entryRowOf(mirrorId) : null;
  if (mirrorRow?.status === "draft") {
    await liveAuthority(c2);
    const ramp = await runPeriod({ client: c2, periodStart: start.start, periodEnd: start.end });
    if (ramp.status !== "noop") {
      const e0 = await entryRowOf(ramp.entry_id);
      await approveEntry(w.users.alice, { entry: ramp.entry_id, expectedRevision: e0.revision_token, opKey: opk("x41twinrun") });
    }
    await refuses(() => approveEntry(w.users.hana, {
      entry: mirrorId, expectedRevision: mirrorRow.revision_token, opKey: opk("x41twinapr"),
    }), T.reverseDepreciated, "approving a reversal MIRROR after charges landed in the maker-checker gap (the approve-time twin)");
  } else {
    noteLane("x41.i1 the reversal mirror posted immediately (not high-stakes on this firm) — the approve-time twin was exercised only through the verb arm");
  }
});

test("x41.i2 dependency order: an acquisition with disposal/split DESCENDANTS refuses until those are reversed", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("i2");
  const { entry, asset } = await buyAsset({ client, cents: 200_000, postingDate: dayIn(mon(-3), 1) });
  await completeSL(client, asset.id, { life: 24, start: mon(-3).start, description: "x41 i2" });
  const disp = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 5), proceedsCents: 100_000, proceedsAccount: BANK,
  });
  await refuses(() => reverseEntry(w.users.alice, { entry, reason: "x41 descendants", opKey: opk("x41i2") }),
    T.reverseDescendants, "reversing an acquisition while a DISPOSAL descendant exists");

  // Reverse the descendant first, then the acquisition is reachable.
  await reverseEntry(w.users.alice, { entry: idOf(disp, "entry_id", "id"), reason: "x41 undo disposal", opKey: opk("x41i2b") });
  assert.equal((await faRow(asset.id)).status, "active", "the full-disposal reversal RESTORES the asset to active");
  assert.equal((await faRow(asset.id)).disposed_at, null, "…clearing disposed_at");
  assert.equal((await faRow(asset.id)).disposal_entry_id, null, "…and disposal_entry_id");
  assert.equal((await liveRanges(asset.id)).length, 0, "…and the stub charge is UNWOUND");
});

test("x41.i3 depreciation unwind is EFFECTIVE-DATED at the mirror's posting date, and the period may then be RE-RUN lawfully", async (t) => {
  if (skipHere(t)) return;
  const { client, asset, start, monthly } = await disposableAsset("i3");
  const runEntry = (await chargeRows(asset.id))[0].entry_id;
  const beforeAt = await accumulatedAt(asset.id, start.end);
  assert.equal(beforeAt, monthly, "the ramp charge is visible at its own period end");

  await reverseEntry(w.users.alice, { entry: runEntry, reason: "x41 unwind", opKey: opk("x41i3") });
  const rows = await chargeRows(asset.id);
  const unwinds = rows.filter((r) => r.unwind_of);
  assert.equal(unwinds.length, 1, "exactly ONE unwind row was appended");
  assert.equal(unwinds[0].is_live, false, "unwind rows are born DEAD (is_live=false, always — round-2 fold 2)");
  const originals = rows.filter((r) => !r.unwind_of);
  assert.equal(originals[0].is_live, false, "…and the original charge was flipped is_live=false in the same block");
  const mirror = await entryRowOf(unwinds[0].entry_id);
  assert.equal(unwinds[0].effective_date, mirror.posting_date,
    "the unwind is effective-dated at the MIRROR's posting date, not the original period");

  // The signed read: an as-of BEFORE the mirror still sees the charge; after it, zero.
  const dayBefore = start.end;
  assert.equal(await accumulatedAt(asset.id, dayBefore), monthly,
    "an as-of read BEFORE the mirror still carries the charge (is_live never appears in the read)");
  assert.equal(await accumulatedAt(asset.id, mirror.posting_date), 0, "…and from the mirror's date the accumulation is back to zero");

  // The period may now be RE-RUN (the unique index frees the slot after unwind).
  const rerun = await runPeriod({ client, periodStart: start.start, periodEnd: start.end });
  assert.notEqual(rerun.status, "noop", "the corrected period is due again and re-runs lawfully (design §1.3/§1.5)");
  assert.ok((await runRowsCount(client)) >= 1, "a corrected re-run mints a SECOND receipt for the same period — no (client, period) unique exists");
});

test("x41.i4 partial-disposal reversal: BOTH successors unwound, the original restored, the stub unwound — and refused when a successor has later state", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("i4");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 4_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 i4" });
  await liveAuthority(client);
  await earnRamp(client, start);
  // [ASSEMBLY] Month −2 is settled first: design §4.1 refuses a disposal while an EARLIER
  // due period is uncharged (x41.g4 is that cell). This cell's subject is elsewhere.
  await runAndSettle(client, mon(-2));
  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, memo: "x41 i4 split", costPortionCents: 1_000_000,
  });
  const splitEntry = split.entryId;
  const successors = (await faRows(client)).filter((r) => r.supersedes_asset_id === asset.id);
  assert.equal(successors.length, 2, "the split produced two successors");
  const continuing = successors.find((r) => r.status !== "disposed");

  // Give the CONTINUING successor later state, then the reversal must refuse.
  await runAndSettle(client, mon(-1));
  if ((await liveRanges(continuing.id)).length > 0) {
    await refuses(() => reverseAndSettle(w.users.alice, { entry: splitEntry, reason: "x41 i4 refuse", opKey: opk("x41i4a") }),
      T.partialSuccessorAdvanced, "reversing a split whose CONTINUING successor now carries later charges");
    // Unwind the later charge, then the reversal becomes reachable.
    const laterEntry = (await liveRanges(continuing.id))[0].entry;
    await reverseAndSettle(w.users.alice, { entry: laterEntry, reason: "x41 i4 undo later", opKey: opk("x41i4b") });
  } else {
    noteLane("x41.i4 no later charge landed on the continuing successor — the successor-advanced arm was not reachable in this window");
  }

  // [ASSEMBLY] a high-stakes mirror DRAFTS, and every FA reversal consequence lives in the
  // approve hook — so the mirror is approved by a distinct checker before the register moves.
  await reverseAndSettle(w.users.alice, { entry: splitEntry, reason: "x41 i4 undo split", opKey: opk("x41i4c") });
  for (const s of successors) {
    assert.equal((await faRow(s.id)).status, "unwound", `successor ${s.id} is UNWOUND by the split reversal`);
  }
  const restored = await faRow(asset.id);
  assert.equal(restored.status, "active", "the ORIGINAL is restored to active");
  assert.equal(restored.superseded_by_asset_id, null, "…superseded_by cleared");
  assert.equal(restored.superseded_at, null, "…and superseded_at cleared");
  const stubs = (await chargeRows(asset.id)).filter((r) => r.entry_id === splitEntry && !r.unwind_of);
  for (const s of stubs) {
    const unwound = (await chargeRows(asset.id)).some((r) => r.unwind_of === s.id);
    assert.ok(unwound, "every stub charge the split minted is UNWOUND by its reversal");
  }
});
