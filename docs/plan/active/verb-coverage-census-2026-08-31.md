# The two-way verb-coverage census (2026-08-31) — the FS-0 re-measurement (裁-75)

*Supersedes [`verb-coverage-census-2026-08-28.md`](verb-coverage-census-2026-08-28.md) (pinned at
`0138`, pre-port-wave) as the roster authority. Run per the FS-0 order
([`frontend-sprint-handoff-2026-08-31-orders.md`](frontend-sprint-handoff-2026-08-31-orders.md)):
a throwaway `postgres:17` rig (`fs0-census-rig`), `migrate.mjs` 0001→**0155**, seeded, the LIVE
catalog read directly — `pg_proc` + `has_function_privilege('clara_authenticated', oid,
'EXECUTE')` + the `_visible` views via `has_table_privilege` — never migration text. apps/web
measured at `main` (`652844d8` tree). Every NO-HOME name re-checked by hand at its own
word-boundary grep across `app`/`components`/`lib`/`i18n`/`messages`, non-test: all returned ZERO.*

## The verdict

- **Direction 2 (frontend → backend): ZERO stale wiring, measured.** All **171** `callDoor` verb
  names and all **53** `getRows` relations apps/web actually calls (non-test) resolve at the live
  `0155` catalog — 224/224. (Two test-only fixture names, `void_verb` and `filings`, never touch
  the DB — fake-session unit fixtures, noted not smoothed.)
- **Direction 1 (backend → frontend): 280 items** (268 EXECUTE-granted functions + 12 `_visible`
  views; context: 186 SELECT-granted relations in all): **178 UI-wired** (171 functions + 7 views)
  · **13 in-flight in the open P4 PRs** (9 functions + 4 views, proven by added-line diffs) ·
  **1 planned by ruling** (`create_firm` → FS-4, 裁-73) · **64 deliberately non-UI** (ruled/cited
  below) · **15 paused-lane / row-bound** · **8 NO HOME** (dispositions proposed below) · 1 view
  covered by an existing honest note.

**The 0138→0155 delta says the port wave worked:** 60→171 wired verbs, 25→53 wired reads. The old
census's headline ("nothing can open a fiscal year") is dead — `open_fiscal_year`,
`propose_fiscal_year`, `get_close_readiness`, `record_future_attestation`, the 0138 four, the
counterparty-hygiene four, `open_question`, `promote_clarify_to_question`, `request_autodraft`,
`request_reextraction` and the bulk of the 81 CUTOVER-OWED are all live in `apps/web` today.

## Instrument notes (each cost a defect somewhere)

- The extractor's first regex silently dropped `callDoor<Record<string, unknown>>(…)` — a nested
  generic defeats `<[^>()]*>`. Caught because `request_autodraft`'s own door dialog contradicted an
  "unwired" claim; fixed to `<[^(]*?>` and re-run. **A census list is a measurement only if the
  instrument was verified against a known-wired name.**
- `relkind` needs `::text` before `||` (the `"char"` operator-ambiguity trap, again).
- **The denominator is the REPO frontier `0155`; the live DB stands at `0153`** (PROGRESS posture).
  Four `0154` names are therefore granted-on-rig but **merged-not-live**:
  `decline_vendor_identity_binding` · `reset_binding_decline` · `eligible_binding_signer_count` ·
  `binding_identity_review` (the existing "Binding corrections/visibility" Backlog row). `0155`
  adds no verbs.
- **Two Direction-2 traps a re-run must know** (the FS-10 exit gate re-runs this census; the
  independent review reproduced 171 and 53 only after catching both): `lib/registers/aging.ts:76`
  assigns its verb by ternary (`ar_aging`/`ap_aging`) — invisible to literal-string extraction —
  and `journal_lines` is reached only through `lib/journals/api.ts:102`'s `fetchBounded(path, …)`
  wrapper, never a direct `getRows("journal_lines", …)` literal.
