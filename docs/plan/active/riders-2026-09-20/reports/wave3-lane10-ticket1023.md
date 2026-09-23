# Wave 3 · Lane 10 · Ticket #1023 — DONE

Branch: `riders/w3-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`ffe63a0dd084e99b84c1368119845be273c421ce`. `#1015`, `#1016` and `#1018` landed before this ticket
started (confirmed by `git log ffe63a0dd08..HEAD` at start: `304621a82`, `a6ac22323`, `7c4172440`,
`4f1ac9723` named `#1015`; `c248d2023` named `#1016`; `af1e1dd1d`…`9c445683a` named `#1018`,
ending clean — `git status` at start was empty, so #1018's earlier usage-limit cutoff had already
been resumed and finished by a prior session, nothing left for this session to pick up).

## Commits (7, all named `#1023`)

```
46b8ada8c test(db): #1023 onboard checkout-convergence-upgrade onto the closed-wave-upgrade-drills CI leg
ac49489a9 test(db): #1023 onboard rig-runtime-upgrade onto the closed-wave-upgrade-drills CI leg
e2946a7b6 test(db): #1023 onboard wave-a-upgrade onto the closed-wave-upgrade-drills CI leg
1e4c3e879 fix(db): #1023 drop the trailing #1023 from three step names, restoring them after YAML comment truncation
055bfd881 docs(db): #1023 update the #845 section — all 14 audited drills now have a CI leg
0b8b5465b fix(db): #1023 satisfy no-regex-spaces in the step-splitting regex
90064494f docs(db): #1023 cross-reference the closed CI-coverage gap from #845's own history comment
```

`git diff --stat 9c445683a..HEAD`: 3 files changed, 165 insertions(+), 11 deletions(-) —
`.github/actions/closed-wave-upgrade-drills/action.yml` (+86), `packages/db/tests/README.md`
(+35/-11), `packages/db/tests/reset-gate-routing.test.mjs` (+55). Working tree clean at the end
(`git status --porcelain` empty). **No migration applied or written** — matches the ticket's own
prestate ("This ticket is expected to need NO migration") and touches no `packages/db/migrations`
file at all.

## Ticket

#1023 "Three reset-gated upgrade-drill test files have no CI leg that ever exercises their real,
destructive reset-and-re-migrate path" (enhancement, ready-for-agent). No comments (`gh issue view
1023 --repo BELCORT-SDN-BHD/clara --json comments` → `[]`); the issue body's own "Agent Brief" is
the only, and therefore newest, contract. No owner-ruling comment dated 2026-09-20 exists. Filed
from `docs/plan/active/riders-2026-09-20/reports/wave1-lane03-fixround-1.md`'s "Successor
contracts / follow-ups worth filing" and restated in `wave1-lane03-codereview-fix.md`.

**Verified still live on this branch** at session start: `git log ffe63a0dd08..HEAD` showed no
other lane/ticket touching `.github/actions/closed-wave-upgrade-drills/action.yml`,
`packages/db/tests/README.md`'s `#845` section, or `reset-gate-routing.test.mjs`; a fresh
`grep -rln 'checkout-convergence-upgrade\|rig-runtime-upgrade\|wave-a-upgrade' .github/` (before
any edit) still returned zero hits — the gap the ticket names was still open.

