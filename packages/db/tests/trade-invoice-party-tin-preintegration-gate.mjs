// Pre-integration gate for #982's TIN resolution arm (migration 0274). NOT a test file: preload
// it for an estate sweep run against a chain that predates this PR's migration, so the sweep
// greens with a LOUD skip instead of failing cells that assert a resolution only 0274 performs.
//
// READINESS IS THE LEDGER ROW, never a migration NUMBER (numbers are claimed at merge) and never
// the shape of the live body: the stem `trade_invoice_party_tin$` in `clara.schema_migrations` is
// the one fact that distinguishes "0274 applied" from "0225 alone" — the same convention
// `trade-invoice-preintegration-gate.mjs` states for #655's own frontier.
//
// #982's frontier is SEPARATE from #655's on purpose. A chain can carry 0225 and not 0274, and on
// that chain `trade-invoice.test.mjs` must still run in full while this file's battery skips.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/trade-invoice-party-tin-preintegration-gate.mjs`, appended to the chain
// in MIGRATION-NUMBER order (after `retire-create-account-set-preintegration-gate.mjs`, 0271).
//
// A FOCUSED invocation (node --test tests/trade-invoice-party-tin.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0274 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_PARTY_TIN = "1";
