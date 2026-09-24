# wave 4 · lane 04 · #940 — a per-client roster of prepayment accounts gates amortisation ahead of the shared eligibility wall

**Branch** `riders/w4-lane04` · **base** `cd2925391` · **status** DONE.

**Commits** (`git log --oneline cd2925391..HEAD`, this ticket's ten, oldest first):

| commit | subject |
|---|---|
| `f8721d0a6` | `feat(db): #940 the per-client prepayment-account roster and its two human doors` |
| `8bd636c81` | `test(db): #940 every reason an account cannot hold prepayments is answered at enrolment` |
| `18f82b3f7` | `feat(db): #940 create_prepayment_schedule asks the client's prepayment roster first` |
| `408ae8b07` | `feat(db): #940 arm B offers only recognitions the schedule door would admit` |
| `29b2ac04d` | `test(db): #940 retiring an account closes the future only, driven to a committed receipt` |
| `df8b88a0e` | `feat(web): #940 the Prepayment accounts panel on the client's Registers page` |
| `f7565b214` | `feat(web): #940 the form says why it can offer nothing, and the refusal names the panel` |
| `518f02903` | `test(web): #940 the browser walk enrols an account and amortises against it` |
| `c71846df7` | `docs: #940 the roster in packages/db/README, apps/web/README and CONTEXT` |
| `2e03a0ef0` | `fix(runtime): #940 the prepayment World e2e enrols its account before configuring` |

The ticket was verified live on this branch before any code was written:
`gh api repos/BELCORT-SDN-BHD/clara/issues/940` returns `open`, labels `enhancement` +
`ready-for-agent`, and the issue carries **no comments at all** — so the body IS the newest Agent
Brief and there is no 2026-09-20 owner ruling comment to override it. The parent #911 is CLOSED as
split; its 2026-09-18 owner-ruling comment (option B, six defaults) and its 2026-09-17 triage
measurement were read and are cited below. (`gh issue view` prints nothing through this harness's
shells; `gh api … --jq` is what returns the body. A rig quirk, not a finding about the ticket —
#939's report recorded the same.)

---

## The seams I tested at

Written down before the first test, from the brief's own acceptance criteria. Every one is a public
interface the brief names; there is no cell at a seam the brief does not give.

| # | seam | kind |
|---|---|---|
| S1 | `clara.prepayment_account_enrolments` | new relation (posture, RLS, triggers, index — the repo's own structural standard) |
| S2 | `clara.enrol_prepayment_account(client, account, purpose, reason, op_key)` | new human door |
| S3 | `clara.retire_prepayment_account(client, account, purpose, op_key)` | new human door |
| S4 | `clara.create_prepayment_schedule(...)` | existing door, the roster arm |
| S5 | `clara.list_prepayment_attention(client)` | existing read, arm B's candidate predicate |
| S6 | the plan lane's monthly admission path | asserted by DRIVING it, not by reading it |
| S7 | `apps/web/lib/registers/prepayment-accounts.ts` | the web read + the two door calls |
| S8 | `PrepaymentAccountsPanel` rendered behaviour | the panel the brief asks for |
| S9 | `PrepaymentForm` rendered behaviour | the empty state and the not-enrolled refusal |
| S10 | `prepayments-walk.spec.ts` | the browser leg |

---

## Acceptance criteria, each with its evidence

### AC1 — the roster, its two doors, the required reason and the typed refusals

**Done.** `clara.prepayment_account_enrolments` (migration `0306_prepayment_account_roster.sql` §A)
is `clara.staff_advance_accounts`' (0043) shape, which is itself `clara.fa_account_profiles`' (0041)
clone — per CLIENT (owner decision 1), an immutable `[enrolled_at, retired_at]` interval,
version-forward on any change, a REQUIRED non-blank `reason` (decision 4), a no-delete +
no-truncate pair, forced RLS with `p_pae_owner` + a firm-predicated SELECT-only `p_pae_human`, and a
partial-unique live index on `(client_id, account_code, purpose)`.

Two deliberate departures from those two precedents, both stated in the file:

* **an update guard they do not carry.** 0041 and 0043 say in their own headers that they have no
  update-transition guard. Here the REASON is the fact the roster exists to hold, and a reason that
  could be rewritten in place is a label rather than a basis, so `_tf_pae_retire_only` admits
  exactly ONE update — the retirement stamp — and refuses a retired row outright. The
  version-forward path never needs an in-place edit, so the guard costs the doors nothing.
* **no op-key columns.** 0043 carries `created_op_key`/`retired_op_key`; `clara.op_receipts` already
  records which decision wrote which row, and 0041's profile carries neither.

Both doors are bookkeeper-floored (decision 2) and `clara_authenticated` ONLY.
`clara._reserve_op` idempotency is taken after identity/authz and before any mutable validation
(0305 §B's placement and its reasoning), so a retry of a SUCCEEDED call replays and a FIRST call
that fails a later validation rolls its reservation back with it.

*Evidence:* `packages/db/tests/prepayment-account-roster.test.mjs`

* `p940.enrol.records` — a viewer is refused CLR04; a bookkeeper enrols and the row carries
  who/when/why; a blank reason is refused CLR37 `prepayment_account_enrolment_invalid` /
  `reason_missing` and enrols nothing; an unchanged re-enrolment is idempotent (the SAME row, no
  second row written); a RESTATED reason version-forwards (two rows, exactly one live, the
  predecessor stamped); and the ACL is read POSITIVELY on both signatures —
  `clara_authenticated` true, `clara_agent_ro` / both wake roles / `clara_runtime` false.
* `p940.enrol.refusals` — every axis, each driven through a GOVERNED door rather than a
  hand-written row:

  | axis | how it was reached |
  |---|---|
  | `account_unknown` | a code this client's chart does not hold |
  | `control_account` | `374-C56`, the estate's own receivable control (`account_class` carried through = `receivable`) |
  | `account_reserved` | an account first enrolled through `clara.upsert_fa_account_profile` (refusal carries `domain = "fa"`) |
  | `bank_account` | an account first bound through `clara.add_bank_account` |
  | `not_asset_class` | the scene's expense target (`account_type` carried through = `expense`) |
  | `purpose_unknown` / `purpose_rule_not_stated` | a purpose outside the closed set, and `deferred_revenue` before #941 states its rule |
  | `reason_missing` | (in `p940.enrol.records`) |
  | `not_enrolled` | retiring an account with no live enrolment |
  | `client_not_found` (CLR11) | a client of another firm — the 0021 rule, no existence oracle |

  …and the client's live-enrolment count is unchanged across every one of them.

**The `account_inactive` axis is NOT driven, and that is stated rather than glossed.** No governed
door on this frontier can deactivate a chart account: `clara.upsert_account`'s full argument list is
`(p_client, p_code, p_name, p_type, p_special_acc_type, p_op_key, p_account_class)` — measured at the
live catalog — and there is no `retire_account` / `set_account_active`. The axis is the shared
wall's own (0042) and 0042's battery owns it; this door carries it through unchanged because it asks
that helper rather than restating it.

**Vacuity control** (this cell's subject already existed when the cell was written, so the work
order's control applies): the wall call in `clara.enrol_prepayment_account` was disabled
(`if false and v_breach is not null`), the migration re-applied with
`CLARA_MIGRATION_REDO=0306_prepayment_account_roster`, and `p940.enrol.refusals` FAILED —
"enrolling an account that is not on this chart: expected SQLSTATE CLR37 but got 23503 — insert or
update on table "prepayment_account_enrolments" violates foreign key constraint "fk_pae_account"".
The subject was then restored byte for byte and redone; both cells green again.

### AC2 — the purpose column from birth, `prepayment` only in this ticket

**Done.** `purpose text not null check (purpose in ('prepayment', 'deferred_revenue'))`, on ONE
roster. The owner's 2026-09-18 ruling is "No second roster is ever opened", and #941's
deferred-revenue mirror therefore adds an ARM rather than a relation.

**The COLUMN admits the second purpose; the DOOR does not.** Enrolling under `deferred_revenue`
refuses `prepayment_account_enrolment_invalid` / `purpose_rule_not_stated`, naming #941. That is a
decision, not an omission: AC2 says the deferred-revenue ticket "adds the second purpose, **its
account-type rule** (a non-control liability) and its own door check", so writing the liability arm
here would be widening this ticket into #941's; and admitting the purpose with no rule of its own
would enrol a liability under this file's ASSET rule.

*Evidence:* `p940.enrol.refusals` asserts both — the door's `purpose_rule_not_stated` refusal, and
that the live CHECK constraint's own text carries `deferred_revenue` (read off
`pg_get_constraintdef`, not off the migration's source).

### AC3 — the door asks the roster first, arm B asks the same question, and they agree both ways

**Done.**

* `clara.create_prepayment_schedule` (§D) asks
  `clara._prepayment_account_enrolled(p_client, v_prepaid, 'prepayment')` immediately BEFORE the
  shared wall and after the branch, so BOTH lanes (document-bound and #939's memo-only) are guarded
  by one question on whichever leg either lane picked.
* The refusal is 0140's OWN `prepayment_source_unfit` token with a NEW
  `axis: "prepaid_account_not_enrolled"` — the brief's "its ineligibility refusal gains a
  not-enrolled axis" — carrying `remedy: "clara.enrol_prepayment_account"` and
  `panel: "client_registers_prepayment_accounts"`.
* `clara.list_prepayment_attention` (§E) asks the SAME function in arm B's candidate predicate.
  Arm A, the cap, the ordering-before-cutting, both truncation flags and #939's `term_carrier` /
  `has_live_term` / `next_step` projection are untouched.
* **The predicate is spelled ONCE.** `clara._prepayment_account_enrolled(client, code, purpose)` is
  `stable security definer` and granted to NOBODY (reached only from a definer body, exactly as the
  shared wall is). Four callers: the door, arm B, and — when they land — #915's OBO twin and #941's
  deferred-revenue mirror.

*Evidence:*

* `p940.schedule.roster_gate` — an ELIGIBLE but unenrolled prepaid leg (a fresh asset account that
  passes all five negative axes) is refused with the axis, the remedy and the panel, and writes no
  schedule row; the SAME call succeeds once the account is enrolled; an account that fails BOTH the
  roster and the wall answers the ROSTER (the order the brief asks for); and the WALL is still live
  afterwards — an account enrolled while it was eligible, then bound through
  `clara.add_bank_account`, answers `prepaid_account_ineligible` with `breach.axis = "bank_account"`.
* `p940.attention.arm_b_roster` — the band does not advertise an unenrolled recognition; enrolling
  makes its row APPEAR and retiring makes it VANISH while the door starts refusing it (the "both
  ways" half); with no live enrolment at all arm B is empty; and the agreement is then measured over
  the WHOLE arm — every row the band offers is checked against the live roster, rather than over the
  one row the cell happens to know.

**A sibling cell changed by design, and it is named here rather than buried.**
`p653.schedule.prepaid_leg_ineligible` (`packages/db/tests/prepayment-schedule.test.mjs`) asserted
that an ordinary sales invoice's receivable control leg answers `prepaid_account_ineligible`. With
the roster asked first it answers `prepaid_account_not_enrolled`, which is the brief's own order and
owner decision 6 behind it. The cell now says the same thing at BOTH frontiers: it asks
`prepaymentRosterGateLive()` (a catalog probe by exact signature, never a migration number) and,
after 0306, asserts the roster refusal AND that the enrolment door refuses the same control account
with the shared wall's own `control_account` axis — so the wall's judgement is still measured, one
door earlier, which is exactly where decision 6 puts it.

### AC4 — monthly admission does not consult the roster

**Done, and driven rather than asserted.** `p940.retire.future_only` configures a schedule on an
enrolled account, retires the account from the roster BEFORE a single period has posted (the worst
case for decision 5), and then drives the whole path: `wake_due_plan_occurrences` admits the due
period, the Work is claimed, the entry REALLY posts through the OBO door (`posted === true`), and
the committed receipt is read back. Afterwards the stored `period_lines` are byte-identical, the
term and the prepaid account are unmoved, `get_prepayment_schedule`'s period projection is unchanged,
the roster row count is unchanged (no back-fill by the schedule, the scan, the Work or the posting),
nothing re-enrolled the account behind the retirement, and a NEW schedule on the same account is
refused by name.

**On vacuity:** this cell's claim is an ABSENCE (nothing on the admission path asks the roster), and
its control is that its positive half is driven end to end — a cell that could not admit, claim,
post and read back a committed receipt would fail on `posted === true` long before it reached the
absence. No mutant was applied, because breaking the claim would mean adding a roster check to the
plan lane's admission door, which this ticket must not touch.

### AC5 — the Registers panel, the form's empty state, en (and not zh) copy

**Done, except the zh half, which has nowhere to land.**

* `apps/web/components/registers/prepayment-accounts-panel.tsx` renders on the client's Registers
  page immediately after `FaAccountProfilesPanel` — the brief's own placement ("sits beside the
  fixed-asset account profiles on the client's Registers page"), and the reading is that this is an
  ACCOUNT-ENROLMENT panel and the Registers page is where this client's account enrolments live
  (the fixed-asset profiles above it, the staff-advance enrolments one tab across). It reads
  `clara.prepayment_account_enrolments` DIRECTLY through `lib/registers/prepayment-accounts.ts`, the
  same Q3 read-the-tables mechanism `fa-account-profiles-panel.tsx` uses, so `useHydratedPart`'s
  `act()` re-reads the live roster after every write.
* The empty state names the CONSEQUENCE ("Until one is, no prepayment here can be amortised"), and
  is gated on `loading`. Every row shows the REASON. The enrol dropdown offers only what the door's
  POSITIVE rule admits (active, non-control ASSET accounts) and never pre-empts the five negative
  axes. Confirm is disabled until a reason is typed. The retire dialog says the future-only sentence.
* `PrepaymentForm` reads the roster and, when it is genuinely EMPTY, says so and links to the panel;
  and the create refusal is discriminated by its AXIS, so `prepaid_account_not_enrolled` — the one
  `prepayment_source_unfit` fact whose remedy lives on another page — gets a sentence and a link
  beside the database's own words.

*Evidence:* `apps/web/lib/registers/prepayment-accounts.test.ts` (3 cells: the two door bodies with
their exact parameter names and the TRIMMED reason, and a CLR37 refusal surfacing as a
`DoorRefusal`); `apps/web/components/registers/prepayment-accounts-panel.test.tsx` (5 cells:
`p940.panel.empty`, `.rows`, `.enrol` — which asserts the posted body AND that the panel re-read,
`.reason_gate`, `.retire_copy`); `apps/web/components/prepayments/prepayments-roster-gate.test.tsx`
(4 cells, including `roster_unknown`: a roster read that FAILED claims NOTHING about the roster —
an absent answer is not evidence of an empty one).

**zh copy is unbuildable on this frontier, stated as a fact rather than skipped.** This build ships
a SINGLE static locale: `apps/web/i18n/request.ts:91` is `const locale = "en";` and `apps/web/messages/`
holds `en.json` alone (measured: `ls apps/web/messages` → `en.json`). Its own header says adding
`en-GB`/`ms`/`zh` is "a routing.ts + middleware change". There is no zh catalogue for these strings
to land in, and minting one for one namespace would be a translation lane this ticket did not ask
for. Recorded as a follow-up.

### AC6 — #915's twin door runs the same check, and the two tickets reference each other

**Half done here, by construction; the other half is #915's, and this lane lands it next.**

This ticket lands FIRST of the two, so per the brief ("whichever ticket lands second carries the
check into the other's door") #915 is the one that carries it. What this ticket did to make that a
one-line job rather than a copy: the roster question is `clara._prepayment_account_enrolled`, one
ungranted `stable` function, so #915's OBO twin asks it by CALLING it. The successor contract below
states the exact call.

**The conversation half's work question is NOT built here, and that is the brief's own division.**
AC6's last sentence says the parked work question with an account field and a reason field "belongs
to the `chatTurn_v21` / `claraWork_v5` cut, not to this ticket's human doors". This ticket therefore
mints no part kind, no tool and no prompt stanza; the successor contract records what such a cut
would need.

**Cross-references:** this ticket's migration header, `packages/db/README.md`'s 0306 section and
`apps/web/README.md`'s #940 section all name #915 and #941 and say what each carries. I cannot write
to GitHub (work order rule 2), so the reciprocal comment on #915/#941 is the orchestrator's.

### AC7 — the cells, the walk, from-scratch apply, the batteries stay green

**Done.** Enrolled passes / unenrolled refused with the panel named (`p940.schedule.roster_gate`);
reserved refused at enrolment (`p940.enrol.refusals`); retire closes the future only
(`p940.retire.future_only`); the browser walk covers enrolling an account and amortising against it
(`prepayments.walk.roster`); the prepayment and register batteries stay green (see the gate table).

**From-scratch apply.** The prestate's FIRST-APPLY branch was proved by hand, as the wave-3 addendum
requires of any bimodal pin (`CLARA_MIGRATION_REDO` only ever takes the "already recut" branch):
inside ONE transaction that was rolled back, 0305's OWN `create or replace function` statements for
`clara.create_prepayment_schedule` and `clara.list_prepayment_attention` were re-run verbatim —
restoring both to exactly the shas §0 pins
(`d1d3b532…`, `745ca303…`, printed by the script) — the §0 block was executed verbatim, and it
reported
`clara.create_prepayment_schedule(…)=FIRST clara.list_prepayment_attention(uuid)=FIRST`.
The rollback was verified afterwards: both bodies carry `#940` again, and the two unconditional pins
are byte-identical. The true from-scratch chain on a disposable cluster is the integrator's, per
RIG.md.

---

## The migration

`packages/db/migrations/0306_prepayment_account_roster.sql` — the one file, at the number reserved
for this ticket, 1376 lines. Sections: §0 prestate · §A the roster, its triggers, its RLS · §A.3
`clara._prepayment_account_enrolled` · §B the enrolment door · §C the retirement door · §D the
`create_prepayment_schedule` recut · §E the `list_prepayment_attention` recut · §TAIL.

**Prestate pins, MEASURED on `clara_l04` after 0305 and before the first apply** (every one listed,
as the wave-3 addendum requires, so the integrator can find a pin another lane recuts):

| signature | `sha256(prosrc)` | mode |
|---|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `d1d3b5326009c6d1149075d5fcb1c6eff943c4c59034685b59c4fa3ec0c50f4a` | bimodal (recut by §D) |
| `clara.list_prepayment_attention(uuid)` | `745ca3032410529233eb2bcad143553cb6a6b89026350fb5cb4450fe740093e9` | bimodal (recut by §E) |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` | **unconditional** — this file ASKS it and never edits it, so a changed sha is always a finding |
| `clara._acct_role_reserved(uuid,text)` | `e1b44ed0c2449c4e4947e40b0d9d2675da73d02c7365e90453382e158ebf69cd` | **unconditional** — the reserved-account axis rests on it |

Per body, not global, for 0305's own stated reason: three sibling tickets of this lane (#915, #941,
#1036) recut some of the same bodies immediately after this file. §TAIL re-measures
`clara._adj_line_eligibility_breach` AFTER the file has run — "this file does not change the shared
wall" is a claim, and the sha is the evidence.

**Post-0306 live shas, for whoever recuts these next (#915, #941):**

| signature | `sha256(prosrc)` |
|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `446a8dcd060ca7e274012e7a15baa6f5c54e912ee7c53633748adc26b88340b0` |
| `clara.list_prepayment_attention(uuid)` | `39c5a78b7784be389ba011d6f419a17f513631d01e91783c742f1f03cdb50ee2` |

**Redo-safe by construction** (#957): `create table if not exists`, `create or replace function`,
`drop trigger if exists` before each `create trigger`, `drop policy if exists` before each policy,
every index under `if not exists`. **Redos performed, and recorded here because the work order asks:**
the file was applied once and then re-applied with
`CLARA_MIGRATION_REDO=0306_prepayment_account_roster` **five times** (the posture fix; the vacuity
mutant; the vacuity restore; §D; §E) plus a final confirming redo. Final ledger checksum
`5756e51a2fbe549eb743b852345b4f8019474b5a3599e804a625757f05073999`; the integrator's from-scratch
chain is the authority.

**Gate module / cohort / chain, all three:**

* `packages/db/tests/prepayment-account-roster-preintegration-gate.mjs`, stem
  `prepayment_account_roster$` (never the number), env
  `CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_ROSTER`;
* `packages/db/tests/rig-meta.mjs` — `PREPAYMENT_ACCOUNT_ROSTER_0306_COHORT`
  (`enrol_prepayment_account` + `retire_prepayment_account` on the `clara_authenticated` roster;
  `_tf_pae_retire_only` and `_prepayment_account_enrolled` ungranted), bimodal like 0305's, plus its
  `cohortFailures` call;
* `packages/db/package.json` — the `--import` entry inserted in MIGRATION ORDER, immediately after
  `prepayment-stated-term-preintegration-gate.mjs` (0305 < 0306).

**One shared fixture edit, because otherwise every prepayment battery goes red.** Every prepayment
battery in `packages/db` reaches its recognition through `prepaidScene`
(`tests/f-a4-pr2a-fixtures.mjs`), so that builder now enrols its prepaid account through the REAL
door, guarded on that door's exact signature (`enrolPrepaidIfRostered` / `prepaymentRosterGateLive`,
re-exported through `prepayment-schedule-fixtures.mjs`). A database pinned before 0306 is
unaffected — the probe answers false and the call is a no-op.

**A data-dependent branch was entered.** §0's REDO arm counts roster rows and reports the count; it
ran with 334 rows on this rig. §TAIL has no data-dependent branch.

---

## Gates

Every count below is a real run on this lane's rig (`clara_l04`, port 55744) and this lane's
Playwright triple (3530 / 3531 / 3532). `$GATES` is the exact
`--import ./tests/*-preintegration-gate.mjs` list from `packages/db/package.json`'s `test` script,
derived programmatically rather than retyped. `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | command | result |
|---|---|---|
| the new db battery, focused (no gate preload — an absent migration must fail LOUDLY here) | `node --test --test-concurrency=1 tests/prepayment-account-roster.test.mjs` | **5 pass, 0 fail** |
| every prepayment / FA-limb / plan-overlap battery + the two censuses, FULL GATE CHAIN (16 files) | see the file list below | **170 tests, 169 pass, 0 fail, 1 skip** |
| the two evaluator-ceremony contracts + the five x42 adjustment batteries, FULL GATE CHAIN | `… tests/x42-{adj-due,adj-reads,adjustments-stale,r10-o3,r11-lineage}.test.mjs tests/{delta,epsilon}-contract.test.mjs` | **168 tests, 168 pass, 0 fail** |
| `operation-census` / `rig-isolation` | included in the 170 above; **no reset flag was ever set** | **green** |
| evaluator freeze lint | `node scripts/check-frozen-evaluators.mjs` | **OK — 9 evaluator(s) verified** |
| frozen-workflow manifest | `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen files, 55 "use workflow" modules, no diff** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `pnpm typecheck` | repo root | **`apps/web: Done`, `packages/runtime: Done`** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the WHOLE web unit suite, once | `node scripts/run-tests.mjs` from `apps/web` | **5003 tests, 5001 pass, 0 fail, 2 skipped** |
| the browser walk I touched, on MY triple | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 … pnpm --filter @clara/web e2e prepayments` | **8 passed (24.5s)** — the seven existing cells plus `prepayments.walk.roster`, each with its axe scan |
| the three OTHER walks that render the Registers page I changed | `… e2e depreciation` / `… e2e fixed-asset-acquisition` / `… e2e shell-migration` | **5 passed / 9 passed / 31 passed** |

The one skip in the db runs is `T19 poison-role`, which self-skips as destructive unless
`CLARA_RIG_ALLOW_RESET` is set; it was not. The two web-suite skips are the suite's standing ones.

The 16-file db set: `prepayment-account-roster`, `prepayment-stated-term`, `prepayment-schedule`,
`prepayment-term-liveness`, `prepayment-occurrences`,
`f-a4-pr2a-{schedule,census,books,carrier,wrapper}`, `f-a4-pr1c-walls-census`,
`journal-basis-zero-total-unreachable`, `plan-overlap-sibling-arm`,
`plan-overlap-template-arm-retired`, `operation-census`, `rig-isolation`.

**The runtime World e2e I edited.** `packages/runtime/tests/prepayment-occurrence-e2e.mjs` builds its
own scene and calls `clara.create_prepayment_schedule` directly, so 0306 would refuse it; it now
enrols its prepaid account through the real door, probed by exact signature. Driven on a CLONE of
this lane's database (`create database clara_rt_test template clara_l04`, dropped afterwards, per
RIG.md's wave-2 addendum): it printed `enrolled 19000001 on the #940 prepayment roster`, the schedule
with its `50000 / 50001` allocation, and `PASS 1: two concurrent belt passes → one occurrence, one
Work carrying 50001`. The WORLD half of that driver could not be reached on this rig — see
"unverified" below.

---

## Docs, in the same commits

* `packages/db/README.md` — a `## 0306` section: why the positive half could not be a chart class
  (measured: `coa_accounts.account_class` has two members and the shared wall reads any non-null one
  as a control account), the two things the roster does NOT copy from its two siblings and why, the
  purpose as a column before it is a rule, the axis table, the one spelling with four callers, the
  roster-then-wall order, the prestate pins with their modes, the gate/cohort/chain trio, and the
  shared scene builder's frontier-guarded enrolment.
* `apps/web/README.md` — a `## #940` section: the panel's load-bearing choices, the form's
  empty-roster claim gated on a real empty ARRAY rather than a null, the refusal discriminated by
  AXIS, the browser leg, and the EN-only copy with its measurement.
* `CONTEXT.md` — **Prepayment account roster** in the house `term / _Avoid_` shape, placed with the
  prepayment family; and ONE sentence amended in **Prepayment schedule**, because eligibility now
  has a positive half ("ENROLLED on the client's Prepayment account roster, and judged ELIGIBLE by
  the same rule every other lane uses…").
* `apps/web/components/prepayments/prepayment-form.tsx`'s header said arm B is "approved,
  document-bound, exactly one debited asset line". That sentence has been false since #939 and is
  now false twice; it says what arm B's predicate actually is.

---

## Successor contract

Nothing in this ticket is buildable as a chat or Work tool, and two of the three entries are
prohibitions rather than capabilities. Recorded so the `chatTurn_v22` / `claraWork_v6` cut at the end
of wave 4 does not "complete" them by accident.

### 1. For #915's OBO twin, in this lane, from me — the roster check, as a CALL

`clara._prepayment_account_enrolled(p_client uuid, p_account_code text, p_purpose text)` — argument
order as written — answers `boolean` for the LIVE population. It is `stable security definer`, owned
by `clara_fn_owner`, granted to NOBODY: reach it from a definer body, exactly as
`clara._adj_line_eligibility_breach` is reached. #915's twin should ask it in the same place §D asks
it — after the branch that picks the prepaid leg, BEFORE
`clara._adj_line_eligibility_breach` — and raise the SAME refusal:

```
raise exception 'account % is not enrolled as a prepayment account for this client', v_prepaid
  using errcode='CLR10',
    detail=jsonb_build_object('reason','prepayment_source_unfit',
      'reason_text', 'account ' || v_prepaid || ' is not enrolled as a prepayment account for this client',
      'axis','prepaid_account_not_enrolled', 'prepaid_account_code', v_prepaid,
      'source_entry', p_source_entry,
      'remedy','clara.enrol_prepayment_account',
      'panel','client_registers_prepayment_accounts')::text;
```

The web already renders that axis (`prepayment-form.tsx` reads `DoorRefusal.detail.axis`), so a twin
that spells it identically inherits the surface for free.

### 2. For #941's deferred-revenue mirror, in this lane, from me — the arm, not a relation

`clara.prepayment_account_enrolments.purpose` already admits `'deferred_revenue'`. #941 opens it by
REPLACING one arm of `clara.enrol_prepayment_account`:

* delete the `purpose_rule_not_stated` raise;
* branch the positive rule: `'prepayment'` → `account_type = 'asset'` (unchanged);
  `'deferred_revenue'` → a non-control LIABILITY (`account_type = 'liability'`; the control axis is
  already covered by the shared wall call above it, so the arm only adds the type);
* keep the shared-wall call and the version-forward block untouched — they are purpose-agnostic;
* ask `clara._prepayment_account_enrolled(client, code, 'deferred_revenue')` in the deferred-revenue
  release door, and in whatever attention arm advertises deferred-revenue candidates.

No second relation, no second panel read: `loadPrepaymentAccounts(session, clientId, purpose)`
already takes the purpose and defaults to `'prepayment'`.

### 3. What a `chatTurn_vN` / `claraWork_vN` MAY carry — a prompt stanza, no tool, no part kind

**No write tool, and that is a ruling rather than an omission.** `clara.enrol_prepayment_account`
holds no agent grant and has no wake wrapper, asserted by `pg_proc` count in §TAIL. Enrolling an
account is a judgement about a client's chart with unbounded blast radius (0041's own words about
the FA profile), and the reason it requires is a professional's statement — a reason a model supplied
would be a model-generated value entering a durable artifact (hard constraint 2).

* **Tool name:** none. **Zod input:** none. **Door call:** none. **Part kind:** none.
* **Prompt stanza**, proposed text for whoever cuts it:

  > When a prepayment cannot be amortised because its account is not enrolled as a prepayment
  > account, Clara says so, says which account, and points at the client's Registers page. She never
  > enrols an account herself and never proposes which account should be enrolled: whether an account
  > holds prepayments is a judgement about the client's chart that a bookkeeper makes and records
  > with their reason. If asked to enrol one, Clara says that this is one of the things only a person
  > may state, and names the panel.

* **Refusal mapping**, for any surface that ever renders these doors' answers (the web already does):
  `prepayment_account_enrolment_invalid` with `axis`:
  `reason_missing` → "Say why before enrolling this account";
  `account_unknown` / `account_inactive` / `control_account` / `bank_account` / `account_reserved` →
  the estate's own sentence for that axis, with `account_class` / `domain` / `role` / `owner_ref`
  when the payload carries them;
  `not_asset_class` → "a prepayment is a prepaid asset", naming `account_type`;
  `purpose_unknown` / `purpose_rule_not_stated` → "that purpose has no rule on this database yet";
  `not_enrolled` (retire) → "no live enrolment stands on that account".
  And on the schedule door: `prepayment_source_unfit` with `axis = prepaid_account_not_enrolled` →
  the panel, named, with the payload's own `remedy`.

### 4. The parked conversation half AC6 names, restated so it is not lost

AC6's last sentence assigns the work question — an account field and a reason field whose accepted
answer runs the enrol door AS THE ANSWERING PERSON, rendered by the existing question card and the
Needs-you affordance — to the `chatTurn_v21` / `claraWork_v5` cut, explicitly NOT to this ticket.
Nothing here builds it, and `apps/web/lib/firm/needs-you.ts` gains no row kind from #940 (the shared
file is untouched by this ticket). Whoever cuts it needs: the enrol door's five arguments, the
answering person's own identity at the floor (the door is `clara_authenticated`-only, so the answer
must run in the human lane, not the wake lane), and the refusal mapping above.

---

## Follow-ups worth filing

1. **`account_inactive` is unreachable through any governed door.** `clara.upsert_account` has no
   `p_active` and no retire/deactivate door exists for a chart account, so the shared wall's
   `account_inactive` axis cannot be driven from the human lane at all — on this door or any other
   that asks the wall. Either the axis is dead for chart accounts, or the chart is missing a
   deactivation door; both are worth an owner decision.
2. **A zh catalogue.** This build ships one static locale; the brief asked for en and zh copy on
   this panel. A translation lane needs `routing.ts` + middleware + a `zh.json`, which is bigger than
   any one ticket's copy.
3. **The roster is not part of `clara._acct_role_reserved`.** An account enrolled as a prepayment
   account can still be bound as a bank account or enrolled in the FA register the next day — the
   schedule door then refuses it by the wall, which `p940.schedule.roster_gate` drives. Whether a
   prepayment enrolment should RESERVE the code against the other registers (as the FA and
   staff-advance rosters reserve theirs) is a widening of the shared wall this ticket was told not
   to change.
4. **The panel's placement.** It sits inside the Registers page's `fixedAssets` tab because that is
   where the fixed-asset account profiles are and the brief says "beside" them. A reader looking for
   prepayment settings would plausibly look at `/prepayments` first. Worth a product view once the
   roster has been used.

---

## Unverified / pre-existing, stated rather than asserted

* **The runtime World half of `prepayment-occurrence-e2e.mjs` could not be run on this rig.** The
  driver spawns a durable World, and the World fails to start because the `workflow` schema is not
  bootstrapped on this lane's database — measured:
  `select count(*) from information_schema.schemata where schema_name='workflow'` → `0` on
  `clara_l04`. RIG.md's wave-2 addendum forbids bootstrapping a World on a lane database
  (it reds `rig-isolation.test.mjs` T10b, #866). What I DID verify, on a clone, is everything up to
  and including the belt: the enrolment, the schedule with its exact allocation, and `PASS 1`. The
  `nitro build` that produced `packages/runtime/.output` on the way is a gitignored artifact
  (`.gitignore:13`).
* **I did not run a true from-scratch chain.** The prestate's FIRST branch is proved by hand as
  described; the from-scratch apply on a disposable cluster is the integrator's, per RIG.md.
* **`p940.retire.future_only` has no mutant control.** Its claim is an absence on a path this ticket
  must not touch; its control is that the positive half is driven to a committed receipt. Stated
  above under AC4.
* **`gh issue view` returns empty output through this harness** (both shells). The ticket was read
  through `gh api repos/BELCORT-SDN-BHD/clara/issues/940` and `…/comments` (which returned an empty
  array), and #911 through the same route. If the brief was edited through a route the API does not
  show, I would not have seen it — I have no reason to think so.
* **A scratchpad helper was overwritten mid-session by something outside this worker.** A small
  throwaway `q.mjs` I wrote in the session scratchpad came back with different contents partway
  through; I re-created it under another name and moved on. It affected no repository file and no
  gate result (every gate above was re-run after), but it is worth the orchestrator knowing that the
  session scratchpad is not private to one worker on this host.
* **I did not run the whole `packages/db` sweep or the whole `packages/runtime` unit suite.** The
  work order asks for the files I added or touched with the full gate chain (done, plus the eleven
  neighbouring batteries most likely to be moved by a door recut) and, for `packages/runtime`, the
  unit files I touched — I touched no runtime unit file, only the standalone World driver, which is
  not in that package's `test` glob.
