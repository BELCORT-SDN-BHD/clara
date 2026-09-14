# Wave-2 CI boot race — four World e2e legs wait for their own boot lines

Branch `integration/wave-2-boot` (from `integration/wave-2` @ d4755724), one commit `2cf1b4a5`, not pushed.

## Diff shape (all four files)

Each file's private `spawnServe`/`waitReady` gained the two-build-cutover idiom:
- stdout capture switched from per-chunk regex to line-buffered `ingest()` (a banner split across a chunk boundary was previously read as never logged); state gained `serving` (provenance line) and `stdout` alongside the existing `banner`.
- a new private `waitBooted(engine, deadlineMs=30000)`: after `/ready` answers 200, polls the captured state until both `serving` and `banner` are set, or throws with the child's own stdout/stderr attached.
- `waitReady` calls `waitBooted` when an `engine` handle is passed, before returning.
- `work-cancel-e2e.mjs` / `work-question-e2e.mjs`: `waitReady` already accepted `engine`; wired `waitBooted` in, and threaded `engine` through the work-question call sites that omitted it (PORT_A/B/C/D legs).
- `periodic-adjustment-e2e.mjs` / `work-journal-e2e.mjs`: `waitReady` had no `engine` param at all; added it and threaded the engine handle (`first`/`faulty`/`respawned`, plus `narrator`/`poster` in work-journal) through every call site, not only the one with the banner assert.

All four banner assertions are unchanged — now measured after the wait, not raced.

## Red-first control

The full test files don't naturally race locally (leg 2's engine is each file's *first* spawn, so there's no fresh predecessor heartbeat to borrow). Isolated the exact two-build shape in a throwaway script (spawn A, wait, kill, spawn B immediately) against an 8s delay inserted before `getWorld().start?.()` in `.output/server/index.mjs`:
- **unfixed**: B's `/ready` returned 200 after **1124ms** (borrowing A's heartbeat); `assert.ok(banner)` failed verbatim — `serving` present, `banner=(never logged)`, matching PR #807's failure shape exactly.
- **fixed**: `waitReady` returned after **9388ms**; `waitBooted` measured **8002ms** waited after `/ready`'s own 200; banner and serving both present. PASS.

Delay removed, bundle rebuilt clean before final runs.

## Local PASS (rigw2c 127.0.0.1:55457, `clara_rt_test` @ 0194 — rig637's `clara_637`/`clara_rt_test` at 0187 turned out stale for this branch's code, which reads `accounting_work.adjustment_basis` unconditionally)

`WORK CANCEL E2E: PASS`, `WORK JOURNAL E2E: PASS`, `WORK QUESTION E2E: ALL LEGS PASSED`, `PERIODIC ADJUSTMENT E2E: PASS`. `pnpm typecheck` and `pnpm lint` green.

## Unverified

That CI's Linux window (measured 1.4s in #637's own report) stays inside the 30s `waitBooted` deadline under CI load; whether other `/ready`-as-boot-signal callers in `db-live-gates` share the defect.
