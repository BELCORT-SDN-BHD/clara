# wave 4 · lane 04 · #1036 — reroute the prepayment-schedule wake door onto the live prepayment door (the last caller of the retired 0045 template core)

**Branch** `riders/w4-lane04` · **base** `cd2925391` · **status** DONE.

**Commits** (`git log --oneline cd2925391..HEAD`, this ticket's four, oldest first):

| commit | subject |
|---|---|
| `2a2064c9c` | `feat(db): #1036 the wake door stops proposing a retired 0045 template` |
| `6edfbd48d` | `test(db): #1036 the reroute driven end to end, its gate wired into the chain` |
| `0b0e633f9` | `test(db): #1036 the retired-arm tripwire is replaced, and the old pipeline's own battery retires with it` |
| `c8fdb6acc` | `docs(db): #1036 the reroute in packages/db/README and CONTEXT` |

**Verified live on this branch before building.** `gh issue view 1036 --comments`: state OPEN,
labels `bug` + `ready-for-agent`, zero comments, no 2026-09-20 owner ruling comment — the body's own
"Orchestrator ruling at the wave-3 integration (2026-09-23)" is the newest and only ruling, and it is
what this report is measured against. Measured on `clara_l04` before writing anything:
`clara.wake_establish_prepayment_schedule`'s body still called `clara._agent_prepayment_schedule_core`
→ `clara._propose_adjustment_template_core`; the close_prep `wake_fn_allowlist` row was unchanged at
13; `clara.wake_engine_sources.close_prep.enabled = false`. Still live, not already satisfied.

---

## The seams I tested at

Written down before the first cell, from the ticket's own acceptance criteria — every one a public
interface the brief names.

| # | seam | kind |
|---|---|---|
| S1 | `clara.wake_establish_prepayment_schedule(p_client, p_source_entry, p_target_account, p_target_basis, p_rationale, p_model, p_op_key)` | the wake door — same name, same seven arguments, same ACL |
| S2 | `clara._prepayment_schedule_core`'s new `'wake'` lane | the shared body the reroute lands in (#915/#939/#940's own) |
| S3 | `clara._prepayment_plan_core_wake` | the new plan step the wake lane takes |
| S4 | `clara._agent_prepayment_schedule_core` | the retired agent core — kept present, refuses unconditionally |
| S5 | `clara._propose_adjustment_template_core` | the template core — untouched, and the catalog census of its callers |
| S6 | `clara.wake_fn_allowlist` / `clara.wake_engine_sources` | the containment facts `p929.containment` pinned, re-measured as unchanged |

---

## Acceptance criteria, each with its evidence

### AC1 — a cell enables close_prep in a rolled-back transaction, drives the wake door, and finds a prepayment schedule with its occurrences and NO adjustment template

**DONE.** `packages/db/tests/prepayment-wake-reroute.test.mjs`, cell `p1036.acted`: inside one
rolled-back transaction, `clara.wake_engine_sources.close_prep.enabled` is flipped `true` (with the
`ck_wes_enabled_audit` stamps a real unparking act would carry) and, in the SAME transaction, the
wake door is driven on a real `clara_wake_interactive` session
(`mint_wake_credential_for_task` + the estate's own wake-query helper, never a direct
`clara_fn_owner` call). The answer: `kind = 'amortisation_schedule'`, `configuration_only = true`,
a real `schedule_id` and `plan_id`, `period_count = 3`, `total_cents` equal to the scene's own
amount, `prepaid_account_code` / `expense_account_code` matching the scene, and
`next_occurrences` carrying all three periods — the schedule's own occurrence preview, exactly as a
human's or a chat configuration's answer carries it. `clara.prepayment_schedules` holds exactly one
row for the source entry, `created_by = clara.agent_user_id()`. `clara.accounting_plans` holds the
plan with `authority_kind = 'explicit_instruction'`, `authority_ref = {kind:'agent_wake',
wake_kind:'close_prep', task_id:<the wake's own task>}`, `authorised_by = created_by =
clara.agent_user_id()`. `clara.adjustment_templates` for this firm is zero, before AND after. The
flag-flip is proven to have actually happened (read back `true` inside the transaction) and to have
leaked nothing (read back `false` after rollback).

### AC2 — a cell proves the wake's idempotency: the same wake twice yields one schedule

