# Riders wave 3 — integration gates, worker A (database, chain, runtime, static)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w3`
**Head at start** `ba54ad2bdc7f858ddd2df3cc4e0009077dfd27f8`
**Head at finish** `26ada61319f02f4c01d3e1ad121eeaa2164c1f41` (four `fix(integration)` commits of
mine, plus one of worker B's)
**Host** Windows 11 + WSL PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg26.04+2) · Node v22.23.2

Worker B ran the web suites in the same worktree throughout. Nothing under `apps/web` was read for
change or written by me; every `git add` named an explicit path; `git add -A` was never used.

---

## 1. `pnpm install --frozen-lockfile`

```
cd C:\Users\zhant\Desktop\clara-wt\int2
pnpm install --frozen-lockfile
```

**13:49:33Z → 13:49:37Z, 3.8 s.** `Lockfile is up to date, resolution step is skipped · Already up
to date · Done in 3.4s using pnpm v10.33.0`, 4 workspace projects. Lane 09's `@shadcn/react@^0.3.1`
is resolved in the lockfile, so the lockfile and `apps/web/package.json` agree — no regeneration, no
STOP. (The two ignored build scripts, `@parcel/watcher` and `workerd`, are the rig's standing state,
not a wave-3 change.)

---

## 2. The fresh disposable cluster

```
sudo pg_createcluster 17 rigw3 --port=55770
sudo cp /etc/postgresql/17/rl01/pg_hba.conf      /etc/postgresql/17/rigw3/pg_hba.conf
sudo cp /etc/postgresql/17/rl01/conf.d/rig.conf  /etc/postgresql/17/rigw3/conf.d/rig.conf
sudo pg_ctlcluster 17 rigw3 start
```

**13:50:03Z → 13:50:09Z, 6 s.** Online on 127.0.0.1:55770, PostgreSQL 17.11, `clara%` role count
**0** (genuinely fresh). `pg_hba.conf` (six trust lines) and `conf.d/rig.conf`
(`listen_addresses = '127.0.0.1'`, `max_connections = 200`) copied verbatim from `rl01`.
**Kept**, as instructed.

A SECOND fresh disposable cluster was created for the hosted baseline — `rigw3h` on **55771**, same
recipe, 13:58:22Z → 13:58:29Z. §4 explains why, with the measurement that forced it. Also kept.

No cluster in the forbidden set (55720, 55721, 55730, 55741–55750, 55760) was touched at any point;
`pg_lsclusters` shows all of them still online.

---

## 3. The from-scratch chain — `clara_w3` on 55770

```
PGHOST=127.0.0.1 PGPORT=55770 PGUSER=postgres PGDATABASE=clara_w3 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
createdb clara_w3
cd packages/db && node scripts/migrate.mjs
pnpm db:seed
```

**13:50:47Z → 13:54:47Z, 4 m 0.5 s.** Exit 0.

```
migrate: 288 new migration(s) applied · 288 total · target 127.0.0.1:55770/clara_w3
```

`clara.schema_migrations` reads **count = 288, max = `0293_fa_arrears_judgement_scope`**. The
cluster's `clara%` role count is **18** afterwards (14 at 0154's pin, +4 from 0160/0163), exactly as
`packages/db/README.md`'s #867 section predicts. Seed: `0001_smoke_seed.sql`, `0002_core_seed.sql`,
1.5 s.

Roster checked before applying: `packages/db/migrations` holds **288** `.sql` files, and the first
four characters of every filename are unique across all 288 — **no duplicate number anywhere**.
`packages/db/package.json`'s `test` script carries **105** `--import` gate tokens.

### 3.1 The pin the merger could not check statically — 0284 behind 0283

This is the one claim `wave3-merge.md` handed me: `ba54ad2bd` made `0284_accrual_correction`'s pin on
`clara.revise_accounting_plan` **bimodal** (accepting the pre-0283 image `87c9f1e9…` *or* 0283's own
recut output `8a6e69ef…`), and only a real chain can say which arm fires.

**It fires on the post-0283 arm, and 0284 prints clean.** Read off the chain log, in order:

```
applied 0282_retire_adjustment_template_doors · backend pid 696907
[notice] #929 prestate: clean -- FRESH APPLY (0281's two-argument output is live) ; clara._plan_overlap_warning
         and its three callers are all at the bodies this branch expects.
[notice] #929 tail: OK -- … clara.create_accounting_plan / clara.revise_accounting_plan /
         clara._accrual_plan_core each take the client rung 203005004 above any plan row lock …
applied 0283_retire_plan_overlap_template_arm · backend pid 696908
[notice] #936 prestate: clean -- clara.accrual_adjustments carries corrects_accrual_id,
         corrected_by_accrual_id and uq_accrual_adjustments_corrects (0222); the twelve bodies this
         door nests or calls are byte-identical to their measured pre-images.
[notice] #936 tail: OK -- … the nested (never recut) clara.revise_accounting_plan … the twelve
         bodies it depends on hash byte-identically to their measured pre-images …
applied 0284_accrual_correction · backend pid 696910
```

and the independent measurement that says WHICH value the bimodal pin accepted:

```sql
select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc p join pg_namespace n
 on n.oid = p.pronamespace where n.nspname='clara' and p.proname='revise_accounting_plan';
-- 8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886
```

`8a6e69ef…` is 0283's post-image, not `87c9f1e9…`. So 0284's prestate and tail both took the
`c_revise_after_0283` branch (`0284_accrual_correction.sql:173` and `:482`) and passed. The
integration fix is correct on a real chain — **claim confirmed, nothing to redo.** No pin failure
anywhere in the chain, so the "re-derive from both intents and re-chain" arm of my instructions never
had to run.

### 3.2 The renumbered pair, and lane 07 below lane 08

Both checks the merger asked for hold on the real chain, read off the log's apply order:

```
applied 0287_client_birth_wall    (log line 1156)     applied 0290_document_regions_… (line 1171)
applied 0288_seeding_lane_retired (line 1163)         applied 0291_bank_statement_…   (line 1180)
applied 0289_merge_alias_lane     (line 1166)         applied 0292_fa_policy_…        (line 1183)
                                                      applied 0293_fa_arrears_…       (line 1186)
```

- **0287–0289 apply BELOW 0290**, as `migrate.mjs`'s numeric sort requires. Lane 07's numbers sitting
  under lane 08's is fine on a fresh chain, exactly as the merge record predicted.
