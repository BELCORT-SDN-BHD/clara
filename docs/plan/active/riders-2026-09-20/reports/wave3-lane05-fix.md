# wave 3 · lane 05 · fix round — #908 #909 #927 #928 #929

- **Branch** `riders/w3-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, database `clara_l05` (127.0.0.1:55745).
- **Base** `ffe63a0dd084e99b84c1368119845be273c421ce`. Everything below is `ffe63a0..HEAD`.
- **Head at review** `72c2c6891`. **NEW HEAD `d8ff391a8`.**
- **Reports answered** `wave3-lane05-codereview-spec.json`, `wave3-lane05-codereview-standards.json`, `wave3-lane05-review-adversarial.json`.

Four commits were added:

| commit | what |
|---|---|
| `44ed4db7b` | `test(db): #927 retarget every OTHER battery 0282's three closed doors drive` |
| `ce1a3f78d` | `fix: #927/#928/#929 the fix round's non-test half — one false claim, one dead end, three residuals` |
| `20546d198` | `chore: #927 clear the three unused bindings the retarget left, and the ticket-number colour trip` |
| `d8ff391a8` | `fix(db): #929 the containment tripwire had a blind spot, and its own sentence was wrong` |

---

## The two blockers

### ADV-L05-01 / L05-SPEC-01 — the landed CI regression — **FIXED**

**Reproduced first, and it was bigger than either review found.** Run from `packages/db` with the
full gate chain against `clara_l05` at 0283: **80 red cells in 15 files**, every one carrying
0282's own `CLR10 adjustment_template_lane_retired`. The spec review found 69 in 13 files and the
adversarial review 33 in six; both missed `f-a4-pr2a-schedule.test.mjs` (10), `x42b2-advances.test.mjs`
(1), and — because neither ran them — `x42b2-s5c-clock.test.mjs` and `x42b2-r7-s5-clock.test.mjs`
(1 each, a different failure: 0282 recut `sign_adjustment_template`'s body to a bare refusal, so the
name left the bare-clock-token roster those two censuses pin).

| file | red before | now |
|---|---|---|
| `x42-r11-lineage` | 18 | 18/18 pass |
| `x42-r10-p1-lineage` | 7 | 7/7 |
| `x42-r10-remedy` | 7 | 7/7 |
| `x42-r8-m1-collision` | 7 | 7/7 |
| `x42-r10-o3` | 6 | 8/8 |
| `x42-r7-class` | 6 | 6/6 |
| `x42-r9-mirror` | 4 | 6/6 |
| `x42-r9-remedy` | 4 | 5/5 |
| `x42-r10-o2` | 2 | 3/3 |
| `x42-r10-p1-recovery` | 1 | 1/1 |
| `f-a4-pr2a-schedule` | 10 | 17/17 |
| `f-a4-pr2a-books` | 4 | 7/7 |
| `f-a4-pr2a-census` | 2 | 10/10 |
| `f-a4-pr2a-wrapper` | 1 | 21/21 |
| `x42b2-advances` | 1 | 1/1 |
| `x42b2-s5c-clock` + `x42b2-r7-s5-clock` | 2 | 4/4 |

**The rule the retarget follows, stated once.** Not one cell was deleted and not one was skipped.
Every cell now asserts the wall that is still LIVE, and every file works at BOTH frontiers — the
head of the chain, and the `0001..0045` copy the weekly `db-slice-frontiers` **d-b2** leg builds,
whose list (`tests/split-lists/test-list-d-b2.txt`) carries a machine-read `#!cells-floor: 168`
that a skip would breach.

