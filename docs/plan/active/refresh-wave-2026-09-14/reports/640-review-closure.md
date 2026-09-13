# #640 — closure + adversarial review

`impl/640-accounting-plans` @ `28db2338`, worktree CLEAN. Rig `rig640b` 55443/`clara_640`.
`migrate.mjs` → **0 new · 183 total**. DB battery (exact `package.json` "test" gates, both plan
files) → **31 · 31 pass · 0 fail · 0 skip**. Runtime units **74/74**. Frozen check OK (264).
Playwright `plans-walk`: **8/9 per run, twice, a different cell each time** — walk1 lost :115 to `page.goto /login net::ERR_ABORTED`, walk2 lost :88 to `Protocol error … session closed`; both are browser/host deaths on a loaded box, not product assertions. Union across the two runs: **9/9**.

## A · Closure of the worker's table

| finding | verdict | cell — what goes red |
|---|---|---|
| B1 revision double-posts | CLOSED | `p640.revision.no_double_post`: moves the due day inside a posted month, re-scans (still 1 occurrence), catch-up refuses one `period_already_admitted`. Re-measured |
| B2 naked reversal | **OPEN** | the three `reversal_*` cells are behavioural but close the **admission-time** law only → BLOCKER-1 |
| B3 `effective_from` backwards | CLOSED | `p640.revision.authority_floor`: CLR10, forward-then-back, catch-up refused. Re-measured |
| S4 ended-plan, unlocked read | CLOSED | asserts `prosrc` (flagged). **Raced it**: `end` open on A, `revise` on B waited on the plan row lock then `CLR10 plan_ended`; revision 1 still live |
| S5 wrong revision printed | CLOSED | `p640.occ.retry_intent_key`, behavioural |
| S6 final accrual reversible | CLOSED | `p640.occ.final_reversal`, behavioural |
| S7 cancelled Work unpostable | CLOSED | `p640.catchup.reattempt`: real cancel, `:a2` key, completed period not re-attemptable → SHOULD-2 |
| S8 tail over-claimed | CLOSED | §J re-reads catalog + re-hashes the five 0045 bodies; 0193 has **zero** `create or replace`, zero foreign `alter table` |
| MINE B2-via-cancel | CLOSED for its case | superseded by BLOCKER-1 |
| MINE dead helper | CLOSED | `to_regprocedure('…_plan_due_event_on_or_before(uuid)')` → null (NOTE-3) |
| MINE cadence claim | CLOSED | qualified by NOTE-1 |
| MINE form mirror | CLOSED | `lib/plans/schedule.test.ts:51` |
| MINE sweep red | CLOSED | runtime 74/74 |
| MINE census reds | CLOSED | manifest +2, nav repointed, `adjustments` still in workbench TABS |
| MINE untested laws | CLOSED | `p640.revision.immutable` |

## B · Findings

**BLOCKER-1 — a reversal Work outlives its accrual's death and posts a naked reversal.**
`_plan_primary_stands` runs **once**, at admission; "stands" = *admitted, not yet a dead end*, so a
`queued` accrual with zero receipts qualifies. Measured:

```
scan #1 -> [["2026-08-31","primary","W"]]   accrual queued, receipts 0
scan #2 -> +["2026-09-01","reversal","W"]   admitted while accrual queued, receipts 0
cancel_accounting_work(accrual) -> cancelled, receipts 0
  clara._plan_primary_stands(plan,'2026-08-31') -> false      <- too late
reversal Work still queued; claim + wake_record_journal_entry + settle -> entry written
ledger: 2026-09-01  Dr 1150 99000 / Cr 6100 99000  (one entry, reversing nothing)
```

B2's own ledger consequence by a path the fix misses, needing only two cycles after a leader outage
across the accrual (the scenario `p640.occ.reversal_before_primary` describes) plus one 0184 cancel;
same shape when the accrual settles **failed** (a locked period) while the reversal's month is open.
No cell catches it — `p640.occ.reversal` encodes "reversal admitted next scan while the accrual is
unposted" as correct. Fix: gate on a **committed receipt**, or cancel the period's reversal Work
when the accrual dies without one, or carry the accrual's `entry_id` into the reversal basis.

**SHOULD-1 — frequency changes double-cover periods; the filed residual names the wrong mechanism.**
Both directions reach it through the **plain scan**. Quarterly→monthly: quarter `2026-08-01` posted
(Aug–Oct), next scan admitted primary `2026-09-01`. Monthly→quarterly on a partial history: monthly
`2026-09-01` posted, scan then admitted quarterly `2026-08-01`. September covered twice either way.
Where keys coincide the guard holds. `unique (plan_id, leg, period_key)` is exact per alignment,
blind across alignments. Not a merge blocker (C-39 asks only that a revision preserve predecessor
and past runs) — re-file with this measurement.

