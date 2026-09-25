# riders sweep wave · lane 02 · ticket #1078 — the prepayment-account roster reserves its enrolled codes

**Status: done** (the reservation half, which is the half the owner ruled; the deactivation half is
ruled out and nothing was built for it).

- Branch `riders/wS-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base `7bc5a710f`.
- Database `clara_l05` on `127.0.0.1:55745`. Ledger before this ticket: **311 files, max
  `0336_revenue_recognition_plan_op_key`** (#1114, #1077 and #1079 landed first). After: **312 files,
  max `0337_prepayment_account_reservation`**, checksum
  `8810de61a8004fede8a5f43f26d05a5fd4dfa4ce63a34e38f5fc617666bd5248`.
- Seven commits, all on this branch, none pushed:

| commit | what |
|---|---|
| `4b6949634` | slice 1 — 0337 §A (the roster arm) + §B (the posting wall skips it), two cells, the amended #940 cell, the README section |
| `1cda265d6` | slice 2 — §C, the bank belt's reason token per domain, with `p1078.claim.bank` |
| `96d9f1b0f` | slice 3 — §D, the fixed-asset profile door's remedy per domain, with `p1078.claim.fixed_asset` |
| `6d55c4c05` | slice 4 — §E, the staff-advance admission predicate's third remedy branch, with `p1078.claim.staff_advance` |
| `70ee8f657` | slice 5 — `p1078.census.authority`, the structural cell, plus the vacuity control and the first-apply proof |
| `3532df697` | polish — five unused imports the growing battery left behind (eslint `no-unused-vars`) |
| `61c3c5515` | polish — the amended `p915.obo.roster_first` (the whole-suite run found it), the prestate's asker list widened to all seven, three comment corrections |

**The ticket is still live on this branch, and its contract is the ruling, not the body.**
`gh issue view 1078`: state **open**, label `needs-info`, **one comment**, dated **2026-09-24**,
which is the delegated ruling and is exactly the ruling the lane prompt restates:

> `account_inactive` is a known, harmless dead axis for chart accounts: no deactivation door is
> built. The prepayment roster DOES reserve its enrolled accounts, the way its fixed-asset and
> staff-advance siblings already do: that half joins the sweep wave's lane L2 as a rider with its own
> migration.

Nothing on `main` had done it: at `7bc5a710f`, `clara._acct_role_reserved`
(`packages/db/migrations/0043_wave_d_b1_staff_advances.sql:756`) unioned the fixed-asset family and
the staff-advance register only, and `grep -rn "prepayment_account_enrolments" packages/db/migrations`
found the relation read by nothing but its own three roster bodies.

**No message arrived mid-task.**

---

## The seams I tested at (written before the first test, work order rule 4)

Every seam is a public door or a governed read the ruling names, except the two marked
*structural*, which are the house standard the work order admits ("a catalog census, a prestate pin,
a tail assertion").

1. `clara.enrol_prepayment_account(p_client, p_account, p_purpose, p_reason, p_op_key)` — the roster's
   enrolment door, driven as BOB, an ordinary bookkeeper.
2. `clara.retire_prepayment_account(p_client, p_account, p_purpose, p_op_key)` — the release door the
   three refusals now name.
3. `clara.add_bank_account(p_client, p_bank_code, p_account_number, p_coa_account_code, p_op_key)` —
   the ticket's own headline claim ("can be bound as a bank account"), driven as ALICE (admin).
4. `clara.upsert_fa_account_profile(p_client, p_asset_account, p_accum_account, p_depr_expense_account, p_op_key)`
   — the fixed-asset register's enrolment door.
5. `clara.enrol_staff_advance_account(p_client, p_account_code, p_person_label, p_confirm_dedicated, p_attestation, p_op_key)`
   — the staff-advance register's enrolment door, admin floor.
6. `clara.create_prepayment_schedule(...)` — the lane the reservation must not break, driven end to
   end on an enrolled account.
7. `clara._acct_role_reserved(p_client, p_code)` and `clara._adj_line_eligibility_breach(p_client, p_lines)`
   — read as `rootQuery`, because both are ungranted definer-path readers and they are the
   *instruments* for "which register holds this code" and "what does the posting wall answer". No
   cell asserts a door's behaviour through them.
8. `clara._adv_enrolment_admission(p_client, p_code, null)` — read directly for its `advice`, because
   that sentence is what `clara._adv_on_approve` shows a person and it is not reachable from the
   enrolment door's refusal detail.
9. *Structural*: `pg_proc.prosrc` over the whole `clara` schema — the consumer census, the
   domain-minting census and the attribution pin.

**I did not test at** `clara._draft_opening_item_core` (see "what was deliberately left"), at
`clara._fa_reversal_blocked` (its sentence is domain-neutral and unchanged; its text is pinned
instead), or at any web surface — nothing under `apps/web` was edited and no browser path reaches a
reservation.

---

## What the defect actually is, measured

`clara.enrol_prepayment_account` wrote a roster row and reserved **nothing**. The shared reservation
census `clara._acct_role_reserved` — the one authority the bank belt, the fixed-asset discriminator
and the staff-advance admission predicate all read — had never heard of
`clara.prepayment_account_enrolments`. Measured on this rig at `0336`, before a line was written:

| probe | answer before 0337 |
|---|---|
| `clara._acct_role_reserved(client, '19000101')` after enrolling `19000101` | **0 rows** |
| `clara.add_bank_account` on that same enrolled code | **succeeded** |

The collision then surfaced days later at the schedule door, as `prepayment_source_unfit` /
`prepaid_account_ineligible` with the shared wall's `bank_account` axis — the ticket's own sentence,
"nothing prevents the double-enrolment from happening in the first place". The cells that measured it
are `p1078.reserve.roster` and `p1078.claim.bank`, both red on the pre-0337 catalog (see "reds").

### The fix, and the one thing it forced

| § | body | what moves |
|---|---|---|
| A | `clara._acct_role_reserved` | a third arm over **LIVE** roster enrolments: `domain='prepayment'`, `role=` the enrolment's purpose, `owner_ref=` the code |
| B | `clara._adj_line_eligibility_breach` | its reservation read skips the new domain, so every answer this wall gives is the answer it gave before 0337 |
| C | `clara._fa_assert_code_unreserved` | the bank belt's machine reason is per domain (`coa_account_prepayment_reserved`; the advance literal byte-unchanged) |
| D | `clara.upsert_fa_account_profile` | its refusal's remedy clause is per domain (`retire_prepayment_account`; the advance clause word-unchanged) |
| E | `clara._adv_enrolment_admission` | a third remedy branch, `retire_prepayment_enrolment_then_re_enrol`, with its own advice |

§A is the whole of the reservation — one arm, three claim doors, because they all read the one
census. A fourth reader spliced into three doors is the drift 0042's own tails exist to prevent.

**§B is forced by §A and is the load-bearing half.** The fixed-asset and staff-advance reservations
mean "a register machine owns this code; an ad-hoc line must not touch it". A prepayment-roster
enrolment means the opposite: the account IS the prepaid asset (or the contract liability) the
amortisation lane posts against, and that lane asks the shared wall about that very code in **seven**
places: the two create cores, the two correction doors, the two attention reads and
`clara.enrol_prepayment_account` itself — all seven probed structurally in §0 rather than pinned. Because the wall
could not see the roster *before* 0337 either, filtering the domain out is exactly what keeps every
answer identical, which `p1078.wall.unmoved` measures at the wall AND at the doors.

**The §A-in / §B-out state, measured** — not reasoned. All five bodies were restored to their
pre-images and §A alone was re-installed (`clara._acct_role_reserved` with the roster arm, the wall
untouched). The prepayment-roster and reservation batteries together went to **2 pass / 10 fail**,
and the four reds that matter are exactly the three consequences §B's own comment predicts:

| cell | what it answered with §A in and §B out |
|---|---|
| `p1078.wall.unmoved` | `the wall must not see the prepayment domain — its answers are the same before and after 0337` |
| `p940.enrol.records` | `account 19000004 cannot be enrolled as a prepayment account for this client` — a bookkeeper restating the reason on a LIVE enrolment, refused by that enrolment |
| `p940.schedule.roster_gate` | `account 19000006 holds this entry's debited asset, and it cannot carry a prepayment` — the schedule door refusing its own enrolled prepaid leg |
| `p940.attention.arm_b_roster` | `the enrolled recognition is advertised` — arm B dropped every candidate it exists to offer |

