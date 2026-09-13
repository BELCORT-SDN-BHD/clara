# #640 — closure + adversarial review

`impl/640-accounting-plans` @ `28db2338`, worktree CLEAN. Rig `rig640b` 55443/`clara_640`.
`migrate.mjs` → **0 new · 183 total**. DB battery, exact `package.json` "test" gate flags, both plan
files → **31 · 31 pass · 0 fail · 0 skip**. Runtime units → **74/74**. `check-frozen-workflows.mjs`
→ OK (264). Playwright `plans-walk`: WALKRESULT.

## A · Closure of the worker's table

| finding | verdict | cell — what goes red |
|---|---|---|
| B1 revision double-posts | CLOSED | `p640.revision.no_double_post` — moves the due day inside a posted month, re-scans (still 1 occurrence), catch-up refuses one `period_already_admitted`. Behavioural; re-measured |
| B2 naked reversal | **OPEN** | the three `reversal_*` cells are behavioural but close the **admission-time** law only → BLOCKER-1 |
| B3 `effective_from` backwards | CLOSED | `p640.revision.authority_floor` — CLR10, forward-then-back, catch-up still refused. Re-measured |
| S4 ended-plan, unlocked read | CLOSED | cell asserts `prosrc` (flagged). **Raced it**: `end` held open on conn A, `revise` on B → B waited on the plan row lock, then `CLR10 plan_ended`; `current_revision=1`, revision 1 still live |
| S5 wrong revision printed | CLOSED | `p640.occ.retry_intent_key`, behavioural |
| S6 final accrual reversible | CLOSED | `p640.occ.final_reversal`, behavioural |
| S7 cancelled Work unpostable | CLOSED | `p640.catchup.reattempt` — real cancel, `:a2` key, a **completed** period proven not re-attemptable. Residual → SHOULD-2 |
| S8 tail over-claimed | CLOSED | §J re-reads the catalog, re-hashes the five 0045 bodies; 0193 has **zero** `create or replace` and zero foreign `alter table` |
| MINE B2-via-cancel | CLOSED for its case | superseded by BLOCKER-1 |
| MINE dead helper | CLOSED | `to_regprocedure('clara._plan_due_event_on_or_before(uuid)')` → null (NOTE-3) |
| MINE cadence claim | CLOSED | qualified by NOTE-1 |
| MINE form mirror | CLOSED | `lib/plans/schedule.test.ts:51` (below/equal/after) |
| MINE sweep red | CLOSED | runtime 74/74 |
| MINE census reds | CLOSED | manifest +2; nav repointed; `adjustments` still in `registers-workbench.tsx` TABS |
| MINE untested laws | CLOSED | `p640.revision.immutable` |

## B · Findings

**BLOCKER-1 — a reversal Work outlives its accrual's death and posts a naked reversal.**
`_plan_primary_stands` runs **once**, at admission, and "stands" = *admitted, not yet a dead end* —
a `queued` accrual with zero receipts qualifies. Measured on rig640b:

```
scan #1 -> [["2026-08-31","primary","W"]]   accrual queued, receipts 0
scan #2 -> +["2026-09-01","reversal","W"]   admitted while accrual queued, receipts 0
cancel_accounting_work(accrual) -> cancelled, receipts 0
  clara._plan_primary_stands(plan,'2026-08-31') -> false      <- too late
reversal Work still queued; claim + wake_record_journal_entry + settle -> entry written
ledger: 2026-09-01  Dr 1150 99000 / Cr 6100 99000   (one entry, reversing nothing)
```

