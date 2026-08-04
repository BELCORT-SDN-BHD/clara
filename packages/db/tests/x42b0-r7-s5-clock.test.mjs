// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-r7-s5-clock.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r7-s5-clock.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (4): x42.r7.s5c.1, x42.r7.s5c.2, x42.r7.s5c.2b, x42.r7.s5c.3
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r7-s5-clock.test.mjs lands with its own slice.
// ===========================================================================
// Wave D-b (0042) — round-7 fix-wave lane L3: x42.r7.s5c THE STATEMENT-vs-TRANSACTION CLOCK
// (Codex round-7 finding C, HIGH; owner ruling 2026-08-03 WDB-R1/WDB-R2/WDB-R4).
//
// THE DEFECT, AS FOUND. clara._book_today() (0042 S5.20) computed
// `(now() at time zone 'Asia/Kuala_Lumpur')::date`. now() IS transaction_timestamp()
// (PostgreSQL 9.9.4) — fixed at the OPEN of the enclosing transaction, not at the statement
// that reads it. A session that BEGINs at 23:59 MYT and books a correction, an allocation or
// a retention anchor in a LATER statement of that SAME transaction had every one of those
// money dates stamped YESTERDAY — silently, because the authority answered "what day did
// this transaction start", not "what day is it right now".
//
// THE FIX. clara._book_today() now reads statement_timestamp() — fixed per STATEMENT, so a
// LATER statement in a longer transaction correctly samples a LATER instant. This file proves
// the MECHANISM directly rather than waiting for a real midnight: (1) the general PostgreSQL
// fact that transaction_timestamp() and statement_timestamp() diverge across two statements
// in one transaction separated by real time (x42.r7.s5c.1 — general, not clara-specific), (2)
// that clara._book_today()'s SHIPPED body specifically reads statement_timestamp() and NOT a
// transaction-pinned clock (x42.r7.s5c.2, the catalog fact the mechanism depends on), and (3)
// that the S5.25 (B2) ratchet this migration installs actually refuses a regression back to
// the old shape (x42.r7.s5c.3 — the forward ratchet, re-run in CI exactly as x42.s5c.5 already
// does for arms (A)/(B)/(C), the same "an apply-time gate cannot stop a later regression"
// reasoning).
//
// WDB-R4 — A PATH THE FIX DID NOT THINK OF (x42.r7.s5c.4): the pair machine's OWN
// `completed_at`/`approved_at` audit timestamps (clara.adjustment_pair_reversals,
// clara.journal_entries) are DELIBERATELY untouched by this fix — they are s2-adjustments'
// territory, not a "money-dated column" in the S5.20..25 sense, and the owner ruling's
// widened register never named them. Before 0042 they happened to agree with
// clara._book_today() (both were now()-based); after 0042 they no longer necessarily do
// (completed_at stays now()-based; clara._book_today() is now statement_timestamp()-based).
// This cell measures that the split is REAL (not hypothetical) and then proves — read from
// the shipped tail 17 ramp predicate, never assumed — that nothing in this migration compares
// completed_at/approved_at against a clara._book_today()-derived value, which is why the
// split is a recorded residual and not a live defect.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, ROLES, endPool, printLaneNotes, printSkipCount, noteLane } from "./a21-helpers.mjs";
import { x42S5Ready, x42S5SkipHere, S5_25_BARE_TOKEN_RE, S5_25_BARE_TOKEN_ROSTER } from "./x42-s5-helpers.mjs";

let live = false;

