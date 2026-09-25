# riders sweep wave · lane 02 · ticket #1114 — CLR10 is reused for an internal wiring error and a real prepayment/deferred-revenue refusal

**Status: done.**

- Branch `riders/wS-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base `7bc5a710f`.
- Database `clara_l05` on `127.0.0.1:55745`. Ledger before: 309 files, max `0318_knowledge_fye_pair_applicability`. After: **310 files, max `0335_internal_refusal_errcode`**; a second `migrate` reports 0 new applied and no drift.
- Six commits, all on this branch, none pushed:

| commit | what |
|---|---|
| `f3eabb730` | slice 1 — the prepayment OBO twin's null-author refusal leaves CLR10 |
| `47abfa277` | slice 2 — the deferred-revenue OBO twin's null-author refusal leaves CLR10 |
| `42b6a804e` | slice 3 — the prepayment machine-lane read's scope refusal leaves CLR10 |
| `1e80a6cc6` | slice 4 — the deferred-revenue read's scope refusal leaves CLR10, and the migration tail |
| `bf670ac32` | slice 5 — AC1 driven at both doors: the two refusals differ by errcode alone |
| `12e1ea6d3` | slice 6 — the partition census, the second catalog aligned, the audit written up |

The ticket is still live on this branch: `gh issue view 1114` is OPEN, `ready-for-agent`, with **no comments at all** (so no 2026-09-20 owner ruling; the body's Agent Brief is the whole contract). Nothing on `main` had already done it — `packages/db/migrations/0307_prepayment_schedule_obo_twin.sql:971` and `0308_deferred_revenue_recognition.sql:1522` both still raised `invalid_author` under `CLR10` at `7bc5a710f`, measured on the rig before the first line was written ("expected SQLSTATE CLR44 but got CLR10").

No message arrived mid-task.

---

## The seams I tested at (written before the first test, work order rule 4)

The brief's "Key interfaces", one per line, each a public door or a catalog the estate keeps:

1. `clara.create_prepayment_schedule_for(p_client, p_author, …)` — the errcode of its null-author wall, driven on a real least-privileged `clara_runtime` connection.
2. `clara.create_revenue_recognition_schedule_for(p_client, p_author, …)` — the sibling on-behalf-of twin the brief names explicitly ("any sibling on-behalf-of twin using the same null-author wall, including the deferred-revenue twin").
3. The shared enrolment check's account-not-enrolled raise, reached through the same two twins and their human doors — its errcode must stay what the web already renders, and must differ from (1) and (2).
4. `clara.read_prepayment_source_for` / `clara.read_revenue_recognition_source_for` — the two machine-lane read scopes, the audit's other finding.
5. The central errcode catalog "wherever the estate keeps it".

No test was written at a seam the brief does not give me. In particular I drove no web surface: the brief's AC4 says the web is unaffected, and neither of the four moved refusals is reachable from a browser at all.

---

## What was built, and the one design decision inside it

`CLR10` is the estate's `bad-request` (`packages/db/migrations/0002_foundation.sql:42`) and it is raised **5293** times across the migration set; **626** live `clara` bodies raise it under **468** distinct reason tokens (both counts measured, the first by grep over `packages/db/migrations`, the second off `pg_proc.prosrc` on the lane database). Almost every one of them is a refusal a surface is expected to render.

So the ticket's collision has two possible fixes and only one of them works:

- **Move the renderable half** (`prepayment_source_unfit` / `deferred_revenue_source_unfit`) onto a new code. That is a much larger diff, it would split one reason across two codes (the `*_source_unfit` token is also raised for the ineligibility axis and for `source_not_posted`, `source_reversed` and four more), and — decisively — it would leave the never-shown half sitting on `CLR10` beside thousands of renderable refusals, so the ticket's own stated test ("any code path that branches on the error code first … cannot accidentally treat a real, actionable refusal as an internal error to be swallowed, or vice versa") would **still fail**.
- **Move the never-shown half.** Four raises, and it PARTITIONS the two meanings:

      CLR10  — a bad request a surface may render. Unchanged, everywhere.
      CLR44  — a CALLER-CONTRACT VIOLATION: a clara_runtime-only door was handed a null
               its own caller's contract guarantees. Never rendered.

I built the second. **Note for the integrator:** `SWEEP-PLAN.md:140-146` anticipated #1114 recutting `clara._prepayment_schedule_core` (0317:1588-1596) and `clara._revenue_recognition_core` (0317:2127-2134) — i.e. the first option. I did not, and the argument is above; the practical consequence is **good** for the lane, because the two bodies #1077 recuts next are left exactly as 0317 wrote them, with no post-image to re-derive against. The plan's line "whichever of #1114 and #1077 lands first is the prestate the other re-derives against" is discharged trivially: #1114 pins both cores EXACTLY and moves neither, so #1077 pins the same 0317 shas I did.

`CLR44` is free: no occurrence anywhere in `packages`, `apps`, `docs` or `.github` before this branch. The codes in use across the repo are `CLR00`–`CLR43` plus `CLR99`, so `CLR44` is the next free number, which is how this estate has minted them.

---

## Acceptance criteria, each with its evidence

### AC1 — "The invalid-author refusal and the account-not-enrolled refusal are raised with distinct errcodes."

Driven at the door, both refusals in one cell, on both lanes.

- `p915.obo.roster_first` (`packages/db/tests/prepayment-schedule-obo.test.mjs`): the same `clara.create_prepayment_schedule_for` call answers `CLR10` / `prepayment_source_unfit` / axis `prepaid_account_not_enrolled` (with `remedy` and `panel` intact) for an unenrolled prepaid leg, and `CLR44` / `invalid_author` when handed no author. `assert.notEqual(wiring.err.code, refused.err.code)`. **PASS.**
- `p941.create.refusals` (`packages/db/tests/revenue-recognition.test.mjs`): the same pair on the deferred-revenue lane — `CLR10` / `deferred_revenue_source_unfit` / axis `deferred_account_not_enrolled` against `CLR44` / `invalid_author` through `clara.create_revenue_recognition_schedule_for`. **PASS.**
- Structurally, at the catalog: `p1114.partition.renderable` (`packages/db/tests/refusal-errcode-partition.test.mjs`) walks every `clara` body raising either not-enrolled axis, requires each to raise its token under `CLR10`, and requires none of them to contain `CLR44`. **PASS.**
- Migration tail §E.4 asserts the same thing at apply time.

**Vacuity control for both cells.** The door's pre-image was re-installed on the rig by hand (`sed -n '955,1004p' 0307…` and `sed -n '1506,1556p' 0308…`, executed as `postgres`), each cell was seen failing with `expected SQLSTATE CLR44 but got CLR10 — an on-behalf-of configuration names the human it acts for`, and the subject was restored by redoing 0335 — back to the identical checksum `439962ebd877cc5376dbda790fdf75d0b4f2fbee63f431863331924ffd063f11` both times.

### AC2 — "Any other refusal reason currently sharing CLR10 is audited and given its own code where it is meant to reach a user."

There is **no errcode catalog file** in this estate (confirmed: `CLR10`'s meaning is one line of comment in 0002 plus `packages/db/README.md` prose; the code-side catalogs are `packages/db/tests/rig-helpers.mjs`, `CLR01`–`CLR12`, and a smaller one in `packages/db/tests/work-journal-fixtures.mjs`). So the audit is a grep plus a README job, exactly as the lane scan predicted.

- **Population.** Every `CLR10` raise in `packages/db/migrations` was grepped and read by reason token, cross-checked against the live catalog (626 bodies / 468 distinct tokens).
- **The test applied** was not "is this user-facing?" — almost all of them are — but "does the estate's own prose say this one is never shown?" Exactly **two** prose sites in the repository do, naming three tokens: `reports/wave4-lane04-ticket915.md:359` (`invalid_author` (CLR10) → an internal wiring error, never shown) and `:389` (`prepayment_read_scope_required` → an internal wiring error, never shown), carried into `CUT-PLAN.md:210` and `:215`. The deferred-revenue twins are the same two walls written "in #915's shape" (0308 §E2's own header).
- **All three tokens were moved**, across four bodies. `invalid_op_key` deliberately **stays** on `CLR10`: human doors all over the estate raise it for a person's own malformed call, so it is not a caller-contract class.
- **The catalog got its entry, in both places.** `rig-helpers.mjs`'s `CLR` gains `callerContract: "CLR44"` with the meaning written out; `work-journal-fixtures.mjs`'s smaller `CLR` gains the same key with the same meaning and a pointer saying which is the fuller list. (That divergence was itself a trap: `CLR.callerContract` read `undefined` in the OBO test file until both were aligned, because that file re-exports the smaller catalog.)
- **The audit is held afterwards.** `packages/db/tests/refusal-errcode-partition.test.mjs`, three cells: `CLR44` is raised by exactly four bodies and carries exactly three reason tokens, read out of the bodies rather than from a list the file also writes. A fifth site or a fourth token fails by name. **PASS (3/3).** The rule for a future raise is written into `packages/db/README.md`'s `## 0335` section.

