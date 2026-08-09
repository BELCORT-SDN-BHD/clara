# WAVE E — DESIGN SKELETON v2 · **PART 2** (§2.6–§2.12)

> **CONTINUATION of `wave-e-design-skeleton.md` — one document in three files** (the repo's 500-line
> file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split precedent). Part 1 carries §0 (the
> verification ledger + three corrections) · §1 (campaign frame, lanes, ceremony) · §2.1–§2.5 (period
> spine, gates, drawers 1–3, the closed-period wall). **This file carries §2.6–§2.12 (continuity,
> receipts, reopen, E-R6 activation, the E-R11 keys, snapshots + staleness, the period registry).**
> `wave-e-design-skeleton-part3.md` carries §3 (the E-R12 trio) · §4 (lane θ) · §5 (E-b/E-c pointers)
> · §6 (open questions + decisions). Section numbers are continuous across the three files; a
> citation like "skeleton §2.9" resolves here. Part 1's status banners, markers and evidence
> discipline apply unchanged: the contract wins; EXISTS claims carry `file:line` reads taken
> **2026-08-09 at the v2 fix pass**; migration numbers and `CLRnn` codes claim at MERGE.

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

   **The approve path — DECIDED (orchestrator, 2026-08-09): authored IN BODY, and the census roster
   grows to FIVE in the same migration.** *(Routing through `_approve_entry_core` is declined: it puts
   the close's own E-R11 segregation and maker/checker in one transaction arguing about the same actor,
   and makes a SECURITY DEFINER close depend on the caller-context branch of a verb designed for a
   human approving someone else's draft.)* The obligation is discharged **in the migration tail, not in
   prose**: the repo keeps a whitespace-tolerant census of every body writing `status='approved'` on
   `journal_entries`, roster pinned verbatim at **`0042:6240`** and carried forward unchanged at
   **`0043_wave_d_b1_staff_advances.sql:4638`** and **`0045:7816`** — `'_approve_entry_core,
   _approve_opening_entry, approve_wrong_client_correction, reverse_entry'`. **0045 is the LAST
   carrier** (0046..0054 carry no copy — grep). β restates it with `finalize_close` added, re-asserts
   the count, and carries the per-hook disposition below — the list a fifth approve path owes, and the
   reason path four needed 0037 §H.3:

   | Hook `_approve_entry_core` carries | Disposition for the closing entry |
   |---|---|
   | `clara.is_high_stakes` (`0004_governed_fns.sql:72-79`) | **True by construction** — a closing entry is `is_year_end`, the body's first disjunct. Not bypassed: key ② + §2.10's segregation IS the high-stakes control for this act, and the receipt records `segregation_mode`. |
   | the maker/checker branch (`0004:541-546`, testing `e.last_human_editor`) | **Replaced, not skipped**, by E-R11's close segregation (§2.10) — same column, same solo branch, same attestation shape, evaluated over the FY rather than one entry. Stated so a reviewer sees a substitution, not a hole. |
   | `clara._subledger_on_approve` (spliced into path 4 at `0037_wave_c_a_subledger.sql:2379-2392` precisely because it had been missed) | **Reasoned, not assumed.** A P&L→RE entry touches no receivable/payable control account and so mints no open item — but that is a property of the CHART, not of the code. β therefore **calls the hook** and asserts zero `open_items` rows resulted. A provable no-op costs one call; a wrong argument costs a silently divergent subledger. |
2. **`opening(n+1) = closing(n)`, asserted against a PINNED opening position — not a first-day
   balance.** The FY(n) closing position must equal FY(n+1)'s opening position account-by-account for
   balance-sheet accounts, to the cent; mismatch ⇒ refuse, no override. **The basis is the Wave-B
   opening seed, not `trial_balance_as_of(fy_next.starts_on)`** — that read includes every ordinary
   approved posting dated on the first day (`0017:3576-3579`: `status='approved' and posting_date <=
   p_as_of`), so a correct closing plus one legitimate first-day sale would read as a continuity break.
   The Wave-B machinery is reused, not rebuilt (`create_opening_seed` `0017:2885` …
   `approve_opening_correction` `0017:4162`). FY(n+1) carrying an **approved opening seed** ⇒ the tie
   is asserted against it, drawer 1, absolute. No seed ⇒ the close records the closing position in the
   receipt and the tie defers to the next close — and that deferral is itself a **drawer-2 gate row**
   (`continuity_tie_deferred`, default-refuse-attestable), never a silent skip. *(The fix for round
   1's finding that "record and defer" quietly softens a drawer-1 absolute: the absolute holds wherever
   a seed exists, and its absence becomes a visible, attested, receipt-recorded decision. builder
   choice; minting a seed inside `finalize_close` would put a second author on an already-audited
   one-shot registry.)*
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
  attestation (who/why/when), the per-account closing TB, the per-asset FA continuity roll, the AR/AP
  tie terms, and the bank-recon receipt ids consumed. The 0040 posture applies: the DDL demands *some*
  object payload; **enumeration completeness is the belt's job**, asserted by a trigger, not a CHECK
  (`0040_wave_c_c_tieout.sql:296-298`).
- **Immutability:** two triggers mirroring `_tf_bank_reconciliation_transition` (`0040:351`,
  whole-row-minus-lifecycle-columns compare) and `_tf_bank_reconciliation_no_delete` (`0040:379`). The
  only permitted transition is `active` → `superseded`, and only by `reopen_fiscal_year`.
- **`clara.verify_close(p_receipt uuid) returns jsonb`** — recomputes every identity **from scratch**
  and diffs recomputed-vs-stored, never re-deriving from the snapshot it is checking
  (`verify_bank_reconciliation`'s discipline, `0040:4537-4644`). Split: a **STRICT half** (the four
  drawer-1 identities + the RE roll + the opening tie) that fails `verified`, and an **INFORMATIONAL
  half** (drawer-3 counts, enumeration drift) that is reported and never fails. This is the seven-year
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

Effects, in one transaction under the EXCLUSIVE `203005007`, **in this order — the order is REQUIRED,
not incidental**: `fiscal_years.status` becomes `reopened` **first**; then the current receipt goes
`active` → `superseded` and a `kind='reopen'` receipt chains to it via `prior_close_receipt_id`; then
the closing entry is **reversed, never deleted** through `clara.reverse_entry` — the audited verb, not
a hand-written unwind (PRD invariant 8). *The ordering is load-bearing because §2.5's wall refuses the
`reversed_by` UPDATE `reverse_entry` performs on an entry inside a `closing`/`closed` FY; flipping the
status first is what makes the reversal reachable, and the reopen's own `close_write_permits` row
(`purpose='reopen_reversal'`, `target_entry_id` = the closing entry) covers the mirror.* The reversal
takes its row lock under `lock_timeout` per §2.1's cycle analysis.

**A reopened FY re-closes through the same path** (`begin_close` accepts `reopened` as well as `open`,
§2.1 → gates → `finalize_close`), so the second receipt chains onto the reopen receipt and the whole
history is walkable.

*(Citation caveat, stated because v1 invited a harvest: `0009_coding_floor.sql:1697-1748` is cited
anywhere in this packet as a **shape reference only** for `reverse_entry`'s in-body mirror.
`reverse_entry` has itself been recut by 0037/0038/0042 — its name appears in each of those tails'
rosters — so its live body, like `approve_wrong_client_correction`'s, is only readable via
`pg_get_functiondef`.)*

### 2.9 E-R6 activation — rewriting ONLY the stub body

*(ruled — E-R6.)* The activation is **one function body**: `clara._correction_period_state`
(`0007_document_pipeline.sql:2420-2424`). Given §0.3's correction, the new body must keep
`'no_period_model'` as the **PERMIT** token — and must fail CLOSED everywhere else:

```sql
create or replace function clara._correction_period_state(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  -- The returned string is a PROTOCOL token, not a description. Its spelling is FROZEN by the
  -- live guard in clara.approve_wrong_client_correction, which refuses on <> 'no_period_model'.
  -- Honest state for every other consumer: clara.correction_period_state(p_entry).
  select coalesce((
    select case
             when fy.id is null                     then 'no_period_model'  -- outside any FY: permit
             when fy.status in ('open','reopened')  then 'no_period_model'  -- permit
             else fy.status                                                 -- closing|closed: REFUSE
           end
      from clara.journal_entries je
      left join clara.fiscal_years fy
        on fy.client_id = je.client_id
       and je.posting_date between fy.starts_on and fy.ends_on
     where je.id = p_entry
     order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
     limit 1
  ), 'entry_missing');
$$;
```

- **Missing entry now FAILS CLOSED — the v1 ruling is reversed.** The original returned NULL for an
  unknown entry, and `NULL <> 'no_period_model'` is NULL, so the `exists(...)` guard did not fire: a
  fail-OPEN branch. The `coalesce(…, 'entry_missing')` sentinel is `<> 'no_period_model'`, so the
  **untouched** guard refuses. The decision was made on **fail-open-vs-fail-closed grounds** (the
  standing law: absence falls to the fail-closed branch), not on naming — and it costs no recut of the
  audited guard, because the sentinel is produced by the body being rewritten.
- **Multi-FY ambiguity fails closed too.** Without an `ORDER BY`, two matching FY rows return an
  arbitrary one and an `open` pick would PERMIT a correction into a closed period. `order by (fy.status
  in ('closing','closed')) desc, fy.starts_on desc limit 1` makes the closed state win. §2.1's
  contiguity trigger should make two matches impossible — but that is a derived state, and a guard
  never rests on one.
- **The structural prerequisite** is §2.1's explicit `clara_fn_owner using(true)` policy on
  `fiscal_years`: without it this definer read sees zero rows and returns the permit token for the
  whole estate. A matrix cell asserts the definer read SEES FY rows.
- **The honest twin.** `clara.correction_period_state(p_entry)` returns
  `open|closing|closed|reopened|none|entry_missing` for panels and new writers. **The two existing
  READERS are repointed to it in the same migration** — `clara.retire_document_filing` (`0027:428`)
  and `clara.preview_wrong_client_correction` (`0007:2459`, live text spliced by `0017:104-112`). They
  are **reads, not audited writers**, so the repoint costs no D1 exposure; and leaving them on the
  protocol token would have the correction preview tell a human `"no_period_model"` for an **open**
  period — two vocabularies in one payload, on the surface whose job is to say whether a correction is
  safe.

**The review-provable claim, stated as the assertions that prove it.** The migration's tail must, in
the same transaction:

1. read `md5(prosrc)` of `clara.approve_wrong_client_correction` in a **prestate** probe **before** any
   DDL and re-read it at the tail — equal, or RAISE. (A prestate/tail pair measured inside the
   migration proves the migration did not touch it; "we did not edit it" proves nothing.) This is a
   live-catalog instrument and is unaffected by §0.3's correction.
2. positively assert the live `prosrc` still contains the exact literal
   `clara._correction_period_state(i.entry_id)<>'no_period_model'`.
3. enumerate, from `pg_proc` and not from file text, **every** function whose body references
   `_correction_period_state`, and assert the set equals exactly **`{approve_wrong_client_correction,
   retire_document_filing, preview_wrong_client_correction}`** — the three §0.3 measured — with the
   guard PREDICATE pinned to the first. A fourth caller appearing is a finding, not a surprise to
   discover later (0042's own rule for roster assertions, `0042:5536`). *(After the repoint in step 4
   the expected set is `{approve_wrong_client_correction}` alone; the tail asserts the BEFORE set and
   the AFTER set, so both the discovery and the repoint are proven.)*
4. repoint the two readers to `clara.correction_period_state` by the same PATCHED-NOT-REBUILT splice
   discipline §3.3 uses, and post-assert.

**Acceptance obligation (E-R6, named):** the sandbox battery must exercise the guard deliberately —
force a correction against an entry inside a `closed` FY, observe `CLR19 'correction touches a closed
period'` verbatim, observe the same correction SUCCEED against an `open` FY, and observe an unknown
entry id REFUSE. A guard that never refused is a guard that was never asked (ADR-066).

### 2.10 E-R11 — the three keys, as DB objects

*(ruled — E-R11: keys ②③ separately grantable, firm-owner-only grant/revoke, every grant an audited
act, factory default owner/partner, the agent structurally key-less.)*

**`clara.firm_capability_grants`** — the table that does not exist today (§0.1):

```
id uuid pk · firm_id uuid not null references clara.firms(id)
user_id uuid not null references clara.users(id)
capability text not null check (capability in ('close_and_attest','reopen'))
granted_by uuid not null references clara.users(id) · granted_at timestamptz not null default now()
revoked_by uuid · revoked_at timestamptz · reason text
unique index uq_capability_active (firm_id, user_id, capability) where revoked_at is null
```

Append-only in spirit: a revoke stamps `revoked_at`; rows are never deleted, so the history of who
could sign when is permanent.

- **Writers:** `clara.grant_firm_capability(p_user, p_capability, p_reason, p_op_key)` /
  `clara.revoke_firm_capability(...)`. Floor: the caller's **active membership role must be
  `'owner'`** — not merely `role_rank >= 3`, but the literal role, read from `clara.firm_memberships`
  (`0002_foundation.sql:211-219`; the four-literal CHECK is `0002:215`). Each rides `_reserve_op` /
  `_audit` / `_finish_op`.
- **Resolver:** `clara._has_capability(p_firm, p_user, p_capability) returns boolean` — true iff an
  active grant exists **or** the user's active membership role is `'owner'` (the factory default).
  Key ① (prepare) is the existing `role_rank('bookkeeper')` floor and needs no new object.
- **Refusal:** `CLR04` + `reason='capability_missing'` + the capability named in `detail`.
- **The factory default is PROPOSED, not decided — it is an owner question** (§6.2). E-R11's ruled
  default is "owner/partner only"; `'partner'` has no structural representation in the role model
  (`0002:215`), so `owner`-only is the closest mechanical reading and is what §6.2 proposes, pending
  one line from the owner. Adjustable in one `_has_capability` predicate.
- **Keys ② and ③ are separately grantable**, which is a ruled property and therefore a cell: grant ②
  alone and prove `reopen_fiscal_year` still refuses `CLR04`.

**Segregation of duties** *(ruled — E-R11 defers to PRD §2's existing hard gate).* `finalize_close`
mirrors the live maker/checker mechanics rather than inventing a parallel one — **and it measures the
EDITOR, not the approver.** E-R11's words are "a DIFFERENT human from the last human **editor/
preparer**"; `checker_actor` is the approver. The preparer column exists and is
`journal_entries.last_human_editor` (`0003_books_core.sql:116`) — exactly the column
`_approve_entry_core` itself tests (`0004:541`). *(v1 computed the preparer from `checker_actor`,
which would let a human who prepared every entry and had a colleague approve them close their own
year.)*

- **Predicate:** `clara.eligible_checker_count(c.firm) >= 2` (`0004:81`, used at `0004:542`) ⇒ the
  closer must differ from the FY's last human preparer. Equal ⇒ `CLR41 close_segregation_violation`.
- **Population, named:** every `clara.journal_entries` row of the client whose `posting_date` lies
  within `[fy.starts_on, fy.ends_on]`, **any status** — drafts included, because close-prep edits are
  precisely the entries a preparer touched that are not yet approved.
- **Ordering column, named:** `order by coalesce(je.approved_at, je.updated_at) desc, je.id desc limit
  1` (`approved_at` is `0003:120`; the draft→approved UPDATE stamps it and the lifecycle allowlist is
  `0003:367-370`; 0040's own "approved as of T" reading of the column is `0040:1017-1023`).
- **Actor, read positively:** `coalesce(last_human_editor, maker_actor)` of that row —
  `last_human_editor` is nullable (`0003:116`), and a NULL must fall to a read that saw something, not
  to "no preparer".
- `< 2` eligible humans ⇒ the solo branch: `p_self_attestation` is required non-empty and stored on the
  receipt as `self_attestation` with `segregation_mode='solo_self_attested'` — the shape
  `journal_entries.self_approval_attestation` already uses (`0003:118`). Missing ⇒ `CLR41
  close_self_attestation_required`.

**The grant matrix — mirroring 0004's, with the agent row EMPTY.**

| Role | New EXECUTE grants |
|---|---|
| `clara_authenticated` | `open_fiscal_year`, `propose_fiscal_year`, `begin_close`, `attest_close_exception`, `finalize_close`, `abandon_close`, `reopen_fiscal_year`, `grant_firm_capability`, `revoke_firm_capability`, `record_client_fact`, `mint_month_snapshot`, and every close READ |
| `clara_agent_ro` | **the READS only** — `get_close_readiness`, `list_fiscal_years`, `verify_close`, `get_close_plan`, `snapshot_state`. **Zero close/approve-class verbs.** |
| `clara_wake_interactive` / `clara_wake_proactive` | **nothing** |
| `clara_runtime` | **nothing in E-a** *(builder choice — month snapshots are human-initiated in E; scheduling is Wave G, and a grant added "for later" is a grant nobody reviewed for its actual use)* |
| everyone else | nothing — the file opens with the standing schema-scoped `revoke execute on all functions in schema clara from public` posture (`0004:752-753`) |

The internal helpers (`_has_capability`, `_tf_period_wall`, `_close_*`) stay **ungranted**, per
`0004:748-750`'s stated rule. The structural consequence CLAUDE.md names: a `select
clara.finalize_close(...)` under the agent role fails with `42501` **before the body runs**. The tail
asserts this **positively and by privilege, not by grant-statement text** — for every new function,
`has_function_privilege('clara_agent_ro', oid, 'EXECUTE')` must be **false** for the writer set (and
the sweep runs under every non-`clara_authenticated` role), because a diff of grant statements reads a
projection of the privilege state, not the state.

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
on `clara.journal_entries`, **`clara.open_item_allocations`**, the FA register rows, and
`clara.bank_reconciliations` insert a `stale` assessment for every not-yet-stale snapshot of that
client that the mutation's effect **intersects**. Because the trigger is part of the mutating
statement there is **no asynchronous window** — Invariant-4 discipline, satisfied structurally.

- **The predicate is INTERSECTS + a watermark, not date containment** *(the v1 narrowing, corrected).*
  E-R3 rules staleness for "any audited mutation whose effect **intersects** an already-snapshotted
  period … anything that moves a number the snapshot presented" (`wave-e-contract.md:79-85`). A
  posting into month M−1 moves month M's opening, YTD and comparative figures without its
  `posting_date` falling inside M. So the test is: mark stale when the mutation's **effect date ≤
  `period_end`** and the mutation is **not already inside the snapshot's `books_watermark`**. Effect
  date = `posting_date` for JE rows, `effective_date` for allocation rows (producer law
  `0040:864-877`), the register act date for FA rows, the reconciliation's period end for bank rows.
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

**The writer set — a REVIEW instrument, not the mechanism.** E-R3 names the class; the list below lets
a reviewer check each named writer's effect path against a trigger. It is deliberately **not** the
enforcement, because enumeration is exactly what this repo has proven it gets wrong (§2.5).

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
| 12 | FA particulars/enrolment (`complete_fixed_asset_particulars` `0041:3035`, `revise_fixed_asset_particulars` `0041:3112`) | register rows | FA trigger |
| 13 | `void_bank_statement` (`0038:2211`) and the bank receipt lifecycle | `bank_reconciliations` / statement rows | `bank_reconciliations` trigger |

**The honest boundary, stated rather than papered over.** Three classes still mint no staleness row:
(a) a fact none of these tables owns (a counterparty rename, a chart relabel); (b) the bank
**exception** doors `except_bank_line` (`0040:3222`) and `resolve_bank_line_exception` (`0040:3372`),
which move a presented bank position by writing match/exception rows rather than any table above; (c)
anything a future writer adds. All three are caught only by **`clara.verify_snapshot(p_snapshot)`**,
which recomputes the dataset and diffs `dataset_sha256` against the stored one. That is a real limit
and it belongs in the acceptance matrix as a named negative case — `verify_snapshot` gets its own
cell — not in a footnote.

**Per-writer act-dating disposition (E-R2's "no writer escapes" for the non-JE money movers).** §2.5's
wall sits on `journal_entries`/`journal_lines`; the table below states, for each money- or
figure-moving writer that touches neither, what its date anchor is and how it is contained. It is a
REVIEW instrument plus targeted coverage — not N writer recuts.

| Writer | Date anchor | Proving line | Containment |
|---|---|---|---|
| `apply_open_items` | the ACT date, `clara._book_today()` | splice `0042:4896-4903`; producer law `0040:864-877`; header `0040:6148-6160` | not wall-covered (no JE); **staleness via the allocation trigger**; forward-dating bounded by §3.1's new guard |
| `unallocate_group` | the ACT date (`created_at::date`), with the R9 `greatest()` ordering guard | producer law `0040:864-877`; `0037:3190-3197` | same |
| `allocate_receipt` / `allocate_payment` | the settlement entry's `posting_date` | comment `0044:1262-1263`; wall `0044:1266-1272` | JE-bearing ⇒ **wall-covered**; the unborn-item wall already refuses backdating |
| `except_bank_line` · `resolve_bank_line_exception` | **UNREAD — a build obligation, not an assumption** | bodies at `0040:3222` / `0040:3372` | β/γ reads both bodies, records the anchor here, and either extends the wall's sibling set or names them in the honest boundary above (they are named there today) |
| `void_bank_statement` | **UNREAD — same obligation** | body at `0038:2211` | `bank_reconciliations` trigger covers the receipt side; the statement side is the read owed |
| FA particulars (`0041:3035`, `:3112`) | register act date | bodies at those lines | FA trigger; a particulars edit moves no GL |

**RS is the witness** (E-R9): snapshot a month, post into it, watch the label. Note for the matrix
author — E-R9's "19 approved real invoices" is **stale** as of ADR-066; **verify the live count before
citing it, and cite no number here**.

### 2.12 `clara.reporting_periods` — the period registry *(lane γ; the E-b build dependency)*

E-b binds `metric_cells.period_ids` and `days_in_period` to "the E-a period row". `fiscal_years` is an
FY, and `period_snapshots` is an artifact; neither is a month/quarter period with an id. γ therefore
mints the registry, and δ **build-depends** on it (§1's lane table):

```
clara.reporting_periods
  id uuid pk · firm_id · client_id
  grain text not null check (grain in ('month','fiscal_year'))
  period_start date not null · period_end date not null   -- both ends INCLUSIVE
  fiscal_year_id uuid references clara.fiscal_years(id)   -- required when grain='fiscal_year'
  minted_by uuid not null references clara.users(id) · minted_at timestamptz not null default now()
  unique (client_id, grain, period_start, period_end)
  check (period_end >= period_start)
```

- `days_in_period(p_period)` = `period_end - period_start + 1`, read from this row — one definition,
  one place, no evaluator-local arithmetic.
- Rows are minted by the same audited door that mints a snapshot (and by `open_fiscal_year` for the
  `fiscal_year` grain), so a period id always has an author. Immutable after mint; no delete.
- Reads are granted to `clara_authenticated` and `clara_agent_ro`; no wake or runtime write grant.

---

*Part 2 ends at §2.12. **§3 onward — the E-R12 trio (lane α), lane θ, the E-b/E-c pointers and the
open-question ledger — continue in
[`wave-e-design-skeleton-part3.md`](./wave-e-design-skeleton-part3.md).* Section numbering is
continuous; the three files are one document.*

