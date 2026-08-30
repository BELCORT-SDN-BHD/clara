// The card-catalog PARITY + REACHABILITY gate, ported from
// apps/dashboard/app/chat/partCatalog.test.tsx. Runs WITHOUT a DB — fixtures only
// (test/bootstrap.mjs sets the JSX runtime; no CSS stub needed here).
//
// Guarantees:
//   1. Parity       — every registered render type produces a visible element
//                     (never the fallback chip); the compile-time asserts in
//                     catalog.ts additionally forbid a wire type that is neither
//                     registered nor a status-resolver (proven separately below by
//                     the deliberate-breakage drill recorded in the build report,
//                     not re-run here since it requires editing types.ts).
//   2. Reachability — every registered type has >=1 fixture that renders non-empty.
//   3. Fallback     — an unknown/unsupported part type renders the explicit chip.
//   4. Resolvers    — tool_result / tool_error render nothing standalone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ClaraPart } from "./types";
import { PART_CATALOG, RENDER_BRANCH_TYPES, STATUS_RESOLVER_TYPES } from "./catalog";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "../../components/parts/PartRenderer";
import messages from "../../messages/en.json";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// THE PROVIDER WRAP (MBB-4, 2026-08-29): the four chatTurn_v14 receipt branches
// route their copy through next-intl, so this harness has to supply the same
// context app/layout.tsx mounts around the whole tree. The eighteen older
// fixtures render byte-identically with or without it — the provider only adds
// context, never markup. `timeZone` is passed because use-intl warns once per
// process when it renders server-side without one (there is no `window` under
// renderToStaticMarkup); it is a harness detail, not a product setting.
function render(part: ClaraPart): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(PartRenderer, { part }),
    }),
  );
}

// 1 + 2: parity + reachability for every registered render-branch type.
for (const type of RENDER_BRANCH_TYPES) {
  const entry = PART_CATALOG[type];
  test(`parity/reachability: ${type} has a non-empty persisted-render branch`, () => {
    assert.ok(entry.fixtures.length >= 1, `${type} must have >=1 reachability fixture`);
    for (const fixture of entry.fixtures) {
      const html = render(fixture);
      assert.ok(html.trim().length > 0, `${type} rendered empty — missing/blank persisted-render branch`);
      assert.ok(
        !html.includes(FALLBACK_UNSUPPORTED_PREFIX),
        `${type} hit the unsupported fallback chip — it has NO persisted-render branch in PartRenderer`,
      );
    }
  });
}

// 3: an unregistered/unknown part type renders the explicit fallback chip.
test("unknown part type renders the explicit unsupported fallback chip", () => {
  const html = render({ type: "totally_unknown_v9" } as unknown as ClaraPart);
  assert.ok(html.includes(FALLBACK_UNSUPPORTED_PREFIX), `expected the fallback chip, got: ${html}`);
  assert.ok(html.includes("totally_unknown_v9"), "the fallback chip should name the unknown type");
});

// 3b: a part-shaped value with a non-string `type` still falls back honestly
// (never throws, never prints "undefined" or "[object Object]").
test("a malformed part with a non-string type still renders the fallback, never throws", () => {
  const html = render({ type: 42 } as unknown as ClaraPart);
  assert.ok(html.includes(`${FALLBACK_UNSUPPORTED_PREFIX}?`), `expected the '?' fallback, got: ${html}`);
});

// 4: status-resolver types intentionally render nothing on their own.
for (const type of STATUS_RESOLVER_TYPES) {
  test(`status-resolver ${type} renders nothing standalone`, () => {
    const fixture =
      type === "tool_result"
        ? ({ type, tool: "trial_balance", tool_call_id: "c1", output: null } as ClaraPart)
        : ({ type, tool: "trial_balance", tool_call_id: "c1", error: "boom" } as ClaraPart);
    assert.equal(render(fixture).trim(), "");
  });
}

