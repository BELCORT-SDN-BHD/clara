# wave 1 · lane 05 — /code-review fix round

**Branch** `riders/w1-lane05` · **worktree** `C:\Users\zhant\Desktop\clara-wt\655` · **tickets** #849, #917, #957, #959, #994, #969
**Reviewed head** `ab6683c0` · **new head** `a7973b02`
**Fixed point** `origin/main e7f0a10a`

Eleven findings arrived from `/code-review` (the two JSON reports beside this file): seven on the
SPEC lens (`L05B-S01`…`S07`) and four on the STANDARDS lens (`L05-STD-01`…`04`). Eight called for a
code change and are fixed, one slice each, across five commits — one per ticket. Three needed no
change and are answered with evidence below.

> **Why this file appeared late.** The eight fixes were written in the working tree but never
> committed, and this narration was never written. `wave1-lane05-codereview-recheck.json` caught
> exactly that as `RC-01` (major): the lane's committed history still showed every finding open.
> The fix worker who answered `RC-01` committed the work, re-proved each slice, and recorded that
> round in `wave1-lane05-codereview-fix-2.md` beside this file. Read the two together.

## New commits, one ticket each

| commit | ticket | findings | what it does |
|---|---|---|---|
| `e2403227` | #917 | `L05B-S01`, `L05B-S02` | `WSLENV` carries `CLARA_BACKUP_DIR/p`; the narrower WSL-side TLS guarantee is written down |
| `e303d6b1` | #969 | `L05B-S03` | a non-zero `shadcn add` exit still strips the `cn` the pinned CLI already installed |
| `e8eb79ba` | #849 | `L05B-S04`, `L05-STD-02` | `checkRetiredRecords` extracted and driven by a cell; one `optionalArgAfterFlag` for three flags |
| `86c0ec28` | #994 | `L05B-S05` | `NO_RAW_COLOR_VALUES`'s message states the real trip condition (3/4/6/8 hex run) |
| `a7973b02` | #957 | `L05-STD-03`, `L05-STD-04` | one shared per-migration body; AC1's checksums come from an independent source |

Diff against the reviewed head: 14 files, 326 insertions, 71 deletions. No migration, no frozen
workflow body, no module in a frozen closure (`node scripts/check-frozen-workflows.mjs` -> OK, 312
frozen files, 3 retired entries, no manifest diff). `packages/runtime` untouched.

---

## `L05B-S01` (#917) — `WSLENV` says nothing about how the child's TLS stack *uses* the CA · FIXED (documentation)

The `--child-os wsl` bridge respells the pinned CA and hands it across, and the module header plus
`packages/db/README.md` read as though the DSN-level exclusivity pin carried across with it. It
does for libpq (`pg_dump`/`psql` read `PGSSLMODE=verify-full` + `PGSSLROOTCERT` and treat the pinned
CA as exclusive). It does **not** for a Node `pg` client running on the WSL side: `DATABASE_URL` is
deliberately not in `WSLENV`, so `packages/db/lib/pg.mjs`'s `connConfig()` returns `{}`,
node-postgres falls back to `readSSLConfigFromEnvironment()`, and `PGSSLMODE=verify-full` becomes a
bare `ssl: true` — `NODE_EXTRA_CA_CERTS` then only *augments* Node's global trust store.

Not a regression (the hand wrapper being replaced had the identical shape) and not a defect in
`pg_dump`'s trust. It is a real, narrower guarantee on one leg, now stated in three places a reader
actually lands on: the `WSL_ENV_LIST` header in `scripts/ops/dsn-pipe.mjs`, the "Backup and
recovery" section of `packages/db/README.md`, and the `#917` update block in
`RELEASE-RUNBOOK-0225-0233.md`.

## `L05B-S02` (#917) — `CLARA_BACKUP_DIR` fell off the WSL crossing · FIXED

The hand wrapper this flag replaces carried `CLARA_BACKUP_DIR` (`RELEASE-RUNBOOK-0225-0233.md:213`);
`WSL_ENV_LIST` did not. `packages/db/scripts/backup.mjs:54` reads that variable, so a WSL-side
`--profile full` silently wrote to `backup.mjs`'s default directory instead of the operator's
chosen one — a silent wrong-place write, not a failure.

