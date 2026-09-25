# Hosted release ceremony, riders CLOSING WAVE K: migrations 0362 0363 0364 0365 + a VERSION CUT + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on `RELEASE-WC-RUNBOOK.md`, the
last version cut, with the sweep's own improvements folded in from `RELEASE-WS-RUNBOOK.md`: the
widened pin parser, the recipe reporting, and the habit of saying which families a wave does NOT
carry and proving it from the parse.

RELEASE_SHA = **`________`** (the merge commit of the closing-wave PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**THIS RELEASE IS BOTH KINDS AT ONCE, and that is the sentence the whole ceremony follows from.**
The cut phase repointed three pins and carried three small migrations; the sweep carried
twenty-five migrations and repointed nothing. This wave carries FOUR migrations that create no
relation, add no column, build no index, swap no constraint and back-fill nothing, AND a version cut
that repoints **`chatTurn` v22 → v23** and **`claraWork` v6 → v7**, grows the exported roster from
60 bodies to **62**, and adds **15 manifest entries that step 11a locks after the image is live**.
So: the database half is the lightest this programme has shipped, and the image half is the cut's
whole risk model, unchanged. Read section W, step 9 and step 11a before anything else.

**AND HOSTED IS NOT THE ESTATE THE LAST TWO RUNBOOKS DESCRIBE.** It was FACTORY RESET on 2026-09-26
(`docs/plan/active/factory-reset-2026-09-26/RUNBOOK.md`). The product is unchanged - the same 337
files, the same image, the same web version - and the DATA is gone: one login account, one firm
(`Testing Firm`, `2126face-338e-4bc8-9c75-d0b3c6441cbd`, operator, one member), no client, no
document, no journal entry, no Work, zero workflow runs, an empty `firm-docs` bucket. Three things
follow and each is load-bearing below:

1. **Every row-shaped precondition reads 0**, so this wave's already-light database half is lighter
   still. What that does NOT make free is the CATALOG half: 22 body pins and ten hand checks are
   about the schema, not the rows, and the reset re-ran the whole chain, so they are read fresh.
2. **The role census was dropped and re-minted by the chain that day.** `D-ROLE-REACH` and
   `D-MACHINE-LANE-GRANTS` are therefore not carried from the cut's or the sweep's window: they are
   re-read, because the environment fact it rests on changed after the last time it was measured.
3. **Step 9's rollback snapshot has an unusually short life.** A blank estate carries ZERO
   non-terminal runs, so the preflight against the previous image is vacuously ALLOWED - and the
   FIRST chat turn the owner sends after step 8 creates the first `chatTurn_v23` run and closes the
   window. Run step 9 immediately after step 7, before anybody drives anything.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\710` (branch `integration/riders-closing`, head **`18eb2dc4d`**,
all four lanes merged) carries **341** files under `packages/db/migrations/`, highest version
`0365_accrual_register_pagination`. Hosted is at **337 / `0361_reservation_release_advice`**
(`RELEASE-WS-RUNBOOK.md` § RESULTS 2026-09-25, re-affirmed by the factory reset's own step 8 read on
2026-09-26; re-read live at step 3). So the migrate step should report

```
migrate: 4 new migration(s) applied · 341 total
```

341 is the FILE count (`packages/db/scripts/migrate.mjs` prints `migrations.length`); `0365` is only
the highest version NUMBER. **`0351` and `0354` to `0359` stay absent**, reserved and never used, and
the runner does not ask for gapless numbering. Re-derive all of it against whatever `main` and the
hosted ledger actually are at window time: the preflight prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-WS-RUNBOOK.md` § RESULTS and the factory reset's RESULTS;
re-read live at step 3):
DB **337 / `0361_reservation_release_advice`**. Runtime image **`refresh-322fdf29`** =
`registry.fly.io/clara-runtime@sha256:20ab8c8352fd4372f1c8a6f50f2f163f742e92c65c7fa6dc1f227435a608344f`
(265 MB, measured boot `bodies=60`, pins `chatTurn=chatTurn_v22` / `claraWork=claraWork_v6` /
`statementFacts=statementFacts_v4` and eleven others), single Fly machine **`48ee715b763048`**
(never touched directly; exactly two calls all window, `stop` and `start`). Web
**`fa2c6c0b-474c-40dc-9f6e-5064a2488a47`** (tag `refresh-322fdf29`, promoted to 100% on 2026-09-25;
the one before it is `3089d906-5bae-48cb-9666-72dff5aa8ef4`, recorded here only to be re-read from
`wrangler versions list` rather than trusted).

**THE CONNECTION SHAPE CHANGED ON 2026-09-26 AND EVERY COMMAND BELOW INHERITS IT.** The eight DSN
secrets were rewritten to the DIRECT host `db.<ref>.supabase.co` (IPv6, usernames without the
pooler suffix, TLS pins unchanged) after Supabase's shared session pooler failed for ninety minutes
during the reset window and did not recover. **The shared pooler is NOT used** (owner ruling
2026-09-26). For this ceremony that means:

- the probe / `dsn-pipe` pattern works UNCHANGED - `WORKFLOW_POSTGRES_URL` is the direct DSN;
- the CA-path workaround (#917) applied to the pooler; re-check whether it is still needed on the
  direct host rather than assuming either way (the reset's own backup ran through it);
- **the ceiling to watch is the Micro instance's `max_connections` of 60**, not a pooler quota. The
  probe adds one session and the backup adds one; neither is close, but a release that leaves a
  probe running is now spending a scarcer thing than it used to;
- the revert, if Supabase ever repairs the tenant, is deterministic (host back to the pooler,
  username back to `<role>.<ref>`) and is NOT part of this release.

**Secrets rule (unchanged from all nine prior runbooks).** The fly token and the DSN are substituted
INLINE inside one pipeline only: never assigned to a shell variable, never echoed, never in argv.
Reuse the wave-2/3/4/cut/sweep wrapper shape:

```
# C:\Users\zhant\AppData\Local\Temp\claude\...\scratchpad\release-wK\via-probe.sh
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
new secret and sets none. (The factory reset's step 6 password ceremony is a REBUILD's obligation,
not a release's: the chain mints every lane `_login` role NOLOGIN, and the roles hosted carries
today already have their LOGIN and their password. Nothing here re-runs the chain from zero.)

---

## 0. Rehearsal: the 0361 -> 0365 UPGRADE replay, and what exists of it

- The **integrator's** ordered chain is the release's own proof of file order. `clara_intK`, created
  from the pristine 337-file template `clara_intS6` (`createdb -T`), on `127.0.0.1:55742`, took
  `0362 0363 0364 0365` in file order and reported **341 total** with every prestate on its FIRST
  branch and every tail OK. It was replayed TWICE more from the same template - `clara_intK2` and
  `clara_intk_lower`, each in ONE `migrate` run after all four lanes were merged - and both reported
  **`4 new applied · 341 total`**, no refusal, no recut (`reports/waveK-merge.md` §5.1).
  **Not one file refused and not one file was recut at integration**, the first merge in this
  programme where that is true, which is why this wave's pin ledger is entirely first-apply.
- **The file bytes are proved unedited rather than argued.** Each migration on the merged head
  hashes to exactly what its lane branch carried and to exactly what the ledger recorded when it
  applied (`waveK-merge.md` §5.1): `0362` `dea2860efae88070…`, `0363` `58a3ac5a8cb082fc…`, `0364`
  `b416ea4521b4275e…`, `0365` `4983f44a3e27e699…`.
- The **release-preparation worker** dry-ran the preflight five ways against two databases and drove
  nine negative controls. The table is in § "The preflight, dry run" below and in
  `reports/waveK-release-prep.md`.
- **Gate A, gate B and gate C are OWED at drafting.** This section is the place their readings go.
  What each is for has not changed: A is the from-scratch chain on a disposable cluster (which
  `CLOSING-PLAN.md` risk 1 forbids anyone else from running on 55742, and which all four lanes carry
  as an open debt); B is the browser and hosted-shaped replay; C is the runtime suite on a
  provisioned Workflow DevKit schema **plus the two-build cutover drill**, which a version cut makes
  mandatory rather than optional.

**What is NOT rehearsed, and the list is short because the wave is.**

- **The two-build cutover drill.** `waveK-merge.md` §7.2 records it as NOT run, and assigns it to the
  gate workers. It is the one rehearsal a version cut cannot skip: `packages/runtime/tests/
  scratch-image.mjs` regex-asserts the exact textual shape of `CUT-PLAN.md` §2.2's five registry
  edits per class, so a deviation breaks the drill rather than the boot. **Do not open the window
  until gate C records it.**
- **The runtime suite end to end on a DevKit schema.** 23 World-gated cells in
  `queue-drain.test.mjs` and `rollback-preflight.test.mjs` still skip at the integrated head, and
  they are #1151's own ground and #1145's whole subject (`waveK-merge.md` §7.3). Gate C's.
- **The preflight's own run census.** No lane rig carries a provisioned World, so
  `workflow.workflow_runs` answers `42P01` there and the census fails CLOSED rather than reporting
  zero. That is why the dry run below shows three structural STOPs. On hosted the schema WAS
  re-provisioned by the factory reset's step 7, so the census is answerable at step 3 - and this is
  the first window in the programme where the expected answer is genuinely zero rather than small.

A rehearsal on a seeded cluster proves DDL and guard logic, **not** the row-shaped hazards. This
wave has exactly one of those and it is named in step 3c: 0365's dropped door, which is browser-
reachable and which no machine stop quiesces.

## 0a. Gates before any production step

- `main` = RELEASE_SHA, `ci` SUCCESS on that sha, the build tree equal to RELEASE_SHA, `git status
  --porcelain` empty apart from the untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time, never a literal written before.
- **Owner says go**, in-session, for this specific window.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F):
  hosted users and data are test data. It is what the 2026-09-26 factory reset was taken under, and
  it is what makes the one surviving firm disposable. Confirm it is still true.
- **`node scripts/check-frozen-workflows.mjs` on RELEASE_SHA must read `362 frozen file(s) / 62
  "use workflow" module(s) / 3 retired`**, against main's `347 / 60 / 3`. `--compare-base
  origin/main` must read **347 existing entries retaining hash and flag, 15 additions, 3 recorded
  retirements**. The merge measured all of it four ways and found 0 sha moved, 0 `deployed` flag
  moved, 0 removed, and every one of the 15 new entries carrying NO `deployed` key
  (`waveK-merge.md` §4.1). **A sixteenth addition, or a moved sha on any of the 347, means this is
  not the wave this runbook describes.**
- **`node scripts/check-frozen-workflows.selftest.mjs` OK**, and
  **`node packages/runtime/scripts/check-parts-parity.mjs` OK** - the cut is forbidden from adding a
  part kind and the census must show `claraWork.v7.impl.ts` as a `work_result` site beside v1 to v6
  and nothing new (`CLOSING-PLAN.md`, "What the cut must NOT do").
- **`node --test packages/runtime/tests/registry-view.test.mjs` must read 7/7.** The preflight then
  proves the repoint itself, out of the tree rather than from this page:

  ```
  CLARA_REPO=<RELEASE_SHA tree> CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
    node docs/plan/active/riders-2026-09-20/ceremony-wK/reads-wK.mjs \
         --plan --frontier-before 0361_reservation_release_advice
  ```

  Expect `bodies=62`, fourteen pins with **`chatTurn=chatTurn_v23 claraWork=claraWork_v7
  statementFacts=statementFacts_v4`**, `frozen manifest 362 entries, 15 UNLOCKED`, `SUCCESSOR BODIES
  … chatTurn_v23, claraWork_v7`, 4 pending files, **22 pins (22 measurable / 0 chained)**, 10 hand
  checks, **0 GAP**, exit 0. Running the same command with `CLARA_REPO` pointed at the MAIN checkout
  must print `bodies=60`, `chatTurn=chatTurn_v22 claraWork=claraWork_v6` and `347 entries, 0
  UNLOCKED`, which is what "this wave repoints exactly two pins" means in a form that can be checked.
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` to confirm the active version is `fa2c6c0b-474c-40dc-9f6e-5064a2488a47` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy fa2c6c0b-474c-40dc-9f6e-5064a2488a47@100% --yes`.
- **Gate C's two-build cutover drill recorded ALL PASS**, per section 0. This is the one gate a
  version cut may not open a window without.
- **One reading this wave asks for that belongs before the window, not during it.** The whole estate
  is blank, so there is no row-shaped question to settle - but there IS a catalog one, and it is
  0365's: `clara.list_accrual_adjustments` must resolve at exactly ONE overload, the four-argument
  pre-page shape, before the file drops it. Two resolvable candidates for one name is the state
  PostgREST cannot disambiguate, and `D-DROPPED-DOOR` reads it at step 3.
- **DB RESTORE POINT**: step 3f. Take it before the first hosted write; re-take it if the window
  opens more than about 2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery"), and the factory
  reset's own experience adds one more: it returns no operator-entered CONFIGURATION either (its
  deviation 7, the `clara.stripe_object_map` rows). Nothing in THIS wave writes configuration, so
  the restore's coverage is unchanged - but the restore is now the only copy of a very small estate.

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

**The `--command` form does not work on this image and the factory reset paid for finding out**
(its deviation 4: the image runs `docker-entrypoint.sh node scripts/serve.mjs`, which needs the
database, and `fly machine run --command` is ignored). A sleeping probe is the POSITIONAL form:

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-322fdf29 --app clara-runtime \
      --name probe-wk --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 sleep infinity        -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy. Step 9 needs a SECOND probe on the same serving image.
Each probe holds one direct connection against the instance's `max_connections` of 60; destroy them
when done rather than leaving them for later.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-wK/reads-wK.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs` (through `via-probe.sh`). It opens `begin transaction read only` and
issues nothing but SELECTs, each under its own `SAVEPOINT`, so a soft failure never poisons the
rest. It prints facts only: never the DSN, never an e-mail address, never any personal data. Exit
code is non-zero when any check says STOP.

**Nothing in the script is transcribed.** Every expected value is PARSED out of
`CLARA_MIGRATIONS_DIR` at run time, and the registry and manifest expectations are PARSED out of
`CLARA_REPO`'s own `registry.ts` and `frozen-workflows.json`. A literal it cannot parse is a
**PARSE GAP** and counts as a STOP.

Then, through the probe:

```
PROBE=<probe-id> via-probe.sh node docs/plan/active/riders-2026-09-20/ceremony-wK/reads-wK.mjs \
      --prod --baseline scratchpad/wK/fp-wK-hosted.json
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted estate (`db=postgres`,
port 5432, not loopback). Ledger expect **337 / `0361_reservation_release_advice`**; drift gate over
all 337 applied rows (`migrate.mjs` aborts the whole run on one checksum mismatch, so a drift here
is a STOP before the window rather than a surprise inside it); the pending set listed and asserted
to be exactly the four files above the frontier; and the printed arithmetic
`337 + 4 = 341 / 0365_accrual_register_pagination`. The run writes
`ceremony-wK/reads-wK.state.json` so `--post` can re-derive that sum.

> **One thing to read rather than assume, and it is new.** Hosted's collation was `en_US.UTF-8` at
> every prior window; the factory reset re-ran the chain on the SAME database, so it should be
> unchanged. The script prints `collation` and `ctype` on its first line. This wave's pins are
> `sha256(prosrc)` over function bodies, which no collation reaches, so a difference would be a
> finding about the estate rather than about this release - but it is worth one look on the first
> window after a rebuild.

**3b. THE ESTATE FINGERPRINT.** The script compares hosted against a baseline produced by the same
script from a rig database at the hosted frontier. Coverage is unchanged from waves 3 and 4, the cut
and the sweep: every function in `clara` (identity signature, `sha256(prosrc)`, owner, SECURITY
DEFINER, `proconfig`, ACL), every relation (columns, constraints with `convalidated`, indexes, RLS
enabled and forced, policies, triggers with `tgenabled`, view definitions, owner, ACL), the schema's
own types, and the `clara%` roles with their memberships.

Role-level rule, unchanged: `role:` and `rolemember:` differences print as **`env`** lines, with
both sides, and never count as a STOP. Everything else still STOPs. **This wave mints no role.**

Expect on hosted: **0 DRIFT, 0 PINNED DRIFT, and the role-level `env` lines the estate has always
carried.** The count is the thing to read rather than predict: the cut and the sweep both saw 16;
the factory reset's own post read saw **12** against the same rig baseline, because the reset
dropped and re-minted the roles the chain owns and left only the Supabase-managed differences. So
**expect about 12, re-count them, and treat a number above 16 as a finding.** This is the first
release to compare against a post-reset estate and the expectation is therefore softer than usual;
say which number was actually read.

**3b-bis. THE BODY-PIN LEDGER: 22 pins, every one measurable, none chained.** This is the cleanest
pin ledger the programme has had, and the reason is `waveK-merge.md` §0: no body in this wave is
written by two lanes, and no later file pins a body an earlier lane writes. So there is no
chain-internal pin to defer and no newborn to excuse.

| where the ledger comes from | pins |
|---|---|
| a roster tuple or pair row (0364's `v_recut` and `v_keep`, 0363's and 0365's prerequisite rows) | 14 |
| a scalar `sha256(prosrc)` measurement naming its own signature | 7 |
| a HOISTED body: the file lifts `prosrc` into a local first and measures the local (0362) | 1 |
| **total** | **22** |

Two things about this ledger are worth reading before a refusal rather than after one.

- **EVERY PIN USES `sha256(convert_to(prosrc,'UTF8'))`.** The sweep wave had seven pins on the
  `sha256(prosrc::bytea)` recipe and met a real `22P02` at integration when a body gained a
  backslash (`waveS-merge.md` §14.2 finding 3). `grep -c 'prosrc::bytea'` over these four files is
  **0**, measured. The preflight still reports the recipe per pin, so a future file that switches
  back is caught rather than absorbed.
- **THE HOISTED PIN IS THE ONE THE SWEEP'S PARSER COULD NOT SEE.** 0362 pins
  `clara.withdraw_firm_standing_instruction(text,text,text)` at
  `c63c1fd09bc92713127a038b3565f399b8ee17fcbf27097272b7a919cbb7b6e5` by lifting the body into
  `v_src` and measuring the local, which every scalar arm in `reads-wS.mjs` misses because they key
  on the token `prosrc` inside the `sha256` call. Arm (E) closes it. The pin is BIMODAL in the
  file's own terms - the sha, or a body already carrying `#1147 [0362]` (its redo arm) - and the
  script prints the redo arm when it refuses.

**3c. THE DATA PRECONDITIONS a rehearsal on a seeded rig cannot prove about hosted.** Ten hand
checks, each with its expected value parsed from the file that owns it. Three of them are the real
content of this step.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| **D-ROLE-REACH** | all four | every one does `set role clara_fn_owner` and runs its §TAIL after `reset role`. NO file asks to become `clara_authenticated` (the sweep's 0341 did) | `current_user`, `rolsuper`, and MEMBER/USAGE for `clara_fn_owner`. **THIS IS THE ONE CHECK NO RIG CAN ANSWER**, because a rig migrates as a superuser. The cut's and the sweep's windows both answered it good on 2026-09-25 - and the 2026-09-26 reset dropped and re-minted the roster, so it is re-read rather than carried |
| **D-DROPPED-DOOR** | 0365 | it DROPS `clara.list_accrual_adjustments(uuid,date,date,text)` and re-creates the name at six arguments in the same transaction. The drop takes ACCESS EXCLUSIVE on that `pg_proc` entry, and the door is granted to `clara_authenticated` and reached FROM THE BROWSER, which no machine stop quiesces | every overload of the name that resolves today, with its ACL, and whether the dropped target is among them. Expect **exactly one**, the four-argument shape, which is the file's own FIRST branch |
| **D-HUMAN-DOOR-SIGNATURES** | 0362, 0363, 0365 | the three doors this wave hands `clara_authenticated`. PostgREST resolves an RPC call by its ARGUMENT NAMES against a CACHED schema, so a changed signature is a cache question as well as a catalog one | each target's resolution today and the overload count of its bare name. Report-only: it is a reading, not a predicate |
| **D-WAVE-PREMISE** | all four | 6 objects the prestates require to be PRESENT; each file raises CLR10 by name on an absent one | all 6 present |
| **D-CHAIN-PREREQUISITE** | 0364 | it continues two earlier decisions and says so by COUNTING their ledger rows: 0336's namespace split and 0353's tenancy confirmation cores | exactly 1 row each. Applied ahead of either, 0364 would splice bodies that do not exist in the shape it was written against |
| **D-OPKEY-NAMESPACE** | 0364 | `clara._reserve_op` keys a receipt on (firm_id, fn, op_key), so a door that nests another hands it a DERIVED key. The file refuses unless `:rrplan` is derived by exactly 2 bodies and `:acplan`, `:acrev` and `:tnplan` by none | four catalog censuses over `prosrc`, run the way the file runs them minus its own exclusion list, so a REDO target is recognised rather than refused |
| **D-WAVE-MINTED-NAMES** | 0362, 0363 | the 2 function names this wave's text creates and no file pins a pre-image for | a SPLIT, not a verdict: one that does not resolve is a new name, one that does is a body recut without a pinned pre-image. Expect both absent |
| **D-REDO-MARKERS** | all four | the substring probes each PRESTATE uses to tell a FIRST APPLY from a REDO - an attribution tag (`#1147 [0362]` and its siblings) or, for 0365, a feature of the shape it would have installed (`p_cursor`, `next_cursor`, `accrual_cursor_malformed`) | how many live bodies carry each. Report-only, and the branch each file will take is read from it |
| **D-WAKE-ALLOWLIST** | 0362 | ONE `clara.wake_fn_allowlist` row, `on conflict do nothing`, and the file's §TAIL then counts rows for its own name | the row must be ABSENT, or the insert is a no-op and the tail counts somebody else's row. Expect the allowlist at 114, going to 115 |
| **D-MACHINE-LANE-GRANTS** | 0362 | ONE EXECUTE grant to `clara_agent_ro`, on a name this wave mints | the target must not hold it today. The whole `clara%` roster is printed beside it, because the reset re-minted it: **expect 21 roles**, not the rig's 20 (`clara_storage_docs` is hosted's own, from `deploy/storage-provision.sql`) |

> **D-ROLE-REACH, and why it is re-read rather than carried.** Twenty of the sweep's twenty-five
> files did `set role clara_fn_owner`; all four of these do. On every rig the migration runs as a
> SUPERUSER, which satisfies that by bypass, so **no rig run of these files has ever exercised the
> privilege path**. Hosted's own answer on 2026-09-25 was good (`postgres`, not a superuser, MEMBER
> and USAGE both true). The 2026-09-26 reset dropped the six post-0154 roles, renamed a seventh out
> of the census, ran the whole 337-file chain, renamed the seventh back and re-set three passwords  - 
> and then found that the chain mints every lane `_login` role NOLOGIN and had to grant LOGIN to
> seven of them by hand (its deviation 5). A membership that has been through that is an
> environment fact worth re-reading, not a number worth carrying.

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective. Derived by stripping every `create [or replace] function` BODY from each file, because a
body is inert at apply time, and reading only what is left. **Every one of these is a parse, and
the preflight's generated-read sections for them print empty:**

- **No `ALTER TABLE` of any kind. No `ADD CONSTRAINT`. No `ADD COLUMN`. No `SET NOT NULL`. No
  `VALIDATE CONSTRAINT`. No `CREATE INDEX`. No top-level `UPDATE`. No top-level `DELETE`. No new
  relation. No new role. No trigger disabled. No body spliced through a substitution anchor.**
- **ONE `drop function`**, 0365's, followed by a `create or replace` at a different argument list in
  the same transaction. It is the only statement in the wave that takes a lock on an object anything
  outside the migration uses.
- **ONE catalogue insert**, 0362's single `clara.wake_fn_allowlist` row.
- **The two `update` statements a grep finds are INSIDE function bodies** (0362's withdrawal stamp,
  0364's one-way `corrected_by_accrual_id` stamp), so they are text at apply time and run nothing.
- **About 13 `create [or replace] function` statements between them.** `create or replace function`
  stores text and runs none of it, and takes no table lock.

**THE TIMEOUT PICTURE.** `migrate.mjs` arms nothing itself; each file arms its own.

| what | files |
|---|---|
| `statement_timeout = '20min'`, described as PRECAUTIONARY in the file's own comment | 0362, 0363, 0364 |
| `statement_timeout = '5min'` | 0365 |
| `lock_timeout` | **none. No file in this wave arms one** |

**So `55P03 lock_not_available` is NOT a failure branch for this release**, because nothing arms a
`lock_timeout`. What 0365's drop can do instead is WAIT: a browser call in flight on the
four-argument door holds a lock the `drop function` queues behind, and with no `lock_timeout` the
statement waits up to its file's `statement_timeout` of 5 min. On a blank estate with one owner
session that is a theoretical branch; step 6b's `pg_locks` read is what makes it a measured one.

**3f. DB RESTORE POINT: the full dump, through the probe DSN into WSL.** `backup.mjs --profile full`
(`pg_dump` 17.11 lives in WSL; Windows has none). The cut's took 95 s for 221,062,708 bytes and the
sweep's 221,258,058; the factory reset's pre-wipe dump was 221,541,454 bytes. **This one will be
far smaller** - the estate is blank, so what is left is the schema and the chain's own catalogue
rows - and a dump in the same 200 MB range would itself be a finding worth stopping on. **Run it
under WSL's OWN node**, not a Windows-path node invocation. Re-check whether the CA-path workaround
(#917) is still required now that the DSN is the direct host rather than the pooler. Record the
artefact path, the byte count and its sha256.

## W. Deploy order, decided from the four headers and from the runtime's own source

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine IS
STOPPED before the migrate and started again only on the NEW image.** Same order as waves 2, 3, 4,
the cut and the sweep.

### Nothing in a MIGRATION forces the order, and the forcing statement is in the runtime

`grep -niE 'deploy order|write-quiet|quiesce'` over `0362`, `0363`, `0364` and `0365` returns
**nothing at all**. Not one of the four carries a deploy-order header, and under `ARCHITECTURE.md`
§5.F that silence is readable. The cut phase's own lesson was that the forcing statement can live in
the RUNTIME rather than in a migration, so the reverse direction is checked there:

| what the new image gains | does it call a door this wave creates? | order |
|---|---|---|
| `chatTurn_v23`'s seven new tools (#1136's three payroll/agreement reads, #1137's four tenancy tools) | **no.** Every door they call was shipped by the SWEEP wave's 0352 and 0353 and has been live on hosted since 2026-09-25 | **free in both directions.** This is the whole point of the deferral: the cut waited for the doors, so the doors are not waiting for the cut |
| `claraWork_v7`'s `loadFaProposalInputsStepV7` | it reads `clara.fa_account_depreciation_policies` and the knowledge catalogue, both shipped by the sweep's 0345 and 0346 | free |
| `clara.wake_get_firm_standing_instruction` (0362) | **nothing in this image calls it.** The chat tool over it is a SUCCESSOR CONTRACT for the cut AFTER this one (`waveK-merge.md` §6 item 1) | free: the wave adds a door nothing calls |
| `clara.get_payroll_posting_state` (0363) | the WEB calls it (`apps/web/lib/documents/payroll-posting-state.ts`, mounted in `document-detail.tsx`). The chat tool over it is likewise a successor contract | **DATABASE FIRST, in practice.** A promoted web calling it before 0363 is live answers `42883` on the document page |
| 0364's recut plan and reservation bodies | the serving image and the serving web already call `create_accrual_adjustment`, `correct_accrual_adjustment` and the tenancy confirmations. **0364 changes no signature** (`waveK-merge.md` §0), so no caller breaks structurally | free in both directions |
| 0365's six-argument register read | the WEB calls it, and the new web sends `p_cursor` and `p_limit` | **DATABASE FIRST, non-optional.** A promoted web sending six arguments to a four-argument door is `PGRST202`; and the OLD web sending four arguments to the new door still works, because both new parameters default to NULL and `LIMIT NULL` is PostgreSQL's own "no limit at all" (0365's own header) |

So the order is DATABASE, IMAGE, WEB because that is the house order, because two legs genuinely
require it, and because the web leg is the one place where the reverse order would show a user an
internal fault.

### What the OLD image does between the migrate and its own replacement

- **No body it serves is recut by this wave in a way it can see.** 0364 recuts six bodies the
  serving image reaches through PostgREST and through its own Work lane, and changes **no
  signature** and **no refusal**: the tenancy step's client-status wall stays above the delegation,
  every other wall becomes `clara._obo_plan_core`'s, raised in the same order with the same SQLSTATE
  and the same typed `detail`, and 0364's own §TAIL re-measures that (`waveK-merge.md` §2). What
  moves is which nested operation-key suffix each lane spends.
- **The one door the old image would find MISSING is 0365's four-argument register read**, and the
  old WEB is the only thing that calls it. It is not missing: it is replaced by a six-argument door
  whose last two parameters default to NULL, which answers an existing four-argument call
  identically. That is 0365's AC2 and its battery drives it.
- **PostgREST's schema cache is a real watch item for this wave, and it was not one for the sweep.**
  0365 changes a door's argument list. Wave 4's runbook carried the same watch item for a different
  reason and the sweep explicitly had no analogue because it changed no signature. Supabase installs
  a DDL event trigger that tells PostgREST to reload, so the expected behaviour is that the cache
  follows the migrate within seconds. **If the accrual register answers `PGRST202` after step 6,
  the cache needs a reload; that is a hosted behaviour this draft cannot test.** Watch it at step 8
  rather than discovering it from the owner.

### Is the machine STOP needed? Yes, and for the version cut's reason rather than the migrations'

**The MIGRATIONS barely need it, and saying so plainly is more useful than implying a hazard that is
not there.** There is no `ALTER TABLE`, no index build, no constraint swap and no backfill. What
remains is `packages/db/README.md`'s general rule for recutting an active writer body - and 0364
recuts six of them, including `clara.correct_accrual_adjustment`, which writes an adjustment row and
stamps its predecessor. PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it
STARTED with, so a correction spanning the migration settles under a rule the estate has already
replaced. On a blank estate nothing is in flight; the rule still holds and the stop still costs one
call.

**The VERSION CUT needs it for the reason every cut has.** The machine must be restarted anyway to
pick up the new image, so the stop costs the difference between `deploy` + `start` and `stop` +
`deploy` + `start`. And 0365's `drop function` is cheaper to take against a quiesced runtime than a
busy one, even though the runtime is not what calls that door.

**What the stop does NOT buy, said plainly.** Stopping the Fly machine quiesces the RUNTIME's
writers: the reconciler, the Work lane, chat turns, the sweep. **The browser talks to PostgREST
directly and is not quiesced by anything in this ceremony.** In beta the only browser session is the
owner's, so the operative instruction is the one every prior window used: the operator does not
drive the product between 6a and 8. Step 6b's `pg_locks` read is what makes that real rather than
nominal, and for this wave the relation to watch is not a table at all - it is the `pg_proc` entry
0365 drops.

**And web goes LAST**, because a promotion is the cheapest thing to hold and the order has never
cost anything. This wave's web diff is nine non-test source files: L1's standing-instructions card
and payroll-posting section, and L3's accrual register, its hook, its API module and the plan-revise
form. L2 and LC have an EMPTY `apps/web` diff (`waveK-merge.md` §5.4).

## 4. Runtime image first, build-only and push, released by digest

```
... flyctl deploy --config packages/runtime/fly.toml --build-only --push \
      --image-label refresh-<RELEASE_SHA> --build-arg CLARA_BUILD_SHA=<full sha>
```

About five minutes; record the `sha256:` digest and release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7, never by tag. The Docker build runs
`nitro build` only: it does NOT run the bundle gate or the freeze-lint, so those counts are `ci`'s,
not this step's output. Nothing built here is released until step 7.

**`pnpm --filter @clara/runtime build` was NOT run at the integration head** (`waveK-merge.md` §7.5),
so unlike the sweep this step is the first real runtime build of this tree. Treat a failure here as
a build-environment finding first, and read LC's own gates as the code-side evidence: 49/49 on the
cut's cells, 90/90 on the neighbour census, parts-parity OK, worker-paths OK. The sweep's build log
carried three benign `ERROR failed to read input source map` lines from third-party `@ai-sdk/*`
packages missing their `.js.map` files and still exited 0; expect the same noise.

## 5. Web build and upload, in WSL as root, BEFORE the window

Mechanism unchanged: detached checkout at RELEASE_SHA in `/home/runner/clara-deploy` fetched from
`refs/remotes/origin/main`, `corepack pnpm install --frozen-lockfile`, the two
`NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then
`corepack pnpm --dir apps/web exec wrangler versions upload --tag refresh-<RELEASE_SHA>`. Record the
Worker Version ID. **Not promoted until step 8.**

**New in this release, and it is modest.** A standing-instructions card on `/settings/firm`, a
payroll-posting section on the document detail, a paged accrual register with a server-side side
filter, and the plan-revise form following the register's new envelope. **`pnpm build` for
`apps/web` was not run as a gate at the integration head but WAS run seven times as a side effect**:
`e2e/serve-built.mjs` builds the real bundle before every walk and eight walks were driven, 147
passed and 0 failed (`waveK-merge.md` §5.4, §7.5). So unlike the sweep, the web bundle of this tree
has been built and served repeatedly; what step 5 adds is the DEPLOY environment.

## 6. Writer quiescence, then migrate: all four files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is what buys section
W's obligations, and it does not quiesce the browser.

6b. Re-run the census through the probe (`reads-wK.mjs --census --prod`). It must come back clean,
and specifically:

- **no holder of the F10 advisory lock**, or the migrate step hangs silently;
- no other backend holding a lock on any relation the parsed watch list names. **For this wave that
  list is one row long, `clara.wake_fn_allowlist`**, because nothing else is locked by a statement  - 
  so read the census for what it does NOT say as much as for what it does;
- the **version-cut census** comes with the census in this mode. Read it: every non-terminal
  `workflow.workflow_runs` row BY BODY, the stranded-body census against RELEASE_SHA's sixty-two
  exported bodies (expect **0 stranded**), and the successor bodies' own run counts (expect
  **`chatTurn_v23=0, claraWork_v7=0`**, which on a blank estate is trivially true and is still the
  reading step 9's snapshot depends on);
- **expect the run census to read ZERO non-terminal runs across zero names.** The factory reset
  dropped the `workflow` schema entirely and step 7 of that runbook re-provisioned it empty. A
  non-zero reading means the estate has been driven since, which is fine and simply changes what
  step 9 records - but read it rather than assume it.

6c. From the RELEASE_SHA checkout:

```
PROBE=<probe-id> via-probe.sh node packages/db/scripts/migrate.mjs      # cwd = packages/db
```

Expect **`migrate: 4 new migration(s) applied · 341 total`**. Four files, none of which scans a
table. The cut's three files took 22 s through the ssh hop; the sweep's twenty-five took 1 min 51 s.
Budget a minute and do not kill it. **One timing note specific to this estate**: the factory reset
measured about **7 s per file** over the hop against about 2 s on a rig, so four files is plausibly
half a minute rather than ten seconds.

The prestate and tail notices to read out loud, quoted from the integration chain's own run
(`waveK-merge.md` §1, §2, §3) so the window compares text against text:

```
[notice] 0362 prestate OK -- read door FIRST, withdraw door FIRST
[notice] 0362 tail OK -- the model lane can ask what a firm has instructed, a withdrawal says how
        many plans keep posting, and neither gave anybody a way to act
[notice] 0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its measured
        pre-image and ungranted
[notice] 0363 tail OK -- a document page can ask why a payslip did not post, the internal is still
        nobody's to call, and nothing above the door may reword what it says
[notice] 0364 prestate OK -- 6 FIRST, 0 REDO -- clara.create_accrual_adjustment=FIRST
        clara.correct_accrual_adjustment=FIRST clara._confirm_tenancy_rent_plan_core=FIRST
        clara._confirm_tenancy_rent_plan_revision_core=FIRST clara._obo_plan_core=FIRST
        clara._tenancy_plan_core=FIRST
[notice] 0364 tail OK -- the accrual and tenancy lanes hold namespaces of their own, the prepayment
        lane keeps :plan, both tenancy cores close their lane set, and the third on-behalf-of plan
        step is a caller
[notice] #1152 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is
        live (four-argument, pre-page (#1075/0334)) ...
[notice] #1152 tail: OK -- clara.list_accrual_adjustments exists EXACTLY ONCE, at
        (uuid,date,date,text,jsonb,integer); the four-argument signature is GONE rather than left
        as a resolvable overload ...
```

Three of these are worth a second look. **0362's `read door FIRST, withdraw door FIRST`** is the
bimodal pin taking its first-apply arm rather than its redo arm. **0364's `6 FIRST, 0 REDO`** is the
whole of the cross-lane question answered by the chain itself. **0365's prestate naming
`four-argument, pre-page (#1075/0334)`** is the door being dropped from the shape the sweep wave
left, not from some other one.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state: the
file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b-bis exists so this is discovered before the window, for all 22 pins.
  Do not re-pin and do not edit the migration. Report to the owner with the body name and both shas.
  **If the refusing pin is 0362's, read which arm the file admits before calling it drift**: it
  takes the sha OR a body already carrying `#1147 [0362]`, and the message names both.
- **A `42501` IN A TAIL.** That is D-ROLE-REACH's failure arriving late. The file rolls back whole.
  Do not grant anything to work around it inside the window: report the role and the function, and
  take the ruling outside the window.
- **0364's `CLR10` naming a ledger row** (`0336_revenue_recognition_plan_op_key is not applied`, or
  0353's). That would mean the hosted ledger is not what step 3a read, which cannot happen inside
  one window - report it as an estate finding rather than a migration one.
- **0364's `CLR10` naming a suffix** (`% body/bodies outside this file's own three already derive
  %`). That is D-OPKEY-NAMESPACE's failure arriving late: some body outside this wave reaches for
  `:acplan`, `:acrev` or `:tnplan`. Report the body name.
- **0365's drop WAITING rather than refusing.** No file in this wave arms a `lock_timeout`, so a
  conflicting lock makes the `drop function` wait up to 0365's `statement_timeout` of 5 min and then
  raise `57014 query_canceled`. If that happens, the operator is driving the accrual register in a
  browser tab. Close it, re-run 6b to confirm, and re-run 6c from the ledger's current frontier.
- **`add constraint`, `55P03`, `22P02`, a backfill row count.** **None of these is a branch of this
  wave** and each is listed so the absence is deliberate rather than forgotten: there is no
  constraint to add, no `lock_timeout` armed, no bytea-recipe pin and no backfill.
- **Ledger-position branches.** Every file above the frontier is additive against the SERVING image,
  and `refresh-322fdf29` is a legal boot target at EVERY ledger position between 337 and 341,
  because it calls none of the doors this wave creates and its own pins do not move until step 7.
  So: (i) the ledger stopped anywhere below 341 - start the old image, hold the new image and web,
  report, and resume from the frontier in a later window; (ii) the ledger reads **341 /
  `0365_accrual_register_pagination`** - drive forward to steps 7 and 8. **Do not deploy the new
  image at a partial ledger**, and do not promote web either: the new web sends six arguments to a
  door 0365 may not have created.

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

**Expected boot lines. TWO PINS HAVE MOVED, and `bodies` and the bundle banners move with them:**

```
serving git_sha=<full sha> frontier=0365_accrual_register_pagination(341) bodies=62 pins \
        closeExample=closeExampleV1 chatTurn=chatTurn_v23 claraWork=claraWork_v7 \
        documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4 \
        witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1 \
        autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5 \
        bankAgent=bankAgent_v1 closePrep=closePrep_v1
stranded bodies n=0            <- BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5  clara-work/v6  clara-work/v7   <- SEVEN bundle banners
CONTROL listening
LEADER acquired
```

Three things to check by eye, each of which has cost a previous cut something:

1. **`bodies=62`, up from 60**, and the two pins read `chatTurn_v23` and `claraWork_v7`. The other
   twelve are unchanged, `statementFacts` explicitly staying at `statementFacts_v4`. **If either of
   the two still reads its predecessor, the image is not RELEASE_SHA's**: stop and report.
2. **`stranded bodies n=0` BEFORE `durable world started`.** The census is what policy (c) buys: a
   run parked on `chatTurn_v22` or `claraWork_v6` keeps its body because this image carries all
   sixty-two. A non-zero reading means the world refuses DATABASE-WIDE, the crash-only supervisor
   exits 1, and under Fly that is a restart loop rather than a park
   (`packages/runtime/README.md:569-614`, `:930-935`). `CLARA_ALLOW_STRANDED_BODIES=1` overrides
   visibly and **is not used at a release**. On a blank estate the honest expectation is that the
   census is vacuous, which is a weaker proof than usual; read the number anyway, because it is
   where the number becomes readable at all.
3. **SEVEN `clara-work/vN` bundle banners, not six.** This is the trap the v5 cut fell into and the
   v6 cut was written to avoid: v5 shipped without its banner, the engine booted clean on every
   visible signal (`/health` 200, `/ready` 200, `stranded bodies n=0`) and **seven work-lane e2e
   legs failed** with the misattributed message "serve child did not become ready", because
   `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks on that exact banner and its throw is
   swallowed by the caller's retry loop. LC added the seventh line in the same commit as the
   registry repoint and its own drill logged `clara-work/v7` at digest `a0fb27648d30…`
   (`waveK-lane04-ticket1144.md`). Confirm the line is there and that its digest matches whatever
   RELEASE_SHA's build prints.

Signed-in `GET /api/build-info` should agree, field for field: `git_sha` = the full sha, `frontier`
`0365_accrual_register_pagination(341)`, `bodies: 62`, the same fourteen pins, and
`claraWorkBundleIdentityV7()` FIRST in the bundles array.

**Also worth one look in the first sweep's log.** The reconciler's belts run against a blank estate,
so every count should be zero and nothing should be dormant-by-error. A `42883` anywhere would mean
the image is serving against a database below 341.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all nine prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200.

**No signed-out surface changes in this release.** The sweep's invite-preview wait-time notice is the
newest one and it is unchanged.

### Signed in, per lane: what the owner can actually see with ONE firm and NO client

**Read this table before driving anything, because the estate decides most of it.** Hosted carries
`Testing Firm` (one member, the owner) and nothing else: no client, no document, no plan, no
accrual, no Work. Exactly ONE row of this wave is drivable as the estate stands. Every other row
names the minimum seeding it needs, so the owner can decide what to create rather than discover it
on a blank screen.

**And one ordering rule governs the whole table: run step 9 FIRST.** The first chat turn creates the
first `chatTurn_v23` run and closes the rollback window; the first Work creates the first
`claraWork_v7` run and does the same. Drive nothing until step 9's snapshot is recorded.

| lane | ticket | surface | what to see | seeding it needs | writes? |
|---|---|---|---|---|---|
| **L1** | #1147 | `/settings/firm`, the Standing instructions card | **The one row drivable today.** Record a firm-level standing instruction; the card shows who recorded it and when. Then withdraw it: the receipt now carries `plans_still_posting` and, on this estate, says **0** - the firm is told what its withdrawal did NOT stop, and there is nothing to stop | **none.** One firm, one member, an admin or owner. This is the whole check | **yes**, one instruction row, then its withdrawal |
| **L1** | #1148 | a document page for a payroll summary that did not post | the page says WHY, in the database's own words, rather than going silent. The internal verdict stays nobody's to call | a client, a payroll-summary upload, and a run that did not post. Three steps of seeding for one sentence | **yes**, an upload |
| **L2** | #1150, #1149 | **no browser surface.** `apps/web` diff is EMPTY for this lane | its evidence is step 10's catalog reads: one reservation namespace per lane, the third on-behalf-of plan step a caller, and #1051's authority wall still one body | n/a | no |
| **L3** | #1152 | `/clients/<id>/registers?tab=accruals` | the register reads a PAGE at a time and the side filter re-queries the door instead of narrowing rows the browser already fetched. A "Load more" walks to the next page | a client with more than one page of accrual schedules. On a blank estate the register renders empty and proves only that it renders | no |
| **L3** | #1151, #1145 | **no browser surface.** Two intake drills and a README line | evidence is CI and the repository's own `README.md` under "Develop" | n/a | no |
| **LC** | #1144 | the Clara rail, any client | the seven deferred tools answer: three payroll/agreement reads and four tenancy tools, over doors the SWEEP wave already shipped. The roster moves from v22's measured 45 to **52** | a client, and documents of the right kinds for each tool. **Driving ANY chat turn closes the rollback window** | **yes**, a chat turn |
| **LC** | #1144 | `/clients/<id>/registers?tab=fixedAssets`, a fixed-asset acquisition through Clara | the depreciation-particulars proposal is now grounded by `loadFaProposalInputsStepV7`, which reads the knowledge key and the retired-policy ground the sweep's 0345 and 0346 put in the database | a client and a fixed-asset acquisition. **Driving it closes the rollback window** | **yes** |

**The honest summary the owner should be given before they start.** Without creating a client,
exactly one feature of this wave is visible: the standing-instruction card and the count its
withdrawal now returns. Everything else in the wave is either invisible by design (L2's
consolidation, L3's two drills, #1145's README line) or needs an estate that does not exist yet. The
cheapest seeding that unlocks the most is ONE client: that alone makes L3's register renderable and
LC's chat tools reachable, and two of LC's seven tools need no document at all.

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

**Run immediately after step 7, before real traffic can create a run on a new body**, and record the
timestamp. This is the step the wave changes most against the sweep, and the reason is one sentence:
**a wave that only ADDS doors keeps the rollback direction trivially clean; a wave that REPOINTS a
pin makes the previous image a stranding target the moment the first non-terminal run of a new body
exists.** The sweep's step-9 snapshot did not expire. This one does.

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted refresh-322fdf29 index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND probe on
`refresh-322fdf29`, never from the live machine. **The wave-2 window's sftp extraction stalled at
32 KB twice; stream the bundle over `ssh console` and verify it by `sha256sum` against the machine's
own.** Three gates, and the runbook must say which is demonstrated: (a) `FRONTIER_RULES`' body
rules; (b) `FRONTIER_RULES`' door-contract rules; (c) the stranded-body census. Exit 0 = ALLOWED,
1 = REFUSED, 2 = could not answer, **and 2 is never read as either of the others.**

**THE EXPECTED READING ON `refresh-322fdf29` IS `ALLOWED`, EXIT 0 - AND IT IS THE WEAKEST ALLOWED
THIS PROGRAMME HAS RECORDED.** Not because anything is wrong, but because the estate is blank: gate
(c) is satisfied vacuously, over zero non-terminal runs, rather than over a roster of parked work.
Say so in the RESULTS rather than recording it as though it had been tested.

**The five-way shape, with what each reading must say.** Readings A, B, D and E are gate C's to drive
on a disposable cluster; reading C is the one the window itself produces, and the one whose answer
changes with time. The A–D shape is the cut phase's (`waveC-gates.md` §1.4) and E is the sweep's
contract control (`waveS-gates-C.md` §4).

| # | target | non-terminal runs | expected verdict | exit |
|---|---|---|---|---|
| **A** | the built artifact (`--target-bundle`, 62 bodies, 2 contracts) | `chatTurn_v22`, `claraWork_v6`, `statementFacts_v4` | **ALLOWED** | 0 |
| **B** | the previous image `refresh-322fdf29` (60 bodies, 2 contracts) | the same three | **ALLOWED** | 0 |
| **C** | the same previous image (60) | **`chatTurn_v23`, `claraWork_v7`** | **REFUSED (`unsupported_body`)**, ONE refusal line per body, naming each by its WDK directive (`workflow//./workflows/chatTurn.v23//chatTurn_v23` and its sibling) | 1 |
| **D** | the built artifact (62) | `chatTurn_v23`, `claraWork_v7` | **ALLOWED** | 0 |
| **E** | the body-complete roster with **no contracts declared**, the pre-#1035 image | any | **REFUSED (`frontier_requires_contract`)**, naming both rules | 1 |

**Why all three gates pass in readings A, B and D, each with the measurement behind it.**

- **Gate (a), the frontier body rules, passes.** `FRONTIER_RULES` is a three-row table (`0195`
  requires `claraWork_v3`; `0254` requires the `intake_refusal_record_v1` contract; `0279` requires
  `fa_parked_run_v1`) and **this wave adds no row to it**: `git diff origin/main...HEAD --
  packages/runtime/lib/rollback-preflight.mjs` is **EMPTY**, measured. All three rules are applied
  on hosted and both targets satisfy them.
- **Gate (b), the door-contract rules, passes.** `refresh-322fdf29` is built from the sweep wave's
  RELEASE_SHA, which declares both `intake_refusal_record_v1` and `fa_parked_run_v1` in
  `lib/runtime-contracts.mjs`, and this wave does not touch that file either
  (`git diff origin/main...HEAD -- packages/runtime/lib/runtime-contracts.mjs` is **EMPTY**).
  Reading E is the control for it.
- **Gate (c) is the deciding gate, and it is a SNAPSHOT with a very short half-life.**
  `refresh-322fdf29` carries 60 bodies; the new image carries those 60 plus `chatTurn_v23` and
  `claraWork_v7`. The moment ONE of those two has a non-terminal run, the old image IS a stranding
  target and the preflight will say so by name. The v21/v5 runbook wrote the rule plainly
  (`RELEASE-RUNBOOK-0225-0233.md:500-504`) and the cut phase met it one cut later:

  > "`refresh-a296765c` does not carry `chatTurn_v21` or `claraWork_v5`. It is a legal rollback
  > target **only until the first non-terminal run of either exists** - so gate (b)'s clean result is
  > a snapshot, not a standing guarantee, and it degrades within minutes of the image serving."

  Record which body it was and the timestamp. **`reads-wK.mjs --cut-only --prod` re-reads exactly
  that census and is the cheapest way to re-take the snapshot later.**
- **A rollback to `claraWork_v6` has the same non-preflight cost the v5 rollback had**, and it is
  worth restating rather than rediscovering: the preflight counts bodies and reads a rule table, and
  "a parked confirmation resumes under an image with no arm for it" is a door-contract question of
  exactly the class #1035 generalised. v7's own addition is the FA-proposal input-loading step, so a
  rollback to v6 would resume a parked proposal under a step that grounds it differently. **Add this
  to #1035 as a further rule candidate rather than opening a second ticket**, the way wave 4 and the
  cut both did.
- **The DATABASE cannot be rolled back below the frontier.** Nothing in this wave drafts a
  below-frontier rollback, and the only route is the step-3f dump, which returns no Storage bytes,
  no managed Auth config and no engine state. This wave makes that cheaper than usual to say out
  loud: it creates no relation, adds no column and backfills nothing, so what a below-frontier
  restore would have to undo is one allowlist row, one dropped-and-recreated signature and thirteen
  function bodies. **A rollback of the IMAGE is free; a rollback of the SCHEMA is still a restore.**

**So if reading B/C REFUSES at a moment when no v23 or v7 run exists, stop.** Do not roll back, do
not re-run it against a different roster to get a verdict you like. Report the exit code, the
refusal line verbatim and the bundle's sha256, and take the ruling outside the window.

**Which previous image is lawful at which ledger, stated plainly.**

| ledger | is `refresh-322fdf29` a lawful boot target? |
|---|---|
| below 0362 | yes, unreservedly: nothing of this wave landed |
| 0362 to 0364, no v23/v7 run yet | yes: it calls none of the doors these files create, and 0364 moves no signature and no refusal |
| **341**, no v23/v7 run yet | yes: 0365's six-argument door answers a four-argument call identically, so the old image and the old web both keep working |
| **a `chatTurn_v23` or `claraWork_v7` run non-terminal** | **NO**: that run's body is not in the old image and it would strand. Gate (c) is what says so, by name |
| any | no secret, no role and no relation in this wave is read by the old image |

## 10. The reads this wave owes on hosted, after the release

Run `ceremony-wK/reads-wK.mjs --post --prod --baseline scratchpad/wK/fp-wK-upg.json
--frontier-before 0361_reservation_release_advice` through the live machine's DSN. It issues the same
SQL step 3 issued, so pre and post sit side by side. It asserts:

1. the ledger reads **337 + 4 = 341** at `0365_accrual_register_pagination`;
2. all four new migrations have a ledger row whose checksum equals its file;
3. the drift gate over all 341 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified. Expect **the role-level `env` lines and nothing else**.

It then runs the wave's own post reads (`--post` section (f)), lane by lane.

**The reference counts that MOVE: exactly one.**

| relation | before | after |
|---|---|---|
| `clara.wake_fn_allowlist` | N | **N + 1** (`interactive` / `wake_get_firm_standing_instruction`) |
| everything else | unchanged | unchanged |

There is no new relation, no new column, no backfill and no other catalogue insert anywhere in this
wave. That is the whole delta on the data side, and it is why this release's risk is in the image
rather than in the database. The post read prints nine reference counts beside it so the "everything
else" is a reading rather than a claim.

Then the questions the lanes' own headers ask of hosted:

1. **L1 / 0362 (#1147): a read the model lane alone may call, over a relation it holds nothing on.**
   `clara.wake_get_firm_standing_instruction(text)` exists at exactly one row, SECURITY DEFINER,
   STABLE, owned by `clara_fn_owner`, `search_path=clara, pg_temp`, ACL exactly
   `{clara_fn_owner, clara_agent_ro}`; `clara.firm_standing_instructions` still RLS-enabled AND
   forced with SELECT to `clara_authenticated` alone and **no machine role able to select**; the two
   WRITE doors still `clara_authenticated` and nothing beyond; one `wake_fn_allowlist` row, for the
   `interactive` kind.
2. **L1 / 0362: the two rulings this ticket RECORDS rather than takes.** The withdraw door names
   `plans_still_posting` and names **no plan-state verb** - withdrawal still does not pause the plans
   it authorised, and that is an owner decision, not a defect. And the deferred-revenue asymmetry is
   held by a census: `clara._prepayment_schedule_core`'s closed lane set carries `wake`,
   `clara._revenue_recognition_core`'s does not, and **zero** wake wrappers exist for the revenue
   side. Both readings are in the post output; both belong in the #1147 closure comment.
3. **L1 / 0363 (#1148): the wrapper is granted and the internal is not.**
   `clara.get_payroll_posting_state(uuid)` SECURITY DEFINER, STABLE, `clara_authenticated` and
   nothing machine-lane; `clara._payroll_posting_verdict(uuid)` still **ungranted** - not
   `clara_authenticated`, not `clara_agent_ro`, not `clara_runtime`. And
   `clara.list_review_queue`'s `sha256(prosrc)` unchanged beside them, which is what "this file adds
   a read and moves no row kind" means as a measurement.
4. **L2 / 0364 (#1150): one lane, one namespace.** The suffix census over every body in the schema:
   `:plan` derived by the prepayment pair alone, `:rrplan` by the revenue pair, `:acplan` by
   `create_accrual_adjustment`, `:acrev` by `correct_accrual_adjustment`, `:tnplan` by
   `_confirm_tenancy_rent_plan_core`. And **nothing is back-filled**: the receipts already spent on
   each suffix are counted and keep meaning what they meant, because a receipt records an act that
   happened.
5. **L2 / 0364: the third on-behalf-of plan body is a CALLER.** `clara._tenancy_plan_core` calls
   `clara._obo_plan_core`, whose closed kind set now admits `recurring_journal`;
   `clara._assert_plan_authority` is still exactly one body and the plan cores still reach it. Post
   images to compare against the merge's own measurement: `_obo_plan_core` `1e36654777973175…`,
   `_tenancy_plan_core` `67fd7548a7ded4d4…` (`waveK-merge.md` §5.1).
6. **L3 / 0365 (#1152): exactly one overload.** `clara.list_accrual_adjustments` resolves ONCE, at
   `(uuid,date,date,text,jsonb,integer)`, with three defaults, SECURITY DEFINER, STABLE, owned by
   `clara_fn_owner`, `search_path` pinned, `clara_authenticated` and nobody else, and carrying its
   comment. The four-argument shape is GONE rather than left as a resolvable overload, which is the
   state PostgREST cannot disambiguate. `clara.get_accrual_adjustment` still resolves, untouched.
7. **The version cut, re-read.** The run census by body, the stranded census (still 0), and **the
   first runs appearing on `chatTurn_v23` and `claraWork_v7`**. That last number is the one that
   makes step 9's snapshot expire, so record it with a timestamp.

Also re-read the quiescence census once more and record it.

## 11. Manifest, then the tickets

11a. **`node scripts/check-frozen-workflows.mjs --lock-deployed`, and it locks FIFTEEN entries.**
Read this paragraph before running it, because the command locks every unlocked entry GLOBALLY.

- **Why it is not run earlier.** `packages/runtime/README.md:1037-1039`: run it "and commit the
  manifest **after** the image is live, locking before deploy would freeze a body that no parked run
  can yet exist for." `CUT-PLAN.md` §2.4 repeats it, LC declined to run it by decision, and the
  merger confirmed the manifest is correct without it: **15 new entries, every one with no
  `deployed` key**, and the 347 that were `deployed: true` still are (`waveK-merge.md` §4.1).
- **Why fifteen, and why one of them is not LC's own file.** Fourteen are LC's new
  `chatTurn.v23.*` and `claraWork.v7.*` modules. The fifteenth is
  `packages/runtime/lib/fa-proposal-grounds.ts`, created by the SWEEP wave's lane L5 and already on
  `main`: it enters the manifest now because `claraWork.v7.impl.ts` imports it, so it joins the
  frozen closure **without a byte of it moving**. Checked: it is absent from LC's own diff. Unlike
  the cut phase, there is no earlier wave's forgotten set to sweep up - the cut's step 11a locked
  wave 4's ten stragglers along with its own twenty-five, and the sweep confirmed 347/0 three times.
- **Confirm the set before running.** `reads-wK.mjs --plan` prints it (`362 entries, 15 UNLOCKED …
  covering bodies chatTurn_v23, claraWork_v7`); so does a one-line read of `frozen-workflows.json`.
  If the count is not 15 at RELEASE_SHA, find out why before locking.
- **Afterwards, and this is the check rather than the count.** The command prints
  `locked N newly-deployed entr(ies); every manifest entry is now deploy-locked`, with N = 15. Then
  the plain freeze-lint still reads **`362 frozen file(s) / 62 "use workflow" module(s) / 3
  retired`**; the GIT diff of `frozen-workflows.json` touches 15 entries and only their `deployed`
  field, with no `sha256` moving; and **zero entries remain unlocked**, which is the one read worth
  taking because it is the only one that changes:

  ```sh
  node -e "const m=require('./frozen-workflows.json'); console.log(Object.values(m.workflows).filter(e=>e.deployed!==true).length)"   # 15 before, 0 after
  ```
- **`--compare-base origin/main` does NOT change its summary line, and that is expected rather than
  a problem.** Its `existing` figure is the BASE manifest's entry count, its message text is
  unconditional, and its only deploy-flag violation is the REVERSE direction (`UNLOCKED-VS-BASE`,
  which fires when an entry was locked on the base and is not locked now). Locking is monotonic and
  therefore invisible to that line. Read the unlocked count above instead.

**HOW THE MANIFEST CHANGE REACHES `main`, exactly.** `--lock-deployed` writes
`frozen-workflows.json` in the working tree and nothing else. It is REFUSED under CI, by design, so
it can only be run locally. The change therefore lands as **a docs-and-manifest commit on a branch
off `main` at RELEASE_SHA, opened as the NEXT pull request after the release** - the same PR that
carries this runbook's § RESULTS, the as-run record and any follow-ups filed during the window. One
commit, message `chore(runtime): lock the 2026-09-26 closing wave's frozen entries after the image
went live`, touching `frozen-workflows.json` and the plan folder. It must NOT be amended onto the
release PR (that PR is the RELEASE_SHA the image was built from, and rewriting it would break the
provenance), and it must NOT be committed before step 7, because the append-only check then refuses
`REHASHED-VS-BASE` on any pre-release fix to a v23 or v7 file.

11b. **Ticket closures with hosted evidence.** Eight tickets, four lanes. The roster, with each
ticket's claimed status and the report that carries it, is in `reports/waveK-release-prep.md`.

| lane | tickets | migrations |
|---|---|---|
| L1, the standing instruction and the payroll posting verdict | #1147 #1148 | 0362 0363 |
| L2, estate consolidation | #1150 #1149 | 0364 |
| L3, infrastructure | #1152 #1151 #1145 | 0365 |
| LC, the version cut | #1144 | none |

Read each ticket's real title with `gh issue view <n>` before commenting (`gh issue view` printed
nothing at all on this host for lane L1 - exit 0, zero bytes - and `gh api
repos/BELCORT-SDN-BHD/clara/issues/<n>` worked; that is a rig quirk, not a finding). Comment shape,
unchanged from the nine prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`,
release session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail
notice text, and, where the acceptance criterion named a hosted behaviour, the specific reading step
7, 8 or 10 produced. Ending: *"Closing per the awaiting-release rule: local and CI evidence in the
lane comment above, hosted evidence here."*

**Three closures are not plain DONE and must say so**: #1147 (built for the two halves the ticket
asked for, with the third PINNED by a census rather than built, and **one owner ruling still
unrecorded on GitHub** - see the release-prep report, which quotes it), #1151 (one acceptance
criterion carries a disclosed alternative rather than a passing run) and #1144 (two deliberate
departures from the sweep's amendment §7.2, plus one comment correction that could not ride this cut
and is a successor contract).

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback
command, the two moved pins, and the fact that this release's step-9 snapshot DOES expire - the
opposite of the sweep's.

**Still owed after this release, and not part of it:** the six successor contracts
`waveK-merge.md` §6 lists, every one of them for the cut AFTER this one, because LC's roster is
closed; the from-scratch chain all four lanes carry as an open debt; the 23 World-gated runtime cells;
LC's `STD-2` (a cosmetic collapsed env block in `.github/actions/db-live-gates/action.yml`); L3's
`STD-1` (a house-law question for `WORK-ORDER.md`); the `role-census-reset.test.mjs` quoting fix the
merge's own §5.3 found; a `CONTEXT.md` entry for the firm standing instruction; and the blueprint pin
drift in `docs/ARCHITECTURE.md:171, :183, :207, :445`, which has been wrong since the 2026-09-15 cut,
is now FIVE cuts stale, and is a wayfinder session's, not a lane's.

---

## The preflight, dry run

Migrations directory and `CLARA_REPO`: `clara-wt/int2` at `18eb2dc4d`. Every negative control acted
on a COPY of the migrations directory or of an exported fingerprint, except controls 8 and 9, which
edited a tracked file in the int2 worktree and restored it with `git checkout --` immediately, the
tree read clean afterwards. Databases: `127.0.0.1:55742`, the merger's own cluster, read-only. No
database was created, altered or dropped.

| run | target | verdict |
|---|---|---|
| `--plan` | no database | **exit 0, 0 GAP.** 4 pending, 341 files, **22 pins (22 measurable / 0 chained)**, 10 hand checks, 0 relations created, 0 roles minted, the registry reading `bodies=62 … 362 entries, 15 UNLOCKED, SUCCESSOR BODIES chatTurn_v23, claraWork_v7` |
| pre-window + `--baseline fp-wK-pre.json` | `clara_intS6`, the pristine 337-file template (337 / `0361`, `C.UTF-8`) | **12 ok, 2 report-only, 3 STOP.** 11457 keys compared, **11457 equal, 0 env**; **22 of 22** measurable pins admitted; every hand check ok. The three STOPs are the run census and the two checks derived from it |
| `--post` + `--baseline fp-wK-post.json` | `clara_intK`, the merger's ordered chain (341 / `0365`, `C.UTF-8`) | ledger **337 + 4 = 341 at 0365**, four rows at their file checksums, drift 341/341, fingerprint **11459 keys, 11459 equal, 0 env**, **every (f) read answered** - no `42703`, no unmeasured question. Same three run-census STOPs |
| `--census` | `clara_intK` | the version-cut census and the quiescence census alone, which is what step 6b re-reads with the machine stopped |
| `--cut-only` | `clara_intK` | section (v) alone: the registry, the manifest, the run census by body, the stranded census and the two successor bodies' run counts. This is the snapshot step 9 records |

**THE TWO FINGERPRINTS, recorded here so the window compares against a known artefact.**

| fingerprint | source | ledger | structural keys | reference counts | sha256 of the file |
|---|---|---|---|---|---|
| **PRE** `fp-wK-pre.json` | `clara_intS6`, the sweep merger's ordered 337-file chain, which gate A proved byte-equal to a from-scratch build and which every lane database was cloned from | 337 / `0361_reservation_release_advice` | **11457** | 55 | `e48fefcf1a06aeffc0b1ae6b8f22ae556b3f0fc9fca64fcd5eb3ddf97e14de24` |
| **POST** `fp-wK-post.json` | `clara_intK`, the closing wave's ordered chain of all four lanes | 341 / `0365_accrual_register_pagination` | **11459** | 55 | `0874c98ef16634076bcf26df8b93685d5dff121878328041fdd10dd5566e1514` |

**The wave adds exactly 2 structural keys** and no reference relation, which is itself a reading of
how small the database half is: 0362 and 0363 each mint one function, 0364 replaces six bodies in
place, and 0365 drops one signature and creates another. Both fingerprints were taken at `C.UTF-8`;
hosted is `en_US.UTF-8`, and an `en_US.UTF-8` cross-collation reading is owed and is named under
"What this draft could not verify". **Neither is the baseline the window uses.** A hosted-shaped
baseline must be exported from a database at the hosted frontier by the SAME script and the SAME
tree, and the two above are the release-preparation worker's dry-run artefacts, not the gate
worker's.

### Negative controls

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | the HOISTED pin's literal corrupted by one hex digit, in a COPY (0362's `withdraw_firm_standing_instruction`) | `STOP PIN … [hoisted, recipe utf8]`, **21 of 22**, printing both sides AND the file's own REDO arm (`a body carrying "#1147 [0362]"`) so a first-apply target is not mistaken for drift |
| 2b | the SAME literal made unparseable (upper-cased), in a COPY | the pin SILENTLY LEAVES the ledger: `22 of 22` becomes `21 of 21`, and no GAP is raised. **This is a limitation of the whole parser family, inherited rather than introduced**, and the only guard is the recorded COUNT - which is why 22 is written into gate 0a above |
| 3 | an applied file's bytes changed in a COPY (0361) | `DRIFT 0361… - checksum differs from the file` and `STOP drift gate` |
| 4 | `--post` against the un-upgraded template | STOPs on the arithmetic (`applied=337 frontier=0361`) and on four `no ledger row` lines |
| 5 | a baseline value corrupted on an object a pending file PINS | `STOP DRIFT (PINNED by 0364_plan_reservation_namespace_obo_fold) fn:clara._assert_plan_authority(...)` |
| 6 | the same corruption on an object no pending file names | `STOP DRIFT fn:clara.claim_paid_firm(uuid,text)`, unqualified |
| 7 | `CLARA_REPO` pointed at a tree with no `registry.ts` | in `--plan` the registry section says so by name; against a database the script fails at module resolution on `packages/db/lib/pg.mjs`, which is loud rather than silent |
| 8 | a `frozen-workflows.json` with EVERY entry `deployed: true` | `STOP THIS RELEASE IS A VERSION CUT … all 362 entries are already deployed:true - this is NOT the version cut the runbook describes` and `STOP … this tree introduces no successor body` |
| 9 | `workflowPins` left at `chatTurn_v22` / `claraWork_v6` | the boot line prints the OLD pins and `STOP … no class carries a predecessor whose module is unlocked`. An un-repointed registry cannot reach step 7 |

Controls 8 and 9 are this wave's own, and they are the mirror image of the sweep's: there, the
check existed to prove the successor set was EMPTY; here, it exists to prove it is not.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the role
  census, the run census, the machine and web ids and the estate's contents are taken from
  `RELEASE-WS-RUNBOOK.md` § RESULTS, `factory-reset-2026-09-26/RUNBOOK.md` § RESULTS, the migration
  files and the rigs; none is read from hosted.
- **RELEASE_SHA does not exist yet.** The closing-wave PR is unopened and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `18eb2dc4d`, the
  integrated head.
- **The two-build cutover drill.** NOT run by the merge (`waveK-merge.md` §7.2) and owed to gate C.
  A version cut may not open a window without it, and this draft records its absence rather than
  reasoning around it.
- **The from-scratch chain.** `CLOSING-PLAN.md` risk 1 forbids a second from-scratch chain on
  cluster 55742, and all four lanes carry it as an open debt. What exists instead is the ordered
  chain from `clara_intS6`, replayed three times.
- **`D-ROLE-REACH` against hosted's POST-RESET role catalog.** Every rig here migrates as a
  superuser, so the check has only ever returned `superuser=true`. Hosted answered it good on
  2026-09-25, and the 2026-09-26 reset dropped and re-minted the roster afterwards, so the answer is
  unread until step 3.
- **The run census against a database that carries rows.** No lane rig has a provisioned Workflow
  DevKit World, so `workflow.workflow_runs` answers `42P01` on all of them and the census fails
  closed. The SQL is the runtime's own, mirrored rather than imported. Gate C provisioned the schema
  for the sweep and drove the preflight five ways against it, so the SHAPE is exercised; what stays
  unexercised is this script's own census statements against a database carrying rows - and hosted,
  being blank, will not exercise them either.
- **The env-line count against a post-reset estate.** The cut and the sweep both read 16 role-level
  `env` lines; the factory reset's own post read saw 12 against a rig baseline. This draft expects
  about 12 and cannot narrow it further.
- **Whether PostgREST reloads its schema cache promptly after 0365's signature change.** Supabase's
  DDL event trigger should handle it; this draft cannot test it, and step 8 is where it shows.
- **An `en_US.UTF-8` replay.** Both fingerprints above were taken at `C.UTF-8`. The cut measured the
  cross-collation reading in both directions and found it irrelevant by construction for body pins;
  this wave pins no content digest either, but that is reasoned here rather than measured.
- **The runtime build.** `pnpm --filter @clara/runtime build` was not run at the integration head
  (`waveK-merge.md` §7.5), so step 4 is the first one.
- **Whether the #917 CA-path workaround is still needed now that the DSN is the direct host** rather
  than the pooler. Re-check at step 3f rather than assuming either way.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.

---

## § RESULTS (as run, ____-__-__, UTC)

**Authority.** _(the owner's riders plan of 2026-09-20, the release-ownership ruling of 2026-09-17,
and the beta ruling that hosted users and data are test data - #826, 2026-09-15, `ARCHITECTURE.md`
§5.F. Record whether "owner says go" was captured in-session or only asserted by gate 0a's
checklist.)_

**Gates 0a.** _(RELEASE_SHA, tree clean, `ci` SUCCESS, the `--plan` gate's exit code and its four
counts, the freeze-lint's 362/62/3 and its `--compare-base` line, the selftest, parts-parity, the
registry-view cell, the web rollback lever's pre-window listing, gate C's two-build drill verdict.)_

**Step 1.** _(fly identity, machine count, checks.)_

**Step 2.** _(probe id, image, digest, state. Note whether the positional `sleep infinity` form was
needed, as the factory reset found.)_

**Step 3, pre-window reads.** _(times, server identity and COLLATION, ledger, drift gate, pending
set, PARSE GAP count; the fingerprint's keys/equal/env and the env-line count against the post-reset
estate; the pin ledger's 22 of 22 and the arm distribution; each of the ten hand checks, naming
D-ROLE-REACH's reading, D-DROPPED-DOOR's overload count and D-MACHINE-LANE-GRANTS' role roster; the
run census and the quiescence census; the verdict.)_

**Step 3f, backup.** _(times, artefact path, byte count, sha256; whether the CA-path workaround was
still needed on the direct host; how much smaller the dump is than the pre-reset one.)_

**Steps 4 and 5, before the window.** _(image tag and digest, size, build times and any source-map
noise; web Worker version id, tag, build sha, upload time. Not promoted.)_

**Step 6, the window.** _(6a stop times; 6b census; 6c migrate times and the `4 new … 341 total`
line, with each file's prestate and tail notice quoted; 6d the ledger reading and which branch.)_

**Post reads.** _(times, ledger arithmetic, checksum rows, drift gate, fingerprint vs the upgraded
baseline, and section (f) lane by lane including the two #1147 rulings' readings and the suffix
census.)_

**Step 7.** _(probe destroyed, deploy times, start, `/ready` 200, the OUTAGE window; the boot line in
full with `bodies=62` and both moved pins; `stranded bodies n=0` before `durable world started`;
SEVEN bundle banners and the v7 digest; `/ready` pool states; `/api/build-info`.)_

**Step 8.** _(promotion times and the previous version id; the signed-out smoke roster; the
signed-in walk - which rows were driven, which were not drivable on a blank estate, and whether the
owner created a client. Note the accrual register's behaviour, which is where a stale PostgREST
cache would show.)_

**Step 9, rollback preflight demonstration.** _(second probe id, bundle bytes and sha256 verified
both sides, the run through the LIVE DSN, each of the three gates, the verdict and exit code, the
TIMESTAMP, and - because this snapshot expires - whether any `chatTurn_v23` or `claraWork_v7` run
existed at the moment it was taken.)_

**Step 10.** _(covered by the post reads above; record the one reference count that moved and
confirm the others did not.)_

**Step 11.** _(11a: the unlocked count before and after, the `locked N` line with N = 15, the
freeze-lint afterwards, and the branch and commit the manifest change landed on. 11b: the eight
closures, naming the three that are not plain DONE.)_

**Deviations from the draft.** _(everything the window met that this page did not predict, in one
list, with the reading that showed it.)_
