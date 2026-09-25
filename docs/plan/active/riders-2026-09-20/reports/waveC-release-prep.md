# Cut phase, release preparation: the preflight, the runbook, the deploy order and the closures

Written 2026-09-25 by the release-preparation worker, who has **no hosted access** and did not use
any. Nothing was pushed, no PR was opened, no GitHub object was written (issues were READ with
`gh`), nothing was committed, no lane worktree was touched, no `fly` command was run and no port in
55741 to 55749 was opened. Every database action was a read inside `begin transaction read only`;
no database was created, altered or dropped.

**What was produced**

| path | what |
|---|---|
| `docs/plan/active/riders-2026-09-20/ceremony-wC/reads-wC.mjs` | the cut's read-only hosted preflight, derived from `ceremony-w4/reads-w4.mjs` |
| `docs/plan/active/riders-2026-09-20/ceremony-wC/README.md` | its design, its six differences from wave 4's, and the dry-run and negative-control tables |
| `docs/plan/active/riders-2026-09-20/RELEASE-WC-RUNBOOK.md` | the ceremony, wave 4's step order adapted for a version cut per `CUT-PLAN.md` §2.9 |
| `reports/waveC-release-prep.md` | this file |
| `scratchpad/release-wC/closures/` | five closure drafts, an `INDEX.md` and a `post.cjs`, in the wave-4 shape |

---

## 1 · What was read

The main checkout's `RELEASE-W4-RUNBOOK.md` in full, including its `§ RESULTS` and its signed-in
walk; `ceremony-w4/reads-w4.mjs` (2,459 lines) and its README; `CUT-PLAN.md` §§2.1-2.9, 4.3-4.8 and
5-6; `reports/waveC-merge.md`; the five lane reports (`waveC-lane01-ticket985.md`, `-ticket1000.md`,
`-ticket1030.md`, `-ticket1135.md`, `waveC-lane02-ticket1037.md`), both lanes' spec, standards and
adversarial reviews, `waveC-lane01-fix.md`, `waveC-lane02-fix.md`, `-fix-2.md` and the three
rechecks. In `C:\Users\zhant\Desktop\clara-wt\int2` at `integration/riders-cut` **`34b125e6f`**: all
three migrations in full, `packages/runtime/workflows/registry.ts`, `frozen-workflows.json`,
`packages/runtime/plugins/startWorld.ts`, `scripts/check-frozen-workflows.mjs`,
`packages/runtime/scripts/rollback-preflight.mjs` and `packages/runtime/lib/rollback-preflight.mjs`,
`packages/runtime/lib/runtime-contracts.mjs`, `packages/runtime/workflows/claraWork.v6.impl.ts` and
the runtime README's 2026-09-25 cut section. Wave 4's closure folder (`close-1035.md`, `INDEX.md`,
`post.cjs`) for the closure shape. The five tickets and #1136/#1137 were read with `gh issue view`.

**The head is `34b125e6f`, not `e871c59da`.** `reports/waveC-merge.md` says "Head verified:
`e871c59da`" and then explains that the report itself is the one commit on top of it. The worktree
confirms `34b125e6f docs: the cut phase's integration merge report`, with `e871c59da` beneath it.
Both statements are true and the runbook uses `34b125e6f`.

---

## 2 · The deploy order, with evidence per migration and for the image

**ORDER: database first, all three files in one run, then the runtime image by digest, then the web
promotion. The machine IS stopped before the migrate and started again only on the new image.**

### The forcing statement is in the runtime, not in a migration, and a grep of the three files misses it

`grep -niE 'deploy order|write-quiet|quiesce'` over `0320`, `0321` and `0323` returns hits in
**exactly one** file. 0323 says:

> "HARMLESS WITHOUT THE RUNTIME. The old doors keep answering exactly what they answered, so an
> image deployed before this file behaves as it does today; the five-argument twin is reached only
> by `chatTurn_v22`. The reverse is NOT true: deploy this file before the image."

0320 and 0321 carry no deploy-order header, and under `ARCHITECTURE.md` §5.F that silence is
readable. **But 0321's obligation is written in `claraWork_v6`'s own source**, and it is the
strongest of the three:

