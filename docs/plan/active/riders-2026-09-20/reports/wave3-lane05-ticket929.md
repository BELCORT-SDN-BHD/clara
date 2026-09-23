# Riders wave 3, lane 05 — ticket #929

Retire the 0045 recurring-adjustment template lane (3/3): blueprint and vocabulary say one lane;
plan-form advisory drops its template arm; close #788.

Worktree: `C:\Users\zhant\Desktop\clara-wt\655`, branch `riders/w3-lane05`, database
`127.0.0.1:55745/clara_l05`.

**RESUME note.** No earlier implementer had landed or left in-progress work for #929 on this
worktree/branch: `git status` was clean and `git log ffe63a0dd08..HEAD` before this session showed
only #908 (0280), #909 (0281), #927 (0282) and #928 (no migration). This implementer started the
ticket from scratch.

## Branch state at hand-off

```
72c2c6891 docs: #929 retire the 0045 vocabulary from CONTEXT.md
8d4fd421b feat(web): #929 stop describing the retired 0045 template arm
1aab5e06d test(db): #929 retarget the sibling-arm and p640.schedule.overlap batteries
f7167572a feat(db): #929 retire the plan-overlap advisory's 0045 template arm
f0b037263 docs(runtime): #928 record the 0045 adjustment sweep's retirement      (prior ticket)
ba076e6fb feat(runtime): #928 retire the 0045 daily adjustment sweep ...         (prior ticket)
0446b73aa test(e2e): #927 a real-browser walk for the retired Adjustments tab    (prior ticket)
4a1755b62 test(web): #927 update the adjustments lane's unit tests ...          (prior ticket)
8ce2ff304 feat(web): #927 retire the Propose/Sign/Run-now controls ...          (prior ticket)
86a04f038 docs(db): #927 record 0282 in the migration README                    (prior ticket)
1a824cae7 test(db): #927 retarget the eight x42-adj batteries ...               (prior ticket)
5a3238bde feat(db): #927 close propose/sign/run_adjustment_manual ...           (prior ticket)
9f2320187 feat(db): #909 the plan-overlap advisory gains a sibling-plan arm     (prior ticket)
4fe3873fa feat(db): #908 the shared plan-schedule validator ... yield wall      (prior ticket)
```

Working tree clean after the last commit. Nothing pushed, no PR opened, no other worktree touched.
This is the LAST ticket in lane 05's own three-ticket 0045-retirement plan and the lane's own
final ticket overall (#908, #909, #927, #928, #929 all now landed on this branch).

## The ticket is the contract — the newest Agent Brief

`gh issue view 929 --comments` showed the body's own AC set superseded by a single triage
correction comment (checked on `main` at `dc9acfe1`, dated during this wave), which I treated as
the newest and only live Agent Brief per work-order rule 2. It made four corrections:

1. **AC1's PRD clause does not hold** — `docs/PRD.md` has zero occurrences of "template"/模板;
   dropped. Re-verified in this session (`grep -c` = 0, unchanged).
2. **CONTEXT.md may be edited here; ARCHITECTURE may not** — CONTEXT.md is a shared surface
   tickets write directly; `docs/ARCHITECTURE.md:500` is recorded as a blueprint-drift line
   addressed to #683, not edited.
3. **C08.1 is the nested-obligation row this retirement disposes of** — recorded below, addressed
   to #683.
4. **#788 is already closed, and #909's comment already records its cross-lane-moot/sibling-plan
   halves** — both AC3 requirements pre-satisfied; nothing to do.

The corrected "Remaining scope" is what this report tracks against.

## The seams tested

- **`clara._plan_overlap_warning(uuid,jsonb)`** — the shared advisory function, reached through
  `clara.create_accounting_plan`, `clara.revise_accounting_plan` and `clara._accrual_plan_core`
  (all three re-driven, never recut).
- **The migration's own prestate/tail** — `sha256(prosrc)` pins on the function itself and on the
  three callers, re-read live off `pg_proc`.
- **`CONTEXT.md`'s two `_Avoid_` lines** (Accounting plan, Prepayment schedule sections).
- **The three plan-form TypeScript contracts and their i18n copy**
  (`lib/{plans,accruals,prepayments}/api.ts`, `messages/en.json`'s `overlapTitle`/`overlapBody`
  keys in the `plans`/`accruals`/`prepayments` namespaces) — read-only confirmation that
  `plan-form.tsx`/`accrual-form.tsx`/`prepayment-form.tsx` branch on neither `kind` nor
  `template_id`, so no component code needed to change.

## Acceptance criteria (corrected "Remaining scope")

**1. "`CONTEXT.md:38` and `:69` no longer describe recurring-adjustment templates as a live
mechanism; each line is edited in place, not appended."** — DONE, at the CURRENT line numbers.

The ticket's own line numbers (38/69) were measured on `main` at `dc9acfe1`; on this branch, after
#977's own CONTEXT.md insertion earlier in the file, the same two `_Avoid_` lines sit at **65** and
**97** (re-measured with `grep -n` before editing, not transcribed from the ticket). Both are
edited in place — the `_Avoid_` line's OWN text is rewritten, no line appended elsewhere:

- **Accounting plan** (line 65): `_Avoid_: A recurring adjustment template as a synonym; ...` →
  `_Avoid_: A recurring adjustment template — the 0045 template lane was retired 2026-09-18 (#788,
  delivered by #927–#929); this is the one mechanism for recurring accounting from here on. A
  preference, ...`
- **Prepayment schedule** (line 97): same retirement clause substituted in place of "as a synonym".

Verified: `grep -n "recurring adjustment template" CONTEXT.md` → both lines now carry the
retirement clause; no other line in the file was touched. Commit `72c2c6891`.

**2. "The closing report carries the `ARCHITECTURE.md:500` blueprint-drift line (quoting the
sentence) and the C08.1 disposition, both addressed to #683; neither blueprint is edited here."**
— DONE, here:

