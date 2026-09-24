# Hosted release ceremony, riders wave 4: migrations 0295...0318 + runtime image + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on `RELEASE-W3-RUNBOOK.md` and on
its `§ RESULTS (as run, 2026-09-23, UTC)`, whose lessons are folded in rather than repeated: the
via-probe wrapper, streaming a bundle over `ssh console` instead of sftp, and the role-level
fingerprint overrule (built into the script since wave 3, section 3b).

RELEASE_SHA = **`________`** (the merge commit of the wave-4 PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\int2` (branch `integration/riders-w4`, head **`fb1dae78a`, the FINAL
integration head**, all seven lanes merged) carries **309** files under `packages/db/migrations/`,
highest version `0318_knowledge_fye_pair_applicability`. Hosted is at **288 /
`0293_fa_arrears_judgement_scope`** (`RELEASE-W3-RUNBOOK.md` § RESULTS, 2026-09-23; re-read live at
step 3). So the migrate step should report

```
migrate: 21 new migration(s) applied · 309 total
```

309 is the FILE count (`packages/db/scripts/migrate.mjs` prints `migrations.length`); `0318` is only
the highest version NUMBER. The pre-existing gaps at 0032, 0073...0076, 0294 and 0312...0314 are why
the two differ. **0294 and 0312...0314 were reserved by the plan and never used**, which is lawful:
the runner does not ask for gapless numbering. Re-derive this against whatever `main` and the hosted
ledger actually are at window time: the preflight script prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-W3-RUNBOOK.md` § RESULTS; re-read live at step 3):
DB **288 / `0293_fa_arrears_judgement_scope`**. Runtime image **`refresh-46cf7c85`** =
`registry.fly.io/clara-runtime@sha256:a6beb66f3ae657764c83cbf1243c1229483f563ddf75a3f1fc925791ec5c2a1b`
(265 MB, measured boot `bodies=55`, pins `closeExample=closeExampleV1` / `chatTurn_v21` /
`claraWork_v5` / `clientOnboarding_v5`), single Fly machine **`48ee715b763048`** (never touched
directly; exactly two calls all window, `stop` and `start`). Web
**`b659a3d4-a253-4f49-8a7e-c89306f6ab82`** (tag `refresh-46cf7c85`, 100% since 2026-09-23 17:08:22Z;
the one before it is `686ab53f-4079-4305-8d0b-54efac86adc0`).

**Secrets rule (unchanged from all six prior runbooks).** The fly token and the DSN are substituted
INLINE inside one pipeline only: never assigned to a shell variable, never echoed, never in argv.
Reuse the wave-2/3 wrapper shape:

```
# C:\Users\zhant\AppData\Local\Temp\claude\...\scratchpad\release-w4\via-probe.sh
PROBE=<probe machine id> via-probe.sh <command...>
#   fly ssh console --app clara-runtime --machine $PROBE -C "printenv WORKFLOW_POSTGRES_URL" \
#     | tr -d '\r\n' | node scripts/ops/dsn-pipe.mjs -- "$@"
# run from the RELEASE_SHA checkout, with CLARA_REPO and CLARA_MIGRATIONS_DIR pointed at it
```

Copy it into this wave's own scratchpad and re-point `REPO`. Every `flyctl` below is shorthand for
`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>`.
From Git Bash a `wsl` argument that is a `/mnt/c` path needs `MSYS_NO_PATHCONV=1`, and
`wsl -- bash -c '...$VAR...'` expands `$VAR` in the OUTER shell, so single-quote it. **`fly ssh
console` has exited 1 with "The handle is invalid." after streaming on this Windows host, and the
wave-2 window's sftp extraction stalled at 32 KB twice: verify any streamed artefact by `sha256sum`
against the machine's own, never by exit code alone.**

**One thing about this wave is NEW and is a step rather than a caveat: #871's migration 0309 mints a
role pair NOLOGIN and password-less, and the credential that makes the signed-out invite preview
work is an OUT-OF-BAND OPERATOR CEREMONY.** It is step 6e below, and it is the only step in seven
ceremonies that asks the operator to type a password.

---

## 0. Rehearsal: the 0293 -> 0318 UPGRADE replay, measured

**OWED, NOT DONE.** This draft was written by the release-preparation worker, who has no authority
to run a from-scratch or upgrade chain on the gate cluster. What exists instead:

- The integrator's own from-scratch chain, `clara_w4int` on `rigw4` (127.0.0.1:55700), reported
  `303 new migration(s) applied · 303 total` on its FIRST run with every wave-4 file on its
  FIRST-apply branch. That run predates BOTH the `0317`/`0318` renumber and lane 04, so its ledger
  is stale by construction and **must not be read forward**. The merge record says so in its own
  words and the preflight proves it: run 12 of the negative-control table in `ceremony-w4/README.md`
  is `--post` against that database, and it STOPs with `the ledger reads 288 + 21 = 309 at 0318`.
- The gate worker owes a fresh chain on a dropped-and-recreated `clara_w4int` at the FINAL head.

So, before the window, the gate worker or the orchestrator must:

1. **Clone the hosted-shaped database and replay the 21.** `clara_w4_hosted` on `rigw4h`
   (127.0.0.1:55701) is at 288 / 0293, seeded, with `my_sme_starter` v1 published, the two 0156
   society overrides present and ONE client adopted v1 through the real doors. Clone it with
   `createdb -T` (the source must have zero open connections; retry if refused, never terminate a
   session) and run `migrate.mjs` from the RELEASE_SHA directory. Expect
   **`21 new migration(s) applied · 309 total`**. Time it: that number is step 6c's budget.
2. **Export the post-release fingerprint baseline from the UPGRADED clone**, and the pre-window
   baseline from `clara_w4_hosted` itself. Both exports must come from the SAME script
   (`ceremony-w4/reads-w4.mjs --export-fingerprint`) and the same tree.
3. **Run the replay on `clara_w4_coll` too** (`rigw4c`, 127.0.0.1:55702, the same estate at
   `en_US.UTF-8`). Hosted Supabase is `en_US.UTF-8` and every rig here is `C.UTF-8`; 0295's prestate
   is the file in this wave that a collation difference can reach, and CI run 35954298990 is the
   measured proof that it can (see section 3c, `D-CHART-V1`). **A replay that passes only on
   `C.UTF-8` has not proved the thing hosted needs proved.**

A rehearsal on a seeded cluster proves DDL and guard logic, **not** the row-shaped hazards. Those
are answered only by step 3's reads against hosted. This wave's row-shaped hazards are enumerated
in step 3c.

## 0a. Gates before any production step

- `main` = RELEASE_SHA, `ci` SUCCESS on that sha, the build tree equal to RELEASE_SHA, `git status
  --porcelain` empty apart from the untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time, never a literal written before.
- **Owner says go**, in-session, for this specific window.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F):
  hosted users and data are test data. Confirm it is still true before treating any parked run as
  disposable.
