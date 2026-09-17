# Wave 2026-09-15 integration — fix round 1

Branch `integration/wave-2026-09-15`, worktree `C:\Users\zhant\Desktop\clara-wt\int`.
In at `017440fd`, out at **`2b30ddf2`** — **two commits, five test files, +302 / −15**.
Rig: **`rigint`** `127.0.0.1:55600` / **`clara_int`**, chain `0001…0209` (204 migrations, PG 17.11),
the exact **39** preintegration-gate flags from `packages/db/package.json`, **no reset flag and no
role-sweep flag ever set**. Working tree clean, nothing pushed, no PR, no ticket worktree touched,
**no migration file edited** (`git diff --name-status origin/main..HEAD -- packages/db/migrations`
is adds-only), no frozen file edited, `git ls-files --eol` on all five changed files: **LF**.
Every number below is **LOCAL**. **Hosted evidence: none.**

Thirteen failures were handed over. **Four were fixed** (three of them one root cause), **nine are
named** — four environment, two confirmed flakes, three pre-existing test-isolation or
test-precondition reds that reproduce on `origin/main` just as well.

---

## 1 · Verdict table

| # | Leg | Failure | Verdict | Where |
|---|---|---|---|---|
| 1 | db-estate | `f-a2-tier-d` `c5.census` — three unpinned `journal_entries` triggers | **FIXED** — stale forward-ratchet census | `1fbdca1d` |
| 2 | db-estate | `x42-advances-gap` `x42v.g4` — two application minters, roster pinned at one | **FIXED** — same root cause | `1fbdca1d` |
| 3 | db-estate | `x42-reservation-authority` `x42.ra4` — three new role-claiming writers | **FIXED** — same root cause | `1fbdca1d` |
| 4 | db-estate | `rig-docs-source-revision` `p646.horn_a.no_work` — `2297 !== 2296` | **FIXED** — genuine defect in #646's own new file | `2b30ddf2` |
| 5 | db-estate | `periodic-adjustment` — 6 subtests, CLR13 model-egress | **NAMED** — shared-DB cross-file state; 19/19 alone (re-confirmed) | — |
| 6 | db-estate | `delta-contract` — two different failures on two runs | **NAMED**, root cause identified; pre-existing, unchanged from `origin/main` | — |
| 7–10 | runtime | `fs7.v17.db.report-tools`, `fs7.v17.db.close-stop`, `leader-state`, `relay-taxonomy` — `spawnSync pg_dump ENOENT` | **NAMED** — no `pg_dump` anywhere on this Windows host (measured) | — |
| 11 | runtime | scanner / EICAR | **NAMED** — #693, RIG.md pre-existing Windows-only red, untouched | — |
| 12 | runtime | `ready MAJOR-1` | **NAMED** — host-contention flake, now **CONFIRMED** (24/24 alone) | — |
| 13 | runtime | `637.pf: B3` `19 !== 1` | **NAMED** — pre-existing, and **not reproducible on `clara_int`** (see §5.4) | — |

---

## 2 · Fix 1 — `1fbdca1d`: three pinned censuses learn #638/#639's new bodies

**One root cause, three censuses.** DECISIONS §1.4 told #638 (0206) and #639 (0201) to register
their subledgers from a **lane-agnostic birth trigger** rather than recut the posting core. Each
new SQL body lands inside a *pre-existing, separately pinned, closed roster* that neither ticket's
migration re-derived. This is a different hazard from the one WAVE-DIGEST §5 / DECISIONS §3.3 (2)
named: the `_subledger_on_approve` caller census (which 0201 and 0206 *did* handle, and which the
merge report measured as not firing). These are three *other* rosters, and none of them is a
migration-time gate — they are test-side replays, so they only speak at integration.

Nothing was widened silently. Every new name arrives with the property that earned the original
pin, **measured on the live catalog**, and every classification is asserted rather than written as
prose beside the list.

### 2.1 · `f-a2-tier-d` — `f-a2.c5.census` (`packages/db/tests/f-a2-post-fixtures.mjs`)

