// #851 — PLAYWRIGHT'S FILE DISCOVERY, HELD BY A CELL INSTEAD OF BY A DEFAULT.
//
// `playwright.config.ts` sets `testDir: "./e2e"`, and this directory holds TWO kinds of file:
// browser walks (`*.spec.ts`, which Playwright owns) and `node:test` cells (`*.test.ts`, which
// `scripts/run-tests.mjs` owns through `test/manifest.txt`). Playwright's stock `testMatch` —
// `**/*.@(spec|test).?(c|m)[jt]s?(x)`, read out of
// `node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/lib/common/index.js` — matches
// BOTH. So until this file's cell existed, the documented bare `pnpm --filter @clara/web e2e`
// (no spec filter) `import`-ed every `*.test.ts` here as well, and their `node:test` assertions
// ran as an uncontrolled side effect of Playwright's own file loader.
//
// MEASURED, not inferred (this checkout, 2026-09-20):
// `pnpm --filter @clara/web exec playwright test --list` printed raw TAP —
// `TAP version 13`, `ok 1 …` through `ok 35 - #851 · THE VACUITY CONTROL…` — interleaved with
// Playwright's listing, i.e. all four node:test files here ran inside the Playwright process.
// With one census assertion deliberately broken the same run printed
// `not ok 32 - #851 · no spec file reimplements the login form`; the process still exited 0
// (Playwright calls `process.exit()` itself, which discards `node:test`'s pending exit code), so
// the failure was not merely silent about the file — it was silent, full stop. A targeted run
// (`e2e documents-viewer-walk`) never showed it, because Playwright applies the CLI path filter
// BEFORE requiring files, which is why every gate in this lane's own evidence missed it.
//
// Two test runners, one directory, one loader each: that is what the cell below pins.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import playwrightConfig from "../playwright.config";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/** Playwright matches a RegExp `testMatch` against the file's own path, separators normalised. */
function discovers(pattern: RegExp, fileName: string): boolean {
  return pattern.test(join(E2E_DIR, fileName).replaceAll("\\", "/"));
}

test("#851 · Playwright discovers the browser walks and NOTHING else in this directory", () => {
  const { testMatch } = playwrightConfig;
  assert.ok(
    testMatch instanceof RegExp,
    "playwright.config.ts must narrow testMatch: its stock default also matches this directory's node:test files",
  );

  const everyTsFile = readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".ts"))
    .sort();
  const browserWalks = everyTsFile.filter((name) => name.endsWith(".spec.ts"));
  const nodeTestCells = everyTsFile.filter((name) => name.endsWith(".test.ts"));

  // The floor, so neither half of the comparison below can be vacuously empty.
  assert.ok(browserWalks.length >= 46, `the suite's walks must be visible (found ${browserWalks.length})`);
  assert.ok(nodeTestCells.length >= 4, `the node:test cells must be visible (found ${nodeTestCells.length})`);

  assert.deepEqual(
    everyTsFile.filter((name) => discovers(testMatch, name)),
    browserWalks,
    "Playwright's testMatch must select every *.spec.ts here and no *.test.ts",
  );
});

test("#851 · THE VACUITY CONTROL: the stock pattern this narrows WOULD have taken the node:test cells", () => {
  // Playwright's own default, re-typed from its source as this cell's oracle rather than
  // paraphrased — a gate whose expectation is a second copy of the answer proves nothing.
  const stock = /.*\.(spec|test)\.[cm]?[jt]sx?$/;
  assert.equal(discovers(stock, "sign-in-census.test.ts"), true, "the stock pattern takes node:test files");
  assert.equal(discovers(stock, "documents-viewer-walk.spec.ts"), true, "and the walks");

  const { testMatch } = playwrightConfig;
  assert.ok(testMatch instanceof RegExp);
  assert.equal(discovers(testMatch, "sign-in-census.test.ts"), false, "the narrowed pattern drops the node:test file");
  assert.equal(discovers(testMatch, "documents-viewer-walk.spec.ts"), true, "and keeps the walk");
});

