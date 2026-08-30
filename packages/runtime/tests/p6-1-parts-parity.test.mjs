// P6-1 commit-parity gate: CI must prove the web reader covers every part this runtime emits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPartsParity } from "../scripts/check-parts-parity.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DECLARER = await readFile(join(RUNTIME_ROOT, "workflows/chatTurn.v16.parts.ts"), "utf8");
const READER = await readFile(join(REPO_ROOT, "apps/web/lib/parts/types.ts"), "utf8");
const CI = await readFile(join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");

async function runtimeSources(root = RUNTIME_ROOT) {
  const sources = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".output" || entry.name === ".nitro") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
        sources.push({
          path: relative(REPO_ROOT, path).replaceAll("\\", "/"),
          source: await readFile(path, "utf8"),
        });
      }
    }
  }
  await walk(root);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

const RUNTIME_SOURCES = await runtimeSources();

function readerFixture(kinds) {
  return `export type ClaraPart =\n${kinds.map((kind) => `  | { type: "${kind}" }`).join("\n")};\n`;
}

test("p6-1.parts-parity: v16 plus the live 22-kind reader REFUSES the unrendered freeform_result emitter", () => {
  const result = checkPartsParity({ declarerSource: DECLARER, readerSource: READER, runtimeSources: RUNTIME_SOURCES });
  assert.equal(result.reader.length, 22, "control: this branch still carries the pre-P6 reader");
  assert.deepEqual(result.emittable, ["freeform_result"], "only the kind with an object-literal construction site is emittable here");
  assert.equal(result.ok, false, "the commit-parity gate refuses a reader behind the emitter");
  assert.deepEqual(result.missing, ["freeform_result"]);
  assert.deepEqual(result.census, [
    { kind: "agent_receipt", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    { kind: "firm_question", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    { kind: "close_proposal", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    {
      kind: "freeform_result",
      classification: "emittable",
      constructionSites: ["packages/runtime/workflows/chatTurn.v16.prompt.ts:187"],
    },
  ], "the allowlist census is a reviewable artifact, including the sole expression-position construction site");
});

test("p6-1.parts-parity: v16 plus a 26-kind reader fixture is admitted", () => {
  const current = checkPartsParity({ declarerSource: DECLARER, readerSource: READER, runtimeSources: RUNTIME_SOURCES });
  const allKinds = [...new Set([...current.reader, ...current.declared])];
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(allKinds),
    readerPath: "reader-26.fixture.ts",
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.equal(result.reader.length, 26, "the positive fixture is genuinely the post-bump size");
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("p6-1.parts-parity: an allowlisted produced-elsewhere kind that gains a construction site is REFUSED", () => {
  const mutatedSources = [
    ...RUNTIME_SOURCES,
    { path: "packages/runtime/workflows/agent-receipt.mutant.ts", source: 'export const emitted = { type: "agent_receipt" };\n' },
  ];
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(["freeform_result"]),
    runtimeSources: mutatedSources,
  });
  assert.equal(result.ok, false, "the exemption loses validity as soon as runtime can construct the kind");
  assert.deepEqual(result.allowlistedWithConstructionSites, ["agent_receipt"]);
});

test("p6-1.parts-parity: a declared kind with no construction site and no allowlist explanation is REFUSED", () => {
  const mutatedDeclarer = `${DECLARER}\nexport type UnexplainedPart = { type: "unexplained_part"; id: string };\n`;
  const result = checkPartsParity({
    declarerSource: mutatedDeclarer,
    readerSource: readerFixture(["freeform_result", "unexplained_part"]),
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.equal(result.ok, false, "every declared-only kind needs an explicit produced-elsewhere explanation");
  assert.deepEqual(result.unexplainedDeclarations, ["unexplained_part"]);
});

test("p6-1.parts-parity: declared-only allowlisted kinds do not turn emitter parity into declarer parity", () => {
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(["freeform_result"]),
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.equal(result.ok, true, "the reader may omit kinds declared here but produced elsewhere");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.allowlisted, ["agent_receipt", "firm_question", "close_proposal"]);
});

test("p6-1.parts-parity: CI invokes the gate unconditionally after the workflow-bundle gate", () => {
  const build = /\n {2}build:\n([\s\S]*?)\n {2}[a-z][a-z0-9_-]*:\n/.exec(CI)?.[1];
  assert.ok(build, "the build job is present");
  const bundleAt = build.indexOf("run: node scripts/check-workflow-bundle.mjs");
  const parityAt = build.indexOf("run: node packages/runtime/scripts/check-parts-parity.mjs");
  assert.ok(bundleAt >= 0, "control: the workflow-bundle gate is in the build job");
  assert.ok(parityAt > bundleAt, "removing or moving the parts-parity invocation before the bundle gate must red this cell");
  const parityStep = build.slice(build.lastIndexOf("- name:", parityAt), build.indexOf("\n      - name:", parityAt));
  assert.doesNotMatch(parityStep, /\b(?:if|continue-on-error):/, "the parity step is unconditional and fail-closed");
});