**Blueprint drift, for #683.** `docs/ARCHITECTURE.md:500` (re-verified at this exact line on the
current branch, unmoved) reads:

> 会计计划的建立／修订／补提以 bookkeeper 为下限，不复制 0045 调整模板的两签仪式——两条 lane 是不同产品
> （owner 2026-09-15 确认，#790）；

This stops being true now that #927 (doors closed), #928 (sweep retired) and this ticket (the
advisory's own template arm gone) have landed: there is no longer a second lane — "两条 lane 是不同产品"
("the two lanes are different products") describes a state that no longer exists. §683's blueprint
sync should replace this bullet with a line stating the plan lane is the ONE mechanism for
recurring accounting (mirroring `CONTEXT.md`'s own new `_Avoid_` wording above), and should audit
`docs/ARCHITECTURE.md` more broadly for any other 0045-lane reference this ticket's own grep did
not target (its scope was this one line, cited by the ticket itself).

**C08.1 disposition, for #683.** C08.1 is the "Adjustment-template panel" nested-obligation row
(`docs/plan/active/refresh-2026-09-08-audit-nested-obligations.md:60`). #652 closed its locating
half on the accruals route; #653 left it **partial** because `adjustment_templates.schedule`
(0140:660) stays unrendered and the 0045 register was untouched at the time. This lane's three
tickets **dispose of the residual instead of building the surface it named**: #927 made the
register read-only history (no more schedule to render as live); #928 removed the runtime sweep
that would have advanced it; this ticket removes the last live consumer
(`_plan_overlap_warning`'s scan). C08.1 should be marked **retired-by-disposition** in #683's own
nested-row census, not "still open, still needs a rendered surface" — there is no longer a live
0045 schedule for any surface to render.

Neither `docs/ARCHITECTURE.md` nor `docs/PRD.md` was edited by this ticket (confirmed:
`git diff ffe63a0dd08..HEAD -- docs/ARCHITECTURE.md docs/PRD.md` is empty).

**3. "`_plan_overlap_warning`'s template arm is retired in a new migration (prestate pin); the
plan forms render only the sibling-plan advisory (#909's arm); plan-form cells updated."** — DONE.

`packages/db/migrations/0283_retire_plan_overlap_template_arm.sql` recuts
`clara._plan_overlap_warning`: 0281's own ARM 1 (the `clara.adjustment_templates` scan, `UNION
ALL`ed) is deleted outright; 0281's ARM 2 (the sibling-plan scan) survives verbatim, unindented.
`kind` collapses from a two-branch `case` to the single literal `'accounting_plan_overlap'`. No
signature change, no new relation, no new door, no data migration.

Prestate pins (`sha256(prosrc)`, measured on `clara_l05`, 282 migrations, `0001→0282`,
2026-09-23, before this file existed):

| body | sha256(prosrc) |
|---|---|
| `clara._plan_overlap_warning(uuid,jsonb)` (0281's own two-arm output) | `33b23167bf67f911a13b7523a4eb109e406ec2a10367b444c687d2461abc1e0b` |
| `clara.create_accounting_plan(...)` (non-regression) | `84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4` |
| `clara.revise_accounting_plan(...)` (non-regression) | `87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f` |
| `clara._accrual_plan_core(...)` (non-regression) | `b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8` |

Applied clean (fresh-apply branch):

```
[notice] #929 prestate: clean -- clara._plan_overlap_warning is at its measured pre-0283
pre-image (0281's own two-arm output) , and clara.create_accounting_plan /
clara.revise_accounting_plan / clara._accrual_plan_core are all untouched at their own measured
pre-images.
[notice] #929 tail: OK -- clara._plan_overlap_warning's 0045 template arm is retired
(adjustment_template_overlap and clara.adjustment_templates both absent from prosrc); the
sibling-plan arm (#909) is the ONLY arm left, unmoved; ...
applied 0283_retire_plan_overlap_template_arm · backend pid 645198
migrate: 1 new migration(s) applied · 271 total · target 127.0.0.1:55745/clara_l05
```

**"Plan forms render only the sibling-plan advisory; plan-form cells updated."** Read
`plan-form.tsx`, `accrual-form.tsx`, `prepayment-form.tsx` before touching anything: all three read
only `overlap_warning.templates.map((x) => x.name)`, none branches on `.kind` or `.template_id`
(0281/#909's own header claim, re-verified true here) — so **no component code changed**. What DID
need updating, and did:

- `lib/plans/api.ts`, `lib/accruals/api.ts`, `lib/prepayments/api.ts` — the `PlanOverlapWarning`-
  shaped types keyed `templates[]` items by `template_id`, the retired arm's own field. Corrected
  to `plan_id` (the only field the real backend can answer from here on); `kind` kept as a loose
  `string` deliberately (comment explains: a stale client build reading an older server's
  `"adjustment_template_overlap"` payload still typechecks, and the forms never branch on it).
- `messages/en.json` — `overlapTitle`/`overlapBody` in the `plans`, `accruals` and `prepayments`
  namespaces told the firm user "A recurring adjustment template on this client already posts...",
  a claim that can no longer be true after this migration. Reworded to name the real cause (a
  sibling accounting plan) in each section's own voice.
- `accrual-form.test.tsx`, `prepayments-keyboard.test.tsx` — the two test fixtures that hardcoded
  the retired arm's mock shape (`kind: "adjustment_template_overlap"`, `template_id: "t1"`) are
  updated to the realistic post-0283 shape (`accounting_plan_overlap` / `plan_id`), and the one
  assertion pinning the OLD copy string is updated to the new copy.

**4. "The migration applies on a from-scratch chain; the plans walk stays green."** — DONE for the
walk; the from-scratch half is argued, same reasoning #927/#928/#909 all used and RIG.md itself
states ("Lanes never need it: the integrator runs the from-scratch proof on a disposable
cluster").

The prestate carries no data guard at all (unlike 0282's live-template guard) — it only pins
function bodies, which any chain, from-scratch or not, has by the time 0283's own dependency
(0281) has applied. The fresh-apply branch is exactly what this session's own apply exercised and
logged (above).

`plans-walk.spec.ts` on this lane's own Playwright triple
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3540 CLARA_E2E_NEXT_PORT=3541
CLARA_E2E_RUNTIME_PORT=3542`): **9/9 pass**.

## Vacuity control (work-order rule 4)

Same pattern #909/#927/#928 all used: the migration's own prestate/tail assertions cannot be split
into a smaller red-green step (the file has to exist whole for them to make sense), so the
production edit landed first, then the vacuity was proven by hand:

1. Reverted `clara._plan_overlap_warning` to 0281's own two-arm body (hand-applied SQL, both arms
   present, `kind` a two-branch `case`).
2. Re-ran `tests/plan-overlap-template-arm-retired.test.mjs`'s three new cells: **all three failed
   for the right reason** — `p929.template-alone` failed because the reverted body warned when it
   should not have (the assertion error is omitted here for brevity but was a real `overlap_warning
   !== null`); `p929.template-with-sibling` failed asserting `kind === "accounting_plan_overlap"`
   (`actual: 'adjustment_template_overlap'`); `p929.tail` failed asserting the retired kind/table
   tokens were absent (`error: 'the retired adjustment_template_overlap kind is still present'`).
3. Restored via `CLARA_MIGRATION_REDO=0283_retire_plan_overlap_template_arm pnpm db:migrate` — the
   supported #957 redo mode, which correctly took the **redo branch** ("own prior output"), logged:
   `[notice] #929 prestate: clean -- clara._plan_overlap_warning is at its own prior output (a
   #957 redo) ...` and `redone 0283_retire_plan_overlap_template_arm · new checksum
   060996f1...` — recorded per rule 5's own instruction to record a redo use.
4. Re-ran the same three cells: **3/3 pass** (below).

## Gates, with counts

- **Test files added or touched, db** (full gate chain, `$GATES` = every
  `--import ./tests/*-preintegration-gate.mjs` flag from `packages/db/package.json`, run from
  `packages/db`):
  - `plan-overlap-template-arm-retired.test.mjs` (new) — **3/3 pass**.
  - `plan-overlap-sibling-arm.test.mjs` (edited: `p909.combined-with-template` removed,
    `p909.tail`'s two now-false assertions removed, header notes updated) — **6/6 pass** (was 7
    before the removal).
  - `accounting-plans.test.mjs` (edited: `p640.schedule.overlap` retargeted) — **20/20 pass**.
  - All three run together — **29/29 pass**.
- **`operation-census.test.mjs` + `rig-isolation.test.mjs`** (no new SQL function — one existing
  owner-only function recut on its existing signature, no grant change — not owed by the
  work-order's own rule, run anyway as insurance, never with reset flags): **32 pass, 0 fail, 1
  skip** (the pre-existing `T19 poison-role` reset-gated skip, `CLARA_RIG_ALLOW_RESET` correctly
  never set).
- **`pnpm typecheck`** from the repo root: **clean** (`apps/web`, `packages/runtime`).
- **`pnpm lint`** from the repo root: **clean, exit 0**, plain AND `CI=true GITHUB_ACTIONS=true`
  (the wave-3 addendum's own pre-report command) — confirmed `packages/db`, `packages/runtime`,
  `apps/web` and `packages/reporting-render` all ran and passed both ways, including `apps/web`'s
  custom batteries (`check-token-contrast`: all pairs meet WCAG 2.1 AA; `check-test-manifest`: 501
  files listed, all present; `check-message-keys`: 4303 keys resolve — confirms the `en.json`
  copy edits above introduced no missing/stale key).
- **`apps/web` whole unit suite once** (`node scripts/run-tests.mjs`): first run **4837 pass, 1
  fail, 2 skip** (4840 total); immediate re-run **4838 pass, 0 fail, 2 skip**. The one-test
  difference between runs is a flake, not a regression this ticket caused — none of this ticket's
  changed files are thread/timing-related, and RIG.md documents an established flake in this exact
  shape (`thread-live-clarify.test.tsx`, "load flake under the whole-suite run (re-run alone,
  report both)"). I could not isolate which specific test failed on the first run from the tail
  alone (see Unverified); the second run's cleanliness is the operative evidence.
- **Browser walks touched**: `plans-walk.spec.ts` — **9/9 pass** (the ticket's own named walk).
  Also run as insurance (I edited `lib/accruals/api.ts`/`lib/prepayments/api.ts` and `en.json`
  copy in their namespaces, though not their own component or e2e-mock files):
  `accrual-walk.spec.ts` — **14/14 pass**; `prepayments-walk.spec.ts` — **6/6 pass**. All three on
  this lane's own triple.

Known Windows-only reds from RIG.md: none encountered.

## Migration

`packages/db/migrations/0283_retire_plan_overlap_template_arm.sql`. Prestate pins and apply
transcript above (AC3). Applied via `pnpm db:migrate`; `clara.schema_migrations` reads 271 total,
max `0283_retire_plan_overlap_template_arm`. Exercised via `CLARA_MIGRATION_REDO=
0283_retire_plan_overlap_template_arm` once, as this ticket's own vacuity control (recorded above
per rule 5's instruction).

No rig-meta cohort: 0283 mints no new function and grants nothing new (precedent: 0280's and
0281's own comments — this recut, like theirs, changes only an existing owner-only function's
body).

## Docs

- `packages/db/README.md` — new `## 0283 — the plan-overlap advisory loses its 0045 template arm
  (#929)` section, house shape (Context / What 0283 does / Prestate-tail / What stays / What 0283
  does not do), at the end of the file (correctly after `## 0282`, nothing displaced).
- `CONTEXT.md` — both `_Avoid_` lines edited in place (AC1 above).
- `docs/ARCHITECTURE.md`, `docs/PRD.md` — deliberately NOT edited (AC2 above); the blueprint-drift
  line and C08.1 disposition are carried in this report, addressed to #683.
- In-file header comments in the migration itself follow this package's own convention.

## Successor contract

None. This ticket touches no frozen chat/Work tool surface. `_plan_overlap_warning` is reached
only through the three plan-creating doors (all pinned non-regression, byte-unchanged) and is not
itself a door, a tool or a `"use workflow"` module. Nothing here needs a name, a zod input, a door
call, a refusal mapping, a part kind or a prompt stanza handed to a frozen surface.

## Follow-ups worth filing

- **#683 (blueprint sync)**: apply the `ARCHITECTURE.md:500` drift line above (replace the "two
  lanes are different products" bullet) and mark C08.1 retired-by-disposition in the nested-row
  census, per AC2 above.
- **`packages/db/tests/x42-0045-b2-upgrade.test.mjs`** — restated a third time (flagged by #927,
  restated by #928): still reset-gated (`CLARA_RIG_ALLOW_RESET=1` only, never set this session)
  and still drives the now-retired `propose_adjustment_template`/`sign_adjustment_template`/
  `run_adjustment_manual` doors directly at its own "headline smoke" tail against a full
  from-scratch chain that now includes 0282's retirement. Out of every one of #927/#928/#929's own
  named scopes; a dedicated follow-up ticket should retarget or retire it.
- **`en.json`'s `emptyTemplates` key** (`"No recurring adjustment templates for this client."`,
  Adjustments register namespace) and **`rig-meta.mjs`'s `0045 [Wave D-b, SLICE D-b2]` section
  header comment**: both still say "recurring adjustment template(s)" but are OUT of this ticket's
  scope — the first is #927's read-only-history empty state (still accurate: the historical list
  can still be empty), the second is a historical migration-wave label in a permissions ledger, not
  a live-mechanism claim. Flagged for #683 or a future grep-sweep to judge, not touched here.
- A firm-year-end lock check (`fy_end_locked_by_annual_cadence`, `apps/web/lib/close/api.ts` and
  `apps/web/lib/onboarding/settle.ts`) still refuses moving the fiscal year end when "a live
  ANNUAL-cadence adjustment template" exists on the client — a SEPARATE mechanism from
  `_plan_overlap_warning`, never named by #927/#928/#929's own scopes, and not touched here. Since
  no NEW template can ever be created (doors closed by #927) but historical live rows can still
  exist, this lock remains meaningful; whether it should also be retired/rethought is a question
  for whoever eventually retires `clara.adjustment_templates` itself, not this ticket.

## Anything unverified

- The apps/web whole-suite's one-test flake on the first run could not be attributed to a specific
  test name from the tail output alone; only the aggregate counts (4837/1/2 then 4838/0/2) are
  captured. The second run's cleanliness, plus the absence of any thread/timing-shaped file in this
  ticket's own diff, is the evidence for "pre-existing flake, not a regression."
  <br>*(evidence: `apps/web` test run output, this session; RIG.md's own documented
  `thread-live-clarify.test.tsx` flake precedent)*
- The from-scratch migration chain (0001→current) was not independently re-run on a disposable
  cluster — RIG.md assigns that proof to the integrator; this migration's own prestate carries no
  data guard that a from-scratch chain could fail differently on than the fresh-apply branch this
  session's own apply already exercised and logged.
- Hosted/production behaviour: not touched, not checked — this session worked entirely against the
  lane's own rig (`clara_l05`, 127.0.0.1:55745).
- `docs/ARCHITECTURE.md` was read only at and immediately around line 500 and grepped for "0045";
  a fuller audit of the file for OTHER 0045-lane references is #683's own job, not independently
  performed here beyond the one line the ticket cited.
