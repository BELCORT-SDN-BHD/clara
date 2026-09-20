#!/usr/bin/env node
// Workflow freeze-lint — enforces the versioning policy in
// docs/ARCHITECTURE.md, "Durable runtime and events":
//
//   (a) a deployed workflow body is immutable once any run can be in flight;
//       every behavioural change ships as a NEW exported workflow (_v2, _v3…);
//   (b) enqueue sites always target the newest version; this CI freeze-lint
//       golden-hashes each frozen workflow AND every step/helper module it
//       imports, and FORBIDS editing a frozen body;
//   (c) renaming/deleting an export with in-flight runs is forbidden
//       (workflowName derives from path+export — a rename strands parked runs).
//
// WHY THIS IS THE REAL PROTECTION. Branch protection is free-tier-unenforced and
// there is no CODEOWNERS, so a PR can edit ANY file including this manifest. The
// only durable guard is a git comparison against the default branch: the frozen
// manifest is APPEND-ONLY vs `origin/main` — a changed hash, a changed path, or a
// removed/renamed frozen entry is a hard REJECT, never a silent pass. That defeats
// the two empirically-reproduced bypasses:
//   H1  moving a frozen file out of the old hard-coded scan root AND deleting its
//       manifest entry (previously reported "0 frozen verified", CI green). Now the
//       removed-vs-base entry is a hard REJECT regardless of where the file went.
//   H2  a "use workflow" file with no @frozen marker (previously invisible). Now
//       EVERY "use workflow" file under packages/ must be @frozen AND registered.
//
// Coverage is NOT an opt-in allowlist: we scan ALL tracked source under packages/
// (not one hard-coded directory), require every "use workflow" file to be frozen +
// registered, and freeze the transitive relative-import closure of each frozen
// workflow (so a "use step" body it imports can't change while the workflow hash
// stays green). The manifest maps path -> sha256 of the LF-normalised file.
//
// Slice-4 hardening (contract §4.9; the deferred finding-11 half):
//   (d) REGISTRY-VERSION MONOTONICITY — packages/runtime/workflows/registry.ts is
//       parsed STRUCTURALLY at HEAD and at the base ref: a workflow class may only
//       keep or INCREASE its version (closeExampleV1 -> closeExampleV2 ok; a
//       downgrade or a class REMOVED from the registry is a hard REJECT — a
//       removed class strands its non-terminal runs, policy (c)).
//   (e) ENQUEUE-SITE PROVENANCE — every call to the WDK enqueue API in
//       packages/runtime (tests + the registry itself excluded) must receive a
//       workflow reference whose IMPORT PROVENANCE traces to the registry.
//       Resolution is per-identifier, so importing the registry SOMEWHERE in the
//       file while handing start() a direct module import is still a REJECT.
//   (f) REGISTRY-VIEW-INTEGRITY (Gate G1 MUST D) — (e) trusts any registry.ts export
//       by name alone, so `workflowsByName` must be exactly `Object.freeze(workflows)`
//       and no other export may alias `workflows`. All three checks fail CLOSED.
//   (g) PROVENANCE-EXPORT SHAPE (#637) — `workflowBodies`/`workflowPins`, the roster the
//       boot line, /api/build-info and the rollback preflight read, must be `Object.freeze`
//       over a literal of STRING literals: inert data, never a second dispatch view.
//   (h) MANIFEST-KEY HYGIENE (C77.2, #637) — a manifest key under a TEST path is REFUSED.
//       The append-only rule makes every key permanent, so freezing a test file by accident
//       is unfixable by design; a test file ships in no image and no parked run resumes into it.
//   Self-test: node scripts/check-frozen-workflows.selftest.mjs (fixtures under
//   scripts/freeze-lint-fixtures/ — stored as .txt so eslint/tsc never parse them).
// Usage:
//   node scripts/check-frozen-workflows.mjs                  # verify (CI gate)
//   node scripts/check-frozen-workflows.mjs --update         # re-baseline (local only)
//   node scripts/check-frozen-workflows.mjs --lock-deployed  # ceremony: lock every entry
//   node scripts/check-frozen-workflows.mjs --compare-base <ref> # semantic additions-only proof
//   node scripts/check-frozen-workflows.mjs --print-closure   # report, per @frozen entry file,
//                                                             # the modules its own closure locks
//   node scripts/check-frozen-workflows.mjs --print-closure <module-path>
//                                                             # #849 — targeted: just the entry
//                                                             # files whose closure reaches
//                                                             # <module-path>
//   node scripts/check-frozen-workflows.mjs --retire <path> --ruling <ref>
//                                                             # #849 — move <path>'s current
//                                                             # manifest entry to `retired`,
//                                                             # citing <ref> as the ruling
//
// `--print-closure` (#815) is ADDITIVE REPORTING ONLY: it reads nothing but the tree, writes no
// manifest, changes no hash, and exits 0. It answers the question the flat manifest cannot —
// "which frozen version(s) lock this module?" — which is what an author needs BEFORE editing e.g.
// lib/work-trace.mjs (reached from claraWork.v3.impl.ts only through a DYNAMIC import) or
// lib/capability-registry.mjs (reached only TRANSITIVELY, through work-trace.mjs). Giving it a
// module path (#849) filters straight to that answer instead of grepping the full report by hand.
//
// `--retire <path> --ruling <ref>` (#849) is the write side of #810's manifest shape: it moves
// `path`'s current entry from `workflows` to `retired`, carrying its last frozen sha256 forward
// and citing the ruling, refusing (with no manifest write) unless the file is already gone from
// the tree and the path has a current entry. Like --update and --lock-deployed, it is REFUSED
// under CI — a deliberate local ceremony act, never a computed CI outcome. Before #849 the same
// move was a hand edit of frozen-workflows.json (#810's own three retirements).
//
// `--update` is REFUSED under CI/GITHUB_ACTIONS — a re-baseline is a deliberate
// local act, and CI's append-only-vs-base check is what actually gates a PR.
//
// RETIREMENT (#810, owner ruling 2026-09-15). During beta a SUPERSEDED body may leave the tree
// without a drain proof — runs parked on it are cancelled in the hosted cleanup first, because the
// boot-time stranded-body guard would otherwise refuse to start the world. The manifest stays
// append-only IN SPIRIT rather than in letter: the entry MOVES to a top-level `retired` record
// (path -> { sha256: the entry's LAST frozen hash, ruling: the citation }) instead of being
// deleted, so the ledger still answers "what was this file's last frozen hash, and under whose
// ruling did it go". `MISSING` and `REMOVED-VS-BASE` accept exactly such a record and nothing
// else; deploy-lock semantics are unchanged for every other entry. Versioning law (c) — an export
// WITH in-flight runs is never renamed or deleted — is unchanged: retirement presupposes none.
// The inverse is a finding of its own: a retired path whose FILE IS STILL IN THE TREE
// (RETIRED-PRESENT) would be @frozen, unregistered and unhashed — a silent un-freeze.
//
// DEPLOY-LOCK (the versioning law's actual boundary — docs/ARCHITECTURE.md §10 (#workflow-versioning-and-rollback)):
// `deployed: true` = shipped in a
// LIVE image — hash immutable vs base forever, flag MONOTONIC (an unlock is the
// bypass this blocks). A merged-but-UNDEPLOYED entry (the pre-ceremony window)
// may re-baseline via --update: immutability binds at DEPLOY (parked runs only
// exist after one). The ceremony runs --lock-deployed and commits (runbook).
// Flagless BASE entries defer to the CURRENT declaration once (the reviewed
// bootstrap stamp of the v24-live set).
//
// No dependencies — Node built-ins only.

