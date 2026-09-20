// #906's `_assert_journal_basis` zero-total-arm documentation is frontier-gated on the
// `journal_basis_zero_total_unreachable$` stem (migration 0237), but a database that HAS the stem
// and an authoring copy that does not are two different situations. This module is the
// package-wide sweep's own reason to be quiet on the second one: it tells
// tests/journal-basis-zero-total-unreachable.test.mjs that a missing migration is an expected
// pre-integration state rather than a defect.
//
// A FOCUSED invocation (node --test tests/journal-basis-zero-total-unreachable.test.mjs) does not
// preload this module and therefore FAILS LOUDLY when 0237 is absent — a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM = "1";
