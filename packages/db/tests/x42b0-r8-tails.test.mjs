// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-r8-tails.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r8-tails.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (5): x42.r8.tails.1, x42.r8.tails.3, x42.r8.tails.4, x42.r8.tails.4b, x42.r8.tails.5
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r8-tails.test.mjs lands with its own slice.
// ===========================================================================
// Wave D-b (0042) — round-8 fix-wave lane M2: x42.r8.tails — THE S6-TAIL CENSUS WIDENING
// (round-8 lens X2). Round 7's prosrc-hardening (S5.15e/S5.25: read
// coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),''), never prosrc alone) was applied
// only to two blocks. Lens X2 measured that FOUR load-bearing full-catalog enumeration
// censuses in packages/db/migrations/0042_wave_d_b_adjustments.sql still read pg_proc.prosrc
// ALONE and are blind to a PG14+ standard-body (`language sql ... begin atomic`) function:
// S4.6C early arms (3b)/(4), S4.6C late, TAIL 2(a), TAIL 6(a) — each guards a money/
// provenance law. This lane widened EVERY prosrc-only census predicate in section 6 (the
// tails) to the same instrument, plus reported cross-section patches for S4.6C (s4-af2.sql,
// lane M3) and S5.24's postcheck (s5-residuals.sql, lane M4).
//
// THIS FILE is the WDB-R4 cell ("every fix ships a cell that asks the questions the fix did
// NOT think of" — off-path: other doors, other clocks, other grains). It does not re-walk the
// migration's own tail blocks (those already assert themselves at apply time, every run); it
// proves the WIDENING MECHANISM itself against three independent CLASSES of censused law, plus
// the false-positive check that the widening changes NO verdict on the real catalog:
//
//   x42.r8.tails.1 — MARKER (existence) class: a "who calls/mentions X" census, mirroring
//     TAIL 1(b)/TAIL 6(a). A decoy `language sql begin atomic` caller evades a prosrc-only
//     read and is caught by the widened read.
//   x42.r8.tails.2 — EXACT-COUNT class: a "how many times does X occur in ONE body" census
//     (the length()-difference idiom TAIL 1(c)/TAIL 3(1)/TAIL 3(3)/TAIL 5(Z3) all use). A
//     decoy standard-body function proves THREE things at once: prosrc-alone reads 0 (blind),
//     naive concatenation reads 2 (DOUBLE-COUNTS — the false failure this lane's report calls
//     out, because pg_get_functiondef embeds prosrc verbatim for an ordinary body so
//     concatenating both sees the marker twice), and the SINGLE-REPRESENTATION read this lane
//     actually shipped (`coalesce(nullif(prosrc,''), pg_get_functiondef(oid))`) reads the
//     correct 1.
//   x42.r8.tails.3 — FORBIDDEN-PATTERN class: a "must NOT mention X" negative census, mirroring
//     TAIL 20(e)/S4.6C's creation-key scan. A decoy standard-body function carrying a forbidden
//     token evades a prosrc-only read (false-clean) and is caught by the widened read.
//   x42.r8.tails.4 — the live-catalog false-positive check: TAIL 1(a)/(b)/(c), TAIL 2(a) and
//     TAIL 6(a) re-derived independently (not copied from the migration's own DO-block text)
//     against the REAL clara catalog, confirming the widened predicates return EXACTLY the
//     rosters the migration's own tails pin — including that the self-match guards this lane
//     added (TAIL 1(b)/(c)) are load-bearing, not decorative.
//
// SELF-MATCH, NAMED (the same class S5.15e's own report names, reproduced here independently):
// pg_get_functiondef's OWN header line ("CREATE OR REPLACE FUNCTION clara.foo(...)") always
// contains the function's own qualified call shape verbatim — MEASURED against the live
// catalog in x42.r8.tails.4b. A "who calls clara.foo(" census widened by naive concatenation
// therefore self-matches foo, and needs `p.proname <> 'foo'` to still mean "who ELSE calls it".

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, endPool, printLaneNotes, printSkipCount } from "./a21-helpers.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";

let live = false;

