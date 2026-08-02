# Wave D-b — adjustments + staff advances (migration 0042): the design

> **Status: v3 — grilled 2026-08-02 (WDB-G1..G16 incl. the two post-round-1 addenda), rounds
> 1–2 of the design ladder folded (seven lanes, ~65 findings; the record + every adjudication
> lives in `wave-d-b-design-part2.md`).** Contract: `wave-d-contract.md` §4 D-b
> (WD-R8/R9/R10/R13 — cited, never re-opened). Grounding: the 10-lane D-b census +
> `research/wave-d/split-month-research-2026-08-02.md`. Precedent of record: the 0041
> authority/poster/belt family. `0042` is claimed at MERGE.

---

## 1. Rulings of record (owner, 2026-08-02)

| # | Ruling |
|---|---|
| **WDB-G1** | Auto-reversal is **hook-born at approve**: the reversal mirror is born in the occurrence's approval transaction, dated next-period day 1. `reverse_entry`'s body gains one guard splice (§2.4) and is otherwise untouched. |
| **WDB-G2** | **One act births the approved pair.** The draft discloses the reversal date (explicit in flags) + the mirror legs (mechanical inference from the occurrence's visible lines — stated so no implementer guesses). |
| **WDB-G3** | Cadence CHECK admits **monthly + annual**. |
| **WDB-G4** | **Catch-up occurrences ALL draft** (the MYT boundary, §2.3); ramp autonomy applies only to later periods. |
| **WDB-G5** | **The advance belt is asymmetric**: approved debits soft-birth (purpose chased); bare approved credits refuse, remedy naming the application verb / AF-2. |
| **WDB-G6** | Advance-account **enrolment/retire floor is admin+** (the autopost-rules analogue; deliberately stricter than `fa_account_profiles`' bookkeeper+). |
| **WDB-G7** | **Free account coding; enrolment is the truth**; structural checks where facts exist; the related-party clause by **admin attestation** (ratified as WDB-G15). |
| **WDB-G8** | **No real staff-advance case — named deferral** (the honest-empty precedent). |
| **WDB-G9** | **AF-2 high-stakes: the declared resolution rides the group; the bookkeeper+ flip executes it** (authority attaches at declaration). |
| **WDB-G10** | **Disposal second-draft: guard + UI; per-asset freeze ratified.** |
| **WDB-G11** | **64-edge cap closed writer-side** — three minting paths (§6.2). |
| **WDB-G12** | **`cost_cents` NOT NULL + the 0017 validator fix** (both sites, cost-only disjuncts — §6.3). |
| **WDB-G13** | Seven positions stand: immutable templates · non-control-only lines · many live templates per client · coding-kind-only producer at bookkeeper+ · EA 1955 policy rows, visibility only · AF-2 inline resolution at confidence 1.0 · the surface clones + no new LISTEN consumer. |
| **WDB-G14** | **Split-month PINNED to the actual as-built law** (day-1 → successor; day-2+ → predecessor; no month split; no day pro-rating) + the reviewer-visible advisory + correcting-draft route (§6.4). |
| **WDB-G15** | **The related-party clause is attestation, not structure** (no DB fact exists; `p_confirm_dedicated` recorded; no never-enrol list built). |
| **WDB-G16** | **The AF-2 boundary interpretation ratified**: the contract's "posters never touch the settlement belts" binds the two posters; AF-2's named recuts (§4, §8 register) are the WD-R13-authorized delivery. (The posters themselves touch neither immutability nor the belts — preserved by v3's one-way pair linkage.) |

## 2. S1 — Recurring/reversing adjustment templates (WD-R8/R9)

### 2.1 Schema + line eligibility
`clara.adjustment_templates` clones `fa_depreciation_authorities` (0041:614-686): id, firm_id,
client_id, status CHECK (`proposed`,`live`,`retired`), name, cadence CHECK
(`monthly`,`annual`), start_date, end_date (nullable), auto_reverse boolean, lines jsonb
(≥2 lines `{account_code, debit_cents, credit_cents, description?}`, balanced to the sen,
positive cents), memo_template, proposed/signed/retired actor+op-key columns, content_hash,
created_at. Transition trigger clone; DELETE refused. No one-per-client cap; partial unique
(client_id, content_hash) WHERE status IN ('proposed','live'). **end_date, when set, must be a
cadence period-END for the client** (validated at propose against `_fa_month_end` /
`_fa_fy_end_for`) — no straddled partial final period can exist.

Line eligibility (validated at propose, re-derived at every occurrence AND at approve —
the re-derivation is a CORRECTNESS requirement, §2.6): account exists, `is_active`,
`account_class IS NULL`, not the client's bank `coa_account_code`, and unreserved per
`clara._acct_role_reserved(client, code)` — a **LOCK-FREE stable reader** returning
(domain, role) over: FA active profiles ∪ FA register rows (exactly 0041's law) ∪ ACTIVE
advance enrolments ∪ advance register rows of active enrolments. Callers own their refusal
text. `_fa_lock_roles` (the `client:fa-roles` leaf) is taken ONLY by enrolment/propose/retire
doors — never on posting or approve paths (the leaf-LAST law; tail 13(c) re-pinned at the new
membership).

### 2.2 Verbs + lifecycle guards
`propose_adjustment_template` (bookkeeper+) · `sign_adjustment_template` (admin+ — and it
**revalidates cadence alignment + end_date against the CURRENT client FYE under the 203005004
rung** at signing, so a proposal that survived an FYE change cannot sign stale) ·
`retire_adjustment_template` (admin+, reason; refuses while an occurrence draft is
outstanding — `occurrence_draft_outstanding`, remedy: approve or `withdraw_draft`). Signing
stamps signed_by (the `last_human_editor` identity — the distinct-checker arm).
**`set_client_fy_end` (CoR): takes the 203005004 rung, then refuses while a live
ANNUAL-cadence template OR a live ANNUAL-cadence depreciation authority exists** (remedy:
retire → change → re-sign, which re-ramps). Monthly-cadence authorities/templates are
FY-independent (`_fa_run_period_core`'s cadence branch) and do NOT block — the sandbox's live
monthly authority is the acceptance cell.

### 2.3 The poster
`clara._adj_run_occurrence_core(p_client, p_template, p_period_start, p_period_end, p_op_key,
p_actor, p_firm, p_verb)` mirrors `_fa_run_period_core`: `_reserve_op` + the eager derived
`:approve` reservation → client rung 203005004 → template live check → period cadence-aligned
and ENDED (MYT) → per-template sequencing (an outstanding draft for THIS template blocks only
its own next occurrence). Direct INSERT into `journal_entries` (SS9.5): status='draft',
origin='scheduled_run', posting_date = period_end, maker_actor = actor, last_human_editor =
template.signed_by, `flags = {'recurring_adjustment': {template_id, op_key,
role:'occurrence', auto_reverse, reversal_date, period_start, period_end}}`, lines from the
template. Exact-balance assert (CLR07).

**Mode**: `post` iff ramp-earned AND NOT `is_high_stakes(entry)` AND NOT catch-up. Catch-up
(G4): forced-draft ⇔ `period_end < (signed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date`; a
period ending ON the MYT sign date follows the normal ramp law (boundary-day cell). **Ramp**
(derived, per-template): EXISTS ≥1 OTHER approved, un-reversed, origin='scheduled_run' entry
with this template_id AND role='occurrence'. An approved catch-up earns it; occurrence #1
always drafts (nothing can earn before the first approval — including after retire+
re-propose, a fresh id). Approve-time re-derives mode identically.

**Due oracle** `adjustment_run_due(p_client)` (STABLE, security definer; clara_runtime +
clara_authenticated): the oldest unmet (template_id, period) across live templates that are
not draft-blocked, plus `blocked: [{template_id, reason}]` — rendered on the /rules template
panel (§2.8) so a stuck chain is visible. Unmet = cadence-complete, ended, within [start_date,
end_date], no approved un-reversed role='occurrence' entry for the template+period. Machine
verb `run_adjustment_occurrence` (EXECUTE clara_runtime only); human twin
`run_adjustment_manual` (bookkeeper+). Tail: no wake-allowlist rows name any D-b verb; every
`_adj_*` helper owner-only.

### 2.4 Auto-reversal — the pair
On approval of an occurrence with auto_reverse, `_adj_on_approve` births the mirror **in the
reverse_entry shape** (the lawful birth of an approved entry): INSERT status='draft'
(origin='scheduled_run', posting_date = period_end + 1 day — always today-or-past at
approval, `flags.recurring_adjustment = {template_id, role:'reversal', period_start,
period_end, op_key}`, maker_actor = template.signed_by, last_human_editor =
template.signed_by) → leg-swapped lines → `_assert_balanced` → UPDATE draft→approved stamping
`checker_actor` = the occurrence's approving actor + `approved_at` (G2's one act) →
`perform clara._subledger_on_approve(v_mirror)` (the H.2 precedent). The **approve PATHS stay
the pinned FOUR** (0037:3779-3782 unchanged); the hook's **CALLER census goes to FIVE**
naming `_adj_on_approve`, with a bounded-recursion assert (the mirror's role='reversal'
re-enters no mutation arm).

**Linkage is one-way relational**: the mirror carries `auto_reversal_of` (FK → the
occurrence, UNIQUE). There is NO occurrence-side column — pair state derives by join, so
`journal_entries` immutability is never recut (G16's premise preserved).
`reversal_of`/`reversed_by` stay unused on the pair: (a) the ramp's reversed_by filter would
permanently starve auto-reverse templates; (b) reverse_entry's walls would leave a wrong pair
with no correction door. Both ladder-verified.

**Pair correction**: `_wdb_reversal_blocked(p_entry)` — ONE verb-side splice into
`reverse_entry` (its 7th) + a hook defense arm — refuses reversing EITHER half individually
(`adjustment_pair_locked`). The sanctioned path, `reverse_adjustment_pair(p_client,
p_occurrence, p_reason, p_op_key)` (bookkeeper+), does NOT call `reverse_entry`: a private
`_pair_reverse_core` births both correction mirrors itself (the 13-column recipe, invoking
the same guard helpers the splices use — the allocation, bank-match, and FA walls — without
touching the monolith). Low-stakes: both mirrors approved + both halves' `reversed_by`
stamped in ONE transaction (the corrected occurrence stops counting toward the ramp; the ramp
un-earns only when it was the sole earner; the due oracle re-opens the period). High-stakes:
both mirrors land as DRAFTS under a linked pair receipt, and one checker verb
`approve_pair_reversal(p_client, p_pair, p_op_key)` (bookkeeper+, distinct-checker law
intact) approves BOTH atomically — no state where one half is corrected alone.

### 2.5 Receipts
`clara.adjustment_runs` minted in `_adj_on_approve` after the mirror exists (so
`reversal_entry_id` rides the INSERT; the row is fully immutable): id, firm, client,
template_id, period_start/period_end, mode, entry_id (unique), reversal_entry_id (nullable),
amount_cents, op_key (unique per firm), created_at. No (template, period) uniqueness. Event:
`adjustment.posted`.

### 2.6 The approve-hook bindings
`_adj_on_approve` splices into `_subledger_on_approve` **immediately after `perform
clara._fa_on_approve(p_entry);` and above the `settlement_allocation` early-return**
(positional tail assert, per-INVOCATION — the mirror's nested hook chain completes inside the
occurrence's `_adj` arm, before the occurrence's `_adv`). Arms, dependency-ordered:
**(0)** `flags.recurring_adjustment.role='reversal'` → nothing to materialise, return (the
mirror's dispatch is stated, not inferred; its swapped debit legs would otherwise reach both
soft-birth arms — the §2.1 eligibility re-derivation is what guarantees they are no-ops, a
named correctness dependency with its own cell). **(1)** `reversal_of IS NOT NULL` →
pair-guard defense, return. **(2)** role='occurrence' → re-validate before minting: origin =
'scheduled_run' · the issuer op-receipt under the two run verbs with request-hash re-derived
from (client, template_id, period_start, period_end) · template still live · line-set
byte-equal to the template's · cadence-aligned + ended · mode re-derived — refuse
`adjustment_stale` with a named axis; then the mirror birth (§2.4) + the receipt (§2.5).
**`revise_entry` is CoR-recut to refuse any draft carrying a D-b proposal flag** (all three
keys — the 0041 S4.9 precedent): proposal drafts are correct-by-reissue.

### 2.7 Runtime
Leader 5th due-check `adjustmentRunDue` (env `CLARA_ADJ_RECONCILE_MS`, 24h fallback) +
`reconciler-adjustments.mjs` (per-cycle feature-detect · one client at a time · per-client
error isolation · `ADJ_OCCURRENCE_CAP=24` · `adj*` key prefix · the shared 'reconciler'
heartbeat). No new LISTEN consumer; no WDK; no freeze implications.

### 2.8 Surface
/rules gains the **AdjustmentTemplatePanel** (list + propose form + per-template sign/retire
acts, mirroring AutopostRulePanel; each template row shows its due/blocked state from
`adjustment_run_due` — the `blocked[]` list's named consumer). Ramp/catch-up/high-stakes
drafts ride the existing /queue draft lane unchanged. Parts: `adjustment_run_receipt`
(identifier-only card on the receipt idiom).

## 3. S2 — Staff advances (WD-R10, the B-lite register)

### 3.1 Enrolment
`clara.staff_advance_accounts` clones `fa_account_profiles`: id, firm, client, account_code,
person_label, active, enrolled_at, created_by/created_at, retired_by/retired_at; partial
unique (client, account_code) WHERE active; version-forward; no-delete; RLS forced. Verbs
`enrol_staff_advance_account` / `retire_staff_advance_account` — admin+ (G6), taking
`_fa_lock_roles` (enrolment doors only). Enrolment validation: active · account_type='asset'
· `account_class IS NULL` · not the bank door · unreserved per `_acct_role_reserved` —
**where a RETIRED advance enrolment of the same code does NOT block re-enrolment** (same-
domain history is admitted; active advances, FA roles, and bank roles refuse) · **approved GL
balance = 0** (`enrolment_balance_nonzero` — enrol-clean-only; a synthetic opening row would
fabricate the per-disbursement identity WD-R10 requires; pre-existing balances defer to a
future attested-baseline mechanism, a named debt; zero real cases exist per G8) · the
related-party attestation `p_confirm_dedicated` (G15). **Retire refuses while any advance on
the enrolment has outstanding > 0** (`advance_outstanding_on_retire`).

### 3.2 The register
`clara.staff_advances` (append-only): id, firm, client, **enrolment_id** (immutable FK),
account_code, disbursement_line_id (unique, FK journal_lines, NOT NULL), entry_id, issue_date
(= the entry's posting_date), amount_cents (>0), purpose/reference (set-once via
`complete_staff_advance_particulars`, bookkeeper+), voided_by_entry_id / void_effective_date
(set-once, hook-written; **void_effective_date = the reversal mirror's posting_date**),
created_at.

`clara.staff_advance_applications` (append-only): id, firm, client, advance_id, enrolment_id,
application_line_id (FK journal_lines), entry_id, kind CHECK (`payroll_deduction`,
`bank_return`,`claim`,`correction`), amount_cents (>0), effective_date (= the application
entry's posting_date, derived in-hook, never caller-supplied), reverses_application_id
(nullable FK — must reference a non-correction row; multiple leaf corrections allowed;
cumulative corrections ≤ the original's amount), created_by, reason, created_at.
**`correction` rows are HOOK-BORN ONLY** (the reversal arm) — the proposal kind set is the
other three; a manual correction is booked by reversing the wrong application entry.

**The outstanding equation (published; every read/tie implements it verbatim):**
`outstanding(advance, as_of) = (amount_cents if issue_date ≤ as_of else 0)
− Σ application effects with effective_date ≤ as_of − (amount if void_effective_date ≤ as_of)`
— an original application counts at every as-of ≥ its effective_date EVEN IF its entry is
later reversed (the unwind is the correction row, dated at the reversal act); nothing is
excluded-by-flag; no stored outstanding, no status, ever.

### 3.3 Proposal, hook, belt (the G5 asymmetry)
`book_staff_advance_application(p_client, p_entry {posting_date, memo, lines},
p_allocations, p_kind, p_reason, p_op_key)` (bookkeeper+; p_kind IN the three proposal
kinds) drafts the repayment entry directly with `flags.staff_advance_application = {kind,
allocations, reason}` and takes the WCA-R7 branch. **Allocations are line-shaped**:
`[{line_no, advance_id, amount_cents}]` — the hook resolves line_no to the exact leg,
requires the leg's account = the advance's enrolment account, per-line Σ = the leg's cents.

`clara._adv_on_approve` (spliced after `_adj_on_approve`, same anchor law), arms
dependency-ordered: **(1) reversal FIRST, return** — for a reversed application entry,
append one correction per ORIGINAL application row at the **uncorrected remainder**
(original − Σ prior leaf corrections; zero remainder → no row), dated at the mirror's
posting_date; for a reversed disbursement, stamp the void columns. **(2)** credit legs on
enrolled accounts → mint applications from the flags proposal; the authoritative guards
re-derive HERE under the client rung the approve core holds + sorted advance row locks:
per-line coverage equality, per-advance cumulative cap, no-predate. **(3)** debit legs
(gated `NOT is_opening_balance AND reversal_of IS NULL`) → soft-birth (purpose chased).
`_wdb_reversal_blocked` (the §2.4 splice) also refuses: reversing a disbursement entry while
its advance has net applications ≠ 0, and reversing a correction-carrying entry outright
(`correction_entry_irreversible`; remedy: book an offsetting application).

`clara._tf_advance_movement_belt` (DEFERRED constraint trigger on approved journal_entries,
watermark [enrolled_at, retired_at]): debit legs must carry their register row; credit legs
must be covered to the exact sen by same-transaction applications else
`advance_application_missing`; the reversal-mirror door completes the set (no opening door —
enrol-clean-only). The enrolment-side reservation is NON-deferred on its doors.

### 3.4 Reads, tie, policy, surface
`staff_advance_summary(p_client, p_as_of)` · `staff_advance_statement(p_client, p_account,
p_from, p_to)` · `staff_advance_tie(p_client, p_as_of)` — visibility-only, explained columns,
and **the tie groups by ACCOUNT_CODE, walking EVERY enrolment generation that ever held the
code** (the FA G8 law restated for the enrolment_id key): Σ over all generations' advances
per the §3.2 equation vs the approved GL balance as-of. Grant-loop idiom.
`clara.ea1955_policy`: effective-dated rows (facts `s22_prior_month_wage_cap`,
`s24_2c_interest_free_recovery`, `s27_no_interest`; source_note citations), system-
maintained, surfaced as advisory notes on the summary — visibility only. Surface:
**/advances** clones /aging; queue row_kind `staff_advance_incomplete`; part `staff_advance`
(identifier-only card).

## 4. S3 — The AF-2 composite (WD-R13)

`clara.resolve_and_book_bank_line(...)` — owner floor. **Composition law (rounds 1–2):**
(a) sub-keys spent by a reserving PUBLIC verb (`:draft`, `:settle`, `:match`, `:resolve`)
are NOT pre-reserved — the callee reserves them; keys spent through `receipt_preheld:true`
core calls (`:draft:approve`, `:settle:approve`) ARE pre-reserved before the first lock;
branch-unreachable keys finish with the 0038 deferral-marker idiom. (b) The composite
**row-locks every pre-existing journal entry it will pass to match BEFORE acquiring rungs**
(the match_bank_line precondition; transaction-new entries exempt), then pre-acquires
203005003 (where a counterparty is involved) → 203005004 → 203005006 — inner acquisitions
are same-transaction re-entrant. (c) The settle path goes through a factored preheld-aware
`_settle_from_bank_line_core` (CoR: the public wrapper reserves-then-delegates; the
composite pre-reserves and calls the core with its declaration in p_ctx).

**Non-high-stakes (one transaction, resolve → book):** resolve the exception → optional
hand-draft with inline `client_resolutions` mint (confidence 1.0) and, on an enrolled
advance account, the line-shaped application payload as its flags proposal → approve →
allocate → one `match_bank_line` group, live at commit — every `line_excepted` wall sees
status='resolved', so **`match_bank_line` is untouched**. The group is stamped
`resolution_exception_id` (immutable) at creation. Both UI-disabled dispositions re-enabled.

**High-stakes (G9): the settlement leg ONLY** (a pending group anchors exactly one draft and
zero entry members): refuse `p_draft`/`p_adjustments`/`p_advance_applications`
(`pending_branch_ancillary_unsupported`; remedy: flip first, then book ancillaries as their
own acts). The composite parks the WCA-R7 pending group with
`pending_resolution = {exception_id, disposition, note, declared_by, declared_at}` —
restricted to the two booking dispositions (`bank_corrective_line` refused: its counterpart
arithmetic is verb-side; use the direct verb), CHECK `pending_resolution IS NULL OR
status='pending'`. **The widening touches exactly TWO sites**: the settle core's
`line_excepted` wall (reads the declaration from p_ctx) and the settled-authority belt's
member-INSERT arm (admits the open exception a pending group's `pending_resolution` names —
one join; the flip/cascade/exception arms need no widening, since resolution + live commit
together). `complete_pending_match` (CoR) re-reads the exception FOR UPDATE
(`pending_resolution_stale` when no longer open or not this line), resolves it (resolved_by
= the DECLARANT; the flip actor on the receipt), and its flip UPDATE **clears
`pending_resolution` and stamps `resolution_exception_id` in the same statement**.
`unmatch_bank_match` on a pending group clears `pending_resolution`; the exception stays
open.

**Post-flip unmatch reopens**: `unmatch_bank_match` (CoR), releasing a LIVE group carrying
`resolution_exception_id` (the identity survives the flip and the unmatch), transitions
exactly that exception resolved→open — after a pre-check refusing `exception_reopen_blocked`
when a newer open exception exists on the line, and behind the existing completed-recon
refusal. The reopen erases the five resolution columns but mints
`bank.line_exception_reopened` + an audit row carrying the erased owner act. A new lawful
arm on the transition trigger, scoped to this path; supersedes x40.z-A1 (test updated at
build). The recon exceptions table badges **"resolution parked"** via a read join on
`pending_resolution` (the /bank pending-group chase already surfaces the draft).

**Attribution posture (adjudicated)**: every D-b direct writer's client is structurally
bound by an FK anchor (template, enrolment, statement line, authority) — per the ratified
0041/0037 precedent such writers carry no `client_resolutions` row; AF-2's free-form
hand-draft, the only unanchored writer, mints one inline. The ARCHITECTURE §0.1 wording is
flagged for a doc-alignment note at the close.

## 5. S4 — The `bank_rule_suggested` producer (WD-R13)

`clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` — bookkeeper+.
Row-locks the line; refuses while an un-dead suggested draft exists for it; validates rule
SIGNED + kind='coding' + client; re-derives the suggestion live; mints a DRAFT by direct
INSERT with `flags = {'bank_rule_suggested': {rule_id, line_id}}` (line rows are immutable —
no fingerprint needed). An approve-time arm re-validates under the line lock — signed rule ·
line still unmatched/un-excepted · statement live · predicate re-match · the draft's legs
equal the derived legs — refusing `suggestion_stale`. The draft rides the ordinary /queue
lane; the 0040 S5 carve-out withholds sighting accrual. Chip: StatementDetail's dead coding
`<span>` → `<button>`. The SS9.5-mirror tail guard + `revise_entry`'s refusal cover the key.

## 6. S5 — The D-a residual fixes

1. **`dispose_fixed_asset` second-draft guard** (G10): refuse on
   `_fa_disposal_draft_outstanding` (`disposal_draft_outstanding`; remedy `withdraw_draft`);
   the eager `:approve` reservation untouched; /assets gains the withdraw affordance.
2. **64-edge writer guard — THREE minting paths** (G11): `revise_fixed_asset_particulars`,
   the partial-disposal split, AND the K6 replacement path (`_draft_opening_item_core`,
   0017:3439, CoR vs the live body) refuse the 65th edge (CLR37, `fa_lineage_too_deep`).
   Parity cells: 64 admits everywhere, 65 refuses everywhere.
3. **`cost_cents` NOT NULL + BOTH 0017 validator sites, cost-only** (G12): the ALTER
   (probe-proven safe) + `v_cost IS NULL OR` disjuncts at the CLR10 composer site AND the
   CLR31 seed/activation site (anchors vs the LIVE bodies — 0041 already spliced their CLR31
   arms). `useful_life_months` is already method-conditionally checked — no global
   null-refusal (it would break `method='none'`).
4. **Split-month (G14)**: no arithmetic change. ONE helper `_fa_split_month_advisory(asset)`
   — qualifying edges = revision successors (minted by `revise_fixed_asset_particulars`)
   with effective_from past day 1; partial-disposal splits excluded — invoked from
   `_fa_asset_json` (which feeds list/get) AND returned by the revise verb's response,
   naming the convention and the correcting-draft route. Derived, never stored — the DB does
   not judge materiality. x42: the day-1/day-2 ownership pair + advisory presence.

## 7. Acceptance (contract §4 D-b item 5)

**Sandbox, labelled-synthetic, in full:** template propose→sign → backdated-start catch-up
(all draft) → ramp draft → ONE approval births the pair (`auto_reversal_of` verified) → next
occurrence auto-posts + receipt → two-occurrence ramp cell (correct one occurrence; the ramp
survives; the next still auto-posts) → pair correction low-stakes (one transaction) AND
high-stakes (two drafts + `approve_pair_reversal` atomic; individual-half refusal proven) →
edit-re-ramps (retire + re-propose; retire-with-draft refusal) → high-stakes drop →
FYE-guard: annual blocks, **live MONTHLY authority does NOT block** → sign-time FYE
revalidation → zero-charge noop → advance enrolment (enrol-clean-only refusal; re-enrol
after retire admitted) → disbursement soft-birth + purpose chase → applications: partial,
multi-advance split, the three proposal kinds, hook-born corrections via reversal
(uncorrected-remainder cell), correction-entry-irreversible refusal, over-application under
concurrency, bare-credit belt refuse → disbursement-reversal void (dated) → **tie at 0 at
two as-ofs + the retire/re-enrol HISTORICAL as-of drill** → AF-2 non-high-stakes both
dispositions (`resolution_exception_id` stamped) → AF-2 high-stakes: pending_resolution →
flip executes (declarant-resolved; cleared+stamped in one statement) → post-flip unmatch
REOPENS (exact exception; newer-open refusal; the reopen event + audit) → producer accept →
suggestion-staleness refusal → S5 drills (second-disposal · 65th-edge on all three paths ·
NULL-cost at both K-doors · the G14 advisory + ownership pair). **Real half:** ≥1
owner-named recurring template signed on a real client, ramp approved on a real month,
auto-reversal proven next period; staff advances close on the G8 named deferral. Supavisor
re-measured at the ceremony.

## 8. Test plan, tails, boundaries

**x42 contract-blind battery** authored from THIS doc + the contract, hunting the two D-a
classes by name (frozen-snapshot reads · row-shape dispatch — the effective-dated equation
and line-shaped allocations are their D-b descendants). Named cells: ramp-per-template
isolation · mirror-never-earns (both mirror kinds) · the MYT catch-up boundary day ·
reversal-date across month/FY ends · pair-guard both halves + the high-stakes pair machine ·
mirror-births-no-register-row (the §2.6 arm-0 dependency) · belt asymmetry both arms ·
act-dating · over-application concurrency · issue-date-gated as-ofs · enrolment identity +
tie through retire/re-enrol at historical as-ofs · pending_resolution exactly-one + stale ·
reopen identity + newer-open refusal · suggestion staleness · exactly-64 on three paths ·
G14 pair. **Tails:** approve PATHS pinned at FOUR (unchanged); the hook-CALLER census at
FIVE + bounded-recursion assert · the `scheduled_run` census restated (writers =
`_fa_run_period_core` + `_adj_run_occurrence_core` + the mirror flip; mentioners enumerated)
· per-invocation positional splice asserts · `pending_resolution` CHECK ·
`resolution_exception_id` immutability · S4.Z re-pin (the settle-core factoring) · the
SS9.5-mirror grep (three keys) · the no-wake census · a probe that `_reserve_op` RAISES on
same-transaction re-reserve with a different hash · tail 13(c) re-pinned (leaf takers =
enrolment doors only). **The CoR register** (dual-grep, live-body sourced): `reverse_entry`
+`_wdb_reversal_blocked` (7th splice) · `revise_entry` (D-b flags) · `settle_from_bank_line`
→ core factoring + wall widening · `_tf_bank_settled_authority_belt` (member-INSERT arm) ·
`complete_pending_match` (stale-check + clear/stamp flip) · `unmatch_bank_match` +
`_tf_bank_line_exception_transition` (the reopen arm) · `set_client_fy_end` (rung + guard) ·
0017 K-validator ×2 (cost-only) · 0017 K6 depth guard · `dispose_fixed_asset` +
`revise_fixed_asset_particulars` (writer guards). **Boundaries:** no `open_items` widening,
no employee counterparty, no close model, no CA computation, no new LISTEN consumer, no new
frozen workflow class; the posters touch neither `journal_entries` immutability nor the
settlement belts (v3's one-way linkage keeps this literal); AF-2's recuts ride WDB-G16.
Debts: segment-aware tie → E · staff master → F · account_class binary · MPERS FS wording →
E · the attested-baseline mechanism for pre-existing advance balances · the ARCHITECTURE
§0.1 wording alignment note (at the close).
