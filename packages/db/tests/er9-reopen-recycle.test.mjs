// E-R9 SANDBOX ACCEPTANCE BATTERY — PART 2: the B3 half. The two segregation REFUSAL
// arms, the segregated reopen (an ends_on-dated prior-period adjustment), and the
// re-close that must make the books re-tie to the byte.
//
// This file builds and closes its OWN world in `before` (a test file is its own process,
// so no state crosses from part 1) and then walks D → E → F in order.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip, waveAEnsureReady,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, hasB3, caught, cleanCloseableFY, beginClose, finalizeClose, verifyClose,
  grantCapability, reopenFY, bookToday, RE1, REVN, EXPN,
} from "./x56-fixtures.mjs";
import {
  FY_START, FY_END, REV_CENTS, EXP_CENTS, PL_NET,
  getClosePlan, entryRow, lineRows, receiptRow, tbAt, fyStatus, eligibleCheckers,
  permitsFor, openItemCount, detailOf, isoDay,
} from "./er9-corpus-fixtures.mjs";

let ready = false, has56 = false, b3 = false, world = null, W = null;

function gate(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  if (!b3) { markSkip(); t.skip("B3 (0085/0086 ends_on reopen) not present"); return true; }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent — E-R9 reopen battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied — close model absent"); return; }
  b3 = await hasB3();
  if (!b3) { noteLane("B3 (0085/0086) NOT applied — the reopen half of the E-R9 corpus cannot run"); return; }
  world = await wb.buildWaveBWorld();
  W = await cleanCloseableFY(world.users.alice, {
    tag: "er9re", prepSub: world.users.bob,
    startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
  const begun = await beginClose(world.users.alice, { fy: W.fy });
  W.run = begun.close_run_id;
  const closed = await finalizeClose(world.users.alice, { fy: W.fy });
  W.receipt1 = closed.receipt_id;
  W.entry1 = closed.close_entry_id;
});
after(async () => {
  printLaneNotes("er9-reopen-recycle");
  printSkipCount("er9-reopen-recycle");
  await endPool();
});

// =====================================================================================
// PHASE D — THE REFUSAL ARMS, driven once each BEFORE the lawful reopen.
// =====================================================================================

test("R9.D1 REFUSAL — the human who SIGNED the close may not reverse it while the firm has >=2 eligible checkers: CLR05 distinct_checker, and NOTHING is written", async (t) => {
  if (gate(t)) return;
  assert.ok(await eligibleCheckers(world.firms.A) >= 2, "mandatory setup: >=2 eligible checkers, so the distinct-checker arm is live");
  assert.equal(W.receipt1 != null && W.entry1 != null, true, "mandatory setup: the year closed and minted a closing entry");

  const snap = async () => (await rootQuery(
    `select (select count(*)::int from clara.close_receipts      where fiscal_year_id=$1) as receipts,
            (select count(*)::int from clara.close_write_permits where fiscal_year_id=$1) as permits,
            (select count(*)::int from clara.journal_entries je
               join clara.fiscal_years fy on fy.id=$1
              where je.client_id=fy.client_id)                                            as entries,
            (select status      from clara.fiscal_years   where id=$1)                    as status,
            (select reversed_by from clara.journal_entries where id=$2)                   as reversed_by`,
    [W.fy, W.entry1])).rows[0];

  const before = await snap();
  assert.equal(before.status, "closed", "mandatory setup: the year stands closed before the attempt");

  const err = await caught(() => reopenFY(world.users.alice, {
    fy: W.fy, reason: "er9 rig: the closer attempts their own reversal",
    correctionTarget: { entry_ids: [W.revenueEntry] },
  }));
  assert.ok(err, "the closer's own reopen must refuse");
  assert.equal(err.code, "CLR05", `expected CLR05 (got ${err.code} — ${err.message})`);
  assert.equal(detailOf(err).reason, "distinct_checker");
  assert.match(err.message, /may not be reopened by the human who signed it/i, "the refusal names the rule in the caller's own terms");
  assert.match(err.message, /different eligible human/i, "and names the reachable remedy — a rule with no lawful path is a broken verb");

  assert.deepEqual(await snap(), before,
    "a refused reopen writes NOTHING — no receipt, no permit, no entry, no status flip, no linkage stamp");
});

test("R9.D2 REFUSAL — the SOLE eligible human closes and reverses only through recorded attestations: both arms refuse unattested by name, and the attestation lands on the entry row AND the receipt", async (t) => {
  if (gate(t)) return;
  const solo = world.users.erin;                    // firmS: erin alone
  assert.equal(await eligibleCheckers(world.firms.S), 1, "mandatory setup: the solo firm has exactly ONE eligible checker");

  const fx = await cleanCloseableFY(solo, {
    tag: "er9solo", prepSub: solo, startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
  await beginClose(solo, { fy: fx.fy });

  // ARM 1 — the solo CLOSE demands its self-attestation. This is the arm BEE's own close
  // takes: BELCORT's measured eligible_checker_count is 1.
  const noAttest = await caught(() => finalizeClose(solo, { fy: fx.fy, selfAttestation: null }));
  assert.ok(noAttest, "a solo firm may not close silently");
  assert.equal(noAttest.code, "CLR41", `expected CLR41 (got ${noAttest.code} — ${noAttest.message})`);
  assert.equal(detailOf(noAttest).reason, "close_self_attestation_required");

  const CLOSE_ATT = "er9 rig: sole practitioner, self-approved with this attestation on record";
  const closed = await finalizeClose(solo, { fy: fx.fy, selfAttestation: CLOSE_ATT });
  assert.equal(closed.segregation_mode, "solo_self_attested");
  assert.equal(Number(closed.pl_net_cents), PL_NET, "the solo close rolls the same loss");
  assert.equal((await receiptRow(closed.receipt_id)).self_attestation, CLOSE_ATT,
    "the close's self-attestation is on the permanent record verbatim");

  // ARM 2 — the solo REOPEN. Unattested refuses; the token is self_attestation.
  const err = await caught(() => reopenFY(solo, {
    fy: fx.fy, reason: "er9 rig: the sole human reverses their own close, unattested",
    correctionTarget: { entry_ids: [fx.revenueEntry] }, attestation: null,
  }));
  assert.ok(err, "the sole human's unattested self-reversal must refuse");
  assert.equal(err.code, "CLR05", `expected CLR05 (got ${err.code} — ${err.message})`);
  assert.equal(detailOf(err).reason, "self_attestation",
    "the SOLE-eligible self-reversal arm raises self_attestation — R9.D3 records why attestation_required is a different, belt-only arm");

  const REOPEN_ATT = "er9 rig: sole eligible human; I accept both sides of this reversal";
  const ok = await reopenFY(solo, {
    fy: fx.fy, reason: "er9 rig: the sole human reverses their own close, WITH the attestation",
    correctionTarget: { entry_ids: [fx.revenueEntry] }, attestation: REOPEN_ATT,
  });
  assert.equal(ok.segregation_mode, "solo_self_attested");
  assert.equal((await entryRow(ok.reversal_entry_id)).self_approval_attestation, REOPEN_ATT,
    "the attestation lands on the ENTRY row, where an approval's accountability lives");
  const rr = await receiptRow(ok.reopen_receipt_id);
  assert.equal(rr.self_attestation, REOPEN_ATT,
    "and on the reopen RECEIPT — the reopen's OWN determination, never the close's values copied forward");
  assert.equal(rr.segregation_mode, "solo_self_attested");
  assert.equal(rr.snapshot.segregation.attested, true);
  assert.equal(rr.snapshot.segregation.eligible_checker_count, 1);
  assert.equal(rr.snapshot.segregation.basis, "closing_entry_checker_or_receipt_signer");
  assert.equal(isoDay(ok.reversal_posting_date), FY_END, "the solo path backdates its adjustment exactly like the two-person one");
});

test("R9.D3 the attestation_required (ARM-0 orphan-adoption) arm is a BELT, not a reachable path — its precondition is an unsignable close, and close_receipts.closed_by is NOT NULL, proved from the catalog", async (t) => {
  if (gate(t)) return;
  // The arm fires only when the checked human resolves to NULL, and that is
  // coalesce(closing_entry.checker_actor, receipt.closed_by). If closed_by can never be
  // null, the arm is unreachable through the audited verbs — which is the honest thing to
  // record about it rather than claiming the battery "covered" it.
  const col = (await rootQuery(
    `select a.attnotnull from pg_attribute a
      where a.attrelid = 'clara.close_receipts'::regclass and a.attname = 'closed_by'`)).rows[0];
  assert.equal(col.attnotnull, true,
    "close_receipts.closed_by is NOT NULL, so coalesce(entry.checker_actor, receipt.closed_by) is never null through the verbs");

  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("attestation_required"), "the orphan-adoption belt is present in the DEPLOYED body");
  assert.ok(src.includes("no_eligible_human"), "and so is the stricter zero-eligible refusal above it");
  assert.ok(src.includes("distinct_checker") && src.includes("self_attestation"),
    "all four segregation tokens live in the one body — the wall is not spread across callers");
});

// =====================================================================================
// PHASE E — THE B3 REOPEN: a formal prior-period adjustment, dated the year's own end.
// =====================================================================================

test("R9.E1 a SEGREGATED reopen by a different eligible human lands: the receipt chain flips, the year reopens, and the payload names the reversal it actually made", async (t) => {
  if (gate(t)) return;
  await grantCapability(world.users.alice, {
    user: world.users.grace, capability: "reopen",
    reason: "er9 rig: a second eligible human holds key 3, so a signed close can lawfully be reversed",
  });
  const g = (await rootQuery(
    `select count(*)::int as n from clara.firm_capability_grants
      where user_id=$1 and capability='reopen' and revoked_at is null`, [world.users.grace])).rows[0].n;
  assert.equal(g, 1, "mandatory setup: grace holds exactly one live reopen grant");

  const re = await reopenFY(world.users.grace, {
    fy: W.fy, reason: "er9 rig: the January revenue invoice was coded to the wrong period and must be corrected",
    correctionTarget: { entry_ids: [W.revenueEntry] },
  });
  W.reopenReceipt = re.reopen_receipt_id;
  W.mirror = re.reversal_entry_id;
  assert.ok(W.reopenReceipt, "the reopen minted its receipt");
  assert.equal(re.reversed_entry_id, W.entry1, "the payload names the closing entry it reversed");
  assert.ok(W.mirror, "a year WITH a closing entry mints a reversal");
  assert.equal(isoDay(re.reversal_posting_date), FY_END, "the payload states the reversal's accounting date: the year's own end");
  assert.equal(re.reversal_basis, "prior_period_adjustment_at_fiscal_year_end",
    "the basis is STATED, not inferred — ADR-068 ruling 1 made readable on the record");
  assert.equal(re.segregation_mode, "two_person", "a different eligible human reversing is two accountable humans");
  assert.ok(re.reversal_permit_id, "the reversal names the permit that admitted it");

  assert.equal(await fyStatus(W.fy), "reopened");
  assert.equal((await receiptRow(W.receipt1)).status, "superseded", "the close receipt is superseded, never deleted");
  const rr = await receiptRow(W.reopenReceipt);
  assert.equal(rr.kind, "reopen");
  assert.equal(rr.status, "active");
  assert.equal(rr.closed_by, world.users.grace, "the reopen receipt records WHO reopened");
  assert.equal(rr.prior_close_receipt_id, W.receipt1, "and which receipt it chained from");
});

test("R9.E2 the MIRROR is an ends_on-dated prior-period adjustment: posted at the year end, APPROVED, line-for-line inverse at the original's own grain — while created_at/approved_at carry the REAL moment", async (t) => {
  if (gate(t)) return;
  const m = await entryRow(W.mirror);
  assert.equal(isoDay(m.posting_date), FY_END,
    "THE B3 RULING: the reversal is dated the reopened year's own ends_on, not today — no successor-year interim pollution");
  assert.equal(m.status, "approved",
    "the mirror is APPROVED, not left a draft — this is precisely the pre-B3 silent-no-op defect, dead");
  assert.equal(m.reversal_of, W.entry1, "the mirror names its original");
  assert.equal(m.origin, "reversal");
  assert.equal(m.is_year_end, true, "the mirror inherits the original's year-end character");
  assert.equal(m.maker_actor, world.users.grace);
  assert.equal(m.checker_actor, world.users.grace);
  assert.equal(m.self_approval_attestation, null,
    "a genuine two-person reopen keeps NO volunteered attestation — an attestation is kept only where it was required");
  assert.match(m.memo, /Prior-period adjustment/i, "the memo says what the entry IS");

  const today = await bookToday();
  assert.notEqual(today, FY_END, "mandatory setup: book-today differs from the year end, so the two clocks are distinguishable");
  assert.equal(isoDay(m.created_at), today, "created_at is the real moment of the act");
  assert.equal(isoDay(m.approved_at), today, "approved_at is the real moment of the act — only the ACCOUNTING date is backdated");

  const orig = await lineRows(W.entry1);
  const mir = await lineRows(W.mirror);
  assert.equal(mir.length, orig.length, "the mirror carries a line for EVERY original line — never a netted aggregate");
  for (let i = 0; i < orig.length; i++) {
    assert.equal(mir[i].line_no, orig[i].line_no, `line ${i + 1}: the grain is preserved`);
    assert.equal(mir[i].account_code, orig[i].account_code, `line ${i + 1}: same account`);
    assert.equal(Number(mir[i].debit_cents), Number(orig[i].credit_cents), `line ${i + 1}: debit mirrors the original credit`);
    assert.equal(Number(mir[i].credit_cents), Number(orig[i].debit_cents), `line ${i + 1}: credit mirrors the original debit`);
  }
  assert.equal(
    mir.reduce((a, l) => a + Number(l.debit_cents), 0),
    mir.reduce((a, l) => a + Number(l.credit_cents), 0), "the mirror balances");

  const o = await entryRow(W.entry1);
  assert.equal(o.reversed_by, W.mirror, "the original names its reversal");
  assert.match(o.reversal_reason, /^Reopen /, "the stamp records that a reopen did it");
  assert.equal(o.status, "approved", "the original stays approved — a reversal never rewrites history");
  assert.equal(await openItemCount(W.mirror), 0,
    "unwinding a P&L roll moves no subledger — the hook was called and its no-op proved");
});

test("R9.E3 the reopen's PERMIT: its own row, purpose reopen_reversal, bound to the pre-generated mirror by id, budget ONE, consumed once — the close's permit untouched", async (t) => {
  if (gate(t)) return;
  const permits = await permitsFor(W.fy);
  assert.equal(permits.length, 2, "one permit for the close, one for the reopen reversal — and no more");
  const rp = permits.find((p) => p.purpose === "reopen_reversal");
  const cp = permits.find((p) => p.purpose === "close_entry");
  assert.ok(rp, "the reopen permit exists");
  assert.equal(rp.target_entry_id, W.mirror, "the reopen permit NAMES the mirror — nothing else could ride it");
  assert.equal(Number(rp.entries_expected), 1, "budget of exactly one approved-class touch");
  assert.equal(Number(rp.entries_used), 1, "consumed exactly once by the census-visible flip");
  assert.equal(rp.close_run_id, W.run, "the reopen rides the close's own run for lineage");
  assert.equal(Number(cp.entries_used), 1, "the close's permit is unchanged — the reopen did not ride it");
  assert.equal(cp.target_entry_id, W.entry1);
});

test("R9.E4 the reopen RECEIPT records its OWN segregation determination — who was checked, under which mode, on what basis, and how many eligible humans existed at that moment", async (t) => {
  if (gate(t)) return;
  const rr = await receiptRow(W.reopenReceipt);
  assert.equal(rr.segregation_mode, "two_person");
  assert.equal(rr.last_preparer_actor, world.users.alice,
    "the human CHECKED is the one who signed the close — the reopen's determination, not the close's copied forward");
  assert.equal(rr.self_attestation, null, "no attestation is kept where none was required");
  const s = rr.snapshot.segregation;
  assert.equal(s.mode, "two_person");
  assert.equal(s.checked_actor, world.users.alice);
  assert.equal(s.attested, false);
  assert.equal(s.basis, "closing_entry_checker_or_receipt_signer");
  assert.ok(s.eligible_checker_count >= 2, `the count that licensed the two-person mode is recorded (got ${s.eligible_checker_count})`);
  assert.equal(rr.snapshot.reopened_by, world.users.grace);
  assert.equal(rr.snapshot.superseded_receipt_id, W.receipt1);
  assert.deepEqual(rr.snapshot.correction_target, { entry_ids: [W.revenueEntry] },
    "the correction target is on the permanent record — a reopen is never 'because we felt like it'");
  assert.equal(rr.snapshot.reversal_entry_id, W.mirror);
  assert.equal(isoDay(rr.snapshot.reversal_posting_date), FY_END);
  assert.equal(rr.snapshot.reversal_basis, "prior_period_adjustment_at_fiscal_year_end");
  assert.match(rr.snapshot.reason, /coded to the wrong period/, "the stated reason survives verbatim");
});

test("R9.E5 the books are genuinely UNWOUND, not silently no-op'd: the P&L is back at the year end, retained earnings is back to nil, nothing landed after the year, and the superseded receipt now FAILS its own verification", async (t) => {
  if (gate(t)) return;
  const tb = await tbAt(W.client, FY_END);
  assert.equal(tb.get(REVN) ?? 0, -REV_CENTS, "income is restored to its pre-close credit balance");
  assert.equal(tb.get(EXPN) ?? 0, EXP_CENTS, "expense is restored to its pre-close debit balance");
  assert.equal(tb.get(RE1) ?? 0, 0, "retained earnings is back to nil — the roll is undone");

  const later = (await rootQuery(
    `select count(*)::int as n from clara.journal_entries
      where client_id=$1 and posting_date > $2::date and (id=$3 or reversal_of=$4)`,
    [W.client, FY_END, W.mirror, W.entry1])).rows[0].n;
  assert.equal(later, 0, "no reopen-written entry is dated after the reopened year — the successor year's interim P&L is untouched");

  const v = await verifyClose(world.users.alice, { receipt: W.receipt1 });
  assert.equal(v.receipt_status, "superseded", "the caller can tell a superseded receipt from a live one");
  assert.equal(v.verified, false,
    "the superseded close receipt no longer verifies — proof the reversal MOVED the books (pre-B3 this stayed true, which was the bug)");
  assert.ok(v.strict.closing_position_diffs.length > 0, "the balance-sheet pin diverges from the reopened books");
  const reDiff = v.strict.closing_position_diffs.find((d) => d.account_code === RE1);
  assert.ok(reDiff, "and the divergence is NAMED on the retained-earnings account");
  assert.equal(Number(reDiff.pinned_cents), -PL_NET);
  assert.equal(Number(reDiff.recomputed_cents), 0);
  assert.ok(v.strict.pl_zero_diffs.length > 0, "and the P&L-zero probe now reports the restored balances");
});

test("R9.E6 get_close_plan on the reopened year tells the truth: the year reads 'reopened' and the close receipt is SHOWN, honestly labelled superseded, not made to look as if no close ever ran", async (t) => {
  if (gate(t)) return;
  const plan = await getClosePlan(world.users.alice, W.fy);
  assert.equal(plan.fiscal_year.status, "reopened");
  assert.equal(plan.receipt.state, "present", "the history is shown, not hidden");
  assert.equal(plan.receipt.receipt_id, W.receipt1);
  assert.equal(plan.receipt.status, "superseded", "and honestly labelled");
  assert.equal(plan.close_run.run_state, "finalized", "the finalized run is still the latest run for the year");
});

// =====================================================================================
// PHASE F — THE RE-CLOSE: the books must re-tie, to the byte.
// =====================================================================================

test("R9.F1 the re-close: a reopened year closes again, re-derives the SAME P&L from restored books, and mints a FRESH closing entry — segregated against the reopener this time", async (t) => {
  if (gate(t)) return;
  const begun = await beginClose(world.users.alice, { fy: W.fy });
  W.run2 = begun.close_run_id;
  assert.notEqual(W.run2, W.run, "a re-close mints a NEW run; the finalized one is history");
  assert.equal(await fyStatus(W.fy), "closing", "a reopened year takes the reopened→closing edge");

  const closed = await finalizeClose(world.users.alice, { fy: W.fy });
  W.receipt2 = closed.receipt_id;
  W.entry2 = closed.close_entry_id;
  assert.ok(W.entry2,
    "the re-close mints a REAL closing entry — pre-B3 the standing close had already zeroed the P&L and nothing minted");
  assert.notEqual(W.entry2, W.entry1, "and it is a fresh entry, not the old one revived");
  assert.equal(Number(closed.pl_net_cents), PL_NET, "the re-derived P&L is the SAME number: the year's economics did not change");
  assert.equal(closed.segregation_mode, "two_person");
  assert.equal((await receiptRow(W.receipt2)).last_preparer_actor, world.users.grace,
    "the re-close is segregated against the REOPENER, who is now the year's last human preparer");

  const e2 = await entryRow(W.entry2);
  assert.equal(isoDay(e2.posting_date), FY_END);
  assert.equal(e2.is_year_end, true);
  assert.equal(e2.close_receipt_id, W.receipt2);
  const l2 = await lineRows(W.entry2);
  const l1 = await lineRows(W.entry1);
  assert.equal(l2.length, l1.length, "the fresh closing entry has the same shape as the original");
  for (let i = 0; i < l1.length; i++) {
    assert.equal(l2[i].account_code, l1[i].account_code, `re-close line ${i + 1}: same account`);
    assert.equal(Number(l2[i].debit_cents), Number(l1[i].debit_cents), `re-close line ${i + 1}: same debit`);
    assert.equal(Number(l2[i].credit_cents), Number(l1[i].credit_cents), `re-close line ${i + 1}: same credit`);
  }
});

test("R9.F2 THE BOOKS RE-TIE: the re-close's pinned position is byte-identical to the first close's — same closing_position, same closing_tb_digest, same dataset_sha256 — and the fresh receipt verifies", async (t) => {
  if (gate(t)) return;
  const r1 = await receiptRow(W.receipt1);
  const r2 = await receiptRow(W.receipt2);
  assert.deepEqual(r2.snapshot.closing_position, r1.snapshot.closing_position,
    "the balance-sheet position after the re-close equals the position after the first close, account for account");
  assert.equal(r2.closing_tb_digest, r1.closing_tb_digest, "the TB digest is identical");
  assert.equal(r2.dataset_sha256, r1.dataset_sha256, "and so is the sha256 the sealed-artifact pin leans on");
  assert.equal(Number(r2.pl_net_cents), Number(r1.pl_net_cents));
  assert.equal(r2.retained_earnings_account, r1.retained_earnings_account);
  assert.equal(r2.status, "active", "the new close receipt is the live one");
  assert.equal(r2.prior_close_receipt_id, null, "a first fiscal year still chains from nothing, re-close or not");

  const v = await verifyClose(world.users.alice, { receipt: W.receipt2 });
  assert.equal(v.verified, true, `the re-closed year verifies from a fresh recompute (strict=${JSON.stringify(v.strict)})`);
  assert.deepEqual(v.strict.closing_position_diffs, []);
  assert.deepEqual(v.strict.pl_zero_diffs, []);

  const tb = await tbAt(W.client, FY_END);
  assert.equal(tb.get(REVN) ?? 0, 0, "income is zeroed again");
  assert.equal(tb.get(EXPN) ?? 0, 0, "expense is zeroed again");
  assert.equal(tb.get(RE1) ?? 0, -PL_NET, "retained earnings carries the year's result again, to the cent");
});

test("R9.F3 the re-close SETTLES the reopen: the reopen receipt is superseded and the new close receipt NAMES it — while the prior-period adjustment stays on the books permanently", async (t) => {
  if (gate(t)) return;
  assert.equal((await receiptRow(W.reopenReceipt)).status, "superseded", "the reopen receipt is settled by the re-close");
  assert.deepEqual((await receiptRow(W.receipt2)).snapshot.superseded_reopen_receipt_ids, [W.reopenReceipt],
    "and the new close receipt records exactly which reopen assertion it settled");

  const rows = (await rootQuery(
    `select kind, status, count(*)::int as n from clara.close_receipts
      where fiscal_year_id=$1 group by 1,2 order by 1,2`, [W.fy])).rows;
  const activeClose = rows.find((x) => x.kind === "close" && x.status === "active");
  assert.equal(activeClose.n, 1, "exactly ONE active close receipt per fiscal year (the partial unique index)");
  assert.equal(rows.find((x) => x.kind === "reopen" && x.status === "active"), undefined,
    "no reopen receipt stands active once the year is closed again");
  assert.equal(rows.filter((x) => x.kind === "close").reduce((a, x) => a + x.n, 0), 2,
    "both close receipts survive — the superseded one is history, not a deletion");

  assert.equal(await fyStatus(W.fy), "closed");
  assert.equal((await entryRow(W.mirror)).status, "approved",
    "the prior-period adjustment stays on the books permanently — history, never a rollback");
  const trail = (await rootQuery(
    `select count(*)::int as n from clara.journal_entries
      where client_id=$1 and is_year_end and posting_date=$2::date`, [W.client, FY_END])).rows[0].n;
  assert.equal(trail, 3, "close entry + its reversal + the re-close entry all stand at the year end, readable as one story");
});
