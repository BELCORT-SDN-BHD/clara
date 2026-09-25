# riders sweep wave · lane 02 · #1050 — the clocked prepayment lane gets a directing human

**Worktree** `C:\Users\zhant\Desktop\clara-wt\655` · **branch** `riders/wS-lane02` · **base**
`7bc5a710f` · **database** `127.0.0.1:55745/clara_l05` (313 files after this ticket) ·
**migration** `0338_prepayment_close_standing_instruction.sql` (1607 lines, ledger checksum
`0ebcab8519dcdb73777f896093dbb2f3dad4e8f473990202b11494280348970d`).

**Status: built, green, committed.** Six commits, `3ced792d2` through `873488f4e`. Nothing pushed,
no PR, no GitHub write, no other worktree touched.

## Resume: what the killed implementer left, and what I did with it

An earlier implementer of this ticket was killed mid-work by a usage limit. It had **committed
nothing**. The worktree held one uncommitted slice and the database already carried `0338` applied
(313 in `clara.schema_migrations`, so nothing of a later ticket was built on top of it).

| left behind | judgement | what happened |
|---|---|---|
| `migrations/0338_…sql` §0 + §A + §B (332 lines): the relation and the recording door | sound — the shape is 0306's, the reasoning holds, the prestate and tail are the house idiom | kept, committed as slice 1, then extended by §C–§G |
| `tests/prepayment-close-standing-instruction.test.mjs` (121 lines, ONE cell) | sound and green | kept, extended to 12 cells |
| `tests/prepayment-close-standing-instruction-preintegration-gate.mjs` | sound (stable stem, loud on a focused run) | kept unchanged |
| `package.json` gate-chain entry, in migration order | correct | kept |
| `rig-meta.mjs` cohort `FIRM_STANDING_INSTRUCTION_0338_*` | correct, but its prose said **"the TWO human doors"** while the array held one | that prose was right about the intent and wrong about the file: I built the second door (§G) and restored the prose |
| `README.md` 0338 section | covered §A/§B only | rewritten for §A–§G |

Nothing was redone. Every later apply used the supported redo mode
(`CLARA_MIGRATION_REDO=0338_prepayment_close_standing_instruction`, #957) with
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; 0338 was the highest applied version throughout. Five
redos in total.

## The contract, and why the ticket as filed could not be built

The ticket says "the member who enabled `close_prep` for the firm is the plan's directing human".
**There is no such person**, and this was measured rather than assumed:

- `clara.wake_engine_sources` holds **one global row per `source_key`**
  (`packages/db/migrations/0133_g1_wake_engine.sql`:204-239) — the rig confirms two rows total,
  `bank_agent=false, close_prep=false`.
- `clara.set_wake_source_enabled` is operator-only, and its own comment calls the flip an
  estate-wide act.
- the broadcast audit row sent to every *other* firm deliberately carries `actor = NULL`.

Taking it literally would have found nobody, or pointed `authorised_by` at a BELCORT operator —
making one operator the named directing human for automated postings in every firm's books.

**The ruling of 2026-09-25 on #1050** (read from `gh issue view 1050 --comments`, still live on this
branch) re-briefs it and is what was built: a NAMED MEMBER of the firm records a firm-level standing
instruction, that member is the wake plan's directing human, admission runs under that member's own
authority and membership, and `authority_kind` gains ONE value.

## What 0338 builds

| § | object | what it is |
|---|---|---|
| A | `clara.firm_standing_instructions` | new append-only relation; one live instruction per (firm, key); forced RLS; SELECT for `clara_authenticated` only; **no grant of any kind to any machine role** |
| B | `clara.record_firm_standing_instruction(text,text,text)` | the recording door — admin floor, `clara_authenticated` only, version-forward |
| G | `clara.withdraw_firm_standing_instruction(text,text,text)` | the door that takes it back — same floor, same lane |
| C | `clara.accounting_plans.authority_kind` | 0193's one-member CHECK gains `standing_instruction`, and nothing else (`authority_rule` still absent) |
| D | `clara._authority_ref_refusal` | a fourth reference kind, `firm_standing_instruction`, resolved at FIRM scope and only while LIVE |
| E | `clara._obo_plan_core` | the two authority kinds admitted ONLY in their own strict pairing |
| F | `clara._prepayment_schedule_core` | the `wake` arm stops refusing for want of a person and starts finding one |

### The three judgements worth reading