- "Wired" includes a named wrapper in `apps/web/lib/**` per the FS-0 order. One nuance recorded:
  `retire_counterparty_alias` is wrapper-wired (`lib/registers/counterparty-doors.ts:110`) but the
  affordance is unreachable until an aliases read exists — `messages/en.json:2045`'s honest note
  covers exactly this (see `counterparty_aliases_visible` below).

## In-flight in the open P4 PRs (proven by `git diff origin/main...<branch> -- apps/web` added lines)

| PR | Wires |
|---|---|
| #455 (branch web/p4-4-members) | `invite_member` · `revoke_invite` · `set_member_role` · `add_member` · `remove_member` + views `firm_members_visible` · `firm_invites_visible` · `users_visible` |
| #453 (branch web/p4-5-operator-queue) | `approve_firm_registration` · `reject_firm_registration` + view `firm_registration_requests_visible` |
| #461 (branch web/p4-3-entry-group) | `claim_identity` · `request_firm_registration` |

`create_firm` is in none of them by design — it arrives with the checkout train (FS-4, 裁-73).
*Stack caveat (review NIT-2): the four P4 branches are a sequential stack over an unmerged common
ancestor (`5ace35c9`), so a bare `git diff origin/main...<later-branch>` shows the stack's
superset, not that PR's minimal delta — the per-PR attribution above was cross-checked against the
classification recount (97 named + 171 wired = 268, no name double-counted).*

## The 64 deliberately non-UI (ruled/cited)

- **Identity/policy helpers (9)** — EXECUTE exists so policies/flows evaluate, never for a UI call:
  `actor_firm_id` · `actor_role_rank` · `current_actor_id` · `jwt_firm` · `jwt_sub` · `role_rank` ·
  `shares_my_firm_human` · `binding_identity_review` · `eligible_binding_signer_count`.
- **Egress-consent ceremony doors (10)** (runbook-cited, 08-28 census class):
  `grant/revoke_client_egress` · `grant/activate/deactivate/revoke_client_egress_purpose` ·
  `grant/activate/deactivate/revoke_firm_egress_purpose`.
- **Metric/evaluator machinery (12)**: `propose/approve/reject/supersede_metric_definition` ·
  `assess_metric_cell_independent_v1` · `evaluate_metric_v1/_v2` · `evaluate_fs_pack_v1` ·
  `mint_metric_input_snapshot_v1` · `record_metric_evaluation_attempt_v1` · `days_in_period` ·
  `verify_evaluator_freeze` (ceremony instrument).
