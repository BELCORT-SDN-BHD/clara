# WAVE E — DESIGN SKELETON v2 · **PART 3** (§2.9–§2.12)

> **CONTINUATION of `wave-e-design-skeleton.md` + `-part2.md` — one document in four files** (the
> repo's 500-line file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split precedent). Part 1
> carries §0 (verification ledger + three corrections) · §1 (campaign frame, lanes, ceremony) ·
> §2.1–§2.4 (period spine, gate catalog, drawers 1–2). Part 2 carries §2.5–§2.8 (drawer 3 + the
> closed-period wall and its permit, continuity math, the close receipt family, the reopen path).
> **This file carries §2.9 (E-R6 activation) · §2.10 (the E-R11 keys) · §2.11–§2.12 (lane γ — month
> snapshots, staleness, the period registry).** `wave-e-design-skeleton-part4.md` carries §3 (the
> E-R12 trio, lane α) · §4 (lane θ) · §5 (E-b/E-c pointers) · §6 (open questions + decisions).
> Section numbers are continuous across the four files; citations like "skeleton §2.9" and
> "skeleton §2.11" resolve here, "skeleton §2.5" in part 2 and "skeleton §3.1" in part 4. **THE
> PACKET IS SEVEN FILES**; the other three: `wave-e-design-reporting.md` (§0–§5),
> `wave-e-design-reporting-part2.md` (§6–§12), `wave-e-acceptance-matrix.md`. Part 1's banners,
> markers and evidence discipline apply unchanged: the contract wins; EXISTS claims carry
> `file:line` reads taken **2026-08-09 at the v2 fix pass**; migration numbers and `CLRnn` codes
> claim at MERGE.

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
- **The factory default is CONFIRMED: `owner` only — ruled by the owner 2026-08-09** (§6 item 2
  carries the ruling record). E-R11's contract wording is "owner/partner only"; `'partner'` has no
  structural representation in the role model (`0002:215`), so `owner`-only is the honest mechanical
  reading — a partner who is not the firm owner joins by explicit audited grant. Adjustable in one
  `_has_capability` predicate.
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

---
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

  > **QUALIFICATION (lane γ R2 confirming round, 2026-08-11) — "move every AR/AP aging figure" is
  > true of the MECHANISM, not unconditionally true of every CALL.** Read plainly, the sentence above
  > promises that any `apply_open_items`/`unallocate_group` act moves a presented figure; the E7/E8
  > adjudication (this section's own row-11 writer-table entry, and the matrix's E7/E8 cells) never
  > reached back to correct THIS passage even though it corrects the consequence. Both verbs stamp
  > `effective_date = clara._book_today()` — the ACT date, never a caller-supplied one — so against an
  > ALREADY-COMPLETED month (the only kind `mint_month_snapshot` will snapshot), `_subledger_
  > outstanding_asof`'s own `effective_date <= p_as_of` filter excludes a today-dated allocation from
  > that month's `as_of = period_end` recompute: the figure a management pack PRESENTS for that month
  > does not move. That is the accounting-correct outcome, not a gap. The mechanism DOES reach a
  > presented figure when the allocation is genuinely backdated into the snapshotted period — which,
  > for these two verbs, is unreachable (no date argument exists on either); the backdatable reach into
  > a real, date-bearing allocation is via the **posting-dated `approve_*` paths** (row 3,
  > `allocate_receipt`/`allocate_payment`, whose date anchor is the settlement entry's own
  > `posting_date`).

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
| 8 | `approve_wrong_client_correction` (live body via `pg_get_functiondef`, §0.3) | reverses at the FROM client; **does NOT re-book at TO** (see the amendment below) | JE trigger, FROM client only, at the correction's own approve |
| 9 | the opening machinery (`approve_opening_seed` `0017:3825`, `supersede_opening_item` `0017:4047`) | books opening entries | JE trigger |
| 10 | `finalize_close` (§2.6) | the closing entry | JE trigger (correctly: a close makes every prior month's pack stale) |
| 11 | **`apply_open_items` (`0037:3225`) / `unallocate_group` (`0037:3141`)** | `open_item_allocations` rows ONLY — zero GL | **`open_item_allocations` trigger** *(the v1 defect)* |
| 12 | FA particulars/enrolment (`complete_fixed_asset_particulars` `0041:3035`, `revise_fixed_asset_particulars` `0041:3112`) | `clara.fixed_assets` rows — UPDATE at `0041:3086`, INSERT at `0041:3209` | FA trigger |
| 13 | **`void_bank_statement` (`0038:2211`)** | **`clara.bank_statements`** — `update … set status='void'` at **`0038:2270-2272`**; the statement's LINES are row-locked (`0038:2254-2255`) but not written | **`bank_statements` trigger** *(the v1 defect: row 13 named the `bank_reconciliations` trigger, which this verb never touches)* |
| 14 | `complete_bank_reconciliation` (`0040:1587`, insert `0040:1963`) / `void_bank_reconciliation` (`0040:2057`, update `0040:2119`) | `bank_reconciliations` rows | `bank_reconciliations` trigger |
| 15 | **`except_bank_line` (`0040:3222`) / `resolve_bank_line_exception` (`0040:3372`)** | **`clara.bank_line_exceptions`** — INSERT at `0040:3320-3325`, UPDATEs at `0040:3550-3555` and `:3558-3563` | **`bank_line_exceptions` trigger** *(newly covered — see the boundary note)* |

> **ROW 8 AMENDMENT (lane γ Codex round adjudication, 2026-08-11) — "BOTH CLIENTS MARK" WAS WRONG,
> READ FROM THE LIVE BODY.** `approve_wrong_client_correction` reverses the misfiled entry at the
> FROM client (the mirror lands in `journal_entries`, marking FROM's snapshots via the row-1 JE
> arm, in the correction's own transaction) — but it does **not** insert or approve any entry at the
> TO client. Its live body retires the document's filing and opens a coding task at TO; the TO
> client's books move only LATER, when that task is recoded into a draft and a human approves it —
> an ordinary row-1 JE-arm marking, at its own later transaction, not part of the correction's act.
> "Fires per row, so both clients' snapshots mark" conflated "the correction touches two clients'
> attribution" with "the correction books at two clients" — it books at one. A cell built on the old
> claim (asserting TO marks stale INSIDE the correction's own transaction) would assert a positive
> that the live body does not perform.

**The class the census will find COVERED, recorded so it is not rediscovered as a hole.** The FA
depreciation tables — `clara.fa_depreciation` (`0041:519`), `clara.fa_depreciation_authorities`
(`0041:614`), `clara.fa_depreciation_runs` (`0041:699`) — are read by the FA tie and carry **no**
§2.5(B) wall trigger of their own, and need none: the depreciation belt always books a journal entry,
so every run is serialized by the JE wall and marked stale by the JE trigger (row 6). That is a
conclusion the migration-tail census **proves** rather than assumes, and it is exactly the shape of
answer the census exists to produce — a named mover whose effect table is covered by a different
trigger passes; one whose effect table is covered by none RAISEs.

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

---

*Part 3 ends at §2.12. **§3–§6** — the E-R12 trio (lane α), lane θ, the E-b/E-c pointers and the
open-question ledger — continue in
[`wave-e-design-skeleton-part4.md`](./wave-e-design-skeleton-part4.md).* Section numbering is
continuous; the four files are one document.*
