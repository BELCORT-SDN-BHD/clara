# Wave 3 · Lane 04 · Ticket #975 — done

Fixed assets (3/4): a depreciation run stops and **asks** before a charge folds a closing or
closed fiscal year's months into the next open period, and the accountant's answer is recorded.

Branch `riders/w3-lane04` (worktree `C:\Users\zhant\Desktop\clara-wt\651`), base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Database `clara_l04` at `127.0.0.1:55744`
(270 files, frontier `0279_fa_closed_year_arrears`). Tickets before mine in this lane had already
landed: #932 (migration 0277) and #882 (migration 0278).

Commits, in order:

- `e413c5347` `feat(db): #975 the closed-year arrears question and the accountant's answer (migration 0279)`
- `63962034c` `test(db): #975 the restatement choice and the swept run's park, driven end to end`
- `266e53708` `feat(db): #975 the due probe and the preview state the arrears before anything posts`
- `765673ee0` `fix(db): #975 a parked period ends the Work lane's chase instead of being re-asked twelve times`
- `cd6f28531` `feat(runtime): #975 the FA depreciation belt counts a parked run and stops chasing it`
- `24efd21ec` `feat(web): #975 the preview states the closed-year arrears and stops promising the fold`
- `d137fbf8f` `docs: #975 the written accounting basis — CONTEXT.md and the 0279 section`
- `1b6abf48c` `feat(web): #975 the closed-year arrears question can be ANSWERED from the screen`

## The contract I built against

`gh issue view 975 --comments`. The body is the original decision ticket (ratify arrears (A) vs.
move-forward (B)); the **owner's ruling of 2026-09-20 and the Agent Brief that follows it win**, and
they reject BOTH of the body's options: Clara asks the accountant, states the amount and the year,
and offers exactly two resolutions — fold into the current period as immaterial, or reopen the
prior year and charge it there as a restatement. Checked against IAS 8: a material prior-period
error is restated in the prior year and only an immaterial one is folded into the current year, so
the treatment turns on **materiality**, a professional judgement Clara may not default.

**Still live on this branch** — verified before building: `clara._fa_run_period_core` charged every
uncharged month up to the run's period end with no question anywhere in the body
(`sha256(prosrc) = b22776bd…`, measured on `clara_l04`), and `clara._fa_oldest_unmet_period`
reported `skipped_closed` with no amount on it. The body's own "After the decision" checklist item
"a test asserts the ruling by name … the existing `p651.period.*` cells still pass unchanged" is
superseded by the ruling: the cell that measured the silent fold
(`p651.period.closed_belt_skips`) now records the fold first. Its other assertions are unchanged
and still pass, which is exactly what the ruling leaves standing.

## The seams the brief names (written down before the first test)

1. `clara.run_depreciation_manual(uuid,date,date,text)` — the human run door. **Asks.**
2. `clara.run_depreciation_period(uuid,date,date,text)` — the swept run door. **Parks.**
3. `clara.run_depreciation_period_for(uuid,date,text,uuid)` — the Work-lane run door. Parks, and
   must stop chasing a parked period.
4. `clara.depreciation_run_due(uuid)` / the due probe's `skipped_closed` report — gains the arrears
   amount it would otherwise fold forward.
5. `clara.preview_depreciation_run(uuid)` — carries that report to the surface before anything is
   written.
6. A new durable record of the resolution (client, fiscal year, arrears amount, choice, author,
   timestamp) and the door that writes it.
7. `clara._fa_assert_period_open(uuid,date)` and its refusal — **unchanged** (non-regression).
8. `clara.reopen_fiscal_year(…)` — the destination of the restatement choice, **unchanged**.
9. `reconcileFaRuns` (the runtime FA belt) — the caller of seam 2.
10. The Fixed Assets run-preview surface — the only place a person meets the question.
11. `CONTEXT.md` — the written accounting basis.

No test was written at a seam the brief does not give.

## Acceptance criteria, with evidence

