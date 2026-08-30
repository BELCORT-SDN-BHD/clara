// The preintegration-gate CHAIN audit — NOT a test file: it is the instrument
// preintegration-gate-chain.test.mjs runs, exported separately so the test's positive controls
// and any ceremony can drive the SAME function rather than a re-typed copy of it (the copy is
// how a guard quietly stops guarding).
//
// WHY THIS EXISTS. A wave battery's pre-integration gate is a file that sets
// CLARA_ALLOW_MISSING_<WAVE>=1, and it only has that effect if packages/db/package.json's test
// script PRELOADS it with `--import ./tests/<name>`. The two halves live in different files and
// nothing connected them, so shipping the gate and forgetting the token is a silent, one-token
// mistake — and its consequence is invisible where it is made: the battery then FAILS LOUDLY
// instead of skipping on every chain that predates its migration, i.e. the frontier legs and the
// closed-wave drills, which run on the weekly sweep FAR from the PR that caused it.
// (.claude/rules/db-tests.md names exactly this "reds the NEXT sweep far from the PR" class.)
// Measured live at authoring: #425 shipped tests/promotion-dup-open-wall-preintegration-gate.mjs
// and never added its token, which is what motivated this audit.
//
// TWO-SIDED BY CONSTRUCTION. A one-sided check (every gate is imported) would let a token
// pointing at a deleted or renamed file sit in the chain forever, silently preloading nothing;
// a `--import` of a path node cannot resolve is a hard startup error, so a dangling token is a
// live break, not an untidiness. Both directions are therefore findings, and so is a duplicate.

/** Every `--import ./tests/<file>` token in a package test script, in order of appearance. */
export function importedTestFiles(script) {
  return [...String(script ?? "").matchAll(/--import\s+\.\/tests\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
}

/** A gate file by NAME contract — the same suffix the wave batteries agree on. */
export const isGateFile = (name) => /-preintegration-gate\.mjs$/.test(name);

/**
 * Audit one test script against the real directory listing.
 *
 * @param {{script: string, filesOnDisk: string[]}} input
 *   `filesOnDisk` is every basename in packages/db/tests (gates are derived from it here rather
 *   than passed in, so a caller cannot narrow the corpus and green the audit by omission).
 * @returns {{notPreloaded: string[], danglingImports: string[], duplicates: string[]}}
 */
export function auditGateChain({ script, filesOnDisk }) {
  const onDisk = new Set(filesOnDisk);
  const gatesOnDisk = filesOnDisk.filter(isGateFile);
  const imported = importedTestFiles(script);
  const importedSet = new Set(imported);

  const seen = new Set();
  const duplicates = [];
  for (const f of imported) {
    if (seen.has(f) && !duplicates.includes(f)) duplicates.push(f);
    seen.add(f);
  }

  return {
    // A gate on disk that nothing preloads — the #425 shape.
    notPreloaded: gatesOnDisk.filter((f) => !importedSet.has(f)).sort(),
    // A token naming a file that is not there — a hard startup error waiting for the next run.
    danglingImports: imported.filter((f) => !onDisk.has(f)).sort(),
    duplicates: duplicates.sort(),
  };
}

/** Human-readable findings, or "" when the chain is whole. Shared by the test and any ceremony. */
export function describeGateChainFindings(findings) {
  const parts = [];
  if (findings.notPreloaded.length) {
    parts.push(
      `${findings.notPreloaded.length} pre-integration gate(s) exist on disk but are NOT preloaded by `
      + `packages/db/package.json's test script: ${findings.notPreloaded.join(", ")}. Each one's battery will `
      + `FAIL rather than skip on a chain that predates its migration (the frontier legs and the closed-wave `
      + `drills), and it will surface on the weekly sweep far from the PR that caused it. Add `
      + findings.notPreloaded.map((f) => `--import ./tests/${f}`).join(" ") + " to the chain.",
    );
  }
  if (findings.danglingImports.length) {
    parts.push(
      `${findings.danglingImports.length} --import token(s) name a file that does not exist: `
      + `${findings.danglingImports.join(", ")}. node resolves --import at startup, so this breaks the whole `
      + `package suite on the next run — remove the token or restore the file.`,
    );
  }
  if (findings.duplicates.length) {
    parts.push(`${findings.duplicates.length} --import token(s) appear more than once: ${findings.duplicates.join(", ")}.`);
  }
  return parts.join("\n");
}
