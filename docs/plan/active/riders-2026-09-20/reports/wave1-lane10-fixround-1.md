# Riders wave 1 — lane 10 fix round 1 (#981, #980)

**Branch** `riders/w1-lane10` · **worktree** `C:\Users\zhant\Desktop\clara-wt\660` ·
**new head** `01e745039d6b8385412b02045b4c62fdbb929b45`

```
01e74503 test(runtime): #980 the ask_question script asks about ONE client's Work, and leg 7
         stops deleting a shared directory
7b47fb42 fix(runtime,web): #981 the carrier on every door, and the two wires that pinned the
         old body
1b219f03 (unchanged) test(runtime): #980 the harness's ask_question shape, …
14b67ddf (unchanged) fix(runtime): #981 the refusal carrier, measured over the real HTTP wire
eb542765 (unchanged) feat(runtime,web): #981 one structured-detail carrier, and the folds it retires
ba4071de (unchanged) test(runtime,web): #981 the generic structured-detail carrier, red first
```

Working tree clean. Nothing pushed, no PR, no GitHub write, no subagent, no other worktree
touched. 12 files in the two new commits.

---

## Per finding

### L10-A1 — blocker, #981 — **FIXED**

Two sibling World e2es pinned the exact 400 body over the real wire.

**Reproduced first, not reasoned.** From `packages/runtime`,
`node --import tsx -e` driving `workErrorResponse(raised("CLR10", {reason:"invalid_source_ref",
field:"source_refs[1]", constraint:"not_filed"}))` printed
`{"error":"invalid_basis","field":"sourceRefs[1]","reason":"not_filed","detail":{…}}` and the
siblings' literal `assert.deepEqual(unfiled.body, {error, field, reason})` raised
`Expected values to be strictly deep-equal`.

