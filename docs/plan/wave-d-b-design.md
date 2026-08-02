# Wave D-b — adjustments + staff advances (migration 0042): the design

> **Status: v1 — grilled 2026-08-02 (WDB-G1..G14 ruled), pre-ladder.** Contract:
> `wave-d-contract.md` §4 D-b (WD-R8/R9/R10/R13 — cited, never re-opened). Grounding: the
> 10-lane D-b census (2026-08-02, session record) + the split-month research record
> (`research/wave-d/split-month-research-2026-08-02.md`). Precedent of record: the 0041
> authority/poster/belt family (`wave-d-a-fa-design.md` v2.1 + part2 — mirrored, never
> re-derived). Migration number `0042` is claimed at MERGE, not before.

---

## 1. Rulings of record (owner, 2026-08-02 — the grill minutes)

| # | Ruling |
|---|---|
| **WDB-G1** | Auto-reversal is **hook-born at approve**: when an accrual occurrence approves, the approve-time hook births the reversal mirror in the same transaction, dated next-period day 1. `reverse_entry` is untouched (its grant/`_human_ctx`/no-date-param blocks and six-splice body stand). |
| **WDB-G2** | **One act births the approved pair.** The draft discloses the reversal date + mirror legs; the checker's single approval covers both; the mirror is born approved. |
| **WDB-G3** | Cadence CHECK admits **monthly + annual** (FA parity; both period families exist in 0041). |
| **WDB-G4** | **Catch-up occurrences ALL draft.** An occurrence whose period had already ended at signing is forced-draft; ramp autonomy applies only to periods ending after the sign date. |
| **WDB-G5** | **The advance belt is asymmetric.** An approved DEBIT on an enrolled account soft-births the `staff_advances` row same-transaction (purpose pending, queue chases — the WD-R1 posture). An approved CREDIT with no same-transaction application REFUSES, remedy naming the application verb / AF-2. |
| **WDB-G6** | Advance-account **enrolment/retire floor is admin+** (WD-R9 closest-analogue doctrine). |
| **WDB-G7** | **Free account coding; enrolment is the truth.** No enforced numbering; validation is structural (active, asset-type, non-control, not bank/FA-reserved, never a related-party account). |
| **WDB-G8** | **No real staff-advance case exists — named deferral.** Acceptance = full labelled-synthetic sandbox corpus; the first real firing defers to the first client with an actual staff advance (the ADR-056 honest-empty precedent). |
| **WDB-G9** | **AF-2 high-stakes: `pending_resolution` rides the group; the bookkeeper+ flip executes it.** Authority attaches at declaration (the owner-floor composite records disposition + declarant); `complete_pending_match` executes it at the pending→live commit — the `pending_ancillaries` sibling. |
| **WDB-G10** | **Disposal second-draft: guard + UI; per-asset freeze ratified.** `dispose_fixed_asset` self-checks `_fa_disposal_draft_outstanding` (refuse; remedy names `withdraw_draft`); /assets gains a withdraw affordance; the ceremony note's "client-wide" is struck as imprecise. |
| **WDB-G11** | **64-edge cap closed writer-side.** Both minting paths (`revise_fixed_asset_particulars` + the partial-disposal split) refuse the 65th edge at the readers' exact threshold (CLR37, same reason; remedy names dispose-and-reacquire). Exactly-64-admits parity is a test cell. No unwind verb. |
| **WDB-G12** | **`cost_cents` NOT NULL + the 0017 validator fix.** ALTER SET NOT NULL (live probe: 5 rows, 0 NULL) + CoR recut of the K-carry-down validator's NULL-propagating OR-chain so an omitted cost refuses CLR10 `malformed baseline` at intake. |
| **WDB-G13** | Seven positions stand: immutable templates (edit = retire + re-propose) · template lines non-control-only (also no FA-reserved/bank/enrolled-advance codes; fixed cents; balanced) · many live templates per client (content-hash dedup) · `bank_rule_suggested` = coding-kind only, bookkeeper+ accept, SS9.5-mirror tail guard · EA 1955 as effective-dated policy rows, visibility only · AF-2 inline resolution mint at confidence 1.0 · surfaces: /advances clones /aging, templates ride the /rules precedent, tie clones `fa_register_tie`, poster rides the existing leader connection. |
| **WDB-G14** | **Split-month PINNED to the actual as-built law** (two-lane research record): day-1 revision → successor owns the month; day-2+ → the predecessor owns the whole month, successor starts next month; no month ever split; no day pro-rating. The convention is stated in policy wording + receipts; a potentially material mid-month change (esp. near FYE) escalates to reviewer visibility with an explicit adjusting-entry route — the agent never invents the difference. (Corrects the census F11 "successor owns the month" misreading; verified 0041:1367/3219/1283-1288 + x41-round35-disposal:183-214.) |

