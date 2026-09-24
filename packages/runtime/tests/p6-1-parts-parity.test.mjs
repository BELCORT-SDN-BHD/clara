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
const REGISTRY = await readFile(join(RUNTIME_ROOT, "workflows/registry.ts"), "utf8");

const RUNTIME_SOURCES = readRuntimeSources();

// #643/#644 (wave-3 integration, v19 review NOTE-1) — the v19 parts module and #643's own purpose
// vocabulary are TypeScript, so they load through tsx's ESM loader, the idiom
// tests/registry-view.test.mjs and f-a1-pr3a-consumers.test.mjs already use in this package.
const { register: registerTsx } = await import("tsx/esm/api");
registerTsx();
const V19_PARTS = await import("../workflows/chatTurn.v19.parts.ts");
const V19_PARTS_SOURCE = await readFile(join(RUNTIME_ROOT, "workflows/chatTurn.v19.parts.ts"), "utf8");
const { PERIODIC_ADJUSTMENT_PURPOSES } = await import("../lib/periodic-adjustment-basis.ts");
const V18_PARTS_SOURCE = await readFile(join(RUNTIME_ROOT, "workflows/chatTurn.v18.parts.ts"), "utf8");

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
  // #623 — the declarer is now a SET (check-parts-parity.mjs's own note says why): chatTurn_v18
  // declares `work_accepted` beside the chat tool that mints it, and claraWork_v1 declares
  // `work_status` / `work_result` beside the Work run that writes them. Every cell below that
  // passes `declarerSource` alone still gets the whole set, because the shorthand means "this
  // declarer's TEXT, plus whatever else the repo declares" — so these three are part of the live
  // roster whichever way a cell names the declarers.
  "work_accepted",
  "work_status",
  "work_result",
  // #629 — claraWork_v2 declares ONE more kind beside the Work run that writes it: the shared
  // question a parked Work is waiting on. Same shorthand as the three above.
  "work_question",
  // #644 (wave-3 integration) — chatTurn_v19 declares ONE more kind beside the chat tool that
  // mints it: the receipt `remember_client_information` leaves in the transcript. Same shorthand
  // again. This literal is a CONTROL over the live reader, so every new wire kind has to be
  // admitted here deliberately rather than absorbed silently.
  "knowledge_receipt",
];

/** The kinds a reader fixture MUST carry for the gate to admit it — the emittable set, which is
 *  the declared set minus the produced-elsewhere allowlist. */
const EMITTABLE_KINDS = ["freeform_result", "work_accepted", "work_status", "work_result", "work_question", "knowledge_receipt"];

function readerFixture(kinds) {
  return `export type ClaraPart =\n${kinds.map((kind) => `  | { type: "${kind}" }`).join("\n")};\n`;
}

function replaceRuntimeSource(path, update) {
  let found = false;
  const sources = RUNTIME_SOURCES.map((entry) => {
    if (entry.path !== path) return entry;
    found = true;
    return { ...entry, source: update(entry.source) };
  });
  assert.equal(found, true, `control: runtime census contains ${path}`);
  return sources;
}

function checkSynthetic(runtimeSources, options = {}) {
  return checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(POST_P6_READER_KINDS),
    runtimeSources,
    siteExemptions: [],
    ...options,
  });
}

