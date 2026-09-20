// #972 [0247] — THE FIXED-ASSET ACQUISITION BIRTH HONOURS THE ENROLMENT WATERMARK ON EVERY
// FIRING, NOT ONLY AT THE FIRST APPROVE.
//
//   p972.law     the applied law, read off the CATALOG: the live birth body carries the belt's
//                own watermark expression exactly once, 0216's watermark-FREE join is gone, and
//                the trigger is still the deferred insert-or-update constraint trigger whose
//                re-firing is the whole mechanism. This cell is the VACUITY ANCHOR for the two
//                behaviour cells below: revert the body and it reddens first.
//   p972.retro   THE DEFECT, at the door seam. An entry approved BEFORE its account was enrolled
//                births nothing at approve, nothing at enrolment (§1.2) and — this is what 0247
//                adds — nothing when it is REVERSED, although `clara.reverse_entry` leaves the
//                original 'approved' and so re-fires the birth trigger on it. Proven twice: on
//                the register itself, and through `clara.fa_register_tie`, the production
//                instrument `x41.s4` drives, at `x41.s4`'s own three as-ofs, classified by
//                `x41.s4`'s own `isRed`/`isExplained`.
//   p972.refire  THE OTHER SIDE, so the fix cannot be a silent narrowing: a POST-watermark
//                acquisition still births at approve, and its own `reversed_by` re-fire still
//                finds its row through the same `on conflict (acquisition_line_id) do nothing`
//                — one row, never a twin, and 'unwound' by the reversal hook.
//   p972.source  THE ASSUMPTION THE PREDICATE RESTS ON, driven rather than assumed: the
//                watermark's first operand can never be NULL on a row this trigger fires for,
//                because `clara._tf_entry_immutable` refuses an approval that carries no
//                `approved_at` and then refuses to null it again. The `created_at` fallback is
//                belt-and-braces, and it is the tie's fallback, not a clock.
//
// WHY A SEPARATE BATTERY AND NOT ONLY x41.b3. `x41.b3` owns the watermark law and #972 extends it
// to look at the register after the reversal (that assertion is the ticket's AC2 and lives there).
// What it cannot own is the TIE reading — x41.b3 builds an `x41_…` client, and the sweep that
// reads those clients holds every explained difference to a list pinned at one entry. This battery
// builds `p972_…` clients outside that scope and measures them with the sweep's own instruments.
//
// Fixture clients are built OUTSIDE the x41 family on purpose — see
// fa-birth-watermark-fixtures.mjs's header.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate972, p972Client, birthBodySource, WATERMARK_EXPR, WATERMARK_FREE_JOIN,
  TIE_PRE_ENROLMENT_EXPR, NULL_APPROVED_AT_UPDATE, FA_BIRTH_WATERMARK_STEM,
  rootQuery, opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  faWorld, faRows, faRow, entryRowOf, approvedEntry, buyAsset, reverseEntry, upsertFaProfile,
  faRegisterTie, caught, mon, dayIn, COST, ACCUM, EXPENSE, BANK,
} from "./fa-birth-watermark-fixtures.mjs";
import { sweepAccountRows, isRed, isExplained } from "./x41-round35-helpers.mjs";
import { S5_25_BARE_TOKEN_RE } from "./x42-s5-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("fa-birth-watermark");
  printSkipCount("fa-birth-watermark");
  await endPool();
});

/** Rig readiness first (the x41 world), then 0247's own frontier. */
const shut = async (t) => (skip41(t, live, "the #972 birth-watermark battery") ? true : await gate972(t));

// ===========================================================================================
// p972.law — THE APPLIED LAW, OFF THE CATALOG.
// ===========================================================================================