## 2. S1 — Recurring/reversing adjustment templates (WD-R8/R9)

### 2.1 Schema
`clara.adjustment_templates` clones the `fa_depreciation_authorities` family (0041:614-686):
id, firm_id, client_id, **status** CHECK (`proposed`,`live`,`retired`), **name** (non-blank),
**cadence** CHECK (`monthly`,`annual`) (G3), **start_date** NOT NULL, **end_date** (nullable,
≥ start_date), **auto_reverse** boolean NOT NULL, **lines** jsonb (validated array of
`{account_code, debit_cents, credit_cents, description?}` — balanced to the sen, positive
cents, ≥2 lines), **memo_template** text, proposed_by/proposed_op_key, signed_by/at/op_key,
retired_by/at/reason/op_key, **content_hash**, created_at. Transition trigger clones
`_tf_fa_authority_transition` (proposed→live, proposed→retired, live→retired only; every
other column frozen; DELETE refused). Unlike FA there is **no one-per-client cap** (G13):
uniqueness is a partial unique on (client_id, content_hash) WHERE status IN
('proposed','live') — the same economic template cannot be live twice; a retired one may be
re-proposed verbatim (fresh id ⇒ fresh ramp, which IS the edit-re-ramps law).

Line eligibility (G13, validated at propose AND re-validated live at every occurrence):
account exists, `is_active`, `account_class IS NULL` (non-control — the binary wall stays
untouched), not the client's bank `coa_account_code`, not FA-reserved
(`_fa_assert_code_unreserved`), not an actively enrolled staff-advance account. A live
re-validation failure refuses the occurrence (`template_account_invalid`) — the remedy is
retire + re-propose; the advisory surfaces it.

### 2.2 Verbs
`propose_adjustment_template` (bookkeeper+) · `sign_adjustment_template` (admin+, WD-R9) ·
`retire_adjustment_template` (admin+, non-blank reason). All `_human_ctx`-floored, advisory
lock `pg_advisory_xact_lock(203005004, hashtext(client))`, op-keyed. Signing stamps
signed_by — the identity the poster stamps as `last_human_editor` (the distinct-checker arm,
0041's F16 lesson).

### 2.3 The poster
`clara._adj_run_occurrence_core(p_client, p_template, p_period_start, p_period_end, p_op_key,
p_actor, p_firm, p_verb)` mirrors `_fa_run_period_core` (0041:3404-3574) exactly in mechanics:
`_reserve_op` + the **eager derived `:approve` reservation** (the 0037 deadlock law — stands,
never re-litigated) → client advisory rung → template live check → period must be
cadence-aligned and ENDED (monthly = `_fa_month_*`; annual = the client-FY family) →
sequencing: an outstanding draft **for this template** blocks the next occurrence
(`occurrence_draft_outstanding`) and the oldest unmet occurrence runs first. The entry is a
**direct INSERT** into `journal_entries` (SS9.5 law: `_draft_entry_core` is never widened):
status='draft', origin='scheduled_run', posting_date = period_end,
maker_actor = actor, last_human_editor = template.signed_by,
`flags = {'recurring_adjustment': {template_id, op_key, role:'occurrence', auto_reverse,
reversal_date}}`, lines copied verbatim from the template. Exact-balance assert (CLR07, no
tolerance).

**Mode**: `post` iff ramp-earned AND NOT `is_high_stakes(entry)` AND period_end ≥
signed_at::date (G4's forced-draft for catch-up); else `draft`. **Ramp** (derived, no column,
no receipt join — the F14/F15 laws): EXISTS ≥1 OTHER approved, un-reversed,
origin='scheduled_run' entry with `flags->'recurring_adjustment'->>'template_id'` = this
template AND role='occurrence'. An approved catch-up draft earns the ramp (a human reviewed
this exact template's output — WD-R8's "first occurrence drafts" is satisfied by construction).
Approve-time re-derives mode identically (never trusts the run verb).

**Due oracle**: `adjustment_run_due(p_client)` (STABLE, security definer, granted to
clara_runtime + clara_authenticated) returns the oldest unmet (template, period) across live
templates — a period is unmet iff it is cadence-complete, ended, within [start_date,
coalesce(end_date, ∞)], and carries **no approved un-reversed role='occurrence' entry for the
template** (entry-derived, never receipt-derived). Machine verb `run_adjustment_occurrence`
(EXECUTE to clara_runtime only; no `_human_ctx`); human twin `run_adjustment_manual`
(bookkeeper+). Tail census mirrors 0041 tail-9: no wake_fn_allowlist row names any D-b verb;
every `_adj_*` helper owner-only.

### 2.4 Auto-reversal (G1/G2) — and one named mechanism deviation
`clara._adj_on_approve(p_entry)` is spliced into `_subledger_on_approve` (the S4.1 idiom,
after `_fa_on_approve`). When an entry with `flags.recurring_adjustment.role='occurrence'`
AND `auto_reverse=true` approves, the hook — in the same transaction — inserts the **mirror**:
leg-swapped copy of the occurrence's lines, posting_date = period_end + 1 day (always
today-or-past, since approval postdates period end), origin='scheduled_run', status approved
under the same act (G2), `flags.recurring_adjustment = {template_id, role:'reversal',
mirror_of: <occurrence entry id>, op_key}`.

