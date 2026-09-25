// #1114 — ONE ERRCODE, TWO MEANINGS. Migration: 0335_internal_refusal_errcode.sql.
//
// CLR10 was `bad-request` for BOTH of these, and the estate's own words say they are not the same
// kind of thing at all:
//
//   · `prepayment_source_unfit` / axis `prepaid_account_not_enrolled` (and its deferred-revenue
//     twin) is a REAL refusal a bookkeeper acts on. It carries `remedy`, `panel` and an account
//     code, and the Prepayments form renders it (`apps/web/lib/prepayments/schedule.ts`).
//   · `invalid_author` and the two `*_read_scope_required` tokens are INTERNAL WIRING ERRORS. The
//     wave-4 successor contracts say so in as many words — "an internal wiring error, never
//     shown: the successor always has the actor"
//     (`docs/plan/active/riders-2026-09-20/reports/wave4-lane04-ticket915.md:359,389`) — because
//     the only callers of those four doors are `clara_runtime` bodies that always hold the actor
//     and the scope.
//
// 0335 keeps CLR10 for the first and moves the second onto `CLR.callerContract` (CLR44), so a
// surface, a log line or a retry policy that branches on the CODE alone can no longer swallow a
// real refusal as an internal fault, or surface an internal fault as a refusal.
//
// NOT a test file: a frontier resolver, on the `prepayment-wake-reroute` / `schedule-term-
// correction` idiom. A STABLE STEM (`internal_refusal_errcode$`), never a number — numbers are
// claimed at merge (packages/db/README.md).

import { rootQuery, CLR } from "./rig-helpers.mjs";

/** The migration's own stable stem, probed at the live ledger rather than assumed. */
export const INTERNAL_ERRCODE_STEM = "internal_refusal_errcode$";

/** The preintegration gate module's variable, so the message can name it. */
export const INTERNAL_ERRCODE_GATE = "CLARA_ALLOW_MISSING_INTERNAL_REFUSAL_ERRCODE";

/**
 * THE FOUR SITES, as `[signature, token]`. This is the whole of 0335's change: four raises in four
 * bodies. The partition census walks exactly this list, so a fifth site added later without a
 * thought about which side of the partition it belongs on is visible rather than silent.
 */
export const CALLER_CONTRACT_SITES = [
  ["clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)", "invalid_author"],
  ["clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)", "invalid_author"],
  ["clara.read_prepayment_source_for(uuid,uuid,uuid)", "prepayment_read_scope_required"],
  ["clara.read_revenue_recognition_source_for(uuid,uuid,uuid)", "revenue_recognition_read_scope_required"],
];

/** The two renderable tokens that STAY on CLR10, and the doors' shared enrolment check that
 *  raises them. Named here so the distinctness assertions read as one contract. */
export const RENDERABLE_UNFIT = {
  prepayment: "prepayment_source_unfit",
  deferredRevenue: "deferred_revenue_source_unfit",
  notEnrolledAxis: "prepaid_account_not_enrolled",
  deferredNotEnrolledAxis: "deferred_account_not_enrolled",
};

let applied = null;
/** Is 0335 on this chain? Probed ONCE at the live ledger. */
export async function internalErrcodeApplied() {
  if (applied !== null) return applied;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    [INTERNAL_ERRCODE_STEM]);
  applied = Number(r.rows[0].n) > 0;
  return applied;
}

/**
 * The errcode the four caller-contract refusals carry ON THIS CHAIN.
 *
 * A FOCUSED run against a chain without 0335 FAILS LOUDLY rather than quietly measuring the old
 * code: the gate variable is set only by `internal-refusal-errcode-preintegration-gate.mjs`, which
 * an estate-wide sweep preloads and a focused invocation does not.
 */
export async function callerContractCode() {
  if (await internalErrcodeApplied()) return CLR.callerContract;
  if (process.env[INTERNAL_ERRCODE_GATE] !== "1") {
    throw new Error(
      "#1114 premise 0335_internal_refusal_errcode.sql is not applied (no "
      + `${INTERNAL_ERRCODE_STEM} row in clara.schema_migrations) and ${INTERNAL_ERRCODE_GATE} is `
      + "unset -- this is a FOCUSED run and must fail loudly, not measure the pre-#1114 code. "
      + "Preload ./tests/internal-refusal-errcode-preintegration-gate.mjs for an estate sweep "
      + "against a pre-0335 chain.");
  }
  return CLR.badRequest;
}

/** Every errcode literal a live body raises, as a `Set`, read off `pg_proc.prosrc`. The
 *  instrument the partition census uses; it reads the CATALOG, never the migration text, so a
 *  body recut by a later file is measured as it actually stands. */
export async function errcodesRaisedBy(signature) {
  const r = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [signature]);
  if (r.rows.length === 0) return null;
  return new Set((r.rows[0].src.match(/errcode\s*=\s*'([A-Z0-9]{5})'/g) ?? [])
    .map((m) => m.slice(m.indexOf("'") + 1, -1)));
}

/** Every `clara` body whose text raises the given errcode, by signature. Matched on the same
 *  whitespace-tolerant pattern the estate actually writes (`errcode='CLR10'` and
 *  `errcode = 'CLR10'` both occur), so the census cannot be defeated by a space. */
export async function bodiesRaising(errcode) {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc ~ ('errcode\\s*=\\s*''' || $1 || '''')
      order by 1`, [errcode]);
  return r.rows.map((x) => x.sig);
}
