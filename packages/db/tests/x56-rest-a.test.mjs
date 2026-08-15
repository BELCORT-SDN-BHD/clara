// 0056 (Wave E lane beta, the close model) rig -- PART 5: the role/capability floor
// (A10), the key-3 reopen split (A11), and the reopen mechanics (A5, A5b). None of
// these touch attest_close_exception (DEFECT 4, reported separately -- see the
// SendMessage record): every close here is a CLEAN close, no drawer-2 attestation.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG, never
// by reading 0056_wave_e_close_model.sql. (0056's live prosrc IS read here for MY
// OWN authorial grounding of assertion shapes -- CLR codes, detail reason tokens,
// column names -- per the established x55/x56 practice; the test bodies below never
// cite file text as an assertion's basis.)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, hasB3, reopenSig, reopenerFor, caught, cleanCloseableFY, freshActiveClient, beginClose, finalizeClose,
  reopenFY, grantCapability, revokeCapability, plainEntry, BANK1, addDaysStr,
  proposeFY, openFY,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 rest-a suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-a"); printSkipCount("x56-rest-a"); await endPool(); });

// ===========================================================================
// A10 -- the role/capability floor: a bookkeeper with no capability grant is
// refused close; the SAME actor's key-1 prepare acts succeed (right-answer half).
// ===========================================================================

