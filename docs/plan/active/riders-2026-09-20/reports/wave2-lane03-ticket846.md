# Wave 2 · lane 03 · ticket #846 — Close the `registry_version` DELETE-then-INSERT hole

**Status: DONE.** Branch `riders/w2-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`,
database `127.0.0.1:55743/clara_l03`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
bcc38b74 docs(db): #846 the high-water mark in the module READMEs, CONTEXT and the rig cohort
f0ab72bb test(db): #846 the wall closes a hole, not the door — the three positive controls
20d32c99 feat(db): #846 refuse a publish that leaves two registry versions on the table
f777b976 feat(db): #846 the high-water mark is append-only, by any route
ea336b33 feat(db): #846 the capability registry's version high-water mark, and the INSERT-side wall
```

Working tree clean. No commit in this lane preceded mine (`git log 23cfad94..HEAD` was empty at
start). The newest Agent Brief is the 2026-09-17 comment on #846; there is no owner ruling comment
dated 2026-09-20 on this ticket. **The ticket was still live**: measured on the lane rig before any
change, `pdf × invoice` published `registry_version` 2; deleting the row and re-inserting it at 1
was ACCEPTED and the table then read 1.

## The seams I tested at (written before the first test)

The brief's "key interfaces" are all database objects, and `clara.document_capabilities` has
exactly one writer that can reach it at all — the owner/migration role (forced RLS, owner `for
all` policy, `clara_authenticated` SELECT only, `clara_agent_ro` nothing; 0191's ruling, restated
in 0207's header). So the public interface under test is **DML against
`clara.document_capabilities` and against the new high-water relation through the owner
connection**, and the observable contract is the SQLSTATE plus the machine-readable
`detail.reason`. No seam outside that: the brief's "out of scope" is the level vocabulary, the
seeded verdicts, the read doors and the four axes, and none of them is touched.

Everything is exercised through `packages/db/tests/document-capability-high-water.test.mjs`
(7 cells) and re-proved in-migration by 0244's own tail.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `a DELETE-then-INSERT below the published version was ACCEPTED — #779's first residual is still open` | the high-water relation, its TOTAL backfill, the BEFORE INSERT wall and the AFTER INSERT/UPDATE writer |
| 2 | `a DELETE of the high-water mark was ACCEPTED — the wall has a door beside it` | `clara._tf_document_capability_high_water_monotone` |
| 3 | `a transaction leaving TWO distinct registry_versions COMMITTED — cross-row uniformity is still only a convention` | `clara._tf_document_capabilities_version_uniform`, a DEFERRABLE INITIALLY DEFERRED constraint trigger |
| 4 | vacuity control (below) — cells 1, 5, 6 red against a deliberately over-wide wall | no new code; the three positive controls |

Slice 3's red needed the battery's own cohort guard narrowed for one run (it correctly reported a
PARTIAL cohort otherwise); the guard was restored from a saved copy immediately afterwards. That
run **committed** the non-uniform state it was proving unsafe — `pdf × invoice` at 3 against 239
rows at 2, and the mark raised with it. The rig was repaired to 240 rows / 240 marks, all at 2,
by an owner-session `alter table … disable trigger` / `update` / `enable trigger` pair, re-measured
afterwards, and all four triggers re-read as enabled (`tgenabled = 'O'`). Recorded because it is
the one place this ticket wrote to the lane database outside a rolled-back probe or the migration.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell deletes a row at version N and re-inserts below N: refused with CLR08 and a named reason | **done** | cell 1 `a pair's published version survives DELETE…` — asserts `err.code = CLR08`, `detail.reason = registry_version_high_water`, `detail.column/format/document_kind`, `detail.from = N`, `detail.to = N-1`, and that the refused INSERT left nothing. Re-proved in 0244 §D(6a) against the live table. |
| A cell re-inserts at N or above: succeeds | **done** | cell 5 `a retired pair may be re-published AT its high water and ABOVE it` — delete + re-insert at N stores N; delete + re-insert at N+1 stores N+1 and the mark follows to N+1. Re-proved in 0244 §D(6b). |
| A cell ends a transaction with two distinct versions: refused at commit; a uniform publish succeeds | **done** | cell 3 refuses a **real `COMMIT`** with CLR08 / `registry_version_uniform` / `detail.versions = [2,3]`, then re-reads the registry to prove nothing was written; cell 4 raises all 240 rows and forces the same verdict early with `set constraints clara.t_document_capabilities_version_uniform immediate`, which passes. Re-proved in 0244 §D(6d), both directions. |
| First publication of a never-seen pair succeeds | **done** | cell 6 `the FIRST publication of a never-seen pair is admitted, and mints its mark` — a synthetic `probe846 × probe_kind` pair with no mark inserts at the published version and the writer mints its mark with `first_seen_at`. |
| From-scratch apply with prestate and tail proof; the capability-registry cell file stays green | **partial → see below** | The prestate and the tail proof are in the file and ran on every apply (`#846 prestate: clean …`, `#846 tail: OK …`). `document-capability-registry.test.mjs` **19 pass / 0 fail / 0 skipped**. A true from-scratch 0001→0244 chain is the integrator's job on a disposable cluster (RIG.md: one from-scratch chain per cluster; lanes never run a second one) — **unverified by me, and stated as such**. |

