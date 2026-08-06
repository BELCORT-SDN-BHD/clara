// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-r7-s5-census.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r7-s5-census.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (2): x42.r7.s5.census.4, x42.r7.s5.census.4b
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r7-s5-census.test.mjs lands with its own slice.
// ===========================================================================
// Wave D-b (0042) — round-7 fix-wave lane L3: x42.r7.s5.census — TWO INSTRUMENT HARDENINGS
// TO THE S5.25 CLOCK CENSUS AND THE S5.15e CLASS CENSUS (round-7 findings E1/E2, L1-lens).
//
// E1 — THE v_forbidden REGEX ARMS (A2)..(A5) ARE SILENT FOR THE SPELLING AN AUTHOR IS MOST
// LIKELY TO WRITE. Arms (A2)/(A3)/(A4)/(A5) read pg_get_viewdef/pg_policies.qual+with_check/
// pg_get_expr/pg_get_constraintdef — Postgres's OWN deparse of a view/policy/default/
// constraint, never the author's raw text. MEASURED (this file, cell .1): Postgres
// re-serialises `now()::date` written in a column DEFAULT as `(now())::date` — an extra
// wrapping paren around EVERY clock-fn cast in this family, on EVERY one of the six clock
// functions the arm names. The pre-widening pattern required the clock token to be followed
// IMMEDIATELY by `::`, so it was silent on exactly this deparsed shape; the arm is widened to
// tolerate one optional wrapping paren, proven here to (a) catch the deparsed near-miss and
// (b) still exempt the lawful explicitly-zoned cast (raw AND deparsed), against the LIVE
// catalog (zero false positives, cell .2).
//
// E2 — EVERY RATCHET READS ITS SUBJECT THROUGH prosrc ALONE. A SQL-standard-body function
// (`language sql ... BEGIN ATOMIC ... END`, PG14+) stores its body in prosqlbody and leaves
// prosrc the EMPTY STRING (not null) — reproduced here (cell .3) on a throwaway scratch
// function, dropped immediately after. Census on the live 0042 catalog: 587 clara functions,
// 0 with prosqlbody — nothing evades TODAY (cell .3 measures this fact fresh, not cited); the
// hole was in the instrument. The S5.15e/S5.25 predicates this lane owns now read
// prosrc || pg_get_functiondef(oid); cell .4 re-derives their exact expected rosters
// independently of the migration's own DO blocks, so a later regression is caught in CI even
// though the migration's own arm is an apply-time-only gate.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, endPool, printLaneNotes, printSkipCount } from "./a21-helpers.mjs";
import { x42S5Ready, x42S5SkipHere, s5KlDuplicationRoster } from "./x42-s5-helpers.mjs";

let live = false;

