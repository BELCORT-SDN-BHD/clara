# Wave 3 — Lane 05 — Ticket #908

**Branch:** `riders/w3-lane05` (worktree `C:\Users\zhant\Desktop\clara-wt\655`), base
`ffe63a0dd084e99b84c1368119845be273c421ce`.
**Commit:** `4fe3873fa` — `feat(db): #908 the shared plan-schedule validator gains the accrual
entrance's yield wall`.
**Database:** `clara_l05` (127.0.0.1:55745), migrated from scratch 0001→0272 (267 files) before
this ticket; 0280 is the only migration this ticket adds (now 268 files).

## Ticket verified live

`gh issue view 908 --comments` — title "Plan lane's own door still accepts a plan whose schedule
reaches no due date", labels `bug`, `ready-for-agent`. The newest (and only) Agent Brief is the
2026-09-17T17:02:59Z comment; no owner ruling comment dated 2026-09-20 exists on this issue. The
brief's premise was re-checked directly on this branch (not assumed from the issue text): before
0280, `clara._assert_plan_schedule` (recut by 0223) carried every arm except a yield check, and
`clara._assert_accrual_schedule_yields` (0222) existed and was reachable only from the two accrual
doors — confirmed by grepping every migration file for both function names and reading the call
sites. **Status: live, built as specified.**

## Status: done

## Seams (stated before building, per work-order rule 4)

The Agent Brief names two doors and the shared validator:
- `clara.create_accounting_plan` (0250:344, the live recut) — a real human door, driven through
  `humanQuery`.
- `clara.revise_accounting_plan` (0193:1628, never recut) — same.
- `clara._assert_plan_schedule` itself — reached only through the two doors above and through
  `clara._accrual_plan_core` (0222:961, private, reached only by the two accrual doors); not a
  door of its own, so not driven directly except by the tail's outside-in catalog re-proof.