import { createHash } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
// Pure sibling checkers let selftests inject simulated base/head source pairs.
import { checkManifestPaths, checkRegistryMonotonicity, checkRegistryViewIntegrity, checkEnqueueSites, isTestPath, REGISTRY_REL } from "./freeze-lint-checks.mjs";
import { runFrozenManifestCompareCli } from "./frozen-manifest-compare.mjs";
import { FROZEN_WORKFLOW_FAILURE_GUIDANCE } from "./frozen-workflow-guidance.mjs";
// The import-closure walk itself (#815) — shared with the selftest, which asserts the per-entry
// attribution against the real tree without executing this CLI.
import { FROZEN_MARKER, allImportsOf, computeFrozenClosures, formatClosureReport, scannedSourceFiles } from "./freeze-lint-closure.mjs";
// #849 — the `--retire` command's pure logic, shared with the selftest the same way.
// checkRetiredRecords (L05B-S04 fix round) is the same four-invariant verifier below's "2c.
// RETIREMENT INTEGRITY" section calls — extracted so a selftest can drive it directly.
import { retireFrozenEntry, checkRetiredRecords } from "./freeze-lint-retire.mjs";
const COMPARE_BASE_INDEX = process.argv.indexOf("--compare-base");
if (COMPARE_BASE_INDEX !== -1) process.exit(runFrozenManifestCompareCli(process.argv.slice(2)));
// All git calls go through execFileSync with an argv array — never a shell string —
// so a ref/path can never be interpreted as a shell command (no injection surface).
function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"]).trim();
const MANIFEST_REL = "frozen-workflows.json";
const MANIFEST_PATH = join(REPO_ROOT, MANIFEST_REL);
// A WDK workflow directive is a PROLOGUE STATEMENT — a bare string literal
// `"use workflow";` on its own — not a prose mention of the words in a comment.
// We strip comments first so a doc line like  // ... the `"use workflow"` directive
// (as in nitro.config.ts) is NOT mistaken for a real directive.
const DIRECTIVE_LINE = /^["']use workflow["']\s*;?$/;
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "")) // line comments
    .join("\n");
}
function hasWorkflowDirective(src) {
  return stripComments(src)
    .split("\n")
    .some((line) => DIRECTIVE_LINE.test(line.trim()));
}
// Defence-in-depth: reject a base ref that isn't a plain git ref name.
const RAW_BASE_REF = process.env.FREEZE_BASE_REF || "origin/main";
const BASE_REF = /^[A-Za-z0-9._/-]+$/.test(RAW_BASE_REF) ? RAW_BASE_REF : "origin/main";
const IN_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
const UPDATE = process.argv.includes("--update");
const LOCK_DEPLOYED = process.argv.includes("--lock-deployed");

