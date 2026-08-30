// Gate G1 PR-2b — the close_prep PRODUCER, against a real rig. #437 shipped closePrep_v1 (the
// consumer) and measured no producer exists (PROGRESS.md 2026-08-30 noon). This file proves the
// missing half: reconciler-close-prep.mjs's produceClosePrepTasks(). Mirrors reconcile-fa.test.mjs's
// own shape (real rig, per-client fixtures built through audited verbs) — never a mock pg client,
// because the belt's own logic is thin glue over real SQL.
//
// REWRITTEN AT THE G1 PR-2b FOLD (Codex r1 review of #449 — HIGH-3, MEDIUM-4). Idempotency is
// now DB-owned via clara.claim_close_prep_task (UNIQUE(fiscal_year_id), with atomic reclaim of
// a terminal-task row) — the runtime no longer inserts into clara.agent_tasks directly at all,
// so the OLD "plant a raw row" cell no longer describes a reachable code path and is replaced.
//
// close_prep is a GLOBAL registry row (wake_engine_sources has no firm_id, wake-engine.test.mjs's
// own header note) — this file toggles the REAL close_prep row 0133 seeded, restoring it to
// enabled=false in after() so no other suite run against this rig inherits a stray flip.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after, describe } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, endPool, getPool } from "./relay-fixtures.mjs";
import { produceClosePrepTasks } from "../lib/reconciler-close-prep.mjs";

async function hasClosePrepDue() {
  const r = await rootQuery("select to_regprocedure('clara.close_prep_due()') is not null as ok");
  return r.rows[0]?.ok === true;
}
const HAS_ORACLE = await hasClosePrepDue();
const skip = HAS_ORACLE ? false : "clara.close_prep_due() absent — migrate the target first";

async function hasClaimDoor() {
  const r = await rootQuery("select to_regprocedure('clara.claim_close_prep_task(uuid,uuid,uuid,text)') is not null as ok");
  return r.rows[0]?.ok === true;
}
const HAS_CLAIM_DOOR = await hasClaimDoor();
const skipClaim = HAS_CLAIM_DOOR ? false : "clara.claim_close_prep_task absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

after(async () => {
  // Restore the REAL registry row to its shipped default (0133: enabled=false) regardless of what
  // this file did to it, so a later suite sharing this rig never inherits a stray enable.
  await rootQuery(
    "update clara.wake_engine_sources set enabled=false, disabled_by=null, disabled_at=null, disabled_reason='g1-producers-close-prep.test.mjs after() restore' where source_key='close_prep'",
  );
  await endPool();
});

async function setCloseEnabled(on, actor) {
  await rootQuery(
    `update clara.wake_engine_sources set enabled=$1,
        enabled_by = case when $1 then $2 else enabled_by end,
        enabled_at = case when $1 then now() else enabled_at end
      where source_key='close_prep'`,
    [on, actor ?? null],
  );
}

/** Book-clock-relative dates (never a calendar literal — the x42 clock law). */
async function bookToday() {
  const r = await rootQuery("select clara._book_today()::text as t");
  return r.rows[0].t;
}

/** An OPEN fiscal year that ended yesterday on the book clock — close_prep_due()'s own admission
 *  (0138 §F): status='open', ends_on <= _book_today(), no hold, no run, no active close receipt,
 *  no credential minted in the window. Built through the ONE audited writer, open_fiscal_year.
 *  NONE of close_prep_due()'s own admission conditions look at clara.agent_tasks or the new
 *  claims table, so this FY stays reported "due" across ticks regardless of what THIS belt has
 *  done with it — which is exactly what the reclaim cell below needs. */
async function buildOverdueFiscalYear(w, label) {
  const today = await bookToday();
  const startsOn = await rootQuery("select ($1::date - interval '1 year')::date::text as s", [today]);
  const endsOn = await rootQuery("select ($1::date - interval '1 day')::date::text as e", [today]);
  const r = await humanQuery(
    w.owner,
    `select clara.open_fiscal_year(p_client=>$1,p_label=>$2,p_starts_on=>$3::date,p_ends_on=>$4::date,
       p_length_reason=>$5,p_op_key=>$6) as r`,
    [w.client, label, startsOn.rows[0].s, endsOn.rows[0].e, "g1 pr-2b rig fixture — an FY that ended yesterday", opk("g1pr2b-fy")],
  );
  return r.rows[0].r.fiscal_year_id;
}

async function taskCountFor(clientId) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.agent_tasks where kind='close_prep' and client_id=$1",
    [clientId],
  );
  return r.rows[0].n;
}

