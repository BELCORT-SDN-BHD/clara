// Wave A2 — the local_facts lane's /ready HEALTH signal (lib/local-facts.mjs), DB INTEGRATION.
// The consumer's own claim/parse/persist logic is proven purely, with a mocked DB, in
// local-facts-unit.test.mjs (that file's contract is "no live DB" and it keeps it); what needs a
// real database is the health READ, because every category it reports is a SQL predicate over
// clara.document_processing_tasks and a mock can only restate the answer it was given.
//
// #617: this lane had the classify lane's QUEUED-ONLY blind spot and none of its compensating
// signals — a row wedged in 'running' contributes to neither `queued` nor `oldestQueuedMs`, so a
// stuck local_facts worker read as a perfectly idle one, and an attempt_count climbing toward the
// terminal fail was invisible until the task died and took the evidence with it.
//
// Tasks are enqueued through the REAL writer (clara.enqueue_invoice_facts on an XML document —
// the 0015/0016 routing that mints this lane's rows), never a hand-inserted task row. Only the
// STATE a wedged worker would leave behind is set directly, which is the condition under test.
//
// Env from the ENVIRONMENT (relay-fixtures throws otherwise); RELAY_TEST_MODE=1; serial
// (--test-concurrency=1). Row-scoped assertions, NEVER TRUNCATE. Group-role identity (asRuntime —
// this consumer has NO login dance).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRuntime, buildFirm, endPool, sha, opk } from "./relay-fixtures.mjs";
import { localFactsHealth, LOCAL_FACTS_CONSUMER } from "../lib/local-facts.mjs";

// SKIP-probe (the probeMatcherReady idiom) — skip cleanly when the enqueue surface is absent.
async function probeEnqueue() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname = 'enqueue_invoice_facts'`,
  );
  return Number(r.rows[0].n) >= 1;
}
const HAS_ENQUEUE = await probeEnqueue();
const skip = HAS_ENQUEUE ? false : "clara.enqueue_invoice_facts absent — migrate the target first";

after(async () => {
  await endPool();
});

/** A verified XML document (the mime the 0015/0016 router sends to the local lane), enqueued
 *  through the real writer. Returns the minted task id. */
async function seedLocalFactsTask(firm, owner) {
  const s = sha(`lf617_${opk("d")}`);
  const document = (
    await rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r", [
      firm,
      null,
      s,
      "local-facts-rig.xml",
      "application/xml",
      2048,
      `firms/${firm}/docs/${s}.xml`,
      owner,
    ])
  ).rows[0].r.document_id;
  const enq = await asRuntime((c) => c.query("select clara.enqueue_invoice_facts($1) as r", [document]));
  const receipt = enq.rows[0].r;
  return { document, receipt, taskId: receipt.task_id };
}

const laneOf = (taskId) =>
  rootQuery("select lane, status from clara.document_processing_tasks where id=$1", [taskId]).then((r) => r.rows[0]);

test("META local-facts-consumer: an XML document enqueues a REAL local_facts-lane task", { skip }, async () => {
  const { owner, firm } = await buildFirm("lfc");
  const { receipt, taskId } = await seedLocalFactsTask(firm, owner);
  assert.equal(receipt.status, "queued", `an XML document enqueues a task (got ${JSON.stringify(receipt)})`);
  const row = await laneOf(taskId);
  assert.equal(row.lane, "local_facts", "the enqueued task is on the local_facts lane");
});

test("localFactsHealth reports the lane's queued/running backlog and its stall categories", { skip }, async () => {
  const h = await asRuntime((c) => localFactsHealth(c));
  assert.equal(h.consumer, LOCAL_FACTS_CONSUMER);
  // The WIRE SHAPE, pinned. #617 moved this query into lib/consumer-health.mjs, shared with the
  // classify lane; the fields and their ORDER are what /ready and its readers actually see, so a
  // future consolidation that renames, reorders or drops one fails HERE.
  assert.deepEqual(
    Object.keys(h),
    ["consumer", "queued", "running", "oldestQueuedMs", "oldestRunningMs", "maxAttemptCount", "stranded", "strandedMs"],
    "localFactsHealth's field set and order",
  );
  for (const k of ["queued", "running", "oldestQueuedMs", "oldestRunningMs", "maxAttemptCount", "stranded", "strandedMs"]) {
    assert.equal(typeof h[k], "number", `${k} is a number`);
    assert.ok(h[k] >= 0, `${k} is non-negative`);
  }
  assert.ok(h.strandedMs > 0, "#617: the threshold the stranded count was measured against, so /ready need not re-read the env");
});

test("#617 localFactsHealth: a running task older than the stranded threshold is counted as STRANDED, not as backlog", { skip }, async () => {
  // The blind spot this closes: `queued` cannot see a wedged task at all (a looping task is
  // 'running' for all but a moment of each cycle), and `oldestRunningMs` says one row is late
  // without saying whether that is one poisoned document or the whole lane. Delta-based — the rig
  // is shared and carries whatever earlier runs left behind.
  const { owner, firm } = await buildFirm("lf617s");
  const before = await asRuntime((c) => localFactsHealth(c));
  const { taskId } = await seedLocalFactsTask(firm, owner);

  const queuedNow = await asRuntime((c) => localFactsHealth(c));
  assert.equal(queuedNow.queued - before.queued, 1, "mandatory setup: the new task is QUEUED");
  assert.equal(queuedNow.stranded, before.stranded, "a queued task is never stranded — the categories do not overlap");

  // Drive it into the exact shape the counter is for: 'running', started well past the lane's own
  // requeue threshold. (The update trigger stamps updated_at itself, which is why the predicate
  // reads coalesce(started_at, updated_at) and this cell sets started_at.)
  await rootQuery(
    `update clara.document_processing_tasks
        set status='running', workflow_run_id='rig-617-lf-stranded',
            started_at = now() - ($2::bigint * interval '1 millisecond') - interval '1 minute'
      where id=$1`,
    [taskId, queuedNow.strandedMs],
  );
  const stranded = await asRuntime((c) => localFactsHealth(c));
  assert.equal(stranded.stranded - before.stranded, 1, "the stranded row is counted in its own category");
  assert.equal(stranded.queued - before.queued, 0, "and has LEFT the queued backlog — a stall is not a queue");
  assert.equal(stranded.running - before.running, 1, "it is running, which is exactly why the queued-only signal could not see it");
  assert.ok(stranded.oldestRunningMs > stranded.strandedMs, "the pre-existing age signal agrees, but it is not the count");
});

test("#617 localFactsHealth: a climbing attempt_count is visible BEFORE the task terminally fails", { skip }, async () => {
  // This lane fails its tasks terminally (fail_invoice_facts), so a retry budget being burned
  // through was invisible until the row that carried the count left the live set entirely.
  // maxAttemptCount is a MAX over the whole lane, so the assertion is exact rather than a delta:
  // pushed one above the estate's current worst, the reported maximum must be exactly that.
  const { owner, firm } = await buildFirm("lf617a");
  const before = await asRuntime((c) => localFactsHealth(c));
  const { taskId } = await seedLocalFactsTask(firm, owner);
  const target = before.maxAttemptCount + 1;

  await rootQuery("update clara.document_processing_tasks set attempt_count=$2 where id=$1", [taskId, target]);
  const climbing = await asRuntime((c) => localFactsHealth(c));
  assert.equal(climbing.maxAttemptCount, target, "the lane's worst attempt_count is reported while the task is still alive");
  assert.equal(climbing.stranded, before.stranded, "a queued task burning attempts is NOT stranded — attempts and stalls are different categories");
});
