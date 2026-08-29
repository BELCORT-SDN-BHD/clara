// Pre-integration gate for MBB-7(a) (the structural duplicate-open wall on the two agent
// proposal doors). NOT a test file: preloaded by hand (node --test --import ./tests/promotion-
// dup-open-wall-preintegration-gate.mjs tests/) so a sweep that may run against a database
// predating this migration (UNNUMBERED as of this authoring session -- packages/db/README.md
// "Migration numbers are claimed at MERGE time") greens with a LOUD skip instead of hard-
// failing. Mirrors proposal-basis-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/promotion-dup-open-wall.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing either partial unique index FAILS
// LOUDLY. Final acceptance is exactly that focused shape with the variable UNSET, and accounts
// for zero skips.
//
// MERGE NOTE: this gate is NOT wired into packages/db/package.json's --import chain --
// deliberately, matching every F-A7 sibling (f-a7-alpha/-beta/-a7b-pr-a/proposal-basis-
// preintegration-gate.mjs), none of which is wired either. Once the migration is NUMBERED
// (0148, claimed at merge prep) the package-wide sweep runs against a chain that carries it
// (CI applies HEAD's migrations first) -- while the file was UNNUMBERED the runner skipped it
// and the battery went RED in the sweep, which is the fail-never-skip shape working as
// designed (independent review 2026-08-29). The allow-missing arm is therefore only ever
// needed by a hand-run against a pre-MBB-7(a) database -- preload it explicitly then:
//   node --test --import ./tests/promotion-dup-open-wall-preintegration-gate.mjs tests/
process.env.CLARA_ALLOW_MISSING_PROMOTION_DUP_WALL = "1";
