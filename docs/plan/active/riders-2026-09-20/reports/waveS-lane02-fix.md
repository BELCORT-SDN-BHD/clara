# Riders sweep wave — lane L2 fix round (#1114, #1077, #1079, #1078, #1050)

- **Worktree** `C:\Users\zhant\Desktop\clara-wt\655` · **branch** `riders/wS-lane02`
- **Base** `7bc5a710f` · **review head** `873488f4e` · **new head** `3c48235afaee388e1ee4ba501f7399943b33defb`
- **Database** `127.0.0.1:55745/clara_l05`, ledger **314 files**, max `0361_reservation_release_advice`
- **Migration number** `0361` assigned by the orchestrator from the sweep wave's overflow block.
- One implementer for every review issue (`/implement-spec`), eight commits, all carrying the wave trailer.

| # | commit | what |
|---|---|---|
| 1 | `d644c1db3` | ADV-L02-05 — two admins recording one standing instruction are serialised |
| 2 | `1f5655c62` | ADV-L02-03 — a demoted directing member is a lapsed authority too |
| 3 | `00ec0798c` | ADV-L02-04 — a clocked task that already succeeded gets its own receipt back |
| 4 | `aaaa82e8c` | ADV-L02-01 / L02-SPEC-02 — 0338 applies on both chains; L1's bodies are no longer sha-pinned |
| 5 | `cf8bc6752` | ADV-L02-06 / ADV-L02-08 / L02-SPEC-04 — the standing instruction gets a surface; #1079's panel gets one voice |
| 6 | `75086d413` | L02-SPEC-01 / STD-1 / ADV-L02-10 — migration `0361`, the release-advice map and the fourth consumer |
| 7 | `e792dc3ce` | ADV-L02-01/02 again — §E rewritten as plain SQL after `check-wiki-dynamic-sql` refused the dynamic form |
| 8 | `3c48235af` | the `#1050` string literal that the raw-colour lint reads as a colour (#994's own trap) |

---

## The findings, one by one

### ADV-L02-01 (blocker) — 0338 could not apply behind lane L1's 0330 — **FIXED**

**Reproduced.** Verified against lane L1's own branch rather than against its report:
`git show riders/wS-lane01:packages/db/migrations/0330_plan_authority_wall_predicate.sql` recuts
`clara.create_accounting_plan` and `clara._obo_plan_core`, and `0332_plan_reversal_posted_basis.sql`
recuts `clara._plan_admit_occurrence`. Hashing those bodies the way `pg_proc.prosrc` is hashed gives
`544cd88e…`, `149b4a3d…` and `5cc0fa56…` — exactly the shas L1's ticket reports record, and all
three were pinned by 0338 as pre-images or must-not-move keeps. A **fourth** stale pin the review
did not name: `clara._plan_admit_occurrence` (L1's #1074, 0332), found by this census.

**Fixed, four ways:**

1. **§0 admits both pre-images of the body two lanes write.** `clara._obo_plan_core` now has three
   admissible shapes — 0308 §D (`2049c1c4…`), 0330 §C's post-image (`149b4a3d…`), or this file's own
   recut — and refuses a fourth BY NAME, saying what to re-derive.
2. **§E is one static body that asks the catalog which route exists.** Where
   `clara._assert_plan_authority` is present the twin `perform`s it; where it is absent it carries
   0308's own block, character for character. So the file applies unchanged on a chain with L1 and
   on one without, and it never reverts #1051.
3. **The three keep pins on bodies L1 writes become the invariants this file depends on**:
   the human lane never names `standing_instruction`; `_plan_admit_occurrence` still hands the
   plan's `authorised_by` to `clara.admit_journal_work`; `_prepayment_plan_core` still delegates to
   `_obo_plan_core`. A sha pin on a body another lane writes turns that lane's lawful recut into an
   abort of the whole chain, which is the seam rule's own point.
4. **Tail items 6 and 7 re-derived.** Item 6 asks the human door AND the shared wall whether either
   names the second kind. Item 7 asserts the ROSTER of readers of `clara._authority_ref_refusal`
   rather than the count three — the count is three on **both** chains with **different** members
   (`sign_depreciation_authority`, `create_accounting_plan`, `_obo_plan_core` without L1;
   `sign_depreciation_authority`, `_assert_plan_authority`, `_obo_plan_core` with it), which is
   exactly why a count was the wrong assertion. The review's "2 on the integrated chain" is not
   what this lane measures: 0338 §E's standing arm still resolves the reference itself, so the twin
   remains a reader.

**Proved on the integrated shape, not reasoned.** Inside one rolled-back transaction on this rig,
0330 §A, §B and §C were applied from lane L1's own file and 0338's §0 was run VERBATIM: it reported
`clara._obo_plan_core = FIRST(0330/#1051)` and the whole §TAIL passed in full. The **eight authority
axes** were then driven through `clara._obo_plan_core` with L1's real predicate present and absent:
identical on both routes, code and `detail` byte for byte —
`authority_rule_unsupported`, `invalid_authority_kind`, `authority_ref_invalid` on each of
`object` / `kind` / `id`, the explicit-with-standing-ref pairing, and `authority_ref_unresolved` on
both the chat-task and the standing-instruction reference.

**One thing the integrator still owns:** if L1 edits 0330 §C again before the merge, 0338's §0
refuses by name and its message says to re-derive. That is the intended behaviour, not a residue.

### ADV-L02-02 (blocker) — folding §E's second kind into #1051's predicate would be a behaviour change — **FIXED, by deciding the shape**

The review's own second option is what shipped: **the standing-instruction branch stays outside
`clara._assert_plan_authority`.** That predicate is also the human plan door's wall and (after
#1080) the accrual core's, and the ruling gives the second kind to the unattended lane alone;
folding it in would admit a firm's blanket delegation at doors nobody ruled it for, which 0338's own
tail item 6 refuses. The twin answers its own kind in its own branch and hands every other kind,
unchanged, to the one wall. Said in the file, in `packages/db/README.md` "## 0338", and held by two
cells (`p1050.authority.human_lane_unwidened`, `p1050.authority.wall_route`).

`clara._assert_plan_authority` gains **no** admitted-kinds argument, so nothing of L1's moves.

### ADV-L02-03 (major) — the wake arm checked membership STATUS but not ROLE RANK — **FIXED**

**Reproduced** as the review described: a member who is demoted rather than removed still
configured a schedule, and every occurrence of it then answered CLR04 `insufficient_role`.

`clara._admit_accounting_work_core` asks **two** questions of the person a plan posts as — an ACTIVE
membership (`actor_not_active`) and `clara.role_rank(role) >= clara.role_rank('bookkeeper')`
(`insufficient_role`) — so 0338 §F now asks both, under the same `wake_authority_lapsed` token with
an **`axis`** (`membership` | `role_rank`) so a reader is told which half lapsed. The floor is read
from the admission wall rather than restated, so the two cannot drift.

**Driven:** `p1050.wake.demoted` promotes a second owner (past `clara._tf_guard_last_owner`),
demotes the recording member to `viewer` with their membership still ACTIVE, and sees CLR03
`wake_authority_lapsed` / `axis: role_rank` with the whole footprint unmoved; the mutation is
restored in a `finally` and re-read. Red first, for the right reason (the wake configured a plan).
`p1050.wake.lapsed` gains the `membership` axis assertion.

### ADV-L02-04 (major) — a replay of a clocked wake that ALREADY SUCCEEDED stopped returning its receipt — **FIXED**

**Reproduced:** `p1050.wake.replay_after_withdrawal` drives success → withdraw → replay of the same
clocked task and was red at exactly the point the review named — CLR03 `wake_authority_absent`,
while the schedule, the plan and a completed `clara.op_receipts` row all stood.

The standing-instruction wall now sits **below** the reservation's replay short-circuit and above
every wall that reads the entry, the roster, the accounts or the term. The first cut's reasoning
(*a clocked run whose firm instructed nothing must never be told to fix its expense account*)
survives — nothing below the arm moved — but the placement did not, because the instruction is
MUTABLE WORLD STATE and this body's own law is reserve-before-mutable-validation (0305 §B / 0306
§B, which the reservation block directly above states for the duplicate check in so many words).
A FIRST call refused there still costs nothing: the raise takes its reservation row with it, which
`p1050.wake.absent` and `p1050.wake.lapsed` re-measure over the whole footprint.

### ADV-L02-05 (major) — two admins recording at once leaked a raw 23505 — **FIXED**

**Reproduced with two real connections**, the block proven from `pg_blocking_pids` rather than from
a sleep (`p1050.record.race`): session B was handed
`duplicate key value violates unique constraint "uq_firm_standing_instructions_live"`, no CLR code,
no `detail.reason`.

`clara.record_firm_standing_instruction` now takes
`pg_advisory_xact_lock(203005009, hashtext(firm || ':' || instruction_key))` after its op-receipt
reservation and before the live-row read — [0037](../../../../packages/db/migrations/0037_wave_c_c_tieout.sql)
§K's order, the placement 0238's fix round and 0287 both used. A rung of its own, so two different
instructions of one firm never wait on each other. Once serialised, B reads A's committed row and
takes the lawful version-forward branch: an unchanged re-recording is idempotent, so it is answered
with the row that already stands.

**The one interleave a rung cannot close** is an older SNAPSHOT: a `repeatable read` caller waits
for the rung, gets it, and still reads the world without the row it waited for. That insert is
wrapped and `unique_violation` is answered **CLR13 `operation_in_flight`** with the instruction key.
Driven by `p1050.record.race_snapshot`, red first with `23505`.

`clara.withdraw_firm_standing_instruction` needs no rung and the README says why: its `for update`
locks a row that exists, so a second withdrawal is already answered CLR11
`firm_standing_instruction_absent`.

### ADV-L02-06 (major) — both doors shipped dark — **FIXED: the surface is built**

`/settings/firm` gains a sixth card, beside legal standing and the processing caps, because
standing an act for every client of the firm until somebody withdraws it is firm governance of the
same kind. It says in words whether Clara may act, quotes the firm's own recorded sentence, offers
the control that changes it, renders every refusal VERBATIM with its code and reason, and states
the two facts a firm needs before deciding: the instruction is firm-wide, and withdrawing it does
not stop a schedule already running.

- `apps/web/lib/firm/standing-instructions.ts` — the read (no door needed: forced RLS, SELECT to
  `clara_authenticated`, no machine lane) and the two `callDoor` writes in the door's own argument
  order, with a **fresh op key per submission** (a derived key would make the second recording
  replay the first receipt and write nothing).
- `apps/web/components/firm-admin/standing-instructions-card.tsx` — presentational; the panel owns
  the key and the unconditional re-read that follows each write, as it already does for the caps.
- `apps/web/components/firm-admin/firm-settings-panel.tsx` — a fourth loader with its own epoch, and
  the focus/visibility refresh reads it too (a colleague may have withdrawn it while the tab was
  hidden).
- 19 keys appended inside the existing `FirmSettings` namespace at one insertion point; an
  independent duplicate scan over the namespace reports none.

**Driven:** `standing-instructions-card.test.tsx`, 7 cells — the absent state, the live state, what
each writer is handed, that the withdrawal goes to the *other* writer, that a refusal reaches the
person verbatim and leaves their words where they typed them, that a denied/failed/loading read
renders no control at all, and the two facts above. Vacuity control: five of the seven go red
against a deliberately broken card, and all seven green once it is restored byte for byte.

**Not built, and named rather than swept:** no browser walk. A walk would need PostgREST to have
reflected the new relation into its schema cache, which is a deployment act rather than a lane one.
The card's own contract is unit-driven end to end.

### ADV-L02-07 (minor) — 0337 changes what already-bound states may do and inspects no row — **PART FIXED, part handed to the release**

The remedy sentence's missing caveat is closed: the release advice for the prepayment domain now
states, at every site that uses it, that retiring the enrolment *closes the account to new schedules
and leaves any running one posting to term end* — including the carry-down door, which never had it.

The **hosted census remains a release act**, not a lane one, and is restated here so it is not lost:
before the hosted release, count accounts that carry BOTH a live `clara.prepayment_account_enrolments`
row and a fixed-asset profile or bank binding, and decide per row. If the population is empty, say
so in the release evidence.

### ADV-L02-08 / L02-SPEC-04 (minor) — the panel's heading named both purposes and the rest named one — **FIXED**

`subheading`, `empty`, `loading`, `enrolTitle`, `reasonLabel` and `retireTitle` now speak in the
panel's own two-purpose voice; `prepayments-walk.spec.ts`'s label lookup moves with `reasonLabel`.
`p940.panel.empty` gains an assertion that the consequence sentence names BOTH outcomes, driven red
against the old string first.

### ADV-L02-09 (note) — pre-0336 `<key>:plan` receipts — **carried to the release**

No code change is implied and none was made. Restated for the release evidence: count the hosted
`<key>:plan` receipts under `fn = 'create_accounting_plan'` whose op key was spent by
`clara.create_revenue_recognition_schedule` before the release, and record the number.

### ADV-L02-10 (note) — the claim census was read with `limit 1` and no `order by` — **FIXED**

`clara._fa_role_claim_conflict` now orders on `(domain, role)`. Once a refusal names a per-domain
release DOOR, an arbitrary claim is an arbitrary REMEDY. Alphabetical is deliberate: there is no
ranking between registers to encode and inventing one would be a policy nobody ruled.
`p1078fix.conflict.deterministic` reads the body and drives the same question twice on one state.

### ADV-L02-11 (note) — the redo marker is a bare four-digit substring — **NOT changed, and why**

The exposure is what the review says it is: bounded, with no live path taking the false positive
(`CLARA_MIGRATION_REDO` only ever targets the highest applied version, and a from-scratch chain
never reaches the branch). Tightening it now would mean editing 0335, 0336 and 0337 — two of which
this fix round may not touch at all — to close a hazard nothing can reach. 0361 follows the family's
idiom rather than diverging from three siblings alone; the note stands for whoever next copies it.

### L02-SPEC-01 (major) — the fourth consumer of the widened census was lying — **FIXED, in migration 0361**

**Reproduced at the real door.** `clara._draft_opening_item_core`'s live prosrc carried
`detail.reason` hardcoded to `'coa_account_advance_reserved'` and a remedy naming only
`retire_staff_advance_account` and "retiring the profile that holds it". Driving
`clara.seed_fixed_asset` on a client whose own prepayment roster held the code reproduced exactly
that: the roster claim reported as an advance one, under two doors that cannot release it.

`0361_reservation_release_advice.sql`:

| § | object | what |
|---|---|---|
| A | `clara._reservation_release_advice(text)` | the one map: the token a machine reads, the sentence a person acts on — and a **raise** on a domain it does not know |
| B | `clara._fa_assert_code_unreserved` | 0337 §C's body verbatim except the `case` that chose the token |
| C | `clara.upsert_fa_account_profile` | 0337 §D's body verbatim except the `case` that chose the sentence |
| D | `clara._draft_opening_item_core` | the fourth consumer, corrected — a counted splice, 0041 §4.5 / 0042 §5.15c's own idiom for this 445-line body |
| E | `clara._fa_role_claim_conflict` | the deterministic `order by` (ADV-L02-10) |

**A second defect the review did not name, closed by the same fix:** the `else` also mis-reported a
fixed-asset **cross-role** claim as `coa_account_advance_reserved` — reachable since 0042, long
before a third domain existed. `p1078fix.carrydown.fa_cross_role` drives it.

**Driven, at the door:** `p1078fix.carrydown.prepayment` reads
`coa_account_prepayment_reserved`, a sentence naming `retire_prepayment_account` and what retiring
it leaves running, and **no** mention of `retire_staff_advance_account`;
`p1078fix.carrydown.advance_unmoved` proves 0041's token and words did not move.
Vacuity control: four of the seven cells go red against a deliberately broken map, and all seven
green again after `CLARA_MIGRATION_REDO=0361`.

**One fixture reach-around, declared:** the scene moves its client to `active` with a raw update.
Both registers' enrolment doors refuse an onboarding client outright ("client is not active",
measured), `wb.onboardingClient` necessarily starts one in `onboarding`, and no audited verb in
this rig completes an onboarding without closing the opening seed the cell needs open. The status is
a lifecycle fact about the SCENE; every door is driven for real.

