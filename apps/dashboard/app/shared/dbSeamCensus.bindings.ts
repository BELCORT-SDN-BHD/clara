// ===========================================================================
// [WAVE D-b SPLIT — D-b1 (0043, staff advances)] THE PER-SLICE SEAM-CENSUS LEDGER.
//
// dbSeamCensus.test.ts's rig subtest diffs the dashboard's mapped reads against the SHIPPED
// catalog. Under the split the catalog is a slice's catalog, so a ledger that names a later
// slice's read fails the build for a reason that has nothing to do with the slice.
//
// WHAT ACTUALLY MAKES THIS WORK IS THE DASHBOARD SURFACE SPLIT, NOT THIS FILE. Measured
// (scratchpad work/bindingsProbe.mts + a direct rpcNames()-vs-catalog set difference on this
// slice's own rig): with the whole dashboard present, a D-b1 (0043, staff advances) rig fails the census's FIRST
// hard wall — "the dashboard calls RPCs that do not exist in the shipped catalog" — naming
// THIRTEEN verbs, and no edit to this ledger can fix that. THE COUNT IS PER-FRONTIER, and it is the
// cheapest sanity check that each slice's surface half is the right size (142 distinct rpc("…")
// names scraped from the whole dashboard, against each frontier's clara catalog):
//     D-b0 (0042) 20 unknown · D-b1 (0043) 13 · D-b3 (0044) 11 · D-b2 (0045) 0
// The 7 that clear between D-b0 and D-b1 are exactly D-b1's own verbs; the 2 between D-b1 and
// D-b3 are D-b3's; the last 11 are D-b2's. Each slice's PR must therefore ship its OWN surface,
// exactly as it ships its own migration:
//   D-b1 → app/advances/**, app/shared/advancesApi.ts, app/shared/cards/StaffAdvanceCard.tsx
//   D-b3 → app/bank/ExceptionBookingFields*, app/bank/resolveBookModel*, and ONE
//          app/shared/reconApi.ts wrapper (resolveAndBookBankLine)
//   D-b2 → app/rules/AdjustmentTemplatePanel*, app/rules/adjustmentModel*,
//          app/shared/adjustmentApi.ts, app/shared/cards/AdjustmentRunReceiptCard.tsx, the
//          SECOND app/shared/reconApi.ts wrapper (acceptBankRuleSuggestion) and the /bank
//          coding-chip wiring in StatementDetail.tsx that calls it — 0044 creates the producer
//          but WITHHOLDS its clara_authenticated grant until 0045's S2.9-b3, so the chip would
//          be a live button whose RPC Postgres refuses at the ROLE level (42501) [CF-B3-1/CX1]
//   D-b0 → no new component surface (it is authorities only) — but it DOES own
//          app/shared/businessDate.ts, which 0042 names in-body as "the dashboard law"
//
// AND THE FILES ARE NOT THE WHOLE STORY — THE CONSUMERS ARE. "The unknown-RPC wall is EMPTY at
// every frontier" is TRUE and MEASURED, but it is a claim about a NAME SET (rpcNames() scrapes
// rpc("…") string literals); it says nothing about the MODULE GRAPH, and it does not imply the
// tree compiles. Measured on a shadow copy of apps/dashboard: delete exactly the later-slice
// FILES this roster assigns away and `tsc --noEmit` goes from clean to six errors across five
// importing files. Every slice's surface half therefore also owns the CONSUMER EDITS that drop
// those imports — the per-slice roster in slices/forks/PARTITION.md §7 lists them file by file,
// and §7 also carries the shadow-typecheck recipe that keeps the roster honest. Run it; the RPC
// wall and `tsc --noEmit` are two different instruments and you need both.
//
// THE DELTA FROM THE WHOLE-UNIT FILE (measured, not argued):
//   OPAQUE_READS: drop `adjustment_run_due` (the read ships with D-b2's adjustmentApi.ts).
//   PHANTOM_BRANCHING_ALLOW: drop the whole `list_adjustment_templates` entry (same reason).
//   UNCONSUMED_BASELINE: drop `adjustment_run_due`, `get_adjustment_run`, `list_adjustment_runs`.
//   UNCONSUMED_BASELINE.fa_register_tie: UNCHANGED from the whole-unit line — D-b1's S5.19
//     recut is what puts the two gl_foreign_register_* keys there in the first place.
//
// RENDER_DEAD is INVARIANT across all four slices (measured) and is not trimmed.
// AT MERGE: D-b2's variant is the whole-unit file BYTE-FOR-BYTE — the ledger reassembles.
// ===========================================================================

