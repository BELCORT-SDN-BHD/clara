// STANDALONE knowledge-read-set e2e (#658). NOT a `node --test` file: it SPAWNS a child process
// that writes a read-set row and then SIGKILLs it, so the replay-on-resume property is exercised
// the way a killed Work run actually exercises it — a real process death between the write and the
// acknowledgement, against a real PostgreSQL, through the real least-privileged `clara_runtime`
// role and the real door.
//
// Run, from packages/runtime:
//
//   PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=clara_658 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55708/clara_658 \
//   node tests/work-knowledge-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real database rather than a stub:
//
//   A. THE READ-SET IS REPLAY-IDEMPOTENT BY (work_id, run_id, seq). A step killed between the
//      write and its acknowledgement re-executes on resume and lands on the SAME ROW — same id,
//      same `knowledge_version`, same keys — rather than a second row or a unique violation. That
//      is the property `claraWork_v5`'s read step will lean on, and it is the one thing a unit
//      test with a fake `sql` cannot establish.
//
//   B. WORK, FIRM AND CLIENT ARE DERIVED, NEVER SUPPLIED. The writer takes a TASK and resolves the
//      rest through the positive `agent_tasks → accounting_work` join (0195:1525-1529), which is
//      the binding the absent foreign key would have carried. A task of another kind is CLR11.
//
//   C. THE DRIFT DOOR READS WHAT THE REPLAY LEFT. After the resume, `work_knowledge_drift_for`
//      answers `observed_from:'read'` with the read-set's own keys — so the detector sees the
//      recorded read, not the execution trace's weaker fallback.
//
// WHAT IT DOES NOT PROVE, stated rather than implied. It does NOT bootstrap a Workflow DevKit
// World and does NOT run a `claraWork` body: #658 cuts no frozen successor (the wave's single
// shared cut is the integration worker's — brief §1.2/§1.3), so there is no body on this branch
// that CALLS `clara.record_work_knowledge_read` inside a durable step. The "exactly one entry and
// one receipt" half of the seam therefore closes with `claraWork_v5`, and the report says so.
// A side effect worth naming: because no World is bootstrapped, this leg leaves
// `packages/db/tests/rig-isolation.test.mjs` T10b GREEN (#866 is not triggered by it).
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent this lane shares), and the
// file SKIPS CLEANLY when migration 0230 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no `clara.work_knowledge_reads` would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[knowledge-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (#1018: shared with every other standalone World e2e driver). The
// database set is widened by exactly the per-ticket rig pattern (`clara_<three digits>`) the
// wave's worktrees use, and by nothing else: this leg WRITES, and a writer that could reach a
// hosted DSN is a hosted incident. Unlike its siblings, this driver has never checked
// WORKFLOW_POSTGRES_URL at all — preserved as-is rather than widened into a new check by this
// refactor.
assertLocalDbGate({
  label: "work-knowledge-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}|${DB_NAME_SHAPE.PER_TICKET}`),
});

const CONN = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  database: process.env.PGDATABASE,
};

const RUN_ID = `wrun_01M20WGD9ETKK6RWCBA8CW${String(Date.now() % 1000).padStart(3, "0")}`.slice(0, 31);

async function root(fn) {
  const client = new pg.Client(CONN);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// --- THE CHILD. It checks out as `clara_runtime` — the ONLY role 0230 grants the writer to — and
// writes ONE read-set row, then hangs forever so the parent can kill it mid-flight. A child that
// exited on its own would be proving a retry, not a resume.
const CHILD = fileURLToPath(new URL("./work-knowledge-e2e-child.mjs", import.meta.url));

function spawnChild(task, seq) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, task, RUN_ID, String(seq)], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (b) => {
      out += String(b);
      if (out.includes("WROTE ")) {
        // KILLED BETWEEN THE WRITE AND THE ACKNOWLEDGEMENT. SIGKILL, not SIGTERM: a handler that
        // could tidy up would be proving that the tidying works, not that the database does.
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (b) => process.stderr.write(`[child] ${String(b)}`));
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ out, code, signal }));
  });
}

