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
// 0055 [Wave E lane α]: the ONE human door of the client-facts trio (admin floor,
// body-enforced). Absent on pre-0055 frontiers — existence is the gate.
const CLIENT_FACTS_0055_HUMAN_FNS = ["record_client_fact"];
// 0056 [Wave E lane β]: the close model's twelve human doors — the two period verbs
// (key ①, admin floor), the four close verbs + reopen (keys ②③, capability-gated
// in-body), the three reads (B6 revoked the agent grants: JWT context is not wake
// context), and the two E-R11 capability verbs (owner-LITERAL floor in-body).
// Agent + wake + runtime gain ZERO — 0056's S11.5 sweep asserts it in-migration.
const CLOSE_MODEL_0056_HUMAN_FNS = [
  "propose_fiscal_year", "open_fiscal_year",
  "begin_close", "attest_close_exception", "finalize_close", "abandon_close",
  "reopen_fiscal_year",
  "verify_close", "get_close_readiness", "list_fiscal_years",
  "grant_firm_capability", "revoke_firm_capability",
];
// 0057 [Wave E lane gamma]: the period registry + month snapshots. ONE write door
// (mint_month_snapshot, bookkeeper floor body-enforced) and THREE reads. The agent, both
// wake roles and clara_runtime gain ZERO — 0057's S11.5 sweep asserts it in-migration, and
// this roster is the second, independent instrument that says so.
//
// THE AGENT ROW IS EMPTY DELIBERATELY. Skeleton §2.10's grant table names snapshot_state for
// clara_agent_ro; 0057 follows lane beta's B6 ruling instead, which revoked the agent grants
// on the close reads because a _human_ctx-gated read granted to a role that carries no JWT
// is a DARK grant — it reads as access and refuses at runtime with CLR04. Measured on the
// rig: verify_close, get_close_readiness and list_fiscal_years are all agent_ro=false.
// If the owner rules the other way, the fix is additive (one grant, or the dual-lane
// wake-secret idiom get_context_pack uses) and this list is where it lands.
const REGISTRY_0057_HUMAN_FNS = [
  "mint_month_snapshot", "snapshot_state", "verify_snapshot", "days_in_period",
];
// A COHORT, for the same reason 0020's block states: this matrix is a CLOSED SET whose
// default is "no role may execute anything unlisted", so cohortFailures() catches a name
// that silently VANISHES from the catalog while its exemption lives on here.
const REGISTRY_0057_COHORT = [...REGISTRY_0057_HUMAN_FNS];
// 0058-0061 [Wave E lane delta]: the metric algebra + evaluator. ELEVEN names on
// clara_authenticated and NOTHING anywhere else — the agent, both wake roles, clara_runtime and
// both non-inheriting login shells gain ZERO EXECUTE across all four files, which delta's own
// security tail asserts in-migration (its v_entrypoints loop refuses if any of them holds EXECUTE)
// and which this roster is the second, independent instrument for.
//
// WHAT EACH GROUP IS, because "eleven granted verbs" is not self-explaining: four are the metric
// definition LIFECYCLE (propose is a draft; approve carries the admin floor AND PRD §2's
// approver-≠-proposer segregation; reject and supersede are owner-floored) — every floor is
// body-enforced, so the grant is a door, never the authority. create_account_set_v1 and
// mint_metric_input_snapshot_v1 mint the two frozen inputs an evaluation reads. evaluate_metric_v1
// and evaluate_fs_pack_v1 are the evaluator itself; assess_metric_cell_independent_v1 is the
// INDEPENDENT re-check (E6), a separate frozen closure that reads only immutable facts.
// verify_evaluator_freeze is a VERIFIER, not a writer — it is granted because a human needs to be
// able to ask whether the deployed closure still matches its registration, and it writes nothing.
// record_metric_evaluation_attempt_v1 is the A30b receipt writer: a cap or timeout boundary that
// precludes a truthful cell records an immutable attempt receipt instead of a fabricated number.
//
// THE AGENT AND WAKE ROWS ARE EMPTY BY RULING, not by omission. The owner's delta-v1 wake-identity
// ruling keeps evaluation authenticated-human-only; lane eta's wake wrappers reach these bodies as
// internal ungranted calls under clara_fn_owner and never by a grant of their own.
const METRICS_0058_HUMAN_FNS = [
  "create_account_set_v1", "mint_metric_input_snapshot_v1",
  "propose_metric_definition", "approve_metric_definition",
  "reject_metric_definition", "supersede_metric_definition",
  "evaluate_metric_v1", "evaluate_fs_pack_v1",
  "assess_metric_cell_independent_v1", "record_metric_evaluation_attempt_v1",
  "verify_evaluator_freeze",
];
// A COHORT for the same closed-set reason as 0057's: these eleven ship together across 0059/0060
// and must live or die together, so a name that silently vanishes while its exemption survives
// here is a finding rather than a quiet pass.
const METRICS_0058_COHORT = [...METRICS_0058_HUMAN_FNS];
// 0064 [Wave E lane theta]: the close-plan-as-document read. ONE name on
// clara_authenticated -- the /close consumer (closeApi.ts's getClosePlan, called
// from close/page.tsx). Originally authored with clara_agent_ro granted too (the
// design skeleton's own §4 text: "Granted to clara_authenticated and
// clara_agent_ro (read)") -- T17 caught it, and this row is the fix: grepped
// across packages/runtime and the whole repo, nothing outside this lane's own
// files calls clara.get_close_plan, so the agent grant was speculative
// surface-widening (the ADR-0070 ruling 8 shape, the declined speculative
// cores) and was REVOKED from the migration itself, not merely left unlisted
// here.
//
// THE AGENT ROW IS EMPTY DELIBERATELY -- the same 0057/B6 shape (see that
// block above): the function's own resolver (clara.actor_firm_id(), 0002:
// 440-443) stays dual-lane-capable on purpose, so re-adding clara_agent_ro's
// EXECUTE grant WHEN a real agent-lane consumer ships is a one-line grant
// statement in the migration plus a one-line addition here naming that
// consumer -- no resolver rewrite needed either side of that boundary.
const CLOSE_PLAN_0064_HUMAN_FNS = ["get_close_plan"];
// 0065-0072 [Wave E lane ε] the FS reporting layer's ten audited doors. Same closed-set reason as
// 0057's and 0058's: they ship together across four of the eight files and must live or die
// together, so a name that vanishes while its exemption survives here is a finding, not a pass.
const REPORTING_0065_HUMAN_FNS = [
  "publish_house_style_version", "publish_report_template_version",
  "publish_chart_template_version", "draft_report_spec",
  "open_report_run", "assess_report_claim", "seal_report_dataset",
  "seal_report_artifact", "approve_report_for_issue", "verify_report_artifact",
];
const REPORTING_0065_COHORT = [...REPORTING_0065_HUMAN_FNS];
// 0079-0083 [Wave E lane ζ] the render queue. Same closed-set discipline as ε's block above: the
// estate roster must NAME every function that holds a grant, so a sanctioned addition is a
// reviewed line here rather than a surprise in the sweep.
//
// THE RUNTIME ROSTER — the render worker's and the leader's whole surface, counted from the array
// below rather than spelled as a number in this sentence, because the number has now been wrong
// twice. clara_runtime holds NO table privilege on clara.render_jobs (not even SELECT), so these
// verbs ARE the queue's reachable API, and each names its consumer:
//   claim_render_job            · the worker takes one job (for update skip locked)
//   render_job_payload          · the worker reads ONLY what its claimed job pins (lease-scoped)
//   complete_render_job         · the worker's one write — seals through ε's _seal_report_artifact_core
//   fail_render_job             · the worker records why a render did not happen
//   render_lease_alive          · the worker's own fence: does it still hold this job (0079)
//   render_dispatch_begin       · the LEADER's due-read + attempt stamp (the Law-1 touch)
//   render_dispatch_record      · the leader's outcome receipt for that attempt
//   reap_exhausted_render_jobs  · queue hygiene: park the crash-only jobs stuck at their cap
//   enqueue_missing_render_jobs · the leader's fallback enqueue when ε's seal call was missed
const RENDER_ZETA_RUNTIME_FNS = [
  "claim_render_job", "render_job_payload", "complete_render_job", "fail_render_job",
  "render_dispatch_begin", "render_dispatch_record", "enqueue_missing_render_jobs",
  // The FENCE reads a boolean and writes nothing: it is what lets a render that outran its lease
  // discover the job is no longer its own BEFORE it spends money finishing bytes the seal would
  // refuse. It is not a grace period — the reap is immediate; this is the worker stopping itself.
  "render_lease_alive",
  // And the reap, which moved OUT of render_dispatch_begin so queue hygiene runs even on a
  // deployment whose dispatch is deliberately unwired (the scheduled-machine fallback).
  "reap_exhausted_render_jobs",
];
// THE HUMAN ONES (migration 0079, the two doors a person calls). replay_render_inputs is the DR §10
// seven-year drill's executable door: it returns a sealed artifact's OWN pinned inputs so an
// operator can re-render and compare — STABLE, writes nothing, enqueues nothing.
// requeue_render_job is the lawful way out of a terminal failure: it mints a SUCCESSOR job (the
// failed row stays immutable) and records the predecessor and the operator's reason.
// Both are deliberately NOT runtime-granted: a recovery instrument must not become a second path
// the worker can walk, and nothing machine-side gets to decide that a failure deserves another
// paid render.
const RENDER_ZETA_HUMAN_FNS = ["replay_render_inputs", "requeue_render_job"];
// The internals stay ungranted to every application role and are asserted so in-migration:
// render_request_manifest_v1, enqueue_render_job (ε's seal calls it), _tf_render_job_lifecycle.
const RENDER_ZETA_COHORT = [...RENDER_ZETA_RUNTIME_FNS, ...RENDER_ZETA_HUMAN_FNS];
// 0077-0078 [Wave E lane η] the ad-hoc authoring lane's granted surface: the FOUR wake wrappers,
// EXECUTE to clara_wake_interactive and to nothing else, each carrying an interactive-only
// clara.wake_fn_allowlist row. Same closed-set reason as the blocks above — they ship as one
// grant matrix across the pair's second file and must live or die together.
//
// The THREE cores those wrappers delegate to (_eta_compose_metric_preview_core,
// _eta_save_metric_definition_draft_core, _eta_request_report_preview_core) are deliberately
// ABSENT from every roster in this file, exactly as ε's two internal cores are: they are granted
// to nobody, so the sweep's expected=false IS the assertion that the wrappers are the only door.
// That absence is load-bearing twice over — it is also what keeps δ's four-app-executable-
// definition-writer census at four, since every INSERT in this lane lives inside those cores.
// list_metric_catalog appears nowhere here on purpose: it is an RLS-scoped SELECT the agent role
// already reads, and the lane creates no function and no grant for it.
const AUTHORING_0077_WAKE_FNS = [
  "wake_compose_metric_preview", "wake_save_metric_definition_draft",
  "wake_draft_report_spec", "wake_request_report_preview",
];
const AUTHORING_0077_COHORT = [...AUTHORING_0077_WAKE_FNS];
// [F-A2 PR-1] THE POSTING WRAPPER, and it is one name because that is the whole surface. The
// ladder (clara._agent_post_entry_core), the extracted control-leg predicate, the projected
// supplier floor, the counterparty projection and the receipt trigger function are ABSENT from
// every roster in this file on purpose — granted to nobody, so the sweep's expected=false IS the
// assertion that this wrapper is the only door, exactly as η's cores are handled above. No
// cohort entry: this lane adds ONE granted function, and the sweep only ever consults names that
// exist in the live catalog, so an earlier-frontier database never reads this row at all.
const POSTING_F_A2_WAKE_FNS = ["wake_post_entry"];
// 0090-0095 [Wave-F Track A, F-A1] the LLM witness-pair lane. Same closed-set discipline as the
// blocks above, and its own cohort per the "wholly present or wholly absent" rule (0024's note):
// folding these into an earlier migration's cohort would make a pre-F-A1 database report a
// PARTIAL cohort — a false failure several migrations early.
//
// THE RUNTIME ROSTER — three names, each with its consumer:
//   record_llm_usage_event   · 0094. PR-2's runtime meters a model call AT CALL TIME, including a
//                              call that never reaches a persist. Runtime-only because it is the
//                              worker's own receipt; no human writes metering.
//   persist_witness_facts    · 0095. The atomic idempotent two-row persist — the persist_invoice_
//                              facts precedent exactly (a task-bound runtime writer).
//   witness_citation_regions · 0095. The ONE citation numbering, published so PR-2's prompt
//                              builder can number regions against the identical query the server
//                              resolves a citation with. Runtime-only for the same reason the
//                              writer is: it exists to serve the worker mid-call, and a human
//                              read of the same rows already goes through get_document_extract.
// NO HUMAN NAMES: F-A1 adds no human door. clara_authenticated's F-A1 surface is a table SELECT
// on clara.llm_usage_events (RLS-scoped), not an EXECUTE, so it belongs to no roster here.
// The INTERNALS stay ungranted to every application role and are asserted so in-migration:
// _witness_answers_ok, _witness_resolve_citation, evaluate_witness_fact_state_v1,
// evaluate_witness_identity_v1 — the sweep's expected=false IS that assertion.
const WITNESS_F_A1_RUNTIME_FNS = [
  "record_llm_usage_event", "persist_witness_facts", "witness_citation_regions",
];
const WITNESS_F_A1_COHORT = [...WITNESS_F_A1_RUNTIME_FNS];
// F-A1 PR-3 (the cutover migration, numbered 0097 at merge -- its own cohort per the
// "wholly present or wholly absent" rule, same reasoning as WITNESS_F_A1_COHORT above): the
// settle verb for a running llm_witness task. Mirrors fail_invoice_facts (S6_RUNTIME_FNS) --
// the SAME task-bound runtime-only shape -- so it is clara_runtime-only EXECUTE, no human door.
const WITNESS_F_A1_PR3_RUNTIME_FNS = ["fail_witness_facts"];
const WITNESS_F_A1_PR3_COHORT = [...WITNESS_F_A1_PR3_RUNTIME_FNS];
// F-A1 PR-4 — the bank-statement witness cutover. Its OWN cohort rather than an addition to
// BANK_0038_*, and that is not cosmetic: `cohortFailures` tolerates a WHOLLY absent cohort (a
// chain that stops short of this wave) but fails a PARTIAL one, so folding these two names
// into the 0038 lists would red every pre-PR-4 database — measured, not assumed (the first cut
// did exactly that and the baseline chain caught it).
//   persist_statement_facts_v2 — the witness-pair task wrapper for the `statement_facts` lane,
//     granted to clara_runtime on the same terms as its v1 sibling (which keeps serving
//     `statement_parse`; the human/structured cores are unmoved).
//   _persist_statement_core_v2 — the spliced successor core. UNGRANTED to every application
//     role (the one-ungranted-core law, 0004:6-12); declaring it here is what makes a future
//     accidental grant FAIL rather than pass silently.
const STATEMENT_F_A1_PR4_RUNTIME_FNS = ["persist_statement_facts_v2"];
const STATEMENT_F_A1_PR4_UNGRANTED_FNS = ["_persist_statement_core_v2"];
export const STATEMENT_F_A1_PR4_COHORT = [
  ...STATEMENT_F_A1_PR4_RUNTIME_FNS, ...STATEMENT_F_A1_PR4_UNGRANTED_FNS,
];
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
  // 0019 [§3, amendment 8]: the stale-mark writer is runtime-ONLY. Listing it
  // here is what makes the rig-isolation grant matrix cover it — the human,
  // agent and both wake lanes must show EXECUTE=false for it.
  "mark_wiki_citations_stale",
];
const WAVE_B_SHARED_READS = ["get_wiki_page", "list_wiki_pages", "trial_balance_as_of"];

