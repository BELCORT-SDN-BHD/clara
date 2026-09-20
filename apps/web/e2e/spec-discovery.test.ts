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
import { readdirSync } from "node:fs";
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
