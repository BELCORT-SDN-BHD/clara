# Hosted release ceremony, riders wave 2: migrations 0235...0272 + runtime image + web

**DRAFT, written before the window by an agent with NO hosted access.** Every hosted number below
is an EXPECTATION, never a reading. The as-run section at the end is where the readings go; leave
the blanks blank until they are measured. Modelled step for step on
`docs/plan/active/refresh-wave-2026-09-18/RELEASE-RUNBOOK-0225-0233.md` and on the smaller
`docs/plan/active/rider-1008-legal-enforcement-mode/RELEASE-AS-RUN.md`.

RELEASE_SHA = **`________`** (the merge commit of the wave-2 PR on `main`; the `git rev-parse`
full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label `refresh-<RELEASE_SHA short>`.

**The arithmetic, stated before the window rather than during it.** The integration worktree
`C:\Users\zhant\Desktop\clara-wt\int2` (branch `integration/riders-w2`, head `d3aaecdb8`, lane 09
merged) carries **267** files under `packages/db/migrations/`, highest version
`0272_document_capability_wall_completion`. Hosted is at **229 / `0234_legal_enforcement_mode`**
(`RELEASE-W1-AS-RUN.md`; re-read live at step 3). So the migrate step should report

```
migrate: 38 new migration(s) applied · 267 total
```

267 is the FILE count (`packages/db/scripts/migrate.mjs:605` prints `migrations.length`); `0272` is
only the highest version NUMBER. The five pre-existing gaps at 0032 and 0073...0076 are why the two
differ. Re-derive this against whatever `main` and the hosted ledger actually are at window time:
the preflight script prints the sum itself.

**Rollback points BEFORE** (from `RELEASE-W1-AS-RUN.md`; re-read live at step 3):
DB **229 / `0234_legal_enforcement_mode`**. Runtime image **`refresh-ddb5a125`** =
`registry.fly.io/clara-runtime@sha256:171c9476077655de589444cc4847e02476c7a7ff9227e52b7e74a367b8835a54`
(265 MB, measured boot `bodies=55`, pins `chatTurn_v21` / `claraWork_v5` / `clientOnboarding_v5`),
single Fly machine **`48ee715b763048`** (never touched directly; exactly two calls all window,
`stop` and `start`). Web **`922f9428-215c-4536-9602-5e0dd007efbd`** (tag `refresh-ddb5a125`, 100%
since 2026-09-20 13:39:49Z; the one before it is `42f257ac-193b-4149-a24b-04582597797f`).

**Secrets rule (unchanged from all four prior runbooks).** The fly token and the DSN are
substituted INLINE inside one pipeline only: never assigned to a shell variable, never echoed,
never in argv. Every `flyctl` below is shorthand for
`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>`;
every `<probe dsn pipe>` is
`flyctl ssh console -a clara-runtime --machine <probe-id> -q -C "sh -c 'printf %s \"\$WORKFLOW_POSTGRES_URL\"'" </dev/null 2>/dev/null | tr -d '\r\n' | node scripts/ops/dsn-pipe.mjs -- <cmd>`.
From Git Bash a `wsl` argument that is a `/mnt/c` path needs `MSYS_NO_PATHCONV=1`, and
`wsl -- bash -c '...$VAR...'` expands `$VAR` in the OUTER shell, so single-quote it. `fly ssh
console` has exited 1 with "The handle is invalid." after streaming on this Windows host: verify
any streamed artefact by sha256, never by exit code alone.

---

## 0. Rehearsal: the 0234 -> 0272 UPGRADE replay, and what has actually been run

The integration gate already ran two things on the disposable cluster `17/rigw2`, port 55760, trust
auth, user `postgres`, host `127.0.0.1` (record:
`reports/wave2-integration-gates-A.md`):

- the **from-scratch chain** `0001 -> 0272` on a virgin database (`263 new migration(s) applied ·
  263 total`, 120 s), and
- the **upgrade path hosted will actually take**: `clara_w2_hosted` migrated with a 229-file
  directory and seeded, cloned to `clara_w2_upg`, then migrated with the full directory:
  **`34 new migration(s) applied · 263 total`, 6 s**, every prestate and every tail OK.

That first record was 34 files, taken before lane 09 (`0265`...`0268`) merged. **The 38-file
replay now exists as well**, on the same cluster, and this draft read it rather than assuming it:
database **`clara_w2_upg2`** is at **267 / `0272_document_capability_wall_completion`**, seeded
(2 firms, 3 clients, 6 users), and its ledger shows 229 rows stamped at one time and **38 rows
stamped seven seconds apart afterwards** (`min(applied_at)` 22:27:20+08, `max` 22:27:27+08), which
is the signature of an upgrade replay onto a populated database rather than a from-scratch chain.
So **T is about 7 s locally**; budget for the ssh hop on top.

Two things still follow, and both are actions rather than caveats:

1. **Re-check that `clara_w2_upg2` was built from the tree that is actually released.** It was
   built from `clara-wt/int2` at the head of the moment; if the integration branch moves again
   before the window, clone `clara_w2_hosted` once more
   (`createdb -T clara_w2_hosted clara_w2_upgN`, source must have zero open connections) and run
   `migrate.mjs` against the RELEASE_SHA directory. Expect **`38 new migration(s) applied · 267
   total`**, every prestate `clean`/`OK`, every tail `OK`. Do NOT run a second from-scratch chain
   on that cluster without the `#867` role-census recipe in `packages/db/README.md`; an upgrade
   replay needs no such recipe because it creates no role (checked: zero `create role` statements
   across all 38).
2. **Export the post-release fingerprint baseline from that database**, never from the older
   `clara_w2_upg` (step 3 and step 10 explain why).

State a rehearsal on a seeded-only cluster proves DDL and guard logic, **not** the row-shaped
hazards. Those are answered only by step 3's reads against hosted. The row-shaped hazards this wave
actually has are enumerated in step 3c.

## 0a. Gates before any production step

- `main` = RELEASE_SHA, `ci` SUCCESS on that sha, the build tree equal to RELEASE_SHA, `git status
  --porcelain` empty apart from the untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time, never a literal written before.
  (Note for the integrator: `clara-wt/int2` currently carries one untracked file, `migbodies.json`,
  which is not mine and must not ride the PR.)
- **Owner says go**, in-session, for this specific window.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F):
  hosted users and data are test data. Confirm it is still true before treating any parked run as
  disposable.
