#!/usr/bin/env node
/**
 * apps/web/scripts/run-tests.mjs — `pnpm test`'s real body (T0 seam, port-wave
 * plan §3.1). Reads test/manifest.txt (one test file path per line) and
 * spawns `node --import ./test/bootstrap.mjs --import tsx --test <paths...>`
 * with those paths as positional arguments — the same invocation
 * package.json's `test` script used to hardcode as a single 68-path,
 * 2,152-character line. Moving the enumeration here means adding a test file
 * is a one-line diff to a text file, not an edit to a line long enough that a
 * git conflict resolved "take theirs" could silently delete another train's
 * tests with nothing going red (apps/web/AGENTS.md: the Node 20 test runner
 * does NOT directory-scan for `.test.ts`/`.test.tsx`).
 *
 * Deliberately does NOT also pass a bare `tests/` directory argument the way
 * the old inline command did. That trailing entry was carrying real, invisible
 * weight: Node's directory-scan recognizes `.test.mjs` (just not `.test.ts`/
 * `.test.tsx`), so five `.test.mjs` files under tests/ (apiLimitBanner,
 * focusRailSubscription, streamAuthority, streamParser, streamReattach) ran
 * every `pnpm test` without ever being named anywhere in package.json. They
 * are now explicit lines in test/manifest.txt like every other file — the
 * whole point of this seam is that "which tests run" is legible from ONE
 * checked-in list, not partly from an implicit directory scan whose coverage
 * depends on file extension. check-test-manifest.mjs (this app's `lint`
 * script) is the gate that keeps that list honest.
 */

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(WEB_ROOT, "test", "manifest.txt");

/** Exported so check-test-manifest.mjs's selftest can exercise the exact same
 *  parse without spawning a process — kept here (not duplicated) since this
 *  file owns the manifest FORMAT (one path per line, blank/`#` lines ignored). */
export function parseManifestPaths(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function main() {
  const manifestText = readFileSync(MANIFEST_PATH, "utf8");
  const paths = parseManifestPaths(manifestText);

  if (paths.length === 0) {
    console.error(`[run-tests] test/manifest.txt listed zero test files — refusing to run "node --test" with no arguments (that would fall back to a directory scan and silently change what runs).`);
    process.exit(1);
  }

  const child = spawn(
    process.execPath,
    ["--import", "./test/bootstrap.mjs", "--import", "tsx", "--test", ...paths],
    { cwd: WEB_ROOT, stdio: "inherit" },
  );
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