test("p6-1.parts-parity: v16 plus the live reader admits the freeform_result emitter", () => {
  const result = checkPartsParity({ declarerSource: DECLARER, readerSource: READER, runtimeSources: RUNTIME_SOURCES });
  assert.deepEqual(result.reader, POST_P6_READER_KINDS, "control: merged P6-2 carries the literal post-bump reader roster");
  assert.deepEqual(result.emittable, EMITTABLE_KINDS, "every declared kind with an object-literal construction site is emittable here");
  assert.equal(result.ok, true, "the commit-parity gate admits the merged reader at parity with the emitter");
  assert.deepEqual(result.missing, []);
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
    {
      kind: "work_accepted",
      classification: "emittable",
      // #643/#644 (wave-3) — chatTurn_v19 mints this kind too, from the SAME two files v18 does.
      // A superseded body keeps shipping (policy (c)), so both versions' sites stay on the census.
      // WAVE 2026-09-15 — chatTurn_v20 mints it from TWO tools, so its tools module appears TWICE.
      // That is the census reporting one site per construction rather than one per file, and it is
      // the evidence this cut wanted: `start_staff_expense_claim_work` and `start_accrual_work` both
      // announce a `journal_entry` Work, which is why `WORK_ACCEPTED_PURPOSES` did NOT have to widen
      // for either of them (0221's amendment; 0193's `_plan_admit_occurrence`).
      //
      // WAVE 2026-09-18 — chatTurn_v21 adds exactly ONE site, and the asymmetry with v20 is the
      // fact worth reading off this row rather than a quirk of it. v21 ships TWO new tools and only
      // `start_trade_invoice_work` appears here: a trade invoice announces a `journal_entry` Work
      // on the existing card (0225 calls the unchanged `_admit_accounting_work_core(...,
      // 'journal_entry', ...)`, so `WORK_ACCEPTED_PURPOSES` stays at three for the third cut
      // running), while `run_depreciation_period_for_client` mints NO card at all — no existing
      // kind can address a depreciation receipt truthfully and #651's stanza forbids a new one.
      // v21 also has no `prompt.ts` site, because its promotion is `admittedWorkAcceptedV20` reached
      // BY IMPORT rather than a fourth copy of one reader.
      constructionSites: [
        "packages/runtime/workflows/chatTurn.v18.prompt.ts",
        "packages/runtime/workflows/chatTurn.v18.tools.ts",
        "packages/runtime/workflows/chatTurn.v19.prompt.ts",
        "packages/runtime/workflows/chatTurn.v19.tools.ts",
        "packages/runtime/workflows/chatTurn.v20.prompt.ts",
        "packages/runtime/workflows/chatTurn.v20.tools.ts",
        "packages/runtime/workflows/chatTurn.v20.tools.ts",
        "packages/runtime/workflows/chatTurn.v21.tools.ts",
      ],
    },
    {
      kind: "work_status",
      classification: "emittable",
      // #631 (wave-3) — claraWork_v3 writes it too, now carrying #738's `client_id`. v2 never
      // re-declared this kind, which is why only v1 and v3 appear.
      constructionSites: [
        "packages/runtime/workflows/claraWork.v1.impl.ts",
        "packages/runtime/workflows/claraWork.v3.impl.ts",
      ],
    },
    {
      kind: "work_result",
      classification: "emittable",
      // WAVE 2026-09-15 — claraWork_v4 writes it too, from the same place v3 does. v4 declares NO
      // new kind at all (claraWork.v3.parts.ts stays the declarer), so this row and `work_status` /
      // `work_question` below are the only places the cut is visible on this census.
      //
      // WAVE 2026-09-18 — claraWork_v5 writes it too, and this row is the ONLY place that cut is
      // visible here, which is the claim worth checking rather than assuming. v5 adds two inspection
      // READS and a knowledge preload; none of the three mints a part (#658's stanza forbids a kind
      // for the reads, and the preload is a step whose durable record is `work_knowledge_reads`),
      // so `work_status` and `work_question` below do NOT gain a v5 site — those stay v1/v3's and
      // v2/v3's, reached by import. A v5 site appearing on either of them would mean this cut
      // copied a park body it was supposed to inherit.
      constructionSites: [
        "packages/runtime/workflows/claraWork.v1.impl.ts",
        "packages/runtime/workflows/claraWork.v2.impl.ts",
        "packages/runtime/workflows/claraWork.v3.impl.ts",
        "packages/runtime/workflows/claraWork.v4.impl.ts",
        "packages/runtime/workflows/claraWork.v5.impl.ts",
        // CUT PHASE 2026-09-25 (#1030). v6 is v5's step bodies with this closure's own identity, so
        // its `completedResultV6` mints `work_result` at the same one site — and, exactly as the
        // note above says of v5, `work_status` and `work_question` below do NOT gain a v6 site:
        // v6's confirmation park calls v3's emitters and v2's open by IMPORT. A v6 site appearing
        // on either would mean this cut copied a park body it was supposed to inherit.
        "packages/runtime/workflows/claraWork.v6.impl.ts",
      ],
    },
    {
      kind: "work_question",
      classification: "emittable",
      constructionSites: [
        "packages/runtime/workflows/claraWork.v2.impl.ts",
        "packages/runtime/workflows/claraWork.v3.impl.ts",
      ],
    },
    {
      // #644 (wave-3) — the knowledge receipt `remember_client_information` leaves in a transcript.
      kind: "knowledge_receipt",
      classification: "emittable",
      constructionSites: [
        "packages/runtime/workflows/chatTurn.v19.prompt.ts",
        "packages/runtime/workflows/chatTurn.v19.tools.ts",
      ],
    },
  ], "the literal allowlist census pins kind + file while leaving line numbers diagnostic-only");
});