test("A10 a bookkeeper-rank actor with no grant is refused close (capability floor); the same actor's prepare acts SUCCEED", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const bookkeeper = world.users.bob; // firm A bookkeeper, no capability grant in this file
  const client = await freshActiveClient(owner, "a10");

  // Right-answer half FIRST: bob's key-1 prepare (draft + approve) succeeds plainly --
  // a bookkeeper who cannot even prepare would make the floor meaningless.
  const { setupCloseCoa } = await import("./x56-fixtures.mjs");
  await setupCloseCoa(owner, client);
  const proposal = await proposeFY(owner, { client, startsOn: "2027-01-01" });
  const opened = await openFY(owner, { client, label: "A10 FY1", startsOn: "2027-01-01", endsOn: proposal.ends_on });
  const fy = opened.fiscal_year_id;
  const entry = await plainEntry(bookkeeper, { client, debit: BANK1, credit: "684-C56", cents: 10_000, postingDate: "2027-06-01", memo: "x56 a10 bookkeeper prepare" });
  assert.ok(entry, "mandatory setup: a bookkeeper's own draft+approve succeeds (prepare is key 1, not gated by close_and_attest)");

  // The floor: bob attempts begin_close with NO capability grant.
  const err = await caught(() => beginClose(bookkeeper, { fy, opKey: opk("x56-a10-close") }));
  assert.ok(err, "a bookkeeper with no close_and_attest grant must be refused close");
  assert.equal(err.code, "CLR04", `expected CLR04 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "capability_missing");
  assert.equal(det.capability, "close_and_attest");

  // The owner (auto-holds every capability per _has_capability's own-role branch) can.
  const begun = await beginClose(owner, { fy, opKey: opk("x56-a10-owner-close") });
  assert.ok(begun.close_run_id, "the owner's close begins where the bookkeeper's was refused");
});

// ===========================================================================
// A11 -- key 3 (reopen) is its own grantable capability, distinct from key 2:
// a bookkeeper is refused reopen until explicitly granted; the grant and the
// revoke are each their own audited act.
// ===========================================================================

test("A11 reopen (key 3) is separately grantable: refused before the grant, succeeds after; grant and revoke are each audited", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const bookkeeper = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a11", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });

  // First: bob (bookkeeper, no 'reopen' grant) is refused.
  const err1 = await caught(() => reopenFY(bookkeeper, {
    fy: fx.fy, reason: "x56 a11 pre-grant reopen attempt", correctionTarget: { entry_ids: [fx.revenueEntry] },
  }));
  assert.ok(err1, "reopen must refuse before any grant exists");
  assert.equal(err1.code, "CLR04", `expected CLR04 (got ${err1.code} -- ${err1.message})`);
  const det1 = JSON.parse(err1.detail ?? "{}");
  assert.equal(det1.reason, "capability_missing");
  assert.equal(det1.capability, "reopen");

  // The grant: an audited act (actor, timestamp), only the owner may make it.
  const nonOwnerGrant = await caught(() => grantCapability(bookkeeper, { user: bookkeeper, capability: "reopen", reason: "x56 a11 self-grant attempt" }));
  assert.ok(nonOwnerGrant, "a non-owner may not grant capabilities to anyone, even themselves");
  assert.equal(nonOwnerGrant.code, "CLR04");

  await grantCapability(owner, { user: bookkeeper, capability: "reopen", reason: "x56 a11: bob takes key 3 for this cell" });
  const grantRow = (await rootQuery(
    "select granted_by, granted_at, revoked_at from clara.firm_capability_grants where user_id=$1 and capability='reopen' order by granted_at desc limit 1",
    [bookkeeper],
  )).rows[0];
  assert.equal(grantRow.granted_by, owner, "the grant records the granting actor");
  assert.ok(grantRow.granted_at, "the grant records a timestamp");
  assert.equal(grantRow.revoked_at, null, "freshly granted, not revoked");

  // Second: bob, now granted, succeeds.
  const reopened = await reopenFY(bookkeeper, {
    fy: fx.fy, reason: "x56 a11 post-grant reopen succeeds", correctionTarget: { entry_ids: [fx.revenueEntry] },
  });
  assert.ok(reopened.reopen_receipt_id, "the granted bookkeeper's reopen succeeds and mints a receipt");

  // The revoke: also its own audited act.
  await revokeCapability(owner, { user: bookkeeper, capability: "reopen", reason: "x56 a11: cell cleanup" });
  const revokedRow = (await rootQuery(
    "select revoked_at from clara.firm_capability_grants where id=(select id from clara.firm_capability_grants where user_id=$1 and capability='reopen' order by granted_at desc limit 1)",
    [bookkeeper],
  )).rows[0];
  assert.ok(revokedRow.revoked_at, "the revoke stamps revoked_at");

  // A close/approve-class capability list mutable by anyone but the owner is a FAIL --
  // bob (now revoked, and never an owner) cannot re-grant himself either.
  const selfRegrant = await caught(() => grantCapability(bookkeeper, { user: bookkeeper, capability: "reopen", reason: "x56 a11 re-self-grant" }));
  assert.ok(selfRegrant, "revocation is not a loophole for self-regranting");
  assert.equal(selfRegrant.code, "CLR04");
});

// ===========================================================================
// A5 -- the ordering guard: a closed FY(n)'s entry cannot be reversed directly;
// reopen (with a stated reason + a named, resolvable correction target) mints a
// reopen receipt. FY(n+1) exists and is OPEN (never closing/closed) -- reopen's
// OWN "no later FY closing/closed" guard is a different, narrower rule (A5b's
// concern), not this cell's.
// ===========================================================================

test("A5 a closed FY(n) entry cannot be reversed directly (ordering guard refuses); reopen with a named target mints a reopen receipt", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a5", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });

  // FY(n+1): opened normally, OPEN (never closing/closed) -- "close live" reads as
  // "the close model is active for this client", not "the successor is itself mid-close".
  const nextStart = addDaysStr(fx.endsOn, 1);
  const nextProposal = await proposeFY(owner, { client: fx.client, startsOn: nextStart });
  await openFY(owner, { client: fx.client, label: "A5 FY2", startsOn: nextStart, endsOn: nextProposal.ends_on });

  // Direct reversal of an FY(n) entry: refused by the wall, same token A19a proved on
  // approve_entry -- here proved on the sibling writer, reverse_entry.
  const err = await caught(() => humanQuery(owner, "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r", [fx.revenueEntry, "x56 a5 direct reversal attempt", opk("x56-a5-direct-rev")]));
  assert.ok(err, "a closed FY(n) entry must refuse a direct reversal");
  assert.equal(err.code, "CLR19", `expected CLR19 (got ${err.code} -- ${err.message})`);

  // Reopen: stated reason, named correction target resolving to a real entry of this
  // client -- mints a reopen receipt (right answer).
  // [B3] a close is reversed by a DIFFERENT eligible human than the one who signed it.
  const a5Reopener = await reopenerFor(owner, { closer: owner, alternate: world.users.hana });
  const reopened = await reopenFY(a5Reopener, {
    fy: fx.fy, reason: "x56 a5: correcting the FY1 revenue entry via the audited reopen path",
    correctionTarget: { entry_ids: [fx.revenueEntry] },
  });
  assert.ok(reopened.reopen_receipt_id, "reopen with a named target mints a receipt");
  const receiptRow = (await rootQuery(
    "select kind, fiscal_year_id, status from clara.close_receipts where id=$1",
    [reopened.reopen_receipt_id],
  )).rows[0];
  assert.equal(receiptRow.kind, "reopen");
  assert.equal(receiptRow.fiscal_year_id, fx.fy);
  assert.equal(receiptRow.status, "active");

  // Negative: a reopen with NO correction target is refused -- "a reopen that records
  // no correction target is a FAIL" (matrix A5's own negative case).
  const fx2 = await cleanCloseableFY(owner, { tag: "a5-notarget", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx2.fy });
  await finalizeClose(owner, { fy: fx2.fy });
  const errNoTarget = await caught(() => reopenFY(a5Reopener, { fy: fx2.fy, reason: "x56 a5 no target on purpose", correctionTarget: {} }));
  assert.ok(errNoTarget, "a reopen with a correction target resolving to nothing auditable is refused");
  assert.equal(errNoTarget.code, "CLR10");
});

// ===========================================================================
// A5b -- the reopen's EFFECT ORDER is required, not incidental, and B3
// (ADR-068 ruling 1) INVERTED which order that is. Pre-B3: the FY status
// leaves 'closed' BEFORE reverse_entry stamps the closing entry, because the
// wall would refuse the stamp otherwise. Post-B3: the ends_on-dated reversal
// lands FIRST, while the year is still closed, admitted by the target-bound
// permit -- and the flip follows it. Read the live body's textual order and a
// behavioural probe, on whichever frontier is live.
// ===========================================================================

test("A5b reopen_fiscal_year's effect order, per frontier: pre-B3 the FY flips BEFORE reverse_entry; post-B3 the ends_on-dated mirror lands FIRST under the permit and the flip follows", async (t) => {
  if (skip56(t)) return;
  const b3 = await hasB3();
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a5b", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const closeEntryId = closed.close_entry_id;
  assert.ok(closeEntryId, "mandatory setup: the close minted its own closing entry (non-empty P&L)");

  // Structural: the live body's own statement order.
  const bodyRow = (await rootQuery(
    `select pg_get_functiondef('${await reopenSig()}'::regprocedure) as def`,
  )).rows[0];
  const body = bodyRow.def;
  const flipIdx = body.search(/status\s*=\s*'reopened'/i);
  const reverseIdx = body.indexOf("clara.reverse_entry(");
  assert.ok(flipIdx >= 0, "the body sets fiscal_years.status = 'reopened' somewhere");
  if (!b3) {
    assert.ok(reverseIdx >= 0, "the body calls clara.reverse_entry somewhere");
    assert.ok(flipIdx < reverseIdx, "the status flip is textually BEFORE the reverse_entry call -- the order the wall requires");
  } else {
    assert.equal(reverseIdx, -1, "post-B3 the reopen no longer routes through reverse_entry at all -- the never-backdate law for TRANSACTIONS keeps that body untouched, so the period machinery gets its own writer instead of a parameter on the generic one");
    const mirrorFlipIdx = body.search(/status\s*=\s*'approved',\s*approved_at\s*=\s*now\(\)/);
    const stampIdx = body.indexOf("reversed_by = v_mirror");
    assert.ok(mirrorFlipIdx >= 0, "the body performs its own census-visible approve of the mirror");
    assert.ok(stampIdx >= 0, "the body stamps the original's reversal linkage itself");
    assert.ok(mirrorFlipIdx < flipIdx, "the mirror's approve is textually BEFORE the status flip -- if it were not, the year would already be open and the permit would stop being what admits the backdated write");
    assert.ok(stampIdx > flipIdx, "the original's linkage stamp is AFTER the flip -- giving the permit a second unit to cover it would widen it from one named entry to two");
  }

  // Behavioural: BEFORE any reopen, the closing entry's protected row cannot be
  // touched directly. NOTE (measured, not assumed): the closing entry is high-
  // stakes (is_year_end=true), so a FULL reverse_entry() call on it takes its own
  // silent draft-mirror branch and never itself touches the original row's
  // reversed_by/status -- meaning a direct call to the VERB would not exercise
  // t_period_wall here at all. The faithful probe is therefore the exact raw write
  // reverse_entry's non-high-stakes branch WOULD perform (same technique A13c used
  // for reopen's own acquisition order): a direct UPDATE of reversed_by on the
  // already-approved row. MEASURED result: this trips a DIFFERENT, earlier-firing
  // guard first -- _tf_entry_immutable's CLR08 ("approved entries permit only a
  // complete reversal-linkage pair"), not t_period_wall's CLR19 -- both legitimate,
  // defense-in-depth walls over the same protected write; the run states which one
  // actually fired rather than asserting the predicted one.
  // rootQuery (superuser), not humanQuery: clara_authenticated holds no direct UPDATE
  // grant on journal_entries at all (writes go through audited functions only) --
  // 42501 there would prove nothing about either wall. Triggers fire for every
  // role, including superuser (that is precisely why forceControlMismatch,
  // elsewhere in this rig, must explicitly DISABLE a trigger before its own
  // root-role insert) -- so a root UPDATE is a faithful probe of the triggers.
  const preErr = await caught(() => rootQuery("update clara.journal_entries set reversed_by = gen_random_uuid() where id = $1", [closeEntryId]));
  assert.ok(preErr, "the closing entry's protected row cannot be touched directly, before any reopen");
  assert.equal(preErr.code, "CLR08", `measured: CLR08 (entry-immutability) fires before the period wall gets to evaluate this specific write (got ${preErr.code} -- ${preErr.message})`);

  // The real reopen: succeeds. PRE-B3 its reverse_entry call took the high-stakes
  // draft-mirror branch (the closing entry's is_year_end propagates to the mirror),
  // so what landed was a fresh, correctly-linked DRAFT reversal, today-dated, with
  // the original never stamped. POST-B3 the mirror is APPROVED at the year end and
  // the original carries its linkage. Read what actually happened, not what was assumed.
  const a5bReopener = await reopenerFor(owner, { closer: owner, alternate: world.users.hana });
  const reopened = await reopenFY(a5bReopener, {
    fy: fx.fy, reason: "x56 a5b: reopen to correct the closing entry itself",
    correctionTarget: { entry_ids: [closeEntryId] },
  });
  assert.ok(reopened.reopen_receipt_id, "the reopen succeeds");
  const mirrorRow = (await rootQuery(
    "select id, status, reversal_of, is_year_end, posting_date::text as posting_date from clara.journal_entries where reversal_of=$1",
    [closeEntryId],
  )).rows[0];
  assert.ok(mirrorRow, "the reopen minted a correctly-linked mirror entry");
  assert.equal(mirrorRow.is_year_end, true, "the mirror inherits is_year_end from the closing entry");
  const origRow = (await rootQuery(
    "select reversed_by from clara.journal_entries where id=$1", [closeEntryId])).rows[0];
  if (!b3) {
    assert.equal(mirrorRow.status, "draft", "measured: a high-stakes reversal mirror is left DRAFT even when reached through reopen -- a human must still approve it");
    assert.equal(origRow.reversed_by, null, "measured: the draft branch never stamps the original");
  } else {
    assert.equal(mirrorRow.status, "approved", "post-B3 the reopen approves its own reversal in-body under the reopen capability, exactly as finalize_close approves the closing entry it mints");
    assert.equal(mirrorRow.posting_date, fx.endsOn, "the reversal is DATED the reopened year's ends_on -- a formal prior-period adjustment placed in its own period");
    assert.equal(origRow.reversed_by, mirrorRow.id, "the original closing entry carries its reversal linkage, naming the ends_on-dated mirror");
    assert.equal(reopened.reversal_entry_id, mirrorRow.id, "the receipt payload names the reversal entry it minted");
  }
  assert.equal(reopened.reversed_entry_id, closeEntryId, "the reopen names the closing entry as what it reversed");
  const fyRow = (await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fyRow.status, "reopened");
});
