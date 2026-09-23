// Pre-integration gate for #1003's retirement of `clara.create_account_set_v1` (migration 0271).
// NOT a test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing the one cell that
// asserts the door is GONE against a database where it is still live.
//
// A REMOVAL'S GATE READS THE SAME WAY AS AN ADDITION'S, with the sense inverted: readiness is
// detected off `clara.schema_migrations` (a row matching the stem `retire_create_account_set_v1$`),
// never off a migration NUMBER — numbers are claimed at merge — and never off the function's
// ABSENCE, because "absent" is also what a chain below 0059 looks like, where the body was never
// created at all. The ledger row is the only fact that distinguishes "retired" from "not yet
// born" (packages/db/tests/a21-helpers.mjs's own convention: "the clara.schema_migrations row,
// never the migration file on disk").
//
// THE OTHER HALF OF 0271'S FRONTIER lives in packages/db/tests/rig-meta.mjs, and cannot be an env
// flag: the grant-matrix sweep and the operation census both iterate the LIVE catalog, so below
// this frontier they meet a live, granted `create_account_set_v1`. `RETIRED_0271_HUMAN_FNS` there
// is the retirement window's own arm — see the block where it is declared.
//
// A FOCUSED invocation (node --test tests/client-financial-pack.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_RETIRE_CREATE_ACCOUNT_SET = "1";