**DONE.** Cell `p1036.idempotent`: the same wake, same session, same mechanically-derived op key,
driven twice — the second call's answer is `deepEqual` to the first (byte-identical replay), exactly
one `clara.prepayment_schedules` row and one `clara.accounting_plans` row exist afterward. This rides
`clara._reserve_op`/`clara._finish_op` — the SAME idempotency mechanism #915/#939/#940 already proved
for the human and chat lanes — rather than the retired core's request-digest/receipt machinery.

I also drove the multiplicity case the retired core's own comment names (0140:3618-3621): two source
entries amortised in ONE wake task share `clara._close_wake_ctx`'s per-(task,verb,client) op key, so
the wrapper sub-keys by `p_op_key || ':' || p_source_entry`, exactly as the retired core did. Cell
`p1036.multiplicity`: two entries, one task, two distinct schedules, each with its own total.

### AC3 — a cell proves the template core has no caller in the catalogue and is not executable by any application role

**DONE.** Cell `p1036.template-core-retired` (and its independent re-proof in
`plan-overlap-template-arm-retired.test.mjs`'s `p1036.containment-closed`): a schema-wide scan,
`select p.proname from pg_proc ... where prosrc ilike '%_propose_adjustment_template_core%'`,
returns ZERO rows — not "the two known callers answered differently", the stronger claim the ticket
asks for. The template core's own ACL is re-measured as `clara_fn_owner=X/clara_fn_owner` exactly,
with a live rolled-back `GRANT EXECUTE ... TO clara_runtime` mutant proving the assertion is watching
something. The retired agent core itself, driven directly as its owner (it is ungranted — no
application role can reach it at all), raises `prepayment_agent_core_retired` unconditionally.

### AC4 — the retired-arm battery (`plan-overlap-template-arm-retired`) passes with the tripwire cell replaced, and the containment facts it pinned are no longer needed

**DONE.** `p929.containment` (which measured the ONE path left into `clara.adjustment_templates` and
pinned that it was held shut only by a runtime-side flag the database itself never reads) is replaced
by `p1036.containment-closed`: the residual is CLOSED — the schema-wide zero-caller census above — not
merely held shut, and the three containment facts (`wake_fn_allowlist`'s one row, the wrapper's one
grant, the flag's value) are re-measured as UNCHANGED rather than as a tripwire. The SAME flag mutant
`p929.containment` used is re-run, now proving the flag is inert to the residual rather than
dangerous: with `close_prep` flipped `true` inside the same rolled-back transaction, the schema-wide
scan still returns zero callers.

Run: `node --test tests/plan-overlap-template-arm-retired.test.mjs` — **5/6 pass, 1 pre-existing
fail** (`p929.tail`; see "Anything unverified" — not caused by this ticket).

### AC5 — ships as a new migration at the next free number; no applied migration is edited; every recut body is pinned by a sha measured on the rig

**DONE.** `packages/db/migrations/0315_prepayment_wake_reroute.sql`, at the number this lane
reserved for #1036. No applied migration touched. Prestate/tail detail below.

---

## The one genuine architectural problem, and how it was answered

The ticket's own words assume the reroute lands on "the live prepayment door,
`clara.create_prepayment_schedule` (0223)". By the time this ticket builds (after #915 and #941, per
this lane's own rules), that door and its OBO twin `create_prepayment_schedule_for` both resolve
their plan's authority through `clara._authority_ref_refusal` (via `clara._obo_plan_core`, #941's
own generalisation of #915's `_prepayment_plan_core`), which admits ONLY an `accounting_work` row or
a `chat_turn`-kind `agent_tasks` row with a non-null `created_by` — by design, "the wall that stops a
wake run or an autodraft from authorising its own amortisation schedule" (0307's own words). A
`close_prep` wake is exactly that caller: `mint_wake_credential_for_task`'s close_prep arm forbids
`on_behalf_of` BY CONSTRUCTION (0138:827-830 — "there is no directing human on the clocked lane"), so
it can never supply a ref that wall would admit, no matter what human identity it might try to name.
Measured, not assumed — I drove `create_prepayment_schedule_for` down this path by hand before
writing any new code and confirmed the refusal.

Widening `clara.accounting_plans.authority_kind` (a closed one-member CHECK) to admit an unattended
authority is a real schema change to the plan-authority model, well outside "reroute the wake door".
So the migration adds ONE new ungranted core, `clara._prepayment_plan_core_wake`, in
`clara._obo_plan_core`'s shape minus the authority-instruction wall: the authority is recorded
HONESTLY as `{kind:'agent_wake', wake_kind, task_id}`, and `authorised_by`/`created_by` is
`clara.agent_user_id()` — the estate's own existing "the agent wrote this" idiom (0103:264's own
words on `agent_act_receipts.acting_actor`; 0154's `proposed_by_agent` column). `CONTEXT.md`'s
**On-behalf-of door** entry already forbids exactly the wrong move I considered and rejected first
(a wake lane reaching an on-behalf-of write): "treating an on-behalf-of write as something a wake or
agent lane may reach ... is" its own `_Avoid_` line, which is strong independent confirmation this
design direction is the estate's own.

`clara._prepayment_schedule_core` (the ~500-line shared body #915/#939/#940 built) is recut with
EXACTLY two changes, diffed against its live pre-image and reproduced in the migration's own comment:
the lane closed-set widens `('human','obo')` → `('human','obo','wake')`, and the plan-step branch
gains one more arm calling the new core. Nothing else in that body moved — the purpose wall, the op
reservation, the duplicate check, the document/memo branch, #940's roster gate, 0042's shared negative
wall, the expense half, the allocation, the basis rung, the insert race and the audit are byte-for-byte
what the human and OBO lanes already ran, so the wake lane inherits "the same validation ... a
person's own creation gets" by construction rather than by a second copy.

---

## The migration

`packages/db/migrations/0315_prepayment_wake_reroute.sql`, one file. Sections: §0 prestate · §A
`clara._prepayment_plan_core_wake` (new) · §B `clara._prepayment_schedule_core` (recut, spliced from
the live body — see below) · §C `clara.wake_establish_prepayment_schedule` (recut) · §D
`clara._agent_prepayment_schedule_core` (recut to a retirement) · §TAIL.

**The recut of `_prepayment_schedule_core` was SPLICED, not retyped** (0178's own precedent): the
live `prosrc` was fetched from the rig, exactly two anchor strings were replaced (the lane closed-set
line; the `if/else` plan-step block, extended to `if/elsif/else`), each replacement's occurrence
count was asserted to be exactly 1 before writing, and a line-by-line `diff` against the original
confirms those are the ONLY two hunks that moved (reproduced in this report's own working notes; the
migration's own §0/§TAIL make the same claim in SQL). This is what makes "byte-for-byte what the
human and OBO lanes already ran" a measured fact rather than a promise.

**Prestate pins, MEASURED on `clara_l04` after 0308 and before the first apply:**

RECUT (bimodal — the file's own `#1036` marker distinguishes a redo from a fresh apply):

| signature | `sha256(prosrc)` |
|---|---|
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `143d4526bea145be8529b77c95a1438fb0753c17c11dc57e4f742edfd3130c9f` |
| `clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)` | `9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7` |

UNCONDITIONAL neighbours (must not have moved; relied on but never touched):
`_propose_adjustment_template_core` (non-regression — `b975d0af...`), `_close_wake_ctx`
(`5327c96b...`), `_prepayment_plan_core` (`266499b2...`), `create_accounting_plan` (`c8e99098...`),
`create_prepayment_schedule` (`62f909b7...`), `create_prepayment_schedule_for` (`230db25c...`),
`_assert_plan_schedule` (`ce0b24fd...`), `_assert_journal_basis` (`2ba8e307...`),
`_plan_overlap_warning` (`c2566349...`), `_plan_due_events` (`66100718...`), `_audit`
(`000c730c...`) — full shas in `packages/db/README.md`'s `## 0315` section.

**One finding worth naming explicitly:** `clara.create_accounting_plan`'s live sha had already moved
since #915's own report (`99f60787...` there, `c8e99098...` now) — #941 (0308) widened it to admit
`revenue_recognition_schedule` without updating a hardcoded expectation elsewhere (see "Anything
unverified"). I measured live rather than trusting either earlier document, per the wave-3 addendum's
own rule.

**Applied via `pnpm db:migrate`.** `clara.schema_migrations` reads 294 total, max
`0315_prepayment_wake_reroute`. First attempt FAILED and rolled back cleanly: the tail's own
zero-caller census tripped on the retired agent core's OWN retirement comment mentioning the template
core's name — fixed by rewording the comment (never the logic), reapplied clean second time. The
[notice] prestate line printed `FIRST APPLY` for all three recut bodies; the tail printed `OK` with
the full census described above.

**Redo-safe by construction (#957):** every object is a `create or replace function` (one new, three
recut), and the file writes no row and no schema object at all. Not exercised via
`CLARA_MIGRATION_REDO` — no post-landing edit was needed after the one prestate-only failure above
(which never applied and left nothing to redo over).

**Gate module / cohort / chain:** `tests/prepayment-wake-reroute-preintegration-gate.mjs`, stem
`prepayment_wake_reroute$`, env `CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE`; NO new `rig-meta.mjs`
cohort — the one new function is ungranted, and `rig-isolation.test.mjs`'s T17 grant-matrix census is
measured over application grants, so I ran T17 green with `rig-meta.mjs` completely untouched before
concluding no cohort row is owed (see Gates); `packages/db/package.json`'s `--import` entry, in
migration order, at the end of the chain (0315 is the newest migration).

---

## Gates, with counts

Every count is a real run on this lane's rig (`clara_l04`, port 55744). `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

- **New test file, focused** (`node --test tests/prepayment-wake-reroute.test.mjs`): **6/6 pass**.
- **Touched db test files + the new one, FULL GATE CHAIN** (111 `--import` flags from
  `packages/db/package.json`'s own `test` script, derived programmatically): `node --test
  --test-concurrency=1 $GATES tests/{prepayment-wake-reroute,plan-overlap-template-arm-retired,
  f-a4-pr2a-wrapper,f-a4-pr2a-books}.test.mjs` — **16/17 pass, 1 pre-existing fail** (`p929.tail`;
  not caused by this ticket — see below).
- **The wider prepayment/plan/FA-limb family + both censuses, FULL GATE CHAIN** (21 files, the same
  family #915's report ran plus `prepayment-wake-reroute` and `deferred-revenue`): **188 tests, 186
  pass, 1 pre-existing fail (`p929.tail`), 1 skip** (`T19 poison-role`, reset-gated, never set, per
  RIG.md).
- **`operation-census.test.mjs` + `rig-isolation.test.mjs`** (added an SQL function; never with a
  reset flag): included in the 188 above — **all green**, including T17's full grant-matrix census
  (18s), which is the direct evidence that leaving `rig-meta.mjs` untouched is correct rather than an
  oversight.
- **`pnpm typecheck`** from the worktree root: **exit 0** (`packages/runtime: Done`, `apps/web:
  Done`) — no `apps/web` or `packages/runtime` file was touched.
- **`pnpm lint`**, plain and `CI=true GITHUB_ACTIONS=true`: **exit 0** both ways.
- Not owed and not run: `apps/web` whole unit suite, browser walks, `check-frozen-workflows.mjs`,
  `check-parts-parity.mjs` — nothing in `apps/web` or `packages/runtime` was touched (no successor
  contract needed one; see below).

Known Windows-only reds from RIG.md: none encountered.

### Vacuity controls

- `p1036.acted`'s and `p1036.containment-closed`'s flag-flip mutants and `p1036.template-core-
  retired`'s grant mutant are LIVE, rolled-back mutants inside the green run above (not a
  separate before/after pass) — each asserts the flip took, then that it leaked nothing, and (for the
  containment cell) that the zero-caller census is unmoved by the flip.
- The rewrite is its own vacuity proof in one respect worth naming: the OLD wrapper's return shape
  (`{status, rung_vector, template_id}`) is structurally incompatible with every assertion `p1036.*`
  makes (`schedule_id`, `configuration_only`, `next_occurrences`) — these cells could not have passed
  against the pre-#1036 body, migration applied or not.
- The FIRST-APPLY branch was proved by the genuine first apply itself (the migration was written and
  applied once, on a database that had never carried it); the REDO branch was not separately staged
  since no edit followed the one prestate-only failure (see above), which never touched the database.

---

## Docs, in the same commits

- `packages/db/README.md` — new `## 0315` section (Context / what the file does / the one genuine
  architectural problem and how it's answered / the multiplicity key / how the template core is
  retired / what it deliberately does not do / prestate pins / gate-cohort-chain / the tests).
- `CONTEXT.md` — **Prepayment schedule**'s text no longer calls the agent entrance PARKED and pending
  retirement-or-reroute; it names the close_prep wake as a third, honest, no-person route. The
  **On-behalf-of door** entry needed no edit — its own `_Avoid_` line already forbids a wake lane from
  reaching an on-behalf-of write, which is exactly why the wake lane is a separate `'wake'` core
  rather than a third argument on the `_for` door.
- Two stale comments (describing the agent limb as still reaching the template core through the
  wrapper) corrected in `f-a4-pr2a-census.test.mjs` and `f-a4-pr2a-schedule.test.mjs`; neither carried
  an assertion, so no test behaviour moved.

---

## Successor contract

**None.** This ticket touches no frozen chat/Work tool surface. `wake_establish_prepayment_schedule`
is an internal, unattended, system-triggered close_prep wake — it is not reachable from `chatTurn` or
`claraWork` at all, and #915's own successor contracts (`start_prepayment_schedule_work`,
`read_prepayment_source`) are unaffected: neither names this door or its retired predecessor.
`node scripts/check-frozen-workflows.mjs` was not run (nothing in `packages/runtime` was touched);
there is no manifest to diff.

---

## Follow-ups worth filing

1. **`plan-overlap-template-arm-retired.test.mjs`'s `p929.tail` is a PRE-EXISTING failure, not caused
   by this ticket.** Its hardcoded `RECUT` array pins `clara.create_accounting_plan`'s sha at the
   value #929 measured (`99f6078775c07440...`); #941 (migration 0308, THIS lane, landed before this
   ticket started) widened that function to admit `revenue_recognition_schedule`, moving its live sha
   to `c8e990986a06b132...` without updating this test's hardcoded expectation. Confirmed pre-existing
   by stashing every change this ticket made and re-running the file: same 5 pass / 1 fail. Not
   fixed here — it is `p929.tail`'s own subject (`_plan_overlap_warning`'s callers), not #1036's, and
   fixing it would mean editing a cell this ticket does not own. Flagged for the integrator or a
   dedicated follow-up.
2. **`clara._accrual_plan_core` is still stale against #977/0250** (#915's own follow-up 1, unfixed,
   confirmed still true): the accrual OBO lane resolves authority with 0222's own `exists` probes
   rather than `clara._authority_ref_refusal`, so it would accept a `chat_task` ref
   `clara._obo_plan_core` now refuses. Outside #1036's own lane (#652's).
3. **A close_prep-authored plan's `authority_ref.kind` (`'agent_wake'`) is a value no OTHER reader in
   the estate currently branches on** (the sign-surface projection, the overlap advisory and the
   ledger reads all treat `authority_ref` as opaque JSON today, confirmed by reading their bodies).
   Worth a decision if a future surface ever wants to render "Clara configured this automatically"
   differently from "a person's own instruction" — not built here, as it is not named by this
   ticket's acceptance criteria.

---

## Anything unverified

- **Hosted/production behaviour:** not touched, not checked — this session worked entirely against
  `clara_l04` (127.0.0.1:55744). `clara.wake_engine_sources.close_prep.enabled` remains `false`,
  exactly as #927/#929 left it and as the ticket's own "out of scope: enabling the close_prep source
  on hosted" requires.
- **A true from-scratch chain (0001→0315)** was not independently re-run — RIG.md: "the integrator
  runs the from-scratch proof on a disposable cluster." The FIRST-APPLY branch is exactly the branch
  this session's own genuine first (and only successful) apply took and logged.
- **`p929.tail`'s pre-existing failure** (above) is reported, not fixed, and not caused by this
  ticket — verified by reverting every change this ticket made (via `git stash`) and re-running the
  file, which showed the identical 5-pass/1-fail split.
- **`_obo_plan_core`'s own live authority wall was read, not driven to a refusal by a wake caller
  attempting it** — I measured it (§ "the one genuine architectural problem") by hand, once, against
  `create_prepayment_schedule_for` before writing any new code, and did not keep that probe as a
  committed test cell (it would assert a path this ticket's own design makes permanently
  unreachable — the wake never calls that door at all after the reroute).
