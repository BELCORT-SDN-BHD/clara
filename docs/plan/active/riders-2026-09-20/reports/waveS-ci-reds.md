# Riders sweep wave S — the PR #1143 CI reds, reproduced and fixed (COMPLETE)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\660` · **branch** `fix/wS-ci-reds`
**Cut from** `origin/integration/riders-sweep` at `0052f3177` (onto main `3bf6aa94d`) ·
**head `90bbdd2c3`**
**Six commits**, one per red. Nothing pushed, no pull request, no GitHub object written, no other
worktree and no file in the main checkout but this report touched, no subagent spawned, no process
killed.

| # | commit | red |
|---|---|---|
| 1 | `c53764bd9` | #1090 / 0345 — the knowledge catalogue censuses (`kg.04`, `sd.02`, `sd.04`) |
| 2 | `f65e52019` | #1077 / 0336 — `p1077.namespace.census`, a pure collation red |
| 3 | `2271cfae5` | #1069 / 0341 — `p636.census.no_recut`, the second pin ladder |
| 4 | `ea130a7ec` | #1092 / 0346 — `§6 agent lane`, the wave's ruled agent read |
| 5 | `3382a9d66` | #1048 / 0343 — the evaluator censuses, 33 of the 41 reds |
| 6 | `90bbdd2c3` | #1050 / 0338 and #1046 / 0348 — the x42 arm (D) clock roster |

Diff vs `origin/integration/riders-sweep`: **9 files, +230 / −14**, every one of them under
`packages/db/tests`. **No migration was edited, no migration was added, no redo was run, no pin
moved, no production module changed, and no assertion was loosened.**

---

## The 41 reds, at a glance

CI run 36137571054, job 108079320244, `db-estate` · `packages/db`: **5967 tests · 5816 pass · 41
fail · 110 skipped**. `apps/web` in the same job was 5249 / 5247 / 0 / 2, and `db-live-gates`,
`lint`, `build`, `render-drill` and the whole runtime suite were green.

The 41 are **six causes**, and one of them accounts for 33 of them.

| CI cells | cause | fix |
|---|---|---|
| `16`–`59` nested, `975`, `1106` (**33**) | 0343 registers a new evaluator closure that four closed-world censuses do not name; the first census refuses before the ceremony's `update` runs, so nothing is ever deployed and every later phase dies | the four censuses name it, conditionally |
| `2362` | 0341 moves `clara.list_accounting_work`; a SECOND pin ladder still holds the old sha | an eighth generation, gated on 0341's stem |
| `2487`, `2568`, `2570` | 0345 appends a fifteenth knowledge key to a catalogue three cells count | the counts re-derived off the live-catalogue cohort probe |
| `3285` | a readback ordered under the database's own collation, compared to a JavaScript sort | `collate "C"` at the order |
| `3530` | 0346 grants the agent lane a read the §6 closed world does not except | the carve-out, with the ruling and its shape |
| `5597`, `5607` | 0338 and 0348 mint four bodies carrying bare clock tokens | the arm (D) roster, with a body-by-body adjudication |

Two of the six are things a lane could not have seen and a gate did not run: the pin ladder
(`2362`) sits in a battery no lane owned, and the evaluator censuses sit in `delta-contract`, which
is not in any lane's own 49 files. The gates ran the lanes' files; the estate runs 5967 cells.

---

## The rig, and the one thing about it that changed an answer

**A disposable WSL PostgreSQL 17 cluster, `rigfixs`, `127.0.0.1:55708`, locale `en_US.utf8`**,
created for this job and dropped at the end. Database `clara_fixS`, built from scratch from this
worktree: **337 new applied · 337 total**, `0001` → `0361_reservation_release_advice`, then seeded
(2 seed files), 20 `clara%` roles at the end — 0154's own count.

**The brief named the standing cluster `127.0.0.1:55750` and a database `clara_fixS` on it. That
cluster cannot answer this job's questions, and the deviation is recorded rather than quietly
taken.** Two reasons, each measured:

