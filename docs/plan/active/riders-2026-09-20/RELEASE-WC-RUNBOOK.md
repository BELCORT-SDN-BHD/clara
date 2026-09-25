# Hosted release ceremony, riders CUT PHASE: migrations 0320 0321 0323 + a VERSION CUT + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on `RELEASE-W4-RUNBOOK.md` and on
its `§ RESULTS (as run, 2026-09-24, UTC)` and its signed-in walk, whose lessons are folded in rather
than repeated: the via-probe wrapper, streaming a bundle over `ssh console` instead of sftp, the
role-level fingerprint overrule, and the WSL-node rule for the backup.

RELEASE_SHA = **`________`** (the merge commit of the cut-phase PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**THIS RELEASE IS DIFFERENT IN KIND FROM THE FOUR BEFORE IT, and the difference is one sentence.**
Waves 1 to 4 added doors, relations and two whole new workflow CLASSES, and repointed nothing. This
one REPOINTS THREE PINS - `chatTurn v21 → v22`, `claraWork v5 → v6`, `statementFacts v3 → v4` - and
a repoint changes what a rollback means, what the boot line must say, and what step 11a locks. The
three migrations are small; the version cut is the release. Read section W and step 9 before
anything else.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\int2` (branch `integration/riders-cut`, head **`34b125e6f`**, both
lanes merged and one `fix(integration)` on top) carries **312** files under
`packages/db/migrations/`, highest version `0323_trade_invoice_probe_self_exclusion`. Hosted is at
**309 / `0318_knowledge_fye_pair_applicability`** (`RELEASE-W4-RUNBOOK.md` § RESULTS, 2026-09-24;
re-read live at step 3). So the migrate step should report

```
migrate: 3 new migration(s) applied · 312 total
```

312 is the FILE count (`packages/db/scripts/migrate.mjs` prints `migrations.length`); `0323` is only
the highest version NUMBER. **`0319` and `0322` are absent from the tree - reserved by `CUT-PLAN.md`
§1.2 A4 and §3.2 and never used**, which is lawful: the runner does not ask for gapless numbering,
exactly as wave 4's `0294` and `0312...0314` were. Re-derive this against whatever `main` and the
hosted ledger actually are at window time: the preflight script prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-W4-RUNBOOK.md` § RESULTS; re-read live at step 3):
DB **309 / `0318_knowledge_fye_pair_applicability`**. Runtime image **`refresh-6da02a8d`** =
`registry.fly.io/clara-runtime@sha256:be29627ca473006daa3f0432e3e924e4c2844b3f9346893fe9b4ae21417bad80`
(265 MB, measured boot `bodies=57`, pins `chatTurn=chatTurn_v21` / `claraWork=claraWork_v5` /
`statementFacts=statementFacts_v3` and eleven others), single Fly machine **`48ee715b763048`**
(never touched directly; exactly two calls all window, `stop` and `start`). Web
**`57c5dbab-5706-4a8b-a50a-a96fa37f6d97`** (tag `refresh-6da02a8d`, promoted to 100% on 2026-09-24, the promotion running 17:59:18Z to 17:59:25Z;
the one before it is `b659a3d4-a253-4f49-8a7e-c89306f6ab82`).

**Secrets rule (unchanged from all seven prior runbooks).** The fly token and the DSN are
substituted INLINE inside one pipeline only: never assigned to a shell variable, never echoed, never
in argv. Reuse the wave-2/3/4 wrapper shape:

```
# C:\Users\zhant\AppData\Local\Temp\claude\...\scratchpad\release-wC\via-probe.sh
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

**Nothing in this release asks the operator to type a password.** Wave 4's step 6e was a one-off;
this cut mints no role, needs no new secret and sets none.

---

## 0. Rehearsal: the 0318 -> 0323 UPGRADE replay, and what exists of it

- The **gate worker** upgraded both hosted-shaped rigs with the merged tree on 2026-09-25 and
  exported both fingerprint baselines: `scratchpad/wC/fp-wC-hosted.json` (the PRE baseline,
  `clara_w4_hosted` at 309 / 0318, 11346 structural keys) and `scratchpad/wC/fp-wC-upg.json` (the
  POST baseline, the same database at 312 / 0323, 11356 keys). Confirm with the gate worker that
  both came from the SAME script and the SAME tree before either is used.
- The **integrator's** from-scratch chain, `clara_cutint` on `rigw4` (127.0.0.1:55700), reported
  `312 new migration(s) applied · 312 total` with all three cut files on their FIRST-apply branch,
  each printing its own prestate and tail notice, and a second `migrate` reporting `0 new · 312`
  (`reports/waveC-merge.md` §4).
- The **release-preparation worker** dry-ran the preflight both ways against those rigs; the table
  is in `ceremony-wC/README.md` and summarised in `reports/waveC-release-prep.md`.

- The **gate worker ran the replay and timed it** (`reports/waveC-gates.md` §2): on
  `clara_w4_hosted` (55701, `C.UTF-8`) `3 new migration(s) applied · 312 total` in **6 s**, exit 0,
  every prestate clean and every tail green; on `clara_w4_coll` (55702, `en_US.UTF-8`) the same, in
  **1 s**. So step 6c's budget is seconds, not wave 4's 1 min 33 s.
- **Both data-dependent branches were ENTERED rather than skipped**, by planting through the real
  doors: 0321 read 1 source-corrected cancellation receipt where the from-scratch chain read 0, and
  **0323's §TAIL ran its whole driven block** rather than its notice, printing `driven - the
  unnarrowed core returns invoice 5c317f34-036e-456b-ad18-5177db9582a0, the narrowed one does not`,
  with the vacuity control, the narrowing, the `match_count` restatement and both key controls. On
  `clara_w4_coll` both branches took the EMPTY arm, so both arms of both branches are now measured.
- The **two-build cutover drill was run** on a fresh cluster and passed, **three legs** including a
  `statementFacts` v3 to v4 leg (`waveC-gates.md` §1). The merger had not run it and lane C2 had
  priced that third leg as new work.

Nothing in section 0 is still owed. What remains unmeasured is listed under "What this draft could
not verify" and is hosted-only.

A rehearsal on a seeded cluster proves DDL and guard logic, **not** the row-shaped hazards. This
cut has exactly two of those and they are named in step 3c: 0323's driven tail, and the capability
of the migrating role.

## 0a. Gates before any production step

- `main` = RELEASE_SHA, `ci` SUCCESS on that sha, the build tree equal to RELEASE_SHA, `git status
  --porcelain` empty apart from the untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time, never a literal written before.
- **Owner says go**, in-session, for this specific window.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F):
  hosted users and data are test data. Confirm it is still true before treating any parked run as
  disposable. **It matters more here than in any prior wave**: a version cut's whole risk surface is
  what is parked at the moment of the cut.
- **`node scripts/check-frozen-workflows.mjs` on RELEASE_SHA must read `347 frozen file(s) / 60
  "use workflow" module(s) / 3 retired`.** Against main's `322 / 57 / 3`. And
  `--compare-base origin/main` must read **322 unchanged, 25 additions, 3 retirements - 0 changed,
  0 removed**. Additions-only, proven rather than asserted; the merge report measured all of it at
  the integration head and it must be re-measured at RELEASE_SHA.
- **`node --test packages/runtime/tests/registry-view.test.mjs` must read 7/7.** This is what makes
  step 7's boot line readable: it proves each of the three new identifiers is present at all five
  sites (import, dispatch, re-export, `workflowBodies`, `workflowPins`) and that each pin names the
  function `workflows` actually dispatches. Wave 4's equivalent gate caught a real blocker on two
  interim heads; run it.
- **The boot line's expectation, derived rather than written.** The preflight prints it out of
  RELEASE_SHA's own `registry.ts`:

  ```
  CLARA_REPO=<RELEASE_SHA tree> CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
    node docs/plan/active/riders-2026-09-20/ceremony-wC/reads-wC.mjs \
         --plan --frontier-before 0318_knowledge_fye_pair_applicability
  ```

  Expect `bodies=60`, fourteen pins with `chatTurn=chatTurn_v22 claraWork=claraWork_v6
  statementFacts=statementFacts_v4`, `SUCCESSOR BODIES … chatTurn_v22, claraWork_v6,
  statementFacts_v4`, `35 UNLOCKED` manifest paths, 3 pending files, 40 pins (40 measurable / 0
  chained), 9 hand checks, **0 GAP**, exit 0.
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` to confirm the active version is `57c5dbab-5706-4a8b-a50a-a96fa37f6d97` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy 57c5dbab-5706-4a8b-a50a-a96fa37f6d97@100% --yes`.
- **Two rulings this cut asked for and that must be answered before the window, not during it**
  (`reports/waveC-lane01-fix.md` §10, carried by `reports/waveC-merge.md` §7):
  1. **0320's SECURITY posture** (C1-SPEC-01 / std-1). The migration recuts
     `clara.get_client_financial_pack` from SECURITY INVOKER to SECURITY DEFINER and moves its
     computation into an ungranted `_core`. The lane argues the estate's own `_*_core` containment
     idiom (`0082_wave_e_zeta_render_jobs_part4.sql:14-17`, `0004:749-750`) and proves by
     reverse-hash that no figure moved; the ticket's own out-of-scope line says "do not recut the
     read's body". Accept the split, or defer #1000 - there is no third option that ships a working
     tool, and the migration is already in the chain, so a deferral is a re-cut of the branch rather
     than a runbook decision.
  2. **AC3's Work-walk clause and AC1's A5, A8 and A9 as PARTIAL** (C1-SPEC-02, -03, -06, -07), with
     follow-ups filed; and that `CUT-PLAN.md` §2.4 beats AC2's `--lock-deployed` wording, with the
     command carried into step 11a below (C1-SPEC-08).
- **DB RESTORE POINT**: step 3f. Take it before the first hosted write; re-take it if the window
  opens more than about 2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery").

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-6da02a8d --app clara-runtime \
      --name probe-wc --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy. Step 9 needs a SECOND probe on the same serving image.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-wC/reads-wC.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs` (through `via-probe.sh`). It opens `begin transaction read only` and
