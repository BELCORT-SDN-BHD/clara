import { Worker } from "node:worker_threads";
import { resolveLibWorker } from "./worker-path.mjs";

let tail = Promise.resolve();

// A parse failure is logged HERE, where it happens, because it is logged nowhere else. The
// frozen documentIngest behaviour removes the task sidecar in its catch and then rethrows, so
// every WDK retry after the first dies with a different, misleading error ("has no durable
// runtime metadata") — and the WDK logs only the LAST attempt. Live 2026-07-28: two failed XML
// ingests produced zero usable log lines between them. Same lesson as the 2026-07-26 intake
// outage — only the coarse `code` reaches the DB, and a dropped message costs hours.
// No filename and no document content: a filename can identify a client.
function noteFailure(err, phase, task) {
  console.error(
    `[clara-runtime] structured parse FAILED task=${task?.taskId ?? "?"} lane=${task?.lane ?? "?"} ` +
      `format=${task?.format ?? "?"} phase=${phase} code=${err?.code ?? "internal"} ` +
      `detail=${String(err?.message || err)}`,
  );
  return err;
}

function runWorker(filePath, format, task) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      // Resolved AND existence-checked, so this one expression is correct from source and from
      // the deployed bundle, and an absent worker throws by name instead of surfacing as a bare
      // `internal` on a task row.
      worker = new Worker(resolveLibWorker("structured-worker.mjs", import.meta.url), {
        workerData: { filePath, format, task },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
    } catch (err) {
      reject(noteFailure(Object.assign(err, { code: err?.code ?? "internal" }), "spawn", task));
      return;
    }
    worker.once("message", (message) => {
      if (message?.ok) resolve(message.result);
      else reject(noteFailure(Object.assign(new Error(message?.error || "structured parser failed"), { code: message?.code || "corrupt" }), "parse", task));
    });
    worker.once("error", (err) => reject(noteFailure(Object.assign(err, { code: "internal" }), "worker", task)));
    worker.once("exit", (code) => {
      if (code !== 0) reject(noteFailure(Object.assign(new Error(`structured parser exited ${code}`), { code: "internal" }), "exit", task));
    });
  });
}

/** Global concurrency one. The parse CPU and archive inflation live entirely in a
 * memory-capped worker, never on the supervisor/SSE event loop. */
export function parseStructured(filePath, format, task) {
  const run = tail.then(() => runWorker(filePath, format, task));
  tail = run.catch(() => {});
  return run;
}
