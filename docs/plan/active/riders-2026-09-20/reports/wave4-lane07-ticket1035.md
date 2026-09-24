# Wave 4 · lane 07 · ticket #1035 — the rollback preflight's door-contract rule

**Branch** `riders/w4-lane07` · **base** `cd2925391` · **worktree** `C:\Users\zhant\Desktop\clara-wt\657`
· **database** `clara_l07` @ 127.0.0.1:55747 (frontier `0295_wave4_chart_rows`, 289 files)

**Status: DONE.** No migration (none needed; none written).

## Commits (this ticket)

| sha | message |
|---|---|
| `f16566816` | `feat(runtime): #1035 an image declares the door contracts it understands` |
| `36d0b3355` | `fix(runtime): #1035 the rollback preflight refuses an image that misreads a door` |
| `a84401dc5` | `feat(runtime): #1035 /api/build-info reports the door contracts this image understands` |
| `3dc0b0184` | `test(runtime): #1035 both cutover drills hand the preflight their own contract roster` |
| `447ebacb7` | `docs(runtime): #1035 the preflight module header states both kinds of frontier rule` |

Tickets before mine on this branch (`#1041`, five commits, `aaf2cf21b`..`574d86e66`) were read and
left untouched.

## The ticket was still live

Verified on this branch before building: `packages/runtime/lib/rollback-preflight.mjs` held
`FRONTIER_BODY_RULES` with **one** row (`0195_work_egress_purpose_and_execution_trace` →
`claraWork_v3`) and no notion of a door contract anywhere in the module, the CLI or
`/api/build-info`. Nothing on this branch or in `#1041`'s commits had touched it.

## The seams I tested at (written before the first cell)

The brief names five; I added one more because the CLI printed a rule inline.

1. `FRONTIER_RULES` — the rule table, exported data from `packages/runtime/lib/rollback-preflight.mjs`.
2. `frontierRuleViolations(frontierVersion, {bodies, contracts}, rules)` — the pure rule evaluation.
3. `supportedContractsFromBundle(bundleText)` — the target-artifact read.
4. `preflight({query, supported, contracts, scope, frontier})` — the verdict object
   (`verdict`, `reasons`, `frontier.violations`, `frontier.contracts`).
5. `RUNTIME_CONTRACTS` / `RUNTIME_CONTRACT_IDS` (`packages/runtime/lib/runtime-contracts.mjs`) and
   `/api/build-info`'s `contracts` key via `buildInfo()`.
6. `frontierRefusalLines(result)` — **new pure export**. The CLI had the frontier refusal sentence
   inline, which is the duplication this module already warns about for `taskIsStranded` and
   `refusalFooterLines` ("a second inline copy of this rule can drift from the verdict"). Making it
   a pure function is what let "naming the rule and the migration" be asserted at a seam rather
   than by reading the CLI's source.

No cell was written at a seam the brief does not give.

## What I built, in one paragraph

An image now **declares** which door contracts it understands. `lib/runtime-contracts.mjs` holds
one entry per contract — a `marker` literal (`clara.contract//<id>`) the built bundle carries, the
`since` migration, and the `module` + `evidence` line that only exists when the behaviour does.
`FRONTIER_RULES` (renamed from `FRONTIER_BODY_RULES`; see *Deliberate choices*) is one table whose
rows carry `requires` (bodies) and `requiresContracts` (contract ids), and `frontierRuleViolations`
answers over both, tagging each violation `requirement: "body" | "contract"`. The verdict carries
`frontier_requires_contract` as its **own** reason beside `frontier_requires_body`. The CLI reads
the target's contract ids from the same artefact it already reads bodies from
(`--target-bundle`), from a running target's `/api/build-info` (`--target-build-info`), or, for the
typed escape hatch only, from `--supported-contracts`. An **absent** declaration reads as "does not
understand" — which is the whole point, because that is exactly what the two hosted windows were
pointed at.

## Acceptance criteria, each with its evidence

