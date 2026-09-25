# Wave S · lane 06 · ticket #1128 — two lane-probe test-infrastructure traps

**Status: DONE.** No migration (none needed, none written — matches the SWEEP-PLAN lane table,
`#1128 (no)`, and the ticket's own "expected to need NO migration").

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748); untouched by this ticket (no PostgreSQL object
  written, read, or migrated).
- Commits (`git log --oneline 7bc5a710f..HEAD`, on top of #1044's four commits already landed on
  this branch):

| commit | subject |
|---|---|
| `30335b147` | `fix(runtime): #1128 lane-probe settle helper waits for a NEW cycle` (first design: a settle-generation counter; superseded by the next commit) |
| `eb8a6f3a6` | `fix(runtime): #1128 drive the settle helper's fresh cycle directly` (the design that ships — see "A design I tried and replaced" below) |
| `bfa163db6` | `fix(runtime): #1128 HEARTBEAT_STALE_MS reads CLARA_HEARTBEAT_STALE_MS per call` |

Files: `packages/runtime/lib/lane-probe.mjs`, `packages/runtime/lib/health.mjs`,
`packages/runtime/tests/l9-pool-contract-lane-probe.test.mjs`, `packages/runtime/tests/ready.test.mjs`.
Nothing else.

**The ticket is live on this branch.** `gh api repos/BELCORT-SDN-BHD/clara/issues/1128` — OPEN,
labels `enhancement` + `ready-for-agent`, **0 comments**, so the body's Agent Brief (dated
2026-09-24) is the sole contract; no newer comment or owner ruling exists to supersede it. Both
traps the brief names are still present at the base: `packages/runtime/tests/ready.test.mjs:600-606`
(the #1033 test's own comment, unchanged at the base) says `HEARTBEAT_STALE_MS` "is a plain
top-level `const`... so a test cannot shrink it," and `packages/runtime/lib/lane-probe.mjs`'s
`_waitForLaneProbeSettleForTest()` at the base read `laneProbeHealth(); await inFlight; return
laneProbeHealth();` — exactly the shape the brief describes.

---

## The seams I tested at (written down before the first cell)

| # | seam | why it is a seam the brief gives me |
|---|---|---|
| **S1** | `lib/lane-probe.mjs`'s `_waitForLaneProbeSettleForTest()` (exported, test-only) | the brief's "Key interfaces" names it directly |
| **S2** | `lib/health.mjs`'s `checkReadiness()` (the public door) plus a new test-only accessor for the resolved staleness window, mirroring `lib/lane-probe.mjs`'s own `_laneProbeTimingForTest()` precedent for its two comparable per-call knobs | the brief names `HEARTBEAT_STALE_MS` itself, and the ticket's own AC2 explicitly offers "convert it to a function read at call time the way `lib/lane-probe.mjs`'s `intervalMs()`/`cycleMs()` already are" — that pattern's only test seam in this codebase is a `_xxxForTest()` accessor, not a raw export of the function |

Not tested at, deliberately: `settleLaneUntil` itself (a local helper inside `ready.test.mjs`, not
an exported interface) — I did not change its code, only re-ran its two existing callers (the
`#617`/`#1033` disconnect-recover tests) to prove my `lib/lane-probe.mjs` fix does not change its
observable behaviour.

## AC1 — the lane-probe settle helper busy-polls instead of waiting for a new cycle

**Met.** `packages/runtime/tests/l9-pool-contract-lane-probe.test.mjs`, new cell `"H-48 (#1128):
_waitForLaneProbeSettleForTest waits for a NEW cycle, not a stale in-flight promise"`.

- **Red, for the right reason, against the true base (`7bc5a710f`).** Saved the base file
  (`git show 5b31ea95b:packages/runtime/lib/lane-probe.mjs` — #1044 landed no change to this file,
  so it is identical to the base), swapped it in, ran the new cell alone
  (`node --test --test-name-pattern="1128" tests/l9-pool-contract-lane-probe.test.mjs`): failed
  with `a genuinely NEW cycle ran — a full second roster round happened / 8 !== 16` — the second
  call to the helper returned the FIRST cycle's cached verdict (`calls` unchanged at
  `LANE_ROSTER.length` = 8) instead of running a fresh one.
