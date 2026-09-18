import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pgBin = requiredEnv("RIG_PG_BIN");
const scratchRoot = path.resolve(requiredEnv("RIG_SCRATCH"));
const runRoot = await mkdtemp(path.join(scratchRoot, "runtime-boundary-run-"));
if (!path.resolve(runRoot).startsWith(`${scratchRoot}${path.sep}`)) {
  throw new Error(`scratch run escaped RIG_SCRATCH: ${runRoot}`);
}
const dataDir = path.join(runRoot, "pgdata");
const logDir = path.join(runRoot, "logs");
const postgresLog = path.join(logDir, "postgres.log");
const pgPort = await freePort();
const appPort = await freePort();
const databaseUrl = `postgres://postgres@127.0.0.1:${pgPort}/harness`;
const runtimeEnv = {
  ...process.env,
  RIG_DATABASE_URL: databaseUrl,
  WORKFLOW_POSTGRES_URL: databaseUrl,
  WORKFLOW_POSTGRES_JOB_PREFIX: "clara607v4",
  WORKFLOW_POSTGRES_WORKER_CONCURRENCY: "4",
  WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
  PORT: String(appPort),
  HOST: "127.0.0.1",
};

let server;
let postgresStarted = false;
let pool;

try {
  assert.match(process.version, /^v22\./, "proof must run on supported Node 22");
  await mkdir(logDir, { recursive: true });
  await checked(pgExe("initdb"), ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], {
    logFile: path.join(logDir, "initdb.log"),
  });
  await checked(pgExe("pg_ctl"), ["-D", dataDir, "-l", postgresLog, "-o", `-h 127.0.0.1 -p ${pgPort}`, "-w", "start"], {
    logFile: path.join(logDir, "pgctl-start.log"),
  });
  postgresStarted = true;
  await checked(pgExe("createdb"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "harness"], {
    logFile: path.join(logDir, "createdb.log"),
  });
  await checked(process.execPath, [path.join(projectRoot, "node_modules", "@workflow", "world-postgres", "bin", "setup.js")], {
    cwd: projectRoot,
    env: runtimeEnv,
    logFile: path.join(logDir, "world-bootstrap.log"),
  });

  pool = new Pool({ connectionString: databaseUrl });
  await pool.query(`
    create schema rig;
    create table rig.trusted_state (
      actor_id text primary key,
      role text not null,
      active boolean not null,
      authority_revision integer not null,
      knowledge_revision integer not null,
      period_open boolean not null default true,
      period_revision integer not null default 1
    );
    create table rig.work_snapshot (
      work_id text primary key,
      actor_id text not null references rig.trusted_state(actor_id),
      required_authority_revision integer not null,
      required_knowledge_revision integer not null,
      required_period_revision integer not null default 1,
      cancel_requested boolean not null default false,
      workflow_run_id text
    );
    create table rig.chat_messages (
      work_id text primary key,
      body text not null
    );
    create table rig.work_basis (
      work_id text primary key references rig.work_snapshot(work_id),
      instruction text not null,
      source_ref text not null,
      accepted_answer text
    );
    create table rig.effects (
      receipt_id bigserial primary key,
      operation_key text not null unique,
      work_id text not null,
      answer_text text not null
    );
    create table rig.fault_markers (
      operation_key text primary key,
      first_pid integer not null,
      replay_count integer not null
    );
    create table rig.interruptions (
      work_id text primary key references rig.work_snapshot(work_id),
      hook_token text not null unique,
      status text not null check (status in ('pending', 'answered')),
      question_kind text not null,
      accepted_answer_id text,
      accepted_answer_text text
    );
    create table rig.answer_receipts (
      receipt_id bigserial primary key,
      operation_key text not null unique,
      work_id text not null references rig.work_snapshot(work_id),
      answer_id text not null,
      answer_text text not null,
      delivered_at timestamptz
    );
  `);

  await checked(process.execPath, [path.join(projectRoot, "node_modules", "nitro", "dist", "cli", "index.mjs"), "build"], {
    cwd: projectRoot,
    env: runtimeEnv,
    logFile: path.join(logDir, "nitro-build.log"),
  });

  server = startServer(runtimeEnv, path.join(logDir, "server-before-crash.log"));
  const healthBefore = await waitJson(`${baseUrl()}/health`, (value) => value.ok === true);
  assert.equal(healthBefore.pid, server.pid, "health endpoint identifies the actual serving child");
  assert.equal(healthBefore.node, process.version);
  const firstServerPid = healthBefore.pid;
  const postgresPidBefore = await postgresPid();

  await seedViaApp("crash-boundary", "actor-crash");
  await seedBasis("crash-boundary", "Post one synthetic receipt", "fixture://crash-boundary");
  const crashStart = await post("/start/v4/crash-boundary", { mode: "crash_effect" });
  await waitInterruption("crash-boundary");
  const answerAdmission = await post("/admit-answer/crash-boundary", {
    operationKey: "answer:crash-boundary:1",
    answerId: "crash-answer",
    text: "continue the synthetic effect",
  });
  assert.equal(answerAdmission.accepted, true);
  assert.equal(answerAdmission.delivered, true);

  const committedMarker = await waitDb(async () => {
    const result = await pool.query(
      `select f.operation_key, f.first_pid, f.replay_count, e.receipt_id
         from rig.fault_markers f
         join rig.effects e using (operation_key)
        where e.work_id = 'crash-boundary'`,
    );
    return result.rowCount === 1 ? result.rows[0] : null;
  }, 30000);
  assert.equal(Number(committedMarker.first_pid), firstServerPid);
  assert.equal(Number(committedMarker.replay_count), 0);
  const receiptBeforeKill = String(committedMarker.receipt_id);

  const firstExit = waitExit(server);
  server.kill();
  await firstExit;
  assert.equal(await processExists(firstServerPid), false, "the serving process holding the uncheckpointed step exited");

  server = startServer(runtimeEnv, path.join(logDir, "server-after-crash.log"));
  const healthAfter = await waitJson(`${baseUrl()}/health`, (value) => value.ok === true);
  assert.equal(healthAfter.pid, server.pid);
  assert.notEqual(healthAfter.pid, firstServerPid);
  const postgresPidAfter = await postgresPid();
  assert.equal(postgresPidAfter, postgresPidBefore, "same PostgreSQL postmaster survives the serving-process kill");

  const crashState = await waitJson(`${baseUrl()}/state/crash-boundary`, (value) => value.status === "completed", 120000);
  assert.equal(crashState.returnValue.bodyVersion, "v4-runtime-boundary");
  assert.equal(crashState.returnValue.receiptId, receiptBeforeKill);
  assert.equal(crashState.returnValue.replayObservedExistingReceipt, true);
  assert.equal(crashState.returnValue.firstCommitPid, firstServerPid);
  assert.equal(crashState.returnValue.replayPid, healthAfter.pid);
  assert.equal(crashState.effects.length, 1);
  const crashReplay = await fetch(`${baseUrl()}/stream/crash-boundary`).then((response) => response.text());
  assert.match(crashReplay, /accepted/);
  assert.match(crashReplay, /completed/);

  const cancellation = await proveCancellationOrdering();
  const authorityPeriod = await proveAuthorityAndPeriodOrdering();
  const knowledge = await proveKnowledgeOnlyReplan();
  const retainedBodyAndChatDeletion = await proveRetainedBodyAndChatDeletion();

  const evidence = {
    result: "PASS",
    environment: {
      node: process.version,
      postgres: await version(pgExe("postgres")),
      workflow: "4.8.4",
      postgresWorld: "4.3.4",
      ai: "7.0.77",
    },
    crashBoundary: {
      runId: crashStart.runId,
      servingPidBefore: firstServerPid,
      servingPidAfter: healthAfter.pid,
      oldPidExited: true,
      postgresPidBefore,
      postgresPidAfter,
      effectCommittedBeforeKill: true,
      receiptBeforeKill,
      receiptAfterReplay: crashState.returnValue.receiptId,
      replayObservedExistingReceipt: crashState.returnValue.replayObservedExistingReceipt,
      effectRows: crashState.effects.length,
      persistedSseReplay: { accepted: true, completed: true },
    },
    cancellation,
    authorityPeriod,
    knowledge,
    retainedBodyAndChatDeletion,
    boundaries: {
      transactionTests: "real scratch PostgreSQL 17 row locks and commits against a synthetic schema",
      model: "AI SDK ToolLoopAgent with MockLanguageModelV4 scripted output; no provider call or recovery-quality claim",
      workflow: "real Workflow 4.8.4 Nitro server and Postgres world on loopback",
      answerAdmission: "synthetic first-answer transaction; no claim that the prototype is Clara's production dispatcher",
      versionRetention: "one new compiled bundle retaining v3 while defaulting new starts to v4; not a two-binary deploy or rollback test",
    },
    productionUnproven: [
      "Clara tenant RLS, production authority tables, accounting functions, and period-close functions",
      "hosted PostgreSQL/provider execution and Linux Node 22 container image",
      "answer-dispatch crash recovery, lease expiry/redelivery, and chat deletion authorization",
      "two-binary deployment cutover/rollback and removal policy for nonterminal workflow bodies",
    ],
    logs: runRoot,
  };
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(path.join(projectRoot, "server-rig", "last-runtime-boundary-pass.json"), output, "utf8");
  console.log(output);
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", node: process.version, runRoot, error: error?.stack ?? String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const exit = waitExit(server);
    server.kill();
    await exit.catch(() => {});
  }
  await pool?.end().catch(() => {});
  if (postgresStarted) {
    await checked(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      logFile: path.join(logDir, "pgctl-stop.log"),
      allowFailure: true,
    });
  }
}

