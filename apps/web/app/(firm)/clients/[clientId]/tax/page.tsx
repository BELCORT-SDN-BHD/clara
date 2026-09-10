import { TaxWorkbenchPage } from "@/components/tax/TaxWorkbenchPage";

/**
 * "/clients/:clientId/tax" — one tab of the client workspace (P6-T, 裁-34).
 * Malaysia's SST and income-tax lifecycle for this client — a proposal/
 * receipt surface (裁-44), never a form. IA only on this tip: see
 * components/tax/TaxWorkbenchPage.tsx's header for the measured backend
 * state and why every panel is a static honest note.
 *
 * ===========================================================================
 * #627 STEP-1 INVENTORY — every tax-related read/operation this build found
 * (grep over packages/db/migrations for sst_/turnover/compliance_watch/
 * tax_computation/tax_period/cp204/form_c/statutory_deadlines, then read
 * against the live grant matrix), and its current disposition on this route.
 * A row's "human-reachable" column is a grant fact, not a UI opinion — this
 * ticket adds no migration, so every "not enabled" row below stays exactly
 * as unreachable after this train as before it. Distinct from a governed
 * OPERATION (acknowledge/snooze/resolve, turnover classification), which
 * this build keeps on its current surface with current permission, never
 * folded under a blanket read-only label.
 *
 * | Kind | Name | Migration:line | Role floor | Returns / effective-date & freshness | Web today? |
 * |---|---|---|---|---|---|
 * | READ | SST compliance watch, per (client, service_group) — `clara.list_review_queue`'s top-level `compliance` envelope object | 0016_a21_compliance_watch.sql:4558-4729 (envelope), splice-untouched by 0017/0041/0043 | viewer (0016:4563) | state, confirmed/unknown-mixed/screening-proxy cents, `earliest_crossing_month` + `application_due` (effective-dated), `future_method_status`; firm-wide `stale_evaluator` flags a compliance-eval run >48h old | YES — `lib/tax/sst-watch.ts` (this route) + `lib/firm-admin/compliance.ts` (`/settings/compliance`) |
 * | READ | `clara.compliance_watches` (the base table the envelope above is drawn from) | 0016_a21_compliance_watch.sql | none — carries NO `clara_authenticated` grant at all (only `clara_fn_owner`) | n/a | NO, and by design: the envelope above is the only human-reachable path to this state |
 * | OPERATION | `ack_compliance_watch(p_watch, p_rationale, p_op_key)` | 0016_a21_compliance_watch.sql:1047 | bookkeeper+ | receipt only (hydrate-never-trust; caller re-reads the envelope) | YES — `components/firm/compliance-watch-affordance.tsx`, wired both at the firm Needs-you row and this route's actionable watch row |
 * | OPERATION | `snooze_compliance_watch(p_watch, p_until, p_rationale, p_op_key)` | 0016_a21_compliance_watch.sql:1101 | bookkeeper+ (DB bounds `p_until` to (now, now+60d]) | receipt only | YES — same component |
 * | OPERATION | `resolve_compliance_watch(p_watch, p_conclusion, p_evidence, p_op_key)` | 0016_a21_compliance_watch.sql:1151 | bookkeeper+ for `registration_recorded`; admin+ for `not_liable_documented` | receipt only | YES — same component |
 * | OPERATION | `set_turnover_classification(p_client, p_account_code, p_classification, p_service_group, p_reason, p_evidence, p_effective_from, p_op_key)` | 0016_a21_compliance_watch.sql:905 (rank check :916) | bookkeeper+; admin+ additionally for a watch-LOWERING move (a per-call DB predicate, not a static floor) | receipt only; `p_effective_from` closes the predecessor row the day before, so history stays gapless | YES — `components/tax/TurnoverClassificationPanel.tsx`, gated by `lib/firm/capabilities.ts`'s `canClassifyTurnover` |
 * | READ | `clara.client_turnover_accounts` (the table the operation above writes) | 0016_a21_compliance_watch.sql | no reader RPC or view exists | n/a | NO — named gap: a classification can be recorded but not listed back yet (`TurnoverClassificationPanel`'s own note) |
 * | READ | `clara.sst_threshold_schedule` / `clara.sst_rate_schedule` (SST rate/threshold reference) | 0153_f_t1_sst_reference_tables.sql | none — zero `clara_authenticated` grant; only `clara_freeform_ro` (an internal read role, not a human session) | n/a | NO — the classification control instead sources its service-group choices from the client's own compliance envelope above, never this table |
 * | READ | `clara.statutory_deadlines` (developer-seeded, effective-dated statutory due dates, every domain) | 0139_statutory_deadlines.sql | none — zero `clara_authenticated` grant; the intended human reader `list_statutory_calendar` (its own PR-3) is UNBUILT | n/a | NO, and deliberately not built by this ticket — #612 Out of Scope excludes a new statutory-deadline calendar; this route does not invent that reader even though the table exists |
 * | (unbuilt) | Income-tax computation — `clara.evaluate_tax_computation_v1` | 0152_f_t3_pr_1_tax_platform.sql seeds ONLY developer platform law/add-back-class tables + a future refusal-vocabulary row (`tax_issue_unavailable`); the migration's own words: "PR-1 builds NO door at all" (:780) | n/a — no function exists | n/a | NO — no function, no grant, no call site |
 * | (does not exist) | CP204 estimate object; Form C object; any SST registration/taxable-period/return object | not in the catalog at any migration | n/a | n/a | NO |
 *
 * See components/tax/CapabilityBoundarySection.tsx for the one place this route explains
 * the "not enabled" rows above to the professional, and components/tax/TaxWorkbenchPage.tsx's
 * own header for the #627 change summary.
 * ===========================================================================
 */
export default async function ClientTaxPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <TaxWorkbenchPage clientId={clientId} />;
}
