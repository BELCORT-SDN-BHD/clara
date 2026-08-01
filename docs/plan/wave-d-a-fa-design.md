# Wave D-a — the FA register slice: design of record

> **Status: v2.1 (2026-08-01) — rounds 1 AND 2 folded.** Contract: `docs/plan/wave-d-contract.md`
> (WD-R1..R15, ADR-055); no ruling re-opened. Migration **0041** (claimed at merge). The full
> ladder record (round tables, fold ledgers, lens counts) lives in
> `wave-d-a-fa-design-part2.md`; this file is the buildable mechanism only.

---

## 0. The slice in one paragraph

Every approved journal entry that debits an **enrolled FA cost account** births a register row in
the same transaction (soft-birth, WD-R1). A per-client **admin+-signed depreciation authority**
(cadence on the authority, WD-R4/R5/R9) lets a leader-loop sweep compute depreciation per client
per period; charges reach the books as journal entries carrying a **flags-borne proposal**, and
the approve-time hook **materialises the `fa_depreciation` ledger rows, the run receipt, and the
events at approve** — ONE materialisation moment; a draft that dies leaves nothing. Disposal is
likewise proposal-shaped (full, or the partial cost-portion split), executed by the hook at
approve, so maker-checker windows never strand register state. The register ties to the GL by an
**effective-dated** as-of assertion; incompleteness is visible, never blocking.

## 1. Schema (0041)

### 1.1 `clara.fixed_assets` alters
- `depreciation_method`: CHECK widens → `('straight_line','reducing_balance','none')`, column
  **NULLABLE** (NULL = not yet chosen), **`DROP DEFAULT`** (postverify probes `atthasdef=false`).
- New `depreciation_rate_bps int` — RB annual rate, **CHECK between 1 and 10000**.
  **Method-driver CHECKs both ways:** `reducing_balance` ⇒ rate AND life set ·
  `straight_line` ⇒ life set, rate null · `none` ⇒ neither. `depreciation_start_date` (the
  in-service date) is required for EVERY method's completeness, including `none`.