- **The poster, the due oracle, the correction door, the storage belts and the books keep every
  assertion they had.** Their fixtures mint the template row directly (`insertTemplateRaw`,
  SURGERY 5 — the idiom #927 already established) instead of through the retired propose/sign
  ceremony. `runManual()` → `runOccurrence()`, the machine door D6 leaves untouched.
- **A cell whose subject IS a door law** — the propose-time advisories, the declaration's own
  validation (forged id, cross-tenant, chain-too-long, not-retired), the op-key replay, the human
  floor, the door-vs-core twin equivalence — asserts the door's retirement above 0282, by its own
  reason token, and runs its original body in full below it. Never a `t.skip`: a skip is not
  evidence, and the d-b2 floor counts passes.
- **Where a door rung and a storage belt enforced one law together**, the cell asserts whichever
  is live: `uq_adjustment_templates_one_successor` / `uq_adjustment_templates_one_live_leaf`
  (SQLSTATE 23505) in place of `template_replaces_already_succeeded` /
  `template_lineage_root_occupied`.

**Two fixture defects found while doing it, both fixed:**

1. `insertTemplateRaw` called `clara._adj_template_hash` with EIGHT arguments. That body has eight
   only from 0140; at 0045 it has seven (`0140:1982` drops the 7-arg form and creates the 8-arg
   one). So #927's own retarget would have failed **every** `liveTemplate` call on the d-b2
   frontier leg. The helper now asks the catalog which arity is live (memoised, one read per
   process).
2. `x42-r11-lineage`'s `r11f` cleanup deleted forged rows in one statement, which cannot remove a
   forged parent and the row pointing at it in one snapshot pass — it left a dangling pointer for
   the `VALIDATE` that follows. It now repeats until the predicate is empty, and the predicate
   matches the FK's composite key rather than the id alone.

`insertTemplateRaw` also gained `name` and `replaces`; `lineage_root_id` is derived off the
predecessor row exactly as 0140's propose core derived it (`coalesce(pr.lineage_root_id, pr.id)`),
read from the database rather than recomputed in JS.

`x42-s5-helpers.mjs` gained `ADJ_TEMPLATE_DOORS_PRE_0282_CLOCK_NAMES`, the file's own house
reverse-gate shape (`begin_chat_turn`'s): `sign_adjustment_template` leaves the roster AT the
`retire_adjustment_template_doors$` stem and is pushed back below it. Measured, not assumed:
neither `propose_adjustment_template` nor `run_adjustment_manual` was ever in that roster.

### ADV-L05-02 — a 0045 template can still be BORN — **REPRODUCED, CONTAINED AND TRIPWIRED; NOT CLOSED**

**Reproduced independently** on `clara_l05` at 0283, inside a transaction that was rolled back:
`select clara._propose_adjustment_template_core('{"firm":…,"actor":…,"client_id":…,"wake_kind":"close_prep"}'::jsonb, …)`
answered `{"status":"proposed","template_id":"4a36caa7-…","content_hash":"1911e4fd…"}` and left one
row at `status='proposed'`; zero rows after the rollback. The path is
`clara.wake_establish_prepayment_schedule` (granted `clara_wake_interactive`, carried in
`clara.wake_fn_allowlist` as `(close_prep, wake_establish_prepayment_schedule)`) →
`clara._agent_prepayment_schedule_core` → that core. Such a row can never be signed (#927), never
be run by hand (#927), never be swept (#928) and is never named by the advisory (#929).

**It is not closed, and that is a decision, not an omission.** Closing it means one of:
deleting the allowlist row, revoking the wrapper's grant, or refusing inside the core. Each one
retires the **agent-lane prepayment capability** — a product act the #788 split did not publish
(its three tickets are the human doors, the sweep, and the vocabulary) — and each one turns the
whole `f-a4-pr2a` battery (≈52 cells across four files, including the `wake12` production-path
fixture) into a retirement battery. Its successor door already exists (`clara.create_prepayment_schedule`,
0223), so the retirement is *doable*; it is a ticket, not a fix round's edit.

**What was done instead, because "record it" is not enough on its own:**

- `tests/plan-overlap-template-arm-retired.test.mjs` gains **`p929.containment`** — the core is
  ungranted, the wrapper is still wired (asserted POSITIVELY, so the cell cannot pass by the limb
  quietly disappearing), and `clara.wake_engine_sources.close_prep.enabled` is `false`. Its own
  **mutant** flips that flag inside a rolled-back transaction and proves the assertion is watching
  something. The failure message names the remedy: *"Retire or reroute that limb at
  clara.create_prepayment_schedule (0223) BEFORE unparking close_prep."*
- The residual is written where the reviewer asked for it, in one sentence each: **0283's header**
  (permanent, shipped prosrc-adjacent record), **`packages/db/README.md`**, and **`CONTEXT.md`**'s
  *Prepayment schedule* `_Avoid_` line ("except for one PARKED agent entrance that still mints one
  and must be retired or rerouted before it is ever unparked").
- **Follow-up worth filing (for the orchestrator, since a lane worker may not write to GitHub):**
  *retire or reroute the agent prepayment limb (`clara.wake_establish_prepayment_schedule`) onto
  `clara.create_prepayment_schedule` (0223), before `close_prep` is ever unparked.* Blocking edge:
  anything that unparks `close_prep`.

**RE-CHECKED AGAINST THE CATALOG, and the containment answer itself had two defects (`d8ff391a8`).**
Taking the fix round's own answer as a subject rather than as a conclusion turned up two faults of
exactly the kind L05-SPEC-04 charged this lane with — a claim in the diff that is false on the
branch. Both are now fixed; the residual itself is unchanged and still open, for the same published
reason.

1. **The tripwire had a blind spot.** `p929.containment` asserted the allowlist by COUNTING the pair
   `(close_prep, wake_establish_prepayment_schedule)`. But `clara.assert_wake_allowed` reads the
   allowlist PER WAKE KIND, so registering the same wrapper under a SECOND kind re-opens the path
   with that count still 1 and the close_prep flag still `false`. `interactive_client` is such a
   kind and it is LIVE — minted from a chat turn by `clara.mint_chat_close_credential` — and
   `clara.wake_engine_sources` holds **no row for it at all**, so the parked flag could never speak
   for it. Measured: the wrapper is on the allowlist for exactly one kind today, and the seven wake
   kinds carry 33/28/14/13/9/7/1 allowlist rows between them. The cell now asserts
   `array_agg(wake_kind) = {close_prep}`, with its own rolled-back mutant (insert the
   `interactive_client` row, see the reader return two kinds) proving the reader can say NO.
2. **The sentence that justified it was false.** The cell, 0283's header and `packages/db/README.md`
   all read "no close_prep wake task is minted, so no caller can ever reach the wrapper". Measured:
   `clara.mint_wake_credential_for_task` is granted to `clara_runtime` and never reads the flag —
   `clara_l05` carries **771 `close_prep` credentials its own batteries minted**. The gate is the
   RUNTIME's claim step, both halves of it (`packages/runtime/lib/wake-engine.mjs:392-397`,
   held → running; `:801-804`, queued → running), under the same `wake_source_gate:<key>` advisory
   lock `clara.set_wake_source_enabled` takes. All three places now say that instead.

**What the containment rests on, stated exactly, each leg measured on `clara_l05`:**
`clara._propose_adjustment_template_core` and `clara._agent_prepayment_schedule_core` are granted to
`clara_fn_owner` and nothing else · `clara.wake_establish_prepayment_schedule` is granted to
`clara_wake_interactive` and nothing else · `clara._close_wake_ctx` demands a live wake credential
whose kind the allowlist admits for that verb, and the allowlist admits that verb for `close_prep`
alone · a `close_prep` task is promoted to `running` only while `wake_engine_sources.close_prep` is
enabled, which it is not. Four legs, none of them a wall in the database; the cell watches the two
that a person can flip.

---

## The majors

### L05-SPEC-02 — the weekly D-b2 upgrade drill — **FIXED (not executed: reset-gated)**

`x42-0045-b2-upgrade.test.mjs` applies `MIG_DIR` whole, and `MIG_DIR` defaults to the entire
migrations directory, so `.github/actions/closed-wave-upgrade-drills` (weekly, with
`CLARA_RIG_ALLOW_RESET=1`) drives propose → sign → run-manual against a chain that now contains
0282. The drill's headline smoke (f) and its `auto_reversal_of` 0→1 transition (g) now branch on
the `retire_adjustment_template_doors$` stem: above it the three doors are asserted to refuse by
their own reason token, the template is minted with the same content through the DB's own canon
and hash bodies, and the occurrence is posted through `clara.run_adjustment_occurrence`; below it —
the `db-slice-frontiers` d-b2 leg's bounded `0001..0045` copy — the original ceremony runs
unchanged. **Unverified by execution**: the drill is reset-gated and RIG.md forbids
`CLARA_RIG_ALLOW_RESET` on a lane cluster; `node --check` passes and it SKIPs correctly here. The
integrator's drill run is the proof.

### L05-SPEC-04 — two false comments in the diff — **FIXED**

`leader.mjs` and `reconciler.mjs` asserted "#929 removes the DB surface (clara.adjustment_run_due /
clara.run_adjustment_occurrence) itself". Checked: 0283 recuts only `clara._plan_overlap_warning`;
0282 pins both of those bodies byte-unchanged in its prestate **and** its tail; both still hold
`clara_runtime` EXECUTE. Both comments now say what happened — the belt retires AHEAD of a callee
that **survives** it, with no caller left in the image, and dropping the two functions is a
residual this lane does not own.

### ADV-L05-03 — the sibling advisory's self-exclusion — **CONFIRMED; the false justification withdrawn, the behaviour deliberately unchanged**

Re-measured on `clara_l05`: **7 `(client_id, basis_digest)` groups hold 28 live plans with
byte-identical bases** — four at a time, created 4 ms apart by the rig's own seed ("Monthly office
rent accrual") — and `clara._plan_overlap_warning(<one of those clients>, <one of their own bases>)`
answers **NULL**. 0281's justification ("a coincidence this estate has never produced in practice")
is false on the estate this lane is built on, and 0283's header now says so with the measurement.

**The limitation stays, on its other argument, which holds**: the function is advisory, so a false
negative costs a missed warning and never a wrong refusal. **Why no heuristic fix**: excluding "the
most recently written identical-basis plan" instead of "every identical-basis plan" would make
`revise_accounting_plan` warn a firm about the very plan it is revising — a warning that names your
own row is worse than a missing one, because it teaches the reader to skip the key. The honest fix
passes the plan id the three doors already hold, which recuts three bodies that **0280, 0281, 0282
and 0283 all pin byte-unchanged**; two of those migrations are below the redo frontier and cannot be
re-applied. That is a ticket. **Follow-up worth filing:** *widen `clara._plan_overlap_warning` to
take the caller's own plan id and self-exclude by identity.*

### ADV-L05-04 — the concurrency window — **CONFIRMED; stated where the claim lives**

The advisory is computed inside the creating transaction, so two concurrent creations each read the
other as uncommitted and both answer `null`. 0283's header now states the window and names the shape
that would close it — the client-level advisory lock this estate already uses for this class of
question (`clara.retire_adjustment_template`'s `pg_advisory_xact_lock(203005004, hashtext(p_client))`)
taken in the three plan-creating doors — which are the same three bodies four migrations pin. Not
done here, for the reason above. No report sentence now claims the advisory "names every other live
plan" without the caveat.

### ADV-L05-05 — the retired tab announced a run as DUE — **FIXED, and proven in a real browser**

`clara.adjustment_run_due` still answers `due: true` for a client carrying a live pre-retirement
template, truthfully. The banner said "An adjustment run is due for X – Y" — an obligation #927's
closed manual run and #928's deleted sweep leave nothing able to discharge, on the very tab D6 keeps
readable for exactly that firm. The due branch now reports the same fact without inviting the act
and names the successor. `all_blocked` and `nothing_due` are untouched — neither ever invited an act.
The dead `runDue.due` key was removed. Driven test-first: the new unit cell was RED for the right
reason before the copy existed, and the e2e mock now answers `due: true` so the **real built bundle**
is what proves it (`adjustments-retired-walk` 2/2 on 3540/3541/3542).

### F1 (standards) — #927's commit order — **DISCLOSED, which is the fix the finding asks for**

Confirmed as reported: `5a3238bde` (db production) precedes `1a824cae7` (db test retarget), and
`8ce2ff304` (web production) precedes `4a1755b62` (web test update); each intermediate commit leaves
then-existing tests red, including a hard module-load `SyntaxError` on the web side. HEAD is green
and the behaviour is correct, so there is no code fix at HEAD, and history is not rewritten. What
#927's report omitted and this one states: **a retirement's production edit cannot be split into a
smaller red-green step — the door and the cells that drove it move together — so the red-then-green
proof was done by hand, and the two commits are a "small group of slices" split across the wrong
boundary.** #928 and #929 disclosed the identical tension under their own `## Vacuity control`
headings; #927 did not. The next ticket of this shape bundles the production edit with its matching
test retarget per subsystem, or carries the same disclosure.

---

## The minors and notes

| id | disposition |
|---|---|
| **L05-SPEC-05** | *Partial, unchanged.* AC1's "a full leader cycle on a rig with the world bootstrapped issues no call into the retired module" is still undriven here: `leader-state.test.mjs` is 4 SKIP on this host for the documented `pg_dump`-absent reason, and bootstrapping a World on a lane database makes `rig-isolation` T10b red (#866). The call site really is deleted from both modules and `reconcile-belt-isolation-unit` is 24/24. **Integrator**: re-run `leader-state.test.mjs` once under WSL/Linux with `pg_dump` on PATH, or relax the AC in the lane record. |
| **L05-SPEC-06** | *Substitution, recorded, no change.* AC5 names the firm-navigation walk; the lane wrote `adjustments-retired-walk.spec.ts` instead. The substitution holds — `lib/navigation/tree.ts:382` records that #640 repointed the sidebar's "Adjustments" row to `/clients/:id/plans`, so `?tab=adjustments` is not a destination that walk can reach. |
| **L05-SPEC-07** | *Half fixed, half a judgement that stays.* The run-due dead end is fixed (ADV-L05-05). The four write controls stay: **Retire** is not one of the doors #927 closed, and it is the ONLY act that can clear 0282's own live-template guard on a hosted estate — removing it would leave a firm with a stray live template and no way to retire it. The reversal-pair ceremony is named in the ticket body's D6 sentence. If the owner reads "read-only" literally, Retire goes too and the guard needs another remedy; that is an owner call, not a reviewer's. |
| **L05-SPEC-08 / ADV-L05-06** | *Recorded, with the operational consequence.* 0282's live-template prestate is a LIVE gate, not the 2026-09-18 census. `packages/db/README.md` now carries both facts: on release day the count is re-taken and a non-zero answer is cleared by a retire-by-hand pass through `clara.retire_adjustment_template` (which admits `proposed → retired`); and a redo of 0282 on any rig that has run the suite is refused **by design** — 491 non-retired rows measured on `clara_l05`, all of them the batteries' own fixtures, which are exactly the orphans the guard refuses to create. A from-scratch chain passes it vacuously (nothing under `seeds/` inserts the table), so the integrator's from-scratch proof is the one that carries 0282. Not fixed by cleaning up the fixtures: the batteries assert on the rows they leave, and a blanket `after()` retire would move state other cells read. |
| **ADV-L05-07** | *Recorded in two places; 0280 cannot be edited.* `clara.revise_accrual_adjustment` exists nowhere in the catalog and is cited three times by 0280, once inside the `clara._assert_plan_schedule` body it ships. The two real callers of `clara._assert_accrual_schedule_yields` are `clara.create_accrual_adjustment` (granted `clara_authenticated`) and `clara.create_accrual_adjustment_for` (granted `clara_runtime`, the on-behalf-of door) — so the wall guards the runtime door too, which 0280's header does not say. 0280 is applied, immutable, and **not** the highest applied version, so `CLARA_MIGRATION_REDO` cannot reach it; the correction is in 0283's header and `packages/db/README.md`. |
| **ADV-L05-08** | *Recorded — the list the finding asked for.* Validations whose last live caller retired with the doors, now asserted only below 0282: `p_replaces` lineage validation (unknown / cross-client / not-retired / chain-too-long / already-succeeded / root-occupied), the propose- and sign-time period advisories (`replaced_period_overlap`, `colliding_live_sibling`, `implausible_start_date`), `template_fy_stale` re-derivation at sign, the propose/sign date-domain wall, the propose-door op-key replay, the human propose floor, and the schedule congruence walls (`schedule_shape_incongruent`, per-period balance, coverage, line-shape, boundary). Every one of them still guards `clara._propose_adjustment_template_core`, which the PARKED agent limb reaches — so they are dormant, not dead. Handed to #683's census so they are retired deliberately rather than by attrition. |
| **ADV-L05-09** | *Fixed.* Both page headers (`plans/page.tsx`, `accounting/adjustments/page.tsx`) called the 0045 lane LIVE; both now name the retirement and the ticket. |
| **L05-SPEC-09 / 10 / 11, F2, F3** | Notes the reviews themselves closed; nothing owed. L05-SPEC-11's residual (the `clara_runtime` EXECUTE grant on `run_adjustment_occurrence` / `adjustment_run_due` with no caller left) is now stated in `leader.mjs`/`reconciler.mjs` and in 0283's header rather than left unwritten. |

---

## Migrations

No new migration was written: wave 3 reserved `0280–0283` for this lane and `0284` onward belongs to
lane 06. **0283 was edited and re-applied through the supported redo path TWICE** —
`CLARA_MIGRATION_REDO=0283_retire_plan_overlap_template_arm` with `CLARA_ALLOW_DESTRUCTIVE=1` — each
time its prestate reported the redo branch ("clara._plan_overlap_warning is at its own prior output
(a #957 redo)") and its tail re-read every claim. Only comments changed on both passes; the function
body is byte-identical.

- **New ledger checksum** `28e630178b35012c062d89c084844435d59896a951d6666236ab4f6f79ca3af7`
  (`060996f1…` at #929's report, then `927b34da…` after the first redo — **the integrator must use
  the newest one**; it is the value `packages/db/README.md` now carries).
- **Re-measured after the second redo**, and unmoved: `clara.create_accounting_plan`
  `84b67058…`, `clara.revise_accounting_plan` `87c9f1e9…`, `clara._accrual_plan_core` `b3bd1006…`.
  `clara._plan_overlap_warning` sits at its post-0283 one-arm body `d7170401d21ddf9d0f4709cbfecb4e27
  09354ea6d22b01618c628986ae52e205`; `0280`/`0281`/`0282` keep the ledger checksums `feb3a4ce…`,
  `dcee43aa…`, `dc243272…`.
- **Pins unmoved.** 0283 re-pins `clara._plan_overlap_warning`
  (`33b23167bf67f911a13b7523a4eb109e406ec2a10367b444c687d2461abc1e0b`, 0281's two-arm output) and the
  three callers `clara.create_accounting_plan` (`84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4`),
  `clara.revise_accounting_plan` (`87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f`)
  and `clara._accrual_plan_core` (`b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8`).
  None moved.
- **No web census re-measure was owed**: `apps/web/tests/firm-scope-db-pins.corpus.ts` keys only on
  migrations carrying a reviewed dynamic-SQL barrier, and none of 0280–0283 is in it (checked by
  grep, and the whole web suite is green).
- 0280, 0281 and 0282 were **not** edited: they are applied and below the redo frontier, and editing
  them would fail the runner's own checksum-drift refusal.

## Gates

| gate | result |
|---|---|
| `pnpm typecheck` | PASS (apps/web, packages/runtime) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | PASS, exit 0 (three `no-unused-vars` and two raw-colour trips found and fixed) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4841 tests · 4839 pass · 0 fail · 2 skip** |
| `apps/web` e2e `adjustments-retired-walk` (triple 3540/3541/3542) | **2/2 pass**, against the real built bundle |
| `packages/db` — every file this lane touched **plus every other file that reads a helper it touched** (53 files), full gate chain, one run | **410 cells · 399 pass · 0 fail · 11 named skips** |
| `packages/db` `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags) | PASS, inside that same 410 |
| `packages/db` `plan-overlap-template-arm-retired.test.mjs` alone, after the second redo | 4/4 pass |
| `packages/db` WHOLE suite (`pnpm test`) | **NOT a valid gate on a reused lane database — see below; the 53-file run above is the gate rule 8 actually asks for** |
| `packages/runtime` `reconcile-belt-isolation-unit` | 24/24 pass |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen, 55 use-workflow, 3 retired |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `node apps/web/scripts/check-message-keys.mjs` | OK — 4303 static keys resolve |

### Why the whole `packages/db` suite is not the gate here — attempted, measured, abandoned

A whole-suite `pnpm test` WAS started against `clara_l05` and abandoned partway with **551 red
cells**, none of which is a lane regression. Every one belongs to the "this database has already
run the suite" family, and the suite says so in its own error text:

- `evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set to "1"`;
- `F-A5b PR-1 DRIFT: … sandbox_watermark rows=5/3` (55 cells) — append-only rows accumulating
  across runs;
- `delta contract requires a fresh disposable DB …` → `verified_deployed 8 !== 7`. Traced:
  `tests/f-a5b-sandbox-export-pr1.test.mjs:125` blanket-flips
  `update clara.evaluator_versions set deployed = true where not deployed and evaluator_name <>
  'evaluate_fs_pack_agent'`, which deploys `prepayment_schedule` v1 — the closure
  `delta-catalog-phase.mjs:654` excludes from its deployment census. The flip is one-way (0060's
  `_tf_evaluator_deploy_once`) and `f-a5b…` sorts AFTER `delta-contract`, so the FIRST run on a
  fresh database is green and every later run on that same database is red, for ever.

`packages/db/tests/README.md`, "Freshness and split chains", states the rule directly: *"A fresh
database per full run is the reliable default… `CLARA_ESTATE_REUSED_DB=1` acknowledges reuse for
tests that support it; it does not make every test repeatable."* So the flag would not have rescued
the run either. **Not a lane regression, established rather than asserted:** the lane's diff
(`ffe63a0..HEAD`) touches no `delta-*`, `f-a5b-*`, `zeta-*` or `epsilon-*` file, and of the 38
`packages/db/tests` files it does touch, exactly one mentions `clara.evaluator_versions` at all
(`f-a4-pr2a-census.test.mjs:169`, a read-only join). The integrator's from-scratch chain on a
disposable cluster is where the whole suite is honestly measured.

## Unverified, and known reds

- **The D-b2 upgrade drill was not executed** (reset-gated; RIG.md forbids `CLARA_RIG_ALLOW_RESET`
  on a lane cluster). Syntax checked; it SKIPs correctly here.
- **The `0001..0045` frontier was not executed** either — a second from-scratch chain on this
  cluster is forbidden. Every file that must work at both frontiers does so by asking the catalog
  (the hash arity) or `clara.schema_migrations` (the retirement stem), never by a migration number,
  and the pre-0282 arm of each branched cell is the body that was already green there.
- `leader-state.test.mjs` — 4 SKIP, Windows `pg_dump` (RIG.md's known red).
- **The 11 skips in the 53-file db run are all named and none is new:** the D-b2 upgrade drill and
  `T19 poison-role` are reset-gated (RIG.md forbids `CLARA_RIG_ALLOW_RESET` here); eight
  `x42.prod-*` / `x42.af2-15e` cells skip on "0037/0038/0040 bank substrate absent" because
  `clara.match_candidates` was retired by F-A3 PR-3 (0129) — `x42-producer.test.mjs`'s last commit
  is `d0f93e3de`, long before this lane's base; and one `wake_file_document` B3 arm is the file's
  own documented measured skip.
- **`apps/web` was not re-run for `d8ff391a8`** and did not need to be: that commit touches only
  `packages/db` (one migration header, one README section, one db test file). The whole web unit
  suite and the `adjustments-retired-walk` e2e results above stand from `20546d198`, and
  `git status` is clean against it.