**Fixed** in `work-journal-e2e.mjs:565-577`'s idiom — destructure `detail` out, assert the
promoted half unchanged, assert the door's own object beside it — at
`packages/runtime/tests/periodic-adjustment-e2e.mjs:557` and
`packages/runtime/tests/staff-expense-claim-e2e.mjs:570`. Their `ALLOWED_DB` gates moved with
`work-journal-e2e.mjs`'s to admit `clara_l<NN>` so the claim could be MEASURED; still
loopback-only, still a parsed-DSN equality check against the PG env, still fail-closed.
The stale `lib/wire.ts` rationale in `periodic-adjustment-e2e.mjs`'s neighbouring comment went
with it (the lane's own follow-up 3).

**Searched for others as instructed.** `grep -rn "not_filed" packages/runtime/tests` and a
regex sweep for `deepEqual(<var>.body` across `packages/runtime/tests/*.mjs` find no other
exact-body assertion on a durable-Work 400/409. `apps/web/e2e/*-mock.mjs` emit these bodies but
assert nothing about them, and an absent carrier is indistinguishable from the pre-#981 shape at
that edge by construction.

**Evidence.**
`node tests/periodic-adjustment-e2e.mjs` (PGPORT 55750, `clara_l10`) → **PASS, 6 legs, 28.2s**,
`PASS 6: … an unfiled one is a typed 400 on the chooser`.
`node tests/staff-expense-claim-e2e.mjs` → **PASS, 7 legs, 25.1s**,
`PASS 7: … an unfiled one is a typed 400`.
**Vacuity control:** the new carrier assertion's expected constraint changed to `NOT_A_TOKEN` →
periodic-adjustment-e2e **FAIL** at `:566` with
`+ constraint: 'not_filed' / - constraint: 'NOT_A_TOKEN'`; restored byte for byte
(sha256 `a108b80817d6dc8bb0d7034fca73488fad4615921642b269bc9487798e02a319` before and after).
Commit `7b47fb42`.

### L10-A2 — major, #981 — **FIXED**

The carrier reached five of eight durable-Work doors on the web edge.

**Red first.** A new cell `981.web: EVERY durable-Work door reads the carrier — retry, cancel and
take-over too` in `apps/web/lib/work/api.test.ts` failed on `retryWork`'s missing `detail`
(`+ undefined / - {reason:'run_already_terminal', …}`) — 27 tests, 26 pass, 1 fail.

**Fixed** in `apps/web/lib/work/api.ts`: `...carrier(body)` on `retryWork`'s `not_retryable`,
`cancelWork`'s `conflict` and `invalid`, and `takeOverWork`'s `not_takeable`, `confirm_basis` and
`invalid`, with `detail?: RefusalDetail` on each of those result arms. `transient` deliberately
carries nothing on both doors, and the cell pins that: PostgreSQL broke a deadlock, the statement
never ran, there is no state to describe. Each arm's promoted keys are asserted alongside the
carrier, so the compatibility promise is measured per arm.

**Evidence.** `node --import ./test/bootstrap.mjs --import tsx --test lib/work/api.test.ts` →
**27 tests, 27 pass, 0 fail**. `pnpm typecheck` exit 0. Commit `7b47fb42`.

### L10-A3 — minor, #980 — **FIXED**

The shared harness's `ask_question` arm asked on any Work the supervisor picked up.

**Reproduced on the rig, as durable state rather than as a story.** `clara_l10` carries three
`journal_entry` Works parked `awaiting_input` —
`6f25cfb6-c943-4edd-b3e4-638b4b4538cc`, `eed4301a-2b98-40db-8d1a-9ab1d27962a1`,
`be68dadc-4b9a-44cb-9ad5-e8e436afedab` — each with a pending `clara.agent_interruptions` row
(`7c91bdc3…`, `2bc23177…`, `9e854b96…`) carrying the harness's own typed question. Nothing in
the estate ever answers them.

**Red first, in the e2e itself.** Leg 6 gained a BYSTANDER Work: a real trade-invoice admission
for a SECOND client, served by the same engine in the same window, asserted never-asked and
settled on its own. Against the unscoped arm:
`[ti-e2e] FAILED: leg 6: the ask_question script asked NOTHING of a Work this leg did not admit`
— actual, the harness's pending question (`d700d715-…`, `posting_date`/`amount_cents`) on the
bystander.

**Fixed** in `packages/runtime/tests/work-journal-serve.mjs`: `CLARA_WORK_ASK_ONLY_CLIENT` names
the one client whose Work may be asked, read off `workEnvelopeMessage`'s own
`for client <uuid>` line (v1's envelope, re-exported unchanged by every later bundle body), and
it is REQUIRED whenever the script is `ask_question` — fail-closed with a loud child exit rather
than a quiet park on a stranger's Work. Every other Work takes the `post` branch exactly as the
default script would have taken it. `childEnv` deletes the variable so it cannot be inherited.

**Evidence.** `node tests/trade-invoice-e2e.mjs` → **PASS, all 7 legs, 36.3s**,
`6 OK — parked on a question, replayed into the window, answered, ONE of everything; a foreign
Work was never asked`. Commit `01e74503`.

### L10-A4 — minor, #981 — **FIXED**

`packages/runtime/src/workRoutes.ts`'s WIRE FIELD PATHS note claimed `invalid_adjustment` "folds
to its `constraint` exactly as `invalid_basis` does" — contradicted by this lane's own cell
`981.route: the three constraint folds are the only typing left` and by
`CONSTRAINT_FOLD_REASONS`. The sentence now says what the code does, cites the set and the cell,
and states the open question (whether the token SHOULD move, and that
`apps/web/lib/work/journal-basis.ts`'s mapper was written as though it had) instead of asserting
an answer; the parallel `invalid_claim` claim is true and was left alone. Comment-only, in a file
this lane already rewrote. The follow-up about moving the token stands. Commit `7b47fb42`.

### L10-A5 — minor, #980 — **FIXED**

`packages/runtime/tests/trade-invoice-e2e.mjs` leg 7's `finally` no longer calls
`rmSync(GATE_DIR, {recursive:true, force:true})` — `gate.cleanup()` already removes this gate's
two files, and the directory is shared — and `makeGate`'s `open()` now `mkdirSync`es its parent
first, because it is the one call that must not throw (a held child waits on that file forever).
`.gitignore` gained `packages/runtime/tests/.trade-invoice-gates/` and
`packages/runtime/tests/.work-cancel-gates/`; `git check-ignore -v` exited 1 on both before and
now names lines 69 and 70. After a full run the directory exists and `git status --porcelain`
shows nothing untracked. `work-cancel-e2e.mjs`'s own copy of the recursive removal is another
lane's file and was left alone — named under "deliberately left" below. Commit `01e74503`.

### L10-A6 — minor, #981 — **FIXED**

`apps/web/e2e/trade-invoice-walk.spec.ts`'s control body sent `{candidates:[…]}` alone, so
`trade-invoice-mock.mjs` emitted the pre-#981 shape and the walk cited as AC2 evidence never
exercised the carrier. The control body now sends the door's whole typed object
(`reason`, `name`, `expected_counterparty_kind`, `candidates`), and the mock's header records
that `detail` is the generic carrier it passes through untouched.
**Evidence.** `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3590 … pnpm --filter @clara/web e2e
trade-invoice-walk` → **12 passed, 37.2s**. Commit `7b47fb42`.

### F1 — major, #980 — **REFUTED by re-run** (no code change indicated, and none made)

AC4 (`every existing post/narrate World test still passes unchanged`) reproduced on isolated
re-runs. `node tests/work-journal-e2e.mjs` alone on PGPORT 55750 / `clara_l10`:
**PASS, all 8 legs, 44.0s**, then **PASS, all 8 legs, 85.8s** — leg 4, the narrate leg the
review's run reded on, green both times (`PASS 4: a no-effect run settles failed/recoverable;
Retry makes a NEW run for the SAME identity and commits`). Both runs were made on a database
carrying MORE accumulated Work than during the review (it has since absorbed four more World e2e
runs), which removes accumulation as the explanation rather than leaving it open.

The mechanism behind the review's symptom is named, not guessed: `got completed` where the leg
demands `failed`/`no_effect` means something POSTED that Work, and only a `post`-scripted engine
does that. One supervisor serves every queued accounting Work on the database, so a second engine
process — another World e2e, or an earlier leg's child that had not yet exited (the review's own
attempt 3 failed with `timeout waiting for serve child exit`) — is sufficient and is the only
mechanism available; this lane's diff cannot reach the narrate branch, which returns before it.
That is cross-PROCESS contention on one database, outside the rig's one-worker-per-database
contract, and no change to the harness can prevent it.

Not done: a from-scratch database. RIG.md forbids a second from-scratch migration chain on this
cluster (0154 pins the cluster-wide role count) and a lane worker may not build a new one. Stated
as unverified below.

### F2 — minor, #980 — **ACKNOWLEDGED, no code change** (the review asked for none)

`trade-invoice-e2e.mjs` is sensitive to concurrent World-e2e/process contention. Confirmed by
this round's own experience in the opposite direction: run serially, with no other heavy process
and no other connection to `clara_l10` (checked through `pg_stat_activity` before starting), the
four World e2es were green on every attempt — trade-invoice 2/2, work-journal 2/2,
periodic-adjustment 2/2 (one deliberately red control), staff-expense-claim 1/1 — with no flake
of any kind. The operational note is recorded in `packages/runtime/README.md`: a World e2e is a
whole-database actor, so two of them on one database is not a test of either. Worth one line in
RIG.md beside the `next build` precedent (#869), which is the orchestrator's file, not this
lane's.

---

## Gates, with counts (all after the final commit)

| Gate | Result |
|---|---|
| `node tests/trade-invoice-e2e.mjs` (55750 / `clara_l10`) | **PASS — all 7 legs**, 36.3s |
| `node tests/work-journal-e2e.mjs` × 2, alone | **PASS — all 8 legs**, 44.0s / 85.8s |
| `node tests/periodic-adjustment-e2e.mjs` | **PASS — 6 legs**, 28.2s |
| `node tests/staff-expense-claim-e2e.mjs` | **PASS — 7 legs**, 25.1s |
| `node --test` work-routes-unit + staff-expense-claim-unit + periodic-adjustment-unit + trade-invoice-unit | 79 tests, **79 pass / 0 fail / 0 skip** |
| `node --import ./test/bootstrap.mjs --import tsx --test lib/work/api.test.ts` | 27 tests, **27 pass / 0 fail** (1 new) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | 4638 tests, 135 suites, **4636 pass / 0 fail / 2 skip**, 193.2s |
| `pnpm --filter @clara/web e2e trade-invoice-walk` (3590/3591/3592) | **12 passed**, 37.2s |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, **no manifest diff**, 55 `use workflow` modules frozen+registered |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |

No known Windows-only red was hit. No `packages/db` test was run (nothing under `packages/db`
was touched). No migration, no PRD/ARCHITECTURE edit, no frozen body, no frozen closure.

## Docs updated

- `packages/runtime/README.md` — #981 section gains "The carrier is measured over the real wire in
  three World e2es, not one"; #980 section gains "The `ask_question` script is scoped to ONE
  client", the four-file gate list with the seven spawners that still carry the narrow literal,
  and "No World e2e removes its gate directory recursively".
- `apps/web/README.md` — #981 section gains "Every door, not only the admission ones", naming all
  eight doors and why `transient` carries nothing.
- `packages/runtime/src/workRoutes.ts` header — L10-A4.
- `apps/web/e2e/trade-invoice-mock.mjs` header — the 400 body now names `detail`.
- No `CONTEXT.md` entry: still wire mechanics, not shared accounting vocabulary.

## Deliberately left

- **L10-A7 and L10-A8 were not in this round's list** and were not worked. A7 (re-word the
  `:459-464` cell's comment) is a one-line comment change somebody should take; A8 needs nine more
  World e2es run, which needs their gates widened — the same one-line-per-file change, and the
  standing follow-up asks for one shared `tests/local-db-gate.mjs` instead.
- **`work-cancel-e2e.mjs`'s own `rmSync(GATE_DIR, {recursive:true})`** (line 995) was left: it is
  not this lane's file, and touching it obliges a full run of a heavy World e2e for no gain this
  wave. Its gate directory IS now ignored, which is the half that could dirty a worktree.
- **The `invalid_adjustment` token itself** was not moved: changing a refusal's reason vocabulary
  is out of #981's scope by the ticket's own "Out of scope" line. The header now states the
  question instead of the wrong answer.

## Unverified

- **Hosted evidence: none.** Everything above is local, on the lane rig (PGPORT 55750,
  `clara_l10`, Playwright 3590/3591/3592).
- **A from-scratch database for F1.** Two isolated green runs are on the rig's existing
  `clara_l10`. RIG.md forbids a second from-scratch chain on this cluster, so "on a freshly
  migrated database" remains unmeasured; the accumulation confound is addressed by the runs being
  green on a MORE polluted database, not by removing the pollution.
- **Seven World e2es that spawn the shared harness were still not run** (`accrual`,
  `plan-occurrence`, `prepayment-occurrence`, `fixed-asset-acquisition`, `work-egress`,
  `work-cancel`, `work-question`, plus the three `chat-turn-v19/20/21` serve drivers): their local
  gates still name `clara_(rt_test|wave_b_ci)` only. Four of the eleven spawners now run on a lane
  rig, including both of the two that L10-A1 proved were broken.
- **The three parked `journal_entry` Works on `clara_l10`** were left in place as the evidence for
  L10-A3 rather than cleaned up. They are inert (`awaiting_input` is not queued) and every gate
  above was green with them present.
