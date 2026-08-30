#!/usr/bin/env node
// Instruction-consistency gate for the workflow freeze rule and active build orders.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const active = join(root, "docs", "plan", "active");
const targets = [
  ".claude/rules/runtime-workflows.md",
  ...readdirSync(active)
    .filter((name) => name.includes("orders") && name.endsWith(".md"))
    .sort()
    .map((name) => `docs/plan/active/${name}`),
];

const retired = [
  { label: "freeze:update reserved for a brand-new class", re: /freeze:update[^\n]{0,100}brand-new frozen class only/i },
  { label: "freeze-lint passes without manifest regeneration", re: /freeze-lint passes without a manifest regeneration/i },
  { label: "an update demand means the frozen body was edited", re: /if freeze-lint demands an update[^\n]{0,160}edited a frozen body/i },
];

const violations = [];
for (const rel of targets) {
  const source = readFileSync(join(root, rel), "utf8");
  for (const phrase of retired) {
    if (phrase.re.test(source)) violations.push(`${rel}: retired instruction — ${phrase.label}`);
  }
}

const rule = readFileSync(join(root, ".claude/rules/runtime-workflows.md"), "utf8");
if (!/new `_vN` of an existing (?:one|class)/i.test(rule) || !/pnpm freeze:update/.test(rule)) {
  violations.push(".claude/rules/runtime-workflows.md: must require pnpm freeze:update for a new _vN of an existing class");
}
if (!/check-frozen-workflows\.mjs --compare-base <ref>/.test(rule)) {
  violations.push(".claude/rules/runtime-workflows.md: must name the semantic --compare-base <ref> additions-only proof");
}

if (violations.length > 0) {
  console.error("runtime-workflow-instructions: FAIL — active instructions disagree with the shipping freeze mechanism:\n");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`runtime-workflow-instructions: OK — ${targets.length} rule/order file(s) carry no retired freeze wording.`);