- **0292 and 0293 apply AFTER 0291, pins intact.** Their notices are the interesting part, because
  both were measured on `clara_l04` after 0277–0279 only and now apply after everything:

  ```
  [notice] #932 fix-round prestate: clean (FIRST apply) -- both birth sites are at their measured
           0277 post-images, the four bodies this file does NOT touch are unmoved, and the birth's
           catalog comment is 0278's own text byte for byte.
  [notice] #975 fix-round prestate: clean (FIRST apply) -- both recut bodies are at their measured
           0279 post-images and the nine bodies this file does NOT touch, including the arrears
           arithmetic itself, are unmoved.
  ```

  Both tails green. The merger's static "intersection with 0280–0291 is EMPTY" argument holds on a
  real chain: eighteen pinned bodies, none moved by the twelve files that now sit between.

### 3.3 Every other wave-3 prestate, in one place

All twenty-one printed a clean prestate and a green tail on the from-scratch chain. The ones worth
reading:

| file | prestate notice (abridged) |
|---|---|
| 0273 #921 | `FIRST APPLY — propose/sign/decline are all still granted to clara_authenticated; revoking now.` |
| 0274 #982 | `clean -- 0225 is applied, clara._trade_invoice_resolve_party exists exactly once at its pinned pre-image …` |
| 0275 #1007 | `clean -- 0225 and 0274 are applied, the party resolver and the admission door are at their pinned shas …` |
| 0276 #1002 | `clean -- … the four RLS-helper bodies plus clara.propose_client_cash_accounts are all at their measured (live) bodies.` |
| 0277 #932 | `clean -- … every RECUT body is at its measured pre-image …` |
| 0278 #882 | `OK -- FIRST apply. … the birth's first 842 characters still hash to 0277's measured pre-image.` |
| 0279 #975 | `clean -- … clara._fa_run_period_core is at its measured pre-image …` |
| 0280 #908 | `clean -- clara._assert_plan_schedule is at its measured post-0223 pre-image (e3640588…) …` |
| 0281 #909 | `clean -- clara._plan_overlap_warning is at its measured pre-0281 pre-image (f550d0b3…) …` |
| 0282 #927 | `clean -- … and zero clara.adjustment_templates rows are non-retired.` — see §5 |
| 0283 #929 | `clean -- FRESH APPLY (0281's two-argument output is live) …` |
| 0284 #936 | `clean -- … the twelve bodies this door nests or calls are byte-identical …` — §3.1 |
| 0285 #919 | `clean (FIRST) -- … both at the SAME one of the two admitted pre-images …` (the bimodal pair) |
| 0286 #986 | `clean -- … the fourteen bodies this file depends on (the pinned parse door first) …` |
| 0287 #899 | `FIRST apply -- … begin_client_onboarding is at its pre-0287 pin (FIRST) …` |
| 0288 #1012 | `0 seeding batch(es) and 0 proposal(s) exist and must survive this file untouched.` + `sectionD prestate: OK -- 7 prior_gl rows carry browser_entrance …, the registry publishes version 3 uniformly across 240 rows …` |
| 0289 #889 | `tail (1/2): OK (branch first_apply) -- … post-splice prosrc sha ac31da36…` |
| 0290 #857 | `clara.document_regions holds ZERO rows -- a lawful first-apply state` + `clean (redo=f)` — see §5 |
| 0291 #1019/#1020 | `clean (redo=f) -- … clara.bank_statement_lines holds 0 row(s)` |
| 0292 #932 fix | `clean (FIRST apply)` — §3.2 |
| 0293 #975 fix | `clean (FIRST apply)` — §3.2 |

The six unconditional op-plumbing pins the merge record flagged (`_audit`, `_finish_op`, `_hash`,
`_human_ctx`, `_reserve_op` across 0284/0286/0287, and `role_rank` across 0276/0284) all passed
silently, which is what agreement looks like: every one of those files' prestates printed `clean`.

Full log: `…/scratchpad/w3gate/chain-w3.log` (1,191 lines).

---

## 4. The upgrade path — `clara_w3_hosted` → `clara_w3_upg`

### 4.1 Why the hosted pair sits on 55771, not 55770

The work order said to build the hosted baseline as a second from-scratch chain on 55770 under the
#867 recipe. **Measured, that is not possible while `clara_w3` exists**, and I did not want to
destroy the from-scratch chain steps 5–7 are run against:

```
cd packages/db && PGPORT=55770 PGDATABASE=clara_w3 node scripts/role-census-reset.mjs
0154_binding_proposal_pr_1.sql pins the cluster-wide clara% role count at 14.
This cluster currently carries 18 clara% role(s).
- clara_stripe_webhook      … : BLOCKED by clara_w3 (3 privilege deps)
- clara_stripe_webhook_login… : exists, no shared dependents -- safe to drop
- clara_auth_wall           … : BLOCKED by clara_w3 (3 privilege deps)
- clara_auth_wall_login     … : exists, no shared dependents -- safe to drop
```

`--apply` never does a partial drop, so with `clara_w3` alive it refuses outright — the README says
so by design ("the two base roles stay blocked on any rig that still has a live checkout-gate lane").
Its own precondition is that the old database is **gone** first.

`packages/db/README.md`'s §"From-scratch reapply on a reused cluster (#867)" names the remedy for
exactly this case, and it is not the role reset:

> **Preferred:** one from-scratch chain per cluster (a fresh disposable Postgres cluster, or a fresh
> container/instance).

So I did that: a second fresh disposable cluster, `rigw3h` on **55771**, built the same way from
`rl01`'s config. Nothing was dropped, no role was touched, and `clara_w3` survived intact.
**The only deviation from the work order is the port**, and it is the README's own preferred branch.
The release-preparation worker should read the two baselines on **55771**, not 55770.

### 4.2 The hosted frontier

```
# migrations-0272/ = a copy of packages/db/migrations truncated to 0001..0272  → 267 files
createdb -p 55771 clara_w3_hosted
CLARA_MIGRATIONS_DIR=<…>/migrations-0272 node scripts/migrate.mjs      # 13:59:07Z → 14:02:49Z, 3m42s
pnpm db:seed                                                           # 14:03:17Z → 14:03:19Z
```

```
migrate: 267 new migration(s) applied · 267 total · target 127.0.0.1:55771/clara_w3_hosted
```

Ledger reads **267 / `0272_document_capability_wall_completion`** — the hosted frontier exactly.
Seeded with the same two seed files.

### 4.3 The clone and the upgrade

