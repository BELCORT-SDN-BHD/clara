# Wave 4 · lane 07 · ticket #1033 — the #617 disconnect cell's unrefreshed heartbeat

**Branch** `riders/w4-lane07` · **base** `cd2925391` · **worktree** `C:\Users\zhant\Desktop\clara-wt\657`
· **database** `clara_l07` @ 127.0.0.1:55747 (frontier `0295_wave4_chart_rows`, 289 files — unchanged
by this ticket)

**Status: DONE.** No migration (none needed; none written — confirmed below).

## Commit (this ticket)

| sha | message |
|---|---|
| `6a8314aac` | `test(runtime): #1033 settleLaneUntil keeps the world/control heartbeats fresh while it polls` |

Tickets before mine on this branch (`#1041` five commits `aaf2cf21b`..`574d86e66`, `#1035` five
commits `f16566816`..`447ebacb7`) were read (`git log --oneline cd2925391..HEAD`) and left
untouched.

## The ticket was still live

Verified on this branch before building: `packages/runtime/tests/ready.test.mjs`'s
`settleLaneUntil` helper (line 503) set no heartbeat and the `#617 fault: a lane DISCONNECTS…`
cell (line 513) set `world`/`control` once, before either of its two `settleLaneUntil` calls, and
never again. Neither `#1041` nor `#1035`'s commits touched this file. Nothing in wave 2's or wave
3's landed work (checked by reading the file) had already closed this gap.

## The seam I tested at (written before the first cell)

The Agent Brief names one directly: **"The test's own convergence-polling helper (used by more
than one cell in the file) is a natural place to keep a liveness heartbeat fresh on every
iteration, if that is the chosen fix."** That is `settleLaneUntil` (`ready.test.mjs:503`), called
twice inside the `#617 fault: a lane DISCONNECTS…` cell (the down half and the recovery half). I
tested it directly — same-file scope, not exported, which is the seam this helper has: a module
function local to the test file it serves, driven the same way its own two existing callers drive
it (`_setLaneProbeForTest`, `_waitForLaneProbeSettleForTest`, `checkReadiness`). No cell was
written at a seam the brief does not give — I did not touch `lib/health.mjs` or
`lib/lane-probe.mjs`.

## What I built, in one paragraph

`settleLaneUntil` now refreshes both `world` and `control` heartbeats (`setBeat("world","now()")`,
`setBeat("control","now()")`) at the top of every polling iteration, before it awaits the
background probe and reads `checkReadiness()`. This is the only change. No production file moved:
`lib/health.mjs`'s `HEARTBEAT_STALE_MS` and `lib/lane-probe.mjs`'s `intervalMs()`/`cycleMs()`
defaults are byte-unchanged.

## Reproducing the flake deterministically, before fixing anything (lane rule (c))

The described collision could not be raced honestly with real host load on a quiet rig, so I built
a controlled repro instead of trying to "widen a timeout until it passes" (refused by the lane
rule). Two obstacles shaped it:

- `health.mjs:50`, `const HEARTBEAT_STALE_MS = Number(process.env.CLARA_HEARTBEAT_STALE_MS ||
  30000)`, is a **plain top-level `const`**, evaluated once when the static `import` at the top of
  `ready.test.mjs` runs — before any test body executes. Setting
  `process.env.CLARA_HEARTBEAT_STALE_MS` inside a test does nothing; I proved this by first trying
  exactly that (shrink the window to 300ms) and watching the cell pass even with **no fix
  applied**, which is the wrong kind of green (measured, not assumed — see the two failed attempts
  below).
- `lib/lane-probe.mjs`'s `intervalMs()`/`cycleMs()` **are** read per call from `process.env`, so
  those two knobs, unlike the heartbeat window, are genuinely test-controllable.

The working repro (added as its own new cell, `ready.test.mjs:595`,
`"#617 fault: settleLaneUntil keeps the world/control heartbeats fresh across a discarded probe
cycle (#1033)"`): `CLARA_LANE_PROBE_CYCLE_MS=50` and an injected prober
(`_setLaneProbeForTest`) that sleeps 150ms on the first `LANE_ROSTER.length` (7) calls — forcing
the whole first cycle to blow its 50ms bound and be discarded, the exact shape one slow,
unrelated lane produces under host load — then answers instantly. `CLARA_LANE_PROBE_INTERVAL_MS`
is set to **35000**, deliberately 5s past the real, unshrinkable 30s heartbeat window (not
shrunk — pushed further past it, with margin, so the one discarded cycle's wait crosses the
boundary deterministically rather than racing it at the edge).

**Attempt 1 (wrong):** interval `1000`, `CLARA_HEARTBEAT_STALE_MS` "shrunk" to `300` — passed in
1149ms with **no fix applied**. Diagnosed: the env override never reached `HEARTBEAT_STALE_MS`
(module-load-time binding, above); the real 30000ms window was never approached.

