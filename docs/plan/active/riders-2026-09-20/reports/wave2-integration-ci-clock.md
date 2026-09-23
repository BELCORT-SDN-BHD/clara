# Wave 2 integration, PR #1029: the #964 clock-dependent CI red, and the #617 flake diagnosis

Branch `integration/riders-w2`, worktree `C:\Users\zhant\Desktop\clara-wt\int2`. Fix commit(s) land
on top of head `1d94ded98`.

## RED 1 — #964 `p964.window.capacity_window_myt` (fixed)

### Cause

`packages/db/tests/intake-batch.test.mjs`'s cell derived every instant from `now()`. The cell built
two DIFFERENT now()-derived quantities and compared them as if they always referred to the same
calendar date:

- `ws` = `date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`
  — today's MYT date.
- the OLD-rule control = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'` — today's
  UTC date.

Between MYT midnight and 08:00 MYT (16:00Z-00:00Z), "today's UTC date" is still YESTERDAY's MYT
date: the UTC day that contains a `now()` of 00:12 MYT started at 08:00 MYT the day before. The
cell's probe, a reservation at `ws + 6h` (06:00 MYT today), then satisfies `>= yesterday's-UTC-day-
start`, so `counted_old_utc_today` computed `true` when the assertion expected `false`. The first
CI run (~21:00 MYT) sits outside the 00:00-08:00 MYT band, so it passed; the second run
(2026-09-20T16:12Z = 00:12 MYT) sits inside it, so it failed — exactly the reported
`true !== false`. This is a bug in the TEST'S CONTROL, not in the shipped door (see the door check
below).

### Pinned-clock reproduction (before the fix)

Ran the cell's exact pre-fix SQL against a throwaway clone of the lane database
(`clara_w2c` template, WSL Postgres 17 on 127.0.0.1:55760), substituting a literal timestamptz for
every `now()`:

| pinned instant | `counted_myt_today` | `counted_old_utc_today` | expected | result |
|---|---|---|---|---|
| 2026-06-15T00:12 MYT | true | **true** | false | **FAIL** (reproduces the reported red) |
| 2026-06-15T07:59 MYT | true | **true** | false | **FAIL** |
| 2026-06-15T08:01 MYT | true | false | false | PASS |
| 2026-06-15T23:59 MYT | true | false | false | PASS |

This confirms the bug is real and confirms its exact 00:00-08:00 MYT footprint (8 of 24 hours),
matching the ticket's own diagnosis.

### Fix

Made every instant in the cell a function of one FIXED reference instant
(`2026-06-15T12:00:00+08:00`, an ordinary MYT date; Malaysia carries no DST) instead of `now()`,
for all three arms (the straddle pair, the same-day pair, the 06:00 arm). The OLD-rule boundary is
now derived as `ws + interval '8 hours'` ("08:00 MYT of the reference date"), pure arithmetic off
the already-computed `ws`, rather than a second, independently-truncated UTC instant — so the cell
is correct for a reference at ANY hour of day, not merely a conveniently-chosen one. Every AC the
cell carried is unchanged: AC1 (06:00 MYT counts today), AC2 (09:00/23:00 MYT share one quota), AC3
+ the midnight boundary (a pair straddling MYT midnight falls in different windows). File:
`packages/db/tests/intake-batch.test.mjs`, cell `p964.window.capacity_window_myt`.

Vacuity control (WORK-ORDER rule 4): temporarily replaced `interval '8 hours'` with
`interval '0 hours'` (a deterministically-wrong subject, chosen over reintroducing the exact
now()-based bug because the real current wall-clock, ~13:52 MYT at fix time, sits outside the
8-hour bug window and would not have reliably failed). The cell FAILED for the right reason
(`06:00 MYT falls before the OLD 08:00-MYT UTC-day reset ... true !== false`, the same message the
CI red carried), then the file was restored byte for byte (diffed against the saved good copy
before re-running).

### Four-instant proof (after the fix)

The real, unmodified cell ran green (see Gates below: `p964.window.capacity_window_myt` ok,
`p964.window.capacity_descriptor_myt` ok, 37/37 in the file). Separately, evaluated the fixed
design (ws derived from a reference instant, OLD boundary = `ws + 8h`) with the reference instant
pinned at each of the four required wall-clock positions on the same date:

| reference instant | `counted_myt_today` | `counted_old_utc_today` | result |
|---|---|---|---|
| 2026-06-15T00:12 MYT | true | false | PASS |
| 2026-06-15T07:59 MYT | true | false | PASS |
| 2026-06-15T08:01 MYT | true | false | PASS |
| 2026-06-15T23:59 MYT | true | false | PASS |

All four pass, because the fixed design never reads `now()`: the "OLD boundary" is pure arithmetic
off `ws`, not a second, independently-truncated instant, so it cannot disagree with `ws` about
which calendar date is "today" regardless of the hour chosen.

### Sibling and #965 cells checked

- `p964.window.capacity_descriptor_myt` (line ~452): reads `get_intake_batch`'s `capacity`
  descriptor and asserts it deep-equals the static object
  `{window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur"}`. This is a fixed
  string the door reports, not a value re-derived from `now()` inside the test — not
  clock-dependent. Passed in every run.
- `document-ingest-window-myt.test.mjs` (the #964 mechanism proof): reads the shipped function
  bodies' literal SQL text (`prosrc`) and string-matches/reconstructs the MYT clause versus the old
  UTC clause. It never evaluates `now()` itself; its own header states plainly that nothing in this
  estate can move `now()` for a session, which is why it proves the MECHANISM by source text rather
  than by live evaluation. Not clock-dependent.
- `p636.census.no_recut`: sha-pins function bodies, selecting which generation to expect by
  probing `schema_migrations`, not by evaluating time. Not clock-dependent.
- One OTHER, unrelated cell in the file, `p636.batch.capacity_refusal` (line ~365-371), still
  filters its own isolation query with
  `created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')` — a leftover
  from before #964. This is NOT one of #964/#965's own recut cells (0229's original cell, unrenamed)
  and it is not testing window correctness: it only isolates THIS test's own freshly-inserted rows
  (a fresh firm, rows created within the same test run, seconds apart) from anything else in the
  database. Its clock-dependent footprint is the ~1 second around UTC midnight, not the 8-hour band
  #964 closed, and touching it would widen this ticket's scope (WORK-ORDER rule 5). Left alone;
  flagged here as a minor, low-risk residual for a future ticket if it is ever observed to flake.

### Door check: `clara._reserve_document_ingest` (and its three siblings)

The shipped door (`packages/db/migrations/0252_document_ingest_window_myt.sql`) computes ONE
quantity per call: `ws = date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone
'Asia/Kuala_Lumpur'`, and compares `created_at >= ws`. It never builds a second, independently-
truncated boundary the way the test's broken control did, so the two-different-calendar-dates bug
cannot occur in the door: `created_at` on `clara.document_ingest_reservations` is
`not null default now()` (`packages/db/migrations/0007_document_pipeline.sql:384`) and the door's
own INSERT never supplies it explicitly, so `created_at` is always exactly the same `now()` the
door itself just truncated into `ws` (Postgres's `now()` is transaction-stable). This makes
`created_at >= ws` a tautology (X is always >= floor(X) for its own calendar day), true at every
hour, including 00:00-08:00 MYT.

The door offers no parameter to pin `now()`: `_reserve_document_ingest(p_firm, p_intake, p_pages,
p_lease_expires)`'s fourth argument is the lease expiry, not a clock override, and the table's
`created_at` column has no caller-settable default either. `document-ingest-window-myt.test.mjs`'s
own header says the same: nothing in this estate can move `now()` for a session. Two things were
done instead of pinning the live door directly:

1. Live proof at the real wall clock (2026-09-23T05:57:38Z = 13:57:38 MYT, mid-afternoon, so not
   itself inside the 00:00-08:00 band): drove the real `clara.create_document_intake` door end to
   end on a fresh firm. The resulting `document_ingest_reservations` row:
   `created_at = 2026-09-23T05:57:38.922Z`, `myt_window_start = 2026-09-22T16:00:00.000Z`
   (= 2026-09-23T00:00 MYT), `counted_in_todays_myt_window = true`. PASS.
2. Tautology check at the four named pinned instants: evaluated
   `select $1::timestamptz >= (date_trunc('day', $1::timestamptz at time zone 'Asia/Kuala_Lumpur')
   at time zone 'Asia/Kuala_Lumpur')` (the shipped door's own comparison, with the SAME literal
   standing in for both `now()` and `created_at`, which is exactly how the door always uses them in
   production) at 00:12, 07:59, 08:01 and 23:59 MYT: `counted_own_day = true` at all four. This
   proves the door gives the right answer at 00:12 MYT (and at every other hour) — a reservation at
   06:00 MYT is counted in the MYT day that starts at midnight, because the door only ever asks "is
   this row's own timestamp on-or-after its own day's start," never "is this row's timestamp
   on-or-after some OTHER now()-derived day's start."

## RED 2 — #617 `packages/runtime/tests/ready.test.mjs` (diagnosed, not fixed: filing a ticket)

### What the cell waits on and what bounds the wait

The cell (`#617 fault: a lane DISCONNECTS -> ok:false ... -> RECOVERS -> ok:true`) sets the
`world`/`control` heartbeats ONCE at its start (`await setBeat("control", "now()")`), points
`CLARA_READ_DATABASE_URL` at a `.invalid` host, then polls `settleLaneUntil` (its own helper) for up
to `LANE_SETTLE_BUDGET_MS` = 60,000 ms, calling `_waitForLaneProbeSettleForTest()` +
`checkReadiness()` in a loop until the read lane reports `ok:false`.

Three timing constants govern this, none of which the cell overrides (unlike its sibling cell
"ready r2: a STALLED probe loop..." at the same file, which explicitly sets
`CLARA_LANE_PROBE_INTERVAL_MS=1000` / `CLARA_LANE_PROBE_CYCLE_MS=30` for exactly this reason):

- `packages/runtime/lib/lane-probe.mjs`: `PROBE_TIMEOUT_MS` (per-lane bound) defaults to 3000 ms;
  `intervalMs()` (how often a NEW background cycle starts) defaults to 30,000 ms; `cycleMs()` (a
  hard bound on the WHOLE cycle, all lanes concurrently) defaults to 5000 ms. `refreshOnce()` races
  the whole `probeLanes()` call against `cycleMs()` via `withHardTimeout(..., null)`: if the cycle
  does not finish inside 5000 ms, the ENTIRE cycle's verdict is discarded back to `pending`, even if
  individual lanes (including the deliberately-down read lane) already resolved correctly within
  their own 3000 ms bound. A discarded cycle means the poll must wait for the NEXT scheduled tick,
  which on the default `intervalMs()` is a further 30,000 ms away.
- `packages/runtime/lib/health.mjs`: `HEARTBEAT_STALE_MS` also defaults to 30,000 ms, and the
  file's own `lane-probe.mjs` header says so explicitly ("the same shape the world/control heartbeat
  checks already have (HEARTBEAT_STALE_MS, also 30s)").

So if even ONE cycle is discarded under host load (a genuinely plausible event: 7 lanes probed
concurrently, one of which does a real DB round trip that occasionally exceeds 5000 ms combined on
a loaded runner), the test's own wait for the NEXT cycle is bounded below by the exact same 30,000
ms window in which the control heartbeat, set once and never refreshed, goes stale. The observed
failure duration, 30,089 ms, sits 89 ms past BOTH defaults, consistent with this mechanism: the
control beat expired and flipped `checks.control.ok` (hence `ready`) to false for a reason entirely
unrelated to the lane-classification assertion the cell is nominally testing
("a non-runtime lane failure is a WARN, never a 503").

This is the same class of flake the wave-1 gate record already logged for a DIFFERENT cell in the
SAME file: `docs/plan/active/riders-2026-09-20/reports/wave1-integration-gates-A.md` classifies
"ready r2: NO DSN component reaches the /ready payload or a warning line (H-48)" as `(b) Flake`,
re-run twice in isolation and passed both times, with the note "consistent with a per-lane probe
cycle not settling inside this test's own wait window under load."

Confirmed wave 2 did not touch either file: `git log ddb5a1258..HEAD -- packages/runtime/tests/
ready.test.mjs packages/runtime/lib/health.mjs packages/runtime/lib/lane-probe.mjs` is empty.

### Three isolated runs on this host

Ran `packages/runtime/tests/ready.test.mjs` alone, three times, against a throwaway clone of the
lane database (`PGDATABASE` pointed at the same disposable Postgres used for the RED 1 work,
`RELAY_TEST_MODE=1`):

| run | file result | `#617 fault: a lane DISCONNECTS...` duration |
|---|---|---|
| 1 | 24/24 pass | 1438 ms |
| 2 | 24/24 pass | 1800 ms |
| 3 | 24/24 pass | 1488 ms |

Did not reproduce the red on this host at its current load (all three runs converged in under 2
seconds, far under both the 5000 ms cycle bound and the 30,000 ms heartbeat window) — consistent
with a host-contention-dependent race rather than a defect the file carries unconditionally.

### Decision: (b) — filed as a ticket, nothing changed

Chosen over (a) because the mechanism above, while well-evidenced from source (exact file/line
citations for every constant) and corroborated by the wave-1 gate record's independent
classification of a sibling cell in the same file, was never observed failing on this host. The
WORK-ORDER's own TDD discipline (see red-then-green, and "a door's behaviour is asserted only after
it was driven") argues against committing a "fix" to a race I could not drive red locally: a
plausible diagnosis is not the same as a proven one, and the fix's correctness (raising the
interval override, or refreshing the heartbeat mid-poll, or both) cannot be confirmed against a red
that never appeared here. `packages/runtime/tests/ready.test.mjs` is UNCHANGED.

Draft ticket body (for the owner to file; nothing was posted to GitHub):

---

> *This was generated by AI during triage.*

## Context

`packages/runtime/tests/ready.test.mjs`'s cell `#617 fault: a lane DISCONNECTS -> ok:false with a
sanitized code -> RECOVERS -> ok:true` failed on the CI runner in wave-2 integration PR #1029's
second run, at the assertion `assert.equal(down.ready, true, "a non-runtime lane failure is a WARN,
never a 503")`, after 30089 ms. The immediately preceding log line was `lane probe FAILED lane=read
login=clara_agent_read_login: getaddrinfo ENOTFOUND l9leakhost.invalid`, i.e. the fault injection
itself worked exactly as intended; the failure is in the readiness verdict, not the fault. The same
PR's first CI run passed the identical cell. Wave 2 made no changes to `ready.test.mjs`,
`packages/runtime/lib/health.mjs` or `packages/runtime/lib/lane-probe.mjs` (an empty `git log` over
the wave's commit range against all three).

The cell polls for up to 60000 ms (its own `LANE_SETTLE_BUDGET_MS`) for the injected fault to be
recorded, without overriding `CLARA_LANE_PROBE_INTERVAL_MS` or `CLARA_LANE_PROBE_CYCLE_MS` (a
sibling cell in the same file, "ready r2: a STALLED probe loop WARNS on /ready...", does override
both, for exactly this class of reason). Three defaults collide: `packages/runtime/lib/lane-
probe.mjs`'s per-cycle hard bound (`cycleMs()`, default 5000 ms) discards an ENTIRE cycle's verdict,
including an already-correct fault reading, if any one of the seven concurrently-probed lanes is
slow to answer; a discarded cycle forces the poll to wait for the loop's next scheduled tick, which
on the unoverridden `intervalMs()` default is 30000 ms away; and `packages/runtime/lib/health.mjs`'s
`HEARTBEAT_STALE_MS` (also 30000 ms by default) governs a `control` heartbeat the cell sets once, at
its own start, and never refreshes while polling. A cycle that is discarded even once therefore
risks the control heartbeat going stale before the retried cycle lands, flipping `ready` to false
for a reason unrelated to the lane-failure classification the cell is nominally about. The observed
30089 ms duration sits 89 ms past both 30000 ms defaults, consistent with this account.

A prior, separate cell in the same file, "ready r2: NO DSN component reaches the /ready payload or a
warning line (H-48)", was already classified as a host-contention flake in wave 1's own gate record
(`docs/plan/active/riders-2026-09-20/reports/wave1-integration-gates-A.md`): it passed twice when
re-run alone and was judged to reproduce only under the load of the full parallel suite, "consistent
with a per-lane probe cycle not settling inside this test's own wait window under load," the same
mechanism suspected here.

Re-running `ready.test.mjs` alone three times on a separate host did not reproduce the red: the
disconnect cell converged in 1.4 to 1.8 seconds each time, well under either 30 second default,
supporting a host-contention-dependent race rather than an unconditional defect.

## Agent Brief

**Category:** bug

**Summary:** A fault-injection readiness test can fail on an unrelated stale heartbeat when its own
background probe cycle is discarded under host load, because the test polls up to 60 seconds without
ever refreshing a heartbeat whose staleness window is only 30 seconds.

**Current behavior:**
A test that injects a real network fault into one dependency lane and waits for the readiness
door to report it polls a background probe in a loop, bounded by a much longer overall budget than
the background probe's own natural retry cadence. During that poll it never refreshes an unrelated
liveness heartbeat that the readiness door also consults. Under normal conditions the background
probe settles in one attempt, well inside the heartbeat's staleness window, so the race is invisible.
Under host load, if even one attempt is discarded (because some unrelated, healthy dependency
answered slower than the probe's own tight per-cycle bound), the test must wait for the probe's next
scheduled attempt, whose default spacing happens to equal the heartbeat's staleness window. The test
can then fail on the heartbeat going stale, reporting the readiness door as unexpectedly unready,
even though the fault it actually injected was classified correctly the whole time.

**Desired behavior:**
A test that injects one fault and polls for its effect should not be able to fail because of an
unrelated clock it forgot to feed. Either the polling loop keeps every liveness signal the readiness
door depends on fresh for as long as it polls, or the test's own retry cadence for the thing it is
actually waiting on is fast enough that it can never plausibly outlast an unrelated staleness window
it does not control. The fix should not weaken the production defaults these tests exercise (the
background probe's real cadence and the heartbeat's real staleness window), only make the test no
longer race them.

**Key interfaces:**
- The readiness door's background lane-probe loop: its per-cycle hard bound and its retry cadence
  are both environment-overridable, and other cells in the same file already demonstrate overriding
  them for determinism; this cell does not.
- The readiness door's liveness heartbeat check: a fixed, unrefreshed heartbeat combined with a
  polling loop whose budget exceeds the heartbeat's own staleness window is the general shape to
  avoid in any cell that polls across multiple background-probe cycles.
- The test's own convergence-polling helper (used by more than one cell in the file) is a natural
  place to keep a liveness heartbeat fresh on every iteration, if that is the chosen fix.

**Acceptance criteria:**
- [ ] The disconnect-and-recover fault-injection cell cannot fail due to an unrelated heartbeat
      going stale while it is legitimately still waiting for its own injected fault to be recorded.
- [ ] The fix does not change the production defaults for the background probe's cadence or the
      heartbeat's staleness window; it changes only how the test polls or what it keeps fresh.
- [ ] The cell still fails loudly, and for the right reason, if the lane-failure classification it
      actually tests (a non-runtime lane failure is a warning, never a hard failure) regresses.
- [ ] Running the affected test file alone, repeatedly, remains green, and the fix is justified by
      an explanation of the specific timing collision it removes, not only "made it pass."

**Out of scope:**
- Changing the background probe's default cadence or per-cycle bound in production.
- Changing the heartbeat staleness window in production.
- Any other cell in the same file not shown to share this timing collision.
- Investigating whether the CI runner itself is generally over-loaded; this ticket is about the test
  not racing a known, named clock collision, independent of how loaded the runner is.

---

## Gates

All runs against a throwaway database cloned from `clara_w2c` (WSL Postgres 17, 127.0.0.1:55760),
dropped after use; never against `clara_w2c` itself.

- `packages/db/tests/intake-batch.test.mjs`, full gate chain, clean database: **37/37 pass**
  (includes `p964.window.capacity_window_myt` ok, `p964.window.capacity_descriptor_myt` ok).
  Vacuity control run (deliberately broken subject): 2 fail, both the expected cell, for the
  expected reason; restored byte for byte, re-verified clean at 37/37.
- `packages/db/tests/operation-census.test.mjs`, full gate chain: **10/10 pass**.
- `packages/db/tests/rig-isolation.test.mjs`, full gate chain (no reset flags):
  **22/22 pass, 1 skip** (T19, the destructive poison-role cell, correctly skipped without
  `CLARA_RIG_ALLOW_RESET`).
- `packages/runtime/tests/ready.test.mjs` (unchanged; run for the RED 2 diagnosis only, not gated
  by rule 8 since the file was not modified): **24/24 pass**, three consecutive runs.
- `pnpm typecheck` (worktree root): clean, both `apps/web` and `packages/runtime`.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root): clean on the fourth attempt. The first
  three attempts failed with transient, unrelated host errors (a `packages/db` eslint
  out-of-memory abort, a Windows `UNKNOWN: unknown error` file read in `scripts/check-leaks.mjs`,
  and a `spawnSync ... UNKNOWN` in `check-frozen-workflows.registration.selftest.mjs`) — three
  different scripts, none touching the intake-batch.test.mjs diff, consistent with host
  contention on this shared machine rather than a defect introduced here. The fourth run completed
  with exit code 0 and no error markers in the log.

## Docs

No module README or `CONTEXT.md` change: this is a test-only fix to a clock-dependent control, no
new vocabulary or door behavior.

## Successor contracts

None: no frozen chat or Work tool involved.

## Unverified / left as-is

- `p636.batch.capacity_refusal`'s own isolation filter (still `now() at time zone 'utc'`) carries a
  much smaller (~1 second, around UTC midnight) clock-dependent footprint, unrelated to #964/#965's
  own recut set. Not touched (scope discipline); flagged for a future ticket if it is ever observed
  to flake.
- The #617 root cause is a diagnosis from source, corroborated by a wave-1 precedent, not a
  reproduction: it could not be driven red on this host in three attempts. The ticket above should
  be filed and the fix (if any) built test-first against a red obtained on a genuinely loaded
  runner or via a synthetic slow-lane injection.