```
psql -Atc "select count(*) from pg_stat_activity where datname='clara_w3_hosted'"   → 0
createdb -p 55771 -T clara_w3_hosted clara_w3_upg      # clone at 267 / 0272, seeded
cd packages/db && node scripts/migrate.mjs             # FULL directory
```

**14:03:27Z → 14:03:35Z, 8.5 s.** Exit 0. **All 21 applied**, 0273 → 0293 in order, on a database
that already carried seeded rows:

```
applied 0273 … 0274 … 0275 … 0276 … 0277 … 0278 … 0279 … 0280 … 0281 … 0282 … 0283 …
        0284 … 0285 … 0286 … 0287 … 0288 … 0289 … 0290 … 0291 … 0292 … 0293
```

Every prestate `clean`/`OK` and every tail green — the same notice set as §3.3, including 0284's,
whose bimodal arm resolved the same way here (the sha check in §4.4 proves it). 0288's sectionD
again re-published the registry across its 240 live rows and its tail read them back.

### 4.4 The spot check: lanes 05 and 07 recut bodies, `clara_w3` vs `clara_w3_upg`

Sixteen bodies — every whole-body recut or splice target lane 05 (0280–0283) and lane 07 (0287–0289)
own — dumped as `oid::regprocedure` + `sha256(prosrc)` from both databases and diffed.
**`diff` is empty: byte-identical, all sixteen.**

| body | sha256(prosrc), identical on both |
|---|---|
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5` |
| `clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)` | `1aca2dc26d5a9d0ac5ead59144561eb3292feb9df520f45982952604a9666b40` |
| `clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)` | `5d8a7a295f8b33d62b719ee068b2ce507d3359d6a361abcd80cfe87613335d08` |
| `clara._plan_overlap_warning(uuid,jsonb,uuid)` | `c2566349405844d14c94ba57836ee9256878001f744ad627b0337ae5b8caf7dc` |
| `clara.begin_client_onboarding(text,text)` | `9edd80ef8fa66f855b1ed7cb8667ee60dafb80c302cf638b3dd62fdb391602a7` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424` |
| `clara.create_seeding_batch(uuid,uuid,jsonb,text)` | `14d2d3aa4b4c9c3641b83a26e558528dc4e215d59685b651453d0587e535d094` |
| `clara.decline_seeding_proposal(uuid,text,text)` | `907a84f9cb1ea5ef98f45ffe6ed81446e27e1d23e4a5b7e9a342a9c0d80caacd` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69` |
| `clara.merge_counterparties(uuid,uuid,uuid,text,text)` | `ac31da36065caa5f3682d7792d6bad2c49ffd06665adfef6e343f64107f228e7` |
| `clara.open_client_onboarding(text,text,jsonb,uuid)` | `0a169df316c23a5b33e66e0b1c8512ed479d4cda33f10c4c10725afa8012ec79` |
| `clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)` | `e009403954557a5d5326bc6a5774f8d85051aadc8cf315d738609b6fdff203ad` |
| `clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)` | `8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886` |
| `clara.run_adjustment_manual(uuid,uuid,date,date,text)` | `938d8d5e7a28a1b693e0de541e849dc5d237d353efae92e05e249ff500d8247e` |
| `clara.sign_adjustment_template(uuid,uuid,text)` | `a63ba9462bd87950eca56078c582e92af3c81fb88510b3d86f9f18eb0808cf91` |
| `clara.tick_seeding_proposal(uuid,text)` | `6ff822d2d080b43c7844914a58e2bbe58349dd5bab007d90c7099cd63d1d9126` |

`clara.merge_counterparties` matches 0289's own post-splice notice (`ac31da36…`), and
`clara.revise_accounting_plan` reads 0283's output on BOTH paths — so the bimodal pin resolved the
same way from-scratch and on the upgrade. **The two paths converge on the same estate.**

---

## 5. Data-dependent branches in the 21 files

Method, in two passes. **(a)** every one of the 21 files was scanned for a top-level DML — an
`insert into` / `update` / `delete from` on a `clara.` relation OUTSIDE every dollar-quoted body, i.e.
a bare backfill statement the runner would execute directly. **There is none, in any of the 21
files.** So no migration in this wave rewrites estate rows except from inside a DO block.
**(b)** every file was then parsed for its TOP-LEVEL `do $tag$ … $tag$;` blocks (the prestate/tail
blocks the runner executes), and each block's comment-stripped body searched for a reference to an
estate TABLE (as opposed to `pg_proc`/`pg_index`/prosrc text, which is what most of these blocks
read). Blocks and their tables are listed below; only four blocks turned out to branch on rows at
all.

| file | block | what it reads | verdict |
|---|---|---|---|
| 0273, 0274, 0275, 0276, 0278, 0279, 0280, 0281, 0284, 0285, 0293 | — | **no estate table in any top-level DO block** — catalog, ACL and prosrc only | cannot fail on data |
| 0277, 0292 | tails | `clara.fa_account_depreciation_policies`, `clara.fixed_asset…` appear only as **prosrc marker strings** inside the recut bodies | cannot fail on data |
| 0283 | tail | `clara.accounting_plans` only as a prosrc marker | cannot fail on data |
| 0286 | tail | `clara.opening_tb_targets` — column count (15), both uniques, constraints: **catalog census** | cannot fail on data |
| 0287 | tail | `clara.client_identifiers` only inside `position('insert into clara.client_identifiers' in v_posture)` — prosrc | cannot fail on data |
| 0289 | s1/s2/s3 | `clara.counterparty_aliases` as prosrc text; s3 is a closed-world census over `pg_proc` | cannot fail on data |
| 0291 | prestate | `select count(*) into v_rows from clara.bank_statement_lines` — **reported in a notice, never branched on** | no branch (see below) |
| **0282** | prestate | `count(*) from clara.adjustment_templates where status <> 'retired'` → **raises CLR10 when non-zero** | **EXERCISED — §5.1** |
| **0288** | sectionD (421–610) | reads and REWRITES live `clara.document_capabilities` rows: 7 `prior_gl` rows carrying `browser_entrance`, 240 rows at one uniform `registry_version`, every high-water mark in lockstep | **exercised by construction** — these rows exist on every database, planted by earlier migrations; the branch ran on all four chains, `sectionD tail: OK` each time |
| 0288 | prestate / tail | seeding batch + proposal counts | **notice only** — the prestate reports them ("must survive this file untouched") and the tail reports them again ("% seeding batch(es) survive, none deleted"); neither compares, so there is no branch to enter. Its BEHAVIOURAL probe plants its own user/firm/client/document/batch/proposal inside a forced-rollback subtransaction, so it runs on every database regardless of rows |
| **0290** | prestate + tail | `clara.document_regions` — the stored-`field_path` census, the zero-row notice, and the tail's **PROBE MODE** fork | **EXERCISED — §5.2** |

### 5.1 0282's live-template guard — entered, and it is a release precondition

`0282_retire_adjustment_template_doors.sql:190` refuses to retire the propose/sign/run doors while
any `clara.adjustment_templates` row is not `retired`. On every fresh chain it passes **vacuously**
(zero rows). Entered on purpose:

```
createdb -p 55771 -T clara_w3_hosted clara_w3_tmpl          # a 0272 clone, seeded
node tests/zz-w3gate-template.tmp.mjs                       # prepaidScene + proposeTemplate
  → {"template":"72b1e874-dd9a-418f-95ce-78a0e7795136","status":"proposed"}   nonRetired = 1
