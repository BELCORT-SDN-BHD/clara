#!/usr/bin/env node
/**
 * apps/web/scripts/ui-add.mjs — #772's GUARD in front of every `shadcn add`
 * for this workspace, reached by the package script `ui:add` rather than a
 * bare CLI invocation pasted in prose (`pnpm ui:add pagination`, exactly the
 * shape `pnpm ui:add pagination --dry-run` or `--overwrite` already takes,
 * since every argument this script does not consume is forwarded verbatim to
 * the real, pinned `shadcn` binary).
 *
 * WHAT WENT WRONG ONCE, AND WHY A PROMPT WAS NOT ENOUGH.
 * `docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md` (#641 row): installing
 * `pagination` also tried to overwrite `components/ui/button.tsx` — reverting
 * the owner-ruled offset focus ring that file's own header records — because
 * `pagination`'s registry item names `button` as a `registryDependency`, and
 * the pinned CLI resolves and re-writes every dependency's files too. The
 * pinned CLI is not silent about this: `-o/--overwrite` defaults to `false`,
 * and it raises a per-file confirmation before touching an existing file. But
 * that confirmation is a PROMPT, and a prompt is exactly what an `--overwrite`/
 * `--yes`/`--all` invocation skips, what a non-interactive/headless agent run
 * has nobody at, and what a reviewer clicking through a multi-file install can
 * mis-answer on the one file that mattered. This script is the guard that
 * catches ALL of those cases — because it decides whether to invoke the real
 * CLI AT ALL, before any flag of the CLI's own ever has a chance to matter.
 *
 * HOW A TARGET FILE IS RESOLVED — PREFERRING THE REGISTRY ITEM JSON, NEVER
 * PARSED CONSOLE TEXT. `resolveRegistryItems` (importable straight from the
 * pinned `shadcn` package's own `shadcn/registry` entry point — the CLI's own
 * dependency-resolution code, not a re-implementation of it) returns the FULL,
 * flattened file list for the named component(s) AND every `registryDependency`
 * they name (this is exactly how `button.tsx` reached the payload the one time
 * this went wrong: `pagination`'s registry item names `button` as a
 * dependency). `resolveTargetPaths` below then turns each `{path, type,
 * target}` into the actual project-relative file the CLI would write, using
 * THIS repo's own `components.json` aliases — the same join the CLI itself
 * performs (`registry:ui` under `aliases.ui`, `registry:component` under
 * `aliases.components`, and so on; a file that already carries an explicit
 * `target`, such as a `registry:page`/`registry:file`, is used as-is). Parsing
 * `--dry-run`'s console text is deliberately NOT this script's primary path —
 * that output is formatted for a human, not a stable contract — but the
 * mechanism exists as `resolveTargetPathsFromDryRun` below for the rare
 * component type this mapping does not cover, and the guard's own comparison
 * logic (`checkGuard`) is identical either way.
 *
 * THE ALLOWLIST IS DATA (`protected-components.json`), NOT A CONDITION
 * COMPILED INTO THIS FILE — entering a newly owner-ruled file is a one-line
 * edit to that JSON array, never a change to this script. See
 * `components/ui/README.md` for the review step: what the allowlist protects,
 * how a reviewer adds to it, and what makes an override legitimate.
 *
 * THE OVERRIDE IS ITS OWN, NAMED KNOB — `CLARA_UI_ADD_OVERWRITE=1`, DISTINCT
 * FROM THE CLI'S OWN `--overwrite`. The CLI's flag reaches only the CLI, which
 * this script never invokes at all once it has decided to abort; only this
 * script's own env var lets a deliberate, reviewed overwrite proceed, and its
 * use is echoed in this script's own output so it shows up in a log or a PR.
 *
 * apps/web/scripts/check-ui-add-guard.selftest.mjs is this gate's own positive
 * control, in the `check-*.mjs` + `*.selftest.mjs` house convention
 * (`check-test-manifest.mjs`'s own header) — it drives `checkGuard`/
 * `resolveTargetPaths` directly against FIXTURE payloads (an injected
 * resolver), so it needs no network, and it is wired into `pnpm lint`, which
 * CI's shared lint-suite action already runs on every PR with no pipeline
 * edit.
 *
 * #969 — THE `cn` DEPENDENCY STAND-IN. The guard above answers "would this
 * OVERWRITE a protected FILE"; it never asked "would this add a bogus
 * DEPENDENCY", because it only ever read `resolved.files`. The pinned CLI's
 * registry items for the message/bubble/marker/avatar family (and others)
 * import a `cn()` helper from a bare specifier `"cn"` — a registry-authoring
 * placeholder, not a real published package this repo has ever needed
 * (`lib/utils.ts` exports its own). The CLI's file-WRITE step correctly
 * rewrites that import to this project's own `@/lib/utils` alias; its
 * dependency-INSTALL step does not know that and installs a REAL `cn` npm
 * package instead (#642's `ui:add --dry-run` finding — a hand-revert of
 * `package.json` and the lockfile every time, until now).
 * `classifyDependencies` reads `resolved.dependencies`/`devDependencies`
 * (previously ignored) and splits `cn` out; `main` reports every dependency
 * an item would add on EVERY run, dry or real (a dry run writes nothing, so
 * this report is the only place that information surfaces), and after a
 * REAL install, automates the exact hand-revert #642 describes —
 * `stripLocalDependencies` runs `pnpm remove` on anything classified local,
 * offline, needing no registry fetch. The SAME `CLARA_UI_ADD_OVERWRITE=1`
 * knob the protected-file refusal above already defines lets a caller keep
 * a genuine external `cn` package deliberately, rather than a second
 * refusal vocabulary being invented for this one name.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROTECTED_COMPONENTS_PATH = join(WEB_ROOT, "scripts", "protected-components.json");
const COMPONENTS_JSON_PATH = join(WEB_ROOT, "components.json");
/** THE PINNED LOCAL BINARY — and on Windows that is the `.CMD` shim, not the
 *  extensionless one.
 *
 *  MEASURED (#642, 2026-09-19, Node 22.23.2 on Windows 11): `spawnSync` against
 *  `node_modules/.bin/shadcn` (no extension — a POSIX shell script) returns
 *  `status: null` with an `EINVAL`-class spawn error and NO output at all, so this
 *  guard exited 1 SILENTLY on every clear payload: the refusal path printed its
 *  reason, and the ALLOWED path printed nothing and installed nothing. The failure
 *  looked exactly like "the registry does not resolve for this style", which is the
 *  wrong conclusion — `node_modules/.bin/shadcn.CMD add avatar --dry-run` resolves
 *  fine. Node 22 additionally refuses to execute a `.cmd`/`.bat` without a shell
 *  (the CVE-2024-27980 fix), hence the `shell` flag and the quoted command below.
 *  Nothing about the guard's DECISION changes — this only fixes how the binary the
 *  guard has already cleared is invoked. */
