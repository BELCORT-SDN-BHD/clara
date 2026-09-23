# Wave 3, lane 08 — two-axis `/code-review` fix round

Branch `riders/w3-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, database
`clara_l08 @ 127.0.0.1:55748`. Base `ffe63a0dd084e99b84c1368119845be273c421ce`.

- **Head before this round:** `4d9a5062b`
- **Head after this round:** `7fbb0beee`
- **Two new commits**, one per finding that needed code:
  - `ac092a422` `fix(db): #857 0290 applies on a fresh database, not only a populated one`
  - `7fbb0beee` `fix(web): #1019 the README's count no longer contradicts the table below it`

Reviews read: `wave3-lane08-codereview-spec.json` (5 findings, one blocker) and
`wave3-lane08-codereview-standards.json` (2 findings). Every finding was reproduced before it was
fixed or refuted. Nothing was accepted on the reviewer's word and nothing was dismissed without a
re-run.

## Verdict per finding

| id | severity | verdict | where the fix landed |
|---|---|---|---|
| SPEC-L08-01 | blocker | **FIXED** | `packages/db/migrations/0290_document_regions_field_path_check.sql`, `packages/db/README.md` (`ac092a422`) |
| SPEC-L08-02 | major | **CONFIRMED, fixed as reported** — #990 is now PARTIAL, with the visible outcome stated | `reports/wave3-lane08-ticket990.md` |
| SPEC-L08-03 | major | **FIXED** | `apps/web/e2e/README.md`, `apps/web/e2e/spec-discovery.test.ts` (`7fbb0beee`) |
| SPEC-L08-04 | minor | **RECORDED, deliberately not changed** (and the ticket's own description of the symptom corrected) | `reports/wave3-lane08-ticket1020.md` |
| SPEC-L08-05 | note | no action required, as the reviewer says | — |
| SR-1 | major | **CONFIRMED, corrected** — 269, not 291 | `reports/wave3-lane08-ticket990.md` |
| SR-2 | major | **CONFIRMED, corrected** — 22 pass / 1 skip / 23 total, not 32 | `reports/wave3-lane08-ticket990.md` |

---

## SPEC-L08-01 (blocker) — 0290 could not apply on any fresh database

### Reproduced first

On a disposable template clone of `clara_l08` (`create database … template clara_l08`), with
`ck_document_regions_field_path_grammar` and `clara._field_path_conforms` dropped, `entry_evidence`
and `document_regions` emptied and 0290's ledger row removed, the file was executed verbatim:

```
PRE-STATE: {"regions":0,"fn_absent":true}
RESULT: REFUSED - sqlstate CLR10 | drfp prestate: clara.document_regions holds ZERO rows …
```

Zero rows is the state of every fresh database the chain actually meets:
`.github/actions/db-estate-suite/action.yml`'s first step (deploy main's chain, then HEAD's, onto a
throwaway `clara_ci`) runs BEFORE the seed step; `.github/actions/frontier-leg/action.yml` migrates
a fresh service database; and the integrator's from-scratch chain runs on a disposable cluster. The
migration was unappliable on all three.

### Fixed in two slices, each with its own red

**Slice 1 — the prestate.** The zero-row `raise exception` became clause (e), a `raise notice` that
reports the count. This is the shape 0291, the same lane's own sibling, already uses
(`clara.bank_statement_lines holds % row(s) …`). The bad-path census refusal — clause (d)'s `v_bad`
arm, which names every stored `field_path` the new CHECK would reject — is untouched and still
aborts the cutover; that one is load-bearing and correct.

Re-run against the empty clone: the prestate passed, and the **tail** then refused —
`drfp tail: clara.document_regions is unexpectedly empty for the live probes`. That is slice 2's
red, and it is why fixing only the prestate would have been a half fix.

**Slice 2 — the tail's live probes.** They now branch on whether a row exists to borrow:

- **POPULATED** — unchanged. Three rolled-back probes driving a RAW `insert` through an existing
  extraction, which is exactly the writer AC2 exists to wall.
- **EMPTY** — there is no FK-satisfiable `(firm_id, extraction_id)` pair and this file mints none,
  so the same three claims are proved one level down: by evaluating `clara._field_path_conforms`,
  which is *literally* what the installed `CHECK (clara._field_path_conforms(field_path))` calls per
  row, and whose exact constraint text the tail already asserts a few lines above. The pairing is
  the whole argument — the constraint assertion proves the table calls this expression, these probes
  prove the expression refuses. The raw-insert proof is not lost, only deferred to the first
  database that has a row, including this ticket's own battery.

