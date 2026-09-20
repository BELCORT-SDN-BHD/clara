# Wave 2 · lane 02 · ticket #993 — the read-set key grammar is stricter than the catalogs' own CHECKs

**Status: DONE.** Branch `riders/w2-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`,
database `127.0.0.1:55742/clara_l02`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
363054f2e test(db): #993 kg.04/kg.05 -- existing catalog keys and the recorder's own check are unmoved
84febd087 feat(db): #993 tighten knowledge-key catalog CHECKs to the recorder's grammar
041c28846 test(db): #913 sd.03/sd.04 -- firm-eligibility and floor unchanged by the drop
c40fc04b7 feat(db): #913 drop the dead clara.knowledge_keys.scope_default column
4dae88baf test(db): #898 fd.04/fd.05 -- firm refusal and promotion-equals-client-row
c8cc4cf5a feat(db): #898 financial_year_end_day knowledge key beside its month
```

Working tree clean at handoff. `git log 23cfad947..HEAD` at start showed exactly #898's and #913's
four commits (both already landed, migrations `0240_financial_year_end_day.sql` and
`0241_knowledge_scope_default_drop.sql` already applied to `clara_l02`) — nothing else preceded my
ticket on this branch.

**The ticket has zero comments** (`gh issue view 993 --comments`; confirmed empty via
`--json comments`), so the issue body's own "Agent Brief" is what binds — there is no owner-ruling
comment dated 2026-09-20 on this issue to override it. **The ticket was still live**: measured on
the lane rig before any change — `clara.knowledge_keys.knowledge_key` and
`clara.client_fact_keys.fact_key` each carried only `CHECK (btrim(key) <> '')`
(`knowledge_keys_knowledge_key_check` / `client_fact_keys_fact_key_check`,
`0192_client_knowledge_records.sql:158` / `0055_client_facts_trio.sql:348`), while
`clara.record_work_knowledge_read` (`0230_knowledge_retrieval.sql:682`) already enforces
`^[a-z][a-z0-9_]{0,62}$` and raises CLR10 `grammar_key` on anything else — the exact gap the
ticket's triage measured, re-confirmed live rather than trusted. **One factual correction to the
ticket's own text**: it states "measured: 13 + 5" live keys; that count was taken before #898 (this
same lane, landed ahead of my ticket) added `financial_year_end_day`. The true live count on this
lane database, re-measured before authoring the migration, is **14 knowledge_keys + 5
client_fact_keys**, all 19 already conforming to the tightened grammar — pinned in the migration's
own prestate rather than the stale ticket figure.

## The seams I tested at (written before the first test)

The brief names two catalogs gaining a stricter CHECK and one function (`record_work_knowledge_read`)
that must stay untouched. Investigating showed no function recut is needed at all — unlike #898's
neighbour ticket, this is a pure two-table constraint swap: a knowledge key is a primary key used
only as a join target and a literal string value elsewhere, so no query shape changes. So the seams
under test are:

1. `pg_constraint` on `clara.knowledge_keys` and `clara.client_fact_keys` — each carries the new
   `ck_..._key_grammar` CHECK under its own name, the old `btrim(...) <> ''` CHECK is gone, and
   every other constraint on both tables survives by name (read).
2. `clara.knowledge_keys` / `clara.client_fact_keys` themselves — a real `INSERT` (root connection,
   the same lane the catalogs are owner-populated through) of a key violating the grammar is
   refused with SQLSTATE 23514 under the new constraint's name (write, direct to the catalog — the
   ticket's own subject, not a capture door).
3. `pg_proc` on `clara.record_work_knowledge_read` — its `prosrc` still resolves at its exact 0230
   signature, proving this migration recut nothing (read).

Everything is exercised through `packages/db/tests/knowledge-key-grammar.test.mjs` (5 cells, one
per clause of the AC, kg.02/kg.03 carrying multiple sub-cases each) plus a regression sweep of
every other file that touches either catalog table or a knowledge capture door.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | focused run of a brand-new file: `the 0242 key-grammar cohort is required for a focused run` — ran `node --test tests/knowledge-key-grammar.test.mjs` BEFORE writing the migration; `keyGrammarCohortApplied()` correctly measured both new constraint names as absent (the established 0192/0220/0240/0241 gate idiom) | `keyGrammarCohortApplied()` in `knowledge-fixtures.mjs`, `tests/key-grammar-preintegration-gate.mjs`, migration §A (drop each catalog's old CHECK, add `ck_knowledge_keys_key_grammar` / `ck_client_fact_keys_key_grammar`) — cells kg.01–kg.03 (AC1/AC3: the constraints' shape, and a live refusal of an uppercase, hyphenated and over-length key on each table) go green once the migration is applied |
| 2 | kg.04/kg.05 (AC2: every existing key still validates; AC4: the recorder's own check is untouched) | **no new code** — passed on first run once slice 1 landed; the migration recuts no function and renames no key |

I applied the migration once — no `#957` redo was needed. `pnpm db:migrate` printed:

```
[notice] #993 prestate: clean -- both catalogs exist, each carries either its pristine btrim-only
CHECK or the already-tightened grammar CHECK (redo), clara.knowledge_keys holds 14 keys and
clara.client_fact_keys holds 5, and every one of those 19 keys already matches
^[a-z][a-z0-9_]{0,62}$.
[notice] #993 splice: clara.knowledge_keys.knowledge_key now carries ck_knowledge_keys_key_grammar
[notice] #993 splice: clara.client_fact_keys.fact_key now carries ck_client_fact_keys_key_grammar
[notice] #993 tail: OK -- ck_knowledge_keys_key_grammar and ck_client_fact_keys_key_grammar are
live with the exact grammar clara.record_work_knowledge_read already enforces, the two old
btrim-only CHECKs are gone, every other constraint on both tables survives by name, the catalogs
still hold 14 and 5 keys respectively with every one of those 19 already conforming,
clara.record_work_knowledge_read still resolves at its 0230 signature (prosrc sha256
8f745815512727bbedfa01f25e66177a066574c461f964574d120b532ac8fc79), and a live rolled-back probe on
each table confirms the new CHECK actually refuses a key the recorder would also refuse -- with no
row left behind by either probe.
applied 0242_knowledge_key_grammar · backend pid 366929
migrate: 1 new migration(s) applied · 232 total · target 127.0.0.1:55742/clara_l02
```

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| Inserting a key into `clara.knowledge_keys` or `clara.client_fact_keys` that would fail `record_work_knowledge_read`'s grammar (uppercase letter, or longer than 63 characters) is refused at insert time by the catalog itself | **done** | `kg.02`: a direct `INSERT` of `Sst_Regime` (uppercase), `sst-regime` (hyphen) and a 64-character all-lowercase key each raises SQLSTATE 23514 under `ck_knowledge_keys_key_grammar` by name; a 63-character key is ADMITTED (boundary control, rolled back, never committed). `kg.03`: the same for `clara.client_fact_keys` (`bad-key`, `1badkey`) under `ck_client_fact_keys_key_grammar`. The migration's own tail additionally proves both refusals live, in a rolled-back probe, before any test ran. |
| All keys currently registered in both catalogs (measured: 13 + 5 in the ticket text, **14 + 5 measured live on this lane**) continue to validate unchanged | **done** | `kg.04`: every one of the 14 `knowledge_keys` rows and 5 `client_fact_keys` rows re-queried live and matched against `^[a-z][a-z0-9_]{0,62}$` in JS, all pass. The migration's own tail proves the same positively in-database (and Postgres's own `ADD CONSTRAINT` validated every existing row before committing — a violation would have aborted the whole migration, which did not happen). |
| A test in the knowledge-retrieval or knowledge-records battery inserts a catalog key that violates the tightened grammar and asserts the catalog refuses it | **done** | `packages/db/tests/knowledge-key-grammar.test.mjs` (its own dedicated battery, the same-lane precedent set by `knowledge-fye-day.test.mjs`/`knowledge-scope-default-drop.test.mjs` rather than folding into an existing file) — `kg.02`/`kg.03` are exactly this test. |
| `clara.record_work_knowledge_read`'s own grammar check is untouched | **done** | `kg.05`: the function still resolves at its exact 0230 twelve-argument signature; this migration file contains no `create or replace function` for it at all (grepped) — the migration's own tail re-measures its live `prosrc` sha256 as the positive proof rather than relying on the grep alone. |

### Out of scope, honored

No existing key was renamed, migrated or dropped — `kg.04` and the migration's own tail prove the
row counts (14, 5) and every key's own text are unmoved. `clara.record_work_knowledge_read`'s
grammar was not widened or weakened — see AC4 above. The broader "estate key law" documentation
beyond these two catalogs was not touched.

## Why no function needed a recut (not an oversight — checked)

