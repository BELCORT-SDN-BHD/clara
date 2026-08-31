# The two-way verb-coverage census (2026-08-28)

*Run to answer the owner's standing question — "does the built frontend cover every
userflow the true product (as designed from the backend) should have; any drift/stale?" —
with a measurement rather than an assurance. Method: a throwaway rig at the 0138 frontier,
the live catalog read directly (never migration-text greps — revokes make text unreliable),
one coordinating lane + three domain lanes, every orphan claim spot-verified by the
coordinator against law 2/3. Nothing here is derived from the prototype: the backend's
granted surface IS the coverage authority.*

> **TRUED 2026-08-31:** this census is pinned at `0138`; apps/web has grown through the port
> wave. The 81 CUTOVER-OWED / 29 ORPHAN lists predate that work, and
> `apps/web/components/close/FiscalYearOpener.tsx` refutes the historical "nothing can open a
> fiscal year" headline. The exit gate is a fresh run against the live catalog; 裁-72 still governs.

## The verdict

- **Direction 2 (frontend → backend): ZERO stale wiring, measured.** All 60 `callDoor`
  verb names and all 25 `getRows` relations apps/web actually calls resolve at the live
  frontier — 85/85. The P3 verb-census-first law held under full audit.
- **Direction 1 (backend → frontend): 250 items** (247 EXECUTE-granted functions + the
  three 0137 masked views): **60 UI-wired · 2 STALE-NOT-BUILT · ~79 deliberately
  non-UI (ruled/cited) · 81 CUTOVER-OWED · 29 ORPHAN.** (The metrics-domain lane's c/d
  split carries a stated ±2 imprecision, reported honestly rather than smoothed.)

## The headline class this census MINTED: STALE-NOT-BUILT

An honest "not built yet" note is a **dated claim**. Two of them went false when their
subject's train merged, and nothing updated them:

1. `apps/web/components/close/CloseProposalPanel.tsx` (+ en.json:613/716) still said
   "no close_proposals carrier exists — F-A4 PR-1c is unbuilt" — **false since #368
   merged 0138** (the carrier and four doors are live).
2. `apps/web/components/firm/needs-you-gaps.tsx` (+ en.json:71-72) still said the two
   firm read surfaces "carry no grant a firm session can read" — **false since #365
   merged 0137**.

**Law minted:** every NotBuiltNote names the verb/train it waits on; when that train
merges, truing the note is part of the MERGE, not a later discovery. A fix lane
(branch web/stale-notes-truing) is wiring the needs-you reads + four live doors and truing
the close note as this file is written.

## The 29 orphans (no UI, no honest note, no ruling — each needs a disposition)

