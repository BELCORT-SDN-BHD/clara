# db/v2 layer map — BELCORT shared-DB schema (v2)

Evidence base: every file under `db/v2/` (32 numbered .sql modules + `storage-setup.sql` + `apply.sh` + `README.md` + `MIGRATION.md` + `90-isolation-tests.sql` + `tests/` with 62 functional test files + runner + net stub). All citations are `file:line` against the frozen repo at `C:\Users\zhant\Desktop\initial acc software skillmd`.

**Architecture in one line:** one shared Supabase project; every books table carries `firm_id NOT NULL` + RLS **and FORCE RLS** with a single `firm_id = app.current_firm_id()` policy; `authenticated` gets SELECT (RLS-scoped) + EXECUTE on audited `SECURITY DEFINER` fns and **zero direct INSERT/UPDATE/DELETE**; every DEFINER write fn re-asserts firm scope in code via `app.assert_firm_owns_client()` (`00-foundation.sql:315-334`); `firm_id` is trigger-stamped (`app.set_firm_id` / `set_firm_id_self` / `set_jl_client_firm`), never caller-supplied. Money = `bigint` cents throughout. Apply order is canonical in `apply.sh:21-28` (tables → 15-triggers → fns → 30-grants last; 90-isolation is the gate).

---

## 1. TABLES (58 total in `public` + reference/config)

Legend: RLS✓F = RLS enabled + FORCED + firm-isolation policy; trigger column = firm-stamp BEFORE INSERT trigger. Unless noted, grants = SELECT to authenticated, I/U/D revoked.

### 00-foundation.sql — firm root
| Table | Purpose | Key columns / constraints | RLS | Notes |
|---|---|---|---|---|
| `firms` (:26) | multi-firm root (replaces per-firm singleton) | legal_name, `slug` (global unique partial idx :66), ssm_no, entity_type CHECK, fye_month 1-12, turnover_band CHECK, myinvois_tier CHECK, status active/suspended/deleted | ✓F, policy `id = current_firm_id()` (:404) | no firm_id col — keyed by id |
| `firm_users` (:50) | membership: one auth user → ONE firm + RBAC role viewer<bookkeeper<admin<owner | `user_id uuid UNIQUE` (one-firm-per-user), firm_id FK, role CHECK, status active/removed | ✓F (:410) | writes only via 24b member fns; `guard_last_owner` trigger (15-triggers) |
| `firm_invites` (:76) | pending email invites (owner never invitable) | firm_id, email, role CHECK viewer/bookkeeper/admin, token_hash (reserved, unused), expires_at, accepted_at; partial unique `uq_firm_invite_pending (firm_id, lower(email)) where accepted_at is null` (:87) | ✓F + **admin+ read gate** `caller_rank() >= 3` in the policy (:421-424) | viewer reads ZERO rows |
| `firm_profile_audit` (:456) | append-only firm-settings edit trail | firm_id (explicit, no client parent), actor, before/after jsonb, reason | ✓F (:469) | sole writer = `update_firm_profile` |

Foundation helpers (fns, all `set search_path = public, pg_temp`): `app.current_firm_id()` (JWT firm_id / app_metadata fallback, :98), `app.current_user_role()` (JWT firm_role, membership fallback, :112), `app.role_rank`/`app.caller_rank` (:131-142), `app.assert_can_review()` bookkeeper+ (:152), `app.assert_can_manage_kb()` admin+ (:176), `app.assert_can_manage_firm_settings()` admin+ (:194), `app.audit_actor(p)` — actor constrained to caller's verified email/sub or literal `'agent'`; any other label overwritten (:212-229), `public.belcort_access_token_hook(jsonb)` — SECURITY DEFINER JWT claim injector, strips inbound firm claims, injects from active membership in an ACTIVE firm, **fails OPEN** returning event unchanged on error; EXECUTE only to `supabase_auth_admin` (:252-282), `app.normalize_counterparty` (IMMUTABLE, backs a unique index — FROZEN, :291), `app.normalize_bank_narration` (:305), `app.assert_firm_owns_client(client)` → BLC01 unknown_client / BLC02 cross_firm_denied (:319), `app.set_firm_id` / `set_firm_id_self` triggers (BLC03 on unresolvable firm, :340-373), `app.generate_firm_slug` (DEFINER, global uniqueness probe, :379).

### 10-tables-core.sql — the books core
| Table | Purpose | Key columns | Notes |
|---|---|---|---|
| `clients` (:14) | firm's clients | slug `unique(firm_id, slug)`, entity_type/sst_regime/default_sst_treatment/fye_month/turnover_band/accounting_framework CHECKs, sst_no, myinvois_tier | trigger `set_firm_id_self` |
| `coa_accounts` (:43) | per-client chart | `unique(client_id, acc_code)` — the §11 composite-FK anchor; acc_type, `special_acc_type` (marker: DC/CC/AD/BA/CH/OBE/DRAWINGS/OS/CS/MC/BS), tax_code, is_active | |
| `documents` (:64) | source-doc index | **client_id NULLABLE** (unassigned holding area), `sha256 unique(firm_id, sha256)`, `irbm_uid` partial unique per firm (:106) (Track-C dedupe, no writer yet), kind CHECK (transaction_source/sample_invoice), doc_type CHECK, status CHECK (unassigned_pending/ingested/coded), ocr_cache jsonb, `retain_until` default now()+7yr + `legal_hold` (LHDN), CHECK `storage_path like 'firms/<firm_id>/%'` + no `..` (:96-97) | provenance anchor |
| `journal_entries` (:112) | entry header | client_id NOT NULL, document_id, **`source_doc_sha256`** provenance, status CHECK (drafting/auto_draft/needs_review/needs_decision/approved/rejected), estimated_risk CHECK (auto/review/high-stakes), entry_kind CHECK (standard/closing/opening), confidence numeric(4,3), must_ask_flags text[], reconciled/reconciliation_id/cleared_date, `reverses_entry_id` self-FK + **partial UNIQUE `uq_je_one_reverse`** (one reversal per original, :151), `kb_rule_id` (rule provenance, FK added forward in 12:155-165), `auto_posted_at` (immutable auto-post clock) | |
| `journal_lines` (:161) | entry legs | firm_id+client_id denormalized (trigger `set_jl_client_firm` from parent :183), `unique(entry_id, line_no)`, CHECK not(dr>0 and cr>0), CHECK dr,cr>=0, **composite FK (client_id, account_code) → coa_accounts** — an entry can never cite another client's account | money bigint cents |
| `journal_entry_history` (:203) | append-only entry audit | action CHECK (drafted/approved/edited/rejected/reassigned/recoded/reversed/reversal), actor, before/after jsonb, reason | |

All six: RLS✓F loop (:222-238) + firm-stamp triggers (:241-258).

### 11-tables-recon.sql
| Table | Purpose | Notes |
|---|---|---|
| `client_bank_accounts` (:22) | client's banks → COA leg | `unique(client_id, account_no)`; composite FK (client_id, coa_account_code)→coa |
| `bank_reconciliations` (:41) | one statement-period recon | statement_opening/closing_cents, book_balance/outstanding/difference_cents (DB-computed), status CHECK; deferred FK `journal_entries.reconciliation_id` wired here (:65-74) |
| `bank_statement_lines` (:81) | parsed statement lines | amount_cents SIGNED, `unique(document_id, line_no)`, match_status CHECK, matched_entry_id, is_coded |
| `bank_match_audit` (:116) | append-only match/unmatch trail | recon/line/entry ids are **plain bigint NO FK** (audit survives deletes); feeds the `trg_pn_bank_match` learn-wake |
| `client_recon_hints` (:144) | learned narration→counterparty matcher (vote model) | key `unique(client_id, bank_account_id, narration_key, direction)`; status candidate/confirmed/retired; never auto-matches |

