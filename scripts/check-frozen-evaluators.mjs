#!/usr/bin/env node
// Evaluator freeze-lint — the CI/manifest half of the freeze family (Wave E lane ζ; design
// wave-e-design-reporting.md §4.2, "LANE OWNERSHIP OF THE FREEZE FAMILY").
//
// A SIBLING OF check-frozen-workflows.mjs, NOT A WIDENING OF IT, for a measured reason: that
// lint's SOURCE_EXT covers only JS/TS, so `.sql` migration bodies are outside its reach even
// though its SCAN_PATHSPEC already includes packages/db/migrations. This file reuses its durable
// half VERBATIM in behaviour — append-only vs origin/main, a removed entry or a rehash of a
// `deployed:true` entry is a hard REJECT, and the base-unavailable branch fails CLOSED under CI.
//
// THE DB HALF IS LANE δ's AND IS NOT DUPLICATED HERE: clara.evaluator_versions,
// clara.verify_evaluator_freeze(), and the packages/db/scripts/migrate.mjs hook that runs the
// verifier between every migration's body and its commit. That half catches a broken freeze AT
// APPLY TIME. This half catches the offending migration AT REVIEW TIME, before it reaches any
// database at all — which is the only moment at which the fix is still cheap.
//
// PLUS ONE SCAN THE WORKFLOW LINT HAS NO ANALOGUE FOR, AND IT IS MANDATORY (§4.2): every
// migration file NEW versus the base ref is scanned for a create-or-replace of an evaluator, and
// each hit must be accompanied by a new clara.evaluator_versions row IN THE SAME FILE. Recutting
// a live evaluator body without minting a new version row is exactly the change this rejects.
//
// HONESTY BOUNDARY, in packages/db/README.md's own idiom: this defends against a later migration
// and against application/agent/definer-bug mutation. It does NOT defend against a role that can
// CREATE OR REPLACE outside the migration runner.
//
// Usage:
//   node scripts/check-frozen-evaluators.mjs                  # verify (CI gate)
//   node scripts/check-frozen-evaluators.mjs --update         # re-baseline (local only)
//   node scripts/check-frozen-evaluators.mjs --lock-deployed  # ceremony: lock every entry
//
// No dependencies — Node built-ins only.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

// Every git call goes through execFileSync with an argv array — never a shell string — so a ref
// or a path can never be interpreted as a shell command.
function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"]).trim();
const MANIFEST_REL = "frozen-evaluators.json";
const MANIFEST_PATH = join(REPO_ROOT, MANIFEST_REL);
const MIGRATIONS_REL = "packages/db/migrations";

const RAW_BASE_REF = process.env.FREEZE_BASE_REF || "origin/main";
const BASE_REF = /^[A-Za-z0-9._/-]+$/.test(RAW_BASE_REF) ? RAW_BASE_REF : "origin/main";

const IN_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
const UPDATE = process.argv.includes("--update");
const LOCK_DEPLOYED = process.argv.includes("--lock-deployed");