### AC1 — a bundle without the intake marker is REFUSED at frontier ≥ 0254, naming the rule and the migration, exit 1

- **Cell** `#1035: BELOW 0254 a marker-less target ALLOWS; AT 0254 it is REFUSED, naming the rule and the migration`
  (`packages/runtime/tests/rollback-preflight.test.mjs`). PASS. Asserts `verdict === "refused"`,
  `reasons === ["frontier_requires_contract"]`, `violations[0].migration ===
  "0254_intake_refusal_record"`, `violations[0].requirement === "contract"`,
  `violations[0].contract === "intake_refusal_record_v1"`, and that the `why` names the 201.
- **Exit 1, measured on the real CLI.** RIG's sanctioned clone recipe: `clara_rt_test` created
  `template clara_l07` on my own cluster, a minimal `workflow.workflow_runs` added (clara_l07 has
  no WDK World), CLI run, clone dropped — cluster confirmed back to `clara_l07, postgres,
  template0, template1`.

  ```
  WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55747/clara_rt_test \
    node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <55-body, marker-less>
  → EXIT=1
    verdict: REFUSED (unbound_task, frontier_requires_contract)
    clara.schema_migrations frontier: 0295_wave4_chart_rows
    rules checked: 0195_work_egress_purpose_and_execution_trace, 0254_intake_refusal_record, 0279_fa_closed_year_arrears
    contracts the target declares: (none declared)
      !! 0254_intake_refusal_record requires the intake_refusal_record_v1 door contract, which the target does NOT declare
      !! 0279_fa_closed_year_arrears requires the fa_parked_run_v1 door contract, which the target does NOT declare
  ```

### AC2 — ALLOWS a bundle that carries the marker at the same frontier, and ALLOWS a marker-less bundle below 0254

- Same cell: `frontierRuleViolations("0253_batch_cancel_reissue", {bodies:["claraWork_v3"], contracts:[]})`
  is `[]` and the preflight at `0253` answers `allowed`; at `0254` **with** the marker it answers
  `allowed` with `frontier.violations === []` and `frontier.contracts === ["intake_refusal_record_v1"]`.
- **Exit 0, measured on the real CLI**, same clone, same database, this tree's own real build
  (`pnpm --filter @clara/runtime build`, `.output/server/index.mjs`, 10,914,498 bytes):

  ```
  → EXIT=0 · frontier.version 0295_wave4_chart_rows
    frontier.contracts ["fa_parked_run_v1","intake_refusal_record_v1"]
    frontier.violations []   reasons []   supported bodies 55
  ```

- **The 0279 half**, cell `#1035: 0279's rule refuses a target that would count a PARKED
  depreciation run as a post`. PASS. Below 0279 no violation; at 0279 exactly one, naming
  `fa_parked_run_v1`; at `0295_wave4_chart_rows` still in force (`>=`, not `==`); with both markers,
  none.

### AC3 — the previous hosted image's shape (55 bodies, no marker) is refused at frontier 0272, reproducing 2026-09-23

- **Cell** `#1035: the previous hosted image's bundle shape — 55 bodies, no marker — is REFUSED at 0272`.
  PASS. `supportedBodiesFromBundle` reads 55, `supportedContractsFromBundle` reads `[]`, the verdict
  is `refused`, `reasons` includes `frontier_requires_contract` and **excludes**
  `frontier_requires_body` (that image carried `claraWork_v3` — which is exactly why the old
  command allowed it), and `violations.map(migration) === ["0254_intake_refusal_record"]` (0279 is
  not applied at 0272). The refusal lines are asserted to name the reason, the migration, the marker
  and the frontier.
