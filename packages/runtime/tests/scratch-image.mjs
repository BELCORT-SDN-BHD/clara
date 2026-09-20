// #637 — BUILD A: a SECOND runtime image, built from this same tree with the registry pinned one
// version back. The two-build cutover e2e needs an image that genuinely cannot run the successor
// body, and the only honest way to get one is to build it.
//
// WHY NOT A `git worktree` AT THE PRE-SUCCESSOR COMMIT. That was the fallback, and it is worse in
// the way that matters: it would need its own `pnpm install`, it would drift from this tree every
// time a non-frozen module changed, and it would prove something about a past commit rather than
// about the CUTOVER MECHANISM. Copying this tree and repointing ONE registry key isolates exactly
// the variable under test.
//
// WHY THE COPY LIVES OUTSIDE packages/runtime, WHICH IS NOT A STYLE CHOICE. Measured during the
// spike for this ticket: with the copy at `packages/runtime/.scratch/buildA`, nitro/WDK scanned it
// as part of the MAIN build and compiled 98 workflows instead of 49 — a silently poisoned
// production image, from a directory whose name starts with a dot and which is gitignored. So the
// copy lives at `<repo>/.scratch/two-build/<name>/`, and bare imports still resolve because the
// parent directory carries ONE junction: `<repo>/.scratch/two-build/node_modules` ->
// `packages/runtime/node_modules`. Node walks up to it; nitro's own `.nitro` build directory
// lands inside the COPY's own real `node_modules`, so the main build's WDK manifest is never
// touched (verified: its mtime is unchanged across a scratch build).
//
// THE REGISTRY IS THE ONLY FILE REWRITTEN, and the repo's own registry is NEVER touched. The
// rewrite is DERIVED, not hardcoded: `deriveVersionPair` reads the live `claraWork: claraWork_vN`
// pin and the retained `export { claraWork_vM }` roster, so when a successor lands the drill
// becomes vM -> vN with no edit here.
//
// MEASURED COST on the dev machine that built it: 59.6s cold for this scratch build, against
// 1m51s cold for `pnpm --filter @clara/runtime build`. Set CLARA_TWO_BUILD_REUSE=1 to reuse an
// existing artifact while iterating LOCALLY; it is off by default so CI always builds fresh.

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(RUNTIME_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, ".scratch", "two-build");
const NITRO_CLI = join(RUNTIME_ROOT, "node_modules", "nitro", "dist", "cli", "index.mjs");
const COPY_DIRS = ["workflows", "src", "lib", "plugins", "scripts"];
const COPY_FILES = ["nitro.config.ts", "package.json", "tsconfig.json"];

/**
 * The version pair this drill runs, read off registry.ts rather than hardcoded.
 *
 * Returns the PINNED identifier (what the real image dispatches to) and the newest RETAINED
 * predecessor (what build A will pin instead). Today that is claraWork_v2 -> claraWork_v1; when a
 * successor lands it becomes v3 -> v2 and nothing here changes.
 * @param {string} registrySrc
 * @param {string} className
 */
export function deriveVersionPair(registrySrc, className = "claraWork") {
  const pinMatch = new RegExp(`${className}:\\s*(${className}_v(\\d+))\\b`).exec(registrySrc);
  if (!pinMatch) throw new Error(`could not derive the ${className} pin — registry.ts has no \`${className}: ${className}_vN\` mapping`);
  const pinned = pinMatch[1];
  const pinnedVersion = Number(pinMatch[2]);

  const retained = [...registrySrc.matchAll(new RegExp(`export\\s*\\{\\s*(${className}_v(\\d+))\\s*\\}`, "g"))]
    .map((m) => ({ identifier: m[1], version: Number(m[2]) }))
    .filter((e) => e.version < pinnedVersion)
    .sort((a, b) => b.version - a.version);
  if (retained.length === 0) {
    throw new Error(
      `registry.ts pins ${pinned} but retains NO earlier ${className} export — a two-build cutover drill needs a predecessor body to park a run on.`,
    );
  }
  return { className, pinned, pinnedVersion, previous: retained[0].identifier, previousVersion: retained[0].version };
}

/**
 * Rewrite a registry source so `className` pins `previous` and the image neither imports, exports
 * nor advertises `pinned`.
 *
 * Every substitution is asserted: a rewrite that silently did not take would produce a build A
 * identical to build B, and the drill would then pass while proving nothing at all — the worst
 * available outcome, so it fails loudly instead.
 * @param {string} src
 * @param {{className:string, pinned:string, pinnedVersion:number, previous:string}} pair
 */
export function rewriteRegistryToPrevious(src, pair) {
  const { className, pinned, pinnedVersion, previous } = pair;
  const steps = [
    // the dispatch pin itself
    [new RegExp(`(\\n  ${className}:\\s*)${pinned}(,)`), `$1${previous}$2`],
    // the import of the body being removed
    [new RegExp(`import \\{ ${pinned} \\} from "\\./${className}\\.v${pinnedVersion}\\.js";\\n`), ""],
    // its re-export
    [new RegExp(`export \\{ ${pinned} \\};\\n`), ""],
    // its entry in the body roster /api/build-info and the boot line read
    [new RegExp(`\\n  "${pinned}",`), ""],
    // and the class pin in the provenance map
    [new RegExp(`(\\n  ${className}: )"${pinned}"`), `$1"${previous}"`],
  ];
  let out = src;
  for (const [pattern, replacement] of steps) {
    const next = out.replace(pattern, replacement);
    if (next === out) throw new Error(`registry rewrite step did not apply: ${pattern}`);
    out = next;
  }
  return out;
}

