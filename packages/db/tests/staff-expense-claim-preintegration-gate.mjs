// #638's staff-expense-claim battery is frontier-gated on the `staff_expense_claims$` stem (0206),
// which lands above several in-flight tickets. A package-wide CI run against a chain that has NOT
// applied it must SKIP the battery LOUDLY rather than fail it. A FOCUSED invocation does not
// preload this module and therefore FAILS when the lane is absent — the 0176 idiom
// (tests/counterparty-alias-kind-preintegration-gate.mjs), as 0191/0192/0193/0196 reuse it.
//
// THE STEM CLAIM IS WHAT ARMS THE CELLS. Until 0206 is applied this file is the honest reason the
// battery is quiet, not a silent pass.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/staff-expense-claim-preintegration-gate.mjs`.
process.env.CLARA_ALLOW_MISSING_STAFF_EXPENSE_CLAIMS = "1";
