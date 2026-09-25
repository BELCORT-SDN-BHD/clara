# Riders sweep wave, release preparation: the preflight, the runbook, the deploy order and the closure roster

Written 2026-09-25 by the release-preparation worker, who has **no hosted access** and did not use
any. Nothing was pushed, no pull request was opened, no GitHub object was written, no lane worktree
was touched, no `fly` command was run. Every database action was a read inside `begin transaction
read only`; no database was created, altered or dropped, and the merger's own cluster
(`127.0.0.1:55742`) was used read-only for the dry runs.

**What was produced**

| path | what |
|---|---|
| `docs/plan/active/riders-2026-09-20/ceremony-wS/reads-wS.mjs` | the wave's read-only hosted preflight, derived from `ceremony-wC/reads-wC.mjs` |
| `docs/plan/active/riders-2026-09-20/RELEASE-WS-RUNBOOK.md` | the ceremony, the cut's step order adapted for a wave that moves no pin and carries twenty-five migrations |
| `reports/waveS-release-prep.md` | this file, including the closure roster |
| `scratchpad/riders/pr-wS.md` | the pull-request body draft, with the three gate results left as placeholders |

---

## 1 · What was read

`RELEASE-WC-RUNBOOK.md` in full including its `§ RESULTS` and its signed-in walk;
`ceremony-wC/reads-wC.mjs` (2,729 lines) and `reports/waveC-release-prep.md`;
`RELEASE-W4-RUNBOOK.md`; `reports/waveS-merge.md` in full (eighteen sections, 73 KB);
`SWEEP-PLAN.md` in full; the status line and the completion claims of all forty-four
`reports/waveS-lane0N-ticket*.md`; the fix and recheck reports of all eight lanes. In
`C:\Users\zhant\Desktop\clara-wt\int2` at `integration/riders-sweep` **`d812c2124`**: all
twenty-five migrations read for the statements a release has to know about (their prestates, their
pin idioms, their grants, their locks and their tails),
`packages/runtime/workflows/registry.ts`, `frozen-workflows.json`, and the full diff of
`packages/runtime/lib/` and `.github/` against `origin/main`.

**The head is `d812c2124`.** `reports/waveS-merge.md` §16 and §17 both name it; it is
`integration/riders-sweep`'s tip and the report itself is committed above it in the main checkout
rather than on that branch.

---

## 2 · The deploy order, with evidence per leg

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine IS
stopped before the migrate and started again only on the new image.**

