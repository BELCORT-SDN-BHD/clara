// Slice-2 rig — meta-test checkers (NOT a test file). Structural sweeps over the
// catalog for the grant matrix (T17), agent EXECUTE-enumeration (T10b), definer
// hygiene (T18), and forced RLS on the governed tables (T18). Each returns an
// array of human-readable failure strings so the test bodies stay assertion-thin.

import { ROLES, rootQuery } from "./rig-helpers.mjs";

// The exact §5 EXECUTE matrix (v1 §5 as amended by v2 §A/§B/§F).
export const WRITERS = [
  "create_firm", "add_member", "set_member_role", "remove_member", "create_client", "upsert_account",
  // Slice-5 retires ingest_document; verified documents now enter through the
  // runtime intake finalizer and the legacy name retains no application grant.
  "record_client_resolution", "draft_entry", "approve_entry", "reverse_entry", "record_notification",
  "file_document", "retire_document_filing", "preview_wrong_client_correction",
  "propose_wrong_client_correction", "approve_wrong_client_correction",
  "confirm_attribution_candidate", "dismiss_attribution_candidate",
  "add_client_identifier", "add_client_alias", "retire_client_alias",
  "place_legal_hold", "release_legal_hold",
];
// get_context_pack is the Slice-3 typed read (design §2.6): STABLE security-invoker,
// granted to the same read audience as the other reads (clara_authenticated + agent_ro).
export const READS = ["get_journal_entry", "list_journal_entries", "trial_balance", "get_context_pack"];
// [S6 §9/C-11] Slice-6 (migration 0009) EXECUTE-grant deltas. Human lane keeps the bare
// get_journal_entry; the agent lane LOSES it (the client-pinned reads replace the same-firm
// entry oracle) but gains the four client-pinned reads + get_journal_entry_for. Runtime gains
// the invoice-facts lane writers + the coding-attempt recovery read.
const S6_HUMAN_FNS = [
  "revise_entry", "withdraw_draft", "open_coding_task", "complete_coding_task", "dismiss_coding_task",
  "list_unassigned_documents", "get_document_extract", "get_draft_review", "list_uncoded_filings",
  "get_journal_entry_for",
];
const S6_AGENT_READS = [
  "list_unassigned_documents", "get_document_extract", "get_draft_review", "list_uncoded_filings",
  "get_journal_entry_for",
];
const S6_RUNTIME_FNS = ["enqueue_invoice_facts", "persist_invoice_facts", "fail_invoice_facts", "get_coding_attempt"];
// [WAVE-A §2/§13a] Wave-A (migration 0011) EXECUTE-grant deltas, cross-checked EXACT
// against INTERFACE-PINS §2 (the per-role grant table) and the live catalog. The
// daily-loop governance writers + typed reads land on the human lane; the agent lane
// gains the client-pinned coding-lane reads + wake_client (+ the fix-round
// _agent_read_admitted gate helper, granted clara_agent_ro only); the autodraft/sweep
// runtime surface lands on clara_runtime; wake_interactive gains wake_open_question.
const WAVE_A_HUMAN_FNS = [
  "rename_counterparty", "add_counterparty_alias", "retire_counterparty_alias", "merge_counterparties",
  "request_autodraft", "acknowledge_sweep_run",
  "propose_coding_rule", "sign_coding_rule", "decline_coding_rule", "retire_coding_rule",
  "open_question", "resolve_open_question", "dismiss_open_question", "promote_clarify_to_question",
  "grant_client_egress", "revoke_client_egress", "approve_routine_entry",
  "get_sweep_run", "get_open_question", "get_coding_rule", "list_review_queue",
  "coding_lane", "list_coding_lanes", "get_entry_diff", "get_doc_entry_diff",
];
const WAVE_A_AGENT_READS = [
  "coding_lane", "list_coding_lanes", "get_entry_diff", "get_doc_entry_diff",
  "wake_client", "_agent_read_admitted",
];
const WAVE_A_RUNTIME_FNS = [
  "admit_autodraft_task", "begin_autodraft_task", "settle_autodraft_task",
  "open_sweep_run", "reconcile_sweep_runs",
  "list_autodraft_candidates", "list_document_autodraft_candidates", "get_document_for_human_read",
];
const WAVE_A_WAKE_INTERACTIVE_FNS = ["wake_open_question"];
// [WAVE-A2 §6/§7] posting-tier standing-rules human surfaces (PostgREST rpc, coarse
// grant to clara_authenticated; role floors are body-enforced): sign (admin+),
// propose/retire/acknowledge (bookkeeper+), and the rule/notification/receipt reads.
const WAVE_A2_HUMAN_FNS = [
  "sign_autopost_rule", "propose_autopost_rule", "retire_autopost_rule",
  "acknowledge_rule_posts", "get_rule_post_run", "list_autopost_rules", "list_notifications",
];
// [WAVE-A2 §6.2] the expiry/nudge sweep — runtime lane only (execute_rule_post is granted
// LOGIN-DIRECT to clara_runtime_login, like record_rule_resolution, so it is deliberately
// NOT in any of the five matrix roles).
const WAVE_A2_RUNTIME_FNS = ["reconcile_autopost_rules"];
// 0016 [WAVE-A2.1 pins P1/P3 §C]: the compliance-watch human writers + the human
// kind-override land on clara_authenticated (floors body-enforced); the SST evaluators
// + the classifier verdict writer are clara_runtime ONLY. The agent role gains ZERO
// EXECUTE anywhere in 0016 (tail-asserted in the migration itself).
const WAVE_A21_HUMAN_FNS = [
  "set_turnover_classification", "record_future_attestation", "ack_compliance_watch",
  "snooze_compliance_watch", "resolve_compliance_watch", "set_document_kind",
];
const WAVE_A21_RUNTIME_FNS = ["evaluate_sst_watch", "evaluate_sst_watches_all", "classify_document"];
// 0017 Block G2 exact named-grant matrix. The agent and both wake roles gain
// zero new EXECUTE; get_context_pack remains on its carried agent_ro grant.
const WAVE_B_HUMAN_FNS = [
  "retire_wiki_page",
  "begin_client_onboarding", "commit_client_onboarding", "cancel_client_onboarding",
  "resolve_onboarding_plan_item",
  "bootstrap_client_plan", // [R3-F2] the admin+ B-12 plan bootstrap for pre-0017 actives
  "create_opening_seed", "cancel_opening_seed", "draft_opening_item",
  "record_opening_target", "record_opening_keyed_resolution", // [AMB-0018-5] 0018 seed-bound keyed mint
  "seed_fixed_asset", "approve_opening_seed",
  "supersede_opening_item", "approve_opening_correction", "reopen_opening_seed",
  "get_opening_dryrun",
  "tick_seeding_proposal", "decline_seeding_proposal", "complete_seeding_batch",
  "cancel_seeding_batch", "get_lint_finding", "resolve_lint_finding",
];
const WAVE_B_RUNTIME_FNS = [
  "publish_wiki_page_version", "record_wiki_source_ingest",
  "set_wiki_synthesis_hold", "clear_wiki_synthesis_hold",
  "update_onboarding_plan", "record_opening_targets_parsed",
  "create_seeding_batch", "run_client_lint", "run_lint_all",
];
const WAVE_B_SHARED_READS = ["get_wiki_page", "list_wiki_pages", "trial_balance_as_of"];
export const ALLOWED = {
  // Slice-4 governance writers (contract v2.1 §3.2/3.3/3.5): human lane only.
  [ROLES.authenticated]: new Set([
    ...WRITERS, ...READS, "answer_interruption", "cancel_agent_task", "share_chat_session",
    "file_document", "retire_document_filing", "preview_wrong_client_correction",
    "propose_wrong_client_correction", "approve_wrong_client_correction",
    "confirm_attribution_candidate", "dismiss_attribution_candidate",
    "add_client_identifier", "add_client_alias", "retire_client_alias",
    "place_legal_hold", "release_legal_hold",
    ...WAVE_B_HUMAN_FNS, ...WAVE_B_SHARED_READS, // 0017 G2
    ...S6_HUMAN_FNS, // [S6 §9/C-11] draft-lifecycle + coding-task + client-pinned reads
    ...WAVE_A_HUMAN_FNS, // [WAVE-A §2] daily-loop governance writers + typed reads
    ...WAVE_A2_HUMAN_FNS, // [WAVE-A2 §6/§7] standing-rules writers + rule/notification/receipt reads
    ...WAVE_A21_HUMAN_FNS, // 0016 [A2.1 §C] compliance-watch human writers + set_document_kind
  ]),
  // [S6 §9/C-11] agent lane loses the bare get_journal_entry(uuid) oracle; keeps the other
  // reads and gains the client-pinned S6 reads + get_journal_entry_for.
  [ROLES.agentRo]: new Set([...READS.filter((r) => r !== "get_journal_entry"), ...S6_AGENT_READS, ...WAVE_A_AGENT_READS]),
  [ROLES.wakeInteractive]: new Set(["wake_draft_entry", "wake_record_client_resolution", "wake_record_notification", ...WAVE_A_WAKE_INTERACTIVE_FNS]),
  [ROLES.wakeProactive]: new Set(["wake_record_notification"]),
  // Slice-4 runtime surface (contract v2.1 §3.0/3.6/3.7/3.8): runtime lane only.
  [ROLES.runtime]: new Set([
    "mint_wake_credential", "revoke_wake_credential",
    "resolve_chat_principal", "begin_chat_turn", "settle_chat_turn", "prune_trace_spans", "relay_health",
    // Slice-4 as-built round 2 (S4-AB4/AB6): atomic clarify open + per-segment checkpoints.
    "open_interruption", "checkpoint_turn",
    "create_document_intake", "claim_document_intake_upload", "mark_document_intake_received",
    "begin_document_intake_verification", "verify_document_intake", "fail_document_intake",
    "finalize_document_intake", "upgrade_legacy_document", "claim_document_processing_task",
    "release_held_document_tasks", "requeue_stranded_document_task",
    "persist_document_extraction", "complete_stored_document_task",
    "reserve_document_ingest", "resize_ingest_reservation", "settle_ingest_reservation",
    "refund_ingest_reservation", "record_attribution_attempt",
    ...WAVE_B_RUNTIME_FNS, ...WAVE_B_SHARED_READS, // 0017 G2
    ...S6_RUNTIME_FNS, // [S6 §9/C-11] invoice-facts lane writers + coding-attempt recovery read
    ...WAVE_A_RUNTIME_FNS, // [WAVE-A §2] autodraft admission/settle + sweep-run + candidate reads
    ...WAVE_A2_RUNTIME_FNS, // [WAVE-A2 §6.2] the autopost expiry/nudge reconcile sweep
    ...WAVE_A21_RUNTIME_FNS, // 0016 [A2.1 §C] SST evaluators + classify_document (runtime ONLY; agent zero)
  ]),
};
// RLS policy helpers are legitimately callable broadly (a policy expression runs
// as the querying role); their exact grant set is out of scope for the strict
// matrix — but they must still never be granted a PUBLIC EXECUTE.
export const RLS_HELPERS = new Set([
  "current_actor_id", "actor_firm_id", "actor_role", "actor_role_rank", "actor_is_human", "role_rank",
]);