node scripts/migrate.mjs                                    # FULL directory
```

The template was minted **through the real door** — `clara.propose_adjustment_template`, called as a
human through `humanQuery` by `packages/db/tests/f-a4-pr2a-fixtures.mjs`'s own `proposeTemplate`,
on a scene built by `prepaidScene` (a world, a closeable FY, two accounts, a filed document, an
approved journal entry). Nothing was planted by hand.

The chain then applied 0273–0281 and **stopped**, exit 1:

```
applied 0273 … 0281
migrate: FAIL — migration 0282_retire_adjustment_template_doors failed and was rolled back:
  #927 prestate: 1 clara.adjustment_templates row(s) are not retired -- this file refuses to close
  propose/sign/run_adjustment_manual while a proposed or live template could still be orphaned;
  retire every such row (clara.retire_adjustment_template, still open) before applying
```

The guard fires, names its own remedy, and rolls back cleanly. I then drove the remedy through the
real door too — `clara.retire_adjustment_template(client, template, reason, op_key)` as the proposing
human — and re-ran:

```
{"retired":{"status":"retired","template_id":"72b1e874-…"},"nonRetiredNow":0}
node scripts/migrate.mjs
  → migrate: 12 new migration(s) applied · 288 total       # 0282..0293, prestates all clean
```

**For the release worker, this is the one precondition in the wave that hosted data can trip.**
Before the upgrade, run

```sql
select id, client_id, status, name from clara.adjustment_templates where status <> 'retired';
```

on the hosted database. If it returns rows, retire each through `clara.retire_adjustment_template`
(still granted at the hosted frontier) BEFORE migrating; otherwise the run stops at 0282 with
0273–0281 applied. An interrupted run is resumable — proven above: re-running `migrate.mjs` after the
remedy picked up at 0282 and finished the remaining twelve, with 0282's prestate reading
`a fresh apply`.

### 5.2 0290's populated branch — entered

`0290` has two row-dependent arms: a prestate census that refuses when a **stored** `field_path`
would fail the new grammar, and a tail **PROBE MODE** fork — raw inserts through the installed CHECK
when the table has rows, the expression evaluated directly when it is empty. Every chain above ran
the EMPTY arm. Entered the populated one:

```
createdb -p 55771 -T clara_w3_hosted clara_w3_probe         # a 0272 clone, seeded
CLARA_MIGRATIONS_DIR=<…>/migrations-0289 node scripts/migrate.mjs   # 17 applied → 284 / 0289
node tests/zz-w3gate-populate.tmp.mjs                       # the estate's own doors
  → {"regions":8,"nonNullFieldPaths":7}
node scripts/migrate.mjs                                    # FULL directory → 0290..0293
```

The eight regions sit behind a real firm, a real client, a document filed through
`clara._seed_verified_document` (`packages/db/tests/rig-docs-fixtures.mjs`'s `seedVerifiedDocument`,
the governed fixture door) and a real `clara.document_extractions` row — the same world
`document-regions-field-path-check.test.mjs` builds. Seven carry conforming paths across five of the
registered namespaces (`invoice.total`, `statement.line`, `opening_tb.line`, `prior_gl.line`,
`pages.0.tables.1.rows.2`, `myinvois.uuid`, `sheets.0.paragraphs.3`) and one is NULL.

Both arms then ran non-vacuously:

```
[notice] drfp prestate: clean (redo=f) -- … and all 8 stored field_path value(s) already conform.
[notice] drfp tail: OK -- … PROBE MODE: raw insert (clara.document_regions is populated) -- in it,
         an unregistered-namespace path is refused with the grammar's own CLR10 while a NULL path
         and a well-formed path both pass, and clara.document_regions holds the same 8 row(s)
         before and after.