## The migration

`packages/db/migrations/0244_document_capability_version_high_water.sql` — the number reserved for
this ticket. Applied to `clara_l03`; ledger checksum
`03c18abdb227764c85495fa6e7497178d25203cc566b26818c7d08ba4331c346`, byte-identical to the file on
disk (verified by `sha256` of the file against `clara.schema_migrations`). Chain now 230 files.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')`
keyed by `to_regprocedure`, never transcribed from file text):

- `clara._tf_document_capabilities_version_monotone()` = `170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56` (0207's wall — the half of the invariant that already existed; the tail re-hashes it to prove this file did not touch it).

The prestate also measures, and refuses on: the registry's primary key still being
`(format, document_kind)`; the `registry_version >= 1` positivity CHECK present exactly once;
0207's trigger actually attached; and **the registry publishing exactly one distinct version** —
arming a deferred uniformity wall over a table that already carried two would refuse every later
writer for a condition it did not create.

**What it adds** (one relation, four ungranted trigger bodies, four triggers):

| object | what it does |
|---|---|
| `clara.document_capability_version_high_water` | one row per pair, the highest version it has ever published; backfilled TOTAL; FORCE RLS, one `clara_fn_owner` policy, **zero application-role privilege** |
| `clara._tf_document_capabilities_version_high_water()` | BEFORE INSERT: refuses below the mark — `CLR08` / `registry_version_high_water` |
| `clara._tf_document_capabilities_high_water_record()` | AFTER INSERT OR UPDATE: raises the mark, never lowers it |
| `clara._tf_document_capability_high_water_monotone()` | BEFORE UPDATE OR DELETE on the mark: DELETE refused; lowering, re-keying and moving `first_seen_at` refused — `CLR08` / `registry_version_high_water_append_only` |
| `clara._tf_document_capabilities_version_uniform()` | DEFERRABLE INITIALLY DEFERRED constraint trigger: a transaction may not LEAVE more than one distinct version — `CLR08` / `registry_version_uniform`, with `detail.versions` |

Live body shas after apply: `b4090687…` (INSERT wall), `839c51fb…` (writer), `196780f9…`
(mark wall), `d21b6837…` (uniformity).

**Two deviations from the brief's wording, both measured rather than preferred.**

1. The brief asks for "a statement-level constraint trigger". PostgreSQL has no such object:
   `create constraint trigger … for each statement` is a **syntax error (42601)** on this rig
   (PG 17.11), and upstream's `gram.y` `CREATE opt_or_replace CONSTRAINT TRIGGER` production
   hard-codes `FOR EACH ROW` (confirmed against the PostgreSQL source through Context7). The
   brief's *intent* — a verdict over the whole table at the end of the transaction — is kept with
   an AFTER ROW constraint trigger whose body is table-wide and which is DEFERRED, so a
   republication's non-uniform middle is never the subject. `create or replace constraint trigger`
   is also unsupported (**0A000**, measured), so the file drops before it creates.
2. The brief says the new walls reuse `_tf_document_capabilities_version_monotone`'s "CLR08 code
   and `detail.reason` shape". They reuse the code and the shape (`reason`, `column`, `format`,
   `document_kind`, `from`, `to`), with **distinct reason values** per wall, so a caller can tell
   which of the three fired. The AC's wording is "a named reason", which this satisfies.

