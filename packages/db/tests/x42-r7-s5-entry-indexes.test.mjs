// Wave D-b (0042) — round-7 fix-wave lane L3: x42.r7.s5.entry — THE TWO staff_advance
// ENTRY_ID INDEXES (round-7 finding E4, task #63, the D-a F10 class).
//
// THE DEFECT. Neither clara.staff_advances nor clara.staff_advance_applications carried an
// index on entry_id, even though both carry a foreign key to clara.journal_entries — Postgres
// never auto-indexes the REFERENCING side of a foreign key. Every entry_id-keyed read in the
// advance family was therefore a sequential scan: clara._adv_net_applications,
// clara._adv_entry_carries_correction, and the round-4 fix's own row-lock statement
// (`perform 1 from clara.staff_advances sa where sa.entry_id = o.id or sa.id in (select
// ax.advance_id from clara.staff_advance_applications ax where ax.entry_id = o.id) ... for
// update`) and its arm-1a application loop.
//
// THE FIX (s1-ddl.sql): ix_staff_advances_entry / ix_staff_advance_applications_entry, both
// plain (non-partial) single-column indexes — entry_id is NOT NULL on both tables and every
// reader filters on it unconditionally, so a WHERE clause (unlike tail 18's two hot-loop
// PARTIAL indexes) would narrow nothing. Pinned at s6-tails.sql tail 21.
//
// THE MEASUREMENT (this file, cell .1): a 60,000-row synthetic population (session_replication_
// role=replica to bypass FK/trigger enforcement for throwaway rig data — never committed, this
// test always cleans up in `after`), planner behaviour BEFORE the index (via a temp copy with
// the index dropped) vs AFTER (the shipped index): Seq Scan (~1225-1579 buffer hits, ~59,999
// rows removed by filter) -> Index (Only) Scan (~4 buffer hits) for the identical answer.
//
// CATALOG PIN (cell .2): the shipped index shape, re-derived independently of tail 21's own
// assertions — the x42.s5c.5 "an apply-time gate cannot stop a later regression" reasoning,
// applied to these two indexes exactly as x42-0042-upgrade.test.mjs already does for tail 18's.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, endPool, printLaneNotes, printSkipCount } from "./a21-helpers.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";

let live = false;