test("p6-1.parts-parity: v16 plus the live reader fixture is admitted", () => {
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
      readerSource: readerFixture(EMITTABLE_KINDS),
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
      readerSource: readerFixture(EMITTABLE_KINDS),
      runtimeSources: [{
        path: "packages/runtime/workflows/identifier-discriminant.mutant.ts",
        source: 'const kind = "agent_receipt"; export const emitted = { type: kind };\n',
      }],
      siteExemptions: [],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/identifier-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: a computed type key THROWS instead of disappearing from the census", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(EMITTABLE_KINDS),
      runtimeSources: [{
        path: "packages/runtime/workflows/computed-discriminant.mutant.ts",
        source: 'const key = "type"; export const emitted = { [key]: "agent_receipt" };\n',
      }],
      siteExemptions: [],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/computed-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: an unresolved computed key THROWS instead of being assumed non-type", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(EMITTABLE_KINDS),
      runtimeSources: [{
        path: "packages/runtime/workflows/unknown-computed-key.mutant.ts",
        source: 'export const emitted = { [runtimeKey]: "agent_receipt" };\n',
      }],
      siteExemptions: [],
    }),
    /parts-parity: unclassifiable computed key at packages\/runtime\/workflows\/unknown-computed-key\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: template and spread discriminants also THROW", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(EMITTABLE_KINDS),
      runtimeSources: [{
        path: "packages/runtime/workflows/template-discriminant.mutant.ts",
        source: 'const suffix = "receipt"; export const emitted = { type: `agent_${suffix}` };\n',
      }],
      siteExemptions: [],
    }),
    /parts-parity: unclassifiable discriminant at packages\/runtime\/workflows\/template-discriminant\.mutant\.ts:1/,
  );
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(EMITTABLE_KINDS),
      runtimeSources: [{
        path: "packages/runtime/workflows/spread-discriminant.mutant.ts",
        source: 'const overrides = {}; export const emitted = { type: "agent_receipt", ...overrides };\n',
      }],
      siteExemptions: [],
    }),
    /parts-parity: unclassifiable object spread at packages\/runtime\/workflows\/spread-discriminant\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: the reviewed unclassifiable-discriminant exemptions are literal", () => {
  assert.deepEqual(UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS, [
    {
      path: "packages/runtime/workflows/chatTurn.v14.bankSchemas.ts",
      enclosing: "upsertBankCoaAccountInputSchema",
      signature: "type: z.string().min(1)",
      reason: "Zod input schema field for a bank account class; it does not construct a chat part",
    },
    {
      path: "packages/runtime/lib/myinvois-ubl.mjs",
      enclosing: "extractUblModel",
      signature: 'type: txtAt(category, "cbc:ID")',
      reason: "MyInvois UBL tax-category projection field; it does not construct a chat part",
    },
  ]);
});

test("p6-1.parts-parity: site exemptions cover exactly one reviewed property, never a whole file", () => {
  const secondDynamicSite = replaceRuntimeSource(
    "packages/runtime/lib/myinvois-ubl.mjs",
    (source) => `${source}\nexport function secondProjection() { return { type: runtimeType() }; }\n`,
  );
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(POST_P6_READER_KINDS),
      runtimeSources: secondDynamicSite,
    }),
    /unclassifiable discriminant at packages\/runtime\/lib\/myinvois-ubl\.mjs:\d+/,
    "a second dynamic type property in the same file is not covered by the reviewed site",
  );

  const staleSite = replaceRuntimeSource(
    "packages/runtime/workflows/chatTurn.v14.bankSchemas.ts",
    (source) => source.replace("  type: z.string().min(1),\n", ""),
  );
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(POST_P6_READER_KINDS),
      runtimeSources: staleSite,
    }),
    /stale unclassifiable-site exemption.*upsertBankCoaAccountInputSchema/,
    "deleting the reviewed property makes its exemption stale",
  );
});