B2's own ledger consequence, through a path the fix does not cover, with no unusual manoeuvre: two
ordinary cycles after a leader outage across the accrual (the scenario
`p640.occ.reversal_before_primary` itself describes), then one ordinary 0184 cancel. Same shape when
the accrual settles **failed** (`p640.auth.period`'s locked period) while the reversal's month is
open. No cell can catch it — `p640.occ.reversal` encodes "reversal admitted next scan while the
accrual is unposted" as correct. Fixes: gate on a **committed receipt**; or cancel the period's
reversal Work when the accrual dies without one; or carry the accrual's `entry_id` into the reversal
basis so `_record_journal_entry_core` refuses.

**SHOULD-1 — frequency changes double-cover periods, and the filed residual names the wrong
mechanism.** Both directions reach it through the **plain scan**. Quarterly→monthly: quarter
`2026-08-01` posted (Aug–Oct), next scan admitted primary `2026-09-01`. Monthly→quarterly on a
partial history: monthly `2026-09-01` posted, scan then admitted quarterly `2026-08-01` (Aug–Oct).
September covered twice either way. Where keys coincide the guard holds (full monthly history →
quarterly catch-up admitted nothing). `unique (plan_id, leg, period_key)` is exact per alignment,
blind across alignments. Not a merge blocker (C-39 only asks that a revision preserve predecessor
and past runs) — re-file the residual with this measurement.

**SHOULD-2 — the cancelled attempt is orphaned from the plan.** After an S7 re-attempt,
`list_accounting_plan_occurrences` never names the old `work_id` and `get_work_plan_origin(old)` →
`null`; this frontier has no `list_*work*` door. `clara.audit_log`
(`fn='plan_occurrence_admitted'`, 139 rows, `:a2` included) keeps it, the plan's view does not.

**NOTE-1 — cadence, qualified.** `clara_runtime` correctly cannot read the tables (`42501` on
EXPLAIN). As owner: Seq Scans on `accounting_plans` (73 rows) and `_revisions`, with
`_plan_admissible_event` in the Seq-Scan Filter — 65 active plans, **36.5 ms**, every cycle.
Occurrence probes are `Index Only Scan using uq_plan_occurrences_plan_due`, so ARCH §8's "no seq
scan on the occurrence table" is accurate; "two partial indexes bound the row source" holds
logically, not as an access path at this size.
**NOTE-2** `_plan_primary_stands` tests `status in ('cancelled','failed')`; 0184's transient
`stopping` is absent, so a cancel-in-flight accrual reads as standing. Subsumed by BLOCKER-1.
**NOTE-3** `_plan_admissible_event`'s comment still cites the deleted `_plan_due_event_on_or_before`.

**Measured clean.** Two concurrent `clara_runtime` scans of one due date: the second waited on the
plan row lock, answered `converged:true` with the same `work_id`; one occurrence, one Work. The belt
is KL not UTC — at KL `2026-09-14`/UTC `2026-09-13`, due `2026-09-14` admitted, due `2026-09-15` not
picked (picker → null). Monotonicity: below the floor CLR10; equal accepted; a later revision
earlier than the previous `effective_from` but ≥ `authority_from` is allowed and harmless (catch-up
still floored; intervening periods converged, `admitted: 0`). Bookkeeper creates/revises/catches up
(owner-flagged floor — restated, not changed); viewer CLR04 on write, may read; cross-firm id and
invented uuid both → identical `CLR11 plan_not_found`. RLS/ACL: three relations RLS+FORCE,
`relacl` NULL, owner `clara_fn_owner`, one owner-only policy each; runtime and authenticated hold no
table privilege; all 30 functions DEFINER with `search_path=clara, pg_temp`, PUBLIC revoked,
internals owner-only, 11 doors to `clara_authenticated`, scan to `clara_runtime` alone. Five 0045
doors intact. Belt: per-cycle exact-signature detect, `dormant()`/`failed()` never a throw, bounded
25, inside `reconciler.mjs`'s `belt()`; per-plan isolation evidenced by global scans over 65 active
plans (several permanently refusing) never poisoning a sibling.

## C · Merge order (0193 after 0188–0192, before 0194–0195)

| file | object | verdict |
|---|---|---|
| 0188 | `*_operator_support_*` | no collision |
| 0189 | `list_accounting_work`, `get_accounting_work_row`, `save_my_preferences` | no collision — no name matches 0193's §0/§J censuses |
| 0190 / 0191 | document doors, capability + validation tables | no collision |
| 0192 | `knowledge_plan_item_map`, `promote_plan_answers_to_knowledge` (**onboarding** plans) | no collision |
| **0194** | `create or replace admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)` → delegation to `_admit_accounting_work_core` | **safe** — identical signature and grant (no overload; 0193's call still resolves); core returns `{work_id, task_id, logical_op_id, status, replayed}`, the keys `_plan_admit_occurrence` reads |
| 0194 | `alter accounting_work` (purpose CHECK, `adjustment_basis`); `_record_journal_entry_core`, `_tf_accounting_work_immutable`, `_close_gate_closing_stock` recut | safe — 0193 pins none; its FK targets `accounting_work(id, firm_id, client_id)` only |
| 0194 prestate — sha256 on those four bodies, both purpose CHECKs one-valued, no `adjustment_basis` | vs 0193 | **satisfied** — 0193 has no `create or replace` and no foreign `alter table` |
| 0194 | the five 0045 doors | untouched (one prose mention) |
| 0195 | `_record_journal_entry_core` pinned at the **0194** body, 0123 egress doors | no collision |

No pre-state pin fails under the real order, either direction.

## D · Standards

Frozen OK; manifest gains both new files; `en.json` namespaced under `Plans`; ARCH §6 gains the
`accounting_plans` rung, §8 the laws and cadence, §11 measured counts with hosted pending; PRD §5.4
updated — factual subject to NOTE-1. Nav `plans` → `/clients/:id/plans`, `registers?tab=adjustments`
still served by the workbench's SectionTabs. `PlanBoundaryStatement` (`tone="info"`,
`role="status"`) on list, detail and form, carrying the no-global-switch sentence. Negative test
twice — `plans-render-states.test.tsx:237` and `p640.occ.no_global_switch` — plus 0193 §J on the
scan body. `work-detail.tsx` edit is 2 + 3 lines inside `WorkFacts`, outside every #641 hunk.

## Verdict

**NOT MERGEABLE** — BLOCKER-1: a reversal Work is admitted while its accrual has posted nothing and
is never revoked when that accrual dies, so a naked reversal reaches the ledger; B2 is closed at
admission time only. Everything else on the worker's table is closed by a cell that would go red,
the merge order is collision-free, and standards pass.
