# Hosted release ceremony, riders SWEEP WAVE: migrations 0330 to 0353, 0360, 0361 + runtime + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on `RELEASE-WC-RUNBOOK.md` and its
`§ RESULTS (as run, 2026-09-25, UTC)`, whose lessons are folded in rather than repeated: the
via-probe wrapper, streaming a bundle over `ssh console` instead of sftp, the role-level fingerprint
overrule, and the WSL-node rule for the backup.

RELEASE_SHA = **`________`** (the merge commit of the sweep-wave PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**THIS RELEASE IS THE OPPOSITE IN KIND TO THE ONE BEFORE IT, and the difference is one sentence.**
The cut phase REPOINTED three workflow pins and its whole risk lived in the image. This wave
repoints NOTHING: `packages/runtime/workflows/registry.ts` is byte-unchanged, the frozen manifest
reads the same `347 / 60 / 3` as the base, every manifest entry is already deploy-locked, and so
**there is no step 11a in this ceremony**. What this wave carries instead is twenty-five migrations
across eight lanes, and its risk lives in the DATABASE. Read section W and step 6 before anything
else.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\636` (branch `integration/riders-sweep`, head **`d812c2124`**, all
eight lanes merged) carries **337** files under `packages/db/migrations/`, highest version
`0361_reservation_release_advice`. Hosted is at **312 / `0323_trade_invoice_probe_self_exclusion`**
(`RELEASE-WC-RUNBOOK.md` § RESULTS, 2026-09-25; re-read live at step 3). So the migrate step should
report

```
migrate: 25 new migration(s) applied · 337 total
```

337 is the FILE count (`packages/db/scripts/migrate.mjs` prints `migrations.length`); `0361` is only
the highest version NUMBER. **`0351` and `0354` to `0359` are absent from the tree, reserved by the
orchestrator and never used**, which is lawful: the runner does not ask for gapless numbering,
exactly as the cut's own `0319` and `0322` were. `0351` in particular was lane L7's contingency and
its report returns it unused. Re-derive all of this against whatever `main` and the hosted ledger
actually are at window time: the preflight prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-WC-RUNBOOK.md` § RESULTS; re-read live at step 3):
DB **312 / `0323_trade_invoice_probe_self_exclusion`**. Runtime image **`refresh-061a6992`** =
`registry.fly.io/clara-runtime@sha256:11f5fb843d6bb695a9b010c09ab413725200dccbb86bff6056922b4b37f59975`
(265 MB, measured boot `bodies=60`, pins `chatTurn=chatTurn_v22` / `claraWork=claraWork_v6` /
`statementFacts=statementFacts_v4` and eleven others), single Fly machine **`48ee715b763048`**
(never touched directly; exactly two calls all window, `stop` and `start`). Web
**`3089d906-5bae-48cb-9666-72dff5aa8ef4`** (tag `refresh-061a6992`, promoted to 100% on 2026-09-25,
the promotion running 05:43:43Z to 05:43:50Z; the one before it is
`57c5dbab-5706-4a8b-a50a-a96fa37f6d97`, recorded here only to be re-read from
`wrangler versions list` rather than trusted).

**Secrets rule (unchanged from all eight prior runbooks).** The fly token and the DSN are
substituted INLINE inside one pipeline only: never assigned to a shell variable, never echoed, never
in argv. Reuse the wave-2/3/4/cut wrapper shape:

```
# C:\Users\zhant\AppData\Local\Temp\claude\...\scratchpad\release-wS\via-probe.sh
PROBE=<probe machine id> via-probe.sh <command...>
#   fly ssh console --app clara-runtime --machine $PROBE -C "printenv WORKFLOW_POSTGRES_URL" \
#     | tr -d '\r\n' | node scripts/ops/dsn-pipe.mjs -- "$@"
# run from the RELEASE_SHA checkout, with CLARA_REPO and CLARA_MIGRATIONS_DIR pointed at it
```

