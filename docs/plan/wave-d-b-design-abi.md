# Wave D-b design — the builder ABI appendix

> ⚠️ **DESIGN-TIME record. The AS-BUILT truth is [`wave-d-b-asbuilt.md`](./wave-d-b-asbuilt.md)
> (+ `-part2.md`).** The build shipped as a **four-slice split** (`0042`/`0043`/`0044` LIVE,
> `0045` D-b2 HELD), not the single `0042` monolith; the `bank_rule_suggested` producer's grant
> moved to `0045`. **See ADR-058.** This appendix's completeness claim is four rounds stale
> (as-built ladder r11) — signatures and tokens here are design-time, and the live catalog is
> the authority. Body unchanged on purpose.

> Part of the `wave-d-b-design.md` design of record (§9 points here). Same authority, same
> ladder. Adjudication (round 6): rows marked "the callee's live law" are deliberately NOT
> duplicated — those are 0037/0038/0040 live facts, harvested at build and pinned by x42.

## A. Public verb signatures (defaults last; every act op-keyed; floors via `_human_ctx`)

- `propose_adjustment_template(p_client uuid, p_name text, p_cadence text, p_start_date
  date, p_end_date date, p_auto_reverse boolean, p_lines jsonb, p_memo_template text,
  p_op_key text)` → bookkeeper+ → `{template_id, status, content_hash}`.
- `sign_adjustment_template(p_client uuid, p_template uuid, p_op_key text)` /
  `retire_adjustment_template(p_client uuid, p_template uuid, p_reason text, p_op_key
  text)` → admin+ → `{template_id, status}`.
- `run_adjustment_occurrence(p_client uuid, p_template uuid, p_period_start date,
  p_period_end date, p_op_key text)` → EXECUTE clara_runtime ONLY ·
  `run_adjustment_manual(same)` → bookkeeper+. Both → `_adj_run_occurrence_core(p_client,
  p_template, p_period_start, p_period_end, p_op_key, p_actor, p_firm, p_verb)` →
  `{status: 'posted'|'drafted', entry_id, run_id?, reversal_entry_id?, mode}`.
- `adjustment_run_due(p_client uuid)` → `{due, template_id?, period_start?, period_end?,
  blocked: [{template_id, reason: 'occurrence_draft_outstanding'}]}`.
- `reverse_adjustment_pair(p_client uuid, p_occurrence uuid, p_reason text, p_op_key
  text)` → bookkeeper+ → `{pair_id, status: 'completed'|'pending',
  occurrence_correction_id, mirror_correction_id}`.
- `approve_pair_reversal(p_client uuid, p_pair uuid, p_op_key text, p_attestation text
  default null)` → bookkeeper+ → `{pair_id, status: 'completed'}` ·
  `cancel_pair_reversal(p_client uuid, p_pair uuid, p_reason text, p_op_key text)` →
  bookkeeper+ → `{pair_id, status: 'cancelled'}`.
- `enrol_staff_advance_account(p_client uuid, p_account_code text, p_person_label text,
  p_confirm_dedicated boolean, p_attestation text, p_op_key text)` → admin+ →
  `{enrolment_id, status: 'active'}` · `retire_staff_advance_account(p_client uuid,
  p_enrolment uuid, p_reason text, p_op_key text)` → admin+ → `{enrolment_id, status:
  'retired'}`.
- `book_staff_advance_application(p_client uuid, p_posting_date date, p_memo text,
  p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text, p_op_key text)` →
  bookkeeper+; p_kind IN ('payroll_deduction','bank_return','claim'); p_lines = the live
  draft_entry line shape. WCA-R7 envelope: posted → `{status:'posted', entry_id,
  application_ids: [uuid]}`; drafted → `{status:'drafted', entry_id, application_ids: []}`.
- `complete_staff_advance_particulars(p_client uuid, p_advance uuid, p_purpose text,
  p_reference text, p_op_key text)` → bookkeeper+, set-once → `{advance_id, purpose,
  reference}`.