- **Report ceremony/authoring (11)**: `open_report_run` · `assess_report_claim` ·
  `seal_report_dataset` · `seal_report_artifact` · `replay_render_inputs` · `verify_report_artifact`
  — the product-visible path arrives at **FS-7 (裁-77)** through the `wake_*` twins + the Reports-tab
  download; these direct doors stay ceremony. Authoring: `draft_report_spec` ·
  `publish_chart_template_version` · `publish_house_style_version` · `publish_report_template_version`
  · `create_account_set_v1` (slated for retirement — the "裁-12 retirement" Backlog row; own
  migration, never bundled with `get_journal_entry`'s).
- **The chat agent's own tools (5)** (the UI renders the parts): `get_context_pack` ·
  `get_draft_review` · `get_journal_entry_for` · `list_unassigned_documents` · `trial_balance`.
- **Internal callees (6)**: `allocate_payment`/`allocate_receipt` (inside `settle_from_bank_line`)
  · `verify_bank_reconciliation` (inside recon close state) · `trial_balance_as_of` (close bodies)
  · `depreciation_run_due` (FA belt) · `add_client_identifier` (inside the shared
  identifier-promotion door, `lib/firm/needs-you-gaps.ts:172`'s live-body cite).
- **Ruled direct table-reads (5)**: `list_journal_entries` (Q8/Q9) · `get_adjustment_run` ·
  `list_adjustment_templates` (Q3 registers-read-only) · `get_wiki_page` · `list_wiki_pages`
  (apps/web reads the granted `wiki_pages` table — `lib/reports/api.ts:284`).
- **Wave-7A closed (3)**: `open_sales_backfill` · `list_sales_backfill_batches` ·
  `set_sales_backfill_state`.
- **Ops ceremony (1)**: `set_wake_source_enabled` (ADR-0076).
- **Superseded on the product path (2)**: `create_client` — **measured**: `begin_client_onboarding`'s
  live body inserts `clara.clients` directly, so the onboarding flow (wired) subsumes it ·
  `get_journal_entry` (single-arg; sole consumer was superseded `chatTurn_v1` — 08-28 cite stands).

## The 15 paused-lane / row-bound (honest note + `PROGRESS.md` row, per ADR-0075 §6)

| Names | Lane / row |
|---|---|
| `decline_vendor_identity_binding` · `reset_binding_decline` | #452 parked (裁-79); `0154` merged-not-live — the existing "Binding corrections/visibility" Backlog row |
| `set_turnover_classification` | Track B paused (裁-80) — P6-T honest note (FS-8); FS-0 residual row |
| `get_llm_usage_summary` | F-A9 metering lane (PROGRESS Lanes row); no apps/web read yet |
| `grant_firm_capability` · `revoke_firm_capability` | capabilities — NOT in #455's diff (measured); FS-0 residual row + note on the members surface at FS-8 |
| `fork_coa_template` · `get_coa_template` · `list_coa_templates` · `publish_coa_template` · `retire_coa_template` · `upsert_coa_template_account` · `upsert_coa_template_family` · `remove_coa_template_account` · `remove_coa_template_family` | COA authoring: platform templates publish through the migration ladder (coa-template-design.md:24); the firm-fork admin editor is the existing "COA PR-d" Backlog row |

## The 8 NO HOME — disposition orders (FS-0's output; each hand-rechecked ZERO in apps/web)

| Verb | Disposition |
|---|---|
| `set_firm_high_stakes_threshold` | owner-ops candidate (08-28 orphan, unchanged) — ruling or runbook at the FS-8 sweep; FS-0 residual row |
| `record_notification` · `list_notifications` | ALREADY RULED — the verify-then-decide verdict row (PROGRESS Known issues): KEEP AS-IS, no UI home yet, product-scope question for a later wave; this census confirms the table is still unread |
| `verify_snapshot` | honest-boundary backstop (08-28 cite) — runbook pointer, not UI; FS-0 residual row |
| `add_client_alias` · `retire_client_alias` | client-alias hygiene — NotBuiltNote beside the identifier-promotion card at FS-8; FS-0 residual row |
| `record_client_fact` | F-A7 facts lane — FS-5's rung-0 decides whether the interview-runner path covers it; FS-0 residual row |
| `record_document_service_period` | the existing "Service periods" Backlog row (with the `document_service_periods` read) — unchanged, re-confirmed |

## The one view with an existing honest note

`counterparty_aliases_visible` — unread, and `messages/en.json:2045` already says exactly that
("no read for them"); the note is dated-true today. The existing "Counterparty hygiene panel"
Backlog row owns wiring the read (+ `counterparty_merges` and `merge_id`); truing the note is part
of that train's merge (the 08-28 census's own law).

## 裁-72 as amended by 裁-75 — the measured residual

裁-72's "all 110 before the switch" is **executed down to**: 13 items in the three open P4 PRs +
`create_firm` at FS-4 + 6 report doors whose product path is FS-7 + 15 row-bound + 8 NO-HOME
dispositions + 1 note-covered view. **No P6-C1…C7 train remains** — the residual is finish-the-PRs,
the two ruled trains, honest notes and 8 dispositions. The amendment note lives under 裁-72 in
[`mohe-grill-rulings-2026-08-30.md`](mohe-grill-rulings-2026-08-30.md); the P6-X exit gate re-runs
this census at the cutover tip (FS-10).