**Failure.** `c5.census: no UNPINNED trigger sits on clara.journal_entries. Extra:
t_je_adv_claim_application_birth, t_je_fa_acquisition_birth, t_je_staff_expense_claim_reversed`.

**Cause.** `jeTriggerPins()` is a forward ratchet of every trigger on `clara.journal_entries` with
its Tier-D/C/inert disposition. The live relation now carries **23** non-internal triggers; the pin
carried 20. Measured:

```
t_je_fa_acquisition_birth          deferrable=t initdeferred=t constraint=t   (0201, #639)
t_je_adv_claim_application_birth   deferrable=t initdeferred=t constraint=t   (0206, #638)
t_je_staff_expense_claim_reversed  deferrable=f initdeferred=f constraint=f   (0206, #638)
```

**What I did.** Three new pins, each frontier-gated on **its own migration stem** exactly the way
0182's and 0197's already are (`version ~ 'fixed_asset_acquisition$'` and `~ 'staff_expense_claims$'`;
each matches exactly one row — verified), so a `db-slice-frontiers` leg pinned below either
migration still skips rather than reporting a missing trigger. The tier each pin claims was read
off the live body, not off the migration file:

* `t_je_fa_acquisition_birth` — **Tier D**, but it **raises nothing of its own** (`_tf_fa_acquisition_birth`
  contains no `raise exception`; it repeats `_fa_on_approve` arm 4's insert with arm 4's own
  `on conflict (acquisition_line_id) do nothing`). It stays Tier D and not "not refusal-bearing"
  because it is a *constraint* trigger: any abort it does produce arrives at COMMIT, outside every
  exception block, which is the Tier-D property this file's header defines.
* `t_je_adv_claim_application_birth` — **Tier D and genuinely refusal-bearing**: CLR40
  `advance_allocation_mismatch` and CLR39 `advance_over_application`, both raised at COMMIT.
* `t_je_staff_expense_claim_reversed` — a **plain, non-deferred** AFTER UPDATE trigger that appends
  the claim's `reversed` status row with `on conflict (claim_id, state) do nothing` and raises
  nothing: the same class as `t_entry_evidence_release`.

**`TIER_D_TOKENS` is deliberately NOT widened.** `f-a2-ladder-3`'s `c3.D-vocab` pins it at exactly
six, and its membership rule is "the belt tokens that left Tier B when B12/B13 were cut" — a *belt*
vocabulary, not a roster of every deferred trigger's reasons. Adding a subledger-registration reason
would change what that cell asserts. The exclusion is now **asserted** (the two new reasons must NOT
be members), so it is a decision on the record rather than an omission. Whether the F-A2 ladder
should own a commit-time vocabulary beyond the belts is §6 follow-up (a).

**New cell `f-a2.c5.wave-births`** turns each pin's `tier` string from prose into a measurement:
the two silent bodies must contain no `raise exception`, the advance birth must contain one and must
still name CLR40/`advance_allocation_mismatch` and CLR39/`advance_over_application`, and the FA birth
must still carry arm 4's conflict target. Frontier-gated on the same two stems.

**Evidence.** `f-a2-tier-d.test.mjs` **8 tests / 7 pass / 1 fail → 9 tests / 9 pass / 0 fail**.
Control, restored afterwards: flipping the new FA pin's `deferrable` to `false` **and** inverting the
raise-check reds **both** `c5.census` and `c5.wave-births` (9 tests, 7 pass, 2 fail) — the pin and
the new cell are each load-bearing.

### 2.2 · `x42-advances-gap` — `x42v.g4`

**Failure.** `exactly one body mints application rows (found: _adv_on_approve,
_tf_adv_claim_application_birth)`.

**Cause.** `0043:1418` wrote, in the migration itself, that `_adv_on_approve` is *"the ONLY body in
the catalog that stamps a void or mints an application row (cell x42v.g4 asserts both facts against
pg_proc, so a future second writer turns red rather than silently re-opening the class)"*. #638's
birth trigger is that future second writer, and the cell did exactly what it was built to do. The
migration comment is in a merged file and was **not** edited.