- **The same case through the real CLI.** In the disposable clone I deleted the 22 ledger rows above
  `0272_document_capability_wall_completion` so the frontier read `0272`, then ran the CLI on the
  55-body marker-less bundle:

  ```
  → EXIT=1
    clara.schema_migrations frontier: 0272_document_capability_wall_completion
    contracts the target declares: (none declared)
      !! 0254_intake_refusal_record requires the intake_refusal_record_v1 door contract, which the target does NOT declare
    (0279 correctly NOT in force at this frontier)
  ```

  The 55 body names in the fixture are stand-ins (`claraWork_v1..v55`, which includes the
  `claraWork_v3` 0195 needs). What makes it the 2026-09-23 case is the **shape** — 55 bodies, every
  body rule satisfied, no marker — not the particular names; a transcribed real roster would go
  stale at the next cut without changing what is proven. Stated in the cell.

### AC4 — the rule table's selftest enumerates every rule and fails if one names a migration not in the chain

- **Cell** `#1035: every rule names a migration that EXISTS in the chain`. PASS. Reads
  `packages/db/migrations` from disk (never a hand-kept copy), asserts the chain read is plausible
  (`> 200` files) so the cell cannot pass vacuously, then asserts every `FRONTIER_RULES` row's
  `migration` is a file.
- **Vacuity control, run:** I changed the 0254 row to the spelling the ticket body uses,
  `0254_intake_ceiling_refusal_record` — three cells went red, including this one
  (`# pass 17 # fail 3`) — then restored `lib/rollback-preflight.mjs` byte for byte
  (`git status --porcelain` empty) and re-ran green (`# pass 20 # fail 0`).
  **Note for the record:** the real file is `packages/db/migrations/0254_intake_refusal_record.sql`;
  the ticket body's `0254_intake_ceiling_refusal_record` is not a file in the chain, and this cell
  is what catches that class of typo.
- Two further structural cells beside it: `#1035: the rule table is ONE table — the body rule and
  both door-contract rules stand in it together` (every row carries both requirement lists, requires
  something, states why, and is ordinal-comparable) and `#1035: THIS image satisfies every rule its
  own table carries` (a rule wanting a marker this tree does not declare would refuse the *forward*
  release too).

### The marker is not a promise — the vacuity control the whole mechanism rests on

- **Cell** `#1035: every marker names a module and a line of it that only exists when the behaviour does`
  (`packages/runtime/tests/runtime-contracts.test.mjs`). PASS. Reads each entry's `module` and
  asserts it contains the `evidence` string (`out?.refused === true` in `lib/intake.mjs`;
  `r?.status === "parked"` in `lib/reconciler-fa.mjs`).
- **Vacuity control, run:** I rewrote `lib/intake.mjs`'s refusal arm to `if (out && out.refused)`;
  the cell went red. Restored byte for byte (`git diff --stat` empty), green again.

### The markers survive into the real artifact — measured, not assumed

`pnpm --filter @clara/runtime build` (exit 0), then a scan of the produced
`packages/runtime/.output/server/index.mjs`:

```
bytes 10914498
markers found: ["fa_parked_run_v1","intake_refusal_record_v1"]
```

This is the load-bearing fact: a marker the bundler dropped would be a gate that silently never
fires. Cell `#1035: every marker this image declares is one the bundle scan reads back` pins the
roster↔scanner agreement in the suite; the build above pins it against the real bundler.

## Gates, with counts

| gate | command | result |
|---|---|---|
| test files touched | `node --test --test-concurrency=1 tests/{rollback-preflight,runtime-contracts,l9-build-info,work-bundle}.test.mjs` from `packages/runtime`, lane env | **78 tests · 56 pass · 0 fail · 22 skipped** |
| — per file | `rollback-preflight` 42/20/0/22 · `runtime-contracts` 2/2/0/0 · `l9-build-info` 17/17/0/0 · `work-bundle` 17/17/0/0 | |
| same, under WSL as `runner` | `/opt/node/bin/node --test tests/runtime-contracts.test.mjs` | **2 · 2 pass · 0 fail** |
| same, under WSL as `runner` | `/opt/node/bin/node --test --test-concurrency=1 tests/{rollback-preflight,l9-build-info}.test.mjs` | **59 · 37 pass · 0 fail · 22 skipped** |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen / 55 `use workflow` / 3 retired |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| typecheck | `pnpm typecheck` (repo root) | **exit 0** |
| lint | `pnpm lint` (repo root) | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| runtime build | `pnpm --filter @clara/runtime build` | exit 0, bundle 10.9 MB |