### L02-SPEC-02 (major) — the sweep plan's hard seam — **FIXED** (see ADV-L02-01)

0338 no longer sha-pins `clara.create_accounting_plan`, `clara._prepayment_plan_core` or
`clara._plan_admit_occurrence`, and its recut of `clara._obo_plan_core` is correct on both chains.
The seam's intent — *L1's lawful recut must not abort L2's chain* — is met by construction rather
than by a merge-time repair.

### L02-SPEC-03 (minor) — #1114's AC2 was satisfied by inverting its literal text — **RECORDED, not silently ticked**

Nothing in the code changed: the audit was performed and written up, both code-side catalogs gained
the entry, and the ticket's Desired-behavior paragraph is met. What is owed is a sentence when the
ticket closes, and it is written here so the closer has it:

> **#1114 AC2 as written is superseded.** It asked for "any other refusal reason currently sharing
> CLR10 … given its own code where it is meant to reach a user". The audit found the opposite
> shape: 626 live `clara` bodies under 468 distinct reason tokens, every user-facing one correctly
> on CLR10, and exactly three reasons that are never meant to reach a user. Those three moved to
> CLR44 instead. The argument is in `packages/db/README.md` "## 0335". **AC2 must not be ticked
> silently** — record the reinterpretation on the ticket.