- Cross-check seam (not in the Agent Brief's own list, added because AC4 is a claim about a
  *different* door's behaviour): `clara.create_accrual_adjustment`, driven once directly, to prove
  the accrual entrance still answers its own token.

## Acceptance criteria, each with its evidence

1. **"A cell proves `create_accounting_plan` refuses a no-due-date schedule with the typed reason
   and named field, writing nothing."**
   `packages/db/tests/plan-schedule-yield-wall.test.mjs::pw908.create` — PASS. Drives
   `create_accounting_plan` with a half-month/`last_day_of_month` window (`2026-07-01`..`2026-07-15`,
   last day of July falls outside it) and asserts `errcode=CLR10`,
   `detail.reason=plan_schedule_yields_no_occurrence`, `detail.field=day_rule`,
   `detail.constraint=yields_occurrence`. A second call with `day_rule=day_of_month, dayOfMonth=20`
   over the same window asserts `detail.field=day_of_month`. `planCount(client)` (a direct
   `select count(*) from clara.accounting_plans where client_id=$1`) reads `0` after both refusals.

2. **"A cell proves `revise_accounting_plan` refuses the same shape."**
   `pw908.revise` — PASS. Creates a real plan (`day_of_month=1`, `2026-07-01`..`2026-12-31`, which
   yields monthly), reads its live revision (`revision=1`), then revises it onto the same
   half-month/`last_day_of_month` shape and asserts the same `errcode`/`reason`/`field`. After the
   refusal, `liveRevision(plan)` still reads `revision=1` with the SAME row `id`, and
   `revisionRows(plan).length === 1` (no orphan revision row) — the schedule check runs before the
   reservation and the `for update` lock, so a refusal there writes nothing, matching the pattern
   `accrual-adjustments.test.mjs`'s own yield-wall cell already measures on the accrual side.

3. **"A cell proves each already-refused malformed shape keeps its own reason."**
   `pw908.other-arms-unmoved` — PASS. Re-drives three of `_assert_plan_schedule`'s pre-existing
   arms directly through `create_accounting_plan` (unsupported frequency → `invalid_schedule`; a
   monthly reversing plan on the 1st → `reversal_collides_with_next_occurrence`; an unsupported
   timezone → `timezone_unsupported`) and asserts each keeps its OWN token, never
   `plan_schedule_yields_no_occurrence`. The pre-existing `accounting-plans.test.mjs` battery
   (below) independently re-proves the same claim across every other arm 0223 wrote.

4. **"Every accrual cell asserting the accrual token stays green."**
   `packages/db/tests/accrual-adjustments.test.mjs` — **21/21 PASS**, unchanged, run against the
   post-0280 database. This includes `p652.schedule.yields`, the cell that asserts
   `accrual_schedule_yields_no_occurrence` on three shapes through `create_accrual_adjustment`.
   Additionally, `pw908.accrual-entrance-unmoved` (this ticket's own new cell) drives
   `create_accrual_adjustment` directly with the identical half-month/`last_day_of_month` shape and
   asserts the SAME accrual token, never the new one — the structural reason this holds
   (`_assert_accrual_schedule_yields` raises before `_accrual_plan_core` ever reaches
   `_assert_plan_schedule`, 0222:1182 vs 0222:1027) is stated in the migration header and the
   README section, and this cell is the "a door's behaviour is asserted only after it was driven"
   proof the wave-3 addendum asks for.

5. **"The tail re-pins the recut validator and asserts the arm is present, from scratch."**
   0280's own tail (`$w908_tail$`) does this at apply time (see migration output below).
   `pw908.tail` re-proves the same claims from OUTSIDE the migration, independently: the live
   `prosrc` of `clara._assert_plan_schedule` contains the new token, the call to
   `clara._accrual_schedule_yields`, and the open-ended guard; every pre-existing arm's own token
   (`amortisation_schedule`, `last_day_of_month`, `reversal_collides_with_next_occurrence`,
   `invalid_schedule`, `timezone_unsupported`) is still present; owner, `SECURITY DEFINER`,
   `search_path`, `IMMUTABLE` volatility and the owner-only ACL are all unmoved; and
   `clara._accrual_schedule_yields`'s own sha256(prosrc) is unchanged (`c75bf4c036cb…1a42`).

## The orchestrator's own instruction: "prove no legitimate plan is refused"

`pw908.legitimate-plans` — PASS. Drives, all through the human door:
- An **open-ended** plan (`effectiveTo: null`, `dayRule: day_of_month`, `dayOfMonth: 1`) — this
  estate's own DEFAULT shape (`accounting-plans-fixtures.mjs`'s `createAccountingPlan` defaults
  `effectiveTo` to `null`). Accepted.
- A bounded **recurring_journal** plan reaching a due date (`day_of_month=15`,
  `2026-07-01`..`2026-09-30`). Accepted.
- A bounded **reversing_journal** plan created DIRECTLY through `create_accounting_plan`
  (`day_of_month=15`, `reversalDayRule=next_period_first_day`) — the exact bypass the issue names
  (a caller reaching the shared door without going through `create_accrual_adjustment`). Accepted.
- A bounded **amortisation_schedule** plan (`monthly`/`last_day_of_month`,
  `2026-07-01`..`2026-09-30`). Accepted.

Beyond this cell, the whole pre-existing battery for the plan/accrual/prepayment lane was re-run
against the post-0280 database and is green: `accounting-plans.test.mjs` 20/20,
`accrual-adjustments.test.mjs` 21/21, `prepayment-schedule.test.mjs` 18/18,
`accounting-plan-occurrences.test.mjs` 16/16 — every one of these files' fixtures defaults
`effectiveTo` to `null` or constructs a genuinely-reaching schedule, so this is 75 independent,
pre-existing proofs that no plan legal before 0280 became illegal after it.

**Red-phase evidence (TDD, work-order rule 4).** Before applying 0280, the live (pre-migration)
`clara._assert_plan_schedule` was called directly with the half-month/`last_day_of_month` shape and
returned successfully (no exception) — confirming the bug is real and reproducible, not assumed.
After applying 0280, the same call raises `CLR10 plan_schedule_yields_no_occurrence`; a parallel
open-ended call still succeeds. Both probes are recorded in this session's tool transcript.

## Migration: `0280_plan_schedule_yield_wall.sql`

**House shape**, all present: header (context, why the arm lives on the shared validator, why the
accrual entrance keeps its own token, why a null `effective_to` is skipped, out-of-scope,
redo-safety); §0 prestate (pre-image `sha256(prosrc)` pins, MEASURED on this rig at 267 migrations
before applying, not transcribed from an older migration's header); §A the change (one new `if`
arm, everything else byte-identical to 0223's body); §T tail (re-pins, arm-presence checks, posture
census). No preintegration-gate-module skip needed inside the migration itself (that machinery is
for `node --test`, not `migrate.mjs`); the test file's own gate and its preintegration-gate module
are separate, see below.

**Prestate pins (measured live on `clara_l05` at 267 migrations, 0001→0272, before this ticket)** —
every signature the wave-3 addendum requires (bodies recut AND neighbour bodies relied on):

| signature | sha256(prosrc) | role |
|---|---|---|
| `clara._assert_plan_schedule(text,text,text,int,text,date,date,text)` | `e3640588afe00a3c85bcb4198551acb083b6a5d82686b6bba724f28b11367fd7` | RECUT (post-0223 pre-image) |
| `clara._accrual_schedule_yields(text,text,int,date,date)` | `c75bf4c036cbd54e2c2e737d159cc628e07e3a88fffc46a60e5b82a22add1a42` | called, not recut |
| `clara._plan_due_events(date,text,text,int,boolean,date,date,int)` | `66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384` | one level down, pinned (the triage comment names both as load-bearing) |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)` | `84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4` | non-regression |
| `clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)` | `87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f` | non-regression |
| `clara._assert_accrual_schedule_yields(text,text,int,date,date)` | `fd504b300a89170b6d030575e2fe1d073f2ec934795209cfc5a2f0db1026ec9f` | non-regression (the accrual entrance's own token) |

**Applied twice — a first-apply, then a genuine redo, both measured (this file's redo obligation
under #957 is discharged with a real redo, not merely written to tolerate one):**

1. First apply (`pnpm db:migrate`): `applied 0280_plan_schedule_yield_wall · backend pid 428287`.
   Prestate notice printed correctly; found a COSMETIC bug of my own on inspection — the closing
   `raise notice` reused the `v_sha` loop variable and printed `_assert_accrual_schedule_yields`'s
   sha instead of `_assert_plan_schedule`'s own (the actual `if` checks all ran correctly at the
   right time; only the final log line was misleading).
2. Fixed (captured the own-function sha into a dedicated `v_own_sha` before it gets overwritten),
   then redone: `CLARA_MIGRATION_REDO=0280_plan_schedule_yield_wall pnpm db:migrate` →
   `redone 0280_plan_schedule_yield_wall · backend pid 428323 · new checksum
   feb3a4ce3ed95656258b7f93628290d661e2ea2ef745cdf951d6ab955394d241`. The prestate correctly took
   the REDO branch ("own prior output (a #957 redo)") rather than the fresh-apply branch — this is
   the wave-3 addendum's "prove the FIRST-APPLY branch yourself" requirement satisfied from the
   OTHER side: the FIRST-APPLY branch was exercised for real on the actual first apply (not
   synthesised inside a rolled-back transaction), and the REDO branch was then exercised for real
   too, both on the live lane database. Final tail notice: `#908 tail: OK — …`.