- **DB RESTORE POINT**: step 3f. Take it before the first hosted write; re-take it if the window
  opens more than about 2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery").
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` to confirm the active version is `922f9428-215c-4536-9602-5e0dd007efbd` at 100%,
  then `pnpm --dir apps/web exec wrangler versions deploy 922f9428-215c-4536-9602-5e0dd007efbd@100% --yes`.
- **No frozen body changed in this wave, and that is a measurement.** `git diff --stat
  ddb5a1258..HEAD -- packages/runtime/workflows` in `int2` is **empty**, and `node
  scripts/check-frozen-workflows.mjs` reports `OK - 312 frozen file(s) ... 55 "use workflow"
  module(s) ... 3 retired entr(ies)`, identical to the serving image's own numbers. So the serving
  pins stay `chatTurn_v21` / `claraWork_v5` / `clientOnboarding_v5`, `bodies=55` stays 55
  (counted off `packages/runtime/workflows/registry.ts`), step 11a's `--lock-deployed` has nothing
  to lock, and the previous image cannot strand a body of this cut.

## 1. fly auth, inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com`; re-run `flyctl auth whoami` at window start
rather than trusting memory. Expect exactly one machine, `48ee715b763048`, started, checks 2/2.

## 2. Probe machine, on the SERVING image, world off

```
... flyctl machine run registry.fly.io/clara-runtime:refresh-ddb5a125 --app clara-runtime \
      --name probe-w2 --region sin --vm-memory 512 \
      --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   -> <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6. Keep it alive through the end of step 6; destroy it at
the end of step 6, BEFORE step 7's deploy.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony-w2/reads-w2.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs`. It opens `begin transaction read only` and issues nothing but SELECTs,
each under its own `SAVEPOINT`, so a soft failure (a relation a rig does not carry) never poisons
the rest. It prints facts only: never the DSN, never an e-mail address, never any personal data.
Exit code is non-zero when any check says STOP.

**Nothing in the script is transcribed from a migration.** The wave list, every expected row count,
every sha pin and every CHECK/INDEX predicate is PARSED out of `CLARA_MIGRATIONS_DIR` at run time.
A literal it cannot parse is a **PARSE GAP** and counts as a STOP, because an unchecked
precondition is unchecked. Prove the parse offline before the window:

```
CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
  node docs/plan/active/riders-2026-09-20/ceremony-w2/reads-w2.mjs \
       --plan --frontier-before 0234_legal_enforcement_mode
```

Expect 38 pending files, 11 generated CHECK reads, 2 generated index reads, 0 SET NOT NULL, 0
VALIDATE, 23 hand-written data preconditions and **zero GAP lines**.

**Dry-run evidence (rig only, 2026-09-20, cluster `17/rigw2` port 55760).** The script was
exercised end to end before this runbook was written, and every check family was proved to STOP:

| run | target | result |
|---|---|---|
| `--plan` | no database | 38 pending, 11 + 2 generated reads, 23 hand checks, 0 GAP, exit 0 |
| pre-window + `--baseline` | `clara_w2_hosted` (229 / 0234) | 38 `ok`, 0 STOP, 0 GAP, verdict CLEAN, exit 0 |
| `--export-fingerprint` | `clara_w2_hosted` | 10758 structural keys, 23 reference counts |
| `--export-fingerprint` | `clara_w2_upg2` (267 / 0272) | 10808 structural keys, 23 reference counts |
| `--post --baseline` | `clara_w2_upg2` | `229 + 38 = 267 at 0272`, 38/38 ledger rows at their file checksums, drift gate 267/267, 10808 keys compared and equal, verdict CLEAN, exit 0 |
| fingerprint stress (pre vs the UPGRADED baseline) | `clara_w2_hosted` vs `fp-upg2` | 10816 keys, 110 differences: **98 PINNED, 12 TOLERATED, 0 unexplained DRIFT**, i.e. every single difference the 38 migrations make is attributable to a named file |
| NC `--prod` on a rig | `clara_w2_hosted` | STOP `--prod: hosted estate` |
| NC an applied file deleted from the directory | `clara_w2_hosted` | `DRIFT 0234 ... applied but ABSENT`, 3 STOPs |
| NC one applied file's bytes changed | `clara_w2_hosted` | `DRIFT 0230 ... checksum differs`, drift gate STOP |
| NC a CHECK predicate narrowed in a file copy | `clara_w2_hosted` | STOP, `41 existing row(s) would fail` |
| NC the unique index re-keyed in a file copy | `clara_w2_hosted` | STOP, `1 key(s) already hold more than one row` |
| NC a parsed literal changed (240 to 241) | `clara_w2_hosted` | STOP `D-REGISTRY ... rows=240` |
| NC an anchor sentence removed | `clara_w2_hosted` | `GAP literal client_fact_keys count`, 1 PARSE GAP, exit 1 |
| NC a baseline value corrupted on an UNNAMED object | `clara_w2_hosted` | `STOP DRIFT fn:clara._abandon_close_core(...)` with both sides |
| NC a baseline value corrupted on a PINNED object | `clara_w2_hosted` | `STOP DRIFT (PINNED by 0255_onboarding_plan_firm_uniqueness) fn:clara.claim_paid_firm(uuid,text)`, and the target sha it printed is exactly the literal 0255 pins |
| NC `--post` against a directory missing four files | `clara_w2_upg2` | ledger STOP `229 + 34 = 263` plus four `applied but absent from the directory` DRIFTs |

No database was created, dropped or altered for any of this: the negative controls act on COPIES of
the migrations directory and on COPIES of the exported fingerprint, never on a database.

Then, through the probe:

```
<probe dsn pipe> node docs/plan/active/riders-2026-09-20/ceremony-w2/reads-w2.mjs \
      --prod --baseline <the rig hosted-frontier fingerprint>
```

**3a. Identity and ledger.** `--prod` STOPs unless the server is the hosted pooler estate
(`db=postgres`, port 5432, not loopback). Ledger expect **229 / `0234_legal_enforcement_mode`**;
drift gate over all 229 applied rows (`migrate.mjs` aborts the whole run on one checksum mismatch,
so a drift here is a STOP before the window rather than a surprise inside it); the pending set
listed and asserted to be exactly the files above the frontier; and the printed arithmetic
`229 + 38 = 267 / 0272_document_capability_wall_completion`. The run writes
`ceremony-w2/reads-w2.state.json` so `--post` can re-derive that sum.

**3b. THE ESTATE FINGERPRINT.** This is what makes the rig rehearsal transferable. The script
compares hosted against a baseline produced by the SAME script with `--export-fingerprint` from the
rig's hosted-frontier database `clara_w2_hosted`:

- every function in schema `clara`: identity signature, `sha256(prosrc)`, owner, SECURITY DEFINER
  flag, `proconfig`, ACL;
