// The render worker's database lane (Wave E lane ζ; design part2 §10's Supavisor paragraph).
//
// A SHORT-LIVED DSN SESSION PER JOB. NO POOL, NO LISTEN CLIENT, NO STANDING CONNECTION.
//
// This is a capacity commitment, not a style preference. Supavisor was last measured at 35/60
// (docs/plan/completed/wave-e-f6f9-acceptance.md:51, :196), and every wave that adds a consumer
// re-verifies headroom before deploy — the standing law. The clara-backup shape adds ZERO standing
// sessions; this worker copies it exactly: it connects, claims one job, does its work, completes
// or fails it, and disconnects. Worker concurrency is capped at 1 in v1, so the PEAK this app adds
// to the pooler is 1.
//
// A pool here would be worse than useless: the worker is a batch machine that runs to completion,
// so a pool would hold idle sessions open for the entire life of a process that has nothing left
// to do, and the count it added would be invisible in exactly the measurement that matters.
//
// THE DSN COMES FROM THE ENVIRONMENT, NEVER FROM ARGV AND NEVER FROM CODE (hard constraint 4).
// It is never logged, never included in an error message, and never interpolated into anything.
// The role behind it is clara_runtime: the five queue verbs are granted to that role and the
// worker holds no table privilege on anything in the reporting schema.

import pg from "pg";

/** Open one session. The caller MUST close it — see withSession, which is the shape to use. */
export async function openSession() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Named without echoing the value's shape: a message that describes the DSN is a message that
    // leaks part of it into a log.
    throw new Error("DATABASE_URL is not set; the render worker takes its DSN from the environment only");
  }
  const client = new pg.Client({
    connectionString,
    application_name: "clara-render",
    // Bounded from both ends: a render machine that hangs on a connect is a machine that burns
    // its lease without doing anything, and the job would then be reclaimed after the lease
    // expires — correct, but slower than failing fast and letting the next dispatch retry.
    connectionTimeoutMillis: Number(process.env.CLARA_RENDER_CONNECT_TIMEOUT_MS || 15_000),
    statement_timeout: Number(process.env.CLARA_RENDER_STATEMENT_TIMEOUT_MS || 120_000),
  });
  await client.connect();
  // The runtime GROUP role, the reconciler's own idiom: clara_runtime_login is inherit-false and
  // SETs ROLE. Without this the five verbs are not reachable even though the login can see them.
  await client.query("set role clara_runtime");
  return client;
}

/** Run one unit of work on a fresh session and close it whatever happens. */
export async function withSession(fn) {
  const client = await openSession();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function claimJob(client, workerId, leaseSeconds) {
  const r = await client.query("select clara.claim_render_job($1, ($2 || ' seconds')::interval) as j",
    [workerId, String(leaseSeconds)]);
  return r.rows[0]?.j ?? null;
}

export async function jobPayload(client, jobId, workerId) {
  const r = await client.query("select clara.render_job_payload($1, $2) as p", [jobId, workerId]);
  return r.rows[0]?.p ?? null;
}

export async function completeJob(client, { jobId, workerId, sha256, byteSize, manifest }) {
  const r = await client.query("select clara.complete_render_job($1, $2, $3, $4::bigint, $5::jsonb) as r",
    [jobId, workerId, sha256, String(byteSize), JSON.stringify(manifest)]);
  return r.rows[0]?.r ?? null;
}

export async function failJob(client, { jobId, workerId, reason }) {
  const r = await client.query("select clara.fail_render_job($1, $2, $3::jsonb) as r",
    [jobId, workerId, JSON.stringify(reason)]);
  return r.rows[0]?.r ?? null;
}
