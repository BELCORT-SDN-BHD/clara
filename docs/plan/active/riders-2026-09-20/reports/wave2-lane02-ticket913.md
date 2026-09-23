# Wave 2 · lane 02 · ticket #913 — `clara.knowledge_keys.scope_default` is now provably dead

**Status: DONE.** Branch `riders/w2-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`,
database `127.0.0.1:55742/clara_l02`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
041c28846 test(db): #913 sd.03/sd.04 -- firm-eligibility and floor unchanged by the drop
c40fc04b7 feat(db): #913 drop the dead clara.knowledge_keys.scope_default column
4dae88baf test(db): #898 fd.04/fd.05 -- firm refusal and promotion-equals-client-row
c8cc4cf5a feat(db): #898 financial_year_end_day knowledge key beside its month
```

Working tree clean at handoff. `git log 23cfad947..HEAD` at start showed exactly #898's two
commits (already landed, its migration `0240_financial_year_end_day.sql` already applied to
`clara_l02`) — nothing else preceded my ticket on this branch.

**The ticket's only comment is the 2026-09-17 triage "Agent Brief"** (`gh issue view 913
--comments`); there is no owner-ruling comment dated 2026-09-20 on this issue, so that Agent Brief
is what binds. **The ticket was still live**: measured on the lane rig before any change —
`scope_default` was present on `clara.knowledge_keys` (`text not null default 'client' check
(scope_default in ('client','firm'))`, constraint name `knowledge_keys_scope_default_check`), every
one of the 14 seeded rows carried `'client'`, and a repo-wide grep found the identifier in exactly
three places, all inside `0192_client_knowledge_records.sql` (the column definition and its two
seeding `INSERT` column lists) plus three comment-only mentions in `0220`/`0230`/`0240` — none of
them a read. This matches the triage comment's own claim verbatim; I re-verified it rather than
trusting it.

## The seams I tested at (written before the first test)

The brief names one relation losing a column (`clara.knowledge_keys`) and one relation/mechanism
that must stay the wall (`clara.knowledge_key_firm_eligibility`, unchanged). Investigating showed
no function needed recutting — unlike #898's neighbour ticket, `scope_default` is read by no
`SELECT`, no `WHERE`, no PL/pgSQL variable field access anywhere in the migrations that define
`clara._knowledge_assert_value`, `clara._knowledge_floor`, `clara._tf_knowledge_firm_eligibility`
or any capture door — confirmed by reading every `select * into k from clara.knowledge_keys …` and
`join clara.knowledge_keys k …` site in `0192`/`0220`/`0230` and finding no `.scope_default` field
access anywhere. So the seams under test are:

1. `information_schema.columns` / `pg_constraint` on `clara.knowledge_keys` — the column and its
   own CHECK are gone; the one OTHER table-level CHECK on the same table survives by name (read).
2. `clara.knowledge_keys` itself — the catalogue's rows, count and kind census are unmoved by the
   drop (read).
3. `clara.capture_knowledge` at `p_scope_kind => 'firm'` — the existing 0220 eligibility wall,
   unmodified, still refusing a client-identity key and admitting the three D8-seeded keys (write,
   through the real public door).
4. `clara._knowledge_floor` — the five probes 0192's own tail pinned, unchanged.

Everything is exercised through `packages/db/tests/knowledge-scope-default-drop.test.mjs` (4
cells, one per clause of the AC) plus one fix-up to an existing test whose assertion named the
column directly, and re-proved in-migration by 0241's own prestate/tail.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | focused run of a brand-new file: `the 0241 scope_default-drop cohort is required for a focused run` — ran `node --test tests/knowledge-scope-default-drop.test.mjs` BEFORE writing the migration; `scopeDefaultDroppedCohortApplied()` correctly measured the column as still present (the established 0192/0220/0240 gate idiom) | `scopeDefaultDroppedCohortApplied()` in `knowledge-fixtures.mjs`, `tests/scope-default-drop-preintegration-gate.mjs`, migration §A (`alter table … drop column if exists scope_default`) — cells sd.01/sd.02 go green once the migration is applied |
| 2 | sd.03/sd.04 (firm-eligibility wall and floor function unchanged) | **no new code** — passed on first run once slice 1 landed; neither `_tf_knowledge_firm_eligibility` nor `_knowledge_floor` ever read the dropped column |
| — | one EXISTING test broke as a direct, predicted consequence of the drop | `knowledge-fye-day.test.mjs`'s `fd.01`, whose `SELECT` named `scope_default` — fixed in the SAME commit as the migration (removed the column from the select list and the assertion; reworded the cell's title from "typed/scoped/floored" to "typed/floored" and pointed its scope-side claim at `sd.03`) |

I applied the migration once — no `#957` redo was needed; `drop column if exists` is idempotent by
construction, so there was nothing to re-edit after the first apply. `pnpm db:migrate` printed:

