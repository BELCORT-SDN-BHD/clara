# Wave C-a — the AR/AP open-item subledger + allocation: design (v2, review-hardened)

> **Status: RATIFIED 2026-07-30 (v2).** Forks 1–5 owner-ruled in the grilling; fork 6
> owner-delegated → A+ (orchestrator + Codex convergence); WCA-R7..R9 owner-ruled after the
> design review ladder. **v2 incorporates the full design-stage review: a 3-lens opus
> adversarial pass + an independent Codex `gpt-5.6-sol` pass — 6 unique BLOCKERs and 12 MAJORs,
> every one resolved below.** This document *executes* `docs/plan/wave-c-contract.md` §4 C-a
> (WC-R1..R12 are not re-opened). On conflict the contract governs for Wave C; `docs/prd/PRD.md`
> §6 (LAW) governs always.
>
> Evidence grading: **[V]** orchestrator-verified this session at the cited file:line ·
> **[G]** grounding-lane verified · **[RV]** verified independently by BOTH review lanes.

---

## 1. What C-a builds, and the debt it pays

C-a pays the F3 debt: every `supplier_bill` approved today — the ADR-050 production autopost
included — credits the payable control with **no open item behind it** (`PRD.md:119` calls that
a failing workflow). C-a lands: the two settlement `coding_kind`s (WC-R9), signed open items +
**balanced-pair** allocations materialised at APPROVE, the backfill of the existing book, the
allocation composites, and the two owner-ruled runtime additions.

Aging/statements are **C-c**; bank identity/ingest/matching are **C-b**. `due_date` ships as a
nullable column but **has no producer** (the fact allowlist is closed, `0026:743-752`; no verb
takes one) — C-c owes the producer and this design makes no forward-compatibility promise
beyond the column existing **[RV]**.

## 2. Grounded corrections (v2 — review-corrected)

1. **There are FOUR live approve paths** **[RV]**: `_approve_entry_core` (latest `0035:140-483`,
   shared by `approve_entry` + `execute_rule_post` since 0015 — one core, so teaching it covers
   autopost automatically) · `reverse_entry`'s inline non-high-stakes branch (`0009:1730-1731`)
   · `_approve_opening_entry` (`0017:3809-3811`) · **`approve_wrong_client_correction`'s inline
   mirror approve (`0027:303-305`)** — the fourth was missed by the v1 census; it adopts OR
   constructs reversal mirrors (`0027:276-299`) and never touches the core **[V]**.
2. **Provenance for recuts** (the CoR dual-grep law, `0036:381-413`): `_approve_entry_core` is
   clean — rebuild from 0035 text is safe **[RV]**. **`reverse_entry` is NOT clean** — 0017
   splices the CLR31 opening boundary into the live body via `pg_get_functiondef`
   (`0017:255-271`, asserted at `0017:5324-5337`) → **PATCH-only** **[RV]**.
   `approve_wrong_client_correction`'s live body is 0027's lock-order recut → **PATCH-only**.
   `reconcile_sweep_runs`' live body carries 0017's active-client splices → **PATCH-only, and
   the splice anchor is the 0017-spliced text (`0017:473-480`), not 0011's file text** **[RV]**.
3. **"Materialise at APPROVE" is a new pattern** (opening_items materialise at draft,
   `0017:3463-3471`) — deliberate, stated. Opening entries can be **withdrawn** after their
   draft-time `opening_items` row exists → every subledger read/backfill joins
   `journal_entries.status='approved'` **[RV]**.
4. **No `autopost_eligible` flag exists** — exclusion is named-skip branches in
   `execute_rule_post` (`0030:680-696`); the exclusion tail-assert lineage went stale after
   0023 **[G]**.
5. **Sighting breeding has no kind filter** (`0035:409-422`) **[V]**; the ADV-2 guard
   (`0035:424-434`) blocks proposals for customers/control accounts but an employee birthed as
   `'vendor'` breeding onto an expense account passes it **[RV]** → WCA-R8.
