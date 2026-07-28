#!/usr/bin/env node
// Worker-path gate — the build-level half of the Gate-S fix (live defect, 2026-07-28).
//
// WHAT WENT WRONG, and why no existing gate saw it. The runtime spawns its structured/UBL parser
// in a worker thread:
//
//     new Worker(new URL("./structured-worker.mjs", import.meta.url), …)
//
// correct from SOURCE, wrong in the IMAGE. Nitro inlines the spawning modules into
// .output/server/index.mjs, so the sibling URL resolves to .output/server/structured-worker.mjs,
// while the Dockerfile copies the worker to <root>/lib/. Every XML/csv/xlsx document routed to
// the structured lane failed with a bare `internal`; `structured_parse` had never once succeeded
// in production. Typecheck, lint, freeze-lint and the whole unit battery were green throughout —
// every one of them reads the SOURCE layout, which is the one layout that worked.
//
// So this gate checks the two things none of those could:
//   (1) SOURCE — every `new Worker(...)` in packages/runtime resolves through `resolveLibWorker`,
//       never a bare `new URL(...)`. The broken idiom is the natural one to write, so it is
//       refused by name rather than by convention.
//   (2) BUILT OUTPUT (skipped when absent) — the bundle carries no raw sibling spawn, and for
//       every worker it names, the deployed-layout candidate `<bundleRoot>/../../lib/<name>`
//       EXISTS. `packages/runtime/.output/server/` -> `packages/runtime/lib/` is the same
//       relative arrangement the image has (`/app/.output/server/` -> `/app/lib/`), because the
//       Dockerfile copies both trees to the same root — so validating it here validates it there.
//
// Usage: node scripts/check-worker-paths.mjs        (run AFTER `pnpm build` for the full gate)

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const RUNTIME = join(REPO_ROOT, "packages", "runtime");
const BUNDLE = join(RUNTIME, ".output", "server", "index.mjs");
const RESOLVER_REL = "packages/runtime/lib/worker-path.mjs";

const violations = [];

// --- (1) source: no bare-URL worker spawns ---------------------------------
function trackedRuntimeSources() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "packages/runtime"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((rel) => /\.(mjs|cjs|js|ts|mts|cts)$/.test(rel))
    .filter((rel) => !rel.includes("/.output/") && !rel.startsWith("packages/runtime/tests/"));
}

const RAW_SPAWN = /new\s+Worker\s*\(\s*new\s+URL\s*\(/;

/** Comments are prose, not code: worker-path.mjs QUOTES the broken idiom to explain it, and a
 *  gate that cannot tell an explanation from an instance would forbid documenting the bug it
 *  exists to prevent. (Same approach as the freeze-lint's directive scan.) */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const spawnSites = [];
for (const rel of trackedRuntimeSources()) {
  const abs = join(REPO_ROOT, rel);
  let src = "";
  try {
    if (!statSync(abs).isFile()) continue;
    src = stripComments(readFileSync(abs, "utf8"));
  } catch {
    continue;
  }
  if (!/new\s+Worker\s*\(/.test(src)) continue;
  spawnSites.push(rel);
  if (RAW_SPAWN.test(src)) {
    violations.push(
      `RAW-WORKER-URL  ${rel}  spawns a Worker from a bare new URL(...). That resolves against the ` +
        `BUNDLE in the deployed image, where the worker does not exist. Use resolveLibWorker() from ${RESOLVER_REL}.`,
    );
  }
}
if (spawnSites.length === 0) {
  violations.push(`NO-SPAWN-SITES  found no 'new Worker(' anywhere in packages/runtime — this gate is not actually checking anything; fix the scan.`);
}
if (!existsSync(join(REPO_ROOT, RESOLVER_REL))) {
  violations.push(`MISSING-RESOLVER  ${RESOLVER_REL} is absent — the spawn sites have nothing to resolve through.`);
}

// --- (2) built output: the deployed layout actually resolves ----------------
let bundleChecked = false;
if (existsSync(BUNDLE)) {
  bundleChecked = true;
  const bundle = readFileSync(BUNDLE, "utf8");
  if (RAW_SPAWN.test(bundle)) {
    violations.push(
      `RAW-WORKER-URL-IN-BUNDLE  ${BUNDLE} contains a bare new Worker(new URL(...)) — this is the exact ` +
        `expression that failed in production (it resolves beside the bundle, where nothing is copied).`,
    );
  }
  // Every worker the bundle names must exist at the deployed-layout location.
  const named = new Set([...bundle.matchAll(/["'`]([A-Za-z0-9._-]+-worker\.mjs)["'`]/g)].map((m) => m[1]));
  if (named.size === 0) {
    violations.push(`NO-WORKER-NAMES-IN-BUNDLE  the built bundle names no *-worker.mjs module; the scan is not finding what it should.`);
  }
  for (const name of named) {
    // The same expression the shipped resolver evaluates for the deployed layout.
    const deployed = resolve(dirname(BUNDLE), "..", "..", "lib", name);
    if (!existsSync(deployed)) {
      violations.push(
        `WORKER-UNRESOLVABLE  '${name}' is spawned by the bundle but absent at the deployed-layout path ` +
          `${deployed}. In the image this is /app/lib/${name}; if it is missing here it is missing there.`,
      );
    }
    const beside = resolve(dirname(BUNDLE), name);
    if (existsSync(beside)) {
      // Not fatal, but worth saying: someone "fixed" it by copying the worker beside the bundle,
      // which breaks its OWN sibling imports (./scan.mjs, ./myinvois.mjs) one level deeper.
      console.warn(`check-worker-paths: WARNING — ${name} also sits beside the bundle; the worker's own sibling imports resolve from lib/, so keep lib/ authoritative.`);
    }
  }
}

if (violations.length > 0) {
  console.error("check-worker-paths: FAIL\n");
  for (const v of violations) console.error("  - " + v);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log(
  `check-worker-paths: OK — ${spawnSites.length} spawn site(s) resolve through resolveLibWorker; ` +
    (bundleChecked
      ? "built bundle verified against the deployed layout (.output/server -> ../../lib)."
      : "no built output present (run after `pnpm build` for the image-layout half)."),
);
