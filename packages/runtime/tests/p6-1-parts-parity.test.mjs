// P6-1 commit-parity gate: CI must prove the web reader covers every part this runtime emits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkPartsParity,
  readRuntimeSources,
  UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS,
} from "../scripts/check-parts-parity.mjs";
import { declaredPartShapes } from "../scripts/part-shapes.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DECLARER = await readFile(join(RUNTIME_ROOT, "workflows/chatTurn.v16.parts.ts"), "utf8");
const READER = await readFile(join(REPO_ROOT, "apps/web/lib/parts/types.ts"), "utf8");
const CI = await readFile(join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");

const RUNTIME_SOURCES = readRuntimeSources();

const PRE_P6_READER_KINDS = [
  "text",
  "tool_call",
  "tool_result",
  "tool_error",
  "clarify",
  "clarify_closed",
  "attachment",
  "je_review",
  "refusal",
  "doc_review",
  "diff",
  "sweep_receipt",
  "open_question",
  "bank_recon_receipt",
  "fixed_asset",
  "depreciation_run_receipt",
  "adjustment_run_receipt",
  "staff_advance",
  "entry_posted",
  "question_opened",
  "bank_act",
  "bank_pack",
];

const POST_P6_READER_KINDS = [
  ...PRE_P6_READER_KINDS,
  "agent_receipt",
  "firm_question",
  "close_proposal",
  "freeform_result",
];

function readerFixture(kinds) {
  return `export type ClaraPart =\n${kinds.map((kind) => `  | { type: "${kind}" }`).join("\n")};\n`;
}

test("p6-1.parts-parity: v16 plus the live 22-kind reader REFUSES the unrendered freeform_result emitter", () => {
  const result = checkPartsParity({ declarerSource: DECLARER, readerSource: READER, runtimeSources: RUNTIME_SOURCES });
  assert.deepEqual(result.reader, PRE_P6_READER_KINDS, "control: this branch still carries the literal pre-P6 reader roster");
  assert.deepEqual(result.emittable, ["freeform_result"], "only the kind with an object-literal construction site is emittable here");
  assert.equal(result.ok, false, "the commit-parity gate refuses a reader behind the emitter");
  assert.deepEqual(result.missing, ["freeform_result"]);
  assert.match(
    result.census.find(({ kind }) => kind === "freeform_result").constructionSites[0],
    /^packages\/runtime\/workflows\/chatTurn\.v16\.prompt\.ts:\d+$/,
    "diagnostics retain the observed line without making line motion part of the contract",
  );
  const normalizedCensus = result.census.map((entry) => ({
    ...entry,
    constructionSites: entry.constructionSites.map((site) => site.replace(/:\d+$/, "")),
  }));
  assert.deepEqual(normalizedCensus, [
    { kind: "agent_receipt", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    { kind: "firm_question", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    { kind: "close_proposal", classification: "allowlisted-produced-elsewhere", constructionSites: [] },
    {
      kind: "freeform_result",
      classification: "emittable",
      constructionSites: ["packages/runtime/workflows/chatTurn.v16.prompt.ts"],
    },
  ], "the literal allowlist census pins kind + file while leaving line numbers diagnostic-only");
});

test("p6-1.parts-parity: v16 plus a 26-kind reader fixture is admitted", () => {
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(POST_P6_READER_KINDS),
    readerPath: "reader-26.fixture.ts",
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.deepEqual(result.reader, POST_P6_READER_KINDS, "the positive fixture is the literal post-bump roster, not a derived union");
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("p6-1.parts-parity: the real source reader sees an .mjs construction site", () => {
  const mutantPath = join(RUNTIME_ROOT, "workflows/chatTurn.v17.foo.mjs");
  assert.equal(existsSync(mutantPath), false, "the temporary mutant never overwrites a real source file");
  writeFileSync(mutantPath, 'export const emitted = { type: "agent_receipt" };\n', "utf8");
  try {
    const result = checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(["freeform_result"]),
      runtimeSources: readRuntimeSources(),
    });
    assert.deepEqual(result.allowlistedWithConstructionSites, ["agent_receipt"]);
    assert.equal(result.ok, false, "a produced-elsewhere exemption fails as soon as an .mjs runtime source constructs it");
  } finally {
    rmSync(mutantPath);
  }
});

test("p6-1.parts-parity: an identifier discriminant THROWS instead of disappearing from the census", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(["freeform_result"]),
      runtimeSources: [{
        path: "packages/runtime/workflows/identifier-discriminant.mutant.ts",
        source: 'const kind = "agent_receipt"; export const emitted = { type: kind };\n',
      }],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/identifier-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: a computed type key THROWS instead of disappearing from the census", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(["freeform_result"]),
      runtimeSources: [{
        path: "packages/runtime/workflows/computed-discriminant.mutant.ts",
        source: 'export const emitted = { ["type"]: "agent_receipt" };\n',
      }],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/computed-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: template and spread discriminants also THROW", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(["freeform_result"]),
      runtimeSources: [{
        path: "packages/runtime/workflows/template-discriminant.mutant.ts",
        source: 'const suffix = "receipt"; export const emitted = { type: `agent_${suffix}` };\n',
      }],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/template-discriminant\.mutant\.ts:1/,
  );
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(["freeform_result"]),
      runtimeSources: [{
        path: "packages/runtime/workflows/spread-discriminant.mutant.ts",
        source: 'const overrides = {}; export const emitted = { type: "agent_receipt", ...overrides };\n',
      }],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/spread-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: the reviewed unclassifiable-discriminant exemptions are literal", () => {
  assert.deepEqual(UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS, [
    {
      path: "packages/runtime/workflows/chatTurn.v14.bankSchemas.ts",
      reason: "Zod input schema field for a bank account class; it does not construct a chat part",
    },
    {
      path: "packages/runtime/lib/myinvois-ubl.mjs",
      reason: "MyInvois UBL tax-category projection field; it does not construct a chat part",
    },
  ]);
});

test("p6-1.parts-parity: declaration parsing is AST-backed, quote-agnostic, and string-aware", () => {
  const source = [
    "const fake = 'export type FakeStringPart = { type: \\\"fake_string\\\"; id: string }';",
    "const template = `export type FakeTemplatePart = { type: \\\"fake_template\\\"; id: string }`;",
    "/** export type FakeDocPart = { type: \\\"fake_doc\\\"; id: string } */",
    "export type SingleQuotedPart = { type: 'single_quoted'; id: string };",
  ].join("\n");
  assert.deepEqual(
    [...declaredPartShapes(source).entries()],
    [["single_quoted", ["type", "id"]]],
    "only the real single-quoted TypeAliasDeclaration is counted",
  );
});

test("p6-1.parts-parity: duplicate declaration discriminants THROW", () => {
  const source = [
    'export type FirstPart = { type: "duplicate_part"; first: string };',
    "export type SecondPart = { type: 'duplicate_part'; second: string };",
  ].join("\n");
  assert.throws(() => declaredPartShapes(source), /duplicate discriminant duplicate_part/);
});

test("p6-1.parts-parity: unsupported declaration discriminants THROW", () => {
  assert.throws(
    () => declaredPartShapes("export type DynamicPart = { type: string; id: string };"),
    /unsupported type discriminant shape/,
  );
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