// ---------------------------------------------------------------------------
// 0020 [§7.1/§8] TYPED EGRESS CONSENT — the capability COHORT.
//
// WHY A COHORT AND NOT EIGHT LOOSE NAMES. This matrix is a CLOSED SET whose default
// is "no role may execute anything unlisted", so a new migration's functions have to
// be admitted by EXPLICIT ENUMERATION — that is the design, and it is what makes an
// accidental grant to the wrong lane a test failure rather than a silent widening.
// The compensating assertion for that widening lives in grantMatrixFailures below:
// the cohort must be WHOLLY present or WHOLLY absent. Wholly absent = 0020 is not
// applied on this database (the 19-migration rig), so the roster is skipped and this
// file stays correct at 19 and at 20+ alike. PARTIALLY present = an enumerated name
// no longer resolves — a DEAD exemption, which must be removed or the function
// restored, so the closed set cannot silently accumulate them.
//
// The wiki half of 0020's authorization (four of these verbs — activate/deactivate/
// revoke_client_egress_purpose and resolve_and_ingest_wiki_source — reach wiki state
// by CALLING the audited governed writers) is NOT re-asserted here; a grant matrix is
// the wrong currency for it. Its teeth are the call-edge-only / no-relation-access
// assertions in wave-b/wb-0019-tail, wave-b/wb-0019-ratchet [R1-4] and the live
// ceremony probe deploy/wave-b-0019-postverify.sql probe 9.
const WAVE_B_0020_RUNTIME_FNS = [
  "prepare_egress_dispatch", "consume_egress_dispatch",
  "resolve_document_client", "resolve_and_ingest_wiki_source",
];
// The owner floor (admin+) is enforced INSIDE each body; the grant itself is the
// coarse PostgREST-rpc grant to clara_authenticated, the WAVE_A2_HUMAN_FNS pattern.
// classify_consent_evidence_document is the 2026-07-25 ratified §7.1 amendment (ratchet R1-F3):
// the OWNER path that stamps document_kind='consent_evidence' and grants NO egress. Before it,
// the only live writer of that stamp was the LEGACY grant_client_egress, which in the same call
// mints a purpose-blind consent authorizing invoice-facts egress — so the runbook's step 1 could
// not be run at all for a client who consented ONLY to wiki synthesis.
// 0021 [§the human counterparty lane] — the standalone counterparty writer. Before it, a
// counterparty could only be born inside approve_entry's proposed_counterparty path, so a
// carry-down could not seed opening payables/receivables at takeover (both open-item kinds
// require a counterparty_id and no entry exists yet). Found on the Bee Creative live-gate
// run; the prior Gate-K client had no payables, so ap_open_item had never executed.
// HUMAN LANE ONLY — bookkeeper floor, same as upsert_account: reference data, not money.
const WAVE_B_0021_HUMAN_FNS = ["create_counterparty"];