1. **`rl10` cannot make an `en_US.utf8` database at all.** `createdb --locale=en_US.utf8` on it
   fails `invalid LC_COLLATE locale name`, although `locale -a` lists `en_US.utf8` for the
   `postgres` user: the cluster's postmaster was started before the locale was generated, so its
   `pg_collation` carries only `C`, `POSIX` and the ICU set. CI's `postgres:17` service initdb's at
   `en_US.utf8`. **One of the 41 reds (`3285`) is a pure collation difference and is INVISIBLE on a
   `C.UTF-8` rig** — wave 4 paid for exactly that lesson and this job would have repeated it.
2. **`rl10` already carries 18 `clara%` roles** from an older chain (`clara_l10` rests at 288 files
   / `0293`), and one of the reds is a closed-world census over the evaluator registry on a
   *fresh disposable* database. A fresh cluster starts at zero roles and the chain takes it to 20,
   which is the shape 0154 pins and the shape CI has.

Everything else the brief asked for was kept: `clara_l10` was never touched, no other database on
any standing cluster was written, `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were
never set, and no port in 55700–55707 or 55741–55750 was used.

**One note for the next worker, and it cost a cell.** `pg_createcluster` needs root here
(`wsl -u root -- pg_createcluster 17 rigfixs -p 55708 --locale=en_US.utf8 --start`) and the cluster
it makes gets Debian's `scram-sha-256` for `127.0.0.1`; the two `host all all` lines must be
switched to `trust` and the cluster reloaded before anything connects.

---

## Red 1 — `2487` `kg.04`, `2568` `sd.02`, `2570` `sd.04` · #1090 / 0345 · `c53764bd9`

**Files** `packages/db/tests/knowledge-key-grammar.test.mjs`,
`packages/db/tests/knowledge-scope-default-drop.test.mjs`.

**Reproduced** on the from-scratch chain: all three read `15 !== 14`.

**Cause.** Each cell carries a closed-world count over `clara.knowledge_keys`.
`0345_depreciation_policy_knowledge_key` (#1090) appends exactly one row — `depreciation_policy`,
the key the fixed-asset proposal's `client_knowledge` ground needs before any person can record a
depreciation note. Measured live: `kind = assertion`, `value_shape = object`,
`validated_against = shape_only`, `authority_bearing = true`, `min_role = bookkeeper`, and **no
`clara.knowledge_key_firm_eligibility` row**, which 0345's own tail states ("never firm-eligible").
So the catalogue goes 14 → 15, the assertion bucket 11 → 12, and the firm-scope-refused census
10 → 11.

**Fix.** Both files state their own law in their headers — *every cell gates on the LIVE CATALOGUE,
never on the migration number* — so every expected number is derived from
`knowledge-fixtures.mjs`'s **existing** `depreciationPolicyKnowledgeCohortApplied()` probe, which
lane L5 already wrote. A pre-0345 chain still measures 14 / `{assertion 11, policy 2, preference 1}`
/ 10 exactly; a post-0345 chain measures 15 / `{12, 2, 1}` / 11 exactly. `sd.04` additionally names
the eleventh member rather than absorbing it into a number: it asserts the new key carries no
firm-eligibility row and is of kind `assertion`, which is *why* it joins that census.

**Nothing is loosened.** A sixteenth key, a row landing in the policy or preference bucket, or a
twelfth firm-refused key each still reds the cell.

**Vacuity control.** With the post-0345 arms deliberately moved to 16 and 12, the two cells failed
`15 !== 16` and `11 !== 12`; both files were then restored **byte-identically** (`diff` empty).

**Re-run.** The two batteries under the full 152-gate chain: **15 tests, 15 pass, 0 fail, 0
skipped.**

---

## Red 2 — `3285` `p1077.namespace.census` · #1077 / 0336 · `f65e52019`

**File** `packages/db/tests/revenue-recognition-plan-op-key-fixtures.mjs` (the readback the cell in
`revenue-recognition-plan-op-key.test.mjs` uses).

**This one is not a roster at all — both members were present and the cell still failed, on ORDER.**

```
+   'clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)',
    'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
