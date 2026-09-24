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

// RIDERS WAVE 4, LANE 01 (#949, 0300) — ONE NAME, and it is the case this roster's own
// instruction cannot reach. clara._tenancy_rent_plan_draft DERIVES NO DATE from the zone: it
// passes 'Asia/Kuala_Lumpur' as the p_timezone ARGUMENT of clara.create_accounting_plan, which
// the plan lane requires as a NAME (clara._assert_plan_schedule and
// clara._adj_run_occurrence_core, both already on this roster, are what consume it). There is no
// authority to call instead — clara._book_today() returns a DATE, not a zone — so the standing
// advice "call the authority" cannot be followed and joining the roster is the declared cost,
// the same shape 0046's clara.preview_ocr_sales_evidence carries above. The two bodies of the
// same file that DID spell the conversion (clara._client_reporting_framework and
// clara._tenancy_escalation_state) were corrected to call clara._book_today() instead and are
// deliberately NOT here (fix round, finding SPEC-10).
const KL_ROSTER_0300_TENANCY = ["_tenancy_rent_plan_draft"];

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
  "approve_wrong_client_correction", "bootstrap_client_plan", "cancel_agent_task",
  "cancel_client_onboarding", "cancel_opening_seed", "cancel_pair_reversal", "cancel_seeding_batch", "claim_document_intake_upload",
  "claim_document_processing_task", "classify_document", "commit_client_onboarding", "complete_bank_reconciliation", "complete_coding_task",
  "complete_fixed_asset_particulars", "complete_pending_match", "complete_seeding_batch", "complete_stored_document_task", "confirm_attribution_candidate",
  "consume_egress_dispatch", "create_client", "create_firm", "deactivate_bank_account",
  "deactivate_client_egress_purpose", "dismiss_attribution_candidate", "dismiss_coding_task",
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
  // `sign_adjustment_template` LEFT this base array at #927 (migration 0282) and is now a
  // REVERSE-gated cohort (ADJ_TEMPLATE_DOORS_PRE_0282_CLOCK_NAMES, below), exactly like
  // begin_chat_turn: 0282 recut the body to a bare typed refusal, so it reads no clock any more
  // on a database that has the retirement -- and still does on every `db-slice-frontiers` leg
  // pinned before it, which is why the name is pushed back rather than deleted.
  // `tick_seeding_proposal` left this same line at ticket 1012 (migration 0288) for exactly the
  // same reason and by the same mechanism, into SEEDING_LANE_RETIRED_0288_CLOCK_NAMES below
  // (with its two siblings, which leave from the lines above). The two retirements are
  // independent and BOTH removals stand: this array is the "still stamps a clock" roster, and
  // neither name does any more once its own migration has applied.
  "settle_chat_turn", "settle_ingest_reservation", "sign_bank_rule",
  "sign_depreciation_authority", "sign_vendor_identity_binding", "snooze_compliance_watch",
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
// TWO MORE REVERSE-GATED COHORTS, the exact shape the block above uses: a name that carried a
// bare clock token from early in the estate's life and STOPS carrying one at a named migration.
// Each is pushed back on a database that has not yet applied its migration, so arm (D) stays
// exact at both frontiers and a MISSING name still fails.
//
// (a) #899 [0287_client_birth_wall.sql]. `clara.begin_client_onboarding`'s body was moved into
// the new ungranted `clara._client_birth_core`, which the base roster above carries: the clock
// token went with the body. The door itself is now a thin wrapper with none.
const BIRTH_WALL_0287_MOVED_CLOCK_NAMES = ["begin_client_onboarding"];
// …and the body it moved INTO, born at 0287, so it is forward-gated rather than pushed back.
const BIRTH_WALL_0287_CLOCK_NAMES = ["_client_birth_core"];
// (b) Ticket 1012 [0288_seeding_lane_retired.sql]. All three prior-GL seeding write doors are
// recut to ONE typed refusal (CLR34 `seeding_lane_retired`) that raises before anything else, so
// none of them stamps a timestamp any more -- there is no body left to stamp one. The two
// CLOSERS (cancel_seeding_batch / complete_seeding_batch) are byte-unchanged and stay in the base
// roster above, which is the discriminating half of this edit.
const SEEDING_LANE_RETIRED_0288_CLOCK_NAMES = [
  "create_seeding_batch", "decline_seeding_proposal", "tick_seeding_proposal",
];
// (c) Riders wave 3, lane 04 — THREE FORWARD-GATED NAMES, born with their migration, found at
// integration rather than in the lane (this battery reads the WHOLE catalog, and no lane runs the
// whole estate suite). Each is gated on its OWN stem, so a `db-slice-frontiers` leg pinned below
// it still measures exact.
//
// THE ADJUDICATION, the same one 0046's block below states: arm (D) catches a BARE clock token,
// and a bare token is only a defect when the body derives a DATE from it. All three stamp
// TIMESTAMPTZ columns and nothing else — measured on the live catalog, not read off the file:
// `retired_at`, `superseded_at` and `effective_from` are all `timestamp with time zone`
// (information_schema.columns on clara.fa_account_depreciation_policies and
// clara.fa_arrears_resolutions), so there is no assignment cast to a date column anywhere in
// them. They belong in the roster, not in a fix.
//
// #932 [0277_fa_default_depreciation_policy.sql]: the set door supersedes the live policy row
// (`retired_at = now()`) and stamps the new row's `effective_from = now()`; the retire door
// stamps `retired_at = now()`. 0292 (#932's fix round) pins BOTH bodies as unmoved, so the pair
// reads the same from 0277 onward.
const FA_DEPRECIATION_POLICY_0277_CLOCK_NAMES = [
  "retire_fa_depreciation_policy", "set_fa_depreciation_policy",
];
// #975 [0279_fa_closed_year_arrears.sql]: the record door supersedes the live judgement
// (`superseded_at = now()`). 0293 (#975's fix round) RECUTS this body, and the token survives the
// recut — measured on a database at 0293 — so one forward gate is exact at both frontiers.
const FA_ARREARS_RESOLUTION_0279_CLOCK_NAMES = ["record_fa_arrears_resolution"];

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

// 裁-190 [web reads and small doors]: TWO lawful bare-clock writers, and both are the 0057
// shape — a timestamptz recording WHEN a human acted, landing in no date-typed accounting
// decision and driving no period arithmetic.
//   archive_chat_session         — `archived_at = now()` on the author's own chat session. A
//     one-way visibility stamp on a transcript; nothing reads it as a date.
//   set_counterparty_identifiers — `updated_at = now()` on the counterparty row, which is the
//     column the 0011 trigger has always maintained on every counterparty write (rename and
//     terms are already in this roster for the identical line).
// _book_today() would be a category error here for the reason the 0057 block states: both are
// timestamps of an act that happened, not accounting dates.
//
// FRONTIER-GATED, and here that matters more than usual: these two ship UNNUMBERED until merge
// prep (裁-108), so on every CI chain — and on every `db-slice-frontiers` leg pinned earlier —
// the functions do not exist at all. An unconditional entry would red those legs while saying
// nothing about clock discipline. Gated on the CATALOG rather than a migration stem, because a
// stem does not exist until the number is claimed (review law 3: probe the thing, not a name it
// does not yet have).
const WEB_READS_DOORS_CLOCK_NAMES = ["archive_chat_session", "set_counterparty_identifiers"];

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

// #927 (migration 0282, owner ruling #788: retire the 0045 recurring-adjustment template lane).
// `sign_adjustment_template`'s body became one typed refusal that reads no clock, so the name
// leaves the live roster AT that frontier and not before. REVERSE-gated on the stem for the same
// reason every other cohort here is: a `db-slice-frontiers` leg at 0045 still meets the
// clock-reading body it has, and an unconditional removal would red it.
// The other two doors 0282 closed (`propose_adjustment_template`, `run_adjustment_manual`) were
// never in this roster -- measured, not assumed: neither name appears in the base array above.
const ADJ_TEMPLATE_DOORS_PRE_0282_CLOCK_NAMES = ["sign_adjustment_template"];

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
// THE GATE IS STILL A PAIR (the succession pattern in packages/db/README.md, "Migration and
// deployment behavior": a migration STEM
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

// FS-4 C-3 is live-numbered as 0163. THREE bodies lawfully read the bare timestamp
// clock: open_checkout_intent evaluates a rolling 24-hour rate window; claim_paid_firm stamps the
// registration decision/payment consumption; settle_confirmation_attempt stamps the OTP outcome.
// claim_confirmation_attempt is deliberately absent: attempted_at is a COLUMN DEFAULT and its
// body evaluates relative to the returned attempted_at authority, so prosrc contains no bare clock.
const CHECKOUT_GATE_C3_CLOCK_NAMES = [
  "claim_paid_firm", "open_checkout_intent", "settle_confirmation_attempt",
];

// #623 [0178] — the accounting-work lane. FOUR bodies read a bare timestamptz clock, and every
// one of them stamps an INSTANT, never derives a DATE: `_tf_accounting_work_immutable` sets
// `updated_at` on every lawful Work mutation; `claim_work_run` and `settle_work_run` stamp
// `agent_tasks.updated_at`; `_record_journal_entry_core` stamps `approved_at`, `updated_at` and
// the receipt's `posted_at`. The entry's POSTING DATE is never clock-derived — it is the human's
// own admitted value, carried through as `(basis->>'posting_date')::date`, which is exactly the
// property arm (D) exists to protect.
//
// `_tf_agent_task_insert` and `_tf_agent_task_update` are NOT added: both already sit in the base
// array, and 0178 splices arms into them without introducing a new clock read.
const WORK_JOURNAL_0178_CLOCK_NAMES = [
  "_record_journal_entry_core", "_tf_accounting_work_immutable", "claim_work_run",
  "settle_work_run",
];

// #626 [0179] — personal preferences. ONE body reads a bare timestamptz clock and it stamps an
// INSTANT: `save_my_preferences` sets `user_preferences.updated_at = now()` on every accepted
// PATCH. `get_my_preferences` reads no clock, and the table's own `updated_at default now()` is a
// COLUMN DEFAULT (not prosrc), exactly as the checkout-gate note above records for
// `claim_confirmation_attempt`. No date is ever derived from it.
const USER_PREFERENCES_0179_CLOCK_NAMES = ["save_my_preferences"];