- **Green after the fix**, same command: `ok 1`. Full file
  (`node --test tests/l9-pool-contract-lane-probe.test.mjs`): **27/27 pass**, no regressions.
- The cell independently proves freshness two ways: the probe-call counter doubles
  (`calls === 2 * LANE_ROSTER.length`), and the returned verdict for the `read` lane flips from the
  first cycle's `ok:true` to the second cycle's `ok:false` — a stale cached read would show neither.

### A design I tried and replaced

My first fix (`30335b147`) tracked a monotonic "settle generation" counter, bumped once per real
`refreshOnce()` completion, and had the helper wait passively for it to advance — i.e., wait for the
loop's own **scheduled** next tick, never forcing one early. It passed the new cell and the full
`l9-pool-contract-lane-probe.test.mjs` file, but running the full `ready.test.mjs` file surfaced two
problems, both from the same root cause: `lib/lane-probe.mjs`'s background interval is deliberately
**unref'd** (its own header: "never keeps the process alive" — safe in production because an HTTP
listener is always also running). A bare `node --test` process has no such listener, so a caller
waiting purely on that unref'd timer, with nothing else active in the gap, can have Node decide the
event loop is done and abandon the wait before the real interval ever ticks:

1. Most of `ready.test.mjs`'s later cells failed with `Promise resolution is still pending but the
   event loop has already resolved` once one cell hit this (cascading `cancelledByParent`).
2. The `#1033` regression cell (`"…settleLaneUntil keeps the world/control heartbeats fresh across a
   discarded probe cycle (#1033)"`) failed on its own assertion (`down.ready`, `false !== true`):
   that cell's `settleLaneUntil` loop used to refresh the world/control heartbeat **once per busy
   -poll iteration**, which (under the old bug) was frequent in wall-clock terms; making the helper
   correctly block for a whole real interval turned "once per iteration" into "once per ~35s",
   long enough on its own to cross `HEARTBEAT_STALE_MS` — reproducing the exact clock collision
   #1033 fixed, via a new mechanism.

I added a ref'd keepalive timer to patch problem 1, but problem 2 is a real, unresolved interaction,
not a test artefact — so I replaced the design (`eb8a6f3a6`) rather than patch further. The shipped
version calls `refreshOnce()` **directly** instead of reading the stale `inFlight` variable.
`refreshOnce()`'s own `busy` guard means this is never redundant (a cycle already in flight is
returned and awaited exactly as before); if none is in flight it starts and awaits a brand-new one
immediately, bounded by the short `cycleMs()` (default 5s) rather than the possibly much longer
`intervalMs()` (default 30s) — the same safe pattern `_refreshOnceForTest()` already uses
throughout this file with no event-loop issue. This satisfies the brief's literal ask ("a dedicated
helper (or a fix to the existing one) that actually waits for the *next* probe cycle to start, not
just for the last-known in-flight promise to settle") without depending on wall-clock interval
scheduling, and needs no change to `settleLaneUntil`. Verified: full `ready.test.mjs` run **26/26
pass**, and the `#1033` cell that used to need ~35s to converge now converges in ~676ms (measured),
because a discarded first cycle is immediately followed by a forced fresh one rather than a wait for
the interval's own schedule — its assertions are unchanged and still meaningful (a
non-runtime-lane fault is still a WARN, never a 503).

## AC2 — `HEARTBEAT_STALE_MS`'s module-load-time binding is non-overridable per test

