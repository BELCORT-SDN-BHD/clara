// x42-s5-helpers.mjs — the readiness gate and the shared lineage/advisory instruments for
// the Wave-D-b S5 residual-fix battery.
//
// Extracted from x42-s5-residuals.test.mjs, which sits at the repo's 500-line ceiling: the
// gate is the part of that file with no cells in it, so it is the part that moves. Every
// other x42 lane already ships its own `x42-*-helpers.mjs`; this brings the S5 lane into
// line with them. The integration pass added the lineage walkers and the advisory reader
// here for the same reason — they are instruments, not cells.
//
// THE GATE IS TWO-PART, and the order matters. `x41EnsureReady()` must run FIRST and
// unconditionally: besides gating on migration 0041, it is what sets the shared DB-clock
// anchor that every date fixture in x41-fa-fixtures.mjs (mon / dayIn / shift) reads. Skip it
// and those helpers assert "x41EnsureReady() must run before any date fixture" — every cell
// in the battery then dies in SETUP rather than running, which is exactly what the first
// 0042 integration run produced. The 0042 catalog probe layers on top so the battery still
// SKIPS cleanly (never fails) on a database where 0042 has not been applied — migration
// numbers claim at MERGE, so a catalog probe is the only honest way to ask.
import assert from "node:assert/strict";
import {
  rootQuery, skip41, x41EnsureReady, faRow, reviseParticulars, mon, dayIn,
  COST, ACCUM, EXPENSE,
} from "./x41-fa-world.mjs";

/** True iff migration 0042 is recorded as applied. Catalog-probed, never assumed. */
export async function x42Has0042() {
  try {
    const r = await rootQuery(
      "select version from clara.schema_migrations where version ~ '^0042_'");
    return r.rows.length > 0;
  } catch (e) {
    // NARROWED, NOT BLANKET. 42P01 (clara.schema_migrations itself absent) is the one honest
    // "not ready yet" case — a pre-0001 database. Any other error (a typo, a permission change,
    // a renamed column) is a real bug and must propagate, not be read as "0042 isn't live".
    if (e.code === "42P01") return false;
    throw e;
  }
}

/** The full readiness gate: 0041 (and its clock anchor) AND 0042. */
export async function x42S5Ready() {
  return (await x41EnsureReady()) && (await x42Has0042());
}

/** Per-cell skip, mirroring skip41's reporting so skipped cells stay counted. */
export const x42S5SkipHere = (t, live) =>
  skip41(t, live, "the Wave-D-b S5 residual-fix battery");

// ---------------------------------------------------------------------------
// G11 — the lineage instruments (design §6.2).
// ---------------------------------------------------------------------------

/** Walk `supersedes_asset_id` to the root, counting edges (the x41-round4-helpers
 *  `lineageIdsOf` equivalent, kept here so the S5 cells stay self-contained). */
export async function lineageDepth(leaf) {
  let n = 0;
  let cur = await faRow(leaf);
  while (cur?.supersedes_asset_id) {
    n += 1;
    cur = await faRow(cur.supersedes_asset_id);
  }
  return n;
}

/** The k-th chained-revision effective date, strictly increasing (the x41.u4
 *  (x41-round46.test.mjs) `chainDate` idiom, cloned verbatim). */
export const chainDate = (k) => dayIn(mon(-5 + Math.floor(k / 28)), (k % 28) + 1);

/** Drive `hops` audited revisions in a row, returning the leaf (the x41.u4 `reviseChain`
 *  idiom, cloned verbatim; the actor is a parameter now that this lives outside the cell). */
export async function reviseChain(actor, client, rootId, hops, particulars, label) {
  let cur = rootId;
  for (let k = 0; k < hops; k++) {
    await reviseParticulars(actor, { client, asset: cur, effectiveFrom: chainDate(k), particulars });
    cur = (await faRow(cur)).superseded_by_asset_id;
    assert.ok(cur, `${label}: hop ${k + 1} minted a successor — the chain must really be ${hops} edges deep`);
  }
  return cur;
}

// ---------------------------------------------------------------------------
// G12 — the both-arms splice probe (design §6.3).
// ---------------------------------------------------------------------------

/** A books-grade-complete FA baseline EXCEPT cost_cents, OMITTED — casting SQL-NULL text
 *  to bigint raises no exception, so only the NEW cost-only IS NULL disjunct catches it. */
export function baselineMissingCost(itemKey) {
  return {
    description: "x42 s5.3 asset missing cost", acquired_date: mon(-6).start,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
    accumulated_depreciation_cents: 0, depreciation_start_date: mon(-6).start, residual_cents: 0,
    item_key: itemKey,
  };
}

/** How many times a marker appears in `clara._draft_opening_item_core`'s live body.
 *  The design orders the cost-only IS NULL disjunct at BOTH 0017 validator sites; only one
 *  of them is reachable by a public caller (see x42.s5.3b), so the far site is asserted the
 *  way the ladder pinned every other vacuously-closed door — with a catalog probe. */
export async function draftOpeningCoreMarkerCount(marker) {
  const r = await rootQuery(
    `select pg_get_functiondef('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure) as d`);
  const def = r.rows[0].d;
  return (def.length - def.split(marker).join("").length) / marker.length;
}

// ---------------------------------------------------------------------------
// G14 — the split-month advisory reader (design §6.4).
// ---------------------------------------------------------------------------

/** "No advisory" as the BUILD spells it. `clara._fa_split_month_advisory` is
 *  `coalesce(jsonb_agg(...), '[]'::jsonb)` — it returns an EMPTY ARRAY, never NULL, when
 *  there is nothing to advise, and `_fa_asset_json` publishes a companion
 *  `split_month_advisory_count` that is 0 in exactly that case. Design §6.4 says the
 *  advisory is DERIVED and SURFACED; it never says its absence is spelled NULL. An empty
 *  array (or a zero count, or an empty object) therefore IS "no advisory", and emptiness —
 *  not nullness — is what a G14 cell must measure. */
const advisoryEmpty = (v) =>
  v === null || v === undefined || v === false
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === "number" && v === 0)
  || (typeof v === "string" && v.trim() === "")
  || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

/** Recursively hunt an object for a NON-EMPTY advisory — G14 names the producing function
 *  (`_fa_split_month_advisory`) but not the exact response field, so the hunt stays by name.
 *  Returns the advisory value, or null when nothing advisory is surfaced anywhere. */