**Data-dependent branches (wave-3 addendum):** the prestate/tail carry a bimodal branch
(fresh-apply vs. redo) but no branch conditioned on TABLE ROWS — both apply passes above are the
proof it was entered both ways. No branch requires seeding client/plan rows before applying.

**Never edited an applied migration or another ticket's migration.** 0280 is the only new file;
nothing before it on this branch was touched (this is the first ticket landed in this lane).

## Gates, with counts

- **`packages/db/tests/plan-schedule-yield-wall.test.mjs`** (new, full gate chain,
  `--test-concurrency=1` with every `--import ./tests/*-preintegration-gate.mjs` flag from
  `package.json`'s `test` script): **6/6 PASS**, 0 skipped.
- **`packages/db/tests/accounting-plans-fixtures.mjs`** (touched: one new `PLAN_REASON` key) — not
  a test file itself; proven correct by every file that imports it, below.
- **Non-regression, full gate chain, run against the post-0280, post-redo database:**
  `accounting-plans.test.mjs` 20/20, `accrual-adjustments.test.mjs` 21/21,
  `prepayment-schedule.test.mjs` 18/18, `accounting-plan-occurrences.test.mjs` 16/16 — **75/75
  PASS**, 0 fail, 0 skip.
- **`operation-census.test.mjs`**: 10/10 PASS (no reset flags).
- **`rig-isolation.test.mjs`**: 22/23 PASS, 1 SKIP — `T19 poison-role` (destructive, needs
  `CLARA_RIG_ALLOW_RESET=1`, correctly skipped per RIG.md/"never with the reset flags").
- **`pnpm typecheck`** (repo root): clean — `apps/web` and `packages/runtime` both `Done`, no
  errors (packages/db has no typecheck script; it is plain JS).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root, as the runner sees it): exit 0, including
  `packages/db`'s own `eslint .` (also run standalone: exit 0) and every selftest battery the root
  lint chain runs (frozen-workflows, frozen-evaluators, leaks, dead-citations, message-keys,
  test-manifest, ui-add-guard, …).
- **`apps/web` and `packages/runtime`**: NOT touched by this ticket, so the whole-unit-suite and
  browser-walk gates and `check-frozen-workflows.mjs`/`check-parts-parity.mjs` do not apply beyond
  what the root `pnpm lint`/`pnpm typecheck` runs already cover structurally.
- **Known Windows-only reds (RIG.md):** none encountered; none of the affected files/tests were
  touched.

## Docs updated