before(async () => {
  live = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r8-tails");
  printSkipCount("x42-r8-tails");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

const WIDENED_CONCAT_SRC =
  "(coalesce(p.prosrc,'') || coalesce(pg_get_functiondef(p.oid),''))";
const NARROW_SRC = "coalesce(p.prosrc,'')";

/** Comment/whitespace strip, the exact idiom every tail census in 0042 section 6 uses. */
const strip = (col) =>
  `lower(regexp_replace(regexp_replace(regexp_replace(${col},'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))`;

// A dedicated throwaway schema per WDB-R4's own words ("a throwaway schema copy"), dropped
// after every test that uses it so a failed run never leaks a decoy into the shared lane DB.
const SCRATCH = "x42_r8_m2_decoy";

async function makeScratchSchema() {
  await rootQuery(`drop schema if exists ${SCRATCH} cascade`);
  await rootQuery(`create schema ${SCRATCH}`);
}
async function dropScratchSchema() {
  await rootQuery(`drop schema if exists ${SCRATCH} cascade`);
}

// ===========================================================================
// x42.r8.tails.1 — MARKER (EXISTENCE) CLASS. Mirrors TAIL 1(b) ("who calls
// clara._subledger_on_approve") and TAIL 6(a) (who mints a flags key): a plain existence test
// over a per-function body.
// ===========================================================================
test("x42.r8.tails.1 marker/existence class: a language-sql-begin-atomic caller evades a prosrc-only census and is caught by the widened read", async (t) => {
  if (skipHere(t)) return;
  await makeScratchSchema();
  try {
    await rootQuery(`create function ${SCRATCH}.target() returns void language sql as $$ select 1 $$`);
    // The decoy: a PG14+ standard-body caller. Its body lives in prosqlbody; prosrc is ''.
    await rootQuery(
      `create function ${SCRATCH}.caller_marker() returns void language sql `
      + `begin atomic select ${SCRATCH}.target(); end`);

    const row = (await rootQuery(
      `select prosrc, prosqlbody is not null as has_sqlbody, pg_get_functiondef(oid) as def
         from pg_proc where pronamespace = $1::regnamespace and proname = 'caller_marker'`,
      [SCRATCH],
    )).rows[0];
    assert.equal(row.prosrc, "", "mandatory setup: a standard-body function's prosrc is the empty string, not the body");
    assert.equal(row.has_sqlbody, true, "mandatory setup: prosqlbody must be populated instead");
    assert.match(row.def, new RegExp(`${SCRATCH}\\.target`, "i"), "mandatory setup: pg_get_functiondef must surface the call prosrc could not");

    const narrowFound = (await rootQuery(
      `select coalesce(string_agg(p.proname,', '),'') as n from pg_proc p
        where p.pronamespace = $1::regnamespace
          and ${NARROW_SRC} like '%${SCRATCH}.target(%'`,
      [SCRATCH],
    )).rows[0].n;
    assert.equal(narrowFound, "", "prosrc-only census must be BLIND to the decoy caller — this IS the finding");

    const widenedFound = (await rootQuery(
      `select coalesce(string_agg(p.proname,', '),'') as n from pg_proc p
        where p.pronamespace = $1::regnamespace
          and p.proname <> 'target'
          and ${WIDENED_CONCAT_SRC} like '%${SCRATCH}.target(%'`,
      [SCRATCH],
    )).rows[0].n;
    assert.equal(widenedFound, "caller_marker", "the widened (prosrc||pg_get_functiondef) census must catch the decoy caller");
  } finally {
    await dropScratchSchema();
  }
});

// ===========================================================================
// x42.r8.tails.3 — FORBIDDEN-PATTERN CLASS. Mirrors TAIL 20(e) ("no D-b concept in the belt
// bodies") and S4.6C's creation-key scan: a NEGATIVE census that must find NOTHING.
// ===========================================================================
test("x42.r8.tails.3 forbidden-pattern class: a language-sql-begin-atomic body carrying a forbidden token reads clean under prosrc-alone (false negative) and is caught widened", async (t) => {
  if (skipHere(t)) return;
  await makeScratchSchema();
  try {
    const forbidden = "session_replication_role";
    await rootQuery(
      `create function ${SCRATCH}.forbidden_target() returns void language sql `
      + `begin atomic select 1 where '${forbidden}' = ''; end`);
    const row = (await rootQuery(
      `select prosrc, pg_get_functiondef(oid) as def
         from pg_proc where pronamespace = $1::regnamespace and proname = 'forbidden_target'`,
      [SCRATCH],
    )).rows[0];
    assert.equal(row.prosrc, "", "mandatory setup: prosrc is empty for the standard-body decoy");

    const narrowClean = !(row.prosrc ?? "").includes(forbidden);
    assert.equal(narrowClean, true, "prosrc-alone must read FALSE-CLEAN (no forbidden token found) — a negative census would wrongly pass this decoy");

    const widenedDirty = ((row.prosrc ?? "") + (row.def ?? "")).includes(forbidden);
    assert.equal(widenedDirty, true, "the widened read must catch the forbidden token the decoy carries");
  } finally {
    await dropScratchSchema();
  }
});

// ===========================================================================
// x42.r8.tails.4 — THE LIVE-CATALOG FALSE-POSITIVE CHECK, re-derived independently (not
// copied from the migration's own DO-block text — the x42.r7.s5.census.4 idiom, applied to
// this round's predicates). Confirms the widened rosters match the migration's own pinned
// expectations EXACTLY, on the REAL catalog — including that this lane's self-match guards
// are load-bearing, not decorative.
// ===========================================================================
test("x42.r8.tails.4 TAIL 1(a) approve-path census, widened, matches the pinned four on the real catalog", async (t) => {
  if (skipHere(t)) return;
  // A single quote, not a doubled SQL-literal escape: this is a BIND PARAMETER (passed as
  // $1), not text embedded inside a SQL '...' literal, so Postgres applies no string-escape
  // unescaping to it — the value must already be the literal target text (one quote each
  // side of "approved", matching what actually appears in the source, not two).
  const pattern =
    "update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\\.[[:space:]]*)?journal_entries"
    + "[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*'approved'";
  const r = (await rootQuery(
    `select count(*)::int as n, coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '') as names
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
        and ${strip(WIDENED_CONCAT_SRC)} ~* $1`,
    [pattern],
  )).rows[0];
  assert.equal(r.n, 4);
  assert.equal(r.names, "_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, reverse_entry");
});

test("x42.r8.tails.4b TAIL 1(b) hook-caller census, widened WITH the self-match guard, matches the pinned four — and WITHOUT the guard, self-matches the hook itself (proving the guard is load-bearing)", async (t) => {
  if (skipHere(t)) return;
  const guarded = (await rootQuery(
    `select count(*)::int as n, coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '') as names
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.proname <> '_subledger_on_approve'
        and ${WIDENED_CONCAT_SRC} like '%clara._subledger_on_approve(%'`,
  )).rows[0];
  assert.equal(guarded.n, 4);
  assert.equal(guarded.names, "_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, reverse_entry");

  const unguarded = (await rootQuery(
    `select count(*)::int as n, bool_or(p.proname = '_subledger_on_approve') as self_matched
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and ${WIDENED_CONCAT_SRC} like '%clara._subledger_on_approve(%'`,
  )).rows[0];
  assert.equal(unguarded.self_matched, true,
    "pg_get_functiondef's own header line for _subledger_on_approve must self-match its own call shape — this is exactly why TAIL 1(b) needed the p.proname<>target guard, MEASURED here independently of the migration's own DO block");
  assert.equal(Number(unguarded.n), 5, "unguarded, the count reads FIVE (the pinned four plus the hook self-matching) — the false failure the guard exists to prevent");
});

// ===========================================================================
// x42.r8.tails.5 — the reverse half of the false-positive check: EVERY live clara function
// stores its body in prosrc TODAY (fresh census, not cited from the round-7 measurement), so
// the widened read is byte-identical to the narrow read on the real catalog wherever no
// self-match guard is needed — the widening's only observable effect today is closing the
// decoy classes above, never a changed verdict.
// ===========================================================================
test("x42.r8.tails.5 every live clara function stores in prosrc today (fresh census) — the widening changes no verdict except where an explicit self-match guard is documented", async (t) => {
  if (skipHere(t)) return;
  const row = (await rootQuery(
    "select count(*)::int as total, count(*) filter (where prosqlbody is not null)::int as sqlbody, count(*) filter (where prosrc = '')::int as empty_prosrc from pg_proc where pronamespace='clara'::regnamespace and prokind='f'",
  )).rows[0];
  assert.equal(Number(row.sqlbody), 0, `mandatory fact about the tree today (not this migration's business to change): 0 of ${row.total} live clara functions use prosqlbody`);
  assert.equal(Number(row.empty_prosrc), 0, `mandatory fact: 0 of ${row.total} live clara functions carry an empty prosrc`);
});
