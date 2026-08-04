// WAVE D-b SPLIT — DRILL 3 of 4: 0044 `wave_d_b3_af2_composite` DEPLOY-ONTO-EXISTING.
//
// D-b3's OWN deploy risk (census §6): it WIDENS a live, populated table. `clara.bank_matches`
// carries 74 rows on the real project; the slice adds `pending_resolution` (+ its CHECK) and
// `resolution_exception_id` (+ its FK and a SET-ONCE trigger) to it, and it re-creates four
// 0040 live bodies in place (`_tf_bank_settled_authority_belt`, `complete_pending_match`,
// `get_bank_reconciliation`, `unmatch_bank_match` — the seven-site parked admission). A widened
// column that backfills anything, or a re-created core that changes a pre-existing match's
// status, is money-visible. So this drill deploys onto a book carrying BOTH a live and a
// high-stakes PENDING match and asserts both are byte-untouched afterwards.
//
// REGRESSION FLOOR: D-b0's and D-b1's whole post-states are re-asserted here (census §6).
//
// SECOND CELL — THE CEREMONY ORDER. This is also the file that carries the split's standing
// proof that applying a slice OUT OF ORDER is refused by name and atomically (0044 onto a
// 0042-only database), because 0044 is the slice whose SECTION S4 calls its predecessor's
// bodies. See the cell's own header at the foot of this file.
//
// RESET-GATED (drops schema clara) — run ALONE, its own CI step, its own throwaway DB:
//   PGDATABASE=clara_x42_b3_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     CLARA_RIG_DB=1 node --test tests/x42-0044-b3-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { endPool, printLaneNotes, noteLane, rootQuery, humanQuery, namedCall, opk } from "./x41-fa-world.mjs";
import {
  MIG_DIR, skipUnlessReset, freshDb, buildPre0042Book, exportChain,
  assertB0Floor, assertB1Floor, assertB3Floor, assertNoLaterSliceObjects, assertPreExistingSurfacesStillWork,
  tableExists, columnExists, appliedCount, strippedDef, matchRow,
  BANKCOA1, EXPN,
} from "./x42-split-upgrade-kit.mjs";

after(async () => { printLaneNotes("x42-0044-b3-upgrade"); await endPool(); });

test("D-b3 upgrade drill: 0042→0043→0044 lands on a populated book — bank_matches is WIDENED without backfilling or restatusing a single pre-existing row, the four re-created 0040 cores keep working, the reopen event registers, D-b2 ships nothing, and the AF-2 composite really resolves a pre-existing OPEN exception", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  assert.equal(await appliedCount("^0041_"), 1, "the drill starts with 0041 applied");
  assert.equal(await appliedCount("^004[2-9]_"), 0, "…and NO D-b slice applied");
  assert.equal(await columnExists("bank_matches", "pending_resolution"), false, "the drill really starts pre-widening");

  const h = await buildPre0042Book();
  const matchesBefore = (await rootQuery(
    "select id, status, origin, created_at, completed_at from clara.bank_matches order by id")).rows;
  assert.ok(matchesBefore.length >= 2, "mandatory setup: the pre-apply book really carries bank matches (live + pending)");
  const jeBefore = Number((await rootQuery("select count(*)::int as n from clara.journal_entries")).rows[0].n);

  // ===================== THE APPLY (the whole chain through this slice) =====================
  await migrate({ dir: MIG_DIR, log: () => {} });
  for (const v of ["^0042_", "^0043_", "^0044_"]) {
    assert.equal(await appliedCount(v), 1, `${v} applied onto the populated book`);
  }

  // (a)+(b) the regression floor — D-b0 and D-b1 still whole.
  await assertB0Floor();
  await assertB1Floor();
  // (c) D-b3's own post-state, including the two pre-existing matches' untouched columns.
  await assertB3Floor(h);

  // (d) THE WIDENING BACKFILLED NOTHING, on EVERY pre-existing row — not merely the two the
  //     drill happens to name. This is the claim that scales to the 74 real rows.
  const after = (await rootQuery(
    "select id, status, origin, created_at, completed_at, pending_resolution, resolution_exception_id from clara.bank_matches order by id")).rows;
  assert.equal(after.length, matchesBefore.length, "0044 minted no bank_matches rows of its own");
  for (let i = 0; i < after.length; i++) {
    assert.equal(after[i].id, matchesBefore[i].id, "…the row set is identical");
    assert.equal(after[i].status, matchesBefore[i].status, `match ${after[i].id}: status is untouched by the widening`);
    assert.equal(after[i].origin, matchesBefore[i].origin, `match ${after[i].id}: origin is untouched`);
    assert.equal(String(after[i].created_at), String(matchesBefore[i].created_at), `match ${after[i].id}: created_at is untouched`);
    assert.equal(String(after[i].completed_at), String(matchesBefore[i].completed_at), `match ${after[i].id}: completed_at is untouched`);
    assert.equal(after[i].pending_resolution, null, `match ${after[i].id}: pending_resolution lands NULL`);
    assert.equal(after[i].resolution_exception_id, null, `match ${after[i].id}: resolution_exception_id lands NULL`);
  }
  const arv = (await rootQuery("select count(*)::int as total, count(auto_reversal_of)::int as nonnull from clara.journal_entries")).rows[0];
  assert.equal(Number(arv.total), jeBefore, "0044 minted no journal entries of its own");
  assert.equal(Number(arv.nonnull), 0, "auto_reversal_of is still 100% NULL — D-b2 is its first writer");

  // (e) THE FOUR RE-CREATED 0040 CORES really are this slice's, and they carry the parked
  //     admission. Measured on the COMMENT-STRIPPED body (E19) so a split note cannot fake it.
  for (const fn of ["_tf_bank_settled_authority_belt", "complete_pending_match", "unmatch_bank_match", "get_bank_reconciliation"]) {
    const def = await strippedDef(fn);
    assert.ok(def, `clara.${fn} still exists after the re-create`);
  }
  const flip = await strippedDef("complete_pending_match");
  assert.ok(/pending_resolution/.test(flip), "the flip guard reads the parked declaration — the seven-site admission landed");

  // (f) THE SPLIT'S OWN CLAIM: D-b2 shipped nothing.
  await assertNoLaterSliceObjects({ advances: false, af2: false, adjustments: true });
  assert.equal(await appliedCount("^004[5-9]_"), 0, "…and no later slice recorded itself as applied");

  // (g) pre-existing behaviour intact — the four re-created cores did NOT break the ordinary doors.
  await assertPreExistingSurfacesStillWork(h, "D-b3");

  // (h) HEADLINE SMOKE: the AF-2 composite resolves the OPEN exception the book already carried
  //     BEFORE the slice existed — the whole point of the composite, driven end-to-end.
  //     h.exceptionId is a -900 debit line, so the booking debits an expense and credits the bank.
  const receipt = (await humanQuery(h.sub, namedCall("resolve_and_book_bank_line", [
    { name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
    { name: "p_draft", cast: "jsonb" }, { name: "p_op_key" },
  ]), [h.client, h.exceptionId, "matched_booking", "u44 drill: the pre-existing exception is resolved",
    JSON.stringify({
      posting_date: "2033-01-15", memo: "u44 drill booking",
      lines: [
        { account_code: EXPN, debit_cents: 900, credit_cents: 0, description: "sundry expense" },
        { account_code: BANKCOA1, debit_cents: 0, credit_cents: 900, description: "out of the bank" },
      ],
    }), opk("u44resolve")])).rows[0].result;
  assert.ok(receipt, "the composite answers on the upgraded book");
  assert.equal((await rootQuery("select status from clara.bank_line_exceptions where id=$1", [h.exceptionId])).rows[0].status,
    "resolved", "…and the exception that pre-dated the slice is now resolved");
  const resolvedMatch = (await rootQuery(
    "select id, resolution_exception_id from clara.bank_matches where resolution_exception_id=$1", [h.exceptionId])).rows;
  assert.equal(resolvedMatch.length, 1, "…exactly one match carries the resolution_exception_id back-pointer");
  assert.equal((await matchRow(resolvedMatch[0].id)).status, "live", "…and it is live");
  noteLane("D-b3 drill: the AF-2 composite resolves an exception that pre-dates the slice, on a book that pre-dates the slice");
});

