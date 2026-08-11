// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- THE
// CONCURRENCY FAMILY (Codex round finding 4, 2026-08-11: the battery had no
// real two-session cell). Matrix: docs/plan/wave-e-acceptance-matrix.md
// Section E. Design contract: docs/plan/wave-e-design-skeleton-part3.md
// SS2.11 ("THE ONLY LOCK, AND WHY" -- mint_month_snapshot takes 203005007
// EXCLUSIVE; every covered writer's trigger takes it SHARED first).
//
// CONTRACT-BLIND on 0057 itself -- mint_month_snapshot's / _tf_period_wall's
// live bodies ARE read via pg_get_functiondef for MY OWN authorial grounding
// (the exact lock shape: pg_advisory_xact_lock_shared(203005007,
// hashtext(client_id)), taken unconditionally, first, by _tf_period_wall on
// EVERY journal_entries row) -- `0057_wave_e_registry_snapshots.sql` itself
// is never opened. The two-session driver is the house rig-docs-race.mjs
// (holdThenContend/waitBlockedBy) -- the same one A13/A19b already proved out
// -- pg_blocking_pids, never timing.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, opk, namedCall, buildWorld, printLaneNotes, printSkipCount, noteLane, markSkip, endPool,
  has0056, has0057, freshActiveClient, setupCloseCoa, bookToday, freshResolution,
  draftEntryV3, BANK1, REVN,
  verifySnapshot, periodSnapshotRow,
  inHumanTxn, caught, holdThenContend,
} from "./x57-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = (await has0056()) && (await has0057());
  if (!ready) { noteLane("0056 or 0057 not applied -- x57 concurrency suite skipped"); return; }
  world = await buildWorld();
});
after(async () => { printLaneNotes("x57-concurrency"); printSkipCount("x57-concurrency"); await endPool(); });

function skip57(t) {
  if (!ready) { markSkip(); t.skip("0056/0057 surface absent"); return true; }
  return false;
}

async function pastMonthStart(n) {
  const today = await bookToday();
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/** A raw named-arg call issued on the caller's OWN pooled client (mid-transaction). */
async function callInTxn(txc, fnName, specs, vals) {
  const r = await txc.query(namedCall(fnName, specs), vals);
  return r.rows[0].result;
}

// ===========================================================================
// THE REAL TWO-SESSION CELL: session A holds an open transaction with an
// in-period books write (taking 203005007 SHARED via the wall, unreleased
// until A commits); session B calls mint_month_snapshot on the SAME client
// and must BLOCK -- proven via pg_blocking_pids, never timing -- until A
// commits, after which B completes with a payload that CONTAINS A's write,
// reads 'current', and an independent recompute confirms zero drift. This
// pins the no-wrong-and-current property the native reviewer measured by
// hand: mint can never observe a HALF-committed world.
// ===========================================================================
test("mint_month_snapshot BLOCKS on a concurrent in-period books write holding the wall SHARED (proven via pg_blocking_pids), then completes CONTAINING that write, current, zero drift", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "conc1");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}15`;

  // The draft is born in its OWN, already-committed transaction (autocommit) --
  // session A's held transaction below does ONLY the approve, so the SHARE
  // lock it takes and holds is exactly the write under test.
  const resolution = await freshResolution(owner, client, { subjectKind: "manual", subjectId: null });
  const draft = await draftEntryV3(owner, {
    client, resolution, postingDate, memo: "x57 concurrency A write",
    lines: [
      { account_code: BANK1, debit_cents: 77_000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 77_000, description: "cr" },
    ],
    opKey: opk("x57-conc1-draft"),
  });

  const out = await holdThenContend({
    a: {
      role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
        const r = await c.query(
          "select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r",
          [draft.entry_id, draft.revision_token, opk("x57-conc1-approve")],
        );
        return r.rows[0].r;
      },
    },
    b: {
      role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
        const r = await c.query(
          "select clara.mint_month_snapshot(p_client => $1, p_month_start => $2::date, p_op_key => $3) as r",
          [client, monthStart, opk("x57-conc1-mint")],
        );
        return r.rows[0].r;
      },
    },
  });

  assert.ok(out.provedBlocked, "B (mint) WAITED on A's held wall SHARE lock -- observed via pg_blocking_pids, not timing");
  assert.equal(out.a.ok, true, `A's approve committed (got ${JSON.stringify(out.a)})`);
  assert.equal(out.b.ok, true, `B's mint, once unblocked, SUCCEEDED (got ${JSON.stringify(out.b)})`);
  const receipt = out.b.receipt;
  assert.equal(receipt.state, "current", "B's freshly minted artifact reads current");

  // POSITIVE: the payload CONTAINS A's write -- read directly off the durable
  // row, not inferred from the receipt alone.
  const stored = await periodSnapshotRow(receipt.snapshot_id);
  const bankRow = stored.payload.trial_balance.find((r) => r.account_code === BANK1);
  assert.ok(bankRow, "BANK1 appears in the minted trial balance");
  assert.equal(Number(bankRow.debit_cents), 77_000, `BANK1's debit reflects A's write, committed before B's mint ran (got ${JSON.stringify(bankRow)})`);

  const verified = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(verified.drift, false, `no-wrong-and-current: an independent recompute confirms zero drift (got ${JSON.stringify(verified)})`);
});

