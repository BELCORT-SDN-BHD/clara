# F-T3 PR-9 — the `tax_prep` wake: annexes (battery · scope · build order · ceremony)

> **Annex to `tax-prep-wake-design.md`** — split at authoring to keep each file inside the
> 500-line harness budget; nothing was dropped in the move. The design file carries §1-§6 (what
> exists, the carrier decision, the DB surface, the wake body, what she drafts, the card). This
> file carries **§7 failure isolation · §8 the battery · §9 what is NOT built · §10 the build
> work order · §11 sequencing and the ceremony**. Section numbers continue the design's.
>
> Same measured ground: throwaway `postgres:17` (`ft3design-rig`, port 33701, credential minted
> per-run and env-only), `0001` → `0155`, 150 files, all green; every catalog claim read through
> `pg_get_constraintdef` / `pg_proc.prosrc` / real row counts. Rig destroyed at the close of the
> lane.

---

## 7 · Failure isolation, settlement, and observability

All three reuse proven primitives; nothing new is invented.

- **Per-item dead-letter.** A `direct_queue` source has no domain event to key against, so it
  uses `clara.wake_engine_task_dead_letters` (`consumer, task_id, firm_id, reason,
  attempt_count, status, created_at, resolved_at` — measured), `max_attempts` 5, poison-skip.
  `tax_prep`'s rows are its own; a poisoned tax run cannot consume `close_prep`'s cap.
- **The `queued → failed` leg exists and matters here.** Measured in the live
  `clara._tf_agent_task_update` `close_prep` arm: `when 'queued' then new.status in
  ('running','cancel_requested','cancelled','failed')` — the extend-only leg M4 added because a
  `direct_queue` row has **no checkpoint to advance past**, so exhaustion must terminal-ize the
  TASK itself. Pre-fix that write was illegal, raised CLR13, and crashed the **whole cycle**
  every time it fired; the row stayed queued forever and the dead-letter count overran its own
  cap on every subsequent re-attempt. **The `tax_prep` arm is byte-identical to the `close_prep`
  arm, that leg included** — writing it from the `wake` arm's shape instead (`held → running`,
  no `queued` state at all) would reproduce a defect the estate has already paid for once.
- **Per-item try/catch inside the batch, `belt()` one level up.** One poisoned row never aborts
  the rest of the batch; a whole-belt throw costs this cycle's reconciliation and nothing else,
  named in `beltErrors[]`, never silent.
- **The kill switch.** `clara.set_wake_source_enabled('tax_prep', false, reason, op_key)` (live
  prosrc sha `fdf01d73…`) — owner floor **plus** `clara.firms.is_operator`. Measured:
  `uq_firms_one_operator` admits at most one operator firm ever, and **zero** firms are marked
  operator until a raw, audited ops act does it, so the door is unreachable by anyone until
  then. A disabled source is never claimed; its queued rows accumulate **visibly**, counted by
  `wakeEngineHealth`'s `heldForDisabledSource`, never silently.
- **`perSourceCounts.tax_prep`** appears in `wakeEngineHealth` with **no engine change** — the
  breakdown is already keyed on `source_key`. **Meter, never cap**: nothing in this design
  refuses a tax draft for cost reasons; `enabled=false` is an operator's engineering decision,
  never derived from spend.

---

## 8 · The battery — RED-before for every wall

Each cell makes a wall **refuse**; none asserts on source text (spelling is not identity); none
swallows a premise; each forced cell asserts its precondition or exits by a named, counted
`skipHere`. The same-corpus pair rule binds: a failing-set diff is evidence only when both sides
run the **branch's** test files and differ only in whether the migration is applied.