async function liveTaskFor(clientId) {
  const r = await rootQuery(
    "select id, status, model_snapshot from clara.agent_tasks where kind='close_prep' and client_id=$1 order by created_at desc limit 1",
    [clientId],
  );
  return r.rows[0] ?? null;
}

test("close_prep producer: DISABLED source appends nothing, even with a genuinely overdue FY", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-off");
  await buildOverdueFiscalYear(w, "FY-off");
  await setCloseEnabled(false);
  const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(out.closePrepOk, true);
  assert.equal(out.dormant, false, "the oracle exists — this is a disabled-source no-op, not dormancy");
  assert.equal(out.closePrepQueued, 0, "a disabled source must queue ZERO tasks");
  assert.equal(await taskCountFor(w.client), 0, "and nothing landed in agent_tasks either");
});

test("close_prep producer: ENABLED + overdue FY queues exactly one task, correctly shaped", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-on");
  await buildOverdueFiscalYear(w, "FY-on");
  await setCloseEnabled(true, w.owner);
  const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(out.closePrepOk, true);
  assert.ok(out.closePrepQueued >= 1, `expected at least one queued task, got ${JSON.stringify(out)}`);
  const task = await liveTaskFor(w.client);
  assert.ok(task, "a close_prep task must exist for this client");
  assert.equal(task.status, "queued", "a close_prep task is born queued (0120's insert-arm law)");
  assert.ok(task.model_snapshot && task.model_snapshot.trim().length > 0, "model_snapshot must be non-blank (the insert-trigger's own requirement)");
});

// NOTE ON SCOPE, every cell below: close_prep_due() is REAL, uncontrolled data (unlike
// bank_agent's own rig-only stub) — it scans EVERY open/reopened fiscal year across the WHOLE
// rig, so an EARLIER test's own overdue FY (built while the source happened to be disabled, or
// simply not yet claimed) can still be picked up on a LATER test's tick and inflate the belt's
// own AGGREGATE counters. Every assertion below is therefore scoped to THIS test's own client
// (taskCountFor/liveTaskFor), never to the belt's whole-rig totals, exactly the same discipline
// the very first cut of this file already used for its "at least one" checks.

test("close_prep producer: TWO TICKS in a row queue exactly ONE task for the same client (DB-owned claim, HIGH-3)", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-2t");
  await buildOverdueFiscalYear(w, "FY-2tick");
  await setCloseEnabled(true, w.owner);
  const first = await asRuntime((c) => produceClosePrepTasks(c, {}));
  const second = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(first.closePrepOk, true);
  assert.equal(second.closePrepOk, true);
  assert.equal(await taskCountFor(w.client), 1, "exactly ONE close_prep task must exist for this client after two ticks");
});

test("close_prep producer: a pre-existing LIVE claim (via claim_close_prep_task directly) is skipped by the belt, not doubled", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-live");
  const fy = await buildOverdueFiscalYear(w, "FY-live");
  await setCloseEnabled(true, w.owner);
  // Plant the live claim directly through the SAME door the belt itself uses — proves the
  // belt's OWN skip is driven by the DB's own claim state, not by a runtime-side memory of what
  // IT queued.
  const planted = await asRuntime((c) => c.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fy, "planted-by-this-cell"]));
  assert.equal(planted.rows[0].r.appended, true);
  const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(out.closePrepOk, true);
  assert.equal(await taskCountFor(w.client), 1, "still exactly one row — the planted one, untouched");
});

test("close_prep producer: once the claimed task reaches a TERMINAL state, the SAME still-due FY is reclaimed on the next tick (a reopened FY must not stay stuck)", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-reclaim");
  await buildOverdueFiscalYear(w, "FY-reclaim");
  await setCloseEnabled(true, w.owner);
  await asRuntime((c) => produceClosePrepTasks(c, {}));
  const firstTask = await liveTaskFor(w.client);
  assert.ok(firstTask, "the first tick must have queued a task for this client");
  // Terminalize it directly (mirrors the consumer's own eventual settle — this belt does not
  // touch settlement, only production). The live matrix admits queued->running->{completed,...}
  // only — a bare queued->completed is illegal (0120's own transition arm) — so the two-step
  // path is the honest one, not a shortcut. close_prep_due()'s own admission law does not look
  // at agent_tasks/close_prep_fy_claims at all, so the SAME FY is still reported due on the next
  // tick — exactly the schedule that would otherwise leave a reopened FY stuck behind a resolved
  // claim.
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [firstTask.id]);
  await rootQuery("update clara.agent_tasks set status='completed' where id=$1", [firstTask.id]);
  await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(await taskCountFor(w.client), 2, "two tasks now exist for this client — the terminal one and the fresh reclaim");
  const newest = await liveTaskFor(w.client);
  assert.notEqual(newest.id, firstTask.id, "the reclaim must mint a genuinely NEW task id");
  assert.equal(newest.status, "queued", "a terminal-task claim must be RECLAIMED, not treated as still-live");
});

