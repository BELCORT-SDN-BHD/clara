# Wave 4 · lane 04 · fix round — the single implementer's report

**Branch** `riders/w4-lane04` · **worktree** `C:\Users\zhant\Desktop\clara-wt\651` · **base**
`cd2925391` · **database** `127.0.0.1:55744/clara_l04`.

**Head before this round** `c8fdb6acc` · **head after** `2d7736a6d`.

Six commits, one per slice (five `fix(...)` plus one comment-only follow-on):

| commit | subject |
|---|---|
| `9b47554eb` | `fix(db): #941 the retired-arm battery follows create_accounting_plan's live body, which 0308 moved` |
| `5a9677435` | `fix(db): #1036 the wake lane refuses rather than configuring a plan nothing could ever post` |
| `9b5f1cf49` | `fix(db): #939/#941 the stated reason stops crossing the bookkeeper floor on all four schedule reads` |
| `cb336feb5` | `fix(db): #939/#940/#941 the three carrier bounds, the reversed source and the enrolment race are answered by name` |
| `2bb4c1a0a` | `fix(web): #939/#941 a withheld stated reason says so, and the corrected-term banner stops promising a door that does not exist` |
| `2d7736a6d` | `docs(db): #1036 the containment cell's comment names the successor cell that actually exists` |

Every database change rides ONE migration: `0315_prepayment_wake_reroute.sql`, this lane's own
unmerged file, re-applied four times with the supported redo path
(`CLARA_MIGRATION_REDO=0315_prepayment_wake_reroute`, `CLARA_ALLOW_DESTRUCTIVE=1`, `CLARA_RIG_DB=1`).
Final checksum `c6436f359bb880f452d7eb44f6558708e8871addb8549a9d8057be7c81f61c85`. No applied
migration of any other lane was edited, and 0305/0306/0307/0308 are byte-unchanged — the fix round
re-emits the bodies it corrects, whole, in 0315, which is the estate's own "a later migration fixes
an earlier one" shape and the only one the redo path supports (redo is highest-applied-version
only).

---

## THE ONE THING THE ORCHESTRATOR MUST CARRY TO THE OWNER

**#1036's AC1 and AC2 are not delivered, and cannot be without an owner decision on plan authority
for the clocked lane.** See L04-SPEC-02 / ADV-01 below for the measurement. In one paragraph:

> Every accounting plan in this estate names the person whose instruction authorises it, and every
> month's Work is admitted **as that person** (`clara._plan_admit_occurrence` hands the plan's
> `authorised_by` to `clara.admit_journal_work`, which re-checks their membership, activity and
> rank). An unattended `close_prep` wake names nobody — `clara.mint_wake_credential_for_task`
> forbids `on_behalf_of` by construction. So the first cut's wake-created plan could never admit a
> single occurrence: it was configured and posted nothing, every month, forever. The lane now
> refuses at configuration time, by name, and writes nothing.
>
> **The decision the owner owns:** should an unattended wake be able to configure an amortisation
> schedule at all, and if so, under whose authority? The two buildable answers are (a) name a
> directing human for the clocked lane (the firm member who enabled the source? the client's
> engagement lead? the estate holds neither today), or (b) widen
> `clara.accounting_plans.authority_kind` to distinguish an agent-wake plan **and** extend the
> admission body to accept an agent-authored plan — which is a change to the accounting-authority
> control that #977/0250 deliberately narrowed. Until then the wake door answers CLR03
> `wake_authority_absent` and names `clara.create_prepayment_schedule` as the door that can.
>
> Nothing goes dark that was live: `clara.wake_engine_sources.close_prep` is `enabled = false`, and
> `packages/runtime/workflows/closePrep.v1.tools.ts` never exposed the thirteenth tool. What #1036
> exists to close — `clara._propose_adjustment_template_core` losing its last caller — is delivered
> in full.

A second question, smaller, is carried under L04-SPEC-04: the correction path both #939 AC4 and
#941 AC3 name does not exist in any door, and the positive half needs an owner ruling on what the
replacement schedule is derived from.

