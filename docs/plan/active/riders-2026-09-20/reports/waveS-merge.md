# Riders sweep wave S, the integration merge

**Branch** `integration/riders-sweep` in `C:\Users\zhant\Desktop\clara-wt\636`, cut from
`origin/main` `3bf6aa94d` (the merged and released cut phase plus its docs).
**COMPLETE. Head: `d812c2124`**, all EIGHT lanes merged: L1, L2, L3, L4, L5, L7, L8, L6. L8 was
merged ahead of L6 on the orchestrator's ruling (§14), and L6 last (§16). The final gates are §17 and
what they do not cover is §18.

This report was written as the merge ran, across two pauses, and is extended rather than rewritten.
§12 is the first pause, at six lanes and head `869400729`, where the ordering question was handed up;
§15 is the second, at seven lanes and head `cba214203`. Both are left as written, so the counts in
each section are the counts taken at that head.

**Integration database.** Every chain was created from the pristine `clara_l02` template on
`127.0.0.1:55742` (312 files, head `0323_trade_invoice_probe_self_exclusion`, `0295` at the post-fix
checksum `5196d64d…`, 20 `clara%` roles), which was never written to. The chain was replayed from
that template four times, each replay forced by a recut of an already-applied file, and the one every
count is taken on is the LAST: **`clara_intS6`, 337 files, head `0361`**, the true ordered chain of
every migration in the wave with the overflow block applied last (§14.3, §17). Lane L6 adds no
migration, so that chain is final. `clara_intS` through
`clara_intS5` are left in place as evidence of the replays that retired them.

Nothing was pushed, no pull request was opened, no GitHub object was written, no lane worktree and
no file in the main checkout but this report was touched.

This report is written as the merge runs and is extended, never replaced.

---

## 0 · The static cross-lane sweep, before the first merge

Wave 4's first lesson is that a lane can be green and still be wrong about a body another lane owns,
and that only reading the two files against each other finds it. So every sweep-wave migration file
was read for the bodies it CREATES or REPLACES and the bodies it PINS, and the two sets were crossed
by lane and by migration number, before anything merged. The scanners are
`scratchpad/riders/sweep-cross.mjs` and `sweep-cross2.mjs`; the second one widens the first by
treating any 64-hex literal with a body name in its window as a pin, which catches lane L1's
named-constant idiom that the array-of-pairs matcher misses.

**One body is written by two lanes.**

| body | lanes | how it was settled |
|---|---|---|
| `clara._obo_plan_core(text,uuid,…,jsonb)` | L1 (0330), L2 (0338) | Settled on the lane, not at integration: 0338 §E is one static body that branches at RUN TIME on `to_regprocedure('clara._assert_plan_authority(…)')`, and its §0 pins the body BIMODALLY, `2049c1c4…` (0308's shape, a chain without L1) or `149b4a3d…` (0330 §C's post-image). The chain took the second arm and printed it. Verified on the catalog afterwards rather than trusted: see §2. |

**Eight later files pin or name a body an earlier lane rewrites.** Each is a refusal risk on the
integrated chain, and each is listed here so the chain's own verdict can be checked against a
prediction rather than discovered.

| later file | names/pins | written earlier by | prediction |
|---|---|---|---|
| 0338 (L2) | `_assert_plan_authority`, `_obo_plan_core`, `create_accounting_plan`, `_plan_admit_occurrence` | 0330, 0332 (L1) | handled on the lane (bimodal pin, named-invariant assertions) |
| 0344 (L5) | `_payroll_entry_plan`, `_payroll_posting_verdict` (sha) | 0343 (L4) | **refusal expected**, recut owed |
| 0360 (L5) | `_payroll_posting_verdict`, and it reads `clara.list_review_queue` | 0343 (L4), 0352 (L8) | **refusal expected**, recut owed |
| 0352 (L8) | `_payroll_posting_verdict` (sha) | 0343 (L4) | **refusal expected**, recut owed |
| 0353 (L8) | `create_accounting_plan`, `_obo_plan_core`, `_accrual_plan_core`, `_authority_ref_refusal`, `create_prepayment_schedule_for` | 0330, 0331 (L1), 0338, 0335 (L2) | **refusals expected**, L8 recuts on the integrated post-image |

Nothing else in the wave crosses a lane boundary. In particular no later file writes or pins
`clara._plan_admit_occurrence` (L1's 0332 alone), `clara._assert_claim_basis` (L3's 0339 then 0340,
one lane, in order), `clara._fa_assert_code_unreserved` or `clara.upsert_fa_account_profile` (L2's
0337 then its own 0361, and no file between 0339 and 0353 touches either).

### The frozen law, checked once per lane before any merge

Every entry carrying a `sha256` in `origin/main`'s `frozen-workflows.json` was collected, **350**
(347 workflow entries plus 3 recorded retirements), every key repository-relative under `packages/` -
and crossed with each lane's own changed-file list. **All eight lanes are clean**: no lane edits a
file that is frozen on main. `packages/runtime/lib/fa-particulars-proposal.ts` IS frozen, and lane L5
had already moved its block out into the new `packages/runtime/lib/fa-proposal-grounds.ts`, which is
why that lane passes rather than by luck.

`node scripts/check-frozen-workflows.mjs` on the base `3bf6aa94d`: **OK, 347 frozen, 60 `"use
workflow"` modules, 3 retired.** That is the baseline every per-lane run below is compared against.

---

## 1 · Lane L1, `riders/wS-lane01` → `a0129e13b`

#1051 #1080 #1074 #1073 #1075 #1070 #1071. Migrations **0330 0331 0332 0333 0334**. 23 commits,
40 files, +7220 / −64. Readiness: `waveS-lane01-recheck.json` verdict **accept**, its three open
findings all `minor`/`note` and all marked "open, by design" as integration-time or owner actions
(they are carried to §9, not reworked).

**Two conflicts, both the cut phase's own tail against the lane's.**

| file | resolution |
|---|---|
| `packages/db/package.json` | Ordered union of the `$GATES` chain. Main's **128** tokens stay as a byte-identical prefix; the lane adds five, in migration order. **133 tokens, none twice.** The lane's branch was missing main's last three (`client-financial-pack-wake-read` 0320, `work-source-correction-rederivation` 0321, `trade-invoice-probe-self-exclusion` 0323) only because it was cut before the cut phase merged; taking the union rather than a side keeps all of them. |
| `packages/db/README.md` | Ordered splice. Both sides appended a new section block at the same position: main's `## 0320`, the lane's `## 0330` to `## 0334`. Sections are ascending by migration number afterwards, `0318 → 0320 → 0330 … 0334`. |

Auto-merged and then read rather than trusted: `apps/web/messages/en.json` (**+6 / −2**, four new
keys at their sorted position inside the lane's own section and two corrected sentences; no
re-serialization, and an independent scanner that does not use `JSON.parse` reports **no duplicate
key** across 7072 keys), `apps/web/test/manifest.txt` (**one line**, at its sorted position),
`packages/db/tests/rig-meta.mjs` (+68, cohorts only), `CONTEXT.md`, `apps/web/README.md`.

**Migrations on `clara_intS`.** All five took their **FIRST APPLY** branch and every tail printed OK.

```
0330 prestate: FIRST APPLY — _authority_ref_refusal byte-identical to its #977 pre-image,
                both plan doors in the first state, _assert_plan_authority not yet minted
0331 prestate: FIRST APPLY — both doors already call the predicate; _accrual_plan_core first state
0332 prestate: FIRST APPLY — _plan_occurrence_basis byte-identical and still IMMUTABLE
0333 prestate: FIRST APPLY — both existing remedies byte-unchanged; 5 bodies reach the admission core
0334 prestate: clean — exactly one starting shape of list_accrual_adjustments (three-argument)
migrate: 5 new migration(s) applied · 317 total
```

**Gates.**

| check | result |
|---|---|
| the lane's nine db batteries under the full 133-gate chain | **68 tests, 68 pass, 0 fail, 0 skipped** |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** (T19 skips itself without `CLARA_RIG_ALLOW_RESET`, which RIG.md forbids) |
| `pnpm typecheck` | **exit 0**, `apps/web` and `packages/runtime` both Done |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 / 60 / 3**, unchanged from the base |
| lane files vs main's frozen manifest | no hit |

Ledger after L1: **317 files, head `0334_accrual_list_side_filter`.**

---

## 2 · Lane L2, `riders/wS-lane02` → `a8b027c23`

#1114 #1077 #1079 #1078 #1050. Migrations **0335 0336 0337 0338**, and **0361** from the overflow
block, which the chain applies after 0353. 36 commits. Readiness: the lane was in its second fix
round when the merge reached it; `waveS-lane02-recheck-2.json` landed with verdict **accept** and
zero open findings at head `3c48235af`, which is the head merged here.

**Two conflicts, the same two shared files, resolved the same way.**

