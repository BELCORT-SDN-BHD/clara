# Wave S, lane 07, ticket #1058 — via_wake_kind is NOT renamed; the posting-lane widening is disclosed

Branch `riders/wS-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\659`, database `clara_l09`
(127.0.0.1:55749). Base (this lane's own frontier): `7bc5a710f`. This is the ninth and final
ticket in the lane; #1047, #1098, #1046, #1132, #1096, #1099, #1094, #1095 had already landed
their commits and migrations on this branch/database before this session started (`git log
--oneline 7bc5a710f..HEAD` showed 19 prior commits; confirmed via each ticket's own
`reports/waveS-lane07-ticket<n>.md`, none redone).

Commit: `865fefe1f feat(db): #1058 disclose via_wake_kind's posting-lane widening instead of a
rename (0350)`.

## The ticket, and which contract binds

`gh issue view 1058 --comments` — issue body is the original Agent Brief (source
`wave4-lane01-ticket946.md`, follow-up 5; originating ticket #946), asking for a rename of
`clara.entry_post_receipts`' authorisation-kind column so its name no longer implies "wake kind
only", with every reader/writer updated. The NEWEST item, a comment dated 2026-09-24T19:10:33Z
("Ruling applied under the owner's delegation of 2026-09-23 (riders sweep wave, SWEEP-PLAN.md)"),
overrides the body: **no rename**. Correct the column's own comment and the README instead — a
one-line `comment on` migration plus a README section, in lane L7. This matches the lane prompt's
own "RULING OF 2026-09-25" verbatim and SWEEP-PLAN.md's `#1058` row under "Owner questions, with a
recommended ruling" (line 252). I verified the ticket is still live and unresolved before building
(`state: OPEN`, `ready-for-agent` label, no later comment).

I independently re-checked the ruling's three factual claims against this lane's own database and
the repo tree, rather than restating them on trust (AGENTS.md rule 6, "claims need evidence"):

- **Live CHECK enumeration** (`entry_post_receipts_via_wake_kind_check`, measured on `clara_l09`
  before this file applied): `autodraft`, `interactive`, `bank_agent`, `payroll_facts`,
  `contract_facts` — five values, confirmed by direct query, not by reading a migration header.
- **Nine frozen workflow files** naming `via_wake_kind`: confirmed by
  `grep -rl "via_wake_kind" packages/runtime/workflows/*.ts` — exactly nine
  (`autoDraft.v9.usage.ts`, `bankAgent.v1.usage.ts`, `chatTurn.v13.post.ts`,
  `chatTurn.v13.usage.ts`, `chatTurn.v14.usage.ts`, `chatTurn.v15.freeform.ts`,
  `chatTurn.v15.infra.ts`, `chatTurn.v15.usage.ts`, `closePrep.v1.usage.ts`).
- **Three carry prose**, not just a signature string: `chatTurn.v13.post.ts:22-23`,
  `chatTurn.v15.freeform.ts:203`, `chatTurn.v15.infra.ts:106` — confirmed by reading each.
- **Two doors name a `p_via_wake_kind` parameter of a different door**: `bankAgent.v1.usage.ts:120`
  and `closePrep.v1.usage.ts:91` each build SQL with the named argument
  `p_via_wake_kind => $10` against `clara.record_agent_usage_event`
  (`packages/db/migrations/0110_f_a9_llm_usage_reshape.sql:365-370`) — confirmed by grep; the other
  four `.usage.ts` files declare the same signature string but never call it with a named argument.
- The "~118 source files" count is the ruling's own figure; I did not re-derive it (a broad
  `grep -rl` across `.ts/.tsx/.sql/.mjs/.md` outside `node_modules` found 139, which is the right
  order of magnitude once `.md` docs/reports and this ticket's own three new files are counted in —
  I did not narrow further since the exact count is not an acceptance criterion and the ruling is
  binding regardless).

## Seams (written down before testing, per the lane's TDD rule)

The ticket's own AC1/AC2 (rename every reader/writer) are superseded by the ruling. What remains
live, reframed under the ruling:

1. **The catalog comment** on `clara.entry_post_receipts.via_wake_kind` — the column-level
   equivalent of the `comment on function` precedent `0349_admit_autodraft_task_outcome_disclosure`
   set for #1132's own documentation-not-rename ruling.
2. **The README section** — `packages/db/README.md`'s `## 0350` heading.
3. **AC3, reworded under the ruling** ("existing data and its meaning are unchanged; this is
   [documentation], not a schema or behaviour change") — driven against the live catalog, not read
   off this file's own prose.

## Acceptance criteria, with evidence

| AC | Evidence |
|---|---|
| Column comment states the widening and refuses the rename | `p1058.comment.discloses_the_lane_widening_and_the_no_rename_ruling` (`packages/db/tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs`) — reads `col_description` live, asserts it names `payroll_facts`, `contract_facts`, `#1058` and plainly states "NOT renamed". **PASS**, focused run (`node --test --test-concurrency=1 tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs`), 0 skips. |
| README section states the same | `p1058.readme.section_discloses_the_lane_widening_and_the_no_rename_ruling` — reads `packages/db/README.md`'s `## 0350` section, asserts the same four tokens plus the no-rename sentence. **PASS.** |
| "Existing data and its meaning are unchanged; this is not a schema or behaviour change" (AC3, reworded under the ruling to mean: no rename, no CHECK widening) | `p1058.catalog.column_not_renamed_and_check_enumeration_unchanged` — live-queries `information_schema.columns` (column still named `via_wake_kind`, still `text`; no alternate spelling `via_posting_kind`/`via_authorisation_kind`/`via_lane_kind` exists), `pg_get_constraintdef` on `entry_post_receipts_via_wake_kind_check` (byte-identical to the pre-#1058 five-value enumeration), and `pg_attribute` (Annex E.1's 14 columns, unchanged). **PASS.** |
| No new admitted value; the enum-widening alternative was not taken | Same cell above, plus migration tail assertion T.2 (`entry_post_receipts_via_wake_kind_check` re-measured byte-for-byte against the prestate pin). **PASS** — applied cleanly, tail notice: "entry_post_receipts_via_wake_kind_check is byte-identical to the measured pre-image five-value enumeration". |
| No reader/writer renamed anywhere in the codebase | Deliberately NOT built — the ruling refuses the rename outright; there is nothing to update. Migration prestate/tail assert the column's own name and type are unmoved; no other file in this commit touches a reader or writer of the column. |

What was deliberately left: the 118-file rename itself, and any edit to the nine frozen workflow
files — both refused by the ruling, not partially attempted.

## Migration

`packages/db/migrations/0350_via_wake_kind_lane_disclosure.sql` — a single `comment on column`
statement, no DDL, no function recut. Applied via `pnpm --filter @clara/db migrate`:
`applied 0350_via_wake_kind_lane_disclosure · backend pid 966288`, `313 total`. A second
`pnpm --filter @clara/db migrate` afterwards reported `0 new migration(s) applied · 313 total`
(no drift).

**Prestate pins, MEASURED on `clara_l09` at 312 applied migrations /
`0349_admit_autodraft_task_outcome_disclosure` (this lane's own frontier, never copied from a
creating migration's header):**

- `entry_post_receipts_via_wake_kind_check` def: `CHECK ((via_wake_kind = ANY (ARRAY['autodraft'::text, 'interactive'::text, 'bank_agent'::text, 'payroll_facts'::text, 'contract_facts'::text])))`
- `clara.entry_post_receipts.via_wake_kind` present, type `text`, not dropped.
- Column count on `clara.entry_post_receipts`: 14 (Annex E.1).
- `col_description` on the column: `null` (mode `FIRST`).

**Tail assertions** (T.1–T.4) re-measure all four, byte-for-byte, plus confirm the comment is set
and names `payroll_facts`, `contract_facts` and "NOT renamed". All four passed on first apply
(`notice: #1058 tail: OK -- ...`).

**Redo proven live, both branches.** `CLARA_MIGRATION_REDO=0350_via_wake_kind_lane_disclosure
pnpm --filter @clara/db migrate` re-ran the file: prestate correctly detected mode `REDO`
(`notice: ...already carries a #1058 comment — this is a REDO (#957) over this file's own
effects.`), tail re-passed, `redone 0350_via_wake_kind_lane_disclosure · new checksum
da365bf8...`. The focused test file was re-run after the redo and stayed green (3/3). This file
carries no `sha256(prosrc)` pin (it recuts no function body), so the wave-3 addendum's
roll-back-and-restore drill for a bimodal prosrc pin does not apply; both real branches of this
file's own FIRST/REDO logic were exercised directly instead, which is the equivalent proof for a
file with no prosrc branch.

**Rig-meta cohort:** none owed. This file mints no new function, table or other catalog name (a
catalog comment only) — the shared-files rule's own qualifier, and the same posture
`0349_admit_autodraft_task_outcome_disclosure` took for the same reason.

## Docs

`packages/db/README.md` gained a new `## 0350` section (the file's own, never touching an existing
section) explaining the naming drift, why the rename was refused (with the same evidence verified
above), the live vocabulary, what the file does not change, and the acceptance-criteria-to-cell
map. `CONTEXT.md` was not touched: `via_wake_kind`/"wake credential"/"posting lane" are
implementation-level naming, not existing or new CONTEXT.md domain vocabulary (grep confirmed no
prior entries for any of the three), and this ticket mints no new domain concept — it only
documents which of five already-shipped values are which kind.

## Successor contract

None. This ticket touches no frozen chat or Work tool body, mints no new door, and nothing a
frozen chat or Work tool would need changed.

## Gates, with counts

- **Test files added/touched, full gate chain** (`node --test --test-concurrency=1 $GATES
  tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs`, `$GATES` = the exact
  `--import ./tests/*-preintegration-gate.mjs` list in `packages/db/package.json`'s `test` script,
  now including this ticket's own new gate appended at the end): **3 tests, 3 pass, 0 fail, 0
  skip.**
- **Focused run** (no gate preload, proving the frontier check fails loudly without the
  migration): confirmed red before the migration applied (`assert.fail`, "the #1058 via_wake_kind
  lane disclosure is required for a focused run"), green after (3/3, 0 skips) — the TDD red/green
  cycle and the ticket's own vacuity control (WO rule 4, "show the new cell FAILING... then
  restore").
- `operation-census.test.mjs`: **10 tests, 10 pass** (run with the full gate chain, no reset
  flags). Not strictly owed (this ticket adds no SQL function), run anyway for completeness.
- `rig-isolation.test.mjs`: **23 tests, 22 pass, 1 skip** (the known `T19 poison-role` destructive
  skip — never run with `CLARA_RIG_ALLOW_RESET`, per RIG.md). Not strictly owed, run anyway.
- `pnpm typecheck` (repo root): **exit 0**, `packages/runtime` and `apps/web` both `Done`.
- `pnpm lint`: a bare `CI=true GITHUB_ACTIONS=true pnpm lint` reports 38 `freeze-lint` violations —
  this is the KNOWN, documented condition every #1094–#1132 report in this lane already recorded:
  `check-frozen-workflows.mjs` diffs against the real `origin/main`, which has since absorbed later
  integration (chatTurn_v22, claraWork_v6, statementFacts_v4, agreementFacts.v1, payrollFacts.v1)
  this lane branch (cut from `7bc5a710f`) never carries. `CI=true GITHUB_ACTIONS=true
  FREEZE_BASE_REF=7bc5a710f pnpm lint`: **exit 0** — every step in the chain
  (`check-frozen-workflows.mjs`, its two selftests, `check-frozen-evaluators.mjs` + selftest,
  `check-leaks.mjs`, `check-dead-citations.mjs` + selftest, `check-document-region-field-paths.mjs`
  + selftest, `check-wiki-dynamic-sql.mjs` + selftest, the three `dsn-pipe` selftests,
  `world-gate.selftest.mjs`, `dispatch-model-guard.selftest.mjs`, `eslint-config.selftest.mjs`,
  `eslint scripts eslint.config.mjs`, `apps/web`/`packages/db`/`packages/runtime` eslint,
  `packages/reporting-render` eslint) passed clean.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` is in scope because a migration file changed (rule
  d), even though it is only a comment: `node --import ./test/bootstrap.mjs --import tsx --test
  tests/firm-scope-db-pins.test.ts` from `apps/web`: **22 tests, 22 pass.** No corpus edit was
  needed — `MIGRATION_FILES` reads the migrations directory live via `readdirSync`, and this
  file's `comment on column` defines no view, so it matched none of the corpus's declared-contract
  or dynamic-SQL-barrier patterns.
- `packages/db/tests` six shared census files (`coa-template-pr-b`,
  `firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`,
  `preview-invite`, `subledger-hook-caller-roster`): not touched by this ticket, not re-run —
  #1047 (earlier in this lane) owns them; this ticket writes no view, no function, no table.
- `apps/web` unit suite, `apps/web/e2e`, `packages/runtime` unit files,
  `check-frozen-workflows.mjs`/`check-parts-parity.mjs` as a standalone runtime gate: not run — this
  ticket touches no file under `apps/web` or `packages/runtime` (the frozen-workflow check above
  ran only as part of the whole `pnpm lint` chain, which already covers it).

## Follow-ups worth filing

None identified by this ticket's own scope. The two live posting lanes riding this column
(`payroll_facts`, `contract_facts`) are both already covered by their own tickets' tests
(#946/#1046's lane in wave 4, #948 in wave 4) — nothing here reopens their behaviour.

## Anything unverified

- The ruling's own "~118 source files" figure is restated from the ruling, not independently
  re-derived to an exact count (see above — the order of magnitude checks out, and the exact
  number is not an acceptance criterion).
- I did not re-run the full `apps/web` unit suite or any `packages/runtime` unit file, since this
  ticket touches neither directory (per the lane's own gate rule, which conditions the whole
  `apps/web` suite and the runtime gates on having touched those trees).