The closing notice now names which branch ran (`PROBE MODE: …`) rather than claiming raw inserts it
may not have driven — the wave-3 addendum's own rule that a door's behaviour is asserted only after
it was driven.

### All four apply states, measured

Each on a disposable template clone created and dropped by this run.

| state | pre-state | result |
|---|---|---|
| first apply, EMPTY table | `regions 0, fn absent, ck absent` | **APPLIED CLEAN**; `pg_get_constraintdef` reads `CHECK (clara._field_path_conforms(field_path))` |
| first apply, POPULATED table | `regions 316, fn absent, ck absent` | **APPLIED CLEAN** |
| redo (#957) | `regions 316, fn present, ck present` | **APPLIED CLEAN** |
| HALF-applied | `regions 316, fn present, ck ABSENT` | **still REFUSED** — `CLR10 … HALF-APPLIED` |

The half-applied guard is intact: the fix widens what is lawful by exactly one state (zero rows) and
narrows nothing.

### Vacuity control on the new EMPTY branch

A scratchpad copy of the file whose sibling body was cut down to `return true` (the
`perform clara._assert_field_path(p_path)` removed) was applied to an empty clone and was REFUSED:

```
RESULT: REFUSED - sqlstate CLR10 | drfp tail: clara._field_path_conforms accepted an
unregistered-namespace path (evil.total) -- the expression this CHECK installs does not refuse
```

The broken copy lived only in the session scratchpad; the committed file was never edited for it.

### Re-applied on `clara_l08` through the supported redo path

#957's redo takes the **highest applied version only**, and this lane has two unmerged migrations
(0290 for #857, 0291 for #990), so the redo could not reach 0290 directly. The sequence — rehearsed
end to end on a clone first, then run on `clara_l08`:

1. Release 0291's ledger row (`delete from clara.schema_migrations where version like '0291%'`,
   checksum recorded: `45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3`). This is
   the one hand step, and it is exactly the first half of what `redo` itself does; it exists only to
   let the supported redo reach the version below the frontier.
2. `CLARA_MIGRATION_REDO=0290_document_regions_field_path_check node scripts/migrate.mjs` —
   `PROBE MODE: raw insert (clara.document_regions is populated)`,
   `redone … new checksum aec72ad9d95e2e56b39c183a5db12940a4529050b350e3d2a859f1ee842e6d8e`.
3. A plain `node scripts/migrate.mjs` re-applied 0291 through its own redo-safe body
   (`bslc prestate: clean (redo=t)`, both `pg_get_functiondef` splices `SKIPPED -- redo (#957)`),
   restoring its ledger row at the **same, unchanged** checksum.
4. A third plain `migrate`: `0 new migration(s) applied · 269 total` — no checksum drift anywhere.

`clara.schema_migrations` now reads 269 rows, `max(version) = 0291_bank_statement_line_citation`.

### Pins re-measured

- `apps/web/tests/firm-scope-db-pins.corpus.ts`'s `REVIEWED_DYNAMIC_SQL_BARRIERS` keys on **0291**'s
  file sha256, and 0291 was not edited: `45235f2d…` is unchanged, confirmed against the live ledger
  row. Nothing to re-measure. Re-run as part of the whole suite (green).
- 0290 carries no content-sha pin anywhere: it is absent from `MIGRATION_ISOLATION_PINS`
  (`packages/db/scripts/migration-atomicity.mjs`, which holds only `0057_wave_e_registry_snapshots`)
  and from `REVIEWED_DYNAMIC_SQL_BARRIERS` (it splices nothing — S1 is a plain
  `create or replace function`). Grepped for both the old and the new checksum across the repo: no
  hits.
- 0290's prestate pin on `clara._assert_field_path` is unmoved:
  `0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace`, re-verified live by the redo
  itself and re-asserted by the tail.

### Docs

`packages/db/README.md`'s "0290" section: the paragraph "Populated rows, not an empty table", which
stated the refusal as intended behaviour, is replaced by "An empty table is a lawful apply state,
and the row count is measured, not refused" — naming the three fresh-database states, the EMPTY tail
branch, and where the populated-row proof actually lives.

---

## SPEC-L08-02 (major) — #990's AC1 is unreachable on the live lane

**Confirmed against the code, not taken on the reviewer's word.**
`packages/runtime/workflows/statementFacts.v3.prompts.mjs`'s `lineShape` (lines 151-157) declares
exactly five keys — `entry_date`, `value_date`, `description`, `amount_cents`,
`running_balance_cents` — with no page or region, and `toWriterLines()` (lines 349-362) REBUILDS
every line as a fresh object of six named keys, so even a model that volunteered a page could not
get it into `p_payload.readers.reader1.lines[i]`. Both files are frozen. The frozen-body rule is
therefore what blocks the producer half, and the lane carried it correctly as a successor contract.

What was missing was the consequence, which is why this is a report fix rather than a code fix:
`citationState()` returns `not_recorded` for any `ocr`/`witness` line with a null `citation_page`,
so the Matching tab's detail pane and outcome block render **"No source citation was recorded for
this line."** on every real machine-lane line, today and until the unfreeze window. The ticket
report said "done".

`reports/wave3-lane08-ticket990.md` now reads **Status: PARTIAL**, states that outcome in the first
paragraph, marks AC1 as "the door half only", notes that cell 990.a's citation comes from the test's
own `landCitedWitnessStatement` fixture rather than from any production path, and files the producer
half as its own follow-up ticket blocked on the wave-4 `chatTurn_v22`/`claraWork_v6` cut.

No code change: `CONTEXT.md` and `packages/db/README.md` already name the residual accurately
(checked), and the rendered sentence is the owner's own "nothing dark" ruling working correctly for
the state the estate is actually in.

---

## SPEC-L08-03 (major) — the README contradicted the table beneath it

**Reproduced:** `ls apps/web/e2e/*.spec.ts | wc -l` = 49; coverage-map rows = 26; 23 checked-in
specs had no row at all. The first fix made the sentence agree with disk and disagree with the table
directly below it, which is the half of the requirement the ticket spells out.

Writing 23 descriptions is the ticket's OWN out of scope, so this takes the other branch its
either/or allows.

- `apps/web/e2e/README.md` — the sentence now reads "The checked-in suite currently contains 49
  specs. The table below describes 26 of them; the remaining 23 have no row yet and are named under
  Specs with no coverage-map row beneath it …", followed by a new `### Specs with no coverage-map
  row` section listing all 23 by file name. **Names only, no descriptions**, so AC3 ("the
  coverage-map table's per-spec descriptions are otherwise unchanged") stays intact — the table
  itself is byte-unchanged.
- `apps/web/e2e/spec-discovery.test.ts` — a second `#1019` cell holds all three numbers together:
  stated total vs `readdirSync`, stated described-count vs the table's own rows, stated remainder vs
  the named list, and `[...described, ...residual].sort()` deep-equal to the directory listing. That
  last arm is what closes the hole permanently: a spec can be neither added nor removed without
  landing in exactly one of the two, so the next drift is red before it is prose. The first cell's
  regex was widened from `specs:` to `specs[.:]` to accept the reworded sentence; it still pins the
  total against disk unchanged.
- **Vacuity control, both arms, run and observed.** `describes 26` → `describes 25`: `not ok 4`.
  Deleting one bullet (`- \`plans-walk.spec.ts\``) from the residual list: `not ok 4`. Restored byte
  for byte from a snapshot; 4/4 pass.

The residual is recorded in `reports/wave3-lane08-ticket1019.md` with all 23 spec names and a
follow-up ticket proposed for writing their descriptions.

---

## SPEC-L08-04 (minor) — the "duplicated reference tags", named and left alone

**Reproduced, and the symptom's description corrected.** `awk 'NR>34 && /^#/'` over
`apps/web/test/manifest.txt` prints exactly four lines, all inside the path list, none in the header
#1020 restored: `# #770` at 303 and 305, `# #809` at 438 and 440, unchanged on this branch.

They are **not** adjacent duplicates and neither of each pair is redundant. Each tag precedes
exactly one path it tags: 303 tags `components/work/work-activity-view.test.tsx` (304), 305 tags
`components/work/work-cancel-dialog.test.tsx` (306); 438 tags `lib/plans/api.test.ts` (439), 440
tags `lib/plans/schedule.test.ts` (441). The sort put the two `# #770` lines two rows apart with the
path each one tags in between, which is what reads as a duplicate at a glance. Deleting "the second
of each pair" — the reviewer's first option — would strip a real file's train marker.

**Deliberately left as they are**, for three reasons now stated in the ticket report: AC2 keeps the
path list byte-for-byte unchanged; `apps/web/test/manifest.txt` is named in work-order rule 7 as a
file nine concurrent lanes edit this wave, so a cosmetic hunk there is a poor trade; and both
consumers (`check-test-manifest.mjs`, `run-tests.mjs`) ignore `#` lines by the header's own last
paragraph, so nothing is affected. They are four leftovers out of 503 paths, which makes the
convention inconsistent rather than wrong — recorded as an optional follow-up, not filed as one.

---

## SR-1 and SR-2 (major, AGENTS.md rule 6) — two overstated counts in #990's report

Both **confirmed by independent re-measurement on `clara_l08`**, both corrected in
`reports/wave3-lane08-ticket990.md` with the correction itself stated in line, never a silent edit.

- **SR-1.** `select count(*), max(version) from clara.schema_migrations` →
  `269 | 0291_bank_statement_line_citation`. The report said 291, which is 0291's migration NUMBER,
  not a COUNT. Corrected to 269 (267 base + 0290 + 0291), matching #857's own "268 total after
  0290".
- **SR-2.** `node --test --test-concurrency=1 $GATES tests/rig-isolation.test.mjs` →
  `# tests 23 / # pass 22 / # fail 0 / # skipped 1`. The report said 32 pass, which is this file's
  22 plus `operation-census.test.mjs`'s 10, summed and mislabelled as one file's own count.

While re-measuring, the report's other gate figures were re-run rather than assumed, and both are
accurate as written: `operation-census.test.mjs` 10/10, and AC4's bank batteries **102/102**
(`bank-line-existing-booking`, `f-a1-statements{,-2,-3}`, `f-a2-statement-activation`,
`f-a3-pr1c-egress-bank-matching`, `f-a3-pr3-chatturn-v14-bank-parity`, `x38-wave-c-b-bank`) plus
`x38-wave-c-b-match` **33/33** = 135. No further corrections were owed.

---

## Gates, with counts

All on `clara_l08 @ 127.0.0.1:55748` / this worktree, after the last commit.

| gate | result |
|---|---|
| `document-regions-field-path-check` + `bank-statement-line-citation` + `field-path-grammar` + `document-regions-unique-field-path` + `document-fact-validation-belt`, full gate chain | **39 tests, 39 pass, 0 fail** |
| `operation-census.test.mjs`, full gate chain | **10/10 pass** |
| `rig-isolation.test.mjs`, full gate chain (never with the reset flags) | **23 tests, 22 pass, 0 fail, 1 skipped** (T19, the destructive poison-role drill) |
| bank batteries: `bank-line-existing-booking`, `f-a1-statements{,-2,-3}`, `f-a2-statement-activation`, `f-a3-pr1c-egress-bank-matching`, `f-a3-pr3-chatturn-v14-bank-parity`, `x38-wave-c-b-bank` | **102/102 pass** |
| `x38-wave-c-b-match.test.mjs` | **33/33 pass** |
| `apps/web/e2e/spec-discovery.test.ts` standalone | **4 tests, 4 pass** (2 × `#851`, 2 × `#1019`) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4857 tests, 4855 pass, 0 fail, 2 skipped** — the known `CLARA_LIVE_SUPABASE_AUTH_URL`/`ANON_KEY` live-provider skips in `password-recovery-live.test.ts`. One more test than the pre-round 4856: the new `#1019` partition cell. |
| `pnpm typecheck` (root) | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root, as the Linux runner sees it) | **exit 0** — includes `check-test-manifest`, its selftest, `check-message-keys` and the ui-add guard selftest |
| migration ledger | `0 new migration(s) applied · 269 total` — no checksum drift |

