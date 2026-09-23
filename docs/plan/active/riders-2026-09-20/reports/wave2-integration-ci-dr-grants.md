# Wave 2 integration — PR #1029 db-live-gates DR-verify relation-grant fix

Branch `integration/riders-w2`, worktree `C:\Users\zhant\Desktop\clara-wt\int2`.
Head before: `ffe63a0dd`. Head after: `df7f76021` (`fix(integration): #1014 the DR grant matrix
compares effective grants, not ACL spellings`).

## Cause

Migration `0235_opening_binding_claim.sql` (#1014) is the first migration in the estate to run
`revoke all on table clara.document_binding_claims from public` on a fresh table. `PUBLIC` never
held anything on it, so the statement is a semantic no-op — but PostgreSQL still **materialises**
`pg_class.relacl` from `NULL` to an explicit owner-only ACL (`{clara_fn_owner=arwdDxtm/clara_fn_owner}`,
8 privileges: INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN). `pg_dump`, by
design, emits nothing for an ACL that equals the object's default, so a restored copy comes back
with `relacl` `NULL` again. `dr-verify-checks.mjs`'s §4.6 "relation-grant matrix" explodes raw
`c.relacl` via `cross join lateral aclexplode(c.relacl)`: `aclexplode(NULL)` yields **0 rows**,
`aclexplode('{owner=arwdDxtm/owner}')` yields **8 rows** — hence PR #1029's
`[FAIL] 4.6 relation-grant matrix ... source-only 8, target-only 0`, with every row the owner's
own privileges. The round trip lost nothing; the check compared two spellings of the same
effective grant set as if they were different objects.

Live confirmation on the lane's own migrated database (`clara_w2c` clone): `document_binding_claims`
already carries `relacl = '{clara_fn_owner=arwdDxtm/clara_fn_owner}'`, matching the CI report
exactly.

## The fix

`packages/db/scripts/dr-verify-checks.mjs`, §4.6 relation-grant matrix: explode
`coalesce(c.relacl, acldefault(<type>, c.relowner))` instead of raw `c.relacl`, so a `NULL` ACL
reads as the very default an explicit owner-only ACL already equals.

The `acldefault()` type char is **not** `c.relkind` verbatim — this was measured against a live
PostgreSQL 17.11 cluster before writing the fix, and two things did not match my first assumption:

- **Sequences take lowercase `s`, not uppercase `S`.** `select acldefault('S', <owner>)` silently
  resolves to a *different, unrelated* object kind (`{owner=U/owner}`, USAGE only) that looks
  plausible but is wrong. `select acldefault('s', <owner>)` gives `{owner=rwU/owner}`
  (SELECT/UPDATE/USAGE), which is what `revoke all on sequence ... from public` (a no-op) actually
  materialises, and — confirmed with a real `pg_dump` — exactly what `pg_dump` treats as "nothing to
  emit" for a sequence. Using uppercase `S` would have "fixed" tables while leaving every sequence
  in the estate exactly as broken (2 phantom rows instead of 8, forever).
- **Views/matviews/partitioned tables (`v`/`m`/`p`) are not valid `acldefault()` type chars at
  all** — the call errors (`unrecognized object type abbreviation`). Confirmed with `pg_dump` that a
  fresh view, materialized view and partitioned table's revoke-all-from-public round-trips silently
  exactly like a plain table's, so all four relkinds (`r`/`v`/`m`/`p`) share the table default (`r`);
  only sequences (`S`) get the sequence default (lowercase `s`).

Final expression: `acldefault((case when c.relkind='S' then 's' else 'r' end)::"char", c.relowner)`
(the explicit `::"char"` cast is required — the bare `case` expression is `text`, and
`acldefault(text, oid)` does not exist).

This strengthens, not weakens, the check: a real difference (a grant to another role, a different
grantor, an owner privilege genuinely missing on one side) still produces a row present on only one
side and still FAILs — proven in cells 2/3/5/6 below.

## Sibling §4.6 matrices — checked, one line each

- **column-grant matrix** (`attacl`) — no trap. Measured: a no-op `revoke all (col) on t from
  public` does **not** materialise `attacl` at all (stays `NULL`); the query already filters
  `attacl is not null`, so both sides read 0 rows regardless. Left alone.
- **routine-grant matrix** (`proacl`) — no trap. The default `proacl` grants PUBLIC EXECUTE
  (`acldefault('f', owner)` = `{=X/owner,owner=X/owner}`), and the estate's convention is to
  `REVOKE EXECUTE ... FROM PUBLIC` on every function — a genuinely effective change, never a no-op,
  so `proacl` is never NULL-vs-materialised-same-effective-grants here. Left alone.
- **schema-ACL matrix** — no trap by construction: it already excludes owner-self entries
  (`a.grantee <> n.nspowner`), so an owner row's representation never reaches the comparison on
  either side. Left alone.
- **schema owner identity + effective owner privileges** — no trap: it uses
  `has_schema_privilege()` (an effective-privilege function), never raw ACL explosion. Left alone.
- **default-privileges (`pg_default_acl`)** — no trap. Measured: a no-op
  `alter default privileges ... revoke all on tables from public` (PUBLIC never gets a table default
  to begin with) creates **zero** `pg_default_acl` rows — Postgres does not materialise a row for a
  default-privilege statement that changes nothing. Left alone.
- **type definitions** — not applicable; this check compares enum/domain/composite bodies via
  `md5(...)`, no ACL is involved. Left alone.

## Cells: red then green

New file `packages/db/tests/dr-verify-grant-matrix.test.mjs`, 6 cells, each its own schema (so one
`checkGrantsAndRls(ctx)` call's row set stays scoped to exactly that cell's fixture) against two
real throwaway databases on the rig cluster (`127.0.0.1:55760`, superuser `postgres`). `ctx` is
built exactly per `dr-verify-checks.mjs`'s own documented contract
(`{src, tgt, AUTHORITATIVE_SCHEMAS, record, bothRows, diffCheck}`); `record`/`diffCheck` are small
local collectors (dr-verify.mjs's own originals are neither exported nor safely importable — it
calls its own `main()` at import time) built only on the real, imported `multisetDiff`. Expected row
sets are literal arrays derived empirically against the live cluster, never recomputed from the
query under test.

| # | Cell | Pre-fix | Post-fix |
|---|---|---|---|
| 1 | table, owner-default vs NULL (revoke-all no-op on source only) | RED — target rows `[]` vs expected 8; status FAIL, `source-only 8, target-only 0` (byte-identical shape to PR #1029) | GREEN — both sides read the same 8 owner rows; PASS |
| 2 | table, + a real extra `grant select ... to <role>` on source only | RED (wrong reason pre-fix: 9-row mismatch, not 1) | GREEN in the sense required: FAIL, exactly 1 source-only row, naming the role and SELECT |
| 3 | table, owner `DELETE` genuinely revoked on source only | RED (wrong reason pre-fix) | GREEN in the sense required: FAIL, exactly 1 target-only row, naming DELETE |
| 4 | sequence, owner-default vs NULL | RED — target rows `[]` vs expected 3 | GREEN — PASS, 3 rows identical |
| 5 | sequence, + a real extra grant on source only | RED (wrong reason) | GREEN in the sense required: FAIL, exactly 1 source-only row |
| 6 | sequence, owner `USAGE` genuinely revoked on source only | RED (wrong reason) | GREEN in the sense required: FAIL, exactly 1 target-only row, naming USAGE |

Actual run, before the fix: `# tests 6 / # pass 0 / # fail 6` (cell 1/4 failed on the literal
row-set assertion with the target side empty; cells 2/3/5/6 failed for the same underlying reason —
the target side is missing the owner's default rows that the fixed coalesce would supply, so the
mismatch count was 9/9/4/4, not the single real-difference row the fix is supposed to isolate).
After the fix: `# tests 6 / # pass 6 / # fail 0`.

Between runs, `before()`/`after()` create and drop two disposable databases
(`disposableDatabaseName()`/`connectionConfig()` from `./migrate-harness.mjs`, the same helpers
`migrate-guc-reset-witness.test.mjs` and siblings already use) plus one throwaway role; verified
clean (no leftover `clara_dr_grant_*` databases or `dr_grant_other_*` roles) after every run in this
session.

## Real end-to-end reproduction (beyond the unit cells)

To corroborate against the *actual* estate rather than only a synthetic fixture: cloned the lane's
migrated rig database (`create database clara_w2_drfixsrc template clara_w2c` — confirmed
`document_binding_claims.relacl = '{clara_fn_owner=arwdDxtm/clara_fn_owner}'`, i.e. already carrying
the real defect), ran a real `pg_dump --schema=clara --schema-only` (WSL PostgreSQL 17.11 client) and
restored it via `psql --single-transaction` into a second fresh database
(`clara_w2_drfixtgt` — confirmed its `document_binding_claims.relacl` came back `NULL`, exactly
the round-trip PR #1029 saw), then ran the real `node scripts/dr-verify.mjs` CLI with
`CLARA_DR_SOURCE_URL`/`CLARA_DR_TARGET_URL` pointed at the pair:

- **Before the fix** (`git stash` to the pre-fix `dr-verify-checks.mjs`, same pair): line-for-line
  the CI failure — `[FAIL] 4.6 relation-grant matrix (4 schemas, incl sequences, grantor/grantable)
  — source-only 8, target-only 0 · src-only:{"grantee":"clara_fn_owner",...,"privilege_type":
  "DELETE","relname":"document_binding_claims"} · ...` (all 8 privileges, `clara.document_binding_claims`).
- **After the fix** (`git stash pop`, same pair, re-run): `[PASS] 4.6 relation-grant matrix (4
  schemas, incl sequences, grantor/grantable) — 2979 row(s) identical` — the entire real `clara`
  schema's grant matrix, not just the one synthetic table.

The overall `dr-verify` exit was still non-zero in both runs (expected and unrelated to this fix):
the reproduction used a schema-only dump of `clara` alone (to sidestep a pre-existing FK-ordering
data issue on a full data dump of this particular rig clone, itself out of scope here), so every
row-count/content-md5/completeness-floor/engine-journal check legitimately FAILs against an
intentionally data-empty, workflow/workflow_drizzle/graphile_worker-absent target. Only the §4.6
relation-grant-matrix line is meaningful evidence here, and it flipped exactly as intended.

All throwaway databases and roles from this reproduction (`clara_w2_drfixsrc`, `clara_w2_drfixtgt`,
`clara_w2_intfixdrgrants` used for the gate-chain run below, and every `dr_grant_other_*`/
`dr_grant_owner_*` probe role) were dropped; verified none remain on the shared rig cluster.
`clara_w2c` itself was never altered — only cloned via `template clara_w2c` while no session was
connected to it.

## Gates

- **`tests/dr-verify-grant-matrix.test.mjs`** — 6/6 pass (see table above), run standalone
  (`node --test tests/dr-verify-grant-matrix.test.mjs`, `PGHOST=127.0.0.1 PGPORT=55760 PGUSER=postgres`).
- **Full preintegration-gate chain**, per WORK-ORDER rule 8 ("packages/db/tests" touched ⇒ the files
  touched with the full gate chain, plus `operation-census.test.mjs` and `rig-isolation.test.mjs`,
  never with the reset flags): ran all three together
  (`node --test --test-concurrency=1 $GATES tests/dr-verify-grant-matrix.test.mjs
  tests/operation-census.test.mjs tests/rig-isolation.test.mjs`) against a fresh `template clara_w2c`
  clone. Result: **39 tests, 38 pass, 1 skip (T19 poison-role — correctly skipped: destructive,
  requires `CLARA_RIG_ALLOW_RESET=1`, not set, per the "never with the reset flags" rule), 0 fail.**
- **`pnpm typecheck`** (repo root) — `apps/web` and `packages/runtime` both `Done`, exit 0.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root) — all workspaces including `packages/db`
  report `Done`, exit 0.
- **The CI job's own DR round trip** (`.github/actions/db-live-gates/action.yml`'s
  "DR full-profile round-trip" step): this step uses GitHub Actions `services:` — four separate
  `postgres:17` service containers (`postgres`/`postgres_b`/`postgres_c`/`postgres_d`) reached over
  distinct ports — which requires Docker. **This host has no Docker** (`docker version` /
  `docker ps` both `command not found`), so the actual CI job could not be run locally. This was not
  faked; the real end-to-end reproduction in the section above (a real `pg_dump`/`psql` round trip of
  the actual migrated `clara` schema, run through the real `dr-verify.mjs` CLI) is the closest
  substitute available on this host, and it reproduces the exact reported failure pre-fix and the
  exact expected pass post-fix.

## Docs

- `packages/db/README.md`, "Backup and recovery" section: added two sentences after the `dr:verify`
  paragraph stating that the §4.6 relation-grant matrix compares effective grants (`coalesce(relacl,
  acldefault(...))`) and why — `pg_dump` never round-trips an ACL that equals the object's default,
  first seen with 0235 in PR #1029.
- `CONTEXT.md`: no new vocabulary introduced by this fix (internal DR-tooling correction, not a new
  domain term) — left unchanged.
- Migration `0235_opening_binding_claim.sql` was **not** edited, per the instruction: it is applied
  on eleven rig databases and its revoke is harmless (a real security posture, not a mistake — it is
  the DR check that owed the fix, not the migration).

## Not in scope / left alone

- `packages/db/tests/legal-acceptance.test.mjs`'s `la.1` cell already documents this exact
  representation trap (from 0185's `dpa_documents`/`dpa_signatures`) and asserts, as a *stronger*
  internal discipline, that legal-cohort relations carry **zero** materialised ACL at all
  (`relacl IS NULL`) rather than relying on dr-verify to tolerate one. That assertion is still
  correct and orthogonal to this fix (it constrains what the estate *does*, not what the verifier
  *tolerates*) — left unchanged.

## Commit

`df7f76021` — `fix(integration): #1014 the DR grant matrix compares effective grants, not ACL
spellings`, on `integration/riders-w2`, pushed nowhere (per rig rules — the orchestrator handles
push/PR). Files: `packages/db/scripts/dr-verify-checks.mjs`, `packages/db/README.md`,
`packages/db/tests/dr-verify-grant-matrix.test.mjs` (new).
