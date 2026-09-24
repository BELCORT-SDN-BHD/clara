# wave 4 · lane 04 · #915 — #653's chat entrance stops at a grant wall: `create_prepayment_schedule` has no `clara_runtime` twin

**Branch** `riders/w4-lane04` · **base** `cd2925391` · **status** DONE (the database half; the
frozen-tool half is a successor contract by the ticket's own division of labour).

**Commits** (`git log --oneline cd2925391..HEAD`, this ticket's five, oldest first):

| commit | subject |
|---|---|
| `162e4c2c4` | `feat(db): #915 the prepayment-schedule OBO twin, on the human door's own body` |
| `a67b7fb9f` | `test(db): #915 live authority, and one op-key namespace for both entrances` |
| `fdaeb33c1` | `test(db): #915 sixteen shared rules answer identically, and the twin asks #940's roster first` |
| `c2cec021a` | `fix(db): #915 the machine-lane read answers the recorded term on BOTH carriers` |
| `32c4ca933` | `docs: #915 the OBO door in packages/db/README and CONTEXT` |

**The ticket was verified live on this branch before any code was written.**
`gh api repos/BELCORT-SDN-BHD/clara/issues/915` returns `state: open`, labels `enhancement` +
`ready-for-agent`, `comments: 3`, `updated_at 2026-09-19T16:21:46Z`, no milestone. The three comments
are 2026-09-17 (the triage measurement that names `clara.create_accrual_adjustment_for` as the
precedent and settles the read posture as the narrow one), 2026-09-18 (the owner cross-reference:
#940's roster check, and the parked work question on its refusal) and **2026-09-19, the newest**,
which supersedes the brief's "Key interfaces" line: the v21/v5 cut has already shipped WITHOUT this
ticket, the next shared cut is `chatTurn_v22` / `claraWork_v6`, and three acceptance rows are changed
or added. There is no 2026-09-20 owner ruling comment on this issue. The newest Agent Brief plus those
three rows is what this report is measured against.

**Still live, not already satisfied:** measured on this branch before building —
`clara.create_prepayment_schedule_for` did not resolve, `clara_runtime` held EXECUTE on nothing in
the prepayment lane, and 0306's own tail asserts the human door is "human-only until #915".

---

## The seams I tested at

Written down before the first test, from the brief's own acceptance criteria. Every one is a public
interface the brief names; there is no cell at a seam the brief does not give.

| # | seam | kind |
|---|---|---|
| S1 | `clara.create_prepayment_schedule_for(p_client, p_author, p_source_entry, p_expense_account, p_expense_basis, p_purpose, p_authority_ref, p_op_key)` | the new OBO door |
| S2 | `clara.read_prepayment_source_for(p_firm, p_client, p_source_entry)` | the new machine-lane read |
| S3 | `clara.create_prepayment_schedule(...)` | the existing human door — its signature, ACL, floor, refusals and answer must not move |
| S4 | the live catalog's grant matrix over the whole prepayment / amortisation lane | AC5's census |

Nothing in `apps/web` and nothing in `packages/runtime` is a seam of this ticket: the human door's
contract is unchanged, so the web lane needs no edit, and the brief's own Key-interfaces line says
`prepayment-schedule-basis.ts` is **unchanged** — everything a frozen tool would need is a successor
contract below. `apps/web/lib/firm/needs-you.ts` (the four-lane shared file) is untouched by this
ticket: it gains no row kind.

---

## Acceptance criteria, each with its evidence

### AC1 — a runtime session configures a schedule OBO a bookkeeper, and is refused OBO a viewer with the typed reason

**Done.** `clara.create_prepayment_schedule_for` is `clara.create_accrual_adjustment_for`'s shape
(0222): `clara_runtime` only, the initiator in an argument, four walls of its own (the op key, a null
author, the client ladder, the live authority recheck) and then the shared core.

*Evidence:* `packages/db/tests/prepayment-schedule-obo.test.mjs` cell `p915.obo.configures`, driven
on a REAL `clara_runtime` connection through `roleQuery(ROLES.runtime, …)` with no
`request.jwt.claims` at all. A viewer is refused CLR04 `insufficient_role` and writes no schedule
(count read off the relation, not off the answer); the same call OBO the bookkeeper returns a real
schedule and plan, `kind = amortisation_schedule`, `configuration_only = true`,
`term_source = document_service_period`, the scene's own cents, period count, prepaid and expense
codes; the schedule ROW's `created_by` and the PLAN's `authorised_by` / `created_by` are the named
human, never the run; the plan cites the conversation (`authority_ref` deep-equal to the chat task);
the ACL is read POSITIVELY both ways on the twin (runtime true; authenticated, agent, both wake
roles, PUBLIC false) and on the human door (authenticated true, runtime false); and the agent read
role is refused `42501` by Postgres before a line of the body runs.

### AC2 — the deactivated-member refusal and the non-member-equals-unknown-client answer

**Done.** *Evidence:* cell `p915.obo.authority`. A membership withdrawn through the estate's own
`clara.remove_member` gives CLR04 `authority_lost`; a NON-MEMBER author (Dave, who owns another firm)
and a client uuid this database does not hold answer the SAME CLR11 `client_not_found` — compared
message-to-message and payload-to-payload, not merely token-to-token, because a sentence that
differed would be the existence oracle the code exists to prevent; a null author is CLR10
`invalid_author` before the client is read at all. Nothing is written by any of them (no schedule, and
`clara.op_receipts` holds no row under the key), and the positive control follows: the same call
succeeds once the membership is live again.

### AC3 — the human door and the twin share one op-key namespace (same key, same receipt, one schedule)

**Done.** The reservation is taken inside the shared core under the verb name
`create_prepayment_schedule`, over a payload hash of the caller's own arguments and **not** over the
author.

*Evidence:* cell `p915.obo.one_key`. Chat first, human replay second: identical answer byte for byte,
one schedule, exactly ONE `clara.op_receipts` row, under `fn = create_prepayment_schedule`. Human
first, chat replay second, on a second scene: the same. A SECOND bookkeeper replaying the same
decision under the same key gets the first one's schedule rather than a conflict — the measurement
that proves the author is not in the hash, which is what makes the brief's convergence possible at
all. A DIFFERENT decision under a used key is refused with the same sentence
(`op_key reused with different args`) by both entrances.

### AC4 — the twin's refusal vocabulary matches the human door's for every shared rule

**Done, and by construction rather than by coincidence.** The file EXTRACTS the human door's body
into `clara._prepayment_schedule_core` and both entrances call it; the only branch inside is which
plan step runs.

*Evidence:* cell `p915.obo.refusals_match` drives SIXTEEN rules through both entrances on the same
state and compares `{code, message, detail}` as ONE value: blank op key, blank purpose, a client of
another firm, an unknown source entry, a memo-only recognition with no stated term (including its
`remedy`), no expense account, a blank basis, an unknown expense code, a balance-sheet target, the
four authority-shape constraints (`object` / `kind` / `id` / unresolved), `authority_ref_not_human_instruction`,
the duplicate (CLR13, naming the same schedule), and an inactive client. The four authority rows are
the ones that matter most: the human lane reaches them inside `clara.create_accounting_plan` and the
OBO lane inside `clara._prepayment_plan_core`, so that is where two bodies would drift — and the
vacuity mutant below shows the cell catching exactly that drift.

### AC5 — a grant census proves the runtime role reaches the twin and the narrow read and nothing else in the lane

**Done, over the whole lane rather than over the two functions this ticket added.**

*Evidence:* cell `p915.grants.census` enumerates every `clara` function whose name matches
`prepayment` or `amortis` with six roles' EXECUTE bits and asserts EXACT SETS:
`clara_runtime` → exactly `create_prepayment_schedule_for` and `read_prepayment_source_for`;
`clara_agent_ro` → none; `clara_wake_proactive` → none; `clara_wake_interactive` → exactly the legacy
`wake_establish_prepayment_schedule` that was already there and that #1036 owns; PUBLIC → none; the
two cores and #940's `_prepayment_account_enrolled` → no application grant at all; and the human
lane's seven doors exactly where #653/#939/#940 left them, with the human write door still NOT
holding `clara_runtime`. The migration's §TAIL asserts the same runtime set at apply time, so the two
gates agree.

### The 2026-09-18 cross-reference — the twin runs #940's roster check ahead of the shared eligibility wall

**Done.** The roster question moved WITH the body, so the twin asks it by being the same code.

*Evidence:* cell `p915.obo.roster_first`. An unenrolled but otherwise eligible prepaid leg is refused
`prepayment_source_unfit` with `axis = prepaid_account_not_enrolled`, the account code, the
`remedy` (`clara.enrol_prepayment_account`) and the `panel`
(`client_registers_prepayment_accounts`), and configures nothing; the human door's payload is
deep-equal to it; ENROLLING the account makes the same OBO call succeed (a gate, not a ban); an
account that fails BOTH the roster and the shared wall is answered by the ROSTER (owner decision 6's
order); and the wall is still live behind it — the scene's enrolled prepaid account, bound as a bank
account through `clara.add_bank_account`, answers `prepaid_account_ineligible` with
`breach.axis = bank_account`.

### AC6 / the newest comment's first row — the cut is `chatTurn_v22` / `claraWork_v6`

**Not built, by the ticket's own division of labour, and carried as a successor contract below.**
The cut registers the chat tool, adds `read_prepayment_source` to the Work roster and takes
`packages/runtime/lib/prepayment-schedule-basis.ts` into the frozen closure. The work order reserves
that ONE shared cut for the end of wave 4 (`chatTurn_v22` / `claraWork_v6`), and the ticket's own Key
interfaces line says the carrier module is unchanged here. `node scripts/check-frozen-workflows.mjs`
shows no manifest diff.

### The newest comment's third row — the parked enrolment question

**Not built here, and that is the same division.** `clara.open_work_question` is `clara_runtime`-only
and needs a running Work's hook token, and the answer must run `clara.enrol_prepayment_account`,
which is `clara_authenticated`-only. So the park is a claraWork-lane capability and the answer is a
human-lane act: neither is buildable without the frozen cut. The contract is written out in full
below, including the field kinds and the door the answer runs.

---

## The migration

`packages/db/migrations/0307_prepayment_schedule_obo_twin.sql` — the one file, at the number reserved
for this ticket, 1351 lines. Sections: §0 prestate · §A `clara._prepayment_plan_core` · §B
`clara._prepayment_schedule_core` · §C the human door, now a wrapper · §D the OBO twin · §E the
machine-lane read · §F grants and comments · §TAIL.

**The shape, and why it departs from 0222's precedent.** The accrual pair duplicates its validation
across two doors and has already drifted: `clara._accrual_plan_core` still resolves authority with
0222's own `exists` probes while `clara.create_accounting_plan` was narrowed by #977/0250 to refuse an
instruction that is not a PERSON's — so the accrual OBO lane accepts an authority reference the human
lane refuses (measured by reading both live bodies; stated here as a FOLLOW-UP, not fixed by this
ticket). The prepayment door's body is ~500 lines and this ticket's AC4 is literally "the twin's
refusal vocabulary matches the human door's for every shared rule". Two copies make that a promise;
one body makes it a fact. So the human door keeps only what a human lane alone can do (the op key,
`clara._human_ctx(bookkeeper)`, the client ladder) and hands everything else to the core; the twin
keeps its own four walls and hands on the same.

**Prestate pins, MEASURED on `clara_l04` after 0305 and 0306 and before the first apply** (every one
listed, as the wave-3 addendum requires):

| signature | `sha256(prosrc)` | mode |
|---|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `446a8dcd060ca7e274012e7a15baa6f5c54e912ee7c53633748adc26b88340b0` | bimodal (recut by §C) |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424` | **unconditional** |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7` | **unconditional** |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` | **unconditional** |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` | **unconditional** |
| `clara.prepayment_schedule_v1(uuid,uuid)` | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` | **unconditional** |
| `clara.prepayment_schedule_v2(bigint,text,text,date,date)` | `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194` | **unconditional** |

The `create_accounting_plan` pin is load-bearing in an unusual way and the integrator should know it:
this file deliberately does NOT call that door on the OBO lane, so a change to it is a change to ONE
lane only — the pin is what makes that visible instead of silent. §TAIL re-measures all six
unconditional pins AFTER the file has run.

**Post-0307 live shas, for whoever recuts these next (#941, #1036):**

| signature | `sha256(prosrc)` |
|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `62f909b7802faacf1d8b18e4040e9bf70f99ce344f7120bc35f37be7c0e54879` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `0b34d44d70fa92f78f1d13dcf7866ce38aa99f7a6d2430cf329a48e4a7cd17dc` |
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6475458ed34d9b9ef357f8fb6e4eb9766042e30e1252c30d607fabd1a120495b` |

**The FIRST-APPLY branch was proved twice.** (a) The genuine first apply printed
`#915 prestate: FIRST APPLY … create_prepayment_schedule(…)=FIRST` before any redo existed. (b) By
hand afterwards, as the wave-3 addendum requires of any bimodal pin: inside ONE transaction that was
rolled back, 0306 §D's own `create or replace function clara.create_prepayment_schedule` statement was
re-run verbatim — restoring the body to exactly the sha §0 pins (`446a8dcd…`, printed by the script) —
and §0 was then executed verbatim and reported `=FIRST`. The rollback was verified: the live sha is
`62f909b7…` again. The true from-scratch chain on a disposable cluster is the integrator's, per RIG.md.

**Redo-safe by construction** (#957): every object is a `create or replace function`, and the file
writes no row and creates no schema object. **Redos performed, recorded because the work order asks:**
six, all with `CLARA_MIGRATION_REDO=0307_prepayment_schedule_obo_twin` — the two vacuity mutants for
cells 2/3 and their restore, the two mutants for cells 4/5 and their restore, the scalars fix for §E,
and the cell-6 `filename` mutant and its restore. Final ledger checksum
`b1a9295003ecd515c265ef8ba35376224254b7add76f515ab1ed67f62452aabd`, **verified equal to the sha256 of
the committed file on disk**; ledger frontier `292` files, `0307_prepayment_schedule_obo_twin`.

**Data-dependent branches.** §0's second notice counts this file's own four functions and reported
both states across the session (`FIRST APPLY … none … exists yet` and `REDO — 4 … already exist`).
§TAIL's census branches (`prepayment_schedule_for$`, `prepayment_source_for$`, and the runtime grant
set) are counted over the live catalog on every apply and ran with the full estate present.

**Gate module / cohort / chain, all three:**

* `packages/db/tests/prepayment-schedule-obo-preintegration-gate.mjs`, stem
  `prepayment_schedule_obo_twin$` (never the number), env
  `CLARA_ALLOW_MISSING_PREPAYMENT_SCHEDULE_OBO`;
* `packages/db/tests/rig-meta.mjs` — `PREPAYMENT_SCHEDULE_OBO_0307_COHORT`
  (`create_prepayment_schedule_for` + `read_prepayment_source_for` on the `clara_runtime` roster;
  `_prepayment_schedule_core` and `_prepayment_plan_core` ungranted), bimodal like 0306's, plus its
  `cohortFailures` call and the `ALLOWED[ROLES.runtime]` entry that ATTRIBUTES the two new grants
  (without it, `operation-census` reports them `unattributed`);
* `packages/db/package.json` — the `--import` entry inserted in MIGRATION ORDER, immediately after
  `prepayment-account-roster-preintegration-gate.mjs` (0306 < 0307).

**One defect this ticket found and fixed in its own new code.** §E first used plpgsql `record`
locals; a record that no `select into` ever reaches raises `record "v_sp" is not assigned yet` the
moment a field is read, so a MEMO-ONLY recognition (no document, hence no document-carrier select)
made the read RAISE instead of reporting the absence it exists to report — and the same held for the
prepaid leg when an entry debits zero or many asset accounts. Found by `p915.read.recorded_term`
before the code was ever green; §E now declares scalars and says why.

---

## Vacuity controls

The migration is one file, so it had to carry the whole door before the first cell could be green;
every cell after `p915.obo.configures` therefore took the work order's control for a
subject that already exists — shown FAILING against a deliberately broken subject, then the subject
restored byte for byte (`git diff` empty) and redone.

| cell | mutant | what the cell said |
|---|---|---|
| `p915.obo.authority` | `if false and v_member_status <> 'active'` | "expected SQLSTATE CLR04 but the call SUCCEEDED (no error)" |
| `p915.obo.one_key` | a per-lane reservation namespace (`'create_prepayment_schedule_' \|\| p_lane`) | "this prepayment is already amortised by an existing schedule" |
| `p915.obo.refusals_match` | `if false and v_reason = 'authority_ref_not_human_instruction'` | the exact drift it exists to catch — same token, different sentence: `"…does not exist for this client"` against `"…is not a person's instruction"` |
| `p915.obo.roster_first` | `if false and not clara._prepayment_account_enrolled(...)` | "expected SQLSTATE CLR10 but the call SUCCEEDED (no error)" |
| `p915.read.recorded_term` | a `'filename', 'mutant.pdf'` key in the read's `entry` object | the no-bytes half failed (exact key set, and the forbidden-substring sweep) |
| `p915.grants.census` (and cell 6's ACL half) | a LIVE `grant execute … to clara_agent_ro` on the read — catalog only, because the migration's own tail REFUSES that grant at apply time | both cells failed; revoked, both green |

---

## Gates

Every count below is a real run on this lane's rig (`clara_l04`, port 55744).
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. `$GATES` is the exact
`--import ./tests/*-preintegration-gate.mjs` list (109 entries) derived programmatically from
`packages/db/package.json`'s `test` script rather than retyped.

| gate | command | result |
|---|---|---|
| the new db battery, focused (no gate preload — an absent migration must fail LOUDLY here) | `node --test --test-concurrency=1 tests/prepayment-schedule-obo.test.mjs` | **7 pass, 0 fail, 0 skip** |
| the prepayment / plan / FA-limb family + both censuses, FULL GATE CHAIN (18 files) | `node --test --test-concurrency=1 $GATES tests/{prepayment-schedule-obo,prepayment-account-roster,prepayment-stated-term,prepayment-schedule,prepayment-term-liveness,prepayment-occurrences,f-a4-pr2a-schedule,f-a4-pr2a-census,f-a4-pr2a-books,f-a4-pr2a-carrier,f-a4-pr2a-wrapper,f-a4-pr1c-walls-census,journal-basis-zero-total-unreachable,plan-overlap-sibling-arm,plan-overlap-template-arm-retired,accounting-plans,operation-census,rig-isolation}.test.mjs` | **197 tests, 196 pass, 0 fail, 1 skip** |
| `operation-census` / `rig-isolation` | included in the 197 above; no reset flag was ever set | **green** |
| `pnpm typecheck` | worktree root | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| frozen-workflow manifest | `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen files, 55 "use workflow" modules, no diff** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| evaluator freeze lint | `node scripts/check-frozen-evaluators.mjs` | **OK — 9 evaluator(s) verified** |

The one skip is `T19 poison-role`, which self-skips as destructive unless `CLARA_RIG_ALLOW_RESET` is
set; it was not. **No `apps/web` and no `packages/runtime` file was touched**, so the whole web unit
suite and the browser walks are not gates of this ticket; the three freeze/parity checks were run
anyway, as the evidence that nothing frozen moved.

---

## Docs, in the same commits

* `packages/db/README.md` — a `## 0307` section: why a shared core rather than a second body (with
  the measured drift in 0222 that argues for it), why the OBO lane needs its own plan step, the one
  op-key namespace and why the author is not in the request hash, the machine-lane read's posture and
  its no-bytes rule, the scalars-not-records defect, the prestate pins with their modes, the
  post-0307 live shas for #941 and #1036, and the gate/cohort/chain trio.
* `CONTEXT.md` — **On-behalf-of door** in the house `term / _Avoid_` shape (the estate has had `_for`
  twins since 0216/0222 and no word for them), placed after **Prepayment account roster**; and ONE
  sentence of **Prepayment schedule** amended, because "the only things a person supplies" now has a
  second entrance that supplies them for the same person.

---

## Successor contracts — for the `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4

Nothing below is buildable here: `chatTurn` and `claraWork` bodies are frozen, and the ticket's own
Key-interfaces line keeps `packages/runtime/lib/prepayment-schedule-basis.ts` unchanged. The database
half is live, so each contract is now a WIRING job with no migration behind it.

### 1. `chatTurn_v22` — the chat tool, now that its door exists

* **Tool name:** `start_prepayment_schedule_work` — already exported as
  `START_PREPAYMENT_SCHEDULE_WORK_TOOL` from `packages/runtime/lib/prepayment-schedule-basis.ts`.
* **Zod input:** `startPrepaymentScheduleWorkInputSchema` from that module, UNCHANGED and `.strict()`
  — `{source_entry_id: uuid, expense_account_code: string(1..64), expense_account_basis:
  string(1..4000), purpose: string(1..200)}`. No amount, no term, no dates, no cadence, no authority
  id: every one of those is derived by a frozen evaluator or supplied by the successor's own context.
* **Door call — THE ONE CHANGE THE MODULE'S FOOTER NEEDS.** The footer's step 4 names the HUMAN door;
  the runtime pool cannot execute it. The successor calls the twin, with the author as the second
  argument, in the database's own parameter names:

  ```sql
  select clara.create_prepayment_schedule_for(
    p_client          => $1::uuid,
    p_author          => $2::uuid,
    p_source_entry    => $3::uuid,
    p_expense_account => $4::text,
    p_expense_basis   => $5::text,
    p_purpose         => $6::text,
    p_authority_ref   => $7::jsonb,
    p_op_key          => $8::text) as r
  ```

  `p_author` is the HUMAN the turn acts for (`ctx.actorUserId` / the chat principal's user id — the
  same value the other OBO tools pass, never the agent user id, never `ctx.taskId`). Everything else
  is `prepaymentDoorPayload(input, {clientId, taskId, opKey})` unchanged, in that order.
  `p_authority_ref` stays `{kind: "chat_task", id: ctx.taskId}` — the conversation IS the
  instruction, and the database resolves it through `clara._authority_ref_refusal`, so a wake run, an
  autodraft or an unsigned turn cannot authorise a schedule.
* **`opKey`:** `stableOpKey(ctx.taskId, START_PREPAYMENT_SCHEDULE_WORK_TOOL, input)`, exactly as the
  footer says. The key space is now SHARED with the human door, which is what makes a re-run turn
  replay rather than collide, and what makes a person's own replay under the same key converge.
* **Part kind:** `prepayment_schedule_configured`, built by `prepaymentSchedulePart(answer)` from the
  same module (`scheduleId, planId, planKind, totalCents, periodCount, effectiveFrom, effectiveTo,
  expenseAccountCode, prepaidAccountCode, configurationOnly: true`). `check-parts-parity.mjs` must see
  it emittable at that cut.
* **Refusal mapping:** `prepaymentRefusalMessage(reason, detail)` from the module covers every token
  the shared body raises. THREE tokens it does not yet carry, all of them this ticket's or #940's:
  * `prepaid_account_not_enrolled` (an `axis` on `prepayment_source_unfit`) → "That account is not on
    this client's prepayment account roster, so I cannot amortise against it. A bookkeeper enrols it
    on the client's Registers page, with their reason." Render `detail.prepaid_account_code` and
    `detail.panel`; NEVER offer to enrol it (see the prompt stanza in #940's report).
  * `authority_lost` / `insufficient_role` (CLR04) → "I cannot configure that for you: your
    membership is no longer active in this firm" / "Configuring an amortisation schedule needs a
    bookkeeper or above."
  * `invalid_author` (CLR10) → an internal wiring error, never shown: the successor always has the
    actor.
* **Live-behaviour gate:** the cut must add a real World e2e leg (the
  `chat-turn-v20-e2e.mjs` shape) that drives this tool end to end against a bootstrapped World, since
  this lane's rig cannot bootstrap one (see "unverified").

### 2. `claraWork_v6` — the term park's read

* **Tool name:** `read_prepayment_source`, read-only, on the Work roster beside `ask_question`.
* **Zod input:** `z.object({ source_entry_id: z.string().uuid() }).strict()` — the Work's own client
  and firm come from the run's context and are NOT model-supplied.
* **Door call:**

  ```sql
  select clara.read_prepayment_source_for(
    p_firm         => $1::uuid,
    p_client       => $2::uuid,
    p_source_entry => $3::uuid) as r
  ```

  with `ctx.firmId`, `ctx.clientId` and `input.source_entry_id`, in that order.
* **What it returns** (stable shape, asserted by `p915.read.recorded_term`):
  `{status, firm_id, client_id, source_entry_id, entry:{status, document_id, posting_date},
  prepaid:{account_code, total_cents, candidate_legs}, term:{source, service_period_id,
  stated_term_id, period_start, period_end, basis_kind, basis_text, remedy?}, schedule:{schedule_id,
  plan_id, term_source}|null}`. `term.source` is `document_service_period` | `human_stated` | `null`;
  when it is null, `term.remedy` names the HUMAN door that fills it. There is no bytes key and there
  never will be.
* **Refusal mapping:** CLR11 `prepayment_source_not_found` → "I cannot see that recognition for this
  client" (it is also the answer for another firm's entry — no existence oracle); CLR10
  `prepayment_read_scope_required` → an internal wiring error, never shown.
* **Prompt stanza** (replacing `claraWork.v1.prompt.ts`'s "There is no source document for this Work
  and you must never invent"):

  > The document this Work's entry binds is the only source you may cite, and only by its RECORDED
  > facts — the service period a person recorded, the kind of basis it rests on, and the grounds they
  > wrote. You never read the document itself and you never state a service period: if none is
  > recorded, say so and ask the fixed two-date question.

* **The question, unchanged from #653's contract** — `clara.open_work_question` through the run's own
  hook token, `p_fields` = `[{key:'period_start',kind:'date',required:true},
  {key:'period_end',kind:'date',required:true},{key:'basis',kind:'text',required:true,max:4000}]`,
  `p_context` = `{document_id, source_entry_id, prepaid_account_code, total_cents}` — every one of
  which `read_prepayment_source` now returns. The ANSWER applies through the HUMAN door
  (`clara.record_document_service_period`, or #939's `clara.record_prepayment_stated_term` for a
  memo-only recognition), never through the run. An EXPIRED question settles `refused` carrying
  `prepayment_term_underivable`.

### 3. The parked ENROLMENT question (the 2026-09-18 comment's conversation half)

* **When:** the door answers `prepayment_source_unfit` with `axis = prepaid_account_not_enrolled`.
* **Part kind:** none new — the existing `work_question` part and the existing Needs-you affordance
  render it, which is what the owner's comment asks for.
* **The question:** `clara.open_work_question(p_work, p_prompt => 'Which account holds this client''s
  prepayments, and why that account?', p_fields => [{key:'account_code',kind:'text',required:true,
  max:64},{key:'reason',kind:'text',required:true,max:4000}], p_context => {source_entry_id,
  prepaid_account_code, panel:'client_registers_prepayment_accounts'}, p_hook => <hook token>)`.
  `account_code` is a TEXT field because 0180's closed field kinds hold no account picker; the web
  answer card may offer the client's chart, but the value a person confirms is the value recorded.
* **The answer runs the HUMAN door AS THE ANSWERING PERSON:**
  `clara.enrol_prepayment_account(p_client, p_account, p_purpose => 'prepayment', p_reason,
  p_op_key)` — `clara_authenticated` only, bookkeeper floor — so it executes in the web/human lane
  with the answering person's own session, not in the run. The run then re-drives
  `clara.create_prepayment_schedule_for` under a NEW op key.
* **Never:** a runtime grant on the enrol door, a model-proposed account, or a model-written reason.
  #940's report states the ruling and the prompt stanza that goes with it; this ticket changes
  nothing about it.

---

## Follow-ups worth filing

1. **`clara._accrual_plan_core` is stale against #977/0250.** Measured on the live catalog: the
   accrual OBO lane still resolves authority with 0222's own `exists` probes, so it ACCEPTS a
   `chat_task` that `clara.create_accounting_plan` (and now `clara._prepayment_plan_core`) refuses as
   `authority_ref_not_human_instruction`. A wake or autodraft task could authorise an accrual through
   the OBO lane today. One line, but it is #652's lane and outside this ticket.
2. **The human door's nested `:plan` reservation has no OBO counterpart.** Deliberate and stated in
   the file, but it means `clara.op_receipts` carries a `create_accounting_plan` row for a human
   configuration and none for a chat one. If anything ever reports on plan-level receipts, the two
   lanes will look different. Worth a decision rather than a discovery.
3. **`prepayment-schedule-basis.ts`'s footer is now stale in one line.** Its step 4 names the HUMAN
   door's seven arguments; the successor must call the twin's eight. The module is unchanged by this
   ticket on the brief's own instruction, so the correction rides the cut.
4. **`clara.wake_establish_prepayment_schedule` still holds `clara_wake_interactive`.** It is the
   legacy template lane with its wake source asserted disabled, and #1036 (this lane, next) reroutes
   it onto the door built here. Recorded so the census cell's expectation is read as a measurement
   rather than an endorsement.

---

## Unverified / stated rather than asserted

* **No World e2e leg for the chat tool.** The tool does not exist yet (frozen body), and this lane's
  database cannot host a World: `select count(*) from information_schema.schemata where
  schema_name='workflow'` → `0` on `clara_l04`, and RIG.md's wave-2 addendum forbids bootstrapping one
  there (#866 reds `rig-isolation` T10b). The live-behaviour leg is part of the cut, and is named in
  the successor contract above.
* **I did not run a true from-scratch chain.** The prestate's FIRST branch is proved by hand as
  described; the from-scratch proof on a disposable cluster is the integrator's, per RIG.md.
* **The 0222 drift in follow-up 1 is measured, not fixed.** I read both live bodies
  (`clara._accrual_plan_core` has no `clara._authority_ref_refusal` call; `clara.create_accounting_plan`
  does) but did not drive an accrual cell to see the acceptance, because touching #652's lane would
  widen this ticket.
* **The integrator should re-run nothing under WSL for this ticket:** no `packages/runtime` test file
  was added or touched.