test("p972.law 0247 applied: the birth body carries the tie's own watermark expression exactly once and reads NO session clock, 0216's watermark-free join is gone, and t_je_fa_acquisition_birth is still the deferred insert-or-update constraint trigger whose re-fire is the mechanism", async (t) => {
  if (await shut(t)) return;

  const mig = await rootQuery(
    "select version from clara.schema_migrations where version ~ $1", [FA_BIRTH_WATERMARK_STEM]);
  assert.equal(mig.rows.length, 1,
    `exactly one applied ${FA_BIRTH_WATERMARK_STEM} migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  const src = await birthBodySource();
  const occurrences = (hay, needle) => hay.split(needle).length - 1;
  assert.equal(occurrences(src, WATERMARK_EXPR), 1,
    `clara._tf_fa_acquisition_birth carries the watermark "${WATERMARK_EXPR}" exactly once`);
  assert.equal(occurrences(src, WATERMARK_FREE_JOIN), 0,
    "…and 0216's watermark-FREE join is gone — a vacuous replace cannot green this cell");

  // NO SESSION CLOCK, and the detector is the estate's OWN: x42's S5.25 arm (D) regex, imported
  // rather than restated. The birth's question is about the ENTRY ("was it approved before the
  // account was enrolled?"), and an answer that consults the clock of whatever transaction
  // happens to re-fire the trigger answers a different question: on a reversal that clock is the
  // REVERSING transaction's, always at or after enrolment, which is precisely the retroactive
  // birth 0247 exists to forbid. Arm (D)'s roster says the same in prose
  // (x42-s5-helpers.mjs, FA_ACQUISITION_0216_CLOCK_NAMES: this body "takes its dates from the
  // entry it fires for"), and x42.r7.s5c.5 / x42.s5c.6 re-derive it from the live catalog.
  const clock = await rootQuery(
    "select p.prosrc ~* $1 as reads_clock from pg_proc p "
    + "where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure", [S5_25_BARE_TOKEN_RE]);
  assert.equal(clock.rows[0].reads_clock, false,
    "clara._tf_fa_acquisition_birth reads NO bare clock token — the property x42's arm (D) roster "
    + "pins for this body, and the one 0247 must not spend to install a watermark");

  // THE COMPLEMENT, IN THE INSTRUMENT THAT AUDITS THE REGISTER. clara.fa_register_tie decides
  // which GL movement is pre-enrolment with coalesce(approved_at, created_at) < enrolled_at; the
  // birth now admits exactly its negation. Two instruments that disagree about which entries are
  // in scope is the defect class 0247 closes, and the tie — not the belt — is the instrument
  // x41.s4 reads, so it is the one the birth must agree with.
  const tie = (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = 'clara.fa_register_tie(uuid,date)'::regprocedure",
  )).rows[0].src;
  assert.equal(occurrences(tie, TIE_PRE_ENROLMENT_EXPR), 2,
    `clara.fa_register_tie still tests pre-enrolment as "${TIE_PRE_ENROLMENT_EXPR}", once per column `
    + "(0041:4367 cost, :4376 accumulated) — the expression the birth's watermark negates");

  const trg = await rootQuery(
    `select pg_get_triggerdef(t.oid) as def, t.tgdeferrable, t.tginitdeferred
       from pg_trigger t
      where t.tgrelid = 'clara.journal_entries'::regclass
        and t.tgname = 't_je_fa_acquisition_birth' and not t.tgisinternal`);
  assert.equal(trg.rows.length, 1, "exactly one t_je_fa_acquisition_birth on clara.journal_entries");
  assert.ok(trg.rows[0].tgdeferrable && trg.rows[0].tginitdeferred,
    "…still DEFERRABLE INITIALLY DEFERRED (0216 §B)");
  assert.match(trg.rows[0].def, /AFTER INSERT OR UPDATE/,
    "…still fires on INSERT OR UPDATE — the UPDATE half is what re-fires it on a reversal");
  assert.match(trg.rows[0].def, /WHEN \(\(new\.status = 'approved'::text\)\)/,
    "…still gated on the approved STATE, which is why a reversed_by stamp re-fires it at all");
});

// ===========================================================================================
// p972.retro — THE DEFECT, AT THE DOOR SEAM.
// ===========================================================================================

const COST_CENTS = 77_000;

test("p972.retro an entry approved BEFORE the account was enrolled births no register row at approve, none at enrolment, and — 0247 — none when it is reversed, although the reversal leaves the original approved and re-fires the birth trigger on it", async (t) => {
  if (await shut(t)) return;

  const client = await p972Client("retro", { enrol: false });
  const historic = await approvedEntry(w.users.alice, {
    client, memo: "p972 pre-enrolment purchase", postingDate: dayIn(mon(-3), 8),
    lines: [
      { account_code: COST, debit_cents: COST_CENTS, credit_cents: 0, description: "old machine" },
      { account_code: BANK, debit_cents: 0, credit_cents: COST_CENTS, description: "paid" },
    ],
  });
  assert.equal((await faRows(client)).length, 0, "no register row exists before enrolment");

  await upsertFaProfile(w.users.alice, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  const before = (await faRows(client)).length;
  assert.equal(before, 0, "enrolling an account WITH history births NOTHING retroactively (0041 §1.2)");

  await reverseEntry(w.users.alice, { entry: historic, reason: "p972 watermark", opKey: opk("p972rev") });

  // AC1: identical before and after. The reversal is recorded by `reversed_by` with the original
  // left 'approved' (the house reversal law), which is exactly what re-fires the birth trigger.
  assert.equal((await faRows(client)).length, before,
    "the register row count is IDENTICAL before and after the reversal — the watermark holds on the re-fire");
  const rev = await entryRowOf(historic);
  assert.ok(rev.reversed_by, "a PRE-ENROLMENT entry on a now-enrolled account is still reversible");
  assert.equal(rev.status, "approved", "…and the reversed ORIGINAL stays 'approved' (the house reversal law)");

  // …and the same fact read through the PRODUCTION instrument x41.s4 drives, at x41.s4's own
  // three as-ofs, classified by x41.s4's own law. The two earlier as-ofs sit before the mirror's
  // posting date, where the GL honestly carries pre-enrolment cost the register can never hold:
  // a difference the tie's own pre-enrolment column explains in full. The settled as-of is past
  // the mirror, where nothing is left to explain.
  const asOfs = [mon(-1).end, dayIn(mon(0), 1), dayIn(mon(1), 28)];
  const settled = asOfs[asOfs.length - 1];
  for (const asOf of asOfs) {
    const tie = await faRegisterTie(w.users.alice, client, asOf);
    const rows = sweepAccountRows([{ client, client_name: "p972", tie }]);
    const unexplained = rows.filter((r) => isRed(r) && !isExplained(r));
    assert.deepEqual(unexplained.map((r) => ({
      account: r.account, cost_diff: r.costDiff, accum_diff: r.accumDiff,
      pre_cost: r.preCost, pre_accum: r.preAccum,
    })), [],
    `at as_of ${asOf} the tie reports ZERO unexplained differences — every difference is exactly offset by its own pre-enrolment column (this is the measurement x41.s4 makes, and the +${COST_CENTS} the retroactive birth used to plant here is what made it unexplained)`);
    for (const r of rows) {
      assert.equal(r.raw.register_cost_cents, 0,
        `at as_of ${asOf} the register holds NO cost on ${r.account} — §1.2 forbids the retroactive birth`);
    }
    if (asOf === settled) {
      assert.equal(tie.tie, true, `at the settled as_of ${asOf} the client TIES outright`);
      for (const r of rows) {
        assert.equal(r.costDiff, 0, `at ${asOf} the cost difference on ${r.account} is zero: the GL has been reversed out and the register never held anything`);
        assert.equal(r.accumDiff, 0, `at ${asOf} the accumulated difference on ${r.account} is zero`);
      }
    }
  }
  noteLane(`p972.retro: a ${COST_CENTS}-cent pre-enrolment purchase, enrolled afterwards and then reversed, left the register EMPTY and the tie unexplained-free at all three of x41.s4's as-ofs`);
});

// ===========================================================================================
// p972.refire — THE OTHER SIDE: 0247 NARROWS THE JOIN, IT DOES NOT CLOSE THE LANE.
// ===========================================================================================

test("p972.refire a POST-watermark acquisition still births at approve, and its own reversed_by re-fire still finds that row through the same conflict target — one register row, never a twin, unwound by the reversal", async (t) => {
  if (await shut(t)) return;

  const client = await p972Client("refire");
  const { entry, asset } = await buyAsset({ client, cents: 44_000, postingDate: dayIn(mon(-2), 6) });
  assert.equal((await faRows(client)).length, 1,
    "an acquisition approved AFTER enrolment still births exactly one register row (0216 §B / 0041 arm 4)");

  await reverseEntry(w.users.alice, { entry, reason: "p972 refire", opKey: opk("p972ref") });

  // The re-fire is IN scope here (approved_at >= enrolled_at), reaches the insert, and is absorbed
  // by `on conflict (acquisition_line_id) do nothing` — exactly as before 0247. A twin would mean
  // the conflict target broke; a missing row would mean 0247 narrowed the lane 0216 opened.
  const rows = await faRows(client);
  assert.equal(rows.length, 1, "the reversal's re-fire births NO twin — the conflict target still absorbs it");
  assert.equal((await faRow(asset.id)).status, "unwound", "…and the acquisition reversal unwound the row it found");
  assert.ok((await entryRowOf(entry)).reversed_by, "the ORIGINAL entry's own reversed_by update landed");
});

// ===========================================================================================
// p972.source — WHAT THE WATERMARK READS CAN NEVER BE NULL, AND THE FALLBACK IS NOT A CLOCK.
// ===========================================================================================

test("p972.source the watermark's first operand can never be NULL on a row this trigger fires for: clara._tf_entry_immutable refuses an approval without approved_at and refuses to null it afterwards, so 0247's created_at fallback is belt-and-braces rather than load-bearing", async (t) => {
  if (await shut(t)) return;

  // THE TRIGGER ONLY EVER FIRES ON AN APPROVED ROW. Both fixed-asset constraint triggers are
  // gated `when (new.status = 'approved')`; the birth's own gate is re-read in p972.law.
  const client = await p972Client("source");
  const { entry } = await buyAsset({ client, cents: 21_000, postingDate: dayIn(mon(-2), 9) });
  const row = await entryRowOf(entry);
  assert.equal(row.status, "approved", "mandatory setup: an approved acquisition entry");
  assert.ok(row.approved_at, "…and the approve door stamped approved_at, as it must");

  // ARM 1 — IT CANNOT BE UN-STAMPED. The approved->approved arm of clara._tf_entry_immutable
  // allows exactly reversed_by / reversal_reason / updated_at; a complete reversal-linkage pair
  // that ALSO nulls approved_at is refused CLR08, so no supported or unsupported UPDATE can
  // leave an approved entry without the instant 0247's watermark reads.
  const err = await caught(() => rootQuery(NULL_APPROVED_AT_UPDATE, [entry]));
  assert.ok(err, "nulling approved_at on an approved entry is REFUSED, not silently accepted");
  assert.equal(err.code, "CLR08",
    `…by clara._tf_entry_immutable's own allow-list (got ${err.code}: ${err.message})`);
  assert.ok((await entryRowOf(entry)).approved_at, "…and the stamp is still there afterwards");

  // ARM 2 — IT CANNOT BE ABSENT AT APPROVAL EITHER. The draft->approved arm of the same trigger
  // refuses the transition outright when new.approved_at is null. Read off the CATALOG, because
  // no door can be persuaded to attempt an approval without the stamp: every approve writer
  // sets `approved_at = now()` in the same statement (0004:549 and its successors).
  const imm = (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = 'clara._tf_entry_immutable()'::regprocedure",
  )).rows[0].src;
  assert.match(imm, /new\.approved_at is null/,
    "clara._tf_entry_immutable's draft->approved arm still refuses an approval with no approved_at");
  assert.match(imm, /illegal approval transition/,
    "…and it refuses it by that name");

  // …SO THE FALLBACK IS NEVER REACHED, and it is still the right one to carry: created_at is the
  // ENTRY's own instant (NOT NULL, defaulted by the column), never the clock of whatever
  // transaction happens to re-fire this trigger.
  const col = await rootQuery(
    `select is_nullable, column_default from information_schema.columns
      where table_schema = 'clara' and table_name = 'journal_entries' and column_name = 'created_at'`);
  assert.equal(col.rows[0].is_nullable, "NO",
    "clara.journal_entries.created_at is NOT NULL, so the watermark can never be NULL on either operand");
  noteLane("p972.source: approved_at cannot be nulled on an approved entry (CLR08) and cannot be "
    + "absent at approval, and created_at is NOT NULL — 0247's watermark has no NULL branch to "
    + "reach, and no clock to fall back on");
});