**Attempt 2 (right idea, borderline):** interval left unset (real 30000ms default), cycle `50`.
Failed in `30010.6081ms` — but this is a boundary race in itself (age at query time either just
over or just under 30000ms depending on scheduler jitter), the same class of instability named in
the ticket. Widened the margin instead of relying on the boundary:

**Attempt 3 (used):** interval `35000`, cycle `50`. **RED before the fix**, run once:

```
not ok 1 - #617 fault: settleLaneUntil keeps the world/control heartbeats fresh…
duration_ms: 35234.8363
error: a non-runtime lane failure is a WARN, never a 503 — even after a discarded cycle forced
  the wait past the heartbeat's own 30s staleness window (#1033)
expected: true
actual: false
```

`down.ready` was `false` — the exact collision the ticket names, reproduced on demand rather than
under load. Then the fix (`settleLaneUntil` refreshes both heartbeats every iteration) was
applied, and the same cell went **green**, run three times in a bounded loop (no open-ended
retry):

```
run 1: ok, 35275.6927ms
run 2: ok  (test-name-pattern rerun)
run 3: ok  (test-name-pattern rerun)
```

## Acceptance criteria, each with its evidence

### AC1 — the disconnect-and-recover cell cannot fail due to an unrelated stale heartbeat while legitimately still waiting for its own injected fault

- The deterministic repro above (`ready.test.mjs:595`) proves the mechanism red→green on the exact
  collision named in the ticket (a discarded cycle forcing the wait past 30s while a heartbeat set
  once goes stale). PASS after the fix.
- The original cell this ticket is about, `"#617 fault: a lane DISCONNECTS -> ok:false with a
  sanitized code -> RECOVERS -> ok:true"` (`ready.test.mjs:513`), uses the same helper unmodified
  in its own two calls (down half, recovery half) and now inherits the same protection for free —
  it did not need editing. PASS (2/2 full-file runs, see Gates).

### AC2 — the fix does not change production defaults for the probe cadence or the heartbeat staleness window; it changes only how the test polls or what it keeps fresh

- `git diff --stat` for this ticket: **one file**, `packages/runtime/tests/ready.test.mjs`. No
  `lib/health.mjs`, no `lib/lane-probe.mjs` change. `HEARTBEAT_STALE_MS`, `intervalMs()`,
  `cycleMs()` are byte-unchanged (checked by reading both files again after the edit).
- The change itself is two `await setBeat(...)` calls added inside `settleLaneUntil`'s loop
  (`ready.test.mjs:509-510`) — the same `setBeat` helper every world-on cell in this file already
  calls once at its own start; this only repeats it.

### AC3 — the cell still fails loudly, and for the right reason, if the lane-failure classification it actually tests regresses

