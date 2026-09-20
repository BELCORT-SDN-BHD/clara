// Pre-integration gate for #968's batch-cancellation re-issue (migration
// 0253_batch_cancel_reissue.sql). NOT a test file: preload it for an estate sweep run against a
// chain that predates this PR's migration, so the sweep greens with a LOUD skip instead of
// hard-failing every cell against a database where `clara.cancel_intake_batch` still refuses
// EVERY second decision unconditionally, whatever the stored canceller's standing.
//
// Mirrors document-ingest-window-myt-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/intake-batch.test.mjs) does not preload this file, so
// the variable stays unset and a chain missing the exception FAILS LOUDLY in that file's `before`
// hook. Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO
// skips. Without this module #968's four `p968.reissue.*` cells were skip-only: on a chain
// missing 0253 they reported four green skips and nothing anywhere failed, which is the exact
// "a skip is not evidence" hole the gate modules exist to close (L05-SPEC-03 / ADV-W2L05-04).
process.env.CLARA_ALLOW_MISSING_BATCH_CANCEL_REISSUE = "1";
