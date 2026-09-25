# riders closing wave · lane L2 · the fix round (#1150, #1149)

- **Worktree** `C:\Users\zhant\Desktop\clara-wt\702` · **branch** `riders/wK-lane02` · **base** `ffb629d73`
- **Head before this round** `20e73c102` · **NEW HEAD `0a6deba7a`** (3 new commits, 12 in all from the base)
- **Database** `127.0.0.1:55742 / clara_c02`, ledger **338 files**, max `0364_plan_reservation_namespace_obo_fold`
- **Migration 0364 was edited and re-applied with the redo path. Its ledger checksum MOVED:
  `b8b4ca1f05376a56736a65048dd2bad2e816cb9324bff0813e50734c292ed205` →
  `b416ea4521b4275ee00bd125df32d05bb3c1d2b82dcaa3ba5cf9438bc9f557e7`.** No body sha moved (below).
- Worktree clean; no push, no PR, no GitHub write, no subagent, no other worktree touched.
- **No mid-task message arrived** (closing rule (f) did not fire).
- **Frozen law holds:** `git diff --name-only ffb629d73..HEAD -- packages/runtime apps/web
  frozen-workflows.json` is **empty**; `node scripts/check-frozen-workflows.mjs` reads
  `OK — 347 frozen file(s) verified … 60 "use workflow" module(s) all frozen+registered; 3 retired`.
  All 15 changed files are under `packages/db`.

Start state, checked first (WORK-ORDER rule 1): `git status` clean, `git log --oneline
ffb629d73..HEAD` showed the nine landed ticket commits. Nothing landed was redone.

## The three new commits

| commit | subject |
|---|---|
| `2c6a39aca` | `fix(db): #1150 the census fails on two bodies sharing one suffix, not only on two lanes` |
| `a6e16c041` | `fix(db): #1150 0364's redo marker is the file's own attribution, not the bare number` |
| `0a6deba7a` | `test(db): #1149 the catalog census measures "exactly one entry" and "a written meaning", and sees a second declaration in any shape` |

Each message names its ticket and ends `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`,
the trailer `WORK-ORDER.md` rule 2 binds this lane to and the other nine commits carry.

---

## 1 · Findings, one by one

### SPEC-1150-01 (major) + ADV-01 (major) — the census did not fail on two bodies sharing a suffix — **FIXED**

Both reviewers found the same gap from opposite ends, so it is one fix. The ticket's own sentence is
"a census cell reads the full list of derivers off the live catalog and **fails on any two that
share one**"; what stood was a **lane** partition, whose three rules are "a suffix no lane declares",
"a declared suffix with no deriver" and "one body in two lanes". None of them is "two bodies, one
suffix".

**Reproduced** before touching anything, with the reviewers' own decoy: `nestedPlanCensus` fed a body
whose only derivation is `p_op_key || ':plan'` inside `clara.create_accounting_plan(…)` — exactly the
shape the three bodies 0364 moved had before it — and `partitionProblems` returned `[]`. The new cell
was written first and went RED on precisely that sentence:

```
a new body deriving ':plan' must fail by name; problems were []
0 !== 1
```

**Fixed** in `packages/db/tests/plan-reservation-namespace-fixtures.mjs`:

- `ACKNOWLEDGED_SHARED_DERIVERS` names the two within-lane pairs the wave does not close, **signature
  by signature**: `:plan` = `clara._prepayment_schedule_core(…)` + `clara.replace_prepayment_schedule(…)`;
  `:rrplan` = `clara._revenue_recognition_core(…)` + `clara.replace_revenue_recognition_schedule(…)`.
- `partitionProblems` gains two rules: **(i)** a suffix with more than one deriver that no pair
  acknowledges is a problem naming every body; **(ii)** for an acknowledged suffix, any body **not**
  on its roster is a problem naming it, and any roster body that **no longer derives** it is a
  problem saying to drop the entry. So the roster is a permission list that must stay true, the same
  discipline `LANE_SUFFIXES` already carries for a suffix that lost every deriver.

**New cell `p1150.namespace.one_suffix_one_body`** carries four controls, all green:

1. the roster is **measured**, not declared — the suffixes two bodies share on the live catalog are
   exactly the two the roster names, and each pair is exactly the pair deriving it;
