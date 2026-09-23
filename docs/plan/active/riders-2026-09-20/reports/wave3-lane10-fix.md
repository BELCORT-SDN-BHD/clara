# Wave 3 · Lane 10 · review fix round

Branch `riders/w3-lane10`, worktree `C:\Users\zhant\Desktop\clara-wt\660`.
Base `ffe63a0dd084e99b84c1368119845be273c421ce`.
Head at review time `3f15508b419e914e584647c025f9e3e95aba6a91`.

**New head: `c3cb533db6fb62a8ca7ce979d5bad7fe24dc5684`.**

Working tree clean. Nothing pushed, no PR, no GitHub write. Starting state was clean too — the
implementer of #1018 who was cut off by a usage limit had left nothing uncommitted
(`git status` empty, 21 commits on the branch).

Five new commits, on top of the 21 already there:

```
c3cb533db test(db): #1023 locate a drill's CI step by its invocation line, not by the prose above it
567bbb596 docs(db): #1023 the three onboarded drills no longer claim they have no CI leg
464c0ceda fix(runtime): #1028 read LEG 4's liveness from the estate, not a second spelling of it
48d562861 test(runtime): #1018 bring the 24th World-spawning file onto the shared gate, and derive the roster
1cadf9b7c test(runtime): #1015 assert the explicit-full-ask as a DIFFERENCE, not as a census total
```

No migration in this lane, at review time or now: `git diff ffe63a0dd08...HEAD --stat` touches no
file under `packages/db/migrations/`, so no redo, no prestate re-measure, and no
`apps/web/tests/firm-scope-db-pins.corpus.ts` re-measure applies (the lane's whole diff touches no
`apps/web` file at all).

---

## SPEC-1015-01 — blocker — FIXED

**The claim.** The new AC2 cell asserted the exact size of the whole live document census, so it
reds on any database carrying other live document-processing rows, which is the contamination
dependence #1015 exists to remove.

**Reproduced, exactly as reported.** `clara_l10` carries 16 live `queued` /
`clara-classify-llm:v1` rows in `clara.document_processing_tasks` (measured: `all_docs` 16,
`live_docs` 16, `agent_tasks` 0), left by #1016's own `delta-contract.test.mjs` gate runs plus the
reviewer's re-check. On a `TEMPLATE clara_l10` clone with a freshly bootstrapped World
(`clara_l10_f660`): `node --test tests/rollback-preflight.test.mjs` → `# tests 33 / # pass 32 /
# fail 1`, `not ok 19`, `AssertionError … 18 !== 2` at
`tests/rollback-preflight.test.mjs:630`.

**The fix** (`packages/runtime/tests/rollback-preflight.test.mjs`, cell
`637.pf: #1015 — an explicit ask for the FULL document picture …`). The total is gone. The contract
the brief states is a DIFFERENCE between two calls that differ only in whether the
`documentTaskIds` key is named, and that difference is true whatever else is live, so the cell now
asserts it as one:

- key NAMED (`documentTaskIds: null`) beside `taskIds: [randomUUID()]` → every planted row is
  present, **and** every row returned is a `clara.document_processing_tasks` row (the agent half
  stayed scoped);
- the SAME scope object with the key ABSENT → `tasks` is `[]` — not the planted rows and not anyone
  else's — and `measured` is still `true`;
- no scope at all (`{}`) → the planted rows are present, the shape `preflight()`'s GLOBAL census
  and `tests/queue-drain.mjs` already use.

No library line changed: `lib/rollback-preflight.mjs` was already correct; only the cell's
assertion was wrong.

**Evidence** (all on the contaminated clone, 16 unrelated live document rows present throughout):

| what | command | result |
|---|---|---|
| the whole file | `node --test tests/rollback-preflight.test.mjs` | **33 / 33 pass, 0 fail, 0 skip** (was 32/33) |
| the same, as the Linux runner | `wsl … /opt/node/bin/node --test tests/rollback-preflight.test.mjs` | **33 / 33 pass** |
| the other real `censusUnboundTasks` caller | `node --test tests/queue-drain.test.mjs` | **6 / 6 pass** |
| vacuity control | `lib/rollback-preflight.mjs` reverted to `ffe63a0dd08`, same file re-run | **RED for the right reason** — `an ABSENT documentTaskIds key narrows the document half to none, whatever is live; got [… 18 rows …]`, 3 cells red in total; library restored byte for byte (`git diff HEAD -- packages/runtime/lib/rollback-preflight.mjs` empty) |

