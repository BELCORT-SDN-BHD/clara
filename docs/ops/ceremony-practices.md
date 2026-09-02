# Ceremony practices

**Owed by harness-audit ruling R6** (`docs/plan/active/harness-audit-rulings-2026-08-26.md`),
written during the 磨合 window. This is the consolidated runbook for practices that had
previously lived scattered across session logs and as-run records: **when to combine
migrations into one D1 window**, **the sleeper-machine DSN recipe**, and **run-id-pinned DONE
watchers**. It does not replace any single ceremony's own runbook (`wave-b-*-ceremony-
runbook.md`, `DR.md`, `dsn-bridge.md`, the as-runs under `docs/plan/completed/`) — it names
the practice each of those applies, in one place, with the commands.

This file is NOT listed in `AGENTS.md`'s harness menu; it is maintained through
`PROGRESS.md`'s Backlog, per `harness-audit-rulings-2026-08-26.md` R6.

## 1 · Combined-window vs. separate ceremonies

**A D1 write-quiesce window costs the same fixed overhead regardless of how many migrations
ride it**: bank first, stop `clara-runtime`, reap idle sessions, positive-read zero-non-idle,
apply, positive-read probes, restart, post-checks. That overhead is why the practice is to
**fold every migration that is ready and reviewed at ceremony time into ONE window**, rather
than opening a fresh window per migration — but only when every candidate migration has
independently cleared its own gate record and review ladder. A window never waits for an
unreviewed car to catch up, and it never skips a ready one to keep the window small.

**The two precedents, and what decided their shape:**

- **Wave-F W2+W3, run combined** (`docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`) — ten
  migrations (`0118`–`0127`) across **six independently-reviewed cars** (F-A2 cutover, F-A3's
  three-part bank agency, F-A4's Window-B close lifecycle, F-A7's three review-ladder trains,
  F-A5's archive doors) went through in one ~18-minute window. Each car had already cleared
  its own gate record, build, and cross-model review; the window's own value-add was the
  **first-chain-meeting fix round** — four of the six cars turned up an issue only visible
  once the whole batch met on one estate leg (a DR-roles omission and a frozen-window
  cross-PR pin on F-A3 PR-1b, a cross-package fixture gap on F-A7 γ, three failure classes on
  F-A7 β). **This is the argument FOR combining**: some defects are only reachable when
  several trains apply to the same live catalog in sequence, and a combined window is the
  only place that meeting happens before production sees it.
- **Wave-F W4, run separately, one window later** (`docs/plan/completed/wave-f-w4-ceremony-
  asrun.md`) — nine further migrations (`0128`–`0136`) plus the BL-3 evaluator deploy flip,
  run as its own window the next day rather than folded into W2+W3. It was NOT ready at
  W2+W3's ceremony time (F-A3 PR-3's clock train and the G1 wake engine were still building),
  so it waited for its own window rather than delaying W2+W3's six already-ready cars.

**The rule the two precedents together establish:** combine everything that is ready and
reviewed AT ceremony time into one window; never hold a ready, reviewed car back to wait for
a slower one, and never open a window for a car that has not cleared its own gate record yet.
The two windows' shared instrument set — pre-window manual-dispatch CI sweep ALL-GREEN, banked
backup first, pre-quiesce tripwire, write-quiesce with a positive zero-non-idle read, apply
via the DSN bridge, positive-read probes, restart + `/ready` 200 — repeats identically
regardless of how many migrations ride the window; only the migration count and car list
change.

**Before opening any window:** run the full manual-dispatch CI sweep against `main` at the
intended frontier (`gh workflow run ci.yml`) and require it ALL-GREEN, closed-wave drills
included — this is what W4 caught: the first sweep came back red on a stale closed-wave floor
(a retirement had gone unreflected in a floor pinned to the retired surface — the #352 law,
digest §10), and the fix landed as its own PR *before* the ceremony opened, not during it. A
ceremony never opens on a red sweep.

## 2 · The sleeper-machine DSN recipe

**Full mechanism and rationale:** `docs/ops/dsn-bridge.md` — read it before running any of
this. This section is the ceremony-time recipe, not a restatement of the bridge's design.

**Why a sleeper machine at all.** The live DSN is never held in a shell's persistent
environment or a file; it is captured **env-to-env**, once, for the duration of a single
piped command, from a Fly machine that already holds it as an app secret. `clara-backup` is
that app — its machines already carry `DATABASE_URL` (the session-pooler migration DSN) as an
inherited app secret, so a short-lived machine on that image is the natural place to read it
from without ever typing or storing it anywhere else.

```sh
# Start a throwaway machine on the clara-backup image that just sleeps — split argv,
# never a single quoted "sleep 5400" string (an unsplit form has flapped the container
# exit code on this platform before):
fly machine run registry.fly.io/clara-backup:<tag> --app clara-backup \
  -- sleep 5400

# Capture the DSN, env-to-env, piped straight into the CA-pinned bridge — never printed,
# never landing in a file or a variable that survives the pipe:
fly ssh console -a clara-backup --machine <sleeper-id> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs

# Destroy the sleeper at ceremony close — every as-run records this as an explicit step,
# not an assumption:
fly machine destroy <sleeper-id> --app clara-backup --force
```

**`dsn-pipe.mjs` is the load-bearing step, not the `fly ssh` pipe.** It forces
`sslmode=verify-full` and pins the committed pooler CA (`ops/tls/pooler-ca.crt`) onto
whatever DSN it reads on stdin, refuses to run if the CA fails its own structural preflight,
and never echoes what it read. **Never** run a bare `psql "$DATABASE_URL" -f file.sql` against
a captured DSN — that puts the DSN into `psql`'s own argv, visible to `ps` on that box; use
the PG* environment variables the bridge sets in the child's env instead (`docs/ops/dsn-
bridge.md` "What this bridge does not control").

**The deviation history — why `verify-full` is non-negotiable now.** Before the bridge
existed, ceremony DSNs were piped with `sslmode=no-verify` appended by hand (recorded, e.g.,
in `f-a1-pr1-ceremony-asrun.md` and `f-a1-pr3-ceremony-asrun.md`) — a connection that merely
says "encrypted" without verifying the certificate is silently unauthenticated TLS. That
tooling was also **session-local**: written for one ceremony, never committed, gone by the
next (`fix-queue-survey.md` F22 names this the handoffs-rule failure shape — a resume step
that depends on a session-local script is gone the moment the session is). `docs/ops/dsn-
bridge.md` and `scripts/ops/dsn-pipe.mjs` are the fix, committed for good: every ceremony
since (`w2-dsn-sleeper` at W2+W3, `w4-dsn-sleeper` at W4) has run `sslmode=verify-full` with
the pinned CA, on a sleeper machine that is created and destroyed inside the same session, and
the DSN is never printed, logged or persisted at any point.

**Two sleepers, one ceremony, is normal.** W4 ran one sleeper for the migration apply and a
second for the post-window evaluator manifest lock (`check-frozen-evaluators.mjs
--lock-deployed` also needs a live read) — both destroyed at close, zero residue confirmed in
the as-run. Do not reuse one sleeper across unrelated ceremony phases just to save a `fly
machine run`; a fresh sleeper per phase keeps the blast radius of a leaked credential at
"one command's lifetime."

## 3 · Run-id-pinned DONE watchers

**The lesson (W4 as-run, §2 field note):** *"the first DONE-watcher matched a STALE `DONE`
line from an earlier run in the same log stream. The detector must pin THIS run's id/
timestamp, not the phrase alone."* A detached ceremony script's log file is often reused or
appended to across attempts (a retry after a transient failure, a re-run after fixing a red
sweep) — a watcher that simply greps for a bare `DONE` or `===ALL_DONE===` string can match a
line an EARLIER attempt wrote, and report success for a run that never happened.

**The fix, as a practice for every detached ceremony/babysitter script, not just the one it
was found on:**

1. **Mint a run id before launch** — a timestamp or random token, written into the script's
   own first log line (`echo "RUN_ID=$RUN_ID" >> "$LOG"`), and into every terminal marker the
   script emits (`echo "===ALL_DONE run=$RUN_ID exit=$?===" >> "$LOG"`), never a bare phrase.
2. **The watcher grep pins the SAME run id**, not the phrase alone:
   `grep "===ALL_DONE run=$RUN_ID" "$LOG"` — a stale line from a prior attempt carries a
   different (or absent) run id and cannot match.
3. **Launch confirmation is separate from completion confirmation** — confirm the process is
   actually running (first-phase bytes appearing in the log, or process liveness via `fly
   machine status` / `ps`) within about a minute of launch, *before* starting to poll for the
   DONE marker; a watcher that only ever polls for DONE cannot distinguish "still running" from
   "never started."
4. **A replaced instrument is announced with its new path** — if a probe script, log path, or
   detector changes mid-ceremony (a rewritten probe, a different log file), say so explicitly
   in the ceremony record; a silent instrument swap is how a stale-DONE match goes unnoticed
   in the first place (a prior session's 0-byte-log incident was mis-read as a death verdict
   for exactly this reason — disambiguate via process liveness, never treat an empty read as
   proof of failure).

**Why this belongs in the runbook and not just the one script it was found on:** every
detached, backgrounded ceremony or long-running babysat command in this repo shares the same
log-reuse hazard — the fix is a pattern (run-id-pinned markers + a launch-liveness check
before the DONE poll), not a one-off patch to a single watcher.

## Related reading

- `docs/ops/dsn-bridge.md` — the bridge's full mechanism, CA provenance and validation,
  known limitations.
- `docs/plan/completed/wave-f-w2w3-ceremony-asrun.md`, `wave-f-w4-ceremony-asrun.md` — the two
  combined-window precedents this doc generalizes from.
- `docs/ops/DR.md` — backup/restore, the quarterly drill cadence, the full-profile recovery
  law.
- `.claude/rules/db-migrations.md` — the D1 write-quiesce obligation at the migration-authoring
  level (why a body-replacing migration needs a quiesce window at all).
- `packages/db/README.md` — the evaluator deploy ceremony's two separate halves (a different
  ceremony shape from a migration apply, but it shares this doc's DSN-bridge discipline).
