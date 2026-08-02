# Wave D-b — adjustments + staff advances (migration 0042): the design

> **Status: v2 — grilled 2026-08-02 (WDB-G1..G14), round-1 ladder folded (four lanes, ~50
> findings — the record + every adjudication lives in `wave-d-b-design-part2.md`).** Contract:
> `wave-d-contract.md` §4 D-b (WD-R8/R9/R10/R13 — cited, never re-opened). Grounding: the
> 10-lane D-b census + `research/wave-d/split-month-research-2026-08-02.md`. Precedent of
> record: the 0041 authority/poster/belt family (mirrored, never re-derived). `0042` is
> claimed at MERGE. **Two items await owner sign-off** (§9): the G7 related-party posture and
> the AF-2 settlement-belt boundary interpretation.

---

## 1. Rulings of record (owner, 2026-08-02 — the grill minutes)

| # | Ruling |
|---|---|
| **WDB-G1** | Auto-reversal is **hook-born at approve**: when an accrual occurrence approves, the approve-time hook births the reversal mirror in the same transaction, dated next-period day 1. `reverse_entry` is untouched as a body (its grant/`_human_ctx`/no-date-param blocks stand; D-b adds one guard splice, §2.4). |
| **WDB-G2** | **One act births the approved pair.** The draft discloses the reversal date (explicit in flags) + the mirror legs (by mechanical inference from the occurrence's own visible lines — stated so no implementer guesses); the checker's single approval covers both. |
| **WDB-G3** | Cadence CHECK admits **monthly + annual**. |
| **WDB-G4** | **Catch-up occurrences ALL draft.** An occurrence whose period had already ended at signing (MYT law, §2.3) is forced-draft; ramp autonomy applies only to later periods. |
| **WDB-G5** | **The advance belt is asymmetric.** Approved DEBIT on an enrolled account soft-births the register row same-transaction (purpose pending, queue chases). Approved CREDIT with no same-transaction application REFUSES, remedy naming the application verb / AF-2. |
| **WDB-G6** | Advance-account **enrolment/retire floor is admin+** (the autopost-rules analogue — admin+ per WD-R9's table; deliberately stricter than `fa_account_profiles`' own bookkeeper+ enrolment). |
| **WDB-G7** | **Free account coding; enrolment is the truth.** Structural validation where facts exist (active, asset-type, non-control, not bank/FA-reserved); the related-party clause is enforced by **admin attestation** — no DB fact exists to check (sign-off item 1, §9). |
| **WDB-G8** | **No real staff-advance case exists — named deferral** (the ADR-056 honest-empty precedent). |
| **WDB-G9** | **AF-2 high-stakes: `pending_resolution` rides the group; the bookkeeper+ flip executes it.** Authority attaches at declaration; `complete_pending_match` executes at the pending→live commit. |
| **WDB-G10** | **Disposal second-draft: guard + UI; per-asset freeze ratified.** |
| **WDB-G11** | **64-edge cap closed writer-side** at the readers' exact threshold. (Round 1 widened this to THREE minting paths — §6.2.) |
| **WDB-G12** | **`cost_cents` NOT NULL + the 0017 validator fix** (both sites — §6.3). |
| **WDB-G13** | Seven positions stand: immutable templates · non-control-only lines · many live templates per client · coding-kind-only producer at bookkeeper+ · EA 1955 policy rows, visibility only · AF-2 inline resolution at confidence 1.0 · the surface clones + no new LISTEN consumer. |
| **WDB-G14** | **Split-month PINNED to the actual as-built law** (day-1 → successor; day-2+ → predecessor owns the month; no month split; no day pro-rating), with a REVIEWER-VISIBLE advisory + correcting-draft route (§6.4) and the x42 ownership cells. |

## 2. S1 — Recurring/reversing adjustment templates (WD-R8/R9)

### 2.1 Schema + line eligibility
`clara.adjustment_templates` clones `fa_depreciation_authorities` (0041:614-686): id, firm_id,
client_id, status CHECK (`proposed`,`live`,`retired`), name, cadence CHECK
(`monthly`,`annual`), start_date, end_date (nullable), auto_reverse boolean, lines jsonb
(≥2 lines `{account_code, debit_cents, credit_cents, description?}`, balanced to the sen,
positive cents), memo_template, proposed/signed/retired actor+op-key columns, content_hash,
created_at. Transition trigger clone (proposed→live/retired, live→retired only; DELETE
refused; every other column frozen). No one-per-client cap; partial unique on
(client_id, content_hash) WHERE status IN ('proposed','live'). **end_date, when set, must be
a cadence period-END for the client** (validated at propose; annual = the client-FY family) —
no straddled partial final period can exist.

Line eligibility (validated at propose AND re-derived at every occurrence AND at approve):
account exists, `is_active`, `account_class IS NULL`, not the client's bank
`coa_account_code`, and unreserved per `clara._acct_role_reserved(client, code)` — the
message-neutral reader over the ONE shared account-role predicate (FA profiles ∪ FA register
rows ∪ advance enrolment history ∪ advance register rows — status-blind on both domains, the
FA-G4 law; callers own their refusal text). Serialization: the existing `client:fa-roles`
leaf is REUSED as the single shared account-role leaf — no second leaf exists; the leaf-LAST
law binds every new caller (a live re-validation runs before `_approve_entry_core`'s rungs,
never between a rung and the leaf).

### 2.2 Verbs + lifecycle guards
`propose_adjustment_template` (bookkeeper+) · `sign_adjustment_template` (admin+) ·
`retire_adjustment_template` (admin+, reason; **refuses while an occurrence draft for the
template is outstanding** — `occurrence_draft_outstanding`, remedy: approve or
`withdraw_draft` first — so a retired template can never strand an approvable draft). All
`_human_ctx`-floored, client advisory rung, op-keyed; signing stamps signed_by (the
`last_human_editor` identity — the distinct-checker arm). **`set_client_fy_end` (CoR recut)
refuses while a live annual-cadence template OR depreciation authority exists** (remedy:
retire → change FYE → re-sign, which re-ramps) — closing the FYE-mid-stream gap for both
Wave-D posters.

### 2.3 The poster
`clara._adj_run_occurrence_core(p_client, p_template, p_period_start, p_period_end, p_op_key,
p_actor, p_firm, p_verb)` mirrors `_fa_run_period_core`: `_reserve_op` + the eager derived
`:approve` reservation → client rung 203005004 → template live check → period cadence-aligned
and ENDED (MYT) → **per-template sequencing** (an outstanding draft for THIS template blocks
its next occurrence; other templates unaffected). Direct INSERT into `journal_entries`
(SS9.5 law): status='draft', origin='scheduled_run', posting_date = period_end, maker_actor =
actor, last_human_editor = template.signed_by, `flags = {'recurring_adjustment':
{template_id, op_key, role:'occurrence', auto_reverse, reversal_date, period_start,
period_end}}` (the period rides the flags — the hook never infers it from a revisable
posting_date), lines copied from the template. Exact-balance assert (CLR07).

**Mode**: `post` iff ramp-earned AND NOT `is_high_stakes(entry)` AND NOT catch-up. **Catch-up
(G4)**: forced-draft ⇔ `period_end < (signed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date` —
the house MYT idiom; a period ending ON the MYT sign date follows the normal ramp law (the
boundary-day cell pins this). **Ramp** (derived, per-template): EXISTS ≥1 OTHER approved,
un-reversed, origin='scheduled_run' entry with this template_id AND role='occurrence'. An
approved catch-up earns the ramp. Approve-time re-derives mode identically.

**Due oracle** `adjustment_run_due(p_client)` (STABLE, security definer; clara_runtime +
clara_authenticated): the oldest unmet (template_id, period) across live templates **that are
not themselves draft-blocked**, plus a `blocked: [{template_id, reason}]` list for the
advisory surface — one outstanding draft never halts other templates and never spins the
sweep. Unmet = cadence-complete, ended, within [start_date, end_date], no approved
un-reversed role='occurrence' entry for the template+period (entry-derived, never
receipt-derived). Machine verb `run_adjustment_occurrence` (EXECUTE clara_runtime only);
human twin `run_adjustment_manual` (bookkeeper+). Tail: no wake-allowlist rows name any D-b
verb; every `_adj_*` helper owner-only.

### 2.4 Auto-reversal — the pair
When an entry with `flags.recurring_adjustment.role='occurrence'` AND auto_reverse approves,
`_adj_on_approve` births the mirror **in the reverse_entry shape** (the only lawful birth of
an approved entry): INSERT status='draft' (origin='scheduled_run', posting_date =
period_end + 1 day — always today-or-past at approval — `flags.recurring_adjustment =
{template_id, role:'reversal', period_start, period_end, op_key}`, last_human_editor =
template.signed_by) → INSERT leg-swapped lines → `_assert_balanced` → UPDATE draft→approved
stamping `checker_actor` = the occurrence's approving actor and `approved_at = now()` (G2's
one act) → `perform clara._subledger_on_approve(v_mirror)` (the H.2 precedent — the mirror
runs the full hook chain like every approved entry). **0042's tail re-pins the approve-path
census at FIVE**, naming this flip.

