// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery, part B: THE DISPOSAL PRECONDITION
// COVERS THE LINEAGE THROUGH THE DISPOSAL MONTH (G2), AND THE APPROVE-TIME FRESHNESS
// FINGERPRINT COVERS THE ACCUMULATED LEG, NOT JUST THE STUB (G1 tail).
//
//   x41.s2  G2 — revise mid-month, then dispose the SUCCESSOR inside that same month:
//           refused by name while an ANCESTOR still owes the disposal period; running
//           the named period is a followable remedy, and once the ladder has drained the
//           register still ties to the GL at every as-of.
//   x41.s3  G1 tail — an ANCESTOR acts inside the maker-checker gap of a drafted
//           disposal: approving it is refused `disposal_stale`, and the SAME fixture
//           without the gap act approves cleanly (the control that keeps s3 honest).
//
// WHY. A revision effective mid-month leaves the PREDECESSOR chargeable for that whole
// month, so a precondition that only looks at periods STRICTLY EARLIER than the disposal
// waves the disposal through while the lineage still owes the disposal month itself. The
// sweep then credits the accumulated account for a register that holds nothing — a tie
// break with no correction path (the ancestor cannot be disposed, the successor already
// is, and reversing the charge just makes it due again). And because the F1 read layer
// made the disposal's own accumulated leg a LINEAGE read, an ancestor's act between draft
// and approve silently moves NBV and gain unless approve re-derives them.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  refuses, T, COST, ACCUM, BANK, GAIN, LOSS, mon, dayIn,
  approveEntry, disposeAsset, reviseParticulars, runDue, drainDue, faRegisterTie,
  faWorld, faRow, glNet, liveRanges, lineageLiveRanges, sumRanges, entryRowOf,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  disposeAndSettle, reverseAndSettle, tieAccts, tieSumBy,
} from "./x41-round35-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round35-disposal");
  printSkipCount("x41-round35-disposal");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3.5 disposal battery");

/** Every entry of a client carrying a disposal proposal — a REFUSED disposal must mint
 *  none (the round-3 F6 law: no un-approvable poison draft, in either direction). */
const disposalEntries = async (client) =>
  (await rootQuery(
    "select id, status from clara.journal_entries where client_id=$1 and flags ? 'fa_disposal' order by created_at",
    [client],
  )).rows;

// ===========================================================================
// x41.s2 — THE DISPOSAL PRECONDITION WALKS THE LINEAGE THROUGH THE DISPOSAL
//          MONTH, AND THE REMEDY IS FOLLOWABLE (G2).
// ===========================================================================

