import "dotenv/config";
import { makeClient } from "./util.js";

// Clears graphile-worker job locks left behind by a hard-killed worker.
//
// WHY THIS EXISTS (verified against graphile-worker@0.16.6 sources): a job's
// is_available column is `locked_at is null and attempts < max_attempts`,
// and locks abandoned by a crashed worker are only reclaimed by the periodic
// resetLockedAt sweep with a fixed `locked_at < now() - interval '4 hours'`
// cutoff. After a hard kill (T3/T4) the in-flight job would otherwise stay
// invisible to the restarted worker for up to 4 hours. Run this ONLY while
// no healthy worker is mid-job (i.e., right after a crash/kill).
const client = makeClient();
try {
  await client.connect();
  const jobs = await client.query(
    `update graphile_worker._private_jobs
     set locked_at = null, locked_by = null
     where locked_at is not null
     returning id, task_id, attempts`,
  );
  await client.query(
    `update graphile_worker._private_job_queues
     set locked_at = null, locked_by = null
     where locked_at is not null`,
  );
  console.log(`Unlocked ${jobs.rowCount ?? 0} stuck job(s).`);
  if ((jobs.rowCount ?? 0) > 0) console.table(jobs.rows);
  console.log("The running worker's poll (500ms) should pick them up now.");
} finally {
  await client.end();
}
