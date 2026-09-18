import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pgBin = requiredEnv("RIG_PG_BIN");
const scratchRoot = path.resolve(requiredEnv("RIG_SCRATCH"));
const runRoot = await mkdtemp(path.join(scratchRoot, "restart-run-"));
if (!path.resolve(runRoot).startsWith(`${scratchRoot}${path.sep}`)) {
  throw new Error(`scratch run escaped RIG_SCRATCH: ${runRoot}`);
}
const dataDir = path.join(runRoot, "pgdata");
const logDir = path.join(runRoot, "logs");
const postgresLog = path.join(logDir, "postgres.log");
const buildLog = path.join(logDir, "nitro-build.log");
const bootstrapLog = path.join(logDir, "world-bootstrap.log");
const serverLogs = [];
const pgPort = await freePort();
const appPort = await freePort();
const databaseUrl = `postgres://postgres@127.0.0.1:${pgPort}/harness`;
const postgresUrl = `postgres://postgres@127.0.0.1:${pgPort}/postgres`;
const runtimeEnv = {
  ...process.env,
  RIG_DATABASE_URL: databaseUrl,
  WORKFLOW_POSTGRES_URL: databaseUrl,
  WORKFLOW_POSTGRES_JOB_PREFIX: "clara607",
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
  await checked(pgExe("initdb"), ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { logFile: path.join(logDir, "initdb.log") });
  await checked(pgExe("pg_ctl"), ["-D", dataDir, "-l", postgresLog, "-o", `-h 127.0.0.1 -p ${pgPort}`, "-w", "start"], { logFile: path.join(logDir, "pgctl-start.log") });
  postgresStarted = true;
  await checked(pgExe("createdb"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "harness"], { logFile: path.join(logDir, "createdb.log") });

  await checked(process.execPath, [path.join(projectRoot, "node_modules", "@workflow", "world-postgres", "bin", "setup.js")], {
    cwd: projectRoot,
    env: runtimeEnv,
    logFile: bootstrapLog,
  });

  pool = new Pool({ connectionString: databaseUrl });
  await pool.query(`
    create schema rig;
    create table rig.trusted_state (
      actor_id text primary key,
      role text not null,
      active boolean not null,
      authority_revision integer not null,
      knowledge_revision integer not null
    );
    create table rig.work_snapshot (
      work_id text primary key,
      actor_id text not null references rig.trusted_state(actor_id),
      required_authority_revision integer not null,
      required_knowledge_revision integer not null,
      workflow_run_id text
    );
    create table rig.chat_messages (
      work_id text primary key,
      body text not null
    );
    create table rig.effects (
      receipt_id bigserial primary key,
      operation_key text not null unique,
      work_id text not null,
      answer_text text not null
    );
  `);

  await checked(process.execPath, [path.join(projectRoot, "node_modules", "nitro", "dist", "cli", "index.mjs"), "build"], {
    cwd: projectRoot,
    env: runtimeEnv,
    logFile: buildLog,
  });

  server = startServer(runtimeEnv, path.join(logDir, "server-1.log"));
  const healthBefore = await waitJson(`${baseUrl()}/health`, (value) => value.ok === true);
  assert.equal(healthBefore.node, process.version);
  assert.equal(healthBefore.pid, server.pid, "health PID is actual serving Node child");
  const firstServerPid = healthBefore.pid;
  const postgresPidBefore = Number((await readFile(path.join(dataDir, "postmaster.pid"), "utf8")).split(/\r?\n/)[0]);

  await post("/seed/stable", { actorId: "actor-stable" });
  await post("/seed/revoked", { actorId: "actor-revoked" });
  await post("/seed/tool-loop", { actorId: "actor-tool-loop" });
  const stableStart = await post("/start/v1/stable", {});
  const revokedStart = await post("/start/v1/revoked", {});
  const toolLoopStart = await post("/start/v3/tool-loop", {});
  assert.match(stableStart.runId, /^wrun_/);
  assert.match(revokedStart.runId, /^wrun_/);
  assert.match(toolLoopStart.runId, /^wrun_/);
  await waitJson(`${baseUrl()}/hook/stable`, (value) => value.active === true);
  await waitJson(`${baseUrl()}/hook/revoked`, (value) => value.active === true);
  await waitJson(`${baseUrl()}/hook/tool-loop`, (value) => value.active === true);
  const persistedHooksBeforeKill = await pool.query(
    "select token from workflow.workflow_hooks where token in ($1,$2,$3) order by token",
    ["answer:stable", "answer:revoked", "answer:tool-loop"],
  );
  assert.equal(persistedHooksBeforeKill.rowCount, 3, "all parked hooks persisted in PostgreSQL before kill");

  const live = await fetch(`${baseUrl()}/stream/stable`);
  assert.equal(live.status, 200);
  const liveReader = live.body.getReader();
  const firstChunk = await liveReader.read();
  assert.match(new TextDecoder().decode(firstChunk.value), /accepted/);
  await liveReader.cancel();

  const firstExit = waitExit(server);
  server.kill();
  await firstExit;
  const pidProbe = await processExists(firstServerPid);
  assert.equal(pidProbe, false, "old serving PID is no longer alive");

  await pool.query("delete from rig.chat_messages where work_id='stable'");
  await pool.query(
    "update rig.trusted_state set role='viewer', active=false, authority_revision=2, knowledge_revision=2 where actor_id='actor-revoked'",
  );
  const mutationEvidence = await pool.query("select role, active, authority_revision, knowledge_revision from rig.trusted_state where actor_id='actor-revoked'");

  server = startServer(runtimeEnv, path.join(logDir, "server-2.log"));
  const healthAfter = await waitJson(`${baseUrl()}/health`, (value) => value.ok === true);
  assert.equal(healthAfter.pid, server.pid, "restart health PID is actual serving Node child");
  assert.notEqual(healthAfter.pid, firstServerPid, "restart uses a different serving PID");
  const postgresPidAfter = Number((await readFile(path.join(dataDir, "postmaster.pid"), "utf8")).split(/\r?\n/)[0]);
  assert.equal(postgresPidAfter, postgresPidBefore, "same PostgreSQL postmaster survived app kill/restart");
  await waitJson(`${baseUrl()}/hook/stable`, (value) => value.active === true);
  await waitJson(`${baseUrl()}/hook/revoked`, (value) => value.active === true);
  await waitJson(`${baseUrl()}/hook/tool-loop`, (value) => value.active === true);

  const answerResults = await Promise.all([
    rawPost("/answer/stable", { answerId: "stable-answer", text: "first" }),
    rawPost("/answer/stable", { answerId: "stable-answer", text: "duplicate" }),
  ]);
  const duplicateAnswerStatuses = answerResults.map((response) => response.status).sort();
  const stableState = await waitJson(`${baseUrl()}/state/stable`, (value) => value.status === "completed");
  assert.equal(stableState.returnValue.status, "completed");
  assert.deepEqual([...stableState.returnValue.concurrentInsertCounts].sort(), [0, 1]);
  assert.equal(stableState.effects.length, 1, "database unique receipt leaves one business effect");
  const deletedBody = await pool.query("select count(*)::int as count from rig.chat_messages where work_id='stable'");
  assert.equal(deletedBody.rows[0].count, 0, "deleted chat body was not resurrected by old workflow");

  const lateReplay = await fetch(`${baseUrl()}/stream/stable`).then((response) => response.text());
  assert.match(lateReplay, /accepted/, "post-restart SSE replays persisted accepted event");
  assert.match(lateReplay, /completed/, "post-restart SSE replays persisted terminal event");

  await post("/answer/revoked", { answerId: "revoked-answer", text: "must not write" });
  const revokedState = await waitJson(`${baseUrl()}/state/revoked`, (value) => value.status === "completed");
  assert.equal(revokedState.returnValue.status, "blocked_authority");
  assert.deepEqual(revokedState.returnValue.observed, {
    role: "viewer",
    active: false,
    authorityRevision: 2,
    knowledgeRevision: 2,
  });
  assert.equal(revokedState.effects.length, 0, "trusted-store revocation produces no effect");

  await post("/answer/tool-loop", { answerId: "tool-loop-answer", text: "continue the synthetic work" });
  const toolLoopState = await waitJson(`${baseUrl()}/state/tool-loop`, (value) => value.status === "completed");
  assert.equal(toolLoopState.returnValue.status, "completed");
  assert.equal(toolLoopState.returnValue.bodyVersion, "v3-tool-loop");
  assert.equal(toolLoopState.returnValue.modelCalls, 4);
  assert.equal(toolLoopState.returnValue.toolErrors, 1);
  assert.equal(toolLoopState.returnValue.duplicateReceiptDeduplicated, true);
  assert.equal(toolLoopState.effects.length, 1, "ToolLoopAgent duplicate call leaves one persisted effect");
  assert.equal(String(toolLoopState.effects[0].receipt_id), toolLoopState.returnValue.receiptId);
  const toolLoopReplay = await fetch(`${baseUrl()}/stream/tool-loop`).then((response) => response.text());
  assert.match(toolLoopReplay, /accepted/, "ToolLoopAgent workflow replays persisted accepted event after restart");
  assert.match(toolLoopReplay, /completed/, "ToolLoopAgent workflow replays persisted completed event after restart");

  await post("/seed/cancelled", { actorId: "actor-cancelled" });
  await post("/start/v1/cancelled", {});
  await waitJson(`${baseUrl()}/hook/cancelled`, (value) => value.active === true);
  await post("/cancel/cancelled", { answerId: "cancel-1" });
  const cancelledState = await waitJson(`${baseUrl()}/state/cancelled`, (value) => value.status === "completed");
  assert.equal(cancelledState.returnValue.status, "cancelled");
  assert.equal(cancelledState.effects.length, 0);

  const evidence = {
    result: "PASS",
    environment: {
      node: process.version,
      postgres: await version(pgExe("postgres")),
      workflow: "4.8.4",
      postgresWorld: "4.3.4",
    },
    processRestart: {
      servingPidBefore: firstServerPid,
      oldPidExited: true,
      servingPidAfter: healthAfter.pid,
      postgresPidBefore,
      postgresPidAfter,
    },
    persistedHooksBeforeKill: persistedHooksBeforeKill.rows.map((row) => row.token),
    trustedStateChangedOutsideAnswerPayload: mutationEvidence.rows[0],
    duplicateAnswerStatuses,
    hookConflictGuarded: duplicateAnswerStatuses.join(",") === "200,409",
    persistedEffect: stableState.effects[0],
    concurrentInsertCounts: stableState.returnValue.concurrentInsertCounts,
    sseReplayAfterRestart: { accepted: true, completed: true },
    integratedToolLoopWorkflow: {
      runId: toolLoopStart.runId,
      bodyVersion: toolLoopState.returnValue.bodyVersion,
      modelCalls: toolLoopState.returnValue.modelCalls,
      toolErrors: toolLoopState.returnValue.toolErrors,
      receiptId: toolLoopState.returnValue.receiptId,
      operationKey: toolLoopState.returnValue.operationKey,
      duplicateReceiptDeduplicated: toolLoopState.returnValue.duplicateReceiptDeduplicated,
      effects: toolLoopState.effects.length,
      sseReplayAfterRestart: { accepted: true, completed: true },
    },
    revokedWork: { status: revokedState.returnValue.status, effects: revokedState.effects.length },
    cancellation: { status: cancelledState.returnValue.status, effects: cancelledState.effects.length },
    limits: [
      "synthetic trusted-state schema, not Clara roles/RLS/business SQL",
      "same compiled binary across restart; no old/new deployment version cutover",
      "loopback scratch PostgreSQL, not hosted infrastructure",
    ],
    logs: runRoot,
  };
  const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(path.join(projectRoot, "server-rig", "last-tool-loop-pass.json"), evidenceJson, "utf8");
  console.log(evidenceJson);
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
    await checked(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { logFile: path.join(logDir, "pgctl-stop.log"), allowFailure: true });
  }
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
  serverLogs.push(capture(child, logFile));
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timeout waiting for ${url}; last=${JSON.stringify(last)}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function checked(command, args, options = {}) {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  const code = await waitExit(child);
  const text = Buffer.concat(output).toString("utf8");
  if (options.logFile) await import("node:fs/promises").then((fs) => fs.writeFile(options.logFile, text));
  if (code !== 0 && !options.allowFailure) throw new Error(`${command} ${args.join(" ")} exited ${code}\n${text}`);
  return text;
}

async function capture(child, logFile) {
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => chunks.push(chunk));
  await waitExit(child);
  await import("node:fs/promises").then((fs) => fs.writeFile(logFile, Buffer.concat(chunks)));
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