2. the review's decoy (`':plan'` under `create_accounting_plan`) fails by name;
3. a second body on `':tnplan'` — a suffix no pair acknowledges — fails by name;
4. the live rows with `replace_prepayment_schedule` removed produce the "drop the entry" problem, so
   the day the follow-up consolidates a pair the cell says which line to edit.

`p1150.namespace.census`'s own two-lane control now **matches the lane sentence** rather than counting
problems, because its decoy (`:plan` + `:acrev`) legitimately trips both rules now.

**What this does and does not claim.** It does not close the residual — see SPEC-1150-02. It makes the
guard the criterion asked for stand today, so the residual cannot grow and the day it is closed the
AC's letter is met without a further test change. If the orchestrator prefers to record AC2 as
narrowed instead, the cell is still the stronger of the two readings and nothing has to be undone.

### SPEC-1150-02 (minor) + the residual half of ADV-01 — the two within-lane pairs — **STAYS, by scope, now named rather than silent**

`CLOSING-PLAN.md` scopes #1150 to "the remaining nested `:plan` derivations on **the accrual and
tenancy doors**", and the brief itself says "a lane that keeps its existing suffix keeps every key
already spent". Closing the pairs means recutting `clara._prepayment_schedule_core`,
`clara.replace_prepayment_schedule`, `clara._revenue_recognition_core` and
`clara.replace_revenue_recognition_schedule` — four more bodies in two more families — which widens
the ticket. Both reviewers reached the same conclusion (`required_fix`: "No code change owed in this
lane"; "No code change is owed inside #1150's scope").

What changed instead: the residual is now **enumerated in code** (`ACKNOWLEDGED_SHARED_DERIVERS`),
**measured by a cell** and **documented twice** (`packages/db/README.md` § 0364's "What this file
does NOT do" paragraph now carries ADV-01's driven transcript, and the census paragraph explains the
roster). Nothing about it is a silence any more.

**Follow-up to file** (I never write to GitHub — see §5): the four bodies, both families, quoting
CLOSING-PLAN.md's scoping sentence, with ADV-01's driven transcript.

### ADV-02 (minor) — a census that silently dropped what it could not parse — **FIXED (widened) and the residual limit DOCUMENTED**

Reproduced against the pure reader: `coalesce(p_op_key || ':plan', 'x')` inside
`create_accounting_plan(…)` censused as `[]`, because `enclosingCall` returned `coalesce`, which is
not a plan door, and the row was dropped by `continue`.

The control was written first and went RED (`census saw []` where one row was expected). `enclosingCall`
became **`enclosingCalls`**, walking **outwards** through wrapper and grouping parentheses to the first
plan-door name, and stopping at a `;` at depth 0 (a statement boundary — literals and comments are
already blanked by `maskSql`, so that is the only place a `;` can be). The live census is
**byte-identical after the change**: the same ten derivations, the same suffixes, the same doors, the
same four lanes, `problems: []`.

**The limit that remains is now stated rather than assumed**, in the fixture docstring and in
`packages/db/README.md` § 0364 ("What the census can and cannot see"): a key carried through a local
variable first (`v_key := p_op_key; … v_key || ':plan'`) is still invisible, because both the SQL-side
filter and the reader key on the parameter name. A clean census means "no deriver written in terms of
`p_op_key`", not "no deriver". Nothing on the catalog takes that shape today, and 0364's own tail
pins the six recut bodies directly rather than through the census.

ADV-02's related brittleness is fixed in the same commit: `assert.ok(rows.length >= 10)` becomes
`>= DECLARED_SUFFIXES.length` (8), a floor the partition itself guarantees, so the cell no longer reds
on the very consolidation the roster is waiting for.

### ADV-03 (minor) — a marker-tolerant pin that admitted a body it never wrote — **FIXED, driven both ways**

The prestate's second admissible pre-image was `position('0364' in v_src) > 0`: a bare substring test
over the whole body text.

**Reproduced** on `clara_c02` in a rolled-back transaction: `clara._obo_plan_core` was replaced with a
body carrying `#1150 [supers]` instead of its attribution plus the comment *"superseded by a later
cut; see 0364 for the previous shape"* — sha `baac9f84…`, which is neither the pin `bbe338e8…` nor
0364's own recut `1e366547…`. §0 raised `0364 prestate OK -- 0 FIRST, 6 REDO` and **ADMITTED** it.

**Fixed:** the marker is now `#1150 [0364]`, the attribution every one of §A–§F writes into the body it
installs (measured on all six live bodies; §C carries it twice). The **same decoy** is now refused by
name:

```
0364 prestate: clara._obo_plan_core(…) is neither its pinned pre-image
(bbe338e80dfe0b19f7c4b7af49138982ac37c3282c26cdebc429dad6aa8de4a2) nor this file's own recut;
live sha baac9f844360f4df7602761e5bc1c4f860b808eecc70dce99c6d59d4f9f78c14
```

The live sha read `1e366547…` before and after both transactions.

**The FIRST-APPLY arm was re-proved**, not assumed, because the edit sits in the same loop (wave-3
addendum: a marker-tolerant pin hides its sha branch from a redo). In one rolled-back transaction,
0338 §E's own `create or replace` statement was re-run as `clara_fn_owner`, restoring
`clara._obo_plan_core` to **exactly** the pinned `bbe338e8…`; §0 then printed
`0364 prestate OK -- 1 FIRST, 5 REDO` with that body `=FIRST`. Rollback restored `1e366547…`.

### ADV-06 (note) — the pre-image attribution that would mislead a re-derivation — **FIXED**

`correct_accrual_adjustment`'s pre-image was called "0284's body verbatim" in three places. 0284
created the door; `0303_accrual_period_amounts` and `0304_accrual_revenue_side` each recut it, and the
pin `6a59591a…` is **0304's**. Corrected in the migration's §0 comment map, in §B's header and in
`packages/db/README.md`'s §-table row B to "0284's door **as 0303 and 0304 left it**". The pin itself
is unchanged; no behaviour moved. (All three sites are comments **outside** every function body, so no
post-image sha moved either — confirmed below.)

### SPEC-1149-01 (minor) + ADV-04 (minor) — "exactly one entry **with a written meaning**" — **FIXED, two new cells**

AC2's sentence has two halves neither of which any cell measured.

- **`p1149.catalog.exactly_one_entry_per_code`.** The four membership cells compare **sets**, which
  dedupe, so a second key on an already-catalogued code passed every one of them in silence. The new
  cell groups `Object.entries(CLR)` by value and names the code and both keys.
  **Vacuity control:** `duplicateOfDailyLimit: "CLR14"` added beside `dailyLimit` → this cell **alone**
  red, `CLR14 is carried by dailyLimit and duplicateOfDailyLimit`; the other six stayed green — the
  exact silence the finding described. Restored with `git checkout --`; `sha256(rig-helpers.mjs)` =
  `e42e408417293013f0bcaf1294f51a452b401dfa7f579ebcef595655faa817f1` before and after.
- **`p1149.catalog.every_entry_has_a_written_meaning`.** The "with a written meaning" half, and the
  one cell that reads the **source** rather than the imported object, because a comment does not
  survive being parsed: every key must carry a `//` comment on its own line or directly above it (the
  shape `callerContract` is written in). Its one lenient case — a key whose predecessor's comment wraps
  onto the line above — is deliberate and documented; the cell is about a key with no prose anywhere
  near it. A second assertion pins the source scan's entry count against `Object.keys(CLR).length`, so
  the scanner cannot quietly stop reading.
  **Vacuity control:** `provenance: "CLR02"`'s trailing comment removed → this cell alone red, naming
  `provenance`; the other six green. Same restore, same sha.

### SPEC-1149-02 (minor) + ADV-05 (minor) — a one-declaration guard keyed to one syntactic form — **FIXED**

**Reproduced** against the detector as it stood: of five shapes, only `export const CLR = {` was
flagged; `Object.freeze({…})`, `export let` and a plain binding exported further down were all
invisible (the genuine re-export was correctly invisible too).

`clrMapDeclarationSites` now delegates to **`declaresClrMap(src)`**, a pure detector matching any
top-level binding of `CLR` to an object — `const` / `let` / `var`, exported on the line or further
down, bare literal or wrapped in `Object.freeze(…)` — and the tree walk is otherwise unchanged. The
cell hands it each of those five shapes and four non-declarations that must **not** match (a re-export
by name, a re-export from a path, a `CLRS` binding, a `CLR` object property), so a clean scan now
means "no second catalog", not "no second catalog written the one way this cell can see". The
deferred-form fixture interpolates its keyword so this file does not become a declaration site of its
own when the scanner walks it.

**Vacuity control at file level:** two scratch modules planted under `packages/db/tests`, one frozen
and one deferred → `p1149.catalog.one_declaration` red naming **all three** sites
(`rig-helpers.mjs, zz-scratch-deferred-clr.mjs, zz-scratch-frozen-clr.mjs`), the other six green. Both
were untracked and deleted; `git status` clean.

### SPEC-1149-03 (minor) — AC4's "**every** existing test that imports either map" — **DISCHARGED on the criterion's own set; the whole-suite run stays the integrator's**

AC4's set was derived mechanically rather than sampled: the transitive closure of modules that export
a `CLR` binding under `packages/db/tests` is `rig-helpers.mjs` (the one declaration),
`work-journal-fixtures.mjs`, `work-question-fixtures.mjs` and `chat-clarify-expiry-fixtures.mjs`
(three re-exporters), and **15 test files** import `CLR` from one of them:

```
binding-proposal-pr-1  errcode-catalog  f-a4-pr1c-close-agent-limb  f-a4-pr1c-settle-door
f-a4-pr1c-walls-census  f-a4-pr2c-chat-lane  f-a9-usage-reshape  f-t1-sst-reference
fs7-e2-artifact-download  p4t1-identity  refusal-errcode-partition  work-journal-admission
work-journal-post  work-question-reads  work-question
```

All fifteen were run in one invocation with the full 153-flag gate chain against `clara_c02`:
**339 tests, 337 pass, 2 fail, 0 skipped.** That is 11 files the lane never sampled and 11 the spec
reviewer never ran.

**The two failures are inherited rig state, not either ticket's doing**, and they are in
`f-t1-sst-reference.test.mjs`:

- cell 3: `sst_rate_schedule carries exactly 10 seed rows (got 12)`;
- cell 7: `duplicate key value violates unique constraint "uq_sst_rate_schedule_live"` — the cell's own
  probe row cannot be inserted because a previous run's is still live.

Evidence that it is inherited: the two extra rows carry `recorded_at = 2026-09-25T18:11:23.304Z`,
while `clara_c02` was created by `createdb -T clara_intS6` on **2026-09-26** (`waveK-rig-prep.md`
lines 102–105), so they arrived **with the template** — leftovers of this same cell run during the
sweep wave. They are rows of `clara.sst_rate_schedule`, a table **no file in this lane's entire diff
mentions** (`git diff ffb629d73..HEAD | grep -c sst_rate_schedule` → `0`), and neither failing
assertion involves a CLR code. I did **not** delete the rows: tampering with shared rig state to make
a cell green is exactly what hides this class of problem.

The reviewers' `required_fix` assigns the whole-`packages/db` run to the integrator "first pass on a
fresh clone"; that stands, and this lane cannot produce a fresh clone (the only clean template is
`clara_intS6`, which closing rule (e) forbids touching, and it is the database that carries the
leftovers).

