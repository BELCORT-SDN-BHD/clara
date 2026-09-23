// Pre-integration gate for #990's bank_statement_lines source-citation columns (migration
// 0291). NOT a test file: preload it for an estate sweep run against a chain that predates
// this PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every cell
// against a database where clara.bank_statement_lines carries no citation column.
//
// Mirrors document-regions-field-path-check-preintegration-gate.mjs (#857/0290) exactly.
//
// A FOCUSED invocation (node --test tests/bank-statement-line-citation.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the columns FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_BANK_STATEMENT_LINE_CITATION = "1";