test("x41.s2 revise mid-month then dispose the successor in that same month: refused while an ANCESTOR still owes the disposal period, green once the period is run, and the register still ties afterwards", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s2");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 s2" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 s2" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2)); // months −3 and −2 charged; month −1 left OWED

  // A LAWFUL revision, effective after every live charge's period_end but INSIDE an
  // unmet month — so the predecessor stays chargeable for that whole month (month grain).
  const revFrom = dayIn(mon(-1), 2);
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: revFrom,
    particulars: { method: "straight_line", useful_life_months: 48, residual_cents: 0, start_date: start.start },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");
  const due = await runDue(client);
  assert.equal(due.due, true, "mandatory setup: the disposal month is still OWED by the lineage");
  assert.equal(due.period_start, mon(-1).start, `…and it is the month the disposal will fall in (got ${due.period_start})`);

  // THE PIN — the disposal month is not "earlier than" itself, and that is exactly the
  // hole: the ancestor owes THIS month, the stub only ever charges the DISPOSED row, so a
  // precondition bounded at (disposal period − 1) admits a disposal that strands a month
  // of depreciation with no register row to hold it, forever.
  await refuses(() => disposeAsset(w.users.alice, {
    client, asset: succId, disposalDate: dayIn(mon(-1), 20), proceedsCents: 50_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s2 premature",
  }), T.periodEarlierUnmet,
  "disposing a successor in a month an ANCESTOR row still owes (the precondition must reach THROUGH the disposal period, not stop before it)");
  assert.equal((await faRow(succId)).status, "active", "…the refusal left the register untouched");
  assert.deepEqual(await disposalEntries(client), [], "…and minted NO disposal entry — the remedy is named, not half-applied");

  // THE REMEDY, followed: run the named period. The month lands on the row that owes it.
  const remedy = await runAndSettle(client, mon(-1));
  assert.notEqual(remedy.mode, "noop", "the named remedy really charges the owed period");
  const lineage = await lineageLiveRanges(client, asset.id);
  noteLane(`x41.s2 the lineage's live charges after the remedy: ${lineage.map((r) => `${r.start}..${r.end}=${r.amount}`).join(" | ")}`);
  assert.equal((await runDue(client)).due, false, "…and nothing is owed once it has run");

  // …and NOW the disposal is lawful.
  const sold = await disposeAndSettle(w.users.alice, {
    client, asset: succId, disposalDate: dayIn(mon(-1), 20), proceedsCents: 50_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s2 sold",
  });
  assert.equal((await faRow(succId)).status, "disposed", "the disposal proceeds once the period is met");
  noteLane(`x41.s2 the disposal proposal landed as '${sold.mode}'`);

  // THE CONSEQUENCE PIN — drive whatever the leader sweep would drive next, then assert
  // the books. Under the defect the sweep credits the accumulated account for a lineage
  // the register no longer shows, and the tie breaks with no correction path.
  const drained = await drainDue(client);
  noteLane(`x41.s2 after the disposal the ladder ran ${drained.length} further period(s)`);
  assert.equal((await runDue(client)).due, false, "the ladder converges after the disposal");
  for (const [label, asOf] of [
    ["the disposal month end", mon(-1).end],
    ["after the disposal month", dayIn(mon(0), 1)],
  ]) {
    const tie = await faRegisterTie(w.users.alice, client, asOf);
    assert.equal(tie.tie, true, `fa_register_tie is GREEN at ${label} (${asOf}) — got ${JSON.stringify(tie.accounts ?? tie)}`);
    const rows = tieAccts(tie, COST);
    assert.ok(rows.length >= 1, `…and the enrolled cost account appears at ${label}`);
    assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0, `…cost difference EXACTLY zero at ${label}`);
    assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0,
      `…accumulated difference EXACTLY zero at ${label} — depreciation posted to the GL with no register row behind it is precisely what this cell exists to make impossible`);
    // `0 - x`, NEVER `-x`: after a disposal has relieved everything, both sides are zero,
    // and `-0` is a DIFFERENT value from `0` under strictEqual — a zero-vs-zero red would
    // be a cell bug wearing a books-defect costume. Subtraction from zero normalises it
    // while negating every non-zero figure exactly as before.
    assert.equal(tieSumBy(rows, /^register_accum/, "the tie register accumulated"), 0 - (await glNet(client, ACCUM, asOf)),
      `…and the register side equals the independently-summed GL accumulated legs at ${label}`);
  }
  // …AND NO CHARGE WAS LOST ON THE WAY. After a total disposal the accumulated account
  // NETS TO ZERO — the disposal debits back every sen the runs credited — so comparing the
  // lineage's live charges against the NET would pass vacuously on an empty register. The
  // two directions are therefore read separately: the credits are what the lineage charged,
  // and the debit is what the disposal relieved, and they are the same figure to the sen.
  const moved = (await rootQuery(
    `select coalesce(sum(l.credit_cents), 0)::bigint as credited,
            coalesce(sum(l.debit_cents), 0)::bigint as relieved
       from clara.journal_lines l join clara.journal_entries e on e.id = l.entry_id
      where l.client_id = $1 and l.account_code = $2 and e.status = 'approved'`,
    [client, ACCUM],
  )).rows[0];
  const charged = sumRanges(await lineageLiveRanges(client, asset.id));
  assert.ok(charged > 0, "mandatory cross-check: the lineage really carries live charges to account for");
  assert.equal(charged, Number(moved.credited),
    "the WHOLE lineage's live charges equal every sen the GL accumulated account was CREDITED");
  assert.equal(Number(moved.relieved), Number(moved.credited),
    "…and the disposal relieved exactly that much, to the sen — which is WHY the account nets to zero");
});

// ===========================================================================
// x41.s3 — THE APPROVE-TIME FRESHNESS FINGERPRINT COVERS THE ACCUMULATED LEG
//          (G1 tail): an ANCESTOR's act inside the maker-checker gap is stale.
// ===========================================================================

/** A lineage whose ROOT carries charges of its own and whose SUCCESSOR is disposable:
 *  buy big (so the disposal entry is high-stakes and DRAFTS for a distinct checker),
 *  charge two months on the root, revise prospectively, charge two months on the
 *  successor. Returns {client, root, successor, rootChargeEntry}. */
