// #637 review S4 — THE BUILT-ARTIFACT GATE for the drills that drive a built image.
//
// THE DEFECT THIS CLOSES. `tests/two-build-cutover-e2e.mjs` and `tests/version-cutover-e2e.mjs`
// both run `packages/runtime/.output/server/index.mjs` — the BUILT bundle, not the source tree. A
// bundle that was never built, or that was built before the change under test, makes those drills
// pass VACUOUSLY: every assertion holds, about code nobody is shipping. The same hazard reaches the
// rollback preflight, whose whole premise is that the roster it compares against came from a real
// artifact (`scripts/rollback-preflight.mjs` already refuses a bundle registering zero bodies).
//
// TWO INDEPENDENT READINGS, because they fail differently:
//
//   1. FRESHNESS, by mtime against the sources that actually enter the bundle. This is the one that
//      catches "I edited lib/reconciler.mjs and forgot to rebuild" — the edit is invisible to the
//      drill and the drill still goes green. `tests/` is deliberately NOT a source root: a test file
//      is not compiled into the bundle, so editing one must not demand a rebuild.
//   2. ROSTER AGREEMENT, between the artifact's own WDK body directives and `registry.ts`'s
//      `workflowBodies`. Freshness by timestamp cannot see a body added in a commit whose files
//      happen to be older than the last build (a rebase, a checkout, a restored file); the two
//      independent derivations disagreeing is what says "this artifact is not this source tree".
//
// It REFUSES rather than warns, and it names the command to run. A gate that prints a warning into
// a 4-minute drill's log is a gate nobody reads.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { supportedBodiesFromBundle } from "../lib/rollback-preflight.mjs";

/** Directory names never compiled into the bundle — walking them would make every build look
 *  stale (`.output` contains the bundle itself, which is always newer than its own sources). */
const SKIP_DIRS = new Set(["node_modules", ".output", ".nitro", ".scratch", ".git"]);

/** The paths, relative to packages/runtime, whose bytes end up INSIDE the bundle. `tests/` and
 *  `scripts/` are absent on purpose: neither is compiled in (`scripts/serve.mjs` is the launcher
 *  that IMPORTS the bundle and is read from disk at run time), so editing either must not demand a
 *  rebuild. */
export const RUNTIME_SOURCE_ROOTS = Object.freeze([
  "workflows",
  "lib",
  "src",
  "plugins",
  "nitro.config.ts",
  "package.json",
]);

/** The newest mtime under `root` (a file or a directory), with the file that carries it. */
function newestUnder(root) {
  let best = { path: null, mtimeMs: -1 };
  let stat;
  try {
    stat = statSync(root);
  } catch {
    return best; // an absent root is not evidence of staleness
  }
  if (!stat.isDirectory()) return { path: root, mtimeMs: stat.mtimeMs };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const inner = newestUnder(join(root, entry.name));
      if (inner.mtimeMs > best.mtimeMs) best = inner;
      continue;
    }
    if (!entry.isFile()) continue;
    const p = join(root, entry.name);
    const s = statSync(p);
    if (s.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: s.mtimeMs };
  }
  return best;
}

/** `registry.ts`'s declared body roster, read from the SOURCE — the other half of the agreement
 *  check. Returns null when the file cannot be read or the export is not in the shape freeze-lint
 *  capability (g) enforces, because a roster this function guessed at would be worse than none. */
export function declaredBodyRoster(registryPath) {
  let src;
  try {
    src = readFileSync(registryPath, "utf8");
  } catch {
    return null;
  }
  const m = /export const workflowBodies[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/"([A-Za-z_$][A-Za-z0-9_$]*)"/g)].map((x) => x[1]).sort();
}

/**
 * Read the built bundle and say whether a drill may trust it.
 *
 * @param {{bundlePath:string, sourceRoots:ReadonlyArray<string>, registryPath?:string|null}} args
 * @returns {{ok:boolean, reason:string|null, detail:string|null, bodies:string[],
 *            builtAtMs:number|null, newestSource:string|null, newestSourceMs:number|null}}
 */
export function inspectBuiltBundle({ bundlePath, sourceRoots, registryPath = null }) {
  const out = { ok: false, reason: null, detail: null, bodies: [], builtAtMs: null, newestSource: null, newestSourceMs: null };

  let bundleStat;
  try {
    bundleStat = statSync(bundlePath);
  } catch {
    out.reason = "not_built";
    out.detail = `no bundle at ${bundlePath}`;
    return out;
  }
  out.builtAtMs = bundleStat.mtimeMs;

  out.bodies = supportedBodiesFromBundle(readFileSync(bundlePath, "utf8"));
  if (out.bodies.length === 0) {
    // The same reading scripts/rollback-preflight.mjs takes of a zero-body target: that is not a
    // clean answer, it is a bundle this code could not read.
    out.reason = "registers_no_bodies";
    out.detail = `${bundlePath} registers ZERO workflow bodies`;
    return out;
  }

  for (const root of sourceRoots) {
    const newest = newestUnder(root);
    if (newest.mtimeMs > (out.newestSourceMs ?? -1)) {
      out.newestSourceMs = newest.mtimeMs;
      out.newestSource = newest.path;
    }
  }
  if (out.newestSourceMs !== null && out.newestSourceMs > out.builtAtMs) {
    out.reason = "stale";
    out.detail =
      `${basename(bundlePath)} was built ${new Date(out.builtAtMs).toISOString()} but ${out.newestSource} `
      + `changed ${new Date(out.newestSourceMs).toISOString()}`;
    return out;
  }

  if (registryPath) {
    const declared = declaredBodyRoster(registryPath);
    if (declared === null) {
      out.reason = "roster_unreadable";
      out.detail = `could not read workflowBodies out of ${registryPath}`;
      return out;
    }
    const artifact = [...out.bodies].sort();
    const missing = declared.filter((b) => !artifact.includes(b));
    const extra = artifact.filter((b) => !declared.includes(b));
    if (missing.length > 0 || extra.length > 0) {
      out.reason = "roster_disagrees";
      out.detail =
        `the artifact registers ${artifact.length} bodies and registry.ts declares ${declared.length}`
        + (missing.length > 0 ? `; absent from the artifact: ${missing.join(", ")}` : "")
        + (extra.length > 0 ? `; in the artifact only: ${extra.join(", ")}` : "");
      return out;
    }
  }

  out.ok = true;
  return out;
}

/** The gate itself: refuse, loudly and with the command to run, or return the inspection. */
export function assertBuiltBundleFresh(args) {
  const result = inspectBuiltBundle(args);
  if (result.ok) return result;
  throw new Error(
    `REFUSING TO RUN AGAINST AN UNTRUSTWORTHY BUILD (${result.reason}): ${result.detail}.\n`
      + "This drill runs the BUILT bundle, so a missing or stale artifact would make every assertion below\n"
      + "pass about code nobody is shipping. Build first:\n"
      + "    pnpm --filter @clara/runtime build",
  );
}
