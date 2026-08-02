# Wave D-b design — the builder ABI appendix

> Part of the `wave-d-b-design.md` design of record (§9 points here; split at the 500-line
> ceiling). Same authority, same ladder. Adjudication of record (round 6): rows marked
> "the callee's live law" are deliberately NOT duplicated here — those hashes/envelopes are
> 0037/0038/0040 live facts, harvested at build (the D-a harvest step) and pinned by x42;
> duplicating them into a doc rots.

## A. Public verb signatures (defaults last; floors via `_human_ctx` unless noted)

- `propose_adjustment_template(p_client uuid, p_name text, p_cadence text, p_start_date
  date, p_end_date date, p_auto_reverse boolean, p_lines jsonb, p_memo_template text,
  p_op_key text)` → bookkeeper+; returns `{template_id, status, content_hash}`.
- `sign_adjustment_template(p_client uuid, p_template uuid, p_op_key text)` /
  `retire_adjustment_template(p_client uuid, p_template uuid, p_reason text, p_op_key
  text)` → admin+; return `{template_id, status}`.
- `run_adjustment_occurrence(p_client uuid, p_template uuid, p_period_start date,
  p_period_end date, p_op_key text)` → EXECUTE clara_runtime ONLY, no `_human_ctx` ·
  `run_adjustment_manual(same args)` → bookkeeper+. Both delegate to
  `_adj_run_occurrence_core(p_client, p_template, p_period_start, p_period_end, p_op_key,
  p_actor, p_firm, p_verb)`; return `{status: 'posted'|'drafted', entry_id, run_id?,
  reversal_entry_id?, mode}`.
- `adjustment_run_due(p_client uuid)` → jsonb `{due, template_id?, period_start?,
  period_end?, blocked: [{template_id, reason: 'occurrence_draft_outstanding'}]}` —
  clara_runtime + clara_authenticated.
- `reverse_adjustment_pair(p_client uuid, p_occurrence uuid, p_reason text, p_op_key
  text)` → bookkeeper+; returns `{pair_id, status: 'completed'|'pending',
  occurrence_correction_id, mirror_correction_id}`.
- `approve_pair_reversal(p_client uuid, p_pair uuid, p_op_key text, p_attestation text
  default null)` → bookkeeper+ (distinct checker via the core); returns `{pair_id,
  status: 'completed'}` · `cancel_pair_reversal(p_client uuid, p_pair uuid, p_reason text,
  p_op_key text)` → bookkeeper+; returns `{pair_id, status: 'cancelled'}`.
- `enrol_staff_advance_account(p_client uuid, p_account_code text, p_person_label text,
  p_confirm_dedicated boolean, p_attestation text, p_op_key text)` → admin+
  (`p_attestation` non-blank required — stored verbatim as `enrolment_attestation`, the
  G15 evidence); returns `{enrolment_id, status}` ·
  `retire_staff_advance_account(p_client uuid, p_enrolment uuid, p_reason text, p_op_key
  text)` → admin+.
- `book_staff_advance_application(p_client uuid, p_posting_date date, p_memo text,
  p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text, p_op_key text)` →
  bookkeeper+; p_kind IN ('payroll_deduction','bank_return','claim'); p_lines = the
  draft_entry line array shape (the live 0009 law); **the WCA-R7 branch envelope**: posted
  → `{status:'posted', entry_id, application_ids: [uuid]}` (the hook ran in-verb); drafted
  → `{status:'drafted', entry_id, application_ids: []}` (ids born at the checker's
  approval).
- `complete_staff_advance_particulars(p_client uuid, p_advance uuid, p_purpose text,
  p_reference text, p_op_key text)` → bookkeeper+, set-once (`particulars_already_set`).
- `staff_advance_summary(p_client uuid, p_as_of date)` ·
  `staff_advance_statement(p_client uuid, p_account_code text, p_from date, p_to date)` ·
  `staff_advance_tie(p_client uuid, p_as_of date)` → viewer+ reads (grant-loop idiom;
  output shapes clone the 0040/0041 read conventions — harvested, x42-pinned).
- `resolve_and_book_bank_line(p_client uuid, p_exception uuid, p_disposition text, p_note
  text, p_draft jsonb default null, p_allocations jsonb default null, p_adjustments jsonb
  default null, p_advance_applications jsonb default null, p_charge_cents bigint default
  0, p_charge_account text default null, p_attestation text default null, p_op_key text
  default null)` → owner. `p_disposition IN ('matched_booking','written_off_adjustment')`
  (the enum — `bank_corrective_line` refuses, use the direct verb). `p_draft =
  {posting_date, memo, lines, counterparty?, resolution?}`; `p_allocations` /
  `p_adjustments` = the live allocate/match shapes (callee law). Returns the settle core's
  envelope + `{resolution_exception_id, branch: 'live'|'pending'}`.