| file | resolution |
|---|---|
| `packages/db/package.json` | Ordered union, then an explicit re-order of the wave tail by migration number. **138 tokens**: main's 128 as an identical prefix, then `0330 0331 0332 0333 0334 0335 0336 0337 0338 0361`. None twice. The ordering is derived from each gate file's own text (every one names the migration it guards) rather than from the order the branches happened to append in. |
| `packages/db/README.md` | Ordered splice again; sections ascending `0320 → 0330 … 0338 → 0361`. |

Shared files after the resolution: `en.json` **+32 / −9** against main, **no duplicate key** across
7091 keys; `manifest.txt` **+2**; `apps/web/tests/firm-scope-db-pins.corpus.ts` **+11** (L2's own
rows); frozen manifest still **OK, 347 / 60 / 3**.

**Migrations on `clara_intS`.** 0335, 0336, 0337 and 0338 applied; **0361 was withheld** from this
step (see §2.2).

```
0338 prestate OK -- 3 FIRST, 0 REDO --
  clara._authority_ref_refusal(text,uuid,uuid,uuid)=FIRST
  clara._prepayment_schedule_core(...)=FIRST
  clara._obo_plan_core(...)=FIRST(0330/#1051)      <-- the cross-lane arm, taken
migrate: 4 new migration(s) applied · 321 total
```

`FIRST(0330/#1051)` is the whole cross-lane question answered by the chain itself: 0338 recut the
twin from **L1's post-image**, not from 0308's.

**And the body it installed keeps both lanes' work**, read off the live catalog rather than inferred
from the prestate line:

| body | calls `_assert_plan_authority` | knows `standing_instruction` | sha256(prosrc) |
|---|---|---|---|
| `clara._obo_plan_core` | **yes** (L1) | **yes** (L2) | `1105f9f2…` |
| `clara.create_accounting_plan` | yes |, | `544cd88e…`, which is 0330's own measured `c_human_post` |
| `clara._accrual_plan_core` | yes |, | `89d2ac3a…` |
| `clara._authority_ref_refusal` |, | yes | `1b090889…` |

Neither lane's behaviour was silently dropped, which is the wave-4 failure class this seam was most
exposed to.

### 2.1 · The one integration finding, and its fix, `fefcd1b9b`

**`packages/db/tests/prepayment-close-standing-instruction.test.mjs`'s `p1050.authority.wall_route`
asserted that L1's predicate is ABSENT.** Wave 4's class exactly: true on lane L2's own rig, false
the moment L1 merges, and no cell on either branch could see it.

- **Seen red at the merged head before the fix**: `#1051's predicate is already on this rig, this
  cell's two branches are no longer both reachable`, `false !== true`, the file's other 17 cells
  green.
- **Green after**: **18 / 18**, and the recut cell reports the shape it found
  (`driven-with-0330`).

The cell is the one that holds *what a merge can move*, so weakening it was not an option. It now
READS the catalog instead of pinning it, and where the predicate is present it drops it **inside the
cell's own already-rolled-back transaction**, which keeps the fallback arm reachable and leaves every
assertion below exactly as strong as it was. A plpgsql body naming a function resolves at run time
and records no `pg_depend` edge, so the drop needs no cascade and the three plan bodies that call the
predicate are untouched by it. The after-check was strengthened rather than relaxed: it now proves
the transaction left the catalog exactly as it found it *in both shapes*, and that the live predicate
is L1's body and not this cell's stand-in.

No production code and no migration changed, so the applied chain stands.

### 2.2 · 0361 applied early on `clara_intS`, and what that does and does not prove

The overflow file `0361_reservation_release_advice.sql` belongs at the END of the chain, after 0353.
The apply step withheld it (the runner was pointed at a staging mirror of the migrations directory
that holds every file but the two overflow ones), and `migrate` correctly reported four files.

**The db test harness then applied it anyway**: `packages/db/tests/rig-helpers.mjs:379`'s
`ensureReady()` calls `migrate()` itself, from the default migrations directory, so the first battery
run took `clara_intS` to **322 files, head `0361`**. That is recorded rather than undone.

What it costs and what it does not:

- 0361 pins `_fa_assert_code_unreserved`, `upsert_fa_account_profile`, `_fa_role_claim_conflict`,
  `_acct_role_reserved`, `_adj_line_eligibility_breach`, and reads `_draft_opening_item_core`. The
  static sweep in §0 shows **no file between 0339 and 0353 writes any of them**, so applying it at
  0338 instead of at 0353 presents it with the same prestate either way.
- It does mean `clara_intS` is not, by itself, proof of the FINAL file order.
- **The authoritative ordered chain is therefore run at the end, from scratch, on a second database
  created from the same pristine template**, where `migrate` sorts by number and applies
  `0330 … 0353`, then `0360`, then `0361`. That run is where 0360's and 0361's prestate pins get
  their real test, and it is recorded in §8.

**Gates after L2.**

| check | result |
|---|---|
| the lane's eight db batteries under the full 138-gate chain | **67 tests, 67 pass, 0 fail, 0 skipped** (before the §2.1 fix: 67 / 66 / 1) |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `pnpm typecheck` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 / 60 / 3** |
| lane files vs main's frozen manifest | no hit |

Ledger after L2: **322 files, head `0361_reservation_release_advice`** (0361 out of its final
position, §2.2).

---

## 3 · Lane L3, `riders/wS-lane03` → `0a643357b`

#1067 #1052 #1066 #1068 #1069. Migrations **0339 0340 0341**. 25 commits. Readiness:
`waveS-lane03-recheck.json` verdict **accept**, zero open findings.

**Three conflicts.**

| file | resolution |
|---|---|
| `packages/db/package.json` | Ordered union then ordered re-insert. **141 tokens**, wave tail `0330 … 0341` then `0361`, none twice. |
| `packages/db/README.md` | Ordered splice **by section number**, which is the first place it mattered: a naive keep-both would have put this lane's `## 0339` to `## 0341` AFTER lane L2's overflow `## 0361`. The splice cuts both sides into whole `## NNNN` sections and re-sorts, so the file still reads ascending. |
| `apps/web/README.md` | Both sides' ticket sections kept. That file is organised by ticket, not by number, and wave 4 resolved it the same way three times. |

Shared files: `en.json` no duplicate key across 7095 keys; `manifest.txt` **+3** against main.

**Migrations.** All three FIRST APPLY, all tails OK, including 0340's own driven check that "Ali"
matches "  ali  " and is refused against "Ali B". The apply recorded here is the one on the rebuilt
database, §4.

---

## 4 · The rebuild, and why the per-lane database was replaced twice

Recorded because it changes how every count above and below was taken.

**First rebuild, `clara_intS` to `clara_intS2`.** §2.2 records that the db test harness applies
migrations itself, from the DEFAULT migrations directory. On `clara_intS` that put `0361` on the
ledger at head `0338`, and L3's `0339` then refused, correctly and by name:

```
migrate: FAIL — migration 0339_staff_expense_claim_empty_allocation (number 339) is at or below
the highest applied number (361) but was never applied — a late-inserted lower number would run
out of order.
```

`clara_intS2` was created from the same pristine template and `CLARA_MIGRATIONS_DIR` was exported for
**every** command from then on, tests included, so the harness migrates from the staged mirror too
and the two overflow files stay out until the end. Every gate re-ran there. The mirror is a
byte-identical copy of `packages/db/migrations` minus `0360` and `0361`; a migration checksum is over
file content, so a copy carries the same checksum, and the files a test reads by repository path are
untouched by it.

**Second rebuild, `clara_intS2` to `clara_intS3`.** The integration fix in §5 edits `0338`, and an
applied migration's checksum is immutable, so the chain was replayed from the template a third time.
`0338` is not the highest applied version, so `CLARA_MIGRATION_REDO` is refused by design and a
replay is the only correct instrument.

`clara_intS3` is the database every count from here on was taken on: `0001` to `0341` at that point,
**324 files**, from the pristine 312-file template.

---

## 5 · The second integration finding, the one wall, and the copy that came back

**`b364f5fde`.** This is the wave's cross-lane finding, and it is wave 4's `_obo_plan_core` lesson
one turn further on.

**What collides.** Lane L1's #1051 (0330) folds the plan authority wall into one predicate, and its
cells measure that fold as a RULE over the whole `clara` schema: no body may both call
`clara._assert_plan_authority` and keep a copy of the wall's own sentence. Lane L2's 0338 recut
`clara._obo_plan_core` as a body that chooses its wall at RUN TIME, delegating where the predicate
exists and carrying 0308's block verbatim where it does not, so that the file could apply to a chain
that had not yet taken #1051. On the integrated chain the twin was **both**, and three cells across
two lanes went red at the merge. No cell on either branch alone could see it.

| cell | file | lane |
|---|---|---|
| `p1051.wall.one_definition` | `plan-authority-wall.test.mjs` | L1 |
| `p1080.wall.one_spelling` | `accrual-plan-authority-wall.test.mjs` | L1 |
| `p977.definition.one` | `authority-ref-human-instruction.test.mjs` | L1 |