// #629 [0180] — shared Work questions. THREE bodies read a bare timestamptz clock, and every one
// of them stamps or compares an INSTANT rather than deriving a DATE:
//   `open_work_question`        stamps `agent_tasks.updated_at` on the running->awaiting_input
//                               transition and the question's own `expires_at = now() + 14 days`
//                               — the deadline 0006 already spelled this way in
//                               `clara.open_interruption`, restated here because the Work lane
//                               opens its own row rather than calling that verb.
//   `answer_work_question`      compares the deadline with clock_timestamp() AFTER acquiring the
//                               row lock (S4-D5: now() freezes at txn start, so an answer that
//                               waited across the deadline must lose), and stamps `answered_at`.
//   `expire_due_interruptions`  selects rows whose `expires_at < clock_timestamp()`. The cutoff is
//                               the wall clock and takes NO parameter, so there is nothing to
//                               derive a date from either.
// The four read/validate helpers (`get_work_question`, `get_work_pending_question`,
// `_assert_work_question_fields`, `_assert_work_answer`) and the `_tf_work_question_immutable`
// trigger body read NO clock at all — measured with arm (D)'s own detector against the live
// catalog, not assumed from the file's first text. The `date` field kind's values are the HUMAN's
// own typed ISO strings, validated against `^\d{4}-\d{2}-\d{2}$` and a `::date` cast, which is
// exactly the property arm (D) exists to protect.
const WORK_QUESTIONS_0180_CLOCK_NAMES = [
  "answer_work_question", "expire_due_interruptions", "open_work_question",
];
// #634 [0182] — optional and late journal evidence. EXACTLY ONE name, and every other body in the
// migration is measured out rather than omitted. `_tf_entry_evidence_release` is the trigger the
// reviewed release-on-reversal fix installs on `clara.journal_entries.reversed_by`; it stamps
// `entry_evidence_links.released_at = now()` so a reversed entry stops holding its document, and
// it derives no DATE from that instant — the same lawful use every other `_tf_*` on this roster
// makes.
//
// The rest add nothing. `_record_journal_entry_core` is recut but already sits in
// WORK_JOURNAL_0178_CLOCK_NAMES above and its recut introduces no new clock read (the same
// `approved_at`/`updated_at`/`posted_at` stamps). `admit_journal_work` reads no clock before or
// after its recut. `attach_entry_evidence` reads none either: `entry_evidence_links.attached_at`
// is a COLUMN DEFAULT (not prosrc), exactly as the checkout-gate note above records for
// `claim_confirmation_attempt`, and the door derives no DATE from any instant. `list_entry_links`,
// `_journal_document_filed`, `_document_posting_entry`, `_assert_journal_source_refs`,
// `_journal_source_refs_canonical`, `_journal_source_document` and
// `_tf_entry_evidence_link_append_only` are all clock-free.
const JOURNAL_EVIDENCE_0182_CLOCK_NAMES = ["_tf_entry_evidence_release"];

// #630 [0184] — settling admitted operations under cancel / revoke / lock-period races. EXACTLY
// ONE name, and every other body in the migration is measured out rather than omitted.
// `cancel_accounting_work` stamps `agent_tasks.cancelled_at = now()` and returns the same instant
// in its answer — an INSTANT, never a date derived from one, which is the property arm (D) exists
// to protect.
//
// The rest add nothing. `take_over_accounting_work` reads NO clock: it delegates run creation to
// `clara.retry_accounting_work` (already reached through WORK_JOURNAL_0178_CLOCK_NAMES' cohort and
// itself clock-free) and its own writes carry no timestamp — `accounting_work.updated_at` is
// stamped by `_tf_accounting_work_immutable`, which is on this roster already.
// `_tf_accounting_work_initiated_by_default` — the BEFORE INSERT default 0184 actually creates, and
// the name `rig-meta.mjs`'s cohort uses; there is no `_responsible_default`, because the column a
// handover moves is `initiator` itself — is one assignment and no clock. `work_authority_snapshot`
// is a projection. `settle_work_run`, `claim_work_run` and
// `_record_journal_entry_core` are RECUT here but already sit in WORK_JOURNAL_0178_CLOCK_NAMES, and
// none of the three recuts introduces a new clock read (the same `updated_at` / `approved_at` /
// `posted_at` stamps). `_tf_accounting_work_status_mirror` is recut and stays clock-free — its new
// `stopping` and `cancelled` arms are one UPDATE of `status` each.
//
// The three §A0 helpers add nothing either: `_work_cancelled_error` is an immutable jsonb literal,
// `_work_door_ctx` reads memberships and reserves an op key, and `_converge_work_terminal` writes
// `clara.accounting_work`, whose `updated_at` is stamped by `_tf_accounting_work_immutable` — on
// this roster already. §H2's three recuts are OLDER functions and each keeps exactly the clock
// reads it already had: `cancel_agent_task` and `open_work_question` sit in the estate's earlier
// rosters, and `mint_wake_credential` reads `statement_timestamp()` as 0133 left it.
const WORK_CANCEL_0184_CLOCK_NAMES = ["cancel_accounting_work"];

// #621 [0185] -- versioned legal content and acceptance. EXACTLY ONE name, and every other body
// in the migration is measured out rather than omitted.
// `publish_legal_document` samples `now()` ONCE into a local and writes that same instant to both
// `legal_documents.published_at` and (when the caller supplied none) `effective_from`, returning
// it in its receipt. An INSTANT, never a date derived from one -- which is the property arm (D)
// exists to protect -- and sampling once is what makes the stamp, the effective date and the
// answer the same moment.
//
// The rest add nothing. `accept_legal_document` writes NO clock token: `legal_acceptances
// .accepted_at` is a column DEFAULT (`now()`), which lives in pg_attrdef and not in any prosrc,
// and the door reads the stored value back through RETURNING. `get_current_legal_documents` is a
// projection. `_tf_legal_documents_transition` compares columns and stamps nothing. The three
// deprecated wrappers (`sign_dpa`, `get_current_dpa_document`, `get_own_dpa_signature`) delegate
// and project. `open_checkout_intent` and `claim_paid_firm` are RECUT here but already sit in
// CHECKOUT_GATE_C3_CLOCK_NAMES, and neither recut introduces a clock read the 0163 body did not
// already have (the rate window's `now() - interval '24 hours'` and the claim's `decided_at` /
// `consumed_at` stamps are 0163's own). `_tf_checkout_intents_session_stamp` is recut and stays
// clock-free -- it gains two column comparisons and nothing else.
const LEGAL_ACCEPTANCE_0185_CLOCK_NAMES = ["publish_legal_document"];

// #628 [0186] -- checkout convergence. EXACTLY TWO names, and every other body in the migration is
// measured out rather than omitted.
//
// `_tf_checkout_intents_session_stamp` joins this roster and the 0185 note above says it did not,
// which was true of the 0185 recut and is no longer true of this one: 0186 makes the trigger the
// ONLY authority over `clara.checkout_intents.status`, and it writes `new.status_at := now()`
// itself on every transition precisely so that no caller can move a state without moving its
// instant or move the instant without moving the state. `status_at` is a `timestamptz` column --
// an INSTANT, never a date derived from one, which is the property arm (D) exists to protect --
// and there is no date anywhere in the checkout-intent tuple for an assignment cast to reach.
//
// `set_admission_capacity` samples `now()` ONCE into a local and writes that same instant to
// `admission_capacity.updated_at` and into its own receipt, exactly as `publish_legal_document`
// (0185) does with `published_at`: sampling once is what makes the stored stamp and the answer the
// caller is handed the same moment.
//
// TWO MORE ARRIVED WITH #628's REVIEW ROUND, and both are real clock reads rather than bookkeeping:
//   · `_tf_checkout_intents_insert_stamp` (review S6) is the BEFORE INSERT sibling of the stamp
//     wall. It writes `new.status_at := now()` for the same reason the UPDATE wall does -- a
//     newborn intent's instant belongs to the transaction, not to whatever a writer supplied --
//     so it reads the clock in exactly the way its sibling above does.
//   · `apply_stripe_events` (review S5) gained ONE clock read with the processing-timeout arm:
//     `ci.status_at < now() - c_processing_timeout`, the sweep that expires an intent whose
//     terminal asynchronous webhook never arrived. Everything else about the applier still reads
//     no clock -- `stripe_event_applications.applied_at` and the problem queue's `noticed_at` are
//     column DEFAULTS, which live in pg_attrdef and not in any prosrc, and every status move it
//     makes is stamped by the trigger.
//
// The rest add nothing. `cancel_checkout_intent` proposes a status write and lets the trigger stamp
// the instant (which is the whole design). `_admission_capacity_state`, `get_admission_capacity`,
// `get_own_checkout_intent_session` and the re-minted `get_own_checkout_progress` are projections.
// `open_checkout_intent` and `claim_paid_firm` are RECUT here but already sit in
// CHECKOUT_GATE_C3_CLOCK_NAMES, and neither recut introduces a clock read the 0163 body did not
// already have (the rate window's `now() - interval '24 hours'` and the claim's `decided_at` /
// `consumed_at` stamps are 0163's own; #628 adds an advisory lock, a capacity read, an unlocked
// intent resolution, a row lock and two status writes, none of which reads a clock).
const CHECKOUT_CONVERGENCE_0186_CLOCK_NAMES = [
  "_tf_checkout_intents_session_stamp", "_tf_checkout_intents_insert_stamp",
  "apply_stripe_events", "set_admission_capacity",
];

// #644 [0192] -- governed client Knowledge. EXACTLY ONE name, and every other body in the
// migration is measured out rather than omitted.
// `_knowledge_insert_revision` stamps `knowledge_records.superseded_at = now()` on the row a new
// revision supersedes and repeats that same instant in the revision's own `recorded_at` provenance
// object. Both are INSTANTS into timestamptz, never a date derived from one -- the property arm (D)
// exists to protect -- and there is no date anywhere in a knowledge tuple for an assignment cast to
// reach.
//
// The rest add nothing, measured on the live catalog rather than read off the file: the live
// arm-(D) census over 0001..0194 returns exactly this one name out of 0192.
// `knowledge_records.created_at`, `knowledge_keys.created_at` and the map's own stamps are column
// DEFAULTS, which live in pg_attrdef and not in any prosrc -- the same reason the 0185 note above
// gives for `legal_acceptances.accepted_at`. The read doors (`get_knowledge_pack`,
// `list_client_knowledge`, `get_knowledge_record`, `get_knowledge_history`) are projections, and
// every write door delegates its stamp to this one core.
const KNOWLEDGE_RECORDS_0192_CLOCK_NAMES = ["_knowledge_insert_revision"];