**AC1 — a run whose charge includes closed or closing year months stops before posting, states the
arrears amount and the fiscal year, offers exactly two resolutions and chooses neither.**
`p975.ask` drives `clara.run_depreciation_manual` on a client whose month −3 is sealed in a closed
fiscal year and whose month −2 is open, and reads the refusal: `CLR38`, reason
`arrears_resolution_required`, axis `closed_year_arrears`, `arrears_cents = 10000` (one month of a
360,000-sen / 36-month straight line — the figure is worked from the fixture, never re-computed
from the code), `fiscal_years[0].fiscal_year_id` = the year the cell closed, `fy_status = "closed"`,
`resolutions = ["fold_current","reopen_prior"]`, `chosen = null`,
`remedy = "record_fa_arrears_resolution"`, and the human sentence naming `IAS 8` and materiality.
Nothing survives it: `draftDepreciationEntries`, `depreciationEntries` and `clientCharges` are all
empty afterwards. On the surface: `preview.closed_arrears` (unit) renders the amount and the year,
and `depreciation-walk.spec.ts` sees `RM 250.00`, the year label, "has not been answered yet" and
`IAS 8` in the real browser.

**AC2 — the resolution is recorded with its author and timestamp, and a later run for the same
client and year proceeds on the record without asking again.** `p975.fold` records `fold_current`
through `clara.record_fa_arrears_resolution` and reads the stored row back: one row, the fiscal
year, the client, `arrears_cents = 10000`, `choice = fold_current`, `decided_by` = the bookkeeper
who called, `decided_at` from the database's own clock, the run's `period_start`/`period_end`,
`active = true`. The run then proceeds (`status = drafted`, entry dated in the OPEN period, charge
rows still carrying month −3, no run receipt inside the closed year) and its receipt names the
ruling: `arrears_folded[0]` = the year, `fold_current`, `decided_by`, `resolution_id`. The
**later** run is real and not a re-run of the same act: a SECOND asset is acquired in the open month
but placed in service from the closed year's own month, so the next run's charge folds that year
forward again — it proceeds (`status = posted`) naming the SAME `resolution_id`, and
`resolutionRows` still holds exactly one record.

> **FIX ROUND (ADV-L04-2 blocker / SPEC-975-2), 2026-09-23.** That last sentence measured the
> defect rather than the requirement: the second asset MOVED the year's arrears, so a judgement
> made about one amount was silently folding another. Migration 0281 treats a year whose live
> resolution was made about a different figure as unanswered, on its own reason
> `arrears_changed_since_judgement` naming both figures. `p975.fold`'s later-run segment now drives
> the re-ask and the re-judgement, and AC2's own property — an UNMOVED figure never asks again —
> is what the run immediately after the record, and `p975.parks`' completing run, drive.

**AC3 — the swept run parks with a stated reason instead of posting, and completes once a choice is
recorded.** `p975.parks` drives `clara.run_depreciation_period` as `clara_runtime`:
`status = "parked"`, `reason = "arrears_resolution_required"`, `arrears_cents`, the year, the two
resolutions, `chosen = null`, `remedy`; `depreciationEntries` and `clientCharges` both empty. It
then records `reopen_prior` and parks again on `arrears_awaiting_reopen` with
`remedy = "reopen_fiscal_year"`, supersedes that with `fold_current` (two rows on file, the first
`active = false` with `superseded_by`/`superseded_at`, exactly one live), and the SAME door then
completes — drafted, entry dated in the open period, `arrears_folded` naming the LIVE record, the
closed year's month charged and no run receipt inside it. `p975.work_lane` drives the Work-lane
door: `periods_run = 1` (it was **12** before the loop fix — the chase re-presented one period to
one guard for twelve turns and banked eleven dedupe replays), `still_due.due = true`, nothing
posted; after the record it clears the period and its receipt names the ruling. The runtime belt
is driven in `packages/runtime/tests/reconcile-fa-unit.test.mjs`: `faParked = 1`, `faPosted = 0`,
`faNoop = 0`, `faFailed = 0`, `faOk = true`, and the run verb called **exactly once**, plus a
second cell proving the reason reaches the sweep log and the `parked=` summary field.

