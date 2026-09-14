# #637 — the two-build drill's first Linux failure: `/ready` answered by a dead predecessor

Branch `integration/wave-2-tb` (from `integration/wave-2` @ 3adc3043), one commit `a4f3cb47`, not pushed.

## Cause

`/ready` is not proof that *this* process's world is up. Its world/control conjuncts read
`clara.runtime_heartbeats`, one row per component for the **whole estate** (0006 §2.8) inside a
30 s staleness window (`lib/health.mjs:50`). `lib/health.mjs:492-500` already names that window,
refusing to infer a refused world start from a missing beat: *"a fresh beat from the previous
process would otherwise mask it for a whole staleness window."* The drill manufactures exactly
that condition — stop A, spawn B, same database, one second apart.

CI log (run 34796679822, job `db-live-gates`):

- `01:51:38.7175370 [tb-e2e] build A stopped` → `01:51:40.1457498 TWO-BUILD CUTOVER E2E: FAIL`.
  B's whole spawn → `/ready` 200 → assert took **1.43 s**.
- `01:51:25.59 → 01:51:37.23`: build A, on the same runner and the same `waitReady`, needed
  **11.6 s** — it had no predecessor beat to borrow (pristine `clara_rt_test`).
- No `[B:<port>]` stderr line, no `stranded bodies`, no `REFUSING` → B did not crash and was not
  refused (rules out candidate 1). `serving`, `claraWork=claraWork_v2`, `bodies=49` all passed, so
  the capture and its regexes work on Linux (rules out 2 and 4): the provenance line is emitted
  *first*, before the census and before `await getWorld().start?.()`; the two banners are logged
  only *after* it (`plugins/startWorld.ts:265-278`). B's banners simply had not been printed yet.

## Fix — `packages/runtime/tests/two-build-cutover-e2e.mjs`

`waitBooted(image, {banners})`: bounded wait, after `/ready`, for that image's **own** boot lines
(provenance, `durable world started pid=`, each banner it is about to assert), failing with the
child's own stdout/stderr. Applied to A too. Child stdout is now read line-by-line, not per pipe
chunk (a split banner read as absent). The window `/ready` cannot see is printed.
Nothing is weakened: B must still log both frozen banners, carry the predecessor body and resume W1
on it. Freeze-lint: 264 files / 49 modules, unchanged.

## Local evidence (rig637, `clara_637` template copy migrated to 0194; scratch DB dropped)

- Clean run: `TWO-BUILD CUTOVER E2E: ALL PASS` (51 s); B's world up **1 ms** after `/ready` — why
  this host never saw it.
- **Red-first control**: an 8 s delay inserted before `getWorld().start?.()` in the built bundle →
  unfixed drill failed *verbatim* (`B logs the predecessor bundle banner`, line 472); fixed drill
  passed, waiting **7893 ms**. B had written no beat, so the 200 was A's.
- `pnpm typecheck`, `pnpm lint` green.

## Unverified until the next CI run

That the Linux window closes within the 120 s deadline (here: 8 s forced, 1 ms natural); whether
Linux's graceful SIGTERM exit (`code:0` vs this host's `signal:SIGTERM`) shifts the window; and
whether any *other* `/ready`-as-boot-signal caller in `db-live-gates` shares the defect.
