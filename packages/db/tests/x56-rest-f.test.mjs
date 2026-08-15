// 0056 (Wave E lane beta, the close model) rig -- PART 10: the R1.5 scoped-round
// fix-batch addendum (d366870). Cell 3 -- reopen's newest-first ordering guard was
// a TOCTOU (a concurrent finalize_close(FY n+1) could commit between the early
// check and the 004/007 acquisition); the fix re-runs the SAME predicate under the
// lock pair. Cell 4 -- the receipt uniqueness partial index + the fiscal-year
// lifecycle transition-graph trigger, both structural+behavioral.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG
// (reopen_fiscal_year's and _tf_fiscal_years_lifecycle's live bodies ARE read for
// MY OWN authorial grounding, per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, getPool,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, reopenSig, reopenerFor, caught, cleanCloseableFY, beginClose, finalizeClose,
  reopenFY, addDaysStr, proposeFY, openFY,
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
  if (!ready) { noteLane("0011 surface absent -- x56 rest-f suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-f"); printSkipCount("x56-rest-f"); await endPool(); });

// ===========================================================================
// CELL 3 -- reopen's ordering guard, RE-RUN under the lock (R1.5 MAJOR, the fix
// for a TOCTOU). Discharge shape = the A13c precedent: structural (the ordering
// predicate's live text appears TWICE, and the second occurrence sits AFTER both
// pg_advisory_xact_lock acquisitions and the v_fy re-read) + behavioral (the
// ordinary sequential case still refuses/admits correctly). A true concurrent
// interleaving repro would need a mid-function pause this rig cannot install --
// the structural half is the honest discharge for the race itself, per your call.
// ===========================================================================