export function findAdvisory(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/advisory/i.test(k) && !advisoryEmpty(v)) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const nested = findAdvisory(v, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// S5.25 arm (D) — round-8 M4 finding F2. The bare-token detector and its measured, exact
// lawful-use roster, extracted here (not inlined in x42-s5c-clock.test.mjs) for the same
// 500-line-ceiling reason as the rest of this file — this array is DATA, not a cell, and
// x42-s5c-clock.test.mjs.6 is what walks it.
// ---------------------------------------------------------------------------

/** No `::date` suffix required anywhere — the shape arms (A)/(A2)..(A5) of S5.25 miss. */
export const S5_25_BARE_TOKEN_RE = "\\m(now\\(\\)|current_timestamp\\M|localtimestamp\\M|clock_timestamp\\(\\)"
  + "|statement_timestamp\\(\\)|transaction_timestamp\\(\\))";

/** Every clara function (other than _book_today, exempted BY NAME) that legitimately reads a
 *  bare clock token — MEASURED from the live 0001..0041 catalog (round-8 M4), reproduced
 *  verbatim in the shipped migration's S5.25 arm (D) roster. Sorted so a diff against the live
 *  catalog's own sorted string_agg is a plain string comparison. */
// F-A1 PR-3's fail_witness_facts is NOT in this array — it is a LEDGER-GATED cohort further
// down (WITNESS_F_A1_PR3_CLOCK_NAMES). It was appended here unconditionally when the cutover
// landed, and that is the appliedStem-class defect this file's own :207-214 comment names: the
// verb is born in the cutover migration (0097 at merge), while `db-slice-frontiers` runs this
// battery against databases pinned at 0042-0045, where it does not exist. An unconditional
// entry makes every one of those legs red with a one-name diff that says nothing about clock
// discipline. Kept as a comment rather than silently moved, so the next name added here is
// asked the frontier question first.
export const S5_25_BARE_TOKEN_ROSTER = [
  // _adv_reversal_admission joined at the round-8 INTEGRATION: lane M3 factored the advance
  // reversal walls into one admission body carrying its parents' lawful as-of idiom
  // (`v_at := coalesce(p_at, now())` — a timestamptz interval default, never a date). The
  // migration's arm (D) census caught the un-rostered relocation at the first integrated
  // assembly; this pin records the same adjudication.
  "_adj_run_occurrence_core", "_adv_assert_proposal", "_adv_enrolment_at", "_adv_on_approve", "_adv_reversal_admission", "_adv_window_closed_under",
  "_approve_entry_core", "_approve_opening_entry", "_derive_vendor_binding_proposal", "_draft_entry_core", "_enqueue_invoice_facts_core",
  "_fa_on_approve", "_pair_reverse_core", "_publish_wiki_page_version_core", "_record_onboarding_contributor",
  "_refund_document_reservation", "_refund_processing_call", "_reserve_document_ingest", "_resize_document_reservation",
  // `_reserve_processing_call` LEFT this base array at F-A9 PR-1B and is now a REVERSE-gated
  // cohort (PROCESSING_CALL_PRE_F_A9_PR1B_CLOCK_NAMES, below) — pushed back on any database
  // that has not applied the brake census, exactly like begin_chat_turn's PR-0 gate.
  // `_settle_processing_call` STAYS: PR-1B removes the same page budget from it, but its
  // settle UPDATE still stamps `settled_at=now()` (measured, not assumed).
  "_resolve_vendor_binding", "_seed_verified_document", "_settle_document_reservation", "_settle_from_bank_line_core", "_settle_processing_call",
  "_tf_agent_task_insert", "_tf_agent_task_update", "_tf_autodraft_attempt_update", "_tf_coding_task_update", "_tf_counterparty_update_0011",
  "_tf_document_intake_update", "_tf_fa_movement_belt", "_tf_filing_correction_update", "_tf_firm_document_limits_upsert", "_tf_fixed_assets_immutable_0017",
  "_tf_processing_call_reservation_update", "_tf_processing_task_update", "_tf_reservation_update", "_tf_rotate_token", "_tf_wake_intent_consume",
  // `begin_chat_turn` LEFT this base array at F-A9 PR-0 and is now a REVERSE-gated cohort
  // (CHAT_TOKEN_CAP_PRE_F_A9_CLOCK_NAMES, below) — it is pushed back on any database that
  // has not applied the hotfix. Removed here rather than kept-and-subtracted so the base
  // array stays what it claims to be: the set measured at the CURRENT frontier.
  //
  // ELEVEN F-A2-PR-3-RETIRED NAMES do NOT leave this array the same way -- see
  // RULE_MACHINERY_RETIRED_F_A2_PR3_CLOCK_NAMES below, which pushes them back exactly like
  // begin_chat_turn's reverse gate, one migration later in the estate's life instead of one
  // earlier. Unconditional removal (what an earlier pass of this file did) breaks every
  // `db-slice-frontiers` leg pinned before the cutover, where all eleven still carry a bare
  // clock token by catalog read: the identical unconditional-append defect this file's own
  // :153-164 comment already names, mirrored to the removal direction.
  "_wake_cred_full", "ack_compliance_watch", "acknowledge_sweep_run", "add_bank_account",
  "admit_autodraft_task", "answer_interruption", "approve_opening_correction", "approve_opening_seed", "approve_pair_reversal",
  "approve_wrong_client_correction", "begin_client_onboarding", "bootstrap_client_plan", "cancel_agent_task",
  "cancel_client_onboarding", "cancel_opening_seed", "cancel_pair_reversal", "cancel_seeding_batch", "claim_document_intake_upload",
  "claim_document_processing_task", "classify_document", "commit_client_onboarding", "complete_bank_reconciliation", "complete_coding_task",
  "complete_fixed_asset_particulars", "complete_pending_match", "complete_seeding_batch", "complete_stored_document_task", "confirm_attribution_candidate",
  "consume_egress_dispatch", "create_client", "create_firm", "create_seeding_batch", "deactivate_bank_account",
  "deactivate_client_egress_purpose", "decline_seeding_proposal", "dismiss_attribution_candidate", "dismiss_coding_task",
  "dismiss_open_question", "enrol_staff_advance_account", "evaluate_sst_watch", "evaluate_sst_watches_all",
  "fail_classify", "fail_invoice_facts", "fail_statement_facts", "finalize_document_intake", "get_bank_reconciliation",
  "get_context_pack", "list_review_queue", "list_vendor_bindings", "mark_document_intake_received",
  "mark_wiki_citations_stale", "match_bank_line", "merge_counterparties", "mint_wake_credential", "open_interruption",
  "persist_document_extraction", "persist_invoice_facts", "persist_statement_facts", "prepare_egress_dispatch",
  "propose_bank_rule", "propose_vendor_identity_binding", "reconcile_sweep_runs", "record_future_attestation",
  "record_opening_keyed_resolution", "relay_health", "remove_member", "rename_counterparty", "request_reextraction",
  "resolve_and_book_bank_line", "resolve_bank_line_exception", "resolve_compliance_watch", "resolve_lint_finding", "resolve_onboarding_plan_item",
  "resolve_open_question", "retire_adjustment_template", "retire_bank_rule", "retire_client_alias",
  "retire_counterparty_alias", "retire_depreciation_authority", "retire_document_filing", "retire_fa_account_profile",
  "retire_staff_advance_account", "retire_wiki_page", "reverse_entry", "revise_entry", "revise_fixed_asset_particulars",
  "revoke_client_egress", "revoke_client_egress_purpose", "revoke_vendor_identity_binding", "revoke_wake_credential", "run_client_lint",
  "run_lint_all", "set_counterparty_terms", "set_document_kind", "set_member_role", "set_wiki_synthesis_hold",
  "settle_chat_turn", "settle_ingest_reservation", "sign_adjustment_template", "sign_bank_rule",
  "sign_depreciation_authority", "sign_vendor_identity_binding", "snooze_compliance_watch", "tick_seeding_proposal",
  "unmatch_bank_match", "update_onboarding_plan", "upsert_fa_account_profile", "verify_document_intake", "void_bank_reconciliation",
  "void_bank_statement", "wake_context", "wake_record_notification", "withdraw_draft",
].sort();

// F-A2 PR-3 [the cutover, `f_a2_cutover_retirement` at whatever number merge claimed]: ELEVEN
// names that ALL carried a bare clock token as part of the rules-execution tier, retired whole
// (Annex B.1). Every one of them is present from EARLY in the estate's life (the coding-rule/
// autopost-rule machinery is Wave-A2/A2.1-era, and _ocr_sales_floor is 0016's), so unlike a
// born-late cohort this needs no LOWER gate at all -- only the same upper "not yet retired" gate
// SALES_LANE_0046_RETIRED_F_A2_PR3_CLOCK_NAMES uses, and the exact mirror image of
// CHAT_TOKEN_CAP_PRE_F_A9_CLOCK_NAMES's reverse-gate shape below (there the name is pushed back
// on NOT-yet-applied; here it is pushed back on NOT-yet-retired). GATED ON THE STEM, never a
// number, for the reason every other block in this file states.
const RULE_MACHINERY_RETIRED_F_A2_PR3_CLOCK_NAMES = [
  "_ocr_sales_floor", "acknowledge_rule_posts", "decline_coding_rule", "execute_rule_post",
  "list_autopost_rules", "propose_autopost_rule", "reconcile_autopost_rules", "retire_autopost_rule",
  "retire_coding_rule", "sign_autopost_rule", "sign_coding_rule",
];

// ---------------------------------------------------------------------------
// 0046 [§7-A] — THE THREE NAMES THIS MIGRATION ADDS, AND WHY THE ROSTER IS BIMODAL.
//
// THE ADJUDICATION FIRST. Arm (D) catches a BARE clock token, and a bare token is only a
// defect when the body derives a DATE from it. All three of these stamp TIMESTAMPTZ values —
// an evaluation instant on an advisory read, and closed_at/updated_at/the activation
// watermark on two writers. The one place §7-A needs a MYT money DATE,
// clara.preview_ocr_sales_evidence, calls clara._book_today() instead, which is exactly the
// outcome S5.25 arm (B) exists to produce (0046's own tail arm (7) re-measures that roster
// unchanged).
//
// AND WHY IT IS NOT JUST APPENDED TO THE LIST ABOVE. The roster is compared EXACTLY against
// the live catalog, and `db-slice-frontiers` runs this battery against databases pinned at
// EARLIER frontiers (d-b0/b1/b2/b3 stop at 0042-0045), where these three functions do not
// exist. An unconditional entry turns every one of those legs red while saying nothing about
// clock discipline — the same failure mode rig-meta's 0037 table cohort and its
// cohortFailures() gate already exist to prevent. Gating on the migration ledger keeps arm
// (D) exact in BOTH directions at 0045 and at 0046+ alike: a missing name still fails.
const SALES_LANE_0046_CLOCK_NAMES = [
  "set_sales_backfill_state", "set_sales_lane_activation",
];
// preview_ocr_sales_evidence RETIRED with F-A2 PR-3 (Annex B.1, OQ-3/D36): it is a
// BORN-THEN-RETIRED name, present from 0046 until the cutover migration lands, and this
// battery also runs against BOTH slices of that window — the d-b0..b3 legs pinned before
// 0046 (where it never existed) and, since F-A2 PR-3, the frontier legs pinned AFTER the
// cutover (where it no longer exists). A window name needs an upper gate as well as a lower
// one, or the roster silently over-asserts on every post-retirement frontier — the SAME
// unconditional-append defect :153-160 already names for fail_witness_facts, generalised to
// a name that is later DROPPED rather than merely born late. Its own array, kept separate
// from the names above (which never retire) so the two gates read independently.
const SALES_LANE_0046_RETIRED_F_A2_PR3_CLOCK_NAMES = ["preview_ocr_sales_evidence"];

// 0055 [Wave E lane α]: record_client_fact stamps recorded_at/superseded_at with bare
// now() — timestamptz audit stamps, the lawful class; the door never derives a DATE
// from the session clock (its one date read is clara._book_today()'s authority).
/** 裁-18b PR-1 — the bodies it adds that read a bare clock token, MEASURED against the live
 *  catalog (the arm (D) diff named exactly these, no more): _expire_stale_proposals
 *  (`expires_at <= now()`), _propose_vendor_binding_agent_core (`now() + interval '12 months'`
 *  and its own expiry flip), decline_vendor_identity_binding (`declined_at = now()`) and
 *  wake_list_binding_candidates (`expires_at > now()`). All are timestamptz stamps or wall-clock
 *  TTLs -- never a DATE derived from the session clock -- which is the lawful-use test this
 *  roster encodes.
 *  LEDGER-GATED on the migration STEM, per this file's own :157-164 warning: `db-slice-frontiers`
 *  runs this battery against databases pinned at 0042-0045, where none of these verbs exist, and
 *  an unconditional append would make every one of those legs red with a diff that says
 *  nothing about clock discipline. The stem (not the number) is the witness because the migration
 *  ships UNNUMBERED and the conductor claims its number at merge.
 *
 *  FIFTH NAME, AND IT MOVED HOUSE TWICE IN ONE DAY. The 2026-08-30 fold round first added
 *  `eligible_binding_signer_count`: it had been a bare `count(*)` over active memberships and read
 *  no clock at all, and H5 made it a DURABLE ROSTER WINDOW reading `now()` for the 90-day
 *  departure window. FOLD-8, the same day, then lifted that arithmetic OUT of it into
 *  `clara.binding_signer_roster` so the count and the date the refusal reports come from ONE
 *  snapshot — and the count door became a firm-congruent wrapper with no clock read left in it.
 *  So the fifth name is `binding_signer_roster`, and `eligible_binding_signer_count` is NOT on
 *  this roster: measured on the live catalog (`position('now()' in prosrc)` — false for the
 *  count door, true for the roster), not inferred from which one the wall is spelled after.
 *  The window is a wall-clock TTL over a timestamptz column, the lawful class; the function
 *  derives no DATE from the session clock.
 *
 *  The roster is a MEASURED census, so it is trued at the tip that SHIPS, never at the tip that
 *  was reviewed — carrying the earlier name forward reds this floor exactly as loudly as omitting
 *  the new one, which is the property that made the move visible at all. */
const BINDING_PROPOSAL_PR1_CLOCK_NAMES = [
  "_expire_stale_proposals", "_propose_vendor_binding_agent_core",
  "decline_vendor_identity_binding", "wake_list_binding_candidates",
  "binding_signer_roster",
];

const CLIENT_FACTS_0055_CLOCK_NAMES = ["record_client_fact"];

// 0056 [Wave E lane β]: five lawful bare-clock readers — timestamptz audit stamps
// (attest/abandon/finalize receipts + the capability grant/revoke stamps); every DATE
// these verbs write flows through the authorities (_book_today / the FY row's own
// bounds), never the session clock. Measured on the 0056 rig.
const CLOSE_MODEL_0056_CLOCK_NAMES = [
  "abandon_close", "attest_close_exception", "finalize_close",
  "grant_firm_capability", "revoke_firm_capability",
];

// F-A4 PR-1b [close-key-1 Window B, `f_a4_pr_1b_close_lifecycle` at whatever number merge
// claims]: the entrance-seam body-move (design D-15, Annex A.8) relocates abandon_close's own
// `ended_at = now()` stamp into the shared core it now delegates to -- clara._abandon_close_core.
// abandon_close's OWN prosrc no longer calls now() directly (it is a thin _human_ctx + capability
// delegate), so this is a SWAP, not an addition: the name moves, the lawful class (a timestamptz
// audit stamp, never a derived DATE) does not. begin_close's own body never called now() directly
// either before or after its matching body-move, so it names nothing here in both shapes.
const F_A4_PR1B_CLOCK_NAMES = ["_abandon_close_core"];

// F-A4 PR-1c [close-key-1's additive close-domain agent limb, `f_a4_pr_1c_close_agent_limb` at
// whatever number merge claims]: SIX lawful bare-clock readers, MEASURED against the applied rig
// rather than derived from reading the file (the round-8 M4 method, applied to a new lane).
// (Prose count trued in the fix round — the array grew to six with settle_close_proposal while
// this sentence still said five. A roster whose prose and whose members disagree is the exact
// thing this file exists to prevent, so the count is stated once and read off the array below.)
//
// THE ADJUDICATION, per name, because arm (D) catches a bare token and a bare token is only a
// defect when the body derives a DATE from it:
//   · release_close_prep            — `released_at = now()`, a timestamptz release stamp.
//   · _agent_close_proposal_core    — `settled_at = now()` on the supersession stamp, likewise.
//   · _wake_task_id                 — `c.expires_at > statement_timestamp()`, the credential
//                                     liveness predicate copied VERBATIM from wake_context()
//                                     (itself on this roster) so the sibling and the body it
//                                     mirrors cannot disagree about which credential is live.
//   · mint_wake_credential_for_task — `statement_timestamp() + p_ttl`, mirroring
//                                     mint_wake_credential's own expiry arithmetic (also on this
//                                     roster). A timestamptz, never a date.
//   · close_prep_due                — `wc.created_at > statement_timestamp() - interval '1 day'`,
//                                     the cadence window on a timestamptz column. Its one DATE
//                                     comparison, `fy.ends_on <= clara._book_today()`, goes
//                                     through the book-clock authority — which is exactly the
//                                     outcome S5.25 arm (B) exists to produce.
// hold_close_prep is deliberately ABSENT: its held_at rides the column DEFAULT, so its own prosrc
// reads no clock at all. Measured, not assumed — an unconditional pair would have over-asserted.
//
// STEM-GATED, never number-gated, for the reason every other block here states: this battery also
// runs against databases pinned at earlier frontiers (d-b0..b3 stop at 0042-0045), where none of
// these five exist, and an unconditional entry reds every one of those legs with a diff that says
// nothing about clock discipline.
//   · settle_close_proposal        — `settled_at = now()`, the same timestamptz settle stamp
//                                     _agent_close_proposal_core writes on the supersession path.
//                                     Added with the door itself (conductor ruling, this train),
//                                     MEASURED on the applied rig like the other five.
const F_A4_PR1C_CLOCK_NAMES = [
  "_agent_close_proposal_core", "_wake_task_id", "close_prep_due",
  "mint_wake_credential_for_task", "release_close_prep", "settle_close_proposal",
];

// F-A4 PR-2c: mint_chat_close_credential computes `statement_timestamp() + p_ttl` for a
// TIMESTAMPTZ credential expiry, mirroring mint_wake_credential_for_task. It never derives a
// book DATE. The two new authority helpers read no clock and therefore owe no roster entry.
const F_A4_PR2C_CLOCK_NAMES = ["mint_chat_close_credential"];

// F-A4 PR-2a: ONE new lawful bare-clock reader, gated on its own migration STEM like PR-1c's --
// never on a NUMBER, which is claimed at merge.
//
// clara._record_document_service_period_core stamps `superseded_at = now()` when a corrected
// service period supersedes its predecessor. That is a TIMESTAMPTZ recording WHEN the supersession
// happened, exactly the shape 0057's verify_snapshot note describes: it lands in no DATE column and
// in no date-typed accounting decision. The dates that DO matter here -- period_start / period_end
// -- come from the human through the door and are stored as DATEs; the evaluator then derives every
// period boundary from THOSE, never from the clock. Rewriting the stamp to clara._book_today()
// would be the same category error 0057 names: _book_today returns a DATE, and this is the moment a
// supersession occurred.
//
// Arm (D) exists to make every bare-clock reader a DECLARED one with a stated reason, not to drive
// the count to zero -- so it is declared here, in the PR that creates it.
const F_A4_PR2A_CLOCK_NAMES = ["_record_document_service_period_core"];

// P4 tranche 1 [invite/RBAC first]: THREE lawful bare-clock readers, all timestamptz, none a
// date column arm (D) would need a ::date cast on. invite_member computes the invite's
// `expires_at := now() + interval '7 days'`; accept_invite reads `now()` twice -- the
// `expires_at <= now()` expiry check and the `accepted_at := now()` consumption stamp;
// revoke_invite stamps `revoked_at := now()` on the same table. Declared here, in the PR that
// creates them, per arm (D)'s own law: every bare-clock reader gets a stated reason, not a
// silent pass.
const P4T1_CLOCK_NAMES = ["accept_invite", "invite_member", "revoke_invite"];

// P4 tranche 2 [registration + operator approval]: three lawful bare-clock readers, all
// timestamptz stamps, none date-typed -- `_create_firm_core` stamps `reviewed_at := now()` on
// the onboarding plan it opens (byte-identical to the live create_firm body's own pre-extraction
// line, moved not added); `approve_firm_registration` and `reject_firm_registration` each stamp
// `decided_at := now()` on the registration request row. `create_firm`'s OWN `consumed_at :=
// now()` line is untouched by the extraction and was already in the base roster pre-P4.
// `request_firm_registration` is deliberately ABSENT: its only clock touch is the
// `created_at timestamptz not null default now()` COLUMN DEFAULT, which lives in the table DDL,
// never in this function's own prosrc -- arm (D)'s detector reads prosrc, so a column default
// is invisible to it by construction, not by omission.
const P4T2_CLOCK_NAMES = ["_create_firm_core", "approve_firm_registration", "reject_firm_registration"];

// 0057 [Wave E lane γ]: ONE lawful bare-clock reader. clara.verify_snapshot stamps
// `'verified_at', now()` on the jsonb payload it RETURNS — a display timestamptz that says
// when the recomputation ran, and it lands in no column and in no date-typed accounting
// decision. Every DATE 0057 touches comes from an authority instead: the door's
// completeness guard reads clara._book_today(), and the period bounds come from the
// reporting_periods row.
//
// AND WHY THE ROSTER IS THE FIX RATHER THAN A REWRITE. Rewriting the body to
// clara._book_today() would be a category error — _book_today returns a DATE, and this is a
// timestamp of a read that happened. Arm (D) exists to make every bare-clock reader a
// DECLARED one with a stated reason, not to drive the count to zero; a declared reader is
// the outcome it wants. Measured on the 0057 rig with arm (D)'s own detector expression
// (comments stripped), which flags verify_snapshot and nothing else in the 0057 surface —
// _tf_snapshot_staleness mentions now() only inside a comment and correctly does not flag.
//
// Frontier-gated for the reason the 0046/0055/0056 blocks state: `db-slice-frontiers` runs
// this battery against databases pinned earlier, where this function does not exist, and an
// unconditional entry would turn those legs red while saying nothing about clock discipline.
const REGISTRY_0057_CLOCK_NAMES = ["verify_snapshot"];

// 0059 [Wave E lane δ]: ONE lawful bare-clock reader, and it is the 0057 shape again.
// clara.approve_metric_definition stamps `approved_at = statement_timestamp()` on the version row
// it approves — a timestamptz recording WHEN a human approved, which lands in no date-typed
// accounting decision and drives no calculation.
//
// WHY THE TOKEN CANNOT BE clara._book_today() HERE, stated because "use the authority" is the
// reflex this roster otherwise enforces: _book_today returns a DATE, and this column is the instant
// an approval occurred, not a business day. Rewriting it would be the same category error 0057's
// block names for verified_at. Every DATE δ decides comes from an authority or a parameter instead
// — applies_from/applies_to are the caller's, the edge-policy and averaging windows are catalog
// rows, the account-set effective windows are stored, and the period-effective N/A reason
// resolution anchors on the reporting period's own period_start, never on a clock.
//
// MEASURED, not inferred: arm (D)'s own detector over the 0058-0061 surface flags this name and no
// other. 0059's second statement_timestamp() site sits inside the `do $canonical$` seed block,
// which is not a pg_proc row and correctly does not flag; the A30b receipt writer carries no clock
// token at all (its receipts are timestamped by the table's own default).
//
// Frontier-gated for the reason the 0046/0055/0056/0057 blocks state: db-slice-frontiers runs this
// battery against databases pinned earlier, where this function does not exist.
const METRICS_0059_CLOCK_NAMES = ["approve_metric_definition"];

// 0072 [Wave E lane ε]: ONE lawful bare-clock reader, and it is the 0057/0059 shape a third time.
// clara.approve_report_for_issue stamps `issued_at = now()` on the run it issues — the instant a
// human approved a set of financial statements for issue. It lands in no date-typed accounting
// decision and drives no calculation.
//
// WHY NOT clara._book_today(), stated because "use the authority" is the reflex this roster
// otherwise enforces: _book_today returns a DATE, and this column is an instant, not a business
// day. Every DATE lane ε decides comes from a parameter or a stored row instead — all four
// publishing verbs take an explicit p_effective_from (the x42 finding that closed on the first CI
// round), the statutory profile windows are catalog rows, the wording windows are read against the
// RUN's period_start, and a chart's thresholds resolve as of the run's period_end.
//
// MEASURED, not inferred: arm (D)'s own detector over the 0065-0072 surface flags this name and no
// other. The rest of the lane's timestamps are column DEFAULTS, which live in the table definition
// rather than in a pg_proc body and correctly do not flag.
//
// Frontier-gated for the reason the 0046/0055/0056/0057/0059 blocks state: db-slice-frontiers runs
// this battery against databases pinned earlier, where this function does not exist.
const REPORTING_0072_CLOCK_NAMES = ["approve_report_for_issue"];

// 0081/0082 [Wave E lane ζ]: the readers listed in the two arrays below, and every one is a QUEUE LIFECYCLE
// INSTANT rather than a business day. claim_render_job stamps claimed_at/first_claimed_at, sets
// lease_expires_at = now() + the lease, and records the observed queue wait; render_job_payload and
// fail_render_job compare lease_expires_at against now() to decide whether the caller still holds
// the job it is speaking for; complete_render_job makes that same liveness check and stamps
// finished_at; render_dispatch_begin measures its cooldown (last_dispatch_at < now() - cooldown);
// reap_exhausted_render_jobs compares a dead lease against now(). All of it is timestamptz machinery on
// clara.render_jobs, and none of it reaches a date-typed column.
//
// WHY NOT clara._book_today(), stated because "use the authority" is the reflex this roster otherwise
// enforces: _book_today returns a DATE, and a lease deadline is an instant. This lane decides NO
// accounting date at all — the render's period_start/period_end, the effective windows and the
// threshold as-of arrive from lane ε's pins contract as DB-owned rows, never from a clock, so there
// is no date-typed decision here for the authority to own.
//
// MEASURED, not inferred: arm (D)'s own detector, run over the 0079-0082 surface, flags exactly the
// names in the two arrays below and no other — enqueue_render_job, enqueue_missing_render_jobs, render_dispatch_record and
// render_request_manifest_v1 carry no clock token. render_jobs.enqueued_at is a column DEFAULT,
// which lives in the table definition rather than in a pg_proc body and correctly does not flag.
// (replay_render_inputs moved to 0079 and is covered by that block's own measurement; the reap
// moved out of render_dispatch_begin into its own verb and is listed with 0081's names below.)
//
// Frontier-gated for the reason the 0046/0055/0056/0057/0059/0072 blocks state: db-slice-frontiers
// runs this battery against databases pinned earlier, where these functions do not exist.
const RENDER_0081_CLOCK_NAMES = ["claim_render_job", "fail_render_job", "render_dispatch_begin",
  "render_job_payload", "reap_exhausted_render_jobs"];
const RENDER_0082_CLOCK_NAMES = ["complete_render_job"];

// 0083 [Wave E lane ζ, the human doors + the worker's fence]: ONE more, and it is the same shape as
// its siblings above. clara.render_lease_alive answers "does this worker still hold this job",
// which is `lease_expires_at > now()` — a lease deadline, an instant, and the cheapest possible
// read: the worker calls it before the expensive typesetting step and before uploading, so a render
// that outran its lease abandons instead of spending money on bytes the seal will refuse.
//
// WHY NOT clara._book_today(): the same reason as every entry above — _book_today returns a DATE and
// this is a comparison against a timestamptz deadline. Nothing in this lane decides an accounting
// date at all.
//
// MEASURED, not inferred: arm (D)'s own detector over 0083's three objects flags this one and
// neither of the other two — replay_render_inputs and requeue_render_job carry no clock token
// (the successor's enqueued_at is a column DEFAULT, which lives in the table definition rather
// than in a pg_proc body).
//
// Frontier-gated for the reason the 0046/0055/0056/0057/0059/0072 blocks state.
const RENDER_0083_CLOCK_NAMES = ["render_lease_alive"];

// B3 [ADR-068 ruling 1]: ONE lawful bare-clock reader joins, and it is a DECLARED change.
// clara.reopen_fiscal_year now mints the year-end close's reversal itself instead of
// delegating to clara.reverse_entry, so it carries that verb's two timestamptz stamps --
// `approved_at = now()` on the mirror's census-visible flip and `updated_at = now()` on the
// original's reversal-linkage pair. Both are audit instants: WHEN the reopen happened.
//
// THE ACCOUNTING DATE IS EXPLICITLY NOT FROM THE CLOCK, which is the whole point of B3. The
// mirror's posting_date is `v_fy.ends_on`, READ FROM THE FISCAL-YEAR ROW -- an authority, and
// the same class of authority the 0056 block's five readers already use. So this entry is the
// arm's intended outcome (a declared reader with a stated reason), not a regression: the body
// reads the wall clock for the two columns that record the act, and reads a period authority
// for the one column that decides where the money lands.
//
// GATED ON THE MIGRATION STEM, NEVER A NUMBER. B3's pair is numbered at MERGE, so a
// `like '0085_%'` gate would silently drop this name the moment the pair is renumbered --
// and a silently-shrunk roster is exactly the drift arm (D) exists to catch.
const B3_REOPEN_CLOCK_NAMES = ["reopen_fiscal_year"];

// F-A1 [Wave-F Track A, the LLM witness-pair writer]: ONE more, and it is the same lawful shape
// as `claim_document_processing_task` and `_enqueue_invoice_facts_core` already on this roster.
// clara.persist_witness_facts reads the bare clock TWICE and NEITHER read decides an accounting
// date:
//   · `clock_timestamp()` stamps document_extractions.extracted_at on each half of the witness
//     pair — an INSTANT on a timestamptz column, and load-bearing as an instant: the vision row
//     is stamped first and the text row is bumped at least a microsecond past it, which is what
//     lands the 0017 kind-scoped supersede trigger's document-wide pointer on the TEXT row
//     deterministically instead of on a same-transaction uuid coin flip (design §3.9 note 4).
//     clara._book_today() would be actively WRONG here: it returns a DATE, and a date cannot
//     order two rows written microseconds apart.
//   · `now()` stamps document_processing_tasks.finished_at — an audit instant, WHEN the persist
//     happened, on a timestamptz column.
// MEASURED, not inferred: arm (D)'s own detector over F-A1's seven new bodies flags this one and
// none of the other six (record_llm_usage_event's created_at is a column DEFAULT, which lives in
// the table definition rather than in a pg_proc body; the predicate, its identity leaf, the two
// private writer helpers and the citation-numbering reader carry no clock token at all).
// NOT A ::date SITE EITHER: the only `::date` F-A1 adds is `v_val::date` inside
// clara._witness_answers_ok, a validity probe on a MODEL-SUPPLIED literal already pinned by
// regex to YYYY-MM-DD — no clock, no timestamptz, timezone-independent by construction, and
// invisible to every arm of this census by design rather than by luck.
//
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for B3's stated reason: F-A1's files are numbered
// at MERGE, so a `like '0095_%'` gate would silently drop this name on a renumber — and a
// silently-shrunk roster is exactly the drift arm (D) exists to catch.
const WITNESS_F_A1_CLOCK_NAMES = ["persist_witness_facts"];
// F-A1 PR-4 (the bank-statement witness cutover) adds TWO clock-bearing bodies, and both
// belong on this roster for honest reasons rather than as an exemption:
//   * `_persist_statement_core_v2` — the spliced successor of `_persist_statement_core`. It
//     inherits the ancestor's own date/clock handling verbatim AND adds the two explicit
//     `clock_timestamp()` insert stamps that make the witness pair's document pointer
//     deterministic (design SS3.9 note 4) instead of a uuid coin flip. The ANCESTOR is not on
//     this roster and stays off it: it is byte-untouched by that migration.
//   * `persist_statement_facts_v2` — the task-lane wrapper, whose `now()` uses are the same
//     finished_at/settle stamps its v1 sibling already carries.
// Gated on the migration stem exactly like its siblings above, so a chain that stops short of
// PR-4 still measures the roster it actually has.
const STATEMENT_F_A1_PR4_CLOCK_NAMES = ["_persist_statement_core_v2", "persist_statement_facts_v2"];

// F-A5 PR-1 [`f_a5_reporting_agency_pr1` at whatever number merge claimed]:
// clara._agent_approve_metric_definition_core stamps `approved_at = statement_timestamp()` — the
// SAME bare timestamptz stamp its human sibling clara.approve_metric_definition already carries
// and which is already on this roster. It is an approval INSTANT written to a timestamptz column,
// never a business DATE, so arm (D)'s standing advice ("call the date authority instead") does not
// apply: clara._book_today() would answer a different question. Joining the roster is the declared
// cost of the stamp, exactly as the sibling's was. Gated on the migration STEM like every group
// above, so a chain stopped short of F-A5 measures the roster it actually has.
const REPORTING_AGENCY_F_A5_CLOCK_NAMES = ["_agent_approve_metric_definition_core"];

// F-A5b PR-1 [`f_a5b_pr1_sandbox_export` at whatever number merge claimed]: five genuinely new
// bodies, none deriving a business DATE (arm (B)'s own duplication roster stays untouched --
// _sandbox_export_request_core's watermark-window check calls clara._book_today() itself,
// exactly the roster's own standing advice, so it never joins THIS list at all). Each of the
// five stamps a bare timestamptz -- "the audit stamp is the clock" idiom every other core
// already on this roster carries: clara._recipient_covers's coverage_proof `checked_at`;
// sandbox_export_payload/complete_sandbox_export/fail_sandbox_export's lease-held comparison
// (`lease_expires_at >= now()`) and completion/failure `finished_at`; supersede_export_recipient's
// `superseded_at`. Gated on the migration STEM like every group above, so a chain stopped short
// of F-A5b measures the roster it actually has.
const SANDBOX_EXPORT_F_A5B_PR1_CLOCK_NAMES = [
  "_recipient_covers", "sandbox_export_payload", "complete_sandbox_export",
  "fail_sandbox_export", "supersede_export_recipient",
];

// [Wave-F Track A, F-A5b CARD 1] the sandbox job family's clock-reading verbs — the same shape of
// verb, on the same job family, as RENDER_0081_CLOCK_NAMES' claim_render_job /
// render_dispatch_begin, and rostered for the identical reason. Each READS A BARE CLOCK TOKEN in
// its own body: claim_sandbox_export stamps claimed_at / lease_expires_at / first_claimed_at and
// computes claim_delay_ms from `now() - created_at`; sandbox_dispatch_begin stamps last_dispatch_at
// and reads due-ness against `now() - cooldown`; reap_exhausted_sandbox_exports compares
// `lease_expires_at < now()` and stamps finished_at. Lawful, and therefore rostered rather than
// hidden.
//
// THREE, NOT FOUR — sandbox_dispatch_record is DELIBERATELY ABSENT, and its absence was MEASURED
// rather than reasoned from the family it belongs to. It writes the receipt for the rows
// sandbox_dispatch_begin already stamped and reads no clock at all, so arm (D)'s detector does not
// flag it; rostering it on the strength of "it is one of the four dispatch verbs" would have made
// this closed world carry a name the catalog never produces, which is precisely the drift the cell
// that walks this array exists to catch — and did.
//
// GATED on card 1's own migration STEM like every group above, so a chain stopped short of it
// measures the roster it actually has — numbers are claimed at merge, stems are not.
const CARD1_SEAM_CLOCK_NAMES = [
  "claim_sandbox_export", "reap_exhausted_sandbox_exports", "sandbox_dispatch_begin",
];

// F-A1 PR-3 [the cutover, `f_a1_cutover` at whatever number merge claimed]:
// clara.fail_witness_facts stamps `finished_at=now()` — the SAME timestamptz column its
// siblings fail_invoice_facts / fail_statement_facts already stamp bare, no ::date suffix and
// no DATE derived from the session clock anywhere in the verb. Lawful, and therefore rostered.
// GATED, for the reason :207-214 states in full: the verb is born in the cutover migration, and
// this battery also runs against databases pinned at 0042-0045 where it does not exist. Keyed
// on the migration's STABLE STEM, never its number — numbers are claimed at merge.
const WITNESS_F_A1_PR3_CLOCK_NAMES = ["fail_witness_facts"];

// [Wave-F Track A, F-A7 gamma, D1-gamma / B3(a) review fold] deactivate_firm_egress_purpose /
// revoke_firm_egress_purpose / prepare_firm_egress_dispatch: the firm-narrow typed-egress
// family's deactivate/revoke (now()-stamped deactivated_at/revoked_at) and its dispatch
// preparer (now()/clock_timestamp()-derived expires_at, mirroring prepare_egress_dispatch's own
// TTL shape) carry date-shaped code, exactly like their client-scoped siblings
// deactivate_client_egress_purpose / revoke_client_egress_purpose / prepare_egress_dispatch
// already on the unconditional roster. grant_firm_egress_purpose / activate_firm_egress_purpose
// stay OFF entirely for the same reason their client-scoped siblings do: no date-shaped code.
// GATED, not appended to the unconditional roster above: these three are born in this
// migration, and `db-slice-frontiers` runs this battery against earlier-frontier databases
// where they do not exist (the same appliedStem class as WITNESS_F_A1_PR3_CLOCK_NAMES above —
// an unconditional entry would red every such leg on a one-name diff that says nothing about
// clock discipline). Keyed on the migration's STABLE STEM, never its number.
const F_A7_GAMMA_CLOCK_NAMES = [
  "deactivate_firm_egress_purpose", "prepare_firm_egress_dispatch", "revoke_firm_egress_purpose",
];

// F-A3 PR-1a [the nine pure core extractions]: SS1 moves each verb's WHOLE live body into a new
// ungranted `_<verb>_core` and leaves the public name a thin ctx-unpack delegator (`c :=
// clara._human_ctx(...); return clara._<verb>_core(...)`) — byte-identical machinery that carries
// no clock token of its own (Annex A.2's "the extraction contract, one sentence"). The bare-clock
// bodies this roster already carried therefore MOVE, not multiply: whichever of the nine already
// matched arm (D) under its public name now matches it under `_<verb>_core` instead, and the
// public name drops off (no clock token left behind for the detector to find).
// MEASURED, not inferred: arm (D)'s own detector, re-run against the live post-extraction
// catalog, drops seven public names and picks up eight `_core` twins. `match_bank_line` is
// deliberately ABSENT from both lists below: the roster's own query aggregates DISTINCT proname
// over every pg_proc ROW (one row per overload), and `match_bank_line` carries TWO live overloads
// (Annex A.2's footnote 1 — the /6 human arity PR-1a extracts here, and the /7 rule arity PR-3
// drops, untouched by this migration). PR-1a extracts /6 alone, so the bare name survives on the
// UNEXTRACTED /7 overload regardless of what moved out of /6 — a fact about the query's grouping,
// not a claim about which body carries the token. `upsert_account` never matched arm (D) either
// way and needs no entry.
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason every entry above states: PR-1a is
// numbered at merge.
const F_A3_PR1A_CLOCK_NAMES_ADDED = [
  "_add_bank_account_core", "_complete_bank_reconciliation_core", "_match_bank_line_core",
  "_resolve_and_book_bank_line_core", "_resolve_bank_line_exception_core", "_unmatch_bank_match_core",
  "_void_bank_reconciliation_core", "_void_bank_statement_core",
];
const F_A3_PR1A_CLOCK_NAMES_REMOVED = [
  "add_bank_account", "complete_bank_reconciliation", "resolve_and_book_bank_line",
  "resolve_bank_line_exception", "unmatch_bank_match", "void_bank_reconciliation", "void_bank_statement",
];

// F-A3 PR-3 [retirement + parity + doors]: `_confirm_bank_identifier_promotion_core` stamps
// `decided_at = now()` on the accepted proposal row -- a bare timestamptz audit instant, the
// same shape every other confirm/settle core on this roster already carries -- so it MATCHES
// arm (D) and joins. `propose_bank_rule` / `sign_bank_rule` / `retire_bank_rule` (base-roster
// members since 0042) and `match_bank_line` (base-roster member since 0042, kept alive after
// PR-1a's own extraction ONLY by its then-untouched /7 rule-arity overload's own bare token,
// per F_A3_PR1A_CLOCK_NAMES_REMOVED's own comment above) all leave the live catalog or lose
// their last matching overload with PR-3's retirement (Annex I: propose/sign/retire_bank_rule
// DROPPED whole; match_bank_line's /7 DROPPED, leaving only the byte-unmoved /6 wrapper, which
// carries no bare token of its own). MEASURED, not inferred: arm (D)'s own detector, re-run
// against the live post-retirement catalog.
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason every entry above states.
const F_A3_PR3_CLOCK_NAMES_ADDED = ["_confirm_bank_identifier_promotion_core"];
const F_A3_PR3_CLOCK_NAMES_REMOVED = [
  "match_bank_line", "propose_bank_rule", "retire_bank_rule", "sign_bank_rule",
];

// F-A2 PR-1 [the agentic posting lane, `f_a2_posting_core` at whatever number merge claimed]:
// the SEAT for the posting lane's bare-clock cohort, wired and DELIBERATELY EMPTY.
//
// WHY EMPTY RATHER THAN ABSENT, and why empty rather than populated. This roster is compared
// EXACTLY against the live catalog in both directions, so a name listed here that does not flag
// reds the suite just as loudly as a name missing. The battery that ships beside this edit is
// CONTRACT-BLIND — it is written from the design, not from PR-1's migration source — so the one
// thing it must not do is GUESS which of PR-1's new bodies carry a bare clock token. Predicting
// from the design alone: the receipt's `created_at` is a column DEFAULT (which lives in the table
// definition, not a pg_proc body, and correctly does not flag — the 0081/0082 block states the
// same rule), the op-key receipts go through `_finish_op`, and `_approve_entry_core` is ALREADY
// on the base roster and stays there through its 8th body. That predicts ZERO new names.
//
// THE OBLIGATION THIS SEAT CARRIES, so it is not mistaken for a finished edit: at integration,
// re-run arm (D)'s own detector (`S5_25_BARE_TOKEN_RE`, comments stripped) over PR-1's THREE
// files' new bodies and fill this array with whatever it flags, each with its stated lawful
// reason in the shape every block above uses. A flagged name that lands with no reason is a
// finding about the body, not about the roster.
//
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason :207-214 states in full. Wiring the
// gate now — rather than leaving it to be remembered later — is what makes the integration step a
// one-line fill instead of a re-derivation.
const POSTING_F_A2_PR1_CLOCK_NAMES = [];

// F-A6 PR-1 [`f_a6_freeform_read` at whatever number merge claimed]: re-run arm (D) against the
// migration's own bodies (the F-A2 seat's obligation, stated in full above) — two names flag,
// both lawful, neither a date derivation: `_freeform_settle` stamps `settled_at = now()`, the
// same timestamptz shape as every settle stamp already rostered above; `wake_freeform_read`
// reads `clock_timestamp()` to measure WALL-CLOCK ELAPSED TIME for the read's deadline loop
// (design §3.3), an interval measurement that writes no date/timestamptz column. Gated on the
// migration stem, never a number, exactly like every seat above.
const F_A6_FREEFORM_READ_CLOCK_NAMES = ["_freeform_settle", "wake_freeform_read"];

// F-A7 pi [train position 1, `f_a7_pi_additive` at whatever number merge claimed]: the firm-
// question door's two settle verbs and the identifier-promotion card's two settle verbs each
// stamp `settled_at = now()` — a timestamptz audit column, the same shape as
// WITNESS_F_A1_PR3_CLOCK_NAMES's finished_at above — and derive no DATE from the session clock
// anywhere in their bodies. Lawful, and therefore rostered. GATED on the migration's stable
// stem for the same reason its siblings above are: this battery also runs against pre-pi
// frontiers where these four names do not exist yet.
const F_A7_PI_CLOCK_NAMES = [
  "resolve_firm_question", "dismiss_firm_question",
  "confirm_identifier_promotion", "decline_identifier_promotion",
];

// F-A9 PR-0 [the chat token-cap hotfix, `f_a9_chat_token_cap` at whatever number merge
// claimed]: THE FIRST *REVERSE* COHORT ON THIS ROSTER, and the direction is the whole point.
// Every block above ADDS a name once a migration lands. This one SUBTRACTS one:
// clara.begin_chat_turn is on the roster ONLY because of `v_today`
// (`v_today date := (now() at time zone 'UTC')::date`, 0006:930), whose only two uses were
// inside the daily-token-budget refusal that F-A9 PR-0 removes on an owner ruling (law 76,
// "meter, never cap"; TA-P12 = A). Drop the block and the declaration dies with it, so the
// body stops matching arm (D)'s detector — MEASURED, not predicted: the hotfix migration's
// own tail runs this file's detector expression against the recut body and refuses to
// succeed if it still flags.
//
// WHY REVERSE-GATED RATHER THAN JUST DELETED. The roster is an exact set equality in BOTH
// directions, and `db-slice-frontiers` runs this battery against databases pinned at
// 0042-0045 — where begin_chat_turn still carries `v_today` and still flags. An
// unconditional deletion would turn every one of those legs red with a one-name diff that
// says nothing about clock discipline, which is the identical failure mode the 0046/0055/
// 0056/0057/0059/0072 blocks above exist to prevent, just mirrored. It also keeps the census
// honest on THIS frontier: if a future edit reintroduced a bare clock into begin_chat_turn,
// the name would be missing from the expected set and the equality would fail — the roster
// did not stop watching the function, it moved to the other side of the gate.
//
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason B3's and F-A1's blocks state:
// the file is numbered at MERGE, so a `like '0103_%'` gate would silently invert the moment
// the train renumbers — and a silently-wrong roster is exactly the drift arm (D) catches.
const CHAT_TOKEN_CAP_PRE_F_A9_CLOCK_NAMES = ["begin_chat_turn"];

// F-A9 PR-1B [the brake census, `f_a9_pr_1b_brake_census` at whatever number merge claimed]:
// THE SECOND REVERSE COHORT, minted for exactly PR-0's reason and gated exactly PR-0's way.
// clara._reserve_processing_call is on the roster ONLY because of the two
// `now() at time zone 'utc'` reads inside its per-UTC-day PAGE BUDGET — the sum it took
// across document_ingest_reservations and processing_call_reservations before refusing
// CLR18 past `firm_document_limits.pages_per_day`. The owner ruled that gate REMOVE
// (2026-08-23, design §3.3 gate 7; the migration's own author calls the budget the firm's
// vendor spend, so law 76 reaches it), and with the block goes the body's last clock read.
// MEASURED, NOT PREDICTED: the migration's tail runs THIS FILE's detector expression against
// the recut body and refuses to succeed if it still flags.
//
// TWO NEIGHBOURS DELIBERATELY DO NOT MOVE, and both are re-measured by the same tail:
//   * `_settle_processing_call` — PR-1B removes the identical budget from it too (gate 7's
//     back half), but its settle UPDATE still stamps `settled_at=now()`, so it STAYS.
//   * `admit_autodraft_task` — PR-1B removes two spend brakes from it, but `v_today`'s
//     remaining uses (the firm_usage_daily reserve write and autodraft_attempts.usage_date)
//     survive, so it STAYS. Survey §A.5(5) predicted this; the tail measures it.
// GATED ON THE MIGRATION STEM, NEVER A NUMBER — the file is numbered at MERGE.
const PROCESSING_CALL_PRE_F_A9_PR1B_CLOCK_NAMES = ["_reserve_processing_call"];

// F-A3 PR-1b [the bank-agency agent limb, `f_a3_pr1b_agent_limb` at whatever number merge
// claimed]: two genuinely new bodies, neither a rename. `set_bank_agency_hold`'s `now()` is
// the hold row's own `set_at` timestamptz default idiom — the same shape every other human
// writer already on this roster uses. `_tf_bank_agent_proposal_accept`'s `now()` stamps
// `decided_at` on the AFTER INSERT trigger (DDL 6) — the same "the audit stamp is the clock"
// idiom every other `_tf_*` trigger already on this roster carries.
const AGENT_LIMB_F_A3_PR1B_CLOCK_NAMES = ["_tf_bank_agent_proposal_accept", "set_bank_agency_hold"];

// [Wave-F Track A, F-A7 beta, 0126] two genuinely new bodies (measured on the live rig sweep,
// not assumed from the first one's shape). `_agent_file_document_core`'s bare
// `statement_timestamp()` calls gate the authorization window. `wake_reattribute_document`'s bare
// `now()` stamps `retired_at` on its own retire-and-refile path -- the same "the audit stamp is
// the clock" idiom every other core already on this roster carries.
const FILING_VERB_F_A7_BETA_CLOCK_NAMES = ["_agent_file_document_core", "wake_reattribute_document"];

// [F-A7b PR-a, `0142_fa7b_pr_a_client_onboarding_open` -- number claimed at merge prep 2026-08-29]:
// clara.wake_propose_client_onboarding reads statement_timestamp() twice -- the authorization
// liveness check (`a.expires_at > statement_timestamp()`) and the consume stamp
// (`consumed_at = statement_timestamp()`) -- the SAME "the audit/liveness clock is the bare
// token" idiom every other wake wrapper on this roster already carries (wake_file_document's
// own A9/B7 rungs among them). Gated on the migration's stem, not a number, per this file's
// own convention.
const ONBOARDING_OPEN_F_A7B_PR_A_CLOCK_NAMES = ["wake_propose_client_onboarding"];

// [Gate G1, `0133_g1_wake_engine` — number claimed at merge]: ONE genuinely new body.
// clara.set_wake_source_enabled's two `now()` calls stamp enabled_at/disabled_at on the
// registry row it flips — the SAME "the audit stamp is the clock" idiom every other human
// writer already on this roster carries (cancel_agent_task's cancelled_at, set_bank_agency_
// hold's set_at, ...). It derives no DATE from the session clock anywhere in its body: the
// estate-wide switch it writes (clara.wake_engine_sources) carries no date-typed column at
// all, only the two timestamptz audit pairs and a boolean. Lawful, and therefore rostered.
// MEASURED, not inferred: arm (D)'s own detector over this migration's whole surface flags
// this one name and no other of the new/CoR'd bodies — _settle_wake_task, the two trigger
// CoRs (_tf_agent_task_update's own `new.updated_at:=now()` tail and cancel_agent_task's
// `cancelled_at/updated_at = now()` are BYTE-IDENTICAL carryover from their live pre-G1
// bodies, already rostered before this migration existed) and mint_wake_credential's new
// close_prep arm (mint_wake_credential is already rostered for its OTHER per-kind arms'
// identical statement_timestamp() idiom) all carry no NEW clock token this roster does not
// already account for. wake_engine_sources.created_at / wake_engine_task_dead_letters.
// created_at are column DEFAULTS, which live in the table definition rather than a pg_proc
// body and correctly do not flag (the 0081/0082 block's rule, restated).
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason every entry above states: this
// file is numbered at MERGE, and db-slice-frontiers runs this battery against databases
// pinned at earlier frontiers where this function does not exist yet — an unconditional
// entry would red every such leg on a one-name diff that says nothing about clock discipline.
const G1_WAKE_ENGINE_CLOCK_NAMES = ["set_wake_source_enabled"];

// [裁-21 PR-a, `coa_template_pr_a` -- number claimed at merge prep]: exactly TWO of the
// thirteen new bodies carry a bare clock token, MEASURED by re-running arm (D)'s own detector
// over the whole lane surface on the rig, never inferred from the shapes. Both are the SAME
// "the audit stamp is the clock" idiom every other human writer already on this roster carries
// (set_wake_source_enabled's enabled_at, set_bank_agency_hold's set_at, cancel_agent_task's
// cancelled_at):
//   publish_coa_template  -- `published_at = now()` on the draft->published stamp
//   retire_coa_template   -- `retired_at   = now()` on the published->retired stamp
// NEITHER derives a DATE from the session clock, and that is a property of the schema rather
// than of the bodies' discipline: clara.coa_templates carries NO date-typed column at all --
// created_at / published_at / retired_at are timestamptz, and the trim keys are text[]. The
// other eleven bodies are clean on the same detector (the four editor doors, fork, both reads,
// the two ungranted helpers and both freeze triggers -- coa_template_adoptions' proposed_at /
// adopted_at are written by PR-b's doors, not by anything in this PR).
// GATED ON THE MIGRATION STEM, NEVER A NUMBER, for the reason every entry above states: the
// file is numbered at MERGE, and db-slice-frontiers runs this battery against databases pinned
// at earlier frontiers where these two functions do not exist -- an unconditional entry would
// red every such leg on a two-name diff that says nothing about clock discipline.
const COA_TEMPLATE_PR_A_CLOCK_NAMES = ["publish_coa_template", "retire_coa_template"];

// [裁-21 PR-b, `0156_coa_apply_template` -- number CLAIMED (#462 merged UNNUMBERED; #479
// claimed 0156 as the owed follow-up per .claude/rules/db-migrations.md)]: exactly ONE of the
// twelve new bodies carries a bare clock token, MEASURED by re-running arm (D)'s own detector
// over the whole lane surface on the rig, never inferred from the shapes:
//   apply_coa_template -- `adopted_at = now()` on the adoption stamp, in both the move-a-proposal
//                         arm and the human-direct-adoption arm.
// PR-a's own block above PREDICTED this one in as many words ("coa_template_adoptions'
// proposed_at / adopted_at are written by PR-b's doors, not by anything in this PR"), so it is a
// declared cost, not a drift. It is the same "the audit stamp is the clock" idiom every other
// human writer on this roster carries, and it derives no DATE from the session clock: every
// timestamp column on clara.coa_template_adoptions is timestamptz and the relation carries no
// date-typed column at all. The other eleven bodies are clean on the same detector -- the
// additive door, the five reads, the four INVOKER helpers and the plant loop.
//
// THE GATE IS STILL A PAIR (.claude/rules/db-tests.md's succession pattern: a migration STEM
// witness OR a catalog witness, post-armed if EITHER says applied), but the STEM IS NOW THE
// PRIMARY ARM: the migration is numbered (`0156_coa_apply_template.sql`, claimed at #479's
// merge), so `coa_apply_template$` is a real, permanent schema_migrations row on any database
// that has run the merged chain. The catalog witness (clara.coa_template_entity_overrides, a
// SIBLING object of the same migration, never apply_coa_template itself) stays as the succession
// pattern's own defense-in-depth -- it is what let this cell answer correctly for the whole
// window the file shipped UNNUMBERED, and it still covers a rig that hand-applies the file
// pre-merge or a dump taken mid-window. Gating a name on its own existence would make this
// roster tautological for it, so neither arm may be apply_coa_template itself.
const COA_TEMPLATE_PR_B_CLOCK_NAMES = ["apply_coa_template"];

// FS-4 C-2, `0160_checkout_gate_c2_stripe_events` -- number CLAIMED at merge prep 2026-09-01,
// one past the live frontier 0158 (0159 concurrently claimed by another lane's PR): gate on the
// migration's stable stem so an earlier-frontier database that does not have this function does
// not pick up a one-name bare-token roster drift.
const CHECKOUT_GATE_C2_CLOCK_NAMES = ["resolve_stripe_event_problem"];

// FS-4 C-3 is likewise UNNUMBERED until merge. THREE bodies lawfully read the bare timestamp
// clock: open_checkout_intent evaluates a rolling 24-hour rate window; claim_paid_firm stamps the
// registration decision/payment consumption; settle_confirmation_attempt stamps the OTP outcome.
// claim_confirmation_attempt is deliberately absent: attempted_at is a COLUMN DEFAULT and its
// body evaluates relative to the returned attempted_at authority, so prosrc contains no bare clock.
const CHECKOUT_GATE_C3_CLOCK_NAMES = [
  "claim_paid_firm", "open_checkout_intent", "settle_confirmation_attempt",
];

/** The arm (D) roster for the database under test, sorted as the catalog sorts it. */
export async function s5BareTokenRoster(query) {
  const applied = async (pat) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version like '${pat}'`
  )).rows[0].n === 1;
  const appliedStem = async (re) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version ~ '${re}'`
  )).rows[0].n === 1;
  // The CATALOG half of the succession pattern (.claude/rules/db-tests.md): an EXACT
  // schema-qualified relation name, for a migration whose stem cannot be witnessed because it is
  // still UNNUMBERED on the database under test. Not a bare name and not a LIKE.
  const relationExists = async (qualified) => (await query(
    "select to_regclass($1) is not null as ok", [qualified]
  )).rows[0].ok === true;
  const names = [...S5_25_BARE_TOKEN_ROSTER];
  // REVERSE gate, no lower bound -- these eleven are early-born (see the array's own header),
  // so they are expected everywhere the roster reaches UNTIL the cutover retires them.
  if (!(await appliedStem("f_a2_cutover_retirement$"))) names.push(...RULE_MACHINERY_RETIRED_F_A2_PR3_CLOCK_NAMES);
  if (await applied("0046_%")) names.push(...SALES_LANE_0046_CLOCK_NAMES);
  if (await applied("0046_%") && !(await appliedStem("f_a2_cutover_retirement$"))) {
    names.push(...SALES_LANE_0046_RETIRED_F_A2_PR3_CLOCK_NAMES);
  }
  if (await applied("0055_%")) names.push(...CLIENT_FACTS_0055_CLOCK_NAMES);
  if (await applied("0056_%")) names.push(...CLOSE_MODEL_0056_CLOCK_NAMES);
  if (await applied("0057_%")) names.push(...REGISTRY_0057_CLOCK_NAMES);
  if (await applied("0059_%")) names.push(...METRICS_0059_CLOCK_NAMES);
  if (await applied("0072_%")) names.push(...REPORTING_0072_CLOCK_NAMES);
  if (await applied("0081_%")) names.push(...RENDER_0081_CLOCK_NAMES);
  if (await applied("0082_%")) names.push(...RENDER_0082_CLOCK_NAMES);
  if (await applied("0083_%")) names.push(...RENDER_0083_CLOCK_NAMES);
  if (await appliedStem("b3_reopen_ends_on$")) names.push(...B3_REOPEN_CLOCK_NAMES);
  if (await appliedStem("f_a1_writer$")) names.push(...WITNESS_F_A1_CLOCK_NAMES);
  if (await appliedStem("f_a1_cutover$")) names.push(...WITNESS_F_A1_PR3_CLOCK_NAMES);
  if (await appliedStem("f_a1_statements$")) names.push(...STATEMENT_F_A1_PR4_CLOCK_NAMES);
  if (await appliedStem("f_a7_gamma_egress$")) names.push(...F_A7_GAMMA_CLOCK_NAMES);
  if (await appliedStem("f_a2_posting_core$")) names.push(...POSTING_F_A2_PR1_CLOCK_NAMES);
  if (await appliedStem("f_a6_freeform_read$")) names.push(...F_A6_FREEFORM_READ_CLOCK_NAMES);
  if (await appliedStem("f_a7_pi_additive$")) names.push(...F_A7_PI_CLOCK_NAMES);
  if (await appliedStem("f_a5_reporting_agency_pr1$")) names.push(...REPORTING_AGENCY_F_A5_CLOCK_NAMES);
  if (await appliedStem("f_a5b_pr1_sandbox_export$")) names.push(...SANDBOX_EXPORT_F_A5B_PR1_CLOCK_NAMES);
  if (await appliedStem("card1_substitution_seam$")) names.push(...CARD1_SEAM_CLOCK_NAMES);
  if (await appliedStem("binding_proposal_pr_1$")) names.push(...BINDING_PROPOSAL_PR1_CLOCK_NAMES);
  // REVERSE gate — see CHAT_TOKEN_CAP_PRE_F_A9_CLOCK_NAMES. `not applied` pushes the name
  // BACK, so a database at an earlier frontier still expects the clock-reading body it has.
  if (!(await appliedStem("f_a9_chat_token_cap$"))) names.push(...CHAT_TOKEN_CAP_PRE_F_A9_CLOCK_NAMES);
  // REVERSE gate — see PROCESSING_CALL_PRE_F_A9_PR1B_CLOCK_NAMES. Same direction, same reason.
  if (!(await appliedStem("f_a9_pr_1b_brake_census$"))) names.push(...PROCESSING_CALL_PRE_F_A9_PR1B_CLOCK_NAMES);
  if (await appliedStem("f_a3_pr1a_core_extractions$")) {
    names.push(...F_A3_PR1A_CLOCK_NAMES_ADDED);
    for (const n of F_A3_PR1A_CLOCK_NAMES_REMOVED) {
      const i = names.indexOf(n);
      if (i !== -1) names.splice(i, 1);
    }
  }
  if (await appliedStem("f_a3_pr3_retirement_parity_doors$")) {
    names.push(...F_A3_PR3_CLOCK_NAMES_ADDED);
    for (const n of F_A3_PR3_CLOCK_NAMES_REMOVED) {
      const i = names.indexOf(n);
      if (i !== -1) names.splice(i, 1);
    }
  }
  if (await appliedStem("f_a3_pr1b_agent_limb$")) names.push(...AGENT_LIMB_F_A3_PR1B_CLOCK_NAMES);
  if (await appliedStem("f_a7_beta_filing_verb$")) names.push(...FILING_VERB_F_A7_BETA_CLOCK_NAMES);
  if (await appliedStem("f_a4_pr_1b_close_lifecycle$")) {
    // A SWAP, not an addition -- see F_A4_PR1B_CLOCK_NAMES's own header note.
    const i = names.indexOf("abandon_close");
    if (i !== -1) names.splice(i, 1);
    names.push(...F_A4_PR1B_CLOCK_NAMES);
  }
  if (await appliedStem("g1_wake_engine$")) names.push(...G1_WAKE_ENGINE_CLOCK_NAMES);
  if (await appliedStem("f_a4_pr_1c_close_agent_limb$")) names.push(...F_A4_PR1C_CLOCK_NAMES);
  if (await appliedStem("f_a4_pr_2a_prepayment_limb$")) names.push(...F_A4_PR2A_CLOCK_NAMES);
  if (await appliedStem("f_a4_pr_2c_close_chat_lane$")) names.push(...F_A4_PR2C_CLOCK_NAMES);
  if (await appliedStem("p4_tranche1_invite_rbac$")) names.push(...P4T1_CLOCK_NAMES);
  if (await appliedStem("fa7b_pr_a_client_onboarding_open$")) names.push(...ONBOARDING_OPEN_F_A7B_PR_A_CLOCK_NAMES);
  if (await appliedStem("p4_tranche2_registration_operator_alias$")) names.push(...P4T2_CLOCK_NAMES);
  if (await appliedStem("coa_template_pr_a$")) names.push(...COA_TEMPLATE_PR_A_CLOCK_NAMES);
  if (await appliedStem("coa_apply_template$")
      || await relationExists("clara.coa_template_entity_overrides")) {
    names.push(...COA_TEMPLATE_PR_B_CLOCK_NAMES);
  }
  if (await appliedStem("checkout_gate_c2_stripe_events$")) names.push(...CHECKOUT_GATE_C2_CLOCK_NAMES);
  if (await appliedStem("checkout_gate_c3_folded_door$")) names.push(...CHECKOUT_GATE_C3_CLOCK_NAMES);
  return names.sort();
}