// Belt-and-braces: the catalog is exactly 26 live types (24 render branches + 2
// status resolvers). It was 18 (16 + 2) — the corrected count from
// docs/plan/active/codex-frontend-handoff-errata-2026-08-27.md (ii), not the stale
// 21 in frontend-handoff-2026-08-23.md §3.1 — until MBB-4 registered the four
// chatTurn_v14 receipt kinds the live emitter was already putting on the wire
// (22), and 26 since P6-2 registered the Q8 four that chatTurn_v16 declares.
// This test is the one cell in the suite that had to be EDITED by this PR rather
// than added to, and its failing beforehand was the proof that the catalog's own
// completeness mechanism works: the guards in ./catalog.ts and the parity loop
// above cannot be satisfied by a count, so this assertion is the only thing
// standing between "four kinds registered" and "four SPECIFIC kinds registered".
test("the catalog totals 26 live part types (24 render branches + 2 status resolvers)", () => {
  assert.equal(RENDER_BRANCH_TYPES.length, 24);
  assert.equal(STATUS_RESOLVER_TYPES.length, 2);
  const retired = ["kb_rule_proposal", "rule_post_receipt", "bank_rule_proposal"];
  for (const t of retired) {
    assert.ok(!RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} is retired — must not be registered`);
  }
  // The four v14 kinds are registered BY NAME, not merely by count — a count
  // alone would pass if some other four had been added instead.
  for (const t of ["entry_posted", "question_opened", "bank_act", "bank_pack"]) {
    assert.ok(
      RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]),
      `${t} is on the LIVE chatTurn_v14 wire (chatTurn.v14.prompt.ts:27) — it must have a render branch, never the unsupported chip`,
    );
  }
  // The Q8 four, BY NAME and for the same reason. These are the exact four
  // spelled in the declarer's own `CHATTURN_V16_PART_KINDS` array
  // (packages/runtime/workflows/chatTurn.v16.parts.ts), which exists so a census
  // can assert the names against a declaration rather than a comment —
  // "spelling is not identity" applies to a card catalog too.
  for (const t of ["agent_receipt", "firm_question", "close_proposal", "freeform_result"]) {
    assert.ok(
      RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]),
      `${t} is on the chatTurn_v16 wire — it must have a render branch, never the unsupported chip`,
    );
  }
  // 裁-44 / 裁-62 / 裁-70: the tax-draft kind is RESERVED and must NOT be here.
  // Its shape belongs to the ft3-taxprep-design lane, and the tax module is
  // inert at beta — a card for a part nothing emits is the same defect as a
  // control for a door that does not exist. This cell reds the day someone
  // registers one to "get ahead".
  for (const t of ["tax_draft", "tax_prep", "tax_computation"]) {
    assert.ok(
      !RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]),
      `${t} is reserved to the ft3-taxprep-design lane (裁-44) and inert at beta (裁-62) — it must not be registered here`,
    );
  }
});

// The refusal card renders the CLR code + message VERBATIM (contract §3.2's
// deliberate no-hydrate exception) — never re-worded.
test("refusal renders the CLR code and message verbatim", () => {
  const html = render({ type: "refusal", code: "CLR21", reason: "amount_conflict", message: "CLR21: the proposed lines do not match the machine-corroborated total." });
  assert.match(html, /CLR21/);
  assert.match(html, /amount_conflict/);
  assert.match(html, /the proposed lines do not match the machine-corroborated total/);
});

const PART_SOURCE_ROOTS = [resolve(WEB_ROOT, "components/parts"), resolve(WEB_ROOT, "lib/parts")];
const SOURCE_MODULE_PATTERN = /\.(?:[cm]?js|jsx|tsx?)$/;
const TEST_MODULE_PATTERN = /\.test\.(?:[cm]?js|jsx|tsx?)$/;
const TEST_CITATION_PATTERN = /((?:\.\.?\/)*(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.test\.(?:tsx|ts|mjs))(?::\d+)?/g;

type SourceModule = { modulePath: string; source: string };

function modulePathFrom(filePath: string): string {
  return relative(WEB_ROOT, filePath).replaceAll("\\", "/");
}

function walkPartSourceModules(roots: readonly string[] = PART_SOURCE_ROOTS): SourceModule[] {
  const modules: SourceModule[] = [];

  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && SOURCE_MODULE_PATTERN.test(entry.name) && !TEST_MODULE_PATTERN.test(entry.name)) {
        modules.push({ modulePath: modulePathFrom(filePath), source: readFileSync(filePath, "utf8") });
      }
    }
  };

  for (const root of roots) visit(root);
  if (modules.length === 0) {
    throw new Error(`citation walker enumerated zero non-test source files under ${roots.join(", ")}`);
  }
  return modules.sort((a, b) => a.modulePath.localeCompare(b.modulePath));
}

function extractTestCitations(source: string): string[] {
  return [...source.matchAll(TEST_CITATION_PATTERN)]
    .map((match) => match[1])
    .filter((citation): citation is string => citation !== undefined);
}

function resolveTestCitation(modulePath: string, citation: string): string {
  return resolve(WEB_ROOT, dirname(modulePath), citation);
}

function validatePartTestCitations(options: {
  roots?: readonly string[];
  sourceOverrides?: ReadonlyMap<string, string>;
} = {}): Map<string, Set<string>> {
  const citationsByModule = new Map<string, Set<string>>();
  for (const module of walkPartSourceModules(options.roots)) {
    const source = options.sourceOverrides?.get(module.modulePath) ?? module.source;
    const citations = new Set(extractTestCitations(source));
    if (citations.size > 0) citationsByModule.set(module.modulePath, citations);
    for (const citation of citations) {
      assert.ok(
        existsSync(resolveTestCitation(module.modulePath, citation)),
        `${module.modulePath} cites missing test file ${citation}`,
      );
    }
  }
  return citationsByModule;
}

test("the parts citation walker resolves every named real citation across both source trees", () => {
  const citationsByModule = validatePartTestCitations();
  const expectedByModule: Readonly<Record<string, readonly string[]>> = {
    "components/parts/PartCardShell.tsx": ["v16-read-cards.test.tsx"],
    "components/parts/PartRenderer.tsx": ["../../lib/parts/catalog.test.tsx"],
    "components/parts/V16Cards.tsx": ["v16-act-cards.test.tsx", "v16-read-cards.test.tsx"],
    "lib/parts/catalog.ts": [
      "./catalog.test.tsx",
      "../../components/parts/v14-receipt-cards.test.tsx",
      "../../components/parts/v16-read-cards.test.tsx",
      "../../components/parts/v16-act-cards.test.tsx",
      "../../components/parts/v16-cards-a11y.test.tsx",
    ],
    "lib/parts/thread-action-coordinator.tsx": ["../../components/parts/v16-action-round2.test.tsx"],
  };

  for (const [modulePath, expectedCitations] of Object.entries(expectedByModule)) {
    const actual = citationsByModule.get(modulePath);
    assert.ok(actual, `${modulePath} must remain in the walked citation census`);
    for (const citation of expectedCitations) {
      assert.ok(actual.has(citation), `${modulePath} must keep its named citation ${citation}`);
    }
  }
  const expectedCount = Object.values(expectedByModule).reduce((sum, citations) => sum + citations.length, 0);
  const walkedExpectedCount = Object.entries(expectedByModule).reduce(
    (sum, [modulePath, citations]) => sum + citations.filter((citation) => citationsByModule.get(modulePath)?.has(citation)).length,
    0,
  );
  assert.equal(walkedExpectedCount, expectedCount, "every named citation must be found by the recursive walk");
});

test("the citation grammar handles backticks, bare prose, line suffixes, and punctuation without swallowing it", () => {
  const source = [
    "`./round-one.test.tsx:37`",
    "../lib/worker.test.ts:12",
    "./script.test.mjs",
    "v16-cards-a11y.test.tsx.",
    "v16-read-cards.test.tsx's own cell",
    "(../../lib/parts/catalog.test.tsx)",
  ].join(" ");
  assert.deepEqual(extractTestCitations(source), [
    "./round-one.test.tsx",
    "../lib/worker.test.ts",
    "./script.test.mjs",
    "v16-cards-a11y.test.tsx",
    "v16-read-cards.test.tsx",
    "../../lib/parts/catalog.test.tsx",
  ]);
});

test("a dangling citation in PartRenderer outside the former allowlist fails through the real validator", () => {
  const modulePath = "components/parts/PartRenderer.tsx";
  const source = `${readFileSync(resolve(WEB_ROOT, modulePath), "utf8")}\n// ` + "`./citation-walker-dangling.test.tsx:9`";
  assert.throws(
    () => validatePartTestCitations({ sourceOverrides: new Map([[modulePath, source]]) }),
    /components\/parts\/PartRenderer\.tsx cites missing test file \.\/citation-walker-dangling\.test\.tsx/,
  );
});

test("the citation walker aborts when its root enumerates zero source files", () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), "clara-citation-walker-empty-"));
  try {
    assert.throws(
      () => walkPartSourceModules([emptyRoot]),
      /citation walker enumerated zero non-test source files/,
    );
  } finally {
    rmSync(emptyRoot, { recursive: true });
  }
});
