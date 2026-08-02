# Wave D-b — adjustments + staff advances (migration 0042): the design

> **Status: v7 — grilled 2026-08-02 (WDB-G1..G16), rounds 1–6 of the design ladder folded
> (fifteen lanes, ~155 findings; the record: `wave-d-b-design-part2.md` rounds 1–4,
> `wave-d-b-design-part3.md` rounds 5+; the ABI: `wave-d-b-design-abi.md`).** Contract:
> `wave-d-contract.md` §4 D-b (WD-R8/R9/R10/R13). Grounding: the 10-lane census +
> `research/wave-d/split-month-research-2026-08-02.md`. Precedent of record: the 0041
> authority/poster/belt family. `0042` is claimed at MERGE.

---

## 1. Rulings of record (owner, 2026-08-02)

| # | Ruling |
|---|---|
| **WDB-G1** | Auto-reversal is **hook-born at approve**, dated next-period day 1. |
| **WDB-G2** | **One act births the approved pair** (core-routed, §2.4). |
| **WDB-G3** | Cadence CHECK admits **monthly + annual**. |
| **WDB-G4** | **Catch-up occurrences ALL draft** (MYT boundary, §2.3). |
| **WDB-G5** | **The advance belt is asymmetric** (debits soft-birth; bare credits refuse). |
| **WDB-G6** | Advance **enrolment/retire floor is admin+**. |
| **WDB-G7** | **Free coding; enrolment is the truth**; related-party by attestation (G15). |
| **WDB-G8** | **No real staff-advance case — named deferral.** |
| **WDB-G9** | **AF-2 high-stakes: declared resolution rides the group; the bookkeeper+ flip executes it.** |
| **WDB-G10** | **Disposal second-draft: guard + UI; per-asset freeze ratified.** |
| **WDB-G11** | **64-edge cap closed writer-side** — three minting paths (§6.2). |
| **WDB-G12** | **`cost_cents` NOT NULL + the 0017 validator fix** (both sites, cost-only — §6.3). |
| **WDB-G13** | The seven positions stand: immutable templates · non-control lines · many-per-client · coding-kind producer at bookkeeper+ · EA 1955 visibility rows · confidence-1.0 inline resolution · the surface clones + no new consumer. |
| **WDB-G14** | **Split-month PINNED to the as-built law** + the reviewer advisory (§6.4). |
| **WDB-G15** | **Related-party is attestation, not structure.** |
| **WDB-G16** | **The AF-2 boundary interpretation ratified** (the two posters touch neither `journal_entries` immutability nor the belts; AF-2's recuts are WD-R13-authorized). |

## 2. S1 — Recurring/reversing adjustment templates (WD-R8/R9)

### 2.1 Schema + line eligibility
`clara.adjustment_templates` clones `fa_depreciation_authorities` (0041:614-686): id,
firm_id, client_id, status (`proposed`,`live`,`retired`), name, cadence
(`monthly`,`annual`), start_date (MUST be a cadence period-START — the first eligible
period begins at it), end_date (nullable; when set, MUST be a cadence period-END; both
validated at propose), auto_reverse boolean, lines jsonb (≥2,
balanced to the sen, positive cents — an occurrence ALWAYS carries a charge), memo_template,
actor+op-key columns, content_hash (= `_hash({name, cadence, start_date, end_date,
auto_reverse, lines, memo_template})`), created_at. Transition trigger + no-delete +
no-truncate. Partial unique (client_id, content_hash) WHERE status IN ('proposed','live').
**RLS: the six firm-scoped state tables get enable + FORCE + the owner/human policy pair
(0041:680-685); `ea1955_policy` is GLOBAL and uses the 0016 system-reference idiom
(migration-only writes, authenticated read — ABI §D)** — all seven asserted in the tail.

Line eligibility (validated at propose; re-derived at every occurrence AND at approve —
**the SOLE soft-birth immunity of the auto-mirror**, §2.6): account exists · `is_active` ·
`account_class IS NULL` · not the client's bank code · unreserved per
`clara._acct_role_reserved(client, code)` — a LOCK-FREE stable reader returning (domain,
role) over FA active profiles ∪ FA register rows ∪ ACTIVE advance enrolments ∪ their
register rows. **The leaf census** (`client:fa-roles` via `_fa_lock_roles`): takers = every
door that WRITES role-claiming state — the live bank belt (`_fa_assert_code_unreserved`
keeps its acquisition) + FA/advance enrolment/retire + adjustment propose/retire; posting
and approve paths are never takers (leaf-LAST; tail 13(c) re-pinned at this membership).

### 2.2 Verbs + lifecycle guards
`propose_adjustment_template` (bookkeeper+) · `sign_adjustment_template` (admin+;
revalidates cadence + **start_date** + end_date against the CURRENT FYE under the
203005004 rung — `template_fy_stale`; the propose→FYE-change→sign window closes) ·
`retire_adjustment_template` (admin+, reason; refuses while an occurrence draft is
outstanding). Signing stamps signed_by (the `last_human_editor` identity).
**`set_client_fy_end` (CoR)**: takes 203005004, then refuses while a live ANNUAL-cadence
template OR ANNUAL-cadence depreciation authority exists (monthly ones are FY-independent
and do NOT block — the sandbox's live monthly authority is the cell).

### 2.3 The poster
`clara._adj_run_occurrence_core` (§9 signatures) mirrors `_fa_run_period_core`:
`_reserve_op` + the EAGER derived reservations — `:approve` AND `:mirror:approve`
**unconditionally** (both before any lock; the non-auto_reverse branch closes the mirror
key with a deferral marker; a committed reservation is lawfully spent preheld by a LATER
approving transaction in draft mode) → 203005004 → template live → period cadence-aligned +
ENDED (MYT) → **the admission law** (tokens are §9-table rows): the period must lie in
[start_date, coalesce(end_date,'infinity')] (`period_out_of_window`) · unmet(template,
period) ⇔ NO approved un-reversed role='occurrence' entry exists for the pair
(`period_already_met`) · not blocked(template) ⇔ no outstanding occurrence draft, via
`_adj_occurrence_outstanding(client, template)` — the 0041:1301 shape and `blocked[]`'s
only v1 reason (`occurrence_draft_outstanding`). **The two hot-loop partial indexes back
these predicates + the ramp (ABI §C — the D-a F10 measured law); §8-pinned.** **The
canonical period triple**
{period_start, period_end, period_label} rides hashes, events, receipts and memos; labels:
monthly `to_char(period_end,'Mon YYYY')`, annual `'FY'||to_char(period_end,'YYYY')`.
Direct INSERT (SS9.5): status='draft',
origin='scheduled_run', posting_date = period_end, maker_actor = actor, last_human_editor =
template.signed_by, **`is_opening_balance = is_year_end = tax_affecting = FALSE, always`**
(templates are ordinary periodic adjustments; year-end/tax-affecting adjustments are
hand-draft territory — a stated v1 boundary, so template-lane CLR05 is amount-driven only),
`flags.recurring_adjustment = {template_id, op_key, role:'occurrence', auto_reverse,
reversal_date, period_start, period_end, mode}` (**`mode` is stamped by the poster**),
lines from the template. Exact-balance assert. **Mode**: `post` iff ramp-earned AND NOT
high-stakes AND NOT catch-up (forced-draft ⇔ `period_end < (signed_at AT TIME ZONE
'Asia/Kuala_Lumpur')::date`; the boundary day follows the ramp law). **Ramp** (per-template,
derived — the UNIFIED clock, both correction lanes): EXISTS ≥1 OTHER approved un-reversed
occurrence entry whose `approved_at > coalesce(GREATEST((select max(r.completed_at) from
clara.adjustment_pair_reversals r where r.template_id = t and r.status='completed'),
(select max(m.approved_at) from journal_entries m join journal_entries o on m.reversal_of
= o.id where o carries this template's role='occurrence' flag)), '-infinity')` — a
completed PAIR correction AND a plain `reverse_entry` on a SOLO occurrence both reset the
clock (D-a's "a reversal un-earns until a fresh reviewed run passes", at template grain);
the corrected period's re-run DRAFTS; #1 always drafts.
Auto-post spends `:approve` via `_approve_entry_core(receipt_preheld)`. **Due oracle**
`adjustment_run_due(p_client)`: oldest unmet (template, period) among non-blocked live
templates + `blocked[]` (rendered on /rules). Machine verb `run_adjustment_occurrence`
(clara_runtime-only); human twin `run_adjustment_manual` (bookkeeper+); both §9.

### 2.4 Auto-reversal — the pair
On approval of an auto_reverse occurrence, `_adj_on_approve` births the mirror: INSERT
draft (origin='scheduled_run', posting_date = period_end + 1 day,
`flags.recurring_adjustment = {..., role:'reversal'}`, maker_actor = last_human_editor =
template.signed_by, **`is_opening_balance`/`is_year_end`/`tax_affecting` copied verbatim
from the occurrence** — `is_high_stakes` provably equal) → swapped lines →
`_assert_balanced` → approval via `_approve_entry_core(actor = the occurrence's approving
actor, receipt_preheld, attestation = the occurrence row's just-stamped
`self_approval_attestation` re-read after the outer UPDATE, key = the poster-reserved
`:mirror:approve`)`. Any mirror-side refusal aborts the WHOLE approving statement — no
committed half-pair exists, by construction (stated as the intended semantics). The approve
PATHS stay the pinned FOUR; the hook-CALLER census stays FOUR; recursion bounds at depth 2.
**Event order** (stated + asserted): the mirror's events precede the occurrence's; the
receipt is minted after both.

**Linkage**: the mirror carries `auto_reversal_of` (FK → occurrence, UNIQUE); no
occurrence-side column; `reversal_of`/`reversed_by` unused on the pair (ramp starvation +
the correction dead-end, ladder-verified).

**Pair correction**: `_wdb_reversal_blocked` (reverse_entry's 7th splice) + the hook
defense arm refuse reversing/approving EITHER half individually. A solo (non-auto-reverse)
occurrence has NO pair — plain `reverse_entry` is its path; `reverse_adjustment_pair`
refuses it (`not_an_auto_pair`). The sanctioned machine:
- `clara.adjustment_pair_reversals` — id, firm, client, **template_id (NOT NULL, FK —
  stamped at INSERT; the ramp clock's filter)**, occurrence_id, mirror_id,
  **occurrence_correction_id, mirror_correction_id**, maker, status, **completed_at
  (stamped on the approving→completed edge — the ramp clock's timestamp; created_at is the
  PENDING moment and never the clock)**, op_key, created_at; ONE active pair per
  occurrence; **the receipt is INSERTed `pending` with both correction ids AFTER
  `_pair_reverse_core` births the drafts, then transitioned**. **The lawful edge set
  (0041:650-663 idiom, everything else raises): `pending→approving`,
  `approving→completed`, `pending→cancelled`**; the MUTABLE set (the idiom's subtracted
  array) = {status, completed_at} — every other column immutable after INSERT; no-delete +
  no-truncate; the DEFERRED no-commit-`approving` trigger
  **re-queries by id** (the 0038:3255 idiom — it raises only when the FINAL committed state
  is `approving`; a NEW-tuple test would refuse every lawful run; tail probe asserts the
  re-query). **The receipt IS the authorization channel**: the hook's defense arm refuses a
  pair draft unless its receipt is `approving`; `revise_entry` (CoR) refuses any draft
  named by a pending/approving pair receipt; **`withdraw_draft` (CoR) refuses a pair draft
  (`pair_draft_locked`; remedy names `cancel_pair_reversal`)**.
- `reverse_adjustment_pair(p_client, p_occurrence, p_reason, p_op_key)` (bookkeeper+) →
  `_pair_reverse_core` births both correction mirrors (the 13-column recipe,
  `origin='reversal'`, maker_actor = last_human_editor = the CALLER, MYT dates; guards:
  the double-reverse walls inline + the three helper walls defense-in-depth + the
  K-boundary by vacuity (tail probe); rung AFTER both JE row locks;
  `_wdb_reversal_blocked` not invoked). Low-stakes: receipt → `approving` → both
  corrections approved via the core (preheld, the pair half keys) → both halves'
  `reversed_by` stamped → receipt `completed` (stamping `completed_at`), one transaction
  (the completed receipt resets the template's ramp clock — every occurrence approved
  before it stops counting, so the corrected period's re-run DRAFTS).
- High-stakes: both corrections stay DRAFTS on the `pending` receipt.
  `approve_pair_reversal(p_client, p_pair, p_op_key, p_attestation text default null)` —
  one distinct checker: locks the receipt + both drafts, **re-derives both corrections
  byte-exactly** against their halves, flips the receipt to `approving`, approves both via
  the core (CLR05 on each; the solo-attestation branch), stamps both `reversed_by`,
  completes the receipt (stamping `completed_at` — the clock).
  `cancel_pair_reversal(p_client, p_pair, p_reason, p_op_key)` (bookkeeper+, non-blank
  reason; a CANCELLED receipt never resets the clock): locks receipt → drafts → rung,
  writes the withdrawal
  column set INLINE as fn-owner (the 0038:5207 idiom — it never calls `withdraw_draft`),
  emits `entry.withdrawn` ×2, receipt → `cancelled`.

### 2.5 Receipts + events
`clara.adjustment_runs` (fully immutable + no-delete/no-truncate), minted after the mirror
in arm (2): id, firm, client, template_id, period_start/period_end (dates), **mode (read
from the flags stamp)**, entry_id (unique), reversal_entry_id, amount_cents, op_key,
created_at. **The event contract**: 0042 registers `adjustment.posted` (emitted in arm (2)
after the receipt, one per occurrence, typed-primitive allowlist payload — ABI §G: {template_id,
run_id, period_start, period_end, amount_cents, reversal_entry_id}) AND `bank.line_exception_reopened` (the §4 reopen;
payload {exception_id, line_id, match_id} — ABI §G) in `clara.event_types` **AND `clara.trigger_taxonomy` at `taxonomy_active`
(decision 'ignore' — the 0041:978-996 CTE)**, with the 0040-probe-6-style prestate/
postcheck extended to taxonomy coverage; emission sites + counts pinned in the tail. Ruled:
staff-advance register mutations ride the generic `entry.*` events (the register rows are
hook-derived from entries, which carry the events — no named register events in v1).

### 2.6 The approve-hook bindings
`_adj_on_approve` splices after `perform clara._fa_on_approve(p_entry);`, above the
settlement early-return (per-invocation positional assert). Arms: **(0)** role='reversal'
→ return — it exists ONLY to keep arm (2) off the mirror; soft-birth immunity is carried by
§2.1 eligibility ALONE (`_fa_on_approve` has already run; `_adv_on_approve` runs later
regardless), so an eligibility violation RAISES, never skips. **(1)** `reversal_of IS NOT
NULL` → the pair defense (refuse approving a pair-correction draft unless its receipt is
`approving`), else return. **(2)** role='occurrence' → re-validate on SEVEN axes before
minting — origin · issuer op-receipt (hash from client+template+period) · template live ·
line-set byte-equal · cadence+ended · **mode (refuse a `mode='post'` stamp when the
forced-draft predicate or `is_high_stakes` NOW holds; the ramp is never re-derived at
approve)** · **line_eligibility** — refusing `adjustment_stale` with the named axis; then
the mirror (§2.4) + the receipt + event (§2.5). **(3)** `flags ? 'bank_rule_suggested'` →
the S4 approve-time re-validation (§5) — hosted here so no new splice exists.
**`revise_entry` (CoR)** refuses any draft carrying a D-b proposal flag (the three keys:
`recurring_adjustment`, `staff_advance_application`, `bank_rule_suggested`) OR named by a
pending/approving pair receipt.

### 2.7 Runtime · 2.8 Surface
Leader 5th due-check `adjustmentRunDue` + `reconciler-adjustments.mjs` (feature-detect,
per-client isolation, cap 24, `adj*` prefix, shared heartbeat); no new consumer; no WDK.
/rules gains the AdjustmentTemplatePanel (propose/sign/retire + due/blocked per template);
drafts ride /queue; part `adjustment_run_receipt`.

## 3. S2 — Staff advances (WD-R10, the B-lite register)

### 3.1 Enrolment
`clara.staff_advance_accounts` (fa_account_profiles clone: version-forward, partial unique
active, no-delete/no-truncate, RLS forced). `enrol_staff_advance_account` /
`retire_staff_advance_account` — admin+; **enrolment takes 203005004 BEFORE the leaf** and
re-reads the approved balance under the rung. Validation: active · asset · non-control ·
not the bank door · unreserved per `_acct_role_reserved` (a RETIRED same-code advance
enrolment does NOT block re-enrolment) · **approved GL balance = 0** (enrol-clean-only;
pre-existing balances defer to the attested-baseline debt) · `p_confirm_dedicated` +
**`p_attestation text` (non-blank, stored verbatim as `enrolment_attestation` — the G15
evidence)**. Retire refuses while any advance has outstanding > 0. The bank belt
(`_fa_assert_code_unreserved`, CoR) reads the shared union — a bank account can never bind
an actively enrolled advance code.

### 3.2 The register
`clara.staff_advances` (append-only trigger + no-delete/no-truncate; set-once allowlists:
{purpose, reference} via `complete_staff_advance_particulars`; {voided_by_entry_id,
void_effective_date} hook-only): id, firm, client, **enrolment_id** (immutable FK),
account_code, disbursement_line_id (unique, NOT NULL), entry_id, issue_date, amount_cents
(>0), purpose/reference (via `complete_staff_advance_particulars(p_client, p_advance,
p_purpose, p_reference, p_op_key)` — bookkeeper+, set-once, refuses already-set), void
columns (void_effective_date = the reversal mirror's posting_date), created_at. `clara.staff_advance_applications` (pure append-only +
no-delete/no-truncate): id, firm, client, advance_id, enrolment_id, application_line_id,
entry_id, kind (`payroll_deduction`,`bank_return`,`claim`,`correction`), amount_cents (>0),
effective_date (= the entry's posting_date, hook-derived), reverses_application_id
(nullable FK → a NON-correction row; multiple leaf corrections; cumulative ≤ original),
created_by, reason, created_at. **Corrections are HOOK-BORN ONLY.**

**The outstanding equation:** `outstanding(advance, as_of) = (amount_cents if issue_date ≤
as_of else 0) − Σ application effects with effective_date ≤ as_of − (amount if
void_effective_date ≤ as_of)` — originals persist at every later as-of even if reversed
(the unwind is the correction row, dated at the reversal act); nothing excluded-by-flag;
no stored outstanding.

### 3.3 Proposal, hook, belt
`book_staff_advance_application` (§9; bookkeeper+; the three proposal kinds) drafts
directly with **`flags.staff_advance_application = {kind, reason, allocations:
[{line_no, advance_id, amount_cents}]}`** (the named third key); WCA-R7 branch.
`clara._adv_on_approve` (after `_adj_on_approve`):
**(1) reversal FIRST, return** — reversed application entry → one correction per ORIGINAL
row at the **uncorrected remainder** (zero → no row), dated at the mirror's posting_date;
reversed disbursement → the void stamp. **(2)** credit legs → mint from the proposal; the
authoritative guards re-derive HERE under the held client rung + sorted advance row locks
(coverage equality · **the TEMPORAL cap: the application must fit outstanding at ITS OWN
effective_date AND hold the cap at every date boundary ≥ it — a backdated application can
never drive any historical outstanding negative** · no-predate). **(3)** debit legs (`NOT
is_opening_balance AND reversal_of IS NULL`) → soft-birth. `_wdb_reversal_blocked` also
refuses: reversing a disbursement with net applications ≠ 0, and reversing a
correction-carrying entry (`correction_entry_irreversible`). The DEFERRED movement belt
(watermark [enrolled_at, retired_at]): debits carry their row; credits covered to the sen
else `advance_application_missing`; the reversal-mirror door. The enrolment-side
reservation is NON-deferred.

### 3.4 Reads, tie, policy, surface
`staff_advance_summary` · `staff_advance_statement` · `staff_advance_tie` — visibility-
only, explained columns; the tie groups by ACCOUNT_CODE walking EVERY enrolment generation,
and **its GL side is scoped to the union of the code's enrolment windows [enrolled_at,
retired_at]** (matching the belt watermark; out-of-window movements ride an explained
column — a repurposed retired code cannot permanently break the surface).
`clara.ea1955_policy` (§9 DDL + seed; the seventh RLS'd table) surfaces advisory notes.
/advances clones /aging; row_kind `staff_advance_incomplete`; part `staff_advance`.

## 4. S3 — The AF-2 composite (WD-R13)

`clara.resolve_and_book_bank_line(...)` — owner floor.

**The op-key matrix is SINGLE-OWNED by ABI §E** (one row per physical key with its literal
pre-lock-knowable hash fields, reserver, sole spender and closer — the round-7 law; two
same-purpose tables was the duplication hazard round 6 adjudicated against).
Rules: keys spent by a still-public reserving verb are never pre-reserved by the caller;
`receipt_preheld` keys are reserved before the reserver's first lock; the `_reserve_op`
RAISES-on-mismatch probe rides §8. **Cores**: `_settle_from_bank_line_core` +
`_allocate_receipt_core`/`_allocate_payment_core` (public wrappers reserve-then-delegate;
S4.Z pins move to the cores). The composite row-locks every PRE-EXISTING entry it will
match BEFORE the rungs (0037 invariant (1)), then 203005003 → 203005004 → 203005006.

**Non-high-stakes (resolve → book, one transaction):** resolve → optional hand-draft
(inline resolution mint, confidence 1.0; the advance payload as its flags proposal) →
approve via the core → allocate via the cores → one match group live at commit
(`match_bank_line` untouched — the walls see status='resolved'). **The group is stamped
`resolution_exception_id` in the CREATING TRANSACTION on every path — the group is created
by the callee verb/core and the COMPOSITE UPDATEs it before commit; a NEW narrow
`bank_matches` BEFORE-UPDATE trigger enforces the column immutable-once-non-null (raise
only when old IS NOT NULL AND new IS DISTINCT FROM old) —
additive, the table has no update guard today. 0038's four-name `bank_matches` INSERT
census is re-pinned at its new membership (`_settle_from_bank_line_core` replaces
`settle_from_bank_line`).**

**High-stakes (G9): the settlement leg ONLY** — refuse `p_draft`/`p_adjustments`/
`p_advance_applications`/`p_charge_cents`+`p_charge_account`
(`pending_branch_ancillary_unsupported`). The park: the WCA-R7 pending group +
`pending_resolution = {exception_id, disposition, note, declared_by, declared_at}` (the
two booking dispositions only; CHECK `pending_resolution IS NULL OR status='pending'`) +
`resolution_exception_id` stamped beside it.

**The parked-declaration admission — SEVEN sites, each with its evidence channel:**
1. the settle core's `line_excepted` wall — p_ctx declaration;
2. the belt's line-member INSERT arm — the in-snapshot group row (deferred, re-query-by-id;
   the resolved door keeps `resolved_at > v_cover_at`);
3. `complete_pending_match`'s settled guard — the FOR-UPDATE group row pre-flip;
4. + 5. BOTH member pending→live cascade belt arms — `resolution_exception_id` + the named
   exception resolved-with-booking at commit;
6. `unmatch_bank_match`'s verb-side settled guard — the FOR-UPDATE group row pre-flip;
7. the line-member pending→unmatched cascade belt arm — `resolution_exception_id` (which
   the cancel LEAVES INTACT — tail probe) + the named exception still OPEN on the member
   line.
Ordinary groups and live→unmatched releases keep unconditional refusals. The
flip/exception belt arms need no widening (resolution + live commit together; the
open-branch arm is write-triggered — tail probe pins its text; the accidental-guard cell:
a direct resolve on a parked line refuses `disposition_unbooked`).

`complete_pending_match` (CoR): re-reads the exception FOR UPDATE
(`pending_resolution_stale`), resolves it (resolved_by = the DECLARANT), clears
`pending_resolution` in the flip UPDATE. **Post-flip unmatch reopens**: a LIVE release
carrying `resolution_exception_id` transitions exactly that exception resolved→open —
after the `exception_reopen_blocked` pre-check, subject to the existing settled-period law
(live releases of reconciled lines still take the void path; the parked admissions apply
to PENDING groups) — flipping `status` and NULLing the FIVE resolution columns (the
trigger's comparison set is those five + status), minting `bank.line_exception_reopened` +
the audit row carrying the erased owner act. Supersedes x40.z-A1. The exceptions table
badges "resolution parked". **Attribution posture**: FK-anchored writers carry no
resolution row (the 0041/0037 precedent); the hand-draft mints inline; the ARCHITECTURE
§0.1 alignment note rides the close.

## 5. S4 — The `bank_rule_suggested` producer (WD-R13)

`clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` — bookkeeper+:
line row-lock · **the dedup law: at most ONE `bank_rule_suggested` entry per line across
`status IN ('draft','approved') AND reversed_by IS NULL` — a partial unique expression
index over the flags line_id plus the friendly row-locked precheck** (an approved-but-
unmatched suggestion blocks a second accept) · rule SIGNED + kind='coding' + client · live
re-derivation · direct-INSERT draft with `flags = {'bank_rule_suggested': {rule_id,
line_id}}`. The approve-time re-validation is **`_adj_on_approve` arm (3)** (§2.6): signed
rule · line unmatched/un-excepted · statement live · predicate re-match · legs equal
derived → `suggestion_stale`. 0040's S5 sighting carve-out withholds sighting accrual; the
chip upgrades; the SS9.5-mirror tail guard covers the key.

## 6. S5 — The D-a residual fixes

1. `dispose_fixed_asset` second-draft guard + the /assets withdraw affordance (G10).
2. 64-edge writer guard on THREE minting paths (revise · partial-split · the K6 replacement
   0017:3439, CoR); CLR37; 64/65 parity cells (G11).
3. `cost_cents` NOT NULL — **with a prestate probe** (count NULL rows, named remedy before
   the ALTER; the now-dead `ck_fa_residual` cost-null disjunct is left deliberately, noted)
   + BOTH 0017 validator sites — **the CLR10 composer site (0017:3345 area) AND the CLR31
   seed/activation site (0017:3426 area), anchors measured against the LIVE bodies (0041
   already spliced their CLR31 arms)** — gain cost-only `IS NULL` disjuncts (G12).
4. Split-month (G14): no arithmetic change; `_fa_split_month_advisory(asset)` (revision
   successors with effective_from past day 1; disposal splits excluded) via `_fa_asset_json`
   + the revise response. Derived, never stored.

## 7. Acceptance (contract §4 D-b item 5)

**Sandbox, in full:** propose→sign → end_date + content-hash refusals → catch-up (all
draft) → ramp draft → ONE approval births the pair (`auto_reversal_of` · CLR05 symmetry ·
the signer-approves-own high-stakes cell · the annual headers-FALSE cell (occurrence and
mirror both born `is_year_end = false`; high-stakes amount-driven only) · event
order) → auto-post + receipt → two-occurrence ramp cell → **the ramp-reset cells (PAIR:
3-occurrence template → pair-correct one → the next sweep DRAFTS, never posts; SOLO:
3-occurrence non-auto-reverse template → `reverse_entry` one → the next sweep DRAFTS)** →
pair correction
low-stakes AND high-stakes (single-half approve refused unless `approving` ·
`approve_pair_reversal` atomic · `cancel_pair_reversal` · `revise_entry`-on-pair-draft AND
`withdraw_draft`-on-pair-draft refused · solo `not_an_auto_pair`) → per-axis `adjustment_stale` refusals (all SEVEN incl.
line_eligibility: enrol/reserve a template account during the draft window) → retire-with-
draft refusal → FYE guard (annual blocks; monthly does NOT) → sign-time revalidation →
enrolment (clean-only · concurrency · re-enrol · retire-with-outstanding ·
bank-on-enrolled-code) → soft-birth + chase → applications (partial · multi-advance · three
kinds · hook-born corrections at the remainder · correction-of-correction refusal · the
cumulative-cap cell · **the backdated-after-application and backdated-before-later-
correction temporal-cap cells** · over-application concurrency · bare-credit refuse · the
watermark boundary pair · the particulars set-once cell) → the two advance-reversal refusals → disbursement void → tie at 0 ×2 + the
retire/re-enrol historical as-of drill → AF-2 non-HS both dispositions →
`disposition_unsupported` on BOTH branches (`bank_corrective_line` at argument time) →
AF-2 park (charge refused) → parked-cancel drill (declaration
cleared · id intact · exception open · draft withdrawn) → flip (declarant-resolved) →
post-flip unmatch REOPENS (exact id · newer-open refusal · the event) → parked-line direct
resolve refuses → producer accept → suggestion dedup (sequential AND concurrent
approved-but-unmatched duplicates) + per-axis staleness → `revise_entry`
per-flag-key refusals → S5 drills (second-disposal · 65th ×3 · NULL-cost both doors · G14
advisory + pair). **Real half:** ≥1 owner-named template signed on a real client, ramp
approved on a real month, auto-reversal proven next period; advances close on the G8
deferral. Supavisor re-measured.

## 8. Test plan, tails, boundaries

**x42** authored from THIS doc + the contract (the two D-a classes hunted by name). Cells:
§7's list + ramp isolation · mirror-never-earns · MYT boundary · pair-guard halves ·
mirror-births-no-register-row · act-dating · issue-date gates · exactly-one + stale
pending_resolution · reopen identity · event ordering. **Tails:** approve PATHS = FOUR ·
hook-CALLER census = FOUR + bounded recursion · `scheduled_run` census: **writers =
`_fa_run_period_core` + `_adj_run_occurrence_core` + `_adj_on_approve`** (the mirror);
`_pair_reverse_core` writes `origin='reversal'` (asserted); mentioners enumerated ·
positional splice asserts · the `pending_resolution` CHECK + `resolution_exception_id`
immutability + cancel-leaves-id probe · S4.Z re-pinned on the cores · the SS9.5 grep · the
no-wake census · the `_reserve_op` RAISES probe · leaf census (§2.1 membership) ·
per-table triggers AND forced RLS asserted for ALL SEVEN new tables · **the `bank_matches`
INSERT census re-pinned at its new four-name membership + the `resolution_exception_id`
set-once trigger asserted** · the K-boundary vacuity probe · the belt open-branch predicate
pin · the event-type + taxonomy-coverage registration probe (emission sites + counts) · the
receipt-flip-precedes-core-calls assert + the deferred-trigger re-query probe · the
`cost_cents` prestate probe · the ramp-reset predicate probe (the pair-receipt clock). **The CoR
register**: `reverse_entry` +`_wdb_reversal_blocked` · `revise_entry` (flags + pair
membership) · `withdraw_draft` (pair refusal) · `settle_from_bank_line` +
`allocate_receipt`/`allocate_payment` → core factorings · `_subledger_on_approve`
(six-marker census + anchor) · `_tf_bank_settled_authority_belt` (the three widened arms)
· `complete_pending_match` · `unmatch_bank_match` + `_tf_bank_line_exception_transition`
(the reopen arm) · `set_client_fy_end` · `_fa_assert_code_unreserved` (shared union, leaf
kept) · `_fa_asset_json` · 0017 K-validator ×2 · 0017 K6 depth guard · `dispose_fixed_
asset` + `revise_fixed_asset_particulars` (writer guards). **Boundaries:** no `open_items`
widening · no employee counterparty · no close model · no CA computation · no new LISTEN
consumer · no new frozen workflow class · the posters touch neither `journal_entries`
immutability nor the belts (G16 literal). Debts: segment tie → E · staff master → F ·
account_class binary · MPERS wording → E · the attested-baseline mechanism · the
ARCHITECTURE §0.1 alignment note.

## 9. The builder ABI appendix

The full ABI — every public signature and return envelope, the flags/JSON schemas, the
single-owner op-key matrix with literal hashes, the refusal-token table, all seven
new-table DDL blocks, the event payloads, and the hot-loop indexes — lives in
**`wave-d-b-design-abi.md`** (split at the 500-line ceiling; it is part of THIS design of
record and rides the same ladder).