**Why §G exists at all (it is not in the ticket).** §A carries a withdrawal interval and the ruling
says "until somebody withdraws it", but §B's version-forward fold always leaves a live row standing.
Without a withdraw door a firm's **first** recording would have been permanent — a standing
instruction that cannot be taken back is a switch, not an instruction, and it would have shipped
dark in exactly the sense the standing owner ruling of 2026-09-20 forbids. Built, and its three
refusals and its floor are driven.

**Why the human plan door is NOT widened.** `clara.create_accounting_plan` still admits one
authority kind. Only a lane with nobody at the keyboard needs the second one. That choice is also
what keeps §E's explicit-instruction branch **byte-for-byte** the wall that was there — which
`p915.obo.refusals_match` and `p941.obo.authority` measure by comparing the two entrances' whole
refusal payloads. The door is pinned in §0 so the asymmetry is a decision, not a drift, and
`p1050.authority.paired` drives both entrances on seven inputs and requires identical message, code
and payload.

**Why the pairing.** `standing_instruction` is admitted only with a `firm_standing_instruction`
reference and that kind only with `standing_instruction`. Without it the widening would be a
loosening: a `standing_instruction` citing a chat turn would be a label pasted on a person's typed
decision, and an `explicit_instruction` citing a standing-instruction row would be a person claiming
their firm's blanket delegation as something they themselves decided.

### What the wake lane does now