**Vacuity control.** With the 0307 and 0317 pre-images re-installed, `p1114.partition.census` and `p1114.partition.sites` were seen failing; with the prepayment core recut to raise `CLR44` on its roster refusal, `p1114.partition.renderable` was seen failing. All three subjects restored and re-measured (`87fc7e25…`, `28bc14e9…`, checksum `439962eb…`).

### AC3 — "Existing cells that assert on CLR10 for either reason are updated to the corrected, distinct code and continue to pass."

Four existing assertion sites, all four updated, all four passing:

| cell | file:line (pre-edit) | now |
|---|---|---|
| `p915.obo.authority` | `prepayment-schedule-obo.test.mjs:159` | `await callerContractCode()` |
| `p915.read.recorded_term` | `prepayment-schedule-obo.test.mjs:552` | `await callerContractCode()` |
| `p941.obo.authority` | `revenue-recognition.test.mjs:655` | `await callerContractCode()` |
| `p941.read.recorded_term` | `revenue-recognition.test.mjs:767` | `await callerContractCode()` |

`callerContractCode()` (`packages/db/tests/internal-refusal-errcode-fixtures.mjs`) resolves the expected code from the live ledger: `CLR44` once 0335 is applied; on a pre-0335 chain it returns `CLR10` **only** when the preintegration gate variable is set, and otherwise throws by name, so a focused run against a chain missing the migration fails loudly instead of quietly measuring the old code. That is the `schedule-term-correction` / `prepayment-wake-reroute` idiom, applied to a code rather than to a skip.