async function proveCancellationOrdering() {
  await seedDirect("cancel-order", "actor-cancel-order");
  const checked = deferred();
  const release = deferred();
  const firstOperation = admitOperation("cancel-order", "cancel-order:op-1", async () => {
    checked.resolve();
    await release.promise;
  });
  await checked.promise;
  let cancelSettled = false;
  const cancel = requestCancel("cancel-order").then((value) => {
    cancelSettled = true;
    return value;
  });
  await delay(200);
  assert.equal(cancelSettled, false, "cancel waits behind the already-admitted transaction's work lock");
  release.resolve();
  const first = await firstOperation;
  const cancelResult = await cancel;
  const second = await admitOperation("cancel-order", "cancel-order:op-2");
  const effects = await countEffects("cancel-order");
  assert.equal(first.outcome, "committed");
  assert.equal(cancelResult.cancelRequested, true);
  assert.equal(second.outcome, "refused_cancelled");
  assert.equal(effects, 1);
  return { cancelBlockedWhileAcceptedOperationSettled: true, first, cancel: cancelResult, second, effects };
}

async function proveAuthorityAndPeriodOrdering() {
  await seedDirect("authority-op-first", "actor-authority-op-first");
  const checked = deferred();
  const release = deferred();
  const operation = admitOperation("authority-op-first", "authority-op-first:op", async () => {
    checked.resolve();
    await release.promise;
  });
  await checked.promise;
  let revokeSettled = false;
  const revoke = revokeAuthorityAndClosePeriod("authority-op-first").then((value) => {
    revokeSettled = true;
    return value;
  });
  await delay(200);
  assert.equal(revokeSettled, false, "revocation waits behind the committing operation's locked current-state read");
  release.resolve();
  const operationFirst = await operation;
  const revokeAfter = await revoke;
  const afterRevoke = await admitOperation("authority-op-first", "authority-op-first:after-revoke");
  assert.equal(operationFirst.outcome, "committed");
  assert.equal(afterRevoke.outcome, "refused_authority_or_period");

  await seedDirect("authority-revoke-first", "actor-authority-revoke-first");
  const locked = deferred();
  const releaseRevoke = deferred();
  const firstRevoke = revokeAuthorityAndClosePeriod("authority-revoke-first", async () => {
    locked.resolve();
    await releaseRevoke.promise;
  });
  await locked.promise;
  let lateOperationSettled = false;
  const lateOperation = admitOperation("authority-revoke-first", "authority-revoke-first:op").then((value) => {
    lateOperationSettled = true;
    return value;
  });
  await delay(200);
  assert.equal(lateOperationSettled, false, "operation waits for an earlier revocation transaction");
  releaseRevoke.resolve();
  const revokeFirst = await firstRevoke;
  const operationAfter = await lateOperation;
  assert.equal(operationAfter.outcome, "refused_authority_or_period");
  assert.equal(await countEffects("authority-revoke-first"), 0);
  return {
    operationFirst: { operation: operationFirst, revoke: revokeAfter, nextOperation: afterRevoke },
    revokeFirst: { revoke: revokeFirst, operation: operationAfter, effects: 0 },
  };
}

