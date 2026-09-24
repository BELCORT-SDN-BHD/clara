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
// F-A2 PR-3 (docs/plan/active/f-a2-agentic-posting-design.md Annex B.1/B.2) retires the
// rules-execution tier: propose_coding_rule, sign_coding_rule, decline_coding_rule,
// retire_coding_rule and get_coding_rule are DROPped, so this WAVE-A-frontier roster —
// consumed live below, not as a historical snapshot — loses those five names.
const WAVE_A_HUMAN_FNS = [
  "rename_counterparty", "add_counterparty_alias", "retire_counterparty_alias", "merge_counterparties",
  "request_autodraft", "acknowledge_sweep_run",
  "open_question", "resolve_open_question", "dismiss_open_question", "promote_clarify_to_question",
  "grant_client_egress", "revoke_client_egress", "approve_routine_entry",
  "get_sweep_run", "get_open_question", "list_review_queue",
  "coding_lane", "list_coding_lanes", "get_entry_diff", "get_doc_entry_diff",
];
const WAVE_A_AGENT_READS = [
  "coding_lane", "list_coding_lanes", "get_entry_diff", "get_doc_entry_diff",
  "wake_client", "_agent_read_admitted",
];
// [DB-A, H-53] clara._is_codeable_kind — the ONE definition of which document kinds owe a
// journal entry, read by the two close gates, by clara.list_uncoded_filings and by
// clara.list_review_queue's filing rows. It is an underscore helper that BOTH app lanes must
// hold EXECUTE on, and the reason is structural rather than a convenience: its caller
// clara.list_uncoded_filings is SECURITY INVOKER (0011:3967, and 0036's own tail asserts that
// posture), so the predicate runs as the CALLING role and an ungranted helper would 42501 the
// reader in production while every definer-posture rig cell stayed green. This is exactly the
// shape _agent_read_admitted already holds one line above -- an invoker reader's gate helper,
// granted to the lanes that reach the reader and to nobody else. The wake roles are NOT here:
// they reach the reader through their own admitted wrappers, never directly.
const DBA_CODEABILITY_SHARED_FNS = ["_is_codeable_kind"];
const WAVE_A_RUNTIME_FNS = [
  "admit_autodraft_task", "begin_autodraft_task", "settle_autodraft_task",
  "open_sweep_run", "reconcile_sweep_runs",
  "list_autodraft_candidates", "list_document_autodraft_candidates", "get_document_for_human_read",
];
const WAVE_A_WAKE_INTERACTIVE_FNS = ["wake_open_question"];
// [WAVE-A2 §6/§7] posting-tier standing-rules human surfaces (PostgREST rpc, coarse
// grant to clara_authenticated; role floors are body-enforced): sign (admin+),
// propose/retire/acknowledge (bookkeeper+), and the rule/notification/receipt reads.
// F-A2 PR-3 retires the whole autopost-rule verb family (sign/propose/retire/acknowledge/
// list/get_run) — list_notifications is the ONE survivor, kept general-purpose.
const WAVE_A2_HUMAN_FNS = ["list_notifications"];
// [WAVE-A2 §6.2] the expiry/nudge sweep — runtime lane only (execute_rule_post is granted
// LOGIN-DIRECT to clara_runtime_login, like record_rule_resolution, so it is deliberately
// NOT in any of the five matrix roles). F-A2 PR-3 retires reconcile_autopost_rules, and
// with it this cohort — kept as an explicit empty array (not deleted) so the ...spread
// below stays a one-line diff against its Wave-A2 origin rather than a silent removal.
const WAVE_A2_RUNTIME_FNS = [];
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
// 0058-0061 [Wave E lane delta]: the metric algebra + evaluator. TEN names on
// clara_authenticated and NOTHING anywhere else — the agent, both wake roles, clara_runtime and
// both non-inheriting login shells gain ZERO EXECUTE across all four files, which delta's own
// security tail asserts in-migration (its v_entrypoints loop refuses if any of them holds EXECUTE)
// and which this roster is the second, independent instrument for.
//
// #1003 (2026-09-20) RETIRED THE ELEVENTH. create_account_set_v1 held EXECUTE here from 0059
// until 0271 dropped the function outright: two independently measured censuses (T9's rung-0
// sweep and #660's re-confirmation) found zero product callers, and its capability was already
// covered by the live agent-lane sibling (clara._agent_create_account_set_core /
// clara.wake_create_account_set, DERIVED from this body at 0113 and standing on its own since).
// Its name is removed from THIS array (the ten-member cohort) rather than left in it, because
// cohortFailures() below would read it as a PARTIAL cohort — this is a single planned removal
// from a group that otherwise still ships whole, never the whole group's own retirement. It is
// NOT removed from ALLOWED: while a frontier below 0271 can still carry the live, granted body,
// removing the exemption makes the grant-matrix sweep and the census's attribution roster
// hard-FAIL instead of skip. That arm is `RETIRED_0271_HUMAN_FNS` below, with the whole
// reasoning and its scheduled deletion beside it.
//
// WHAT EACH REMAINING GROUP IS, because "ten granted verbs" is not self-explaining: four are the
// metric definition LIFECYCLE (propose is a draft; approve carries the admin floor AND PRD §2's
// approver-≠-proposer segregation; reject and supersede are owner-floored) — every floor is
// body-enforced, so the grant is a door, never the authority. mint_metric_input_snapshot_v1
// mints the frozen input an evaluation reads (account sets, the algebra's OTHER frozen input,
// now mint only through the agent-lane wake door named above). evaluate_metric_v1 and
// evaluate_fs_pack_v1 are the evaluator itself; assess_metric_cell_independent_v1 is the
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
  "mint_metric_input_snapshot_v1",
  "propose_metric_definition", "approve_metric_definition",
  "reject_metric_definition", "supersede_metric_definition",
  "evaluate_metric_v1", "evaluate_fs_pack_v1",
  "assess_metric_cell_independent_v1", "record_metric_evaluation_attempt_v1",
  "verify_evaluator_freeze",
];
// [Wave-F Track A, F-A5b card 1] clara.evaluate_metric_v2 — the substitution seam's stage-(b)
// evaluator, granted to clara_authenticated on its v1 twin's own terms and for the same reason:
// it is the evaluator itself, and the floor is body-enforced. It is kept in its OWN roster rather
// than appended to METRICS_0058_HUMAN_FNS above, because that array is a COHORT that ships
// together across 0059/0060 and must live or die together — v2 ships in a different migration and
// would make that cohort read PARTIAL on every pre-card-1 chain.
const CARD1_SEAM_HUMAN_FNS = ["evaluate_metric_v2"];
// A COHORT for the same closed-set reason as 0057's: these ten ship together across 0059/0060
// and must live or die together, so a name that silently vanishes while its exemption survives
// here is a finding rather than a quiet pass. create_account_set_v1 is deliberately not one of
// the ten any more (#1003 retired it alone, above) — it is removed from the cohort rather than
// left in it to go "PARTIAL".
const METRICS_0058_COHORT = [...METRICS_0058_HUMAN_FNS];
// #1003 [0271] THE RETIREMENT WINDOW — the REMOVAL-SHAPED MIRROR of the bimodal cohorts the
// additions below use (0234's, 0270's), added in the 2026-09-20 fix round for standards
// L10-STD-02, spec S-1003-1 and adversarial ADV-L10-03.
//
// WHY AN ADDITION NEEDS NO ARM AND A REMOVAL DOES. Both of this file's consumers iterate the LIVE
// catalog: `grantMatrixFailures()` below compares each live body's grants against ALLOWED, and
// `scripts/operation-census/findings.mjs`'s `unattributed` label attributes each live PUBLIC door
// against ALLOWED flattened. So a name ADDED to ALLOWED before its migration lands is simply never
// reached on an earlier frontier — which is why `set_firm_document_limits` needs no condition and
// its cohort's bimodal guard exists only for the dead-exemption check. A name REMOVED from ALLOWED
// is the opposite: below the retiring migration's frontier the body is STILL LIVE and STILL
// granted, so removing the exemption makes both consumers hard-FAIL rather than skip —
// `clara_authenticated EXECUTE clara.create_account_set_v1: expected false, got true` (T17,
// opcen.1) and an `unattributed` finding (opcen.7's own HARD label). Measured on clara_l10 inside
// a rolled-back transaction: with the pre-0271 catalog state recreated, both fired.
//
// SO THE EXEMPTION STAYS WHILE THE BODY CAN STILL BE LIVE, and it is deliberately NOT a cohort:
// `cohortFailures()` is the dead-exemption instrument, and above 0271's frontier this name is
// SUPPOSED to be absent from the catalog while its exemption survives here — the one shape that
// instrument reports. The retirement itself is asserted from the other side, by
// `client-financial-pack.test.mjs`'s `p660.census.pins_unmoved` (frontier-gated on the
// `retire_create_account_set_v1$` stem), and by 0271's own tail.
//
// SCHEDULED REMOVAL, not a permanent carve-out: drop this roster and its spread below once every
// rig and every frontier leg this package runs against carries 0271 (i.e. after the riders wave-2
// integration lands and the frontier matrix's legs are re-cut above it). F-A3 PR-3's own
// retirements (propose_bank_rule and the twelve names beside it, TIEOUT_0040_* above) were
// removed outright with no window because they merged long before any frontier leg could stand
// between their creation and their drop; this one cannot, because 0271 is unmerged.
const RETIRED_0271_HUMAN_FNS = ["create_account_set_v1"];
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
// F-A7 gamma (Wave-F Track A, the egress train, window D1-gamma): the firm-narrow typed-egress
// family's four owner verbs, mirroring WAVE_B_0020_HUMAN_FNS' shape for the client-scoped
// family exactly (owner floor body-enforced, no agent/wake EXECUTE) + the runtime dispatch
// preparer, mirroring WAVE_B_0020_RUNTIME_FNS' prepare_egress_dispatch. Its own cohort per the
// "wholly present or wholly absent" rule (the STATEMENT_F_A1_PR4_COHORT precedent above): this
// migration also widens the CLIENT-scoped family's CoR'd bodies (grant/activate/deactivate/
// revoke_client_egress_purpose, prepare_egress_dispatch) but adds no NEW client-scoped names —
// those four stay in WAVE_B_0020_HUMAN_FNS / WAVE_B_0020_RUNTIME_FNS, byte-unmoved as rosters.
const F_A7_GAMMA_HUMAN_FNS = [
  "grant_firm_egress_purpose", "activate_firm_egress_purpose",
  "deactivate_firm_egress_purpose", "revoke_firm_egress_purpose",
];
const F_A7_GAMMA_RUNTIME_FNS = ["prepare_firm_egress_dispatch"];
export const F_A7_GAMMA_COHORT = [...F_A7_GAMMA_HUMAN_FNS, ...F_A7_GAMMA_RUNTIME_FNS];
// F-A3 PR-1a — THE NINE PURE CORE EXTRACTIONS (survey census rows C1/C2/C3, "extend with the new
// ungranted cores; no name leaves"). Its OWN cohort rather than additions to BANK_0038_*,
// TIEOUT_0040_* and AF2_0044_*, for exactly the reason the PR-4 block above records: a fold-in
// would report a PARTIAL cohort on every database that has 0038/0040/0044 but not yet PR-1a — a
// false failure on a chain that is simply short of this wave. The three parent cohorts keep
// their names unchanged, which is the "no name leaves" half.
//
// All nine are UNGRANTED internal delegates (the one-ungranted-core law, 0004:6-12). Declaring
// them here is what turns a future accidental grant into a FAILURE instead of a silent pass, and
// it is the compensating assertion for the extraction: the public verbs kept their ACLs, so the
// only way this factoring could widen the surface is a grant landing on a core.
const EXTRACTION_F_A3_PR1A_UNGRANTED_FNS = [
  "_match_bank_line_core", "_unmatch_bank_match_core", "_complete_bank_reconciliation_core",
  "_void_bank_reconciliation_core", "_resolve_bank_line_exception_core",
  "_resolve_and_book_bank_line_core", "_void_bank_statement_core", "_add_bank_account_core",
  "_upsert_account_core",
];
export const EXTRACTION_F_A3_PR1A_COHORT = [...EXTRACTION_F_A3_PR1A_UNGRANTED_FNS];
// F-A7 pi (train position 1, additive-only — 11 new functions, D1 inventory EMPTY): the
// firm-open-questions door and the identifier-promotion card each get two human verbs
// (bookkeeper+ floor body-enforced via `_human_ctx`), clara_authenticated ONLY; agent/wake/
// runtime gain ZERO EXECUTE anywhere in this file (tail section 8 asserts it in-migration).
// The name-family predicate (`name_family_token`/`_candidates`/`_is_ambiguous`), both `_core`s
// and the receipt-surface introspection pair are UNGRANTED to every application role — declaring
// them here is what makes a future accidental grant FAIL rather than pass silently.
const F_A7_PI_HUMAN_FNS = [
  "resolve_firm_question", "dismiss_firm_question",
  "confirm_identifier_promotion", "decline_identifier_promotion",
];
const F_A7_PI_UNGRANTED_FNS = [
  "_firm_question_core", "_identifier_promotion_core",
  "name_family_token", "name_family_candidates", "name_family_is_ambiguous",
  "_assert_receipt_surface_conforms", "agent_receipt_source_census", "agent_receipt_dark_rows",
];
export const F_A7_PI_COHORT = [...F_A7_PI_HUMAN_FNS, ...F_A7_PI_UNGRANTED_FNS];
// F-A9 PR-1A — the LLM usage ledger reshape. Its OWN cohort per the "wholly present or wholly
// absent" rule (0024's note): folding these into an earlier wave's cohort would make a
// pre-PR-1A database report a PARTIAL cohort.
//   record_agent_usage_event — the second door (design SS3.2): clara_runtime ONLY, mirrors
//     record_llm_usage_event's own runtime-only shape (WITNESS_F_A1_RUNTIME_FNS above) —
//     no human writes metering.
//   get_llm_usage_summary — the monthly rollup (design SS3.7): clara_authenticated ONLY, its
//     own jwt_firm() wall body-enforced (the estate's floor-body-enforced idiom).
//     #635 [0233] RECUT IT, BODY ONLY: the rollup is now ADMIN-FLOORED as well — its first
//     statement is clara._human_ctx(clara.role_rank('admin')), ahead of the same jwt_firm()
//     wall. Its GRANT LINE IS UNCHANGED (create or replace preserves the ACL; 0233 re-issues
//     none and its §C asserts the ACL is byte-identical to the pre-image), so this roster entry
//     and the grant-matrix sweep below are unaffected. The name is ALSO a member of
//     FIRM_COMMERCIAL_0233_COHORT, which is what makes a half-applied 0233 visible.
// UNGRANTED: clara._tf_llm_price_no_overlap, the price-table overlap wall's statement-level
// trigger function — no application role, PUBLIC included, may reach it; the sweep's
// expected=false on every role IS the assertion (0038's own trigger-fn revoke idiom).
const F_A9_PR1A_RUNTIME_FNS = ["record_agent_usage_event"];
const F_A9_PR1A_HUMAN_FNS = ["get_llm_usage_summary"];
const F_A9_PR1A_UNGRANTED_FNS = ["_tf_llm_price_no_overlap"];
export const F_A9_PR1A_COHORT = [
  ...F_A9_PR1A_RUNTIME_FNS, ...F_A9_PR1A_HUMAN_FNS, ...F_A9_PR1A_UNGRANTED_FNS,
];
// F-A5 PR-2 [Wave F Track A, reporting agency] -- the GRANTED SURFACE annex A.1 enumerates.
// Its own cohort (0090-0095's "wholly present or wholly absent" reasoning): folding these into
// an earlier wave's list would red every pre-PR-2 database.
//   the SEVENTEEN wrappers -- clara_wake_interactive ONLY, 'interactive' kind (never
//   'proactive'); design SS3.1 A.1. wake_enqueue_render_job is NOT among them on purpose --
//   _enqueue_render_job_core is reachable only internally (from _seal_report_dataset_core and
//   the human clara.enqueue_render_job), so it carries no wrapper and no grant.
//   the NINE new ungranted cores PR-2 mints (PR-1's own eight -- six extractions +
//   evaluate_fs_pack_agent_v1 + _agent_approve_metric_definition_core -- carry no roster entry
//   here either, by the same "expected false is the default" reasoning that let PR-1 land with
//   no change to this file at all). Declaring them here turns a future accidental grant into a
//   FAILING test rather than a silently-widened wall.
const F_A5_PR2_WAKE_FNS = [
  "wake_open_report_run", "wake_evaluate_report_pack", "wake_seal_report_dataset",
  "wake_assess_report_claim", "wake_seal_report_artifact", "wake_requeue_render_job",
  "wake_approve_metric_definition", "wake_supersede_metric_definition", "wake_reject_metric_definition",
  "wake_create_account_set", "wake_mint_metric_input_snapshot",
  "wake_publish_chart_template_version", "wake_publish_report_template_version",
  "wake_report_run_state", "wake_report_claim_state", "wake_report_artifact_index",
  "wake_metric_definition_index",
];
const F_A5_PR2_UNGRANTED_FNS = [
  "_agent_reject_metric_definition_core", "_agent_supersede_metric_definition_core",
  "_agent_mint_metric_input_snapshot_core", "_agent_create_account_set_core",
  "_requeue_render_job_core", "_report_run_state_core", "_report_claim_state_core",
  "_report_artifact_index_core", "_metric_definition_index_core",
];
export const F_A5_PR2_COHORT = [...F_A5_PR2_WAKE_FNS, ...F_A5_PR2_UNGRANTED_FNS];
// F-A5 PR-3 [Wave F Track A, reporting agency] -- the signed-original archive doors (design
// SS3.8, annex A.5). Its OWN cohort, same "wholly present or wholly absent" reasoning as PR-2's
// block above: folding these into PR-2's list would red every pre-PR-3 database.
//   archive_signed_original  -- bookkeeper+, over the unmodified F-A5 PR-1 seal core
//   retrieve_signed_original -- bookkeeper+, audited BEFORE it returns, regenerates nothing
// Both are clara_authenticated ONLY -- neither is a wake-sibling verb (TA-P14 (2)'s human-act
// roster, A.4): agent/wake/runtime gain ZERO EXECUTE, asserted in-migration by the file's own
// tail census over all seven named roles.
const F_A5_PR3_HUMAN_FNS = ["archive_signed_original", "retrieve_signed_original"];
export const F_A5_PR3_COHORT = [...F_A5_PR3_HUMAN_FNS];

