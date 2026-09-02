// Child-process instrument for binding-pr-3-post-time-gate.test.mjs. `node:test` refuses a
// recursive run() inside an already-running test file, so this clean process observes the 15
// probe events and reports only the fields the parent pins.

import { run } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [sha, preload = "<unset>"] = process.argv.slice(2);
process.env.CLARA_BINDING_PR3_GATE_PROBE_SHA = sha;
if (preload === "<unset>") delete process.env.CLARA_BINDING_PR3_GATE_PROBE_PRELOAD;
else process.env.CLARA_BINDING_PR3_GATE_PROBE_PRELOAD = preload;

const events = [];
const stream = run({
  files: [resolve(here, "binding-pr-3-post-time-gate-probe.mjs")],
  concurrency: false,
});
for await (const event of stream) {
  if ((event.type === "test:pass" || event.type === "test:fail")
      && event.data.name.startsWith("bpr3-probe.")) {
    events.push({
      type: event.type,
      name: event.data.name,
      skip: event.data.skip ?? null,
      failureType: event.data.details?.error?.failureType ?? null,
    });
  }
}
process.stdout.write(JSON.stringify(events));
