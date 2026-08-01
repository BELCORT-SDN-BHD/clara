// 0041 Wave D-a — the ROUND-3 fix-ledger battery, part D: fa_register_tie AS AN
// INSTRUMENT (fix ledger F9).
//
// The tie is the wave's assertion instrument. A tie that reads RED while the books are
// right is not a safe instrument — a firm that hits one stops trusting the green ones.
// Each cell here is a state where the register and the GL HONESTLY differ (or do not
// differ at all) and the tie must EXPLAIN it rather than just going red:
//
//   x41.r1  the GL is summed per ASSET ACCOUNT exactly once, never once per
//           (asset, accum) PAIR — so re-pointing the accumulated account cannot
//           manufacture a permanent false break.
//   x41.r2  a K carry-down row still behind a DRAFT opening entry is a PENDING
//           advisory, not a difference.
//   x41.r3  pre-enrolment GL history on an enrolled account is EXPLAINED by its own
//           column: register + pre-watermark movement = the GL, exactly.
//   x41.r4  an as-of earlier than a carried row's baseline_as_of is FLAGGED
//           (`before_baseline`), never silently answered.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers). The
// explained-column key NAMES are discovered by meaning and recorded as lane notes —
// the VALUES are asserted to the sen.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41, caught,
  COST, ACCUM, ACCUM2, EXPENSE, EXPENSE2, BANK, mon, dayIn,
  faRegisterTie, upsertFaProfile, faWorld, faRow, entryRowOf, glNet,
  freshFaClient, buyAsset, approvedEntry, completeSL, kSeededFaClient,
  tieAccts, tieSumBy, numKey, anyKey,
} from "./x41-round3-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round3-tie");
  printSkipCount("x41-round3-tie");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3 tie-instrument battery");

/** Every key of the tie payload (top level + account rows) flattened for a flag search. */
const tieBlob = (tie) => JSON.stringify(tie ?? {});

// ===========================================================================
// x41.r1 — THE GL IS SUMMED PER ASSET ACCOUNT EXACTLY ONCE.
// ===========================================================================

test("x41.r1 re-pointing the accumulated account never manufactures a false break: the GL cost is summed per ASSET ACCOUNT once, not once per (asset, accum) pair", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("r1");
  const { asset } = await buyAsset({ client, cents: 200_000, postingDate: dayIn(mon(-2), 5), memo: "x41 r1" });
  await completeSL(client, asset.id, { life: 24, start: mon(-2).start, description: "x41 r1" });
  const asOf = dayIn(mon(-1), 20);

  const before = await faRegisterTie(w.users.alice, client, asOf);
  assert.equal(before.tie, true, "mandatory setup: the register ties before the profile is re-pointed");
  assert.equal(await glNet(client, COST, asOf), 200_000, "…and the GL carries exactly one acquisition");

  // The register row keeps the OLD accumulated code (register rows are immutable), so the
  // client now has TWO (asset, accum) pairs over ONE asset account.
  await upsertFaProfile(w.users.alice, {
    client, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2,
  });
  assert.equal((await faRow(asset.id)).accum_depr_account_code, ACCUM,
    "mandatory setup: the existing register row still names the ORIGINAL accumulated code");

  const after = await faRegisterTie(w.users.alice, client, asOf);
  const rows = tieAccts(after, COST);
  noteLane(`x41.r1 the tie reports ${rows.length} row(s) for ${COST} after the accumulated account was re-pointed`);
  assert.equal(tieSumBy(rows, /^gl_cost/, "the tie GL cost"), 200_000,
    "the GL cost on the asset account is counted ONCE across the tie's rows — comparing the FULL GL balance against each partitioned pair is the false-break shape (F9)");
  assert.equal(tieSumBy(rows, /^register_cost/, "the tie register cost"), 200_000,
    "…and the register side still sums to the same cost");
  assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0, "…so the difference is EXACTLY zero");
  assert.equal(after.tie, true,
    `fa_register_tie stays GREEN while the books are right (got ${tieBlob(after).slice(0, 400)})`);
});

// ===========================================================================
// x41.r2 — A PENDING CARRY-DOWN IS AN ADVISORY, NOT A DIFFERENCE.
// ===========================================================================

test("x41.r2 a carry-down row still behind a DRAFT opening entry is reported as a PENDING advisory, never as a register-vs-GL difference", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("r2", { approveSeed: false });
  const row = await faRow(k.assetId);
  assert.equal(row.status, "pending", `mandatory setup: the carry-down row is 'pending' (got '${row.status}')`);
  assert.equal((await entryRowOf(k.faEntryId)).status, "draft",
    "mandatory setup: its opening entry is still a DRAFT, so the GL carries nothing for it");

  const asOf = dayIn(mon(-1), 15);
  assert.equal(await glNet(k.client, COST, asOf), 0, "…the GL really is empty on the cost account");
  const tie = await faRegisterTie(w.users.alice, k.client, asOf);
  const rows = tieAccts(tie, COST);
  assert.ok(rows.length >= 1, "the enrolled cost account appears in the tie");

  assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0,
    "a 'pending' row whose opening entry is a DRAFT is EXCLUDED from the difference — a firm with any parked carry-down draft would otherwise read permanently red, masking real breaks (F9)");
  assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0, "…on both sides of the comparison");
  assert.equal(tie.tie, true, `…and the tie itself is GREEN (got ${tieBlob(tie).slice(0, 400)})`);

  // …but it is NOT invisible: the instrument reports it as a pending advisory count.
  const pending = numKey(tie, /pending/) ?? numKey(rows[0], /pending/);
  assert.ok(pending, `the tie reports a PENDING advisory count (top-level keys: ${Object.keys(tie).join(", ")}; account keys: ${Object.keys(rows[0]).join(", ")})`);
  assert.ok(pending.value >= 1, `…and it counts this row (got ${pending.key}=${pending.value})`);
  noteLane(`x41.r2 the pending advisory is projected as '${pending.key}' = ${pending.value}`);
});

