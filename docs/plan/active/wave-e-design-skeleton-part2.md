# WAVE E — DESIGN SKELETON v2 · **PART 2** (§2.5–§2.8)

> **CONTINUATION of `wave-e-design-skeleton.md` — one document in four files** (the repo's 500-line
> file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split precedent). Part 1 carries §0 (the
> verification ledger + three corrections) · §1 (campaign frame, lanes, ceremony) · §2.1–§2.4 (the
> period spine, the gate catalog, drawer 1, drawer 2). **This file carries §2.5–§2.8: drawer 3 and
> the closed-period wall with its permit, the continuity math, the close receipt family, and the
> reopen path.** `wave-e-design-skeleton-part3.md` carries §2.9 (E-R6 activation) · §2.10 (the E-R11
> keys) · §2.11–§2.12 (lane γ — month snapshots, staleness, the period registry);
> `wave-e-design-skeleton-part4.md` carries §3 (the E-R12 trio) · §4 (lane θ) · §5 (E-b/E-c
> pointers) · §6 (open questions + decisions). Section numbers are continuous across the four files;
> a citation like "skeleton §2.5" resolves here, "skeleton §2.9"/"§2.11" in part 3, "skeleton §3.1"
> in part 4. **THE PACKET IS SEVEN FILES**; the other three: `wave-e-design-reporting.md` (§0–§5),
> `wave-e-design-reporting-part2.md` (§6–§12), `wave-e-acceptance-matrix.md`. Part 1's banners,
> markers and evidence discipline apply unchanged: the contract wins; EXISTS claims carry `file:line`
> reads taken **2026-08-09 at the v2 fix pass**; migration numbers and `CLRnn` codes claim at MERGE.

### 2.5 Drawer 3, and the closed-period wall

**Drawer 3** is advisory-only (E-R2): the informational half of `verify_bank_reconciliation`,
`fa_register_tie`'s non-blocking view, snapshot staleness counts, aging concentration. It renders in
the readiness panel and never blocks. DIRECTION §3's a11y floor binds the panel: gate status is
**shape + label, never hue-only, never a raw digit**.

**The closed-period wall — a TRIGGER FAMILY, not N writer recuts** *(builder choice, the most
consequential one in this document).* "No writer escapes into the FY **mid-close**" (E-R2 drawer 1)
and E-R13's "entering the closed year takes the formal reopen path" require two different things, and
the family separates them: **serialization** (nothing that feeds a gate may move while a close is
measuring) and **refusal** (an approved posting may not land in a `closing`/`closed` FY).

**(A) The JE wall — serialize AND refuse.** `clara._tf_period_wall`, a `before insert or update` ROW
trigger on `clara.journal_entries`, declared **`security definer set search_path = clara, pg_temp`**
*(stated because it must be: the trigger reads `clara.fiscal_years` and `clara.close_write_permits`,
both FORCE-RLS with owner-only policies, so an invoker-context trigger would see zero rows and permit
everything — the same silent fail-open §2.1 names for the definer read)*. Its statements, in order:
(1) `perform pg_advisory_xact_lock_shared(203005007, hashtext(NEW.client_id::text));` — §2.1's
serialization half, unconditional and FIRST, because a conditional acquisition re-opens the race it
closes; (2) read the FY containing `NEW.posting_date` (index `ix_fy_client_span`); (3) if that FY is
`closing`/`closed` **and** the row would be or stay `status='approved'`, refuse unless the permit
below holds — `errcode='CLR19'`, `reason='write_into_closed_period'`. A sibling trigger on
`clara.journal_lines` refuses mutation of a line whose parent entry sits in such an FY.

- **UPDATE scope is deliberate.** No `WHEN` clause and no `UPDATE OF` list: the trigger fires on every
  touch, so it also refuses the `reversed_by` linkage UPDATE `reverse_entry` performs on an original
  inside a closed FY — intended, and the reason **§2.8's effect ordering is REQUIRED, not incidental**
  (status → `reopened` first, reversal second). A column list would be a second enumeration to keep
  correct.