**AC4 — a run with no closed year months behaves exactly as today; the locked-period refusal and
the skipped-closed report are unchanged.** `p975.no_closed`: an armed client with no fiscal year at
all is due for its own first month, `skipped_closed = []`, `closed_arrears = {arrears_cents: 0,
fiscal_years: []}` (empty rather than absent), the run drafts and charges 10,000 sen,
`arrears_folded = null`, and no resolution was asked for or recorded. `p975.probe` asserts
`skipped_closed` **key for key** against the object #651 produced — the arrears figure rides BESIDE
it under a new key and never inside it. `clara._fa_assert_period_open` is pinned unmoved in 0279's
prestate AND re-read in its tail (§T.4), and `p651.period.closed_refused` (a run DATED into the
closed year) still passes untouched: 19/19 in `depreciation-history.test.mjs`.

**AC5 — the written accounting basis names IAS 8 and states that materiality is asked for, never
assumed.** `CONTEXT.md`, new term **Closed-year arrears resolution** (house "term / _Avoid_"
shape): the two resolutions with their IAS 8 basis, what is recorded and against what, the
supersede law, which door asks and which parks, and that choosing restatement reopens nothing by
itself. Its `_Avoid_` carries the correction the owner's ruling directs — calling the fold "the
ordinary accounting treatment" (0227's own comment) overstates the standard; the applied
migration's bytes are immutable, so the correction lives in `CONTEXT.md`. `packages/db/README.md`
gains the 0279 section. On screen, `FixedAssetsDepreciation.preview.skippedClosedNote` now names
IAS 8 and the judgement instead of promising the fold.

