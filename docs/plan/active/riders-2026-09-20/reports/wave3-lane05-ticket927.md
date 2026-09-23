# Riders wave 3, lane 05 — ticket #927

Retire the 0045 recurring-adjustment template lane (1/3): close the propose, sign and
manual-run doors with typed refusals; Registers → Adjustments becomes read-only history.

Worktree: `C:\Users\zhant\Desktop\clara-wt\655`, branch `riders/w3-lane05`, database
`127.0.0.1:55745/clara_l05`.

**RESUME note.** No earlier implementer had landed or left in-progress work for #927 on this
worktree/branch: `git log ffe63a0dd08..HEAD` before this session showed only #908 (0280) and #909
(0281); `git status`/`git diff` were clean; `clara.schema_migrations` had no `0282_*` row. This
implementer started the ticket from scratch.

## Branch state at hand-off

```
0446b73aa test(e2e): #927 a real-browser walk for the retired Adjustments tab
4a1755b62 test(web): #927 update the adjustments lane's unit tests to the retired shape
8ce2ff304 feat(web): #927 retire the Propose/Sign/Run-now controls from the Adjustments tab
86a04f038 docs(db): #927 record 0282 in the migration README
1a824cae7 test(db): #927 retarget the eight x42-adj batteries at the retired lane's shape
5a3238bde feat(db): #927 close propose/sign/run_adjustment_manual with a typed retirement refusal
9f2320187 feat(db): #909 the plan-overlap advisory gains a sibling-plan arm       (prior ticket)
4fe3873fa feat(db): #908 the shared plan-schedule validator ... yield wall        (prior ticket)
```

Working tree clean after the last commit. Nothing pushed, no PR opened, no other worktree touched.

## The seams tested

- **The three closed doors**, called by their pinned names with named args through the existing
  `x42-adj-core.mjs` wrappers (`proposeTemplate`, `signTemplate`, `runManual`) and, once more,
  directly inside the migration's own tail (`perform clara.propose_adjustment_template(...)` etc.,
  as `clara_fn_owner`, no PostgREST session needed): `clara.propose_adjustment_template`,
  `clara.sign_adjustment_template`, `clara.run_adjustment_manual`.
- **The nine D6-untouched bodies**, re-read live off `pg_proc` by the migration's own §0/§T and
  independently re-exercised by the still-passing battery: `clara.retire_adjustment_template`,
  `clara.reverse_adjustment_pair`, `clara.approve_pair_reversal`, `clara.cancel_pair_reversal`,
  `clara._adj_correction_door` (through its own callers), `clara.list_adjustment_templates`,
  `clara.list_adjustment_runs`, `clara.get_adjustment_run`, `clara.run_adjustment_occurrence`,
  `clara.adjustment_run_due`, `clara._propose_adjustment_template_core`.
- **The web client library's module shape** (`apps/web/lib/registers/adjustments.ts`) — which
  names are exported, asserted both by TypeScript (a removed import fails typecheck) and at
  runtime (a regression-pin test reading the module as an untyped record).
- **The rendered DOM** of `AdjustmentsRegister`, at two altitudes: unit-mounted
  (`adjustments-a11y.test.tsx`, `adjustments-keyboard.test.tsx`, `adjustments-render-states.test.tsx`)
  and a real Chromium browser against the real built Next bundle
  (`e2e/adjustments-retired-walk.spec.ts`, new).

## Acceptance criteria

**1. "A new migration turns propose_adjustment_template, sign_adjustment_template and the
manual-run door into typed refusals (one reason, one message pointing to plans), re-pins the five
0045 door bodies migration 0193 fingerprinted in its own prestate, and carries a prestate that
refuses to apply when any live template exists on the estate."** — DONE.