// ===========================================================================
// THE LOCK-UPGRADE GUARD: a session that writes books and THEN calls mint IN
// THE SAME TRANSACTION is refused CLR10 mint_lock_upgrade_refused -- the
// composition would upgrade this backend's own held SHARE (from the write)
// to the EXCLUSIVE mint wants, which self-deadlocks against a symmetric peer.
// Measured against the live guard's own pg_locks probe (classid=203005007,
// mode='ShareLock', pid=pg_backend_pid()), not guessed from its comment.
// ===========================================================================
test("mint_month_snapshot refuses CLR10 mint_lock_upgrade_refused when the SAME transaction already wrote this client's books", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "conc2");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}15`;

  const err = await caught(() => inHumanTxn(owner, async (txc) => {
    const resolution = await freshResolution(owner, client, { subjectKind: "manual", subjectId: null });
    const draft = await callInTxn(txc, "draft_entry", [
      { name: "p_client" }, { name: "p_resolution" }, { name: "p_posting_date", cast: "date" },
      { name: "p_memo" }, { name: "p_lines", cast: "jsonb" }, { name: "p_op_key" },
    ], [
      client, resolution, postingDate, "x57 conc2 books write",
      JSON.stringify([
        { account_code: BANK1, debit_cents: 5_000, credit_cents: 0, description: "dr" },
        { account_code: REVN, debit_cents: 0, credit_cents: 5_000, description: "cr" },
      ]),
      opk("x57-conc2-draft"),
    ]);
    await callInTxn(txc, "approve_entry", [
      { name: "p_entry" }, { name: "p_expected_revision" }, { name: "p_op_key" },
    ], [draft.entry_id, draft.revision_token, opk("x57-conc2-approve")]);
    // SAME transaction: this backend already holds 203005007 SHARED for this
    // client (taken by the approve's t_period_wall arm above) -- mint's own
    // EXCLUSIVE request is now a lock UPGRADE, and the guard refuses it.
    await callInTxn(txc, "mint_month_snapshot", [
      { name: "p_client" }, { name: "p_month_start", cast: "date" }, { name: "p_op_key" },
    ], [client, monthStart, opk("x57-conc2-mint")]);
  }));
  assert.ok(err, "mint inside a transaction that already wrote this client's books MUST be refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} / ${err.message})`);
  assert.ok(err.detail && err.detail.includes("mint_lock_upgrade_refused"), `the refusal detail names the token verbatim (got ${err.detail})`);
});

// CONTROL ARM (R2 MINOR 1, accepted 2026-08-11): the guard refuses the
// COMPOSITION (this transaction already holding the SHARE lock), not
// minting-inside-a-transaction generally. A transaction that mints with NO
// prior books write for this client must succeed -- proving the refusal
// above is specific, not a blanket ban this cell could have mistaken it for.
test("CONTROL: mint_month_snapshot inside a transaction with NO prior books write for this client SUCCEEDS -- the guard refuses the lock upgrade specifically, not minting-in-a-transaction generally", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "conc2ctrl");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);

  let receipt = null;
  await inHumanTxn(owner, async (txc) => {
    receipt = await callInTxn(txc, "mint_month_snapshot", [
      { name: "p_client" }, { name: "p_month_start", cast: "date" }, { name: "p_op_key" },
    ], [client, monthStart, opk("x57-conc2ctrl-mint")]);
  });
  assert.ok(receipt?.snapshot_id, `the control mint SUCCEEDED inside its own transaction with no prior write (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.state, "current");
});