// ---------------------------------------------------------------------------
// S5.25 arm (B) — THE Asia/Kuala_Lumpur DUPLICATION ROSTER, frontier-aware for the same
// reason arm (D)'s is (see s5BareTokenRoster above): `db-slice-frontiers` runs this battery
// against databases pinned at 0042-0045, where 0046's bodies do not exist.
//
// 0046 (§7-A) adds ONE name, and it is a DECLARED change rather than a drift.
// clara.preview_ocr_sales_evidence must read the SAME as-of date clara._ocr_sales_floor
// uses, or one advisory can describe two populations across MYT midnight: the floor's cutoff
// is transaction-pinned now(), while clara._book_today() samples statement_timestamp() per
// STATEMENT. So the roster's standing advice — "call the authority instead" — CANNOT be
// followed here, because the authority reads a different clock than the body this verb must
// agree with. Spelling the floor's own expression is the correctness fix, and joining this
// roster is its declared cost. 0046's own tail arm (7) pins the same ten names.
const KL_ROSTER_BASE = [
  "_adj_on_approve", "_adj_run_occurrence_core", "_book_today",
  "ack_compliance_watch", "evaluate_sst_watch", "evaluate_sst_watches_all",
  "record_future_attestation", "reverse_entry",
];
// clara._ocr_sales_floor is BORN AT 0016, not 0046 -- it lawfully needs its own array with
// ONLY the F-A2 PR-3 cutover's upper gate, never a number-keyed lower one (B.3-forbidden: a
// `like '0046_%'` bound would have been wrong on arrival and stays wrong on renumber). RETIRED
// with F-A2 PR-3 (Annex B.1, OQ-3/D36), the same reverse shape RULE_MACHINERY_RETIRED_F_A2_PR3
// _CLOCK_NAMES uses above for arm (D)'s roster.
const KL_ROSTER_RETIRED_F_A2_PR3 = ["_ocr_sales_floor"];
// preview_ocr_sales_evidence: genuinely 0046-born AND retired with F-A2 PR-3 -- a true WINDOW
// name, present only from 0046 until the cutover (unlike _ocr_sales_floor above).
const KL_ROSTER_0046 = ["preview_ocr_sales_evidence"];