The migration was then re-applied and both batteries are green again. The two cells that stayed green
in that state (`p1078.reserve.roster`, `p940.enrol.race`) are the two that never ask the wall, which
is the control.

§C, §D and §E each needed **no new gate** — §A alone makes all three doors refuse — only that what
they SAY stays true once a third register can hold a code. §D and §E named
`retire_staff_advance_account` as the remedy whatever register held the claim, which for a roster
enrolment is a door that cannot release it: the dead end the WDB-R2 ruling of 2026-08-03 ordered
eradicated from exactly this family of sentences.

---

## Acceptance criteria, each with its evidence

#1078 is an owner question, so its acceptance is the ruling's two sentences. Both are answered.

### AC1 — "`account_inactive` is a known, harmless dead axis for chart accounts: no deactivation door is built."

**Nothing was built, and the axis is no more reachable than it was.** 0337 touches no chart-account
door, mints no deactivation verb and does not remove the `account_inactive` arm from the wall (the
tail asserts all five axes are still spoken — `0337 tail` item 3). The claim that the axis is
unreachable is measured rather than assumed: on the live catalog only two bodies ever `update
clara.coa_accounts` (`clara.remap_bank_account_coa`, `clara._add_bank_account_core`) and neither
names `is_active` at all; of the two inserters, `clara._coa_plant_family` never names it either and
`clara._upsert_account_core` names it exactly once, as `is_active=true` in its
`on conflict do update`. **No body in the whole `clara` schema matches `is_active\s*=\s*false`.**
Recorded in the migration header, the README section and `p940.schedule.roster_gate`'s own comment.

