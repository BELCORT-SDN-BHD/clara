# Wave 3, lane 08, ticket #857 — the CHECK-constraint half (AC2)

Branch `riders/w3-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Commits on this branch (only #857's, this lane's first
ticket — nothing landed ahead of it):

- `448d9a128` `feat(db): #857 AC2 - a table CHECK proves field_path grammar at every writer`
- `b368302db` `test(db): #857 prove the field_path CHECK end-to-end, register its gate`

## Status: done (AC2 only — the ticket's remaining scope)

AC1 (the repository lint) shipped in wave 1 (PR #1025, `ddb5a125`) and is untouched here. AC3 (db
and runtime suites unchanged) is proved by the gate runs below. This report covers AC2, the
CHECK-constraint arm, which the ticket's own comment trail explicitly left open for a migration
lane ("Staying open: the CHECK-constraint half (AC2) needs a migration and rides riders wave 3").
Verified still live on this branch before building: `gh issue view 857 --comments` (2 comments,
re-read in full) — no owner-ruling comment dated 2026-09-20 on #857 itself; the newest binding
text is the Agent Brief plus the wave-1 "Staying open" note, both quoted below.

## The seams tested at

Per the Agent Brief's own "Key interfaces": a table CHECK on `clara.document_regions.field_path`,
backed by a new boolean sibling of `clara._assert_field_path`. Every cell in
`document-regions-field-path-check.test.mjs` drives the seam AC2 actually names — a **raw
`insert into clara.document_regions(...)`** — never through `clara.persist_document_extraction`,
because a writer bypassing that one door is exactly the gap AC2 closes. No test at a seam the
brief did not give.

## Acceptance criteria, with evidence

**AC2 — "Under the CHECK arm: a raw insert of an unregistered-namespace path is refused with the
grammar's typed code; a NULL path inserts; a forty-row trial balance at the plural literal
inserts in full."**

| Claim | Evidence |
|---|---|
| Unregistered-namespace raw insert refused with the grammar's typed code (CLR10, never 23514) | `document-regions-field-path-check.test.mjs` cell 2 ("a raw insert with an unregistered namespace is refused with CLR10…") — PASS. Also proved live inside the migration's own tail (`drfp tail` probe 1, `sqlstate 'CLR10'`) during `pnpm db:migrate` |
| Malformed-syntax raw insert (not just an unregistered namespace) also refused with CLR10 | cell 3 ("a raw insert with a syntactically malformed path…") — PASS, four shapes (`Invoice.Total`, `invoice..total`, `invoice.tot al`, 200-char) |
| NULL path inserts | cell 4 — PASS. Also proved live in the migration tail (probe 2, first insert) |
| A forty-row trial balance at `opening_tb.line` inserts in full | cell 6 ("a raw forty-row trial balance at opening_tb.line inserts in full…") — PASS, 40/40 rows land, `count(*) = 40` re-measured after |
| The second plural literal (`prior_gl.line`) carries the same parity | cell 7 — PASS (5/5 rows) |
| The CHECK does not mask 0201's own unique key at a NON-plural path | cell 8 — PASS: first insert succeeds, the same-key duplicate is refused with `23505` (0201's key), not `CLR10` — proves the two walls stay distinguishable |
| Structural: the CHECK calls the sibling; the sibling is IMMUTABLE, INVOKER, `clara_fn_owner`-owned, ungranted to PUBLIC and every application role (`clara_authenticated`, `clara_agent_ro`, `clara_runtime`) | cell 1 — PASS |

All 8 cells green, both standalone and with the full pre-integration gate chain preloaded (see
Gates below). `EXPECTED_CELLS` vacuity control: `after()` asserts exactly 8 cells ran.

**The read-only query a release preflight can run on hosted**, to know the constraint will
validate before applying `0290_document_regions_field_path_check.sql` (this is also literally
what the migration's own prestate runs, and what
`packages/db/deploy/0290-field-path-check-census.sql` wraps for a `psql` session):

