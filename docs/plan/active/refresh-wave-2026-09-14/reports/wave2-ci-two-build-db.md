# wave 2 CI — the two-build drill gets its own database

Branch `integration/wave-2-ci` (off `integration/wave-2`), worktree `clara-wt/int2ci`, one commit
`dca72bba`, clean, not pushed.

## Diff (3 files, +73 / −25)

`.github/actions/db-live-gates/action.yml` — inside the Wave-B step, right after the world
bootstrap and before any e2e, `create database clara_rt_test template clara_wave_b_ci`. The
two-build drill and the world guard now bind `PGDATABASE` / `WORKFLOW_POSTGRES_URL` to it; every
other step is byte-unchanged and the order (work-cancel → periodic-adjustment → two-build →
plan-occurrence → world-guard LAST) is preserved. Comments rewritten: the header's cluster rule,
the wave-2 order paragraph (ordering was the old isolation argument; run 34793833626 disproved
it), the drill's cost note, and the world-guard note. `packages/runtime/README.md` blast-radius
paragraph and `docs/ARCHITECTURE.md` §5 的同一段 updated to match.

**Two deviations from the brief, both forced and both measured.**

1. **Template copy, not create/migrate/seed/bootstrap.** Migration 0154 (`0154_binding_proposal_pr_1.sql:3788`)
   asserts an absolute, cluster-global `count(*) from pg_roles where rolname like 'clara%' = 14`,
   so a second from-scratch migrate on postgres_c aborts — the rule the action's own header states.
   The clone is file-level; migrate+seed+bootstrap measured 139 s + 0.8 s + ~4 s in the CI log.
2. **`clara_rt_test`, not `clara_two_build_ci`.** `tests/two-build-cutover-e2e.mjs:93` THROWS and
   `tests/body-census-guard-db.test.mjs:63` SKIPS unless `PGDATABASE ∈ {clara_rt_test,
   clara_wave_b_ci}`. Measured: `PGDATABASE=clara_two_build_ci` → `Error: two-build-cutover-e2e is
   hard-gated…`, exit 1. `clara_rt_test` matches `EPHEMERAL_DB`'s `*_test` arm
   (`packages/db/lib/guard.mjs:32`) and appears nowhere else under `.github/`. No test source touched.

## Local dry-run (rig637, 127.0.0.1:55441, never reset)

Scratch template copies of `clara_637`, bootstrapped, dropped afterwards; `clara_rt_test` there is
the #637 worker's and was untouched.

- `TWO-BUILD CUTOVER E2E: ALL PASS`, exit 0 — `A carries 48 bodies … B carries 49`,
  `rollback to A REFUSED, naming claraWork_v2`, `RESUME W1 … afb2038addcd…`, `RESUME W2 …
  c8fd7670182d…`, `with both Works settled, rollback to A is now ALLOWED`.
- World guard on the **same** database straight after: `# pass 4 # fail 0 # skipped 0`, 17 s,
  including the `stranded bodies n=0` control cell.

YAML parses (PyYAML); every step body passes `bash -n`.

## Unverified

The GitHub runner's own timing for the template copy (claimed "seconds", measured only locally).
CI itself — not re-run here.