async function proveKnowledgeOnlyReplan() {
  await seedDirect("knowledge-change", "actor-knowledge-change");
  const before = (await pool.query(
    "select role, active, authority_revision, knowledge_revision, period_open, period_revision from rig.trusted_state where actor_id=$1",
    ["actor-knowledge-change"],
  )).rows[0];
  await pool.query("update rig.trusted_state set knowledge_revision=2 where actor_id=$1", ["actor-knowledge-change"]);
  const stale = await admitOperation("knowledge-change", "knowledge-change:stale");
  assert.equal(stale.outcome, "replan_required");
  assert.equal(await countEffects("knowledge-change"), 0);
  const replan = await replanKnowledge("knowledge-change");
  const current = await admitOperation("knowledge-change", "knowledge-change:current");
  const after = (await pool.query(
    "select role, active, authority_revision, knowledge_revision, period_open, period_revision from rig.trusted_state where actor_id=$1",
    ["actor-knowledge-change"],
  )).rows[0];
  assert.deepEqual(
    { role: after.role, active: after.active, authorityRevision: after.authority_revision, periodOpen: after.period_open, periodRevision: after.period_revision },
    { role: before.role, active: before.active, authorityRevision: before.authority_revision, periodOpen: before.period_open, periodRevision: before.period_revision },
  );
  assert.equal(current.outcome, "committed");
  return { stale, effectsBeforeReplan: 0, replan, current, authorityAndPeriodUnchanged: true };
}