// 0022 [the extraction slice, block X1] — two human verbs, both HUMAN-LANE ONLY and for
// different reasons worth stating:
//   request_reextraction (bookkeeper floor, ADR-047 Q2) — the re-extraction path that did
//     not exist in 0001..0021, so a corrected mapper could never reach the 29 documents
//     already extracted. Its ONLY cost bound is that no machine role can execute it
//     (ADR-047 Q4 declined a numeric cap), which makes this roster entry load-bearing
//     rather than bookkeeping: clara_runtime / clara_agent_ro / both wake lanes must all
//     show EXECUTE=false, or a sweep could spend Azure pages in a loop.
//   set_firm_high_stakes_threshold (owner floor) — pays the PR #109 debt, where the
//     RM10,000 -> RM100,000 change had to ship as a hand-run SQL file because no governed
//     verb existed. Raising the threshold widens what one person may approve alone.
const EXTRACTION_0022_HUMAN_FNS = ["request_reextraction", "set_firm_high_stakes_threshold"];

// 0024 — clara.fail_classify, the classify lane's missing DB terminal-fail path (ADR-030
// deferred hardening). Granted to clara_runtime alone, mirroring fail_invoice_facts
// (S6_RUNTIME_FNS above) — the SAME lane that already holds claim_document_processing_task
// and classify_document for this lane (classify.mjs: "This worker runs entirely as
// clara_runtime … NO login-direct dance"). Its own cohort per the 0020/0022 "wholly present
// or wholly absent" discipline: folding it into an earlier migration's cohort would make a
// 23-migration database report a PARTIAL cohort, a false failure one migration early.
const FAIL_CLASSIFY_0024_RUNTIME_FNS = ["fail_classify"];
export const FAIL_CLASSIFY_0024_COHORT = [...FAIL_CLASSIFY_0024_RUNTIME_FNS];

// 0028 — the vendor identity binding ceremony (task #36). All five verbs are
// clara_authenticated, role-floored in-body (bookkeeper for propose/revoke/reads,
// admin for sign) — same posture as the 0016 autopost-rule ceremony. Its own
// cohort per the "wholly present or wholly absent" discipline (see 0024's note
// above): folding it into 0027's would make a 28-migration database report a
// PARTIAL cohort one migration early.
const VENDOR_BINDING_0028_HUMAN_FNS = [
  "propose_vendor_identity_binding", "sign_vendor_identity_binding",
  "revoke_vendor_identity_binding", "list_vendor_bindings", "get_vendor_binding",
];
export const VENDOR_BINDING_0028_COHORT = [...VENDOR_BINDING_0028_HUMAN_FNS];

// 0037 — the Wave C-a subledger (design: docs/plan/completed/wave-c-a-subledger-design.md §4.9).
// Four human composites, clara_authenticated ONLY (bookkeeper floor in-body): which
// obligation a payment discharges is a judgement, and the agent never makes one — no
// wake role, no runtime, no agent_ro. Its own cohort per the "wholly present or wholly
// absent" discipline. The UNGRANTED names are declared the 0020 way: the main sweep
// fails if one ever GAINS a grant, the cohort check fails if one ever DISAPPEARS.
const SUBLEDGER_0037_HUMAN_FNS = [
  "allocate_receipt", "allocate_payment", "unallocate_group", "apply_open_items",
];
const SUBLEDGER_0037_UNGRANTED_FNS = [
  "_subledger_outstanding", "_subledger_allocated_items_present",
  "_subledger_classify_entry", "_subledger_on_approve", "_subledger_decompose_preview",
  "_assert_customer_receipt_shape_at", "_assert_supplier_payment_shape_at",
  "_assert_customer_receipt_shape", "_assert_supplier_payment_shape",
  "_tf_assert_customer_receipt_shape", "_tf_assert_supplier_payment_shape",
  "_tf_subledger_entry_belt", "_tf_subledger_item_belt", "_tf_subledger_alloc_belt",
  "_tf_open_items_validate",
];
export const SUBLEDGER_0037_COHORT = [
  ...SUBLEDGER_0037_HUMAN_FNS, ...SUBLEDGER_0037_UNGRANTED_FNS,
];

// 0038 Wave C-b (WCB-R1..R6, design v2.1). The bank verbs are HUMAN JUDGEMENT ONLY --
// which entry a bank line clears is a judgement, and the agent never makes one: no wake
// role, no clara_agent_ro. The two statement-facts writers are the workflow's own
// (clara_runtime), the persist_invoice_facts precedent. UNGRANTED internals declared the
// 0020 way: the main sweep fails if one ever GAINS a grant, the cohort check fails if one
// ever DISAPPEARS.
const BANK_0038_HUMAN_FNS = [
  "add_bank_account", "deactivate_bank_account", "reactivate_bank_account",
  "remap_bank_account_coa", "enter_bank_statement", "void_bank_statement",
  "match_bank_line", "unmatch_bank_match", "settle_from_bank_line", "complete_pending_match",
];
const BANK_0038_RUNTIME_FNS = ["persist_statement_facts", "fail_statement_facts"];
const BANK_0038_READ_FNS = [
  "list_bank_accounts", "list_bank_account_proposals", "list_bank_statements",
  "get_bank_statement", "list_open_items_by_counterparty", "list_bank_match_candidates",
];
const BANK_0038_UNGRANTED_FNS = [
  "_assert_bank_coa_candidate", "_bank_entry_side_capacity", "_bank_live_match_present",
  "_bank_live_statement_on_document", "_bank_match_adjustment_entry", "_bank_match_audit",
  "_bank_match_coa", "_persist_statement_core", "_stmt_header_norm", "_stmt_lines_norm",
  "_tf_bank_match_congruence", "_tf_bank_match_entry_exhaustion", "_tf_bank_match_group_tie",
  "_tf_bank_statement_belt", "_tf_bank_statement_void_belt", "_tf_je_bank_match_reversal_belt",
  "_tf_stamp_bmlm_account", "_tf_je_bank_pending_orphan_belt", "_tf_bank_member_no_delete",
  "_tf_bank_statement_transition", "_tf_bank_statement_no_delete",
];
export const BANK_0038_COHORT = [
  ...BANK_0038_HUMAN_FNS, ...BANK_0038_RUNTIME_FNS, ...BANK_0038_READ_FNS,
  ...BANK_0038_UNGRANTED_FNS,
];