// An evaluator, for this lint's purposes, is a clara.evaluate_* function defined in a migration.
// §4.2 names exactly that pattern. clara.assess_metric_cell_independent_v1 is an evaluator in the
// DB registry's sense but does not match this name shape; it is covered by the DB half (its
// closure hash is in clara.evaluator_versions) and is deliberately not claimed here — a lint that
// silently widened its own scope would be asserting coverage it was never reviewed for.
const EVALUATOR_DEF = /create\s+(?:or\s+replace\s+)?function\s+(clara\.evaluate_[a-z0-9_]+)\s*\(/gi;
const VERSION_ROW = /insert\s+into\s+clara\.evaluator_versions\b/i;

function hashText(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function migrationFiles(pathspec = MIGRATIONS_REL) {
  return git(["ls-files", "--cached", "--others", "--exclude-standard", "--", pathspec],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .split("\n").map((s) => s.trim()).filter((s) => s.endsWith(".sql"))
    .sort();
}

/**
 * The body text of one function definition: from `create ... function` to the closing
 * dollar-quote. Returns null when the definition is not dollar-quoted, which is itself reported
 * — a body this lint cannot delimit is a body it cannot freeze, and silently skipping it would
 * be the coverage gap the whole file exists to close.
 */
function extractBody(src, startIndex) {
  const asAt = src.indexOf(" as $", startIndex);
  const asAt2 = src.indexOf("\nas $", startIndex);
  const at = asAt === -1 ? asAt2 : (asAt2 === -1 ? asAt : Math.min(asAt, asAt2));
  if (at === -1) return null;
  const tagStart = src.indexOf("$", at);
  const tagEnd = src.indexOf("$", tagStart + 1);
  if (tagStart === -1 || tagEnd === -1) return null;
  const tag = src.slice(tagStart, tagEnd + 1);
  const close = src.indexOf(tag, tagEnd + 1);
  if (close === -1) return null;
  return src.slice(startIndex, close + tag.length);
}

/** Every evaluator defined in the working tree, keyed by its qualified name. */
function scanEvaluators(files, readFile) {
  const found = new Map(); // name -> { file, sha256, replaced }
  const undelimited = [];
  for (const rel of files) {
    const src = readFile(rel);
    if (src === null) continue;
    EVALUATOR_DEF.lastIndex = 0;
    let m;
    while ((m = EVALUATOR_DEF.exec(src))) {
      const name = m[1].toLowerCase();
      const body = extractBody(src, m.index);
      if (body === null) {
        undelimited.push(`${rel}: ${name}`);
        continue;
      }
      const replaced = /create\s+or\s+replace/i.test(m[0]);
      // A name defined twice in the tree is itself a finding: two definitions means the later
      // one silently wins at apply time.
      if (found.has(name)) {
        found.get(name).duplicates.push(rel);
      } else {
        found.set(name, { file: rel, sha256: hashText(body), replaced, duplicates: [] });
      }
    }
  }
  return { found, undelimited };
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, evaluators: {} };
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  parsed.evaluators ??= {};
  return parsed;
}

function readBaseFile(rel) {
  try {
    return git(["show", `${BASE_REF}:${rel}`], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function loadBaseManifest() {
  let refExists = false;
  try {
    git(["rev-parse", "--verify", "--quiet", `${BASE_REF}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    refExists = true;
  } catch {
    refExists = false;
  }
  if (!refExists) return { available: false, evaluators: {} };
  const raw = readBaseFile(MANIFEST_REL);
  if (raw === null) return { available: true, evaluators: {} };
  try {
    return { available: true, evaluators: JSON.parse(raw).evaluators ?? {} };
  } catch {
    return { available: true, evaluators: {} };
  }
}

/** Migration files that exist in the working tree but not at the base ref. */
function newMigrationsVsBase(files, baseAvailable) {
  if (!baseAvailable) return files; // fail closed: treat everything as new
  let listed = "";
  try {
    listed = git(["ls-tree", "-r", "--name-only", BASE_REF, "--", MIGRATIONS_REL], { cwd: REPO_ROOT });
  } catch {
    return files;
  }
  const base = new Set(listed.split("\n").map((s) => s.trim()).filter(Boolean));
  return files.filter((f) => !base.has(f));
}

function main() {
  const files = migrationFiles();
  const readFile = (rel) => {
    try {
      return readFileSync(join(REPO_ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const { found, undelimited } = scanEvaluators(files, readFile);
  const manifest = loadManifest();

  if (UPDATE) {
    if (IN_CI) {
      console.error(`evaluator-freeze-lint: --update is REFUSED under CI (CI/GITHUB_ACTIONS set). Re-baseline locally and commit ${MANIFEST_REL}; CI only verifies (append-only vs ${BASE_REF}).`);
      return 1;
    }
    const evaluators = {};
    for (const [name, e] of [...found].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const prev = manifest.evaluators[name] ?? {};
      evaluators[name] = { sha256: e.sha256, migration: e.file, note: prev.note ?? "" };
      if (prev.deployed === true) evaluators[name].deployed = true; // PRESERVED, never granted by --update
    }
    for (const [name, prev] of Object.entries(manifest.evaluators)) if (!evaluators[name]) evaluators[name] = prev;
    writeFileSync(MANIFEST_PATH, JSON.stringify({ version: manifest.version ?? 1, evaluators }, null, 2) + "\n", "utf8");
    console.log(`evaluator-freeze-lint: re-baselined ${found.size} evaluator(s) into ${MANIFEST_REL}`);
    return 0;
  }

  if (LOCK_DEPLOYED) {
    if (IN_CI) { console.error("evaluator-freeze-lint: --lock-deployed is REFUSED under CI — a deliberate local ceremony act."); return 1; }
    let locked = 0;
    for (const e of Object.values(manifest.evaluators)) if (e.deployed !== true) { e.deployed = true; locked += 1; }
    writeFileSync(MANIFEST_PATH, JSON.stringify({ version: manifest.version ?? 1, evaluators: manifest.evaluators }, null, 2) + "\n", "utf8");
    console.log(`evaluator-freeze-lint: locked ${locked} newly-deployed entr(ies).`);
    return 0;
  }

  const violations = [];

  for (const u of undelimited) {
    violations.push(`UNDELIMITED   ${u}  (this lint could not find the dollar-quoted body, so it cannot hash it; a body that cannot be frozen must not pass silently).`);
  }

  // 1. Every evaluator in the tree is registered with a matching hash.
  for (const [name, e] of found) {
    if (e.duplicates.length > 0) {
      violations.push(`DUPLICATE     ${name}  defined in ${e.file} and ${e.duplicates.join(", ")} — the later definition silently wins at apply time.`);
    }
    const entry = manifest.evaluators[name];
    if (!entry) {
      violations.push(`UNREGISTERED  ${name}  (${e.file}) absent from ${MANIFEST_REL}; run --update to register.`);
      continue;
    }
    if (entry.sha256 !== e.sha256) {
      violations.push(`BODY CHANGED  ${name}\n    expected ${entry.sha256}\n    actual   ${e.sha256}\n    -> an applied migration is immutable and a deployed evaluator body is frozen; ship the change as a new _vN evaluator with its own clara.evaluator_versions row.`);
    }
  }

  // 2. Every registered evaluator still exists.
  for (const name of Object.keys(manifest.evaluators)) {
    if (!found.has(name)) {
      violations.push(`MISSING       ${name}  (registered but no longer defined in ${MIGRATIONS_REL} — a frozen evaluator can never be removed or renamed).`);
    }
  }

  // 3. Append-only vs the base ref — THE durable protection (the workflow lint's §3, verbatim).
  const base = loadBaseManifest();
  for (const [name, entry] of Object.entries(base.evaluators)) {
    const cur = manifest.evaluators[name];
    if (!cur) {
      violations.push(`REMOVED-VS-BASE   ${name}  (frozen in ${BASE_REF} but dropped from the manifest — append-only: an entry can never be removed, even if the migration moved).`);
      continue;
    }
    if (entry.deployed === true && cur.deployed !== true) {
      violations.push(`UNLOCKED-VS-BASE  ${name}  (deployed:true on ${BASE_REF} but not now — the deploy-lock is monotonic; unlocking a live evaluator is exactly the bypass this blocks).`);
    }
    const hashLocked = entry.deployed === true || (entry.deployed === undefined && cur.deployed === true);
    if (cur.sha256 !== entry.sha256 && hashLocked) {
      violations.push(`REHASHED-VS-BASE  ${name}\n    base    ${entry.sha256}\n    current ${cur.sha256}\n    -> a DEPLOYED evaluator hash is immutable vs ${BASE_REF}; editing the body and its manifest hash together is exactly the bypass this blocks. Ship a new _vN.`);
    }
  }
  if (!base.available) {
    const msg = `base ref '${BASE_REF}' not available; the append-only-vs-base check cannot run`;
    if (IN_CI) {
      violations.push(`BASE-UNAVAILABLE  ${msg}. Under CI the base MUST resolve — ensure it is fetched before this gate. It does not fail open.`);
    } else {
      console.warn(`evaluator-freeze-lint: WARNING — ${msg}; skipped (local integrity checks still enforced). In CI this is a hard failure.`);
    }
  }

  // 4. THE SCAN THE WORKFLOW LINT HAS NO ANALOGUE FOR (§4.2). A migration NEW vs base that
  //    defines an evaluator must mint a clara.evaluator_versions row in the SAME file.
  for (const rel of newMigrationsVsBase(files, base.available)) {
    const src = readFile(rel);
    if (src === null) continue;
    EVALUATOR_DEF.lastIndex = 0;
    const hits = [...src.matchAll(EVALUATOR_DEF)];
    if (hits.length === 0) continue;
    if (!VERSION_ROW.test(src)) {
      const names = [...new Set(hits.map((h) => h[1].toLowerCase()))].join(", ");
      violations.push(`NO VERSION ROW    ${rel}  defines evaluator(s) ${names} but mints NO clara.evaluator_versions row. An evaluator that is recut or introduced without a version row is invisible to clara.verify_evaluator_freeze(), which compares only rows it knows about — so the freeze would pass by knowing nothing. Add the version row (undeployed; the ceremony flips it).`);
    }
    for (const h of hits) {
      const name = h[1].toLowerCase();
      const wasInBase = base.available && Object.prototype.hasOwnProperty.call(base.evaluators, name);
      if (wasInBase && /create\s+or\s+replace/i.test(h[0])) {
        violations.push(`RECUT             ${rel}  CREATE OR REPLACEs ${name}, which already exists on ${BASE_REF}. A behavioural change ships as a new _vN evaluator, never as a replacement of a referenced body (E-R14). If this is a deliberate, reviewed recut, it still needs a new version row and a new manifest entry.`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("evaluator-freeze-lint: FAIL — evaluator freeze policy violated (wave-e-design-reporting.md §4.2):\n");
    for (const v of violations) console.error("  - " + v);
    console.error(`\n${violations.length} violation(s). Ship a behavioural change as a NEW _vN evaluator with its own clara.evaluator_versions row; only re-baseline with --update (local) when ADDING one.`);
    return 1;
  }

  console.log(`evaluator-freeze-lint: OK — ${found.size} evaluator(s) verified against ${MANIFEST_REL} (append-only vs ${BASE_REF}${base.available ? "" : " [base unavailable]"}); every new migration that defines one mints its version row.`);
  return 0;
}

// Exported for the self-test; the CLI path is the default.
export { extractBody, scanEvaluators, hashText };

if (relative(REPO_ROOT, process.argv[1] ?? "").replace(/\\/g, "/") === "scripts/check-frozen-evaluators.mjs") {
  process.exit(main());
}