// THE SEAM CENSUS LEDGER — the declared half of dbSeamCensus.test.ts.
// Data only. Every entry is a WRITTEN-DOWN claim about the DB↔dashboard seam that
// the rig probe re-measures on every CI run; a claim that stops being true fails
// the build, and a claim that is no longer needed fails it too (no stale entries).
//
// Regenerate the measured sets by running the census test with CLARA_RIG_DB=1: on
// a mismatch it prints the exact replacement line.

/** Reads whose envelope the census CANNOT prove, with the reason. `to_jsonb(row)`
 *  / `row_to_json` / a computed key expression means the key set is not in the
 *  function text at all. Direction 1 is SKIPPED for these — and this list must
 *  equal the measured opaque set exactly, so a new blind spot is a failure rather
 *  than a silent enlargement of the blind spot. */
export const OPAQUE_READS: Record<string, string> = {
  coding_lane: "projects through a view/composite, no jsonb_build_object in the body",
  get_bank_reconciliation: "to_jsonb over the receipt row + snapshot composites (0038/0040)",
  get_coding_rule: "to_jsonb over the rule row",
  get_draft_review: "to_jsonb over the entry + proposal rows",
  get_lint_finding: "to_jsonb over the finding row",
  get_open_question: "to_jsonb over the question row",
  get_opening_dryrun: "to_jsonb over the dry-run delta rows",
  get_sweep_run: "to_jsonb over the sweep-run row",
  list_notifications: "jsonb_agg(to_jsonb(n)) over the notifications view",
  list_review_queue: "to_jsonb over the per-kind row CTEs (its own parity probe is queueKindCatalog.test.tsx)",
  list_vendor_bindings: "jsonb_agg(to_jsonb(...)) over the binding rows",
  // staff_advance_statement was here until round 6 and should never have been: its
  // ONLY to_jsonb is `to_jsonb(v_from)` on a local declared `date` — a scalar
  // coercion in a value position, which introduces no keys and hides no envelope.
  // The census now tells the two apart (dbSeamCensusSql.declaredScalarLocals), so
  // that read is PROVEN in both directions instead of declared unprovable. A gate
  // whose job is declared completeness may not over-declare either.
};

/** Reads whose response reaches a surface WITHOUT a runtime mapper — a bare
 *  `as SomeType` cast. A cast asserts a shape it never checks, so there is no
 *  consumed key set to measure and neither direction can be proven. This is a
 *  THIRD face of the same class the census exists for (an assumed shape nobody
 *  verified); it is listed rather than silently skipped, and the list must equal
 *  the measured set, so a new unmapped read is a failure. */
export const UNMAPPED_READS: Record<string, string> = {
  get_vendor_binding: "reviewApi.getVendorBinding casts the envelope straight to VendorBindingDetail — no mapper, nothing to diff",
  preview_wrong_client_correction: "the correction preview is cast straight to its detail type — no mapper, nothing to diff",
};

