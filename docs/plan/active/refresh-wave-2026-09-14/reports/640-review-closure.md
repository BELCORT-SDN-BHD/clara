# #640 — closure + adversarial review (three axes, one pass)

Branch `impl/640-accounting-plans` @ `28db2338` (7 + 5 commits), worktree CLEAN.
Rig `rig640b` 127.0.0.1:55443/`clara_640`. `node scripts/migrate.mjs` → **0 new · 183 total**, exit 0.
DB battery, gate flags copied verbatim from `packages/db/package.json` "test":
`node --test --test-concurrency=1 $GATES tests/accounting-plans.test.mjs tests/accounting-plan-occurrences.test.mjs`
→ **31 tests · 31 pass · 0 fail · 0 skipped** (8.7 s). Runtime units (`reconcile-belt-isolation-unit`,
`reconcile-work-unit`, `reconcile-adjustments-unit`, `reconcile`, with the rig env) → **74/74**.
`node scripts/check-frozen-workflows.mjs` → OK, 264 frozen files. Playwright `plans-walk`: RE-RUN-RESULT.

## A · Closure of the worker's table

| finding | verdict | cell — and what would go red |
|---|---|---|
| B1 revision double-posts the period | CLOSED | `p640.revision.no_double_post` — admits a period, moves the due day inside that same month, re-scans (asserts still 1 occurrence), then catch-up over the window (asserts exactly one `period_already_admitted` and no duplicate `period_key`). Behavioural. Independently re-measured. |
| B2 naked reversal | **OPEN** | `p640.occ.reversal_before_primary` / `.reversal_refusal` / `.reversal_after_cancel` are behavioural and were red pre-fix, but they close only the **admission-time** law. See BLOCKER-1. |
| B3 `effective_from` backwards | CLOSED | `p640.revision.authority_floor` — CLR10 `effective_from_before_authority`, the forward-then-back case, and catch-up still refused. Re-measured (P3). |
| S4 ended-plan tested on an unlocked read | CLOSED | cell asserts `pg_proc.prosrc` (flagged). **I raced it**: `end` held open on conn A, `revise` on conn B → B waited on the plan row lock (`wait_event_type=Lock`), then refused `CLR10 {"reason":"plan_ended"}`; plan `ended`, `current_revision=1`, revision 1 still live/not superseded. |
| S5 occurrence printed a revision it did not run | CLOSED | `p640.occ.retry_intent_key` — behavioural. |
| S6 final accrual never reversible | CLOSED | `p640.occ.final_reversal` — behavioural (skips only on calendar day 1). |
| S7 cancelled Work → period unpostable | CLOSED | `p640.catchup.reattempt` — real 0184 cancel, real re-attempt, `:a2` key, and a **completed** period proven not re-attemptable. Residual: SHOULD-2. |
| S8 tail claimed more than it checked | CLOSED | §J re-reads the catalog and re-hashes the five 0045 bodies against §0's temp-table pin. Verified independently: 0193 contains **zero** `create or replace` and **zero** `alter table` on any foreign relation. |
| MINE — B2 via 0184's cancel door | CLOSED for its case | `p640.occ.reversal_after_cancel`; superseded by BLOCKER-1. |
| MINE — dead `_plan_due_event_on_or_before` | CLOSED | `to_regprocedure('clara._plan_due_event_on_or_before(uuid)')` → `null`. NOTE-3. |
| MINE — false cadence claim | CLOSED | restated in 0193 header / belt / ARCH §8. NOTE-1 qualifies it. |
| MINE — B3 form mirror | CLOSED | `apps/web/lib/plans/schedule.test.ts:51` — `authorityFrom` floor, below/equal/after. |
| MINE — sweep red | CLOSED | runtime units 74/74. |
| MINE — two census reds | CLOSED | `manifest.txt` +2; nav repointed (`tree.ts:312`), `registers?tab=adjustments` still in `registers-workbench.tsx` TABS. |
| MINE — untested new laws | CLOSED | `p640.revision.immutable`. |

## B · Findings

**BLOCKER-1 — a reversal Work outlives its accrual's death and posts a naked reversal.**
`clara._plan_primary_stands` is evaluated **once**, at the reversal's admission, and "stands" means
*admitted and not yet a dead end* — a `queued` accrual with zero receipts qualifies. Measured on
rig640b (untracked probe, reversing plan, `last_day_of_month`):

```
S1 scan #1  -> [["2026-08-31","primary","W"]]   accrual status=queued receipts=0
S2 scan #2  -> [["2026-08-31","primary","W"],["2026-09-01","reversal","W"]]
              reversal ADMITTED while accrual status=queued receipts=0
S3 cancel_accounting_work(accrual) -> status=cancelled receipts=0
   clara._plan_primary_stands(plan,'2026-08-31') -> false          <- too late
S4 reversal Work still queued; claim + wake_record_journal_entry + settle completed -> entry written
S5 ledger: 2026-09-01 "accrued insurance"  Dr 1150 99000 / Cr 6100 99000     (one entry only)
```

