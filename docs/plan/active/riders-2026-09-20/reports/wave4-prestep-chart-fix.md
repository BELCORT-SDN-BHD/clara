# Wave-4 pre-step (0295) — review fix

Branch `riders/w4-chart`, base `46cf7c852`. Head before the fix `eca7e983d`; head after, see the
commit list below. Lane database `127.0.0.1:55748/clara_l08`, 289 files.

Two review reports were worked: `wave4-prestep-chart-review-spec.json` (verdict `fix-needed`, six
findings) and `wave4-prestep-chart-review-standards.json` (verdict `pass`, one nit). Every finding
above nit is fixed; the nits are answered below rather than silently dropped.

## Commits

| commit | what |
|---|---|
| `a83e061bb` | S1 + S3: the society entity overrides are carried onto v2, the redo drops them first |
| `c4f8ac9ba` | S2: v1 is retired, and everything the retirement costs |
| (this commit) | S4: the implementer's report restated; this report; the two review JSONs |

## S1 (blocker) — v2 did not carry `clara.coa_template_entity_overrides`

**Reproduced how.** The new cell `wave4-chart-rows.test.mjs` S5 was written first and run against
the unfixed head. It failed on its first assertion, the override census: v1 carried two rows
(`society/3040` suppressed, `society/3900` → `Accumulated Fund`) and v2 carried none. The review's
own read of `clara._coa_effective_account_name` is confirmed by the cell's behavioural half: a
society client driven through `newInterviewClient` + `clara.apply_coa_template` against v2 was
planted `3900 Retained Earnings` and a live `3040`.

**Fixed how.** `0295` now copies the tier with the same `INSERT ... SELECT` shape the families and
the accounts use, after the accounts insert (the composite `fk_coa_override_account` references
`coa_template_accounts(template_id, account_code)`), carrying `basis` verbatim with each row. The
tier does not enter `clara._coa_template_content_sha256` — that helper hashes the families' and the
accounts' content only — so v2's published hash is unchanged at
`6a36ad00be8c20c231740f89f4308729b0b540c1c2ca8fe2878c979696b7b4ef`, measured before and after.

Tail `T.10` proves v2's census **equals** v1's row for row: a symmetric `except` in both directions
over `(entity_type, account_code, override_name, suppress, basis)`, plus the count. A count alone
would not catch a row that travelled with the wrong name, the wrong flag or a lost basis.

**The cells.** `wave4-chart-rows.test.mjs` S5 asserts the census equality by direct read, then
drives a SOCIETY client (`newInterviewClient` with `{entity_type:'society'}`) through
`clara.apply_coa_template` against the current template and asserts `3900` is planted as
`Accumulated Fund` with its `retained_earnings` marker intact and `3040` is absent — the mirror of
`coa-template-pr-b.test.mjs` §5.1 on v2. Its vacuity control deletes the current template's own
`society/3900` relabel inside a rolled-back transaction, applies to a second society client on that
connection, and sees `Retained Earnings` come back.

**The assertion that masked it.** `coa-template-pr-b.test.mjs:952` asserted a GLOBAL
`count(*) = 2` on `clara.coa_template_entity_overrides`, which a version carrying none satisfies
exactly. It is now a per-template count, and §5.2's two mutant deletes are scoped to the starter's
template so the restore check is the exact inverse of the mutation. Run against the unfixed pr-b
first: 42/43 with §5.2 red on that line, which is the vacuity proof for the change.

## S2 (major) — the picker offered two identically-titled starters

Ruled by the orchestrator on 2026-09-24 under the owner's standing delegation, recorded on #941:
**v1 is retired in the same migration.**

