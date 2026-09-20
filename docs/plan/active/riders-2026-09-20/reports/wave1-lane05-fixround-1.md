# Wave 1 — Lane 05 fix round 1

Branch `riders/w1-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, DB `clara_l05` @
`127.0.0.1:55745`. Head going in: `a4db0de2` (unchanged from the review). Head coming out:
**`ab6683c0`**.

New commits (on top of `a4db0de2`):

- `b39240c8` — `fix(scripts): #849 fix round — retire's missing-path fall-through, denominator, canary exclusion`
- `509b22d7` — `test(db): #957 fix round — prove redo refuses on a non-rig target`
- `ab6683c0` — `docs(web): #969 fix round — record the strip-after-write window explicitly`

Source: `docs/plan/active/riders-2026-09-20/reports/wave1-lane05-review-spec.json`
(`verdict: accept-with-fixes`). All five assigned findings (L05-S01, L05-S02, L05-S03, L05-S04,
L05-S07) FIXED; none refuted, none deferred. (L05-S05/S06/S08/S09/S10/S11/S12 are `note`-severity
and not in the assigned findings list for this round.)

## L05-S01 (ticket #849, minor) — FIXED

**Claim.** `packages/runtime/README.md`'s `--print-closure` example claimed the module was
"locked by 6 of 312 @frozen entry file(s)"; the real command prints "6 of 299". 312 is the
manifest's frozen-**module** union (`workflows` count), not the `@frozen` **entry-file** count
`formatClosureReport` divides by.

**Fix.** Corrected the README line to "6 of 299 @frozen entry file(s)".

**Evidence.**
- File: `packages/runtime/README.md` (the `<!-- #849 -->` block).
- Re-run: `node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/lib/work-trace.mjs`
  → `... is locked by 6 of 299 @frozen entry file(s):` (byte match with the corrected README line).
- Commit: `b39240c8`.

## L05-S02 (ticket #849, minor) — FIXED

**Claim.** `--retire` with no path argument (`RETIRE_PATH` resolving to `null`) fell through the
`if (RETIRE_PATH)` gate in `check-frozen-workflows.mjs` into an ordinary verify and exited 0 —
the one malformed `--retire` invocation that did not fail loud, unlike its three siblings
(file-present, no-current-entry, missing-ruling, all handled inside `retireFrozenEntry`).

**Fix.** `RETIRE_INDEX`/`RETIRE_PATH` parsing now also tracks `RETIRE_FLAG` (`--retire` present at
all), and a next token starting with `--` is treated as no path given (mirroring
`--print-closure`'s own module-argument parsing, so `--retire --ruling <ref>` cannot silently take
`--ruling` as the path either). `main()` refuses (exit 1, `--retire requires a path argument
(usage: --retire <path> --ruling <ref>); no manifest write.`) before reaching the existing
`if (RETIRE_PATH)` block.

**Test-first.** Two new cells in `scripts/check-frozen-workflows.selftest.mjs` spawn the real CLI
as a subprocess (the file's other `--retire` cells exercise the pure `retireFrozenEntry` directly,
but this defect lives in `check-frozen-workflows.mjs`'s own argv wiring, which cannot be imported
without triggering its `process.exit(main())` at module load — the same through-the-CLI pattern
`scripts/ops/dsn-pipe.selftest.mjs` already uses for its own CLI-level cells). Ran RED against the
pre-fix CLI (`--retire` with no path exited 0), then GREEN after the fix. Both cells also read
`frozen-workflows.json` before and after to confirm no manifest write.

**Evidence.**
- File: `scripts/check-frozen-workflows.mjs` (parsing + new refusal in `main()`);
  `scripts/check-frozen-workflows.selftest.mjs` (two new cells).
- Re-run: `node scripts/check-frozen-workflows.selftest.mjs` → `OK — all cases passed.`
- Manual re-verification of all four `--retire` refusal paths after the fix, each exit 1 with
  `git status --porcelain` empty afterward:
  - `--retire` (no path) → `freeze-lint: --retire requires a path argument ...`
  - `--retire <never-registered path> --ruling "..."` → `has no current entry in the manifest`
  - `--retire <a still-present frozen file> --ruling "..."` → `is still present in the tree`
  - `--retire <path>` (no `--ruling`) → `--retire requires --ruling <ref>`
  - `CI=1 --retire <path> --ruling "..."` → `--retire is REFUSED under CI`