### L02-SPEC-05 (minor) — AC5 is half-evidenced — **STILL THE INTEGRATOR'S**

The populated half is proven and re-proven (314 files, a second `migrate` reports 0 new and no
drift). The from-scratch half cannot be run here: migration 0154 pins the cluster-wide role count,
and the rig may not take a second chain. `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f
pnpm lint` exits **0**; without `FREEZE_BASE_REF` the frozen-workflow check reports 38 violations
which are the cut phase's base drift, not this lane's — `git diff 7bc5a710f...HEAD` touches **zero**
`packages/runtime` files (measured). **AC5 cannot be ticked on this branch alone.**

### L02-SPEC-06 (minor) — two things the re-brief does not ask for — **PUT TO THE OWNER, in one line each**

Both remain in the branch, both were argued rather than assumed, and neither was ruled:

1. **The withdrawal door (§G).** A standing instruction that cannot be taken back is a switch, and
   the ruling's own words are "until somebody withdraws it". Without §G a firm's first recording
   would be permanent. *Owner: is the withdrawal door wanted, or should the instruction be
   permanent-until-superseded?*
2. **The admin/owner floor on both doors,** where the ruling says only "a named member". Standing an
   act for every client of the firm is firm-level governance, which in this estate sits at admin
   (`clara.record_client_fact`). *Owner: may ANY member record their firm's standing instruction, or
   is admin right?* If any member may, the floor is a change rather than a fix.