### AC4 — "The web surfaces … are unaffected other than picking up the corrected code."

They are unaffected, period, because the code they read did not move. Both surfaces key on `reason` and `axis`, never on the errcode (`apps/web/lib/prepayments/schedule.ts:27`, `apps/web/lib/deferred-revenue/schedule.ts:16` and `:38`), and the account-not-enrolled refusal still carries `CLR10` with its `remedy` and `panel` untouched — asserted by `p1114.partition.renderable` and by migration tail §E.4. No file under `apps/web` was edited. The web migration-pins corpus was run anyway (rule (d), below) and is green.

### Out of scope, respected

No reason, axis or detail payload was reshaped and no refusal reason was introduced. Tail §E.2 re-measures all four payloads and both author sentences byte for byte, so this is asserted rather than promised.

---

## The migration

**`packages/db/migrations/0335_internal_refusal_errcode.sql`** (601 lines), the one file, at the reserved number. No other migration was edited.

Four `create or replace function` statements, each VERBATIM from its live cut except the one SQLSTATE and the comment explaining it. Byte-faithfulness was proved before a line was changed: the extracted text of all four bodies hashed to the live `sha256(prosrc)` exactly.

### Prestate pins — measured on this rig now (`clara_l05`, 309 files, max 0318), never copied from an older header

Recut (each admits its pinned sha **or** a body already carrying `0335`, so a redo is admitted and real drift refuses by name):

| signature | pre-image sha256(prosrc) |
|---|---|
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a` |
| `clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)` | `2344bc09dddbe5f38a324ad3ac2ef22ceb28b5940b4521b4421ae8ac73cfbe5e` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6c7ed11e97a7001ee24eedf53d53d2b61cb0e2c9539ef040e22201b6a99e84c7` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `9701ddda2a73f4f635ca32e356403ad27dd2aed91a1c0fbfbd4992b84ebc1753` |

Neighbours pinned EXACTLY and deliberately not moved:

