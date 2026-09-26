# Riders closing wave (wave K) — rig prep

**Host** Windows 11 + WSL PostgreSQL 17 · main checkout `C:\Users\zhant\Desktop\clara-rebuild`,
branch `main`. Confirmed `git fetch -q origin` then `git rev-parse origin/main` = `ffb629d73`
(same commit as `HEAD`; local main was already current — `ffb629d73` is the sweep wave's docs
merge, "Merge pull request #1146 from BELCORT-SDN-BHD/docs/riders-sweep-as-run").

---

## 0. A quoting bug, caught and corrected before any lasting damage

The first attempt built each `git worktree add` path with `"C:\Users\zhant\Desktop\clara-wt\$n"`
in a Git Bash double-quoted string. Bash's double-quote rules only treat backslash as an escape
before `$`, `` ` ``, `"`, `\`, or newline — so `\$n` was consumed as the two-character escape for a
literal `$`, and the trailing `n` was left un-substituted. The path bash actually passed to git was
the literal string `C:\Users\zhant\Desktop\clara-wt$n` (a sibling of `clara-wt`, not a child), so
lane 1's worktree landed there instead of at `clara-wt/701`, and the retry for lanes 2–4 then hit
"already exists" (comparing the same unresolved literal path against itself) after `-b` had already
created the three lane branches.

Caught immediately from the `git worktree list` / `ls` output (a directory literally named
`clara-wt$n` sitting under `Desktop`, not inside `clara-wt`) before any install or migrate touched
it. Cleaned up in order:

```
git worktree remove --force 'C:\Users\zhant\Desktop\clara-wt$n'
git branch -D riders/wK-lane01
git branch -D riders/wK-lane02 riders/wK-lane03 riders/wK-lane04   # stray -b branches from the failed adds
```

`ls "C:\Users\zhant\Desktop"` confirmed no stray `clara-wt$n` directory remained. All four worktrees
were then rebuilt using forward-slash paths (`C:/Users/zhant/Desktop/clara-wt/70N`), which Git Bash
passes through unchanged with no backslash-escape hazard. Noted here so the next rig-prep session
does not repeat it: prefer forward slashes for any Windows path built with bash variable
interpolation, never a trailing `\$var`.

---

## 1. Four worktrees, four new lane branches

```
cd C:\Users\zhant\Desktop\clara-rebuild
git worktree add "C:/Users/zhant/Desktop/clara-wt/701" -b riders/wK-lane01 origin/main
git worktree add "C:/Users/zhant/Desktop/clara-wt/702" -b riders/wK-lane02 origin/main
git worktree add "C:/Users/zhant/Desktop/clara-wt/703" -b riders/wK-lane03 origin/main
git worktree add "C:/Users/zhant/Desktop/clara-wt/704" -b riders/wK-lane04 origin/main
```

`git worktree list` after:

```
C:/Users/zhant/Desktop/clara-rebuild ffb629d73 [main]
C:/Users/zhant/Desktop/clara-wt/701  ffb629d73 [riders/wK-lane01]
C:/Users/zhant/Desktop/clara-wt/702  ffb629d73 [riders/wK-lane02]
C:/Users/zhant/Desktop/clara-wt/703  ffb629d73 [riders/wK-lane03]
C:/Users/zhant/Desktop/clara-wt/704  ffb629d73 [riders/wK-lane04]
C:/Users/zhant/Desktop/clara-wt/int  eecd9695b [riders/w4-chart]     # pre-existing, untouched
C:/Users/zhant/Desktop/clara-wt/int2 ffb629d73 (detached HEAD)       # pre-existing, untouched
```

Every lane worktree sits at `ffb629d73`, tracking `origin/main`.

### `pnpm install --frozen-lockfile` per worktree

`CI=true pnpm install --frozen-lockfile --prefer-offline`, run concurrently, each redirected to its
own log:

| lane | worktree | wall time | exit | `git status` after |
|---|---|---|---|---|
| L1 | `701` | 2m 58.2s | 0 | clean |
| L2 | `702` | 2m 57.1s | 0 | clean |
| L3 | `703` | 2m 55.1s | 0 | clean |
| LC | `704` | 2m 53.6s | 0 | clean |