No e2e browser walk was re-run and none is owed: this round touched no `*.spec.ts`. The one walk the
lane touched, `bank-match-walk.spec.ts`, is untouched by these two commits. `packages/runtime` was
not touched, so no frozen-workflow or parts-parity run is owed by rule 8.

## Anything unverified

- **Hosted's `clara.document_regions` row count is unknown to this round.** It no longer matters for
  SPEC-L08-01 — 0290 now applies on both an empty and a populated table, proved — but the pre-deploy
  census `packages/db/deploy/0290-field-path-check-census.sql` is still the thing a release session
  must run first, and it has never been executed through an actual `psql` on this rig (no `psql` on
  the Windows PATH; #857's own report already flags this).
- **The lane's own from-scratch chain was not run here.** The four apply states were proved on
  template clones of `clara_l08`, which is the strongest thing available without a second chain on
  this cluster (forbidden by RIG.md, migration 0154's cluster-wide role pin). The integrator's
  disposable-cluster from-scratch chain remains the authority, and SPEC-L08-01 is precisely the
  defect it would have caught.
- **One hand step in the ledger repair**, named above: 0291's ledger row was deleted so #957's
  single-version redo could reach 0290. #957 assumes one unmerged migration per lane; this lane has
  two. The step is the first half of what `redo` itself performs, it was rehearsed on a clone first,
  and the end state was verified by a third `migrate` reporting zero drift. Worth a note for the
  wave: a lane with two unmerged migrations cannot redo the lower one by the supported path alone.
- **The four `# #770` / `# #809` tag lines in `apps/web/test/manifest.txt` are left in place.** That
  is a judgement call, argued under SPEC-L08-04 above, not an omission.

## Head

`7fbb0beee`