-   'clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)'
```

**Cause.** `bodiesDeriving()` ordered its `pg_proc` readback with a bare `order by 1`, and the cell
compares the result to a JavaScript array sorted by `Array.prototype.sort` — UTF-16 code-unit
order, which is byte order for these ASCII signatures. Under `C.UTF-8` the database agrees by luck.
Under CI's `en_US.utf8` the underscore is ignored at the primary level, so
`clara.replace_revenue_...` sorts ahead of `clara._revenue_recognition_core` and the `deepEqual`
reds with both members present. **This is the red the locale choice above exists to catch**: on a
`C.UTF-8` rig it does not reproduce at all.

**Fix.** `order by (p.oid::regprocedure::text) collate "C"`, #1047's house rule, so the two sides
agree on every rig rather than on some of them. The census still reads `pg_proc.prosrc` and nothing
else, and a third body reaching for the suffix still reds it.

**Re-run.** `revenue-recognition-plan-op-key` under the full gate chain: **4 tests, 4 pass, 0
fail.** Red before the change on the same `en_US.utf8` database, green after.

---

## Red 3 — `2362` `p636.census.no_recut` · #1069 / 0341 · `2271cfae5`

**File** `packages/db/tests/intake-batch.test.mjs`.

**Cause.** The cell pins twelve bodies by `sha256(prosrc)` through a ladder of generations selected
by cohort probes. Lane L3's `0341_work_claim_allocation_count` projects `allocation_count` onto
`clara.list_accounting_work` and moves it `dffa917d…` → `fc679a2d…`. The eleven other pins were
re-measured and are unmoved (the cell stops at the first mismatch, and this body is the twelfth and
last).

**The lesson, and it is the one worth carrying.** This is the **second** census that pins this body.
The integration merge found the first — `firm-portfolio-pack.test.mjs`'s `p659.portfolio.no_recut`,
commit `f1dd65c23` — and gave it this exact generation with this exact value. **Finding one cell of
a pin ladder is not finding them all**: `intake-batch` is in no lane's own battery set, so neither
the lane, nor the merge's own gates, nor the three reviews could see it.

**Fix.** The same generation, built the same way `f1dd65c23` built its sibling: gated on 0341's own
**STEM**, never on a number, for the renumber hazard wave 3 lane 04 paid for. The signature does
not move, so the pin's key is unchanged and only its value is. The cell's refusal sentence now
names 0341 among the tolerated recuts.

**Re-run.** `intake-batch` under the full gate chain: **37 tests, 37 pass, 0 fail, 0 skipped.**

---

## Red 4 — `3530` `§6 agent lane` · #1092 / 0346 · `ea130a7ec`

**File** `packages/db/tests/rig-runtime-visibility.test.mjs`.

```
agent_ro SELECT clara.fa_account_depreciation_policies:
expected SQLSTATE 42501 but the call SUCCEEDED (no error)
```

**Cause, and it is a RULING rather than a defect.** The cell sweeps every `clara` table and requires
42501 for `clara_agent_ro` on each one not in a sanctioned-exception set.
`0346_fa_retired_policy_agent_read` (#1092) grants `clara_agent_ro` SELECT on
`clara.fa_account_depreciation_policies`. SWEEP-PLAN.md flagged that widening as the wave's security
item — *"that widens a runtime credential onto client tax data. Security. Opus."* — and it carries a
security review, an adversarial review and a recheck. The read that consumes it is the fixed-asset
particulars proposal's retired-policy ground, which the runtime reaches out of its READ pool whose
group role is `clara_agent_ro`; there is no door to route it through, which is the same shape
`knowledge_records` already takes in this very cell.

**Fix — the closed world carves out exactly what was ruled and no more.** Beyond joining the file's
existing positive-verification loop (an excepted table must really carry the grant, so a stale or
quieting entry fails by name), the new entry re-measures the ruling's own shape off the catalog:

- `clara_agent_ro` holds SELECT and **nothing else** (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
  TRIGGER all asserted absent);
- the relation carries **exactly one** `clara_agent_ro` policy;
- that policy is `FOR SELECT`;
- its qualifier is scoped to `clara.wake_firm()`.

A later file widening the grant to a write, to a second role, or to an unscoped policy reds this
cell even though the table stays excepted from the sweep.

**Lanes L8's 0352 and 0353 needed nothing here.** They grant `clara_agent_ro` EXECUTE on read
twins; this cell censuses TABLES, not functions, and each migration's own tail already proves the
twins are `clara_agent_ro`-only with one `interactive` allowlist row each. The live grant census
confirms `fa_account_depreciation_policies` is the only NEW table the agent lane can read.

**Vacuity control.** Adding an ungranted table (`metric_cells`) to the new exception set reds the
cell; the file was then restored **byte-identically**.

**Re-run.** `rig-runtime-visibility` under the full gate chain: **8 tests, 8 pass, 0 fail.**

---

## Red 5 — `16`–`59` nested, `975`, `1106` · #1048 / 0343 · `3382a9d66` · **33 of the 41**

**Files** `packages/db/tests/delta-catalog-phase.mjs`, `delta-contract.test.mjs`,
`epsilon-contract.test.mjs`.

**Cause, and why it cascaded.** `0343_payroll_completeness_witness` (#1048) registers
`clara.evaluate_payroll_run_state_v2` in `clara.evaluator_versions` — a NEW closure beside the
frozen v1, never a recut of it, because `0296:710` refuses an in-place edit at APPLY and 0343's own
freeze block says its only lawful repair is a `_v3`. **Four hand-derived, closed-world censuses did
not name it:**

| where | what it read |
|---|---|
| `delta-catalog-phase.mjs:602` | the closure census, **44 members against 43** |
| `delta-catalog-phase.mjs:677` | the freeze verifier, **`verified_registered` 12 against 11**, and its deployment total |
| `delta-contract.test.mjs:67` | the pre-ceremony roster, compared row by row |
| `epsilon-contract.test.mjs:153` | `ensureEvaluatorDeployed`'s covered floor, **8 against 7** |

The first census refuses **before** the one-way ceremony's `update` runs, so no metric evaluator is
ever deployed and every later phase dies on it: cells `21`, `24`–`27`, `29`, `30`, `33`–`51`,
`57`–`59`, the file-level `975`, and epsilon's own `1106`. This is wave 4's group B one wave on,
and the note in that report predicted this class.

**v2 is COVERED by the ceremony, not excluded, and that decision was re-taken on this chain rather
than inherited.** It is not in `EXCLUDED_PAIRS_SQL`, it does not ship dark, and the live catalog
census of `clara` bodies whose `prosrc` reads `clara.evaluator_versions` still names only the
metric, report, prepayment and revenue-recognition families — so nothing in the estate reads its
`deployed` flag and no battery of its own must witness a pre-flip refusal.

**Fix.** Named in every census rather than absorbed into a bumped total, and added **conditionally**
on its own registration, so a pre-0343 chain still measures exactly 43 / 11 / 7 and the roster still
carries no v2 row.

**Reproduced and controlled on a template copy taken before any ceremony** (`clara_fixs2`,
`clara_fixs3`, both `create database … template`, which is CI's own instrument for a second
database on one cluster): the pre-fix files give **33 reds**, exactly CI's 33; the fixed files give
**129 tests, 129 pass, 0 fail, 0 skipped** on the fresh witness arm.

---

## Red 6 — `5597` `x42.r7.s5c.5` and `5607` `x42.s5c.6` · #1050 / 0338, #1046 / 0348 · `90bbdd2c3`

**File** `packages/db/tests/x42-s5-helpers.mjs` (arm (D)'s roster, which both cells re-derive).

**Cause.** 301 live names against 297 expected. Four new bodies carry a bare clock token and **none
was removed**:

| body | file | ticket |
|---|---|---|
| `record_firm_standing_instruction` | 0338 | #1050 |
| `withdraw_firm_standing_instruction` | 0338 | #1050 |
| `prune_confirmation_attempts` | 0348 | #1046 |
| `prune_invite_preview_attempts` | 0348 | #1046 |

**The adjudication, body by body on the live 337-file catalog**, because a bare clock token is only
a DEFECT where a DATE comes from it — wave 4's own F7 lesson:

- **`prune_confirmation_attempts`, `prune_invite_preview_attempts` — the clock read is NEVER
  WRITTEN.** It appears only inside each body's own refusal guard,
  `if p_before > now() - interval '15 minutes' then raise … CLR10`, and once more in that raise's
  message; the comparison is against the caller's `timestamptz` argument. The statement each body
  runs is a `DELETE`. Declared locals are `v_deleted bigint` and `v_tg "char"` — no date — and
  neither carries a `::date`, a `current_date`, a `date_trunc` or a `clara._book_today()` token.
- **`record_firm_standing_instruction`, `withdraw_firm_standing_instruction` —
  `withdrawn_at = now()`, one line each.** The RECORD door carries it because it withdraws the
  firm's superseded instruction on its way in, which is exactly the shape
  `enrol_prepayment_account` and `retire_prepayment_account` already share on this roster. Neither
  declares a date-typed local (`v_actor uuid; v_firm uuid; v_dedupe jsonb; v_key text;
  v_reason text;` plus a `record`) and neither carries a date token of any kind.
- **None of the three relations they write carries a DATE column.**
  `clara.firm_standing_instructions` (9 columns), `clara.confirmation_attempts` (6) and
  `clara.invite_preview_attempts` (4) return nothing for `data_type = 'date'`; every instant in all
  three — `recorded_at`, `withdrawn_at`, `attempted_at`, `settled_at` — is
  `timestamp with time zone`.

So in all four the clock lands on a `timestamptz` target or on nothing at all, no date is derived
from any of them, and the house legal date is not owed: none of these bodies answers "what is
today". A body that later did would call `clara._book_today()` and belong on the arm (B) roster
instead.

**Fix.** Two cohorts, each gated on its file's **STABLE STEM**
(`prepayment_close_standing_instruction$`, `rate_wall_attempts_retention$`), never on a number —
which this wave earns twice over, having renumbered its own overflow block to 0360 and 0361.

**The wave's other twenty-three migrations add no arm-(D) name**, measured rather than assumed: the
live census returns exactly these four and removes none. 0352's and 0353's own moves were already
carried by `REVIEW_QUEUE_0352_CLOCK_NAMES` and `REVISE_PLAN_0353_CLOCK_NAMES`, which lane L8 wrote.

**Vacuity control.** A fifth, non-existent name on the roster reds **both** cells; the file was then
restored **byte-identically**.

**Re-run.** `x42b2-r7-s5-clock`, `x42b2-s5c-clock` and `x42b2-r7-s5-census` under the full gate
chain: **6 tests, 6 pass, 0 fail.**

---

## The gates, at the fixed head `90bbdd2c3`

| check | result |
|---|---|
| the WHOLE `packages/db` suite, `clara_fixS`, full 152-gate chain, on the FRESH witness (18 min) | **6035 tests · 5924 pass · 1 fail · 110 skipped** — and the one fail is the database NAME, not the branch (below) |
| `packages/db/tests/role-census-reset.test.mjs` alone, after renaming the database to lowercase | **9 tests, 9 pass, 0 fail** |
| `pnpm typecheck` | **exit 0**, `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, all four workspaces |
| `node scripts/check-frozen-workflows.mjs` | **OK — 347 frozen / 60 `"use workflow"` / 3 retired**, identical to the base |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not re-measured, and not owed**: this branch edits no migration file at all, so no pinned sha can have moved. CI's own `apps/web` leg was 5249 / 5247 / 0 / 2 and this branch touches no `apps/web` file |