> "THE DEPLOY ORDER FOLLOWS FROM THAT, in one direction: migration 0321 must be LIVE BEFORE this
> image runs any Work. Against a database without it every Work settles `failed`/`internal` with
> nothing posted - loud, contained, and the correct failure for a deploy-order mistake, exactly as
> v5's own 0230 stanza reasons. The REVERSE order is free: 0321 against a v5 image adds doors that
> nothing calls."
> - `packages/runtime/workflows/claraWork.v6.impl.ts:1092-1096`, `loadSourceCorrectionBriefStepV6`

That step is asked ONCE, before the loop, for EVERY Work, and its docblock says it deliberately does
not swallow its own failure. `packages/runtime/README.md:45-48` repeats it in the pin section, and
`:53-55` carries the asymmetry that makes it matter: on the chat lane a missing function is a typed
refusal and the turn survives; on the Work lane it is TERMINAL.

| file | consumer in this image | order | evidence |
|---|---|---|---|
| 0320 | `read_client_financial_pack` (`chatTurn_v22`) calling `clara.wake_get_client_financial_pack` | database first, non-optional in practice | `waveC-lane01-ticket1000.md` § Anything unverified: "0320 before the image, or the tool answers `42883` as an internal fault on every call" |
| 0321 | `claraWork_v6`'s own body plus `lib/reconciler-work-source-correction.mjs` | database first, **FORCED** | `claraWork.v6.impl.ts:1092-1096`; every Work settles `failed`/`internal` without it |
| 0323 | `chatTurn_v22`'s duplicate probe, the five-argument twin | database first | the file's own header |
| the IMAGE | - | after all three | the three rows above. The reverse direction is free for every one of them: the old image calls none of the new doors |

### What the old image and the old web do between the migrate and their replacement, checked

- `claraWork_v5` calls none of 0321's six new doors; they are new names. The belt that would use
  them ships in the same image as v6, so a 0321 database under a v5 image "adds doors that nothing
  calls".
- `chatTurn_v21` calls the four-argument probe, which 0323 leaves BYTE-UNTOUCHED and re-measures in
  its own §TAIL (T1) along with the three-argument core.
- `clara.get_client_financial_pack` is recut and the serving web calls it. Signature, defaults,
  return type, envelope, every coverage word and every refusal code are unchanged; the VIEWER floor
  moves from an inline copy to `clara._human_ctx`, which raises the SAME three CLR04s; and §TAIL (3)
  REVERSES the three anchored edits on the live body and requires the result to hash to 0232's
  pinned pre-image, so "no figure moved" is a checked fact about the live catalog.
- `clara.revise_document_fact` is recut and the serving web calls it. The change is ONE
  substitution, the typed no-op guard. The new behaviour arrives one promotion early and is strictly
  safer than the old. `apps/web/lib/documents/doors.ts` gained a comment only.
- `clara._question_source_corrected` is recut with the same one substitution and is read through
  `clara.list_review_queue`, whose roster does not move.
- No PostgREST schema-cache question arises: no relation, no column, no new `list_review_queue` row
  kind. The two new granted doors belong to `clara_agent_ro` and `clara_runtime`, which PostgREST
  never reaches.

### The machine stop, and the honest limit of what it buys

The VERSION CUT does not need it: policy (c) keeps every superseded body exported, the new image
carries all sixty, and the boot census reads zero. The MIGRATIONS need it, for two reasons:

1. `packages/db/README.md`'s rule for recutting an active writer body. 0321 recuts
   `clara.revise_document_fact`, which writes an extraction, a region, a revision row and retires
   Work. An in-flight PL/pgSQL call completes on the body it started with, so a correction spanning
   the migration settles under a rule the estate has already replaced.
2. **0323's §TAIL (T4) evaluates a data-dependent vacuity control across two statements in READ
   COMMITTED, on live tables.** It SELECTs an invoice and then probes with that invoice's own
   particulars; each statement takes its own snapshot. A concurrent reversal, cancellation or
   recording between them can make the unnarrowed core stop matching, and the tail then refuses a
   migration that is otherwise correct. This is the only genuinely new lock-shaped hazard in the cut
   and it is the sharper of the two reasons.

**What the stop does NOT buy, and the runbook says so:** it quiesces the runtime's writers, not the
browser's. `clara.revise_document_fact` and the trade-invoice recording path are both reachable
through PostgREST, which the Fly machine's state does not touch. In beta the only browser session is
the owner's, so the operative instruction is the one every prior window used, and step 6b's
`pg_locks` read is what makes it real rather than nominal.

