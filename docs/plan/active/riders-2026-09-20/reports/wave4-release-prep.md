# Riders wave 4 — hosted release preparation

**Worker** release-preparation, read-only. No hosted access, no `fly`, no push, no PR, no GitHub
write, no commit, no lane worktree, no subagent. Everything below is a rig reading or a reading of
the integration branch.

**Deliverables**
- `docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs` — the preflight.
- `docs/plan/active/riders-2026-09-20/ceremony-w4/README.md` — its design, its six changes from
  wave 3, the dry runs and the fifteen negative controls.
- `docs/plan/active/riders-2026-09-20/RELEASE-W4-RUNBOOK.md` — the ceremony, wave 3's step order,
  plus #871's operator credential step at 6e.
- this report.

**The code this is about.** `integration/riders-w4` in `C:\Users\zhant\Desktop\clara-wt\int2` at
**`fb1dae78a`, the FINAL integration head**, all seven lanes merged. The head moved four times
while this was being written (`89e0a408f` when the work order was issued, `2f7ada3a8` when lane 04
merged, `bb102839c`, then `fb1dae78a`); the pending set, the file count, the 189/136/53 pin split
and both dry-run verdicts were re-derived at each one and are the same at every one.
**309 migration files, 21 pending above hosted's 288 / `0293_fa_arrears_judgement_scope`**:

```
0295 0296 0297 0298 0299 0300 0301 0302 0303 0304 0305 0306 0307 0308
0309 0310 0311 0315 0316 0317 0318
```

`0294` and `0312`...`0314` were reserved by the plan and never used. Lane 06's fix-round file is at
`0318`, renumbered off lane 04's `0317` on the orchestrator's ruling. Lane 07's second merge has
landed; the list below is final.

---

## 1. What I read

**The wave-3 ceremony, as the template.** `RELEASE-W3-RUNBOOK.md` whole, including its
`§ RESULTS (as run, 2026-09-23, UTC)`; `ceremony-w3/reads-w3.mjs` whole (1,560 lines);
`RELEASE-W2-RUNBOOK.md` § RESULTS for the lessons that are already folded in (the via-probe wrapper,
the ssh-console bundle stream, the role-level fingerprint overrule).

**The plan and the wave's own record.** `README.md`'s wave-4 table; `reports/wave4-merge.md`
(interim, six lanes, the `0317` duplicate and its resolution, the cross-lane pins, the from-scratch
chain, what the gate worker inherits); `reports/wave4-rig-prep.md` (the port deviation to
55700/55701/55702, the two collations, the two v1 hashes and why they differ);
`reports/wave4-lane05-ticket871.md` § "Release runbook step (#871)" verbatim; the lane ticket
reports for the files whose preconditions I had to parse.

**Every wave-4 migration on that branch**, headers and prestate blocks: deploy-order and write-quiet
obligations, prestate pins, data-dependent branches, and what the previous runtime image would
misread. The two new frozen families (`payrollFacts.v1`, `agreementFacts.v1`, five files each) and
the runtime's own boot pins in `packages/runtime/workflows/registry.ts` and
`packages/runtime/plugins/startWorld.ts`.

**The serving tree at `46cf7c85`**, which is what the deployed image and Worker were built from,
to check what the OLD side does against the NEW schema rather than assume it.

---

## 2. A blocker found while reading, since CLOSED

On the interim heads, `packages/runtime/workflows/registry.ts` **dispatched
`agreementFacts: agreementFacts_v1` while omitting the identifier from `workflowBodies`, from
`workflowPins`, and from the file's own `export { … }` roster.** The file's own comment says a
successor needs exactly five edits there and that `tests/registry-view.test.mjs` "reds on each one
left out". It did, on `89e0a408f` and again on `bb102839c`: 7 tests, 6 pass, 1 fail, the pins object
carrying thirteen keys where fourteen are expected. Had it reached RELEASE_SHA the boot line would
have read `bodies=56` with no `agreementFacts=` pin, `/api/build-info` would have disagreed with the
dispatch table, and the rollback preflight could not have enumerated the body.