- `packages/db/README.md` — new section "0280 — the plan lane's own door gains the accrual
  entrance's wall (#908)": context, what changed, why the accrual entrance keeps its own token, why
  a null `effective_to` is skipped, the prestate/tail pins (with the measured redo), what the
  migration does not do, and the known apps/web gap (below).
- `packages/db/tests/accounting-plans-fixtures.mjs` — one new `PLAN_REASON.scheduleYieldsNoOccurrence`
  constant, at the sorted position beside `reversalCollides`.
- `packages/db/package.json` — one new `--import` gate-chain entry, appended after
  `retire-create-account-set-preintegration-gate.mjs` (the previous highest migration number, 0271),
  in migration order.
- `CONTEXT.md` — **deliberately not touched.** Checked first: neither
  `accrual_schedule_yields_no_occurrence` (the sibling token #652 already shipped) nor any other
  CLR10 `detail.reason` string appears anywhere in `CONTEXT.md` — this house's vocabulary file does
  not track individual refusal tokens, only domain concepts. `plan_schedule_yields_no_occurrence`
  is not new domain vocabulary; it restates an already-documented concept ("a schedule that can
  never perform") at a second door. No entry added.

## Successor contract

None. This ticket touches no frozen chat body, no Work tool, no `chatTurn_v22`/`claraWork_v6`
closure, and adds no new door, argument or wire shape — `create_accounting_plan` and
`revise_accounting_plan` keep byte-identical bodies and their existing zod/wire contracts
(unchanged by this ticket). The ONE new fact a frozen tool's refusal-mapping table would eventually
want is the new `detail.reason` string itself:

- **name:** `plan_schedule_yields_no_occurrence` (CLR10, raised by `clara._assert_plan_schedule`,
  reachable through `clara.create_accounting_plan` and `clara.revise_accounting_plan`).
- **detail shape:** `{ reason, field: "day_of_month" | "day_rule", constraint: "yields_occurrence",
  kind, frequency, day_rule, effective_from, effective_to }` — same shape as the existing accrual
  sibling `accrual_schedule_yields_no_occurrence`, minus the accrual-specific fields.
- **when it fires:** a well-formed, bounded (`effective_to` not null) schedule whose day rule never
  reaches a due date inside its own window, on ANY of the three plan kinds, through either general
  plan door.
- Nothing else changes: no new door call, no new argument order, no new refusal MAPPING beyond
  adding this one token beside its sibling wherever a UI or chat tool already lists
  `accrual_schedule_yields_no_occurrence`.

## Follow-ups worth filing

1. **`apps/web/lib/plans/schedule.ts`'s `validatePlanSchedule`** is the general plan form's own
   mirror of `_assert_plan_schedule` and carries NO yield check today — unlike
   `apps/web/lib/work/accrual-draft.ts`, which already mirrors the accrual entrance's wall
   (confirmed: `accrualScheduleYields`/`scheduleYieldsNoOccurrence` appear in
   `apps/web/lib/work/accrual-draft.ts` and `apps/web/lib/accruals/api.ts`, nowhere in
   `apps/web/lib/plans/`). After 0280, a well-shaped but non-yielding schedule submitted through the
   general plan form now gets a correct but LATE refusal from the door instead of an early one
   beside the field. Deliberately NOT fixed here: apps/web is outside this ticket's named
   interfaces ("Key interfaces: `_assert_plan_schedule`, `create_accounting_plan`,
   `revise_accounting_plan`"), and fixing it would widen the ticket (work-order rule 5). Documented
   in `packages/db/README.md`'s 0280 section and here so it is not lost.
2. Same file also still lists `PLAN_KINDS = ["recurring_journal", "reversing_journal"]`, missing
   `amortisation_schedule` (which the DB's CHECK has admitted since 0223) — a PRE-EXISTING gap,
   unrelated to #908, noticed while reading the file for follow-up 1. Worth its own ticket.

## Unverified / explicitly not claimed

- I did not run this file under WSL as user `runner` (RIG.md: "the integrator re-runs new runtime
  test files once under WSL … before a PR") — that is an integrator step for `packages/runtime`
  files specifically; this ticket touches no runtime files, but if the same practice extends to
  `packages/db`, it was not performed here and should be checked at integration.
- I did not re-run the wave's hosted/CI hooks or a from-scratch migration chain; the from-scratch
  proof is explicitly the integrator's job (RIG.md, wave-3 addendum), not a lane's.
- No claim is made about tickets #909/#927/#928/#929 (later in this lane) beyond what this ticket's
  own migration and tests establish about the state they will build on: `_assert_plan_schedule` is
  now at the sha printed by 0280's own tail notice; `clara._plan_overlap_warning` (the function
  #909/#929 both recut) was not touched, read, or measured by this ticket.
