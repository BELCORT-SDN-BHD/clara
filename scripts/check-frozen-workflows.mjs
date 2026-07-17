#!/usr/bin/env node
// Workflow freeze-lint — enforces the BINDING versioning policy from
// docs/architecture/ARCHITECTURE.md Appendix A (Slice-0 spike finding T6):
//
//   (a) a deployed workflow body is immutable once any run can be in flight;
//       every behavioural change ships as a NEW exported workflow (_v2, _v3…);
//   (b) enqueue sites always target the newest version; this CI freeze-lint
//       golden-hashes each frozen workflow and FORBIDS editing a frozen body;
//   (c) renaming/deleting an export with in-flight runs is forbidden
//       (workflowName derives from path+export — a rename strands parked runs).
//
// A workflow file opts into the freeze by carrying a `// @frozen` marker.
// `frozen-workflows.json` is the golden manifest (path -> sha256 of the
// LF-normalised file). The hash is computed on \n-normalised bytes so
// Windows/Linux CRLF differences never break it (see .gitattributes).
//
// Usage:
//   node scripts/check-frozen-workflows.mjs          # verify (CI gate)
//   node scripts/check-frozen-workflows.mjs --update # re-baseline hashes (deliberate)
//
// No dependencies — Node built-ins only.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(REPO_ROOT, "frozen-workflows.json");
const FROZEN_MARKER = "@frozen";

// Directories scanned for workflow modules. Extend as new runtime packages land.
const SCAN_ROOTS = ["packages/runtime/workflows"];

const UPDATE = process.argv.includes("--update");

/** sha256 of file content, line-endings normalised to \n. */
function hashFile(absPath) {
  const raw = readFileSync(absPath, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Recursively list *.ts files under a directory (skips node_modules/dist). */
function listTsFiles(absDir) {
  const out = [];
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const p = join(absDir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(p));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

function isFrozen(absPath) {
  return readFileSync(absPath, "utf8").includes(FROZEN_MARKER);
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, workflows: {} };
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  parsed.workflows ??= {};
  return parsed;
}

function main() {
  // Discover every frozen workflow file across the scan roots.
  const frozenRel = [];
  for (const root of SCAN_ROOTS) {
    const absRoot = join(REPO_ROOT, root);
    for (const abs of listTsFiles(absRoot)) {
      if (isFrozen(abs)) frozenRel.push(relative(REPO_ROOT, abs).split("\\").join("/"));
    }
  }
  frozenRel.sort();

  const manifest = loadManifest();

  if (UPDATE) {
    const workflows = {};
    for (const rel of frozenRel) {
      const prev = manifest.workflows[rel] ?? {};
      workflows[rel] = { sha256: hashFile(join(REPO_ROOT, rel)), note: prev.note ?? "" };
    }
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ version: manifest.version ?? 1, workflows }, null, 2) + "\n",
      "utf8",
    );
    console.log(`freeze-lint: re-baselined ${frozenRel.length} frozen workflow(s) into frozen-workflows.json`);
    return 0;
  }

  const violations = [];

  // 1. Every frozen file must be registered with a matching hash.
  for (const rel of frozenRel) {
    const entry = manifest.workflows[rel];
    if (!entry) {
      violations.push(`UNREGISTERED  ${rel}  (marked @frozen but absent from frozen-workflows.json; run --update to register)`);
      continue;
    }
    const actual = hashFile(join(REPO_ROOT, rel));
    if (actual !== entry.sha256) {
      violations.push(
        `BODY CHANGED  ${rel}\n    expected ${entry.sha256}\n    actual   ${actual}\n    -> a frozen workflow body must not change; ship the change as a new _vN export (Appendix A).`,
      );
    }
  }

  // 2. Every registered file must still exist AND still be marked @frozen.
  for (const rel of Object.keys(manifest.workflows)) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      violations.push(`MISSING       ${rel}  (registered frozen file deleted/renamed — strands in-flight runs; forbidden by policy (c)).`);
      continue;
    }
    if (!isFrozen(abs)) {
      violations.push(`UNFROZEN      ${rel}  (registered as frozen but the @frozen marker was removed — cannot silently un-freeze).`);
    }
  }

  if (violations.length > 0) {
    console.error("freeze-lint: FAIL — frozen workflow policy violated (ARCHITECTURE.md Appendix A):\n");
    for (const v of violations) console.error("  - " + v);
    console.error(`\n${violations.length} violation(s). If a change is intentional, add a NEW _vN workflow; only re-baseline with --update when adding a brand-new frozen workflow.`);
    return 1;
  }

  console.log(`freeze-lint: OK — ${frozenRel.length} frozen workflow(s) verified against frozen-workflows.json`);
  return 0;
}

process.exit(main());
