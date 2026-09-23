// Pre-integration gate for #1007's duplicate probe (migration 0275). NOT a test file: preload it
// for an estate sweep run against a chain that predates this PR's migration, so the sweep greens
// with a LOUD skip instead of failing cells that assert a warning only 0275 can produce.
//
// READINESS IS THE LEDGER ROW, never a migration NUMBER (numbers are claimed at merge) and never
// the shape of the live body: the stem `trade_invoice_duplicate_probe$` in
// `clara.schema_migrations` is the one fact that distinguishes "0275 applied" from "0225 and 0274
// alone" — the same convention `trade-invoice-preintegration-gate.mjs` states for #655's frontier
// and `trade-invoice-party-tin-preintegration-gate.mjs` for #982's.
//
// #1007's frontier is a THIRD one on this lane, separate on purpose. A chain can carry 0225 and
// 0274 and not 0275, and on that chain `trade-invoice.test.mjs` and
// `trade-invoice-party-tin.test.mjs` must still run in full while this file's battery skips.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/trade-invoice-duplicate-probe-preintegration-gate.mjs`, appended to the
// chain in MIGRATION-NUMBER order (after `trade-invoice-party-tin-preintegration-gate.mjs`, 0274).
//
// A FOCUSED invocation (node --test tests/trade-invoice-duplicate-probe.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing 0275 FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_DUPLICATE_PROBE = "1";
