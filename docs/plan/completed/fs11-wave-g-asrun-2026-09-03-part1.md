*Part 1 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Parts 1–3 are the step TEMPLATE written before the ceremony; parts 4–6 are the AS-RUN. Previous: none (this is the first part) · Next: `fs11-wave-g-asrun-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# FS-11 — the reduced Wave-G reset + walk · AS-RUN TEMPLATE

**Status: TEMPLATE — NOT RUN.** Written read-only at `origin/main` = **`9d5d844e`** (PR #539 merged
20:48 MYT 2026-09-03), measured 2026-09-03 ≈21:0x MYT by the shell clock. Nothing here was
executed: no DSN piped, no migration applied, no secret read or printed, no rig started, no live
command run.

**How to use it.** Every step carries: a NUMBER, an ACTOR, the exact command with **env NAMES
only**, the READ that proves it, a `[ ]` box and an `as run:` line. Fill the `as run:` line with
what a read actually SAW — never "done", never "no errors" (law 2: absence is not evidence, a
derived state is not evidence). A step whose read does not match its expectation stops the
ceremony and goes to the owner.

**Governing rulings, all 2026-09-03.** 裁-152 (the pepper + the service token minted once at FS-10,
same bytes here, the hash compare here) · 裁-153 (four security-pass lines deferred to steps
12/11/6/13) · 裁-156/157 (no soak, no maintenance page, a recorded window) · 裁-159 (BELCORT
re-minted through the self-serve door, `is_operator` after) · 裁-160 (the parked canary's clara-side
rows die with the schema — an as-run line at step 4) · 裁-161 (step 4b: purge ALL auth users AND
ALL Storage objects, never buckets or policies) · 裁-162 (the lead runs steps 2 / 4 / 7 as the
owner's delegate, FS-11 only, expiring at beta live) · 裁-163 (the restore-proof is the fresh LOCAL
`--profile full` dump into a throwaway PG17; the R2 decrypt is NOT done) · 裁-164/165 (the product
walk exercises the agentic paths; autonomy layer 2 stays OFF) · 裁-166 (DPA only) · 裁-169 (the two
rate limits read back) · 裁-170 (BELCORT not SST-registered → Stripe Tax OFF) · 裁-172 (the DR `4.9`
replacement subject) · 裁-174 (FS-11 runs tonight, in the same sitting as FS-10).

**Standing law.** `AGENTS.md` constraints 2 (the DB owns every number), 4 (DSNs from the
environment only), 10 (rig-validated, numbers claimed at merge), 11 (the pinned ids are never
answered / never approved), 13 (BELCORT is the operator firm; every other firm is a resettable
fixture), 14 (DATA-scoped authority; **the product's security mechanisms are NEVER weakened for
testing convenience** — the operative clause on any collision), 15 (the `workflow` /
`graphile_worker` / `spike` schemas are never disturbed). The three review-and-evidence laws bind
every read below.

---

## 0 · ACTORS

- **[L]** — the lead, as the owner's delegate through the real audited door. Under **裁-162** this
  covers steps **2, 4 and 7** (backup, reset, seed) **for FS-11 only**, plus every non-secret act.
  The supersession of `docs/ops/DR.md:397-402`'s owner-run classifier is scoped to test data and
  **expires at beta live with the data authority itself** (constraint 14).
- **[O]** — the owner, in the owner's own terminal, dashboard or browser. Everything that reads,
  mints or moves a live secret; the `age` identity; the R2 token; `gh pr merge`; **step 11**'s two
  passwords and **step 12**'s nine secrets (裁-152); **step 4b**'s purges unless the owner delegates
  them with a Management-API token passed env-to-env; the **step 13** self-serve walk with the
  owner's own eyes; the **step 16** product walk.

**The secret rule, one line:** the lead's entire part in any secret-bearing step is the
**names-and-digests receipt** and the **hash comparison**. No value, ever.

---

## 1 · THE WINDOW (裁-157 — a recorded window, no maintenance page)

There is **no holding page and no maintenance mode**. The origin serves errors for the whole span
and that is expected and recorded, not a defect. Stamp both timestamps from the shell (`date`),
never from the model's own sense of time.

| | value |
|---|---|
| Window OPEN (from `date`) | `___________________` |
| Window CLOSE (from `date`) | `___________________` |
| Posture during the window | **every route on `app.clarabook.com` errors — expected (裁-157)** |
| First invited firm signs up | **after** this ceremony closes (nobody is signing up during it) |

`[ ]` The window's two timestamps are stamped from `date`, not remembered.
as run: ___________________________________________________________________

---

## 2 · PRECONDITIONS — every one a POSITIVE read

*No step opens until each line below is filled with what a read SAW.*

| # | Precondition | Instrument | Actor | `[ ]` | as run |
|---|---|---|---|---|---|
| P-1 | **FS-10's as-run is written and closed**, and its S21 real-origin re-walk was clean (裁-156: the Pages project delete happened in the same sitting) | the FS-10 as-run file path + its S21 verdict | [L] | `[ ]` | |
| P-2 | **The `apps/dashboard` source-delete PR is merged and its hand sweep read** (裁-158) | `gh pr view <n>` → MERGED; `gh run view <id> --json jobs` → the job list | [L] | `[ ]` | |
| P-3 | `main` is at the intended sha and the local tree matches it | `git fetch origin && git log -1 --format='%H %s' origin/main` | [L] | `[ ]` | |
| P-4 | **The sweep on that sha is GREEN, read from the JOB LIST** — never a PR's colours | `gh run view <id> --json jobs`; 裁-174 names **33757365379** as the FS-10 precondition sweep. **Three records name three different run ids** (this record's 裁-174 = 33757365379 · `AGENTS.md` = 33723755257 · the launch prep = 33712469717) — **read the id you actually dispatched, do not quote one of these** | [L] | `[ ]` | |
| P-5 | **The migration count is COUNTED, not remembered** | `git ls-tree origin/main --name-only packages/db/migrations/ \| grep -c '\.sql$'` → **159**; tail = `0164_checkout_gate_c6_web_reads.sql` (**measured at `9d5d844e`**) | [L] | `[ ]` | |
| P-6 | No `UNNUMBERED_*.sql` on the branch being applied | `git ls-tree origin/main --name-only packages/db/migrations/ \| grep UNNUMBERED` → **empty at `9d5d844e`** (裁-108) | [L] | `[ ]` | |
| P-7 | The CA-pinned bridge validates against the LIVE pooler **today** | both legs of `docs/ops/dsn-bridge.md:144-154` — WITH `-CAfile ops/tls/pooler-ca.crt` exit **0**, WITHOUT it **nonzero**. Run before every ceremony; it is not a CI gate (`:139-141`) | [L] | `[ ]` | |
| P-8 | Zero non-terminal durable runs | `select name, count(*) from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by name;` → expect zero rows (**re-read now**; the v71 deploy read zero at 12:13 and 12:48 MYT 09-03) | [L] | `[ ]` | |
| P-9 | Supavisor session headroom for **+4** (two new pools × 2) | `select usename, count(*) from pg_stat_activity where usename like 'clara_%' group by 1;` — **measure, never quote**; `packages/runtime/lib/checkout-pools.mjs:59-65` carries a standing UNVERIFIED warning on the ≈27 ceiling | [L] | `[ ]` | |
| P-10 | Runtime baseline before the window | `fly status -a clara-runtime` → machine `48ee715b763048`, **VERSION 71**, `started`, checks **2/2** (as-run `docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md` §4) | [L] | `[ ]` | |
| P-11 | `pg_dump` is **v17** | `${PG_DUMP:-pg_dump} --version` → 17.x. The server is 17.6; a v16 client aborts *"server version mismatch"* (`docs/ops/DR.md:126-137`) | [L] | `[ ]` | |
| P-12 | **A throwaway PG17 is standing** for step 2b — local, instance-unique name, port 55432 (`DR.md:433-434`) | `pg_isready` is NOT ready — connect and run `select version();` | [L] | `[ ]` | |
| P-13 | The owner's **Supabase personal access token** is available env-to-env for the Management-API receipts | the token is set in the owner's shell; **never printed, never in the repo** (`PROGRESS.md` owner-acts clause; 裁-146 point 1) | **[O]** | `[ ]` | |
| P-14 | The Stripe **SANDBOX** objects still exist and are the ones named | `prod_VBS7ZUaIFPedCs` / `price_1UB5DZHD90w0k86XNfkgYPWq` on `acct_1UAOhtHD90w0k86X`, **livemode `false`** (裁-126 — sandbox for the whole beta) | **[O]** or [L] via the Stripe connector | `[ ]` | |
| P-15 | **The walk address is never-before-registered** and is **not** a Supabase project-team address | the owner names it. `apps/web/components/entry/signup-account-form.tsx:185-194` normalizes a duplicate account to the same "check your email" state — a reused address stalls the walk silently with **no code**. 裁-161's step-4b purge empties `auth.users`, so after 4b the owner's normal address qualifies | **[O]** | `[ ]` | |
| P-16 | **Custom SMTP's three unread fields are verified** — port · username (the **literal string `resend`**, never a mailbox address) · password (a Resend API key) | the owner reads them below the fold; `docs/ops/wave-g-setup-checklist.md:24-46` records HOST, SENDER and SENDER NAME were read back 09-03 and these three were **not** | **[O]** | `[ ]` | |
| P-17 | **The pepper and the auth-wall service token were MINTED ONCE at FS-10 S8 and the owner holds both values** (裁-152) | FS-10's as-run naming them as the minting values FS-11 reuses **verbatim**; both names present in `wrangler secret list` for `clara-web` | **[O]** | `[ ]` | |
| P-18 | **`/signup` is reachable on the DEPLOYED build** | open `https://app.clarabook.com/signup` and record what actually paints. FS-4 closed at `aa789d65`; `/signup` ∈ `PUBLIC_PATH_PREFIXES` (`apps/web/lib/supabase/proxy.ts:62-72`) — but the DEPLOYED read is the evidence, never the tree | [L] | `[ ]` | |