The books now hold a sides-swapped entry reversing nothing — exactly B2's ledger consequence,
through a path the fix does not cover. It needs no unusual manoeuvre: two ordinary leader cycles
after a leader was down across the accrual (the scenario `p640.occ.reversal_before_primary` itself
describes), then one ordinary 0184 cancel. The same shape arises when the accrual's Work settles
**failed** — e.g. `p640.auth.period`'s locked period — while the reversal's month is open. No cell
can catch it, because `p640.occ.reversal` encodes "reversal admitted on the next scan while the
accrual is unposted" as correct. Fix directions: gate the reversal on a **committed receipt** for
its accrual; or cancel the period's reversal Work when the accrual reaches cancelled/failed without
one; or carry the accrual's `entry_id` into the reversal basis so `_record_journal_entry_core`
refuses a reversal whose accrual entry is absent.

**SHOULD-1 — a frequency change double-covers periods, and the filed residual names the wrong
mechanism.** The worker filed "monthly → quarterly lets an already-posted month also take a
quarterly entry". Measured, the cross-alignment overlap is real but works differently, and both
directions reach it through the **plain scan**, not only catch-up:

- quarterly → monthly: quarterly period `2026-08-01` posted (covers Aug–Oct); after the revision the
  very next scan admitted `2026-09-01` primary, `period_key 2026-09-01` — September covered twice.
- monthly → quarterly with a partial history: monthly `2026-09-01` posted; after the revision the
  scan admitted quarterly `2026-08-01` (Aug–Oct), again covering September twice.
- The guard *does* hold where keys coincide: with every month posted, the quarterly catch-up
  returned `converged` / `period_already_admitted` for both quarter starts and admitted nothing.

`unique (plan_id, leg, period_key)` is exact per alignment and blind across alignments. Not a merge
blocker on its own (C-39 asks only that a revision preserve its predecessor and past runs, which
holds), but the residual as written would not have caught this and should be re-filed with the
measurement.

**SHOULD-2 — the cancelled attempt is orphaned from the plan's view.** After an S7 re-attempt,
`list_accounting_plan_occurrences` shows only the new Work, the whole answer never mentions the old
`work_id`, and `get_work_plan_origin(old_work)` → `null`. On this frontier there is no
`list_*work*` door at all (0189/#641 brings one), so the cancelled Work is reachable only by its own
id. Mitigation: `clara.audit_log` keeps every admission (`fn='plan_occurrence_admitted'`, 139 rows
on the rig, including the `:a2` entries naming the new work), so the attempt is recoverable — but
not from the plan.

**NOTE-1 — the cadence claim, qualified.** `EXPLAIN ANALYZE` of the picker's own query (as the
definer owner; `clara_runtime` correctly has **no** SELECT on the three tables — `42501 permission
denied for table accounting_plans`) shows Seq Scans on `accounting_plans` (73 rows) and
`accounting_plan_revisions` at this size, with `_plan_admissible_event` pushed into the Seq-Scan
Filter: 65 active plans, **36.5 ms** per scan, every leader cycle. The occurrence probes are
`Index Only Scan using uq_plan_occurrences_plan_due`, so ARCH §8's "no sequential scan on the
occurrence table" is accurate; "the two partial indexes bound the row source" is true logically,
not as an access path at this size.

**NOTE-2 — `stopping` is not in the dead-end list.** `_plan_primary_stands` and
`_tf_plan_occurrences_append_only` test `w.status in ('cancelled','failed')`; 0184's transient
`stopping` is absent, so a cancel-in-flight accrual reads as standing. Subsumed by BLOCKER-1 but
worth naming when that is fixed.

**NOTE-3 — stale comment.** 0193's `_plan_admissible_event` header still says
"`clara._plan_due_event_on_or_before` stays the pure arithmetic it was"; that function was deleted.

