# Riders closing wave K, release preparation: the preflight, the runbook, the deploy order and the closure roster

Written 2026-09-26 by the release-preparation worker, who has **no hosted access** and did not use
any. Nothing was pushed, no pull request was opened, no GitHub object was written, no lane worktree
was touched, no `fly` command was run. Every database action was a read inside `begin transaction
read only`; no database was created, altered or dropped, and the merger's own cluster
(`127.0.0.1:55742`) was used read-only for the dry runs.

**What was produced**

| path | what |
|---|---|
| `docs/plan/active/riders-2026-09-20/ceremony-wK/reads-wK.mjs` | the wave's read-only hosted preflight, derived from `ceremony-wS/reads-wS.mjs` with `--cut-only` restored from `ceremony-wC/reads-wC.mjs` |
| `docs/plan/active/riders-2026-09-20/RELEASE-WK-RUNBOOK.md` | the ceremony: the cut phase's step order, including step 11a and the expiring rollback snapshot, with the sweep's parse-everything discipline |
| `reports/waveK-release-prep.md` | this file, including the closure roster and the owner question |
| `scratchpad/riders/pr-wK.md` | the pull-request body draft, with the three gate results left as placeholders |

---

## 1 · What was read

`RELEASE-WC-RUNBOOK.md` in full including its `§ RESULTS`, its signed-in walk and its step 11a;
`ceremony-wC/reads-wC.mjs`'s `--cut-only` and `versionCut` sections; `RELEASE-WS-RUNBOOK.md` in full
including its `§ RESULTS`; `ceremony-wS/reads-wS.mjs` (3,180 lines) and
`reports/waveS-release-prep.md` and `reports/waveC-release-prep.md`; `reports/waveK-merge.md` in
full (all eight sections); `CLOSING-PLAN.md` in full; `docs/plan/active/factory-reset-2026-09-26/
RUNBOOK.md` in full including its RESULTS and its seven deviations; `RIG.md`'s Hosted and Closing
wave sections; the status line and the completion claims of all eight
`reports/waveK-lane0N-ticket*.md`, and the fix and recheck reports of all four lanes. In
`C:\Users\zhant\Desktop\clara-wt\int2` at `18eb2dc4d`: all four migrations read for the statements a
release has to know about (their prestates, their pin idioms, their grants, their locks and their
tails), `packages/runtime/workflows/registry.ts`, `packages/runtime/plugins/startWorld.ts`,
`frozen-workflows.json`, and the diff of `packages/runtime/lib/rollback-preflight.mjs` and
`packages/runtime/lib/runtime-contracts.mjs` against `origin/main`.

**The head is `18eb2dc4d`**, `integration/riders-closing`'s DONE tip, checked out in `clara-wt/int2`
as the local branch `docs/riders-closing-runbook`, which is where these files are committed.

---

## 2 · The deploy order, with evidence per leg

**ORDER: database first, then the runtime image by digest, then the web promotion. The machine IS
stopped before the migrate and started again only on the new image.**

`grep -niE 'deploy order|write-quiet|quiesce'` over `0362`, `0363`, `0364` and `0365` returns
**nothing at all**: not one of the four carries a deploy-order header. The cut phase's own lesson was
that the forcing statement can live in the RUNTIME rather than in a migration, so the reverse
direction was checked there, and this is where the wave's shape shows:

| what the new image gains | does it call a door this wave creates? | order |
|---|---|---|
| `chatTurn_v23`'s seven new tools | **no.** Every door they call was shipped by the SWEEP wave's 0352 and 0353 and has been live on hosted since 2026-09-25 | **free in both directions.** This is what the deferral bought: the cut waited for the doors, so the doors are not waiting for the cut |
| `claraWork_v7`'s `loadFaProposalInputsStepV7` | it reads `clara.fa_account_depreciation_policies` and the knowledge catalogue, both the sweep's 0345 and 0346 | free |
| `clara.wake_get_firm_standing_instruction` (0362) | nothing in this image calls it; the chat tool over it is a successor contract | free: a door nothing calls |
| `clara.get_payroll_posting_state` (0363) | the WEB calls it (`lib/documents/payroll-posting-state.ts`, mounted in `document-detail.tsx`) | **database first in practice**: a promoted web calling it before 0363 answers `42883` on the document page |
| 0364's six recut bodies | the serving image and web already call three of them, and **0364 changes no signature and no refusal** (`waveK-merge.md` §0, §2) | free in both directions |
| 0365's six-argument register read | the new web sends `p_cursor` and `p_limit` | **database first, non-optional.** A promoted web sending six arguments to a four-argument door is `PGRST202`. The reverse is free: both new parameters default to NULL, and `LIMIT NULL` is PostgreSQL's own "no limit at all", so an old four-argument call reaches exactly the unbounded query it reaches today |

