# Clara — frontend handoff addendum: the Wave-G OS surface (2026-08-24)

*Finalized 2026-08-24 by the orchestrator lane. Extends
`docs/plan/active/frontend-handoff-2026-08-23.md` — its §0 settled decisions all stand and are
not restated here. Written to survive a `/clear`: every claim carries a `file:line` in this
repo, a branch@sha for unmerged material, or is marked **UNVERIFIED**. Session identifiers
(lane names, PR numbers) are historical labels only — the resume path is the files and commands
below.*

## 0 · What moved into scope, and why now

The owner ruled on 2026-08-24 that the Wave-G "OS surface" layer — ⌘K Ask/Do/Go +
ActionPanels, the proactive inbox / cross-scope needs-you surface, and the plan-as-document
close/onboarding surface (`docs/design/PRODUCT_DESIGN.md:15-24`, the "What will live here at
Wave G" list) — moves into the parallel Codex frontend session's scope now, rather than waiting
for a later wave. The reason given: the backend verb inventory is effectively frozen. The
Wave-F merge train landed and was W1-ceremonied the same day — `PROGRESS.md:10-23` records four
cars merged live (0103 · 0104 · 0105 · 0106-0108) and a post-W1 cascade (0109-0116, F-A5's
seventeen-wrapper reporting-agency surface) that finished landing before this addendum was
written. **`PROGRESS.md`'s own Wave-G frontend lane row (`PROGRESS.md:94`) still reads
"HANDOFF LANDED 2026-08-23" and does not yet reflect this scope expansion — this addendum is
the first repo record of it, not a restatement of one.** Whoever next runs the clock-out
harness-sync sweep should true that row against this file.

This packet gives you the concrete contract for that layer: which verbs exist today, which are
designed but not yet even branched, and which land in a specific, named window. Nothing here
overrides §0 of the base handoff. Where this file and the base handoff's §4.4 table disagree
(the base handoff, dated 2026-08-23, still shows F-A5 as "designed, unbuilt" — it is now live),
this file is newer and wins.

## 1 · The ⌘K Do dispatch contract — the wake-verb inventory

"Do" dispatches a durable run via a wake verb (`docs/design/PRODUCT_DESIGN.md:73`, disposition
6). Every verb below is enumerated from the migrations themselves, not from memory or design
prose — a `create function clara.wake_*` plus its `wake_fn_allowlist` row is the only thing that
makes a verb callable.

### 1.1 Live now — 27 wake verbs, 5 migrations, applied and grant-proven

Every `insert into clara.wake_fn_allowlist` in the repo lives in exactly five files (verified by
grepping all 111 files in `packages/db/migrations/`, not sampling):

| Verb | Kind(s) | Source |
|---|---|---|
| `wake_draft_entry` | interactive, autodraft | `0002_foundation.sql:554`, `0011_daily_loop.sql:3904` |
| `wake_record_client_resolution` | interactive | `0002_foundation.sql:555` |
| `wake_ingest_document` | interactive | `0002_foundation.sql:556` |
| `wake_record_notification` | interactive, proactive | `0002_foundation.sql:557-558` |
| `wake_open_question` | autodraft, interactive, interactive_client | `0011_daily_loop.sql:3909-3910`, `0107_f_a2_posting_grants.sql:257` |
| `wake_compose_metric_preview` | interactive | `0078_wave_e_eta_wake_wrappers_part2.sql:192` |
| `wake_save_metric_definition_draft` | interactive | `0078_wave_e_eta_wake_wrappers_part2.sql:193` |
| `wake_draft_report_spec` | interactive | `0078_wave_e_eta_wake_wrappers_part2.sql:194` |
| `wake_request_report_preview` | interactive | `0078_wave_e_eta_wake_wrappers_part2.sql:195` |
| `wake_post_entry` | autodraft, interactive | `0107_f_a2_posting_grants.sql:252-253` |
| `wake_open_report_run` | interactive | `0116_f_a5_reporting_agency_pr2e_grants.sql:115` |
| `wake_evaluate_report_pack` | interactive | `0116:116` |
| `wake_seal_report_dataset` | interactive | `0116:117` |
| `wake_assess_report_claim` | interactive | `0116:118` |
| `wake_seal_report_artifact` | interactive | `0116:119` |
| `wake_requeue_render_job` | interactive | `0116:120` |
| `wake_approve_metric_definition` | interactive | `0116:121` |
| `wake_supersede_metric_definition` | interactive | `0116:122` |
| `wake_reject_metric_definition` | interactive | `0116:123` |
| `wake_create_account_set` | interactive | `0116:124` |
| `wake_mint_metric_input_snapshot` | interactive | `0116:125` |
| `wake_publish_chart_template_version` | interactive | `0116:126` |
| `wake_publish_report_template_version` | interactive | `0116:127` |
| `wake_report_run_state` | interactive | `0116:128` |
| `wake_report_claim_state` | interactive | `0116:129` |
| `wake_report_artifact_index` | interactive | `0116:130` (line offset — file's insert block runs `114-130`) |
| `wake_metric_definition_index` | interactive | `0116:114-130` block |

**Count: 27 distinct `wake_*` functions, 36 total (kind, function) allowlist rows** (some verbs
carry more than one kind). `0116`'s tail census structurally re-proves this roster in both
directions — every wrapper it names resolves, and no allowlist row for its seventeen wrappers
existed before this file ran (`0116_f_a5_reporting_agency_pr2e_grants.sql:16-63`).

**Aside, not a `wake_*` verb but reachable the same way:** `0011_daily_loop.sql:3905-3908`
allowlists four plain-named read helpers under the `autodraft` kind —
`get_document_extract`, `get_context_pack`, `get_draft_review`, `coding_lane`. The allowlist
gates a *credential*, not a naming convention; do not assume every reachable function is
`wake_`-prefixed when you build the dispatch-contract reader.

### 1.2 Inbound — 31 designed wake verbs, none merged, three different states of readiness

These are **not yet callable on the live DB.** Build the ⌘K Do surface's UI shape against them
now (per the owner's ruling), but gate the actual dispatch behind a live allowlist check — the
verb existing in a design doc or an unmerged branch is not the same as it being grantable.

**F-A3 bank agency — thirteen verbs, ALL thirteen in one branch, merges as a set at the W2
window** (`PROGRESS.md:85`, lane row: "merges at the W2 window"). Design enumeration:
`docs/plan/active/bank-agency-design.md:122-128` ("Thirteen verbs"). Verified present, by exact
`create function` line, in `f-a3/pr-1b@c623178` (full sha `c6231781266a326ca44e7a1b980af132fde2d7b5`,
branch `f-a3/pr-1b`, file `packages/db/migrations/UNNUMBERED_f_a3_pr1b_agent_limb.sql`):

| Verb | Line |
|---|---|
| `wake_unmatch_bank_match` | 5191 |
| `wake_void_bank_reconciliation` | 5264 |
| `wake_resolve_bank_line_exception` | 5317 |
| `wake_add_bank_account` | 5381 |
| `wake_upsert_account` | 5439 |
| `wake_void_bank_statement` | 5511 |
| `wake_propose_bank_line_exception` | 5570 |
| `wake_propose_bank_identifier_promotion` | 5647 |
| `wake_get_bank_pack` | 5795 |
| `wake_match_bank_line` | 6031 |
| `wake_settle_from_bank_line` | 6263 |
| `wake_complete_bank_reconciliation` | 6338 |
| `wake_resolve_and_book_bank_line` | 6428 |

`wake_propose_bank_identifier_promotion` is a **rename in flight** — it shipped in the design as
`wake_propose_identifier_promotion`; the conductor renamed it at `c623178` because F-A7 owns the
door for the *un-prefixed* name (see §2). `PROGRESS.md:171-173` (Backlog) already logs a forward
obligation to consolidate it onto pi's core post-beta — **do not build two separate promotion
confirm flows; both land on the one human door in §2.** `f-a3/pr-1a` (core extraction,
prerequisite refactor) and `f-a3/pr-1c` (the `bank_matching` egress purpose grant) carry no
wake verbs themselves and merge in the same W2 window.

**F-A7 β — five verbs, all in ONE file, merge slot W2/W3 (not yet fixed —
`PROGRESS.md:89`: "β waits its W2/W3 merge slot")**. Verified present in
`f-a7/pr-4-beta@6892033` (full sha `6892033822101d578e2806bd5d49efdbecf2b483`, file
`packages/db/migrations/UNNUMBERED_f_a7_beta_filing_verb.sql`):

| Verb | Line |
|---|---|
| `wake_file_document` | 1451 |
| `wake_open_firm_question` | 1470 |
| `wake_propose_identifier_promotion` | 1522 |
| `wake_reattribute_document` | 1577 |
| `wake_propose_filing_correction` | 1758 |

**Correction to this addendum's own brief:** the assignment named the reference commit as
`f-a7/pr-4-beta@898da67`. That sha (`898da673726cdfacc142b4f51e9337290fbd8a3e`) resolves on
this remote to a merge commit on **`f-a2/pr-2`**, not `f-a7/pr-4-beta` — verified with
`git merge-base --is-ancestor` (not an ancestor of beta's head) and `git branch --contains`
(returns only `f-a2/pr-2`). `PROGRESS.md:24-29,89` independently names beta's closed-ladder head
as `6892033`, which is what this section cites. Treat `898da67` as a stale/mistyped reference,
not a second source — a name is not the thing it points at (`AGENTS.md`, review law 3).

Sibling trains **γ** (`f-a7/pr-2-gamma`, file `UNNUMBERED_f_a7_gamma_egress.sql`) and **α**
(`f-a7/pr-3-alpha`, files `UNNUMBERED_f_a7_alpha1_file_document_extraction.sql` +
`_alpha2_judgement_recut.sql`) carry **zero** `create function clara.wake_*` statements between
them (checked directly) — despite the filenames, the extraction and judgement-recut work they do
is consumed BY beta's wrappers, not exposed as wake verbs of their own. Do not budget UI work
against a γ- or α-owned verb; there isn't one. `PROGRESS.md:89` marks both "BUILT (reviews owed
before W2)".

**F-A7 π (already live via `0103`) ships the human-side doors these verbs feed, but ships ZERO
wake wrappers itself** — its own tail notice says so verbatim: *"ZERO wake wrappers and ZERO
filing allowlist rows arrived"* (`0103_f_a7_pi_additive.sql:1284`). Build the ask-card /
resolution UI against π's live human verbs now (§2); the agent-side proposal path (wake_
file_document etc.) is what's still inbound.

**F-A4 close key ① — thirteen verbs designed, ZERO branched as of 2026-08-24.** Design
enumeration: `docs/plan/active/close-key-1-design.md:105-117` (`wake_list_fiscal_years` ·
`wake_get_close_plan` · `wake_get_close_readiness` · `wake_verify_close` · `wake_snapshot_state`
· `wake_dry_run_close_readiness` · `wake_open_fiscal_year` · `wake_begin_close` ·
`wake_abandon_close` · `wake_mint_month_snapshot` · `wake_propose_close` ·
`wake_run_depreciation_catchup` · `wake_establish_prepayment_schedule`). **This is the one lane
where the base task's framing overstates readiness.** `PROGRESS.md:86` shows PR-1a merged
(measurement layer only — no wake verbs, see §3) and PR-1b "BUILT (three review flags on file)".
Reading `f-a4/pr-1b@bc548e9` (branch `f-a4/pr-1b`, file
`packages/db/migrations/0120_f_a4_pr_1b_close_lifecycle.sql`) directly: `grep -c` for
`create function clara.wake_` returns **zero**, and the file's own header states this explicitly
— *"WHAT THIS FILE DOES NOT SHIP (Annex F.3): the thirteen wake_\* wrappers, the agent cores...
siblings (mint_wake_credential_for_task, _wake_task_id) and the read-core extractions"*
(`0120_f_a4_pr_1b_close_lifecycle.sql:26-29`). What PR-1b *does* ship: the
`wake_credentials` schema extended for a new `close_prep` kind (`:235-252`) and five ungranted
agent-judgement cores — `_begin_close_core`, `_abandon_close_core`, `_propose_fiscal_year_core`,
`_open_fiscal_year_core`, `_mint_month_snapshot_core` (`:1050-1387`). **No branch for the
wrapper PR exists yet.** Build the close-plan UI against §3's live `get_close_plan` /
`close_gate_checks` read surface now; do not assume a W-number for the close-key wake dispatch
until a wrapper PR is branched — treat it as **undated**, not merely "unmerged".

### 1.3 Runtime-only inbound items — no new wake verb, but change existing behavior

- **F-A2/PR-2's GM-10 "re-admit door"** (`docs/plan/active/f-a2-agentic-posting-design.md:437`,
  `docs/plan/active/f-a2-annexes-2-mechanics.md:197`) — after a human revises an agent-authored
  draft via `revise_entry` (base handoff §5's verb map), the draft currently cannot re-enter the
  autodraft lane; `entry.revised` "re-admits nothing" today. PR-2 (runtime, not yet deployed —
  awaits its own "D-a deploy") closes that gap. **No new callable verb** — this changes what
  happens after your existing `JeReviewCard` revise/approve flow completes, not what you call.
  Re-verify the JE-review draft lifecycle once PR-2 is live (§6).
- **F-A2/PR-3 (cutover + retirement)** — runs only after PR-2's runtime image is verified live
  (`f-a2-agentic-posting-design.md:441-444`). Retires the old dashboard consumer paths and
  **drops the `kb_rule_proposal` part type from the typed `parts[]` catalog** ("GM-11") and
  relocates `AdjustmentTemplatePanel.tsx`. No W-number given in `PROGRESS.md`; do not build new
  UI on `kb_rule_proposal` — it is scheduled to retire, not to gain a surface.

## 2 · The inbox / needs-you contract

**The kind vocabulary — a closed, 6-value CHECK, read from the live table itself** (this is
already applied via `0103`, not designed-only):

```
packages/db/migrations/0103_f_a7_pi_additive.sql:563-565
kind text not null check (kind in (
  'unattributed', 'collision', 'contradiction',
  'identity_document', 'correction_proposed', 'promotion_proposed'))
```

This is `clara.firm_open_questions` — a **firm-scoped** question carrier with deliberately **no
`client_id` column at all** (`0103:556-558,594-596`, D-11): a question exists *because* no
client is known yet, so a nullable client column would let a caller quietly re-create the
ambiguity it's for. This is the object your cross-scope "needs-you" inbox row renders when Clara
can't attribute a document to any client. It is distinct from the existing per-client
`open_questions` surface (`wake_open_question`, base handoff §4.2) — that one is client-scoped
and already has a dashboard consumer; `firm_open_questions` does not yet.

**The two human resolution verbs — live now, `clara_authenticated`-grantable
(`0103_f_a7_pi_additive.sql:1046-1047`):**

- `resolve_firm_question(p_question uuid, p_resolution text, p_client uuid, p_op_key text)` →
  `0103:637-677`. Marks the row `resolved`, stamps `settled_by`/`settled_at`, and writes
  `named_client = p_client` — this is the human *naming* which client the document actually
  belongs to. Idempotent on `p_op_key` (`_reserve_op`, standard dedupe shape).
- `dismiss_firm_question(p_question uuid, p_reason text, p_op_key text)` → `0103:679-712`.
  Marks `dismissed`; **structurally cannot** carry `named_client` — a CHECK constraint enforces
  it (`ck_firm_open_questions_dismissed_names_nobody`, `0103:591-592`). Dismissing means "this
  was never a real question," never an attribution.

**The identifier-promotion confirm door — also live now, and shared across two producers**
(`0103_f_a7_pi_additive.sql:1048-1049`):

- `confirm_identifier_promotion(p_proposal uuid, p_op_key text)` → `0103:866-904`. One click:
  internally calls `clara.add_client_identifier` (the existing, unchanged identifier door) and
  flips the proposal to `confirmed`.
- `decline_identifier_promotion(p_proposal uuid, p_reason text, p_op_key text)` → `0103:906-...`.

Both operate on `clara.client_identifier_promotions` (`0103:796-821`), whose `kind` CHECK is
`'tin' | 'ssm' | 'bank_account'` (`0103:800`) — **one shared table and one shared human door for
both the F-A7 identity-anchor promotion path and the F-A3 bank-identifier promotion path** (the
renamed `wake_propose_bank_identifier_promotion` in §1.2 writes the same table). Build ONE
promotion-confirm card, not two.

**The B10 flow, walked end to end** (owner ruling, 2026-08-24, the compound-filing case —
`PROGRESS.md:27-28`; mechanism at
`f-a7/pr-4-beta@6892033:packages/db/migrations/UNNUMBERED_f_a7_beta_filing_verb.sql:1169-1390`):
when Clara's filing judgement finds the document's identifying evidence points at client A, but
a *different* client B already has an **active** filing for the same document, unattended filing
refuses. The refusal opens a `firm_open_questions` row with **`kind = 'collision'`** — the same
bucket as the pre-existing name-family collision rung (B2), because both are, to a human, "two
clients are competing for this document" (`:1358-1361`, code comment). The question's
`candidates` array (jsonb) carries the context a human needs to decide: `client_id` (the
proposed client), `existing_filing_client_id` (the competitor), `failing_rungs`, and the
anchoring identifier kind/value that made the proposed client's case (`:1372-1378`). **The
resolution is two steps, not one atomic verb:** (1) `resolve_firm_question` names the winning
client, then (2) the human still calls the existing `file_document` verb (base handoff §4.2,
`apps/dashboard/app/documents/api.ts:189`) to actually file it — the code comment says so
explicitly: *"everything a human needs for a one-click confirm via resolve_firm_question, then
clara.file_document (unchanged)"* (`:1375-1376`). **Do not build a single button that implies
one call where the DB gives you two** (base handoff §5's closing rule, restated: never compose
two verbs into one that implies atomicity the DB doesn't give).

## 3 · Plan-as-document contract — close, live now

`clara.get_close_plan(p_fiscal_year_id uuid) returns jsonb` (`packages/db/migrations/
0064_wave_e_theta_close_plan.sql:154-279`, granted to `clara_authenticated` at `:285`) is the
read surface for the close-plan-as-document pattern. Shape (verbatim field names):

```
{ "fiscal_year": { id, client_id, label, ordinal, starts_on, ends_on, status, fy_end_source },
  "close_run":   { "state": "absent" } | { "state": "present", close_run_id, run_state,
                    started_by, started_at, ended_by, ended_at, end_reason },
  "checks": [ { check_key, drawer, title, applies_when,
                "result": { "state": "not_yet_measured" } |
                          { state, measured, measured_digest, evaluated_at },
                "items": [ { item_key,
                             "attestation": { "state": "absent" } |
                                            { "state": "live"|"stale", attested_by, reason,
                                              attested_at } } ] } ],
  "receipt": { "state": "absent" } | { "state": "present", receipt_id, kind, status, closed_by,
               closed_at, segregation_mode, self_attestation, pl_net_cents,
               retained_earnings_account, closing_tb_digest, gate_digest, books_watermark,
               evaluator_version_ids, dataset_sha256, close_entry_id, closing_position } }
```

Absence is stated at every level (`"state":"absent"` / `"not_yet_measured"`), never omitted or
guessed — build the plan-as-document surface to render those states honestly rather than hiding
the row (`0064:242-278`; consistent with law 2, absence is not evidence, and with the base
handoff §3.5's receipt rule).

**`clara.close_gate_checks` — the intended-vs-actual gate catalog, now 14 rows across 3
drawers** (append-only, a trigger enforces it — `0104_f_a4_pr_1a_measurement_layer.sql:250-255`).
Original 13 (`0056_wave_e_close_model.sql:390-406`) plus one added live today by F-A4 PR-1a
(`0104:622-624`):

| Drawer | Semantics | Checks |
|---|---|---|
| 1 (absolute — no attestation path) | `0056:391-397` | `ar_control_tie` · `ap_control_tie` · `fa_control_tie` · `bank_recon_identity` · `pl_retained_earnings_roll` · `opening_continuity_tie` |
| 2 (default-refuse, per-item attestable) | `0056:398-403`, `0104:622-624` | `depreciation_through_fy_end` · `closing_stock_present` (goods-trading only) · `unapproved_drafts_in_period` · `open_bank_recon_items` · `uncoded_documents` · **`undated_documents`** (new) |
| 3 (advisory, never blocks) | `0056:404-406` | `bank_recon_informational` · `fa_register_tie_view` |

`undated_documents` is the first live firing of the "vacuous-green-gate" repair named in
`PROGRESS.md:242-249` — it measured 4 clients / 28 undated filings on first fire
(`PROGRESS.md:86`). **Render drawer-2 rows as capable of flipping a currently-green client red**
— that's the intended direction, not a bug in your data.

## 4 · The usage meter — build against `get_llm_usage_summary`, live now

`clara.get_llm_usage_summary(p_firm uuid, p_period date, p_client uuid default null)`
(`packages/db/migrations/0110_f_a9_llm_usage_reshape.sql:706-756`, granted to
`clara_authenticated`) returns:

```
table(scope text, call_kind text, calls bigint, input_tokens bigint, output_tokens bigint,
      priced_calls bigint, unpriced_calls bigint, spend_cents bigint)
```

Two points the widget must honor, both load-bearing:

- **`scope` is `'firm'` or `'platform'` — never pre-summed across the two** (`0110:718-727`). A
  NULL-`firm_id` row is a real platform-level call, not an unmetered one (R-L10); billing a
  firm for it would be a lie in a money number. Render the two scopes as separate rows/sections,
  never auto-added.
- **`unpriced_calls` is published, not hidden** — a day with no effective price row shows
  honestly as unpriced rather than silently guessing a spend figure (`0110:702-704`).

**Law 76, quoted verbatim** (`docs/adr/README.md:442-443`): *"Meter, never cap. Per-call usage
is metered and monthly per-firm spend is visible; no budget ever pauses automation."* Base
handoff §5 row 26 already says this: build the rollup read, **build no approve/quota/cap UI of
any kind** — there is no such door to call, by design, and there will not be one.

## 5 · Explicitly NOT in scope — Track B, deferred

None of the following mint any surface this frontend session should build. Each is Track B
(`PROGRESS.md:95-99`), still at `design`/`PR-1 built` state, none merged, none touching the OS
surface:

- **F-T1 SST engine** — PR-1 built + reviewed 2026-08-24; no wake verb, no UI surface named yet.
- **F-T2 payroll deadline calendar** — mints NO wake kind at all (rides the existing
  `wake_record_notification`/`proactive` credential, `PROGRESS.md:96`); blocked on F-A4 PR-1c's
  DDL.
- **F-T3 draft tax computation** — greenfield, PR-0 gate pending, hard-gated on F-A5 PR-1 (now
  live) + F-A4's `close_receipts`; no acceptance oracle exists yet.
- **F-T4 fix queue** — only its PR-1 (the ceremony DSN bridge, ops tooling, no product surface)
  is merged; the rest is beta-era.

## 6 · The 磨合 (integration-seam) list — re-verify each of these when its W-car lands

1. **F-A3's rename.** If you build against `wake_propose_identifier_promotion` from the design
   doc before checking the live allowlist, you will call a name that doesn't exist — the bank
   path is `wake_propose_bank_identifier_promotion`. Read the allowlist at build time, not the
   design doc's original name.
2. **The promotion-confirm consolidation.** `PROGRESS.md:171-173` logs the two wake producers
   (F-A3 bank, F-A7 identity) folding onto one core post-beta. Your confirm/decline UI already
   targets the shared `client_identifier_promotions` table (§2) — this seam is DB-internal and
   should not require a UI change, but re-run your integration test against both producers once
   both are live to be sure.
3. **`kb_rule_proposal` retires at F-A2/PR-3.** If you've built a card for it by then, confirm
   the catalog's `AllCovered`/`NoExtra` compile-time guard (base handoff §3.1) still passes after
   removal — do not leave a dead registered type.
4. **The GM-10 re-admit door changes JE-review behavior with no new verb to detect it by** — the
   only way to notice is functional: revise-then-approve a Clara-authored draft and confirm it
   re-enters autodraft instead of stalling. Add this to your F-A2/PR-2-deploy smoke check.
5. **F-A4's wake wrapper PR is undated.** Before building the ⌘K Do dispatch for close-key ①,
   re-grep `packages/db/migrations/*.sql` for `wake_begin_close` (or query the live
   `wake_fn_allowlist`) — do not assume the §1.2 table's 13 verbs exist just because this
   addendum names them.
6. **`wake_web_search` (F-A8, Tier-2) is not even named yet** — blocked on picking a search
   vendor (`PROGRESS.md:90`). No W-number, no schedule. Do not reserve UI for it.
7. **F-A7 β's merge slot (W2/W3) is not fixed.** Poll `PROGRESS.md`'s F-A7 lane row, not this
   file, for the actual landing window before you flip the filing-clarification card from
   "coming soon" to "live".