// 0040 Wave C-c (WCC-R1..R8, design v2.1). The tie-out, exception-door and rule verbs are
// HUMAN JUDGEMENT ONLY -- whether a month ties, whether a bank line is a bank error, and
// whether a coding pattern becomes a signed rule are all professional judgements, and the
// agent never makes one: no wake role, no clara_runtime, no clara_agent_ro (design SS10,
// "zero agent grants on every new table", restated for the verbs that write them). The TEN
// reads are the /bank + /aging surface, definer + _human_ctx(bookkeeper) + firm predicates
// (verify_bank_reconciliation joined at the 0040 fix wave, item A7).
// UNGRANTED internals declared the 0020 way: the main sweep fails if one ever GAINS a grant,
// the cohort check fails if one ever DISAPPEARS.
const TIEOUT_0040_HUMAN_FNS = [
  "complete_bank_reconciliation", "void_bank_reconciliation",
  "except_bank_line", "resolve_bank_line_exception",
  "propose_bank_rule", "sign_bank_rule", "retire_bank_rule",
  "set_counterparty_terms",
];
const TIEOUT_0040_READ_FNS = [
  "ar_aging", "ap_aging", "customer_statement", "supplier_statement",
  "list_unmatched_lines", "get_bank_reconciliation", "list_bank_line_suggestions",
  "list_bank_rule_candidates", "list_bank_rules",
  // 0040 FIX WAVE A7: the bitemporal receipt law's missing verifier. A READ (bookkeeper floor,
  // raises nothing) that recomputes _bank_recon_terms under a stored receipt's own completed_at
  // and reports the diff -- so the same wall applies: human lane only, no machine role.
  "verify_bank_reconciliation",
];
const TIEOUT_0040_UNGRANTED_FNS = [
  "_bank_recon_terms", "_tf_bank_recon_belt", "_tf_bank_settled_authority_belt",
  "_subledger_outstanding_asof", "_bank_rule_pattern_norm", "_bank_rule_sightings",
  "_bank_desc_word_match", "_bank_rule_regex_escape", "_bank_line_class_hint",
  "_aging_core", "_statement_core",
  "_tf_bank_reconciliation_transition", "_tf_bank_reconciliation_no_delete",
  "_tf_bank_line_exception_transition", "_tf_stamp_ble_account",
  "_tf_bank_line_exception_no_delete",
  "_tf_bank_rule_transition", "_tf_bank_rule_no_delete",
];
export const TIEOUT_0040_COHORT = [
  ...TIEOUT_0040_HUMAN_FNS, ...TIEOUT_0040_READ_FNS, ...TIEOUT_0040_UNGRANTED_FNS,
];

// 0041 [Wave D-a — the fixed-asset register] — the human verbs are HUMAN LANE ONLY (every
// one of them is professional judgement: enrolment, particulars, the depreciation authority
// ceremony, disposal, the client year end). The MACHINE half is exactly two names:
// run_depreciation_period (the leader's sweep, design §3.4 — clara_runtime only, never a
// human) and depreciation_run_due, the sweep's due PROBE, which is the one 0041 function
// granted to BOTH lanes because the /assets surface asks the same question the sweep does.
// run_depreciation_manual is its human twin — identical mechanics, _human_ctx(bookkeeper) —
// and must NEVER reach a machine role, or the maker-checker ladder would have a bypass.
const FA_0041_HUMAN_FNS = [
  "upsert_fa_account_profile", "retire_fa_account_profile",
  "complete_fixed_asset_particulars", "revise_fixed_asset_particulars",
  "propose_depreciation_authority", "sign_depreciation_authority", "retire_depreciation_authority",
  "run_depreciation_manual", "dispose_fixed_asset", "set_client_fy_end",
];
// The /assets read surface: definer + _human_ctx(bookkeeper) + firm predicates, the
// BANK_0038_READ_FNS pattern. No machine role reads the register.
const FA_0041_READ_FNS = [
  "list_fixed_assets", "get_fixed_asset", "list_depreciation_runs", "get_depreciation_run",
  "get_depreciation_authority", "fa_register_tie",
];
const FA_0041_RUNTIME_FNS = ["run_depreciation_period"];
const FA_0041_SHARED_FNS = ["depreciation_run_due"]; // BOTH lanes, by design §3.4
// UNGRANTED internals declared the 0020 way: the main sweep fails if one ever GAINS a grant,
// the cohort check fails if one ever DISAPPEARS. _fa_on_approve is the load-bearing one —
// it is the approve hook, and a grant on it would let a caller drive register state outside
// an approve transaction.
const FA_0041_UNGRANTED_FNS = [
  "_fa_on_approve", "_fa_run_period_core", "_fa_compute_charges", "_fa_asset_charges",
  "_fa_asset_json", "_fa_accumulated", "_fa_accumulated_total",
  // The round-3 read layer: ONE lineage walk (`_fa_lineage_walk`) behind every "accumulated"
  // question, so no frozen bake can stand in for a computed read (fold F1/F2). Round 3.5 (fold
  // G1) gave that walk a SECOND reader — `_fa_own_ledger_periods` nets a reversal against the
  // PERIOD it corrected rather than the date the correction posted — and exactly two consumers
  // (the reducing-balance FY-open basis, the disposal's accumulated relief) ask through
  // `_fa_accumulated_periods_through`. Every as-of read keeps effective-date semantics.
  // `_fa_lineage_accumulated` is GONE: its one caller moved, and a second unreferenced money
  // reader beside the new one is the drift surface fold F3 exists to prevent.
  "_fa_own_ledger", "_fa_own_ledger_periods", "_fa_lineage_walk",
  "_fa_accumulated_at", "_fa_accumulated_periods_through",
  "_fa_included_at", "_fa_particulars_complete", "_fa_validate_particulars",
  "_fa_first_chargeable_month", "_fa_uncharged_months",
  // The ONE due oracle (fold F3) — `_fa_first_due_month` replaces `_fa_first_uncharged_month`:
  // due-ness is what the arithmetic emits, never a bare month-coverage scan. Round 4 (fold G2b)
  // settled where the disposal period's boundary sits: the period is STUB territory for the
  // WHOLE lineage, so `_fa_disposal_stub` appends every ancestor's owed months inside it as
  // per-asset charge rows (ONE body, called by the verb and again by the approve hook), while
  // `_fa_ancestors_first_due_month` is now the ENDED-period backstop that keeps an ancestor's
  // earlier months in run territory, where the remedy is executable.
  "_fa_first_due_month", "_fa_lineage_first_due_month", "_fa_ancestors_first_due_month",
  "_fa_disposal_stub",
  // Reversal dispatch discriminates on the ENTRY and unwinds revision lineage (fold F4/F6);
  // `_fa_reversal_blocked` is called from BOTH `reverse_entry` and the approve-time hook. Fold
  // G5 gave the closure a seeded entry point so the SPLIT arm reuses it rather than forking it.
  "_fa_revision_closure", "_fa_reversal_lineage", "_fa_reversal_blocked",
  "_fa_pending_unposted",
  "_fa_range_covered", "_fa_oldest_unmet_period", "_fa_disposal_draft_outstanding",
  "_fa_fy_open_for", "_fa_fy_end_for", "_fa_month_start", "_fa_month_end", "_fa_month_diff",
  "_fa_ym_date", "_fa_today",
  // Fold G4 — the ONE reservation predicate (an account is FA-reserved iff an ACTIVE profile
  // names it in any role OR ANY register row bakes it; round 4 dropped the unwound exclusion,
  // because fa_register_tie's pair census has no status filter and keeps an unwound row's pair
  // forever, so releasing its codes made a re-use unexplainable), its leaf serialization rung,
  // the shared bank-side refusal, and the belt that puts that refusal on clara.bank_accounts
  // itself rather than on the three doors that happen to exist today.
  "_fa_reserved_roles", "_fa_lock_roles", "_fa_assert_code_unreserved", "_tf_fa_bank_reserved",
  "_tf_fa_movement_belt", "_tf_fa_depreciation_append_only", "_tf_fa_run_immutable",
  "_tf_fa_authority_transition", "_tf_fa_profile_no_delete",
];
export const FA_0041_COHORT = [
  ...FA_0041_HUMAN_FNS, ...FA_0041_READ_FNS, ...FA_0041_RUNTIME_FNS,
  ...FA_0041_SHARED_FNS, ...FA_0041_UNGRANTED_FNS,
];

