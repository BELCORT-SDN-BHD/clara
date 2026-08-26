---
paths: ["packages/db/tests/**"]
description: How to author a rig test here — the transaction, concurrency and isolation conventions the suite runs on.
---

# Writing a rig test

**Never assert an append-only guard with a bare TRUNCATE.** TRUNCATE takes ACCESS EXCLUSIVE on
the table *and every cascade dependent*, so with other writers live it can lose a deadlock
(40P01) or a lock-wait race (55P03) before ever reaching the BEFORE TRUNCATE guard — and the
assertion then observes the race instead of the guard's CLR08. Go through `truncateGuardError()`
(`tests/rig-txn.mjs`), which bounds the wait with a short `lock_timeout` and retries until the
guard itself answers.

**A pooled `query()` outside an explicit `begin` is its own transaction.** A fixture built from
several statements therefore needs `withTxn()` (`tests/rig-txn.mjs`) or
`withActor({ transaction: true })` — otherwise a deferred constraint trigger fires on the first
statement alone and you get CLR07 "unbalanced" on an entry whose lines have not been written
yet. A single CTE-chained statement does the same job; an unwrapped sequence does not.

**Reset a client before releasing it: `rollback` → `reset role` → `reset all`.** `RESET ALL` does
not reset the role, so a `SET ROLE`d connection returns to the pool still impersonating and
poisons the next `rootQuery`, which assumes superuser.

**Two-session cells take two dedicated clients and PROVE the interleave.** T1 holds an explicit
`begin` on one pooled connection; T2 is an ordinary autocommitting call on *another*, fired from
inside T1's open window — uncommitted work is invisible across sessions, so the observing side
has to commit per statement. Wait with `waitBlockedByOrThrow` (it reads `pg_blocking_pids`),
never a `sleep`, which proves nothing about whether the block actually happened.

**A reset-gated test drops schema `clara` mid-run, so it runs ALONE.** Gate on
`CLARA_RIG_ALLOW_RESET === "1"` and `t.skip()` otherwise, then give it its own `ci.yml` step that
creates a fresh `clara_*_ci` database for it. The all-packages sweep deliberately leaves that
variable unset so these files skip there — and a drill that only ever skips is a false green,
which is exactly why each one is also run for real, alone, in its own throwaway DB.

**The destructive scripts refuse unless the target is disposable.** `CLARA_ALLOW_DESTRUCTIVE=1`
plus either a localhost / `*_ci` / `*_test` / `*_tmp` database name, or an exact
`CLARA_DESTRUCTIVE_TARGET` equal to `user@host:port/db` — the user is part of that identity
because a managed pooler shares one host and one `postgres` database across projects
(`packages/db/lib/guard.mjs`). Reset gates key on `CLARA_RIG_ALLOW_RESET`, never on this one.

**Only `*.test.mjs` is collected.** The suite runs `node --test --test-concurrency=1` with the
wave-gate preloads (`--import ./tests/*-preintegration-gate.mjs` — read `packages/db/package.json`
for the live command; each gate sets its wave's `CLARA_ALLOW_MISSING_*` variable so a pre-wave
database skips LOUDLY instead of failing). Everything else here — helpers, fixtures, the
forced-schedule drivers — is a module the test files import, and says so in its own header.
A focused run of a wave battery leaves its variable UNSET, which is the shape that fails rather
than skips — final acceptance counts zero skips in that shape. Concurrency is 1 *within* this
package, but CI's sweep has other packages writing to the same migrated database (they un-skip
on `CLARA_RIG_DB=1`, which nothing in `packages/db` reads) — that is where the concurrent
writers behind the TRUNCATE rule come from.

**A PR retiring or moving a catalog object pinned by a closed-wave floor trues that floor IN
THE SAME PR** (minted at #352, migration `0129`). A closed drill applies the WHOLE on-disk
chain onto a populated book, so a floor's old assertion goes false BY DESIGN the moment the
retiring migration lands — not drift — and closed drills run only on the weekly sweep +
manual dispatch (ADR-0073), so an untrued floor reds the NEXT sweep far from the PR that
caused it. Grep the drill kits for every name your migration drops or renames before merging.
**Succession pattern:** branch on EITHER a migration-STEM witness (`clara.schema_migrations`
matched against the retiring migration's stable stem — permanent, immutable once applied) OR
a catalog witness (a body the retiring migration itself creates, probed by EXACT SIGNATURE via
`to_regprocedure`, never a bare name — law 3), post-arm if either says retired; assert
exact-signature ABSENCE of every retired body plus a positive control that any surviving
same-named overload still resolves. Exemplar: `x42-b3-retirement-succession.mjs`.

Enforced by machine, not restated here: the per-slice `#!cells-floor:` count and the totality
partition gate in `.github/workflows/ci.yml`. The gate's corpus is the enumerated slice
patterns (`tests/x41-*` / `tests/x42-*` families) — it does NOT reach every file in this
directory, so do not add a non-slice file to a slice list to "get coverage": the frontier legs
would then run it against a pre-wave chain where its gate variable is unset, and red the leg.
A new wave battery's false-green protection is its own dedicated `ci.yml` drill step (fresh
`clara_*_ci` database, focused run, allow-missing variable unset), not the partition gate.
