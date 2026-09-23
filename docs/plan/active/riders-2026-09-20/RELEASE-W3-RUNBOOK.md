# Hosted release ceremony, riders wave 3: migrations 0273...0293 + runtime image + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on `RELEASE-W2-RUNBOOK.md` and on
its `§ RESULTS (as run, 2026-09-23, UTC)`, whose lessons are folded in rather than repeated:
the via-probe wrapper, streaming a bundle over `ssh console` instead of sftp, and the role-level
fingerprint overrule (now built into the script, section 3b).

RELEASE_SHA = **`________`** (the merge commit of the wave-3 PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\int2` (branch `integration/riders-w3`, head `ba54ad2bd`, all
eleven lanes merged) carries **288** files under `packages/db/migrations/`, highest version
`0293_fa_arrears_judgement_scope`. Hosted is at **267 / `0272_document_capability_wall_completion`**
(`RELEASE-W2-RUNBOOK.md` § RESULTS, 2026-09-23; re-read live at step 3). So the migrate step should
report

```
migrate: 21 new migration(s) applied · 288 total
```

288 is the FILE count (`packages/db/scripts/migrate.mjs` prints `migrations.length`); `0293` is only
the highest version NUMBER. The five pre-existing gaps at 0032 and 0073...0076 are why the two
differ. Re-derive this against whatever `main` and the hosted ledger actually are at window time:
the preflight script prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-W2-RUNBOOK.md` § RESULTS; re-read live at step 3):
DB **267 / `0272_document_capability_wall_completion`**. Runtime image **`refresh-68b979bf`** =
`registry.fly.io/clara-runtime@sha256:3ee73d61a28b85f163339207d75b8954f2971d5eff54ca4a99e78dff8f8c85b5`
(265 MB, measured boot `bodies=55`, pins `closeExample=closeExampleV1` / `chatTurn_v21` /
`claraWork_v5` / `clientOnboarding_v5`), single Fly machine **`48ee715b763048`** (never touched
directly; exactly two calls all window, `stop` and `start`). Web
**`686ab53f-4079-4305-8d0b-54efac86adc0`** (tag `refresh-68b979bf`, 100% since 2026-09-23 07:21:21Z;
the one before it is `922f9428-215c-4536-9602-5e0dd007efbd`).

**Secrets rule (unchanged from all five prior runbooks).** The fly token and the DSN are substituted
INLINE inside one pipeline only: never assigned to a shell variable, never echoed, never in argv.
The wave-2 window did this with a small wrapper, and it is the shape to reuse:

```
# C:\Users\zhant\AppData\Local\Temp\claude\...\scratchpad\release-w2\via-probe.sh
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

---

## 0. Rehearsal: the 0272 -> 0293 UPGRADE replay, measured

Run on the disposable cluster `17/rigw2`, port 55760, trust auth, user `postgres`, host `127.0.0.1`,
2026-09-23, by the release-preparation worker:

- `clara_w2_upg2` (the wave-2 upgraded database: **267 / 0272**, seeded, 2 firms, 157 clients,
  341 `accounting_work` rows) was cloned with `createdb -T` into `clara_w3prep_upg` and the 21 files
  applied with the ordinary `migrate.mjs` from the `int2` tree:
  **`migrate: 21 new migration(s) applied · 288 total`**, 23 prestate notices and 23 tail notices,
  every one clean/OK, no CLR, no lock wait.
- Timed on a second clean clone (`clara_w3prep_t`, same source): **T = 8.2 s** wall for the whole
  21-file run including node start-up. Budget for the ssh hop on top: the wave-2 window took
  2 min 46 s for 38 files through the probe, so **expect the order of a minute, not of ten**.
- Both clones were dropped afterwards. No existing database was created, altered or dropped, and no
  from-scratch chain was run.

Two things follow, and both are actions rather than caveats:

1. **Re-check that the rehearsal tree is the tree that is actually released.** The clones were built
   from `clara-wt/int2` at `ba54ad2bd`. If the integration branch moves before the window, clone
   `clara_w2_upg2` again (`createdb -T`, the source must have zero open connections; retry if
   refused, never terminate a session) and re-run `migrate.mjs` against the RELEASE_SHA directory.
   Expect **`21 new migration(s) applied · 288 total`**.
2. **Export the post-release fingerprint baseline from the UPGRADED clone**, and the pre-window
   baseline from a clone that is still at 267 / 0272. Both exports must come from the SAME script
   (`ceremony-w3/reads-w3.mjs --export-fingerprint`) and the same tree.
3. **The gate worker's own rig is the better source once it exists.** `rigw3` (port 55770) with
   `clara_w3_hosted` (267 / 0272, seeded) and `clara_w3_upg` (the same plus the 21) is being built;
   when it exists, export both baselines from it instead and record which cluster they came from.
   The merge record's standing rule still holds: **do not reuse a database that already carries 0290
   or above**, and **confirm on the rig that 0284's prestate prints "clean" behind 0283** (the
   bimodal pin `ba54ad2bd` introduced). The replay above did both: 0284's prestate read
   `clean -- ... the twelve bodies this door nests or calls are byte-identical to their measured
   pre-images` with 0283 already applied.

A rehearsal on a seeded-only cluster proves DDL and guard logic, **not** the row-shaped hazards.
Those are answered only by step 3's reads against hosted. This wave's row-shaped hazards are
enumerated in step 3c.

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
  versions list` to confirm the active version is `686ab53f-4079-4305-8d0b-54efac86adc0` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy 686ab53f-4079-4305-8d0b-54efac86adc0@100% --yes`.
- **No frozen body changed in this wave, and that is a measurement.** `git diff --stat
  d96a33f31..HEAD -- packages/runtime/workflows` in `int2` is **empty**, and `node
  scripts/check-frozen-workflows.mjs` on `ba54ad2bd` reports
  `OK - 312 frozen file(s) ... 55 "use workflow" module(s) all frozen+registered; 3 retired
  entr(ies)`, identical to the serving image's own numbers. So the serving pins stay
  `closeExample=closeExampleV1` / `chatTurn_v21` / `claraWork_v5` / `clientOnboarding_v5`,
  `bodies=55` stays 55, step 11a's `--lock-deployed` has nothing to lock, and the previous image
  cannot strand a body of this cut. **The riders plan's "ONE successor cut `chatTurn_v22` /
  `claraWork_v6`" is NOT in this wave** - the measurement above is the proof, and that cut is still
  owed at the end of the programme.

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-68b979bf --app clara-runtime \
      --name probe-w3 --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy. Step 9 needs a SECOND probe on the same serving image.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-w3/reads-w3.mjs`, run as the child of
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
  node docs/plan/active/riders-2026-09-20/ceremony-w3/reads-w3.mjs \
       --plan --frontier-before 0272_document_capability_wall_completion
