# Wave D — assets + adjustments: the slice contract

> **Status: RATIFIED, 2026-08-01.** The owner ruled every fork in §2 during the Wave-D grilling
> session (same day as the Wave C close, ADR-054). §3 (ground truth) is the 8-lane census +
> orchestrator live probes. §4 (the slicing) follows from §2 and is the build order of record.
> **Execution: D-a design next.** Minutes: ADR-055.
>
> **Authority:** the owner's rulings in §2 govern. On any conflict between this document and an
> earlier plan artifact, this document governs for Wave D only; `docs/prd/PRD.md` §6 (LAW) governs
> over this document always. Wave C's records (WC-R1..R12, WCA/WCB/WCC, AF-1..AF-5) are never
> re-grilled; where this contract touches them it cites, it does not reopen.
>
> **Evidence grading:** **[V]** = verified by the orchestrator this session (live probe or read) ·
> **[L]** = reported by a census lane against cited file:line, not independently re-read ·
> **[R]** = recalled/secondary.

---

## 1. What Wave D is, and what it inherits

Wave D wires the workflows onto a register that has waited two phases: **FA register from coding
(intrinsic), depreciation runs (scheduled + close-gated), disposal, recurring/reversing
adjustments** (`REBUILD-PLAN.md`, the **"Wave D — assets + adjustments"** row; the old `:193`
line pointer had drifted and was repaired to a named anchor 2026-08-06 — the ruling text is
untouched) **[V]** — plus the one §7-B behaviour assigned here:
**staff advances** (`PRD.md:97-106`, ADR-054) **[V]**.