```sql
select r.field_path, count(*) as n
  from clara.document_regions r
 where r.field_path is not null
   and (length(r.field_path) = 0 or length(r.field_path) > 128
        or r.field_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
        or split_part(r.field_path, '.', 1) not in
           ('invoice','statement','myinvois','opening_tb','prior_gl',
            'pages','tables','rows','sheets','paragraphs'))
 group by 1 order by 1;
```

Zero rows back means the CHECK will validate cleanly; any row named is a producer the cutover
would refuse, and must be censused/repaired (or the roster widened in a NEW migration) first. Run
it via `psql "$DSN" -v ON_ERROR_STOP=1 -f packages/db/deploy/0290-field-path-check-census.sql` for
the full three-probe version (distribution, the same refusal-or-clean gate, and the
`clara._assert_field_path` pin this migration depends on).

**Proof against POPULATED rows (not an empty table).** `clara.document_regions` started EMPTY on
this freshly migrated (0001→0272, 267 files) + seeded lane database — seeding does not populate
it (measured: `select count(*) from clara.document_regions` → 0 before any work). Per the work
order's wave-3 addendum ("create rows through the estate's own doors first"), a one-off script
(`scratchpad/seed-857-populated-rows.mjs`, not committed — its logic is described here for
reproducibility) called `clara.persist_document_extraction` three times — THROUGH the real writer
door, never a raw fixture insert — leaving **14 rows across 10 distinct field_path values** on
`clara_l08` before the migration ran:

```
invoice.total : 1        opening_tb.line : 5       statement.closing_balance : 1
invoice.vendor_name : 1  pages.1.lines.0 : 1        tables.0.cells.3 : 1
myinvois.supplier_tin : 1  paragraphs.0 : 1
rows.0 : 1                sheets.0.A1 : 1
```

The five `opening_tb.line` rows are one real trial balance (`opening-tb-cells.mjs`'s own shape:
`'<account> OPENING RM <amount> DR|CR'`, run through `clara._derive_opening_region_fact`'s regex,
not a hand-set `opening_fact` object). `pnpm db:migrate` then applied
`0290_document_regions_field_path_check.sql` against this populated table; the migration's own
prestate independently re-ran the same census (see `[notice] drfp prestate: clean … all 14 stored
field_path value(s) already conform`) and the `ALTER TABLE … ADD CONSTRAINT` itself validated all
14 existing rows with no error.

**Redo proven, both branches.** First apply (`redo=f`) and a `CLARA_MIGRATION_REDO=0290_…` re-run
(`redo=t`) were both run against `clara_l08` and both succeeded (`[notice] drfp prestate: clean
(redo=t) …`, `redone 0290_document_regions_field_path_check · new checksum …`), proving S1's
`create or replace function` and S2's unconditional `drop constraint if exists` + `add constraint`
are genuinely safe to re-run, not merely asserted to be.

## Migration

`packages/db/migrations/0290_document_regions_field_path_check.sql` (number reserved for this
ticket per the work order; used).

