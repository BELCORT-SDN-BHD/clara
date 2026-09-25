# riders sweep wave · lane 02 · ticket #1077 — one operation key spent on both schedule lanes collided on a nested reservation neither caller can name

**Status: done.**

- Branch `riders/wS-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base `7bc5a710f`.
- Database `clara_l05` on `127.0.0.1:55745`. Ledger before this ticket: **310 files, max `0335_internal_refusal_errcode`** (#1114, the lane's first ticket). After: **311 files, max `0336_revenue_recognition_plan_op_key`**; a second `pnpm --filter @clara/db migrate` reports `0 new migration(s) applied · 311 total` and no drift.
- Five commits, all on this branch, none pushed:

| commit | what |
|---|---|
| `cde5cf388` | slice 1 — the deferred-revenue **create** core derives `:rrplan` (0336 §A) |
| `4cf467a3d` | slice 2 — the deferred-revenue **correction** door derives `:rrend` and `:rrplan` (0336 §B), plus the README `## 0336` section |
| `f0a275f1f` | slice 3 — AC3: neither lane's ordinary idempotency moved, driven on both lanes, with its vacuity control |
| `186f6f055` | slice 4 — the namespace census, held against the live catalog, with its vacuity control |
| `19b474277` | polish — two in-body notes rewrapped/reindented; no behaviour, redone and re-proved |

