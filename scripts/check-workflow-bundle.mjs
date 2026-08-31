#!/usr/bin/env node
// Workflow-bundle gate — the POST-BUILD half of Appendix A, and the answer to a defect this
// repo has already paid for twice.
//
// WHY THIS EXISTS. `.claude/rules/runtime-workflows.md` states the hazard in its own words:
// "the WDK compiler can silently swallow a directive: the source reads correctly, the build
// succeeds, and the behaviour is simply absent at runtime. Typecheck does not cover this, and
// neither does reading the source." PROGRESS.md records the 2026-08-26 case where a deploy's
// tag was assumed and the serving bundle was still on v13. Both are invisible to every
// source-reading gate in the estate.
//
// WHY IT IS A SCRIPT AND NOT ONLY A TEST CELL (P6-1 Codex review, MEDIUM-1). A test cell that
// SKIPS when `.output/` is absent certifies nothing: CI's build job builds and stops, and the
// estate suite deliberately runs unbuilt, so the cell skipped in both lanes and the bundle claim
// was never actually made. Law 28 — absence is not evidence. This runs in the build job right
// after `pnpm build`, where the artifact is guaranteed to exist, and a MISSING BUNDLE IS A
// FAILURE HERE, never a skip. `packages/runtime/tests/p6-1-chatturn-v16.test.mjs` invokes this
// same file rather than restating its assertions, so there is one assertion list, not two.
//
// IT DERIVES, IT DOES NOT HARDCODE. The pinned version of every class is read from
// registry.ts through `parseRegistrySource` — the SAME parser freeze-lint's monotonicity gate
// uses, taken by import rather than retyped (review law 3). So this gate needs no edit at
// chatTurn_v17: it will assert whatever the registry then pins, and it will notice if the
// bundle disagrees with it.
//
// Usage: node scripts/check-workflow-bundle.mjs      (MUST run AFTER `pnpm build`)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseRegistrySource } from "./freeze-lint-checks.mjs";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const BUNDLE = join(REPO_ROOT, "packages", "runtime", ".output", "server", "index.mjs");
const REGISTRY = join(REPO_ROOT, "packages", "runtime", "workflows", "registry.ts");

const violations = [];
const checks = [];
const ok = (label) => checks.push(label);

// --- The artifact. A MISSING BUNDLE IS THE FAILURE, not a reason to stand down. -------------
if (!existsSync(BUNDLE)) {
  console.error(
    "check-workflow-bundle: FAIL — no built bundle at packages/runtime/.output/server/index.mjs.\n\n" +
      "  This gate exists to certify the SERVED artifact, so it cannot pass without one. Run\n" +
      "  `pnpm --filter @clara/runtime build` first; in CI this step must sit AFTER `pnpm build`\n" +
      "  in the build job. (Skipping here is the exact defect the gate was minted to close.)",
  );
  process.exit(1);
}

const bundle = readFileSync(BUNDLE, "utf8");
const registrySrc = readFileSync(REGISTRY, "utf8");
const { classes, problems } = parseRegistrySource(registrySrc, "registry.ts");
for (const p of problems) violations.push(`REGISTRY-UNPARSEABLE  ${p}`);
if (classes.size === 0) violations.push("REGISTRY-EMPTY  parsed zero workflow classes — the gate would be vacuous, so it fails closed instead.");

/** `./chatTurn.v16.js` -> `chatTurn.v16` — the module stem the WDK directive is keyed on. */
const stem = (spec) => spec.replace(/^\.\//, "").replace(/\.(js|ts|mjs)$/, "");

/**
 * Substring search with a RIGHT BOUNDARY, and it is load-bearing rather than fussy: the first
 * run of this gate reported the bundle carrying a stale `chatTurn: chatTurn_v1` pin beside
 * `chatTurn: chatTurn_v16`. It does not — `chatTurn_v1` is a PREFIX of `chatTurn_v16`, and a
 * plain `includes()` cannot tell a version from the start of a longer one. That is the estate's
 * own "spelling is not identity" law arriving inside the instrument written to enforce it, so
 * every match below goes through here: the character after the match must not continue the
 * identifier.
 */
function includesToken(haystack, token) {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(token, from);
    if (i < 0) return false;
    const after = haystack[i + token.length];
    if (after === undefined || !/[0-9A-Za-z_$]/.test(after)) return true;
    from = i + 1;
  }
}

