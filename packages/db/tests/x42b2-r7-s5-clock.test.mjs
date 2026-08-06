// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-r7-s5-clock.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r7-s5-clock.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (2): x42.r7.s5c.4, x42.r7.s5c.5
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
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
import { x42S5Ready, x42S5SkipHere, S5_25_BARE_TOKEN_RE, s5BareTokenRoster } from "./x42-s5-helpers.mjs";

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
// x42.r7.s5c.4 [WDB-R4, a path the fix did not think of] — THE PAIR MACHINE'S completed_at
// vs THE CORRECTION DATE. The split this fix introduces (clara._book_today() now
// statement-pinned; completed_at/approved_at still transaction-pinned, deliberately —
// s2-adjustments' territory, out of the widened register) is measured as REAL, then the tail
// 17 ramp predicate is read from the live catalog to prove nothing compares the two clocks
// against each other today.
// ===========================================================================
test("x42.r7.s5c.4 [WDB-R4 off-path] the completed_at/approved_at audit clock and the _book_today() money-date clock can now diverge within one transaction — measured, then shown benign against the shipped ramp predicate", async (t) => {
  if (skipHere(t)) return;
  // (a) THE SPLIT IS REAL. Reproduces s5c.1's mechanism against the LITERAL expression
  // clara.adjustment_pair_reversals.completed_at is stamped from (now()) side by side with
  // clara._book_today()'s own instant, inside ONE transaction.
  const { before: b, after: a } = await withActor({ role: ROLES.fnOwner, transaction: true }, async (c) => {
    const r1 = await c.query("select now() as completed_at_clock, clara._book_today() as book, (statement_timestamp() at time zone 'Asia/Kuala_Lumpur') as book_instant");
    await c.query("select pg_sleep(1.2)");
    const r2 = await c.query("select now() as completed_at_clock, clara._book_today() as book, (statement_timestamp() at time zone 'Asia/Kuala_Lumpur') as book_instant");
    return { before: r1.rows[0], after: r2.rows[0] };
  });
  assert.equal(a.completed_at_clock.getTime(), b.completed_at_clock.getTime(),
    "completed_at's own clock (now()) stays fixed for the transaction — unchanged by this fix, and deliberately so (s2-adjustments' territory)");
  assert.ok(a.book_instant.getTime() > b.book_instant.getTime(),
    "…while the authority's instant keeps moving — the two audit/money clocks are NO LONGER guaranteed to co-move inside one transaction, which they always did before 0042 (both were now()-based)");

  // (b) THE SPLIT IS BENIGN TODAY, PROVED RATHER THAN ASSUMED: the shipped ramp predicate
  // (tail 17; clara._adj_run_occurrence_core) is read from the catalog and must compare
  // completed_at/approved_at only against EACH OTHER (via greatest()), never against
  // clara._book_today() or clara._fa_today() — if a future author ever wired the ramp clock
  // to compare against the money-date authority, THIS assertion is what would need to be
  // revisited, and it is named here so that reviewer does not have to rediscover the question.
  const rampBody = await bodyOf("_adj_run_occurrence_core");
  assert.ok(rampBody, "clara._adj_run_occurrence_core must exist (the ramp derivation)");
  assert.ok(rampBody.includes("completed_at") && rampBody.includes("greatest("),
    "mandatory setup: the ramp predicate must still read completed_at under a greatest() unification (tail 17)");
  assert.ok(
    !/completed_at[^;]{0,200}_book_today\(\)|_book_today\(\)[^;]{0,200}completed_at/.test(rampBody)
      && !/approved_at[^;]{0,200}_book_today\(\)|_book_today\(\)[^;]{0,200}approved_at/.test(rampBody),
    "the ramp predicate must not compare completed_at/approved_at against clara._book_today() — round-7 finding C's split makes such a comparison meaningless across a transaction boundary, and none exists today",
  );
});