- `accept_bank_rule_suggestion(p_client uuid, p_line uuid, p_rule uuid, p_op_key text)` →
  bookkeeper+; returns `{entry_id}`.

## B. The three flags keys (`revise_entry` refuses all three)

`recurring_adjustment = {template_id, op_key, role: 'occurrence'|'reversal', auto_reverse,
reversal_date, period_start, period_end, mode: 'post'|'draft'}` ·
`staff_advance_application = {kind, reason, allocations: [{line_no int, advance_id uuid,
amount_cents bigint}]}` · `bank_rule_suggested = {rule_id, line_id}`.

## C. Template lines · memo grammar · periods

Lines: `[{account_code text, debit_cents bigint≥0, credit_cents bigint≥0, description
text?}]`, ≥2 rows, exactly one of debit/credit positive per row, Σdebit=Σcredit.
`memo_template` is VERBATIM text (no interpolation in v1). The canonical period triple
{period_start, period_end, period_label}: monthly label `to_char(period_end,'Mon YYYY')`,
annual `'FY'||to_char(period_end,'YYYY')`. Occurrence memo = `memo_template || ' — ' ||
period_label`; mirror memo prefixes `'Auto-reversal: '`. Receipts/events/hashes all carry
period_start+period_end (dates); `period_label` is render-only.

## D. New-table DDL blocks

**`clara.staff_advance_accounts`**: id uuid PK · firm_id · client_id · account_code text
NOT NULL · person_label text NOT NULL · enrolment_attestation text NOT NULL (non-blank) ·
active boolean NOT NULL DEFAULT true · enrolled_at timestamptz NOT NULL DEFAULT now() ·
created_by uuid · created_op_key text · retired_by uuid · retired_at timestamptz ·
retired_reason text · retired_op_key text; CHECK active XOR (retired_by+retired_at set);
partial unique (client_id, account_code) WHERE active; version-forward; no-delete +
no-truncate; RLS forced (the firm-scoped 0041 pair).

**`bank_matches` ALTER**: `pending_resolution jsonb` (CHECK `pending_resolution IS NULL OR
status='pending'`) · `resolution_exception_id uuid REFERENCES
clara.bank_line_exceptions(id)` (immutable-once-non-null via the new narrow BEFORE-UPDATE
trigger: raise only when old IS NOT NULL AND new IS DISTINCT FROM old).

**`clara.ea1955_policy`** — the 0016 SYSTEM-REFERENCE idiom (0016:234-248), NOT the
firm-scoped pair: a GLOBAL table, no firm_id; writes only by migrations; authenticated
read. DDL: fact text · effective_from date · effective_to date NULL · note text NOT NULL ·
source_note text NOT NULL (non-blank) · PRIMARY KEY (fact, effective_from). Seed (three
rows, effective_from '2026-08-01', effective_to NULL): `s22_prior_month_wage_cap` — "An
advance of wages not yet earned may not exceed the wages earned in the immediately
preceding month" / source "EA 1955 s.22 (primary text; research record 2026-08-01)" ·
`s24_2c_interest_free_recovery` — "Payroll-deduction recovery of a s.22 advance is lawful
only if no interest is charged" / source "EA 1955 s.24(2)(c)" · `s27_no_interest` —
"Interest on advances is prohibited" / source "EA 1955 s.27".

## E. The op-key matrix (hash = `_hash(jsonb_build_object(...))`, literal fields; the
non-null rule ONCE: a derived pre-reservation returning non-null RAISES
`approve_key_collision`, never replays)

