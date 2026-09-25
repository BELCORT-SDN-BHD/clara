# riders closing wave · lane 01 · #1147 — the firm standing instruction's three open halves

**Branch** `riders/wK-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\701`, base `ffb629d73`.
**Database** `clara_c01` on 127.0.0.1:55742. **Playwright triple** 3600 / 3601 / 3602.
**Status: DONE** for the two halves the ticket asked to be built, with the third pinned as the
ticket asked; **one acceptance criterion was ALREADY SATISFIED** on this branch and is recorded
rather than rebuilt.

**Commits** (`git log --oneline ffb629d73..HEAD`, six, all ending
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`):

| commit | what |
|---|---|
| `3210958f7` | `feat(db): #1147 the model lane gets a read of the firm's standing instruction (0362 §A)` |
| `0b5bdc736` | `test(db): #1147 the read door is no oracle, and it opened no act (0362 §A cells)` |
| `de93a7f4c` | `feat(db): #1147 withdrawing a standing instruction says how many plans keep posting (0362 §B)` |
| `5475b3a0e` | `test(db): #1147 the deferred-revenue asymmetry is held by a census, not by a comment` |
| `19c50a99e` | `feat(web): #1147 a firm is told what its withdrawal did NOT stop, and how to stop it` |
| `1f015edfd` | `docs(db): #1147 the 0362 README section, with the ruling it records and the pins it took` |

Files changed (`git diff --name-only ffb629d73..HEAD`, 12): the migration, its test file and its
pre-integration gate module, `packages/db/package.json` (`$GATES`),
`packages/db/tests/rig-meta.mjs` (one cohort),
`packages/db/tests/prepayment-close-standing-instruction.test.mjs` (one census amended),
`packages/db/README.md`, and on the web side
`apps/web/lib/firm/standing-instructions.ts` + its new test,
`apps/web/components/firm-admin/standing-instructions-card.tsx` + its test,
`apps/web/messages/en.json` (two keys) and `apps/web/test/manifest.txt` (one line).

---

## The ticket was still live on this branch — verified before building

The newest Agent Brief is the issue **body** (`gh issue view 1147 --comments` returns
`"comments": []`; no owner ruling comment exists, so the body binds).

| half | evidence it was open at `ffb629d73` |
|---|---|
| the chat read door | the first run of the new cell failed with `no migration matching /standing_instruction_agent_read$/ is applied`; `clara.wake_get_firm_standing_instruction` did not exist, and `p1050.doors.shape` asserted by name that **no** `wake_%firm_standing_instruction%` function existed anywhere in the catalog |
| the withdrawal's consequence | the slice's first red printed the live receipt: `{"active":false,"recorded_by":…,"withdrawn_by":…,"instruction_id":…,"instruction_key":"prepayment_schedule_at_close"}` — five keys, no count (`undefined !== 1`) |
| the deferred-revenue twin | held only by 0338's header comment (`:42`, `:111`) and its tail item 10; no cell read the two cores' lane sets against each other |
| **PARTLY SATISFIED** — the card's "those plans keep posting" sentence | `apps/web/messages/en.json:standingWithdrawalNote` ("A schedule already running keeps posting to the end of its term, under the member who authorised it") and the cell *"the card states the two facts a firm must know before it decides"* were shipped by #1050's fix round (commit `cf8bc6752`). **Not rebuilt.** What was missing — the count and how to stop one — is what this ticket added. |

---

## The seams I tested at (written down before the first test)

| seam | why there |
|---|---|
| `clara.wake_get_firm_standing_instruction(p_instruction_key text)`, driven through `wakeQuery(ROLES.agentRo, secret, …)` on a **real `interactive` wake credential** minted by `clara.mint_wake_credential` | the production path. A direct body call as `postgres` would prove nothing about the grant, the allowlist, the credential's floor or the firm scoping, all of which are the ticket |
| `clara.withdraw_firm_standing_instruction(text,text,text)`, through `humanQuery` as a real signed-in **admin** | the door's own admin floor and its op-receipt reservation are only real on the governed human path |
| the **live catalog** — `pg_proc.proacl`, `has_table_privilege`, `clara.wake_fn_allowlist`, and the two cores' `p_lane not in (…)` sets | three claims are about what a LATER file may not do (the relation's grants, the write doors' ACL, the deferred-revenue asymmetry). No behavioural cell written today can drive those; this repo's own documented shape for them is a catalog census (`p1137.obo.plan_step_parity`), which WORK-ORDER rule 4 names explicitly |
| `withdrawPrepaymentStandingInstruction(...)`'s returned outcome, over a mocked fetch | the module's decoder is the seam: what it does with a key the door did not answer is the behaviour, not the HTTP |
| `StandingInstructionsCard`'s **rendered text** | what a firm reads is the deliverable; the writers are stubs, as the card's own battery already does |

No cell was written at a seam the brief does not name. The real `close_prep` wake lane
(`wake12` on a real `clara_wake_interactive` credential) is used only to **create the state** the
withdraw count measures, never asserted on — that is #1050's battery's job.

---

## Acceptance criteria, with evidence

All db cells are in `packages/db/tests/standing-instruction-agent-read.test.mjs` (8 cells), run with
the **full gate chain** from `packages/db/package.json` against `clara_c01`.

| AC (issue #1147) | cell / file | evidence |
|---|---|---|
| **AC1** — a granted definer read answers the firm's live standing instruction for the agent read role, **driven on a real least-privileged connection rather than as `postgres`** | `p1147.read.live` | absent → `{instruction_key, active:false, reason:null, recorded_by:null, recorded_at:null}`; after a named member records it → `active:true`, `reason` verbatim, `recorded_by = alice`, a non-empty `recorded_at`; the row is re-read independently as root and agrees; after a withdrawal → `active:false` again. Every call is `wakeQuery(ROLES.agentRo, secret, …)` with a real `interactive` credential |
| **AC2** — a firm with no instruction and a caller asking for another firm's **answer the same way; no cell can tell the two apart** | `p1147.read.no_oracle` | with firm A's row LIVE, firm B's credential (OBO its owner) and firm S's credential answer `deepEqual` to each other and both `active:false / null / null / null`; firm A's own credential still reads `active:true` in the same cell, so the claim is not "it always says no". Structurally the door takes **no firm argument at all** |
| **AC3** — the relation's own grants are unchanged and 0338's tail assertion about them still holds, **proved by a cell that reads the catalog** | `p1147.read.acl` | `[human SELECT, agent_ro, runtime, wake_interactive, wake_proactive, public, human INSERT/UPDATE/DELETE] = [true, false×5, false×3]`. Also enforced twice more by the migration itself: §0 **refuses to apply** over a database where a machine role already holds the grant, and the tail re-reads it after applying |
| **AC4** — the withdraw door's answer carries the count of live plans authorised by the withdrawn instruction, **driven with at least one such plan present and with none** | `p1147.withdraw.counts`, `p1147.withdraw.counts_only_what_still_posts` | one real plan written by the real `clara.wake_establish_prepayment_schedule` on a real `close_prep` credential → `plans_still_posting: 1`; a firm that instructed and never acted → `0`; a plan **paused** through `clara.pause_accounting_plan` → `0`; a sibling firm's live plan never reaches this firm's count, and that sibling's own withdrawal still reads `1`. 0338's five keys are all still present |
| **AC5** — the settings card states that those plans keep posting under the member who authorised them, with its own message key, asserted by a component cell | **ALREADY SATISFIED** (`standingWithdrawalNote` + the #1050 cell, above) — and extended: `ticket 1147 — a withdrawal that leaves schedules running SAYS SO…`, `ONE is one…`, `a count the door did not answer with is NOT painted as zero`, `the card says HOW TO STOP ONE` | `3 schedules opened under it keep posting, under the member who authorised them`; `One schedule…` for 1 and `Nothing was running under it…` for 0; **silence** when the count is `null`; and the new always-visible `standingWithdrawalStopNote` naming `pause or end` and `Client → Plans` |
| **AC6** — a census cell reads both schedule cores' closed lane sets and the wake allowlist off the live catalog and fails if one side is widened alone; **vacuity control shown once and the subject restored byte for byte** | `p1147.asymmetry.census` | see **Vacuity control** below — both arms bite, both subjects restored and re-measured |
| **AC7** — the migration applies from scratch and on a populated database, **first-apply branch proved**, and the from-scratch chain is green | populated apply ✔ (three applies: FIRST, then REDO/FIRST, then REDO/REDO), first-apply branch ✔ (below) | **from-scratch chain: NOT run here** — see *Unverified* |
| **AC8** — `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0 | ✔ | measured, `exit=0` (one real lint defect of mine was found and fixed first: an unused destructured binding) |

### The first-apply branch, proved rather than assumed

The wave-3 addendum's rule: `CLARA_MIGRATION_REDO` only ever takes the "my own body is already
live" branch, so a bimodal pin can hide its sha branch. Both branches were exercised for real:

- **apply 1** (ordinary `pnpm db:migrate`): `0362 prestate OK -- read door FIRST`
- **apply 2** (redo, landing §B): `read door REDO, withdraw door FIRST` — the withdraw pin's sha
  branch taken against 0338's genuinely live body
- **apply 3** (redo): `read door REDO, withdraw door REDO`; checksum identical across the two
  consecutive redos (`eb70f01e2aec138c6ff999caa7b89310585263f174d737e96f7f7aca2746551c`)
- **and the addendum's own drill**, in ONE transaction that was rolled back: `clara.withdraw_firm
  standing_instruction` restored by re-running **0338's own `create or replace` statement, read out
  of 0338's file**, the read door dropped, then 0362's §0 block run **verbatim** →
  `0362 prestate OK -- read door FIRST, withdraw door FIRST`. After the rollback the withdraw body
  measured back at 0362's post-image and the read door was present again.

### The data-dependent branch was entered

§B's count only returns a non-zero on a database that holds such plans (the addendum's rule). The
states covered on `clara_c01`, all created through the estate's own doors: **one active** plan
written by the real wake wrapper, **none at all**, **one paused** through
`clara.pause_accounting_plan`, and **another firm's** live plan present while this firm withdrew.

### Vacuity control (AC6, and one more)

| cell | broken subject | what it printed | restored |
|---|---|---|---|
| `p1147.asymmetry.census` | a planted `clara.wake_recognise_revenue_vacuity(uuid)` naming `_revenue_recognition_core` | *"does NOT admit the 'wake' lane, yet wake_recognise_revenue_vacuity reaches it"* + *"carries NO clara.wake_fn_allowlist row"* | dropped; `0` functions matching `%vacuity%` remain |
| `p1147.asymmetry.census` | `clara._revenue_recognition_core`'s own lane set widened to `('human','obo','wake')` via `pg_get_functiondef` (sha moved to `a5c08b96…`) | *"admits (human, obo, wake), and this census was written against (human, obo)"* + *"the two schedule cores no longer differ by exactly the 'wake' lane"* | restored and re-measured at its pre-image `28de4d5958a7cbc6b9220e82962d1e08f62f5dd39c702b3fce941c8c876358fd` — **byte for byte** |
| `p1050.doors.shape` (amended, below) | a planted volatile `clara.wake_withdraw_firm_standing_instruction(text)` | *"a machine twin of the standing-instruction WRITE doors exists: [{proname: wake_withdraw_firm_standing_instruction, is_read:false, agent:true, writers:true}]"* (17/18) | dropped; battery back to 18/18 |

### The one census I amended, and why it is not an exemption

`p1050.doors.shape` refused **every** `wake_%firm_standing_instruction%` name. That was exact while
the family was write-only. It now refuses every machine-shaped name in the family that is not
**STABLE** (Postgres refuses every `INSERT`/`UPDATE`/`DELETE` inside a non-volatile function, so such
a body *cannot* write) **and** granted to `clara_agent_ro` alone. That is two catalog facts rather
than a name roster, which matters because the file is frontier-gated at **0338**, not 0362: a roster
naming `wake_get_firm_standing_instruction` would have gone red on every pre-0362 chain and would
have excused a future function that merely borrowed the name.

---

## Migration

`packages/db/migrations/0362_standing_instruction_agent_read.sql` — the number reserved for this
ticket. **No other migration file was edited.** Ledger after: **338 files, max
`0362_standing_instruction_agent_read`**.

| § | object | what it is |
|---|---|---|
| 0 | prestate | six checks (below) |
| A | `clara.wake_get_firm_standing_instruction(text)` | the model lane's read door — STABLE SECURITY DEFINER, `clara_agent_ro`, one `interactive` allowlist row, **no firm argument** |
| B | `clara.withdraw_firm_standing_instruction(text,text,text)` | 0338 §G's body **taken from the live catalog**, plus one answer key |
| D | ACL + allowlist | one `grant execute`, one `insert … on conflict do nothing` |
| TAIL | 8 assertions | all read off the live catalog |

### Prestate pins — EVERY pinned signature, with its sha

Measured on `clara_c01` **now** (337 files, max `0361_reservation_release_advice`; no ticket of this
lane landed before this one, so nothing had recut anything).

| body | pinned pre-image (`sha256(prosrc)`) | admits |
|---|---|---|
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `c63c1fd09bc92713127a038b3565f399b8ee17fcbf27097272b7a919cbb7b6e5` | that sha, **or** a body already carrying `#1147 [0362]` (so a redo is admitted and real drift refuses BY NAME) |
| `clara.wake_get_firm_standing_instruction(text)` | *(name must be free, or already carry `#1147 [0362]`)* | a body of that name that is not this file's refuses by name |

**Post-images the next lane will find** (for the integrator's re-derivation, seam rule (c)):

| body | post-image |
|---|---|
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `7068243273757c3c55e4b636ede0f6c6e84a4d060182877ff95d29d7c8a23dd7` |
| `clara.wake_get_firm_standing_instruction(text)` | `f69794dae2da194d08561526aa09c33f57536095eb91768a624e0bb607e07e46` |

**Deliberately NOT sha-pinned — read STRUCTURALLY instead**:
`clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` (live
`af096b607079e11a7888d907f8c5c9f03880ead0b9565ec26ee6feb9257dafd7`) and
`clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` (live
`28de4d5958a7cbc6b9220e82962d1e08f62f5dd39c702b3fce941c8c876358fd`). This file recuts neither and
the census reads their **closed lane sets** off the catalog, so a pin would have turned another
lane's lawful recut into an abort of the whole chain — the closing plan's own seam rule (c) and its
risk 4. **Nothing in this lane pins a body lane L2 or L3 writes.**

The remaining four prestate checks are structural: the relation's six columns; **its grants**
(the file refuses to apply over a database where any machine role already reads it directly — a
definer door on top of a machine-readable relation would be a second, weaker story about the same
wall); the `clara.wake_context()` / `clara.assert_wake_allowed(text,text)` / `wake_fn_allowlist`
plumbing by exact signature; and the `standing_instruction` authority kind plus the four
`clara.accounting_plans` columns §B's count keys on.

**Redo-safe by construction** (#957): `create or replace function` throughout, one
`insert … on conflict do nothing`, no table, no backfill, no business row written. Applied to
`clara_c01` with `CLARA_MIGRATION_REDO=0362_standing_instruction_agent_read` twice, recorded above.

**No role is minted** (closing-wave risk 1). **No dynamic SQL**: `grep -c "execute format\|execute '"`
on the file returns `0`, so no `REVIEWED_DYNAMIC_SQL_BARRIERS` entry is owed — stated with the run,
not assumed.

---

## Gates, with counts

Every db run used the full `--import ./tests/*-preintegration-gate.mjs` chain from
`packages/db/package.json` (306 gate flags after this ticket's entry), `--test-concurrency=1`,
against `clara_c01`. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| the db files I added or touched, **with the full gate chain** — `standing-instruction-agent-read.test.mjs`, `prepayment-close-standing-instruction.test.mjs`, `rig-isolation.test.mjs`, `operation-census.test.mjs` | **59 tests · 58 pass · 0 fail · 1 skip** — the skip is `T19 poison-role`, which self-skips because it is destructive and `CLARA_RIG_ALLOW_RESET` is (correctly) unset |
| `operation-census.test.mjs` alone (SQL functions added) | **10 pass / 0 fail / 0 skip** |
| `rig-isolation.test.mjs` alone | **23 tests · 22 pass · 0 fail · 1 skip** (T19, as above) |
| migration-scanning db batteries — `chain-minted-roles-drift-guard`, `collation-pin-scan`, `collation-pin-portability`, `sandbox-marker`, `migrate-runner-unit`, `hrd-a-recut-guard` | **58 tests · 56 pass · 0 fail · 2 skip** |
| **web pins corpus** (closing-wave rule (d) — a migration file changed): `apps/web` `tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail / 0 skip** — no barrier entry owed (no dynamic SQL) |
| `apps/web/lib/firm/standing-instructions.test.ts` (new) | **6 pass / 0 fail** |
| `apps/web/components/firm-admin/standing-instructions-card.test.tsx` | **11 pass / 0 fail** |
| the card's neighbours — `firm-settings-panel`, `firm-settings-a11y`, `firm-admin-a11y`, `firm-admin-pages-a11y`, `firm-admin-keyboard` | **26 pass / 0 fail / 0 skip** |
| **the WHOLE web unit suite** (`node scripts/run-tests.mjs` from `apps/web`) | **5259 tests · 5257 pass · 0 fail · 2 skip**, exit 0 |
| **browser walk** — `firm-commercial-walk` (the walk that renders `/settings/firm`, where my card lives), on **my triple** 3600/3601/3602 | **10 passed (28.2s)** |
| `pnpm typecheck` (worktree root) | **exit 0** — `apps/web` and `packages/runtime` both `Done` |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 347 frozen file(s) verified against `frozen-workflows.json` (append-only vs origin/main); 60 "use workflow" module(s) all frozen+registered; 3 retired entries** |
| `pnpm --filter @clara/db migrate` (no redo, final) | 338 total, max `0362_standing_instruction_agent_read` |

**The frozen law (rule (a)), proved:** `git diff --stat ffb629d73..HEAD -- packages/runtime` is
**empty**; no `frozen-workflows.json`, `registry.ts`, `startWorld.ts` or `packages/runtime/workflows`
file appears in the 12-file diff; `check-frozen-workflows.mjs` is clean. `check-parts-parity.mjs`
was **not** run and is not owed — it is required only when `packages/runtime` is touched.

**Known Windows-only reds:** none were met. Every skip was identified rather than left as a
number: the 2 in the whole web suite are the two live-provider auth cells
(`# SKIP CLARA_LIVE_SUPABASE_AUTH_URL/CLARA_LIVE_SUPABASE_AUTH_ANON_KEY not configured`, mocked
coverage elsewhere); the 2 in the migration-scanning batteries are `hrd-a HIGH-1` and its mutant
(`# SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB`); and the
1 in `rig-isolation` is `T19 poison-role`, same reason. All three reasons are environment
self-skips this lane must not fix, and none touches anything this ticket changed.

---

## Docs

- **`packages/db/README.md`** — a new `## 0362` section in the same commits as the code: what 0338
  left, why §A takes no firm argument and mints no core and adds no floor of its own, what §B's one
  key means and why the count is taken after the stamp and compared as text, the **two rulings this
  ticket records rather than takes** (should withdrawal pause the plans it authorised; should one
  instruction stand the deferred-revenue side too) with the four moving parts the second would cost,
  the prestate pins and what is deliberately unpinned, the redo evidence, and the 8 tail assertions.
  No applied migration's section was touched.
- **Every new object carries a `comment on`**, and 0338 §G's comment was rewritten in place to say
  what the recut door now answers and what it still does not do.
- **`CONTEXT.md` was NOT touched.** #1147 mints no new domain vocabulary: "firm standing
  instruction" is #1050's term. `grep -i "standing instruction" CONTEXT.md` returns **nothing** —
  the term was never added. That gap is real but it is #1050's, and adding it here would widen a
  shared file this lane's ticket does not own. Filed as follow-up 1.

---

## Successor contract — the chat tool that calls §A's read door

**Not built here.** #1144's roster is closed to additions (closing plan, rule (a)), so this is for a
cut **after** this wave's. Nothing in `packages/runtime` was edited.

**Name:** `read_firm_standing_instruction`

**Zod input** (the key is a literal on both sides — the door refuses any other by name, and there is
exactly one member of the closed set today):

```ts
export const readFirmStandingInstructionInput = z.object({
  instruction_key: z.literal("prepayment_schedule_at_close").default("prepayment_schedule_at_close"),
});
```

**Door call**, on the chat lane's `readScoped` pool (`clara_agent_ro`, read-only transaction, an
`interactive` credential minted on behalf of the initiating human):

```sql
select clara.wake_get_firm_standing_instruction($1::text) as result
--   argument order: p_instruction_key
```

**Answer** (always an object; absence is a state, not an error):

```jsonc
{ "instruction_key": "prepayment_schedule_at_close",
  "active": true,                       // false when the firm has none LIVE
  "reason": "…the firm's own sentence…", // null when active is false
  "recorded_by": "<user uuid>",          // null when active is false
  "recorded_at": "<timestamptz>" }       // null when active is false
```

The row's **id is deliberately not projected**: a model has no act to spend it on.

**Refusal mapping** (`code` / `detail.reason` → what the tool does):

| code | reason / axis | what it means | what the tool says |
|---|---|---|---|
| `CLR03` | *(no detail)* | no valid wake credential | infrastructure; the turn cannot read it — do not guess an answer |
| `CLR03` | *(allowlist)* `wake kind X may not call …` | the credential's kind is not `interactive` | infrastructure; never surfaced as a firm-facing sentence |
| `CLR03` | `wake_authority_absent` (`class: on_behalf_of`) | the credential names no person | infrastructure |
| `CLR10` | `firm_standing_instruction_invalid` / `instruction_key_unknown` | the key is outside 0338's closed set | a tool bug — the key is a literal |

There is **no `CLR04`** and **no "not found"**: a firm with no instruction, and a caller whose
sibling firm has one, both answer `active: false` with the four nulls.

**Part kind:** **none.** This is a read; a chat turn produces no new write part for it, and no
`parts-parity` entry is owed (measured, not assumed — `packages/runtime` is untouched).

**Prompt stanza** (replaces the read-only stanza `waveS-lane02-ticket1050.md` wrote, which said the
model had no door):

> A firm can give Clara a standing instruction to establish prepayment schedules at close.
> `read_firm_standing_instruction` tells you whether this firm has one in force, the one-line reason
> the member gave it under, who recorded it and when. **You never record or withdraw one** — it is a
> firm-level governance act that must name the member who made it, and only an admin or owner of the
> firm can do it, in the firm's settings. If someone asks Clara to start doing this by itself, say
> where it is recorded and that it names them. If someone asks you to **stop** it, say that an admin
> or owner withdraws it in the firm's settings, and that **withdrawing it does not stop a schedule
> that is already running** — those keep posting under the member who authorised them, and each one
> is paused or ended on that client's own Plans page.

The two WRITE doors' web contract (`recordFirmStandingInstructionInput` /
`withdrawFirmStandingInstructionInput`) is unchanged from `waveS-lane02-ticket1050.md` except that
the withdraw receipt now also carries `plans_still_posting` (integer, `>= 0`).

---

## Follow-ups worth filing

1. **`CONTEXT.md` has no entry for the firm standing instruction.** The term is now shared by the
   firm (the settings card), the database (two doors, a relation, an authority kind) and — after
   this ticket — the chat model. `grep -i "standing instruction" CONTEXT.md` returns nothing. A
   `term / _Avoid_` entry is owed; it is #1050's vocabulary, not #1147's, which is why this lane did
   not widen the shared file to add it.
2. **OWNER RULING OWED: should withdrawing a standing instruction PAUSE the plans it authorised?**
   Today it does not (this ticket did not change that, and the migration's tail asserts the door
   names no plan-state verb). The case for pausing: a firm that says *"stop letting Clara do this"*
   plausibly means the schedules too. The case against: each plan is a separate, already-authorised
   commitment whose occurrences a person can pause or end one at a time (Client → Plans), and #940
   ruled exactly that way for a retired roster enrolment. The firm now at least **sees the count**.
3. **OWNER RULING OWED: may one instruction stand the deferred-revenue side too?** Closing the
   asymmetry costs four moving parts (a wake wrapper over `clara._revenue_recognition_core`, the
   lane set widened, a `clara.wake_fn_allowlist` row, and a SECOND instruction key in 0338 §A's
   closed set and both write doors). The census now keeps it a decision rather than a drift.
4. **The chat tool itself** — the successor contract above, for the cut after #1144's.
5. **`close_prep` is still `enabled = false` estate-wide** (#1050's own follow-up 5, unchanged). The
   read door answers *"what has this firm instructed"*, not *"will it actually run"*, so a model that
   reads `active: true` will say Clara may do this at close while nothing yet does. **The settings
   card has exactly the same property today** (`standingInForce`), so this is not a new divergence
   between the two surfaces — but whether either should also project the estate-wide switch is a
   product question nobody has been given.

---

## Unverified

- **The from-scratch chain (AC7's second half).** Not run here, by the work order: this cluster
  already ran a chain and migration `0154` pins the cluster-wide role count, so a second
  from-scratch chain needs the #867 recipe, and the closing plan gives the from-scratch proof to the
  integrator on a disposable cluster. What **is** proven: the populated apply three times, both
  prestate branches of both pins taken for real, and the FIRST branch re-proved inside a rolled-back
  transaction against 0338's own restored statement.
- **Nothing in production exercises the new read.** No chat tool calls it yet (that is the successor
  contract), and `close_prep` is disabled estate-wide, so the read door is proven at the door — on a
  real credential, a real role and a real refusal ladder — and nowhere above it.
- **Hosted rows.** The count in §B was driven on a seeded rig against plans written by the real wake
  wrapper. Hosted may hold plans this rig does not; the reference is compared as **text** rather than
  cast to `uuid` precisely so that an `authority_ref` whose `id` is not uuid-shaped cannot turn a
  count into a `22P02` at the moment a firm is trying to withdraw — but no such row was found to
  test against, because none exists on this rig.
- **The e2e walk does not drive the standing-instruction card's writers.** `firm-commercial-walk`
  renders `/settings/firm` (and runs axe there) with the card present, which is what makes it my
  walk; no browser cell presses "Take this back". The card's behaviour is proved by its component
  battery, and the door's by its db battery.