**Redo.** The file is redo-safe by construction (`create table if not exists`, `create or replace
function`, `drop trigger if exists` before each `create trigger`, `drop policy if exists`, and a
backfill that only raises); its prestate reports FIRST or REDO instead of refusing on its own
objects. It was re-applied **four times** with the supported mode
(`CLARA_MIGRATION_REDO=0244_document_capability_version_high_water`, `CLARA_ALLOW_DESTRUCTIVE=1`,
`CLARA_RIG_DB=1`): once for the slice-2 wall, once for a tail assertion that had the trigger-def
word order wrong (`BEFORE DELETE OR UPDATE` is how PostgreSQL renders it — the tail caught it),
once for the slice-3 wall, and once to restore the deliberately-mutated body after the vacuity
control.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55743 PGUSER=postgres PGDATABASE=clara_l03
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json` (`node --test --test-concurrency=1 $GATES tests/<file>.test.mjs`).
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `tests/document-capability-high-water.test.mjs` (added) | **7 pass / 0 fail / 0 skipped** |
| `tests/document-capability-registry.test.mjs` (the file the AC names; untouched) | **19 pass / 0 fail / 0 skipped** |
| `tests/opening-ledger-source.test.mjs` (the other battery that writes the registry) | **12 pass / 0 fail / 0 skipped** |
| `tests/document-intake-capabilities.test.mjs` | **6 pass / 0 fail / 0 skipped** |
| `tests/preintegration-gate-chain.test.mjs` (I edited the chain) | **5 pass / 0 fail / 0 skipped** |
| `tests/operation-census.test.mjs` (new SQL functions) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (new SQL functions; no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it. T17 (grant matrix), T18 (definer hygiene) and T18 (governed RLS) all pass over the new objects. |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files verified, no manifest diff |
| `pnpm lint` (worktree root) | **exit 0** |
| `pnpm typecheck` (worktree root) | **FAILS — inherited, not mine.** See below. |

`apps/web` and `packages/runtime` were not touched (`git diff 23cfad94..HEAD -- apps/web
packages/runtime` is empty), so no web unit suite, no browser walk and no parts-parity run was
owed.

### The typecheck red is inherited from the base

```
apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name 'DOCUMENT_KINDS'.
apps/web/components/documents/document-kind-dialog.tsx(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type.
```

Line 95 uses `DOCUMENT_KINDS` while the file imports only `CLASSIFIABLE_DOCUMENT_KINDS`;
`DOCUMENT_KINDS` is exported from `apps/web/lib/documents/types.ts` and never imported here. The
file is **byte-identical to BASE** (`git show 23cfad94:…` has the same line 95 and no import of
that name), its last touching commit is `4b1376f40 merge: riders wave 1 lane 08`, and `apps/web`'s
tsconfig includes only `apps/web/**`. My branch changed nothing under `apps/web`. I did not fix it:
it is not this ticket and the work order forbids widening. **Every wave-2 lane will hit this.**

## Docs, in the same commits

- `packages/db/README.md` — new "0244 — the capability registry's version high-water mark (#846)" section beside 0234's: the five objects and their floors, why the mark is a separate relation (retiring a row stays possible), why the uniformity wall is deferred and not statement-level with both measured refusals, the bounded cost, and the redo-safety contract.
- `packages/db/tests/README.md` — the new battery, its gate module and variable, the one cell that really commits and why that is safe, and the vacuity control.
- `CONTEXT.md` — **Capability registry version**, house `term` / `_Avoid_` shape, under the `<!-- #846 -->` markers.
- `packages/db/tests/rig-meta.mjs` — `DOCUMENT_CAPABILITY_HIGH_WATER_0244_COHORT` (the four ungranted bodies), swept bimodally like 0234's; the block states why the single new relation needs no table roster entry (`governedRlsFailures()`'s derive branch already fails any clara base table that is not RLS-forced — and T18 proves it does here).
- Shared files touched, minimally and at the sorted position: `packages/db/package.json` (one `--import` token appended in migration order), `packages/db/tests/rig-meta.mjs` (one constant block + one sweep block). `CONTEXT.md` gained one entry. No other shared file.

## Vacuity control

`clara._tf_document_capabilities_version_high_water` was recut on the rig to refuse every INSERT
(body sha `8da9f716d1f7c7f83ce367016d32d595852e56e6826dd3223666a7c4d688e4d4`). Cells 1, 5 and 6 went
RED; cells 2, 3, 4 and 7 stayed green, which is correct — they are about the other two walls and
about hygiene. The body was restored through the redo path and re-measured at
`b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9`, byte for byte.

## Successor contract

**None is owed.** #846 adds no door, no grant and no callable verb: all five objects are a relation
no application role can reach and four trigger bodies granted to nobody. No frozen chat or Work
tool can reach `clara.document_capabilities` — every reference in `apps/web` and
`packages/runtime` is a READ (`GET /rest/v1/document_capabilities`, `clara._document_capability`,
`clara.get_document_state`), and the only writers in the whole estate are migrations 0191 (seed)
and 0228 (whole-registry raise). Nothing in the chat or Work lane changes shape.

The refusal vocabulary a future **migration** must know is the contract worth carrying forward:

| SQLSTATE | `detail.reason` | raised by | when |
|---|---|---|---|
| `CLR08` | `registry_version_monotone` | 0207 (unchanged) | an UPDATE lowers a live row's version |
| `CLR08` | `registry_version_high_water` | 0244 | an INSERT lands below the pair's mark; `detail.from` is the mark |
| `CLR08` | `registry_version_high_water_append_only` | 0244 | the mark is deleted, lowered, re-keyed, or its `first_seen_at` moved; `detail.operation` is `DELETE` or `UPDATE` |
| `CLR08` | `registry_version_uniform` | 0244 | a transaction LEAVES more than one distinct version; `detail.versions` is the sorted list |

## For the next implementer in this lane (#782)

#782 re-seeds the registry under this mechanism. Two things now bind it:

1. **Move the WHOLE registry in ONE transaction** if the version changes. The uniformity wall is
   deferred, so an intermediate non-uniform state is fine, but the transaction must not *end*
   split. A per-pair republish across separate transactions will be refused at the first commit.
2. **UPDATE, never delete-then-insert** — which was already the rule, and is now a refusal. If a
   pair must be retired, DELETE is still allowed and its mark survives, so republishing it later
   must be at or above the version it last carried.

`packages/db/tests/document-capability-registry.test.mjs`'s `PUBLISHED_REGISTRY_VERSION` (2 today)
and this lane's rollback-hygiene cell both re-base on the published number; #782 re-bases them in
the same commit, on the precedent 0228 and 0207 both set.

## Follow-ups worth filing

1. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile on the wave-1
   integrated head.** `DOCUMENT_KINDS` is used at line 95 and never imported; `pnpm typecheck`
   fails with TS2552 + TS7006 at base `23cfad94`. It blocks the typecheck gate for every wave-2
   lane and is a one-line import fix, but it belongs to whoever owns that dialog (the #633/#878
   lineage), not to a ticket that never touched `apps/web`.
2. **The uniformity wall's cost is per changed row.** A deferred AFTER ROW trigger fires once per
   changed row at commit, so a 240-row republication runs a 240-row aggregate 240 times. Harmless
   at this size and paid only by migrations, but if the registry ever grows by an order of
   magnitude, a transition-table (`REFERENCING NEW TABLE`) statement trigger paired with a
   deferred one-row sentinel would be the shape to move to. Recorded in the migration header.

## Anything unverified

- **The from-scratch 0001→0244 chain.** Not run: RIG.md rules one from-scratch chain per cluster
  and gives the integrator a disposable one. 0244's prestate and tail both ran on every apply here,
  and the file's only from-scratch-specific assumption — that the registry publishes exactly one
  version when it applies — is measured by the prestate and refuses loudly if it does not hold.
- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine
  to claim.
- **Concurrency.** The uniformity wall is evaluated per transaction at commit, so two concurrent
  transactions could each leave the table uniform in their own snapshot and interleave into a split
  registry under READ COMMITTED. Not exercised, and not reachable today: the registry's only
  writer is the migration runner, which holds a session advisory lock and applies one migration at
  a time. Stated rather than implied to be covered.