// F-A5b PR-1 [Wave-F Track A, the sandbox export lane's DB layer]: three grant tiers -- the wake
// wrappers (mint/request/state), the clara_runtime worker verbs (payload/complete/fail, lease-
// scoped), and the human doors (register/supersede recipient, admin+; list, bookkeeper+). No
// claim_sandbox_export verb ships here (design annex A.2 enumerates none; presumed PR-3's own
// dispatch-wiring, flagged in the migration's own header).
const F_A5B_PR1_WAKE_FNS = ["wake_mint_sandbox_view", "wake_request_sandbox_export", "wake_sandbox_export_state"];
const F_A5B_PR1_RUNTIME_FNS = ["sandbox_export_payload", "complete_sandbox_export", "fail_sandbox_export"];
const F_A5B_PR1_HUMAN_FNS = ["register_export_recipient", "supersede_export_recipient", "list_sandbox_exports"];
export const F_A5B_PR1_COHORT = [...F_A5B_PR1_WAKE_FNS, ...F_A5B_PR1_RUNTIME_FNS, ...F_A5B_PR1_HUMAN_FNS];
// FS-7 ECHELON 2 [the ONE generic artifact download door, 裁-96② / 裁-118]: TWO granted names and a
// THIRD that is deliberately granted to nobody.
//
// The split is the whole design, so the roster is where it has to be legible. The BYTE door
// (get_artifact_for_human_read) returns a `storage_key` and is clara_runtime ONLY — the
// clara.get_document_for_human_read idiom exactly (WAVE_A_RUNTIME_FNS above): the trusted-ingress
// route validates a human session JWT and passes the resolved subject, and the DATABASE decides
// what that subject may see. Putting it on clara_authenticated would hand a storage path to the
// browser, which is the thing 裁-96② forbids.
//
// The OFFER door (list_downloadable_artifacts) is clara_authenticated ONLY and returns NO
// storage_key ever — it is what tells the Reports tab whether a Download control may appear, so the
// control is never a dead link. Bookkeeper floor, body-enforced, like every human reporting read.
//
// clara._artifact_download_core — the GATE both doors call — appears in NEITHER list and in no
// cohort, because it is granted to nothing at all. The migration's own tail censuses that
// positively (its EXECUTE grantee set must read exactly `clara_fn_owner`), and this roster's
// expected-false sweep is the second, independent proof of the same fact.
const FS7_E2_DOWNLOAD_RUNTIME_FNS = ["get_artifact_for_human_read"];
const FS7_E2_DOWNLOAD_HUMAN_FNS = ["list_downloadable_artifacts"];
// #620 [0190, the SUCCESSOR source-document byte door]: ONE granted name, on the same lane and for
// the same reason as v1 (WAVE_A_RUNTIME_FNS' get_document_for_human_read, above) and as the
// artifact byte door one line up — it returns `storage_path`, so clara_runtime holds EXECUTE and
// no browser, agent or wake role ever does.
//
// IT SITS BESIDE v1 AND NOT INSTEAD OF IT, deliberately. #620 adds a successor rather than
// recutting clara.get_document_for_human_read(uuid,uuid), whose exact ACL row is pinned inside
// migration 0011's own tail (0011:4238) and rostered here and in wave-a-helpers.mjs. Both names are
// runtime-granted until the route has been on v2 in production and a later migration retires v1;
// a roster that swapped them would make this file disagree with 0011 in the meantime.
const DOC_DOWNLOAD_0190_RUNTIME_FNS = ["get_document_for_human_read_v2"];
export const DOC_DOWNLOAD_0190_COHORT = [...DOC_DOWNLOAD_0190_RUNTIME_FNS];
// F-A5b CARD 1 [Wave-F Track A, the substitution seam]: TWO grant tiers, and no human one — card 1
// mints no new human door. The wake tier is the stage-(b) preview composer; the runtime tier is the
// sandbox job family's claim/dispatch/reap quartet, which PR-1 deliberately did not ship (its own
// header registers the gap) and which nothing could render end to end without.
// clara.evaluate_metric_v2 is NOT in this cohort: it is clara_authenticated-granted like its v1
// twin, not a wake or runtime verb, and its own grant is censused by the migration's tail.
const CARD1_SEAM_WAKE_FNS = ["wake_compose_metric_preview_v2"];
const CARD1_SEAM_RUNTIME_FNS = [
  "claim_sandbox_export", "sandbox_dispatch_begin", "sandbox_dispatch_record",
  "reap_exhausted_sandbox_exports",
];
export const CARD1_SEAM_COHORT = [...CARD1_SEAM_WAKE_FNS, ...CARD1_SEAM_RUNTIME_FNS];
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
  // ticket 1012 (0288_seeding_lane_retired.sql): tick_seeding_proposal and
  // decline_seeding_proposal are RETIRED IN PLACE -- each body is one typed refusal (CLR34
  // seeding_lane_retired). They stay HERE, at their exact human-lane grants, on purpose: a
  // revoked grant would answer 42501 insufficient_privilege instead of the retirement, which is
  // the wrong sentence and the wrong shape for the web layer's refusal mapping. So this matrix
  // is unchanged BY DESIGN, and that is the fact this comment records.
  "tick_seeding_proposal", "decline_seeding_proposal", "complete_seeding_batch",
  "cancel_seeding_batch", "get_lint_finding", "resolve_lint_finding",
];
const WAVE_B_RUNTIME_FNS = [
  "publish_wiki_page_version", "record_wiki_source_ingest",
  "set_wiki_synthesis_hold", "clear_wiki_synthesis_hold",
  "update_onboarding_plan", "record_opening_targets_parsed",
  // ticket 1012 (0288): RETIRED IN PLACE, runtime grant preserved -- see the note on the two
  // deciders in WAVE_B_HUMAN_FNS above for why a retired door keeps its grant.
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

// 0028 — the vendor identity binding ceremony (task #36). All five bodies are real, resolvable
// functions throughout — its own EXISTENCE cohort per the "wholly present or wholly absent"
// discipline (see 0024's note above) still names all five, unconditionally, forever: folding it
// into 0027's would make a 28-migration database report a PARTIAL cohort one migration early,
// and #921 [0273] narrows a GRANT below, never this roster (D6 keeps every door; "Out of
// scope: removing the lane's tables, doors or historical rows").
const VENDOR_BINDING_0028_ALL_FNS = [
  "propose_vendor_identity_binding", "sign_vendor_identity_binding",
  "revoke_vendor_identity_binding", "list_vendor_bindings", "get_vendor_binding",
];
export const VENDOR_BINDING_0028_COHORT = [...VENDOR_BINDING_0028_ALL_FNS];

// #921 [0273] (2026-09-20/21): NARROWED from all five to the three D6 keeps as human doors —
// propose and sign are RETIRED for the human lane (migration 0273's own REVOKE; clara_authenticated
// now gets 42501 on both, proven by vendor-binding-write-doors-revoked.test.mjs) but NEITHER is
// DROPPED, so both stay in VENDOR_BINDING_0028_ALL_FNS's existence cohort above and simply drop
// out of the clara_authenticated GRANT expectation here. UNLIKE #1003's [0271] retirement
// window, this needs no bimodal arm: a REVOKE (not a DROP) never changes whether the function
// EXISTS, only whether it is GRANTED, and grantMatrixFailures() below judges every name it finds
// live in the catalog on EVERY frontier — an unlisted name simply reads as the correct
// `expected=false` on both sides of 0273 once this file's own edit lands, with no frontier
// window to hide behind. (No other lane's own local copy of this file yet knows about 0273 —
// each lane discovers this same edit only when the wave integrates.)
const VENDOR_BINDING_0028_HUMAN_FNS = [
  "revoke_vendor_identity_binding", "list_vendor_bindings", "get_vendor_binding",
];

// 裁-18b PR-1 — the Clara vendor-binding PROPOSAL door. Human doors on the clara_authenticated
// surface: its named reset (a decline suppresses BOTH proposal writers, so there must be a way
// out — #921 leaves this door untouched: it lifts a decline on an ALREADY-EXISTING historical
// row, exactly the "in-flight legacy visibility" D6 keeps), eligible_binding_signer_count (the
// sign dialog reads it to know whether to ask for 裁-32's self-approval attestation) and
// binding_identity_review (a read-only review list; it revokes nothing). `decline_vendor_
// identity_binding` was REMOVED from this array by #921 [0273] — the third of the three doors
// that migration revokes from clara_authenticated (propose and sign are 0028's own, above);
// like them, it is retired-but-live, so it drops out of the GRANT expectation without leaving
// this file's existence tracking (it carries none of its own here — see this block's own header:
// "Written down UNCONDITIONALLY, unlike the closed-world ROSTERS"). Written down UNCONDITIONALLY,
// unlike the closed-world ROSTERS this PR also touches: grantMatrixFailures sweeps the LIVE
// catalog and only judges functions that exist, so a name here that a pinned-frontier chain has
// not got is simply never reached.
const BINDING_PROPOSAL_PR1_HUMAN_FNS = [
  "reset_binding_decline", "eligible_binding_signer_count", "binding_identity_review",
];
/** …and the two wake verbs, on `filing` AND `interactive` (G1 arm A) — the same chat-parity
 *  shape wake_file_document already set: one allowlist row per kind, the grant on both roles. */
const BINDING_PROPOSAL_PR1_WAKE_FNS = [
  "wake_propose_vendor_identity_binding", "wake_list_binding_candidates",
];

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
  // propose_bank_rule / sign_bank_rule / retire_bank_rule RETIRED at F-A3 PR-3 (Annex I, the
  // rules machine retires whole) -- removed rather than left dead, per this cohort's own law.
  "set_counterparty_terms",
];
const TIEOUT_0040_READ_FNS = [
  "ar_aging", "ap_aging", "customer_statement", "supplier_statement",
  // list_bank_line_suggestions / list_bank_rule_candidates / list_bank_rules RETIRED at
  // F-A3 PR-3 (Annex I) -- removed rather than left dead.
  "list_unmatched_lines", "get_bank_reconciliation",
  // 0040 FIX WAVE A7: the bitemporal receipt law's missing verifier. A READ (bookkeeper floor,
  // raises nothing) that recomputes _bank_recon_terms under a stored receipt's own completed_at
  // and reports the diff -- so the same wall applies: human lane only, no machine role.
  "verify_bank_reconciliation",
];
const TIEOUT_0040_UNGRANTED_FNS = [
  "_bank_recon_terms", "_tf_bank_recon_belt", "_tf_bank_settled_authority_belt",
  "_subledger_outstanding_asof",
  // _bank_rule_pattern_norm / _bank_rule_sightings RETIRED at F-A3 PR-3 (Annex I) -- removed.
  // _bank_desc_word_match / _bank_rule_regex_escape / _bank_line_class_hint are KEPT: F-A3
  // PR-3's own caller census found _bank_line_class_hint still calls the first two, and
  // _bank_line_class_hint itself is still called by _agent_get_bank_pack_core and
  // list_unmatched_lines -- all three stay on this ungranted roster unchanged.
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
// HISTORICAL: 0044 created clara.accept_bank_rule_suggestion — the `bank_rule_suggested`
// producer — and 0045 deliberately shipped its `grant execute … to clara_authenticated`
// alongside clara._adj_on_approve arm (3), the re-validation body that reads the producer's
// output. F-A3 PR-3 RETIRES accept_bank_rule_suggestion whole (Annex I, the rules machine
// retires whole) — the grant this const once named no longer has a function to attach to, so
// the entry is removed rather than left dead, per this cohort's own law. Arm (3) itself is NOT
// retired (F-A3 PR-3's own caller census: it still re-validates any pre-existing draft still
// carrying flags ? 'bank_rule_suggested' at deploy time, through the two helpers PR-3 kept).
const ADJ_0045_PRODUCER_GRANT_FNS = [];
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
// preview_ocr_sales_evidence RETIRED with F-A2 PR-3 (Annex B.1) — it retires with the floor
// it read (_ocr_sales_floor / _ocr_sales_floor_pop, both dropped in the same file).
const SALES_LANE_0046_READ_FNS = ["list_sales_backfill_batches"];
// The definer internals, named so their absence from every role set is a DECLARED
// expectation the cohort carries rather than a silent default (the 0020 block's reasoning).
//
// clara.set_sales_lane_activation IS IN THIS LIST ON PURPOSE AND IS THE POINT OF IT. 7A-R1
// rules that the activation flip belongs to the owner/deploy connection alone, so it is
// granted to NO application role — and the main sweep, which expects `false` for every role
// not listed in ALLOWED, is what turns that ruling into a test. If a future migration ever
// grants it, this file fails and somebody has to say so out loud.
// _ocr_sales_floor_pop RETIRED with F-A2 PR-3 (Annex B.1), alongside _ocr_sales_floor itself.
const SALES_LANE_0046_UNGRANTED_FNS = [
  "_sales_lane_active", "_autodraft_direction_tri",
  "_sales_admission_open", "set_sales_lane_activation",
];
export const SALES_LANE_0046_COHORT = [
  ...SALES_LANE_0046_HUMAN_FNS, ...SALES_LANE_0046_READ_FNS, ...SALES_LANE_0046_UNGRANTED_FNS,
];

// H-17 / H-19 [0176_counterparty_alias_kind_scope, numbered at merge] — the kind-scoped
// alias unique and the owner-floored sales-lane wrapper.
//
// THIS IS A SEPARATE COHORT FROM 0046's ON PURPOSE, and the reason is mechanical: cohortFailures
// reports a PARTIAL roster and stays silent on a WHOLLY absent one, so adding these names to
// SALES_LANE_0046_COHORT would red every pre-migration chain — 0046's own names resolve there and
// these two do not. Both land in ONE migration, so this cohort is bimodal exactly as F-A6's is.
//
// AND THE TWO ROSTERS SAY OPPOSITE THINGS ABOUT THE SAME SWITCH, WHICH IS THE POINT. 7A-R1 ruled
// the activation flip belongs to the owner/deploy connection alone, and
// `clara.set_sales_lane_activation` STAYS in SALES_LANE_0046_UNGRANTED_FNS above, still expected
// false for every role — H-19 does not grant it and 0046's own ACL cell would red if it did. What
// H-19 adds is a NEW wrapper that takes no firm at all (the firm comes from `_human_ctx` at the
// owner rank), and that one is granted to clara_authenticated. So the census now carries both
// halves of the ruling side by side: the un-walled signature reachable by nobody, the walled
// wrapper reachable by the human lane.
const H17_H19_HUMAN_FNS = ["set_firm_sales_lane_activation"];
// Named so its absence from every role set is a DECLARED expectation rather than a silent
// default (the 0020 block's reasoning). It is a SECURITY DEFINER trigger body: the trigger calls
// it, and nothing else may. The first cut of that migration left PUBLIC holding EXECUTE on it —
// see T17b's own note that `alter default privileges … revoke execute from public` is a NO-OP
// against PostgreSQL's hardwired default — so this row is a real expectation, not a formality.
const H17_H19_UNGRANTED_FNS = ["_tf_counterparty_alias_kind"];
export const H17_H19_COHORT = [...H17_H19_HUMAN_FNS, ...H17_H19_UNGRANTED_FNS];

// ---------------------------------------------------------------------------
// F-A6 PR-1 [Wave-F Track A] — the audited freeform read. The ENUMERATED EXECUTE surface of
// clara_freeform_ro, and the reason it is a cohort rather than a loose list: A.2 is a CLOSED
// SEVEN, cemented by the migration's own tail, and this roster is the test-side twin. The
// ungranted core is named among the internals so its ABSENCE from every role set is a DECLARED
// expectation rather than a silent default — v1's GB-2 defect was exactly a core that was
// described as ungranted in one place and granted in another.
// CORRECTED (narrow re-review round, MF-1's own fix): the register's original 5+2 split --
// 5 genuinely granted plus wake_firm/shares_my_firm_wake as "shared, policy-only, unprobed" --
// went stale the moment MF-1 swapped all 35 policies off those two 0004/0011 helpers onto
// _freeform_firm()/_freeform_shares_firm() and cleared the wake secret before either old
// reader could fire. `wake_firm`/`shares_my_firm_wake` are no longer called by ANY F-A6 object
// (policy or body) and are no longer granted -- keeping them in this expected set would have
// made the roster the ONLY thing NOT re-derived when the fix landed, silently green only
// because `policyHelperNames()` launders policy-referenced functions into allowedBroadly
// regardless of which functions those actually are.
const FREEFORM_F_A6_GRANTED_FNS = [
  "wake_freeform_read", "_freeform_arm", "_freeform_settle",
  "_freeform_scope_clients", "_freeform_admitted",
  "_freeform_firm", "_freeform_shares_firm",
];
const FREEFORM_F_A6_UNGRANTED_FNS = [
  "_freeform_core", "_tf_freeform_settle_once", "_tf_freeform_must_settle",
];
export const FREEFORM_F_A6_COHORT = [...FREEFORM_F_A6_GRANTED_FNS, ...FREEFORM_F_A6_UNGRANTED_FNS];
// No shared-but-ungranted helper remains: the two functions that once filled this role
// (wake_firm, shares_my_firm_wake) are gone from both the grant AND every F-A6 policy.
// _freeform_firm()/_freeform_shares_firm() replaced them as GENUINELY GRANTED members of
// FREEFORM_F_A6_GRANTED_FNS above, not as a second unprobed category -- so this set is now
// empty on purpose, kept as a named export rather than deleted so a future re-introduction of
// a policy-only helper has an obvious place to land instead of a fresh ad hoc array.
const FREEFORM_F_A6_SHARED_FNS = [];

// F-A3/PR-1b [bank-agency agent limb] the one human door: set_bank_agency_hold. A named cohort
// (nit, opus consolidated round) rather than a bare inline string, so a future rename/retire
// of this one function is caught by the closed-roster dead-exemption sweep like every other
// wave's own cohort, instead of silently going stale as an unwrapped literal.
export const BANK_AGENCY_F_A3_PR1B_COHORT = ["set_bank_agency_hold"];

// #618 — the clara_wake_bank EXECUTE roster. 0121 §K/§L's THIRTEEN wake_* bank wrappers (its
// own tail census asserts each grants EXECUTE to clara_wake_bank and to no other grantee) plus
// 0129's wake_book_staff_advance_application, which that file grants to clara_wake_bank ALONE.
// Declared once and used by BOTH the clara_wake_bank key and its NOLOGIN member shell below,
// so the two can never drift apart while claiming to census both sides of one membership.
export const BANK_AGENCY_WAKE_BANK_FNS = [
  "wake_add_bank_account", "wake_book_staff_advance_application",
  "wake_complete_bank_reconciliation", "wake_get_bank_pack", "wake_match_bank_line",
  "wake_propose_bank_identifier_promotion", "wake_propose_bank_line_exception",
  "wake_resolve_and_book_bank_line", "wake_resolve_bank_line_exception",
  "wake_settle_from_bank_line", "wake_unmatch_bank_match", "wake_upsert_account",
  "wake_void_bank_reconciliation", "wake_void_bank_statement",
];

// Gate G1 [the universal wake-execution engine] the one human door: set_wake_source_enabled, an
// OWNER-floor idempotent upsert on a wake_engine_sources row (body-enforced floor; the estate-wide
// analogue of set_bank_agency_hold's own per-client bookkeeper-floor cohort above — a named cohort
// for the identical reason, so a future rename/retire is caught by the dead-exemption sweep rather
// than going silently stale). clara._settle_wake_task is deliberately ABSENT from every roster
// (zero grants to any role) — the sweep's expected=false for it needs no entry.
export const G1_WAKE_ENGINE_COHORT = ["set_wake_source_enabled"];
// clara._settle_wake_task is clara_runtime ONLY (its one real caller — the reconciler belt and
// the engine's own claim path, the settle_chat_turn precedent) — a separate cohort since it
// lands in ALLOWED[ROLES.runtime], not the human-lane roster above.
export const G1_WAKE_ENGINE_RUNTIME_COHORT = ["_settle_wake_task"];

// F-A3/PR-3 [retirement + parity + doors] the one NEW human door: confirm_bank_identifier_promotion
// (OQ-8's deferred confirm half — bookkeeper floor, body-enforced; agent + both wake roles gain
// ZERO, matching every other confirm/settle door on this roster). book_staff_advance_application
// itself is NOT listed here: PR-3 factors it onto the PR-1a wake shape (a thin delegator), but
// its clara_authenticated grant is byte-unmoved from ADV_0043_HUMAN_FNS's own entry, so no new
// grant-matrix row is owed for it.
export const BANK_AGENCY_F_A3_PR3_COHORT = ["confirm_bank_identifier_promotion"];

// F-A4 PR-1c [Wave-F Track A, the CLOSE-DOMAIN AGENT LIMB] — three grant tiers plus a closed
// ungranted set, declared as ONE cohort for the same "wholly present or wholly absent" reason
// F-A5's PR-2/PR-3 split uses: folding these into an earlier wave's list would red every
// pre-PR-1c database, and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the TWELVE wake wrappers — clara_wake_interactive ONLY (design close-key-1 Annex E.1's own
//   grant column), reached by clara_wake_write_login. The design ruled THIRTEEN;
//   wake_establish_prepayment_schedule was PARKED on two measured blockers (its delegates had no
//   extracted cores, and Annex B.2's "term from the bound document's facts" named no DB-owned
//   carrier) — see 0138's own header.
//   *** THE PARK IS OVER: F-A4 PR-2a UNPARKS IT. *** Under R6 the unpark SHRANK to one core
//   extraction (signing stays a human ADMIN act), and the carrier now exists as
//   clara.document_service_periods. The thirteenth name is NOT added to this list on purpose: it
//   lives in F_A4_PR2A_COHORT below, so this twelve-name cohort stays TRUE of a PR-1c-only
//   estate — cohortFailures() fails a PARTIAL cohort by design, so folding it here would red
//   every 0138-only database (design Annex B.3, measured not assumed).
const F_A4_PR1C_WAKE_FNS = [
  "wake_list_fiscal_years", "wake_get_close_plan", "wake_get_close_readiness", "wake_verify_close",
  "wake_snapshot_state", "wake_dry_run_close_readiness", "wake_open_fiscal_year", "wake_begin_close",
  "wake_abandon_close", "wake_propose_close", "wake_run_depreciation_catchup",
  "wake_mint_month_snapshot",
];
//   the clock's two runtime verbs — clara_runtime ONLY. close_prep_due is the due oracle (Annex
//   B.1: "the wake roles never ask" — she learns a year is due by being WOKEN); the sibling
//   minter mirrors mint_wake_credential's own grant (0011:1196-1197).
const F_A4_PR1C_RUNTIME_FNS = ["close_prep_due", "mint_wake_credential_for_task"];
// F-A4 PR-2c is its own bimodal cohort: a PR-1c-only estate must remain wholly valid.
const F_A4_PR2C_RUNTIME_FNS = ["mint_chat_close_credential"];
const F_A4_PR2C_UNGRANTED_FNS = ["_assert_wake_task_congruent", "_assert_attended_close_floor"];
export const F_A4_PR2C_COHORT = [...F_A4_PR2C_RUNTIME_FNS, ...F_A4_PR2C_UNGRANTED_FNS];
//   the three human doors — clara_authenticated ONLY, floors body-enforced (bookkeeper+). The
//   agent identity and BOTH wake roles gain ZERO: a brake the agent lane could lift off itself
//   is not a brake, and a receipt panel is a human audit control.
//   settle_close_proposal joins them at the conductor's ruling on this train: Annex I.1's review
//   card offers adopt/decline, attest_close_exception READS a proposal without settling it, and
//   without this door `adopted`/`withdrawn` are unreachable values on a live CHECK. Its floor is
//   attest_close_exception's own (bookkeeper + close_and_attest), so it sits at the same tier as
//   the other three and the wake roles gain ZERO on it.
const F_A4_PR1C_HUMAN_FNS = [
  "hold_close_prep", "release_close_prep", "list_agent_act_receipts", "settle_close_proposal",
];
//   the ungranted internals — every agent core, ladder helper, extracted read core and trigger
//   function the limb ships. Declaring them turns a future accidental grant into a FAILING test
//   rather than a silently-widened wall. `_adjustment_run_due_core` / `_depreciation_run_due_core`
//   are OQ-9(a)/R-L11's additive extractions BELOW each live oracle's own admission — the live
//   verbs keep their grants and their _assert_due_read_ctx, so x42.d8's closed census is unmoved.
const F_A4_PR1C_UNGRANTED_FNS = [
  "_wake_task_id", "_close_subject_client", "_close_expected_op_key", "_close_wake_ctx",
  "_close_prep_hold_active", "_close_tier_b_common", "_close_drawer1_unclean",
  "_close_belt_period_unrun", "_close_reopen_correction_in_flight", "_agent_close_receipt",
  "_close_read_gate", "_agent_close_read_core", "_agent_open_fiscal_year_core", "_agent_begin_close_core",
  "_agent_abandon_close_core", "_agent_close_proposal_core", "_agent_depreciation_catchup_core",
  "_agent_mint_month_snapshot_core", "_list_fiscal_years_core", "_close_readiness_core",
  "_verify_close_core", "_adjustment_run_due_core", "_depreciation_run_due_core",
  "_tf_close_proposals_settle_only", "_tf_close_prep_holds_release_only",
  "_tf_assert_close_agent_receipt",
];
export const F_A4_PR1C_COHORT = [
  ...F_A4_PR1C_WAKE_FNS, ...F_A4_PR1C_RUNTIME_FNS, ...F_A4_PR1C_HUMAN_FNS,
  ...F_A4_PR1C_UNGRANTED_FNS,
];

// ---------------------------------------------------------------------------------------------
// F-A4 PR-2a — THE PREPAYMENT LIMB. Its own cohort, NEVER folded into PR-1c's (design Annex B.3):
// folding would red every 0138-only database, because cohortFailures() tolerates a WHOLLY absent
// cohort and fails a PARTIAL one by design. That is measured behaviour, not an assumption.
//
//   THE THIRTEENTH WAKE WRAPPER. PR-1c's roster above names TWELVE and records the thirteenth as a
//   deliberate absence; PR-2a UNPARKS it, and the fold-seam law says a gate pinning a defect must
//   flip when the defect is fixed. It lives here rather than in that list so the twelve-name
//   cohort stays true of a PR-1c-only estate.
const F_A4_PR2A_WAKE_FNS = ["wake_establish_prepayment_schedule"];
//   the one human door — clara_authenticated ONLY, bookkeeper floor body-enforced. HUMAN-ONLY BY
//   LAW (design §13 item 3): a service period read off a document by a model is a model-generated
//   value, so there is no wake wrapper for it and never will be under hard constraint 2.
const F_A4_PR2A_HUMAN_FNS = ["record_document_service_period"];
//   the ungranted internals — the evaluator, the agent core, the extracted propose core, the
//   schedule resolver/canonicaliser, the carrier's two trigger functions, and the service-period
//   core built door->core from birth so Annex C's promoter has a consumer to reach for.
const F_A4_PR2A_UNGRANTED_FNS = [
  "prepayment_schedule_v1", "_agent_prepayment_schedule_core", "_propose_adjustment_template_core",
  "_adj_period_lines", "_adj_canon_schedule", "_record_document_service_period_core",
  "_tf_document_service_period_region_congruent", "_tf_dsp_supersede_only",
];
export const F_A4_PR2A_COHORT = [
  ...F_A4_PR2A_WAKE_FNS, ...F_A4_PR2A_HUMAN_FNS, ...F_A4_PR2A_UNGRANTED_FNS,
];

// P4 tranche 1 [invite/RBAC first, docs/plan/active/p4-design-2026-08-27.md]: the FOUR human
// doors — claim_identity (the identity-gap-closing door, no membership required), invite_member
// and revoke_invite (admin+), accept_invite (authenticated; walled on JWT-email = invite-email).
// clara_authenticated ONLY — agent + both wake roles gain ZERO (an invite is a human-lane act by
// its own nature: the emailed token is the credential, and there is no wake wrapper for any of
// the four). add_member itself is unlisted here because it already lived in WRITERS pre-P4 and
// its recut (this tranche extracts _add_member_core from its live body) changes no grant.
const P4T1_HUMAN_FNS = ["claim_identity", "invite_member", "accept_invite", "revoke_invite"];
//   the ungranted internals — _jwt_email (the JWT email-claim reader) and the two law-81 cores
//   claim_identity/accept_invite and add_member/accept_invite share. _create_firm_core is
//   deliberately NOT here: it is T2's (the approval-queue tranche's) extraction, out of this
//   cohort's scope by the design's own T1/T2/T3 boundary.
const P4T1_UNGRANTED_FNS = ["_jwt_email", "_claim_identity_core", "_add_member_core"];
export const P4T1_COHORT = [...P4T1_HUMAN_FNS, ...P4T1_UNGRANTED_FNS];

// P4 tranche 2 (design §5 asks 2 + 8, 裁-11): the self-serve registration door + the operator
// approval queue. clara_authenticated ONLY — agent + both wake roles gain ZERO (an operator
// ruling is a human-lane act by its own nature, and _create_firm_core is the T2 extraction the
// P4T1 comment above already anticipated). create_firm itself is unlisted here for the SAME
// reason add_member is unlisted in P4T1's own comment: it already lived in WRITERS pre-P4, and
// its recut (this tranche extracts _create_firm_core from its live body) changes no grant.
const P4T2_HUMAN_FNS = ["request_firm_registration", "approve_firm_registration", "reject_firm_registration"];
const P4T2_UNGRANTED_FNS = ["_create_firm_core"];
export const P4T2_COHORT = [...P4T2_HUMAN_FNS, ...P4T2_UNGRANTED_FNS];

// FS-4 C-2 (checkout-gate design part 2 §1.2/§1.6): two operator-only human doors and
// the Stripe webhook lane's exact two-verb surface. The human doors are owner+operator walled
// in-body; the webhook role holds no table grants and reaches only record/apply.
const CHECKOUT_GATE_C2_HUMAN_FNS = ["list_stripe_event_problems", "resolve_stripe_event_problem"];
const CHECKOUT_GATE_C2_WEBHOOK_FNS = ["record_stripe_event", "apply_stripe_events"];
export const CHECKOUT_GATE_C2_COHORT = [
  ...CHECKOUT_GATE_C2_HUMAN_FNS, ...CHECKOUT_GATE_C2_WEBHOOK_FNS,
];

// FS-4 C-6 (`0164_checkout_gate_c6_web_reads` — number claimed at merge prep): the TWO
// read doors `apps/web`'s entry faces cannot render truthfully without. Both are
// clara_authenticated ONLY, both are STABLE SECURITY DEFINER, and neither has a wake sibling —
// there is no agent path to "which plan is current" or "how far along is MY checkout", by the
// design's own shape rather than by omission.
//   get_current_checkout_plan — the plan row's Checkout-Session collection mode (G13 / 裁-88),
//     read as a door so billing_plans keeps its zero-application-grant posture.
//   get_own_checkout_progress — the applicant's OWN checkout/payment progress, self-scoped on
//     clara.jwt_sub() and refusing CLR04 for a foreign registration. It exists because
//     checkout_intents and firm_registration_payments grant every application role NOTHING,
//     permanently, so /pending's two 裁-74 arms have no other read path.
const CHECKOUT_GATE_C6_HUMAN_FNS = ["get_current_checkout_plan", "get_own_checkout_progress"];

export const CHECKOUT_GATE_C6_COHORT = [...CHECKOUT_GATE_C6_HUMAN_FNS];

// 裁-190 web reads and small doors (`0174_web_reads_and_small_doors.sql` +
// `0175_stmt_witness_totals_and_institution_code.sql` — numbers claimed at merge prep):
// the seven backend gaps the repair-session web lanes are blocked on, plus the statement lane's
// institution resolver. Every one of the four human doors exists for the SAME reason: the
// relation that owns the fact is `force row level security` with a single clara_fn_owner policy
// and no application-role grant, so a door is the only lawful read path and a table grant would
// be the wrong fix.
//   get_own_dpa_signature        — the caller's OWN signatures, jwt_sub()-scoped and NEVER
//     parameterised (a p_user argument would be a consent oracle on a pre-firm surface).
//   client_egress_state          — one row per ratified typed egress purpose plus the legacy
//     blanket consent; bookkeeper+ READ only. The four WRITE doors stay owner-floored.
//   archive_chat_session         — author-only, one-way, audited; modelled on share_chat_session,
//     the only other lawful mutation this table has.
//   set_counterparty_identifiers — admin floor; the first and only writer of registration/tin on
//     an EXISTING counterparty (create_counterparty's INSERT was the sole producer).
// NO WAKE OR AGENT SIBLING FOR ANY OF THEM, and that is the design rather than an omission:
// nothing here is an agent act. The runtime lane gains exactly two, both below.
// list_firm_timeline RETIRED (#998, 0261): zero production callers since #659's Firm Home swap
// onto clara.list_activity — see 0261's own header for the full census. The view it paged,
// clara.firm_timeline_visible, is NOT retired and carries no cohort entry of its own (untyped by
// EXECUTE grant — it is a table-privilege SELECT, not a routine).
const WEB_READS_DOORS_HUMAN_FNS = [
  "get_own_dpa_signature", "client_egress_state",
  "archive_chat_session", "set_counterparty_identifiers",
];
// clara_runtime ONLY, and both are underscore-free-by-intent EXCEPT _stmt_institution_code,
// which keeps the statement lane's own `_stmt_*` family prefix (its siblings _stmt_header_norm /
// _stmt_lines_norm) because it is a lane-internal normaliser rather than a product verb. That
// makes it the one granted `_`-prefixed name in the estate, so it is written down HERE and in
// the two sibling censuses that treat an underscore prefix as "app-callable by nobody".
//   build_frontier          — {count, max_version} over clara.schema_migrations for the runtime
//     /build-info route. A definer rather than a table grant: the ledger is the migration
//     runner's own and a broad SELECT on it is a schema-history oracle nobody asked for.
//   _stmt_institution_code  — printed bank name/code -> the clara.bank_institutions roster code.
//     clara_runtime holds ZERO grant on that roster (0038:224-231), so the statement lane could
//     not map a printed name at all; PR #545's frozen in-workflow mirror is what this retires.
const WEB_READS_DOORS_RUNTIME_FNS = ["build_frontier", "_stmt_institution_code"];

export const WEB_READS_DOORS_COHORT = [
  ...WEB_READS_DOORS_HUMAN_FNS, ...WEB_READS_DOORS_RUNTIME_FNS,
];
// FS-4 C-3 (checkout-gate design part 2 §1.3 and part 3 §2.1): six authenticated pre-firm/
// operator-support doors plus the auth-wall lane's exact two-verb, pre-session OTP surface.
const CHECKOUT_GATE_C3_HUMAN_FNS = [
  "get_current_dpa_document", "sign_dpa", "open_checkout_intent",
  "record_checkout_session", "claim_paid_firm", "list_unconsumed_registration_payments",
];
const CHECKOUT_GATE_C3_AUTH_WALL_FNS = [
  "claim_confirmation_attempt", "settle_confirmation_attempt",
];
export const CHECKOUT_GATE_C3_COHORT = [
  ...CHECKOUT_GATE_C3_HUMAN_FNS, ...CHECKOUT_GATE_C3_AUTH_WALL_FNS,
];

// #621 (0185 legal acceptance): versioned legal CONTENT and ACCEPTANCE, for both kinds.
//   get_current_legal_documents — the current text of every kind for the calling person (the
//     published row, else the newest draft) with that caller's own acceptance beside it. A door
//     rather than a table grant for 0163's own reason: the text is a global row with no tenant
//     predicate, and the caller-scoped half is derived from jwt_sub(), not from a row filter.
//   accept_legal_document — the acceptance write. Human actors only (body-enforced), idempotent
//     by op_key on the row itself, because a pre-firm actor has no op_receipts scope.
//   publish_legal_document — the operator OWNER's configurable-content door. The rank and
//     operator-firm predicate are body-enforced (approve_firm_registration's own), so the grant
//     is the same clara_authenticated every other pre-firm door holds.
// 0185's three DEPRECATED wrappers (get_current_dpa_document, sign_dpa, get_own_dpa_signature)
// keep their existing cohort memberships above: their signatures and grants did not move.
const LEGAL_ACCEPTANCE_0185_HUMAN_FNS = [
  "get_current_legal_documents", "accept_legal_document", "publish_legal_document",
];
export const LEGAL_ACCEPTANCE_0185_COHORT = [...LEGAL_ACCEPTANCE_0185_HUMAN_FNS];

// #628 (0186 checkout convergence): the four doors the converged checkout adds, all
// clara_authenticated ONLY -- no agent, wake, runtime or Stripe-webhook sibling, by the design's
// own shape rather than by omission. Nothing here is an agent act, and the webhook lane's exact
// two-verb surface (record_stripe_event / apply_stripe_events) is unchanged by this file.
//   cancel_checkout_intent          — the APPLICANT's own way out of their checkout, so an
//     abandoned Stripe session becomes a terminal state instead of a live one nobody can clear.
//     Self-scoped on jwt_sub() and body-enforced; op_key is validated, not reserved, because a
//     pre-firm actor has no op_receipts scope (0163 §4's structural finding, taken verbatim).
//   set_admission_capacity          — the operator OWNER's estate-wide admission switch (the
//     approve_firm_registration predicate, re-derived at call time), op_receipts-idempotent with
//     a clara._audit receipt, exactly as set_wake_source_enabled (0133) does it.
//   get_admission_capacity          — {max_firms, firms_count, full} for any authenticated
//     person: the honest reason a checkout may refuse. A door rather than a table grant because
//     clara.admission_capacity is forced-RLS with a single clara_fn_owner policy, like every
//     other relation on this train.
//   get_own_checkout_intent_session — the applicant's LIVE intent (session_created | processing)
//     so the web can resume or expire its Stripe session. Deliberately NO existence oracle: a
//     foreign registration answers no row exactly as an absent one does, because this door is
//     reached from a resume control that may carry any id at all.
// The recut 0163/0164 doors (open_checkout_intent, claim_paid_firm, get_own_checkout_progress)
// keep their existing cohort memberships above: their grants did not move. 0186's ONE internal,
// clara._admission_capacity_state, is granted to NOBODY and is therefore expected-false for every
// role in the live sweep rather than listed here.
const CHECKOUT_CONVERGENCE_0186_HUMAN_FNS = [
  "cancel_checkout_intent", "set_admission_capacity", "get_admission_capacity",
  "get_own_checkout_intent_session",
];
export const CHECKOUT_CONVERGENCE_0186_COHORT = [...CHECKOUT_CONVERGENCE_0186_HUMAN_FNS];

// #843 [0263, the operator support acts on the operator firm's own timeline] — NO NEW COHORT, NO
// NEW NAME, NO GRANT CHANGE, each MEASURED rather than assumed (0263's own §T re-reads owner /
// SECURITY / settings / ACL after both recuts and refuses on drift).
// `clara.set_admission_capacity` (this cohort) and `clara.resolve_stripe_event_problem`
// (CHECKOUT_GATE_C2_HUMAN_FNS, above) are STILL the SAME two doors at their SAME signatures and
// grant: each gains ONE `clara._append_event` call inside the reservation it already held — no
// parameter, no new function, no widened or narrowed ACL — so no roster change is owed for
// either name. The file's other effect is REFERENCE DATA (two `clara.event_types` rows and their
// `clara.trigger_taxonomy` routing at the active version), which no cohort here enumerates:
// rig-meta's rosters are about function names and the grants on them, and the estate's own
// coverage law over the catalog lives in rig-events-structure.test.mjs §7, which this migration's
// tail re-reads for itself. Same "wholly present or wholly absent" reasoning #840's note (below)
// states for its own body-only recut of a different pair.
// #843 END

// #615 (0188 operator support console): the TWO reads the operator's support destination rides,
// clara_authenticated ONLY -- no agent, wake, runtime or Stripe-webhook sibling, by the design's
// own shape rather than by omission. Neither is an agent act and neither is reachable from any
// lane that executes model output.
//   list_operator_support_queue  — one row per support case across three arms (an undecided
//     registration with NO payment row, an unconsumed registration payment, an open Stripe event
//     problem), each carrying the affected entity, the checkout intent's current state and the
//     decision receipt. Authority is clara.approve_firm_registration's own predicate, body-
//     enforced and re-derived at call time, so the grant is the same clara_authenticated every
//     other operator door holds.
//   get_operator_support_case    — one case by (kind, id), with NO existence oracle: an unknown
//     id, a kind outside the closed three and a mismatched pair all answer one CLR11.
// 0188's ONE internal, clara._operator_support_cases, is granted to NOBODY and is therefore
// expected-false for every role in the live sweep rather than listed here -- the same disposition
// 0186's clara._admission_capacity_state carries.
const OPERATOR_SUPPORT_0188_HUMAN_FNS = [
  "list_operator_support_queue", "get_operator_support_case",
];
export const OPERATOR_SUPPORT_0188_COHORT = [...OPERATOR_SUPPORT_0188_HUMAN_FNS];

// #776
// #776 [0206, the operator support console's applicant-name read] — ONE granted name, its own
// frontier-tolerant cohort for the same "wholly present or wholly absent" reason every cohort here
// carries: the db-slice-frontiers matrix runs this package against databases pinned BETWEEN 0188
// and 0206, and folding this name into 0188's roster above would red every one of those legs.
//
//   resolve_operator_support_applicants — turns the applicant ids a support case already carries
//     into clara.users.display_name, for the OPERATOR FIRM'S OWNER and nobody else. Authority is
//     clara.approve_firm_registration's own predicate, byte-copied and body-enforced, so the grant
//     is the same clara_authenticated every other operator door holds — and, like them, agent,
//     both wake roles, clara_runtime and clara_stripe_webhook gain ZERO. It is not an agent act and
//     is not reachable from any lane that executes model output.
//
// NO UNGRANTED SIBLING. 0206 adds no internal and no trigger function, so this cohort is the whole
// of the file's capability surface.
const OPERATOR_APPLICANT_NAME_0206_HUMAN_FNS = [
  "resolve_operator_support_applicants",
];
export const OPERATOR_APPLICANT_NAME_0206_COHORT = [...OPERATOR_APPLICANT_NAME_0206_HUMAN_FNS];
// #776 END

// 裁-21 PR-a (`coa_template_pr_a` — number claimed at merge prep): the firm-level standard
// chart of accounts, TEMPLATE half. NINE human doors, clara_authenticated ONLY — agent + both
// wake roles + clara_runtime gain ZERO, and that is the design's own claim rather than an
// omission: 裁-21 adds no agent path to the BULK act at all (design D-5/Annex E — "one
// rationale covering forty accounts is not forty rationales"), so there is no wake sibling for
// any of these and no allowlist row is minted anywhere in this PR.
//   fork_coa_template · upsert/remove_coa_template_family · upsert/remove_coa_template_account ·
//   publish_coa_template · retire_coa_template — the seven WRITERS, admin floor body-enforced
//   via `_human_ctx(role_rank('admin'))` (gate ruling Q3: SETTING the firm's standard is a
//   policy act, using it is daily work — the bookkeeper-floored apply is PR-b's).
//   list_coa_templates · get_coa_template — the two READS, and they are INVOKER-rights on
//   purpose (the trial_balance idiom): their floor is clara_authenticated + the tables' own
//   scoped RLS, not a rank check, because db-migrations.md requires the SELECT grant that a
//   rank check inside a reader would be defeated by. Same posture as coa_accounts' own
//   p_coa_accounts_human on the real chart.
const COA_TEMPLATE_PR_A_HUMAN_FNS = [
  "fork_coa_template", "upsert_coa_template_family", "remove_coa_template_family",
  "upsert_coa_template_account", "remove_coa_template_account",
  "publish_coa_template", "retire_coa_template",
  "list_coa_templates", "get_coa_template",
];
// The FOUR internals — the content-hash helper, the shared edit guard, and the two publication
// -freeze trigger functions — are granted to NOBODY, so the sweep's expected-false is the
// assertion that they are reachable only as clara_fn_owner internals. Enumerated here (not
// omitted) so the cohort census can catch one of them being retired or renamed.
const COA_TEMPLATE_PR_A_UNGRANTED_FNS = [
  "_coa_template_content_sha256", "_coa_template_for_edit",
  "_tf_coa_template_freeze", "_tf_coa_template_child_freeze",
];
export const COA_TEMPLATE_PR_A_COHORT = [
  ...COA_TEMPLATE_PR_A_HUMAN_FNS, ...COA_TEMPLATE_PR_A_UNGRANTED_FNS,
];
// LAW 3 COMPANION (independent review, MED-3): every roster above feeds cohortFailures PRONAMES,
// and a proname is a projection of a function, not the function. A door recut to a different
// argument list, or a same-named overload landing beside it, changes what `clara_authenticated`
// can actually call while leaving every name-keyed census green. These are the EXACT signatures
// -- resolved with to_regprocedure, which fails on a wrong arg list and on an ambiguous name --
// so the roster pins the callable identity rather than its spelling.
export const COA_TEMPLATE_PR_A_SIGS = [
  "clara.fork_coa_template(uuid,text,text,text,text,text)",
  "clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)",
  "clara.remove_coa_template_family(uuid,text,text)",
  "clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)",
  "clara.remove_coa_template_account(uuid,text,text)",
  "clara.publish_coa_template(uuid,text)",
  "clara.retire_coa_template(uuid,text)",
  "clara.list_coa_templates()",
  "clara.get_coa_template(uuid)",
  "clara._coa_template_content_sha256(uuid)",
  "clara._coa_template_for_edit(uuid,uuid)",
  "clara._tf_coa_template_freeze()",
  "clara._tf_coa_template_child_freeze()",
  "clara._tf_coa_adoption_template_congruent()",
];

/** Frontier-tolerant exact-signature census: silent where the cohort has not landed (every
 *  pre-PR-a chain), and by-name where it has -- an unresolvable signature, or a second overload
 *  sharing one of these pronames, is reported rather than passed over.
 *
 *  WHO CALLS THIS, and who deliberately does NOT. It is invoked from
 *  `coa-template-pr-a.test.mjs` (cell J7), which the estate suite runs on every db PR against a
 *  chain that carries PR-a. It is NOT wired into `grantMatrixFailures()` and must not be: that
 *  function is reached by `rig-isolation.test.mjs`, which `db-slice-frontiers` runs against
 *  databases pinned at 0042-0045 frontiers. Folding an exact-signature roster into it would put
 *  a to_regprocedure lookup for fourteen bodies that do not exist there on every frontier leg --
 *  the frontier-tolerance arm above would swallow it silently, which is worse than not asking.
 *  The split is deliberate: the PRONAME census rides the frontier legs, the SIGNATURE census
 *  rides the battery that only ever runs where the signatures exist. */
export async function coaTemplateSigFailures() {
  const live = await rootQuery(
    `select s as sig, to_regprocedure(s) is not null as ok from unnest($1::text[]) s`,
    [COA_TEMPLATE_PR_A_SIGS],
  );
  const missing = live.rows.filter((r) => !r.ok).map((r) => r.sig);
  // The whole cohort absent = a pre-PR-a frontier, which is not a failure. Anything else is.
  if (missing.length === COA_TEMPLATE_PR_A_SIGS.length) return [];
  const failures = missing.length
    ? [`裁-21 PR-a exact-signature roster is PARTIAL — these do not resolve via to_regprocedure: `
       + `${missing.join(", ")}. A door recut to a different argument list leaves every `
       + `proname-keyed census green; this is the cell that does not.`]
    : [];
  const dupes = await rootQuery(
    `select p.proname, count(*)::int as n
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = any($1::text[])
      group by p.proname having count(*) > 1 order by p.proname`,
    [COA_TEMPLATE_PR_A_COHORT],
  );
  if (dupes.rowCount) {
    failures.push(`裁-21 PR-a names carry more than one overload: `
      + `${dupes.rows.map((r) => `${r.proname} x${r.n}`).join(", ")} — the grant matrix and the `
      + `cohort census both key on proname and would not see the second one.`);
  }
  return failures;
}

// 裁-21 PR-b [the APPLY half] -- the two bookkeeper-floored writers, the five INVOKER-rights
// reads, and the FOUR invoker-rights helpers those reads call. The helpers are listed as
// clara_authenticated-reachable rather than hidden among the ungranted, because they ARE granted
// and a roster that quietly omitted them would be the half-truth this census exists to catch:
// they are granted precisely BECAUSE they are INVOKER (a granted DEFINER helper answering for any
// client uuid would be a cross-tenant read oracle -- the migration's S4 header records the 42501
// that surfaced the choice). Agent and both wake roles gain ZERO here, by Annex E's first
// non-goal (no agent path to the BULK apply) rather than by omission.
const COA_TEMPLATE_PR_B_HUMAN_FNS = [
  "apply_coa_template", "add_coa_template_family",
  "coa_template_family_plan", "get_coa_template_adoption", "coa_chart_state",
  "coa_template_drift", "firm_coa_drift",
  "_coa_client_axis", "_coa_client_axes", "_coa_effective_account_name", "_coa_family_plan",
];
// The ONE internal that WRITES is granted to NOBODY, so the sweep's expected-false is the
// assertion that the plant loop is reachable only as a clara_fn_owner internal.
const COA_TEMPLATE_PR_B_UNGRANTED_FNS = ["_coa_plant_family"];
export const COA_TEMPLATE_PR_B_COHORT = [
  ...COA_TEMPLATE_PR_B_HUMAN_FNS, ...COA_TEMPLATE_PR_B_UNGRANTED_FNS,
];
/** LAW 3 COMPANION, PR-a's reasoning applied to PR-b: a proname is a projection of a function,
 *  and apply_coa_template recut to a different argument list would leave every name-keyed census
 *  green. These are the EXACT signatures. */
export const COA_TEMPLATE_PR_B_SIGS = [
  "clara.apply_coa_template(uuid,uuid,text[],text)",
  "clara.add_coa_template_family(uuid,uuid,text,text)",
  "clara.coa_template_family_plan(uuid,uuid)",
  "clara.get_coa_template_adoption(uuid)",
  "clara.coa_chart_state(uuid)",
  "clara.coa_template_drift(uuid)",
  "clara.firm_coa_drift()",
  "clara._coa_client_axis(uuid,text)",
  "clara._coa_client_axes(uuid)",
  "clara._coa_effective_account_name(uuid,text,text,text)",
  "clara._coa_family_plan(uuid,uuid)",
  "clara._coa_plant_family(jsonb,uuid,uuid,text,text)",
];

/** Frontier-tolerant exact-signature census for PR-b -- the same split PR-a documents: silent on
 *  a pre-PR-b chain, by-name where the cohort has landed. Called from coa-template-pr-b.test.mjs,
 *  never from grantMatrixFailures (which rides frontier-pinned databases). */
export async function coaTemplatePrbSigFailures() {
  const live = await rootQuery(
    `select s as sig, to_regprocedure(s) is not null as ok from unnest($1::text[]) s`,
    [COA_TEMPLATE_PR_B_SIGS],
  );
  const missing = live.rows.filter((r) => !r.ok).map((r) => r.sig);
  if (missing.length === COA_TEMPLATE_PR_B_SIGS.length) return [];
  const failures = missing.length
    ? [`裁-21 PR-b exact-signature roster is PARTIAL — these do not resolve via to_regprocedure: `
       + `${missing.join(", ")}. A door recut to a different argument list leaves every `
       + `proname-keyed census green; this is the cell that does not.`]
    : [];
  const dupes = await rootQuery(
    `select p.proname, count(*)::int as n
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = any($1::text[])
      group by p.proname having count(*) > 1 order by p.proname`,
    [COA_TEMPLATE_PR_B_COHORT],
  );
  if (dupes.rowCount) {
    failures.push(`裁-21 PR-b names carry more than one overload: `
      + `${dupes.rows.map((r) => `${r.proname} x${r.n}`).join(", ")} — the grant matrix and the `
      + `cohort census both key on proname and would not see the second one.`);
  }
  return failures;
}

// #623 [0178, the first persistent Clara successor] — the ACCOUNTING-WORK lane. One cohort, for
// the same "wholly present or wholly absent" reason every earlier wave's list carries: folding
// these names into an older roster would red every pre-0178 database, and `cohortFailures()`
// fails a PARTIAL cohort by design.
//
//   the FOUR admission/lifecycle verbs — clara_runtime ONLY, mirroring clara.begin_chat_turn's
//   own grant (0006:1176). The wake roles gain ZERO: a lane that could admit its own work would
//   be an agent deciding what it is authorised to do.
const WORK_JOURNAL_0178_RUNTIME_FNS = [
  "admit_journal_work", "retry_accounting_work", "claim_work_run", "settle_work_run",
];
//   the ONE wake wrapper — clara_wake_interactive ONLY (the group role the runtime's WRITE pool
//   SET ROLEs to), gated further by exactly one `interactive_client` wake_fn_allowlist row.
const WORK_JOURNAL_0178_WAKE_FNS = ["wake_record_journal_entry"];
//   …and the UNGRANTED closure: the core that holds every journal DML, the basis predicates the
//   admission and commit lanes share, and the two trigger bodies. Listed so `cohortFailures`
//   reports a half-applied 0178 rather than a silently narrower boundary.
const WORK_JOURNAL_0178_UNGRANTED_FNS = [
  "_record_journal_entry_core", "_assert_journal_basis", "_journal_basis_canonical",
  "_journal_basis_digest", "_journal_cents", "_tf_accounting_work_immutable",
  "_tf_accounting_work_status_mirror",
];
export const WORK_JOURNAL_0178_COHORT = [
  ...WORK_JOURNAL_0178_RUNTIME_FNS, ...WORK_JOURNAL_0178_WAKE_FNS,
  ...WORK_JOURNAL_0178_UNGRANTED_FNS,
];

// #626 D1: the caller's OWN interface/notification preferences, keyed by PERSON rather than by
// firm (0179_user_preferences.sql's own header). No floor check applies -- both doors admit any
// authenticated actor over their OWN row alone (RLS self-select on the table, `jwt_sub()`/
// `_human_ctx` scoping in the functions) -- so, unlike every other cohort above, there is no rank
// to record here. clara_authenticated ONLY: agent, both wake roles and clara_runtime gain ZERO --
// a preference a human never asked for is not something the agent lane should read or write on
// their behalf, and the migration's own header names "no wake/agent variant exists or is needed".
const USER_PREFERENCES_0179_HUMAN_FNS = ["get_my_preferences", "save_my_preferences"];
// #632 [0181] the attributable Activity feed's two doors — SECURITY INVOKER over three
// already-clara_authenticated-granted sources (clara.firm_timeline_visible,
// clara.agent_receipts_visible, clara.operation_receipts), each with its own inline bookkeeper
// floor. clara_authenticated ONLY: no wake or agent variant exists — this is a human-read
// audit surface, never something a model lane produces or consumes on its own.
const ACTIVITY_FEED_0181_HUMAN_FNS = ["list_activity", "get_activity_event"];

// #840 [0262, the successor Work link on a work.cancelled row] — NO NEW COHORT, NO NEW NAME, NO
// GRANT CHANGE, each MEASURED rather than assumed (0262's own §T re-reads owner/SECURITY/settings/
// ACL after the recut and refuses on drift). `clara.list_activity`/`clara.get_activity_event` are
// STILL 0181's SAME two doors at their SAME signatures and grant (ACTIVITY_FEED_0181_HUMAN_FNS
// above already covers them; 0183's own note above records the first body-only recut of these
// names, 0262 is another one): it adds ONE additive jsonb key, `successor_work_id`, to each door's
// return payload via `create or replace` — no parameter, no new function, no widened or narrowed
// ACL — so no roster change is owed for either name, the same "wholly present or wholly absent"
// reasoning 0183's own note states for this exact pair, and the same shape 0200's note (below,
// #721) states for `clara.answer_work_question`/`clara._tf_accounting_work_immutable`.
// #840 END

// #861 [0264, the kind ladder's five new rungs] — NO NEW COHORT, NO NEW NAME, NO GRANT CHANGE,
// each MEASURED rather than assumed (0264's own tail re-reads owner/SECURITY/settings/ACL for both
// names after the recut and refuses on drift). `clara.list_activity`/`clara.get_activity_event`
// are STILL 0181's SAME two doors at their SAME signatures and grant
// (ACTIVITY_FEED_0181_HUMAN_FNS above already covers them; 0183, 0202 and 0262 each recut these
// same bodies before). 0264 adds FIVE rungs to each door's domain-event kind ladder (member.*/
// invite.* -> people, asset.* -> assets, counterparty.* -> counterparties, client.*/knowledge.* ->
// clients, firm.* -> firm) and the same five values to list_activity's closed p_kinds roster — a
// WIDENING of accepted input, no parameter, no new function, no ACL movement — so no roster change
// is owed for either name, the same "wholly present or wholly absent" reasoning 0183's note states
// for this exact pair and #840's note above states for the recut before this one.
// #861 END

// #629 [0180, shared Work questions] — the SHARED-QUESTION lane, one cohort for the same "wholly
// present or wholly absent" reason 0178's list above carries.
//
//   the THREE human doors — clara_authenticated ONLY. The answer gate is floored at bookkeeper+
//   inside the body (`_human_ctx(role_rank('bookkeeper'))`), and so are both read doors; the wake
//   roles and clara_runtime gain ZERO, because a lane that could answer its own question would be
//   an agent deciding what it was told.
const WORK_QUESTIONS_0180_HUMAN_FNS = [
  "answer_work_question", "get_work_question", "get_work_pending_question",
];
//   the THREE runtime verbs — clara_runtime ONLY, the same lane clara.open_interruption sits in
//   (0006:1178). `work_authority_snapshot` is a READ and is granted here rather than to a wake
//   role for a measured reason: clara_runtime holds no select on clara.firm_memberships and no
//   execute on clara.role_rank, so the run cannot ask "is this human still a bookkeeper" any other
//   way, and widening those grants would open the membership table to the lane that executes model
//   output.
const WORK_QUESTIONS_0180_RUNTIME_FNS = [
  "open_work_question", "expire_due_interruptions", "work_authority_snapshot",
];
//   …and the UNGRANTED closure: the two field/answer predicates the open verb and the answer gate
//   share, the one record projection every read door returns, and the immutability trigger body.
const WORK_QUESTIONS_0180_UNGRANTED_FNS = [
  "_assert_work_question_fields", "_assert_work_answer", "_work_question_record",
  "_tf_work_question_immutable",
];
export const WORK_QUESTIONS_0180_COHORT = [
  ...WORK_QUESTIONS_0180_HUMAN_FNS, ...WORK_QUESTIONS_0180_RUNTIME_FNS,
  ...WORK_QUESTIONS_0180_UNGRANTED_FNS,
];

// #720 [0198, chat-clarify expiry] — NO COHORT, NO NEW NAME, NO GRANT CHANGE, and each of those is
// MEASURED rather than assumed. 0198 creates no function: it RECUTS `clara.expire_due_interruptions`
// to delete one predicate (`and work_id is not null`) so a past-due CHAT clarification is swept
// beside a past-due Work question. The name is already on WORK_QUESTIONS_0180_RUNTIME_FNS above and
// STAYS there — same signature `(integer,uuid)`, same owner, same SECURITY DEFINER, same pinned
// search_path, same EXECUTE to clara_runtime and to nobody else (0198's §T re-reads the exact ACL
// text, grantor included, and refuses anything wider). A cohort of its own would also be WRONG here
// rather than merely redundant: cohortFailures() fails a HALF-present cohort, and 0198's one name is
// present on every database from 0180 onward regardless of whether 0198 has been applied.
// #720 END

// #839 [0265, the shared question record gains the admitted basis] — NO COHORT, NO NEW NAME, NO
// GRANT CHANGE, the same shape #720 above records. 0265 creates no function: it RECUTS
// `clara._work_question_record` to add one key (`basis`, off `clara.accounting_work.basis`) to the
// jsonb it already built. The name is already on WORK_QUESTIONS_0180_UNGRANTED_FNS above and STAYS
// there — same signature `(uuid)`, same owner, same SECURITY DEFINER, same pinned search_path, same
// "granted to nobody" ACL (0265's §T re-reads it, grantor included). `clara.get_work_question` and
// `clara.get_work_pending_question` are not recut at all — 0265's §T pins both byte-identical to
// their pre-images — so WORK_QUESTIONS_0180_HUMAN_FNS is untouched too. A cohort of its own would be
// WRONG here for the same reason #720's is: cohortFailures() fails a HALF-present cohort, and 0265
// adds no name for one to be half of.
// #839 END

// #634 [0182, optional and LATE journal evidence] — the EVIDENCE lane, its own cohort for the
// same "wholly present or wholly absent" reason 0178's carries: folding these names into 0178's
// roster would red every database between the two frontiers, and `cohortFailures()` fails a
// PARTIAL cohort by design.
//
//   the TWO human doors — clara_authenticated ONLY. `attach_entry_evidence` is a bookkeeper+
//   write with NO financial effect (it records which document backs an already-posted entry, in
//   `clara.entry_evidence_links`; the posted row itself is never touched), and `list_entry_links`
//   is the journal surface's bookkeeper+ read. clara_runtime, the agent role and BOTH wake roles
//   gain ZERO: naming a source is a human's act about a human's evidence, and a lane that could
//   attach its own evidence would be the agent asserting its own provenance.
const JOURNAL_EVIDENCE_0182_HUMAN_FNS = ["attach_entry_evidence", "list_entry_links"];
//   …and the UNGRANTED closure the two doors and the recut 0178 bodies share: the source-ref
//   predicates and the one-document-one-entry probe. Listed so `cohortFailures` reports a
//   half-applied 0182 rather than a silently narrower boundary.
//   …plus the TWO trigger bodies the reviewed release-on-reversal fix adds: the links table's
//   one-column append-only allowset (`released_at`, null -> instant, nothing else) and the
//   `clara.journal_entries.reversed_by` trigger that stamps it. Both are ungranted definer
//   trigger functions; they are listed for the same half-applied signal as the predicates above,
//   because a 0182 with the doors but WITHOUT the release would strand a reversed entry's
//   document for ever.
const JOURNAL_EVIDENCE_0182_UNGRANTED_FNS = [
  "_assert_journal_source_refs", "_journal_source_refs_canonical", "_journal_source_document",
  "_document_posting_entry", "_journal_document_filed",
  "_tf_entry_evidence_link_append_only", "_tf_entry_evidence_release",
];
export const JOURNAL_EVIDENCE_0182_COHORT = [
  ...JOURNAL_EVIDENCE_0182_HUMAN_FNS, ...JOURNAL_EVIDENCE_0182_UNGRANTED_FNS,
];

// #728 [0183, hosted-walk findings] — the sweep-attribution recut + the spoken-for-documents
// read. `clara.list_activity`/`clara.get_activity_event` are 0181's SAME two doors at their SAME
// signature and grant (ACTIVITY_FEED_0181_HUMAN_FNS above already covers them; 0183 only edits
// their BODIES, so no roster change is owed for those two names). Two NEW names this cohort
// tracks:
//   `_sweep_events_with_effect` and `_sweep_event_has_effect` — the TWO clara_authenticated-granted
//   SECURITY DEFINER helpers the sweep exclusion needs, because `clara.sweep_runs` itself carries
//   no clara_authenticated grant at all (measured on the catalog; 0183's own header records the
//   finding) and an INVOKER list_activity/get_activity_event cannot read it directly. Both are
//   granted, and therefore PostgREST-reachable directly despite the leading underscore (0181's own
//   caveat for `_human_ctx`), so each carries the feed's OWN bookkeeper floor (clara._human_ctx)
//   and is self-scoped to the session firm inside its body — no argument can make either answer
//   for another firm, and no caller the feed refuses can reach either. SET-shaped rather than
//   scalar: the per-row form they replaced cost 4.8 s a page at 6,000 sweep events (measured).
//   TWO functions rather than one with an optional `p_event`: one plpgsql statement serving both
//   callers shares ONE cached plan, which flipped to a generic Nested Loop on the 6th call of a
//   session and took the feed from 18 ms to 13.8 s (measured; 0183 section 1).
//   `list_spoken_for_documents` — the new bookkeeper+ read (advisory only; attach_entry_evidence's
//   own CLR13 stays the actual law) — clara_authenticated ONLY; no agent/wake/runtime variant
//   exists or is needed, because naming which documents already back a posted entry is a human
//   bookkeeping fact, not something the agent lane decides on its own.
const WALK_FINDINGS_0183_HUMAN_FNS = [
  "_sweep_events_with_effect", "_sweep_event_has_effect", "list_spoken_for_documents",
];
export const WALK_FINDINGS_0183_COHORT = [...WALK_FINDINGS_0183_HUMAN_FNS];

// #641 [0189, the B-style Work list] — the WORK-LIST lane, its own cohort for the same "wholly
// present or wholly absent" reason 0178's list carries.
//
//   the TWO doors + the ONE helper — clara_authenticated ONLY. `list_accounting_work` and
//   `get_accounting_work_row` are SECURITY INVOKER over already-granted, firm-scoped sources
//   (clara.accounting_work, clara.agent_interruptions, clara.clients, clara.staff_expense_claims
//   — since #880's claim_id/claimant_label widen, migration 0266 — and, since #905's
//   receipt-dated window, migration 0267, clara.operation_receipts) with their own inline
//   bookkeeper floor; `_work_run_attempts` is the SECURITY DEFINER helper they need
//   because `clara.agent_tasks` carries NO clara_authenticated grant at all (humans read the
//   masked `clara.agent_tasks_visible`, which does not republish `work_id`) — the SAME gap, and
//   the same remedy, 0183 recorded for `clara.sweep_runs`. It is GRANTED and therefore
//   PostgREST-reachable despite the leading underscore (0181's own caveat), so it carries the
//   doors' own floor (clara._human_ctx) and is self-scoped to the session firm inside its body.
//   The agent role, both wake roles and clara_runtime gain ZERO: a Work LIST is a human read of
//   a human's own queue, never something a model lane produces or consumes on its own.
//   `clara.save_my_preferences` is 0179's SAME name at its SAME signature and grant
//   (USER_PREFERENCES_0179_HUMAN_FNS above already covers it; 0189 only edits its BODY), so no
//   roster change is owed for that name.
//
//   #905 [0267, the receipt-dated window] — NO COHORT CHANGE, NO NEW NAME, the same "still the
//   SAME name and ACL" shape #839/0265's own note beside 0180's cohort records. `list_accounting_
//   work` is a DROP-and-CREATE (a new parameter cannot be added by `create or replace`, the same
//   reason 0202/#770 gives for `list_activity`/`p_work`), but a drop-and-create of the SAME name
//   is not a new name: 0267's own tail re-reads owner clara_fn_owner, SECURITY INVOKER and the
//   literal ACL {clara_fn_owner, clara_authenticated} unchanged after the recut, so this roster
//   entry already covers the widened door. `get_accounting_work_row` is untouched (0267's own
//   tail pins it byte-identical to its 0266 pre-image), so it needs no roster change either.
const WORK_LIST_0189_HUMAN_FNS = [
  "list_accounting_work", "get_accounting_work_row", "_work_run_attempts",
];
export const WORK_LIST_0189_COHORT = [...WORK_LIST_0189_HUMAN_FNS];

// #630 [0184, settling admitted operations under cancel/revoke/lock-period races] — the
// CANCEL-AND-TAKEOVER lane, its own cohort for the same "wholly present or wholly absent" reason
// 0178's carries: folding these names into an older roster would red every database between the
// two frontiers, and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the TWO doors — clara_runtime ONLY, mirroring clara.retry_accounting_work's own grant
//   (0178:1032). Both are reached by a human THROUGH the runtime's authenticated route
//   (`POST /api/runtime/work/:id/cancel|take-over`), never by PostgREST: a door that the browser
//   could call directly would be a second admission path into a lane whose whole point is that one
//   ordering boundary decides everything. The wake roles and clara_authenticated gain ZERO — a lane
//   that could cancel or reassign the Work it is executing would be an agent deciding what it is
//   authorised to do.
const WORK_CANCEL_0184_RUNTIME_FNS = ["cancel_accounting_work", "take_over_accounting_work"];
//   …and the UNGRANTED closure: the one trigger body that stamps `initiated_by` from `initiator`
//   for every writer that does not set it. Listed so `cohortFailures` reports a half-applied 0184
//   rather than a silently narrower boundary.
//   …plus the three private helpers §A0 factors out so a fact this lane states in four places is
//   written once: the cancellation's own error object, the two doors' shared authz + reservation
//   preamble, and the receipt-law convergence the status mirror, the cancel door and the runtime
//   reconciler all reach for when they find a terminal run under a live Work.
const WORK_CANCEL_0184_UNGRANTED_FNS = [
  "_tf_accounting_work_initiated_by_default",
  "_work_cancelled_error", "_work_door_ctx", "_converge_work_terminal",
];
export const WORK_CANCEL_0184_COHORT = [
  ...WORK_CANCEL_0184_RUNTIME_FNS, ...WORK_CANCEL_0184_UNGRANTED_FNS,
];

// #721 -----------------------------------------------------------------------------------------
// #721 [0200, a reply that changes the basis becomes a new Work] — the RESTATE lane, its OWN
// frontier-tolerant cohort for the same "wholly present or wholly absent" reason 0178's and 0184's
// carry: folding these names into an older roster would red every database between the two
// frontiers, and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the ONE door — clara_runtime ONLY, the exact lane clara.cancel_accounting_work sits in, and
//   for the identical reason: a restatement IS an admission plus a cancel, both of which are
//   reached by a human THROUGH the runtime's authenticated route (`POST /api/work/:id/restate`),
//   never by PostgREST. The wake roles, clara_agent_ro and clara_authenticated gain ZERO — a lane
//   that could retire the Work it is executing and admit its replacement would be an agent
//   rewriting the instruction it was given.
const WORK_RESTATE_0200_RUNTIME_FNS = ["restate_accounting_work"];
//   …and the UNGRANTED closure: the basis-change discriminator the answer gate calls. Listed so
//   `cohortFailures` reports a half-applied 0200 rather than a silently narrower boundary, and so
//   an accidental grant on it FAILS instead of passing quietly.
//
//   NOT LISTED, deliberately: `clara.answer_work_question` and `clara._tf_accounting_work_immutable`.
//   0200 recuts both BODIES and touches neither NAME, signature nor grant —
//   `answer_work_question` is already on WORK_QUESTIONS_0180_HUMAN_FNS and the trigger body is
//   already reached through its own cohort — and a second listing of a name that exists at an
//   EARLIER frontier would make this cohort resolve on databases 0200 has not touched, which is
//   exactly the partial-cohort condition the gate exists to catch (0198's block states the same
//   rule for the same reason).
const WORK_RESTATE_0200_UNGRANTED_FNS = ["_assert_answer_changes_no_basis"];
export const WORK_RESTATE_0200_COHORT = [
  ...WORK_RESTATE_0200_RUNTIME_FNS, ...WORK_RESTATE_0200_UNGRANTED_FNS,
];
// #721 -----------------------------------------------------------------------------------------

// #624 [0191, the document capability registry] — the four READERS this slice publishes, one
// cohort for the same "wholly present or wholly absent" reason 0178's roster carries: folding these
// names into an older cohort would red every database between the two frontiers, and
// `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the FOUR shared readers — clara_authenticated AND clara_agent_ro, and the second half is the
//   point rather than a convenience: the capability registry exists so that neither lane can infer
//   from a filename what Clara can do with a file, and an agent that could not read the registry
//   would be exactly the lane most likely to guess. None of the four writes anything;
//   `get_document_state` resolves its own scope through the SAME dual-lane wake/human context
//   clara.get_document_extract uses (0090:1558-1584) and returns NULL for a document the caller
//   may not read, so the coarse grant is a door, never the authority.
//     _document_capability · the registry's one reader (honest defaults in both directions)
//     _document_format     · a stored documents.mime_type -> the detector's format token
//     _assert_field_path   · the canonical field_path grammar (C33.4), enforced at the persist
//                            boundary; granted so a surface can pre-validate a path it will cite
//     get_document_state   · custody / byte extraction / facts / operation, read independently
const DOCUMENT_CAPABILITY_0191_SHARED_FNS = [
  "_document_capability", "_document_format", "_assert_field_path", "get_document_state",
];
//   …and the UNGRANTED closure: the two deferrable constraint-trigger bodies that record the
//   arithmetic validations at commit. Listed so `cohortFailures` reports a half-applied 0191
//   rather than a silently narrower boundary, and so a future accidental grant on a trigger body
//   FAILS instead of passing quietly.
const DOCUMENT_CAPABILITY_0191_UNGRANTED_FNS = [
  "_tf_document_fact_validate", "_tf_bank_statement_validate",
];
export const DOCUMENT_CAPABILITY_0191_COHORT = [
  ...DOCUMENT_CAPABILITY_0191_SHARED_FNS, ...DOCUMENT_CAPABILITY_0191_UNGRANTED_FNS,
];

// #644 [0192, one governed Knowledge record] — the KNOWLEDGE lane, its own cohort for the same
// "wholly present or wholly absent" reason 0178's carries: folding these names into an older
// roster would red every database between the two frontiers, and `cohortFailures()` fails a
// PARTIAL cohort by design.
//
//   the SIX human surfaces — clara_authenticated ONLY. Three writes (capture at a
//   catalog-decided floor: bookkeeper+ for an assertion/preference, admin+ for a policy or any
//   authority-bearing key, and admin+ for anything firm-scoped; correct and withdraw at the same
//   floor as the key they revise) and the three C13 reads. The agent role holds EXECUTE on
//   nothing here for 0057's B6 reason — a _human_ctx-gated read granted to a role that carries no
//   JWT is a DARK grant — and both wake roles gain ZERO: which knowledge a client's books rest on
//   is a judgement, and a wake credential makes none.
const KNOWLEDGE_0192_HUMAN_FNS = [
  "capture_knowledge", "correct_knowledge", "withdraw_knowledge",
  "list_client_knowledge", "get_knowledge_record", "get_knowledge_history",
];
//   the TWO runtime surfaces — clara_runtime ONLY. `capture_knowledge_for` never impersonates:
//   the caller names the human whose statement it is and the door verifies that person's live
//   active membership and rank itself (the clara.update_onboarding_plan precedent, 0017:2661).
//   `get_knowledge_pack` is the honest context read chatTurn's next frozen version will take.
const KNOWLEDGE_0192_RUNTIME_FNS = ["capture_knowledge_for", "get_knowledge_pack"];
//   …and the ONE two-lane name: the browser calls it straight after the onboarding commit it just
//   made, the server calls it for a run that committed a plan. Declared in BOTH role sets below.
const KNOWLEDGE_0192_SHARED_FNS = ["promote_plan_answers_to_knowledge"];
//   …and the UNGRANTED closure every door shares: the catalog rule, the applicability and source
//   validators, the trust map, the floor lookup, the one writer, the capture core, the read
//   shaper, the live-revision lookup, the version allocator and the two trigger bodies. Listed so
//   `cohortFailures` reports a half-applied 0192 rather than a silently narrower boundary.
const KNOWLEDGE_0192_UNGRANTED_FNS = [
  "_knowledge_assert_value", "_knowledge_assert_applies_when", "_knowledge_source_pins",
  "_knowledge_trust_of", "_knowledge_applies_when_digest", "_knowledge_floor",
  "_knowledge_insert_revision", "_knowledge_capture_core", "_knowledge_row_json",
  "_knowledge_legacy_rows", "_knowledge_live_revision", "_next_knowledge_version",
  "_tf_knowledge_records_supersede_only", "_tf_knowledge_authority",
];
export const KNOWLEDGE_0192_COHORT = [
  ...KNOWLEDGE_0192_HUMAN_FNS, ...KNOWLEDGE_0192_RUNTIME_FNS, ...KNOWLEDGE_0192_SHARED_FNS,
  ...KNOWLEDGE_0192_UNGRANTED_FNS,
];

// #654 [0220, firm knowledge defaults + preserved client exceptions] — the FIRM-DEFAULT lane, its
// own cohort above 0192's for the same "wholly present or wholly absent" reason: it adds no write
// door at all (a promotion rides the shipped clara.capture_knowledge at firm scope), so what it
// contributes is TWO reads and TWO guard trigger bodies.
//
//   the TWO human reads — clara_authenticated ONLY. The firm register is floored at VIEWER, the
//   same floor clara.list_client_knowledge takes (0192:1316): a firm default is the firm's own
//   standing rule and hiding it from a viewer would grant and revoke nothing. The runtime and
//   agent roles gain ZERO — a _human_ctx-gated read granted to a role that carries no JWT is a
//   DARK grant (0057's ruling, restated 0192:1742-1745), and a run reads knowledge through
//   clara.get_knowledge_pack, which already carries firm defaults.
const KNOWLEDGE_FIRM_0220_HUMAN_FNS = ["list_firm_knowledge", "get_knowledge_applicability"];
//   …and the TWO UNGRANTED guard bodies: the eligibility wall (a key the catalog does not mark
//   firm-defaultable is refused at firm scope) and the cross-client evidence wall (a firm-scope
//   record may not pin a document carrying ANY live client filing). Both are BEFORE INSERT
//   triggers on clara.knowledge_records, named so they fire AFTER 0192's own authority stamp.
const KNOWLEDGE_FIRM_0220_UNGRANTED_FNS = [
  "_tf_knowledge_firm_eligibility", "_tf_knowledge_firm_evidence",
];
export const KNOWLEDGE_FIRM_0220_COHORT = [
  ...KNOWLEDGE_FIRM_0220_HUMAN_FNS, ...KNOWLEDGE_FIRM_0220_UNGRANTED_FNS,
];

// #643 [0194, periodic stock adjustments + supplied payroll obligations] — the PERIODIC-ADJUSTMENT
// lane, its own cohort for the same "wholly present or wholly absent" reason 0178's carries:
// folding these names into an older roster would red every database between the two frontiers, and
// `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the ONE admission door — clara_runtime ONLY, mirroring clara.admit_journal_work's own grant
//   (0178:1032 / 0182). The wake roles and clara_authenticated gain ZERO: a lane that could admit
//   its own accounting work would be an agent deciding what it is authorised to do, and the
//   browser reaches this door through the runtime's authenticated route, never through PostgREST.
const PERIODIC_ADJUSTMENTS_0194_RUNTIME_FNS = ["admit_periodic_adjustment_work"];
//   the ONE read — clara_authenticated ONLY, viewer-floored inside its own body (the same class as
//   clara.list_journal_entries / clara.get_close_readiness). No agent, wake or runtime variant
//   exists: the run is told its effect by the wake verb's answer and never reads this history.
const PERIODIC_ADJUSTMENTS_0194_HUMAN_FNS = ["list_periodic_adjustments"];
//   …and the UNGRANTED closure: the admission core 0194 EXTRACTS from clara.admit_journal_work (so
//   the journal door and the periodic-adjustment door cannot drift apart), the particulars'
//   predicates that admission and commit share, the two total readers the canonical form is built
//   from, and the append-only trigger body. Listed so `cohortFailures` reports a half-applied 0194
//   rather than a silently narrower boundary.
const PERIODIC_ADJUSTMENTS_0194_UNGRANTED_FNS = [
  "_admit_accounting_work_core",
  "_assert_adjustment_basis", "_assert_adjustment_relationships", "_assert_adjustment_account",
  "_adjustment_basis_canonical", "_adjustment_amount_cents", "_adjustment_net_cents",
  "_adjustment_cents", "_adjustment_cents_value", "_adjustment_date", "_adjustment_text",
  "_tf_periodic_adjustment_append_only",
];
export const PERIODIC_ADJUSTMENTS_0194_COHORT = [
  ...PERIODIC_ADJUSTMENTS_0194_RUNTIME_FNS, ...PERIODIC_ADJUSTMENTS_0194_HUMAN_FNS,
  ...PERIODIC_ADJUSTMENTS_0194_UNGRANTED_FNS,
];

// #797 [0212, the payroll settlement split as a stored particular] — NO COHORT, NO NEW NAME, NO
// GRANT CHANGE, measured rather than assumed. 0212 creates no function: it RECUTS three bodies
// that are already on PERIODIC_ADJUSTMENTS_0194_UNGRANTED_FNS above and STAY there —
// `_assert_adjustment_basis`, `_assert_adjustment_relationships` and `_adjustment_basis_canonical`,
// same signatures, same owner, same SECURITY DEFINER, same pinned search_path, same ungranted ACL
// (0212's §T re-reads the exact ACL text, grantor included, plus each body's 0194 volatility). A
// cohort of its own would be WRONG rather than redundant, for 0198's stated reason: cohortFailures()
// fails a HALF-present cohort, and these three names are present on every database from 0194 onward
// whether or not 0212 has been applied.
// #797 END

// #779 [0207, document_capabilities.registry_version monotonicity] — NO COHORT, and here is why,
// stated rather than left to inference (the same courtesy the #797 block above pays). 0207 mints
// exactly ONE new name, the trigger body `clara._tf_document_capabilities_version_monotone()`. It
// is granted to NOBODY — revoked from PUBLIC, no role grant at all — so there is no grant-matrix
// row for `grantMatrixFailures()` to claim, and a cohort of one would only assert a name's
// presence, which the trigger's own attachment already proves inside 0207's §C TAIL. It is NOT
// unswept: `definerHygieneFailures()` (below) derives every clara SECURITY DEFINER body from the
// LIVE CATALOG rather than from a roster, so it checks this one's owner, pinned search_path and
// ungranted ACL on every run, at every frontier, without being told it exists. 0207 changes no
// existing name, signature or grant.
// #779 END
// #846 [0244, the capability registry's version high-water mark] — its own cohort, unlike 0207's,
// and the difference is the number of names rather than a change of mind. 0207 minted ONE
// ungranted trigger body, so a roster of one would only have asserted a name's presence that the
// trigger's own attachment already proved. 0244 mints FOUR bodies and a relation, and
// `cohortFailures()` fails a PARTIAL cohort — which is exactly the shape a half-applied 0244
// would leave, and the shape packages/db/tests/README.md's "Preintegration gates" section asks a
// new feature battery to declare beside its gate module.
//
//   ALL FOUR ARE UNGRANTED INTERNALS, granted to NOBODY — revoked from PUBLIC, no role grant at
//   all. They are trigger bodies: nothing calls them by name, and the only lane that can write
//   `clara.document_capabilities` at all is the owner/migration role (0191's ruling, which 0207's
//   header restates). Listed here so a grant APPEARING on one fails the main sweep, and so a
//   half-applied 0244 is reported as that rather than as a silently narrower boundary.
//
//   THE RELATION `clara.document_capability_version_high_water` needs NO roster entry of its own:
//   `governedRlsFailures()`'s derive branch (b) sweeps every clara base table that is neither
//   GOVERNED_TABLES nor RLS_EXEMPT and fails one that is not RLS-enabled AND forced, so the new
//   table is checked on every run without being told it exists. A gated table cohort in the
//   0037/C-2 shape buys nothing for a SINGLE table — "partial" is not a state one table can be in.
const DOCUMENT_CAPABILITY_HIGH_WATER_0244_UNGRANTED_FNS = [
  "_tf_document_capabilities_version_high_water", "_tf_document_capabilities_high_water_record",
  "_tf_document_capability_high_water_monotone", "_tf_document_capabilities_version_uniform",
];
export const DOCUMENT_CAPABILITY_HIGH_WATER_0244_COHORT = [
  ...DOCUMENT_CAPABILITY_HIGH_WATER_0244_UNGRANTED_FNS,
];
//
//   0272 (THE FIX ROUND) ADDS NO NAME TO THIS ROSTER, deliberately. It mints no function: it arms
//   0003's `clara._tf_no_truncate` on the mark ledger, arms the high-water body above a second
//   time as a key-change BEFORE UPDATE trigger, recuts
//   `_tf_document_capability_high_water_monotone` in place and re-issues two comments.
//   `cohortFailures()` rosters NAMES, and every name 0272 touches is already listed here or in
//   0003's own closure -- so a cohort entry would be a duplicate, not a wider proof. The trigger
//   ATTACHMENTS 0272 adds are proven where attachments are proven: the migration's own tail and
//   `document-capability-high-water.test.mjs`'s cohort gate, which reads all five triggers.
// #846 END
// #782 [0245, invoice line items become an accepted limitation] — COMMENT-ONLY, deliberately, and
// the comment IS the cohort's content, the same reason #656's 0228 entry above carries none.
//
//   0245_invoice_line_items_accepted_limitation.sql INSTALLS NO FUNCTION, NO TABLE, NO TRIGGER
//   AND RECUTS NONE. Its whole content is a republication of `clara.document_capabilities`: an
//   UPDATE that moves the 28 invoice-family rows' `limits.invoice_line_items` from `planned` to
//   `accepted_limitation` (with a sibling `invoice_line_items_reason`), then the registry-wide
//   raise every prior republication has used (0228's precedent) — `registry_version` 2 -> 3,
//   never DELETE-then-INSERT (#846). So there is no granted name to roster and no ungranted
//   closure to pin: a cohort array would be empty and `cohortFailures` would compare it against
//   nothing. The file's own tail re-hashes the FIVE #779/#846 wall bodies its raise rides
//   (`_tf_document_capabilities_version_monotone`, `_tf_document_capabilities_version_high_water`,
//   `_tf_document_capabilities_high_water_record`, `_tf_document_capability_high_water_monotone`,
//   `_tf_document_capabilities_version_uniform`) at their measured pre-image shas and raises
//   CLR10 if any moved, which is the same claim from the migration's side.
//
//   THE HIGH-WATER MARK NEEDS NO NEW ROSTER ENTRY EITHER: 0245's raise runs through the same
//   AFTER INSERT OR UPDATE writer #846 installed, so every pair's mark rises to 3 in the same
//   statement — proved in the migration's own tail (§C.5) and in
//   `packages/db/tests/document-capability-high-water.test.mjs`'s rollback-hygiene cell, never by
//   a new name here.
// #782 END
// #988 [0246, business_operation's fifth level, proposal_only] — COMMENT-ONLY, deliberately, and
// for the SAME reason #782's entry above carries none.
//
//   0246_business_operation_proposal_only.sql INSTALLS NO FUNCTION, NO TABLE AND NO TRIGGER, AND
//   RECUTS NONE. Its whole content is DROP + ADD on `document_capabilities_business_operation_
//   check` (the SAME auto-generated name, widened from four values to five) plus a column comment
//   update — no row of `clara.document_capabilities` is inserted, deleted, or has any column
//   other than the constraint's own definition changed. So there is no granted name to roster and
//   no ungranted closure to pin: a cohort array would be empty and `cohortFailures` would compare
//   it against nothing.
//
//   THE FRONTIER IS READ FROM THE CHECK'S OWN DEFINITION, never from a migration number:
//   `document-capability-registry.test.mjs`'s `proposalLevelApplied()` greps
//   `pg_get_constraintdef` for the `proposal_only` token, the same law `monotoneWallApplied()`
//   already follows for 0207's trigger.
//
//   REGISTRY_VERSION DOES NOT MOVE: #988's owner ruling reclassifies no row onto the new level
//   this round (`prior_gl` stays `stored_only`, #983/#1012), and a vocabulary widening that
//   republishes no row's content does not raise the per-row publication mark — the migration's
//   own tail proves the registry is still uniformly at 3 (0245's own publish) afterward.
// #988 END
// #639 [0216, fixed-asset acquisition] — the ACQUISITION lane, its own cohort for the same
// "wholly present or wholly absent" reason every roster above carries: folding these names into
// 0041's FA cohort would red every database between the two frontiers, and `cohortFailures()`
// fails a PARTIAL cohort by design.
//
//   the ONE new door — clara_runtime ONLY. A run applies the answer to its own dependent
//   particulars question ON BEHALF OF the human who asked for the work; the browser keeps 0041's
//   `complete_fixed_asset_particulars`, which is clara_authenticated-only and is NOT re-declared
//   here (it belongs to FA_0041_HUMAN_FNS). A grant of this overload to clara_authenticated would
//   be a second human door with no `_human_ctx` floor, which is why the matrix pins it.
const FA_ACQUISITION_0216_RUNTIME_FNS = ["complete_fixed_asset_particulars_for"];
//   …and the UNGRANTED closure: the lane-agnostic birth trigger body, the two acquisition
//   projections the recut reads call, and the shared particulars core both doors' walls live in.
//   Listed so `cohortFailures` reports a half-applied 0216 rather than a silently narrower
//   boundary — and so a grant appearing on any of them FAILS the main sweep.
const FA_ACQUISITION_0216_UNGRANTED_FNS = [
  "_tf_fa_acquisition_birth", "_fa_acquisition_json", "_fa_acquisition_history",
  "_fa_complete_particulars_core",
];
export const FA_ACQUISITION_0216_COHORT = [
  ...FA_ACQUISITION_0216_RUNTIME_FNS, ...FA_ACQUISITION_0216_UNGRANTED_FNS,
];

// #651 [0227, depreciation history] — the DEPRECIATION-POLICY lane, its own cohort for the same
// "wholly present or wholly absent" reason FA_ACQUISITION_0216_COHORT carries: folding these names
// into 0041's FA cohort would red every database between the two frontiers, and `cohortFailures()`
// fails a PARTIAL cohort by design.
//
//   the ONE new human read. `clara._fa_compute_charges` stays in FA_0041_UNGRANTED_FNS below and
//   is never granted -- this wrapper is the only way a browser reaches the arithmetic, and the
//   main sweep fails the moment a grant appears on the core (I6/Q6).
const FA_DEPRECIATION_0227_HUMAN_FNS = ["preview_depreciation_run"];
//   the ONE new machine door -- clara_runtime ONLY. `clara.run_depreciation_manual` (above) must
//   NEVER reach a machine role, which is precisely why this OBO door carries a NEW NAME rather
//   than a widened grant.
const FA_DEPRECIATION_0227_RUNTIME_FNS = ["run_depreciation_period_for"];
//   …and the UNGRANTED helper, declared the 0020 way so a grant appearing on it FAILS the main
//   sweep. It is the fixed-asset lane's whole locked-period law, and #678 adopts it unchanged.
//   `clara.sign_depreciation_authority` is NOT re-declared here: 0227 re-cut its signature, not
//   its name, and the roster is BY NAME -- it stays in FA_0041_HUMAN_FNS.
const FA_DEPRECIATION_0227_UNGRANTED_FNS = ["_fa_assert_period_open"];
export const FA_DEPRECIATION_0227_COHORT = [
  ...FA_DEPRECIATION_0227_HUMAN_FNS, ...FA_DEPRECIATION_0227_RUNTIME_FNS,
  ...FA_DEPRECIATION_0227_UNGRANTED_FNS,
];

// #973 [0248, fold preview_depreciation_run's duplicated leg-pairing aggregation into
// clara._fa_run_period_core] — its own cohort for the same "wholly present or wholly absent"
// reason FA_DEPRECIATION_0227_COHORT carries: folding this ONE name into 0227's own cohort would
// red every database between the two frontiers, and `cohortFailures()` fails a PARTIAL cohort by
// design. `_fa_depreciation_leg_pairing` is UNGRANTED like `_fa_assert_period_open` above: the
// main sweep fails the moment a grant appears on it, this cohort fails if it ever DISAPPEARS.
const FA_DEPRECIATION_LEG_FOLD_0248_UNGRANTED_FNS = ["_fa_depreciation_leg_pairing"];
export const FA_DEPRECIATION_LEG_FOLD_0248_COHORT = [
  ...FA_DEPRECIATION_LEG_FOLD_0248_UNGRANTED_FNS,
];

// #976 [0249, fold the fixed-asset particulars completion wall shared by
// complete_fixed_asset_particulars and _fa_complete_particulars_core] — its own cohort for the
// same "wholly present or wholly absent" reason FA_DEPRECIATION_LEG_FOLD_0248_COHORT carries:
// folding this ONE name into 0216's own cohort would red every database between the two
// frontiers, and `cohortFailures()` fails a PARTIAL cohort by design.
// Both names are UNGRANTED like `_fa_depreciation_leg_pairing` above: the main sweep fails the
// moment a grant appears on either, this cohort fails if either ever DISAPPEARS. TWO names and
// not one because the wall has two halves that belong at two different points in a door -- the
// payload-only change-class guard runs BEFORE `clara._reserve_op` (0227's own anchor), the rest
// after the row lock -- and 0249 mints both in the same statement pair, so they are wholly
// present or wholly absent together, which is exactly what `cohortFailures()` wants.
const FA_PARTICULARS_COMPLETION_FOLD_0249_UNGRANTED_FNS = [
  "_fa_assert_completion_not_a_change", "_fa_assert_particulars_completable",
];
export const FA_PARTICULARS_COMPLETION_FOLD_0249_COHORT = [
  ...FA_PARTICULARS_COMPLETION_FOLD_0249_UNGRANTED_FNS,
];

// #977 [0250, what counts as a person's instruction for an authority_ref] — its own cohort, for
// the same "wholly present or wholly absent" reason the two above carry. `_authority_ref_refusal`
// is the ONE definition clara.sign_depreciation_authority and clara.create_accounting_plan both
// read, and it is UNGRANTED like its siblings: the main sweep fails the moment a grant appears on
// it, this cohort fails if it ever DISAPPEARS.
const AUTHORITY_REF_HUMAN_INSTRUCTION_0250_UNGRANTED_FNS = ["_authority_ref_refusal"];
export const AUTHORITY_REF_HUMAN_INSTRUCTION_0250_COHORT = [
  ...AUTHORITY_REF_HUMAN_INSTRUCTION_0250_UNGRANTED_FNS,
];

// #979 [0251, the depreciation authority read tells "never had one" apart from "had one, and it
// was retired"] — NO COHORT, NO NEW NAME, NO GRANT CHANGE, each measured rather than assumed, for
// the same reason #797's (0212) and #720's (0198) blocks state theirs. 0251 creates no function:
// it RECUTS `clara.get_depreciation_authority` to add one fallback select and one conditional
// field merge, same signature `(uuid)`, same owner, same SECURITY DEFINER, same STABLE
// volatility, same pinned search_path, same EXECUTE to clara_authenticated and to nobody else
// (0251's own tail T.5/T.5b/T.5c re-reads exactly that off the catalog). A cohort of its own
// would be WRONG here rather than merely redundant: cohortFailures() fails a HALF-present cohort,
// and `get_depreciation_authority` is present on every database from 0041 onward regardless of
// whether 0251 has been applied.
// #979 END

// #638 [0221, staff expense claims / employee payables / advance settlement] — its own cohort for
// the same "wholly present or wholly absent" reason 0178's and 0194's carry.
//
//   the ONE admission door — clara_runtime ONLY, mirroring clara.admit_journal_work's and
//   clara.admit_periodic_adjustment_work's own grants. The wake roles and clara_authenticated gain
//   ZERO: the browser reaches this door through the runtime's authenticated route
//   (POST /api/work/staff-expense-claim), never through PostgREST.
const STAFF_EXPENSE_CLAIMS_0221_RUNTIME_FNS = ["admit_staff_expense_claim_work"];
//   the THREE reads — clara_authenticated ONLY, viewer-floored inside their own bodies (the same
//   class as clara.list_periodic_adjustments). No agent, wake or runtime variant exists: the run is
//   told its effect by the wake verb's answer and never reads a claim.
const STAFF_EXPENSE_CLAIMS_0221_HUMAN_FNS = [
  "list_staff_expense_claims", "get_staff_expense_claim", "get_work_claim_origin",
];
//   …and the UNGRANTED closure: the claim predicates the door and the reads share, the canonical
//   form and the basis derivation, the definer-internal claimant resolver (which re-derives 0043's
//   four enrol walls rather than calling the admin-floored door), and the four trigger bodies —
//   the append-only belt, the posted/reversed status stamps and the lane-agnostic advance birth
//   trigger. Listed so `cohortFailures` reports a half-applied 0221 rather than a silently
//   narrower boundary.
const STAFF_EXPENSE_CLAIMS_0221_UNGRANTED_FNS = [
  "_assert_claim_basis", "_claim_basis_canonical", "_claim_journal_basis", "_claim_item_total",
  "_claim_settlement_account", "_claim_text", "_claim_cents", "_claim_date", "_claim_uuid",
  "_claim_resolve_claimant", "_tf_staff_expense_claim_append_only",
  "_tf_staff_expense_claim_posted", "_tf_staff_expense_claim_reversed",
  "_tf_adv_claim_application_birth",
];
export const STAFF_EXPENSE_CLAIMS_0221_COHORT = [
  ...STAFF_EXPENSE_CLAIMS_0221_RUNTIME_FNS, ...STAFF_EXPENSE_CLAIMS_0221_HUMAN_FNS,
  ...STAFF_EXPENSE_CLAIMS_0221_UNGRANTED_FNS,
];

// #640 [0193, explicitly authorised recurring/reversing accounting plans] — its own cohort for the
// same "wholly present or wholly absent" reason 0178's and 0184's carry.
//
//   the ELEVEN human doors — clara_authenticated ONLY. Every write is bookkeeper+ inside its own
//   body and every read is viewer+ and firm-predicated; the agent and wake lanes gain NOTHING,
//   because a lane that could author its own future authority would be the agent deciding what it
//   is allowed to do.
const ACCOUNTING_PLANS_0193_HUMAN_FNS = [
  "create_accounting_plan", "revise_accounting_plan", "pause_accounting_plan",
  "resume_accounting_plan", "end_accounting_plan", "request_plan_catch_up",
  "preview_accounting_plan", "list_accounting_plans", "get_accounting_plan",
  "list_accounting_plan_occurrences", "get_work_plan_origin",
];
//   …and the ONE runtime verb: the leader's every-cycle due scan, clara_runtime ONLY — the same
//   lane clara.admit_journal_work sits in (0178). The browser lane holds none of it: a plan scan
//   reachable from a session would be a second admission path into the lane whose whole point is
//   that one ordering boundary decides everything.
const ACCOUNTING_PLANS_0193_RUNTIME_FNS = ["wake_due_plan_occurrences"];
//   …and the UNGRANTED closure: the shared admission core, the door preamble, the schedule
//   validator, the model constant, the five date helpers, the two basis/overlap projections and
//   the three immutability triggers. Listed so cohortFailures reports a half-applied 0193 rather
//   than a silently narrower boundary.
const ACCOUNTING_PLANS_0193_UNGRANTED_FNS = [
  "_plan_admit_occurrence", "_plan_door_ctx", "_assert_plan_schedule", "_plan_run_model",
  "_plan_due_nth", "_plan_due_index_on_or_before", "_plan_reversal_date", "_plan_due_events",
  "_plan_occurrence_basis", "_plan_overlap_warning",
  // …and the ones the two adversarial review rounds added: the accrual a reversal undoes, the
  // anchored period start, the per-occurrence period key, the leg-aware window ceiling, and the
  // PICKER the scan actually asks (which reads the occurrence rows, so it is stable rather than
  // immutable). The pure-arithmetic `_plan_due_event_on_or_before` the picker replaced is gone
  // with it: an unreachable body in a census of reachable ones is a claim nobody can check — and
  // so is `_plan_primary_stands`, whose "admitted and not yet a dead end" test round 2 replaced
  // with `_plan_primary_entry` (the accrual's POSTED, still-live journal entry). `_plan_work_stands`
  // is the one surviving Work-status test and `_plan_covered_through` is the alignment wall's ruler.
  "_plan_primary_for_reversal", "_plan_primary_entry", "_plan_work_stands",
  "_plan_covered_through", "_plan_period_start",
  "_plan_occurrence_period_key", "_plan_window_ceiling", "_plan_admissible_event",
  "_tf_accounting_plans_immutable", "_tf_plan_revisions_immutable",
  "_tf_plan_occurrences_append_only",
];
export const ACCOUNTING_PLANS_0193_COHORT = [
  ...ACCOUNTING_PLANS_0193_HUMAN_FNS, ...ACCOUNTING_PLANS_0193_RUNTIME_FNS,
  ...ACCOUNTING_PLANS_0193_UNGRANTED_FNS,
];

// #652 [0222, evidenced accrual and reversal adjustments] — its own cohort for the same "wholly
// present or wholly absent" reason 0193's and 0194's carry.
//
//   the THREE human doors — clara_authenticated ONLY. The write is bookkeeper+ inside its own
//   body and both reads are viewer+ and firm-predicated; clara_runtime, the agent role and both
//   wake roles gain ZERO on any of them, because a human configuring an accrual has their own
//   door with their own JWT.
const ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS = [
  "create_accrual_adjustment", "list_accrual_adjustments", "get_accrual_adjustment",
];
//   …and the ONE runtime verb: the OBO twin, clara_runtime ONLY — the same lane
//   clara.admit_periodic_adjustment_work sits in (0194:1298-1314). It resolves its actor from an
//   ARGUMENT, never from a JWT, so a chat-lane successor needs no migration of its own.
const ACCRUAL_ADJUSTMENTS_0222_RUNTIME_FNS = ["create_accrual_adjustment_for"];
//   …and the UNGRANTED closure: the actor-explicit plan writer, the shared configuration tail, the
//   particulars predicates, the derived-basis and canonical projections, the occurrence read and
//   the two triggers. Listed so cohortFailures reports a half-applied 0222 rather than a silently
//   narrower boundary.
const ACCRUAL_ADJUSTMENTS_0222_UNGRANTED_FNS = [
  "_accrual_plan_core", "_accrual_finish", "_accrual_occurrences", "_accrual_methods",
  "_accrual_date", "_accrual_journal_basis", "_accrual_canonical",
  "_assert_accrual_particulars", "_assert_accrual_term_window", "_assert_accrual_account",
  "_assert_accrual_world",
  "_tf_accrual_adjustment_append_only", "_tf_accrual_adjustment_term_congruent",
];
export const ACCRUAL_ADJUSTMENTS_0222_COHORT = [
  ...ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS, ...ACCRUAL_ADJUSTMENTS_0222_RUNTIME_FNS,
  ...ACCRUAL_ADJUSTMENTS_0222_UNGRANTED_FNS,
];

// #653 [0223, prepayment recognition and amortisation over an explicit service period] — the
// AMORTISATION lane, its own cohort for the same "wholly present or wholly absent" reason 0193's
// carries. It EXTENDS 0193 rather than standing beside it: the schedule it derives is configured
// as an `amortisation_schedule` accounting plan and admitted by 0193's own scan, so a half-applied
// 0223 would be a plan kind the doors can create and the resolver cannot serve.
//
//   the FOUR human doors — clara_authenticated ONLY. The write is bookkeeper-floored in its own
//   body, the three reads are viewer-floored and firm-predicated, and the agent and both wake
//   roles gain NOTHING: a lane that could author its own future authority would be the agent
//   deciding what it is allowed to do (0193 §I's reason, unchanged).
const PREPAYMENT_0223_HUMAN_FNS = [
  "create_prepayment_schedule", "get_prepayment_schedule", "list_prepayment_schedules",
  "list_prepayment_attention",
];
//   …and the UNGRANTED closure: the per-period line resolver the two basis callers ask, the read
//   preamble, and the relation's append-only trigger. NO new runtime verb — 0223 mints no second
//   scan, and `wake_due_plan_occurrences` (0193) stays the only one.
const PREPAYMENT_0223_UNGRANTED_FNS = [
  "_plan_amortisation_period_line", "_prepayment_ctx", "_tf_prepayment_schedules_append_only",
];
export const PREPAYMENT_0223_COHORT = [
  ...PREPAYMENT_0223_HUMAN_FNS, ...PREPAYMENT_0223_UNGRANTED_FNS,
];

// #631 [0195, model egress obeys current purpose authorisation + the redacted execution trace] —
// the WORK-EGRESS lane, its own cohort for the same "wholly present or wholly absent" reason
// 0178's and 0194's carry.
//
//   the dispatch wrapper and the trace writer/prune — clara_runtime ONLY. The wake roles and
//   clara_authenticated gain ZERO: a lane that could mint its own egress authorization, or write
//   its own diagnostic row for another firm's Work, would be an agent deciding what it is
//   authorised to do.
const WORK_EGRESS_0195_RUNTIME_FNS = [
  "prepare_work_egress_dispatch", "record_work_execution_trace", "prune_work_execution_traces",
];
//   the ONE read — clara_authenticated ONLY, bookkeeper-floored inside its own body. No agent,
//   wake or runtime variant exists: the run writes the trace and never reads it back.
//   ...and the OWNER door the review round added: `clara.restore_client_egress_purpose`, the way
//   back on after an owner withdraws the DERIVED accounting_work purpose. Owner-floored in its own
//   body, clara_authenticated ONLY — the runtime must never be able to restore an authority a
//   human took away.
const WORK_EGRESS_0195_HUMAN_FNS = ["get_work_execution_trace", "restore_client_egress_purpose"];
//   …and the UNGRANTED closure: the derived-activation predicate (reached only from the DEFINER
//   clara.prepare_egress_dispatch, whose answer collapses every negative onto one indistinguishable
//   unknown), the immutable run-binding fold both the dispatch wrapper and the posting core
//   compute, and the trace relation's append-only trigger body.
//   ...and the FIVE field grammars the trace relation CHECKs with (0195 SECTION 7B). They are
//   IMMUTABLE predicates reached only from the relation's own constraints and the DEFINER writer,
//   both of which run as clara_fn_owner: no application role may execute one.
const WORK_EGRESS_0195_UNGRANTED_FNS = [
  "_accounting_work_egress_live", "_work_egress_event_seq",
  "_tf_work_execution_trace_append_only",
  "_work_trace_secret_shaped", "_work_trace_text_ok", "_work_trace_skills_ok",
  "_work_trace_revisions_ok", "_work_trace_refusal_ok",
];
export const WORK_EGRESS_0195_COHORT = [
  ...WORK_EGRESS_0195_RUNTIME_FNS, ...WORK_EGRESS_0195_HUMAN_FNS,
  ...WORK_EGRESS_0195_UNGRANTED_FNS,
];
// #812
// #812 [0211, the way back on after a DEACTIVATION] — its OWN cohort for the same "wholly present
// or wholly absent" reason 0195's carries: folding this name into WORK_EGRESS_0195_COHORT would
// make every database at 0195 but below 0211 report a PARTIAL cohort, a false failure one
// migration early.
//
//   clara_authenticated ONLY, owner-floored in its own body. NO runtime, agent or wake variant:
//   a human took the authority away, only a human gives it back. It resolves the consent that
//   survived the deactivation (no lawful read exposes that id) and delegates to 0195's own
//   clara.activate_client_egress_purpose, which keeps the audit row, the domain event and the
//   op_key idempotency.
const EGRESS_RECOVERY_0211_HUMAN_FNS = ["reactivate_client_egress_purpose"];
export const EGRESS_RECOVERY_0211_COHORT = [...EGRESS_RECOVERY_0211_HUMAN_FNS];
// #812
// #718 [0197, the document-coding lane's evidence-link lookback] — its own cohort for the same
// "wholly present or wholly absent" reason 0182's carries, and a cohort of THREE UNGRANTED names
// only: this file adds no door and changes no grant, so it earns no row in ALLOWED below.
//
//   NO HUMAN, RUNTIME, AGENT OR WAKE FN AT ALL. All three bodies are reachable exclusively from
//   this migration's own triggers — the wall that refuses a coded approval on a document that
//   already holds a live clara.entry_evidence_links row, the mirror wall on the links table that
//   makes the two lanes serialize, and the ONE row lock both of them take first. A grant on any
//   of them would be a caller able to take the estate's document lock, or to raise a coding
//   refusal, from outside the transition that owns it — so the grant matrix's expected-false
//   sweep over these three names IS the assertion, and this roster is what keeps them swept.
//
//   LISTED FOR THE HALF-APPLIED SIGNAL, which is sharper here than for most cohorts: a 0197 with
//   `_tf_source_binding_wall` but WITHOUT `_tf_evidence_link_binding_wall` is not a narrower
//   boundary, it is a REOPENED RACE — the coding lane would look back, and the evidence lane
//   would still commit over it in the other arrival order. cohortFailures() fails that partial
//   cohort by design.
const CODING_LANE_LINK_0197_UNGRANTED_FNS = [
  "_lock_document_binding", "_tf_source_binding_wall", "_tf_evidence_link_binding_wall",
];
export const CODING_LANE_LINK_0197_COHORT = [...CODING_LANE_LINK_0197_UNGRANTED_FNS];
// #718 END
// #650 [0214, the client home's Work attention band] — the CLIENT WORK PACK lane, its own cohort
// for the same "wholly present or wholly absent" reason 0189's list carries.
//
//   ONE read door — clara_authenticated ONLY. `get_client_work_pack` is SECURITY INVOKER over
//   clara.accounting_work and clara.operation_receipts (both already granted, both behind forced
//   firm-scoped RLS) with 0189's own three inline predicates for its bookkeeper floor, and it
//   reaches clara.agent_tasks ONLY through 0189's already-granted DEFINER helper, with at most 25
//   preview ids. clara_runtime, the agent role and both wake roles gain ZERO: a client's attention
//   board is a human read of a human's own queue, never something a model lane produces or
//   consumes on its own. 0214 creates no other function and recuts nothing, so this cohort is one
//   name.
const CLIENT_WORK_PACK_0214_HUMAN_FNS = ["get_client_work_pack"];
export const CLIENT_WORK_PACK_0214_COHORT = [...CLIENT_WORK_PACK_0214_HUMAN_FNS];

// #659 [0231, Firm Home's portfolio table + the compliance-watch disposition receipt] — its own
// cohort for the same "wholly present or wholly absent" reason 0214's carries.
//
//   TWO read doors — clara_authenticated ONLY, both. `get_firm_portfolio_pack` is SECURITY INVOKER
//   over clara.clients, clara.accounting_work and clara.operation_receipts (all three already
//   granted, all three behind forced firm-scoped RLS) with 0189's own three inline predicates for
//   its bookkeeper floor, and it reaches clara.agent_tasks ONLY through 0189's already-granted
//   DEFINER helper with at most 101 preview ids. `get_compliance_watch_disposition` is SECURITY
//   DEFINER because clara.compliance_watches and clara.compliance_watch_events carry no
//   application-role grant at all (0016:396-414) — an INVOKER body would see nothing — and it
//   grants nothing on either relation. clara_runtime, the agent role and both wake roles gain ZERO
//   on both names: a portfolio board and a disposition receipt are human reads of a human's own
//   queue. 0231 creates no other function and recuts nothing, so this cohort is two names.
const FIRM_PORTFOLIO_PACK_0231_HUMAN_FNS = [
  "get_firm_portfolio_pack", "get_compliance_watch_disposition",
];
export const FIRM_PORTFOLIO_PACK_0231_COHORT = [...FIRM_PORTFOLIO_PACK_0231_HUMAN_FNS];

// #647 [0215, counterparty identity provenance + the correction history] — its own cohort for the
// same "wholly present or wholly absent" reason 0192's and 0193's carry: folding these names into
// an older roster would red every database between the two frontiers, and cohortFailures() fails
// a PARTIAL cohort by design.
//
//   the THREE human reads — clara_authenticated ONLY, every one viewer-floored inside its own
//   body and firm-predicated. The agent and both wake lanes gain ZERO, and that is D11 rather
//   than an omission: Clara has no identity WRITE verb in this slice, so she has nothing here to
//   read either, and a _human_ctx-gated read granted to a role that carries no JWT is 0057 B6's
//   DARK GRANT. The three RECUT writers (add_counterparty_alias, rename_counterparty,
//   set_counterparty_identifiers) keep their existing rosters above — they are not new names.
const COUNTERPARTY_IDENTITY_0215_HUMAN_FNS = [
  "get_counterparty_identity", "list_counterparty_identity",
  "list_counterparty_merge_corrections",
];
//   …and the UNGRANTED closure: the ONE revision writer (the only place a revision number is
//   chosen -- optimistically, against uq_cir_counterparty_revision, holding no lock of its own so
//   that it inverts no other door's lock order), the append-only trigger of the revision relation,
//   the honesty trigger that
//   refuses a machine lane claiming recorded_via='human_ui', and the two lane-agnostic revision
//   triggers that cover the writers this slice may NOT recut (clara.merge_counterparties, whose
//   live body is a 0149 splice, and clara.tick_seeding_proposal). Listed so cohortFailures
//   reports a half-applied 0215 rather than a silently narrower boundary — and the signal is
//   sharp here: a 0215 with the columns but without _tf_counterparty_alias_recorded_via is not a
//   narrower boundary, it is a table on which any lane may claim a human wrote the row.
const COUNTERPARTY_IDENTITY_0215_UNGRANTED_FNS = [
  "_append_counterparty_identity_revision", "_tf_counterparty_identity_revision_immutable",
  "_tf_counterparty_alias_recorded_via", "_tf_counterparty_alias_revision",
  "_tf_counterparty_merge_revision",
];
export const COUNTERPARTY_IDENTITY_0215_COHORT = [
  ...COUNTERPARTY_IDENTITY_0215_HUMAN_FNS, ...COUNTERPARTY_IDENTITY_0215_UNGRANTED_FNS,
];
// #647 END

// #646 [0217, the document SOURCE-REVISION lane] — its own cohort for the same "wholly present or
// wholly absent" reason 0191's and 0192's carry: folding these names into an older roster would
// red every database between the two frontiers, and `cohortFailures()` fails a PARTIAL cohort by
// design.
//
//   the FOUR human doors — clara_authenticated ONLY. Two writes (a typed-fact revision and the
//   narrow orphaned-classification-question dismissal, both bookkeeper-floored inside their own
//   bodies behind the agent-identity wall clara.set_document_kind carries) and two reads (the
//   chronological source lineage and the read-only dependents projection, at the SAME bookkeeper
//   floor). The runtime, the agent read role and both wake roles gain ZERO: which reading a set of
//   books rests on is a professional's judgement, and no wake credential makes one. The reads are
//   walled with the writers for clara.list_periodic_adjustments' reason — a definer read gated on
//   `_human_ctx` and granted to a role that carries no JWT is a DARK grant.
const DOCUMENT_SOURCE_REVISION_0217_HUMAN_FNS = [
  "revise_document_fact", "dismiss_orphaned_classification_question",
  "list_source_revisions", "list_source_dependents",
];
//   …and the UNGRANTED closure: the one observation reader both writers stamp from (derived in
//   exactly one place so the fact door and the recut set_document_kind cannot disagree about the
//   same document), the sole-live-filing lookup, and the two closed field-path predicates. Listed
//   so `cohortFailures` reports a half-applied 0217 rather than a silently narrower boundary, and
//   so an accidental grant on any of them FAILS instead of passing quietly.
const DOCUMENT_SOURCE_REVISION_0217_UNGRANTED_FNS = [
  "_document_source_observation", "_document_sole_live_client",
  "_revisable_invoice_field", "_monetary_invoice_field",
];
export const DOCUMENT_SOURCE_REVISION_0217_COHORT = [
  ...DOCUMENT_SOURCE_REVISION_0217_HUMAN_FNS, ...DOCUMENT_SOURCE_REVISION_0217_UNGRANTED_FNS,
];
// #646's ONE relation, gated exactly as SUBLEDGER_0037_TABLES is: GOVERNED_TABLES' (a) branch
// demands every entry EXIST, so listing it unconditionally would turn every pre-0217 database into
// a MISSING-table failure that says nothing about RLS.
export const DOCUMENT_SOURCE_REVISION_0217_TABLES = ["document_fact_revisions"];
// #646 END

// #885 [0268, a source correction cancels and re-admits the Work parked on a question about the
// corrected document] — its OWN cohort, one frontier above 0217's, for the same "wholly present or
// wholly absent" reason that roster carries: folding these names into 0217's would red every
// database between the two frontiers, and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   THE WHOLE COHORT IS UNGRANTED, and that is the boundary claim. All three bodies are reachable
//   ONLY from inside `clara.revise_document_fact`, which is itself the one human door; a grant on
//   any of them would be a second, unwalled way into the Work lane from the document lane. Listed
//   here so an accidental grant FAILS instead of passing quietly, and so a half-applied 0268 is
//   reported as one rather than as a silently narrower rule.
//
//   NOT LISTED, deliberately: `clara.revise_document_fact` and `clara.answer_work_question`. 0268
//   recuts both BODIES and touches neither NAME, signature nor grant — the first is already on
//   DOCUMENT_SOURCE_REVISION_0217_HUMAN_FNS and the second on WORK_QUESTIONS_0180_HUMAN_FNS — and a
//   second listing of a name that exists at an EARLIER frontier would make this cohort resolve on
//   databases 0268 has not touched, which is exactly the partial-cohort condition the gate exists
//   to catch (#721's own block states the same rule for the same reason).
//   THE FOURTH NAME (second fix round): `_question_source_corrected` answers "was this question
//   asked against a reading that has since moved?" for `clara.answer_work_question` and for the
//   shared question record. Ungranted for the same reason as the other three -- it reads
//   clara.document_fact_revisions joined to clara.accounting_work across the Work lane, and the
//   only callers that should ever ask it are SECURITY DEFINER doors that already hold a firm.
//   THE FIFTH NAME (third fix round): `_fact_value_changed` is the ONE notion of "this revision
//   changed the recorded value" that clara.revise_document_fact refuses a no-op with and
//   clara._question_source_corrected reads a revision row through. Ungranted like its siblings: it
//   is a predicate over document facts that only those two SECURITY DEFINER bodies should ask.
const WORK_SOURCE_CORRECTION_0268_UNGRANTED_FNS = [
  "_source_corrected_work", "_lock_source_corrected_work", "_supersede_source_corrected_work",
  "_question_source_corrected", "_fact_value_changed",
];
export const WORK_SOURCE_CORRECTION_0268_COHORT = [...WORK_SOURCE_CORRECTION_0268_UNGRANTED_FNS];
// #885 END

// #648 [0218, firm setup] — the FIRM's own onboarding plan gains human doors. Its OWN cohort for
// the same "wholly present or wholly absent" reason 0192's carries: folding these names into an
// older roster would red every database between the two frontiers, and `cohortFailures()` fails a
// PARTIAL cohort by design.
//
//   the FOUR human doors + the ONE read — clara_authenticated ONLY, every one floored at admin
//   inside its own body through `clara._human_ctx` and then re-floored against the catalogue row's
//   `min_role`. The agent, runtime and both wake roles gain ZERO here, and that is structural
//   rather than an omission: a `_human_ctx`-gated verb granted to a role that carries no JWT
//   claims is a DARK grant (0192 §H), and 0218's own §J tail asserts the same emptiness in-migration.
const FIRM_SETUP_0218_HUMAN_FNS = [
  "seed_firm_setup_plan", "answer_firm_setup_item", "defer_firm_setup_item",
  "commit_firm_setup", "get_firm_setup",
];
//   …and the UNGRANTED closure the five share: the firm's-own-plan lookup, the catalogue answer
//   grammar and the one revision bump. Listed so `cohortFailures` reports a half-applied 0218
//   rather than a silently narrower boundary.
const FIRM_SETUP_0218_UNGRANTED_FNS = [
  "_firm_setup_plan", "_assert_firm_setup_answer", "_firm_setup_bump",
];
export const FIRM_SETUP_0218_COHORT = [
  ...FIRM_SETUP_0218_HUMAN_FNS, ...FIRM_SETUP_0218_UNGRANTED_FNS,
];
// #648 END

// #649 [0219, create a client and continue accounting onboarding from what is already known] —
// its own cohort for the same "wholly present or wholly absent" reason 0192's and 0193's carry:
// folding these names into an older roster would red every database between the two frontiers,
// and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   the TWO human doors — clara_authenticated ONLY. `client_identity_candidates` is an identity
//   ORACLE (it enumerates a firm's client and counterparty names by leading token), floored at
//   ADMIN inside its own body to match clara.begin_client_onboarding exactly;
//   `settle_client_onboarding_facts` writes a client's canonical financial-year end through
//   clara.set_client_fy_end and is bookkeeper-floored to match that door. The agent role, both
//   wake roles and clara_runtime gain ZERO on either: clara.set_client_fy_end is
//   clara_authenticated-only (0041:4414) and clara._human_ctx raises CLR04 with no jwt_sub
//   (0004:302-303), so a machine lane could not execute the settle door's own body even if it
//   held the grant — a dark grant, in 0057 B6's sense.
const CLIENT_ONBOARDING_FACTS_0219_HUMAN_FNS = [
  "client_identity_candidates", "settle_client_onboarding_facts",
];
//   …and the ONE ungranted helper: the reader of a plan's settled financial-year-end MONTH,
//   reached only from the settle door (which runs as clara_fn_owner). Declared here so a future
//   accidental grant FAILS rather than passes silently, and so `cohortFailures` reports a
//   half-applied 0219 rather than a silently narrower boundary.
//
//   THE THREE `name_family_*` HELPERS ARE DELIBERATELY ABSENT FROM EVERY ROSTER IN THIS FILE
//   AND STAY THAT WAY. 0219 publishes their ANSWER through the definer wrapper above precisely
//   so that 0103:1225-1239's five-role EXECUTE census (repeated at 0126:509 and 0154:551) stays
//   green; the grant matrix's expected-false sweep over those names IS that assertion.
const CLIENT_ONBOARDING_FACTS_0219_UNGRANTED_FNS = ["_plan_fye_month"];
export const CLIENT_ONBOARDING_FACTS_0219_COHORT = [
  ...CLIENT_ONBOARDING_FACTS_0219_HUMAN_FNS, ...CLIENT_ONBOARDING_FACTS_0219_UNGRANTED_FNS,
];
// #649 END

// #625 [0224, the invited person's pre-password preview] — its own cohort for the same "wholly
// present or wholly absent" reason 0193's and 0197's carry, and a cohort of ONE name.
//
//   ONE HUMAN DOOR, clara_authenticated ONLY. `clara.preview_invite(p_token)` answers
//   {firm_name, role, effective status, masked address} for the ONE invite whose token the
//   caller holds AND whose email is the caller's own verified JWT claim — the same two facts
//   `clara.accept_invite` walls on. clara_runtime, both agent read roles and all four wake lanes
//   gain ZERO: a lane that could preview an invitation could enumerate which addresses have one
//   outstanding, which is the existence oracle 0141 §B closed by refusing the base table to every
//   application role in the first place. There is no `anon` role in this estate, so "signed out"
//   reaches nothing here either.
//
//   NO UNGRANTED CLOSURE. 0224 creates exactly one function and recuts none, so this cohort has
//   one member and the grant-matrix sweep below is what pins the rest.
const PREVIEW_INVITE_0224_HUMAN_FNS = ["preview_invite"];
export const PREVIEW_INVITE_0224_COHORT = [...PREVIEW_INVITE_0224_HUMAN_FNS];
// #625 END

// #655 [0225, trade invoices, supplier bills and the open item they birth] — its own cohort for
// the same "wholly present or wholly absent" reason 0221's carries. The NUMBER lives on the
// cohort, never on the migration's stem, which is what lets 0225 be renumbered at integration
// without touching a gate module's filename.
//
//   ONE RUNTIME DOOR. Work admission on this lane is a runtime act OBO a named human
//   (0194:1316-1318; 0221:1202-1206 states the law). There is NO clara_authenticated twin and no
//   `_for` sibling: a second door with a different authority model would be a second answer to
//   "who admitted this", and admission also ENQUEUES a run, which PostgREST cannot produce.
const TRADE_INVOICES_0225_RUNTIME_FNS = ["admit_trade_invoice_work"];
//   ONE READ — clara_authenticated (viewer-floored in its own body, the get_work_claim_origin
//   precedent) AND clara_runtime, because the run needs to echo what it posted. It is what lets a
//   Work row read "Supplier bill · Alpha Supplies · AP" without a purpose value.
const TRADE_INVOICES_0225_HUMAN_FNS = ["get_trade_invoice"];
//   …and the UNGRANTED closure: the payload/world predicate the door and a later reader share, the
//   canonical form the replay probe compares, the party resolver, the due-date derivation, the ONE
//   shared entry->kind resolver that clara._subledger_classify_entry LADDER 3T and
//   clara._tf_subledger_item_belt both call, and the three trigger bodies (the append-only belt,
//   the posted stamp and the lane-agnostic open-item birth). Listed so `cohortFailures` reports a
//   half-applied 0225 rather than a silently narrower boundary.
const TRADE_INVOICES_0225_UNGRANTED_FNS = [
  "_assert_trade_invoice_basis", "_trade_invoice_canonical", "_trade_invoice_resolve_party",
  "_trade_invoice_due", "_trade_invoice_kind_of_entry",
  "_tf_trade_invoice_append_only", "_tf_trade_invoice_posted", "_tf_je_open_item_birth",
];
export const TRADE_INVOICES_0225_COHORT = [
  ...TRADE_INVOICES_0225_RUNTIME_FNS, ...TRADE_INVOICES_0225_HUMAN_FNS,
  ...TRADE_INVOICES_0225_UNGRANTED_FNS,
];
// #655 END
// #657 [0226, matching bank evidence to an already-approved booking] — its own cohort for the
// same "wholly present or wholly absent" reason 0193's, 0197's and 0224's carry.
//
//   ONE HUMAN READ, clara_authenticated ONLY. `clara.get_bank_line_matching_context(p_line)`
//   answers everything ONE bank statement line can say about itself before a match is decided:
//   its own facts, its statement's header/lineage/filename, the period coverage (the `tie`
//   object LIFTED from clara.list_bank_statements rather than re-derived), the governing
//   bank_line_exceptions row, clara._wdb_line_booking_block's payload verbatim, and one
//   DETERMINISTIC basis row per candidate entry. clara_runtime, both agent read roles and all
//   four wake lanes gain ZERO — which entry a bank line clears is a HUMAN judgement (0038's own
//   law for this family) and the agent lane reads the pack, where its own gating lives.
//
//   ONE UNGRANTED HELPER, declared the 0020 way so an accidental grant FAILS and a
//   disappearance is reported as a half-applied 0226: `_bank_op_key_task`, the TOTAL
//   (IMMUTABLE STRICT, uuid-regex guarded, never-raising) reader of field 2 of a bank operation
//   key. It is the one place that key schema is parsed, and it is reachable only from the
//   definer bodies that own it.
//
//   `_wdb_line_booking_block` is DELIBERATELY NOT REPEATED HERE. 0226 makes it reachable from
//   a granted wrapper for the first time, but the block itself is 0044's and already rides
//   AF2_0044_UNGRANTED_FNS above; a second roster entry would be a second copy of one fact.
//   0226's own tail re-asserts it still holds ZERO grants, and so does p657.db.acl.
const BANK_MATCH_EVIDENCE_0226_HUMAN_FNS = ["get_bank_line_matching_context"];
const BANK_MATCH_EVIDENCE_0226_UNGRANTED_FNS = ["_bank_op_key_task"];
export const BANK_MATCH_EVIDENCE_0226_COHORT = [
  ...BANK_MATCH_EVIDENCE_0226_HUMAN_FNS, ...BANK_MATCH_EVIDENCE_0226_UNGRANTED_FNS,
];
// #657 END
// #656 [0228, the opening general ledger gets a source] — COMMENT-ONLY, deliberately, and the
// comment IS the cohort's content.
//
//   0228_opening_ledger_source.sql INSTALLS NO FUNCTION AND RECUTS NONE. Its whole content is a
//   republication of `clara.document_capabilities`: an UPDATE that raises every row's
//   `registry_version` from 1 to 2 (never DELETE-then-INSERT, #846 — 0207's BEFORE UPDATE
//   monotone trigger permits the raise and refuses a decrease with CLR08), plus a content
//   correction on thirteen of the 240 rows. So there is no granted name to roster, no ungranted
//   closure to pin, and `cohortFailures` has nothing to compare: a cohort array would be empty and
//   an empty array asserted against a live catalog proves nothing at all. The file's own tail
//   re-reads THIRTEEN opening-lane bodies at their measured pre-image shas — five of them splices
//   — and raises CLR10 if any has moved, which is the same claim from the migration's side.
//
//   THE ONE FACT WORTH RE-AFFIRMING HERE, because it is a GRANT fact and this file is the grant
//   estate's map: `clara.document_capabilities` carries NO app-role write, before or after the
//   republication. `clara_authenticated` holds SELECT alone; `clara_runtime`, both agent read
//   roles and every wake lane hold NOTHING on the table and reach the vocabulary only through
//   `clara._document_capability(text,text)` (0165's ruling, pinned by 0191's tail and re-proved by
//   0228's). `packages/db/tests/opening-ledger-source.test.mjs`'s `p656.registry.no_app_write` is
//   the executable half of that sentence, driven through real least-privileged personas.
//
//   The runtime half of #656 — the `opening_tb.line` producer wired in line at the OCR pass — adds
//   no database object either: it writes through `clara.persist_document_extraction`, which has
//   been granted and rostered since 0007.
// #656 END
// #636 [0229, the durable intake batch] — its own cohort for the same "wholly present or wholly
// absent" reason 0221's and 0224's carry. SIX granted names, not five: the sixth,
// `sweep_intake_batch_cancellations`, exists because clara_runtime holds NO SELECT and NO policy
// on clara.operation_receipts (0178:1619-1630 asserts both) and none on the batch PARENT, so the
// reconciler belt can find neither the live children of a `cancelling` parent nor the parent
// itself without a definer worklist door. Orchestrator ruling, DECISIONS §6.1 (2026-09-19).
//
//   FIVE RUNTIME DOORS — clara_runtime ONLY, the same lane clara.create_document_intake sits in
//   (0007:2780-2799). Reached by a human through the runtime's own authenticated route, never by
//   PostgREST: each takes its actor as an ARGUMENT and rechecks that human's live membership at
//   bookkeeper rank, because clara._human_ctx reads a JWT the pool does not carry (0004:299-309).
const INTAKE_BATCHES_0229_RUNTIME_FNS = [
  "open_intake_batch", "attach_intake_to_batch", "set_intake_batch_member_dependency",
  "cancel_intake_batch", "sweep_intake_batch_cancellations",
];
//   ONE HUMAN READ — clara_authenticated ONLY. The batch board is a human read (0214's own
//   argument); the pool gets its worklist from the sweep verb instead, so granting the board to
//   clara_runtime would be a second, unfloored way to read a firm's attention surface.
const INTAKE_BATCHES_0229_HUMAN_FNS = ["get_intake_batch"];
//   …and the ungranted closure: the three shared helpers and the two stamp triggers.
//   _intake_batch_pending_members joined in fix round 1 (ADV-636-01): it is what makes the
//   terminal flip mean "nothing live AND nothing that can still become live".
const INTAKE_BATCHES_0229_UNGRANTED_FNS = [
  "_intake_batch_actor_ctx", "_intake_batch_live_children", "_intake_batch_pending_members",
  "_tf_intake_batch_member_intake_stamp", "_tf_intake_batch_member_work_stamp",
];
export const INTAKE_BATCHES_0229_COHORT = [
  ...INTAKE_BATCHES_0229_RUNTIME_FNS, ...INTAKE_BATCHES_0229_HUMAN_FNS,
  ...INTAKE_BATCHES_0229_UNGRANTED_FNS,
];
// #636 END
// #658 [0230, bounded core-first knowledge retrieval + the recorded read-set + drift] — its own
// cohort above 0192's and 0220's for the same "wholly present or wholly absent" reason: it recuts
// nothing and adds a whole lane, so half of it is a read with no way to record what it read.
//
//   the TWO HUMAN doors — clara_authenticated ONLY. `work_knowledge_drift` floors at VIEWER (the
//   same floor clara.list_client_knowledge takes, 0192:1316) and takes its firm from the session;
//   whether the basis under a Work has moved is something anybody who may see the Work may ask.
//   `list_work_knowledge_reads_for_record` is DECISIONS.md:83's SEVENTH door and is the ONLY human
//   path into clara.work_knowledge_reads, which is FORCE-RLS with no app-role SELECT — a
//   `grant select` is not an alternative to it, and 0230's tail refuses one. clara_runtime holds
//   NEITHER: the run already knows what it read, and a drift twin that names its firm exists for it.
const KNOWLEDGE_RETRIEVAL_0230_HUMAN_FNS = [
  "work_knowledge_drift", "list_work_knowledge_reads_for_record",
];
//   the FIVE RUNTIME names — clara_runtime ONLY. Three of them are PACK-SHAPED reads, so #783
//   binds them (.out-of-scope/human-read-of-knowledge-pack.md — "the register is the human
//   surface; the pack is the model's"): a human grant on any of the three is the ruling being
//   re-litigated inside a grant matrix, and this roster is where that fails loudly.
const KNOWLEDGE_RETRIEVAL_0230_RUNTIME_FNS = [
  "retrieve_knowledge", "read_knowledge_record_for", "read_knowledge_history_for",
  "record_work_knowledge_read", "work_knowledge_drift_for",
];
//   …and the ONE ungranted core both drift doors delegate to, listed so `cohortFailures` reports
//   a half-applied 0230 rather than a silently narrower boundary.
const KNOWLEDGE_RETRIEVAL_0230_UNGRANTED_FNS = ["_work_knowledge_drift_core"];
export const KNOWLEDGE_RETRIEVAL_0230_COHORT = [
  ...KNOWLEDGE_RETRIEVAL_0230_HUMAN_FNS, ...KNOWLEDGE_RETRIEVAL_0230_RUNTIME_FNS,
  ...KNOWLEDGE_RETRIEVAL_0230_UNGRANTED_FNS,
];
// #658 END
// #660 [0232, the client home's money band] — the CLIENT FINANCIAL PACK lane, its own cohort for
// the same "wholly present or wholly absent" reason the 0214 block carries.
//
//   THREE doors, and ALL THREE are clara_authenticated ONLY. `get_client_financial_pack` and
//   `propose_client_cash_accounts` are SECURITY INVOKER over relations already granted to
//   clara_authenticated behind forced firm-scoped RLS, floored at VIEWER in their own bodies;
//   `publish_client_cash_account_set` is SECURITY DEFINER, floored at ADMIN through
//   clara._human_ctx. clara_runtime, clara_agent_ro and every clara_wake_* role gain ZERO on ALL
//   THREE — 0232 ships NO agent twin, no wake wrapper and no allowlist row, a deliberate
//   departure from clara.wake_create_account_set (0115:79-97) that 0232's header argues: that
//   precedent belongs to the metric lane 0059:251 walls off from journal_entries/journal_lines,
//   and petty cash has no derivable structural basis at all (0121:4749). The same fact is proven
//   behaviourally by `p660.pack.no_agent_reach`, door by door and role by role.
//
//   AND A FOURTH NAME THAT IS NOT A DOOR: `book_today`, the book-day delegate 0232 installs so a
//   SECURITY INVOKER read can reach the house date authority at all (DECISIONS 6.4 row 1). It is
//   clara_authenticated-only like the three doors, so it is claimed here rather than left to fall
//   out of operation-census as `unattributed`.
//
//   FUNCTION NAMES ONLY. `liveNames` below is built from pg_proc rows, so a cohort covers
//   functions and nothing else: 0232's two new RELATIONS are asserted by the migration's own tail
//   and by the battery, never here. clara._tf_cash_account_set_integrity is an ungranted trigger
//   function and is covered by the grant-matrix sweep rather than by this roster.
const CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS = [
  "get_client_financial_pack", "propose_client_cash_accounts", "publish_client_cash_account_set",
  // A FOURTH NAME, and it is a HELPER rather than a door (DECISIONS 6.4 row 1). `book_today` is a
  // one-line SECURITY DEFINER delegate of `clara._book_today()`, installed by 0232 because the
  // two reads above are SECURITY INVOKER and the house date authority has PUBLIC revoked with an
  // ACL of {clara_fn_owner} alone -- a closed ACL `x42.s5c.1` pins as house law. It is here for
  // the same reason every other granted name is: `clara_authenticated` can execute it, so it is a
  // PUBLIC-boundary routine and operation-census's `unattributed` label reports any such routine
  // no cohort claims. Model lanes gain nothing on it either, asserted by name in 0232's tail and
  // behaviourally by `p660.pack.as_of_is_book_day`.
  "book_today",
];
export const CLIENT_FINANCIAL_PACK_0232_COHORT = [...CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS];
// #660 END
// #635 [0233, the firm's real legal, commercial and model-usage state] — its own cohort, and
// the FIRST on this roster that deliberately is NOT "wholly absent" before its migration.
//
//   THREE NEW HUMAN DOORS, clara_authenticated ONLY. `get_firm_legal_standing()` (viewer floor,
//   arity 0 forever) answers whether an ACTIVE OWNER of the caller's firm holds both currently
//   published legal acceptances — 0195:890-906's limb (a), which is what governs model egress;
//   `get_firm_commercial_state()` and `get_firm_ai_usage(date)` are admin-floored and answer the
//   firm's plan, payment record and monthly model usage. clara_runtime, both agent read roles
//   and all four wake lanes gain ZERO on all three: each is `_human_ctx`-gated, so a lane
//   carrying no JWT claims could not execute the body even if it held the grant — a DARK grant
//   in 0057 B6's sense.
//
//   THE FOURTH NAME IS THE RECUT, and it is why this cohort needs a sentinel. 0233 recuts
//   `get_llm_usage_summary` (0110's, body only, adding the admin floor it never had). That name
//   has existed since 0110 — 123 files earlier — so on a pre-0233 frontier this roster is
//   PARTIAL by construction, which `cohortFailures()` fails by design. The guard at the call
//   site therefore arms the check on the FIRST NEW name rather than on emptiness; #652's
//   accrual cohort takes the same shape for the mirror-image reason (wholly absent before its
//   own migration).
const FIRM_COMMERCIAL_0233_HUMAN_FNS = [
  "get_firm_legal_standing", "get_firm_commercial_state", "get_firm_ai_usage",
];
const FIRM_COMMERCIAL_0233_RECUT_FNS = ["get_llm_usage_summary"];
export const FIRM_COMMERCIAL_0233_COHORT = [
  ...FIRM_COMMERCIAL_0233_HUMAN_FNS, ...FIRM_COMMERCIAL_0233_RECUT_FNS,
];
// #635 END
// #1008 [0234, the platform's legal enforcement mode] — its own cohort, bimodal like 0222's and
// 0231's: wholly present once 0234 applies, wholly absent before it, because the
// `db-slice-frontiers` matrix runs this package against earlier frontiers.
//
//   TWO NEW HUMAN DOORS, clara_authenticated ONLY, both floored on the OPERATOR FIRM's owner in
//   their own bodies — `clara.set_admission_capacity`'s predicate, byte-for-byte, re-derived at
//   call time. `set_legal_enforcement_mode(text,text,text)` is the ONE writer of
//   `clara.legal_enforcement` (op_receipts-idempotent, with a clara._audit receipt);
//   `get_legal_enforcement_mode()` is the operator's own read of it. clara_runtime, both agent
//   read roles and all four wake lanes gain ZERO on both: each is `_human_ctx`-gated, so a lane
//   carrying no JWT claims could not execute the body even if it held the grant.
//
//   0234's ONE internal, `clara._legal_enforcement_mode`, is granted to NOBODY — it is the one
//   body every wall reads, reached only from DEFINER bodies, and is therefore expected-false for
//   every role in the live sweep rather than listed here. That is the same disposition 0186's
//   `clara._admission_capacity_state` and 0188's `clara._operator_support_cases` carry.
//
//   THE FOUR BODIES 0234 RECUTS keep their existing cohort memberships: their grants did not move
//   (`create or replace` preserves the ACL, and 0234's tail asserts each one byte-for-byte).
const LEGAL_ENFORCEMENT_0234_HUMAN_FNS = [
  "set_legal_enforcement_mode", "get_legal_enforcement_mode",
];
export const LEGAL_ENFORCEMENT_0234_COHORT = [...LEGAL_ENFORCEMENT_0234_HUMAN_FNS];
// #1008 END
// #960 [0270, the firm's OWN document-processing caps] — its own cohort, bimodal like 0234's:
// wholly present once 0270 applies, wholly absent before it, because the `db-slice-frontiers`
// matrix runs this package against earlier frontiers.
//
//   ONE NEW HUMAN DOOR, clara_authenticated ONLY, floored on the FIRM's OWN admin rank in its own
//   body (`clara._human_ctx(clara.role_rank('admin'))`, so an owner passes too) — the owner's
//   2026-09-20 ruling on #960 is option C: the firm sets its own four caps, with no operator gate.
//   `set_firm_document_limits(int,int,int,int,text)` is the FIRST human writer
//   `clara.firm_document_limits` has ever had; it is op_receipts-idempotent and leaves a
//   `clara._audit` row naming the before and after of every changed cap. clara_runtime, both
//   agent read roles and all four wake lanes gain ZERO: the body is `_human_ctx`-gated, so a lane
//   carrying no JWT claims could not execute it even if it held the grant.
//
//   0270's ONE internal, `clara._firm_document_limit_ceiling`, is granted to NOBODY — it is the
//   estate's own ceiling above whatever a firm sets, reached only from the door's DEFINER body,
//   and is therefore expected-false for every role in the live sweep rather than listed here.
//   That is the same disposition 0234's `clara._legal_enforcement_mode` carries.
const FIRM_DOCUMENT_LIMITS_0270_HUMAN_FNS = ["set_firm_document_limits"];
export const FIRM_DOCUMENT_LIMITS_0270_COHORT = [...FIRM_DOCUMENT_LIMITS_0270_HUMAN_FNS];
// #960 END

// #932 [0277, a default depreciation policy per enrolled fixed-asset account] — its own cohort,
// bimodal like 0270's: wholly present once 0277 applies, wholly absent before it, because the
// `db-slice-frontiers` matrix runs this package against earlier frontiers.
//
//   TWO NEW HUMAN DOORS, clara_authenticated ONLY, floored on bookkeeper in their own bodies
//   (`clara._human_ctx(clara.role_rank('bookkeeper'))`, the SAME floor `upsert_fa_account_profile`
//   takes): `set_fa_depreciation_policy` (version-forward: retires the live row if one exists,
//   mints a fresh one at version+1) and `retire_fa_depreciation_policy` (ends the live row
//   without replacing it). clara_runtime, both agent read roles and all four wake lanes gain
//   ZERO: both bodies are `_human_ctx`-gated, so a lane carrying no JWT claims could not execute
//   them even if it held the grant.
//
//   0277 mints NO ungranted internal of its own: the policy lookup lives inline in the two
//   birth sites it recuts (`clara._tf_fa_acquisition_birth`, `clara._fa_on_approve`), neither of
//   which is a NEW name — both keep their existing cohort memberships (FA_0041_UNGRANTED_FNS for
//   `_fa_on_approve`; the trigger function is not itself a granted/ungranted roster member).
const FA_DEFAULT_DEPRECIATION_POLICY_0277_HUMAN_FNS = [
  "set_fa_depreciation_policy", "retire_fa_depreciation_policy",
];
export const FA_DEFAULT_DEPRECIATION_POLICY_0277_COHORT = [
  ...FA_DEFAULT_DEPRECIATION_POLICY_0277_HUMAN_FNS,
];
// #932 END

// #975 [0279, the closed-year arrears question] — its own cohort, bimodal like 0277's: wholly
// present once 0279 applies, wholly absent before it, because the `db-slice-frontiers` matrix
// runs this package against earlier frontiers.
//
//   ONE NEW HUMAN DOOR, clara_authenticated ONLY, floored on bookkeeper in its own body
//   (`clara._human_ctx(clara.role_rank('bookkeeper'))`, the SAME floor
//   `clara.run_depreciation_manual` takes — the person who may run the period is the person who
//   may judge its arrears): `record_fa_arrears_resolution`. clara_runtime, both agent read roles
//   and all four wake lanes gain ZERO: materiality is a professional judgement under IAS 8 and no
//   machine lane may make it, and a lane carrying no JWT claims could not pass `_human_ctx` even
//   if it held the grant.
//
//   0279's own internal, `clara._fa_closed_arrears`, is granted to NOBODY — it is reached only
//   from the DEFINER bodies of the run core and the door above — and is therefore expected-false
//   for every role in the live sweep rather than listed here. That is the same disposition 0270's
//   `clara._firm_document_limit_ceiling` and 0234's `clara._legal_enforcement_mode` carry.
const FA_CLOSED_YEAR_ARREARS_0279_HUMAN_FNS = ["record_fa_arrears_resolution"];
export const FA_CLOSED_YEAR_ARREARS_0279_COHORT = [...FA_CLOSED_YEAR_ARREARS_0279_HUMAN_FNS];
// #975 END

// #1014 [0235, the document binding claim] — ONE relation and NO function name: 0235 recuts
// clara._lock_document_binding in place (a `create or replace`, so no catalog entry enters or
// leaves) and mints clara.document_binding_claims, the serialization token that makes a blocked
// SERIALIZABLE opening approval lose instead of committing on its pre-block snapshot. There is
// therefore no EXECUTE cohort to declare — the grant matrix is unchanged — only a TABLE cohort,
// gated exactly as DOCUMENT_SOURCE_REVISION_0217_TABLES is: GOVERNED_TABLES' (a) branch demands
// every entry EXIST, so listing it unconditionally would turn every pre-0235 database into a
// MISSING-table failure that says nothing about RLS. The relation is written by that one definer
// and read by NOBODY, so it holds no grant for any application role — the (b) derive branch
// below still asserts its forced RLS either way, and 0235's own tail asserts the empty ACL.
export const OPENING_BINDING_CLAIM_0235_TABLES = ["document_binding_claims"];
// #1014 END

// #984 [0239, the opening lane becomes a Work] — NO cohort is owed here, and that is a measured
// disposition rather than an omission. 0239 mints exactly one catalog name,
// `clara._admit_opening_work`, and revokes EXECUTE from PUBLIC on it: it is an INTERNAL, reachable
// only from clara.approve_opening_seed and clara.approve_opening_correction (both already recut in
// place, so their ACLs did not move — `create or replace` preserves them, and 0239's tail asserts
// each one). An internal granted to NOBODY is expected-false for every role in the live sweep
// rather than listed here — the same disposition 0234's `clara._legal_enforcement_mode`, 0186's
// `clara._admission_capacity_state` and 0188's `clara._operator_support_cases` carry. 0239 mints no
// relation either, so there is no TABLE cohort to gate the way 0235's and 0217's are. What it DOES
// move is four CHECK constraints and one column's nullability, none of which this file describes.
// #984 END

// #912 [0243, the role at the instant of a governed act] — its own cohort, bimodal like 0234's:
// wholly present once 0243 applies, wholly absent before it, because the `db-slice-frontiers`
// matrix runs this package against earlier frontiers.
//
//   ONE new body, and it is a TRIGGER function: clara._tf_audit_actor_role stamps
//   `clara.audit_log.actor_role` BEFORE INSERT. It is granted to NOBODY (a trigger body is
//   reached by the trigger, never by a caller), so it is expected-false for every role in the
//   live sweep; this cohort is what fails if the NAME ever disappears, the other half of the
//   0020 contract. No door is recut and no grant moves: clara._audit keeps its frozen 0004 body
//   and its signature, which is exactly how all 304 callers inherit the column.
//
//   clara.list_firm_knowledge, which 0243 recuts, keeps its existing 0220 cohort membership
//   (`create or replace` preserves the ACL, and 0243's tail asserts the body and the ACL).
const AUDIT_ACTOR_ROLE_0243_UNGRANTED_FNS = ["_tf_audit_actor_role"];
export const AUDIT_ACTOR_ROLE_0243_COHORT = [...AUDIT_ACTOR_ROLE_0243_UNGRANTED_FNS];
// #912 END

// #935 [0259, firm setup 2/2] — its own cohort for the same "wholly present or wholly absent"
// reason 0218's/0257's/0258's carry: folding this name into an older roster would red every
// database between the two frontiers, and `cohortFailures()` fails a PARTIAL cohort by design.
//
//   THE ONE NEW GRANTED NAME: `dismiss_firm_setup_tip`, the narrow door that acknowledges or skips
//   an education tip — clara_authenticated ONLY, admin-floored in its own body through
//   `clara._human_ctx` and then re-floored against the catalogue row's own `min_role`, exactly the
//   0218 §E posture. clara_runtime, clara_agent_ro and both wake roles gain ZERO — the same
//   `_human_ctx`-gated-verb-on-a-JWT-less-role "dark grant" reason 0192 §H and 0218 §G already
//   state, and 0259's own tail asserts the same emptiness in-migration. `answer_firm_setup_item`
//   and `defer_firm_setup_item` are RECUT (a new education guard) but mint no new name and keep
//   their existing FIRM_SETUP_0218_HUMAN_FNS membership above — their grants did not move
//   (`create or replace` preserves the ACL, and 0259's own tail asserts it byte-for-byte).
const FIRM_SETUP_TIP_0259_HUMAN_FNS = ["dismiss_firm_setup_tip"];
export const FIRM_SETUP_TIP_0259_COHORT = [...FIRM_SETUP_TIP_0259_HUMAN_FNS];
// #935 END

// #1007 [0275, warn before recording a trade invoice that looks like one already recorded] — its
// own cohort, frontier-tolerant like every cohort above: wholly absent on a chain below 0275,
// wholly present once it applies, and a PARTIAL cohort is what `cohortFailures` reports.
//
//   ONE HUMAN READ, clara_authenticated ONLY. `probe_trade_invoice_duplicates(uuid,text,jsonb)`
//   answers "which already-recorded invoices of this client look like the one about to be
//   recorded", on two independent signals (same normalised document number; same total on the
//   same document date). It is floored on the bookkeeper rank in its own body — the floor of the
//   recording step it precedes — and takes its firm AND actor from the session, so it is no
//   cross-tenant oracle. clara_runtime, both agent read roles and all four wake lanes gain ZERO:
//   the body is `_human_ctx`-gated, so a lane carrying no JWT claims could not execute it even if
//   it held the grant (packages/runtime/lib/pools.mjs sets no request.jwt.claims).
//
//   A SECOND HUMAN READ, also clara_authenticated ONLY and viewer-floored in its own body:
//   `get_trade_invoice_duplicate_ack(uuid)` answers, for one Work, which earlier invoices the
//   person who recorded it was shown, and who acknowledged them when. The machine lanes gain ZERO
//   on it for the same `_human_ctx` reason.
//
//   TWO clara_runtime DOORS, and a NEW NAME rather than a widened grant in both cases. The
//   actor-explicit probe twin `probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` exists
//   because a clara_runtime connection carries no JWT claims (packages/runtime/lib/pools.mjs sets
//   none), so `clara._human_ctx` cannot answer for the chat lane;
//   `record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)` writes the "recorded
//   anyway" choice BEFORE the admission it authorises and therefore carries
//   `clara.admit_trade_invoice_work`'s own authority model. Both are expected-false for
//   clara_authenticated: a caller-supplied actor on a session-authenticated role is the
//   cross-tenant-oracle shape 0219 names.
//
//   FOUR INTERNALS, granted to NOBODY: `_trade_invoice_reference_key` (the ONE document-number
//   normalisation), `_trade_invoice_duplicate_matches` (the ONE matcher both entrances share, so
//   the form and the chat lane can never be shown different answers), `_trade_invoice_probe_core`
//   (the shared probe body) and `_trade_invoice_actor_firm` (the ONE copy of the admission door's
//   authority preamble the two actor-explicit doors share). They are rostered here so a
//   half-applied 0275 is reported as one, and are expected-false for every role in the live grant
//   sweep rather than listed in ALLOWED.
//
//   `clara.trade_invoice_duplicate_acks` is a TABLE and so invisible to this function roster:
//   clara_authenticated holds SELECT on it and no DML, which 0275's own tail asserts.
const TRADE_INVOICE_DUPLICATE_0275_HUMAN_FNS = [
  "probe_trade_invoice_duplicates", "get_trade_invoice_duplicate_ack",
];
const TRADE_INVOICE_DUPLICATE_0275_RUNTIME_FNS = [
  "probe_trade_invoice_duplicates_for", "record_trade_invoice_duplicate_ack",
];
const TRADE_INVOICE_DUPLICATE_0275_UNGRANTED_FNS = [
  "_trade_invoice_reference_key", "_trade_invoice_duplicate_matches", "_trade_invoice_probe_core",
  "_trade_invoice_actor_firm",
];
export const TRADE_INVOICE_DUPLICATE_0275_COHORT = [
  ...TRADE_INVOICE_DUPLICATE_0275_HUMAN_FNS, ...TRADE_INVOICE_DUPLICATE_0275_RUNTIME_FNS,
  ...TRADE_INVOICE_DUPLICATE_0275_UNGRANTED_FNS,
];
// #1007 END
// #1002 [0276, the second-pass cash-account-set membership editor's own read] — its own cohort,
// bimodal like 0270's: wholly present once 0276 applies, wholly absent before it, because the
// `db-slice-frontiers` matrix runs this package against earlier frontiers.
//
//   ONE NEW HUMAN READ: `get_client_cash_account_set_members(uuid)` — clara_authenticated ONLY,
//   VIEWER floor (the same inline floor `propose_client_cash_accounts`, 0232, already uses,
//   copied rather than shared). It enumerates the client's CURRENT PUBLISHED cash-account-set
//   version's membership, each member carrying its RECORDED reason — the complement
//   `propose_client_cash_accounts` cannot give, since that read flags `already_member` for
//   bank-registry candidates only. clara_runtime, both agent read roles and all four wake lanes
//   gain ZERO — no agent twin, no wake wrapper, no allowlist row, the same posture 0232's own
//   three doors carry.
const CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_HUMAN_FNS = ["get_client_cash_account_set_members"];
export const CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_COHORT =
  [...CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_HUMAN_FNS];
// #1002 END
// #936 [0284, a dedicated accrual-correction door] — its own cohort, the same "wholly present or
// wholly absent" reason 0222's own carries: the `db-slice-frontiers` matrix runs this package
// against databases pinned at earlier frontiers where 0222 has applied and 0284 has not.
//
//   the ONE human door — clara_authenticated ONLY. It nests clara.revise_accounting_plan
//   (0193, UNCHANGED — lane 05's own pin) rather than recutting it, so it mints no new plan-lane
//   body and no new runtime verb; there is no OBO twin for this ticket's scope.
const ACCRUAL_CORRECTION_0284_HUMAN_FNS = ["correct_accrual_adjustment"];
export const ACCRUAL_CORRECTION_0284_COHORT = [...ACCRUAL_CORRECTION_0284_HUMAN_FNS];

// #986 [0286, a re-read opening document becomes re-parsable] — its own cohort, the same
// "wholly present or wholly absent" reason 0222's and 0284's carry: the `db-slice-frontiers`
// matrix runs this package against databases pinned at earlier frontiers where 0017 has applied
// and 0286 has not.
//
//   the ONE door — clara_runtime ONLY, exactly as clara.record_opening_targets_parsed
//   (WAVE_B_RUNTIME_FNS above) is held: a document-primary opening target is written by the lane
//   that re-derived it from stored evidence, never by a browser that typed it. Declared here so a
//   grant to clara_authenticated, to either agent read role or to any wake lane FAILS the matrix.
//   0286 recuts no 0017 body and mints no human door, so nothing else moves.
const OPENING_SOURCE_REREAD_0286_RUNTIME_FNS = ["refresh_opening_targets_from_reread"];
export const OPENING_SOURCE_REREAD_0286_COHORT = [...OPENING_SOURCE_REREAD_0286_RUNTIME_FNS];
// #899 [0287, client birth wall] — THE ONE NEW GRANTED NAME: `open_client_onboarding`, the
// birth verb that folds `clara.client_identity_candidates`'s own candidate resolution into the
// door that creates a client (arity 0 proceeds, arity 1 needs `p_acknowledged_candidate`, arity
// >=2 raises CLR10 `name_family_collision`) — clara_authenticated ONLY, admin-floored in its own
// body through `clara._human_ctx`; clara_runtime, clara_agent_ro and both wake roles gain ZERO
// (0287's own tail asserts the shape). `begin_client_onboarding` is RECUT (re-pointed at the
// shared, ungranted `clara._client_birth_core`) but mints no new name and keeps its existing
// WAVE_B_HUMAN_FNS membership above — its grant did not move (`create or replace` preserves the
// ACL, and 0287's own tail asserts it byte-for-byte). `create_client` is untouched by 0287 (see
// that migration's header for why) and keeps its existing WRITERS membership above unmoved.
const CLIENT_BIRTH_WALL_0287_HUMAN_FNS = ["open_client_onboarding"];
export const CLIENT_BIRTH_WALL_0287_COHORT = [...CLIENT_BIRTH_WALL_0287_HUMAN_FNS];
// #899 END
// #939 [0305, a prepayment with no document is amortised from a person-stated service period] —
// its own cohort, the same "wholly present or wholly absent" reason 0284's carries: the
// `db-slice-frontiers` matrix runs this package against databases pinned at earlier frontiers
// where 0223 has applied and 0305 has not.
//
//   the ONE human door — clara_authenticated ONLY, bookkeeper-floored in its own body. The agent
//   role, both wake roles and clara_runtime gain ZERO and NO wake wrapper exists at all: a service
//   period a model supplied would be a model-generated value entering a durable artifact (hard
//   constraint 2; the owner's default 6, 2026-09-18 — the model may only ever ask the fixed
//   two-date question). 0305's own tail asserts that by pg_proc count, not by convention.
const PREPAYMENT_STATED_TERM_0305_HUMAN_FNS = ["record_prepayment_stated_term"];
//   …and the UNGRANTED closure: the carrier's supersede-only trigger and the SECOND deterministic
//   evaluator, `prepayment_schedule_v2` — v1's formula with the amount, the released account, the
//   released side and the term as ARGUMENTS, registered as its own single-member
//   clara.evaluator_versions closure. It is granted to NOBODY, exactly as v1 is: it is reached only
//   from a definer door, no consumer exists for a human grant, and law 31 says do not mint one. No
//   new runtime verb.
const PREPAYMENT_STATED_TERM_0305_UNGRANTED_FNS = [
  "_tf_pst_supersede_only", "prepayment_schedule_v2",
];
export const PREPAYMENT_STATED_TERM_0305_COHORT = [
  ...PREPAYMENT_STATED_TERM_0305_HUMAN_FNS, ...PREPAYMENT_STATED_TERM_0305_UNGRANTED_FNS,
];
// #939 END
// #940 [0306, a per-client roster of prepayment accounts gates amortisation ahead of the shared
// negative wall] — its own cohort, the same "wholly present or wholly absent" reason 0305's
// carries: the `db-slice-frontiers` matrix runs this package against databases pinned at earlier
// frontiers where 0223/0305 have applied and 0306 has not.
//
//   the TWO human doors — clara_authenticated ONLY, bookkeeper-floored in their own bodies (owner
//   decision 2, 2026-09-18: enrolling and retiring is bookkeeper work, the same floor as editing
//   the chart and the fixed-asset profiles). The agent role, both wake roles and clara_runtime gain
//   ZERO and NO wake wrapper exists at all: enrolment is a judgement about a client's chart, and
//   0306's own tail asserts the absence by pg_proc count rather than by convention.
const PREPAYMENT_ACCOUNT_ROSTER_0306_HUMAN_FNS = [
  "enrol_prepayment_account", "retire_prepayment_account",
];
//   …and the UNGRANTED closure: the roster relation's retire-only trigger and the ONE spelling of
//   the roster question, `_prepayment_account_enrolled`. The predicate is granted to NOBODY — it is
//   reached only from a definer body (the schedule door and the attention read today, #915's OBO
//   twin and #941's deferred-revenue mirror next), exactly as clara._adj_line_eligibility_breach is,
//   and law 31 says do not mint a grant no consumer needs. No new runtime verb.
const PREPAYMENT_ACCOUNT_ROSTER_0306_UNGRANTED_FNS = [
  "_tf_pae_retire_only", "_prepayment_account_enrolled",
];
export const PREPAYMENT_ACCOUNT_ROSTER_0306_COHORT = [
  ...PREPAYMENT_ACCOUNT_ROSTER_0306_HUMAN_FNS, ...PREPAYMENT_ACCOUNT_ROSTER_0306_UNGRANTED_FNS,
];
// #940 END
// #915 [0307, #653's chat entrance stops at a grant wall — create_prepayment_schedule has no
// clara_runtime twin] — its own cohort, the same "wholly present or wholly absent" reason 0306's
// carries: the `db-slice-frontiers` matrix runs this package against databases pinned at earlier
// frontiers where 0223/0305/0306 have applied and 0307 has not.
//
//   the ONE OBO door and the ONE machine-lane read — clara_runtime ONLY, and a NEW NAME rather
//   than a widened grant, because clara.create_prepayment_schedule (in the human roster above)
//   must never reach a machine principal: an OBO configuration names the human it acts for, and a
//   runtime grant on the human door would be one that names nobody. The agent role and both wake
//   roles gain ZERO — a lane that could configure its own amortisation schedule would be the agent
//   deciding what it is allowed to do. The read carries no document bytes and no human grant: its
//   consumer is claraWork's term park, and the human lane already has clara.get_prepayment_schedule.
const PREPAYMENT_SCHEDULE_OBO_0307_RUNTIME_FNS = [
  "create_prepayment_schedule_for", "read_prepayment_source_for",
];
//   …and the UNGRANTED closure: the ONE body both entrances run, and the OBO lane's plan step. The
//   core is granted to NOBODY — it is reached only from the two doors' definer bodies (the
//   one-ungranted-core law, 0004:6-12), exactly as clara._accrual_plan_core is.
const PREPAYMENT_SCHEDULE_OBO_0307_UNGRANTED_FNS = [
  "_prepayment_schedule_core", "_prepayment_plan_core",
];
export const PREPAYMENT_SCHEDULE_OBO_0307_COHORT = [
  ...PREPAYMENT_SCHEDULE_OBO_0307_RUNTIME_FNS, ...PREPAYMENT_SCHEDULE_OBO_0307_UNGRANTED_FNS,
];
// #915 END
// #941 [0308, deferred revenue: recognise a receipt paid ahead by a customer as revenue over its
// service period] — its own cohort, the same "wholly present or wholly absent" reason 0307's
// carries: the `db-slice-frontiers` matrix runs this package against databases pinned at earlier
// frontiers where 0223/0305/0306/0307 have applied and 0308 has not.
//
//   the ONE human write and the THREE human reads — clara_authenticated ONLY. The write is
//   bookkeeper-floored in its own body; the reads are viewer-floored with a firm predicate inside
//   each, because clara.revenue_recognition_schedules carries no ACL at all and a plain PostgREST
//   table read 42501s.
const DEFERRED_REVENUE_0308_HUMAN_FNS = [
  "create_revenue_recognition_schedule", "get_revenue_recognition_schedule",
  "list_revenue_recognition_schedules", "list_revenue_recognition_attention",
];
//   …the OBO twin and the machine-lane read — clara_runtime ONLY, and NEW NAMES rather than
//   widened grants, for #915's own reason: an on-behalf configuration names the human it acts for,
//   and a runtime grant on the human door would be one that names nobody. The agent role and both
//   wake roles gain ZERO, and there is no wake wrapper at all — 0308's tail asserts the absence by
//   pg_proc census rather than by convention.
const DEFERRED_REVENUE_0308_RUNTIME_FNS = [
  "create_revenue_recognition_schedule_for", "read_revenue_recognition_source_for",
];
//   …and the UNGRANTED closure: the ONE body both entrances run, the generic OBO plan step
//   clara._prepayment_plan_core now delegates to, the per-period line lookup the monthly admission
//   arm calls, the schedule-scoped ctx helper and the relation's append-only trigger. Every one is
//   reached from a definer body only (the one-ungranted-core law, 0004:6-12).
const DEFERRED_REVENUE_0308_UNGRANTED_FNS = [
  "_revenue_recognition_core", "_obo_plan_core", "_plan_revenue_recognition_period_line",
  "_revenue_recognition_ctx", "_tf_revenue_recognition_schedules_append_only",
];
export const DEFERRED_REVENUE_0308_COHORT = [
  ...DEFERRED_REVENUE_0308_HUMAN_FNS, ...DEFERRED_REVENUE_0308_RUNTIME_FNS,
  ...DEFERRED_REVENUE_0308_UNGRANTED_FNS,
];
// #939 AC4 / #941 AC3 [0317, the term-correction doors] — its own cohort, the same "wholly present
// or wholly absent" reason 0308's carries: the `db-slice-frontiers` matrix runs this package
// against databases pinned at earlier frontiers where 0305/0308 have applied and 0317 has not.
//
//   the TWO human doors — clara_authenticated ONLY, bookkeeper-floored in their own bodies, the
//   same floor that states the term and configures the first schedule. clara_runtime, both agent
//   read roles and all four wake lanes gain ZERO and there is NO obo twin and NO wake wrapper at
//   all: re-deriving a client's amortisation or revenue recognition is a judgement with a named
//   person behind it, and a machine grant here would be a correction nobody signed. 0317's own
//   tail asserts the absence by pg_proc count rather than by convention.
const SCHEDULE_TERM_CORRECTION_0317_HUMAN_FNS = [
  "replace_prepayment_schedule", "replace_revenue_recognition_schedule",
];
//   …and the UNGRANTED closure: the two predicates both doors ask. `_schedule_term_correction` is
//   `clara.get_prepayment_schedule`'s own #919 term-liveness predicate lifted so the READ and the
//   DOOR cannot disagree about whether a term was corrected; `_schedule_open_remainder` is the one
//   spelling of "which periods has this plan already taken up". Both are granted to NOBODY — they
//   are reached only from a definer body, exactly as `clara._prepayment_account_enrolled` is, and
//   law 31 says do not mint a grant no consumer needs.
const SCHEDULE_TERM_CORRECTION_0317_UNGRANTED_FNS = [
  "_schedule_term_correction", "_schedule_open_remainder",
];
export const SCHEDULE_TERM_CORRECTION_0317_COHORT = [
  ...SCHEDULE_TERM_CORRECTION_0317_HUMAN_FNS, ...SCHEDULE_TERM_CORRECTION_0317_UNGRANTED_FNS,
];
// #941 END

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
    ...H17_H19_HUMAN_FNS, // H-19 the owner-floored sales-lane WRAPPER (no firm argument; the
    // firm comes from _human_ctx at owner rank). The un-walled 0046 signature it delegates to
    // stays in SALES_LANE_0046_UNGRANTED_FNS above, expected false for every role.
    ...CLIENT_FACTS_0055_HUMAN_FNS, // 0055 [Wave E lane α] the client-facts door (admin floor;
    // agent + both wake roles gain ZERO — 0055's S7 tail asserts it in-migration)
    ...DOCUMENT_SOURCE_REVISION_0217_HUMAN_FNS, // #646 [0217] the two source-revision writes + the two reads
    ...KNOWLEDGE_0192_HUMAN_FNS, // #644 [0192] the three knowledge writes + the three C13 reads
    ...KNOWLEDGE_0192_SHARED_FNS, // #644 [0192] the promotion door — the ONE two-lane name
    ...COUNTERPARTY_IDENTITY_0215_HUMAN_FNS, // #647 [0215] the three counterparty-identity reads
    // (viewer-floored, firm-predicated); agent/wake/runtime gain ZERO — D11, see the block above
    ...FIRM_SETUP_0218_HUMAN_FNS, // #648 [0218] the four firm setup doors + the one A5 read
    // (admin-floored; agent/wake/runtime gain ZERO — see the block above)
    ...KNOWLEDGE_FIRM_0220_HUMAN_FNS, // #654 [0220] the firm register + the applicability read
    // (viewer floor, human lane only; runtime/agent/wake gain ZERO — see the block above)
    ...CLOSE_MODEL_0056_HUMAN_FNS, // 0056 [Wave E lane β] the close model (see the block above)
    ...REGISTRY_0057_HUMAN_FNS, // 0057 [Wave E lane γ] the period registry + month snapshots
    // (one door + three reads; agent/wake/runtime gain ZERO — see the block above)
    ...METRICS_0058_HUMAN_FNS, // 0058-0061 [Wave E lane δ] the metric algebra + evaluator: four
    // lifecycle verbs, the two frozen-input minters, the evaluator pair, the independent E6
    // re-check, the A30b attempt-receipt writer and the freeze verifier — clara_authenticated
    // ONLY, every floor body-enforced; agent/wake/runtime gain ZERO (see the block above)
    ...RETIRED_0271_HUMAN_FNS, // #1003 [0271] the RETIREMENT WINDOW's own arm —
    // create_account_set_v1, held here only while a frontier below 0271 can still carry the live,
    // granted body. See the block where the roster is declared for why a removal needs an arm and
    // an addition does not, and for when this line is deleted.
    ...CARD1_SEAM_HUMAN_FNS, // [Wave-F Track A, F-A5b card 1] clara.evaluate_metric_v2, on
    // evaluate_metric_v1's own terms — clara_authenticated ONLY; agent/wake/runtime gain ZERO
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
    ...F_A7_GAMMA_HUMAN_FNS, // [Wave-F Track A, F-A7 gamma] the firm-narrow typed-egress
    // family's four owner verbs (owner floor body-enforced; see the block above)
    ...F_A7_PI_HUMAN_FNS, // F-A7 pi: the firm-question door + the identifier-promotion card,
    // clara_authenticated ONLY (bookkeeper+ floor body-enforced) — see the block above
    ...F_A9_PR1A_HUMAN_FNS, // [Wave-F Track A, F-A9 PR-1A] the monthly usage rollup — see the block above
    ...F_A5_PR3_HUMAN_FNS, // [Wave-F Track A, F-A5 PR-3] the signed-original archive doors —
    // clara_authenticated ONLY (bookkeeper+ floor body-enforced) — see the block above
    ...F_A5B_PR1_HUMAN_FNS, // [Wave-F Track A, F-A5b PR-1] register/supersede_export_recipient
    // (admin+) + list_sandbox_exports (bookkeeper+) — clara_authenticated ONLY, every floor
    // body-enforced; agent + both wake roles gain ZERO (covered_clients IS the coverage wall)
    ...FS7_E2_DOWNLOAD_HUMAN_FNS, // [FS-7 echelon 2, 裁-96②] list_downloadable_artifacts — the
    // OFFER door: bookkeeper floor, and it returns NO storage_key, so the browser learns THAT it
    // may download and never WHERE the object lives (see the block above)
    // F-A3/PR-1b [bank-agency agent limb] the one human door: set_bank_agency_hold, a
    // bookkeeper-floor idempotent upsert on the client's own hold row (body-enforced floor;
    // agent + both wake roles gain ZERO — the hold is a human brake on the agent lane, never
    // something the agent lane can flip on itself).
    ...BANK_AGENCY_F_A3_PR1B_COHORT,
    // Gate G1: set_wake_source_enabled, the registry's own owner-floor writer (body-enforced;
    // agent + both wake roles gain ZERO — this is an estate-wide engineering switch, never
    // something the agent lane can flip on itself).
    ...G1_WAKE_ENGINE_COHORT,
    // F-A3/PR-3 [retirement + parity + doors] confirm_bank_identifier_promotion — see the block
    // above (OQ-8's deferred confirm half; agent + both wake roles gain ZERO).
    ...BANK_AGENCY_F_A3_PR3_COHORT,
    // F-A4/PR-1c [the close-domain agent limb] the FOUR human doors: hold/release_close_prep
    // (the brake on the clocked lane), list_agent_act_receipts (TA-P4 (4)'s read surface) and
    // settle_close_proposal (the review card's terminal door). clara_authenticated ONLY — see the
    // block above.
    ...F_A4_PR1C_HUMAN_FNS,
    // F-A4 PR-2a: record_document_service_period, the ONE human door that anchors a prepayment
    // term to a document. clara_authenticated ONLY, bookkeeper floor body-enforced -- and
    // HUMAN-ONLY BY LAW: there is no wake wrapper for it, because a period read off a document by
    // a model is a model-generated value (hard constraint 2, design §13 item 3).
    ...F_A4_PR2A_HUMAN_FNS,
    // P4 tranche 1 [invite/RBAC first] the four human doors — see the block above.
    ...P4T1_HUMAN_FNS,
    // P4 tranche 2 [registration + operator approval, 裁-11] the three human doors — see the
    // block above.
    ...P4T2_HUMAN_FNS,
    // FS-4 C-2: the operator firm's Stripe-problem reconciliation queue; owner+operator wall
    // body-enforced. The webhook ingest/sweep verbs live on their dedicated role below.
    ...CHECKOUT_GATE_C2_HUMAN_FNS,
    // FS-4 C-6: the two apps/web read doors — the current plan's Checkout-Session collection
    // mode, and the applicant's OWN checkout progress (self-scoped on jwt_sub). See the block
    // above for why each is a door rather than a table grant.
    ...CHECKOUT_GATE_C6_HUMAN_FNS,
    // 裁-190: the five web read/write doors over walled relations — see the block above for why
    // each is a door rather than a table grant, and why none has a wake or agent sibling.
    ...WEB_READS_DOORS_HUMAN_FNS,
    // FS-4 C-3: DPA, checkout and folded paid-registration claim doors. Every identity and
    // ownership floor is body-enforced; the pre-session OTP pair lives on its isolated role.
    ...CHECKOUT_GATE_C3_HUMAN_FNS,
    // #621 (0185): the legal content/acceptance doors — see the block above.
    ...LEGAL_ACCEPTANCE_0185_HUMAN_FNS,
    // #628 (0186): the converged checkout's four doors — the applicant's cancel, the operator
    // owner's admission capacity, its read, and the live-intent resume read. See the block above.
    ...CHECKOUT_CONVERGENCE_0186_HUMAN_FNS,
    // #615 (0188): the operator support console's two reads — see the block above.
    // clara_authenticated ONLY; agent, both wake roles, clara_runtime and the Stripe webhook
    // role gain ZERO.
    ...OPERATOR_SUPPORT_0188_HUMAN_FNS,
    // #776
    // #776 (0206): the operator support console's applicant-name read — see the block above.
    // clara_authenticated ONLY, on the same wall as the two reads above it.
    ...OPERATOR_APPLICANT_NAME_0206_HUMAN_FNS,
    // #776 END
    // 裁-18b PR-1 the four human binding doors — see the block above.
    ...BINDING_PROPOSAL_PR1_HUMAN_FNS,
    // 裁-21 PR-a [the firm-level standard chart of accounts, TEMPLATE half] the seven admin
    // writers + the two invoker-rights reads — clara_authenticated ONLY; agent + both wake
    // roles gain ZERO, by the design's own non-goal rather than by omission. See the block above.
    ...COA_TEMPLATE_PR_A_HUMAN_FNS,
    // 裁-21 PR-b [the APPLY half] the two bookkeeper writers, the five INVOKER reads and the four
    // INVOKER helpers those reads call — clara_authenticated ONLY; agent + both wake roles gain
    // ZERO, by Annex E's first non-goal. See the block above.
    ...COA_TEMPLATE_PR_B_HUMAN_FNS,
    // [DB-A, H-53] the codeability predicate — see the block where it is declared for why an
    // underscore helper is granted at all. Both app lanes hold it because both reach the
    // SECURITY INVOKER reader that calls it.
    ...DBA_CODEABILITY_SHARED_FNS,
    // #626 D1 the personal-preferences pair — see the block above. clara_authenticated ONLY;
    // agent + both wake roles gain ZERO.
    ...USER_PREFERENCES_0179_HUMAN_FNS,
    // #629 [0180] the shared work question's three human doors — see the block above.
    // clara_authenticated ONLY; agent, both wake roles and clara_runtime gain ZERO.
    ...WORK_QUESTIONS_0180_HUMAN_FNS,
    ...ACTIVITY_FEED_0181_HUMAN_FNS,
    // #634 0182 the journal-evidence pair — see the block above. clara_authenticated ONLY;
    // clara_runtime, the agent role and both wake roles gain ZERO.
    ...JOURNAL_EVIDENCE_0182_HUMAN_FNS,
    // #728 0183 the sweep-attribution helper + the spoken-for-documents read — see the block
    // above. clara_authenticated ONLY; clara_runtime, the agent role and both wake roles gain
    // ZERO on either name.
    ...WALK_FINDINGS_0183_HUMAN_FNS,
    // #641 0189 the Work list's two doors + its one SECURITY DEFINER helper — see the block
    // above. clara_authenticated ONLY; clara_runtime, the agent role and both wake roles gain
    // ZERO on any of the three names.
    ...WORK_LIST_0189_HUMAN_FNS,
    // #624 0191 the document capability registry's four readers — see the block above. BOTH
    // application read lanes hold these; the agent half is listed on the agent row below.
    ...DOCUMENT_CAPABILITY_0191_SHARED_FNS,
    // #643 0194 the periodic-adjustment history read — see the block above. clara_authenticated
    // ONLY, viewer-floored in its own body; clara_runtime, the agent role and both wake roles
    // gain ZERO.
    ...PERIODIC_ADJUSTMENTS_0194_HUMAN_FNS,
    // #638 0221 the three staff-expense-claim reads — see the block above. clara_authenticated
    // ONLY, viewer-floored in their own bodies; clara_runtime, the agent role and both wake roles
    // gain ZERO.
    ...STAFF_EXPENSE_CLAIMS_0221_HUMAN_FNS,
    // #655 [0225] the trade-invoice read — see the block above. Viewer-floored in its own body;
    // clara_runtime holds it too (it echoes what the run posted), the agent role and both wake
    // roles gain ZERO.
    ...TRADE_INVOICES_0225_HUMAN_FNS,
    // #1007 [0275] the trade-invoice duplicate probe and the read of what a warned person
    // acknowledged — see the block above. clara_authenticated ONLY, floored in their own bodies
    // (bookkeeper for the probe, viewer for the read); every machine lane gains ZERO.
    ...TRADE_INVOICE_DUPLICATE_0275_HUMAN_FNS,
    // #640 [0193] the eleven accounting-plan doors — see the block above. clara_authenticated
    // ONLY; clara_runtime holds only the scan, and the agent role and both wake roles gain ZERO.
    ...ACCOUNTING_PLANS_0193_HUMAN_FNS,
    // #652 [0222] the accrual configuration door and its two reads — see the block above.
    // clara_authenticated ONLY; clara_runtime holds only the OBO twin, and the agent role and
    // both wake roles gain ZERO.
    ...ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS,
    // #653 [0223] the four prepayment-amortisation doors — see the block above. clara_authenticated
    // ONLY; the agent role and both wake roles gain ZERO, and there is no new runtime verb at all.
    ...PREPAYMENT_0223_HUMAN_FNS,
    ...WORK_EGRESS_0195_HUMAN_FNS, // 0195 [#631] the redacted execution-trace read (bookkeeper floor)
    // #812
    // 0211 [#812] the accounting_work re-activation door — owner floor in its own body,
    // clara_authenticated ONLY; clara_runtime, the agent role and both wake roles gain ZERO.
    ...EGRESS_RECOVERY_0211_HUMAN_FNS,
    // #812
    // #650 0214 the client home's Work attention band — see the block above. clara_authenticated
    // ONLY, bookkeeper-floored in its own body; clara_runtime, the agent role and both wake roles
    // gain ZERO.
    ...CLIENT_WORK_PACK_0214_HUMAN_FNS,
    // #659 [0231] Firm Home's portfolio table (bookkeeper-floored, SECURITY INVOKER) and the
    // compliance-watch disposition receipt (bookkeeper-floored, SECURITY DEFINER over two
    // relations no application role can read) — see the block above. clara_authenticated ONLY;
    // clara_runtime, the agent role and both wake roles gain ZERO.
    ...FIRM_PORTFOLIO_PACK_0231_HUMAN_FNS,
    // #649 [0219] the identity-candidates read (admin floor) + the onboarding-facts settle door
    // (bookkeeper floor) — see the block above. clara_authenticated ONLY; clara_runtime, the
    // agent role and both wake roles gain ZERO.
    ...CLIENT_ONBOARDING_FACTS_0219_HUMAN_FNS,
    // #625 [0224] the invited person's pre-password preview — see the block above.
    // clara_authenticated ONLY; runtime, both agent read roles and all four wake lanes gain ZERO.
    ...PREVIEW_INVITE_0224_HUMAN_FNS,
    ...BANK_MATCH_EVIDENCE_0226_HUMAN_FNS, // 0226 [#657] the bank line matching-context read
    // #651 [0227] the depreciation run preview — see the block above. clara_authenticated ONLY;
    // clara_runtime, both agent read roles and all four wake lanes gain ZERO, and the ungranted
    // core it wraps (clara._fa_compute_charges) stays in FA_0041_UNGRANTED_FNS with no role at all.
    ...FA_DEPRECIATION_0227_HUMAN_FNS,
    // #636 [0229] the durable batch board — clara_authenticated ONLY; clara_runtime reaches it
    // nowhere (its worklist is clara.sweep_intake_batch_cancellations), and both agent read roles
    // and all four wake lanes gain ZERO.
    ...INTAKE_BATCHES_0229_HUMAN_FNS,
    // #658 [0230] the drift read (viewer floor) and DECISIONS.md:83's seventh door — the ONLY
    // human path into the FORCE-RLS read-set relation. clara_authenticated ONLY; clara_runtime,
    // both agent read roles and all four wake lanes gain ZERO.
    ...KNOWLEDGE_RETRIEVAL_0230_HUMAN_FNS,
    // #660 [0232] the client home's money band — see the block above. All three doors are
    // clara_authenticated ONLY (viewer floor on both reads, admin floor on the publish door);
    // clara_runtime, clara_agent_ro and every clara_wake_* role gain ZERO on all three. The
    // fourth name is the book-day delegate the two reads call (DECISIONS 6.4 row 1), on the same
    // clara_authenticated-only grant.
    ...CLIENT_FINANCIAL_PACK_0232_HUMAN_FNS,
    // #635 [0233] the firm's legal standing (viewer floor), commercial state and model-usage
    // reads (admin floor) — see the block above. clara_authenticated ONLY; runtime, both agent
    // read roles and all four wake lanes gain ZERO. The recut `get_llm_usage_summary` is
    // already on this set through F_A9_PR1A_HUMAN_FNS and its grant did not move.
    ...FIRM_COMMERCIAL_0233_HUMAN_FNS,
    // #1008 [0234] the platform's legal enforcement mode — the operator-firm owner's write door
    // and its matching read, see the block above. clara_authenticated ONLY; clara_runtime, both
    // agent read roles and all four wake lanes gain ZERO, and the ungranted predicate
    // clara._legal_enforcement_mode holds no role at all.
    ...LEGAL_ENFORCEMENT_0234_HUMAN_FNS,
    // #935 [0259] the education-tip dismissal door — see the block above. clara_authenticated
    // ONLY; clara_runtime, both agent read roles and all four wake lanes gain ZERO.
    ...FIRM_SETUP_TIP_0259_HUMAN_FNS,
    // #960 [0270] the firm's own four document-processing caps — the firm-admin write door, see
    // the block above. clara_authenticated ONLY; clara_runtime, both agent read roles and all
    // four wake lanes gain ZERO, and the ungranted ceiling clara._firm_document_limit_ceiling
    // holds no role at all.
    ...FIRM_DOCUMENT_LIMITS_0270_HUMAN_FNS,
    // #1002 [0276] the second-pass cash-account-set membership editor's own read — see the block
    // above. clara_authenticated ONLY, viewer floor; clara_runtime, both agent read roles and
    // all four wake lanes gain ZERO.
    ...CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_HUMAN_FNS,
    // #932 [0277] the fixed-asset default depreciation policy's set/retire doors — bookkeeper+,
    // see the block above. clara_authenticated ONLY; clara_runtime, both agent read roles and
    // all four wake lanes gain ZERO.
    ...FA_DEFAULT_DEPRECIATION_POLICY_0277_HUMAN_FNS,
    // #975 [0279] the closed-year arrears resolution door — bookkeeper+, see the block above.
    // clara_authenticated ONLY; clara_runtime, both agent read roles and all four wake lanes gain
    // ZERO, because materiality is a professional judgement under IAS 8 and no machine lane makes
    // it. The ungranted internal clara._fa_closed_arrears holds no role at all.
    ...FA_CLOSED_YEAR_ARREARS_0279_HUMAN_FNS,
    // #936 [0284] the dedicated accrual-correction door — see the block above. clara_authenticated
    // ONLY; clara_runtime, both agent read roles and all four wake lanes gain ZERO, and the door
    // nests clara.revise_accounting_plan (0193) UNCHANGED rather than recutting it.
    ...ACCRUAL_CORRECTION_0284_HUMAN_FNS,
    // #899 [0287] the client birth verb — see the block above. clara_authenticated ONLY;
    // clara_runtime, both agent read roles and all four wake lanes gain ZERO, and the ungranted
    // shared core clara._client_birth_core holds no role at all.
    ...CLIENT_BIRTH_WALL_0287_HUMAN_FNS,
    // #939 [0305] the stated-prepayment-term door — see the block above. clara_authenticated
    // ONLY, bookkeeper-floored in its own body; clara_runtime, both agent read roles and all four
    // wake lanes gain ZERO, and no wake wrapper for it exists anywhere in the catalog.
    ...PREPAYMENT_STATED_TERM_0305_HUMAN_FNS,
    // #940 [0306] the two prepayment-account roster doors — see the block above. clara_authenticated
    // ONLY, bookkeeper-floored in their own bodies; clara_runtime, both agent read roles and all
    // four wake lanes gain ZERO, and no wake wrapper for either exists anywhere in the catalog.
    ...PREPAYMENT_ACCOUNT_ROSTER_0306_HUMAN_FNS,
    // #941 [0308] the deferred-revenue recognition write and its three reads -- see the block
    // above. clara_authenticated ONLY: the write is bookkeeper-floored in its own body, the three
    // reads are viewer-floored with a firm predicate inside each. clara_runtime reaches the OBO
    // TWIN instead (declared in the runtime roster below), never these; both agent read roles and
    // all four wake lanes gain ZERO, and no wake wrapper for any of them exists in the catalog.
    ...DEFERRED_REVENUE_0308_HUMAN_FNS,
    // #939 AC4 / #941 AC3 [0317] the two term-correction doors -- see the block above.
    // clara_authenticated ONLY, bookkeeper-floored in their own bodies; clara_runtime, both agent
    // read roles and all four wake lanes gain ZERO, and neither an OBO twin nor a wake wrapper
    // exists for either of them anywhere in the catalog.
    ...SCHEDULE_TERM_CORRECTION_0317_HUMAN_FNS,
  ]),
  // [S6 §9/C-11] agent lane loses the bare get_journal_entry(uuid) oracle; keeps the other
  // reads and gains the client-pinned S6 reads + get_journal_entry_for.
  [ROLES.agentRo]: new Set([...READS.filter((r) => r !== "get_journal_entry"), ...S6_AGENT_READS, ...WAVE_A_AGENT_READS,
    // [DB-A, H-53] the agent lane reads clara.list_uncoded_filings (0011:4080's own grant, and
    // 0011:4271's ACL census pins it), and that reader is SECURITY INVOKER — so the agent role
    // must hold the predicate it calls, or the agent's coding-lane read 42501s.
    ...DBA_CODEABILITY_SHARED_FNS,
    // #624 0191: the capability registry and the four states exist precisely so that neither
    // lane infers from a filename what Clara can do with a file. An agent that could not read
    // the registry would be the lane most likely to guess, so all four readers are shared.
    ...DOCUMENT_CAPABILITY_0191_SHARED_FNS]),
  [ROLES.wakeInteractive]: new Set(["wake_draft_entry", "wake_record_client_resolution", "wake_record_notification", ...WAVE_A_WAKE_INTERACTIVE_FNS, ...BINDING_PROPOSAL_PR1_WAKE_FNS, ...AUTHORING_0077_WAKE_FNS, ...POSTING_F_A2_WAKE_FNS, ...F_A5_PR2_WAKE_FNS, ...F_A5B_PR1_WAKE_FNS, ...CARD1_SEAM_WAKE_FNS,
    // [Wave-F Track A, F-A5b card 1] wake_compose_metric_preview_v2 -- 'interactive' ONLY,
    // permanently (CD-16), beside its untouched v1 twin in AUTHORING_0077_WAKE_FNS.
    // [Wave-F Track A, F-A7 beta, 0126] wake_file_document ONLY -- annexes-1 "clara_wake_filing +
    // clara_wake_interactive; one allowlist row per kind" (chat parity). The other four filing
    // wrappers (wake_open_firm_question, wake_propose_identifier_promotion, wake_reattribute_document,
    // wake_propose_filing_correction) are clara_wake_filing ONLY -- deliberately absent here.
    "wake_file_document",
    // [Wave-F Track A, F-A3 PR-3, chatTurn_v14, OQ-6, owner ruling 2026-08-25] the SAME
    // "clara_wake_bank + clara_wake_interactive; one allowlist row per kind" chat-parity shape
    // the F-A7 beta precedent above already established -- ALL THIRTEEN bank wake_* wrappers,
    // never a subset, because OQ-6's own ruling admits chat to the full bank verb surface (four
    // of which post to the books), not a read-only slice. The grant is
    // 0130_chatturn_v14_bank_interactive_grants.sql, extend-only, reviewed as its own
    // deliberate act -- see that file's header for the reachability argument and the grant/role
    // choice this cell's own expected=true flip records.
    "wake_get_bank_pack", "wake_add_bank_account", "wake_upsert_account", "wake_match_bank_line",
    "wake_settle_from_bank_line", "wake_unmatch_bank_match", "wake_complete_bank_reconciliation",
    "wake_void_bank_reconciliation", "wake_resolve_bank_line_exception", "wake_propose_bank_line_exception",
    "wake_void_bank_statement", "wake_propose_bank_identifier_promotion", "wake_resolve_and_book_bank_line",
    // [Wave-F Track A, F-A4 PR-1c] the TWELVE close wrappers -- clara_wake_interactive is the
    // design's own grant column (Annex E.1), and the wake_fn_allowlist's close_prep rows are the
    // KIND gate on top of it: an `interactive` chat credential holding this EXECUTE still fails
    // assert_wake_allowed('interactive','wake_begin_close') because no such row exists.
    ...F_A4_PR1C_WAKE_FNS,
    // F-A4 PR-2a's thirteenth wrapper -- the ONE new privilege in that whole train (NON-GOAL 3:
    // no floor moves anywhere). DRAFT-ONLY by construction: it reaches only the propose core, and
    // status='live' is written by clara.sign_adjustment_template alone, which holds no wake grant.
    ...F_A4_PR2A_WAKE_FNS,
    // [#623, 0178] the accounting-work commit door. The write pool SET ROLEs to this group role
    // for every interactive kind, and the `interactive_client` allowlist row is the KIND gate on
    // top of it: a plain `interactive` credential holding this EXECUTE is still refused by the
    // wrapper's own typed wrong_wake_kind arm and by assert_wake_allowed behind it.
    ...WORK_JOURNAL_0178_WAKE_FNS]),
  [ROLES.wakeProactive]: new Set(["wake_record_notification"]),
  // F-A6 PR-1 — BOTH new roles are KEYS, and that is the whole point of adding them (E.2/C11,
  // GM-6): `grantMatrixFailures` iterates Object.keys(ALLOWED), so a role that is not a key is
  // never probed by the exact-EXECUTE census AT ALL.
  //
  // CORRECTED (narrow re-review round): this used to be five genuinely-granted functions plus
  // wake_firm/shares_my_firm_wake read as unprobed RLS policy helpers, "so this roster reads as
  // the SEVEN of Annex A.2 rather than as five names and a footnote". MF-1's own fix retired
  // both helpers from every F-A6 policy and from the grant; the roster now reads as the SEVEN
  // it always meant to assert, but all seven are genuinely granted and genuinely probed --
  // `FREEFORM_F_A6_SHARED_FNS` is an empty set, kept only as the landing spot for a future
  // policy-only helper (see its own definition above).
  "clara_freeform_ro": new Set([...FREEFORM_F_A6_GRANTED_FNS, ...FREEFORM_F_A6_SHARED_FNS]),
  // THE LOGIN SHELL'S SET IS EMPTY, AND THAT IS THE ASSERTION — measured, not assumed. The first
  // cut of this entry mirrored the group's, on the reasoning that has_function_privilege answers
  // through membership; it went RED on all five verbs. `grant … with inherit false` means the
  // BARE login holds nothing at all until it explicitly SET ROLEs, and has_function_privilege
  // reports exactly that. So this key now buys the strongest statement available: across EVERY
  // function in schema clara, the fourth login's ambient EXECUTE surface is ZERO — the S4-AB1
  // property, asserted over the whole catalog instead of over one probe.
  "clara_freeform_login": new Set([]),
  // FS-4 C-2's isolated Stripe lane. The member shell inherits this exact set; naming both
  // roles makes the catalog-wide effective-EXECUTE census cover both sides of that membership.
  "clara_stripe_webhook": new Set(CHECKOUT_GATE_C2_WEBHOOK_FNS),
  "clara_stripe_webhook_login": new Set(CHECKOUT_GATE_C2_WEBHOOK_FNS),
  // FS-4 C-3's isolated pre-session OTP wall. The NOLOGIN member shell inherits the same exact
  // effective set, so both sides of the membership are catalog-censused.
  "clara_auth_wall": new Set(CHECKOUT_GATE_C3_AUTH_WALL_FNS),
  "clara_auth_wall_login": new Set(CHECKOUT_GATE_C3_AUTH_WALL_FNS),
  // #618 — THE SIX ROLES THIS CENSUS NEVER PROBED, and what their absence cost.
  //
  // `grantMatrixFailures` iterates Object.keys(ALLOWED). F-A6 PR-1's own comment above states
  // the consequence exactly: "a role that is not a key is never probed by the exact-EXECUTE
  // census AT ALL". Six clara_* roles existed on the live catalog and were not keys, so the
  // 24 EXECUTE grants they hold were outside this instrument entirely — not expected-false,
  // not expected-true, simply unseen. `preview_wrong_client_correction` reached
  // clara_wake_filing (0126:2081) and `wake_book_staff_advance_application` reached
  // clara_wake_bank (0129) with no cell in this file able to notice either way, and a REVOKE
  // of any of the 24 would have left this census green.
  //
  // Found by the operation-contract census (packages/db/scripts/operation-census.mjs), whose
  // `unattributed` label is precisely "granted on the boundary, claimed by no cohort here";
  // these six keys are what makes that label honestly zero rather than waived away.
  //
  // Each roster below is an EXPLICIT ENUMERATION, the same discipline every cohort above
  // carries — not a catalog read. A grant added to one of these roles is expected-false until
  // someone writes it down here, which is the whole point.
  //
  // [Wave-F Track A, F-A7 beta, 0126 §S8] the FILING wake role. Nine names: the four filing
  // wrappers that are clara_wake_filing ONLY (the block on wake_file_document above names
  // them), wake_file_document itself (shared with clara_wake_interactive for chat parity),
  // 0126's own ACL extension of the human read `preview_wrong_client_correction` to this
  // role, and the three later proposal verbs (0142/0143/0154) that landed on the same lane.
  "clara_wake_filing": new Set([
    "preview_wrong_client_correction", "wake_file_document", "wake_list_binding_candidates",
    "wake_open_firm_question", "wake_propose_client_onboarding", "wake_propose_filing_correction",
    "wake_propose_identifier_promotion", "wake_propose_vendor_identity_binding",
    "wake_reattribute_document",
  ]),
  // [F-A3 PR-1b, 0121 §K/§L + PR-3, 0129] the BANK agent role: 0121's thirteen wake_* bank
  // wrappers plus 0129's wake_book_staff_advance_application, which is granted to
  // clara_wake_bank ALONE. The NOLOGIN member shell inherits the identical effective set
  // (pg_auth_members.inherit_option = true, measured), so naming both roles censuses both
  // sides of that membership — the clara_stripe_webhook/_login precedent above.
  "clara_wake_bank": new Set(BANK_AGENCY_WAKE_BANK_FNS),
  "clara_wake_bank_login": new Set(BANK_AGENCY_WAKE_BANK_FNS),
  // The runtime LOGIN's own direct grant. `clara.record_rule_resolution` is granted to
  // clara_runtime_login and to NOBODY else — not even to clara_runtime — and
  // packages/runtime/lib/matcher.mjs:186-196 reaches it by `reset role` back to the bare
  // login for exactly one statement, then restores `set role clara_runtime` in a finally.
  // The membership is `with inherit false` (measured), so this ONE name is the login's whole
  // ambient EXECUTE surface: this key asserts that, catalog-wide.
  "clara_runtime_login": new Set(["record_rule_resolution"]),
  // THE OTHER TWO LOGIN SHELLS' SETS ARE EMPTY, AND THAT IS THE ASSERTION — the same
  // measured statement clara_freeform_login's empty set makes above. Both are members
  // `with inherit false` of a group that holds a large EXECUTE surface (clara_agent_ro,
  // clara_wake_interactive), and both nonetheless reach ZERO functions in schema clara until
  // they explicitly SET ROLE. Asserted over the whole catalog, not over one probe.
  "clara_agent_read_login": new Set([]),
  "clara_wake_write_login": new Set([]),
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
    // 裁-190: the migration frontier read for /build-info, and the statement lane's institution
    // resolver. clara_runtime ONLY — see the block above; neither table gains a grant.
    ...WEB_READS_DOORS_RUNTIME_FNS,
    // [#623, 0178] the accounting-work admission and run lifecycle — clara_runtime ONLY, the
    // same lane clara.begin_chat_turn sits in (0006:1176).
    ...WORK_JOURNAL_0178_RUNTIME_FNS,
    // [#629, 0180] the shared question's open verb, its expiry sweep and the authority snapshot a
    // resumed run reads — clara_runtime ONLY, the same lane clara.open_interruption sits in.
    ...WORK_QUESTIONS_0180_RUNTIME_FNS,
    // [#630, 0184] the Work-level cancel and the takeover — clara_runtime ONLY, the same lane
    // clara.retry_accounting_work sits in. Both are reached by a human through the runtime's own
    // authenticated route, never by PostgREST.
    ...WORK_CANCEL_0184_RUNTIME_FNS,
    // #721
    // [#721, 0200] the restate door — clara_runtime ONLY, the same lane the cancel door sits in.
    ...WORK_RESTATE_0200_RUNTIME_FNS,
    // #721
    // [#644, 0192] the runtime knowledge lane: a capture attributed to a named, verified human
    // and the context pack. Plus the shared promotion door (also clara_authenticated above).
    ...KNOWLEDGE_0192_RUNTIME_FNS,
    ...KNOWLEDGE_0192_SHARED_FNS,
    // [#643, 0194] the periodic-adjustment admission door — clara_runtime ONLY, the same lane
    // clara.admit_journal_work sits in. Reached by a human through the runtime's own
    // authenticated route, never by PostgREST.
    ...PERIODIC_ADJUSTMENTS_0194_RUNTIME_FNS,
    // [#639, 0216] the particulars overload the run calls OBO the human who asked for the work --
    // clara_runtime ONLY. Declared here so a grant to clara_authenticated (a second human door
    // with no _human_ctx floor) or to either wake role FAILS the matrix.
    ...FA_ACQUISITION_0216_RUNTIME_FNS,
    // [#651, 0227] the depreciation run door the runtime calls OBO a named human -- clara_runtime
    // ONLY, and a NEW NAME rather than a widened grant, because `run_depreciation_manual` (in
    // FA_0041_HUMAN_FNS, expected false for every machine role) must never reach one or the
    // maker-checker ladder would have a bypass. Declared here so any wider grant FAILS the matrix.
    ...FA_DEPRECIATION_0227_RUNTIME_FNS,
    // [#638, 0221] the staff-expense-claim admission door — clara_runtime ONLY, the same lane
    // clara.admit_journal_work sits in, acting OBO a named human.
    ...STAFF_EXPENSE_CLAIMS_0221_RUNTIME_FNS,
    // [#655, 0225] the trade-invoice admission door and its read — the door is clara_runtime ONLY
    // (the same lane clara.admit_journal_work sits in, acting OBO a named human); the read is held
    // by BOTH lanes because the run echoes what it posted.
    ...TRADE_INVOICES_0225_RUNTIME_FNS, ...TRADE_INVOICES_0225_HUMAN_FNS,
    // [#1007, 0275] the actor-explicit probe twin and the acknowledgement writer — clara_runtime
    // ONLY, the same lane clara.admit_trade_invoice_work sits in, acting OBO a named human.
    ...TRADE_INVOICE_DUPLICATE_0275_RUNTIME_FNS,
    // [#915, 0307] the prepayment-schedule OBO twin and the machine-lane read of the RECORDED
    // term — clara_runtime ONLY, the same lane clara.create_accrual_adjustment_for sits in, acting
    // OBO a named human whose membership the door re-checks LIVE. Declared here so any wider grant
    // FAILS the matrix.
    ...PREPAYMENT_SCHEDULE_OBO_0307_RUNTIME_FNS,
    // [#941, 0308] the deferred-revenue OBO twin and its machine-lane read of the RECORDED term --
    // clara_runtime ONLY, the same lane and the same shape as 0307's pair above, acting OBO a named
    // human whose membership the door re-checks LIVE. Declared here so any wider grant FAILS the
    // matrix.
    ...DEFERRED_REVENUE_0308_RUNTIME_FNS,
    // [#636, 0229] the intake-batch write doors and the cancellation sweep — clara_runtime ONLY,
    // the same lane clara.create_document_intake sits in. The sweep is the pool's ONLY way to see
    // a cancelling parent: it holds no SELECT on clara.intake_batches and none on
    // clara.operation_receipts.
    ...INTAKE_BATCHES_0229_RUNTIME_FNS,
    ...WORK_EGRESS_0195_RUNTIME_FNS, // 0195 [#631] the work-egress dispatch wrapper + trace writer/prune
    // [#658, 0230] the bounded core-first retrieval, the two inspection twins, the read-set
    // writer and the drift twin — clara_runtime ONLY. The first three are PACK-SHAPED, so #783
    // binds them: a human grant here is that ruling being re-litigated inside a grant matrix.
    ...KNOWLEDGE_RETRIEVAL_0230_RUNTIME_FNS,
    // [F-A2 PR-2, GM-10] the withdrawal re-admit door — clara_runtime ONLY (the consumer's
    // sole caller); proves the event->entry->attempt->task->filing chain then delegates to
    // 0053's one_click exception. Declared here so any wider grant FAILS the matrix.
    "readmit_autodraft_after_withdrawal",
    // Gate G1: _settle_wake_task — clara_runtime ONLY (the reconciler belt + the engine's own
    // claim path, the settle_chat_turn precedent above). Declared here so any wider grant FAILS
    // the matrix.
    ...G1_WAKE_ENGINE_RUNTIME_COHORT,
    // [Wave-F Track A, F-A4 PR-1c] the clock's two runtime verbs: close_prep_due (the due oracle
    // — clara_runtime and NOBODY else, Annex B.1: the wake roles never ask) and
    // mint_wake_credential_for_task (the F14 sibling minter, mirroring mint_wake_credential's own
    // grant above). clara._wake_task_id() stays UNGRANTED, deliberately — see the block above.
    ...F_A4_PR1C_RUNTIME_FNS,
    ...F_A4_PR2C_RUNTIME_FNS, // F-A4 PR-2c's attended chat-close credential minter.
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
    ...F_A7_GAMMA_RUNTIME_FNS, // [Wave-F Track A, F-A7 gamma] prepare_firm_egress_dispatch,
    // mirroring WAVE_B_0020_RUNTIME_FNS' prepare_egress_dispatch (see the block above)
    ...F_A9_PR1A_RUNTIME_FNS, // [Wave-F Track A, F-A9 PR-1A] the second door — see the block above
    ...F_A5B_PR1_RUNTIME_FNS, // [Wave-F Track A, F-A5b PR-1] the sandbox export worker verbs —
    // payload (stable, lease-scoped read), complete (hash IN, set-once) and fail — the 0081:162-
    // 168 lease shape; clara_runtime holds no table privilege on the two new relations either
    ...CARD1_SEAM_RUNTIME_FNS, // [Wave-F Track A, F-A5b card 1] the sandbox job family's
    // claim/dispatch/reap quartet, mirroring render_jobs' own verbs (0081) retargeted — the half
    // PR-1 registered as a gap and without which no worker ever transitions a claimable row
    ...FS7_E2_DOWNLOAD_RUNTIME_FNS, // [FS-7 echelon 2, 裁-96②] get_artifact_for_human_read — the
    // BYTE door over BOTH artifact families, the get_document_for_human_read idiom: the resolved
    // principal comes IN and the live active membership decides. clara_runtime ONLY, so a
    // storage_key never crosses to a browser (see the block above)
    ...DOC_DOWNLOAD_0190_RUNTIME_FNS, // [#620, 0190] get_document_for_human_read_v2 — the SUCCESSOR
    // source-document byte door, beside v1 and not instead of it (see the block above)
    // [#640, 0193] the leader's every-cycle plan due scan — clara_runtime ONLY, the same lane
    // clara.admit_journal_work sits in. The browser lane holds none of it.
    ...ACCOUNTING_PLANS_0193_RUNTIME_FNS,
    // [#652, 0222] the accrual configuration door ON BEHALF OF a named human — clara_runtime
    // ONLY, the clara.admit_periodic_adjustment_work shape. It takes its actor from an argument
    // because a runtime connection carries no human JWT; the browser lane holds none of it.
    ...ACCRUAL_ADJUSTMENTS_0222_RUNTIME_FNS,
    // [#986, 0286] the opening-source re-read remedy — clara_runtime ONLY, the same lane
    // clara.record_opening_targets_parsed sits in (WAVE_B_RUNTIME_FNS above). See the block
    // where the cohort is declared.
    ...OPENING_SOURCE_REREAD_0286_RUNTIME_FNS,
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