- New `acquisition_line_id uuid` FK → `journal_lines(id)`, **UNIQUE** — the birth identity.
  **Successor rows (split / revise) carry it NULL**; the acquisition leg is reached upward via
  `supersedes_asset_id`. Tenant congruence is by construction (the hook derives the insert
  entirely from the approved entry's own leg rows) plus a firm/client-vs-acquisition-entry
  congruence CHECK.
- New `disposal_entry_id uuid` FK → `journal_entries(id)`; new **`superseded_at date`** and
  **`effective_from date`** — all ACCOUNTING dates (the governing entry's `posting_date`,
  never transaction time). **As-of inclusion rule:** a row is included at `as_of` iff
  `coalesce(effective_from, acquired_date) ≤ as_of` AND it is not
  disposed/superseded/unwound **effective ≤ as_of** (`disposed_at` / `superseded_at` /
  the unwinding mirror's posting date). Successors are born with `effective_from` = the
  split entry's posting date — a pre-split as-of read includes ONLY the original (the round-2
  worked RM100,000 double-count is unrepresentable).
- CA metadata trio (WD-R12): `ca_class`, `is_commercial_vehicle`, `is_new` — nullable, inert.
- `status` CHECK widens: + `'unwound'` (an unwound row carries `superseded_by_asset_id NULL` —
  `ck_fixed_assets_superseded_state_0017` is untouched and safe). Split lineage law:
  **`superseded_by_asset_id` always names the CONTINUING successor**; the disposed portion is
  reachable upward only; reads traverse upward.
- **Particulars completeness DERIVED** — `_fa_particulars_complete(row)`: start date set AND
  (method='none' OR the driver trio holds). Soft-birth `description` = a stable placeholder
  (`'Fixed asset (particulars pending) — <account> <RM>'`; the column is NOT NULL and lawful
  document-backed entries can carry NULL memos everywhere); completes with particulars.
- **Immutability trigger recut — the full transition table:** post-approval mutable =
  `{status, disposed_at, disposal_entry_id, superseded_by_asset_id, superseded_at,
  updated_at}` **unconditionally** (lifecycle facts, written only by the hook/K-family) ∪ the
  particulars columns **while `_fa_particulars_complete(OLD)` is false** (evaluated on OLD —
  the completing UPDATE must not refuse itself). Predecessors in a supersede-forward change
  ONLY status/superseded_by/superseded_at; new particulars live on the successor row.

### 1.2 `clara.fa_account_profiles` (NEW — enrolment makes detection lawful)
`(id, firm_id, client_id, asset_account_code, accum_depr_account_code NULLABLE,
depr_expense_account_code NULLABLE, active, enrolled_at timestamptz not null, created_by,
created_at)` — **unique (client_id, asset_account_code) WHERE active** (re-enrolment reuses or
re-creates; `upsert_fa_account_profile` reactivates the retired row). Codes FK, active,
`account_class IS NULL`; cost+accum `asset`-typed, expense `expense`-typed; **pairwise
distinct**. Accum+expense both NULL ⇔ non-depreciable profile (land): assets born on it take
`method='none'`. **`enrolled_at` is the belt watermark** (§2.4): entries approved BEFORE
enrolment are exempt — enrolling an account with history neither blocks that history's
reversals nor births retroactively. One scope everywhere (active enrolment) for hook + belt;
`upsert_account` gains a refusal against deactivating a COA account backing an active profile.

### 1.3 `clara.fa_depreciation` (NEW — the append-only charge ledger, born at APPROVE)
`(id, firm_id, client_id, asset_id, period_start, period_end, amount_cents >0,
effective_date date not null, entry_id FK not null, run_id FK, unwind_of uuid FK self,
is_live boolean not null, created_at)`. **Rows are minted ONLY by the approve-time hook**
from the entry's proposal — run drafts that die leave nothing.
- **Signs and reads:** `Accumulated(asset, as_of) = baseline + Σ over ALL rows effective ≤
  as_of of (case when unwind_of is null then +amount else −amount end)`. **`is_live` never
  appears in any read** — it exists solely for the uniqueness index. Refuses
  `as_of < baseline_as_of`.
- **`is_live` law:** charge rows born `true`; **unwind rows born `false`, always**; the hook
  flips the original charge `false` in the same statement block that appends its unwind
  (order: flip, then insert — neither can collide since unwind rows never enter the index).
  Test-asserted invariant: `is_live=false on a charge ⇔ an unwind row references it`.
- **Indexes:** `unique (asset_id, period_start, period_end) WHERE is_live` (a corrected re-run
  is lawful after unwind) · `unique (unwind_of) WHERE unwind_of is not null` · firm/asset
  congruence CHECKs. Ranges may legitimately span months (annual arm, stubs): the hook
  additionally refuses a new charge whose range OVERLAPS an existing live charge for the
  asset (client-rung-serialized, so a plain probe suffices — the index alone only catches
  exact-range duplicates).

### 1.4 `clara.fa_depreciation_authorities` (NEW)
`(id, firm_id, client_id, status ('proposed','live','retired'), cadence ('monthly','annual'),
proposed_by/signed_by/retired_*, op keys, created_at)` — `unique (client_id) where
status='live'`; propose/sign/retire, sign = admin+ (WD-R9). Cadence changes = retire +
re-sign. **The ramp predicate (derived, no column):** autonomy is earned iff there exists ≥1
**approved AND un-reversed** `origin='scheduled_run'` entry for this client under this
authority. (No receipt join — entries are the truth; a zero-charge period mints no entry and
earns nothing; a reversal un-earns until a fresh reviewed run passes. Flap is impossible: the
run verb, `_approve_entry_core`, and `reverse_entry` all serialize on the 203005004 client
rung, so the mode decision and the post are one lock-holding transaction.)

### 1.5 `clara.fa_depreciation_runs` (receipts — audit records, minted at APPROVE)
`(id, firm_id, client_id, authority_id, period_start, period_end, mode, entries,
charged_cents, skipped jsonb, entry_id FK **unique**, op_key unique, created_at)`.
**A receipt exists ⇔ its entry was approved and materialised** — minted by the hook beside
the ledger rows, 1:1 with the entry. **No (client, period) uniqueness** — a corrected re-run
after reversal lawfully mints a second receipt for the same period. **Receipts are NEVER read
for eligibility or coverage** — due-ness and the WD-R6 advisory both derive from per-asset
uncharged due periods (§3.1). A run finding nothing due persists nothing (returns a no-op
json). Failures roll back whole; the periods stay due; runtime logs carry the error.

### 1.6 Books-core widenings
- `journal_entries.origin` CHECK + **`'scheduled_run'`** (reader census in-migration; the 0041
  tail asserts **exactly one function** inserts that origin — the issuer-authenticity half).
- **Event rows, not enums:** `asset.acquired` / `asset.depreciated` / `asset.disposed` into
  `event_types` + `trigger_taxonomy` at the ACTIVE version, **decision `'ignore'`** (the
  /assets read RPCs surface directly — the 0040 bank-kind reasoning), migration role, tail
  census ×3 on both tables.
- `clara.clients` + **`fy_end_month`/`fy_end_day`** (nullable; explicit Dec-31 fallback
  SURFACED on the authority card). **Setter:** `set_client_fy_end(p_client, p_month, p_day,
  p_op_key)` (bookkeeper+, audited) — the interview seeds it where the year-end answer
  exists; real-client backfill is an owner act through the setter. No create_client recut.

## 2. Acquisition-from-coding (WD-R1)

### 2.1 The hook and its splice point
`clara._fa_on_approve(p_entry)` — ONE CoR splice into `_subledger_on_approve`, after the
classify/materialise loop and BEFORE the settlement early-return (0037:1122-1123). **The
anchor is the multi-line fragment from the item-INSERT tail through its `end loop;` as it
reads in the LIVE 0040-recut body** (`end loop;` alone occurs twice — 0037:1118 and
0037:1260; the multi-line anchor is unique), expected count **1**, with the five-marker
prestate census (`payment_terms_days` · `effective_date` · `item_kind in ('invoice','bill')`
· `cross_domain_control_entry` · `allocation_stale`) and the 0041 tail re-pinning the
four-caller census post-splice.

### 2.2 Birth
For each debit leg on an actively-enrolled `asset_account_code`, where the entry is NOT
`is_opening_balance` (K owns its rows) and NOT a reversal mirror (`reversal_of IS NULL`):
insert one `fixed_assets` row — placeholder description, `acquired_date` = posting_date,
cost = leg amount, accounts from the profile, `acquisition_entry_id` + `acquisition_line_id`,
`status='active'`, method NULL (or `'none'` on a non-depreciable profile),
`on conflict (acquisition_line_id) do nothing`; emit `asset.acquired`. One row per LINE —
multi-unit legs birth one row (§4.3's split divides later); freight/installation on a second
line births a second row BY DESIGN (no merge door exists; the practice is one asset per line
— stated, not silent).

### 2.3 Completion + the two change doors
- `complete_fixed_asset_particulars(p_client, p_asset, p_particulars, p_op_key)`
  (bookkeeper+): sets method/life/rate/residual/start (+CA trio, description) while
  incomplete; complete-once. Carry-down completion surfaces money-vs-date clock divergence;
  the **money clock is authoritative** (remaining months from
  `(cost − residual − accumulated)/monthly`, capped by life).
- `revise_fixed_asset_particulars(p_client, p_asset, p_particulars, p_effective_from date,
  p_op_key)` (bookkeeper+ — the MPERS-17.19 prospective door): supersede-forward — the
  predecessor → `superseded` (+`superseded_at` = p_effective_from), the successor born with
  `effective_from` = p_effective_from, inheriting cost/accumulated/lineage
  (`acquisition_line_id` NULL) with new particulars applying to FUTURE periods only;
  **refuses if p_effective_from ≤ any live charge's period_end** for the asset.

### 2.4 Reversal semantics (dependency-ordered) and the belt
- **Reverse-while-depreciated** (acquisition with live charges): refused, remedy named;
  **re-derived in the hook at mirror-approve** (the approve-time twin).
- **Dependency order:** an acquisition with disposal/split descendants refuses until those
  are reversed. **Partial-disposal reversal is DEFINED:** reversing the split entry (refused
  if EITHER successor carries later charges/splits/disposals) flips BOTH successors →
  `'unwound'`, restores the original → `'active'` (superseded_by/superseded_at cleared),
  and unwinds the stub charges. Full-disposal reversal restores active + clears
  disposed_at/disposal_entry_id + unwinds the stub.
- **Unwind on clean acquisition reversal:** row → `'unwound'`; keys on `reversal_of`; skips
  K-family mirrors (`is_opening_balance`).
- **The belt:** deferred constraint trigger on `journal_entries`, `WHEN
  (new.status='approved')`, legs re-derived by join, covering **all three** enrolled roles,
  **scoped to entries approved at/after the profile's `enrolled_at` watermark** (pre-history
  stays reversible; nothing births retroactively). Doors: (a) a register row keyed to this
  line **in ANY status** · (b) a `fa_disposal` proposal on THIS entry · (c) a
  `depreciation_charges` proposal on THIS entry with `origin='scheduled_run'` · (d) a
  reversal mirror · (e) a K-family entry tying to its own `opening_items.fixed_asset` row —
  K `gl_balance` legs on enrolled accounts REFUSE (enrolment is the commitment to itemised
  registers). Cost adjustments (supplier credit/rebate) = named deferral riding the future
  `supplier_credit_note` kind; v1 remedy is reverse + re-book, and the refusal says so.

## 3. Depreciation (WD-R3/R4/R5/R6)

### 3.1 The arithmetic (DB-owned; month-grain; per-asset; cadence-aware)
- **The period generator is a function of the authority's cadence** (WD-R4 consumed):
  `monthly` ⇒ calendar months, due when the month has ended; `annual` ⇒ the client FY window
  (§1.6; Dec-31 fallback surfaced), due when the FY has ENDED — one annual entry, whose
  per-asset charge covers that asset's uncharged in-service months of the FY (a mid-FY
  disposal's stub is that asset's only in-year charge, so the annual overcharge class is
  unrepresentable). Ledger rows always record the exact sub-range charged.