- Reads (viewer+, grant-loop): `staff_advance_summary(p_client, p_as_of)` → rows
  `{enrolment_id, account_code, person_label, advance_id, issue_date, amount_cents,
  outstanding_cents, days_outstanding, purpose, voided: bool}` + `policy_notes:
  [{fact, note, source_note}]` · `staff_advance_statement(p_client, p_account_code,
  p_from, p_to)` → rows `{date, kind: 'disbursement'|'application'|'void', entry_id,
  amount_cents, running_cents, application_kind?, reason?}` ·
  `staff_advance_tie(p_client, p_as_of)` → rows `{account_code, register_cents, gl_cents,
  difference_cents, out_of_window_cents, explained}` (GL side window-scoped per §3.4).
- `resolve_and_book_bank_line(p_client uuid, p_exception uuid, p_disposition text, p_note
  text, p_draft jsonb default null, p_allocations jsonb default null, p_adjustments jsonb
  default null, p_advance_applications jsonb default null, p_charge_cents bigint default
  0, p_charge_account text default null, p_attestation text default null, p_op_key text
  default null)` → owner. **`p_disposition IN ('matched_booking','written_off_adjustment')`
  is validated at ARGUMENT time on BOTH branches** (token `disposition_unsupported`;
  `bank_corrective_line` always refuses — use the direct verb). `p_draft = {posting_date,
  memo, lines, counterparty?, resolution?}`; `p_allocations`/`p_adjustments` = the live
  allocate/match shapes (callee law). **`p_advance_applications` = null | {kind, reason,
  allocations: [{line_no int, advance_id uuid, amount_cents bigint}]}** — copied VERBATIM
  into the hand-draft's `flags.staff_advance_application`; line_no refers to `p_draft.
  lines`; refused (`pending_branch_ancillary_unsupported`) on the park branch. Returns the
  settle core's envelope + `{resolution_exception_id, branch: 'live'|'pending'}`.
- `accept_bank_rule_suggestion(p_client uuid, p_line uuid, p_rule uuid, p_op_key text)` →
  bookkeeper+ → `{entry_id}`.

## B. The three flags keys (`revise_entry` refuses all three — token `proposal_not_revisable`;
the FA arm keeps its live `fa_proposal_not_revisable`)

`recurring_adjustment = {template_id, op_key, role: 'occurrence'|'reversal', auto_reverse,
reversal_date, period_start, period_end, mode: 'post'|'draft'}` ·
`staff_advance_application = {kind, reason, allocations: [{line_no int, advance_id uuid,
amount_cents bigint}]}` · `bank_rule_suggested = {rule_id, line_id}`.

## C. Template lines · memo grammar · periods · indexes

Lines: `[{account_code text, debit_cents bigint≥0, credit_cents bigint≥0, description
text?}]`, ≥2 rows, exactly one of debit/credit positive per row, Σdebit=Σcredit.
`memo_template` is VERBATIM text (no interpolation). The canonical period triple
{period_start, period_end, period_label}: labels monthly `to_char(period_end,'Mon YYYY')`,
annual `'FY'||to_char(period_end,'YYYY')`; **receipts, EVENTS and hashes carry
period_start+period_end (dates); period_label is render-only.** Occurrence memo =
`memo_template || ' — ' || period_label`; mirror memo prefixes `'Auto-reversal: '`.
**The two hot-loop partial indexes** (the D-a F10 law; §8-pinned):
`ix_je_adj_draft (client_id) WHERE status='draft' AND flags ? 'recurring_adjustment'` and
`ix_je_adj_occurrence ((flags->'recurring_adjustment'->>'template_id'),
(flags->'recurring_adjustment'->>'period_start')) WHERE flags ? 'recurring_adjustment'`.

## D. New-table DDL blocks (all seven; RLS: the six firm-scoped tables take the 0041
owner/human pair; `ea1955_policy` is GLOBAL)

1. **`adjustment_templates`**: id uuid PK · firm_id NOT NULL · client_id NOT NULL (FK
   (client,firm)) · status text CHECK ('proposed','live','retired') · name text non-blank ·
   cadence text CHECK ('monthly','annual') · start_date date NOT NULL · end_date date NULL
   CHECK (end_date IS NULL OR end_date >= start_date) · auto_reverse boolean NOT NULL ·
   lines jsonb NOT NULL · memo_template text NOT NULL · content_hash text NOT NULL ·
   proposed_by/proposed_op_key · signed_by/signed_at/signed_op_key · retired_by/retired_at/
   retired_reason/retired_op_key · created_at. Partial unique (client_id, content_hash)
   WHERE status IN ('proposed','live'). Transition trigger (the 0041:649 clone) +
   no-delete + no-truncate.
2. **`adjustment_runs`**: id · firm_id · client_id · template_id (FK) · period_start/
   period_end date NOT NULL · mode text CHECK ('post','draft') · entry_id uuid NOT NULL
   UNIQUE (FK journal_entries) · reversal_entry_id uuid NULL (FK) · amount_cents bigint
   CHECK (>0) · op_key text (unique per firm) · created_at. Fully immutable trigger +
   no-delete + no-truncate. No (template, period) uniqueness.
3. **`adjustment_pair_reversals`**: id · firm_id · client_id · template_id uuid NOT NULL
   (FK) · occurrence_id uuid NOT NULL (FK) · mirror_id uuid NOT NULL (FK) ·
   occurrence_correction_id uuid NOT NULL (FK) · mirror_correction_id uuid NOT NULL (FK) ·
   maker uuid NOT NULL · status text CHECK ('pending','approving','completed','cancelled')
   · completed_at timestamptz NULL · op_key text · created_at. Partial unique
   (occurrence_id) WHERE status IN ('pending','approving'). Mutable set = {status,
   completed_at}; edges pending→approving, approving→completed, pending→cancelled; the
   DEFERRED re-query no-commit-`approving` trigger; no-delete + no-truncate.
4. **`staff_advance_accounts`**: as v7 — id · firm_id · client_id · account_code NOT NULL ·
   person_label NOT NULL · enrolment_attestation NOT NULL non-blank · active DEFAULT true ·
   enrolled_at DEFAULT now() · created_by/created_op_key · retired_by/retired_at/
   retired_reason/retired_op_key; CHECK active XOR retired-pair; partial unique
   (client_id, account_code) WHERE active; no-delete + no-truncate.
5. **`staff_advances`**: id · firm_id · client_id · enrolment_id uuid NOT NULL (FK) ·
   account_code text NOT NULL · disbursement_line_id uuid NOT NULL UNIQUE (FK
   journal_lines) · entry_id uuid NOT NULL (FK) · issue_date date NOT NULL · amount_cents
   bigint CHECK (>0) · purpose text NULL · reference text NULL · voided_by_entry_id uuid
   NULL (FK) · void_effective_date date NULL · created_at. Append-only trigger; set-once
   allowlists {purpose, reference} (verb-only) and {voided_by_entry_id,
   void_effective_date} (hook-only); no-delete + no-truncate.
6. **`staff_advance_applications`**: id · firm_id · client_id · advance_id uuid NOT NULL
   (FK) · enrolment_id uuid NOT NULL (FK) · application_line_id uuid NOT NULL (FK) ·
   entry_id uuid NOT NULL (FK) · kind text CHECK (the four) · amount_cents bigint CHECK
   (>0) · effective_date date NOT NULL · reverses_application_id uuid NULL (FK, must
   reference a non-correction row) · created_by · reason text · created_at. Unique
   (application_line_id, advance_id). Pure append-only + no-delete + no-truncate.
7. **`ea1955_policy`** — GLOBAL (the 0016 system-reference idiom): fact text ·
   effective_from date · effective_to date NULL · note text NOT NULL · source_note text
   NOT NULL non-blank · PK (fact, effective_from). **Posture: no-truncate trigger ·
   enable+FORCE RLS with the OWNER policy · `GRANT SELECT TO clara_authenticated` (no firm
   predicate — global reference data) · writes only by migrations (the §8 probe asserts no
   granted fn writes it).** Seed (effective_from '2026-08-01', effective_to NULL):
   `s22_prior_month_wage_cap` / "An advance of wages not yet earned may not exceed the
   wages earned in the immediately preceding month" / "EA 1955 s.22 (primary text; research
   record 2026-08-01)" · `s24_2c_interest_free_recovery` / "Payroll-deduction recovery of a
   s.22 advance is lawful only if no interest is charged" / "EA 1955 s.24(2)(c)" ·
   `s27_no_interest` / "Interest on advances is prohibited" / "EA 1955 s.27".

**`bank_matches` ALTER**: `pending_resolution jsonb` CHECK (`IS NULL OR status='pending'`)
· `resolution_exception_id uuid REFERENCES clara.bank_line_exceptions(id)`
(immutable-once-non-null via the narrow BEFORE-UPDATE trigger).

## E. The op-key matrix (hash = `_hash(jsonb_build_object(...))`, PRE-LOCK-KNOWABLE fields
only; the non-null rule ONCE: a derived pre-reservation returning non-null RAISES
`approve_key_collision`, never replays)

| key | fn | hash fields | reserver | spender | closer |
|---|---|---|---|---|---|
| template propose/sign/retire `<op>` | each verb | ('client',p_client,'template',p_template⁽ˢⁱᵍⁿ⁄ʳᵉᵗ⁾) or ('client',p_client,'hash',content_hash)⁽ᵖʳᵒᵖ⁾ | its `_reserve_op` | itself | `_finish_op` |
| enrol/retire/particulars `<op>` | each verb | ('client',p_client,'account',p_account_code) / ('enrolment',p_enrolment) / ('advance',p_advance) | its `_reserve_op` | itself | `_finish_op` |
| poster `<op>` | run verb | ('client',p_client,'template',p_template,'ps',p_period_start,'pe',p_period_end) | the core | the core | `_finish_op` |
| `<op>:approve` | approve_entry | ('template',t,'ps',ps,'pe',pe,'role','occurrence') | the core, eager pre-lock | the core preheld (post mode) | spent; DRAFT: claimed-but-unfinished (0041:3412) |
| `<op>:mirror:approve` | approve_entry | ('template',t,'ps',ps,'pe',pe,'role','reversal') | the core, eager pre-lock, UNCONDITIONAL | the mirror flip preheld | spent; non-auto_reverse: deferral marker |
| application `<op>` | book_staff_advance_application | ('client',p_client,'date',p_posting_date,'kind',p_kind,'alloc',p_allocations) | its `_reserve_op` | itself | `_finish_op` |
| application `<op>:approve` | approve_entry | ('composite','book_staff_advance_application','op_key',p_op_key) | the verb, eager pre-lock | the core preheld (posted branch) | spent; DRAFT branch: claimed-but-unfinished |
| pair `<op>` | reverse_adjustment_pair | ('occurrence',p_occurrence) | its `_reserve_op` | itself | `_finish_op` |
| `<op>:occ:approve` / `<op>:mir:approve` | approve_entry | ('occurrence',p_occurrence,'half','occ'|'mir') | `_pair_reverse_core`, pre-lock | the core preheld (low-stakes now; HS at `approve_pair_reversal`) | spent; cancel: deferral markers |
| `approve_pair_reversal <op>` / `cancel_pair_reversal <op>` | each verb | ('pair',p_pair) / ('pair',p_pair,'reason',p_reason) | its `_reserve_op` | itself | `_finish_op` |
| composite `<op>` | resolve_and_book_bank_line | ('exception',p_exception,'disposition',p_disposition,'note',p_note,'draft',p_draft,'alloc',p_allocations,'adj',p_adjustments,'adv',p_advance_applications,'charge',p_charge_cents,'charge_acct',p_charge_account) | its `_reserve_op` | itself | `_finish_op` |
| `<op>:draft` · `<op>:match` · `<op>:resolve` | the callee verbs | THE CALLEE'S LIVE LAW (harvested) | THE CALLEE | the callee | the callee |
| `<op>:settle` | `_settle_from_bank_line_core` | the settle verb's live 11-field hash (harvested) | **the COMPOSITE, pre-lock** | the core preheld | the core |
| `<op>:draft:approve` | approve_entry | ('composite','resolve_and_book_bank_line','op_key',p_op_key,'leg','draft') | the composite, pre-lock | the core preheld | spent or deferral marker |
| `<op>:settle:*` descendants | allocate/approve | THE SETTLE CORE'S OWN LAW | THE CORE | the core | the core's markers (0038:4644-4664) |
| producer `<op>` | accept_bank_rule_suggestion | ('rule',p_rule,'line',p_line) | its `_reserve_op` | itself | `_finish_op` |
| reconciler keys | run_adjustment_occurrence | `adj:<client>:<template>:<period_start>:<rand8>` (random suffix load-bearing) | the sweep mints, the core reserves | the core | `_finish_op` / abandoned-pending |

## F. The refusal-token table (site → errcode → detail.reason; x42 asserts these strings)

| site | errcode | reason |
|---|---|---|
| poster: period outside [start, end] | CLR38 | `period_out_of_window` |
| poster: (template, period) already met | CLR38 | `period_already_met` |
| poster/retire: draft outstanding | CLR38 | `occurrence_draft_outstanding` |
| poster: template not live | CLR38 | `template_not_live` |
| poster: misaligned / not-ended period | CLR38 | `period_request_invalid` (axes `not_cadence_aligned`/`not_ended`) |
| propose: duplicate content | CLR10 | `template_duplicate` |
| propose/sign: start/end not period-aligned vs CURRENT FYE | CLR10 | `template_fy_stale` |
| arm (2): any stale axis | CLR39 | `adjustment_stale` (axis ∈ origin·issuer_receipt·template_retired·lines_changed·period_invalid·mode·line_eligibility) |
| `_wdb_reversal_blocked`: a pair half | CLR39 | `adjustment_pair_locked` |
| `reverse_adjustment_pair` on a solo | CLR10 | `not_an_auto_pair` |
| hook arm (1) / `withdraw_draft` / `revise_entry` on a pair draft | CLR39 | `pair_draft_locked` |
| `revise_entry` on a D-b flags draft | CLR10 | `proposal_not_revisable` |
| `reverse_entry` on a correction-carrying entry | CLR39 | `correction_entry_irreversible` |
| `reverse_entry` on a disbursement w/ net applications ≠ 0 | CLR39 | `advance_applications_outstanding` |
| the belt: uncovered credit leg | CLR40 | `advance_application_missing` |
| the belt: unregistered debit | CLR40 | `advance_movement_unregistered` |
| enrolment: nonzero balance | CLR10 | `enrolment_balance_nonzero` |
| retire: outstanding advances | CLR10 | `advance_outstanding_on_retire` |
| particulars: already set | CLR10 | `particulars_already_set` |
| applications: over-cap at any boundary | CLR39 | `advance_over_application` |
| applications: predates issue | CLR39 | `application_predates_advance` |
| AF-2: any disposition outside the two | CLR10 | `disposition_unsupported` (both branches, argument time) |
| AF-2: ancillary in the park | CLR10 | `pending_branch_ancillary_unsupported` |
| flip: stale declaration | CLR10 | `pending_resolution_stale` |
| unmatch reopen: newer open exception | CLR10 | `exception_reopen_blocked` |
| parked line, direct resolve | CLR10 | `disposition_unbooked` (inherited — the 0040 belt) |
| producer: duplicate suggestion | CLR10 | `suggestion_outstanding` |
| arm (3): stale suggestion | CLR39 | `suggestion_stale` |
| derived-key collision | CLR10 | `approve_key_collision` |
| dispose: second draft | CLR39 | `disposal_draft_outstanding` |
| writers: the 65th edge | CLR37 | `fa_lineage_too_deep` |

## G. Event payloads (typed-primitive allowlists, identical in both files)

`adjustment.posted` = `{template_id, run_id, period_start, period_end, amount_cents,
reversal_entry_id}` (emitted in arm (2) after the receipt, one per occurrence) ·
`bank.line_exception_reopened` = `{exception_id, line_id, match_id}` (emitted by the
unmatch reopen arm). Both registered in `event_types` + `trigger_taxonomy` at
`taxonomy_active`, decision 'ignore' (the 0041:978-996 CTE); sites + counts tail-pinned.