**All 41 CI reds are gone.** The whole-suite run reports 6035 tests where CI reported 5967; the
difference is the 68 subtests that never ran on CI because `delta-contract`'s first census refused
before its later phases could execute.

### The one whole-suite red, and why it is the rig rather than the branch

`not ok 3543 — rcr.sharedDependents sees a SHARED-object dependency (dbid = 0) …`
(`packages/db/tests/role-census-reset.test.mjs:168`), error `database "clara_fixs" does not exist`,
SQLSTATE `3D000`.

**It is the capital letter in the database name the brief specified.** That cell runs
`grant connect on database ${process.env.PGDATABASE} to …` with the name interpolated **unquoted**,
so PostgreSQL folds `clara_fixS` to `clara_fixs`, which did not exist. Every database the estate
actually uses is lowercase (`clara_ci` on CI, `clara_l01`…`clara_l10`, `clara_int*`), which is why
CI runs this cell **green** (`ci-estate.log:94874`, `ok 3543`).

Proven rather than argued: the database was renamed
(`alter database "clara_fixS" rename to clara_fixs`) and the file re-run alone —
**9 tests, 9 pass, 0 fail.** No test file was changed for it. A latent sharp edge for anyone who
ever names a rig database with a capital, and out of scope for a CI-reds fix; it is listed under
follow-ups below.