All four resolved 1058 packages, 0 downloaded (fully served from the local store), no lockfile
drift (`pnpm-lock.yaml` and `git status` unchanged in every worktree — the side-effect-free shape
RIG.md's `@shadcn/react` note asks to confirm before trusting a later failure as a real defect).

### `pnpm typecheck` per worktree

`pnpm typecheck` from each worktree root, timed:

| lane | worktree | wall time | result |
|---|---|---|---|
| L1 | `701` | 1m 12.1s | `packages/runtime typecheck: Done`, `apps/web typecheck: Done`, exit 0 |
| L2 | `702` | 1m 10.7s | same, exit 0 |
| L3 | `703` | 1m 9.0s | same, exit 0 |
| LC | `704` | 1m 7.5s | same, exit 0 |

All four clean. (RIG.md's own estimate of "~4 min" is the whole-suite figure from an earlier,
colder cache; these ran warm off the just-completed installs and finished faster.)

---

## 2. Four databases on cluster 127.0.0.1:55742, cloned from `clara_intS6`

Per this file's own instruction, `clara_intS6` is the sweep merger's ordered 337-file chain that
gate A proved byte-equal to a from-scratch chain, so a template copy is the sanctioned rig shape —
not a fresh `migrate` from 0001.

```
createdb -h 127.0.0.1 -p 55742 -U postgres -T clara_intS6 clara_c01
createdb -h 127.0.0.1 -p 55742 -U postgres -T clara_intS6 clara_c02
createdb -h 127.0.0.1 -p 55742 -U postgres -T clara_intS6 clara_c03
createdb -h 127.0.0.1 -p 55742 -U postgres -T clara_intS6 clara_c04
```

(Run through `wsl -- createdb …`, since `psql`/`createdb` are not on the Windows/Git-Bash `PATH` on
this host; confirmed with `wsl -- which psql createdb pg_isready` first. All four `exit=0`.)

Immediately after creation, each read (`select count(*), max(version) from
clara.schema_migrations`):

| database | count | max(version) |
|---|---|---|
| `clara_c01` | 337 | `0361_reservation_release_advice` |
| `clara_c02` | 337 | `0361_reservation_release_advice` |
| `clara_c03` | 337 | `0361_reservation_release_advice` |
| `clara_c04` | 337 | `0361_reservation_release_advice` |

Matching `clara_intS6` itself (checked first, same read: 337 / `0361_reservation_release_advice`)
and the prompt's own figures.

`clara_l02` (the pristine 312-file template, NOT to be touched) was read once for contrast:
312 rows, max `0323_trade_invoice_probe_self_exclusion` — untouched, confirmed unrelated to this
wave's frontier.

### `pnpm --filter @clara/db migrate` — 0 new applied, from each lane's own worktree

```
PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_c0N CLARA_RIG_DB=1 \
  pnpm --filter @clara/db migrate
```

run from `701` against `clara_c01`, `702` against `clara_c02`, `703` against `clara_c03`, `704`
against `clara_c04`. All four reported:

```
[notice] schema "clara" already exists, skipping
[notice] relation "schema_migrations" already exists, skipping
note: 1 isolation-pinned migration(s) already applied and skipped (0057_wave_e_registry_snapshots · repeatable read)
migrate: 0 new migration(s) applied · 337 total · target 127.0.0.1:55742/clara_c0N
```

No drift on any of the four.

---

## 3. Lane smoke battery — one db test file under the full gate chain

Ran, per lane, from `packages/db` of that lane's own worktree:

```
PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_c0N CLARA_RIG_DB=1 \
  CLARA_ALLOW_DESTRUCTIVE=1 \
  node --test --test-concurrency=1 $GATES tests/prepayment-close-standing-instruction.test.mjs
```

where `$GATES` is the exact ordered list of `--import ./tests/*-preintegration-gate.mjs` flags
copied verbatim out of `packages/db/package.json`'s `"test"` script (154 gate imports; extracted
once with a small Node snippet and reused across all four lanes so every lane ran the identical
gate chain).

| lane | database | tests | pass | fail | skipped | duration | exit |
|---|---|---|---|---|---|---|---|
| L1 | `clara_c01` | 18 | 18 | 0 | 0 | 26.10s | 0 |
| L2 | `clara_c02` | 18 | 18 | 0 | 0 | 25.49s | 0 |
| L3 | `clara_c03` | 18 | 18 | 0 | 0 | 25.30s | 0 |
| LC | `clara_c04` | 18 | 18 | 0 | 0 | 23.56s | 0 |

All four green, no cancelled, no todo. Re-read each database's `schema_migrations` afterward: all
four still 337 / `0361_reservation_release_advice` (the gate chain and smoke test are read/rollback
oriented and left no migration drift).

---

## 4. Final state

| lane | worktree | branch | cluster port | database | migrate | typecheck | smoke |
|---|---|---|---|---|---|---|---|
| L1 | `clara-wt/701` | `riders/wK-lane01` | 55742 | `clara_c01` | 0 new / 337 | 1m 12.1s, clean | 18/18 pass |
| L2 | `clara-wt/702` | `riders/wK-lane02` | 55742 | `clara_c02` | 0 new / 337 | 1m 10.7s, clean | 18/18 pass |
| L3 | `clara-wt/703` | `riders/wK-lane03` | 55742 | `clara_c03` | 0 new / 337 | 1m 9.0s, clean | 18/18 pass |
| LC | `clara-wt/704` | `riders/wK-lane04` | 55742 | `clara_c04` | 0 new / 337 | 1m 7.5s, clean | 18/18 pass |

Every worktree's `git status` reads clean after install, typecheck, migrate and the smoke run.
`clara_l02` and `clara_intS6` were touched read-only (one count/max query each) and are otherwise
unchanged. `docs/plan/active/riders-2026-09-20/RIG.md` carries the lane table under "## Closing
wave (2026-09-26)"; both it and this report are uncommitted in the main checkout, left for the
orchestrator to commit.

No `git worktree` subcommand and no postgres command were run from WSL against the main checkout's
git state — `git worktree add`/`remove`/`branch` all ran from Git Bash on Windows; WSL was used
only for `psql`/`createdb` (postgres client binaries, not on the Windows/Git-Bash `PATH`) and only
against the already-running WSL-hosted PostgreSQL cluster. No `git gc`, no `CLARA_RIG_ALLOW_RESET`,
no push, no GitHub write, no subagent spawned, no process killed that this session did not itself
start. `clara-wt/int` and `clara-wt/int2` were listed (`git worktree list`) but never entered or
modified.

**Unverified / left for the orchestrator:** no e2e/Playwright walk was run against the assigned
triples (3600/3601/3602 for L1, 3610.. for L2, 3620.. for L3, 3630.. for LC) — the brief asked for
one lane battery as a smoke of the rig, which the db test above satisfies; the Playwright ports are
provisioned in the RIG.md table but not exercised. Migration numbers for the closing wave's own
tickets are not reserved here — RIG.md's existing convention (orchestrator assigns 0362 upward) was
left for the orchestrator to state explicitly when it hands out tickets.