- every relation: columns (name, type, nullability, default), constraints (`pg_get_constraintdef`,
  with `convalidated`), indexes (`pg_get_indexdef`), RLS enabled and forced, policies, triggers
  (with `tgenabled`), view definitions, owner and ACL;
- roles matching `clara%` with their attributes and their memberships;
- the row counts of the reference tables the migrations assert on, PARSED from the pending files
  (`count(*) ... from clara.X` in an executed region) plus a floor list. Row counts are printed as
  FACTS side by side and are never compared: the rig is seeded and hosted is not.

A difference prints as **DRIFT** with both sides. A difference on an object a pending file merely
names and rewrites prints as **TOLERATED**, with the file and the reason. A difference on an object
a pending PRESTATE **pins** (the identifier occurs within 500 characters of a 64-hex literal or of a
`pg_get_*def` comparison inside the file's prestate region) prints as **STOP DRIFT (PINNED by
&lt;file&gt;)**, because that pin is what will refuse inside the window.

Expect on hosted: **0 DRIFT, 0 PINNED DRIFT**. Anything else is a STOP and goes to the owner with
the key and both sides.

**3c. THE DATA PRECONDITIONS a rehearsal on seeded data cannot prove about hosted rows.** Every
statement in the 38 whose success depends on existing rows, the read that covers it, and the ones
that need no read. Generated reads are derived from the file text; hand-written ones live inside a
DO block and have no statement shape to parse, so only their EXPECTED VALUE is parsed, out of the
file's own refusal message.

| id | migration | the statement it guards | the read |
|---|---|---|---|
| gen | 0239 | `add constraint accounting_work_purpose_check` (widened to four purposes) | `count(*) from clara.accounting_work where not (<the file's own CHECK expr>)` = 0 |
| gen | 0239 | `add constraint operation_receipts_purpose_check` | same on `clara.operation_receipts` |
| gen | 0239 | `add constraint ck_accounting_work_adjustment_basis` (new two-purpose form) | same |
| gen | 0239 | `add constraint ck_operation_receipts_outcome_shape` (the `seed_id` arm) | same |
| gen | 0239 | `add constraint ck_operation_receipts_task_by_purpose` after `task_id drop not null` | same |
| gen | 0242 | `add constraint ck_knowledge_keys_key_grammar` | `count(*) from clara.knowledge_keys where not (knowledge_key ~ <the file's own regex>)` = 0 |
| gen | 0242 | `add constraint ck_client_fact_keys_key_grammar` | same on `clara.client_fact_keys` |
| gen | 0243 | `add constraint ck_audit_log_actor_role` | the CHECK names a column 0243 ADDS in the same run; the script proves the add by parsing it and reports `ok` because every existing row is NULL and the CHECK admits NULL |
| gen | 0246 | `add constraint document_capabilities_business_operation_check` (five values) | `count(*) from clara.document_capabilities where not (<expr>)` = 0 |
| gen | 0258 | `add constraint ck_firm_setup_keys_user_note` | same shape as 0243: the column is added by the same file |
| gen | 0259 | `add constraint onboarding_plan_items_item_kind_check` (widened to admit `education`) | `count(*) from clara.onboarding_plan_items where not (<expr>)` = 0 |
| gen | 0255 | `create unique index uq_onboarding_plans_one_firm on clara.onboarding_plans (firm_id) where scope_kind = 'firm'` | `count(*) from (select 1 from clara.onboarding_plans where scope_kind='firm' group by firm_id having count(*)>1) d` = 0. **A firm with two firm-scope plans in ANY state makes this fail**, and 0255's own §0.7 refuses first with the same query |
| gen | 0243 | `create index ix_audit_log_knowledge_revision on clara.audit_log (...) where args->>'revision_id' is not null` | not a failure mode, a BUILD COST: the row count entering the index is printed |
| D-KK-COUNT | 0241/0242 | prestates assert `count(*) from clara.knowledge_keys` = 14 | today's count plus whether `financial_year_end_day` is already there; the sum after 0240's insert must be 14 |
| D-CFK-COUNT | 0242 | prestate asserts `count(*) from clara.client_fact_keys` = 5 | the count |
| D-KEY-GRAMMAR | 0242 | the prestate proves every live key already matches the tightened grammar | the two bad-key counts |
| D-KK-KINDS | 0241 | tail asserts the kind census `{"assertion":11,"policy":2,"preference":1}` | today's census, reported beside the expected one |
| D-KK-FIRMSCOPE | 0240/0241 | tail asserts the firm-scope-refused census = 10 | today's census |
| D-FYE-MONTH | 0240 | the new day key is `select ... from clara.knowledge_keys where knowledge_key='financial_year_end_month'`; no month row means ZERO rows inserted and a failing tail | month key present = 1, day key = 0, `fye_day` map row = 0, eligibility row = 0 |
| D-REGISTRY | 0244/0245/0246/0272 | 0245's prestate demands **exactly 240 rows at exactly one `registry_version`, and that version is 2**, **exactly 28** rows at `limits->>'invoice_line_items'='planned'` and **zero** rows carrying `invoice_line_items_reason`; 0244's and 0272's tails need `pdf x invoice` present and 0246's probe needs it `typed_facts='supported'` plus `ofx x bank_statement` present; 0246 needs zero `proposal_only` rows | one read answering all nine |
| D-REGISTRY-KEYS | 0244 | the high-water backfill is `insert ... select ... on conflict (format, document_kind) do update` | rows = distinct (format, document_kind) |
| D-FSK-COUNT | 0257/0258/0259 | prestates assert `count(*) from clara.firm_setup_keys` = 12 and 0259's tail then expects 15 | the count, the tip-row count, and the `mpers_eligibility`/`tin` pair shape 0257 pins |
| D-FSK-ORDER | 0257/0258/0259 | prestates assert the `item_key` order in `sort_order` is exactly the pinned twelve | `string_agg(item_key, ',' order by sort_order)` |
| D-FSK-SHA | 0258/0259 | prestates assert a `sha256` over the twelve rows' pre-existing columns | the SAME `string_agg` expression, parsed out of the file, run against hosted |
| D-FSK-COLUMNS | 0258 | `add column user_note` / `add column retired_at`; the prestate refuses if either already exists | both absent |
| D-FSK-TRIGGER | 0258 | the backfill runs with `t_firm_setup_keys_append_only` DISABLED and re-enables it; the prestate demands `tgenabled='O'` | the trigger's `tgenabled` |
| D-FSK-BACKFILL | 0258 | the backfill UPDATE names its twelve `item_key`s in a VALUES list, then demands exactly twelve non-null `user_note` rows | the live `item_key` list, so a missing key is visible before it shortens the count |
| D-TAXONOMY | 0263/0264/0268 | 0263's prestate needs an ACTIVE taxonomy version and the two new event types wholly absent or wholly present; 0264 needs at least one event type of the renamed families; 0268's tail needs `work.cancelled` registered | one read answering all five |
| D-TAXONOMY-COVER | 0263 | the estate-wide coverage law (every event type routed at the active version) | today's uncovered count |
| D-RETIRE-ALLOWLIST | 0261/0271 | both prestates refuse if the retired door holds a `clara.wake_fn_allowlist` row | both counts |
| D-OPENING-CHECKS | 0239 | the prestate refuses any CHECK text that is neither 0194's three-value form nor #984's four | both `pg_get_constraintdef`s and `task_id`'s NOT NULL flag |
| D-OPENING-ROWS | 0239 | the re-added CHECKs scan two live tables | row counts of both, plus receipts with `task_id` null |
| D-PLAN-WRITER | 0255 | §0.5 demands exactly ONE function body inserting a firm-scope plan | the census |
| D-AUDIT | 0243 | `add column actor_role`, a CHECK that scans `clara.audit_log`, a BEFORE INSERT trigger and a partial index built non-concurrently | column absent, index absent, **row count and table size** (the window-duration number of this wave), and the rows matching the index predicate |
| D-WORKQ-KEYS | 0268 | the tail calls `clara._work_question_record` on the NEWEST `clara.agent_interruptions` row with `work_id is not null` and demands exactly 26 keys. **A seeded rig has no such row, so the integration gate never ran this branch.** | the count of work-bearing interruptions; non-zero means the branch fires on hosted for the first time |
| D-FA-BIRTH | 0247 | recuts the birth trigger so a later UPDATE cannot birth a register row retroactively. It RETIRES no row already born that way. | `clara.fixed_assets`, `clara.fa_account_profiles` and `clara.fa_depreciation_authorities` counts, so the operator knows whether the question can even arise |