// #640 [0193] -- authorised recurring accounting plans. FIVE names, and the five that are NOT here
// are the point of the entry.
//
// EVERY NAME HERE STAMPS AN INSTANT AND DERIVES NO DATE FROM ONE:
//   * `_tf_accounting_plans_immutable` writes `new.updated_at := now()` -- the BEFORE UPDATE stamp
//     wall, the same shape `_tf_checkout_intents_session_stamp` (0186) carries and for the same
//     reason: no caller may move a plan's state without moving its instant.
//   * `end_accounting_plan` (`ended_at`), `pause_accounting_plan` (`paused_at`) and
//     `revise_accounting_plan` (`superseded_at`, on the revision it supersedes) each sample now()
//     ONCE into a timestamptz column, exactly as `publish_legal_document` (0185) does.
//   * `_plan_admit_occurrence` keeps SIX now() reads and not one of them is a date: `admitted_at`,
//     plus the five `'at', now()` entries of the append-only `attempts` jsonb ledger (SHOULD-2).
//     Its one DATE question -- "is this due event due yet?" -- goes through clara._book_today().
//
// THE FIVE THAT LEFT. `_plan_admissible_event`, `_plan_admit_occurrence`'s due gate,
// `request_plan_catch_up`, `preview_accounting_plan` and `list_accounting_plans` each spelled
// `(now() at time zone r.timezone)::date` for the house legal date. That is a second body owning
// one house fact AND a transaction-pinned clock (round-7 finding C), so the fix was the migration's
// rather than this roster's: all five now call clara._book_today(), and four of those names carry
// no bare clock token at all any more. The measurement, not the intention, is what this entry
// records -- the live arm-(D) census over 0001..0194 returns exactly these five out of 0193.
//
// The rest add nothing. `create_accounting_plan`, `resume_accounting_plan`,
// `list_accounting_plan_occurrences`, `get_work_plan_origin`, `wake_due_plan_occurrences` and the
// whole `_plan_*` due-arithmetic family read NO clock: the arithmetic is pure (dates in, dates out)
// and every `created_at` on the three plan relations is a column DEFAULT in pg_attrdef.
const ACCOUNTING_PLANS_0193_CLOCK_NAMES = [
  "_plan_admit_occurrence", "_tf_accounting_plans_immutable", "end_accounting_plan",
  "pause_accounting_plan", "revise_accounting_plan",
];

// #631 [0195] -- model egress authority and the redacted execution trace. EXACTLY ONE name, and
// every other body in the migration is measured out rather than omitted.
// `record_work_execution_trace` defaults the trace row's START INSTANT when the caller supplies
// none: `v_started := coalesce(p_started_at, least(now(), coalesce(p_ended_at, now())))`. Both
// reads are the same sample of an INSTANT into a timestamptz column -- the `least()` exists because
// a client-supplied `ended_at` must never precede a server-defaulted `started_at` -- and there is
// no date anywhere in a trace tuple for an assignment cast to reach. That is arm (D)'s exempt
// shape, the same one `_knowledge_insert_revision` (0192) and `publish_legal_document` (0185)
// carry.
//
// The rest add nothing, measured on the live catalog rather than read off the file: over the full
// 0001..0195 chain the arm-(D) census returns exactly this one name out of 0195, and a direct
// per-body probe of all seven other 0195 functions -- `prepare_work_egress_dispatch`,
// `prune_work_execution_traces`, `restore_client_egress_purpose`, `_accounting_work_egress_live`,
// `_work_egress_event_seq`, `get_work_execution_trace` and
// `_tf_work_execution_trace_append_only` -- finds NO clock read of any kind. The prune's retention
// window arrives as an interval argument; the trace relation's `recorded_at` is a column DEFAULT,
// which lives in pg_attrdef and not in any prosrc (the same reason the 0185 and 0192 notes give);
// the read door and the predicate are projections; and the append-only trigger compares tuples.
const WORK_EGRESS_0195_CLOCK_NAMES = ["record_work_execution_trace"];

// ===========================================================================================
// WAVE 2026-09-15 (0214..0224) - arm (D), EIGHT stem-gated cohorts, FIFTEEN names.
//
// Measured at wave integration on a from-scratch 0001..0224 chain (rigint, 127.0.0.1:55600,
// clara_int), by running arm (D)'s own detector over the live catalog and diffing against this
// roster - not read off the eleven migration files. Every name below stamps or compares an
// INSTANT; the three that ALSO derive an MYT date appear on arm (B)'s roster as well, with their
// adjudication written there rather than duplicated here.
//
// The migrations that add NOTHING to this roster are named rather than omitted, because a silent
// absence is indistinguishable from a missed census: 0219 (#649 client-onboarding facts), 0222
// (#652 accrual adjustments) and 0223 (#653 prepayment amortisation) read no clock token at all
// in any body they create. 0222's and 0223's schedules take their dates from the plan lane's own
// arithmetic (0193), and every `created_at` they add is a column DEFAULT, which lives in
// pg_attrdef and not in any prosrc - the same reason the 0185 and 0192 blocks above give.

// #650 [0214] - `clara.get_client_work_pack` samples ONE instant into a timestamptz local
// (`v_now timestamptz := now()`) and builds both its seven-MYT-date window bounds and its
// `computed_at` from that single sample. The clock read itself is an instant, never a date; the
// date it goes on to derive is arm (B)'s subject, pinned there.
const CLIENT_WORK_PACK_0214_CLOCK_NAMES = ["get_client_work_pack"];

// #647 [0215] - the three counterparty identity READS each carry exactly one clock token, and it
// is the same one in all three: `to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD...')`
// for the envelope's `as_of` string. The value that leaves the body is TEXT a human reads, never a
// date the estate computes with; nothing downstream parses it back. The zone spelling is arm (B)'s
// subject and is pinned there. 0215's writers read NO clock: every `recorded_at` on
// `clara.counterparty_identity_revisions` is a column DEFAULT.
const COUNTERPARTY_IDENTITY_0215_CLOCK_NAMES = [
  "get_counterparty_identity", "list_counterparty_identity", "list_counterparty_merge_corrections",
];

// #639 [0216] - `clara._fa_complete_particulars_core` sets `updated_at = now()` on the register row
// it completes: one sample of an INSTANT into a timestamptz column, arm (D)'s exempt shape. The
// migration's other bodies add none - the lane-agnostic birth trigger (`_tf_fa_acquisition_birth`)
// copies columns and takes its dates from the entry it fires for, and `_fa_acquisition_json` /
// `_fa_acquisition_history` / `_fa_asset_json` / `get_fixed_asset` are projections.
const FA_ACQUISITION_0216_CLOCK_NAMES = ["_fa_complete_particulars_core"];

// #646 [0217] - `clara.dismiss_orphaned_classification_question` stamps `resolved_at = now()` when
// it closes the dead-end question, the same shape every question-resolving door in the estate
// carries. `revise_document_fact`, `list_source_revisions`, `list_source_dependents` and the recut
// `set_document_kind` read no clock: the revision relation's `recorded_at` is a column DEFAULT and
// the two reads are projections.
const DOCUMENT_SOURCE_REVISION_0217_CLOCK_NAMES = ["dismiss_orphaned_classification_question"];

// #648 [0218] - the four firm-setup writers, and all four for one reason: a setup item that moves
// state moves its instant in the same statement. `_firm_setup_bump` (`updated_at`),
// `answer_firm_setup_item` and `defer_firm_setup_item` (`answered_at` + `updated_at`) and
// `commit_firm_setup` (`committed_at`). `clara.get_firm_setup()` - the read - carries no clock at
// all, which is why it is absent here and present in no other roster.
const FIRM_SETUP_0218_CLOCK_NAMES = [
  "_firm_setup_bump", "answer_firm_setup_item", "commit_firm_setup", "defer_firm_setup_item",
];

// #654 [0220] - the two firm-knowledge READS each derive `v_today` from the clock to decide which
// revision is LIVE today. The clock read is arm (D)'s; the MYT conversion is arm (B)'s and is
// adjudicated there. 0220's three guards (`_tf_knowledge_firm_eligibility`,
// `_tf_knowledge_firm_evidence`, `_tf_document_filing_firm_knowledge`) read no clock: they compare
// stored revision state.
const KNOWLEDGE_FIRM_0220_CLOCK_NAMES = ["get_knowledge_applicability", "list_firm_knowledge"];

// #638 [0221] - two bodies, two DIFFERENT lawful shapes, neither a date.
//   * `_assert_claim_basis` passes the instant as the AS-OF ARGUMENT of an existing reader,
//     `clara._adv_enrolment_at(p_client, v_credit, now())` - the same `coalesce(p_at, now())`
//     as-of idiom `_adv_reversal_admission` carries and that the base array's own header records.
//   * `_claim_resolve_claimant` INSERTs the staff-advance enrolment with its `enrolled_at`
//     instant, one sample into a timestamptz column.
// The claim doors themselves add none: the claim relation's `created_at` is a column DEFAULT and
// every posting date comes from the basis the caller stated.
const STAFF_EXPENSE_CLAIMS_0221_CLOCK_NAMES = ["_assert_claim_basis", "_claim_resolve_claimant"];

// #625 [0224] - `clara.preview_invite` COMPARES a stored `expires_at` against the clock
// (`i.status = 'pending' and i.expires_at <= now()`) to fold a lapsed invitation into the
// `expired` outcome. A comparison, not a stamp and not a date; the door writes nothing at all.
const PREVIEW_INVITE_0224_CLOCK_NAMES = ["preview_invite"];
// WAVE 2026-09-15 END