/** DIRECTION 1 — keys a mapper reads that the DB never emits, ACCEPTED because
 *  every occurrence is a `??`/`||` fallback beside a key that IS emitted (the
 *  house "read both spellings of an assumed shape" idiom). The census classifies
 *  branching-vs-fallback mechanically; only a BRANCHING phantom can be listed
 *  here, and each needs a reason. Keep this list short enough to read in one
 *  sitting — it is the one place a dead surface could hide.
 *
 *  EMPTY BY INTENT for every D-a/D-b read. The four instances round 5 measured
 *  were all of the branching kind and all are now fixed at their source. */
export const PHANTOM_BRANCHING_ALLOW: Record<string, Record<string, string>> = {
  get_depreciation_run: {
    asset_id: "read from the `skipped[]` elements, which are a STORED jsonb column — not in any function text",
    reason: "same: `skipped[]` element key, stored jsonb the census cannot see",
  },
  list_depreciation_runs: {
    asset_id: "read from the `skipped[]` elements, which are a STORED jsonb column — not in any function text",
    reason: "same: `skipped[]` element key, stored jsonb the census cannot see",
  },
  get_entry_diff: {
    account_code: "read from `legs[]`, built from a stored revision snapshot rather than a jsonb_build_object",
    account_name: "same (legs[] snapshot key)",
    credit_cents: "same (legs[] snapshot key)",
    debit_cents: "same (legs[] snapshot key)",
    description: "same (legs[] snapshot key)",
  },
  get_rule_post_run: {
    entries: "WA2 §6.4 defensive dual shape — the mapper accepts a `posts[]` batch OR a flat receipt; both spellings are read",
    posts: "same dual-shape read; the emitted spelling is whichever the run carries",
  },
  list_autopost_rules: {
    client_id: "WA2 §6 assumed-shape read (the companion pins no autopost LIST read); degrades to null",
    reason: "same assumed-shape read; degrades to null",
  },
  list_bank_match_candidates: {
    counterparty_name: "hydrated from the counterparty join in some shapes; degrades to null when absent",
  },
  list_bank_rule_candidates: {
    proposal: "candidate rows carry an optional proposal envelope; degrades to null when absent",
  },
};

/** DIRECTION 2 — keys the SHIPPED function emits that no surface consumes,
 *  measured at the 0042 baseline. This is a RATCHET, not an audit: the entries
 *  below are pre-existing debt across every lane, recorded by name so that a NEW
 *  unconsumed key — the exact shape of the WDB-G14 advisory the DB emitted on both
 *  channels the design names while ZERO dashboard code rendered it — fails the
 *  build instead of waiting for a reviewer to notice. A key that becomes consumed
 *  must be REMOVED from its line; a stale entry fails too, so the ledger shrinks
 *  as surfaces catch up.
 *
 *  Values are space-separated, sorted key lists. */