test("reopen ordering guard structural: the same predicate appears TWICE, the second occurrence AFTER both advisory locks and the v_fy re-read", async (t) => {
  if (skip56(t)) return;
  const bodyRaw = (await rootQuery(
    `select pg_get_functiondef('${await reopenSig()}'::regprocedure) as def`,
  )).rows[0].def;
  const body = bodyRaw.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const predicateRe = /later\.ordinal\s*>\s*v_fy\.ordinal[\s\S]{0,80}status\s+in\s*\(\s*'closing'\s*,\s*'closed'\s*\)/gi;
  const matches = [...body.matchAll(predicateRe)];
  assert.equal(matches.length, 2, `the ordering predicate (comments stripped) appears exactly twice (found ${matches.length})`);

  const firstLockIdx = body.search(/pg_advisory_xact_lock\(\s*203005004/i);
  const secondLockIdx = body.search(/pg_advisory_xact_lock\(\s*203005007/i);
  const vFyRereadIdx = body.indexOf("select * into v_fy from clara.fiscal_years fy where fy.id = p_fy", firstLockIdx);
  assert.ok(firstLockIdx >= 0 && secondLockIdx >= 0 && vFyRereadIdx >= 0, "mandatory: both lock acquisitions and the post-lock v_fy re-read are all present");
  assert.ok(firstLockIdx < secondLockIdx, "004 is acquired before 007 (the house order)");
  assert.ok(secondLockIdx < vFyRereadIdx, "007 is acquired before the v_fy re-read");
  const secondPredicateIdx = matches[1].index;
  assert.ok(vFyRereadIdx < secondPredicateIdx, "the SECOND ordering-predicate occurrence sits AFTER the post-lock v_fy re-read -- it is the authoritative, re-checked guard, not a duplicate of the early one");
  const firstPredicateIdx = matches[0].index;
  assert.ok(firstPredicateIdx < firstLockIdx, "the FIRST occurrence (the fast, friendly refusal) sits BEFORE either lock is taken");
});

test("reopen ordering guard behavioral: the ordinary sequential case still refuses/admits correctly (FY1 blocked by closed FY2; FY2 reopens cleanly newest-first)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const fx1 = await cleanCloseableFY(owner, { tag: "reopenord1", prepSub: drafter, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx1.fy });
  await finalizeClose(owner, { fy: fx1.fy });

  const nextStart = addDaysStr(fx1.endsOn, 1);
  const proposal2 = await proposeFY(owner, { client: fx1.client, startsOn: nextStart });
  const opened2 = await openFY(owner, { client: fx1.client, label: "reopenord FY2", startsOn: nextStart, endsOn: proposal2.ends_on });
  const midYear2 = addDaysStr(nextStart, 90);
  const { plainEntry, BANK1, REVN, EXPN } = await import("./x56-fixtures.mjs");
  await plainEntry(drafter, { client: fx1.client, debit: BANK1, credit: REVN, cents: 300_000, postingDate: midYear2, memo: "x56 reopenord FY2 revenue" });
  await plainEntry(drafter, { client: fx1.client, debit: EXPN, credit: BANK1, cents: 100_000, postingDate: midYear2, memo: "x56 reopenord FY2 expense" });
  await beginClose(owner, { fy: opened2.fiscal_year_id });
  await finalizeClose(owner, { fy: opened2.fiscal_year_id });

  // [B3] a close is reversed by a DIFFERENT eligible human than its signer; owner closed both
  // years here, so every reopen below runs as the second capability holder. The ORDERING guard
  // this cell is about is unaffected -- it fires before the segregation determination.
  const ordReopener = await reopenerFor(owner, { closer: owner, alternate: drafter });
  // FY1 first: refused -- FY2 (later, closed) is in the way.
  const err = await caught(() => reopenFY(ordReopener, {
    fy: fx1.fy, reason: "x56 reopenord: attempt FY1 out of order",
    correctionTarget: { entry_ids: [fx1.revenueEntry] },
  }));
  assert.ok(err, "reopening FY1 while FY2 is closed must refuse");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "reopen_ordering_violation");

  // FY2 first (the newest): admitted -- no later FY stands in the way.
  const reopened2 = await reopenFY(ordReopener, {
    fy: opened2.fiscal_year_id, reason: "x56 reopenord: FY2 reopens newest-first, correctly",
    correctionTarget: { entry_ids: [fx1.revenueEntry] },
  });
  assert.ok(reopened2.reopen_receipt_id, "FY2 (the newest closed year) reopens successfully");

  // NOW FY1 admits too -- FY2 is 'reopened', not 'closing'/'closed', so it no
  // longer blocks.
  const reopened1 = await reopenFY(ordReopener, {
    fy: fx1.fy, reason: "x56 reopenord: FY1 now reopens, FY2 no longer blocks it",
    correctionTarget: { entry_ids: [fx1.revenueEntry] },
  });
  assert.ok(reopened1.reopen_receipt_id, "FY1 reopens once FY2 is no longer closing/closed");
});

// ===========================================================================
// CELL 4a -- exactly one ACTIVE close receipt per fiscal year, structural
// (the partial unique index) + behavioral (a forged second active receipt for
// the SAME FY refuses 23505).
// ===========================================================================

test("close_receipts: uq_cr_one_active_close is a genuine PARTIAL unique index (kind='close' AND status='active')", async (t) => {
  if (skip56(t)) return;
  const idx = (await rootQuery(
    `select i.indpred is not null as is_partial, pg_get_indexdef(i.indexrelid) as def
       from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relname = 'uq_cr_one_active_close' and i.indisunique`,
  )).rows[0];
  assert.ok(idx, "the index exists in the live catalog");
  assert.equal(idx.is_partial, true, "it carries a partial predicate (indpred is not null), not a bare unique constraint");
  assert.match(idx.def, /kind\s*=\s*'close'/i);
  assert.match(idx.def, /status\s*=\s*'active'/i);
});