**NAMED DEVIATION (for the ladder + the owner's eyes):** the grill option's parenthetical said
"linked via reversal_of/reversed_by"; the mirror deliberately does **NOT** use that linkage.
Two mechanism facts force this: (a) the ramp predicate excludes `reversed_by IS NOT NULL`
entries — a reversal_of-linked mirror would mark every auto-reversing occurrence "reversed"
the moment it approves, so an auto-reverse template could never earn autonomy; (b)
`reverse_entry` refuses both "already reversed" and "cannot reverse a reversal" — linkage
would leave a wrong accrual pair with NO correction door at all. With flags-only linkage both
entries stay ordinary and correctable via `reverse_entry`; the subledger/FA hooks are
indifferent (template lines are non-control by G13, so neither entry mints open_items — LADDER
6). `reversal_of/reversed_by` remains reserved for genuine corrective reversals. The ramp
EXISTS filters role='occurrence', so mirrors never self-earn autonomy.

### 2.5 Receipts
`clara.adjustment_runs` minted inside `_adj_on_approve` (approve-time, the F15 law —
receipts are audit artifacts, never eligibility): id, firm, client, template_id, period_start/
period_end, mode ('post'|'draft'), entry_id (unique), reversal_entry_id (nullable — stamped
when the mirror is born), amount_cents, op_key (unique per firm), created_at. Fully immutable
(clone `_tf_fa_run_immutable`); deliberately NO (template, period) uniqueness — reverse+re-run
mints a second receipt lawfully. Event kind: `adjustment.posted` (one per occurrence,
payload {template_id, run_id, period, amount_cents, reversal_entry_id}).

### 2.6 Runtime
Leader gains the 5th due-check `adjustmentRunDue` (env `CLARA_ADJ_RECONCILE_MS`, 24h
fallback) + `reconciler-adjustments.mjs` cloning `reconciler-fa.mjs` verbatim in discipline:
per-cycle `to_regprocedure` feature-detect (image-first ceremony), one client at a time, each
DB call its own statement, per-client error isolation, occurrence cap `ADJ_OCCURRENCE_CAP=24`,
fresh result-key prefix `adj*`, the shared 'reconciler' heartbeat. **No new LISTEN consumer**
(ten exist; Supavisor 38/60 held). No WDK, no freeze-manifest implications (the leader family
is plain code — census leader-cadence F7).

## 3. S2 — Staff advances (WD-R10, the B-lite register)

### 3.1 Enrolment
`clara.staff_advance_accounts` clones `fa_account_profiles` (0041:419-500): id, firm, client,
account_code, **person_label** (the v1 subject display name; the ACCOUNT stays the subject
identity per WD-R10), active, enrolled_at, created_by/created_at, retired_by/retired_at.
Partial unique (client_id, account_code) WHERE active; version-forward (retire + fresh row);
no-delete trigger; RLS forced. Verbs `enrol_staff_advance_account` /
`retire_staff_advance_account` — **admin+** (G6). Enrolment validation (G7): active,
account_type='asset', `account_class IS NULL`, not the bank door
(`bank_accounts.coa_account_code`), not FA-reserved, and — related-party exclusion — the verb
takes `p_confirm_dedicated boolean` plus refuses any account already carrying open_items rows.
**Opening balance law**: if the account's approved GL balance ≠ 0 at enrolment, the caller
must supply `p_opening = {issue_date, amount_cents}` matching that balance exactly (refuse
mismatch, `enrolment_balance_unseeded`); it mints one seed `staff_advances` row
(disbursement_line_id NULL — lawful only for the seed) so the tie reads 0 from birth.

### 3.2 The register
`clara.staff_advances` (append-only): id, firm, client, account_code, disbursement_line_id
(unique, FK journal_lines — NULL only for enrolment seeds), entry_id, issue_date (= the
entry's posting_date), amount_cents (>0, = the debit leg), purpose/reference (nullable —
chased), created_at. Post-birth mutability: a set-once allowlist {purpose, reference}
completable via `complete_staff_advance_particulars` (bookkeeper+); everything else frozen.

`clara.staff_advance_applications` (append-only): id, firm, client, advance_id FK,
application_line_id (FK journal_lines — the credit leg; one leg may split across advances),
entry_id, kind CHECK (`payroll_deduction`,`bank_return`,`claim`,`correction`),
amount_cents (>0), **effective_date = the application entry's posting_date, derived in-hook,
never caller-supplied** (the `apply_open_items` act-dating immunity, census F8),
reverses_application_id (nullable self-FK, unique — a correction appends a full or partial
reversing row, never edits), created_by, reason, created_at. Unique (application_line_id,
advance_id). Guards in-verb under the client rung: allocation Σ per line = the credit leg's
cents exactly; per-advance Σ(applications − corrections) ≤ amount_cents (over-application
refuses); an application cannot predate its advance's issue_date.

**Derived-only reads**: outstanding(advance, as_of) = amount − Σ net applications with
effective_date ≤ as_of on approved un-reversed entries. No stored outstanding, no status.

### 3.3 The proposal + hook + belt (the G5 asymmetry)
The flags-proposal idiom (the house pattern — depreciation_charges/fa_disposal): the booking
verb `book_staff_advance_application(p_client, p_entry {posting_date, memo, lines},
p_allocations [{advance_id, amount_cents}], p_kind, p_reason, p_op_key)` (bookkeeper+) drafts
the repayment entry directly (SS9.5: direct INSERT) with `flags.staff_advance_application =
{kind, allocations, reason}` and takes the WCA-R7 branch (high-stakes → draft for a distinct
checker; else approve inline). `clara._adv_on_approve` (spliced into `_subledger_on_approve`)
then, at ANY approve path: (a) for each debit leg on an actively enrolled account with no
register row — **soft-births** `staff_advances` (purpose NULL → the queue chases it); (b) for
each credit leg — mints application rows from the entry's flags proposal (or AF-2's payload);
(c) for a reversal mirror (`reversal_of` set) — appends correction rows unwinding the
original's applications / marks a reversed disbursement's advance void-by-reversal.

