// Wave-A rig — daily-loop shared helper CORE (NOT a test file: the name does not
// end in `.test.mjs`, so `node --test` ignores it). Written by the CONTRACT-BLIND
// test lane (Lane B) straight from `docs/plan/wave-a-daily-loop-contract.md` v1.1 +
// `wave-a-migration-0011-design.md` v1.1 (companion) + `.tmp/wave-a-build/
// INTERFACE-PINS.md` v1 + migrations 0001–0010 + the existing rig harness. It NEVER
// reads `0011_daily_loop.sql` (or any Lane A/C/D/E source). The battery encodes the
// SPEC; a divergence between an expectation here and observed 0011 behavior is a
// FINDING for orchestrator adjudication, never a silent test edit.
//
// Layout mirrors the Slice-5/6 split (each module under the repo's 500-line gate):
//   wave-a-helpers.mjs  — constants + readiness + skip/marker (this)
//   wave-a-fixtures.mjs — new-0011 fn wrappers + higher-level fixtures (re-exports)
//   wave-a-race.mjs     — Wave-A two-session forced-schedule drivers (re-exports)
// A test file imports ONE leaf (`wave-a-race.mjs` or `wave-a-fixtures.mjs`), which
// chains back through s6-fixtures → … → rig-fixtures, so buildWorld / mintWake /
// claimTask / seedCitedDocument are all in scope. Connection is env-only.

import { rootQuery } from "./s6-fixtures.mjs";
export * from "./s6-fixtures.mjs";

// ---------------------------------------------------------------------------
// New Wave-A SQLSTATEs (contract §10 + companion §13a + PINS §6). CLR01–12 live
// in rig-helpers, CLR13/14 in rig-runtime-helpers, CLR21–25 in s6-helpers.
// ---------------------------------------------------------------------------

export const CLR26 = "CLR26"; // open-question block (DETAIL: question_id + scope)
export const CLR27 = "CLR27"; // rule law
export const CLR28 = "CLR28"; // consent / egress law
export const CLR29 = "CLR29"; // sweep law (success-shaped outcomes; not_finalized raises)

/** Machine-readable reason discriminants carried in the exception DETAIL as json
 *  {"reason": <token>} (PINS §6 + companion §13a). */
export const WREASON = {
  // CLR27 (rule law)
  roleFloor: "role_floor",
  pinnedConflict: "pinned_conflict",
  malformed: "malformed",
  duplicateLive: "duplicate_live",
  accountNotPostable: "account_not_postable",
  // CLR28 (consent/egress)
  noConsent: "no_consent",
  killSwitch: "kill_switch",
  partialConsent: "partial_consent",
  evidenceMismatch: "evidence_mismatch",
  // CLR29 (sweep) — success-shaped payload {outcome:...}; not_finalized raises
  refusedBudget: "refused_budget",
  refusedAttempts: "refused_attempts",
  laneChanged: "lane_changed",
  noopExisting: "noop_existing",
  notFinalized: "not_finalized",
  // CLR23 (counterparty / alias / merge)
  aliasCollision: "alias_collision",
  registrationConflict: "registration_conflict",
  targetRetired: "target_retired",
  openDraftBlocks: "open_draft_blocks",
  crossClient: "cross_client",
  // CLR05 (maker-checker / attestation family)
  distinctChecker: "distinct_checker",
  attestationRequired: "attestation_required",
  routineRefusesHighStakes: "routine_refuses_high_stakes",
  selfAttestation: "self_attestation",
};

// ---------------------------------------------------------------------------
// New event types — NINE additive-insert into the ACTIVE taxonomy version (PINS
// §3 / companion §12; the 0009 coupled-pair idiom, NO version flip). Decisions:
// ALL `ignore` EXCEPT kb_rule.proposed + open_question.opened → `notification`.
// ---------------------------------------------------------------------------

export const WA_EVENT_TYPES = [
  "sweep.run_completed",
  "kb_rule.proposed",
  "kb_rule.signed",
  "kb_rule.retired",
  "open_question.opened",
  "open_question.resolved",
  "counterparty.merged",
  "egress.consent_granted",
  "egress.consent_revoked",
];

/** The two new types whose ACTIVE-taxonomy decision is `notification` (PINS §3). */
export const WA_NOTIFICATION_EVENTS = ["kb_rule.proposed", "open_question.opened"];

