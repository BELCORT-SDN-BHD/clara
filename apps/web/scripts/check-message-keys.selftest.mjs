#!/usr/bin/env node
// POSITIVE CONTROL for the missing-message gate (E-4 / H-25). A gate that has
// never been SEEN to go red is an assertion, not a control — so this plants a
// missing key in a throwaway fixture tree and requires check-message-keys.mjs
// to fail on it, then re-plants the ACTUAL defect that minted the gate
// (`CodingQuestionsSignals.agentTasks.loading`, absent from en.json while
// agent-tasks-panel.tsx called `t("loading")` on it) and requires the same.
//
//   node scripts/check-message-keys.selftest.mjs   # exit 0 green, 1 red
//
// Same shape as scripts/check-test-manifest.selftest.mjs: a fixture under the
// OS temp dir, never the real repo, driving the exported pure functions — plus
// a LAST case that runs the real gate against THIS repo's real tree and
// requires it green today, so the fixture cases can never diverge from the
// thing that actually ships.
//
// No dependencies — Node built-ins only.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  checkMessageKeys,
  resolveKey,
  staticKeyCalls,
  stripComments,
  translatorBindings,
} from "./check-message-keys.mjs";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function freshFixture() {
  return mkdtempSync(join(tmpdir(), "check-message-keys-selftest-"));
}

console.log("[check-message-keys.selftest]");

// --- THE CONTROL: a planted missing key must go RED -------------------------
testCase("a component asking for a key that is not in en.json is REPORTED", () => {
  const root = freshFixture();
  try {
    write(root, "components/panel.tsx", [
      'const t = useTranslations("Widgets.panel");',
      'export function Panel() { return <p>{t("heading")}{t("nowhere")}</p>; }',
    ].join("\n"));
    const messages = { Widgets: { panel: { heading: "Heading" } } };
    const { problems, checked } = checkMessageKeys(root, messages);
    assert(checked === 2, `expected 2 keys checked, got ${checked}`);
    assert(problems.length === 1, `expected exactly 1 problem, got ${problems.length}`);
    assert(problems[0].path === "Widgets.panel.nowhere", `wrong key reported: ${problems[0].path}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("THE ACTUAL H-25 DEFECT: agentTasks.loading absent while the panel calls t(\"loading\") is REPORTED", () => {
  const root = freshFixture();
  try {
    write(root, "components/firm/agent-tasks-panel.tsx", [
      'const t = useTranslations("CodingQuestionsSignals.agentTasks");',
      'export function AgentTasksPanel() { return <LoadingState>{t("loading")}</LoadingState>; }',
    ].join("\n"));
    // en.json exactly as it stood before this train: heading/note/empty, and a
    // `loading` one level UP, which is the near miss that made the defect easy
    // to write and impossible to see.
    const messages = {
      CodingQuestionsSignals: {
        loading: "Loading…",
        agentTasks: { heading: "Running agent tasks", note: "…", empty: "…" },
      },
    };
    const { problems } = checkMessageKeys(root, messages);
    assert(problems.length === 1, `expected the defect to be caught, got ${problems.length} problem(s)`);
    assert(
      problems[0].path === "CodingQuestionsSignals.agentTasks.loading",
      `wrong key reported: ${problems[0].path}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("a key resolving to a NAMESPACE rather than a string is REPORTED (it throws at runtime too)", () => {
  const root = freshFixture();
  try {
    write(root, "components/panel.tsx", [
      'const t = useTranslations("Widgets");',
      'export function Panel() { return <p>{t("panel")}</p>; }',
    ].join("\n"));
    const { problems } = checkMessageKeys(root, { Widgets: { panel: { heading: "Heading" } } });
    assert(problems.length === 1, `expected 1 problem, got ${problems.length}`);
    assert(/namespace/.test(problems[0].reason), `wrong reason: ${problems[0].reason}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- MUST-NOT-RED controls: the four shapes the gate deliberately skips ------
testCase("a TEMPLATE key with an interpolation is skipped, not falsely reported", () => {
  const root = freshFixture();
  try {
    write(root, "components/panel.tsx", [
      'const t = useTranslations("Widgets");',
      "export function Panel({ kind }) { return <p>{t(`rowKind.${kind}`)}</p>; }",
    ].join("\n"));
    const { problems, checked } = checkMessageKeys(root, { Widgets: {} });
    assert(checked === 0, `a dynamic key must not be counted as checked (got ${checked})`);
    assert(problems.length === 0, `expected no problems, got ${problems.length}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("a key held in a VARIABLE is skipped, not falsely reported", () => {
  const root = freshFixture();
  try {
    write(root, "components/panel.tsx", [
      'const t = useTranslations("Widgets");',
      "export function Panel({ section }) { return <p>{t(section.titleKey)}</p>; }",
    ].join("\n"));
    const { problems } = checkMessageKeys(root, { Widgets: {} });
    assert(problems.length === 0, `expected no problems, got ${problems.length}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("a `t` PARAMETER typed `(key: string) => string` does NOT inherit the file's namespace", () => {
  // THE REGRESSION THIS CASE EXISTS FOR: the gate's first draft matched a
  // parameter list with `[^()]*`, which stops at the `(` of that type
  // annotation — so `t` was never recognised as a parameter and fourteen
  // helper-routed keys were reported as missing on the real tree.
  const source = [
    'const t = useTranslations("ClientDocuments");',
    "function outcomeLabel(outcome: string, t: (key: string, values?: Record<string, string>) => string): string {",
    '  return t("autodraft.outcome.admitted");',
    "}",
  ].join("\n");
  const bindings = translatorBindings(stripComments(source));
  assert(!bindings.has("t"), "an ambiguous `t` (bound AND a parameter) must be dropped whole");
  assert(staticKeyCalls(stripComments(source), bindings).length === 0, "no key may be attributed");
});

testCase("a key inside a COMMENT is not evidence", () => {
  const root = freshFixture();
  try {
    write(root, "components/panel.tsx", [
      'const t = useTranslations("Widgets");',
      '// t("nowhere") — a key named in prose, never called',
      '/* t("alsoNowhere") */',
      'export function Panel() { return <p>{t("heading")}</p>; }',
    ].join("\n"));
    const { problems, checked } = checkMessageKeys(root, { Widgets: { heading: "Heading" } });
    assert(checked === 1, `only the real call may be checked (got ${checked})`);
    assert(problems.length === 0, `expected no problems, got ${problems.length}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("resolveKey distinguishes string / object / missing", () => {
  const messages = { A: { b: "x", c: { d: "y" } } };
  assert(resolveKey(messages, "A.b") === "string", "A.b is a string");
  assert(resolveKey(messages, "A.c") === "object", "A.c is a namespace");
  assert(resolveKey(messages, "A.z") === "missing", "A.z is missing");
  assert(resolveKey(messages, "A.b.deeper") === "missing", "a path through a string is missing");
});

// --- THE REAL TREE, through the real CLI ------------------------------------
testCase("the real gate is GREEN against this repo's real apps/web tree", () => {
  const out = execFileSync(process.execPath, [join(WEB_ROOT, "scripts", "check-message-keys.mjs")], {
    encoding: "utf8",
  });
  assert(/all resolve to a string/.test(out), `unexpected output: ${out}`);
});

console.log(failures === 0 ? "[check-message-keys.selftest] all cases passed" : `[check-message-keys.selftest] ${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