| signature | sha256(prosrc) |
|---|---|
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd` |

**Not pinned, by the plan's hard seam:** `clara._obo_plan_core`, `clara.create_accounting_plan`, `clara._prepayment_plan_core` and `clara._accrual_plan_core` — all four are L1's, and 0335 names none of them.

The prestate also asserts (§0.3) that `CLR44` is raised by nothing outside this file's four before it runs, and (§0.4) that both roster refusals live in the two cores rather than in a door — so recutting a door could not silently re-code a refusal the web renders.

### Post-image shas, measured after the final apply (for the integrator and for #1077)

| signature | post-image sha256(prosrc) |
|---|---|
| `clara.create_prepayment_schedule_for(…)` | `0bd2d0f08cfffe2b9d0d5582253c17a409519bfac3006b49b6ba93480d6e60b7` |
| `clara.create_revenue_recognition_schedule_for(…)` | `178c4181a03063d50df8a33ca864bbea336d6cadaa2f48b79e1d89e38f5d32e4` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `419cf793442e2cdacf770673bf7400ad5a3fede3623510be1c7c64fc2d9a3af5` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `76a519677500385219b134872aed919f10f716ef8e0b501aa2eca13a528e2e5b` |
| `clara._prepayment_schedule_core(…)` — unmoved | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara._revenue_recognition_core(…)` — unmoved | `28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd` |

File checksum on the ledger: `439962ebd877cc5376dbda790fdf75d0b4f2fbee63f431863331924ffd063f11`.

### Tail assertions (§E), read off the live catalog

1. Each moved raise carries `CLR44`, and its token is on no `CLR10` raise in that body.
2. The payloads and sentences are byte-identical (`{"reason":"invalid_author","field":"author","constraint":"present"}` and the two one-key scope payloads; both author sentences).
3. The partition is exact: over the whole `clara` schema, `CLR44` is raised by 4 bodies.
4. The renderable half did not move: both cores still raise their `*_source_unfit` token under `CLR10`, and neither has learned `CLR44`.
5. No overload minted (one catalog entry per name), `clara_runtime` still holds EXECUTE on all four, and `clara_authenticated`, `clara_agent_ro`, both wake roles and PUBLIC hold none.

### Redo, and both branches proved