**What I did — the roster is widened only together with the property it stood in for.** Measured
which of the cell's four arms actually moved:

| arm | before | after |
|---|---|---|
| bodies that `update clara.staff_advances … set` (the **void stamp**) | `_adv_on_approve` | **unchanged** |
| bodies that `insert into clara.staff_advance_applications` | `_adv_on_approve` | `_adv_on_approve`, `_tf_adv_claim_application_birth` |
| bodies that `insert into clara.staff_advances` (the **soft-birth**) | `_adv_on_approve` | **unchanged** |
| callers of `clara._adv_on_approve` | `_subledger_on_approve` | **unchanged** |

Only the application arm moved, so the chokepoint the file's law rests on — the reversal re-ask at
the void stamp — is intact. The application arm now asserts the law directly instead of by proxy:
**every minter re-asks `clara._adv_over_application` (the one body that owns the design SS3.2
outstanding equation) at the moment it mints**, on comment-stripped source, and reaches a
`for update` on `clara.staff_advances`. Measured:

```
_adv_on_approve                  cap: via clara._adv_assert_proposal   lock: via the same delegate
_tf_adv_claim_application_birth  cap: DIRECT                           lock: DIRECT (sa.id = v_advance for update)
_adv_assert_proposal             cap: DIRECT                           lock: DIRECT (sa.id = any(v_ids) order by sa.id for update)
```

One delegate is accepted (`_adv_assert_proposal`) and **only** because both of its properties are
asserted here, which is 0042 S5.14 (6b)'s own argument for accepting exactly one name. The lock
credit is not mis-assigned: `_adv_on_approve`'s own textual `for update` belongs to **arm 1** (the
reversal arm) and does not run on the arm-2 path that mints — the lock arm 2 holds is the
delegate's, and the cell says so. Finally, the second minter is measured **DEFERRED** from
`pg_trigger`, so its cap read and its insert are the same instant: the two-moment gap this whole
file is about cannot open inside it.

The cell's **title and header** were rewritten (the old title asserted "exactly ONE writer", which
would now be a lie); the cell **id `x42v.g4` is unchanged**, because `0043:1418` cites it by name.

**Evidence.** `x42-advances-gap.test.mjs` **3 pass / 1 fail → 4 pass / 0 fail**. Control, restored
afterwards: renaming both the cap and the delegate in the predicates reds `g4` with *"clara._adv_on_approve
mints application rows but never reaches clara._adv_over_application"* (3/1).

### 2.3 · `x42-reservation-authority` — `x42.ra4` (c.ii)

**Failure.** roster gained `_claim_resolve_claimant`, `_fa_complete_particulars_core`,
`_tf_fa_acquisition_birth`.

**Cause.** This cell is the outside-the-migration replay of **0042 S5.14 (6a)**, the exact roster of
every body that writes role-claiming state. 0042's own gate is **migration-time** — it ran at 0042
and cannot see a door a later migration adds — so this replay is the only thing standing between a
new writer and an unclassified claim. Three wave bodies joined it.

**What I did.** Added all three **with their classification measured**, and replayed (6b) and (6c)
live so the roster is not just a longer list:

* **`_claim_resolve_claimant`** (#638, 0206) — a **genuine claiming door**: it INSERTs
  `clara.staff_advance_accounts` from a code the caller supplies (`chooses` = **true**, measured on
  the same `->>'…account_code'` probe 0042 uses). It reaches the shared union through
  `clara._adv_enrolment_admission` — the **one** delegate 0042 S5.14 (6b) accepts, the same one
  `enrol_staff_advance_account` uses — and that delegate is measured to consult
  `clara._acct_role_reserved` itself, so accepting it is not a loophole.
* **`_tf_fa_acquisition_birth`** (#639, 0201) — an **INHERITOR**, and it **joins the discriminator
  arm** rather than inheriting the exclusion from the body it duplicates: measured `chooses` =
  **false** (its three codes come from the join onto an ACTIVE `clara.fa_account_profiles` row, never
  from caller input). The inheritor list goes from three names to four.
* **`_fa_complete_particulars_core`** (#639, 0201) — UPDATE side, and **not a widener**: it is the
  shared core `complete_fixed_asset_particulars_for` calls, writing the same depreciation
  particulars `complete_fixed_asset_particulars` (already on the roster) writes.
  `complete_fixed_asset_particulars` itself is **not** recut (0201:681 says so). 0042 (6c)'s own
  SET-clause probe, replayed on the live body, reports **no** `account_code =`, no `active = true`,
  no `'active'`, no `'pending'`.

Also: the `updOnly` split now names all four insert-only bodies instead of two, so the
"the UPDATE side is most of it" arm counts the right set.

**Evidence.** `x42-reservation-authority.test.mjs` **3 pass / 1 fail → 4 pass / 0 fail**; file is
480 lines, under its own stated 500-line cap. Controls, each restored afterwards: dropping
`clara._adv_enrolment_admission` from the accepted-delegate list reds `ra4`; inverting the (6c)
predicate reds `ra4` with the measured SET clause printed.

### 2.4 · Whole-family regression check

`tests/f-a2-*.test.mjs` + `tests/x42*.test.mjs` in one run: **590 tests · 568 pass · 0 fail · 22
skip · 192 s**. The 22 skips are the pre-existing frontier-gated and dormant cells; nothing this
commit touches skips.

---

## 3 · Fix 2 — `2b30ddf2`: #646's merge guard counts its own firm

**Failure.** `p646.horn_a.no_work` — `2297 !== 2296`, a whole-database `clara.agent_tasks` count
moved by exactly one inside the cell's before/after window.

**Cause — a genuine defect in #646's own new file, not a merge artefact.** The cell took four
**whole-database** counts (`accounting_work`, `agent_tasks`, `operation_receipts`,
`agent_interruptions`) with no firm predicate. Under single-file iteration that is stable; under the
39-file estate run it is not. Measured on `clara_int` right now: **3033** `clara.agent_tasks` rows,
**2263** of them `queued`/`running`, almost none belonging to #646's world — the global form was
counting ~3000 rows it had no business counting, and one of them moving was enough. The file was
**16/16** the moment it ran alone.

**What I did.** The claim was never about the database — it is *"no door in THIS file mints Work for
THIS firm"* — so all four counts are now scoped to `FIRM_A()`. Narrowing a census is the move that
can make it vacuous, so two arms pay for it:

1. the scoping predicate is **asserted to name a real firm** before it is used (a census narrowed
   onto nothing counts zero everywhere and passes for free);
2. a **positive control at the very end** — after every assertion, so it moves none of them —
   admits one journal Work through the same door and fixture `p646.question.version` already uses in
   this file (so the cell leaves no residue of a kind this file does not already leave) and requires
   the scoped counter to move `work` **and** `tasks` by one each.

**Evidence.** `rig-docs-source-revision.test.mjs` **16 / 16 / 0**. Control, restored afterwards:
pointing the counts at `world.firms.B` instead of `FIRM_A()` reds the positive control — *"the
firm-scoped counter SEES an accounting_work this firm really mints"* — at 15/1. So the narrowed
census still cannot pass vacuously.

**All four touched files together:** `f-a2-tier-d` + `x42-advances-gap` +
`x42-reservation-authority` + `rig-docs-source-revision` = **33 tests · 33 pass · 0 fail · 0 skip**.

---

## 4 · `pnpm lint` (repo root)

`pnpm lint` from `C:\Users\zhant\Desktop\clara-wt\int`: **exit 0** — freeze-lint + the sibling
checkers + eslint + every workspace's own lint, unchanged from the merge report's §4 result.

---

## 5 · The nine named reds — what each one actually is

### 5.1 · `periodic-adjustment.test.mjs` (6 subtests, CLR13 model-egress) — shared-DB cross-file state

Re-confirmed on the same `clara_int`: **19 tests · 19 pass · 0 fail · 0 skip** running alone.
`periodic-adjustment.test.mjs` is unchanged by this wave (`git diff origin/main` is empty for it) and
is owned by none of the twelve tickets. Not fixed — the artefact is the run shape, not the file.
This is WAVE-DIGEST §5's documented `clara_rt_test`/shared-estate hazard in its db form.

### 5.2 · `delta-contract.test.mjs` — root cause found; pre-existing, not this wave's

The isolated re-run's `8 !== 7` is **not** a mystery and **not** a stale literal to widen. Measured
on `clara_int`:

```
clara.evaluator_versions:  8 rows, ALL deployed
clara.verify_evaluator_freeze() → {"ok":true,"verified_deployed":8,"verified_registered":8}
```

`delta-catalog-phase.mjs`'s cell *"freeze verifier positively reads registered live bodies,
deployment count exact for either witness shape"* expects `verified_deployed = 5 + fsPackDeployed +
card1V2Deployed` — i.e. **7** here — because it **excludes `prepayment_schedule` v1 from the
deployment census** on the stated grounds that it *"ships DARK until PR-2b"*. On this database it is
deployed. The body that deployed it is
**`packages/db/tests/f-a5b-sandbox-export-pr1.test.mjs:125`**:

```sql
update clara.evaluator_versions set deployed = true where not deployed and evaluator_name <> 'evaluate_fs_pack_agent'
```

— a blanket deploy of every undeployed closure except fs_pack. `0060`'s
`_tf_evaluator_deploy_once` makes that flip **one-way and permanent**, so once the estate suite has
run once, any later `delta-contract` run against the same database sees 8.

Both files (`f-a5b-sandbox-export-pr1.test.mjs`, `delta-catalog-phase.mjs`) are **byte-identical to
`origin/main`**, and **no wave migration registers or deploys an evaluator** (`grep` over
0199–0209: 0207 and 0208 only *name* the frozen `prepayment_schedule` closure in comments and in a
prestate that asserts it reproduces; neither writes `deployed`). So this red predates the wave and
reproduces on `origin/main` the same way. The full-run shape (`Connection terminated unexpectedly`)
is the same file under load, not a second defect. **Not fixed** — §6 follow-up (b) carries the
one-line repair.

### 5.3 · Four `spawnSync pg_dump ENOENT` reds — environment, measured

`pg_dump` is **not present anywhere on this Windows host**. `which pg_dump` → not found;
`C:\Program Files\PostgreSQL\16` (which *is* on `PATH`) contains only a `data` directory and **no
`bin`** — a stale install entry. WSL has `pg_dump (PostgreSQL) 17.11` at `/usr/bin/pg_dump`, which the
Windows Node process cannot spawn. RIG.md already records "No `psql` on Windows"; `pg_dump` is the
same gap, and `migrate-harness.mjs:149 cloneAmbientDatabase` is what needs it. Not code, not fixed.
(Note a PG16 client would not have helped against a 17.11 server anyway.)

### 5.4 · `637.pf: B3` (`rollback-preflight.test.mjs`) — pre-existing, and NOT reproducible here

`packages/runtime/tests/rollback-preflight.test.mjs` is **byte-identical to `origin/main`** and the
cell is #637's, from wave 2026-09-14. **It cannot be reproduced on `clara_int`**: measured,
`to_regclass('workflow.workflow_runs')` is **NULL** there, so the file's whole DB half skips — 31
tests, 11 pass, **20 skip**, 0 fail. The red therefore came from the World e2e's `clara_rt_test`
clone, which WAVE-DIGEST §5 documents as accumulating cross-lane state. Named, not fixed, and the
isolation verdict is honestly **unavailable on this rig** rather than "passes alone".

### 5.5 · `ready MAJOR-1` — flake, now CONFIRMED

`packages/runtime/tests/ready.test.mjs` run alone against the same rig: **24 tests · 24 pass · 0
fail**, including both `ready MAJOR-1` cells. The handover listed this as "unconfirmed — suspected
host-contention flake"; it is now **confirmed** as one, under DECISIONS §3.3 (6)'s own rule (a red in
a contention-prone file is a merge regression only if it reproduces in isolation). `ready.test.mjs`
is unchanged from `origin/main`.

### 5.6 · EICAR scanner — #693, untouched

RIG.md names it as a pre-existing Windows-only red (Defender quarantines the fixture on write). Not
touched, per the standing instruction.

---

## 6 · Follow-ups this round found (none is a blocker)

**(a) The F-A2 Tier-D vocabulary now has two commit-time reasons outside it.**
`t_je_adv_claim_application_birth` raises CLR40 `advance_allocation_mismatch` and CLR39
`advance_over_application` at COMMIT — genuine Tier-D aborts — but `TIER_D_TOKENS` is pinned at the
six *belt* tokens by `f-a2-ladder-3`'s `c3.D-vocab`. The exclusion is asserted rather than assumed,
and the question it leaves open is whether the ladder should own a commit-time vocabulary beyond the
belts. Worth an issue against #638.

**(b) `delta-contract` cannot be run twice against one database, and the fix is one line.**
`delta-catalog-phase.mjs` already reads `evaluate_fs_pack_agent`'s and `evaluate_metric` v2's
`deployed` flags *directly* rather than assuming them, precisely so the cell stays exact on a
re-run. `prepayment_schedule` v1 is the one closure it *excludes* instead, and
`f-a5b-sandbox-export-pr1.test.mjs:125` deploys it. Reading its flag the same way the other two are
read makes the cell exact in both shapes. Separately, the file's title says it "requires a fresh
disposable DB": running it out-of-line from the shared estate suite is the other half.

**(c) Two more unscoped whole-database count assertions are still out there.**
`rollback-preflight.test.mjs`'s `637.pf: B3` is the one that fired this round (§5.4); the class is
the same one fix 2 closed for #646. A sweep for `count(*) … from clara.(agent_tasks|accounting_work|
document_processing_tasks)` with no firm predicate would find the rest before CI's full-suite run
does.

**(d) `x42v.g4`'s three roster probes still read RAW `prosrc`, not comment-stripped source.**
The `writers()` helper in `x42-advances-gap.test.mjs` uses `p.prosrc ~*`, so a body that merely
*names* `insert into clara.staff_advance_applications` in a comment would join the roster. That is
0042 S5.14 (6b)'s measured blind spot, still open in this file. The arm I added reads normalized
source; the three roster probes were left as they are, because changing the instrument is a
different change from classifying a new writer. Worth an issue.

**(e) `clara_int` now carries 2263 queued/running `clara.agent_tasks`.** WAVE-DIGEST §5 already asks
for the shared `clara_rt_test` template to be reset between wave-integration runs; the same is true
of `clara_int` before any further full-suite run, or §5.1 and §5.4's class will simply recur.

---

## 7 · What was NOT done

1. **The successor cut is still not in this branch** — `chatTurn_v20`, `claraWork_v4`,
   `clientOnboarding_v5` remain uncut, exactly as the merge report §7 left them.
2. **No browser walk, no World e2e leg** was run this round (Playwright ports 3350/3351/3352 unused).
   Every fix here is db-estate, and each was verified by its own file plus its whole sibling family.
3. **No migration was edited**, and no prestate or tail was re-issued — none needed to be. The
   `_subledger_on_approve` roster hazard DECISIONS §3.3 (2) authorised a re-issue for did not fire
   (merge report §3), and nothing this round came near a migration.
4. **Rig cleanup** (WAVE-DIGEST §5's census) is still untouched; `rigint` is left up carrying the
   merged chain and this round's test state.
5. **Hosted: nothing.** No hosted run exists anywhere in this wave and none was attempted.
