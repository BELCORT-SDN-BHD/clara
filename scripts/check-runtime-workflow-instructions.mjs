#!/usr/bin/env node
// Instruction-consistency gate for the workflow freeze rule and active build orders.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { FROZEN_WORKFLOW_FAILURE_GUIDANCE } from "./frozen-workflow-guidance.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const active = join(root, "docs", "plan", "active");
const targets = [
  ".claude/rules/runtime-workflows.md",
  ...readdirSync(active)
    .filter((name) => name.includes("orders") && name.endsWith(".md"))
    .sort()
    .map((name) => `docs/plan/active/${name}`),
];

const checkerRequirements = [
  {
    ownMessage: "ADDING any new frozen file (a new class or a new _vN)",
    document: /(?:brand-new|new) (?:workflow )?class[\s\S]{0,160}new `_vN`|new `_vN`[\s\S]{0,160}(?:brand-new|new) (?:workflow )?class/i,
    label: "both a new class and a new _vN require registration",
  },
  {
    ownMessage: "prove the manifest diff is additions-only",
    document: /(?:semantic(?:ally)?\s+)?additions-only/i,
    label: "the manifest proof is semantic and additions-only",
  },
];

const violations = [];
for (const requirement of checkerRequirements) {
  if (!FROZEN_WORKFLOW_FAILURE_GUIDANCE.includes(requirement.ownMessage)) {
    violations.push(`freeze-lint guidance lost its own canonical claim: ${requirement.ownMessage}`);
  }
}

let governed = 0;
for (const rel of targets) {
  const source = readFileSync(join(root, rel), "utf8");
  if (!/freeze:update|check-frozen-workflows\.mjs/.test(source)) continue;
  governed++;
  for (const requirement of checkerRequirements) {
    if (!requirement.document.test(source)) violations.push(`${rel}: must state ${requirement.label}`);
  }
}

if (governed === 0) violations.push("no active runtime-workflow instruction cites the shipping freeze mechanism");

if (violations.length > 0) {
  console.error("runtime-workflow-instructions: FAIL — active instructions disagree with freeze-lint's own failure guidance:\n");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`runtime-workflow-instructions: OK — ${governed} rule/order file(s) agree with freeze-lint's own failure guidance.`);