### ADV-07 (note) — two doors in one file answer the same mistake differently — **STAYS, recorded**

`§A` wraps `clara._reserve_op`'s detail-less CLR10 with a typed `op_key_conflict`; `§C`, recut in the
same file, still lets the raw `op_key reused with different args` out with `detail = null`. Typing the
primitive is #1077's follow-up 2 and is explicitly out of #1150's scope; both are the **outer**
reservation on the caller's own key, not the nested one this ticket is about. Recorded for that
follow-up as a measured pair, exactly as the reviewer asked.

### SPEC-1150-03, -04, -05 (notes) — **carried, no change**

- **-03**, `standing_instruction` at `clara._tenancy_plan_core`: unreachable today (ungranted body,
  one caller passing a literal), disclosed in the migration, the README and the ticket report. The
  integrator carries it into the merge note; any future entrance that passes `authority_kind` as an
  argument re-opens it.
- **-04**, `p1137.obo.plan_step_parity` re-aimed rather than deleted, and `clara._obo_plan_core` added
  to the `(T.4)` roster: both cells green in this round's runs. The two test-file pins stay on the
  integrator's reconciliation list.
- **-05**, AC7's from-scratch chain: reserved to the integrator on a disposable cluster by
  CLOSING-PLAN risk 1, and the three neighbouring cells' pre-0364 arms should be driven at a point in
  the ordered chain **before** 0364.

