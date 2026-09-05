// Property test for `acctNo()` (rig-helpers.mjs) — the fixture helper that replaced the
// nondeterministic `${prefix}${randomUUID().slice(0, 6)}` account-number pattern responsible for
// the 0.28% CLR10 flake (f-a3pr3.mfA.pos, CI run 33985989527: "account number MFAPOSdeabff has no
// digits", raised by clara._add_bank_account_core at 0155_client_identifiers_unique.sql:557).
//
// NO DATABASE OF ITS OWN: this exercises the JS generator against a JS re-derivation of the
// wall's own predicate, not a live Postgres call. rig-helpers.mjs's pool is lazy (getPool() is
// never invoked here), so this file needs no rig and no CLARA_RIG_DB gate.
//
// The MUTANT proof for this cell (PR body quotes the run) is NOT shipped here as a
// permanently-red test — it was taken by temporarily reverting acctNo()'s digit-forcing line
// back to the pre-fix shape, running this exact file, observing it go red, then restoring the
// real implementation. A self-failing test has no place in a suite CI treats as a pass/fail
// gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { acctNo } from "./rig-helpers.mjs";

const DRAWS = 10_000;

/** The wall's own digit predicate (0155:554-558), re-derived in JS: strip every non-digit
 *  character and refuse an empty result. */
const hasDigit = (accountNumber) => accountNumber.replace(/\D/g, "") !== "";

test("acctno.pos acctNo() always carries a digit, over 10,000 draws, with an all-letter prefix and with none", async () => {
  let sawNoDigit = 0;
  for (let i = 0; i < DRAWS; i++) {
    const withPrefix = acctNo("MFAPOS");
    const bare = acctNo();
    if (!hasDigit(withPrefix)) sawNoDigit++;
    if (!hasDigit(bare)) sawNoDigit++;
    assert.ok(withPrefix.startsWith("MFAPOS"), "acctno.pos: the prefix is preserved verbatim");
    assert.equal(withPrefix.length, "MFAPOS".length + 6, "acctno.pos: the suffix keeps the original 6-character length");
    assert.match(withPrefix.slice("MFAPOS".length), /^[0-9a-f]{6}$/, "acctno.pos: the suffix stays in the wall's accepted hex-digit character class");
  }
  assert.equal(sawNoDigit, 0, `acctno.pos: ${sawNoDigit} of ${DRAWS * 2} draws had no digit at all — the guarantee is not unconditional`);
});