**CLOSED on the final head `fb1dae78a`.** The identifier is present at all three sites, and:

```
node --test packages/runtime/tests/registry-view.test.mjs    # 7 tests, 7 pass, 0 fail
node scripts/check-frozen-workflows.mjs                      # OK, 322 / 57 / 3
```

Measured: `workflowBodies` holds **57** entries and `workflowPins` holds **14** classes, so step 7's
boot line reads `bodies=57` with fourteen pins. Gate 0a in the runbook keeps the check, because a
regression there is what makes that boot line unreadable.

---

## 3. The deploy order, with its evidence per migration

**ORDER: database first, then the runtime image by digest, then the web promotion, with the machine
STOPPED across the migrate.** The order is the same as waves 2 and 3. The ARGUMENT is different from
wave 3's, and the difference is the whole point of this section.

### 3.1 What the files themselves claim

`grep -niE 'deploy order|consumer-first|runtime-first|database-first|write-quiet|quiesce'` over all
21 returns hits in exactly three files, and all three claim database-first:

| file | its own heading | its stated reason |
|---|---|---|
| 0296 | `DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND` | the persist door validates the answer envelope against `clara._payroll_answers_ok`; a runtime answering a WIDER questionnaire than the live validator admits would be refused on EVERY persist and the lane would bank nothing |
| 0297 | `DEPLOY ORDER: DATABASE ALONE. NO RUNTIME STEP.` | it recuts one live body and splices one reader; no image change is coupled to it |
| 0299 | `DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND` | the same validator argument for `clara._agreement_answers_ok` |

**No file claims runtime-first.** `ARCHITECTURE.md` §5.F makes that silence readable: the obligation
to invert is written in the migration's own header, so a header that does not carry one does not owe
one.

### 3.2 The NEW runtime tolerates the OLD schema, which wave 3's did not

This is the measurement that makes the order a preference rather than a forcing constraint.

- Both new frozen families feature-detect their own persist door **inside the claim query**:
  `packages/runtime/workflows/payrollFacts.v1.dispatch.mjs:58` and
  `agreementFacts.v1.dispatch.mjs:63` each append
  `and to_regprocedure('clara.persist_…_facts(uuid,jsonb,jsonb,int)') is not null`. Against a 0293
  database they claim nothing and wait.
- `create_prepayment_schedule_for`, `read_prepayment_source_for` and
  `read_revenue_recognition_source_for` (0307, 0308) have **no live runtime caller at all**
  (grep-confirmed across `packages/runtime` and `apps/web`; they are database-side OBO twins for a
  later wake lane).
- `preview_invite_by_token` (0309) is reached only by a LAZY pool gated on
  `CLARA_INVITE_PREVIEW_DATABASE_URL`, which does not exist until step 6e.3.