6. **Counterparty stamping**: one resolved counterparty is stamped on **every** control line of
   both classes, and a NULL-kind entry defaults the birth to `'vendor'` (`0035:222-227`,
   `0035:261-264`) **[RV]** → the §4.3 kind-consistency law + WCA-R9(b) refusals.
7. **Typed kinds do NOT structurally have one control leg**: `_assert_supplier_bill_shape_at`
   admits several payable-class credit legs (`0036:646-661`); only sales enforces exactly one
   (`0022:789-802`) **[RV]** → the per-(entry, domain, counterparty) grain in §3.
8. **`opening_items` signs are bimodal AND the K6 pure-reversal writes negative ar/ap amounts
   directly** (`0017:4127-4135`), bypassing the positive-magnitude refusal; K6
   replacement-reversals get **no** `opening_items` row at all (`0017:4105-4118`) **[RV]**.
9. **`t_jl_immutable` blocks `journal_lines` mutation post-approval** (`0007:1058-1075`) —
   subledger state is new tables only **[G]**.

## 3. The model — signed items, balanced-pair allocations, one identity

**Items** live at the grain **(entry_id, domain, counterparty_id)**: one item per counterparty
per domain per approved entry, `amount_cents` = the **signed control net** of that
counterparty's control-class legs in that domain on that entry (AR: + = the customer owes us;
AP: + = we owe the supplier). Zero net per counterparty ⇒ no item (`amount_cents <> 0`).

**Allocations are balanced pairs.** Every settlement composite materialises the settlement
entry's own **full-gross settlement item** (`−gross`). Applying money to an invoice writes a
zero-net pair: `−X` against the invoice item, `+X` against the settlement item. Unallocation
writes the exact-negation pair (`reverses_allocation_id`, unique — no double-undo).
`apply_open_items` is the same pair mechanics between any two same-domain, same-canonical-
counterparty items. Therefore:

```
Σ allocations ≡ 0        per (client, domain, canonical counterparty)   — by construction
control GL balance = Σ open_items.amount        per (client, domain)    — THE identity
outstanding(item)  = amount + Σ its allocations                          — derived, never stored
```

