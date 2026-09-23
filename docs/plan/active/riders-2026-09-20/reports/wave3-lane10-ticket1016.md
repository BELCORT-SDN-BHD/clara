# Wave 3 · Lane 10 · Ticket #1016 — DONE

Branch: `riders/w3-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`ffe63a0dd084e99b84c1368119845be273c421ce`. `#1015` landed 4 commits before this ticket started
(confirmed by `git log ffe63a0dd08..HEAD` at start: `4f1ac9723`, `7c4172440`, `a6ac22323`,
`304621a82`, all named `#1015`).

## Commit (1, named `#1016`)

```
c248d2023 test(db): #1016 freeze-verifier census counts prepayment_schedule's ceremony
```

`git diff --stat ffe63a0dd08..HEAD -- packages/db/tests/delta-catalog-phase.mjs`:
`packages/db/tests/delta-catalog-phase.mjs` (+18/-4). Working tree clean. No migration applied or
written — matches the ticket's own prestate ("This ticket is expected to need NO migration").

## Ticket

#1016 "Evaluator freeze-verifier's expected deployed count omits the prepayment-schedule evaluator
once it is deployed" (bug, ready-for-agent). No comments (`gh api
repos/BELCORT-SDN-BHD/clara/issues/1016` → `"comments":0`); the issue body's own "Agent Brief" is
the only, and therefore newest, contract. No owner ruling comment dated 2026-09-20 exists.

**The seam the brief names** (its own "Key interfaces"):
- `clara.verify_evaluator_freeze()` (migration `0059`, never recut since — confirmed the only
  `create function`/`create or replace function clara.verify_evaluator_freeze` in the whole
  migrations tree) — "the authoritative definition of which evaluators count toward 'deployed'".
  Its body: `'verified_deployed',(select count(*) from clara.evaluator_versions where deployed)` —
  a flat count with **no** per-evaluator exclusion of any kind.
- The test's own expected-value computation — `packages/db/tests/delta-catalog-phase.mjs`'s
  `t.test("freeze verifier positively reads registered live bodies, deployment count exact for
  either witness shape")`, specifically the `assert.equal(result.verified_deployed, ...)` at (now)
  line 654. Driven through the public interface only: the fix reads
  `clara.evaluator_versions.deployed` the same way the two pre-existing terms
  (`fsPackDeployed`, `card1V2Deployed`) already do, never a private helper or a side channel.

**Verified still live on this branch**: `git log ffe63a0dd08..HEAD --
packages/db/tests/delta-catalog-phase.mjs` was empty before my commit — #1015 (runtime-only) never
touched this file — and the gap (the formula added a term for `evaluate_fs_pack_agent` and
`evaluate_metric` v2 but never for `prepayment_schedule`) was present verbatim at the base commit,
confirmed by reading the file and reproduced live against the real database (AC2 below).

## Migration

**None needed, none written** — matches the ticket's own prestate. The fix is entirely inside one
test file's own expected-value arithmetic; no schema, grant, or SQL function changed.
`clara.verify_evaluator_freeze()` itself is untouched (and correct) — only the test's
hand-derivation was wrong.

## Acceptance criteria

- [x] **AC1 — the cell passes on a fresh database (no evaluator yet deployed).**
  Ran `tests/delta-contract.test.mjs` with the full 84-module gate chain
  (`packages/db/package.json`'s exact `--import` list minus the final glob) against the lane
  database at its as-delivered prestate (all 8 `evaluator_versions` rows `deployed=false`).
  `freeze verifier positively reads registered live bodies, deployment count exact for either
  witness shape` → **PASS** (`ok 18`, `duration_ms: 15.72`), `verified_deployed: 0` on the fresh
  witness (`fresh` short-circuits the formula to `0` regardless of the three ships-dark terms, all
  of which are also false here). Whole-file result: **60/60 pass**. This run is also the one that
  performs the covered-five ceremony (the file's own next subtest), so it is evidence for AC1 on
  the ORIGINAL, unmodified test — my edit had not landed yet at this point in the sequence, by
  design (red/green ordering below).

- [x] **AC2 — the cell passes on a database where prepayment-schedule (and potentially other
  ships-dark evaluators) has completed its own deploy ceremony, in any combination.**
  Reproduced the exact failure shape the ticket describes, then fixed it, on the real lane
  database (`clara_l10`), never mocked:
  1. Manufactured the witness: through the identical direct-session-identity door the suite's own
     ceremonies use (`current_user = session_user`, no `SET ROLE` spoof — `rig-helpers.mjs`'s
     `rootQuery`/`asRoot`), ran `update clara.evaluator_versions set deployed=true where not
     deployed and evaluator_name='prepayment_schedule' and version=1`. This is the same idempotent,
     one-way pattern `f-a5b-card1-seam-fixtures.mjs:85` already uses for `evaluate_metric` v2, run
     through a throwaway, non-`.test.mjs` script (`tests/_scratch-deploy-prepay.mjs`, deleted
     immediately after use — `git status` confirms nothing left behind). Before: `deployed=false`.
     After: `deployed=true`.
  2. **RED for the right reason**, unmodified test, full file re-run: `not ok 18` —
     `{"ok":true,"verified_deployed":6,"verified_registered":8}` / `6 !== 5`
     (`AssertionError`, `packages/db/tests/delta-catalog-phase.mjs:654:10`). The real verifier
     correctly counts 6 (5 covered + prepayment_schedule); the old formula's hard-coded `5` never
     added a term for it. Exactly one other subtest failed: the parent aggregation
     (`subtestsFailed`, expected cascade) — no other assertion in the 59-subtest file regressed.
  3. Applied the fix (add `prepayDeployed`, read the same read-directly-not-assumed way as the
     other two ships-dark terms, and add it to the sum).
  4. **GREEN**, same witness, full file re-run: `ok 18` (`duration_ms: 23.92`),
     **60/60 pass, 0 fail**.
  This demonstrates the fix on the specific combination the ticket cites (prepayment_schedule
  deployed, the other two ships-dark evaluators not). The formula's three ships-dark terms are
  structurally independent boolean additions (`+ (x ? 1 : 0)` per term, `verify_evaluator_freeze()`
  draws no distinction between them either), so this one combination generalizes to "any
  combination" by construction, not by having separately exercised all 2³ states — exercising the
  other two terms' own combinations would mean running their own dedicated one-way ceremony
  batteries (`f-a5-reporting-agency-pr1.test.mjs` cell D for `evaluate_fs_pack_agent`,
  `f-a5b-card1-seam-stage-b.test.mjs` for `evaluate_metric` v2), which is unrelated, heavyweight,
  out-of-scope work this ticket's brief does not ask for.

- [x] **AC3 — the test's registered-count assertion is unaffected.**
  Untouched: `result.verified_registered` and its own hand-derivation (`card1V2Registered`,
  `prepayRegistered`) were not edited. Evidence: the same green, whole-file run (step 4 above) is
  **60/60 pass** including this assertion, both before my edit (fresh witness, run 1) and after
  (re-run witness, run 3) — and `git diff` on the file shows zero lines changed below the
  `verified_deployed` assertion.

**Out of scope** (per the ticket's own "Out of scope" section, neither touched nor attempted):
which evaluators are registered or how deploy ceremonies work; the other `packages/db` test
failures the wave-1 integration gate classified as unrelated, pre-existing database contamination.

## What the fix actually is

```js
const prepayDeployed = (await rootQuery(
  "select deployed from clara.evaluator_versions where evaluator_name='prepayment_schedule' and version=1 and firm_id is null")).rows[0]?.deployed === true;
assert.equal(result.verified_deployed,
  fresh ? 0 : 5 + (fsPackDeployed ? 1 : 0) + (card1V2Deployed ? 1 : 0) + (prepayDeployed ? 1 : 0),
  JSON.stringify(result));
```

`clara.verify_evaluator_freeze()` counts every `deployed` row, full stop — it has no
`OWNS_ITS_OWN_CEREMONY` concept (that set is a TEST-side bookkeeping device, in
`delta-catalog-phase.mjs` and `delta-contract.test.mjs`, for which rows this suite's OWN five-row
ceremony must not touch and must not assert the deploy state of). The bug conflated "excluded from
this suite's own ceremony flip / not asserted by the census test" with "excluded from the
verifier's deployed count" — true for neither `evaluate_fs_pack_agent` nor `evaluate_metric` v2
(both already had their own read-directly term), but the same reasoning was never extended to the
third, newer ships-dark evaluator, `prepayment_schedule` (registered by migration `0140`/`0223`,
after the other two).

## How this was run

Directly against the lane database `clara_l10` (`127.0.0.1:55750`) — no clone needed.
`delta-contract.test.mjs` requires no World bootstrap (unlike #1015's `rollback-preflight` battery),
so none of RIG.md's T10b contamination concerns apply here.

1. `node --test --test-concurrency=1 <84 gate --import flags from packages/db/package.json's
   "test" script, minus the trailing glob> tests/delta-contract.test.mjs` — baseline / AC1, fresh
   witness (all `evaluator_versions.deployed=false`). **60/60 pass**; the file's own ceremony
   subtest commits the five covered evaluators (`deployed=true`, one-way, permanent).
2. `tests/_scratch-deploy-prepay.mjs` (throwaway, deleted immediately after) flips
   `prepayment_schedule@v1.deployed` to `true` the same legitimate way, then removed —
   `git status` confirmed clean before continuing.
3. Same full-file run again (re-run witness) — **red**, unmodified test, exactly the ticket's
   reported shape (`6 !== 5`).
4. Applied the fix.
5. Same full-file run again — **green**, **60/60 pass**.
6. `operation-census.test.mjs` + `rig-isolation.test.mjs` together, same gate chain, **no reset
   flags**: **32 pass, 1 skip (`T19 poison-role`, `CLARA_RIG_ALLOW_RESET` intentionally unset per
   RIG.md — expected, not "fixed"), 0 fail**.

**Resulting `clara_l10` state** (permanent, one-way, left for the next ticket in this lane):
`evaluator_versions.deployed` — `assess_metric_cell_independent@1`, `evaluate_metric@1`,
`evaluate_witness_fact_state@1`, `evaluate_witness_fact_state@2`, `evaluate_witness_identity@1`,
**and `prepayment_schedule@1`** → `true`; `evaluate_fs_pack_agent@1`, `evaluate_metric@2` → still
`false`. This is a legitimate "re-run" witness the suite is designed to tolerate (per its own
comments and `packages/db/tests/README.md`'s "Freshness and split chains" section) — not a
regression risk for `#1018`/`#1023`/`#1028`, none of which touch `clara.evaluator_versions` or this
test file.

## Gates, with counts

| gate | command | result |
|---|---|---|
| touched file, full gate chain, run 1 (baseline/AC1, fresh witness) | `node --test --test-concurrency=1 $GATES tests/delta-contract.test.mjs` | **60/60 pass, 0 fail** |
| same, run 2 (vacuity — unmodified test, manufactured witness) | same command | **58/60 pass, 1 assertion fail (`ok 18` → `not ok`, `6 !== 5`) + 1 expected parent cascade** |
| same, run 3 (post-fix, same witness) | same command | **60/60 pass, 0 fail** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs`, same gate chain, no reset flags | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **32 pass, 1 expected skip (`T19`, destructive), 0 fail** |
| typecheck | `pnpm typecheck` (worktree root) | **pass** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| lint | `pnpm lint` (worktree root) | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | **exit 0** |

`packages/runtime`/`apps/web` gates (rule 8's other conditional gates) do not apply — this ticket
touches only `packages/db/tests`, and no SQL function was added, so `check-frozen-workflows.mjs` /
`check-parts-parity.mjs` also do not apply.

**Environment hazard observed and worked around, not itself a ticket finding:** my first `$GATES`
extraction was written to the shared, per-user path
`C:\Users\zhant\AppData\Local\Temp\gates.txt` (not worktree- or lane-scoped). Between my green
baseline run and my next use of that same file, its contents changed to a list containing
`client-birth-wall-preintegration-gate.mjs` — a file that does not exist anywhere in this worktree
(`ls tests/client-birth*` → not found; the string does not appear in this worktree's
`package.json`) — and the next `node --test` run crashed with `ERR_MODULE_NOT_FOUND` before
executing anything. Read as another lane's concurrent Windows session writing to the same
OS-user-wide Temp directory at the same filename, since 11 lane workers run in parallel on this
host. Re-extracted the gate list fresh into my own scratchpad subdirectory
(`...\scratchpad\lane10-1016\gates.txt`) and confirmed it clean (84 `--import` flags, no
`client-birth-wall`) before every subsequent run; all counts reported above are from that
lane-private copy. No repository or database state was affected — this was purely a transient
shell-variable/log-file mixup on my end, caught before it produced a false result.

## Docs

Not touched — no README or `CONTEXT.md` update needed. The fix introduces no new door, pattern, or
product/accounting vocabulary; it extends an already-documented, already-live pattern
(`OWNS_ITS_OWN_CEREMONY` / "ships dark" evaluators, documented inline in
`delta-catalog-phase.mjs` and `delta-contract.test.mjs` since the prior two evaluators joined it) to
the third member of that same set, with the reasoning recorded in the code comment directly above
the fixed assertion (see the diff). `packages/db/tests/README.md`'s "Freshness and split chains"
section already states the general contract this fix restores compliance with and needed no edit.

## Successor contract

None. No frozen chat/Work-tool surface (`chatTurn_v*`, `claraWork_v*`, or their closures) is
implicated — `verify_evaluator_freeze()` is a plain SQL function read by test batteries only, and
this ticket touches no `lib/` module, door, or workflow body at all.

## Follow-ups worth filing

- **Possible latent, pre-existing gap (not this ticket's, not fixed here):** the fixed formula
  still reads `fresh ? 0 : (5 + ...)`. `fresh` (`evaluatorCeremonyUnwitnessed()`) is computed ONLY
  from the five `DELTA_CEREMONY_COVERED` rows and knows nothing about the three ships-dark
  evaluators. Structurally, if any one of the three ships-dark evaluators' OWN separate ceremony
  ran BEFORE the covered five ever did (`fresh` still `true`), `verify_evaluator_freeze()` would
  correctly report a non-zero `verified_deployed`, while this cell's formula would still assert
  `0` — a false green formula covering a real deployed row. I did not find a live code path in this
  codebase today that can reach that ordering (every production ceremony flip I found either
  targets a single already-covered-independent row via the same blanket `where not deployed`
  statement that also sweeps the covered five, or is gated behind the covered five already being
  live), so this is unverified and speculative, not reproduced, and explicitly out of this ticket's
  scope ("Changing ... how deploy ceremonies work"). Worth a `needs-triage` ticket if the owner
  wants it checked before F-A4 PR-2b (prepayment_schedule's own runtime ceremony) ships.
- The shared-Temp-directory collision noted above (multiple parallel lane sessions on one Windows
  user account writing to identical filenames under `AppData\Local\Temp`) is a host/process hygiene
  risk worth a note in `RIG.md` for future waves: extract any lane-generated helper file (gate
  lists, scratch scripts, logs) into the session's own scratchpad or worktree, never the bare
  per-user Temp root.

## Unverified

- Whether CI's own `db-live-gates` job (a from-scratch chain on a disposable runner database) sees
  this file identically — not run there; only proven against the lane's own already-migrated
  database as described above. The fix touches no `CI`/`GITHUB_ACTIONS`-conditional logic and no
  filesystem/spool path, so no difference is expected, but this is not directly evidenced from this
  lane.
- The "possible latent gap" noted above under Follow-ups: flagged, not reproduced, not fixed.