| key | fn | hash fields | reserver | spender | closer |
|---|---|---|---|---|---|
| poster `<op>` | run verb | ('client', p_client, 'template', p_template, 'ps', p_period_start, 'pe', p_period_end) | the core's `_reserve_op` | the core | `_finish_op` |
| `<op>:approve` | approve_entry | ('template', t, 'ps', ps, 'pe', pe, 'role', 'occurrence') | the core, eager pre-lock | `_approve_entry_core` preheld (post mode) | spent; DRAFT mode: claimed-but-unfinished for the draft's life (0041:3412) |
| `<op>:mirror:approve` | approve_entry | ('template', t, 'ps', ps, 'pe', pe, 'role', 'reversal') | the core, eager pre-lock, UNCONDITIONAL | the mirror flip preheld (possibly a later transaction) | spent; non-auto_reverse: deferral marker |
| pair `<op>` | reverse_adjustment_pair | ('occurrence', p_occurrence) | its `_reserve_op` | itself | `_finish_op` |
| `<op>:occ:approve` | approve_entry | ('pair', pair_id, 'half', 'occ') | `_pair_reverse_core`, pre-lock | the core preheld (low-stakes now; high-stakes at `approve_pair_reversal`) | spent; cancel: deferral marker |
| `<op>:mir:approve` | approve_entry | ('pair', pair_id, 'half', 'mir') | same | same | same |
| `approve_pair_reversal <op>` | the verb | ('pair', p_pair) | its `_reserve_op` | itself | `_finish_op` |
| `cancel_pair_reversal <op>` | the verb | ('pair', p_pair, 'reason', p_reason) | its `_reserve_op` | itself | `_finish_op` |
| composite `<op>` | resolve_and_book_bank_line | the full named-arg set | its `_reserve_op` | itself | `_finish_op` |
| `<op>:draft` · `<op>:match` · `<op>:resolve` | the callee verbs | THE CALLEE'S LIVE LAW (harvested) | THE CALLEE | the callee | the callee |
| `<op>:settle` | `_settle_from_bank_line_core` | the settle verb's live 11-field hash (harvested) | **the COMPOSITE, pre-lock** | the core preheld | the core |
| `<op>:draft:approve` | approve_entry | ('draft', entry_id) | the composite, pre-lock | the core preheld | spent or deferral marker |
| `<op>:settle:*` descendants (`:approve`, `:adj:i(:approve)`, `:charge:approve`) | allocate/approve | THE SETTLE CORE'S OWN LAW | THE CORE | the core | the core's deferral markers (0038:4644-4664) |
| producer `<op>` | accept_bank_rule_suggestion | ('rule', p_rule, 'line', p_line) | its `_reserve_op` | itself | `_finish_op` |
| reconciler keys | run_adjustment_occurrence | `adj:<client>:<template>:<period_start>:<rand8>` (the random suffix is load-bearing — abandoned reservations stay harmless) | the sweep mints, the core reserves | the core | `_finish_op` / abandoned-pending |

## F. The refusal-token table (site → errcode → detail.reason; x42 asserts these strings)

| site | errcode | reason |
|---|---|---|
| poster: period outside [start, end] | CLR38 | `period_out_of_window` |
| poster: (template, period) already met | CLR38 | `period_already_met` |
| poster: draft outstanding for the template | CLR38 | `occurrence_draft_outstanding` (also `retire_adjustment_template`'s refusal + `blocked[]`'s reason) |
| poster: template not live | CLR38 | `template_not_live` |
| poster: period not cadence-aligned / not ended | CLR38 | `period_request_invalid` (axes `not_cadence_aligned` / `not_ended`) |
| arm (2): any stale axis | CLR39 | `adjustment_stale` (axis ∈ origin · issuer_receipt · template_retired · lines_changed · period_invalid · mode · line_eligibility) |
| `_wdb_reversal_blocked`: a pair half | CLR39 | `adjustment_pair_locked` |
| `reverse_adjustment_pair` on a solo occurrence | CLR10 | `not_an_auto_pair` |
| hook arm (1) / `withdraw_draft` on a pair draft | CLR39 | `pair_draft_locked` |
| `reverse_entry` on a correction-carrying entry | CLR39 | `correction_entry_irreversible` |
| `reverse_entry` on a disbursement w/ net applications ≠ 0 | CLR39 | `advance_applications_outstanding` |
| the belt: uncovered credit leg | CLR40 | `advance_application_missing` |
| the belt: unregistered debit (backstop) | CLR40 | `advance_movement_unregistered` |
| enrolment: nonzero balance | CLR10 | `enrolment_balance_nonzero` |
| retire: outstanding advances | CLR10 | `advance_outstanding_on_retire` |
| particulars: already set | CLR10 | `particulars_already_set` |
| applications: over-cap at any boundary | CLR39 | `advance_over_application` |
| applications: predates issue | CLR39 | `application_predates_advance` |
| AF-2: ancillary in the park | CLR10 | `pending_branch_ancillary_unsupported` |
| AF-2: `bank_corrective_line` parked | CLR10 | `pending_disposition_invalid` |
| flip: stale declaration | CLR10 | `pending_resolution_stale` |
| unmatch reopen: newer open exception | CLR10 | `exception_reopen_blocked` |
| producer: duplicate suggestion | CLR10 | `suggestion_outstanding` |
| arm (3): stale suggestion | CLR39 | `suggestion_stale` |
| derived-key collision | CLR10 | `approve_key_collision` |
| dispose: second draft | CLR39 | `disposal_draft_outstanding` |
| writers: the 65th edge | CLR37 | `fa_lineage_too_deep` |