---

## 3 · THE BRIDGE PREAMBLE (used by every DB step)

```sh
# One sleeper per PHASE, created and destroyed inside this session
# (docs/ops/ceremony-practices.md). Split argv — never one quoted "sleep 5400".
fly machine run registry.fly.io/clara-backup:<tag> --app clara-backup -- sleep 5400
# …and at that phase's close, on the record:
fly machine destroy <sleeper-id> --app clara-backup --force
```

> `clara-backup`'s scheduled machine SLEEPS between runs. Either `fly machine start <id> -a
> clara-backup` (and stop it after, receipted) or spawn a fresh sleeper.

Every DB act then takes exactly this shape:

```sh
fly ssh console -a clara-backup --machine <sleeper-id> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- <command>
```

`scripts/ops/dsn-pipe.mjs` forces `sslmode=verify-full`, pins `ops/tls/pooler-ca.crt`, scrubs the
inherited `PG*` / `PGSERVICE*` / `NODE_OPTIONS` identity vars, refuses
`NODE_TLS_REJECT_UNAUTHORIZED=0` and `NODE_DEBUG=child_process` loudly, and sets
`PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` in the **child's env only** — so
`psql -v ON_ERROR_STOP=1 -f file.sql` needs **no connection argument at all**.
**Never** `psql "$DATABASE_URL" …` (that puts the DSN in `psql`'s own argv, visible to `ps`) —
`docs/ops/dsn-bridge.md:24-43,58-67`.

**Surface note.** Every recipe here assumes a **POSIX shell**; WSL2 is the ceremony home
(`docs/ops/dsn-bridge.md:169-175`). Do not adapt these pipes to PowerShell without re-proving the
argv and disk cells there first.

`[ ]` Sleeper created; id recorded.
as run: sleeper id ______________________ created at ______________

---

## 4 · THE STEPS

### Step 1 · **[L]** Learn the exact destructive-target string without printing a secret

`reset` / `seed` refuse a non-ephemeral target unless `CLARA_DESTRUCTIVE_TARGET` equals
`user@host:port/db` **exactly** (`packages/db/lib/guard.mjs:76-95`). Get that string from the
guard's own refusal — run the reset **without** the variable:

```sh
… | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/reset.mjs
```

**Read:** the refusal message, which names the identity verbatim —
`… set CLARA_DESTRUCTIVE_TARGET="<user>@<host>:<port>/<db>"`. It carries the pooler **username**
(which is what identifies the project on a shared pooler) and **no password**.

`[ ]` The refusal was read and the exact target string captured (never pasted into a transcript
that leaves this session).
as run: ___________________________________________________________________

---

### Step 2 · **[L, per 裁-162]** BANK THE BACKUP — the FULL profile only

Only the **full** profile is a recovery artifact. The default profile is diagnostic: restoring it
yields postgres-owned, PUBLIC-EXECUTABLE functions (the write wall OPEN) and its
`clara.schema_migrations` makes a re-migrate a no-op that never rebuilds the wall
(`docs/ops/DR.md:104-122`).

```sh
export PG_DUMP=/path/to/pg17/bin/pg_dump      # only if PATH pg_dump < 17
fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/backup.mjs --profile full
```

**Reads, all four:**
1. the printed output path and its **byte size** under `packages/db/backups/` (gitignored);
2. `head -1` of the dump showing `Dumped by pg_dump version 17.x`;
3. the **four authoritative schemas** named in the run — `clara`, `workflow`, `workflow_drizzle`,
   `graphile_worker`;
4. the artifact's **sha256** (裁-163 point 1), and the artifact kept **outside** the run's working
   tree until FS-11 closes.

Also record the newest R2 bundle's timestamp (the daily `clara-backup` run) as the second,
off-vendor copy — **not decrypted here** (裁-163).

`[ ]` Dump taken; path, bytes, sha256, `pg_dump` version line and the four schemas recorded.
as run: path ____________ bytes ____________ sha256 ____________
as run: `Dumped by pg_dump version` ____________ · schemas ____________
as run: newest R2 bundle timestamp ____________ (NOT decrypted — 裁-163)

---

### Step 2b · **[L, 裁-163]** THE RESTORE-PROOF — **THIS IS A GATE**

> **Gate rule (裁-163 point 2): any `dr-verify` check or post-restore ceremony that is not clean
> means the RESET DOES NOT OPEN.** Name the instrument and its outputs — never "the dump
> completed" (`docs/ops/DR.md` §9: *a backup you never restored is not a backup*).

The subject is the **fresh LOCAL `--profile full` dump from step 2a**, restored into a throwaway
PG17. Route A (decrypting the latest R2 bundle with the owner's `age` identity) was offered and
**not taken** — the dissent is filed at 裁-163 and its consequence rides to the Known-issues row in
step 19.

```sh
# The throwaway from P-12 — instance-unique name, port 55432.
psql -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 \
  -f packages/db/deploy/roles-bootstrap.sql
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="postgres@127.0.0.1:55432/postgres" \
  pnpm --filter @clara/db restore:full        # the bundle from 2a
