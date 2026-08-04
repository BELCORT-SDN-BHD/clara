// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-r7-s5-census.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r7-s5-census.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (4): x42.r7.s5.census.1, x42.r7.s5.census.1b, x42.r7.s5.census.2, x42.r7.s5.census.3
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
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
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";

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

// A TEMP TABLE IS SESSION-SCOPED, so the create/read/drop sequence must share ONE connection
// — rootQuery/withActor({}, ...) each check a connection OUT of an 8-max pool (rig-helpers.mjs)
// and release it back, so two SEPARATE rootQuery calls are not guaranteed to land on the same
// backend. The house idiom (x41-round35-helpers.mjs's tieSweep) holds one `withActor` client
// for the whole sequence; followed here rather than the coincidental single-pool-connection
// behaviour a low-concurrency run happens to exhibit today.
test("x42.r7.s5.census.1 E1 reproduced: a column DEFAULT of now()::date deparses as (now())::date — the near-miss an author is most likely to write, and where the narrow arm was silent", async (t) => {
  if (skipHere(t)) return;
  const rows = await withActor({}, async (c) => {
    await c.query("create temp table t_r7_e1_probe (d date default now()::date, d2 date default current_timestamp::date, d3 date default transaction_timestamp()::date, d4 date default clock_timestamp()::date)");
    const r = await c.query(
      "select column_name, column_default from information_schema.columns where table_name='t_r7_e1_probe' order by column_name");
    await c.query("drop table t_r7_e1_probe");
    return r.rows;
  });
  assert.ok(rows.length === 4, `mandatory setup: the probe table must carry all four columns (got ${JSON.stringify(rows)})`);
  for (const r of rows) {
    assert.match(r.column_default, /^\(/, `${r.column_name}: Postgres must have wrapped the cast in a paren (got ${r.column_default}) — this IS the near-miss shape`);
    const narrowCatches = await posixMatch(r.column_default, NARROW);
    const widenedCatches = await posixMatch(r.column_default, FORBIDDEN);
    assert.equal(narrowCatches, false, `${r.column_name} (${r.column_default}): the PRE-round-7 narrow arm must be silent here — that silence is finding E1`);
    assert.equal(widenedCatches, true, `${r.column_name} (${r.column_default}): the WIDENED arm must catch this — E1's fix`);
  }
});

test("x42.r7.s5.census.1b the widened arm still exempts the lawful explicitly-zoned cast, raw AND as Postgres deparses it", async (t) => {
  if (skipHere(t)) return;
  const rows = await withActor({}, async (c) => {
    await c.query("create temp table t_r7_e1_ok (d date default (now() at time zone 'Asia/Kuala_Lumpur')::date, d2 date default (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date)");
    const r = await c.query(
      "select column_name, column_default from information_schema.columns where table_name='t_r7_e1_ok' order by column_name");
    await c.query("drop table t_r7_e1_ok");
    return r.rows;
  });
  for (const r of rows) {
    assert.equal(await posixMatch(r.column_default, FORBIDDEN), false,
      `${r.column_name} (${r.column_default}): an explicitly-zoned cast must stay exempt even after widening, or the eight round-6-ratified pre-existing bodies on arm (B)'s roster would fail`);
  }
});

// ===========================================================================
// x42.r7.s5.census.2 — THE WIDENED ARM, MEASURED AGAINST THE LIVE CATALOG: zero false
// positives across all five surfaces (functions, views, policies, column defaults,
// constraints) — the SAME measurement the migration's own S5.25(A)/(A2..A5) make, re-derived
// here independently so a later regression is caught in CI (the x42.s5c.5 "apply-time gate
// cannot stop a later regression" reasoning, applied to the WIDENED arm specifically).
// ===========================================================================
test("x42.r7.s5.census.2 the widened forbidden-clock arm is still EMPTY across all five live clara surfaces", async (t) => {
  if (skipHere(t)) return;
  const strip = "lower(regexp_replace(regexp_replace(regexp_replace(prosrc,'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const fns = (await rootQuery(
    `select coalesce(string_agg(proname, ', ' order by proname),'') as n from pg_proc
      where pronamespace='clara'::regnamespace and ${strip} ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(fns, "", `clara function(s) derive a date from the session clock under the WIDENED arm: ${fns}`);
  const views = (await rootQuery(
    `select coalesce(string_agg(c.relname, ', ' order by c.relname),'') as n
       from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and c.relkind in ('v','m') and lower(pg_get_viewdef(c.oid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(views, "", `clara view(s): ${views}`);
  const pol = (await rootQuery(
    `select coalesce(string_agg(tablename||'.'||policyname, ', '),'') as n from pg_policies
      where schemaname='clara' and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(pol, "", `clara RLS policy/policies: ${pol}`);
  const defs = (await rootQuery(
    `select coalesce(string_agg(c.relname||'.'||a.attname, ', '),'') as n
       from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
       join pg_class c on c.oid=d.adrelid join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and lower(pg_get_expr(d.adbin,d.adrelid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(defs, "", `clara column default(s): ${defs}`);
  const cons = (await rootQuery(
    `select coalesce(string_agg(conrelid::regclass::text||'.'||conname, ', '),'') as n from pg_constraint
      where connamespace='clara'::regnamespace and lower(pg_get_constraintdef(oid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(cons, "", `clara constraint(s): ${cons}`);
});

// ===========================================================================
// x42.r7.s5.census.3 — E2 REPRODUCED: a SQL-standard-body function's prosrc is the empty
// string; pg_get_functiondef(oid) still surfaces its body text. Fresh census on the live
// catalog (never cited from memory): 587 functions measured on the round-7 DB — this cell
// re-measures the count LIVE rather than pinning the literal number, since the exact count is
// not this migration's business, only the "0 with prosqlbody" fact and the deparse behaviour
// are.
// ===========================================================================
test("x42.r7.s5.census.3 E2 reproduced: a SQL-standard-body function's prosrc is empty; the widened source (prosrc || pg_get_functiondef) still sees it", async (t) => {
  if (skipHere(t)) return;
  const before_ = (await rootQuery(
    "select count(*)::int as total, count(*) filter (where prosqlbody is not null)::int as sqlbody from pg_proc where pronamespace='clara'::regnamespace")).rows[0];
  assert.equal(Number(before_.sqlbody), 0, `mandatory precondition (not this migration's business to change): 0 of ${before_.total} live clara functions use prosqlbody TODAY — the hole is in the instrument, not a current violation`);

  await rootQuery("create schema if not exists clara_r7_e1_probe");
  await rootQuery(
    "create function clara_r7_e1_probe.f_sqlbody(text) returns date language sql stable begin atomic select current_date; end");
  const row = (await rootQuery(
    "select prosrc, prosqlbody is not null as has_sqlbody, pg_get_functiondef(oid) as def from pg_proc where pronamespace='clara_r7_e1_probe'::regnamespace and proname='f_sqlbody'")).rows[0];
  await rootQuery("drop schema clara_r7_e1_probe cascade");

  assert.equal(row.prosrc, "", "mandatory setup: a SQL-standard-body function's prosrc really is the empty string, not null and not the body");
  assert.equal(row.has_sqlbody, true, "…and prosqlbody really is populated instead");
  assert.match(row.def, /current_date/i, "pg_get_functiondef(oid) must surface the body text prosrc could not");
  // JS \b (word boundary) here, not Postgres's \m\M — plain ASCII, both engines agree, and
  // unlike the POSIX-pattern cells above this check needs no round trip through Postgres.
  const currentDateWord = /\bcurrent_date\b/i;
  // The narrow, prosrc-only predicate the pre-round-7 censuses used: BLIND.
  assert.equal(currentDateWord.test(row.prosrc), false, "the prosrc-only predicate sees NOTHING — this IS the concealment E2 names");
  // The widened predicate this lane's S5.15e/S5.25 edits now use: SEES IT.
  const widened = (row.prosrc ?? "") + (row.def ?? "");
  assert.equal(currentDateWord.test(widened), true, "prosrc || pg_get_functiondef(oid) must see the SQL-standard body");
});