1. Resolve the firm's LIVE `prepayment_schedule_at_close` instruction. None → `CLR03
   wake_authority_absent` — **#1036's refusal unchanged**: same token, same `lane`, same quoted
   `wake_kind` and `task_id`, same `remedy` (`clara.create_prepayment_schedule`) — plus
   `standing_remedy` and `instruction_key`, so the refusal also names the door that gives the
   instruction.
2. The recording member must still be an ACTIVE member of the firm. Not → `CLR03
   wake_authority_lapsed`, refused at **configuration** time. #1036's own lesson: configuring
   something that can never run is worse than refusing.
3. Otherwise the plan is written through the OBO plan step with that member as `authorised_by`,
   `authority_kind = 'standing_instruction'`, and an `authority_ref` carrying **both** the
   instruction row **and** the clocked task — so one row links instruction, wake and plan. The
   schedule row still names `clara.agent_user_id()` as the run that wrote it, and its audit row
   carries `via_wake_kind = 'close_prep'`.

**The idempotency payload does not move.** The reservation still hashes the caller's own
`p_authority_ref` (the honest `agent_wake` descriptor the wrapper builds), never the citation §F
derives — this body's own stated law is that the key identifies the decision a caller made.

**No third plan-writing body.** The wake arm joins the OBO arm; `clara._prepayment_plan_core_wake`
stays absent, which `p1036.no-agent-plan-lane` asserts by name and 0338's tail asserts over the
whole schema (no body carries both `insert into clara.accounting_plans` and `agent_user_id`).

## The seams I tested at

| seam | why there |
|---|---|
| `clara.record_firm_standing_instruction` / `withdraw_…`, through `humanQuery` as a **real signed-in member** | the doors' own floor, the version-forward fold and the replay are only real on the governed human path |
| `clara._authority_ref_refusal(...)`, driven directly as root | it is #977's ONE definition and it is ungranted; the fourth arm's firm scope, liveness and cross-firm refusal are its own behaviour, not a caller's |
| `clara._obo_plan_core(...)` vs `clara.create_accounting_plan(...)`, same state, same inputs | #915's parity is a claim about **two bodies**; only driving both measures it |
| `clara.wake_establish_prepayment_schedule` on a **real `clara_wake_interactive` session** minted by `clara.mint_wake_credential_for_task` (`wake12`) | the production path. A direct core call would prove nothing about the wrapper's delegation, its ACL or the derived op key |
| `clara._plan_admit_occurrence(...)` on the wake-written plan, then `clara.accounting_work.initiator` | the whole reason the lane refused was that such a plan could never post; the only proof is admitting one |
| `clara.audit_log` + `clara.agent_tasks` + the plan row | AC4's chain, read off rows rather than off the door's answer |
| `pg_constraint` / `pg_proc.proacl` / `pg_class.relforcerowsecurity` | the CHECK, the ACLs and the RLS posture are claims about the catalog |

## Acceptance criteria, with evidence

All cells are in `packages/db/tests/prepayment-close-standing-instruction.test.mjs` (780 lines, 12
cells), run with the **full gate chain** from `packages/db/package.json`.

| AC (as re-briefed) | cell | evidence |
|---|---|---|
| **AC1** — #1036's AC1/AC2 cells now pass: a wake with the instruction creates one schedule with occurrences; twice yields one | `p1050.wake.configures` | one `schedule_id`, one `plan_id`, `configuration_only:true`, `next_occurrences.length > 0`; the same task driving the derived key twice returns the same `schedule_id`, and the client holds exactly 1 schedule and 1 plan |
| **AC2** — a plan so created admits an occurrence under the member's authority, and refuses when that membership is suspended or removed | `p1050.admit.under_member` | first occurrence `admitted:true` with a `work_id`; `clara.accounting_work.initiator = alice` (and `!== agent`). Membership set to `removed` (committed, second owner promoted first past `_tf_guard_last_owner`, restored in a `finally`) → the next occurrence is `admitted:false` with a **named** reason, no `work_id`, and the refusal is kept on `clara.accounting_plan_occurrences.outcome`. Restored → the same occurrence admits, with no re-recording |
| **AC3** — the agent alone (no instruction) is refused `wake_authority_absent` | `p1050.wake.absent`, plus `p1036.refused` unchanged | CLR03, `reason=wake_authority_absent`, `lane=wake`, `wake_kind=close_prep`, `remedy=clara.create_prepayment_schedule`, and the durable footprint (schedules, plans, templates, `op_receipts`) is byte-identical before and after. `p1050.withdraw.closes` drives the same refusal **after** a withdrawal |
| **AC4** — the audit read shows the instruction, the wake and the plan linked | `p1050.trail` | `clara.audit_log`: `record_firm_standing_instruction` (actor = the member, `args.instruction_id`), `create_accounting_plan` (actor = **the member**, `args.authority.id` = the instruction, `args.authority.task_id` = the clocked task, `args.via = create_prepayment_schedule_for`), `create_prepayment_schedule` (actor = **the agent**, `via_wake_kind = close_prep`). The cited task resolves to a real `clara.agent_tasks` row of kind `close_prep` in this firm and client. The plan row alone carries the whole chain |
| **AC5** — migration applies from scratch and on a populated database; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0 | see **Gates** | populated apply proven five times; from-scratch **partly** proven (see **Unverified**); lint green except pre-existing base drift |
| *ruling* — `authority_kind` gains ONE value, the wall is not loosened | `p1050.authority.kind` | the CHECK's own literals are exactly `{explicit_instruction, standing_instruction}` |
| *ruling* — nothing is admitted on the agent's own authority | `p1050.wake.configures` + 0338 tail §9 | zero plans for the client with `authorised_by = clara.agent_user_id()`; zero clara bodies carrying both `insert into clara.accounting_plans` and `agent_user_id` |

The other five cells: `p1050.instruction.recorded` (the row names the member; replay is one row),
`p1050.authority.resolve` (firm scope, sibling client, unknown id, **withdrawn** row, another firm's
row, the three old kinds unmoved, `not_a_kind` still raises), `p1050.authority.paired` (the pairing
both ways + seven-input byte parity + the human door NOT widened), `p1050.wake.lapsed`,
`p1050.withdraw.closes`, `p1050.withdraw.refusals` (nothing-to-withdraw `CLR11
firm_standing_instruction_absent`, blank sentence, unknown key, and the **admin floor at both
doors** driven as a real bookkeeper → CLR04 at each), `p1050.doors.shape` (ACL, owner, definer, no
OBO twin, no wake wrapper, relation posture).

## Migration and its prestate pins

`packages/db/migrations/0338_prepayment_close_standing_instruction.sql` — the number reserved for
this ticket. No other migration was edited.

**Recut, pinned by `sha256(prosrc)` measured on this rig** (each admits its pin **or** a body
already carrying this file's `0338` attribution, so a redo is admitted and real drift refuses by
name):

| body | pinned pre-image |
|---|---|
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208` |
| `clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |

**Depended on and must not move** (`v_keep`, refuse-by-name on drift):

| body | pin |
|---|---|
| `clara.create_accounting_plan(…)` | `a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c` |
| `clara._prepayment_plan_core(…)` | `266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e` |
| `clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `84348ed4365bdbc07ad0020eca307e6f12fa5fc3141903092a0764fae462693e` |
| `clara._revenue_recognition_core(…)` | `28de4d5958a7cbc6b9220e82962d1e08f62f5dd39c702b3fce941c8c876358fd` |

