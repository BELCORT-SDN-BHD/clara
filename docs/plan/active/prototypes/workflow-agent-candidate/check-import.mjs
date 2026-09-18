import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WorkflowAgent } from "@ai-sdk/workflow";

const workflowPackage = JSON.parse(
  await readFile(new URL("./node_modules/workflow/package.json", import.meta.url), "utf8"),
);
const aiPackage = JSON.parse(
  await readFile(new URL("./node_modules/ai/package.json", import.meta.url), "utf8"),
);

assert.equal(typeof WorkflowAgent, "function");
assert.equal(aiPackage.version, "7.0.93");
assert.equal(workflowPackage.version, "5.0.0-beta.47");

console.log(
  JSON.stringify({
    status: "IMPORT_PASS_BUILD_NOT_PROVEN",
    node: process.version,
    workflowAgent: "2.0.24",
    ai: aiPackage.version,
    workflow: workflowPackage.version,
  }),
);