// FS-4 C-2's projected Stripe store. Kept as one gated cohort so pre-C-2 frontier rigs remain
// green while a partially applied C-2 migration is itself a named failure.
export const CHECKOUT_GATE_C2_TABLES = [
  "stripe_events", "stripe_event_problems", "stripe_object_map",
];

// FS-4 C-3's minimal billing declaration, payment evidence and OTP-attempt evidence.
export const CHECKOUT_GATE_C3_TABLES = [
  "billing_plans", "firm_registration_payments", "confirmation_attempts",
];

// The ONLY clara base tables that legitimately carry no RLS (migration bookkeeping + the
// Slice-1 placeholder). Everything else in the schema MUST be RLS-enabled AND forced.
export const RLS_EXEMPT = new Set(["schema_migrations", "slice1_smoke"]);

// #857 [0290, the document_regions field_path CHECK] — NO cohort is owed here, and that is a
// measured disposition rather than an omission, the same one #984's 0239 block above documents.
// 0290 mints exactly one catalog name, `clara._field_path_conforms`, and revokes EXECUTE from
// PUBLIC on it with no further GRANT: clara.document_regions carries exactly ONE role with
// INSERT (clara_fn_owner, measured in 0290's own prestate), and an object's owner may always
// execute a function it owns regardless of ACL, so the sibling needs no grant for the CHECK it
// backs to fire on every real writer. An internal granted to NOBODY is expected-false for every
// role in the live sweep rather than listed here — the same disposition 0234's
// `_legal_enforcement_mode`, 0239's `_admit_opening_work`, 0186's `_admission_capacity_state` and
// 0270's `_firm_document_limit_ceiling` carry. 0290 mints no relation and recuts no existing
// function body (clara._assert_field_path is called, never touched), so there is neither a
// TABLE cohort nor a body-drift concern to declare either.
// #857 END

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