```

Expect 21 pending files, 4 generated CHECK reads (one of them DEFERRED to `D-REGION-PATH`), 2
generated FK reads, 5 ADD COLUMN reads, 8 index reads, 1 whole-table UPDATE read, 0 SET NOT NULL, 0
VALIDATE, 0 top-level DELETE, 17 hand-written data preconditions and **zero GAP lines**.

**Dry-run evidence (rig only, 2026-09-23, cluster `17/rigw2` port 55760).** The script was exercised
end to end before this runbook was written, and every check family was proved to STOP:

| run | target | result |
|---|---|---|
| `--plan` | no database | 21 pending, 4+2+5+8+1 generated reads, 17 hand checks, 0 GAP, exit 0 |
| pre-window + `--baseline` | `clara_w3prep_hosted` (267 / 0272) | 31 `ok`, 9 `note`, 0 STOP, 0 GAP, verdict CLEAN, exit 0 |
| `--export-fingerprint` | `clara_w3prep_hosted` | 10809 structural keys, 36 reference counts |
| `--export-fingerprint` | `clara_w3prep_upg` (288 / 0293) | 10976 structural keys, 36 reference counts |
| `--post --baseline` | `clara_w3prep_upg` | `267 + 21 = 288 at 0293`, 21/21 ledger rows at their file checksums, drift gate 288/288, 10976 keys compared and equal, verdict CLEAN, exit 0 |
| fingerprint stress (pre vs the UPGRADED baseline) | `clara_w3prep_hosted` vs `fp-w3-upg` | 10977 keys, 197 differences: **114 PINNED, 83 TOLERATED, 0 unexplained DRIFT, 0 env** - every difference the 21 migrations make is attributable to a named file |
| NC `--prod` on a rig | `clara_w3prep_hosted` | STOP `--prod: hosted estate` |
| NC an applied file deleted from the directory | same | 3 STOPs, incl. `267 applied vs 266 file(s) at or below 0272` |
| NC one applied file's bytes changed | same | drift gate STOP |
| NC a CHECK narrowed in a file copy, on a POPULATED table | same | STOP, `157 existing row(s) would fail` |
| NC a unique index re-keyed in a file copy | same | STOP, `45 key(s) already hold more than one row` |
| NC an ADD COLUMN that already exists | same | STOP, `ALREADY PRESENT - this is a redo or a half-applied estate` |
| NC a parsed literal changed (240 to 241) | same | STOP `D-REGISTRY-1012 ... rows=240` |
| NC an anchor sentence removed | same | `GAP literal the prior_gl rows carrying browser_entrance`, exit 1 |
| NC 0290's own census removed, so the CHECK deferral has nothing behind it | same | 2 GAPs - **the deferral is not a free pass** |
| NC a baseline value corrupted on an UNNAMED object | same | `STOP DRIFT fn:clara._abandon_close_core(...)` with both sides |
| NC a baseline value corrupted on a PINNED object | same | `STOP DRIFT (PINNED by 0280, 0281, 0283, 0284) fn:clara.revise_accounting_plan(...)` |
| NC a baseline **role attribute** corrupted (LOGIN, BYPASSRLS) | same | `env ROLE-LEVEL ENVIRONMENT FACT` with both sides, **verdict CLEAN, exit 0** |
| NC a baseline **role membership** removed and a managed one invented | same | two `env` lines, **verdict CLEAN, exit 0** |
| NC `--post` against a directory missing four files | `clara_w3prep_upg` | ledger STOP `267 + 17 = 284` plus four `applied but absent` DRIFTs |

No database was created, dropped or altered for any of this beyond the three throwaway clones, which
were dropped: the negative controls act on COPIES of the migrations directory and on COPIES of the
exported fingerprint, never on a database.

Then, through the probe:

```
PROBE=<probe-id> via-probe.sh node docs/plan/active/riders-2026-09-20/ceremony-w3/reads-w3.mjs \
      --prod --baseline <the rig hosted-frontier fingerprint>
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted pooler estate
(`db=postgres`, port 5432, not loopback). Ledger expect **267 / `0272_document_capability_wall_completion`**;
drift gate over all 267 applied rows (`migrate.mjs` aborts the whole run on one checksum mismatch,
so a drift here is a STOP before the window rather than a surprise inside it); the pending set listed
and asserted to be exactly the files above the frontier; and the printed arithmetic
`267 + 21 = 288 / 0293_fa_arrears_judgement_scope`. The run writes `ceremony-w3/reads-w3.state.json`
so `--post` can re-derive that sum.

**3b. THE ESTATE FINGERPRINT, with the wave-2 overrule now built in.** The script compares hosted
against a baseline produced by the SAME script with `--export-fingerprint` from a rig database at the
hosted frontier. It covers every function in `clara` (identity signature, `sha256(prosrc)`, owner,
SECURITY DEFINER, `proconfig`, ACL), every relation (columns, constraints with `convalidated`,
indexes, RLS enabled and forced, policies, triggers with `tgenabled`, view definitions, owner, ACL),
the schema's own types, and the `clara%` roles with their memberships.

**What changed for wave 3, and why it is a correction rather than a loosening.** The wave-2 window
STOPPED on **14 role-level differences that were all Supabase-only environment facts** - LOGIN on
the seven `*_login` roles, `clara_storage_docs` and its two memberships, `authenticated ->
clara_authenticated`, four `postgres -> clara_*` memberships - and the operator overruled every one
by hand at 06:51Z. The wave-2 as-run's own closing sentence asks for this fix. So:

- `role:` and `rolemember:` differences now print as **`env`** lines, with both sides, and never
  count as a STOP.
- **Everything else still STOPs**: functions, relations, columns, constraints, indexes, RLS,
  policies, triggers, types and grants. A migration that meant to change a role would also move a
  grant or an ACL, which is still a STOP.
- Checked before widening: **zero `create role` / `alter role` statements across all 21 files**, and
  no file asserts a role attribute or a membership.

A difference on an object a pending file merely names and rewrites prints as **TOLERATED**. A
difference on an object a pending PRESTATE **pins** prints as **STOP DRIFT (PINNED by <file>)**,
because that pin is what will refuse inside the window. Expect on hosted: **0 DRIFT, 0 PINNED
DRIFT, and the same 14 `env` lines wave 2 saw** (re-count them; a fifteenth is a finding).