**(B) The gate-evidence walls — serialize ONLY.** *(DECIDED (orchestrator, 2026-08-09), closing the
round-2 finding that the JE-only wall let gate INPUTS move under a live close.)* A drawer-1 gate reads
far more than `journal_entries`: the AR/AP ties read allocation rows, the bank identity reads
statements, reconciliations and exceptions, the FA tie reads the register. `finalize_close`
re-evaluates every gate in-transaction (§2.1), so any of those moving between the evaluation and the
commit would make the receipt describe a state that never existed. Row triggers therefore sit on
**`clara.open_item_allocations`** (`0037:783`), **`clara.bank_statements`** (`0038:369`),
**`clara.bank_reconciliations`** (`0040:262`), **`clara.bank_line_exceptions`** (`0040:424`) and
**`clara.fixed_assets`** (`0003_books_core.sql:155`), each taking
`pg_advisory_xact_lock_shared(203005007, hashtext(<the row's client>))` and then proceeding.
Caller-agnostic, zero audited-writer recuts. **Effect:** while a close holds EXCLUSIVE no
gate-evidence write can land — it waits, exactly as a JE write does; outside a close window
everything proceeds and marks snapshots stale per §2.11.

- **These triggers do NOT test FY status, and that is the ruled scope, not an oversight.** A statement
  void or an allocation carries no `posting_date` to test against an FY, and E-R2's phrase is "no
  writer escapes into the FY **mid-close**" — a close-window property, which the shared lock delivers
  whole. **The honest residual:** a gate-evidence write dated into an ALREADY-closed FY is not refused
  here — it is caught after the fact by `verify_close`'s recompute (§2.7) and by staleness (§2.11),
  never silently, but "caught" is weaker than "refused" and a reviewer should price that gap rather
  than discover it. Extending refusal needs a per-table act-date rule and is **out of scope for E**
  *(builder choice; it would be a second enumeration of the kind (C) rejects)*.
- **The census that keeps the family complete:** §2.11's per-writer disposition table is not prose —
  it is the **input to a migration-tail assertion**. For every writer it names as a gate-evidence
  mover, the tail asserts from the live catalog that the table that writer writes carries a wall
  trigger; a named mover writing an uncovered table RAISEs at apply time. A *checked* enumeration
  whose failure mode is a failed migration, rather than a silent hole. §2.11 records the one class
  that is covered by the JE wall instead of a trigger of its own.

**(C) Why triggers and not N writer recuts:** a trigger is caller-agnostic and complete by
construction. Enumeration is provably error-prone in this repo's own history — 0027's CoR sweep found
a **third** `document_filings` writer the ledger had not named (`0027:30-36`), and §7-A's v1 declared
a function "never recut" off a truncated grep. Enumeration is a review instrument (§2.11 uses it as
exactly that, and (B) makes it an asserted one), never a mechanism.

**The permit is a ROW this transaction created — never session state, never a caller argument.**

```
clara.close_write_permits     -- ungranted, forced RLS, clara_fn_owner using(true) only
  id uuid pk · firm_id · client_id · fiscal_year_id · close_run_id
  purpose text not null check (purpose in ('close_entry','reopen_reversal'))
  target_entry_id uuid              -- required when purpose='reopen_reversal'
  entries_expected int not null check (entries_expected >= 1)
  entries_used     int not null default 0 check (entries_used <= entries_expected)
  created_xact xid8 not null default pg_current_xact_id()
  created_at timestamptz not null default now()
```

The wall permits a write into a `closing`/`closed` FY **iff** a permit row `P` satisfies all of:
`P.created_xact = pg_current_xact_id()` · `P.client_id = NEW.client_id` · `P.fiscal_year_id` = the FY
containing `NEW.posting_date` · for `reopen_reversal`, the touched entry is on `P`'s lineage (below) ·
`P.entries_used < P.entries_expected`. On admitting the write the trigger **increments
`P.entries_used` in the same transaction**, an ordinary UPDATE, and a further write beyond
`entries_expected` refuses like any other.

- **The counter IS the consumption identity — no transaction column on `journal_entries` is needed,
  and none is added.** v2's first cut bounded the permit with `max_entries` and counted "entries
  already carrying that `(client, FY, xact)`", which is not expressible: `clara.journal_entries` has
  no transaction column, so the count could only come from `xmin` — the instrument this same section
  rejects two bullets below. Counting on the permit row removes the question.
