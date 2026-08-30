#!/usr/bin/env node
// Workflow freeze-lint — enforces the BINDING versioning policy from
// docs/ARCHITECTURE.md Appendix A (Slice-0 spike finding T6):
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
//   Self-test: node scripts/check-frozen-workflows.selftest.mjs (fixtures under
//   scripts/freeze-lint-fixtures/ — stored as .txt so eslint/tsc never parse them).
// Usage:
//   node scripts/check-frozen-workflows.mjs                  # verify (CI gate)
//   node scripts/check-frozen-workflows.mjs --update         # re-baseline (local only)
//   node scripts/check-frozen-workflows.mjs --lock-deployed  # ceremony: lock every entry
//
// `--update` is REFUSED under CI/GITHUB_ACTIONS — a re-baseline is a deliberate
// local act, and CI's append-only-vs-base check is what actually gates a PR.
//
// DEPLOY-LOCK (Appendix A's actual boundary): `deployed: true` = shipped in a
// LIVE image — hash immutable vs base forever, flag MONOTONIC (an unlock is the
// bypass this blocks). A merged-but-UNDEPLOYED entry (the pre-ceremony window)
// may re-baseline via --update: immutability binds at DEPLOY (parked runs only
// exist after one). The ceremony runs --lock-deployed and commits (runbook).
// Flagless BASE entries defer to the CURRENT declaration once (the reviewed
// bootstrap stamp of the v24-live set).
//
// No dependencies — Node built-ins only.

import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
// The (d)+(e) checkers are PURE (source strings in, violations out) and live in
// a sibling module so the self-test can inject simulated base/head pairs.
import { checkRegistryMonotonicity, checkRegistryViewIntegrity, checkEnqueueSites, isTestPath, REGISTRY_REL } from "./freeze-lint-checks.mjs";

// All git calls go through execFileSync with an argv array — never a shell string —
// so a ref/path can never be interpreted as a shell command (no injection surface).
function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"]).trim();
const MANIFEST_REL = "frozen-workflows.json";
const MANIFEST_PATH = join(REPO_ROOT, MANIFEST_REL);
const FROZEN_MARKER = "@frozen";

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

// Coverage scope: ALL tracked source under packages/ (spike/ is a throwaway and is
// intentionally out of scope). Not a narrow per-directory allowlist.
const SCAN_PATHSPEC = "packages";
const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"]);

const IN_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
const UPDATE = process.argv.includes("--update");
const LOCK_DEPLOYED = process.argv.includes("--lock-deployed");

/** sha256 of file content, line-endings normalised to \n. */
function hashText(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}
function hashFile(absPath) {
  return hashText(readFileSync(absPath, "utf8"));
}
function toRel(abs) {
  return relative(REPO_ROOT, abs).split("\\").join("/");
}

/** Tracked + new-but-not-ignored source files under packages/ (mirrors check-leaks). */
function scannedSourceFiles() {
  const out = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", SCAN_PATHSPEC], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(out)].filter((rel) => SOURCE_EXT.has(extname(rel).toLowerCase()));
}

/** Resolve a relative import specifier to an on-disk source file (.js -> .ts, etc.). */
function resolveRelImport(fromAbs, spec) {
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
function allImportsOf(abs) {
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
function relativeImportsOf(abs) {
  return allImportsOf(abs).filter((spec) => spec.startsWith("."));
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

/** Transitive relative-import closure (includes the start file itself). */
function importClosure(startAbs) {
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

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, workflows: {} };
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  parsed.workflows ??= {};
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
  if (!refExists) return { available: false, workflows: {} };
  const raw = readBaseFile(MANIFEST_REL);
  if (raw === null) {
    // Ref exists but manifest not present on it -> first introduction.
    return { available: true, workflows: {} };
  }
  try {
    return { available: true, workflows: JSON.parse(raw).workflows ?? {} };
  } catch {
    return { available: true, workflows: {} };
  }
}

/** Compute the set (rel paths) that MUST be frozen: every @frozen file + its import closure. */
function computeFrozenSet(files) {
  const frozenMarked = files.filter((rel) => {
    try {
      return readFileSync(join(REPO_ROOT, rel), "utf8").includes(FROZEN_MARKER);
    } catch {
      return false;
    }
  });
  const frozenRelSet = new Set();
  for (const rel of frozenMarked) {
    for (const abs of importClosure(join(REPO_ROOT, rel))) {
      const r = toRel(abs);
      if (r.startsWith("packages/")) frozenRelSet.add(r); // closure should not escape packages/
    }
  }
  return { frozenMarked, frozenRel: [...frozenRelSet].sort() };
}

function main() {
  const files = scannedSourceFiles();
  const { frozenRel } = computeFrozenSet(files);
  const workflowFiles = files.filter((rel) => {
    try {
      return hasWorkflowDirective(readFileSync(join(REPO_ROOT, rel), "utf8"));
    } catch {
      return false;
    }
  });

  const manifest = loadManifest();

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
      JSON.stringify({ version: manifest.version ?? 1, workflows }, null, 2) + "\n",
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
    writeFileSync(MANIFEST_PATH, JSON.stringify({ version: manifest.version ?? 1, workflows: manifest.workflows }, null, 2) + "\n", "utf8");
    console.log(`freeze-lint: locked ${locked} newly-deployed entr(ies); every manifest entry is now deploy-locked.`);
    return 0;
  }

  const violations = [];

  // H2 — freezing is mandatory, not opt-in: every "use workflow" file must be
  // @frozen AND registered.
  for (const rel of workflowFiles) {
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
        `BODY CHANGED  ${rel}\n    expected ${entry.sha256}\n    actual   ${actual}\n    -> a frozen workflow/step body must not change; ship the change as a new _vN export (Appendix A).`,
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
      violations.push(
        `REMOVED-VS-BASE   ${rel}  (frozen in ${BASE_REF} but dropped from the manifest — append-only: a frozen entry can never be removed or renamed, even if the file moved out of scope).`,
      );
      continue;
    }
    if (entry.deployed === true && cur.deployed !== true)
      violations.push(`UNLOCKED-VS-BASE  ${rel}  (deployed:true on ${BASE_REF} but not on the current manifest — the deploy-lock is monotonic; unlocking a live workflow is exactly the bypass this blocks).`);
    const hashLocked = entry.deployed === true || (entry.deployed === undefined && cur.deployed === true);
    if (cur.sha256 !== entry.sha256 && hashLocked)
      violations.push(`REHASHED-VS-BASE  ${rel}\n    base   ${entry.sha256}\n    current ${cur.sha256}\n    -> a DEPLOYED frozen hash is immutable vs ${BASE_REF}; editing a frozen body + its manifest hash together is exactly the bypass this blocks. Ship a new _vN.`);
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
    console.error("freeze-lint: FAIL — frozen workflow policy violated (ARCHITECTURE.md Appendix A):\n");
    for (const v of violations) console.error("  - " + v);
    console.error(
      `\n${violations.length} violation(s). Ship a behavioural change as a NEW _vN workflow; re-baseline with --update (local) when ADDING any new frozen file (a new class or a new _vN), then prove the manifest diff is additions-only — you can never mutate or remove an existing frozen entry.`,
    );
    return 1;
  }

  console.log(
    `freeze-lint: OK — ${frozenRel.length} frozen file(s) verified against ${MANIFEST_REL} (append-only vs ${BASE_REF}${base.available ? "" : " [base unavailable]"}); ${workflowFiles.length} "use workflow" module(s) all frozen+registered.`,
  );
  return 0;
}

process.exit(main());
