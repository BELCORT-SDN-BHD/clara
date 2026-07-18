import { Worker } from "node:worker_threads";

let tail = Promise.resolve();

function runWorker(filePath, format, task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./structured-worker.mjs", import.meta.url), {
      workerData: { filePath, format, task },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    worker.once("message", (message) => {
      if (message?.ok) resolve(message.result);
      else reject(Object.assign(new Error(message?.error || "structured parser failed"), { code: message?.code || "corrupt" }));
    });
    worker.once("error", (err) => reject(Object.assign(err, { code: "internal" })));
    worker.once("exit", (code) => {
      if (code !== 0) reject(Object.assign(new Error(`structured parser exited ${code}`), { code: "internal" }));
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
