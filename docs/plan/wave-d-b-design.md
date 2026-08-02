# Wave D-b — adjustments + staff advances (migration 0042): the design

> **Status: v4 — grilled 2026-08-02 (WDB-G1..G16), rounds 1–3 of the design ladder folded
> (nine lanes, ~80 findings; the full record + every adjudication lives in
> `wave-d-b-design-part2.md`).** Contract: `wave-d-contract.md` §4 D-b (WD-R8/R9/R10/R13 —
> cited, never re-opened). Grounding: the 10-lane D-b census +
> `research/wave-d/split-month-research-2026-08-02.md`. Precedent of record: the 0041
> authority/poster/belt family. `0042` is claimed at MERGE.

---

## 1. Rulings of record (owner, 2026-08-02)

| # | Ruling |
|---|---|
| **WDB-G1** | Auto-reversal is **hook-born at approve**: the reversal mirror is born in the occurrence's approval transaction, dated next-period day 1. |
| **WDB-G2** | **One act births the approved pair** (the mirror's approval routes through the core under the same actor + attestation — §2.4). |
| **WDB-G3** | Cadence CHECK admits **monthly + annual**. |
| **WDB-G4** | **Catch-up occurrences ALL draft** (the MYT boundary, §2.3). |
| **WDB-G5** | **The advance belt is asymmetric**: approved debits soft-birth; bare approved credits refuse. |
| **WDB-G6** | Advance-account **enrolment/retire floor is admin+** (the autopost-rules analogue). |
| **WDB-G7** | **Free account coding; enrolment is the truth**; the related-party clause by admin attestation (WDB-G15). |
| **WDB-G8** | **No real staff-advance case — named deferral.** |
| **WDB-G9** | **AF-2 high-stakes: the declared resolution rides the group; the bookkeeper+ flip executes it.** |
| **WDB-G10** | **Disposal second-draft: guard + UI; per-asset freeze ratified.** |
| **WDB-G11** | **64-edge cap closed writer-side** — three minting paths (§6.2). |
| **WDB-G12** | **`cost_cents` NOT NULL + the 0017 validator fix** (both sites, cost-only — §6.3). |
| **WDB-G13** | Seven positions stand (immutable templates · non-control lines · many-per-client · coding-kind producer · EA 1955 visibility rows · confidence-1.0 inline resolution · surface clones, no new consumer). |
| **WDB-G14** | **Split-month PINNED to the actual as-built law** + the reviewer-visible advisory (§6.4). |
| **WDB-G15** | **Related-party is attestation, not structure.** |
| **WDB-G16** | **The AF-2 boundary interpretation ratified**: the two posters touch neither `journal_entries` immutability nor the settlement belts (v4 preserves this literally); AF-2's named recuts are the WD-R13-authorized delivery. |

## 2. S1 — Recurring/reversing adjustment templates (WD-R8/R9)

### 2.1 Schema + line eligibility
`clara.adjustment_templates` clones `fa_depreciation_authorities` (0041:614-686): id, firm_id,
client_id, status CHECK (`proposed`,`live`,`retired`), name, cadence CHECK
(`monthly`,`annual`), start_date, end_date (nullable), auto_reverse boolean, lines jsonb
(≥2 lines `{account_code, debit_cents, credit_cents, description?}`, balanced to the sen,
positive cents — an occurrence therefore ALWAYS carries a charge; no noop state exists),
memo_template, proposed/signed/retired actor+op-key columns, content_hash, created_at.
Transition trigger clone; DELETE refused. No one-per-client cap; partial unique
(client_id, content_hash) WHERE status IN ('proposed','live'). **end_date, when set, must be
a cadence period-END for the client** (validated at propose against `_fa_month_end` /
`_fa_fy_end_for`).

Line eligibility (validated at propose, re-derived at every occurrence AND at approve — a
CORRECTNESS requirement, §2.6): account exists, `is_active`, `account_class IS NULL`, not
the client's bank `coa_account_code`, and unreserved per
`clara._acct_role_reserved(client, code)` — a **LOCK-FREE stable reader** returning
(domain, role) over: FA active profiles ∪ FA register rows (exactly 0041's law) ∪ ACTIVE
advance enrolments ∪ advance register rows of active enrolments. Callers own their refusal
text. `_fa_lock_roles` (the `client:fa-roles` leaf) is taken ONLY by enrolment/propose/
retire doors — never on posting or approve paths (leaf-LAST; tail 13(c) re-pinned).

### 2.2 Verbs + lifecycle guards
`propose_adjustment_template` (bookkeeper+) · `sign_adjustment_template` (admin+ —
revalidates cadence alignment + end_date against the CURRENT client FYE under the 203005004
rung) · `retire_adjustment_template` (admin+, reason; refuses while an occurrence draft is
outstanding — `occurrence_draft_outstanding`). Signing stamps signed_by (the
`last_human_editor` identity — the distinct-checker arm). **`set_client_fy_end` (CoR): takes
the 203005004 rung, then refuses while a live ANNUAL-cadence template OR a live
ANNUAL-cadence depreciation authority exists** (monthly-cadence ones are FY-independent and
do NOT block — the sandbox's live monthly authority is the acceptance cell).

### 2.3 The poster
`clara._adj_run_occurrence_core(...)` mirrors `_fa_run_period_core`: `_reserve_op` + the
eager derived `:approve` reservation → client rung 203005004 → template live check → period
cadence-aligned and ENDED (MYT) → per-template sequencing (an outstanding draft blocks only
its own template). Direct INSERT (SS9.5): status='draft', origin='scheduled_run',
posting_date = period_end, maker_actor = actor, last_human_editor = template.signed_by,
`flags = {'recurring_adjustment': {template_id, op_key, role:'occurrence', auto_reverse,
reversal_date, period_start, period_end}}`, lines from the template. Exact-balance assert.

**Mode**: `post` iff ramp-earned AND NOT `is_high_stakes(entry)` AND NOT catch-up. Catch-up
(G4): forced-draft ⇔ `period_end < (signed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date`; the
boundary day follows the normal ramp law. **Ramp** (derived, per-template): EXISTS ≥1 OTHER
approved, un-reversed occurrence entry of this template. Occurrence #1 always drafts.
Auto-post uses `_approve_entry_core(receipt_preheld:true)` with the reserved `:approve` key
(the 0041:3559 shape). Approve-time re-derives mode identically.

**Due oracle** `adjustment_run_due(p_client)`: the oldest unmet (template_id, period)
across live non-draft-blocked templates + `blocked: [{template_id, reason}]` (rendered on
the /rules panel, §2.8). Machine verb `run_adjustment_occurrence` (clara_runtime only);
human twin `run_adjustment_manual` (bookkeeper+). Tail: no wake rows; `_adj_*` owner-only.

### 2.4 Auto-reversal — the pair
On approval of an auto_reverse occurrence, `_adj_on_approve` births the mirror: INSERT
status='draft' (origin='scheduled_run', posting_date = period_end + 1 day,
`flags.recurring_adjustment = {template_id, role:'reversal', period_start, period_end,
op_key}`, maker_actor = last_human_editor = template.signed_by) → leg-swapped lines →
`_assert_balanced` → **approval via `clara._approve_entry_core(jsonb_build_object('actor',
<the occurrence's approving actor>, 'firm', ..., 'receipt_preheld', true), v_mirror, v_rev,
<the occurrence approval's attestation>, <the pre-reserved mirror :approve key>)`** — NEVER
a direct status UPDATE. Consequences (ladder-ratified): the approve-path census stays the
pinned FOUR; the hook-CALLER census stays FOUR (the core calls the hook); **CLR05 holds on
the mirror** — a distinct checker passes (the mirror's last_human_editor is the signer); the
signer-as-checker case follows the occurrence's own CLR05 outcome, and a solo firm's
attestation threads from the occurrence's approval to the mirror's (G2's one act — the §7
signer-approves-own cell).

**Linkage is one-way relational**: the mirror carries `auto_reversal_of` (FK → the
occurrence, UNIQUE). No occurrence-side column; pair state derives by join; `journal_entries`
immutability is never recut (G16 literal). `reversal_of`/`reversed_by` stay unused on the
pair (ramp starvation + the correction dead-end — both ladder-verified).

**Pair correction**: `_wdb_reversal_blocked(p_entry)` — ONE verb-side splice into
`reverse_entry` (its 7th) + the hook defense arm — refuses reversing EITHER half of an
auto-pair individually (`adjustment_pair_locked`). A solo (non-auto-reverse) occurrence has
NO pair: plain `reverse_entry` is its path, and `reverse_adjustment_pair` refuses it
(`not_an_auto_pair`). The sanctioned pair path:
- `reverse_adjustment_pair(p_client, p_occurrence, p_reason, p_op_key)` (bookkeeper+) →
  the private `_pair_reverse_core` births BOTH correction mirrors itself (the 13-column
  recipe; `maker_actor = last_human_editor =` the CALLER on both; MYT dates; guard set:
  the double-reverse walls inline + `_subledger_allocated_items_present` +
  `_bank_live_match_present` + `_fa_reversal_blocked` as defense-in-depth + the K-boundary
  by VACUITY (pair members are never opening-balance — tail probe); the 203005004 rung
  AFTER both JE row locks; `_wdb_reversal_blocked` deliberately NOT invoked). It mints an
  **`clara.adjustment_pair_reversals` receipt** (occurrence_id, mirror_id, both
  correction-draft ids, maker, status `pending`→`completed`/`cancelled`, op_key; ONE active
  pair per occurrence; transition trigger).
- Low-stakes: both corrections approved via `_approve_entry_core(receipt_preheld)` under
  pre-reserved `:occ:approve`/`:mir:approve` keys + both halves' `reversed_by` stamped in
  ONE transaction (the corrected occurrence stops counting toward the ramp; the ramp
  un-earns only when it was the sole earner; the due oracle re-opens the period).
- High-stakes: both corrections stay DRAFTS on the `pending` receipt.
  `approve_pair_reversal(p_client, p_pair, p_attestation default null, p_op_key)` — one
  distinct checker (CLR05 via the core on both; the solo-attestation branch exists) approves
  BOTH via the core atomically and completes the receipt. Single-half defenses: the hook
  defense arm refuses an ordinary `approve_entry` on a pair-correction draft (remedy names
  `approve_pair_reversal`); `withdraw_draft` (CoR) refuses a pair draft, remedy naming
  `cancel_pair_reversal` (withdraws both + cancels the receipt atomically).

### 2.5 Receipts
`clara.adjustment_runs` minted in `_adj_on_approve` after the mirror exists: id, firm,
client, template_id, period_start/period_end, mode, entry_id (unique), reversal_entry_id
(nullable), amount_cents, op_key (unique per firm), created_at. Fully immutable (its own
`_tf_adjustment_runs_immutable`, the 0041:733-748 clone). No (template, period) uniqueness.
Event: `adjustment.posted`.

### 2.6 The approve-hook bindings
`_adj_on_approve` splices into `_subledger_on_approve` immediately after `perform
clara._fa_on_approve(p_entry);` and above the `settlement_allocation` early-return
(per-INVOCATION positional tail assert; the nested chain note stands). Arms: **(0)**
role='reversal' → return (its swapped debit legs would otherwise reach both soft-birth
arms; the §2.1 approve-time eligibility re-derivation is the named correctness dependency,
with its own cell). **(1)** `reversal_of IS NOT NULL` → the pair-guard defense (refuse an
ordinary approval of a pair-correction draft; otherwise return). **(2)** role='occurrence'
→ re-validate before minting: origin · the issuer op-receipt (request-hash from client +
template + period) · template live · line-set byte-equal · cadence-aligned + ended · mode
re-derived — refuse `adjustment_stale` with a named axis; then the mirror birth (§2.4) +
the receipt (§2.5). **`revise_entry` (CoR) refuses any draft carrying a D-b proposal flag**
(all three keys).

### 2.7 Runtime
Leader 5th due-check `adjustmentRunDue` (env `CLARA_ADJ_RECONCILE_MS`) +
`reconciler-adjustments.mjs` (feature-detect · per-client isolation · `ADJ_OCCURRENCE_CAP=24`
· `adj*` prefix · shared heartbeat). No new LISTEN consumer; no WDK.

### 2.8 Surface
/rules gains the **AdjustmentTemplatePanel** (list + propose + sign/retire; per-template
due/blocked state from `adjustment_run_due`). Drafts ride the /queue lane. Part:
`adjustment_run_receipt` (identifier-only card).

## 3. S2 — Staff advances (WD-R10, the B-lite register)

### 3.1 Enrolment
`clara.staff_advance_accounts` clones `fa_account_profiles` (version-forward; partial unique
(client, account_code) WHERE active; no-delete; RLS forced). Verbs
`enrol_staff_advance_account` / `retire_staff_advance_account` — admin+ (G6).
**Enrolment takes the 203005004 client rung BEFORE `_fa_lock_roles`** (leaf last) and
re-reads the approved balance under the rung (the concurrent-approval race closes).
Validation: active · asset-type · non-control · not the bank door · unreserved per
`_acct_role_reserved` — a RETIRED advance enrolment of the same code does NOT block
re-enrolment (active advances, FA roles, bank roles refuse) · **approved GL balance = 0**
(`enrolment_balance_nonzero` — enrol-clean-only; pre-existing balances defer to a future
attested-baseline mechanism, a named debt) · `p_confirm_dedicated` (G15). **Retire refuses
while any advance on the enrolment has outstanding > 0.** **The bank-side reservation belt
(`_fa_assert_code_unreserved`, CoR) reads the shared `_acct_role_reserved` union** — a bank
account can never bind to an actively enrolled advance code (the FA refusal text kept; an
advance-domain refusal added).

### 3.2 The register
`clara.staff_advances` (**append-only trigger**: no delete/truncate; set-once allowlist
{purpose, reference} writable only via `complete_staff_advance_particulars`, and
{voided_by_entry_id, void_effective_date} hook-only): id, firm, client, **enrolment_id**
(immutable FK), account_code, disbursement_line_id (unique, NOT NULL), entry_id, issue_date,
amount_cents (>0), purpose/reference, void columns (**void_effective_date = the reversal
mirror's posting_date**), created_at.

`clara.staff_advance_applications` (**pure append-only**: no update, no delete): id, firm,
client, advance_id, enrolment_id, application_line_id, entry_id, kind CHECK
(`payroll_deduction`,`bank_return`,`claim`,`correction`), amount_cents (>0), effective_date
(= the application entry's posting_date, hook-derived), reverses_application_id (nullable FK
→ a NON-correction row; multiple leaf corrections; cumulative ≤ the original), created_by,
reason, created_at. **`correction` rows are HOOK-BORN ONLY** (the reversal arm); the
proposal kinds are the other three; a manual correction is booked by reversing the wrong
application entry.

**The outstanding equation (published; every read/tie implements it verbatim):**
`outstanding(advance, as_of) = (amount_cents if issue_date ≤ as_of else 0)
− Σ application effects with effective_date ≤ as_of − (amount if void_effective_date ≤
as_of)` — originals persist at every as-of ≥ effective_date even if later reversed (the
unwind is the correction row, dated at the reversal act); nothing excluded-by-flag; no
stored outstanding.

### 3.3 Proposal, hook, belt (the G5 asymmetry)
`book_staff_advance_application(p_client, p_entry, p_allocations, p_kind, p_reason,
p_op_key)` (bookkeeper+; p_kind IN the three proposal kinds) drafts directly with
`flags.staff_advance_application = {kind, allocations, reason}` and takes the WCA-R7 branch
(auto-approve via the core, preheld, when below threshold). **Allocations are line-shaped**:
`[{line_no, advance_id, amount_cents}]`.

`clara._adv_on_approve` (spliced after `_adj_on_approve`), arms dependency-ordered:
**(1) reversal FIRST, return** — reversed application entry → one correction per ORIGINAL
application row at the **uncorrected remainder** (zero remainder → no row), dated at the
mirror's posting_date; reversed disbursement → stamp the void columns. **(2)** credit legs
→ mint applications from the proposal; authoritative guards re-derive HERE under the client
rung + sorted advance row locks (per-line coverage equality, per-advance cumulative cap,
no-predate). **(3)** debit legs (`NOT is_opening_balance AND reversal_of IS NULL`) →
soft-birth. `_wdb_reversal_blocked` also refuses: reversing a disbursement while its
advance has net applications ≠ 0, and reversing a correction-carrying entry
(`correction_entry_irreversible`; remedy: book an offsetting application).

`clara._tf_advance_movement_belt` (DEFERRED, watermark [enrolled_at, retired_at]): debit
legs must carry their register row; credit legs covered to the exact sen else
`advance_application_missing`; the reversal-mirror door completes the set. The
enrolment-side reservation is NON-deferred on its doors.

### 3.4 Reads, tie, policy, surface
`staff_advance_summary` · `staff_advance_statement` · `staff_advance_tie` — visibility-only,
explained columns; **the tie groups by ACCOUNT_CODE, walking EVERY enrolment generation that
ever held the code** (the FA G8 law), per the §3.2 equation vs the approved GL balance
as-of. `clara.ea1955_policy` (effective-dated, source_note citations) surfaces advisory
notes on the summary. Surface: **/advances** clones /aging; queue row_kind
`staff_advance_incomplete`; part `staff_advance`.

## 4. S3 — The AF-2 composite (WD-R13)

`clara.resolve_and_book_bank_line(...)` — owner floor.

**Composition law (rounds 1–3).** The op-key tree is a TABLE in the build spec — one row per
derived key: (fn, single spender, closing branch). Rules: (a) keys spent by a still-public
reserving verb are the CALLEE's — the composite never pre-reserves them; (b) keys spent
through `receipt_preheld:true` core calls are pre-reserved by the composite before its
first lock; (c) branch-unreachable keys close with the 0038 deferral-marker idiom; (d) the
settle path runs through factored preheld-aware cores — **`_settle_from_bank_line_core`
AND `_allocate_receipt_core`/`_allocate_payment_core`** (public wrappers
reserve-then-delegate; the 0040 S4.Z behavioral pins MOVE to the cores; the public arities
re-pin to delegation + defaults + ACLs) — and the settle core's own descendant keys
(`:approve`, `:adj:i(:approve)`, `:charge:approve`) stay the core's, closed by its existing
deferral markers. (e) The composite row-locks every PRE-EXISTING journal entry it will pass
to match BEFORE the rungs (0037 invariant (1)), then pre-acquires 203005003 (where a
counterparty is involved) → 203005004 → 203005006; inner acquisitions are re-entrant.

**Non-high-stakes (one transaction, resolve → book):** resolve the exception → optional
hand-draft with inline resolution mint (confidence 1.0) + the line-shaped advance payload →
approve via the core → allocate (via the cores) → one match group, live at commit — every
`line_excepted` wall sees status='resolved'; `match_bank_line` is untouched. The group is
stamped `resolution_exception_id` (immutable) at creation. Both dispositions re-enabled.

**High-stakes (G9): the settlement leg ONLY.** Refuse `p_draft` / `p_adjustments` /
`p_advance_applications` / **`p_charge_cents`+`p_charge_account`**
(`pending_branch_ancillary_unsupported`; remedy: flip first, then book ancillaries as their
own acts — the AP-path charge would otherwise ride `pending_ancillaries` past the boundary).
The composite parks the WCA-R7 pending group with `pending_resolution = {exception_id,
disposition, note, declared_by, declared_at}` — the two booking dispositions only
(`bank_corrective_line` refused), CHECK `pending_resolution IS NULL OR status='pending'`.

**The parked-declaration admission (recut across SIX arms — each admits ONLY the exact
parked case; ordinary groups and live→unmatched releases keep unconditional refusals):**
the settle core's `line_excepted` wall (the declaration in p_ctx) · the settled-authority
belt's line-member INSERT arm (the group row exists in-snapshot — deferred trigger,
re-query-by-id; the Codex-verified predicate with `resolved_at > v_cover_at` on the
resolved door) · `complete_pending_match`'s settled-period guard · BOTH member pending→live
cascade UPDATE arms · `unmatch_bank_match` + the line-member pending→unmatched cascade arm
(the parked-cancel escape is a §7 promise). Scope rationale: an OPEN exception inside a
COMPLETED reconciliation is lawful C-c state — exactly the class a parked resolution
serves — so the settled-period machinery must admit the park's flip AND its cancel. The
flip/exception arms need no widening (resolution + live commit together; the open-branch
arm is write-triggered on the exception row — stated, with a tail probe pinning its text
and the accidental-guard cell: a direct `resolve_bank_line_exception` on a parked line
refuses `disposition_unbooked`).

`complete_pending_match` (CoR) re-reads the exception FOR UPDATE
(`pending_resolution_stale`), resolves it (resolved_by = the DECLARANT), and its flip
UPDATE clears `pending_resolution` + stamps `resolution_exception_id` in one statement.
**Post-flip unmatch reopens**: releasing a LIVE group carrying `resolution_exception_id`
transitions exactly that exception resolved→open — after the `exception_reopen_blocked`
pre-check (a newer open exception on the line), and subject to the existing settled-period
law (a reconciled line's live release still requires the void/re-complete path first — the
parked-case admissions apply to PENDING groups only); the reopen erases the SIX-column
resolution set
(counterpart_line_id included — already null for booking dispositions) and mints
`bank.line_exception_reopened` + an audit row carrying the erased owner act. Supersedes
x40.z-A1 (test updated at build). The recon exceptions table badges **"resolution parked"**
via a read join.

**Attribution posture (adjudicated):** every D-b direct writer's client is structurally
bound by an FK anchor; per the ratified 0041/0037 precedent such writers carry no
`client_resolutions` row; AF-2's free-form hand-draft mints one inline. The ARCHITECTURE
§0.1 wording is flagged for a doc-alignment note at the close.

## 5. S4 — The `bank_rule_suggested` producer (WD-R13)

`clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` — bookkeeper+.
Row-locks the line; refuses while an un-dead suggested draft exists for it; validates rule
SIGNED + kind='coding' + client; re-derives the suggestion live; mints a DRAFT by direct
INSERT with `flags = {'bank_rule_suggested': {rule_id, line_id}}`. The approve-time arm
re-validates under the line lock (signed rule · line unmatched/un-excepted · statement live
· predicate re-match · legs equal derived) refusing `suggestion_stale`. The draft rides the
/queue lane; the 0040 S5 carve-out withholds sighting accrual. Chip: the dead coding
`<span>` → `<button>`.

## 6. S5 — The D-a residual fixes

1. **`dispose_fixed_asset` second-draft guard** (G10) + the /assets withdraw affordance;
   the eager `:approve` reservation untouched.
2. **64-edge writer guard — THREE minting paths** (G11): revise + the partial-disposal
   split + the K6 replacement path (0017:3439, CoR); CLR37, parity cells 64/65.
3. **`cost_cents` NOT NULL + BOTH 0017 validator sites, cost-only disjuncts** (G12);
   `useful_life_months` stays method-conditional (a global null-refusal would break
   `method='none'`).
4. **Split-month (G14)**: no arithmetic change; ONE helper `_fa_split_month_advisory(asset)`
   (qualifying edges = revision successors with effective_from past day 1;
   partial-disposal splits excluded) invoked from `_fa_asset_json` + the revise verb's
   response, naming the convention and the correcting-draft route. Derived, never stored.

## 7. Acceptance (contract §4 D-b item 5)

**Sandbox, labelled-synthetic, in full:** template propose→sign → end_date-alignment +
content-hash-dedup refusals → backdated-start catch-up (all draft) → ramp draft → ONE
approval births the pair (`auto_reversal_of` verified; CLR05 on the mirror; the
signer-approves-own-occurrence high-stakes cell) → next occurrence auto-posts + receipt →
two-occurrence ramp cell → pair correction low-stakes (one transaction) AND high-stakes
(pending receipt → single-half approve refused → `approve_pair_reversal` atomic →
`cancel_pair_reversal` drill; solo-occurrence `not_an_auto_pair`) → edit-re-ramps +
retire-with-draft refusal → high-stakes drop → FYE-guard (annual blocks; live MONTHLY does
NOT) → sign-time FYE revalidation → advance enrolment (enrol-clean-only refusal ·
enrol-vs-approval concurrency · re-enrol after retire · retire-with-outstanding refusal ·
bank-account-on-enrolled-code refusal) → disbursement soft-birth + purpose chase →
applications (partial · multi-advance split · the three proposal kinds · hook-born
corrections at the remainder · correction-of-correction refusal · over-application under
concurrency · bare-credit belt refuse) → disbursement-reversal void (dated) → tie at 0 at
two as-ofs + the retire/re-enrol HISTORICAL as-of drill → AF-2 non-high-stakes both
dispositions → AF-2 high-stakes: park (charge refused in the park) → parked-cancel drill
(declaration cleared, exception open, draft withdrawn) → flip executes (declarant-resolved;
cleared+stamped) → post-flip unmatch REOPENS (exact exception · newer-open refusal · the
reopen event) → parked-line direct-resolve refuses `disposition_unbooked` → producer accept
→ suggestion dedup + staleness refusals → S5 drills (second-disposal · 65th-edge ×3 ·
NULL-cost at both K-doors · the G14 advisory + ownership pair). **Real half:** ≥1
owner-named recurring template signed on a real client, ramp approved on a real month,
auto-reversal proven next period; staff advances close on the G8 named deferral. Supavisor
re-measured at the ceremony.

## 8. Test plan, tails, boundaries

**x42 contract-blind battery** authored from THIS doc + the contract, hunting the two D-a
classes (frozen-snapshot reads · row-shape dispatch). Named cells: everything in §7 plus
ramp-per-template isolation · mirror-never-earns · the MYT boundary day · pair-guard both
halves · mirror-births-no-register-row · act-dating · issue-date-gated as-ofs ·
pending_resolution exactly-one + stale · reopen identity · exactly-64 ×3 · G14 pair.
**Tails:** approve PATHS pinned at FOUR (unchanged — every D-b approval routes through
`_approve_entry_core`); the hook-CALLER census stays FOUR + the bounded-recursion assert ·
the `scheduled_run` census restated (writers = the two poster cores + `_pair_reverse_core`;
mentioners enumerated) · per-invocation positional splice asserts · `pending_resolution`
CHECK + `resolution_exception_id` immutability · S4.Z re-pinned on the COREs (public
arities pinned to delegation) · the SS9.5-mirror grep (three keys) · the no-wake census ·
the `_reserve_op` RAISES probe · tail 13(c) re-pinned (leaf takers = enrolment doors only)
· per-table immutability triggers asserted (§2.5/§3.2 sets) · the K-boundary vacuity probe
· the belt open-branch predicate pin. **The CoR register** (dual-grep, live-body sourced):
`reverse_entry` +`_wdb_reversal_blocked` (7th splice) · `revise_entry` (D-b flags) ·
`withdraw_draft` (pair-draft refusal) · `settle_from_bank_line` → core factoring + wall ·
`allocate_receipt`/`allocate_payment` → core factorings · `_subledger_on_approve` (the
six-marker prestate census + multi-line anchor) · `_tf_bank_settled_authority_belt`
(line-member INSERT arm + both pending→live cascade arms + the pending→unmatched arm) ·
`complete_pending_match` (stale-check + settled-guard admission + clear/stamp flip) ·
`unmatch_bank_match` + `_tf_bank_line_exception_transition` (the reopen arm, six-column
set) · `set_client_fy_end` · `_fa_assert_code_unreserved` (the shared union) ·
`_fa_asset_json` (the advisory) · 0017 K-validator ×2 (cost-only) · 0017 K6 depth guard ·
`dispose_fixed_asset` + `revise_fixed_asset_particulars` (writer guards). **Boundaries:**
no `open_items` widening, no employee counterparty, no close model, no CA computation, no
new LISTEN consumer, no new frozen workflow class; the posters touch neither
`journal_entries` immutability nor the settlement belts; AF-2's recuts ride WDB-G16.
Debts: segment-aware tie → E · staff master → F · account_class binary · MPERS FS wording
→ E · the attested-baseline mechanism · the ARCHITECTURE §0.1 alignment note.
