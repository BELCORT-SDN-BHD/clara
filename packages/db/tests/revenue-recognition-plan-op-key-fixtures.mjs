// #1077 — THE DEFERRED-REVENUE LANE'S NESTED PLAN RESERVATION GETS A NAMESPACE OF ITS OWN.
// Migration: 0336_revenue_recognition_plan_op_key.sql.
//
// Both schedule lanes write their underlying accounting plan through 0193's own human door, and
// both used to derive the nested operation key the same way (`p_op_key || ':plan'`).
// `clara._reserve_op` keys a receipt on (firm, fn, op_key) and the fn for BOTH nested calls is
// `create_accounting_plan`, so one operation key spent on both lanes collided on a reservation
// neither caller can name and was answered `op_key reused with different args` under CLR10 with no
// detail at all. 0336 gives the deferred-revenue lane its own suffixes (`:rrplan`, `:rrend`) and
// leaves the prepayment lane's exactly as they were.
//
// NOT a test file: a frontier resolver, on the `internal-refusal-errcode` / `schedule-term-
// correction` idiom. A STABLE STEM, never a number — numbers are claimed at merge
// (packages/db/README.md).

import { rootQuery } from "./rig-helpers.mjs";

/** The migration's own stable stem, probed at the live ledger rather than assumed. */
export const RR_PLAN_OP_KEY_STEM = "revenue_recognition_plan_op_key$";

/** The preintegration gate module's variable, so a message can name it. */
export const RR_PLAN_OP_KEY_GATE = "CLARA_ALLOW_MISSING_RR_PLAN_OP_KEY";

/**
 * THE TWO NAMESPACES, as the doors actually derive them. A cell reads these rather than spelling
 * the literals inline, so "the deferred-revenue lane's suffixes are its own" is one statement in
 * one place and a third lane reaching for either is a visible edit.
 */
export const NESTED_KEY = {
  prepaymentPlan: ":plan",
  prepaymentEnd: ":end",
  deferredPlan: ":rrplan",
  deferredEnd: ":rrend",
};

/** The bodies 0336 recuts, by signature — the census walks exactly this list. */
export const DEFERRED_NESTING_BODIES = [
  "clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)",
  "clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)",
];

/** Their prepayment siblings, which keep `:plan` / `:end`. */
export const PREPAYMENT_NESTING_BODIES = [
  "clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)",
  "clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)",
];

let applied = null;
/** Is 0336 on this chain? Probed ONCE at the live ledger. */
export async function rrPlanOpKeyApplied() {
  if (applied !== null) return applied;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    [RR_PLAN_OP_KEY_STEM]);
  applied = Number(r.rows[0].n) > 0;
  return applied;
}

/**
 * Every `clara` body that derives `p_op_key || '<suffix>'`, by signature, read off `pg_proc.prosrc`
 * and matched on the whitespace the estate actually writes. The census instrument: it reads the
 * CATALOG, never a migration's text, so a body recut by a later file is measured as it stands.
 */
export async function bodiesDeriving(suffix) {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.prosrc ~ ('p_op_key[[:space:]]*\\|\\|[[:space:]]*''' || $1 || '''')
      order by 1`, [suffix]);
  return r.rows.map((x) => x.sig);
}