```

`select count(*) from clara.document_regions` reads **8** after the migration — the rollback-only
probe wrote nothing, as its own sentinel SQLSTATE intends. 0291–0293 then applied on the same
populated database.

### 5.3 The one branch I did not enter, and why it cannot fail

`0291`'s `select count(*) into v_rows from clara.bank_statement_lines` feeds **only** the prestate
notice (`…holds % row(s) (the live proof runs in this ticket's own test battery, not against
these)`). There is no `if` on it anywhere in the file, so there is no second arm to enter: the file
behaves identically at 0 rows and at 10⁶. Its live proof is
`packages/db/tests/bank-statement-line-citation.test.mjs`, which ran green in §6 against a database
whose statement lines it seeds itself.

---

## 6. The whole `packages/db` suite — the 105-entry gate chain

```
cd packages/db
PGHOST=127.0.0.1 PGPORT=55770 PGUSER=postgres PGDATABASE=clara_w3 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 pnpm test
# = node --test --test-concurrency=1 <105 × --import ./tests/*-preintegration-gate.mjs> "tests/**/*.test.mjs"
```

**14:04:27Z → 14:42:46Z, 38 m 19 s.** Exit 1.

| | |
|---|---|
| tests | **5,514** |
| pass | **5,412** |
| fail | **7** |
| skipped | 95 |
| test files on disk | 504 (`tests/**/*.test.mjs`) |
| gate chain | **105** `--import` tokens, none twice, read off `packages/db/package.json`'s `test` script |

> Observation, not a red and not mine to fix: `packages/db/tests/README.md:23` still says "the 29
> `--import ./tests/*-preintegration-gate.mjs` flags". That sentence is **byte-identical on
> `d96a33f31`** (checked with `git show`), so it is pre-existing prose drift, not a wave-3
> regression, and nothing enforces it. Worth a one-line follow-up some time.

Wave 3 brought 42 new files into `packages/db/tests` (21 of them the new preintegration gates,
which is where 84 → 105 comes from) and touched 64 more.

**The 95 skips are all legitimate and none is a wave-3 gate declining.** By reason: 30 ×
"destructive (drops schema clara); set `CLARA_RIG_ALLOW_RESET=…`" — the flag RIG.md forbids; 55 ×
the F-A2 PR-3 retired rule-posting lane ("…retired with F-A2 PR-3 — this cell's subject no longer
exists"); the rest are named structural declines (an unreachable empty-set arm, an absent
onboarding/archived fixture client, "F-A6 v2 has not merged", one deferred literal). No skip cites a
`CLARA_ALLOW_MISSING_*` escape, which is what a wave-3 migration failing to apply would look like.

### The 7 reds, classified

All seven are **(c) INTEGRATION collisions** — each lane green alone, red together — and all seven
are fixed by RE-MEASURING against the merged tree. **None is (a) a known Windows-only red, none is
(b) a flake, and none is (d) a defect inside a lane's product code.** Each fix has its own commit.

#### Collision 1 — `ci-12`, the `clara.client_identifiers` writer census (1 cell)

`tests/client-identifiers-unique.test.mjs:578`, census owned by **#435** (裁-41, migration 0155).
It is a closed-world roster of every clara function whose prosrc names a DML against
`clara.client_identifiers`, each required to carry the narrow `unique_violation` re-raise guard for
`uq_client_identifiers_client_kind_value`. Lane 07's **#899** (0287) mints a third such body,
`clara._client_birth_core`:

```
exactly two clara functions name a DML against clara.client_identifiers — a third needs the
unique_violation map before it merges
+   'clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)'
```

**Fix `ecfec7967`** — `fix(integration): #899 vs #435 — the client_identifiers writer census
re-measured for the birth core`. The roster names all three; the guard requirement and both
per-writer guard COUNTS are unchanged for the two writers that can reach a pre-existing key; the
birth core is exempted for a reason read off the body — it MINTS its client
(`insert into clara.clients … returning id into v_client`) and only then writes the identifier, so
the index's key is necessarily fresh and 23505 on THIS index is unreachable from it (the
cross-CLIENT duplicate is walled one level up, by `clara.client_identity_candidates` under the
family advisory lock, with its own typed CLR10). Two new cells pin the exemption instead of
asserting it in prose: the birth core must carry ZERO guard lines, and its live prosrc must still
mint before it writes. **Vacuity control:** pointing the premise cell at a table name the body does
not contain reds it with its own sentence (`# pass 16 # fail 1`); file restored byte-identically.
**17/17 pass** under the full gate chain afterwards.

#### Collision 2 — the `#986` opening-reread battery vs `#899`'s name-family wall (4 cells)

`tests/opening-source-reread.test.mjs` — `p986.reread.no_regression`, `p986.reread.refresh_walls`,
`p986.reread.fact_echo`, `p986.roles.runtime_only`, all four with the wall's own sentence and no
assertion of their own reached:

```
CLR10 'this name matches 2 existing clients or counterparties in your firm; decide which business
this is before another record is created'
  at beginOnboarding (tests/wave-b/wb-helpers.mjs:640) → onboardingClient (wb-fixtures.mjs:103)
  → tiedScene (opening-source-reread.test.mjs:108)
```

Lane 06's battery shares ONE firm across every cell and named every fixture client
`p986_<tag>_<opk>`; `clara.name_family_token` (0103) is the FIRST alphanumeric token, so all of them
carried the family `p986`, and `clara._client_birth_core` refuses outright at arity ≥ 2 (0287:256-259,
`p_require_ack_at_one` does not enter that arm). The first two cells passed because they were the
first two clients of the family.

**Fix `6dc0fd18b`** — `fix(integration): #986 vs #899 — the reread battery's fixture names leave one
name family`. The unique part leads now (`p986<uuid8>_<tag>_<opk>`), which is the same remedy #899
already applied twice in its own lane (`wave-b/wb-fixtures.mjs`'s `onboardingClient()` default and
`opening-ledger-source.test.mjs`'s `tiedScene`, both already carrying that comment). No assertion,
threshold, scene or door call moved. **6/6 pass** afterwards under the full gate chain.

#### Collision 3 — lane 04's three new doors vs arm (D)'s bare-clock roster (2 cells)

`tests/x42b2-r7-s5-clock.test.mjs:140` (`x42.r7.s5c.5`) and `tests/x42b2-s5c-clock.test.mjs:369`
(`x42.s5c.6`), both consuming `x42-s5-helpers.mjs`'s `s5BareTokenRoster()` — #182 / migration 0042's
S5.25 arm (D), a closed-world roster compared EXACTLY against a live catalog census. Live read 280
names, the roster built 277, and the difference was exactly lane 04's three new doors:

```
+ record_fa_arrears_resolution      (#975, 0279)
+ retire_fa_depreciation_policy     (#932, 0277)
+ set_fa_depreciation_policy        (#932, 0277)
```

No lane could have seen it: this battery reads the WHOLE catalog, and a lane runs only the files it
touched.

**The adjudication first, because it is the part that matters.** Arm (D) catches a bare clock token,
and a bare token is only a defect when the body derives a DATE from it. All three stamp TIMESTAMPTZ
and nothing else — measured on the live catalog, not read off the files:
`information_schema.columns` on `clara.fa_account_depreciation_policies` and
`clara.fa_arrears_resolutions` gives `retired_at`, `effective_from`, `superseded_at`, `decided_at`,
`created_at` all `timestamp with time zone`, so there is no assignment cast to a date column
anywhere in them. **They belong in the roster, not in a fix** — the same adjudication the 0046 block
beside them records.

**Fix `06060f362`** — `fix(integration): #932/#975 vs #182 — lane 04's three new doors join arm (D)'s
clock roster`. Two FORWARD-gated cohorts in the house shape, each on its own migration STEM
(`fa_default_depreciation_policy$`, `fa_closed_year_arrears$`), never a number — doubly right here,
since 0277's and 0279's fix-round siblings were RENUMBERED to 0292/0293 at merge. 0292 pins both
policy bodies as unmoved; 0293 recuts the arrears door and the token survives the recut.

Evidence:

- both cells pass on `clara_w3` (4/4 across the two files, full gate chain).
- **frontier-exact**, by calling `s5BareTokenRoster` against three live databases:
  `clara_w3_hosted` (267 / 0272) → roster **281**, none of the three present; `clara_w3` and
  `clara_w3_probe` (288 / 0293) → roster **280**, all three present.
- **vacuity control**: emptying `FA_ARREARS_RESOLUTION_0279_CLOCK_NAMES` reds `x42.s5c.6` with
  "arm (D)'s live roster drifted from the round-8 M4 measurement" (`# pass 1 # fail 1`); the file was
  restored byte-identically.

No migration was edited by any of the three fixes, so no chain had to be rebuilt.

### A latent fragility, reported rather than touched

`tests/qd6-close-seal-wall.test.mjs:86` names its onboarding clients `qd6_<tag>_<opk>` and calls
`deferredOpeningClient` **twice** in one firm. Two is the last safe number: the second birth sees
arity 1, and `begin_client_onboarding` passes `p_require_ack_at_one=false`, so it passes. A THIRD
call would red exactly as `p986` did. It is green today, so I left it alone; a later ticket adding a
third scene there should expect it.

### 6.1 Confirmation re-run — the whole suite again, on a CLEAN 288-file database

The first run measured `clara_w3`; a second run of the same suite on the same database would have
measured a database the first run had already written to. So the confirmation ran on a fresh clone
of the upgrade twin instead — `createdb -T clara_w3_upg clara_w3_rerun` (288 / 0293, seeded, no test
rows), the same shape CI gives its estate database:

```
PGPORT=55771 PGDATABASE=clara_w3_rerun … pnpm test          # 14:46:18Z → 16:00:09Z, 73 m 51 s
```

| | first run (`clara_w3`) | confirmation (`clara_w3_rerun`) |
|---|---|---|
| tests | 5,514 | **5,514** |
| pass | 5,412 | **5,419** |
| fail | **7** | **0** |
| skipped | 95 | 95 |

**Zero reds.** All seven are gone and nothing else moved: the same 5,514 cells, the same 95 skips.
(The confirmation took twice as long only because it shared the host with the `packages/runtime`
suite and worker B's web suites.)

## 7. Runtime, static and cross-cutting gates

### 7.1 The static gates

| gate | command | result |
|---|---|---|
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK** — `312 frozen file(s) verified against frozen-workflows.json (append-only vs origin/main); 55 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded.` Manifest unchanged; no wave-3 lane touched a frozen body |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — `CI proves reader ⊇ emittable at this commit`; emittable = {freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}; allowlist = {agent_receipt, firm_question, close_proposal} |
| world gate selftest | `node scripts/ci/world-gate.selftest.mjs` | **world-gate selftest: OK** |
| typecheck | `pnpm typecheck` | **PASS**, exit 0 — `apps/web` and `packages/runtime`, `tsc --noEmit`, 14:26:33Z → 14:27:31Z (58 s) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **PASS**, exit 0 — 14:27:31Z → 14:29:29Z (2 m). eslint, token contrast, test-manifest + selftest, message keys + selftest, dead citations, document-region field paths, wiki dynamic SQL, dsn-pipe selftests, the ui-add guard selftest and `@clara/reporting-render`'s own eslint |

All five were **re-run after my four fix commits** (15:54:53Z → 15:56:0xZ) and all five still pass:
`TYPECHECK_EXIT=0`, `LINT_EXIT=0`, `freeze-lint: OK` with the same 312/55/3 manifest,
`parts-parity: OK`, `world-gate selftest: OK`. Three of my four commits touch `packages/db/tests`
and one `packages/runtime/tests`, all of which `pnpm -r lint` covers.

### 7.2 The wave-3 runtime test files, under WSL as `runner`

`git diff --name-status d96a33f31...HEAD -- packages/runtime/tests` is **3 added, 1 deleted, 32
modified**. The three added are `local-db-gate.mjs` (a helper, not a test),
`local-db-gate.test.mjs` and `local-db-gate-drivers-census.test.mjs`. Both added TEST files need no
database and both ran clean as user `runner` on Linux:

```
wsl -u runner -- /opt/node/bin/node --test tests/local-db-gate.test.mjs
  1..10  # pass 10  # fail 0   (134 ms)
wsl -u runner -- /opt/node/bin/node --test tests/local-db-gate-drivers-census.test.mjs
  1..8   # pass 8   # fail 0   (282 ms)
```

The deleted one is `reconcile-adjustments-unit.test.mjs` (gone with lane 05's #927 retirement of the
adjustment-template doors) — nothing to run.

I also tried the touched no-database unit files under the same user. Two ran and were green —
**`reconcile-belt-isolation-unit.test.mjs` 24/24** and **`reconcile-fa-unit.test.mjs` 20/20**, with
`CLARA_SPOOL_DIR` pointed at a per-run `mktemp -d`, which is the exact shape RIG.md's own Linux/spool
note asks for. The rest could **not** be run under WSL on this rig, and the reason is the rig, not
the code:

```
Error: You installed esbuild for another platform than the one you're currently using.
Specifically the "@esbuild/win32-x64" package is present but this platform needs
the "@esbuild/linux-x64" package instead.
```

`node_modules` in this worktree is a Windows install and `esbuild` is a native binary, so every file
that reaches `tsx`/esbuild (`leader-state`, `rollback-preflight`, `trade-invoice-unit`,
`wave-b-opening-parse`, `wave-b-seeding-prepare`, `work-routes-unit`, `body-census-guard-db`) dies at
load. Fixing that means a Linux `pnpm install` over the same `node_modules`, which would break worker
B mid-run and is outside my instructions. **Unverified, and flagged:** those seven files' Linux
behaviour is not proven by me. They all ran on Windows in §7.3. The two files the work order actually
names — the wave-3 additions — are proven on Linux.

### 7.3 The `packages/runtime` suite, the way CI runs it

CI's `db-estate-suite` action builds the runtime's database as
`create database <runtime> template <estate>` and runs
`PGDATABASE=<runtime> pnpm --filter @clara/runtime --if-present test`
(`.github/actions/db-estate-suite/action.yml:99,117`). Same shape here:

```
psql -c "select pg_terminate_backend(pid) … where datname='clara_w3' and pid <> pg_backend_pid()"
createdb -p 55770 -T clara_w3 clara_rt_test          # 288 / 0293, the from-scratch chain
PGDATABASE=clara_rt_test CLARA_RIG_DB=1 \
  WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55770/clara_rt_test \
  pnpm --filter @clara/runtime --if-present test
```

The clone is named `clara_rt_test` on purpose: #1018's shared `tests/local-db-gate.mjs` admits
`clara_(rt_test|wave_b_ci|intake_ci|\d{3}|l\d{2})`, and `tests/body-census-guard-db.test.mjs` —
the one `node --test` file behind that gate — DECLINES rather than runs under any other name. A
`clara_w3_rt` would have skipped it silently.

**14:46:12Z → 15:00:53Z, 14 m 41 s.** **2,894 tests, 2,851 pass, 3 fail, 40 skipped.**

| red | classification |
|---|---|
| `tests/intake-unit.test.mjs:114` — *scanner rejects EICAR, encrypted PDF, and XML entity expansion* | **(a) known Windows-only**, named in RIG.md ("the Defender/EICAR skip"). Defender removes the EICAR fixture before the scanner sees it |
| `tests/pg-tools-fixture.test.mjs:33` — *(#806) this host's OWN probe: pg_dump/psql are on PATH here … so this rig runs, not skips* | **(a) known Windows-only**, named in RIG.md ("no `pg_dump` on PATH (four runtime files)"). `which pg_dump` on this host: not found |
| `tests/ready.test.mjs:331` — *ready MAJOR-1: the lane WARNING still surfaces once the background probe settles (H-48)*, `TypeError: degraded.checks.pools.find is not a function` | **(b) flake, load-dependent** — see below |
| `tests/wave-b-interview-plan-db.test.mjs:118` and `:145` | **(c) integration collision** — caught in the pre-read run of this suite, fixed in `26ada6131`, green in this run. §7.3.1 |

**The `ready.test.mjs` flake, argued rather than asserted.** `checks.pools` is an ARRAY only once
the background lane probe has settled; until then `lib/health.mjs:560` sets it to the OBJECT
`{ pending: true, stalled }`, and `lib/lane-probe.mjs`'s own header records that "a cycle that blows
its hard bound resets the verdict to null, i.e. back to `pending`". `TypeError: … .find is not a
function` IS that branch. Evidence it is the host and not the wave:

- `ready.test.mjs`, `lib/health.mjs`, `lib/lane-probe.mjs` and `lib/pools.mjs` are **untouched by
  wave 3** — `git diff --name-only d96a33f31...HEAD` over all four is empty.
- the identical cell **passed** in an earlier full run of this same suite on the same tree
  (1,160 ms) and **failed** in this one (1,921 ms). Same code, different clock.
- it reproduces when run alone *while the 38-minute `packages/db` suite is also running*, on both
  the 55770 and the 55771 clone — i.e. it tracks host load, not the database and not the branch.
- **re-run alone on a quiet host, twice, after both long suites had finished** (16:04:44Z and
  16:04:53Z): **24/24 pass, 0 fail, both times**, each run taking ~9 s against the ~70 s it took
  while the host was loaded. That is the flake protocol completed, and it is conclusive.

The two known Windows reds, with their own evidence rather than an appeal to RIG.md alone:

```
intake-unit.test.mjs:114   Error: UNKNOWN: unknown error, open
                           'C:\…\Temp\clara-intake-LdR8LA\eicar.bin'
                           — Defender removed the fixture before the scanner opened it; the very
                           next cell, "(#693) a quarantined EICAR fixture on win32 SKIPS with the
                           explicit reason", PASSES, which is the estate's own name for this state
pg-tools-fixture.test.mjs:33  "this rig's PATH is prefixed with ~/.local/pg17/bin — pg_dump must
                           resolve" — `which pg_dump` on this Windows host: not found
```

#### 7.3.1 The runtime integration collision — `#899` again

The pre-read run of this suite (against a `createdb -T clara_w3_upg` clone, while the `packages/db`
suite was still running) had **4** reds: the two known Windows ones and

```
tests/wave-b-interview-plan-db.test.mjs:118  a stale revision raises CLR06 (AMB-9) …
tests/wave-b-interview-plan-db.test.mjs:145  update_onboarding_plan refuses an answered_by …
CLR10 'this name matches 2 existing clients or counterparties in your firm; …'
```

The same shape as collision 2 in §6: every fixture client is born into the SAME seeded firm A with
a label beginning "DB …" (`DB F2 probe`, `DB Happy`, `DB Cas`, `DB Authz`), so all four shared the
family token `db` and #899's wall refused the third and fourth.

**Fix `26ada6131`** — `fix(integration): #899 vs the wave-B interview DB battery — one name family
per firm`. One helper changed: `beginOnboarding(label)` prefixes `DB<uuid8> `, so the unique part
leads and every call site keeps its readable label. No assertion, op key, role or door call moved.
**5/5 pass** afterwards — and on the very database whose firm A already carried the two colliding
"DB …" clients, which is the stronger check.

### 7.4 #1012's removed prior-GL seeding route — nothing still drives it

`packages/runtime/src/seedingRoutes.ts` does not exist (`ls` → `No such file or directory`), and
`packages/runtime/src/index.ts` no longer imports or mounts it — its only trace there is the comment
block at `:114-121` recording the removal. A whole-repo search for `api/seeding/prepare` and
`seedingRoutes` returns, in CODE, exactly three hits and all three are comments:

- `packages/runtime/lib/seeding-parse.mjs:24` — "the route that fronted it (`src/seedingRoutes.ts`,
  POST /api/seeding/prepare) is DELETED, so nothing in this …". The library's deterministic READ half
  survives on purpose (the Client KB inherits it); a library drives no route.
- `packages/runtime/tests/wave-b-seeding-prepare.test.mjs:9` — the same statement in the battery's
  header. The file's cells call `prepareSeeding` **directly**; there is no `fetch(`, no `request(`
  and no occurrence of the path anywhere in its body.
- `packages/db/tests/opening-ledger-source.test.mjs:261` and the 0228/0288 migration headers and the
  two READMEs — prose.

**No runtime test and no runtime fixture drives the retired route.** Confirmed.

## 8. What is left on the rigs, and the final head

### 8.1 Clusters and databases (both clusters KEPT, online)

**`rigw3` — 127.0.0.1:55770** (`/var/lib/postgresql/17/rigw3`)

| database | what it is |
|---|---|
| `clara_w3` | **THE FROM-SCRATCH CHAIN.** 288 migrations, 0001→0293 in one `migrate` run, then `pnpm db:seed`. The reference estate; §6's whole `packages/db` suite ran against it |
| `clara_rt_test` | a `createdb -T clara_w3` clone, the database §7.4's `packages/runtime` suite ran against (CI's own shape). Carries the World bootstrap that run leaves behind — **not** a clean baseline |

**`rigw3h` — 127.0.0.1:55771** (`/var/lib/postgresql/17/rigw3h`)

| database | what it is |
|---|---|
| `clara_w3_hosted` | **HOSTED BASELINE for the release worker.** 267 migrations, 0001→`0272_document_capability_wall_completion`, from scratch through a truncated `CLARA_MIGRATIONS_DIR`, then seeded. This is what hosted looks like today |
| `clara_w3_upg` | **UPGRADE BASELINE for the release worker.** `createdb -T clara_w3_hosted`, then the ordinary `migrate` with the FULL directory: all 21 applied, 288 / 0293. This is what hosted looks like after the wave |
| `clara_w3_probe` | evidence for §5.2 only — hosted clone → 0289 → 8 `document_regions` rows through the estate's doors → 0290–0293 with the POPULATED probe arm. 288 / 0293. Not a baseline |
| `clara_w3_tmpl` | evidence for §5.1 only — hosted clone → a live adjustment template through the real door → the chain refused at 0282 → the template retired through the real door → the chain completed to 288. Afterwards reused as the scratch database for single-file test re-runs, so it carries test rows. **Not a baseline** |
| `clara_w3_rerun` | `createdb -T clara_w3_upg`, the clean 288-file database §6.1's all-green confirmation suite ran against. Carries that suite's rows. Not a baseline |
| `clara_rt_test` | `createdb -T clara_w3_upg`, the early pre-read of the `packages/runtime` suite (§7.3.1's collision was caught here). Carries World bootstrap state. Not a baseline |

Ledgers re-read at the end, all as expected: 55770 `clara_w3` and `clara_rt_test` **288 / 0293**;
55771 `clara_w3_hosted` **267 / 0272**, `clara_w3_upg`, `clara_w3_probe`, `clara_w3_tmpl`,
`clara_w3_rerun` and `clara_rt_test` all **288 / 0293**. Both clusters online.

Nothing was dropped. No cluster in the forbidden set was touched; `pg_lsclusters` shows `rigint`
(55720), `rigrt` (55721), `rigreh` (55730), `rigw2` (55760) and `rl01`–`rl10` (55741–55750) all still
online and untouched, plus my two.

### 8.2 Commits

Four, all `fix(integration)`, all on `integration/riders-w3`, each with explicit paths and each
ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`:

| sha | what | file |
|---|---|---|
| `ecfec7967` | #899 vs #435 — the `client_identifiers` writer census re-measured for the birth core | `packages/db/tests/client-identifiers-unique.test.mjs` |
| `6dc0fd18b` | #986 vs #899 — the reread battery's fixture names leave one name family | `packages/db/tests/opening-source-reread.test.mjs` |
| `06060f362` | #932/#975 vs #182 — lane 04's three new doors join arm (D)'s clock roster | `packages/db/tests/x42-s5-helpers.mjs` |
| `26ada6131` | #899 vs the wave-B interview DB battery — one name family per firm | `packages/runtime/tests/wave-b-interview-plan-db.test.mjs` |

**No migration was edited**, so no chain had to be rebuilt and no database on either cluster is
stale against the tree. Nothing under `apps/web` was touched. `eff9a80a4` between my first and
second commits is worker B's, not mine.

### 8.3 For the release-preparation worker — the one hosted precondition

**Before the hosted upgrade, run this on the hosted database:**

```sql
select id, client_id, status, name from clara.adjustment_templates where status <> 'retired';
```

If it returns ANY row, `0282_retire_adjustment_template_doors` will refuse and the run will stop
with 0273–0281 applied (§5.1 shows it happening, and shows the run resuming cleanly once the rows
are retired through `clara.retire_adjustment_template`, which is still granted at the hosted
frontier). On a from-scratch chain the guard passes vacuously, so nothing before this report has
exercised it.

Everything else in the wave applies on hosted data as it applies here: the two other row-dependent
arms (0290's field-path census and its PROBE MODE fork) were both entered on a populated database
and passed (§5.2), and the seeded upgrade ran all 21 green (§4.3).

### 8.4 Anything unverified

1. **Seven runtime test files' Linux behaviour.** `leader-state`, `rollback-preflight`,
   `trade-invoice-unit`, `wave-b-opening-parse`, `wave-b-seeding-prepare`, `work-routes-unit` and
   `body-census-guard-db` could not run under WSL as `runner` because this worktree's
   `node_modules` is a Windows install and `esbuild` is a native binary (`@esbuild/win32-x64`
   present, `@esbuild/linux-x64` needed). Fixing that means a Linux `pnpm install` over the same
   tree, which would break worker B mid-run. All seven ran green on Windows in §7.3. The two files
   the work order actually names — wave 3's own additions — ARE proven on Linux.
2. **Hosted's `clara.adjustment_templates` contents.** I have no access to the hosted database, so
   §8.3's precondition is a query the release worker must run, not a fact I measured.
3. **The browser suites and `apps/web`.** Not mine; worker B owns them, in this same worktree.
4. **The 30 reset-gated `packages/db` skips.** They need `CLARA_RIG_ALLOW_RESET`, which RIG.md
   forbids on a shared rig, so those destructive cells are unproven by me on this wave.
5. **`db-slice-frontiers` intermediate legs.** The new clock cohorts (§6, collision 3) are gated on
   migration stems, and I measured the roster at exactly two frontiers — 0272 and 0293. A leg pinned
   between 0279 and 0292 is reasoned about (0292 pins both policy bodies unmoved; 0293's recut keeps
   the token) rather than run.
6. **`qd6-close-seal-wall.test.mjs`'s two-client ceiling** (§6) is green today and was not touched.
7. **The hosted pair's port.** `clara_w3_hosted` and `clara_w3_upg` are on **55771**, not 55770, for
   the measured reason in §4.1. If the release worker's own prompt names 55770, this is the
   discrepancy to reconcile — the databases themselves are exactly what was asked for.

---

## Final head

`integration/riders-w3` at **`26ada61319f02f4c01d3e1ad121eeaa2164c1f41`**, worktree clean, nothing
pushed, no PR, no GitHub write. (Worker B commits into the same branch, so the head may advance
after this line; `26ada6131` is the last commit that is mine.)