A knowledge key or fact key is a `text primary key`, read only as a join target
(`references clara.knowledge_keys(knowledge_key)` / `references clara.client_fact_keys(fact_key)`)
or compared as a literal string (`where knowledge_key = 'financial_year_end_month'`, etc.) — never
parsed, sliced or pattern-matched by any function body. A stricter CHECK on which characters a
*future* key may contain therefore changes no existing query's behaviour for any key that already
exists, and #993's own brief asks for exactly that: the catalogs' insert-time wall, not a change to
any reader.

## Gates, with counts

- **Test file added, full gate chain** (`$GATES` = every `--import ./tests/*-preintegration-gate.mjs`
  in `packages/db/package.json`, including the new `key-grammar-preintegration-gate.mjs`):
  - `tests/knowledge-key-grammar.test.mjs` — **5/5 cells pass (11/11 sub-tests)** (kg.01–kg.05).
- **Regression sweep** of every db test file that touches `clara.knowledge_keys` or
  `clara.client_fact_keys` directly, or calls a capture door
  (`capture_knowledge`/`capture_knowledge_for`/`promote_plan_answers_to_knowledge`/`correct_knowledge`),
  since the change touches both tables' own CHECK constraints:
  - `knowledge-scope-default-drop.test.mjs` — 4/4
  - `knowledge-fye-day.test.mjs` — 5/5
  - `knowledge-firm-defaults.test.mjs` — 21/21
  - `firm-setup.test.mjs` — 17/17
  - `knowledge-legacy-readers-converge.test.mjs` — 8/8
  - `knowledge-onboarding-promotion.test.mjs` — 13/13
  - `knowledge-records.test.mjs` — 27/27
  - `knowledge-retrieval.test.mjs` — 28/28
  - `rig-docs-source-revision.test.mjs` — 16/16
  - **139/139 pass** in total. No SQL function was added or recut, so this sweep is a sanity check
    beyond the letter of the gate list, not an expected finding source — same posture #898's and
    #913's own reports took for theirs.
- `operation-census.test.mjs` — **10/10 pass**. Not strictly required (no SQL function added, no
  grant changed), run anyway for the same reason #913's report gave.
- `rig-isolation.test.mjs` — **22 pass / 1 skip** (T19, the documented destructive-flag skip; never
  run with reset flags, per RIG.md). Not strictly required, run anyway.
- `preintegration-gate-chain.test.mjs` — **5/5 pass**, confirming the new gate file is preloaded by
  `package.json` and the corpus stays non-empty on both sides.
- `pnpm typecheck` — **apps/web FAILS, packages/runtime passes.** The apps/web failure
  (`components/documents/document-kind-dialog.tsx(95,22): Cannot find name 'DOCUMENT_KINDS'`) is
  **pre-existing and unrelated**: re-verified with `git show 23cfad947:apps/web/components/documents/document-kind-dialog.tsx`
  — the same undefined reference is already present at the lane's base commit, in a file this
  ticket never touches (`git diff --stat 23cfad947..HEAD -- apps/web` is empty for this whole
  branch). Same finding #898's and #913's own reports already recorded on this branch; not re-filed.
- `pnpm lint` — **exit 0**, whole repo, including `packages/db`'s own `eslint .` (the chain reached
  its final step, `packages/reporting-render`'s own lint, which only happens if every earlier
  `&&`-joined step exited zero).
- `apps/web` and `packages/runtime` were not touched; their unit suites, e2e walks, and
  `check-frozen-workflows.mjs`/`check-parts-parity.mjs` were not run (work-order rule 8 conditions
  those on having touched those trees).