**Prestate pins, MEASURED on `clara_l08` now** (this lane's first ticket — nothing recut ahead of
it, so these are also 0191's own live values):

- `clara._assert_field_path(text)` — `sha256(prosrc)` = `0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace`, owner `clara_fn_owner`, `provolatile = 'i'` (IMMUTABLE).
- `clara.document_regions` INSERT grantees: exactly `{clara_fn_owner}` (`information_schema.role_table_grants`).
- Idempotency/redo gate: `clara._field_path_conforms` and `ck_document_regions_field_path_grammar` must be wholly absent (first apply) or wholly present (redo) — never half of either.
- Cutover safety: zero stored `field_path` values fail the grammar (the same query above), and the table must not be empty (14 rows, confirmed).

**Change:** `clara._field_path_conforms(text) returns boolean` (`language plpgsql immutable`,
`perform clara._assert_field_path(p_path); return true;`), revoked from PUBLIC, no further grants;
`clara.document_regions` gains `ck_document_regions_field_path_grammar check
(clara._field_path_conforms(field_path))`.

**Tail assertions:** the function's shape (immutable/invoker/owner/search_path/ungranted); the
constraint's exact `pg_get_constraintdef` text; `clara._assert_field_path`'s sha unchanged;
every OTHER constraint/trigger/index on `clara.document_regions` survives by name
(`ck_document_regions_opening_fact_0017`, the four other CHECKs, both keys, the FK,
`t_document_regions_append_only`, `t_document_regions_fact_validate`,
`ix_document_regions_extraction`, 0201's `uq_document_regions_extraction_field_path`); three LIVE
rolled-back probes (refusal with CLR10, NULL succeeds, a well-formed path succeeds) with the row
count identical before/after; both plural literals still pass the boolean call.

Applied with `pnpm db:migrate` (268 total migrations after). Redo exercised and reverted to normal
state afterward (unset `CLARA_MIGRATION_REDO`); the ledger's final checksum matches the committed
file (unedited between the two runs).

## Docs

- `packages/db/README.md` — new `## 0290 —` section (house per-migration convention, appended
  after `## 0272`).
- `CONTEXT.md` — "Field path" term updated: the grammar is now enforced both at the persist door
  and, since #857, by the table itself.
- `packages/db/tests/rig-meta.mjs` — a documentation-only comment block ("#857 [0290] — NO cohort
  is owed…"), matching the established `#984`/0239 and `#960`/0270 precedent for a single
  ungranted internal: no `cohortFailures()` call was added, and none was needed —
  `grantMatrixFailures()`'s own live sweep already expects `false` for every role on an
  unlisted name, which `operation-census.test.mjs` (opcen.1, PASS) and `rig-isolation.test.mjs`
  (T17, PASS) both confirm.

## Gates, with counts

- **New/touched test file, standalone:** `node --test --test-concurrency=1
  tests/document-regions-field-path-check.test.mjs` — 8/8 pass.
- **Same file, with the FULL gate chain preloaded** (`$GATES` = the exact `--import` list from
  `packages/db/package.json`'s `test` script, my own new gate module included): 8/8 pass.
- **`operation-census.test.mjs`** (added a SQL function): 10/10 pass (opcen.1–opcen.10), full gate
  chain preloaded.
- **`rig-isolation.test.mjs`** (added a SQL function): 22 pass, 1 skipped (T19, the destructive
  poison-role drill, correctly skipped — `CLARA_RIG_ALLOW_RESET` was never set), 0 fail, full gate
  chain preloaded.
- **`preintegration-gate-chain.test.mjs`** (registers a new gate token): 5/5 pass — confirms the
  new `--import` entry is well-formed, non-duplicate, and preloads a real file.
- **`pnpm typecheck`** (root): exit 0 (`apps/web`, `packages/runtime` both "Done"; `packages/db`
  has no TS build gate per its own README).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, wave-3 addendum rule): exit 0 across
  `packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render`.
- `apps/web` was not touched — no unit suite or Playwright walk owed.
- `packages/runtime` was not touched — no `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` owed.

## Successor contract

None. This ticket adds no door, room, part or prompt stanza a frozen chat/Work tool would need —
it is a database-integrity wall with no application-facing surface.

## Fix round — SPEC-L08-01: 0290 could not apply on a fresh database

The shipped prestate raised `CLR10` when `clara.document_regions` held zero rows, and the tail then
raised again ("unexpectedly empty for the live probes"). Zero rows is the state of EVERY fresh
database: CI's `db-estate-suite` deploys main's chain and then HEAD's onto a throwaway `clara_ci`
BEFORE anything seeds, `frontier-leg` migrates a fresh service database, and the integrator's
from-scratch chain runs on a disposable cluster. The migration was therefore unappliable on all
three. REPRODUCED before fixing, on a disposable template clone of `clara_l08` with the constraint
and sibling dropped and the table emptied: `PRE-STATE {regions:0, fn_absent:true}` then
`REFUSED - sqlstate CLR10 | drfp prestate: clara.document_regions holds ZERO rows`.

Fixed in two slices, each re-run against that clone:

1. The prestate's zero-row `raise exception` became clause (e), a `raise notice` that reports the
   count — the same shape 0291 beside it uses. The bad-path census refusal (clause (d)'s `v_bad`
   arm) is untouched: a stored value the new CHECK would reject still aborts the cutover by name.
   Re-run: the prestate passed and the TAIL then refused, which is slice 2's red.
2. The tail's live probes now branch. POPULATED: unchanged — the three rolled-back RAW-insert probes
   through an existing extraction. EMPTY: no FK-satisfiable row exists to borrow, so the same three
   claims are proved one level down, by evaluating the CHECK's own expression
   (`clara._field_path_conforms`, which is literally what the installed `CHECK (...)` calls per row,
   and whose exact text the tail already asserts above). Which branch ran is stated in the tail
   notice (`PROBE MODE: …`), never blurred.

All four apply states, measured on disposable template clones created and dropped by this run:

| state | pre-state | result |
|---|---|---|
| first apply, EMPTY table | regions 0, fn absent, ck absent | APPLIED CLEAN; `pg_get_constraintdef` reads `CHECK (clara._field_path_conforms(field_path))` |
| first apply, POPULATED table | regions 316, fn absent, ck absent | APPLIED CLEAN |
| redo (#957) | regions 316, fn present, ck present | APPLIED CLEAN |
| HALF-applied | regions 316, fn present, ck ABSENT | still REFUSED, `CLR10 … HALF-APPLIED` — the load-bearing guard is intact |

VACUITY CONTROL on the new EMPTY branch: a copy of the file whose sibling body was cut down to
`return true` (no `perform clara._assert_field_path`) was applied to an empty clone and REFUSED with
`drfp tail: clara._field_path_conforms accepted an unregistered-namespace path (evil.total)`. The
broken copy was a scratchpad file, never the committed one.

RE-APPLIED on `clara_l08` through the supported redo path. #957's redo takes the HIGHEST applied
version only, and this lane has two unmerged migrations, so 0291's ledger row was released first,
then `CLARA_MIGRATION_REDO=0290_document_regions_field_path_check node scripts/migrate.mjs` ran
(logging `PROBE MODE: raw insert (clara.document_regions is populated)` and
`redone … new checksum aec72ad9d95e2e56b39c183a5db12940a4529050b350e3d2a859f1ee842e6d8e`), then a
plain `migrate` re-applied 0291 through its own redo-safe body (`bslc prestate: clean (redo=t)`,
both splices `SKIPPED -- redo (#957)`), restoring its original checksum
`45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3` unchanged. The whole sequence was
rehearsed on a clone first. A third plain `migrate` then reported `0 new migration(s) applied · 269
total` — no checksum drift left anywhere. `packages/db/README.md`'s 0290 section was rewritten to
match. Battery after: `document-regions-field-path-check` + `bank-statement-line-citation` +
`field-path-grammar` + `document-regions-unique-field-path` + `document-fact-validation-belt` —
39/39 pass.

## Follow-ups worth filing

- None new. The ticket's own "out of scope" (the grammar's namespace roster, the two plural
  literals, rewriting fixtures through the persist door) is respected untouched.

## Anything unverified

- `packages/db/deploy/0290-field-path-check-census.sql` was sanity-checked by extracting and
  running its three probes directly against `clara_l08` through the same `rootQuery` harness the
  test suite uses (all three ran clean) — **not** run through an actual `psql` invocation, since
  no `psql` binary is on this rig's `PATH` (a known RIG.md limitation: "no `pg_dump` on PATH"
  extends to `psql` here too). The `\set`/`\echo` meta-commands were stripped before running, so
  the psql-specific control lines themselves are unverified syntax (they are copied verbatim from
  0191's own shipped, presumably-tested `0191-field-path-census.sql`).
  Report on the seeding script: `scratchpad/seed-857-populated-rows.mjs` (in this session's
  temp scratchpad, not part of the repo) is the exact tool used to populate `clara_l08`'s 14 rows;
  it is not committed anywhere, so a fresh rig (or hosted) needs an equivalent one-off run, or the
  release session can rely on hosted's own already-populated `document_regions` table instead.