// ---------------------------------------------------------------------------
// 0043 [Wave D-b, SLICE D-b1] — the staff-advance family (the B-lite register).
//
// SPLIT NOTE, and it is deliberate: this block declares the GRANT MATRIX ENTRIES ONLY — the
// seven names 0043's S3.7 grant loop actually reaches. It declares NO cohort. Wave D-b's
// whole-unit `cohortFailures(...)` roster spans all four slices (templates + pairs at 0045,
// the AF-2 composite at 0044, advances here), and `cohortFailures()` fails a PARTIAL cohort
// BY DESIGN — "wholly present or wholly absent per MIGRATION BOUNDARY", the 0022 header's
// rule. A roster naming 0044/0045 bodies would go red on every database at this frontier,
// which is a false failure on a database that is simply behind. **The cohort roster lands
// with the slice whose frontier makes it whole (D-b2 / 0045)** — split-record LAW D1,
// established when D-b0 shipped `rig-meta.mjs` unchanged for the same reason.
//
// The four WRITE verbs. Floors are BODY-enforced via clara._human_ctx(clara.role_rank(...))
// and the role-level grant is clara_authenticated for all of them — the SUBLEDGER_0037 /
// BANK_0038 / FA_0041 pattern. As built: admin+ for enrol/retire (they SIGN an account-role
// authority and burn a reserved code), bookkeeper+ for complete_particulars and for
// book_staff_advance_application (it moves money). NO machine role holds any of them: 0043's
// TAIL 7 proves it from the other side (no wake-allowlist row names a staff-advance verb, and
// none is granted to an agent or wake role) — every advance act is a professional act taken
// by a named human, and the runtime never books one.
const ADV_0043_HUMAN_FNS = [
  "enrol_staff_advance_account", "retire_staff_advance_account",
  "complete_staff_advance_particulars", "book_staff_advance_application",
];
// The /advances READ surface (definer + clara._human_ctx viewer floor + firm predicates) —
// the BANK_0038_READ_FNS / FA_0041_READ_FNS pattern. No machine role reads the advance
// register: an advance names a PERSON, and staff_advance_summary returns their label, their
// purpose and their days-outstanding.
const ADV_0043_READ_FNS = [
  "staff_advance_summary", "staff_advance_statement", "staff_advance_tie",
];
// 0043's SEVENTEEN internal helpers (clara._adv_assert_proposal, _adv_enrolment_at,
// _adv_window_closed_under, _adv_enrolment_admission, _adv_outstanding, _adv_over_application,
// _adv_release_one_way, _adv_net_applications, _adv_entry_carries_correction,
// _adv_reversal_admission, _adv_reversal_blocked, _adv_on_approve, _tf_adv_movement_belt,
// _tf_staff_advance_account_no_delete, _tf_staff_advance_append_only,
// _tf_staff_advance_application_correction_guard, _wdb_reversal_blocked) are named in NO role
// set on purpose: each was revoked from public at its own creation site and each is reached
// only through a SECURITY DEFINER verb, the approve hook, the belt or a table trigger. The main
// sweep already fails if any of them ever GAINS a grant, so their absence is enforced without
// a cohort. The disappearance half of that contract IS now covered: they are enumerated in
// ADV_0043_UNGRANTED_FNS just below and spread into ADJUSTMENTS_0045_COHORT at the 0045 block.

// 0043's SEVENTEEN ungranted internals, declared the 0020 way so the cohort's
// disappearance half reaches them too. DERIVED by diffing pg_proc across a 0042 rig
// and a 0043 rig, never transcribed from prose — THIS array is the roster of record and the
// enumeration above is kept in step with it (MG188-2: that enumeration read thirteen until
// 2026-08-06, missing the three _tf_staff_advance_* triggers and _wdb_reversal_blocked).
const ADV_0043_UNGRANTED_FNS = [
  "_adv_assert_proposal", "_adv_enrolment_at", "_adv_window_closed_under",
  "_adv_enrolment_admission", "_adv_outstanding", "_adv_over_application",
  "_adv_release_one_way", "_adv_net_applications", "_adv_entry_carries_correction",
  "_adv_reversal_admission", "_adv_reversal_blocked", "_adv_on_approve",
  "_tf_adv_movement_belt", "_tf_staff_advance_account_no_delete",
  "_tf_staff_advance_append_only",
  "_tf_staff_advance_application_correction_guard", "_wdb_reversal_blocked",
];

// ---------------------------------------------------------------------------
// 0044 [Wave D-b, SLICE D-b3] — the AF-2 composite (`resolve_and_book_bank_line`).
//
// SPLIT NOTE (LAW D1, third application): GRANT MATRIX ENTRIES ONLY, no cohort — D-b0 shipped
// this file unchanged, D-b1 added its seven, this slice adds its ONE, and the whole-unit Wave
// D-b `cohortFailures(...)` roster still lands with the slice whose frontier makes it whole
// (D-b2 / 0045). `cohortFailures()` fails a PARTIAL cohort BY DESIGN — "wholly present or
// wholly absent per MIGRATION BOUNDARY", the 0022 header's rule — so a roster naming 0045
// bodies would go red on every database at this frontier.
//
// EXACTLY ONE NAME, and the count is the security claim. 0044's `$s4_acl$` grant loop reaches
// a single verb: `clara.resolve_and_book_bank_line`. Its floor is BODY-enforced via
// clara._human_ctx(clara.role_rank(...)) at OWNER (ABI §A; WD-R13 — the composite books a
// hand-draft or spends an open-item settlement preheld, in one transaction, against a bank
// line the firm has already excepted), and the role-level grant is clara_authenticated, the
// SUBLEDGER_0037 / BANK_0038 / FA_0041 / ADV_0043 pattern. NO machine role holds it.
//
// **THE SECOND VERB THIS MIGRATION CREATES IS DELIBERATELY ABSENT FROM EVERY ROLE SET.**
// 0044 also creates `clara.accept_bank_rule_suggestion` — the `bank_rule_suggested` producer —
// and WITHHOLDS its `grant execute … to clara_authenticated` (the migration's own
// `$s4_acl_b3_withheld$` block revokes it from PUBLIC, owns it as clara_fn_owner and then
// ASSERTS on the live catalog that no non-owner role can reach it at all). The reason is a
// money mechanism found by two independent reviewers in the split's confirming round: the
// producer's approve-time re-validation is `clara._adj_on_approve` arm (3), a D-b2 body, so a
// reachable producer between 0044 and 0045 could mint a staff advance nobody incurred. 0045
// adds the single grant beside that arm. Until then the correct expectation for EVERY role in
// this matrix is `false`, which is what leaving the name out of every set already asserts —
// the main sweep below iterates the LIVE catalog and fails the moment it gains a grant here.
// Its dashboard chip and its test cells defer to D-b2 with it.
const AF2_0044_HUMAN_FNS = ["resolve_and_book_bank_line"];
// 0044's FOURTEEN internals — the three preheld-aware money cores factored out of
// clara.allocate_receipt / allocate_payment / settle_from_bank_line so the composite can
// pre-reserve their op keys and spend them preheld (clara._allocate_receipt_core,
// _allocate_payment_core, _settle_from_bank_line_core), the settle request hash
// (_settle_request_hash), the bank-snapshot helpers (_bank_adjustments_norm,
// _bank_parked_cascade_admitted, _bank_recon_snapshot_parked), the suggestion pair
// (_wdb_suggestion_rule_hit, _wdb_suggestion_lines), the booking-lawfulness family — the
// shared line-keyed booking-block predicate and the three predicates around it
// (_wdb_line_booking_block, _wdb_assert_line_booking_lawful, _wdb_born_in_booking_act,
// _wdb_exception_booking_block) — and the park's set-once trigger function
// (_tf_bank_matches_resolution_exception_immutable) are named in NO role set on purpose. A
// grant on a `_core` would be a FLOORLESS money verb: the floor stayed in the public wrapper.
// The main sweep already fails if any of them ever GAINS a grant, so their absence is enforced
// without a cohort; the disappearance half IS now covered too, by AF2_0044_UNGRANTED_FNS just
// below, spread into ADJUSTMENTS_0045_COHORT at the 0045 block.

// 0044's FOURTEEN ungranted internals, same discipline, same derivation (0043 rig vs
// 0044 rig). THIS array is the roster of record and the enumeration above is kept in step
// with it (MG188-2: that enumeration named only seven of them until 2026-08-06).
const AF2_0044_UNGRANTED_FNS = [
  "_allocate_receipt_core", "_allocate_payment_core", "_settle_from_bank_line_core",
  "_settle_request_hash", "_bank_adjustments_norm", "_bank_parked_cascade_admitted",
  "_bank_recon_snapshot_parked", "_wdb_suggestion_rule_hit", "_wdb_suggestion_lines",
  "_wdb_line_booking_block", "_wdb_assert_line_booking_lawful",
  "_wdb_born_in_booking_act", "_wdb_exception_booking_block",
  "_tf_bank_matches_resolution_exception_immutable",
];

