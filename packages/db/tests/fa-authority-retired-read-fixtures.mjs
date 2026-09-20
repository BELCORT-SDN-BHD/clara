// #979 [0251, the depreciation authority read tells "never had one" apart from "had one, and it
// was retired"] — the battery's frontier gate. NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it.
//
// NO SEPARATE CLIENT FACTORY. Every cell here is an ordinary `freshFaClient` on the shared x41
// world — this ticket changes a READ, not the shape of what gets written, so there is no reason
// to keep these clients out of the `x41_…` family or its tie sweep the way
// `fa-birth-watermark-fixtures.mjs` (#972) had to for a DIFFERENT reason (a deliberately
// pre-enrolment, defect-shaped fixture). `x41-fa-world.mjs`'s own `proposeAuthority` /
// `signAuthority` / `retireAuthorityVerb` / `getAuthority` / `authorityRows` are exactly what
// this battery needs, so this file re-exports them rather than restating any.

import assert from "node:assert/strict";
import { rootQuery, markSkip } from "./x41-fa-world.mjs";

export * from "./x41-fa-world.mjs";

// ===========================================================================================
// The frontier gate — on 0251's STABLE STEM, never its number (a number is claimed at MERGE, a
// stem is not).
// ===========================================================================================

/** `0251_fa_authority_retired_read.sql` → `fa_authority_retired_read$`. */
export const FA_AUTHORITY_RETIRED_READ_STEM = "fa_authority_retired_read$";

let _ready = null;
export async function faAuthorityRetiredReadReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_AUTHORITY_RETIRED_READ_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#979 migration (${FA_AUTHORITY_RETIRED_READ_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  `fa-authority-retired-read-preintegration-gate.mjs`) FAILS LOUDLY below 0251 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate979(t) {
  if (await faAuthorityRetiredReadReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_AUTHORITY_RETIRED_READ !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-authority-retired-read-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#979 authority-retired-read absent (no ${FA_AUTHORITY_RETIRED_READ_STEM} migration applied)`);
  return true;
}
