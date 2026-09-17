// #649's client-identity / onboarding-settle battery is frontier-gated on the
// `client_onboarding_facts$` stem (0219), which lands above several in-flight tickets. A
// package-wide CI run against a chain that has NOT applied it must SKIP the battery LOUDLY
// rather than fail it. A FOCUSED invocation does not preload this module and therefore FAILS
// when the cohort is absent — the 0176 idiom (tests/counterparty-alias-kind-preintegration-gate.mjs),
// as 0191/0192/0193/0196 reuse it.
//
// THE COHORT CLAIM IS WHAT ARMS THE CELLS. Until 0219 is applied this file is the honest reason
// the battery is quiet, not a silent pass — and the battery's own probe treats a HALF-applied
// cohort (one of the two doors, or the ungranted helper missing) as a defect rather than as an
// old frontier, because a settle door without its identity read is a narrower boundary nobody
// chose.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/client-onboarding-identity-preintegration-gate.mjs`.
process.env.CLARA_ALLOW_MISSING_CLIENT_ONBOARDING_FACTS = "1";