**There is no lock-contention branch in this cut.** No `ALTER TABLE`, no `CREATE INDEX`, no
`SET NOT NULL`, no `VALIDATE`, no top-level `UPDATE` or `DELETE`, no new relation, no new column, no
new role. That is parsed rather than claimed: the preflight's six generated-read sections all print
empty and the quiescence watch list is the single relation the cut writes to
(`clara.wake_fn_allowlist`, one row, `on conflict do nothing`). 0320 and 0321 arm a precautionary
`statement_timeout = '20min'`; 0323 arms nothing; no file arms a `lock_timeout` and none needs one.

---

## 3 · The branches, and how the preflight decides them

Nine hand checks, each with its expected value parsed from the file that owns it. Two of them carry
the step's real content.

**D-TAIL-REACH is the one check no rig can answer, and the most load-bearing unknown in the cut.**
All three files `set role clara_fn_owner`, create their objects, `reset role`, and then run a §TAIL
that CALLS bodies owned by `clara_fn_owner` and granted to nobody: 0321 drives
`clara._fact_value_changed(jsonb,jsonb,text)` fifteen times plus `clara._fact_calendar_day(text)`
and `clara._source_correction_rederivation_brief(text)`; 0323 drives
`clara._trade_invoice_probe_core`; 0320 additionally does `set_config('role','clara_agent_ro',true)`
inside a subtransaction. **On every rig the migration runs as a superuser, which bypasses the ACL**,
so no rig run of these files has ever exercised the privilege path. The check reads `current_user`,
`rolsuper`, `pg_has_role(current_user,'clara_fn_owner','MEMBER')` and `'USAGE'`, and
`pg_has_role(current_user,'clara_agent_ro','MEMBER')`. If hosted's migrating role is not a superuser
and does not INHERIT `clara_fn_owner`, the tail raises 42501 and the file rolls back whole.

**D-PROBE-DRIVEN is the branch a hosted-shaped rig structurally cannot reach.** 0323's §TAIL (T4)
does not assert its narrowing, it DRIVES it: it SELECTs a trade invoice under a keyed,
still-postable Work with a reference and no reversed entry, copies that invoice's particulars, and
probes twice. Its FIRST assertion is a vacuity control that raises CLR10 if the UNNARROWED core does
not match the invoice its own particulars were built from. The preflight extracts the file's own
selector (never retyped) and, where it picks a row, runs the vacuity control read-only. Every
hosted-shaped rig here holds zero such rows; `clara_cutint` holds 53, and the positive arm was driven
there.

The other seven: **D-CUT-PREMISE** (the 14 objects the three §0.1 blocks require to be present),
**D-CUT-NEWBORN** (the 10 signatures this cut creates must all be absent, or a file takes its REDO
branch or refuses a partial birth), **D-PACK-ALLOWLIST** (zero rows today for the one row 0320
writes, or its §TAIL counts somebody else's), **D-PACK-POSTURE** (0320 §TAIL (7)'s negative census
over every `clara%` role, printed rather than counted, because hosted carries more roles than a rig
and the check is a negative one), **D-REVISE-GRANT** (the correcting door's `clara_authenticated`
aclitem, which `create or replace` preserves and §TAIL (T6) requires), **D-REDERIVE-BACKLOG**
(§TAIL (T9)'s first-apply wall at zero settlement receipts, plus the `source_corrected:%` backlog as
the first sweep's workload), and **D-PROBE-ARITY** (exactly one overload of the probe twin today,
carrying no default).

**Two branches the preflight decides that wave 4's did not have to.** The version-cut reads answer
"which bodies are live runs parked on" using the runtime's own derivation and its own non-terminal
set, compute the boot census against the bodies RELEASE_SHA's registry exports, and require zero
runs on the three successor bodies before the window. And the successor set itself is DERIVED rather
than eyeballed: the intersection of "a class with a predecessor, pinned at its newest" and "a body
whose module is still unlocked in `frozen-workflows.json`". That yields exactly `chatTurn_v22`,
`claraWork_v6`, `statementFacts_v4` - `payrollFacts_v1` and `agreementFacts_v1` are unlocked but have
no predecessor, and `documentIngest_v2`, `witnessFacts_v3`, `autoDraft_v10`, `firmInterview_v3` and
`clientOnboarding_v5` have a predecessor but are already deploy-locked.