// #850 fix round 2 (L06-SPEC-R2-03) — WHETHER TO OVERLAP A SECOND SCRATCH BUILD WITH THE FIRST
// LEG'S OWN EXERCISE, made in code rather than left as a declined guard in a CI comment. The
// review's own contention measurement (packages/runtime/README.md's #850 note, action.yml's own
// comment) found the overlapped build taking 7x longer (36.9s vs an idle 5.1s) under just ONE
// concurrent `pnpm typecheck`, and that contended run FAILED — a real `pollTask` timeout inside the
// claraWork leg it was meant to run alongside for free. GitHub-hosted standard runners report 2
// cores; a background `nitro build` (its own multi-file esbuild/rollup pass) has no spare core to
// run on there without starving the leg's own event loop and DB round trips. Below
// `OVERLAP_MIN_CORES` this file falls back to the pre-#850 SEQUENTIAL build (proven safe, just
// slower) instead of gambling the wall-clock win against a failed drill; AC3's own second branch
// ("or the ticket is closed as not worth it, with the measured numbers recorded") is exactly this
// outcome on a runner this thin, and the numbers are the ones already in the CI comment.
export const OVERLAP_MIN_CORES = 4;

/**
 * @param {number} availableCores - typically `os.availableParallelism()`. A non-finite or
 *   non-positive reading (a platform this file cannot read the core count on) is treated as "not
 *   safe to overlap", never as unlimited headroom.
 * @returns {boolean}
 */
export function shouldOverlapSecondBuild(availableCores) {
  return Number.isFinite(availableCores) && availableCores >= OVERLAP_MIN_CORES;
}

/** One junction (a directory symlink on POSIX) so bare imports resolve from the copy. */
function ensureNodeModulesLink() {
  const link = join(SCRATCH_ROOT, "node_modules");
  if (existsSync(link)) return;
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  symlinkSync(join(RUNTIME_ROOT, "node_modules"), link, "junction");
}

/**
 * Stage and build the image. Returns the paths the e2e needs.
 * @param {{name?:string, className?:string, log?:(m:string)=>void}} [opts]
 */
export async function buildPreviousVersionImage(opts = {}) {
  const name = opts.name ?? "previous";
  const log = opts.log ?? (() => {});
  const dir = join(SCRATCH_ROOT, name);
  const serverEntry = join(dir, ".output", "server", "index.mjs");
  const serveScript = join(dir, "scripts", "serve.mjs");
  const registrySrc = readFileSync(join(RUNTIME_ROOT, "workflows", "registry.ts"), "utf8");
  const pair = deriveVersionPair(registrySrc, opts.className ?? "claraWork");

  if (process.env.CLARA_TWO_BUILD_REUSE === "1" && existsSync(serverEntry)) {
    log(`[two-build] REUSING the existing scratch image at ${dir} (CLARA_TWO_BUILD_REUSE=1 — local iteration only)`);
    return { dir, serverEntry, serveScript, pair, reused: true, buildMs: 0 };
  }

  ensureNodeModulesLink();
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  for (const d of COPY_DIRS) cpSync(join(RUNTIME_ROOT, d), join(dir, d), { recursive: true });
  for (const f of COPY_FILES) cpSync(join(RUNTIME_ROOT, f), join(dir, f));

  // The copied tsconfig extends `../../tsconfig.base.json`, which does not exist from here. Copy
  // the real base in beside it rather than rewriting a path into the repo: the copy must be
  // self-contained, and esbuild WARNS rather than fails on a missing base, which would leave a
  // silently differently-compiled bundle.
  cpSync(join(REPO_ROOT, "tsconfig.base.json"), join(dir, "tsconfig.base.json"));
  const tsconfigPath = join(dir, "tsconfig.json");
  const tsconfig = readFileSync(tsconfigPath, "utf8");
  if (!tsconfig.includes('"../../tsconfig.base.json"')) throw new Error("the runtime tsconfig no longer extends ../../tsconfig.base.json — update scratch-image.mjs");
  writeFileSync(tsconfigPath, tsconfig.replace('"../../tsconfig.base.json"', '"./tsconfig.base.json"'));

  const registryPath = join(dir, "workflows", "registry.ts");
  writeFileSync(registryPath, rewriteRegistryToPrevious(registrySrc, pair));
  // DELETE the successor BODY file. Without this the WDK still compiles it (it scans the workflows
  // directory, not the registry's import graph), and build A would carry a body it does not pin —
  // which is a real image shape, but not the one a rollback target has.
  rmSync(join(dir, "workflows", `${pair.className}.v${pair.pinnedVersion}.ts`));

  log(`[two-build] building image "${name}": ${pair.className} pinned to ${pair.previous} (dropping ${pair.pinned})`);
  const startedAt = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NITRO_CLI, "build"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk) => {
      tail = `${tail}${chunk}`.slice(-4000);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", keep);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", keep);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`nitro build for the scratch image exited ${code}\n--- last output ---\n${tail}`));
    });
  });
  const buildMs = Date.now() - startedAt;
  if (!existsSync(serverEntry)) throw new Error(`the scratch build produced no server entry at ${serverEntry}`);
  log(`[two-build] image "${name}" built in ${(buildMs / 1000).toFixed(1)}s -> ${serverEntry}`);
  return { dir, serverEntry, serveScript, pair, reused: false, buildMs };
}

/** Remove the whole scratch tree (the junction included). Safe to call when it was never made. */
export function removeScratchTree() {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
}

export { SCRATCH_ROOT, RUNTIME_ROOT, REPO_ROOT, dirname };