/** client_scoped flag per type (PINS §3: sweep.run_completed is firm-scoped false). */
export const WA_EVENT_CLIENT_SCOPED = {
  "sweep.run_completed": false,
  "kb_rule.proposed": true,
  "kb_rule.signed": true,
  "kb_rule.retired": true,
  "open_question.opened": true,
  "open_question.resolved": true,
  "counterparty.merged": true,
  "egress.consent_granted": true,
  "egress.consent_revoked": true,
};

// ---------------------------------------------------------------------------
// New TABLES 0011 adds (PINS §2). All: zero direct grants, RLS + FORCE RLS,
// owner clara_fn_owner, _tf_no_truncate + append-only/immutability triggers.
// ---------------------------------------------------------------------------

export const WA_NEW_TABLES = [
  "counterparty_aliases",
  "autodraft_attempts",
  "sweep_runs",
  "sweep_run_items",
  "coding_rules",
  "rule_sightings",
  "rule_decisions",
  "open_questions",
  "journal_entry_revisions",
  "client_egress_consents",
];

// ---------------------------------------------------------------------------
// New/changed grant matrix (companion §13 + PINS §2). Each fn → the EXACT set of
// app roles that must hold EXECUTE (every other app role must NOT). role tokens
// resolve to ROLES.* at assertion time. Internal cores hold NO app grant.
// ---------------------------------------------------------------------------

export const WA_GRANTS = {
  // reads
  coding_lane: ["authenticated", "agentRo"],
  list_coding_lanes: ["authenticated", "agentRo"],
  list_review_queue: ["authenticated"],
  get_sweep_run: ["authenticated"],
  get_open_question: ["authenticated"],
  get_coding_rule: ["authenticated"],
  get_entry_diff: ["authenticated", "agentRo"],
  get_doc_entry_diff: ["authenticated", "agentRo"],
  get_document_for_human_read: ["runtime"],
  // human writers
  add_counterparty_alias: ["authenticated"],
  retire_counterparty_alias: ["authenticated"],
  rename_counterparty: ["authenticated"],
  merge_counterparties: ["authenticated"],
  request_autodraft: ["authenticated"],
  acknowledge_sweep_run: ["authenticated"],
  propose_coding_rule: ["authenticated"],
  sign_coding_rule: ["authenticated"],
  decline_coding_rule: ["authenticated"],
  retire_coding_rule: ["authenticated"],
  open_question: ["authenticated"],
  resolve_open_question: ["authenticated"],
  dismiss_open_question: ["authenticated"],
  promote_clarify_to_question: ["authenticated"],
  grant_client_egress: ["authenticated"],
  revoke_client_egress: ["authenticated"],
  approve_routine_entry: ["authenticated"],
  // runtime writers + reads
  admit_autodraft_task: ["runtime"],
  begin_autodraft_task: ["runtime"],
  settle_autodraft_task: ["runtime"],
  open_sweep_run: ["runtime"],
  reconcile_sweep_runs: ["runtime"],
  list_autodraft_candidates: ["runtime"],
  list_document_autodraft_candidates: ["runtime"], // PIN-ADD-1 — the event-path resolver
};

/** Ungranted internal cores 0011 adds (companion §8/§13: granted to NO app role). */
export const WA_UNGRANTED_FNS = ["_open_question_blocks"];

/** Agent writer with the ADR-015 split lane (companion §8): wake-allowlist only. */
export const WA_WAKE_WRITER = "wake_open_question";

// ---------------------------------------------------------------------------
// The NEW `autodraft` wake_kind allowlist — SIX rows (PIN-DELTA-1). §4 of the
// companion lists five "exactly"; PIN-DELTA-1 adds wake_open_question because
// open_questions.origin includes 'sweep_refusal' which needs a writer.
// ---------------------------------------------------------------------------

export const WA_AUTODRAFT_ALLOWLIST = [
  "wake_draft_entry",
  "get_document_extract",
  "get_context_pack",
  "get_draft_review",
  "coding_lane",
  "wake_open_question",
];

// ---------------------------------------------------------------------------
// Advisory-lock constants (PINS §2 / companion §14; house family). The budget
// lock is SHARED with begin_chat_turn — one budget authority.
// ---------------------------------------------------------------------------

export const WA_LOCK = {
  budget: 202991617, // shared with begin_chat_turn — one budget authority
  clr26Vendor: 203005003, // key hashtext(client||':'||counterparty)
  clr26Client: 203005004, // key hashtext(client)
  dupBillApprove: 203005005, // key hashtext(client||':'||counterparty||':'||invoice_id)
};