### SPEC-1150-06 (note) — the miscount — **CORRECTED HERE**

`tenancy-agent-twins.test.mjs` runs **21** cells, not 22: measured alone with the full gate chain,
`# tests 21 / # pass 21`. The #1150 report's §2 AC4 figure should read 21 when it is folded into the
merge record.

---

## 2 · The migration: what moved and what did not

`packages/db/migrations/0364_plan_reservation_namespace_obo_fold.sql` was edited (unmerged, so
editable under the wave-2 addendum) in **three comment/prestate places only**: the §0 marker test, the
§0 pre-image map's `correct_accrual_adjustment` line, and §B's header. Re-applied with the supported
redo path (`packages/db/README.md`, "Redo (#957)"), highest applied version, with
`CLARA_ALLOW_DESTRUCTIVE=1` and `CLARA_RIG_DB=1`:

```
[notice] 0364 prestate OK -- 0 FIRST, 6 REDO -- …
[notice] 0364 tail OK -- …
redone 0364_plan_reservation_namespace_obo_fold · new checksum b416ea45…
```

**No pin moved.** The six post-image shas after the redo are byte-identical to the pre-edit
measurement, so no test-file pin was re-measured and none needed to be:

| body | post-image sha (unchanged) |
|---|---|
| `clara.create_accrual_adjustment(…)` | `a6319d252d8db1cc9d4615c89965e8ceca080422519d37971e1652522eb1f998` |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `5f26b7061cc19f58a1233702b8aae2538eb25e25cb5833edd8fd1a9bbaa03494` |
| `clara._confirm_tenancy_rent_plan_core(…)` | `a4650cd2f28d86656cf812174d260c1a2e0c489deedcb139279e232b95328b40` |
| `clara._confirm_tenancy_rent_plan_revision_core(…)` | `17447d683ed1af1540287dc63b59f780741cc3ce79a46a776eb4c40c9f0616a1` |
| `clara._obo_plan_core(…)` | `1e36654777973175ed81b08bd579a4beb87339b07e4c3b6071d5bc2a33db9d56` |
| `clara._tenancy_plan_core(…)` | `67fd7548a7ded4d4343aec98ae6cd919c0963c48955f9b27538e904d00404a79` |