### The machine stop, and the honest limit of what it buys

**The migrations barely need it**, and saying so is more useful than implying a hazard that is not
there: no `ALTER TABLE`, no index build, no constraint swap, no backfill. What remains is
`packages/db/README.md`'s rule for recutting an active writer body, and 0364 recuts six.

**The version cut needs it for the reason every cut has**: the machine must be restarted anyway to
pick up the new image, so the stop costs one extra call.

**What the stop does NOT buy:** it quiesces the runtime's writers, not the browser's. For this wave
the relation to watch is not a table at all, it is the `pg_proc` entry 0365 drops.

**`55P03 lock_not_available` is NOT a branch of this release**, and that is parsed rather than
remembered: **no file in this wave arms a `lock_timeout`**. 0365's `drop function` can therefore WAIT
rather than refuse, up to its file's `statement_timeout` of 5 min, and then raise `57014
query_canceled`. On a factory-reset estate with one owner session that is theoretical; step 6b's
`pg_locks` read is what makes it measured.

**PostgREST's schema cache is a watch item again.** 0365 changes a door's argument list. Wave 4
carried the same watch item for a different reason and the sweep explicitly had no analogue because
it changed no signature. Supabase installs a DDL event trigger that reloads the cache; the runbook
says where a stale one would show (step 8, the accrual register) rather than reasoning it away.

---

## 3 · The preflight: what changed from the sweep's, and why

The design is wave 4's, the cut's and the sweep's, unchanged: the same fingerprint, the same
role-level `env` rule, the same savepoint discipline, the same generated-read families, the same
widened pin parser. **Four things are different and every one of them is a measurement in these four
files rather than a preference.**

**1. `--cut-only` is back, and section (v) is the cut's rather than the sweep's.** The sweep deleted
the mode because its successor set was empty and its own copy of section (v) existed to MEASURE that
emptiness. This wave repoints two pins, so the section is restored to the shape the cut gave it: the
successor set is derived (a class with a predecessor, pinned at its newest, whose module is still
unlocked in the manifest), each successor's non-terminal run count is MEASURED, and the rollback note
carries a timestamp because the answer degrades the moment the new image serves. `--cut-only` is what
re-takes that snapshot later, and the runbook's step 9 names it.

**2. THE PIN PARSER IS REUSED WHOLE AND GAINS ONE ARM.** Run unchanged over this pending set, the
sweep's parser reads **21 of the wave's 22** (file, signature) pins and leaves ONE 64-hex literal
unattributed: 0362's bimodal pin of `clara.withdraw_firm_standing_instruction(text,text,text)`.
That file HOISTS the body into a local first (`select p.prosrc into v_src from pg_proc p where p.oid
= to_regprocedure('…')`) and only then measures `sha256(convert_to(v_src,'UTF8'))`. Every scalar arm
in the sweep's parser keys on the token `prosrc` appearing INSIDE the `sha256` call, so a hoisted
body is invisible to all of them. An unattributed pin is an UNCHECKED precondition wearing a clean
ledger's clothes, so **arm (E)** binds the local to the signature the `to_regprocedure` (or the
`::regprocedure` cast) names, then reads every digest compared against a measurement of that local,
stopping at the next such measurement so two hoisted bodies never borrow each other's shas. With it
the ledger reads 22 of 22 and **0 unattributed digests**. Everything else in the parser is the
sweep's, byte for byte, and the arm distribution is printed: `hoisted=1, roster=14, scalar=7`.

**3. THE RECIPE QUESTION IS ASKED AND ANSWERS ONE WAY.** The sweep had seven pins on the
`sha256(prosrc::bytea)` recipe and met a real `22P02` at integration when a body gained a backslash.
`grep -c 'prosrc::bytea'` over these four files is **0**, measured. The parser still reports the
recipe per pin and still carries the backslash read, so a future file that switches back is caught
rather than absorbed.

**4. TEN HAND CHECKS, THREE OF WHICH CARRY THE STEP'S REAL CONTENT, AND FIVE FAMILIES THAT PRINT
THEIR OWN ABSENCE.** The three are `D-ROLE-REACH` (the one check no rig can answer, re-read rather
than carried because the 2026-09-26 factory reset dropped and re-minted the whole role catalog),
`D-DROPPED-DOOR` (0365's drop, the only statement in the wave that takes a lock on something outside
the migration, on a door the browser reaches through PostgREST) and `D-HUMAN-DOOR-SIGNATURES` (the
three doors this wave hands `clara_authenticated`, with the PostgREST cache question stated). The
other seven are `D-WAVE-PREMISE`, `D-CHAIN-PREREQUISITE` (new: the ledger rows 0364's prestate counts
before it will apply), `D-OPKEY-NAMESPACE` (new: the four suffix censuses 0364 takes over every body
in the schema), `D-WAVE-MINTED-NAMES`, `D-REDO-MARKERS` (new, report-only: the substring probes each
prestate uses to tell a first apply from a redo), `D-WAKE-ALLOWLIST` and `D-MACHINE-LANE-GRANTS`.

The five absences are printed from the parse rather than remembered, so a future re-derivation of
this file against a different pending set grows the checks back by itself instead of silently
omitting them: no relation created, no CHECK swapped, no registry version stamped, no backfill, no
index built, no role minted, no trigger disabled, no body spliced through an anchor.

**A parser subtlety this wave forced, and it is worth writing down.** A migration's PRESTATE and its
§TAIL ask the SAME questions of the catalog and mean opposite things: the head says "what must be
true before I run", the tail says "what I made true". 0364 is the worked example. Its head requires
ZERO bodies deriving `:acplan`, and its tail requires exactly TWO deriving `:plan` after the move,
which before the window are five. A first draft of `D-OPKEY-NAMESPACE` scanned the whole file and
therefore invented a STOP. The fix is a shared `headOf(version)` helper (everything above the first
top-level `set role`), which `parsedOpKeySuffixes`, `parsedLedgerPrerequisites`,
`parsedRedoSubstrings` and `parsedPremiseObjects` now all use. Before it, `D-REDO-MARKERS` also
picked up eight of 0365's TAIL probes as though they were prestate attribution tags.

---

## 4 · The dry-run verdicts

Migrations directory and `CLARA_REPO`: `clara-wt/int2` at `18eb2dc4d`. Databases: the merger's own
cluster `127.0.0.1:55742`, read-only.

| run | target | verdict |
|---|---|---|
| `--plan` | no database | **exit 0, 0 GAP.** 4 pending, 341 files, **22 pins (22 measurable / 0 chained / 0 newborn)**, 10 hand checks, 0 relations created, 0 roles minted, the registry reading `bodies=62 … 362 entries, 15 UNLOCKED, SUCCESSOR BODIES chatTurn_v23, claraWork_v7` |
| pre-window + `--baseline fp-wK-pre.json` | `clara_intS6`, the pristine 337-file template (337 / `0361`, `C.UTF-8`) | **12 ok, 2 report-only, 3 STOP.** 11457 keys compared, **11457 equal, 0 env**; **22 of 22** measurable pins at a value their own file admits; every hand check ok |
| `--post` + `--baseline fp-wK-post.json` | `clara_intK`, the merger's ordered chain (341 / `0365`, `C.UTF-8`) | ledger **337 + 4 = 341 at 0365**, four rows at their file checksums, drift 341/341, fingerprint **11459 keys, 11459 equal, 0 env**, **every (f) read answered** |
| `--census` | `clara_intK` | the version-cut census and the quiescence census alone, which is what step 6b re-reads with the machine stopped |
| `--cut-only` | `clara_intK` | section (v) alone: the registry, the manifest, the run census by body, the stranded census, the successor bodies' run counts and the timestamped rollback note |

**The three STOPs in every rig run are structural to a rig**, and there are three rather than the
sweep's two because a version cut adds the "no run exists yet on a body this cut introduces" check.
No rig database on this host carries a bootstrapped Workflow DevKit World, so `workflow.workflow_runs`
answers `42P01`, the census fails CLOSED and each derived check prints `NOT COMPUTED`, because "I
could not look" must never wear "I refuse"'s clothes. **Hosted's `workflow` schema WAS re-provisioned
by the factory reset's step 7**, so this is a gap in the dry run rather than in the wave.

**One defect of the sweep's script is NOT carried forward.** Its `--post` section (f) asked for
`clara.knowledge_keys.retired_at`, a column that does not exist, so the whole combined read aborted
with `42703` inside the sweep's own window and that lane question went unmeasured
(`RELEASE-WS-RUNBOOK.md` § RESULTS, deviation 1). This wave's `postReads` is written fresh for its own
four lanes and every one of its reads answered against `clara_intK`.

### The two fingerprints

| fingerprint | source | ledger | structural keys | reference counts | sha256 of the file |
|---|---|---|---|---|---|
| **PRE** `fp-wK-pre.json` | `clara_intS6`, the sweep merger's ordered 337-file chain, which gate A proved byte-equal to a from-scratch build and which every closing-wave lane database was cloned from | 337 / `0361_reservation_release_advice` | **11457** | 55 | `e48fefcf1a06aeffc0b1ae6b8f22ae556b3f0fc9fca64fcd5eb3ddf97e14de24` |
| **POST** `fp-wK-post.json` | `clara_intK`, the closing wave's ordered chain of all four lanes | 341 / `0365_accrual_register_pagination` | **11459** | 55 | `0874c98ef16634076bcf26df8b93685d5dff121878328041fdd10dd5566e1514` |

**The wave adds exactly 2 structural keys** and no reference relation, which is itself a reading of
how small the database half is: 0362 and 0363 each mint one function, 0364 replaces six bodies in
place and 0365 drops one signature and creates another. Both were taken at `C.UTF-8`; hosted is
`en_US.UTF-8` and a cross-collation replay is owed. **Neither is the baseline the window uses**: a
hosted-shaped baseline must be exported from a database at the hosted frontier by the same script and
the same tree, and these two are this worker's dry-run artefacts.

### Negative controls

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | the HOISTED pin's literal corrupted by one hex digit, in a COPY (0362) | `STOP PIN … [hoisted, recipe utf8]`, **21 of 22**, printing both sides AND the file's own REDO arm (`a body carrying "#1147 [0362]"`) so a first-apply target is not mistaken for drift |
| 2b | the SAME literal made unparseable (upper-cased), in a COPY | **the pin SILENTLY LEAVES the ledger**: `22 of 22` becomes `21 of 21` and no GAP is raised. See finding 3 below |
| 3 | an applied file's bytes changed in a COPY (0361) | `DRIFT 0361… - checksum differs from the file` and `STOP drift gate` |
| 4 | `--post` against the un-upgraded template | STOPs on the arithmetic and on four `no ledger row` lines |
| 5 | a baseline value corrupted on an object a pending file PINS | `STOP DRIFT (PINNED by 0364_plan_reservation_namespace_obo_fold) fn:clara._assert_plan_authority(...)` |
| 6 | the same corruption on an object no pending file names | `STOP DRIFT fn:clara.claim_paid_firm(uuid,text)`, unqualified |
| 7 | `CLARA_REPO` pointed at a tree with no `registry.ts` | in `--plan` the registry section says so by name; against a database the script fails at module resolution on `packages/db/lib/pg.mjs`, which is loud rather than silent |
| 8 | a `frozen-workflows.json` with EVERY entry `deployed: true` | `STOP THIS RELEASE IS A VERSION CUT … all 362 entries are already deployed:true - this is NOT the version cut the runbook describes` and `STOP … this tree introduces no successor body` |
| 9 | `workflowPins` left at `chatTurn_v22` / `claraWork_v6` | the boot line prints the OLD pins and `STOP … no class carries a predecessor whose module is unlocked` |

Controls 8 and 9 edited a tracked file in the int2 worktree and restored it with `git checkout --`
immediately; the tree was read clean afterwards. Every other control acted on a COPY. Controls 8 and
9 are this wave's own and are the mirror image of the sweep's: there the check proved the successor
set was EMPTY, here it proves it is not.

---

## 5 · Findings handed up, beyond the runbook

1. **Hosted is a factory-reset estate and three of this ceremony's readings inherit that.** The
   2026-09-26 reset (`docs/plan/active/factory-reset-2026-09-26/RUNBOOK.md`) left the product
   unchanged and the data blank: one login account, one firm (`Testing Firm`, operator, one member),
   no client, no document, no Work, zero workflow runs, an empty `firm-docs` bucket. So (a) every
   row-shaped precondition reads 0 and the wave's already-light database half is lighter still; (b)
   `D-ROLE-REACH` and `D-MACHINE-LANE-GRANTS` are re-read rather than carried from the 2026-09-25
   windows, because the reset dropped the six post-0154 roles, renamed a seventh out of 0154's
   census, re-ran the whole chain and then had to grant LOGIN to seven `_login` roles by hand (its
   deviation 5); and (c) **step 9's rollback snapshot is the weakest ALLOWED this programme will have
   recorded**, satisfied vacuously over zero runs rather than over a roster of parked work, and it
   closes the moment the owner sends one chat message. The runbook says all three plainly rather than
   presenting the readings as though they had been tested.
2. **The env-line count is expected to CHANGE and nobody should read that as drift.** The cut and the
   sweep both read 16 role-level `env` lines against their rig baselines; the factory reset's own
   post read saw **12**, because the reset re-minted the roles the chain owns and left only the
   Supabase-managed differences. The runbook therefore expects about 12, asks for the number to be
   recorded, and sets the finding threshold above 16 rather than at 16.
3. **A pin literal that stops being lowercase 64-hex leaves the ledger silently, and the only guard
   is the recorded COUNT.** Negative control 2b: upper-casing 0362's sha turns `22 of 22` into `21 of
   21` with no GAP and no STOP, because `unattributedDigests` scans for the same lowercase 64-hex
   shape the parser does. This is a limitation of the whole parser family, inherited from
   `reads-wC.mjs` and not introduced here, and it is why the expected pin count (22) is written into
   the runbook's gate 0a rather than left as a thing the script alone would notice. Worth a line in a
   future re-derivation: a case-insensitive scan for 64-hex would catch it.
4. **The two-build cutover drill is the one gate this release may not open a window without**, and
   the merge did not run it (`waveK-merge.md` §7.2). A version cut's registry edits are regex-asserted
   by `packages/runtime/tests/scratch-image.mjs` against `CUT-PLAN.md` §2.2's exact textual shapes, so
   a deviation breaks the drill rather than the boot, and the boot is the expensive place to find out.
5. **#1147 carries an owner ruling that is still not on GitHub.** Quoted in full in §7 below. It is an
   orchestrator action: the merger may not write to GitHub and neither may this worker.
6. **The `role-census-reset.test.mjs` quoting defect the merge found is a one-line fix in a file this
   wave does not touch** (`waveK-merge.md` §5.3): `grant connect on database ${process.env.PGDATABASE}`
   interpolates the name UNQUOTED, so PostgreSQL folds it to lower case and every mixed-case
   integration database fails that cell. Two things follow and neither is the release's: the release
   should name any database it creates in lower case, and the cell is worth one ticket.
7. **Blueprint pin drift, unchanged and now five cuts old.** `docs/ARCHITECTURE.md:171`, `:183`,
   `:207`, `:445` say "chatTurn -> chatTurn_v19, claraWork -> claraWork_v3". After this release the
   true answer is v23 and v7. Per `AGENTS.md` rule 4 a blueprint edit belongs to a wayfinder session;
   every wave has recorded it and so does this one.

---

## 6 · The closure roster

For every ticket of the wave: the status the lane report CLAIMS, and the report that carries it.
Eight tickets across four lanes. Report paths are relative to
`docs/plan/active/riders-2026-09-20/reports/`.

### Lane L1, the standing instruction and the payroll posting verdict (migrations 0362 0363)

| ticket | claimed status | report |
|---|---|---|
| #1147 | **"DONE for the two halves the ticket asked to be built, with the third pinned as the ticket asked"**, and one acceptance criterion recorded as ALREADY SATISFIED on the branch rather than rebuilt | `waveK-lane01-ticket1147.md` |
| #1148 | **DONE.** "every acceptance criterion but one (the from-scratch chain, the integrator's) carries its own evidence" | `waveK-lane01-ticket1148.md` |

Lane L1's recheck is `accept` with **zero findings** (`waveK-lane01-recheck.json`), having re-read the
shipped bodies for the three majors rather than trusting the fix report's prose. Two items stay open
and both are assigned away from the lane by `WORK-ORDER.md` and `CLOSING-PLAN.md`: SPEC-03, the owner
ruling comment (§7 below), and SPEC-04, the from-scratch chain.

### Lane L2, estate consolidation (migration 0364)

| ticket | claimed status | report |
|---|---|---|
| #1150 | **DONE.** "Every acceptance criterion is met except the from-scratch chain, which `CLOSING-PLAN.md` reserves to the integrator on a disposable cluster" | `waveK-lane02-ticket1150.md` |
| #1149 | **DONE** | `waveK-lane02-ticket1149.md` |

Lane L2's recheck is `accept` with zero findings. Two items the fix round correctly left open are
recorded as follow-ups rather than dropped: the within-lane `:plan` and `:rrplan` sharing in
`clara._prepayment_schedule_core` + `clara.replace_prepayment_schedule` and
`clara._revenue_recognition_core` + `clara.replace_revenue_recognition_schedule`. Both are enumerated
in `ACKNOWLEDGED_SHARED_DERIVERS` and measured every run by `p1150.namespace.one_suffix_one_body`,
which fails BY NAME if a roster entry outlives its cause.

### Lane L3, infrastructure (migration 0365)

| ticket | claimed status | report |
|---|---|---|
| #1152 | **DONE** | `waveK-lane03-ticket1152.md` |
| #1151 | **no single status line; AC1, AC2 and AC3 PASS and AC4 is PARTIAL with the gap named.** `intake-e2e.mjs`, the other caller of `waitForQueueDrain`, was not run end to end on this rig; the call site is byte-identical and the shipped library is unchanged, which is the structural argument the recheck independently confirmed | `waveK-lane03-ticket1151.md` |
| #1145 | **DONE** | `waveK-lane03-ticket1145.md` |

Lane L3's recheck is `accept` with one note-severity finding, `STD-1`, confirmed as a documented
judgement call rather than reopened: whether a migration's own structural cells satisfy rule 4's
red-green loop. A house-law question for `WORK-ORDER.md`, not a defect. The recheck is explicit that
`SPEC-K3-02` was not fixed in the sense of a passing run, and that the fix report took the reviewer's
own disclosed alternative (run it, record the exit code and why) rather than silently closing the
acceptance criterion.

### Lane LC, the version cut (no migration)

| ticket | claimed status | report |
|---|---|---|
| #1144 | **DONE.** Nine commits, 32 files, 0 under `packages/db`, 0 migrations, 0 under `apps/web` | `waveK-lane04-ticket1144.md` |

Lane LC's recheck is `accept` with one note-severity finding still open: `STD-2`, a cosmetic
collapsed single-line env block for the v23 step in `.github/actions/db-live-gates/action.yml`, where
the v22 block immediately above is one assignment per line. It was never fixed and never mentioned in
the fix report, unlike every other note, which the recheck reads as an oversight rather than a
decision. No functional defect.

### The three closures that must not read as plain DONE

| ticket | how the closure comment must read |
|---|---|
| **#1147** | DONE for the two halves the ticket asked to be built. The THIRD half, the deferred-revenue twin's missing wake lane, is deliberately not built and is now held by a census cell (`p1147.asymmetry.census`) that reads both cores' lane sets and the wake allowlist off the LIVE catalog and fails the day one side is widened without the other. **And the owner ruling in §7 is still unrecorded**, so the closure comment must carry it rather than let it close with the ticket |
| **#1151** | AC1, AC2 and AC3 pass; **AC4 is PARTIAL and disclosed**: the other caller of `waitForQueueDrain` was not run end to end on this rig, its call site is byte-identical, the shipped library is unchanged, and the residual is named as a follow-up rather than glossed |
| **#1144** | DONE, with **two deliberate departures from `waveS-lane08-fix.md` §7.2's literal return shape** and **one comment correction that could not ride this cut**. All three are the orchestrator's to accept explicitly, per §8 below, rather than let pass as discharged |

---

## 7 · The #1147 owner question, quoted exactly

`waveK-merge.md` §7, item 7 flags it as carried rather than closed: *"**#1147's owner ruling** (L1's
`SPEC-03`) is still not on GitHub #1147: whether withdrawing a standing instruction should pause the
plans it authorised. Written out in `packages/db/README.md`'s `0362` section and in
`waveK-lane01-ticket1147.md`. An orchestrator action, and the merger may not write to GitHub."*

The question as the lane report states it, quoted verbatim from
`reports/waveK-lane01-ticket1147.md` § "Follow-ups worth filing", item 2, so the orchestrator can
rule on the text the lane actually wrote:

> **OWNER RULING OWED: should withdrawing a standing instruction PAUSE the plans it authorised?**
> Today it does not (this ticket did not change that, and the migration's tail asserts the door
> names no plan-state verb). The case for pausing: a firm that says *"stop letting Clara do this"*
> plausibly means the schedules too. The case against: each plan is a separate, already-authorised
> commitment whose occurrences a person can pause or end one at a time (Client → Plans), and #940
> ruled exactly that way for a retired roster enrolment. The firm now at least **sees the count**.

**Two things make this rulable now rather than later.** First, the consequence is visible for the
first time: the withdraw door's receipt carries `plans_still_posting`, so a firm is told what its
withdrawal did not stop. Second, the estate is blank, so on this release the count reads **0** and
nothing turns on the answer yet. The cheapest moment to rule is before a firm has plans.

**Two further rulings the same ticket records and does not take**, listed so the orchestrator can
take all three in one pass:

- **May one instruction stand the deferred-revenue side too?** Closing the asymmetry costs four
  moving parts: a wake wrapper over `clara._revenue_recognition_core`, the lane set widened, a
  `clara.wake_fn_allowlist` row, and a SECOND instruction key in 0338 §A's closed set and both write
  doors. The census now keeps it a decision rather than a drift.
- **`close_prep` is still `enabled = false` estate-wide** (#1050's own follow-up 5, unchanged). The
  read door answers "what has this firm instructed", not "will it actually run", so a model that
  reads `active: true` will say Clara may do this at close while nothing yet does. The settings card
  has exactly the same property today, so this is not a new divergence between the two surfaces, but
  whether either should also project the estate-wide switch is a product question nobody has been
  given.

---

## 8 · The successor contracts owed to the NEXT cut

`waveK-merge.md` §6 records six, and the shape of the list is itself a result: **LC's roster is
closed to additions and both open database lanes respected it.** Two lanes state that none is owed
and prove it with an empty `packages/runtime` diff and a clean freeze-lint (L2's `waveK-lane02-fix.md`
§5, L3's `waveK-lane03-fix.md`). Every contract below is for the cut AFTER `chatTurn_v23` and
`claraWork_v7`.

| # | ticket | source | target | what must be carried |
|---|---|---|---|---|
| 1 | #1147 | `waveK-lane01-fix.md` §4.1 | a chat tool `read_firm_standing_instruction` over `clara.wake_get_firm_standing_instruction` | The projection's `recorded_by` is a **bare user uuid**, and no `clara.wake_get_%` door in the catalog resolves a uuid to a person (measured: 0 of 11). The successor tool says THAT an instruction stands and WHEN, and must not attempt to name the member until a later cut projects a display name |
| 2 | #1148 | `waveK-lane01-fix.md` §4.2, contract in `waveK-lane01-ticket1148.md` §8 | a chat tool `read_payroll_posting_state` over `clara.get_payroll_posting_state` | Seven keys, including **`duplicate_scope`**. When `rung = 'no_duplicate_entry'` and `duplicate_scope = 'same_document'` the sentence is about the document the caller is already holding and must not be repeated back as a reason it "did not post". Refusals: `CLR11` for a document that is not this firm's AND for one that does not exist (one message, no oracle), `CLR04` at the viewer floor, and `CLR10 / not_a_payroll_summary`, which a surface answers with silence and a chat tool must never render as a firm-facing sentence |
| 3 | #1147 | `waveK-lane01-fix.md` §4.3 | `clara._prepayment_schedule_core`'s wake arm | A `for key share` lock on the instruction row, so `plans_still_posting` is a statement about the world after the withdrawal rather than about the withdrawing transaction's snapshot. This is a recut of a schedule core, which L1 was grouped specifically not to do. A ticket, not a cut item |
| 4 | #1144 | `waveK-lane04-fix.md` §3.1.1 | `packages/runtime/lib/prepayment-schedule-basis.ts:119` | The `invalid_author` comment still says "CLR10, and NEVER SHOWN"; `0335` moved that refusal to `CLR44`. The correction could NOT ride this cut, measured rather than asserted: every consumer of the module is deploy-locked and `chatTurn_v23` reaches it only through byte-locked `chatTurn.v22.tools.ts`, so a successor copy would be unreachable. The RULE it implies IS enforced in this cut (`isGovernedRefusalV23` subtracts `CLR44`) |
| 5 | #1144 | `waveK-lane04-fix.md` §3.1.2 | `clara._confirm_tenancy_rent_plan_core` and `clara._confirm_tenancy_rent_plan_revision_core` | A replay marker. Either stamp `'replayed', false` into the `clara._finish_op` payload, or follow the estate's house shape and raise `CLR13 operation_in_flight` on the `v_dedupe ? 'pending'` branch and return the stored receipt with an added `replayed` key on the settled branch. Until one lands, no chat tool can tell a converged replay from a fresh act. **Note for the next writer: L2's `0364` rewrote both these cores in this same wave and did NOT add the marker, so the contract is live against the post-`0364` bodies** |
| 6 | #1144 | `waveK-lane04-fix.md` §3.1.3 | `clara.get_document_state` | #1136 §1 asks the posted branch to report "the entry: its date, its memo and its total". The state door carries `{entry_id, status}` and nothing else, so `chatTurn_v23` reports the approved entry IDs and the whole state and has no date, memo or total to quote. Either `operation.entries` gains those three fields, or the next cut takes a second granted read |

**And two rulings LC asks the orchestrator for, which belong with the closures rather than with the
contracts** (`waveK-lane04-fix.md` §6):

1. **`SPEC-K-L04-05`'s comment half stays a successor contract** (item 4 above), with the measurement
   that taking it here would ship unreachable duplicated constants. *"The integration record should
   accept the deferral explicitly rather than let it pass as discharged."*
2. **Two deliberate departures from `waveS-lane08-fix.md` §7.2's literal return shape**, both
   documented in the module: `offer` is **added** (kept, with its reason) and `replayed` is
   **removed** (a field the estate cannot answer). *"If the orchestrator prefers §7.2 byte for byte,
   the removal is the one to revisit, and the successor contract in §3.1.2 is what would make it
   truthful."*

---

## 9 · Anything unverified

- **Everything hosted.** No hosted read, no `fly` call, no deploy. Every number in the runbook that
  is not a rig reading is an expectation carried from `RELEASE-WS-RUNBOOK.md` § RESULTS, the factory
  reset's RESULTS, or parsed from the tree.
- **RELEASE_SHA does not exist yet.** The closing-wave PR is unopened and its CI has not run. Every
  statement about "the RELEASE_SHA tree" is really about `clara-wt/int2` at `18eb2dc4d`.
- **The two-build cutover drill, the from-scratch chain and the runtime suite on a provisioned World.**
  All three are the gate workers' and all three are named as owed in the runbook's section 0 rather
  than reasoned around.
- **`D-ROLE-REACH` against hosted's post-reset role catalog.** Every rig here migrates as a superuser,
  so the check has only ever returned `superuser=true`.
- **The run census against a database that carries rows.** No lane rig has a provisioned Workflow
  DevKit World, so this script's census statements have never returned a row. The SQL mirrors
  `lib/rollback-preflight.mjs`'s own (same table, same terminal statuses, same `bodyIdentifierOf`
  derivation) but is not imported from it. Hosted, being blank, will not exercise them either.
- **Whether PostgREST reloads its schema cache promptly after 0365's signature change.** A hosted
  behaviour this worker cannot test; step 8 is where a stale one would show.
- **An `en_US.UTF-8` replay.** Both fingerprints were taken at `C.UTF-8`.
- **The `--post` and pre-window baselines the WINDOW will use.** The two fingerprints above are this
  worker's, taken from the merger's cluster. A hosted-shaped baseline is the gate worker's and does
  not exist yet.
- **`reads-wK.mjs` inherits about 3,000 lines from `ceremony-wS/reads-wS.mjs` unchanged**, which in
  turn inherits about 1,700 from `ceremony-wC/reads-wC.mjs`. Those parsers were exercised by wave 4's
  fifteen negative controls, the cut's thirteen and the sweep's eight; they were not re-derived here.
  What this worker wrote is the header, pin arm (E), the `headOf` prestate-region helper and the four
  parsers now scoped by it, the report-only check mechanism, `parsedHumanGrants`,
  `parsedOpKeySuffixes`, `parsedLedgerPrerequisites`, the ten hand checks, the restored `--cut-only`
  dispatch, `bodyCensus` in its version-cut shape, and `postReads` whole.
- **No mid-task status request arrived.** Had one, it would be the orchestrator's to answer, noted and
  not acted on, per the brief.
