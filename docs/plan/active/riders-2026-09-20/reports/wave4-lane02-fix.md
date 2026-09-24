# Wave 4 · lane 02 · review fix round — #930, #931

**Branch** `riders/w4-lane02` · **base** `cd2925391` · **new head** `71dc448ed`

Two new commits on top of the ten the reviews read:

| commit | subject |
|---|---|
| `95335ed5b` | `fix(db): #931 a second admission under one intent key never merges its list onto another payload's claim` |
| `71dc448ed` | `fix(web): #930 one shared "still outstanding" predicate, and the orphaned placeholder key removed` |

`git status` clean at `71dc448ed`. Nothing pushed, no PR, no GitHub write, no other worktree
touched. The only file written outside the worktree is this report.

---

## Verdict per finding

| id | severity | outcome |
|---|---|---|
| A931-1 | blocker | **reproduced and fixed** (migration 0301 §D + two driving cells) |
| STD-931-1 | major | **accepted as true, not fixable retroactively; no coverage gap remains** — measured below |
| SPEC-931-A | minor | **fixed by driving it** (`p931.replay.birth`) |
| SPEC-931-B / A931-2 | minor | **pinned by a cell, and the cost of the narrow reading measured**; the ruling itself is the owner's |
| A931-3 | minor | **reproduced and fixed** (`allocationsAreApportioned`) |
| STD-930-1 | minor (smell) | **fixed** — the fix was small and clearly better |
| SPEC-930-C | minor | **fixed** (key deleted) |

---

## A931-1 (blocker) — the allocation insert merged two payloads onto one claim

### Reproduced, on a throwaway clone

`createdb -T clara_l02 clara_l02_fix931` (dropped afterwards; `pg_database` is back to four,
verified). New cell `p931.race.graft` drives two real connections through the #638 battery's own
rung choreography (`withClientRungHeld` / `awaitRungWaiters`, `staff-expense-claim-fixtures.mjs`):
both admissions pass step 4 and step 5 against one world, queue on
`pg_advisory_xact_lock(203005004, …)`, and are released together.

Against the pre-fix door the cell is RED, four runs out of four, with
`outcomes ["ok","ok"]` — **both** admissions reported success. Reading the clone's rows afterwards:

```
 claim_id                             | claimed | allocated | lines
 7284a4a2-09e9-4574-b130-6bc19ade850c |   60500 |     81000 |     2
 e390897a-c593-4d43-8e1d-2c1feba95f1b |   60500 |     81000 |     2
 f49f2439-f0d2-4db8-b1f3-e9894c701479 |   60500 |     81000 |     2
```

Three claims whose confirmed list reads 81 000 sen against a 60 500 claim: the single-advance
caller won the claim insert, and the split caller's second advance was grafted onto it
(`on conflict (claim_id, advance_id) do nothing` skips the head they share and inserts the one they
do not). Tail T.3b counts exactly these as broken, and `clara._tf_adv_movement_belt` would refuse to
post them for ever. The runs where the split won instead are the other half of the same defect: the
single-advance caller was told `ok` and handed a `claim_id` whose stored record says something it
never confirmed.

`p931.race.ordinal` is the variant with the heads swapped. Against the pre-fix door, five of six
runs:

```
race.ordinal: the loser is a TYPED refusal, not a raw 23505 —
  "duplicate key value violates unique constraint uq_sec_allocations_claim_ordinal"
```

— the untyped 23505 the adversarial lens predicted, verbatim. `workErrorResponse` does not classify
it, so the route answers 500 `{error:"internal"}`.

### One correction to the review's mechanism

The adversarial report says `clara._admit_accounting_work_core` "converges on basis_digest alone".
Read at `pg_proc`: it converges on **`(firm_id, client_id, intent_key)`** and *compares* the digest.
Its replay branch is `select … where w.firm_id = v_firm and w.client_id = p_client and
w.intent_key = p_intent_key`. So the defect needs the race — two different intent keys with the same
basis mint two Works and cannot reach this. Everything else in the chain is as the review states,
including the measured digest equality between the single-advance claim and the split.

### The fix — migration `0301`, §D

```sql
    on conflict (work_id) do nothing
    returning id into v_claim;

  if v_claim is null then
    select sec.id, sec.basis into v_claim, v_prior_basis
      from clara.staff_expense_claims sec where sec.work_id = v_work;
    …
    if v_prior_basis is distinct from v_canon then
      raise exception … 'intent_payload_conflict' … 'field','claim' …
    end if;
    return v_res || jsonb_build_object('claim_id', v_claim);
  end if;
```

The claim insert now REPORTS whether it created the row; §8a runs only on the branch that did; the
other branch re-asks step 4's own comparison **under the rung** and answers the typed conflict. When
the payloads match it returns exactly as step 4's replay branch does — no second status row, no
second audit line — which is the answer step 4 would have given a moment later. It cannot be reached
with `replayed:false`, because a Work the core has just inserted cannot already carry a claim.