- **Per-asset due-ness:** an asset's uncharged months run from
  `greatest(in-service month, month after baseline_as_of)` — the carry-down lower bound —
  through the period end (or disposal month), minus its live charge ranges. Late completions
  catch up into the current run. The WD-R6 advisory derives from these gaps, never receipts.
- **Month-grain convention (owner-visible, worked figures in acceptance):** in-service month
  charged; **disposal month charged**; no daily pro-rata.
- **straight_line:** monthly = floor((cost − residual)/life); the final month charges
  `cost − residual − Accumulated` exactly.
- **reducing_balance** (FY-grain on the client FY, month-segmented, prospective):
  basis = `cost − Accumulated(asset, greatest(FY_open − 1 day, baseline_as_of))` — the
  carried-asset collision with §1.3's refusal is closed by the `greatest`. Per rate segment s
  in the FY (segments arise from supersede-forward revisions): entitlement_s =
  `round(basis × rate_s) × months_s / 12`, sen law = floor monthly + the segment's last
  charged month absorbs. FY total = Σ segments (a 20%→10% October revision on RM80,000 basis
  = 12,000 + 2,000 = RM14,000 — the prospective reading). **The true-up rides whichever
  charge terminates the asset's FY charging** — a December run, a life-end clamp, or the
  disposal stub (the stub carries the true-up when it is last). Clamps: never below residual;
  a negative true-up clamps to zero with a receipt note. On a split, each successor's
  remaining-FY entitlement is its cost-share of the parent's; the parent's YTD charges ride
  the baked accumulated shares. RB terminates at life end (final charge = NBV − residual).