async function main() {
  // --- The frontier gate. A green run against a chain without 0230 would be a lie.
  const present = await root((c) => c.query(
    `select to_regclass('clara.work_knowledge_reads') is not null as relation,
            to_regprocedure('clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)') is not null as writer,
            to_regprocedure('clara.work_knowledge_drift_for(uuid,uuid)') is not null as drift`,
  ));
  const gate = present.rows[0];
  if (!gate.relation || !gate.writer || !gate.drift) {
    console.log("[knowledge-e2e] skipped — migration 0230 is not applied on this database");
    process.exit(0);
  }

  // --- One firm, one client, one Work, one accounting_work task. Minted with root DML: the
  // subject of this leg is the read-set's durability, not the admission door.
  const world = await root(async (c) => {
    const tag = randomUUID().slice(0, 8);
    const firm = (await c.query("insert into clara.firms(name) values ($1) returning id", [`p658_e2e_${tag}`])).rows[0].id;
    const user = randomUUID();
    await c.query("insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [user, `p658 e2e ${tag}`, `p658_e2e_${tag}@rig.test`]);
    await c.query("insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'owner','active')",
      [firm, user]);
    const client = (await c.query(
      "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
      [firm, `p658_e2e_client_${tag}`])).rows[0].id;
    const digest = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
    const work = (await c.query(
      `insert into clara.accounting_work(firm_id, client_id, purpose, status, initiator, initiator_role,
          intent_key, logical_op_id, basis, basis_digest, basis_origin, source_refs, initiated_by)
       values ($1,$2,'journal_entry','awaiting_input',$3,'owner',$4,$5,'{"rig":"p658-e2e"}'::jsonb,$6,
               'user_direct','[]'::jsonb,$3) returning id`,
      [firm, client, user, `p658_e2e_${randomUUID()}`, `p658_e2e_${randomUUID()}`, digest])).rows[0].id;
    const task = (await c.query(
      `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by, work_id)
       values ($1,$2,'accounting_work','queued','rig/p658-e2e',$3,$4) returning id`,
      [firm, client, user, work])).rows[0].id;
    // A task of ANOTHER kind, for assertion B.
    const otherTask = (await c.query(
      `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
       values ($1,$2,'autodraft','queued','rig/p658-e2e',$3) returning id`,
      [firm, client, user])).rows[0].id;
    return { firm, client, work, task, otherTask, user };
  });

  // --- A · THE KILL. The child writes the row and dies before it can say so.
  const first = await spawnChild(world.task, 1);
  assert.match(first.out, /WROTE /, "the child must have written before it was killed");
  assert.equal(first.signal, "SIGKILL", `the child must have been SIGKILLed, got signal=${first.signal} code=${first.code}`);
  const afterKill = await root((c) => c.query(
    "select id, knowledge_version, keys, status, run_id, seq from clara.work_knowledge_reads where work_id = $1",
    [world.work]));
  assert.equal(afterKill.rowCount, 1, "exactly ONE read-set row survived the kill");
  const original = afterKill.rows[0];
  assert.equal(original.run_id, RUN_ID);
  assert.equal(original.seq, 1);

  // --- A · THE RESUME. The step re-executes with the same (work, run, seq) and the same version.
  const second = await spawnChild(world.task, 1);
  assert.match(second.out, /WROTE /, "the replayed step must have run");
  const afterResume = await root((c) => c.query(
    "select id, knowledge_version, keys, status from clara.work_knowledge_reads where work_id = $1",
    [world.work]));
  assert.equal(afterResume.rowCount, 1,
    "a WDK re-execution must replay onto the SAME row — a second row here is a double-record, not a resume");
  assert.equal(afterResume.rows[0].id, original.id, "…and it is the ORIGINAL row's id that comes back");
  assert.equal(afterResume.rows[0].knowledge_version, original.knowledge_version);
  assert.deepEqual(afterResume.rows[0].keys, original.keys);

  // …and a DIFFERENT seq is a different read, so the idempotency is per step rather than per run.
  const third = await spawnChild(world.task, 2);
  assert.match(third.out, /WROTE /);
  const afterSecondStep = await root((c) => c.query(
    "select count(*)::int as n from clara.work_knowledge_reads where work_id = $1", [world.work]));
  assert.equal(afterSecondStep.rows[0].n, 2, "seq 2 is a SECOND read of the same run");

  // --- B · DERIVED, NEVER SUPPLIED. A task of another kind cannot write a row at all.
  const refused = await spawnChild(world.otherTask, 1);
  assert.match(refused.out, /REFUSED CLR11/,
    "a task that is not kind='accounting_work' must be refused CLR11 work_not_found — the binding the absent FK would have carried");
  const stillTwo = await root((c) => c.query(
    "select count(*)::int as n from clara.work_knowledge_reads where firm_id = $1", [world.firm]));
  assert.equal(stillTwo.rows[0].n, 2, "the refusal wrote nothing");

  // --- C · THE DETECTOR READS WHAT THE REPLAY LEFT.
  const drift = await root(async (c) => {
    await c.query("set role clara_runtime");
    const r = await c.query("select clara.work_knowledge_drift_for(p_firm => $1, p_work => $2) as d",
      [world.firm, world.work]);
    await c.query("reset role");
    return r.rows[0].d;
  });
  assert.equal(drift.observed_from, "read",
    "the recorded read-set must WIN over the execution-trace fallback — it knows which keys were read");
  assert.deepEqual(drift.read_keys, ["accounting_basis", "sst_regime"]);
  assert.equal(drift.relevant, false, "nothing has moved, and `false` is an honest answer once a read-set exists");
  assert.equal(drift.read.status, "ok");

  console.log(`[knowledge-e2e] OK — one read-set row survived a SIGKILL and REPLAYED onto its own id `
    + `(${original.id}), seq 2 is a second read, a non-accounting_work task is refused CLR11, and `
    + `work_knowledge_drift_for observes from the READ rather than from a trace.`);
}

main().catch((err) => {
  console.error("[knowledge-e2e] FAILED");
  console.error(err);
  process.exit(1);
});