test("close_receipts: a forged second ACTIVE close receipt for the same FY refuses 23505 (unique_violation)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "cruniq", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "mandatory setup: one real, active close receipt exists");

  // snapshot must carry a closing_position pin (a SEPARATE guard from the
  // uniqueness index -- measured directly: an empty snapshot refuses
  // CLR41/pin-missing before the unique index ever gets a chance to fire) --
  // reusing the ORIGINAL receipt's own real snapshot sidesteps that guard
  // cleanly, isolating this probe to the uniqueness constraint specifically.
  const original = (await rootQuery(
    "select firm_id, client_id, fiscal_year_id, close_run_id, kind, closed_by, segregation_mode, pl_net_cents, retained_earnings_account, closing_tb_digest, gate_digest, books_watermark, dataset_sha256, snapshot from clara.close_receipts where id=$1",
    [closed.receipt_id],
  )).rows[0];

  const c = await getPool().connect();
  let forgeErr = null;
  try {
    await c.query("set role clara_fn_owner");
    await c.query("begin");
    try {
      await c.query(
        `insert into clara.close_receipts(firm_id, client_id, fiscal_year_id, close_run_id, kind, status,
             closed_by, segregation_mode, pl_net_cents, retained_earnings_account, closing_tb_digest,
             gate_digest, books_watermark, dataset_sha256, snapshot)
           values ($1,$2,$3,$4,'close','active',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [original.firm_id, original.client_id, original.fiscal_year_id, original.close_run_id,
          original.closed_by, original.segregation_mode, original.pl_net_cents, original.retained_earnings_account,
          original.closing_tb_digest, original.gate_digest, original.books_watermark, original.dataset_sha256,
          JSON.stringify(original.snapshot)],
      );
    } catch (e) {
      forgeErr = e;
    }
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  assert.ok(forgeErr, "a second active close receipt for the same FY is refused, even at table-owner privilege");
  assert.equal(forgeErr.code, "23505", `expected 23505 unique_violation (got ${forgeErr.code} -- ${forgeErr.message})`);
});

// ===========================================================================
// CELL 4b -- the fiscal-year lifecycle transition graph is now ENFORCED (R1.5
// MINOR), not merely documented in a comment: closed->open directly (skipping
// the audited reopened hop) refuses fy_lifecycle_edge_invalid. The reverse
// direction of this same edge family (closing->closed, via finalize_close) is
// already proven by every close-lifecycle cell in this battery (A1, A19f, the
// whole close-lifecycle/rest-b/rest-e files) -- cited, not rebuilt.
// ===========================================================================

test("fiscal_years lifecycle: a direct closed->open UPDATE (skipping reopened) refuses fy_lifecycle_edge_invalid", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "fylife", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });
  assert.equal((await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0].status, "closed", "mandatory setup: the FY is closed");

  const err = await caught(() => rootQuery("update clara.fiscal_years set status='open' where id=$1", [fx.fy]));
  assert.ok(err, "closed -> open directly (bypassing the audited reopened hop) is refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "fy_lifecycle_edge_invalid");
  assert.equal((await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0].status, "closed", "the status is untouched by the refused attempt");

  // The FIVE edges, read from the live body, named here for the record (the
  // closing->closed direction is proven behaviorally throughout this battery
  // already -- A1/A19f/A2/A3/A20/A22/etc -- cited rather than rebuilt here):
  const body = (await rootQuery(
    "select pg_get_functiondef('clara._tf_fiscal_years_lifecycle()'::regprocedure) as def",
  )).rows[0].def;
  assert.ok(/old\.status in \('open', 'reopened'\) and new\.status = 'closing'/.test(body), "edge: open|reopened -> closing (begin_close)");
  assert.ok(/old\.status = 'closing' and new\.status in \('open', 'closed'\)/.test(body), "edge: closing -> open|closed (abandon_close / finalize_close)");
  assert.ok(/old\.status = 'closed' and new\.status = 'reopened'/.test(body), "edge: closed -> reopened (reopen_fiscal_year) -- the ONLY lawful way off 'closed'");
});