const SHADCN_BIN_BASE = join(WEB_ROOT, "node_modules", ".bin", "shadcn");
const SHADCN_BIN = process.platform === "win32" && existsSync(`${SHADCN_BIN_BASE}.CMD`)
  ? `${SHADCN_BIN_BASE}.CMD`
  : SHADCN_BIN_BASE;

/** THE ONE ENV VAR THAT LETS A DELIBERATE, REVIEWED OVERWRITE PROCEED — distinct
 *  from the underlying CLI's own `-o/--overwrite`, which this guard never lets
 *  reach the CLI on a protected file in the first place. Reused, not
 *  reinvented, for #969's `cn` dependency stand-in below — one refusal
 *  vocabulary, not two. */
export const OVERRIDE_ENV_VAR = "CLARA_UI_ADD_OVERWRITE";

/**
 * #969 — package names this repo already provides ITSELF, so the pinned CLI must never
 * install one as a real npm dependency. `cn` is the one measured case: the registry's own
 * item source imports `cn` from a bare specifier `"cn"` (a registry-authoring convention, not
 * a real published import this repo uses), the CLI's file-WRITE step correctly rewrites that
 * to this project's own `aliases.utils` (`@/lib/utils`, verified live against the pinned
 * 4.19.0 — a freshly-resolved `avatar.tsx` lands on disk importing `cn` from `@/lib/utils`,
 * not from `"cn"`), but the CLI's dependency-INSTALL step is naive: it takes the registry
 * item's declared `dependencies` at face value and installs a REAL `cn` package from npm,
 * which this workspace has never needed and never wants (#642's own `ui:add --dry-run`
 * finding). Only `cn` is named — any other resolved-dependency problem in the pinned CLI is
 * out of scope (#969's own ruling).
 */
export const LOCAL_DEPENDENCY_NAMES = Object.freeze(["cn"]);