**Watch this one in particular.** `clara.revise_accounting_plan` is PINNED by four files
(0280, 0281, 0284) and RECUT by one (0283), and 0284's pin is **bimodal** since `ba54ad2bd` - it
admits `87c9f1e9...` (the pre-image) or `8a6e69ef...` (0283's own output). If the fingerprint reports
a pinned drift on that body, read both shas out of 0283's prestate before concluding anything.

**3c. THE DATA PRECONDITIONS a rehearsal on seeded data cannot prove about hosted rows.** Only FOUR
of the 21 files read a real row at apply time, and only three of them can refuse on one. The table
below is exhaustive: every statement in the 21 whose success depends on existing rows, the read that
covers it, and then the ones that need no read with the reason.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| gen | 0291 | `add constraint ck_bank_statement_lines_citation_shape` on the live `clara.bank_statement_lines` | the CHECK names `citation_extraction_id`, which 0291 ADDS in the same run; every existing row is NULL and the CHECK admits NULL. The script proves the add by parsing it, then reports `ok` |
| gen | 0291 | `add constraint ck_bank_statement_lines_citation_page` | same shape |
| gen | 0291 | `add constraint ck_bank_statement_lines_citation_region` | same shape |
| gen | 0290 | `add constraint ck_document_regions_field_path_grammar check (clara._field_path_conforms(field_path))` | **DEFERRED to D-REGION-PATH**: the CHECK calls a function 0290 itself creates, so the generic read cannot run. `D-REGION-PATH` runs 0290's OWN prestate predicate instead, parsed out of the file |
| gen | 0277 | `add constraint fk_fa_depreciation_policy_congruent` on `clara.fixed_assets` (dynamic `execute`) | 1 of its 3 referencing columns is created by this wave and is NULL on every existing row, so MATCH SIMPLE satisfies it trivially; the read reports the register's row count, because the VALIDATE scan still reads every row under ACCESS EXCLUSIVE |
| gen | 0291 | `add constraint fk_bank_statement_lines_citation_extraction` | same shape; the read reports `clara.bank_statement_lines`'s row count and size |
| gen | 0277 | `add column clara.fixed_assets.depreciation_policy_id` / `.depreciation_policy_version` | both must be ABSENT (a redo or half-applied estate is a STOP) |
| gen | 0291 | `add column` x3 on `clara.bank_statement_lines` | all three must be ABSENT |
| gen | 0274 | `create index ix_counterparties_client_kind_tin_normalized` on the live `clara.counterparties` (expression, partial) | rows entering the index and the relation's total: **a BUILD COST, not a failure mode**, but the build holds SHARE on the whole relation and blocks writes for its duration, and 0274 arms NO `lock_timeout` |
| gen | 0277 | `create index ix_fixed_assets_depreciation_policy ... where depreciation_policy_id is not null` | the predicate names a column this wave adds, so ZERO rows enter it; the read reports the register's size for the SHARE lock's duration |
| gen | 0275/0277/0279/0286 | six indexes, two of them UNIQUE | every one is on a relation this wave CREATES: the index builds over zero rows |
| gen | 0288 | `update clara.document_capabilities set registry_version = registry_version + 1` - **no where clause** | the relation's row count (expect 240). Every row fires the monotonicity, high-water, high-water-record and uniformity triggers |
| D-ADJ-TEMPLATES | 0282 | the prestate REFUSES while any `clara.adjustment_templates` row is not `retired` | `count(*) from clara.adjustment_templates where <the file's own predicate>` = 0, plus the table total. A proposed or live template on hosted BLOCKS the wave. The 2026-09-18 hosted census found zero rows; re-read it |
| D-REGISTRY-1012 | 0288 | sectionD's five-armed prestate over the published registry | one read answering all of it: 240 rows, ONE distinct `registry_version` at or above 3, exactly 7 `prior_gl` rows carrying `limits.browser_entrance`, zero rows OUTSIDE `prior_gl` carrying it, and zero rows already carrying `limits.seeding_lane` |
| D-REGISTRY-BASIS | 0288 | the same prestate refuses if 0228's basis sentence has drifted on any of the 7 | the marker literal is parsed out of the file and counted against the 7 |
| D-REGISTRY-HIGHWATER | 0288 | the prestate demands every published `(format, document_kind)` pair already carry a high-water mark that AGREES | 0288's OWN left join, parsed out of it and run read-only |
| D-SEEDING-HISTORY | 0288 | the prestate counts `clara.seeding_batches` and `clara.seeding_proposals` and the tail demands the counts did not move | both counts plus open batches. **A NOTICE, never a refusal: no number of hosted seeding rows can block this migration** |
| D-REGION-PATH | 0290 | `add constraint ... check` scans every `clara.document_regions` row | 0290's own preflight predicate, parsed out of the file: total rows, rows with a `field_path`, and rows whose `field_path` the new grammar would refuse. **Non-zero is a STOP** |
| D-REGION-INSERT-ACL | 0290 | the prestate refuses unless `clara_fn_owner` is the ONLY role with INSERT on `clara.document_regions` | the INSERT grantee roster |
| D-BSL-SHAPE | 0291 | the prestate refuses a half-applied estate; the three CHECKs and the FK then scan the whole table | the three columns' presence, plus the relation's row count and size |
| D-FA-REGISTER-SHAPE | 0277 | two guarded `add column`s and one guarded `add constraint` on the live register | both columns and the FK absent, plus `fixed_assets` / `fa_account_profiles` / `fa_depreciation_authorities` counts |
| D-FA-PARKED | 0279 / 0293 | the run doors gain a FOURTH outcome, `{status:'parked'}` | live depreciation authorities, the fiscal-year status census, closing-or-closed years, and whether `clara.fa_arrears_resolutions` already exists. **This is the read that decides how urgent the runtime release is** - see section W |
| D-TIN-CONFLICT | 0274 | the new identifier tier resolves a party by normalised TIN | rows entering the new index and `(client, kind, normalised tin)` keys already held by more than one live row. The index is NOT unique, so neither number can fail the migration; a non-zero collision count is what the new arm will ask a person about |
| D-CLIENT-BIRTH-WALL | 0287 | the two-or-more name-family wall moves to the door that CREATES a client | the client census and the firm x squashed-name families already holding two or more live clients. Informational: the wall applies to a NEW create, never to rows already there |
| D-TI-REFERENCE | 0275 | the prestate refuses if a UNIQUE index already constrains `clara.trade_invoices.reference` | the catalog read plus the invoice count |
| D-VENDOR-GRANTS | 0273 | the prestate refuses a PARTIAL prior revoke, demands the surviving read doors stay granted, and refuses any PUBLIC EXECUTE | both door rosters are PARSED out of the file (the write arm from its own REVOKE statements, the read arm from its prestate's signature literals) and their grants read |
| D-ACCRUAL-CORRECTION | 0284 | the prestate demands 0222's two pointer columns and `uq_accrual_adjustments_corrects` | the columns, the unique, and the relation's row count |
| D-OPENING-PREMISE | 0286 | the prestate demands 0017's two uniques and `documents.authoritative_extraction_id` | all three, plus `opening_tb_targets`'s row count |
| D-PLAN-OVERLAP | 0283 | `drop function clara._plan_overlap_warning(uuid,jsonb)` and three recut plan writers | the plan census and how many `_plan_overlap_warning` bodies are live (0283 leaves exactly one) |

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective. Derived by stripping every `create [or replace] function` BODY from each file - a body is
inert at apply time - and reading only what is left.

- **0273** executes three `revoke execute` and nothing else. No row, no table lock.
- **0276** creates ONE new function and grants it. No row, no existing relation touched.
- **0278** is comment-only: two `comment on function` on bodies it does not recut.
- **0280, 0281, 0282, 0284, 0285, 0287, 0289, 0292, 0293** execute NO DDL on any existing relation
  and NO DML at all: they are `create or replace function` recuts, catalog splices and grants.
  `create or replace function` touches no row. Their prestates pin `prosrc` shas, which the
  FINGERPRINT (3b) covers in one place for all of them rather than restating them here.
- **0275, 0279, 0286** create a NEW table each, with its indexes, RLS, policies and triggers. A new
  table has no existing rows.
- **0283**'s `drop function clara._plan_overlap_warning(uuid,jsonb)` drops an UNGRANTED internal.
  It is the only DROP in the whole wave, and nothing outside `clara` can name it.
- **0288's behavioural probe** INSERTs a synthetic user, firm, membership, client, document,
  seeding batch and proposal through the real doors and unwinds the subtransaction. It is scoped to
  the ids it mints, so no hosted row is read or written.
- **0290's tail probe** is the same sentinel idiom, and it re-counts `clara.document_regions` before
  and after to prove the probes left no residue.
- **0284's, 0292's and 0293's** writes are all inside function bodies (the correction door, the
  birth sites, the arrears record door). They run when a person calls them, not when the file
  applies.

**3d. The quiescence census** (`--census`, re-run after the machine stop): non-terminal
`clara.agent_tasks` by kind and status, unbound live tasks (the rollback preflight's second census),
non-terminal `clara.accounting_work`, `clara.document_processing_tasks` by lane and status, pending
`clara.agent_interruptions`, `workflow.workflow_runs` by status and the non-terminal ones by name,
`clara_runtime%` sessions, the F10 advisory holder (`classid 439041101`, `objid 794746`), and any
lock held by another backend on the relations this wave locks. **That relation list is PARSED from
the executed statements, not transcribed**; on `ba54ad2bd` it reads `bank_statement_lines,
counterparties, document_capabilities, document_extractions, document_regions, fixed_assets`.

**3e. Pre-images.** This wave changes no frozen body and drafts no below-frontier successor
migration. The FINGERPRINT export IS the pre-image record: it carries `sha256(prosrc)` for every
function in `clara`, and it is written to a file before the window.

**3f. DB RESTORE POINT: the full dump, through the probe DSN into WSL.** `backup.mjs --profile full`
(`pg_dump` 17.11 lives in WSL; Windows has none). The wave-2 window took 61 s for 218,769,251 bytes
plus a 12,177-byte globals dump. **The CA-path workaround is still required and still unfixed
(#917):** `scripts/ops/dsn-pipe.mjs` pins `sslrootcert=<CA>` with the WINDOWS spelling of
`ops/tls/pooler-ca.crt`, which a WSL child cannot open (`ENOENT`). Re-check whether a `--child-os
wsl` spelling exists on RELEASE_SHA before assuming the wrapper is needed. If it is, respell **only
that one pin** to `/mnt/c/...` (same committed CA, `verify-full` kept, DSN env-only, never printed),
with

```
export WSLENV='PGHOST:PGPORT:PGUSER:PGPASSWORD:PGDATABASE:PGSSLMODE:PGSSLROOTCERT/p:CLARA_BACKUP_DIR/p'
```

(no `DATABASE_URL` in `WSLENV`) and
`NODE_EXTRA_CA_CERTS=/mnt/c/Users/zhant/Desktop/clara-rebuild/ops/tls/pooler-ca.crt` passed at
process launch. Record the artefact path, the byte count and its sha256; copy off-machine if the
window is delayed.

## W. Deploy order, decided from the migrations' headers and the two diffs

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine is
STOPPED before the migrate and started again only on the NEW image.** Same order as wave 2, but this
time the runtime leg is FORCED rather than chosen. Derived from
`git diff d96a33f31...ba54ad2bd -- packages/runtime apps/web`, not assumed:

- **No file in this wave claims an inversion, and that is a measurement.** `grep -niE 'deploy
  order|consumer-first|consumer order|runtime-first|writer[ -]quiescence|quiesce'` over
  `0273...0293` returns zero hits. `ARCHITECTURE.md` §5.F is what makes silence readable: the
  obligation to invert is written in the migration's own header, so a header that does not carry one
  does not owe one. What still applies to all 21 is the general rule in `packages/db/README.md`:
  before deploying a change to an active writer body, stop new writes and drain in-flight calls,
  apply the migration, then resume.

- **The NEW runtime does NOT tolerate the OLD schema, and that is new in this wave.** Three call
  sites reach doors that exist only at 0275 and 0286, and **none of them is behind a
  `to_regprocedure` feature-detect** (the guard the FA, plan-occurrence, render and sandbox belts do
  use):
  - `packages/runtime/lib/opening-parse.mjs:481` - `select clara.refresh_opening_targets_from_reread($1, $2::jsonb, $3, $4, $5)` (0286, brand new, granted to `clara_runtime`).
  - `packages/runtime/src/workRoutes.ts:1435` - `select clara.probe_trade_invoice_duplicates_for(...)` (0275, brand new).
  - `packages/runtime/src/workRoutes.ts:1517` - `select clara.record_trade_invoice_duplicate_ack(...)` (0275, brand new).

  Against a 0272 database each answers **42883**. So the runtime image can only be released AFTER
  the migrate. In wave 2 the new runtime tolerated the old schema and DB-first was a preference;
  here it is the only lawful sequence.

- **The OLD runtime MISREADS a recut door, and this is wave 3's 0254.** `0279` gives
  `clara.run_depreciation_period` and `clara.run_depreciation_manual` a FOURTH outcome,
  `{status:'parked', reason:...}`, when a period's charge would fold a CLOSING or CLOSED fiscal
  year's months into the open period and nobody has judged their materiality (IAS 8; 0293 refines
  the reasons to `arrears_resolution_required`, `arrears_changed_since_judgement`,
  `arrears_awaiting_reopen`).
  - The NEW belt (`packages/runtime/lib/reconciler-fa.mjs`) counts it on its own axis (`faParked`),
    names the reason in the log and **breaks the per-client chase**.
  - The SERVING belt has no `parked` arm. Its chase reads `if (r?.status === "noop") break;` and
    then falls through to `out.faPosted += 1`. So on a parked run it **counts a park as a POST** and
    **does not break**, and because the due probe still answers `due:true` for that period it
    re-drives the run up to `FA_PERIOD_CAP = 24` times per client per daily FA sweep, banking one
    parked receipt per call. Not corruption - the door writes nothing - but a mis-stated cadence and
    receipt spam, and it is why the machine stop is MANDATORY rather than tidy.
  - **`D-FA-PARKED` (step 3c) decides how urgent this is.** Zero live depreciation authorities or
    zero closing/closed fiscal years on hosted means no client can reach the branch and the risk is
    theoretical for the length of the window. A non-zero reading makes the runtime release urgent
    and makes the machine stop non-negotiable.

- **What the OLD WEB does between the migrate and the promotion, checked rather than assumed.**
  There is a window of a minute or two in which web `686ab53f` talks to a 0293 database. Nothing
  corrupts; three surfaces degrade to a refusal, and all three are surfaces this wave RETIRES:
  - `clara.propose_vendor_identity_binding` / `sign_...` / `decline_...` lose their
    `clara_authenticated` EXECUTE (0273). The serving web still renders Propose and Sign in
    `components/firm-admin/vendor-bindings-panel.tsx` and `vendor-binding-ceremony.tsx`, and calls
    them through `lib/firm-admin/vendor-bindings.ts`. Clicking one now answers **42501 permission
    denied**. The NEW web removes the controls (#921) and deletes their eleven message strings.
  - `clara.propose_adjustment_template` / `sign_adjustment_template` / `run_adjustment_manual` are
    recut to ONE typed refusal, CLR10 `adjustment_template_lane_retired` (0282). The serving web's
    `components/registers/adjustment-template-ceremony.tsx` and `lib/registers/adjustments.ts` call
    all three. The NEW web retires the surface (#927 / #929).
  - `clara.tick_seeding_proposal` / `clara.decline_seeding_proposal` are recut to CLR34
    `seeding_lane_retired` (0288). The serving web's `lib/reports/api.ts` and
    `components/reports/SeedingBatchesPanel.tsx` still render Tick and Decline dialogs. The NEW web
    removes both and makes the panel read-only (#1012), and the NEW runtime removes
    **`POST /api/seeding/prepare`** with it - checked: **no web build, old or new, calls that
    route**, so its removal breaks nothing.
  - Three payload changes the OLD web absorbs: `clara.get_bank_line_matching_context` gains
    `citation_page` (0291, additive); `clara.get_prepayment_schedule` / `list_prepayment_schedules`
    gain the `term_live` / `term_superseded_by` / `term_moved` family (0285, additive); and the plan
    overlap advisory's entries are re-keyed from `template_id` to `plan_id` (0283). Checked rather
    than assumed: the only serving-web renderer of that list is
    `components/prepayments/prepayment-form.tsx:228`, which maps `x.name` and never reads
    `template_id`. Cosmetic for the length of the window.
  - `clara.list_review_queue` is spliced to drop its seeding arm (0288); same signature, ten
    surviving row kinds, so the serving Firm Home simply shows fewer rows.
  - `clara.begin_client_onboarding` gains the two-or-more name-collision wall (0287). The serving
    command palette (`lib/command/do-dispatch.ts`) can now receive CLR10 `name_family_collision`
    where it previously succeeded. That is the intended new behaviour, arriving one promotion early.
  - **Unverified, and worth watching:** whether PostgREST reloads its schema cache promptly after
    0283 drops and recreates `_plan_overlap_warning` and after the 0288/0289/0291 splices. If a
    Plans, Bank or Firm Home surface answers `PGRST202` after the migrate, the cache needs a reload;
    that is a hosted behaviour this draft cannot test.

- **So web goes LAST.** Of the doors this wave creates, nine are granted, and every one of them has
  its browser or runtime consumer in the SAME cut: `correct_accrual_adjustment` (0284),
  `get_client_cash_account_set_members` (0276), `record_fa_arrears_resolution` (0279),
  `set_fa_depreciation_policy` / `retire_fa_depreciation_policy` (0277),
  `probe_trade_invoice_duplicates` / `get_trade_invoice_duplicate_ack` (0275),
  `open_client_onboarding` (0287), `probe_trade_invoice_duplicates_for` /
  `record_trade_invoice_duplicate_ack` (0275, runtime), `refresh_opening_targets_from_reread`
  (0286, runtime). A door that is not there is **42883**, so the consumer must never precede it.

**The quiescence window covers the whole 21-file run**, one `migrate.mjs` invocation. What it is
buying, named, with the LOCK class each takes:

| file | why it rides the window |
|---|---|
| 0274 | `create index ix_counterparties_client_kind_tin_normalized` on `clara.counterparties`, an EXPRESSION index built non-concurrently: **SHARE on the whole relation for the length of the build**, which blocks every write to the counterparty estate |
| 0277 | two `add column` on `clara.fixed_assets` (ACCESS EXCLUSIVE, metadata-only), `add constraint fk_fa_depreciation_policy_congruent` (ACCESS EXCLUSIVE plus a validating scan of the whole register, plus SHARE ROW EXCLUSIVE on the new policy relation), and `create index ix_fixed_assets_depreciation_policy` (SHARE) |
| 0288 | seven `prior_gl` rows rewritten, then `update clara.document_capabilities set registry_version = registry_version + 1` over all 240, each row firing the monotonicity, high-water, high-water-record and uniformity triggers |
| 0290 | `drop constraint` + `add constraint ... check (clara._field_path_conforms(field_path))` on `clara.document_regions`: ACCESS EXCLUSIVE and a full scan **that calls a PLPGSQL function once per row**. This is the one statement whose duration grows with the estate |
| 0291 | three `add column`, one `add constraint ... foreign key` and three `add constraint ... check` on `clara.bank_statement_lines`: **ACCESS EXCLUSIVE seven times and four whole-table scans** |
| 0275, 0279, 0286 | `create table` + indexes + RLS + policies + triggers on three NEW relations |
| the rest | function recuts, catalog splices, comments and grants, which take no table lock above what `create or replace function` needs, but ride the same window for free |

**THE TIMEOUT PICTURE, measured across the 21.** `migrate.mjs` still arms nothing itself
(deliberately, because the F10 advisory wait must be unbounded):

- **`statement_timeout = '5min'` AND `lock_timeout = '5s'`**: 0278, 0280, 0281, 0282, 0283, 0288,
  0290, 0291. A blocked lock here FAILS FAST with `55P03` and rolls that migration back whole.
- **NEITHER**: 0273, 0274, 0275, 0276, 0277, 0279, 0284, 0285, 0286, 0287, 0289, 0292, 0293. A
  blocked `ALTER TABLE` or `CREATE INDEX` in that set **waits indefinitely**. The only two that take
  a heavy lock on an EXISTING populated relation are **0274 and 0277**.
- No file in this wave arms `statement_timeout` alone.

So step 6b's `pg_locks` read is the only guard for 0274 and 0277. If one blocks,
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

**New in this wave:** lane 09's #970 adds `@shadcn/react@^0.3.1` to `apps/web/package.json` and the
lockfile. `pnpm install --frozen-lockfile` succeeding on the merged tree is the check that the two
files agree; if the WSL build fails at install, that is the first thing to look at.

## 6. Writer quiescence, then migrate: all 21 files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is MANDATORY for the
0279 `parked` reason in section W, not merely tidy.

6b. Re-run the census through the probe (`reads-w3.mjs --census --prod`). It must come back clean,
and specifically: no other backend holding a lock on `clara.counterparties`, `clara.fixed_assets`,
`clara.document_capabilities`, `clara.document_extractions`, `clara.document_regions` or
`clara.bank_statement_lines`. The web app talks to PostgREST directly and can still hold a lock while
the runtime is down: this read is what makes the window real rather than nominal. Also: **no holder
of the F10 advisory lock**, or the migrate step hangs silently. (Wave 2 saw 12 idle pooler-held
`clara_runtime_login` sessions holding nothing - idle sessions are fine, held locks are not.)

6c. From the RELEASE_SHA checkout:

```
PROBE=<probe-id> via-probe.sh node packages/db/scripts/migrate.mjs      # cwd = packages/db
```

Expect **`migrate: 21 new migration(s) applied · 288 total`**. Expected wall is about T = 8.2 s (step
0) plus pooler latency; the wave-2 window took 2 min 46 s for 38 files through the ssh hop, so budget
generously and **do not kill it**. If it passes about 10x that without returning, read
`pg_stat_activity` on a second connection and decide from the ledger.

Expect 23 prestate notices and 23 tail notices (two files carry a second, section-scoped pair). The
ones worth reading out loud, because they are about hosted ROWS rather than catalog shape:

- `#1012 prestate` (0288): *"N seeding batch(es) and M proposal(s) exist and must survive this file
  untouched."* On hosted these may be non-zero for the first time.
- `#1012 sectionD prestate` (0288): 7 prior_gl rows with `browser_entrance` and 0228's basis
  sentence, the registry at 240 rows and one version at or above 3.
- `#927 prestate` (0282): *"zero clara.adjustment_templates rows are non-retired"*.
- `drfp prestate` (0290): the stored `field_path` count and that all of them conform. On a populated
  hosted `clara.document_regions` this is the first time that CHECK has ever validated real rows.
- `bslc prestate` (0291): `clara.bank_statement_lines` holds N rows.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state: the
file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b exists so this is discovered BEFORE the window. Do not re-pin and do not
  edit the migration. Report to the owner with the body name and both shas. **If the body is
  `clara.revise_accounting_plan`, read 0283's own prestate first: 0284's pin is bimodal.**
- **A DATA PRESTATE REFUSED.** The candidates, all of them read in 3c so they never first appear
  here: 0282's non-retired templates, 0288's registry census and high-water agreement, 0290's
  non-conforming `field_path` values, 0291's half-applied column set, 0277's already-present columns.
- **Ledger-position branches.** (i) `max(version)` below `0273`: nothing of this wave landed; the
  deployed image `refresh-68b979bf` is a legal boot target, so `machine start`, report, and do NOT
  promote web. (ii) `0273` to `0278` committed and the next did not: `refresh-68b979bf` still boots
  and the depreciation run contract has not changed yet, so start the old image, hold web at
  `686ab53f`, and report. (iii) **`0279` or above committed but not all 21**: the old image may be
  started only after `D-FA-PARKED` has been re-read and shows no client can reach the parked branch;
  otherwise roll the runtime forward to the new image first and hold web. (iv) all 21 committed,
  ledger reads **288 / `0293_fa_arrears_judgement_scope`**: drive forward to steps 7 and 8.
- **A `55P03 lock_not_available`** on 0278, 0280...0283, 0288, 0290 or 0291: that is the file's own
  `lock_timeout='5s'` firing. Find the blocker in `pg_locks`, `pg_cancel_backend` it, and re-run 6c
  from the ledger's current frontier.
- **An indefinite wait** on **0274 or 0277**: those two arm no `lock_timeout` at all and take a heavy
  lock on a populated relation. Do the same thing, from a second connection.

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

**Expected boot lines:**

```
serving git_sha=<full sha> frontier=0293_fa_arrears_judgement_scope(288) bodies=55 pins \
        closeExample=closeExampleV1 chatTurn=chatTurn_v21 claraWork=claraWork_v5 clientOnboarding=clientOnboarding_v5
stranded bodies n=0            <- BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5     <- FIVE bundle banners
CONTROL listening
LEADER acquired
```

`bodies=55` and all four pins are UNCHANGED from the serving image, because this wave changed no
frozen body (gate 0a). `stranded bodies n=0` for the same reason. Signed-in `GET /api/build-info`
should read `git_sha` = the full sha, `frontier` `0293_fa_arrears_judgement_scope(288)`,
`bodies: 55`, the same pins.

**Also worth one look in the first sweep's log:** the FA belt's line now reads
`[reconcile] fa runs examined=… posted=… noop=… parked=… failed=…`. A non-zero `parked` is the new
outcome working, not a fault.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all five prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403; runtime `/ready` 200.

**Signed in, through the owner's browser, read-only, nothing clicked that writes.** One surface per
lane, chosen for what this wave actually changed. (Wave 2's signed-in walk was NOT done in its
window and is still owed; if it is done here, do wave 2's ten surfaces first.)

| lane | tickets | surface | what to see |
|---|---|---|---|
| 01 | #890 #921 | `/settings/firm` vendor bindings panel | history still lists and opens; **no Propose and no Sign control anywhere** |
| 02 | #982 #1007 | the trade-invoice recording form | a counterparty resolved by TIN; a probable-duplicate WARNING that does not refuse, and an acknowledgement that sticks |
| 03 | #958 #1001 #1002 | client home, the cash arm | cash reads as book cash; the second-pass membership editor lists the published set's members |
| 04 | #932 #882 #975 #978 | `/clients/<id>/registers?tab=fixedAssets` | a default depreciation policy per enrolled account, its version stamped on a birthed row; an arrears question stating ONE year's own amount with two reachable remedies |
| 05 | #908 #909 #927 #928 #929 | `/clients/<id>/plans` and `/clients/<id>/accounting/adjustments` | the overlap advisory names a sibling PLAN; the adjustment-template ceremony is gone, the register reads as history |
| 06 | #936 #919 #986 | `/clients/<id>/accruals/<id>/correct` and the prepayments list | a dedicated correction that supersedes rather than contradicts; a schedule that says whether its term row is still live |
| 07 | #899 #1012 #889 | the command palette's add-client, and `/clients/<id>/reports#internal-processing` | the name-collision wall fires at the DOOR; the seeding panel is READ-ONLY with no Tick and no Decline |
| 08 | #857 #990 #1019 #1020 | the bank matching surface | a line that names the page it was read from, and the two lanes that honestly have none saying so in words |
| 09 | #970 #989 #864 #997 #1017 | the Clara rail, `/documents` | the message scroller, the attachment control, the interview run card |
| 10 | #1015 #1016 #1018 #1023 #1028 | `/settings/members` and the firm dashboard | the invite mail path, the navigation tree, the financial pack |
| 11 | #1024 #897 #1021 #1022 | the onboarding begin card and `/work/<id>` | the agentic finish walk's surfaces |

The per-lane reports in `reports/wave3-lane*-*.md` are the authority on what each ticket changed;
this table is derived from the web diff and is a starting roster, not a specification.

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

Run immediately after step 7:

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted v-previous index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND old-image probe,
never from the live machine. **The wave-2 window's sftp extraction stalled at 32 KB twice; stream the
bundle over `ssh console` and verify it by `sha256sum` against the machine's own.** Two separate
gates, and say which is being demonstrated: (a) `FRONTIER_BODY_RULES`; (b) the stranded-body census,
trivially clean here because this wave carries the SAME 55 bodies as the previous image. Exit 0 =
allowed, 1 = REFUSED with the body names, 2 = could not answer.

**#1035 now has a SECOND instance, and this wave is it.** The preflight will say ALLOWED for
`refresh-68b979bf`, because its rule table knows nothing about a door's return contract. That was
already wrong for 0254 (#1035, open, `bug` / `ready-for-agent`) and it is wrong again for 0279: the
previous image counts a `parked` depreciation run as a POST and re-drives it. So:

- **The runtime rollback is LAWFUL but LOSSY at 0279 and above.** `refresh-68b979bf` boots against a
  0293 database and carries the same bodies and pins, so nothing strands; but it misreports and
  re-drives parked runs. If `D-FA-PARKED` read zero live authorities or zero closing/closed years,
  that cost is zero in practice - record which.
- **Nothing in this wave drafts a below-frontier database rollback**, and the only route is the
  step-3f dump, which returns no Storage bytes, no managed Auth config and no engine state. If a
  below-frontier rollback is ever wanted it must be drafted BEFORE a window, never during an
  incident.
- Add this wave's finding to #1035 rather than opening a second ticket.

## 10. The reads this wave owes on hosted, after the release

Run `ceremony-w3/reads-w3.mjs --post --prod --baseline <the UPGRADED rig fingerprint>` through the
live machine's DSN. It issues the same SQL step 3 issued, so pre and post sit side by side. It
asserts:

1. the ledger reads **267 + 21 = 288** at `0293_fa_arrears_judgement_scope`;
2. every one of the 21 new migrations has a ledger row whose checksum equals its file;
3. the drift gate over all 288 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified - expect **only the role-level `env` lines**, the same set as
   before the window.

**The baseline for (4) must come from a rig database upgraded with the MERGED tree.**

**The reference row counts that MOVE across the 21, measured on the rig** (seeded, so hosted's
absolute numbers will differ; the DELTAS are what to check):

| relation | before | after |
|---|---|---|
| `clara.fa_account_depreciation_policies` | absent | 0 (a new, empty relation) |
| `clara.fa_arrears_resolutions` | absent | 0 |
| `clara.opening_target_refreshes` | absent | 0 |
| `clara.trade_invoice_duplicate_acks` | absent | 0 |
| `clara.document_capabilities` | 240 rows at version 3 | **240 rows at version 4** |
| `clara.document_capability_version_high_water` | 240 marks at 3 | 240 marks at 4 |

**This wave inserts NO catalogue row anywhere.** Every other reference relation is unchanged in
count. That is unusual against wave 2 (which moved five catalogues) and is worth stating: the only
published rows that move are the seven `prior_gl` capability rows' `basis` and `limits`, plus the
whole registry's version.

Then the questions this wave's own headers ask of hosted, which only a release-time read can answer:

1. **0288 (#1012): the registry after the retirement.** 240 rows, one distinct `registry_version`,
   value **4**; the seven `prior_gl` rows carrying `limits.seeding_lane = 'retired'` with its reason
   and the rewritten basis sentence; **zero** rows anywhere still carrying `browser_entrance`; every
   `prior_gl` row still `business_operation = 'stored_only'`; the high-water ledger at 240 marks all
   at version 4. And the history: `clara.seeding_batches` and `clara.seeding_proposals` at exactly
   the counts the prestate recorded, none deleted.
2. **0290 (#857): the field_path wall on real rows.** `clara.document_regions`'s row count before and
   after, the constraint reading exactly `CHECK (clara._field_path_conforms(field_path))`, and how
   long the ADD CONSTRAINT took - this is the one statement in the wave whose cost grows with the
   estate, because the CHECK is a PLPGSQL call per row.
3. **0291 (#990): the citation columns.** Three nullable columns and four constraints live on
   `clara.bank_statement_lines`, every pre-existing constraint, trigger and index intact, and every
   existing row NULL in all three (never back-filled). Then the first line written AFTER the release
   through the OCR lane carrying a real `citation_page`.
4. **0282 / 0283 (#927 / #929): the 0045 lane is closed.** All three write doors answer CLR10
   `adjustment_template_lane_retired` on a real call; `clara.adjustment_templates` still holds
   exactly the rows it held (read-only history); `clara._plan_overlap_warning` exists at ONE
   signature, the three-argument form, with no `adjustment_template_overlap` in its body.
5. **0277 / 0292 (#932): the register's new provenance.** `clara.fixed_assets` row count unchanged,
   both new columns NULL on every existing row, `fk_fa_depreciation_policy_congruent` live and
   validated, and `clara.fa_account_depreciation_policies` empty until a person signs one.
6. **0279 / 0293 (#975): the parked branch.** Whether any client has a closing or closed fiscal year
   with unmet depreciation, and if so whether the first run after the release parked rather than
   posted. **This is the branch a seeded rig cannot reach**, and, unlike wave 2's 0268, it is not
   only a tail assertion: it changes what the belt does every day.
7. **0274 (#982): the TIN tier.** Rows entering `ix_counterparties_client_kind_tin_normalized`, and
   whether any `(client, kind, normalised tin)` key is held by more than one live counterparty -
   the identifier conflicts the new arm will hand to a person.
8. **0287 (#899): the birth wall.** Whether any firm already holds two live clients in one name
   family, which is what the wall will refuse on the NEXT create through the palette.

Also re-read the ledger, the stranded-body census and the quiescence census once more and record
them.

## 11. Manifest, then the tickets

11a. `node scripts/check-frozen-workflows.mjs --lock-deployed` has **nothing to lock in this wave**:
no frozen file was added or changed, so the unlocked set should be empty and the plain freeze-lint
should still read `312 frozen file(s) ... 55 "use workflow" module(s) ... 3 retired`. Confirm the
unlocked set is empty BEFORE running it, since the command locks every unlocked entry.

11b. **Ticket closures with hosted evidence.** Forty tickets across eleven lanes:

| lane | tickets | migrations |
|---|---|---|
| 01 vendor bindings | #890 #921 | 0273 |
| 02 trade invoices | #982 #1007 | 0274 0275 |
| 03 cash account sets | #958 #1001 #1002 | 0276 |
| 04 fixed assets | #932 #882 #975 #978 | 0277 0278 0279 0292 0293 |
| 05 plans and the 0045 retirement | #908 #909 #927 #928 #929 | 0280 0281 0282 0283 |
| 06 accruals, prepayments, opening | #936 #919 #986 | 0284 0285 0286 |
| 07 client birth, seeding, merge | #899 #1012 #889 | 0287 0288 0289 |
| 08 document regions and bank lines | #857 #990 #1019 #1020 | 0290 0291 |
| 09 Clara rail and the scan censuses | #970 #989 #864 #997 #1017 | (none) |
| 10 members, navigation, dashboard | #1015 #1016 #1018 #1023 #1028 | (none) |
| 11 onboarding and Work surfaces | #1024 #897 #1021 #1022 | (none) |

Read each ticket's real title with `gh issue view <n>` before commenting. Comment shape, unchanged
from the five prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`, release
session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail notice
text, and, where the AC named a hosted behaviour, the specific reading step 7, 8 or 10 produced.
Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane comment above,
hosted evidence here."*

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback command
and the runtime/database asymmetry named in step 9. **PROGRESS.md is currently stale** - it still
records hosted at 229 / 0234 and `refresh-ede1df83` - so bring it to the wave-2 state first, or
straight to wave 3's, and say which.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the registry
  counts, the `document_regions` and `bank_statement_lines` row counts, the fiscal-year census and
  the machine and web ids are taken from `RELEASE-W2-RUNBOOK.md` § RESULTS, the migration files and
  the rig; none is read from hosted.
- **RELEASE_SHA does not exist yet.** The wave-3 PR is unmerged and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `ba54ad2bd`.
- **The rehearsal was run on wave 2's rig, not wave 3's.** `rigw3` (port 55770) with
  `clara_w3_hosted` and `clara_w3_upg` did not exist when this was written, so the replay used two
  throwaway clones of `clara_w2_upg2` on `rigw2` (port 55760), created with `createdb -T` and dropped
  afterwards. That database is at 267 / 0272 and seeded, which is the right SHAPE, but it is the
  integrator's rig rather than the gate worker's. Re-export both fingerprints from `rigw3` when it
  exists.
- **The rig is empty where hosted is not.** On the clone, `document_regions`, `bank_statement_lines`,
  `fixed_assets`, `counterparties`, `trade_invoices`, `accounting_plans` and `adjustment_templates`
  all hold ZERO rows. So every "would this pass" read returned a trivially clean answer, and the
  negative controls that needed real rows were run against `clara.clients` (157 rows) instead. **The
  populated-row behaviour of 0290's CHECK, 0291's four scans and 0274's index build is unproven at
  any scale.**
- **0290's ADD CONSTRAINT duration is unknown**, because hosted's `clara.document_regions` size is
  unknown. The CHECK is a PLPGSQL call per row. The preflight reads the number; this is the wave's
  equivalent of wave 2's 0243 index build, and it is worse per row.
- **The PostgREST schema-cache behaviour** after 0283's drop-and-recreate and the 0288/0289/0291
  splices is unverified from here.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.
- **0279's parked branch has never executed anywhere.** The rig has no closing or closed fiscal year
  with unmet depreciation. If hosted has one, the release window is the first time that code path
  runs, and the SERVING image misreads it (section W).
- **The plan-lock ordering of 0283** (the client advisory rung above the plan row lock) was read out
  of the file's own tail assertions, not exercised against a concurrent writer. Whether the
  runtime's plan-occurrence belt can deadlock against the recut doors is unverified from here.
- **The runtime image's own gates** (bundle gate, freeze-lint) are `ci`'s output, not the Docker
  build's; on `int2` they are green locally (`312 / 55 / 3`), but not on RELEASE_SHA.
- **The signed-in walk of wave 2's ten surfaces was never done** (its own as-run says so). If it is
  still owed at this window, it is owed against a 0293 database, not a 0272 one.

---

## § RESULTS (as run, 2026-09-23, UTC)

**Authority.** The owner's riders plan of 2026-09-20 (each wave ends with its hosted release and the
tickets close on hosted evidence), the release-ownership ruling of 2026-09-17, and the owner's
resumption on 2026-09-23. Beta ruling unchanged: hosted data is test data.

**Gates 0a.** `main` = RELEASE_SHA = `46cf7c852790e7e935be1e7454aab3726bca8a7e` (PR #1039, merge of
`integration/riders-w3` at `2aa74efde`; the merge tree is identical to the PR head tree). CI on the
PR: green on its first run. CI on the merge commit: run 35889978189 SUCCESS (lint, build,
db-estate, db-live-gates, render-drill, storage-policy-battery, db-split-partition-total). Web
rollback lever confirmed: `686ab53f-4079-4305-8d0b-54efac86adc0` at 100% before the window. No
frozen body changed (`check-frozen-workflows`: 312 / 55 / 3, `bodies=55`).

**Step 1.** `fly auth whoami` = `tools@belcort.com`; one machine `48ee715b763048`, started, 2/2.

**Step 2.** Probe `6835051b651238` (`probe-w3`) from `refresh-68b979bf`, World off.

**Step 3, pre-window reads (16:38:29Z, `reads-w3.mjs --prod --baseline fp-w3-hosted.json`).**
Ledger 267 / `0272_document_capability_wall_completion`, drift gate 267/267, pending set exactly
the 21 files above the frontier, 0 PARSE GAP. Fingerprint vs the rig's hosted-frontier baseline:
10817 keys compared, 10803 equal, **14 env lines** (the same Supabase-only role attributes and
memberships the wave-2 window met, now printed as environment facts, never a STOP), 0 STOP. Data
preconditions all `ok`: 0 non-retired `adjustment_templates` rows (so 0282's guard cannot stop the
chain), 1906 `document_regions` rows all conforming to 0290's grammar, the registry at 240 rows /
one version 3 with exactly the 7 `prior_gl` browser entrances 0288 retires and no `seeding_lane`
key yet, 0 fixed assets (0279's parked branch does not arise), 2 counterparties entering 0274's
normalised-TIN index with no conflict. Quiescence: no non-terminal task or Work, no pending
interruption, workflow_runs non-terminal 0, no F10 holder, no lock on the relations this wave
locks; the one `statement_facts running` document_processing_tasks row is the orphan known since
2026-09-19. **Verdict CLEAN.**

**Step 3f, backup (16:38:45Z to 16:39:51Z).** Full dump
`packages/db/backups/clara-clara-graphile-worker-workflow-workflow-drizzle-2026-09-23T16-38-51-846Z.sql`
= 219,574,948 bytes, plus globals `clara-globals-2026-09-23T16-39-49-855Z.sql` (12,177 bytes).

**Steps 4 and 5, before the window.** Runtime image
`registry.fly.io/clara-runtime:refresh-46cf7c85` = `sha256:a6beb66f3ae657764c83cbf1243c1229483f563ddf75a3f1fc925791ec5c2a1b`
(265 MB), built from a detached checkout at RELEASE_SHA. Web Worker version
`b659a3d4-a253-4f49-8a7e-c89306f6ab82`, tag `refresh-46cf7c85`, uploaded 16:38:48Z, not promoted.

**Step 6, the window.** 6a: `machine stop 48ee715b763048` 17:04:30Z, `stopped` 17:04:39Z. 6b:
census through the probe: CLEAN, 0 runtime sessions, no lock on `bank_statement_lines`,
`counterparties`, `document_capabilities`, `document_regions`, `fixed_assets` or the rest of the
roster. 6c: `migrate.mjs` through the probe DSN, 17:04:53Z to 17:06:21Z (1 min 28 s):
**`migrate: 21 new migration(s) applied · 288 total`**, every prestate clean, every tail OK, no CLR,
no lock wait (the "does not exist, skipping" notices are 0275's redo-safe drop-if-exists forms).
6d: ledger **288 / `0293_fa_arrears_judgement_scope`**: branch (iv), drive forward.

**Post reads through the probe (17:06:43Z, `reads-w3.mjs --post --prod --baseline fp-w3-upg.json`).**
Ledger 267 + 21 = 288 at 0293; every one of the 21 new rows at its file checksum; drift gate
288/288; fingerprint vs the UPGRADED rig baseline: 10984 keys compared, 10970 equal, the same 14
env lines and nothing else. **Verdict CLEAN.**

**Step 7.** Probe destroyed. `fly deploy --image …@sha256:a6beb66f…` onto the stopped machine
17:06:49Z (reached `stopped`); `machine start` 17:07:35Z; `/ready` 200 at 17:07:56Z.
**Outage: 17:04:30Z to 17:07:56Z, 3 min 26 s.** Boot lines: `serving
git_sha=46cf7c852790e7e935be1e7454aab3726bca8a7e frontier=0293_fa_arrears_judgement_scope(288)
bodies=55 pins closeExample=closeExampleV1 chatTurn=chatTurn_v21 claraWork=claraWork_v5 …`;
`stranded bodies n=0` BEFORE `durable world started pid=643`; five `clara-work/v1..v5` bundle
banners; `LEADER acquired`; `CONTROL listening` (17:07:45Z).

**Step 8.** `wrangler versions deploy b659a3d4…@100%` 17:08:15Z to 17:08:22Z (previous
`686ab53f…`, tag `refresh-68b979bf`). Signed-out smoke at 17:08:36Z: `/login`, `/favicon.ico`,
`/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to `/login?next=…`;
`/settings/registrations`, `/admin/registrations` 307 to `/operator`; cross-origin POST
`/auth/confirm/resend` 403; runtime `/ready` 200. Signed-in walk: not done in this window (no
operator browser session); the per-lane surfaces table in step 8 is the owner's next signed-in
check.

**Step 9, rollback preflight demonstration (second probe `683d611be96458` on `refresh-68b979bf`,
its own bundle 10,924,519 bytes, sha256 `5695ac4e…65e9` verified against the machine's own
`sha256sum`, streamed over `ssh console`).** `rollback-preflight: ALLOWED`: gate (a)
`FRONTIER_BODY_RULES` at frontier 0293 checks only `0195`; gate (b) 0 non-terminal runs, 0 unbound
live tasks, the target carries the same 55 bodies. A positive control only: the preflight does not
know that 0279 gives the depreciation run a fourth outcome the previous image would count as a
post (#1035, second instance), so `refresh-68b979bf` is NOT a lawful target while the ledger is at
0279 or above.

**Step 10, the reads this wave owes (same probe, 17:1xZ).** Ledger 288 / 0293. Registry: 240
rows, one distinct version, now **4** (0288's bump), 28 rows at `accepted_limitation`, high-water
240 rows. Audit column: 4448 rows, 4330 still NULL (never back-filled), 118 written since the
wave-2 release carry a real `actor_role`; table 944 kB. Knowledge 14 keys; firm setup 15 rows, 15
with a note, 0 retired; 0 firms with more than one firm-scope plan; 0 work-bearing interruptions;
0 fixed assets; workflow_runs non-terminal 0; agent_tasks non-terminal 0; reference deltas
unchanged since wave 2 (knowledge_keys 14, plan_item_map 11, event_types 139, trigger_taxonomy
152, firm_setup_keys 15).

**Step 11.** No manifest to lock. Tickets: 40 closed with the hosted evidence above (#927 had been
closed by the merge itself from a commit message and received its comment afterwards; #990 closed
PARTIAL with its producer half in #1037). Follow-ups filed while closing: #1036 (#927's dormant
wake-door residual), #1037, #1038 (#899's residual). #1023's AC2 (the three drills' CI legs) is
answered by a `workflow_dispatch` of `ci.yml` on `main`, run 35893727271, recorded in PROGRESS
once it finishes.

**Deviations from the draft.** None in the ceremony. The preflight's role-level fingerprint keys
printed as env lines as designed; nothing was overruled this time.
