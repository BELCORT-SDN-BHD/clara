# Wave-4 pre-step: the shared standard-chart rows (#941, #942, #946, #949)

Branch `riders/w4-chart`, worktree `C:\Users\zhant\Desktop\clara-wt\int`, cut from `main` at
`46cf7c852`. Database `127.0.0.1:55748` / `clara_l08`, migrated 288 → 289 files. Head after this
work: `eca7e983db37a82f5fa4ab9434511b6b012801c8`.

Commits:
- `713624b76` — `feat(db): #941 wave-4 chart pre-step — 2030 Deferred Revenue, 1180 Accrued
  Income, Salaries Payable, Rent Payable (0295)` — the migration and its `packages/db/README.md`
  section.
- `eca7e983d` — `test(db): #941 wave-4 chart pre-step battery for 0295, and the v1 pin
  platformTemplate() needs now that v2 exists` — the test battery, its preintegration gate,
  the `package.json` gate-chain registration, and the one-line fix
  `coa-template-pr-a-helpers.mjs` needs now that a second `my_sme_starter` version exists.

## Seams (written before testing, per WORK-ORDER rule 4)

1. **The template read** — `clara.coa_template_accounts` (the same relation
   `clara.get_coa_template` / `clara.list_coa_templates` already read, RLS-gated to
   `clara_authenticated`): do the four rows exist, by code, name, type, family and flag.
2. **`clara.apply_coa_template` against an EXISTING template (v1)** — copy-not-reference,
   driven for real through `clara.create_client` + the onboarding commit door.
3. **`clara.apply_coa_template` against the CURRENT template (v2)** — the same doors, proving a
   new client gets the four rows.
4. **A cross-template read** over `clara.coa_template_accounts` joined to `clara.coa_templates`,
   scoped to `scope='platform'` — no code collision.

No test sits outside these four; no door, wall or table this migration does not touch was
exercised.

## Why a new template version, not an edit of v1 (the central finding)

Before writing the migration I measured, on this database, that a plain `INSERT` of a fifth
account against the live, **published** `my_sme_starter` v1 is refused:

```
CLR08 coa template af0d7c77-c19e-4ad0-8944-4751ce1e7cab is published, not a draft --
its families and accounts are frozen
```

from `t_coa_template_accounts_freeze` / `clara._tf_coa_template_child_freeze()`
(`packages/db/migrations/0150_coa_template_pr_a.sql:604-663`). This is not incidental — it is
0150's own D-2 promise ("a template edit cannot rewrite an applied chart") and the reason
`content_sha256` exists: a published template's rows, and the hash over them, never move again.
Bypassing the trigger to write into v1 directly would falsify that hash for every past reader and
would turn `coa-template-pr-a.test.mjs`'s C1/C2 ("the seed's structural invariants — 42 families /
142 accounts") into a description of a moving target instead of 0150's own fixed artifact.

`clara.coa_templates.version` and `uq_coa_templates_platform_version` exist for exactly this
case, so `0295_wave4_chart_rows.sql` mints `my_sme_starter` **v2**: an `INSERT ... SELECT` copy of
v1's 42 families and 142 accounts verbatim (the same shape `clara.fork_coa_template` itself uses),
the four new accounts appended, then published with the same raw
`UPDATE ... SET state='published', published_at=now(), content_sha256=...` 0150 used to publish
v1 — because `clara._coa_template_for_edit` refuses to edit ANY platform-scope template by name,
v1 or v2 alike. **v1 is never touched** — the migration issues no `UPDATE`, `DELETE` or `INSERT`
against its own rows anywhere, proven again in the tail (T.1) by re-measuring v1's counts and its
`content_sha256` against a pinned literal. This is why the whole existing `coa-template-pr-a` and
`coa-template-pr-b` batteries needed no edits beyond one precedent-matching line (below).

## The four rows, final codes and reasoning

| code | name | type | family | sort_ordinal | class/flags |
|---|---|---|---|---|---|
| `1180` | Accrued Income | asset | `trade_receivables` | 45 | none (not a control account) |
| `2030` | Deferred Revenue | liability | `trade_payables` | 40 | none |
| `2040` | Salaries Payable | liability | `trade_payables` | 50 | none ("an ordinary liability with no class", #946 AC1) |
| `2050` | Rent Payable | liability | `trade_payables` | 60 | none |

`2030` and `1180` are the owner rulings' own literals (read via
`gh issue view 941/942 --json body,comments`). `2040`/`2050` are this migration's choice: the
`trade_payables` family already runs `2000 Trade Payables Control · 2010 Other Payables ·
2020 Accruals`; the ruling on #949 explicitly forbids reusing 2010 and 2020 ("so each month's
unpaid rent is visible on its own, as #946 does for salaries"), so Salaries Payable and Rent
Payable continue the SAME family's contiguous 2000s run rather than landing in a disconnected
block — `2040`/`2050`, immediately after this file's own `2030`. The prestate measured the whole
`2031-2099` band empty on the live template before this migration chose inside it, and the tail
re-proves no other `scope='platform'` template carries any of the four codes (S4 / T.5).
`1180 Accrued Income` sits between `1130 Prepayments` (ordinal 40) and `1190 Allowance for
Doubtful Debts` (ordinal 50) in `trade_receivables` — the same "receivable-adjacent, not yet
billed" shelf those two already occupy, and the gap the template already carried between
`1170` (director/related-party) and `1190`.