**No post-approval verb can perturb the identity — mathematically.** `unallocate` and
`apply_open_items` only ever write zero-net pairs; the identity depends only on items, which
are written exactly once per approved entry by the classifier. (v1's one-sided allocations
broke this — the review's converged finding **[RV]**.)

**`item_kind` carries the sign law** (v1's `origin` could not **[RV]**): `invoice` (ar, +) ·
`credit_note` (ar, −) · `bill` (ap, +) · `settlement` (either domain, −) · `adjustment` (any
sign) · `opening` (any sign — K6 negatives exist, §2.8) · `reversal_unwind` (any sign; =
−original). CHECK matrix in DDL + a structural trigger verifying kind ↔ source (the entry's
`coding_kind` / `reversal_of` / `is_opening_balance`). Lineage columns: `opening_item_id`
(nullable — K6 replacement mirrors have none), `reversal_unwind_of` (item lineage),
`created_in_migration boolean` (no `'backfill'` kind — one economic class, one kind).

**Bounds (two-sided, sign-aware)**: for every item, `sign(amount) * (amount + Σ allocations)`
stays in `[0, |amount|]` — no over-allocation past zero AND no inflation past face value.

## 4. The mechanism

### 4.1 Taxonomy (WC-R9 + WCA-R6/R7)

- Widen `ck_je_coding_kind` (+`customer_receipt`, `supplier_payment`; 0015 drop/re-add idiom).
- Two self-guarding shape asserts (`_assert_customer_receipt_shape_at`: exactly one
  receivable-class control leg, CREDIT; zero income legs (F3-3 foreclosure); zero payable
  legs; discount-expense legs OK · `_assert_supplier_payment_shape_at`: exactly one
  payable-class control leg, DEBIT; zero expense legs; zero receivable legs; discount-income
  OK) + thin wrappers + deferred constraint-trigger twins (**AFTER INSERT OR UPDATE** — both
  reviews: an INSERT-approved path must be caught too **[RV]**). Full early-return on
  `reversal_of is not null` (the sales pattern) — the unwind is lineage-keyed.
- **Settlement kinds are creatable ONLY by the §4.9 composites (WCA-R6 as amended by
  WCA-R7)**: `_draft_entry_core`'s allowlist (`0016:4020-4023`) stays invoice-only;
  chatTurn/autoDraft schemas untouched. Above the high-stakes threshold the composite leaves
  a **draft** for the checker (WCA-R7) — still composite-born; no draft verb can make one.

### 4.2 Tables

**`clara.open_items`**: `id · firm_id · client_id · domain ck ('ar','ap') · counterparty_id
not null · entry_id not null · item_kind` (the §3 matrix) `· opening_item_id · 
reversal_unwind_of · item_date not null` (fallback: the entry's `posting_date`; unwind items
land in the current bucket by design) `· due_date date` (null until C-c's producer) `·
amount_cents bigint not null <> 0 · created_in_migration bool · created_by/created_at`.
- `unique (entry_id, domain, counterparty_id)` — the review-corrected grain **[RV]**.
- **Congruence FKs (triple-key house pattern, `0009:797` idiom)**: `(entry_id, firm_id,
  client_id)` → `journal_entries`; `(counterparty_id, firm_id, client_id)` → `counterparties`;
  self-FK for `reversal_unwind_of` with `(id, firm_id, client_id, domain)` unique anchor.
- **Domain↔kind consistency law**: `domain='ar' ⇒ counterparty.kind='customer'`, `domain='ap'
  ⇒ kind='vendor'` — enforced by a validating trigger at insert (a CHECK cannot join;
  counterparty kind is immutable in practice and `merge_counterparties` refuses cross-kind,
  `0015:2279-2282`). Counterparty stored **canonical-at-write** (`_canonical_counterparty`);
  reads must still canonicalise (merges do not repoint history — consistent with
  `journal_lines`) — both stated, neither optional.
- `item_kind` sign-matrix CHECKs; append-only + no-truncate triggers (`0011:1073-1077` idiom);
  `force row level security` + owner policy; **zero wake-role grants**.

**`clara.open_item_allocations`**: `id · firm_id · client_id · domain · item_id · 
application_group uuid · operation_kind ck ('allocate','unallocate','apply') ·
reverses_allocation_id` (unique where not null) `· amount_cents <> 0 · reason ·
created_by/created_at`.
- Congruence FKs: `(item_id, firm_id, client_id, domain)` → `open_items`; append-only; RLS.
- Group law (DDL/belt-2): every `application_group` nets to **exactly zero per (client_id,
  domain)** AND stays within **one canonical counterparty** — a cross-party or cross-domain
  set-off is a GL event and must ride a (refused → split) GL entry, never an application
  (the teeming-and-lading wall **[RV]**).
- No `entry_id` on allocations: the identity never needed it (items carry the entry anchor);
  the pair's settlement side IS the settlement entry's item. `application_group` + audit rows
  carry operator provenance.

### 4.3 Writers — one classifier, four approve paths

**`clara._subledger_classify_entry(p_entry)`** (set-returning, ungranted; the ONLY
decomposition logic — the runtime helper AND the backfill both call it **[RV]**): precedence
ladder, pinned by tail assert:

1. `reversal_of is not null` → **unwind rows**: negate every item of the original entry
   (`item_kind='reversal_unwind'`, `reversal_unwind_of` lineage). Prereq: §4.5's refusal
   guarantees the original's items carry zero net allocations.
2. `is_opening_balance` → `item_kind='opening'` items per (domain, counterparty) from the
   control-leg nets; `opening_item_id` lineage joined FROM `opening_items` where it exists
   (nullable — K6 replacement mirrors have none **[RV]**). `opening_items` is **never an
   independent row source** — entries drive everything; the GL is the tie target.
3. `coding_kind` typed anchors → `bill` / `invoice` / `credit_note` items (control net per
   counterparty; several payable legs net into one item, §2.7).
4. `coding_kind` settlement kinds → the `settlement` item (−gross). (Allocation pairs are the
   composite's own writes, same txn.)
5. `coding_kind is null` + control legs → `adjustment` items per (domain, counterparty)
   (WCA-R2). Zero-net-per-counterparty legs (intra-domain same-party reclass) ⇒ no item —
   stated, and the identity is per DOMAIN, never per account.
6. else → no rows.

**Kind-consistency refusals (WCA-R9b, named CLR)**: a classified item whose counterparty kind
contradicts its domain → refuse at approve, message = "state kind:'customer' in the proposal /
bind the correct counterparty"; a single generic entry with control nets in BOTH domains
(cross-domain contra) → refuse, message = "split via a clearing account, one entry per domain".
Both lanes write **wrong attributions silently today** — refusal with a path is the honest
upgrade.

**`clara._subledger_on_approve(p_entry)`** applies the classifier's rows, emits the typed
events (`open_item.created` / `.unwound`; the composites add `.allocated` / `.unallocated` /
`.applied`) **[RV]**, and is called from **all four paths**:
1. `_approve_entry_core` — CoR #5 (safe rebuild from 0035 text, §2.2), hook after the
   reversal-linkage update (`0035:397`); **never gated on `checked_via_rule_id`** (autopost
   must materialise open items — that is contract item 5, satisfied with zero executor edits).
2. `reverse_entry` — **PATCH** (0017 CLR31 splice preserved): inline branch calls the helper
   after its status flip.
3. `_approve_opening_entry` — recut (dual-grep first): helper call after `0017:3811`.
4. `approve_wrong_client_correction` — **PATCH** (0027 lock-order body): helper call after
   `0027:305`. Also covers the adopted-draft-mirror hole (`0027:276-280`) **[RV]**.

Tail assert: census the live catalog (`pg_proc` where prosrc ~ `status=''approved''` on
`journal_entries`), pin the list of FOUR + helper presence in each — a fifth path cannot
appear unnoticed.

### 4.4 Backfill (WCA-R4 + WCA-R9a)

- **`clara._subledger_decompose_preview(client, domain)`** — read-only set-returning wrapper
  over the classifier, shipped in 0037 AND runnable as plain SELECT text.
- **The mandatory read-only dry-run precheck (WCA-R9a)**: before the ceremony, run the
  preview SQL via `live_ro` across all four firms × both domains against live; every
  client × domain must tie to the sen. **Green diff = GO; anything else = the ceremony does
  not start.** This is how WC-R11's "not first against real books" survives a single shared
  database **[RV]**.
- The migration backfill: same classifier, **entries-driven**, `status='approved'` only,
  deterministic, idempotent via the grain unique. Live probes BEFORE the DDL section runs
  (in-migration asserts + the precheck): no approved control-leg line with NULL
  `counterparty_id`; no kind-contradicting stamps (remediation, if any hit, happens via
  sanctioned verbs before 0037 — the probe list is part of the precheck script) **[RV]**.
- **Tail asserts**: (1) per-entry × domain × counterparty decomposition equality; (2) per
  client × domain, Σ items = the control GL balance to the sen, **summed over every account
  of that `account_class`** (plural accounts are legal); (3) the §4.3 census pin; (4) the
  usual normalized-prosrc pins + whole-schema leak scan (0035/0036 idiom).

### 4.5 Reversal (contract item 8 — resolved)

- **Never copy `coding_kind`/`document_id` onto a mirror.** Unwind keys on `reversal_of`.
- **`reverse_entry` (and the correction verb) REFUSE reversing an entry whose items carry
  non-zero net allocations** — named CLR, message: "unallocate first". Professionally correct
  (an allocated invoice is not reversible in one step anywhere) and it keeps the unwind
  trivially total: unwind items are exact negations; no stranded allocations, no phantom
  outstanding **[RV]**.
- High-stakes reversal mirrors stay drafts and are caught by path 1 when approved; adopted
  mirrors are caught by path 4.
- `uq_je_one_approved_reversal` (`0003:131-132`) + the item grain make double-unwind
  structurally impossible.

### 4.6 The structural F3 belts — TWO, unconditional, no bypass GUC ever

- **Belt-1, `journal_entries`** (deferred constraint trigger, **AFTER INSERT OR UPDATE**,
  WHEN approved **[RV]**): at commit, for every approved entry with control-class legs, the
  per-(domain, counterparty) control nets equal the entry's items exactly (the §4.3 ladder's
  output). Any future fifth approve path that forgets the subledger fails at commit.
- **Belt-2, `open_items` + `open_item_allocations`** (deferred, AFTER INSERT): (a) the
  two-sided per-item bound; (b) the group zero-net + single-canonical-counterparty law; (c)
  kind/domain/tenant congruence beyond the FKs. Allocation-only transactions are re-validated
  at THEIR commit — v1's single belt could not see them **[RV]**.
- Both belts **re-query by id** (the `0009:524-529` idiom — never trust the NEW tuple at
  deferred time); five existing deferred asserts coexist without interaction **[RV]**.
- **Fixture budget** (belt-1 breaks raw-UPDATE approvals in tests **[RV]**):
  `x36-vendor-binding-helpers.mjs:154-157` · `x31-autopost-lane-unify.test.mjs:264-267` ·
  `a21-watch.test.mjs:358-360` · `x35-drafting-trio.test.mjs:244` — each adapted (non-control
  shape or matching items). **No bypass GUC will exist.**

### 4.7 Autopost exclusion (contract item 7) — RULED: A+ (unchanged from v1, + notes)

The `journal_entries` CHECK `ck_je_settlement_not_rule_checked` (durable, caller-independent)
+ the early core refusal CLR10 `settlement_not_autopostable` (after the locked status/revision
checks `0035:197-206`, before any mutation) + **no executor recut** (risk asymmetry; FIX-6
philosophy `0030:1359-1375`; `control_shape` gives incidental cover but is geometry, not law —
the `cn_not_autopostable` precedent). Verified sound by both review lanes (CHECK timing,
NULL-safety, early-placement state **[RV]**). Notes added in v2: the ALTER TABLE ADD
CONSTRAINT takes ACCESS EXCLUSIVE → named in the **D1 write-quiesce** ceremony section
**[RV]**; the "propagates honestly → dead-letter" claim depends on the rule-post rider —
which lands as **its own small PR before 0037** (WCA-R9c), so the claim is true by the time
0037 deploys. Tail asserts per the fork-6 decision record (normalized-text + ordering +
CHECK catalog assert + ACL pins — never token-only).

### 4.8 Sighting-pool gate (minimal) + the WCA-R8 evidence pin

Breeding predicate gains the **NULL-safe** exclusion `(e.coding_kind is null or
e.coding_kind not in ('customer_receipt','supplier_payment'))` **[RV — the NOT IN NULL trap
is documented in-repo, `0022:726`]**. Existing kind-NULL breeding is untouched. The
employee-claim breeding vector (WC-R10(ii)) is **pinned, not fixed** (WCA-R8): the x37 cell
runs three claims and asserts the `vendor_account` proposal row EXISTS, labelled as the §5.3
debt's live evidence (the human signature gate is the standing defense; wholesale pool
segregation stays a later wave).

### 4.9 The composites

- **`allocate_receipt` / `allocate_payment`** (human verbs, bookkeeper floor): validate the
  allocation set against outstanding **under locks**, create the settlement entry (memo always
  — `ck_je_basis`), then:
  - below the high-stakes threshold → approve via the core in the same call; the hook
    materialises the settlement item; the composite writes the allocation pairs + events —
    ONE transaction;
  - at/above threshold (**WCA-R7**) → leave the entry as a **draft** carrying the validated
    allocation proposal (entry flags); the checker approves via ordinary `approve_entry`
    (/queue muscle memory, CLR05 law untouched); the hook re-validates outstanding at approve
    and materialises everything — stale outstanding ⇒ named CLR refusal, maker re-runs.
    Solo firms ride the CLR05 self-attestation path (composite takes `p_attestation`).
- **`unallocate`**: exact-negation pairs, `reverses_allocation_id` + unique, reason required.
- **`apply_open_items`** (WCA-R3): pair mechanics between existing items — same domain, same
  canonical counterparty, group nets zero per (client, domain); cross-anything → named
  refusal pointing at the GL route.
- **The credit-note wall (contract §3 discharge)**: `allocate_payment` refuses allocating
  against an item whose entry's document classifier kind is `credit_note` (named reason:
  fix the mis-code first). Residual exposure recorded: a mis-coded CN *as* a bill still
  mints a payable item until `supplier_credit_note` lands — the refusal converts the §3 trap
  from "a path to real cash" back into a visible coding error **[RV]**.
- **Locks (total order extended)**: op-receipt → `coding_rules` → `document_filings` →
  `journal_entries` → **`open_items` (batch: `FOR UPDATE ... ORDER BY id`) → groups**;
  `unallocate`/`apply_open_items` also take the client advisory lock
  (`pg_advisory_xact_lock(203005004, ...)`) so they serialize against composite approves —
  the write-skew race both reviews found **[RV]**. The order doc + a catalog test pin it.
- **Op-keys**: each composite reserves its own key over the **hash of the full normalized
  request** (`0004:43-60` semantics — a rolled-back reservation vanishes, retries re-execute
  cleanly **[RV]**); the approve step gets a derived sub-key with `receipt_preheld:true`
  (the `0030:1368` idiom) so a later human `approve_entry` replay cannot collide.
- **Events**: `open_item.created/.allocated/.unallocated/.applied/.unwound` appended in-txn,
  deterministic order; an aborted composite rolls back its events with everything else
  (outbox law) **[RV]**.
- **CLR26 named consequence**: settlements inherit the open-question block
  (`0035:290-296`) — a blocking client-scope question blocks money movement too. Intended;
  named here; acceptance cell pins it **[RV]**.

### 4.10 The two runtime additions (ruled) — and the rider's new home

- **`reconcile_sweep_runs` guard**: PATCH via `pg_get_functiondef`; **the splice anchor is the
  0017-spliced text** (`0017:473-480` — the live body; 0011's three-line form no longer
  exists **[RV]**), two-sided probes (assert the 0017 marker BEFORE, the new predicate
  AFTER). One predicate: `and exists(select 1 from clara.coding_attempts ca where
  ca.task_id=t.id)`. Test: a recovered filing completes ONLY tasks that drafted; first
  regression net for the `already_done` wedge chain (`0036:1247-1256`).
- **`admissionNeedsStart` recognises `re_admitted`** (`autodraft.mjs:45-50`) + the consumer
  enumeration gains `re_admitted` → true; `already_done`, `skipped_direction` → false.
- **The rule-post dead-letter rider** (`rule-post.mjs:48-55` SET ROLE in finally masks the
  original error in an aborted txn; mock never exercises it) → **its own small PR, landing
  BEFORE the 0037 PR** (WCA-R9c), with the test that the ORIGINAL error reaches the
  dead-letter row. §4.7's honesty claim depends on it; recorded as a contract addendum at
  the wave ADR.

## 5. Acceptance (WC-R11)

Rig from zero → labelled synthetic in Rome → the read-only live dry-run precheck (all four
firms) → ceremony → one real BELCORT month. Cells (`packages/db/tests/
x37-wave-c-a-subledger.test.mjs`, single file, header-prose-then-cells):
- RM100-three-ways (company card → no item · employee claim → **no `domain='ap'` item** on a
  non-`payable`-class liability created via `add_coa_account` in setup (no template row
  exists) · director-paid → director current account, same assertion form) **[RV]**;
- partial settlement · batch receipt over N invoices · credit-note application · over-payment
  residue (= the settlement item's outstanding) · unallocate → re-allocate · zero-GL apply ·
  the two-sided bound (over-allocation AND inflation) · same-party-only + zero-net group
  refusals · concurrent allocation race (locks hold);
- reversal: unsettled invoice → clean unwind · settled invoice → **refused** until
  unallocated · receipt with allocations → refused · high-stakes draft mirror → approved
  later, hook fires · **wrong-client correction of an open-itemed bill → mirror unwind, ties**;
- the identity from zero and after EVERY cell (Σ items = control, per client × domain,
  every account of the class);
- the A+ belt (CHECK refuses a rule-stamped settlement row; core refusal named; no draft
  verb can make a settlement kind) + authority catalog cells (core private ACL; wrapper
  passes no rule id; executor login-direct);
- high-stakes threshold cell: settlement at exactly the threshold in a 2-checker firm goes
  draft → distinct checker approves → ties (WCA-R7);
- WCA-R8 evidence pin (three employee claims → proposal row exists, labelled);
- outbox rollback (failed composite leaves zero events/items/allocations);
- CLR26 pin · sweep-guard + `re_admitted` cells · the four adapted fixtures stay green;
- backfill: rig-seeded book incl. opening (with a K6 supersede + a withdrawn opening draft),
  reversal pairs, multi-counterparty generic JVs → decomposes, ties, idempotent on re-run.

## 6. The C-a rulings (all closed 2026-07-30)

| # | Ruling | Decider |
|---|---|---|
| **WCA-R1** | One `open_items` table (+`domain`) + one allocations table; signed amounts; sign law in DDL via the `item_kind` matrix. *(v2: grain = (entry, domain, counterparty); balanced-pair allocations — review-hardened, semantics unchanged.)* | Owner (grilling Q1) |
| **WCA-R2** | Generic control-touching entries auto-materialise `adjustment` items. *(v2: + two named refusals per WCA-R9b — cross-domain contra; kind-contradiction.)* | Owner (grilling Q2) |
| **WCA-R3** | `apply_open_items` ships in C-a; groups net to exactly zero **per (client, domain)**, single canonical counterparty. | Owner (grilling Q3) |
| **WCA-R4** | Backfill = in-migration one-shot + hard sen-exact tail assert. *(v2: + the mandatory read-only live dry-run precheck, WCA-R9a.)* | Owner (grilling Q4) |
| **WCA-R5** | `account_class` stays binary; debt §5.1 stands. | Owner (grilling Q5) |
| **WCA-R6** | Settlement-autopost belt = A+ (CHECK + early core refusal + no executor recut). *(Amended by WCA-R7: settlement kinds are creatable ONLY by the composites — "no drafts" became "no drafts except composite-born maker-checker drafts".)* | Owner-delegated → orchestrator + Codex |
| **WCA-R7** | High-stakes settlements: the composite leaves a draft + stored allocation proposal; the checker approves via `approve_entry` (/queue); hook re-validates at approve. Solo firms attest. | Owner (post-review Q1) |
| **WCA-R8** | The employee-claim breeding vector is **pinned as evidence**, not fixed; §5.3 wholesale segregation stays a later wave; the human signature gate is the standing defense. | Owner (post-review Q2) |
| **WCA-R9** | (a) the read-only dry-run precheck is mandatory before the ceremony; (b) the two WCA-R2 named refusals; (c) the rule-post rider = its own small PR, landing first. | Owner (post-review Q3) |

## 7. Boundaries + named intervals

No `_coding_lane_core` widening · no duplicate-guard extension — **named interval: between
C-a and C-b nothing but op-key dedupe and the two-sided bound stops the same real-world
receipt being recorded twice (duplicate on-account credits possible); bank-line exclusivity
(C-b) is the settlement duplicate control** **[RV]** · no `sales_invoice`/DN split · no
generic transaction schema · no multi-currency (WC-R5) · no bank tables (C-b) · no
aging/statement reads (C-c; `due_date` producer is C-c's, recorded) · no `employee`
counterparty kind (WC-R10) · pool segregation beyond §4.8 stays debt §5.3 (WCA-R8 pin is its
evidence) · `supplier_credit_note` stays future-additive; the §4.9 credit-note wall is C-a's
answer to contract §3's direct instruction.