// --- (1) EVERY pinned class reaches the bundle, as its own directive ------------------------
// The two halves are distinct failures: the registry LINE can survive while the WDK swallowed
// the `"use workflow"` directive that makes the body dispatchable.
for (const [className, entry] of classes) {
  const pinLine = `${className}: ${entry.identifier}`;
  if (!includesToken(bundle, pinLine)) {
    violations.push(`PIN-ABSENT        "${pinLine}" is not in the bundle — the registry repoint did not reach the served artifact.`);
  } else ok(`pin ${pinLine}`);

  const directive = `workflows/${stem(entry.source)}//${entry.identifier}`;
  if (!includesToken(bundle, directive)) {
    violations.push(
      `DIRECTIVE-ABSENT  "${directive}" is not in the bundle — the WDK did not register ${entry.identifier}'s workflow directive. ` +
        `This is the silent-swallow class: the source reads correctly and the build succeeded.`,
    );
  } else ok(`directive ${directive}`);
}

// --- (2) NO SUPERSEDED PIN SURVIVES --------------------------------------------------------
// A bundle carrying both `chatTurn: chatTurn_v15` and `chatTurn: chatTurn_v16` would mean the
// repoint half-took. Derived from the registry's own export roster, so it needs no maintenance.
const exportedByClass = new Map();
for (const m of registrySrc.matchAll(/export\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
  const ident = m[1];
  const vm = /^(.*?)_?[vV](\d+)$/.exec(ident);
  if (!vm) continue;
  const base = vm[1];
  if (!exportedByClass.has(base)) exportedByClass.set(base, []);
  exportedByClass.get(base).push(ident);
}
for (const [className, entry] of classes) {
  const base = /^(.*?)_?[vV]\d+$/.exec(entry.identifier)?.[1];
  if (!base) continue;
  for (const other of exportedByClass.get(base) ?? []) {
    if (other === entry.identifier) continue;
    const stalePin = `${className}: ${other}`;
    if (includesToken(bundle, stalePin)) {
      violations.push(`STALE-PIN         the bundle still carries "${stalePin}" beside the live pin "${className}: ${entry.identifier}" — two pins for one class.`);
    }
  }
  ok(`no superseded pin for ${className}`);
}

// --- (3) RESUMABILITY: every EXPORTED body still ships -------------------------------------
// Appendix A policy (c) and the README's rollback preflight: a parked run resumes into the body
// it left, so an export the registry still carries must be reachable IN THE IMAGE, not merely
// in the repo. Nothing else in CI checks this.
let resumable = 0;
for (const idents of exportedByClass.values()) {
  for (const ident of idents) {
    const vm = /^(.*?)_?[vV](\d+)$/.exec(ident);
    if (!vm) continue;
    const modStem = `${vm[1]}.v${vm[2]}`;
    const directive = `workflows/${modStem}//${ident}`;
    if (!includesToken(bundle, directive)) {
      violations.push(
        `UNRESUMABLE       "${directive}" is not in the bundle, but registry.ts still exports ${ident} — a run parked on that body would be stranded by this image (policy (c)).`,
      );
    } else resumable += 1;
  }
}
ok(`${resumable} superseded body(ies) still ship for parked runs`);

// --- (4) chatTurn's BEHAVIOURAL pins — the half a registry line cannot prove ---------------
// A pin can be right while the promotion that makes the version worth shipping was dropped.
// Version-gated so this stays true at v17+ without an edit.
const chat = classes.get("chatTurn");
if (chat) {
  const step = `workflows/${stem(chat.source)}.impl//runModelSegmentStepV${chat.version}`;
  if (!includesToken(bundle, step)) {
    violations.push(`STEP-ABSENT       "${step}" is not in the bundle — the WDK registered the workflow but not its model-segment STEP.`);
  } else ok(`step directive ${step}`);

  const stamp = `chatturn-v${chat.version}`;
  if (!includesToken(bundle, stamp)) violations.push(`STAMP-ABSENT      the "${stamp}" engine stamp is not in the bundle — the metering ledger would name the wrong body.`);
  else ok(`engine stamp ${stamp}`);

  if (chat.version >= 16) {
    // P6-1 / Q8: the ONE part kind this lane emits. The registry line is not evidence that the
    // promotion survived the compile; this string is.
    if (!includesToken(bundle, 'type: "freeform_result"')) {
      violations.push('EMITTER-ABSENT    the freeform_result promotion (`type: "freeform_result"`) is not in the bundle — chatTurn_v16+ shipped without the card it exists to add.');
    } else ok("freeform_result emitter");
  }
}

if (violations.length > 0) {
  console.error("check-workflow-bundle: FAIL\n");
  for (const v of violations) console.error("  - " + v);
  console.error(`\n${violations.length} violation(s). The BUNDLE is the served artifact; the source is not.`);
  process.exit(1);
}

console.log(
  `check-workflow-bundle: OK — ${classes.size} pinned class(es) present with their WDK directives, ` +
    `no superseded pin survives, ${resumable} superseded body(ies) still ship for parked runs` +
    (chat ? `, chatTurn pinned at v${chat.version} with its step directive, engine stamp${chat.version >= 16 ? " and freeform_result emitter" : ""}` : "") +
    ` (${checks.length} checks).`,
);