// ===========================================================================
// x41.r3 — PRE-ENROLMENT GL HISTORY IS EXPLAINED, NOT JUST RED.
// ===========================================================================

test("x41.r3 pre-enrolment GL history on an enrolled account is EXPLAINED by its own column: register cost + pre-watermark movement equals the GL exactly", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("r3", { enrol: false });
  // Approved history on the account BEFORE anyone enrols it. §1.2's watermark means
  // nothing births retroactively (the x41 upgrade drill asserts exactly that), so this
  // GL movement can never acquire a register row — and there is no back-fill door.
  const histEntry = await approvedEntry(w.users.alice, {
    client, memo: "x41 r3 pre-enrolment purchase", postingDate: dayIn(mon(-3), 5),
    lines: [
      { account_code: COST, debit_cents: 750_000, credit_cents: 0, description: "pre-enrolment asset" },
      { account_code: BANK, debit_cents: 0, credit_cents: 750_000, description: "paid" },
    ],
  });
  assert.ok(histEntry, "mandatory setup: the pre-enrolment entry approved (no profile exists yet, so no belt applies)");

  await upsertFaProfile(w.users.alice, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  const { asset } = await buyAsset({ client, cents: 250_000, postingDate: dayIn(mon(-2), 4), memo: "x41 r3 post-enrolment" });
  await completeSL(client, asset.id, { life: 25, start: mon(-2).start, description: "x41 r3" });

  const asOf = dayIn(mon(-1), 20);
  const glCost = await glNet(client, COST, asOf);
  assert.equal(glCost, 1_000_000, "mandatory setup: the GL carries the pre-enrolment 750,000 plus the post-enrolment 250,000");

  const tie = await faRegisterTie(w.users.alice, client, asOf);
  const rows = tieAccts(tie, COST);
  const registerCost = tieSumBy(rows, /^register_cost/, "the tie register cost");
  assert.equal(registerCost, 250_000, "the register holds ONLY what was born after the enrolment watermark");
  const preHit = rows.map((r) => numKey(r, /(pre|before).*(enrol|watermark)/i)).find(Boolean);
  assert.ok(preHit,
    `the tie carries a THIRD per-account column reporting GL movement from entries approved BEFORE enrolled_at (F9) — account keys: ${Object.keys(rows[0]).join(", ")}`);
  const preTotal = tieSumBy(rows, /(pre|before).*(enrol|watermark)/i, "the tie pre-enrolment movement");
  noteLane(`x41.r3 the pre-enrolment movement column is projected as '${preHit.key}' = ${preTotal}`);
  assert.equal(preTotal, 750_000,
    "…reporting the pre-watermark movement to the sen, so a WD-R14 ceremony can SEE why the account differs");
  assert.equal(registerCost + preTotal, glCost,
    "…and the GL is FULLY EXPLAINED: register cost + pre-watermark history = the GL, leaving no unexplained residue");
  noteLane(`x41.r3 with the history explained, fa_register_tie reported tie=${JSON.stringify(tie.tie)}`);
});

// ===========================================================================
// x41.r4 — BEFORE-BASELINE IS FLAGGED, NEVER SILENTLY ANSWERED.
// ===========================================================================

test("x41.r4 an as-of earlier than a carried row's baseline_as_of is FLAGGED (before_baseline) rather than silently answered, and a later as-of is unflagged", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("r4");
  const baseline = k.baselineAsOf;
  const earlier = dayIn(mon(-12), 1); // between the historical acquisition and the baseline
  assert.ok(earlier < baseline, `mandatory setup: ${earlier} really is before the carry-down baseline ${baseline}`);

  // Either shape closes the minor honestly: a NAMED refusal, or an answer that carries
  // the flag. What is forbidden is a plausible-looking silent answer (full cost, zero
  // accumulated) that a professional would read as a real break.
  let tie = null;
  const err = await caught(async () => { tie = await faRegisterTie(w.users.alice, k.client, earlier); });
  if (err) {
    const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
    assert.ok(/before_baseline|baseline/i.test(blob),
      `an as-of before the baseline is refused BY NAME (got code=${err.code} — ${err.message})`);
    noteLane(`x41.r4 fa_register_tie REFUSES an as-of before baseline_as_of: ${err.message}`);
    return;
  }
  assert.ok(/before_baseline/.test(tieBlob(tie)),
    `the answer carries the before_baseline flag (got ${tieBlob(tie).slice(0, 500)})`);
  const rows = tieAccts(tie, COST);
  const flagged = anyKey(tie, /before_baseline/)?.value === true
    || rows.some((r) => anyKey(r, /before_baseline/)?.value === true);
  assert.ok(flagged, `…and the flag is TRUE at this as-of (got ${tieBlob(tie).slice(0, 500)})`);
  noteLane(`x41.r4 before_baseline flagged at as_of ${earlier} (baseline ${baseline})`);

  // …and it is not stuck on: a later as-of, where the baseline is behind us, is unflagged.
  const later = await faRegisterTie(w.users.alice, k.client, dayIn(mon(-1), 10));
  const laterRows = tieAccts(later, COST);
  const laterFlag = anyKey(later, /before_baseline/)?.value === true
    || laterRows.some((r) => anyKey(r, /before_baseline/)?.value === true);
  assert.equal(laterFlag, false,
    `an as-of AFTER the baseline is not flagged (got ${tieBlob(later).slice(0, 500)})`);
  assert.equal(tieSumBy(laterRows, /^cost_diff/, "the tie cost difference"), 0,
    "…and the carried register ties to the GL there, exactly");
});