/**
 * The optional-value-immediately-after-a-flag shape shared by --print-closure's module argument,
 * --retire's path argument and --ruling's value: the value is the very next argv token UNLESS
 * that token is itself another recognised flag (starts with `--`), in which case there is no
 * value — a next token starting with `--` is treated as "no value given", never swallowed as this
 * flag's own text. One helper, not three near-identical inline copies (L05-STD-02, standards fix
 * round): the three had already started to drift — RETIRE_RULING previously skipped this exact
 * guard, so `--ruling` followed by an unrelated flag was accepted as the literal ruling text
 * instead of refused as a missing ruling.
 * @param {readonly string[]} argv
 * @param {string} flag
 * @returns {string|null}
 */
function optionalArgAfterFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : null;
}

// #815 — parsed HERE, after the --compare-base early exit above, so that path is undisturbed.
const PRINT_CLOSURE_INDEX = process.argv.indexOf("--print-closure");
const PRINT_CLOSURE = PRINT_CLOSURE_INDEX !== -1;
// #849 — an optional module path immediately after --print-closure targets the report to just
// the entries that reach it; absent (or the next token is itself a flag), the report is the full,
// unfiltered per-entry breakdown #815 always printed.
const PRINT_CLOSURE_MODULE = PRINT_CLOSURE ? optionalArgAfterFlag(process.argv, "--print-closure") : null;
// #849 — `--retire <path> --ruling <ref>`: moves one currently-registered entry to the `retired`
// record. Parsed here, alongside --print-closure, for the same reason (after --compare-base).
// L05-S02 (fix round) — RETIRE_FLAG is tracked separately from RETIRE_PATH so a bare `--retire`
// (no path token following it, or the very next token belongs to another flag) is a REFUSAL
// rather than a silent, un-flagged fall-through to an ordinary verify: every other malformed
// invocation of this command already fails loud, and this one must too.
const RETIRE_INDEX = process.argv.indexOf("--retire");
const RETIRE_FLAG = RETIRE_INDEX !== -1;
const RETIRE_PATH = RETIRE_FLAG ? optionalArgAfterFlag(process.argv, "--retire") : null;
const RETIRE_RULING = optionalArgAfterFlag(process.argv, "--ruling");

/** sha256 of file content, line-endings normalised to \n. */
function hashText(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}
function hashFile(absPath) {
  return hashText(readFileSync(absPath, "utf8"));
}
/** Names of the workspace packages (packages/* + apps/*) — first-party specifiers. */
function workspacePackageNames() {
  const names = new Set();
  let listed = "";
  try {
    listed = git(["ls-files", "--", "packages/*/package.json", "apps/*/package.json"], { cwd: REPO_ROOT });
  } catch {
    return names;
  }
  for (const rel of listed.split("\n").map((s) => s.trim()).filter(Boolean)) {
    try {
      const name = JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")).name;
      if (name) names.add(name);
    } catch {
      /* a package.json without a name is not a specifier target */
    }
  }
  return names;
}

