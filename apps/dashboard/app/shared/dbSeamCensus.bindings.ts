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
  // [round-9 fix wave, lane N2; r9 finding 4, HIGH] round-8's M1 fix spliced
  // `'colliding_elements', to_jsonb(e.collision)` into THREE sites inside
  // clara._wdb_rerun_breach (the shape-overlap collision gate's own detail
  // payload) so a refusal's message could name the colliding shape elements.
  // `e.collision` is a FIELD of a `for e in select ...` loop record, typed
  // text[] by clara._wdb_shape_overlap's own return — not a bare declared-scalar
  // IDENTIFIER (declaredScalarLocals only recognises those), so scanProjections
  // correctly cannot prove it keyless and marks it a rowProjection. adjustment_run_due
  // reaches _wdb_rerun_breach at exactly the census's own depth-2 closure limit
  // (adjustment_run_due -> _adj_oldest_unmet_period -> _wdb_rerun_breach), so that
  // opacity now propagates all the way up — this entry was missing, so
  // dbSeamCensus.test.ts's own rig subtest (CLARA_RIG_DB=1, the mode CI runs in)
  // was RED on this exact branch until this line was added.
  // PROTECTION LOST, STATED HONESTLY: Direction-1 (branching-phantom-key
  // detection) is now OFF for adjustment_run_due's WHOLE envelope, not merely
  // for `colliding_elements` — the census's opacity flag is per-FUNCTION, not
  // per-key (measured: any unresolved to_jsonb anywhere in a read's depth-2
  // closure blinds Direction 1 for every key that read emits). A future
  // dashboard edit that branches on a key adjustment_run_due does not actually
  // emit will NOT be caught here. Manually re-verified at fix time: no such
  // phantom exists today (every key toAdjustmentRunDue consumes is a literal
  // adjustment_run_due emits). Tracing `e.collision` properly would mean
  // teaching declaredScalarLocals to resolve a qualified field access
  // (`record.field`) against its query's own column types — a real widening of
  // a shared instrument every other read's opacity also depends on, out of
  // proportion to a HIGH-but-instrument-only fix; noted for the owner rather
  // than attempted here.
  adjustment_run_due: "clara._wdb_rerun_breach's to_jsonb(e.collision) detail payload (a text[] loop-record field, not a declared scalar) reaches this read's depth-2 closure — round-8 M1's collision-detail splice; Direction-1 protection is OFF for this whole envelope, not only the new key (see dbSeamCensus.test.ts's own r9n2 cell)",
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
  list_adjustment_templates: {
    account_code: "read from `lines[]`, the template's STORED jsonb line array",
    credit_cents: "same (stored lines[] key)",
    debit_cents: "same (stored lines[] key)",
    description: "same (stored lines[] key)",
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
  // `asset_id` entered in ROUND 6, from clara._wdb_rerun_breach via the depth-2
  // closure (adjustment_run_due → _adj_oldest_unmet_period → _wdb_rerun_breach). It
  // is a key of the shared RE-RUN BREACH payload, not of the due envelope, and no
  // adjustment surface reads it. Recorded by name and ASSIGNED to the lane that owns
  // that predicate — the ratchet's job is to make the change deliberate, and this
  // entry is that deliberation, not a ratification that the surface is complete.
  //
  // [round-9 fix wave, lane N2] `colliding_elements`/`correction_entry`/
  // `correction_verb`/`correction_wall` were ALREADY true of the round-8 baseline
  // (colliding_elements: M1's _wdb_rerun_breach splice, r9 finding 4; the three
  // `correction_*` keys: _adj_correction_door's own envelope, reached at the SAME
  // depth-2 closure via get_adjustment_run's call graph) — this Direction-2 drift
  // pre-dates round 9 and was simply UNREACHABLE while OPAQUE_READS.adjustment_run_due
  // was missing (the earlier-failing assertion aborted this test before Direction 2
  // ever ran). Fixing the OPAQUE_READS gap unmasked it; recorded now rather than left
  // for the next reader to rediscover the same way. Not this lane's fix to make
  // (s2/_adj_correction_door is lane N1's file) — ground truth about the CURRENT
  // baseline only; if a future consumer starts reading `verb`/`wall`/`entry` (Y2 r9
  // finding 2's own fix direction), this line and get_adjustment_run's below both
  // shrink at that point.
  // [round-10 fix wave, lane O2; r10 Z3 finding 1 (F7), HIGH] `standing_template_id` /
  // `standing_template_status` are the round-9 N1 remedy fix's OWN new keys, spliced into
  // clara._wdb_rerun_breach's shape_already_met detail payload (0042 clara._wdb_rerun_breach,
  // `v_met := v_met || jsonb_build_object('standing_template_id', v_met_tpl,
  // 'standing_template_status', ...)`), reached at adjustment_run_due's SAME depth-2 closure
  // this whole entry already covers. MEASURED (CLARA_RIG_DB=1 node --test app/shared/
  // dbSeamCensus.test.ts — the exact mode CI's "Migrate + seed + tests" step runs this file
  // in, .github/workflows/ci.yml:194-203): this line was missing, so the rig subtest was RED
  // on this branch — the round-9/round-10 ladder record's "dashboard 608/608 ... ALL green"
  // baseline claim was only true measured WITHOUT CLARA_RIG_DB=1, not the way CI actually
  // runs it. Traced the OTHER side too: clara.adjustment_run_due (0042:3560-3625) only ever
  // copies `{template_id, reason}` into its blocked[] array — these two keys are discarded at
  // that boundary and never reach the wire on THIS read at all (grep of apps/dashboard/app/
  // for either literal: zero hits) — so this is a closure over-approximation catching a real
  // ledger-currency gap, not a live unrendered advisory. [O2 note for the orchestrator's
  // post-merge integration pass] Lane O1 (round-10, same wave) is separately widening this
  // SAME refusal family's remedy grammar (a branch-distinct `remedy` key, an advisory warning
  // key on `propose_adjustment_template`'s response) — re-run this rig probe once O1's section
  // lands, since a genuinely NEW key name (not merely a new VALUE of an existing key, which
  // this ledger does not track) on either verb would need its own line here or in code.
  // [round-11 fix wave, W-R11] SIX MORE, AND THEY ARE THE SAME CLOSURE STORY ONE ROUND ON.
  // `first_period_in_window` / `last_period_in_window` / `last_period_any` / `standing_in_window`
  // / `name` / `status` are the payload of clara._wdb_replaced_generation_standing — the
  // period-keyed lineage authority round 11 added — reached at adjustment_run_due's SAME depth-2
  // closure (adjustment_run_due -> _adj_oldest_unmet_period -> _wdb_replaced_generation_standing).
  // MEASURED with CLARA_RIG_DB=1 against a four-slice rig carrying the fixed 0045: the Direction-2
  // ratchet flagged exactly these six and nothing else, which is the ratchet doing its job -- a new
  // DB-published fact no surface renders has to be DECLARED, never silently joined.
  // TRACED THE OTHER SIDE, as the asset_id/standing_template_* entries above were: clara.
  // adjustment_run_due copies only `{template_id, reason}` into blocked[], so none of the six
  // reaches the wire on THIS read -- a closure over-approximation, not a live unrendered advisory.
  // WHERE THE REAL DEBT IS, stated so the next reader does not have to re-derive it: the remedy
  // grammar these keys belong to reaches a human only through a MANUAL RUN's refusal detail, and
  // the round-11 dashboard lane measured that neither of W2 finding 4's two offered fixes survives
  // the shipped ABI (blocked[]'s row shape is pinned at two keys; the blocked due envelope carries
  // no period for a manual run to send). Widening blocked[] to carry the refusal's own `remedy`
  // is a DB-side ABI decision, recorded as a residual for the next ladder round, NOT taken here.
  adjustment_run_due: "account_class account_code asset_id axis cadence colliding_elements correction_entry correction_entry_id correction_posting_date correction_verb correction_wall correction_wall_advice domain entry_id first_period_in_window last_period_any last_period_in_window name owner_ref posting_date role standing_in_window standing_template_id standing_template_status status",
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
  // [round-9 fix wave, lane N2] same pre-round-9, unmasked-by-the-OPAQUE_READS-fix
  // story as adjustment_run_due above: the depth-2 closure over get_adjustment_run's
  // own call graph reaches clara._adj_correction_door (round 8), whose OWN envelope
  // carries verb/entry/wall — but _adj_run_json (the OUTER function get_adjustment_run
  // actually returns) drops all three before its own final jsonb_build_object. Ground
  // truth about the CURRENT baseline; not this lane's file to fix (s2).
  get_adjustment_run: "entry verb wall wall_advice",
  get_bank_reconciliation: "acknowledged_outstanding anchor_amount_cents anchor_consumed_cents available bank_account_ids bank_uncleared_opening_cents client_id consumed counterpart_line_id cutoff firm_id first_statement_id gl_cents matched_line_cents opening_tie_delta_cents pair_complete_in_period reversal_entry_id reversal_pairs_excluded statement_status unavailable_reason",
  get_bank_statement: "lines statement",
  get_coding_rule: "counterparty name question registration_no rule",
  get_depreciation_authority: "client_id",
  get_depreciation_run: "client_id",
  // `idx` entered with migration 0054_region_ordinal (WAVE E / F9): the per-region
  // ordinal the DRAFTING TOOLFACE cites instead of a 36-char region UUID. Its consumer is
  // the runtime (autoDraft_v7 / chatTurn_v10 resolve idx -> region_id server-side), which
  // this census deliberately does not read — "Runtime/agent-lane consumers
  // (packages/runtime)" is one of dbSeamCensus.ts's own declared blind spots. So it is
  // unconsumed BY THE DASHBOARD and correctly listed here; the dashboard's own
  // get_document_extract reader (chat/review.ts getMachineTotal) needs the region `id`,
  // not the ordinal, and was deliberately left alone.
  get_document_extract: "basis byte_size bytes_verified_at client_id document document_kind engine_confidence engine_id engine_kind envelope_text extraction_id extraction_status field_path filed_at filing financial_date id idx locator locator_kind max_chars mime_type monetary_cents monetary_raw normalization_version original_filename page_count raw_sha256 sha256 status text_content unassigned version_n",
  get_draft_review: "account_type counterparty_name current_outcome decision extraction_id fingerprint line_no name_normalized proposal registration_normalized signed_by vendor_binding_id",
  // `month`/`months`/`skip_reason` are INTERNAL keys of _fa_asset_charges and the
  // run-skip helper, pulled in by the depth-2 closure; they are not envelope keys.
  // Recorded honestly as closure over-approximation rather than silently filtered.
  get_fixed_asset: "month months skip_reason",
  get_open_question: "rule",
  get_opening_dryrun: "item_key line_key question source_label",
  get_sweep_run: "items run",
  // [round-9 fix wave, lane N2] same story as get_adjustment_run above (list_
  // adjustment_runs' own closure reaches clara._adj_correction_door too).
  list_adjustment_runs: "entry verb wall wall_advice",
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