None of the four is tax-sensitive, carries an add-back class, a statutory tag or a control-account
class/special marker — the same shape `1110 Other Receivables`, `1120 Deposits Paid`,
`1130 Prepayments`, `2010 Other Payables` and `2020 Accruals` already carry (mirrored, not
invented).

## Acceptance points, with evidence

**(1) Red → green, the four rows present/absent.** `wave4-chart-rows.test.mjs` S1: reads
`clara.coa_template_accounts` for v1 (finds none of the four — 0150's frozen seed, forever) and
for the current published template (finds all four, exact code/name/type/family/ordinal/flags).
Result: `ok 1` (`node --test`, full gate chain). Vacuity control: `2030` deleted off v2 inside a
`withRolledBackTx` block (trigger disabled for exactly that statement) — the same read then finds
three, not four — then rolled back.

**(2) An existing client's chart is not touched.** How a client's chart is derived, from the
code: `clara.apply_coa_template` (`packages/db/migrations/0156_coa_apply_template.sql`) **copies**
rows out of whichever `template_id` the caller names into `clara.coa_accounts`, once, at apply
time (its own header calls this "copy-not-reference"). No door anywhere in the estate re-syncs an
already-planted chart against its template afterward — grepped
(`publish.*existing client|sync.*coa_accounts.*template|backfill.*coa_accounts` across
`packages/db`, `packages/runtime`, `apps/web`): no hits. None of the four rulings asks for such a
mechanism, so none is invented. `wave4-chart-rows.test.mjs` S2: a client is born through
`clara.create_client` + the real onboarding-commit door (`newInterviewClient`), `v1` is applied
through `clara.apply_coa_template` for real, and the planted chart carries none of the four codes
(while `2010 Other Payables` — a v1-native row — plants normally, ruling out "the chart is simply
empty"). Result: `ok 2`. Vacuity control: one of the four codes planted onto that same client's
chart by hand (fixture surgery, rolled back) — the read then finds it.

**(3) A new client gets the four rows.**

_Restated after the two-axis review (finding S4), and widened by the orchestrator's ruling of
2026-09-24 on finding S2 (recorded on #941, under the owner's standing delegation)._ What S3
proves is the DATABASE door: `apply_coa_template` against v2 plants all four rows through the real
client-birth (`clara.create_client` + the onboarding commit) and apply doors, with the right name,
type, and `account_class = null` (not a control account). Result: `ok 3`. Vacuity control: the
client's own `2040` row deleted (rolled back) — the read then finds it absent. The
`... order by version desc limit 1` rule the cell uses to find "the current template" is
`dba-coding-lane-classification.test.mjs`'s own test convention; it was NOT a rule the product
implemented anywhere, so the original wording of this point claimed more than the cell showed.

The PRODUCT half is what the S2 ruling added, and it is now in the migration: **v1 is retired.**
Two published starters carried the identical title, `clara.list_coa_templates` orders by version
ascending so v1 rendered above v2, nothing preselected either and nothing marked one as current —
so a bookkeeper could pick the 142-account option and get a client with none of the four rows.
`update ... set state='retired', retired_at=now()` (the one transition
`clara._tf_coa_template_freeze` admits out of `published`) removes v1 from
`listPublishedCoaTemplates` without moving a row of it. `wave4-chart-rows.test.mjs` S6 drives
`clara.list_coa_templates()` through a REAL firm session and sees exactly one published
`my_sme_starter` row — version 2, 146 accounts — with v1 retired, unmoved at 42/142 and still
carrying 0150's own content hash.

The other half of the same ruling is finding S1: v2 now also carries 0156's two society entity
overrides, which the first cut omitted. See
`reports/wave4-prestep-chart-fix.md` for every finding, its fix and its evidence.

**(4) No code collision across every template the estate ships.** S4: `count(*)` per code across
every `scope='platform'` row in `clara.coa_template_accounts` equals exactly 1 for each of the
four. Result: `ok 4`. Vacuity control: a second `scope='platform'` template minted with a
colliding `2030` (triggers disabled only for that probe row, rolled back) — the same read then
finds two.

Focused run, no gate preloaded (`node --test --test-concurrency=1 $GATES
tests/wave4-chart-rows.test.mjs`): **4 pass, 0 fail, 0 skip.**

## Prestate pins (measured on `clara_l08`, MEASURED not transcribed)

- `clara._coa_template_content_sha256(uuid)` — `d120669e12506c1a347729008e3f11785d62c914c3955f3dd6a099fd9b20baa7`
- `clara._tf_coa_template_freeze()` — `0fced8e2c635e5bdb306b6836b208cbae44a669f6f6549e3113017c8441d1844`
- `clara._tf_coa_template_child_freeze()` — `504d9c613739d30c21c100d3c8c8b8dbc525ff2adeda888d554bbec0309f0ec5`
- v1's own `content_sha256` — `d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df`
  (pinned as a literal in both the prestate and the tail; re-verified unchanged after the seed).
- v1's row counts — 42 families / 142 accounts (re-verified unchanged after the seed, tail T.1).

None of the three functions is recut by this file; they are called (the hash helper) or relied
upon (the two freeze triggers, for the draft → published dance and the redo teardown) without
being changed, per the house's own "pin a function you call but don't recut" convention.

## First-apply and redo

First apply proven for real, not simulated: `pnpm --filter @clara/db migrate` against
`clara_l08` (fresh from 288 files) produced —

```
0295 prestate: clean (FIRST apply) -- my_sme_starter v1 (af0d7c77-...) is published,
  unmoved at 42 families / 142 accounts, ... carries none of 1180/2030/2040/2050 ...
0295 seed: my_sme_starter v2 (c1a037c0-df06-4f05-9050-b03c6d4eb035) PUBLISHED --
  42 families / 146 accounts ...
0295 tail OK: ... v2 (...) is PUBLISHED, migration-authored, forked_from v1, at
  42 families / 146 accounts with the four new rows exactly as specified, no code
  collision ..., all three freeze triggers armed, and v2 itself now refuses a sixth
  account exactly as v1 does.
applied 0295_wave4_chart_rows
```

The migration file was not edited after this apply, so `CLARA_MIGRATION_REDO=0295_wave4_chart_rows`
was not exercised for real this round — the redo branch (tear down and rebuild v2, freeze
triggers disabled for exactly those statements and re-enabled in the same transaction, precedent
0227:346-348) exists in the prestate and is proven by code review and by the tail's own T.8 check
(all three freeze triggers armed, `tgenabled='O'`, regardless of which branch ran), but was not
driven end to end because no second edit of the file was needed.

## Gates, with counts

- `wave4-chart-rows.test.mjs`, full gate chain (`$GATES` = the exact `--import` list in
  `packages/db/package.json`'s `test` script, now including
  `wave4-chart-rows-preintegration-gate.mjs`): **4/4 pass**, 0 skip, focused (no gate preloaded).
- `operation-census.test.mjs`: **10/10 pass** (this migration mints no function, so the census is
  unaffected; run as the required gate anyway).
- `rig-isolation.test.mjs`, never with reset flags: **22/22 pass, 1 skip** (T19, the documented
  destructive cell that requires `CLARA_RIG_ALLOW_RESET`, never set here).
- The chart template's own existing test files:
  - `coa-template-pr-a.test.mjs`: **53/53 pass** (proves the `platformTemplate()` fix is
    transparent to every existing cell, including C1's `platform.version === 1`).
  - `coa-template-pr-b.test.mjs`: **43/43 pass** (proves the sibling `platformStarter()`
    convention — already pinned to `version = 1` — needed no change at all).
  - `dba-coding-lane-classification.test.mjs` (extra verification, not required but directly
    exercises `apply_coa_template` against "whichever template is live"): **15/15 pass**.
- `pnpm typecheck` (repo root): `apps/web` fails on a pre-existing, unrelated gap —
  `components/ui/message-scroller.tsx(9,8): error TS2307: Cannot find module
  '@shadcn/react/message-scroller'` — traced to commit `b5462ab36` (already on `main` before this
  branch was cut) and to a missing `node_modules/@shadcn` install; `git status` confirms nothing
  under `apps/web` was touched by this work. `packages/runtime` typechecks clean.
  `packages/db` carries no TypeScript build gate by design (its own README: "plain ESM ...
  no TypeScript build gate"), so this migration's own surface has nothing for `tsc` to check.
  Reported as a known, pre-existing red, not fixed (out of this pre-step's scope, and not a
  `packages/db` concern).
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it): **exit 0**, every
  workspace including `packages/db` ("packages/db lint: Done").

## Docs

- `packages/db/README.md` gained the `## 0295 —` section (codes, the new-version reasoning, the
  copy-not-reference argument for existing clients, the redo note, the cells).
- `CONTEXT.md`: checked, not touched. "Deferred Revenue", "Accrued Income", "Salaries Payable"
  and "Rent Payable" are ordinary accounting line-item nouns, exactly like the estate's existing
  "Other Payables", "Accruals", "Trade Receivables Control" (none of which has its own CONTEXT.md
  glossary entry — confirmed by grep: no such headings exist for any sibling account name today).
  They are not new PRODUCT vocabulary this migration introduces, so no entry was added.

## Anything unverified

- The `CLARA_MIGRATION_REDO` path was not driven for real (see "First-apply and redo" above) —
  only because no second edit of the migration file was needed this round, not because the path
  is unproven by construction.
- ~~`apps/web`'s picker will show two published `my_sme_starter` rows~~ — RESOLVED, not left open.
  The two-axis review raised this as finding S2 (major) rather than a cosmetic question, and the
  orchestrator ruled on 2026-09-24 (recorded on #941, under the owner's standing delegation) that
  v1 is retired in this same migration. The picker now offers one starter, proven by
  `wave4-chart-rows.test.mjs` S6 driving the read through a real firm session.