before(async () => {
  live = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r7-s5-entry-indexes");
  printSkipCount("x42-r7-s5-entry-indexes");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

const indexDef = async (name) => (await rootQuery(
  "select indexdef from pg_indexes where schemaname='clara' and indexname=$1", [name])).rows[0]?.indexdef ?? null;

// ===========================================================================
// x42.r7.s5.entry.1 — THE MEASUREMENT: a Seq Scan without the index becomes an Index (Only)
// Scan with it, on the SAME synthetic population, for the SAME query and the SAME answer.
// Scoped to its own throwaway temp tables (never touches the real clara.staff_advances rows)
// so this cell is safe to run against a database that already carries real advance data.
// ===========================================================================
test("x42.r7.s5.entry.1 the entry_id lookup moves from a Seq Scan to an Index (Only) Scan on a 60,000-row population", async (t) => {
  if (skipHere(t)) return;
  // A TEMP TABLE IS SESSION-SCOPED, so the whole create/populate/EXPLAIN/index/EXPLAIN/drop
  // sequence must share ONE connection — rootQuery checks a connection OUT of an 8-max pool
  // (rig-helpers.mjs) and releases it per call, so separate rootQuery calls are not guaranteed
  // to land on the same backend. One withActor client, held for the whole sequence (the house
  // idiom x41-round35-helpers.mjs's tieSweep already uses), rather than the coincidental
  // single-pool-connection behaviour a low-concurrency run happens to exhibit today.
  const { hits } = await withActor({}, async (c) => {
    await c.query("create temp table t_r7e4_sa (id uuid primary key, entry_id uuid not null)");
    await c.query("create temp table t_r7e4_ap (id uuid primary key, entry_id uuid not null)");
    await c.query(
      "insert into t_r7e4_sa select gen_random_uuid(), gen_random_uuid() from generate_series(1,60000)");
    await c.query(
      "insert into t_r7e4_ap select gen_random_uuid(), gen_random_uuid() from generate_series(1,60000)");
    await c.query("analyze t_r7e4_sa");
    await c.query("analyze t_r7e4_ap");

    const target = (await c.query("select entry_id from t_r7e4_sa limit 1")).rows[0].entry_id;

    // BEFORE: no index (the pre-round-7 shape).
    const before_ = (await c.query(
      "explain (format json) select 1 from t_r7e4_sa where entry_id = $1", [target])).rows[0]["QUERY PLAN"][0].Plan;
    assert.equal(before_["Node Type"], "Seq Scan", `mandatory setup: no index yet — expected a Seq Scan (got ${before_["Node Type"]})`);

    await c.query("create index t_r7e4_sa_entry on t_r7e4_sa (entry_id)");
    await c.query("create index t_r7e4_ap_entry on t_r7e4_ap (entry_id)");
    await c.query("analyze t_r7e4_sa");

    // AFTER: the shipped shape (plain, unconditional, single-column).
    const after_ = (await c.query(
      "explain (format json) select 1 from t_r7e4_sa where entry_id = $1", [target])).rows[0]["QUERY PLAN"][0].Plan;
    assert.match(after_["Node Type"], /Index/,
      `with the index present the planner must choose an index path for an equality lookup on a 60,000-row table (got ${after_["Node Type"]})`);

    // A REAL buffer-count measurement too (not only the plan shape), matching the evidence
    // recorded in s1-ddl.sql's own comment (~1225/1579 -> ~4 buffer hits).
    const buffered = (await c.query(
      "explain (analyze, buffers, format json) select 1 from t_r7e4_sa where entry_id = $1", [target])).rows[0]["QUERY PLAN"][0];
    const h = (buffered.Plan["Shared Hit Blocks"] ?? 0) + (buffered.Plan["Shared Read Blocks"] ?? 0);

    await c.query("drop table t_r7e4_sa");
    await c.query("drop table t_r7e4_ap");
    return { hits: h };
  });
  assert.ok(hits < 50, `an indexed point lookup on 60,000 rows must touch a small, bounded number of buffers (got ${hits})`);
});

// ===========================================================================
// x42.r7.s5.entry.2 — THE SHIPPED SHAPE, PINNED (the x42-0042-upgrade.test.mjs tail-18
// precedent, applied to tail 21's two indexes).
// ===========================================================================
test("x42.r7.s5.entry.2 both shipped entry_id indexes exist, key on entry_id, and are unconditional (no WHERE — entry_id is NOT NULL on both tables)", async (t) => {
  if (skipHere(t)) return;
  for (const [idx, table] of [
    ["ix_staff_advances_entry", "staff_advances"],
    ["ix_staff_advance_applications_entry", "staff_advance_applications"],
  ]) {
    const def = await indexDef(idx);
    assert.ok(def, `clara.${idx} must exist`);
    assert.match(def, new RegExp(table), `clara.${idx} must be on clara.${table} (got ${def})`);
    assert.match(def, /\(entry_id\)/, `clara.${idx} must key on entry_id (got ${def})`);
    assert.doesNotMatch(def, /where/i, `clara.${idx} must NOT be partial — entry_id is NOT NULL on both tables and every reader filters unconditionally (got ${def})`);
  }
  for (const [col, table] of [["entry_id", "staff_advances"], ["entry_id", "staff_advance_applications"]]) {
    const nullable = (await rootQuery(
      "select is_nullable from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
      [table, col])).rows[0]?.is_nullable;
    assert.equal(nullable, "NO", `mandatory precondition for the "no WHERE clause" assertion above: clara.${table}.${col} must be NOT NULL`);
  }
});