Added as `CLARA_BACKUP_DIR/p`, with the `/p` flag and not a pre-respelling: unlike
`PGSSLROOTCERT`/`NODE_EXTRA_CA_CERTS`, dsn-pipe never reads or rewrites this value itself, so WSL's
own `WSLENV` machinery has to do the `C:\…` -> `/mnt/<drive>/…` translation.

**Cell** `(#917 fix round, L05B-S02) WSLENV also names CLARA_BACKUP_DIR with the /p
path-translation flag…` — drives the real CLI with `CLARA_BACKUP_DIR` set on the Windows side and
reads what the grandchild actually received.

## `L05B-S03` (#969) — "the add failed" was treated as "nothing was written" · FIXED

`main()` returned on any non-zero `spawnAdd` exit before the guard's strip could run. Measured
against the pinned bundle (`apps/web/node_modules/shadcn/dist/chunk-CDOZT3OO.js`), the add flow's
own `yh()` installs dependencies **first** and writes files second — so a failure in that later half
leaves the bogus local `cn` sitting in `package.json` and `pnpm-lock.yaml`. The most ordinary
failure there is reached exactly the hand-revert state #969 exists to abolish.

`main()` now strips on that path too and names the CLI's own exit code in its log, while still
propagating that exit code. Two exceptions keep their old behaviour and now have their own cells:
`--dry-run` (writes nothing at all, whatever its exit code) and the override (wants `cn` kept).
`apps/web/components/ui/README.md` now separates the ordinary non-zero exit (handled) from the
genuine interrupt between the two spawns (still the documented hand-revert window).

## `L05B-S04` (#849) — AC2's verifier could not be driven by a test · FIXED

AC2 promises "a subsequent verify run reports no `RETIRED-*` violation", but the four invariants
(`RETIRED-DUPLICATE` / `-NO-HASH` / `-NO-RULING` / `-PRESENT`) lived inline in
`check-frozen-workflows.mjs`'s `main()`. The selftest checked `retireFrozenEntry`'s output against
`compareFrozenManifestText` instead — a different question, so AC2 was never actually proved.

`checkRetiredRecords` now lives in `scripts/freeze-lint-retire.mjs` beside the write side, and
`main()`'s "2c. RETIREMENT INTEGRITY" section calls it: one copy of the rules, and the selftest
exercises production code rather than a re-implementation. Two cells: the AC2 clean case, and a
deliberately broken record that must fire all four codes (so the clean case cannot pass vacuously).

Also added the missing **success-path CLI cell**. Every other #849 CLI cell drives a refusal (safe:
a refusal never writes), so nothing proved that a successful `--retire` writes what
`retireFrozenEntry` produces. The new cell `git init`s a throwaway repo with its own manifest and
byte-matches the written file.

## `L05B-S05` (#994) — the lint message described the symptom, not the condition · FIXED

The NOTE said the selector "cannot tell a real colour from any other short hex-looking token after
`#`" — true, and unactionable: a reader who trips on `#658` cannot tell which strings are safe. The
selector matches a `#` immediately followed by a run of 3, 4, 6 or 8 hex characters (plus the
`rgba()`/`hsla()`/`oklch()`/`oklab()`/`lch()`/`lab()` call heads). The message now says exactly
that. The rule is unchanged: the recommended fix is still to reword the string, never to weaken the
selector (owner ruling Q4, 2026-08-27).

## `L05B-S06` (#959) — no fix required · HOLDS

The source report records this as a documented divergence in `maskComments`'s
`skipQuoted`/`skipDollar` contract note, not a defect. Re-read at `a7973b02`: unchanged, and the
note still states the divergence.

## `L05B-S07` (#957) — no fix required · HOLDS

The source report records the `migrate()` return-shape split as having no behavioural consequence:
its only caller (the `isMain` block) ignores the value. Re-read at `a7973b02`: still the case.

## `L05-STD-01` — no fix possible · ACKNOWLEDGED