- **NOT run**: a full `pnpm --filter @clara/db test` (the whole package's ~230+ test files) — same
  judgement call #913's report made: the 139-test regression sweep above already covers every file
  that touches either catalog table or a knowledge capture door, which is this change's entire
  blast radius, and I moved on rather than blocking on an unbounded whole-package run.

## Migration

`packages/db/migrations/0242_knowledge_key_grammar.sql` — new, exactly one file at the reserved
number.

- **Prestate pins** (measured live on `clara_l02` before any change in this ticket):
  - `clara.knowledge_keys.knowledge_key`'s CHECK reads exactly
    `CHECK ((btrim(knowledge_key) <> ''::text))` under `knowledge_keys_knowledge_key_check` (or
    already the post-tightening `CHECK ((knowledge_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))` under
    `ck_knowledge_keys_key_grammar`, for a `#957` redo).
  - `clara.client_fact_keys.fact_key`'s CHECK reads exactly `CHECK ((btrim(fact_key) <> ''::text))`
    under `client_fact_keys_fact_key_check` (or the tightened equivalent, for a redo).
  - Row counts pinned at 14 (`knowledge_keys`) and 5 (`client_fact_keys`) — measured NOW on this
    lane, not the ticket's own stale "13 + 5" (see the correction noted above).
  - Every one of those 19 live keys already matches `^[a-z][a-z0-9_]{0,62}$` — a fail-closed guard
    proving the change below is lossless before it runs.
- **The change**: `set role clara_fn_owner;` then, per table, `drop constraint if exists
  <old_check>` (a plain, naturally redo-safe top-level statement, the 0037/0241 idiom) followed by
  a guarded `add constraint ck_..._key_grammar check (... ~ '^[a-z][a-z0-9_]{0,62}$')` inside a
  `do` block that skips the ADD if the named constraint is already live (Postgres has no
  `ADD CONSTRAINT IF NOT EXISTS`, unlike `DROP CONSTRAINT IF EXISTS`).
- **Tail assertions**: both new CHECKs are live under their exact definitions and names; both old
  CHECKs are gone; `ck_knowledge_keys_policy_authority` and both primary keys survive untouched;
  row counts (14, 5) are unmoved; every live key still matches the tightened grammar (re-measured,
  not merely inferred from the ALTER not raising); `clara.record_work_knowledge_read` still
  resolves at its exact 0230 signature; a live, rolled-back probe on each table proves the new
  CHECK actually refuses an invalid key, with no row left behind by either probe.
- **Redo used**: no. The file applied cleanly on the first attempt.
- **Gate-chain entry**: `tests/key-grammar-preintegration-gate.mjs` (new; sets
  `CLARA_ALLOW_MISSING_KEY_GRAMMAR_0242=1`), wired into `packages/db/package.json`'s `test` script
  immediately after `scope-default-drop-preintegration-gate.mjs` (migration order — 0242 is the
  newest). `preintegration-gate-chain.test.mjs` confirms both the preload and the file's existence.
- **Rig-meta cohort**: none added, deliberately — same reasoning #898's and #913's reports gave.
  `packages/db/tests/rig-meta.mjs`'s cohorts attribute GRANTS (which functions exist and who may
  `EXECUTE` them); this migration adds zero functions, drops zero functions and changes zero
  grants — it is a two-table CHECK-constraint swap. Adding an empty cohort entry there would
  document nothing; the domain-specific cohort instead lives in `knowledge-fixtures.mjs`
  (`keyGrammarCohortApplied`), the same house as `fyeDayCohortApplied` / `scopeDefaultDroppedCohortApplied`.

## Docs

- `packages/db/README.md`, the "read-set row" paragraph describing `record_work_knowledge_read`'s
  grammar: the sentence claiming the grammar is "stricter than the catalog's own `btrim(...) <> ''`"
  is corrected to say `0242_knowledge_key_grammar.sql` (#993) has since tightened both catalogs to
  the SAME grammar under their own named CHECK constraints, naming that the recorder's own check
  stays the source of truth and was not touched.
- `CONTEXT.md`: **no entry added or removed, by design** — checked for precedent first, same as
  #898/#913. There is no dedicated CONTEXT.md term for an individual catalog CHECK constraint in
  this repo's house style.
- `docs/PROGRESS.md`: not touched — the wave orchestrator's file, outside a single ticket's report
  per the addendum's rule 10.

## Successor contracts

None. No frozen chat or Work-tool body reads or writes either catalog's key text in a way this
migration's tightened CHECK could affect — a key is always a literal string comparison or a join
target, both unaffected by which characters a *new* key may legally contain. Nothing downstream
changes shape, needs a new zod input, a new door call, a new refusal mapping or a new prompt
stanza.

## Follow-ups worth filing

- None new from this ticket. The one pre-existing defect re-confirmed (`apps/web`'s
  `document-kind-dialog.tsx` `DOCUMENT_KINDS` typecheck break) was already flagged as a follow-up
  by #898's and #913's own reports on this same branch; filing it a third time would duplicate that
  record.

## Anything unverified

- A true from-scratch `0001→0242` migration chain on a disposable cluster — per RIG.md, that is the
  integrator's proof, not a lane's; I did not attempt a second from-scratch chain on this lane's
  already-once-migrated cluster.
- The full `pnpm --filter @clara/db test` package run (see "Gates" above) was not attempted, for the
  same bounded-effort reason #913's own report gave; the 139-test targeted regression sweep plus
  `operation-census`/`rig-isolation` is the evidence offered in its place.