**AC6 — a new migration at the next free number; no applied migration edited.**
`packages/db/migrations/0279_fa_closed_year_arrears.sql` (the number reserved for me), one file,
applied to `clara_l04` with checksum
`ca9ede2bd4b065a8d3b4e67bde07b5afffbe937b2c1c083e580baf563de5a640`, which equals the file's own
sha256. No applied migration was edited; 0277 and 0278 (this lane's earlier tickets) were not
touched.

## Migration 0279 — what it installs, and its prestate pins

`packages/db/migrations/0279_fa_closed_year_arrears.sql`. House shape complete: header, prestate,
the change (§A relation, §B helper, §B2 door, §B3/§B4/§B5 the three passthrough recuts, §C the run
core, §D bulk grant loop), §T tail, a preintegration gate module with a stable stem
(`tests/fa-arrears-resolution-preintegration-gate.mjs`, stem `fa_closed_year_arrears$`), a rig-meta
cohort (`FA_CLOSED_YEAR_ARREARS_0279_COHORT`, bimodal like 0277's) plus the `ALLOWED` entry the
operation census attributes against, and the `--import` gate-chain entry appended last in
`packages/db/package.json` (migration order).

**RECUT (4) — pre-image pins, MEASURED on `clara_l04` before the file was written**, skipped on a
`#957` redo:

| signature | pinned pre-image sha256 |
|---|---|
| `clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)` | `b22776bd955c3c3c6fafcc5a349b5367c49ae061ec3a5a5f596af4b4bf941605` |
| `clara._fa_oldest_unmet_period(uuid)` | `234e5c4c71ce2e20739bd2f197726c1cdab8b7cf90b1cb78766d30673c9dda1c` |
| `clara.preview_depreciation_run(uuid)` | `f76126612c9cba1a3aee42ec9ca4e3a6b287883ed921a4ffdd2383cb5a32fcf7` |
| `clara.run_depreciation_period_for(uuid,date,text,uuid)` | `051112ecd71e2c0c3fe70b91757f03c74054bff0665a41c57045e2e257dba1e5` |

**UNMOVED (9) — non-regression, pinned in the prestate AND re-read in §T.4**:

| signature | pinned sha256 |
|---|---|
| `clara._fa_assert_period_open(uuid,date)` | `1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0` |
| `clara.run_depreciation_manual(uuid,date,date,text)` | `5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8` |
| `clara.run_depreciation_period(uuid,date,date,text)` | `8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921` |
| `clara.reopen_fiscal_year(uuid,text,jsonb,text,text)` | `3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5` |
| `clara._fa_compute_charges(uuid,date,date)` | `a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048` |
| `clara._fa_asset_charges(uuid,date,boolean)` | `a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849` |
| `clara.depreciation_run_due(uuid)` | `2b9bc128803e48da5c9e30781fde26d3f0491327f20a8590c531f5c727dd065c` |
| `clara._depreciation_run_due_core(uuid,uuid)` | `403aef624e74ff50427b50281aebaa02aa5e8a6957f4f2b171b3bd3141e4f279` |
| `clara._fa_depreciation_leg_pairing(jsonb)` | `2b80a29f6e10766e4af6895ae85dd6e371c90eccc0383c52e377ee770ec07d76` |

§T.3i additionally pins `clara._agent_depreciation_catchup_core(jsonb,uuid,date,text,jsonb,text)` at
`c354db4e234e58ac5213a81751522f256562b9b484153b8e7570f33a3bf9d1fc` — deliberately NOT recut, see
"Follow-ups". Three of the four RECUT pins (`_fa_compute_charges`, `_fa_asset_charges`,
`preview_depreciation_run`) overlap with 0277's own roster, so an integrator re-checking them will
find them in both files; 0277 is this lane's own earlier ticket and both pins agree.

**Integrator's note on what 0279 pins that another lane might recut:** the whole depreciation run
path (`_fa_run_period_core`, `_fa_oldest_unmet_period`, `preview_depreciation_run`,
`run_depreciation_period_for`, `depreciation_run_due`, `_depreciation_run_due_core`,
`_fa_compute_charges`, `_fa_asset_charges`, `_fa_depreciation_leg_pairing`,
`_fa_assert_period_open`, `_agent_depreciation_catchup_core`) plus `reopen_fiscal_year`. #977 and
#979 were sequenced with this ticket on the issue itself.

**Apply / redo.** 0279's FIRST apply on `clara_l04` was genuine (`applied 0279_fa_closed_year_arrears`,
the prestate's first-apply branch taken for real — `clara._fa_closed_arrears` did not exist). It was
then re-applied through the supported `#957` path (`CLARA_MIGRATION_REDO=0279_fa_closed_year_arrears`,
with `CLARA_ALLOW_DESTRUCTIVE=1` and `CLARA_RIG_DB=1`) after each slice edit — five redos in all,
two of them the deliberate vacuity breaks below. The file is redo-safe by construction:
`create table if not exists` with every constraint inside the statement, `create index if not
exists`, `drop policy if exists` + `create policy`, `create or replace function`,
`create or replace trigger`.

**The FIRST-APPLY branch of the FINAL prestate is proven, not assumed** (RIG.md's wave-3 addendum).
Three of the four recut pins were added AFTER the genuine first apply, so on every later redo their
sha branch was skipped. I proved them inside one transaction I rolled back: the four pre-images
were re-installed from the bodies measured on this rig before 0279 existed,
`clara._fa_closed_arrears` was dropped so the redo signal reads false, and 0279's own prestate
block — sliced out of the migration file, never retyped — was run verbatim. It printed the
`#975 prestate: clean` notice (NOT the redo notice) and passed; after the rollback
`clara._fa_closed_arrears` is present again. The four restored bodies measured exactly the four
pinned shas above.

## The one measurement that shaped the arrears figure

`clara._fa_asset_charges` emits contiguous **charge blocks**, and a block is closed at a fiscal-year
boundary only on the reducing-balance arm (its own comment: "A CHARGE BLOCK NEVER STRADDLES AN FY
BOUNDARY" sits inside the `else` branch). A **straight-line** block may therefore span the boundary,
so a closed year's share can NOT be read off the blocks by classifying each block's `period_start`
— any apportionment would be a guess. 0279 instead reads it as a **prefix difference** over the
estate's own arithmetic: `charged(year end) − charged(the day before it opened)`, where
`charged(X) = clara._fa_compute_charges(client, X, X) ->> 'charged_cents'`. That is exact because
`_fa_compute_charges` passes only its period END to `_fa_asset_charges` (the start is echoed, never
read), so `charged` is a prefix sum over the same forward month walk the poster runs. The year's
END is measured first and a zero ends the year there (monotone, never negative), so the steady
state — closed years with nothing uncharged — costs one charge computation per year inside the
belt's own due probe rather than two.

## How the slices went (work order rule 4)

One test → red for the right reason → the minimal code → the next test. Commit per green slice.

1. `p975.ask` — red on the frontier gate, then red again would have been the door; implemented the
   relation, `clara._fa_closed_arrears` and the guard in `_fa_run_period_core`. Green.
2. `p975.fold` — red on `function clara.record_fa_arrears_resolution(…) does not exist`;
   implemented the door and the grant loop, redone. Green. `p651.period.closed_belt_skips` went red
   in between (it drove exactly the silent fold) and was made bimodal on 0279's stem in the same
   commit: 19/19.
3. `p975.reopen`, `p975.parks` — both passed on first run, because the guard's three branches
   shipped together in slice 1 (see "One thing I did not slice" below). Each was therefore given
   the **vacuity control** rule 4 requires: the subject was deliberately broken, the cell was seen
   to FAIL, and the migration was restored byte for byte and redone.
   - `p975.reopen`: `jsonb_array_length(v_awaiting) > 0` → `> 99`; cell 3 failed; restored to
     sha256 `87f192f1…` and redone to the identical checksum.
   - `p975.parks`: the unresolved park's `'status', 'parked'` → `'status', 'held'` (and its tail
     marker count 2 → 1, because §T.3 caught the first attempt outright — which is itself evidence
     the tail is not decorative); cell 4 failed; restored to `87f192f1…` and redone.
4. `p975.probe`, `p975.no_closed` — red on "the probe now says what the next run would fold
   forward"; implemented the two passthrough recuts and the helper's one-call fast path.
5. `p975.work_lane` — red with `periods_run` **12** where 1 was expected; implemented the loop exit.
6. The belt's two cells — red on `faParked` being undefined and on the log; implemented the fourth
   outcome in `reconciler-fa.mjs`.
7. `preview.closed` / `preview.closed_arrears` — red on the note still promising the fold and on
   the missing amount; implemented the type, the block and the strings.
8. `preview.closed_arrears_answer` / `…_answered` — red on the two controls not existing;
   implemented them and wired the panel to the door.

## One thing I did not slice, and why

The guard in `_fa_run_period_core` shipped in slice 1 with all three of its branches (unresolved →
ask or park; answered `reopen_prior` → ask or park; every year answered `fold_current` → proceed and
name the ruling), rather than the single branch `p975.ask` needed. A half-guard would have let the
machine lane POST what the human lane is forbidden to post — a wall with a hole — for the length of
a commit. The two branches that were not driven by a red test at the time were each given the
vacuity control instead, as recorded above.

## Gates, with counts

- `packages/db`, FULL gate chain (174 `--import` flags built from `packages/db/package.json`'s
  `test` script), `--test-concurrency=1`:
  - `tests/fa-arrears-resolution.test.mjs` + `tests/depreciation-history.test.mjs`: **26/26 pass,
    0 fail, 0 skipped** (7 + 19).
  - `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs`: **33 tests, 32 pass, 0 fail,
    1 skipped**. The one skip is `rig-isolation` T19 (poison-role), the known intentional skip that
    needs `CLARA_RIG_ALLOW_RESET`, which this rig's rules forbid setting. **No reset flag was set at
    any point**, and `CLARA_RIG_ALLOW_ROLE_SWEEP` was never set either.
  - `tests/fa-depreciation-policy.test.mjs` + `tests/fixed-asset-acquisition.test.mjs` (this lane's
    earlier tickets, re-run because `rig-meta.mjs` is shared): **36/36 pass**.
- `packages/runtime`: `node --test tests/reconcile-fa-unit.test.mjs` — **20/20 pass**.
  `node scripts/check-frozen-workflows.mjs` — OK (312 frozen files, 55 workflow modules, no
  manifest diff). `node packages/runtime/scripts/check-parts-parity.mjs` — OK.
- `apps/web`, files touched, run individually: `components/registers/fa-run-preview.test.tsx`
  **8/8**; with `fa-runs-panel.test.tsx`, `register-refresh-siblings.test.tsx` and
  `lib/registers/depreciation.test.ts` in one run **32/32**; `tests/firm-scope-db-pins.test.ts`
  **22/22** (2 failing before the reviewed-barrier entry).
- `apps/web`, WHOLE unit suite once (`node scripts/run-tests.mjs`), final:
  **4853 tests, 4851 pass, 0 fail, 2 skipped**, exit 0. The 2 skips are the pre-existing, unrelated
  `CLARA_LIVE_SUPABASE_AUTH_URL` / `…ANON_KEY not configured` live-provider skips in
  `components/entry/…`. An earlier whole-suite run showed one unrelated red,
  `components/journals/journal-entries-table.test.tsx` "clicking a sortable header FLIPS the order"
  — re-run alone it is **17/17**, and it is green in the final whole-suite run; recorded as a flake,
  not fixed.
- `pnpm typecheck` (repo root): clean, twice.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it): **exit 0**, twice.
- `apps/web/e2e/depreciation-walk.spec.ts`, the WHOLE file, on the lane-04 Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531
  CLARA_E2E_RUNTIME_PORT=3532`): **5/5 pass**, twice (once for the statement, once after the answer
  control was added). The fifth cell is the keyboard / 320px / 200%-zoom / axe scan cell, so the
  new controls are covered by the accessibility scan.
- No known Windows-only red was hit, and none was "fixed".

## Docs updated, in the same commits

- `CONTEXT.md` — new **Closed-year arrears resolution** term (house "term / _Avoid_" shape),
  carrying the IAS 8 basis and the owner's correction of 0227's "ordinary accounting treatment".
- `packages/db/README.md` — new `## 0279` section: the ruling, what it installs, why the figure is a
  prefix difference, the two renderings of one guard, the deliberately untouched agent lane, the
  redo-safety shape and the frontier gate.
- `packages/runtime/README.md` — the FA belt's fourth outcome, beside the #651 passage that says the
  belt "needed NO change".
- `apps/web/lib/registers/depreciation.ts` — the two new types and the door wrapper document the
  refusal axes; `FaSkippedClosedPeriod`'s doc comment no longer says the arrears "are charged by the
  next OPEN period's run" without qualification.

## Successor contract — `packages/runtime/lib/depreciation-run.ts` (FROZEN) and `chatTurn.v21`

`packages/runtime/lib/depreciation-run.ts` is in `frozen-workflows.json` (line 54) and
`chatTurn.v21.tools.ts` imports it, so **nothing here was edited**. What the next cut
(`chatTurn_v22`, the shared cut at the end of wave 4) must wire:

1. **Two rows in `DEPRECIATION_REFUSAL_MESSAGES`**, keyed on `code:reason:axis` exactly as the
   existing `period_closed` row is (`refusalKey` already supports the axis):
   - `"CLR38:arrears_resolution_required:closed_year_arrears"` →
     *"Part of this charge belongs to a financial year that is closed. Under IAS 8 that is folded
     into this period only if it is immaterial; if it is material it is restated in that year
     instead. That judgement is the accountant's, not mine — the refusal names the amount and the
     year, and it is answered on the Fixed assets page."*
   - `"CLR38:arrears_awaiting_reopen:closed_year_arrears"` →
     *"That year's arrears were judged material and are to be restated in the year they belong to.
     The year is reopened first, through its own formal path, and the period is then run there."*
   Both are refusals `clara._fa_run_period_core` actually raises, so neither is a forward-looking
   row. (**FIX ROUND, ADV-L04-3 / SPEC-975-1:** the claim below that the door's own message
   "already carries the amount, the year and both resolutions" was true only with ONE closed year
   — with more than one the sentence quoted the client-wide TOTAL beside a single year's label,
   and the record door then refused that very number. Migration 0281 states the named year's own
   amount everywhere and ships the total under `total_arrears_cents`; the fall-through is correct
   again, and now correct for any number of years.) Until they are added, `refusalSentence` falls
   through to the door's own message VERBATIM,
   which is correct behaviour and already carries the amount, the year and both resolutions.
2. **`DepreciationRunReceipt` gains the parked shape.** `periods[].result` may now carry
   `status: "parked"` with `reason: "arrears_resolution_required" | "arrears_awaiting_reopen"`,
   `arrears_cents: number`, `fiscal_years: Array<{fiscal_year_id, fy_label, fy_status, fy_starts_on,
   fy_ends_on, arrears_cents, resolution}>`, `resolutions: ["fold_current","reopen_prior"]`,
   `chosen: null | "reopen_prior"` and `remedy`. A successful result may carry
   `arrears_folded: null | Array<{fiscal_year_id, fy_label, arrears_cents, choice, resolution_id,
   decided_by, decided_at}>`. `still_due` gains
   `closed_arrears: {arrears_cents, fiscal_years: […]}` beside its existing `skipped_closed`.
3. **`runSummary` must render a parked period as a question, not as a status word.** Today its
   `verb` falls through to the raw status, so a parked period reads "…: parked 0.00 across 0 charge
   row(s)." The successor should say, for each parked period: *"{period}: nothing was charged. RM
   {arrears} of this charge belongs to financial year {fy_label}, which is closed. Whether that is
   immaterial (folded into this period) or material (restated in that year) is the accountant's
   judgement under IAS 8, and it is recorded on the Fixed assets page."* — and, on
   `arrears_awaiting_reopen`, that the year must be reopened first.
4. **NO new tool, and that is deliberate.** `clara.record_fa_arrears_resolution` is
   `_human_ctx`-floored at bookkeeper and `clara_runtime` holds **no** EXECUTE on it (asserted in
   0279's §T.2f and in `rig-meta.mjs`'s cohort), because materiality is a professional judgement
   under IAS 8. Clara may state the question and point at the surface; she may never answer it.
   `depreciationRunDoorArgs`, `localRunRefusal`, `stableOpKey` and the door call
   `select clara.run_depreciation_period_for($1::uuid, $2::date, $3::text, $4::uuid)` are unchanged
   in name, argument order and part kind (`freeform_result`; depreciation still mints no
   `accounting_work.purpose`).
5. **Prompt stanza** for the parked case: *"When a depreciation run comes back parked because a
   closed financial year's arrears have not been judged, say the amount and the year, say that IAS 8
   makes folding lawful only where the omission is immaterial and requires restatement where it is
   material, say that the judgement is theirs, and point them at the Fixed assets page. Never
   suggest a figure, a threshold or an answer."*

Nothing else is owed: the human surface (the run preview's two controls) already reaches the door,
so the capability is not dark while the chat lane waits for its cut.

## Follow-ups worth filing

1. **`clara._agent_depreciation_catchup_core` has the same loop and was deliberately not recut.**
   Its wake source `close_prep` is registered-and-disabled (0133:915-917, re-asserted 0138:2939-2941,
   0223:247-248 and 0227 §I T.10), so this lane could not drive it, and wave 3's own rule is that a
   door's behaviour is asserted only after it was driven. Its safety property holds regardless — it
   runs under the verb `run_depreciation_period`, so it parks and never posts; what it loses is a
   quiet receipt, twelve dedupe replays of one parked answer per wake. Worth one line in whichever
   ticket finally unparks that lane. 0279's tail pins its body unmoved so the omission is visible.
2. **The authority floor (#651's D8) folds months forward with nobody asked, exactly as the closed
   year used to.** `_fa_oldest_unmet_period` skips a period below `authority_from` and the next
   open period's charge still carries its months. This ticket's ruling is about closed YEARS; the
   same question ("who said this may ride forward?") is arguably owed for the floor, and the
   machinery (`clara.fa_arrears_resolutions`, `clara._fa_closed_arrears`) would extend to it.
   Out of scope here by the brief's own "Out of scope" list, but worth a ticket.
3. **A reopened year's arrears are silent about the record.** When a `reopen_prior` record exists
   and the year is then reopened, the question simply stops being asked (the year is no longer
   closing/closed, so `_fa_closed_arrears` reports nothing). The record stays live and unreferenced.
   That is correct but slightly lossy: a run receipt in the reopened year does not name the ruling
   that sent it there. A `restated_under` field on the run receipt would close it.
4. **The riders scratchpad is shared between lane workers.** My ad-hoc query helper
   (`…/scratchpad/q.mjs`) was overwritten mid-session by lane 06's worker with a script pointed at
   `clara_l06:55746`, and two verification reads went to the wrong database before I noticed. No
   result in this report depends on it (see "Anything unverified"), but the next wave's RIG.md
   should say: name ad-hoc scripts per lane. A stray `types.py` in the same directory also shadowed
   the Python stdlib for one call.

## Anything unverified

- **The scratchpad incident, bounded.** Two ad-hoc reads (a `schema_migrations` listing) went to
  `clara_l06` before I caught it; both were re-run against `clara_l04` with a uniquely named script
  and are reported above. Nothing else depended on that helper: every migration apply/redo ran
  through `packages/db/scripts/migrate.mjs` under `PGDATABASE=clara_l04 PGPORT=55744`, every test
  ran under the same environment, and `dump.mjs` (which produced the pre-images) is intact and
  hardcodes `127.0.0.1:55744/clara_l04` — confirmed by reading it after the fact. The pins are
  independently corroborated by 0279's own prestate loop passing on `clara_l04` at its genuine
  first apply.
- **The agent catch-up lane was not driven** (point 1 above). I assert nothing about its behaviour,
  only about its body being unmoved.
- **`clara.reopen_fiscal_year` was not driven.** The cells walk the fiscal year to `reopened`
  through the one lifecycle edge `clara._tf_fiscal_years_lifecycle` admits
  (`closed -> reopened`) — labelled fixture DML, the same idiom `depreciation-history-fixtures.mjs`
  uses for `closing`/`closed` and for the same reason. What is asserted is what the FA lane does
  once `clara.fiscal_years.status` says `reopened`, not what the reopen ceremony does.
- **A true from-scratch chain is the integrator's job.** What a lane can prove — that 0279 applies
  from this lane's own 269-file frontier, and that its FINAL prestate passes its FIRST-APPLY branch
  against the restored pre-images — is proven above.
- **Hosted states were not exercised.** Only the seeded `clara_l04` rig was used. A real firm may
  have closed years with rows this rig does not: the data-dependent branch I could enter, I
  entered (a closed year WITH uncharged months, a closed year with none — the `v_after <= 0`
  `continue` — an answered year, a superseded answer, and a client with no fiscal year at all).
- **I did not re-derive `clara._fa_asset_charges`' straight-line/reducing-balance block behaviour
  by reading a second implementation**; the claim that a straight-line block may straddle a fiscal
  year is read off the live body (the FY-boundary flush sits inside the reducing-balance `else`
  branch) and is the reason the prefix-difference shape was chosen. It is a reading of the code,
  not a driven measurement.