**The three files**, identified by cross-referencing `packages/db/tests/reset-gate-routing.test.mjs`'s
`EXPECTED_GATED_FILES` (the audited 14 reset()-gated drills) against every filename appearing in
`.github/` (`grep -rln` over `.github/`, confirmed zero hits for exactly these three, all others
present):
- `packages/db/tests/checkout-convergence-upgrade.test.mjs` (#628, the 0186 backfill drill)
- `packages/db/tests/rig-runtime-upgrade.test.mjs` (Slice-4's only runtime reset()-gated drill)
- `packages/db/tests/wave-a-upgrade.test.mjs` (Codex probe 26, the 0011 fresh-vs-upgrade parity drill)

**The seams the brief names** ("Key interfaces"):
- "The existing CI mechanism that already runs the repository's other reset-gated upgrade drills" —
  `.github/actions/closed-wave-upgrade-drills/action.yml`, the composite action `ci.yml`'s
  `closed-wave-drills` job (schedule / workflow_dispatch only) already invokes for the other 11 of
  the 14 audited files, each in its own throwaway `*_ci` database plus a cluster-cleanup step.
- "The disposable-database guard the drills already route through: unchanged" —
  `packages/db/tests/rig-reset-guard.mjs`'s `guardedReset` / `EPHEMERAL_DB` (from
  `packages/db/lib/guard.mjs`); not edited by this ticket.

## Each acceptance criterion

> **AC1 — "Each of the three drills has a CI job or step that runs its destructive
> reset-and-re-migrate path against a database CI itself provisions as disposable."**
> DONE. Three new step-pairs added to `.github/actions/closed-wave-upgrade-drills/action.yml`,
> each following the established 11-drill pattern exactly: a `create database` step against the
> job's admin connection, the drill invoked with `CLARA_RIG_ALLOW_RESET=1` +
> `CLARA_ALLOW_DESTRUCTIVE=1` (+ `CLARA_RIG_ALLOW_ROLE_SWEEP=1` for checkout-convergence only — see
> below) against that new database, then a `Cluster cleanup … --sweep-roles` step (`if: always()`).
> Evidence: the whole action re-parses with `js-yaml` (26 steps, up from 20; every step name
> intact — see the `#1023` fix commit below), and `reset-gate-routing.test.mjs`'s three new
> `#1023 CI coverage: …` cells (one per file) parse the SAME file text at test time and assert a
> step exists naming the file, sets both flags, and targets the documented database.
>
> Database names used are the exact names each file's OWN header comment already documented
> (`checkout-convergence-upgrade.test.mjs:16` → `clara_0186_upgrade_ci`,
> `rig-runtime-upgrade.test.mjs:9` → `clara_runtime_upgrade_ci`, `wave-a-upgrade.test.mjs:8` →
> `clara_waveA_upgrade_ci`), so a worker running a file by hand and this CI leg exercise the
> identical target — verified by matching the header text directly (`Read` on each file) before
> writing the step, and by the `#1023` test cell's own `assert.equal(dbMatch[1], db, …)`.
>
> `checkout-convergence-upgrade.test.mjs` applies through migration 0186 — well past the
> role-minting migration 0154 (RIG.md) — and its own header recipe documents
> `CLARA_RIG_ALLOW_ROLE_SWEEP=1`; the new step carries it, matching. `rig-runtime-upgrade.test.mjs`
> (through 0006) and `wave-a-upgrade.test.mjs` (through 0011) stay well below 0154 and their own
> headers document no role-sweep flag; the new steps for those two omit it on the drill line (the
> shared between-step cleanup still always sweeps, matching the established wb-0020 precedent,
> whose own comment states the same reasoning for a bounded-chain drill).
>
> `CLARA_ALLOW_DESTRUCTIVE=1` is added to all three CI steps even though
> `wave-a-upgrade.test.mjs`'s own header comment omits it — verified directly against
> `packages/db/lib/guard.mjs`'s `assertDestructiveAllowed` (lines 69-81), which requires it
> unconditionally before `reset()` may run at all, regardless of `targetIsEphemeral`. This is a
> pre-existing inaccuracy in that file's own header comment (not touched — out of scope per the
> ticket: "Changing the drills' own test bodies" is explicitly excluded), noted here rather than
> silently propagated into the new CI step.

> **AC2 — "All three pass in CI."**
> **Not verified by an actual CI run — see "Anything unverified" below; this is the one AC this
> report cannot close directly**, for a reason the ticket's own instructions make unavoidable: this
> session may never push or open a PR, and RIG.md's rig table states unconditionally "NEVER set
> `CLARA_RIG_ALLOW_RESET`… on your cluster" for every lane database, this one (`clara_l10`,
> port 55750) included — so the drills' real destructive body cannot be run here without either
> action. What WAS verified on this rig, safely, without ever setting that flag:
> - The exact invocation each new CI step uses (`cd packages/db && node --test
>   tests/<file>.test.mjs`, no reset flag) was run directly for all three files and each reached
>   its existing skip gate cleanly, with no import-time crash and the same skip counts
>   `wave1-lane03-fixround-1.md`'s own evidence table recorded: `checkout-convergence-upgrade.test.mjs`
>   0 pass/1 skip, `rig-runtime-upgrade.test.mjs` 0 pass/1 skip, `wave-a-upgrade.test.mjs` 0
>   pass/4 skip — confirming the relative path and working directory in the new YAML resolve
>   correctly and nothing has regressed since that audit.
> - The whole `closed-wave-upgrade-drills/action.yml` re-parses cleanly with `js-yaml` (26 steps).
> - `reset-gate-routing.test.mjs`'s structural cells (below) prove the WIRING — the right file, the
>   right flags, the right disposable name, a matching cleanup step — which is the same category of
>   evidence the established 11-drill pattern itself relies on for review, but it is evidence about
>   the CI recipe, not a report that the recipe's process actually completed and exited 0 against a
>   live PostgreSQL 17 instance. That last mile is CI's alone, by design (RIG.md), the same
>   limitation `wave1-lane03-fixround-1.md` recorded for the SAME three files' routing proof.

