# Wave S · Lane 01 — fix round (single fix worker, /implement-spec)

Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, database `clara_l04`
(127.0.0.1:55744). Base `7bc5a710f`.

**New head: `e2a61547d`.**

Working tree clean. Four new commits on top of the lane's nineteen:

```
e2a61547d docs(web): #1075 AC2's obligation is carried where the next author will read it
1ff600232 fix(db):  #1073 a raised refusal names no occurrence row it destroyed, and the two
                          remedies' divergent histories are stated (0333)
cd4be2af1 test(db): #1080 the parity kind cannot be self-minted, and the web fixture stops quoting
                          a sentence 0331 leaves nowhere
1b74262b9 docs(db): #1074 the 0332 section names the floor that actually refuses a reversal onto a
                          deactivated account
```

At start: `git status` clean, `git log --oneline 7bc5a710f..HEAD` = the 19 ticket commits
(`b1e0f9c3c` … `f782b48a0`), nothing redone.

**No status request arrived mid-task.** (Work-order rule (f) noted; nothing to report under it.)

---

## The one structural decision this round had to make

`CLARA_MIGRATION_REDO` refuses any version that is not the **highest applied** one
(`packages/db/scripts/migrate.mjs:399`). 0334 sits above 0333, so an edit to 0333 — which
ADV-L01-01 requires in the door's own body, and which even a comment-only change would force
through checksum drift — had **no redo path**. The supported alternative is the #867 recipe, and it
was run: `clara_l04` dropped, `scripts/role-census-reset.mjs --apply` (it reported all six
post-0154 roles blocked only by `clara_l04` itself, then took the cluster back to 0154's pinned
14), database recreated, `pnpm --filter @clara/db migrate` = **314 new / 314 total, `0001` →
`0334`**, then `seed` (2 files). A second `migrate` reports `0 new · 314 total`, so the ledger
carries no drift against the edited files.

Two things fall out of that, both recorded in `packages/db/README.md`'s 0333 section:

* every one of this lane's five migrations printed its **FIRST-APPLY** branch against a real chain
  (`#1051 prestate: FIRST APPLY …`, `#1080 prestate: FIRST APPLY …`, `#1074 …`, `#1073 …`), which
  is stronger than the by-hand first-apply proof the wave-3 addendum asks for when a bimodal pin
  hides that branch from a redo;
* half of #1051's AC3 ("from-scratch chain green") is now satisfied on the lane's own chain, in
  addition to whatever the integrator runs on a disposable cluster.

No other lane's cluster, worktree or database was touched.

---

## Findings, one by one

### ADV-L01-01 — `reversal_before_primary` hands back an `occurrence_id` its own rollback destroys · **FIXED**

**Reproduced** as a new cell, red before the fix for exactly the right reason:

```
not ok 1 - p1073.refusals.payload_identity …
  the recorded-then-rolled-back refusal says so: {"leg":"reversal","code":"CLR13",
  "reason":"reversal_before_primary",…,"occurrence_id":"43e86278-dd82-4eb4-aabb-45a7285c3dab",
  "primary_state":"no_occurrence",…}
  + actual - expected  + undefined  - false
```