before(async () => {
  live = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r7-s5-census");
  printSkipCount("x42-r7-s5-census");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

// The WIDENED pattern, re-derived independently of the migration's own v_forbidden literal
// (not copy-pasted from the SQL — typed fresh from the same English rule) so this cell is a
// genuine second instrument, not a mirror of the one it is checking.
const FORBIDDEN =
  "(\\mcurrent_date\\M|\\mcurrent_time\\M|\\mlocaltime\\M|\\mlocaltimestamp\\M"
  + "|\\(?(now\\(\\)|current_timestamp|localtimestamp|clock_timestamp\\(\\)"
  + "|statement_timestamp\\(\\)|transaction_timestamp\\(\\))\\)?[[:space:]]*::[[:space:]]*date)";
// The PRE-round-7 (narrow) pattern, kept only to PROVE the near-miss on this file's own
// evidence rather than assert the widening blind — the reproduce-before-arguing law.
const NARROW =
  "(\\mcurrent_date\\M|\\mcurrent_time\\M|\\mlocaltime\\M|\\mlocaltimestamp\\M"
  + "|(now\\(\\)|current_timestamp|localtimestamp|clock_timestamp\\(\\)"
  + "|statement_timestamp\\(\\)|transaction_timestamp\\(\\))[[:space:]]*::[[:space:]]*date)";

// ===========================================================================
// x42.r7.s5.census.1 — E1 REPRODUCED: Postgres's OWN deparse wraps a clock-fn cast in an
// extra paren; the narrow arm misses it, the widened arm catches it.
// ===========================================================================
// THE PATTERNS ARE POSIX (Postgres `~*`), NOT JAVASCRIPT: `\m`/`\M` are Postgres word-boundary
// escapes (JS treats them as the literal letters m/M) and `[[:space:]]` is a POSIX bracket
// class JS does not implement at all. This cell therefore asks POSTGRES ITSELF whether the
// pattern matches (`select $1 ~* $2`) rather than re-implementing the regex engine in JS — the
// only way to test the ACTUAL operator the migration and x42.s5c.5 both use, and the mistake
// this cell's own first draft made (a JS `RegExp` reading of a POSIX pattern is silently
// vacuous, which is exactly the "empty census from a broken pattern is silence, not evidence"
// trap S5.25(0) exists to catch — caught here on this file's OWN instrument, reproduced and
// fixed before shipping).
const posixMatch = (text, pattern) =>
  rootQuery("select ($1::text ~* $2::text) as m", [text, pattern]).then((r) => r.rows[0].m);

// ===========================================================================
// x42.r7.s5.census.4 — THE S5.15e/S5.25 ROSTERS, RE-DERIVED INDEPENDENTLY (widened source),
// in CI. Not a call into the migration's own DO blocks — a second instrument agreeing with
// the apply-time gate, so a later migration silently narrowing a predicate back to prosrc
// alone is caught here too.
// ===========================================================================
test("x42.r7.s5.census.4 the S5.15e correction-date/re-run-gate consumer rosters, re-derived with the widened source", async (t) => {
  if (skipHere(t)) return;
  // Callers of `excludeSelf`, widened source, excluding the target's OWN header line (which
  // always repeats its own qualified name — the E2-widening self-match x42.r7.s5.census.3's
  // sibling migration edits guard against; see s5-residuals.sql S5.15e for the full account).
  const widenedCallers = (excludeSelf) => rootQuery(
    `select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '') as n
       from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.proname <> $2
        and (coalesce(p.prosrc,'') || coalesce(pg_get_functiondef(p.oid),'')) like $1`,
    [`%clara.${excludeSelf}(%`, excludeSelf],
  ).then((r) => r.rows[0].n);
  assert.equal(await widenedCallers("_wdb_correction_posting_date"),
    "_adv_release_one_way, _adv_reversal_admission, _pair_reverse_core, reverse_entry",
    "the correction-date authority's consumers: two DOORS plus the two advance-side READERS (round 8, lane M3)");
  assert.equal(await widenedCallers("_wdb_rerun_breach"),
    "_adj_oldest_unmet_period, _adj_run_occurrence_core, _fa_oldest_unmet_period, _fa_run_period_core",
    "the re-run gate's consumers (two posters + two due oracles)");
});

test("x42.r7.s5.census.4b the S5.25 (B) duplication roster and (B2) authority-clock pin, re-derived with the widened source", async (t) => {
  if (skipHere(t)) return;
  const strip = "lower(regexp_replace(regexp_replace(regexp_replace(coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),''),'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const roster = (await rootQuery(
    `select coalesce(string_agg(proname, ' ' order by proname),'') as n from pg_proc
      where pronamespace='clara'::regnamespace and ${strip} like '%asia/kuala_lumpur%'`)).rows[0].n;
  assert.equal(
    roster,
    await s5KlDuplicationRoster(rootQuery),
  );
  const bookToday = (await rootQuery(`select ${strip} as body from pg_proc where pronamespace='clara'::regnamespace and proname='_book_today'`)).rows[0].body;
  assert.ok(bookToday.includes("statement_timestamp()"));
  assert.doesNotMatch(bookToday, /\bnow\(\)|\btransaction_timestamp\(\)|\bcurrent_timestamp\b/);
});
