import "dotenv/config";
import { describeTarget, makeClient, requireDatabaseUrl } from "./util.js";

// Prints engine state (workflow schema), queue state (graphile_worker) and
// domain state (spike schema) straight from Postgres. Works with the worker
// down - that is the point (T1/T3/T4 inspect state while the worker is dead).
const client = makeClient();

async function section(title: string, query: string): Promise<void> {
  try {
    const res = await client.query(query);
    console.log(`\n== ${title} (${res.rowCount ?? 0}) ==`);
    if ((res.rowCount ?? 0) > 0) console.table(res.rows);
  } catch (err) {
    console.log(`\n== ${title} == unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

try {
  await client.connect();
  console.log(`status of ${describeTarget(requireDatabaseUrl())}`);

  await section(
    "engine: workflow.workflow_runs",
    `select id as run_id, name as workflow, status, created_at, started_at, completed_at
     from workflow.workflow_runs order by created_at desc limit 15`,
  );
  await section(
    "engine: workflow.workflow_steps",
    `select run_id, step_name, status, attempt, created_at, completed_at
     from workflow.workflow_steps order by created_at desc limit 20`,
  );
  await section(
    "engine: workflow.workflow_hooks",
    `select run_id, token, is_webhook, created_at
     from workflow.workflow_hooks order by created_at desc limit 10`,
  );
  await section(
    "queue: graphile_worker jobs",
    `select id, task_id, attempts, max_attempts, run_at, locked_at, locked_by
     from graphile_worker._private_jobs order by run_at desc limit 15`,
  );
  await section(
    "domain: spike.postings",
    `select id, op_key, amount_cents, created_at from spike.postings order by id desc limit 20`,
  );
  await section(
    "domain: spike.receipts",
    `select id, posting_id, receipt_no, created_at from spike.receipts order by id desc limit 20`,
  );
  await section(
    "domain: spike.completions",
    `select id, run_id, op_key, approved, approver, created_at from spike.completions order by id desc limit 20`,
  );
  await section(
    "domain: spike.step_invocations (canary)",
    `select id, op_key, step_name, note, created_at from spike.step_invocations order by id desc limit 30`,
  );
} finally {
  await client.end();
}