### L02-SPEC-07 (note) — the prepayment reservation is a claim-census entry only — **RECORDED**

The prepayment domain is visible to the three claim doors and invisible to the posting wall
(`clara._adj_line_eligibility_breach` filters it), unlike both siblings — deliberate, measured, and
held by `p1078.wall.unmoved`; 0361's own tail item 7 re-asserts that this fix round did not move it.
The downstream consequence stands as the ticket report filed it: `prepaid_account_ineligible` is no
longer reachable for an enrolled account through any governed door, and the two retargeted cells
(`p940.schedule.roster_gate`, `p915.obo.roster_first`) now measure the enrolment door and the bank
belt instead. **Follow-up worth filing.**

### L02-SPEC-08 (note) — 0336 also renamed the correction door's `:end` reservation — **RECORDED**

No change. The widening is AC1's own plural and was measured at the doors; the named residue (the
`:plan` namespace is still shared by `clara.create_accrual_adjustment`,
`clara.confirm_tenancy_rent_plan` and `clara.correct_accrual_adjustment`, all L1 families) is
restated here so it is filed rather than swept.

### STD-1 (minor) — the domain dispatch was inlined three times in 0337 — **FIXED, with one site deliberately left out**

`clara._reservation_release_advice` is the one map, and §B, §C and the corrected carry-down all read
it. It **raises** on a domain it does not know rather than defaulting to the staff-advance answer —
which is the whole defect, since all three inline dispatches were written as
*prepayment → its answer, ELSE the advance answer*, and that `else` is how a whole domain came to be
mis-reported.