// ---------------------------------------------------------------------------
// coding_lane reasons vocabulary (PINS §5a FINAL tokens).
// ---------------------------------------------------------------------------

export const LANE_REASONS = [
  "no_active_filing", "open_draft", "already_coded", "vendor_unresolved",
  "vendor_ambiguous", "tier_a_fails", "amount_exception", "near_duplicate",
  "high_stakes", "non_myr", "open_question", "no_consent", "multi_doc",
  "facts_pending", "parked", "rule_backed",
];

/** Lane labels (WA-L2). */
export const LANES = { ready: "ready", needsReview: "needs_review", needsYou: "needs_you" };

// ---------------------------------------------------------------------------
// Outcome vocabularies (PINS §2).
// ---------------------------------------------------------------------------

/** sweep_run_items.outcome CHECK (PINS §2 / companion §5). */
export const ITEM_OUTCOMES = ["drafted", "skipped_lane", "refused_budget", "refused_attempts", "noop_existing"];
/** settle_autodraft_task outcome ∈ (PINS §2). */
export const SETTLE_OUTCOMES = ["drafted", "skipped_lane", "noop_existing", "failed"];
/** admit_autodraft_task success-shaped outcomes (PINS §2). */
export const ADMIT_OUTCOMES = ["admitted", "noop_existing", "refused_attempts", "lane_changed", "refused_budget"];
/** autodraft_attempts.state (PINS §2). */
export const ATTEMPT_STATES = ["active", "parked", "idle"];

// ---------------------------------------------------------------------------
// Numeric defaults (PINS §4 / companion §5).
// ---------------------------------------------------------------------------

export const WA_DEFAULTS = {
  reserveTokens: 40000, // CLARA_AUTODRAFT_RESERVE_TOKENS
  sweepBudgetShare: 0.6, // firm_limits.sweep_budget_share
  maxConcurrentSweeps: 2, // firm_limits.max_concurrent_sweeps
  catchupSeconds: 300, // CLARA_AUTODRAFT_CATCHUP_SECONDS
};

/** The autodraft admission origins with distinct op-key namespaces (companion §4). */
export const ORIGIN = { sweep: "sweep", oneClick: "one_click" };

/** The high-stakes/routine money shapes (rig-helpers: HIGH_STAKES_CENTS=RM10k). */
export const NON_MYR = "SGD";

// ---------------------------------------------------------------------------
// Readiness — the Wave-A surface must be present (0011 applied), else SKIP. The
// marker follows the s6Ready precedent: a NEW table (counterparty_aliases,
// companion §2) + a NEW fn (coding_lane, companion §3). Never reads the migration
// file; inspecting the LIVE catalog is allowed. If 0011 is on disk but does not
// apply cleanly, migrate() throws, the txn rolls back to the prior version, and
// this returns false → suites SKIP. The migrate error is a lane note (the
// apply-cleanliness is itself a finding, reported, never silently swallowed).
// ---------------------------------------------------------------------------

let _skips = 0;

/** Count a skipped 0011-dependent test (loud skip discipline — printed in after). */
export function markSkip() {
  _skips += 1;
}

/** Print the loud skip count for a file (the "SKIP with a count" WO requirement). */
export function printSkipCount(label) {
  if (_skips > 0) {
    console.error(`\n[wave-a SKIP count — ${label}] ${_skips} 0011-dependent test(s) SKIPPED (marker objects absent — 0011 not yet integrated)`);
  }
}

export async function waveAEnsureReady() {
  const { ensureReady } = await import("./rig-docs-fixtures.mjs");
  const { noteLane } = await import("./s6-fixtures.mjs");
  try {
    await ensureReady();
  } catch (e) {
    noteLane(`migrate did not reach a clean state (${e.message}) — running at the current applied version; 0011 apply-cleanliness is a shape-probe finding`);
  }
  return waveAReady();
}

export async function waveAReady() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'clara' and c.relname = 'counterparty_aliases' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname = 'coding_lane' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

/** Standard per-test skip gate — when the 0011 surface is absent, skip loudly and
 *  count (the WO's "SKIP with a marker + a count" requirement). Each test file
 *  passes its module-level `ready` boolean. Returns true when the test must bail. */
export function skipUnready(t, ready, msg = "Wave-A daily loop not present — 0011 not yet applied") {
  if (!ready) {
    markSkip();
    t.skip(msg);
    return true;
  }
  return false;
}