// #866: the three schemas a bootstrapped Workflow/WDK "World" creates
// (packages/runtime's `bootstrap` bin — README §engine-bootstrap). PostgreSQL
// grants EXECUTE on a newly-created function to PUBLIC by default, and
// `graphile-worker`'s own bootstrap never revokes it, so once a World exists on a
// rig database EVERY role (clara_agent_ro and the two wake roles included) can
// call `graphile_worker.add_job` etc. That is upstream default-grant behaviour,
// not a clara RBAC leak — T10b has no business asserting either way about it.
export const WORLD_SCHEMAS = ["workflow", "workflow_drizzle", "graphile_worker"];

/** True once any World schema exists on this database (see WORLD_SCHEMAS). T10b
 * uses this to tell "contaminated by a local World bootstrap" apart from a real
 * clara RBAC regression — see the T10b test body in rig-isolation.test.mjs. */
export async function worldSchemaPresent() {
  const r = await rootQuery(
    `select 1 from pg_namespace where nspname = any($1::text[]) limit 1`,
    [WORLD_SCHEMAS],
  );
  return r.rows.length > 0;
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
  // A role key whose role does not exist on THIS frontier is skipped, not probed:
  // has_function_privilege RAISES on an unknown role, which would turn "F-A6 has not applied
  // here" into a torrent of unrelated failures. The skip is NAMED below rather than silent —
  // a key that never resolves anywhere is a dead roster entry and must be visible as one.
  const allKeys = Object.keys(ALLOWED);
  const live = await rootQuery(
    "select r as rolname, to_regrole(r) is not null as ok from unnest($1::text[]) r", [allKeys],
  );
  const roles = live.rows.filter((r) => r.ok).map((r) => r.rolname);
  const absent = live.rows.filter((r) => !r.ok).map((r) => r.rolname);
  const failures = [];
  // #618 adds clara_wake_filing (0126), clara_wake_bank + its login shell (0121) and the three
  // dedicated login shells to the tolerated-absent set for the SAME reason the three prefixes
  // above are there: each is created by a migration well above the oldest frontier this file
  // still runs against, and a pre-that-migration database must SKIP the role, not drown the
  // report in "role does not exist" noise that says nothing about grants.
  const ABSENT_TOLERATED = ["clara_freeform", "clara_stripe_webhook", "clara_auth_wall",
    "clara_wake_filing", "clara_wake_bank", "clara_runtime_login", "clara_agent_read_login",
    "clara_wake_write_login"];
  if (absent.length && absent.some((r) => !ABSENT_TOLERATED.some((prefix) => r.startsWith(prefix)))) {
    failures.push(`ALLOWED names role(s) that do not exist on this database: ${absent.join(", ")}`);
  }
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
  failures.push(...cohortFailures("H-17/H-19 kind-scoped alias unique + owner-floored sales-lane wrapper", H17_H19_COHORT, liveNames));
  failures.push(...cohortFailures("0057 wave E period registry + snapshots", REGISTRY_0057_COHORT, liveNames));
  failures.push(...cohortFailures("0058-0061 wave E metric algebra + evaluator", METRICS_0058_COHORT, liveNames));
  failures.push(...cohortFailures("0065-0072 wave E FS reporting layer", REPORTING_0065_COHORT, liveNames));
  failures.push(...cohortFailures("0079-0083 wave E render queue", RENDER_ZETA_COHORT, liveNames));
  failures.push(...cohortFailures("0077-0078 wave E ad-hoc authoring wake surface", AUTHORING_0077_COHORT, liveNames));
  failures.push(...cohortFailures("0090-0095 wave F F-A1 witness-pair lane", WITNESS_F_A1_COHORT, liveNames));
  failures.push(...cohortFailures("F-A1 PR-3 cutover: fail_witness_facts", WITNESS_F_A1_PR3_COHORT, liveNames));
  failures.push(...cohortFailures("F-A3 PR-1a bank/COA core extractions", EXTRACTION_F_A3_PR1A_COHORT, liveNames));
  failures.push(...cohortFailures("#623 0178 accounting-work lane", WORK_JOURNAL_0178_COHORT, liveNames));
  failures.push(...cohortFailures("#629 0180 shared work-question lane", WORK_QUESTIONS_0180_COHORT, liveNames));
  failures.push(...cohortFailures("#634 0182 journal-evidence lane", JOURNAL_EVIDENCE_0182_COHORT, liveNames));
  failures.push(...cohortFailures("#728 0183 sweep attribution + spoken-for documents", WALK_FINDINGS_0183_COHORT, liveNames));
  failures.push(...cohortFailures("#630 0184 work-cancel/takeover lane", WORK_CANCEL_0184_COHORT, liveNames));
  // #721
  failures.push(...cohortFailures("#721 0200 work-restate/supersede lane", WORK_RESTATE_0200_COHORT, liveNames));
  // #721
  failures.push(...cohortFailures("#641 0189 work-list read lane", WORK_LIST_0189_COHORT, liveNames));
  failures.push(...cohortFailures("#624 0191 document capability registry", DOCUMENT_CAPABILITY_0191_COHORT, liveNames));
  failures.push(...cohortFailures("#644 0192 governed knowledge lane", KNOWLEDGE_0192_COHORT, liveNames));
  failures.push(...cohortFailures("#648 0218 firm setup lane", FIRM_SETUP_0218_COHORT, liveNames));
  failures.push(...cohortFailures("#654 0220 firm knowledge defaults", KNOWLEDGE_FIRM_0220_COHORT, liveNames));
  failures.push(...cohortFailures("#643 0194 periodic-adjustment lane", PERIODIC_ADJUSTMENTS_0194_COHORT, liveNames));
  failures.push(...cohortFailures("#638 0221 staff-expense-claim lane", STAFF_EXPENSE_CLAIMS_0221_COHORT, liveNames));
  failures.push(...cohortFailures("#640 0193 accounting-plan lane", ACCOUNTING_PLANS_0193_COHORT, liveNames));
  failures.push(...cohortFailures("#639 0216 fixed-asset acquisition lane", FA_ACQUISITION_0216_COHORT, liveNames));
  // #651 [0227] — bimodal like 0216's: wholly present once 0227 applies, wholly absent before it,
  // because the `db-slice-frontiers` matrix runs this package against earlier frontiers.
  const depHistoryLive = FA_DEPRECIATION_0227_COHORT.filter((n) => liveNames.has(n));
  if (depHistoryLive.length !== 0) {
    failures.push(...cohortFailures("#651 0227 depreciation-history lane", FA_DEPRECIATION_0227_COHORT, liveNames));
  }
  // #973 [0248] — bimodal like 0227's: wholly present once 0248 applies, wholly absent before it.
  const legFoldLive = FA_DEPRECIATION_LEG_FOLD_0248_COHORT.filter((n) => liveNames.has(n));
  if (legFoldLive.length !== 0) {
    failures.push(...cohortFailures("#973 0248 depreciation leg-pairing fold", FA_DEPRECIATION_LEG_FOLD_0248_COHORT, liveNames));
  }
  // #976 [0249] — bimodal like 0248's: wholly present once 0249 applies, wholly absent before it.
  const particularsFoldLive = FA_PARTICULARS_COMPLETION_FOLD_0249_COHORT.filter((n) => liveNames.has(n));
  if (particularsFoldLive.length !== 0) {
    failures.push(...cohortFailures("#976 0249 fixed-asset particulars completion wall fold", FA_PARTICULARS_COMPLETION_FOLD_0249_COHORT, liveNames));
  }
  // #977 [0250] — bimodal like 0249's: wholly present once 0250 applies, wholly absent before it.
  const authorityRefRuleLive = AUTHORITY_REF_HUMAN_INSTRUCTION_0250_COHORT.filter((n) => liveNames.has(n));
  if (authorityRefRuleLive.length !== 0) {
    failures.push(...cohortFailures("#977 0250 authority-ref human-instruction rule", AUTHORITY_REF_HUMAN_INSTRUCTION_0250_COHORT, liveNames));
  }
  // #652 [0222] — bimodal like F-A6's: wholly present once 0222 applies, wholly absent before it,
  // because the `db-slice-frontiers` matrix runs this package against earlier frontiers.
  const accrualLive = ACCRUAL_ADJUSTMENTS_0222_COHORT.filter((n) => liveNames.has(n));
  if (accrualLive.length !== 0) {
    failures.push(...cohortFailures("#652 0222 accrual-adjustment lane", ACCRUAL_ADJUSTMENTS_0222_COHORT, liveNames));
  }
  failures.push(...cohortFailures("#653 0223 prepayment-amortisation lane", PREPAYMENT_0223_COHORT, liveNames));
  failures.push(...cohortFailures("#631 0195 work-egress + execution-trace lane", WORK_EGRESS_0195_COHORT, liveNames));
  // #635 [0233] — ARMED ON THE FIRST NEW NAME, not on emptiness: the cohort's fourth member
  // (`get_llm_usage_summary`, which 0233 recuts) has existed since 0110, so a pre-0233 frontier
  // would otherwise report this roster PARTIAL forever. See the block beside the constant.
  if (liveNames.has("get_firm_legal_standing")) {
    failures.push(...cohortFailures("#635 0233 firm legal/commercial/usage reads", FIRM_COMMERCIAL_0233_COHORT, liveNames));
  }
  // #1008 [0234] — bimodal: wholly present once 0234 applies, wholly absent before it. A PARTIAL
  // cohort is still a failure, which is the half that matters.
  const enforcementLive = LEGAL_ENFORCEMENT_0234_COHORT.filter((n) => liveNames.has(n));
  if (enforcementLive.length !== 0) {
    failures.push(...cohortFailures("#1008 0234 platform legal enforcement mode",
      LEGAL_ENFORCEMENT_0234_COHORT, liveNames));
  }
  // #912 [0243] — bimodal, same reason as 0234's above.
  const actorRoleLive = AUDIT_ACTOR_ROLE_0243_COHORT.filter((n) => liveNames.has(n));
  if (actorRoleLive.length !== 0) {
    failures.push(...cohortFailures("#912 0243 audit actor-role stamp",
      AUDIT_ACTOR_ROLE_0243_COHORT, liveNames));
  }
  // #846 [0244] — bimodal for the same reason: wholly present once 0244 applies, wholly absent
  // before it, because the db-slice-frontiers matrix runs this package against earlier frontiers.
  const highWaterLive = DOCUMENT_CAPABILITY_HIGH_WATER_0244_COHORT.filter((n) => liveNames.has(n));
  if (highWaterLive.length !== 0) {
    failures.push(...cohortFailures("#846 0244 capability registry version high-water mark",
      DOCUMENT_CAPABILITY_HIGH_WATER_0244_COHORT, liveNames));
  }
  // #960 [0270] — bimodal, same reasoning as 0234's above.
  const capWriterLive = FIRM_DOCUMENT_LIMITS_0270_COHORT.filter((n) => liveNames.has(n));
  if (capWriterLive.length !== 0) {
    failures.push(...cohortFailures("#960 0270 firm document-limits writer",
      FIRM_DOCUMENT_LIMITS_0270_COHORT, liveNames));
  }
  // #1002 [0276] — bimodal, same reasoning as 0270's above.
  const cashMembershipReadLive = CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_COHORT.filter((n) => liveNames.has(n));
  if (cashMembershipReadLive.length !== 0) {
    failures.push(...cohortFailures("#1002 0276 cash-account-set membership editor read",
      CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_COHORT, liveNames));
  }
  // #932 [0277] — bimodal, same reasoning as 0270's above.
  const depreciationPolicyLive = FA_DEFAULT_DEPRECIATION_POLICY_0277_COHORT.filter((n) => liveNames.has(n));
  if (depreciationPolicyLive.length !== 0) {
    failures.push(...cohortFailures("#932 0277 fixed-asset default depreciation policy",
      FA_DEFAULT_DEPRECIATION_POLICY_0277_COHORT, liveNames));
  }
  // #975 [0279] — bimodal, exactly as 0277's above.
  const closedArrearsLive = FA_CLOSED_YEAR_ARREARS_0279_COHORT.filter((n) => liveNames.has(n));
  if (closedArrearsLive.length !== 0) {
    failures.push(...cohortFailures("#975 0279 closed-year arrears resolution",
      FA_CLOSED_YEAR_ARREARS_0279_COHORT, liveNames));
  }
  // #936 [0284] — bimodal, same reasoning as 0270's above: wholly present once 0284 applies,
  // wholly absent before it.
  const accrualCorrectionLive = ACCRUAL_CORRECTION_0284_COHORT.filter((n) => liveNames.has(n));
  if (accrualCorrectionLive.length !== 0) {
    failures.push(...cohortFailures("#936 0284 dedicated accrual-correction door",
      ACCRUAL_CORRECTION_0284_COHORT, liveNames));
  }
  // #986 [0286] — bimodal, same reasoning as 0284's above: wholly present once 0286 applies,
  // wholly absent before it.
  const openingRereadLive = OPENING_SOURCE_REREAD_0286_COHORT.filter((n) => liveNames.has(n));
  if (openingRereadLive.length !== 0) {
    failures.push(...cohortFailures("#986 0286 opening-source re-read remedy",
      OPENING_SOURCE_REREAD_0286_COHORT, liveNames));
  }
  // #899 [0287] — bimodal, same reasoning as 0234's/0270's above.
  const clientBirthWallLive = CLIENT_BIRTH_WALL_0287_COHORT.filter((n) => liveNames.has(n));
  if (clientBirthWallLive.length !== 0) {
    failures.push(...cohortFailures("#899 0287 client birth wall",
      CLIENT_BIRTH_WALL_0287_COHORT, liveNames));
  }
  // #939 [0305] — bimodal, same reasoning as 0284's above: wholly present once 0305 applies,
  // wholly absent before it.
  const statedTermLive = PREPAYMENT_STATED_TERM_0305_COHORT.filter((n) => liveNames.has(n));
  if (statedTermLive.length !== 0) {
    failures.push(...cohortFailures("#939 0305 person-stated prepayment term",
      PREPAYMENT_STATED_TERM_0305_COHORT, liveNames));
  }
  // #940 [0306] — bimodal, same reasoning as 0305's above: wholly present once 0306 applies,
  // wholly absent before it.
  const rosterLive = PREPAYMENT_ACCOUNT_ROSTER_0306_COHORT.filter((n) => liveNames.has(n));
  if (rosterLive.length !== 0) {
    failures.push(...cohortFailures("#940 0306 prepayment-account roster",
      PREPAYMENT_ACCOUNT_ROSTER_0306_COHORT, liveNames));
  }
  // #915 [0307] — bimodal, same reasoning as 0306's above: wholly present once 0307 applies,
  // wholly absent before it.
  const oboLive = PREPAYMENT_SCHEDULE_OBO_0307_COHORT.filter((n) => liveNames.has(n));
  if (oboLive.length !== 0) {
    failures.push(...cohortFailures("#915 0307 prepayment-schedule OBO twin",
      PREPAYMENT_SCHEDULE_OBO_0307_COHORT, liveNames));
  }
  // #941 [0308] -- bimodal, same reasoning as 0307's above: wholly present once 0308 applies,
  // wholly absent before it.
  const deferredLive = DEFERRED_REVENUE_0308_COHORT.filter((n) => liveNames.has(n));
  if (deferredLive.length !== 0) {
    failures.push(...cohortFailures("#941 0308 deferred-revenue recognition lane",
      DEFERRED_REVENUE_0308_COHORT, liveNames));
  }
  // #939 AC4 / #941 AC3 [0317] -- bimodal, same reasoning as 0308's above: wholly present once
  // 0317 applies, wholly absent before it.
  const correctionLive = SCHEDULE_TERM_CORRECTION_0317_COHORT.filter((n) => liveNames.has(n));
  if (correctionLive.length !== 0) {
    failures.push(...cohortFailures("#939 AC4 / #941 AC3 0317 schedule term correction",
      SCHEDULE_TERM_CORRECTION_0317_COHORT, liveNames));
  }
  // #812
  failures.push(...cohortFailures("#812 0211 accounting_work egress recovery door", EGRESS_RECOVERY_0211_COHORT, liveNames));
  // #812
  failures.push(...cohortFailures("#650 0214 client work-pack read lane", CLIENT_WORK_PACK_0214_COHORT, liveNames));
  // #659 [0231] — bimodal like 0222's and 0217's: wholly present once 0231 applies, wholly absent
  // before it, because the `db-slice-frontiers` matrix runs this package against earlier frontiers.
  // A PARTIAL cohort is still a failure, which is the half that matters.
  const portfolioLive = FIRM_PORTFOLIO_PACK_0231_COHORT.filter((n) => liveNames.has(n));
  if (portfolioLive.length !== 0) {
    failures.push(...cohortFailures("#659 0231 firm portfolio + watch disposition lane",
      FIRM_PORTFOLIO_PACK_0231_COHORT, liveNames));
  }
  // #660 [0232] — bimodal like the 0222/0217 lanes': wholly present once 0232 applies, wholly
  // absent before it, because the `db-slice-frontiers` matrix runs this package against earlier
  // frontiers. A PARTIAL cohort is a half-applied lane, which cohortFailures() fails by design.
  const financialPackLive = CLIENT_FINANCIAL_PACK_0232_COHORT.filter((n) => liveNames.has(n));
  if (financialPackLive.length !== 0) {
    failures.push(...cohortFailures("#660 0232 client financial-pack read lane", CLIENT_FINANCIAL_PACK_0232_COHORT, liveNames));
  }
  // #718 [0197] — the coding lane's evidence-link lookback. A PARTIAL cohort here is a reopened
  // race, not a narrower boundary (see the block where the roster is declared).
  failures.push(...cohortFailures("#718 0197 coding-lane evidence-link wall", CODING_LANE_LINK_0197_COHORT, liveNames));
  // #646 [0217] — the document source-revision lane. Bimodal: wholly present once 0217 applies,
  // wholly absent before it, so the roster is only asserted once any of its names exists.
  const sourceRevisionLive = DOCUMENT_SOURCE_REVISION_0217_COHORT.filter((n) => liveNames.has(n));
  if (sourceRevisionLive.length !== 0) {
    failures.push(...cohortFailures("#646 0217 document source-revision lane", DOCUMENT_SOURCE_REVISION_0217_COHORT, liveNames));
  }
  // #885 [0268] — the source-correction supersession closure. Bimodal for 0217's reason: wholly
  // present once 0268 applies, wholly absent before it.
  const sourceCorrectionLive = WORK_SOURCE_CORRECTION_0268_COHORT.filter((n) => liveNames.has(n));
  if (sourceCorrectionLive.length !== 0) {
    failures.push(...cohortFailures("#885 0268 source-correction supersession closure", WORK_SOURCE_CORRECTION_0268_COHORT, liveNames));
  }
  // #885 END
  // #718 END
  // #776
  failures.push(...cohortFailures("#776 0206 operator applicant-name read",
    OPERATOR_APPLICANT_NAME_0206_COHORT, liveNames));
  // #776 END
  failures.push(...cohortFailures("#647 0215 counterparty-identity provenance lane", COUNTERPARTY_IDENTITY_0215_COHORT, liveNames));
  // #649 [0219] — the identity read, the settle door and the ungranted month helper ship as one
  // lane; half of them is a settle door with no way to ask about duplicates first, which is a
  // narrower boundary nobody chose.
  failures.push(...cohortFailures("#649 0219 client-onboarding facts lane", CLIENT_ONBOARDING_FACTS_0219_COHORT, liveNames));
  // #649 END
  failures.push(...cohortFailures("#625 0224 invite preview door", PREVIEW_INVITE_0224_COHORT, liveNames));
  // #655 [0225] — the door, the read and the eight internals ship as one lane; half of them is an
  // admission door whose open item has no birth instrument, which is a narrower boundary nobody
  // chose.
  failures.push(...cohortFailures("#655 0225 trade-invoice lane", TRADE_INVOICES_0225_COHORT, liveNames));
  // #657 [0226] — the granted line read and the ungranted op-key reader ship as one lane; half
  // of them is a wrapper with nothing to publish, or a parser nothing calls.
  failures.push(...cohortFailures("#657 0226 bank match evidence lane", BANK_MATCH_EVIDENCE_0226_COHORT, liveNames));
  // #657 END
  failures.push(...cohortFailures("#636 0229 intake-batch lane", INTAKE_BATCHES_0229_COHORT, liveNames));
  // #658 [0230] — bimodal like #652's: wholly present once 0230 applies, wholly absent before it,
  // because the `db-slice-frontiers` matrix runs this package against earlier frontiers.
  const retrievalLive = KNOWLEDGE_RETRIEVAL_0230_COHORT.filter((n) => liveNames.has(n));
  if (retrievalLive.length !== 0) {
    failures.push(...cohortFailures("#658 0230 knowledge-retrieval lane", KNOWLEDGE_RETRIEVAL_0230_COHORT, liveNames));
  }
  // #658 END
  failures.push(...cohortFailures("wave F F-A1 PR-4 bank-statement witness cutover", STATEMENT_F_A1_PR4_COHORT, liveNames));
  // F-A6's cohort is bimodal: wholly present once PR-1 applies, wholly absent before it. Half a
  // cohort is a half-applied migration and is reported as one.
  const freeformLive = FREEFORM_F_A6_COHORT.filter((n) => liveNames.has(n));
  if (freeformLive.length !== 0) {
    failures.push(...cohortFailures("F-A6 PR-1 audited freeform read", FREEFORM_F_A6_COHORT, liveNames));
  }
  failures.push(...cohortFailures("wave F F-A7 gamma egress train", F_A7_GAMMA_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A7 pi (receipts layer train position 1)", F_A7_PI_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A9 PR-1A LLM usage ledger reshape", F_A9_PR1A_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A5 PR-2 reporting-agency granted surface", F_A5_PR2_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A5 PR-3 signed-original archive doors", F_A5_PR3_COHORT, liveNames));
  failures.push(...cohortFailures("F-A3/PR-1b bank-agency agent limb", BANK_AGENCY_F_A3_PR1B_COHORT, liveNames));
  failures.push(...cohortFailures("Gate G1 wake-execution engine", G1_WAKE_ENGINE_COHORT, liveNames));
  failures.push(...cohortFailures("Gate G1 wake-execution engine (runtime lane)", G1_WAKE_ENGINE_RUNTIME_COHORT, liveNames));
  failures.push(...cohortFailures("F-A3/PR-3 retirement + parity + doors", BANK_AGENCY_F_A3_PR3_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A5b PR-1 sandbox export lane", F_A5B_PR1_COHORT, liveNames));
  failures.push(...cohortFailures("wave F F-A5b card 1 substitution seam", CARD1_SEAM_COHORT, liveNames));
  // F-A4 PR-1c is bimodal exactly as F-A6's is: wholly present once the close agent limb applies,
  // wholly absent before it. Half a cohort is a half-applied migration and is reported as one.
  const closeLimbLive = F_A4_PR1C_COHORT.filter((n) => liveNames.has(n));
  if (closeLimbLive.length !== 0) {
    failures.push(...cohortFailures("F-A4/PR-1c close-domain agent limb", F_A4_PR1C_COHORT, liveNames));
  }
  // PR-2a rides its OWN cohort for the reason Annex B.3 states: a wholly-absent cohort is tolerated
  // (a PR-1c-only estate), a PARTIAL one fails. Folding these names into PR-1c's list would have
  // red every 0138-only database.
  const prepayLive = F_A4_PR2A_COHORT.filter((n) => liveNames.has(n));
  if (prepayLive.length !== 0) {
    failures.push(...cohortFailures("F-A4/PR-2a prepayment limb", F_A4_PR2A_COHORT, liveNames));
  }
  const chatCloseLive = F_A4_PR2C_COHORT.filter((n) => liveNames.has(n));
  if (chatCloseLive.length !== 0) {
    failures.push(...cohortFailures("F-A4/PR-2c close-prep chat lane", F_A4_PR2C_COHORT, liveNames));
  }
  failures.push(...cohortFailures("P4 tranche 1 invite/RBAC first", P4T1_COHORT, liveNames));
  // Native review C7: cohortFailures() above is proname-only (law 3, "spelling is not
  // identity") -- it would still read GREEN if a same-named but DIFFERENT-signature overload
  // silently replaced one of P4T1's seven names (e.g. a future migration adding
  // clara.claim_identity(text) beside the real clara.claim_identity(text,text)). This is the
  // signature-exact companion, scoped to P4T1: every cohort member must resolve at the EXACT
  // signature the migration's own tail census pins, via to_regprocedure -- never a bare-name
  // lookup -- with the SAME wholly-present-or-wholly-absent tolerance as every other cohort here.
  const p4t1Sigs = [
    "clara.claim_identity(text,text)", "clara.invite_member(text,text,text)",
    "clara.accept_invite(text,text,text)", "clara.revoke_invite(uuid,text)",
    "clara._jwt_email()", "clara._claim_identity_core(uuid,text,text)",
    "clara._add_member_core(uuid,uuid,uuid,text)",
  ];
  const p4t1SigCheck = await rootQuery(
    "select sig, to_regprocedure(sig) is not null as ok from unnest($1::text[]) sig", [p4t1Sigs],
  );
  const p4t1SigMissing = p4t1SigCheck.rows.filter((r) => !r.ok).map((r) => r.sig);
  if (p4t1SigMissing.length !== 0 && p4t1SigMissing.length !== p4t1Sigs.length) {
    failures.push(
      "P4 tranche 1 invite/RBAC first: signature-exact check found a PARTIAL cohort -- these "
      + "exact signatures no longer resolve (a same-named, different-signature overload may have "
      + `silently replaced one): ${p4t1SigMissing.join(", ")}`,
    );
  }
  failures.push(...cohortFailures("P4 tranche 2 registration + operator approval", P4T2_COHORT, liveNames));
  failures.push(...cohortFailures("#935 0259 firm setup education tip dismissal", FIRM_SETUP_TIP_0259_COHORT, liveNames));
  // #1007 [0275] — the probe, its matcher and the two normalisation/body internals ship as one
  // lane; half of them is a door with no matcher, or a matcher no entrance can reach.
  failures.push(...cohortFailures("#1007 0275 trade-invoice duplicate probe",
    TRADE_INVOICE_DUPLICATE_0275_COHORT, liveNames));
  failures.push(...cohortFailures("FS-4 C-2 projected Stripe store", CHECKOUT_GATE_C2_COHORT, liveNames));
  failures.push(...cohortFailures("FS-4 C-6 apps/web read doors", CHECKOUT_GATE_C6_COHORT, liveNames));
  failures.push(...cohortFailures("FS-4 C-3 folded checkout door", CHECKOUT_GATE_C3_COHORT, liveNames));
  // #621 — frontier-tolerant like every cohort here: absent entirely on a pre-0185 chain, and a
  // PARTIAL cohort (one of the three retired or renamed without truing this roster) is named.
  failures.push(...cohortFailures("#621 legal acceptance", LEGAL_ACCEPTANCE_0185_COHORT, liveNames));
  // #628 — frontier-tolerant like every cohort here: absent entirely on a pre-0186 chain, and a
  // PARTIAL cohort (one of the four retired or renamed without truing this roster) is named.
  failures.push(...cohortFailures("#628 checkout convergence",
    CHECKOUT_CONVERGENCE_0186_COHORT, liveNames));
  // #615 — frontier-tolerant like every cohort here: absent entirely on a pre-0188 chain, and a
  // PARTIAL cohort (one of the two retired or renamed without truing this roster) is named.
  failures.push(...cohortFailures("#615 operator support console",
    OPERATOR_SUPPORT_0188_COHORT, liveNames));
  // 裁-190 — frontier-tolerant like every cohort above: entirely absent on a chain that has not
  // applied the two UNNUMBERED files (which is every CI chain until merge prep, 裁-108), and a
  // PARTIAL cohort is caught by name.
  failures.push(...cohortFailures("裁-190 web reads and small doors", WEB_READS_DOORS_COHORT, liveNames));
  // 裁-21 PR-a — frontier-tolerant by cohortFailures' own rule: a cohort that is entirely
  // absent (every pre-PR-a chain) returns no failure, while a PARTIAL cohort — one of the
  // thirteen retired or renamed without truing this roster — is caught by name.
  failures.push(...cohortFailures("裁-21 PR-a COA template", COA_TEMPLATE_PR_A_COHORT, liveNames));
  failures.push(...cohortFailures("裁-21 PR-b COA apply", COA_TEMPLATE_PR_B_COHORT, liveNames));
  // The same signature-exact companion as P4T1's above, scoped to P4T2's own four names --
  // review law 3 applied from the start this round, not discovered by a later mutant panel.
  const p4t2Sigs = [
    "clara.request_firm_registration(text,text,text)", "clara.approve_firm_registration(uuid,text)",
    "clara.reject_firm_registration(uuid,text,text)", "clara._create_firm_core(uuid,text)",
  ];
  const p4t2SigCheck = await rootQuery(
    "select sig, to_regprocedure(sig) is not null as ok from unnest($1::text[]) sig", [p4t2Sigs],
  );
  const p4t2SigMissing = p4t2SigCheck.rows.filter((r) => !r.ok).map((r) => r.sig);
  if (p4t2SigMissing.length !== 0 && p4t2SigMissing.length !== p4t2Sigs.length) {
    failures.push(
      "P4 tranche 2 registration + operator approval: signature-exact check found a PARTIAL "
      + "cohort -- these exact signatures no longer resolve (a same-named, different-signature "
      + `overload may have silently replaced one): ${p4t2SigMissing.join(", ")}`,
    );
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
  const c2Live = CHECKOUT_GATE_C2_TABLES.filter((t) => present.has(t));
  if (c2Live.length !== 0 && c2Live.length !== CHECKOUT_GATE_C2_TABLES.length) {
    problems.push(
      `FS-4 C-2 projected Stripe store table cohort is PARTIAL — present: ${c2Live.join(", ") || "(none)"}; `
      + `missing: ${CHECKOUT_GATE_C2_TABLES.filter((t) => !present.has(t)).join(", ")}. `
      + "A closed roster must not accumulate dead entries: either C-2 applied (all three tables) or it did not.",
    );
  }
  const c3Live = CHECKOUT_GATE_C3_TABLES.filter((t) => present.has(t));
  if (c3Live.length !== 0 && c3Live.length !== CHECKOUT_GATE_C3_TABLES.length) {
    problems.push(
      `FS-4 C-3 folded checkout table cohort is PARTIAL — present: ${c3Live.join(", ") || "(none)"}; `
      + `missing: ${CHECKOUT_GATE_C3_TABLES.filter((t) => !present.has(t)).join(", ")}. `
      + "A closed roster must not accumulate dead entries: either C-3 applied (all three tables) or it did not.",
    );
  }
  const sourceRevisionTablesLive = DOCUMENT_SOURCE_REVISION_0217_TABLES.filter((t) => present.has(t));
  // #1014 [0235] — present once 0235 applies, absent before it; the same gating as 0217's.
  const bindingClaimTablesLive = OPENING_BINDING_CLAIM_0235_TABLES.filter((t) => present.has(t));
  const roster = [
    ...GOVERNED_TABLES,
    ...(sourceRevisionTablesLive.length === DOCUMENT_SOURCE_REVISION_0217_TABLES.length
      ? DOCUMENT_SOURCE_REVISION_0217_TABLES : []),
    ...(bindingClaimTablesLive.length === OPENING_BINDING_CLAIM_0235_TABLES.length
      ? OPENING_BINDING_CLAIM_0235_TABLES : []),
    ...(cohortLive.length === SUBLEDGER_0037_TABLES.length ? SUBLEDGER_0037_TABLES : []),
    ...(c2Live.length === CHECKOUT_GATE_C2_TABLES.length ? CHECKOUT_GATE_C2_TABLES : []),
    ...(c3Live.length === CHECKOUT_GATE_C3_TABLES.length ? CHECKOUT_GATE_C3_TABLES : []),
  ];
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
