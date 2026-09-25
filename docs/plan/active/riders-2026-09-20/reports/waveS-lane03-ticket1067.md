# Riders sweep wave · lane 03 · ticket #1067 — the empty `advance_allocations` array

**Branch** `riders/wS-lane03` in `C:\Users\zhant\Desktop\clara-wt\656`, base `7bc5a710f`.
**Database** `clara_l06` on `127.0.0.1:55746` (chain 0001..0318 at start, 310 files / `0339` at end).
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `ee864a7db` | `fix(db): #1067 an advance_allocations array that is present carries at least one allocation` — migration `0339`, gate module, gate-chain entry, the first cell, the README section |
| `ae9ff6dd8` | `test(db): #1067 the empty allocation list is told apart from its neighbours, on both arms` — the three remaining cells, the vacuity control recorded in the README |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file.

---

## 1 · The seams I tested at

Written down before the first cell, from the brief's own "Key interfaces":

- **`clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)`** — the public
  door. AC1 names it explicitly ("submitted directly to"). Every behavioural cell drives it as
  `clara_runtime` through the battery's own wrapper; none reaches into the validator.
- **`clara._assert_claim_basis(uuid,jsonb,boolean)`** — the brief's second named interface. It is
  an internal body, so it is asserted only where this estate's own documented standard asks for a
  structural cell: the migration's prestate pins, its tail assertions, and the tail's own driven
  probes of the payload half (the exact call `admit_staff_expense_claim_work` step 2 makes).
- **`clara.get_staff_expense_claim(uuid)`** — the read, used by the AC3 cell to show that an
  untouched single-advance claim still stores its one-element confirmed list.
- Not a seam, and not touched: the runtime's `claimAllocationInputSchema` (the ticket puts its
  `.min(1)` out of scope) and every web module.

## 2 · Was the ticket still live? Yes, and it is worse on one arm and milder on another

`gh issue view 1067 --comments`: the body's Agent Brief is the whole contract — **zero comments**,
so no later brief and no owner ruling comment to override it.

Measured on `clara_l06` before writing anything (three `do $$` probes calling the payload half
directly, plus the driven cells below). 0301's payload half opens the allocation block with
`v_listed := jsonb_typeof(…) = 'array' and jsonb_array_length(…) > 0`
(`packages/db/migrations/0301_staff_expense_claim_allocations.sql:570-571`) and asks every list
rule under `if v_listed` (lines 583-644). A present-but-EMPTY array is therefore not a list at all
to the validator:

| shape | behaviour on the base branch | evidence |
|---|---|---|
| `advance_application` + `advance_allocations: []` + `advance_id` | **ADMITTED.** `clara._claim_allocations` (0301:310-337) falls through to its single-advance branch, so the door admits and would post against an advance the stated list does not name | cell `p1067.empty` red with `empty: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)` |
| `advance_application` + `advance_allocations: []`, no `advance_id` | refused, but with the world half's `advance_allocation_mismatch` / `claim.advance_id` / `present` (0301:737-741) — the refusal a claim that named **no** advance at all gets | cell `p1067.tellapart` red with the diff `actual ['claim.advance_id','present']` vs `expected ['claim.advance_allocations','at_least_one']` |
| any other settlement + `advance_allocations: []` | **ADMITTED and posted.** The rule that refuses a list on a non-advance settlement (0301:578-582) is itself gated on `v_listed` | cell `p1067.settlement` red with `settlement/reimbursement: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)` |

**Correction to the lane scan, with evidence.** `SWEEP-PLAN.md` (L3 paragraph) says an empty array
leaves "a claim carrying a valid `advance_account_code` admitted with **no advance existence,
ownership or cap check at all**", and calls it an authorisation gap. That is **not** what the code
does, and I could not reproduce it:

- with `advance_id` present, `clara._claim_allocations` returns the one-element single-advance list,
  so the world half's enrolment, ownership and per-allocation cap checks (0301:756-820) **all run**
  against that advance. The defect on this arm is an integrity one — the door admits a submission
  whose stated list is empty and silently records a different one — not an authorisation one;
- with `advance_id` absent, `clara._claim_allocations` returns `[]` and the world half raises at
  0301:737 before any posting. Refused, not admitted.

So the ticket's own framing (a missing named reason, two layers inconsistent) is the accurate one,
plus one live admission the ticket did not predict (the non-advance settlements, and the
advance-application arm that quietly rewrites the submission). Nothing here is an access-control
loosening in either direction; the change only ever refuses more.