- **Consequence for the table's shape, stated:** `close_write_permits` is **insert-once with exactly
  ONE mutable column**, not append-only. An update trigger permits `entries_used` to move, upward
  only (the `0040:351` whole-row-minus-named-columns compare, different named set); every other column
  and DELETE refuse. The increment cannot contend — the permit row was inserted by **this**
  transaction, so no other session can see it, let alone lock it.
- **Retention, stated rather than left unsaid:** ≤2 rows per close or reopen, and closes are annual —
  the smallest table this campaign creates, growth bounded by `2 × closes × clients`. No pruning in v1
  (the seven-year posture §2.7 takes); a purge verb, if ever wanted, is a later migration.
- **Why the permit is LOOKED UP, not passed on `NEW`.** The caller controls every column of `NEW`, so
  a permit id on the row is a caller-settable fact wearing a column's clothes; and the reopen UPDATEs
  an entry whose stored close lineage was written by an **earlier** transaction, so a stored id could
  never carry a this-transaction fact anyway. `journal_entries.close_receipt_id` (§2.6) stays
  **lineage only** — enumerable, auditable, never consulted for authorization.
- **The `reopen_reversal` arm: mechanism vs belt.** `P.target_entry_id` names the closing entry; the
  mirror's id is generated *after* the permit row exists, so the trigger matches the mirror on
  **lineage** (`NEW.reversal_of = P.target_entry_id`), never on an id the permit could hold. And
  §2.8's REQUIRED ordering flips the FY to `reopened` **first**, at which point the wall's step-3
  predicate is false and the permit is never consulted. **The ORDERING is the mechanism; the permit
  arm is the BELT** — it exists so a future implementation that reverses before flipping fails closed
  rather than silently.
- **Why a declared `xid8` column and not `xmin`.** Both round-1 reviews proposed `receipt.xmin =
  pg_current_xact_id()`. The FACT is right and is the ruling; the INSTRUMENT would have failed the
  build: (a) a row inserted inside a PL/pgSQL `begin … exception` block carries the **subtransaction's**
  xid in `xmin` while `pg_current_xact_id()` returns the **top-level** xid — and §2.3 puts every
  drawer-1 probe inside exactly such a block, so an `xmin` permit would refuse the close's own write;
  (b) `xmin` is 32-bit `xid` vs `xid8`, so the comparison needs a cast whose epoch behaviour must be
  argued rather than read; (c) a declared column is checked in DDL, not in the catalog. `xmin`
  survives as a **belt** in the migration tail, never as the guard.
- **Forgery, measured rather than assumed.** An authenticated session may call `set_config` and
  `pg_advisory_xact_lock*` at will: `0004:752-753` revokes EXECUTE only within schema **`clara`** and
  nothing revokes `pg_catalog`; a transaction-local GUC also survives into a later SECURITY DEFINER
  call in the same transaction, because clara bodies pin `search_path` and nothing else. So v1's two
  conjuncts were both caller-settable. A session **cannot** insert into `close_write_permits`: no
  grant to any role, forced RLS, `clara_fn_owner using(true)` only. ⇒ **The GUC is DELETED, and
  `pg_locks` introspection with it** (it existed only to read the lock the GUC could not prove).
- **Write order inside `finalize_close`**, resolving the mutual FK without DEFERRABLE: permit row →
  closing entry as a DRAFT → the approve flip (§2.6) → `close_receipts` row (its `close_entry_id` now
  resolvable) → UPDATE the entry's `close_receipt_id`. *(Three touches of the entry, one permit:
  `entries_expected` counts admitted WRITES, and the shipped value is asserted against the touches the
  body actually performs.)*
- **The counter and §2.3's subtransactions interact cleanly, stated so it is not inferred:** if a
  drawer-1 probe's `begin … exception` block rolls back, the `entries_used` increment rolls back with
  the write it admitted. Fail-closed, and no orphaned consumption.
- **Inert on arrival:** with zero `fiscal_years` rows the FY lookup finds nothing and every write
  proceeds; the residual cost is one reentrant shared advisory acquisition per row.