**Unusually for this programme, NOTHING FORCES the order, and saying so is more useful than
implying a constraint that is not there.** `grep -niE 'deploy order|write-quiet|quiesce'` over the
twenty-five files returns hits in exactly one file, 0343, and what it says is that the database half
ships ALONE ("DEPLOY ORDER: DATABASE ALONE, THEN A SUCCESSOR. This file adds NO new task lane, NO
new workflow family and NO new runtime call"). The cut's own lesson was that the forcing statement
can live in the RUNTIME rather than in a migration, so the reverse direction was checked there too:

| what the new image gains | does it call a door this wave creates? | order |
|---|---|---|
| the reconciler's two retention lanes (#1046) | **yes**, `clara.prune_invite_preview_attempts` and `clara.prune_confirmation_attempts`, created by 0348 | free in both directions: the belt tolerates `42883` by name and its own comment says it stays "a no-op on any database that has not yet applied that migration" |
| `lib/spool.mjs`, `lib/reconciler-documents.mjs`, `lib/health.mjs`, `lib/lane-probe.mjs` | no: every `clara.` identifier they add is pre-existing | free |
| `lib/rollback-preflight.mjs` (#1129, #1131) | no database call at all; one additive hunk after line 227, and `FRONTIER_RULES` is unchanged | free |
| `lib/fa-proposal-grounds.ts` (#1092, #1093) | it names `clara.fa_account_depreciation_policies`, **but nothing imports it except its own unit test** | free |
| the web build | every new panel reads a door this wave creates | **database first in practice**: a promoted web calling `clara.record_firm_standing_instruction` or `clara.answer_payroll_completeness` before 0338 and 0343 are live answers `42883` on those panels |

So the order is the house order because it costs nothing, and the web leg is the only one where the
reverse would show a user an internal fault.

### The machine stop, and the honest limit of what it buys

Three reasons, and the third is new to this programme:

1. `packages/db/README.md`'s rule for recutting an active writer body, and this wave recuts several.
   0343 `create or replace`s four live bodies and splices two more; 0344 recuts
   `clara.revise_document_fact`, which writes an extraction, a region, a revision row and retires
   parked Work.
2. **0348 builds TWO NON-CONCURRENT INDEXES on relations that already hold rows.** A plain `create
   index` blocks writes on the whole relation for its duration, and both relations are the auth
   wall's own evidence tables.
3. **0338 takes ACCESS EXCLUSIVE on `clara.accounting_plans`** to drop and re-add a named CHECK. It
   is brief and it scans the relation once, and it is the heaviest lock in the wave.

**What the stop does NOT buy:** it quiesces the runtime's writers, not the browser's, and this wave
has more browser-reachable writers than the cut did. In beta the only browser session is the
owner's, so the operative instruction is the one every prior window used, and step 6b's `pg_locks`
read is what makes it real rather than nominal.

**`55P03 lock_not_available` is a real failure branch for this release and was not one for the
cut.** 0348 arms `lock_timeout = 15s`, 0342 and 0343 arm `5s`, and 0349 and 0350 arm `15s`; a
browser write holding a conflicting lock for longer refuses the migration cleanly and the ledger
stops at the file below.

---

## 3 · The preflight: what changed from the cut's, and why

The design is wave 4's and the cut's, unchanged. Five things are different and every one of them is
a measurement in these twenty-five files rather than a preference.

**1. The pin parser is widened for six idioms, because the cut's reads four of them and this wave
uses all six.** Run unchanged over this pending set, `reads-wC.mjs` parses **124 pins and leaves 47
sixty-four-hex literals unattributed**. Among the unattributed: EVERY pin of 0344 (this wave's own
four bimodal admissions, written as a flat `array['sig','sha','sig','sha', …]` whose second element
is followed by another signature rather than by a closing bracket), BOTH of 0360's bimodal pairs
(declared as `c_*_sig` / `c_*_pre` / `c_*_alt` constants, where the cut's parser is keyed on `v_`),
the neighbour pins of 0345 and 0346 (measured with `sha256(prosrc::bytea)`), and 0352's two
pre-image pins (recovered through a helper, so no measurement names the body and only the refusal
does). An unattributed pin is an UNCHECKED precondition wearing a clean ledger's clothes.

The widened parser reads **175 pins, 156 measurable, 19 chain-internal, 2 digests unattributed**,
and the two that remain are 0352's two DERIVED cores, which are bodies the file embeds rather than
finds. It prints which arm placed each pin:

| arm | pins |
|---|---|
| a roster tuple or pair row | 103 |
| a multi-signature roster, attributed by the column map derived from the loop that CONSUMES it | 18 |
| a FLAT paired array | 11 |
| a scalar `sha256(prosrc)` measurement, in any recipe, with a literal or a declared subject | 41 |
| the file's own refusal, for the one signature it names | 3 |

The column map is worth one paragraph because it is the only place the parser reasons rather than
matches. 0353 carries the wave's one roster with two signatures per row
(`[core_sig, human_sig, mode, floor, pre_image_sha, derived_sha]`). Pairing "the signature, then the
shas that follow it" would attach BOTH shas to the human door and invent a bimodal admission the file
does not make. So the map is read off the file's own refusals: for every `… is distinct from
<arr>[v_i][K]`, the `raise` that follows names the subject, and that gives K to J. For 0353 that
derives 5 to 2 and 6 to 1, which is exactly what §0's loop does. The same roster appears again in
§TAIL with different questions of the same columns, so the FIRST site wins.

**2. The recipe is part of the pin, and this wave proved why.**
`sha256(convert_to(prosrc,'UTF8'))` and `sha256(prosrc::bytea)` agree on a backslash-free body and
DIFFER on one that carries a backslash. The integration merge met exactly that: 0352 hashed eight
bodies with the bytea cast, lane L4's 0343 gave `clara._payroll_posting_verdict` a backslash at
character 22284, and the file aborted with `invalid input syntax for type bytea` before it had
edited anything (`waveS-merge.md` §14.2, finding 3). 0345 and 0346 still pin under that recipe, so
every pin is re-measured the way ITS OWN FILE measures it, and a bytea-recipe pin over a body that
carries a backslash is reported as the **22P02** it would raise rather than as a mismatch. Negative
control 5 drives it.

**3. No pin moves, and section (v) MEASURES that rather than asserting it.** It derives the
successor set exactly as the cut did (a class with a predecessor, pinned at its newest, whose module
is still unlocked in `frozen-workflows.json`) and STOPs if the set is not empty. On this tree it
reads `347 entries, 0 UNLOCKED` and `SUCCESSOR BODIES (none)`, and the SAME command with
`CLARA_REPO` pointed at the main checkout prints the same registry line, which is what "this wave
moves no pin" means in a form that can be checked rather than claimed.

**4. Thirteen hand checks, four of which carry the step's real content.** `D-ROLE-REACH` (the one
check no rig can answer, and it asks wider than the cut's because 0341's §TAIL becomes
`clara_authenticated`), `D-CHECK-SWAP` (0338's constraint swap, reading the LIVE definition as well
as the count of rows the new predicate would refuse), `D-BACKFILL-ONBOARDING-PLAN-ITEMS` (0347's
production backfill, the file's own selector re-run read-only as a count), and
`D-RATE-WALL-TRIGGERS` (0348's two append-only triggers and the row counts its index builds have to
scan). The other nine are `D-WAVE-PREMISE`, `D-WAVE-NEWBORN-RELATION`, `D-WAVE-MINTED-NAMES`,
`D-CAPABILITY-REGISTRY`, `D-BACKFILL-TRIGGER-TAXONOMY`, `D-WAKE-ALLOWLIST`,
`D-MACHINE-LANE-GRANTS`, `D-SPLICE-ANCHORS` and the generated DDL reads.

**5. `--cut-only` is gone and `--census` carries the body census**, which is what step 6b re-reads
with the machine stopped.

---

## 4 · The dry-run verdicts

Migrations directory and `CLARA_REPO`: `clara-wt/int2` at `d812c2124`. Databases: the merger's own
cluster `127.0.0.1:55742`, read-only.

| run | target | verdict |
|---|---|---|
| `--plan` | no database | **exit 0, 0 GAP.** 25 pending, 337 files, 175 pins (156 measurable / 19 chained), 13 hand checks, 2 relations created, 0 roles minted |
| `--plan`, `CLARA_REPO` at the MAIN checkout | no database | the SAME registry line and the SAME manifest counts as the integration head |
| pre-window + `--baseline fp-wS-pre.json` | `clara_l02`, the pristine template, 312 / `0323`, `C.UTF-8` | **13 ok, 2 STOP.** 11356 keys compared, **11356 equal, 0 env**; **145 of 145** measurable pins at a value their own file admits; all thirteen hand checks ok |
| `--post` + `--baseline fp-wS-post.json` | `clara_intS6`, the ordered chain, 337 / `0361`, `C.UTF-8` | ledger **312 + 25 = 337 at 0361**, twenty-five rows at their file checksums, drift 337/337, fingerprint **11457 keys, 11457 equal, 0 env**, every (f) read answered. Same two STOPs |
| `--census` | `clara_intS6` | the body census, the manifest check and the quiescence census alone |

**The two STOPs in every rig run are structural to a rig and are the same defect the cut's
preparation found.** No rig database on this host carries a bootstrapped Workflow DevKit World, so
`workflow.workflow_runs` answers `42P01`. The census fails CLOSED and the derived check prints `NOT
COMPUTED`, because "I could not look" must never wear "I refuse"'s clothes.

### The two fingerprints

| fingerprint | source | ledger | structural keys | reference counts | sha256 of the file |
|---|---|---|---|---|---|
| **PRE** `fp-wS-pre.json` | `clara_l02`, the pristine template the whole wave was replayed from and which was never written to | 312 / `0323_trade_invoice_probe_self_exclusion` | **11356** | 57 | `c553a30395dad185efde1e519e386db65d640d92261069f72ee4c95cb05a2db6` |
| **POST** `fp-wS-post.json` | `clara_intS6`, the ordered chain of all eight lanes | 337 / `0361_reservation_release_advice` | **11457** | 57 | `fa174f264143bbbeca413bb996a5b4a7e4cfd3ac32d030ad18cd726cbb7ae37a` |

The wave adds **101 structural keys** and no reference relation. Both were taken at `C.UTF-8`.
**Neither is the baseline the window uses**: a hosted-shaped baseline must be exported from a
database at the HOSTED frontier by the same script and the same tree, and these two are this
worker's dry-run artefacts.

### Negative controls

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | one measurable pin's literal corrupted in a COPY (0330's `_authority_ref_refusal`) | `STOP PIN`, both sides, **144 of 145**, naming the arm and the recipe |
| 3 | an applied file's bytes changed in a COPY | 2 STOPs: `312 applied vs 313 file(s)` and the pending-set arithmetic |
| 4 | `--post` against the un-upgraded template | STOPs on the arithmetic and on twenty-five `no ledger row` lines |
| 5 | a bytea-recipe pin re-pointed at a body that carries a backslash (0346, on a COPY) | `STOP PIN … [scalar, recipe bytea]` plus the named `RECIPE` line naming the 22P02 it would raise |
| 6 | a baseline value corrupted on an object a pending file PINS | `STOP DRIFT (PINNED by 0330…, 0331…, 0338…)`, naming all three |
| 7 | the same corruption on an object no pending file names | `STOP DRIFT`, unqualified |
| 8 | `CLARA_REPO` pointed at a tree with no `registry.ts` | in `--plan` the registry section says so by name; against a database the script fails at module resolution, which is loud rather than silent |

Control 5 is the one worth reading twice: it turns the integration merge's own finding into a check
that fires before a window rather than inside one.

---

## 5 · Findings handed up, beyond the runbook

1. **This is the first release in the programme whose step-9 rollback snapshot does not expire.**
   `refresh-061a6992` exports the same 60 bodies the incoming image exports, so the stranded-body
   gate cannot refuse it at any ledger position between 312 and 337, and no traffic can change that,
   because this wave introduces no body that could take a run. The cut's snapshot degraded within
   minutes. Worth recording on #1035 beside the cut's own finding, because it is the other end of
   the same question.
2. **The database is the part that does not roll back, and this wave makes that matter more.**
   Twenty-five files including a constraint swap, a backfill over every committed firm-scope plan
   and two index builds. A bundle rollback undoes none of them, and the only route below the
   frontier is the step-3f dump, which returns no Storage bytes, no managed Auth config and no
   engine state.
3. **`clara._prepayment_plan_core` is recut somewhere in this wave without a pinned pre-image.**
   `D-WAVE-MINTED-NAMES` reports the split it finds: 29 of the 30 names the wave's text creates and
   pins no pre-image for are genuinely new, and that one already resolves. It is not a release
   blocker and it is not a STOP, and it IS the one body in the wave whose pre-image nothing checks.
   Worth a lane reader's eye before the closures.
4. **#1098 ships with its second acceptance criterion PARTIAL and disclosed.** After the backfill a
   committed firm checklist SHOWS the TIN question and correctly marks it outstanding, and the firm
   still cannot answer it, because `clara.answer_firm_setup_item` refuses every item on a plan that
   is not open. The lane drives that refusal in a cell rather than leaving it silent. Accept it as
   partial with a follow-up, or hold the ticket; it changes nothing about the migration.
5. **Blueprint pin drift, unchanged and now four cuts old.** `docs/ARCHITECTURE.md:171`, `:183`,
   `:207`, `:445` say "chatTurn -> chatTurn_v19, claraWork -> claraWork_v3". Per `AGENTS.md` rule 4 a
   blueprint edit belongs to a wayfinder session; every wave has recorded it and so does this one.
6. **The 22 runtime cells of `waveS-merge.md` §16.1 are CLOSED, and the command that closes them
   belongs in a durable place.** Gate C provisioned the Workflow DevKit schema and ran all 22 green
   (`waveS-gates-C.md` §1c, §2a, §2b: lane L6's four batteries alone 123 / 123 / 0 / 0, against the
   merge's 123 / 101 / 22 skipped). The merge's conclusion that "no script in `packages/runtime`
   provisions it" is exact about npm scripts and wrong about the command: it exists as a dependency
   bin, `pnpm --filter @clara/runtime exec bootstrap`, resolving to
   `@workflow/world-postgres/bin/setup.js`. Gate C's F5 names the cost of that line being absent as
   measurable, because a whole lane's cells went unverified through an integration merge for want of
   it. **It is now recorded in `RIG.md`'s rig rules** on this branch. F5's own preference, and
   #1124's ruling, is that the durable home is the repository's `README.md` under "Develop"; that is
   a follow-up this worker cannot file, because it needs a GitHub write.

---

## 6 · The closure roster

For every ticket of the wave: the status the lane report CLAIMS, and the report that carries it.
Forty-four tickets across eight lanes. Report paths are relative to
`docs/plan/active/riders-2026-09-20/reports/`.

### Lane L1, the plan machinery (migrations 0330 0331 0332 0333 0334)

| ticket | claimed status | report |
|---|---|---|
| #1051 | **DONE** | `waveS-lane01-ticket1051.md` |
| #1080 | **DONE** | `waveS-lane01-ticket1080.md` |
| #1074 | **DONE** | `waveS-lane01-ticket1074.md` |
| #1073 | **DONE** | `waveS-lane01-ticket1073.md` |
| #1075 | **DONE** | `waveS-lane01-ticket1075.md` |
| #1070 | **DONE** | `waveS-lane01-ticket1070.md` |
| #1071 | **DONE** | `waveS-lane01-ticket1071.md` |

Lane L1's recheck is `accept` with **three open findings, all minor or note and all marked "open, by
design"** as integration-time or owner actions (`waveS-lane01-recheck.json`). The merge carried them
rather than closing them (`waveS-merge.md` §13 item 7, §18 item 6): the #1080
`contract_confirmation` policy question owed to the owner, the from-scratch proof for #1051 (which
the ordered chain now supplies for the merged set), and the #1075 pagination follow-up that no
worker can file because it needs a GitHub write. **The #1075 follow-up is still owed and is a
GitHub write the release session can make.**

### Lane L2, prepayment and deferred revenue (0335 0336 0337 0338 0361)

| ticket | claimed status | report |
|---|---|---|
| #1114 | **done** | `waveS-lane02-ticket1114.md` |
| #1077 | **done** | `waveS-lane02-ticket1077.md` |
| #1079 | **done** | `waveS-lane02-ticket1079.md` |
| #1078 | **done, the reservation half only.** The deactivation half is ruled OUT by the owner's own ruling and nothing was built for it | `waveS-lane02-ticket1078.md` |
| #1050 | **built, green, committed** (the report's own words; six commits). Held out of the lane table until re-briefed, then built as the re-brief ruled: a firm-level standing instruction recorded by a named member | `waveS-lane02-ticket1050.md` |

### Lane L3, staff expense claims (0339 0340 0341)

| ticket | claimed status | report |
|---|---|---|
| #1067 | **DONE** | `waveS-lane03-ticket1067.md` |
| #1052 | **DONE** | `waveS-lane03-ticket1052.md` |
| #1066 | **DONE** | `waveS-lane03-ticket1066.md` |
| #1068 | **DONE** | `waveS-lane03-ticket1068.md` |
| #1069 | **DONE.** The report carries no single status line; every acceptance criterion is evidenced and 0341's own tail drives the recut door for real | `waveS-lane03-ticket1069.md` |

### Lane L4, payroll posting and the capability registry (0342 0343)

| ticket | claimed status | report |
|---|---|---|
| #1061 | **DONE** | `waveS-lane04-ticket1061.md` |
| #1059 | **DONE**, with no migration as the prompt expected | `waveS-lane04-ticket1059.md` |
| #1060 | **DONE for the narrowed scope.** The ticket's second half, a shared FIFO settlement-candidate extraction, is confirmed dormant by its own "Out of scope" line and is NOT built | `waveS-lane04-ticket1060.md` |
| #1048 | **DONE** | `waveS-lane04-ticket1048.md` |

**#1048 carries a successor contract** (`waveS-merge.md` §11): `payroll.run.employee_count` and
`payroll.run.page_count` must join `PAYROLL_RUN_FIELDS` as OPTIONAL fields in `payrollFacts_v2`,
with the prompt stanza the report writes out. **Until it ships, the two page-printed witnesses are
exercised by 0343's battery and by nothing else**; the database half needs no further change.

### Lane L5, documents, knowledge and the FA proposal (0344 0345 0346 0360)

| ticket | claimed status | report |
|---|---|---|
| #1056 | **DONE.** Nothing deliberately left out of the acceptance criteria; four follow-ups filed | `waveS-lane05-ticket1056.md` |
| #1090 | **DONE.** Every acceptance criterion evidenced with a PASS; no single status line | `waveS-lane05-ticket1090.md` |
| #1092 | **DONE.** All three acceptance criteria met and evidenced | `waveS-lane05-ticket1092.md` |
| #1093 | **DONE.** All three acceptance criteria built, no migration as the ticket predicted | `waveS-lane05-ticket1093.md` |

**Four successor contracts, and three of them are ONE edit** (`waveS-merge.md` §11): #1093's
correction to step (a)'s SQL for `particulars_complete`, #1090's `depreciation_policy` knowledge
read and #1092's retired-policy ground all land in the same `loadFaProposalInputsStepV6`-shaped step
and all feed the SAME `FaProposalInputs`. The body is **deploy-locked**, so it lands as
`claraWork_v7`'s own step, never as an edit to v6. #1056's own contract (a future
`reviseDocumentFact` chat or Work tool) is not owed by the ticket and is written down only because
the door's shape is fresh.

### Lane L6, runtime readiness, rollback safety and CI (no migration)

| ticket | claimed status | report |
|---|---|---|
| #1044 | **DONE** | `waveS-lane06-ticket1044.md` |
| #1128 | **DONE** | `waveS-lane06-ticket1128.md` |
| #1129 | **DONE** | `waveS-lane06-ticket1129.md` |
| #1131 | **DONE (narrowed)** | `waveS-lane06-ticket1131.md` |
| #1126 | **DONE** | `waveS-lane06-ticket1126.md` |
| #1124 | **DONE** | `waveS-lane06-ticket1124.md` |
| #1127 | **done.** The conditional rider, built after the ruling: the weekly schedule's own failure now lands as a visible GitHub issue comment | `waveS-lane06-ticket1127.md` |
| #1141 | **done.** The B4 focus-landing cell polls `document.activeElement` instead of reading it once | `waveS-lane06-ticket1141.md` |

**Twenty-two of this lane's runtime cells are UNVERIFIED at integration** and are the largest gap the
merge report carries (`waveS-merge.md` §16.1, §18 item 1). They skip on the same probe every time:
the Workflow DevKit's own schema (`workflow.workflow_runs`) is absent, no migration in this
repository creates it and no script in `packages/runtime` provisions it, so it is a deploy-ceremony
step rather than a merge step. They are #1044's and #1129's own ground. **The lane proved them on
its own rig and its recheck is an accept with zero findings**, so this is a gap in the INTEGRATION
evidence rather than in the lane's.

### Lane L7, hygiene, retention and disclosure (0347 0348 0349 0350)

| ticket | claimed status | report |
|---|---|---|
| #1047 | **done.** No migration; the lane contingency `0351` was NOT needed and is returned unused | `waveS-lane07-ticket1047.md` |
| #1098 | **done, with one acceptance criterion PARTIAL and disclosed** (the report's own verdict line). The first half is done: the TIN item exists on committed plans and is correctly marked. The second half ("it CAN ANSWER") is partial, because `clara.answer_firm_setup_item` refuses every item on a plan that is not open, and the lane DRIVES that refusal in a cell rather than glossing it | `waveS-lane07-ticket1098.md` |
| #1046 | **done**, for both tables, driven through the REAL doors rather than synthesised | `waveS-lane07-ticket1046.md` |
| #1132 | **done** | `waveS-lane07-ticket1132.md` |
| #1096 | **done.** Its disclosure half was already satisfied and was verified rather than re-done; the ticket shrank to one test cell, which is built | `waveS-lane07-ticket1096.md` |
| #1099 | **done**, as a named convention plus a self-checking mechanism rather than a comment alone | `waveS-lane07-ticket1099.md` |
| #1094 | **done** | `waveS-lane07-ticket1094.md` |
| #1095 | **done**, as a wait-time notice (the brief's own "or"); no interactive retry control was added | `waveS-lane07-ticket1095.md` |
| #1058 | **DONE as the ruling**, not as the rename the ticket asked about: a column comment on `clara.entry_post_receipts.via_wake_kind` plus a `packages/db/README.md` section, with AC3 driven against the live catalog | `waveS-lane07-ticket1058.md` |

### Lane L8, the agent-lane twins (0352 0353)

| ticket | claimed status | report |
|---|---|---|
| #1136 | **DONE, the DATABASE HALF, which is the whole of this lane's ruled scope.** The three chat tools that consume the twins are the cut family's next version | `waveS-lane08-ticket1136.md` |
| #1137 | **DONE, the DATABASE HALF, which is the whole of this lane's ruled scope.** The four chat tools are likewise the next version's | `waveS-lane08-ticket1137.md` |

**Lane L8 carries no OUTSTANDING successor contract of its own** (`waveS-merge.md` §11), but the
merge itself created one obligation and recorded it there rather than on a lane: **0353's follow-up
1 is HALF DONE.** The half #1051's census forced has landed (the tenancy plan step no longer keeps
its own authority wall); the other half, folding `clara._tenancy_plan_core` whole into
`clara._obo_plan_core` as a two-line widening of its closed kind set, is still open and still worth
doing, because the estate still has two plan-step bodies where one would do.

**L8's own lane claims are not re-verified by the merge**, only its integration. Its recheck is an
accept with zero findings, and the merge changed four things inside its two migrations (the tenancy
plan step's authority block, the embedded queue core, the hash recipe and one prestate
prerequisite), each argued and measured in §14.2 and green on the integrated chain, but **no lane
worker re-reviewed the recut bodies**.

### The three closures that must not read as plain DONE

| ticket | how the closure comment must read |
|---|---|
| **#1098** | done, with AC1's second half PARTIAL and disclosed, and the residual driven by a cell rather than left silent |
| **#1060** | done for the narrowed half; the second half is dormant by the ticket's own "Out of scope" line and is not built |
| **#1136, #1137** | done for the DATABASE half, which is the whole of the lane's ruled scope; the seven chat tools belong to the cut family's next version |

---

## 7 · Anything unverified

- **Everything hosted.** No hosted read, no `fly` call, no deploy. Every number in the runbook that
  is not a rig reading is an expectation carried from `RELEASE-WC-RUNBOOK.md` § RESULTS or parsed
  from the tree.
- **`D-ROLE-REACH`'s `clara_authenticated` half.** Every rig here migrates as a superuser, so the
  check has only ever returned `superuser=true`. The cut's window answered the `clara_fn_owner` half
  for hosted; whether the hosted migrating role can `set_config('role','clara_authenticated')` is
  unread until step 3, and it is what 0341's §TAIL needs.
- **The body census against a LANE rig.** `workflow.workflow_runs` is absent on every lane database
  on this host, so this script's census statements have never returned a row. The SQL mirrors
  `lib/rollback-preflight.mjs`'s own (same table, same terminal statuses, same `bodyIdentifierOf`
  derivation) but is not imported from it. Gate C provisioned the schema on its own cluster and drove
  the preflight five ways against it, so the shape of the question is exercised; what is unexercised
  is THIS script asking it of a database that carries rows.
- **The backfill's hosted size and the two evidence tables' hosted row counts.** All three read 0 on
  the pristine template, because no rig carries a committed firm-scope plan and no rig has served an
  auth wall. Hosted's own numbers are the only ones that mean anything and they are unread until
  step 3.
- **An `en_US.UTF-8` replay.** Both fingerprints were taken at `C.UTF-8`. The cut measured the
  cross-collation reading in both directions and found it irrelevant by construction for body pins;
  this wave pins no content digest either, but that is reasoned here rather than measured.
- **The `--post` and pre-window baselines the WINDOW will use.** The two fingerprints above are this
  worker's, taken from the merger's cluster. A hosted-shaped baseline is the gate worker's and does
  not exist yet.
- **The web `next build`.** Green typecheck, a green 5249-test unit suite and five green browser
  walks at the integration head, and no full `apps/web` build anywhere
  (`reports/waveS-merge.md` §18 item 3). Step 5 is the first one, and this wave's web diff is
  substantial: sixty changed files under `apps/web/components`, `app` and `lib`.
- ~~The two-build cutover drill~~ **CLOSED by gate C**: ALL PASS, three legs, 84 s, with #1131's new
  contract-rule assertions driven at frontier `0361` (`waveS-gates-C.md` §3, §3a).
- **`reads-wS.mjs` inherits about 1,700 lines from `ceremony-wC/reads-wC.mjs` unchanged.** Those
  parsers were exercised by wave 4's fifteen negative controls and the cut's thirteen; they were not
  re-derived here. The blocks this worker wrote are the header, the pin parser (`declaredSigNames`,
  `declaredShaNames`, `balancedFrom`, `splitTopLevel`, `parsedRosterColumnMaps`,
  `parsedSpliceAnchors`, `parsedBodyPins`), `parsedPremiseObjects`, the thirteen hand checks and
  their five new parsers (`parsedAllowlistRows`, `parsedMachineGrants`, `parsedRegistryVersions`,
  `parsedTriggerToggles`, `parsedRoleReach`, `parsedBackfills`), `bodyCensus`, `postReads`, and the
  recipe and newborn handling in `bodyPins`.
- **No mid-task status request arrived.** Had one, it would be the orchestrator's to answer, noted
  and not acted on, per the brief.