`clara._tf_advance_movement_belt` (DEFERRED constraint trigger on journal_entries WHEN
approved — the movement-belt clone, census2 F4; watermark-scoped to [enrolled_at,
retired_at]): a debit leg must have its `staff_advances` row (the hook guarantees it — the
belt is the backstop); a credit leg must be covered to the exact sen by application rows in
this transaction, else CLR refusal `advance_application_missing` naming the remedy (G5); a
reversal-mirror door and the opening-seed door complete the escape set. The enrolment-side
reservation (an enrolled code can't become a bank account etc.) rides
`_fa_assert_code_unreserved`'s sibling with its own leaf lock (`client:adv-roles`), NON-
deferred on the enrolment/bank doors (the census2 F5 deferral-mode law).

### 3.4 Reads, tie, policy, surface
`staff_advance_summary(p_client, p_as_of)` (per enrolled account: person_label, each advance,
original, outstanding, issue_date, days outstanding) · `staff_advance_statement(p_client,
p_account, p_from, p_to)` (origins, applications, running balance, linked entries) ·
`staff_advance_tie(p_client, p_as_of)` — the `fa_register_tie` clone: per enrolled account,
Σ register outstanding vs approved GL balance as-of, visibility-only, never blocking, with
explained columns. Grant-loop idiom (0038:8056 law). **EA 1955 policy**:
`clara.ea1955_policy` — effective-dated rows (`fact` PK part: `s22_prior_month_wage_cap`,
`s24_2c_interest_free_recovery`, `s27_no_interest`; effective_from/to; source_note with the
primary citation) seeded by the migration, system-maintained, read by the summary as advisory
notes — **visibility only, no computation** (Clara holds no wage data; the s.22 note is
informational). Surface: **/advances** clones /aging (list pane = summary; detail pane =
statement with date range); queue gains row_kind `staff_advance_incomplete` (purpose missing —
the fixed_asset_incomplete splice pattern); parts[] gains identifier-only `staff_advance` +
`adjustment_run_receipt` with cards on the FixedAssetCard receipt idiom.

## 4. S3 — The AF-2 composite (WD-R13)

`clara.resolve_and_book_bank_line(p_client, p_exception, p_disposition, p_note, p_draft jsonb,
p_allocations jsonb, p_adjustments jsonb, p_advance_applications jsonb, p_attestation,
p_op_key)` — **owner floor** (it embeds exception resolution; the WCB/WCC floors stand).
One transaction, in the only lawful order (0040:3441-3466): **resolve → book**.

- **Optional hand-draft leg** (`p_draft`): direct insert via the draft path with an inline
  `client_resolutions` mint when none supplied (the `file_document` precedent, census2 F3;
  method='human', confidence=1.0 — G13), counterparty proposal `kind` honored; carries
  `p_advance_applications` as its flags proposal when the draft touches an enrolled advance
  account (the composite IS the bank-side application producer — WD-R10).
- **Settlement leg**: `allocate_receipt`/`allocate_payment` (their p_control_account stays
  AR/AP-gated — the advance leg NEVER routes through it; census F23) or the hand-draft alone
  for pure non-P&L splits (the ratified two-entry/one-group shape).
- **Match leg**: one `match_bank_line` group over the line + approved entries (members demand
  approved — the F11 wall; the composite approves its own drafts below the high-stakes line).
- **Non-high-stakes commit**: group live; the resolution (`matched_booking` /
  `written_off_adjustment`) is lawful at the deferred belt. Re-enables both UI-disabled
  dispositions (`ReconciliationSnapshotTables` 153/176-181).

**High-stakes branch (G9)**: the settlement parks as WCA-R7 draft + `bank_matches` status
'pending' (the `settle_from_bank_line` shape). The composite records
`bank_matches.pending_resolution = {exception_id, disposition, note, declared_by,
declared_at}` and does NOT resolve now. `complete_pending_match` is recut to execute it at the
flip commit: resolves the exception (resolved_by = the DECLARANT — authority attaches at
declaration; the flip actor is recorded in the receipt), then flips live — one commit, belt-
lawful. `unmatch_bank_match` on a pending group clears `pending_resolution` with
`pending_ancillaries`; the exception simply stays open.

**Belt recut (named, CoR)**: today the settled-authority belt refuses an OPEN exception
coexisting with a PENDING group (`line_already_matched`, 0040:2696-2707) — the high-stakes
branch is unreachable without a widening. 0042 recuts `_tf_bank_settled_authority_belt` to
admit OPEN-exception + PENDING-group **iff** the group's `pending_resolution` names exactly
that exception — a declared, auditable in-flight state that converges to a lawful settled
state on either exit (flip ⇒ resolved+live; unmatch ⇒ open+unmatched). Dual-grep CoR law
applies (source = pg_get_functiondef; all prior markers positively probed).

## 5. S4 — The `bank_rule_suggested` producer (WD-R13)

`clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` — bookkeeper+ (the
`match_bank_line p_via_rule` floor precedent; the rule's owner-only SIGN floor is untouched).
Validates: rule SIGNED, kind='coding', client match; the line unmatched, un-excepted, in this
client's account; then **re-derives the suggestion live** (re-runs the rule predicate — never
trusts a stale client payload; the `list_bank_line_suggestions` arithmetic). Mints a DRAFT
journal entry by direct INSERT (SS9.5): the bank leg + the rule's coded account leg from the
line's amount/direction, narration from the template, counterparty proposal when the rule
carries one, `flags = {'bank_rule_suggested': <rule_id>}` — the 0040 S5 carve-out becomes
meaningful (the draft's approval accrues NO rule_sightings; a bank rule can never breed a
coding/autopost rule). The draft rides the ordinary /queue approve lane — accept mints a
reviewable draft, never an autopost. Chip: `StatementDetail`'s dead coding `<span>` becomes a
`<button>` (the match_settle chip sibling). **Tail guard (SS9.5 mirror)**: 0042's tail greps
`_draft_entry_core` prosrc for `bank_rule_suggested`, `recurring_adjustment`, AND
`staff_advance_application` — migration fails if any appears.

## 6. S5 — The D-a residual fixes (G10/G11/G12/G14)

1. **`dispose_fixed_asset` second-draft guard** (G10): after the status check, refuse when
   `_fa_disposal_draft_outstanding(client, asset, ∞)` (CLR39 `disposal_draft_outstanding`;
   remedy: approve or `withdraw_draft`). The eager `:approve` reservation is untouched
   (adjudicated). /assets `AssetDetailPane` gains a withdraw button on an outstanding disposal
   draft (calls the existing generic `withdraw_draft`).
2. **64-edge writer guard** (G11): `revise_fixed_asset_particulars` and the partial-disposal
   split path count the chain pre-insert and refuse the 65th edge — CLR37,
   `fa_lineage_too_deep`, remedy names dispose-and-reacquire. Parity cell: 64 admits
   everywhere, 65 refuses everywhere (writers + all three raising readers).
3. **`cost_cents` NOT NULL** (G12): `ALTER TABLE clara.fixed_assets ALTER cost_cents SET NOT
   NULL` (probe-proven safe) + CoR recut of the 0017 K-validator's OR-chain
   (`coalesce`-guarded) so NULL/omitted cost refuses CLR10 at intake. Both real registers are
   empty; the sandbox's 5 rows all carry cost.
4. **Split-month** (G14): no code change — the as-built law is ratified. 0042 adds the policy
   wording to `get_fixed_asset`/receipt surfaces ("revisions effective after the first day
   affect depreciation from the following calendar month") and x42 gains the day-2+
   predecessor-ownership cell + the material-exception advisory note in the design record.

## 7. Acceptance (contract §4 D-b item 5)

**Sandbox (labelled-synthetic, first, in full):** template propose→sign → catch-up drill
(backdated start: every past occurrence drafts) → ramp draft → single approval births the
auto-reversal pair → next occurrence auto-posts with receipt → edit-re-ramps drill
(retire + re-propose) → high-stakes drop (distinct checker; the pair rides the one approval) →
zero-charge noop → advance enrolment (incl. the opening-seed arm) → disbursement soft-birth +
purpose chase → applications: partial, multi-advance split, all four kinds, over-application
refuse, bare-credit belt refuse → tie at 0 at two as-ofs → AF-2 non-high-stakes both
dispositions → AF-2 high-stakes: pending_resolution → flip executes → unmatch-clears drill →
producer accept → S5 drills (second-disposal refuse · 65th-edge refuse · NULL-cost CLR10 at
the K-gate · the G14 mid-month cell). **Real half:** ≥1 owner-named recurring template signed
on a real client, its ramp draft approved on a real month and the auto-reversal proven next
period (the contract's requirement); staff advances close on the **G8 named deferral**.
Supavisor re-measured at the ceremony (WB-R18).

## 8. Test plan + boundaries

**x42 contract-blind battery**: authored from THIS document + the contract, never the
migration (the three-wave lesson — three class-(a) catches at D-a). Hunts the two D-a defect
classes by name: frozen-snapshot reads standing in for effective-dated/lineage reads, and
row-shape-instead-of-entry-shape dispatch. Named cells: ramp-per-template isolation ·
mirror-never-earns · catch-up forced-draft boundary (period_end vs signed_at, MYT window
aware) · reversal-date = period_end+1 across month/FY ends · belt asymmetry both arms ·
application act-dating (no caller date) · over-application under concurrency (the rig
truncate/deadlock lessons apply) · pending_resolution exactly-one exception · exactly-64
parity · G14 day-1 vs day-2 ownership pair. Runtime suite: adjustmentRunDue dormant-boot +
lights-up; belt sweep isolation. **Boundaries (contract §4)**: no `open_items` widening, no
employee counterparty, no close model, no CA computation, no new LISTEN consumer, no new
frozen workflow class; posters never touch `journal_entries` immutability or the settlement
belts' semantics beyond the two named CoR recuts (`complete_pending_match`,
`_tf_bank_settled_authority_belt`) and the S6 guards — every recut under the dual-grep CoR
law. Debts carried unchanged: segment-aware tie → E · staff master → F · account_class
binary · MPERS FS wording → E (research record's open verification item).