```

**The `dr-verify` "subset", named exactly.** *(Re-measured: there is **no `--subset` flag**. The
runner is `packages/db/scripts/dr-verify.mjs` — `pnpm --filter @clara/db dr:verify`; 裁-163 cites
`dr-verify-checks.mjs`, which is the checks MODULE the runner imports.)* The subset is what runs
when **`CLARA_DR_STRICT` is UNSET** and the AP env vars are unset: the canary probe `4.9` and the
AP gate `4.8` then record **SKIP** instead of FAIL. Source and target must be **DISTINCT physical
databases** — a self-comparison is refused — so the live project is the read-only SOURCE beside the
throwaway TARGET.

```sh
CLARA_DR_SOURCE_URL=<live, READ-ONLY>  CLARA_DR_TARGET_URL=<the throwaway> \
CLARA_DR_VERIFY_OUT=./dr-verify-fs11.json \
  node packages/db/scripts/dr-verify.mjs
```

**The POST-RESTORE CEREMONIES, enumerated against a THROWAWAY** (`docs/ops/DR-full-drill.md:128-146`
— none of them is carried by the dump):

| ceremony | at a throwaway drill | `[ ]` | as run |
|---|---|---|---|
| `roles-bootstrap.sql` — recreate the clara-custom roles | **RUN.** **19 roles at `9d5d844e` — counted at the file, not remembered** | `[ ]` | |
| `<full restore>` — schema + data + owners + the GRANT/RLS matrix | **RUN** (`restore:full`) | `[ ]` | |
| `storage-provision.sql` + the `firm-docs` bucket + bytes | **N/A by construction** — a local PG17 has no Supabase Storage. Record it as N/A **by measurement**, not omission | `[ ]` | |
| `write-login-ceremony.sql` — write-pool LOGIN + password | **RUN.** *(Contradiction flagged: 裁-162 makes password-minting an `[O]` act, but `DR.md:401-402` grants the agent a throwaway PG17 explicitly and a throwaway password is not a crown jewel. Default: the LEAD runs it here; confirm in one line with the owner.)* | `[ ]` | |
| `read-logins-ceremony.sql` — runtime + read-pool LOGIN + passwords | **RUN**, same note. Note the file's own warning: `\prompt` **ECHOES** — a private session (`read-logins-ceremony.sql:24`) | `[ ]` | |
| `acl-baseline.sql` — the public-schema ACL baseline | **RUN — MANDATORY.** A restore recreates `public` with its default PUBLIC USAGE | `[ ]` | |
| engine-sanity check (`workflow_drizzle` == source) | **NEVER IN A DRILL** — the runbook's own words: world-on, REAL RECOVERY only | `[ ]` | |
| `dr-verify.mjs` — the battery | **RUN** (the subset above) | `[ ]` | |

**Reads that discharge the gate:**
- `roles-bootstrap.sql` recreates the clara-custom roles — **19 at `9d5d844e`**;
- `restore:full` completes;
- the battery's schema-presence, manifest-floor and confinement checks **PASS**; the canary and AP
  probes record **SKIP** (not STRICT) and that is the expected, recorded state;
- **any FAIL ⇒ STOP. The reset does not open.**
- the throwaway is dropped afterwards, receipted (step 19).

**The §10 re-render leg has no subject** — `DR.md:434` adds "re-render the most recent sealed
`pre_sign` artifact and compare sha256" to the monthly-light bar, and `clara.report_artifacts` is
**empty** on this project (裁-136). Prove it, do not assume it:
`select count(*) from clara.report_artifacts;` → **0**. **N/A by measurement.**

`[ ]` GATE PASSED — every ceremony above ran or is N/A by measurement, and no check is other than
clean.
as run: dr-verify tally (PASS/FAIL/SKIP/INFO) ____________________________
as run: `report_artifacts` pre-reset count ____________
as run: GATE VERDICT ____________ (a non-clean verdict ⇒ the reset does NOT open)

---

### Step 3 · **[L]** QUIESCE

`docs/ops/wave-g-setup-checklist.md` says **nothing** about stopping the runtime machine — that
silence is not permission (**NOT IN REPO**: the checklist has no quiesce, machine-stop, session-reap
or restart line; the obligation comes from `packages/db/README.md`'s D1 section and the precedent
`docs/ops/wave-c-c-0040-ceremony-checklist.md:19-37`). What binds here binds **harder** than for an
ordinary migration: `DROP SCHEMA clara CASCADE` removes tables the live runtime is holding open, so
a running machine both blocks the DROP on its locks and would serve requests against a half-built
catalog.

1. Read Supavisor headroom (P-9) and the heartbeat staleness probe (`clara.runtime_heartbeats`,
   columns `(component, beat_at)`).
2. `fly machine stop 48ee715b763048 -a clara-runtime`
3. Wait for beats stale **> 90 s**.
4. **LOOK** at `pg_stat_activity` for `clara_%` sessions. If the machine died rather than stopped
   cleanly it leaves `idle` (not `idle in transaction`) sessions that **no timeout reaps** — the
   runbook is `docs/ops/runtime-hard-restart.md` §1: LOOK, terminate exactly that set, confirm
   positively. Do this **before** the DROP or the DROP waits on a corpse's locks.

**Reads, all three:** `fly status -a clara-runtime` shows the machine **stopped**;
`select count(*) from pg_stat_activity where usename like 'clara_%' and state <> 'idle';` → **0**;
heartbeat age **> 90 s**.

`[ ]` Machine stopped · non-idle `clara_%` sessions 0 · heartbeat age > 90 s — all three read.
as run: ___________________________________________________________________

---

### Step 3b · **[L]** THE ONE-SHOT PRE-READS — **facts that die with the schema**

> **This step is new and it is load-bearing.** Everything below stops existing the moment step 4
> runs. A read not taken here cannot be taken later, and its absence becomes an invented number.

**3b.1 — the applied frontier.**
`select count(*), max(version) from clara.schema_migrations;` → expect **148 / `0153_f_t1_sst_reference_tables`**
(live is applied through `0153`; `0154`–`0164` are on `main`, merged and unapplied).

**3b.2 — THE EVALUATOR DEPLOYED ROSTER. The single most important pre-read in this ceremony.**

```sql
select evaluator_name, version, deployed, migration_version
  from clara.evaluator_versions order by 1, 2;