export const UNCONSUMED_BASELINE: Record<string, string> = {
  ap_aging: "as_of domain",
  ar_aging: "as_of domain",
  customer_statement: "closing_balance_cents counterparty_id domain from opening_balance_cents to",
  // [round-7 F-F3 correction] This comment used to say "the tie strip renders
  // neither X nor Y" — FALSE, measured: there is no tie strip. `faRegisterTie()`
  // (assetsApi.ts) is called from NO `.tsx` component anywhere in the dashboard
  // — only from its own wire-level unit test — so EVERY key fa_register_tie
  // emits is unrendered, not only the nine below. Those nine stay listed here
  // because this ledger is Direction 2's claim specifically (emitted-but-not-
  // CONSUMED-by-a-mapper); the thirteen keys the mapper DOES consume
  // (as_of/tie/accounts/incomplete_count + the eight FaTieAccountRow fields)
  // pass Direction 1 and so cannot live in THIS list — their non-render is the
  // true, whole-read fact RENDER_DEAD below now states honestly, which this
  // comment used to contradict by implication. D-a debt, still assigned, not
  // fixed here (out of this lane's four).
  fa_register_tie: "before_baseline client_id cost_reported_here gl_foreign_register_accum_cents gl_foreign_register_cost_cents gl_pre_enrolment_accum_cents gl_pre_enrolment_cost_cents pending_draft_count pending_draft_rows",
  get_bank_reconciliation: "acknowledged_outstanding anchor_amount_cents anchor_consumed_cents available bank_account_ids bank_uncleared_opening_cents client_id consumed counterpart_line_id cutoff firm_id first_statement_id gl_cents matched_line_cents opening_tie_delta_cents pair_complete_in_period reversal_entry_id reversal_pairs_excluded statement_status unavailable_reason",
  get_bank_statement: "lines statement",
  get_coding_rule: "counterparty name question registration_no rule",
  get_depreciation_authority: "client_id",
  get_depreciation_run: "client_id",
  get_document_extract: "basis byte_size bytes_verified_at client_id document document_kind engine_confidence engine_id engine_kind envelope_text extraction_id extraction_status field_path filed_at filing financial_date id locator locator_kind max_chars mime_type monetary_cents monetary_raw normalization_version original_filename page_count raw_sha256 sha256 status text_content unassigned version_n",
  get_draft_review: "account_type counterparty_name current_outcome decision extraction_id fingerprint line_no name_normalized proposal registration_normalized signed_by vendor_binding_id",
  // `month`/`months`/`skip_reason` are INTERNAL keys of _fa_asset_charges and the
  // run-skip helper, pulled in by the depth-2 closure; they are not envelope keys.
  // Recorded honestly as closure over-approximation rather than silently filtered.
  get_fixed_asset: "month months skip_reason",
  get_open_question: "rule",
  get_opening_dryrun: "item_key line_key question source_label",
  get_sweep_run: "items run",
  list_bank_rule_candidates: "direction tokens",
  list_bank_rules: "sighting_count withdrawn",
  list_depreciation_runs: "client_id",
  list_review_queue: "attempts_cap attempts_remaining attempts_used autodraft blocked_reason corroborated corroboration_ineligible currency customer_name customer_registration explicit_non_myr extraction_id invoice_date invoice_id last_origin last_refusal last_run_id origin_attribution parked rounding_cents sweep_eligible tax_total_cents total_cents total_excl_tax_cents total_fact_hash total_region_id type_code updated_at version_n",
  list_uncoded_filings: "basis document_kind extraction_status financial_date mime_type",
  list_unmatched_lines: "bank_account_display line_no value_date",
  supplier_statement: "closing_balance_cents counterparty_id domain from opening_balance_cents to",
};

/** [round-7 F-F3] DIRECTION 3 (partial) — reads whose wire wrapper is called
 *  from NO `.tsx` component anywhere in the dashboard (see dbSeamCensus.ts's
 *  section comment above `wrapperNamesForRpc` for exactly what this proves and
 *  does not). Scoped to READS only: a dead ACTION (a write wrapper nothing
 *  calls) is a different defect — an unreachable affordance, not an unrendered
 *  envelope — and belongs to the ordinary review lens, not this seam gate.
 *
 *  Measured 2026-08-04 (round 7): `fa_register_tie` is the read the round-7
 *  lens named (the false ledger comment this same round corrects, above), and
 *  the SAME instrument found four more sharing the shape — none flagged by any
 *  prior round because Direction 1/2 both PASS for a read nobody calls (an
 *  empty consumer closure has nothing to phantom-read or leave unconsumed).
 *  `list_unmatched_lines` is the sharpest sibling: it is ALSO in
 *  UNCONSUMED_BASELINE above (three columns Direction 2 already flags as
 *  emitted-but-unconsumed) — this ledger adds the fact Direction 2 cannot see,
 *  that the columns it DOES consume reach zero components too.
 *
 *  A read that gains a real component caller must be REMOVED from this list;
 *  a stale entry (still listed but now called) fails the ratchet too. */
export const RENDER_DEAD: string[] = [
  "coding_lane",
  "fa_register_tie",
  "get_vendor_binding",
  "list_unmatched_lines",
  "list_vendor_bindings",
];
