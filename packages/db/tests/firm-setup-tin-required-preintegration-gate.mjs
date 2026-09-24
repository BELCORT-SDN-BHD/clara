// Pre-integration gate for #1032 (the firm-setup TIN item is always offered; required-or-optional
// instead of seeded-or-not). NOT a test file: preloaded by hand (node --test --import
// ./tests/firm-setup-tin-required-preintegration-gate.mjs tests/) so a package-wide sweep that may
// run against a database predating 0311_firm_setup_tin_required.sql greens with a LOUD skip
// instead of hard-failing. Mirrors firm-setup-applicability-preintegration-gate.mjs's own idiom
// exactly -- this file's cells live inside firm-setup-applicability.test.mjs, gated on their OWN
// stem (`firm_setup_tin_required$`) independently of that file's original 0257 gate (see that
// file's header for why: `tin`'s old seeded-or-not shape is gone for good once 0311 lands, so its
// rewritten cells cannot share 0257's gate without asserting a shape the database can no longer
// produce).
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/firm-setup-applicability.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0311 FAILS LOUDLY on the tin-required
// cells. Final acceptance is exactly that focused shape with the variable UNSET, and accounts for
// zero skips.
process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_TIN_REQUIRED = "1";