// #1019 — THE COVERAGE-MAP COUNT, HELD BY A CELL INSTEAD OF BY MEMORY.
//
// README.md's "Coverage map" section opens with a sentence naming an exact number of specs the
// suite "currently contains." That number is hand-maintained prose, not generated from the real
// file count, and by 2026-09-20 it had drifted to less than half the real count (stated 25,
// real 49) without anything going red. This cell reads the sentence's own number out of the
// README and checks it against the same `*.spec.ts` count `discovers` above already computes, so
// the next spec added or removed fails this cell until the sentence is updated to match.
const COVERAGE_MAP_COUNT = /The checked-in suite currently contains (\d+) specs[.:]/;

test("#1019 · README's coverage-map count matches the real number of checked-in spec files", () => {
  const readmePath = join(E2E_DIR, "README.md");
  const readme = readFileSync(readmePath, "utf8");

  const match = readme.match(COVERAGE_MAP_COUNT);
  assert.ok(match, "README.md must state the coverage-map count in the pinned sentence shape");

  const statedCount = Number(match![1]);
  const realCount = readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts")).length;

  assert.equal(
    statedCount,
    realCount,
    `README.md's coverage-map sentence states ${statedCount} specs but the checked-in suite has ${realCount} — update the sentence`,
  );
});

// #1019 fix round (SPEC-L08-03) — THE OTHER HALF OF THE SAME REQUIREMENT.
//
// The ticket's Desired behavior is not only "the sentence matches disk": it is "a person reading
// the README is never told a number that contradicts what they can count in the table below it OR
// on disk." Pinning the sentence to `readdirSync` alone moved the contradiction rather than
// removing it — 49 on disk, 26 rows in the table directly beneath the sentence. Filling the table
// is out of this ticket's scope by its own words ("Rewriting or auditing the individual per-spec
// description text in the coverage-map table"), so the README says plainly how many of the suite
// the table describes and NAMES the rest, and this cell holds all three numbers together:
// the stated total against disk, the stated described-count against the table's own rows, and the
// stated remainder against the named list — with the two sets required to PARTITION the suite, so
// a new spec cannot be added without landing in one of them.
const COVERAGE_MAP_SPLIT =
  /The table below describes (\d+) of them; the remaining (\d+) have no row yet and are named under/;
/** A coverage-map row opens with the spec's own file name in backticks. */
const COVERAGE_ROW = /^\| `([a-z0-9-]+\.spec\.ts)` \|/gm;
/** The residual list is one bullet per spec, nothing else on the line. */
const RESIDUAL_ITEM = /^- `([a-z0-9-]+\.spec\.ts)`$/gm;

test("#1019 · the README's table and its residual list partition the suite, and both counts are stated", () => {
  const readme = readFileSync(join(E2E_DIR, "README.md"), "utf8");
  const onDisk = readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts")).sort();

  const split = readme.match(COVERAGE_MAP_SPLIT);
  assert.ok(split, "README.md must state how many specs the coverage-map table describes and how many it does not");
  const [statedDescribed, statedResidual] = [Number(split![1]), Number(split![2])];

  const described = [...readme.matchAll(COVERAGE_ROW)].map((m) => m[1]).sort();
  const residual = [...readme.matchAll(RESIDUAL_ITEM)].map((m) => m[1]).sort();

  assert.equal(described.length, statedDescribed,
    `README.md says the table describes ${statedDescribed} specs but it holds ${described.length} rows`);
  assert.equal(residual.length, statedResidual,
    `README.md says ${statedResidual} specs have no row but names ${residual.length}`);
  assert.equal(statedDescribed + statedResidual, onDisk.length,
    `${statedDescribed} described + ${statedResidual} residual must account for all ${onDisk.length} checked-in specs`);

  assert.deepEqual([...described, ...residual].sort(), onDisk,
    "every checked-in spec must appear EXACTLY once, either as a coverage-map row or in the residual list");
});