**Cells this mechanism owes the matrix:** `CLR19 write_into_closed_period` on a plain post into a
`closed` FY · the **close-vs-post race** (B posts while A holds exclusive: waits, then refuses) · the
**close-vs-gate-evidence race** (an `apply_open_items` or `void_bank_statement` blocks while a close
holds exclusive) · a **forge attempt** (any GUC set, `203005007` taken by the caller, write into a
`closing` FY → refused) · the close's own entry SUCCEEDS under its permit · a PRIOR-transaction permit
does NOT permit · a write beyond `entries_expected` refuses.

### 2.6 Continuity math *(ruled — E-R2 drawer 1)*

Computed inside `finalize_close`, under the lock, from DB-owned inputs only — **no numeral crosses an
LLM boundary on this path** (E-R4; the operational law at PRD §4 item 14 governs).

1. **The P&L → retained-earnings roll.** Net result is read from `clara.trial_balance_as_of(p_client,
   fy.ends_on)` (`0017_wave_b.sql:3572`) minus the same read at `fy.starts_on - 1`, restricted to P&L
   types.
   - **Two properties of that read the close must handle, not inherit.** It is `language sql stable
     **security invoker**` returning only `(account_code, name, debit_cents, credit_cents)`
     (`0017:3572-3585`). So (a) "restricted to P&L account types" needs an **explicit join to
     `clara.coa_accounts` on `(client_id, account_code)`** filtered by type — the function carries no
     type; and (b) calling a SECURITY INVOKER read from inside a SECURITY DEFINER body evaluates it
     under the **owner's** `using(true)` policies, not the caller's, so **`finalize_close` performs its
     own explicit client-in-firm check** (`CLR11 client_not_in_firm`) rather than inheriting one from
     RLS. Both are build obligations with cells.
   - The **closing entry** zeroes each P&L account and posts the net to the client's retained-earnings
     account, resolved from the chart; absent or ambiguous ⇒ `CLR41 drawer1_state_unknown` with the
     resolution named. It is never created implicitly. **Linkage:** `reversal_of`/`reversed_by` is the
     reversal mirror and `auto_reversal_of` (`0042_wave_d_b0_shared_authorities.sql:288-290`) is the
     recurring-adjustment pairing, whose pair `0045_wave_d_b2_recurring_adjustments.sql:7979-7980`
     asserts leaves the reversal columns unused; a closing entry is neither ⇒
     **`journal_entries.close_receipt_id`** (nullable FK) — lineage only, never authorization (§2.5) —
     which also makes the receipt's line set enumerable. *(builder choice.)*

   **The approve path — DECIDED (orchestrator, 2026-08-09): authored IN BODY as a DRAFT, then flipped
   by the census-visible UPDATE, and the census roster grows to FIVE in the same migration.** *(Routing
   through `_approve_entry_core` is declined: it puts the close's own E-R11 segregation and
   maker/checker in one transaction arguing about the same actor, and makes a SECURITY DEFINER close
   depend on the caller-context branch of a verb designed for a human approving someone else's draft.)*

   **The SHAPE is load-bearing, not stylistic.** The live census detector is an **UPDATE**-shaped
   regex (`0045:7831`, applied to the live catalog at `0045:7849` — `:7847-7848` are the
   comment-stripping `regexp_replace` chain — self-tested at `0045:7830-7837`), so
   **an `insert … status='approved'` is INVISIBLE to it**: a close that inserted the entry
   already-approved would "pass" the census by not being seen, and a reviewer would read silence as
   coverage. `finalize_close` therefore inserts the closing entry as `status='draft'` and flips it
   with a literal `update clara.journal_entries set status='approved' …` in the same transaction,
   under its own permit (§2.5's write order counts all three touches). The build asserts the shape
   positively — the new body must MATCH the detector's own regex.

   The obligation is then discharged **in the migration tail, not in prose**: the repo keeps that
   whitespace-tolerant census of every body writing `status='approved'` on `journal_entries`, roster
   pinned verbatim at **`0042:6240`** and carried forward unchanged at
   **`0043_wave_d_b1_staff_advances.sql:4638`** and **`0045:7816`** — `'_approve_entry_core,
   _approve_opening_entry, approve_wrong_client_correction, reverse_entry'`. **0045 is the LAST
   carrier** (0046..0054 carry no copy — grep). β restates it with `finalize_close` added, re-asserts
   the count (four → **five**), and carries the per-hook disposition below — the list a fifth approve
   path owes, and the reason path four needed 0037 §H.3:

   | Hook `_approve_entry_core` carries | Disposition for the closing entry |
   |---|---|
   | `clara.is_high_stakes` (`0004_governed_fns.sql:72-79`) | **True by construction** — a closing entry is `is_year_end`, the body's first disjunct. Not bypassed: key ② + §2.10's segregation IS the high-stakes control for this act, and the receipt records `segregation_mode`. |
   | the maker/checker branch (`0004:541-546`, testing `e.last_human_editor`) | **Replaced, not skipped**, by E-R11's close segregation (§2.10) — same column, same solo branch, same attestation shape, evaluated over the FY rather than one entry. Stated so a reviewer sees a substitution, not a hole. |
   | `clara._subledger_on_approve` (spliced into path 4 at `0037_wave_c_a_subledger.sql:2379-2392` precisely because it had been missed) | **Reasoned, not assumed.** A P&L→RE entry touches no receivable/payable control account and so mints no open item — but that is a property of the CHART, not of the code. β therefore **calls the hook** and asserts zero `open_items` rows resulted. A provable no-op costs one call; a wrong argument costs a silently divergent subledger. |
2. **`opening(n+1) = closing(n)` — PIN AT CLOSE, ASSERT AT THE EARLIEST EVENT THAT CAN EVALUATE IT.
   Drawer 1, absolute, with no gate in any drawer.** *(DECIDED (orchestrator, 2026-08-09), replacing
   v2's `continuity_tie_deferred` drawer-2 gate outright — both round-2 reviews adjudicated that gate
   as a NARROWING of E-R2, and it is deleted rather than re-argued.)*

   The tie is one identity with two operands, and v2's mistake was treating "the second operand does
   not exist yet" as a state needing an override. It needs a **clock**, not a drawer:

   - **At close(n) — the PIN.** `finalize_close` writes the FY(n) closing position **per balance-sheet
     account, in cents**, into the receipt (`closing_position` in §2.7's snapshot, digested by
     `closing_tb_digest`). This is an ordinary product of the close, not a concession: it is what the
     receipt already had to carry for `verify_close` to recompute anything.
   - **Close(n)'s OWN drawer-1 continuity obligations** are therefore fully evaluable and fully
     absolute: the P&L→RE roll (item 1), and the tie of FY(n)'s **opening** side against the PRIOR
     receipt's pinned closing position. For a client's FIRST FY there is no prior receipt and the
     opening side is the **Wave-B opening seed** (`create_opening_seed` `0017:2885` …
     `approve_opening_correction` `0017:4162`) — reused, not rebuilt. Both are drawer 1; neither can
     ever be unevaluable, so neither needs an attestation path.
   - **At the earliest successor event — the ASSERTION.** The `opening(n+1) = closing(n)` half fires,
     **drawer 1 and absolute**, at whichever comes first: FY(n+1)'s **opening-seed approval**, or
     FY(n+1)'s **close**. It is asserted against the **PINNED** position from close(n)'s receipt,
     never a re-derivation. Divergence ⇒ refuse, **no attestation path, no override, nobody** — and
     the refusal is raised by the successor event, which is the act that made the identity evaluable.
   - **Where the seed-approval arm physically LANDS, named because it is an existing audited body.**
     It is a splice into the LIVE `clara.approve_opening_seed` (`0017_wave_b.sql:3825`), whose file
     text is **not** its live text — §2.1's PATCHES table carries the 0018 §3b harvest evidence, the
     anchor to count (`perform clara._assert_opening_tie(p_seed);`, `0017:3956`), the D1 window and
     the Law-1 flag. That verb already holds `203005004` before it books anything
     (`0017:3856`), so the assertion runs inside the house lock order with no new rung.
   - **The basis is never `trial_balance_as_of(fy_next.starts_on)`** — that read includes every
     ordinary approved posting dated on the first day (`0017:3576-3579`), so a correct closing plus
     one legitimate first-day sale would read as a continuity break.

   **Why this is faithful where the gate was not.** E-R2 rules that an UNKNOWN/ERROR tie state fails
   closed exactly like a mismatch (`wave-e-contract.md:46-48`), and §2.3 applies that verbatim to the
   bank identity. A drawer-2 gate over the continuity tie applied the *opposite* reading to the other
   drawer-1 identity in the same document. Pinning removes the question instead of answering it twice:
   nothing is ever measured as unknown, because nothing is measured before both operands exist — and
   no client is blocked from closing its first year, which is what the gate was reaching for.
   *(Minting a successor seed inside `finalize_close` stays declined: a second author on an
   already-audited one-shot registry.)*
3. **The close-time FA continuity roll** (E-R9's BEE row): FY(n) closing NBV per enrolled asset →
   FY(n+1) opening, computed by `fa_control_tie_out`'s segment reads and **persisted into the close
   receipt's snapshot**, so FY(n+1)'s tie has a stored prior position rather than a re-derivation.
   Explicitly **does NOT** discharge WD-R14's *opening* carry-down deferral (E-R9 says so; BEE held
   zero assets at its 1/1/2025 opening).
4. **The reverse/re-open ordering guard:** §2.8.

### 2.7 The close receipt family — mirroring the 0040 triad

*(Standing architectural decision, per the campaign frame: close receipts mirror the 0040 bank-recon
triad.)* **`clara.close_receipts`** — immutable output row:

```
id uuid pk · firm_id · client_id · fiscal_year_id · close_run_id
prior_close_receipt_id uuid references clara.close_receipts(id)   -- the chain link
kind text check (kind in ('close','reopen'))
status text not null default 'active' check (status in ('active','superseded'))
closed_by uuid not null references clara.users(id) · closed_at timestamptz not null default now()
segregation_mode text check (segregation_mode in ('two_person','solo_self_attested'))
last_preparer_actor uuid · self_attestation text
pl_net_cents bigint not null · retained_earnings_account text not null
closing_tb_digest text not null · gate_digest text not null · books_watermark text not null
evaluator_version_ids uuid[] not null default '{}'   -- §5's pin claim, made true
dataset_sha256 text not null                          -- §5's pin claim, made true
close_entry_id uuid references clara.journal_entries(id)
snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
```

- **Money is `bigint` cents** everywhere (PRD invariant 6, restated at E-R5).
- **`evaluator_version_ids` + `dataset_sha256` are the E-b pin**, and they exist as COLUMNS because §5
  claims the receipt pins them; v1 claimed it with no column to carry it. Empty array is legal for a
  close whose pack has not been rendered — the array records what WAS consumed, never a promise.
- **`snapshot`** carries the enumerable evidence: every gate result + measured payload, every
  attestation (who/why/when), the per-account closing TB, **`closing_position` — the per-balance-sheet-
  account closing figure in cents that §2.6 item 2 PINS** (`closing_tb_digest` is its digest), the
  per-asset FA continuity roll, the AR/AP tie terms, and the bank-recon receipt ids consumed. The 0040
  posture applies: the DDL demands *some* object payload; **enumeration completeness is the belt's
  job**, asserted by a trigger, not a CHECK (`0040_wave_c_c_tieout.sql:296-298`). The pin is what
  FY(n+1)'s seed approval or close asserts against — so a receipt whose `closing_position` is absent or
  unreadable is not a receipt this design can chain from, and the belt trigger refuses it at write.
- **Immutability:** two triggers mirroring `_tf_bank_reconciliation_transition` (`0040:351`,
  whole-row-minus-lifecycle-columns compare) and `_tf_bank_reconciliation_no_delete` (`0040:379`). The
  only permitted transition is `active` → `superseded`, and only by `reopen_fiscal_year`.
- **`clara.verify_close(p_receipt uuid) returns jsonb`** — recomputes every identity **from scratch**
  and diffs recomputed-vs-stored, never re-deriving from the snapshot it is checking
  (`verify_bank_reconciliation`'s discipline, `0040:4537-4644`). Split: a **STRICT half** (the four
  drawer-1 identities + the RE roll + the tie of this FY's OPENING side against the prior receipt's
  pin) that fails `verified`, and an **INFORMATIONAL half** (drawer-3 counts, enumeration drift) that
  is reported and never fails. **The successor tie is reported, never graded:** where no FY(n+1) seed
  or close has consumed this receipt's `closing_position` yet, the strict half emits
  `successor_tie: 'pinned_not_yet_consumed'` — an informational status, never `passed` and never a
  silent omission (the tie itself is asserted by the successor event, §2.6). This is the seven-year
  answer to "was this year really closed clean".

### 2.8 The reopen path *(key ③ — ruled, E-R11)*

`clara.reopen_fiscal_year(p_fy, p_reason, p_correction_target jsonb, p_op_key)` requires all four:

1. **Key ③** (§2.10) — else `CLR04 capability_missing`.
2. **A stated reason** — non-empty after `btrim`, minimum length enforced; else `CLR10`.
3. **A named correction target** — `p_correction_target` must resolve to real rows in **this** client
   (entry ids / a document id / a gate `check_key`), validated by existence, not accepted as free
   text; else `CLR10 reopen_target_missing`. A reopen whose target is prose is a reopen nobody can
   audit.
4. **The ordering guard** — refuse if **any later FY of the same client** is `closing` or `closed`
   (`CLR41 reopen_ordering_violation`). This is ARCHITECTURE §3.6's GAP5-3 fix stated as a predicate:
   you cannot reverse FY(n) under a live FY(n+1) close.

**Acquisition, before any effect** *(§2.1's lock order; the reopen is the one close verb that touches
a pre-existing entry, so it is the one that must lead with the row)*: resolve the FY's `active` close
receipt and its `close_entry_id` → `select … from clara.journal_entries where id = <that entry> for
update` → `203005004` → `203005007` EXCLUSIVE. That is the order every JE writer already walks
(`0037:2535-2538`, `:2549-2553`), which is why cycle 2 cannot form; **no `lock_timeout` is the
containment for it** (§2.1 obligation 3). An FY whose receipt names no closing entry locks no row.

Effects then follow, in one transaction under the EXCLUSIVE `203005007`, **in this order — the order
is REQUIRED, not incidental**: `fiscal_years.status` becomes `reopened` **first**; then the current
receipt goes `active` → `superseded` and a `kind='reopen'` receipt chains to it via
`prior_close_receipt_id`; then the closing entry is **reversed, never deleted** through
`clara.reverse_entry` — the audited verb, not a hand-written unwind (PRD invariant 8). *The ordering
is load-bearing because §2.5's wall refuses the `reversed_by` UPDATE `reverse_entry` performs on an
entry inside a `closing`/`closed` FY; flipping the status first is what makes the reversal reachable,
and the reopen's own `close_write_permits` row (`purpose='reopen_reversal'`, `target_entry_id` = the
closing entry) covers the mirror.* `reverse_entry`'s own `for update` and `203005004` are both
re-acquisitions of locks this transaction already holds, so neither waits.

**A reopened FY re-closes through the same path** (`begin_close` accepts `reopened` as well as `open`,
§2.1 → gates → `finalize_close`), so the second receipt chains onto the reopen receipt and the whole
history is walkable.

*(Citation caveat, stated because v1 invited a harvest: `0009_coding_floor.sql:1697-1748` is cited
anywhere in this packet as a **shape reference only** for `reverse_entry`'s in-body mirror.
`reverse_entry` has itself been recut by 0037/0038/0042 — its name appears in each of those tails'
rosters — so its live body, like `approve_wrong_client_correction`'s, is only readable via
`pg_get_functiondef`.)*

---

*Part 2 ends at §2.8. **§2.9–§2.12** — the E-R6 activation, the E-R11 keys, and lane γ's month
snapshots, staleness and period registry — continue in
[`wave-e-design-skeleton-part3.md`](./wave-e-design-skeleton-part3.md); **§3–§6** — the E-R12 trio
(lane α), lane θ, the E-b/E-c pointers and the open-question ledger — in
[`wave-e-design-skeleton-part4.md`](./wave-e-design-skeleton-part4.md).* Section numbering is
continuous; the four files are one document.*