**`clara._adv_enrolment_admission` is deliberately NOT folded in,** and 0361's header says so: its
per-domain text is not a release sentence but a RE-ENROLMENT NARRATIVE with an axis of its own — a
live fixed-asset REGISTER ROW is permanent where an ACTIVE profile is not, and the two get different
advice under the same `fa` domain. Folding four narrative shapes and a permanence flag into the map
would make the map the thing that is hard to read.

---

## The bodies this fix round moved, with their live shas

Measured on `clara_l05` after the final apply. The integrator's seam list:

| signature | sha256(prosrc) |
|---|---|
| `clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `1105f9f201833bd61baa5193520fda49b46e17685a1df1cb808e8aa8a676504d` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `af096b607079e11a7888d907f8c5c9f03880ead0b9565ec26ee6feb9257dafd7` |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `1b090889518b8a27f83de3726083d3394c9da98645207622d3150e0cf110e467` |
| `clara.record_firm_standing_instruction(text,text,text)` | `98eb543ba0ca500a793a21b061eff4f3d5532df72c3e968ccd2b40fe3789c750` |
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `c63c1fd09bc92713127a038b3565f399b8ee17fcbf27097272b7a919cbb7b6e5` |
| `clara._reservation_release_advice(text)` **(new)** | `548a9689746ca4050f57a5e2b084aa5e3d318ef9a09428dfd71b469a9e35a84b` |
| `clara._fa_assert_code_unreserved(uuid,text)` | `d31b5f7eea43ebb7f878a02c0a8d41b1cd0cf7ce90dced6fc59fe774142fcee5` |
| `clara.upsert_fa_account_profile(uuid,text,text,text,text)` | `ee503d3e93d0f9c0cb4fe8e8bfed65e26c3a3927e0c34d2dfaa378e4c9caaf54` |
| `clara._fa_role_claim_conflict(uuid,text,text)` | `55a962ced16fcca28c049435e72367387216efcc7bdd64e291c8e98d4b56d1d5` |
| `clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)` | `97a91ee0ab6296f1c523b8003469d39bc2fc198717da6045c325528c2c778811` |

0361's own prestate pins (measured before it applied): `_fa_assert_code_unreserved`
`5cba0262…`, `upsert_fa_account_profile` `b00de56b…`, `_fa_role_claim_conflict` `3c17cf8d…`,
`_draft_opening_item_core` `642967d2…`; keeps `_acct_role_reserved` `dcd352f0…` and
`_adj_line_eligibility_breach` `53137471…`.

## How the migrations were re-applied

0338 was edited four times and redone with `CLARA_MIGRATION_REDO` each time while it was the
frontier. After 0361 landed, 0338's §E had to move once more (the wiki lint), and redo mode only
ever reaches the **highest** applied version — so both ledger rows were deleted and a plain
`pnpm --filter @clara/db migrate` re-ran **both files in order** through the ordinary apply path.
Both are redo-safe by construction and both prestates reported their own recuts
(0338 `0 FIRST, 3 REDO`; 0361 `0 FIRST, 4 REDO`). A second `migrate` afterwards reports
`0 new migration(s) applied · 314 total` and no checksum drift.

## Gates

| gate | result |
|---|---|
| `tests/prepayment-close-standing-instruction.test.mjs` + the lane's other ten batteries | **100 tests, 100 pass, 0 fail, 0 skipped** |
| `tests/reservation-release-advice.test.mjs` (new, 7 cells) | included above; red 4/7 against a broken map, green after the redo |
| `operation-census`, `rig-isolation`, `fixed-asset-acquisition`, `opening-balance-work`, `wave-b/wb-0018-seed-fa` | **73 tests, 72 pass, 0 fail, 1 skipped** (T19 poison-role, which refuses without `CLARA_RIG_ALLOW_RESET`) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5180 tests, 5178 pass, 0 fail, 2 skipped** |
| `apps/web/tests/firm-scope-db-pins.test.ts` (the pins corpus) | **22/22**, with 0361's reviewed-barrier entry at its sorted position |
| `pnpm typecheck` | **Done** (web + runtime) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK** — 1536 definitions, 252 patches, 20 waivers, **none added** |
| `node scripts/check-frozen-workflows.mjs` | 38 violations vs `origin/main`, **0** vs `7bc5a710f`; the lane's diff touches no `packages/runtime` file |
| `pnpm --filter @clara/web e2e prepayments-walk` (triple 3540/3541/3542) | **8 passed**, exit 0 |

## Shared files touched, and how

- `apps/web/messages/en.json` — 19 keys appended inside `FirmSettings` at one insertion point, plus
  six `PrepaymentAccounts` strings reworded. Never re-serialized; an independent line-based
  duplicate scan over the namespace reports none.
- `apps/web/test/manifest.txt` — one line, at the sorted position.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — one reviewed-barrier entry for 0361, at the
  file-sorted position the census requires.
- `packages/db/package.json` — one `--import` for 0361's preintegration gate, in migration order.
- `packages/db/README.md` — the lane's own `## 0338` section edited and a new `## 0361` appended.
  No existing section of another ticket touched.