async function proveRetainedBodyAndChatDeletion() {
  await seedViaApp("old-body", "actor-old-body");
  await seedBasis("old-body", "Retained v3 body fixture", "fixture://old-body");
  const oldStart = await post("/start/v3/old-body", {});
  await waitJson(`${baseUrl()}/hook/old-body`, (value) => value.active === true);

  await seedViaApp("basis-resume", "actor-basis-resume");
  await seedBasis("basis-resume", "Resume work from durable basis", "fixture://basis-resume");
  const newDefaultStart = await post("/start/default/basis-resume", { mode: "basis_resume" });
  assert.equal(newDefaultStart.version, "v4");
  await waitInterruption("basis-resume");
  await pool.query("delete from rig.chat_messages where work_id='basis-resume'");
  const admitted = await post("/admit-answer/basis-resume", {
    operationKey: "answer:basis-resume:1",
    answerId: "basis-answer",
    text: "accepted identity fact",
  });
  assert.equal(admitted.accepted, true);
  const sameAnswerReplay = await post("/admit-answer/basis-resume", {
    operationKey: "answer:basis-resume:1",
    answerId: "basis-answer",
    text: "accepted identity fact",
  });
  assert.equal(sameAnswerReplay.replayed, true);
  const conflictingKeyReplay = await rawPost("/admit-answer/basis-resume", {
    operationKey: "answer:basis-resume:1",
    answerId: "basis-answer",
    text: "conflicting answer",
  });
  assert.equal(conflictingKeyReplay.status, 409);
  const secondAnswer = await rawPost("/admit-answer/basis-resume", {
    operationKey: "answer:basis-resume:2",
    answerId: "second-answer",
    text: "second answer",
  });
  assert.equal(secondAnswer.status, 409);
  const basisState = await waitJson(`${baseUrl()}/state/basis-resume`, (value) => value.status === "completed");
  assert.equal(basisState.returnValue.bodyVersion, "v4-runtime-boundary");
  assert.equal(basisState.returnValue.ordinaryChatRows, 0);
  assert.equal(basisState.returnValue.minimumBasis.accepted_answer, "accepted identity fact");

  await post("/answer/old-body", { answerId: "old-body-answer", text: "resume retained body" });
  const oldState = await waitJson(`${baseUrl()}/state/old-body`, (value) => value.status === "completed");
  assert.equal(oldState.returnValue.bodyVersion, "v3-tool-loop");
  return {
    retainedOldRun: { runId: oldStart.runId, bodyVersion: oldState.returnValue.bodyVersion },
    newDefaultRun: { runId: newDefaultStart.runId, bodyVersion: basisState.returnValue.bodyVersion },
    chatDeletion: {
      ordinaryChatRows: basisState.returnValue.ordinaryChatRows,
      instruction: basisState.returnValue.minimumBasis.instruction,
      sourceRef: basisState.returnValue.minimumBasis.source_ref,
      acceptedAnswer: basisState.returnValue.minimumBasis.accepted_answer,
      resumableQuestion: basisState.returnValue.status === "completed",
    },
    syntheticAnswerAdmission: {
      firstAccepted: admitted.accepted,
      sameOperationReplay: sameAnswerReplay.replayed,
      conflictingOperationKeyStatus: conflictingKeyReplay.status,
      secondAnswerStatus: secondAnswer.status,
    },
  };
}

