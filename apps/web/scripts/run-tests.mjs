#!/usr/bin/env node
/**
 * Runs every path in test/manifest.txt with the package's Node runtime,
 * test bootstrap and tsx loader. Explicit paths keep coverage independent
 * of Node's test-discovery rules. The manifest check in `pnpm lint` verifies
 * that the list includes every supported test file.
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
