#!/usr/bin/env node
// Self-test: A NEW `_vN` OF AN EXISTING CLASS REQUIRES `pnpm freeze:update`.
//
// WHY THIS FILE EXISTS. Before PR #454, `.claude/rules/runtime-workflows.md` step 3 said that a
// new `_vN` "should pass freeze-lint on its own" and that `--update` was only for a brand-new
// frozen CLASS. Measured against the shipping checker (P6-1, and independently by the Codex
// review of #454), that was false: H2 requires every `"use workflow"` module to be @frozen AND
// registered, and every file inside a frozen import closure to be registered, so five new v16
// paths came up UNREGISTERED until the manifest gained them. PR #454 trues the rule alongside
// this cell, which keeps the corrected statement honest so the next reader does not have to
// re-measure it.
//
// It is a SEPARATE FILE from check-frozen-workflows.selftest.mjs on purpose: that one advertises
// "runs WITHOUT a git base — Node built-ins only" and drives the pure checkers with string
// fixtures. This property is not pure — registration is decided by the script walking a real
// tree against a real base ref — so it builds a THROWAWAY GIT REPO and runs the real
// `check-frozen-workflows.mjs` inside it, four times, asserting the whole sequence:
//
//   1. fail BEFORE   — a new frozen path is UNREGISTERED and the gate exits non-zero
//   2. pass AFTER    — `--update` registers it and the gate exits zero
//   3. additions-only — the manifest gained exactly the new paths, dropped none
//   4. prior hashes UNCHANGED — and no `deployed` flag was granted or revoked by --update
//
// (4) is the one that matters most: it is the real content of "you did not edit a frozen body",
// and it is what a reviewer should check after any `--update`.
//
//   node scripts/check-frozen-workflows.registration.selftest.mjs   # exit 0 green, 1 red

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log("  PASS  " + label);
  } catch (e) {
    failures++;
    console.error("  FAIL  " + label + "\n        " + String(e.message).split("\n").join("\n        "));
  }
};