// ===========================================================================================
// WAVE 2026-09-18 (0225..0233) - arm (D), FOUR stem-gated cohorts, THIRTEEN names.
//
// Measured at wave integration on the from-scratch 0001..0233 chain (rigint, 127.0.0.1:55720,
// clara_int) by running arm (D)'s OWN detector over the live catalog and diffing against this
// roster - not read off the nine migration files. ADDITIONS ONLY: the same run reported nothing
// missing, so no name left the roster and none was removed (DECISIONS §6.3).
//
// FIVE OF THE NINE MIGRATIONS ADD NOTHING HERE, and they are named rather than omitted, because a
// silent absence is indistinguishable from a missed census:
//   * 0225 (#655 trade invoices) - five clock reads, none of them new: two are column DEFAULTs
//     (`clara.trade_invoices.created_at`, `clara.trade_invoice_status.recorded_at`), which live in
//     pg_attrdef and not in any prosrc, and the other three are inside
//     `clara._record_journal_entry_core`, RECUT here but already on this roster from 0178.
//   * 0226 (#657 bank-match evidence), 0228 (#656 opening-ledger source) and 0233 (#635 firm
//     commercial settings) read no clock token at all in any body they create.
//   * 0227 (#651 depreciation history) spells the MYT zone three times and `now()` five, and not
//     one of them mints a name: the zone appears in an apply-time backfill UPDATE and in two
//     `comment on` strings (neither reaches `prosrc` or `pg_get_functiondef`), and every `now()`
//     is inside `clara.sign_depreciation_authority`, recut here and on this roster already.

// #636 [0229] - SIX names, and all six for ONE shape: the batch lane moves state and moves its
// instant in the same statement. `cancel_intake_batch` stamps `cancel_requested_at` and
// `cancelled_at`, `sweep_intake_batch_cancellations` stamps `cancelled_at`,
// `set_intake_batch_member_dependency` and the two member stamp triggers stamp `updated_at`.
// `get_intake_batch` is the odd one and the harmless one: it samples ONE instant
// (`v_now timestamptz := now()`) and spends it on `computed_at` alone - no date is derived from it
// anywhere in the body. Its MYT zone spelling is arm (B)'s subject and is adjudicated there.
const INTAKE_BATCHES_0229_CLOCK_NAMES = [
  "_tf_intake_batch_member_intake_stamp", "_tf_intake_batch_member_work_stamp",
  "cancel_intake_batch", "get_intake_batch", "set_intake_batch_member_dependency",
  "sweep_intake_batch_cancellations",
];

// #658 [0230] - THREE names. `list_work_knowledge_reads_for_record` spends its only clock read on
// the envelope's `computed_at`. `retrieve_knowledge` and `record_work_knowledge_read` each default
// an `as_of` DATE from the clock, which is arm (B)'s subject and is adjudicated there; the clock
// read itself is an instant. 0230's other bodies read no clock: the read-set relation's
// `created_at` is a column DEFAULT.
const KNOWLEDGE_RETRIEVAL_0230_CLOCK_NAMES = [
  "list_work_knowledge_reads_for_record", "record_work_knowledge_read", "retrieve_knowledge",
];

// #659 [0231] - ONE name, and it is `get_client_work_pack`'s shape verbatim (0214, above):
// `clara.get_firm_portfolio_pack` samples ONE instant into `v_now timestamptz := now()` and builds
// both its seven-MYT-day window bounds and its `computed_at` from that single sample. The clock
// read is an instant; the date it derives is arm (B)'s subject.
const FIRM_PORTFOLIO_PACK_0231_CLOCK_NAMES = ["get_firm_portfolio_pack"];

// #660 [0232] - THREE names, and the two that were the wave's one unsettled question are now
// SETTLED: DECISIONS 6.4 row 1 ruled the escalation and `get_client_financial_pack` /
// `propose_client_cash_accounts` were RE-POINTED at the house derivation - see their block on arm
// (B)'s roster, which carries the ruling. `publish_client_cash_account_set` derives a date too, as
// the last fallback of an `effective_from`, and keeps its own CLASS 2 reading.
//
// ALL THREE STAY ON THIS ROSTER, and that is the point rather than an oversight: arm (D) detects a
// BARE CLOCK TOKEN, and all three still read `now()` for `computed_at` / the instant they stamp.
// Re-measured on the from-scratch 0001..0233 chain after the 6.4 fix: 0/0 in both directions, so
// the ratchet is unmoved and this is a reclassification, not a removal. Here on arm (D) the
// reading is the ordinary one in all three: the token itself is an instant, sampled once. The
// delegate the two reads now call, `clara.book_today()`, adds NO name to either arm - it reads no
// clock token and spells no zone, because it only delegates to `clara._book_today()`, which this
// arm exempts by name.
const CLIENT_FINANCIAL_PACK_0232_CLOCK_NAMES = [
  "get_client_financial_pack", "propose_client_cash_accounts", "publish_client_cash_account_set",
];
// #1000 [0320] - THE SAME THREE READINGS, ONE OF THEM UNDER A NEW NAME, and it is a MOVE rather
// than an addition. 0320 lifted `clara.get_client_financial_pack`'s body byte for byte into
// `clara._client_financial_pack_core` so the chat lane could reach ONE definition through its own
// audited wake wrapper instead of a second copy; the door it left behind resolves its caller
// through `clara._human_ctx` and delegates, and carries no clock token at all. `v_now
// timestamptz := now()` - the SAMPLED INSTANT this arm reads, unchanged in reading and unchanged
// in text - travelled with the body. The other two names are untouched by 0320 and stay exactly
// as the block above describes them. The swap is REVERSE-GATED on 0320's own stem, the shape
// KL_ROSTER_0223_PREPAYMENT already uses for 0307's identical extraction, so a `db-slice-frontiers`
// chain that carries 0232 and not 0320 still pins the door.
const CLIENT_FINANCIAL_PACK_WAKE_0320_CLOCK_NAMES = [
  "_client_financial_pack_core", "propose_client_cash_accounts", "publish_client_cash_account_set",
];
// WAVE 2026-09-18 END

// RIDER #1008 [0234, the platform's legal enforcement mode] — ONE name, and it is
// `clara.set_admission_capacity`'s own shape carried forward: `set_legal_enforcement_mode` samples
// `now()` ONCE into a local and writes that same instant to `legal_enforcement.updated_at` and into
// its own receipt, exactly as 0186's capacity door does with `admission_capacity.updated_at` and as
// 0185's `publish_legal_document` does with `published_at`. Sampling once is what makes the stored
// stamp and the answer the caller is handed the same moment; sampling twice would let a receipt
// name an instant the row does not carry.
//
// 0234's OTHER bodies add nothing, and that is measured rather than assumed. `_legal_enforcement_mode`
// and `get_legal_enforcement_mode` are projections of the stored row. The four RECUT bodies
// (`_accounting_work_egress_live`, `prepare_egress_dispatch`, `restore_client_egress_purpose`,
// `get_firm_legal_standing`) gain no clock token: prepare's `clock_timestamp()` pair is 0038's own
// dispatch TTL, carried through the splice byte-for-byte and already adjudicated on its own file's
// roster, and the other three read none at all.
const LEGAL_ENFORCEMENT_0234_CLOCK_NAMES = ["set_legal_enforcement_mode"];

// RIDER #912 [0243, the role at the instant of a governed act] — ONE name, and it is a TRIGGER
// body: `clara._tf_audit_actor_role` stamps `clara.audit_log.actor_role` BEFORE INSERT, and its
// first statement is `if new.at is null or new.at < now() then return new; end if;` — a bare
// `now()`, no `::date`, no zone. Arm (D)'s reading is the ordinary one: the token is an INSTANT,
// compared against the row's own `at` (itself a `now()` column DEFAULT) to tell an act happening
// in this transaction apart from history being re-loaded by a restore. It derives no DATE, so it
// adds nothing to arm (B), and it spells no zone.
//
// `now()` is the RIGHT clock here, not `clock_timestamp()` or `statement_timestamp()`: the
// comparison's whole job is "is this row part of THIS transaction", and `at`'s own DEFAULT is the
// transaction clock. A statement clock on one side and a transaction clock on the other would
// make an ordinary multi-statement door's audit row look like history.
//
// 0243's OTHER change adds no name: `clara.list_firm_knowledge` is RECUT, but the one key it
// gains reads `clara.audit_log`, not a clock, and the body's existing `now() at time zone
// 'Asia/Kuala_Lumpur'` is 0220's own, already adjudicated on KNOWLEDGE_FIRM_0220_CLOCK_NAMES.
// `clara._audit` is NOT recut at all (it is a frozen metric-input-producer member).
const AUDIT_ACTOR_ROLE_0243_CLOCK_NAMES = ["_tf_audit_actor_role"];

// RIDERS WAVE 2, arm (D) — FOUR MORE NAMES, one per migration, each adjudicated on the same
// question this roster always asks: does the body derive a DATE from the session clock, or does
// it merely STAMP an instant? All four stamp. They are listed here in migration order (0235,
// 0244, 0254, 0259) even though 0243's cohort above is numerically between two of them: the
// cohorts are stem-gated, never number-gated, so their source order is documentation.
//
// Each was measured on the integrated wave-2 chain (0001..0272, from-scratch, 2026-09-20).
// Each would have reddened arm (D) on its OWN lane's database too: no lane runs
// x42b2-s5c-clock.test.mjs, so four independent lanes shipped an un-rostered name and the
// integration run is where all four surfaced at once.

// #1014 [0235] — `clara._lock_document_binding` gains `claimed_at = now()` on the ON CONFLICT
// arm of the binding claim. A TIMESTAMPTZ stamp on the claim row, compared against nothing and
// truncated to no date; the body carried no clock token at all at 0197, where it was born.
const OPENING_BINDING_CLAIM_0235_CLOCK_NAMES = ["_lock_document_binding"];

// #846 [0244] — `clara._tf_document_capabilities_high_water_record` stamps `recorded_at = now()`
// on the high-water mark it records. An INSTANT on an append-only watermark row; the monotonicity
// it guards is compared between two stored `recorded_at` values, never against a derived date.
const DOCUMENT_CAPABILITY_HIGH_WATER_0244_CLOCK_NAMES = ["_tf_document_capabilities_high_water_record"];

