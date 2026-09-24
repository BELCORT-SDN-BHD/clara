// Pre-integration gate for #948's AGREEMENT-CONTRACT reading and acquisition lane (migration
// 0299). NOT a test file: preload it for a package-wide sweep run against a chain that predates
// this PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every cell
// against a database where the `contract` field-path namespace, clara._agreement_answers_ok,
// clara.evaluate_agreement_contract_state_v1, clara.persist_agreement_facts,
// clara._agreement_entry_plan and clara._agreement_posting_verdict do not yet exist and
// clara.list_review_queue does not yet project row_kind='agreement_acquisition_blocked'.
//
// Mirrors payroll-summary-facts-preintegration-gate.mjs (#945, migration 0296) exactly.
//
// A FOCUSED invocation (node --test tests/agreement-contract-acquisition.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the lane FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_AGREEMENT_CONTRACT = "1";