## 3 · Acceptance criteria, each with its evidence

Every cell is in `packages/db/tests/staff-expense-claim-allocations.test.mjs` §9, gated on the new
frontier (below). Final focused run: **17 tests, 17 pass, 0 fail, 0 skipped.**

**AC1 — "a claim submitted directly to `clara.admit_staff_expense_claim_work` with
`advance_allocations: []` is refused with its own named reason, regardless of the claim's total."**

- `p1067.empty` — an advance application whose every other rule passes (60,500 sen of items, one
  80,000-sen advance seeded through the real disburse-and-approve path, the claimant owns it, the
  cap is nowhere near) is refused `CLR10` / `advance_allocation_mismatch` /
  `claim.advance_allocations` / `at_least_one`, and `refusesAlloc` proves no journal row, no
  committed receipt and no `staff_expense_claims` row were written. **PASS.**
- `p1067.settlement` — the same empty list on a **reimbursement** and on an **already-settled**
  claim is refused identically. This is the "regardless of" half: the rule is about the key, not
  about the money, so it cannot depend on the total or on the settlement. **PASS.**
- The migration's tail drives both arms again at apply time (`T.2`, `T.2c`), so a chain that
  applies 0339 without ever running the battery still proves it.

**AC2 — "the refusal reason is distinct from (or clearly a specialization of) the existing
exact-sum mismatch reason, so a reader can tell 'empty list' apart from 'list does not add up'."**

- `p1067.tellapart` — three submissions on one client, one assertion:
  `[["claim.advance_allocations","at_least_one"], ["claim.advance_allocations","exact_sum"],
  ["claim.advance_id","present"]]`. One reason (`advance_allocation_mismatch`), three named
  constraints, two fields. It also pins that the empty-list refusal states **no** `allocated_cents`
  (there is nothing to add up) while the exact-sum one states `60000` against `60500`. **PASS.**
- Chosen shape: reason stays `advance_allocation_mismatch` and the new word is the **constraint**
  `at_least_one` — a named specialisation, which is what AC2's parenthesis allows, and which is
  this validator's own idiom (`claim.items` is judged `array` then `at_least_one` the same way).
  `at_least_one` is also exactly the word the runtime already refuses an empty list under
  (`packages/runtime/src/workRoutes.ts:605`), so the two layers now say the same thing rather than
  two things. Tail `T.2e` drives the `exact_sum` contrast at apply time.

**AC3 — "existing single-advance claims (which carry no `advance_allocations` key at all) are
unaffected."**