`packages/db/migrations/0282_retire_adjustment_template_doors.sql`. All three doors now `raise
exception` unconditionally with `errcode = 'CLR10'`, `detail.reason =
'adjustment_template_lane_retired'` (the ONE token all three share) and a message naming the
specific verb, ending "create an accounting plan instead (Client → Plans)". §0 pins the five
0193-fingerprinted bodies (`propose_adjustment_template`, `sign_adjustment_template`,
`retire_adjustment_template`, `run_adjustment_occurrence`, `adjustment_run_due`) by
`sha256(prosrc)` measured on `clara_l05` now, redo-tolerant for the three this file recuts
(recognises either the measured pre-#927 pre-image or its own prior output). The live-template
guard (`select count(*) from clara.adjustment_templates where status <> 'retired'`) is real and
was measured firing: `clara_l05` carried ten leftover `status='live'` rows from #909's own rig
fixture (`plan-overlap-sibling-arm.test.mjs`, direct-`INSERT`ed, never cleaned up) — retired by
hand through the still-open `retire_adjustment_template` door (evidence: `retired_reason = '#927
lane cleanup: retire stray #909 rig fixtures ...'` on all ten rows, verified by a direct query
before re-applying), which is the guard's own intended remedy. Applied clean afterward:

```
[notice] #927 prestate: clean -- propose_adjustment_template/sign_adjustment_template/
run_adjustment_manual are all at their measured pre-#927 pre-image (a fresh apply), every 0045
body this file does not touch is byte-identical to its measured pre-image, and zero
clara.adjustment_templates rows are non-retired.
[notice] #927 tail: OK -- ... each raise CLR10 detail.reason=adjustment_template_lane_retired on
a real call, keep their exact pre-#927 owner/SECURITY DEFINER/search_path/ACL, and every 0045 body
this file does not touch ... is byte-identical to its measured pre-image.
applied 0282_retire_adjustment_template_doors · backend pid 622501
```

Test evidence: `x42.t1`/`x42.t2`/`x42.t3` in `x42-adjustments.test.mjs` (below) each drive the
door for real and assert the reason.

**2. "The correction door, the reversal-pair door and every read of the three 0045 relations are
byte-unchanged (tail census re-reads them)."** — DONE.

Migration §T re-reads all nine bodies (list above) by `sha256(prosrc)` and refuses if any moved;
all nine passed. Behavioural re-proof: `x42-pair.test.mjs` (9/9), `x42-pair-correction.test.mjs`
(9/9) and `x42-adj-reads.test.mjs` (4/4) all still pass unedited in their own logic (only their
fixture's *construction* changed — see AC4).

**3. "The Registers → Adjustments tab renders history read-only with the retirement notice; the
propose, sign and manual-run controls and their dialogs are gone; the client library for the lane
no longer exports the three writers."** — DONE, with one scoping decision recorded.

`apps/web/components/registers/adjustments-register.tsx` renders a `StateBanner` retirement notice
("This lane is retired. Set up recurring or reversing entries as an accounting plan instead
(Client → Plans).") above the templates list; the section header's Propose action and the per-row
Sign control are gone; `AdjustmentRunHistoryPanel` no longer receives (or renders) `onRunNow`.
`ProposeTemplateDialog`/`SignTemplateDialog` are deleted from `adjustment-template-ceremony.tsx`;
`RunNowDialog` is deleted from `adjustment-run-history-panel.tsx`; `adjustment-lines-editor.tsx`
(ProposeTemplateDialog's only caller) and its test are deleted outright.
`apps/web/lib/registers/adjustments.ts` no longer exports `proposeAdjustmentTemplate`,
`signAdjustmentTemplate` or `runAdjustmentManual` (nor their line-input/result types) — a
regression-pin test (`adjustments.test.ts`) asserts all three are `undefined` on the module.

**Scoping decision, recorded rather than silent**: `retire_adjustment_template` and the
`reverse_adjustment_pair` / `approve_pair_reversal` / `cancel_pair_reversal` ceremony are KEPT
visible and actionable in the UI (Retire per row; Reverse/Approve/Cancel on the run-history and
pair-ledger panels), because the ticket's body says explicitly "Correction and reversal-pair doors
... stay exactly as they are (D6 ... in-flight legacy visibility are retained)" and names only
propose/sign/manual-run for control removal. "Read-only history" is read as applying to the
templates/runs lists' now-dead write pipeline, not to the surviving correction machinery — an
in-flight pair reversal a firm needs to approve or cancel would otherwise have no UI path at all.
This reading is also the only one consistent with `adjustments-render-states.test.tsx`'s and
`adjustments-a11y.test.tsx`'s own pre-existing cells (both of which drive the pair-reversal
ceremony's Approve/Cancel and the due banner, unedited, and both still pass).

**4. "The eight x42-adj db batteries and the six web tests for the lane are updated to the
retired shape and stay green; a cell per closed door proves the typed refusal by its reason."** —
DONE.

DB batteries (`packages/db/tests`), each run individually and then all eight together plus the
gate-chain audit — 54/54 passing:

| file | tests | what changed |
|---|---|---|
| `x42-adjustments.test.mjs` | 10 | t1/t2/t3 replaced (dead propose/sign lifecycle tests) with three closed-door cells, one per door; t4 (was t6)/p1/p2/m1/m2/m3/d1 kept, fixture swapped to the machine door; m3's `maker_actor` assertion corrected to the machine-run shape |
| `x42-adj-due.test.mjs` | 3 | fixture swap only |
| `x42-adjustments-stale.test.mjs` | 6 | fixture swap; `racePoster` now races two `clara_runtime` sessions instead of two humans |
| `x42-adj-canon.test.mjs` | 1 | rewritten: proves the retirement refusal fires identically for both admissible line spellings (the omitted-/explicit-zero forms the file used to canonicalise), before ever reaching the canon or the duplicate wall |
| `x42-adj-reads.test.mjs` | 4 | fixture swap; the one `proposeTemplate` call (minting a `proposed` fixture row) replaced with a direct insert |
| `x42-adj-period-double.test.mjs` | 7 | fixture swap only (including cd6's "retire + re-propose", which needed no special handling once `liveTemplate` itself stopped calling propose) |
| `x42-pair.test.mjs` | 9 | fixture swap only |
| `x42-pair-correction.test.mjs` | 9 | fixture swap only |
| `preintegration-gate-chain.test.mjs` | 5 | unedited; confirms the new gate module is correctly wired |

The fixture swap in every "fixture swap only" row: `liveTemplate()` (x42-adj-helpers.mjs) now
mints its row by direct `INSERT` through `clara._adj_canon_lines`/`clara._adj_template_hash`
(SURGERY 5) instead of propose+sign, so every existing cell's assertions are byte-identical to
before; every `runManual(sub, {...})` call that exercised the shared poster/admission law was
swapped to `runOccurrence({...})` (the untouched machine door — both call
`clara._adj_run_occurrence_core`).

Web tests, run together — 23/23 passing:

| file | tests | what changed |
|---|---|---|
| `adjustments.test.ts` | 11 | propose/sign/runAdjustmentManual cells removed; a regression-pin cell added |
| `adjustments-workbench.test.ts` | 1 | unedited — does not touch propose/sign/run-now |
| `adjustments-render-states.test.tsx` | 2 | unedited — does not touch propose/sign/run-now |
| `adjustments-a11y.test.tsx` | 5 | the structural-scan cell repointed from Propose to Retire (the one write left) |
| `adjustments-keyboard.test.tsx` | 4 | Propose template/Run now dropped from the trigger list |
| `adjustment-lines-editor.test.tsx` | (deleted) | its subject is deleted; `test/manifest.txt` updated |

"A cell per closed door proving the typed refusal by its reason": `x42.t1`/`x42.t2`/`x42.t3` in
`x42-adjustments.test.mjs`, each asserting `CLR10` + `detail.reason ===
'adjustment_template_lane_retired'` for `propose_adjustment_template` / `sign_adjustment_template`
/ `run_adjustment_manual` respectively, across multiple roles and (for sign/run) against a real
historical template.

**5. "The migration applies on a from-scratch chain; the firm-navigation walk covers the retired
tab."** — DONE for the walk; the from-scratch half is argued rather than independently re-run (see
Unverified).

The prestate's live-template guard is unconditional and status-only — a from-scratch chain
(0001→0282, no data) carries zero `clara.adjustment_templates` rows and satisfies it vacuously; the
"fresh apply" branch (the only branch a from-scratch chain can take) is exactly what this session's
own apply exercised and logged. Per RIG.md, "the integrator runs the from-scratch proof on a
disposable cluster" — that run itself was not repeated here (see Unverified).

On "the firm-navigation walk": measured (`lib/navigation/tree.ts:382`, #640's own comment) that
the sidebar's "Adjustments" row was repointed to `/clients/:id/plans` when the plan lane shipped,
and `?tab=adjustments` has had **no sidebar entry and no browser-walk coverage at all** since — a
repo-wide grep for `adjustments`/`Adjustments` across `apps/web/e2e` found no existing spec
touching this tab. This is the identical gap `staff-advances-register-walk.spec.ts` (#879) closed
for `?tab=staffAdvances`, and I followed that precedent rather than editing
`firm-navigation-walk.spec.ts` (which never named this tab and still does not — it walks the
sidebar, and this tab is deliberately not a sidebar destination): new
`e2e/adjustments-retired-mock.mjs` + `e2e/adjustments-retired-walk.spec.ts`, registered in
`e2e-fixture-ownership.test.ts`'s `LANE_MOCKS`/`LANE_DECLARATIONS` and wired into
`serve-built.mjs`. Run on this lane's own Playwright triple
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3540 CLARA_E2E_NEXT_PORT=3541
CLARA_E2E_RUNTIME_PORT=3542`), 2/2 passing against the real built bundle: the notice and both
historical rows render; Propose/Sign/Run-now are absent from the DOM (checked on the exact
`proposed`-status row that used to show Sign); Retire submits end to end and the row reflects
`Retired`.

## Gates, with counts

- **Test files added or touched, db** (full gate chain, `$GATES` = every
  `--import ./tests/*-preintegration-gate.mjs` flag from `packages/db/package.json`, run from
  `packages/db`): `x42-adjustments.test.mjs`, `x42-adj-due.test.mjs`,
  `x42-adjustments-stale.test.mjs`, `x42-adj-canon.test.mjs`, `x42-adj-reads.test.mjs`,
  `x42-adj-period-double.test.mjs`, `x42-pair.test.mjs`, `x42-pair-correction.test.mjs`,
  `preintegration-gate-chain.test.mjs` — all together, **54/54 pass**.
- **`operation-census.test.mjs` + `rig-isolation.test.mjs`** (no new SQL function was added — the
  migration recuts three existing bodies on their existing signatures with no new grant — so this
  is not owed by the work-order's own rule, but run anyway as insurance): **32/33 pass, 1 skip**
  (the pre-existing `T19 poison-role` reset-gated skip — `CLARA_RIG_ALLOW_RESET` correctly never
  set, per RIG.md).
- **`pnpm typecheck`** from the repo root: **clean** (`apps/web`, `packages/runtime`; `packages/db`
  has no typecheck script).
- **`pnpm lint`** from the repo root, plain and `CI=true GITHUB_ACTIONS=true`: **clean** both ways
  (one pre-existing, unrelated Windows `SKIP` on a symlink-creation selftest that needs elevation —
  not a fail, not touched by this ticket).
- **`apps/web` whole unit suite once** (`node scripts/run-tests.mjs`): **4838 pass, 0 fail, 2
  skip** (both pre-existing: live-Supabase-auth cells that need env vars this rig does not set).
- **Browser walks touched**: `adjustments-retired-walk.spec.ts` (new) — **2/2 pass** on this
  lane's own triple, against the real built Next bundle. No other `.spec.ts` file was edited.
- **`e2e-fixture-ownership.test.ts`** (registers the new mock; not itself a gate rule names, but
  load-bearing for the new e2e mock's correctness): **44/44 pass**.

Known Windows-only reds from RIG.md: none encountered.

## Migration

`packages/db/migrations/0282_retire_adjustment_template_doors.sql`.

**Prestate pins measured on `clara_l05` (281 migrations, `0001->0281`, 2026-09-21/23), before this
file existed:**

| body | sha256(prosrc) |
|---|---|
| `clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)` | `1319ba44fe95000588c117b447125ed93751eb85884997a8f34ddc5e6e3c7cd5` |
| `clara.sign_adjustment_template(uuid,uuid,text)` | `e7ace43b004328179f061be342aa1edb95766990688cff582e79e947388c2dff` |
| `clara.run_adjustment_manual(uuid,uuid,date,date,text)` | `45c4546994c72db572645743afca2900f7eacf9b48da134168a64b9715f1edc6` |
| `clara.retire_adjustment_template(uuid,uuid,text,text)` (non-regression) | `66a113f25326aeb8e66f090d5a58f1a3ef5f7a41cbd794321b4d5ae0007d8b45` |
| `clara.run_adjustment_occurrence(uuid,uuid,date,date,text)` (non-regression) | `d61707e27aa431cc3b01727ab94a29c7026528e1813fac65bb8a2c21c5a8b252` |
| `clara.adjustment_run_due(uuid)` (non-regression) | `f01e9e403a733b7320218de563115cf4c8df97f90f31527c27226e8f8d126052` |
| `clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)` (non-regression) | `b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810` |
| `clara._adj_correction_door(uuid)` (non-regression) | `5b22b62819fe01007fa0d389efa5751825c0374690a28e3eb0a3805197793e52` |
| `clara.reverse_adjustment_pair(uuid,uuid,text,text)` (non-regression) | `f167cab16f5c77a4ec5f3d42f0ff489dcb41c1f4c10b3c6e95452004965f8580` |
| `clara.approve_pair_reversal(uuid,uuid,text,text)` (non-regression) | `5fa46ad5ca2ab11f3a7e647e4bb56791c70dc39d2a178f2f9358b3538ae50d9d` |
| `clara.cancel_pair_reversal(uuid,uuid,text,text)` (non-regression) | `ad7e0fc6ebeedb0f56caddab56b2899f1a232d041ec232351d801dad54881192` |
| `clara.list_adjustment_templates(uuid)` (non-regression) | `97cabd66390478e92a3b11b2349e93dd906d0abf3c7be927b6d597b419f875ff` |
| `clara.list_adjustment_runs(uuid)` (non-regression) | `197872e84d54a51bd36b3f523c812d626858fc9af51e2d8f8c929f4cc63fc93f` |
| `clara.get_adjustment_run(uuid)` (non-regression) | `ff75553cab62a787e03ddd59a11f98843088b086ced55261b30693105c758ac3` |

Applied via `pnpm db:migrate`; `clara.schema_migrations` reads 270 total, max
`0282_retire_adjustment_template_doors`. Redo-tolerant (#957) for the three recut doors; not
exercised via `CLARA_MIGRATION_REDO` in this session because no post-landing edit was needed.

**Rig cleanup performed before the migration would apply**: ten `status='live'`
`clara.adjustment_templates` rows on `clara_l05`, born 2026-09-20 as direct-`INSERT` fixtures in
`plan-overlap-sibling-arm.test.mjs` (#909's own battery), never cleaned up by that file. Retired by
hand through `clara.retire_adjustment_template` (reason: `"#927 lane cleanup: retire stray #909
rig fixtures (Rig combo/overlap template rows) that never had cleanup, so migration 0282 prestate
(no non-retired template) can apply on clara_l05"`), verified by re-query before the migration was
applied. This is rig-local housekeeping, not a data migration this ticket owns — recorded here so
a later reader of `clara_l05` is not surprised by ten retired rows with this reason string.

## Docs

- `packages/db/README.md` — new `## 0282 — the 0045 recurring-adjustment template lane's three
  human-write doors close (#927)` section, matching the house shape (`Context.` /
  `What NNNN does.` / the prestate-guard note / the D6-survivor note / `Prestate/tail.` /
  `What NNNN does not do.`).
- In-file header comments updated in every touched source file (`adjustments.ts`,
  `adjustments-register.tsx`, `adjustment-template-ceremony.tsx`,
  `adjustment-run-history-panel.tsx`, the migration itself) — this codebase's convention in place
  of a per-module `README.md` (none exists for `apps/web/lib/registers` or
  `apps/web/components/registers`).
- `CONTEXT.md` deliberately NOT touched: its two "avoid — a recurring adjustment template as a
  synonym" lines remain accurate (the class of thing still exists historically; only its creation
  path closed), and #929's own acceptance criterion is to overwrite that vocabulary once the whole
  lane is gone — doing it here would be #929's work under #927's ticket.

## Successor contract

None. This ticket touches no frozen chat/Work tool surface. The agent-lane prepayment limb
(`clara._agent_prepayment_schedule_core`, 0140, and its own `prepayment_schedule_v1` tool) calls
`clara._propose_adjustment_template_core` directly — never through the human
`propose_adjustment_template` door this file recuts — and is pinned byte-unchanged in the
migration's own prestate/tail. Nothing here needs a name, a zod input, a door call, a refusal
mapping, a part kind or a prompt stanza handed to a frozen surface.

## Follow-ups worth filing

- `packages/db/tests/x42-0045-b2-upgrade.test.mjs` (RESET-GATED — `CLARA_RIG_ALLOW_RESET=1` only,
  never set by this session, per RIG.md — and **not** one of this ticket's eight named batteries)
  still drives `propose_adjustment_template` / `sign_adjustment_template` / `run_adjustment_manual`
  directly at its own "headline smoke" tail (lines 96-156) as proof the whole D-b unit composes on
  a populated book. Its own `migrate({ dir: MIG_DIR })` applies the WHOLE current migrations
  directory (not a bounded 0042-0045 subset), so once 0282 sits on the chain that drill runs
  against, that tail will fail exactly the way `x42-adjustments.test.mjs`'s old t1/t2 used to.
  Out of `#927`'s own named scope (it names "the eight x42-adj db batteries", not this reset-gated
  drill); flagged rather than fixed, so #928/#929 or a dedicated follow-up can retarget it the same
  way this ticket retargeted the eight.
- #928 (retire the daily runtime sweep) and #929 (drop the plan-overlap advisory's now-dead
  template arm; rewrite `CONTEXT.md §Accounting plan/Prepayment schedule`, `ARCHITECTURE.md §6`,
  `PRD.md §69/§72`; close #788) are next in this lane's own three-ticket plan.

## Anything unverified

- The from-scratch chain apply (0001→0282 on a disposable cluster) was **not** independently
  re-run in this session — RIG.md: "Lanes never need it: the integrator runs the from-scratch
  proof on a disposable cluster." Argued instead from the guard's own construction (status-only,
  vacuously true with zero rows) and from this session's own "fresh apply" branch having actually
  fired and logged on `clara_l05`.
- The `#957` REDO path (`CLARA_MIGRATION_REDO=0282_retire_adjustment_template_doors`) was not
  exercised — no edit to 0282 was needed after it first landed, so there was nothing to redo over.
  The prestate's redo-recognition branch is therefore unverified by direct trial, only by reading.
- Hosted/production behaviour: not touched, not checked — this session worked entirely against the
  lane's own rig (`clara_l05`, 127.0.0.1:55745).
- The "read-only history" vs. "Retire/reversal-pair ceremony stays actionable" reading (AC3) is a
  judgment call, recorded above with its reasoning; a reviewer who reads "read-only" more literally
  should flag it before this lane closes.
