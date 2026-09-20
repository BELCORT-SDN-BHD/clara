// #972 [0247, the fixed-asset acquisition birth honours the enrolment watermark on EVERY firing]
// — the battery's frontier gate and its client factory. NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it.
//
// WHY ITS OWN CLIENT FACTORY RATHER THAN `freshFaClient`. Every client this battery builds is a
// DELIBERATE pre-enrolment shape: GL history approved on a cost account BEFORE anyone enrolled it,
// which the register can never hold (0041 §1.2). `x41-round35-tie.test.mjs`'s `x41.s4` sweeps every
// client whose name matches `X41_FAMILY_NAME_RE` and holds each explained difference to an
// allow-list pinned at exactly ONE entry, so an `x41_…` name here would enrol this battery's
// fixtures in that sweep and force the list to grow. Every client here is `p972_…` and is
// invisible to it — the same reason `depreciation-history-fixtures.mjs` names its clients `p651_…`.
// The classification LAW is still the sweep's own: this battery imports `isRed`/`isExplained` from
// `x41-round35-helpers.mjs` rather than restating either.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`humanQuery` at its least-privileged floor via
// the shared verb wrappers). `rootQuery` appears only as a READBACK.

import assert from "node:assert/strict";
import {
  rootQuery, opk, markSkip, noteLane,
  faWorld, buildFaChart, createClient, grantConsent, upsertFaProfile, uniqTag,
  COST, ACCUM, EXPENSE,
} from "./x41-fa-world.mjs";

export * from "./x41-fa-world.mjs";

// ===========================================================================================
// 1 · The frontier gate — on 0247's STABLE STEM, never its number (a number is claimed at MERGE,
//     a stem is not).
// ===========================================================================================

/** `0247_fa_birth_watermark.sql` → `fa_birth_watermark$`. */
export const FA_BIRTH_WATERMARK_STEM = "fa_birth_watermark$";

let _ready = null;
export async function faBirthWatermarkReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_BIRTH_WATERMARK_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#972 migration (${FA_BIRTH_WATERMARK_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  `fa-birth-watermark-preintegration-gate.mjs`) FAILS LOUDLY below 0247 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate972(t) {
  if (await faBirthWatermarkReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_BIRTH_WATERMARK !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-birth-watermark-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#972 birth watermark absent (no ${FA_BIRTH_WATERMARK_STEM} migration applied)`);
  return true;
}

/** The INLINE half of the same gate, for a cell OLDER than 0247 that gains ONE assertion from it
 *  (`x41.b3`). `t.skip()` would abandon the rest of that cell, so this returns a boolean instead:
 *  true = the law is live and the assertion must run. Below 0247 it still fails loudly in a
 *  focused run, and counts a skip under the preloaded gate. */
export async function faBirthWatermarkEnforced(where) {
  if (await faBirthWatermarkReady()) return true;
  if (process.env.CLARA_ALLOW_MISSING_FA_BIRTH_WATERMARK !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run, so ${where} cannot be asserted. Apply the migration, `
      + "or preload tests/fa-birth-watermark-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  noteLane(`#972: ${where} skipped — no ${FA_BIRTH_WATERMARK_STEM} migration applied`);
  return false;
}

// ===========================================================================================
// 2 · The client factory. Outside the x41 family, on the x41 chart, with the cost account
//     enrolled or not as the cell needs.
// ===========================================================================================

/** A fresh firm-A client on the x41 chart, named OUTSIDE the x41 family (see this file's
 *  header). `enrol: false` leaves the cost account UN-enrolled so the cell can post history
 *  before the watermark exists. */
export async function p972Client(label, { enrol = true } = {}) {
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `p972_${label}_${uniqTag()}`, opKey: opk("p972cli") });
  await buildFaChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  if (enrol) {
    await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  }
  return client;
}

/** The live source of `clara._tf_fa_acquisition_birth`, read off the CATALOG (never file text). */
export const birthBodySource = async () =>
  (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure",
  )).rows[0]?.src ?? "";

/** The watermark predicate 0247 installs in the birth join. It is CLOCK-FREE, and it is the exact
 *  complement of `clara.fa_register_tie`'s OWN pre-enrolment test (below): the instrument that
 *  births the register row and the instrument that audits it answer "was this entry approved
 *  before the account was enrolled?" with the same expression, so they cannot drift apart. */
export const WATERMARK_EXPR = "coalesce(new.approved_at, new.created_at) >= fp.enrolled_at";

/** `clara.fa_register_tie`'s own pre-enrolment test (0041:4367 and :4376, once per column). The
 *  birth's watermark is its negation, which is what makes a difference the tie reports either
 *  explained by its pre-enrolment column or nobody's. */
export const TIE_PRE_ENROLMENT_EXPR = "coalesce(j.approved_at, j.created_at) < v_enrolled";

/** A complete reversal-linkage UPDATE that ALSO tries to null `approved_at` — the one shape that
 *  could make the birth's fallback load-bearing. `clara._tf_entry_immutable`'s approved->approved
 *  arm allows only reversed_by / reversal_reason / updated_at, so this is CLR08, and the
 *  watermark's first operand can never be NULL on a row this trigger fires for. */
export const NULL_APPROVED_AT_UPDATE =
  "update clara.journal_entries set approved_at = null, reversed_by = id, "
  + "reversal_reason = 'p972 watermark probe' where id = $1";

/** 0216's watermark-FREE join, verbatim. Its absence is what makes the recut non-vacuous. */
export const WATERMARK_FREE_JOIN = `             and fp.asset_account_code = jl.account_code and fp.active
           where jl.entry_id = new.id`;