### 12-tables-kb.sql
| Table | Purpose | Notes |
|---|---|---|
| `client_kb_rules` (:19) | active rulebook | `unique(client_id, pattern, account_code)`, composite FK to coa, status candidate/confirmed/retired, confidence numeric(4,3), custom_instruction, `override_count` + `last_overridden_at` (decay), auto-retire at 3 overrides |
| `client_kb_rules_history` (:54) | raw evidence tally | deliberately NOT account-FK'd |
| `kb_proposals` (:72) | promotion proposals | partial unique `uq_kb_proposal_open` — one OPEN per triple (:88) |
| `client_kb_audit` (:96) | append-only KB governance | action CHECK promote/reject/edit/retire/create/decay/flag/alias |
Forward FK `journal_entries.kb_rule_id → client_kb_rules` on delete set null (:155-165).

### 13-tables-client.sql
`client_directors` (:16), `client_email_domains` (:29, unique(client_id,domain)), `client_aliases` (:42, CLIENT's own names for doc→client match), `client_counterparty_aliases` (:62, counterparty variant→canonical map; **functional unique on `app.normalize_counterparty(alias)`** :74), `client_financial_position` (:86, unique(client_id, as_of_date), in_balance flag, generated_by_close_id plain bigint no FK), `client_profile_audit` (:107, append-only), `document_audit` (:125, document_id plain bigint NO FK; action CHECK assign/reassign/code/sample; feeds `trg_pn_doc_triage` wake), `coa_audit` (:148, action CHECK add/retire/reactivate/reclassify). All RLS✓F + set_firm_id.

### 14-tables-ops.sql
| Table | Purpose | Notes |
|---|---|---|
| `proactive_notifications` (:21) | durable agent notices | kind CHECK stuck/new_data/looks_wrong/digest; `ux_pn_open` partial unique (client, dedup_key) open-only; evidence/intent bands |
| `belcort_webhook_config` (:51) | per-firm wake webhook (firm_id PK) | **`webhook_secret` COLUMN-REVOKED from authenticated** (:254-255) — only firm_id/relay_hooks_url/updated_at selectable |
| `dashboard_seen` (:65) | per-USER digest watermark (uuid PK) | UI state |
| `auto_draft_sweep_log` (:82) | append-only auto-post sign-off trail (ADR-034) | per-FIRM watermark = max(reviewed_through_at) |
| `jobs` (:98) | async-job lane | kind/status CHECKs, done/failed clamps, pause/cancel flags, payload jsonb |
| `export_receipts` (:127) | handoff receipts | scope/format CHECKs |
| `export_artifacts` (:156) | durable 7-yr export index | `unique(firm_id, object_key)` + `unique(client_id, fy, content_kind, scope, version)`; CHECK firm-scoped key regex + no `..` (:180-183); retain_until 7yr + legal_hold |
| `client_fy_close` (:197) | year-end close registry | partial unique `uq_fy_close_live (client_id, fy) where reversed_at is null` (:222); retained_earnings_acc_code NULLABLE (partner mode); composite FK (client_id, RE code)→coa; reversed_at/by = reverse-not-delete |

### 15-triggers.sql — cross-cutting triggers
- `app.set_updated_at` on journal_entries + client_kb_rules (:10-24).
- **`app.check_entry_balance`** — DEFERRED CONSTRAINT trigger on journal_entries (INSERT/UPDATE) + journal_lines (I/U/D), SECURITY DEFINER; at commit each affected non-`drafting` entry must have Σdr=Σcr and non-zero value; a moved line must leave BOTH entries balanced (:33-75). This is THE balance invariant.
- `app.fye_period_start/end` date helpers (D18: periods computed, no periods table) (:78-94).
- **`app.guard_last_owner`** BEFORE UPDATE/DELETE on firm_users: a firm must keep ≥1 active owner; raises errcode `check_violation` which 24b fns map to `last_owner` (:103-136).

### 16/17/18/19*-tables
- `chat_sessions` / `chat_messages` (16): per-(firm, **user**) private — RLS policy adds `user_id = app.current_user_id()` (16:67-77); one ACTIVE session per scope via two partial uniques (firm thread client_id NULL vs per-client) (16:36-40); client_id FK **on delete RESTRICT** (chat history survives). `app.current_user_id()` from JWT sub (16:15).
- `client_memory_notes` (17): append-only advisory memory; kind CHECK observation/must_ask/rule_hint/profile; confidence CHECK 0..1; `source_doc_sha256` provenance; never decides an account.
- `tax_rates` (18): **GLOBAL, firm-agnostic** SST rate schedule, PK (treatment, valid_from), effective-dated; seeded (service-6@6, service-8@6→8 on 2024-03-01, sales-5/10, exempt/zero/none); RLS✓F with a read-all SELECT policy; mutated only by migration.
- `ar_invoices`/`ar_receipts`/`ar_allocations`/`ap_bills`/`ap_payments`/`ap_allocations` (19): open-item subledger; every item ANCHORED `entry_id NOT NULL unique(entry_id)` to the GL entry that moved the control account; gross/amount CHECK >0; allocations append-only; statuses closed sets (no 'void' — deliberate, 19:41-44).
- `fixed_assets`/`fa_depreciation` (19b): PPE register; cost GL-anchored (acquisition_entry_id NOT NULL); method CHECK + `fa_method_driver`/`fa_deprn_accounts`/`fa_residual_below_cost` CHECKs (19b:61-69); 3 composite FKs to coa; CA-basis descriptors (ca_class, is_commercial_vehicle, is_new default FALSE = conservative); `fa_depreciation unique(asset_id, period_start, period_end)` = idempotency.
- `recurring_journals(+lines/runs)`, `amortisation_schedules(+postings)`, `client_partners` (19c): templates must balance (fn-enforced); `recurring_journal_runs unique(template_id, occurrence_date)` idempotency; `amortisation_postings unique(schedule_id, period bounds)`; partners: psr numeric(7,6) CHECK 0<psr<=1, `unique(client_id, name)`, 3 composite FKs to coa.
- `tax_ca_rates` / `tax_corp_rates` (19d): GLOBAL effective-dated CA/corp-band authorities (read-all policy, no writes); `tax_computations`: firm-scoped DRAFT worksheet, partial unique `uq_tax_comp_live (client_id, ya) where status='draft'` (19d:123).
- `sst_returns` (19e): SST-02 draft; partial unique `uq_sst_return_live (client_id, period_start, period_end) where draft` (19e:38); overlap-supersede in the fn.
- `signup_admission` (28b:17): fail-CLOSED singleton (is_open default false, org_cap); RLS✓F with a **deny-all** policy (:33-37); read only via `signup_admission_status()`.

---

## 2. FUNCTIONS (by file; **SD** = SECURITY DEFINER, **SI** = SECURITY INVOKER; "guard trio" = `set_config('belcort.via_fn',…)` → `assert_firm_owns_client` → work; all granted EXECUTE to `authenticated` unless "internal")

### 20-fns-journal.sql
- `app.entry_snapshot(entry)` SD internal (:20) — header+lines jsonb for audit rows.
- `compute_sst_leg(amount, treatment, is_gross, posting_date)` **SI STABLE** (:42) — the DB owns the SST number; effective-dated rate from `tax_rates`; raises unknown_sst_treatment / no_sst_rate_for_date / amount_negative.
- `draft_entry(jsonb)` SD (:83) — atomic header+lines in `'drafting'` (balance trigger skips drafting); validates a cited kb_rule_id is a CONFIRMED rule of THIS client (:95-99).
- `finalize_coding(entry, client, status, reason, risk)` SD (:128) — drafting→auto_draft/needs_review/needs_decision; **enforces auto_draft↔risk='auto' binding both ways** (:140-143); stamps immutable `auto_posted_at` on the auto lane; FOR UPDATE; writes 'drafted'/'agent' history.
- `approve_entry(entry, client, actor)` SD (:166) — guard trio + **assert_can_review + audit_actor**; status gate; ≤5¢ residual auto-posts a rounding leg to `980-100` (raises rounding_account_missing) (:196-205); history 'approved'.
- `reject_entry(...)` SD (:217) — review floor + audit_actor; reason_required; un-reconciles the entry + its matched lines + resets the recon (:238-249); **decays the cited rule** via `app.decay_rule_on_override`.
- `edit_entry(jsonb)` SD (:269) — review floor + audit_actor; rejected uneditable; approved→needs_review with reason; header COALESCE-preserved on lines-only edits (:305-310); full line replace; un-reconcile; edit-AWAY from the rule's account decays + clears kb_rule_id, edit-KEEP does not (:337-349).
- `reassign_entry(entry, new_client, actor)` SD (:364) — asserts BOTH source and target clients; review floor; approved unmovable; composite FK validates target accounts; **clears kb_rule_id on move** (:389).
- `add_coa_account(jsonb)` SD (:402) — review floor; row-add only, never DDL; account_exists guard; coa_audit 'add'.
- `set_coa_account_active(jsonb)` SD (:441) — retire=deactivate never delete; **control accounts (special_acc_type NOT NULL) refuse deactivation** (:457-458); idempotent; coa_audit.
- `set_coa_account_type(jsonb)` SD (:484) — presentation-only reclassify; review floor; coa_audit 'reclassify'.

### 21-fns-kb.sql
- `kb_pnl_side` SI IMMUTABLE (:26). `resolve_counterparty(client, name)` SI STABLE (:44) — alias/canonical/passthrough, single-level, deterministic alias-beats-canonical.
- `add_counterparty_alias(jsonb)` SD (:65) — review floor (bookkeeper+, learning-loop class) + audit_actor; canonical collapsed through the map; single-level guard `alias_is_existing_canonical`; upserts on the normalized key; kb_audit 'alias'.
- `app.decay_rule_on_override(rule, client, actor, reason)` SD **internal, revoked** (:130) — the ONLY decay writer; only confirmed rules decay; override_count+1, auto-retire at threshold 3 (constant :134); evidence/confidence untouched; kb_audit 'decay' (+ 'retire').
- `record_kb_evidence(client, pattern, acct, inc)` SD (:170) — no role floor (deliberate: wake-lane callable); alias-resolves pattern; tally upsert; auto-files an OPEN proposal at ≥3 unless a confirmed **or retired** rule covers the triple (retired suppresses re-proposal) (:199-207).
- `promote_proposal` SD (:218) — **admin+ (assert_can_manage_kb)** + audit_actor; unknown_account guard; upsert to confirmed, `greatest(confidence, 0.95)` never downgrades a human 1.000; override_count reset (fresh trust); kb_audit.
- `reject_proposal` SD (:276) — admin+; open-only.
- `create_kb_rule(jsonb)` SD (:304) — admin+; canonical pattern; unknown_account/rule_exists; confidence 1.000; closes matching open proposal; kb_audit 'create'.
- `edit_kb_rule(jsonb)` SD (:350) — admin+; reason_required; rule_conflict guard; custom_instruction blank-clears; kb_audit 'edit'.
- `retire_kb_rule` SD (:406) / `confirm_kb_rule` SD (:439) — admin+; retire reverse-not-delete; confirm = candidate|retired→confirmed with override reset.

### 22-fns-documents-recon.sql
- `assign_document` SD (:30) — review floor + audit_actor; unassigned-only; cross-firm doc re-checked (`document_cross_firm`); storage_path untouched (agent owns the Storage move); document_audit 'assign'.
- `reassign_document` (:73) — both clients asserted; coded docs blocked. `mark_document_sample` (:110), `request_document_coding` (:145) — same pattern; audit rows 'sample'/'code'.
- `ingest_document(jsonb)` SD (:186) — client optional (unassigned lane: firm from JWT, `firm_required`); **idempotent on (firm, sha256)** with OCR-cache fill-forward, never silently reassigns (:206-221).
- `insert_bank_lines(doc, client, lines)` SD (:251) — doc firm re-check; statement-level or per-line bank_account_id; infers sole mapped account; `bank_account_id_required` on ambiguity; validates every line's account belongs to the client.
- `set_document_storage_path(doc, client, key)` SD (:332) — strict key grammar: `firms/{caller-firm}/…`, `_unassigned` or `clients/<own slug>/raw/(ingested|sampleinvoices)`, no `..`, **key must end in this doc's sha256** (:352-375).
- `open_reconciliation(jsonb)` SD (:395) — full required-field guards; bank account + statement doc ownership checks.
- `match_bank_line(line, client, entry, recon, is_coded, actor)` SD (:458) — review floor + audit_actor; all three rows re-checked against client; entry must be posted (auto_draft/approved); writes bank_match_audit 'matched' (human match fires the learn-wake).
- `unmatch_bank_line` SD (:522) — reverse-not-delete of a match; clears the entry's recon fields; audit 'unmatched' (fenced OUT of the wake).
- `record_recon_hint` SD (:580) — vote tally; candidate counterparty may flip, confirmed/retired never silently flips (:602-609).
- `suggest_recon_counterparty` **SD STABLE read** (:619) — advisory only; explicit firm assert (definer bypasses RLS).
- `promote_recon_hint` / `retire_recon_hint` SD (:639/:660) — **admin+** (rulebook class).
- `close_reconciliation(recon, client)` SD (:688) — the DB computes book balance (posted scope ≤ period_end), deposits-in-transit / unpresented split, outstanding, difference; diff=0→completed else unbalanced; **never forces a balance**.
- `reverse_entry(entry, client, actor, reason)` SD (:771) — review floor + audit_actor; reason_required; guards verbatim: `cannot_reverse_close_entry` (closing/opening), `cannot_reverse:<status>` (approved only), `cannot_reverse_a_reversal`, `already_reversed` (+ uq_je_one_reverse backstop), **`entry_anchors_active_schedule`** (amortisation, :802-805); mirror entry dated `current_date` (deliberate: corrections never back-date); both 'reversed'/'reversal' history rows; a reversal of a rule-cited entry writes a non-penalizing 'flag' (no decay).

### 23-fns-subledger.sql (Track 1a)
- Internal: `app.control_account(client, marker)` — resolves DC/CC/OBE by marker, raises missing/ambiguous (:31, granted for INVOKER reads); `app.entry_account_net(entry, code, side)` (:48, revoked); `app.assert_postable_entry` (:62, revoked — entry must belong to client + be posted).
- Writers (all SD, guard trio): `record_ar_invoice` (:83) / `record_ar_receipt` (:116) / `record_ap_bill` (:306) / `record_ap_payment` (:336) — **gross/amount READ from the anchoring entry's control leg, never agent-supplied**; counterparty canonicalised; optional inline allocations.
- `allocate_ar_receipt` (:157) / `allocate_ap_payment` (:373) — settlement matching, NO journal; row-locked; enforces Σ per invoice ≤ gross, Σ per receipt ≤ amount (over_allocate_* raises); **counterparty mismatch rejected except explicit 'contra'** (:188-189); advances open→part_settled→settled.
- `write_off_ar_invoice` (:223) — bad-debt: `specific_writeoff` posts Dr 925-000/Cr control + write_off receipt + allocation; `provision` posts Dr 925-000/Cr 300-100 allowance, receivable stays. The write-off amount is the ONE sanctioned caller-supplied money figure, bounded 0<amt≤outstanding (:249-255). Provisions deliberately not cumulatively capped (:282-284).
- Reads (SI, RLS-scoped): `_aging_core` (:434) → `ar_aging`/`ap_aging` — as-of-aware outstanding (allocations netted only when settling receipt ≤ as_of), 5 buckets, per-counterparty, credit_balances visibility; `_tie_out_core` (:541) → `ar/ap_control_tie_out` — GL control vs subledger net on the SAME posting-date basis, drift surfaced never blocked; `_statement_core` (:597) → `customer/supplier_statement` — running balance with opening.

### 23b-fns-fixed-assets.sql (Track 1b)
- `record_fixed_asset(jsonb)` SD (:37) — cost = entry's Dr to the cost account minus prior claims (batch-aware), race-locked FOR UPDATE on the anchor (:86); account role checks: cost=FA, accum marked 'AD', expense exists AND **acc_type='EP'** (tax-engine poisoning guard, :75-78); method-driver validation.
- `run_depreciation(jsonb)` SD (:131) — DB-computed **cumulative-target** model (cadence-invariant, drift-free); whole-calendar-month proration; straight-line target and reducing-balance (full-year compounding + within-year straight-line); overlap periods SKIPPED + surfaced; per-asset FOR UPDATE; posts ONE balanced journal (Dr expense subtotals / Cr AD subtotals), 'approved' + attributed history; fa_depreciation rows per asset; idempotent per (asset, period). Uses a temp table `_dep`.
- `dispose_fixed_asset(jsonb)` SD (:242) — optional client_id write-gate (`asset_wrong_client`); DB owns NBV + gain/loss; compound journal Cr cost / Dr accum / Dr proceeds / Cr gain or Dr loss; gain/loss account REQUIRED when nonzero (seed has none); depreciate-to-disposal-date is surfaced as a `warning`, never auto-charged (:281-288).
- Reads SI: `fa_register` (:350, lead schedule as-of), `fa_depreciation_schedule` (:389), `fa_control_tie_out` (:425) — register vs GL FA-cost + AD accounts on the anchoring entries' posting_date clock; drift surfaced.

### 23c-fns-adjustments.sql (Track 1c)
- `create_recurring_journal(jsonb)` SD (:35) — template must balance Σdr=Σcr, ≥2 lines, non-negative, no both-sides, active accounts only; past start surfaces occurrences_in_arrears.
- `end_recurring_journal` SD (:103) — reverse-not-delete (ended/canceled).
- `run_recurring_journals(jsonb)` SD (:126) — **per-client advisory lock `belcort_close:<cid>`** (shared with the close family, :142); `through_in_future` rejected; occurrences = start + k*step (day never drifts); idempotent via runs-unique; closed-period occurrences **SKIPPED + surfaced (skipped_closed)**; auto_reverse posts a next-day mirror pair linked via reverses_entry_id; all 'approved' + history.
- `record_accrual(jsonb)` SD (:222) — one-shot accrual + dated auto-reversal pair, atomic; advisory close lock; balance + line-domain guards.
- `create_amortisation_schedule(jsonb)` SD (:294) — total GL-BOUNDED by the anchor's source leg minus prior schedules' claims (canceled schedules release the unposted remainder); anchor row-locked; **reversed anchor rejected** (:322-324).
- `cancel_amortisation_schedule` SD (:357) — reverse-not-delete; reports released/unreleased.
- `run_amortisation(jsonb)` SD (:384) — cumulative-target release; advisory close lock + per-schedule FOR UPDATE (joint-overshoot race); overlap skipped+surfaced; one balanced journal; completed flip.
- `set_client_partners(jsonb)` SD (:493) — partnership-only (llp rejected loudly); ≥2 partners; **Σ psr = 1 exactly**; duplicate-name / shared-drawings / shared-current rejected; capital+current must be CP-typed, drawings marked 'DRAWINGS'; upsert + reverse-not-delete removal; audited to client_profile_audit.
- Reads SI: `adjustments_status(client, as_of)` (:592) — due recurring occurrences (closed-period ones reported unpostable), amortisation catch-up, **anchor-drift/shortfall visibility** (:654-678); `amortisation_schedule_detail` (:693).

### 23d-fns-tax.sql (Track 1d)
- `compute_tax_draft(jsonb)` SD (:45) — advisory close lock; the full DB-computed DRAFT chargeable-income bridge: PBT (P&L excl TX) → certain add-backs (register depreciation EP-only sweep + 923-000; disposal book gain/loss adjustment; 50% entertainment with donation-precedence dual-flag guard, floors at 0; 100% donations) → candidates surfaced not auto-added (WHT, 916-000 fines split, doubtful debts, balancing adjustments, unclassified assets) → capital allowances from the FA register (rate row FIXED at each asset's first-use YA; non-commercial MV QE caps RM100k/RM50k; SVA ≤RM2k at 100% with the RM20k/YA aggregate cap unless MSME + year-2 "assumed fully claimed" amnesia guard; no allowance in the disposal year; Sch 3 para-71 2-year withdrawal confirmation) → chargeable income → msme/standard bands (`tax_corp_rates`) or transparent-entity branch (Form P/B, PSR allocation, CP500) → CP204 instalments; big `assumptions[]` + `confirmations_needed[]` honesty layer incl. non-applied brought-forward relief; supersede-not-delete persist. Raises fy_required/actor_required/client_not_found/approved_donations_negative/no_corp_rates_for_ya.
- `get_tax_computation` SI (:465) — fail-loud client_not_found.

### 23e-fns-sst.sql (Track 1e)
- Internal (revoked): `app.sst_service_target` (:70, cumulative declared-tax per invoice: paid-proration pre-trigger, everything-due post the s.11(2) 12-month trigger, CN-capped), `app.sst_receipt_effective` (:92, posted + never reversed).
- `compute_sst_return(jsonb)` SD (:112) — period must have ended; advisory close lock; regime guard `client_not_sst_registered`; sales tax pure accrual over KNOWN-treatment tagged `460-000` legs; service tax payment-basis via the AR subledger (anchored invoices cumulative-target deltas, cash-direct legs at posting_date, CN receipts in-model only with a tagged 461 Dr leg + effective GL entry); cancelled pairs, reversed settling receipts, uncounted movement (untagged / tag-account mismatch / unknown treatment / opening lumps) all SURFACED never counted; bad-debt-relief A×C/B candidates (CN-netted), unallocatable-CN 13(a) manual candidates, unallocated advances; per-tax payable floors at 0 with explicit excess-carried numbers so form_map 12−13=14 always holds; late-penalty tier warning; **overlap supersede** of any live draft; jsonb accumulators (not pg_temp — DEFINER hijack fold H4, :130-131). Note: **hardcodes literal account codes 460-000/461-000** (not marker-resolved).
- `get_sst_return` SI (:823) — fail-loud.

### 24-fns-onboard.sql
- `create_firm(jsonb)` SD (:37) — THE one write fn without assert_firm_owns_client (bootstrap); requires a logged-in sub; one-firm-per-user (`user_already_in_firm`); **`assert_signup_admitted()` gate** (:59); validation + tier derivation; mints slug; inserts firms + owner firm_users row.
- `seed_client_coa(client)` SD (:111) — copies the ~90-account LHDN-reconciled master COA (marker-seeded controls: 300-000 DC, 400-000 CC, 310-000/310-001 BA, 320/325 CH, 100-950 OBE, 100-900 DRAWINGS, 460/461 SST payable split, 980-100 rounding, 415-000 non-resident WHT, 950-000 TX); idempotent on conflict do nothing. **No role floor.**
- `onboard_client(jsonb)` SD (:258) — validation, per-firm slug pre-check, insert (firm from trigger) + post-insert assert; seeds COA; loads bank/directors/domains/aliases with COA-code validation. **No role floor.**
- `seed_client_knowledge(jsonb)` SD (:367) — dual-seed: CONFIRMED rules (via create_kb_rule, conf 1.000) + memory notes (via record_memory_note); atomic + idempotent; fail-loud validation.
- `update_client_profile(client, actor, patch)` SD (:434) — review floor + audit_actor; full validation; **replace-set semantics** for bank accounts (delete-missing; coa_account_code deliberately preserved on survivors) and directors/domains/aliases (delete-all + reinsert); default_sst_treatment preserved when key absent; client_profile_audit.
- `update_firm_profile(actor, patch)` SD (:535) — **admin+ (assert_can_manage_firm_settings)**; NO firm arg — operates only on `app.current_firm_id()` (zero cross-firm surface); re-derives myinvois_tier; firm_profile_audit.
- `add_bank_account(jsonb)` SD (:595) — review floor; requires an ACTIVE COA leg (`coa_account_missing`); duplicate guard.

### 24b-fns-members.sql (all SD; firm scope from JWT; message-code raises)
`create_invite` (:31, admin+ rank≥3, own firm only, roles viewer/bookkeeper/admin, case-insensitive pending dedupe), `revoke_invite` (:64, atomic pending-only delete), `accept_invite` (:81, email-confirmed invitee joins oldest valid invite; FOR UPDATE; one-firm-per-user → `already_member_of_firm`), `my_firm` (:134, sub-resolved membership — works without the token hook), `my_pending_invite` (:148), `list_firm_members` (:166, rank≥1, roster rank-ordered, display_name NULL), `set_member_role` (:183, admin+, owner transfer-only, `forbidden_rank`, check_violation→`last_owner`), `remove_member` (:203, DELETE frees the one-firm slot; last_owner surfaced before cannot_remove_self). No via_fn markers in this file.

### 25-fns-ops.sql
- `_trial_balance_core` SI (:53) — posted scope; all-time excludes close machinery; **raises `trial_balance_unbalanced`** (:104-106); → `client_trial_balance` (:124, FY window from CURRENT fye_month — D18), `trial_balance_range` (:141).
- `record_export` SD (:161), `record_export_artifact` SD (:190) — server-side derived firm-scoped object key, closed class set, write-once version under an advisory lock (`hashtext`, :254), row reserved before bytes.
- **`app.je_closed_period_guard`** BEFORE I/U trigger on journal_entries (:297-322) — rejects any posting_date ≤ the latest live close period_end unless the row is the close machinery's own entry under via_fn record_/reverse_year_end_close. THE closed-period hard lock.
- `record_year_end_close(client, fy, actor, first_year_zero_opening, tax_provision_cents, tax_exp_acc, tax_liab_acc)` SD (:346) — advisory close lock; guards: actor_required, fy_already_closed, opening_balances_required (first close), **g1 `unreviewed_entries_in_period`** hard-block (:411-418), **g2 `prior_fy_not_closed`** close-in-order (:422-434); optional tax provision (transparent entities HARD-blocked `tax_provision_not_applicable`; TX/CL role checks; `tax_provision_already_posted` double-count guard :441-482); pending-adjustments visibility (non-blocking); TB re-asserted (`trial_balance_unbalanced` refuses the close); `unclassified_acc_type` exhaustiveness guard (:496-505); closing sweep of nominals + DRAWINGS-marked accounts (marker not literal code); **per-partner mode** (psr sum=1, shared-drawings reject, `unmapped_drawings_account` fail-loud, residual cent to largest PSR) or single-RE (missing/ambiguous RE raises); opening entry carries every real account's post-closing balance; client_financial_position snapshot (close-generated only clobbers close-generated); unswept_auto_posts surfaced.
- `reverse_year_end_close` SD (:783) — bespoke mirrored reversals dated to match, linked, under via_fn; deletes only the close-generated snapshot; stamps reversed_at/by (frees uq_fy_close_live).
- `record_opening_balances(client, as_of, lines, actor)` SD (:835) — balanced-lines check (`opening_balances_unbalanced`), one 'opening' approved journal + FP snapshot.
- Jobs: `create_job`/`advance_job`/`finish_job`/`fail_job`/`request_pause`/`request_resume`/`request_cancel` SD (:912-1045) — id-keyed fns scope by `firm_id = current_firm_id()` on the lock SELECT; terminal idempotence; done/failed clamped to total; `get_job` SI (:1049) **redacts `payload.result.body`**; `list_jobs` SI (:1069).
- `firm_activity_feed(limit, before, filters)` SI (:1103) — **gated `assert_can_review`** (:1114); 6 union sources (journal history / kb audit / profile audit / doc audit / export receipts / bank match audit; dml_audit source dropped per ADR-030); fixed-width chronological cursor; reverse-lineage enrichment (reversible excludes close machinery).
- Sweep: `auto_draft_review_batch` SI (:1218, watermark keyed on `auto_posted_at`, clamp 1..500) + `acknowledge_auto_draft_sweep` SD (:1270, p_through REQUIRED = echo the batch's as_of, clamped ≤ now; delta batch_count).
- Notifications: `record_proactive_notification` SD (:1302) — validation fail-closed on kind/evidence/intent; open-dedup; **cap 5 open/day/client → digest rollup**; `mark_notifications_read` SD (:1377, firm-scoped, **no role floor**), `resolve_notification` SD (:1391, **review floor**).
- Webhook emitters (SD, revoked, exception-wrapped so books writes never abort): `belcort_proactive_emit` (:1415, per-firm config lookup by NEW.firm_id; minimal envelope, subject/verb extras only for the with_subject audit sources; secret as Bearer) and `belcort_books_sync_emit` (:1553, statement-level, firm from caller JWT; SSE nudge only).

### 25b-fns-opening.sql (Track 3 slice 9 carry-down; all SD guard trio)
`seed_opening_ar_invoice` (:40) / `seed_opening_ap_bill` (:81) — per-item opening JE (Dr/Cr control ↔ OBE by marker) + reuse of record_ar_invoice/record_ap_bill; `seed_opening_fixed_asset` (:128) — Dr cost / Cr AD (historical) / Cr OBE (NBV) + record_fixed_asset + **fa_depreciation BASELINE row** so run_depreciation continues from NBV; `seed_opening_carry_forward` (:206) — atomic orchestrator: items + lump gl_lines + DB-computed OBE plug; raises `opening_carry_forward_unbalanced` and asserts **OBE nets to 0** (`opening_balance_equity_not_nil`, :279-284); FP snapshot.

### 26-fns-session.sql
`ensure_chat_session(client?)` SD (:14, per-scope active; unique-violation race re-select), `append_chat_message(jsonb)` SD (:44, session must be caller's + active BLC06; 64KiB cap BLC04; scope stamp firm-guarded + no contradictory client stamp), `set_active_run` SD (:71), `reset_chat_session(client?)` SD (:89, archive + mint, idempotent on race). **`agent_select(p_sql)` SI VOLATILE** (:119) — the freeform read surface: RLS scopes it (INVOKER); guards = `^(select|with)` anchor, single statement, write/DDL **verb word-scan**, 5s statement_timeout. Lexical only — a SELECT-wrapped SECURITY DEFINER fn call passes (the known SDT-001/SEC-001 mutation-bypass path).

### 27-fns-memory.sql
`record_memory_note(jsonb)` SD (:10) — the only client_memory_notes writer; firm guard; **no via_fn set, no audit_actor constraint, kind validated only by the table CHECK**.

### 28-fns-reads.sql (Track 1f dashboard-direct reads; all SI STABLE, fail-loud `client_not_found`)
Indexes added: `ix_entries_client_cursor` (posting_date desc, id desc) (:70), `ix_documents_client_ingested` partial (:74). Cursor helpers `app.je_cursor`/`app.gl_cursor` (:84-95, fixed-width, decoded to sargable row-value predicates).
- `journal_entries_page(jsonb)` (:112) — relay-parity picker (excludes contra BA/CH/DC/CC, 980-100, TX, and 460/461 — the DRIFT-#5 fix; P&L preference; windowed '+N'); SST leg lateral (stored cents, never recomputed); statuses[] checkbox semantics ([]=match nothing); evidence-band filter + durable authorship (`coding_source` rule/matched/auto/human from kb_rule_id / reconciliation_id / a 'drafted'-by-'agent' history row); keyset paging; per-row Σdr/Σcr + balanced.
- `journal_entries_band_counts(jsonb)` (:289). `journal_entry_detail(client, entry)` (:343) — typed header+lines+doc+history; fail-loud entry_not_found.
- `client_general_ledger(jsonb)` (:445) — **SEGMENTED by live year-end closes**: opening floors at the latest live close boundary; a window spanning a boundary raises `gl_window_spans_close`; running balance with per-page re-basing.
- `client_financial_statements(client, fy, comparative, comparative_fy)` (:587) — MPERS SoCI (standard entries only) + SoFP (cumulative WITHIN segment); unswept nominal residue split current-FY vs prior-open-years; `in_balance` = presented A=L+E identity; `unclassified` + `presentation_complete` honesty; framework basis line.
- `client_trial_balance_comparative` (:802), `client_overview` (:825, top-level money.in_balance dot contract), `firm_needs_attention` (:912), `firm_digest` (:937) + `mark_digest_seen` SD (:965, per-user watermark upsert re-stamping firm).

### 28b-fns-signup-admission.sql
`assert_signup_admitted()` SD (:45) — fail-CLOSED: missing row/is_open=false → `signups_closed`; org_cap → `org_cap_reached`. `signup_admission_status()` SD (:67) — dashboard pre-gate read.

---

## 3. TRIGGERS (complete inventory)

| Trigger | Table | When | Function | Purpose |
|---|---|---|---|---|
| trg_clients_set_firm | clients | BI | set_firm_id_self | firm stamp from JWT |
| trg_jl_set_client_firm | journal_lines | BI | set_jl_client_firm | client+firm from parent entry (10:245) |
| trg_<t>_set_firm (~30 tables) | all client-scoped tables | BI | set_firm_id | firm from client parent / JWT |
| trg_belcort_webhook_config_set_firm, trg_dashboard_seen_set_firm, trg_auto_draft_sweep_log_set_firm | firm-direct tables | BI | set_firm_id_self | (14:258-268) |
| trg_entries_updated / trg_kb_rules_updated | journal_entries / client_kb_rules | BU | set_updated_at | (15:18-24) |
| **trg_je_balance / trg_jl_balance** | journal_entries / journal_lines | DEFERRED constraint AI/U(/D) | check_entry_balance | Σdr=Σcr at commit; skips 'drafting' (15:69-75) |
| **guard_last_owner** | firm_users | BU/BD | guard_last_owner | ≥1 active owner (15:133) |
| **trg_je_closed_period** | journal_entries | BI/BU | je_closed_period_guard | posting into a closed period blocked (25:320) |
| trg_pn_je / trg_pn_je_upd | journal_entries | AI / AU of status | belcort_proactive_emit('je_needs_human') | needs_review/decision wake; 'rejected' silent (D10) (25:1464-1472) |
| trg_pn_kbp | kb_proposals | AI status=open | emit('kb_proposal_open') | creator-agnostic (25:1479) |
| trg_pn_recon(+_upd) | bank_reconciliations | AI/AU unbalanced | emit('recon_unbalanced') | (25:1484) |
| trg_pn_doc | documents | AI status<>coded | emit('new_document') | (25:1494) |
| trg_pn_bsl | bank_statement_lines | AI not coded | emit('new_bank_line') | (25:1499) |
| trg_pn_doc_triage | document_audit | AI actor≠'agent' | emit('document_triaged','with_subject') | human triage verb wake (25:1526) |
| trg_pn_workbench | journal_entry_history | AI actor≠'agent' AND action∈(approved/edited/rejected) AND via_fn∈(approve/reject/edit_entry) | emit('workbench_committed','with_subject') | learn-wake; engine postings fenced out (25:1531) |
| trg_pn_bank_match | bank_match_audit | AI actor≠'agent' AND action='matched' | emit('bank_line_matched','with_subject') | human self-reconcile teaches (25:1545) |
| trg_bs_je/jl/doc/kbr/kbp/pn/ea | 7 tables | AFTER statement | belcort_books_sync_emit | SSE 'books changed' nudge only (25:1581-1607) |

---

## 4. GRANTS (30-grants.sql + per-file posture)

- Per-file: every table gets `grant select to authenticated` + `revoke insert, update, delete from authenticated, anon`; every intended fn `grant execute to authenticated`; internal helpers explicitly `revoke ... from public, anon, authenticated`.
- `30-grants.sql:11-17`: strips the default PUBLIC EXECUTE from all fns in `public` + `app`; anon gets nothing (tables + fns); `authenticated` gets schema USAGE on public+app (:21-22).
- Column-level exception: `belcort_webhook_config.webhook_secret` revoked from the request plane (14:254-255).
- `firm_invites` SELECT is granted but the RLS policy narrows reads to admin+ (00:421).
- `belcort_access_token_hook`: EXECUTE only to `supabase_auth_admin` (00:277-282).
- **Documented-but-not-applied hardening** (30:24-43): reassigning DEFINER fn ownership to a non-BYPASSRLS `belcort_definer` role is left as a deploy step — today the fns are owned by the migration role, which bypasses RLS, so the firm boundary inside every DEFINER fn rests solely on `assert_firm_owns_client`.
- RBAC floors actually enforced in fns: **bookkeeper+** = approve/reject/edit/reassign entry, doc triage quartet, match/unmatch bank line, add/retire/reclassify COA, add_bank_account, add_counterparty_alias, update_client_profile, resolve_notification, firm_activity_feed, reverse_entry. **admin+** = KB rulebook (promote/reject/create/edit/retire/confirm), recon-hint promote/retire, update_firm_profile, member fns (rank≥3). Everything else (see NOTES N2) is firm-scoped only.

---

## 5. storage-setup.sql

- One private bucket `firm-docs` (public=false) (:18-20).
- RLS on `storage.objects`: `firm_docs_read` / `firm_docs_insert` for authenticated, gated on path prefix `firms/{current_firm_id()}/` (:43-53).
- **NO UPDATE policy = write-once** (an overwrite would break the sha256↔bytes bond); **NO DELETE policy** = reverse-not-delete + LHDN 7-yr retention (:55-59).
- `service_role` bypasses RLS: the runtime's single storage capability (`upload_document`, upsert:false, tool-layer firm-prefix guard) — full storage-admin, containment is one code closure (:33-38).
- Key taxonomy documented (:61-69): raw = `firms/{firm}/clients/{slug}/raw/(ingested|sampleinvoices)/[year/]{sha256}.{ext}` or `firms/{firm}/_unassigned/{sha256}.{ext}`; generated = `firms/{firm}/clients/{slug}/{period}/{class}/{sub}/{ts}__{scope}[__asof]__v{N}.{ext}`.
- Apply caveat: policy DDL needs table ownership `postgres` lacks over the pooler → run from Dashboard SQL editor (:8-12).

## 6. 90-isolation-tests.sql — what the gate actually proves (21 test groups, 1844 lines)

1. **Structural**: EVERY public base table has RLS + FORCE + ≥1 policy (:54-66).
2. RLS read isolation across 11 book tables + firms; direct table INSERT blocked; within-firm draft→finalize→approve works as `authenticated` (:71-118).
3. Cross-firm BLC02 on approve/reject/edit/reassign/add_coa (:125-143).
4. Cross-firm BLC02 on **30 write fns** (kb/doc/recon/hints/onboard/carry-down seeders/reverse) — the guard must fire BEFORE any other error (:148-186).
5. Ops fns cross-firm (export/close/reverse-close/opening/notification) + id-only mark/resolve no-op cross-firm, victim row verified untouched (:189-215).
6. Chat: per-firm AND per-user isolation; direct write blocked; `agent_select` firm-scoped + read-only (update/multi-statement/delete rejected); cross-firm append BLC06; per-scope sessions + scoped reset + read-only archive + foreign-scope BLC02 (:218-329).
7. Memory notes: isolation, direct-write blocked, cross-firm record denied (:334-364).
8. KB provenance + decay: kb_rule_id set at draft; cross-firm/non-confirmed citation rejected; reject decays (evidence untouched); 3 overrides auto-retire (confidence intact); edit-away decays + clears provenance vs edit-keep; reassign clears provenance without stranded decay; reverse soft-flags only; retired suppresses re-proposal; firm-B sees no decay state (:374-570).
9. Counterparty aliases: variants collapse to ONE tally; resolve semantics; canonical stored on rules; divergent-case canonical collapse; single-level guard; audited; **per-CLIENT** scope (sibling unaffected); cross-firm isolation + direct write blocked (:577-673).
10. Auto-draft sweep: batch shows the unsupervised lane (needs_review excluded, DB-owned amounts + account codes); sign-off advances watermark, entries STAY auto_draft; new auto-post reappears; **auto_posted_at clock (not draft time)**; delta batch_count; cross-firm sealed; direct log write blocked (:681-774).
11. Dual-seed: creates confirmed rules + notes; idempotent; ATOMIC both directions (bad account, bad note kind); cross-firm denied (:780-853).
12. irbm_uid: per-firm duplicate rejected, NULLs unconstrained, same UID allowed cross-firm (:859-887).
13. Subledger: tie-out exact cents; aging bucket; write-off preserves the tie; over-allocation rejected; direct write blocked; 6 writers cross-firm; read isolation (:898-1000).
14. FA: straight-line 120000/48=2500 exact; register ties to GL; idempotent re-run; disposal gain journal + retire + stops depreciation; direct write blocked; 3 writers cross-firm; read isolation (:1010-1094).
15. Adjustments: recurring run posts + idempotent; direct writes blocked; 8 writers cross-firm (incl. a REAL cancel target so BLC02 is proven, not not_found); read isolation on 6 tables (:1102-1171).
16. Tax draft: worksheet structure + supersede; direct I/U/D blocked (incl. 42501 on own row); global rate tables readable, never writable; cross-firm compute denied; foreign read raises client_not_found (:1179-1238).
17. SST return: not-registered guard; NIL draft valid; month-aligned due date exact; recompute + overlap supersede; direct I/U/D blocked; cross-firm + foreign-read (:1248-1321).
18. Read surface: picker semantics exact (code 910-000, candidate_count 2); detail/GL running-balance/FS identity/overview/digest shapes; 5 client-keyed reads raise client_not_found cross-firm; digest DELTA cross-firm invisibility; dashboard_seen I/U/D blocked + mark_digest_seen as authenticated (:1331-1474).
19. Minted wake-credential JWT shape (synthetic sub, firm_role bookkeeper): own-firm works, cross-firm sealed; **webhook_secret column sealed** while non-secret columns readable (:1483-1549).
20. Access-token hook: member gets firm_id/firm_role; existing claims survive; injected claim readable by current_firm_id; stale claims stripped for memberless user; suspended firm grants nothing; malformed event fails OPEN; request plane can NEVER execute the hook; **20d**: viewer denied on the 4 re-homed bookkeeper+ surfaces, bookkeeper passes (:1559-1670).
21. Members/invites: roster rank-ordered; invite dedupe case-insensitive; viewer reads zero invites + can't invite; accept joins at invited role; one-firm-per-user on accept; guard_last_owner blocks demote/remove of sole owner; role-change happy path; cross-firm member ops denied + invite isolation; direct firm_users/firm_invites writes blocked (:1681-1842).

**tests/ functional suite** (62 files + `run-functional.sh` + `00_net_stub.sql` + README): fresh PG16 rig (initdb → Supabase role/auth stubs with real column types → pg_net stub recording `net._test_calls` with a simulated-failure mode → apply 00..30 with a completeness tripwire for unlisted modules → isolation gate → one firm + owner claims → per-file BEGIN/ROLLBACK). Business-logic coverage per fn family: approve/reject/edit/reverse entries, balance trigger, closed-period lock, close (+unreviewed guard, reverse, carry-forward, opening balances, BEE CREATIVE real-FY2024 golden test `bee_carry_down_close_test.sql`), documents (triage, ingest idempotency, storage path), bank (accounts, lines, match actor, recon contract, hints), KB (create/edit/retire/confirm/promote/reject/evidence/RBAC), subledger/FA/adjustments/tax/SST engines (exact-cents), reads (dashboard, TB, GL, FS, overview, feed, digest), jobs, notifications (+actions, webhooks, wake sources), members, signup admission, fresh-bootstrap smoke, estimated-risk check, dml audit.

---

## 7. NOTES — suspicious / inconsistent / dead things observed in passing

- **N1 (known, confirmed in code): `agent_select` write-bypass.** The read-only guard is purely lexical (`26-fns-session.sql:130-135`): it blocks write *verbs* as words but `select public.approve_entry(...)` (or any SECURITY DEFINER write fn wrapped in a SELECT) sails through — the fn names aren't verbs. Matches the SDT-001/SEC-001 known issue in CLAUDE.md; structural scoped reads are a target requirement, not as-built.
- **N2 (RBAC coverage gap): the Track-1 engines have NO role floor.** `assert_can_review`/`assert_can_manage_kb` gate only the re-homed relay surfaces (§4). A **viewer** (or the firm_role-less wake credential — `current_user_role()` falls back to the membership row, so a real viewer member is rank-1 but still passes any fn without a floor) can call: `record_year_end_close`/`reverse_year_end_close` (25:346/783), `record_opening_balances`, all `seed_opening_*` (25b), `run_depreciation`/`dispose_fixed_asset`/`record_fixed_asset` (23b), the recurring/accrual/amortisation posters (23c), `write_off_ar_invoice` + all subledger writers (23), `compute_tax_draft` (23d), `compute_sst_return` (23e), `onboard_client`/`seed_client_coa`/`seed_client_knowledge` (24), `record_export`/`record_export_artifact`, the whole jobs lane, `acknowledge_auto_draft_sweep` (a viewer can sign off the oversight sweep! 25:1270), `record_proactive_notification`, `mark_notifications_read`, `draft_entry`/`finalize_coding` (an entry can be pushed into the unsupervised `auto_draft` lane by any member). Isolation TEST 20d only proves the 4 re-homed surfaces. Firm isolation is airtight; intra-firm privilege is thin.
- **N3 (actor attribution not constrained on engines):** `app.audit_actor` is applied only in the review/triage/KB family. The engines accept free-text `p_actor` verbatim into `journal_entry_history` / `client_fy_close` / receipts / logs (e.g. run_depreciation 23b:137, record_year_end_close 25:346, allocate_* 23:162, record_export 25:171, acknowledge_auto_draft_sweep 25:1288 which coalesces blank→'agent'). Also, by design `audit_actor` lets ANY caller label a write `'agent'` (00:216-217) — which additionally **suppresses the human-verb learn-wake fences** (trg_pn_doc_triage / trg_pn_workbench / trg_pn_bank_match all fence on `actor is distinct from 'agent'`), an accepted-with-visibility residual documented at 22:39-41.
- **N4 (grant-hardening is not future-proof):** 30-grants revokes PUBLIC execute from *existing* fns only; there is no `ALTER DEFAULT PRIVILEGES`. Any fn applied live AFTER 30-grants (the documented hotfix path, README:288-292) silently gets the Postgres default PUBLIC EXECUTE unless its migration repeats the revoke. Same for the not-applied `belcort_definer` ownership hardening (30:24-43) — the DEFINER owner today has BYPASSRLS.
- **N5 (via_fn / audit inconsistencies):** `record_memory_note` (27) sets no `belcort.via_fn`, doesn't constrain actor, and validates `kind` only via the table CHECK; the 24b member fns, 26 session fns and 28b signup fns also skip via_fn (harmless today — nothing consumes the marker except the closed-period guard and trg_pn_workbench — but the "every write fn FIRST sets via_fn" rule in README:56-58 is not universal).
- **N6 (literal account codes in engines):** `compute_sst_return` keys the entire return on literal `'460-000'`/`'461-000'` (23e:196, :249, etc.) and `compute_tax_draft` on `'916-000'`/`'923-000'`/`'925-000'` (23d:101, :168, :408), while the subledger/close resolve controls by `special_acc_type` marker precisely so re-keyed COAs can't break them (23:20-21). A client whose SST-payable accounts were added under different codes would produce a silently-empty return (the uncounted-movement surface only scans those two literal codes too).
- **N7 (advisory-lock hash inconsistency):** `record_export_artifact` uses 32-bit `hashtext` (25:254) while the close family uses `hashtextextended` (23c:142 etc.) — small cross-key collision window on the artifact version lock; harmless (worst case serialization) but inconsistent.
- **N8 (README drift):** README claims "**57 tables**" (README:175); counting the modules yields 58 public tables including `signup_admission` (28b post-dates the count). Also README's status block calls the suite "54 functional files" / "56 functional files" at different paragraphs while `tests/` now holds 62 `*_test.sql` files — narrative accretion, the runner is the truth.
- **N9 (dead/reserved objects):** `firm_invites.token_hash` is generated (md5(uuid||clock)) but explicitly unused ("reserved capability", 00:82, 24b:53); `documents.irbm_uid` has a unique index + test (TEST 12) but **no populating fn** (10:69-74, deliberate Track-C forward-fold); the `net._fail` failure-injection table exists only in the CI stub.
- **N10 (update_client_profile hard-deletes list rows):** directors/domains/aliases are delete-all + reinsert and bank accounts delete-if-missing (24:484-511) — a bank account referenced by `bank_reconciliations`/`bank_statement_lines` (FK NO ACTION) will make the profile save fail with a raw 23503 rather than a domain error; also the delete-reinsert pattern churns ids that anything holding a bank_account_id may have cached. Reverse-not-delete is NOT observed here (unlike everywhere else).
- **N11 (subledger gross snapshot staleness):** open-item gross is snapshotted from a possibly-still-mutable `auto_draft` anchor; a later edit leaves the stored gross stale — documented + surfaced via tie-out (23:58-61, fold #5) and via compute_sst_return's drift check (23e:269-277), but nothing blocks recording against auto_draft.
- **N12 (viewer can read everything):** reads are ungated by design (PRD supervised-autonomy law) except `firm_activity_feed` (bookkeeper+). Note the asymmetry: a viewer cannot see the activity feed but CAN read every underlying audit table directly via RLS SELECT (journal_entry_history, client_kb_audit, document_audit, bank_match_audit are all `grant select to authenticated`) — the feed gate is presentation-only, not data confidentiality.
- **N13 (balance trigger 'drafting' escape):** the deferred balance check skips `status='drafting'` (15:52) — an unbalanced entry can persist indefinitely if never finalized; it lists in `journal_entries_page` (documented contract: rows carry `balanced` and the grid must badge them, 28:43-46). Cosmetic, but "entries must balance" holds only for postable statuses.
- **N14 (tests never exercise `authenticated` in the functional suite):** functional tests run as the migration role with one firm (tests/README:17-19) — grants/RLS are only proven by the isolation suite; a functional regression that accidentally depends on privileged reads would not notice. The isolation suite covers the request-plane behaviour, so this is a division of labour, not a hole — but the two must always run together (run-functional.sh does both).
- **N15 (webhook secret at rest):** `belcort_webhook_config.webhook_secret` is stored plaintext in the DB (column-sealed from the request plane, readable by DEFINER emitters + service/migration roles). Bearer-grade material in a table, acceptable-by-design but worth flagging for the rebuild.
- **N16 (mark_notifications_read has no floor while resolve does):** any member (viewer) can mark notifications read (25:1377) but resolving needs bookkeeper+ (25:1395) — plausible intent (read-tracking vs closing a work item) but undocumented asymmetry.