---

## Findings, one by one

### L04-SPEC-01 · blocker · FIXED

**Reproduced first.** `node --test --test-concurrency=1 tests/plan-overlap-template-arm-retired.test.mjs`
on `clara_l04` at `c8fdb6acc` → 6 tests, 5 pass, **1 fail**: `p929.tail`,
`clara.create_accounting_plan(...) is not at the body 0283 writes`, actual
`c8e99098…`, expected `99f60787…`.

**Cause, confirmed:** `0308_deferred_revenue_recognition.sql` (#941) recuts that door to admit the
`revenue_recognition_schedule` plan kind and names `99f60787…` as its own pre-image (0308 §0's
`v_recut` table). The pin in `packages/db/tests/plan-overlap-template-arm-retired.test.mjs` was
written against 0283's body and was never touched by this branch — so the red is a regression
against the review's fixed point, not a pre-existing failure. #1036's own report called it
pre-existing; that sentence was true only against #1036's four commits.

**Fix.** The pin follows the live body, with the migration that moved it named beside it. 0283's two
real assertions (the client rung above any plan row lock, the advisory called with the plan's own
id) are re-proved against the NEW body by the same loop, which is why this file pins text rather
than a migration number.

**Gate.** Same command → 6 tests, 6 pass, 0 fail, 0 skip.

### L04-SPEC-02 (major) + ADV-01 (blocker) + STD-1 (major) + ADV-06 (note) · FIXED, as one change

**Reproduced first**, on `clara_l04`, driving the real doors:

```
WAKE plan 06972ca8…  next_occurrences 2025-02-28 / 03-31 / 04-30
agent memberships: 0
WAKE  admit 2025-02-28 -> {"admitted":false,"code":"CLR11","reason":"client_not_found", …}
HUMAN admit (identical scene) -> {"admitted":true,"work_id":"14b73552-…", …}
```

`clara.agent_user_id()` holds zero `clara.firm_memberships` rows;
`clara._plan_admit_occurrence` (0308) passes the plan's `authorised_by` to
`clara.admit_journal_work`, whose core raises CLR11 `client_not_found` for an author with no
membership. Both the belt (`clara.wake_due_plan_occurrences`) and the human catch-up
(`clara.request_plan_catch_up`) route through that one body, so no path could post. The plan also
wrote `authority_kind = 'explicit_instruction'` about a clocked run (ADV-06), and
`clara._prepayment_plan_core_wake` duplicated ~25 lines of `clara._obo_plan_core`'s plan-write tail
(STD-1).

**Fix.** `clara._prepayment_schedule_core`'s `'wake'` lane now answers CLR03
`wake_authority_absent` — naming the wake kind, the task that asked and
`clara.create_prepayment_schedule` as the remedy — **ahead of the op reservation and ahead of every
input wall**, and `clara._prepayment_plan_core_wake` is dropped. Two consequences the review asked
for fall out of the same change: no plan row claims a person's instruction for a clocked run
(ADV-06), and the estate is back to exactly two plan-writing bodies for this family, both asking
`clara._authority_ref_refusal` (STD-1 — the smell is not argued away, the duplicate body is gone).

The refusal is answered in the CORE rather than in the wrapper so that every reason this door can
refuse stays readable in one place (#915's own argument), the wrapper keeps its pure-delegation
shape, and re-opening the lane later is one arm in one body rather than a second door.

**What #1036 still delivers, unchanged and re-proved:** `clara._propose_adjustment_template_core`
has NO caller anywhere in the `clara` schema, is executable by no application role, and
`clara._agent_prepayment_schedule_core` stays retired to an unconditional typed refusal at its exact
pre-#1036 signature and ACL. AC3, AC4 and AC5 are met. **AC1 and AC2 are not** — see the owner
question above; the migration header, `packages/db/README.md` and this report all say so.

**Also fixed while here:** 0315's prestate expected exactly one mention of the template core
*unconditionally*, so the file could not be redone at all (the first redo failed on it). It is now
mode-aware — 1 on a first apply, 0 on a redo, because by then this file has retired that one caller.

**Battery, rewritten to the new subject** (`tests/prepayment-wake-reroute.test.mjs`, 6 cells, all
driven on a real `clara_wake_interactive` session):
`p1036.refused` (close_prep flipped true inside a rolled-back transaction; CLR03, the typed detail,
zero durable rows of any kind, **and** the same scene through the HUMAN door whose plan is driven
through `clara._plan_admit_occurrence` and **admits** — the contrast that makes the refusal
meaningful), `p1036.authority-first`, `p1036.refusal-stable` (including a fresh credential),
`p1036.no-agent-plan-lane` (the dropped function, a catalogue scan for ANY body writing a plan under
the agent identity, and a driven-delta assertion), `p1036.template-core-retired`,
`p1036.wrapper-shape`.

**Gate.** `prepayment-wake-reroute` 6/6. The four cells were seen RED first
(`prepayment_target_underivable` where `wake_authority_absent` was expected; the dropped function
still present).

### L04-SPEC-03 · major · FIXED (retargeted, not restored verbatim)

W35 / W35-mutant / W31 are back in `packages/db/tests/f-a4-pr2a-books.test.mjs`, driven through the
**live** lane. The first cut deleted them because their machinery (propose → a human signs → the
belt posts) is gone — true of their machinery, false of their subject. W35's subject is an
accounting claim about the books; W31's is a lifecycle claim about the fiscal year. Both rules are
alive. Measured before the retarget: after the deletion the prepayment lane had **no** end-to-end
proof that its schedules close the books, and a repo-wide grep found **no** cell anywhere asserting
`fiscal_years.successor`.

- `fa4p2a.W35` — 100000 sen over 3 months (deliberately not divisible), configured through
  `clara.create_prepayment_schedule`, every occurrence admitted through the catch-up window and
  **posted** through the real belt (claim → `wake_record_journal_entry` → settle → a committed
  receipt per period). The prepaid asset reaches **exactly zero**, the expense side totals the term,
  and the per-period debits are `[33333, 33333, 33334]` read off the ledger.
- `fa4p2a.W35-mutant` — two of three periods posted leaves the prepaid account at exactly
  `100000 - 33333 - 33333`, which is the vacuity control for the cell above.
- `fa4p2a.W31` — a stated term running into the following financial year is refused
  `prepayment_term_underivable` with `missing = 'fiscal_years.successor'` and the FY end named; the
  same call is refused again under a fresh key (the refusal is a state, not a flake); opening the
  successor year through `clara.open_fiscal_year` makes the SAME configuration succeed.

W34 stays retired and the file's header now says why in one line: its human half
(`clara.propose_adjustment_template`) went at 0282, so there is no door left to be equivalent to.

**Gate.** `f-a4-pr2a-books` 6/6, 0 skipped.

### L04-SPEC-04 · major · PARTLY FIXED (the surfaces), ONE FOLLOW-UP OWED (the door)

**Measured:** `uq_prepayment_schedules_source` admits one schedule per recognition entry, and
`clara.create_prepayment_schedule` answers CLR13 `prepayment_schedule_exists` for a second one
(`p653.schedule.one_per_entry`, `p939.supersede.running`); 0308 mirrors the constraint on the
revenue side. So "a new schedule from the next period" — the correction path #939 AC4, #941 AC3 and
owner decision 3 all name — exists in **no** door.

**Fixed here (the half that is fixable in this lane): the surfaces stop giving advice nobody can
act on.** The superseded-term banner on both registers now states the fact — *one recognition
carries one schedule, so the periods below will run to the term they were derived from; raise the
difference with the reviewer* — and both stated-term forms say the same thing **before** the term is
stated, which is where it is still actionable. The old copy ("a corrected term needs a new schedule
from the next period") is gone from `apps/web/messages/en.json` and from the cells that pinned it.

**Owed, and it needs an owner ruling before either lane is advertised:** a door that opens the
replacement schedule. The ruling needed is what it is derived FROM — the un-amortised balance of the
running schedule, or a fresh recognition entry — and what happens to the running schedule's future
periods. I did not file a GitHub issue (this lane never writes to GitHub); the orchestrator owns
that.

### L04-SPEC-05 · minor · ANSWERED IN THE HEADER

The wake lane writes no `clara.agent_act_receipts` row. With the fix round it writes **nothing at
all** — a raised refusal leaves no durable act for a receipt to describe — so the question dissolves
rather than needing an owner ruling. Said so in 0315's header (the "what this file deliberately does
not do" list) and in `packages/db/README.md`, rather than only in a test comment.
`fa4p2a.W13-retired` is retargeted to the new shape: a well-formed call and a malformed one both
RAISE and neither writes a receipt, and `clara.agent_act_receipts` does not grow across the pair.

### L04-SPEC-06 · minor · NOTHING TO DO IN THIS LANE (confirmed)

Re-measured on this branch: `apps/web/messages` holds `en.json` alone and
`apps/web/i18n/request.ts:91` pins `const locale = "en";`. There is no zh catalogue for these
strings to land in. Every string this fix round adds or changes is en-only for the same reason.
**#940 AC5's and #941 AC6's "zh copy" half should be struck when those tickets are closed and
attached to the translation ticket instead** — closing them on evidence that cannot exist would be
the defect.

### ADV-02 · major · FIXED

**Reproduced first**, driving the real doors as carol, a VIEWER of the owning firm:

```
carol, direct read of clara.prepayment_stated_terms  -> n = 0      (the table's policy works)
carol, clara.get_prepayment_schedule                 -> term_reason = "SECRET-GROUNDS: …"
carol, clara.list_prepayment_schedules               -> the same
carol, both revenue reads                            -> the same
```

`clara.prepayment_stated_terms` carries `p_pst_human`
(`clara.actor_role_rank() >= clara.role_rank('bookkeeper')`) and 0305's own comment says why;
`clara.document_service_periods` carries the identical policy and the document-lane branch of these
same reads never projects `sp.basis`. The four reads are SECURITY DEFINER entering at viewer floor,
so the policy never ran for them.

**Fix (0315 §E).** The four reads are re-emitted whole — 0305's and 0308's own text, never a splice
— with one gate: below the bookkeeper floor `term_reason`, `term_stated_by` and `term_stated_at`
come back null and a fifth field, `term_reason_withheld`, is **true only when a statement actually
exists**. A FIELD wall, not a narrower read: the cells assert the viewer keeps the schedule, its
amount, its carrier and its term liveness. The flag is what lets a surface say "recorded; visible to
bookkeepers and above" instead of "none" — the standing ruling that a wall prompts rather than going
dark — and it can never turn an absent statement into a hidden one.

**Surface half.** `apps/web/lib/navigation/tree.ts` gives both registers `minimumRole: 'viewer'`, so
this lands on a real screen: both detail components render the withheld note instead of three
em-dashes, keyed `=== true` (an absent field on a web build ahead of its database is falsy).

**Gates.** `p939.reads.reason_floor` (seen RED first: *the viewer was handed the stated reason*),
`p941.reads.reason_floor`, `prepayments.detail.reason_withheld` ×2 (the first seen RED first).

### ADV-03 · major · FIXED

**Reproduced first**, as a bookkeeper through the real door: `1899-01-01` → SQLSTATE 23514
`ck_pst_domain`, `detail = undefined`; `'infinity'` → 23514 `ck_pst_domain`; a 200-month term →
23514 `ck_pst_max_periods`. None carries a `detail.reason`.

**Fix (0315 §F).** `clara.record_prepayment_stated_term` now asks finite → domain → inverted → cap,
in that order (`'infinity'` is also out of domain, so finiteness first is what makes the answer say
the thing that is actually wrong), raising the three tokens
`prepayment-stated-term-fixtures.mjs` has declared since #939 and nothing raised. Each refusal
carries the bound it broke (`domain_start`/`domain_end`; `period_count`/`max_periods`). The cap is
`ck_pst_max_periods`' expression verbatim, not a date subtraction, because decision 5 is "the same
120-month cap as a document term" and a cap computed a second way would be a second cap. The
constraints stay — they are the backstop for any OTHER writer, and the cell asserts all three are
still on the relation.

**Gate.** `p939.stated_term.bounds`, seen RED first; 120 months exactly is admitted, so the cap is a
boundary rather than a fence in the wrong place.

### ADV-04 · minor · FIXED (the enrolment door) and REFUTED (the retirement door)

**Reproduced first**, two REAL connections, each a distinct bookkeeper of the same firm, the winner
held open until the loser reached its INSERT: session A returned an enrolment, session B returned
`{"code":"23505","constraint":"uq_prepayment_account_enrolments_live"}` with no detail.

**Fix (0315 §H).** The insert is wrapped in `exception when unique_violation` and re-raised CLR13
`prepayment_account_enrolment_raced`, naming the enrolment that stands — the same shape 0315 §B's
own duplicate-race handler uses.

**Refuted, with evidence:** `clara.retire_prepayment_account` does NOT need the same handler and is
left byte-unchanged (and pinned in 0315's tail). It is an UPDATE with no INSERT, so the loser blocks
on the winner's row lock, then matches zero rows and takes the door's own typed `not_enrolled` arm.
Driven, not argued: `p940.enrol.race`'s second half runs the same barrier over the retirement door
and asserts CLR37 / `prepayment_account_enrolment_invalid` / axis `not_enrolled`.

**Gate.** `p940.enrol.race`, seen RED first (`'23505' !== 'CLR13'`).

### ADV-05 · minor · FIXED

**Reproduced first:** a 90000-sen advance reversed through `clara.reverse_entry` (the row reads
`status = 'approved'`, `reversed = true`) was then accepted by
`clara.create_revenue_recognition_schedule` — schedule `dac04d29…`, total 90000 over 3 periods — and
its prepayment twin by `clara.create_prepayment_schedule`.

**Fix (0315 §G, plus arms in §B and §F).** One predicate — the one
`clara.list_revenue_recognition_attention`, `clara.list_prepayment_attention` and #940's band
already filter on — now asked by `clara._revenue_recognition_core`, by
`clara._prepayment_schedule_core` (**above** the document/memo branch, so neither carrier can drift)
and by `clara.record_prepayment_stated_term` (which already selected `je.reversed_by` into its
record and never looked at it — the review's "use it or drop it"; it is used). Token: each lane's
own `*_source_unfit` with axis `source_reversed`, naming the reversal.

**Gates.** `p939.create.reversed` (both carriers **and** the stating door) and `p941.create.reversed`
(the human door **and** the OBO twin), both seen RED first
(*expected SQLSTATE CLR10 but the call SUCCEEDED*). Each cell also measures the attention band
before and after the reversal, so the door and the band are asserted to agree rather than assumed
to.

### STD-2 · minor · NO CODE CHANGE (agreed, and carried forward)

#941's web layer landed in one inherited 2,550-line commit whose pre-session TDD provenance is
unverifiable from history. Nothing in this fix round changes that. The note stands for the
integrator: if `deferred-revenue-render-states.test.tsx` is audited for test quality later, treat
its cells authored before `adde3a6d9` as unverified-vertical-slice rather than confirmed-compliant.
The cells this fix round adds were each written first and seen red (named above, per finding).

### ADV-07, ADV-08, L04-SPEC-07, L04-SPEC-08, L04-SPEC-09 · notes · unchanged

- **ADV-07** (one op key reused across the two lanes collides on the nested `':plan'` reservation and
  answers an untyped CLR10): left as the reviewer filed it — optional, predates this lane (0222 and
  0223 already share the suffix), and qualifying the nested key would move an idempotency namespace
  three other doors already share. Worth a follow-up, not a fix-round change.
- **ADV-08** (0315 ships no `rig-meta.mjs` cohort): still true and still disclosed. The fix round
  changes nothing about the argument — 0315 now creates **no** function at all (it drops one and
  recuts ten that already carry their own cohorts from 0305/0306/0308), so a cohort row would have
  nothing new to name. `operation-census` and `rig-isolation` re-run green with `rig-meta.mjs`
  untouched.
- **L04-SPEC-07** (the template core is asserted retired rather than retired the sibling way),
  **L04-SPEC-08** (the three reads' runtime grant posture) and **L04-SPEC-09** (the `release_side`
  reading) are recorded as correct-as-built; no change.

---

## Gates, with counts

Run on `clara_l04` (127.0.0.1:55744) from the lane worktree, Node 22.

| gate | result |
|---|---|
| `prepayment-wake-reroute`, `prepayment-stated-term`, `prepayment-account-roster`, `revenue-recognition`, `prepayment-schedule-obo`, `prepayment-schedule`, `prepayment-occurrences`, `prepayment-term-liveness`, `accounting-plans`, `accounting-plan-occurrences`, `plan-overlap-template-arm-retired`, `plan-overlap-sibling-arm`, `plan-schedule-yield-wall`, `f-a4-pr2a-books`, `f-a4-pr2a-wrapper`, `f-a4-pr2a-census`, `f-a4-pr1c-walls-census` (full 111-entry gate chain) | **158 tests, 158 pass, 0 fail, 0 skip** |
| `operation-census`, `rig-isolation`, `delta-contract`, `epsilon-contract`, `x42-adj-due`, `x42-adj-reads`, `f-a4-pr2a-schedule`, `f-a4-pr2a-carrier`, `coa-template-pr-a`, `coa-template-pr-b` | **293 tests, 292 pass, 0 fail, 1 skip** |
| `pnpm typecheck` (root) | clean — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | **exit 0** |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5033 tests, 5031 pass, 0 fail, 2 skipped** (the review's baseline was 5030/5028/2; the three new cells are the difference) |
| `pnpm --filter @clara/web e2e prepayments-walk` on the lane triple (3530/3531/3532) | **8 passed** (26.3s), 0 failed |
| `pnpm --filter @clara/web e2e deferred-revenue-walk` on the lane triple | **3 passed** (10.2s), 0 failed |
| migration redo | `redid 0315_prepayment_wake_reroute · new checksum c6436f359bb880f452d7eb44f6558708e8871addb8549a9d8057be7c81f61c85` |
| **fresh-apply prestate proof** (wave-3 addendum) | inside ONE rolled-back transaction, every pinned body restored to the pre-image a from-scratch chain leaves (0140/0305/0307/0308's own statements re-run as `create or replace`), then 0315 §0 executed **verbatim** → `FIRST=10 REDO=0`, no drift refusal |

`apps/web/tests/firm-scope-db-pins.test.ts` runs inside the whole-suite pass above and is green:
0315 adds no dynamic SQL, so it needs no `REVIEWED_DYNAMIC_SQL_BARRIERS` entry and nothing in
`firm-scope-db-pins.corpus.ts` moved.

---

## 0315's prestate pins after the fix round

RECUT (bimodal: the measured pre-image, or a body already carrying `#1036`). Every value MEASURED
live on `clara_l04`, never copied from an older header. The integrator uses this list to find a pin
another lane recuts.

| signature | pre-image `sha256(prosrc)` |
|---|---|
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `143d4526bea145be8529b77c95a1438fb0753c17c11dc57e4f742edfd3130c9f` |
| `clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)` | `9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7` |
| `clara.get_prepayment_schedule(uuid)` | `a97e8a660b2c8092fc2d867452081e98806507b2a6a322ddd95769e404d9dcd2` |
| `clara.list_prepayment_schedules(uuid)` | `5e9312153959799fb74aced026513c71efcf1bd89665a71693546c38cafcb671` |
| `clara.get_revenue_recognition_schedule(uuid)` | `7cb0eb58be588bf0faab283c9ddcfe83f702f7a1f2c2c133b97714cf6a019cad` |
| `clara.list_revenue_recognition_schedules(uuid)` | `075a90ecfe7ee698610716534c5dfdc402ccf56c109f17fb93c03b5d6d031235` |
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` | `dc122ca3a216b7eae3d1d4678b2921911a1045f1ea761db5f3467685c8a1f554` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `5f71dbc2fe984a06c9c60f62bbaaefc8d34e3f0db607bfdfdcb9d409a2152b6d` |
| `clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)` | `8a7a2fe5a4b274ea5fbe789b02ef97946c927789bd0398863beb8f54d3947f98` |

UNCONDITIONAL neighbours (must not have moved) are unchanged from the first cut, **plus one added
by this round**: `clara.retire_prepayment_account(uuid,text,text,text)` =
`5a0fc662384760a5303c1cdffb02793967761013137d859dafe2239f118e8f63` — pinned precisely because §H
deliberately does NOT touch it.

`clara.create_accounting_plan(...)` remains pinned at `c8e99098…` (its post-0308 body), which is
also the value `plan-overlap-template-arm-retired.test.mjs` now carries.

---

## Vocabulary this round adds

Three tokens, all in an existing family, all with a cell that drives them:

| token | SQLSTATE | door |
|---|---|---|
| `wake_authority_absent` | CLR03 (the estate's wake-authority class) | `clara._prepayment_schedule_core`'s `'wake'` lane |
| `prepayment_account_enrolment_raced` | CLR13 (the estate's convergence/conflict class) | `clara.enrol_prepayment_account` |
| axis `source_reversed` on the existing `*_source_unfit` tokens | CLR10 | both create cores and the stating door |

…plus one new read field, `term_reason_withheld` (boolean), on all four schedule reads. The three
tokens `datesNotFinite` / `datesOutOfDomain` / `termTooLong` were already declared by #939's own
fixtures and are now raised rather than dead.

`CONTEXT.md`'s **Prepayment schedule** entry is corrected in the same round: the clocked lane no
longer "records its own authority honestly"; a person is not optional, and the wake refuses.

---

## Follow-ups worth filing (none filed — this lane never writes to GitHub)

1. **Blocking, owner decision:** plan authority for the clocked lane — see the boxed question above.
   #1036's AC1/AC2 hang on it.
2. **Blocking before either register is advertised, owner decision:** the correction path. A door
   that opens a replacement schedule after a term is superseded, and what it is derived from.
   L04-SPEC-04.
3. **Strike the zh half** of #940 AC5 and #941 AC6 at close and attach it to the translation ticket:
   `apps/web/messages` holds `en.json` alone and `i18n/request.ts` pins `locale = "en"`.
4. ADV-07's nested `':plan'` op-key namespace — either qualify it per lane or give
   `clara._reserve_op`'s reuse raise a `detail.reason` so a surface can classify it. Four callers
   now share it.
5. ADV-08's rig-meta cohort for 0315 — integrator's call; the fix round leaves 0315 creating no
   function at all, which weakens the case for one further.

## Anything unverified

- The lane database carries 43 `clara.accounting_plans` rows authored by `clara.agent_user_id()`,
  left by this file's FIRST cut before the fix round dropped that lane. They are inert (the lane is
  closed and they can admit nothing) and a from-scratch chain has none, which is why
  `p1036.no-agent-plan-lane` asserts a **delta** across a driven wake rather than an estate-wide
  total. Hosted never ran the first cut.
- The e2e walks were run on this host (Windows). The integrator's own Linux re-run is the check that
  matters for the runner.
- I did not re-run the runtime unit files or `check-frozen-workflows.mjs`: this round touched no
  file under `packages/runtime`.