Plus a structural prestate check that `accounting_plans_authority_kind_check` still exists as a
named CHECK (§C widens it by name).

**Both prestate branches were exercised on this rig** as the file grew, not merely written:
`2 FIRST, 0 REDO` when §D/§E first applied, `1 FIRST, 2 REDO` when §F joined, `0 FIRST, 3 REDO` on
the final redo of the finished file. The ledger checksum is identical across two consecutive redos.

**Redo-safe by construction**: `create table if not exists`, `create unique index if not exists`,
`create or replace function`, `drop trigger if exists` before each `create trigger`, `drop policy if
exists` before each policy, `drop constraint if exists` before §C's re-add. The file writes no row
and backfills nothing.

**Tail (10 assertions, all read off the live catalog):** forced RLS; the human lane's SELECT and its
absence of INSERT/UPDATE/DELETE; no machine-role grant on the relation; the one-live-per-(firm,key)
index; both doors granted to `clara_authenticated` and to no machine lane; the authority-kind CHECK
is `{explicit, standing}` and carries no `authority_rule`; the fourth arm **driven** (not read);
`create_accounting_plan` **not** widened; #977's closed world of exactly three readers of
`_authority_ref_refusal`; no body writes a plan under the agent identity; no wake wrapper reaches
the deferred-revenue core.

## Gates, with counts

Every db run used the full `--import ./tests/*-preintegration-gate.mjs` chain from
`packages/db/package.json`, `--test-concurrency=1`, against `clara_l05`. No reset flags were ever
set (`CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP` unset throughout).

| gate | result |
|---|---|
| the file I added — `prepayment-close-standing-instruction.test.mjs` | **12 pass / 0 fail / 0 skip** (final run after the last commit) |
| **operation-census** + **rig-isolation** (SQL functions added) | **33 tests, 32 pass, 0 fail, 1 skip** — the skip is `T19 poison-role`, which self-skips because it is destructive and `CLARA_RIG_ALLOW_RESET` is (correctly) unset |
| authority / plan batteries: `authority-ref-human-instruction`, `accounting-plans`, `accounting-plan-occurrences`, `revenue-recognition`, `deferred-revenue-correction`, `tenancy-rent-plan` | **112 pass / 0 fail / 0 skip** |
| prepayment batteries: `prepayment-close-standing-instruction`, `prepayment-wake-reroute`, `prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-account-reservation`, `prepayment-occurrences`, `f-a4-pr2a-census` | **69 pass / 0 fail / 0 skip** |
| earlier sweep incl. `audit-actor-role` (the `via_wake_kind` change) | **41 pass / 0 fail / 0 skip** |
| **web pins corpus** (sweep rule d — a migration file changed): `apps/web` `tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail** — no `REVIEWED_DYNAMIC_SQL_BARRIERS` entry is needed: 0338 contains no dynamic SQL |
| `pnpm typecheck` (worktree root) | **pass** — `apps/web` and `packages/runtime` both `Done` |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **green except the first step**, which is pre-existing base drift (below) |
| `pnpm --filter @clara/db migrate` (no redo) | `0 new migration(s) applied · 313 total` — no drift between the file and the ledger |

**apps/web was not touched**, so the whole unit suite and the browser walks were not required: the
only web-side rule that applies is (d), and `firm-scope-db-pins` is green. Confirmed by search that
nothing in `apps/web` or `packages/runtime` references `wake_authority_absent`, `standing_instruction`
or `firm_standing_instruction`, so no surface keys on anything this ticket moved; `authority_kind` is
read as an opaque `string` everywhere it is rendered (`apps/web/lib/plans/api.ts:68,111,260`,
`apps/web/components/plans/plan-detail.tsx:248`).

### The one red, and why it is not mine

`node scripts/check-frozen-workflows.mjs` (the first step of `pnpm lint`) reports **38 append-only
violations** — `REMOVED-VS-BASE` for `chatTurn.v22.*`, `claraWork.v6.*`, `statementFacts.v4.*`,
`UNLOCKED-VS-BASE` for `payrollFacts.v1.*`, and three `REGISTRY-DOWNGRADE` lines. This is **pure
base drift**: the check compares against `origin/main`, which is now **62 commits ahead** of this
lane's base `7bc5a710f`. `git log 7bc5a710f..HEAD -- packages/runtime` returns **0 commits** for the
whole lane, and the lane's entire diff (26 files) is `packages/db` only. The sibling lanes recorded
the same red at 28 violations when they ran (`waveS-lane01-ticket1073.md`:339,
`waveS-lane02-ticket1078.md`:310, `waveS-lane03-fix.md`:274); the count grew with origin/main. Every
**other** step of the chain was run explicitly and is green: `check-frozen-evaluators` (+selftest),
`check-leaks`, `check-dead-citations` (+selftest), `check-document-region-field-paths` (+selftest),
`check-wiki-dynamic-sql` (+selftest), `eslint-config.selftest`, `eslint scripts eslint.config.mjs`,
`pnpm -r --if-present lint` (every package), `packages/reporting-render` lint.

## Docs

`packages/db/README.md` — the `## 0338` section rewritten in the same commits as the code: the
false premise and the evidence for it, the seven sections, why the relation is append-only, why the
admin floor, why the pairing and why the human door is not widened, what the wake lane does now, the
idempotency payload that does not move, what withdrawal does not do, the measured redo branches and
checksum, and the L1 integration seam. The migration's own header carries the section map and a
"what this file deliberately does not do" list. Every new object carries a `comment on`.

