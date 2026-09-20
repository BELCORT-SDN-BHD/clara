// #851 — THE E2E RUNNER'S ARGUMENT CONTRACT, held by cells rather than by a comment.
//
// `run.mjs` is the ONE entry point every lane in this repo drives (`pnpm --filter @clara/web e2e`),
// so a change to how it reads its own argv is a change to every other lane's harness. Two
// properties matter and neither is visible from a spec file:
//
//   1. THE DEFAULT IS UNCHANGED. A bare run, and a run that names a spec, must produce exactly the
//      argument list the historical expression produced — `process.argv.slice(2).filter(a => a !== "--")`
//      — and must still build. The cells below assert that against the historical expression
//      ITSELF, re-typed here as the oracle, rather than against a hand-copied list: a gate whose
//      expectation is a second copy of the answer cannot catch the answer moving.
//   2. `--no-build` IS A RUNNER FLAG, NOT A SPEC FILTER. It must be consumed here and never reach
//      Playwright, because Playwright treats an unknown positional as a filename filter and an
//      unknown `--flag` as an error — either way the run would not be the run that was asked for.
//
// WHY A SEPARATE MODULE AT ALL. `run.mjs` spawns a build the moment it is imported, so there is no
// way to import it from a test without building the app. The parse is therefore its own pure
// module (`run-args.mjs`) that `run.mjs` calls — the seam is what makes the contract testable.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRunArgs } from "./run-args.mjs";

/** The expression `run.mjs` carried before #851, re-typed as this file's oracle. Every
 *  no-flag case below must still agree with it, argument for argument. */
const historicalPassthrough = (argv: string[]): string[] => argv.filter((arg) => arg !== "--");

test("#851 · a bare run is byte-for-byte the run it always was — it builds, and it forwards nothing", () => {
  const parsed = parseRunArgs([]);
  assert.equal(parsed.build, true, "a bare run still builds");
  assert.deepEqual(parsed.passthrough, historicalPassthrough([]));
});

test("#851 · a run that names one spec still builds, and forwards exactly what it always forwarded", () => {
  // The two shapes a lane actually types: with and without pnpm's own forwarded separator
  // (#630 measured that pnpm 10.33.0 forwards `--` ITSELF in argv).
  for (const argv of [["work-cancel-walk"], ["--", "work-cancel-walk"], ["--", "documents-viewer-walk", "--headed"]]) {
    const parsed = parseRunArgs(argv);
    assert.equal(parsed.build, true, `${JSON.stringify(argv)} still builds`);
    assert.deepEqual(
      parsed.passthrough,
      historicalPassthrough(argv),
      `${JSON.stringify(argv)} must forward exactly the historical list`,
    );
  }
});

test("#851 · --no-build turns the build off and is CONSUMED — Playwright never sees it", () => {
  const parsed = parseRunArgs(["--", "--no-build", "documents-viewer-walk"]);
  assert.equal(parsed.build, false, "--no-build skips the build");
  assert.deepEqual(
    parsed.passthrough,
    ["documents-viewer-walk"],
    "the flag is the runner's own; forwarding it would make Playwright fail on an unknown option",
  );
});

test("#851 · --no-build is positional-free: before the spec, after it, or alone", () => {
  for (const argv of [
    ["--no-build"],
    ["--no-build", "documents-viewer-walk"],
    ["documents-viewer-walk", "--no-build"],
    ["--", "documents-viewer-walk", "--no-build", "--headed"],
  ]) {
    const parsed = parseRunArgs(argv);
    assert.equal(parsed.build, false, `${JSON.stringify(argv)} must skip the build`);
    assert.ok(
      !parsed.passthrough.includes("--no-build"),
      `${JSON.stringify(argv)} must not forward the runner's own flag`,
    );
    assert.deepEqual(
      parsed.passthrough,
      historicalPassthrough(argv).filter((a) => a !== "--no-build"),
      `${JSON.stringify(argv)} must forward everything else untouched`,
    );
  }
});

test("#851 · a LOOK-ALIKE is not the flag — `--no-builds`, `--build` and `no-build` all reach Playwright", () => {
  // The discriminating case. A parser written as `arg.startsWith("--no-build")` or as a
  // `includes("no-build")` test would swallow a spec filter that merely reads like the flag, and
  // the run would silently widen to the whole suite — the exact failure #630 recorded for the
  // stray `--` separator.
  const parsed = parseRunArgs(["--no-builds", "--build", "no-build"]);
  assert.equal(parsed.build, true, "none of these is the flag, so the build still happens");
  assert.deepEqual(parsed.passthrough, ["--no-builds", "--build", "no-build"]);
});