`p931.race.graft` and `p931.race.ordinal` are green on the patched clone (four and three runs
running) and green on `clara_l02`. The §D header and the door's `comment on function` were rewritten
to say what the guard is for.

---

## STD-931-1 (major) — the TDD-process finding

**True, and not fixable after the fact.** Commit `84cf37952` did add 95 % of migration 0301 against
one driving cell, and `a29f8be20` did land the walls' own cells later with no production change.
Nothing in this round can reorder a landed history, and the reviewer's own `required_fix` is
"None required post hoc".

What I *can* answer is whether a coverage gap survives. It does not — each wall has its own driving
cell today:

| wall (0301 §C) | cell |
|---|---|
| exact sum of the list | `p931.sum` |
| an advance named twice | `p931.twice` |
| not this claimant | `p931.claimant` |
| per-allocation temporal cap + typed shortfall | `p931.cap`, `p931.cap.single` |
| head consistency / changed split | `p931.split.conflict`, `p931.race.ordinal` |

And this round's own four cells were written the way rule 4 asks, which is the only useful reply to
a process finding: `p931.race.graft` was written first and seen RED for the right reason before one
line of §D moved; the three cells that could not be red-first (they pin properties the code already
had, or a reading awaiting a ruling) each carry the vacuity control the work order requires,
recorded below.

---

## SPEC-931-A — AC3's idempotence, driven

The public act that re-enters `t_je_adv_claim_application_birth` on an entry already approved is the
**reversal**: the trigger is `after insert or update … when (new.status = 'approved')`, and
`clara.reverse_entry` stamps `reversed_by` on the approved row. `p931.replay.birth` posts the
two-allocation claim, reverses it, and asserts the registration loop registered nothing twice — the
same two `claim`-kind rows, unchanged, keyed to the same credit leg; one correction per allocation
on the reversal entry; the claim's own day untouched (0 / 9 500) and the reversal's own day whole
again (40 000 / 30 000).

*Correction to my first draft of the cell:* the corrections carry the REVERSAL's posting date
(2026-09-24 on the rig), not the claim's, so "whole again" is asserted as of the reversal entry's
own `posting_date`, read from `clara.journal_entries` rather than from the register.

**Vacuity control.** With §E's idempotence probe removed and the migration redone, the cell fails —
`reverse_entry` raises **CLR39** (the second pass re-tests the cap against its own first pass). That
is proof both that the trigger really does re-enter and that the probe is what holds it. The file
was then restored byte for byte (`md5sum` compared) and redone.

The AC3 row of `wave4-lane02-ticket931.md` cited the #638 replay cells, which drive the door twice
and never re-fire the trigger. That citation is now superseded by a cell that drives the thing.

---

## SPEC-931-B / A931-2 — "belongs to this claimant", pinned and costed

I cannot rule on this, and I did not. What this round adds is the cell the ruling lands on and a
measurement of what each reading costs.

`p931.claimant.samelabel` builds two enrolments of ONE client written with the SAME `person_label` —
a different human, a different attestation, a different staff number — and a claim by the first that
discharges an advance issued under the second. It is **admitted**, and the cell pins that, including
the fact that the claim carries a `claimant.identifier` of its own which the ownership rule never
reads. `clara.staff_advance_accounts` carries no other discriminator (`\d` shows only
`person_label`, its attestation and the retirement check), so the arm cannot be tightened without a
staff master — a new column would be widening the ticket.

**Measured cost of the narrow reading.** With arm (b) removed and the migration redone, TWO cells go
red: `p931.claimant.samelabel` and `p931.accounts`. So arm (a) only does not merely narrow the
wall — it makes #931's own listed default ("advances on different enrolled accounts may be
discharged together") unreachable, and the form's cross-account split unreachable with it.

**The question for the owner, in one line:** two staff of one client who are written down under the
same name are one person to this rule; is that acceptable until a staff master lands (keep arm (b)),
or should a claim be refused unless the advance sits on the claimant's own enrolment (arm (a) only,
which turns off cross-account splits)? Both the migration header and `packages/db/README.md` now
name the limit and the measurement; the ruling belongs on #931 and the orchestrator owns writing it
there.

---

## A931-3 — deleting a line no longer restates a confirmed figure

Reproduced as two red cells before any code moved:

- `apps/web/lib/work/staff-expense-claim.test.ts` — `claimAllocations` on the surviving line
  returned `60500` where the preparer had confirmed `40000`.
- `apps/web/components/accounting/staff-expense-claim-form.test.tsx` — after clicking the editor's
  own second-row remove button, "Amount discharged" was nowhere in the rendered text.