/**
 * Split a registry item's resolved dependency list into names this repo already provides
 * locally (never installed as a real npm package here) and everything else. Order-stable and
 * de-duplicated so the guard's own report reads the same way every run.
 * @param {readonly string[]} dependencies
 * @returns {{ local: string[], external: string[] }}
 */
export function classifyDependencies(dependencies) {
  const seen = new Set(dependencies ?? []);
  const local = LOCAL_DEPENDENCY_NAMES.filter((name) => seen.has(name));
  const external = [...seen].filter((name) => !LOCAL_DEPENDENCY_NAMES.includes(name)).sort();
  return { local, external };
}

/** registry item `type` → the `components.json` alias key the pinned CLI
 *  joins it under. Only the types this workspace's own installs have ever
 *  used are named — see the module header for why a file with its OWN
 *  explicit `target` (registry:page/registry:file) never consults this map at
 *  all. */
const TYPE_ALIAS_KEY = {
  "registry:ui": "ui",
  "registry:component": "components",
  "registry:hook": "hooks",
  "registry:lib": "lib",
};

/** `"@/components/ui"` → `"components/ui"` — the same leading-alias strip the
 *  CLI's own path resolution performs against a TypeScript path alias. */
function stripAliasPrefix(aliasPath) {
  return String(aliasPath ?? "").replace(/^[@~]\//, "");
}

/**
 * The project-relative file EVERY registry file in `files` would be written
 * to, given this project's own `components.json` `aliases`. A file this
 * mapping cannot place (an unrecognised `type`, or a `registry:theme`/
 * `registry:base`/`registry:style` item that writes no discrete file of its
 * own) is silently OMITTED rather than guessed — the allowlist comparison
 * that follows can only ever be too cautious about a file it CAN name, never
 * silently blind to one it named wrong.
 * @param {ReadonlyArray<{path: string, type?: string, target?: string}>} files
 * @param {Record<string, string>} aliases
 * @returns {string[]}
 */
export function resolveTargetPaths(files, aliases) {
  const out = [];
  for (const file of files ?? []) {
    if (typeof file.target === "string" && file.target !== "") {
      out.push(file.target.replace(/^[@~]\//, ""));
      continue;
    }
    const aliasKey = TYPE_ALIAS_KEY[file.type];
    if (!aliasKey) continue;
    const dir = stripAliasPrefix(aliases?.[aliasKey]);
    if (dir === "") continue;
    out.push(`${dir}/${basename(file.path)}`);
  }
  return out;
}

/** THE FALLBACK, NAMED IN THE MODULE HEADER: recovers target file paths from
 *  the pinned CLI's OWN `add --dry-run` console text, for the rare shape
 *  `resolveTargetPaths` cannot place. Never the primary path — the CLI's own
 *  wording is not a contract this script pins — but kept narrow and isolated
 *  so a format drift fails LOUD (an empty result, never a wrong one) rather
 *  than silently waving a real overwrite through. The pinned CLI's own
 *  `--dry-run` output lists each file it WOULD write as an absolute or
 *  project-relative path, one per line, inside a short summary; this reads
 *  every line that ends in a recognisable source extension and keeps the
 *  project-relative suffix.
 * @param {string} dryRunOutput
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function resolveTargetPathsFromDryRun(dryRunOutput, projectRoot) {
  const out = [];
  const rootPrefix = `${projectRoot.replace(/\/+$/, "")}/`;
  for (const rawLine of String(dryRunOutput ?? "").split("\n")) {
    const line = rawLine.trim();
    const m = /([^\s]+\.(?:tsx|ts|jsx|js|css))\b/.exec(line);
    if (!m) continue;
    const found = m[1].startsWith(rootPrefix) ? m[1].slice(rootPrefix.length) : m[1];
    if (!found.startsWith("/")) out.push(found);
  }
  return out;
}

/** Reads the checked-in allowlist — DATA, never a branch compiled into this
 *  file. A new owner-ruled file is a one-line edit to this JSON array. */
export function loadAllowlist(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error("protected-components.json must be a JSON array of project-relative paths");
  }
  return parsed;
}

/**
 * THE GUARD'S WHOLE DECISION, as one pure function — the piece
 * check-ui-add-guard.selftest.mjs drives directly against fixtures.
 *
 * #989 — PARTIAL INSTALL, NEVER ALL-OR-NOTHING, UNLESS THERE IS NOTHING LEFT
 * TO INSTALL. `installable` is `targetPaths` minus `blocked` — every file the
 * payload names that carries no owner-ruled fix, and so is always safe to
 * write regardless of what else in the same payload is protected (this is
 * how `main()` below installs Combobox's four non-protected files while
 * leaving `button.tsx` untouched, instead of #772's original refusal of the
 * WHOLE payload). `allowed` stays false in exactly the one case where a
 * partial install would write NOTHING new: every resolved path is on the
 * allowlist (the `pagination` incident this guard was built for, and the
 * ONE existing case this function's own selftest already covers unchanged —
 * `pagination.tsx` itself has been on the allowlist since #771, so that
 * fixture's closure is entirely blocked, not partial).
 * @param {{targetPaths: readonly string[], allowlist: readonly string[], override: boolean}} input
 * @returns {{blocked: string[], installable: string[], allowed: boolean, overrideUsed: boolean}}
 *   `allowed` is true when the install may proceed — nothing on the allowlist
 *   is touched, the override was given, or at least one non-protected file
 *   remains to install (a partial run, protected file(s) skipped).
 */
export function checkGuard({ targetPaths, allowlist, override }) {
  const allowlistSet = new Set(allowlist);
  const blocked = [...new Set(targetPaths.filter((p) => allowlistSet.has(p)))].sort();
  const installable = [...new Set(targetPaths.filter((p) => !allowlistSet.has(p)))].sort();
  const overrideUsed = blocked.length > 0 && override === true;
  const allowed = override === true || installable.length > 0 || blocked.length === 0;
  return { blocked, installable, allowed, overrideUsed };
}

/** The default, NETWORK-REACHING resolver: the pinned CLI's own dependency
 *  resolution (`shadcn/registry`'s `resolveRegistryItems`), which is exactly
 *  how `button.tsx` reached the payload the one time this went wrong —
 *  `pagination`'s registry item names `button` as a `registryDependency`, and
 *  this call resolves and flattens the whole closure. Never called by the
 *  selftest, which injects a fixture resolver instead (house rule: the gate
 *  wired into `lint` must not need the network). */
async function defaultResolveFiles(componentNames, config) {
  const { resolveRegistryItems } = await import("shadcn/registry");
  const resolved = await resolveRegistryItems(componentNames, { config });
  return resolved.files ?? [];
}

/** #969 — the SAME registry resolution `defaultResolveFiles` calls, read for its
 *  `dependencies`/`devDependencies` instead of `files`. A separate call (never plumbed
 *  through `resolveFiles`) so every existing `resolveFiles` fixture/injection in the selftest
 *  keeps working unchanged — this is purely additive. Never called by the selftest, which
 *  injects a fixture instead (same house rule as `defaultResolveFiles`). */
async function defaultResolveDependencies(componentNames, config) {
  const { resolveRegistryItems } = await import("shadcn/registry");
  const resolved = await resolveRegistryItems(componentNames, { config });
  return { dependencies: resolved.dependencies ?? [], devDependencies: resolved.devDependencies ?? [] };
}

/** #969 — the automated form of #642's own hand-revert: after a REAL install has already run,
 *  remove every LOCAL-classified dependency (`cn`, and nothing else today) the pinned CLI just
 *  wrote, from both package.json and the lockfile, in one local, offline operation — removing
 *  an already-resolved entry needs no registry fetch. Never called by the selftest (same house
 *  rule as `defaultSpawnAdd`); never called at all for a `--dry-run` (nothing was written) or
 *  when the override was given (the caller wants the real package kept). */
function defaultStripLocalDependencies(names) {
  if (names.length === 0) return 0;
  const useShell = process.platform === "win32";
  const result = spawnSync(useShell ? "pnpm.cmd" : "pnpm", ["remove", ...names], { cwd: WEB_ROOT, stdio: "inherit", shell: useShell });
  if (result.status === null) {
    console.error(`[ui-add] could not run "pnpm remove ${names.join(" ")}" to drop the bogus local dependency stand-in(s): ${result.error?.message ?? "unknown spawn failure"}`);
  }
  return result.status ?? 1;
}

/** #989 — a protected file's pre-install snapshot: its exact bytes if it already exists, or the
 *  fact that it did NOT, so `restoreFileSnapshot` can put it back into EXACTLY the state it was
 *  in before, whichever that was. A pure-ish, single-file primitive (real fs reads, an arbitrary
 *  absolute path — never assumes `WEB_ROOT`) so it can be proven against a throwaway temp file,
 *  never a real repo file, in `check-ui-add-guard.selftest.mjs`.
 * @param {string} absPath
 * @returns {{existed: boolean, content: Buffer|null}}
 */
export function snapshotFile(absPath) {
  return existsSync(absPath) ? { existed: true, content: readFileSync(absPath) } : { existed: false, content: null };
}

/** The other half of `snapshotFile` — writes its exact bytes back if it existed, or removes
 *  whatever the CLI's forced `--overwrite` just created if it did not. Never a partial write: the
 *  CLI's own write already replaced the file wholesale, so this replaces it wholesale again.
 * @param {string} absPath
 * @param {{existed: boolean, content: Buffer|null}} snapshot
 */
export function restoreFileSnapshot(absPath, snapshot) {
  if (snapshot.existed) {
    writeFileSync(absPath, snapshot.content);
  } else if (existsSync(absPath)) {
    rmSync(absPath);
  }
}

/** The default, REAL-FS backup step for a #989 partial install — one `snapshotFile` per blocked,
 *  project-relative path, keyed by that path so `defaultRestoreProtectedFiles` can put each one
 *  back at the same place. Never called by the selftest (same house rule as `defaultSpawnAdd`),
 *  which injects a fixture instead. */
function defaultBackupProtectedFiles(paths) {
  const backups = new Map();
  for (const p of paths) backups.set(p, snapshotFile(join(WEB_ROOT, p)));
  return backups;
}

/** The default, REAL-FS restore step — the other half of `defaultBackupProtectedFiles`. Runs
 *  UNCONDITIONALLY after `spawnAdd`, regardless of its exit code, for the same reason
 *  `stripLocalDependencies` does below: the pinned CLI's own file-write step may have already
 *  written the protected file before a later part of the same run failed. Never called by the
 *  selftest. */
function defaultRestoreProtectedFiles(backups) {
  let restored = 0;
  for (const [p, snapshot] of backups) {
    restoreFileSnapshot(join(WEB_ROOT, p), snapshot);
    restored++;
  }
  return restored;
}

/** The default, REAL-CLI-INVOKING installer — spawns the pinned local binary
 *  (never a floating `npx`-resolved one) with `add` plus every argument this
 *  script did not itself consume, inheriting stdio so the CLI's own prompts
 *  and output still work for a run the guard has cleared. */
function defaultSpawnAdd(args) {
  // A `.CMD` needs a shell on Windows; the command is quoted because `shell: true`
  // hands the string to `cmd.exe` verbatim and a workspace path may contain spaces.
  const useShell = SHADCN_BIN.toLowerCase().endsWith(".cmd");
  const command = useShell ? `"${SHADCN_BIN}"` : SHADCN_BIN;
  const result = spawnSync(command, ["add", ...args], { cwd: WEB_ROOT, stdio: "inherit", shell: useShell });
  if (result.status === null) {
    // NEVER exit silently on a spawn that never ran — that is the whole finding above.
    console.error(`[ui-add] could not run the pinned CLI at ${SHADCN_BIN}: ${result.error?.message ?? "unknown spawn failure"}`);
  }
  return result.status ?? 1;
}

/**
 * THE WHOLE GUARDED FLOW, with its effectful edges injectable — the shape
 * check-ui-add-guard.selftest.mjs needs to prove the decision logic with no
 * network and no real install.
 * @param {string[]} argv everything after the script name — component names and CLI flags alike
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   resolveFiles?: (names: string[], config: unknown) => Promise<ReadonlyArray<{path: string, type?: string, target?: string}>>,
 *   resolveDependencies?: (names: string[], config: unknown) => Promise<{dependencies?: string[], devDependencies?: string[]}>,
 *   spawnAdd?: (args: string[]) => number,
 *   stripLocalDependencies?: (names: string[]) => number,
 *   backupProtectedFiles?: (paths: string[]) => Map<string, {existed: boolean, content: Buffer|null}>,
 *   restoreProtectedFiles?: (backups: Map<string, {existed: boolean, content: Buffer|null}>) => number,
 *   log?: (line: string) => void,
 * }} deps
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, env, deps = {}) {
  const resolveFiles = deps.resolveFiles ?? defaultResolveFiles;
  const resolveDependencies = deps.resolveDependencies ?? defaultResolveDependencies;
  const spawnAdd = deps.spawnAdd ?? defaultSpawnAdd;
  const stripLocalDependencies = deps.stripLocalDependencies ?? defaultStripLocalDependencies;
  const backupProtectedFiles = deps.backupProtectedFiles ?? defaultBackupProtectedFiles;
  const restoreProtectedFiles = deps.restoreProtectedFiles ?? defaultRestoreProtectedFiles;
  const log = deps.log ?? ((line) => console.log(line));

  // EVERY ARGUMENT THIS SCRIPT DOES NOT ITSELF CONSUME IS FORWARDED VERBATIM
  // to the real CLI once the guard clears — `--dry-run`, `--overwrite`,
  // `--yes`, `--all`, `-p`, whatever the caller passed. The guard's own
  // decision below never reads any of them: it aborts on a protected file
  // regardless of which flags reach the underlying CLI, because it decides
  // whether to invoke the CLI AT ALL before those flags could ever matter —
  // and it never consults `process.stdin.isTTY` either, for the identical
  // reason (the CLI's own per-file prompt is what a non-interactive run
  // bypasses; this guard runs before that prompt would ever appear).
  const componentNames = argv.filter((a) => !a.startsWith("-"));
  if (componentNames.length === 0) {
    log("[ui-add] no component named — pass at least one, e.g. `pnpm ui:add pagination`.");
    return 1;
  }

  const componentsConfig = JSON.parse(readFileSync(COMPONENTS_JSON_PATH, "utf8"));
  const allowlist = loadAllowlist(readFileSync(PROTECTED_COMPONENTS_PATH, "utf8"));

  const files = await resolveFiles(componentNames, componentsConfig);
  const targetPaths = resolveTargetPaths(files, componentsConfig.aliases ?? {});

  const override = env[OVERRIDE_ENV_VAR] === "1";
  const { blocked, installable, allowed, overrideUsed } = checkGuard({ targetPaths, allowlist, override });

  if (!allowed) {
    log(`[ui-add] REFUSING: installing ${componentNames.join(", ")} would overwrite ${blocked.length} protected file(s), owner-ruled fixes recorded in-file:`);
    for (const p of blocked) log(`  - ${p}`);
    log("");
    log(`[ui-add] Review components/ui/README.md before adding any of these to the allowlist. To proceed anyway (a deliberate, reviewed overwrite), set ${OVERRIDE_ENV_VAR}=1.`);
    return 1;
  }

  if (overrideUsed) {
    log(`[ui-add] OVERRIDE USED (${OVERRIDE_ENV_VAR}=1): proceeding despite ${blocked.length} protected file(s) in the payload: ${blocked.join(", ")}.`);
  }

  const isDryRun = argv.includes("--dry-run");

  // #989 — PARTIAL INSTALL: some file(s) in the closure are protected, override was NOT given,
  // and `allowed` is still true (checkGuard above) because at least one OTHER file in the same
  // closure is not — install everything installable, skip only the protected file(s), never the
  // whole-payload abort `!allowed` handles above. A `--dry-run` writes nothing at all, so there is
  // nothing to skip yet — only to NAME, the same "report every run, dry or real" posture as the
  // `cn` dependency report below.
  const partialSkip = blocked.length > 0 && !override;
  if (partialSkip && isDryRun) {
    const which = blocked.length === 1 ? "file" : "files";
    log(`[ui-add] a REAL run would install ${installable.length} file(s) and SKIP ${blocked.length} protected ${which} (owner-ruled fixes recorded in-file, left byte-identical): ${blocked.join(", ")}. Set ${OVERRIDE_ENV_VAR}=1 to overwrite ${blocked.length === 1 ? "it" : "them"} instead.`);
  }

  // #969 — resolved and reported EVERY run (dry or real): a caller must never be silently
  // deprived of visibility into what an item would add, and a dry run in particular writes
  // nothing for the strip step below to act on, so this report is the ONLY place that
  // information surfaces for one.
  const resolvedDeps = await resolveDependencies(componentNames, componentsConfig);
  const allDependencyNames = [...new Set([...(resolvedDeps.dependencies ?? []), ...(resolvedDeps.devDependencies ?? [])])];
  const { local, external } = classifyDependencies(allDependencyNames);
  if (allDependencyNames.length > 0) {
    const described = [
      ...external,
      ...local.map((name) => `${name} (local — this repo's own, see lib/utils.ts; never installed as a real npm package)`),
    ];
    log(`[ui-add] dependencies ${componentNames.join(", ")} would add: ${described.join(", ")}.`);
  }
  if (local.length > 0 && override) {
    log(`[ui-add] OVERRIDE USED (${OVERRIDE_ENV_VAR}=1): keeping ${local.join(", ")} as a REAL npm dependency this run, instead of the usual local stand-in.`);
  }

  // #989 — a partial install must never hang a non-interactive run on the pinned CLI's own
  // per-file "already exists, overwrite?" prompt for the OTHER, non-protected already-vendored
  // files in the same closure (input.tsx etc. in the Combobox closure) — MEASURED (2026-09-23):
  // with stdin closed, the pinned CLI's prompt reads EOF and defaults to "N" (skip), which would
  // silently skip EVERY already-existing file, protected or not, defeating "installs every other
  // file". `-o/--overwrite` (MEASURED to suppress that prompt entirely, non-interactively, for
  // ANY already-existing file, protected included) is forced here ONLY for this partial-install
  // case, and never duplicated if the caller already passed it — the protected file(s) it would
  // also overwrite are backed up first and restored after, below, which is what makes forcing it
  // safe. The override path (`partialSkip` false when `override` is true) is UNCHANGED: it still
  // forwards the caller's own args verbatim, exactly as before #989 — a caller using the override
  // is trusted to pass `--overwrite`/`--yes` themselves if their run is non-interactive.
  const forcedArgv = partialSkip && !isDryRun && !argv.includes("--overwrite") && !argv.includes("-o")
    ? [...argv, "--overwrite"]
    : argv;

  // Snapshotted BEFORE the CLI runs, so the guard's own restore — never the CLI's behaviour — is
  // what proves the protected file(s) end up byte-identical (AC2). `null` (not an empty Map) when
  // there is nothing to protect this run, so the restore step below is skipped outright rather
  // than doing a zero-length no-op.
  const backups = partialSkip && !isDryRun ? backupProtectedFiles(blocked) : null;

  const code = spawnAdd(forcedArgv);

  if (backups) {
    restoreProtectedFiles(backups);
    const which = blocked.length === 1 ? "file" : "files";
    log(`[ui-add] SKIPPED ${blocked.length} protected ${which} — restored to its pre-install content, never silently overwritten: ${blocked.join(", ")}. Everything else in the payload installs normally. Set ${OVERRIDE_ENV_VAR}=1 to overwrite ${blocked.length === 1 ? "it" : "them"} instead.`);
  }

  // #969 fix round (L05B-S03) — a non-zero exit here is NOT "nothing was written". MEASURED
  // against the pinned shadcn 4.19.0 bundle (apps/web/node_modules/shadcn/dist/chunk-CDOZT3OO.js):
  // the add flow installs dependencies FIRST, then writes files (tailwind config, cn env vars,
  // fonts, the components themselves) — so a failure in that LATER, file-writing half still
  // leaves any local-classified dependency (cn) already sitting in package.json and the
  // lockfile. A dry run is the one exception: it writes nothing at all, dependencies included,
  // regardless of spawnAdd's own exit code, so there is nothing to strip either way.
  if (local.length > 0 && !override && !isDryRun) {
    const stripCode = stripLocalDependencies(local);
    if (stripCode !== 0) {
      const cause = code !== 0 ? ` (the pinned CLI itself also exited ${code})` : "";
      log(`[ui-add] WARNING: the pinned CLI added ${local.join(", ")} as a real dependency and this guard's own cleanup FAILED (exit ${stripCode})${cause} — remove ${local.length === 1 ? "it" : "them"} from package.json and the lockfile by hand before committing.`);
      return code !== 0 ? code : stripCode;
    }
    if (code !== 0) {
      log(`[ui-add] the pinned CLI exited ${code} (add failed) but had already installed ${local.join(", ")} as a real dependency before failing — it installs dependencies BEFORE it writes files. Dropped ${local.length === 1 ? "it" : "them"} the same way a successful run would. No manual revert needed.`);
    } else {
      log(`[ui-add] dropped ${local.length} bogus local dependency stand-in(s) the pinned CLI added: ${local.join(", ")} — this repo already provides ${local.length === 1 ? "it" : "them"} locally (lib/utils.ts), never as a package. No manual revert needed. Set ${OVERRIDE_ENV_VAR}=1 to take the real npm package instead.`);
    }
  }

  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