**Mechanism, read off 0332 rather than assumed.** `clara._plan_admit_occurrence` has three arms
that insert-or-reuse the occurrence row, stamp `outcome.state='refused'` on it and return its id
(`*_period_line_missing` at 0332:545-552, `reversal_before_primary` at 0332:577-590, and the arm
that catches the Work door's own refusal at 0332:606-612). Two arms answer *before* any write and
name a row an earlier transaction committed: the converged one (0332:402-405) and
`period_already_admitted` (0332:416-421). `clara.reverse_plan_occurrence` raises, so the first three
lose their row and the last two keep theirs.

**Fix.** The door builds its raised detail explicitly: `occurrence_id` survives only when the answer
is `converged` or `period_already_admitted`, is removed otherwise, and `occurrence_recorded`
(`true`/`false`) is added wherever the core offered an id at all, so a surface reads one rule rather
than guessing. The door's comment, its `comment on function`, 0333's header and the README's 0333
section all state the contract.

**Green after the rebuild**: `p1073.refusals.payload_identity` drives both halves and *opens* the
converged id on `clara.accounting_plan_occurrences` instead of trusting the key. No consumer broke:
`grep -rn occurrence_id apps/web` shows no reader of a refusal payload's id, and no db cell asserted
one.

### ADV-L01-02 — a refusal the catch-up records leaves no trace through the new remedy · **FIXED (measured + stated)**

**Reproduced and CONFIRMED** by a new cell that was green on the pre-fix body (it characterises real
behaviour, it does not change it): two identically built plans, one refusal.
`clara.request_plan_catch_up` over the orphan period's reversal day leaves
`reversal@<date>: refused / reversal_before_primary`, `work_id = null`, on the plan;
`clara.reverse_plan_occurrence` on the same scene leaves the plan exactly as it found it.

The divergence is **kept** — raising is what frees the op key, and the lane's own
`p1073.refusals.core` already proves the key does the real act afterwards — and is now **named** in
0333's header, `packages/db/README.md`'s 0333 section, `CONTEXT.md`'s `accrual_bill_conflict`
paragraph and `apps/web/README.md` (the person presses one of two buttons on one screen).

Cell: `p1073.history.refusal_record_diverges`. Its expected reversal date comes from the calendar
(`date_trunc('month', due) + 1 month`), never from `clara._plan_reversal_date`, so it is not
re-computing what the subject computes. **Non-vacuity control**: pointed at the WINDOW plan, the
"no refused reversal survives" half goes red; the file was restored byte for byte (`git diff --stat`
back to insertions-only).

### ADV-L01-03 — the deactivated-account consequence names the wrong refusing body · **FIXED**

**Reproduced by measurement on `clara_l04`.** A catalog census places
`line % codes to an account this client does not have active: %` in exactly
`clara._record_journal_entry_core`, `clara._assert_accrual_account`, `clara._assert_adjustment_account`;
`line codes to a non-existent account` in exactly `clara._validate_entry_lines`, whose raise carries
**no** `reason` at all. Inside `clara._record_journal_entry_core` the typed check sits at `prosrc`
offset **26518** and its call to `clara._validate_entry_lines` at **35680**, so the validator's floor
is unreachable on this path. The real refusal is `CLR10` /
`{"reason":"unknown_account","field":"lines[n].account_code","account_code":"…"}`.

0332 is applied and immutable, so the correction is stated in `packages/db/README.md`'s 0332 section
— the idiom 0330 itself used for 0308:870. The substance of the consequence (the reversal posts the
ORIGINAL pair; a deactivated account is a hard stop, not a stranded balance) is unchanged and still
right.

### SPEC-01 — 0331 newly admits `contract_confirmation` on the accrual machine lane · **NOT CHANGED; the safety argument is now MEASURED, and the acceptance is escalated**

I did not parameterise `clara._assert_plan_authority`. Reasons, in order:

1. It would re-open the exact divergence #1080 exists to close. The HUMAN accrual door
   (`clara.create_accrual_adjustment`) has admitted the kind since 0300, because it nests
   `clara.create_accounting_plan`; keeping the machine lane at two kinds means one client gets two
   different answers for one authority depending on which entrance ran — the defect the ticket is
   about, in a new dress.
2. The parameter's premise is stale. #1051's brief proposed it in order to keep the OBO plan lane at
   two kinds, and the integrated chain already admits three on both plan doors (0308:893 vs
   0308:614). The sweep plan re-briefed #1051 on exactly that ground.
3. It is not a small change: 0330's signature, 0331, four batteries, three README sections and a
   second full database rebuild.

What I did instead is make the safety argument checkable rather than rhetorical, so the owner's
decision rests on a measurement. New cell
`p1080.accrual.confirmation_cannot_be_self_minted` (`accrual-plan-authority-wall.test.mjs`,
`EXPECTED_CELLS` 4 → 5), all four claims driven on `clara_l04`:

* exactly two clara bodies insert into `clara.contract_plan_confirmations`, and they are
  `clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)` and
  `clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)` — a closed world over `pg_proc`;
* `clara_runtime`, `clara_agent_ro`, `clara_wake_interactive`, `clara_wake_proactive`,
  `clara_wake_bank` and `clara_wake_filing` can execute **neither**; `clara_authenticated` can, and
  `public` cannot;
* **no** role — `clara_runtime`, `clara_agent_ro`, not even `clara_authenticated` — holds INSERT on
  the table, so the SECURITY DEFINER doors are the only way in;
* `confirmed_by` is `NOT NULL`.

A later lane that grants one of those paths now turns this cell red instead of quietly making
0331's header false. **Non-vacuity**: adding `clara_authenticated` to the machine roster turns it
red on the first door; restored byte for byte.

**Still owed and escalated:** the integrator or the owner records explicit acceptance that the
on-behalf accrual lane admits `contract_confirmation` before release. That is a ruling, not a code
change, and a worker cannot make it.

### SPEC-02 — #1051 AC3 · **HALF FIXED, HALF REFUTED as a lane defect**

* *"From-scratch chain green"* — **now satisfied on the lane's own chain**, as a side effect of the
  rebuild above: `0001` → `0334`, 314/314 applied, `seed` green, second `migrate` reports 0 new.
  The integrator's run on a disposable cluster is still the authoritative one.
* *"`CI=true GITHUB_ACTIONS=true pnpm lint` exit 0"* — **reproduced red, and it is base drift, not
  this lane.** `CI=true GITHUB_ACTIONS=true pnpm lint` fails at step 1
  (`freeze-lint: FAIL … 38 violation(s)`, REMOVED-VS-BASE / UNLOCKED-VS-BASE / REGISTRY-DOWNGRADE
  for chatTurn v22, claraWork v6, statementFacts v4, payrollFacts v1 — files that exist on
  `origin/main` and not on the lane base). With `FREEZE_BASE_REF=7bc5a710f` the **whole chain exits
  0** (verified: `exit=0`). Evidence that the lane is not the cause:
  `git rev-list --count 7bc5a710f..origin/main` = **62**, the reverse = **0**, and
  `git diff 7bc5a710f...HEAD --name-only | grep -c '^packages/runtime/'` = **0**.
  **Integration action:** merge main into the lane (or gate the merged head) before treating lint as
  a gate. Until then, the first step failing means eslint never runs, which would mask a real lint
  error — so the lane's own lint evidence is the `FREEZE_BASE_REF` run.

### SPEC-03 — #1075 AC2 deferred with nothing carrying it · **FIXED as far as a worker can**

`loadAccruals` (`apps/web/lib/accruals/api.ts`) now documents, at the call site, that
`clara.list_accrual_adjustments` takes `p_side text default null`, that this caller deliberately
does not send it, why (without pagination both return the same rows and a refetch per keystroke is
worse), and that AC2 is **owed here**: whoever adds pagination adds `p_side` and deletes the
client-side narrowing beside it. The obligation no longer lives only in a ticket report.

**Still owed:** file the pagination follow-up that owns AC2 and link it on #1075, or leave #1075
open with AC2 unticked. A worker may not write to GitHub.

### STD-01 / SPEC-04 — CONTEXT.md edited by L1 four times · **KEPT, with the regions listed for the merger**

The four hunks each correct a sentence this lane's own change made untrue, none mints a term or a
heading, and all four are disjoint. Reverting them would leave CONTEXT.md stating things the lane
has made false, which is worse than the ownership deviation. This round adds a **fifth** sentence in
the SAME region as the fourth (ADV-L01-02's divergence), so the merger's job does not grow.

Regions L1 touches, for reconciliation against any L3 hunk:

| entry | commit |
|---|---|
| "Authorising instruction" (third kind; the one-predicate paragraph) | `2ada717aa` (#1051), `f762c1a87` (#1080) |
| "Plan occurrence" (a reversal posts its own entry's lines) | `ab42ceb55` (#1074) |
| "Accrual reversal" / "Accrual correction" | `ab42ceb55` (#1074) |
| "Settlement candidate row" → `accrual_bill_conflict` paragraph | `fc9d61b2b` (#1073), `1ff600232` (this round) |

**Recommendation to the orchestrator:** record the exception in SWEEP-PLAN.md rather than letting
the pattern become the norm unstated.

### ADV-L01-05 — dead fixture state on the shared e2e mock · **REFUTED in its premise; state KEPT**

The finding says `accrualPeriodReverseCalls()` is dead "while the sibling `reverseOpKeys` recorder
beside it IS read by the 'reverse now' cell". Measured: `grep -rn` over `apps/web` for
`accrualPeriodReverseCalls`, `accrualReverseOpKeys` and `accrualCorrectOpKeys` returns **only the
three definitions** — no sibling is read either, and `resetAccruals` has no caller at all. The
reason is structural: `apps/web/e2e/accrual-mock.mjs` is imported by `e2e/serve-built.mjs`, i.e. the
**server** process, while the spec imports only `ACC` from it; a Playwright spec has no handle on
that process's module state, so none of the three recorders is readable from a cell today. Asserting
the new one is therefore not a two-line change but a new introspection endpoint, and deleting only
the #1073 one would make the file inconsistent with its two siblings while touching a rule-7 shared
file and forcing an e2e re-run.

Left as it is, deliberately. **Follow-up worth filing:** either give the mock a readable
introspection route and assert all three recorders, or delete the family.

### ADV-L01-06 — an unreachable arm and an undriven arm · **FIXED**

`client_inactive` is now driven (`p1073.refusals.core`, fourth arm, archived client through
`setClientStatus`, restored in a `finally`). `plan_not_found` is **kept** and commented as a belt:
`clara._plan_door_ctx` has already resolved the plan under the caller's firm and raised CLR11
itself, and the door then locks that row `for update`, so the core cannot answer it from this
entrance; the arm keeps the code map total over the core's vocabulary and the body now says so in
as many words. Also in the README's 0333 section.

### ADV-L01-07 / SPEC-07 — a web fixture quoting a sentence no body can raise · **FIXED**

`accrual-form.test.tsx`'s `652.form` cell threw
`"the instruction this accrual cites does not exist for this client"`. That spelling was
`clara._accrual_plan_core`'s alone; the form's own door nests `clara.create_accounting_plan` and has
always said "this **plan** cites", and 0331's tail asserts the old sentence now lives in no clara
body. Restated at the door's real sentence, with a comment saying why. 21/21 green.

### Notes recorded without a change

* **SPEC-05** — the on-screen sentence *"It leaves the same amount on the books for this period as
  Reverse now does"* is unconditional, and true of every schedule this estate admits only because
  `clara._assert_plan_schedule` refuses `monthly + day_of_month = 1` on a reversing plan
  (`reversal_collides_with_next_occurrence`). I did not change user-facing copy: it is an owner
  judgement, `apps/web/messages/en.json` is a rule-7 shared file and the e2e walk asserts the
  sentence. The condition is now written down in `apps/web/README.md`'s #1073 section so the choice
  is visible. **Owner call owed:** keep it, or name the period instead of promising equivalence.
* **SPEC-06** — 0332 makes a reversal refuse at posting time when a correction moved the accrual off
  an account that has since been deactivated. Latent (the estate has no chart-account deactivation
  door), correct accounting, no named operator remedy. Recorded for whichever ticket ever opens
  chart-account deactivation.
* **SPEC-08** — #1070's per-period schedule is the page's own read-only table rather than a mount of
  `AccrualPeriodAmountsBlock` (that block is an editor with no read-only mode). Interpretation, not
  a defect; left as built.
* **STD-02** — the `#1073` → `ticket 1073` test-title rename dodges the raw-colour lint rule's
  false positive and weakens no assertion. Left as built.

---

## Gates, with counts (all on `clara_l04` after the rebuild, unless noted)

| gate | result |
|---|---|
| `plan-occurrence-reversal-door.test.mjs` (full 130-flag chain) | **9 tests, 9 pass, 0 fail** (7 before this round, +2) |
| `accrual-plan-authority-wall.test.mjs` | **5 tests, 5 pass, 0 fail** (4 before, +1) |
| `plan-authority-wall` + `accrual-plan-authority-wall` + `plan-reversal-posted-basis` + `accrual-list-side-filter` | **17 tests, 17 pass, 0 fail** |
| `accrual-adjustments` + `accrual-revenue-side` + `authority-ref-human-instruction` + `plan-overlap-template-arm-retired` + `accrual-correction` + `accrual-bill-conflict` + `accrual-period-amounts` | **80 tests, 80 pass, 0 fail** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags) | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `apps/web tests/firm-scope-db-pins.test.ts` (sweep rule (d): a migration file changed) | **22 tests, 22 pass, 0 fail** — 0330–0334 are static DDL, so no barrier entry is owed and none was added |
| `apps/web` unit files touched (`accrual-form.test.tsx`) | **21 tests, 21 pass, 0 fail** |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5179 tests, 5177 pass, 0 fail, 2 skipped** |
| `pnpm typecheck` | **Done** (apps/web, packages/runtime) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 1 at freeze-lint, 38 violations — base drift, see SPEC-02** |
| `pnpm --filter @clara/db migrate` (from scratch) | **314 new / 314 total**, `0001` → `0334` |
| `pnpm --filter @clara/db migrate` (second run) | **0 new / 314 total**, no drift |
| `pnpm --filter @clara/db seed` | 2 files |

No browser walk was re-run: this round touched no `apps/web/e2e` file (see ADV-L01-05). No
`packages/runtime` file was touched, so the frozen-workflow and parts-parity checks are unchanged
apart from the base-drift issue above.

## Migration pins — unchanged

No prestate pin was re-measured, because no pinned body moved: the only migration edited is 0333,
and 0333 pins `clara._plan_admit_occurrence` (`5cc0fa56…`), `clara.request_plan_catch_up`
(`4ed6f110…`) and `clara.skip_plan_occurrence` (`872edfce…`), none of which this round touches.
0333 does not sha-pin its own body, and its tail's marker list (T.1d) still matches — the edit adds
`reversal_already_admitted` handling and removes nothing it names. The whole chain re-applied from
scratch with every prestate and tail green, which re-proves every pin in the lane at once.

## Follow-ups worth filing

1. **Pagination for the accrual register**, owning #1075's AC2 (`p_side` gets a caller and the
   client-side narrowing goes). Blocks closing #1075 on AC1 alone.
2. **Explicit acceptance of the `contract_confirmation` parity on the accrual machine lane**
   (SPEC-01) — an owner/integrator ruling before release, now backed by a measured cell.
3. **The e2e mock's three unread recorders** (ADV-L01-05) — a readable introspection route, or
   delete the family; `resetAccruals` has no caller either.
4. **A remedy for a posted period whose original account is gone** (SPEC-06), owned by whichever
   ticket opens chart-account deactivation.
5. **The on-screen equivalence sentence** (SPEC-05) — owner judgement, condition now documented.
6. **CONTEXT.md ownership exception for L1 this wave** (STD-01) recorded in SWEEP-PLAN.md.

## Anything unverified

* Nothing in this report is asserted without a command that produced it, except the two items
  explicitly marked as owner/integrator rulings (SPEC-01's acceptance, SPEC-05's copy).
* The from-scratch chain was run on the lane's own cluster, not on a disposable one; the integrator
  still owes the disposable-cluster run that #1051's AC3 is finally closed by.