**Measured clean** (no finding): two concurrent `clara_runtime` scans of the same due date — the
second waited on the plan row lock and answered `converged:true` with the *same* `work_id`; one
occurrence row, `select count(*) … intent_key like 'plan:<id>:%'` → **1**. The KL due belt is
genuinely KL, not UTC: at `now()` = KL `2026-09-14` / UTC `2026-09-13`, a plan due `2026-09-14` was
admitted and a plan due `2026-09-15` was not picked at all (`_plan_admissible_event` → `null`).
`effective_from` monotonicity: `< authority_from` → CLR10; equal → accepted; a second revision
earlier than the first's `effective_from` but ≥ `authority_from` is **allowed** and harmless — the
catch-up it re-opens is still floored at `authority_from`, and every period between converged
(`admitted: 0`). Authority: bookkeeper creates (`plan_id` returned), revises (`revision 2`) and
catches up (`admitted 3`) — the owner-flagged floor, restated not changed; viewer refused CLR04 on
create and revise but may read; a cross-firm plan id and an invented uuid both answer the identical
`CLR11 {"reason":"plan_not_found"}` — no existence oracle. RLS/ACL: three relations
`relrowsecurity ∧ relforcerowsecurity`, `relacl` NULL, owner `clara_fn_owner`, one
`clara_fn_owner`-only policy each; `clara_runtime` and `clara_authenticated` hold **no** table
privilege; every one of the 30 new functions is `SECURITY DEFINER` with
`search_path=clara, pg_temp`, PUBLIC revoked; internals are `{clara_fn_owner=X/…}` alone, the 11
human doors add `clara_authenticated`, and `wake_due_plan_occurrences` adds `clara_runtime` alone.
The five 0045 doors are intact (sha256 recorded in the probe log). Runtime belt: per-cycle
feature-detect on the exact `(integer,text)` signature, `dormant()` when absent, `failed()` (never a
throw) on error, bounded at 25, wrapped in `reconciler.mjs`'s own `belt()`; the DB isolates each
plan in its own exception block, evidenced by the battery's global scans running over 65 active
plans (several permanently refusing) without one poisoning another.

## C · Merge order — collision table

0193 lands after 0188/0189/0190/0191/0192 and before 0194/0195.

| file | object | verdict |
|---|---|---|
| 0188 `operator_support_console` | 3 new `*_operator_support_*` functions | no collision |
| 0189 `work_list_reads` | `list_accounting_work`, `get_accounting_work_row`, `save_my_preferences` (replace) | no collision — names do not match 0193's §0 or §J censuses (`%accounting_plan%` / the 11-door list) |
| 0190 `document_byte_door_v2` | `get_document_for_human_read_v2` | no collision |
| 0191 `document_capability_registry` | document tables/triggers | no collision |
| 0192 `client_knowledge_records` | `knowledge_plan_item_map`, `promote_plan_answers_to_knowledge` (**onboarding** plans) | no collision — different relations, and neither name matches 0193's censuses |
| **0194 `periodic_adjustments`** | `create or replace clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)` → thin delegation to the new `_admit_accounting_work_core` | **safe**: identical signature and grant, so 0193's runtime call still resolves and no overload appears; the core returns `{work_id, task_id, logical_op_id, status, replayed}` — exactly the four keys `_plan_admit_occurrence` reads |
| 0194 | `alter accounting_work` (purpose CHECK widened, `adjustment_basis` added), `_record_journal_entry_core`, `_tf_accounting_work_immutable`, `_close_gate_closing_stock` recut | safe — 0193 pins none of these; its FK targets `accounting_work(id, firm_id, client_id)` only |
| 0194 prestate (sha256 pins on `_record_journal_entry_core`@0184, `admit_journal_work`@0182, `_close_gate_closing_stock`@0056, `_tf_accounting_work_immutable`@0184; both purpose CHECKs one-valued; no `adjustment_basis`) | vs 0193 | **satisfied**: 0193 has no `create or replace` and no `alter table` on a foreign relation, so none of the four bodies or two CHECKs drifts under it |
| 0194 | the five 0045 adjustment doors | untouched (`grep` finds only one prose mention) — 0193's digest pin is unaffected |
| 0195 `work_egress_purpose_and_execution_trace` | recuts `_record_journal_entry_core` pinned at the **0194** body, plus 0123 egress doors | no collision with 0193 |

No pre-state pin fails under the real order, in either direction.

## D · Standards spot-check

Frozen bodies untouched (264 verified). `apps/web/test/manifest.txt` gains both new test files.
`en.json` additions are namespaced under `Plans`. ARCHITECTURE §6 gains the
`accounting_plans → accounting_work → agent_tasks → agent_interruptions` rung, §8 the plan laws and
the restated cadence, §11 the row with measured counts and "hosted 证据待补" — all factual against
what I measured, subject to NOTE-1. PRD §5.4 updated. Nav `plans` repointed to `/clients/:id/plans`
with `registers?tab=adjustments` still served by the workbench's own SectionTabs. The persistent
boundary statement (`PlanBoundaryStatement`, `StateBanner tone="info"`, `role="status"`) renders on
list, detail and form, and its copy carries the no-global-switch sentence. The negative test exists
twice: `plans-render-states.test.tsx:237` (no toggle in the UI), `p640.occ.no_global_switch` (an
occurrence admitted with both `wake_engine_sources` rows disabled), plus 0193 §J asserting the scan
body reads no operator flag. The shared-file edits are minimal: `work-detail.tsx` is 2 + 3 lines
inside `WorkFacts`, outside every hunk #641 touches in the same file.

## Verdict

**NOT MERGEABLE** — BLOCKER-1: a reversal Work is admitted while its accrual has posted nothing and
is never revoked when that accrual dies, so a naked reversal entry reaches the ledger; B2 is closed
at admission time only. Everything else on the worker's table is closed by a cell that would go red,
the merge order is collision-free, and the standards spot-check passes.
