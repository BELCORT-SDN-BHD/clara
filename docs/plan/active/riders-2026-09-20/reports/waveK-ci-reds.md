# Riders closing wave K — the PR #1154 CI reds, reproduced and fixed (COMPLETE)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\710` · **branch** `fix/wK-ci-reds`
**Cut from** `integration/riders-closing` at `11b82ea57` (onto main `40c5ca671`) ·
**head `78c250096`**
**Two commits**, one per red. Nothing pushed, no pull request, no GitHub object written, no other
worktree and no file in the main checkout but this report touched, no subagent spawned, no process
killed that this session did not start.

| # | commit | red | job |
|---|---|---|---|
| 1 | `d2783aabb` | #1148 — `p1148.acl.census` ordered its catalog readback under the server's collation | db-estate |
| 2 | `78c250096` | #1144 — `chat-turn-v22-e2e.mjs` still asserted it was the current cut | db-live-gates |

Both reds are in **test files only**. No migration, no `packages/runtime/workflows` body, no
`frozen-workflows.json` entry, no production module and no assertion's expected value moved. The
whole branch is **2 files, 52 insertions, 10 deletions** (`git diff --stat 11b82ea57..HEAD`), and
more than half of the insertions are the two comments that record why.

CI run **36199022506** carried **exactly two** failures, which this report re-measured rather than
took on trust: `grep -c "packages/db test: not ok"` over `ci-db-estate.log` returns **1**, and
`ci-db-live-gates.log` carries **one** `E2E: FAILED`. Everything else — lint, build, render-drill,
storage-policy-battery, db-split-partition-total — passed.

---

## The rig

| what | where |
|---|---|
| worktree | `C:\Users\zhant\Desktop\clara-wt\710`, `fix/wK-ci-reds` from `11b82ea57` |
| the db cell | `clara_intK` (capital K, quoted) @ `127.0.0.1:55742`, **341 files**, `C.UTF-8` |
| the e2es | `clara_wave_b_ci` @ `127.0.0.1:55710`, **337 files**, World bootstrapped — the disposable cluster `rigl06ac3`, the same database and the same `scripts/ci/world-gate.mjs` launcher lane LC and gate C used (`waveK-lane04-fix.md`, `waveK-gates-C.md`) |
| created and dropped | `clara_rt_test` @ 55742, `create database … template "clara_intK"` then World-bootstrapped, used for the first reproduction and **dropped** at the end. `clara_intS6`, `clara_l02` and `clara_c01`–`c04` were never opened for write; `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. |

**The one rig fact that changed an answer, and that the next worker should not rediscover.** The
first e2e rig was a clone of `clara_intK`, the merger's integration replay. On it the **v23** walk
fails at its Work leg with a wall of
`runModelSegmentStepV23 … Invalid prompt: messages must not be empty`, several distinct
`workflowRunId`s at once, ending in the child's `Reached heap limit`. None of that is the branch.
It is `CUT-PLAN.md` §4.5 **trap 2** happening for real: the replay database carries other runs'
chat tasks, a fresh engine's reconciler dispatches them, and each reaches this leg's scripted model
with no transcript. On `clara_wave_b_ci` the same file is **ALL PASS (21 406 ms)** unchanged. A
per-version chat e2e needs a *seeded and pristine* database, not merely a migrated one.

---

## Red 1 — `2981` `p1148.acl.census` · #1148 · `d2783aabb`

**Where.** `packages/db/tests/payroll-posting-state-read.test.mjs:413`, sub-clause (c), the call-site
census. The expected and actual arrays held **the same four members in a different order**:

```
expected: _list_review_queue_core, _post_payroll_run, answer_payroll_completeness, get_payroll_posting_state
actual:   answer_payroll_completeness, get_payroll_posting_state, _list_review_queue_core, _post_payroll_run
```

**Cause.** The readback was ordered `order by 1` over `p.oid::regprocedure::text` — a **cast to
text**, which ranks under the DATABASE collation, not under `name`'s own `C`. The GitHub runner's
cluster is initdb'd `en_US.utf8`, where glibc gives punctuation no primary weight: `clara._list_…`
ranks as `claralist…`, so both underscore-led signatures fall **after** the two letter-led ones
(`a` < `g` < `l` < `p`, which is CI's `actual` exactly). Every rig here is `C.UTF-8`, where `_`
(0x5F) precedes the lowercase letters, so every local run was green. The pin recorded the server's
`lc_collate` rather than the data — #1047's own sentence.

**Reproduced**, 2026-09-26 on `clara_intK`, inside a rolled-back transaction: the same four rows
ordered under an ICU collation with `ka-shifted` (punctuation variable-weighted, which is glibc's
behaviour) return CI's `actual` array member for member. No schema change survived the transaction.

**Fix.** The ORDER BY now names the expression and spells the collation:
`order by (p.oid::regprocedure::text) collate "C"`. Sub-clause (b)'s role readback, the same shape
over a `text[]` element, took the same treatment. **Nothing is loosened**: all four expected members
and their order are unchanged, and (b)'s single expected member is unchanged. Only the ORDER BY
moved.

**Proven collation-proof**, not merely re-run: the fixed query returns the pinned order both at the
database default *and* with the compared expression forced through that shifted collation first
(`order by (p.oid::regprocedure::text collate <shifted>) collate "C"`) — identical, so the explicit
`collate "C"` overrides rather than merely agrees.

**Why the scanner did not catch it, which is worth a follow-up.** `collation-pin-scan.mjs`'s
`INTEGER_KEY` regex begins `^(?:\d+|…)`, so a lone digit is classified **free**. That is right for a
literal integer key and wrong for a **positional reference** to a text select-list column, which is
what `order by 1` is here. The scan is a text scanner and cannot resolve position 1 to the
expression behind it — the same limitation its own header already declares for aliases, where the
answer is `unresolved`, i.e. movable. This fix sidesteps the gap by naming the expression; closing
it is a scanner change nobody has made.

---

## Red 2 — `chat-turn-v22-e2e.mjs` · #1144 · `78c250096`

**Where.** `packages/runtime/tests/chat-turn-v22-e2e.mjs:434`,
`AssertionError: the engine serves THIS cut's chat body`, `expected: /chatTurn=chatTurn_v22/`.

