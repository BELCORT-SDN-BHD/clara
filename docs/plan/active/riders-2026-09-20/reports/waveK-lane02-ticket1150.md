# riders closing wave — lane L2 — ticket #1150 (the shared `:plan` reservation namespace, and the third on-behalf-of plan-creation body)

- **Worktree** `C:\Users\zhant\Desktop\clara-wt\702` · **branch** `riders/wK-lane02` · **base** `ffb629d73`
- **Head after this ticket** `83dfeb8f0` (6 commits; `git log --oneline ffb629d73..HEAD`)
- **Database** `127.0.0.1:55742 / clara_c02`, ledger **338 files**, max `0364_plan_reservation_namespace_obo_fold`
- **Migration** `packages/db/migrations/0364_plan_reservation_namespace_obo_fold.sql` (1311 lines), ledger checksum `b8b4ca1f05376a56736a65048dd2bad2e816cb9324bff0813e50734c292ed205`
- **Status: DONE.** Every acceptance criterion is met except the from-scratch chain, which
  `CLOSING-PLAN.md` reserves to the integrator on a disposable cluster (risk 1: "Nobody runs a
  second from-scratch chain on this cluster").
- Worktree clean; no push, no PR, no GitHub write. **No mid-task status request reached this worker.**
- **Frozen law:** `git diff --name-only ffb629d73..HEAD -- packages/runtime` is **empty**, the
  manifest is byte-untouched, and `node scripts/check-frozen-workflows.mjs` reads
  `OK — 347 frozen file(s) verified … 60 "use workflow" module(s) all frozen+registered`.
  Every file this ticket touched is under `packages/db`.

---

## 1 · The seams I tested at (written down before the first cell, WORK-ORDER rule 4)

They are the ones the Agent Brief names under "Key interfaces", plus the two the brief's own
acceptance criteria reach:

| # | seam | why it is a seam and not an internal |
|---|---|---|
| S1 | `clara.create_accrual_adjustment(p_client, p_purpose, p_authority_ref, p_accrual, …, p_op_key)` | the accrual configuration door, whose nested plan reservation moves |
| S2 | `clara.correct_accrual_adjustment(p_accrual_id, p_accrual, p_op_key)` | the accrual correction door, whose nested **revision** reservation moves |
| S3 | `clara.confirm_tenancy_rent_plan(p_client, p_document, …, p_op_key)` | the human tenancy confirmation, whose nested plan reservation moves |
| S4 | `clara.confirm_tenancy_rent_plan_for(p_client, p_author, p_document, …, p_op_key)` | the on-behalf-of twin, whose plan step becomes a caller |
| S5 | `clara._confirm_tenancy_rent_plan_core` / `…_revision_core` | AC6 names them: `p_lane` is reachable from **no** door, so the closed set can only be driven at the cores the ticket names |
| S6 | `clara.create_prepayment_schedule(…, p_op_key)` and `clara.create_prepayment_schedule_for(…)` | the lane that KEEPS `:plan`, driven so "the others moved" is a claim about a key really spent on it |
| S7 | `clara._obo_plan_core(p_kind, …)` | AC4's subject; its closed kind set is reachable from no door either (all three callers pass a literal) |
| S8 | the LIVE CATALOG (`pg_proc.prosrc`) | AC2 is a claim about a body a LATER lane writes, which no cell written today can drive — this repo's own documented carve-out (WORK-ORDER rule 4) |

---

## 2 · Acceptance criteria, each with its evidence

### AC1 — "A cell drives one operation key across the accrual and tenancy lanes and across a prepayment schedule, and no pair collides on a nested reservation; before the change the same cell is seen red for exactly that collision."

**`p1150.cross_lane.create`** (`packages/db/tests/plan-reservation-namespace.test.mjs`). **PASS.**

One firm, three clients — `clara._reserve_op` keys on `(firm_id, fn, op_key)`, on the **firm**, so
three clients of one firm is exactly the shape a caller deriving its keys from a shared seed has.
One key `K` is spent on `create_prepayment_schedule`, then on `create_accrual_adjustment`, then on
`confirm_tenancy_rent_plan`. All three are admitted, the three plan ids are distinct (nothing
replayed across a lane), the three OUTER receipts stand under the three doors' own `fn`s, and the
nested ones stand as `K:plan`, `K:acplan` and `K:tnplan` — one row each, all three under
`create_accounting_plan`, which is why they could collide at all.

**Red first, for exactly the collision**, measured before §A existed:

```
not ok 1 - p1150.cross_lane.create …
  error: 'op_key reused with different args'
  code: 'CLR10'
  stack: async createAccrualAdjustment (…/tests/accrual-adjustments-fixtures.mjs:241:13)
```

— the accrual door, on the key the prepayment lane had just spent, answered `clara._reserve_op`'s
own untyped CLR10 with no `detail` at all.

**`p1150.correction.namespace`** carries the same claim for the correction lane, which reserves at
`revise_accounting_plan` and so never collided with the create doors but shared the prepayment
lane's token all the same. **PASS**: the nested receipt stands under `K:acrev`, nothing stands under
`K:plan`, and #936's typed `plan_op_key_conflict` still fires on a genuine collision and now names
`K:acrev` as the key it derived. Red first on the receipt: `[] !== ['revise_accounting_plan']`.

### AC2 — "A census cell reads every body that derives a nested plan reservation off the live catalog and fails if any two share a suffix, with no hand-written roster of bodies."

**`p1150.namespace.census`.** **PASS.**

The instrument (`plan-reservation-namespace-fixtures.mjs`) reads every `clara` body whose source
derives `p_op_key || ':x'`, masks `--` comments and string literals, walks back to the enclosing
call, and keeps only the derivations handed to a **plan** door. The masking is a measured need, not
caution: `clara._confirm_tenancy_rent_plan_revision_core`'s own comment writes
"clara.revise_accounting_plan (0193) is now a thin delegate", which a text-only matcher reads as a
call and attributes `:revise` to the wrong door. Eight other suffixes live on this catalog
(`:approve`, `:match`, `:settle`, `:post`, `:draft`, `:resolve`, `:assess`,
`:add_client_identifier`, `:file_document_write`) and belong to the bank, payroll, fixed-asset and
document families; the census drops them because it measures which door they reach.

Ten derivations survive, in four lanes:

```
:acplan  <- create_accounting_plan        by clara.create_accrual_adjustment
:acrev   <- revise_accounting_plan        by clara.correct_accrual_adjustment
:end     <- end_accounting_plan           by clara.replace_prepayment_schedule
:plan    <- create_accounting_plan        by clara._prepayment_schedule_core
:plan    <- create_accounting_plan        by clara.replace_prepayment_schedule
:revise  <- _revise_accounting_plan_core  by clara._confirm_tenancy_rent_plan_revision_core
:rrend   <- end_accounting_plan           by clara.replace_revenue_recognition_schedule
:rrplan  <- create_accounting_plan        by clara._revenue_recognition_core
:rrplan  <- create_accounting_plan        by clara.replace_revenue_recognition_schedule
:tnplan  <- create_accounting_plan        by clara._confirm_tenancy_rent_plan_core
```

**How the criterion is read, and why.** Taken at the letter — *"fails if any two [bodies] share a
suffix"* — the cell would have to red on `clara._prepayment_schedule_core` and
`clara.replace_prepayment_schedule`, which both derive `:plan`, and on the deferred-revenue pair,
which both derive `:rrplan`. That is 0336's own shape, which the same brief tells me to follow
("Each remaining `:plan` deriver takes its own suffix **in 0336's own shape**"), and it is the shape
`CLOSING-PLAN.md` scopes this ticket to ("moves the remaining nested `:plan` derivations **on the
accrual and tenancy doors**"). So the cell asserts the **lane partition**: no suffix is undeclared,
no declared suffix has lost its deriver, no body derives suffixes of two lanes, and no two lanes
share a deriving body. That is #1077's own final claim ("no body derives from both namespaces")
generalised from two lanes to four. The residual the letter would have caught is recorded as
follow-up 1 below rather than swept in.

The only hand-written thing in the cell is which LANE each suffix belongs to; **no body is listed
anywhere**, and every deriving body, every suffix and every door is discovered.

**Vacuity control (WORK-ORDER rule 4), driven rather than promised.** The reader's pure half takes
extra bodies, so the cell feeds it two that exist on no database — one deriving `:plan` and
`:acrev`, one deriving `:nobodysaid` — and asserts each is reported exactly once, with the live
estate still clean afterwards. **Separately measured against the three PRE-0364 bodies** (their
`prosrc` as dumped before the file was written, substituted into the live census):

```
PRE-0364 partition problems:
  - no body derives ':acplan' any more — the lane map has outlived its reason and must drop it
  - no body derives ':acrev' any more  — …
  - no body derives ':tnplan' any more — …
LIVE (post-0364) partition problems: []
```

### AC3 — "Each lane's ordinary, non-colliding idempotency is unchanged: a genuine retry with the same arguments still replays its stored result, driven per lane."

**`p1150.idempotent.per_lane`.** **PASS.** On all three lanes a second call with the same key and
the same arguments returns the first answer `deepEqual`, and exactly ONE nested receipt stands
(`K:plan`, `K:acplan`, `K:tnplan`) — the mechanism being that each lane's OUTER reservation
short-circuits the whole body, so a true retry never reaches the nested call. The accrual lane also
holds **zero** rows under `K:plan`. A retry with DIFFERENT arguments is still refused by the door's
own outer wall (`CLR10`, `op_key_conflict`), which this ticket deliberately leaves untyped.

### AC4 — "`clara._tenancy_plan_core` is a caller of `clara._obo_plan_core`, not a copy; a cell asserts the tenancy confirmation still admits and refuses exactly what it admitted and refused before, including the `client_inactive` arm lane L8 added."

**`p1150.obo.fold_parity`.** **PASS**, seven arms.

1. **The delegate, structurally**: the tenancy step names `clara._obo_plan_core(`, holds no
   `pg_advisory_xact_lock` and writes no `clara.accounting_plan…` row, and still carries
   `client_inactive`. The shared body has **not** gained that wall.
2. **`client_inactive` on both entrances**, `archived` and `onboarding`: same sqlstate, same
   sentence (`client is not active -- no new accounting plan`), same typed detail.
3. **The position**, driven: an archived client with NO terms recorded is answered
   `terms_incomplete` by BOTH entrances — the draft wall still sits above the plan step on both
   lanes, which an entrance-level copy of the status wall would have broken.
4. **The replay**, driven on both entrances: a confirmation the person already made replays to its
   stored receipt after the client is archived.
5. **What the on-behalf-of lane writes**, read at the rows: kind `recurring_journal`, status
   `active`, `explicit_instruction` + a `contract_confirmation` reference, `authorised_by` and
   `created_by` the NAMED human, revision 1, and 0193's own audit row carrying
   `via = confirm_tenancy_rent_plan_for`.
6. **The shared body's kind set is still closed**, driven at the body: `a_kind_nobody_minted`
   answers CLR10 `plan_kind_unsupported` naming the kind.
7. **The lane that already used the shared body is untouched by the widening**:
   `create_prepayment_schedule_for` still configures on a real `clara_runtime` connection, and its
   plan's audit row still says `via = create_prepayment_schedule_for`, kind
   `amortisation_schedule`.

**Red first:** the tenancy step did not name `clara._obo_plan_core` (assert.match failed against the
third snapshot's whole body).

**The strongest evidence is 0353's own battery, unchanged and green.** After the fold,
`tenancy-agent-twins.test.mjs` runs 22/22, including `p1137.obo.refusals_match`,
`p1137.obo.same_receipt_as_the_human_door`, `p1137.obo.authority`,
`p1137.obo.one_op_key_namespace`, `p1137.revision.*` and `p1137.acl.eight_doors_two_roles`. Not one
of them was edited.

**One difference, disclosed rather than discovered later.** `clara._obo_plan_core` answers
`authority_kind = 'standing_instruction'` with its own arm (0338 §E) where `clara._tenancy_plan_core`
sent every kind to `clara._assert_plan_authority`, which refuses that kind `invalid_authority_kind`.
No caller can reach the difference: `clara._confirm_tenancy_rent_plan_core` passes the literal
`'explicit_instruction'`, the body is ungranted (`clara_fn_owner` only, ACL measured) and nothing
else on the catalog calls it. It is written into §F's own comment and into `packages/db/README.md`.

### AC5 — "The `(T.4)` roster entry for the tenancy step is removed together with the body it watched, and `p929`'s tail is green."

**PASS.** `packages/db/tests/plan-overlap-template-arm-retired.test.mjs`: from 0364's generation on,
`recutRoster()` drops `clara._tenancy_plan_core` and takes `clara._obo_plan_core` in its place, at
its post-0364 sha. The roster **follows the computation**, exactly as it followed the revision
door's in #1137's generation, and the file's own stated principle says so ("the claims (T.4) makes
are about the COMPUTATION … so from that generation on they are checked where the computation is").
A new **(T.6)** pins the tenancy delegate the way (T.5) pins the revision one: named delegate, no
rung, no plan row, and its own `client_inactive` wall still present. `p929.tail`: **PASS** (the
whole file 6/6).

Had the entry simply been deleted, `clara._obo_plan_core` would have become an unwatched plan
writer carrying THREE lanes — which is the exact gap `SPEC-L08-1137-E` closed for 0353.

### AC6 — "`p_lane` is refused outside its closed set in both confirmation cores, driven."

**`p1150.lane.closed_set`.** **PASS.** Five lane values (`"human "`, `"HUMAN"`, `"chat"`, `""`,
`null`) through BOTH cores: CLR10, `detail.reason = invalid_lane`, `detail.field = lane`, and **no
receipt of any kind** left behind under the key. With the lane AND the op key both wrong, the lane
is answered first — it sits above the op-key wall because an unknown lane is a programming error in
the estate's own code, not a caller's mistake. Both REAL lanes are then driven end to end through
their own public entrances, each stamping its own `via` on 0353's confirmation audit row.

**Red first:** `"human "` (trailing space) was answered `CLR04` by the JWT path — fail-closed, and
answering a question nobody asked.

**The harm was not hypothetical in the revision core**, which has no lane branch at all: `p_lane`
there decides only the `via` its audit row carries, so an unknown lane stamped the HUMAN `via` on an
act no person took.

### AC7 — "The migration applies from scratch and on a populated database, first-apply branch proved, and the from-scratch chain is green."

- **On a populated database: PASS.** `clara_c02` is a clone of the sweep wave's ordered integration
  replay (`clara_intS6`, 337 files / `0361`), carrying other firms' rows. The ledger now reads
  **338 files, max `0364_plan_reservation_namespace_obo_fold`**.
- **The FIRST-APPLY branch: PROVED, and it is not what `CLARA_MIGRATION_REDO` proves.** The prestate
  is bimodal (each recut body admits its pinned pre-image OR a body already carrying `0364`), and a
  redo only ever takes the second branch. Inside ONE transaction I restored all six pre-images from
  the definitions measured before the file was written, ran §0 **verbatim out of the migration
  file**, and rolled back. §0 said:

  ```
  0364 prestate OK -- 6 FIRST, 0 REDO -- clara.create_accrual_adjustment(…)=FIRST
  clara.correct_accrual_adjustment(…)=FIRST clara._confirm_tenancy_rent_plan_core(…)=FIRST
  clara._confirm_tenancy_rent_plan_revision_core(…)=FIRST clara._obo_plan_core(…)=FIRST
  clara._tenancy_plan_core(…)=FIRST
  ```

  The six live bodies were re-measured after the rollback and are at their post-0364 shas, owner
  `clara_fn_owner`.
- **The from-scratch chain: OWED TO THE INTEGRATOR, not claimed.** `CLOSING-PLAN.md` risk 1:
  "Nobody runs a second from-scratch chain on this cluster; the from-scratch proof is the
  integrator's, on a disposable cluster." I ran none.
- **Redo mode was used, and is recorded.** The file was applied once and re-applied three times with
  `CLARA_MIGRATION_REDO=0364_plan_reservation_namespace_obo_fold` as each vertical slice added a
  section. Every statement in it is `create or replace function`, so a redo over its own old effects
  is safe by construction.

### AC8 — "`CI=true GITHUB_ACTIONS=true pnpm lint` exit 0."

**PASS**, exit 0, from the worktree root. (One red on the way, fixed: an unused `opk` import in the
new fixtures module.)

---

## 3 · The migration

**`packages/db/migrations/0364_plan_reservation_namespace_obo_fold.sql`**, 1311 lines, at the number
`CLOSING-PLAN.md` reserves for this ticket. **No other migration was edited. `0351` is not
reclaimed.** Ledger checksum `b8b4ca1f05376a56736a65048dd2bad2e816cb9324bff0813e50734c292ed205`.

| § | body | the hunk |
|---|---|---|
| A | `clara.create_accrual_adjustment` | `p_op_key \|\| ':plan'` → `':acplan'` |
| B | `clara.correct_accrual_adjustment` | `':plan'` → `':acrev'`, in the call, in the `nested_op_key` the typed refusal names, and in the comment that explains both |
| C | `clara._confirm_tenancy_rent_plan_core` | `':plan'` → `':tnplan'` on the HUMAN branch, plus the closed lane set |
| D | `clara._confirm_tenancy_rent_plan_revision_core` | the closed lane set |
| E | `clara._obo_plan_core` | the closed kind set gains `recurring_journal`, and that kind gains its `via` |
| F | `clara._tenancy_plan_core` | **replaced** by its own client-status wall plus a call to §E |

Sections A to E are each their body's own LIVE text (`pg_get_functiondef`) with only the hunks
above; §F is a rewrite, which is the point of it. §TAIL re-measures nine things off the live
catalog, including that the posture (owner, `SECURITY DEFINER`, volatility, `search_path`) of all
six is unmoved and that `clara._obo_plan_core` did **not** gain the tenancy lane's client-status
wall. ACLs were measured before and after and are byte-identical (`create or replace` preserves
them).

### Prestate pins — MEASURED on `clara_c02` (337 files, max `0361`) before the file was written

**Recut, bimodal** (its measured pre-image, or a body already carrying this file's `0364`):

| signature | pinned pre-image | post-0364 |
|---|---|---|
| `clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)` | `09c682f52d6d9209425ff2923e37aba95ef4d483511ccee9d9829fd91985eed2` | `a6319d252d8db1cc9d4615c89965e8ceca080422519d37971e1652522eb1f998` |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa` | `5f26b7061cc19f58a1233702b8aae2538eb25e25cb5833edd8fd1a9bbaa03494` |
| `clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)` | `e8a65796245bd331a72c7f92c6b882737f45e4f1be12c35739f5ea430265ef29` | `a4650cd2f28d86656cf812174d260c1a2e0c489deedcb139279e232b95328b40` |
| `clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text)` | `5fe080568b2cf3ae0e5258af244340789e376d2060e6695ff08fc99b8c15a2d4` | `17447d683ed1af1540287dc63b59f780741cc3ce79a46a776eb4c40c9f0616a1` |
| `clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `bbe338e80dfe0b19f7c4b7af49138982ac37c3282c26cdebc429dad6aa8de4a2` | `1e36654777973175ed81b08bd579a4beb87339b07e4c3b6071d5bc2a33db9d56` |
| `clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `9560414f256f80e641cb04a60d140fa4bd0189c722db0f9f97b47a797e3699a3` | `67fd7548a7ded4d4343aec98ae6cd919c0963c48955f9b27538e904d00404a79` |

**Read and NOT edited, pinned exactly** (a move in any of these must re-open this file's reasoning):

| signature | sha |
|---|---|
| `clara._reserve_op(uuid,text,text,bytea)` | `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `544cd88ecaa5b5237969aff36b1bd0d8a5cdf41aacea234e6415d3df54b523ea` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `af096b607079e11a7888d907f8c5c9f03880ead0b9565ec26ee6feb9257dafd7` |
| `clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)` | `ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699` |
| `clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)` | `94804ddc1dccd444c5bb5294524634db4afea043499eb8746dd7aae16b02ad77` |
| `clara._assert_plan_authority(text,jsonb,uuid,uuid)` | `60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a` |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `89d2ac3a33e8dcda53b0f42a6c500a6a9aefd567af57ecfe181ce82eaa248625` |

§0 also refuses ahead of 0336 or 0353, checks that the deferred-revenue lane really is off `:plan`
already (2 bodies derive `:rrplan`), and checks that **nothing outside this file's own three bodies
already derives `:acplan`, `:acrev` or `:tnplan`** — so the suffixes it mints are free on the day it
applies.

### Pins this file puts in TEST files, which the integrator must reconcile too

`packages/db/tests/plan-overlap-template-arm-retired.test.mjs` now pins
`clara._obo_plan_core` at `1e36654777973175ed81b08bd579a4beb87339b07e4c3b6071d5bc2a33db9d56` (on the
(T.4) roster) and `clara._tenancy_plan_core` at
`67fd7548a7ded4d4343aec98ae6cd919c0963c48955f9b27538e904d00404a79` (the new (T.6) delegate pin). Any
later lane that recuts either body moves these.

---

## 4 · Data-dependent branches, and which states were covered

Neither §0 nor §TAIL has a branch that only runs when rows exist: the file reads no row, backfills
nothing and counts no data. Every branch in it is over `pg_proc` and `clara.schema_migrations`, and
both the FIRST and REDO arms of the prestate were entered (§2, AC7). The **doors** were driven over
populated states on a database that carries other firms' data: three live lanes under one firm, an
archived and an `onboarding` client, a tenancy with terms recorded and one without, an accrual and
its correction and a correction of that correction, and a replay on every lane.

---

## 5 · Gates, with counts

| gate | command | result |
|---|---|---|
| the three files I added or rewrote, full gate chain | `node --test --test-concurrency=1 $GATES tests/plan-reservation-namespace.test.mjs tests/plan-overlap-template-arm-retired.test.mjs tests/tenancy-agent-twins.test.mjs` | **34 tests, 34 pass, 0 fail, 0 skipped** |
| the three neighbouring files this ticket's blast radius touched | `… $GATES tests/accrual-correction.test.mjs tests/accrual-plan-authority-wall.test.mjs tests/authority-ref-human-instruction.test.mjs` | **22 tests, 22 pass, 0 fail, 0 skipped** |
| the WHOLE `packages/db` suite, **pass 1** (includes `operation-census` and `rig-isolation`, run with no reset flags) | `node --test --test-concurrency=1 $GATES "tests/**/*.test.mjs"` | **6041 tests, 5928 pass, 3 fail, 110 skipped** — the three are §6 below, each fixed and re-run |
| the same suite, **pass 2**, after those fixes | the same command | **6041 tests, 5876 pass, 58 fail, 107 skipped** — all 58 are the estate's own re-run guard, §5.1 below |
| the web migration-pins corpus (`CLOSING-PLAN.md` rule (d): a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 tests, 22 pass, 0 fail, 0 skipped** — no barrier entry owed (this migration writes no dynamic SQL) |
| typecheck | `pnpm typecheck` | exit **0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit **0** |
| the frozen law | `node scripts/check-frozen-workflows.mjs` | `OK — 347 frozen file(s) verified … 3 retired entr(ies) recorded` |

`apps/web` was not touched, so no whole web unit suite and no browser walk is owed. The Playwright
triple 3610 / 3611 / 3612 was not used.

### 5.1 · The two whole-suite passes, and why the second one's 58 reds are not this ticket's

The `packages/db` suite is designed to run **once per database**, and the estate says so in its own
refusals. Pass 2 was a second pass over the same `clara_c02`, so 58 cells in exactly three files red
on accumulation and on a deploy-once guard:

| file | cells | what it says |
|---|---|---|
| `f-a5b-sandbox-export-pr1.test.mjs` | 55 | its `before` hook: `F-A5b PR-1 DRIFT: relations=true fns=14/14 sandbox_watermark rows=4/3` — pass 1 wrote the fourth row; the hook failing fails all 55 |
| `f-t1-sst-reference.test.mjs` | 2 | `sst_rate_schedule carries exactly 10 seed rows (got 12)` |
| `f-a5-reporting-agency-pr1.test.mjs` | 1 | `evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set to "1" … export CLARA_ESTATE_REUSED_DB=1 to acknowledge a re-run against this same database` |

The class is documented: `packages/db/tests/statutory-deadlines-ddl.test.mjs`:15-24 —
"against a REUSED local dev rig … these rows ACCUMULATE across repeated runs", citing
`packages/db/README.md`:108's `CLARA_ESTATE_REUSED_DB` note.

**The two passes cross-check each other, which is stronger than either alone:**

- **Pass 1 greens all three of pass 2's red files** (`ok 1728`, `ok 1824`, `ok 2057`), so the 58 are
  accumulation and not a regression.
- **Pass 2 greens all three of pass 1's red cells** (`ok 161 p936.refusal.plan_key_conflict`,
  `ok 181 p1080.wall.one_spelling`, `ok 293 p977.definition.one`), so the §6 fixes work inside the
  whole suite and not only in a focused run.
- **All seven `p1150.*` cells are green in pass 2** as well as in the focused runs
  (`ok 3073` … `ok 3079`).
- **Not one red in either pass is in the plan, accrual, tenancy, prepayment or deferred-revenue
  families** after §6.

### One Windows-only condition, PRE-EXISTING, reported rather than "fixed"

`pnpm --filter @clara/db test` fails on this host with `The command line is too long.` before any
test runs. The `"test"` script is a single command line carrying 153 `--import` gate flags;
at `ffb629d73` it is already **9814 characters**, and `cmd.exe` — which is what pnpm spawns a script
through on Windows — refuses anything over about **8190** (measured: 8100 OK, 8190 FAIL). My gate
brings it to 9882, so the breakage predates this ticket by a wide margin and is not a regression of
it. CI is Linux, where `execve`'s limit is ~2 MB, so the runner is unaffected. Everything above was
therefore run the way `RIG.md` documents — `node --test --test-concurrency=1 $GATES …` from Git Bash
— which works. Follow-up 3 below.

---

## 6 · Blast radius: three neighbouring cells, and why each moved

The whole-suite run found exactly three reds outside this lane's own files. None was a defect in
what they measure; each had pinned something 0364 moves, and each now reads the fact off the live
chain so it is true on a chain either side of this migration.

1. **`p936.refusal.plan_key_conflict`** (`accrual-correction.test.mjs`) spent `<key>:plan` at the
   plan door to manufacture the collision the correction door types. The door now derives `:acrev`.
   The cell reads the suffix off the LIVE body, which is what it was really asserting all along.
2. **`p1080.wall.one_spelling`** (`accrual-plan-authority-wall.test.mjs`) pins the exact roster of
   bodies that call `clara._assert_plan_authority`. The tenancy step joined that roster at the sweep
   wave's integration merge and leaves it here, because after the fold the tenancy lane reaches the
   wall THROUGH `clara._obo_plan_core`. Probed at the ledger; the roster returns to three.
3. **`p977.definition.one`** (`authority-ref-human-instruction.test.mjs`) asserted that the tenancy
   step NAMES the shared wall. After the fold it reaches it through the shared body, so the cell
   asserts the reach, and on a folded chain also asserts the delegate carries **no** authority wall
   of its own — which is #1051's own rule.

---

## 7 · A cell the brief asked me to delete, which I moved instead

The brief says of `p1137.obo.plan_step_parity`: *"becomes unnecessary and goes with it … the parity
that cell measures becomes exact by construction, because both entrances reach the same body."*

**Measured, they do not.** The HUMAN entrance still reaches `clara.create_accounting_plan` (0193);
the on-behalf-of entrance now reaches `clara._obo_plan_core`. The fold makes the OBO lane's plan
step two bodies instead of one; it does not merge the two lanes. A wall a later ticket adds to
0193's door would still be missed by the machine lane — which is precisely what ADV-L08-01 was.

So the cell left `tenancy-agent-twins.test.mjs` (where it named `clara._tenancy_plan_core` alone and
would now read three refusal tokens where there are eight) and came back as **`p1150.obo.wall_census`**,
re-aimed at the two bodies that now hold the step; its behavioural arms (the wall's position, the
draft-wall order, the replay after archiving) are arms 2 to 4 of `p1150.obo.fold_parity`, driven on
both entrances exactly as before. `plan_kind_unsupported` **left** the unreachable roster, because
the folded step raises it — a stale entry is a red in that cell, so it could not have stayed.

The place it stood carries a comment saying where it went and why, so the move is followable from
0353's own file.

**Its vacuity control is a measurement, not an argument:** the same census, on this rig, went red
the moment the fold landed and before it was re-aimed —
`not ok 18 - p1137.obo.plan_step_parity` in the `tenancy-agent-twins.test.mjs` run of 2026-09-26,
with the whole rest of that battery (26 of 28) green.

---

## 8 · Docs

- **`packages/db/README.md`** — a new `## 0364` section (its own, never an edit to an existing one):
  what 0336 left, the four-lane suffix table, why nothing is backfilled, the six sections, the fold
  and the wall that stays, the disclosed `standing_instruction` difference, the closed lane set,
  what the file does not do, and the within-lane residual.
- **`packages/db/package.json`** — one `--import ./tests/plan-reservation-namespace-preintegration-gate.mjs`
  at the sorted position, in migration order (last, after `reservation-release-advice`).
- **`packages/db/tests/rig-meta.mjs`** — **no entry owed**: this file mints no new name (it recuts
  six existing bodies) and mints no database role.
- **`CONTEXT.md`** — no new vocabulary. "Nested reservation namespace" is 0336's term and is already
  carried in `packages/db/README.md`'s `## 0336` section.
- **`apps/web/messages/en.json`**, **`apps/web/test/manifest.txt`** — untouched; nothing under
  `apps/web` changed.

---

## 9 · Successor contract

**Nothing a frozen chat or Work tool needs changed, and that is a measurement.** No file under
`packages/runtime` or `apps/web` is touched; `git diff --name-only ffb629d73..HEAD` lists ELEVEN
files, every one of them under `packages/db`. No surface anywhere derives a nested plan key: `grep` for `':plan'`,
`:acplan`, `:acrev`, `:tnplan` and `:rrplan` across `apps/web` and `packages/runtime` (excluding
`node_modules`) returns nothing, so the suffix move is invisible above the database.

**For lane LC (#1144), which is minting the seven deferred chat tools in this same wave** — two
facts it should have, both measured on this branch:

1. **`clara.confirm_tenancy_rent_plan_for(p_client, p_author, p_document, p_rent_account,
   p_payable_account, p_judgement, p_op_key)` and
   `clara.confirm_tenancy_rent_plan_revision_for(p_client, p_author, p_document, p_judgement,
   p_op_key)` are byte-unchanged by this ticket** — same signature, same argument order, same ACL
   (`clara_runtime` only), same result envelope, same refusal ladder. `waveS-lane08-fix.md` §7's
   amendments (the `client_inactive` row and its position, the part kind, the stable op key, and
   `read_agreement_terms` taking `{document_id, client_id}`) all still stand as written.
2. **The new `invalid_lane` refusal needs NO row in any tool's refusal mapping.** It is raised by
   `clara._confirm_tenancy_rent_plan_core` and `…_revision_core`, both of which are ungranted
   (`clara_fn_owner` only, measured) and both of whose entrances pass a literal lane. No chat tool,
   no Work tool and no surface can reach it. It exists so that a future entrance which forgets to
   fails loudly instead of silently stamping the human `via`.

---

## 10 · Follow-ups worth filing

1. **The within-lane nested collision 0336 and this file both leave standing.** One operation key
   spent on `clara.create_prepayment_schedule` and again on `clara.replace_prepayment_schedule`
   collides on `<key>:plan` under `create_accounting_plan` — same defect class as #1077 and #1150,
   one lane instead of two. The deferred-revenue pair has the identical residual on `:rrplan`
   (`clara._revenue_recognition_core` and `clara.replace_revenue_recognition_schedule`). Measured on
   the live catalog; not driven, because closing it means recutting two more bodies and
   `CLOSING-PLAN.md` scopes #1150 to "the accrual and tenancy doors". The census cell would red the
   day either lane's two bodies stopped being one lane, but it does not red on this, by design.
2. **`:revise` is the one nested plan suffix that is not lane-qualified.** 0353 wrote it before this
   partition existed; nothing else derives it, so it collides with nothing today, and moving it was
   outside this ticket's own words ("each remaining `:plan` deriver"). It is declared as the tenancy
   lane's in the census map, which is what makes a second claimant a red.
3. **`packages/db`'s `"test"` script has outgrown `cmd.exe`.** 153 `--import` flags, 9814 characters
   at the base and growing by one gate per migration; three more lanes of this wave add four more.
   Linux CI is fine, Windows is not, and the failure looks like a test failure rather than a shell
   limit. A gate module that imports the others, or a `--import ./tests/all-preintegration-gates.mjs`
   barrel, would take the line back under a thousand characters. Evidence in §5.
4. **`clara._reserve_op`'s reuse raise is still untyped.** #1077's follow-up 2, explicitly out of
   scope here and unchanged by this ticket; every governed door in the estate rides that primitive.
5. **`clara._obo_plan_core` now carries three lanes and is on the (T.4) roster for the first time.**
   Worth a look when a fourth lane wants it: the closed kind set, the `via` case and the roster pin
   all have to move together, and §TAIL item 8 is what enforces that.

---

## 11 · Anything unverified

- **The from-scratch chain.** Not run, by instruction (`CLOSING-PLAN.md` risk 1). The integrator owes
  it on a disposable cluster.
- **Hosted.** Nothing was applied anywhere but `clara_c02`.
- **The three neighbouring cells on a PRE-0364 chain.** Their new branches (`tenancyStepFolded ===
  false`, and the `:plan` suffix read off a pre-0364 body) are reasoned from the ledger probe and
  from the pre-0364 sources I dumped, but I did not run them against a database without 0364 —
  this cluster holds no such database and the closing plan forbids building one here. A sweep
  against an older chain would exercise them.
- **`p1150.obo.wall_census`'s own vacuity** rests on the measured red of its predecessor
  (`not ok 18 - p1137.obo.plan_step_parity`, §7), not on a second deliberate break of a subject on
  the shared rig.
- **The ticket had no comments at all** (`gh issue view 1150 --json comments` → `[]`), so no owner
  ruling of 2026-09-20 or later bears on it beyond the standing rulings in WORK-ORDER rule 6.