## Successor contract

The two doors are **`clara_authenticated`-only and admit no machine lane at all** — `clara_runtime`,
`clara_agent_ro`, both wake roles and PUBLIC hold zero EXECUTE, and 0338's tail refuses to apply
otherwise. That is the ticket's whole point (*an instruction a machine recorded would name nobody*),
so **this is not a chat/Work tool contract**. It is a web contract on the signed-in member's own
session, plus a read-only stanza for the chat model.

### Web (apps/web — the member's own session pool, the path `clara.enrol_prepayment_account` takes)

```ts
export const recordFirmStandingInstructionInput = z.object({
  instruction_key: z.literal("prepayment_schedule_at_close"),
  reason: z.string().trim().min(1),   // the firm's own sentence; the door refuses a blank one
  op_key: z.string().trim().min(1),
});
// select clara.record_firm_standing_instruction($1::text, $2::text, $3::text) as r
//   argument order: p_instruction_key, p_reason, p_op_key
//   -> { instruction_id, instruction_key, reason, recorded_by, active: true }

export const withdrawFirmStandingInstructionInput = z.object({
  instruction_key: z.literal("prepayment_schedule_at_close"),
  reason: z.string().trim().min(1),   // a withdrawal owes its own sentence
  op_key: z.string().trim().min(1),
});
// select clara.withdraw_firm_standing_instruction($1::text, $2::text, $3::text) as r
//   argument order: p_instruction_key, p_reason, p_op_key
//   -> { instruction_id, instruction_key, recorded_by, withdrawn_by, active: false }
```

**The read needs no door** (law 31): `select id, instruction_key, reason, recorded_by, recorded_at
from clara.firm_standing_instructions where instruction_key = $1 and withdrawn_at is null` — RLS
scopes it to the member's own firm and `clara_authenticated` holds SELECT. The full history,
withdrawn rows included, is the same read without the predicate.

**Refusal mapping** (`code` / `detail.reason` / `detail.axis` → what the surface says):

| code | reason | axis | surface |
|---|---|---|---|
| `CLR04` | *(any)* | — | "Only an admin or owner of this firm can give Clara a standing instruction." |
| `CLR10` | `invalid_op_key` | — | a surface bug; retry with a key |
| `CLR10` | `firm_standing_instruction_invalid` | `reason_missing` | "Say why the firm is giving this instruction." |
| `CLR10` | `firm_standing_instruction_invalid` | `withdraw_reason_missing` | "Say why the firm is taking it back." |
| `CLR10` | `firm_standing_instruction_invalid` | `instruction_key_unknown` | a surface bug (the key is a literal) |
| `CLR11` | `firm_standing_instruction_absent` | — | "There is nothing to take back — this firm has not instructed Clara to do this." |
| `CLR13` | `operation_in_flight` | — | "Someone is recording this right now. Look again in a moment." |

**Needs you / the wake refusal** already renders the payload; the two tokens it must key on are
unchanged-or-new, never moved:

| code | reason | payload keys the surface should use |
|---|---|---|
| `CLR03` | `wake_authority_absent` | `remedy` (`clara.create_prepayment_schedule` — configure this one schedule by hand), `standing_remedy` (`clara.record_firm_standing_instruction` — let Clara do it from now on), `instruction_key`, `wake_kind`, `task_id`, `source_entry` |
| `CLR03` | `wake_authority_lapsed` | `instruction_id` (whose author left), `remedy` = `standing_remedy` = `clara.record_firm_standing_instruction`, `wake_kind`, `task_id` |

