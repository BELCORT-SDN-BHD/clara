// Pre-integration gate for #934 (firm setup 1/2: user_note/retired_at columns and the
// get_firm_setup recut). NOT a test file: preloaded by hand
// (node --test --import ./tests/firm-setup-user-notes-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0258_firm_setup_user_notes.sql
// greens with a LOUD skip instead of hard-failing. Mirrors
// firm-setup-applicability-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/firm-setup-user-notes.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the new recut FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_USER_NOTES = "1";