async function gapFixture(label) {
  const client = await freshFaClient(label);
  const start = mon(-4);
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1), memo: `x41 ${label}` });
  await completeSL(client, asset.id, { life: 48, start: start.start, description: `x41 ${label}` });
  await liveAuthority(client);
  const ramp = await earnRamp(client, start);
  await runAndSettle(client, mon(-3));
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-2).start,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: start.start },
  });
  const succId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(succId, "mandatory setup: the prospective revision minted a successor");
  await runAndSettle(client, mon(-2));
  await runAndSettle(client, mon(-1));
  assert.equal((await runDue(client)).due, false, "mandatory setup: the lineage owes nothing before the disposal");
  assert.ok((await liveRanges(asset.id)).length > 0, "…the ANCESTOR carries live charges of its own");
  return { client, root: asset.id, successor: succId, rootChargeEntry: ramp.entryId };
}

test("x41.s3 an ANCESTOR's act inside a drafted disposal's maker-checker gap makes the proposal STALE: the same disposal approves cleanly without it, and is refused disposal_stale with it", async (t) => {
  if (skipHere(t)) return;
  const disposalArgs = (client, asset) => ({
    client, asset, disposalDate: dayIn(mon(-1), 25), proceedsCents: 20_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s3 sold",
  });

  // ---- CONTROL. The identical proposal, approved with NOTHING happening in the gap,
  // must go through — otherwise the refusal below would prove nothing about freshness.
  const ctl = await gapFixture("s3ctl");
  const ctlReceipt = await disposeAsset(w.users.alice, { ...disposalArgs(ctl.client, ctl.successor), opKey: opk("x41s3ctl") });
  const ctlEntry = idOf(ctlReceipt, "entry_id", "id");
  assert.ok(ctlEntry, `dispose_fixed_asset names its entry (got ${JSON.stringify(ctlReceipt)})`);
  const ctlRow = await entryRowOf(ctlEntry);
  assert.equal(ctlRow.status, "draft",
    "mandatory setup: a high-stakes disposal DRAFTS for a distinct checker — that gap is the whole subject of this cell");
  await approveEntry(w.users.hana, { entry: ctlEntry, expectedRevision: ctlRow.revision_token, opKey: opk("x41s3ctlapr") });
  assert.equal((await faRow(ctl.successor)).status, "disposed",
    "the CONTROL approves cleanly: an untouched proposal is fresh and executes at approve");

  // ---- THE PIN. Same shape; in the gap, an ANCESTOR's charge is reversed. Nothing about
  // the disposed row itself changed — but the lineage read that produced the proposal's
  // accumulated relief, NBV and gain moved, so the frozen figures are no longer true.
  const g = await gapFixture("s3");
  const receipt = await disposeAsset(w.users.alice, { ...disposalArgs(g.client, g.successor), opKey: opk("x41s3") });
  const entry = idOf(receipt, "entry_id", "id");
  const row = await entryRowOf(entry);
  assert.equal(row.status, "draft", "mandatory setup: the proposal is parked for the checker");
  const accumBefore = -(await glNet(g.client, ACCUM));

  await reverseAndSettle(w.users.alice, {
    entry: g.rootChargeEntry, reason: "x41 s3 ancestor correction inside the gap", opKey: opk("x41s3gap"),
  });
  const accumAfter = -(await glNet(g.client, ACCUM));
  assert.notEqual(accumAfter, accumBefore,
    `mandatory setup: the ancestor's reversal really moved the lineage's accumulated depreciation (${accumBefore} → ${accumAfter})`);

  await refuses(() => approveEntry(w.users.hana, {
    entry, expectedRevision: row.revision_token, opKey: opk("x41s3apr"),
  }), T.disposalStale,
  "approving a disposal proposal whose lineage accumulated moved between draft and approve (an ANCESTOR's charge or reversal moves NBV and gain silently — the approve-time fingerprint must re-derive the accumulated leg, not only the stub)");
  assert.equal((await faRow(g.successor)).status, "active", "…and the refused approve executed NOTHING");
  assert.equal(-(await glNet(g.client, ACCUM)), accumAfter, "…leaving the GL exactly as the gap act left it");
  noteLane("x41.s3 the ancestor-in-the-gap disposal refused by name while the identical untouched proposal approved");
});