| # | Cell | Proves |
|---|---|---|
| T-1 | each of design §3.1's five CHECKs admits `tax_prep` **and still admits every prior value** | the widening lost nothing — `0120`'s tail guards this failure mode by name |
| T-2 | a `tax_prep` mint with `p_client = NULL` **refuses**; with a foreign-firm client **refuses**; with `on_behalf_of` set **refuses** | the credential's client pin, and law-68's structural NULL on a clocked lane |
| T-3 | the mint refuses at the **EARLY gate** on a kind absent from it, even with the per-kind arm present | `0133`'s GB-3 trap: two gates, proven by probe, never by reading the source |
| T-4 | a `tax_prep` credential calling `finalize_close` / `approve_tax_treatment` / `sign_tax_treatment_code` / any egress verb **refuses**; the five allowed verbs are admitted | the allowlist is the wall — proven **positively by enumerating the allowlist**, never by the absence of a row |
| T-5 | `_tax_wake_ctx` refuses an unresolvable subject, a foreign-client subject, a missing task binding, and a non-derived `op_key` | ARM-0 survives the copy: an unknown subject kind and an unresolvable id BOTH return NULL, and the pin then refuses |
| T-6 | `agent_act_receipts` accepts a `propose_tax_treatment` / `coa_account` row and **refuses** an unregistered act kind | design §3.4's extend-only widening, both directions |
| T-7 | `tax_prep_due()` returns nothing when: no active close receipt · a hold is live · a draft is open · inside the cadence window — and returns a row when all four clear | each rung independently, never the conjunction only. A four-way AND passes vacuously if one rung is mis-wired |
| T-8 | `queued → failed` is legal for `kind='tax_prep'`; `held → running` is **not** (it is not a `wake` row) | the arm is the `close_prep` shape, M4 leg included (§7) |
| T-9 | `_settle_wake_task` settles a `tax_prep` task **only after** `ck_wes_task_kind_wake_owned` admits it; before the widening it refuses | the registry-driven kind filter is what grants the authority — no settlement code changes |
| T-10 | `classifyTaxOutcome` — **one cell per arm** in design §4.2's table, driven directly | judgement logic (review law 1), and previously unreachable except through a model call |
| T-11 | a post-settle, **unbound** run's first step self-aborts at the CAS and settles nothing | G1 §1.2(d)'s named obligation, discharged on this lane |
| T-12 | `uq_tax_draft_live` refuses a second open draft for one `(client, ya)` | one live proposal per subject, the `uq_close_proposal_live` idiom |
| T-13 | a draft whose `bound_digests` have moved **refuses** adoption | the staleness target actually bites; a signed code or a set `ca_class` invalidates the draft |
| T-14 | the run refuses **`CLR10 evaluator_undeployed`** when the closure is dark, and the task settles `failed` rather than `completed` | §11's ordering hazard, made visible rather than mysterious |
| T-15 | the source ships `enabled=false`; `wake_engine_sources` holds **3** rows, all disabled | 裁-40's posture, **censused not asserted** |
| T-16 | the **bundle grep**: `taxPrep` appears in the built `.output/` | the WDK directive-swallow class, which typecheck cannot see |

---

## 9 · Explicitly NOT in PR-9, each with its reason

