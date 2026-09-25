// Pre-integration gate for #1058 (clara.entry_post_receipts.via_wake_kind is NOT renamed -- a
// catalog comment plus a README section disclose that it now carries non-wake posting-lane
// values). NOT a test file: preloaded by hand (node --test --import
// ./tests/entry-post-receipts-via-wake-kind-disclosure-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating
// 0350_via_wake_kind_lane_disclosure.sql greens with a LOUD skip instead of hard-failing.
// Mirrors admit-autodraft-task-outcome-disclosure-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs)
// does not preload this file, so the variable stays unset and a chain missing 0350 FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, and accounts for zero
// skips.
process.env.CLARA_ALLOW_MISSING_VIA_WAKE_KIND_LANE_DISCLOSURE = "1";