- `admit_staff_expense_claim_work` pre-dates this wave (#638) and keeps its signature; 0301 recuts
  the body. Verified PRESENT on the hosted-shaped rig at 0293; the other six above are absent.

Wave 3 had three unguarded call sites that answered 42883 against a 0272 database, so DB-first was
the only lawful sequence. Here it is the chosen one.

### 3.3 The OLD runtime degrades in an orderly way, and there is no wave-3-style 0279

The one behavioural change the serving image meets between the migrate and its own replacement:
0296 and 0299 stop minting the terminal `failed/skipped_kind` receipt for a payroll summary or an
agreement contract and mint a `queued` row on a lane the serving image does not know. Read out of
the serving tree rather than assumed: `packages/runtime/lib/reconciler-documents.mjs` at `46cf7c85`
ends `enqueueForLane` with a warn-once and `return undefined`, and its own comment says an unknown
lane is "NOT dispatched … never fallen through to documentIngest (that would start a generic OCR run
outside the lane's own consent/egress controls)". **No mis-count, no re-drive, no vendor egress.**
0296's header makes the same promise from the database side: in that window the router writes "no
extraction, no region, no fact, no event and no journal effect of any kind".

Contrast with wave 3, where 0279 gave the depreciation run a fourth outcome the serving belt counted
as a POST and re-drove up to 24 times per client. Nothing in wave 4 has that shape.

### 3.4 The write-quiet obligations, which is what the machine stop still buys

- **0296** recuts ONE live body, `clara._enqueue_invoice_facts_core`, and states every other
  document kind's path through it is byte-identical to its pre-image.
- **0297** `create or replace`s exactly one live body, `clara.persist_payroll_facts`, and splices one
  reader. Its own note: *"PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it
  STARTED with, so a payroll persist spanning this migration settles the read WITHOUT posting"*.
  Honest, reported by the derived Needs-you row, nothing half-posted. **This is the sentence that
  makes the stop worth taking.**
- **0299** recuts five router-side bodies under the same promise.

### 3.5 What the OLD web does between the migrate and the promotion

Checked against `46cf7c85`, not assumed:

- `clara.list_review_queue` goes from ten row kinds to sixteen. The serving
  `apps/web/lib/firm/needs-you.ts` knows ten, and `components/firm/needs-you-row.tsx:96-98` routes an
  unknown kind through `t("rowKind.unknown", { kind })`, which `messages/en.json` renders as
  **`Unrecognized item (payroll_posting_blocked)`**. Visible, honest, no affordance, no crash.
- `clara.create_client(text,text)` loses its human EXECUTE (0316). `git grep create_client 46cf7c85
  -- apps/web packages/runtime` returns **nothing**. No serving caller; the revoke breaks nothing.
- `my_sme_starter` v1 is retired and v2 published (0295). The serving `lib/onboarding/coa.ts` filters
  on `state='published'`, so the picker starts offering the 146-account v2. Intended behaviour, one
  promotion early, and the reason 0295 retires v1 at all.
- Payload additions the old web absorbs: `side` (0304), the `term_source` / `stated_term_id` family
  (0305), the supersession columns (0317), the dynamic `required` on the firm-setup `tin` item
  (0311).

### 3.6 So web goes last

Of the 27 doors this wave grants, every browser-facing one has its consumer in the SAME cut: the
payroll settlement pair (0298), ten tenancy and contract-term doors (0300), two staff-claim reads
(0301), `skip_plan_occurrence` (0302), three revenue-recognition reads (0308). A door that is not
there is 42883 to a direct call and `PGRST202` through PostgREST, so the consumer must never precede
it.

### 3.7 The locks and the timeouts

Parsed from the executed statements, not transcribed. The relations the wave locks:
`accounting_plans`, `accrual_adjustments`, `coa_templates` and its three child tiers,
`document_capabilities`, `document_extractions`, `document_processing_tasks`, `entry_post_receipts`,
`firm_setup_keys`, `journal_entries`, `prepayment_schedules`.

| arms | files |
|---|---|
| `statement_timeout='5min'` AND `lock_timeout` | 0296, 0297, 0299 (`5s`); 0309 (`15s`) |
| `lock_timeout='5s'` alone | 0302, 0303, 0304 |
| `statement_timeout='5min'` alone | 0311 |
| NEITHER | 0295, 0298, 0300, 0301, 0305, 0306, 0307, 0308, 0310, 0315, 0316, 0317, 0318 |

The unguarded files that take a heavy lock on an EXISTING populated relation are **0305, 0308 and
0317**. A block there waits indefinitely, and step 6b's `pg_locks` read is the only guard.

The single largest cost in the run is not a lock at all: **0296 and 0299 each rewrite all 240
`clara.document_capabilities` rows**, and every row fires the monotonicity, high-water,
high-water-record and uniformity triggers. **1,920 trigger firings.** The count is measured; the wall
clock is not.

---

## 4. Every data-dependent branch, and how the preflight decides it

Sixteen hand checks, each with its expected value PARSED from the file that owns it. Four of them
read state an EARLIER file of the same run creates; those are marked `chained`, printed for their
facts, and never counted.

| id | phase | migration | what decides it | how the preflight reads it |
|---|---|---|---|---|
| `D-CHART-V1` | pre | 0295 | the whole pre-step: mint v2 (42/146), RETIRE v1 | v1 present and `published` at 42/142; the **collation-independent structural digest** re-measured by parsing the file's own `pg_temp` helper body and running it as a SELECT; the stored `content_sha256` reproducing from v1's own rows on THIS server; none of `1180/2030/2040/2050` on v1; v2 ABSENT; exactly 2 society entity-override rows |
| `D-CHART-ADOPTIONS` | pre | 0295 | the retirement's blast radius | adoptions of v1 by state, any `proposed` row anywhere, forks off v1, and the platform-row census. Facts, never a refusal |
| `D-CHART-FREEZE` | pre | 0295 | its redo branch disarms three triggers | all three `tgenabled='O'` before the window |
| `D-REGISTRY-W4` | pre | 0296, 0299 | the registry is re-derived twice | ONE distinct version, value 4; 240 rows; exactly 6 `payroll_summary` pdf/image pairs; the `agreement_contract` pair count; 0 disagreeing high-water marks |
| `D-LANE-ROSTER` | pre | 0296, 0299 | the lane roster CHECK gains two literals | the LIVE definition must admit neither, plus both relations' row counts |
| `D-ROLE-PAIR` | pre | 0309 | its four objects must be all-absent or all-present | the role pair, the door and the attempts relation all absent; the cluster `clara%` census RECORDED, never pinned |
| `D-CHAIN-ROLES` | pre | 0309 | it names 18 chain-minted roles | all 18 present |
| `D-FIRM-SETUP` | pre | 0311 | a one-cell backfill behind a disabled trigger | 15 rows; the twelve-row digest; the trigger ENABLED; the `tin` row's shape and its pinned `user_note` |
| `D-ACCRUAL-SIDE` | pre | 0304 | `add column side text not null default 'expense'` | the column ABSENT, plus the relation's rows and size. Every existing row gets the DEFAULT, not NULL |
| `D-REVOKED-DOORS` | pre | 0316 | the revoke must not already be a no-op | the grant still HELD, PUBLIC holding none |
| `D-DROP-_prepayment_plan_core_wake` | chained | 0315 | `drop function IF EXISTS` | the file's own header says the body was never created on a fresh chain, so its absence is lawful |
| `D-DROP-_knowledge_assert_fye_pair` | chained | 0318 | drops the 3-arg form | 0310 mints it earlier in the same run |
| `D-CHART-CONSUMERS` | chained | 0297, 0300 | their tails demand one published row at `2040` and `2050` | 0295 mints both on v2 earlier in the same run; before the window the published starter carries neither |
| `D-RECEIPT-LANE` | pre | 0297, 0299 | two widening swaps | the LIVE definition text, the row count, the census by `via_wake_kind` |
| `D-EVALUATORS` | pre | 0296, 0299 | two frozen evaluators registered append-only | neither name already present |
| `D-KNOWLEDGE-KEYS` | pre | 0300, 0310, 0311, 0318 | five catalogue keys their predicates name | all five present |

### 4.1 The three things that made this wave's preflight different from wave 3's

**Body pins became a first-class read.** Wave 3 had a handful and let the fingerprint cover them.
Wave 4 carries **189 (file, signature) pins** in four spellings. Section 1 parses all four; section
5b re-measures each on the target.

**Two of the pins are the INTEGRATION's own cross-lane repair, and the parser had to learn a fifth
spelling to read them.** Lane 04 measured its pins on a rig carrying no lane 01 and no lane 03, so
0307/0308 pinned `clara.create_accounting_plan` to a body 0300 had already moved, and 0308 pinned
`clara._plan_admit_occurrence` to a body 0303 had already recut. Left alone, 0308 would have pasted
a body derived from the pre-sibling text and silently dropped the sibling lane's arm. The
integration admits each at EITHER value and derives its paste from the sibling's post-image. It
records that as a disjunctive `or (<roster>[i][1] = '<sig>' and v_sha = '<sha>')` beside the array
rather than as a third array element, which my first parser did not read: it reported one admitted
value where the file admits two. Both are CHAIN-INTERNAL so no verdict moved, but the printed
ledger was wrong as evidence. Fixed, and the plan output now shows both values on both entries.

**53 of those 189 are CHAIN-INTERNAL and cannot be measured before the window.** The lanes recut
each other on purpose: 0299 pins `_assert_field_path` to the body 0296 produces, 0298 pins
`_post_payroll_run` to 0297's, 0300 pins three bodies to 0299's, 0318 pins the knowledge family to
0310's, 0304 pins the accrual family to 0303's, 0317 pins the prepayment and revenue cores to
0305/0306/0307/0308/0315's, and six files splice `clara.list_review_queue` one after another.
Measuring those against hosted would compare the pre-wave body against a post-0296 expectation and
invent a STOP. The classification is PARSED: a file produces a body when it `create or replace`s it,
or when it splices it by reading its own `prosrc` into a variable and re-executing. **136 measurable,
53 chained.**

**An added column may carry a DEFAULT, and then the CHECK on it is not vacuous.** 0304 adds
`side text not null default 'expense'` and constrains `side in ('expense','revenue')`; 0305 adds
`term_source text not null default 'document_service_period'` and constrains a four-column carrier
rule over it. Postgres fills the DEFAULT into every existing row as part of the ADD. Wave 3's reader
would have assumed NULL and passed vacuously. The wave-4 reader substitutes EVERY column the wave
adds to that relation (its default, or `null`) and runs the predicate as an ordinary row read; the
same substitution makes 0317's `uq_prepayment_schedules_source_live` a real duplicate census rather
than a skipped one.

### 4.2 The collation question, which is this wave's own

0295 does **not** pin v1's stored `content_sha256`, because that value moves with `lc_collate`:
`en_US.UTF-8` servers (GitHub Actions run 35954298990, and hosted Supabase) read `673ede91…` where
every `C.UTF-8` rig reads `d02a786a…`. The cause is `clara._coa_template_content_sha256` ordering by
`family_key` without a collation, and v1's 42 keys contain exactly one pair that separates
(`tax_liabilities` / `taxation`). What 0295 pins instead is a STRUCTURAL digest: 0150's canonical
form with `collate "C"` on both ORDER BYs, identical on every server by construction. The preflight
parses that helper's body out of the file and runs it as a plain SELECT, and separately proves the
stored digest reproduces from v1's own rows on the server under test. **Both halves were exercised
on both collations.**

---

## 5. The dry runs

Migrations directory `clara-wt/int2` at `fb1dae78a`, the final integration head. No database was created, altered or dropped:
every negative control acts on a COPY of the migrations directory or a COPY of the exported
fingerprint.

**`clara_w4_hosted` (rigw4h, 127.0.0.1:55701, 288 / 0293, `C.UTF-8`, seeded, v1 published with its
two society overrides and one client adopted):** `--baseline` against a fingerprint exported from
itself, **verdict CLEAN, exit 0** — 10976 keys compared and equal, 0 env, 136 of 136 measurable body
pins at an admitted value, all 16 hand checks ok, 0 PARSE GAP, quiescence clean.

**`clara_w4_coll` (rigw4c, 127.0.0.1:55702, same frontier, `en_US.UTF-8`) against the `C.UTF-8`
baseline:** **verdict CLEAN, exit 0** — 10976 keys compared and equal, 0 env, no false STOP. The
chart check printed the structural digest MATCHING the pin on both databases while the stored digest
read `d02a786a…` on one and `673ede91…` on the other, which is exactly the separation 0295 was
rewritten to make.

**Offline `--plan`:** 21 pending, 309 files, 8 new relations, 20 CHECK reads (15 of them swaps), 4 FK
reads, 9 ADD COLUMN reads, 20 index reads, 10 UPDATE reads, 4 DELETE reads, 1 withdrawn grant, 2
drops, 189 pins, 16 hand checks, **0 GAP**, exit 0.

**Fifteen negative controls**, each proving a check family STOPs. The full table is in
`ceremony-w4/README.md`. Two are worth naming here:

- **Control 13 found a real defect in my own script.** Corrupting a baseline value on a PINNED
  object came back CLEAN. Wave 3's prestate detector takes the first DDL statement as the end of a
  file's prestate, and 0295 opens with a `create function pg_temp.p295_struct_sha256(…)` helper, so
  the detector truncated 0295's prestate to nothing and saw none of its three pins. Fixed two ways,
  both principled: the PARSED pin ledger is now the primary source of "which objects are pinned",
  and the prestate boundary skips a file's own `pg_temp` and `create temp table` scratch.
- **Control 12** is `--post` against `clara_w4int` on `rigw4` (55700), which is at 303 / the
  PRE-renumber `0317` and predates lane 04. It STOPs with `the ledger reads 288 + 21 = 309 at 0318`
  plus a missing-row STOP per absent file, which is both the right answer and the proof that that
  database is stale by construction and must not be used as the `--post` baseline.

Four further parser defects were found by the dry runs and fixed, each recorded in the script's own
comments beside the fix: an `alter table` / `add constraint` bridge that crossed a `;` and named the
wrong relation for 0317's four guarded FKs; a pin window that swallowed the following roster's shas
and silently widened a scalar pin (0296 and 0297); a statement terminator that stopped at a semicolon
inside 0299's prose `basis` literal and so reported a predicated registry rewrite as unconditional;
and a `where` detector that matched the word "Where" inside that same literal.

---

## 6. Anything unverified

- **Everything hosted.** No hosted access by instruction. The frontier, the registry counts, the
  chart adoption census, the role census, the `accrual_adjustments` row count, the machine and web
  ids are from `RELEASE-W3-RUNBOOK.md` § RESULTS, the migration files and the rig.
- **The head IS final** (`fb1dae78a`, all seven lanes merged), so the 21-file list, the `309`
  total, the `0318` tip, the 189/136/53 pin split and both dry-run verdicts are final too. They
  were re-derived at four successive heads and did not change.
- **The `agreementFacts` registry-roster defect is CLOSED** on the final head
  (`registry-view.test.mjs` 7/7, 57 bodies, 14 pins). Gate 0a keeps the check against a regression.
- **No upgrade replay was run.** Section 0 of the runbook lists what is owed rather than recording
  what was done: clone `clara_w4_hosted`, apply the 21, time it, export both fingerprints, and
  repeat on `clara_w4_coll` because hosted's collation is the one the rig does not have. That proof
  belongs to the gate worker.
- **The `--post` mode has not been exercised against a REAL upgraded baseline.** Gate A owns that.
  Its only exercise here was negative control 12, against a stale chain, where it STOPPed correctly.
  **When gate A runs it, pass `--frontier-before 0293_fa_arrears_judgement_scope`**: it always wins
  over the state file and is what lets the `288 + 21 = 309` arithmetic be re-derived on a machine
  that did not take the pre-window reading. The pre-window state file this task wrote is at
  `scratchpad/w4/reads-w4.state.json`.
- **The populated-row behaviour of the fifteen constraint swaps and of 0304's backfill is unproven
  at any scale.** On the rig, `document_processing_tasks`, `document_extractions`,
  `entry_post_receipts`, `accrual_adjustments` and `prepayment_schedules` all hold ZERO rows, so
  every "would this pass" read was trivially clean. The one negative control that needed real rows
  was run against `clara.document_capabilities` (240 rows) instead.
- **The duration of the two registry raises is unknown.** 1,920 trigger firings is a count, not a
  measurement of time.
- **PostgREST's schema-cache behaviour** after six `list_review_queue` splices and two registry
  rewrites is unverified from here.
- **The #871 credential ceremony has never been run against hosted.** Its two verification reads and
  its smoke were measured on the lane rig only, and 0309's §D platform probes (`anon`,
  `authenticated`, `service_role`, `authenticator`) are inert on a rig and have never been seen to
  fire.
- **Whether Supabase PITR is enabled**, asked in the 2026-09-14 runbook, still unanswered.
- **The signed-in walks of waves 2 and 3 were never done** and are still owed, now against a 0318
  database.