- Ordinary (unfiltered) verify still green: `freeze-lint: OK — 312 frozen file(s) verified ...; 3
  retired entr(ies) recorded.`
- Commit: `b39240c8`.

## L05-S03 (ticket #849, minor) — FIXED

**Claim.** The "#849 REAL repo canary" cell (`check-frozen-workflows.selftest.mjs`) only asserted
that every entry reaching `lib/work-trace.mjs` appears in the filtered `--print-closure` report; it
never asserted any entry is **excluded**, so a `formatClosureReport` that ignored its `moduleFilter`
argument entirely (returning the full, unfiltered report) would still have passed the cell — the
opposite of what its name ("matches ... exactly") claims.

**Fix.** Added the exclusion half to the same cell, against the same real tree: computes the set of
real `@frozen` entries that do **not** reach `lib/work-trace.mjs` (`closure.byEntry.keys()` minus
the reaching set) and asserts none of them appear in the filtered report, with a guard that fails
loudly if the fixture assumption (some entry must not reach it) ever breaks.

**Evidence.**
- File: `scripts/check-frozen-workflows.selftest.mjs` (the "#849 REAL repo canary" cell).
- Re-run: `node scripts/check-frozen-workflows.selftest.mjs` → the strengthened cell PASSes against
  the real, correct `formatClosureReport` implementation (no production code changed here — only
  the test was weak).
- Commit: `b39240c8`.

## L05-S04 (ticket #957, minor) — FIXED

**Claim.** The lane brief named explicitly "the redo mode must be gated behind the destructive flag
and refuse on a non-rig target." AC2 in `migrate-redo.test.mjs` only ever exercised the FIRST half
of `lib/guard.mjs`'s `assertDestructiveAllowed` (the `CLARA_ALLOW_DESTRUCTIVE` check); every cell in
the file connects to `127.0.0.1`, which `targetIsEphemeral()` accepts regardless of database name,
so the guard's SECOND limb (`REFUSED for non-ephemeral target ...`) was never reached on the redo
path. The behaviour was correct by delegation (`migrate.mjs` calls the shared gate before opening
any connection) but unproven for redo specifically.

**Fix (test-only — no production defect).** Added one connection-free cell:
`CLARA_ALLOW_DESTRUCTIVE=1`, `CLARA_DESTRUCTIVE_TARGET` unset, `PGHOST` pointed at a fake
non-loopback host (`prod-pooler.example-clara.internal`) with a non-ephemeral-shaped `PGDATABASE`
(`clara_live`), `redo` set to a version that has a file on disk — asserts
`/REFUSED for non-ephemeral target/`, with a `clientFactory` that throws if ever called (proving no
connection opens). `resolveTarget()`/`assertDestructiveAllowed()` are pure env parsing with no I/O,
matching the existing "no migration file on disk" cell's own idiom, so this needed no second real
Postgres.

**Vacuity control.** Temporarily changed `packages/db/lib/guard.mjs`'s
`if (targetIsEphemeral(label)) return;` to an unconditional `if (true) return;` and ran only the new
cell: it FAILED for the right reason (the `clientFactory` throw fired — proving `migrate()` would
have opened a connection once the guard was bypassed). Restored `guard.mjs` byte-for-byte
(`git checkout -- packages/db/lib/guard.mjs`; `git status --porcelain` on that file was empty
afterward) before re-running green.

**Evidence.**
- File: `packages/db/tests/migrate-redo.test.mjs` (one new test).
- Re-run (rig DB): `PGHOST=127.0.0.1 PGPORT=55745 PGUSER=postgres PGDATABASE=clara_l05
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node --test --test-concurrency=1 $GATES
  tests/migrate-redo.test.mjs` from `packages/db` → **8 tests / 8 pass / 0 fail** (was 7; new cell
  ran in ~2ms, no DB connection).
- Same `$GATES` chain, `operation-census.test.mjs` → 10/10 pass; `rig-isolation.test.mjs` → 20 pass
  / 1 correctly-gated skip (T19, `CLARA_RIG_ALLOW_RESET` never set).
- Commit: `509b22d7`.