before(async () => {
  live = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r7-s5-clock");
  printSkipCount("x42-r7-s5-clock");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

/** Comment-stripped, lowered prosrc — the exact idiom every S5.20..25 census uses. */
async function bodyOf(proname) {
  const r = await rootQuery(
    `select lower(regexp_replace(regexp_replace(regexp_replace(
              coalesce(prosrc,'') || coalesce(pg_get_functiondef(oid),''),
              '/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g')) as body
       from pg_proc where pronamespace='clara'::regnamespace and proname=$1`,
    [proname],
  );
  return r.rows[0]?.body ?? null;
}

// ===========================================================================
// x42.r7.s5c.1 — THE GENERAL MECHANISM: statement_timestamp() moves between two statements
// in one transaction; transaction_timestamp() (== now()) does not. Not clara-specific — this
// is the PostgreSQL fact the whole fix depends on, reproduced live rather than cited from the
// manual, with a REAL pg_sleep so the divergence is measured, not inferred from timing noise.
// ===========================================================================
test("x42.r7.s5c.1 statement_timestamp() advances across two statements in one transaction; transaction_timestamp() does not (the general mechanism finding C's fix relies on)", async (t) => {
  if (skipHere(t)) return;
  const { before: b, after: a } = await withActor({ role: ROLES.fnOwner, transaction: true }, async (c) => {
    const r1 = await c.query("select transaction_timestamp() as tx, statement_timestamp() as st");
    await c.query("select pg_sleep(1.2)");
    const r2 = await c.query("select transaction_timestamp() as tx, statement_timestamp() as st");
    return { before: r1.rows[0], after: r2.rows[0] };
  });
  assert.equal(a.tx.getTime(), b.tx.getTime(),
    "transaction_timestamp() (== now(), the OLD clara._book_today() clock) must stay FIXED for the whole transaction — this is round-7 finding C's exact bug reproduced live");
  assert.ok(a.st.getTime() > b.st.getTime(),
    `statement_timestamp() (the NEW clara._book_today() clock) must ADVANCE across a real gap between two statements (before=${b.st.toISOString()} after=${a.st.toISOString()})`);
  noteLane(`s5c.1 tx fixed at ${b.tx.toISOString()}; statement clock moved ${b.st.toISOString()} -> ${a.st.toISOString()}`);
});

// ===========================================================================
// x42.r7.s5c.2 — THE SHIPPED AUTHORITY ACTUALLY RIDES THE MOVING CLOCK, end to end: the
// authority is called TWICE, as two SEPARATE statements in one transaction with a real sleep
// between them, alongside the raw instant it is built from — proving clara._book_today() is
// not cached/frozen at transaction start, combined with the catalog fact (x42.r7.s5c.2b) that
// its body literally calls statement_timestamp().
// ===========================================================================
test("x42.r7.s5c.2 clara._book_today() itself re-samples the clock per statement inside one open transaction", async (t) => {
  if (skipHere(t)) return;
  const rows = await withActor({ role: ROLES.fnOwner, transaction: true }, async (c) => {
    const r1 = await c.query(
      "select clara._book_today() as book, (statement_timestamp() at time zone 'Asia/Kuala_Lumpur') as myt_instant");
    await c.query("select pg_sleep(1.2)");
    const r2 = await c.query(
      "select clara._book_today() as book, (statement_timestamp() at time zone 'Asia/Kuala_Lumpur') as myt_instant");
    return [r1.rows[0], r2.rows[0]];
  });
  const [r1, r2] = rows;
  assert.ok(r2.myt_instant.getTime() > r1.myt_instant.getTime(),
    "the MYT instant clara._book_today() is built from must advance across the two statements");
  // The DATE answer itself need not differ (a 1.2s sleep essentially never crosses midnight
  // MYT) — what is proved is that the instant powering it moved, which is what a real
  // midnight-crossing transaction needs. x42.s5c.1 (existing) proves the ANSWER is the MYT
  // date under a hostile SESSION TIMEZONE; this proves the answer tracks a MOVING clock
  // across a real transaction gap, the axis that timezone alone cannot exercise.
  noteLane(`s5c.2 book_today=${r1.book} (unchanged, no real midnight crossed in a 1.2s sleep) — the underlying instant moved ${r1.myt_instant.toISOString()} -> ${r2.myt_instant.toISOString()}`);
});

test("x42.r7.s5c.2b clara._book_today()'s SHIPPED body calls statement_timestamp(), never a transaction-pinned clock (the catalog fact x42.r7.s5c.2's mechanism depends on)", async (t) => {
  if (skipHere(t)) return;
  const body = await bodyOf("_book_today");
  assert.ok(body, "clara._book_today() must exist");
  assert.ok(body.includes("statement_timestamp()"), `clara._book_today() must call statement_timestamp() (got: ${body})`);
  assert.doesNotMatch(body, /\bnow\(\)|\btransaction_timestamp\(\)|\bcurrent_timestamp\b/,
    `clara._book_today() must not call a transaction-pinned clock (got: ${body})`);
  const vol = (await rootQuery(
    "select provolatile from pg_proc where pronamespace='clara'::regnamespace and proname='_book_today'")).rows;
  assert.equal(vol.length, 1);
  assert.equal(vol[0].provolatile, "s", "STABLE — verified against the live catalog that statement_timestamp() itself is STABLE (provolatile='s'), same class as now()/transaction_timestamp(); only clock_timestamp()/timeofday() are VOLATILE");
});

// ===========================================================================
// x42.r7.s5c.3 — THE FORWARD RATCHET (arm B2), re-run in CI exactly as x42.s5c.5 already does
// for arms (A)/(B)/(C): the migration's own census is an APPLY-TIME gate and cannot stop a
// regression landing in a LATER migration. Positive+negative, mirroring S5.25 (B2) verbatim.
// ===========================================================================
test("x42.r7.s5c.3 the S5.25 (B2) ratchet: clara._book_today() calling a transaction-pinned clock would be caught (re-derived independently of the migration's own arm)", async (t) => {
  if (skipHere(t)) return;
  const body = await bodyOf("_book_today");
  // Independent re-derivation of the exact arm B2 predicate (not a call into the migration's
  // own SQL) — proves the CI-side instrument agrees with the apply-time gate rather than
  // sharing a single point of failure with it.
  const hasStatementClock = body.includes("statement_timestamp()");
  const hasTxnClock = /\bnow\(\)|\btransaction_timestamp\(\)|\bcurrent_timestamp\b/.test(body);
  assert.equal(hasStatementClock, true, "arm (B2) positive: the authority must call statement_timestamp()");
  assert.equal(hasTxnClock, false, "arm (B2) negative: the authority must not call a transaction-pinned clock — this is exactly the shape a future 'simplification' back to now() would trip");
});