```

**Why it matters, measured at `9d5d844e`.** A full re-migration ships every evaluator **DARK**:
every `insert into clara.evaluator_versions` in the chain writes `deployed` = **false** by
construction (`0059:246` · `0091:239-243` · `0092:553-557` · `0100:613-622` · `0111:1530-1535` ·
`0135:787-789` · `0140:1184-1187`). Constraint 2 then means any figure needing a deployed evaluator
**refuses** until the deploy ceremony re-runs — and **step 16 line 6 (a report renders) fails if
step 8 is skipped.**

**And the count is NOT nine.** *(Prep-vs-measurement contradiction, flagged not resolved.)* The
manifest `frozen-evaluators.json` carries **nine entries, all `deployed: true`** — but those are
**function names**, not registry rows:

| manifest entry (`deployed: true`) | its `clara.evaluator_versions` row |
|---|---|
| `clara.evaluate_metric_v1` | `evaluate_metric` v1 (`0059`) |
| `clara.evaluate_metric_v2` | `evaluate_metric` v2 (`0135`) |
| `clara.evaluate_witness_identity_v1` | `evaluate_witness_identity` v1 (`0091`) |
| `clara.evaluate_witness_fact_state_v1` | `evaluate_witness_fact_state` v1 (`0092`) |
| `clara.evaluate_witness_fact_state_v2` | `evaluate_witness_fact_state` v2 (`0100`) |
| `clara.evaluate_fs_pack_agent_v1` | `evaluate_fs_pack_agent` v1 (`0111`) |
| `clara.evaluate_fs_pack_v1` | **NONE** — it is ordinal 9 of `evaluate_metric` v1's own closure (`0059:246`) |
| `clara.evaluate_sst_watch` | **NONE** — `0016` predates the registry; the manifest says so in its own note |
| `clara.evaluate_sst_watches_all` | **NONE** — same |

Meanwhile **two registry rows exist that the manifest does not carry**:
`assess_metric_cell_independent` v1 (`0059`) and `prepayment_schedule` v1 (`0140`) — the latter
recorded `deployed=false` on live (`PROGRESS.md`, the F-A4 PR-2a row: *"evaluator `deployed=false`
until PR-2b"*).

**So: eight registry rows exist; nine manifest entries exist; neither number is the number of
deploy acts.** The number of `deploy-evaluator-version.mjs` acts owed at step 8 is **exactly the
set this read returns with `deployed = true`** — and there is no other way to learn it.

**3b.3 — the parked canary's clara-side rows (裁-160).** Count them read-only, by the shape the
verifier uses (`packages/db/scripts/dr-verify-checks.mjs:398-399` for the interruption,
`:414-415` for the task — **the ids are hard-coded there; cite the lines, never re-type the
values**). **Never answer the canary and never approve the witness** (constraint 11). Record the
counts and statuses as the baseline the 裁-160 as-run line at step 4 refers to.

**3b.4 — the fixture-estate census (constraint 13).**
`select id, name from clara.firms order by name;` and `select count(*) from clara.clients;` — the
pre-reset roster the step-16 line 7 re-run is compared against.

**3b.5 — the standing RS trial-balance pin.** Read `trial_balance_as_of` for the RS pin
(**3,396,500 = 3,396,500**, the checklist's own figure) as a second operand for step 16 line 7.

`[ ]` 3b.1 frontier read.  as run: ____________ / ____________
`[ ]` 3b.2 **evaluator roster read and WRITTEN DOWN HERE** — this is the input to step 8.
as run (name · version · deployed, every row):
```
____________________________________________________________________
____________________________________________________________________
____________________________________________________________________
```
as run: **rows with `deployed = true` → the step-8 act list**: _______________________
`[ ]` 3b.3 canary rows counted read-only, never answered.  as run: ____________
`[ ]` 3b.4 firm/client census.  as run: ____________
`[ ]` 3b.5 RS trial balance.  as run: ____________

---

### Step 4 · **[L, per 裁-162]** RESET — `DROP SCHEMA clara CASCADE`, scoped

```sh
fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" \
  | CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="<the exact string from step 1>" \
    node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/reset.mjs
