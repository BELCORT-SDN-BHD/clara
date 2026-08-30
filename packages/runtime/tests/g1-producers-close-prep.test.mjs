// Gate G1 PR-2b — the close_prep PRODUCER, against a real rig. #437 shipped closePrep_v1 (the
// consumer) and measured no producer exists (PROGRESS.md 2026-08-30 noon). This file proves the
// missing half: reconciler-close-prep.mjs's produceClosePrepTasks(). Mirrors reconcile-fa.test.mjs's
// own shape (real rig, per-client fixtures built through audited verbs) — never a mock pg client,
// because the belt's own logic is thin glue over real SQL.
//
// close_prep is a GLOBAL registry row (wake_engine_sources has no firm_id, wake-engine.test.mjs's
// own header note) — this file toggles the REAL bank_agent/close_prep rows 0133 seeded, restoring
// both to enabled=false in after() so no other suite run against this rig inherits a stray flip.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, endPool } from "./relay-fixtures.mjs";
import { produceClosePrepTasks } from "../lib/reconciler-close-prep.mjs";

async function hasClosePrepDue() {
  const r = await rootQuery("select to_regprocedure('clara.close_prep_due()') is not null as ok");
  return r.rows[0]?.ok === true;
}
const HAS_ORACLE = await hasClosePrepDue();
const skip = HAS_ORACLE ? false : "clara.close_prep_due() absent — migrate the target first";

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
 *  no credential minted in the window. Built through the ONE audited writer, open_fiscal_year. */
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

test("close_prep producer: DISABLED source appends nothing, even with a genuinely overdue FY", { skip }, async () => {
  const w = await buildFirm("g1cp-off");
  await buildOverdueFiscalYear(w, "FY-off");
  await setCloseEnabled(false);
  const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(out.closePrepOk, true);
  assert.equal(out.dormant, false, "the oracle exists — this is a disabled-source no-op, not dormancy");
  assert.equal(out.closePrepQueued, 0, "a disabled source must queue ZERO tasks");
  assert.equal(await taskCountFor(w.client), 0, "and nothing landed in agent_tasks either");
});

test("close_prep producer: ENABLED + overdue FY queues exactly one task, correctly shaped", { skip }, async () => {
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

test("close_prep producer: TWO TICKS in a row queue exactly ONE task for the same client (the two-tick idempotency cell)", { skip }, async () => {
  const w = await buildFirm("g1cp-2t");
  await buildOverdueFiscalYear(w, "FY-2tick");
  await setCloseEnabled(true, w.owner);
  const first = await asRuntime((c) => produceClosePrepTasks(c, {}));
  const second = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(first.closePrepOk, true);
  assert.equal(second.closePrepOk, true);
  assert.ok(first.closePrepQueued >= 1, "the first tick must queue the task");
  assert.equal(second.closePrepSkipped >= 1 || second.closePrepQueued === 0, true, "the second tick must not queue a second one");
  assert.equal(await taskCountFor(w.client), 1, "exactly ONE close_prep task must exist for this client after two ticks");
});

test("close_prep producer: a client with a LIVE close_prep task already queued is skipped, not doubled", { skip }, async () => {
  const w = await buildFirm("g1cp-live");
  await buildOverdueFiscalYear(w, "FY-live");
  await setCloseEnabled(true, w.owner);
  // Plant the live task directly (mirrors autodraft's own request_autodraft insert shape,
  // 0011:2569) — this proves the belt's OWN skip check, independent of whether it was the one
  // that queued the row.
  await rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1, $2, 'close_prep', 'queued', 'planted-by-this-cell')`,
    [w.firm, w.client],
  );
  const out = await asRuntime((c) => produceClosePrepTasks(c, {}));
  assert.equal(out.closePrepOk, true);
  assert.ok(out.closePrepSkipped >= 1, `expected the planted row to be SKIPPED, got ${JSON.stringify(out)}`);
  assert.equal(await taskCountFor(w.client), 1, "still exactly one row — the planted one, untouched");
});