/** An EARLIER overdue fiscal year, opened BEFORE buildOverdueFiscalYear(w, ...)'s own period so
 *  the two chain FORWARD contiguously (fiscal years open in strictly chronological order — the
 *  contiguity wall refuses backfilling an earlier period once a later one already exists). Both
 *  periods end before _book_today(), so both are independently overdue. */
async function buildEarlierOverdueFiscalYear(w, label) {
  const today = await bookToday();
  const startsOn = await rootQuery("select ($1::date - interval '2 years')::date::text as s", [today]);
  const endsOn = await rootQuery("select ($1::date - interval '1 year' - interval '1 day')::date::text as e", [today]);
  const r = await humanQuery(
    w.owner,
    `select clara.open_fiscal_year(p_client=>$1,p_label=>$2,p_starts_on=>$3::date,p_ends_on=>$4::date,
       p_length_reason=>$5,p_op_key=>$6) as r`,
    [w.client, label, startsOn.rows[0].s, endsOn.rows[0].e, "g1 pr-2b rig fixture — an EARLIER, contiguous, also-overdue FY", opk("g1pr2b-fy-earlier")],
  );
  return r.rows[0].r.fiscal_year_id;
}

test("FIND-6: a SECOND overdue fiscal year for the SAME client is refused client_has_live_close_prep while the first stays live — and clears once the first goes terminal", { skip: skip || skipClaim }, async () => {
  const w = await buildFirm("g1cp-onelive");
  // Opened in FORWARD chronological order (the contiguity wall requires it); fyB is the one this
  // cell claims FIRST (arbitrary — the wall this cell proves does not care about opening order).
  const fyB = await buildEarlierOverdueFiscalYear(w, "FY-onelive-b");
  const fyA = await buildOverdueFiscalYear(w, "FY-onelive-a");
  const claimA = await asRuntime((c) => c.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fyA, "onelive-a"]));
  assert.equal(claimA.rows[0].r.appended, true, "the FIRST fiscal year's claim must succeed — the client has no live task yet");
  const claimB = await asRuntime((c) => c.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fyB, "onelive-b"]));
  assert.equal(claimB.rows[0].r.appended, false, "a SECOND, DIFFERENT fiscal year for the SAME client must be refused while the first task is still live");
  assert.equal(claimB.rows[0].r.reason, "client_has_live_close_prep", "the refusal must name the client-scoped wall, not 'already_claimed' (that wall is per-fiscal-year, this one fired instead)");
  assert.equal(await taskCountFor(w.client), 1, "only ONE task exists for this client — the second claim never inserted anything");

  // Terminalize the FIRST task — the client's one live slot opens up — and prove fyB's OWN claim
  // (never touched by fyA's own reclaim, which is scoped to fyA's fiscal_year_id) now succeeds.
  const liveA = await liveTaskFor(w.client);
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [liveA.id]);
  await rootQuery("update clara.agent_tasks set status='completed' where id=$1", [liveA.id]);
  const claimBRetry = await asRuntime((c) => c.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fyB, "onelive-b-retry"]));
  assert.equal(claimBRetry.rows[0].r.appended, true, "once the first task is terminal, the SECOND fiscal year's own claim must now succeed");
  assert.equal(await taskCountFor(w.client), 2, "both fiscal years now carry their own task");
});

test("close_prep producer: absent close_prep_due/claim_close_prep_task surface is DORMANT, never a failure", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/reconciler-close-prep.mjs", import.meta.url), "utf8"),
  );
  assert.match(src, /checkFunctionSurface/, "the belt must use the shared shape-checking helper (MEDIUM-4), not a bare to_regprocedure probe");
  assert.match(src, /dormant:\s*true/, "an absent surface must answer dormant:true, never throw");
});

// =====================================================================================
// MEDIUM-4 — a PRESENT but WRONGLY-SHAPED surface is a belt FAILURE, never dormancy.
// =====================================================================================