issues nothing but SELECTs, each under its own `SAVEPOINT`, so a soft failure never poisons the
rest. It prints facts only: never the DSN, never an e-mail address, never any personal data. Exit
code is non-zero when any check says STOP.

**Nothing in the script is transcribed.** Every expected value is PARSED out of
`CLARA_MIGRATIONS_DIR` at run time, and the boot-line expectation is PARSED out of `CLARA_REPO`'s
own `registry.ts` and `frozen-workflows.json`. A literal it cannot parse is a **PARSE GAP** and
counts as a STOP. **`CLARA_REPO` is load-bearing here in a way it was not in wave 4** - point it at
the RELEASE_SHA tree, or the version-cut reads describe the wrong image.

Then, through the probe:

```
PROBE=<probe-id> via-probe.sh node docs/plan/active/riders-2026-09-20/ceremony-wC/reads-wC.mjs \
      --prod --baseline scratchpad/wC/fp-wC-hosted.json
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted pooler estate
(`db=postgres`, port 5432, not loopback). Ledger expect **309 / `0318_knowledge_fye_pair_
applicability`**; drift gate over all 309 applied rows (`migrate.mjs` aborts the whole run on one
checksum mismatch, so a drift here is a STOP before the window rather than a surprise inside it);
the pending set listed and asserted to be exactly the three files above the frontier; and the
printed arithmetic `309 + 3 = 312 / 0323_trade_invoice_probe_self_exclusion`. The run writes
`ceremony-wC/reads-wC.state.json` so `--post` can re-derive that sum.

**3b. THE ESTATE FINGERPRINT.** The script compares hosted against `fp-wC-hosted.json`, produced by
the same script from a rig database at the hosted frontier. Coverage is unchanged from wave 3 and
wave 4: every function in `clara` (identity signature, `sha256(prosrc)`, owner, SECURITY DEFINER,
`proconfig`, ACL), every relation (columns, constraints with `convalidated`, indexes, RLS enabled
and forced, policies, triggers with `tgenabled`, view definitions, owner, ACL), the schema's own
types, and the `clara%` roles with their memberships.

Role-level rule, unchanged: `role:` and `rolemember:` differences print as **`env`** lines, with
both sides, and never count as a STOP. Everything else still STOPs. **This cut mints no role.**

**One thing IS narrower than wave 4's, and it is a finding rather than a preference.** A difference
on an object a pending file merely NAMES still prints as TOLERATED - but "names" is now read out of
the file's EXECUTED statements, not its whole text. 0320 is 1,354 lines of which about 720 are
#660's accounting body carried verbatim into a new core, naming `clara.journal_lines`,
`clara.journal_entries`, `clara.cash_account_set_versions` and a dozen more relations this cut does
not touch. Measured both ways on one corrupted baseline: under wave 4's rule
`rel:cash_account_set_versions:meta` printed `ok TOLERATED`; under this script's it prints
`STOP DRIFT`. Expect on hosted: **0 DRIFT, 0 PINNED DRIFT, and the same role-level `env` lines waves
2, 3 and 4 saw** (wave 4's pre-window read counted 14; re-count them, a fifteenth is a finding, and
wave 4's own post-ceremony reads ended at 16 after 0309's login flip).

**3b-bis. THE BODY-PIN LEDGER: 40 pins, and NOT ONE OF THEM IS CHAIN-INTERNAL.** Wave 4 carried 189
of which 53 could not be measured before the window, because its lanes recut each other on purpose.
This cut's three files touch three disjoint families, so every pin is measurable now:

| file | pins | what it recuts |
|---|---|---|
| 0320 | 12 (11 unconditional neighbours + the one recut body) | `clara.get_client_financial_pack(uuid,date,date)` |
| 0321 | 18 (16 unconditional neighbours + two recut bodies) | `clara.revise_document_fact(...)`, `clara._question_source_corrected(uuid)` |
| 0323 | 10 unconditional neighbours | **nothing** |

**A recut pin here is bimodal in a way the ledger cannot hold, and the operator must know it before
reading a refusal.** Wave 4's bimodal admissions were two shas in one roster tuple. All three of
this cut's recut pins admit their pre-image OR "a body carrying this file's own attribution", tested
with `position('<literal>' in v_src) > 0` - there is no second sha to record. So a target that has
ALREADY taken a file reads as a STOP PIN on exactly the recut signature. Measured on a rig at 312:
**37 of 40**, the three failures being precisely those three bodies. On hosted, which takes the
FIRST APPLY branch, expect **40 of 40**. If one of the three refuses, read the live body before
calling it drift: the script prints the file's own REDO literals beside the refusal.

**3c. THE DATA PRECONDITIONS a rehearsal on a seeded rig cannot prove about hosted.** Nine hand
checks, each with its expected value parsed from the file that owns it. Two of them are the real
content of this step; the other seven are cheap and complete the list.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| **D-TAIL-REACH** | all three | every §TAIL calls a body owned by `clara_fn_owner` and granted to NOBODY, after `reset role` | `current_user`, `rolsuper`, `pg_has_role(current_user,'clara_fn_owner','MEMBER')` and `'USAGE'`, and `pg_has_role(current_user,'clara_agent_ro','MEMBER')`. **THIS IS THE ONE CHECK NO RIG CAN ANSWER** and the most load-bearing unknown in the cut: see the box below |
| **D-PROBE-DRIVEN** | 0323 | §TAIL (T4) DRIVES its narrowing against a real recording, and its first assertion is a VACUITY CONTROL that refuses the migration | the file's own selector, re-run read-only: a trade invoice under a keyed, still-postable Work with a reference and no reversed entry. Where one is picked, the UNNARROWED three-argument core must MATCH it. Exercised for real on `clara_cutint` (53 keyed invoices, control held, `match_count 1`); every hosted-shaped rig picks NONE |
| **D-CUT-PREMISE** | all three | each file refuses outright if the cohort it extends is absent | the 14 objects the three §0.1 blocks name (0232's three doors plus the wake machinery and `clara._human_ctx`; 0268's cohort; 0275's probe cohort) must all be PRESENT |
| **D-CUT-NEWBORN** | all three | each §0.3 refuses a PARTIAL BIRTH by name | the 10 signatures this cut creates (0320 x2, 0321 x6, 0323 x2) must all be ABSENT. A full house would take the REDO branch instead; anything between is a half-applied file |
| **D-PACK-ALLOWLIST** | 0320 | the ONE row this cut writes, `on conflict do nothing`, and §TAIL (8) requires exactly one | `clara.wake_fn_allowlist` must hold ZERO rows for `wake_get_client_financial_pack` today, or the insert is a no-op and the tail counts somebody else's row |
| **D-PACK-POSTURE** | 0320 | §TAIL (7) refuses if any machine-lane role holds EXECUTE on #660's three doors, and if the human door loses its grant | the `clara%` roster is printed (hosted carried 19 in wave 4 where a rig reads 18 or 20); the check is NEGATIVE, so extra roles widen what it examines rather than breaking a count. `clara_authenticated` must still hold the human door |
| **D-REVISE-GRANT** | 0321 | §TAIL (T6) requires `clara.revise_document_fact` to keep its `clara_authenticated` grant, which `create or replace` preserves | exactly one `clara_authenticated` aclitem on it today. Absent today means absent after, and T6 raises |
| **D-REDERIVE-BACKLOG** | 0321 | §TAIL (T9) refuses on a FIRST APPLY if any `source_correction_rederivation` receipt exists | ZERO such receipts (the function that writes them is created by this file). Beside it, the `source_corrected:%` cancellation backlog is read for FACTS: that count is what the new belt reads on its first sweep after the release, and it is the number to watch in step 7's log |
| **D-PROBE-ARITY** | 0323 | §TAIL (T2) requires exactly two overloads of the probe twin afterwards and NO default on either sibling | exactly ONE overload today, carrying no default. A default would make `chatTurn_v21`'s own four-argument call ambiguous |

> **D-TAIL-REACH, stated at length because it is the thing this ceremony can most plausibly trip
> on.** All three files do `set role clara_fn_owner`, create their objects, `reset role`, and then
> run a §TAIL that CALLS functions owned by `clara_fn_owner` and revoked from everyone: 0321 drives
> `clara._fact_value_changed(jsonb,jsonb,text)` fifteen times plus `clara._fact_calendar_day(text)`
> and `clara._source_correction_rederivation_brief(text)`; 0323 drives
> `clara._trade_invoice_probe_core`; 0320 additionally does `set_config('role','clara_agent_ro',
> true)` inside a subtransaction, to prove the ungranted core refuses that role directly. On every
> rig the migration runs as a SUPERUSER, which bypasses the ACL, so **no rig run of these files has
> ever exercised the privilege path**. If hosted's migrating role is not a superuser and does not
> INHERIT `clara_fn_owner`, the tail raises `42501` and the file rolls back whole - a clean,
> contained failure that leaves the ledger honest, but a failure. Read this BEFORE the window; it is
> the first line of step 3's output worth reading out loud.

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective. Derived by stripping every `create [or replace] function` BODY from each file, because a
body is inert at apply time, and reading only what is left.

- **There is no `ALTER TABLE` in this cut. No `CREATE INDEX`. No `SET NOT NULL`. No `VALIDATE
  CONSTRAINT`. No top-level `UPDATE`. No top-level `DELETE`. No new relation. No new column. No new
  role.** That is parsed, not claimed: the preflight's six generated-read sections all print empty,
  and the quiescence census's watch list is the single relation the cut writes to.
- **The ONE write is one row**: `insert into clara.wake_fn_allowlist values ('interactive',
  'wake_get_client_financial_pack') on conflict do nothing` (0320 §D).
- **0320, 0321 and 0323 create or replace twelve functions between them.** `create or replace
  function` stores text and runs none of it, and takes no table lock.
- **0320's §TAIL (9), 0321's §TAIL (T3, T4, T8) and 0323's §TAIL (T4) execute their own new
  bodies.** Those are reads; the first two are over literals, the third over live rows (D-PROBE-DRIVEN).
- **0321's §D function bodies contain INSERTs** into `clara.document_extractions`,
  `clara.document_regions` and `clara.document_fact_revisions`. They are inside
  `clara.revise_document_fact`'s body and run when a person corrects a fact, not when the file
  applies.

**3f. DB RESTORE POINT: the full dump, through the probe DSN into WSL.** `backup.mjs --profile full`
(`pg_dump` 17.11 lives in WSL; Windows has none). Wave 4's took 68 s for 220,143,562 bytes plus a
12,177-byte globals dump. **Run it under WSL's OWN node**, not a Windows-path node invocation -
that was wave 4's deviation 2. The CA-path workaround (#917) is still required unless `--child-os
wsl` is present on RELEASE_SHA; re-check rather than assume. Record the artefact path, the byte
count and its sha256.

## W. Deploy order, decided from the three headers and from the runtime's own source

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine IS
STOPPED before the migrate and started again only on the NEW image.** Same order as waves 2, 3 and
4 - but for the first time in this programme the runtime leg is **FORCED BY A BODY'S OWN SOURCE**
rather than by a migration header, and the machine stop is bought by a different argument than wave
4's. Both are worth stating.

### The order is forced, and the forcing statement is in the runtime, not in a migration

`grep -niE 'deploy order|write-quiet|quiesce'` over `0320`, `0321` and `0323` returns hits in
exactly **one** file, 0323, and it says DATABASE FIRST:

> "HARMLESS WITHOUT THE RUNTIME. The old doors keep answering exactly what they answered, so an
> image deployed before this file behaves as it does today; the five-argument twin is reached only
> by `chatTurn_v22`. **The reverse is NOT true: deploy this file before the image.**"
> - `0323_trade_invoice_probe_self_exclusion.sql`

The other two say nothing, and under `ARCHITECTURE.md` §5.F silence is readable: the obligation to
invert is written in the migration's own header. **But this cut's forcing constraint is not in a
migration at all - it is in `claraWork_v6`'s own body**, and a reader who only greps the migrations
will miss it:

> "THE DEPLOY ORDER FOLLOWS FROM THAT, in one direction: migration 0321 must be LIVE BEFORE this
> image runs any Work. Against a database without it every Work settles `failed`/`internal` with
> nothing posted - loud, contained, and the correct failure for a deploy-order mistake, exactly as
> v5's own 0230 stanza reasons. The REVERSE order is free: 0321 against a v5 image adds doors that
> nothing calls."
> - `packages/runtime/workflows/claraWork.v6.impl.ts:1092-1096`, `loadSourceCorrectionBriefStepV6`

That step is asked **ONCE, before the loop, for EVERY Work**, and it deliberately does not swallow
its own failure: "a read that did not land must settle the run RECOVERABLY rather than let it
proceed as though the answer had been 'no'". `packages/runtime/README.md:53-55` records the
asymmetry that makes this matter: on the chat lane a missing function is a typed refusal and the
turn survives; **on the Work lane it is TERMINAL**. So an image released before 0321 stops the
entire Work lane, recoverably and loudly, for every client. `packages/runtime/README.md:45-48` says
the same in the pin section. **0321 before the image is not a preference.**

Per migration, then:

| file | its consumer in this image | order | evidence |
|---|---|---|---|
| **0320** | `read_client_financial_pack`, a `chatTurn_v22` tool calling `clara.wake_get_client_financial_pack` | DATABASE FIRST, non-optional in practice | `reports/waveC-lane01-ticket1000.md` § Anything unverified: "0320 before the image, or the tool answers `42883` as an internal fault on every call". Chat-lane, so a turn survives it, but the money band simply stops answering and that is not a state to ship |
| **0321** | `claraWork_v6`'s own body, plus `lib/reconciler-work-source-correction.mjs` | DATABASE FIRST, **FORCED** | `claraWork.v6.impl.ts:1092-1096`, above. Every Work settles `failed`/`internal` without it |
| **0323** | `chatTurn_v22`'s duplicate probe, the five-argument twin | DATABASE FIRST | the file's own header, quoted above |

### What the OLD image does between the migrate and its own replacement, checked rather than assumed

- **`claraWork_v5` never calls any of the six 0321 doors.** They are new names; v5's tool roster and
  body predate them. The re-derivation BELT ships in the same image as v6, so a 0321 database under
  a v5 image "adds doors that nothing calls" - the file's own words. No backlog is drained, nothing
  is admitted, nothing is settled.
- **`chatTurn_v21` never calls the five-argument probe twin.** 0323 leaves 0275's four-argument door
  and three-argument core BYTE-UNTOUCHED and its §TAIL (T1) proves it by re-measuring both. A parked
  v21 run reaches exactly the body it always reached.
- **`clara.get_client_financial_pack` is recut, and the serving WEB calls it.** This is the one live
  human door this cut moves, so it is checked rather than waved past: the signature, the defaults,
  the return type, the envelope, every coverage word and every refusal code are unchanged, the floor
  is the same VIEWER floor raising the same three CLR04s (`clara._human_ctx` replaces an inline copy
  of the estate's own floor), and §TAIL (3) REVERSES the three anchored edits on the LIVE body and
  requires the result to hash to 0232's pinned pre-image. A digit changed anywhere in about 720
  lines of accounting arithmetic reds the migration instead of shipping. So the client home's money
  band answers identically across the window.
- **`clara.revise_document_fact` is recut, and the serving web calls it too.** The change is ONE
  substitution: the equal-value guard gains the field path, so a re-cased ISO currency code and a
  respelled calendar day now read as UNCHANGED and refuse `value_unchanged` before anything is
  written. That is the intended new behaviour arriving one promotion early, and it is strictly
  safer: the old behaviour retired every parked Work and made a carved-out question's answer
  permanently refused. `apps/web/lib/documents/doors.ts` gained a COMMENT only, so nothing the old
  web renders changes.
- **`clara._question_source_corrected` is recut** with the same one substitution, and it is read
  through `clara.list_review_queue`. The queue's roster does not move, so Needs-you renders exactly
  what it rendered.
- **No PostgREST schema-cache question arises.** This cut adds no relation, no column and no row
  kind to `clara.list_review_queue`, so the wave-4 watch item (a `PGRST202` after six splices) has
  no analogue here. The two new granted doors are `clara_agent_ro`'s and `clara_runtime`'s, which
  PostgREST never reaches.

### Is the machine STOP needed? Yes, and not for the reason a version cut suggests

**The version cut itself does NOT need it.** The rule is the one `CUT-PLAN.md` §2.9 states and
`docs/ARCHITECTURE.md:428-429` carries as policy (c): every superseded body stays exported, so a run
parked on `chatTurn_v21` or `claraWork_v5` keeps its body and the new image carries all sixty. The
boot census (`strandedBodyCensusOnWorld(workflowBodies)`, run before `getWorld().start()`) reads
zero, and the preflight computes the same census before the window so the reading is known rather
than hoped. A new image that carries every old body could, on that argument alone, be released with
the machine running.

**The MIGRATIONS need it, for two specific reasons, and one of them is this cut's own.**

1. **`packages/db/README.md`'s general rule for recutting an active writer body.** 0321 recuts
   `clara.revise_document_fact`, which writes an extraction, a region, a revision row and retires
   every Work parked on the document. PostgreSQL runs an in-flight PL/pgSQL call to completion on
   the body it STARTED with, so a correction spanning the migration applies the OLD guard - nothing
   half-written, but a person's edit settles under a rule the estate has already replaced. The house
   rule is: stop new writes, drain in-flight calls, apply, resume.
2. **0323's §TAIL (T4) evaluates a data-dependent vacuity control across two statements in READ
   COMMITTED, on live tables.** It SELECTs an invoice, then probes with that invoice's own
   particulars - and each statement takes its own snapshot. A concurrent reversal, cancellation or
   recording landing between them can make the unnarrowed core stop matching, and the tail then
   REFUSES a migration that is otherwise correct. Quiescing the writers removes that race. It is
   narrow, and it is the only genuinely new lock-shaped hazard the cut carries.

**What the stop does NOT buy, said plainly.** Stopping the Fly machine quiesces the RUNTIME's
writers: the reconciler, the Work lane, chat turns, the sweep. **The browser talks to PostgREST
directly and is not quiesced by anything in this ceremony** - wave 4's runbook says so in step 6b
and it is still true. `clara.revise_document_fact` and the trade-invoice recording path are both
reachable from the browser. In beta the only browser session is the owner's, so the operative
instruction is the one every prior window used: the operator does not drive the product between 6a
and 8. Step 6b's `pg_locks` read is what makes that real rather than nominal.

**The cost of the stop is one extra call.** The machine must be restarted anyway to pick up the new
image, so the stop costs the difference between `deploy` + `start` and `stop` + `deploy` + `start`.
Wave 4's outage was 4 min 47 s for 21 files; this cut's migrate is three files that scan no table,
so budget generously but expect less.

**THE TIMEOUT PICTURE.** `migrate.mjs` arms nothing itself.

- **`statement_timeout = '20min'`**: 0320 and 0321, both describing it as PRECAUTIONARY in their own
  comments ("this file creates two functions, replaces one, and writes one row. It runs no backfill
  and scans no table").
- **NEITHER `statement_timeout` NOR `lock_timeout`**: 0323.
- **No file arms a `lock_timeout` at all**, and no file takes a lock heavier than ROW EXCLUSIVE on
  one row of `clara.wake_fn_allowlist`. There is no `ALTER TABLE` to block. Step 6b's `pg_locks`
  read is therefore about the READS the tails perform, not about a DDL queue.

**So web goes LAST.** Of the doors this cut creates, the only browser-facing change is
`clara.revise_document_fact`'s guard, which is already live once the migrate lands. The web build
carries no new route and no new part kind (measured: `apps/web/lib/parts/**` and
`test/manifest.txt` are untouched by both lanes, `catalog.test.tsx` still totals 31, and the one
`apps/web` file the cut touches, `lib/documents/doors.ts`, is a comment-only change). Web still goes
last, because a promotion is the cheapest thing to hold and the order has never cost anything.

## 4. Runtime image first, build-only and push, released by digest

```
... flyctl deploy --config packages/runtime/fly.toml --build-only --push \
      --image-label refresh-<RELEASE_SHA> --build-arg CLARA_BUILD_SHA=<full sha>
```

About five minutes; record the `sha256:` digest and release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7, never by tag. The Docker build runs
`nitro build` only: it does NOT run the bundle gate or the freeze-lint, so those counts are `ci`'s
and step 11a's, not this step's output. Nothing built here is released until step 7.

**One boot-shaped thing to know before it is seen.** Booting the built bundle DIRECTLY
(`node .output/server/index.mjs`) prints the provenance line and the stranded census and then
refuses the durable world with `Invalid version string: "bundled"`. That entry point is not how the
image starts - `packages/runtime/Dockerfile:73` is `CMD ["node", "scripts/serve.mjs"]` - and through
`scripts/serve.mjs` the same head starts the world clean. Recorded by the merger (§7.5) so nobody
re-finds it as a release defect.

## 5. Web build and upload, in WSL as root, BEFORE the window

Mechanism unchanged: detached checkout at RELEASE_SHA in `/home/runner/clara-deploy` fetched from
`refs/remotes/origin/main`, `corepack pnpm install --frozen-lockfile`, the two
`NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then
`corepack pnpm --dir apps/web exec wrangler versions upload --tag refresh-<RELEASE_SHA>`. Record the
Worker Version ID. **Not promoted until step 8.**

**New in this release: nothing.** The cut adds no route, no part kind, no message key and no
component; the single `apps/web` change is a doc comment. **`A web `next build` on the integration
head is UNVERIFIED** (`reports/waveC-merge.md` §6: the `int2` worktree has no `apps/web/.env.local`,
so `scripts/check-public-key.mjs` refuses before compilation). This step is where it is first built
with the deploy environment, so treat a failure here as a build-environment finding rather than as a
code one, and read `apps/web`'s own unit suite result from CI (5173 tests, 5171 pass, 2 skipped at
the integration head) as the code-side evidence.

## 6. Writer quiescence, then migrate: all three files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is what buys section
W's two obligations, and it does not quiesce the browser.

6b. Re-run the census through the probe (`reads-wC.mjs --census --prod`). It must come back clean,
and specifically:

- **no holder of the F10 advisory lock**, or the migrate step hangs silently;
- no other backend holding a lock on `clara.wake_fn_allowlist` (the one relation this cut writes to,
  and the whole of the parsed watch list);
- the **version-cut reads** come with the census in this mode. Read them: every non-terminal
  `workflow.workflow_runs` row BY BODY, the stranded-body census against RELEASE_SHA's sixty
  exported bodies (expect **0 stranded**), and **zero runs on `chatTurn_v22`, `claraWork_v6` or
  `statementFacts_v4`**, which cannot exist yet. A non-zero reading there means the new image is
  already serving and this is not a preflight.
- Idle pooler-held `clara_runtime_login` sessions are fine; held locks are not. The
  `statement_facts running` `document_processing_tasks` row is the orphan known since 2026-09-19 and
  is not a blocker.

6c. From the RELEASE_SHA checkout:

```
PROBE=<probe-id> via-probe.sh node packages/db/scripts/migrate.mjs      # cwd = packages/db
```

Expect **`migrate: 3 new migration(s) applied · 312 total`**. Three files, none of which scans a
table; the wave-3 window took 1 min 28 s for 21 files through the ssh hop and wave 4's took 1 min
33 s, so seconds is the expectation here. Do not kill it.

The prestate notices worth reading out loud, because they are about hosted ROWS and hosted
PRIVILEGES rather than catalog shape:

- **0320**: *"#1000 prestate: clean - mode FIRST APPLY, 0232's three doors present, 11 neighbour
  bodies byte-identical"*. `mode REDO` here would mean the file had already run.
- **0321**: *"#1030 prestate: clean - mode FIRST APPLY, 0268 cohort present, 16 neighbour bodies
  byte-identical, N source-corrected cancellation receipt(s) on this rig"*. **N is hosted's own
  backlog** and it is the number the new belt will read on its first sweep after step 7. Wave 4's
  equivalent on the rigs was 0; hosted may differ, and step 3's D-REDERIVE-BACKLOG will have printed
  it already.
- **0323**: *"#1135 prestate: clean - mode FIRST APPLY, 0275 cohort present, 10 neighbour bodies
  byte-identical, N recorded trade invoice(s) under a keyed Work on this rig"*, and then in the
  tail either *"driven - the unnarrowed core returns invoice X, the narrowed one does not"* or
  *"no recorded trade invoice under a keyed, still-postable Work on this rig - the driven arm is
  skipped"*. Step 3's D-PROBE-DRIVEN will have told you which to expect.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state: the
file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b-bis exists so this is discovered before the window, for all 40. Do not
  re-pin and do not edit the migration. Report to the owner with the body name and both shas. **If
  the refusing pin is one of the three RECUT bodies, read the live body first**: the file admits a
  second value its ledger cannot hold, and a target already carrying this file's attribution is a
  redo rather than drift.
- **A 42501 IN A TAIL.** That is D-TAIL-REACH's failure arriving late. The file rolls back whole. Do
  not grant anything to work around it inside the window: report the role and the function, and take
  the ruling outside the window.
- **0323's §TAIL (T4) raising `the unnarrowed core did not match the invoice it was built from`.**
  That is the vacuity control, and it means the row the selector picked stopped matching between the
  SELECT and the probe - a concurrent write, which the stop is supposed to have prevented. Re-run 6b
  to find the writer, then re-run 6c from the ledger's current frontier.
- **Ledger-position branches.** (i) `max(version)` below `0320`: nothing of this cut landed; the
  deployed image `refresh-6da02a8d` is a legal boot target, so `machine start`, report, and do NOT
  promote web. (ii) **`0320` committed and the chain then stopped**: the client home's money band is
  unchanged (the reverse-hash tail proves it) and the only new object is a door `clara_agent_ro` can
  reach and nothing calls. Old image boots; start it, hold web, report. (iii) **`0320` and `0321`
  committed, `0323` not**: the old image still boots and still calls nothing new, but **the NEW
  image must not be released**, because `chatTurn_v22` would probe through a five-argument door that
  does not exist. Start the old image, hold web, report. (iv) all three committed, ledger reads
  **312 / `0323_trade_invoice_probe_self_exclusion`**: drive forward to steps 7 and 8.
- **There is no `55P03 lock_not_available` branch in this cut**, because no file arms a
  `lock_timeout` and no file takes a lock that can be contended: there is no `ALTER TABLE`, no index
  build and no backfill anywhere in the three.

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

**Expected boot lines. THE THREE PINS HAVE MOVED, and `bodies` and the bundle banners move with
them:**

```
serving git_sha=<full sha> frontier=0323_trade_invoice_probe_self_exclusion(312) bodies=60 pins \
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

Three things to check by eye, each of which has cost a previous cut something:

1. **`bodies=60`, up from 57**, and the three pins read `chatTurn_v22`, `claraWork_v6`,
   `statementFacts_v4`. The other eleven are unchanged. **If any of the three still reads its
   predecessor, the image is not RELEASE_SHA's**: stop and report.
2. **`stranded bodies n=0` BEFORE `durable world started`.** The census is what policy (c) buys: a
   run parked on `chatTurn_v21` or `claraWork_v5` keeps its body because this image carries all
   sixty. A non-zero reading means the world refuses DATABASE-WIDE, the crash-only supervisor exits
   1, and under Fly that is a restart loop rather than a park
   (`packages/runtime/README.md:569-614`, `:930-935`). `CLARA_ALLOW_STRANDED_BODIES=1` overrides
   visibly and **is not used at a release**. Read it here, from the boot log: the two-build cutover
   drill proves the carry by resuming each parked run inside build B, but **no line in its own
   output states the census number** (`waveC-gates.md` F2), so this boot line is where that number
   becomes readable.
3. **SIX `clara-work/vN` bundle banners, not five.** This is the last cut's one real defect, and it
   is why it is a numbered check rather than a line in a list: v5 shipped without its banner, the
   engine booted clean on every visible signal (`/health` 200, `/ready` 200, `stranded bodies n=0`)
   and **seven work-lane e2e legs failed** with the misattributed message "serve child did not
   become ready", because `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks on that exact banner.
   The merger measured the sixth banner printing on the integrated head
   (`bundle clara-work/v6 digest=e716d9b046d60052b579d2b6a4f69ce72407393b4ff259a391e479d8f2fca0a5`);
   confirm the digest matches whatever RELEASE_SHA's build prints, and that the line is there at all.

Signed-in `GET /api/build-info` should agree, field for field: `git_sha` = the full sha, `frontier`
`0323_trade_invoice_probe_self_exclusion(312)`, `bodies: 60`, the same fourteen pins, and
`claraWorkBundleIdentityV6()` FIRST in the bundles array.

**Also worth one look in the first sweep's log.** The re-derivation belt
(`lib/reconciler-work-source-correction.mjs`) runs after the accounting-work belt and is
feature-detected per cycle. Expect `Dormant: false` and a backlog count matching step 3's
D-REDERIVE-BACKLOG reading. **A probe that THROWS reports `Ok:false` with `Dormant:false`** - the
belt distinguishes "absent" from "unreadable" on purpose, so read which one it says. If the backlog
is non-zero, the first sweep will admit successors and open confirmation questions on Needs-you;
that is the feature working, and the owner should be told to expect it rather than find it.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all seven prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200.

**No new signed-out surface in this release.** Wave 4's invite-preview block is the newest one and
it is unchanged.

### Signed in, per successor body: one chat walk and one Work walk the owner can do in the product

This is the release's own evidence, and it is organised by BODY rather than by lane, because what
shipped is three bodies. Read-only where possible; the two walks that write are marked, and the
owner decides whether to drive them. Firm BELCORT, client ROME SECRETARY SDN BHD
(`7a045c7f-b7c3-4cf3-b3d9-c82312e35716`) is the session wave 4's walk used.

| body | surface | what to see | writes? |
|---|---|---|---|
| **`chatTurn_v22`** - chat walk 1, the money band | the Clara rail on `/clients/<id>`, ask for this month's cash and profit | Clara answers the SAME figures the client home's Money band shows, and says where they came from. She must not produce a figure the read did not return. If 0320 had not landed the tool would answer an internal fault and she would say she could not read it | no |
| **`chatTurn_v22`** - chat walk 2, the opening basis | the Clara rail, ask her to read an opening source for a seed the client holds | she reports the RECORDED LINE COUNT and nothing else - not a total, not a balance, not one line's amount. A refusal arrives verbatim, naming the region or the unmapped accounts | **yes**, it records parsed targets |
| **`chatTurn_v22`** - chat walk 3, the look-alike stop (the fix round's own behaviour) | the Clara rail, record a supplier bill, then record the SAME bill again in a later turn | the second turn ENDS on a question naming the earlier invoice, with no second Work and no acknowledgement row; answering "record anyway" in a NEW turn records it with exactly one acknowledgement. **And with 0323 live, a retry of one identical call is no longer shown its own recording** | **yes**, two recordings |
| **`claraWork_v6`** - Work walk 1, the confirmation | correct a document fact a parked Work cites (`/clients/<id>/documents`, a recorded invoice), then watch `/work` and Needs-you | the parked Work retires (that is #885, already live), and then the belt admits a SUCCESSOR whose run PARKS on a question naming BOTH figures: "The document now says X where it said Y. Record the corrected figures?" Nothing posts until it is answered | **yes**, a correction and a confirmation |
| **`claraWork_v6`** - Work walk 2, the cosmetic-edit rule | correct the same fact to a re-cased currency code (`MYR` to `myr`) or a respelled date (`2026-03-05` to `5 March 2026`) | the door REFUSES `value_unchanged` and **nothing happens**: no extraction, no revision row, no retirement, and the parked Work's question is still answerable. A re-cased VENDOR NAME still commits, by decision | **no**, the refusal writes nothing |
| **`claraWork_v6`** - Work walk 3, the proposal park (A10 / #933) | `/clients/<id>/registers?tab=fixedAssets`, drive a fixed-asset acquisition through Clara | the run parks on the depreciation-particulars PROPOSAL, which proposes rather than decides | **yes** |
| **`statementFacts_v4`** - the citation | upload a bank statement, then `/clients/<id>/bank` -> Matching, open a line | every extracted line carries a PAGE and a REGION the viewer renders. A line extracted before this release still shows the stated-absence sentence, "No source citation was recorded for this line." Both states on one screen is the proof | **yes**, an upload |

**Wave 4's own walk found what this one will hit too**: on hosted this client holds no uploaded
document, no payroll summary and no agreement, so the document-shaped walks above need ONE upload
each before they can be driven. The owner decides whether to upload; without it, `chatTurn_v22`'s
walks 1 and 3 and `claraWork_v6`'s walk 2 are still drivable, and they are the three that cover the
most of the cut.

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

**Run immediately after step 7, before real traffic can create a run on a new body**, and record the
timestamp. This is the step the cut changes most, and the reason is one sentence: **a wave that only
ADDS bodies keeps the rollback direction trivially clean; a wave that REPOINTS a pin makes the
previous image a stranding target the moment the first non-terminal run of a new body exists.**

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted refresh-6da02a8d index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND probe on
`refresh-6da02a8d`, never from the live machine. **The wave-2 window's sftp extraction stalled at
32 KB twice; stream the bundle over `ssh console` and verify it by `sha256sum` against the machine's
own.** Three gates, and the runbook must say which is demonstrated: (a) `FRONTIER_RULES`' body
rules; (b) `FRONTIER_RULES`' door-contract rules; (c) the stranded-body census. Exit 0 = ALLOWED,
1 = REFUSED, 2 = could not answer, **and 2 is never read as either of the others.**

**THIS IS NO LONGER A PREDICTION. The gate worker drove the preflight FOUR WAYS on a fresh cluster
at frontier 0323** (`reports/waveC-gates.md` §1.4), and the table below is the measurement rather
than the expectation. Reading C is the cut's rollback verdict.

| # | target image | non-terminal runs | verdict | exit |
|---|---|---|---|---|
| A | this head, 60 bodies | v21, v5, v3 | ALLOWED | 0 |
| B | the main-shaped previous, 57 bodies | v21, v5, v3 | **ALLOWED** | 0 |
| C | the main-shaped previous, 57 bodies | **v22, v6, v4** | **REFUSED (unsupported_body)** | 1 |
| D | this head, 60 bodies | v22, v6, v4 | ALLOWED | 0 |

Reading C prints ONE refusal line per body, naming each by its WDK directive
(`workflow//./workflows/chatTurn.v22//chatTurn_v22` and its two siblings), and offers the two
admissible ways forward the CLI always names: retain every non-terminal bundle in the target, or
DRAIN first and re-run until it allows. **Elapsed time is not a drain.** And in all four readings
the database's own frontier rules (0195, 0254, 0279) were satisfied by BOTH targets, with
`live tasks bound to NO run: 0` every time - so the refusal is the body census alone.

**What to expect at the window, and why this cut inverts wave 4's answer on two of the three
gates.**

- **Gates (a) and (b) PASS, where in wave 4 gate (b) refused globally, and that is measured rather
  than reasoned (all four readings above).** `FRONTIER_RULES`
  is a three-row table (`0195` requires `claraWork_v3`; `0254` requires the
  `intake_refusal_record_v1` contract; `0279` requires `fa_parked_run_v1`) and **this cut adds no
  row to it** - checked: `packages/runtime/lib/rollback-preflight.mjs:138-179` is unchanged by both
  lanes. The previous image is `refresh-6da02a8d`, built from wave 4's RELEASE_SHA, which is the
  release that SHIPPED the contract mechanism: `lib/runtime-contracts.mjs` on `origin/main` declares
  both `intake_refusal_record_v1` and `fa_parked_run_v1`. So the refusal wave 4 met
  (`frontier_requires_contract`, and it was the correct answer then) should not recur, and gate (c)
  becomes the deciding gate for the first time in this programme.
- **Gate (c) is the deciding gate, and it is a SNAPSHOT.** `refresh-6da02a8d` carries 57
  bodies; the new image carries those 57 plus `chatTurn_v22`, `claraWork_v6` and
  `statementFacts_v4`. The moment ONE of those three has a non-terminal run, the old image IS a
  stranding target and the preflight will say so by name. The v21/v5 runbook wrote the rule plainly
  (`RELEASE-RUNBOOK-0225-0233.md:500-504`) and it is exactly this case one cut later:

  > "`refresh-a296765c` does not carry `chatTurn_v21` or `claraWork_v5`. It is a legal rollback
  > target **only until the first non-terminal run of either exists** - so gate (b)'s clean result is
  > a snapshot, not a standing guarantee, and it degrades within minutes of the image serving."

  Record which body it was, and the timestamp. `reads-wC.mjs --cut-only --prod` re-reads exactly
  that census and is the cheapest way to re-take the snapshot later.
- **AND A ROLLBACK TO v5 IS NOT FREE EVEN WITH A CLEAN CENSUS, which is new and is the cut's own
  finding.** `packages/runtime/README.md`'s v6 section says it in terms:

  > "**Rollback to v5** stops asking the confirmation and changes no database state, but it is NOT
  > free while the re-derivation belt is live: a successor the belt admits would run under a v5
  > image WITHOUT the confirmation - v5 has no arm for it - and could post a re-derived basis nobody
  > was shown. The belt ships in the same image, so rolling the image back removes both halves
  > together; a rollback should still drain parked confirmations rather than assume they resume
  > identically."

  The preflight cannot see this: it counts bodies and reads a rule table, and "a parked confirmation
  resumes under an image with no arm for it" is a door-contract question of exactly the class #1035
  generalised. **Add this to #1035 as a third rule candidate rather than opening a second ticket**,
  the way wave 4 added its own finding there.
- **The DATABASE cannot be rolled back below the frontier.** Nothing in this cut drafts a
  below-frontier rollback, and the only route is the step-3f dump, which returns no Storage bytes,
  no managed Auth config and no engine state. If a below-frontier rollback is ever wanted it must be
  drafted BEFORE a window, never during an incident.

**Which previous image is lawful at which ledger, stated plainly.**

| ledger | is `refresh-6da02a8d` a lawful boot target? |
|---|---|
| below 0320 | yes, unreservedly: nothing of this cut landed |
| 0320 only | yes: one recut read whose computation is proved unmoved, and one door nothing calls |
| 0320 and 0321, no v22/v6/v4 run yet | yes: v5 calls none of the six new doors, and the belt that would use them ships with v6 |
| 0322 or above, no v22/v6/v4 run yet | yes, with the caveat above: gate (c) is clean but a parked confirmation would resume without its arm |
| **a `chatTurn_v22`, `claraWork_v6` or `statementFacts_v4` run non-terminal** | **NO**: that run's body is not in the old image and it would strand. Gate (c) is what says so, by name |
| any | no secret, no role and no relation in this cut is read by the old image |

## 10. The reads this cut owes on hosted, after the release

Run `ceremony-wC/reads-wC.mjs --post --prod --baseline scratchpad/wC/fp-wC-upg.json
--frontier-before 0318_knowledge_fye_pair_applicability` through the live machine's DSN. It issues
the same SQL step 3 issued, so pre and post sit side by side. It asserts:

1. the ledger reads **309 + 3 = 312** at `0323_trade_invoice_probe_self_exclusion`;
2. all three new migrations have a ledger row whose checksum equals its file;
3. the drift gate over all 312 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified. Expect **the role-level `env` lines and nothing else**.

It then runs the cut's own post reads (`--post` section (f)), which are these:

**The reference row counts that MOVE across the three: exactly one.**

| relation | before | after |
|---|---|---|
| `clara.wake_fn_allowlist` | N | **N + 1** (`interactive` / `wake_get_client_financial_pack`) |
| everything else | unchanged | unchanged |

There is no new relation, no new column, no backfill and no catalogue insert anywhere in this cut.
That is the whole delta on the data side, and it is why this release's risk is in the image rather
than in the database.

Then the questions this cut's own headers ask of hosted:

1. **0320 (#1000): one body, two entrances.** The three names resolve at exactly one `pg_proc` row
   each; all three are STABLE SECURITY DEFINER owned by `clara_fn_owner` carrying both
   `search_path=clara, pg_temp` and `plan_cache_mode=force_custom_plan`; the core's ACL is
   `{clara_fn_owner}` and NOTHING else; `wake_get_client_financial_pack`'s is
   `{clara_fn_owner, clara_agent_ro}`; `get_client_financial_pack` still carries
   `clara_authenticated` and nothing machine-lane; and exactly ONE `wake_fn_allowlist` row, for the
   `interactive` kind.
2. **0320: #660's three doors gained no machine-lane grant.** The §TAIL (7) census, re-read: no
   `clara_runtime`, `clara_agent_ro` or `clara_wake_%` role holds EXECUTE on any of the three.
3. **0321 (#1030): the six new bodies exist with their exact grants.** Three lane doors carrying
   `clara_runtime` and nothing beyond it (`source_correction_rederivations`,
   `settle_source_corrected_rederivation`, `source_correction_successor_brief`); the two helpers and
   the shared brief builder ungranted (`{clara_fn_owner}` only).
4. **0321: the correcting door kept its ACL and 0268's two-argument notion was not recut.**
   `clara._fact_value_changed(jsonb,jsonb)` must still read
   `7d4f995cc61a615def90ba57408ff85d2215582d9114c73b485e7147dd205869`;
   `clara.revise_document_fact` must still carry `clara_authenticated`.
5. **0321: the lane settled nothing at apply, and the backlog it inherits.** Zero
   `source_correction_rederivation` receipts at the moment of the migrate, and the
   `source_corrected:%` cancellation count - which is the first sweep's workload and the number to
   compare against step 7's log.
6. **0323 (#1135): both siblings born, neither carrying a DEFAULT.** Two overloads each of
   `clara._trade_invoice_probe_core` and `clara.probe_trade_invoice_duplicates_for`,
   `pronargdefaults = 0` on both new ones, the five-argument twin's ACL exactly
   `{clara_fn_owner, clara_runtime}` and the narrowing core ungranted.
7. **0323: nothing it delegates to was recut.** The five pinned bodies re-measured, with
   `clara._trade_invoice_probe_core(uuid,text,jsonb)` still at
   `74215b42802317f0aa8c2dc1dea48488a562bc8ee17f1df53a41c8b2b6a7cf56` - that is the body
   `chatTurn_v21`'s parked runs reach.
8. **The version cut, re-read.** The run census by body, the stranded census (still 0), and the
   first runs appearing on `chatTurn_v22`, `claraWork_v6` and `statementFacts_v4`. That last number
   is the one that makes step 9's snapshot expire, so record it with a timestamp.

Also re-read the quiescence census once more and record it.

## 11. Manifest, then the tickets

11a. **`node scripts/check-frozen-workflows.mjs --lock-deployed`, and it locks THIRTY-FIVE entries,
not twenty-five.** Read this paragraph before running it, because the command locks every unlocked
entry GLOBALLY and the count is not the one a reader expects.

- **Why it is not run earlier.** `packages/runtime/README.md:1037-1039`: run it "and commit the
  manifest **after** the image is live, locking before deploy would freeze a body that no parked run
  can yet exist for." `CUT-PLAN.md` §2.4 repeats it, both lanes declined to run it by decision
  (`waveC-lane01-fix.md` §8 C1-SPEC-08, `waveC-lane02-ticket1037.md`), and the merger confirmed the
  manifest is correct without it (`reports/waveC-merge.md` §3).
- **Why thirty-five.** The unlocked set at the integrated head is this cut's **25** (8 `lib/`
  modules, 5 `chatTurn.v22.*`, 7 `claraWork.v6.*`, 5 `statementFacts.v4.*`) **plus wave 4's 10**
  (`payrollFacts.v1.*` and `agreementFacts.v1.*`), which were never locked. Wave 4's own § RESULTS
  records `--lock-deployed` as having "nothing further to do", and that reading was wrong: the ten
  are still `deployed: false` on `origin/main` today, measured. Locking them now is CORRECT - they
  have been serving since 2026-09-24 - and it is the reason the diff is larger than this cut's own
  additions.
- **Confirm the set before running.** `reads-wC.mjs --plan` prints it
  (`35 UNLOCKED … covering bodies agreementFacts_v1, chatTurn_v22, claraWork_v6, payrollFacts_v1,
  statementFacts_v4`); so does a one-line read of `frozen-workflows.json`. If the count is not 35 at
  RELEASE_SHA, find out why before locking.
- **Afterwards, and this is the check rather than the count.** The command prints
  `locked N newly-deployed entr(ies); every manifest entry is now deploy-locked`, with N = 35.
  Then the plain freeze-lint still reads **`347 frozen file(s) / 60 "use workflow" module(s) / 3
  retired`**; the GIT diff of `frozen-workflows.json` touches 35 entries and only their `deployed`
  field, with no `sha256` moving; and **zero entries remain unlocked**, which is the one read worth
  taking because it is the only one that changes:

  ```sh
  node -e "const m=require('./frozen-workflows.json'); console.log(Object.values(m.workflows).filter(e=>e.deployed!==true).length)"   # 35 before, 0 after
  ```
- **`--compare-base origin/main` does NOT change its summary line, and that is expected rather than
  a problem.** It still prints `322 existing entr(ies) retain the same hash and deployed flag; 25
  addition(s); 3 recorded retirement(s)`. Its `existing` figure is the BASE manifest's entry count,
  its message text is unconditional, and its only deploy-flag violation is the REVERSE direction
  (`UNLOCKED-VS-BASE`, which fires when an entry was locked on the base and is not locked now).
  Locking is monotonic and therefore invisible to that line. Read the unlocked count above instead.

**HOW THE MANIFEST CHANGE REACHES `main`, exactly.** `--lock-deployed` writes
`frozen-workflows.json` in the working tree and nothing else. It is REFUSED under CI, by design, so
it can only be run locally. The change therefore lands as **a docs-and-manifest commit on a branch
off `main` at RELEASE_SHA, opened as the NEXT pull request after the release** - the same PR that
carries this runbook's § RESULTS, the as-run record and any follow-ups filed during the window. One
commit, message `chore(runtime): lock the 2026-09-25 cut's frozen entries after the image went
live`, touching `frozen-workflows.json` and the plan folder. It must NOT be amended onto the release
PR (that PR is the RELEASE_SHA the image was built from, and rewriting it would break the
provenance), and it must NOT be committed before step 7, because the append-only check then refuses
`REHASHED-VS-BASE` on any pre-release fix to a v22, v6 or v4 file.

11b. **Ticket closures with hosted evidence.** Five tickets, two lanes:

| lane | tickets | migrations |
|---|---|---|
| C1, the chat and Work families | #985, #1000, #1030, #1135 | 0320, 0321, 0323 |
| C2, the statement-facts family | #1037 | none (0322 reserved and unused) |

Read each ticket's real title with `gh issue view <n>` before commenting. Comment shape, unchanged
from the seven prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`, release
session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail notice
text, and, where the AC named a hosted behaviour, the specific reading step 7, 8 or 10 produced.
Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane comment above,
hosted evidence here."* Drafts are in the release scratchpad under `release-wC/closures/`.

**#1135's comment is the roster's own record** and must list every successor entry as SHIPPED with
its source ticket, and name the seven deferred class-C entries with #1136 and #1137. Its close file
already does.

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback
command, the three moved pins, and the runtime/database asymmetry named in step 9.

**Still owed after this release, and not part of it:** the three World legs `CUT-PLAN.md` §4.5 names
and this cut did not build (the two accrual legs, #915's prepayment leg, and a Work walk that parks
on A10's proposal through `fixed-asset-acquisition-e2e.mjs`); the A8/A9 enrolment question, which
needs a lane with a running Work; `clara.staff_advance_summary_for`, the OBO twin that would let A5
propose a split; the seven class-C tools on #1136 and #1137; and the blueprint pin drift in
`docs/ARCHITECTURE.md:171, :183, :207, :445`, which has been wrong since the 2026-09-15 cut and is a
wayfinder session's, not a lane's.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the role
  census, the run census, the machine and web ids and the backlog counts are taken from
  `RELEASE-W4-RUNBOOK.md` § RESULTS, the migration files and the rigs; none is read from hosted.
- **RELEASE_SHA does not exist yet.** The cut-phase PR is unopened and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `34b125e6f`, the
  integrated head.
- **`D-TAIL-REACH` in the negative direction.** Every rig here runs the migration as a superuser, so
  the check has only ever returned `superuser=true`. Whether hosted's migrating role INHERITS
  `clara_fn_owner` and can `SET ROLE` to `clara_agent_ro` is unread until step 3, and it is the
  single most load-bearing unknown this cut carries.
- **The version-cut run census on any rig.** No rig database on this host carries a bootstrapped WDK
  World, so `workflow.workflow_runs` is absent on all four and section (v)'s first three lines have
  never returned a row against a rig. The SQL is the runtime's own, mirrored rather than imported;
  its shape is unexercised.
- **`D-PROBE-DRIVEN`'s failing arm.** The positive arm was driven twice: read-only by the preflight
  against `clara_cutint` (53 keyed invoices, the control held), and for real by the gate worker's
  own migrate on `clara_w4_hosted`, where 0323's §TAIL ran its whole driven block. A row for which
  the unnarrowed core does NOT match cannot be constructed read-only, so only the refusal path is
  reasoned rather than measured.
- The timing of the migrate, the `en_US.UTF-8` replay, the web `next build` on this head and the
  two-build cutover drill were all **owed at drafting and are now measured** by
  `reports/waveC-gates.md`: 6 s and 1 s, the drill ALL PASS with three legs, and the web build green
  on this head once the two `NEXT_PUBLIC_SUPABASE_*` lines are supplied (17.3 s compile, 35 static
  pages, exit 0). Step 5 remains the first build with the DEPLOY environment.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.
- **Wave 4's signed-in walk covered waves 2, 3 and 4's surfaces and found three not exercisable on
  hosted data** (no uploaded document, no live invite, and the firm-setup checklist writes). The
  same three limits apply to this cut's document-shaped walks.

---

## § RESULTS (as run, ____-__-__, UTC)

**Authority.** The owner's riders plan of 2026-09-20 (each wave ends with its hosted release and the
tickets close on hosted evidence), the release-ownership ruling of 2026-09-17, the beta ruling that
hosted users and data are test data (#826, 2026-09-15), and the standing delegation of 2026-09-23.

**Gates 0a.** `main` = RELEASE_SHA = `________`. CI: ____. `check-frozen-workflows` on RELEASE_SHA:
____ frozen / ____ `"use workflow"` / ____ retired. `registry-view.test.mjs`: ____.
Web rollback lever confirmed: ____. The two rulings of gate 0a: ____.

**Step 1.** `fly auth whoami` = ____; machines ____.

**Step 2.** Probe ____ (`probe-wc`) from `refresh-6da02a8d`, World off.

**Step 3, pre-window reads (__:__:__Z, `reads-wC.mjs --prod --baseline fp-wC-hosted.json`).**
Ledger ____. Drift gate ____. Pending set ____. Fingerprint ____ keys, ____ equal, ____ env, ____
STOP. Body pins ____ of 40, ____ chain-internal. **D-TAIL-REACH: ____.** **D-PROBE-DRIVEN: ____.**
The other seven hand checks: ____. Version-cut reads: bodies by non-terminal run ____, stranded
____, successor-body runs ____. Quiescence ____. **Verdict ____.**

**Step 3f, backup (__:__:__Z to __:__:__Z).** ____ bytes, globals ____ bytes, sha256 ____.

**Steps 4 and 5, before the window.** Runtime image `refresh-<sha>` = `sha256:____` (____ MB). Web
Worker version ____, tag ____, not promoted.

**Step 6, the window.** 6a: ____. 6b: ____. 6c: ____. 6d: branch ____.

**Post reads (__:__:__Z, `reads-wC.mjs --post --prod --baseline fp-wC-upg.json`).** ____

**Step 7.** Probe destroyed ____. Deploy ____ to ____. `machine start` ____. `/ready` 200 at ____.
**Outage: ____.** Boot line: ____. `bodies=` ____. Pins: ____. `stranded bodies n=` ____. Bundle
banners: ____ (expect six). `/ready` pools: ____. First sweep, the re-derivation belt: ____.

**Step 8.** Promotion ____. Signed-out smoke ____. Signed-in walks, per body: ____.

**Step 9, rollback preflight demonstration (second probe ____ on `refresh-6da02a8d`, bundle
streamed over `ssh console`, ____ bytes, sha256 ____ verified, match=____).** Verdict ____ at
__:__:__Z. Gate (a) ____. Gate (b) ____. Gate (c) ____. Snapshot expires when ____.

**Step 10.** ____

**Step 11.** `--lock-deployed` locked ____ entries (expect 35). Manifest diff ____. Tickets: ____
closed. Follow-ups filed: ____.

**Deviations from the draft.** ____