test("p6-1.parts-parity: computed keys resolve only through primitive immutable const chains", () => {
  assert.doesNotThrow(() => checkSynthetic([{
    path: "packages/runtime/workflows/primitive-computed-key.control.ts",
    source: 'const first = "other"; const second = first; export const emitted = { [second]: "agent_receipt" };\n',
  }]));

  for (const [name, source] of [
    [
      "spread-overwrite",
      'const payload = {}; const keys = { value: "other", ...payload }; export const emitted = { [keys.value]: "agent_receipt" };\n',
    ],
    [
      "later-assignment",
      'const keys = { value: "other" }; keys.value = "type"; export const emitted = { [keys.value]: "agent_receipt" };\n',
    ],
  ]) {
    assert.throws(
      () => checkSynthetic([{
        path: `packages/runtime/workflows/${name}.mutant.ts`,
        source,
      }]),
      new RegExp(`parts-parity: unclassifiable computed key at packages/runtime/workflows/${name}\\.mutant\\.ts:1`),
      `${name} cannot make mutable object-property resolution look static`,
    );
  }
});

test("p6-1.parts-parity: every object spread is unclassifiable regardless of a direct type literal", () => {
  for (const [name, source] of [
    [
      "unknown-literal-before-spread",
      'const payload = {}; export const emitted = { type: "not_a_part", ...payload };\n',
    ],
    [
      "spread-only",
      'const payload = { type: "agent_receipt" }; export const emitted = { ...payload };\n',
    ],
  ]) {
    assert.throws(
      () => checkSynthetic([{
        path: `packages/runtime/workflows/${name}.mutant.ts`,
        source,
      }]),
      new RegExp(`parts-parity: unclassifiable object spread at packages/runtime/workflows/${name}\\.mutant\\.ts:1`),
      `${name} cannot hide a runtime part discriminant`,
    );
  }
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

test("p6-1.parts-parity: unsupported interface, intersection, and computed declarations THROW", () => {
  const declarations = [
    'export interface InterfacePart { type: "interface_part"; id: string }',
    'export type IntersectionPart = { type: "intersection_part" } & { id: string };',
    'export type ComputedPart = { ["type"]: "computed_part"; id: string };',
  ];
  for (const declaration of declarations) {
    assert.throws(
      () => checkPartsParity({
        declarerSource: `${DECLARER}\n${declaration}\n`,
        readerSource: readerFixture([...POST_P6_READER_KINDS, "interface_part", "intersection_part", "computed_part"]),
        runtimeSources: RUNTIME_SOURCES,
      }),
      /unsupported (?:interface|intersection|computed) part declaration/,
      declaration,
    );
  }
});

test("p6-1.parts-parity: an unknown literal construction is refused instead of skipped", () => {
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(POST_P6_READER_KINDS),
      runtimeSources: [
        ...RUNTIME_SOURCES,
        {
          path: "packages/runtime/workflows/unknown-literal.mutant.mjs",
          source: 'export const emitted = { type: "undeclared_part" };\n',
        },
      ],
    }),
    /unknown part kind 'undeclared_part' constructed at packages\/runtime\/workflows\/unknown-literal\.mutant\.mjs:1 — declare it or site-exempt it/,
  );
});

test("p6-1.parts-parity: declaration-only and construction variants share one scanned-file control", () => {
  const path = "packages/runtime/workflows/paired-site.mutant.ts";
  const declaredOnly = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(POST_P6_READER_KINDS),
    runtimeSources: [
      ...RUNTIME_SOURCES,
      { path, source: 'export type PairedSite = { type: "paired_unknown"; id: string };\n' },
    ],
  });
  const control = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(POST_P6_READER_KINDS),
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.deepEqual(declaredOnly, control, "a declaration in a scanned runtime file is not a construction site");
  assert.throws(
    () => checkPartsParity({
      declarerSource: DECLARER,
      readerSource: readerFixture(POST_P6_READER_KINDS),
      runtimeSources: [
        ...RUNTIME_SOURCES,
        { path, source: 'export const emitted = { type: "paired_unknown" };\n' },
      ],
    }),
    /unknown part kind 'paired_unknown' constructed at packages\/runtime\/workflows\/paired-site\.mutant\.ts:1/,
  );
});

test("p6-1.parts-parity: an allowlisted produced-elsewhere kind that gains a construction site is REFUSED", () => {
  const mutatedSources = [
    ...RUNTIME_SOURCES,
    { path: "packages/runtime/workflows/agent-receipt.mutant.ts", source: 'export const emitted = { type: "agent_receipt" };\n' },
  ];
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(EMITTABLE_KINDS),
    runtimeSources: mutatedSources,
  });
  assert.equal(result.ok, false, "the exemption loses validity as soon as runtime can construct the kind");
  assert.deepEqual(result.allowlistedWithConstructionSites, ["agent_receipt"]);
});

