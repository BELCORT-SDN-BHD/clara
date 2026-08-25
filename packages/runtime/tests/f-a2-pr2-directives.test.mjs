// F-A2 PR-2 — THE WDK DIRECTIVE CENSUS. A regression guard, and it exists because the defect it
// catches actually happened during this build and cost a full build cycle to find.
//
// WHAT HAPPENED. `autoDraft.v9.ts` carried a correctly-placed `"use workflow"` directive on the
// line after its function signature. The build SUCCEEDED, typecheck was clean, and the workflow
// was silently ABSENT from the compiled registry — no warning anywhere. The cause is that the
// Workflow DevKit detects the directive by blanking template literals with a NAIVE regex BEFORE
// it looks for the directive line, and the prose comments in that file happened to leave an
// unbalanced backtick above the directive. The regex paired it with a backtick below, blanked
// the span between them, and the directive vanished from what the detector could see.
//
// WHY THIS CELL AND NOT A BUNDLE GREP. A bundle grep is the manual law (AGENTS.md: after any
// workflow-file edit, build and grep for the registrations) and it is what CAUGHT this — but it
// is a step a person has to remember, on an artifact that takes minutes to produce. This cell
// runs the SAME detector the build runs, in milliseconds, over every workflow file in the repo.
//
// IT MEASURES WITH THE INSTRUMENT PRODUCTION USES. It imports `detectWorkflowPatterns` from
// `@workflow/builders` — the exact function `@workflow/rollup`'s transform calls to decide
// whether to process a file. A hand-rolled regex here would be a second opinion about the very
// thing that went wrong, which is the defect class, not the fix.
//
// THE ORACLE IS DELIBERATELY NAIVE. "This file WANTS a directive" is a plain line-anchored match
// for a lone directive string statement — deliberately dumber than the detector, and dumb in the
// SAFE direction: it sees the directive in a file the detector cannot, which is exactly the
// disagreement worth failing on. If the two ever agree by both being wrong, the bundle grep is
// still the backstop.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "workflows");

/** Resolve `@workflow/builders` through the dependency chain that actually installs it:
 *  this package depends on `workflow`, which re-exports `@workflow/nitro`, which depends on
 *  `@workflow/rollup`, which depends on `@workflow/builders`. Walking the chain keeps the test
 *  off a pnpm virtual-store path with a version number baked into it, which would rot on the
 *  next bump and — worse — would rot SILENTLY into a skipped test. */
async function loadDetector() {
  // Each hop resolves the package's MAIN entry (its `./package.json` subpath is not always
  // exported), then walks back to that package's own directory so the next `createRequire` is
  // rooted inside it. Physical paths, because that is what pnpm's virtual store actually lays
  // out — and no version number is written down anywhere here.
  let req = createRequire(join(HERE, "..", "package.json"));
  for (const hop of ["workflow", "@workflow/nitro", "@workflow/rollup"]) {
    const entry = req.resolve(hop).replace(/\\/g, "/");
    const marker = `/node_modules/${hop}/`;
    const at = entry.lastIndexOf(marker);
    assert.ok(at !== -1, `could not locate ${hop} on disk from ${entry}`);
    req = createRequire(join(entry.slice(0, at + marker.length), "index.js"));
  }
  const found = req.resolve("@workflow/builders");
  return import(pathToFileURL(found).href);
}

/** A lone `"use workflow";` / `'use step';` string-expression statement on its own line. */
const wantsDirective = (src, directive) => new RegExp(`^\\s*["']${directive}["'];?\\s*$`, "m").test(src);

test("f-a2.pr2.directive-census: every workflow file whose source states a WDK directive is SEEN by the WDK's own detector", async () => {
  const { detectWorkflowPatterns } = await loadDetector();
  assert.equal(typeof detectWorkflowPatterns, "function", "the WDK detector must be resolvable — a skipped census proves nothing");

  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length > 20, `expected the workflows directory to be populated, saw ${files.length}`);

  const swallowed = [];
  let sawWorkflow = 0;
  let sawStep = 0;
  for (const f of files) {
    const src = readFileSync(join(WORKFLOWS, f), "utf8");
    const patterns = detectWorkflowPatterns(src);
    const wantW = wantsDirective(src, "use workflow");
    const wantS = wantsDirective(src, "use step");
    if (wantW) sawWorkflow += 1;
    if (wantS) sawStep += 1;
    if (wantW && !patterns.hasUseWorkflow) swallowed.push(`${f}: states "use workflow", detector says NO`);
    if (wantS && !patterns.hasUseStep) swallowed.push(`${f}: states "use step", detector says NO`);
  }

  // POSITIVE CONTROL. An empty `swallowed` list is only evidence if the census actually looked at
  // directive-bearing files; a glob that matched nothing would otherwise pass silently. Absence
  // is not evidence (review law 2), so the run asserts it SAW some of each kind.
  assert.ok(sawWorkflow >= 20, `census saw only ${sawWorkflow} "use workflow" files — the oracle or the glob is broken`);
  assert.ok(sawStep >= 5, `census saw only ${sawStep} "use step" files — the oracle or the glob is broken`);
  assert.deepEqual(swallowed, [], `WDK directives silently swallowed:\n  ${swallowed.join("\n  ")}`);
});

test("f-a2.pr2.directive-census: the census is NON-VACUOUS — an unbalanced backtick above a directive reproduces the exact swallow it guards against", async () => {
  const { detectWorkflowPatterns } = await loadDetector();

  // The MINIMAL reproduction of the defect this file exists for: one stray backtick in a comment
  // above the directive, one below it. Both files declare the same directive on the same line
  // relative to the same function; they differ ONLY in the two comment characters.
  const clean = ['// a comment with no tick', "export async function f(x) {", '  "use workflow";', "  return x;", "}", "const t = `ok`;"].join("\n");
  const poisoned = ['// a comment with a ` tick', "export async function f(x) {", '  "use workflow";', "  return x;", "}", "const t = `ok`;"].join("\n");

  assert.equal(detectWorkflowPatterns(clean).hasUseWorkflow, true, "the control must be SEEN, or this cell proves nothing about the poison");
  assert.equal(
    detectWorkflowPatterns(poisoned).hasUseWorkflow,
    false,
    "the poison must be UNSEEN — if the WDK has fixed its detector, delete this half and say so, do not weaken the census above",
  );
});