**Statements that need no read, and why.** Recorded here so the list is exhaustive rather than
selective.

- **0236, 0237** write only a `comment on function`. No row, no lock class above `SHARE UPDATE
  EXCLUSIVE`.
- **0235** creates a NEW table (`clara.document_binding_claims`) and recuts one function. A new
  table has no existing rows; its policy, revoke and truncate trigger act on an empty relation.
- **0238, 0248, 0249, 0250, 0251, 0252, 0253, 0254, 0256, 0257, 0260, 0262, 0264, 0265, 0266,
  0269, 0270** are function recuts, splices and view recuts only. `create or replace function`
  touches no row. Their prestates pin `prosrc` shas, which the FINGERPRINT (3b) covers in one
  place for all of them rather than restating them here.
- **0247** recuts one trigger FUNCTION; the trigger itself is not re-created.
- **0261, 0271** `drop function`. Their prestates count catalog dependents and `wake_fn_allowlist`
  rows, which are catalog and one-table reads already covered (D-RETIRE-ALLOWLIST and 3b).
- **0267** DROPs `clara.list_accounting_work/9` and creates an eleven-argument form. No row is
  touched, and the two new parameters carry defaults, so a caller naming nine arguments still
  resolves (checked: `apps/web/lib/work/work-list.ts` calls it with NAMED arguments).
- **0260's behavioural probe** INSERTs a synthetic user, firm, membership and client through the
  real doors and unwinds the subtransaction with a `CLR99` sentinel. It is scoped to the ids it
  mints, so no hosted row is read or written; its only dependency is schema shape, which the
  from-scratch and upgrade chains both proved.
- **0242's, 0244's, 0246's and 0272's tail probes** are the same sentinel idiom. They DO touch the
  live registry (delete-then-insert `pdf x invoice`, a whole-table `registry_version + 1`, a
  `truncate`), which is why D-REGISTRY reads the preconditions those probes need; the probes
  themselves roll back whole.
- **0263's inserts** carry `on conflict do nothing` on both `clara.event_types` and
  `clara.trigger_taxonomy`, so they are idempotent against any row state; what is NOT optional is
  an active taxonomy version, which D-TAXONOMY reads.

**3d. The quiescence census** (`--census`, re-run after the machine stop): non-terminal
`clara.agent_tasks` by kind and status, unbound live tasks (the rollback preflight's second
census), non-terminal `clara.accounting_work`, `clara.document_processing_tasks` by lane and
status, pending `clara.agent_interruptions`, `workflow.workflow_runs` by status and the
non-terminal ones by name, `clara_runtime%` sessions, the F10 advisory holder
(`classid 439041101`, `objid 794746`), and any lock held by another backend on the eleven tables
this wave takes an ACCESS EXCLUSIVE on.

**3e. Pre-images.** This wave changes no frozen body and drafts no below-frontier successor
migration, so the 0225...0233 ceremony's `--pre-images` step has no subject here. The FINGERPRINT
export IS the pre-image record: it carries `sha256(prosrc)` for every function in `clara`, and it
is written to a file before the window.

**3f. DB RESTORE POINT: the full dump, through the probe DSN into WSL.** `backup.mjs --profile
full` (`pg_dump` 17.11 lives in WSL; Windows has none). About 50 to 100 s and about 215 MB in the
last three ceremonies. **The CA-path workaround the 2026-09-17 ceremony recorded is still required
and still unfixed:** `scripts/ops/dsn-pipe.mjs` pins `sslrootcert=<CA>` onto the DSN with the
WINDOWS spelling of `ops/tls/pooler-ca.crt`, which a WSL child cannot open (`ENOENT`). Re-check
whether a `--child-os wsl` spelling exists on RELEASE_SHA before assuming the wrapper is needed. If
it is, run the dump under the same small WSL wrapper: respell **only that one pin** to `/mnt/c/...`
(same committed CA, `verify-full` kept, DSN env-only, never printed), with

```
export WSLENV='PGHOST:PGPORT:PGUSER:PGPASSWORD:PGDATABASE:PGSSLMODE:PGSSLROOTCERT/p:CLARA_BACKUP_DIR/p'
```

(no `DATABASE_URL` in `WSLENV`) and
`NODE_EXTRA_CA_CERTS=/mnt/c/Users/zhant/Desktop/clara-rebuild/ops/tls/pooler-ca.crt` passed at
process launch. Record the artefact path, the byte count and its sha256; copy off-machine if the
window is delayed.