```

> **Authority (裁-162).** `docs/ops/DR.md:397-402` classifies this as owner-run. Constraint 14 /
> ADR-0075 supersedes that classifier **for this ceremony only**, scoped to test data, expiring at
> beta live. The crown-jewel items stay `[O]`.

**PRE-READ FIRST — this is what distinguishes a reset from a wrong-target no-op.**
`select to_regnamespace('clara') is not null as present;` → **true**, and step 3b.1's count →
**148**. Without it, a stale target string makes `reset.mjs:63-68` short-circuit with *"schema
\"clara\" does not exist — nothing to drop"* and **exit 0**.

The script preflights `pg_depend` and **ABORTS** if any object outside `clara` would be cascaded
(`reset.mjs:20-53,71-76`) — that preflight is what keeps constraint 15 intact.

**Reads:**
1. the script's own line: `reset: dropped schema "clara" · target <label>`;
2. `select to_regnamespace('clara') is null as gone;` → **true**;
3. **constraint 15 proven by a READ, not by the script's scope claim:**
   `select nspname from pg_namespace where nspname in ('workflow','workflow_drizzle','graphile_worker','spike') order by 1;`
   → **all four still present**.

**裁-160 — the as-run line, written HERE and not later:**

> *The parked S4-V2 canary's clara-side rows (`clara.agent_interruptions` and `clara.agent_tasks`,
> the ids hard-coded at `packages/db/scripts/dr-verify-checks.mjs:398-399` and `:414-415`) went with
> `DROP SCHEMA clara CASCADE`. Accepted by the owner's ruling 裁-160. The
> `workflow.workflow_runs` row **survives** under constraint 15 and is recorded as an **orphaned
> durable run**. Constraint 11 is untouched: deleting test rows is neither answering the canary nor
> approving the witness. No preserve attempt was made — that would be an un-drilled write path
> designed around `scripts/hooks/pinned-ids-guard.mjs`. Consequence: the DR STRICT `4.9` parity
> probe loses its subject; a replacement is named at the close under 裁-172.*

`[ ]` Pre-read: `clara` PRESENT and 148 rows.  as run: ____________
`[ ]` The drop ran; the script's own line captured.  as run: ____________
`[ ]` `to_regnamespace('clara') is null` → true.  as run: ____________
`[ ]` **Constraint 15**: all four other schemas present.  as run: ____________
`[ ]` The 裁-160 line above is written into the as-run verbatim.  as run: ____________

---

### Step 4b · **[O]** (or **[L]** with a Management-API token env-to-env) — **THE PURGES** (裁-161)

> **Order is law:** backup (2) → restore-proof (2b) → reset (4) → **4b** → migrate (5). **Never
> before the restore-proof.**
>
> **Owner's ground, verbatim on the record:** 「都清，沒有real user now ， all test user and 資料now」.
> No real user exists; every account and every uploaded byte is test data (constraint 14 /
> ADR-0075).
>
> **Dissent on the record (裁-161).** The lead recommended purging the auth users and **leaving**
> the Storage objects. The owner ruled against that half. The consequence, stated once and
> accepted: the Storage delete is an **irreversible act on a vendor surface with no repo runbook**,
> done once, at the worst hour. **Storage bytes are NOT in the Postgres dump**
> (`docs/ops/DR-full-drill.md:149-157`) — this is accepted as unrecoverable test data.

**NOT IN REPO.** There is **no `auth.users` purge step and no Storage object purge step anywhere**
in `docs/ops/wave-g-setup-checklist.md` or the DR docs — only the reported-not-measured deletion of
one test user (checklist `:64-71`) and the DR **re-provision** path (`DR-full-drill.md` §4). The
click paths and the Admin-API shapes below are therefore **read on screen**, not quoted from the
repo. Where the owner looks:
- **auth users** → Supabase Dashboard → **Authentication → Users**; or the Admin API under the
  owner's key.
- **Storage objects** → Supabase Dashboard → **Storage** → each bucket. The repo names **`firm-docs`**
  (`DR-full-drill.md` §4); **the full bucket list is read on screen**, not assumed from the repo.

**4b.1 — AUTH PURGE.** Delete **ALL** rows in `auth.users` for the project.

| | value |
|---|---|
| count **before** | `___________` |
| count **after** | **`0`** — `___________` |
| actor | `[O]` dashboard · `[L]` Management/Admin API token env-to-env — **circle one** |
| method used | `___________________________________________` |

**4b.2 — STORAGE PURGE.** Delete the **OBJECTS** in every bucket. **Never the bucket itself. Never
its policies** — bucket RLS and policies are a *mechanism under test*, and constraint 14's operative
clause forbids weakening a mechanism for testing convenience.

| bucket | objects before | objects after | `[ ]` |
|---|---|---|---|
| `firm-docs` | `_______` | **`0`** | `[ ]` |
| `______________` | `_______` | **`0`** | `[ ]` |
| `______________` | `_______` | **`0`** | `[ ]` |

`[ ]` **Buckets and policies UNTOUCHED** — proven by a read of the bucket list and the policy list
after the purge, not by the absence of an intent to touch them.
as run: ___________________________________________________________________

`[ ]` The owner's login is **re-created by the self-serve walk at step 13** (裁-159/161), so the
walk address may be the owner's normal address. Confirmed with the owner.
as run: ___________________________________________________________________

`[ ]` DR probe `4.10`'s baseline is now **zero**, not an orphan count. Recorded.
as run: ___________________________________________________________________

---

### Step 5 · **[L]** MIGRATE — the WHOLE chain, `0001` → `0164`

```sh
… | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs
```

**Why the whole chain, stated so the read is not mistaken for a defect.** `clara.schema_migrations`
lives **inside** the dropped schema (`reset.mjs:1` — *"drops the `clara` schema (schema_migrations +