// #965 [0254] — `clara.create_document_intake`'s new CLR18 refusal arm takes `v_at := now()` and
// stamps the committed refusal record with it. An INSTANT on the refusal row. The ceiling the arm
// reports on is computed by `clara._reserve_document_ingest`, which owns the MYT day boundary and
// is rostered for it on arm (B) (KL_ROSTER_0252_DOCUMENT_INGEST_WINDOW below); this body derives
// no boundary of its own.
const INTAKE_REFUSAL_RECORD_0254_CLOCK_NAMES = ["create_document_intake"];

// #935 [0259] — `clara.dismiss_firm_setup_tip` stamps `answered_at = now(), updated_at = now()`
// on the plan item it dismisses. Two INSTANTS on a setup row; no date, no zone, nothing reaching
// a ledger.
const FIRM_SETUP_EDUCATION_TIPS_0259_CLOCK_NAMES = ["dismiss_firm_setup_tip"];

// #624 [0191] and #643 [0194] add NO name, and that is MEASURED rather than assumed: the live
// arm-(D) census over 0001..0194 returns nothing out of either file. 0191's three constraint
// triggers derive their verdicts from stored terms and stamp `evaluated_at` through a column
// DEFAULT; 0194's `_adj_*` bodies either sit on this roster already (`_adj_run_occurrence_core`)
// or take their dates from the period arithmetic they are handed.

// RIDERS WAVE 4, LANE 01 (0296..0300, #945/#946/#947/#948/#949) — NINE NAMES, and every one of
// them reads a bare `now()` as an INSTANT stamped on a row, never as a date the books turn on.
// The ledger date these bodies post on is read from the document or handed to them; where one of
// them needed today's legal date it calls clara._book_today() (fix round, finding SPEC-10 — two
// bodies spelled the conversion and were corrected rather than rostered).
//   · persist_payroll_facts / fail_payroll_facts (0296) and persist_agreement_facts /
//     fail_agreement_facts (0299) — the four lane-settling doors, stamping settled_at/failed_at
//     on a processing task and the extraction rows they write.
//   · _post_payroll_run (0297) and _post_agreement_acquisition (0299) — the two unattended
//     posts: approved_at/updated_at on the entry they flip. The POSTING DATE is the page's own.
//   · _settle_payroll_net_pay_core (0298) and _settle_rent_payable_core (0300) — the two human
//     accept acts: approved_at/updated_at again. The posting date is the BANK LINE's entry_date.
//   · record_contract_terms (0300) — recorded_at/superseded_at on an append-only term row.
const PAYROLL_FACTS_0296_CLOCK_NAMES = ["fail_payroll_facts", "persist_payroll_facts"];
const PAYROLL_POSTING_0297_CLOCK_NAMES = ["_post_payroll_run"];
const PAYROLL_SETTLEMENT_0298_CLOCK_NAMES = ["_settle_payroll_net_pay_core"];
const AGREEMENT_0299_CLOCK_NAMES = [
  "_post_agreement_acquisition", "fail_agreement_facts", "persist_agreement_facts",
];
const TENANCY_0300_CLOCK_NAMES = ["_settle_rent_payable_core", "record_contract_terms"];

// RIDERS WAVE 4, LANES 03/04/05 (0302, 0305, 0306, 0309, 0317) — SEVEN NAMES.
//
// THE ADJUDICATION, AND WHY IT NEEDED MORE THAN WAVE 3'S. Arm (D) catches a BARE clock token, and
// a bare token is only a defect where the body derives a DATE from it — so wave 3's three doors
// were cleared by the cheap proof that every column they stamp is TIMESTAMPTZ. That proof is NOT
// available by inspection here: five of these seven write relations that carry DATE columns as
// well as timestamptz ones (`prepayment_schedules.term_start/term_end`,
// `prepayment_stated_terms.period_start/period_end`,
// `revenue_recognition_schedules.term_start/term_end`,
// `accounting_plan_occurrences.due_date/period_key`). Each body was therefore read on a live
// 309-file catalog, twice: once for EVERY line carrying a clock token, and once for every
// DATE-typed local it declares. The two lists are disjoint in all seven — which is exactly the
// assignment-cast shape arm (D) exists to catch, absent — and every clock read lands on a
// timestamptz target:
//
//   door (migration, ticket)                         its ONE clock line        the date it writes
//   ------------------------------------------------ ------------------------- ------------------
//   skip_plan_occurrence (0302, #938)                jsonb 'at' key            due_date/period_key
//     from clara._plan_due_nth(r.effective_from, …) and clara._plan_occurrence_period_key(
//     p.authority_from, r.effective_from, …) — the plan lane's own arithmetic over the plan's
//     authority floor and the revision's effective_from. The clock reaches the audit state only.
//   record_prepayment_stated_term (0305, #939)       superseded_at = now()     period_start/_end
//     are the door's OWN ARGUMENTS: the two dates the PERSON states. Declares no date local.
//   enrol_prepayment_account (0306, #940)            retired_at = now()        — none —
//   retire_prepayment_account (0306, #940)           retired_at = now()        — none —
//     (the enrolment door retires a superseded profile of the same account on its way in, which
//     is why BOTH doors carry the stamp). prepayment_account_enrolments carries NO date column.
//   preview_invite_by_token (0309, #871)             v_now := now()            — none —
//     `v_now` is declared `timestamptz` and is only ever compared with `attempted_at`
//     (timestamptz) across the 15-minute rate window, and with `i.expires_at`. The read is STABLE
//     and invite_preview_attempts carries no date column.
//   replace_prepayment_schedule (0317, #939 AC4)     superseded_at = now()     term_start/term_end
//   replace_revenue_recognition_schedule (0317, #941 AC3)  superseded_at = now()  term_start/_end
//     The ONLY two bodies here that declare date locals (`v_new_start`, `v_new_end`), and neither
//     name appears on a clock line: they are assigned from `(v_corr ->> 'live_start')::date`,
//     `(v_corr ->> 'live_end')::date` and `(v_rem ->> 'next_start')::date` — the CORRECTED TERM
//     and the predecessor's remaining periods.
//
// So no clock read reaches a date column in any of the seven, no date local is fed from a clock
// read, and the house legal date is not owed here: none of these bodies answers "what is today".
// A body that later did would call clara._book_today() and belong on the arm (B) roster instead.
const ACCRUAL_BILL_CONFLICT_0302_CLOCK_NAMES = ["skip_plan_occurrence"];
const PREPAYMENT_STATED_TERM_0305_CLOCK_NAMES = ["record_prepayment_stated_term"];
const PREPAYMENT_ACCOUNT_ROSTER_0306_CLOCK_NAMES = [
  "enrol_prepayment_account", "retire_prepayment_account",
];
const INVITE_PREVIEW_0309_CLOCK_NAMES = ["preview_invite_by_token"];
const SCHEDULE_CORRECTION_0317_CLOCK_NAMES = [
  "replace_prepayment_schedule", "replace_revenue_recognition_schedule",
];

// #720 [0198, chat-clarify expiry] — ADDS NO NAME AND MOVES NONE, and that is MEASURED rather than
// assumed: 0198 creates no body at all. It RECUTS exactly one, `clara.expire_due_interruptions`,
// which already sits on WORK_QUESTIONS_0180_CLOCK_NAMES above, and the recut deletes a predicate
// (`and work_id is not null`) without touching the clock read — the cutoff is still the same bare
// `expires_at < clock_timestamp()` the 0180 block's own note records, still parameterless, still
// deriving no DATE from that instant. The name therefore stays on the 0180 roster under the
// `work_questions$` gate and needs no gate of its own: a database carrying 0198 carries 0180 by
// construction (0198's §0 prestate refuses to apply otherwise), so the two can never disagree.
// Verified against the live arm-(D) census on a from-scratch 0001..0198 chain, 2026-09-14.
// #720 END

