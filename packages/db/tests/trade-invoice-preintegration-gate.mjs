// #655's trade-invoice battery is frontier-gated on the `trade_invoices$` stem (0225), which lands
// above several in-flight tickets. A package-wide CI run against a chain that has NOT applied it
// must SKIP the battery LOUDLY rather than fail it. A FOCUSED invocation does not preload this
// module and therefore FAILS when the lane is absent — the 0176 idiom
// (tests/counterparty-alias-kind-preintegration-gate.mjs), as 0191/0192/0193/0196/0221 reuse it.
//
// THE STEM CLAIM IS WHAT ARMS THE CELLS. Until 0225 is applied this file is the honest reason the
// battery is quiet, not a silent pass.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/trade-invoice-preintegration-gate.mjs`, appended to the chain in
// MIGRATION-NUMBER order (after `preview-invite-preintegration-gate.mjs`, which is 0224).
process.env.CLARA_ALLOW_MISSING_TRADE_INVOICES = "1";
