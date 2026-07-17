import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Proves the harness is sound WITHOUT a database: boots the BUILT server on
// the Local World (file-backed, no Postgres) and drives the same engine
// primitives the acceptance tests use - start -> step -> parked hook ->
// resume -> completed run with the expected return value.
//
// Deliberately does NOT load .env: the child gets no DATABASE_URL /
// WORKFLOW_TARGET_WORLD / FAULT, so this can never touch the real database.

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverEntry = path.join(root, ".output", "server", "index.mjs");
const dataDir = path.join(root, ".workflow-data-dryrun");
const PORT = "3199";
const base = `http://localhost:${PORT}`;

if (!existsSync(serverEntry)) {
  console.error("Built output not found. Run `pnpm build` first, then `pnpm dryrun`.");
  process.exit(1);
}

rmSync(dataDir, { recursive: true, force: true });

const childEnv: NodeJS.ProcessEnv = { ...process.env };
delete childEnv.DATABASE_URL;
delete childEnv.WORKFLOW_POSTGRES_URL;
delete childEnv.FAULT;
childEnv.WORKFLOW_TARGET_WORLD = "local";
childEnv.WORKFLOW_LOCAL_DATA_DIR = dataDir;
childEnv.PORT = PORT;

const child = spawn(process.execPath, [serverEntry], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
let childLog = "";
child.stdout.on("data", (d: Buffer) => (childLog += d.toString()));
child.stderr.on("data", (d: Buffer) => (childLog += d.toString()));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(pathname: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function fail(message: string): Promise<never> {
  console.error(`\nDRYRUN FAIL: ${message}`);
  console.error("\n--- server log ---\n" + childLog);
  child.kill();
  process.exit(1);
}

try {
  // 1. server boots
  let healthy = false;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  if (!healthy) await fail("server did not become healthy within 60s");
  console.log("1/5 server boots (Local World, no database)");

  // 2. workflow starts (compiler registration + start() plumbing)
  const enq = await postJson("/dryrun/enqueue", {});
  if (enq.status !== 200) await fail(`enqueue returned ${enq.status}: ${JSON.stringify(enq.json)}`);
  const { runId, key, hookToken } = enq.json;
  console.log(`2/5 workflow started (runId=${runId})`);

  // 3. hook registers and parks (retry until the engine records it)
  let resumed = false;
  for (let i = 0; i < 60; i++) {
    const r = await postJson("/demo/resume", { token: hookToken, approved: true, approver: "dryrun" });
    if (r.status === 200) {
      resumed = true;
      break;
    }
    await sleep(500);
  }
  if (!resumed) await fail("hook was never resumable within 30s (park/registration failed)");
  console.log(`3/5 parked hook resumed (token=${hookToken})`);

  // 4. run completes
  let final: any = null;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${base}/demo/run/${runId}`);
    const json: any = await res.json().catch(() => ({}));
    if (json.status === "completed") {
      final = json;
      break;
    }
    if (json.status === "failed") await fail(`run failed: ${JSON.stringify(json)}`);
    await sleep(500);
  }
  if (!final) await fail("run did not complete within 30s after resume");
  console.log("4/5 run completed");

  // 5. return value is correct (step result + hook payload round-tripped)
  const rv = final.returnValue ?? {};
  if (rv.pinged !== `pong:${key}` || rv.approved !== true || rv.approvedBy !== "dryrun") {
    await fail(`unexpected returnValue: ${JSON.stringify(rv)}`);
  }
  console.log(`5/5 return value correct (${JSON.stringify(rv)})`);

  console.log("\nDRYRUN PASS: engine start -> step -> parked hook -> resume -> completion all work.");
  child.kill();
  process.exit(0);
} catch (err) {
  await fail(err instanceof Error ? err.stack ?? err.message : String(err));
}