- **none:** never charged; skipped+counted. Fully-depreciated: skipped+counted. Verbs assert
  Σdebits = Σcredits exactly before the validator.

### 3.2 The run verb (proposal-shaped; posts via the approve core)
`clara.run_depreciation_period(p_client, p_period_start, p_period_end, p_op_key)` — one
period per call, one transaction; takes `pg_advisory_xact_lock(203005004, hashtext(client))`
**before any FA read**. **Sequencing law:** refuses if any EARLIER period is unmet, and
refuses (`period_draft_outstanding`) while an un-dead draft carrying a `depreciation_charges`
proposal exists for the client — the sweep calls the OLDEST unmet period only, so draft-N
blocks N+1 (the RB math never reads around an unapproved period). **Skips assets with an
outstanding `fa_disposal` draft dated ≤ period end** (a pending disposal freezes charging —
the maker-checker race is closed by refusal, not luck). Computes due charges (§3.1); nothing
due → no-op json, nothing persisted. Else: **direct `insert into clara.journal_entries`
(the `allocate_receipt` precedent — `_draft_entry_core` cannot carry a proposal and is NEVER
widened)** — `origin='scheduled_run'`, `last_human_editor := authority.signed_by` (so the
existing high-stakes law puts a machine charge on the DISTINCT-CHECKER arm whenever the
signer approves — the attestation-arm hole is closed), flags
`depreciation_charges = {authority_id, op_key, charges:[{asset, range, amount}...]}`; legs
aggregated per (expense, accum) pair. `mode='post'` ⇒ approves in-verb **via
`_approve_entry_core`** (the `allocate_receipt` self-approve path — the four-caller census
holds; the CLR26 open-question block or a high-stakes refusal on the unattended path leaves
the entry draft and the period due, honestly). `mode='draft'` ⇒ the /queue lane.
**The hook at approve** validates the proposal (authority live+signed; origin; issuer op-key
present in the op-receipt ledger; register state fresh — stale ⇒ named refusal), then mints
ledger rows + THE RECEIPT + `asset.depreciated` events. `revise_entry` refuses
proposal-bearing entries by name (the sixth recut, §5).
**Correction law:** reverse the period entry (all its rows unwind, effective-dated at the
mirror's MYT posting date) → re-run the period (lawful under §1.3's index and §1.5's
receipt shape). Aggregate-JE consequence recorded: correction is client-period-wide.

