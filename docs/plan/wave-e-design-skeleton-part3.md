# WAVE E — DESIGN SKELETON v2 · **PART 3** (§2.11–§6)

> **CONTINUATION of `wave-e-design-skeleton.md` + `-part2.md` — one document in three files** (the
> repo's 500-line file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split precedent). Part 1
> carries §0 (verification ledger + three corrections) · §1 (campaign frame, lanes, ceremony) ·
> §2.1–§2.4 (period spine, gate catalog, drawers 1–2). Part 2 carries §2.5–§2.10 (drawer 3 + the
> closed-period wall and its permit, continuity, receipts, reopen, E-R6 activation, the E-R11 keys).
> **This file carries §2.11–§2.12 (lane γ — month snapshots, staleness, the period registry) · §3
> (the E-R12 trio, lane α) · §4 (lane θ) · §5 (E-b/E-c pointers) · §6 (open questions + decisions).**
> Section numbers are continuous across the three files; citations like "skeleton §2.11" and
> "skeleton §3.1" resolve here, "skeleton §2.9" in part 2. **THE PACKET IS SIX FILES**; the other
> three: `wave-e-design-reporting.md` (§0–§5), `wave-e-design-reporting-part2.md` (§6–§12),
> `wave-e-acceptance-matrix.md`. Part 1's status banners, markers and evidence discipline apply
> unchanged: the contract wins; EXISTS claims carry `file:line` reads taken **2026-08-09 at the v2
> fix pass**; migration numbers and `CLRnn` codes claim at MERGE.

### 2.11 Month snapshots + staleness *(lane γ — ruled, E-R3)*

**Months never lock.** A month gets an artifact; books stay open.

- **`clara.period_snapshots`** — `id · firm_id · client_id · reporting_period_id (FK → §2.12) ·
  period_start · period_end · kind ('management_accounts') · minted_by · minted_at · books_watermark
  text not null · dataset_sha256 text not null · payload jsonb not null`. **Bytes immutable**: an
  update trigger permits no change to `payload`, `dataset_sha256` or the range (the `0040:351` compare
  shape); no delete.
- **`clara.snapshot_assessments`** — **append-only**: `id · snapshot_id · assessment
  ('current','stale') · reason · caused_by_entry_id · caused_by_table text · caused_by_effect_date
  date · assessed_at · assessed_by`, with `index (snapshot_id, assessed_at desc)`. Current state is the
  latest row, read through `clara.snapshot_state(p_snapshot)`. **Duplicate `stale` rows are EXPECTED,
  not a defect:** two concurrent mutations can each read "not yet stale" and both insert. On an
  append-only table whose reader takes the latest row that is harmless, and saying so here stops a
  later reviewer "fixing" it with a unique index that would deadlock the writers.

**The mechanism: triggers, in the same transaction, by construction** *(builder choice).* Row triggers
on `clara.journal_entries`, **`clara.open_item_allocations`**, the FA register rows,
`clara.bank_reconciliations`, **`clara.bank_statements`** and **`clara.bank_line_exceptions`** insert a
`stale` assessment for every not-yet-stale snapshot of that client that the mutation's effect
**intersects**. Because the trigger is part of the mutating statement there is **no asynchronous
window** — Invariant-4 discipline, satisfied structurally. *(The trigger set and §2.5(B)'s wall set are
deliberately the SAME table list: one is "mark what this moved", the other is "do not move it while a
close measures it", and a table on one list but not the other is the shape of both defects.)*

- **The predicate is INTERSECTS + a watermark, not date containment** *(the v1 narrowing, corrected).*
  E-R3 rules staleness for "any audited mutation whose effect **intersects** an already-snapshotted
  period … anything that moves a number the snapshot presented" (`wave-e-contract.md:79-85`). A
  posting into month M−1 moves month M's opening, YTD and comparative figures without its
  `posting_date` falling inside M. So the test is: mark stale when the mutation's **effect date ≤
  `period_end`** and the mutation is **not already inside the snapshot's `books_watermark`**. Effect
  date = `posting_date` for JE rows, `effective_date` for allocation rows (producer law
  `0040:864-877`), the register act date for FA rows, and — per the reads taken this round — the
  governing bank **statement's `period_end`** for statement, reconciliation and exception rows.
- **`open_item_allocations` is the table v1 missed, and it is the one that moves aging with no JE at
  all.** `clara.apply_open_items` (`0037:3225`; live body = 0037 base spliced by 0040 S4.9 and again
  by 0042 S5.22) inserts **only** into `open_item_allocations` (`0037:3384-3389` → live
  `0040:6206-6213` → `0042:4896-4903`), and `clara.unallocate_group` (`0037:3141`) inserts only
  negation rows there (`0037:3190-3197`). Both move every AR/AP aging figure a management pack
  presents, because `_aging_core` (`0040:3937-3987`) reads allocations through
  `_subledger_outstanding_asof` (`0040:3203-3208`, `effective_date <= p_as_of`) at `0040:3942`. v1's
  row 11 pointed those writers at an `open_items` trigger, which could never fire for them:
  `open_items` is append-only by trigger (`0037:824-825`), so no update/delete reaches it, and the
  amendments never insert there.

**The writer set — a REVIEW instrument, and (per §2.5(B)) an ASSERTED one.** E-R3 names the class; the
list below lets a reviewer check each named writer's effect path against a trigger, and the migration
tail asserts from the live catalog that every table named in the "Covered by" column actually carries
the trigger claimed. It is deliberately not the enforcement — enumeration is what this repo has proven
it gets wrong (§2.5(C)) — but an unchecked enumeration is worse than a checked one.

| # | Writer | Effect path | Covered by |
|---|---|---|---|
| 1 | `approve_entry` (`0004:542` CoR chain) | status → approved | JE trigger |
| 2 | `reverse_entry` | mints the mirror **and** stamps `reversed_by` on the original | JE trigger, both branches |
| 3 | `allocate_receipt` / `allocate_payment` (`0044_wave_d_b3_af2_composite.sql:1642-1674`) | book entries **and** allocation rows | JE + allocation triggers |
| 4 | the composite bank paths (cores called at `0044:1927`, `:1946`) | book entries | JE trigger |
| 5 | recurring-adjustment occurrences + auto-reversals (0045, `auto_reversal_of`) | book entries | JE trigger |
| 6 | the depreciation belt (0041/0042 authorities) | book entries | JE trigger |
| 7 | the closing-stock adjustment (WD-R11) | books an entry | JE trigger |
| 8 | `approve_wrong_client_correction` (live body via `pg_get_functiondef`, §0.3) | reverses and re-books **across two clients** | JE trigger, per row, so both clients' snapshots mark |
| 9 | the opening machinery (`approve_opening_seed` `0017:3825`, `supersede_opening_item` `0017:4047`) | books opening entries | JE trigger |
| 10 | `finalize_close` (§2.6) | the closing entry | JE trigger (correctly: a close makes every prior month's pack stale) |
| 11 | **`apply_open_items` (`0037:3225`) / `unallocate_group` (`0037:3141`)** | `open_item_allocations` rows ONLY — zero GL | **`open_item_allocations` trigger** *(the v1 defect)* |
| 12 | FA particulars/enrolment (`complete_fixed_asset_particulars` `0041:3035`, `revise_fixed_asset_particulars` `0041:3112`) | `clara.fixed_assets` rows — UPDATE at `0041:3086`, INSERT at `0041:3209` | FA trigger |
| 13 | **`void_bank_statement` (`0038:2211`)** | **`clara.bank_statements`** — `update … set status='void'` at **`0038:2270-2272`**; the statement's LINES are row-locked (`0038:2254-2255`) but not written | **`bank_statements` trigger** *(the v1 defect: row 13 named the `bank_reconciliations` trigger, which this verb never touches)* |
| 14 | `complete_bank_reconciliation` (`0040:1587`, insert `0040:1963`) / `void_bank_reconciliation` (`0040:2057`, update `0040:2119`) | `bank_reconciliations` rows | `bank_reconciliations` trigger |
| 15 | **`except_bank_line` (`0040:3222`) / `resolve_bank_line_exception` (`0040:3372`)** | **`clara.bank_line_exceptions`** — INSERT at `0040:3320-3325`, UPDATEs at `0040:3550-3555` and `:3558-3563` | **`bank_line_exceptions` trigger** *(newly covered — see the boundary note)* |

**The honest boundary, stated rather than papered over — and it SHRANK this round.** Two classes still
mint no staleness row: (a) a fact none of these tables owns (a counterparty rename, a chart relabel);
(b) anything a future writer adds. Both are caught only by **`clara.verify_snapshot(p_snapshot)`**,
which recomputes the dataset and diffs `dataset_sha256` against the stored one. That is a real limit
and it belongs in the acceptance matrix as a named negative case — `verify_snapshot` gets its own cell
— not in a footnote. *(v2 listed the bank exception doors as a third uncovered class on the strength
of an UNREAD body. The bodies were read this round; they write `clara.bank_line_exceptions`, that
table now carries a trigger, and the class is gone. The lesson is the packet's own: an "honest
boundary" resting on an unread body is a guess wearing honesty's clothes.)*

**Per-writer act-dating disposition (E-R2's "no writer escapes" for the non-JE money movers).** §2.5's
JE wall sits on `journal_entries`/`journal_lines` and §2.5(B)'s siblings sit on the gate-evidence
tables; the table below states, for each money- or figure-moving writer that touches no JE, what its
date anchor is and how it is contained. **Every row is now READ — the two UNREAD rows v2 shipped are
discharged below with their effect tables.**

| Writer | Date anchor | Proving line | Containment |
|---|---|---|---|
| `apply_open_items` | the ACT date, `clara._book_today()` | splice `0042:4896-4903`; producer law `0040:864-877`; header `0040:6148-6160` | no JE ⇒ outside the JE wall; **§2.5(B) serializes it** and the allocation trigger marks staleness; forward-dating bounded by §3.1's new guard |
| `unallocate_group` | the ACT date (`created_at::date`), with the R9 `greatest()` ordering guard | producer law `0040:864-877`; `0037:3190-3197` | same |
| `allocate_receipt` / `allocate_payment` | the settlement entry's `posting_date` | comment `0044:1262-1263`; wall `0044:1266-1272` | JE-bearing ⇒ **JE-wall-covered**; the unborn-item wall already refuses backdating |
| **`except_bank_line`** (`0040:3222`) · **`resolve_bank_line_exception`** (`0040:3372`) | **READ THIS ROUND: neither takes a date argument.** The act clocks are `bank_line_exceptions.created_at` / `.resolved_at` (`0040:436`, `:438`, both `now()`); the **effect** date is the governing statement's `period_end`, reached through the trigger-stamped `statement_id` (`0040:429`) | bodies read at `0040:3222-3345` (insert `:3320-3325`) and `0040:3372-3565` (updates `:3550-3555`, `:3558-3563`); both take `203005004` then `203005006` first (`0040:3261-3262`, `:3426-3427`) | effect table `clara.bank_line_exceptions` now carries BOTH the §2.5(B) wall trigger and the staleness trigger; the exception moves `excepted_cents` in the drawer-1 bank identity (`0040:291`), which is why it had to be covered |
| **`void_bank_statement`** (`0038:2211`) | **READ THIS ROUND: no date argument.** Act clock `voided_at = now()` (`0038:2271`); the **effect** date is the statement's own `period_end` (`0038:381`), which is the period whose presented bank position the void moves | body read at `0038:2211-2288`; the effect UPDATE is `0038:2270-2272` on **`clara.bank_statements`** — *not* `bank_reconciliations`, which v2's row 13 wrongly credited; the verb's own header records that it "touches neither journal_entries nor open_items" (`0038:2205-2206`) | effect table `clara.bank_statements` now carries BOTH triggers |
| FA particulars (`0041:3035`, `:3112`) | register act date | bodies at those lines; effects `0041:3086` / `:3209` | `clara.fixed_assets` carries both triggers; a particulars edit moves no GL |

**RS is the witness** (E-R9): snapshot a month, post into it, watch the label. Note for the matrix
author — E-R9's "19 approved real invoices" is **stale** as of ADR-066; **verify the live count before
citing it, and cite no number here**.

### 2.12 `clara.reporting_periods` — the period registry *(lane γ; the E-b build dependency)*

E-b binds its cells' periods and `days_in_period` to "the E-a period row". `fiscal_years` is an FY, and
`period_snapshots` is an artifact; neither is a month/quarter period with an id. γ therefore mints the
registry, and δ **build-depends** on it (§1's lane table). **The DDL is stated in full, because a
registry with loose bounds makes `$P-1` and `days_in_period` semantically wrong while every row still
looks valid** *(the round-2 finding; ruled into the design here)*:

```
clara.reporting_periods
  id uuid pk · firm_id uuid not null references clara.firms(id)
  client_id uuid not null
  grain text not null check (grain in ('month','fiscal_year'))
  period_start date not null · period_end date not null      -- both ends INCLUSIVE
  fiscal_year_id uuid · minted_by uuid not null references clara.users(id)
  minted_at timestamptz not null default now()
  -- client-in-firm is STRUCTURAL, the 0007:59 composite-FK idiom, not a verb-only check
  constraint fk_rp_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id)
  -- an fy-grain row must BE a fiscal year of this client, by composite FK to §2.1's uq_fy_id_firm
  constraint fk_rp_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years(id, firm_id)
  constraint ck_rp_fy_present check ((grain = 'fiscal_year') = (fiscal_year_id is not null))
  constraint ck_rp_range check (period_end >= period_start)
  -- GRAIN CONGRUENCE: a 'month' row IS a calendar month, not an arbitrary range wearing the label
  constraint ck_rp_month_bounds check (grain <> 'month' or (
       period_start = date_trunc('month', period_start)::date
   and period_end   = (date_trunc('month', period_start) + interval '1 month - 1 day')::date))
  unique (client_id, grain, period_start, period_end)
  unique (client_id, grain, period_start)          -- kills same-start overlapping rows
  index ix_rp_client_grain_start on (client_id, grain, period_start)
```

- **Forced RLS and the OWNER policy pair, not just the human half** — `alter table … force row level
  security`, `p_rp_owner … to clara_fn_owner using(true) with check(true)`, plus the `for select to
  clara_authenticated using (firm_id = clara.jwt_firm())` half (`0037:843-848`'s shape). §2.1's
  reasoning applies verbatim: `clara_fn_owner` is not BYPASSRLS (`0002:10-12`), so a definer evaluator
  reading this table without the owner policy sees zero periods and every metric resolves `absent`.
- **The fiscal-year congruence CHECK the composite FK cannot express** — an `fy`-grain row's
  `(period_start, period_end)` must equal the referenced FY's `(starts_on, ends_on)`. A CHECK cannot
  read another table, so this is a `before insert` trigger in §2.1's contiguity-trigger idiom, and it
  is judgement logic with its own cell.
- **Month rows cannot overlap, and the second unique index is why.** `unique (client_id, grain,
  period_start, period_end)` alone permits two month rows with the same start and different ends,
  which would make `$P-1` ambiguous a second way; `unique (client_id, grain, period_start)` plus
  `ck_rp_month_bounds` makes a client's month rows a partition of the calendar by construction, with
  no `btree_gist` dependency (§2.1's reasoning for avoiding the extension holds here too).
- `days_in_period(p_period)` = `period_end - period_start + 1`, read from this row — one definition,
  one place, no evaluator-local arithmetic.
- **`$P-1` resolves by CALENDAR ARITHMETIC on the grain, never by "the prior row"** *(reporting §2.1
  carries the consumer half; this is the producer half)*. The prior period of a month row is the
  calendar-prior month; of an fy row, the FY whose `ends_on` is `starts_on - 1`. **A missing prior
  period resolves `absent` per reporting §5.3 — never the nearest earlier row.** "Prior row" would
  make a client who snapshotted January and March read March's comparative against JANUARY and produce
  a correct-looking growth figure against the wrong base.
- Rows are minted by the same audited door that mints a snapshot (and by `open_fiscal_year` for the
  `fiscal_year` grain), so a period id always has an author. The evaluator **may mint a missing month
  row on demand** where the period is derivable and complete (a calendar month wholly inside the
  client's books), recording itself as `minted_by`; it may never mint a partial or straddling one
  *(builder choice — it makes dense month coverage cheap without turning a snapshot into a
  side-effecting act, and the alternative, refusing every un-snapshotted comparative, would make
  `$P-1` unusable before the second snapshot)*. Immutable after mint; no delete.
- Reads are granted to `clara_authenticated` and `clara_agent_ro`; no wake or runtime write grant.
- **δ binds to this table through a JUNCTION, not an array** — `clara.metric_cell_periods(cell_id,
  period_id, ordinal)` with real FKs on both sides (reporting §4.3). A `period_ids uuid[]` column
  cannot carry a foreign key, so nothing would stop a cell citing a period id that does not exist.

## 3. E-R12 — the client-facts trio *(lane α)*

### 3.1 F-1 — VERIFY FIRST on the allocation wall; ONE small guard on `apply_open_items`

**Verdict, part 1: E-R12(1) is DISCHARGED BY EXISTING CODE on `allocate_payment` / `allocate_receipt`.**
The reads that establish it (each a quote, not a paraphrase):

1. **The predicate exists on both sides, byte-identical** — `0044:1266-1272` (receipt) and `:1557-1563`
   (payment): `if i.item_date is not null and p_posting_date < i.item_date then raise exception … using
   errcode='CLR10', detail=jsonb_build_object('reason','allocation_to_unborn_item', …)`.
2. **`p_posting_date` IS the allocation's effective date — stated by the code.** The wall's own comment
   (`0044:1260-1265`, verbatim again at `:1551-1556`) reads: *"the buckets are item_date-driven while
   **this allocation is effective-dated at the settlement's posting date**."* E-R12's phrase and the
   live predicate are therefore **the same test**.
3. **The public wrappers forward it unchanged** — `clara.allocate_receipt` (`0044:1642-1657`) and
   `clara.allocate_payment` (`0044:1659-1674`) take `p_posting_date` third and pass it positionally
   into the `_core` with no transformation.
4. **RPR's two documented scars** (as-of 2025-08-31 and 2025-09-30, self-healing at as-of ≥
   2026-08-01, E-R12(1)) are **stored data predating the wall (0041), not a live gap** — the wall
   operates at call time and never retro-touches rows.

**Verdict, part 2: `clara.apply_open_items` needs its OWN guard — the v1 "structurally immune" claim
overstated the code by one conjunct** *(the one genuinely open F-1 sub-question, now closed; both
round-1 review lanes reached the same answer independently).*

- **It is act-dated, and the proof is positive** — but not at `0037:3225`'s file text. `0040` S4.9
  (`0040:6148-6216`) harvests the live body and splices `effective_date = current_date` into both
  inserts (`0040:6206-6213`); `0042` S5.22 (`0042:4809-4915`) re-splices it to `clara._book_today()`
  (`0042:4896-4903`; `_book_today` created `0042:4592`). The producer law is written down at
  `0040:864-877`: *"`operation_kind='apply'` writes the row's own `created_at::date`: `apply_open_items`
  is the ONE allocation writer with no GL entry to anchor on … an application dates itself by the
  ACT."* ⇒ **§3.1's table row and §6 item 1 must read the body via `pg_get_functiondef`, never at
  `0037:3225`.**
- **The missing conjunct.** The immunity argument needs the act date to be on or after **both** items'
  `item_date`. Nothing enforces that: the body loads `si`/`ti` at `0037:3314-3315` (`:3313` is the
  self-reference guard's `end if;` — v2 was off by one) and proceeds through
  self-reference, reversal-lineage, outstanding-sign and outstanding-bound refusals to the two inserts
  at `0037:3384-3389` — and a scan of the whole ladder `0037:3296-3392` for `item_date`,
  `current_date` or `_book_today` returns **zero** hits (the date stamps arrive only via the 0040/0042
  splices, outside the refusal set). Future-dated facts are demonstrably
  reachable in this schema — `0043_wave_d_b1_staff_advances.sql:2814-2831` is a whole GUARD II written
  because "a FUTURE-DATED original produced an unwind that lands BEFORE its own fact".
  Aging admits items at `item_date <= as_of` (`0040:3944-3946`) and allocations at `effective_date <=
  as_of` (`0040:3203-3208`), so with a future-dated source the target carries its `−amt` allocation
  while the source item is out of aging scope — and the zero-GL control account has not moved.
  Σ buckets ≠ control: the F-1 defect class, reached from the source side.
- **The guard** *(lane α; ruled by E-R12(1)'s "REFUSE outright, no override", mechanism a builder
  choice)*: inside the per-pair loop, refuse when `clara._book_today() < greatest(si.item_date,
  ti.item_date)` with `errcode='CLR10'`, `reason='apply_before_item_date'`, in the standing message +
  reason-token shape. **Not** the R9 guard: `0040:6165-6169` explains that R9's `greatest()` exists for
  a NEGATION row sorting before the allocation it negates and correctly says apply_open_items has "no
  antecedent allocation to take a greatest() against" — a different hazard from this one, and naming
  the difference stops a reviewer reading that paragraph as a refutation.
- **Lane α is therefore tests + ONE small guard + the door**, and it carries a D1 window (§1.1).

**What the lane must build.**

| Item | Why it is not optional |
|---|---|
| **A positive caller census, from the live catalog** | the wall lives in `_allocate_*_core`, so any caller inherits it. Enumerate callers from `pg_proc.prosrc` (not file text) and assert the set — 0044 already maintains a name-pinned census at `:5425-5426` / `:5500-5501`; extend it. |
| **Re-read `open_items.item_date NOT NULL`** (`0037:738`) as a build-time assertion | the predicate short-circuits on NULL; if the column is ever relaxed the wall opens **silently**. Assert the constraint, do not assume it. |
| **The `apply_open_items` guard above**, spliced PATCHED-NOT-REBUILT via `pg_get_functiondef` | the live body is three generations past its file text (above); a from-file rebuild would revert 0040's and 0042's splices. |
| **A negative battery** | (a) one day before `item_date` ⇒ `CLR10` / `allocation_to_unborn_item`, message and reason quoted verbatim; (b) **same day ⇒ PASS** (the boundary is `<`, not `<=`); (c) through each public wrapper **and** the composite preheld path (`0044:1927`, `:1946`); (d) under `clara_agent_ro` ⇒ `42501` before the body runs; (e) the new apply guard: future-dated source ⇒ refuse, same-day ⇒ pass. |
| **A field read, not only a battery** | ADR-066's lesson: a zero-count refusal head is a question to open, never a wall to bank. Attempt a genuine RPR-shaped allocation at an as-of **before** 2026-08-01 and record the refusal. A refusal is the PASS. |
| **A ratification record** | one section in `wave-e-acceptance-matrix.md` stating that E-R12(1) was discharged by verification **plus one guard**, citing these lines — so no future session re-builds it. |

### 3.2 `entity_type` + MSIC — ONE capture door, one facts table

**A facts table, not columns on `clara.clients`** *(builder choice — a column carries the value but not
the who/basis/when ADR-062 requires verbatim, and each future fact would need its own column plus its
own door; a facts table makes the door generic and keeps `clara.clients` a registry).*

```
clara.client_facts
  id uuid pk · firm_id · client_id
  fact_key text not null            -- 'entity_type' | 'msic' | … (validated against a catalog)
  fact_value jsonb not null
  basis text not null               -- WHO/BASIS/WHEN: the free-text justification (non-empty)
  basis_kind text not null check (basis_kind in
    ('owner_instruction','document','registry_lookup','interview_carryover'))
  source_document_id uuid           -- required when basis_kind = 'document'
  validated_against text not null   -- e.g. 'enum:ENTITY_TYPES_V2' | 'format_only'
  recorded_by uuid not null references clara.users(id) · recorded_at timestamptz not null default now()
  superseded_by uuid references clara.client_facts(id) · superseded_at timestamptz
  unique index uq_client_fact_live (client_id, fact_key) where superseded_at is null
```

**`clara.record_client_fact(p_client, p_fact_key, p_fact_value, p_basis, p_basis_kind,
p_source_document_id, p_op_key)`** — the named audited door E-R12(3) requires.

- Floor `role_rank('admin')` *(builder choice — a client fact drives coding and statutory presentation;
  above bookkeeper, below a signing key).* Client-in-firm check ⇒ `CLR11`.
- `p_basis` empty ⇒ `CLR10 fact_basis_missing`. Unknown key ⇒ `CLR10 fact_key_unknown`. Value failing
  the key's catalog rule ⇒ `CLR10 fact_value_invalid`.
- **Supersession, never update** — a new row stamps `superseded_by/superseded_at` on the prior. The
  reverse-not-delete culture applied to reference data; it gets its own matrix cell (supersede, then
  prove the live view returns exactly one row and the prior is readable).
- `_reserve_op` → `_audit` → `_finish_op`, exactly as every sanctioned mutator does (`0044:1337-1342`
  is the canonical `_audit` payload shape).
- **Key catalog** `clara.client_fact_keys` (code-populated): `entity_type` validates against the
  interview's own enum — `["sdn_bhd","bhd","sole_prop","partnership","llp","society","cooperative",
  "other"]` (`packages/runtime/workflows/interview.v2.frameworks.ts:50-52`) — and `msic` validates
  **format only** (5 digits). **No MSIC registry table exists** in any migration (searched
  case-insensitively across all 54); the row records `validated_against='format_only'` and the product
  never claims the code was checked against an official list.
- **Why the door and not the interview path:** `clara.commit_client_onboarding` (`0017:2777-2779`)
  refuses with `CLR10` once `cl.status <> 'onboarding'`, and no verb re-opens an active client — the
  exact wall ADR-062 names.
- **Why one door serves both facts:** `entity_type` and `msic` differ only in their catalog rule; two
  doors would mean two audit shapes for the same act.

**Backfill.** `entity_type` is `requiredForCommit: true` on the client interview
(`packages/runtime/workflows/interview.v2.questions.ts:77`), so every committed client plan carries an
answer. The lane backfills `client_facts` from the latest **committed** plan's answered/resolved item
with `basis_kind='interview_carryover'` and `basis` naming the plan id — a real provenance, not a
synthesized one. MSIC is the sparse fact; the three parked codes enter through the door itself.

**The three parked codes** (E-R12(3)): **RPR 68109 · RS 82110 · BEE 74101**, each with
`basis_kind='owner_instruction'` and a `basis` citing the owner's instruction and date, recorded in the
ceremony/acceptance step and quoted verbatim in the acceptance record. *Note for reviewers: the
ENRICHMENT TRAP does not reach this. It forbids enriching RS's name-only **customers** with
registrations or TINs; an MSIC code is the **client's own** industry classification and touches no
counterparty row.*

### 3.3 The context-pack splice — PATCHED, NOT REBUILT

The pack is built entirely in `clara.get_context_pack(uuid, text)`; the runtime passes the whole object
through unfiltered (`packages/runtime/workflows/autoDraft.v7.tools.ts:437-449`), so **surfacing
`entity_type` needs no runtime edit at all.**

The live client object is 0036's msic-augmented literal, **constructed by `||` concatenation at
`0036_wave_c0_deferred_belts.sql:1559-1566`** — *not* the `v_anchor` string declared at `0036:1554`,
which is the PRE-0036 anchor and no longer appears in the live body. 0036's own header states the law,
**"PATCHED, NOT REBUILT"** (`0036:1511-1516`): harvest via `pg_get_functiondef`, `replace()`, never
retype, because 0017/0018/0019 each rewrote the live body and a from-file rebuild would silently revert
them.

Lane α's splice, mirroring 0036's own prestate discipline:

1. Prestate: harvest the live definition; assert **the constructed msic literal of `0036:1559-1566`**
   (not `v_anchor`) appears exactly once, counted with 0036's own idiom
   (`(length(v_def)-length(replace(v_def,<lit>,'')))/length(<lit>)<>1`, `0036:1555`); assert
   `'entity_type'` is not already present. *(A builder reusing `v_anchor` verbatim finds ZERO
   occurrences — v1 did not say which string to count.)*
2. Replace the client object so it carries **both** keys, and so **both** read
   `coalesce(<live client_facts row>, <latest committed plan item>)` — the captured fact wins, the
   interview answer is the fallback. *(builder choice — an MSIC door that writes a table the pack does
   not read would be a door onto a wall; and coalescing avoids recutting `commit_client_onboarding`, an
   audited writer, purely to keep two stores in step.)*
3. Post-assert both keys installed, or RAISE. `SECURITY DEFINER` survives `CREATE OR REPLACE`; the
   definer-owned body already reads `onboarding_plan*` without extra grants (`0036:1504-1509`), and
   `client_facts` is definer-readable on the same basis.

---

## 4. Lane θ — the CLOSE half of plan-as-document, plumbing grade

DIRECTION.md §4 item 4 names it: the onboarding half is built (`/clients/plan`); **the CLOSE half rides
Wave E**. DIRECTION.md:19 **recommends** it be "a first-class, versioned DB object (the
intended-vs-actual audit record)" — the line reads *"**Recommended:** … → **Gate-2 owner
ratification**"*, so it is a recommendation this design adopts, not a requirement it obeys.

**It already is one** — that is the point of §2.2's shape. The *intended* is `clara.close_gate_checks`;
the *actual* is `close_gate_results` + `close_attestations` + the receipt. Lane θ ships a **read and
three surfaces**, not a new persistence model:

- **`clara.get_close_plan(p_fiscal_year_id) returns jsonb`** — the typed plan document: every applicable
  check with its drawer, intended assertion, measured state, attestation (or its absence), and the
  receipt once finalized. Granted to `clara_authenticated` and `clara_agent_ro` (read).
- **`/close`** — the plan-as-document view + the readiness panel. Every gate row renders **shape +
  label, never hue-only and never a raw digit** (DIRECTION §3's a11y floor); drawer-3 signals are
  visibly non-blocking; the attest action is an object-level verb on the row, so the surface passes
  DIRECTION §1's agent-native test.
- **`/reports`** — a sibling of `/rules` (`apps/dashboard/app/rules/page.tsx`): pasted-JWT dev auth in
  `sessionStorage` under the shared `clara_dev_jwt` key, PostgREST `rpc()` reads, no design system, no
  animation. Sealed-artifact links and a snapshot list. **The UI computes no cents.** *(Stated for the
  owner, not hidden: this EXTENDS E-R10 item ③'s hand-minted-JWT pattern to two new surfaces. Fixing
  the JWT story is correctly Wave G; propagating it is a choice, and this is where it is visible.)*
- Any new card registers in the catalog with exactly one authoritative emit path and re-derives its
  authoritative status on hydrate (DIRECTION §1/§3; the parity extractor test is a build gate).

**Out of scope, explicitly (E-R10):** sign-in/sign-up, firm setup, raw-document click-through, the JWT
story, and every other item on the UX-debt register. All of it is Wave G. The E-side painkiller lane
was proposed and **declined**.

---

## 5. E-b / E-c — pointers only

**E-b (lanes δ, ε, ζ) — `wave-e-design-reporting.md` §§2–5 (lane δ) + `wave-e-design-reporting-part2.md`
§§6–10 (lanes ε and ζ).** The typed metric algebra (E-R5), the
approved/versioned/effective-dated catalog, the six-layer FS template model, claim assessment, the
chart AST regime and the sealed-artifact registry (E-R14). Two standing decisions bind it from here:
**the algebra evaluator IS a reporting evaluator for immutability purposes** — versioned `_vN` DB
functions, frozen by extending the freeze-lint family; and **wording tables follow the 0016
`sst_threshold_schedule` idiom** as the certified precedent for effective-dated policy text. The render
worker is a new package mirroring `packages/backup`'s separate-Fly-app batch shape (a short-lived DSN,
no standing pool, offline at render time), which also keeps it off the Supavisor standing budget.
E-a's dependency on E-b is one-way and narrow: **the close receipt pins evaluator versions and a
dataset hash — in the `evaluator_version_ids` and `dataset_sha256` columns §2.7 now declares** — and
nothing more. E-a's dependency ON γ is the reverse edge: δ build-depends on §2.12's period registry.

**E-c (lane η) — `wave-e-design-reporting-part2.md` §11.** The LLM ad-hoc authoring lane: the model composes
catalog items freely and authors novel definitions as formula trees; a novel definition is a `draft`
until human approval (E-R5's lifecycle matrix), approval and publication ride named audited functions
under the standing role floors and PRD §2's segregation model, and direct DML stays revoked. E-a
touches it only through E-R4's law, absolute on both sides: a model may propose or check, and no model
numeral enters a durable report unless a versioned deterministic evaluator **originates** it from
DB-owned inputs.

**Tax computation is NOT in Wave E.** PRD §8's exclusion is `docs/prd/PRD.md:183` — *"Model-computed
numbers in any artifact | Every figure from DB functions (invariant 1)"* — which is the row the E-R4
argument actually rests on; `:184` is the separate tax-gating row. Nothing in the FS-pack or reporting
scope folds a draft tax computation in by another name.

---

## 6. Open questions

Two items are DECIDED by the orchestrator; one belongs to the OWNER and is stated as pending.

1. **`clara.apply_open_items` — verified or guarded? CLOSED (2026-08-09): GUARDED.** §3.1 carries the
   read and the verdict — act-dating is mechanized (`0040:6148-6216`, `0042:4896-4903`, producer law
   `0040:864-877`) but conditional, so the verb gets one small refusal and lane α's size moves from
   "tests only" to "tests + one guard + the door". Both independent round-1 review lanes reached this
   answer separately.
2. **The E-R11 factory default — PROPOSED (`owner` only), PENDING THE OWNER (one line).** *(Not
   decided here: E-R11's ruled default is "owner/partner only", and narrowing a ruled default belongs
   with the owner, not the orchestrator.)* Reasoning of record for the proposal: "partner" has no
   structural representation in the role model (`viewer|bookkeeper|admin|owner`, `0002:215`), so an
   explicit audited grant IS the honest mechanism for a partner who is not the firm owner — defaulting
   the whole `admin` tier in would make the list decorative for the largest senior role, and signing
   authority should fail closed. **Owner-open item; adjustable in one `_has_capability` predicate.**
   The reporting doc's "owner/partner" wording cites this same pending item.
3. **Lane α's early ride — DECIDED (orchestrator, 2026-08-09): α rides an early ceremony.** §1.1's
   argument stands (an ADR-062 debt discharged, the three parked codes landed without waiting on the
   campaign), amended by §3.1: α now replaces one audited writer body, so it carries its own small D1
   window rather than none. Full ADR-061 ladder on the PR regardless.

**Known risks carried forward, not resolved here.**

- **The closed-period wall (§2.5) is the widest new surface in E-a** — it sits on the hottest table in
  the schema and refuses writes the runtime has never seen refused. Its inertness at deploy (§1.1)
  contains the deploy risk; its correctness is Law-1 judgement logic and gets the full independent
  pass. The matrix must carry **all SEVEN cells §2.5 names** — the plain refusal, the close-vs-post
  race, §2.5(B)'s close-vs-gate-evidence race, the forge attempt, the close's own write, the
  prior-transaction permit, and the over-consumption refusal — and §2.1's shared/exclusive pair has no
  precedent in this schema (grep-verified absent) so it carries its own two-session cells.
- **RPR's historical-FY close may be unreachable until its scars are remediated** *(the discovery both
  round-1 review lanes converged on, registered here as a Section-D precondition).* E-R12(1) records
  RPR's two scars as self-healing at as-of ≥ 2026-08-01 (`wave-e-contract.md:245-249`). Drawer 1
  evaluates its ties at **`fy.ends_on`**, not at an operator-chosen date — so if RPR's historical FY
  ends inside the scar window, `ar_control_tie` returns `mismatch` there **permanently, with no
  override**, and E-R9's "RPR historical FY MPERS pack" close cannot be reached at all. The honest path
  is to remediate the two scars through the audited verbs (`unallocate_group` → re-apply, both
  act-dated per §2.11's table) **before** the close. Section D therefore carries a named precondition
  row, **measured at run time**: read the scar state via `ar_control_tie(RPR, fy.ends_on)` first, and
  record what it says — never assume either outcome.

---

*v2 ends. §1 and §2 are proposals at implementable precision, not decisions; §0's three corrections
are reads and should be treated as findings against the grounding pass. The contract governs
throughout.*
