// Reporter harness for unique-violation-constraint-name-gate.test.mjs. NOT a test file: the
// parent gate battery launches this clean Node process so node:test can run the behavioural
// file and expose its observable pass/fail events without recursive-runner suppression.

import { run } from "node:test";
import { resolve } from "node:path";

const target = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("reporter harness requires a behavioural test file");

const stream = run({ files: [target], concurrency: 1, timeout: 60_000 });
for await (const event of stream) {
  if ((event.type === "test:pass" || event.type === "test:fail") &&
      event.data.file && resolve(event.data.file) === target) {
    process.stdout.write(`${JSON.stringify({
      eventType: event.type,
      name: event.data.name,
      skip: event.data.skip,
      failureType: event.data.details?.error?.failureType,
      errorMessage: event.data.details?.error?.message,
    })}\n`);
  }
}