### AC2 — "The prepayment roster DOES reserve its enrolled accounts, the way its fixed-asset and staff-advance siblings already do."

All six cells live in `packages/db/tests/prepayment-account-reservation.test.mjs`; all **PASS**.

| cell | what it proves | seam driven |
|---|---|---|
| `p1078.reserve.roster` | a live enrolment reserves exactly once, `domain='prepayment'`, `role=` the purpose, `owner_ref=` the code; a **deferred-revenue** enrolment reserves the same way with its own role; **retirement releases** and releases only its own code | enrol + retire doors, census read |
| `p1078.claim.bank` | the bank belt refuses an enrolled code, names the register in the sentence AND in a reason token of its own, **binds nothing**; the advance domain still answers `coa_account_advance_reserved`; retiring the enrolment lets the binding really happen | `add_bank_account`, `enrol_staff_advance_account`, `retire_prepayment_account`, `clara.bank_accounts` row count |
| `p1078.claim.fixed_asset` | the FA profile door refuses with 0041's own `fa_profile_invalid`/`role_reserved`, names `retire_prepayment_account` and **not** `retire_staff_advance_account`, enrols no profile; the named remedy is then driven and the profile enrols; the advance branch's words are unchanged | `upsert_fa_account_profile`, `clara.fa_account_profiles` row count |
| `p1078.claim.staff_advance` | the advance door refuses with 0043's own `advance_enrolment_invalid`/`role_reserved`, carries remedy `retire_prepayment_enrolment_then_re_enrol`, and the **advice** names `retire_prepayment_account` and not the advance door; enrols nothing; the remedy is driven and the advance enrolment lands; the FA branch's remedy is unchanged | `enrol_staff_advance_account`, `clara._adv_enrolment_admission`, `clara.staff_advance_accounts` row count |
| `p1078.wall.unmoved` | the posting wall answers `null` for an enrolled code before and after; the schedule door still admits it end to end; a restated enrolment reason still version-forwards; the `control_account` and `account_unknown` axes are unmoved | `clara._adj_line_eligibility_breach`, `create_prepayment_schedule`, `enrol_prepayment_account` |
| `p1078.census.authority` | *structural*: the census's consumer set is exactly the four bodies; the `prepayment` domain is minted in exactly one body; the as-of twin has no prepayment arm; all five recut bodies still carry `#1078 [0337]` | `pg_proc` |

### The reds, each for the right reason

Work order rule 4 asks for one test → red for the right reason → the minimal code. Every cell was
red before its section, and each red was the *specific* thing the section fixes:

| cell | the red, verbatim |
|---|---|
| `p1078.reserve.roster` | `an enrolled prepayment account is reserved exactly once (got [])` — 0 !== 1 |
| `p1078.wall.unmoved` | `mandatory setup: the enrolment reserved the code` — 0 !== 1 (before §A); then, with §A in and §B out, the schedule door refused its own enrolled prepaid leg |
| `p1078.claim.bank` | `expected detail.reason="coa_account_prepayment_reserved" … got {"reason":"coa_account_advance_reserved","reservation_domain":"prepayment",…}` — the refusal fired, the token lied |
| `p1078.claim.fixed_asset` | `the refusal names the door that releases THIS claim: … retire that enrolment first (retire_staff_advance_account, which needs every advance on it settled)` |
| `p1078.claim.staff_advance` | `the remedy TOKEN is the roster's own` — actual `retire_advance_enrolment_then_re_enrol` |
| `p1078.census.authority` | vacuity control, below |

To take a behavioural red on the FIRST cells (the frontier gate would otherwise have failed on "the
migration is absent", which is not a red about behaviour) the gate line in `cell()` was bypassed for
one run and **restored byte for byte**; `diff` against the pre-bypass copy reported identical.

**Vacuity control for the structural cell, and the first-apply proof in the same act.** All five
recut bodies were restored to their measured pre-images by hand (each one's `sha256(prosrc)` was
re-measured and matched the prestate pin exactly). The whole battery went **0 pass / 6 fail**,
including `p1078.census.authority`. The migration was then re-applied and its prestate reported
**`5 FIRST, 0 REDO`** — the branch `CLARA_MIGRATION_REDO` can never take — with the file checksum
unchanged. The battery is 6/6 again.

---

## The migration

`packages/db/migrations/0337_prepayment_account_reservation.sql` — **962 lines**, checksum
`8810de61a8004fede8a5f43f26d05a5fd4dfa4ce63a34e38f5fc617666bd5248`. Applied with
`pnpm --filter @clara/db migrate`; **re-applied eight times** with
`CLARA_MIGRATION_REDO=0337_prepayment_account_reservation` as the file grew section by section, as its
header and prestate were corrected, and to restore the lane after each of the two by-hand
measurements below. It is redo-safe by construction: every statement is
`create or replace function`, and each recut body admits two pre-images (its pinned sha, or a body
already carrying this file's `0337` attribution).

Every recut body in this file is the **live `pg_proc.prosrc`**, extracted from this database and
hashed against its pin before a character changed, with the edits applied as asserted single-hit
replacements. Byte fidelity is mechanical, not hoped for.

### Prestate pins — RECUT (five), measured on `clara_l05` at 311 files / `0336`

| signature | pre-image `sha256(prosrc)` | post-image |
|---|---|---|
| `clara._acct_role_reserved(uuid,text)` | `e1b44ed0c2449c4e4947e40b0d9d2675da73d02c7365e90453382e158ebf69cd` | `dcd352f0ef697b39b675c26e9dbd369756ca026f5f71ec9be832e8de20223c0f` |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` | `53137471bc99c7cfd83e30b58d6f5f01ae111195ee028c48a024f79b3f5fa7b5` |
| `clara._fa_assert_code_unreserved(uuid,text)` | `816f9c24c6cf36b876c7fa3ec1df8a6eac4d492e5f139a8d64755caef534203b` | `5cba0262cf2e6f24185a230d9a94bda053ebda77952641478b4eaa8fb66086a1` |
| `clara.upsert_fa_account_profile(uuid,text,text,text,text)` | `14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c` | `0610db640ba30d572033db41de895f2a00bdfbd3f7a56c42ac4cfcd99403d2f1` |
| `clara._adv_enrolment_admission(uuid,text,uuid)` | `55a2bf3c3020202c32e513219e83c8f3b72a23640100431436137ea8b2949f2a` | `d7cd85c26e6914ca4075737f2d85a87d47e25dd124989fe84ea6aac0866b276f` |

### Prestate pins — KEEP (eight), bodies this file relies on and does not edit

| signature | pinned `sha256(prosrc)` | why it is pinned |
|---|---|---|
| `clara._fa_role_claim_conflict(uuid,text,text)` | `3c17cf8d1418719510cd2e3f5e99eefd20327254207155802fc6fda54ffba581` | the discriminator §D reaches the census through; a domain filter here would vacate this file's whole fixed-asset half |
| `clara._fa_reserved_roles(uuid)` | `2de9eee6694e478f3c8489eaaeb6fb59ded10bb1f1df691e323fad6910148ed5` | §A's FA disjunct, delegated rather than re-listed |
| `clara._acct_role_reserved_at(uuid,text,timestamptz)` | `43ccc13ea49bcf2e9cc97de2528778ccb187cb25516191b7fef52748cac7f4bc` | the as-of twin this file deliberately leaves FA+advance only |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` | the roster question §A's arm parallels |
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` | `d35d58aa31927165a3f0ff764a6bbb90651042c868dfb75be6b0c2ba5240c476` | the door whose rows the arm reads, and the fifth asker of the wall |
| `clara.retire_prepayment_account(uuid,text,text,text)` | `5a0fc662384760a5303c1cdffb02793967761013137d859dafe2239f118e8f63` | the release door all three refusals now name |
| `clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)` | `6db2120df4ffa29cfda6cc282323cb633df6036dfdb76d47b7270a6e6adbf477` | the verb that ENFORCES §E's predicate |
| `clara._fa_reversal_blocked(uuid)` | `157b8a420c4318e45648398652bf764895ab9693eb6476a12b17f191b892553a` | the fourth reader this file does NOT recut, because its sentence is already domain-neutral — a claim about its TEXT, so its text is pinned |

**Deliberately NOT pinned, and probed structurally instead:**
`clara._prepayment_schedule_core`, `clara._revenue_recognition_core`,
`clara.list_prepayment_attention`, `clara.list_revenue_recognition_attention` and
`clara.enrol_prepayment_account` are asserted only to still CONTAIN a call to
`clara._adj_line_eligibility_breach` (§0 probe 4). Three of them are recut by this lane's own earlier
tickets (#1114, #1077) and a sha pin would have made 0337 refuse to apply behind its own siblings.

**For the NEXT ticket in this lane (#1050, migration `0338`) — read this before writing a prestate.**
`clara._adj_line_eligibility_breach(uuid,jsonb)` **moved** in 0337, from
`727fceade766…` to `53137471bc99…`. That body is pinned by sha in the header of **0306, 0307, 0308
and 0317** — every prepayment-family migration so far — so an implementer who copies the pin from
0317's header (the anti-pattern the work order names: "never copy a sha from an older migration
header") will write `727fceade766…`, and `0338` will refuse to apply behind `0337`. Measure it live.
The same applies to the four other bodies in the recut table above.

**For the integrator:** the pins most likely to collide with another lane are
`clara.upsert_fa_account_profile` and `clara._fa_role_claim_conflict` (L5 works the fixed-asset
family — #1090, #1092, #1093 — though the plan's own rationale names
`clara.fa_account_depreciation_policies` and `clara._revisable_invoice_field`, not these bodies) and
`clara._adj_line_eligibility_breach` (the adjustment family, which L1 does not list). Per the plan's
hard seam, **0337 pins none of L1's four bodies** (`clara._obo_plan_core`,
`clara.create_accounting_plan`, `clara._prepayment_plan_core`, `clara._accrual_plan_core`) and touches
neither schedule core.

### Tail assertions (nine items, all read off the live catalog)

The census carries three domains and lost neither of the two it had; its return shape is still
`(domain, role, owner_ref)`; it is still a lock-free `STABLE` security-definer reader (0042 tail
9(d)); the as-of twin gained **no** prepayment arm; the wall skips the new domain, still asks the
census and still speaks all five axes; the bank belt carries both reason tokens and still reads the
census (0045's replay of 0042 tail 3(6)); the FA profile door names both release doors and still asks
the discriminator; the advance predicate has all four remedies and still asks the census itself
(0042 S5.14(6) accepts it as the enrolment delegate only because it does); no overload was minted and
every ACL is what it was; and exactly **four** clara bodies call the census.

### Gate wiring

- Gate module `packages/db/tests/prepayment-account-reservation-preintegration-gate.mjs`, stable stem
  `prepayment_account_reservation$`, env `CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_RESERVATION`.
- Gate-chain entry appended in migration order (immediately after
  `revenue-recognition-plan-op-key-preintegration-gate.mjs`) in `packages/db/package.json`'s `test`
  script — one minimal hunk.
- **No `rig-meta.mjs` cohort**: 0337 mints no relation and no function name (it recuts five existing
  bodies). 0335 and 0336, this lane's earlier migrations, added none for the same reason.
- **No `apps/web/tests/firm-scope-db-pins.corpus.ts` entry**: 0337 contains no dynamic SQL at all (no
  `execute`, no `pg_get_functiondef` splice), so it is not a reviewed barrier. Sweep rule (d) was
  honoured by RUNNING the corpus test, which is green (below).

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the battery I added | `node --test --test-concurrency=1 $GATES tests/prepayment-account-reservation.test.mjs` | **6 pass / 0 fail** |
| the two batteries I amended, with it | `… tests/prepayment-account-roster.test.mjs tests/prepayment-schedule-obo.test.mjs` | **19 pass / 0 fail** (all three files together) |
| `operation-census` + `rig-isolation` | `… tests/operation-census.test.mjs tests/rig-isolation.test.mjs` (never with the reset flags) | **32 pass / 0 fail / 1 skipped** |
| everything the five recut bodies can reach | `… $(ls tests/x41-*.test.mjs tests/x42*.test.mjs tests/bank-*.test.mjs tests/accrual-*.test.mjs tests/staff-expense-claim*.test.mjs tests/revenue-recognition*.test.mjs tests/prepayment-*.test.mjs)` — **111 files** | **652 tests · 632 pass · 0 fail · 20 skipped** |
| whole `packages/db` suite | `pnpm test` from `packages/db` | **not obtainable on this rig** — see "unverified"; the two attempts and why neither is evidence are written up there |
| web pins corpus (sweep rule d) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail** |
| typecheck | `pnpm typecheck` from the worktree root | **green** (`apps/web`, `packages/runtime`) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **green, exit 0** |
| migrate idempotence | `pnpm --filter @clara/db migrate` | `0 new migration(s) applied · 312 total`, max `0337`, no drift |

The 111-file sweep is the honest coverage claim for a change that recuts five shared bodies: the
fixed-asset register (`x41-*`), the reservation union and its authority census, the staff-advance
register and its admission predicate (`x42*`), the adjustment family that reads the shared wall
(`accrual-*`, `x42-adj*`), the bank belt's own batteries (`bank-*`), the claimant wall that reaches
the union through `clara._adv_enrolment_admission` (`staff-expense-claim*`), and both schedule lanes
(`prepayment-*`, `revenue-recognition*`). The 20 skips are the batteries' own frontier and
destructive-mode skips, not cells this change disabled.

### `FREEZE_BASE_REF` — read this before treating a lint red as mine

**`origin/main` moved 59 commits under this lane while the ticket was being built.** The cut phase
merged as PR #1140 (`061a6992b`) and brought `chatTurn_v22`, `claraWork_v6` and `statementFacts_v4`
into `main`. `scripts/check-frozen-workflows.mjs` compares the manifest against `origin/main`, so a
branch cut at `7bc5a710f` now reports **28 append-only violations** (24 `REMOVED-VS-BASE`, 3
`REGISTRY-DOWNGRADE`) that are pure base drift. The same `pnpm lint` was green twice earlier in this
session on this same tree.

It is not this ticket's: `git diff 7bc5a710f..HEAD --name-only` touches `packages/db/**` (mine) and
three `apps/web` files (#1079's, the previous ticket in this lane) — **nothing under
`packages/runtime` and not `frozen-workflows.json`**. Pointing the check at this lane's own base
(`FREEZE_BASE_REF=7bc5a710f`, which the script supports at line 153) makes lint exit 0. The
integrator resolves this by merging or rebasing onto the new `main`, not by touching this branch's
frozen manifest.

**No `apps/web` file was edited by this ticket**, so the whole web unit suite and the browser walks
are not in scope (#1079 owns this lane's web half). The one web test above is the sweep wave's own
rule (d).

---

## Docs

- `packages/db/README.md` — a new `## 0337` section only (the defect with its measured probes, the
  five-section table, why §B is not a softening, the three claim doors and what each needed, the one
  reader 0337 does not recut and why, what the file deliberately does not do, the consequence worth
  writing down, and the redo evidence). No existing section was edited.
- The migration header carries the same reasoning at the point of change, including the owner ruling
  verbatim.
- `packages/db/tests/prepayment-account-roster.test.mjs` — `p940.schedule.roster_gate`'s last third is
  amended, with a comment that records what the amendment costs rather than dropping the claim.
- `packages/db/tests/prepayment-schedule-obo.test.mjs` — `p915.obo.roster_first`'s last step is
  amended the same way and for the same reason; the whole-suite run is what found it.
- **No `CONTEXT.md` entry.** 0337 mints no new domain vocabulary: "prepayment-account roster",
  "reservation" and "enrolment" are all already in the estate's language, and the new token
  (`domain='prepayment'`) is a value inside an existing authority's existing return shape.

---

## What was deliberately left

1. **No chart-account deactivation door.** The first half of the ruling. `account_inactive` stays a
   known dead axis, and the wall's arm for it is untouched.
2. **`clara._acct_role_reserved_at` (the as-of twin) gains no arm.** Its single reader is
   `clara._fa_gl_leg_foreign`, which asks "was a NON-FA register holding this code when that leg was
   booked" for the fixed-asset tie-out; a prepayment arm there would make every leg on a prepayment
   account foreign to the FA register as of that date. That is an accounting answer nobody asked to
   change. Pinned, so the asymmetry is a decision.
3. **`clara._draft_opening_item_core` is not recut.** It is the fourth reader of the discriminator, so
   §A already makes the opening-balance fixed-asset carry-down REFUSE a code the roster holds — the
   gate is closed. What it does not do is name the third release door: its refusal offers "Seed this
   asset on a different account" first (always valid) and then enumerates the two release doors it
   knew about. Nothing in this battery can DRIVE that door without building the wave-b onboarding
   world (a client, a plan, an opening seed, a tie document, a seeded asset), and the work order
   forbids asserting a door's behaviour no cell drove. Re-emitting a 445-line body for a sentence no
   cell exercises is the widening the work order names. Follow-up 1.
4. **A schedule that outlives its enrolment does not reserve.** #940's owner decision 5 says retiring
   closes the account to NEW schedules and leaves a running one posting to term end, so that state is
   reachable and is not covered. Follow-up 2.
5. **No `clara._reserve_op`, no schedule core, no plan body.** The lane's hard seam.

---

## Successor contract

**None is owed.** Nothing a frozen chat body or a Work tool would need changed: 0337 adds no door,
changes no door's signature, mints no part kind and moves no refusal a frozen closure maps. The only
new machine tokens are `coa_account_prepayment_reserved` (a `reason` on an existing CLR10 refusal) and
`retire_prepayment_enrolment_then_re_enrol` (a `remedy` on an existing CLR10 refusal); both are read
today only by the SQL bodies in this file, verified by grep over `apps/web` and `packages/runtime`
(`coa_account_advance_reserved` and `account_reserved` appear in neither tree). `frozen-workflows.json`
is untouched.

Were a surface ever to branch on the reservation domain, the contract is:

- reader: `clara._acct_role_reserved(p_client uuid, p_code text) returns table(domain text, role text, owner_ref text)`, ungranted, definer-path only;
- `domain ∈ {'fa','staff_advance','prepayment'}`; for `'prepayment'`, `role ∈ {'prepayment','deferred_revenue'}` and `owner_ref` is the account code;
- release door per domain: `clara.retire_fa_account_profile`, `clara.retire_staff_advance_account`, `clara.retire_prepayment_account`.

---

## Follow-ups worth filing

1. **`clara._draft_opening_item_core`'s release list does not name `retire_prepayment_account`.** Live
   site: the `raise exception` at the `clara._fa_role_claim_conflict` arm (the body's own line ~391 of
   445 as `pg_proc.prosrc` reads it; the creating statement is
   `packages/db/migrations/0041_wave_d_a_fa_register.sql`). The fix is the same shape as 0337 §D and
   §F-that-was: one `%` in the message plus a `case` on `v_res_domain`, and the same `case` on the
   `detail`'s `reason` (it hardcodes `coa_account_advance_reserved`). It needs a cell in the wave-b
   opening-balance battery, which is why it is a ticket and not a line here.
2. **A prepayment or deferred-revenue schedule can outlive its enrolment, and the code is then
   unreserved.** `clara.retire_prepayment_account` has no precondition on running schedules (#940
   decision 5, deliberately), so `enrol → configure schedule → retire` leaves a machine posting
   monthly against a code any other register may now claim. Two candidate remedies: a second disjunct
   in §A over live `clara.prepayment_schedules` / `clara.revenue_recognition_schedules` gated on plan
   liveness, or a precondition on the retirement door. Both are owner decisions; the second changes
   what decision 5 means.
3. **The schedule door's `prepaid_account_ineligible` arm is now unreachable for an enrolled
   account.** Each of the wall's five axes is closed ahead of it (see the README's "a consequence
   worth writing down"). It is correct as defence in depth, but a reader of
   `clara._prepayment_schedule_core` will not be able to construct a case that reaches it; worth one
   sentence in the body, or a ticket that decides whether to keep it.
4. **`clara._upsert_account_core` has an FA-enrolment guard and no roster guard.** 0041's "an enrolled
   account keeps the shape its enrolment assumes" refuses re-typing an account backing a LIVE
   fixed-asset profile; there is no equivalent arm for a live roster enrolment. In practice the
   general "cannot change type/class of an account that has lines" guard covers every account a
   schedule could be built on, which is why this is a follow-up and not a defect here.

---

## Anything unverified

- **The whole `packages/db` suite is a ONE-SHOT gate on a one-shot database, and I could not make it
  a clean one.** It was attempted twice and neither attempt is evidence about #1078:
  1. The first run was contaminated by me: I corrected the migration file while it was running, and
     every later file that calls `ensureReady` → `migrate` then failed its hook with
     `applied migration 0337_prepayment_account_reservation was MODIFIED after being applied
     (checksum drift)`. My mistake, not a finding. It had produced **exactly one** genuine red before
     that point — `p915.obo.roster_first`, which is the second existing cell built on the hole this
     ticket closes, and which commit `61c3c5515` amends.
  2. The second run, started after everything had settled and with nothing touched, tripped the
     estate's own re-run guard: `f-a5-reporting-agency-pr1.test.mjs` refuses with
     *"evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set"*, because
     the first run had already deployed it. The documented acknowledgement is
     `CLARA_ESTATE_REUSED_DB=1`, which I deliberately did NOT set: it would have made the reporting
     families run against accumulated state and produced reds I could not tell from real ones.
     `packages/db/README.md` and `tests/README.md` both say the rule is **one from-scratch chain per
     cluster**, and the rig gives a lane one database. So the whole-suite gate needs a database this
     lane does not have, and the integrator's own from-scratch chain is where it belongs.
- **What was run instead** is the gate the work order actually asks for (the files I touched with the
  full gate chain, plus `operation-census` and `rig-isolation`), plus a bounded 111-file sweep over
  everything the five recut bodies can reach: **652 tests, 632 pass, 0 fail, 20 skipped**. The gates
  table lists it.
- **`origin/main` moved 59 commits under this lane mid-ticket** (the cut phase, PR #1140), so
  `pnpm lint`'s frozen-workflow check now reports 28 append-only violations against a branch cut at
  `7bc5a710f`. They are base drift, not this ticket's — the gates section shows the evidence and the
  `FREEZE_BASE_REF` run that exits 0. **The integrator should expect this and resolve it by
  rebasing, never by editing this branch's frozen manifest.**
- **Not covered by anything I ran:** `clara._draft_opening_item_core` and the wave-b opening-balance
  family. §A makes that door refuse a roster-held code and I did not drive it (follow-up 1 says why),
  so its behaviour under #1078 is reasoned from the shared discriminator it calls, not measured.
- `gh issue view 1078` printed its body and its one comment normally on this host (the `gh issue view`
  emptiness #1077's report noted did not recur).
- The claim that `account_inactive` has no door is a **census over the live catalog**, not a proof
  that no future migration adds one — and it is the owner's own ruling rather than this worker's
  finding.
- The two by-hand measurements in this report (the pre-image restore, and the §A-only state) mutated
  the lane database outside a migration and were undone by re-applying 0337 through the supported
  redo mode. The ledger is back at 312 files, max `0337`, checksum
  `8810de61a8004fede8a5f43f26d05a5fd4dfa4ce63a34e38f5fc617666bd5248`, and the three affected batteries
  are green on that state.