### And why there is no second whole-suite line, which is worth the next worker's time

A second whole-suite pass was started on the renamed database, to get a clean zero-fail line. **It
is not evidence, and it must not be read as a regression.** It reports 6035 / 5870 / **58** / 107,
and the estate itself names the reason in the first of them:

```
evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set to "1"
-- either this database is not actually fresh ... or the reuse is deliberate
```

**The `packages/db` suite is not idempotent against one database, by design.** It holds one-shot,
one-way contracts — the evaluator deploy ceremony (`f-a5-reporting-agency-pr1.test.mjs` cell D), the
whole F-A5b sandbox-export battery it gates, the `sst_rate_schedule` seed census — and the first run
consumes them. **Every one of the 58 was GREEN in the fresh run** (checked cell by cell: `1728`,
`1824`, `1878`, `2057`, `2061` and the rest are all `ok` in the first log), and `975`, the delta
contract itself, is `ok` in BOTH because that cell computes its own arm from `fresh` rather than
assuming one.

So the fresh run is the authoritative one, exactly as CI's is: CI builds a throwaway `postgres:17`
service per job and never runs the suite twice on it. A re-run against a consumed database needs
`CLARA_ESTATE_REUSED_DB=1`, which is a weaker witness than the fresh pass already recorded above and
was therefore not taken.

