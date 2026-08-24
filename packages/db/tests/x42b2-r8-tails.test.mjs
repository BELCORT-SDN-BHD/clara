// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-r8-tails.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r8-tails.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (3): x42.r8.tails.2, x42.r8.tails.4c, x42.r8.tails.4d
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
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
// x42.r8.tails.2 — EXACT-COUNT CLASS. Mirrors TAIL 1(c)/TAIL 3(1)/TAIL 3(3)/TAIL 5(Z3): a
// length()-difference occurrence count WITHIN one already-fetched body, expecting an EXACT
// number. Proves all three readings side by side: prosrc-alone (blind, reads 0), naive
// concatenation (DOUBLE-COUNTS, reads 2 — a false failure against an "exactly 1" census, the
// hazard this lane's report names), and the single-representation form this lane actually
// shipped in s6-tails.sql (reads the correct 1).
// ===========================================================================
test("x42.r8.tails.2 exact-count class: prosrc-alone is blind (0), naive concatenation double-counts (2), single-representation reads the correct exactly-1", async (t) => {
  if (skipHere(t)) return;
  await makeScratchSchema();
  try {
    const marker = "clara._settlement_mark_token";
    await rootQuery(
      `create function ${SCRATCH}.exact_count_target() returns void language sql `
      + `begin atomic select 1 where '${marker}' = ''; end`);
    const row = (await rootQuery(
      `select prosrc, pg_get_functiondef(oid) as def
         from pg_proc where pronamespace = $1::regnamespace and proname = 'exact_count_target'`,
      [SCRATCH],
    )).rows[0];
    assert.equal(row.prosrc, "", "mandatory setup: prosrc is empty for the standard-body decoy");
    // occ() takes the marker EXPLICITLY (not closed over) — this file's first draft closed
    // over the decoy's `marker` and silently reused it when measuring the REAL function below,
    // which always read 0 there and would have been a false pass for the wrong reason; typed
    // as a parameter so each call site names the marker it actually means.
    const occ = (text, mk) => (text.length - text.split(mk).join("").length) / mk.length;

    // (a) prosrc-alone: BLIND — reads 0 occurrences, not the true 1.
    assert.equal(occ(row.prosrc ?? "", marker), 0, "prosrc-alone must read ZERO occurrences — the blind spot");

    // (b) naive concatenation: pg_get_functiondef embeds prosrc verbatim for an ordinary body,
    // but THIS body's prosrc is empty (it's a standard-body function) — so concatenation here
    // reads exactly 1 (functiondef's own single copy), not yet the double-count. The double-
    // count hazard needs an ORDINARY (prosrc-populated) function to demonstrate, which the
    // next assertion does directly against the round-8 M2 lane's own s6-tails.sql idiom: an
    // ordinary function's pg_get_functiondef output CONTAINS its prosrc verbatim, so
    // concatenating both DOUBLES a marker that appears once in the real body.
    const naiveConcatOnStandardBody = occ((row.prosrc ?? "") + (row.def ?? ""), marker);
    assert.equal(naiveConcatOnStandardBody, 1, "concatenation on a standard-body decoy (empty prosrc) reads the functiondef copy once — sets up the contrast below");

    const ordinary = (await rootQuery(
      `select prosrc, pg_get_functiondef(oid) as def from pg_proc
        where pronamespace = 'clara'::regnamespace and proname = '_subledger_on_approve'`,
    )).rows[0];
    assert.ok(ordinary.prosrc.length > 0, "mandatory precondition: the real clara._subledger_on_approve is an ordinary (non-prosqlbody) body");
    const realMarker = "clara._adj_on_approve(";
    const occProsrcAlone = occ(ordinary.prosrc, realMarker);
    const occNaiveConcat = occ(ordinary.prosrc + ordinary.def, realMarker);
    assert.equal(occProsrcAlone, 1, "the true occurrence count, measured on prosrc alone, is 1 (TAIL 1(c)'s own pinned expectation)");
    assert.equal(occNaiveConcat, occProsrcAlone * 2,
      "naive concatenation on an ORDINARY body must DOUBLE the true count — the false-failure hazard this lane's report names, reproduced on the real catalog's own function");

    // (c) the single-representation form s6-tails.sql actually ships: prosrc when non-empty,
    // else pg_get_functiondef. Correct on BOTH the standard-body decoy (falls back, reads 1)
    // and the ordinary real function (uses prosrc, reads the true 1, never doubled).
    const singleRep = (text, def) => (text && text.length > 0 ? text : def) ?? "";
    assert.equal(occ(singleRep(row.prosrc, row.def), marker), 1, "single-representation on the standard-body decoy: falls back to functiondef, reads the correct 1");
    assert.equal(occ(singleRep(ordinary.prosrc, ordinary.def), realMarker), 1, "single-representation on the ordinary real function: uses prosrc, reads the correct 1 — never doubled");
  } finally {
    await dropScratchSchema();
  }
});

test("x42.r8.tails.4c TAIL 2(a) origin=scheduled_run writer census, widened, matches the pinned three on the real catalog", async (t) => {
  if (skipHere(t)) return;
  const insertPattern = "insert[[:space:]]+into[[:space:]]+(clara[[:space:]]*\\.[[:space:]]*)?journal_entries(?![a-z0-9_])";
  const r = (await rootQuery(
    `select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '') as names
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
        and ${strip(WIDENED_CONCAT_SRC)} ~* $1
        and ${strip(WIDENED_CONCAT_SRC)} like '%''scheduled_run''%'`,
    [insertPattern],
  )).rows[0].names;
  assert.equal(r, "_adj_on_approve, _adj_run_occurrence_core, _fa_run_period_core");
});

test("x42.r8.tails.4d TAIL 6(a) flags-key writer census, widened, matches the pinned writer sets on the real catalog", async (t) => {
  if (skipHere(t)) return;
  const widenedWriters = async (key) => {
    // Single quotes here too, for the same bind-parameter reason as x42.r8.tails.4 above.
    const pat = `jsonb_build_object\\([[:space:]]*'${key}'|"${key}"[[:space:]]*:`;
    return (await rootQuery(
      `select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '') as n
         from pg_proc p
        where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
          and ${strip(WIDENED_CONCAT_SRC)} ~* $1`,
      [pat],
    )).rows[0].n;
  };
  assert.equal(await widenedWriters("recurring_adjustment"), "_adj_on_approve, _adj_run_occurrence_core");
  // FRONTIER-AWARE (F-A3/PR-1a core extraction): this file's own gate (x42S5Ready) does not
  // require the extraction, so this cell is reachable at a frontier where it has not landed
  // yet -- "old shape still pinned for pre-PR frontiers". Pre-extraction, the
  // jsonb_build_object('staff_advance_application', ...) key lives in the public
  // clara.resolve_and_book_bank_line. Once the extraction lands, that body becomes a thin
  // delegator (its own comment: "the prosrc pins that measure it moved with the body") and
  // the key moves, byte-for-byte, into clara._resolve_and_book_bank_line_core instead. The
  // stem check reads the SAME migration name the extraction census in x42-s5-helpers.mjs
  // gates on, so both cells agree about which frontier is live.
  const pr1aLanded = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    ["^[0-9]{4}_f_a3_pr1a_core_extractions$"])).rows[0].n === 1;
  assert.equal(await widenedWriters("staff_advance_application"),
    pr1aLanded
      ? "_resolve_and_book_bank_line_core, book_staff_advance_application"
      : "book_staff_advance_application, resolve_and_book_bank_line");
  assert.equal(await widenedWriters("bank_rule_suggested"), "accept_bank_rule_suggestion");
});
