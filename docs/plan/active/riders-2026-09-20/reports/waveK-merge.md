# Riders closing wave K, the integration merge

**COMPLETE. Head: `18eb2dc4d`**, all FOUR lanes merged in plan order: L1, L2, L3, LC. **No migration
refused and no body was recut**, the first merge in this programme where that is true; the only
integration edits are four shared-file appends. The final gates are §5, the successor contracts §6,
and what this merge does not cover is §7.

**Branch** `integration/riders-closing` in `C:\Users\zhant\Desktop\clara-wt\710`, cut from
`origin/main` `40c5ca671` (the sweep release's docs plus the factory-reset runbook). The code base is
identical to `ffb629d73`, which is what every lane diffed against: `git diff --name-only ffb629d73
40c5ca671` returns **twelve files, all under `docs/plan/active/factory-reset-2026-09-26/`**, so
`ffb629d73` is a sound base for every diff in this report.

**Integration database** `clara_intK` on `127.0.0.1:55742`, created from the pristine 337-file
template `clara_intS6` (`createdb -T clara_intS6`), read at **337 files, head
`0361_reservation_release_advice`** immediately after creation, the same ledger as the template.
`clara_l02`, `clara_intS6` and the four lane databases `clara_c01` .. `clara_c04` are never written
to. Playwright triple `https://127.0.0.1:3640 / 3641 / 3642`.

**The lanes and the order**, all four READY before the first merge (every recheck verdict `accept`,
zero findings above minor):

| order | lane | branch | head | migrations |
|---|---|---|---|---|
| 1 | L1 | `riders/wK-lane01` | `87ab0de1c` | `0362`, `0363` |
| 2 | L2 | `riders/wK-lane02` | `0a6deba7a` | `0364` |
| 3 | L3 | `riders/wK-lane03` | `2437dca83` | `0365` |
| 4 | LC | `riders/wK-lane04` | `079ff1cba` | none (the version cut) |

The integrated chain is `0362 0363 0364 0365`, applied in file order, for **341 files**.

Nothing is pushed, no pull request is opened, no GitHub object is written, no lane worktree and no
file in the main checkout but this report is touched. This report is written as the merge runs and is
extended, never replaced.

---

## 0 · The static cross-lane sweep, before the first merge

Wave S's §0 found one body written by two lanes and eight later files pinning a body an earlier lane
rewrote. The same two scans were run here before anything merged, on the lane branches rather than on
the reports. The scanners are `scratchpad/wk-cross.mjs` (migrations: bodies CREATED or REPLACED,
crossed against every 64-hex literal with a body name in its window) and `scratchpad/wk-cross2.mjs`
(every changed `.mjs`, `.ts`, `.tsx` and `.sql` file in every lane, crossed against the other lanes'
written bodies, flagging any mention within 800 characters of a 64-hex literal).

**No body in this wave is written by two lanes.** The four migrations partition cleanly:

| file | lane | bodies it CREATES or REPLACES |
|---|---|---|
| `0362` | L1 | `clara.wake_get_firm_standing_instruction`, `clara.withdraw_firm_standing_instruction` |
| `0363` | L1 | `clara.get_payroll_posting_state` |
| `0364` | L2 | `clara.create_accrual_adjustment`, `clara.correct_accrual_adjustment`, `clara._confirm_tenancy_rent_plan_core`, `clara._confirm_tenancy_rent_plan_revision_core`, `clara._obo_plan_core`, `clara._tenancy_plan_core` |
| `0365` | L3 | `clara.list_accrual_adjustments` (dropped and recreated, the return type widens) |

**No later file pins or names a body an earlier lane writes.** The cross section of `wk-cross.mjs` is
empty. The 23 sha pins in the wave were checked one by one: `0363`'s four pin
`clara._payroll_posting_verdict`, `clara._human_ctx` and `clara.role_rank`; `0364`'s fourteen pin the
plan, reservation and accrual-correction families it recuts; `0365`'s four pin `clara._human_ctx`,
`clara.role_rank`, `clara._accrual_sides` and its own `clara.list_accrual_adjustments` pre-image.
Not one of those bodies is written by another lane in this wave, so **the prediction is that all four
files apply on the integrated chain with no refusal and no recut**. That prediction is checked
against the chain's own verdict below rather than assumed.

**Nine name-level crossings, none of them a pin.** `wk-cross2.mjs` finds nine files naming another
lane's body, every one with zero 64-hex literals anywhere in the file, so none is a prestate pin:

| file | lane | names | owner |
|---|---|---|---|
| `packages/db/tests/prepayment-close-standing-instruction.test.mjs` | L1 | `clara._obo_plan_core` | L2 |
| `packages/db/tests/rig-meta.mjs` | L1 and L3 | `clara.create_accrual_adjustment`, `clara._obo_plan_core`, `clara.list_accrual_adjustments` | L2, L3 |
| `apps/web/components/plans/plan-revise-form.tsx`, `apps/web/lib/accruals/api.ts`, `apps/web/e2e/accrual-mock.mjs` | L3 | `clara.create_accrual_adjustment`, `clara.correct_accrual_adjustment` | L2 |
| `packages/db/tests/accrual-adjustments.test.mjs`, `accrual-adjustments-fixtures.mjs` | L3 | `clara.create_accrual_adjustment` | L2 |
| `packages/runtime/workflows/chatTurn.v23.tenancy.ts` | LC | `clara._tenancy_plan_core` | L2 |

The last one is a comment (`chatTurn.v23.tenancy.ts:434`). The rest are call sites and cohort names.
**`0364` changes no signature** of the two accrual doors it recuts (`create_accrual_adjustment(p_client
uuid, …, p_op_key text)` and `correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key
text)` are the estate's existing argument lists), so no caller breaks structurally. What `0364` does
move is the `:plan` key derivation those doors use, which is a BEHAVIOUR crossing with L3's accrual
batteries, not a compile-time one. It is carried to the whole-`packages/db`-suite run at the end,
which is where it would show.

### The frozen law, checked once per lane before any merge

Every entry carrying a `sha256` in the base `frozen-workflows.json` was collected: **350** (347
workflow entries plus 3 recorded retirements), every key repository-relative under `packages/`. That
set was intersected with each lane's own `git diff --name-only ffb629d73...riders/wK-laneNN`:

| lane | files changed | hits in the locked set |
|---|---|---|
| L1 | 21 | **none** |
| L2 | 15 | **none** |
| L3 | 25 | **none** |
| LC | 32 | **none** (LC's 15 entries are NEW keys, which the append-only check allows) |

**Only LC touches `packages/runtime/workflows`, `registry.ts`, `startWorld.ts` or
`frozen-workflows.json`**, checked rather than assumed: L1 and L2 have an empty `packages/runtime`
diff entirely; L3's `packages/runtime` diff is five files, all of them `packages/runtime/tests/*`
(`queue-drain.mjs`, `queue-drain.test.mjs`, `rollback-preflight.test.mjs`, `intake-admission-e2e.mjs`,
`intake-batch-e2e.mjs`) plus `packages/runtime/README.md`, and none of those is a workflow body, the
registry, `startWorld.ts` or the manifest. Rule (a) holds for all four lanes.

`node scripts/check-frozen-workflows.mjs` on the base: recorded with the L1 gates below, as the
baseline every later run is compared against.

### The shared files, and which lanes actually collide

Six files are edited by more than one lane. Nothing else in the wave is touched twice:

| file | lanes | expected resolution |
|---|---|---|
| `packages/db/README.md` | L1, L2, L3 | ordered splice, each lane's own `## NNNN` sections only |
| `packages/db/package.json` (`$GATES`) | L1, L2, L3 | union, migration order `… 0362 0363 0364 0365` |
| `packages/db/tests/rig-meta.mjs` | L1, L3 | union of cohorts (L2 adds none) |
| `apps/web/messages/en.json` | L1, L3 | both sides kept at their sorted positions, never re-serialized |
| `apps/web/test/manifest.txt` | L1, L3 | sorted union |
| `packages/runtime/README.md` | L3, LC | union of sections; the CLOSING-PLAN's table does not name this file, and it is the one shared file the plan did not predict |

---

## 1 · Lane L1, `riders/wK-lane01` → `ba085747f`

#1147 #1148. Migrations **0362 0363**. Readiness: `waveK-lane01-recheck.json` verdict **accept**,
zero findings, at branch head `87ab0de1c`, which is the head merged.

**No conflicts.** L1 is the first lane on a branch that carried only `origin/main`, so all 21 files
applied clean.

**Both migrations applied on the integrated chain with no refusal and no recut**, which is what §0
predicted:

```
[notice] 0362 prestate OK -- read door FIRST, withdraw door FIRST
[notice] 0362 tail OK -- the model lane can ask what a firm has instructed, a withdrawal says how
        many plans keep posting, and neither gave anybody a way to act
[notice] 0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its measured
        pre-image and ungranted
[notice] 0363 tail OK -- a document page can ask why a payslip did not post, the internal is still
        nobody's to call, and nothing above the door may reword what it says
migrate: 2 new migration(s) applied · 339 total · target 127.0.0.1:55742/clara_intK
```

| gate, on `clara_intK` at 339 files | result |
|---|---|
| the three touched db files (`standing-instruction-agent-read`, `payroll-posting-state-read`, `prepayment-close-standing-instruction`), full 154-gate chain | **35 tests, 35 pass, 0 fail, 0 skipped**, the lane's own count exactly |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** (T19's destructive-reset gate, which this rig never opens) |
| `pnpm typecheck` | **exit 0**, `apps/web` and `packages/runtime` both Done |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 frozen / 60 "use workflow" / 3 retired**, identical to the base. This is the baseline every later run is compared against |
| the frozen law, independently | 33 files changed against `ffb629d73`, **not one a key in the base manifest** |

---

## 2 · Lane L2, `riders/wK-lane02` → `170e02074`

#1150 #1149. Migration **0364**. Readiness: `waveK-lane02-recheck.json` verdict **accept**, zero
findings, at branch head `0a6deba7a`.

**Two conflicts, both of them shared-file appends, neither a body question.**

| file | resolution |
|---|---|
| `packages/db/package.json` (`$GATES`) | Union. HEAD carried L1's two gates, L2 carried its own; the merged list is **155 gates, none twice**, tail in migration order `… reservation-release-advice (0361), standing-instruction-agent-read (0362), payroll-posting-state-read (0363), plan-reservation-namespace (0364)`. Verified by parsing the merged file and counting unique entries, not by reading the hunk. |
| `packages/db/README.md` | Ordered splice. Both sides append after `0361`'s section and neither edits a line the other wrote, so the resolution is L1's `## 0362` and `## 0363` sections followed by L2's `## 0364`. Section order after the splice: `0360 0361 0362 0363 0364`. |

**`0364` applied with no refusal and no recut**, all six prestates reading FIRST:

```
[notice] 0364 prestate OK -- 6 FIRST, 0 REDO -- clara.create_accrual_adjustment=FIRST
        clara.correct_accrual_adjustment=FIRST clara._confirm_tenancy_rent_plan_core=FIRST
        clara._confirm_tenancy_rent_plan_revision_core=FIRST clara._obo_plan_core=FIRST
        clara._tenancy_plan_core=FIRST
[notice] 0364 tail OK -- the accrual and tenancy lanes hold namespaces of their own, the prepayment
        lane keeps :plan, both tenancy cores close their lane set, and the third on-behalf-of plan
        step is a caller
migrate: 1 new migration(s) applied · 340 total
```

| gate, on `clara_intK` at 340 files | result |
|---|---|
| L2's seven touched db files, full 155-gate chain | **64 tests, 64 pass, 0 fail, 0 skipped**, the lane's own count exactly |
| **L1's three db files, RE-RUN on top of `0364`** | **35 tests, 35 pass, 0 fail**, unchanged, so `0364` moves nothing L1 asserts |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |

**The `sst_rate_schedule` failure L2's recheck reported does NOT reproduce here, and the template is
clean.** `waveK-lane02-recheck.json` records two failures in `f-t1-sst-reference.test.mjs` on
`clara_c02` (12 rows where 10 are expected, a duplicate key on `uq_sst_rate_schedule_live`) and
attributes them to contamination inherited with the `clara_intS6` template. That attribution is
**wrong in one part**, measured rather than argued: on `clara_intK`, a fresh clone of `clara_intS6`,
`select recorded_at, count(*) from clara.sst_rate_schedule group by 1` returns **one row, 10
records, all at the `2026-09-25 13:55:35+08` migration seed**. The two stray rows at
`2026-09-25T18:11:23` are `clara_c02`'s own, left by an earlier run on that lane database. The
conclusion the recheck drew (not this lane's doing) stands; the cause it named does not. Confirmed
again by the whole-suite run in §5.

---

## 3 · Lane L3, `riders/wK-lane03` → `5ded9640a`

#1152 #1151 #1145. Migration **0365**. Readiness: `waveK-lane03-recheck.json` verdict **accept**,
one note-severity finding (STD-1, a documented judgement call), at branch head `2437dca83`.

**Two conflicts, and three shared files git merged itself. All five were checked by hand.**

| file | resolution |
|---|---|
| `packages/db/package.json` (`$GATES`) | Union, **156 gates, none twice**, tail `… 0362, 0363, 0364, accrual-register-pagination (0365)`. |
| `packages/db/README.md` | Ordered splice, `## 0365` after `## 0364`. Section order `0360 0361 0362 0363 0364 0365`. |
| `apps/web/messages/en.json` | Auto-merged. Verified with an **independent scanner that never calls `JSON.parse`** (`scratchpad/enjson-scan.mjs`, an indent-tracking path walker, because `JSON.parse` drops a second copy of a key in silence): **7121 keys, 0 duplicates**, and it still parses. Against the base the file is **8 insertions, 0 deletions**, L1's six keys plus L3's two, appended at their sorted positions, nothing re-serialized. |
| `apps/web/test/manifest.txt` | Auto-merged. **548 entries, sorted, 0 duplicates** (`sort -c` on the comment-stripped file, `uniq -d` empty). Four new lines, one per new test file: L1's three and L3's one. |
| `packages/db/tests/rig-meta.mjs` | Auto-merged. Union of cohorts, verified by importing the merged module: **132 exports**, L1's `STANDING_INSTRUCTION_AGENT_READ_0362_COHORT` resolves to `["wake_get_firm_standing_instruction"]`, L1's `PAYROLL_POSTING_STATE_0363_HUMAN_FNS` is spread into the human roster, and L3's `0365` note (a NO-COHORT-CHANGE note, since `0365` recuts an existing name) sits beside them. No conflict marker, no lost hunk. |

**`0365` applied with no refusal and no recut**, and its prestate confirms the pre-page shape of the
door was still the live one after L1 and L2:

```
[notice] #1152 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is
        live (four-argument, pre-page (#1075/0334)) …
[notice] #1152 tail: OK -- clara.list_accrual_adjustments exists EXACTLY ONCE, at
        (uuid,date,date,text,jsonb,integer); the four-argument signature is GONE rather than left
        as a resolvable overload …
migrate: 1 new migration(s) applied · 341 total
```

| gate, on `clara_intK` at 341 files | result |
|---|---|
| L3's three touched db files (`accrual-register-pagination`, `accrual-list-side-filter`, `accrual-adjustments`) plus `operation-census` and `rig-isolation`, full 156-gate chain | **62 tests, 61 pass, 0 fail, 1 skipped**, the lane's own count exactly |
| L3's two runtime files (`queue-drain.test.mjs`, `rollback-preflight.test.mjs`), on a template clone `clara_rt_testK` with no World | **58 tests, 35 pass, 0 fail, 23 skipped**, the lane's own no-World count exactly. The 23 skips need a provisioned Workflow DevKit schema and are the gate workers' |

**The one behaviour crossing §0 flagged did not bite.** L3's `accrual-adjustments` battery and its
web accrual API call `clara.create_accrual_adjustment` and `clara.correct_accrual_adjustment`, the
two doors `0364` recuts. `0364` changes neither signature, and what it moved is the `:plan` key
derivation under them; the battery is green on the integrated chain at the same count it had on
`clara_c03`.

---

## 4 · Lane LC, `riders/wK-lane04` → `18eb2dc4d`, the version cut

#1144, `chatTurn_v23` and `claraWork_v7`. **No migration.** Readiness:
`waveK-lane04-recheck.json` verdict **accept**, one note-severity finding (STD-2, a cosmetic env
block in `.github/actions/db-live-gates/action.yml` the fix round never acknowledged), at branch
head `079ff1cba`.

**No conflicts.** The one shared file the CLOSING-PLAN's table did not predict,
`packages/runtime/README.md`, was auto-merged and the union is exact rather than assumed: L3 alone
adds **99** lines to it, LC alone adds **124**, and the merged head is **223 insertions, 0
deletions** against the base. Both sections survive whole.

### 4.1 · The frozen law for a cut, checked four ways

| check | result |
|---|---|
| `node scripts/check-frozen-workflows.mjs` | **OK, 362 frozen file(s) verified, append-only vs `origin/main`; 62 "use workflow" modules all frozen+registered; 3 retired entries recorded** |
| `node scripts/check-frozen-workflows.selftest.mjs` | **OK, all cases** |
| the 350 base entries, compared entry by entry against the merged manifest | **0 sha moved, 0 `deployed` flag moved, 0 removed** |
| the new entries | **15**, every one with **no `deployed` key**, which is what the cut mechanics want: step 11a's `--lock-deployed` is the release's act, not the merge's. The 347 that were `deployed: true` still are |

**The per-lane intersection the brief asks for, run on the manifest rather than on a report:**

| lane | files changed | intersection with the base locked set | intersection with the merged locked set |
|---|---|---|---|
| L1 | 21 | **EMPTY** | **EMPTY** |
| L2 | 15 | **EMPTY** | **EMPTY** |
| L3 | 25 | **EMPTY** | **EMPTY** |
| LC | 32 | **EMPTY** | **14 files, every one LC's own new `chatTurn.v23.*` or `claraWork.v7.*` body** |
| the merged head | 97 | **EMPTY** | the same 14 |

**The fifteenth new entry is not one of LC's changed files, and that is correct.**
`packages/runtime/lib/fa-proposal-grounds.ts` was created by the sweep wave's lane L5 and is already
on `main`; it enters the manifest now because `claraWork.v7.impl.ts` imports it, so it joins the
frozen closure without a byte of it moving. Checked: it is absent from
`git diff --name-only ffb629d73...riders/wK-lane04`.

**The empty `note` on each new entry is the house norm, not an omission.** 271 of the 362 entries
carry `"note": ""`, including every part of the `v21`, `claraWork.v5`, `v6` and `v7` cuts;
`chatTurn.v22.ts` carries a paragraph because someone wrote one. `check-frozen-workflows.mjs:348`
preserves `prev.note ?? ""` on `--update`, so a note is always a hand edit.

### 4.2 · LC's gates

| gate | result |
|---|---|
| `chat-turn-v23-tools.test.mjs` + `chat-turn-v23-tenancy.test.mjs` | **49 tests, 49 pass, 0 fail**, the lane's own count exactly |
| the neighbour census: `chat-turn-v22-tools`, `p6-1-parts-parity`, `l9-build-info`, `registry-view`, `local-db-gate-drivers-census`, `clara-work-v7`, `clara-work-v6` | **90 tests, 90 pass, 0 fail** (the lane reported 82 over six files; this run adds `clara-work-v6.test.mjs`, which LC also edits) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK**, reader is a superset of emittable, and the census now lists `claraWork.v7.impl.ts:464` as a `work_result` site beside v1 to v6. No new part kind, which is what the plan forbids |
| `node scripts/check-worker-paths.mjs` | **OK, 2 spawn sites** resolve through `resolveLibWorker` |

---

## 5 · The end gates, on the complete head `18eb2dc4d`

### 5.1 · The ordered chain, replayed three times from the pristine template

The release will apply these four files in file order on top of the hosted `0361`. That order was
proved three times, each time from `clara_intS6` rather than from a database a lane had used:

| database | how it was built | result |
|---|---|---|
| `clara_intK` | `createdb -T clara_intS6`, then one `migrate` per lane as each merged | 337 → 339 → 340 → **341**, head `0365_accrual_register_pagination` |
| `clara_intK2` | `createdb -T clara_intS6`, then ONE `migrate` after all four lanes were merged | **4 new applied · 341 total**, in one run, no refusal |
| `clara_intk_lower` | `createdb -T clara_intS6`, same single `migrate` (built for §5.3's control) | **4 new applied · 341 total** |

**Not one file refused, and not one file was recut.** That is the whole difference between this merge
and the sweep's, which paid for eleven recuts across five migrations. §0 predicted it from the body
sets and the chain agreed. The proof that nothing was edited at integration is byte-level rather than
argued: each migration file on the merged head hashes to exactly what its lane branch carries, and to
exactly what the ledger recorded when it applied.

| file | sha256 of the file on the lane branch | on the merged head | the ledger's checksum on `clara_intK` |
|---|---|---|---|
| `0362_standing_instruction_agent_read` | `dea2860efae88070…` | **same** | `dea2860efae88070261b722e89d0b28fda78f57ae721f048a9ca3f2aebe2aa6e` |
| `0363_payroll_posting_state_read` | `58a3ac5a8cb082fc…` | **same** | `58a3ac5a8cb082fc946b54d37737f2bba605f57f6f357a469274124c6c5132e0` |
| `0364_plan_reservation_namespace_obo_fold` | `b416ea4521b4275e…` | **same** | `b416ea4521b4275ee00bd125df32d05bb3c1d2b82dcaa3ba5cf9438bc9f557e7` |
| `0365_accrual_register_pagination` | `4983f44a3e27e699…` | **same** | `4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4` |

The last two match the values L2's and L3's recheck reports predicted for the integrator, to the
character.

**The ten bodies the wave writes, each resolving exactly once on the integrated chain**, hashed with
`sha256(convert_to(prosrc,'UTF8'))`, which is this estate's own recipe and the one wave S §14.2 had
to switch to after `::bytea` choked on a backslash:

| body | post-image (first 16) |
|---|---|
| `wake_get_firm_standing_instruction(p_instruction_key text)` | `f69794dae2da194d` |
| `withdraw_firm_standing_instruction(p_instruction_key text, p_reason text, p_op_key text)` | `1d057b74827f665b` |
| `get_payroll_posting_state(p_document uuid)` | `c846456ffd80e51e` |
| `create_accrual_adjustment(…11 args…)` | `a6319d252d8db1cc` |
| `correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key text)` | `5f26b7061cc19f58` |
| `_confirm_tenancy_rent_plan_core(…9 args…)` | `a4650cd2f28d8665` |
| `_confirm_tenancy_rent_plan_revision_core(…7 args…)` | `17447d683ed1af15` |
| `_obo_plan_core(…14 args…)` | `1e36654777973175` |
| `_tenancy_plan_core(…13 args…)` | `67fd7548a7ded4d4` |
| `list_accrual_adjustments(p_client uuid, p_from date, p_to date, p_side text, p_cursor jsonb, p_limit integer)` | `504ec1fe6e50803f` |

`list_accrual_adjustments` resolves at the six-argument signature **only**; the four-argument
pre-page shape is gone rather than left as a resolvable overload, which is `0365`'s own tail claim
and is now true on a chain carrying every other lane's file too.

### 5.2 · The gates

| check | result |
|---|---|
| the WHOLE `packages/db` suite, full 156-gate chain, on `clara_intK` | **6071 tests, 5960 pass, 1 fail, 110 skipped** (24 min) |
| the WHOLE `packages/db` suite again, on the independently built `clara_intK2` | **6071 / 5960 / 1 / 110**, identical, so the one red is deterministic rather than a flake |
| the WHOLE `apps/web` unit suite (`node scripts/run-tests.mjs`) | **5277 tests, 142 suites, 5275 pass, 0 fail, 2 skipped** |
| the web pins corpus (`tests/firm-scope-db-pins.test.ts`) | **22 / 22** |
| `pnpm typecheck` | **exit 0**, `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, all four workspaces |
| `node scripts/check-frozen-workflows.mjs` | **OK, 362 frozen / 62 "use workflow" / 3 retired**, append-only against `origin/main` |
| `node scripts/check-frozen-workflows.selftest.mjs` | **OK, all cases** |
| the frozen law, independently | **97 files changed against `ffb629d73`, and NOT ONE is a key in the base manifest**; the 14 that are keys in the MERGED manifest are LC's own new bodies |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK**, 1611 function definitions and 256 change-of-record patches scanned, **the same 20 justified waivers** the estate had before this wave |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `node scripts/check-worker-paths.mjs` | **OK, 2 spawn sites** |
| `packages/runtime`, LC's cut cells | **49 / 49** |
| `packages/runtime`, LC's neighbour census (7 files) | **90 / 90** |
| `packages/runtime`, L3's two files on a template clone, no World | **58 tests, 35 pass, 0 fail, 23 skipped** |
| `packages/runtime`, the four harnesses that drive L3's intake and queue-drain modules (`intake-batch-unit`, `intake-sidecar-race`, `local-db-gate-drivers-census`, `local-db-gate`) | **54 / 54** |
| `clara%` role count on the cluster | **20**, `0154`'s own pin, unchanged. **No closing-wave migration minted a role**, which is risk 1's mitigation holding |

**The 110 skips are pre-existing gate conditions, none of them this wave's.** 39 are destructive
cells behind `CLARA_RIG_ALLOW_RESET`, which this rig never sets; 15 are the DB-A coding-lane surface,
absent; 8 are the dormant Wave-D-b bank substrate; the remaining 45 are cells whose subject was
retired with F-A2 PR-3 and which say so by name.

### 5.3 · The one red, and why it is the database's NAME rather than the wave's code

```
not ok 3571 - rcr.sharedDependents sees a SHARED-object dependency (dbid = 0), not only a
              per-database one (L04B-SPEC-05)
  location: packages/db/tests/role-census-reset.test.mjs:168
  error: 'database "clara_intk2" does not exist'   code: '3D000'
```

`role-census-reset.test.mjs:182` builds its probe with

```js
await client.query(`grant connect on database ${process.env.PGDATABASE} to ${roleName}`);
```

The database name is interpolated **unquoted**, so PostgreSQL folds it to lower case. Every
integration database this programme has used carries a capital letter, so the identifier the server
looks up is not the one `createdb` made. Demonstrated directly rather than inferred, in a rolled-back
transaction on the chain itself:

| statement | result |
|---|---|
| `grant connect on database clara_intK2 to postgres` | `ERROR: database "clara_intk2" does not exist`, the test's exact error |
| `grant connect on database "clara_intK2" to postgres` | `GRANT` |

**And the control settles it.** `clara_intk_lower`, an all-lowercase clone of the same template
migrated to the same 341 files, runs the same file green: **9 tests, 9 pass, 0 fail, 0 skipped**.

**It is not this wave's file and not this wave's cell.** `git diff --name-only
ffb629d73...HEAD -- packages/db/tests/role-census-reset.test.mjs` is empty; the file was last touched
by `7a58adca5` (#871, 2026-09-24) and the cell was written by `79e34ec14` (#867 review round 2,
2026-09-20). It has apparently never run on a mixed-case database before, because no lane and no
previous merge ran the whole `packages/db` suite: wave S's merge ran only the batteries its lanes
touched (`waveS-merge.md` §18.8), and every closing-wave lane says the whole suite is the
integrator's.

**The honest reading of the suite is therefore 6071 tests, 0 code failures, 110 skipped**, with one
cell unrunnable on a database whose name is not all lower case. Two things follow, and neither is the
merger's to do: the release should name its database in lower case, and the cell is worth one line
(`"${process.env.PGDATABASE}"`, quoted) in a later ticket. The probe role it mints is cleaned up by
its own `finally` block either way, verified: no `x867%` role survives and the `clara%` count is
still 20.

### 5.4 · The browser walks

Every walk that renders a surface this wave changed. The wave touches **nine** non-test source files
under `apps/web` and exactly **one** file under `apps/web/e2e` (`accrual-mock.mjs`); L2 and LC have an
empty `apps/web` diff, so neither owes a walk.

| walk | why it is owed | result |
|---|---|---|
| `accrual-walk` | `accruals-list.tsx`, `lib/accruals/api.ts`, `use-accruals-register.ts`, `e2e/accrual-mock.mjs` (L3) | **21 passed** (37.8 s) |
| `plans-walk` | `plan-revise-form.tsx` (L3), whose accrual read had to follow the envelope's new shape | **9 passed** (25.7 s) |
| `document-correction-walk` | `document-detail.tsx`, `payroll-posting-section.tsx`, `lib/documents/payroll-posting-state.ts` (L1) | **15 passed** (31.4 s) |
| `documents-viewer-walk` | the other walk that mounts `DocumentDetail` (L1) | **22 passed** (54.1 s) |
| `firm-commercial-walk` | `standing-instructions-card.tsx`, `lib/firm/standing-instructions.ts` (L1) | **10 passed** (23.4 s) |
| `firm-navigation-walk` | also loads `/settings/firm`, where L1's card mounts | **11 passed** (35.8 s) |
| `home-board-walk` | same | **28 passed** (1.3 min) |
| `shell-migration-walk` | same | **31 passed** (46.9 s) |
| `interview-walk` | same | **4 skipped, 0 run**. Every cell is `test.skip(!target, "review/merge supplies the isolated COMPLETE client/thread fixture")`, gated on a fixture this rig does not set. The spec is untouched by the wave |

**147 passed, 0 failed** across the eight walks that run. The lanes' own counts for the four they
drove (21, 15, 22, 10) reproduce exactly; the four extra walks are this merge's, run because they
mount a changed component even though no lane claimed them.

**Rule (d), measured rather than assumed.** Four migration files changed, so the corpus test was in
scope. It ran (22 / 22) and **no barrier entry was owed**: `apps/web/tests/firm-scope-db-pins.corpus.ts`
contains **zero** mentions of `0362`, `0363`, `0364` or `0365`, and no lane changed the corpus file.
All four install static DDL, which owes no reviewed dynamic-SQL barrier.

**The web environment.** `apps/web/.env.local` is gitignored and absent from a fresh worktree, which
is what made an earlier merge report a build it could not run. It was copied in from the main
checkout so the walks could be driven. It is untracked (`git check-ignore` confirms `.gitignore:6`)
and appears in no commit.

**Rig hygiene.** `clara_intS6` and `clara_l02` were never written to; the four lane databases
`clara_c01` .. `clara_c04` were never opened; the runtime legs ran on the template clone
`clara_rt_testK` rather than on the chain, so `clara_intK` stayed clean for the census. No
`CLARA_RIG_ALLOW_RESET`, no role sweep, no `git worktree` subcommand from WSL and no git from WSL
(WSL was used only for `psql` and `createdb`, which are not on the Windows `PATH`). The cluster now
holds `clara_l02`, `clara_intS` .. `clara_intS6`, `clara_c01` .. `clara_c04`, and this merge's
`clara_intK`, `clara_intK2`, `clara_intk_lower` and `clara_rt_testK`, with **20 `clara%` roles**.

**All four lane worktrees are untouched and clean**, read at the end: `701` at `87ab0de1c`, `702` at
`0a6deba7a`, `703` at `2437dca83`, `704` at `079ff1cba`, each with an empty `git status --short`. The
only file written in the main checkout is this report.

---

## 6 · The successor contracts the lanes wrote, for re-parenting to the mainline's next cut

Every lane's report carries a "Successor contract" section, because the wave asks for the check
rather than a guess. Two lanes say **none is owed** with the evidence for it, and those are recorded
here as answered rather than repeated: **L2** (`waveK-lane02-fix.md` §5, proved by an empty
`packages/runtime` diff and a clean freeze-lint) and **L3** (`waveK-lane03-fix.md`, same proof, plus
the observation that LC's roster is closed to additions).

**LC's roster IS closed, and both open lanes respected it.** Neither L1 nor L2 nor L3 asked LC to
carry anything; every contract below is for the cut AFTER `chatTurn_v23` and `claraWork_v7`.

| # | ticket | report | target body | what must be carried |
|---|---|---|---|---|
| 1 | #1147 | `waveK-lane01-fix.md` §4.1 | a chat tool `read_firm_standing_instruction` over `clara.wake_get_firm_standing_instruction` | The projection's `recorded_by` is a **bare user uuid**, and no `clara.wake_get_%` door in the catalog resolves a uuid to a person (measured: 0 of 11). The successor tool says THAT an instruction stands and WHEN, and must not attempt to name the member until a later cut projects a display name. |
| 2 | #1148 | `waveK-lane01-fix.md` §4.2, contract in `waveK-lane01-ticket1148.md` §8 | a chat tool `read_payroll_posting_state` over `clara.get_payroll_posting_state` | The answer carries **seven** keys, `document_id`, `sentence`, `verdict`, `rung`, `reason`, `completeness` and **`duplicate_scope`**. A model-lane twin must project `duplicate_scope` and apply the page's own rule: when `rung = 'no_duplicate_entry'` and `duplicate_scope = 'same_document'`, the sentence is about the document the caller is already holding and must not be repeated back as a reason it "did not post". Refusals: `CLR11` for a document that is not this firm's AND for one that does not exist (one message, no oracle), `CLR04` at the viewer floor, `CLR10 / not_a_payroll_summary`, which a surface answers with silence and a chat tool must never render as a firm-facing sentence. |
| 3 | #1147 | `waveK-lane01-fix.md` §4.3 | `clara._prepayment_schedule_core`'s wake arm | A `for key share` lock on the instruction row, so `plans_still_posting` is a statement about the world after the withdrawal rather than about the withdrawing transaction's snapshot. This is a recut of a schedule core, which L1 was grouped specifically not to do. A ticket, not a cut item. |
| 4 | #1144 | `waveK-lane04-fix.md` §3.1.1 | `packages/runtime/lib/prepayment-schedule-basis.ts:119` | The `invalid_author` comment still says "CLR10, and NEVER SHOWN"; `0335` moved that refusal to `CLR44`. The correction could NOT ride this cut, measured rather than asserted: every consumer of the module is deploy-locked and `chatTurn_v23` reaches it only through byte-locked `chatTurn.v22.tools.ts`, so a successor copy would be unreachable. The RULE it implies IS enforced in this cut (`isGovernedRefusalV23` subtracts `CLR44`). The next cut that re-cuts one of those consumers carries the comment. |
| 5 | #1144 | `waveK-lane04-fix.md` §3.1.2 | `clara._confirm_tenancy_rent_plan_core` and `clara._confirm_tenancy_rent_plan_revision_core` | A replay marker. Either stamp `'replayed', false` into the `clara._finish_op` payload, or better, follow the estate's house shape and raise `CLR13 operation_in_flight` on the `v_dedupe ? 'pending'` branch and return the stored receipt with an added `replayed` key on the settled branch. Until one lands, no chat tool can tell a converged replay from a fresh act, and `chatTurn_v23` ships no field claiming otherwise. **Note for the next writer:** L2's `0364` rewrote both these cores in this same wave and did NOT add the marker, so the contract is live against the post-`0364` bodies. |
| 6 | #1144 | `waveK-lane04-fix.md` §3.1.3 | `clara.get_document_state` | #1136 §1 asks the posted branch to report "the entry: its date, its memo and its total". The state door carries `{entry_id, status}` and nothing else, so `chatTurn_v23` reports the approved entry IDS and the whole state and has no date, memo or total to quote. Either `operation.entries` gains those three fields, or the next cut takes a second granted read. |

---

## 7 · Anything unverified

1. **The from-scratch chain was not run here.** `CLOSING-PLAN.md` risk 1 forbids a second
   from-scratch chain on cluster 55742 ("nobody runs a second from-scratch chain on this cluster; the
   from-scratch proof is the integrator's, on a disposable cluster"), and all four lanes carry it as
   an open debt (L1's `SPEC-04`, L2's §7, L3's `SPEC-K3-08`). What this merge proves instead is the
   ordered chain **from the template**: `clara_intS6`'s 337 files, which gate A of the sweep wave
   proved byte-equal to a from-scratch build, plus `0362 0363 0364 0365` applied in file order. The
   checksum a gate-A run should expect for `0365` is
   `4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4`, and for `0364`
   `b416ea4521b4275ee00bd125df32d05bb3c1d2b82dcaa3ba5cf9438bc9f557e7`, both read off this chain's own
   ledger below.
2. **The two-build cutover drill was NOT run**, nor step 11a's `--lock-deployed`. Both are the gate
   workers' and the release's, as the brief assigns them, and a version cut makes them heavier than
   the sweep's (`CLOSING-PLAN.md` risk 6). This merge proves the manifest is append-only and the new
   entries are unlocked; it does not prove the two images agree.
3. **The runtime suite was not run end to end on a DevKit schema.** The brief assigns that to the
   gate workers. What ran here is every runtime file any lane touched, plus LC's neighbour census,
   with the **23 World-gated cells in `queue-drain.test.mjs` and `rollback-preflight.test.mjs` still
   skipping**. Those 23 are L3's own #1151 ground and #1145's whole subject, so this is the largest
   gap this report carries, exactly as it was for the sweep.
4. **The WSL re-run L3 asked for could not be done on this host.** `waveK-lane03-fix.md` asks the
   integrator to run the new runtime test files once under WSL as `runner`, per the wave-3 addendum.
   WSL on this host carries `psql`, `createdb` and `dropdb` but **no Node** (`wsl -- bash -lc
   'command -v node'` answers nothing, and `/home/runner/.nvm` does not exist), so the run is not
   available here rather than skipped by choice. `CI=true GITHUB_ACTIONS=true pnpm lint` is exit 0 on
   Windows, and L3's own argument stands unchecked: the new `queue-drain.test.mjs` cells are pure
   in-memory and the two e2e drivers set `CLARA_SPOOL_DIR` through their own scratch directories.
5. **`pnpm build` for `apps/web` was not run as a gate**, but it was run **seven times as a side
   effect**: `e2e/serve-built.mjs` builds the real bundle before every walk, and eight walks were
   driven. `pnpm --filter @clara/runtime build` was not run.
6. **`interview-walk.spec.ts` reports 4 skipped, 0 run**, and that is not this wave's doing: all
   four cells are `test.skip(!target, "review/merge supplies the isolated COMPLETE client/thread
   fixture")`, gated on a fixture environment variable this rig does not set. The spec file is
   untouched by the wave (`git diff --name-only ffb629d73...HEAD -- apps/web/e2e/interview-walk.spec.ts`
   is empty).
7. **Each lane's own unverified list stands.** This merge verified INTEGRATION, not the lanes'
   claims. In particular these are carried, not closed:
   - **#1147's owner ruling** (L1's `SPEC-03`) is still not on GitHub #1147: whether withdrawing a
     standing instruction should pause the plans it authorised. Written out in `packages/db/README.md`'s
     `0362` section and in `waveK-lane01-ticket1147.md`. An orchestrator action, and the merger may not
     write to GitHub.
   - **L2's two open reservation pairs** (`SPEC-1150-02` / `ADV-01` residual): the within-lane `:plan`
     and `:rrplan` sharing in `clara._prepayment_schedule_core` + `clara.replace_prepayment_schedule`
     and `clara._revenue_recognition_core` + `clara.replace_revenue_recognition_schedule`. Enumerated
     in `ACKNOWLEDGED_SHARED_DERIVERS` and measured every run by
     `p1150.namespace.one_suffix_one_body`, which fails BY NAME if a roster entry outlives its cause.
   - **LC's `STD-2`**, the one finding no fix round acknowledged: the collapsed single-line env block
     for the v23 step in `.github/actions/db-live-gates/action.yml`, where the v22 block immediately
     above is one assignment per line. Cosmetic, no functional defect, still open at the merged head.
   - **L3's `STD-1`**, a judgement call about whether a migration's own structural cells satisfy
     rule 4's red-green loop. A house-law question for `WORK-ORDER.md`, not a defect.
8. **Nothing in this merge was re-reviewed by a lane worker**, because this merge made no recut. That
   is the one thing that separates it from the sweep's, where eleven recuts across five migrations
   each needed its own argument. Here the only integration edits are the two `$GATES` unions and the
   two `packages/db/README.md` splices, all four of which are shared-file appends that move no
   statement, no pin and no installed byte.
