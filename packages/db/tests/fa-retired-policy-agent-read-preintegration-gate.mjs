// #1092's agent read of a retired depreciation policy (0346_fa_retired_policy_agent_read.sql)
// lands on a frontier above several in-flight tickets, so a package-wide CI run against a chain
// that has NOT applied it must SKIP that battery LOUDLY rather than fail it. A focused invocation
// does NOT preload this module and therefore FAILS when the migration is absent — the 0277/0345
// idiom, verbatim (tests/fa-depreciation-policy-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0346 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_FA_RETIRED_POLICY_AGENT_READ = "1";