**Close/fiscal-year cluster (product-level find):** `open_fiscal_year` ·
`propose_fiscal_year` · `get_close_readiness` · `record_future_attestation` — **nothing
in the entire product (web or dashboard) can open a fiscal year today**; the close model
is live-inert awaiting a first `open_fiscal_year` that has no trigger anywhere.
**The 0138 four (paired with stale note 1):** `hold_close_prep` · `release_close_prep` ·
`list_agent_act_receipts` · `settle_close_proposal`.
**Counterparty hygiene:** `add_counterparty_alias` · `retire_counterparty_alias` ·
`rename_counterparty` · `merge_counterparties`.
**Documents/questions/coding:** `request_autodraft` (the runtime's own comment calls it
"the one-click admission entry") · `request_reextraction` · `open_question` (raising a
NEW question — resolve/dismiss ARE wired) · `promote_clarify_to_question` ·
`open_coding_task` · `list_coding_lanes` · `classify_consent_evidence_document` (weak-c
candidate via the handoff's "purpose-list consent step is UNBUILT" line).
**Remedy-text-only doors:** `apply_open_items` · `unallocate_group` — each exists ONLY
inside refusal/remedy text that tells a human to use a door no surface offers.
**Singles:** `set_firm_high_stakes_threshold` (migration comment suggests owner-ops; no
runbook cites it) · `record_notification` (distinct from `wake_record_notification` —
every doc hit is about the wake variant) · `verify_snapshot` (the "honest-boundary
backstop" with zero callers outside rig tests) · `get_journal_entry` (single-arg; sole
consumer is superseded chatTurn_v1 — dead on live paths) · `create_account_set_v1` (the
human body F-A5's agent core was derived FROM, never wired) · `users_visible` (0137's
third view, zero coverage, no note) · `retire_wiki_page` + `requeue_render_job`
(borderline — weak deliberate-citations, listed here rather than smoothed into class c;
note requeue_render_job was named in F-A5 §3.9's merged PR-3 "minimal doors" scope, so it
may be an unrecorded P3 scope-down).

## The 81 CUTOVER-OWED (wired only in the outgoing apps/dashboard)

The P6 cutover's mechanical checklist — before the dashboard is retired, each needs an
apps/web home or an explicit ruling. By domain (file:line evidence in the census lanes'
tables, relayed 2026-08-28):

- **Firm admin / onboarding / egress (17):** ack/snooze/resolve_compliance_watch ·
  begin/cancel/commit_client_onboarding · bootstrap_client_plan · create_firm ·
  resolve_onboarding_plan_item · create_counterparty · set_counterparty_terms ·
  share_chat_session · list/get_vendor_bindings · propose/sign/revoke_vendor_identity_binding.
- **Journals / governance / coding / AR-AP (13):** approve_routine_entry · get_entry_diff ·
  get_doc_entry_diff · withdraw_draft · answer_interruption · get_open_question ·
  coding_lane · complete/dismiss_coding_task · list_uncoded_filings · get_document_extract ·
  customer_statement · supplier_statement.
- **Accounts / adjustments (11):** upsert_account · propose/sign/retire_adjustment_template ·
  run_adjustment_manual · get/list_adjustment_runs · list_adjustment_templates ·
  reverse_adjustment_pair · approve/cancel_pair_reversal. *(Seven of the adjustment reads
  are double-tagged RULING: apps/web deliberately reads the tables instead — the
  registers-read-only ruling Q3 — so their "owed" half is the WRITE surface.)*
- **Opening / carry-down (11):** create/approve/cancel/reopen_opening_seed ·
  approve_opening_correction · draft_opening_item · record_opening_target ·
  record_opening_keyed_resolution · get_opening_dryrun · supersede_opening_item ·
  seed_fixed_asset.
- **Fixed assets / depreciation (15):** dispose_fixed_asset ·
  complete/revise_fixed_asset_particulars · retire/upsert_fa_account_profile ·
  get_fixed_asset · fa_register_tie · run_depreciation_manual · get/list_depreciation_runs ·
  propose/sign/retire_depreciation_authority · get_depreciation_authority ·
  adjustment_run_due.
- **Staff advances (7):** book_staff_advance_application ·
  complete_staff_advance_particulars · enrol/retire_staff_advance_account ·
  staff_advance_statement · staff_advance_summary · staff_advance_tie.
- **Reports / metrics / sweeps / seeding (12):** mint_month_snapshot · snapshot_state ·
  requeue_render_job · get/resolve_lint_finding · get/acknowledge_sweep_run ·
  cancel/complete_seeding_batch · decline/tick_seeding_proposal · cancel_agent_task.
- **Singles (2):** set_client_fy_end · withdraw_draft *(counted once above)*.

## The ~79 deliberately-non-UI (each carries a citation; representative)

8 identity/RLS helpers (EXECUTE exists so policies evaluate, never for calling) ·
`list_journal_entries` (ruled: direct table read, Q8/Q9) · the ops-ceremony doors
(`set_wake_source_enabled`, `add_member`/`remove_member`, the egress consent family —
each with its runbook cite) · the agent-tool layer (trial_balance,
get_journal_entry_for, get_draft_review, list_unassigned_documents — the chat agent's own
tools; the UI renders the parts) · internal-callee doors (allocate_payment/receipt inside
settle_from_bank_line; verify_bank_reconciliation inside bank_recon_close_state;
trial_balance_as_of inside the close bodies; depreciation_run_due via the FA belt) · the
evaluator/report-ceremony machinery (F-A5's open→seal family with wake siblings, the
metric-definition family, verify_evaluator_freeze, the DR drill doors) · the ruled
UNBUILT/DESIGNED families (members/capabilities/metering → P4; F-A7 π question/promotion
doors → the addendum spec; Wave-7A backfill, closed).

## Dispositions owed (the owner's sheet)

1. ~~**The P6 cutover scope ruling**~~ — **RULED 裁-72: port-all.** All 110 verbs (the 81 +
   the 29 orphans below) get an `apps/web` home before the domain switch, organised as
   domain trains P6-C1…C7.
2. ~~**The 29 orphan dispositions**~~ — **RULED 裁-72**, same disposition as item 1: the
   fiscal-year cluster ("no UI can open a fiscal year") and the rest all port, inside the
   P6-C trains.
3. `requeue_render_job`'s possible unrecorded P3 scope-down — reconcile at P6.
