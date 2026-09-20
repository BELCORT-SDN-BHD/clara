// Pre-integration gate for #935 (firm setup 2/2: three optional education tips, a read-or-later
// rendering, outside the required counters and the audit trail). NOT a test file: preloaded by
// hand (node --test --import ./tests/firm-setup-education-tips-preintegration-gate.mjs tests/) so
// a package-wide sweep that may run against a database predating
// 0259_firm_setup_education_tips.sql greens with a LOUD skip instead of hard-failing. Mirrors
// firm-setup-user-notes-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/firm-setup-education-tips.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the new door FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_EDUCATION_TIPS = "1";