> **AC3 — "The drills' own guard (refusing to run destructively against a non-disposable database)
> is still in effect and is not bypassed to make CI pass."**
> DONE, verified structurally rather than asserted. Not one line of `rig-reset-guard.mjs`,
> `lib/guard.mjs`, or any of the three drills' own `reset()`-routing code was touched (`git diff
> 9c445683a..HEAD` — the only files touched are the action YAML, the README, and the test file).
> Each new step's database name is checked in `reset-gate-routing.test.mjs`'s new cells against the
> SAME `EPHEMERAL_DB` regex `rig-reset-guard.mjs`'s `guardedReset` enforces — imported from
> `../lib/guard.mjs`, never re-spelled — so the proof is against the real guard, not a
> re-implementation of its pattern that could silently drift from it. All three names
> (`clara_0186_upgrade_ci`, `clara_runtime_upgrade_ci`, `clara_waveA_upgrade_ci`) match (`_ci`
> suffix). `reset-gate-routing.test.mjs`'s pre-existing Cell 4 (`#845 acceptance 2`, untouched by
> this ticket) separately proves a non-disposable name is refused before the real `reset()` export
> ever runs — that proof already generalises to these three files' call sites via Cell 3
> (`guardedReset` import count ≥ raw `reset` import count), also untouched.

## The vacuity control (work order rule 4)

Before adding each YAML step, the corresponding `reset-gate-routing.test.mjs` cell was run and
observed RED for the right reason (`no step in .github/actions/closed-wave-upgrade-drills/action.yml
invokes tests/<file> …`) — three separate red observations, one per slice, each with the OTHER
already-landed cells staying green (6/6 → 7/7 → 8/8 across the three commits). After all three
steps existed, the checkout-convergence step's database name was deliberately mutated
(`clara_0186_upgrade_ci` → `clara_0186_upgrade`, a name the guard's own `EPHEMERAL_DB` regex does
NOT match) and the corresponding cell reproducibly reds; the file was then restored byte for byte
(`cp` from a pre-mutation backup, confirmed via `git diff --stat` showing only the intended +28
lines, no stray corruption) and the cell went green again.

## Two defects the local run caught before commit (both fixed, both re-verified)

1. **YAML comment truncation.** `- name: 0186 checkout-convergence upgrade drill (isolated DB,
   #1023)` — a whitespace-preceded `#` starts a YAML comment in a plain scalar, so the parsed step
   name silently lost everything from `#1023)` onward. Caught by parsing the file with `js-yaml`
   and reading the parsed step names back (the same check `wave1-ci-gates-1026-1027.md`'s own
   report used for a different file). Fixed by dropping the ticket-number suffix from all three
   step names, matching house style (none of the other 20 steps in this file carry a ticket number
   in their `name:`, only in the comment above them). Re-parsed clean afterwards.
2. **`no-regex-spaces` (eslint).** The step-splitting helper's `/\n(?=    - name:)/` used four
   literal spaces; `packages/db lint` flagged it. Fixed to `/\n(?= {4}- name:)/`, same match,
   re-verified with `pnpm exec eslint tests/reset-gate-routing.test.mjs` (clean) and the full test
   file re-run (still 8/8).

## Gates, with counts

| gate | command | result |
|---|---|---|
| `reset-gate-routing.test.mjs` (touched), full gate chain | `node --test --test-concurrency=1 $GATES tests/reset-gate-routing.test.mjs` (`$GATES` = the 84 `--import …-preintegration-gate.mjs` flags in `packages/db/package.json`'s `"test"` script) | **8/8 PASS** (5 pre-existing `#845` cells + 3 new `#1023` cells) |
| `operation-census.test.mjs` (rule 8, `packages/db/tests` touched) | same gate chain | **10/10 PASS** |
| `rig-isolation.test.mjs` (rule 8) | same gate chain, **no reset flags set** | **22/23 pass, 1 skip** (T19 skips exactly as it must on this rig — never run with `CLARA_RIG_ALLOW_RESET`) |
| All three together | same gate chain | **40/41 pass, 1 skip**, 0 fail |
| The three drills' own invocation, unflagged (dry-run of the new YAML's command line) | `node --test tests/<file>.test.mjs` from `packages/db`, no reset flag | all three reach their skip gate cleanly, skip counts unchanged from `wave1-lane03-fixround-1.md`'s own audit (1/1/4) |
| `pnpm typecheck` (worktree root) | — | **exit 0**, `apps/web` + `packages/runtime` both Done |
| `pnpm lint` (worktree root) | — | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (RIG.md: "run the lint chain once more as the runner sees it") | — | **exit 0**, `world-gate selftest: OK` still present (unaffected — that selftest only parses `.github/actions/db-live-gates/action.yml`, a different action from the one this ticket touched) |
| `node scripts/check-frozen-workflows.mjs` | — | **OK — 312 files, no manifest diff** (nothing in `packages/runtime` was touched) |
| YAML validity | `js-yaml` parse of `closed-wave-upgrade-drills/action.yml` | **26 steps, all names intact** (20 original + 6 new) |
| Working tree | `git status --porcelain` | clean at `90064494f` |