```
[notice] #913 prestate: clean -- clara.knowledge_keys holds 14 keys; scope_default is either the
pristine text-not-null-default-'client' column with its own CHECK and every row still 'client', or
already dropped (redo).
[notice] #913 tail: OK -- clara.knowledge_keys.scope_default and its own CHECK are gone,
ck_knowledge_keys_policy_authority (unrelated) survives, the catalogue still holds 14 keys at the
same kind census, clara._knowledge_floor answers the five 0192-pinned probes unchanged, and the
firm-scope-refused census is still 10.
applied 0241_knowledge_scope_default_drop · backend pid 363580
migrate: 1 new migration(s) applied · 231 total · target 127.0.0.1:55742/clara_l02
```

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| The column is absent and the two seeding inserts still succeed on a from-scratch re-apply | **done** | `sd.01` (rowCount 0 for `information_schema.columns`/`scope_default`; `knowledge_keys_scope_default_check` gone from `pg_constraint`; `ck_knowledge_keys_policy_authority`, the ONE other table-level CHECK, survives with its definition unchanged). The migration's own prestate/tail ran the from-scratch-relevant half live on `clara_l02` (both printed above). A true `0001→0241` from-scratch chain is the integrator's proof (RIG.md: one chain per cluster; a lane never runs a second one) — **unverified by me, stated as such**. What I DID verify directly: `0192`'s two seeding `INSERT`s (which name `scope_default` in their column lists) are chronologically BEFORE `0241` in every apply order and are byte-untouched by this ticket, so they resolve against a schema that still carries the column at the moment they run, in any from-scratch chain — a fact about migration ORDER, not something a single already-migrated database can re-demonstrate by running twice. |
| The firm-defaultability cells pass unchanged (client-identity key refused at firm scope; the three seeded defaultable keys admitted) | **done** | `sd.03`, through the real `clara.capture_knowledge` door: `financial_year_end_month` at `p_scope_kind='firm'` raises CLR10 `knowledge_scope_not_firm_defaultable`; `default_currency`, `reporting_framework` (object value, POLICY kind) and `accounting_basis` (object value, POLICY kind) each return `status: 'captured'`. The EXISTING `knowledge-firm-defaults.test.mjs` battery (21 cells, unedited) also reran green — **21/21 pass** — proving the drop disturbs none of #654's own eligibility cells either. |
| The catalogue's key count and kind/floor assertions are unchanged | **done** | `sd.04`: `count(*) = 14` (unmoved); `clara._knowledge_floor('entity_type','client')='admin'`, `('customer_identity_policy','client')='owner'`, `('coa_seed_decision','client')='bookkeeper'`, `('coa_seed_decision','firm')='admin'`, `('reporting_framework','client')='admin'` — the exact five probes `0192`'s own `#644 tail` pinned, all unchanged; the firm-scope-refused census is still 10 (`#898`'s own tail value). `sd.02` additionally proves the kind census (`assertion=11, policy=2, preference=1`) and 0240's own newest row (`financial_year_end_day`) survive the drop byte-for-byte on every REMAINING column. |

### Out of scope, honored

`clara.knowledge_key_firm_eligibility` and its two guard triggers (0220): byte-untouched —
confirmed no file diff touches migration 0220. The thirteen (now fourteen) seeded keys: no row
added, removed or edited — `sd.02`'s count and kind-census assertions are the direct proof. The
plan-item map (`clara.knowledge_plan_item_map`): not read or written by this migration at all.

## Why no function needed a recut (not an oversight — checked)

`#898`'s neighbour ticket needed a splice because `clara._knowledge_assert_value` fails closed on
an unimplemented `validated_against` label and every capture door calls it first. `scope_default`
has no analogous choke point: I read every site that does `select * into k from
clara.knowledge_keys …` (`0192:578,672,937,1244,1388`; `0220:719`; `0230:468`) and every `join
clara.knowledge_keys k on …` in `0192`/`0220`/`0230`, and none of them ever writes `k.scope_default`
or `NEW.scope_default` — a `SELECT * INTO` PL/pgSQL record variable is populated from whatever
columns the table carries AT RUN TIME, so dropping a column nobody's code names is invisible to
every one of those bodies. This is exactly what the ticket's own triage measured ("read nowhere in
`packages/` or `apps/`") and what my own prestate re-measured before authoring the drop.

## Gates, with counts

- **Test files added/touched, full gate chain** (`$GATES` = every `--import
  ./tests/*-preintegration-gate.mjs` in `packages/db/package.json`, including the new
  `scope-default-drop-preintegration-gate.mjs`):
  - `tests/knowledge-scope-default-drop.test.mjs` — **4/4 pass** (sd.01–sd.04).
  - `tests/knowledge-fye-day.test.mjs` — **5/5 pass** (the `fd.01` fix).
- **Regression sweep** of every other db test file that calls a capture door
  (`capture_knowledge`/`capture_knowledge_for`/`promote_plan_answers_to_knowledge`/`correct_knowledge`)
  or otherwise touches `clara.knowledge_keys`, since the drop touches a table all of them share:
  `knowledge-firm-defaults.test.mjs` (21/21), `firm-setup.test.mjs` (17/17),
  `knowledge-legacy-readers-converge.test.mjs` (8/8), `knowledge-onboarding-promotion.test.mjs`
  (13/13), `knowledge-records.test.mjs` (27/27), `knowledge-retrieval.test.mjs` (28/28),
  `rig-docs-source-revision.test.mjs` (16/16) — **130/130 pass** in total (109 across the six
  non-firm-defaults files run together, plus the 21 of `knowledge-firm-defaults.test.mjs` run
  separately). No SQL function was added or recut (see above), so this sweep is a sanity check
  beyond the letter of the gate list, not an expected finding source — same posture #898's report
  took for its own, larger, blast radius.
- `operation-census.test.mjs` — **10/10 pass**. Not strictly required (I added no SQL function and
  changed no grant), run anyway for the same reason.
- `rig-isolation.test.mjs` — **22 pass / 1 skip** (T19, the documented destructive-flag skip; never
  run with reset flags, per RIG.md). Not strictly required for the same reason as above.
- `preintegration-gate-chain.test.mjs` — **5/5 pass**, confirming the new gate file is preloaded by
  `package.json` and the corpus stays non-empty on both sides.
- `pnpm typecheck` — **apps/web FAILS, packages/runtime and packages/db pass.** The apps/web
  failure (`components/documents/document-kind-dialog.tsx(95,22): Cannot find name
  'DOCUMENT_KINDS'`) is **pre-existing and unrelated**: re-verified with `git show
  23cfad947:apps/web/components/documents/document-kind-dialog.tsx` — the same undefined reference
  is already present at the lane's base commit, in a file this ticket never touches (this is the
  same finding #898's own report recorded on this branch; not re-filed, just re-confirmed).
- `pnpm lint` — **exit 0**, whole repo, including `packages/db`'s own `eslint .`,
  `check-wiki-dynamic-sql.mjs` (part of the chained root `lint` script; the chain reached its final
  step, `packages/reporting-render`'s own lint, which only happens if every earlier `&&`-joined
  step exited zero) and a direct `eslint` pass over the three files I added/touched in
  `packages/db/tests`.
- **NOT run**: a full `pnpm --filter @clara/db test` (the whole package's ~230+ test files). This
  is a broader sweep than rule 8 asks for (it names the touched files plus
  `operation-census`/`rig-isolation`); I started it as an extra check, but it produced no output
  within the session (no per-file TAP lines reached the redirected log even after a long wait,
  consistent with a large recursive run whose reporter buffers until the whole package script
  exits) and I did not block the rest of the ticket on it. The regression sweep above already
  covers every file that touches `clara.knowledge_keys` or a knowledge capture door, which is the
  drop's entire blast radius.
- `apps/web` and `packages/runtime` were not touched; their unit suites and e2e walks were not run
  (work-order rule 8 conditions those on having touched those trees).

## Migration

`packages/db/migrations/0241_knowledge_scope_default_drop.sql` — new, exactly one file at the
reserved number.

- **Prestate pins** (measured live on `clara_l02` before any change in this ticket):
  - `clara.knowledge_keys` exists; `scope_default` (if present) is `data_type='text'`,
    `is_nullable='NO'`, `column_default="'client'::text"`, with CHECK
    `knowledge_keys_scope_default_check` reading exactly `CHECK ((scope_default = ANY
    (ARRAY['client'::text, 'firm'::text])))`, and every seeded row's value is `'client'` (no
    `'firm'` row exists to lose a signal). The prestate also accepts the column already absent
    (a `#957` redo or a second apply of this unedited file), since `drop column if exists` is its
    own redo guard.
  - Row count pinned at 14 (0192's 13 plus 0240's `financial_year_end_day`).
- **The change**: `set role clara_fn_owner; alter table clara.knowledge_keys drop column if
  exists scope_default; reset role;` — one statement. Postgres drops the column's `DEFAULT` and
  its `CHECK` with it; neither is a separate object this file names to remove.
- **Tail assertions**: the column and its CHECK are gone; the one OTHER table-level CHECK
  (`ck_knowledge_keys_policy_authority`) survives with its exact definition; the catalogue's row
  count (14) and kind census (`assertion=11, policy=2, preference=1`) are unmoved; the five
  `clara._knowledge_floor` probes `0192`'s own tail pinned are unchanged; the firm-scope-refused
  census (`#898`'s own tail: 10) is unmoved.
- **Redo used**: no. The file applied cleanly on the first attempt; `drop column if exists` needed
  no follow-up edit.
- **Gate-chain entry**: `tests/scope-default-drop-preintegration-gate.mjs` (new; sets
  `CLARA_ALLOW_MISSING_SCOPE_DEFAULT_DROP_0241=1`), wired into `packages/db/package.json`'s `test`
  script immediately after `fye-day-preintegration-gate.mjs` (migration order — 0241 is the
  newest). `preintegration-gate-chain.test.mjs` confirms both the preload and the file's existence.
- **Rig-meta cohort**: none added, deliberately — same reasoning #898's report gave for its own
  ticket. `packages/db/tests/rig-meta.mjs`'s cohorts attribute GRANTS (which functions exist and
  who may `EXECUTE` them) so `operation-census`'s completeness check can tell a half-applied
  migration from a real gap. This migration adds zero functions, drops zero functions and changes
  zero grants (verified: `has_function_privilege` on `clara._knowledge_assert_value` and
  `clara._knowledge_floor` was not probed by this migration's tail because neither function was
  touched at all, not even re-created). Adding an empty or vacuous cohort entry would document
  nothing; I recorded the reasoning here instead.

## Docs

- `packages/db/README.md`, "Knowledge scope, firm defaults and exceptions": the sentence
  describing `knowledge_keys.scope_default` as "deliberately NOT the mechanism" (present tense, as
  if the column still existed but inertly) is corrected to say the column has been DROPPED by this
  migration, naming it.
- `CONTEXT.md`: **no entry added or removed, by design** — checked for precedent first, same as
  #898. There was never a dedicated CONTEXT.md term for `scope_default` (individual catalogue
  columns are not glossary entries in this repo's house style), so there is nothing to retire.
- `docs/PROGRESS.md`: not touched — the wave orchestrator's file, outside a single ticket's report
  per the addendum's rule 10.

## Successor contracts

None. No frozen chat or Work-tool body reads or writes `scope_default` — the runtime's knowledge
reads (`clara.get_knowledge_pack`, `clara.list_client_knowledge`) never selected it, so nothing
downstream of this migration changes shape, needs a new zod input, a new door call, a new refusal
mapping or a new prompt stanza.

## Follow-ups worth filing

- None new from this ticket. The one pre-existing defect I re-confirmed (`apps/web`'s
  `document-kind-dialog.tsx` `DOCUMENT_KINDS` typecheck break) was already flagged as a follow-up
  by `#898`'s own report on this same branch; filing it twice would duplicate that record.

## Anything unverified

- A true from-scratch `0001→0241` migration chain on a disposable cluster — per RIG.md, that is
  the integrator's proof, not a lane's; I did not attempt a second from-scratch chain on this
  lane's already-once-migrated cluster.
- The full `pnpm --filter @clara/db test` package run (see "Gates" above) did not complete within
  the session; I judged the targeted regression sweep (130 tests across every file touching
  `clara.knowledge_keys` or a knowledge capture door, plus `operation-census` and `rig-isolation`)
  sufficient evidence for a column-drop-only migration that recuts no function and changes no
  grant, and moved on rather than blocking the ticket on an unbounded wait.