**The 22 skipped cells are the pre-existing rig-gated ones** in `rollback-preflight.test.mjs`
(`{ skip: SKIP }`, gated on `to_regclass('workflow.workflow_runs')`): `clara_l07` carries no WDK
World, and neither does CI's `clara_runtime_ci` (a template copy of the migrated estate — the
`workflow` schema is created by the World bootstrap, not by any migration; grepped). The count was
22 before my change and is 22 after: **every cell I added runs**, none is gated.

No `packages/db/tests` file was touched, so no db gate chain, no `operation-census`, no
`rig-isolation`. No `apps/web` file was touched, so no web unit suite and no browser walk.

## Migration

**None.** The ticket expected none and needed none: this is operator tooling plus one additive key
on `/api/build-info`. No schema or function change, so no prestate pins and no rig-meta cohort.
`packages/db` is untouched by this ticket.

## Docs, in the same commits

- `packages/runtime/README.md` — "The rollback preflight is a command" now states both kinds of
  frontier rule, a table of the two doors 0254 and 0279 changed and what an older image does with
  each, how a target proves a contract, and that a contract refusal has **neither** of the census
  refusal's two answers (retaining a body teaches nothing; there is no queue to drain). Plus how to
  add a rule and a marker.
- `CONTEXT.md` — new term **Runtime contract marker**; the **Rollback preflight** term now names the
  third question it asks and that a marker refusal is not drainable. (Shared file, rule 7: one hunk,
  at the existing rollback vocabulary.)
- `packages/runtime/lib/rollback-preflight.mjs` module header — rewritten to set rule (a) and rule
  (b) side by side.

## Successor contract

**None.** This ticket touches no workflow body, no frozen closure, no door signature, no part kind
and no prompt stanza. `node scripts/check-frozen-workflows.mjs` shows no manifest diff (312/55/3).
Nothing a frozen chat or Work tool would need changed.

## Deliberate choices, and what I left