- `packages/db/tests/rig-meta.mjs` — **not** touched: 0361 mints one ungranted definer body with
  `set search_path`, which the T18 hygiene sweep covers without a cohort (`rig-isolation` green).

## Follow-ups worth filing

1. **The `else` arm in 0338 §E** can be deleted the day #1051 is on every chain — a one-line ticket
   for whoever reconciles L1 and L2 after the merge.
2. **`prepaid_account_ineligible` is no longer reachable** for an enrolled account through any
   governed door (L02-SPEC-07). The arm is dead but not removed.
3. **`clara._adv_enrolment_admission`'s narrative** is the one domain dispatch not folded into the
   map; it will need its own answer when a fourth register appears.
4. **The remaining `PrepaymentAccounts` copy** (`enrolDescription`, `purposeHint`,
   `retireDescription`) still reads as prose written for one purpose; it is correct, not
   contradictory, and was left alone.
5. **A browser walk for the standing-instruction card**, once PostgREST reflects
   `clara.firm_standing_instructions`.

## Unverified

- The **from-scratch chain** `0001 → 0361` (L02-SPEC-05). The rig cannot take a second chain.
- The **hosted censuses** ADV-L02-07 and ADV-L02-09 ask for; both are release acts.
- Whether lane **L1** moves `0330 §C` again before the merge. 0338's §0 refuses by name if it does.
- No mid-task status request arrived that was addressed to this worker; the coordinator's messages
  were an overflow-number assignment (0361) and two corrections of fact, all acted on.
