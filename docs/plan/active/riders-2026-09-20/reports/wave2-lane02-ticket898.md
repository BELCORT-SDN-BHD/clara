# Wave 2 · lane 02 · ticket #898 — `financial_year_end_day` beside its month in Knowledge

**Status: DONE.** Branch `riders/w2-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`,
database `127.0.0.1:55742/clara_l02`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
4dae88baf test(db): #898 fd.04/fd.05 -- firm refusal and promotion-equals-client-row
c8cc4cf5a feat(db): #898 financial_year_end_day knowledge key beside its month
```

Working tree clean at handoff. No commit in this lane preceded mine (`git log
23cfad947..HEAD` was empty at start; no migration had been applied to the lane database). The
ticket's only comment is the 2026-09-17 triage "Agent Brief" (`gh issue view 898 --comments`);
there is no owner-ruling comment dated 2026-09-20 on this issue. **The ticket was still live**:
measured on the lane rig before any change — migration 0192 minted `financial_year_end_month` and
nothing for the day, migration 0220 seeded exactly three firm-eligible keys and refused nine
(13-key catalog), and `clara._knowledge_assert_value`'s live `prosrc` sha256 was
`0b0ac71c31ad26ec86d5bb6b2ed4e7bdbabcdf1267692bc21a9d898575b92949` (measured directly against
`clara_l02`, matching the pin the migration's own prestate now asserts).

## The seams I tested at (written before the first test)

The brief names two relations (`clara.knowledge_keys`, `clara.knowledge_plan_item_map`) and two
"unchanged" interfaces (the firm-eligibility relation, `clara.set_client_fy_end`). Investigating
those relations showed the real seam is one level down: **every** capture door
(`capture_knowledge`, `capture_knowledge_for`, `promote_plan_answers_to_knowledge`,
`correct_knowledge`) calls `clara._knowledge_assert_value` before a row is ever built
(0192:936,1243), and that function fails closed on a `validated_against` label it does not
implement (0192:718-722). So "typed and validated the same way" the month key is is not
decorative — without a `range:day_1_31` branch the new key would exist in the catalogue but be
permanently uncapturable. The five seams under test, each a real public door or the live catalogue
itself, never an internal collaborator:

1. `clara.knowledge_keys` — the catalogue row's shape (read).
2. `clara.capture_knowledge` — door-level range validation (write, client scope).
3. `clara.knowledge_plan_item_map` — the map row (read).
4. `clara.capture_knowledge` at `p_scope_kind => 'firm'` — the existing 0220 eligibility wall,
   unmodified, applied to a key it has never seen.
5. `clara.set_client_fy_end` + `clara.promote_plan_answers_to_knowledge` — the full onboarding →
   Knowledge path, compared against the client row it is supposed to agree with.

Everything is exercised through `packages/db/tests/knowledge-fye-day.test.mjs` (5 cells, one per
AC) plus fix-ups to two existing batteries whose assertions measure the live catalogue
exhaustively, and re-proved in-migration by 0240's own prestate/tail.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | focused run of a brand-new file: `the 0240 fye-day cohort is required for a focused run` (the established gate idiom — 0192/0220's own `knowledgeCohortApplied`/`knowledgeFirmCohortApplied` fail the same way pre-migration) | `fyeDayCohortApplied()` in `knowledge-fixtures.mjs`, `tests/fye-day-preintegration-gate.mjs`, migration §A.1/A.2 (catalogue row + map row) — cells fd.01/fd.03 go green |
| 2 | fd.02 (door-level 1–31 validation): `knowledge key financial_year_end_day carries a validation label (range:day_1_31) this door does not implement` (CLR10) | migration §B — the splice adding `range:day_1_31` to `clara._knowledge_assert_value` |
| 3 | fd.04 (firm-scope refusal, same reason as the month key) | **no new code** — passed on first run once slices 1–2 landed; the existing `_tf_knowledge_firm_eligibility` trigger already covers any key absent from `knowledge_key_firm_eligibility`, by construction |
| 4 | fd.05 (promotion equals the client row) | **no new code** — passed on first run; the generic `item_key ⋈ knowledge_plan_item_map` join in `promote_plan_answers_to_knowledge` needed nothing fye_day-specific |
| — | two EXISTING batteries broke as a direct, predicted consequence of growing the live catalogue | `tests/knowledge-firm-defaults.test.mjs` (`9 refused` → `10`) and `tests/knowledge-onboarding-promotion.test.mjs` (`EXPECTED_MAP` gains `fye_day`; a new `EXPECTED_MAP_V2` keeps the v2-only promotion cell correct now that the full map and the v2 interview's own item set diverge) |

Slices 1 and 2 each needed a real schema change; I applied the migration once for slice 1 then
edited the same (still-unmerged) file and used the #957 redo mode
(`CLARA_MIGRATION_REDO=0240_financial_year_end_day`) to add the splice — recorded below under
"migration". Slices 3 and 4 are the emergent-behaviour proof the brief itself predicts ("no product
decision is left"); writing them as their own cells, rather than skipping them as "obviously true",
is what turns that claim into evidence.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| The catalogue carries the day key; the count assertions in the applied chain still pass from scratch | **done** | `knowledge-fye-day.test.mjs` cell `fd.01` — `kind='assertion'`, `value_shape='number'`, `validated_against='range:day_1_31'`, `allowed_values=null`, `scope_default='client'`, `authority_bearing=false`, `min_role='bookkeeper'` (the exact shape `financial_year_end_month` carries, read live). 0220's own from-scratch tail (`array_length(v_refused,1) <> 9`) is untouched by a from-scratch replay because it evaluates the catalogue as of 0220's own position in the chain (13 keys), strictly before 0240 ever runs — verified by re-reading 0220's tail logic, not merely asserted. The one count assertion that DOES move at the live-catalogue level (`knowledge-firm-defaults.test.mjs`, "9 refused" → "10") is fixed in the same commit as the migration and passes: `node --test … tests/knowledge-firm-defaults.test.mjs` → 21/21 pass. |
| The map carries one row from the day's interview item to the key | **done** | cell `fd.03` — exactly one `clara.knowledge_plan_item_map` row, `item_key='fye_day'`, `knowledge_key='financial_year_end_day'`. `item_key` is the v4/v5 interview's own (`packages/runtime/workflows/interview.v4.questions.ts` `fyeDayItems`, unmodified — nothing in `packages/runtime` was touched). |
| A cell proves a firm-scope capture of the key is refused with the month key's typed reason | **done** | cell `fd.04` — `capture_knowledge(scope='firm', key='financial_year_end_day', value=15)` and the same call for `financial_year_end_month` both raise CLR10 with `detail.reason` compared for exact equality: both `knowledge_scope_not_firm_defaultable`. Zero firm-scope rows land for either. No code changes the eligibility relation or its trigger — the migration's own tail asserts `financial_year_end_day` is absent from `clara.knowledge_key_firm_eligibility`. |
| A cell proves a committed onboarding plan with a day answer yields a knowledge value equal to the client row's day | **done** | cell `fd.05` — `clara.set_client_fy_end(client, 6, 20, opKey)` sets `clara.clients.fy_end_month/fy_end_day` to `(6, 20)`; a committed plan answering `fye=6, fye_day=20` promotes through `clara.promote_plan_answers_to_knowledge` (0 skipped, 0 withheld, both promoted); the resulting `clara.knowledge_records` rows for both keys are read back and compared field-by-field against the SAME client row's `fy_end_month`/`fy_end_day` — equal on both. |
| From-scratch apply with prestate and tail proof | **done, integrator scope excluded** | The prestate and tail are in the file and both ran, twice (first apply, then a #957 redo after an edit): `#898 prestate: clean …` and `#898 tail: OK …`, both printed by `pnpm db:migrate` / `node scripts/migrate.mjs` against `clara_l02`. A true from-scratch 0001→0240 chain on a fresh cluster is the integrator's job (RIG.md: one from-scratch chain per cluster; a lane never runs a second one) — **unverified by me, and stated as such**, exactly as RIG.md directs. |

