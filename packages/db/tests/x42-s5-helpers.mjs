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
  } catch {
    return false;
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
export const S5_25_BARE_TOKEN_ROSTER = [
  // _adv_reversal_admission joined at the round-8 INTEGRATION: lane M3 factored the advance
  // reversal walls into one admission body carrying its parents' lawful as-of idiom
  // (`v_at := coalesce(p_at, now())` — a timestamptz interval default, never a date). The
  // migration's arm (D) census caught the un-rostered relocation at the first integrated
  // assembly; this pin records the same adjudication.
  "_adj_run_occurrence_core", "_adv_assert_proposal", "_adv_enrolment_at", "_adv_on_approve", "_adv_reversal_admission", "_adv_window_closed_under",
  "_approve_entry_core", "_approve_opening_entry", "_derive_vendor_binding_proposal", "_draft_entry_core", "_enqueue_invoice_facts_core",
  "_fa_on_approve", "_ocr_sales_floor", "_pair_reverse_core", "_publish_wiki_page_version_core", "_record_onboarding_contributor",
  "_refund_document_reservation", "_refund_processing_call", "_reserve_document_ingest", "_reserve_processing_call", "_resize_document_reservation",
  "_resolve_vendor_binding", "_seed_verified_document", "_settle_document_reservation", "_settle_from_bank_line_core", "_settle_processing_call",
  "_tf_agent_task_insert", "_tf_agent_task_update", "_tf_autodraft_attempt_update", "_tf_coding_task_update", "_tf_counterparty_update_0011",
  "_tf_document_intake_update", "_tf_fa_movement_belt", "_tf_filing_correction_update", "_tf_firm_document_limits_upsert", "_tf_fixed_assets_immutable_0017",
  "_tf_processing_call_reservation_update", "_tf_processing_task_update", "_tf_reservation_update", "_tf_rotate_token", "_tf_wake_intent_consume",
  "_wake_cred_full", "ack_compliance_watch", "acknowledge_rule_posts", "acknowledge_sweep_run", "add_bank_account",
  "admit_autodraft_task", "answer_interruption", "approve_opening_correction", "approve_opening_seed", "approve_pair_reversal",
  "approve_wrong_client_correction", "begin_chat_turn", "begin_client_onboarding", "bootstrap_client_plan", "cancel_agent_task",
  "cancel_client_onboarding", "cancel_opening_seed", "cancel_pair_reversal", "cancel_seeding_batch", "claim_document_intake_upload",
  "claim_document_processing_task", "classify_document", "commit_client_onboarding", "complete_bank_reconciliation", "complete_coding_task",
  "complete_fixed_asset_particulars", "complete_pending_match", "complete_seeding_batch", "complete_stored_document_task", "confirm_attribution_candidate",
  "consume_egress_dispatch", "create_client", "create_firm", "create_seeding_batch", "deactivate_bank_account",
  "deactivate_client_egress_purpose", "decline_coding_rule", "decline_seeding_proposal", "dismiss_attribution_candidate", "dismiss_coding_task",
  "dismiss_open_question", "enrol_staff_advance_account", "evaluate_sst_watch", "evaluate_sst_watches_all", "execute_rule_post",
  "fail_classify", "fail_invoice_facts", "fail_statement_facts", "finalize_document_intake", "get_bank_reconciliation",
  "get_context_pack", "list_autopost_rules", "list_review_queue", "list_vendor_bindings", "mark_document_intake_received",
  "mark_wiki_citations_stale", "match_bank_line", "merge_counterparties", "mint_wake_credential", "open_interruption",
  "persist_document_extraction", "persist_invoice_facts", "persist_statement_facts", "prepare_egress_dispatch", "propose_autopost_rule",
  "propose_bank_rule", "propose_vendor_identity_binding", "reconcile_autopost_rules", "reconcile_sweep_runs", "record_future_attestation",
  "record_opening_keyed_resolution", "relay_health", "remove_member", "rename_counterparty", "request_reextraction",
  "resolve_and_book_bank_line", "resolve_bank_line_exception", "resolve_compliance_watch", "resolve_lint_finding", "resolve_onboarding_plan_item",
  "resolve_open_question", "retire_adjustment_template", "retire_autopost_rule", "retire_bank_rule", "retire_client_alias",
  "retire_coding_rule", "retire_counterparty_alias", "retire_depreciation_authority", "retire_document_filing", "retire_fa_account_profile",
  "retire_staff_advance_account", "retire_wiki_page", "reverse_entry", "revise_entry", "revise_fixed_asset_particulars",
  "revoke_client_egress", "revoke_client_egress_purpose", "revoke_vendor_identity_binding", "revoke_wake_credential", "run_client_lint",
  "run_lint_all", "set_counterparty_terms", "set_document_kind", "set_member_role", "set_wiki_synthesis_hold",
  "settle_chat_turn", "settle_ingest_reservation", "sign_adjustment_template", "sign_autopost_rule", "sign_bank_rule",
  "sign_coding_rule", "sign_depreciation_authority", "sign_vendor_identity_binding", "snooze_compliance_watch", "tick_seeding_proposal",
  "unmatch_bank_match", "update_onboarding_plan", "upsert_fa_account_profile", "verify_document_intake", "void_bank_reconciliation",
  "void_bank_statement", "wake_context", "wake_record_notification", "withdraw_draft",
].sort();

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
  "preview_ocr_sales_evidence", "set_sales_backfill_state", "set_sales_lane_activation",
];

/** The arm (D) roster for the database under test, sorted as the catalog sorts it. */
export async function s5BareTokenRoster(query) {
  const applied = (await query(
    "select count(*)::int as n from clara.schema_migrations where version like '0046_%'"
  )).rows[0].n === 1;
  const names = applied
    ? [...S5_25_BARE_TOKEN_ROSTER, ...SALES_LANE_0046_CLOCK_NAMES]
    : [...S5_25_BARE_TOKEN_ROSTER];
  return names.sort();
}