- Not weakened: the new cell's `assert.equal(downLane.ok, false, "mandatory setup…")` and
  `assert.equal(down.ready, true, "a non-runtime lane failure is a WARN, never a 503…")` are
  independent assertions the heartbeat fix does not touch — a classification regression (e.g. the
  read lane's failure wrongly flipping `ready` false on its own) would still fail exactly this
  assertion, heartbeat freshness notwithstanding. The original cell's own classification
  assertions (`downLane.ok`, `assert.match(downLane.error, /^[A-Za-z0-9_]{1,32}$/)`,
  `back.warnings` clearing) are unmodified.

### AC4 — running the affected file alone, repeatedly, remains green, justified by the specific timing collision removed

- `node --test tests/ready.test.mjs`, full file, **twice**: `25/25` pass both times (was 24 cells
  before this ticket added one). See Gates for durations.
- The justification is the RED-then-GREEN mechanism trace above and the inline comments added at
  `settleLaneUntil` (`ready.test.mjs:487-499`) and the new cell (`ready.test.mjs:580-593`), which
  name the specific collision (a discarded cycle forcing a wait past an unrefreshed heartbeat's
  staleness window) rather than asserting only "it passes now."

## Gates, with counts

| gate | command | result |
|---|---|---|
| test file touched, alone (targeted new cell) | `node --test --test-name-pattern="settleLaneUntil keeps" tests/ready.test.mjs`, lane env | pre-fix: **0 pass / 1 fail** (RED, right reason, 35234ms) · post-fix ×3: **1 pass / 0 fail** each (35275ms, then 2 more) |
| test file touched, whole file | `node --test tests/ready.test.mjs`, lane env, ×2 | **25/25 pass** both runs (44826ms, then a second full green run) |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen / 55 `use workflow` / 3 retired (unchanged) |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK (unchanged census) |
| typecheck | `pnpm typecheck` (repo root) | exit 0 (`apps/web`, `packages/runtime` both Done) |
| lint | `pnpm lint` (repo root) | exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |

No `packages/db/tests` file was touched, so no db gate chain, no `operation-census`, no
`rig-isolation`. No `apps/web` file was touched, so no web unit suite and no browser walk. No SQL
function was added.

## Migration

**None.** The ticket expected none. `git diff --stat` shows one test file; `packages/db` is
untouched by this ticket. No prestate pins, no rig-meta cohort.

## Docs, in the same commit

**None needed.** `packages/runtime/README.md` and `CONTEXT.md` were grepped for
`settleLaneUntil`, `LANE_SETTLE_BUDGET_MS` and `ready.test.mjs` — neither file references this
helper or the cell it serves, so there is no stale doc line to correct and no new vocabulary this
ticket introduces. The full explanation lives inline at the two edited spots
(`ready.test.mjs:487-499` and `:580-593`), which is where a reader of this file would already be
looking.

## Successor contract

**None.** This ticket touches no workflow body, no frozen closure, no door signature, no part kind
and no prompt stanza — a test-file-only change. `node scripts/check-frozen-workflows.mjs` shows no
manifest diff (312/55/3, unchanged from before this ticket).

## Deliberate choices, and what I left

1. **Both heartbeats, not only `control`.** The ticket's own narrative centers on the control
   heartbeat, but `checks.world` reads the identical mechanism (`HEARTBEAT_STALE_MS`, set the same
   way, by the same `setBeat` call pattern, once, at the top of the same cell) and either one going
   stale independently fails `checkReadiness()`'s `ready` bit (`health.mjs:602`). Refreshing only
   `control` would have left `world` exposed to the same class of collision; refreshing both closes
   it symmetrically for the cost of one more UPSERT per iteration.
2. **I did not touch `CLARA_LANE_PROBE_INTERVAL_MS`/`CYCLE_MS` in the *original* `#617 fault` cell.**
   The Agent Brief offers two alternative fixes ("either… or…"); I chose the heartbeat-refresh
   because the acceptance criteria says the cell "**cannot** fail" — a cadence-only fix (matching
   the `ready r2` stalled-probe cell's pattern) only shrinks the probability of a long enough wait,
   it does not remove the race the way keeping the clock fed does. The original cell's own
   `settleLaneUntil` calls needed no edits at all — they inherited the fix from the shared helper.
3. **The new repro cell's own `CLARA_LANE_PROBE_INTERVAL_MS=35000` is deliberately past, not
   equal to, the real 30s window** — an exact-30s repro is itself a boundary race (attempt 2 above,
   which failed but by a margin close enough to worry about flaking the other way). This is
   reproducing the collision with margin, not widening any assertion's own budget: the new cell's
   `settleLaneUntil` budget (`45_000ms`) is smaller than the pre-existing `LANE_SETTLE_BUDGET_MS`
   (`60_000ms`, unchanged) that the original cell still uses.
4. **I left the two throwaway diagnostic attempts (the 1149ms false-green and the 30010ms
   boundary-red) out of the committed test file** — they are recorded above for the record but were
   never committed; only the working, margin-safe version (`ready.test.mjs:595`) is in the diff.

## Unverified

- **This exact collision was not reproduced by racing real CI load** — by design (lane rule (c) asks
  for a bounded, deterministic reproduction instead). The deterministic repro exercises the same
  mechanism (`withHardTimeout` discarding a cycle → `settleLaneUntil` waiting for the next tick →
  an unrefreshed heartbeat crossing `HEARTBEAT_STALE_MS`) with the same numbers the ticket's own CI
  read named (30000ms defaults), so I believe it is the same bug, but I have not re-run the actual
  wave-2 PR #1029 CI job to confirm the flake no longer reproduces there — that job is not
  reachable from this worktree.
- **`ready r2: NO DSN component reaches the /ready payload…`**, the file's other host-contention
  flake noted in wave 1's gate record, was not investigated — out of scope per the ticket ("Any
  other cell in the same file not shown to share this timing collision").

## Follow-ups worth filing

1. **`_waitForLaneProbeSettleForTest()` does not actually wait for a *new* cycle** when
   `inFlight` still points at an already-resolved promise from a prior cycle (between interval
   ticks) — `settleLaneUntil`'s loop busy-polls `checkReadiness()` at whatever cadence a DB round
   trip takes until the next real tick lands. This is pre-existing behaviour, not something this
   ticket introduced or was asked to change, but it is worth a ticket: a dedicated "wait for the
   NEXT cycle, not just the last-known one" test seam would make this file's convergence loops
   cheaper and easier to reason about under load.
2. **`HEARTBEAT_STALE_MS`'s module-load-time binding** (`health.mjs:50`) is a trap for any future
   test that tries to override it — this ticket ran into it directly (Attempt 1 above). Worth
   noting in `lib/health.mjs`'s own header, or converting to a function read at call time the way
   `lane-probe.mjs`'s two knobs already are, purely for testability; not something I changed here
   since the ticket's own acceptance criteria forbids touching the production default.
