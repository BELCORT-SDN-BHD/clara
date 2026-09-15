// The frozen IMPORT-CLOSURE walk, factored out of check-frozen-workflows.mjs (#815).
//
// WHY IT IS ITS OWN MODULE. The checker's closure walk answers "is this module frozen?" with a
// single FLAT set merged from every @frozen entry file, and nothing in it records WHICH entry
// reached a given module. That attribution is exactly what an author needs before touching a
// module like `lib/work-trace.mjs` — reached only through a DYNAMIC import from
// `claraWork.v3.impl.ts` — or `lib/capability-registry.mjs`, reached only TRANSITIVELY through
// work-trace.mjs. Until #815 the only answer was hand-written `note` prose on four manifest
// entries: unmaintainable for the other 277 and free to drift from the real import graph.
//
// The walk itself is UNCHANGED — `computeFrozenClosures` returns the same `frozenRel` flat set
// the checker has always computed, plus the per-entry partition whose union IS that set
// (asserted by check-frozen-workflows.selftest.mjs against the real tree). Living here rather
// than inside the CLI lets the selftest assert the attribution without executing a program that
// calls `process.exit` at import time, the same reason freeze-lint-checks.mjs is a pure sibling.
//
// No dependencies — Node built-ins only.

import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";

export const FROZEN_MARKER = "@frozen";
export const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"]);
/** Coverage scope: ALL tracked source under packages/. Not a narrow per-directory allowlist. */
export const SCAN_PATHSPEC = "packages";

/** Tracked + new-but-not-ignored source files under packages/ (mirrors check-leaks). */
export function scannedSourceFiles(repoRoot, pathspec = SCAN_PATHSPEC) {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", pathspec], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(out)].filter((rel) => SOURCE_EXT.has(extname(rel).toLowerCase()));
}

export function toRel(repoRoot, abs) {
  return relative(repoRoot, abs).split("\\").join("/");
}

/** Resolve a relative import specifier to an on-disk source file (.js -> .ts, etc.). */
export function resolveRelImport(fromAbs, spec) {
  const raw = resolve(dirname(fromAbs), spec);
  const candidates = [raw];
  const jsExt = raw.match(/\.([cm]?)jsx?$/);
  if (jsExt) {
    // "./steps.js" written in TS source resolves to "./steps.ts".
    candidates.push(raw.replace(/\.[cm]?jsx?$/, ".ts"));
    candidates.push(raw.replace(/\.[cm]?jsx?$/, ".tsx"));
    candidates.push(raw.replace(/\.[cm]?jsx?$/, ".mts"));
    candidates.push(raw.replace(/\.[cm]?jsx?$/, ".cts"));
  }
  for (const ext of SOURCE_EXT) candidates.push(raw + ext);
  for (const ext of [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"]) {
    candidates.push(join(raw, "index" + ext));
  }
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

/** All import/export specifiers of a source file (static + dynamic). */
export function allImportsOf(abs) {
  const src = readFileSync(abs, "utf8");
  const specs = new Set();
  const re = /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (spec) specs.add(spec);
  }
  return [...specs];
}

/** Relative import/export specifiers of a source file (static + dynamic). */
export function relativeImportsOf(abs) {
  return allImportsOf(abs).filter((spec) => spec.startsWith("."));
}

/** Transitive relative-import closure (includes the start file itself). */
export function importClosure(startAbs) {
  const seen = new Set();
  const stack = [startAbs];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const spec of relativeImportsOf(cur)) {
      const r = resolveRelImport(cur, spec);
      if (r) stack.push(r); // unresolved relative imports are left to tsc/build
    }
  }
  return seen;
}

/**
 * The set (rel paths) that MUST be frozen: every @frozen file + its import closure,
 * AND the per-entry partition of it.
 *
 * @param {string} repoRoot
 * @param {string[]} files repo-relative source paths to consider as closure roots
 * @returns {{ frozenMarked: string[], frozenRel: string[], byEntry: Map<string, string[]> }}
 *   `frozenRel` is the flat set (sorted) the manifest registers; `byEntry` maps each @frozen
 *   entry file to its OWN closure (sorted). The union of `byEntry`'s values IS `frozenRel`.
 */
export function computeFrozenClosures(repoRoot, files) {
  const frozenMarked = files.filter((rel) => {
    try {
      return readFileSync(join(repoRoot, rel), "utf8").includes(FROZEN_MARKER);
    } catch {
      return false;
    }
  });
  const frozenRelSet = new Set();
  const byEntry = new Map();
  for (const rel of frozenMarked) {
    const own = new Set();
    for (const abs of importClosure(join(repoRoot, rel))) {
      const r = toRel(repoRoot, abs);
      if (r.startsWith("packages/")) {
        // closure should not escape packages/
        own.add(r);
        frozenRelSet.add(r);
      }
    }
    byEntry.set(rel, [...own].sort());
  }
  return { frozenMarked, frozenRel: [...frozenRelSet].sort(), byEntry };
}

/**
 * The `--print-closure` report: one section per @frozen entry file, listing the modules that
 * entry's own closure hash-locks. A module reached by several entries appears under each — that
 * repetition is the point, since the question the report answers is "which frozen version(s)
 * does this module belong to". Grep it by module path to read it in that direction.
 *
 * @param {{ frozenRel: string[], byEntry: Map<string, string[]> }} closure
 * @returns {string}
 */
export function formatClosureReport(closure) {
  const entries = [...closure.byEntry.keys()].sort();
  const lines = [
    `freeze-lint closure report — ${entries.length} @frozen entry file(s) locking ${closure.frozenRel.length} module(s) in total.`,
    `Each section is ONE entry file's own transitive relative-import closure (static + dynamic imports,`,
    `clipped to first-party source under packages/). A module under several entries is locked by each of them.`,
    "",
  ];
  for (const entry of entries) {
    const mods = closure.byEntry.get(entry) ?? [];
    lines.push(`${entry}  (${mods.length} module(s))`);
    for (const mod of mods) lines.push(`    ${mod}`);
    lines.push("");
  }
  lines.push(`union: ${closure.frozenRel.length} module(s) — the flat set frozen-workflows.json registers.`);
  return lines.join("\n");
}