// Governed firm-scoped tables (v2 §H point 6 excludes slice1_smoke / schema_migrations).
export const GOVERNED_TABLES = [
  "firms", "firm_memberships", "clients", "coa_accounts", "documents", "client_resolutions",
  "journal_entries", "journal_lines", "fixed_assets", "notifications", "audit_log", "op_receipts",
  "freeform_read_log", "wake_credentials", "wake_fn_allowlist", "firm_admissions", "users",
  // Slice-3 event spine (event-spine contract §2 — all owned by clara_fn_owner, FORCE RLS).
  "event_types", "firm_event_seq", "domain_events", "taxonomy_versions", "trigger_taxonomy",
  "taxonomy_active", "wake_intents", "relay_checkpoints", "relay_dead_letters",
  // Slice-4 runtime core (contract v2.1 §3 — all owned by clara_fn_owner, FORCE RLS).
  "agent_tasks", "agent_interruptions", "wakes_outbox", "chat_sessions", "chat_messages",
  "firm_limits", "firm_usage_daily", "task_usage", "trace_spans", "trace_prune_log",
  "runtime_heartbeats",
  // Slice-5 document pipeline (contract v1.2 companion §3).
  "document_filings", "document_intakes", "document_processing_tasks",
  "document_extractions", "document_regions", "client_identifiers", "client_aliases",
  "attribution_attempts", "attribution_candidates", "attribution_candidate_regions",
  "filing_corrections", "filing_correction_items", "firm_document_limits",
  "document_ingest_reservations",
];

