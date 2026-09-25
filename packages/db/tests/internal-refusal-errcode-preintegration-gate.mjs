// Pre-integration gate for #1114's caller-contract errcode (migration
// 0335_internal_refusal_errcode.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/internal-refusal-errcode-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0335 still measures the code that
// chain actually raises, instead of hard-failing on the four caller-contract refusals. Mirrors
// schedule-term-correction-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-schedule-obo.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY — see
// `callerContractCode()` in internal-refusal-errcode-fixtures.mjs.
process.env.CLARA_ALLOW_MISSING_INTERNAL_REFUSAL_ERRCODE = "1";
