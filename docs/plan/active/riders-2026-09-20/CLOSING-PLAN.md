# Riders closing wave, the plan

The last wave outside the #597 mainline, and the last one of the riders programme. It works the six
follow-up candidates the owner picked out of the sweep wave's own list, together with the two tickets
the sweep filed with its closures. After it, nothing outside the mainline is open.

Planned 2026-09-26 from `main`. The code base is `322fdf291` (the sweep wave, PR #1143); `main`'s tip
is `ffb629d73`, which is `322fdf291` plus six files, all under `docs/` (`git diff --name-only
322fdf291..ffb629d73`). Lane branches are cut from the tip, and every review diffs against it.

Hosted, as released on 2026-09-25: database **337 files / `0361_reservation_release_advice`**, runtime
`refresh-322fdf29`, web `fa2c6c0b-474c-40dc-9f6e-5064a2488a47` (`RIG.md` § Hosted).

## The set

Eight tickets. Six filed 2026-09-26 from `reports/waveS-followup-candidates.md`, each naming its
candidate and the report that measured it; two carried from the sweep wave's closures.

| ticket | one line | source |
|---|---|---|
| **#1147** | the firm standing instruction's three open halves: a chat read door, the plans a withdrawal leaves posting, the deferred-revenue twin with no wake lane | candidates C10, C11, C12; `waveS-lane02-ticket1050.md` follow-ups 2, 3, 4 (#1050) |
| **#1148** | a granted, document-scoped read of the payroll posting verdict | candidate C15; `waveS-lane04-ticket1048.md` §10 follow-up 1, contract in §9.2 (#1048) |
| **#1149** | one errcode catalog: fold the shadowing second map into the first, and give `CLR13` to `CLR43` written meanings | candidates D18, D19; `waveS-lane02-ticket1114.md` follow-ups 1 and 2 (#1114) |
| **#1150** | the shared `:plan` reservation namespace and the third on-behalf plan-creation body, in one pass | candidates D16, D17; `waveS-lane02-ticket1077.md` follow-up 1 (#1077), `waveS-lane08-fix.md` §6 follow-up 1 (#1137), `waveS-merge.md` §11 and §14.2 |
| **#1151** | two intake drills green for the wrong reason: the batch receipt census and the admission terminal drain | candidates E26, E27; `waveS-lane06-fix.md` follow-ups 1 and 2, `waveS-lane06-fix-2.md` follow-up 1 (#1044) |
| **#1152** | paginate the accrual register and send the side filter to the database | candidate E28; `waveS-lane01-fix.md` follow-up 1 and SPEC-03, `waveS-lane01-recheck.json` RECHECK-03 (#1075) |
| **#1144** | the next `chatTurn` and `claraWork` cut: the successor contracts of the sweep wave | filed with the sweep closures |
| **#1145** | the Workflow DevKit schema bootstrap command's durable home in the repository README | filed with the sweep closures |

#1075 now carries a comment linking #1152, which is what `RECHECK-03` asked the integrator to do.

## Lane table

Four lanes. Every lane cuts from `main` at `ffb629d73`. LC is the version cut and is the only lane
that may touch `packages/runtime/workflows`.

| lane | worktree | branch | PG port / db | Playwright triple | theme | tickets in order (migration NEEDED) | adversarial lens | model per ticket |
|---|---|---|---|---|---|---|---|---|
| **L1** | `clara-wt/701` | `riders/wK-lane01` | 55742 / `clara_c01` | 3600 / 3601 / 3602 | the standing instruction and the payroll posting verdict: database plus web | #1147 (yes, **0362**) → #1148 (yes, **0363**) | **yes** | opus, opus |
| **L2** | `clara-wt/702` | `riders/wK-lane02` | 55742 / `clara_c02` | 3610 / 3611 / 3612 | estate consolidation: one reservation namespace, one plan body, one errcode catalog | #1150 (yes, **0364**) → #1149 (no) | **yes** | opus, sonnet |
| **L3** | `clara-wt/703` | `riders/wK-lane03` | 55742 / `clara_c03` | 3620 / 3621 / 3622 | infrastructure: the register's page, the two intake drills, the rig's durable home | #1152 (yes, **0365**) → #1151 (no) → #1145 (no) | **yes** | sonnet, sonnet, sonnet |
| **LC** | `clara-wt/704` | `riders/wK-lane04` | 55742 / `clara_c04` | 3630 / 3631 / 3632 | the version cut: `chatTurn_v23` and `claraWork_v7` | #1144 (no) | **yes** | opus |

### Migrations owed per lane

| lane | migrations | numbers |
|---|---|---|
| L1 | **2** | `0362` (#1147), `0363` (#1148) |
| L2 | **1** | `0364` (#1150) |
| L3 | **1** | `0365` (#1152) |
| LC | **0** | a version cut is runtime only |
| **total** | **4** | overflow block **0380 upward**, held by the orchestrator |

The hosted head is `0361`. **`0351` stays unused**: it was returned to the orchestrator by lane L7 of
the sweep wave (`waveS-lane07-fix.md`) and nothing reclaims it, because a gap is cheaper than a
renumber. Numbering therefore resumes at `0362`, one per ticket that needs one, in lane order. A fix
worker never picks a number; the orchestrator assigns every overflow number on request.

### Why each lane is grouped this way

**L1 is one lane because both tickets add a granted read beside a body that already exists and both
have a web half.** #1147 mints the standing instruction's agent read and edits the withdraw door's
answer; #1148 mints the payroll posting verdict's document-scoped wrapper. Neither recuts a plan body
and neither touches the other's family, so the lane is two independent migrations in order. Both are
opus because both decide what a read may project: #1148 in particular must project the verdict's
sentence and not its whole `rung_vector`, and #1147 must not become an existence oracle for another
firm's row.

**L2 is the consolidation lane and must not overlap L1 or L3.** #1150 rewrites
`clara._obo_plan_core` and `clara._tenancy_plan_core` and moves the remaining nested `:plan`
derivations on the accrual and tenancy doors. That is the body family wave 4 and the sweep wave each
paid for when two lanes wrote it, so it sits alone. #1149 is test-only and is sonnet because it is a
catalog pass with a census, not a design. #1150 runs first because it is the migration.

**L3 is the infrastructure lane.** #1152's migration widens the accrual register's read and deletes
the browser-side narrowing; #1151 fixes two intake drills; #1145 is a README line. #1152 runs first so
the lane database is at its final shape before the intake legs measure anything on it. #1151 wants a
database that carries other firms' data, which `clara_c03` does, being a clone of the sweep wave's
integration replay: that is the exact condition its scoped drain must survive.

**LC is the version cut and runs alone.** See below.

## LC, the version cut, in detail

`chatTurn_v22`, `claraWork_v6` and `statementFacts_v4` are **deployed and locked**:
`frozen-workflows.json` holds **347 entries, every one `deployed: true`** (read on `main` at
`ffb629d73`). LC mints the successors the way `CUT-PLAN.md` minted these, and touches no locked byte.

**What the cut carries** (#1144's own roster, and nothing beyond it):

- **The seven deferred chat tools.** `read_payroll_posting_state`, `read_payroll_settlement_state`
  and `read_agreement_terms` over the now-hosted `0352_agent_read_twins_payroll_agreement.sql` doors;
  `read_tenancy_terms`, `read_rent_settlement_candidates`, `confirm_tenancy_rent_plan` and
  `confirm_tenancy_rent_plan_revision` over `0353_tenancy_agent_twins_obo_confirmations.sql`. All
  seven are named today in v22's own deferral cell, which asserts their absence is a ruling:
  `packages/runtime/tests/chat-turn-v22-tools.test.mjs`, test `v22.roster: the contracts this cut
  DEFERRED are absent BY NAME`. That cell is where the ruling is unwound, and the roster count moves
  from v22's measured **45** to **52**. The amendments in `waveS-lane08-fix.md` §7 supersede the
  ticket reports: the `client_inactive` refusal row and its position in the ladder (7.1), the part
  kind settled as the existing prepayment Work tool's typed result with no new part kind and no
  parity entry (7.2), the stable op key derived from the task id (7.3), and `read_agreement_terms`
  taking `{document_id, client_id}` rather than the document alone (7.4).
- **The fixed-asset proposal input-loading step.** `loadFaProposalInputsStepV6` in
  `packages/runtime/workflows/claraWork.v6.impl.ts` is deploy-locked, so the change lands as
  `claraWork_v7`'s own `loadFaProposalInputsStepV7`, never as an edit to v6. The consolidated contract
  is `waveS-lane05-fix.md` § "Successor contract, the proposal input-loading step", which supersedes
  #1090's, #1092's and #1093's ticket reports where they overlap.
- **One correction to a body being succeeded.** `packages/runtime/lib/prepayment-schedule-basis.ts:119`
  still documents `invalid_author` as "CLR10, and NEVER SHOWN". Migration `0335` moved that refusal to
  `CLR44` and left `CLR10` meaning only a refusal a surface may render
  (`waveS-lane02-ticket1114.md` § Successor contract). The module is inside the frozen closure and
  deploy-locked, so the correction rides the successor copy. If the cut finds the mapping already
  correct in the file it copies, it records that rather than claiming the fix.

**What the cut must NOT do:** no new part kind and no parts-parity entry for the seven tools, both
measured rather than assumed; no edit to any v22, v6 or v4 body or to any deploy-locked path; no
`payrollFacts` cut (#1144 item 3's `payroll.run.employee_count` and `payroll.run.page_count` belong to
that family's own next version and stay on #1144 for the mainline); no removal of any superseded body,
which policy (c) forbids and the boot census refuses.

**The mechanics are `CUT-PLAN.md`'s**, section by section: §2.1 new files per class, with `// @frozen`
on line 1 and unchanged predecessors re-exported rather than copied; §2.2's five registry edits per
class, whose exact textual shapes `packages/runtime/tests/scratch-image.mjs` regex-asserts, so the
two-build drill breaks on a deviation; §2.3's boot pins, including the sixth bundle banner line in
`startWorld.ts` that the last cut shipped without, and `buildInfoRoutes.ts`; §2.4's manifest, where
`--update` is local only, the new files are a free append and the append-only check refuses a rehash
of any deploy-locked path; §2.5's bundle gate and parts parity; §2.9's release obligations.

**A version cut changes the release.** The runbook must carry the two-build cutover drill and step 11a
(`--lock-deployed`), the deploy order (database, then the runtime image by `sha256:` digest, then the
web promotion, with the machine stopped before the migrate), and step 9's rollback preflight run
immediately after step 7 and recorded as a snapshot with its timestamp, because a repointed pin makes
the previous image a stranding target the moment the first non-terminal run of a new body exists.

## Shared files

| file | lanes that edit it | the rule for this wave |
|---|---|---|
| `apps/web/messages/en.json` | L1, L3 | Append your keys at the sorted position inside your own section. Never re-serialize the file. Scan for a duplicate key with an independent scanner, not `JSON.parse`, which drops a second copy in silence. |
| `apps/web/test/manifest.txt` | L1, L3 | One line per new test file, at the sorted position. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | any lane whose migration moves a pinned file | Rule (d) below puts the corpus in your recheck whenever a migration file changed, even a comment. Most static DDL owes no barrier entry; say so with the run rather than assuming it. |
| `packages/db/README.md` | L1, L2, L3 | Your own new `## NNNN` section only. Applied migrations and their sections are immutable; a correction goes in the new file's own section. |
| `packages/db/tests/rig-meta.mjs` | L1, L2, L3 | One cohort entry per migration that mints a new name. |
| `packages/db/package.json` (the `$GATES` list) | any lane adding a preintegration gate | Minimal hunk, sorted position, in migration order. |
| `packages/db/tests/rig-helpers.mjs`, `packages/db/tests/work-journal-fixtures.mjs` | **L2 only** (#1149) | The two errcode catalogs are #1149's whole subject. Another lane that needs a code uses an existing key and edits neither file. 28 modules import the second one. |
| `packages/db/tests/plan-overlap-template-arm-retired.test.mjs` | **L2 only** (#1150) | The `(T.4)` roster entry for `clara._tenancy_plan_core` drops with the body it watched. |
| `packages/runtime/tests/queue-drain.mjs`, `intake-admission-e2e.mjs`, `intake-batch-e2e.mjs` | **L3 only** (#1151) | Three files, one ticket, one lane. |
| `packages/runtime/workflows/*`, `registry.ts`, `plugins/startWorld.ts`, `frozen-workflows.json` | **LC only** | Nobody else touches them, under rule (a). |
| `README.md` (repository root) | **L3 only** (#1145) | One paragraph under "Develop". |
| `CONTEXT.md` | L1, only if #1147 mints vocabulary | House "term / _Avoid_" shape. Say so in the report so the merger can reconcile. |

## The lanes' extra rules

Carried from the sweep wave, with the base and the frozen law updated.

- **(a) The frozen law.** `chatTurn_v22`, `claraWork_v6` and `statementFacts_v4` are deployed and
  locked; all 347 manifest entries carry `deployed: true`. **LC mints the successors; no other lane
  touches `packages/runtime/workflows`, `registry.ts`, `startWorld.ts` or `frozen-workflows.json`.**
  For L1, L2 and L3 the proof is the same as the sweep's: no `packages/runtime` diff to a frozen
  body, no manifest diff, `node scripts/check-frozen-workflows.mjs` clean against the base. Anything
  a frozen tool would need is a "successor contract" section in your report, for a cut after this one,
  because LC's roster is closed to additions.
- **(b) Migration numbers.** Exactly the number assigned to your ticket, one file per ticket, no
  overflow number taken without the orchestrator. `0351` is not reclaimed.
- **(c) Shared bodies and the merge order.** No lane pins a body another lane writes. L1 merges
  first, then L2, then L3, then LC; a later lane re-derives its prestate pins from the earlier lane's
  post-image at integration rather than from its own branch. The three database lanes were grouped so
  that this is a mechanical carry: L1 touches the standing-instruction and payroll families, L2 the
  plan-creation and reservation families, L3 the accrual register's read alone.
- **(d) The web migration-pins corpus.** `apps/web/tests/firm-scope-db-pins.test.ts` is in your
  recheck scope whenever a migration file changed, even a comment, and the run is reported with its
  counts whether or not a barrier entry was owed.

Everything in `WORK-ORDER.md` still binds, including rule 4 (`/tdd` means vertical slices, with the
vacuity control on any cell whose whole deliverable is a test), rule 8's gates with counts, and the
wave-3 addendum's `CI=true GITHUB_ACTIONS=true pnpm lint` before reporting.

## Risks

**1. Four lanes share one PostgreSQL cluster.** All four databases live on `rl02` (127.0.0.1:55742),
because the ports 55772 to 55871 are unreachable on this host and the existing clusters are the ones
we have. Databases are isolated; the **role catalog is not**, and migration `0154` pins the
cluster-wide role count. Mitigation: **no closing-wave migration mints a database role.** None of the
four needs one (they mint doors, not roles). A lane that finds it needs a role stops and tells the
orchestrator before applying. Nobody runs a second from-scratch chain on this cluster; the
from-scratch proof is the integrator's, on a disposable cluster.

**2. LC's drills cannot run on a lane database.** The two-build cutover drill refuses any database
carrying live accounting-Work state and insists on `clara_rt_test` or `clara_wave_b_ci`, and
bootstrapping a World reds `rig-isolation.test.mjs` T10b afterwards (#866). Mitigation: LC works on
the disposable cluster `rigl06ac3` (127.0.0.1:55710), which is still online and holds
`clara_pristine` at 309 files / `0318` plus `clara_intake_ci`. It is migrated forward to 337, seeded,
the World bootstrapped on `clara_wave_b_ci`, and `clara_rt_test` created as a template copy of it,
which is CI's own route. `clara_c04` stays LC's ordinary lane database for everything else.

**3. #1149 rewrites a module 28 test files import.** The fold keeps the exported name and shape, so
no importer changes; but a lane that adds a cell using a key that does not exist would fail in a way
that looks like #1149's doing. Mitigation: #1149 runs after #1150 inside L2, and the census cell it
adds names the missing key rather than reading `undefined`, which is the exact silence this ticket
exists to remove.

**4. #1147 and #1150 both sit near the plan and schedule families.** They do not share a body: #1147
reads the two schedule cores' lane sets structurally and recuts neither, while #1150 rewrites the
on-behalf plan cores and the nested key derivations. The risk is a prestate pin measured on one lane
database that another lane's migration has moved by integration. Mitigation is rule (c) plus the
sweep wave's own practice: every ticket report lists every pinned signature with its sha, and the
merger reads L1's and L2's files against each other rather than trusting either branch's green.

**5. #1147 carries an owner ruling it must not take.** Whether withdrawing a standing instruction
should pause the plans it authorised is a decision #1050 was never given. The ticket makes the
consequence visible and records the question. A worker that changes what withdrawal does to a plan
has widened the ticket.

**6. A version cut makes the release heavier than the sweep's.** Two-build cutover drill, step 11a
`--lock-deployed`, the rollback-preflight snapshot immediately after step 7, and the bundle-banner
trap from the last cut. The release prep must budget for it rather than reuse the sweep's runbook
shape unchanged.

## Preconditions before launch

Measured on 2026-09-26 rather than assumed. What is already true:

- **Worktrees exist and are registered**, cut from `main` at `ffb629d73`: `clara-wt/701`
  (`riders/wK-lane01`), `702` (`riders/wK-lane02`), `703` (`riders/wK-lane03`), `704`
  (`riders/wK-lane04`), each with an install, typecheck and smoke log beside it (`git worktree list`).
- **Four lane databases exist on `rl02` (127.0.0.1:55742)**, cloned from `clara_intS6` with
  `createdb -T clara_intS6 clara_c01 … clara_c04`, and each reads **337 files, max
  `0361_reservation_release_advice`**, the same ledger as `clara_intS6` itself. `clara_intS6` is the
  ordered 337-file chain that gate A proved equal to a from-scratch build, which is why it is the
  template.
- **The disposable cluster `rigl06ac3` (55710) is still online** with `clara_pristine` (309 / `0318`)
  and `clara_intake_ci`.

What launch still owes:

- **Playwright triples**, one per lane, used for every browser walk and never a bare
  `npx playwright test` (it serves a stale build, #865): L1 3600 / 3601 / 3602, L2 3610 / 3611 / 3612,
  L3 3620 / 3621 / 3622, LC 3630 / 3631 / 3632.
- **Database env per lane**, Bash form:
  `export PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_c0<N> CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`.
  Never `CLARA_RIG_ALLOW_RESET`, never `CLARA_RIG_ALLOW_ROLE_SWEEP`.
- **A stale-install check before any lane calls its first failure a defect**:
  `CI=true pnpm install --frozen-lockfile --prefer-offline` from the worktree root, which is
  side-effect-free when nothing was missing (`RIG.md`, and the repository README under "Develop").
- **LC's drill databases** on `rigl06ac3`, per risk 2, built by the orchestrator or by LC's own first
  act with the recipe written into its prompt.
- **A World bootstrap wherever DevKit-backed cells must not skip**:
  `pnpm --filter @clara/runtime exec bootstrap` with `WORKFLOW_POSTGRES_URL` set, on a disposable
  clone rather than a lane database. This is #1145's subject and the reason 22 cells skipped through a
  whole integration merge.
- **The lane prompts** carry: the ticket list in order with its migration number, the model, rules (a)
  to (d) above, `WORK-ORDER.md`, `RIG.md`, and the base commit `ffb629d73`.

## Overflow ledger (assigned by the orchestrator during the run)

| number | lane | purpose | assigned |
|---|---|---|---|
| 0380 … | | the block opens here; nothing taken yet | |