---

## 4 · The dry-run verdicts

Migrations directory and `CLARA_REPO`: `clara-wt/int2` at `34b125e6f`. Every negative control acted
on a COPY of the migrations directory or a COPY of an exported fingerprint.

| run | target | verdict |
|---|---|---|
| `--plan` | no database | **exit 0, 0 GAP.** 3 pending, 312 files, 40 pins (40 measurable / 0 chained), 9 hand checks, and **zero** generated reads in all six DDL families |
| pre-window + `--baseline fp-wC-hosted.json` | `clara_rt_test` (rigw4h 55701, 309 / 0318, `C.UTF-8`) | **13 ok, 3 STOP.** 11346 keys compared, **11346 equal, 0 env**; **40 of 40** pins admitted; all nine hand checks ok. The three STOPs are the version-cut run census and the two checks derived from it |
| `--post` + `--baseline fp-wC-upg.json` | `clara_w4_hosted` (rigw4h 55701, 312 / 0323, `C.UTF-8`) | ledger **309 + 3 = 312 at 0323**, three rows at their file checksums, drift 312/312, fingerprint **11356 keys, 11356 equal, 0 env**, every (f) read answered. Same run-census STOPs |
| `--post` + the SAME `C.UTF-8` baseline | `clara_w4_coll` (rigw4c 55702, 312 / 0323, `en_US.UTF-8`) | identical: **11356 keys, 11356 equal, 0 env** |

**The PRE reading was not taken on `clara_w4_hosted` itself.** By the time the script existed the
gate worker had already upgraded that database to 312. Its own pre-window export,
`scratchpad/wC/fp-wC-hosted.json` (309 / 0318, 11346 keys), is the baseline used above, and
`clara_rt_test`, still at 309 / 0318, is the target the pre-window mode was dry run against. Said
here because the work order asked for it either way.

**That baseline came from `clara_w4_coll` on rigw4c, at `en_US.UTF-8`** (`waveC-gates.md` §2.5),
not from `clara_w4_hosted`, so the pre-window run is a cross-collation comparison: 11346 keys
compared, 11346 equal, 0 env. This cut pins no content digest and collation was expected to be
irrelevant by construction; it is now measured in both directions rather than argued.

**The three STOPs in every rig run are structural to a rig and are a defect this preparation
found.** No rig database on this host carries a bootstrapped WDK World, so `workflow.workflow_runs`
answers `42P01`. On the first dry run the two derived checks reported `ok` for zero rows, which is
"I could not look" wearing "I refuse"'s clothes - the distinction `rollback-preflight.mjs` keeps
exit 2 and exit 1 apart for. The census now fails closed and the derived checks print
`NOT COMPUTED`.

### Negative controls

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | an applied file deleted from a COPY of the directory | 3 STOPs, incl. `309 applied vs 308 file(s)` and `DRIFT 0100_… applied but ABSENT` |
| 3 | one applied file's bytes changed in a COPY (`0268`) | drift gate STOP, naming the file |
| 4 | a measurable pin's literal corrupted in a COPY (0320's `clara.wake_context()`) | `STOP PIN`, both sides, **39 of 40** |
| 5 | a baseline value corrupted on a PINNED object | `STOP DRIFT (PINNED by 0320_client_financial_pack_wake_read)` |
| 6 | a baseline value corrupted on an UNNAMED object | `STOP DRIFT` |
| 7 | a baseline value corrupted on an object named ONLY inside 0320's carried body (`rel:cash_account_set_versions:meta`) | `STOP DRIFT` |
| 8 | the SAME corrupted baseline, same key, through **wave 4's** `reads-w4.mjs` | `ok TOLERATED` - the measurement that makes the `execOf` narrowing a finding rather than a preference |
| 9 | `--post` against a stale chain (309) | STOPs on the arithmetic, on three `no ledger row` lines, and on `STOP DRIFT (PINNED by 0320) fn:clara._client_financial_pack_core` |
| 10 | the pre-window mode against a chain ALREADY at 312 (`clara_cutint`) | 9 STOPs: the arithmetic, `D-CUT-NEWBORN` naming all ten, `D-PACK-ALLOWLIST`, `D-REDERIVE-BACKLOG`, `D-PROBE-ARITY`, and the pin ledger at **37 of 40** with the three failures being exactly the three recut bodies |
| 11 | `CLARA_REPO` pointed at the MAIN checkout | `bodies=57 … chatTurn_v21 claraWork_v5 statementFacts_v3`, `322 entries, 10 UNLOCKED`, `SUCCESSOR BODIES … (none)` |
| 12 | `CLARA_REPO` with no `registry.ts` | the plan says so; against a database it is a GAP and therefore a STOP |
| 13 | a database with no WDK World | the run census STOPs and the derived checks print `NOT COMPUTED` |