// ---------------------------------------------------------------------------
// 0045 [Wave D-b, SLICE D-b2] — recurring adjustment templates, the auto-reversal pair
// machine, and the ONE grant that closes the split.
//
// THE COHORT LANDS HERE, and that is LAW D1 discharged: D-b0 shipped this file unchanged,
// D-b1 added its seven grant-matrix names, D-b3 added its one, and none of the three could
// declare a cohort because `cohortFailures()` fails a PARTIAL cohort BY DESIGN. D-b2 is the
// slice whose frontier makes the roster whole, so the roster is declared here.
//
// EVERY NAME BELOW WAS DERIVED EMPIRICALLY, NOT COPIED. Two rigs were built from the same
// clara_0041_asm template — one migrated 0001..0044, one 0001..0045 — and
// `select proname from pg_proc where pronamespace='clara'::regnamespace` was diffed across
// them. The difference IS this block: 40 net-new functions, zero removed. That method is the
// point. The pre-split whole-unit tree bundled all four slices' names under one "0042" family
// and claimed several as D-b2-new that D-b1/D-b3 had already created — `_wdb_reversal_blocked`,
// the thirteen `_adv_*` helpers, `_acct_role_reserved`, `_adj_line_eligibility_breach` and the
// three money `_core`s all measure PRESENT on the 0044 rig. Re-declaring them here would have
// dressed another slice's work as this one's.
//
// The seven WRITE verbs. Floors are BODY-enforced via clara._human_ctx(clara.role_rank(...))
// and the role-level grant is clara_authenticated — the SUBLEDGER_0037 / BANK_0038 / FA_0041 /
// ADV_0043 / AF2_0044 pattern. As built: bookkeeper+ for propose, run_manual and the three pair
// verbs; admin+ for sign and retire (they SIGN a standing authority that books money every
// period without a human in the loop). NO machine role holds any of them.
const ADJ_0045_HUMAN_FNS = [
  "propose_adjustment_template", "sign_adjustment_template", "retire_adjustment_template",
  "run_adjustment_manual",
  "reverse_adjustment_pair", "approve_pair_reversal", "cancel_pair_reversal",
];
// THE ONE GRANT THIS MIGRATION LANDS ON A FUNCTION IT DID NOT CREATE. 0044 created
// clara.accept_bank_rule_suggestion — the `bank_rule_suggested` producer — and deliberately
// WITHHELD its `grant execute … to clara_authenticated`, because the producer's approve-time
// re-validation is clara._adj_on_approve arm (3), a body that only exists here: a reachable
// producer between 0044 and 0045 could mint a staff advance nobody incurred. 0045 ships arm (3)
// and the grant together, which is why the name is in NO net-new list above (it is not new) but
// IS in the grant matrix below (its reachability is). MEASURED on both rigs:
// has_function_privilege('clara_authenticated', 'clara.accept_bank_rule_suggestion(uuid,uuid,
// uuid,text)', 'EXECUTE') is `f` at 0044 and `t` at 0045.
const ADJ_0045_PRODUCER_GRANT_FNS = ["accept_bank_rule_suggestion"];
// The /rules TEMPLATE read surface: definer + clara._human_ctx(viewer) + firm predicates, the
// BANK_0038_READ_FNS / FA_0041_READ_FNS / ADV_0043_READ_FNS pattern. No machine role reads it.
const ADJ_0045_READ_FNS = [
  "list_adjustment_templates", "list_adjustment_runs", "get_adjustment_run",
];
// The leader sweep's run verb — EXECUTE clara_runtime ONLY, never clara_authenticated. It
// carries no role_rank floor at all, so its authority IS this grant: exactly the
// run_depreciation_period shape it was cut from. A clara_authenticated grant here would hand
// any logged-in viewer an unfloored poster.
const ADJ_0045_RUNTIME_FNS = ["run_adjustment_occurrence"];
// The due probe — the ONE name BOTH lanes hold, the FA_0041_SHARED_FNS precedent (design §3.4):
// the leader sweep asks it before scheduling and /rules asks it to light the panel.
const ADJ_0045_SHARED_FNS = ["adjustment_run_due"];
// 0045's TWENTY-EIGHT ungranted internals, declared the 0020 way: the main sweep fails if one
// ever GAINS a grant (expected false for every role, and MEASURED false for every role on the
// 0045 rig), and the cohort check below fails if one ever DISAPPEARS. The load-bearing ones:
//   * `_adj_on_approve` — the approve-time hook, and the reason the producer's grant waited for
//     this slice. A grant would let a caller drive occurrence state OUTSIDE an approve
//     transaction (the `_fa_on_approve` reasoning, verbatim);
//   * `_pair_reverse_core` — the pair machine the three public pair verbs share;
//   * `_adj_template_hash` / `_adj_canon_lines` — the content-hash pair. A grant would let a
//     caller mint the hash a template's identity is keyed on.
// Three of them were born in the fix waves rather than the original cut and are named here for
// that reason, not despite it: `_wdb_iso_day` (the day-of-week arithmetic the cadence clock
// needs), `_wdb_period_overlap_advisory` (the propose/sign-time advisory) and
// `_tf_adjustment_template_lineage_root` (the trigger that keeps a lineage single-rooted).
const ADJ_0045_UNGRANTED_FNS = [
  // The recurring-adjustment family: the occurrence core, the content-hash pair, the period
  // arithmetic, the due/outstanding oracles, the approve hook, the correction door and the two
  // json serializers the reads are cut from.
  "_adj_run_occurrence_core", "_adj_template_hash", "_adj_canon_lines",
  "_adj_occurrence_outstanding", "_adj_oldest_unmet_period",
  "_adj_period_start", "_adj_period_end", "_adj_period_label",
  "_adj_on_approve", "_adj_correction_door", "_adj_run_json", "_adj_template_json",
  // The pair machine.
  "_pair_reverse_core",
  // The P1 lineage authority: ancestry, the period-keyed standing-charge reader the advisory
  // is built on, the overlap grammar, and the entry/line shape probes the correction door
  // compares through.
  "_wdb_template_ancestry", "_wdb_template_standing_charges",
  "_wdb_replaced_generation_standing", "_wdb_overlapping_siblings", "_wdb_shape_overlap",
  "_wdb_period_overlap_advisory", "_wdb_correction_admission",
  "_wdb_entry_shape", "_wdb_line_shape", "_wdb_iso_day",
  // Trigger functions: the template transition + lineage-root guards, run immutability, and
  // the pair-reversal transition pair.
  "_tf_adjustment_template_transition", "_tf_adjustment_template_lineage_root",
  "_tf_adjustment_run_immutable",
  "_tf_adjustment_pair_reversal_transition", "_tf_adjustment_pair_reversal_no_commit_approving",
];
// THE WAVE D-b ROSTER, WHOLE AT LAST. D-b1's and D-b3's names — granted AND ungranted — are
// spread BY REFERENCE rather than re-listed, so the declarations can never drift apart. The
// two ungranted spreads are what discharge the "disappearance half" promise those blocks made:
// cohortFailures() can only notice a name VANISHING if some cohort lists it, and D-b2 is the
// last slice, so this is the last chance to list them.
export const ADJUSTMENTS_0045_COHORT = [
  ...ADV_0043_HUMAN_FNS, ...ADV_0043_READ_FNS, ...ADV_0043_UNGRANTED_FNS,
  ...AF2_0044_HUMAN_FNS, ...AF2_0044_UNGRANTED_FNS,
  ...ADJ_0045_HUMAN_FNS, ...ADJ_0045_PRODUCER_GRANT_FNS, ...ADJ_0045_READ_FNS,
  ...ADJ_0045_RUNTIME_FNS, ...ADJ_0045_SHARED_FNS, ...ADJ_0045_UNGRANTED_FNS,
];

const WAVE_B_0020_HUMAN_FNS = [
  "classify_consent_evidence_document",
  "grant_client_egress_purpose", "activate_client_egress_purpose",
  "deactivate_client_egress_purpose", "revoke_client_egress_purpose",
];
// 0020's UNGRANTED internals — the definer-internal filing helper and the three
// immutability trigger functions. They are named so their absence from every role
// set is a DECLARED expectation carried by the cohort check, not a silent default:
// the main sweep already fails if one of them ever GAINS a grant (expected false),
// and the cohort check fails if one ever DISAPPEARS.
const WAVE_B_0020_UNGRANTED_FNS = [
  "_active_filing_clients",
  "_tf_egress_purpose_consent_update", "_tf_egress_purpose_activation_update",
  "_tf_egress_dispatch_authorization_update",
];
export const WAVE_B_0020_COHORT = [
  ...WAVE_B_0020_RUNTIME_FNS, ...WAVE_B_0020_HUMAN_FNS, ...WAVE_B_0020_UNGRANTED_FNS,
  ...WAVE_B_0021_HUMAN_FNS,
];
// 0022 gets its OWN cohort rather than joining the one above, because the cohort check's
// whole contract is "wholly present or wholly absent" per MIGRATION BOUNDARY: folding two
// 0022 names into the 0020 cohort would make a 21-migration database report a PARTIAL
// cohort — a false failure on a database that is simply one migration behind. Separate
// cohorts keep this file correct at 21 and at 22+ alike, exactly as the 0020 block's own
// header describes for 19 and 20+.
export const EXTRACTION_0022_COHORT = [...EXTRACTION_0022_HUMAN_FNS];