The AC3 cell (`B3 — two sources sharing one task_kind …`) and the AC1 cell were already
contamination-tolerant and were not touched.

---

## SPEC-1018-01 — major — FIXED (converted, not excused)

**The claim.** `packages/runtime/tests/body-census-guard-db.test.mjs` still carried its own
`LOCAL_HOSTS` + `ALLOWED_DB` + parsed-DSN copy of the identical gate. It spawns the built image
against a real World, CI runs it as a World leg exactly like the 23 drivers
(`.github/actions/db-live-gates/action.yml:586`), and the census's documented exclusions never
mentioned it — while `packages/runtime/README.md` claimed a driver "can never again carry a second,
disagreeing copy".

**Reproduced.** The census cell added for it named the file precisely before the conversion:
`body-census-guard-db.test.mjs: does not import ./local-db-gate.mjs; still declares its own local
ALLOWED_DB; still declares its own local LOCAL_HOSTS; never calls isLoopbackHost — the import would
be dead; never calls dsnAgreesWithEnv — the import would be dead`.

**The fix — converted.** The file now composes the shared module's own checks
(`isLoopbackHost` + `allowedDbPattern(RT_TEST|WAVE_B_CI).dbRegex` + `dsnAgreesWithEnv`) in its
`gateReason()`, and its skip message is now DERIVED (`describe()`) instead of hand-typed. It does
NOT call `assertLocalDbGate`, and that is the reason it is a separate roster entry rather than a
24th driver: a `node --test` file must DECLINE (skip, reason printed) rather than throw, because a
thrown gate fails the file instead of declining it. `local-db-gate-drivers-census.test.mjs` carries
it as `SKIP_GATED_WORLD_TESTS` and censuses it on exactly those calls.

**Its admitted set is unchanged — checked mechanically, not read.** The base
`/^clara_(rt_test|wave_b_ci)$/` and the composed `allowedDbPattern(…).dbRegex` agree on **all 19**
names of a corpus (both admitted names, `clara_intake_ci`, `clara_l10`, `clara_l10_f660`,
`clara_711`, both `_world` variants, `clara_prod`, prefix and suffix near-misses, a case variant,
an embedded newline, empty). The file's old inline `worldDsnAgrees()` and the shared
`dsnAgreesWithEnv()` agree on **all 9** DSNs of a corpus (loopback host forms, a query string, a
remote host, the `postgresql:` scheme, a database mismatch, a non-URL, a missing port).

**Evidence.**

| what | command | result |
|---|---|---|
| the converted file, FOR REAL, on an admitted database | a `clara_l10` clone named `clara_rt_test`, own World bootstrapped, built image present; `node --test tests/body-census-guard-db.test.mjs` | **4 / 4 pass, 0 skipped** |
| the same, as the Linux runner | `wsl … /opt/node/bin/node --test tests/body-census-guard-db.test.mjs` | **4 / 4 pass, 0 skipped** |
| it still DECLINES rather than throws | same file on `clara_l10_f660` (a non-admitted name) | **4 skipped**, `[637.s5] SKIPPING the world-guard cells — needs a loopback PGHOST and PGDATABASE matching clara_(rt_test\|wave_b_ci) (it boots a REAL world)` |
| the census | `node --test tests/local-db-gate-drivers-census.test.mjs` | **8 / 8 pass** (was 4 cells) |

Docs in the same commit: `packages/runtime/README.md`'s #1018 section now describes the twenty-
fourth file and why it is censused differently, and `tests/local-db-gate.mjs`'s header says the
same. The "can never again" sentence is now true of every World-spawning file in the package, and
says so with the roster that makes it true.

---

## SPEC-1018-02 — minor — FIXED

**The claim.** AC3's census was a hand-maintained 23-name roster keyed on two exact identifier
names, so a new driver, or a renamed constant, was out of scope by construction.

**Both halves fixed.**