// The ONLY clara base tables that legitimately carry no RLS (migration bookkeeping + the
// Slice-1 placeholder). Everything else in the schema MUST be RLS-enabled AND forced.
export const RLS_EXEMPT = new Set(["schema_migrations", "slice1_smoke"]);

/** Functions `role` can EXECUTE outside pg_catalog + clara (should be none). */
async function reachableOutsideClara(role) {
  const r = await rootQuery(
    `select n.nspname, p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where has_function_privilege($1, p.oid, 'execute')
        and n.nspname not in ('pg_catalog', 'information_schema', 'clara')`,
    [role],
  );
  return r.rows.map((row) => `${role}: ${row.nspname}.${row.proname}`);
}

/** T10b — the read/agent AND wake roles reach nothing executable outside
 * pg_catalog + clara. Enumerating the wake roles too (v2 §I) closes the gap where
 * a wake lane could reach a side-effecting function in another schema. */
export async function agentReachableOutsideClara() {
  const roles = [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive];
  const leaks = [];
  for (const role of roles) leaks.push(...(await reachableOutsideClara(role)));
  return leaks;
}

/** Read-only context helpers referenced directly in an RLS policy expression. A
 * policy's USING/WITH CHECK runs as the QUERYING role, so any fn it calls MUST be
 * caller-EXECUTEable — that is legitimate, not an over-grant. We DERIVE this set
 * from pg_policies rather than hard-coding it, so lane-M's split-lane read design
 * (jwt_firm human / wake_firm agent / jwt_sub / shares_my_firm_* / *_role_rank) is
 * recognised without rubber-stamping: a writer/core/assert fn is never referenced
 * by a policy, so it can never be laundered into the allowlist this way. */