// 0046 [§7-A] — the unattended sales lane. The whole HUMAN surface this migration adds is
// the signing-time evidence preview plus the recorded backfill door; the drafter itself
// reaches the DB through verbs that already existed.
const SALES_LANE_0046_HUMAN_FNS = ["open_sales_backfill", "set_sales_backfill_state"];
const SALES_LANE_0046_READ_FNS = ["preview_ocr_sales_evidence", "list_sales_backfill_batches"];
// The definer internals, named so their absence from every role set is a DECLARED
// expectation the cohort carries rather than a silent default (the 0020 block's reasoning).
//
// clara.set_sales_lane_activation IS IN THIS LIST ON PURPOSE AND IS THE POINT OF IT. 7A-R1
// rules that the activation flip belongs to the owner/deploy connection alone, so it is
// granted to NO application role — and the main sweep, which expects `false` for every role
// not listed in ALLOWED, is what turns that ruling into a test. If a future migration ever
// grants it, this file fails and somebody has to say so out loud.
const SALES_LANE_0046_UNGRANTED_FNS = [
  "_ocr_sales_floor_pop", "_sales_lane_active", "_autodraft_direction_tri",
  "_sales_admission_open", "set_sales_lane_activation",
];
export const SALES_LANE_0046_COHORT = [
  ...SALES_LANE_0046_HUMAN_FNS, ...SALES_LANE_0046_READ_FNS, ...SALES_LANE_0046_UNGRANTED_FNS,
];

// F-A3/PR-1b [bank-agency agent limb] the one human door: set_bank_agency_hold. A named cohort
// (nit, opus consolidated round) rather than a bare inline string, so a future rename/retire
// of this one function is caught by the closed-roster dead-exemption sweep like every other
// wave's own cohort, instead of silently going stale as an unwrapped literal.
export const BANK_AGENCY_F_A3_PR1B_COHORT = ["set_bank_agency_hold"];

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
    ...WAVE_B_0020_HUMAN_FNS, // 0020 [§7.1] typed-consent owner RPCs (owner floor body-enforced)
    ...WAVE_B_0021_HUMAN_FNS, // 0021 the human counterparty lane (bookkeeper floor)
    ...EXTRACTION_0022_HUMAN_FNS, // 0022 the extraction slice X1 (bookkeeper + owner floors)
    ...VENDOR_BINDING_0028_HUMAN_FNS, // 0028 the vendor identity binding ceremony + reads
    ...SUBLEDGER_0037_HUMAN_FNS, // 0037 the Wave C-a settlement composites (human judgement only)
    ...BANK_0038_HUMAN_FNS, // 0038 the Wave C-b bank verbs (human judgement only)
    ...BANK_0038_READ_FNS, // 0038 the /bank read surface (definer + _human_ctx + firm predicates)
    ...TIEOUT_0040_HUMAN_FNS, // 0040 the Wave C-c tie-out / exception / rule verbs (human judgement only)
    ...TIEOUT_0040_READ_FNS, // 0040 the /bank recon + /aging read surface
    ...FA_0041_HUMAN_FNS, // 0041 the Wave D-a fixed-asset verbs (human judgement only)
    ...FA_0041_READ_FNS, // 0041 the /assets read surface
    ...FA_0041_SHARED_FNS, // 0041 the due probe — the one name BOTH lanes hold (design §3.4)
    ...ADV_0043_HUMAN_FNS, // 0043 [D-b1] the staff-advance write verbs (human judgement only)
    ...ADV_0043_READ_FNS, // 0043 [D-b1] the /advances read surface (viewer+, definer, firm-predicated)
    ...AF2_0044_HUMAN_FNS, // 0044 [D-b3] the AF-2 composite (owner floor)
    ...ADJ_0045_HUMAN_FNS, // 0045 [D-b2] the template + pair write verbs (human judgement only)
    ...ADJ_0045_PRODUCER_GRANT_FNS, // 0045 [D-b2] the producer grant 0044 withheld — it lands
    // HERE, beside clara._adj_on_approve arm (3), the approve-time door that makes the producer
    // safe to reach. See the 0045 block above for what was withheld and why.
    ...ADJ_0045_READ_FNS, // 0045 [D-b2] the /rules template read surface (viewer+, definer)
    ...ADJ_0045_SHARED_FNS, // 0045 [D-b2] the due probe — the one name BOTH lanes hold
    ...SALES_LANE_0046_HUMAN_FNS, // 0046 [§7-A] the recorded sales backfill door (admin floor)
    ...SALES_LANE_0046_READ_FNS, // 0046 [§7-A] the signing-time evidence preview + batch read
    ...CLIENT_FACTS_0055_HUMAN_FNS, // 0055 [Wave E lane α] the client-facts door (admin floor;
    // agent + both wake roles gain ZERO — 0055's S7 tail asserts it in-migration)
    ...CLOSE_MODEL_0056_HUMAN_FNS, // 0056 [Wave E lane β] the close model (see the block above)
    ...REGISTRY_0057_HUMAN_FNS, // 0057 [Wave E lane γ] the period registry + month snapshots
    // (one door + three reads; agent/wake/runtime gain ZERO — see the block above)
    ...METRICS_0058_HUMAN_FNS, // 0058-0061 [Wave E lane δ] the metric algebra + evaluator: four
    // lifecycle verbs, the two frozen-input minters, the evaluator pair, the independent E6
    // re-check, the A30b attempt-receipt writer and the freeze verifier — clara_authenticated
    // ONLY, every floor body-enforced; agent/wake/runtime gain ZERO (see the block above)
    ...CLOSE_PLAN_0064_HUMAN_FNS, // 0064 [Wave E lane θ] the close-plan-as-document read —
    // clara_authenticated ONLY (the /close consumer); agent row empty by T17's ruling,
    // not by omission — see the block above
    ...REPORTING_0065_HUMAN_FNS, // 0065-0072 [Wave E lane ε] the FS reporting layer: four
    // publishing verbs, the run/claim/dataset trio, the artifact seal, the key-2 issue approval
    // and the artifact verifier — clara_authenticated ONLY, every floor body-enforced. The two
    // INTERNAL cores (_seal_report_artifact_core, _draft_report_spec_core) and the five closed
    // validators are deliberately ABSENT from this roster: they are granted to nobody, so the
    // sweep's expected=false is the assertion that ζ's and η's JWT-less callers reach them only
    // as clara_fn_owner internals (see the block above)
    // 0079 [Wave E lane ζ] BOTH human doors — the array is the enumeration and the block where it
    // is declared describes each. They are not the same kind of verb: replay_render_inputs is
    // STABLE and writes nothing, while requeue_render_job is plpgsql, INSERTS a successor job and
    // writes an audit row. Both are clara_authenticated ONLY.
    ...RENDER_ZETA_HUMAN_FNS,
    // F-A3/PR-1b [bank-agency agent limb] the one human door: set_bank_agency_hold, a
    // bookkeeper-floor idempotent upsert on the client's own hold row (body-enforced floor;
    // agent + both wake roles gain ZERO — the hold is a human brake on the agent lane, never
    // something the agent lane can flip on itself).
    ...BANK_AGENCY_F_A3_PR1B_COHORT,
  ]),
  // [S6 §9/C-11] agent lane loses the bare get_journal_entry(uuid) oracle; keeps the other
  // reads and gains the client-pinned S6 reads + get_journal_entry_for.
  [ROLES.agentRo]: new Set([...READS.filter((r) => r !== "get_journal_entry"), ...S6_AGENT_READS, ...WAVE_A_AGENT_READS]),
  [ROLES.wakeInteractive]: new Set(["wake_draft_entry", "wake_record_client_resolution", "wake_record_notification", ...WAVE_A_WAKE_INTERACTIVE_FNS, ...AUTHORING_0077_WAKE_FNS, ...POSTING_F_A2_WAKE_FNS]),
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
    ...BANK_0038_RUNTIME_FNS, // 0038 the statement-facts writers (the persist_invoice_facts precedent)
    ...FA_0041_RUNTIME_FNS, // 0041 the depreciation sweep's run verb (the leader's SET ROLE lane)
    ...FA_0041_SHARED_FNS, // 0041 the due probe
    ...ADJ_0045_RUNTIME_FNS, // 0045 [D-b2] the adjustment sweep's run verb (runtime lane ONLY)
    ...ADJ_0045_SHARED_FNS, // 0045 [D-b2] the due probe
    ...RENDER_ZETA_RUNTIME_FNS, // 0079-0083 [Wave E lane ζ] the render queue's whole
    // reachable API — the array is the enumeration; the block where it is declared names each
    // verb and its consumer. clara_runtime holds NO table privilege on clara.render_jobs, so
    // this roster IS the surface
    "persist_document_extraction", "complete_stored_document_task",
    "reserve_document_ingest", "resize_ingest_reservation", "settle_ingest_reservation",
    "refund_ingest_reservation", "record_attribution_attempt",
    ...WAVE_B_RUNTIME_FNS, ...WAVE_B_SHARED_READS, // 0017 G2
    ...S6_RUNTIME_FNS, // [S6 §9/C-11] invoice-facts lane writers + coding-attempt recovery read
    ...WAVE_A_RUNTIME_FNS, // [WAVE-A §2] autodraft admission/settle + sweep-run + candidate reads
    ...WAVE_A2_RUNTIME_FNS, // [WAVE-A2 §6.2] the autopost expiry/nudge reconcile sweep
    ...WAVE_A21_RUNTIME_FNS, // 0016 [A2.1 §C] SST evaluators + classify_document (runtime ONLY; agent zero)
    ...WAVE_B_0020_RUNTIME_FNS, // 0020 [§3.3/§3.4/§5.1/§5.3] dispatch authorization + the doc->client resolver
    ...FAIL_CLASSIFY_0024_RUNTIME_FNS, // 0024 the classify lane's terminal-fail writer
    ...STATEMENT_F_A1_PR4_RUNTIME_FNS, // [Wave-F Track A, F-A1 PR-4] the bank-statement witness
                                       // task wrapper (its core stays ungranted)
    ...WITNESS_F_A1_RUNTIME_FNS, // 0090-0095 [Wave-F Track A, F-A1] the witness-pair lane's whole
    // reachable API — usage metering, the atomic pair persist, and the citation numbering PR-2's
    // prompt builder must number against. The block where the array is declared names each verb
    // and its consumer; F-A1 grants no human EXECUTE at all
    ...WITNESS_F_A1_PR3_RUNTIME_FNS, // F-A1 PR-3 cutover: fail_witness_facts, the running->failed
    // settle verb for the llm_witness lane (mirrors fail_invoice_facts, S6_RUNTIME_FNS above)
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