The inheritance is unusually concrete:
- `clara.fixed_assets` has existed since Phase-3 Slice 2 **as schema only** ("Wave B/D wire the
  workflows", `0003:153`) **[L]**; it holds **zero rows live** and has **zero read RPCs** **[V]**.
  The only writers are the Wave-B opening carry-down (K-family). The carry-down itself refuses
  non-straight-line with the literal message *"non-straight-line depreciation is deferred to
  Wave D"* (CLR31, `0017:3330-3333`, `3407-3411`) **[L]** — the wave was named in code a month ago.
- ARCHITECTURE §3.5 extends the intrinsic-subledger law to FA by name: *"Same for … FA
  acquisitions→register rows"* (`ARCHITECTURE.md:87`) **[L]** — acquisition is one audited
  transaction (GL + register + event) or it is an F3 breach (`PRD.md:119`).
- The salvage manifest PORT-rates the frozen build's `record_fixed_asset` / `run_depreciation` /
  `dispose_fixed_asset` ("exemplary DB-owned math — the reference implementation to keep") and the
  `fa_depreciation` ledger table; it REBUILD-rates `fa_control_tie_out` (all-time-sum double-count,
  the F12-1/F3-7 class — the segment-aware rebuild waits on Wave E's primitive)
  (`02-salvage-manifest.md:62-63,99,123`) **[L]**. The frozen build's own F3 verdict: depreciation
  was computed correctly and **no workflow ever ran it** — Wave D's bar is that it actually runs.

---

## 2. Owner rulings (ratified 2026-08-01)

| # | Ruling | Rationale of record |
|---|---|---|
| **WD-R1** | **Acquisition soft-births the register row at approve.** The FA materialisation is intrinsic (same transaction as the GL post, all four approve paths). Missing particulars (useful life, residual, start date) never block approval: the row births in a visible pending-particulars state; depreciation runs SKIP it; the queue and the close-readiness view chase it until a human completes it. | Books never blocked on data entry; the register row is structurally guaranteed (ARCH §3.5) and honestly incomplete — the visibility-first posture (Gate-1 C3) applied at birth. Hard-refuse would make an approver hunt useful-life decisions to pass a bill they know is real; draft-time refusal would break agent drafting entirely (the drafter can propose an account, never a useful life). |
| **WD-R2** | **No DB capitalisation threshold.** The account choice (200-* vs expense) IS the capitalisation decision — professional judgment at coding time, guided by client knowledge, never enforced or flagged by the database. | Legitimate small assets exist; a threshold wall fights the professional. Small-value-asset TAX treatment is Wave F's CA territory. Zero schema. |
| **WD-R3** | **Methods: `straight_line` + `reducing_balance` + `none`.** The CHECK widens; `none` is for land/non-depreciables (200-L01 deliberately has no accum-dep pair, MPERS 17.16). | Owner confirms real-client reducing-balance evidence exists — so it is buildable AND fireable; a real RB asset must fire in acceptance (WD-R14). The CLR31 refusal sites in the carry-down core widen in the same migration. |
| **WD-R4** | **Cadence: per-client policy, monthly \| annual, default monthly.** | Management-account clients need a monthly-honest TB (Clara's ongoing-close posture); compliance-only clients keep the traditional single annual charge by flipping the policy. Both paths exercised. |
| **WD-R5** | **Depreciation authority: admin+-signed per-client authority; FIRST run lands as drafts (one-time ramp); subsequent runs auto-post with receipts; high-stakes charges always draft for a distinct checker (WCA-R7).** | The strongest autopost case in the product: deterministic DB arithmetic from human-approved particulars under a human signature — authority derives from verified in-system approvals (ADR-049 doctrine). The ramp proves the first computed schedule on real books before autonomy. |
| **WD-R6** | **"Close-gated" is a NAMED deferral to Wave E.** D ships schedule-only runs + the advisory visibility ("depreciation not run through month M" as a close-readiness flag). No period lock, no half close model. | The WC-R3 precedent: no close model exists (`_correction_period_state` is a permanent stub; its three guards are dead code); half-building one here is the GAP2-1/GAP5-3 pattern. When E builds periods, the gate clips onto receipts D already mints. |
| **WD-R7** | **Disposal: full AND partial.** Partial is stated as a COST PORTION (never percentage); the DB pro-rates accumulated depreciation on the cost fraction with an exact-to-the-sen rounding law (the continuing remainder absorbs the rounding difference so register totals always tie). Mechanism: the supersede-lineage split (the K6 idiom — original → superseded; disposed portion + continuing portion born as successors). Gain/loss = proceeds − NBV to the existing 530-G01/900-DSP. | Owner widened my full-only recommendation: partial disposals are in his practice's reality. Cost-portion statement reads naturally against an FA schedule and keeps the sen math explicit. If no real partial case exists by acceptance, it fires labelled-synthetic in the sandbox (the ADR-048 sanction). |
| **WD-R8** | **Recurring/reversing adjustments: admin+-signed templates (amounts, accounts, cadence, start/end) via a propose→sign→retire family; FIRST occurrence drafts (ramp); subsequent occurrences auto-post with receipts; an accrual's auto-reversal next period is deterministic and rides the same signed authority; editing a template re-ramps; high-stakes to a distinct checker.** | One authority doctrine across both Wave D posters (mirrors WD-R5). The first firing of a human-typed template is exactly where a wrong account/amount slips through — the ramp catches it once, then autonomy is earned. Zero substrate exists today (the rule families are pattern-triggered, not time-triggered; `reverse_entry` is human-ctx-only) — this is the product's first time-triggered posting lane. |
| **WD-R9** | **Sign floor: admin+ for both new families** (depreciation authority + adjustment templates). | Matches the closest analogue (autopost rules, admin+). Owner-only was the bank-rule exception for statement-matching risk that does not apply here. |
| **WD-R10** | **Staff advances: the B-lite register.** Append-only `staff_advances` (one immutable row per POSTED disbursement, keyed to the exact GL leg on a dedicated per-person non-control advance account) + append-only `staff_advance_applications` (payroll_deduction \| bank_return \| claim \| correction; explicit allocation — NO silent FIFO); outstanding/age are DB-DERIVED, never stored; a managed-account belt (an approved GL movement on an enrolled advance account cannot skip the register — same-transaction, the F3 bar) + an as-of Σregister=GL tie-out. The AF-2 composite verb is the bank-side application producer. `open_items` stays untouched; no employee counterparty, ever (WC-R10 stands); the dedicated account is the v1 subject identity (a staff master is a later mapping, likely Wave F). | Ruled on a commissioned cross-model research record (`docs/plan/research/wave-d/staff-advance-research-2026-08-01.md`): ERPNext is the B-shaped precedent (advance → explicit applications → derived outstanding); SAP B1's employee-as-vendor is the WC-R10-forbidden shape; Xero/QB convention-only can answer only aggregate balances. Decisive for Clara: under convention-only, "who owes what SINCE WHEN" is not in the books, and the agent inventing FIFO would violate "the DB owns every number". Retrofitting the register later forces invented historical allocations — irreversible provenance loss; an empty register born early is cheap. |
| **WD-R11** | **Closing stock defers to Wave E, with cause.** | It is a close-time adjustment and its completeness check ("goods-trading client with no closing-stock entry at close") is a close-readiness item — both hang on machinery E builds; its natural trigger does not exist until E. Named deferral, destination recorded; nothing half-built. Re-openable at E's grilling. |
| **WD-R12** | **CA metadata: adopt the frozen trio** — `ca_class`, `is_commercial_vehicle`, `is_new` — nullable, captured (optionally) at acquisition/carry-down, **computed against by NOTHING until Wave F** verifies CA facts from primary sources. | Acquisition time is when the human knows these facts; retrofitting at F means revisiting every asset. Zero verified CA facts exist today (`my-tax-verified-2026-07-29.md` is SST/e-Invoice only) — anything wider than inert metadata would violate the effective-dated-policy-table law. |
| **WD-R13** | **All four Wave-C residuals ride Wave D**: the AF-1 unborn-item guard (**HARD refuse** — no override; the error names the remedy: book as deposit/advance, apply when born) and the `reverse_entry` MYT date splice ride **D-a/0041**; the AF-2 composite resolve-and-book verb and the `bank_rule_suggested` producer verb ride **D-b/0042**. The two smalls (the sst-watch 2027 fixture literal; BankReconReceiptCard's void-history render) ride as runtime chores. | AF-1 has measured live impact (the RPR Aug-31/Sep-30 scars) — hygiene lands early; an override flag would re-open the exact silent Σbuckets=control break it closes, and correct books have the deposit/advance route (the RM30,000 precedent + apply_open_items, act-dated and structurally immune). Wave D builds auto-reversal on `reverse_entry`'s law, so the MYT splice (a UTC runtime dates 00:00–08:00 MYT reversals a day early) belongs here. AF-2 is needed by D-b's advance repayments anyway and unlocks the two UI-disabled resolve dispositions. |
| **WD-R14** | **Acceptance: sandbox labelled-synthetic first, then BOTH real registers — ROME PROPERTIES and ROME SECRETARY** — seeded through the carry-down's first real firing, depreciated to date under the ruled authority (first-run ramp exercised on real books), tied out; at least one real reducing-balance asset fires. | The WC-R11 doctrine carried forward: the wave cannot end built-but-unfired, and the register's first real rows should land on books already reconciled to the sen. |
| **WD-R15** | **The wave splits: D-a (FA register, migration 0041) → D-b (adjustments + advances, migration 0042).** Each slice: grounding → design doc → design ladder → build → as-built ladder → ceremony → acceptance; the app stays runnable throughout. | The Wave C discipline that worked four times. D-a and D-b are coherent single domains; one combined migration would rival 0037+0040 and give the review ladder one giant surface. |

---

## 3. Verified ground truth (the substrate D lands on)

Full census: the 8-lane grounding record (2026-08-01, session-local) — key facts re-stated here
with their citations so the design docs never re-derive them.

### Present and reusable
- `clara.fixed_assets` complete schema: cost/residual/life/method + three per-client FK'd account
  codes + `acquisition_entry_id` + `accumulated_depreciation_cents` + `depreciation_start_date` +
  `baseline_as_of` + status lineage (`pending/active/disposed/superseded`) + supersede pair
  (`0003:155-182`, `0017:772-793`) **[L]**, RLS forced, SELECT-only grants **[L]**.
- The K-family carry-down (`_draft_opening_item_core` fixed_asset branch, `seed_fixed_asset` 5-arg,
  K5 activation, K6 supersede, `_assert_fa_baseline` before/after every mutation) **[L]** — the
  ONLY writers today **[V]** (live probe: `seed_fixed_asset` + the immutability trigger fn are the
  only FA-touching functions; row count 0).
- COA template vocabulary already FA-complete: 200-*/210-* cost/accum pairs (+ extended PPE, HP,
  intangibles modules), `900-D02` depreciation expense, `530-G01`/`900-DSP` disposal gain/loss —
  never posted to **[V]** (live probe confirms the 200-*/210-* rows on the real client).
- The four approve paths all funnel through `_subledger_on_approve` (`0037:3779-3846` pins exactly
  four callers) **[L]** — the FA hook rides the same four call sites.
- The leader-loop due-check pattern (`autopostReconcileDue`/`sstReconcileDue`/`lintReconcileDue`,
  `leader.mjs:53-72`) is the scheduled-work lane; per-client-per-statement transaction discipline
  per `ARCHITECTURE.md:53`; **no new LISTEN consumer** (Supavisor 31/60 measured; re-measure at
  each ceremony per WB-R18) **[L]**.
- The read-RPC grant-loop idiom (`0038:8056-8064`, copied `0040:4790-4801`) **[L]**; the /aging
  two-pane workbench shell is the clone target for /assets **[L]**; the WCA-R7 composite-born
  maker-checker draft rides the existing /queue draft lane — no new approval UI class **[L]**.
- The rule-family authority pattern ×3 (coding_rule bookkeeper+ · autopost_rule admin+ ·
  bank_rule owner-only), all propose→sign→retire **[L]** — WD-R5/R8/R9's two new families copy it.

### Absent — all of it
No depreciation-posting verb, no disposal verb, no `fa_depreciation`/schedule/run table, no
capital-allowance column anywhere, no recurring-journal machinery (`recurring_pattern` is a wiki
page kind only), no time-triggered poster of any sort, no closing-stock/inventory schema, no FA
read RPCs, no /assets surface. **[V]** (grep + live probes converge.)

### Traps verified — do not step in these
| Trap | Fact |
|---|---|
| **The immutability trigger blocks depreciation accumulation** | `_tf_fixed_assets_immutable_0017` post-approval allowlist is `{disposed_at, status, superseded_by_asset_id, updated_at}` — `accumulated_depreciation_cents` is NOT mutable on an approved row (`0017:1951-1975`) **[L]**. The D-a design must choose: append-only `fa_depreciation` ledger (the salvage PORT + house idiom — favoured) with the register column as baseline-only, vs a trigger-allowlist widening. Either way the choice is explicit, never an accidental UPDATE-through. |
| **The subledger classifier cannot see asset legs** | `_subledger_classify_entry`'s control-net query is `account_class in ('payable','receivable')` (`0037:1012-1027`) **[L]** — an asset-class leg produces NO open_items row, by construction. FA materialisation is its OWN hook logic at the same four approve sites; it must NOT overload `open_items` (a fixed asset is not a trade open item). |
| **`coding_kind` gets no FA value** | WC-R9 fixed its meaning ("which control account, which direction"); a capital purchase stays `supplier_bill` (or generic); the FA signal is the asset-account leg itself. The REBUILD-PLAN roadmap table has no capex row — deliberate. **[L]** |
| **Reversal of an acquisition entry** | `reverse_entry`'s mirror copies 13 columns (neither `coding_kind` nor `document_id`); the subledger unwind keys on `reversal_of` (`0037:919-936`) **[L]**. The FA hook must define the register effect of reversing an acquisition (unwind the born row) symmetrically — designed, not assumed. |
| **The carry-down's CLR31 refusal sites** | Widening `depreciation_method` requires CoR-patching `_draft_opening_item_core`'s two refusal sites (`0017:3330-3333`, `3407-3411`) in the same migration as the CHECK — else the carry-down refuses methods the schema now admits. **[L]** |
| **AF-1's guard placement** | Inside both allocation loops, after the reversed-entry wall (`0037:2795` / analog), before the outstanding read; `apply_open_items` is structurally immune (act-dated, no caller date). 0037's file text is still the live body for both verbs (never CoR-patched) — the fix still follows the CoR-splice idiom for lineage auditability (`0036:381-395` law). **[L]** |
| **`reverse_entry` MYT splice anchors** | The `current_date` literal is `0009:1718`; the live body carries 0017 + 0037-H.2 + 0038-E7 splices, none of which touch the mirror-INSERT values fragment — the 5th patch anchors there and must positively probe all three prior markers (`pg_get_functiondef` source, dual-grep law). **[L]** |
| **`_draft_entry_core` drops arbitrary flags** | Only three named booleans survive p_flags extraction (`0016:4079-4089`) — the `bank_rule_suggested` producer (D-b) is its own audited verb or a 4th named key; never assume a flags passthrough. **[L]** |
| **Advance accounts must be dedicated** | The B-lite tie-out is meaningless on a mixed account (director current + advances). Enrolment is opt-in per account; never enrol 350-002/350-003-style related-party accounts. (Research record §3.) **[R→design]** |

---

## 4. The build order

### D-a — the FA register slice (migration 0041)
1. **Schema:** `depreciation_method` CHECK widens (`straight_line`,`reducing_balance`,`none`) +
   the CLR31 site recuts (WD-R3) · CA metadata trio, inert (WD-R12) · the pending-particulars
   state (WD-R1; exact shape — status value vs separate column — is the design doc's) · per-client
   depreciation policy (cadence, WD-R4) · the depreciation authority table (WD-R5/R9) · the
   depreciation ledger decision of record (§3 trap 1) · `asset.disposed` event kind (ARCH names
   only acquired/depreciated — add the third).
2. **Acquisition-from-coding:** the FA materialisation hook at all four approve paths (soft-birth
   per WD-R1); the particulars-completion verb (bookkeeper+); the queue/close-readiness chase
   surface; reversal-of-acquisition semantics (§3 trap 4).
3. **Depreciation:** the run verb — DB-computes per asset per period (three methods), posts
   Dr 900-D02 / Cr 210-* per client per period, idempotent (PRD L9), receipted; the ramp
   (first run drafts, WD-R5); the high-stakes drop; the leader-loop due-check wiring (no new
   consumer); per-client transaction discipline.
4. **Disposal:** full + partial per WD-R7 (cost-portion split, supersede lineage, sen-exact
   rounding law, gain/loss legs, depreciation-stop).
5. **Ride-alongs:** AF-1 hard-refuse guard splice + `reverse_entry` MYT splice (WD-R13).
6. **Reads + surface:** `list_fixed_assets`/`get_fixed_asset` + register/schedule/run-receipt
   reads via the grant-loop idiom; /assets two-pane workbench (clone /aging); parts/cards per the
   catalog discipline; the two runtime smalls.
7. **Acceptance (WD-R14):** sandbox synthetic (incl. a partial disposal drill if no real case) →
   RPR + ROME SECRETARY real registers seeded via carry-down (its first real firing),
   depreciated to date with the ramp exercised, ≥1 real reducing-balance asset, register↔GL tied.

### D-b — the adjustments + advances slice (migration 0042)
1. **Recurring/reversing:** template table + propose/sign/retire (admin+, WD-R8/R9); the
   time-triggered poster (leader due-check; drafts on first occurrence; auto-reverse under the
   same authority; edit re-ramps; high-stakes drop); receipts + visibility.
2. **Staff advances (WD-R10):** `staff_advances` + `staff_advance_applications` (append-only,
   explicit allocation, derived outstanding/age) + account enrolment + the managed-account belt +
   the as-of tie-out + `staff_advance_summary`/`staff_advance_statement` reads.
3. **AF-2 composite resolve-and-book verb** (one transaction: optional hand-draft + allocate +
   match + resolve; re-enables the two UI-disabled dispositions; doubles as the advance
   bank-application producer).
4. **`bank_rule_suggested` producer** (the audited suggestion-accept verb + chip surface;
   the 0040 S5 carve-out stops it breeding autopost sightings — already live).
5. **Acceptance:** synthetic first; real = at least one signed recurring template firing with its
   ramp + auto-reversal on a real client month, and a real consented staff-advance case
   (or labelled-synthetic with the deferral named if none exists yet).

### Boundaries D must not cross
- **No `open_items` widening, no third domain, no employee counterparty** (WC-R10, WD-R10).
- **No close model** (WD-R6) — receipts and advisory flags only; Wave E owns periods.
- **No CA computation, no CA rates anywhere but future effective-dated policy tables** (WD-R12).
- **No new LISTEN consumer loop; no new frozen workflow class unless the design proves one is
  needed** (C-c shipped none — the default posture).
- **Depreciation/adjustment posters never touch `journal_entries` immutability or the settlement
  belts** — they are ordinary audited writers under the same four-invariant regime.

---

## 5. Design debts recorded (not fixed in Wave D unless they block)

1. **Segment-aware FA tie-out** — `fa_control_tie_out` stays REBUILD-rated; the honest version
   needs Wave E's close-segment primitive. D-a ships the register↔GL as-of assertion for a
   never-closed book (the current reality) and names the E dependency.
2. **Staff master / employee identity** — the dedicated account is the v1 subject key; a payroll
   staff-master mapping is Wave F's (research record §3).
3. **`account_class` stays binary** (wave-c-contract debt #1) — WD-R10's register is beside the
   GL precisely so this wall stays untouched; the eventual facing is still owed, still later.
4. **Statutory advance/deduction limits — VERIFIED (research record Lane 2, EA 1955 primary
   text):** s.22 caps an advance at the prior month's earned wages · s.24(2)(c) payroll-deduction
   recovery is lawful only interest-free · s.27 bans interest on salary advances outright. These
   land as effective-dated policy VISIBILITY (never silent computation) — the s.22 ceiling
   surfaces if advance-request UX is ever built; the interest ban is a compliance floor the
   register design already satisfies (no interest field exists). The Xero-class payroll trap is
   named for Wave F: deduction repayment posts through the register's application verb, never a
   payroll-engine deduction target. MPERS presentation wording stays UNVERIFIED (inference only)
   — verify from a real illustrative-FS note before the Wave-E FS pack cites it.
5. **Sighting-pool segregation §5.3** (wave-c-contract debt #3) — unchanged; nothing in D touches
   the vendor pool (WD-R10 keeps employees out of counterparties entirely, which is the point).

---

## 6. Acceptance corpus

Per WD-R14. Real substrate confirmed: RPR — nine reconciled months live, `200-*/210-*` COA rows
present **[V]**; ROME SECRETARY — the second real register. The owner holds the FA schedules
(cost, accumulated depreciation, useful lives) for both and confirms reducing-balance evidence
exists (WD-R3 ruling). The carry-down (never fired on real data) seeds both registers as the
acceptance's first act; the sandbox synthetic half runs first, always.

---

## 7. Open items at ratification

- **The web-research annex LANDED** (research record Lane 2, 2026-08-01): **no contradiction
  with WD-R10** — convergent validation (ERPNext IS a register-over-GL; Odoo's community
  independently reinvented the pattern; no system anywhere models an employee advance as a
  counterparty). One nuance recorded for the D-b ladder's eyes (the lane's crossover-trigger
  framing), the ruling not re-opened; EA 1955 facts verified (§5 debt 4).
- **Gate P** rides unchanged (operating runway; owns the capitalised/mixed-purchase tax-allocation
  question — adjacent to D-a's acquisition work but explicitly NOT this wave's item).
- **The §7-A bundle** stays parked for the unattended sales drafter (unchanged).
- The C-b **kind-scoped supersede adjudication** (0017 trigger) still waits on its consumer census.