1. **`FRONTIER_BODY_RULES` → `FRONTIER_RULES`, and `frontierBodyViolations` →
   `frontierRuleViolations({bodies, contracts})`.** The ticket asks for the 0254 rule "in the same
   table as the 0195 rule, with the mechanism generalised". A table named `…BODY_RULES` holding a
   rule whose requirement is not a body would be a lie in the most-read place, and AC4's "enumerates
   every rule" only reads coherently over one table. Call sites updated: the lib, both cutover
   drills, the unit file, the README. **Three release runbooks name the old constant in prose**
   (`RELEASE-W2-RUNBOOK.md`, `RELEASE-W3-RUNBOOK.md`, and two older waves' runbooks) — those are
   as-run records and I did not rewrite them; the integrator should expect that mismatch and it is
   history, not drift.
2. **I did not edit `RELEASE-W2-RUNBOOK.md` or `RELEASE-W3-RUNBOOK.md`.** The ticket's key-interface
   bullet says "the release runbook template: step 9 cites the preflight as the authority for a
   runtime rollback again once this ships." W2's § RESULTS is an as-run record (2026-09-23) and must
   not be rewritten. W3's runbook on this branch still has a **blank** § RESULTS, but the wave-3
   as-run landed on `main` after my base (`5da7183e0` is not an ancestor of `cd2925391` — checked
   with `git merge-base --is-ancestor`), so any edit of mine there would both rewrite history and
   conflict at integration. The durable home for the statement is `packages/runtime/README.md`,
   which now carries it. **Handoff to whoever writes the wave-4 release runbook** — the exact
   wording step 9 can now use:

   > Step 9 is the authority again. The preflight's `FRONTIER_RULES` now knows both classes of rule:
   > a body the applied schema requires (0195) and a **door contract** it requires the image to
   > understand (0254 `intake_refusal_record_v1`, 0279 `fa_parked_run_v1`). Extract the previous
   > image's bundle and run `--target-bundle`; the command reads the target's own contract markers,
   > so `refresh-68b979bf` and anything older is REFUSED by name at any frontier ≥ 0254 with
   > `frontier_requires_contract`, exit 1. That refusal is **not** drainable and RETAIN does not
   > reach it. State which gate is being demonstrated, as before: (a) the body rule, (b) the
   > stranded-body census, (c) — new — the door-contract rule.

3. **Both standalone cutover drills were updated but NOT run here.** `version-cutover-e2e.mjs` and
   `two-build-cutover-e2e.mjs` need a WDK World (and the second needs two builds); `clara_l07` has
   neither. Without the change their GLOBAL-verdict legs would have kept passing for a reason they
   are not about (`two-build`'s `withRequired.frontier.violations deepEqual []` would have gone
   **red**). Marked unverified below.
4. **The new cells are pure** (an explicit `frontier`, a stub `query`), matching the design the
   module and the test file already state for the frontier leg: "the rule is about a version string
   and a roster, and making them need a rig would make them measure the rig instead of the rule."
   The exit codes are covered by the measured CLI runs above.
5. **The rule table names BARE ids; only the roster names the prefixed marker.**
   `lib/rollback-preflight.mjs` ships inside the runtime bundle (`plugins/startWorld.ts` imports its
   boot census), so a rule spelling the scannable form would put that marker in every image carrying
   the rule and the scan would find a declaration the image never made. A cell pins that the bare
   prefix alone is not read as a declaration.

## Unverified

- **`tests/version-cutover-e2e.mjs` and `tests/two-build-cutover-e2e.mjs` were changed and not
  executed** (no WDK World on `clara_l07`; the second also needs a scratch build). Both parse
  (`node --check`) and lint clean; their assertions are mechanical (pass each artifact's own
  contract roster, filter the body half of the violations, one new build-info agreement assertion).
  Whoever next runs the two-build drill on a World should confirm
  `cliBJson.frontier.violations === []` and the new
  `infoB.body.contracts` ⇔ `contractsB` line.
- **The 22 rig-gated cells in `rollback-preflight.test.mjs` did not run** here or, by the same
  catalog probe, in CI's `db-estate` runtime leg. That is the pre-existing state, unchanged by this
  ticket; I did not add to it.
- The CLI's exit codes were measured against a **clone** of `clara_l07` with a hand-made
  `workflow.workflow_runs` (four columns), not against a real WDK World. The relation's shape is
  the four columns `censusNonTerminalRuns` actually selects; a real World would only add rows.
- The `frontierRuleViolations` default `rules` parameter and `preflight`'s `contracts` default are
  exercised by cells; the `--supported-contracts` flag's **refusal** path was run by hand
  (`--target-bundle … --supported-contracts x` → exit 2 with the named message) but has no cell —
  the CLI's argument handling has none for the sibling flags either.

## Follow-ups worth filing

1. **A rule row and its marker can be added independently, and only one direction is checked.** A
   `FRONTIER_RULES` row naming a contract this image does not declare is caught (the "THIS image
   satisfies every rule its own table carries" cell). The other direction — a marker in
   `RUNTIME_CONTRACTS` with no rule — is deliberately legal (a contract can be declared before the
   migration that requires it lands), but nothing ever reminds anyone to add the rule. A cheap
   guard: a cell asserting every roster entry's `since` migration either has a rule or is named in
   an explicit "declared ahead of its rule" list.
2. **The contract-refusal exit code has no cell that can run on a rig without a WDK World**, which
   is every lane rig and CI's runtime leg. Either the runtime suite gets a disposable database with
   a real World, or the preflight CLI grows a documented way to answer about a supplied frontier
   without reading one. Worth a ticket rather than a widened gate.
3. **The two-build drill is the only executable proof of the CLI's exit code and it is not in the
   gate chain.** Same class as the gap this ticket closed: a check that only runs when somebody
   remembers to run it.