## W. Deploy order, decided from the migrations' headers and the two diffs

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine is
STOPPED before the migrate and started again only on the NEW image.** Derived, not assumed:

- **No file in this wave claims an inversion, and that is a measurement.** `grep -niE 'deploy
  order|consumer-first|consumer order|runtime-first|writer[ -]quiescence|quiesce'` over
  `0235...0272` returns zero hits. `ARCHITECTURE.md` §5.F is what makes silence readable: the
  obligation to invert is written in the migration's own header, so a header that does not carry
  one does not owe one. What still applies to all 38 is the general rule in `packages/db/README.md`:
  before deploying a change to an active writer body, stop new writes and drain in-flight calls,
  apply the migration, then resume.
- **The NEW web calls two doors only this wave creates.** Of the 47 function names the 38 files
  create, exactly **19 are brand new** on hosted, and only two of those are granted to
  `clara_authenticated`: `clara.dismiss_firm_setup_tip(uuid,text,text)` (0259) and
  `clara.set_firm_document_limits(int,int,int,int,text)` (0270). Everything else is `_`-prefixed and
  granted to nobody. A door that is not there is **42883**. So web is promoted LAST.
- **The NEW runtime tolerates the OLD schema; the OLD runtime does NOT tolerate the NEW one. This
  is what makes the machine stop mandatory rather than merely tidy.** The whole runtime diff is
  `lib/intake.mjs`, `lib/intake-batches.mjs` and `src/intakeRoutes.ts`, and it is about **0254**:
  since 0254, `clara.create_document_intake` COMMITS a ceiling-refused intake at `failed`/`limit`
  and RETURNS `{refused: true, ...}` instead of raising `CLR18`.
  - New runtime against the OLD door: `if (out?.refused === true)` is simply false, and the CLR18
    arm of `mapIntakeError` still runs. Safe in that direction.
  - **OLD runtime against the NEW door**: it never tests `refused`, so it reads
    `String(out.intake_id)` off a REFUSED intake, writes a spool sidecar, mints an upload
    capability and answers **201** to an uploader whose file the database refused; and
    `recoverPendingDocumentIntakes` then re-drives that intake on every sweep until its TTL
    expires it. That is a real defect, not a cosmetic one, so the serving image must not be up
    while the database is at 0254 or above.