async function policyHelperNames() {
  const r = await rootQuery(
    `select distinct (regexp_matches(coalesce(qual,'') || ' ' || coalesce(with_check,''), 'clara\\.([a-z_][a-z0-9_]*)', 'g'))[1] as fn
       from pg_policies where schemaname = 'clara'`,
  );
  return new Set(r.rows.map((row) => row.fn));
}

/** T17 — exact per-role EXECUTE + no PUBLIC leak + helpers/cores not app-callable.
 * Legit = the §5 writer/read matrix ∪ the fns actually referenced in RLS policies. */
export async function grantMatrixFailures() {
  const policyHelpers = await policyHelperNames();
  const allowedBroadly = new Set([...RLS_HELPERS, ...policyHelpers]);
  const fns = await rootQuery(
    `select p.oid::int8 as oid, p.proname,
            (p.proacl is null
             or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'`,
  );
  const roles = Object.keys(ALLOWED);
  const failures = [];
  for (const f of fns.rows) {
    if (f.public_exec) failures.push(`PUBLIC has EXECUTE on clara.${f.proname}`);
    if (allowedBroadly.has(f.proname)) continue;
    for (const role of roles) {
      const priv = await rootQuery("select has_function_privilege($1, $2::oid, 'execute') as ok", [role, f.oid]);
      const expected = ALLOWED[role].has(f.proname);
      if (priv.rows[0].ok !== expected) {
        failures.push(`${role} EXECUTE clara.${f.proname}: expected ${expected}, got ${priv.rows[0].ok}`);
      }
    }
  }
  return failures;
}

/** T18 — every SECURITY DEFINER fn pins search_path and is owned by clara_fn_owner. */
export async function definerHygieneFailures() {
  const bad = await rootQuery(
    `select p.proname, pg_get_userbyid(p.proowner) as owner
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosecdef
        and (p.proconfig is null
             or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
             or pg_get_userbyid(p.proowner) <> $1)`,
    [ROLES.fnOwner],
  );
  return bad.rows.map((r) => `${r.proname} (owner=${r.owner})`);
}

/** T18 — governed tables have RLS ENABLED and FORCED. Derives the full clara base-table
 * set and excludes RLS_EXEMPT, so a NEW table that forgets FORCE RLS can never silently
 * escape the sweep — AND every GOVERNED_TABLES entry (incl. the nine Slice-3 tables) must
 * actually EXIST (a missing one is a real defect the derive-only check can't catch). */
export async function governedRlsFailures() {
  const rows = await rootQuery(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relkind = 'r'`,
  );
  const present = new Map(rows.rows.map((r) => [r.relname, r]));
  const problems = [];
  // (a) every governed table must EXIST and be RLS-forced.
  for (const tbl of GOVERNED_TABLES) {
    const r = present.get(tbl);
    if (!r) problems.push(`${tbl}: MISSING from schema clara`);
    else if (!r.relrowsecurity || !r.relforcerowsecurity) problems.push(`${tbl}: rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`);
  }
  // (b) any OTHER clara base table (a future one) must be forced too, unless explicitly exempt.
  const governed = new Set(GOVERNED_TABLES);
  for (const r of rows.rows) {
    if (governed.has(r.relname) || RLS_EXEMPT.has(r.relname)) continue;
    if (!r.relrowsecurity || !r.relforcerowsecurity) {
      problems.push(`${r.relname} (unlisted): rls=${r.relrowsecurity} force=${r.relforcerowsecurity} — add to GOVERNED_TABLES or RLS_EXEMPT`);
    }
  }
  return problems;
}
