// #868's subledger-hook caller-roster comment is frontier-gated on the
// `subledger_hook_caller_roster$` stem (migration 0236), but a database that HAS the stem and an
// authoring copy that does not are two different situations. This module is the package-wide
// sweep's own reason to be quiet on the second one: it tells
// tests/subledger-hook-caller-roster.test.mjs that a missing migration is an expected
// pre-integration state rather than a defect.
//
// A FOCUSED invocation (node --test tests/subledger-hook-caller-roster.test.mjs) does not preload
// this module and therefore FAILS LOUDLY when 0236 is absent — a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER = "1";