| Not built | Why |
|---|---|
| **SST-02 drafting** (裁-44's third bullet) | a different taxable period (bi-monthly, not annual), a different due predicate, and **F-T1's** tables (`0153_f_t1_sst_reference_tables`). Folding it into `tax_prep` makes one oracle answer two unrelated period questions and one frozen body carry two domains. **Recommend a separate `sst_prep` source on the same engine, owned by F-T1** → **OQ-C** in the gate record |
| **CP204 due-date reminders** (裁-44's fourth bullet) | a **`proactive`** source (firm-scoped, `client_id` NULL by its own CHECK arm), not `tax_prep` (client-scoped). It also depends on `statutory_deadlines` (`0139`), which is **F-T2's** home. Measured: `proactive` has exactly **one** allowlist verb today, `wake_record_notification` — so the reminder is a notification belt, not a drafting wake → **OQ-C** |
| A tenth `list_review_queue` `row_kind` | design §6 — a `CREATE OR REPLACE` on an **18 666-char** shared body with nine existing card families, for a card Feed 2 already carries. Available later as a P6 consolidation; nothing here forecloses it |
| Any submission verb | law, not scope: e-filing is human, **excluded by nature** (laws 71, 74, 80, 82), and excluded even from the delegate grant |
| Widening `hold_close_prep` / `release_close_prep` signatures | a D1 replacement of two live human doors for no behavioural gain (design §3.7). Sibling verbs on the same table instead |
| A new PostgreSQL role | `clara_wake_interactive` + the write pool is the measured `close_prep` posture (design §3.9); the allowlist is the narrow wall, not the role |
| A `tax_prep` arm in G1 PR-2's `call_kind` extension | design §3.5 — F-T3 takes its own value in its own file, so one reviewer reads one coherent widening story |

---

## 10 · The build work order — PR-9

**One migration**, `UNNUMBERED_f_t3_pr9_tax_prep_wake.sql` (number claimed at MERGE, hard
constraint 10).

**§0 prestate** — assert the exact live text of all **seven** CHECKs being widened (design
§3.1's five plus §3.4's two) and abort CLR10 on drift; pin `clara.mint_wake_credential`'s live
prosrc sha (`7422e9d957b11553bd0f2406d898ccf582f3baf8ea39fc4367531a60859946ee` at `0155`) and
`clara._tf_agent_task_update`'s (`f44a2f17f4186d3a0dc95f33ac2a52516c017d6b071459f90f102a3097b302ab`);
assert **by name under every arity** that `tax_prep_due`, `_tax_wake_ctx`, `_tax_subject_client`,
`hold_tax_prep`, `release_tax_prep`, `list_tax_drafts`, `wake_get_tax_readiness`,
`wake_list_tax_drafts`, `wake_propose_tax_draft` are free; assert `clara.wake_engine_sources`
holds exactly **2** rows, both `enabled=false`; assert `clara.tax_computation_drafts` is free;
assert `clara.wake_fn_allowlist` holds **zero** `tax_prep` rows.

**Body** — the seven widenings · the `_tf_agent_task_update` recut adding the `tax_prep` arm
(**byte-identical to the `close_prep` arm**, M4 leg included) · `mint_wake_credential`'s **two**
extensions (early gate **and** per-kind chain) · `tax_computation_drafts` + `enable`/`force` RLS
+ the owner policy + the `clara_authenticated` firm-scoped select + the live-draft partial unique
index · `tax_prep_due()` · `_tax_subject_client` / `_tax_wake_ctx` · the three read wrappers +
the draft wrapper + their ungranted cores · `hold_tax_prep` / `release_tax_prep` ·
`list_tax_drafts` · the **five** allowlist rows · the registry row (`enabled=false`).

**§TAIL census** — the evidence a reviewer reads, never "OK": every widened set moved by
**exactly one value**, with every prior value positively present · a **real mint probe** proving
both gates admit `tax_prep` (never a source read) · a **real settle probe** proving
`_settle_wake_task` now reaches `kind='tax_prep'` · the allowlist enumerated (5 rows for
`tax_prep`; the four forbidden verbs absent) · `wake_engine_sources` = **3 rows, all disabled** ·
`tax_computation_drafts`' forced-RLS + policy + grant shape read from the catalog · the 裁-33
column census (no `status`/`state`/`issue_mode`/`issued_at`/`issued_by` on the new relation).

**D1: YES — two bodies in one window.** Both judgement logic:

| Body | Live prosrc sha256 at `0155` | Chars |
|---|---|---|
| `clara._tf_agent_task_update()` | `f44a2f17f4186d3a0dc95f33ac2a52516c017d6b071459f90f102a3097b302ab` | 4 171 |
| `clara.mint_wake_credential(text,uuid,uuid,interval,uuid)` | `7422e9d957b11553bd0f2406d898ccf582f3baf8ea39fc4367531a60859946ee` | 4 542 |

*(Both shas are the values this lane measured. The migration re-reads `pg_proc` at apply time
and aborts CLR10 if either has drifted — a merge between this design and the build will move
them, and that abort is the design working.)*

**Runtime PR** (same PR or its successor): the seven `taxPrep.v1.*` files, the `registry.ts`
repoint (`taxPrep: taxPrep_v1`), `pnpm freeze:update` **once** for the new frozen class, the
**mandatory bundle grep**, and one `taxPrepDue()` pure predicate plus its call in
`startLeaderLoop`'s cycle body — **which lands only after G1 PR-2 ships the producer seam it
sits beside** (design §1: `leader.mjs` carries six `*Due` predicates today and none is
`closePrepDue`).

**Review.** PR-9 decides *whether* a client is due, *whether* a run holds its task, and
*whether* a night succeeded — judgement logic three times over. **One independent pass minimum;
a cross-model adversarial pass is owed** on the same grounds as PR-4: this is the model's
entrance, unattended, to a lane whose output feeds a statutory document.

**New `clara_authenticated` doors and their frontend homes** (the `.claude/rules/db-migrations.md`
obligation, which the verb-coverage census re-runs at the P6 exit gate):

| Door | Frontend home |
|---|---|
| `hold_tax_prep` / `release_tax_prep` | the client **Tax tab** (裁-34, P6), beside the close-prep hold control |
| `list_tax_drafts` | the **needs-you gaps panel** (design §6) and the Tax tab |

No other door in this PR is `clara_authenticated`; the four wake wrappers are
`clara_wake_interactive`-only and every core is ungranted.

---

## 11 · Sequencing, and the ceremony act 裁-40 does not yet have

**PR-9 is last in F-T3's ladder, and not for scheduling reasons.** It cannot draft a computation
before **PR-6** registers the member that computes one — measured: `clara.evaluator_versions`
holds 8 rows at `0155` and none is named `evaluate_tax_computation`.

**And there is a second, sharper gate that the 裁-44 ruling could not have anticipated.**
Measured live, in the two closest sibling bodies:

```
-- clara.evaluate_fs_pack_agent_v1, live prosrc:
where evaluator_name = 'evaluate_fs_pack_agent' and version = 1 and firm_id is null and deployed;
raise exception 'the agent pack evaluator closure is not deployed' using errcode = 'CLR10',
  detail = '{"reason":"evaluator_undeployed","class":"evaluate_fs_pack_agent",
             "fix":"the owner flips the closure row as a ceremony from merged main"}';

-- clara.evaluate_metric_v2, live prosrc:
where evaluator_name='evaluate_metric' and version=1 and firm_id is null and deployed;
raise exception 'metric evaluator is not deployed' using errcode='CLR10',
  detail='{"reason":"evaluator_undeployed","class":"evaluate_metric"}';
```

**The estate's evaluators gate themselves on their own deployment.**
`evaluate_tax_computation_v1` must carry the same arm — anything else would make F-T3 the one
evaluator that computes from a closure nobody ceremonied.

**So this lane has TWO ceremony acts, and their order is load-bearing:**

1. **The evaluator deploy flip.** `evaluate_tax_computation v1` `deployed: false → true` — a
   plain `UPDATE` from a session holding **no** active `SET ROLE` (`current_user =
   session_user`), admitted exactly once per row ever, and only after
   `verify_evaluator_freeze()` passes (measured: `_tf_evaluator_deploy_once` raises CLR08 on a
   born-deployed INSERT, on a second flip, and on an un-deploy). Plus the
   `frozen-evaluators.json` entry moving to `deployed: true`.
   `deploy-evaluator-version.mjs` is the **recipe**, not the wall.
2. **The `tax_prep` switch.** `set_wake_source_enabled('tax_prep', true, …)` by the operator
   owner — 裁-40's fourth switch, as amended by 裁-44.

**If 2 precedes 1, every `tax_prep` run refuses `CLR10 evaluator_undeployed`** — nightly, per
client, to `max_attempts`, then dead-letters. Not data loss, but a launch that looks broken and
fills a dead-letter table on its first night, on the lane the owner asked for precisely so that
tax would stop feeling like a form.

**裁-40's ceremony list is four switches; this lane needs a FIFTH act, ordered before its own
switch.** The ceremony recipe must say so, and cell **T-14** makes the failure visible rather
than mysterious if the order is ever got wrong. **This is the single most likely way the 裁-44
rollout goes wrong**, and it is invisible from the ruling's own text.

**One more cross-lane hazard, unchanged and still live.** `--lock-deployed` is **BLANKET**. From
the moment PR-6 appends its dark manifest entry until the flip above, **any** other lane running
it would stamp F-T3's evaluator deployed while the DB row is still `false`. PR-6's body must say
so; the conductor's note carries it.

**Gates, in full.** PR-9 waits on **PR-4** (`wake_propose_tax_treatment` exists) · **PR-6** (the
member and `wake_run_tax_computation` exist) · **G1 PR-2** (the producer seam in `leader.mjs`) ·
and is **independent of 裁-49's `call_kind` extension either way**, by design §3.5.

**Re-proving this state.** Apply `packages/db/migrations/` `0001` → the frontier on a throwaway
`postgres:17`, then read: `pg_get_constraintdef` for the seven CHECKs in §10's prestate,
`select * from clara.wake_engine_sources`, `select wake_kind, count(*) from
clara.wake_fn_allowlist group by 1`, and `select evaluator_name, version, deployed from
clara.evaluator_versions`. Those four reads reproduce every claim this annex makes about the
estate's shape.