describe("close_prep producer: MEDIUM-4 — present-but-invalid surfaces are a belt failure, not dormancy", { skip }, () => {
  test("a SCALAR jsonb close_prep_due() (a SETOF is expected) is refused, not silently treated as dormant", async () => {
    await rootQuery("create or replace function clara._g1pr2b_shadow_scalar() returns jsonb language sql as $$ select '{}'::jsonb $$");
    await rootQuery("alter function clara.close_prep_due() rename to _g1pr2b_close_prep_due_real");
    await rootQuery("alter function clara._g1pr2b_shadow_scalar() rename to close_prep_due");
    try {
      const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
      assert.equal(out.closePrepOk, false, "a scalar function must NOT satisfy the SETOF surface check");
      assert.equal(out.dormant, false);
    } finally {
      await rootQuery("alter function clara.close_prep_due() rename to _g1pr2b_shadow_scalar");
      await rootQuery("drop function clara._g1pr2b_shadow_scalar()");
      await rootQuery("alter function clara._g1pr2b_close_prep_due_real() rename to close_prep_due");
    }
  });

  test("a TEXT-returning claim_close_prep_task with the same name/arity is refused", { skip: skipClaim }, async () => {
    await rootQuery("alter function clara.claim_close_prep_task(uuid,uuid,uuid,text) rename to _g1pr2b_claim_real");
    await rootQuery("create function clara.claim_close_prep_task(p_firm uuid, p_client uuid, p_fiscal_year uuid, p_model_snapshot text) returns text language sql as $$ select 'nope' $$");
    await rootQuery("grant execute on function clara.claim_close_prep_task(uuid,uuid,uuid,text) to clara_runtime");
    try {
      const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
      assert.equal(out.closePrepOk, false);
      assert.equal(out.dormant, false);
    } finally {
      await rootQuery("drop function clara.claim_close_prep_task(uuid,uuid,uuid,text)");
      await rootQuery("alter function clara._g1pr2b_claim_real(uuid,uuid,uuid,text) rename to claim_close_prep_task");
    }
  });
});

// =====================================================================================
// HIGH-2 (symmetry with bank_agent's own fold) — the SECURITY DEFINER owner.
// =====================================================================================

test("HIGH-2 symmetry: claim_close_prep_task is owned by clara_fn_owner, SECURITY DEFINER, search_path pinned, clara_runtime-only ACL", { skip: skipClaim }, async () => {
  const r = await rootQuery(
    `select p.proowner::regrole::name as owner, p.prosecdef as secdef,
            'search_path=clara, pg_temp' = any(coalesce(p.proconfig,'{}'::text[])) as path_pinned
       from pg_proc p where p.oid = 'clara.claim_close_prep_task(uuid,uuid,uuid,text)'::regprocedure`,
  );
  assert.equal(r.rows[0].owner, "clara_fn_owner");
  assert.equal(r.rows[0].secdef, true);
  assert.equal(r.rows[0].path_pinned, true);
  const sig = "clara.claim_close_prep_task(uuid,uuid,uuid,text)";
  for (const role of ["public", "clara_authenticated"]) {
    const priv = await rootQuery("select has_function_privilege($2, $1, 'execute') as ok", [sig, role]);
    assert.equal(priv.rows[0].ok, false, `${role} must NOT be able to execute claim_close_prep_task`);
  }
});

// =====================================================================================
// HIGH-3 — the DB-owned claim under REAL concurrency (two independent connections, barriered).
// =====================================================================================

test("HIGH-3: two independent runtime connections racing the SAME fiscal_year_id — exactly one appended, one skipped", { skip: skipClaim }, async () => {
  const w = await buildFirm("g1cp-race");
  const fy = await buildOverdueFiscalYear(w, "FY-race");

  const pool = getPool();
  const c1 = await pool.connect();
  const c2 = await pool.connect();
  try {
    await c1.query("set role clara_runtime");
    await c2.query("set role clara_runtime");
    const [r1, r2] = await Promise.all([
      c1.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fy, "race-1"]),
      c2.query("select clara.claim_close_prep_task($1,$2,$3,$4) as r", [w.firm, w.client, fy, "race-2"]),
    ]);
    const results = [r1.rows[0].r, r2.rows[0].r];
    assert.equal(results.filter((r) => r.appended === true).length, 1, `exactly one concurrent call must have appended, got ${JSON.stringify(results)}`);
    assert.equal(results.filter((r) => r.appended === false).length, 1, `exactly one must have been skipped, got ${JSON.stringify(results)}`);
    assert.equal(await taskCountFor(w.client), 1, "exactly one task survived the race");
  } finally {
    await c1.query("reset role").catch(() => {});
    await c2.query("reset role").catch(() => {});
    c1.release();
    c2.release();
  }
});