### Out of scope, honored

`clara.set_client_fy_end` and `ck_clients_fy_end` (0041): byte-untouched — confirmed no file diff
touches migration 0041. The day is not required for commit: `onboarding_plan_items.required_for_commit`
for `fye_day` is unaffected (nothing in this migration reads or writes it). No existing client's
Knowledge is backfilled: the migration inserts exactly one catalogue row and one map row, no
`clara.knowledge_records` rows.

## The one recut, and why it was unavoidable (not scope creep)

`clara._knowledge_assert_value` (0192) is a private, ungranted, `stable security definer` function
with a closed `if/elsif` ladder over `validated_against` labels; an unrecognised label is refused,
never silently accepted. Every public capture door calls it before constructing a row. Adding
`financial_year_end_day` with `validated_against => 'range:day_1_31'` and doing nothing else would
have shipped a catalogue row that could never actually be captured — the ticket's own "typed and
validated the same way" language is the acceptance criterion this recut satisfies, not a stretch
goal. The recut:

- is a **splice**, not a rewrite: harvests the LIVE `pg_get_functiondef` text, locates the
  `shape_only` arm by exact anchor text (asserted to occur once), and inserts one new `elsif`
  arm immediately before it — the same shape `range:month_1_12`'s own arm has.
- pins the pre-splice `prosrc` sha256 in `§0` (MEASURED live on `clara_l02`, not transcribed from
  0192's file text) and re-measures in `§Z`, additionally checking every OTHER label's arm
  survived at its own original occurrence count (`format_only` is legitimately named twice in the
  unmodified body — once in its `elsif` condition, once in its own error message — so the tail
  asserts 2 there, not 1; every other label is asserted at 1).
- re-verifies `SECURITY DEFINER`, the pinned `search_path`, and that the ACL is still empty (no
  role — not even `clara_authenticated` — can `EXECUTE` it; `CREATE OR REPLACE` preserves ACL by
  Postgres's own rule, and the tail checks rather than trusts that).
- is **idempotent under #957 REDO**: the prestate accepts either the pre-splice or the exact
  post-splice `prosrc` (both measured, both literal), and the splice itself checks for its own
  `range:day_1_31` marker and no-ops if already present, rather than re-running `replace()` against
  an already-spliced body (which would have duplicated the arm). Both `§A` inserts are
  `INSERT … WHERE NOT EXISTS`, never a bare `INSERT`, for the same reason. This was exercised for
  real, twice: I applied the migration in two real work sessions (catalogue+map, then the splice)
  and used `CLARA_MIGRATION_REDO=0240_financial_year_end_day` both times the file changed after its
  first apply, recording each redo's prestate/splice/tail notices above.
- **does not** touch `clara.knowledge_key_firm_eligibility` or its two guard triggers (0220) — AC3
  is proved, not implemented, by this file.

## Gates, with counts

- **Test files added/touched, full gate chain** (`$GATES` = every `--import
  ./tests/*-preintegration-gate.mjs` in `packages/db/package.json`, including the new
  `fye-day-preintegration-gate.mjs`):
  - `tests/knowledge-fye-day.test.mjs` — **5/5 pass** (fd.01–fd.05).
  - `tests/knowledge-firm-defaults.test.mjs` — **21/21 pass** (0220's battery; `9→10` fix).
  - `tests/knowledge-onboarding-promotion.test.mjs` — **13/13 pass** (0192's battery; `EXPECTED_MAP`/`EXPECTED_MAP_V2` fix).
- **Regression sweep** of every other db test file that calls a capture door
  (`capture_knowledge`/`capture_knowledge_for`/`promote_plan_answers_to_knowledge`/`correct_knowledge`),
  since the recut touches a function all of them share: `firm-setup.test.mjs`,
  `knowledge-legacy-readers-converge.test.mjs`, `knowledge-records.test.mjs`,
  `knowledge-retrieval.test.mjs`, `rig-docs-source-revision.test.mjs` — **96/96 pass**. Not
  required by the letter of the gate list (I added no NEW SQL function, only recut an existing
  one), but the recut's blast radius made this the responsible check.
- `operation-census.test.mjs` — **10/10 pass** (opcen.1's "no unwaived hard finding" included;
  the recut changes no grant and adds no call site, so this was a sanity check rather than an
  expected finding-source).
- `rig-isolation.test.mjs` — **22 pass / 1 skip** (T19, the documented destructive-flag skip; never
  run with reset flags, per RIG.md).
- `preintegration-gate-chain.test.mjs` — **5/5 pass**, confirming the new gate file is preloaded
  by `package.json` and dangles nothing.
- `pnpm typecheck` — **apps/web FAILS, packages/runtime passes.** The apps/web failure
  (`components/documents/document-kind-dialog.tsx(95,22): Cannot find name 'DOCUMENT_KINDS'`) is
  **pre-existing and unrelated**: verified with `git show 23cfad947:apps/web/components/documents/document-kind-dialog.tsx`
  — the same undefined reference is already present at the lane's base commit, before any change
  in this ticket, in a file this ticket never touches. Not fixed (db-only ticket; scope discipline).
- `pnpm lint` — **exit 0**, whole repo, including `packages/db`'s own `eslint .`. One documented
  Windows-only SKIP (`#756`, directory-symlink CA test — needs Developer Mode/elevation), not a
  fail.
  - One real, self-inflicted finding fixed along the way: `check-wiki-dynamic-sql.mjs` initially
    flagged the migration's own **tail** block (not the splice) as an unresolvable
    change-of-record patch. Root cause, confirmed by direct probing of `wiki-lint-checks.mjs`'s
    `parseCoRPatches`/`maskComments`: `--` comments **inside** a `do $tag$ … $tag$` body are not
    masked by this checker (dollar-quoted regions are skipped wholesale during masking), and my
    tail's own explanatory comment named the bare word "pg_get_functiondef" in prose (no call, no
    parens) while separately containing the string literal `'EXECUTE'` (a `has_function_privilege`
    argument) — together enough to misclassify the whole tail as a patch with an unresolvable
    target. Fixed by rewording the comment to avoid the trigger word; no
    `DYNAMIC_SQL_ALLOWLIST` entry was needed or added, because the tail was never patching
    anything. Re-verified with `node scripts/check-wiki-dynamic-sql.mjs` directly (OK, 1410
    functions / 213 patches scanned) and with the full `pnpm lint`.
- `apps/web` and `packages/runtime` were not touched; their unit suites and e2e walks were not run
  (work-order rule 8 conditions those on having touched those trees).

## Migration

`packages/db/migrations/0240_financial_year_end_day.sql` — new, exactly one file at the reserved
number.

- **Prestate pins** (measured live on `clara_l02` before any change in this ticket):
  - `clara.knowledge_keys` / `clara.knowledge_plan_item_map` / `clara.knowledge_key_firm_eligibility`
    all present.
  - `financial_year_end_month` shape: `(kind, value_shape, scope_default, authority_bearing, min_role)
    = ('assertion', 'number', 'client', false, 'bookkeeper')`.
  - `clara._knowledge_assert_value(text,jsonb)` `prosrc` sha256:
    `0b0ac71c31ad26ec86d5bb6b2ed4e7bdbabcdf1267692bc21a9d898575b92949` (pre-splice) — the prestate
    also accepts `84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5` (the exact
    post-splice value, measured after the first successful splice on this rig), which is what makes
    the file safe to redo unedited.
- **The change**: one catalogue row (`financial_year_end_day`, typed/scoped/floored by a `SELECT …
  FROM clara.knowledge_keys WHERE knowledge_key = 'financial_year_end_month'`, never re-typed), one
  map row (`fye_day → financial_year_end_day`), one function recut (`clara._knowledge_assert_value`
  gains a `range:day_1_31` arm). Both inserts are `WHERE NOT EXISTS`-guarded and the splice
  self-skips once applied — idempotent under `#957` redo, exercised for real (see above).
- **Tail assertions**: the new row's full shape; the map row's existence and uniqueness; the day
  key's continued absence from `clara.knowledge_key_firm_eligibility`; the firm-scope-refused
  census (10, not 9); the recut body's `range:day_1_31` marker exactly once, every prior label's
  arm at its own original count, `SECURITY DEFINER`/`search_path`/ACL byte-identical to prestate.
- **Redo used**: yes, twice, both on this lane's own unmerged file —
  `CLARA_MIGRATION_REDO=0240_financial_year_end_day` — once to add the splice after the first
  (catalogue+map-only) apply, once more after a comment-only edit to the tail (the lint fix above).
  Both recorded with their prestate/splice/tail notices captured in this session's tool output.
- **Gate-chain entry**: `tests/fye-day-preintegration-gate.mjs` (new; sets
  `CLARA_ALLOW_MISSING_FYE_DAY_0240=1`), wired into `packages/db/package.json`'s `test` script
  immediately after `legal-enforcement-mode-preintegration-gate.mjs` (migration order — 0240 is the
  newest). `preintegration-gate-chain.test.mjs` confirms both the preload and the file's existence.
- **Rig-meta cohort**: none added, deliberately. `packages/db/tests/rig-meta.mjs`'s cohorts
  attribute GRANTS (which functions exist and who may `EXECUTE` them) so `operation-census`'s
  completeness check can tell a half-applied migration from a real gap. This migration adds zero
  new functions and changes zero grants (the recut function was already, and remains,
  ungranted — already listed under `KNOWLEDGE_0192_UNGRANTED_FNS`). Adding an empty or vacuous
  cohort entry would document nothing; I recorded the reasoning here instead.

## Docs

- `packages/db/README.md`, "Knowledge scope, firm defaults and exceptions": the stale `13-key
  catalog … refuses nine` claim (pre-dating this ticket) is corrected to `14-key catalog …
  refuses ten`, naming `financial_year_end_day` beside the three keys already named there.
- `CONTEXT.md`: **no entry added, by design** — checked for precedent first.
  `financial_year_end_month` itself has no dedicated CONTEXT.md term (the existing Knowledge
  entries — "Knowledge pack", "Knowledge promotion", "Firm knowledge default", etc. — are
  mechanism-level concepts, never individual catalogue keys), so a parallel entry for the day key
  would be new house style, not consistency with it. Not added.
- `docs/PROGRESS.md`: not touched — this is the wave orchestrator's file, outside a single
  ticket's report per the addendum's rule 10.

## Successor contracts

None. No frozen chat or Work-tool body reads or writes `financial_year_end_day`; the runtime
knowledge pack (`clara.get_knowledge_pack`, read by `chatTurn_v19`/`v20` through
`packages/runtime/lib/knowledge.mjs`) already surfaces every live catalogue key generically and
needs no new call, no new zod input, and no new part kind for this ticket.

## Follow-ups worth filing

- The apps/web typecheck break (`document-kind-dialog.tsx`'s `DOCUMENT_KINDS` reference) is
  pre-existing on this lane's base commit and unrelated to #898 — worth a ticket of its own so it
  is not silently carried forward by every subsequent lane.
- `wiki-lint-checks.mjs`'s comment-masking gap (a `do $tag$…$tag$` body's own `--` comments are
  never masked, so a prose mention of `pg_get_functiondef` or the bare word `EXECUTE`-as-a-string
  can misclassify an unrelated block as a change-of-record patch) is a real, narrow false-positive
  source independent of this ticket. I worked around it by rewording one comment rather than
  touching shared lint infrastructure (out of my ticket's scope), but the checker itself could
  mask dollar-quoted interiors recursively — worth a ticket if this class of false positive recurs.

## Anything unverified

- A true from-scratch `0001→0240` migration chain on a disposable cluster — per RIG.md, that is
  the integrator's proof, not a lane's; I did not attempt a second from-scratch chain on this
  lane's already-once-migrated cluster.
- Whether any consumer OUTSIDE `packages/db` (a report generator, an export, a firm-facing UI) will
  eventually want to read `financial_year_end_day` from Knowledge — out of scope for #898 and not
  investigated; the ticket's own "Key interfaces" section does not name one.