- **DB RESTORE POINT**: step 3f. Take it before the first hosted write; re-take it if the window
  opens more than about 2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery").
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` to confirm the active version is `b659a3d4-a253-4f49-8a7e-c89306f6ab82` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy b659a3d4-a253-4f49-8a7e-c89306f6ab82@100% --yes`.
- **TWO FROZEN BODIES ARE ADDED IN THIS WAVE, AND THAT CHANGES THE BOOT LINE.** Unlike wave 3,
  which changed no frozen body at all, lane 01 adds two whole frozen workflow FAMILIES:
  `payrollFacts.v1` (#945) and `agreementFacts.v1` (#948), five files each. On the integration head
  `node scripts/check-frozen-workflows.mjs` reports **`OK - 322 frozen file(s) ... 57 "use
  workflow" module(s) all frozen+registered; 3 retired entr(ies)`**, against main's `312 / 55 / 3`.
  Diffed entry by entry by the merger: **20 entries added, 0 removed, 0 changed. No frozen body
  moved.** So step 11a's `--lock-deployed` DOES have something to lock this time, `bodies=` moves
  from 55 to **57**, and the pins list gains two entries. Confirm the counts on RELEASE_SHA before
  the window; the numbers above are the integration head's, not RELEASE_SHA's.
- **THE REGISTRY-ROSTER BLOCKER IS CLOSED. Re-check it at RELEASE_SHA anyway, because it is what
  makes step 7's boot line readable.** On the interim heads `89e0a408f` and `bb102839c`,
  `packages/runtime/workflows/registry.ts` dispatched `agreementFacts: agreementFacts_v1` while the
  identifier was MISSING from `workflowBodies`, from `workflowPins` and from the file's own
  `export { … }` roster, and the repo's own guard failed on it (`node --test
  packages/runtime/tests/registry-view.test.mjs`, 6 of 7). On the final head `fb1dae78a` the
  identifier is present at all three sites and that test reads **7 tests, 7 pass, 0 fail**. So the
  boot line's `bodies=57` and its FOURTEEN pins are now what the image will actually print. The
  one command that proves it:

  ```
  node --test packages/runtime/tests/registry-view.test.mjs     # expect 7/7
  ```

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-46cf7c85 --app clara-runtime \
      --name probe-w4 --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy. Step 9 needs a SECOND probe on the same serving image.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-w4/reads-w4.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs` (through `via-probe.sh`). It opens `begin transaction read only` and
issues nothing but SELECTs, each under its own `SAVEPOINT`, so a soft failure (a relation a rig does
not carry) never poisons the rest. It prints facts only: never the DSN, never an e-mail address,
never any personal data. Exit code is non-zero when any check says STOP.

**Nothing in the script is transcribed from a migration.** The wave list, every expected row count,
every sha pin, every CHECK/INDEX/COLUMN predicate and every refusal literal is PARSED out of
`CLARA_MIGRATIONS_DIR` at run time. A literal it cannot parse is a **PARSE GAP** and counts as a
STOP. Prove the parse offline before the window:

```
CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
  node docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs \
       --plan --frontier-before 0293_fa_arrears_judgement_scope
```

Expect 21 pending files, 8 relations created, 20 generated CHECK reads (15 of them constraint
SWAPS), 4 FK reads, 9 ADD COLUMN reads, 20 index reads, 10 UPDATE reads, 4 DELETE reads, 1 withdrawn
grant, 2 dropped functions, **189 body pins (136 measurable, 53 chain-internal)**, 16 hand-written
data preconditions and **zero GAP lines**.

**Dry-run evidence and the fifteen negative controls** are in `ceremony-w4/README.md`, run on the
rig on 2026-09-24. Both a `C.UTF-8` and an `en_US.UTF-8` database at the hosted frontier came back
CLEAN, and every check family was separately proved to STOP. Read that table before the window: one
of the controls found a real defect in the script itself, and the fix is recorded there.

Then, through the probe:

```
PROBE=<probe-id> via-probe.sh node docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs \
      --prod --baseline <the rig hosted-frontier fingerprint>
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted pooler estate
(`db=postgres`, port 5432, not loopback). Ledger expect **288 / `0293_fa_arrears_judgement_scope`**;
drift gate over all 288 applied rows (`migrate.mjs` aborts the whole run on one checksum mismatch,
so a drift here is a STOP before the window rather than a surprise inside it); the pending set listed
and asserted to be exactly the 21 files above the frontier; and the printed arithmetic
`288 + 21 = 309 / 0318_knowledge_fye_pair_applicability`. The run writes
`ceremony-w4/reads-w4.state.json` so `--post` can re-derive that sum. **It also prints the server's
collation on its own line**, needed for reading `D-CHART-V1` correctly, and for nothing else.

**3b. THE ESTATE FINGERPRINT.** The script compares hosted against a baseline produced by the SAME
script with `--export-fingerprint` from a rig database at the hosted frontier. It covers every
function in `clara` (identity signature, `sha256(prosrc)`, owner, SECURITY DEFINER, `proconfig`,
ACL), every relation (columns, constraints with `convalidated`, indexes, RLS enabled and forced,
policies, triggers with `tgenabled`, view definitions, owner, ACL), the schema's own types, and the
`clara%` roles with their memberships.

Role-level rule, unchanged from wave 3 and re-argued for wave 4: `role:` and `rolemember:`
differences print as **`env`** lines, with both sides, and never count as a STOP. Everything else
still STOPs. **This wave DOES mint two roles (0309), which is exactly why the rule stays a rule
rather than becoming an exception**: the new pair shows as `env` against a pre-window baseline and
vanishes against an upgraded one, and neither is drift. What checks them is `D-ROLE-PAIR` in 3c,
which reads their ABSENCE as a first-apply precondition, and the new door's grant, which is an
`fn:` ACL key and still STOPs.

A difference on an object a pending file merely names and rewrites prints as **TOLERATED**. A
difference on an object a pending PRESTATE **pins** prints as **STOP DRIFT (PINNED by <file>)**.
Expect on hosted: **0 DRIFT, 0 PINNED DRIFT, and the same 14 `env` lines waves 2 and 3 saw**
(re-count them; a fifteenth is a finding).

**3b-bis. THE BODY-PIN LEDGER, which is new and is the largest read in this wave.** 189 pins across
the 21 files. **136 are measurable against hosted now and are checked**; each must be at a value its
own file admits (two values where a file is bimodal for `#957` redo-safety). **53 are
CHAIN-INTERNAL**, because the signature is produced by an EARLIER file of this same run and its
expected value does not exist on hosted yet. Those are printed, named, and never counted. Worth reading out
loud, because they are why the 21 files must apply in order and cannot be split across windows:

| the pin | held by | produced by |
|---|---|---|
| `clara._assert_field_path(text)` | 0299 | 0296 |
| `clara.evaluate_payroll_run_state_v1` / `clara.persist_payroll_facts` | 0297 | 0296 |
| `clara._post_payroll_run(uuid)` | 0298 | 0297 |
| `clara.persist_agreement_facts` / `clara._agreement_entry_plan` / `clara.evaluate_agreement_contract_state_v1` | 0300 | 0299 |
| `clara.list_review_queue(jsonb,jsonb,integer)` | 0302 | 0297, 0300 |
| the accrual family (`_accrual_canonical`, `_accrual_finish`, `correct_accrual_adjustment`, …) | 0304 | 0303 |
| the prepayment and revenue cores, `prepayment_schedule_v2`, `_prepayment_account_enrolled` | 0317 | 0305, 0306, 0307, 0308, 0315 |
| `clara._knowledge_assert_fye_pair` and its two callers | 0318 | 0310 |
| `clara.create_accounting_plan` | 0307, 0308, 0315, 0317 | 0300, then 0308 |
| `clara._plan_admit_occurrence` | 0304, 0308 | 0303 |

**The last two rows are the wave-4 INTEGRATION's own repair, and they are worth understanding
before the window rather than during it.** Lane 04 measured its pins on a rig that carried no lane
01 and no lane 03, so 0307/0308 pinned `clara.create_accounting_plan` to a body that 0300 had
already moved, and 0308 pinned `clara._plan_admit_occurrence` to a body that 0303 had already
recut. Left alone, 0308 would have pasted a body derived from the PRE-sibling text and silently
dropped the sibling lane's arm. The integration fixed both: 0308 now admits each of the two at
EITHER value, and its own paste is derived from the sibling's post-image so it ADDS its arm instead
of overwriting. Nothing else in that roster is loosened. The preflight reads the widened admission
(it is written as a disjunctive `or (… and v_sha = '…')` beside the array, not as a third array
element) and reports both admitted values.

**3c. THE DATA PRECONDITIONS a rehearsal on seeded data cannot prove about hosted rows.** Sixteen
hand checks, each with its expected value parsed from the file that owns it. The table is
exhaustive: every statement in the 21 whose success depends on existing rows, and then the ones
that need no read with the reason.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| **D-CHART-V1** | 0295 | the whole prestate of the wave's PRE-STEP: it mints `my_sme_starter` **v2** (42 families / 146 accounts) and **RETIRES v1** | v1 present and `published`, at **42 / 142**; its content at the pinned **collation-independent structural digest** (0150's canonical form with `collate "C"` on both ORDER BYs, re-measured here by parsing the file's own helper body); its stored `content_sha256` reproducing from its own rows ON THIS SERVER; carrying none of `1180/2030/2040/2050`; v2 ABSENT; and **exactly 2 society entity-override rows on v1**, which 0295 copies verbatim onto v2 and whose census its tail compares row for row |
| **D-CHART-ADOPTIONS** | 0295 | the retirement's blast radius | adoptions of v1 **by state**, whether any row anywhere is `proposed` (no shipped door writes that state, so a non-zero reading is a finding rather than a blocker), templates forked off v1, and the `my_sme_starter` platform-row census, which must read `v1/published` before and `v1/retired, v2/published` after. **Facts, never a refusal** |
| **D-CHART-FREEZE** | 0295 | the redo branch disables three freeze triggers to tear v2 down and re-arms them | all three `tgenabled='O'` before the window. A disarmed one means something outside this wave left it off |
| **D-REGISTRY-W4** | 0296, 0299 | the capability registry is re-derived TWICE, each raise rewriting every row | registry at **ONE distinct `registry_version`, value 4**, **240 rows**, exactly **6** `payroll_summary` pdf/image pairs on the router's branch, the `agreement_contract` pair count, and **0 pairs whose high-water mark disagrees** |
| **D-LANE-ROSTER** | 0296, 0299 | `ck_processing_task_lane_f_a1` gains `payroll_facts` then `contract_facts` | the live definition must admit NEITHER, plus the row counts of `document_processing_tasks` and `document_extractions`, which take ACCESS EXCLUSIVE once per swap |
| **D-ROLE-PAIR** | 0309 | its four objects must be ALL absent (first apply) or ALL present (redo) | `clara_invite_preview` and `clara_invite_preview_login` absent, the door absent, `clara.invite_preview_attempts` absent; plus the cluster `clara%` census RECORDED and never pinned, because 0309's first cut pinned it at 18 and would have aborted this migrate on hosted's own `clara_storage_docs` and the roster of roles carrying LOGIN today |
| **D-CHAIN-ROLES** | 0309 | it names 18 chain-minted roles BY NAME | all 18 present, absent ones listed |
| **D-FIRM-SETUP** | 0311 | a one-CELL backfill behind a disabled append-only trigger | `clara.firm_setup_keys` at **15 rows**, its twelve accounting rows hashing to the pinned digest, `t_firm_setup_keys_append_only` ENABLED, and the `tin` row still `capture` / not-required / no-knowledge-key / not-retired carrying 0258's own `user_note` |
| **D-ACCRUAL-SIDE** | 0304 | `add column side text not null default 'expense'` on the LIVE `clara.accrual_adjustments` | the column ABSENT, plus the relation's row count and size. **Every existing row is backfilled with the DEFAULT, not NULL** (a plain-literal default is metadata-only in PostgreSQL 11+, so no heap rewrite), but ACCESS EXCLUSIVE and then a CHECK that re-scans |
| **D-REVOKED-DOORS** | 0316 | `revoke execute on clara.create_client(text,text) from clara_authenticated` | the grant must still be HELD today, or the revoke is a no-op and something already withdrew it; and PUBLIC must hold EXECUTE on none |
| **D-DROP-…** (x2) | 0315, 0318 | two `drop function` statements | 0315's is `if exists` and its own header says the body was never created on a fresh chain, so its ABSENCE is lawful and the read is facts only. 0318's targets the three-argument `clara._knowledge_assert_fye_pair`, which **0310 mints earlier in this same run**, so it is chain-internal and absent before the window |
| **D-CHART-CONSUMERS** | 0297, 0300 | their tails demand EXACTLY ONE published row at `2040` and at `2050` | **CHAIN-INTERNAL**: 0295 mints both on v2 and retires v1 earlier in this same run, so the published starter carries NEITHER before the window. Read for facts |
| **D-RECEIPT-LANE** | 0297, 0299 | two swaps of `entry_post_receipts_via_wake_kind_check`, each widening | the LIVE definition text, the relation's row count and the census by `via_wake_kind`. Both swaps carry every existing literal forward, so the re-validating scan cannot refuse an existing row |
| **D-EVALUATORS** | 0296, 0299 | two NEW frozen evaluators are registered in an append-only register | neither name already present, plus the register's size |
| **D-KNOWLEDGE-KEYS** | 0300, 0310, 0311, 0318 | five catalogue keys their predicates name | `entity_type`, `financial_year_end_day`, `financial_year_end_month`, `reporting_framework`, `turnover_band` all present; several files refuse outright if one is not |

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective. Derived by stripping every `create [or replace] function` BODY from each file, because a body is
inert at apply time, and reading only what is left.

- **0301, 0303, 0305, 0306, 0307, 0308, 0309** create a NEW relation each (eight in all:
  `staff_expense_claim_allocations`, `accrual_period_amounts`, `prepayment_stated_terms`,
  `prepayment_account_enrolments`, `revenue_recognition_schedules`, `contract_terms`,
  `contract_plan_confirmations`, `invite_preview_attempts`), with their indexes, RLS, policies and
  triggers. A new table has no existing rows, so its twenty-odd index builds are free.
- **0302's behavioural probe** INSERTs a synthetic user, firm, membership, client, chart account,
  plan, revision, accrual, entry, lines, receipt, occurrence, document and filing through the real
  doors and unwinds the subtransaction. It is scoped to the ids it mints, so no hosted row is read
  or written.
- **0310, 0316, 0318** execute no DDL on any existing relation and no DML at all: they are
  `create or replace function` recuts, one REVOKE, one COMMENT and one DROP.
  `create or replace function` touches no row.
- **0297's and 0299's** journal writes are all inside function bodies (the posting doors). They run
  when a person or a lane calls them, not when the file applies.
- **0295's DELETEs** are inside its REDO branch only, which a first apply never enters.

## W. Deploy order, decided from the migrations' headers and the two diffs

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine is
STOPPED before the migrate and started again only on the NEW image.** Same order as waves 2 and 3,
but the ARGUMENT is different from wave 3's and that difference is worth stating, because it changes
what the window is buying.

- **Three files claim a deploy order, and all three claim DATABASE FIRST.** Measured, not assumed:
  `grep -niE 'deploy order|consumer-first|runtime-first|database-first|write-quiet|quiesce'` over
  `0295...0318` returns hits in exactly three files. **0296** and **0299** head a section
  `DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND` with the same reason: the persist door validates
  the answer envelope against a new validator, so a runtime image answering a WIDER questionnaire
  than the live validator admits would be refused on EVERY persist and the lane would bank nothing.
  **0297** heads `DEPLOY ORDER: DATABASE ALONE. NO RUNTIME STEP.` **No file claims runtime-first**,
  and `ARCHITECTURE.md` §5.F is what makes that silence readable: the obligation to invert is
  written in the migration's own header, so a header that does not carry one does not owe one.

- **The NEW runtime TOLERATES the old schema, and that is a measurement, and a difference from
  wave 3.** In wave 3 three call sites reached doors that existed only at 0275 and 0286 with no
  feature-detect, so DB-first was the only lawful sequence. In wave 4 the equivalent call sites are
  guarded: both new frozen families carry a `to_regprocedure` probe in their own claim query
  (`packages/runtime/workflows/payrollFacts.v1.dispatch.mjs:58` and
  `agreementFacts.v1.dispatch.mjs:63` each add
  `and to_regprocedure('clara.persist_…_facts(uuid,jsonb,jsonb,int)') is not null`), so against a
  0293 database they claim nothing and wait. Of the wave's other new `clara_runtime` doors,
  `create_prepayment_schedule_for`, `read_prepayment_source_for` and
  `read_revenue_recognition_source_for` have **no live runtime caller at all** (grep-confirmed; they
  are database-side OBO twins for a later wake lane), and `preview_invite_by_token` is reached only
  by a LAZY pool that stays dormant until its own DSN exists, which is step 6e, after the migrate.
  `admit_staff_expense_claim_work` pre-dates this wave (#638) and keeps its signature; 0301 recuts
  the body. **So the order is a PREFERENCE here, not a forcing constraint.** It is still taken,
  because the alternative buys nothing and risks the write-quiet obligations below.

- **The OLD runtime DEGRADES ORDERLY, and this wave has no equivalent of wave 3's 0279.** The one
  behavioural change the serving image meets between the migrate and its own replacement is that
  0296 and 0299 stop minting the terminal `failed/skipped_kind` receipt for a payroll summary or an
  agreement contract and mint a `queued` row on a lane the serving image does not know. Read out of
  the serving tree rather than assumed: `packages/runtime/lib/reconciler-documents.mjs` at
  `46cf7c85` ends `enqueueForLane` with a warn-once and `return undefined`, with its own comment
  saying an unknown lane is "NOT dispatched … never fallen through to documentIngest (that would
  start a generic OCR run outside the lane's own consent/egress controls)". So a queued payroll or
  agreement task simply waits for the image that owns it, and the image that lands second drains
  it. **No mis-count, no re-drive, no vendor egress.** Both files' headers say the same thing in
  their own words, and 0296's adds that the window writes "no extraction, no region, no fact, no
  event and no journal effect of any kind".

- **The WRITE-QUIET obligations, quoted rather than paraphrased.** 0296 recuts ONE live body,
  `clara._enqueue_invoice_facts_core`, and states that every other document kind's path through it
  is byte-identical to its pre-image. 0297 `create or replace`s exactly one live body,
  `clara.persist_payroll_facts`, and splices one reader, `clara.list_review_queue`; its own note is
  the reason the machine stop is still taken: *"PostgreSQL runs an in-flight PL/pgSQL call to
  completion on the body it STARTED with, so a payroll persist spanning this migration settles the
  read WITHOUT posting"*. Honest, reported by the derived Needs-you row, and nothing half-posted.
  0299 recuts five router-side bodies under the same promise. The general rule in
  `packages/db/README.md` applies to all 21: before deploying a change to an active writer body,
  stop new writes and drain in-flight calls, apply, then resume. **That is what the stop is for.**

- **What the OLD WEB does between the migrate and the promotion, checked rather than assumed.**
  There is a window of a minute or two in which web `b659a3d4` talks to a 0318 database.
  - `clara.list_review_queue` gains **six** row kinds (`payroll_posting_blocked`,
    `payroll_net_pay_unsettled`, `agreement_posting_blocked`, `rent_payable_unsettled`,
    `rent_escalation_pending`, `accrual_bill_conflict`), taking the roster from ten to sixteen. The
    serving web's `apps/web/lib/firm/needs-you.ts` knows ten, and
    `components/firm/needs-you-row.tsx:96-98` routes an unknown kind through
    `t("rowKind.unknown", { kind })`, which `messages/en.json` renders as
    **`Unrecognized item (payroll_posting_blocked)`**. A visible, honest degradation with no
    affordance, not a crash and not a silent drop. It lasts until step 8.
  - `clara.create_client(text,text)` loses its `clara_authenticated` EXECUTE (0316). Checked:
    `git grep create_client 46cf7c85 -- apps/web packages/runtime` returns **nothing**. No serving
    caller, so the revoke breaks nothing at all.
  - `my_sme_starter` v1 is retired and v2 published (0295). The serving web's
    `lib/onboarding/coa.ts` filters on `state='published'`, so the picker simply starts offering
    the 146-account v2 instead of the 142-account v1. That is the intended new behaviour arriving
    one promotion early, and it is the reason 0295 retires v1 at all: two published starters with
    the identical title are a choice a bookkeeper cannot make correctly.
  - `clara.get_firm_setup` starts returning the `tin` item for every firm with a `required` flag
    that can now be dynamic (0311). Additive to the payload; the serving screen renders what the
    door says.
  - Payload additions the old web absorbs: `side` on accrual reads (0304), the `term_source` /
    `stated_term_id` family on prepayment reads (0305), the supersession columns (0317).
  - **Unverified, and worth watching:** whether PostgREST reloads its schema cache promptly after
    the six `list_review_queue` splices and the two registry rewrites. If a Firm Home, Bank or
    Plans surface answers `PGRST202` after the migrate, the cache needs a reload; that is a hosted
    behaviour this draft cannot test.

- **So web goes LAST.** Of the doors this wave creates, 27 are granted, and every browser-facing
  one has its consumer in the SAME cut: the payroll settlement pair (0298), the ten tenancy and
  contract-term doors (0300), the two staff-claim reads (0301), `skip_plan_occurrence` (0302), and
  the three revenue-recognition reads (0308). A door that is not there is **42883** to a direct
  call and `PGRST202` through PostgREST, so the consumer must never precede it.

**The quiescence window covers the whole 21-file run**, one `migrate.mjs` invocation. What it is
buying, named, with the LOCK class each takes:

| file | why it rides the window |
|---|---|
| 0295 | four INSERT statements and two UPDATEs on `clara.coa_templates` and its three child tiers. The ONE file in this wave that rewrites a PUBLISHED catalogue row. Row locks only, on a handful of rows, but the retire stamp must not race a `clara.apply_coa_template` call |
| 0296 | FIVE constraint swaps: four on `clara.document_processing_tasks` and one on `clara.document_extractions`, each **ACCESS EXCLUSIVE plus a re-validating whole-table scan** |
| 0296, 0299 | `update clara.document_capabilities set registry_version = N where registry_version <> N`, **once each**: all 240 rows rewritten twice, every row firing the monotonicity, high-water, high-water-record and uniformity triggers. **1,920 trigger firings** |
| 0297, 0299 | two swaps of `entry_post_receipts_via_wake_kind_check` on `clara.entry_post_receipts`: ACCESS EXCLUSIVE and a whole-table scan each |
| 0299 | the same five swaps 0296 made, made again one literal wider: ACCESS EXCLUSIVE ten more times |
| 0303, 0304 | two swaps on `clara.accrual_adjustments`, plus 0304's `add column side text not null default 'expense'` (ACCESS EXCLUSIVE, metadata-only, then a CHECK that re-scans) |
| 0305, 0317 | `add column` x5 on `clara.prepayment_schedules`, two guarded FKs, two CHECKs and a UNIQUE index on `source_entry_id`: ACCESS EXCLUSIVE repeatedly, and the unique build is the one statement here whose cost grows with the estate |
| 0308 | one swap of `accounting_plans_kind_check` on `clara.accounting_plans`: ACCESS EXCLUSIVE plus a whole-table scan |
| 0311 | ONE cell of ONE row of `clara.firm_setup_keys`, behind a trigger disabled and re-enabled in the same transaction. **The disable takes ACCESS EXCLUSIVE on the catalogue** |
| 0301, 0303, 0305...0309 | `create table` + indexes + RLS + policies + triggers on eight NEW relations |
| the rest | function recuts, catalog splices, comments, grants and one revoke, which take no table lock above what `create or replace function` needs, but ride the same window for free |

**THE TIMEOUT PICTURE, measured across the 21.** `migrate.mjs` still arms nothing itself
(deliberately, because the F10 advisory wait must be unbounded):

- **`statement_timeout = '5min'` AND `lock_timeout`**: 0296, 0297, 0299 (`5s`) and 0309 (`15s`). A
  blocked lock here FAILS FAST with `55P03` and rolls that migration back whole.
- **`lock_timeout = '5s'` alone**: 0302, 0303, 0304.
- **`statement_timeout = '5min'` alone**: 0311.
- **NEITHER**: 0295, 0298, 0300, 0301, 0305, 0306, 0307, 0308, 0310, 0315, 0316, 0317, 0318. A
  blocked `ALTER TABLE` or `CREATE INDEX` in that set **waits indefinitely**. The ones that take a
  heavy lock on an EXISTING populated relation are **0305, 0308 and 0317**.

So step 6b's `pg_locks` read is the only guard for 0305, 0308 and 0317. If one blocks,
`pg_cancel_backend` the blocker, **never** the migration.

## 4. Runtime image first, build-only and push, released by digest

```
... flyctl deploy --config packages/runtime/fly.toml --build-only --push \
      --image-label refresh-<RELEASE_SHA> --build-arg CLARA_BUILD_SHA=<full sha>
```

About five minutes; record the `sha256:` digest and release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7, never by tag. The Docker build runs
`nitro build` only: it does NOT run the bundle gate or the freeze-lint, so those counts are `ci`'s
and step 11a's, not this step's output. Nothing built here is released until step 7.

## 5. Web build and upload, in WSL as root, BEFORE the window

Mechanism unchanged: detached checkout at RELEASE_SHA in `/home/runner/clara-deploy` fetched from
`refs/remotes/origin/main`, `corepack pnpm install --frozen-lockfile`, the two
`NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then
`corepack pnpm --dir apps/web exec wrangler versions upload --tag refresh-<RELEASE_SHA>`. Record the
Worker Version ID. **Not promoted until step 8.**

**New in this wave:** the web gains a whole `deferred-revenue` route family
(`/clients/<id>/deferred-revenue`, `/new` and `/<scheduleId>`) and rewrites the signed-out invite
landing page (`app/(entry)/invite/[token]/page.tsx`). Both are ordinary Next routes; nothing about
the build mechanism changes.

## 6. Writer quiescence, then migrate: all 21 files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is what buys the
write-quiet obligations in section W, in particular 0297's in-flight-persist note.

6b. Re-run the census through the probe (`reads-w4.mjs --census --prod`). It must come back clean,
and specifically: no other backend holding a lock on `clara.accounting_plans`,
`clara.accrual_adjustments`, `clara.coa_templates` and its three child tiers,
`clara.document_capabilities`, `clara.document_extractions`, `clara.document_processing_tasks`,
`clara.entry_post_receipts`, `clara.firm_setup_keys`, `clara.journal_entries` or
`clara.prepayment_schedules`. That list is PARSED from the executed statements, not transcribed. The
web app talks to PostgREST directly and can still hold a lock while the runtime is down: this read
is what makes the window real rather than nominal. Also: **no holder of the F10 advisory lock**, or
the migrate step hangs silently. Idle pooler-held `clara_runtime_login` sessions are fine; held
locks are not. **The `statement_facts running` `document_processing_tasks` row is the orphan known
since 2026-09-19** and is not a blocker.

6c. From the RELEASE_SHA checkout:

```
PROBE=<probe-id> via-probe.sh node packages/db/scripts/migrate.mjs      # cwd = packages/db
```

Expect **`migrate: 21 new migration(s) applied · 309 total`**. The wave-3 window took 1 min 28 s for
21 files through the ssh hop; this wave's 21 are larger (two of them over 3,000 lines) and carry two
whole-registry rewrites, so budget generously and **do not kill it**. If it passes about 10x the
rehearsal's wall without returning, read `pg_stat_activity` on a second connection and decide from
the ledger.

The prestate notices worth reading out loud, because they are about hosted ROWS rather than catalog
shape:

- **0295**: *"clean (FIRST apply). my_sme_starter v1 (…) is published, unmoved at 42 families / 142
  accounts, structural digest … (collation-independent, pinned), stored content_sha256 … (reproduces
  from its own rows on this server; carried to the tail, never pinned as a literal)"*. On hosted the
  stored digest should read `673ede91…`, not the `d02a786a…` every rig prints. **That is expected**
  and is the whole reason 0295 pins the structural digest instead.
- **0295 seed**: *"my_sme_starter v2 (…) PUBLISHED, 42 families / 146 accounts … and 2 entity
  override row(s) carried forward from v1 … my_sme_starter v1 RETIRED"*.
- **0296**: *"the capability registry publishes one version across 240 rows with its high-water mark
  in agreement"*.
- **0309**: *"the 18 chain-minted clara roles this file relies on are all present; the cluster-wide
  `clara%` census reads N and is RECORDED, not pinned"*. **On hosted N will be 19, not 18**, because
  of `clara_storage_docs`. That is the defect 0309's own fix round removed; if the run raises
  `expected 18 … found 19`, the file on RELEASE_SHA is the OLD cut and the window must stop.
- **0311**: *"the catalogue holds its pinned fifteen rows (twelve unmoved, hashing to the prior
  pin)"*.
- **0316**: *"FIRST APPLY, revoking now"*.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state: the
file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b-bis exists so this is discovered BEFORE the window, for the 136 pins
  that are measurable. Do not re-pin and do not edit the migration. Report to the owner with the
  body name and both shas. **If the refusing pin is one of the 53 CHAIN-INTERNAL ones, read the
  producing file's own output first**: the expected value is a body an earlier file of this same run
  was supposed to have written, so the real question is what that earlier file did.
- **A DATA PRESTATE REFUSED.** The candidates, all of them read in 3c so they never first appear
  here: 0295's v1 census, structural digest, stored-hash self-consistency and four-code collision;
  0296's registry census and high-water agreement; 0309's four-object count and 18-role roster;
  0311's catalogue digest and `tin` row shape; 0304's already-present `side`.
- **Ledger-position branches.** (i) `max(version)` below `0295`: nothing of this wave landed; the
  deployed image `refresh-46cf7c85` is a legal boot target, so `machine start`, report, and do NOT
  promote web. (ii) **`0295` committed and the chain then stopped**: the standard chart now offers
  v2 and no longer offers v1, which the serving web renders correctly, and no other surface has
  moved. The old image is a legal boot target. Start it, hold web, report. (iii) **anything in
  `0296`...`0318` committed but not all 21**: the old image still boots (nothing strands: it carries
  55 bodies and this wave adds two NEW families, never repointing an existing class), and the
  orderly degradation of section W still holds, so start the old image and hold web. But the
  partial state is a CHAIN with unmet internal pins, and the remaining files must be applied before
  any image that owns the new lanes is released. (iv) all 21 committed, ledger reads **309 /
  `0318_knowledge_fye_pair_applicability`**: drive forward to steps 6e, 7 and 8.
- **A `55P03 lock_not_available`** on 0296, 0297, 0299, 0302, 0303, 0304 or 0309: that is the file's
  own `lock_timeout` firing. Find the blocker in `pg_locks`, `pg_cancel_backend` it, and re-run 6c
  from the ledger's current frontier.
- **An indefinite wait** on **0305, 0308 or 0317**: those arm no `lock_timeout` at all and take a
  heavy lock on a populated relation. Do the same thing, from a second connection.

### 6e. `clara_invite_preview_login`: the out-of-band credential ceremony (#871, migration 0309)

Lifted verbatim from `reports/wave4-lane05-ticket871.md` § "Release runbook step (#871)".

**When.** AFTER the migrate step has applied `0309_invite_preview_public_door.sql` to hosted and
BEFORE the runtime image is released. The route answers 503 until the DSN exists, so the order is not
fatal, but a released image that cannot serve the invite landing page's preview is a window with an
avoidable hole in it. Same shape and same position the auth wall's own ceremony took at the Wave-G
reset: 0163 ships `clara_auth_wall`/`_login` NOLOGIN and the operator flips the shell and supplies
`CLARA_AUTH_WALL_DATABASE_URL` out of band.

**Why there is a step at all.** 0309 creates BOTH roles `NOLOGIN` and password-less, and its own tail
RAISES if either carries `rolcanlogin`. No credential can arrive by migration, by design, so exactly
one exists and it is created here.

**6e.1, the role ceremony.** In a PRIVATE session, as a superuser or owner on the live project:

```sh
psql "<the hosted admin DSN>" -f packages/db/deploy/invite-preview-login-ceremony.sql
```

It `\prompt`s for the password (nothing is committed, nothing is in argv), flips
`clara_invite_preview_login` to LOGIN, normalises the privilege bits under the superuser split 0002
§1 requires, and ABORTS if the group role itself ever carries LOGIN. Then eyeball its five
verification reads. The two that matter:

- read (3) prints the login shell's WHOLE effective EXECUTE surface in schema `clara`. **Expect
  exactly one row: `preview_invite_by_token | p_token text, p_origin_digest bytea`.** Measured on
  the lane rig; anything else means the grant matrix drifted.
- read (4) must print ZERO table grants and `direct_clara_usage = f` for the shell.

**6e.2, the smoke, out of band** (psql cannot authenticate inline from `-f`):

```sh
psql "<the new DSN>" -c "set role clara_invite_preview; \
  select clara.preview_invite_by_token('not-a-real-token', decode(repeat('00',32),'hex'));"
```

**Expect `{"outcome":"not_previewable"}`.** That one line proves the whole chain (authenticate, SET
ROLE, EXECUTE, the wall counted it) with no real token and nothing disclosed. Measured on the lane
rig, verbatim.

**6e.3, the secret.** ONE new Fly secret on `clara-runtime`, and nothing on the Worker:

```sh
flyctl secrets set --app clara-runtime \
  CLARA_INVITE_PREVIEW_DATABASE_URL="postgres://clara_invite_preview_login:<pw>@<pooler host>:<port>/<db>?sslmode=verify-full&sslrootcert=<CA path in the image>"
```

Same DSN shape, pooler host and CA pinning as `CLARA_AUTH_WALL_DATABASE_URL` (the runtime's
`assertLaneDsnTlsPosture` refuses a DSN that pins a CA and cannot read it, and WARNs loudly on a
production DSN that pins none). **`apps/web` needs no new secret**: the route is gated on
`CLARA_AUTH_WALL_SERVICE_TOKEN`, which the Worker already holds, and the web app never holds a
database credential for this lane. **Setting a secret restarts the machine; fold it into the
existing release restart rather than adding a second one**, and at this point in the ceremony
means the machine is already STOPPED, so set the secret here and let step 7's `machine start` be the
one restart.

**6e.4, the boot check** is in step 7 below, with the rest of the boot lines.

**Rollback.** Unsetting `CLARA_INVITE_PREVIEW_DATABASE_URL` returns the lane to dormant: the route
answers 503, the courier's outcome is indefinite, and the invite landing page renders exactly as it
did before this wave. Nothing else on the journey depends on it.

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

**Expected boot lines, and the pins have CHANGED in this wave:**

```
serving git_sha=<full sha> frontier=0318_knowledge_fye_pair_applicability(309) bodies=57 pins \
        closeExample=closeExampleV1 chatTurn=chatTurn_v21 claraWork=claraWork_v5 \
        documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v3 \
        witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1 \
        autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5 \
        bankAgent=bankAgent_v1 closePrep=closePrep_v1
stranded bodies n=0            <- BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5     <- FIVE bundle banners
CONTROL listening
LEADER acquired
```

**`bodies=57`, up from 55**, and the pins gain `payrollFacts=payrollFacts_v1` and
`agreementFacts=agreementFacts_v1`. Nothing is REPOINTED: both are brand-new CLASSES with no earlier
version, so every pre-existing pin is unchanged and `stranded bodies n=0` still holds. A parked run
cannot be on a body this image does not carry, because this image carries every body the previous one
did, plus two. **If the boot line reads `bodies=56` or omits `agreementFacts=`, gate 0a's blocker was
not fixed and the release is wrong**: stop and report.

Signed-in `GET /api/build-info` should agree, field for field: `git_sha` = the full sha, `frontier`
`0318_knowledge_fye_pair_applicability(309)`, `bodies: 57`, the same fourteen pins.

**6e.4, the invite-preview boot check.** The startup log must NOT carry

```
[clara-runtime] CLARA_INVITE_PREVIEW_DATABASE_URL not set: the signed-out invite-preview lane is DORMANT.
```

and `/ready`'s `checks.pools` must carry the lane `invite_preview` with `ok: true` rather than
`skipped: true, reason: "dsn_not_configured"`. The lane is LAZY, exactly as the two checkout lanes
are, so a missing DSN degrades rather than failing readiness, which is why this needs its own look
rather than being covered by `/ready` returning 200.

**Also worth one look in the first sweep's log:** the document reconciler should stop logging
`unknown document lane 'payroll_facts'` / `'contract_facts'`, because this image now owns both.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all six prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200.

**One addition, and it is this wave's own:** open a LIVE invite link while SIGNED OUT and see the
firm name, the role and the masked address render above the Continue control (#871). A failed read
renders nothing, which is the recorded product decision and not a fault, so the check is that a VALID
link shows the block, and an invalid one shows the page without it and discloses nothing.

**Signed in, through the owner's browser, read-only, nothing clicked that writes.** One surface per
lane, chosen for what this wave actually changed. (Wave 2's and wave 3's signed-in walks were NOT
done in their windows and are still owed; if they are done here, do those first.)

| lane | tickets | surface | what to see |
|---|---|---|---|
| 01 | #944 #945 #946 #947 | a payroll summary on `/documents`, then the client's journal | the summary is READ rather than merely stored; the run's figures come from the page and a deterministic evaluator does every sum; a blocked post shows as a Needs-you row naming the condition, not as a silent nothing |
| 01 | #948 #949 | a hire-purchase agreement, and a tenancy agreement's rent plan | the acquisition posts into the fixed-asset lane at the SIGNING date; the tenancy proposes contract terms and a rent plan a human confirms; `2050 Rent Payable` resolves by name |
| 02 | #930 #931 | `/clients/<id>` staff expense claims | a claim listing with its allocations against a staff advance; a documentless claim is lawful |
| 03 | #937 #938 #942 | `/clients/<id>/accruals` | per-period amounts on an accrual; a bill that arrived against an accrued plan shows as a conflict with a reachable remedy; a REVENUE-side accrual (Dr `1180 Accrued Income`) |
| 04 | #939 #940 #915 #941 #1036 | `/clients/<id>/registers` prepayments, and `/clients/<id>/deferred-revenue` | a human-stated prepayment term; the account roster panel; a deferred-revenue schedule against `2030 Deferred Revenue`; a corrected schedule that SUPERSEDES rather than contradicts |
| 05 | #933 | `/clients/<id>/registers?tab=fixedAssets` | the depreciation particulars PROPOSAL note, and that it proposes rather than decides |
| 05 | #871 | the signed-out invite link (above) plus `/settings/members` | the same firm/role/masked-address block renders in BOTH the signed-out and the signed-in preview, from one component |
| 06 | #1031 #1032 #1038 | `/settings/firm` | the financial-year-end pair is asked as a pair; the TIN item is OFFERED to every firm and marked required only when turnover makes MyInvois mandatory, with an answer form in both cases |
| 07 | #1033 #1035 #877 #1041 | `/api/build-info` and the runtime log | the readiness and rollback-safety work is runtime-side; its evidence is step 7's boot lines and step 9 |

The per-lane reports in `reports/wave4-lane*-*.md` are the authority on what each ticket changed;
this table is derived from the web diff and is a starting roster, not a specification.

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

Run immediately after step 7:

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted v-previous index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND old-image probe,
never from the live machine. **The wave-2 window's sftp extraction stalled at 32 KB twice; stream the
bundle over `ssh console` and verify it by `sha256sum` against the machine's own.** Two separate
gates, and say which is being demonstrated: (a) `FRONTIER_BODY_RULES`; (b) the stranded-body census.

**What to expect, and why this wave is the EASY case for gate (b) and a HARDER case for gate (a).**

- **Gate (b) is trivially clean in the rollback direction.** `refresh-46cf7c85` carries 55 bodies;
  the new image carries those same 55 plus `payrollFacts_v1` and `agreementFacts_v1`. Nothing is
  repointed, so a parked run at the moment of rollback can only be on a body the old image also
  carries, UNLESS a payroll or agreement run has already started on the new image. **That is the
  new thing in this wave**: once one `payrollFacts_v1` or `agreementFacts_v1` run exists and is
  non-terminal, the old image IS a stranding target and the preflight will say so by name. Record
  which it was.
- **Gate (a) is the one to read carefully.** `FRONTIER_BODY_RULES` at frontier 0318 is a rule table
  that knows nothing about a door's return contract, which is #1035's whole complaint (open,
  `bug` / `ready-for-agent`, and lane 07 works on exactly that ticket in this wave). Read its verdict
  as "no body strands", never as "this rollback is safe".
- **The DATABASE cannot be rolled back below the frontier.** Nothing in this wave drafts a
  below-frontier rollback, and the only route is the step-3f dump, which returns no Storage bytes, no
  managed Auth config and no engine state. If a below-frontier rollback is ever wanted it must be
  drafted BEFORE a window, never during an incident.

**Which previous image is lawful at which ledger, stated plainly.**

| ledger | is `refresh-46cf7c85` a lawful boot target? |
|---|---|
| below 0295 | yes, unreservedly: nothing of this wave landed |
| 0295 only | yes: the chart change is data the serving web reads correctly |
| 0296 or above, no payroll/agreement run yet started | yes, with a caveat: it does not own the two new lanes, so their tasks queue and wait (measured: warn-once, never dispatched) |
| 0296 or above, a `payrollFacts_v1` or `agreementFacts_v1` run non-terminal | **NO**: that run's body is not in the old image and it would strand. The preflight's gate (b) is what says so |
| any | the `CLARA_INVITE_PREVIEW_DATABASE_URL` secret is harmless to the old image: it does not read it |

Add this wave's finding to #1035 rather than opening a second ticket.

## 10. The reads this wave owes on hosted, after the release

Run `ceremony-w4/reads-w4.mjs --post --prod --baseline <the UPGRADED rig fingerprint>` through the
live machine's DSN. It issues the same SQL step 3 issued, so pre and post sit side by side. It
asserts:

1. the ledger reads **288 + 21 = 309** at `0318_knowledge_fye_pair_applicability`;
2. every one of the 21 new migrations has a ledger row whose checksum equals its file;
3. the drift gate over all 309 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified. Expect **the role-level `env` lines and nothing else**. The
   two roles 0309 mints will be PRESENT on both sides if the baseline is a true upgraded clone, so
   they should not even appear.

It then runs the wave's own post-reads (`--post` section (f)), which are these:

**The reference row counts that MOVE across the 21, measured on the rig** (seeded, so hosted's
absolute numbers will differ; the DELTAS are what to check):

| relation | before | after |
|---|---|---|
| `clara.coa_templates` (platform `my_sme_starter`) | 1 row, `v1/published` | **2 rows, `v1/retired, v2/published`** |
| `clara.coa_template_accounts` | 142 on v1 | 142 on v1 + **146 on v2** |
| `clara.coa_template_families` | 42 on v1 | 42 on v1 + **42 on v2** |
| `clara.coa_template_entity_overrides` | 2 on v1 | 2 on v1 + **2 on v2** |
| `clara.document_capabilities` | 240 rows at version 4 | **240 rows at version 6** |
| `clara.document_capability_version_high_water` | 240 marks at 4 | 240 marks at 6 |
| `clara.evaluator_versions` | N | **N + 2** (payroll, agreement) |
| `clara.accrual_period_amounts`, `clara.contract_terms`, `clara.contract_plan_confirmations`, `clara.invite_preview_attempts`, `clara.prepayment_account_enrolments`, `clara.prepayment_stated_terms`, `clara.revenue_recognition_schedules`, `clara.staff_expense_claim_allocations` | absent | 0 (eight new, empty relations) |

**This wave inserts catalogue rows in exactly three places**: the chart template's second version,
the two evaluator registrations, and the `event_types` / `trigger_taxonomy` rows 0296 and 0299 add.
Every other reference relation is unchanged in count.

Then the questions this wave's own headers ask of hosted, which only a release-time read can answer:

1. **0295 (#941 #942 #946 #949): the standard chart after the retirement.** `my_sme_starter` reads
   exactly `v1/retired, v2/published`; v2 carries 42 families / 146 accounts including `1180 Accrued
   Income`, `2030 Deferred Revenue`, `2040 Salaries Payable` and `2050 Rent Payable`, each appearing
   EXACTLY ONCE across every template row the estate ships; v2's two society entity overrides equal
   v1's row for row (so a society client adopting v2 still gets `3900` as `Accumulated Fund` and no
   `3040`); v1's own 42 / 142 and its stored digest are UNMOVED; and **the client that adopted v1
   still reads the 142-account chart it was given**.
2. **0296 / 0299 (#945 #948): the registry after two raises.** 240 rows, ONE distinct
   `registry_version`, value **6**; the six `payroll_summary` and six `agreement_contract` pdf/image
   pairs reading `typed_facts = 'supported'`; the high-water ledger at 240 marks all at 6. And the
   router's roster admitting `payroll_facts` and `contract_facts`.
3. **0296 / 0299: the two frozen evaluator families are REGISTERED**, name and entrypoint signature,
   and the register is still append-only.
4. **0297 / 0298 / 0299 (#946 #947 #948): the receipt lane vocabulary** reads exactly
   `{autodraft, interactive, bank_agent, payroll_facts, contract_facts}`, and the first real payroll
   post after the release carries `via_wake_kind = 'payroll_facts'`.
5. **0304 (#942): the accrual side on real rows.** `select side, count(*) from
   clara.accrual_adjustments group by 1`. **Every pre-existing row must read `expense`**, and none
   must be NULL. This is the read that proves the `not null default` backfill did what its header
   claims on hosted's own rows rather than on an empty rig relation.
6. **0309 (#871): the invite-preview lane.** Both roles present, **both still `rolcanlogin = false`
   in the catalog EXCEPT the login shell after step 6e.1**, the door's ACL reading exactly
   `{clara_fn_owner, clara_invite_preview}`, and `clara.invite_preview_attempts` gaining its first
   row when the signed-out smoke runs.
7. **0311 (#1032): the firm-setup catalogue.** Still 15 rows, the append-only trigger still ENABLED,
   and the `tin` row carrying the NEW `user_note`. Then, on a real firm: the TIN item is seeded and
   is marked required or optional according to the turnover answer, with an answer form in both
   cases.
8. **0316 (#1038): `clara.create_client`'s human grant is gone**, and PUBLIC holds none.
9. **0310 / 0318 (#1031): the knowledge pair wall** exists at ONE signature, the four-argument form,
   with the three-argument form dropped.
10. **0305 / 0317 (#939 #941): the prepayment schedule's supersession chain**: `term_source` on
    every pre-existing row reading `document_service_period`, the three new columns NULL, and both
    guarded FKs live.

Also re-read the ledger, the stranded-body census and the quiescence census once more and record
them.

## 11. Manifest, then the tickets

11a. **`node scripts/check-frozen-workflows.mjs --lock-deployed` DOES have something to lock in this
wave**, unlike wave 3. Two new frozen families, five files each, are added. Confirm the unlocked set
is exactly those twenty entries BEFORE running it, since the command locks every unlocked entry.
Afterwards the plain freeze-lint should read `322 frozen file(s) ... 57 "use workflow" module(s) ...
3 retired`, and the manifest diff should be `20 entries added, 0 removed, 0 changed`.

11b. **Ticket closures with hosted evidence.** Twenty-five tickets across seven lanes:

| lane | tickets | migrations |
|---|---|---|
| 01 payroll, agreements and tenancy | #944 #945 #946 #947 #948 #949 | 0296 0297 0298 0299 0300 |
| 02 staff expense claims | #930 #931 | 0301 |
| 03 accruals | #937 #938 #942 | 0302 0303 0304 |
| 04 prepayments and deferred revenue | #939 #940 #915 #941 #1036 | 0305 0306 0307 0308 0315 0317 |
| 05 depreciation proposal, signed-out invite | #933 #871 | 0309 |
| 06 knowledge, firm setup, client birth | #1031 #1032 #1038 | 0310 0311 0316 0318 |
| 07 runtime readiness and rollback safety | #1033 #1035 #877 #1041 | (none) |

Plus the PRE-STEP `0295`, which belongs to #941, #942, #946 and #949 jointly and should be cited on
all four.

Read each ticket's real title with `gh issue view <n>` before commenting. Comment shape, unchanged
from the six prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`, release
session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail notice
text, and, where the AC named a hosted behaviour, the specific reading step 7, 8 or 10 produced.
Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane comment above,
hosted evidence here."*

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback command
and the runtime/database asymmetry named in step 9.

**Still owed after this wave, and not part of it:** the ONE shared successor cut `chatTurn_v22` /
`claraWork_v6` (#985, #1000, #1030, #1037), which carries every successor contract this wave
delivered. Wave 4 adds two frozen families but repoints NO existing class, so that cut is untouched
by this release and still owed at the end of the programme.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the registry
  counts, the chart adoption census, the role census, the `accrual_adjustments` row count and the
  machine and web ids are taken from `RELEASE-W3-RUNBOOK.md` § RESULTS, the migration files and the
  rig; none is read from hosted.
- **RELEASE_SHA does not exist yet.** The wave-4 PR is unmerged and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `fb1dae78a`, the final
  integration head. That head moved four times while this was being written (`89e0a408f`,
  `2f7ada3a8`, `bb102839c`, `fb1dae78a`); the pending set, the file count, the 189/136/53 pin split
  and both dry-run verdicts were re-derived at each one and are the same at every one.
- **The head is not final.** Lane 07 owes a SECOND merge on the integration branch. When it lands,
  the migration list must be re-derived, both dry runs re-run and this runbook's arithmetic
  re-checked. The file count `309` and the tip `0318` are the interim head's.
- **The `agreementFacts` registry-roster defect is FIXED** on the final head `fb1dae78a`
  (`registry-view.test.mjs` 7/7). It was open on `89e0a408f` and `bb102839c`. Re-check at
  RELEASE_SHA: if it ever regresses, `bodies=57` and the fourteen-pin boot line in step 7 are
  wrong and the release must not proceed.
- **No upgrade replay was run.** Section 0 is a list of what is owed, not a record of what was done.
  The gate worker owns that proof. The integrator's own from-scratch chain predates both the
  `0317`/`0318` renumber and lane 04 and must not be read forward.
- **The rig is empty where hosted is not.** On `clara_w4_hosted`, `document_processing_tasks`,
  `document_extractions`, `entry_post_receipts`, `accrual_adjustments` and `prepayment_schedules` all
  hold ZERO rows. So every "would this pass" read returned a trivially clean answer, and the negative
  control that needed real rows was run against `clara.document_capabilities` (240 rows) instead.
  **The populated-row behaviour of the fifteen constraint swaps and of 0304's backfill is unproven at
  any scale.**
- **The duration of the two registry raises is unknown**, because hosted's trigger cost per row is
  unknown. The count is measured (240 rows x 2 raises x 4 triggers = 1,920 firings); the wall clock
  is not. This is wave 4's equivalent of wave 3's 0290 CHECK scan.
- **The PostgREST schema-cache behaviour** after the six `list_review_queue` splices and the two
  registry rewrites is unverified from here.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.
- **The invite-preview ceremony has never been run against hosted.** Its two verification reads and
  its smoke were measured on the lane rig only, and 0309's own §D platform probes (`anon`,
  `authenticated`, `service_role`, `authenticator`) are inert on a rig and have therefore never been
  seen to FIRE.
- **The signed-in walks of waves 2 and 3 were never done** (both as-runs say so). If they are still
  owed at this window, they are owed against a 0318 database, not a 0272 or 0293 one.

---

## § RESULTS (as run, ____-__-__, UTC)

Leave blank until measured.