// F-A4 PR-1a [close key 1, Window A, `f_a4_pr_1a_measurement_layer` at whatever number merge
// claims]: clara._close_gate_undated spells the same MYT idiom (design close-key-1-design.md
// v2 §3.10 decision (i)) for its `filed_on` bound and payload key. It CANNOT call
// clara._book_today() instead: the authority answers "what MYT date is today", while this body
// needs "what MYT date does THIS document's filed_at timestamp fall on" — a per-row question
// the authority does not answer, exactly the same shape that put _ocr_sales_floor and its
// siblings on this roster rather than through the authority. Declared cost, not drift.
// GATED on the migration's STABLE STEM, never its number — numbers are claimed at merge, and
// this battery also runs against pre-PR-1a chains where the body does not exist yet.
const KL_ROSTER_F_A4_PR1A = ["_close_gate_undated"];

/** The arm (B) duplication roster for the database under test, sorted as the catalog sorts it. */
export async function s5KlDuplicationRoster(query) {
  const applied = async (pat) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version like '${pat}'`
  )).rows[0].n === 1;
  const appliedStem = async (re) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version ~ '${re}'`
  )).rows[0].n === 1;
  const names = [...KL_ROSTER_BASE];
  // _ocr_sales_floor: early-born (0016), no lower gate — reverse-gated only on the cutover.
  if (!(await appliedStem("f_a2_cutover_retirement$"))) names.push(...KL_ROSTER_RETIRED_F_A2_PR3);
  // preview_ocr_sales_evidence: a true WINDOW name, present from 0046 until the cutover.
  if (await applied("0046_%") && !(await appliedStem("f_a2_cutover_retirement$"))) names.push(...KL_ROSTER_0046);
  if (await appliedStem("f_a4_pr_1a_measurement_layer$")) names.push(...KL_ROSTER_F_A4_PR1A);
  return names.sort().join(" ");
}