Copy it into this release's own scratchpad and re-point `REPO`. Every `flyctl` below is shorthand
for `FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>`.
From Git Bash a `wsl` argument that is a `/mnt/c` path needs `MSYS_NO_PATHCONV=1`, and
`wsl -- bash -c '...$VAR...'` expands `$VAR` in the OUTER shell, so single-quote it. **`fly ssh
console` has exited 1 with "The handle is invalid." after streaming on this Windows host, and the
wave-2 window's sftp extraction stalled at 32 KB twice: verify any streamed artefact by `sha256sum`
against the machine's own, never by exit code alone.** The backup wrapper must run under WSL's OWN
node, not a Windows-path node invocation (wave 4's deviation 2).

**Nothing in this release asks the operator to type a password.** This wave mints no role, needs no
new secret and sets none.

---

## 0. Rehearsal: the 0323 -> 0361 UPGRADE replay, and what exists of it

- The **integrator's** from-scratch chain is the release's own proof of file order: `clara_intS6`,
  created from the pristine `clara_l02` template (312 files, head `0323`) on `127.0.0.1:55742`,
  reported **`25 new applied · 337 total`** applying `0330 … 0353`, then `0360`, then `0361`, with
  every prestate satisfied and every tail OK (`reports/waveS-merge.md` §14.3, §17). Four earlier
  replays (`clara_intS` … `clara_intS5`) are left in place as evidence of the recuts that retired
  them.
- The **release-preparation worker** dry-ran the preflight both ways against those two databases.
  The table is in § "The preflight, dry run" below and in `reports/waveS-release-prep.md`.
- **Gate A PASS** (`reports/waveS-gates-A.md`): the chain from 0001 on an empty cluster,
  **337 new applied / 337 total** in 2 min 02 s, all twenty-five of the wave's files on their
  FIRST-apply branch with ZERO REDO and zero prestate refusals, no `ERROR:` or `FATAL:` in 1409 log
  lines, the role census reaching 20 by the chain alone, and a second `migrate` reporting 0 new. It
  then crossed that from-scratch database against `clara_intS6` in SEVEN censuses (1540 function
  bodies by `sha256(prosrc)`, 4070 columns, 3122 constraints, 957 indexes, 663 policies, 1884
  grant-and-posture rows, and the 337-row ledger) and **every one diffs 0**. Every lane's db
  batteries under the full 152-gate chain: 598 / 598.
- **Gate C PASS** (`reports/waveS-gates-C.md`): it PROVISIONED the Workflow DevKit schema, which is
  what the merge could not do, and closed both gaps the merge left open. The 22 lane-L6 cells that
  skipped at integration all RAN and all passed (lane L6's four batteries alone: 123 / 123 / 0 / 0,
  against the merge's 123 / 101 / 22 skipped); the whole runtime suite read 3181 tests / 3162 pass /
  2 fail / 17 skipped, both fails being RIG.md's standing Windows reds; the two-build cutover drill
  passed ALL THREE legs in 84 s with #1131's contract-rule assertions driven at frontier `0361`; and
  the rollback preflight was driven FIVE ways, which is what step 9 below now records rather than
  predicts.

**What is NOT rehearsed:** the preflight's own body census still cannot be computed against the
lane rigs, because none of them carries a provisioned Workflow DevKit World and
`workflow.workflow_runs` answers `42P01` there. The preflight fails CLOSED on that rather than
reporting zero, which is why its two rig STOPs are structural. Gate C shows the fix is one command
(`pnpm --filter @clara/runtime exec bootstrap`, recorded in `RIG.md`), so this is a gap in the
DRY RUN rather than in the wave.

A rehearsal on a seeded cluster proves DDL and guard logic, **not** the row-shaped hazards. This
wave has four of those and they are named in step 3c: 0338's CHECK swap over live plan rows, 0342
and 0343's double registry stamp, 0347's production backfill, and 0348's two index builds on
relations the BROWSER writes to.

## 0a. Gates before any production step

- `main` = RELEASE_SHA, `ci` SUCCESS on that sha, the build tree equal to RELEASE_SHA, `git status
  --porcelain` empty apart from the untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time, never a literal written before.
- **Owner says go**, in-session, for this specific window.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F):
  hosted users and data are test data. Confirm it is still true before treating any parked run as
  disposable.
- **`node scripts/check-frozen-workflows.mjs` on RELEASE_SHA must read `347 frozen file(s) / 60
  "use workflow" module(s) / 3 retired`, IDENTICAL to main's.** And `--compare-base origin/main`
  must read **347 unchanged, 0 additions, 3 retirements**. This wave edits no frozen file at all:
  the merge measured 207 changed files against `3bf6aa94d` and not one is a key in main's manifest
  (`reports/waveS-merge.md` §17). A single addition here would mean this is not the wave this
  runbook describes.
- **`node --test packages/runtime/tests/registry-view.test.mjs` must read 7/7**, and the registry
  itself must be unchanged. The preflight proves the second half by reading the SAME tree twice:

  ```
  CLARA_REPO=<RELEASE_SHA tree> CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
    node docs/plan/active/riders-2026-09-20/ceremony-wS/reads-wS.mjs \
         --plan --frontier-before 0323_trade_invoice_probe_self_exclusion
  ```

  Expect `bodies=60`, fourteen pins with `chatTurn=chatTurn_v22 claraWork=claraWork_v6
  statementFacts=statementFacts_v4`, `frozen manifest 347 entries, 0 UNLOCKED`, `SUCCESSOR BODIES
  … (none)`, 25 pending files, 175 pins (156 measurable / 19 chained), 13 hand checks, **0 GAP**,
  exit 0. Running the same command with `CLARA_REPO` pointed at the MAIN checkout must print the
  same registry line, which is what "this wave moves no pin" means in a form that can be checked.
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` to confirm the active version is `3089d906-5bae-48cb-9666-72dff5aa8ef4` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy 3089d906-5bae-48cb-9666-72dff5aa8ef4@100% --yes`.
- **Two readings this wave asks for and that belong before the window, not during it**
  (both carried by `reports/waveS-merge.md`):
  1. **0338 NARROWS nothing and WIDENS by one, and that is a fact about the LIVE constraint rather
     than about the file.** It drops `accounting_plans_authority_kind_check` and re-adds it as
     `check (authority_kind in ('explicit_instruction','standing_instruction'))`. Measured on the
     pristine 312-file template the constraint in place today is
     `CHECK ((authority_kind = 'explicit_instruction'::text))` and zero rows fall outside the new
     list. Hosted's own constraint and its own rows are read at step 3 by `D-CHECK-SWAP`, and a
     single row outside the new list fails `add constraint` and rolls 0338 back whole.
  2. **#1098's second acceptance criterion ships PARTIAL and disclosed** (`waveS-lane07-ticket1098.md`):
     after the backfill a committed firm checklist SHOWS the TIN question and correctly marks it
     outstanding, and the firm still cannot answer it, because `clara.answer_firm_setup_item`
     refuses every item on a plan that is not open. The lane drives that refusal in a cell rather
     than leaving it silent. Accept it as partial with the follow-up, or hold #1098 open after the
     release; it is not a runbook decision and it changes nothing about the migration.
- **DB RESTORE POINT**: step 3f. Take it before the first hosted write; re-take it if the window
  opens more than about 2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery").

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-061a6992 --app clara-runtime \
      --name probe-ws --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy. Step 9 needs a SECOND probe on the same serving image.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-wS/reads-wS.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs` (through `via-probe.sh`). It opens `begin transaction read only` and
issues nothing but SELECTs, each under its own `SAVEPOINT`, so a soft failure never poisons the
rest. It prints facts only: never the DSN, never an e-mail address, never any personal data. Exit
code is non-zero when any check says STOP.

**Nothing in the script is transcribed.** Every expected value is PARSED out of
`CLARA_MIGRATIONS_DIR` at run time, and the registry expectation is PARSED out of `CLARA_REPO`'s own
`registry.ts` and `frozen-workflows.json`. A literal it cannot parse is a **PARSE GAP** and counts
as a STOP.

Then, through the probe:

```
PROBE=<probe-id> via-probe.sh node docs/plan/active/riders-2026-09-20/ceremony-wS/reads-wS.mjs \
      --prod --baseline scratchpad/wS/fp-wS-hosted.json
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted pooler estate
(`db=postgres`, port 5432, not loopback). Ledger expect **312 / `0323_trade_invoice_probe_self_
exclusion`**; drift gate over all 312 applied rows (`migrate.mjs` aborts the whole run on one
checksum mismatch, so a drift here is a STOP before the window rather than a surprise inside it);
the pending set listed and asserted to be exactly the twenty-five files above the frontier; and the
printed arithmetic `312 + 25 = 337 / 0361_reservation_release_advice`. The run writes
`ceremony-wS/reads-wS.state.json` so `--post` can re-derive that sum.

**3b. THE ESTATE FINGERPRINT.** The script compares hosted against a baseline produced by the same
script from a rig database at the hosted frontier. Coverage is unchanged from wave 3, wave 4 and the
cut: every function in `clara` (identity signature, `sha256(prosrc)`, owner, SECURITY DEFINER,
`proconfig`, ACL), every relation (columns, constraints with `convalidated`, indexes, RLS enabled
and forced, policies, triggers with `tgenabled`, view definitions, owner, ACL), the schema's own
types, and the `clara%` roles with their memberships.

Role-level rule, unchanged: `role:` and `rolemember:` differences print as **`env`** lines, with
both sides, and never count as a STOP. Everything else still STOPs. **This wave mints no role.**

Expect on hosted: **0 DRIFT, 0 PINNED DRIFT, and the same role-level `env` lines waves 2, 3, 4 and
the cut saw** (the cut's pre-window read counted 16; re-count them, a seventeenth is a finding).

**3b-bis. THE BODY-PIN LEDGER: 175 pins, 145 of them actually measured on a target at 312.** The
cut's three files touched three disjoint families and every pin was measurable. This wave's eight
lanes recut each other on purpose, which is what the integration merge's eleven recuts were for, so
**19 pins are CHAIN-INTERNAL**: their expected value is a body an earlier file of this same run
produces, and measuring them now would compare the pre-wave body against a post-<earlier file>
expectation and invent a STOP. They print as `note CHAINED`, naming the file that produces the body.

The offline `--plan` reading says 156 measurable rather than 145, and the difference is not a
disagreement. `--plan` has no catalog to ask, so it can only subtract the chain-internal ones;
against a real target a further **11 resolve as NEWBORN**, meaning the pinning file creates that
signature itself (0353 pins the DERIVED shape of each core it embeds, and a core is born by the file
that pins it). A newborn that does not resolve before the window is the reading a first apply must
give, not drift, and the script says so by name rather than counting it as a STOP.

| where the ledger comes from | pins |
|---|---|
| a roster tuple or pair row | 103 |
| a multi-signature roster, attributed by the column map its own loop derives (0353) | 18 |
| a FLAT paired array (0344's three arrays) | 11 |
| a scalar `sha256(prosrc)` measurement, in any recipe | 41 |
| the file's own refusal, for the one signature it names (0352's recovered pre-images) | 3 |
| **total** | **175** |

Two things about this ledger are this wave's own and the operator should know them before reading a
refusal.

- **ELEVEN PINS ARE BIMODAL**, and each second shape is a body another lane of this same wave, or
  the released cut phase, moved: `create_accounting_plan`, `_obo_plan_core` (0330),
  `_accrual_plan_core` (0331), `_plan_admit_occurrence` (0332, and three-valued at 0333),
  `revise_document_fact`, `persist_payroll_facts`, `_payroll_entry_plan`, `_payroll_posting_verdict`
  (0344), and `_payroll_posting_verdict` and `revise_document_fact` again at 0360. A body at NEITHER
  shape still refuses BY NAME. The script measures every admitted shape and prints them all.
- **TWO FILES HASH WITH `sha256(prosrc::bytea)` RATHER THAN `convert_to(...,'UTF8')`** (0345 and
  0346, seven pins between them). The two recipes agree on a backslash-free body and DIFFER on one
  that carries a backslash, because the bytea input function reads a backslash as an escape. That is
  not theory: the integration merge met it when lane L4's 0343 gave
  `clara._payroll_posting_verdict` a backslash at character 22284 and 0352's eight bytea casts
  aborted with `invalid input syntax for type bytea` before the file had edited anything
  (`waveS-merge.md` §14.2, finding 3). The preflight re-measures every pin the way ITS OWN FILE
  measures it, and reports a bytea-recipe pin over a body carrying a backslash as the **22P02** it
  would raise rather than as a mismatch. Measured on the template: none of the seven is at risk
  today.

**3c. THE DATA PRECONDITIONS a rehearsal on a seeded rig cannot prove about hosted.** Thirteen hand
checks, each with its expected value parsed from the file that owns it. Four of them are the real
content of this step.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| **D-ROLE-REACH** | 20 of the 25 | every one of them does `set role clara_fn_owner`, and 0341's §TAIL additionally does `set_config('role','clara_authenticated', true)` to drive the door it recuts under a person's own floor | `current_user`, `rolsuper`, and MEMBER/USAGE for every role a block in this wave asks to BECOME. **THIS IS THE ONE CHECK NO RIG CAN ANSWER**, because a rig migrates as a superuser. The cut's window answered the `clara_fn_owner` half on 2026-09-25 (`postgres`, not a superuser, MEMBER and USAGE both true); the `clara_authenticated` half is new and unread |
| **D-CHECK-SWAP** | 0338 | it DROPS `accounting_plans_authority_kind_check` and re-adds it with its own list. An existing row outside the new list fails the add and rolls the file back whole | `pg_get_constraintdef` of the constraint in place TODAY, the count of rows outside the NEW predicate, and the relation's row total. On the template: `CHECK ((authority_kind = 'explicit_instruction'::text))`, 0 rows, so it is a widening by one |
| **D-BACKFILL-ONBOARDING-PLAN-ITEMS** | 0347 | the wave's one production backfill, over every COMMITTED firm-scope onboarding plan | the file's own selector, re-run read-only, as a count. Every rig answers 0 because no rig carries a committed firm-setup plan; hosted's own number is the only one that means anything, and it is the number of rows the window will write |
| **D-RATE-WALL-TRIGGERS** | 0348 | the two append-only triggers the new prune verbs disable and re-enable inside one call, and the two relations this file builds an index on | each trigger's presence and `tgenabled`, and both relations' row counts. Those counts are what the two NON-CONCURRENT index builds have to scan, and the browser writes to both tables through the auth wall, which no machine stop quiesces |
| **D-WAVE-PREMISE** | all | 32 objects the twenty-five prestates require to be PRESENT; each file raises CLR10 by name on an absent one | all 32 present |
| **D-WAVE-NEWBORN-RELATION** | 0338, 0343 | the two relations this wave creates, both with `create table if not exists`, so a present one is silently accepted and its indexes, policies and grants applied to somebody else's table | `clara.firm_standing_instructions` and `clara.payroll_completeness_answers` must both be ABSENT |
| **D-WAVE-MINTED-NAMES** | all | the 30 function names this wave's text creates and no file pins a pre-image for | a SPLIT, not a verdict: one that does not resolve is a new name, one that does is a body recut without a pinned pre-image. On the template, 29 new and one recut blind (`clara._prepayment_plan_core`) |
| **D-CAPABILITY-REGISTRY** | 0342, 0343 | both stamp `clara.document_capabilities.registry_version`, 7 then 8, in the same run, and the estate's own trigger keeps it monotone | the live version must be BELOW both. On the template: 6, across 240 capability rows, 12 of them `payroll_summary` |
| **D-BACKFILL-TRIGGER-TAXONOMY** | 0343 | the catalogue row it adds for `document.payroll_completeness_answered` | 1 row on the template |
| **D-WAKE-ALLOWLIST** | 0352, 0353 | eight `clara.wake_fn_allowlist` rows, all `on conflict do nothing`; each file's §TAIL then counts the rows for its own names | none of the eight may be present, or the insert is a no-op and the tail counts somebody else's row. On the template the allowlist goes 106 to 114 |
| **D-MACHINE-LANE-GRANTS** | 0346, 0348, 0352, 0353 | 12 EXECUTE grants and 1 SELECT grant this wave hands `clara_agent_ro` and `clara_runtime` | every target is a name this wave mints, so none may hold the grant today. The whole `clara%` roster is printed beside it, because hosted carries more roles than a rig and the interesting direction is an unexpected role rather than a count |
| **D-SPLICE-ANCHORS** | 0352, 0353 | five substitution anchors the two splitting files carry; each refuses if its anchor does not match ("the surgery on % changed nothing") | each anchor lifted from the file's own `__t*_anchor()` helper and counted against the bodies that file pins |
| **D-WAVE-PREMISE / generated reads** | all | every `ADD CONSTRAINT`, `CREATE INDEX`, `SET NOT NULL`, `VALIDATE`, top-level `UPDATE` and top-level `DELETE` in the executed statements | generated from the files, never listed here. This wave's non-empty families are the one CHECK swap, six index builds and five UPDATEs; four of the UPDATEs are 0342's and 0343's registry stamps and the fifth is driven inside 0340's self-rolled-back tail |

> **D-ROLE-REACH, stated at length because it is the thing this ceremony can most plausibly trip
> on.** Twenty of the twenty-five files do `set role clara_fn_owner`, create their objects, `reset
> role`, and then run a §TAIL. On every rig the migration runs as a SUPERUSER, which satisfies all of
> that by bypass, so **no rig run of these files has ever exercised the privilege path**. The cut's
> own window read the answer for `clara_fn_owner` and it was good. What this wave adds is 0341's
> §TAIL, which becomes `clara_authenticated` to drive `clara.get_work_claim_origin` under the floor
> a bookkeeper meets. If hosted's migrating role cannot become that role, 0341's tail raises `42501`
> and the file rolls back whole, leaving the ledger at `0340`. Read this BEFORE the window.

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective. Derived by stripping every `create [or replace] function` BODY from each file, because a
body is inert at apply time, and reading only what is left.

- **There is no `ALTER TABLE ... ADD COLUMN` in this wave. No `SET NOT NULL`. No `VALIDATE
  CONSTRAINT`. No top-level `DELETE`. No new role.** That is parsed, not claimed: the preflight's
  generated-read sections for those families all print empty.
- **TWO new relations**, `clara.firm_standing_instructions` (0338) and
  `clara.payroll_completeness_answers` (0343), each `create table if not exists` with its own RLS,
  policies, grants and indexes. Their four indexes build over zero rows.
- **TWO index builds that are NOT free**: `ix_invite_preview_attempts_attempted_at` and
  `ix_confirmation_attempts_attempted_at` (0348), both plain `create index if not exists` on
  relations that already hold rows, under `lock_timeout = 15s`.
- **ONE constraint swap**, 0338's, on `clara.accounting_plans`.
- **FOUR top-level UPDATEs**: 0342 and 0343 each rewrite the `payroll_summary` capability rows and
  then every `document_capabilities` row's `registry_version`. On the template that is 6 rows and
  240 rows, twice.
- **ONE production backfill**, 0347's, `insert … select … where not exists`, scoped to COMMITTED
  firm-scope plans and to the `tin` key alone.
- **The wave's tails DRIVE real writes and roll them back themselves.** 0340 and 0341 open a driven
  block, exercise the door they recut against real fixtures, and end by raising
  `clara_1052_probe_rollback` (`CLR99`) so the whole block unwinds. Nothing they write survives.
- **About 105 `create [or replace] function` statements between them.** `create or replace function`
  stores text and runs none of it, and takes no table lock.

**3f. DB RESTORE POINT: the full dump, through the probe DSN into WSL.** `backup.mjs --profile full`
(`pg_dump` 17.11 lives in WSL; Windows has none). The cut's took 95 s for 221,062,708 bytes plus a
12,809-byte globals dump. **Run it under WSL's OWN node**, not a Windows-path node invocation. The
CA-path workaround (#917) is still required unless `--child-os wsl` is present on RELEASE_SHA;
re-check rather than assume. Record the artefact path, the byte count and its sha256.

## W. Deploy order, decided from the headers and from the runtime's own source

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine IS
STOPPED before the migrate and started again only on the NEW image.** Same order as waves 2, 3, 4
and the cut. For this wave, unusually, **neither direction is FORCED**, and saying so plainly is
more useful than implying a constraint that is not there.

### Nothing forces the order, and that is checked rather than assumed

`grep -niE 'deploy order|write-quiet|quiesce'` over the twenty-five files returns hits in exactly
one file, 0343, and what it says is that the database half ships ALONE:

> "DEPLOY ORDER: DATABASE ALONE, THEN A SUCCESSOR. This file adds NO new task lane, NO new workflow
> family and NO new runtime call. … The prompt stanza that makes witness 1 and 2 reachable is
> delivered as a SUCCESSOR CONTRACT in the ticket report: a frozen workflow body is never edited."
> - `0343_payroll_completeness_witness.sql`

The other twenty-four carry no deploy-order header, and under `ARCHITECTURE.md` §5.F that silence is
readable. The reverse direction was checked too, because the cut's own lesson was that the forcing
statement can live in the RUNTIME rather than in a migration:

| what the new image gains | does it call a door this wave creates? | order |
|---|---|---|
| the reconciler's two new retention lanes (`lib/reconciler.mjs`, #1046) | **yes**: `clara.prune_invite_preview_attempts` and `clara.prune_confirmation_attempts`, both created by 0348 | **free in both directions.** The belt tolerates `42883` by name and its own comment says so: "Inert below 0348: an undefined_function is swallowed exactly as prunedWorkTraces above, so this belt stays a no-op on any database that has not yet applied that migration" |
| `lib/spool.mjs` (#1044), `lib/reconciler-documents.mjs`, `lib/health.mjs`, `lib/lane-probe.mjs` | no new name; every `clara.` identifier they add is pre-existing | free |
| `lib/rollback-preflight.mjs` (#1129, #1131) | no database call at all; two lint-shaped helpers and an empty exception list. `FRONTIER_RULES` is unchanged | free |
| `lib/fa-proposal-grounds.ts` (#1092, #1093) | it reads `clara.fa_account_depreciation_policies`, which 0346 grants `clara_agent_ro`, **but nothing imports it except its own unit test**. It ships in the bundle and is never called | free |
| the web build | every new surface reads a door this wave creates | **DATABASE FIRST, in practice.** A promoted web that calls `clara.record_firm_standing_instruction` or `clara.answer_payroll_completeness` before 0338 and 0343 are live answers `42883` on those panels |

So the order is DATABASE, IMAGE, WEB because that is the house order and it costs nothing, and
because the web leg is the one place where the reverse order would show a user an internal fault.

### What the OLD image does between the migrate and its own replacement, checked rather than assumed

- **No workflow body changes.** `registry.ts` is byte-identical to main's: the same 60 bodies and
  the same 14 pins. Every parked run reaches exactly the body it always reached, in either image.
- **The serving image's reconciler does not call any of this wave's new doors.** The retention lanes
  arrive WITH the new image, so a 0348 database under the old image simply has two verbs nothing
  calls.
- **The bodies this wave RECUTS that the serving web and runtime already call** are the ones to
  watch, and the lanes' own tails are what prove them unmoved in meaning: `create_accounting_plan`,
  `_obo_plan_core` and `_accrual_plan_core` (L1 folds three hand-written authority walls onto one
  predicate, admitting and refusing exactly what they did), `list_review_queue` (L4 adds a
  seventeenth row kind, L8 splits it into a core whose text is re-derived from the LIVE body by the
  file's own surgery and proved by reversing it), `list_accounting_work` (L3 adds
  `allocation_count`), `revise_document_fact` (L5 widens the revisable set to payroll fields and
  carries the cut phase's own typed no-op guard forward), and `_payroll_posting_verdict` and its
  neighbours (L4's witness rung).
- **PostgREST's schema cache.** 0343 adds a seventeenth row kind to `clara.list_review_queue` and
  0352 splits that door into a thin delegate over a core. Neither adds a relation or a column, and
  the doors keep their names and signatures, so the `PGRST202` watch item wave 4 carried has no
  analogue here. The new granted doors are `clara_agent_ro`'s and `clara_runtime`'s, which PostgREST
  never reaches.

### Is the machine STOP needed? Yes, for three reasons, and one of them is new

1. **`packages/db/README.md`'s general rule for recutting an active writer body**, and this wave
   recuts several. 0343 `create or replace`s four live bodies and splices two more; 0344 recuts
   `clara.revise_document_fact`, which writes an extraction, a region, a revision row and retires
   Work parked on the document. PostgreSQL runs an in-flight PL/pgSQL call to completion on the body
   it STARTED with, so a correction spanning the migration settles under a rule the estate has
   already replaced.
2. **0348's two index builds take SHARE on relations that are being written.** A plain `create
   index` blocks writes on the whole relation for its duration, and both relations are the auth
   wall's own evidence tables. Quiescing the runtime does not quiesce the browser, so the stop
   reduces the contention rather than removing it, and `lock_timeout = 15s` is what bounds it.
3. **0338's constraint swap takes ACCESS EXCLUSIVE on `clara.accounting_plans`** for the drop and
   the add. It is brief and it scans the relation once for the add, but it is the heaviest lock in
   the wave and it is taken on a relation the plan doors write to.

**What the stop does NOT buy, said plainly.** Stopping the Fly machine quiesces the RUNTIME's
writers: the reconciler, the Work lane, chat turns, the sweep. **The browser talks to PostgREST
directly and is not quiesced by anything in this ceremony**, and this wave has more browser-reachable
writers than the cut did: `clara.revise_document_fact`, the staff-expense-claim doors, the plan
doors, and the auth wall's own attempt tables. In beta the only browser session is the owner's, so
the operative instruction is the one every prior window used: the operator does not drive the
product between 6a and 8. Step 6b's `pg_locks` read is what makes that real rather than nominal.

**THE TIMEOUT PICTURE.** `migrate.mjs` arms nothing itself; each file arms its own.

| what | files |
|---|---|
| `statement_timeout = '5min'` | 0334, 0341, 0342, 0343, 0347, 0348, 0349, 0350 |
| `statement_timeout = '20min'`, described as PRECAUTIONARY in the file's own comment | 0338, 0352, 0353, 0361 |
| `lock_timeout = '5s'` | 0342, 0343 |
| `lock_timeout = '15s'` | 0348, 0349, 0350 |
| no timeout of its own | the rest |

**So `55P03 lock_not_available` IS a real failure branch for this release, and it was not one for
the cut.** 0348's index builds and 0342/0343's capability rewrites all arm a `lock_timeout`, and a
browser write holding a conflicting lock for longer than that refuses the migration cleanly. Step 6d
says what to do with it.

**And web goes LAST**, because a promotion is the cheapest thing to hold and the order has never
cost anything. Unlike the cut, this wave's web build is substantial: sixty changed files under
`apps/web/components`, `app` and `lib`, a new firm-settings card, a new Needs-you row kind and its
affordance, and five browser walks the merge ran green.

## 4. Runtime image first, build-only and push, released by digest

```
... flyctl deploy --config packages/runtime/fly.toml --build-only --push \
      --image-label refresh-<RELEASE_SHA> --build-arg CLARA_BUILD_SHA=<full sha>
```

About five minutes; record the `sha256:` digest and release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7, never by tag. The Docker build runs
`nitro build` only: it does NOT run the bundle gate or the freeze-lint, so those counts are `ci`'s,
not this step's output. Nothing built here is released until step 7.

`pnpm --filter @clara/runtime build` is green on the integration head (`exit 0`,
`.output/server/index.mjs` 11.8 MB, `reports/waveS-merge.md` §16), so a failure here is a
build-environment finding rather than a code one.

## 5. Web build and upload, in WSL as root, BEFORE the window

Mechanism unchanged: detached checkout at RELEASE_SHA in `/home/runner/clara-deploy` fetched from
`refs/remotes/origin/main`, `corepack pnpm install --frozen-lockfile`, the two
`NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then
`corepack pnpm --dir apps/web exec wrangler versions upload --tag refresh-<RELEASE_SHA>`. Record the
Worker Version ID. **Not promoted until step 8.**

**New in this release: a great deal.** A `standing-instructions-card` on firm settings, a
`payroll-completeness-question-affordance` and its Needs-you row kind, a per-period schedule on the
accrual detail, a side filter on the accrual register, a third bill-conflict remedy, a reopen path
on the payroll settlements section, an allocations editor on the staff-advance register, a bank
navigation tab, a revision dialog that reaches payroll fields, and a wait-time notice on the
signed-out invite preview. **`pnpm build` for `apps/web` is UNVERIFIED at the integration head**
(`reports/waveS-merge.md` §18 item 3: typecheck and the whole 5249-test unit suite are green and the
merge did not run a full web build). This step is where it is first built with the deploy
environment, so treat a failure here as a build-environment finding first, and read the unit suite
(5249 tests, 5247 pass, 2 skipped) and the five green browser walks as the code-side evidence.

## 6. Writer quiescence, then migrate: all twenty-five files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is what buys section
W's three obligations, and it does not quiesce the browser.

6b. Re-run the census through the probe (`reads-wS.mjs --census --prod`). It must come back clean,
and specifically:

- **no holder of the F10 advisory lock**, or the migrate step hangs silently;
- no other backend holding a lock on any of the nineteen relations the parsed watch list names, and
  in particular none on `clara.accounting_plans`, `clara.document_capabilities`,
  `clara.invite_preview_attempts` or `clara.confirmation_attempts`, which are the four this wave
  takes a heavy lock on;
- the **body census** comes with the census in this mode. Read it: every non-terminal
  `workflow.workflow_runs` row BY BODY, and the stranded-body census against RELEASE_SHA's sixty
  exported bodies (expect **0 stranded**, and this wave adds none, so the reading is the same one
  the cut's release left behind);
- Idle pooler-held `clara_runtime_login` sessions are fine; held locks are not. The
  `statement_facts running` `document_processing_tasks` row is the orphan known since 2026-09-19 and
  is not a blocker.

6c. From the RELEASE_SHA checkout:

```
PROBE=<probe-id> via-probe.sh node packages/db/scripts/migrate.mjs      # cwd = packages/db
```

Expect **`migrate: 25 new migration(s) applied · 337 total`**. Twenty-five files, of which two build
an index over live rows, one swaps a constraint, two rewrite every capability row twice and one
backfills. Wave 3's window took 1 min 28 s for 21 files through the ssh hop and wave 4's 1 min 33 s;
budget a couple of minutes and do not kill it.

The prestate notices worth reading out loud, because they are about hosted ROWS and hosted
PRIVILEGES rather than catalog shape:

- **0330 to 0334 (L1)**: `FIRST APPLY` on each, with `_authority_ref_refusal` byte-identical to its
  #977 pre-image, both plan doors in their first state and `_assert_plan_authority` not yet minted.
- **0338 (L2)**: `3 FIRST, 0 REDO` naming `_authority_ref_refusal`, `_prepayment_schedule_core` and
  `_obo_plan_core`, the last of them as `FIRST(0330/#1051)`. That parenthesis is the cross-lane
  question answered by the chain itself: 0338 recuts the twin from L1's post-image, not from 0308's.
- **0344 (L5)**: its bimodal arm may print `FIRST (0321 pre-image)` for `revise_document_fact`,
  which is the cut phase's own substitution being recognised rather than drift.
- **0352 (L8)**: `17 row kind(s) each projected once`, which is the number that proves lane L4's
  seventeenth row kind survived the queue split.
- **0360 (L5's fix round)**: its two pins are bimodal and its anchor count must read exactly one.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state: the
file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b-bis exists so this is discovered before the window, for all 156
  measurable pins. Do not re-pin and do not edit the migration. Report to the owner with the body
  name and both shas. **If the refusing pin is one of the eleven BIMODAL ones, read which shape the
  file admits before calling it drift**: the message names both.
- **A `22P02 invalid input syntax for type bytea`.** That is the recipe hazard arriving late: a
  bytea-recipe pin in 0345 or 0346 over a body that has gained a backslash. Step 3b-bis reads it
  before the window. It rolls the file back whole and nothing is written.
- **A 42501 IN A TAIL.** That is D-ROLE-REACH's failure arriving late. The file rolls back whole. Do
  not grant anything to work around it inside the window: report the role and the function, and take
  the ruling outside the window.
- **A `55P03 lock_not_available`.** NEW IN THIS WAVE. 0348's index builds, 0342's and 0343's
  capability rewrites and 0349's and 0350's comments each arm a `lock_timeout`, and a browser write
  holding a conflicting lock refuses them cleanly. The file rolls back whole; the ledger stops at
  the file below. Confirm the operator is not driving the product, re-run 6b to find the holder, and
  re-run 6c from the ledger's current frontier.
- **`add constraint` failing on 0338.** That is D-CHECK-SWAP's failure arriving late: a plan row
  whose `authority_kind` is outside the new list. The drop and the add are in one transaction, so
  the OLD constraint is still in place afterwards. Report the row count and the kinds in use.
- **Ledger-position branches.** This wave has no ordering cliff: every file above the frontier is
  additive against the image, and the serving image `refresh-061a6992` is a legal boot target at
  EVERY ledger position between 312 and 337, because it calls none of the new doors and no pin
  moves. So: (i) the ledger stopped anywhere below 337 - start the old image, hold web, report, and
  resume from the frontier in a later window; (ii) the ledger reads **337 /
  `0361_reservation_release_advice`** - drive forward to steps 7 and 8. **Do not promote web at a
  partial ledger**, because the new panels read doors the files above the frontier create.

## 7. Release the runtime by digest, and start

Destroy the probe first (`flyctl machine destroy <probe-id> --force`), then:

```
... flyctl machine list -a clara-runtime                                   # exactly one machine
... flyctl deploy --config packages/runtime/fly.toml --image registry.fly.io/clara-runtime@sha256:<digest>
... flyctl machine start 48ee715b763048                                    # a deploy onto a STOPPED machine leaves it stopped
... flyctl machine list -a clara-runtime                                   # one machine, new image
```

`fly deploy` does not start a stopped machine. Start it by hand and watch. Wait for `/ready` 200,
then `flyctl logs`.

**Expected boot lines. THE PINS HAVE NOT MOVED, and `bodies` has not moved with them:**

```
serving git_sha=<full sha> frontier=0361_reservation_release_advice(337) bodies=60 pins \
        closeExample=closeExampleV1 chatTurn=chatTurn_v22 claraWork=claraWork_v6 \
        documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4 \
        witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1 \
        autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5 \
        bankAgent=bankAgent_v1 closePrep=closePrep_v1
stranded bodies n=0            <- BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5  clara-work/v6   <- SIX bundle banners
CONTROL listening
LEADER acquired
```

Three things to check by eye:

1. **`frontier` MOVED and `bodies` DID NOT.** `frontier=0361_reservation_release_advice(337)` where
   the last boot read `0323_trade_invoice_probe_self_exclusion(312)`, and `bodies=60` unchanged with
   all fourteen pins reading exactly what they read before. **If a pin has moved, the image is not
   RELEASE_SHA's**: stop and report.
2. **`stranded bodies n=0` BEFORE `durable world started`.** A non-zero reading means the world
   refuses DATABASE-WIDE, the crash-only supervisor exits 1, and under Fly that is a restart loop
   rather than a park (`packages/runtime/README.md:569-614`, `:930-935`).
   `CLARA_ALLOW_STRANDED_BODIES=1` overrides visibly and **is not used at a release**.
3. **SIX `clara-work/vN` bundle banners**, the same six the cut's release printed. This wave adds no
   seventh and removes none; a missing banner is the defect class the cut paid for, where seven
   work-lane e2e legs failed with the misattributed message "serve child did not become ready".

Signed-in `GET /api/build-info` should agree, field for field: `git_sha` = the full sha, `frontier`
`0361_reservation_release_advice(337)`, `bodies: 60`, and the same fourteen pins.

**Also worth one look in the first sweep's log.** Two lanes ship belts that start working the moment
this image serves:

- **The retention lanes (#1046).** `[reconcile]` should report `prunedInvitePreviewAttempts` and
  `prunedConfirmationAttempts`. Against a 0348 database those are real numbers on the first sweep,
  and step 3's D-RATE-WALL-TRIGGERS reading is the backlog they work through. A `55P03` there is
  TOLERATED by name and means the sweep gave up rather than queued, which is the designed outcome;
  a `42883` means the image is running against a database below 0348.
- **`[reconcile] trace prune error:` lines.** The fix round made a contained rider fault reach the
  log and the receipt by the same two routes every other belt fault uses, so a line there is a real
  finding rather than noise.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all eight prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200.

**One signed-out surface DOES change in this release**, and it is the only one: the invite-accept
preview's rate-limited answer. Lane L7's #1095 replaced an indefinite `rate_limited` with a
wait-time notice, so a preview fetched too often now says how long to wait rather than refusing
without a horizon. Drive it only if the owner wants it driven; it needs a live invite, which wave
4's walk recorded hosted as not having.

### Signed in, per LANE: what to open and what to see

This is the release's own evidence, and it is organised by LANE because what shipped is eight lanes.
Read-only where possible; the walks that write are marked, and the owner decides whether to drive
them. Firm BELCORT, client ROME SECRETARY SDN BHD (`7a045c7f-b7c3-4cf3-b3d9-c82312e35716`) is the
session wave 4's and the cut's walks used.

| lane | surface | what to see | writes? |
|---|---|---|---|
| **L1** (#1075, #1071) | `/clients/<id>/registers?tab=accruals` | the register's side filter is a SERVER-side filter now: choosing a side re-queries rather than hiding rows, and the Amount column header names the kind it is showing rather than saying "Amount" | no |
| **L1** (#1070) | the same register, open one accrual | the detail renders the PER-PERIOD schedule, not only the side. An accrual with several periods shows each period's own amount | no |
| **L1** (#1073, #1074) | Needs-you, an accrual/bill conflict row | a THIRD remedy appears beside the two that were there: one period's own correcting entry. Driving it must net to the same ledger state as "reverse now" for that one period, which is only true because #1074 fixed what a reversal reverses | **yes**, it posts |
| **L2** (#1050) | `/settings` (firm settings), the Standing instructions card | the card is NEW. A named member of the firm can record a firm-level standing instruction and withdraw it, and the card shows who recorded it and when. This is the human whose authority a clocked prepayment plan is established under | **yes**, one instruction row |
| **L2** (#1079, #1078) | `/clients/<id>/registers?tab=prepayments`, the Prepayment accounts panel | the panel heading names BOTH purposes it administers rather than one, and an enrolled account code is now RESERVED: enrolling the same code for a fixed asset or a staff advance refuses by name | **yes**, an enrolment |
| **L3** (#1052, #1066, #1068) | a staff expense claim form | the claimant chooser reaches a SECOND enrolled account, a claimant label matches case-insensitively and with surrounding space trimmed ("Ali" matches "  ali  " and is refused against "Ali B"), and an empty allocation list focuses a real control instead of a stale field id | **yes**, a claim |
| **L3** (#1067) | the same form, a claim with an EMPTY `advance_allocations` array and a valid advance account code | it is REFUSED. Before this wave that shape skipped the whole allocation-validation block and was admitted with no existence, ownership or cap check at all | no, the refusal writes nothing |
| **L4** (#1048) | upload a payroll summary that prints no run total, then `/clients/<id>` Needs-you | either the run POSTS unattended, because the page witnessed its own completeness, or a completeness QUESTION parks with its own affordance. Both arms are the feature; which one appears depends on the page | **yes**, an upload |
| **L4** (#1059, #1060) | `/clients/<id>/bank` | the bank navigation entry carries its `tab`, and the payroll settlements section offers a REOPEN path for a settlement accepted in error | **yes**, a reopen |
| **L5** (#1056) | `/clients/<id>/documents`, a recorded payroll summary, the Revise control | a payroll fact is revisable now where only invoice fields were before, and a re-cased currency code or a respelled date still refuses `value_unchanged` and writes nothing | **yes**, a revision |
| **L5** (#1093, #1090, #1092) | `/clients/<id>/registers?tab=fixedAssets`, the depreciation-particulars proposal | the proposal read filters server-side and shows its review trail. The knowledge key and the retired-policy ground are DATABASE-side only until a successor workflow body reads them, so the proposal itself does not change yet | no |
| **L6** (#1044, #1128, #1129, #1131, #1126, #1124, #1127, #1141) | no browser surface | runtime, CI and docs. Its evidence is step 7's boot and the `[reconcile]` log, not a screen | no |
| **L7** (#1098) | `/settings` firm setup checklist on a COMMITTED plan | the TIN question is now ON the checklist and correctly marked outstanding. It still cannot be answered, which is the disclosed partial of gate 0a | no |
| **L7** (#1095, #1094) | the signed-out invite preview, fetched repeatedly | the rate-limited answer names a wait time instead of refusing indefinitely | no |
| **L8** (#1136, #1137) | no browser surface | eight agent-lane read twins and two on-behalf-of confirmations. Nothing a person can drive until a successor chat family carries the tools; the evidence is step 10's ACL reads | no |

**The cut's own walk found what this one will hit too**: on hosted this client holds no uploaded
document, no live invite and no committed firm-setup plan with the shapes some of these rows need.
The owner decides whether to upload. Without any upload, L1's three rows, L2's two, L3's two and
L7's checklist row are still drivable, and they cover the most of the wave.

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

**Run immediately after step 7** and record the timestamp. This is the step the wave changes LEAST,
and the reason is one sentence: **a wave that moves no pin and adds no body leaves the rollback
direction exactly where it found it.**

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted refresh-061a6992 index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND probe on
`refresh-061a6992`, never from the live machine. **The wave-2 window's sftp extraction stalled at
32 KB twice; stream the bundle over `ssh console` and verify it by `sha256sum` against the machine's
own.** Three gates, and the runbook must say which is demonstrated: (a) `FRONTIER_RULES`' body
rules; (b) `FRONTIER_RULES`' door-contract rules; (c) the stranded-body census. Exit 0 = ALLOWED,
1 = REFUSED, 2 = could not answer, **and 2 is never read as either of the others.**

**THE EXPECTED READING ON `refresh-061a6992` IS `ALLOWED`, EXIT 0, AND A `REFUSED` HERE IS A STOP.**
Read that sentence before running the command, because it inverts the cut's. The cut's step 9
expected, and got, a REFUSED the moment a run existed on one of its three successor bodies, and that
refusal was the correct answer for a wave that repoints pins. **This wave repoints no frozen pin and
adds no unlocked manifest entry** (`registry.ts` byte-unchanged, `347 entries / 0 UNLOCKED`, no
successor body), so the previous image carries every body any run of this build can be parked on and
declares both door contracts the applied schema requires at `0361`. There is therefore no lawful
reason for this reading to refuse.

**So if it REFUSES, stop.** Do not roll back, do not re-run it against a different roster to get a
verdict you like, and do not read it as the cut's expected outcome arriving late. A refusal means one
of three things, and the CLI names which: a body census refusal (`unsupported_body`) means the image
serving is not the one this runbook describes, because it exports a body the target does not carry;
a `frontier_requires_body` or `frontier_requires_contract` refusal means `FRONTIER_RULES` or the
target's declarations are not what the release was built against; and exit 2 means the preflight
could not answer at all, which is never read as either of the others. Report the exit code, the
refusal line verbatim and the bundle's sha256, and take the ruling outside the window.

The expectation is a MEASUREMENT rather than a prediction: gate C drove the preflight FIVE WAYS at
frontier `0361` on a fresh cluster to settle it (`reports/waveS-gates-C.md` §4).

| # | target | non-terminal runs | verdict | exit |
|---|---|---|---|---|
| **A** | the built artifact (`--target-bundle`, 60 bodies, 2 contracts) | `chatTurn_v22`, `claraWork_v6`, `statementFacts_v4` | **ALLOWED** | 0 |
| **B** | the same roster typed in (`--supported` + `--supported-contracts`, the operator path) | the same three | **ALLOWED** | 0 |
| **C** | that roster **minus `claraWork_v6`** (59), the negative control | the same three | **REFUSED (unsupported_body)**, naming `claraWork_v6` | 1 |
| **D** | the built artifact (60) | `chatTurn_v21`, `claraWork_v5`, `statementFacts_v3` | **ALLOWED** | 0 |
| **E** | the body-complete roster with **no contracts declared**, the pre-#1035 image | the same three | **REFUSED (frontier_requires_contract)**, naming both rules | 1 |

**Reading A is the REHEARSAL this step's own reading must match, and it is quoted verbatim so the
window compares against text rather than against a summary:**

```
rollback-preflight: target supports 60 body(ies) and declares 2 door contract(s) — from bundle packages/runtime/.output/server/index.mjs
  GLOBAL (the whole database — this is what the exit code follows)
    non-terminal workflow runs: 3 across 3 name(s)
      ok 1x chatTurn_v22  (workflow//./workflows/chatTurn.v22//chatTurn_v22)
      ok 1x claraWork_v6  (workflow//./workflows/claraWork.v6//claraWork_v6)
      ok 1x statementFacts_v4  (workflow//./workflows/statementFacts.v4//statementFacts_v4)
    live tasks bound to NO run: 0
    verdict: ALLOWED
  THE DATABASE'S OWN RULES (frontier vs the target's bodies AND its door contracts — global, no scope clears them)
    clara.schema_migrations frontier: 0361_reservation_release_advice
    rules checked: 0195_work_egress_purpose_and_execution_trace, 0254_intake_refusal_record, 0279_fa_closed_year_arrears
    contracts the target declares: fa_parked_run_v1, intake_refusal_record_v1
      ok  the target satisfies every rule the applied schema carries
rollback-preflight: ALLOWED — every in-flight body is carried by the target image.
```

Reading C exists so that reading A is not vacuous: drop ONE body from the same roster and the same
database at the same frontier answers `REFUSED (global)` with one refusal line naming `claraWork_v6`.
Reading B carries the CLI's own `*** UNVERIFIED SET ***` banner, which is correct and is why A rather
than B is the reading quoted. **Gate C's own conclusion is that `CUT-PLAN` §2.9's obligation does not
bind this wave**: that obligation says the previous image is a legal rollback target only until the
first non-terminal run of a newly pinned body exists, and no pin moves here. Step 9 is still run and
still recorded as a timestamped snapshot; what changes is that the snapshot is a standing reading
rather than one that degrades.

**The code block above is machine output and is reproduced byte for byte**, including its own
punctuation, because its whole purpose is that the window compares text against text.

**Why all three gates pass, each with the measurement behind it.**

- **Gate (c), the stranded-body census, cannot refuse.** `refresh-061a6992` exports the same 60
  bodies this image exports, because `registry.ts` is byte-unchanged. Gate C measured that four ways
  rather than reading the diff once (`waveS-gates-C.md` §4.0): the workflows directory and
  `runtime-contracts.mjs` diff EMPTY from `3bf6aa94d` to `d812c2124` AND from `061a6992b` to
  `3bf6aa94d`, so the hosted image's own commit carries the same roster too; `registry.ts` is
  byte-identical across the three; and the built artifact declares 60 bodies and 2 contracts.
  Whatever body a live run is parked on, both images carry it. **This is the first release in the
  programme whose step-9 snapshot does NOT expire**: the cut's degraded within minutes of serving,
  because its three successor bodies could take a run at any moment; this one has no successor body
  at all.
- **Gate (a), the frontier body rules, passes.** `FRONTIER_RULES` is a three-row table
  (`0195` requires `claraWork_v3`; `0254` requires the `intake_refusal_record_v1` contract; `0279`
  requires `fa_parked_run_v1`) and **this wave adds no row to it**: the only change to
  `packages/runtime/lib/rollback-preflight.mjs` is a single additive hunk after line 227 carrying
  #1129's two lint-shaped helpers and an empty `CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE`. Reading A
  prints the three rules by name and answers "the target satisfies every rule the applied schema
  carries".
- **Gate (b), the door-contract rules, passes.** `refresh-061a6992` is built from the cut's
  RELEASE_SHA, which declares both `intake_refusal_record_v1` and `fa_parked_run_v1` in
  `lib/runtime-contracts.mjs`, and this wave does not touch that file. Reading E is the control for
  it: strip the declarations from an otherwise body-complete roster and the same database at the
  same frontier refuses, naming both rules, and the CLI says in its own words that a door-contract
  refusal is NOT drainable.
- **The DATABASE is the part that does not roll back.** Nothing in this wave drafts a below-frontier
  rollback, and the only route is the step-3f dump, which returns no Storage bytes, no managed Auth
  config and no engine state. This matters more here than in the cut, because this wave's twenty-five
  files include a constraint swap, a backfill and two index builds, none of which a bundle rollback
  undoes. **A rollback of the IMAGE is free; a rollback of the SCHEMA is a restore.**
- **One thing a clean preflight still does not cover.** The WEB is not in the preflight's model at
  all. A promoted web at 337 against an image rolled back to `refresh-061a6992` is fine, because the
  new panels talk to PostgREST rather than to the runtime; a web rolled back to `3089d906…` against
  a 337 database is also fine, because the old panels call only doors that still exist. Both
  directions are free, and that is worth stating once rather than rediscovering.

**Which previous image is lawful at which ledger, stated plainly.**

| ledger | is `refresh-061a6992` a lawful boot target? |
|---|---|
| anywhere from 312 to 337 | **yes, unreservedly.** It exports the same 60 bodies, it calls none of the doors this wave creates, and no `FRONTIER_RULES` row moved |
| 337 with the new image having served | yes, and unlike the cut this does not degrade: no body this wave introduces can take a run, because it introduces none |
| any | no secret, no role and no relation in this wave is read by the old image |

## 10. The reads this wave owes on hosted, after the release

Run `ceremony-wS/reads-wS.mjs --post --prod --baseline scratchpad/wS/fp-wS-upg.json
--frontier-before 0323_trade_invoice_probe_self_exclusion` through the live machine's DSN. It issues
the same SQL step 3 issued, so pre and post sit side by side. It asserts:

1. the ledger reads **312 + 25 = 337** at `0361_reservation_release_advice`;
2. all twenty-five new migrations have a ledger row whose checksum equals its file;
3. the drift gate over all 337 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified. Expect **the role-level `env` lines and nothing else**.

It then runs the wave's own post reads (`--post` section (f)), lane by lane:

**The reference counts that MOVE.**

| relation | before | after |
|---|---|---|
| `clara.wake_fn_allowlist` | N | **N + 8** (six tenancy twins, two payroll/queue twins, all `interactive`) |
| `clara.trigger_taxonomy` | N | **N + 1** (`document.payroll_completeness_answered`, `ignore`) |
| `clara.onboarding_plan_items` | N | **N + (the D-BACKFILL reading)**, one `tin` item per committed firm-scope plan that lacked one |
| `clara.document_capabilities` | N | N, every row rewritten twice (`registry_version` 6 to 7 to 8) |
| `clara.firm_standing_instructions`, `clara.payroll_completeness_answers` | absent | **present and EMPTY** |
| everything else | unchanged | unchanged |

Then the questions the lanes' own headers ask of hosted:

1. **L1: the authority wall is ONE predicate.** `clara._assert_plan_authority` exists at exactly one
   row; `_obo_plan_core`, `create_accounting_plan`, `_accrual_plan_core` and `_tenancy_plan_core`
   all CALL it; the wall's own sentence lives in exactly one body. The four-argument
   `clara.list_accrual_adjustments` exists with its `clara_authenticated` grant and the
   three-argument one is dropped; `clara.reverse_plan_occurrence` carries the same grant.
2. **L2: the two relations and the two doors.** `clara.firm_standing_instructions` present, RLS
   enabled AND forced, its partial unique index built, `clara_authenticated` holding SELECT and
   nothing machine-lane; `record_firm_standing_instruction` and `withdraw_firm_standing_instruction`
   SECURITY DEFINER with `clara_authenticated` alone; the widened CHECK reading both kinds; the
   prepayment reservation verbs present.
3. **L3: the claim validator and the work reads.** `_assert_claim_basis` at its post-image,
   `get_work_claim_origin` granted to `clara_authenticated`, `list_accounting_work` carrying
   `allocation_count`.
4. **L4: the registry and the witness.** `document_capabilities` at `registry_version` 8 with the
   payroll rows at `business_operation = 'supported'`, the high-water record consistent,
   `evaluate_payroll_run_state_v1` STILL PRESENT and frozen beside the new
   `evaluate_payroll_run_state_v2`, `clara.payroll_completeness_answers` present and empty with
   `answer_payroll_completeness` granted to `clara_authenticated`.
5. **L5: the correcting door and the agent read.** `revise_document_fact` at its post-image with its
   `clara_authenticated` grant intact; `clara.fa_account_depreciation_policies` carrying
   `clara_agent_ro` SELECT and its third policy; the knowledge keys counted.
6. **L7: the backfill and the retention verbs.** Committed firm-scope plans split into those that
   now carry a `tin` item and those that do not (expect the second number to be zero); the two prune
   verbs present, SECURITY DEFINER, carrying `lock_timeout=3s` in `proconfig` and granted to
   `clara_runtime` alone; both evidence tables carrying their append-only trigger in the SAME
   posture step 3 recorded and their new `attempted_at` index; the `via_wake_kind` column comment
   carrying #1058's disclosure.
7. **L8: the twins and their cores.** Each of the eight `wake_*` twins carries exactly
   `{clara_fn_owner, clara_agent_ro}`; each `_*_core` carries `{clara_fn_owner}` and nothing else;
   the two on-behalf-of confirmations carry `{clara_fn_owner, clara_runtime}`; the human doors keep
   `clara_authenticated`; and **no `__t1136_` or `__t1137_` scaffolding function survives the file
   that made it**, which is the one read that proves the surgery cleaned up after itself.
8. **The body census, re-read.** Non-terminal runs by body, the stranded census still 0, and the
   confirmation that no body this wave introduces exists, because it introduces none.

Also re-read the quiescence census once more and record it.

## 11. The tickets

**There is no step 11a in this ceremony.** `node scripts/check-frozen-workflows.mjs --lock-deployed`
is not run, because there is nothing to lock: the manifest carries `347 entries, 0 UNLOCKED` at
RELEASE_SHA, measured, and this wave adds no entry. The cut's release locked the last thirty-five.
Confirm the reading before concluding it (`reads-wS.mjs --plan` prints it, and so does a one-line
read of `frozen-workflows.json`):

```sh
node -e "const m=require('./frozen-workflows.json'); console.log(Object.values(m.workflows).filter(e=>e.deployed!==true).length)"   # 0
```

If that is not 0 at RELEASE_SHA, stop and find out why before doing anything else, because it would
mean the tree carries a workflow module no deployed image serves and this runbook's whole rollback
argument is about a different wave.

**11b. Ticket closures with hosted evidence.** Forty-four tickets, eight lanes. The roster, with each
ticket's claimed status and the report that carries it, is in `reports/waveS-release-prep.md`.

| lane | tickets | migrations |
|---|---|---|
| L1, the plan machinery | #1051 #1080 #1074 #1073 #1075 #1070 #1071 | 0330 0331 0332 0333 0334 |
| L2, prepayment and deferred revenue | #1114 #1077 #1079 #1078 #1050 | 0335 0336 0337 0338 0361 |
| L3, staff expense claims | #1067 #1052 #1066 #1068 #1069 | 0339 0340 0341 |
| L4, payroll posting and the registry | #1061 #1059 #1060 #1048 | 0342 0343 |
| L5, documents, knowledge and the FA proposal | #1056 #1090 #1092 #1093 | 0344 0345 0346 0360 |
| L6, runtime, rollback safety and CI | #1044 #1128 #1129 #1131 #1126 #1124 #1127 #1141 | none |
| L7, hygiene, retention and disclosure | #1047 #1098 #1046 #1132 #1096 #1099 #1094 #1095 #1058 | 0347 0348 0349 0350 |
| L8, the agent-lane twins | #1136 #1137 | 0352 0353 |

Read each ticket's real title with `gh issue view <n>` before commenting. Comment shape, unchanged
from the eight prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`, release
session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail notice
text, and, where the acceptance criterion named a hosted behaviour, the specific reading step 7, 8
or 10 produced. Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane
comment above, hosted evidence here."*

**Three closures are not plain DONE and must say so**: #1098 (AC1's second half PARTIAL and
disclosed), #1060 (the narrowed half only, its second half dormant by the ticket's own words), and
#1136 and #1137 (the DATABASE half, which is the whole of the lane's ruled scope; the chat tools are
the next cut family's).

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback
command, and the fact that this release moves no pin so the step-9 snapshot does not expire.

**Still owed after this release, and not part of it:** the successor contracts
`reports/waveS-merge.md` §11 lists (#1048's two payroll witness fields for `payrollFacts_v2`;
#1093's, #1090's and #1092's three halves of one `loadFaProposalInputsStepV6`-shaped edit, which
must land as `claraWork_v7`'s own step because v6 is deploy-locked; #1073's third-remedy tool;
#1114's and #1077's two wrong lines in `CUT-PLAN.md` §A8 and §A9; #1050's web contract); the other
half of 0353's follow-up 1 (folding `clara._tenancy_plan_core` into `clara._obo_plan_core`); the 22
runtime cells of §16.1 that need a provisioned Workflow DevKit schema; and the blueprint pin drift
in `docs/ARCHITECTURE.md:171, :183, :207, :445`, which has been wrong since the 2026-09-15 cut and is
a wayfinder session's, not a lane's.

---

## The preflight, dry run

Migrations directory and `CLARA_REPO`: `clara-wt/int2` at `d812c2124`. Every negative control acted
on a COPY of the migrations directory or a COPY of an exported fingerprint. Databases:
`127.0.0.1:55742`, the merger's own cluster, read-only.

| run | target | verdict |
|---|---|---|
| `--plan` | no database | **exit 0, 0 GAP.** 25 pending, 337 files, 175 pins (156 measurable / 19 chained), 13 hand checks, 2 relations created, 0 roles minted, the registry reading `bodies=60 … 347 entries, 0 UNLOCKED, SUCCESSOR BODIES (none)` |
| `--plan` with `CLARA_REPO` at the MAIN checkout | no database | the SAME registry line and the SAME manifest counts, which is what "this wave moves no pin" means in a form that can be checked |
| pre-window + `--baseline fp-wS-pre.json` | `clara_l02`, the pristine template (312 / 0323, `C.UTF-8`) | **13 ok, 2 STOP.** 11356 keys compared, **11356 equal, 0 env**; **145 of 145** measurable pins admitted; all thirteen hand checks ok. The two STOPs are the run census and the check derived from it |
| `--post` + `--baseline fp-wS-post.json` | `clara_intS6`, the merger's ordered chain (337 / 0361, `C.UTF-8`) | ledger **312 + 25 = 337 at 0361**, twenty-five rows at their file checksums, drift 337/337, fingerprint **11457 keys, 11457 equal, 0 env**, every (f) read answered. Same two run-census STOPs |
| `--census` | `clara_intS6` | the body census, the manifest check and the quiescence census alone, which is what step 6b re-reads with the machine stopped |

**THE TWO FINGERPRINTS, recorded here so the window compares against a known artefact.**

| fingerprint | source | ledger | structural keys | reference counts | sha256 of the file |
|---|---|---|---|---|---|
| **PRE** `fp-wS-pre.json` | `clara_l02`, the pristine template the whole wave was replayed from, never written to | 312 / `0323_trade_invoice_probe_self_exclusion` | **11356** | 57 | `c553a30395dad185efde1e519e386db65d640d92261069f72ee4c95cb05a2db6` |
| **POST** `fp-wS-post.json` | `clara_intS6`, the ordered chain of all eight lanes | 337 / `0361_reservation_release_advice` | **11457** | 57 | `fa174f264143bbbeca413bb996a5b4a7e4cfd3ac32d030ad18cd726cbb7ae37a` |

The wave adds **101 structural keys** and no reference relation. Both were taken at `C.UTF-8`; an
`en_US.UTF-8` cross-collation reading is owed and is named under "What this draft could not verify".
**Neither is the baseline the window uses.** A hosted-shaped baseline must be exported from a
database at the hosted frontier by the SAME script and the SAME tree, and the two above are the
release-preparation worker's dry-run artefacts, not the gate worker's.

**The POST fingerprint is not an artefact of the merger's four replays**, and that is gate A's doing
rather than this worker's: `waveS-gates-A.md` §3 crossed `clara_intS6` against a from-scratch 337-file
chain on its own cluster in seven censuses, including 1540 function bodies by `sha256(prosrc)`, and
every one diffs 0. So the database this fingerprint was taken from is the same database a fresh
apply produces.

### Negative controls

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | one measurable pin's literal corrupted in a COPY (0330's `_authority_ref_refusal`) | `STOP PIN`, both sides, **144 of 145**, naming the arm and the recipe |
| 3 | an applied file's bytes changed in a COPY | 2 STOPs: `312 applied vs 313 file(s)` and the pending-set arithmetic |
| 4 | `--post` against the un-upgraded template | STOPs on the arithmetic and on twenty-five `no ledger row` lines |
| 5 | a bytea-recipe pin re-pointed at a body that carries a backslash (0346, on a COPY) | `STOP PIN … [scalar, recipe bytea]` plus the named **`RECIPE`** line: the file "would abort with 22P02 `invalid input syntax for type bytea` before it edited anything" |
| 6 | a baseline value corrupted on an object a pending file PINS | `STOP DRIFT (PINNED by 0330…, 0331…, 0338…)`, naming all three |
| 7 | the same corruption on an object no pending file names | `STOP DRIFT`, unqualified |
| 8 | `CLARA_REPO` pointed at a tree with no `registry.ts` | in `--plan` the registry section says so by name; against a database the script fails at module resolution on `packages/db/lib/pg.mjs`, which is loud rather than silent |

Control 5 is the one worth reading twice: it is the integration merge's own finding (`waveS-merge.md`
§14.2, finding 3) turned into a check that fires before a window rather than inside one.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the role
  census, the run census, the machine and web ids, the backfill size and the two evidence tables'
  row counts are taken from `RELEASE-WC-RUNBOOK.md` § RESULTS, the migration files and the rigs; none
  is read from hosted.
- **RELEASE_SHA does not exist yet.** The sweep-wave PR is unopened and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `d812c2124`, the
  integrated head.
- **`D-ROLE-REACH`'s `clara_authenticated` half.** Every rig here runs the migration as a superuser,
  so the check has only ever returned `superuser=true`. The cut's window answered the
  `clara_fn_owner` half for hosted; whether the hosted migrating role can `set_config('role',
  'clara_authenticated')` is unread until step 3, and it is what 0341's §TAIL needs.
- **The body census against a LANE rig.** None of the lane databases carries a provisioned Workflow
  DevKit World, so `workflow.workflow_runs` is absent on all seven and the preflight's census fails
  closed there. The SQL is the runtime's own, mirrored rather than imported. Gate C did provision the
  schema on its own cluster and drove the preflight five ways against it, so the SHAPE is exercised;
  what remains unexercised is this script's own census statements against a database carrying rows.
- **The backfill's hosted size.** `D-BACKFILL-ONBOARDING-PLAN-ITEMS` reads 0 on the template because
  no rig carries a committed firm-scope plan. Hosted may carry several, and the number is unread
  until step 3.
- **The two index builds' hosted cost.** Both evidence tables hold 0 rows on the template. Hosted has
  been serving an auth wall since 2026-09-14, so its counts are the ones that decide whether those
  builds are instant or merely quick, and `55P03` is a live branch either way.
- **An `en_US.UTF-8` replay.** Both fingerprints above were taken at `C.UTF-8`. The cut measured the
  cross-collation reading in both directions and found it irrelevant by construction for body pins;
  this wave pins no content digest either, but that is reasoned here rather than measured.
- **The web `next build`.** Green typecheck, a green 5249-test unit suite and five green browser
  walks at the integration head, but no full `apps/web` build (`reports/waveS-merge.md` §18 item 3).
  Step 5 is the first one.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.

Two items this draft carried as owed are now MEASURED and are struck rather than left standing: the
two-build cutover drill, which gate C ran ALL PASS across three legs in 84 s with #1131's new
contract-rule assertions driven, and the 22 lane-L6 runtime cells, which gate C ran green on a
provisioned Workflow DevKit schema.

---

## § RESULTS (as run, 2026-09-25, UTC)

**Authority.** The owner's riders plan of 2026-09-20 (each wave ends with its hosted release and the
tickets close on hosted evidence), the release-ownership ruling of 2026-09-17, and the beta ruling
that hosted users and data are test data (#826, 2026-09-15, carried in `ARCHITECTURE.md` §5.F).
"Owner says go" is gate 0a's own checklist item; no separate go/no-go capture exists among this
window's named logs, so it is recorded here as asserted by the checklist rather than independently
verified.

**Gates 0a.** `main` = RELEASE_SHA = `322fdf29105c76132ec874dd70a7d3e24c5453e4` (PR #1143, merge of
`integration/riders-sweep`), tree clean at RELEASE_SHA (`prep.log`). `--plan` gate exit=0: 25 pending
files, frozen manifest **347 entries, 0 UNLOCKED (deployed:false)**, matching main's own reading and
unchanged at every later read in this window (pre-window, post-window: still 347/0). Registry-view
cell: **# pass 7 # fail 0**. This wave moves no frozen pin and adds no manifest entry, confirmed
three times (`prep.log`'s `--plan` gate, `reads-pre.log`, `reads-post.log`). The two readings gate 0a
asked for before the window both came back clean: **D-CHECK-SWAP** (0338) found hosted's
`accounting_plans_authority_kind_check` at `CHECK ((authority_kind = 'explicit_instruction'::text))`
with 0 rows on `clara.accounting_plans`, 0 of them outside the new list, so the constraint swap is a
widening with nothing to fail on; **D-BACKFILL-ONBOARDING-PLAN-ITEMS** (#1098's ticket, 0347) found 0
committed firm-scope onboarding plans on hosted, so the backfill's own read is 0 rows before the
window is even open (confirmed again after, see Step 10). **D-ROLE-REACH's `clara_authenticated`
half** (the one check no rig could ever answer) read `current_user=postgres`, not a superuser, but
`clara_authenticated exists=true MEMBER=true USAGE=true` alongside `clara_fn_owner`'s already-known
membership, so hosted's migrating role can become both roles this wave asks for (`reads-pre.log`).
**The web rollback lever's own pre-window dry-redeploy of `3089d906-…@100%` is not captured as a
separate log among this window's artifacts**; `web-promote.log`'s pre-promote listing (`Version(s):
(100%) 3089d906-5bae-48cb-9666-72dff5aa8ef4`, tag `refresh-061a6992`) is the only confirmation
available, taken at step 8 rather than at gate 0a. Step 1's `fly auth whoami` is likewise not
captured as its own log; every fly call across this window (`probe-create.log`, `step7.log`,
`web-promote.log`) succeeded under one session and `step7.log` reads exactly one machine before and
after.

**Step 1.** Not separately logged this window (see Gates 0a).

**Step 2.** Probe `8917edb6625118` created on `refresh-061a6992`
(`registry.fly.io/clara-runtime:refresh-061a6992@sha256:11f5fb843d6bb695a9b010c09ab413725200dccbb86bff6056922b4b37f59975`,
265 MB), state `created` then started (`probe-create.log`).

**Step 3, pre-window reads (14:57:30Z to 14:57:55Z, `reads-wS.mjs --prod --baseline
scratchpad/wS/fp-wS-hosted.json`).** Server `db=postgres port=5432`, PostgreSQL 17.6,
`en_US.UTF-8`. Ledger **312 / `0323_trade_invoice_probe_self_exclusion`**, drift gate 312/312,
pending set exactly the 25 files above the frontier, 0 PARSE GAP; the script wrote
`ceremony-wS/reads-wS.state.json` for `--post` to re-derive the arithmetic. Estate fingerprint vs the
rig baseline: **11365 keys compared, 11349 equal, 16 env lines**, all the same role-level
Supabase-managed facts waves 2 to 4 and the cut met (no seventeenth). **Body-pin ledger: 145 of 145
measurable pins at a value their own file admits, 0 GAP**; 19 pins CHAIN-INTERNAL (an earlier pending
file produces the body), 11 NEWBORN; 11 of the 145 are BIMODAL and 7 are measured under the
`sha256(prosrc::bytea)` recipe (0345, 0346) rather than `convert_to(...,'UTF8')`, both recipes agreeing
on every body read this window (no backslash hazard hit). The thirteen hand checks: **all ok**,
including **D-WAVE-MINTED-NAMES** (29 new names, 1 recut blind: `_prepayment_plan_core`),
**D-CAPABILITY-REGISTRY** (live `registry_version` 6 across 240 rows, 12 `payroll_summary`, both
below 0342's and 0343's stamps of 7 and 8), **D-RATE-WALL-TRIGGERS** (both append-only triggers `[O]`,
row counts `clara.invite_preview_attempts=1`, `clara.confirmation_attempts=4`), **D-WAKE-ALLOWLIST**
(none of the 8 rows present; allowlist would go 106 → 114), **D-MACHINE-LANE-GRANTS** (21 `clara%`
roles present, none of the 13 targets already holds the grant it is about to receive), and
**D-SPLICE-ANCHORS** (all 5 anchors matched). The body census: 0 non-terminal `workflow_runs`, 0
stranded, no successor body introduced (this wave moves no pin). Quiescence census: no F10 holder, no
lock on any of the nineteen watched relations, the `statement_facts running` row the same known orphan
since 2026-09-19, 0 non-terminal `accounting_work`. **Verdict CLEAN.**

**Step 3f, backup (14:57:55Z to 14:59:02Z).** Full dump
`packages/db/backups/clara-clara-graphile-worker-workflow-workflow-drizzle-2026-09-25T14-58-04-276Z.sql`
= **221,258,058 bytes**, plus globals
`clara-globals-2026-09-25T14-59-01-185Z.sql` (byte count not printed by this wrapper, consistent with
every prior wave's own record). Run under WSL's own node, through the pooler CA-path workaround.

**Steps 4 and 5, before the window.** Runtime image
`registry.fly.io/clara-runtime:refresh-322fdf29` =
`sha256:20ab8c8352fd4372f1c8a6f50f2f163f742e92c65c7fa6dc1f227435a608344f` (265 MB), built 14:55:54Z to
14:58:27Z from a detached checkout at RELEASE_SHA (`prep.log`, `image-build.log`). The build log
carries three benign `ERROR failed to read input source map` lines from third-party
`@ai-sdk/openai`/`@ai-sdk/gateway`/`@ai-sdk/provider-utils` packages missing their own `.js.map`
files; the build still exited 0 and pushed the manifest, so this reads as pre-existing dependency
noise rather than a build defect. Web Worker version `fa2c6c0b-474c-40dc-9f6e-5064a2488a47`, tag
`refresh-322fdf29`, built at `HEAD=322fdf29105c76132ec874dd70a7d3e24c5453e4`, `porcelain=[]`, uploaded
14:57:40Z (`web-build.log`, `web-promote.log`'s own `Created:` stamp), not promoted.

**Step 6, the window.** 6a: `machine stop 48ee715b763048` 14:59:17Z, `stopping` 14:59:20Z, `stopped`
14:59:25Z. 6b: census through the probe (14:59:25Z, `census-6b.log`): **CLEAN**: no F10 holder, no
lock on any of the nineteen watched relations, 0 non-terminal `workflow_runs`, the
`document_processing_tasks` `statement_facts running` row the same known orphan, 12 idle
`clara_runtime_login` sessions. 6c: `migrate.mjs` through the probe DSN, 14:59:31Z to 15:01:22Z
(1 min 51 s): **`migrate: 25 new migration(s) applied · 337 total`**, all 25 files on their FIRST-APPLY
branch, every prestate and tail notice OK, no CLR, no lock wait, no `55P03`, no `42501`, no `22P02`.
The notices worth naming: 0330 to 0334 (L1) all FIRST APPLY with `_authority_ref_refusal`
byte-identical to its #977 pre-image; 0338 (L2) 3 FIRST/0 REDO, `_obo_plan_core` explicitly
`FIRST(0330/#1051)`, confirming the cross-lane chain; 0341's `clara_authenticated` tail applied
cleanly, confirming Step 3's D-ROLE-REACH reading held live; 0344 (L5) `revise_document_fact` FIRST
from its 0321 pre-image; 0347 (#1098) planted **0 tin item(s)** (0 committed firm-scope plans
existed); 0352 (L8, #1136) 17 row kind(s) each projected once, matching lane L4's seventeenth row
kind; 0360 (L5's fix round) both bimodal pins spliced clean
(`_payroll_posting_verdict` `378086068b… → 4c350623e4…`, `revise_document_fact` `4b9a264d57… →
279e4b818c…`); 0361 4 FIRST/0 REDO. 6d: ledger **337 / `0361_reservation_release_advice`**: branch
(ii), drive forward.

**Post reads (15:01:22Z to 15:01:33Z, `reads-wS.mjs --post --prod --baseline
scratchpad/wS/fp-wS-upg.json`).** Ledger 312 + 25 = 337 at 0361, all 25 new rows at their file
checksum, drift gate 337/337 clean. Fingerprint vs the UPGRADED baseline: **11466 keys, 11450 equal,
16 env lines** (same set, nothing else). Section (f), read through the probe while the machine was
still stopped: the two new relations (`firm_standing_instructions`, `payroll_completeness_answers`)
present, RLS enabled AND forced, 0 rows each; the 8 wake-allowlist rows present, allowlist now 114;
the 12 EXECUTE grants and 1 SELECT grant each at exactly the ACL the runbook specified (twin =
`{clara_fn_owner, clara_agent_ro}` or `{clara_fn_owner, clara_runtime}`, core = `{clara_fn_owner}`
alone); L1's authority wall at one predicate, `_assert_plan_authority` reachable by nobody
(`false | true`); L2's widened CHECK reading `ANY (ARRAY['explicit_instruction',
'standing_instruction'])` with 0 live plans outside it; L3's claim validator and work reads at their
post-images; L4's registry at `registry_version 8` across 240 rows (6 `stored_only` / 6 `supported`
payroll pairs), high-water record `8 | 1 | 240` consistent; L7's two prune verbs SECURITY DEFINER,
`lock_timeout=3s`, granted to `clara_runtime` alone; L8's 49 signatures all at their expected owner
and posture, the 8 model-lane twins each carrying `clara_agent_ro` and nothing beyond, and **no
`__t1136_`/`__t1137_` scaffolding survives** (0 rows). **One read failed rather than answered: L5's
knowledge-key/agent-read query (#1090, #1092) returned `42703` (`undefined_column`)**: the script's
own SQL references `clara.knowledge_keys.retired_at`, a column that does not exist on that relation,
so the whole combined read aborted and printed the Postgres error code instead of a count. The
correct knowledge-keys figure is recoverable from the separate reference-count read below (15, up
from 14) and from 0345's own migrate notice ("the catalog now holds 15 keys"), but the runbook's own
promise to have this "counted" in section (f) is unmet as written; `reads-wS.mjs` needs a fix (drop
`retired_at` from that query, or add the column if one was intended) before its next use. Body
census and quiescence census: unchanged from pre-window (0 non-terminal, 0 stranded, same orphan row);
runtime sessions read `(none)` because the machine was still stopped at read time. **Verdict CLEAN.**

**Step 7.** Probe destroyed 15:01:50Z (`machines: 1` after). `fly deploy --image …@sha256:20ab8c83…`
15:01:55Z to 15:02:39Z (reached `stopped`); `machine start` 15:02:40Z; `/ready` 200 at 15:03:00Z.
**Outage: 14:59:17Z to 15:03:00Z, 3 min 43 s** (14:59:25Z stopped to 15:03:00Z ready, 3 min 35 s of
that without a runtime). Boot line: `serving git_sha=322fdf29105c76132ec874dd70a7d3e24c5453e4
frontier=0361_reservation_release_advice(337) bodies=60 pins closeExample=closeExampleV1
chatTurn=chatTurn_v22 claraWork=claraWork_v6 documentIngest=documentIngest_v2
invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4 witnessFacts=witnessFacts_v3
payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1 autoDraft=autoDraft_v10 …`; **the log
capture itself cuts off after ten of the fourteen pins** (`step7.log`'s boot line is 403 characters
and ends mid-list). The four missing from the capture (`firmInterview`, `clientOnboarding`,
`bankAgent`, `closePrep`) are not independently confirmed by this line, but both `reads-pre.log` and
`reads-post.log` print the identical, complete 14-pin string derived from the same unchanged
`registry.ts`, which is the corroboration available. **`frontier` MOVED and `bodies` DID NOT**
(`bodies=60`, unchanged); `stranded bodies n=0` printed BEFORE `durable world started pid=644`; SIX
`clara-work/v1..v6` bundle banners, v6 digest
`e716d9b046d60052b579d2b6a4f69ce72407393b4ff259a391e479d8f2fca0a5` (matches the merger's measured
digest); `CONTROL listening`; `LEADER acquired`. `/ready` pools: `runtime`, `read`, `write`,
`freeform`, `stripe_webhook`, `auth_wall`, `invite_preview` all `ok:true`; `bank` skipped
(`dsn_not_configured`, expected).

**Step 8.** `wrangler versions deploy fa2c6c0b-…@100%` 15:03:31Z to 15:03:38Z (previous
`3089d906-5bae-48cb-9666-72dff5aa8ef4`, tag `refresh-061a6992`). Signed-out smoke: `/login`,
`/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=…`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`; cross-origin
POST `/auth/confirm/resend` 403; runtime `/ready` 200, **exact match to the expected roster**.
Signed-in per-lane walks: **NOT done in this window** (no operator browser session captured among
this window's logs); the owner's next check is the lane table in section 8 of the draft, with L1's
three rows, L2's two, L3's two and L7's checklist row drivable without any client upload.

**Step 9, rollback preflight demonstration (second probe `e8207e3b226568` on `refresh-061a6992`,
bundle streamed over `ssh console`).** Probe created 15:04:10Z; bundle streamed, 11,754,677 bytes,
sha256 `1ded5130a87a06e09f49fe495c577722caae75e5f43de935120ec3cfa4d2b37b` verified equal on both sides
(the probe's own file and the streamed copy). Run through the **live machine's DSN**, per the
runbook. **Gate (a)** (`FRONTIER_RULES` body rules) and **gate (b)** (door-contract rules): both
satisfied: `clara.schema_migrations frontier: 0361_reservation_release_advice`, rules checked
`0195_work_egress_purpose_and_execution_trace`, `0254_intake_refusal_record`,
`0279_fa_closed_year_arrears`, contracts declared `fa_parked_run_v1`, `intake_refusal_record_v1`,
"the target satisfies every rule the applied schema carries." **Gate (c)** (stranded-body census):
hosted read **0 non-terminal workflow runs across 0 names** at this moment, a lighter reading than
gate C's synthetic 3-across-3 rehearsal quoted in the draft, but the verdict is the same and for the
same reason: `refresh-061a6992` exports the identical 60-body roster, so the census is vacuously
satisfied either way. **Verdict ALLOWED at 15:04:10Z-15:05:08Z** (`rollback-preflight.log`,
`bba79km95.output`, byte-for-byte matching output). Probe destroyed 15:05:08Z, one machine left.
Consistent with the draft's own conclusion: this snapshot does not degrade with time, because no pin
moves and no successor body exists.

**Step 10.** Covered by the post reads above (15:01:22Z-15:01:33Z, machine still stopped, DSN via the
probe): ledger 312 + 25 = 337 at 0361, drift gate over all 337 rows, fingerprint vs the UPGRADED
baseline unchanged at 16 env lines. **The reference counts that moved**: `clara.wake_fn_allowlist`
106 → **114** (the 8 rows named in the draft, all `interactive`); `clara.trigger_taxonomy` 156 →
**157** (`document.payroll_completeness_answered`); `clara.knowledge_keys` 14 → **15** (0345's one
`depreciation_policy` row). **The draft's own "reference counts that MOVE" table omitted this
relation, even though L5's own prose promised to count it**; add it to that table before this
runbook's next re-derivation. `clara.onboarding_plan_items` unchanged at 29 (0 committed firm-scope
plans existed, so 0347's backfill wrote nothing, confirmed twice, pre-window and again in section
(f)'s dedicated L7 read: `0 | 0 | 0`); `clara.document_capabilities` unchanged at 240 rows, every row
rewritten twice (`registry_version` 6 → 7 → 8); the two new relations present and empty.
**One pair of counts moved that the draft did not anticipate, and the migrate log explains it**:
`clara.confirmation_attempts` read 4 pre-window and **0** post-migrate; `clara.invite_preview_attempts`
read 1 pre-window and **0** post-migrate. 0348's own apply step (the file's lines 394 to 395) runs the two
retention verbs once as the retention's first sweep, `prune_confirmation_attempts(now() - interval '2 hours')`
and `prune_invite_preview_attempts(now() - interval '2 hours')`, and its notice in `migrate.log` records
`attempts_deleted: 4` and `attempts_deleted: 1` with `pruned_before 2026-09-25T13:00:55Z` and
`trigger_posture: O` (the append-only trigger disabled for the sweep and restored, which is why both
triggers still read `[O]`/enabled afterwards). The five rows were rate-wall evidence older than the
wall's own 15-minute window, so nothing the wall reads was lost; the draft's step 3c named the index
builds on these relations but not the first sweep, which is a gap in the draft, not in the file.
The eight lane questions (L1's one-predicate wall, L2's two relations and two doors, L3's claim
validator and work reads, L4's registry and witness, L5's correcting door (its own knowledge-key
half unmeasured per the 42703 finding above), L7's backfill and retention verbs, L8's twins and cores)
all read exactly as expected in section (f) of `reads-post.log`, except that one gap. Quiescence
census re-read clean.

**Step 11.** No step 11a in this ceremony: `frozen-workflows.json` reads 347 entries, 0 still
UNLOCKED, confirmed identically at plan-time, pre-window and post-window (`prep.log`, `reads-pre.log`,
`reads-post.log`); this wave adds no manifest entry, so there is nothing to lock. Tickets: see
`reports/waveS-closures.md`.

**Deviations from the draft.** The migrate ran in 1 min 51 s for 25 files, close to wave 4's 1 min
33 s for 21 and the cut's 22 s for 3, proportionate to file count. Three findings the draft could not
have anticipated: (1) the post-migrate section (f) read for L5's knowledge-key/agent-read question
(#1090, #1092) errored `42703 undefined_column` on a `retired_at` column that does not exist on
`clara.knowledge_keys`, so that question is unmeasured as written even though the correct count (15)
is recoverable from elsewhere in the same read; (2) `clara.confirmation_attempts` and
`clara.invite_preview_attempts` read 4 and 1 rows before the window and 0 and 0 after: 0348's own
first retention sweep, disclosed in its apply notice (`attempts_deleted` 4 and 1, threshold
`now() - 2 hours`), which the draft's step 3c had not named; (3) `step7.log`'s own boot-line capture truncates after
ten of the fourteen pins (a capture-length artefact, not a boot defect: `bodies=60` and the ten
visible pins are unmoved, and the full 14-pin string is corroborated identically by both the pre- and
post-window reads of the unchanged `registry.ts`). Everything else read exactly as the draft
predicted: the ledger arithmetic (`312 + 25 = 337`), the 0338 constraint widening (0 rows affected),
the 0347 backfill (0 rows, 0 committed firm-scope plans), the D-ROLE-REACH `clara_authenticated`
reading (both memberships true), the frozen-manifest reading (347/0 unchanged, no step 11a), and
step 9's rollback preflight (ALLOWED, matching the draft's own inverted expectation from the cut).
The one thing genuinely not done in the window, disclosed rather than hidden: step 8's signed-in
per-lane walks, which need the owner's own browser session and are the owner's next check.