**The resolution is the file's own.** 0338's note on the fallback reads: *"it is reachable ONLY while
`clara._assert_plan_authority` does not exist ... and the whole `elsif` arm can be deleted the day
#1051 is on every chain."* That day is this merge. 0330 and 0338 ship together and 0330 is the lower
number, so no chain this file can ever reach lacks the predicate. So:

- **§E's fallback arm is deleted** and the delegation is unconditional. This is the wave's own rule,
  the later file recutting from the earlier file's post-image, applied to a branch rather than a pin.
- **§0 gains check 4c**, which REFUSES to apply 0338 without the predicate. A prerequisite belongs in
  the prestate, not in a body that would fail at its first call.
- The now-unused `v_ref_kind` declaration goes, and the file's own prose and its
  `packages/db/README.md` section are corrected rather than left describing a branch that is gone.
- **§0's bimodal pin is untouched.** It still admits `2049c1c4…` (0308 §D) or `149b4a3d…` (0330 §C)
  or this file's own recut. What moved is the body 0338 INSTALLS, never the bodies it accepts finding.

**Behaviour is unmoved, and that was measured before the deletion rather than asserted after it.**
The lane had already driven all eight authority axes through both routes and found them identical,
code and `detail` byte for byte: `authority_rule_unsupported`, `invalid_authority_kind`,
`authority_ref_invalid` on each of `object` / `kind` / `id`, the explicit-with-standing-ref pairing,
and `authority_ref_unresolved` on both reference kinds (`waveS-lane02-fix.md`).

**Why not weaken L1's cells instead.** A dormant second copy of an authority wall is exactly the
drift #1051 exists to close, and wave 4's fourth lesson is that a disclosed residual is only safe
while nothing measures it. Three cells measure this one.

### 5.1 · And one roster genuinely widens

