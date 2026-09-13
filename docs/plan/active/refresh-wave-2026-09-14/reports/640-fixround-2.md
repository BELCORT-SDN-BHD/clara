# #640 — SECOND review fix round on `impl/640-accounting-plans`

**Worktree** `C:\Users\zhant\Desktop\clara-wt\640` · worktree CLEAN.
**New commits**: `1d6c5718` fix(db) · `533254a1` test(db) · `b7318552` test(runtime) · `1fb5b249` fix(web) · `9fc18935` docs.
**Rig** `rig640c` 55452/`clara_640`, built from scratch on the final 0193 (`183 new · 183 total`, exit 0, 241 s); re-run → **0 new**. Reds were measured on `rig640b`. Neither existing rig was reset; the reset/role-sweep flags were never set.

## The rule I chose

> A reversal occurrence is admissible only when its own period's accrual has **POSTED** — its Work carries a COMMITTED receipt whose journal entry is still live (approved, not itself reversed) — and the reversal **names that `entry_id`**: on the occurrence row (`reverses_entry_id`, a real FK, with a CHECK making "an admitted reversal naming no entry" a row the table cannot hold) and in its own memo, the one part of the basis that reaches `clara.journal_entries`.

## finding → what I did → evidence

| finding | what I did | evidence (cell + output) |
|---|---|---|
| **BLOCKER-1** | deleted `_plan_primary_stands`; picker **and** catch-up door both ask `clara._plan_primary_entry`; entry written to the row and appended to the memo; refusal carries `primary_state` (`no_occurrence`/`not_posted`/`entry_not_live`) | `p640.occ.reversal_after_cancel` — pre-fix RED *"a reversal must not be admitted while its accrual is merely QUEUED; got [["2026-08-31","primary"],["2026-09-01","reversal"]] · 2 !== 1"* (the reviewer's pair). Plus `p640.occ.reversal` (happy path), `.reversal_before_primary`, `.reversal_refusal` |
| …on the World | e2e leg 5: accrual admitted → belt admits NOTHING → accrual posts → belt admits the reversal naming it → **the reversal posts**, ledger memo carries the id | `[plan-e2e] PASS 5: the reversal waited for the accrual's entry (e3dcfd71…), named it, and posted`; `[plan-e2e] OK`, exit 0 |
| **MINE: the first cut was unpostable** | `reverses_entry_id` as a new basis key left the digest intact but `journalBasisSchema` in the FROZEN `claraWork.v1.tools.ts` is `.strict()` — the run's echo failed validation. Moved into the memo | leg 5 RED: *"(error={"code":"no_effect","reason":"no_receipt"…}) + 'failed' − 'completed'"*; green after |
| **SHOULD-1** | `revise_accounting_plan` refuses CLR10 `period_already_covered` when the frequency changes and the new alignment's first period starts on or before `_plan_covered_through`; names the period and the earliest lawful `effective_from` | `p640.revision.frequency_alignment` — pre-fix RED *"expected SQLSTATE CLR10 but the call SUCCEEDED"*; both directions + an unchanged-frequency arm |
| …form mirror | `validatePlanSchedule({currentFrequency, coveredThrough})` + `planPeriodStart`; one `en.json` key; `get_accounting_plan` answers `covered_through` | `lib/plans/schedule.test.ts` — RED with the guard stubbed (`# fail 1`), then **11/11** |
| **SHOULD-2** | append-only `attempts` jsonb ledger, projected by the list door; `get_work_plan_origin(old)` resolves via GIN containment and answers `superseded`/`attempt`/current `work_id` | `p640.occ.attempts` — pre-fix RED *"the occurrence carries its attempts · expected true, actual false"* |
| **NOTE-2** | the only surviving status test is `_plan_work_stands`, naming `stopping`; the reversal wall reads no status at all | `p640.occ.reversal_stopping` (pre-fix RED: `_plan_primary_entry` absent) — `stopping` opens no reversal and is not re-attemptable |
| **NOTE-3** | picker comment no longer cites the deleted helper; tail asserts `_plan_primary_stands` is gone | §J check 9 |
| MINE: entry liveness | a reversed accrual entry is not reversible again | `p640.occ.reversal_entry_reversed` |
| **KEEP** | bookkeeper floor unchanged; 0045 digest pins untouched; identity race already a cell | `p640.auth.scope`, §0/§J hashes, `p640.occ.duplicate` — all ok |

## Counts

db plan batteries **35/35, 0 skip**; neighbours (operation-census, rig-isolation, x40-wave-c-c-tieout, work-cancel) **118 · 117 pass · 1 skip** (rig-isolation's destructive cell). Runtime units **74/74**. World e2e OK. Touched web files **36/36**. Whole apps/web suite **3395 · 3394 pass · 1 fail** — a load flake in a file I never touched (`thread-live-clarify.test.tsx`), **2/2 in isolation**; named, not fixed. Playwright `e2e plans` **9 passed**. `typecheck` 0 · `lint` 0 · frozen check OK.

## Residual I deliberately left

**A human reverses the accrual's entry between the reversal's admission and its posting.** Admission re-reads liveness, so the window is exactly that gap, but nothing revokes an already-admitted reversal inside it. Closing it needs a wall in `clara._record_journal_entry_core` — a body 0193 may not recut (0194/0195 pin it by sha256, and the closure review's merge-order verdict rests on 0193 having no `create or replace` and no foreign `alter table`). Stated in ARCHITECTURE §8; worth its own ticket. The hole it replaces needed no human at all.

Still open from round 1: the bookkeeper floor (owner-flagged) and 0045↔0193 convergence. `attempts`/`reverses_entry_id` reach the web types but nothing renders them yet. **Unverified:** hosted evidence (none claimed).