Control 10 is the richest: it is the only run that exercised **D-PROBE-DRIVEN's positive arm**.
`clara_cutint` holds 53 trade invoices under a keyed Work; the file's own selector picked
`488a8583-6ec7-43f7-887f-6ff8f6eb8f5f`, the unnarrowed core MATCHED it, the vacuity control held,
`match_count 1`.

---

## 4a · What the gate worker's report changed in this preparation

`reports/waveC-gates.md` landed while this was being written and closes four things this draft had
listed as owed, corrects one thing it had wrong, and confirms one prediction as a measurement.

- **Corrected**: the PRE baseline came from `clara_w4_coll` at `en_US.UTF-8`, not from
  `clara_w4_hosted`. Both documents now say so, and the cross-collation reading is recorded.
- **Closed**: the upgrade replay was run and TIMED (6 s on 55701, 1 s on 55702, `3 new migration(s)
  applied · 312 total` both times); the two-build cutover drill was run on a fresh cluster and
  passed with **three** legs including a `statementFacts` v3 to v4 leg, which lane C2 had priced as
  new work; both data-dependent branches were ENTERED for real by planting through the doors, with
  0323's §TAIL running its whole driven block; and the web `next build` is green on this head once
  the two `NEXT_PUBLIC_SUPABASE_*` lines are supplied.
- **Confirmed as a measurement**: the rollback preflight was driven FOUR ways at frontier 0323, and
  reading C is the cut's verdict. With a non-terminal run on each of v22, v6 and v4 the main-shaped
  previous image is **REFUSED (unsupported_body)** with one line per body; with runs on v21, v5 and
  v3 it is ALLOWED; and **in all four readings the frontier rules were satisfied by both targets**,
  so the refusal is the body census alone. The runbook's step 9 now carries that table instead of a
  prediction.
- **The gate's own finding F1 is this deliverable.** It says the cut has no preflight of its own and
  that `reads-w4.mjs` would print a clean fingerprint while checking none of the three files'
  preconditions, and it names the release-prep worker as the owner. `ceremony-wC/reads-wC.mjs` is
  that script.
- **F2 is carried into the runbook.** The drill's own output never prints the stranded census, so
  step 7's boot line is where that number becomes readable, and the runbook now says so.

---

## 5 · Findings handed up, beyond the runbook

1. **Wave 4's `--lock-deployed` was reported as having "nothing further to do", and that reading was
   wrong.** Its § RESULTS says so; `origin/main`'s `frozen-workflows.json` still carries the ten
   `payrollFacts.v1.*` / `agreementFacts.v1.*` entries at `deployed: false`, measured today. They
   have been serving since 2026-09-24. **Step 11a of this release therefore locks 35 entries, not
   25**, and that is correct rather than a mistake. The runbook says so, with the arithmetic, and
   names how the manifest commit reaches `main`: a docs-and-manifest commit on a branch off
   RELEASE_SHA, opened as the NEXT pull request after the release, never amended onto the release PR
   and never committed before step 7.
2. **Step 9 should now turn on gate (c) rather than gate (b).** Wave 4's preflight refused globally
   with `frontier_requires_contract`, because `refresh-46cf7c85` declared no door contracts. This
   cut's previous image is `refresh-6da02a8d`, built from the release that SHIPPED the mechanism:
   `lib/runtime-contracts.mjs` on `origin/main` declares both `intake_refusal_record_v1` and
   `fa_parked_run_v1`, and `FRONTIER_RULES` (`lib/rollback-preflight.mjs:138-179`) is unchanged by
   both lanes. So gates (a) and (b) should pass and the stranded-body census becomes the deciding
   gate for the first time in this programme.