// ===========================================================================
// THE CEREMONY-ORDER CELL [cross-lens F8]. The four slices ship DAYS APART onto a live
// database, by hand, in the order D-b0 → D-b1 → D-b3 → D-b2. Under a four-part ceremony the
// single likeliest operator error is applying the WRONG ONE NEXT — and the mechanism that
// refuses it lives inside each slice's own probe 1, not in the migration runner (the runner is
// happy: 0044 is numerically ABOVE the frontier, so nothing about the file order is wrong).
// That mechanism was probed once, by hand, and re-proved by no drill, no contract and no CI leg.
// This cell is its standing proof, at the one boundary where it is load-bearing: SECTION S4 of
// 0044 CALLS four D-b1 bodies, so 0044 onto a D-b0-only database must refuse BY NAME rather
// than fail somewhere deep in a regprocedure cast — and must leave the database untouched.
// ===========================================================================

test("D-b3 upgrade drill (ceremony-order side): 0044 applied onto a 0042-ONLY database is REFUSED BY NAME and atomically — the ship order is enforced by the slice, not assumed of the operator", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  // Stage the D-b0 frontier ONLY — the state the live database is genuinely in on day one.
  await migrate({ dir: exportChain((n) => n >= 1 && n <= 42, "b0only"), log: () => {} });
  assert.equal(await appliedCount("^0042_"), 1, "mandatory setup: the database is at the D-b0 frontier");
  assert.equal(await appliedCount("^0043_"), 0, "mandatory setup: D-b1 has NOT been applied");
  assert.equal(await tableExists("staff_advances"), false, "mandatory setup: …and its register really is absent");

  // Now offer the operator's mistake: 0044 next, with 0043 skipped. The runner accepts the
  // file (0044 > 0042, nothing is out of numeric order); 0044's own probe 1 must refuse.
  await assert.rejects(
    () => migrate({ dir: exportChain((n) => (n >= 1 && n <= 42) || n === 44, "skip43"), log: () => {} }),
    /0043_wave_d_b1_staff_advances is not recorded as applied/,
    "0044 refuses a database that never took D-b1, naming the missing migration",
  );

  // ATOMIC: nothing of D-b3 landed.
  assert.equal(await appliedCount("^0044_"), 0, "…and 0044 is not recorded as applied");
  assert.equal(await columnExists("bank_matches", "pending_resolution"), false, "…the bank_matches widening rolled back whole");
  assert.equal(await columnExists("bank_matches", "resolution_exception_id"), false, "…both new columns are gone");
  assert.equal(await appliedCount("^0042_"), 1, "…and the D-b0 frontier the database really is at is untouched");
  noteLane("D-b3 ceremony-order verified: 0044 onto a 0042-only database is refused by name (0043 missing), atomically");
});