/** The arm (D) roster for the database under test, sorted as the catalog sorts it. */
export async function s5BareTokenRoster(query) {
  const applied = async (pat) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version like '${pat}'`
  )).rows[0].n === 1;
  const appliedStem = async (re) => (await query(
    `select count(*)::int as n from clara.schema_migrations where version ~ '${re}'`
  )).rows[0].n === 1;
  // The CATALOG half of the succession pattern (packages/db/README.md, "Migration and
  // deployment behavior"): an EXACT
  // schema-qualified relation name, for a migration whose stem cannot be witnessed because it is
  // still UNNUMBERED on the database under test. Not a bare name and not a LIKE.
  const relationExists = async (qualified) => (await query(
    "select to_regclass($1) is not null as ok", [qualified]
  )).rows[0].ok === true;
  const names = [...S5_25_BARE_TOKEN_ROSTER];
  // REVERSE gate, no lower bound -- these eleven are early-born (see the array's own header),
  // so they are expected everywhere the roster reaches UNTIL the cutover retires them.
  if (!(await appliedStem("f_a2_cutover_retirement$"))) names.push(...RULE_MACHINERY_RETIRED_F_A2_PR3_CLOCK_NAMES);
  if (await appliedStem("client_birth_wall$")) names.push(...BIRTH_WALL_0287_CLOCK_NAMES);
  else names.push(...BIRTH_WALL_0287_MOVED_CLOCK_NAMES);
  if (!(await appliedStem("seeding_lane_retired$"))) names.push(...SEEDING_LANE_RETIRED_0288_CLOCK_NAMES);
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
  // REVERSE gate — see ADJ_TEMPLATE_DOORS_PRE_0282_CLOCK_NAMES (#927). Same direction, same reason.
  if (!(await appliedStem("retire_adjustment_template_doors$"))) {
    names.push(...ADJ_TEMPLATE_DOORS_PRE_0282_CLOCK_NAMES);
  }
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
  // 裁-190: catalog-gated, not stem-gated — the cohort is UNNUMBERED until merge prep, so it has
  // no stem to witness yet. The probe is an EXACT signature via to_regprocedure rather than a
  // relation, because both names ARE functions and a bare name would not survive an overload
  // (review law 3). Its sibling `clara.firm_timeline_visible` would work too; the door is
  // probed instead so the witness and the subject are the same kind of thing.
  const procExists = async (sig) => (await query(
    "select to_regprocedure($1) is not null as ok", [sig]
  )).rows[0].ok === true;
  if (await procExists("clara.archive_chat_session(uuid,text)")) {
    names.push(...WEB_READS_DOORS_CLOCK_NAMES);
  }
  if (await appliedStem("accounting_work_journal_successor$")) {
    names.push(...WORK_JOURNAL_0178_CLOCK_NAMES);
  }
  if (await appliedStem("user_preferences$")) names.push(...USER_PREFERENCES_0179_CLOCK_NAMES);
  if (await appliedStem("work_questions$")) names.push(...WORK_QUESTIONS_0180_CLOCK_NAMES);
  if (await appliedStem("journal_work_evidence$")) names.push(...JOURNAL_EVIDENCE_0182_CLOCK_NAMES);
  if (await appliedStem("work_cancel_ordering$")) names.push(...WORK_CANCEL_0184_CLOCK_NAMES);
  if (await appliedStem("legal_acceptance$")) names.push(...LEGAL_ACCEPTANCE_0185_CLOCK_NAMES);
  if (await appliedStem("checkout_convergence$")) names.push(...CHECKOUT_CONVERGENCE_0186_CLOCK_NAMES);
  if (await appliedStem("client_knowledge_records$")) names.push(...KNOWLEDGE_RECORDS_0192_CLOCK_NAMES);
  if (await appliedStem("accounting_plans$")) names.push(...ACCOUNTING_PLANS_0193_CLOCK_NAMES);
  if (await appliedStem("work_egress_purpose_and_execution_trace$")) names.push(...WORK_EGRESS_0195_CLOCK_NAMES);
  // WAVE 2026-09-15 (0214..0224) - stem-gated, never number-gated, for the reason :207-214 gives.
  if (await appliedStem("client_work_pack$")) names.push(...CLIENT_WORK_PACK_0214_CLOCK_NAMES);
  if (await appliedStem("counterparty_identity_provenance$")) names.push(...COUNTERPARTY_IDENTITY_0215_CLOCK_NAMES);
  if (await appliedStem("fixed_asset_acquisition$")) names.push(...FA_ACQUISITION_0216_CLOCK_NAMES);
  if (await appliedStem("document_source_revision$")) names.push(...DOCUMENT_SOURCE_REVISION_0217_CLOCK_NAMES);
  if (await appliedStem("firm_setup$")) names.push(...FIRM_SETUP_0218_CLOCK_NAMES);
  if (await appliedStem("firm_knowledge_defaults$")) names.push(...KNOWLEDGE_FIRM_0220_CLOCK_NAMES);
  if (await appliedStem("staff_expense_claims$")) names.push(...STAFF_EXPENSE_CLAIMS_0221_CLOCK_NAMES);
  if (await appliedStem("preview_invite$")) names.push(...PREVIEW_INVITE_0224_CLOCK_NAMES);
  // WAVE 2026-09-18 (0225..0233) - stem-gated, never number-gated, for the reason :207-214 gives.
  if (await appliedStem("intake_batches$")) names.push(...INTAKE_BATCHES_0229_CLOCK_NAMES);
  if (await appliedStem("knowledge_retrieval$")) names.push(...KNOWLEDGE_RETRIEVAL_0230_CLOCK_NAMES);
  if (await appliedStem("firm_portfolio_pack$")) names.push(...FIRM_PORTFOLIO_PACK_0231_CLOCK_NAMES);
  // #1000 [0320] — reverse-gated, the KL_ROSTER_0223_PREPAYMENT shape: the pack's body moved into
  // its core, so above 0320 the CORE carries the sampled instant and the door carries nothing.
  if (await appliedStem("client_financial_pack$")) {
    if (await appliedStem("client_financial_pack_wake_read$")) {
      names.push(...CLIENT_FINANCIAL_PACK_WAKE_0320_CLOCK_NAMES);
    } else {
      names.push(...CLIENT_FINANCIAL_PACK_0232_CLOCK_NAMES);
    }
  }
  // RIDER #1008 (0234) - stem-gated, never number-gated, for the reason :207-214 gives.
  if (await appliedStem("legal_enforcement_mode$")) names.push(...LEGAL_ENFORCEMENT_0234_CLOCK_NAMES);
  // RIDER #912 (0243) - stem-gated, never number-gated, for the reason :207-214 gives.
  if (await appliedStem("audit_actor_role$")) names.push(...AUDIT_ACTOR_ROLE_0243_CLOCK_NAMES);
  // RIDERS WAVE 2 (0235, 0244, 0254, 0259) - stem-gated, never number-gated, same reason.
  if (await appliedStem("opening_binding_claim$")) names.push(...OPENING_BINDING_CLAIM_0235_CLOCK_NAMES);
  if (await appliedStem("document_capability_version_high_water$")) {
    names.push(...DOCUMENT_CAPABILITY_HIGH_WATER_0244_CLOCK_NAMES);
  }
  if (await appliedStem("intake_refusal_record$")) names.push(...INTAKE_REFUSAL_RECORD_0254_CLOCK_NAMES);
  if (await appliedStem("firm_setup_education_tips$")) {
    names.push(...FIRM_SETUP_EDUCATION_TIPS_0259_CLOCK_NAMES);
  }
  // RIDERS WAVE 3, lane 04 (0277, 0279) - stem-gated, never number-gated, for the reason
  // :207-214 gives, and doubly so here: 0277's and 0279's own fix-round siblings were RENUMBERED
  // to 0292/0293 at merge, which a number gate would not have survived.
  if (await appliedStem("fa_default_depreciation_policy$")) {
    names.push(...FA_DEPRECIATION_POLICY_0277_CLOCK_NAMES);
  }
  if (await appliedStem("fa_closed_year_arrears$")) {
    names.push(...FA_ARREARS_RESOLUTION_0279_CLOCK_NAMES);
  }
  // RIDERS WAVE 4, lane 01 (0296..0300) - stem-gated, never number-gated, for the reason
  // :207-214 gives. See the five arrays' shared header above for what each body stamps.
  if (await appliedStem("payroll_summary_typed_facts$")) names.push(...PAYROLL_FACTS_0296_CLOCK_NAMES);
  if (await appliedStem("payroll_summary_posting$")) names.push(...PAYROLL_POSTING_0297_CLOCK_NAMES);
  if (await appliedStem("payroll_net_pay_settlement$")) names.push(...PAYROLL_SETTLEMENT_0298_CLOCK_NAMES);
  if (await appliedStem("agreement_contract_acquisition$")) names.push(...AGREEMENT_0299_CLOCK_NAMES);
  if (await appliedStem("tenancy_terms_rent_plan$")) names.push(...TENANCY_0300_CLOCK_NAMES);
  // RIDERS WAVE 4, lanes 03/04/05 (0302, 0305, 0306, 0309, 0317) - stem-gated, never
  // number-gated, for the reason :207-214 gives; doubly so for 0317, whose number was contested
  // at integration (lane 06's fix-round file moved to 0318 so this one could keep it).
  if (await appliedStem("accrual_bill_conflict$")) names.push(...ACCRUAL_BILL_CONFLICT_0302_CLOCK_NAMES);
  if (await appliedStem("prepayment_stated_term$")) names.push(...PREPAYMENT_STATED_TERM_0305_CLOCK_NAMES);
  if (await appliedStem("prepayment_account_roster$")) names.push(...PREPAYMENT_ACCOUNT_ROSTER_0306_CLOCK_NAMES);
  if (await appliedStem("invite_preview_public_door$")) names.push(...INVITE_PREVIEW_0309_CLOCK_NAMES);
  if (await appliedStem("schedule_term_correction$")) names.push(...SCHEDULE_CORRECTION_0317_CLOCK_NAMES);
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

// DB-A [H-55, `close_gate_bank_enrolment` at whatever number merge claims]:
// clara._bank_enrolled_fy_months spells the same MYT idiom for the account window it derives.
// IT CANNOT CALL clara._book_today() EITHER, and for the identical reason _close_gate_undated
// cannot: the authority answers "what MYT date is today", while this body needs "what MYT month
// does THIS bank account's created_at / deactivated_at timestamp fall in" — a per-row question
// the authority does not answer. Taking the conversion in the SESSION time zone instead is the
// defect arm (A) of this very census exists to catch, and it would make measured_digest read
// differently from a different connection, so there is no third option. Declared cost, not drift.
//
// GATED ON A CATALOG WITNESS, not a migration stem: the body itself, probed at its EXACT
// SIGNATURE (law 3 — a bare name is a projection of the thing, not the thing). That survives the
// number claimed at merge AND a file rename, and it keeps the roster and the catalog in exact
// agreement by construction: the name is expected on this roster precisely when the body exists.
const KL_ROSTER_DBA_BANK_ENROLMENT = ["_bank_enrolled_fy_months"];

// #640 [0193] -- clara._assert_plan_schedule. THE ONE NAME 0193 ADDS HERE, and it is on this
// roster for a reason arm (B)'s own standing advice cannot serve.
//
// IT DERIVES NO DATE. Measured: the body is a VALIDATOR -- it compares the `frequency`, `day_rule`,
// `day_of_month`, `timezone`, `effective_from`/`effective_to` and `reversal_day_rule` a CALLER sent
// against the plan lane's closed vocabularies and raises a typed CLR10 naming the field the form
// must focus. The timezone arm spells `Asia/Kuala_Lumpur` twice -- once as the comparison and once
// in the sentence the professional reads -- because `accounting_plan_revisions.timezone` is a
// one-member CHECK and this is where a caller is told so BY NAME. Arm (B)'s law is that a new name
// is a second body owning the house legal DATE; this body owns no date, and the detector
// (`like '%asia/kuala_lumpur%'`) cannot tell a spelled CONVERSION from a spelled ZONE NAME.
//
// IT CANNOT CALL clara._book_today() INSTEAD: the authority answers "what MYT date is today", while
// this body asks "is the zone this caller wrote down the house's" -- a question about a NAME, which
// the authority answers not at all. That is the identical shape that put _close_gate_undated and
// _bank_enrolled_fy_months on this roster rather than through the authority (see their own blocks
// above). Declared cost, not drift.
//
// AND THE ARITHMETIC WENT THE OTHER WAY, which is what makes this pin narrow rather than a
// widening: 0193's first cut ALSO spelled `(now() at time zone r.timezone)::date` at five sites for
// the house legal date. Those WERE a second body owning one house fact, so they were recut to
// clara._book_today() rather than rostered. 0193 now spells the zone in exactly one body, and that
// body computes nothing.
//
// GATED ON THE MIGRATION'S STABLE STEM, never its number -- numbers are claimed at merge, and
// `db-slice-frontiers` runs this battery against chains that predate the plan lane.
const KL_ROSTER_0193_PLANS = ["_assert_plan_schedule"];

// ===========================================================================================
// WAVE 2026-09-15 (0214..0224) - arm (B), FOUR stem-gated cohorts, SEVEN names, measured on a
// from-scratch 0001..0224 chain at wave integration. Two classes, kept apart on purpose.
//
// CLASS 1 - THE ZONE AS A NAME, no date derived. `_assert_plan_schedule`'s case above, exactly.
// CLASS 2 - A READ-SIDE MYT DATE. Three read doors spell `(now() at time zone
//   'Asia/Kuala_Lumpur')::date` for "which rows are live/recent TODAY". Arm (B)'s standing advice
//   is "call clara._book_today() instead", and these three are NOT exempt from it the way
//   `_close_gate_undated` and `_bank_enrolled_fy_months` are (those ask a per-ROW question the
//   authority does not answer). They are pinned rather than recut, and the reason is stated so the
//   next reader can overturn it: none of the three is a MONEY date - no posting date, no period
//   bound, nothing that reaches a ledger row - and `get_client_work_pack` in particular would be
//   made WORSE by the authority, because its window bounds and its date come from ONE sampled
//   instant while `clara._book_today()` samples `statement_timestamp()` per statement, so a call
//   straddling MYT midnight would describe two populations (`preview_ocr_sales_evidence`'s case,
//   see KL_ROSTER_0046 above). A follow-up issue carries the question for the two knowledge reads,
//   where the argument is weaker. Pinned WITH the reason, not folded in silently.

// #650 [0214] - CLASS 2. `clara.get_client_work_pack` derives `v_today` and the two half-open
// bounds of its seven-MYT-date recent-success window from one `now()` sample, and names the zone a
// fourth time as the `timezone` key of the envelope it returns (so the face states the calendar it
// counted in rather than assuming one).
const KL_ROSTER_0214_WORK_PACK = ["get_client_work_pack"];

// #647 [0215] - CLASS 1. The three identity reads spell the zone inside
// `to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS')`, a DISPLAY
// conversion producing the envelope's `as_of` TEXT. No date value exists in any of the three
// bodies for the house authority to own, and `clara._book_today()` answers a date rather than a
// formatted instant, so the standing advice does not apply here at all.
const KL_ROSTER_0215_COUNTERPARTY_IDENTITY = [
  "get_counterparty_identity", "list_counterparty_identity", "list_counterparty_merge_corrections",
];

// #654 [0220] - CLASS 2, the weaker half. `clara.list_firm_knowledge()` and
// `clara.get_knowledge_applicability` each take `v_today` to select the revision live today; the
// web form's default effective date is read from the second. Both are STABLE read doors that write
// nothing.
const KL_ROSTER_0220_FIRM_KNOWLEDGE = ["get_knowledge_applicability", "list_firm_knowledge"];

// #653 [0223] - CLASS 1. `clara.create_prepayment_schedule` spells the zone twice and computes no
// date from either: once as the `p_timezone => 'Asia/Kuala_Lumpur'` argument it hands
// `clara.create_accounting_plan` (whose `timezone` column is a one-member CHECK), and once as a
// `'timezone'` key in the jsonb it returns. The amortisation dates themselves come from the plan
// lane's own arithmetic. 0223's other bodies spell the zone nowhere.
// #915 [0307] MOVED THIS NAME rather than adding one beside it, so the entry is now
// REVERSE-gated the way begin_chat_turn's and sign_adjustment_template's are: the OBO twin
// extracted the whole schedule body into `clara._prepayment_schedule_core` and left
// `clara.create_prepayment_schedule` a one-line delegation that spells the zone nowhere
// (measured: 1,413 bytes of prosrc against the core's 38,889, and the arm (B) detector no longer
// matches it). On a database pinned before 0307 the door still carries both mentions, so the
// name is PUSHED BACK there instead of being deleted.
//
// THE GATE IS 0307's STEM AND NOT 0315's, and the difference is a real frontier. Gate A's report
// attributes the relocation to #1036/0315 (`prepayment_wake_reroute`); the FILES say 0307. In
// 0307 `clara._prepayment_schedule_core` spans lines 340-893 and all three of that file's
// 'Asia/Kuala_Lumpur' literals (783, 790, 870) are inside it, while
// `clara.create_prepayment_schedule` begins at 894 and carries none. 0315 and 0317 later RECUT
// the core and keep the literals; they do not move them. Gating either side on 0315 would leave
// every frontier pinned at 0307..0314 wrong in BOTH directions at once — the core missing from
// the roster and the door still demanded on it.
const KL_ROSTER_0223_PREPAYMENT = ["create_prepayment_schedule"];
// WAVE 2026-09-15 END

// ===========================================================================================
// RIDERS WAVE 4, LANE 04 (0307, 0308, 0317) - arm (B), THREE stem-gated cohorts, FOUR names,
// and every one of them is #653's own CLASS 1 adjudication inherited, not a new question: each
// body spells 'Asia/Kuala_Lumpur' as the `p_timezone` ARGUMENT it hands
// `clara.create_accounting_plan` (whose `timezone` column is a one-member CHECK) and again as
// the `'timezone'` key of the jsonb it returns, and DERIVES NO DATE from either. The schedule
// dates come from the plan lane's own arithmetic. There is no authority to call instead --
// `clara._book_today()` answers a DATE, not a zone -- so the standing advice cannot be followed
// and joining this roster is the declared cost, exactly as KL_ROSTER_0300_TENANCY's own header
// records for `clara._tenancy_rent_plan_draft`.
//
// #915 [0307] - the on-behalf twin's extraction. `clara._prepayment_schedule_core` is where
// `clara.create_prepayment_schedule`'s two mentions WENT (see that entry's reverse gate above),
// so on the integrated chain this is a RELOCATION and not a second copy: the pair moves together
// and the roster's total is unchanged across the 0307 boundary.
const KL_ROSTER_0307_PREPAYMENT_OBO = ["_prepayment_schedule_core"];
// #941 [0308] - the deferred-revenue twin of the same body, on the same adjudication. It is a
// NEW name (the revenue lane did not exist before 0308), so this one is an addition.
const KL_ROSTER_0308_REVENUE_RECOGNITION = ["_revenue_recognition_core"];
// #939 AC4 / #941 AC3 [0317] - the two correction doors. Each opens a SUCCESSOR schedule over a
// corrected term, which means each calls the plan door itself and hands it the same zone NAME.
// Both are doors rather than cores, and both carry the envelope key too.
const KL_ROSTER_0317_SCHEDULE_CORRECTION = [
  "replace_prepayment_schedule", "replace_revenue_recognition_schedule",
];
// RIDERS WAVE 4, LANE 04 END

// ===========================================================================================
// WAVE 2026-09-18 (0225..0233) - arm (B), FOUR stem-gated cohorts, SEVEN names, measured on the
// from-scratch 0001..0233 chain (rigint, 127.0.0.1:55720, clara_int) by running arm (B)'s own
// `like '%asia/kuala_lumpur%'` detector over the live catalog. ADDITIONS ONLY - the same run
// reported nothing missing. DECISIONS 6.3's rule is the one applied name by name below: a body
// that derives a MONEY date (as-of, posting, due, period) from the session clock by its own
// expression must be re-pointed at the house derivation; a body whose clock read is
// `computed_at` / a watermark / a sampled display window is registered with that class.
//
// FIVE OF THE NINE MIGRATIONS ADD NOTHING HERE. 0225, 0226, 0228 and 0233 spell the zone nowhere
// at all. 0227 spells it three times and mints no name: once in an apply-time backfill UPDATE and
// twice inside `comment on` strings, neither of which reaches `prosrc` or `pg_get_functiondef` -
// measured, not assumed, because the detector reads exactly those two sources.

// #636 [0229] - CLASS 1, the zone as a NAME. `clara.get_intake_batch` spells
// `'timezone', 'Asia/Kuala_Lumpur'` once, inside the jsonb that describes the firm's UTC-day
// document quota (`'window','utc_day','resets_at_local','08:00'`): it tells a person WHICH
// calendar the 08:00 reset is quoted in. No date is derived from it, and the body's only clock
// read (`v_now`) becomes `computed_at` and nothing else. `clara._book_today()` answers a date, so
// the standing advice has nothing to offer a body that computes none - `_assert_plan_schedule`'s
// case above, exactly.
const KL_ROSTER_0229_INTAKE_BATCHES = ["get_intake_batch"];

// #658 [0230] - CLASS 2, and it is 0220's family rather than a new question.
// `clara.retrieve_knowledge` and `clara.record_work_knowledge_read` each default
// `v_as_of := coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date)` and use it for
// ONE thing: which knowledge revision is in effect (`effective_from <= v_as_of` and
// `effective_to >= v_as_of`). `record_work_knowledge_read` also STORES it on the read row, as the
// read's own provenance. That is `get_knowledge_applicability` / `list_firm_knowledge`'s shape
// (KL_ROSTER_0220_FIRM_KNOWLEDGE above, "CLASS 2, the weaker half") and it inherits that block's
// follow-up rather than opening a second one: no posting date, no period bound, no ledger row.
const KL_ROSTER_0230_KNOWLEDGE_RETRIEVAL = ["record_work_knowledge_read", "retrieve_knowledge"];

// #659 [0231] - CLASS 2, and it is `get_client_work_pack`'s case (KL_ROSTER_0214_WORK_PACK above)
// argument for argument. `clara.get_firm_portfolio_pack` takes ONE `now()` sample, derives
// `v_today`, and spends it on a seven-MYT-day window (`v_from_date := v_today - 6`,
// `v_to := ((v_today + 1)::timestamp) at time zone ...`) plus the `to_date` key of the envelope.
// Nothing it derives reaches a ledger row, and the authority would make it WORSE for the same
// reason it would make 0214's worse: `clara._book_today()` samples `statement_timestamp()` per
// STATEMENT, so a pack straddling MYT midnight would report a window and a date from two
// different days.
const KL_ROSTER_0231_FIRM_PORTFOLIO = ["get_firm_portfolio_pack"];

// #660 [0232] - THREE names, and they do NOT share one adjudication. This is the block a later
// reader should come to first. Two of the three were ESCALATED at integration and are now RULED
// (DECISIONS 6.4 row 1): they are CONSUMERS of the house derivation, re-pointed in 0232 itself.
//
// `clara.publish_client_cash_account_set` is CLASS 2 and the reading is not close:
// `v_from := coalesce(p_effective_from, v_books, v_today)` reaches `v_today` only when the caller
// stated no date AND `v_books` is null, and `v_books` is
// `least(min(finalized opening_seed.as_of), min(approved journal_entries.posting_date))` - so the
// clock can only ever date the FIRST cash-account-set version of a client that has no books at
// all. A client with money always takes the books' own date, and a stated date later than it is
// refused by name (`first_version_after_books_start`). The date it writes is the lifetime of a
// CONFIGURATION object, not a posting, a due date or an accounting period.
//
// `clara.get_client_financial_pack` and `clara.propose_client_cash_accounts` ARE MONEY DATES BY
// 6.3's OWN ENUMERATION - they were escalated here unresolved, and DECISIONS 6.4 row 1 RULED them:
//   * the pack derives `v_today`, then `v_as_of := least(v_month_end, v_today)` when no as-of was
//     stated, refuses `p_as_of > v_today` as `as_of_in_future`, and anchors
//     `v_start := date_trunc('month', v_today)::date`. `v_as_of` is what selects the actuals the
//     pack reports.
//   * the proposal bounds its per-account balance with `je.posting_date <= v_today` over
//     `clara.journal_lines` joined to approved `clara.journal_entries`, and echoes the same date
//     as the envelope's `as_of`.
// THE RULING: re-point both at the house derivation; `computed_at = now()` stays a sampling read.
// 0232 was edited on a FRESH cluster (a new `rigint`, 0 clara% roles before the chain, so 0154's
// role census is honest) and both bodies now read `clara.book_today()` - a one-line SECURITY
// DEFINER delegate of `clara._book_today()` that 0232 installs for exactly this reason: both reads
// are SECURITY INVOKER, and `clara._book_today()` has PUBLIC revoked with an ACL of
// {clara_fn_owner} alone, which `x42.s5c.1` pins as a house law by asserting clara_authenticated
// is REFUSED 42501 on it. MEASURED before the fix on the 0001..0233 chain: zero SECURITY INVOKER
// bodies in the catalog call the authority; every caller is a definer body. The delegate is 0042
// S5.20's own remedy for its own problem (a DELEGATE, not a copy - its words for
// `clara._fa_today()`), so exactly one body still COMPUTES the house date, and the delegate adds
// no name to either arm because it reads no clock and spells no zone.
//
// SO THESE TWO ARE NOW **CONSUMERS OF THE HOUSE DERIVATION**, not CLASS 2 pins and no longer
// escalated. They stay on this roster - the arm (B) detector reads the ZONE STRING, which both
// still carry as the `timezone` key their envelopes publish so a face can state the calendar it
// counted in. Re-measured on the fresh from-scratch chain after the fix: 0 extra / 0 missing, so
// nothing was removed and the ratchet is exact. Proven by `p660.pack.as_of_is_book_day`.
//
// THE COUNTER-ARGUMENT, KEPT because the ruling weighed it rather than missed it (0214's block
// records the same one): both bodies take ONE `now()` sample and build `computed_at` from it,
// while `clara._book_today()` samples `statement_timestamp()` per STATEMENT, so a call straddling
// MYT midnight can report an as-of and a `computed_at` from two different days. 6.4 accepted that
// cost: a MONEY date must be the book day regardless, and `computed_at` is a sampled instant, not
// a money date.
const KL_ROSTER_0232_CLIENT_FINANCIAL = [
  "get_client_financial_pack", "propose_client_cash_accounts", "publish_client_cash_account_set",
];
// #1000 [0320] - THE SAME ROSTER WITH ONE NAME MOVED, for the reason the arm (D) block above
// states in full: 0320 lifted the pack's body byte for byte into
// `clara._client_financial_pack_core`, so the `Asia/Kuala_Lumpur` string this arm reads - the
// `timezone` key every figure group publishes so a face can state the calendar it counted in -
// travelled with it, and the door left behind spells no zone at all. Nothing was added to the
// duplication ledger and nothing was removed from it: exactly one body still publishes that
// string for this read, and it is the same body it always was under a new name.
const KL_ROSTER_0320_CLIENT_FINANCIAL_CORE = [
  "_client_financial_pack_core", "propose_client_cash_accounts", "publish_client_cash_account_set",
];
// WAVE 2026-09-18 END

// ===========================================================================================
// RIDERS WAVE 2 (0252) - stem-gated, never number-gated.
//
// #964 [0252] - CLASS 2. The daily document-ingest ceiling behind CLR18 moved from a UTC
// calendar day to an Asia/Kuala_Lumpur one (D4's named residual from #636, closed by this
// ticket): `clara._reserve_document_ingest`, `clara._resize_document_reservation` and
// `clara._settle_document_reservation` each derive a real TIMESTAMPTZ value —
// `date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`,
// the instant of MYT midnight for "today" — and compare a reservation's `created_at` against it.
// That is a genuine value derived from the zone, never a zone-as-label the way
// `get_intake_batch`'s own mention is (KL_ROSTER_0229_INTAKE_BATCHES above, CLASS 1: it REPORTS
// this window's reset moment in its `capacity` block but computes none of the three boundaries
// itself). NOT a MONEY date and NOT re-pointed at `clara._book_today()`, for the same reason
// 0214's window bounds are exempt (KL_ROSTER_0214_WORK_PACK above): this is a per-firm DAILY
// CAPACITY ceiling's reset moment, never a posting date, a due date or a period bound, and
// nothing it derives reaches a ledger row. The four move TOGETHER, byte-identically (0252's own
// tail asserts this), so they are rostered together rather than split one-by-one.
//
// THE FOURTH NAME was added at integration (2026-09-20). `clara.settle_ingest_reservation` is
// 0252's own "fourth shipped door on the same ceiling" — its tail says so in those words, and it
// carries the byte-identical MYT window clause the other three carry (proved by
// document-ingest-window-myt.test.mjs's `p964.window.mechanism_myt` cell for that door). The lane
// rostered the three helpers and missed the door; the live arm (B) census caught it on the first
// integrated from-scratch chain. Same CLASS 2 adjudication as its three siblings, for the same
// reason: a per-firm DAILY CAPACITY reset moment, never a posting date, a due date or a period
// bound.
const KL_ROSTER_0252_DOCUMENT_INGEST_WINDOW = [
  "_reserve_document_ingest", "_resize_document_reservation", "_settle_document_reservation",
  "settle_ingest_reservation",
];
// RIDERS WAVE 2 END

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
  // DB-A: a CATALOG witness at the exact signature, not a migration stem — see the block above.
  const bankEnrolment = (await query(
    "select (to_regprocedure('clara._bank_enrolled_fy_months(uuid,date,date)') is not null) as ok"
  )).rows[0].ok;
  if (bankEnrolment) names.push(...KL_ROSTER_DBA_BANK_ENROLMENT);
  if (await appliedStem("accounting_plans$")) names.push(...KL_ROSTER_0193_PLANS);
  // WAVE 2026-09-15 (0214..0224) - stem-gated, never number-gated.
  if (await appliedStem("client_work_pack$")) names.push(...KL_ROSTER_0214_WORK_PACK);
  if (await appliedStem("counterparty_identity_provenance$")) names.push(...KL_ROSTER_0215_COUNTERPARTY_IDENTITY);
  if (await appliedStem("firm_knowledge_defaults$")) names.push(...KL_ROSTER_0220_FIRM_KNOWLEDGE);
  // REVERSE-gated on 0307: the two mentions moved into the core, so the DOOR only belongs to this
  // roster on a database that has not taken the extraction yet.
  if (await appliedStem("prepayment_amortisation$")
      && !(await appliedStem("prepayment_schedule_obo_twin$"))) {
    names.push(...KL_ROSTER_0223_PREPAYMENT);
  }
  // WAVE 2026-09-18 (0225..0233) - stem-gated, never number-gated.
  if (await appliedStem("intake_batches$")) names.push(...KL_ROSTER_0229_INTAKE_BATCHES);
  if (await appliedStem("knowledge_retrieval$")) names.push(...KL_ROSTER_0230_KNOWLEDGE_RETRIEVAL);
  if (await appliedStem("firm_portfolio_pack$")) names.push(...KL_ROSTER_0231_FIRM_PORTFOLIO);
  // #1000 [0320] — reverse-gated, the KL_ROSTER_0223_PREPAYMENT shape (see the array's header).
  if (await appliedStem("client_financial_pack$")) {
    if (await appliedStem("client_financial_pack_wake_read$")) {
      names.push(...KL_ROSTER_0320_CLIENT_FINANCIAL_CORE);
    } else {
      names.push(...KL_ROSTER_0232_CLIENT_FINANCIAL);
    }
  }
  // RIDERS WAVE 2 - stem-gated, never number-gated.
  if (await appliedStem("document_ingest_window_myt$")) names.push(...KL_ROSTER_0252_DOCUMENT_INGEST_WINDOW);
  // RIDERS WAVE 4, LANE 01 (#949, 0300) - stem-gated, never number-gated.
  if (await appliedStem("tenancy_terms_rent_plan$")) names.push(...KL_ROSTER_0300_TENANCY);
  // RIDERS WAVE 4, LANE 04 (0307, 0308, 0317) - stem-gated, never number-gated; doubly so for
  // 0317, whose number was contested at integration (lane 06's fix-round file moved to 0318).
  if (await appliedStem("prepayment_schedule_obo_twin$")) names.push(...KL_ROSTER_0307_PREPAYMENT_OBO);
  if (await appliedStem("deferred_revenue_recognition$")) names.push(...KL_ROSTER_0308_REVENUE_RECOGNITION);
  if (await appliedStem("schedule_term_correction$")) names.push(...KL_ROSTER_0317_SCHEDULE_CORRECTION);
  return names.sort().join(" ");
}