- **What the OLD WEB does between the migrate and the promotion, checked rather than assumed.**
  There is a window of a minute or two in which web `922f9428` talks to a 0272 database.
  - `clara.list_firm_timeline` is DROPPED by 0261. The serving tree still contains
    `apps/web/lib/firm/timeline.ts`, but **nothing imports it**: `git grep` for a real import of
    `firm/timeline` in `ddb5a1258 -- apps/web` returns nothing, and `listFirmTimeline(` is called
    only from its own test file. Firm Home's Recent activity already reads `clara.list_activity`
    (#659, `firm-recent-activity.tsx`). So the drop cannot break the serving web.
  - `clara.create_account_set_v1` is DROPPED by 0271. `apps/web/lib/reports/types.ts` says in as
    many words that it is "DELIBERATELY ABSENT from this module"; there is no call site.
  - `clara.list_accounting_work/9` is dropped and replaced by an eleven-argument form whose two new
    parameters have defaults, and the serving web calls it with NAMED arguments. It still resolves.
  - `clara.firm_invites_visible` gains a fifth status value, `issuer_lapsed` (0269). The serving
    web's `INVITE_STATUSES` is a closed world whose own comment says anything outside it "renders
    as the DB's own raw string rather than being mapped to a label this app invented". Cosmetic for
    the length of the window.
  - `clara.list_review_queue` gains a row kind, `depreciation_authority_pending` (0260). The
    serving web types it `row_kind: ReviewQueueRowKind | string`, so an unknown kind does not
    throw.
  - **Unverified, and worth watching:** whether PostgREST reloads its schema cache promptly after
    0261/0267/0271 drop and recreate functions. If a Work or Firm Home surface answers `PGRST202`
    after the migrate, the cache needs a reload; that is a hosted behaviour this draft cannot test.
- **The reverse direction is free**, which is what makes DB-first safe: every new door is either
  `_`-prefixed with no grant, or granted to `clara_authenticated` with a browser consumer that
  ships in the SAME web version.

**The quiescence window covers the whole 38-file run**, one `migrate.mjs` invocation. What it is
buying, named, with the LOCK class each takes:

| file | why it rides the window |
|---|---|
| 0239 | five `drop constraint` / `add constraint` pairs plus one `alter column ... drop not null` on `clara.accounting_work` and `clara.operation_receipts`: ACCESS EXCLUSIVE, and each ADD CONSTRAINT scans the whole table |
| 0241 | `alter table clara.knowledge_keys drop column scope_default`: ACCESS EXCLUSIVE |
| 0242 | `drop constraint` + `add constraint ... check` on `clara.knowledge_keys` and `clara.client_fact_keys`: ACCESS EXCLUSIVE + full scan |
| 0243 | `add column actor_role`, `add constraint ck_audit_log_actor_role` (full scan of `clara.audit_log`), `create trigger t_audit_actor_role`, and `create index ix_audit_log_knowledge_revision` (SHARE, which blocks writes for the length of the build). **This is the one statement whose duration depends on a table that grows.** |
| 0244 | three `create trigger`s on `clara.document_capabilities`, one of them a DEFERRABLE INITIALLY DEFERRED constraint trigger, plus the high-water backfill |
| 0245 | a whole-table `update clara.document_capabilities set registry_version = registry_version + 1` over 240 rows, each row firing the monotonicity, high-water and uniformity triggers |
| 0246 | `drop constraint` + `add constraint` on `clara.document_capabilities`: ACCESS EXCLUSIVE + full scan |
| 0255 | `drop index clara.uq_onboarding_plans_one_open_firm` (ACCESS EXCLUSIVE) then `create unique index` (SHARE) on `clara.onboarding_plans` |
| 0258 | two `add column`s, one `add constraint`, and a `disable trigger` / backfill UPDATE / `enable trigger` cycle on `clara.firm_setup_keys`: ACCESS EXCLUSIVE three times |
| 0259 | three INSERTs into `clara.firm_setup_keys` and a `drop constraint` / `add constraint` on `clara.onboarding_plan_items`: ACCESS EXCLUSIVE + full scan |
| 0263 | INSERTs into `clara.event_types` and `clara.trigger_taxonomy` |
| 0267 | `drop function clara.list_accounting_work/9` and create the /11 form |
| 0272 | four `drop trigger` / `create trigger` pairs across `clara.document_capabilities` and the high-water ledger |
| the rest | function recuts and splices, which take no table lock above what `create or replace function` needs, but ride the same window for free |

**THE TIMEOUT PICTURE IS NOT UNIFORM IN THIS WAVE, and that is new.** `migrate.mjs` still arms
nothing itself (`scripts/migrate.mjs:331`: the runner "arms no statement_timeout, lock_timeout or
query deadline on this client", deliberately, because the F10 advisory wait must be unbounded).
Measured across the 38:

- **`statement_timeout = '5min'` AND `lock_timeout = '5s'`**: 0235, 0236, 0237, 0238, 0239, 0244,
  0245, 0246, 0260, 0268, 0272. A blocked lock here FAILS FAST with `55P03` and rolls that
  migration back whole.
- **`statement_timeout = '5min'` only**: 0256, 0257, 0258, 0259, 0261, 0262, 0263, 0264, 0265,
  0266, 0267. A blocked lock waits, then the statement is cancelled at five minutes (`57014`).
- **NEITHER**: 0240, 0241, 0242, 0243, 0247, 0248, 0249, 0250, 0251, 0252, 0253, 0254, 0255,
  0269, 0270, 0271. A blocked `ALTER TABLE` or `CREATE INDEX` **waits indefinitely**. The ones
  that take a heavy lock in that set are **0241, 0242, 0243 and 0255**.

So step 6b's `pg_locks` read is the only guard for those four. If one blocks,
`pg_cancel_backend` the blocker, **never** the migration.

## 4. Runtime image first, build-only and push, released by digest

```
... flyctl deploy --config packages/runtime/fly.toml --build-only --push \
      --image-label refresh-<RELEASE_SHA> --build-arg CLARA_BUILD_SHA=<full sha>
```

About five minutes; record the `sha256:` digest and release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7, never by tag. The Docker build runs
`nitro build` only: it does NOT run the bundle gate or the freeze-lint, so those counts are `ci`'s
and step 11a's, not this step's output (correction recorded in the 0225...0233 as-run). Nothing
built here is released until step 7.

## 5. Web build and upload, in WSL as root, BEFORE the window

Mechanism unchanged: detached checkout at RELEASE_SHA in `/home/runner/clara-deploy` fetched from
`refs/remotes/origin/main` (the wave-1 correction), `corepack pnpm install --frozen-lockfile`, the
two `NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then
`corepack pnpm --dir apps/web exec wrangler versions upload --tag refresh-<RELEASE_SHA>`. Record
the Worker Version ID. **Not promoted until step 8.**

## 6. Writer quiescence, then migrate: all 38 files, one run

6a. `flyctl machine stop 48ee715b763048`, confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works. This stop is MANDATORY for the
0254 reason in section W, not merely tidy.

6b. Re-run the census through the probe (`reads-w2.mjs --census --prod`). It must come back clean,
and specifically: no other backend holding a lock on `clara.accounting_work`,
`clara.operation_receipts`, `clara.audit_log`, `clara.document_capabilities`,
`clara.knowledge_keys`, `clara.client_fact_keys`, `clara.firm_setup_keys`,
`clara.onboarding_plans`, `clara.onboarding_plan_items`, `clara.event_types` or
`clara.trigger_taxonomy`. The web app talks to PostgREST directly and can still hold a lock while
the runtime is down: this read is what makes the window real rather than nominal. Also: **no holder
of the F10 advisory lock**, or the migrate step hangs silently.

6c. From the RELEASE_SHA checkout:

```
(cd packages/db && <probe dsn pipe> node scripts/migrate.mjs)
```

Expect **`migrate: 38 new migration(s) applied · 267 total`**. Expected wall is about T (step 0)
plus pooler latency; the 2026-09-19 run took 42 s for nine files through the ssh hop and the rig's
34-file upgrade took 6 s locally, so budget generously and **do not kill it**. If it passes about
10x T without returning, read `pg_stat_activity` on a second connection and decide from the ledger.

Expect a prestate notice and a tail notice per file, 38 of each. The two worth reading out loud
because they are about hosted ROWS rather than catalog shape:

- `#782 prestate` (0245): 240 rows at version 2, 28 planned rows.
- `#934`/`#935` prestates (0258/0259): twelve rows, the pinned order, the pinned column hash.

6d. **FAILURE BRANCHES, decided from the LEDGER, never from which prestate spoke.** One transaction
per migration and `migrate.mjs` stops at the first failure, so a refusal leaves NO partial state:
the file that raised is rolled back whole and `max(version)` is the definite frontier. Re-read
`select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED, i.e. hosted drift. STOP.** The message names the body, the expected sha
  and the found sha. Step 3b exists so this is discovered BEFORE the window: a pinned drift there
  is the same finding, found in a read-only transaction. Do not re-pin and do not edit the
  migration. Report to the owner with the body name and both shas.
- **A DATA PRESTATE REFUSED.** The candidates, all of them read in 3c so they never first appear
  here: 0241/0242's knowledge-key counts, 0245/0246's registry counts, 0257/0258/0259's
  firm-setup twelve, 0255's firm-scope duplicate, 0263's active taxonomy version, 0268's
  twenty-six-key work-question record.
- **Ledger-position branches.** (i) `max(version)` below `0235`: nothing of this wave landed; the
  deployed image `refresh-ddb5a125` is a legal boot target, so `machine start`, report, and do NOT
  promote web. (ii) `0235` to `0253` committed and the next did not: `refresh-ddb5a125` still boots
  and the intake contract has not changed yet, so start the old image, hold web at `922f9428`, and
  report. (iii) **`0254` or above committed but not all 38**: the old image must NOT be started,
  because of the intake return-contract change; either drive forward from the ledger's frontier or
  roll the runtime forward to the new image first and hold web. (iv) all 38 committed, ledger reads
  **267 / `0272_document_capability_wall_completion`**: drive forward to steps 7 and 8.
- **A `55P03 lock_not_available`** on 0235...0239, 0244...0246, 0260, 0268 or 0272: that is the
  file's own `lock_timeout='5s'` firing. Find the blocker in `pg_locks`, `pg_cancel_backend` it,
  and re-run 6c from the ledger's current frontier.
- **An indefinite wait** on 0241, 0242, 0243 or 0255: those four arm no `lock_timeout` at all. Do
  the same thing, from a second connection.

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
serving git_sha=<full sha> frontier=0272_document_capability_wall_completion(267) bodies=55 pins ... \
        chatTurn=chatTurn_v21 claraWork=claraWork_v5 clientOnboarding=clientOnboarding_v5
stranded bodies n=0            <- BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5     <- FIVE bundle banners
CONTROL listening
LEADER acquired
```

`bodies=55` and all three pins are UNCHANGED from the serving image, because this wave changed no
frozen body (gate 0a). `stranded bodies n=0` for the same reason: this cut removes no export, so
the only way it is non-zero is a run parked on a body retired before this wave, which step 3's
census answers in advance. Signed-in `GET /api/build-info` should read `git_sha` = the full sha,
`frontier` `0272_document_capability_wall_completion(267)`, `bodies: 55`, the same three pins.

## 8. Promote web, then smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` plus four bindings),
then `pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as all four prior ceremonies:
`/login`, `/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307 to
`/login?next=...`; `/settings/registrations`, `/admin/registrations` 307 to `/operator`;
cross-origin POST `/auth/confirm/resend` 403.

**Signed in, through the owner's browser, read-only, nothing clicked that writes.** One surface per
lane, chosen for what this wave actually changed:

| lane | tickets | surface | what to see |
|---|---|---|---|
| 01 | #1014 #868 #906 #914 #984 | `/clients/<id>/registers?tab=opening` and `/journals` | an opening batch now mints ONE Work and ONE receipt; the correction door still refuses what it refused |
| 02 | #898 #913 #993 #912 #991 | `/settings/knowledge` and `/clients/<id>/knowledge` | `financial_year_end_day` offered as a key; nothing lost by the `scope_default` drop |
| 03 | #846 #782 #988 | `/clients/<id>/documents` capability surfaces | invoice line items read as an accepted limitation, not "planned" |
| 04 | #972 #973 #976 #977 #979 | `/clients/<id>/registers?tab=fixedAssets` | the authority panel, the retired-authority fallback, the particulars completion wall |
| 05 | #964 #968 #965 | `/clients/<id>/documents` | an intake batch, Cancel reachable, a ceiling refusal recorded rather than lost |
| 06 | #894 #895 #891 #934 #935 | `/settings/firm` (firm setup) | the twelve items plus three education tips, each with its one-sentence `user_note`; a dismissable tip |
| 07 | #974 #995 #1009 #998 | `/` (Firm Home) | a `depreciation_authority_pending` row in needs-you; Recent activity still renders (it reads `list_activity`, not the dropped door) |
| 08 | #840 #843 #861 | `/activity` and `/operator` | the renamed kind ladder; the two new operator timeline events |
| 09 | #839 #880 #905 #885 | `/work` and `/clients/<id>/work` | the claim label, the receipt-date bound, a source-corrected Work reading as superseded |
| 10 | #871 #872 #996 #960 #1003 | `/settings/members` and the firm caps card | an `issuer_lapsed` invite; the document-limit writer |

## 9. Rollback preflight demonstration, READ ONLY, do NOT roll back

Run immediately after step 7:

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted v-previous index.mjs>
```

through the LIVE machine's DSN, with the previous bundle extracted from a SECOND old-image probe,
never from the live machine. Two separate gates, and say which is being demonstrated: (a)
`FRONTIER_BODY_RULES`, whose only rule is still `0195` requiring `claraWork_v3`, which
`refresh-ddb5a125` carries; (b) the stranded-body census, which is trivially clean here because
this wave carries the SAME 55 bodies as the previous image. Exit 0 = allowed, 1 = REFUSED with the
body names, 2 = could not answer; the last two are deliberately distinct.

**This wave's runtime rollback is unusually safe and its database rollback is unusually not.** The
image carries the same bodies and the same pins, so gate (b) cannot degrade with traffic the way it
did in the 2026-09-18 wave. But `refresh-ddb5a125` is NOT a lawful target while the database is at
0254 or above, for the intake return-contract reason in section W: rolling the runtime back without
rolling the database back would reintroduce the 201-on-a-refused-upload defect. **Nothing in this
wave drafts a below-frontier database rollback**, and the only route is the step-3f dump, which
returns no Storage bytes, no managed Auth config and no engine state. If a below-frontier rollback
is ever wanted it must be drafted BEFORE a window, never during an incident.

## 10. The reads this wave owes on hosted, after the release

Run `ceremony-w2/reads-w2.mjs --post --prod --baseline <the UPGRADED rig fingerprint>` through the
live machine's DSN. It issues the same SQL step 3 issued, so pre and post sit side by side. It
asserts:

1. the ledger reads **229 + 38 = 267** at `0272_document_capability_wall_completion`;
2. every one of the 38 new migrations has a ledger row whose checksum equals its file;
3. the drift gate over all 267 applied rows;
4. the estate fingerprint equals the baseline exported from the UPGRADED rig database, with every
   difference listed and classified.

**The baseline for (4) must come from a rig database upgraded with the MERGED tree**, that is
`clara_w2_upg2` (267 / 0272) and not the older `clara_w2_upg` (263 / 0272), which predates lane 09
and would report the 0265...0268 objects as differences.

**The reference row counts that MOVE across the 38, measured on the rig** (seeded, so hosted's
absolute numbers will differ; the DELTAS are what to check):

| relation | before | after |
|---|---|---|
| `clara.document_capability_version_high_water` | absent | 240 |
| `clara.firm_setup_keys` | 12 | 15 |
| `clara.knowledge_keys` | 13 | 14 |
| `clara.knowledge_plan_item_map` | 10 | 11 |
| `clara.event_types` | 137 | 139 |
| `clara.trigger_taxonomy` | 150 | 152 |

Every other reference relation is unchanged in count, including `clara.document_capabilities`,
which stays at 240 rows across the whole wave (only its `registry_version` and `limits` move).

Then the questions this wave's own headers ask of hosted, which only a release-time read can answer:

1. **0245/0246 (#782/#988): the registry after the raise.** 240 rows, one distinct
   `registry_version`, value **3**; zero rows still carrying `invoice_line_items = planned`; 28
   carrying `accepted_limitation` with its reason; zero rows at `business_operation =
   proposal_only`; and the high-water ledger at 240 rows all at version 3.
2. **0243 (#912): the audit column.** Every pre-existing row NULL (never back-filled), and the
   first rows written AFTER the release carrying a real `actor_role`. Report the table's row count
   and its size before and after, because the index build is the window's own cost.
3. **0241/0242 (#913/#993): the knowledge catalogue.** 14 keys, the kind census
   `{"assertion":11,"policy":2,"preference":1}`, the firm-scope-refused census 10, and both grammar
   CHECKs live.
4. **0258/0259 (#934/#935): the firm setup catalogue.** 15 rows, twelve with a `user_note`, three
   education tips, none retired, the original twelve's column hash unchanged.
5. **0255 (#894): the widened index.** One firm-scope plan per firm, `uq_onboarding_plans_one_firm`
   live with no `state` term in its predicate.
6. **0268 (#885): the work-question record.** Whether any `clara.agent_interruptions` row carries a
   `work_id` on hosted, and if so whether the tail's twenty-six-key assertion fired. **This is the
   one branch the integration gate could not reach**, because a seeded rig has no such row.
7. **0247 (#972): the fixed-asset register.** 0247 stops a retroactive birth from happening again;
   it retires no row already born that way. If hosted holds any `clara.fixed_assets` rows, run
   `clara.fa_register_tie` for each client and report whether any unexplained difference remains.
   The preflight prints the counts that decide whether the question arises at all.

Also re-read the ledger, the stranded-body census and the quiescence census once more and record
them.

## 11. Manifest, then the tickets

11a. `node scripts/check-frozen-workflows.mjs --lock-deployed` has **nothing to lock in this wave**:
no frozen file was added or changed, so the unlocked set should be empty and the plain freeze-lint
should still read `312 frozen file(s) ... 55 "use workflow" module(s) ... 3 retired`. Confirm the
unlocked set is empty BEFORE running it, since the command locks every unlocked entry.

11b. **Ticket closures with hosted evidence.** Forty-two tickets across ten lanes:

| lane | tickets | migrations |
|---|---|---|
| 01 journals and the opening lane | #1014 #868 #906 #914 #984 | 0235 0236 0237 0238 0239 |
| 02 knowledge keys and the audit log | #898 #913 #993 #912 #991 | 0240 0241 0242 0243 (none) |
| 03 capability registry and operation levels | #846 #782 #988 | 0244 + 0272 0245 0246 |
| 04 fixed assets | #972 #973 #976 #977 #979 | 0247 0248 0249 0250 0251 |
| 05 document intake | #964 #968 #965 | 0252 0253 0254 |
| 06 firm setup | #894 #895 #891 #934 #935 | 0255 0256 0257 0258 0259 |
| 07 Firm Home | #974 #995 #1009 #998 | 0260 (none) (none) 0261 |
| 08 Activity and the operator timeline | #840 #843 #861 | 0262 0263 0264 |
| 09 Work list and parked Work | #839 #880 #905 #885 | 0265 0266 0267 0268 |
| 10 settings, invitations, firm caps | #871 #872 #996 #960 #1003 | (none) 0269 (none) 0270 0271 |

Read each ticket's real title with `gh issue view <n>` before commenting. Comment shape, unchanged
from the four prior ceremonies: *"Hosted release evidence, `<migration>` (`<date>`, release
session)"*, carrying the migration's own `applied_at` from the ledger, its prestate and tail notice
text, and, where the AC named a hosted behaviour, the specific reading step 7, 8 or 10 produced.
Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane comment above,
hosted evidence here."*

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback
command and the runtime/database asymmetry named in step 9.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the
  registry counts, the firm-setup twelve, the audit-log size, the work-bearing interruption count
  and the machine and web ids are taken from `RELEASE-W1-AS-RUN.md`, the migration files and the
  rig; none is read from hosted.
- **RELEASE_SHA does not exist yet.** The wave-2 PR is unmerged and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `d3aaecdb8`.
- **The 38-file upgrade replay exists but is not MINE.** This draft read `clara_w2_upg2`'s ledger
  (267 / 0272, 38 rows stamped seven seconds apart onto a seeded 229-row base) and inferred the
  upgrade path from that shape. It did not run the replay and did not see its prestate and tail
  notices. The authoritative record is gate worker A's report, not this paragraph.
- **The tree `clara_w2_upg2` was built from is `clara-wt/int2` at whatever head it carried at
  2026-09-20 22:27+08**, which is not yet RELEASE_SHA.
- **The 0243 index build duration** is unknown, because hosted's `clara.audit_log` size is unknown.
  The rig carries 65 rows; hosted will carry more. The preflight reads the number, and this is the
  one statement in the wave whose cost grows with the estate.
- **The PostgREST schema-cache behaviour** after 0261/0267/0271 drop and recreate functions is
  unverified from here.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.
- **0268's twenty-six-key tail branch** has never executed anywhere: the rig has zero work-bearing
  interruptions. If hosted has any, the release window is the first time that code path runs.
- **The runtime image's own gates** (bundle gate, freeze-lint) are `ci`'s output, not the Docker
  build's; on `int2` they are green locally (`312 / 55 / 3`), but not on RELEASE_SHA.

---

## § RESULTS (as run)

**RUN ________ (UTC ________) by ________.** Every row below is a reading. As-run logs: ________.

Owner authorisation (the literal sentence, timestamped, in-session): ________

Build tree: `git rev-parse HEAD` = ________ = `origin/main`; `ci` ________ on that sha;
`git status --porcelain` = ________.

| step | reading |
|---|---|
| 0 rehearsal (0234 -> 0272 replay, 38 files, T) | ________ |
| 0a gates (ci, porcelain, owner go, freeze-lint) | ________ |
| 1 fly auth | ________ |
| 2 probe machine (id, image, created, destroyed) | ________ |
| 3 preflight `--plan` (pending, generated reads, GAPs) | ________ |
| 3a ledger + drift gate + pending set | ________ |
| 3b fingerprint vs the rig baseline (keys, DRIFT, PINNED DRIFT, TOLERATED) | ________ |
| 3c data preconditions (each id, ok or STOP) | ________ |
| 3d quiescence census (pre) | ________ |
| 3f backup (path, bytes, sha256, wall, CA workaround used?) | ________ |
| 4 runtime image (tag -> `sha256:` digest, size) | ________ |
| 5 web (Worker Version ID, tag, uploaded at) | ________ |
| 6a machine stop (timestamp, state) | ________ |
| 6b re-census (locks on the eleven tables, F10) | ________ |
| 6c migrate (`38 new · 267 total`? wall, per-file notices, ledger re-read, per-file `applied_at`) | ________ |
| 7 release (probe destroyed, deploy, start, `/ready`, boot lines, `bodies=`, five banners, outage window) | ________ |
| 8 promote (version, signed-out smoke, the ten signed-in surfaces) | ________ |
| 9 preflight (gate (a), gate (b), exit code) | ________ |
| 10 post reads (ledger, the four assertions, the seven owed questions) | ________ |
| 11a freeze-lint / `--lock-deployed` (expect: nothing to lock) | ________ |
| 11b ticket closures (42) | ________ |
| post census | ________ |

**Rollback points AFTER (from the ledger):** DB ________ · runtime ________ · web ________.
