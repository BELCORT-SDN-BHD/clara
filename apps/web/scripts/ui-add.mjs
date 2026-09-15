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
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROTECTED_COMPONENTS_PATH = join(WEB_ROOT, "scripts", "protected-components.json");
const COMPONENTS_JSON_PATH = join(WEB_ROOT, "components.json");
const SHADCN_BIN = join(WEB_ROOT, "node_modules", ".bin", "shadcn");

/** THE ONE ENV VAR THAT LETS A DELIBERATE, REVIEWED OVERWRITE PROCEED — distinct
 *  from the underlying CLI's own `-o/--overwrite`, which this guard never lets
 *  reach the CLI on a protected file in the first place. */
export const OVERRIDE_ENV_VAR = "CLARA_UI_ADD_OVERWRITE";

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
 * @param {{targetPaths: readonly string[], allowlist: readonly string[], override: boolean}} input
 * @returns {{blocked: string[], allowed: boolean, overrideUsed: boolean}}
 *   `allowed` is true when the install may proceed — either nothing on the
 *   allowlist is touched, or it is and the override was given.
 */
export function checkGuard({ targetPaths, allowlist, override }) {
  const allowlistSet = new Set(allowlist);
  const blocked = [...new Set(targetPaths.filter((p) => allowlistSet.has(p)))].sort();
  const overrideUsed = blocked.length > 0 && override === true;
  return { blocked, allowed: blocked.length === 0 || override === true, overrideUsed };
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

/** The default, REAL-CLI-INVOKING installer — spawns the pinned local binary
 *  (never a floating `npx`-resolved one) with `add` plus every argument this
 *  script did not itself consume, inheriting stdio so the CLI's own prompts
 *  and output still work for a run the guard has cleared. */
function defaultSpawnAdd(args) {
  const result = spawnSync(SHADCN_BIN, ["add", ...args], { cwd: WEB_ROOT, stdio: "inherit" });
  return result.status ?? 1;
}

/**
 * THE WHOLE GUARDED FLOW, with its two effectful edges injectable — the shape
 * check-ui-add-guard.selftest.mjs needs to prove the decision logic with no
 * network and no real install.
 * @param {string[]} argv everything after the script name — component names and CLI flags alike
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   resolveFiles?: (names: string[], config: unknown) => Promise<ReadonlyArray<{path: string, type?: string, target?: string}>>,
 *   spawnAdd?: (args: string[]) => number,
 *   log?: (line: string) => void,
 * }} deps
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, env, deps = {}) {
  const resolveFiles = deps.resolveFiles ?? defaultResolveFiles;
  const spawnAdd = deps.spawnAdd ?? defaultSpawnAdd;
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
  const { blocked, allowed, overrideUsed } = checkGuard({ targetPaths, allowlist, override });

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

  return spawnAdd(argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