Applied with `pnpm db:migrate`. Re-applied with the supported redo mode (**#957**, `CLARA_MIGRATION_REDO=0335_internal_refusal_errcode`, highest applied version, destructive guard set) **seven times** — four during the vertical-slice loop (prestate `4 FIRST, 0 REDO` → `3 FIRST, 1 REDO` → `2 FIRST, 2 REDO` → `1 FIRST, 3 REDO`) and three more restoring the vacuity controls. Every redo landed on the same checksum.

Per the wave-3 addendum ("a marker-tolerant pin hides its sha branch from a redo; prove the FIRST-APPLY branch yourself"): **all four pre-images were re-installed on the rig at once and the whole file was run against them**, and the prestate reported `4 FIRST, 0 REDO` with the tail passing and the same checksum. So the complete file's first-apply branch is exercised, not just slice 1's.

The prestate's **refusal** branch was proved too: with the prepayment core recut (drifted), `migrate` failed and rolled back with `0335 prestate: clara._prepayment_schedule_core(…) moved (expected 87fc7e25…, live 586e811f…)`. The core was restored and re-measured at `87fc7e25…`.

No data-dependent branch exists in this prestate or tail: every check is over `pg_proc` and the role catalog, so there is no "only runs when rows exist" arm to enter.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the db test files added or touched, **full gate chain** | `node --test --test-concurrency=1 $GATES tests/prepayment-schedule-obo.test.mjs tests/revenue-recognition.test.mjs tests/refusal-errcode-partition.test.mjs tests/ci-frontier-leg-contract.test.mjs` | **36 tests, 36 pass, 0 fail, 0 skipped** |
| operation census + rig isolation (no reset flags) | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| the two migration-walking / catalog-consumer guards | `… tests/chain-minted-roles-drift-guard.test.mjs` and `… tests/work-journal-admission.test.mjs tests/work-journal-post.test.mjs` | **7 pass** and **53 pass**, 0 fail |
| web migration-pins corpus (rule (d): a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 tests, 22 pass, 0 fail** |
| typecheck | `pnpm typecheck` | exit 0 (`apps/web` and `packages/runtime` both Done) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| db package lint | `pnpm --filter @clara/db lint` | exit 0 |
| gate chain integrity | `node scripts/print-gate-chain.mjs` → 126 gate modules; `ci-frontier-leg-contract.test.mjs` | 10 pass (inside the 36 above) |
| ledger | `pnpm --filter @clara/db migrate` a second time | 0 new applied, 310 total, no drift |

I did **not** run the whole `apps/web` unit suite or any browser walk: no file under `apps/web` was edited (`git diff --stat 7bc5a710f..HEAD` touches only `packages/db`). The web corpus test was run because rule (d) puts it in scope whenever a migration file changes.

No known Windows-only red was hit, and none was "fixed".

---

## Shared files, and what I did not need to touch

| shared file | what I did |
|---|---|
| `packages/db/package.json` (`$GATES`) | one minimal hunk: `--import ./tests/internal-refusal-errcode-preintegration-gate.mjs`, appended after `schedule-term-correction` (migration order). |
| `packages/db/README.md` | a new `## 0335` section only. No existing section edited. |
| `packages/db/tests/rig-meta.mjs` | **no change, and this is deliberate.** A cohort entry exists per migration that MINTS a new name; 0335 mints none — it is four `create or replace` statements over existing signatures. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **no change needed.** The corpus reads `MIGRATION_FILES` from disk dynamically; the `REVIEWED_DYNAMIC_SQL_BARRIERS` map only needs an entry for a migration whose dynamic SQL the lexer cannot inspect, and 0335 contains no `execute` and no `pg_get_functiondef` splice. The test was run and is green. |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/lib/navigation/tree.ts`, `apps/web/lib/firm/needs-you.ts`, `CONTEXT.md`, `.github/**` | untouched. |
| `packages/db/tests/rig-helpers.mjs`, `packages/db/tests/work-journal-fixtures.mjs` | one key each (`callerContract: "CLR44"`) with its meaning. Not on the plan's shared-file list, but flagged here because every db lane imports both. Purely additive — nothing in the repo enumerates `CLR`'s keys (grepped for `Object.keys(CLR)` / `Object.values(CLR)` / `deepEqual(CLR`: no hits). |

`CONTEXT.md` gained nothing on purpose: "caller-contract violation" is an engineering class of error, not shared accounting or product vocabulary, and `CONTEXT.md`'s own frame is the latter. It is written up in `packages/db/README.md` instead, where the estate keeps its errcode prose.

No frozen body and no frozen closure module was touched: `packages/runtime` is untouched entirely.

---

## Successor contract (for the `chatTurn_v22` / `claraWork_v6` cut)

Nothing in `packages/runtime` calls these four doors yet — the only mentions are prose (`packages/runtime/lib/prepayment-schedule-basis.ts:27`, `packages/runtime/workflows/chatTurn.v20.tools.ts:19`). The cut phase's `CUT-PLAN.md` §A8 and §A9 will wire them, and **two lines of its refusal mapping are now wrong**. They are not corrected in this branch because `CUT-PLAN.md` belongs to the cut phase's own branches and is not a module README; they are delivered here instead.

**`CUT-PLAN.md:210`, §A8 (`START_PREPAYMENT_SCHEDULE_WORK_TOOL`).** Replace

> `invalid_author` (CLR10, never shown).

with

> `invalid_author` (**CLR44**, never shown — the caller-contract class #1114 minted; `CLR10` now means only a refusal a surface may render).

**`CUT-PLAN.md:215`, §A8 (`read_prepayment_source`).** Replace

> Refusals CLR11 `prepayment_source_not_found` (also the answer for another firm's entry) and CLR10 `prepayment_read_scope_required` (never shown).

with the same two refusals, `prepayment_read_scope_required` now under **CLR44**.

**§A9 (`start_revenue_recognition_work` / `read_revenue_recognition_source`)** inherits both changes: `invalid_author` → CLR44, `revenue_recognition_read_scope_required` → CLR44.

Nothing else about either tool moves. Restated in full so the cut can be built from this section alone:

- **Chat tool** `START_PREPAYMENT_SCHEDULE_WORK_TOOL`, input `z.object({ source_entry_id, expense_account_code, expense_account_basis, purpose }).strict()`.
- **Door call**, argument order unchanged: `clara.create_prepayment_schedule_for(p_client, p_author, p_source_entry, p_expense_account, p_expense_basis, p_purpose, p_authority_ref, p_op_key)`, with `p_author = ctx.actorUserId` and `p_authority_ref = {kind:"chat_task", id: ctx.taskId}`. Op key `stableOpKey(ctx.taskId, TOOL, input)`.
- **Part kind** `prepayment_schedule_configured` via `prepaymentSchedulePart(answer)` — unchanged.
- **Refusal mapping**, the errcode column only:
  - `CLR44` `invalid_author` → **never rendered.** Log it as an internal fault and fail the turn; there is no sentence for a person and no remedy. The successor always has the actor, so reaching this is a wiring bug in the tool, not a state the conversation can be in. Because the code is now distinct, a handler may key on `CLR44` alone for this and need not read the detail payload.
  - `CLR44` `prepayment_read_scope_required` / `revenue_recognition_read_scope_required` → same treatment, on the Work read.
  - `CLR10` `prepayment_source_unfit` / axis `prepaid_account_not_enrolled` → **rendered**, unchanged: "That account is not on this client's prepayment account roster…", showing `detail.prepaid_account_code` and `detail.panel`, never offering to enrol it.
  - `CLR04` `authority_lost` / `insufficient_role`, `CLR11` `client_not_found` / `prepayment_source_not_found` → unchanged.
- **Prompt stanza:** no change. Nothing a person is ever shown changed wording.

**The general rule the cut (and anything else branching on a code) may now rely on:** `CLR44` is never rendered; `CLR10` may be.

---

## Follow-ups worth filing

1. **The estate keeps two errcode catalogs.** `packages/db/tests/rig-helpers.mjs` (`CLR01`–`CLR12` + `CLR44`) and `packages/db/tests/work-journal-fixtures.mjs` (a divergent subset that the whole prepayment/deferred-revenue fixture chain re-exports, shadowing the first). I kept both in step for `CLR44`, but the shadowing is a live trap — `CLR.stale` and `CLR.callerContract` resolve or not depending on which file a test imported from, silently. One catalog, re-exported, would close it. Small, test-only, no migration.
2. **Codes `CLR13`–`CLR43` have no written meanings anywhere.** `rig-helpers.mjs` stops at `CLR12` and the rest are inline literals whose meaning must be inferred from the raise. #1114's own premise ("the central catalog that assigns error codes their meanings … needs an entry, or a correction, so each code carries one meaning") applies to all 31 of them; this ticket only had standing to move the four it names. A catalog pass over the rest is a real, bounded follow-up.
3. **`invalid_op_key` on the two OBO twins is arguably also caller-contract.** The runtime always supplies `stableOpKey(...)`, so a null there is as much a program fault as a null author. I left it on `CLR10` because the same token is raised by human doors all over the estate for a person's own malformed call, and splitting one token across two codes is the defect this ticket exists to remove. If the estate later wants it moved, the token should be split first (`invalid_op_key` for humans, a distinct token for the machine lanes).

---

## Unverified

- **No World / runtime leg.** The four doors are `clara_runtime`-only and I drove them on a real least-privileged `clara_runtime` connection, but no chat turn or Work run was executed end to end against a bootstrapped World — the lane rig cannot bootstrap one without reddening `rig-isolation` T10b (#866), and no runtime code calls these doors yet anyway. The successor contract above is a contract, not a measured behaviour.
- **A from-scratch 0001→0335 chain** was not run here (the work order gives that to the integrator on a disposable cluster). What I did run is the complete file against all four true pre-images, prestate `4 FIRST, 0 REDO`, which is the same branch a from-scratch chain takes.
- **`CLR44` could collide with another lane in this wave.** No other lane's plan mentions minting an errcode, and nothing in the repo used `CLR44` at `7bc5a710f`, but the sweep plan assigns migration numbers and not error codes. If a sibling lane also mints one, the integrator should read 0335's prestate §0.3, which refuses at apply time rather than silently sharing the code — the exact failure this ticket is about.
- **Hosted has rows the rig does not**, but nothing in this change reads a row: every prestate and tail check is over `pg_proc` and the role catalog.