test("p6-1.parts-parity: a declared kind with no construction site and no allowlist explanation is REFUSED", () => {
  const mutatedDeclarer = `${DECLARER}\nexport type UnexplainedPart = { type: "unexplained_part"; id: string };\n`;
  const result = checkPartsParity({
    declarerSource: mutatedDeclarer,
    readerSource: readerFixture([...EMITTABLE_KINDS, "unexplained_part"]),
    runtimeSources: RUNTIME_SOURCES,
  });
  assert.equal(result.ok, false, "every declared-only kind needs an explicit produced-elsewhere explanation");
  assert.deepEqual(result.unexplainedDeclarations, ["unexplained_part"]);
});

test("p6-1.parts-parity: declared-only allowlisted kinds do not turn emitter parity into declarer parity", () => {
  const result = checkPartsParity({
    declarerSource: DECLARER,
    readerSource: readerFixture(EMITTABLE_KINDS),
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

  const deployParagraph = /\/\/ DEPLOY IS HELD[\s\S]*?\/\/ A rollback to v15/.exec(REGISTRY)?.[0];
  assert.ok(deployParagraph, "the v16 deploy paragraph is present");
  assert.match(deployParagraph, /CI `build` job/, "the comment names the CI job that actually runs parity");
  assert.doesNotMatch(deployParagraph, /Docker build/, "the comment never claims the Docker build runs parity");
});

// #643/#644 (wave-3 integration, v19 review NOTE-1) — THE CENSUS `WORK_ACCEPTED_PURPOSES_V19`'s
// DOCBLOCK PROMISES.
//
// WHY THIS CELL HAD TO EXIST. `chatTurn.v19.parts.ts` exports that array with the words "so a
// census can assert the set without retyping the union", and nothing read it. An export inside a
// frozen file can never be deleted once the deploy ceremony stamps `deployed: true`, so the choice
// was to make the promise true or to ship a permanent, unfulfilled claim — and deleting the export
// was not a choice at all. `ClaraPartV18Additions` sets the precedent for the SHAPE (an exported
// census handle); it does not set one for a claim nobody checks.
//
// WHAT IT PROVES. The array is not a hand-typed third copy of the vocabulary: it is exactly
// v18's inherited literal plus #643's OWN enum, so widening the adjustment lane without widening
// this export — or widening this export without widening the lane — reds here. The type union
// `WorkAcceptedPurposeV19` is built from those same two sources (asserted over the source text,
// because a type is erased before this cell can see it), which is what keeps the data and the
// type from drifting apart.
test("p6-1.parts-census: WORK_ACCEPTED_PURPOSES_V19 IS v18's literal plus #643's own purpose enum", () => {
  const purposes = V19_PARTS.WORK_ACCEPTED_PURPOSES_V19;
  assert.ok(Array.isArray(purposes), "the census handle is an array of values, not a type");
  assert.equal(new Set(purposes).size, purposes.length, "no purpose is named twice");

  // v18's literal, read from v18's own declaration rather than retyped here.
  const v18Literal = /^\s*purpose: "([a-z_]+)";$/m.exec(V18_PARTS_SOURCE)?.[1];
  assert.equal(v18Literal, "journal_entry", "control: v18 still declares exactly one work_accepted purpose");

  assert.deepEqual(
    [...purposes],
    [v18Literal, ...PERIODIC_ADJUSTMENT_PURPOSES],
    "the census set is v18's inherited purpose followed by lib/periodic-adjustment-basis.ts's own enum — " +
      "a fourth purpose must be added to the LANE and to this export together, or one surface labels a Work " +
      "the other cannot name",
  );

  // …AND THE TYPE IS BUILT FROM THE SAME TWO SOURCES. A type is erased before this test runs, so
  // the guard against the union and the array drifting apart is a source-text pin on how the union
  // is composed: by reference to v18's part and to #643's exported purpose type, never by
  // re-spelling the literals.
  assert.match(
    V19_PARTS_SOURCE,
    /export type WorkAcceptedPurposeV19 = WorkAcceptedPart\["purpose"\] \| PeriodicAdjustmentPurpose;/,
    "WorkAcceptedPurposeV19 must stay composed of v18's purpose and #643's PeriodicAdjustmentPurpose",
  );
});