3. **A rollback to v5 is not free even with a clean census, and the preflight cannot see why.**
   `packages/runtime/README.md`'s v6 section: a successor the re-derivation belt admits would run
   under a v5 image WITHOUT the confirmation, and could post a re-derived basis nobody was shown.
   That is a door-contract question of exactly the class #1035 generalised. The runbook says to add
   it to #1035 as a third rule candidate rather than open a second ticket, the way wave 4 added its
   own finding there.
4. **Two rulings the cut asked for are still open and belong to gate 0a, not to the window**
   (`waveC-lane01-fix.md` §10, carried by `waveC-merge.md` §7): 0320's SECURITY INVOKER to DEFINER
   posture (C1-SPEC-01), and accepting AC3's Work-walk clause plus AC1's A5, A8 and A9 as PARTIAL
   (C1-SPEC-02, -03, -06, -07) with `CUT-PLAN.md` §2.4 beating AC2's `--lock-deployed` wording
   (C1-SPEC-08). The closure drafts are written on the assumption that both are accepted; if the
   first is refused, #1000 is deferred and the branch is re-cut, which is not a runbook decision.
5. **Blueprint pin drift, unchanged and now three cuts old.** `docs/ARCHITECTURE.md:171`, `:183`,
   `:207`, `:445` say "chatTurn -> chatTurn_v19, claraWork -> claraWork_v3". After this release they
   will be three versions out on one class and three on another. Per `AGENTS.md` rule 4 a blueprint
   edit belongs to a wayfinder session; every lane report in this cut records it and hands it up,
   and so does this one.
6. **The two-build cutover drill was not run by the merger** (`waveC-merge.md` §7.3) and is the
   closest thing this programme has to a rehearsal of the cutover itself, with legs for exactly
   `claraWork` v5 -> v6 and `chatTurn` v21 -> v22. Lane C2's recheck 2 left a live warning with it:
   its own recipe for quiescing the drill's database under-states what a heavily-seeded clone needs.

---

## 6 · Anything unverified

- **Everything hosted.** No hosted read, no `fly` call, no deploy. Every number in the runbook that
  is not a rig reading is an expectation carried from `RELEASE-W4-RUNBOOK.md` § RESULTS or parsed
  from the tree.
- **`D-TAIL-REACH` in the negative direction.** Every rig here migrates as a superuser, so the check
  has only ever returned `superuser=true`. Whether hosted's migrating role inherits `clara_fn_owner`
  and can `SET ROLE` to `clara_agent_ro` is unread until step 3.
- **The version-cut run census on any rig.** `workflow.workflow_runs` is absent on all four rig
  databases here, so section (v)'s first three lines have never returned a row. The SQL mirrors
  `lib/rollback-preflight.mjs`'s own (same table, same `TERMINAL_RUN_STATUSES`, same
  `bodyIdentifierOf` derivation) but is not imported from it, and its shape is unexercised.
- **`D-PROBE-DRIVEN`'s failing arm.** The positive arm was driven twice, read-only here and for real
  in the gate worker's migrate. A row for which the unnarrowed core does NOT match cannot be
  constructed read-only, so only the refusal path is reasoned.
- **The `--post` baseline.** `scratchpad/wC/fp-wC-upg.json` is the gate worker's. This worker did not
  produce it and verified only its ledger line (312 / 0323) and its key count.
- **The web `next build` WITH THE DEPLOY ENVIRONMENT.** The gate worker built it green on this head
  with its own two `NEXT_PUBLIC_SUPABASE_*` lines; step 5 is still the first build with the deploy
  environment's values.
- **`reads-wC.mjs` inherits about 1,900 lines from `ceremony-w4/reads-w4.mjs` unchanged.** Those
  parsers were exercised by wave 4's own fifteen negative controls and by this cut's thirteen; they
  were not re-derived here. The blocks this worker wrote are the header, two new parsers
  (`parsedNewbornSignatures`, `parsedPremiseObjects`), the nine hand checks, `parsedUnlockedBodies`,
  `parsedRegistry`, `versionCut`, `postReads`, `parsedRedoSubstrings`, `parsedInsertedRelations`, the
  `execOf` narrowing in `compareFingerprints`, the arity and chained notes in `bodyPins`, and the
  `--cut-only` mode.
- **No mid-task status request arrived.** Had one, it is the orchestrator's to answer.