The **prestate pins are unchanged** too (`09c682f5…`, `6a59591a…`, `e8a65796…`, `5fe08056…`,
`bbe338e8…`, `9560414f…`), as is the eight-body neighbour list. **The one thing the integrator must
carry forward is the new ledger checksum `b416ea45…`**, which supersedes the `b8b4ca1f…` recorded in
`waveK-lane02-ticket1150.md`.

Nothing else in the file moved: no DDL statement, no tail assertion, no grant, no role (closing risk 1
holds — this file mints none).

---

## 3 · Gates, with counts

| gate | command | result |
|---|---|---|
| the lane's seven `packages/db` files, full 153-flag gate chain | `node --test --test-concurrency=1 $GATES tests/plan-reservation-namespace.test.mjs tests/errcode-catalog.test.mjs tests/accrual-correction.test.mjs tests/accrual-plan-authority-wall.test.mjs tests/authority-ref-human-instruction.test.mjs tests/tenancy-agent-twins.test.mjs tests/plan-overlap-template-arm-retired.test.mjs` | **64 pass, 0 fail, 0 skipped** (was 62 before the two new #1149 cells) |
| `plan-reservation-namespace.test.mjs` alone | same chain | **8 pass, 0 fail** (was 7 — one new cell) |
| `errcode-catalog.test.mjs` alone | same chain | **7 pass, 0 fail** (was 5 — two new cells) |
| AC4's own set: all 15 CLR importers | same chain, one invocation | **339 tests, 337 pass, 2 fail** — both inherited, §1 SPEC-1149-03 |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (rule 8) | same chain | **33 tests, 32 pass, 0 fail, 1 skipped** (T19 `poison-role`, correctly gated behind `CLARA_RIG_ALLOW_RESET`, which this rig never sets) |
| rule (d): a migration file changed | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 pass, 0 fail, 0 skipped.** No barrier entry owed: 0364 is static DDL and is not in `REVIEWED_DYNAMIC_SQL_BARRIERS`, and the corpus keys on file **content**, so the edit was re-measured by the run itself |
| `pnpm typecheck` | worktree root | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | worktree root | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | worktree root | **OK — 347 verified, 60 modules, 3 retired** |
| frozen-law diff | `git diff --name-only ffb629d73..HEAD -- packages/runtime apps/web frozen-workflows.json` | **empty** |