**Reproduced how.** `wave4-chart-rows.test.mjs` S6 drives `clara.list_coa_templates()` through a
real firm session (the read `apps/web`'s `listPublishedCoaTemplates` makes) and filters on
`state === 'published'` exactly as `apps/web/lib/onboarding/coa.ts:137-149` does. Against the
unfixed head it failed with `saw ["v1/published","v2/published"]`.

**Fixed how.** After minting and publishing v2, `0295` issues
`update clara.coa_templates set state='retired', retired_at=now() where id = v1_id and
state='published'`. The freeze trigger stays **armed** for that statement: `published → retired` is
the one transition `clara._tf_coa_template_freeze` admits out of `published` (0150:624-630), so
letting it run is the proof that this is that transition and not a disguised edit.

**The redo, designed around immutability.** A retired template is immutable, so the redo branch
cannot put v1 back and must not try. The prestate now decides FIRST vs REDO from v2's presence
**before** it judges v1's state, admits v1 `published` **or** `retired` on the redo branch and only
`published` (with 42 families / 142 accounts and its pinned hash) on a first apply; the retirement
UPDATE is conditional, so it matches zero rows on a redo and raises nothing. Both branches were
driven for real — see "The redo runs" below.

**Tail.** `T.1` asserts v1 is `retired` with `retired_at` set and otherwise unmoved: 42/142, the
pinned `content_sha256` literal `d02a786a…f67df`, and that the stored hash still reproduces from its
own rows. `T.6` asserts the two platform rows read exactly `v1/retired, v2/published`. The tail
asserts against the base relation rather than `clara.list_coa_templates()`, which is an INVOKER read
whose answer depends on the caller's RLS context; S6 drives the function through a real firm session
instead, which is the stronger proof and the one the picker actually makes.

### What the retirement costs — the ripple the ruling did not anticipate, measured

Two doors refuse a template that is not published, and both are driven against the platform starter
by existing batteries:

- `clara.apply_coa_template` rung 4 — `0156:768`, `template_not_published`.
- `clara.fork_coa_template` — `0150:869-872`, `source_not_published`.

Measured, not predicted: with v1 retired and no test change, `coa-template-pr-a.test.mjs` went
**0/53** (its `before` hook forks the starter twice) and `coa-template-pr-b.test.mjs` went
**14/43**. The fix:

- **`coa-template-pr-b-helpers.mjs`'s `platformStarter()`** now reads the highest **published**
  version. Every expectation in that battery already comes from the template itself
  (`expectedChartMap` calls `clara._coa_effective_account_name(a.template_id, …)`, `coreFamilies`
  reads the families live), so the battery follows the shipped starter. 43/43 with no other change
  beyond the §5.2 census fix above.
- **`coa-template-pr-a.test.mjs` keeps `platform` pinned to v1.** It must: `J4` compares the
  template to the two research dossiers field by field and asserts the only accounts beyond them are
  exactly `["3050","6900"]`, which four new rows would break. A new
  `publishedPlatformStarter()` handle (`forkSource`) feeds its **twelve** fork sites. Four cells
  moved with it: `C1` (v1's state is now `retired`, and the cell was retitled), `H3` (the document
  read's state), and `E1`/`G1`, whose fork-result counts and content hash now come from the
  **source's** own measured counts and hash instead of the literals `142` and v1's hash — so they
  stop needing an edit each time the published starter gains a row. 53/53.
- **`dba-coding-lane-classification.test.mjs`** already reads
  `... where state='published' order by version desc limit 1` and needed no change. 15/15.

### What I checked for the retirement, and found clean

- **Every migration between 0150 and 0294 that reads `my_sme_starter`:** `grep` over
  `packages/db/migrations` returns `0156_coa_apply_template.sql` and nothing else. 0156 asserts v1
  published in its own prestate (`0156:283-297`) and runs long before 0295 in the ladder, so the
  from-scratch chain in order is safe by construction — and was then proven empirically (below).
- **Every migration after 0156 touching the coa-template tables at all:** `0170`, `0173`, `0194`.
  `0170` and `0194` name `coa_template_adoptions` / `coa_template_accounts` in a read and a comment;
  `0173` recuts `apply_coa_template` and its only state test (`t.state <> 'published'`) is the
  door's own runtime rung, not a migration-time assertion about the platform starter. None is
  affected.
- **`state` assertions in the chart batteries and their helpers:** the full list is the four cells
  named above. No helper asserts a state.
- **`apps/web` and `packages/runtime`:** `listPublishedCoaTemplates`
  (`apps/web/lib/onboarding/coa.ts:137-149`) filters on `state === 'published'` and nothing else, so
  it simply stops offering v1. The two `list_coa_templates` fixtures —
  `onboarding-amend-and-chart.test.tsx:248-254` and `e2e/agentic-finish-mock.mjs:336-345` — each
  model a **one-row** published list, which is what the estate now ships again. No cell asserts the
  version those rows carry, so neither fixture was changed (this is the S5 nit, and its own stated
  condition for "no change needed" holds). Nothing in `packages/runtime` names a coa template.

## S3 (minor) — the redo branch did not tear down the override rows

Fixed in the same commit as S1: `delete from clara.coa_template_entity_overrides where template_id =
v2_id` is now the **first** delete in the redo branch, before the accounts delete. The override
table carries no freeze trigger of its own (only `t_..._no_truncate`), so a plain delete is all it
needs. Without it the very next redo would have hit `fk_coa_override_account` with a bare 23503.

## S4 (minor) — the implementer's report overstated acceptance point (3)

Restated in `reports/wave4-prestep-chart.md`. Acceptance point (3) now says what S3 proves — the
**database** door: `apply_coa_template` against v2 plants all four rows through the real
client-birth and apply doors — and names the `order by version desc limit 1` rule as the test
convention it is, not a rule the product implements. The **product** half is then given as what the
#941 ruling added: v1 retired, proven by S6 driving the read through a real firm session. The
override copy is named there too, with a pointer to this report. The "Anything unverified" entry
about the two-row picker is struck through and marked resolved rather than deleted, so the record
shows it was raised and answered.

## Standards nit T1 — vacuity controls inside the positive cells

**Left as is, deliberately.** Splitting each control into its own `MUTANT`-titled cell is not the
small mechanical change the nit supposes: each control depends on a fixture the positive cell built
(a specific client, a specific applied chart), so a separate cell would have to rebuild it, and the
control would stop being a mutation *of the fact the cell just asserted*.

The nit's own stated remedy is already satisfied: every control carries a `// VACUITY CONTROL:`
banner and every control's assertion message begins `MUTANT:`, so a sweep finds all of them —
`grep -c MUTANT` returns 7 and `grep -c "VACUITY CONTROL"` returns 6 in this file (seven controls,
one of which lives inside S2's single rolled-back transaction alongside its positive read).

## S6 (nit) — 0150's own S8 asserts exactly one `coa_templates` row

Not acted on, as the review itself proposed: it is out of this pre-step's scope, order-protected in
a normal ladder, and already unreachable on any rig. Recorded here so a future 0150 redo does not
blame 0295. **Note it is now doubly unreachable:** 0150's S8 also predates the firm-scope test
templates every rig carries.

## The migration's notices

**FIRST apply**, from the from-scratch chain (below):

```
0295 prestate: clean (FIRST apply) -- my_sme_starter v1 (a99138c1-…) is published, unmoved at 42
  families / 142 accounts, hash d02a786a…f67df, carries none of 1180/2030/2040/2050, and the three
  functions this file depends on are at their pinned bodies.
0295 seed: my_sme_starter v2 (76969ef8-…) PUBLISHED -- 42 families / 146 accounts (142 carried over
  from v1 verbatim, 4 new: 1180 Accrued Income, 2030 Deferred Revenue, 2040 Salaries Payable, 2050
  Rent Payable) and 2 entity override row(s) carried forward from v1, content_sha256 6a36ad00…b4ef;
  my_sme_starter v1 RETIRED (its rows untouched), so the published platform starter is now v2 alone.
0295 tail OK: my_sme_starter v1 (a99138c1-…) is RETIRED with its retire stamp and otherwise unmoved
  at 42/142, hash d02a786a…f67df, so every existing adopter still reads exactly what they adopted and
  the picker now offers ONE starter; v2 (76969ef8-…) is PUBLISHED, migration-authored, forked_from
  v1, at 42 families / 146 accounts with the four new rows exactly as specified, no code collision
  across the estate's templates, the five special markers intact, 0156's two society entity overrides
  carried forward row for row so a society client adopting v2 still gets 3900 as `Accumulated Fund`
  and no 3040, all three freeze triggers armed, and v2 itself now refuses a sixth account exactly as
  v1 does.
```

**REDO**, on `clara_l08` (the last of four):

```
0295 prestate: my_sme_starter v2 (11277cb6-…) already exists -- treating this as a #957 REDO of 0295
  itself; its rows will be rebuilt from scratch.
0295 prestate: clean (REDO apply) -- my_sme_starter v1 (af0d7c77-…) is retired, unmoved at 42
  families / 142 accounts, hash d02a786a…f67df, …
0295 seed: my_sme_starter v2 (4d5c3644-…) PUBLISHED -- … and 2 entity override row(s) carried forward
  from v1, content_sha256 6a36ad00…b4ef; my_sme_starter v1 was already retired (its rows untouched),
  so the published platform starter is now v2 alone.
0295 tail OK: … (as above)
```

The redo branch's own two paths for v1 were both exercised: the first redos found v1 `published`
(before the retirement landed) and the last found it `retired`, with the conditional UPDATE a no-op.
`content_sha256` for v2 is `6a36ad00be8c20c231740f89f4308729b0b540c1c2ca8fe2878c979696b7b4ef` on
**every** run, first apply and all four redos — the surrogate uuid and the timestamps are the only
things that differ, and nothing pins those.

## The redo runs

`CLARA_MIGRATION_REDO=0295_wave4_chart_rows pnpm --filter @clara/db migrate`, on
`127.0.0.1:55748/clara_l08` with `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`. Four, plus two refused
attempts that are findings in their own right:

| # | after | result |
|---|---|---|
| 0 | the S1 fix | **REFUSED**: `my_sme_starter v2 … already has a client adoption` |
| 1 | clearing the rig's adoptions | ok — first proof of the override copy |
| 2 | the header stanza | ok |
| 3 | the retirement | ok — v1 `published` → `retired` on the redo branch |
| 4 | the battery header | **REFUSED**: bare 23503 on `fk_coa_templates_forked_from` |
| 5 | clearing the rig's fork subtree | ok — v1 found already `retired` |

**Two redo-branch findings, both fixed in the migration, both worth the integrator's attention:**

1. **The refusal on adoptions is correct but its comment was wrong.** 0295 said "it should not [have
   an adoption] — this branch exists for an unmerged lane fixing its own mistake". On a lane
   database that premise is false: `wave4-chart-rows.test.mjs` S3/S5 and
   `dba-coding-lane-classification.test.mjs` all plant **real** adoptions of the current published
   template, so after any battery run the migration cannot be redone until the rig's own adoption
   rows are deleted. The refusal is kept (it is the right wall for real client data) and its message
   now names the situation and the remedy.
2. **Retiring v1 moved every new fork onto v2**, so `fk_coa_templates_forked_from` now blocks the
   redo's `delete from clara.coa_templates` with a bare 23503 naming nothing. The redo branch now
   refuses **by name** first, counting the templates forked off v2 and saying why — "a named
   prestate failure beats a bare 23503", 0156's own words.

**Rig surgery performed, recorded.** Before redos 1 and 5, on `clara_l08` only: the
`coa_template_adoptions` rows naming v2 whose client is a rig fixture (`rig\_%` or `DB-A %`), and the
whole `scope='firm'` fork subtree under v2 (a recursive CTE over `forked_from`, every row a
`rig_*` test template), with the three freeze triggers disabled for exactly those deletes. No
platform row and no non-rig row was touched.

## The from-scratch chain

**First attempt, on the lane cluster, stopped at 0154** — the documented #867 cluster-reuse hazard,
not a 0295 defect:

```
migrate: FAIL — migration 0154_binding_proposal_pr_1 failed and was rolled back: binding proposal
pr-1 tail: the clara role count moved from 14 to 18 -- this file mints no role and owes no
roles-bootstrap twin
```

`packages/db/README.md`, "From-scratch reapply on a reused cluster (#867)", documents exactly this,
and its remedy (`scripts/role-census-reset.mjs`) requires that nothing else on the cluster still
depends on the four extra roles — `clara_l08` does, so it was **not** run. The throwaway database
was dropped; the cluster is back to one database and 18 `clara%` roles, exactly as found.

**Second attempt, on a genuinely fresh cluster: PASSED.** A disposable PostgreSQL 17 cluster was
created in WSL (`pg_createcluster 17 w4fresh -p 55799`), a virgin database `clara_w4fresh` migrated
from scratch through `/opt/node/bin/node scripts/migrate.mjs`:

```
migrate: 289 new migration(s) applied · 289 total · target 127.0.0.1:55799/clara_w4fresh
```

End state, read back:

| version | state | families | accounts | overrides | content_sha256 |
|---|---|---|---|---|---|
| 1 | retired (`retired_at` set) | 42 | 142 | 2 | `d02a786a…f67df` |
| 2 | published | 42 | 146 | 2 | `6a36ad00…b4ef` |

That is the whole chain **in order**, with 0295 on its FIRST-apply branch, and both hashes identical
to the lane database's. The cluster was dropped afterwards (`pg_dropcluster 17 w4fresh --stop`).

## Prestate pins — re-measured, none moved

| pinned body | sha256(prosrc) | header literal |
|---|---|---|
| `clara._coa_template_content_sha256(uuid)` | `d120669e12506c1a347729008e3f11785d62c914c3955f3dd6a099fd9b20baa7` | matches |
| `clara._tf_coa_template_freeze()` | `0fced8e2c635e5bdb306b6836b208cbae44a669f6f6549e3113017c8441d1844` | matches |
| `clara._tf_coa_template_child_freeze()` | `504d9c613739d30c21c100d3c8c8b8dbc525ff2adeda888d554bbec0309f0ec5` | matches |
| v1's own `content_sha256` | `d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df` | matches (prestate and tail) |

None of the three bodies is recut by this fix, and v1's content hash still reproduces from its own
rows after the retirement (`content_sha256 = clara._coa_template_content_sha256(id)` → true for both
versions).

## Gates, with counts

Lane database `127.0.0.1:55748/clara_l08`, `PGHOST/PGPORT/PGUSER/PGDATABASE` +
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, run as
`node --test --test-concurrency=1 $GATES tests/<file>` where `$GATES` is the exact `--import` list
from `packages/db/package.json`'s `test` script. Never with a reset flag.

| file | tests | pass | fail | skipped |
|---|---|---|---|---|
| `wave4-chart-rows.test.mjs` | 6 | 6 | 0 | 0 |
| `coa-template-pr-a.test.mjs` | 53 | 53 | 0 | 0 |
| `coa-template-pr-b.test.mjs` | 43 | 43 | 0 | 0 |
| `dba-coding-lane-classification.test.mjs` | 15 | 15 | 0 | 0 |
| `operation-census.test.mjs` | 10 | 10 | 0 | 0 |
| `rig-isolation.test.mjs` | 23 | 22 | 0 | 1 |

`rig-isolation`'s one skip is `T19 poison-role`, which self-skips without `CLARA_RIG_ALLOW_RESET`
— a flag the work order forbids.

`CI=true GITHUB_ACTIONS=true pnpm lint` at the worktree root: **exit 0**, every workspace.

## Docs updated, in the same commits

- `packages/db/README.md`, the 0295 section: a new "A new version carries FOUR tiers, not two"
  paragraph for the override copy; the "why a new version" paragraph corrected (v1's *content* is
  untouched, not v1 itself); a new "v1 is RETIRED" paragraph with the ruling and the mechanism; a new
  "What retiring v1 costs, measured" paragraph naming every test that moved and every consumer
  checked; the Redo section rewritten for the four-tier teardown, the two-state prestate, the
  determinism measurement and the two lane-database refusals; the Cells list extended to six seams.
- `0295_wave4_chart_rows.sql`'s header: a stanza on the third child tier, a stanza on the
  retirement ruling, and a stanza on what the retirement costs. The old claim that "v1 stays
  published forever and both batteries need no edit" is gone — it was false the moment the ruling
  landed.
- `reports/wave4-prestep-chart.md`: acceptance point (3) restated (S4).

## Anything unverified

- **`pnpm typecheck` was not run.** No TypeScript changed in this fix (the diff is one SQL migration,
  four `.mjs` test files, two Markdown files). Lint, which the work order names for the runner, is
  green.
- **No web unit or e2e run.** `apps/web` is untouched. The two `list_coa_templates` fixtures were
  read and judged still accurate (each models a one-row published list, which is what the estate now
  ships); that is a reading, not a run.
- **The from-scratch proof used a WSL-side cluster and WSL-side node** (`/opt/node/bin/node` against
  `/mnt/c/...`), because the lane cluster cannot host a second chain (#867) and the new cluster's
  port did not forward to the Windows host. Git was never run from WSL.
- **`clara_l08`'s data is not what it was.** Beyond the rig surgery recorded above, four redos
  re-minted v2 with a new uuid each time, so any rig client that had adopted v2 before a redo now has
  a chart whose adoption row was deleted. Every affected row belongs to a throwaway test fixture.
- **The hosted database is untouched.** Nothing in this fix was run anywhere but the lane database
  and the disposable cluster.