**The ticket is still live on this branch.** `gh api repos/BELCORT-SDN-BHD/clara/issues/1077`: state `open`, labels `enhancement` + `ready-for-agent`, **0 comments** (so there is no 2026-09-20 owner ruling; the body's Agent Brief is the whole contract), last updated 2026-09-24. Nothing on `main` had done it: at `7bc5a710f`, `packages/db/migrations/0317_schedule_term_correction.sql` lines **1767** and **2250** both read `p_op_key => p_op_key || ':plan'`, and lines **789** and **1159** both read `p_op_key || ':end'`. The collision was then *measured* at the doors before a line was written — see the two reds below.

`gh issue view` returns empty output on this host (both from Git Bash and from PowerShell, exit 0, no stderr); `gh api` works and was used instead. Noted under "unverified" as a rig quirk, not a finding.

No message arrived mid-task.

---

## The seams I tested at (written before the first test, work order rule 4)

The brief's "Key interfaces" and the two acceptance criteria that name a driver, one per line — each a public door, never an internal collaborator:

1. `clara.create_prepayment_schedule(p_client, p_source_entry, p_expense_account, p_expense_basis, p_purpose, p_authority_ref, p_op_key)` — the prepayment lane's human door, driven as BOB, an ordinary bookkeeper.
2. `clara.create_revenue_recognition_schedule(…, p_op_key, p_pattern)` — "the deferred-revenue schedule creation path" the brief names, same actor.
3. `clara.replace_prepayment_schedule(p_client, p_schedule, p_reason, p_authority_ref, p_op_key)` and `clara.replace_revenue_recognition_schedule(…)` — the two correction doors, which take the SAME kind of derived reservation and meet one step earlier (see "scope" below).
4. `clara.op_receipts` read as a **row**, through the battery's existing `opReceiptsFor(firm, opKey)` reader — the instrument for "which reservations did the doors actually take", and the reason no cell has to pin a body another lane writes.
5. `pg_proc.prosrc` over the whole `clara` schema — the catalog census that holds the partition afterwards, which is the house standard for a change of this shape (work order rule 4's "where this repo's own documented standard asks for a structural cell").

**I did not test at `clara._reserve_op`.** The brief lists it as a key interface for the *alternative* remedy it offers; the scan (`SWEEP-PLAN.md:141-147`) rules that recut out of this ticket, and the arm I built removes the collision instead of typing it. No web surface was driven either: nothing under `apps/web` was edited and no browser path reaches a nested reservation.

---

## What the defect actually is, measured

`clara._reserve_op` ([`0004_governed_fns.sql:47`](../../../../packages/db/migrations/0004_governed_fns.sql)) keys an operation receipt on `(firm_id, fn, op_key)`. A door that nests another door hands it a **derived** key, and both schedule lanes derived the same one:

| body | derived key, at `7bc5a710f` | reserved under fn |
|---|---|---|
| `clara._prepayment_schedule_core` (human arm) | `<key>:plan` | `create_accounting_plan` |
| `clara._revenue_recognition_core` (human arm) | `<key>:plan` | `create_accounting_plan` |
| `clara.replace_prepayment_schedule` | `<key>:end`, then `<key>:plan` | `end_accounting_plan`, `create_accounting_plan` |
| `clara.replace_revenue_recognition_schedule` | `<key>:end`, then `<key>:plan` | `end_accounting_plan`, `create_accounting_plan` |

The **outer** reservations never collided: each door reserves under its own `fn`. The derived ones did, and the second lane was answered `op_key reused with different args` — CLR10 **with no detail at all**, which is exactly the ticket's complaint.

The **on-behalf-of arms were never affected** and are untouched: both cores' machine lanes call `clara._prepayment_plan_core` / `clara._obo_plan_core` with no operation key at all, for the reason 0317 states at lines 1752-1756 and 2252-2259 (`clara.create_accounting_plan` resolves its actor from a JWT a runtime connection does not carry). So there was never a nested reservation on the machine lane to collide with.

### The fix, and why this arm

    prepayment lane      <key>:plan      <key>:end        unchanged
    deferred-revenue     <key>:rrplan    <key>:rrend      0336

The ticket offers two remedies. I took the first (qualify the key per lane), for three reasons, in order of weight:

1. `clara._reserve_op` is 0004's reserve-before-effect primitive and **every** governed door in the estate rides it. Its reuse raise is the shared answer for a genuine retry-with-different-arguments on any of them, so typing it would change what dozens of unrelated doors answer for a mistake that has nothing to do with these two lanes. `SWEEP-PLAN.md:146-147` says the same: "far larger blast radius and is NOT this ticket's job".
2. A typed reason only makes the collision legible. Qualifying the key **removes** it.
3. The ticket names this arm first and names the literal: "for example `:rrplan` for the deferred-revenue lane, keeping `:plan` for prepayment". The deferred-revenue lane moves, so no schedule already configured on the prepayment lane changes the key it reserved.

### Scope: why the correction door is in and why that is not a widening

AC1 asks that "**the two lanes' nested plan reservations** no longer share a key namespace" — plural, over two lanes, not "the create path's". The two correction doors take a derived reservation on `clara.end_accounting_plan` **before** they reach the plan door, so leaving `:end` shared would make AC1 false at the very first reservation either correction takes. It is the same defect, the same two lanes, the same two bodies of the deferred-revenue lane, and one extra token. `p1077.cross_lane.replace` was red at exactly that point before 0336 §B.

Conversely I did **not** widen to the three other bodies in the estate that also derive `:plan` (`clara.create_accrual_adjustment` and `clara.confirm_tenancy_rent_plan` under `create_accounting_plan`, `clara.correct_accrual_adjustment` under `revise_accounting_plan` — measured off the live catalog). #1077 names the prepayment and deferred-revenue pair and only that pair, and the accrual family is L1's this wave. It is written up as follow-up 1 and named in the README section, so it is visible rather than silently swept.

---

## Acceptance criteria, each with its evidence

### AC1 — "Either the two lanes' nested plan reservations no longer share a key namespace, or a collision between them is reported with a typed, distinguishable reason."

**The first arm, at all four doors.** After 0336, `clara._revenue_recognition_core` and `clara.replace_revenue_recognition_schedule` derive `:rrplan` / `:rrend`; the two prepayment siblings still derive `:plan` / `:end`; the two sets are disjoint.

- Migration tail §C.1 and §C.2 assert both halves at apply time (gaining the new suffix **and** losing the old one, which is the pair that matters — gaining without losing would leave the collision exactly where it was).
- `p1077.namespace.census` (`packages/db/tests/revenue-recognition-plan-op-key.test.mjs`) asserts it over the whole `clara` schema, read off `pg_proc.prosrc` rather than any migration's text, so it measures the bodies as a later file leaves them. **PASS.**
- Behaviourally, at the doors: the two cells below.

### AC2 — "A test drives a reused operation key across the prepayment and deferred-revenue lanes and asserts the refusal is now identifiable (either it no longer collides, or its `detail.reason` names the collision)."

It no longer collides, and both pairs of doors were driven for it.

- **`p1077.cross_lane.create`** — one scene, one client, one firm. A prepayment schedule is configured over the prepaid entry under key `K`, then a deferred-revenue schedule over the advance receipt under the **same** `K`. Both are admitted, the two plans differ (so nothing was replayed from the other lane's receipt), the two outer receipts stand under `create_prepayment_schedule` and `create_revenue_recognition_schedule`, and the nested ones stand as `K:plan` and `K:rrplan`, one row each, both under `create_accounting_plan`. **PASS.**
  **Red first, for the right reason:** before 0336 §A the second call raised `error: 'op_key reused with different args' / code: 'CLR10'` from inside `createRecognitionSchedule`.
- **`p1077.cross_lane.replace`** — the same scene; both schedules configured under their own keys, both terms then corrected through their own carrier's door (the prepayment schedule rode a **document service period**, re-recorded shorter; the deferred one a person's **stated term**, re-stated shorter), and both corrections driven under one shared key. Both replacements are admitted and the four nested receipts stand as `K:end`, `K:plan`, `K:rrend`, `K:rrplan`. **PASS.**
  **Red first:** before 0336 §B, `replaceRecognitionSchedule` raised `'op_key reused with different args' / CLR10` — at the `:end` reservation, one step before the plan door.

`opReceiptsFor` is the battery's own existing reader, and its docstring already said what this ticket needed: "so a cell can see that BOTH lanes reserved in ONE namespace rather than in two that happen to look alike" (`prepayment-schedule-obo-fixtures.mjs:238-239`).

### AC3 — "No change to either lane's normal (non-colliding) idempotency behavior."

`p1077.same_lane.idempotent`, driven on **both** lanes. **PASS.**

- Same door, same key, same arguments → the second call returns the first answer **deep-equal**, and no second schedule row exists (`scheduleRowsFor(client).length === 1`; `recognitionScheduleCountFor(receipt) === 1`).
- Same door, same key, **different** arguments (the purpose changed, which is inside both doors' request hashes — `0317:1339-1343` and `0317:1919-1924`) → still refused, CLR10, by the same outer reuse wall. That raise is deliberately left untyped: it is one door answering its own caller's genuine mistake, not two lanes meeting on a reservation neither of them named, and #1077 puts it out of scope.
- The nested reservation was taken **once** for two identical calls, under `K:rrplan`, with **zero** rows under `K:plan` — which is the mechanism: the outer reservation short-circuits the whole body, so a true retry never reaches the nested call.

**Vacuity control.** With `clara._revenue_recognition_core`'s **outer** reservation key made unique per call (`p_op_key || ':vacuity'`), the cell fails: `error: 'this recognition-schedule key is held by an in-flight sibling'`. The subject was restored with `CLARA_MIGRATION_REDO=0336_revenue_recognition_plan_op_key`, back to the same file checksum.

### Out of scope, respected

"Any change to the plan-authority validation each lane already performs" — none. The three changed hunks are the key literals and their comments, and nothing else; the two diffs against 0317's own bodies are printed below.

---

## The migration

**`packages/db/migrations/0336_revenue_recognition_plan_op_key.sql`** (1168 lines), the one file, at the reserved number. No other migration was edited. Ledger checksum: **`8d736406815833fbcdb35e92dea18a0e6bd8723fa75aaf730815836fc7f6c944`**.

Two `create or replace function` statements, each VERBATIM from its live 0317 cut. Byte-fidelity was established before a line changed — the text extracted from 0317 hashed to the live `sha256(prosrc)` exactly for all four bodies in the family — and the whole diff is three hunks:

```
clara._revenue_recognition_core            @@ -381,7 +381,17 @@   :plan → :rrplan  + 10 comment lines
clara.replace_revenue_recognition_schedule @@ -263,7 +263,14 @@   :end  → :rrend   +  7 comment lines
                                           @@ -271,7 +278,8 @@    :plan → :rrplan  +  1 comment line
```

### Prestate pins — measured on this rig now (`clara_l05`, 310 files, max 0335), never copied from an older header

Recut (each admits its pinned sha **or** a body already carrying `0336`, so a redo is admitted and real drift refuses by name):

| signature | pre-image sha256(prosrc) |
|---|---|
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd` |
| `clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)` | `c69273a9b4dadb7274358adcf7c54de4f17c513efd50a394396fe89982c6453e` |

Neighbours pinned EXACTLY and deliberately not moved (the whole change is an asymmetry, so a prepayment body drifting under this file could re-introduce the collision with no line here changing):

| signature | sha256(prosrc) |
|---|---|
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)` | `ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699` |

**Not pinned, by the plan's hard seam and by choice:** `clara._obo_plan_core`, `clara.create_accounting_plan`, `clara._prepayment_plan_core`, `clara._accrual_plan_core` (all L1's), and also `clara._reserve_op` and `clara.end_accounting_plan`. 0336 names none of them in a pin. That the two nested reservations really land under `create_accounting_plan` and `end_accounting_plan` is proved by **driving the doors and reading `clara.op_receipts`**, not by probing a body another lane writes. The two cores the previous ticket pinned (#1114's report) are the same two shas I measured, confirming 0335 moved neither.

The prestate also asserts, redo-tolerantly:
- §0.3 — the four schedule bodies share `:plan` before the file runs (count 4, or 2 after), and the two correction doors share `:end` (count 2, or 1 after). Anything else means the defect moved and the file is patching a body that no longer carries it.
- §0.4 — `:rrplan` and `:rrend` are derived by nothing in `clara` outside this file's two bodies, so the collision cannot simply move somewhere new.

### Post-image shas, measured after the final apply (for the integrator and for #1079/#1078/#1050)

| signature | post-image sha256(prosrc) |
|---|---|
| `clara._revenue_recognition_core(…)` | `28de4d5958a7cbc6b9220e82962d1e08f62f5dd39c702b3fce941c8c876358fd` |
| `clara.replace_revenue_recognition_schedule(…)` | `5d90e69c13644f147b218ab71f0ef5a09713c94fcb3e5d91d1d2d7f864ec6c53` |
| `clara._prepayment_schedule_core(…)` — unmoved | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara.replace_prepayment_schedule(…)` — unmoved | `ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699` |

The migration file's own text hashes to both post-images exactly, so the file is the source of truth for what is live.

### Tail assertions (§C), read off the live catalog

1. Each recut body derives `:rrplan` and derives neither `:plan` nor `:end`; the correction door derives `:rrend`.
2. Both prepayment siblings still derive `:plan`, the prepayment correction door still derives `:end`, and neither has learned this file's keys.
3. `:rrplan`/`:rrend` are derived by this file's two bodies and by nothing else in `clara`; and **no** `clara` body derives from both namespaces.
4. No overload minted (one catalog entry per name); the core is still ungranted to every application role, and the correction door is still `clara_authenticated`'s alone with no runtime, agent, wake or PUBLIC execute — #941 AC3's decision, re-measured rather than trusted.

### Redo, and both branches proved

Applied with `pnpm db:migrate` (§A alone, prestate `1 FIRST, 0 REDO`), then re-applied with the supported redo mode (**#957**, `CLARA_MIGRATION_REDO=0336_revenue_recognition_plan_op_key`, highest applied version, destructive guard set) **five times** across the slice loop, the two vacuity controls and the polish commit.

Per the wave-3 addendum ("a marker-tolerant pin hides its sha branch from a redo; prove the FIRST-APPLY branch yourself"): **both pre-images were re-installed on the rig by running 0317's own two statements, and the complete file was run against them — twice**, once for the §A+§B file and again for the final polished bytes. Both times the prestate reported `2 FIRST, 0 REDO` with the tail passing and the same checksum the ledger now holds.

The prestate's **refusal** branch was proved too: with `clara._prepayment_schedule_core` deliberately drifted, `migrate` failed and rolled back with
`0336 prestate: clara._prepayment_schedule_core(…) moved (expected 87fc7e25…, live 3e7450de…)`.
The body was restored from 0317's own statement and re-measured at `87fc7e25…`.

**No data-dependent branch exists** in this prestate or tail: every check is over `pg_proc` and the role catalog, so there is no "only runs when rows exist" arm to enter. The *doors*, by contrast, were driven against real rows the scene created through the estate's own doors.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the db test file added, plus every battery covering a recut body, **full gate chain** | `node --test --test-concurrency=1 $GATES tests/revenue-recognition-plan-op-key.test.mjs tests/revenue-recognition.test.mjs tests/prepayment-schedule.test.mjs tests/prepayment-stated-term.test.mjs tests/prepayment-schedule-obo.test.mjs tests/prepayment-wake-reroute.test.mjs tests/prepayment-term-liveness.test.mjs tests/prepayment-account-roster.test.mjs tests/prepayment-occurrences.test.mjs tests/refusal-errcode-partition.test.mjs tests/ci-frontier-leg-contract.test.mjs` | **98 tests, 98 pass, 0 fail, 0 skipped** |
| operation census + rig isolation (no reset flags) | `… $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the skip is `T19 poison-role`, which refuses without `CLARA_RIG_ALLOW_RESET=1` (a flag the rig forbids) |
| web migration-pins corpus (sweep rule (d): a migration file changed) | from `apps/web`: `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 tests, 22 pass, 0 fail** |
| typecheck | `pnpm typecheck` | exit 0 (`apps/web` and `packages/runtime` both Done) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| db package lint | `pnpm --filter @clara/db lint` | exit 0 |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files verified, no manifest diff |
| gate chain | `node packages/db/scripts/print-gate-chain.mjs` | **127** gate modules (126 + mine), and `ci-frontier-leg-contract.test.mjs` green inside the 98 above |
| ledger | `pnpm --filter @clara/db migrate` a second time | `0 new migration(s) applied · 311 total`, no drift |

I did **not** run the whole `apps/web` unit suite or any browser walk: `git diff --name-only cde5cf388^..HEAD` touches only `packages/db` (six files). The web pins corpus was run anyway because sweep rule (d) puts it in scope whenever a migration file changes.

No known Windows-only red was hit, and none was "fixed".

---

## Files, and the shared-file discipline

| file | what I did |
|---|---|
| `packages/db/migrations/0336_revenue_recognition_plan_op_key.sql` | new, 1168 lines |
| `packages/db/tests/revenue-recognition-plan-op-key.test.mjs` | new, 4 cells |
| `packages/db/tests/revenue-recognition-plan-op-key-fixtures.mjs` | new — the frontier resolver (stem `revenue_recognition_plan_op_key$`), the two namespaces as data, and `bodiesDeriving(suffix)` reading `pg_proc` |
| `packages/db/tests/revenue-recognition-plan-op-key-preintegration-gate.mjs` | new — the gate module with a stable stem, on 0335's own idiom |
| `packages/db/package.json` (`$GATES`) | **one minimal hunk**: `--import ./tests/revenue-recognition-plan-op-key-preintegration-gate.mjs`, appended after `internal-refusal-errcode` (migration order) |
| `packages/db/README.md` | a new `## 0336` section only. No existing section edited |
| `packages/db/tests/rig-meta.mjs` | **no change, deliberately.** A cohort entry exists per migration that MINTS a new name; 0336 mints none — two `create or replace` statements over existing signatures. Same call #1114 made for 0335 |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **no change needed.** The corpus reads `MIGRATION_FILES` from disk dynamically, and `REVIEWED_DYNAMIC_SQL_BARRIERS` needs an entry only for a migration whose dynamic SQL the lexer cannot inspect. 0336 contains no `execute`, no `format(` and no `pg_get_functiondef` (grepped). The test was run and is green |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/lib/navigation/tree.ts`, `apps/web/lib/firm/needs-you.ts`, `apps/web/e2e/**`, `.github/**`, `packages/runtime/**` | untouched |
| `CONTEXT.md` | **nothing, on purpose.** "A derived nested reservation key" is an engineering mechanism, not shared accounting or product vocabulary, and CONTEXT.md's own frame is the latter. It is written up in `packages/db/README.md`, where the estate keeps this kind of prose |

No frozen body and no frozen closure module was touched; `packages/runtime` is untouched entirely.

**Note for the integrator on the lane's ordering.** #1114's report predicted that its choice would leave the two cores "exactly as 0317 wrote them, with no post-image to re-derive against", and that held: the two pre-image shas I pinned (`28bc14e9…`, `87fc7e25…`) are the ones its report published. The next ticket in this lane, **#1079**, is web copy only and pins no body. **#1078** (0337) and **#1050** (0338) do recut database bodies and should pin `clara._revenue_recognition_core` at `28de4d59…` and `clara.replace_revenue_recognition_schedule` at `5d90e69c…` if they rely on either, not at 0317's shas.

---

## Successor contract (for the `chatTurn_v22` / `claraWork_v6` cut)

Nothing in `packages/runtime` calls these doors yet (the only mentions are prose, `packages/runtime/lib/prepayment-schedule-basis.ts:27` and `packages/runtime/workflows/chatTurn.v20.tools.ts:19`). This ticket adds **no** new tool, no new zod input, no new part kind, no new refusal and no prompt stanza. What it changes is a guarantee the cut may now rely on, and it is worth stating because the cut's §A8/§A9 wire exactly these two lanes:

**The guarantee.** A successor may derive the operation keys for `start_prepayment_schedule_work` and `start_revenue_recognition_work` **from one seed** — `stableOpKey(ctx.taskId, TOOL, input)` per tool, or even one key for both — without the second call colliding on a reservation it cannot name. Before 0336 the second of the two would answer CLR10 `op_key reused with different args` with no `detail` at all, which a refusal map keyed on `detail.reason` would have fallen through to a generic "bad request" for a fault the person did nothing to cause.

- **Door call, argument order unchanged.** `clara.create_prepayment_schedule_for(p_client, p_author, p_source_entry, p_expense_account, p_expense_basis, p_purpose, p_authority_ref, p_op_key)` and `clara.create_revenue_recognition_schedule_for(p_client, p_author, p_source_entry, p_revenue_account, p_revenue_basis, p_purpose, p_authority_ref, p_op_key, p_pattern)`.
- **The OBO entrances are unaffected by 0336 in any case**: their lane takes no nested reservation at all (`clara._prepayment_plan_core` / `clara._obo_plan_core` are called with no operation key). The guarantee above matters for the **human** doors and for anything that later drives them, and for the correction doors `clara.replace_prepayment_schedule` / `clara.replace_revenue_recognition_schedule`, which are `clara_authenticated`-only today and have no OBO twin (#1081 ruled that asymmetry stays).
- **Refusal mapping: no change.** `CLR10` `op_key reused with different args` (no detail) remains the answer for one door's own caller reusing a key with different arguments, and a handler should treat it as "this is a different request under a key you already spent", never as a cross-lane event. #1114's `CLR44` mapping is unaffected.
- **Nothing a person is shown changed wording**, so the prompt stanzas are untouched.

---

## Follow-ups worth filing

1. **The `:plan` namespace is still shared by three more bodies, outside this ticket's two lanes.** Measured off the live catalog after 0336: `clara.create_accrual_adjustment` and `clara.confirm_tenancy_rent_plan` derive `<key>:plan` under `create_accounting_plan`, alongside the two prepayment bodies; `clara.correct_accrual_adjustment` derives it under `revise_accounting_plan`. The identical defect — one operation key spent on a tenancy rent plan and a prepayment schedule collides and answers the same untyped CLR10. It is a bounded ticket (one migration, per-lane suffixes) but it belongs to the accrual and tenancy families, which L1 is recutting this wave, so it should be **filed, not swept**.
2. **`clara._reserve_op`'s reuse raise still carries no `detail`.** #1077's second arm, deliberately not taken here. Every governed door in the estate rides that primitive, so a typed reason (`{"reason":"op_key_reused","fn":…}`) would make hundreds of refusals classifiable at once — and would be a large, careful diff with its own census. Worth its own ticket rather than a rider.
3. **A data residue, not a code one.** Receipts already written under `<key>:plan` by the deferred-revenue lane stay as they are (0336 backfills nothing, on purpose: they record acts that happened and the outer receipt is what a retry replays from). The consequence is that a NEW prepayment schedule using an operation key an OLD deferred-revenue schedule already spent still meets that old row. It is the pre-0336 collision surviving in data, it shrinks to nothing as keys are spent once, and on hosted the population is small. Recorded in the README section; a cleanup would be more dangerous than the residue.
4. **`gh issue view` returns nothing on this host** (exit 0, empty stdout and stderr, from Git Bash and PowerShell alike, with `--repo` and without; `gh auth status` is healthy and `gh api` works). Every lane worker is told to run `gh issue view <n> --comments` as its first act, so this is worth a line in `RIG.md` — lane 06 owns that file this wave (#1124).

---

## Unverified

- **No World / runtime leg.** No chat turn or Work run was executed end to end against a bootstrapped World: the lane rig cannot bootstrap one without reddening `rig-isolation` T10b (#866), and no runtime code calls these doors yet. The successor contract above is a contract, not a measured behaviour.
- **A from-scratch `0001 → 0336` chain** was not run here (the work order gives that to the integrator on a disposable cluster). What I did run is the complete file against both true 0317 pre-images, prestate `2 FIRST, 0 REDO` — the same branch a from-scratch chain takes — twice, including once on the exact bytes committed.
- **Hosted has rows the rig does not**, but nothing in this change reads a row: every prestate and tail check is over `pg_proc` and the role catalog. The only hosted-data consequence is follow-up 3, which is stated rather than measured — I did not count how many `<key>:plan` receipts the deferred-revenue lane has written on hosted.
- **The census cell is deliberately not exhaustive over `:plan`.** It asserts membership for the two prepayment bodies and non-membership for the two deferred ones, not the full list of `:plan` derivers, because L1 is recutting the accrual family this wave and an exact list would be a tripwire for work that has nothing to do with #1077. The full list as it stands today is in follow-up 1.
- **`:rrplan` / `:rrend` could in principle be claimed by another lane of this wave.** Nothing in the repository used either string at `7bc5a710f` and 0336's prestate §0.4 refuses at apply time rather than silently sharing a suffix, but the sweep plan assigns migration numbers, not key suffixes. No other lane's plan section mentions a derived reservation key.