**SHOULD-2 — the cancelled attempt is orphaned.** After a re-attempt,
`list_accounting_plan_occurrences` never names the old `work_id`, `get_work_plan_origin(old)` →
`null`, and this frontier has no `list_*work*` door. Only `clara.audit_log` keeps it.

**NOTE-1 — cadence, qualified.** `clara_runtime` correctly cannot read the tables (`42501`). As
owner: Seq Scans on `accounting_plans` (73 rows) and `_revisions`, picker in the Filter — 65 active
plans, **36.5 ms**, every cycle. Occurrence probes are `Index Only Scan using
uq_plan_occurrences_plan_due`, so §8's "no seq scan on the occurrence table" is accurate; "two
partial indexes bound the row source" holds logically, not as an access path at this size.
**NOTE-2** `_plan_primary_stands` tests `('cancelled','failed')`; 0184's transient `stopping` is
absent. **NOTE-3** the picker's comment still cites the deleted `_plan_due_event_on_or_before`.

**Measured clean.** Identity race — two concurrent `clara_runtime` scans of one due date: the second
waited on the plan row lock, answered `converged:true` with the same `work_id`; one occurrence, one
Work. KL not UTC — at KL `2026-09-14`/UTC `2026-09-13`, due `2026-09-14` admitted, `2026-09-15` not
picked. Monotonicity — below the floor CLR10, equal accepted, a later revision earlier than the
previous `effective_from` but ≥ `authority_from` allowed and harmless. Authority — bookkeeper
creates/revises/catches up (owner-flagged floor, restated not changed); viewer CLR04 on write, reads
fine; cross-firm id and invented uuid both → identical `CLR11 plan_not_found`. RLS/ACL — RLS+FORCE
on all three, `relacl` NULL, owner-only policies, no table privilege for runtime or authenticated,
30 DEFINER functions with `search_path=clara, pg_temp`, PUBLIC revoked, 11 doors to
`clara_authenticated`, scan to `clara_runtime` alone; five 0045 doors intact. Belt — per-cycle
exact-signature detect, `dormant()`/`failed()` never a throw, bounded 25, inside `belt()`; per-plan
isolation evidenced by global scans over 65 active plans never poisoning a sibling.

## C · Merge order (0193 after 0188–0192, before 0194–0195)

| file → object | verdict |
|---|---|
| 0188 operator-support fns; 0190/0191 document doors + tables | no collision |
| 0189 `list_accounting_work`, `get_accounting_work_row`, `save_my_preferences` | no collision — no name matches 0193's §0/§J censuses |
| 0192 `knowledge_plan_item_map`, `promote_plan_answers_to_knowledge` (**onboarding** plans) | no collision |
| **0194** `create or replace admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)` → delegation | **safe** — identical signature/grant, no overload, 0193's call resolves; core returns `{work_id, task_id, logical_op_id, status, replayed}` |
| 0194 `alter accounting_work`; `_record_journal_entry_core`, `_tf_accounting_work_immutable`, `_close_gate_closing_stock` recut | safe — 0193 pins none; FK targets `accounting_work(id, firm_id, client_id)` |
| 0194 prestate: sha256 ×4, both purpose CHECKs one-valued, no `adjustment_basis` | **satisfied** — 0193 has no `create or replace`, no foreign `alter table` |
| 0194 vs the five 0045 doors; 0195 `_record_journal_entry_core` pinned at the **0194** body | untouched / no collision |

No pre-state pin fails under the real order, either direction.

## D · Standards

Frozen OK; manifest +2; `en.json` under `Plans`; ARCH §6 rung, §8 laws + cadence, §11 measured
counts with hosted pending; PRD §5.4 — factual subject to NOTE-1. Nav `plans` →
`/clients/:id/plans`, `registers?tab=adjustments` still in the workbench's SectionTabs.
`PlanBoundaryStatement` (`tone="info"`, `role="status"`) on list, detail and form with the
no-global-switch sentence; negative test twice (`plans-render-states.test.tsx:237`,
`p640.occ.no_global_switch`) plus 0193 §J. `work-detail.tsx` edit is 2 + 3 lines inside `WorkFacts`,
outside every #641 hunk.

## Verdict

**NOT MERGEABLE** — BLOCKER-1: a reversal Work is admitted while its accrual has posted nothing and
is never revoked when that accrual dies, so a naked reversal reaches the ledger. Everything else on
the worker's table is closed by a cell that would go red, the merge order is collision-free, and
standards pass.