// ===========================================================================
// x42.r7.s5c.5 [round-8 M4 finding F2] — S5.25's clock census gains a FIFTH arm because the
// first four only fire on an EXPLICIT `::date` cast of one of the six clock-fn tokens.
// PostgreSQL's own ASSIGNMENT-CAST semantics let a body write `v_date date; v_date := now();`
// or hand a timestamptz straight to a `date` column in an INSERT, with NO `::date` token
// anywhere in source — every pre-round-8 arm stayed silent on both shapes, reproducible on
// the SHIPPED S5.25 text verbatim (round-8 M4 probe f2-repro.sql). This cell plants BOTH
// decoy shapes through the REAL harness (a genuine `create function` as clara_fn_owner, not a
// literal string fed to a regex) and proves the NEW bare-token arm (D) is the one that closes
// them — matching this file's own "prove the mechanism, not the spelling" law.
// ===========================================================================
test("x42.r7.s5c.5 [round-8 M4 F2] the bare-token arm catches a real assignment-cast decoy and a real INSERT-into-date-column decoy, neither carrying a ::date token", async (t) => {
  if (skipHere(t)) return;
  const DECOY_ASSIGN = "_x8m4_decoy_assign_r7";
  const DECOY_INSERT = "_x8m4_decoy_insert_r7";
  const DECOY_TBL = "_x8m4_decoy_tbl_r7";
  const BARE = S5_25_BARE_TOKEN_RE;
  try {
    await withActor({ role: ROLES.fnOwner }, async (c) => {
      // (a) the ordinary PL/pgSQL assignment-cast idiom — a `date`-typed local fed straight
      // from now(), no ::date token anywhere.
      await c.query(`create or replace function clara.${DECOY_ASSIGN}() returns date
        language plpgsql as $$
        declare v_date date;
        begin
          v_date := now();
          return v_date;
        end $$`);
      // (b) an INSERT handing a timestamptz straight to a date-typed column — the
      // assignment-cast happens at the EXECUTOR level, never touching the parser's ::date path.
      await c.query(`create table if not exists clara.${DECOY_TBL} (id serial primary key, d date)`);
      await c.query(`create or replace function clara.${DECOY_INSERT}() returns void
        language plpgsql as $$
        begin
          insert into clara.${DECOY_TBL} (d) values (now());
        end $$`);
    });

    // BARE is Postgres's own \m/\M word-boundary regex dialect (the ~* operator), not a JS
    // RegExp — every match against it stays SQL-side rather than risking a silent divergence.
    const bareMatches = async (text) => (await rootQuery("select $1 ~* $2 as hit", [text, BARE])).rows[0].hit;
    for (const [fn, label] of [[DECOY_ASSIGN, "assignment-cast"], [DECOY_INSERT, "INSERT-into-date-column"]]) {
      const body = await bodyOf(fn);
      assert.ok(body, `${fn} must exist after planting (mandatory setup)`);
      assert.doesNotMatch(body, /::\s*date/i,
        `${fn} (${label}): the decoy's whole point is carrying NO explicit ::date cast — a cast here would mean arm (A) already caught it and this cell measured nothing`);
      assert.equal(await bareMatches(body), true, `${fn} (${label}): the bare-token arm (D) detector must match this body`);
    }

    // Independent re-derivation of arm (D)'s ROSTER predicate against the LIVE (decoy-planted)
    // catalog: both decoys must appear as unrostered bare-token bodies, distinct from
    // clara._book_today() itself, which the arm exempts BY NAME.
    const flagged = (await rootQuery(
      `select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '') as n
         from pg_proc p
        where p.pronamespace = 'clara'::regnamespace
          and p.proname <> '_book_today'
          and p.proname = any($1)
          and lower(regexp_replace(regexp_replace(regexp_replace(
                coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))
              ~* $2`,
      [[DECOY_ASSIGN, DECOY_INSERT], BARE])).rows[0].n;
    assert.equal(flagged, `${DECOY_ASSIGN}, ${DECOY_INSERT}`,
      `both decoys must be flagged by arm (D)'s roster-exclusion predicate (got: ${flagged})`);

    // (c) THE LIVE CATALOG PASSES WITH THE ALLOWLIST EXACTLY AS MEASURED, decoys excluded
    // (dropped in the finally block below, so this reads the catalog as 0042 ships it) — every
    // name is listed via the shared x42-s5-helpers.mjs roster, not re-typed here.
    const wholeCatalog = (await rootQuery(
      `select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '') as n
         from pg_proc p
        where p.pronamespace = 'clara'::regnamespace
          and p.proname <> '_book_today' and p.proname not in ($1, $2)
          and lower(regexp_replace(regexp_replace(regexp_replace(
                coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))
              ~* $3`,
      [DECOY_ASSIGN, DECOY_INSERT, BARE])).rows[0].n;
    // 0046: the roster is frontier-aware — `db-slice-frontiers` runs this battery against
    // databases pinned at 0042-0045, where §7-A's three names do not exist yet.
    const roster = await s5BareTokenRoster(rootQuery);
    assert.equal(wholeCatalog, roster.join(", "),
      "arm (D)'s live bare-token roster (decoys excluded) must be exactly the round-8 M4 measurement");

    // (d) clara._book_today() itself DOES match the bare pattern (it calls statement_timestamp())
    // — the exemption is the NAME exclusion above, not an accident of the pattern missing it.
    const bookToday = (await bodyOf("_book_today"));
    assert.equal(await bareMatches(bookToday), true, "mandatory setup: clara._book_today()'s own body must match the bare pattern");

    noteLane(`s5c.5 [F2] both decoys caught; the live roster (decoys excluded) is exactly ${roster.length} names; _book_today() matches the pattern but is exempted by name`);
  } finally {
    // Never leave a decoy behind for a sibling test/lane to trip over.
    await withActor({ role: ROLES.fnOwner }, async (c) => {
      await c.query(`drop function if exists clara.${DECOY_ASSIGN}()`);
      await c.query(`drop function if exists clara.${DECOY_INSERT}()`);
      await c.query(`drop table if exists clara.${DECOY_TBL}`);
    });
  }
});