Fix: `allocationsAreApportioned(rows)` is the ONE predicate — true for any list of two or more, and
for a list of one whose row already carries a positive figure (which is what a delete leaves, and
never what #930's untouched chooser holds, since its row is minted at zero). `claimAllocations`
consults it to decide whether the figure is the row's own or the claim's; the form consults it for
`amountLabel`. The exact-sum rule in `validateClaimDraft` is now unconditional, which it can safely
be, since an unapportioned one-line list is the whole claim by construction.

What the cell drives: after the delete the amount column is still on screen with the survivor's own
figure, submitting sends nothing and says "add up to the claim", and the preparer's own restatement
to 480.00 crosses as the single-advance shape exactly as before #931.

---

## STD-930-1 — the duplicated predicate, extracted

Small and clearly better, so fixed. `isOutstandingAdvance(row)` now lives in
`apps/web/lib/registers/staff-advances-doors.ts` beside the row type it reads, and both
`staff-advances-register.tsx` and `staff-expense-claim-form.tsx` import the symbol. Its own cell
pins what it deliberately does NOT ask: incomplete particulars and a retired enrolment are still
money owed, so both stay on offer — narrowing there would hide a real balance from the preparer.

## SPEC-930-C — the orphaned message key

`StaffExpenseClaim.advanceIdPlaceholder` deleted from `apps/web/messages/en.json`.
`grep -rn advanceIdPlaceholder apps/ packages/` now returns nothing; the JSON re-parses.

---

## Migration, pins and the redo path

**`packages/db/migrations/0301_staff_expense_claim_allocations.sql`** — this lane's own unmerged
migration, edited in place (§D's door only; §C, §E, §G and the tail are byte-unchanged apart from
the two comment blocks named above).

Re-applied with the supported redo mode — `CLARA_MIGRATION_REDO=0301_staff_expense_claim_allocations`
with `CLARA_ALLOW_DESTRUCTIVE=1` and `CLARA_RIG_DB=1` — **six** times in this round: five on the
throwaway clone (the fix, two vacuity breaks and their two restores) and once on `clara_l02` with the
final body. Every redo was reported as such by the prestate's own REDO branch. Afterwards
`pnpm migrate` on `clara_l02` reports `0 new migration(s) applied · 290 total`, i.e. the applied
checksum equals the committed file's.

**No pin moved.**

- The prestate's eight recut-body pins are 0221's PRE-images; §D's edit is to 0301's own post-image
  and cannot touch them. They are unchanged, and the REDO branch skips them anyway.
- Tail T.5's eleven non-regression pins name bodies 0301 does not recut;
  `clara.admit_staff_expense_claim_work` is NOT among them and is not sha-pinned anywhere. The tail
  ran green on both databases.
- The redo marker (`#931 (0301` in `clara._assert_claim_basis`) is untouched, so the bimodal
  prestate still branches correctly.
- **No web census re-measurement was needed**: `apps/web/tests/firm-scope-db-pins.corpus.ts` has no
  entry for 0301 (it lists only reviewed dynamic-SQL barriers, and 0301 needs none), and
  `firm-scope-db-pins.test.ts` is green inside the whole-suite run. Verified by
  `grep -rn 0301 apps/web/tests apps/web/test`.
- `packages/db/tests/rig-meta.mjs` cohort `SEC_ALLOCATIONS_0301_COHORT` lists function NAMES, not
  shas; unchanged, and `operation-census.test.mjs` is green.

**The FIRST-APPLY branch** is still proved only by the ticket report's rolled-back prestate probe —
a redo can only ever take the "already live" branch, and §D's edit does not change which branch the
prestate takes. The integrator still owes the true from-scratch chain on a disposable cluster.

---

## Gates, with counts (all on the lane rig, `127.0.0.1:55742/clara_l02`)

| gate | result |
|---|---|
| `packages/db` `tests/staff-expense-claim-allocations.test.mjs` (full gate chain) | **13 pass / 0 fail / 0 skipped** (was 9; +4 cells) |
| `packages/db` `tests/staff-expense-claim.test.mjs` (the #638 battery) | **24 pass / 0 fail** |
| `packages/db` `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` | **32 pass / 0 fail / 1 skipped** (T19 poison-role, self-skipping; no reset flag was ever set) |
| the four db files together | **70 tests · 69 pass / 0 fail / 1 skipped** |
| `pnpm migrate` (drift probe) | `0 new migration(s) applied · 290 total` |
| `apps/web` `lib/work/staff-expense-claim.test.ts` | **19 pass / 0 fail** (was 18) |
| `apps/web` `lib/registers/staff-advances-doors.test.ts` | **10 pass / 0 fail** (was 9) |
| `apps/web` `components/accounting/staff-expense-claim-form.test.tsx` | **15 pass / 0 fail** (was 14) |
| `apps/web` touched files together (incl. draft, a11y, keyboard) | **59 pass / 0 fail** |
| `apps/web` `node scripts/run-tests.mjs` (WHOLE unit suite) | **4998 tests · 4996 pass / 0 fail / 2 skipped** (baseline 4995 / 4993 / 2; +3 cells) |
| `pnpm typecheck` (repo root) | `packages/runtime Done`, `apps/web Done` |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root) | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm --filter @clara/web e2e staff-expense-claim-walk` on 3510/3511/3512 | **14 passed (30.0s)**, incl. `t931 the advance arm suggests a date-ordered split…` |

`pnpm lint` first failed on an assertion message in the new form cell — the #994
`#9xx`-looks-like-a-hex-colour selector. Reworded to "ticket 931" per the rule's own recommended
fix, never by weakening the rule; re-run exit 0. The whole web suite and typecheck were then re-run
at the final tree, and the figures above are from that run.

`pnpm typecheck` also caught one thing the cells could not: TypeScript cannot narrow `rows[0]` from
`allocationsAreApportioned(rows)`, so `claimAllocations` was restructured into an explicit
`only !== undefined && …` branch. Behaviour unchanged; the cells were re-run after it.

No Windows-only red appeared in any run.

---

## Rig hygiene

- One throwaway clone, `clara_l02_fix931` (`createdb -T clara_l02`), created twice and dropped both
  times. `select datname from pg_database` reads `clara_l02 · postgres · template0 · template1`
  (four rows), and `rig-isolation.test.mjs` is green afterwards.
- `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. No role was created. No
  second from-scratch chain was run on the cluster.
- `psql` is not on the Windows PATH on this host (`C:\Program Files\PostgreSQL\16\bin` does not
  exist); every ad-hoc query went through `MSYS_NO_PATHCONV=1 wsl -- /usr/lib/postgresql/17/bin/psql`,
  read-only except the one deliberate `create or replace function` of the PRE-fix door body on the
  clone for the A931-1 vacuity control. All git ran from Git Bash on Windows; no `git worktree`
  subcommand, no `git gc`, no `--depth` fetch.

---

## Docs updated in the same commits

- `packages/db/README.md`, #931 section: a new paragraph on why a second post-lock write merges
  rather than converges, with the measured `81000 against 60500` and the `23505` variant, and the
  guard that answers it; and the `samelabel` limit with the measured cost of the narrow reading.
- `apps/web/README.md`, #930 section: the chooser now names the shared `isOutstandingAdvance`
  symbol, with the reason the two copies were a promise rather than a wall. #931 section: the
  apportionment rule and why a delete does not restate the survivor.
- `CONTEXT.md`: **no change needed and none made.** "Allocation list" already carries
  `_Avoid_: … an allocation the register apportioned on its own`, which is exactly the rule A931-3's
  fix now enforces, and "Claimant handle" already carries the NAMED LIMIT that two people without
  dedicated accounts cannot be told apart. No new vocabulary was introduced.

## Shared files touched

`apps/web/messages/en.json` — one line REMOVED, at its sorted position, no reformatting. Nothing
else on work-order rule 7's list was touched. `apps/web/test/manifest.txt` is unchanged: every new
cell went into an existing test file.

Wave-4 lane rules: (a) `apps/web/lib/firm/needs-you.ts` is not in this lane's diff at all;
(b) nothing in `packages/runtime/workflows` or `lib` moved and freeze-lint is OK at 312 files — the
`chatTurn_v22` successor contract in `wave4-lane02-ticket931.md` §§1–10 is unchanged by this round
and still stands as written; (c) migration 0301 inserts no chart rows.

---

## Still owed to someone else

1. **The owner's ruling on the ownership arm** (SPEC-931-B / A931-2), with the measurement above.
   `p931.claimant.samelabel` is where it lands.
2. **The true from-scratch 0001 → 0301 chain** on a disposable cluster (SPEC-931-E) — the
   integrator's, unchanged by this round.
3. **The `chatTurn_v22` cut** must carry `wave4-lane02-ticket931.md` §§1–10 verbatim, and AC5's
   World e2e leg wants its own item so the cut alone does not close it (SPEC-931-D).
4. **Notes not in my brief and not acted on**, recorded so they are not lost: A931-4 (the door
   admits `advance_allocations: []`, the route refuses it `at_least_one`), A931-5 (an advance on a
   second enrolled account is refused `not_this_client`, which is the wrong name for it), A930-1 /
   SPEC-930-H (the chooser is scoped to the claimant's account while the settlement leg is an
   independent picker, and rows carry no `account_code`), A931-6 (removing every allocation row
   leaves `advanceRequired` addressed to a control that is no longer in the DOM). A931-5 and A930-1
   are one follow-up ticket; A931-4 is a two-line decision at the door.