async function admitOperation(workId, operationKey, afterCheck) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const state = await client.query(
      `select w.cancel_requested, w.required_authority_revision, w.required_knowledge_revision,
              w.required_period_revision, t.role, t.active, t.authority_revision,
              t.knowledge_revision, t.period_open, t.period_revision
         from rig.work_snapshot w
         join rig.trusted_state t on t.actor_id=w.actor_id
        where w.work_id=$1
        for update of w, t`,
      [workId],
    );
    assert.equal(state.rowCount, 1);
    const row = state.rows[0];
    if (row.cancel_requested) {
      await client.query("rollback");
      return { outcome: "refused_cancelled" };
    }
    if (
      !row.active || row.role !== "bookkeeper" || !row.period_open ||
      row.authority_revision !== row.required_authority_revision ||
      row.period_revision !== row.required_period_revision
    ) {
      await client.query("rollback");
      return {
        outcome: "refused_authority_or_period",
        observed: {
          role: row.role,
          active: row.active,
          authorityRevision: row.authority_revision,
          periodOpen: row.period_open,
          periodRevision: row.period_revision,
        },
      };
    }
    if (row.knowledge_revision !== row.required_knowledge_revision) {
      await client.query("rollback");
      return { outcome: "replan_required", expectedKnowledgeRevision: row.required_knowledge_revision, currentKnowledgeRevision: row.knowledge_revision };
    }
    await afterCheck?.();
    const inserted = await client.query(
      `insert into rig.effects(operation_key, work_id, answer_text)
       values ($1, $2, 'synthetic transaction-ordering effect')
       on conflict (operation_key) do nothing
       returning receipt_id`,
      [operationKey, workId],
    );
    const receipt = await client.query("select receipt_id from rig.effects where operation_key=$1", [operationKey]);
    await client.query("commit");
    return { outcome: "committed", receiptId: String(receipt.rows[0].receipt_id), deduplicated: inserted.rowCount === 0 };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function requestCancel(workId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select work_id from rig.work_snapshot where work_id=$1 for update", [workId]);
    await client.query("update rig.work_snapshot set cancel_requested=true where work_id=$1", [workId]);
    await client.query("commit");
    return { cancelRequested: true };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function revokeAuthorityAndClosePeriod(workId, afterLock) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const work = await client.query("select actor_id from rig.work_snapshot where work_id=$1 for update", [workId]);
    const actorId = work.rows[0].actor_id;
    await client.query("select actor_id from rig.trusted_state where actor_id=$1 for update", [actorId]);
    await afterLock?.();
    const changed = await client.query(
      `update rig.trusted_state
          set role='viewer', active=false, authority_revision=authority_revision+1,
              period_open=false, period_revision=period_revision+1
        where actor_id=$1
        returning role, active, authority_revision, period_open, period_revision`,
      [actorId],
    );
    await client.query("commit");
    return changed.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function replanKnowledge(workId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      `select w.actor_id, w.required_knowledge_revision, t.knowledge_revision,
              t.role, t.active, t.authority_revision, t.period_open, t.period_revision
         from rig.work_snapshot w
         join rig.trusted_state t on t.actor_id=w.actor_id
        where w.work_id=$1
        for update of w, t`,
      [workId],
    );
    const row = current.rows[0];
    await client.query("update rig.work_snapshot set required_knowledge_revision=$2 where work_id=$1", [workId, row.knowledge_revision]);
    await client.query("update rig.work_basis set source_ref=$2 where work_id=$1", [workId, `fixture://knowledge-revision-${row.knowledge_revision}`]);
    await client.query("commit");
    return {
      priorKnowledgeRevision: row.required_knowledge_revision,
      plannedKnowledgeRevision: row.knowledge_revision,
      authoritySnapshot: {
        role: row.role,
        active: row.active,
        authorityRevision: row.authority_revision,
        periodOpen: row.period_open,
        periodRevision: row.period_revision,
      },
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function seedViaApp(workId, actorId) {
  await post(`/seed/${workId}`, { actorId });
}

async function seedDirect(workId, actorId) {
  await pool.query(
    `insert into rig.trusted_state(actor_id, role, active, authority_revision, knowledge_revision, period_open, period_revision)
     values ($1, 'bookkeeper', true, 1, 1, true, 1)`,
    [actorId],
  );
  await pool.query(
    `insert into rig.work_snapshot(work_id, actor_id, required_authority_revision, required_knowledge_revision, required_period_revision)
     values ($1, $2, 1, 1, 1)`,
    [workId, actorId],
  );
  await seedBasis(workId, `Synthetic work ${workId}`, `fixture://${workId}`);
}

async function seedBasis(workId, instruction, sourceRef) {
  await pool.query(
    "insert into rig.work_basis(work_id, instruction, source_ref) values ($1, $2, $3)",
    [workId, instruction, sourceRef],
  );
}

async function waitInterruption(workId) {
  return waitDb(async () => {
    const result = await pool.query("select status from rig.interruptions where work_id=$1", [workId]);
    return result.rowCount === 1 && result.rows[0].status === "pending" ? result.rows[0] : null;
  });
}

async function countEffects(workId) {
  return (await pool.query("select count(*)::int as count from rig.effects where work_id=$1", [workId])).rows[0].count;
}

async function postgresPid() {
  return Number((await readFile(path.join(dataDir, "postmaster.pid"), "utf8")).split(/\r?\n/)[0]);
}

function pgExe(name) {
  return path.join(pgBin, `${name}.exe`);
}

function baseUrl() {
  return `http://127.0.0.1:${appPort}`;
}

function startServer(env, logFile) {
  const child = spawn(process.execPath, [path.join(projectRoot, ".output", "server", "index.mjs")], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  void capture(child, logFile);
  return child;
}

async function post(pathname, body) {
  const response = await rawPost(pathname, body);
  const value = await response.json();
  if (!response.ok) throw new Error(`POST ${pathname} -> ${response.status}: ${JSON.stringify(value)}`);
  return value;
}

function rawPost(pathname, body) {
  return fetch(`${baseUrl()}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitJson(url, predicate, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      last = await response.json();
      if (response.ok && predicate(last)) return last;
    } catch (error) {
      last = String(error);
    }
    await delay(250);
  }
  throw new Error(`timeout waiting for ${url}; last=${JSON.stringify(last)}`);
}

async function waitDb(probe, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await probe();
    if (last) return last;
    await delay(100);
  }
  throw new Error(`timeout waiting for database condition; last=${JSON.stringify(last)}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function checked(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  const code = await waitExit(child);
  const content = Buffer.concat(output).toString("utf8");
  if (options.logFile) await writeFile(options.logFile, content, "utf8");
  if (code !== 0 && !options.allowFailure) throw new Error(`${command} ${args.join(" ")} exited ${code}\n${content}`);
  return content;
}

async function capture(child, logFile) {
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => chunks.push(chunk));
  await waitExit(child).catch(() => {});
  await writeFile(logFile, Buffer.concat(chunks), "utf8");
}

function waitExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => child.once("exit", resolve).once("error", reject));
}

async function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function version(command) {
  return (await checked(command, ["--version"])).trim();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