- `p1067.absent` — a single-advance claim with **no** key is admitted and reads back through
  `clara.get_staff_expense_claim` as the one-element confirmed list `[[advance, 60500]]` with the
  claim row's own `advance_id` as that head; a claim carrying **JSON `null`** under the key is
  admitted the same way (0221's type rule admits `null` as "absent" and 0339 does not move that).
  **PASS.**
- The whole pre-existing #931 battery still passes unchanged (13 cells), and so does the 0221
  battery `staff-expense-claim.test.mjs` (24 cells) — see the gate counts.
- Tail `T.3` drives both non-refused shapes and `T.4`/`T.4b` re-prove that a single-advance claim
  still canonicalises **without** an `advance_allocations` key (so every stored claim replays byte
  for byte) and still derives exactly one credit leg.

**Out of scope, respected.** The runtime's `.min(1)` is untouched; no change to how a non-empty,
non-matching list is refused (`p931.sum` still green, `exact_sum` unmoved).

## 4 · The change

One statement: `create or replace function clara._assert_claim_basis(uuid,jsonb,boolean)` — 0301's
body **byte for byte** plus one rule. Proved mechanically, not asserted:
`diff` of 0301's lines 419-852 against the new file's function block reports a single hunk,
`158a159,186`, which is the inserted comment and the inserted `if`. Nothing else moved.

The rule sits immediately after "is `advance_allocations` an array?" and immediately before
anything that reads what the array says:

```sql
if jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
   and jsonb_array_length(p_claim -> 'advance_allocations') = 0 then
  raise exception 'this claim states an allocation list and allocates nothing'
    using errcode='CLR10',
    detail='{"reason":"advance_allocation_mismatch","field":"claim.advance_allocations","constraint":"at_least_one"}';
end if;
```

A side effect worth naming: this makes `v_listed` **honest**. After 0339 it is false only when the
key is absent or JSON `null` — every other present shape is refused by name before it is read — so
the settlement, distinctness, exact-sum and head rules can no longer be skipped by an empty array.
That is why I did not also widen the `v_listed` guard on the settlement rule: the hole is closed at
its source, and widening it would change which named reason a reimbursement + empty list receives,
which AC1 wants to be the empty-list reason.

## 5 · Migration

**`packages/db/migrations/0339_staff_expense_claim_empty_allocation.sql`** (795 lines, the reserved
number, the only migration this ticket needed).

Post-image of the recut body:
`5c55fc8d860bc74c4fd721a81442b4ea19ed66240ef3d20386efd53e2a2cd294`.

### Prestate pins — every one measured live on `clara_l06` at chain 0001..0318

Recut (skipped on the REDO branch, checked on first apply):

| signature | sha256(prosrc) |
|---|---|
| `clara._assert_claim_basis(uuid,jsonb,boolean)` | `e439346cbf68a267b143aa2fe03c5285acd7eed3f769b0c0c6a0c31c38aae04a` |

Non-regression, pinned in the prestate **and** re-measured in the tail (`T.5`), checked on both
branches:

| signature | sha256(prosrc) |
|---|---|
| `clara._claim_allocations(jsonb)` | `c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737` |
| `clara._claim_settlement_account(jsonb)` | `49819cebb6b43dc99ba28adcbf90345227870d3ffdadae7edb42b26faee360ce` |
| `clara._claim_basis_canonical(jsonb)` | `42439eb94a7e2bcc5d8e7f1ba1cb88c01c234f0f9e6a9af694ef525cee8b2b5c` |
| `clara._claim_journal_basis(jsonb)` | `78de12f565d332db3a16d98a37c5cb98cacda392f3daff3a7b4666c1319b5cf9` |
| `clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)` | `8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2` |
| `clara._tf_adv_claim_application_birth()` | `ab8efc36688a911f78c783b2e18845812771f880179df7709f830cc92effaee0` |
| `clara._claim_resolve_claimant(uuid,uuid,jsonb,text)` | `5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c` |
| `clara._claim_item_total(jsonb)` | `72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c` |
| `clara._adv_over_application(uuid,bigint,date,bigint,date)` | `b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769` |
| `clara._adv_enrolment_at(uuid,text,timestamptz)` | `54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe` |

**For the integrator:** `clara._assert_claim_basis` is also the body **#1052** recuts later in this
lane, and it is the only pin of mine another ticket is expected to move. The nine claim-family
bodies above are 0301's post-images; lane 03's later tickets must re-derive against
`5c55fc8d…` for the validator once 0339 is live. No other lane in the wave is planned to touch
this family (`SWEEP-PLAN.md` shared-file table).

### Tail assertions (all driven, none described)

`T.1` owner / `SECURITY DEFINER` / pinned `search_path` / no PUBLIC EXECUTE; `T.1c` this file's
marker present; `T.1d` **0301's** marker still present, so the recut is 0301's body plus a rule and
not a rewrite. `T.2`/`T.2c` the refusal driven on an advance application and on a reimbursement,
reading `reason`, `field` and `constraint` back out of `pg_exception_detail`. `T.2e` the
`exact_sum` contrast driven. `T.3` the two shapes it must **not** refuse, driven. `T.4` the
single-advance canonical form and its one credit leg. `T.5` the ten pins re-measured. `T.6` no
stored claim on the database carries an empty `advance_allocations` key in its canonical basis
(a count over every row, always evaluated — no data-dependent branch anywhere in this file).

### Apply, redo and the first-apply branch

- **First apply** through `pnpm --filter @clara/db migrate`:
  `#1067 prestate: clean (FIRST apply)` then `#1067 tail OK: …`, `applied
  0339_staff_expense_claim_empty_allocation`, ledger `310 total`.
- **The first-apply branch re-proved by hand** (wave-3 addendum: a marker-tolerant pin hides its
  sha branch from a redo). Inside one transaction that was rolled back: 0301's own
  `create or replace` for this body re-run as `clara_fn_owner`, live sha read back as
  `e439346c…` exactly, then the prestate block run **verbatim** → `clean (FIRST apply)`, then
  `rollback`; the live body afterwards is `5c55fc8d…` again.
- **REDO (#957)** exercised twice, both branches:
  `CLARA_MIGRATION_REDO=0339_staff_expense_claim_empty_allocation` with 0301's body live took the
  sha branch (`clean (FIRST apply)`), and a second redo over the file's own post-image took the
  marker branch (`the validator already carries this file's marker … clean (REDO apply)`). Both
  re-ran the tail green. New checksum both times:
  `e2ceaec382f3206542eb83985a0cf940454c76870e3f8c26b7e03ff18ddb07e1`.
- **No `rig-meta.mjs` cohort**, deliberately and by precedent: the file mints no new name
  (no table, no new function, no grant), exactly like 0303, 0304, 0309, 0310, 0311, 0315, 0316 and
  0318, none of which carry one. The `SWEEP-PLAN.md` rule is "one cohort entry per migration that
  mints a new name".

### Frontier and gate chain

- Stem `staff_expense_claim_empty_allocation$` (distinct from 0301's
  `staff_expense_claim_allocations$`; neither regex matches the other's version string).
- New module `packages/db/tests/staff-expense-claim-empty-allocation-preintegration-gate.mjs`
  setting `CLARA_ALLOW_MISSING_SEC_EMPTY_ALLOCATION=1`, mirroring
  `schedule-term-correction-preintegration-gate.mjs`.
- Gate-chain entry appended to `packages/db/package.json`'s `test` script at its **migration-order**
  position, immediately after `schedule-term-correction` (0317) and immediately before the glob —
  a one-token hunk in a shared file. Chain is now **126** gates.
- The cells use the two-frontier idiom `if (await gateAlloc(t) || await gateEmpty(t)) return;`
  (`prepayment-stated-term.test.mjs`'s own pattern), so a database carrying 0301 but not 0339
  skips loudly under a sweep and fails loudly under a focused run.

## 6 · The vacuity control

Required because three of the four cells were written after the recut landed, and because one of
them is a pure non-regression pin. With 0301's body put back on `clara_l06` byte for byte (live sha
read back as `e439346c…`) and the ledger untouched:

| cell | against the broken subject |
|---|---|
| `p1067.empty` | **FAIL** — `empty: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)` |
| `p1067.tellapart` | **FAIL** — `actual ['claim.advance_id','present']` vs `expected ['claim.advance_allocations','at_least_one']` |
| `p1067.settlement` | **FAIL** — `settlement/reimbursement: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)` |
| `p1067.absent` | **PASS**, correctly — it pins behaviour the change must not move (AC3) |

`4 tests, 1 pass, 3 fail`. The subject was then restored through the supported redo mode and all
four are green again (`4 pass, 0 fail`). Only `p1067.empty` was genuinely red-first in the TDD
sense (written, run red against the unmodified base, then the minimal code); the other three were
written after and their red is the control above. Stated plainly rather than dressed up.

## 7 · Gates, with counts

Run from `C:\Users\zhant\Desktop\clara-wt\656`, `PGPORT=55746 PGDATABASE=clara_l06`, Node 22.

| gate | command | result |
|---|---|---|
| the test file I touched, FULL gate chain (126 `--import`) | `node --test --test-concurrency=1 $GATES tests/staff-expense-claim-allocations.test.mjs` | **17 tests, 17 pass, 0 fail, 0 skipped** |
| the same file FOCUSED (no gates — the acceptance shape) | `node --test --test-concurrency=1 tests/…-allocations.test.mjs` | **17 pass, 0 fail, 0 skipped** |
| neighbour battery the recut validator serves | `… $GATES tests/staff-expense-claim.test.mjs` | **24 pass, 0 fail, 0 skipped** |
| operation census | `… $GATES tests/operation-census.test.mjs` | **10 pass, 0 fail, 0 skipped** |
| rig isolation (no reset flags) | `… $GATES tests/rig-isolation.test.mjs` | **23 tests, 22 pass, 0 fail, 1 skipped** — the skip is T19 `poison-role`, `SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`, which the rig forbids |
| web migration-pins corpus (sweep rule d: a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 pass, 0 fail** — no corpus edit needed: 0339 contains no dynamic SQL, so it needs no reviewed barrier entry, and the corpus reads the directory rather than pinning a file count |
| web claim refusal-mapper (evidence for §8, not a required gate) | `… --test lib/work/staff-expense-claim.test.ts` | **19 pass, 0 fail** |
| typecheck | `pnpm typecheck` | apps/web Done, packages/runtime Done |
| lint | `pnpm lint` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |

`apps/web` and `packages/runtime` source were **not** touched, so the whole web unit suite and the
browser walks are not in scope for this ticket; the two web files above were run as evidence, not
as gates. No known Windows-only red was hit.

## 8 · Successor contract

**None is owed.** No frozen chat tool, Work tool or closure module needs a change, and none was
edited. Recorded here with its evidence because the wave asks for the check, not for a guess:

- The refusal's reason `advance_allocation_mismatch` is already on the runtime's roster and already
  rides back under its own name (`packages/runtime/src/workRoutes.ts:88-92`); it is **not** in
  `CONSTRAINT_FOLD_REASONS` (`invalid_basis`, `invalid_source_ref`, `invalid_claim`), so nothing
  folds and no vocabulary moves.
- The new token is readable as `detail.constraint` on the wire: `workErrorResponse`'s `answer()`
  attaches the door's own detail object to every carrier (`workRoutes.ts:1036-1042`), exactly as it
  already does for `exact_sum`.
- The field maps to a control with no edit: the door raises `claim.advance_allocations`,
  `toWireField` re-spells it `claim.advanceAllocations`, and `fieldForClaimPath`
  (`apps/web/lib/work/staff-expense-claim.ts:620-624, 678-679`) already maps both spellings onto
  the `advanceAllocations` control — pinned by `lib/work/staff-expense-claim.test.ts` rows 290-291,
  which I ran green (19/19).
- The runtime's wire schema already refuses an empty list before the door is reached
  (`workRoutes.ts:602-607`), so no chat-originated claim can produce this refusal; it exists for
  every other caller, which is the ticket's point.

## 9 · Docs

- `packages/db/README.md` — a new `## 0339` section only (no existing section edited): what was
  live and how it was measured, the rule and where it sits, the word and why, the redo branches and
  the vacuity control with both shas. 65 lines.
- No `CONTEXT.md` change: the file coins no domain term. "Allocation list" is 0301's vocabulary and
  is unchanged; `at_least_one` is a constraint token, not a concept.
- No `packages/db/tests/README.md` section: that file's per-migration sections stop at 0289 and no
  wave-4 or sweep migration has added one.
- `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched, as the work order requires.

## 10 · Follow-ups worth filing

1. **The lane scan's #1067 escalation should be corrected in `SWEEP-PLAN.md`** (not a ticket — a
   note for the orchestrator). The "no advance existence, ownership or cap check at all"
   authorisation gap is not reproducible: with `advance_id` present every world check runs, and
   with it absent the claim is refused. §2 above has the evidence. Left as-is by me because the
   plan is the orchestrator's file.
2. **`clara._claim_allocations`'s silent fall-through is still there** and is now unreachable from
   the door (0339 refuses the empty array first), but the derivation itself would still turn
   `{advance_allocations: [], advance_id: X}` into a one-element list for any future caller that
   does not go through `_assert_claim_basis`. I deliberately did not widen it: the ticket scopes the
   fix to the validator, it is pinned as non-regression here, and #1052 recuts this family next.
   Worth a small ticket to make the normaliser refuse-or-return-`[]` on that shape once the lane's
   own recuts have settled.
3. **The DB and the runtime order the two list refusals differently** for one payload only: a
   non-advance settlement carrying an empty list answers `at_least_one` at the door and would answer
   `settlement` at the runtime (`workRoutes.ts:595-597` tests "present" where the door tests
   "non-empty"). Only a direct DB caller can observe it, because the runtime refuses the payload
   before the door sees it, and AC1 wants the empty-list reason unconditionally — so this is a
   recorded, deliberate residue, not a defect. Worth one line in a future consistency pass.

## 11 · Anything unverified

- **A from-scratch 0001→0339 chain was not run here**, by the rig's own rule (a second from-scratch
  chain on a lane cluster needs the #867 recipe; migration 0154 pins the cluster-wide role count).
  The integrator's disposable-cluster run is the proof. What I can state is that the prestate's
  first-apply branch passes against the real 0301 pre-image (§5) and that the tail passes on both
  branches.
- **Not run under WSL as `runner`**: I added no `packages/runtime` test file, so the addendum's
  Linux re-run does not apply. The db cells reach no spool and no filesystem path.
- **A mid-task status request**: none arrived.
