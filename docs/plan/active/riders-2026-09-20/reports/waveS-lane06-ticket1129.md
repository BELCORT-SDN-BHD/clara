# Wave S · lane 06 · ticket #1129 — guard against a runtime-contract roster entry that never gets its frontier rule

**Status: DONE.** No migration (none needed, none written — matches the SWEEP-PLAN lane table,
`#1129 (no)`, and the ticket's own "This ticket is expected to need NO migration").

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748); untouched by this ticket (no PostgreSQL object
  written, read, or migrated — confirmed below under "Migration").
- Commits (`git log --oneline 7bc5a710f..HEAD`, on top of #1044's four commits and #1128's three,
  both already landed on this branch before I started):

| commit | subject |
|---|---|
| `c196cdbf7` | `feat(runtime): #1129 guard against a runtime-contract roster entry that never gets its frontier rule` |

Files: `packages/runtime/lib/rollback-preflight.mjs`,
`packages/runtime/tests/rollback-preflight.test.mjs`, `packages/runtime/README.md`, `CONTEXT.md`.
Nothing else. One slice, one commit — the whole ticket is one guard function plus its exception
list and two test cells; there was no natural second vertical slice to split it across (see "Why
one slice" below).

**First action, as instructed:** `git status` (clean) and `git log --oneline 7bc5a710f..HEAD` (the
seven commits above #1044/#1128 landed, listed in WORK-ORDER.md's addendum shape).

**The ticket is live on this branch.** `gh issue view 1129 -R BELCORT-SDN-BHD/clara` (the bare `gh
issue view 1129 --comments` silently printed nothing in this shell — repo-inference issue, not an
API error; the explicit `-R` form worked) — OPEN, labels `enhancement` + `ready-for-agent`, **0
comments**, so the body's Agent Brief is the sole contract; no owner-ruling comment exists to
supersede it. Confirmed live at the base: `packages/runtime/lib/runtime-contracts.mjs`'s rule 3
already documents the asymmetry the brief describes ("an image built before a rule existed carries
neither, and that is exactly the state the rule has to be able to detect"), and
`packages/runtime/lib/rollback-preflight.mjs` had `frontierRuleViolations` (rule → image direction)
but no function checking the reverse (image → rule direction) before my change — confirmed by
`grep -n "contractsMissingFrontierRule\|DECLARED_AHEAD" packages/runtime/lib/rollback-preflight.mjs`
returning nothing against the base commit (`git show 7bc5a710f:packages/runtime/lib/rollback-preflight.mjs`).
The ticket is itself follow-up 1 of `reports/wave4-lane07-ticket1035.md`
("A cheap guard: a cell asserting every roster entry's `since` migration either has a rule or is
named in an explicit 'declared ahead of its rule' list" — line 296-297), which I read before
building, and the design below follows it directly.

---

## The seam I tested at (written down before the first cell)

| # | seam | why it is a seam the brief gives me |
|---|---|---|
| **S1** | A new pure comparison function over `RUNTIME_CONTRACTS` (`lib/runtime-contracts.mjs`) and `FRONTIER_RULES` (`lib/rollback-preflight.mjs`) | the brief's "Key interfaces" names exactly these two rosters and says "the guard would compare the two rosters" |

Only one seam: the brief asks for one guard, over one comparison, and names no other door, no CLI
flag and no UI surface. I did not add a CLI flag or wire the guard into `scripts/rollback-preflight.mjs`
— the acceptance criteria say "a test or lint step", not a runtime behaviour change, and the brief's
own "Out of scope" line ("this ticket only asks for the gap to be visible rather than silent") reads
as a build-time/test-time visibility requirement, matching #1035's follow-up note that named it "a
cell", not a new CLI capability.

## Why one slice

The work order's vertical-slice rule (rule 4) is about not writing a battery of red tests before any
implementation. Here the "battery" would be exactly two cells testing one function with two inputs
(the real roster, and a synthetic broken one) — there is no smaller unit of production code to land
between them; a function that only handled the real-roster case and not the synthetic-failure case
would not be the function the ticket asks for (AC2 is explicitly the failure path). I wrote both
cells, watched them fail together for the single shared reason (the function did not exist), wrote
the one function that makes both pass, and confirmed green — then additionally re-proved the
guard against a genuinely broken REAL rule table (not just the synthetic one) as the vacuity control,
detailed under AC1 below, before committing.

## AC1 — "A test or lint step names every runtime-contract roster entry with no corresponding
frontier rule, and passes only when each such entry is explicitly listed as a deliberate 'declared
ahead of its rule' exception."

**Met.** `packages/runtime/lib/rollback-preflight.mjs` gains:
- `CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE` — a frozen, currently-empty exception list (today's real
  roster is fully ruled, so there is nothing to list).
- `contractsMissingFrontierRule(contracts, rules = FRONTIER_RULES, exceptions =
  CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE)` — returns the ids of every `contracts` entry with neither
  a `FRONTIER_RULES` row naming it in `requiresContracts` nor an entry in `exceptions`.

`packages/runtime/tests/rollback-preflight.test.mjs`, new cell `"#1129: every runtime-contract
roster entry has a frontier rule, or is named as declared ahead of it"`:
```js
const missing = contractsMissingFrontierRule(RUNTIME_CONTRACTS, FRONTIER_RULES, CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE);
assert.deepEqual(missing, [], …);
```

- **Red, for the right reason.** Added the test's import of `CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE`
  and `contractsMissingFrontierRule` from `../lib/rollback-preflight.mjs` before either export
  existed: `node --test tests/rollback-preflight.test.mjs` failed at import —
  `SyntaxError: The requested module '../lib/rollback-preflight.mjs' does not provide an export
  named 'CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE'` — the missing-implementation red, not a logic red.
- **Green after the fix.** `node --test --test-name-pattern="1129" tests/rollback-preflight.test.mjs`
  (from `packages/runtime`, `PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08`):
  **2/2 pass** (both #1129 cells; the second is AC2, below).
- **Vacuity control against the REAL roster, not only the synthetic one (AC2's cell already proves
  the function catches a synthetic gap; this additionally proves the wiring to the real data is
  correct).** Temporarily edited `FRONTIER_RULES`' `0279_fa_closed_year_arrears` row in
  `lib/rollback-preflight.mjs`, changing `requiresContracts: Object.freeze(["fa_parked_run_v1"])` to
  `Object.freeze([])` — i.e., simulating the exact gap #1129 exists to catch, on a real, currently-
  ruled contract. Reran: cell **failed**, naming the gap exactly —
  `["fa_parked_run_v1"] carries no FRONTIER_RULES row naming it and no
  CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE entry — add the missing rule, or list the id there as a
  deliberate, reviewed exception` (assertion diff: `+ ['fa_parked_run_v1']` vs `- []`). Restored the
  file with `git checkout -- packages/runtime/lib/rollback-preflight.mjs` — this reverted the WHOLE
  file to the base commit, including my real (uncommitted-at-the-time) addition, not just the
  deliberate break, so I re-applied the same edit; confirmed byte-identical restoration via `git diff
  --stat` (43 insertions, 0 deletions — a clean re-add, no leftover drift) and `node --check` on the
  restored file. Reran the full suite: back to 24 pass / 0 fail / 22 skip (see Gates). Recorded here
  as the moment this happened, per the instruction to flag rather than silently fix a mid-task
  mistake — no data or commit was affected; the accidental full-file revert happened before this
  slice was committed.
- **Today's real data passes cleanly**, confirming both `intake_refusal_record_v1` (since
  `0254_intake_refusal_record`) and `fa_parked_run_v1` (since `0279_fa_closed_year_arrears`) each
  have a `FRONTIER_RULES` row naming them in `requiresContracts` — so
  `CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE` is correctly empty today; the guard has nothing to except.

## AC2 — "Adding a new contract with no rule and no exception entry fails the new check, by name."

**Met.** New cell `"#1129: a roster entry with neither a rule nor a listed exception fails the
guard, BY NAME"`, a synthetic three-entry roster (`unruled_marker_v1` with no rule and no exception,
`ruled_marker_v1` covered by a synthetic rule, `excepted_marker_v1` covered by a synthetic
exception):
```js
assert.deepEqual(
  contractsMissingFrontierRule(contracts, rules, exceptions),
  ["unruled_marker_v1"],
  "the guard must name the one entry with neither a rule nor an exception, and only that one",
);
```
- **Red for the same shared reason as AC1's cell** (both cells failed together at the same import
  error before the function existed — see AC1).
- **Green after the fix**, same run as AC1: `ok 2`.
- **Names it, and only it.** The assertion is exact (`deepEqual` against a one-element array), so it
  proves both halves of AC2: a genuinely unruled, unexcepted entry is reported, and the two
  entries that ARE covered (one by a rule, one by an exception) are correctly NOT reported —
  ruling out a guard that just returns everything or nothing.

## Gates, with counts

| gate | command | result |
|---|---|---|
| New/touched test file, `#1129` cells only | `PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node --test --test-name-pattern="1129" tests/rollback-preflight.test.mjs` (from `packages/runtime`) | **2/2 pass** |
| New/touched test file, full | same env, `node --test tests/rollback-preflight.test.mjs` | **24 pass / 0 fail / 22 skip** — the 22 skips are pre-existing, rig-gated cells that need a WDK World (`workflow.workflow_runs` etc.) this lane database does not carry; identical skip count/reason recorded by `wave4-lane07-ticket1035.md`'s own report and by this lane's own `#1044`/`#1128` reports — not something this ticket's scope touches or changes |
| `runtime-contracts.test.mjs` (imported roster, unaffected) | `node --test tests/runtime-contracts.test.mjs` | **2/2 pass**, unchanged |
| `check-frozen-workflows.mjs` | `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files verified vs the lane's real base, 57 "use workflow" modules frozen+registered, 3 retired. (Run with the DEFAULT base, `origin/main`, this reports 38 violations; confirmed via `git stash` / `git stash pop` that these are 100%-identical with and without this ticket's diff — pre-existing lane/base drift, not introduced here; see "Anything unverified / noted") |
| `check-parts-parity.mjs` | `node packages/runtime/scripts/check-parts-parity.mjs` | OK — `parts-parity: OK`, unchanged census |
| `pnpm typecheck` | from worktree root | 0 errors; `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| `pnpm lint` | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, full monorepo chain (root selftest scripts, `eslint scripts eslint.config.mjs`, `packages/runtime lint: Done`, `packages/db lint`, `apps/web lint: Done` with its own extensive selftest suite, `packages/reporting-render lint`) — no finding against any file this ticket touched |
| `eslint` directly on the two touched runtime files | `CI=true GITHUB_ACTIONS=true npx eslint lib/rollback-preflight.mjs tests/rollback-preflight.test.mjs` (from `packages/runtime`) | clean, no output |

`apps/web` was not touched: no web unit suite run beyond the whole-chain `pnpm lint` above (which
includes it), no Playwright walk, no `apps/web/test/manifest.txt` entry needed.
`packages/db/tests` was not touched: no db gate chain, no `operation-census.test.mjs`, no
`rig-isolation.test.mjs`, no `apps/web/tests/firm-scope-db-pins.corpus.ts` recheck (rule (d) only
applies when a migration file changed; none did).

## Migration

**None.** Confirmed before building (ticket's own instruction: "This ticket is expected to need NO
migration. If you find it needs one, stop this ticket and say why" — it did not need one) and
confirmed after: `git diff --stat 7bc5a710f..HEAD -- packages/db` for this ticket's one commit is
empty; no SQL, no `packages/db/migrations/*` file, no `rig-meta.mjs` entry, no `$GATES` list change.
Database `clara_l08` untouched — no `SET ROLE`, no query, no connection opened by this ticket's work
(the guard and its tests are pure JS/data, no `query` argument passed anywhere).

## Docs

- **`packages/runtime/README.md`** — extended the existing "Adding a rule is one row in
  `FRONTIER_RULES`…" paragraph (the section documenting the rollback preflight's `FRONTIER_RULES` /
  `RUNTIME_CONTRACTS` relationship) with a new paragraph naming the guard, what it catches, and that
  today's exception list is empty because today's roster is fully ruled.
- **`CONTEXT.md`** — new term **"Declared ahead of its rule"**, immediately after the existing
  "Runtime contract marker" term (house `term` / `_Avoid_` shape), naming the deliberate-but-must-
  be-explicit state this ticket makes visible. This is new vocabulary this ticket introduces (the
  state existed before #1129 — #1035's own module comment already allowed it — but had no name
  anyone could point to until now), so it earns a CONTEXT.md entry per work order rule 9.

## Successor contract

**None.** This ticket touches no frozen chat or Work tool surface — no `chatTurn_v*`, no
`claraWork_v*`, no door, no zod input, no prompt stanza, no `workflow.workflow_runs` row shape. It
adds one pure function and one data constant to a library module that is not itself a workflow body.
`check-frozen-workflows.mjs` (run against the correct base) confirms no frozen-manifest diff from
this ticket's commit.

## Follow-ups worth filing

None new. The ticket itself is follow-up 1 of #1035's own report; I did not find a further gap while
building it. (Follow-ups 2 and 3 of that same report — the contract-refusal exit code's missing rig
cell, and the two-build drill not being in the gate chain — are #1131's and a separate concern
respectively, not this ticket's.)

## Anything unverified / noted

- **The pre-existing `check-frozen-workflows.mjs` vs `origin/main` mismatch**, same class this
  lane's own `#1128` report already recorded. Running the gate with its DEFAULT base (`origin/main`,
  not `FREEZE_BASE_REF`) reports 38 violations, all in files this ticket never touched
  (`chatTurn.v22.*`, `claraWork.v6.*`, `statementFacts.v4.*`, `agreementFacts.v1.*`,
  `payrollFacts.v1.*`, `accrual-basis.v2.ts`, etc. — none of them `rollback-preflight.mjs`,
  `runtime-contracts.mjs`, or any file this ticket's commit touches). Confirmed pre-existing and
  unrelated to this ticket by `git stash` (removing this ticket's whole diff) and re-running the
  same default-base command: **identical 38 violations**, then `git stash pop` to restore. This
  lane's own base (`7bc5a710f`) is 62 commits behind the `origin/main` this worktree currently has
  fetched (per this session's git-status snapshot), consistent with the addendum's own warning
  ("Wherever a rule says `origin/main..HEAD`, use `7bc5a710f..HEAD`") and with #1128's report
  recording the identical class of drift one ticket earlier in this same lane. I used the script's
  own `FREEZE_BASE_REF` environment override (confirmed present in the script,
  `scripts/check-frozen-workflows.mjs:153`) rather than editing anything, the same tool #1128's
  report used.
- **The one `git checkout --` mistake during the AC1 vacuity control**, recorded above under AC1: it
  reverted the whole file (my real, not-yet-committed addition included) rather than only the
  deliberate one-line break I intended to undo. Caught immediately (`git diff --stat` showed 0
  insertions where I expected 43), re-applied the same edit, and re-verified both with a syntax
  check and a full green test run before committing. No commit, migration or database state was
  ever affected — this happened entirely in the uncommitted working tree.