**Met — the "convert" branch of the ticket's either/or, not the "document" branch.**
`packages/runtime/lib/health.mjs`'s `HEARTBEAT_STALE_MS` (`const HEARTBEAT_STALE_MS =
Number(process.env.CLARA_HEARTBEAT_STALE_MS || 30000)`, evaluated once at import) is now
`function heartbeatStaleMs()` returning the byte-identical expression, called at both use sites
(`checks.world`/`checks.control`, `lib/health.mjs:233,235`). Production default is unchanged: unset
still resolves to `30000`. Added `_heartbeatStaleMsForTest()`, the same test seam
`lib/lane-probe.mjs`'s `_laneProbeTimingForTest()` already gives its own two per-call knobs.

- **Red, for the right reason.** New cell in `packages/runtime/tests/ready.test.mjs`, `"#1128 fault:
  CLARA_HEARTBEAT_STALE_MS set INSIDE the test body now takes effect"`, added alongside an import of
  the not-yet-existing `_heartbeatStaleMsForTest`. Running the file failed at import
  (`SyntaxError: The requested module '../lib/health.mjs' does not provide an export named
  '_heartbeatStaleMsForTest'`) — the missing-implementation red.
- **Green after the fix.** Ran the new cell alone
  (`node --test --test-name-pattern="1128" tests/ready.test.mjs`): `ok 1`.
- **The discriminating assertion goes through the PUBLIC interface**, `checkReadiness()` — not only
  the new accessor: with `CLARA_START_WORLD=1` and `CLARA_HEARTBEAT_STALE_MS=3000` set **inside the
  test body**, a world heartbeat aged 5 seconds (`setBeat("world", "now() - interval '5 seconds'")`)
  is asserted `checks.world.ok === false` and `ready === false`. A beat 5 seconds old is FRESH under
  the real, unshrunk 30-second default (5000 <= 30000) and STALE under a genuinely-shrunk 3-second
  window (5000 > 3000) — so the assertion can only pass if the override set inside the test body
  actually reached the check; under the base code it does not (I did not need to re-derive this by
  running it against the base — it follows directly from the base's own module-load-time binding,
  and the newly-added `_heartbeatStaleMsForTest()` import failing to exist at all was itself proof
  the base has no such seam).