// ---------------------------------------------------------------------------
// 0037 [Wave C-a] — the subledger TABLE COHORT. Same "wholly present or wholly absent"
// discipline the 0020/0022/0024/0028 FUNCTION cohorts carry, applied to tables, and for
// exactly the same reason: GOVERNED_TABLES is a closed roster whose (a) branch demands
// every entry EXIST, so listing these two unconditionally turns every pre-0037 database
// (the 34-migration rig, an older CI leg, a partially-migrated scratch DB) into a MISSING-
// table failure that says nothing about RLS. Gating on to_regclass keeps T18 bimodal-green
// at 36 and at 37+ alike.
//
// Nothing is lost by gating. When the tables EXIST they are folded into `governed` below,
// so the (a) branch still asserts rls+force on both; when they do NOT exist the derive
// branch (b) has nothing to look at either. And a PARTIAL cohort (one table present, one
// absent) is itself reported — that shape can only mean a half-applied 0037.
export const SUBLEDGER_0037_TABLES = ["open_items", "open_item_allocations"];

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

/** A declared capability COHORT must be WHOLLY present or WHOLLY absent (see the
 * WAVE_B_0020_* block). Absent = that migration is not applied on this database, so
 * its roster entries are correctly unchecked. Partial = a roster entry that no longer
 * resolves — a DEAD exemption in a closed set. Returns failure strings. */
function cohortFailures(label, cohort, liveNames) {
  const missing = cohort.filter((n) => !liveNames.has(n));
  if (missing.length === 0 || missing.length === cohort.length) return [];
  return [`${label} capability cohort is PARTIAL — these enumerated names no longer resolve `
    + `to a clara function: ${missing.join(", ")}. A closed roster must not accumulate dead `
    + `exemptions: remove the entry, or restore the function.`];
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
  // The compensating assertion for every EXPLICIT-ENUMERATION widening of this closed
  // set: no dead exemptions. (The sweep above iterates the LIVE catalog, so a roster
  // entry for a function that no longer exists is otherwise invisible.)
  const liveNames = new Set(fns.rows.map((f) => f.proname));
  failures.push(...cohortFailures("0020 typed-consent", WAVE_B_0020_COHORT, liveNames));
  failures.push(...cohortFailures("0022 extraction-slice X1", EXTRACTION_0022_COHORT, liveNames));
  failures.push(...cohortFailures("0024 fail_classify", FAIL_CLASSIFY_0024_COHORT, liveNames));
  failures.push(...cohortFailures("0028 vendor identity binding", VENDOR_BINDING_0028_COHORT, liveNames));
  failures.push(...cohortFailures("0037 wave C-a subledger", SUBLEDGER_0037_COHORT, liveNames));
  failures.push(...cohortFailures("0038 wave C-b bank", BANK_0038_COHORT, liveNames));
  failures.push(...cohortFailures("0040 wave C-c tie-out", TIEOUT_0040_COHORT, liveNames));
  failures.push(...cohortFailures("0041 wave D-a fixed-asset register", FA_0041_COHORT, liveNames));
  failures.push(...cohortFailures("0045 wave D-b recurring adjustments", ADJUSTMENTS_0045_COHORT, liveNames));
  failures.push(...cohortFailures("0046 §7-A unattended sales lane", SALES_LANE_0046_COHORT, liveNames));
  failures.push(...cohortFailures("0057 wave E period registry + snapshots", REGISTRY_0057_COHORT, liveNames));
  failures.push(...cohortFailures("0058-0061 wave E metric algebra + evaluator", METRICS_0058_COHORT, liveNames));
  failures.push(...cohortFailures("0065-0072 wave E FS reporting layer", REPORTING_0065_COHORT, liveNames));
  failures.push(...cohortFailures("0079-0083 wave E render queue", RENDER_ZETA_COHORT, liveNames));
  failures.push(...cohortFailures("0077-0078 wave E ad-hoc authoring wake surface", AUTHORING_0077_COHORT, liveNames));
  failures.push(...cohortFailures("0090-0095 wave F F-A1 witness-pair lane", WITNESS_F_A1_COHORT, liveNames));
  failures.push(...cohortFailures("F-A1 PR-3 cutover: fail_witness_facts", WITNESS_F_A1_PR3_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A1 PR-4 bank-statement witness cutover", STATEMENT_F_A1_PR4_COHORT, liveNames));
  failures.push(...cohortFailures("F-A3/PR-1b bank-agency agent limb", BANK_AGENCY_F_A3_PR1B_COHORT, liveNames));
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
  // The 0037 table cohort: wholly present (→ governed, fully asserted) or wholly absent
  // (→ 0037 is not applied on this database, so the roster entries are correctly unchecked).
  // Anything between the two is a half-applied migration and is reported as such.
  const cohortLive = SUBLEDGER_0037_TABLES.filter((t) => present.has(t));
  if (cohortLive.length !== 0 && cohortLive.length !== SUBLEDGER_0037_TABLES.length) {
    problems.push(
      `0037 wave C-a subledger table cohort is PARTIAL — present: ${cohortLive.join(", ") || "(none)"}; `
      + `missing: ${SUBLEDGER_0037_TABLES.filter((t) => !present.has(t)).join(", ")}. `
      + "A closed roster must not accumulate dead entries: either 0037 applied (both tables) or it did not.",
    );
  }
  const roster = [...GOVERNED_TABLES, ...(cohortLive.length === SUBLEDGER_0037_TABLES.length ? SUBLEDGER_0037_TABLES : [])];
  // (a) every governed table must EXIST and be RLS-forced.
  for (const tbl of roster) {
    const r = present.get(tbl);
    if (!r) problems.push(`${tbl}: MISSING from schema clara`);
    else if (!r.relrowsecurity || !r.relforcerowsecurity) problems.push(`${tbl}: rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`);
  }
  // (b) any OTHER clara base table (a future one) must be forced too, unless explicitly exempt.
  const governed = new Set(roster);
  for (const r of rows.rows) {
    if (governed.has(r.relname) || RLS_EXEMPT.has(r.relname)) continue;
    if (!r.relrowsecurity || !r.relforcerowsecurity) {
      problems.push(`${r.relname} (unlisted): rls=${r.relrowsecurity} force=${r.relforcerowsecurity} — add to GOVERNED_TABLES or RLS_EXEMPT`);
    }
  }
  return problems;
}
