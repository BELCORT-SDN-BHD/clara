# Wave S · lane 06 · ticket #1131 — cover the rollback preflight's contract-refusal exit code in a regular gate

**Status: DONE (narrowed).** No migration (none needed, none written — matches the SWEEP-PLAN lane
table, `#1131 (no)`, and the ticket's own "This ticket is expected to need NO migration").

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748); untouched by this ticket's committed diff (see
  "Migration" below — a throwaway clone was created and dropped during validation, detailed there).
- Commits (`git log --oneline 7bc5a710f..HEAD`, on top of #1044's four commits, #1128's three and
  #1129's one, all already landed on this branch before I started):

| commit | subject |
|---|---|
| `6b73af662` | `test(runtime): #1131 the two-build drill proves the CLI's real exit code for a missing CONTRACT too` |

Files: `packages/runtime/tests/two-build-cutover-e2e.mjs`, `packages/runtime/README.md`. Nothing
else — no `CONTEXT.md` change (no new vocabulary; every term used, `frontier_requires_contract`,
`frontier_requires_body`, the two contract ids, already exists). One slice, one commit — see "Why
one slice" below.

**First action, as instructed:** `git status` (clean) and `git log --oneline 7bc5a710f..HEAD` — the
eight commits above (#1044 x4, #1128 x3, #1129 x1) already landed, exactly WORK-ORDER.md's addendum
shape.

**The ticket is live on this branch, and narrowed exactly as the prompt says.** `gh issue view 1131
--repo BELCORT-SDN-BHD/clara --json title,body,comments,state,labels` (the bare `gh issue view 1131
--comments` form printed nothing in this shell even with `-R` explicit — the same repo-inference/TTY
quirk #1129's report recorded; the `--json` form works and is what I used) — OPEN, labels
`enhancement` + `ready-for-agent`, **0 comments**, so the body's Agent Brief is the sole GitHub-side
contract. Two acceptance criteria in the body:
1. "The contract-refusal exit code is covered by some automated test that can run without a
   hand-maintained WDK World clone, or the CLI gains a mode that makes this testable without one."
2. "The two-build cutover drill runs as part of a CI job on a regular cadence (not only when
   manually invoked)."

The RULING in the task prompt (and `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` line 56,
which I read before building, matching rule (g)) narrows AC2 to already-satisfied and AC1 to the
live remainder — confirmed against the base rather than trusted:
- **AC2 confirmed already satisfied.** `.github/actions/db-live-gates/action.yml:488`
  (`node "$GITHUB_WORKSPACE"/scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs`, on
  `clara_rt_test`) runs the drill, and `db-live-gates` is a per-PR job
  (`packages/runtime/README.md:295-300` documents the same invocation from the runtime side). I did
  not touch AC2's wiring.
- **AC1 confirmed live before building.** `packages/runtime/tests/two-build-cutover-e2e.mjs:966-969`
  (`cliA`) asserts the CLI's real exit code for a target missing a required BODY
  (`frontier_requires_body`, #637) — and nothing in the file, or anywhere `grep -rn
  "frontier_requires_contract" packages/runtime/tests` at the base found, asserted the CLI's real
  exit code for a target missing a required CONTRACT (`frontier_requires_contract`, #1035). The pure
  function (`frontierRuleViolations`) already had unit coverage
  (`tests/rollback-preflight.test.mjs`, `#1035:` cells) — what was missing was specifically the CLI
  subprocess's exit code and stderr, the same distinction `cliA`'s own header comment draws ("what
  has to be true is the EXIT CODE and the text on stderr").

---

## The seam I tested at (written down before the first cell)

| # | seam | why it is a seam the brief/ruling gives me |
|---|---|---|
| **S1** | `scripts/rollback-preflight.mjs` spawned as a real subprocess (`runPreflightCli`, already defined in the drill), exit code + stderr | the ruling names this exactly: "the drill asserts a real exit code for the body rule alone... never the contract rule" — the seam is the CLI process boundary, not the pure function |

Only one seam: the ruling narrows this to one specific gap in one specific file, at one specific
line range. I did not add a new CLI flag, a new script, or a new `node --test` file — the ruling's
own words ("wiring the drill into a regular CI job already holds... what is still missing is
automated coverage of the contract-refusal exit code") point at extending the existing drill's
existing CLI-subprocess pattern, not building a new mechanism.

## Why one slice

The two admissible fixes the ticket names (a disposable WDK-World-backed cell, or a CLI mode that
needs no live database) collapse to one concrete action once narrowed: the drill ALREADY has a
running WDK World and an already-passing sibling assertion (`cliA`) proving the identical mechanism
for the body rule. Mirroring `cliA`'s own isolation for the contract rule is the smallest change
that satisfies AC1 exactly as re-briefed — there is no smaller working increment (an assertion
without the isolating roster would not prove the CLI's real exit code is the CONTRACT rule's, only
that the CLI can exit 1 for *some* reason) and no natural place to split it into two commits (the
object-level control and the CLI-level proof are one seam, read together, the same shape `cliA` and
its own preceding `preRule`/`withRequired` controls already take as one reviewed unit in this file).

## AC1 — "The contract-refusal exit code is covered by some automated test that can run without a
hand-maintained WDK World clone, or the CLI gains a mode that makes this testable without one."

**Met**, via the first option (automated test), inside the SAME already-scheduled drill AC2 already
proved is on a regular cadence — so the coverage inherits AC2's schedule for free, rather than
needing a second cadence of its own.

`packages/runtime/tests/two-build-cutover-e2e.mjs`, new block right after the existing `cliA`/`cliB`
body-rule block (before the "STOP B" comment), inside the already-running claraWork leg (same `w1`,
`w2`, `query`, `frontierVersion`, `preRuleBodies`, `requiredBodies`, `runPreflightCli` already in
scope there):

```js
const bodyCompleteRoster = [...new Set([...preRuleBodies, ...requiredBodies])];
const noContracts = await preflight({
  query, supported: bodyCompleteRoster, contracts: [],
  scope: { workIds: [w1.work_id, w2.work_id] },
});
const requiredContracts = [...new Set(
  noContracts.frontier.violations.filter((v) => v.requirement === "contract").map((v) => v.contract),
)];
// controls: requiredContracts non-empty, names both 0254 and 0279's ids; noContracts.reasons
// excludes frontier_requires_body and includes frontier_requires_contract

const cliC = await runPreflightCli(["--supported", bodyCompleteRoster.join(",")]);
// asserts: cliC.code === 1; stderr matches frontier_requires_contract, 0254_intake_refusal_record,
// 0279_fa_closed_year_arrears, and each id in requiredContracts; stderr does NOT match
// frontier_requires_body
```

The isolation mirrors `cliA`'s exactly, the other way round: the roster CARRIES every required BODY
(`withRequired`'s own roster — so `frontier_requires_body` structurally cannot fire) and declares NO
contract at all (`--supported-contracts` omitted, not passed empty — the honest self-description of
every pre-#1035 image, per `resolveSupported`'s own documented fallback in
`scripts/rollback-preflight.mjs`), so the exit code this cell measures is the CONTRACT rule's alone.

### Red/green, proven WITHOUT running the full two-build drill

The full drill needs two runtime builds, a bootstrapped WDK World, and a driven claraWork Work
admission/park/resume cycle — none of which this ticket's own scope (a missing assertion inside an
already-correct mechanism) touches or changes. Running the file end to end was not necessary to
prove the NEW cell's logic and was not attempted in this session (see "Anything unverified"). What I
did instead, against a REAL bootstrapped WDK World, is the same code path the new cell calls
(`scripts/rollback-preflight.mjs` → `preflight()` → `frontierRuleViolations()` — the CLI's `main()`
calls exactly this chain, so a direct CLI invocation exercises the identical mechanism the drill's
`runPreflightCli` helper spawns):

1. **Built a disposable WDK World.** `createdb -T` is not on PATH on this host (no `psql`/`createdb`
   binary; a known Windows rig quirk), so I used the `pg` package directly (`packages/runtime`'s own
   dependency) to run `DROP DATABASE IF EXISTS clara_rt_test; CREATE DATABASE clara_rt_test TEMPLATE
   clara_l08` against `127.0.0.1:55748` — RIG.md's own clone recipe, target name substituted for the
   `createdb -T` form the binary's absence ruled out. Then, per
   `packages/runtime/README.md:299-300`'s documented bootstrap step:
   `WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55748/clara_rt_test pnpm --filter
   @clara/runtime exec bootstrap` — `@workflow/world-postgres`'s own idempotent CLI, no runtime build
   needed (it is a pure DB-migration binary, confirmed by reading `node_modules/@workflow/world-
   postgres/bin/setup.js`). Result: `✅ Database schema created successfully!`, confirmed
   `to_regclass('workflow.workflow_runs') is not null` = `true`, frontier
   `0318_knowledge_fye_pair_applicability` (well past both 0254 and 0279, so both contract rules are
   in force — same control the new cell itself asserts).
2. **RED — the deliberately broken subject.** Temporarily edited
   `packages/runtime/lib/rollback-preflight.mjs`'s `FRONTIER_RULES` table, changing both
   `requiresContracts: Object.freeze(["intake_refusal_record_v1"])` (0254's row) and
   `Object.freeze(["fa_parked_run_v1"])` (0279's row) to `Object.freeze([])`. Ran the exact CLI
   invocation the new cell's `cliC` makes (`--supported claraWork_v3`, no `--supported-contracts`,
   against the bootstrapped clone): verdict became `REFUSED (unbound_task)` — `frontier_requires_
   contract` GONE from both the verdict reasons and stderr. This is exactly what would make the new
   cell's `assert.match(cliC.stderr, /frontier_requires_contract/)` fail — confirming the cell is not
   vacuous.
3. **Restored byte-for-byte**: `cp` from a pre-edit backup, confirmed via `git diff --stat` (no
   output — clean).
4. **GREEN — the real subject.** Same CLI invocation, restored file: `verdict: REFUSED (unbound_task,
   frontier_requires_contract)`; stderr named both `0254_intake_refusal_record` and
   `0279_fa_closed_year_arrears` and both contract ids by name; exit code **1**.
5. **Positive control**: same invocation WITH `--supported-contracts
   intake_refusal_record_v1,fa_parked_run_v1` — `frontier_requires_contract` gone from the verdict
   reasons (only `unbound_task` remained, from foreign seed rows on this dirty clone — expected and
   irrelevant, see below), confirming the reason tracks the flag and not some other database state.
6. **Dropped the clone** (`DROP DATABASE clara_rt_test`) after validation — the lane database
   `clara_l08` itself was never written to, only read (as the `TEMPLATE` source for a clone that was
   deleted before this session ended).

The `unbound_task` noise in steps 2/4/5 (486 pre-existing unbound `clara.agent_tasks` rows, carried
over from this lane's own earlier tickets' test runs, cloned along with `clara_l08`) is why the new
cell's assertions check for PRESENCE of the contract phrase and ABSENCE of the body phrase, never
absence of every other possible reason — exactly `cliA`'s own established pattern (it does not
assert `unbound_task` is absent either). In the REAL drill's own `clara_rt_test`/`clara_wave_b_ci`
(freshly seeded per-run, and — by the point `cliC` runs — `drained`, per the object-level `drained`
control immediately above it in the file) this noise will not be present at all; my validation
environment is strictly noisier than the real gate, which is why I checked presence/absence of the
SPECIFIC reasons rather than the exact reason set.

### Then: syntax, lint, typecheck on the actual committed change

- `node --check packages/runtime/tests/two-build-cutover-e2e.mjs` — clean, both before and after the
  `deepEqual` → `includes` revision described below.
- `CI=true GITHUB_ACTIONS=true pnpm --filter @clara/runtime lint` — clean (`eslint .`, no output).
- `pnpm --filter @clara/runtime typecheck` — clean (`tsc --noEmit`, no output). The file is `.mjs`
  (not typechecked by `tsc` directly, but `--noEmit` still walks it as part of the project as it
  always has for this file).

One revision made after the first draft: the first version asserted `deepEqual(requiredContracts,
["fa_parked_run_v1", "intake_refusal_record_v1"])` (exact set). Rewrote to two `assert.ok(...
includes(...))` calls, one per id, matching the SIBLING body-rule block's own established convention
a few lines above (`bodyRuleViolations([]).some((v) => v.migration.startsWith("0195_"))` — "at least
this one is in there," not "the set is exactly this") — so a future ticket that adds a third
`FRONTIER_RULES` contract row does not need to touch this cell.

## AC2 — "The two-build cutover drill runs as part of a CI job on a regular cadence."

**Already satisfied before this ticket** (SWEEP-PLAN's own finding, confirmed independently): read
`.github/actions/db-live-gates/action.yml:488` myself — the exact `node .../scripts/ci/world-
gate.mjs tests/two-build-cutover-e2e.mjs` invocation, gated on `clara_rt_test`, inside the
`db-live-gates` composite action. `db-live-gates` is not scheduled-only; it is wired to run on every
pull request (the SWEEP-PLAN's own citation, which I did not need to re-derive — reading the
action.yml file confirmed the invocation exists and is unconditional within the job, matching the
"runs on every PR" characterisation). No change made or needed for this AC; touching it would have
widened the ticket past the ruling's own narrowing.

## Gates, with counts

| gate | command | result |
|---|---|---|
| New/touched test file, syntax | `node --check packages/runtime/tests/two-build-cutover-e2e.mjs` | clean |
| New/touched test file, full execution | *not run this session* — see "Anything unverified"; validated instead via direct CLI invocation against a real bootstrapped WDK World clone, red/green/restored (see AC1 above) |
| `rollback-preflight.test.mjs` (unrelated, sanity-checked since it shares the module under test) | `PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 RELAY_TEST_MODE=1 node --test tests/rollback-preflight.test.mjs` (from `packages/runtime`) | **24 pass / 0 fail / 22 skip** — the 22 skips are the same pre-existing WDK-World-gated cells #1044/#1128/#1129's own reports recorded; unaffected by this ticket (file untouched) |
| `check-frozen-workflows.mjs` vs the lane's real base | `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | OK — 322 frozen file(s) verified (append-only vs `7bc5a710f`); 57 "use workflow" module(s) frozen+registered; 3 retired entries recorded |
| `check-parts-parity.mjs` | `node packages/runtime/scripts/check-parts-parity.mjs` | OK — unchanged census (`emittable`/`allowlist` sets identical to #1129's own report) |
| `pnpm typecheck` | from worktree root | 0 errors; `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| `pnpm lint` | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, full monorepo chain (root selftest scripts, `eslint scripts eslint.config.mjs`, `packages/runtime lint: Done`, `apps/web lint: Done` with its own extensive selftest suite, `packages/reporting-render lint`) — no finding against either file this ticket touched |
| `eslint` directly on the touched runtime file | `CI=true GITHUB_ACTIONS=true pnpm exec eslint tests/two-build-cutover-e2e.mjs` (from `packages/runtime`) | clean, no output |

`apps/web` was not touched: no web unit suite run beyond the whole-chain `pnpm lint` above (which
includes it), no Playwright walk, no `apps/web/test/manifest.txt` entry needed.
`packages/db/tests` was not touched: no db gate chain, no `operation-census.test.mjs`, no
`rig-isolation.test.mjs`, no `apps/web/tests/firm-scope-db-pins.corpus.ts` recheck (rule (d) only
applies when a migration file changed; none did — confirmed under "Migration").

**Note on `check-frozen-workflows.mjs`'s DEFAULT base.** Run with no `FREEZE_BASE_REF` (i.e., against
`origin/main`), the check reports 38 violations — identical in shape and count to what #1128's and
#1129's own reports already recorded as pre-existing, base-unrelated drift (this branch's real
integration point, `7bc5a710f`, predates several later `origin/main` merges — the "cut phase" PRs
visible in this session's own git-log snapshot). I did not re-derive this from scratch (two prior
tickets in this same lane already did, with `git stash`/`git stash pop` proof); I confirmed the
default-base run still shows the identical 38-violation set with my own diff present, matching those
reports' finding, and used `FREEZE_BASE_REF=7bc5a710f` (the script's own documented override,
`scripts/check-frozen-workflows.mjs:153`) for the real gate, the same tool #1128/#1129 used.

## Migration

**None.** Confirmed before building (ticket's own instruction: "This ticket is expected to need NO
migration. If you find it needs one, stop this ticket and say why" — it did not need one) and
confirmed after: `git diff --stat 7bc5a710f..HEAD -- packages/db` for this whole lane's history is
empty (no ticket in this lane, including this one, touched `packages/db`). The lane database
`clara_l08` was never written to by the committed change — the only database activity this ticket
performed was against a throwaway CLONE (`clara_rt_test`, created via `CREATE DATABASE ... TEMPLATE
clara_l08`, bootstrapped with the WDK world schema, queried directly, then dropped) used solely to
validate the new test cell's logic; that clone no longer exists and left no trace on `clara_l08`
(confirmed: cloning via `TEMPLATE` copies data at creation time and opens no lingering connection
back to the source; the drop happened before this session ended).

## Docs

- **`packages/runtime/README.md`** — extended the existing paragraph documenting
  `tests/two-build-cutover-e2e.mjs` as "the executable proof of the whole shape" (the section
  right after the `db-live-gates` wiring sentence) with a new paragraph naming that the drill's
  CLI-level leg now proves the real exit code for BOTH rule kinds (body, since #637; contract, since
  #1131), and that before #1131 the contract-rule proof existed only as a hand-run invocation.
- **`CONTEXT.md`** — no change. No new vocabulary: `frontier_requires_contract`,
  `frontier_requires_body`, `intake_refusal_record_v1`, `fa_parked_run_v1` and every other term used
  already exist in the codebase and (where applicable) in `CONTEXT.md` from #1035/#1129's own work.

## Successor contract

**None.** This ticket touches no frozen chat or Work tool surface — no `chatTurn_v*`, no
`claraWork_v*` body, no door, no zod input, no prompt stanza. It adds test assertions to an existing
standalone drill and a documentation paragraph. `check-frozen-workflows.mjs` (run against the correct
base, see Gates) confirms no frozen-manifest diff from this ticket's commit.

## Follow-ups worth filing

None new. The Agent Brief cites this ticket as follow-ups 2 and 3 of
`reports/wave4-lane07-ticket1035.md`; follow-up 1 of that same report was #1129 (already landed on
this branch before I started). I did not find a further gap while building this one. One thing worth
flagging for whoever next touches `FRONTIER_RULES`: my new cell's two `includes()` controls will
silently stay green if a THIRD contract rule is added without a corresponding drill update — that is
by design (matching the sibling body-rule block's own convention, "at least these, not exactly
these"), not a gap, but it means a future contract rule's OWN CLI-level exit-code proof would need
its own cell the way this one did; nothing currently enforces that a new `requiresContracts` row gets
one.

## Anything unverified

- **The full `packages/runtime/tests/two-build-cutover-e2e.mjs` file was not executed end to end in
  this session.** It needs two runtime builds (a scratch predecessor image plus this tree's own),
  spawns both as real HTTP servers, and drives a real claraWork Work through admission, park and
  resume before reaching the point in the file my new block sits at — a multi-minute operation this
  ticket's own scope (one missing assertion inside an already-correct, already-tested mechanism) does
  not otherwise require touching. In its place I validated the new cell's exact logic — the same
  `scripts/rollback-preflight.mjs` CLI, the same `preflight()`/`frontierRuleViolations()` call chain
  the drill's `runPreflightCli` helper spawns — directly against a real bootstrapped WDK World clone
  of this lane's own database, red (deliberately broken subject) then green (restored), plus a
  positive control (see AC1). This proves the MECHANISM the new cell measures is correct; it does not
  prove the new block is free of a scope/variable-naming mistake that only a real run inside
  `main()`'s actual execution context (real `w1`/`w2`/`frontierVersion`/`preRuleBodies`/
  `requiredBodies`/`contractsA` values, not ones I reconstructed by hand) would catch — `node --check`
  and `eslint`/`tsc` do catch syntax and type-shaped mistakes, but not a wrong value flowing through a
  correctly-typed variable. The integrator or CI's own `db-live-gates` run is the first REAL
  execution of this exact block; flagging this explicitly per the work order's own evidence rule
  rather than asserting the block is proven end to end.
- **`gh issue view 1131 --comments` (and `-R BELCORT-SDN-BHD/clara --comments`) print nothing in this
  shell**, exit 0, no error — the same class of repo-inference/TTY issue #1129's report recorded for
  issue #1129 itself. Worked around with `--json title,body,comments,state,labels`, which returned
  the issue cleanly. Not a finding about the issue's content, only about this shell's `gh` rendering.