- Full file (`node --test tests/ready.test.mjs`): **26/26 pass** (see AC1's evidence — same run).

## Gates, with counts

| gate | command | result |
|---|---|---|
| New/touched test file 1, isolated | `node --test --test-name-pattern="1128" tests/l9-pool-contract-lane-probe.test.mjs` | 1/1 pass |
| New/touched test file 1, full | `node --test tests/l9-pool-contract-lane-probe.test.mjs` | **27/27 pass** |
| New/touched test file 2, isolated | `node --test --test-name-pattern="1128" tests/ready.test.mjs` | 1/1 pass |
| New/touched test file 2, full | `node --test tests/ready.test.mjs` | **26/26 pass**, run twice for stability (676ms and comparable for the #1033 cell both times; total file time ~21s, down from the base's own ~50s+ because the #1033 cell no longer needs a real ~35s wait) |
| `check-frozen-workflows.mjs` | `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files verified vs the lane's real base. (Run with the DEFAULT base, `origin/main`, this reports 38 violations; verified those are 100% pre-existing and unrelated to this ticket — see "Anything unverified / noted" below.) |
| `check-parts-parity.mjs` | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm typecheck` | from worktree root | 0 errors, `packages/runtime` + `apps/web` both `Done` |
| `pnpm lint` | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | exit 0, `packages/runtime lint: Done`, no eslint findings against any file this ticket touched |

`apps/web` was not touched: no web unit suite, no Playwright walk, no `test/manifest.txt` entry.
`packages/db/tests` was not touched: no db gate chain, no `operation-census.test.mjs`, no
`rig-isolation.test.mjs`. No migration: `apps/web/tests/firm-scope-db-pins.corpus.ts` out of scope
(rule (d) only applies when a migration file changed).

## Migration

**None.** Confirmed before building (the ticket's own instruction: "This ticket is expected to need
NO migration. If you find it needs one, stop this ticket and say why") and confirmed after: `git
diff --stat 7bc5a710f..HEAD -- packages/db` is empty for this ticket's commits, and no `set role`,
no SQL, no `packages/db/migrations/*` file was touched.

## Docs

**No README or CONTEXT.md section added, deliberately — evidence, not an omission.**
`grep -rn "HEARTBEAT_STALE_MS\|_waitForLaneProbeSettleForTest\|lane-probe\|laneProbeHealth"
packages/runtime/README.md` (before my change) returns exactly one line, a bare filename mention at
the connection-configuration table (line 386); no section documents either knob's semantics or
overridability today, so there is no documented claim to correct. The direct precursor ticket,
#1033, hit the identical `HEARTBEAT_STALE_MS` trap while building its own fix
(`reports/wave4-lane07-ticket1033.md`, "Attempt 1") and added no README section either — its own
report explicitly deferred the choice ("worth noting in `lib/health.mjs`'s own header, or
converting... not something I changed here") to whichever future ticket picked it up, which is this
one. I took the **convert** branch, and the documentation the ticket's own AC2 asks for
("document this trap... in `lib/health.mjs`'s own header") is satisfied by the code comment at the
constant's own former location (now `heartbeatStaleMs()`), which explains what the trap was and why
it is now closed — the same place `lib/lane-probe.mjs`'s own header documents `intervalMs()`/
`cycleMs()`. No new domain/product vocabulary was introduced (this is test-infrastructure plumbing,
not a business concept), so `CONTEXT.md` is untouched.

## Successor contract

**None.** This ticket touches no frozen chat or Work tool surface — no `chatTurn_v*`, no
`claraWork_v*`, no door, no zod input, no prompt stanza. `check-frozen-workflows.mjs` (run against
the correct base) confirms no frozen manifest diff.

## Follow-ups worth filing

None beyond what the originating ticket (#1033) already filed as this one. While building AC1 I
found and had to route around a genuine, generalizable trap of my own (an unref'd interval timer is
unsafe to wait on directly from a bare `node --test` process) — I did not file a new ticket for this
because it is now fully closed by the shipped design (no caller anywhere in this file waits on the
unref'd timer directly any more), so there is no live residue to track.

## Anything unverified / noted

- **The pre-existing `check-frozen-workflows.mjs` vs `origin/main` mismatch.** Running the gate with
  its default base (`origin/main`, not passed `FREEZE_BASE_REF`) reports 38 violations, all in files
  this ticket never touched (`chatTurn.v22.*`, `claraWork.v6.*`, `statementFacts.v4.*`,
  `agreementFacts.v1.*`, `payrollFacts.v1.*`, `accrual-basis.v2.ts`, etc.). I confirmed this is a
  base/environment artefact, not a regression I introduced: I temporarily restored the tree to the
  commit immediately before this ticket's work (`5b31ea95b`, i.e. right after #1044) and re-ran the
  same default-base command — identical 38 violations, byte-for-byte. `origin/main` on this host
  carries 59 more commits than this lane's actual base `7bc5a710f` (`git log --oneline` at session
  start: "have 4 and 59 different commits each, respectively"), which is exactly what the work
  order's own addendum warns about ("Wherever a rule says `origin/main..HEAD`, use
  `7bc5a710f..HEAD`") — I did not find an equivalent override built into `pnpm lint`'s definition
  itself, so I supplied `FREEZE_BASE_REF` on the gate command's own environment instead of editing
  `package.json`. I did not verify whether the *reason* `origin/main` differs is itself already
  understood elsewhere (e.g. by the cut-phase or another wave's own report) — flagging as unverified
  rather than asserting a cause.
- **One flaky-looking run of `"ready r2: NO DSN component reaches the /ready payload or a warning
  line (H-48)"`**, during an intermediate full-file run under my first (later-replaced) design:
  `r.checks.pools.find is not a function` (the cache was still `{pending:true}` when the assertion
  ran). Re-run **3/3 in isolation**: all green. Re-run the full file **twice** under the shipped
  design: both green. This matches a flake this exact cell already carries in the historical record
  — `reports/wave4-lane07-ticket1033.md` calls it out by name as "the file's other host-contention
  flake noted in wave 1's gate record, was not investigated — out of scope." I did not investigate
  it further (out of this ticket's scope, per that same precedent), and it did not reproduce under
  the shipped design in either of my two full-file confirmation runs.