The standards lens flagged that this lane's earlier commits carry a `Co-Authored-By: Claude Sonnet
5` trailer where WORK-ORDER rule 2 asks for `Claude Fable 5.1`. Those commits are landed; rewriting
them would rewrite the lane's history for a trailer, which is worse than the defect. **All five new
commits in this fix round carry the correct `Co-Authored-By: Claude Fable 5.1
<noreply@anthropic.com>` trailer** (verified with `git show -s --format=%B` on each).

## `L05-STD-02` (#849) — three drifting copies of one argv rule · FIXED

`--print-closure`'s module, `--retire`'s path and `--ruling`'s value each carried their own inline
copy of "the next token, unless it is itself a flag". The copies had already drifted: `--ruling`
skipped the guard, so `--retire <path> --ruling --some-flag` accepted `"--some-flag"` as the literal
ruling text instead of refusing as a missing ruling — a retirement recorded under a nonsense ruling.
One `optionalArgAfterFlag` helper now serves all three, with a regression cell for the `--ruling`
case.

## `L05-STD-03` (#957) — two identical pre-flight bodies · FIXED

`migrate()`'s redo and normal branches restated the same per-migration body (read, checksum, assert
no transaction control, assert no `check_function_bodies` override, push); only the set of files
differed. Now one loop over a `targets` list the branch chooses. #957's rule that redo touches only
the named version is unchanged and still stated where the list is built. Behaviour-preserving —
held by `tests/migrate-redo.test.mjs` 8/8.

## `L05-STD-04` (#957) — AC1 checked the subject against itself · FIXED

AC1 asserted the ledger's checksums with `migrationChecksum(sameString)`: a `migrationChecksum`
that returned a constant would have satisfied that half of the cell. Replaced with two literal
sha256 hex strings produced outside the subject. Per `tests.md`, expected values come from an
independent source.

---

## Gates (at `a7973b02`, all green)

| gate | result |
|---|---|
| `node scripts/ops/dsn-pipe.selftest.mjs` | ALL GREEN (3 skipped — the known Windows-only skips, RIG.md) |
| `node apps/web/scripts/check-ui-add-guard.selftest.mjs` | all cases passed (+3 cells this round) |
| `node scripts/check-frozen-workflows.selftest.mjs` | OK, all cases passed (+3 cells this round) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen, 55 `use workflow` modules, 3 retired, no manifest diff |
| `node scripts/eslint-config.selftest.mjs` | OK, all cases passed (+1 cell this round) |
| `packages/db` `tests/migrate-redo.test.mjs` | 8 tests, 8 pass, 0 fail |
| `packages/db` `tests/operation-census.test.mjs` | 10 tests, 10 pass, 0 fail |
| `packages/db` `tests/rig-isolation.test.mjs` | 21 tests, 20 pass, 1 known destructive skip |
| `apps/web` `node scripts/run-tests.mjs` (whole unit suite) | 4633 tests, 4631 pass, 0 fail, 2 skipped |
| `pnpm typecheck` (worktree root) | both workspaces Done, exit 0 |
| `pnpm lint` (worktree root) | exit 0 |

`packages/db` gates ran from `packages/db` against `clara_l05@127.0.0.1:55745` with the full
100-flag preintegration gate chain, never with the reset flags.

## Docs updated in the same commits

`scripts/ops/dsn-pipe.mjs` header, `packages/db/README.md` (backup/recovery),
`docs/plan/active/refresh-wave-2026-09-18/RELEASE-RUNBOOK-0225-0233.md` (#917 update block),
`apps/web/components/ui/README.md`. No new vocabulary, so `CONTEXT.md` is untouched.

## Not re-run

- **#917 AC1 end to end through `backup.mjs --profile full`** — needs a hosted DSN and `pg_dump` 17;
  unchanged from the source spec report's own `not_rerun` list. The WSL bridge's own behaviour is
  covered hermetically by `dsn-pipe.selftest.mjs`; what is unverified is the full hosted ceremony.
- **Browser walks** — this round touched no `.spec.ts`.
