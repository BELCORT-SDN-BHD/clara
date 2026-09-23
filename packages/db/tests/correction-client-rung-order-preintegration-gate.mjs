// #914's correction lock-order recut is frontier-gated on the `correction_client_rung_order$`
// stem (migration 0238), but a database that HAS the stem and an authoring copy that does not are
// two different situations. This module is the package-wide sweep's own reason to be quiet on the
// second one: it tells tests/correction-client-rung-order.test.mjs that a missing migration is an
// expected pre-integration state rather than a defect.
//
// A FOCUSED invocation (node --test tests/correction-client-rung-order.test.mjs) does not preload
// this module and therefore FAILS LOUDLY when 0238 is absent -- and it fails on the DEADLOCK the
// pre-0238 body still produces, which is the evidence, not a skip.
process.env.CLARA_ALLOW_MISSING_CORRECTION_CLIENT_RUNG_ORDER = "1";