**Part kind:** none is added. A chat turn produces no new write part for this.

**Prompt stanza** (read-only, for a chat model that is asked about it):

> A firm can give Clara a standing instruction to establish prepayment schedules at close. You never
> record or withdraw one. It is a firm-level governance act and it must name the member who made it,
> which you cannot do. If someone asks Clara to start doing this by itself, tell them an admin or
> owner of the firm records it in the firm's settings, that it names them, and that it can be
> withdrawn there at any time.

A chat tool that could even **read** the instruction would need a new definer read door in a later
migration: the relation grants nothing to `clara_agent_ro` or `clara_runtime`, and 0338's tail
asserts that.

## Follow-ups (filed here, not swept)

1. **No web surface for either door.** The database is complete and a firm cannot reach it from the
   product. Under the standing "nothing dark" ruling this is the one thing that keeps the feature
   from being usable in beta. The successor contract above is the whole of what it needs.
2. **Withdrawal does not pause the plans it produced.** They keep posting under the member who
   authorised them — #940's own ruling for a retired roster enrolment, stated in §G's comment and
   the README. Whether withdrawal should also pause them is a decision #1050 was not given.
3. **No chat read of the standing instruction** (needs a definer read door; see above).
4. **The deferred-revenue twin has no wake lane at all.** `clara._revenue_recognition_core`'s lane
   set is `('human','obo')` and no wake wrapper for it exists; the contract-liability side cannot be
   stood in the same way without one. Pinned in §0 so the asymmetry stays visible.
5. **`close_prep` is still `enabled = false` estate-wide**, so nothing runs in production until an
   operator flips it. The lane is now *capable*, not *live* — this ticket changed no
   `clara.wake_engine_sources` row and no `clara.wake_fn_allowlist` row.

## Integration seam — read this before merging

**`clara._obo_plan_core` is written by this file (§E) and by lane L1 (#1051).** The sweep plan's own
hard seam ("L2 must not pin `clara._obo_plan_core`…") was written while #1050 was HELD and out of
L2; the ruling of 2026-09-25 put it back, and the ruling's `authority_kind` widening cannot be built
anywhere else — the human door must stay at one kind, and #977's closed world of three readers
forbids the schedule core asking `_authority_ref_refusal` itself.

The plan says **L1 merges before L2**, so under sweep rule (c) §E recuts from #1051's post-image at
integration. The edit is deliberately small and self-describing, so this is a mechanical carry, not
a re-decision:

- one more admitted **authority kind** (`standing_instruction`), in the `is distinct from` guard;
- one more admitted **reference kind** (`firm_standing_instruction`), in a branch that only fires
  for the new authority kind;
- the strict pairing that binds the two;
- **the explicit-instruction branch is unchanged**, so folding it into #1051's extracted predicate
  is a copy.

`clara._authority_ref_refusal` (§D) and `clara._prepayment_schedule_core` (§F) are not on L1's list;
§F's body is this lane's own, recut by #1114/#1077 before this ticket and pinned at its live value.
After the carry, re-run `p1050.authority.paired`, `p915.obo.refusals_match` and `p941.obo.authority`
— the three cells that would catch a bad fold.

## Unverified

- **From-scratch apply (AC5's first half).** Not run: the rig's cluster already ran one chain and
  migration 0154 pins the cluster-wide role count, so a second from-scratch chain here needs the
  #867 recipe and the work order gives that proof to the integrator on a disposable cluster. What
  *is* proven is that the prestate's FIRST branch works for all three recut bodies on this rig (the
  `2 FIRST, 0 REDO` / `1 FIRST, 2 REDO` runs above), and that the pinned pre-images are exactly the
  bodies a from-scratch chain installs — nothing between 0300/0308/0317 and 0338 recuts them, which
  §0 would refuse by name if it were false.
- **Nothing in production exercises the re-opened lane.** `close_prep` is disabled estate-wide, so
  the end-to-end path (runtime wake engine → claim → wrapper) is proven only at the wrapper, on a
  real `clara_wake_interactive` credential. The runtime's claim step was not driven.
- **The `wake_authority_lapsed` sentence has no surface.** No `apps/web` or `packages/runtime` code
  references any of these tokens today, so the refusal is correct and currently unread by any
  product surface.
- **The status-report message rule (f) did not arise:** no mid-task message was received.