/**
 * A non-relative specifier that points at FIRST-PARTY source (a workspace package
 * or a path-alias / subpath-import). These escape the relative-import closure: the
 * freeze-lint can't follow them, so a frozen workflow could change behaviour
 * through one while its hash stays green (finding 11). Bare third-party packages
 * (node_modules) are legitimately outside the freeze surface and are NOT escapes.
 */
function isFirstPartyEscape(spec, wsNames) {
  if (spec.startsWith(".")) return false; // relative — the closure already follows it
  if (spec.startsWith("~") || spec.startsWith("#") || spec.startsWith("@/")) return true; // path alias / subpath-import
  for (const name of wsNames) {
    if (spec === name || spec.startsWith(name + "/")) return true; // workspace package (or its subpath)
  }
  return false;
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, workflows: {}, retired: {} };
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  parsed.workflows ??= {};
  parsed.retired ??= {}; // #810 — absent on a manifest that has retired nothing.
  return parsed;
}

/** Raw content of a repo-relative file at the base ref, or null if absent there. */
function readBaseFile(rel) {
  try {
    return git(["show", `${BASE_REF}:${rel}`], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * The frozen manifest as it exists on the base ref (default origin/main).
 * If the ref or the file is absent, the manifest is being introduced for the
 * first time — everything in the working tree is a permitted new (append) entry.
 * Returns { available, workflows }.
 */
function loadBaseManifest() {
  let refExists = false;
  try {
    git(["rev-parse", "--verify", "--quiet", `${BASE_REF}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    refExists = true;
  } catch {
    refExists = false;
  }
  if (!refExists) return { available: false, workflows: {}, retired: {} };
  const raw = readBaseFile(MANIFEST_REL);
  if (raw === null) {
    // Ref exists but manifest not present on it -> first introduction.
    return { available: true, workflows: {}, retired: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    return { available: true, workflows: parsed.workflows ?? {}, retired: parsed.retired ?? {} };
  } catch {
    return { available: true, workflows: {}, retired: {} };
  }
}

/** #810 — a rewrite of the manifest carries the `retired` record through, and omits it when empty. */
function withRetired(doc, retired) {
  return Object.keys(retired ?? {}).length > 0 ? { ...doc, retired } : doc;
}

function main() {
  const files = scannedSourceFiles(REPO_ROOT);
  const closure = computeFrozenClosures(REPO_ROOT, files);
  const { frozenRel } = closure;
  if (PRINT_CLOSURE) {
    console.log(formatClosureReport(closure, PRINT_CLOSURE_MODULE));
    return 0;
  }
  const workflowFiles = files.filter((rel) => {
    try {
      return hasWorkflowDirective(readFileSync(join(REPO_ROOT, rel), "utf8"));
    } catch {
      return false;
    }
  });

  const manifest = loadManifest();

  if (RETIRE_FLAG && !RETIRE_PATH) {
    // L05-S02 (fix round) — `--retire` with no path argument (or with another flag immediately
    // after it) used to fall through the `if (RETIRE_PATH)` gate below into an ordinary verify,
    // reporting success (exit 0) with no hint the command was ignored. Fail loud instead, the
    // same fail-closed shape every other malformed `--retire` invocation already uses.
    console.error("freeze-lint: --retire requires a path argument (usage: --retire <path> --ruling <ref>); no manifest write.");
    return 1;
  }

  if (RETIRE_PATH) {
    // A deliberate local ceremony act, exactly like --update and --lock-deployed: it writes the
    // manifest by hand-authorised ruling, not by CI computation.
    if (IN_CI) {
      console.error("freeze-lint: --retire is REFUSED under CI — a deliberate local ceremony act, same as --update and --lock-deployed.");
      return 1;
    }
    const result = retireFrozenEntry(manifest, RETIRE_PATH, RETIRE_RULING, existsSync(join(REPO_ROOT, RETIRE_PATH)));
    if (!result.ok) {
      console.error(`freeze-lint: ${result.error}`);
      return 1;
    }
    // result.manifest.retired is never empty here (retireFrozenEntry just added to it), so it is
    // always written — unlike withRetired's "omit when empty" default for the other CLI paths.
    writeFileSync(MANIFEST_PATH, JSON.stringify(result.manifest, null, 2) + "\n", "utf8");
    console.log(`freeze-lint: ${result.message}`);
    return 0;
  }

  if (UPDATE) {
    if (IN_CI) {
      console.error(
        "freeze-lint: --update is REFUSED under CI (CI/GITHUB_ACTIONS set). Re-baseline locally and commit the manifest; CI only verifies (append-only vs " +
          BASE_REF +
          ").",
      );
      return 1;
    }
    const workflows = {};
    for (const rel of frozenRel) {
      const prev = manifest.workflows[rel] ?? {};
      workflows[rel] = { sha256: hashFile(join(REPO_ROOT, rel)), note: prev.note ?? "" };
      if (prev.deployed === true) workflows[rel].deployed = true; // PRESERVED, never granted, by --update
    }
    // Entries dropped from scope stay in the manifest (append-only) — carry them.
    for (const [rel, prev] of Object.entries(manifest.workflows)) if (!workflows[rel]) workflows[rel] = prev;
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(withRetired({ version: manifest.version ?? 1, workflows }, manifest.retired), null, 2) + "\n",
      "utf8",
    );
    console.log(
      `freeze-lint: re-baselined ${frozenRel.length} frozen file(s) (workflows + import-closure) into ${MANIFEST_REL}`,
    );
    return 0;
  }

  if (LOCK_DEPLOYED) {
    // The ceremony's post-deploy act: everything now live becomes immutable forever.
    if (IN_CI) { console.error("freeze-lint: --lock-deployed is REFUSED under CI — a deliberate local ceremony act."); return 1; }
    let locked = 0;
    for (const e of Object.values(manifest.workflows)) if (e.deployed !== true) { e.deployed = true; locked += 1; }
    writeFileSync(MANIFEST_PATH, JSON.stringify(withRetired({ version: manifest.version ?? 1, workflows: manifest.workflows }, manifest.retired), null, 2) + "\n", "utf8");
    console.log(`freeze-lint: locked ${locked} newly-deployed entr(ies); every manifest entry is now deploy-locked.`);
    return 0;
  }

  const violations = [];

  // H2 — freezing is mandatory, not opt-in: every "use workflow" file must be
  // @frozen AND registered.
  for (const rel of workflowFiles) {
    if (manifest.retired[rel]) continue; // #810 — reported once, as RETIRED-PRESENT below.
    let src = "";
    try {
      src = readFileSync(join(REPO_ROOT, rel), "utf8");
    } catch {
      /* handled below */
    }
    if (!src.includes(FROZEN_MARKER)) {
      violations.push(
        `UNFROZEN WORKFLOW  ${rel}  (contains "use workflow" but no @frozen marker — freezing is mandatory, not opt-in; policy (a)).`,
      );
    }
    if (!manifest.workflows[rel]) {
      violations.push(
        `UNREGISTERED WORKFLOW  ${rel}  (workflow module absent from ${MANIFEST_REL}; run --update to register).`,
      );
    }
  }

  // 1. Every frozen file (marked + import-closure) must be registered with a matching hash.
  for (const rel of frozenRel) {
    if (manifest.retired[rel]) continue; // #810 — reported once, as RETIRED-PRESENT below.
    const entry = manifest.workflows[rel];
    if (!entry) {
      violations.push(
        `UNREGISTERED  ${rel}  (marked @frozen or imported by a frozen workflow, but absent from ${MANIFEST_REL}; run --update to register).`,
      );
      continue;
    }
    const actual = hashFile(join(REPO_ROOT, rel));
    if (actual !== entry.sha256) {
      violations.push(
        `BODY CHANGED  ${rel}\n    expected ${entry.sha256}\n    actual   ${actual}\n    -> a frozen workflow/step body must not change; ship the change as a new _vN export (docs/ARCHITECTURE.md §10 (#workflow-versioning-and-rollback)).`,
      );
    }
  }

  // 2. Every registered file must still exist AND still be frozen-reachable.
  for (const rel of Object.keys(manifest.workflows)) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      violations.push(
        `MISSING       ${rel}  (registered frozen file deleted/renamed — strands in-flight runs; forbidden by policy (c)).`,
      );
      continue;
    }
    if (!frozenRel.includes(rel)) {
      violations.push(
        `ORPHANED      ${rel}  (registered but no longer @frozen nor inside a frozen workflow's import-closure — cannot silently un-freeze).`,
      );
    }
  }

  // 2c. RETIREMENT INTEGRITY (#810). The `retired` record is the ONLY thing that makes a removal
  // legal, so it carries its own rules rather than being trusted by existing. A retired file that
  // is still in the tree is the inverse of a MISSING and just as much a finding: it would be
  // @frozen, unregistered and unhashed — a silent un-freeze. A path in BOTH ledgers is a
  // contradiction the append-only comparison below would read either way, so it fails closed here.
  // The four rules themselves live in checkRetiredRecords (freeze-lint-retire.mjs, L05B-S04 fix
  // round) so a selftest can drive them directly, without spawning this whole CLI.
  violations.push(...checkRetiredRecords(manifest, (rel) => existsSync(join(REPO_ROOT, rel))));

  // 2a. MANIFEST-KEY HYGIENE (C77.2, #637). Checks 1 and 2 both ask questions about the
  // FILES the manifest points at; this asks the one question about the KEYS themselves. It is
  // separate from `isTestPath`'s long-standing use in the enqueue-site scan below (an
  // exclusion there, a refusal here) and runs on the manifest as loaded, so a key whose file
  // does not even exist is still reported by its own rule rather than only as MISSING.
  violations.push(...checkManifestPaths([...Object.keys(manifest.workflows), ...Object.keys(manifest.retired)], MANIFEST_REL));

  // 2b. IMPORT-ESCAPE (finding 11): every frozen file must reach its first-party
  // code through RELATIVE imports so the closure can follow + hash it. A
  // workspace-package or path-alias specifier points at first-party source that
  // escapes the closure — its body could change while the frozen hash stays green.
  // Reject it (import relatively instead). Bare third-party packages are fine.
  // (The other finding-11 half — registry-version monotonicity + enqueue-site
  // provenance — is enforced below as checks 4 + 5; see freeze-lint-checks.mjs.)
  const wsNames = workspacePackageNames();
  for (const rel of frozenRel) {
    let escapes = [];
    try {
      escapes = allImportsOf(join(REPO_ROOT, rel)).filter((s) => isFirstPartyEscape(s, wsNames));
    } catch {
      /* unreadable file is reported by the checks above */
    }
    for (const spec of escapes) {
      violations.push(
        `IMPORT-ESCAPE ${rel} imports first-party module "${spec}" via a workspace/path-alias specifier — it escapes the frozen import-closure (its body is not hash-locked). Import it RELATIVELY so the freeze-lint freezes it too.`,
      );
    }
  }

  // 3. Append-only vs the base ref — THE durable protection, refined by the
  //    DEPLOY-LOCK (header): hash-immutability binds deployed entries; the flag
  //    is monotonic; flagless base entries defer to the current declaration once.
  const base = loadBaseManifest();
  for (const [rel, entry] of Object.entries(base.workflows)) {
    const cur = manifest.workflows[rel];
    if (!cur) {
      // #810 — the ONE permitted absence: a `retired` record quoting this entry's LAST frozen
      // hash. Its own shape (hash present, ruling cited, file gone) is checked at 2c above; here
      // only the CONTINUITY with the base entry is, which 2c cannot see.
      const retired = manifest.retired[rel];
      if (!retired) {
        violations.push(
          `REMOVED-VS-BASE   ${rel}  (frozen in ${BASE_REF} but dropped from the manifest — append-only: a frozen entry can never be removed or renamed, even if the file moved out of scope; a beta-era retirement moves it to the \`retired\` record instead, #810).`,
        );
      } else if (retired.sha256 !== entry.sha256) {
        violations.push(
          `RETIRED-HASH-MISMATCH  ${rel}\n    base    ${entry.sha256}\n    retired ${retired.sha256}\n    -> a retired record must quote the entry's LAST frozen hash; it records history, it never rewrites it.`,
        );
      }
      continue;
    }
    if (entry.deployed === true && cur.deployed !== true)
      violations.push(`UNLOCKED-VS-BASE  ${rel}  (deployed:true on ${BASE_REF} but not on the current manifest — the deploy-lock is monotonic; unlocking a live workflow is exactly the bypass this blocks).`);
    const hashLocked = entry.deployed === true || (entry.deployed === undefined && cur.deployed === true);
    if (cur.sha256 !== entry.sha256 && hashLocked)
      violations.push(`REHASHED-VS-BASE  ${rel}\n    base   ${entry.sha256}\n    current ${cur.sha256}\n    -> a DEPLOYED frozen hash is immutable vs ${BASE_REF}; editing a frozen body + its manifest hash together is exactly the bypass this blocks. Ship a new _vN.`);
  }
  for (const [rel, record] of Object.entries(base.retired ?? {})) {
    const cur = manifest.retired[rel];
    if (!cur) {
      violations.push(
        `UNRETIRED-VS-BASE ${rel}  (retired in ${BASE_REF} but absent from the current \`retired\` record — a retirement is append-only, exactly like the entry it replaced).`,
      );
    } else if (cur.sha256 !== record.sha256) {
      violations.push(`RETIRED-REHASHED-VS-BASE ${rel}  (retired last hash moved vs ${BASE_REF}).`);
    }
  }

  if (!base.available) {
    // The append-only-vs-base comparison is THE durable protection. On an
    // established repo origin/main always resolves (ci.yml fetches it, failing
    // closed if it exists but can't be fetched). So an unavailable base UNDER CI
    // means this gate is not actually running — fail CLOSED (finding 2) rather
    // than silently skip it. Locally (not CI) we warn: a fresh clone legitimately
    // may not have the remote-tracking ref yet.
    const msg = `base ref '${BASE_REF}' not available; the append-only-vs-base check cannot run`;
    if (IN_CI) {
      violations.push(
        `BASE-UNAVAILABLE  ${msg}. Under CI the base MUST resolve (an established repo always has origin/main) — ensure it is fetched before freeze-lint. This gate does not fail open.`,
      );
    } else {
      console.warn(
        `freeze-lint: WARNING — ${msg}; skipped (local integrity checks still enforced). In CI this is a hard failure.`,
      );
    }
  }

  // 4. REGISTRY-VERSION MONOTONICITY (capability (d), contract §4.9): parse the
  // registry structurally at HEAD and at the base ref — a class may only keep
  // or INCREASE its version; a class removed vs base is a hard REJECT. When the
  // base ref is unavailable, only HEAD-shape validation runs (under CI the
  // BASE-UNAVAILABLE violation above already fails the build — no fail-open).
  const headRegistryAbs = join(REPO_ROOT, REGISTRY_REL);
  const headRegistrySrc = existsSync(headRegistryAbs) ? readFileSync(headRegistryAbs, "utf8") : null;
  const baseRegistrySrc = base.available ? readBaseFile(REGISTRY_REL) : null;
  violations.push(...checkRegistryMonotonicity(baseRegistrySrc, headRegistrySrc, BASE_REF));
  violations.push(...checkRegistryViewIntegrity(headRegistrySrc)); // 4b. capability (f), MUST D
  // 5. ENQUEUE-SITE PROVENANCE (capability (e), contract §4.9): every WDK
  // enqueue call in packages/runtime (tests + the registry itself excluded)
  // must receive a workflow reference imported from workflows/registry.ts.
  const enqueueEntries = [];
  for (const rel of files) {
    if (!rel.startsWith("packages/runtime/") || rel === REGISTRY_REL || isTestPath(rel)) continue;
    try {
      enqueueEntries.push({ rel, src: readFileSync(join(REPO_ROOT, rel), "utf8") });
    } catch {
      /* an unreadable frozen file is already reported above; a non-frozen one has no enqueue sites to read */
    }
  }
  violations.push(...checkEnqueueSites(enqueueEntries));

  if (violations.length > 0) {
    console.error("freeze-lint: FAIL — frozen workflow policy violated (docs/ARCHITECTURE.md §10 (#workflow-versioning-and-rollback)):\n");
    for (const v of violations) console.error("  - " + v);
    console.error(
      `\n${violations.length} violation(s). ${FROZEN_WORKFLOW_FAILURE_GUIDANCE}`,
    );
    return 1;
  }

  const retiredCount = Object.keys(manifest.retired).length;
  console.log(
    `freeze-lint: OK — ${frozenRel.length} frozen file(s) verified against ${MANIFEST_REL} (append-only vs ${BASE_REF}${base.available ? "" : " [base unavailable]"}); ${workflowFiles.length} "use workflow" module(s) all frozen+registered${retiredCount > 0 ? `; ${retiredCount} retired entr(ies) recorded` : ""}.`,
  );
  return 0;
}

process.exit(main());
