// Pre-integration gate for #1038 (withdraw clara.create_client's clara_authenticated grant,
// closing #899's own named residual). NOT a test file: preloaded by hand (node --test --import
// ./tests/create-client-grant-withdrawn-preintegration-gate.mjs tests/) so a package-wide sweep
// that may run against a database predating 0316_create_client_human_grant_withdrawn.sql greens
// with a LOUD skip instead of hard-failing. Mirrors firm-setup-tin-required-preintegration-gate
// .mjs's own idiom exactly -- this file's cells live inside client-birth-wall.test.mjs, gated on
// their OWN stem (`create_client_human_grant_withdrawn$`) independently of that file's original
// 0287 gate (see that file's header for why: the census cells this ticket rewrites assert a
// shape create_client's grant can no longer take once 0316 lands, so they cannot share 0287's
// gate without asserting something a database predating 0316 cannot produce).
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/client-birth-wall.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0316 FAILS LOUDLY on the grant-withdrawn
// cells. Final acceptance is exactly that focused shape with the variable UNSET, and accounts for
// zero skips.
process.env.CLARA_ALLOW_MISSING_CREATE_CLIENT_GRANT_WITHDRAWN = "1";