### 3.3 Mode
`mode='post'` iff authority live AND the §1.4 ramp predicate holds AND the period entry is
not high-stakes (entry-total grain; a client whose aggregate exceeds its threshold drafts
every period — WD-R5's own text). Otherwise draft (WCA-R7 lane; solo attestation applies).

### 3.4 The sweep, grants, and context
`depreciationRunDue` joins the leader due-check family, **feature-detecting 0041**
(`to_regprocedure('clara.run_depreciation_period(uuid,date,date,text)')`) so the runtime
boots dormant on 0040. Per client with a live authority: call the oldest unmet period
(cadence-aware); iterate as periods clear. **Grant: `clara_runtime`** (the leader runs under
`set role clara_runtime`; `clara_runtime_login` privileges are inherit-false). Runtime
context: firm from the client row, actor = `authority.signed_by` (the `execute_rule_post`
model). The human path is `run_depreciation_manual(...)` with `_human_ctx(bookkeeper)` +
firm check. No new LISTEN consumer; Supavisor re-measure at ceremony.

## 4. Disposal (WD-R7, proposal-shaped)

### 4.1 The verb
`dispose_fixed_asset(p_client, p_asset, p_disposal_date, p_proceeds_cents ≥0,
p_proceeds_account NULLABLE-when-zero, p_gain_account, p_loss_account, p_memo, p_op_key,
p_cost_portion_cents default NULL)` (bookkeeper+). Takes the **203005004 client rung before
any FA read** (the §7 serialization cell is real, not luck). Validations: active + complete;
per-asset precondition (no due period EARLIER than the disposal month uncharged; vacuous for
`none`; no authority required); proceeds account asset-typed, non-control, not the enrolled
cost account; gain income / loss expense, non-control, verb-validated (no literals; UI
defaults from the template); credit-sale proceeds via a named non-control debtor account
(counterparty param = named deferral). Zero-amount legs OMITTED. Builds ONE entry — the stub
depreciation through the disposal month (carrying the RB true-up when it terminates the FY)
+ the disposal legs — with flags `fa_disposal = {asset, portion, proceeds, stub charges,
op_key}`, `last_human_editor := maker`; posts via `_approve_entry_core` when not high-stakes,
else draft for the distinct checker.

### 4.2 The hook at approve
Validates the proposal (the op-key exists in the durable op-receipt ledger for
`dispose_fixed_asset` — the issuer binding that survives the maker-checker gap; register
state fresh, else `disposal_stale` named), then executes: full → `disposed` + `disposed_at`
(= p_disposal_date) + `disposal_entry_id`; stub charges materialise; `asset.disposed` emits.

### 4.3 Partial — the supersede split
Original → `superseded` (`superseded_at` = the entry's posting date; `superseded_by` = the
CONTINUING successor). Two successors born with **`effective_from` = the entry's posting
date** and `acquisition_line_id` NULL: disposed portion (cost = portion, accum share =
round(accum × portion/cost), **residual share = round(residual × portion/cost)**,
immediately `disposed`) and the continuing remainder (exact complements — the remainder
absorbs ALL rounding; keeps depreciating; RB basis derives through lineage by cost-share).
Register totals are effective-date-gated (§1.1) — pre-split as-of reads see only the
original, post-split reads see only the successors; the tie holds at every as-of.

## 5. Ride-alongs + substrate recuts (0041)
1. **AF-1 hard-refuse guard** in both allocation loops (remedy named: deposit/advance +
   `apply_open_items`).
2. **`reverse_entry` MYT splice** (5th patch; values-fragment anchor; 3 prestate probes).
3. **`_draft_opening_item_core` FOUR-part recut:** both CLR31 sites widen · the INSERT
   literal → `v_method` + driver validation (rate for RB; nullable accum/expense for `none`)
   · **the FA line builder omits the accum leg when `v_accum = 0` or the code is NULL**
   (zero-accumulated real assets and land both refuse today at `_validate_entry_lines`; the
   OBE contra absorbs) — byte pins 0017:5663/5677 preserved; unknown methods still refuse
   CLR31 by name; dashboard method+rate inputs.
4. **`_assert_fa_baseline` recut:** correspondence admits D-a lifecycle states for
   still-active opening items (the seed-wide wedge); **the K6 same-item hand-off gets a
   NAMED refusal** (`fixed_asset_lifecycle_advanced`, remedy: reverse the D-a act first) —
   correcting the opening baseline of a disposed/split asset is refused honestly, other-item
   corrections stay green.
5. **`revise_entry` sixth recut:** refuses `depreciation_charges`/`fa_disposal`-bearing
   entries by name (its marker census re-derived — 0017 R1-F1 + four 0028 regions + 0037
   H.2b all pinned).
6. **`upsert_account` deactivation refusal** (§1.2). **Runtime smalls:** sst-watch 2027
   literal → DB-clock; `BankReconReceiptCard` renders `voided_receipt`.

## 6. Reads + surface
Read RPCs (grant-loop idiom): `list_fixed_assets(client)` · `get_fixed_asset(asset)` (row,
upward lineage, charge history, DB-projected schedule) · `list_depreciation_runs(client)` ·
`get_depreciation_authority(client)` · **`fa_register_tie(p_client, p_as_of)`** — the
effective-dated register↔GL assertion (named; the wave's tie instrument; segment-aware
rebuild stays Wave E's). **/assets workbench** = the /aging two-pane clone (register list +
asset detail: completion form, schedule, history, dispose incl. cost-portion, lineage;
authority/cadence/ramp banner + FY-fallback surface; runs tab; per-asset uncharged-due
advisory). Parts `FixedAssetPart` + `DepreciationRunReceiptPart` + cards on `useCard`,
fixtures added; **no chatTurn bump**. Queue row_kind `fixed_asset_incomplete` (plain text
literal; catalog + parity test; **dashboard deploys BEFORE 0041**).

## 7. Tests (x41) + the upgrade drill
Contract-blind first. The round-1 floor (design part2 §R1) plus the round-2 composition
cells: soft-birth on a NON-settlement entry ×4 approve paths · K5 births nothing extra · K6
other-item green / same-item NAMED refusal · birth idempotency (two identical legs = two
rows; re-drive = no dupes) · placeholder description · belt: all three roles refused by
name, five doors admitted, **watermark (pre-enrolment history reversible; door (a)
status-blind on the unwound reversal)** · K gl_balance refused · enrolled-account
deactivation refused · completion window (OLD-evaluated; complete-once; CA inert) ·
money-clock divergence surfaced · per-asset due-ness (late completion catches up; baseline
lower bound; **zero-charge period then backdated completion → next run lawfully charges —
no receipt in the way**) · SL final-month exactness · RB battery (carried-basis `greatest`
law; mid-year start; **intra-FY rate segmentation = the prospective sum**; true-up riding
the disposal stub; negative clamp; life-end; 29-sen tail) · **draft-N blocks N+1; the sweep
never double-calls a period (no receipt collision exists by design)** · annual cadence at a
non-December FYE (one entry at FY end; per-asset sub-ranges; mid-FY disposal stub = the
asset's only in-year charge) · ramp (zero-charge earns nothing; reversal un-earns; derived,
no column) · high-stakes drafts with **`last_human_editor = signer` → the distinct-checker
arm actually binds** (the cell approves as the signer and MUST refuse) · stale proposals
refused at approve · **generic `draft_entry(p_flags)` cannot persist either proposal key;
exactly two functions write them (tail census)** · run-vs-dispose serialization under the
rung, both orders, named loser · disposal battery (stub through disposal month incl. RB
true-up; zero-proceeds scrapping; account validations; per-asset precondition incl. annual
+ no-authority carry-down) · partial split (cost+accum+residual sen-exact; effective_from
gating — **the as-of-before-split cell asserts the original alone**; lineage both
directions) · reversal battery (acquisition clean/with-charges/with-descendants +
approve-time twin; depreciation unwind effective-dated + period re-run; full-disposal
restore; **partial-disposal reversal: both successors unwound, original restored, stub
unwound; refused when a successor has later state**) · AF-1 both composites + deposit-route
green · MYT date · origin census (exactly one `'scheduled_run'` writer) · events + taxonomy
census · grants (sweep green under `set role clara_runtime`; manual path firm-checked) ·
reads scope + `fa_register_tie` at TWO as-of dates straddling a split. **The x41 upgrade
drill:** populated pre-0041 book incl. a K-seeded asset; nothing births retroactively;
baseline+ledger ties; belts hold (watermark honoured); the K6 door still opens.

## 8. Ceremony + acceptance
Dashboard first → runtime v-next (dormant on 0040 by the feature probe) → the D1 quiesced
ceremony: 0041 → postverify (origin CHECK + single-writer census · event rows ×3 + taxonomy
· method CHECK + `atthasdef=false` · immutability transition table · `_subledger_on_approve`
marker census + four-caller re-pin · belt live + watermark column · `_assert_fa_baseline`
correspondence · `has_function_privilege('clara_runtime', run verb)` · read RPCs incl.
`fa_register_tie` · Supavisor re-measure) → restart → /ready. **Acceptance (WD-R14):**
sandbox labelled-synthetic first (soft-birth → completion → authority → ramp drafts →
approve → auto month · an RB asset incl. a mid-year rate revision · full + partial disposal
drills incl. the maker-checker window and the partial REVERSAL drill · the AF-1 refusal
drill) → REAL: RPR + ROME SECRETARY registers seeded via the carry-down's first real firing
(zero-accumulated assets and land now seed lawfully; ≥1 real reducing-balance asset carried
with its honest method), authorities signed, first runs approved (ramp), a subsequent period
auto-posts, `fa_register_tie` green on both books at TWO as-of dates (one interim — the
AF-1 lesson).

## 9. Conventions of record
1. Month-grain both ends: in-service month charged; disposal month charged; no daily
   pro-rata (owner-visible; worked figures ride the acceptance).
2. RB requires life (termination) + rate (charge); the predicate and CHECK agree.
3. One aggregate JE per period; correction is client-period-wide (stated price); high-stakes
   grain = entry total.
4. One asset per journal line; no merge door (freight-on-a-second-line births a second row —
   stated practice, not a silent surprise).
5. Proposal authenticity is structural: no table grants on `journal_entries`,
   `_draft_entry_core` carries no flags column and is never widened, exactly two audited
   verbs write the two proposal keys, exactly one function writes `origin='scheduled_run'`
   — each tail-censused.