const git = (cwd, args) =>
  execFileSync("git", ["-c", "user.email=selftest@example.invalid", "-c", "user.name=selftest", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const root = mkdtempSync(join(tmpdir(), "freeze-registration-"));
try {
  // --- a throwaway repo shaped like this one --------------------------------------------------
  // The scripts are NOT copied in: the REAL `scripts/check-frozen-workflows.mjs` is executed in
  // place with `cwd` set to this repo, so what is under test is the shipping program rather than
  // a copy of it. (It also has to be that way — `freeze-lint-checks.mjs` imports `typescript`,
  // which no temp directory outside the workspace can resolve. Node resolves a bare import from
  // the IMPORTER's directory, while the script takes its repo root from `git rev-parse` in the
  // CWD, so the two halves land exactly where this test needs them.)
  mkdirSync(join(root, "packages", "runtime", "workflows"), { recursive: true });

  // ONE already-registered, already-DEPLOYED frozen workflow — the prior state a later `_vN`
  // must not disturb. `deployed: true` is the flag whose survival (3)/(4) actually test.
  const v1 = 'export async function demo_v1() {\n  "use workflow";\n  return 1;\n}\n';
  writeFileSync(join(root, "packages", "runtime", "workflows", "demo.v1.ts"), "// @frozen\n" + v1, "utf8");
  writeFileSync(
    join(root, "packages", "runtime", "workflows", "registry.ts"),
    'import { demo_v1 } from "./demo.v1.js";\nexport const workflows = {\n  demo: demo_v1,\n} as const;\nexport { demo_v1 };\n',
    "utf8",
  );
  const sha = execFileSync(process.execPath, ["-e", "const{createHash}=require('node:crypto');const{readFileSync}=require('node:fs');process.stdout.write(createHash('sha256').update(readFileSync(process.argv[1],'utf8').replace(/\\r\\n/g,'\\n')).digest('hex'))", join(root, "packages", "runtime", "workflows", "demo.v1.ts")], { encoding: "utf8" });
  writeFileSync(
    join(root, "frozen-workflows.json"),
    JSON.stringify({ version: 1, workflows: { "packages/runtime/workflows/demo.v1.ts": { sha256: sha, note: "prior", deployed: true } } }, null, 2) + "\n",
    "utf8",
  );
  git(root, ["init", "-q"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  git(root, ["branch", "-f", "selftest-base"]);

  const run = (...args) =>
    spawnSync(process.execPath, [join(HERE, "check-frozen-workflows.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FREEZE_BASE_REF: "selftest-base", CI: "", GITHUB_ACTIONS: "" },
    });

  const manifest = () => JSON.parse(readFileSync(join(root, "frozen-workflows.json"), "utf8"));
  const before = manifest();

  check("baseline: the pre-existing registered workflow passes on its own", () => {
    const r = run();
    if (r.status !== 0) throw new Error(`expected exit 0, got ${r.status}:\n${r.stdout}${r.stderr}`);
  });

  // --- THE NEW _vN OF AN EXISTING CLASS ------------------------------------------------------
  const v2 = 'export async function demo_v2() {\n  "use workflow";\n  return 2;\n}\n';
  writeFileSync(join(root, "packages", "runtime", "workflows", "demo.v2.ts"), "// @frozen\n" + v2, "utf8");
  writeFileSync(
    join(root, "packages", "runtime", "workflows", "registry.ts"),
    'import { demo_v1 } from "./demo.v1.js";\nimport { demo_v2 } from "./demo.v2.js";\nexport const workflows = {\n  demo: demo_v2,\n} as const;\nexport { demo_v1 };\nexport { demo_v2 };\n',
    "utf8",
  );

  check("1 · FAIL BEFORE — a new _vN of an EXISTING class is UNREGISTERED (the old rule said otherwise)", () => {
    const r = run();
    if (r.status === 0) {
      throw new Error("the gate PASSED — the checker semantics changed; re-measure `.claude/rules/runtime-workflows.md` step 3 and retire this cell deliberately, never by quiet deletion.");
    }
    const out = r.stdout + r.stderr;
    if (!out.includes("UNREGISTERED")) throw new Error(`expected an UNREGISTERED violation, got:\n${out}`);
    if (!out.includes("demo.v2.ts")) throw new Error(`the violation should name the new path; got:\n${out}`);
  });

  check("2 · PASS AFTER — `--update` registers it and the gate goes green", () => {
    const u = run("--update");
    if (u.status !== 0) throw new Error(`--update failed: ${u.stdout}${u.stderr}`);
    const r = run();
    if (r.status !== 0) throw new Error(`expected exit 0 after --update, got ${r.status}:\n${r.stdout}${r.stderr}`);
  });

  const after = manifest();

  check("3 · ADDITIONS-ONLY — the manifest gained the new path and dropped none", () => {
    const b = Object.keys(before.workflows).sort();
    const a = Object.keys(after.workflows).sort();
    const dropped = b.filter((k) => !a.includes(k));
    const added = a.filter((k) => !b.includes(k));
    if (dropped.length) throw new Error(`--update DROPPED entries (append-only violated): ${dropped.join(", ")}`);
    if (!added.includes("packages/runtime/workflows/demo.v2.ts")) throw new Error(`expected the new path to be added; added = ${added.join(", ") || "(none)"}`);
  });

  check("4 · PRIOR HASHES UNCHANGED — and no deployed flag was granted or revoked", () => {
    for (const [path, prev] of Object.entries(before.workflows)) {
      const now = after.workflows[path];
      if (!now) throw new Error(`${path} vanished from the manifest`);
      if (now.sha256 !== prev.sha256) {
        throw new Error(`${path}'s hash MOVED (${prev.sha256} -> ${now.sha256}) — that is the signal that a frozen body was edited, and it must never be a side effect of --update.`);
      }
      if (Boolean(now.deployed) !== Boolean(prev.deployed)) {
        throw new Error(`${path}'s deployed flag changed (${prev.deployed} -> ${now.deployed}) — the deploy-lock is a ceremony act, never --update's.`);
      }
    }
    const fresh = after.workflows["packages/runtime/workflows/demo.v2.ts"];
    if (fresh.deployed === true) throw new Error("--update must NOT grant deployed:true to a newly registered path — the ceremony does that.");
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nfreeze-lint registration selftest: ${failures} case(s) FAILED.`);
  process.exit(1);
}
console.log("\nfreeze-lint registration selftest: OK — a new _vN requires --update, and --update is additions-only.");