Not run, correctly: `apps/web`'s whole unit suite and every browser walk (this round touches no
`apps/web` source — only the pins test rule (d) mandates); `packages/runtime`'s unit files and
parts-parity (no `packages/runtime` file touched); a second from-scratch chain (closing risk 1
reserves it to the integrator on a disposable cluster).

## 4 · Docs updated in the same commits

- `packages/db/README.md` § 0364 — **its own new section only**, per the shared-files table. Four
  changes: the §-table's row B attribution (ADV-06); the within-lane residual paragraph now carries
  ADV-01's driven transcript and points at the roster; a new **"Redo (#957), and what the prestate's
  marker is"** paragraph saying in terms that the marker is a substring test and why it is the full
  attribution; and the census paragraphs, which now describe `p1150.namespace.one_suffix_one_body` and
  state, under "What the census can and cannot see", the limit that survives ADV-02.
  The repository-wide "Redo (#957)" section at the top of that file was **not** touched — it is not
  this lane's section.
- `packages/db/tests/README.md` § `errcode-catalog.test.mjs` — five to seven cells, what
  `declaresClrMap` can and cannot see, and vacuity controls 5 and 6 with the shas.
- The fixture and cell docstrings carry the same statements at the point of use.
- `CONTEXT.md` — **not touched**: no new domain vocabulary (a reservation-suffix roster and a
  SQLSTATE catalog are rig plumbing).
- `packages/db/tests/rig-meta.mjs`, `packages/db/package.json`'s `$GATES` — **not touched**: this round
  mints no name and no gate.

## 5 · Successor contracts

**None owed.** Nothing in this round touches a frozen chat tool, a Work tool, `packages/runtime` or
any deploy-locked path; the proof is the empty diff and the clean freeze-lint above.

## 6 · Follow-ups worth filing (I wrote nothing to GitHub)

1. **Close the two within-lane reservation pairs** (SPEC-1150-02, ADV-01's residual): recut
   `clara._prepayment_schedule_core` + `clara.replace_prepayment_schedule` off the shared `:plan`, and
   `clara._revenue_recognition_core` + `clara.replace_revenue_recognition_schedule` off the shared
   `:rrplan`. Attach ADV-01's driven transcript. On landing, the roster entries in
   `ACKNOWLEDGED_SHARED_DERIVERS` must be deleted — `p1150.namespace.one_suffix_one_body` says so by
   name if they are not.
2. **Type `clara._reserve_op`'s reuse raise** (#1077 follow-up 2), now with ADV-07's measured pair
   attached: the accrual door answers `op_key_conflict` with a typed detail; the tenancy door answers
   the identical mistake with `detail = null`.
3. **`clara_intS6` carries two stale `clara.sst_rate_schedule` rows** left by
   `f-t1-sst-reference.test.mjs` on 2026-09-25, so every closing-wave lane database cloned from it
   reds that file's cells 3 and 7 on a first run. Worth a rig note or a cleanup before the next
   template copy, and worth knowing before the integrator reads a red there as a lane's doing.
4. **The census's local-variable blind spot** (ADV-02's residual): if a deriver is ever written as
   `v_key := p_op_key; … v_key || ':x'`, the instrument needs the SQL-side filter widened too. Stated
   in the README rather than left to be rediscovered.

## 7 · Anything unverified

- **The whole `packages/db` suite was not run**, by design: the reviewers assign it to the integrator
  on a fresh clone, and this lane has no clean template to clone from (§1 SPEC-1149-03). What was run
  instead is AC4's own literal set, all 15 files.
- **The from-scratch chain** (AC7) remains the integrator's, per CLOSING-PLAN risk 1. The FIRST-APPLY
  arm was proved in a rolled-back transaction for `clara._obo_plan_core` specifically, which is the
  branch the ADV-03 edit sits beside; the other five bodies' FIRST arms were proved by the adversarial
  reviewer against the pre-edit file and their pins did not move.
- **The three neighbouring cells' pre-0364 arms** were still never executed on any database here —
  `clara_c02` carries 0364 and nothing on this host predates it.