1. **The roster is derived.** `deriveDriverRoster(readdirSync(dir))` takes every `*-e2e.mjs` in
   `packages/runtime/tests` minus the two documented non-gate files (`shutdown-e2e.mjs`,
   `world-e2e.mjs`, now a named `NON_GATE_E2ES` constant) and a cell asserts the derived set equals
   the written `DRIVERS`. A `*-e2e.mjs` added tomorrow reds the census on its first day: whoever
   adds it must convert it or name it with a reason.
2. **A renamed copy is caught.** A local `const <anything> = /^clara_…/` is now a census reason
   naming the identifier. (`ALLOWED_DB` is excluded from that rule only because it already has its
   own, more specific reason — one defect, one reason.)

**Vacuity controls, both restored byte for byte afterwards:**

- dropping `work-journal-e2e.mjs` from `DRIVERS` → `not ok 6 — the driver roster is DERIVED from
  the directory…`, 7/8;
- stubbing the renamed-regex rule to `null` → `not ok 2 — RENAMING the copy does not hide it…`,
  7/8.

---

## SPEC-1028-01 — minor — FIXED

**The claim.** The new disjointness branch re-spelled the estate's liveness predicate as a
Work-status set, dropping the committed-receipt arm of `clara._intake_batch_live_children`, so a
parent the belt settled CORRECTLY could still red as "the belt settled it prematurely".

**Confirmed against the live definition.** Read off `clara_l10`:

```sql
where m.batch_id = p_batch and m.work_id is not null
  and w.status not in ('completed','refused','failed','cancelled','expired')
  and not exists (select 1 from clara.operation_receipts o
                   where o.work_id = m.work_id and o.outcome = 'committed')
```

The leg carried only the status half. A child holding a committed receipt while its Work status is
still non-terminal is out of the belt's hands but was counted as live — a latent false red saying
the exact opposite of the truth.

**The fix.** LEG 4 now asks the estate. One reading,
`liveChildrenOf(batch) → select member_id, work_id from clara._intake_batch_live_children($1)`,
backs all three places that used the status set: the `engine_wins` fault's wait, the "honestly
still stopping" branch, and the disjointness assertion — so what the fault waits for and what the
assertion checks cannot drift apart. `TERMINAL_WORK` is gone.

Two things improved with it, both small:

- the "honestly still stopping" branch used to PRINT "a live child remains" without ever reading
  one (the wave-3 rule that a door's behaviour is stated only after it was driven). It now reads the
  same predicate and prints the rows: `2 live child(ren) remain: [{member_id…, work_id…}, …]`;
- the failure tail carries the live rows beside the raw child statuses it already carried, and the
  `engine_wins` log lines no longer say "children reached terminal" for a check that is about
  liveness.

**Nothing the leg proves is weakened.** A genuinely live child still returns a row and still reds.
The refusal-counting and attribution assertions — the belt-regression net — run before this check
and are untouched.

**Evidence** — four runs of `node scripts/ci/world-gate.mjs tests/intake-batch-e2e.mjs` under WSL
(Ubuntu, user `runner`, `/opt/node/bin/node` v22.23.2) on throwaway `TEMPLATE clara_l10` clones,
each with a freshly bootstrapped World, all dropped afterwards:

| db | fault | result |
|---|---|---|
| `clara_721` | none | **ALL LEGS PASSED**, exit 0, peak RSS 971 MB of the 2048 MB budget — `LEG4 firm P is honestly still stopping — 2 live child(ren) remain: [{"member_id":"17ba6bf0-…","work_id":"cf41a09e-…"},{…}]` |
| `clara_724` | none | **ALL LEGS PASSED**, exit 0, peak RSS 889 MB, same line |
| `clara_722` | `engine_wins` | **ALL LEGS PASSED**, exit 0 — the race recorded, not thrown |
| `clara_725` | `engine_wins` | **ALL LEGS PASSED**, exit 0, peak RSS 939 MB — `LEG4 FAULT engine_wins: firm P has NO live child left after 4396ms` then `parent reached 'cancelled' with NO live child left by the estate's own reckoning (the #1028 race, not a belt defect) — refusals were still COUNTED (2) and ATTRIBUTED (blocked=1, door read canceller_not_active during polling)` |
| `clara_723` | **vacuity control**: the `cancelling` branch forced off (`if (false)`) so the assertion runs while both children are live | **RED**, exit 1 — `firm P's parent was declared done while it still had a LIVE child — the belt settled it prematurely, which IS the defect this leg exists to catch`, with both live rows named. Restored byte for byte. |

Docs in the same commit: `packages/runtime/README.md`'s #1028 block gains the predicate paragraph
and these runs, and its stale quotes of the two log lines are updated.

**Note on the door used.** `clara._intake_batch_live_children` is `SECURITY DEFINER` with
`EXECUTE` granted to `clara_fn_owner` only; the leg reaches it through `rig.rootQuery`, which is the
`PGUSER=postgres` superuser both on this rig and in CI (`.github/actions/db-live-gates/action.yml`
sets `PGUSER: postgres`). The leg already reads `clara.accounting_work` and writes
`clara.firm_memberships` through that same identity, so this adds no new privilege assumption.

---

## SPEC-1023-01 — minor — FIXED

All three onboarded drills' own headers asserted, one line under the by-hand recipe #1023 wired
into CI, that no CI leg existed ("There is no CI leg for this file yet", "has no CI leg", "No CI
leg exists for this file yet"). Each now names its own step, its throwaway database and the job
that reaches it, and says the by-hand recipe and the CI leg target the identical name:

- `packages/db/tests/checkout-convergence-upgrade.test.mjs` → `0186 checkout-convergence upgrade
  drill (isolated DB)`, `clara_0186_upgrade_ci`;
- `packages/db/tests/rig-runtime-upgrade.test.mjs` → `Slice-4 runtime upgrade/cutover drill
  (isolated DB)`, `clara_runtime_upgrade_ci`;
- `packages/db/tests/wave-a-upgrade.test.mjs` → `Wave-A 0011 fresh-vs-upgrade parity drill
  (isolated DB)`, `clara_waveA_upgrade_ci`.

`packages/db/tests/README.md`'s #845 acceptance-#3 paragraph carried the same present-tense claim
("3 of the 14 files have no CI leg anywhere") two paragraphs above its own "#1023 closed that gap";
it now reads as the record of #845's state that it is.

Comments only, no test body touched. The #1023 cells cite three header recipe lines by number
(`:16`, `:9`, `:8`) — all three are unmoved, verified, because every edit is below them.

**Evidence**: `node --test --test-concurrency=1 $GATES tests/reset-gate-routing.test.mjs` on
`clara_l10` → **8 / 8 pass** at that commit; the three drills themselves under the same gate chain
and no reset flags → **6 skipped, 0 failed** (the headers are comments; nothing at import time
changed).

---

## SPEC-1023-03 — note, "fragile evidence" — FIXED (small, and clearly better)

The reviewer left this optional. It was two lines, and the failure mode is silent, so it is fixed.

`stepInvoking` split the composite action on `- name:` and took the first chunk containing
`tests/<file>` ANYWHERE. A chunk carries the comment block that precedes the NEXT step, so the first
future comment naming a drill above an unrelated step would have handed every assertion below it
the wrong step — and the wrong chunk can satisfy the flag assertions, so only the PGDATABASE
equality would red, with a message pointing at the drill rather than at the mismatch. It was correct
today by luck of the current prose, not by construction.

**RED FIRST.** A new cell feeds `stepInvoking` a synthetic action in which a comment naming
`tests/wave-a-upgrade.test.mjs` sits above the step that actually runs it. With the old matcher:
`not ok 6 … the step returned must be the one whose run: block invokes the drill`. The matcher now
requires ONE LINE carrying both `node --test` and `tests/<file>` — the thing that runs the drill —
and the cell passes.

**Evidence**: `node --test --test-concurrency=1 $GATES tests/reset-gate-routing.test.mjs` on
`clara_l10` → **9 / 9 pass** (5 #845 cells, the new locator cell, 3 #1023 coverage cells; the three
coverage cells still resolve the same three real steps and their PGDATABASE assertions still hold).
`packages/db/tests/README.md`'s #1023 paragraph says how a step is located and why.

---

## STD-1018-01 — minor, evidence-accuracy — FIXED in the report

`reports/wave3-lane10-ticket1018.md` claimed `local-db-gate.test.mjs` → 14/14 and a combined 18/18
(14 unit + 4 census). Measured on this rig at review time: the file declares 10 top-level `test(`
cases, `node --test tests/local-db-gate.test.mjs` prints `# tests 10 / # pass 10`, the census file
printed 4, and the two together printed 14. Every cell genuinely passes; only the arithmetic was
wrong.

The three claims in that report are corrected in place, each marked as a fix-round correction
citing STD-1018-01. The gates-table entry also records that this fix round then added 4 census
cells, so the same command now prints **18/18 (10 unit + 8 census)** — the same number the report
originally claimed, by a different and now-true route, which is exactly the kind of coincidence
worth writing down rather than leaving for a later reader to trip over.

**One note on scope**: `reports/wave3-lane10-ticket1018.md` lives in the main checkout, which this
lane is otherwise told not to touch. The correction is confined to that one report file, in the
same `reports/` directory as this one, and to the three count claims plus their correction notes;
no tracked file in the main checkout was touched (`git status` there is unchanged: the same two
modified files and the same untracked paths as at session start, all of them pre-existing and none
of them mine).

---

## Notes the review recorded and this round did NOT change, with the reason

- **SPEC-1023-02 (AC2, "All three pass in CI")** — still open, and not closeable from a lane. The
  `closed-wave-drills` job is reached only by `schedule` or `workflow_dispatch`
  (`.github/workflows/ci.yml`), and this lane may not write to GitHub. **Integrator action**:
  dispatch it once and record the three steps' results and durations before AC2 is ticked; the
  0186 drill replays 0001→0185 and its wall-clock cost against the job's 120-minute timeout is
  still unmeasured.
- **SPEC-1028-02 (two sequential reads)** — accepted by the reviewer as inherent to the sanctioned
  "make the assertion precise" option. Unchanged. The window is between reading the parent's state
  and reading its live children; closing it would mean a single transaction over a door and a
  function the leg is not meant to compose, for a race whose two outcomes are both already recorded
  honestly.
- **SPEC-1016-01 (`eta-behaviour-phase.mjs`'s `CEREMONY_EXCLUDED_PAIRS` names two of the three
  "ships dark" evaluators)** — not fixed, deliberately. The reviewer charges it to no ticket: it is
  outside #1016's ACs (a ceremony flip, not the verifier's count), it predates this branch, and
  changing which evaluators that battery's blanket sweep deploys is a behaviour change in another
  battery that work-order rule 5 says a lane does not widen into. **Worth a `needs-triage` ticket**
  so `delta-`, `epsilon-` and `eta-`'s "ships dark" sets are one answer; this lane cannot file it.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| `rollback-preflight.test.mjs` (Windows, World clone with 16 contaminating rows) | `node --test tests/rollback-preflight.test.mjs` | **33 / 33 pass, 0 fail, 0 skip** |
| the same, as the Linux runner | `wsl … /opt/node/bin/node --test …` | **33 / 33 pass** |
| `queue-drain.test.mjs` | `node --test tests/queue-drain.test.mjs` | **6 / 6 pass** |
| `local-db-gate.test.mjs` + `local-db-gate-drivers-census.test.mjs` | `node --test` both, from `packages/runtime` | **18 / 18 pass** (10 unit + 8 census) |
| the same, as the Linux runner | `wsl … /opt/node/bin/node --test …` | **18 / 18 pass** |
| `body-census-guard-db.test.mjs` on an admitted database (real World, built image) | `node --test tests/body-census-guard-db.test.mjs`, `PGDATABASE=clara_rt_test` | **4 / 4 pass, 0 skipped** (Windows and WSL runner both) |
| `intake-batch-e2e.mjs` LEG 4 | `world-gate.mjs`, 4 runs under WSL (2 clean, 2 `engine_wins`) | **ALL LEGS PASSED ×4**, exit 0, peak RSS 889–971 MB of the 2048 MB budget |
| the same leg's vacuity control | `if (false)` on the `cancelling` branch, `clara_723` | **RED, exit 1**, restored byte for byte |
| `reset-gate-routing.test.mjs` | `node --test --test-concurrency=1 $GATES …` on `clara_l10` | **9 / 9 pass** |
| the three onboarded drills, no reset flags | same gate chain | **6 skipped, 0 failed** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs`, never with the reset flags | same gate chain on `clara_l10` | **33 tests, 32 pass, 0 fail, 1 skip** (the expected skip; matches the standards reviewer's own baseline) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | **exit 0**, full chain |
| typecheck | `pnpm typecheck` (worktree root) | **exit 0** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen file(s), no manifest diff, 3 retired entries recorded** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable |
| working tree | `git status --porcelain` | empty at `c3cb533db` |

`apps/web` suites were not run: this lane touches no `apps/web` file, at review time or now.

## Docs updated (in the same commits)

- `packages/runtime/README.md` — the #1018 section (derived roster, the renamed-regex rule, the
  twenty-fourth file and why it is censused differently) and the #1028 block (the estate predicate,
  the corrected log-line quotes, the new runs).
- `packages/runtime/tests/local-db-gate.mjs` — header: the skip-gated file and how it uses the
  module without `assertLocalDbGate`.
- `packages/db/tests/README.md` — the #845 acceptance-#3 paragraph de-staled; the #1023 paragraph
  says how a step is located and why.
- Three drill headers (`checkout-convergence-upgrade`, `rig-runtime-upgrade`, `wave-a-upgrade`).
- `CONTEXT.md` — not touched: no new product or accounting vocabulary in this round.

## Rig left as found

Throwaway databases created and **all dropped**: `clara_l10_f660` and `clara_rt_test` (World
clones for the two runtime files), `clara_721`–`clara_725` (the LEG 4 runs).
`select datname from pg_database where datname like 'clara%'` on port 55750 now returns
**`clara_l10` alone**. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no
second from-scratch chain was run; no `git worktree` subcommand, `git gc` or `--depth` fetch was
run, and git was never run from WSL.

`clara_l10` itself: no World (`to_regclass('workflow.workflow_runs')` is null), 267 migrations,
and still the **16** live queued `document_processing_tasks` rows it carried at review time — my
`packages/db` gate runs added none. They are deliberately left in place: they are the contamination
that reds the pre-fix #1015 cell, and leaving them means the next person to run
`rollback-preflight.test.mjs` against a clone of this database is running the case the blocker was
about.

## Follow-ups worth filing (this lane cannot file them)

1. **`eta-behaviour-phase.mjs`'s "ships dark" set** — SPEC-1016-01 above. `needs-triage`.
2. **Dispatch `closed-wave-drills` once** — SPEC-1023-02 above. Integrator action, not a ticket.
3. **The stale-`.output` trap**, carried over from the #1028 ticket report and still true: a lane
   running a World-booting leg against a worktree whose `packages/runtime/.output` predates its own
   HEAD gets a false LEG 5 red. This round did not need a rebuild (the bundle at
   `2026-09-23 15:28` postdates every source file in the lane, and the four LEG runs and the
   `body-census-guard-db` runs all exercised it green), but the trap is unchanged. A wave-3
   addendum line in `RIG.md` would close it.

## Anything unverified

- **AC2 of #1023 ("All three pass in CI")** — the wiring is proved structurally, the destructive
  bodies have still never run on a runner. SPEC-1023-02.
- **The #1028 belt-regression vacuity control was not re-run in this round.** The #1028 implementer
  ran it (`fanOutCancel` rewritten so a CLR04 refusal records as a success → red at the P-loop's own
  refusal deadline, `refusals=0 blocked=0`, `clara_705`) and I did not repeat it, because it
  requires editing a tracked library file and because the assertions it exercises run BEFORE the
  code this round changed and are byte-identical to what it tested. Stated as accepted-not-re-run
  rather than as evidence of mine.
- **Five consecutive clean runs (#1028 AC5)** were not repeated in full: four runs (two clean, two
  faulted) plus the vacuity control were judged proportionate to a predicate change inside an
  already-proved branch. If the integrator wants AC5 restated against the new predicate, it is five
  more `world-gate.mjs` runs on fresh clones.