`p977.definition.one` expected exactly `_assert_plan_authority` and `sign_depreciation_authority` to
read `clara._authority_ref_refusal`. That is not a dead-code artefact and deleting the fallback does
not fix it. **#1050's `standing_instruction` is a kind the twin answers ITSELF**, deliberately
outside the shared predicate (0338 tail item 6 refuses folding it in, because that would admit a
firm's blanket delegation at the HUMAN plan door too), and answering it means resolving it, through
the same #977 resolver every other kind goes through, at firm scope.

So `_obo_plan_core` is a reader again, and that is #977's closed world HOLDING on the machine lane
rather than escaping it. The cell now admits it, feature-detected off
`clara.firm_standing_instructions` the same way it already feature-detects the twin's own presence,
and stays an exact closed world: a fourth reader still reds it.

`p1050.authority.wall_route` was recut twice. The first recut (`fefcd1b9b`, §2.1) taught it to read
the chain instead of pinning it; the second, here, removed the arm it drove, because that arm no
longer exists. It now proves what the recut body claims: the twin keeps no wall of its own, it calls
the predicate for every kind but one, and its own kind never reaches it.

### 5.2 · The census on the recut chain, read off the catalog

Measured on `clara_intS3` at 0341:

| body | calls the predicate | carries the wall's sentence | reads `_authority_ref_refusal` |
|---|---|---|---|
| `_assert_plan_authority` |, | **yes, the only one** | yes |
| `_obo_plan_core` | yes | no | yes |
| `create_accounting_plan` | yes | no | no |
| `_accrual_plan_core` | yes | no | no |
| `sign_depreciation_authority` |, | no | yes |

| check after the recut | result |
|---|---|
| L1 + L2 + L3 batteries, full 141-gate chain | **214 tests, 207 pass, 0 fail, 7 skipped** |
| the 7 skips | the `p1078fix.*` cells of `reservation-release-advice.test.mjs`; 0361 applies at the END of the chain, so they skip loudly here and are re-run in the final section |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK**, 1550 function definitions and 252 patches scanned, **the same 20 justified waivers** as before the recut (it adds none) |
| `pnpm typecheck` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 / 60 / 3** |
| the web pins corpus | 0338 is **not** a reviewed dynamic-SQL barrier and carries no corpus row, so no pinned sha moved; the corpus is re-measured in full at the end |

---

## 6 · Lane L4, `riders/wS-lane04` → `fb9446379`

#1061 #1059 #1060 #1048. Migrations **0342 0343**. 23 commits. Readiness:
`waveS-lane04-recheck.json` verdict **accept**, zero open findings.

**Four conflicts, and one of them is the only place in this merge where a lane would have undone
another lane's shipped behaviour.**

| file | resolution |
|---|---|
| `apps/web/messages/en.json` | **BY INTENT, not by side.** L1's #1073 added a THIRD accrual/bill-conflict remedy and corrected the two plan-not-active sentences from "neither remedy" to "none of the remedies"; L4 was cut before L1 merged and still carried the stale pair. Taking either side whole would have lost something. The merged file keeps **L1's two corrected sentences** and **L4's five new payroll-completeness keys**. No duplicate key across 7112 keys. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | The barrier map's **key order is load-bearing** (the census compares it to the file-sorted corpus) and the conflict cut through the middle of one entry. Each side was closed into a whole entry and the two ordered by file name: **0343 then 0361**. |
| `packages/db/package.json` | **142 tokens**, wave tail `0330 … 0343` then `0361`. |
| `packages/db/README.md` | Ordered splice; `0342` and `0343` land before `0361`. |

**Migrations.** Both applied, both tails OK. 0343 is the one that adds the **seventeenth** row kind to
`clara.list_review_queue`; the header census wave 4 had to fix by hand stays consistent here, because
0343's own tail re-derives all sixteen pre-existing markers at their exact counts and the seventeenth
exactly once. 0342 re-publishes the capability registry at version 7, which 0343 then raises to 8.

| check | result |
|---|---|
| the lane's six db batteries, full 142-gate chain | **141 tests, 141 pass, 0 fail, 0 skipped** |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `pnpm typecheck` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 / 60 / 3** |
| lane files vs main's frozen manifest | no hit. `frozen-evaluators.json`, which this lane edits, is a different file and is not in the workflow manifest |

Ledger after L4: **326 files**, head `0343_payroll_completeness_witness`.

---

## 7 · Lane L5, `riders/wS-lane05` → `b04f8719b`

#1056 #1090 #1092 #1093. Migrations **0344 0345 0346**, and **0360** from the overflow block, which
the chain applies after 0353. 23 commits. Readiness: `waveS-lane05-recheck.json` verdict **accept**,
zero open findings.

**Four conflicts.**

| file | resolution |
|---|---|
| `packages/db/tests/rig-meta.mjs` | The `cohortFailures` block wave 4 resolved by hand four times, met here for the first time in this wave: two bimodal cohort guards, HEAD's `#1050 [0338]` and the lane's `#1056 [0344]`, sharing one closing brace. HEAD's guard is closed explicitly and the shared brace closes the lane's. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | Ordered splice again, each side closed into whole entries first: **0343, 0360, 0361**. |
| `packages/db/package.json` | **146 tokens**, wave tail `0330 … 0346` then `0360` and `0361`. |
| `packages/db/README.md` | Ordered splice; `0360` lands before `0361`. |

This lane is the one the frozen law was most exposed to: `packages/runtime/lib/fa-particulars-proposal.ts`
IS frozen on main, and the lane had already moved its two grounds out into the new
`packages/runtime/lib/fa-proposal-grounds.ts` for exactly that reason. The per-lane check confirms it
rather than trusting it: no L5 file appears in main's manifest.

### 7.1 · The third integration finding, three of them, in one file (`00d916b9d`)

The chain refused on 0344, and what it refused on was not the collision the static sweep predicted.

**Finding 1, a SILENT LOSS against the RELEASED cut phase, not against another lane.** 0344 §G pastes
`clara.revise_document_fact` **whole**, and this lane was cut from main BEFORE the cut phase merged,
so its paste is 0268 §B's body. The cut phase's `0321_work_source_correction_rederivation.sql`
(#1030, on main and released) makes exactly ONE substitution in that body: the no-op guard passes
`p_field_path`, so it asks the TYPED notion and a re-cased `MYR` or a respelled date stops retiring
every Work parked on the document. **Pasting the two-argument call back would have removed that rule
with nothing to notice it**, both overloads are live, so no call would have failed, and this file's
own tail checked the line by its two-argument substring, which the pre-0321 shape satisfies.

This is wave 4's `create_accounting_plan` class one step wider: the sweep in §0 crossed the wave's
own files against each other and found nothing here, because **the file that moved this body is not
in the wave at all**. That is the lesson this finding adds: a lane cut before a release must be read
against the RELEASE too, not only against its siblings.

Fixed the wave's own way, by re-deriving the later file from the earlier file's post-image: the
substitution is carried over verbatim from 0321 §B, and the tail's needle moved with it.

**Finding 2, the feature would have shipped DARK.** 0344's revision door admitted `state_version:
v1` and nothing else, and the reason it gave, in its own words, was that `clara._payroll_entry_plan`
refuses any other value. Lane L4's #1048 changed **exactly that body**: it mints
`clara.evaluate_payroll_run_state_v2`, stamps `v2` on every state banked from 0343 on, and recuts the
drafting body to take BOTH versions by name. Left at `v1`, this door refuses every reading banked
after 0343, #1056's whole feature unreachable on the integrated chain, with both lanes green.

- **Seen red at the merged head**: seven cells of `payroll-fact-revision.test.mjs`, each
  `the banked payroll state is not a v1 fact state this door can revise`.
- The test now follows its own stated reason rather than its literal, in 0343's own spelling
  (`not in ('v1','v2')`).
- **A v2 state survives the body whole**, read rather than assumed: the return is
  `p_state || jsonb_build_object(...)`, a shallow merge over five keys, so `state_version` and
  #1048's own `completeness` object are carried through untouched. A person declaring a run figure
  can never erase the completeness witness a colleague gave.

**Finding 3, four pins are now bimodal**, each named with the file that produces the second shape.

| body | lane's pin | integrated shape | moved by |
|---|---|---|---|
| `clara.revise_document_fact` | `6c5b63a8…` | `e0d7ee1c…` | 0321, the cut phase |
| `clara.persist_payroll_facts` | `63633a3f…` | `529a8260…` | 0343, lane L4 |
| `clara._payroll_entry_plan` | `9889780c…` | `a584ced7…` | 0343, lane L4 |
| `clara._payroll_posting_verdict` | `23c644b7…` | `378086 06…` | 0343, lane L4 |

The seven other pins in the file were re-measured and hold. Nothing is loosened: a body at neither
shape still refuses BY NAME, and §A gained a prerequisite check that
`clara._fact_value_changed(jsonb,jsonb,text)` exists at all, because §G now calls it unconditionally.

**Read against L4 by intent rather than pinned blind.** §D's `clara._payroll_state_with_human_fact`
calls no evaluator (its own comment says so and its tail re-reads it), it re-derives its three buckets
from the STORED state by a bucketing rule 0343 does not touch, and 0343's two new witness keys are
OPTIONAL additions to `clara._payroll_answers_ok`'s vocabulary that leave the ELEVEN REQUIRED run
questions exactly where they were. The revisable set deliberately excludes both witnesses, because a
witness is answered at its own append-only door and admitting it here would let the generic fact door
write past that table; the comment that claimed the set was "the eleven questions persist writes a
region for" is corrected to say so.

One cell moved with them: S3's assertion that the state version is the literal `"v1"` becomes an
assertion that the door **does not rewrite it**, which is strictly stronger, it fails on a door that
moves the version in either direction, which a literal never would.

| check | result |
|---|---|
| lane L5 batteries, full 150-gate chain | **53 tests, 49 pass, 0 fail, 4 skipped** (0360's own cells, applied at the end of the chain) |
| lanes L1 to L4 batteries, re-run whole after the recut | **355 tests, 348 pass, 0 fail, 7 skipped** |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `packages/runtime/tests/fa-particulars-proposal-unit.test.mjs` | **35 / 35** |
| `pnpm typecheck` | **exit 0** |
| `check-wiki-dynamic-sql`, `check-frozen-workflows` | **OK** / **OK, 347 / 60 / 3** |

Ledger after L5: **329 files**, head `0346_fa_retired_policy_agent_read`.

---

## 8 · Lane L7, `riders/wS-lane07` → `3107b1d52`

#1047 #1098 #1046 #1132 #1096 #1099 #1094 #1095. Migrations **0347 0348 0349 0350**. 27 commits.
Readiness: `waveS-lane07-recheck.json` verdict **accept**, zero open findings.

**Three conflicts**, all shapes this merge had already met: the gate chain (**150 tokens**, wave tail
`0330 … 0350` then `0360` and `0361`), the README's ordered splice, and rig-meta's `cohortFailures`
block for the third time.

**The six census files, cross-read against L1 as the plan asks.** The one both lanes edit,
`packages/db/tests/plan-overlap-template-arm-retired.test.mjs`, auto-merged and was then READ against
both sides rather than trusted. Both are present and both are right:

- L1's two re-based pins, `clara.create_accounting_plan` at `544cd88e…` and `clara._accrual_plan_core`
  at `89d2ac3a…`, each carrying the fold that moved it in prose beside it. **Both are the values this
  merge independently measured off the live catalog** after 0331 applied (§5.2), which is two sources
  agreeing rather than one branch's claim.
- L7's own collation fix on the wake-allowlist census read (`order by wake_kind collate "C"`).

**Migrations.** All four applied, all tails OK, including 0348's two prune verbs driven for real
against whatever population the server held, and 0350's `comment on` correction, which is #1058's
one-line answer instead of the 118-file rename the ticket asked about.

### 8.1 · The fourth integration finding, the queue pin ladder, again (`f1dd65c23`)

Wave 4's own integration fix #2, one wave on. `firm-portfolio-pack.test.mjs`'s
`p659.portfolio.no_recut` pins two bodies by sha256 through a ladder of generations, one per
migration family that has spliced them, and this wave splices both again above every wave-4
generation.

| body | ladder was | is now | spliced by |
|---|---|---|---|
| `clara.list_review_queue(jsonb,jsonb,int)` | `d5456ecc…` | `ae0ee7e6…` | L4's 0343, the seventeenth row kind |
| `clara.list_accounting_work(…11 args…)` | `dffa917d…` | `fc679a2d…` | L3's 0341, `allocation_count` |

Each lane is green alone and the ladder is wrong only on the chain. Both new generations are gated on
the splicing file's own **STEM**, never on a number, for the renumber hazard wave 3 lane 04 paid for.
Every earlier generation and every other pin in the map is untouched, and the three bodies neither
lane moves (`get_client_work_pack`, `_work_run_attempts`, `list_activity`) were re-measured and are
unchanged.

| check | result |
|---|---|
| the lane's twelve db batteries, full 150-gate chain | **110 tests, 110 pass, 0 fail, 0 skipped** (before the fix: 110 / 109 / 1) |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `packages/runtime/tests/reconcile.test.mjs` | **13 / 13** |
| `pnpm typecheck` | **exit 0** |

Ledger after L7: **333 files**, head `0350_via_wake_kind_lane_disclosure`.

---

## 9 · The ordered chain, from the template, with the overflow files LAST

This is the run §2.2 owes, and it is the one that proves the file order the release will use. Database
`clara_intS5`, created from the pristine `clara_l02` template and migrated with the REAL migrations
directory, so `migrate` sorts by number and applies `0330 … 0350`, then `0360`, then `0361`.

**0360 refused, exactly as §0 predicted**, and it was the last recut this pause owed:

```
migrate: FAIL — 0360_payroll_correction_sentences failed and was rolled back:
#1056 fix prestate: clara._payroll_posting_verdict(uuid) is at 378086068b13…,
expected the pinned pre-image 23c644b7b4ad… — another change moved it
```

0360 is lane L5's fix round and its two pins were measured on `clara_l03`, a chain of L5's own files
alone. On the integrated chain it is the last file but one, so **both** bodies it splices have been
moved again by files that apply before it. Both pins are now bimodal, each naming the file that
produces the second shape:

| body | lane's pin | integrated shape | moved by |
|---|---|---|---|
| `clara._payroll_posting_verdict(uuid)` | `23c644b7…` | `378086 06…` | L4's 0343 |
| `clara.revise_document_fact(…)` | `a6858d3e…` | `4b9a264d…` | this lane's own 0344, as recut in §7.1 |

**The splices themselves needed no change at all**, and that is the point of the 0146/0260/0297 idiom:
0360 counts its anchor and refuses unless it occurs EXACTLY once, and the `ready`-arm anchor survives
0343's recut intact (measured: 1 occurrence). It is the same splice applied to a longer body.

With that, the whole chain applies in true file order:

| step | result |
|---|---|
| `createdb -T clara_l02 clara_intS5` | 312 files, head `0323`, `0295` at `5196d64d…` |
| `pnpm --filter @clara/db migrate` | **23 new applied · 335 total**, `0001` → `0361_reservation_release_advice` |
| the order it took | `0330 … 0350`, then **`0360`**, then **`0361`**, the overflow block last, as the plan requires |
| `0361`'s prestate | **applied with no refusal**: its five pins and its `_draft_opening_item_core` read all still hold after every other lane's file, which is what §2.2 could not prove on its own |
| the overflow batteries (`payroll-correction-sentence`, `reservation-release-advice`, `payroll-fact-revision`, `prepayment-account-roster`) | **28 tests, 28 pass, 0 fail, 0 skipped**, the cells that skipped through the whole merge now run |
| `operation-census` + `rig-isolation` on the final chain | **33 tests, 32 pass, 0 fail, 1 skipped** |

---

## 10 · The end gates, on the merged head `869400729`

Every check below ran at that commit, on `clara_intS5` (335 files) and the Playwright triple
`https://127.0.0.1:3510 / 3511 / 3512`.

| check | result |
|---|---|
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, all four workspaces |
| `pnpm typecheck` | **exit 0**, `apps/web` and `packages/runtime` both Done |
| the WHOLE `apps/web` unit suite (`node scripts/run-tests.mjs`, 110 s) | **5249 tests, 5247 pass, 0 fail, 2 skipped** |
| the web pins corpus (`tests/firm-scope-db-pins.test.ts`) | **22 / 22** |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 frozen / 60 `"use workflow"` / 3 retired**, identical to the base |
| the frozen law, independently | **180 files changed against `3bf6aa94d`, and NOT ONE is a key in `origin/main`'s manifest** |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK**, 1559 function definitions and 256 patches scanned, **the same 20 justified waivers** the estate had before this wave |
| `packages/runtime`, `reconcile.test.mjs` + `fa-particulars-proposal-unit.test.mjs` | **48 / 48** |
| **browser walk** `accrual-walk` (L1) | **21 passed** (37.1 s) |
| **browser walk** `prepayments-walk` (L2) | **8 passed** (25.4 s) |
| **browser walk** `staff-expense-claim-walk` (L3) | **14 passed** (35.8 s) |
| **browser walk** `payroll-settlement-walk` (L4) | **3 passed** (9.3 s) |

L5 and L7 touch no `apps/web/e2e` file, so the four above are every walk a merged lane touched. L6's
`work-question-walk.spec.ts` is owed when that lane merges.

**The one web-suite red, and why it is not this merge's.** The FIRST whole-suite run reported
5249 / 5244 / 3 / 2, and two of the three were the pins-corpus mismatch fixed in `869400729`. The
third was `t728: a document already spoken for renders DISABLED with a reason…`
(`components/work/attach-evidence-dialog.test.tsx`), preceded in the log by React's own
"not wrapped in act(…)" warning, the load-flake class RIG.md already names. Reported both ways, as
RIG.md asks: **run alone it is 22 / 22 green**, and the second whole-suite run at the final head does
not reproduce it (**0 fail**). Neither the component nor its cell appears anywhere in this merge's
180-file diff, and no lane branch touches either.

**The web environment.** `apps/web/.env.local` is gitignored and absent from a fresh worktree, which
is what made lane C2's merge report a `next build` it could not run. It was copied into this worktree
from the main checkout so the four browser walks could actually be driven rather than deferred. It is
untracked (`git check-ignore` confirms `.gitignore:6`) and appears in no commit.

**Rig hygiene.** `clara_l02` was never written to. The runtime legs ran against a template CLONE
(`clara_rt_test`, created from `clara_intS5`, dropped afterwards) rather than against the chain
itself, so `clara_intS5` stayed pristine for the census. No `CLARA_RIG_ALLOW_RESET`, no role sweep,
no second from-scratch chain on a cluster that had already run one, no `git worktree` subcommand and
no git from WSL. The cluster holds `clara_l02` plus `clara_intS` … `clara_intS5`, and 20 `clara%`
roles, 0154's own count.

---

## 11 · The successor contracts the lanes wrote, for re-parenting to the mainline's next cut

Every merged lane's per-ticket report carries a "Successor contract" section, because the wave asks
for the check rather than a guess. Most say **none is owed** with the evidence for it, and those are
not repeated here. These are the live ones.

| ticket | report | target body | what must be carried |
|---|---|---|---|
| **#1048** | `waveS-lane04-ticket1048.md` §9.1, restated in `waveS-lane04-fix.md` | **`payrollFacts_v2`** | Add `payroll.run.employee_count` and `payroll.run.page_count` to `PAYROLL_RUN_FIELDS` as OPTIONAL fields, with the prompt stanza the report writes out. **Until it ships the two page-printed witnesses are exercised by 0343's battery and by nothing else**, the database half already admits the answers and needs no further change. Also `read_payroll_posting_state`'s own contract. |
| **#1093** | `waveS-lane05-ticket1093.md` | **`claraWork_v6`'s `loadFaProposalInputsStepV6`** | A correction to step (a)'s SQL for `particulars_complete`, which SUPERSEDES #933's own contract on that one point; everything else in #933's contract is unchanged. |
| **#1090** | `waveS-lane05-ticket1090.md` | the same `loadFaProposalInputsStepV6`-shaped step | The `depreciation_policy` knowledge read (the `client_knowledge` half), written out as imports, SQL and mapping ready to transcribe. |
| **#1092** | `waveS-lane05-ticket1092.md` | the same step | The retired-policy ground. Composes with #1090's half, **both feed the SAME `FaProposalInputs`**, so they are one edit, not two. |
| **#1056 fix round** | `waveS-lane05-fix.md` | `loadFaProposalInputsStepV6` at `packages/runtime/workflows/claraWork.v6.impl.ts:1323-1398` | The body is **deploy-locked**, so this lands as **`claraWork_v7`'s** own step (or whatever new `_vN` the cut family opens), never as an edit to v6. The record's read must ask more than `state = 'live'`. |
| **#1056** | `waveS-lane05-ticket1056.md` | a future `reviseDocumentFact` chat/Work tool | Not owed by the ticket; written down because the door's shape is fresh. Needed only if the owner ever rules that a bookkeeper may correct a payroll figure from the conversation. |
| **#1073** | `waveS-lane01-ticket1073.md` | a future chat/Work tool | The whole of what a tool needs to offer the third accrual remedy: `reverse_plan_occurrence`, `clara_authenticated`, bookkeeper floor, and its refusal vocabulary. No frozen body was edited. |
| **#1114, #1077** | `waveS-lane02-ticket1114.md`, `-ticket1077.md` | **`CUT-PLAN.md` §A8 and §A9** | **Two lines of the cut plan's refusal mapping are now WRONG** and are delivered in the reports rather than corrected in the branch, because `CUT-PLAN.md` belongs to the cut phase's own branches. `CUT-PLAN.md:210` (`START_PREPAYMENT_SCHEDULE_WORK_TOOL`) is named explicitly. Plus a guarantee the cut may now rely on: after 0336 a successor may derive both tools' operation keys from ONE seed without the second call colliding on a reservation it cannot name. |
| **#1050** | `waveS-lane02-ticket1050.md` | **not a chat/Work tool contract** | The two standing-instruction doors are `clara_authenticated`-only and admit no machine lane at all, which is the ticket's whole point. What is owed is a web contract on the signed-in member's session, plus a read-only stanza for the chat model. |
| **#1080, #1074** | `waveS-lane01-ticket1080.md`, `-ticket1074.md` | a later ticket's reference | Behaviour notes, not interfaces. #1074's is the one worth carrying: a plan reversal's admitted basis still carries **exactly** `{currency, lines, memo, posting_date}` and nothing else. |

Lanes owing none, each with its own evidence in its report: #1051, #1070, #1071, #1075 (L1); #1078,
#1079 (L2); #1052, #1066, #1067, #1068, #1069 (L3); #1059, #1060, #1061 (L4); every L7 ticket; and
every L6 ticket, #1044 #1124 #1126 #1127 #1128 #1129 #1131 #1141, each of which states it touches no
frozen chat or Work tool surface and most of which touch no `packages/runtime` file at all.

**COMPLETED AT DONE.** Lane L8, whose two tickets exist to land tools in the frozen chat family,
carries no OUTSTANDING successor contract of its own: #1136 and #1137 BUILT their database half in
0352 and 0353, and the tools that consume them are the cut family's next version. The one obligation
the merge itself created is recorded here rather than on a lane:

| what | where | why it is owed |
|---|---|---|
| **0353 follow-up 1 is HALF DONE** | `packages/db/README.md` §0353, and §14.2 above | That follow-up asks for `clara._tenancy_plan_core` to be absorbed into `clara._obo_plan_core` as a two-line widening of its closed kind set. The merge landed the half #1051's census forced: the step no longer keeps its own authority wall. The OTHER half, folding the whole body into the twin, is still open and is still worth doing, because the estate still has two plan-step bodies where one would do. |

---

## 12 · WAITING, why the merge pauses here, and what resuming needs

Six of the eight lanes are merged, in migration order: **L1, L2, L3, L4, L5, L7**. The seventh in
order is **L6**, and it is not ready.

| lane | order | readiness at this pause |
|---|---|---|
| L6 | 7th | **not ready.** Its three reviews have landed (`waveS-lane06-codereview-standards.json`, `-codereview-spec.json`, `-review-adversarial.json`, the newest at 16:50) but there is **no fix report and no `waveS-lane06-recheck.json`**. The readiness gate is a recheck verdict of `accept`, or `accept-with-fixes` with nothing above minor, and neither exists yet. |
| L8 | 8th | **READY, and it became ready during this pause.** `waveS-lane08-fix.md` landed at 17:49 and `waveS-lane08-recheck.json` at 17:59, verdict **accept**, zero findings. Its branch now carries 20 commits. |

The merge order is by migration number and **L6 is next**, so this merger stops here rather than
taking L8 out of turn. The head is **`869400729`** and every gate in §10 was run at it.

### One decision for the orchestrator, with the evidence for it

**L8 could be merged now, ahead of L6, and nothing the plan states would be violated.** That is the
orchestrator's call rather than this merger's, so it is handed up rather than taken. The three
reasons the order exists were each checked:

1. **The migration chain does not care.** L6 owns NO migration at all (it is runtime, CI and docs).
   The integrated chain is `0330 … 0353` then `0360` and `0361` whichever of the two merges first.
2. **The one shared-file rule the plan names for this pair is moot.**
   SWEEP-PLAN's table says `packages/runtime/lib/runtime-contracts.mjs` takes "L6's post-image
   first, L8 recuts on it". **L8 does not touch that file**: `git diff --name-only
   origin/main...riders/wS-lane08` lists no `packages/runtime` file, no `frozen-workflows.json` and
   no `.github` file at all.
3. **The two lanes share ZERO files.** `comm -12` over their two changed-file lists is empty.

Merging L8 first would save the wave's longest pole, because L8 is the lane with four recuts already
known to be owed (below). If the orchestrator would rather keep the stated order, nothing is lost but
the wait.

### What the resume must do, in order

1. **Merge L6** (no migration; runtime, CI and docs). Its shared files are
   `packages/runtime/README.md` (with L5, already merged), `CONTEXT.md` (with L1, L4, L5),
   `packages/db/tests/README.md` (with L1), `apps/web/e2e/README.md`, and it owns
   `rollback-preflight.mjs`, `.github/workflows/ci.yml`, `.github/actions/*` and this wave's `RIG.md`
   alone. Run `work-question-walk.spec.ts`, the walk it touches and the only one still owed.
2. **Merge L8** last, and expect it to be the heaviest. Four things are already known to be owed:
   - **0352 pins `clara._payroll_posting_verdict`** at a value L4's 0343 has moved (§0's table).
   - **0353 pins five bodies** L1 and L2 have moved: `create_accounting_plan`, `_obo_plan_core`,
     `_accrual_plan_core`, `_authority_ref_refusal`, `create_prepayment_schedule_for`. L8 recuts on
     the integrated post-image; §5.2 and §7.1 record what those images now are.
   - **0352 splices `clara.list_review_queue` once more**, so the pin ladder of §8.1 owes an
     **eighth generation**, gated on 0352's own stem.
   - **0360 reads `clara.list_review_queue`** and 0352 applies before it, so §9's bimodal work on
     0360 must be re-checked once 0352 is on the chain. `clara_intS5` cannot answer that question.
3. **Replay the ordered chain from the template one final time** (`clara_intS6`), because 0352 and
   0353 sit BELOW `clara_intS5`'s frontier of 0361 and the runner refuses a late-inserted lower
   number by design. That replay is also the release's own proof of file order.
4. **Re-run the end gates of §10** at the final head, plus L6's browser walk.

### The rig, as the resume will find it

| | |
|---|---|
| worktree | `C:\Users\zhant\Desktop\clara-wt\636`, branch `integration/riders-sweep`, **clean**, head `869400729` |
| template | `clara_l02`, **untouched**, 312 files, head `0323`, `0295` at `5196d64d…` |
| the chain | `clara_intS5`, **335 files**, head `0361`, the true ordered chain of everything merged |
| superseded | `clara_intS`, `clara_intS2`, `clara_intS3`, `clara_intS4`, left in place as evidence; each is a from-template replay that a recut retired (§4, §7.1) |
| roles | **20** `clara%`, 0154's own count |
| the staged mirror | `scratchpad/riders/stage-migrations`, a byte-identical copy of `packages/db/migrations` minus `0360` and `0361`. Point `CLARA_MIGRATIONS_DIR` at it for per-lane applies AND for db test runs, or the harness will apply the overflow files early and block the next lane's lower numbers (§4) |
| the web env | `apps/web/.env.local`, copied in from the main checkout, gitignored, in no commit; the browser walks need it |
| helper scripts | `scratchpad/riders/`: `gates-union.mjs`, `gates-order.mjs`, `readme-splice.mjs`, `corpus-splice.mjs`, `keep-both.mjs`, `json-dupkeys.mjs`, `frozen-paths.mjs`, `sweep-cross.mjs`, `sweep-cross2.mjs`, `fix-rigmeta.py` |

**A status request arrived mid-task and was noted rather than answered**, per the brief: it is the
orchestrator's, not this merger's.

---

## 13 · Anything unverified

1. **L6 is not merged**, so nothing in this report speaks for it. Every count in §14.3 is of a
   SEVEN-lane head; the counts in §1 to §11 are of the six-lane head `869400729` and are left as
   they were taken. (L8 IS merged, in §14; this item read "L6 and L8" at the first pause.)
2. **The two-build cutover drill was not run**, and is not this merger's. L6's #1131 is about that
   drill's contract-refusal arm and merges later.
3. **`pnpm build` for `apps/web` was not run.** `pnpm typecheck` and the whole unit suite are green
   and `next build` is the release worker's step with the deploy environment. The `.env.local` copied
   in for the walks would now let it run, but a full web build was out of scope for this pause.
4. **The no-0330 arm of `p1050.authority.wall_route` is argued, not measured.** After the §5 recut
   the cell has one arm, because 0338 §E has one arm; the shape it used to exercise cannot exist on
   any chain that carries 0330, and 0330 ships in this merge at a lower number. The lane's own rig
   proved that arm before the merge (`waveS-lane02-recheck-2.json`); no chain without 0330 exists
   any more for this merger to re-drive it on.
5. **0361's pins are now proved against L8 as well.** §14.3's chain applies `0352` and `0353`
   before it and it still refuses nothing. The item stood at the first pause and is closed.
6. **The `t728` web cell** is reported both ways (§10) and identified as a whole-suite load flake; it
   is not re-run on `origin/main`, so "pre-existing" rests on the diff argument, the file is in no
   lane branch and in no integration commit, rather than on a green run of main.
7. **Each lane's own unverified list stands unchanged.** This merge verified INTEGRATION, not the
   lanes' own claims. Lane L1's three open recheck findings in particular are carried, not closed:
   the #1080 `contract_confirmation` policy question owed to the owner, the from-scratch proof for
   #1051 (which §9 now supplies for the merged set), and the #1075 pagination follow-up that no
   worker can file because it needs a GitHub write.

---

## 14 · Lane L8, merged AHEAD of L6 on the orchestrator's ruling

The pause at §12 handed the ordering question up with its evidence, and the orchestrator ruled:
merge L8 now. The ruling was taken, not re-argued, and the three facts §12 offered were the ones it
rested on. Recorded once more because the order swap is the only place this merge departs from the
plan's stated sequence:

1. **L6 owns no migration**, so the integrated chain is `0330 … 0353` then `0360` and `0361` either
   way.
2. **The one shared-file rule the plan names for the pair is moot.** `runtime-contracts.mjs` was to
   take "L6's post-image first, L8 recuts on it"; L8 touches no `packages/runtime` file at all.
3. **The two lanes share zero files.** Outside `packages/db`, L8's diff touches nothing L6 touches,
   and inside it their only common file is `packages/db/package.json`, which L6 does not edit.

### 14.0 · First, the 0338 prose the orchestrator flagged (`ee18d690f`)

Two passages in 0338 §0 still described the run-time branch that §5's recut deleted: the pin note
said "§E writes whichever shape it finds", and the drift refusal told a reader to "re-derive §E's
POST-#1051 branch", a branch that no longer exists. Both are corrected. Comment-only: no statement,
no pin value, no assertion and no installed byte moved.

**No corpus sha is owed for 0338**, checked rather than assumed: it carries no row in
`apps/web/tests/firm-scope-db-pins.corpus.ts` at all (zero mentions), because it is not a reviewed
dynamic-SQL barrier.

### 14.1 · The merge, `684fc8693`

#1136 #1137. Migrations **0352 0353**. 20 commits. Readiness: `waveS-lane08-recheck.json` verdict
**accept**, zero findings, at branch head `0bbf3addb`.

**Four conflicts, and two of them were the very cells this merge had already recut.**

| file | resolution |
|---|---|
| `packages/db/tests/authority-ref-human-instruction.test.mjs` | L8 adds `clara._tenancy_plan_core` to #977's closed-world roster as a FOURTH reader. Resolved by NOT adding it, because §14.2 stops it being one, and by asserting the opposite instead: where the tenancy step is live it must reach the definition through #1051's shared predicate and must not name the resolver itself. L8's own note already said this entry "goes away with the body and the roster shrinks back" when its follow-up lands. |
| `packages/db/tests/firm-portfolio-pack.test.mjs` | Both sides add a #659 ladder generation and both are kept, stacked in chain order, each gated on its own STEM. |
| `packages/db/package.json` | **152 tokens**, wave tail `0330 … 0353` then `0360` and `0361`, none twice. |
| `packages/db/README.md` | Ordered splice; `0352` and `0353` before `0360`. |

### 14.2 · Five findings, two of them silent losses (`d1dfb0e68`)

**1. THE FOURTH COPY OF THE AUTHORITY WALL.** `clara._tenancy_plan_core` pasted 0300's authority
block whole, under the comment *"THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan"* -
the same claim, and the same trap, wave 4 paid for on `clara._obo_plan_core`. The paste was correct
on the lane, which was cut from the cut head and carries no 0330; on the integrated chain it is a
fourth hand-written copy of the wall #1051 exists to fold, and the only one that would have been left
standing.

Folded onto `clara._assert_plan_authority` exactly as 0330 folded the two plan doors and 0331 the
accrual core. The three variables the block alone used are gone and 0353's prestate gained a
prerequisite check for the predicate. **0353's own note already called this its follow-up 1**; the
merge is where it landed. Nothing admitted or refused moves, and the parity `p1137.obo.refusals_match`
measures is now exact BY CONSTRUCTION, because both entrances reach the same body.

**2. THE SPLIT QUEUE WOULD HAVE DROPPED LANE L4's ROW KIND.** 0352 does not merely pin
`clara.list_review_queue`, it **SPLITS** it into a core whose text the file EMBEDS. The embedded core
was derived from the pre-0343 body, so applying it would have installed a queue without #1048's
seventeenth row kind, **with nothing to notice**, because the tail checks the core by markers the
old text also carries.

The core was re-derived from the LIVE body by the file's OWN surgery (`__t1136_queue_forward`, the
three replaces spelled in §-1), never retyped, and proved both ways before anything was written:

| check | result |
|---|---|
| `reverse(the old embedded core)` | `d5456ecc…`, exactly the pre-image L8 pinned |
| `forward(the live body)` | `b3fe3ad1…`, the new embedded core |
| `reverse(forward(live)) === live` | **true** |
| the three anchor counts §0 asserts, on the new pre-image | declare 1, floor line 1, `c.firm` 24, `p_firm` 0 |
| what the apply then reported | **"17 row kind(s) each projected once"** |

**3. A HASH RECIPE THAT COULD NOT TAKE A BACKSLASH.** Every sha in 0352 was
`sha256(<text>::bytea)`, and that cast runs bytea's own INPUT function, which reads a backslash as
the start of an escape. It worked on the lane because no body it hashes carried one. Lane L4's 0343
gives `clara._payroll_posting_verdict` a backslash at character **22284**, so on the integrated chain
the cast raised `invalid input syntax for type bytea` and aborted the migration before it edited
anything. All eight sites now use `convert_to(<text>, 'UTF8')`, this estate's own recipe, which is
byte-identical for backslash-free text, so **no pin value in the file moved because of the change**,
and the one body that needed it is hashed correctly for the first time.

*(A note on the diagnosis, because it cost a wrong turn: the first probe for the backslash was
`prosrc like '%\%'`, which finds a literal `%`. Backslash is LIKE's own default escape character.
`position(chr(92) in prosrc)` is the honest question.)*

**4. 0360's STRUCTURAL CHECK LOOKED ONE LEVEL TOO HIGH.** It reads the payroll Needs-you arm out of
`clara.list_review_queue`; after 0352's split the arm lives in the core and the door is a thin
delegate, so the check refused, correctly, because the markers really are not there any more. The
arm did not go away, it went down one level. It now reads the core where the split has landed and the
door where it has not, and still refuses if the arm is in neither. **The pin the orchestrator's
message expected to be a sha is not one**: 0360 pins this body by STRUCTURE, and its own comment says
why ("`clara.list_review_queue` is spliced by six other files and its sha moves for reasons that have
nothing to do with this one"). There is no tail assertion on it either.

**5. FOUR CENSUS ROSTERS GREW OR MOVED**, each re-measured with its reason rather than relaxed.

| cell | what moved | resolution |
|---|---|---|
| `p1080.wall.one_spelling`, `p1051.wall.one_definition` | the predicate now has a **fourth caller**, the tenancy plan step | the roster admits it, feature-detected. The claim that matters is untouched and still asserted: the wall's SENTENCE lives in exactly ONE body. What grew is the set of bodies that REACH it, which is the fold working |
| `p1080.accrual.confirmation_cannot_be_self_minted` | 0353 splits both tenancy confirmation doors, so the WRITERS of `clara.contract_plan_confirmations` are the same lane's same two acts, named one level lower | the writer roster follows the split; the ACL claim moves to the human doors, which keep their names, and the cores are **additionally** asserted reachable by NOBODY, which is stronger than the clause it replaced |
| `p1137.obo.plan_step_parity` | it asked both plan bodies to NAME `clara._authority_ref_refusal`, which is how the door reached it before #1051 | it now follows the REACH, and both bodies must reach the SAME hop; where the predicate is live it is additionally asserted to be a reader of the one definition, so the hop is a fold and not a second copy |
| `p659`'s ladder | only the split CORE | 0352's **door** value is L8's own and unchanged, because the thin door is the same text whatever body it replaced. The core was re-measured to `b3fe3ad1…` |

### 14.3 · The chain, and the gates on the final head `cba214203`

Database `clara_intS6`, created from the pristine `clara_l02` template and migrated with the real
migrations directory, so the order is the release's own.

| check | result |
|---|---|
| the chain | **25 new applied · 337 total**, `0330 … 0353`, then **`0360`**, then **`0361`** |
| every merged lane's db batteries, full **152**-gate chain | **574 tests, 574 pass, 0 fail, 0 skipped**, the 0360 and 0361 cells that skipped all wave now run |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| `pnpm typecheck` | **exit 0** |
| the WHOLE `apps/web` unit suite | **5249 tests, 5247 pass, 0 fail, 2 skipped** |
| the web pins corpus | **22 / 22** |
| `check-frozen-workflows` | **OK, 347 / 60 / 3**, identical to the base |
| the frozen law, independently | **189 files changed against `3bf6aa94d`, and not one is a key in main's manifest** |
| `check-wiki-dynamic-sql` | **OK**, 1608 function definitions scanned, the same 20 justified waivers |
| `packages/runtime` reconcile + fa-proposal units, on a template clone | **48 / 48** |
| **browser walks** accrual / prepayments / staff-expense-claim / payroll-settlement | **21 / 8 / 14 / 3 passed**, all green |

**The corpus row for 0360 was re-measured twice**, once per integration recut of that file:
`cc79bbfc… → 2086572f… → 46226c10…`. The other four migrations this merge edited carry no corpus row
at all, checked rather than assumed. 0352 in particular installs its derived cores as PLAIN SQL,
which is exactly why it needs no reviewed barrier despite reading `pg_get_functiondef`.

**Rig hygiene unchanged.** The template was never written to, the runtime legs ran on a template
clone that was dropped afterwards, and the cluster holds 20 `clara%` roles, 0154's own count.

---

## 15 · WAITING, for L6 alone

**Seven of eight lanes are merged: L1, L2, L3, L4, L5, L7, L8.** The head is **`cba214203`** and
every gate in §14.3 was run at it. The worktree is clean.

**L6 is the only lane left, and it is still not ready.** Its three reviews landed (the newest at
16:50) but there is no fix report and no `waveS-lane06-recheck.json`, and the readiness gate is a
recheck verdict.

### What the resume needs

L6 is the easy one, which is why the order swap was worth taking. It owns **no migration**, so the
chain of §14.3 is final unless its own fix round adds one.

1. **Merge L6.** Its shared files are `packages/runtime/README.md` (with L5, merged),
   `CONTEXT.md` (with L1, L4, L5), `packages/db/tests/README.md` (with L1) and
   `apps/web/e2e/README.md`. It owns `rollback-preflight.mjs`, `runtime-contracts.mjs`,
   `.github/workflows/ci.yml`, `.github/actions/*` and this wave's `RIG.md` alone. **L8 touches none
   of them**, so the seam the plan protected is unused.
2. **Run `work-question-walk.spec.ts`**, the one browser walk still owed, and L6's runtime batteries.
3. **Re-run the §14.3 gates** at the final head. The db chain does not need replaying unless L6's fix
   round brings a migration; if it does, replay from the template as `clara_intS7`, because 0360 and
   0361 sit above any number it could take.

### The rig, as the resume will find it

| | |
|---|---|
| worktree | `C:\Users\zhant\Desktop\clara-wt\636`, branch `integration/riders-sweep`, clean, head `cba214203` |
| template | `clara_l02`, untouched, 312 files, head `0323` |
| the chain | **`clara_intS6`, 337 files, head `0361`**, the true ordered chain of all seven merged lanes |
| superseded | `clara_intS` … `clara_intS5`, left as evidence of the replays that retired them |
| roles | **20** `clara%` |
| the staged mirror | `scratchpad/riders/stage-migrations`, **no longer needed**: with the whole chain merged, the real migrations directory applies in the right order by itself. It is only wanted again if a lane merges a file numbered below 0360 |
| the web env | `apps/web/.env.local`, copied from the main checkout, gitignored, in no commit |

8. **L8's own lane claims are not re-verified here**, only its integration. Its recheck is an accept
   with zero findings, and this merge changed four things inside its two migrations: the tenancy
   plan step's authority block, the embedded queue core, the hash recipe and one prestate
   prerequisite. Each is argued and measured in §14.2, and the lane's batteries pass at 92 / 92 on
   the integrated chain, but no lane worker has re-reviewed the recut bodies.
9. **The order swap is the orchestrator's ruling, not this merger's finding.** §14 records the three
   facts it rested on, each checked here; if L6's fix round turns out to touch a file L8 touches,
   that ruling would need revisiting, and the check is one `comm -12` away.

---

## 16 · Lane L6, the last one, `d812c2124`

#1044 #1128 #1129 #1131 #1126 #1124 #1127 #1141. **No migration**: runtime, CI and docs. 21 files.
Readiness: `waveS-lane06-recheck-2.json` verdict **accept**, zero findings, at branch head
`90aaa6326`.

**NO CONFLICT**, the only lane in the wave that merged clean. That is not evidence, so the four
shared files were read against every other lane rather than trusted:

| file | shared with | what the read found |
|---|---|---|
| `CONTEXT.md` | L1, L4, L5 | all four lanes' terms present, **no heading twice**; each lane's first added line located in the merged file |
| `packages/runtime/README.md` | L5 | both lanes' sections present, no duplicate heading |
| `packages/db/tests/README.md` | L1 | both present, no duplicate heading |
| `docs/plan/active/riders-2026-09-20/RIG.md` | nobody (L6 owns it) | this lane's #1124 section sits on top of the cut phase's docs on main, ascending |

**The one seam worth naming, and it is clean.** L6 edits
`packages/runtime/lib/reconciler-documents.mjs` while L7 edits `packages/runtime/lib/reconciler.mjs`.
Different files, and the import between them is already on main
(`reconciler.mjs:27`), so neither lane moves the other's ground.
`packages/runtime/lib/runtime-contracts.mjs`, the file SWEEP-PLAN reserved for "L6's post-image
first, L8 recuts on it", is touched by **neither** lane, which is what made the L8-before-L6 order
swap safe and is now confirmed from both sides.

| check | result |
|---|---|
| the lane's two db batteries, full 152-gate chain | **24 tests, 24 pass, 0 fail, 0 skipped** |
| the lane's four runtime batteries | **123 tests, 101 pass, 0 fail, 22 skipped** (see below) |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| the browser walk `work-question-walk.spec.ts` | **14 passed** (1.2 m) |
| `pnpm --filter @clara/runtime build` | **exit 0**, `.output/server/index.mjs` 11.8 MB |

### 16.1 · The 22 runtime skips, named rather than counted away

Every one skips on the same probe: *"the WDK world (`workflow.workflow_runs`), migration 0178 or the
document lane is absent from this database"*. Measured rather than guessed: **0178 IS applied** and
`to_regclass('workflow.workflow_runs')` is **null**. The missing thing is the Workflow DevKit's own
schema, which no migration in this repository creates.

Three ways were tried and recorded so nobody re-finds the dead ends:

1. Setting `WORKFLOW_POSTGRES_URL` beside the PG env, which RIG.md names for World legs. The harness
   does not provision the schema; still 22 skipped.
2. Booting the built runtime through its supported entry point with `CLARA_START_WORLD=1`. It serves
   and then reports *"durable world FAILED to start"* on a `select … from workflow.workflow_runs`,
   because the world expects the schema to exist rather than creating it.
3. Looking for a provisioning script: `packages/runtime` has none.

So the schema is a DEPLOY CEREMONY step, not a merge step, and these 22 cells are carried to §18 as
unverified at integration. They are the cells that matter most to #1044 and #1129, so this is a real
gap and is named as one, not softened. **The lane proved them on its own rig** and its recheck is an
accept with zero findings.

**The boot attempt did leave one result worth keeping**, because it is the merged head answering for
itself:

```
[clara-runtime] serving frontier=0361_reservation_release_advice(337) bodies=60
  pins chatTurn=chatTurn_v22 claraWork=claraWork_v6 statementFacts=statementFacts_v4
  documentIngest=documentIngest_v2 autoDraft=autoDraft_v10 ... closePrep=closePrep_v1
```

The frontier is this merge's own chain, the body count is the cut's 60, and every pin the released
cut phase moved is still where it put it.

---

## 17 · The final gates, on the complete head `d812c2124`

Eight lanes merged. Database `clara_intS6` (337 files, head `0361`), Playwright triple
`https://127.0.0.1:3510 / 3511 / 3512`.

| check | result |
|---|---|
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, all four workspaces |
| `pnpm typecheck` | **exit 0** |
| the WHOLE `apps/web` unit suite | **5249 tests, 5247 pass, 0 fail, 2 skipped** |
| the web pins corpus | **22 / 22** |
| `node scripts/check-frozen-workflows.mjs` | **OK, 347 frozen / 60 `"use workflow"` / 3 retired**, identical to the base |
| the frozen law, independently | **207 files changed against `3bf6aa94d`, and NOT ONE is a key in `origin/main`'s manifest** |
| `node scripts/check-wiki-dynamic-sql.mjs` | **exit 0**, the same 20 justified waivers the estate had before this wave |
| every merged lane's db batteries, full 152-gate chain | **574 tests, 574 pass, 0 fail, 0 skipped** (measured after L8; L6 adds 24 more, also green) |
| `operation-census` + `rig-isolation` | **33 tests, 32 pass, 0 fail, 1 skipped** |
| **browser walk** `accrual-walk` (L1) | **21 passed** |
| **browser walk** `prepayments-walk` (L2) | **8 passed** |
| **browser walk** `staff-expense-claim-walk` (L3) | **14 passed** |
| **browser walk** `payroll-settlement-walk` (L4) | **3 passed** |
| **browser walk** `work-question-walk` (L6) | **14 passed** |

**Sixty browser cells across five walks, every one green.** L5, L7 and L8 touch no
`apps/web/e2e` file, so those five are every walk this wave touched.

### The migration chain, as the release will run it

```
createdb -T clara_l02 clara_intS6          312 files, head 0323, 0295 at 5196d64d…
pnpm --filter @clara/db migrate            25 new applied · 337 total
                                           0330 … 0353, then 0360, then 0361
```

**Twenty-five migrations**, the overflow block last, every prestate satisfied and every tail OK.

---

## 18 · Anything unverified, at DONE

1. **The 22 runtime cells of §16.1**, which need a provisioned Workflow DevKit schema
   (`workflow.workflow_runs`). No migration in this repository creates it and no script in
   `packages/runtime` provisions it, so it is the deploy ceremony's. They are lane L6's own #1044 and
   #1129 ground, so this is the largest gap this report carries.
2. **The two-build cutover drill** (`tests/two-build-cutover-e2e.mjs`) was NOT run. It is the gate
   worker's, as it was for the cut phase, and lane L6's #1131 adds assertions to it that no run here
   exercises.
3. **`pnpm build` for `apps/web`** was not run. `pnpm --filter @clara/runtime build` IS green (§16),
   `pnpm typecheck` is green and the whole unit suite is green. The `.env.local` copied in for the
   walks would now let a web build run, but it was out of scope for the merge.
4. **The no-0330 arm of `p1050.authority.wall_route` is argued, not measured.** After §5's recut the
   cell has one arm because 0338 §E has one arm, and the shape it used to exercise cannot exist on
   any chain carrying 0330. The lane proved that arm before the merge.
5. **The `t728` web cell** (§10) is identified as a whole-suite load flake: green run alone, absent
   from the last three whole-suite runs, and in no lane branch and no integration commit. Not re-run
   on `origin/main`, so "pre-existing" rests on the diff argument.
6. **Each lane's own unverified list stands.** This merge verified INTEGRATION, not the lanes' claims.
   Lane L1's three open recheck findings are carried, not closed: the #1080 `contract_confirmation`
   policy question owed to the owner, the from-scratch proof for #1051 (which §17's chain now
   supplies for the merged set), and the #1075 pagination follow-up that needs a GitHub write.
7. **The lanes' own bodies that THIS merge recut are not re-reviewed by a lane worker.** Eleven
   recuts across five migrations and nine test files, each argued and measured here, each green on
   the integrated chain. The heaviest are 0353's authority fold and 0352's re-derived queue core.
8. **The whole runtime suite was not run once end to end.** The cut phase's merger ran it and found
   three known reds; this merge ran only the batteries the lanes touched, which is what the brief
   asks for, so a regression in an untouched runtime area would not have been seen here.