---

## Follow-ups worth filing

1. **A pin ladder is a SET of cells, and nothing enumerates it.** `clara.list_accounting_work` is
   pinned by `sha256(prosrc)` in at least two batteries; the merge fixed one and CI found the other.
   A small script that lists every cell pinning a given signature — or a shared fixture the ladders
   read from — would have turned this into one edit instead of two waves of surprise.
2. **`role-census-reset.test.mjs:182` interpolates `PGDATABASE` unquoted into a `GRANT`.** Harmless
   for every lowercase name and therefore invisible to CI; it costs a red on any mixed-case rig
   database. A `quote_ident`-equivalent (or a `format('%I')`) would close it.
3. **Two collation reds in two consecutive waves** (wave 4's `fd.12`, the cut phase's
   `p1007.probe.is_a_read`, and now `p1077.namespace.census`). Every lane rig here is `C.UTF-8` and
   CI is `en_US.utf8`, so this class is structurally invisible to lanes and to gates. Either a lane
   cluster should be built at CI's locale, or a lint should flag an `order by` on a text column
   whose result is compared to a JavaScript-sorted array.

---

## Anything unverified

1. **The `apps/web` and `packages/runtime` suites were not re-run here.** This branch touches
   neither workspace (the whole diff is nine files under `packages/db/tests`), and both were green
   in the same CI job. `pnpm typecheck` and `pnpm lint` cover them and are exit 0.
2. **No browser walk was driven.** No `apps/web/e2e` file is in this diff and `db-live-gates` was
   green on the red run.
3. **The `delta-contract` FRESH-witness arm was proved on a template copy, not on `clara_fixS`
   itself.** The ceremony is one-way and commits, so the only way to hold a fresh witness for the
   whole-suite run was to test it on a copy first (`clara_fixs2`, pre-fix control on `clara_fixs3`).
   The whole-suite run then took the fresh arm on `clara_fixS` itself, which is the same shape CI
   runs.
4. **The `rl10` cluster was not used**, so nothing here re-verifies that cluster's own state. It was
   read (its database list, its 18 `clara%` roles, `clara_l10` at 288 files / `0293`) and never
   written.
5. **`0154`'s cluster-wide role census was satisfied by a fresh cluster, not by the #867 recipe.**
   `rigfixs` started with zero `clara%` roles and the chain took it to 20.
6. **No second fresh chain was built.** The whole-suite evidence rests on ONE from-scratch
   `en_US.utf8` chain, because 0154 pins a cluster-wide role count and a second from-scratch chain
   on the same cluster needs the #867 recipe. The fixed batteries were each additionally re-run
   in isolation, and the delta family on two template copies of the pre-ceremony state.

### The rig, as it was left

The disposable cluster `rigfixs` (`127.0.0.1:55708`) and its three databases (`clara_fixs`,
`clara_fixs2`, `clara_fixs3`) were **dropped** at the end of this job; `pg_lsclusters` afterwards
shows the eighteen standing clusters and no `rigfixs`. No standing cluster was written to, and
`clara_l10` on `rl10` was read but never touched.