**Linkage is relational, not JSON**: the mirror carries `auto_reversal_of` (FK → the
occurrence, UNIQUE); the occurrence is stamped `auto_reversed_by` (the entry-immutability
allowlist widens for this ONE hook-written column). `reversal_of`/`reversed_by` are
deliberately NOT used — (a) the ramp's `reversed_by IS NULL` filter would permanently starve
auto-reverse templates, and (b) `reverse_entry`'s already-reversed / cannot-reverse-a-reversal
walls would leave a wrong pair with no correction door. Both reasons verified by the ladder.

**Pair correction**: `_wdb_reversal_blocked(p_entry)` — ONE new verb-side splice into
`reverse_entry` (its 7th; dual-grep CoR law) + a hook defense arm — refuses reversing EITHER
half individually (`adjustment_pair_locked`; the mirror alone or the occurrence alone can
misstate two periods). The remedy it names: `reverse_adjustment_pair(p_client, p_occurrence,
p_reason, p_op_key)` (bookkeeper+) — reverses BOTH halves in one transaction via the ordinary
reversal semantics per entry; the ramp un-earns (the occurrence's reversed_by lands); the due
oracle re-opens the period; a corrected re-run mints a fresh pair.

### 2.5 Receipts
`clara.adjustment_runs` minted in `_adj_on_approve` **after the mirror exists** (so
`reversal_entry_id` rides the INSERT — the row is fully immutable, no lifecycle): id, firm,
client, template_id, period_start/period_end, mode, entry_id (unique), reversal_entry_id
(nullable), amount_cents, op_key (unique per firm), created_at. No (template, period)
uniqueness. Event: `adjustment.posted`.

### 2.6 The approve-hook bindings
`_adj_on_approve` is spliced into `_subledger_on_approve` **immediately after `perform
clara._fa_on_approve(p_entry);` and above the `settlement_allocation` early-return** (the
0041 v1 dead-code lesson; a positional tail assert pins the ordering). Arms
dependency-ordered, reversal FIRST: (1) `e.reversal_of IS NOT NULL` → pair/guard handling,
return; (2) role='occurrence' → **re-validate before minting anything**: origin =
'scheduled_run' · an `op_receipts` row under the two run verbs whose request-hash re-derives
from (client, template_id, period_start, period_end) · template still live · the entry's
line-set byte-equal to the template's lines · cadence-aligned + ended · mode re-derived —
refuse `adjustment_stale` with a named axis. **`revise_entry` is CoR-recut to refuse any
draft carrying a D-b proposal flag** (`recurring_adjustment`, `staff_advance_application`,
`bank_rule_suggested` — the 0041 S4.9 precedent): proposal drafts are correct-by-reissue,
never editable.

### 2.7 Runtime
Leader 5th due-check `adjustmentRunDue` (env `CLARA_ADJ_RECONCILE_MS`, 24h fallback) +
`reconciler-adjustments.mjs` (per-cycle `to_regprocedure` feature-detect · one client at a
time · per-client error isolation · `ADJ_OCCURRENCE_CAP=24` · `adj*` key prefix · shared
'reconciler' heartbeat). No new LISTEN consumer; no WDK; no freeze implications.

## 3. S2 — Staff advances (WD-R10, the B-lite register)

### 3.1 Enrolment
`clara.staff_advance_accounts` clones `fa_account_profiles`: id, firm, client, account_code,
person_label, active, enrolled_at, created_by/created_at, retired_by/retired_at; partial
unique (client, account_code) WHERE active; version-forward; no-delete; RLS forced. Verbs
`enrol_staff_advance_account` / `retire_staff_advance_account` — admin+ (G6). Enrolment
validation: active · account_type='asset' · `account_class IS NULL` · not the bank door ·
unreserved per `_acct_role_reserved` · **approved GL balance = 0** (`enrolment_balance_
nonzero` otherwise — **enrol-clean-only**: the v1 opening-seed arm is deleted; a synthetic
opening row would fabricate the per-disbursement identity WD-R10 requires; accounts with
pre-existing balances defer to a future attested-baseline mechanism, a named debt) · the
related-party clause by admin attestation `p_confirm_dedicated` (G7 as ruled — no DB fact
exists; sign-off item 1). **Retire refuses while any advance on the enrolment has
outstanding > 0** (`advance_outstanding_on_retire`) — with the status-blind reservation
predicate, the retired-but-outstanding belt hole is unreachable.

### 3.2 The register
`clara.staff_advances` (append-only): id, firm, client, **enrolment_id** (immutable FK — the
subject identity survives code churn), account_code, disbursement_line_id (unique, FK
journal_lines, NOT NULL), entry_id, issue_date (= the entry's posting_date), amount_cents
(>0), purpose/reference (set-once via `complete_staff_advance_particulars`, bookkeeper+),
**voided_by_entry_id / void_effective_date** (set-once, written ONLY by the hook's reversal
arm), created_at.

`clara.staff_advance_applications` (append-only): id, firm, client, advance_id, enrolment_id,
application_line_id (FK journal_lines), entry_id, kind CHECK (`payroll_deduction`,
`bank_return`,`claim`,`correction`), amount_cents (>0), **effective_date = the application
entry's posting_date, derived in-hook, never caller-supplied** (the `apply_open_items`
act-dating law), reverses_application_id (nullable FK — **must reference a non-correction
row; multiple leaf corrections allowed; cumulative corrections ≤ the original's amount**),
created_by, reason, created_at.

**The outstanding equation (effective-dated signed effects — published, the C4 law):**
`outstanding(advance, as_of) = amount − Σ application effects effective ≤ as_of − void effect`
where an original application counts at every as-of ≥ its effective_date **even if its entry
is later reversed** (the unwind is the correction row, dated at the reversal act — historical
as-ofs stay truthful; nothing is excluded-by-flag), and a voided disbursement subtracts its
amount from `void_effective_date` forward. No stored outstanding, no status, ever.

### 3.3 Proposal, hook, belt (the G5 asymmetry)
`book_staff_advance_application(p_client, p_entry {posting_date, memo, lines},
p_allocations, p_kind, p_reason, p_op_key)` (bookkeeper+) drafts the repayment entry directly
with `flags.staff_advance_application = {kind, allocations, reason}` and takes the WCA-R7
branch. **Allocations are line-shaped** (the D-a row-shape lesson): `[{line_no, advance_id,
amount_cents}]` — the hook resolves line_no to the exact leg, requires that leg's account =
the advance's enrolment account, and per-line Σ = the leg's cents exactly.

`clara._adv_on_approve` (spliced after `_adj_on_approve`, same anchor law) — arms
dependency-ordered, **reversal FIRST, then return**: (1) `reversal_of IS NOT NULL` → for a
reversed application entry, append one correction row per ORIGINAL application row (keyed by
the original entry_id, never line ids), dated at the mirror's posting_date; for a reversed
disbursement, stamp the advance's void columns. (2) Credit legs on enrolled accounts →
mint application rows from the flags proposal; **the authoritative guards re-derive HERE,
under the client rung the approve core already holds (0037: 203005003→203005004 before the
hook) + sorted advance row locks**: per-line coverage equality, per-advance cumulative cap,
application-cannot-predate-issue_date — the in-verb copies are early refusals only. (3)
Debit legs (gated `NOT is_opening_balance AND reversal_of IS NULL`) → soft-birth (purpose
NULL → queue chases). `_wdb_reversal_blocked` (the §2.4 splice) also refuses reversing a
disbursement entry while its advance has net applications ≠ 0 (remedy: correct the
applications first).

`clara._tf_advance_movement_belt` (DEFERRED constraint trigger on approved journal_entries,
watermark [enrolled_at, retired_at]): debit legs must carry their register row (hook-
guaranteed; belt = backstop); credit legs must be covered to the exact sen by same-transaction
application rows else `advance_application_missing` (G5); reversal-mirror and… the doors are
exactly these — no opening door exists (enrol-clean-only makes an opening movement on an
enrolled account unlawful by construction). The enrolment-side reservation rides the shared
role predicate, NON-deferred on its doors (the census2 F4/F5 deferral law).

### 3.4 Reads, tie, policy, surface
`staff_advance_summary(p_client, p_as_of)` · `staff_advance_statement(p_client, p_account,
p_from, p_to)` · `staff_advance_tie(p_client, p_as_of)` (the `fa_register_tie` clone,
visibility-only, explained columns) — grant-loop idiom, all reads publish the §3.2 equation.
`clara.ea1955_policy`: effective-dated rows (facts `s22_prior_month_wage_cap`,
`s24_2c_interest_free_recovery`, `s27_no_interest`; source_note citations; the
`sst_threshold_schedule` idiom), system-maintained, surfaced as advisory notes on the summary
— visibility only. Surface: **/advances** clones /aging; queue row_kind
`staff_advance_incomplete`; parts `staff_advance` + `adjustment_run_receipt` on the
identifier-only card idiom.

## 4. S3 — The AF-2 composite (WD-R13)

`clara.resolve_and_book_bank_line(...)` — owner floor. **Composition law (the C1 fold):**
every derived sub-key (`:draft`, `:draft:approve`, `:settle`, `:settle:approve`, `:match`,
`:resolve`) is reserved BEFORE the first lock (the complete_pending_match discipline); the
composite then pre-acquires the full rung set in the house order (203005003 where a
counterparty is involved → 203005004 → 203005006 → sorted row locks), making every inner
verb's own acquisition same-transaction re-entrant — inversion impossible; delegation to the
public verbs stays (the settle_from_bank_line precedent). Build-time verification item:
`_reserve_op` same-transaction re-reservation replays (named in §8).

**Non-high-stakes (one transaction, resolve → book):** resolve the exception (owner floor is
the composite's own) → optional hand-draft with inline `client_resolutions` mint
(file_document precedent, confidence 1.0) and, when it touches an enrolled advance account,
the line-shaped application payload as its flags proposal → approve → `allocate_receipt`/
`allocate_payment` for the settlement → one `match_bank_line` group, live at commit. Both
UI-disabled dispositions re-enabled.

**High-stakes (G9): the settlement leg ONLY.** `bank_matches` anchors exactly one draft, and
a pending group admits zero entry members — so the deferred branch refuses
`p_draft`/`p_adjustments`/`p_advance_applications` by name
(`pending_branch_ancillary_unsupported`; remedy: complete the flip, then book ancillaries as
their own acts). The composite parks the WCA-R7 pending group and records
`bank_matches.pending_resolution = {exception_id, disposition, note, declared_by,
declared_at}` — restricted to `matched_booking`/`written_off_adjustment` (refuse
`bank_corrective_line`: its counterpart-pair arithmetic is verb-side; use the direct verb),
CHECK-bound `pending_resolution IS NULL OR status='pending'`. `complete_pending_match`
(CoR) re-reads the named exception FOR UPDATE — refusing `pending_resolution_stale` when it
is no longer open or does not name this group's line — resolves it (resolved_by = the
DECLARANT; the flip actor rides the receipt), then flips live: one commit, belt-lawful.
`unmatch_bank_match` on a pending group clears `pending_resolution`; the exception stays open.

**The widening is ONE predicate across ALL arms (the M2/C3 fold):** an OPEN exception is
admitted iff it is the one named by a `pending_resolution` being declared (same transaction)
or executed (the flip) — recut identically at: the `line_excepted` walls in `match_bank_line`
(every arity) AND `settle_from_bank_line` · the settled-authority belt's member-INSERT arm ·
its member-UPDATE pending→live cascade arm · its exception arm · `complete_pending_match`'s
own checks. 0040 tail S4.Z re-pinned at the new shape. All under the dual-grep CoR law.

**Post-flip unmatch reopens (the E1 fold):** `unmatch_bank_match` (CoR), releasing a LIVE
group whose line backs a resolved booking-disposition exception, transitions that exception
resolved→open in the same transaction — a single new lawful arm on the one-way transition
trigger, scoped to this path (the completed-recon case already refuses
`recon_period_settled` first). This supersedes the x40.z-A1 stale-survives posture; that
test updates at build.

**Attribution posture (the C17 adjudication):** every D-b direct writer's client is
structurally bound by an FK anchor (template, enrolment, statement line, authority) — per the
ratified 0041/0037 precedent such writers carry no `client_resolutions` row (attribution is
the drafting lane's question); AF-2's free-form hand-draft, the only unanchored writer, mints
one inline. The ARCHITECTURE §0.1 wording is flagged for a doc-alignment note at the close.

## 5. S4 — The `bank_rule_suggested` producer (WD-R13)

`clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` — bookkeeper+.
**Binding (the C9 fold):** row-locks the statement line; refuses while an un-dead
`bank_rule_suggested` draft already exists for the line (the dedup guard); validates rule
SIGNED + kind='coding' + client; re-derives the suggestion live (never trusts a stale
payload); mints a DRAFT by direct INSERT with `flags = {'bank_rule_suggested': {rule_id,
line_id, line_fingerprint}}`. An approve-time arm re-validates under the line lock — signed
rule · line still unmatched/un-excepted · statement live · predicate re-match · the draft's
legs equal the derived legs — refusing `suggestion_stale`. The draft rides the ordinary
/queue lane (never autopost); the 0040 S5 carve-out withholds sighting accrual. Chip:
StatementDetail's dead coding `<span>` → `<button>`. `revise_entry`'s D-b-flags refusal
(§2.6) covers the key; the SS9.5-mirror tail guard greps `_draft_entry_core` for all three
new keys.

## 6. S5 — The D-a residual fixes

1. **`dispose_fixed_asset` second-draft guard** (G10): refuse when
   `_fa_disposal_draft_outstanding(client, asset, ∞)` (`disposal_draft_outstanding`; remedy
   names `withdraw_draft`); the eager `:approve` reservation untouched; /assets gains the
   withdraw affordance on an outstanding disposal draft.
2. **64-edge writer guard — THREE minting paths** (G11 + C15): `revise_fixed_asset_
   particulars`, the partial-disposal split, AND the K6 opening-item replacement path
   (`_draft_opening_item_core`, 0017:3439 — CoR against the LIVE body) each count the chain
   pre-insert and refuse the 65th edge (CLR37, `fa_lineage_too_deep`, remedy names
   dispose-and-reacquire). Parity cells: 64 admits everywhere, 65 refuses everywhere.
3. **`cost_cents` NOT NULL + BOTH 0017 validator sites** (G12): the ALTER (probe-proven
   safe) + CoR recuts of the CLR10 composer site AND the CLR31 seed/activation site with
   explicit `IS NULL` disjuncts for `cost_cents` AND `useful_life_months` — anchors measured
   against the LIVE bodies (0041 already spliced their CLR31 arms); each door keeps its own
   refusal token.
4. **Split-month (G14)**: the law is ratified as built — no arithmetic change. The
   reviewer-visible mechanism: a computed `split_month_advisory` (derived, never stored —
   the DB does not judge materiality; the reviewer does) returned by
   `revise_fixed_asset_particulars`'s response, `get_fixed_asset`, and the close-readiness
   advisory family whenever a lineage's revision is effective past day 1 — naming the
   convention ("revisions effective after the first day affect depreciation from the
   following calendar month") and the correcting-draft route. x42: the day-1/day-2 ownership
   pair + the advisory-presence cell.

## 7. Acceptance (contract §4 D-b item 5)

**Sandbox, labelled-synthetic, in full:** template propose→sign → backdated-start catch-up
drill (all draft) → ramp draft → ONE approval births the pair (mirror relational links
verified) → next occurrence auto-posts + receipt → pair-correction drill
(`reverse_adjustment_pair`; individual-half refusal proven) → edit-re-ramps (retire +
re-propose; retire-with-draft refusal) → high-stakes drop → FYE-guard refusal → zero-charge
noop → advance enrolment (enrol-clean-only refusal on a nonzero account) → disbursement
soft-birth + purpose chase → applications: partial, multi-advance split, all four kinds,
correction-of-correction refusal, over-application under concurrency, bare-credit belt
refuse → disbursement-reversal void (dated) + application-reversal corrections → tie 0 at
two as-ofs → AF-2 non-high-stakes both dispositions → AF-2 high-stakes: pending_resolution →
flip executes (declarant-resolved) → post-flip unmatch REOPENS drill → producer accept →
suggestion-staleness refusal → S5 drills (second-disposal · 65th-edge on all three paths ·
NULL-cost CLR10/CLR31 at both K-doors · the G14 advisory + ownership pair). **Real half:**
≥1 owner-named recurring template signed on a real client, ramp approved on a real month,
auto-reversal proven next period; staff advances close on the G8 named deferral. Supavisor
re-measured at the ceremony.

## 8. Test plan, tails, boundaries

**x42 contract-blind battery** authored from THIS doc + the contract, hunting the two D-a
classes by name (frozen-snapshot reads · row-shape dispatch — the effective-dated
outstanding equation and the line-shaped allocations are their direct D-b descendants).
Named cells: ramp-per-template isolation · mirror-never-earns · the MYT catch-up boundary
day · reversal-date across month/FY ends · pair-guard both halves · belt asymmetry both
arms · act-dating (no caller date) · over-application concurrency · enrolment identity
through retire+re-enrol · pending_resolution exactly-one + stale · reopen-on-unmatch ·
suggestion fingerprint staleness · exactly-64 on three paths · G14 pair. **Tails:** the
approve-path census re-pinned at FIVE · the `scheduled_run` census restated (writers =
`_fa_run_period_core` + `_adj_run_occurrence_core` + the mirror flip; mentioners enumerated)
· positional splice asserts (`_fa` < `_adj` < `_adv` < the settlement early-return) ·
`pending_resolution` CHECK · S4.Z re-pin · the SS9.5-mirror grep (three keys) · the no-wake
census · `_reserve_op` same-transaction re-reservation verified at build. **The named CoR
register** (each dual-grep, live-body sourced): `reverse_entry` +`_wdb_reversal_blocked`
(7th splice) · `revise_entry` (D-b flags) · `match_bank_line` + `settle_from_bank_line`
(`line_excepted` walls) · `_tf_bank_settled_authority_belt` (three arms) ·
`complete_pending_match` · `unmatch_bank_match` + `_tf_bank_line_exception_transition`
(the reopen arm) · `set_client_fy_end` · 0017 K-validator ×2 · 0017 K6 depth guard ·
`dispose_fixed_asset` + `revise_fixed_asset_particulars` (writer guards) · the entry-
immutability allowlist (`auto_reversed_by`). **Boundaries:** no `open_items` widening, no
employee counterparty, no close model, no CA computation, no new LISTEN consumer, no new
frozen workflow class; the AF-2 recuts against the contract's settlement-belt wording are a
boundary INTERPRETATION awaiting sign-off (§9 item 2). Debts carried: segment-aware tie → E ·
staff master → F · account_class binary · MPERS FS wording → E · the attested-baseline
mechanism for pre-existing advance balances (new, from enrol-clean-only).

## 9. Owner sign-off items (pending)

1. **G7's related-party clause is attestation, not structure.** No DB fact distinguishes a
   related-party account; the enrolment verb enforces every structural check that exists and
   takes `p_confirm_dedicated` as the admin's attestation for relatedness. Confirm this
   narrower posture (or commission a firm-maintained never-enrol list as new machinery).
2. **The AF-2 boundary interpretation.** The contract says "posters never touch the
   settlement belts"; AF-2 is a residual VERB (WD-R13), not a poster, and its named recuts
   (§4) are the only lawful way to deliver the ruled composite. Confirm the interpretation
   (recorded as a WDB addendum), or re-scope.