**Cause.** Lane LC repointed the pins to `chatTurn_v23` / `claraWork_v7`, and this file still
carried two literals on the serving line — `chatTurn=chatTurn_v22` (line 434) and
`claraWork=claraWork_v6` (line 435). The second never got to run because the first threw.

**Reproduced** locally, byte-identical to CI's own `actual` string, including
`frontier=0365_accrual_register_pagination(341) bodies=62 … chatTurn=chatTurn_v23 claraWork=claraWork_v7`.

**What the precedent actually is** — read, not assumed, because the brief's expectation and the
record differ on one point worth recording:

- The v22 cut merge **`061a6992b` edited none of `chat-turn-v19/v20/v21-e2e.mjs`** (`git show --stat`
  lists none of the three; each file's last touch is `c32978792`, #1018, which predates that merge).
- It did not have to. **None of the three ever asserted a pin on the provenance line.** All three
  capture `state.serving` only for `waitBooted` and for the not-ready diagnostic, and assert the
  boot **banner**, which `pinned-work-bundle.mjs` derives from the registry's own pin. The two
  literals were something the v22 file introduced as the current cut's "I am current" claim.
- All three pass on run 36199022506 under v23, which is what "retired-body shape" means in
  practice: the walk keeps running against whatever is pinned, and what it still buys is a
  **regression** — behaviour a superseded chat body established has to keep working on its
  successor.

**Fix.** Exactly that shape. The two literals go; the banner assertion stays; **no leg moves**. The
header now says what the file measures and what it no longer claims, and the provenance line is
printed, so a reader of a green log can see which cut served the walk. Nothing is loosened:
`waitReady` → `waitBooted` already refuses to return until the child has logged **both** the
provenance line and the bundle banner, and every bundle assertion in the file was already
registry-derived, so the Work walk measures the agreement between banner and receipt rather than a
version number.

**Verified under the successor**, which is the thing CI never got to show: all four legs green on
`clara_wave_b_ci` through `world-gate.mjs` — `CHAT TURN V22 E2E: ALL PASS (15 535 ms)`, with
`PASS 3: both Works ran on clara-work/v7 and their receipts record its digest`.

### The half of the brief that lane LC had already done

The brief asked for `chat-turn-v23-e2e.mjs` to be **added** and registered. **It already exists and
is already registered**, so this worker verified it instead of writing a second copy:

| what | evidence |
|---|---|
| the file and its serve child | `packages/runtime/tests/chat-turn-v23-e2e.mjs` (479 lines), `chat-turn-v23-serve.mjs` |
| registered in the gate action | `.github/actions/db-live-gates/action.yml:457` |
| registered in the closed driver roster | `packages/runtime/tests/local-db-gate-drivers-census.test.mjs:56` |
| it runs green | `CHAT TURN V23 E2E: ALL PASS (21 406 ms)`, exit 0, on `clara_wave_b_ci` |

**One measured caveat, carried not closed.** The brief's bar was "the seven new tools of #1144 get
at least the legs the v22 e2e gave its own tools". The v23 file drives **two of the seven**
(`read_tenancy_terms` through 0353's CLR11, and `read_rent_settlement_candidates` on a real client)
plus the claraWork_v7 Work walk; the other five —
`read_payroll_posting_state`, `read_payroll_settlement_state`, `read_agreement_terms`,
`confirm_tenancy_rent_plan`, `confirm_tenancy_rent_plan_revision` — have no World leg of their own.
That is LC's own design, argued in `waveK-lane04-ticket1144.md` and accepted at
`waveK-lane04-recheck.json`. **Widening it is a ticket, not a CI fix**, so this worker left it and
names it here.

---

## The gates, at the fixed head `78c250096`

| gate | command | result |
|---|---|---|
| the fixed db cell | `node --test --test-concurrency=1 $GATES tests/payroll-posting-state-read.test.mjs` on `clara_intK` | **8/8 pass**, 0 fail |
| …plus the two collation batteries | `+ tests/collation-pin-scan.test.mjs tests/collation-pin-portability.test.mjs` | **29/29 pass**, 0 fail |
| the whole chat-turn e2e set | `world-gate.mjs tests/chat-turn-v{19,20,21,22,23}-e2e.mjs` | **all exit 0** — v19 PASS (4 legs), v20 PASS (4 legs), v21 PASS (5 legs), v22 ALL PASS (15 535 ms), v23 ALL PASS (21 406 ms) |
| typecheck | `pnpm typecheck` | **exit 0** (`apps/web`, `packages/runtime`) |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the freeze chain | `node scripts/check-frozen-workflows.mjs` | **OK — 362 frozen files, 62 `"use workflow"` modules all frozen+registered, 3 retired** |
| …additions-only | `node scripts/check-frozen-workflows.mjs --compare-base origin/main` | **OK — 347 existing entries retain the same hash and deployed flag; 15 additions; 3 recorded retirements** (347 + 3 = the 350 base entries, unmoved) |
| the driver roster | `node --test tests/local-db-gate-drivers-census.test.mjs` | **8/8 pass** |
| the launcher's own selftest | `node scripts/ci/world-gate.selftest.mjs` | **OK** |

### The legs CI never reached, run here to close the gap

`db-live-gates` is one shell step, so it **aborted at v22** and everything after it in that step
never executed on run 36199022506 — nor did the two DR steps, which the log shows as `skipped`.
That is eight legs that a "the rest was green" reading would silently assume. Run here, all on
`clara_wave_b_ci` through `world-gate.mjs`:

| leg | result |
|---|---|
| `chat-turn-v23-e2e.mjs` | **ALL PASS**, exit 0 |
| `plan-occurrence-e2e.mjs` | **PASS 1–5**, exit 0 |
| `accrual-e2e.mjs` | **PASS 2, PASS 3+4**, exit 0 |
| `prepayment-occurrence-e2e.mjs` | **PASS (LOCAL, scripted-model — supplementary per AC8)**, exit 0 |
| `opening-ledger-source-e2e.mjs` | **clean SKIP**, exit 0 — `0228_opening_ledger_source.sql` registry shape differs on this rig (8 across 1 value, expected 2 across 1). Not measured here. |
| `work-knowledge-e2e.mjs` | **OK**, exit 0 |
| `body-census-guard-db.test.mjs` | **4 pass, 0 fail, 0 skipped** |
| `two-build-cutover-e2e.mjs` | **not re-run here.** Gate C ran it green on the integrated head at 89 s, three legs (`waveK-gates-C.md` row 3); lane LC ran it green too (`waveK-lane04-fix.md`). |
| the two DR steps | **not run here** (ephemeral clusters, CI-only shape). |

---

## Follow-ups worth filing

1. **`collation-pin-scan.mjs` calls a positional `order by 1` free.** `INTEGER_KEY`'s leading `\d+`
   cannot distinguish an integer key from a positional reference to a text select-list column. The
   honest classification for a bare digit is `unresolved`, the same answer the module already gives
   an alias. Until then, a pinned census written `order by 1` is invisible to the scanner — which is
   exactly how this red shipped. Filing this is worth more than the fix was.
2. **`standing-instruction-agent-read.test.mjs:272` (#1147) carries the same shape** — `order by 1`
   over a role element of a `text[]` in the `p1147.read.acl` census. It is **not a red**: every
   member shares the `clara_` prefix or is `public`, so no glibc reordering is reachable from the
   current roster (checked member by member). It is one new role name away from being one, and it
   was left untouched because it belongs to another ticket and is green on CI.
3. **The five #1144 tools with no World leg** (see the caveat above), if the house wants the v23
   walk to meet the bar the v22 walk set for its own tools.

## Anything unverified

- **The whole `packages/db` suite was not re-run.** One file changed, that file is green, and the
  two collation batteries that police the rule are green. The estate job's other 2 980 cells are
  unchanged code on an unchanged database and were green on run 36199022506.
- **No CI run has executed this fix.** Everything above is this host: Windows, `C.UTF-8` clusters,
  `peak RSS unavailable (no /proc on this platform)`. The glibc `en_US.utf8` behaviour is
  reproduced through an ICU `ka-shifted` collation, which returns CI's array exactly, not through
  a glibc server — no `en_US.utf8` collation exists on either cluster (`pg_collation` carries only
  `C`, `C.utf8`, `POSIX` for the libc provider).
- **`opening-ledger-source-e2e.mjs` skipped rather than ran** on this rig, so its behaviour at this
  head is unmeasured here.
- **The e2e rig is 337 files, CI's is 341.** Both carry every migration the two files gate on
  (0225/0275/0301 for v22, 0225/0352/0353 for v23), so no leg skipped for a missing door, but the
  four closing-wave migrations were not under the e2es here.
- **`clara_wave_b_ci` @ 55710 is lane LC's and gate C's database, not one assigned to this worker.**
  It was used read-mostly, in the way those two used it, and it now carries this worker's e2e rows
  on top of theirs. Nothing was dropped or truncated there.

### The rig, as it was left

`clara_rt_test` @ 55742 created and **dropped**. `clara_intK` @ 55742 unchanged — the only writes
were the test file's own fixtures and one `create collation` inside a rolled-back transaction.
55742 now holds exactly what it held before: `clara_c01`–`c04`, `clara_intK`, `clara_intK2`,
`clara_intS`–`S6`, `clara_intk_lower`, `clara_l02`, `clara_rt_testK`. The worktree is clean at
`78c250096` with two commits and nothing staged. No process this worker did not start was killed.