## L05-S07 (ticket #969, minor) — FIXED (documentation; pre-filter shape checked and ruled out of scope)

**Claim.** `cn` is dropped AFTER the pinned CLI writes it (`ui-add.mjs`'s `main()` runs `spawnAdd`
first, then `stripLocalDependencies`), not before — a third shape neither of the ticket's own two
offered ("drops it before the CLI writes it, or refuses and names it"). The AC is met (no `cn`
survives a successful run), but an interrupt between the two spawns leaves exactly the hand-revert
#969 exists to abolish, and every install writes the lockfile twice. `components/ui/README.md` read
as if nothing were ever written in between.

**Investigated the pre-filter alternative before choosing documentation** (the review's own
`required_fix` names either as acceptable): ran `node_modules/.bin/shadcn.CMD add --help` against
the pinned 4.19.0 binary — its only flags are `-y/-o/-c/-a/-p/-s/--dry-run/--diff/--view`; there is
no flag to skip or filter the dependency-install step. Pre-empting it would mean either patching the
pinned CLI (out of scope for a wave-1 lane) or shipping a real, empty `cn` package for its installer
to find already-satisfied (trading one workaround for a stranger one). Concluded the pre-filter
shape is not reachable within this ticket's scope and took the documentation route.

**Fix.** Added a paragraph to `apps/web/components/ui/README.md`'s `#969` section naming the actual
order, the window it leaves, why the pre-filter shape was checked and ruled out (citing the `--help`
output), and the hand-revert fallback (`git status` + manual revert) for a caller that cannot
tolerate the window.

**Evidence.**
- File: `apps/web/components/ui/README.md`.
- No code change — `ui-add.mjs` behaviour is unchanged, so `check-ui-add-guard.selftest.mjs`'s
  existing `#969` cells (including `[AC1] ... the CLI is invoked, THEN the guard strips cn`) still
  describe the delivered order correctly.
- Re-run: `node scripts/check-ui-add-guard.selftest.mjs` (from `apps/web`) → all cases pass, unchanged.
- Commit: `ab6683c0`.

## Gates re-run (this fix round)

- `node scripts/check-frozen-workflows.selftest.mjs` → OK, all cases pass (2 new + 1 strengthened
  `#849` cell).
- `node scripts/check-frozen-workflows.mjs` (ordinary verify) → OK, 312 frozen file(s), 3 retired.
- `--print-closure` and all four `--retire` refusal paths manually re-run; `git status --porcelain`
  clean after each.
- `packages/db`, `$GATES` chain: `migrate-redo.test.mjs` → 8/8 pass; `operation-census.test.mjs` →
  10/10 pass; `rig-isolation.test.mjs` → 20 pass / 1 correctly-gated skip. Ran against `clara_l05` on
  `127.0.0.1:55745`.
- `apps/web`: `node scripts/check-ui-add-guard.selftest.mjs` → all cases pass (unchanged).
- `pnpm typecheck` (worktree root) → exit 0.
- `pnpm lint` (worktree root) → exit 0 (includes the wired `check-frozen-workflows.selftest.mjs` and
  `check-ui-add-guard.selftest.mjs`).
- `git status --porcelain` clean at the end of the round.

## What was deliberately left

- L05-S05, L05-S06, L05-S08, L05-S09, L05-S10, L05-S11, L05-S12 — all `note` severity, not in this
  round's assigned findings list; untouched.
- L05-S07's pre-filter shape (dropping `cn` before the CLI ever writes it) is recorded as a
  successor contract in `components/ui/README.md` rather than built — the pinned CLI's own surface
  has no hook for it (see evidence above).

## Successor contracts

- A caller wanting the pre-filter shape for `#969`'s `cn` stand-in would need to intercept the
  pinned `shadcn` CLI's own package-manager invocation (not just its file-write step), which is a
  change to how `defaultSpawnAdd`/dependency resolution are wired, not a one-line fix — out of this
  ticket's and this wave's scope. Recorded in `apps/web/components/ui/README.md`.

## Unverified

- Nothing new. (L05-S05's own note — that AC1's literal `backup.mjs --profile full` command needs a
  hosted DSN and `pg_dump` 17 neither this lane nor the reviewer ran — is unchanged and out of this
  round's assigned findings.)
