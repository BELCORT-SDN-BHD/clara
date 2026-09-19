// Pre-integration gate for #658's knowledge-retrieval lane (migration 0230). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.retrieve_knowledge, clara.work_knowledge_reads and the seventh door do not exist.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/knowledge-retrieval.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the cohort FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_RETRIEVAL_0230 = "1";