`node packages/runtime/scripts/check-parts-parity.mjs` and `apps/web`'s unit suite / e2e walks were
**not run** — this ticket touches neither `packages/runtime` source nor `apps/web`, so rule 8 does
not call for them.

## Docs updated

- `packages/db/tests/README.md`'s `#845` section: the "11 of the 14 … 3 of the 14 have no CI leg at
  all" claim is corrected to record that `#1023` closed the gap (all 14 audited files now have a
  CI leg; only T19 still never exercises its destructive path outside the ordinary battery's skip),
  naming the three new database names and pointing at `reset-gate-routing.test.mjs`'s structural
  proof. The historical "Acceptance #3 … PARTIAL" finding is left as the record of `#845`'s own
  state at the time it shipped, not rewritten.
- `reset-gate-routing.test.mjs`'s own file-header comment (`WHAT IS PROVEN HERE`, Cell 5): one
  sentence added pointing forward to the new `#1023` cells and to the README, so the historical "3
  of the 14 have no CI leg" claim sitting just above the code that now disproves it is not left to
  read as current.
- `.github/actions/closed-wave-upgrade-drills/action.yml`: each new step carries its own
  block comment in the file's own house style (why the drill exists, why it's reset-gated, why it
  needs — or doesn't need — the role-sweep flag, and a pointer to `#845`'s "no CI leg at all"
  finding that `#1023` closes).

No `CONTEXT.md` change — no new vocabulary introduced (this ticket wires existing, already-named
concepts together; it coins nothing).

## Successor contracts

None. This ticket touches no frozen workflow body, no closure module, no chat/Work-tool-facing
surface — it is CI wiring for `packages/db`'s own test suite.

## Follow-ups worth filing

- **T19 (`rig-isolation.test.mjs`) is the one remaining audited drill with no CI leg exercising its
  real destructive path** — it runs in the ordinary battery and always skips there, since no
  workflow sets `CLARA_RIG_ALLOW_RESET` for it anywhere (confirmed: `grep -rn rig-isolation
  .github/` → no hits). This is explicitly OUT of `#1023`'s scope ("Adding coverage for drills that
  already have a CI leg" is excluded, and T19 was never one of the three named files), but it is
  the same shape of gap `#1023` just closed for the other three, worth a ticket of its own if the
  owner wants T19's destructive path proven in CI too (as opposed to only its guard-routing, which
  `reset-gate-routing.test.mjs`'s existing Cell 4 already proves).
- **`wave-a-upgrade.test.mjs`'s own header comment omits `CLARA_ALLOW_DESTRUCTIVE=1`** from its
  documented recipe even though `lib/guard.mjs` requires it unconditionally (see AC1 above). Not
  fixed here (out of scope: "Changing the drills' own test bodies"); worth a one-line fix the next
  time that file is touched for its own reasons.
- The `closed-wave-upgrade-drills/action.yml` top-of-file `description:` still reads "Eight
  historical deploy/upgrade drills" — it was already stale before this ticket (the file held ten
  drill steps prior to `#1023`, now thirteen); not fixed here since it long predates this ticket
  and touching it would widen the diff beyond onboarding three new drills, but noted so it is not
  mistaken for something `#1023` introduced.

## Anything unverified

1. **AC2, "all three pass in CI" — not verified by an actual CI run.** Explained under AC2 above:
   this session may never push/open a PR, and RIG.md forbids ever setting `CLARA_RIG_ALLOW_RESET`
   on this lane's cluster. What is verified is the WIRING (right file, right flags, right
   disposable name, right cleanup, valid YAML) and that the unflagged invocation path is unchanged
   from a prior, closer audit. Whether the destructive body itself completes and exits 0 against a
   throwaway PostgreSQL 17 instance is provable only by an actual `schedule` / `workflow_dispatch`
   run of the `closed-wave-drills` job (or an integrator re-running it on a disposable cluster, the
   same boundary `wave1-lane03-fixround-1.md` and `wave1-ci-gates-1026-1027.md` both drew for
   similar reasons).
2. **Runtime and role-sweep behaviour of the two bounded-chain drills (`rig-runtime-upgrade`,
   `wave-a-upgrade`) under the real destructive path** is inferred from their migration ranges
   (0001→0006 and 0001→0011, both below the role-minting migration 0154) and from the wb-0020
   drill's own precedent comment for the same situation, not measured directly on this rig (for the
   same reason as item 1).
3. **The exact wall-clock cost of the three new steps** was not measured (no run occurred). The
   established pattern's other bounded-chain drills (rig-docs-upgrade, s6-upgrade) are the closest
   comparison but were not re-timed here.
