# Riders sweep wave · lane 04 · ticket #1048 — a payroll summary with no printed total posts from its own row sum when the page witnesses its own completeness, and otherwise parks a question

**Branch** `riders/wS-lane04` in `C:\Users\zhant\Desktop\clara-wt\657`, base `7bc5a710f`.
**Database** `clara_l07` on `127.0.0.1:55747` (310 files / `0342` at start, **311 files / `0343` at end**).
**Migration** `0343_payroll_completeness_witness.sql` (2 635 lines), applied checksum
`97acf5a3771005fd440a9da25a8de0c04a8de4cb365b4b929d4d114373b7873f`.
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `0129d6e4e` | `feat(db)` — `clara.evaluate_payroll_run_state_v2` and its freeze registration; `frozen-evaluators.json` entry; the battery and its preintegration gate |
| `3c6b1f05e` | `feat(db)` — `clara._payroll_answers_ok` recut: two OPTIONAL witness questions |
| `b6297ddb0` | `feat(db)` — `clara.persist_payroll_facts` spliced onto v2 |
| `674063ac6` | `feat(db)` — `clara._payroll_entry_plan` recut: a witnessed row sum is a posting basis |
| `0c18d4881` | `feat(db)` — the answer table, the `completeness_witness` rung, the entry's own basis |
| `ce38a3b99` | `feat(db)` — the queue's seventeenth row kind and `clara.answer_payroll_completeness` |
| `efc842c7b` | `docs(db)` — the README `## 0343` section, the two-block tail, the web pins barrier |
| `d0c2f6965` | `feat(web)` — the seventeenth row kind through its five sync points, the inline affordance, the door module, CONTEXT.md |
| `f75d25d6c` | `test(db)` — W4c (the page-count witness) and W4d (the `not_asked` compatibility arm) |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. **No status-report request arrived mid-task.**

---

## 1 · The seams I tested at

Written down before the first cell, from the brief's own "Key interfaces":

- **W1 `clara.evaluate_payroll_run_state_v2(jsonb,jsonb)`** — the successor evaluator. The frozen v1
  gains nothing.
- **W2 `clara._payroll_answers_ok(jsonb,text)`** — the answer vocabulary (the brief's "payroll facts
  payload (a completeness witness read by both channels)").
- **W3 `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)`** — the door the payroll worker
  settles through.
- **W4 `clara._payroll_entry_plan(uuid,jsonb)`** — the drafting body.
- **W5 `clara._payroll_posting_verdict(uuid)`** — the unattended gate (the brief names it first).
- **W6 `clara.list_review_queue(jsonb,jsonb,integer)`** — "the Needs-you derived row kind for parked
  payroll questions".
- **W7 `clara.answer_payroll_completeness(uuid,text,text,text)`** — the named person's answer.
- Web side, in `lib/firm/needs-you-payroll-completeness.test.ts`: `REVIEW_QUEUE_ROW_KINDS` /
  `isKnownReviewQueueRowKind`, `messages/en.json`'s `NeedsYou.rowKind` / `NeedsYou.openTab`,
  `needsYouRowHref` / `hasOwningTab`, `getNeedsYouAffordance`, and `answerPayrollCompleteness`.

Not a seam and not touched: `clara.evaluate_payroll_run_state_v1` (frozen — the tail re-derives that
it did not move), `clara._payroll_period_month`, the persist door's per-employee strip, any
employee-level figure, any statutory rate.

## 2 · Was the ticket still live? Yes, confirmed independently

`gh issue view 1048 -R BELCORT-SDN-BHD/clara --json number,title,state,labels,body,comments`: state
OPEN, labels `enhancement` + `ready-for-agent`, and **zero comments** — so the body's Agent Brief is
the whole contract, with no later brief and no owner ruling comment to override it.

Measured on `clara_l07` before writing anything:

- `clara._payroll_entry_plan` still refused `run_totals_not_printed` for a page with no printed gross
  or net (`0297:433-441`), and 0297's own header says at `0297:346-353` that it deliberately does not
  reach for `computed_cents` because "whether the owner wants a row sum admitted as a posting basis is
  a product question this ticket does not answer for them". #1048 IS that answer.
- `clara.evaluate_payroll_run_state_v1` read exactly eleven run-level questions (`0296:412-416`), none
  of them a completeness witness, and its closure was registered in `clara.evaluator_versions` at
  version 1 with `0296:710-711` refusing an in-place recut by name.
- `clara.list_review_queue` projected **sixteen** row kinds, none a parked payroll question (counted
  on the live body, comments stripped — the same count the migration's prestate re-derives).

This matches the lane scan in `SWEEP-PLAN.md` exactly, including its "a new witness field read off
the page needs `clara.evaluate_payroll_run_state_v2`, because 0296:710 freezes v1".

## 3 · Acceptance criteria, each with its evidence

Battery: `packages/db/tests/payroll-completeness-witness.test.mjs` — **13 tests, 13 pass, 0 fail,
0 skipped** (focused run, gate variable UNSET).

### AC1 — "A cell posts a summary with no totals row but a printed headcount equal to its lines; the entry's basis names the row-sum and the witness."

**W5** drives it end to end through the real lane: filed payroll summary → router → claim →
`clara.persist_payroll_facts` with a text/vision pair whose eleven monetary answers are all
`not_printed`, whose period prints, whose two employee rows print, and whose
`payroll.run.employee_count` prints `2`.

- the settle receipt's `posting.posted` is `true` — the run posted inside the READ's own transaction,
  with no human in the loop;
- exactly one `approved` entry, dated `2026-02-28` (the end of the payslip's own month), memo
  `Payroll run February 2026`;
- its six legs are `6000 Dr 500000 / 2100 Cr 55000 / 2110 Cr 2450 / 2120 Cr 980 / 2130 Cr 16000 /
  2040 Cr 425570` — transcribed BY HAND at the top of the battery from #945's own two-row worked
  example, never re-computed from what the database produced;
- `flags->'payroll_run'->'posting_basis'` reads `kind=row_sum`, `witness=headcount`, `rows_read=2`,
  `employee_count=2` — **on the entry**, because `clara._tf_entry_immutable` allows `flags` to be
  written only at the draft insert and an auditor reading the LEDGER must be able to tell a figure
  the document states from one this estate computed;
- the receipt's `rationale` matches `/row sum/i` and `/headcount/i`, its `gate_verdicts.plan.posting_basis.kind`
  is `row_sum`, and `gate_verdicts.rung_vector.completeness_witness` is `pass`.

**W4** proves the plan half at its own seam, leg by leg: each `basis` is the question name suffixed
`#row_sum`, and `posting_basis.row_sum_fields` lists the six questions that were summed, in the leg
roster's own order.

**W4c** proves the brief's SECOND witness, which AC1 does not name but the brief's desired behaviour
does ("a page count of one"): one page with no headcount printed admits the sum with witness
`single_page`; three pages with no headcount parks the question instead
(`the_summary_names_more_pages_than_the_one_read`); and when BOTH witnesses print, the headcount
still wins — one page plus a headcount of three over two lines read is `completeness_contradicted`,
because a truncation the page itself does not know about is exactly what the weaker witness misses.

**W4d** is the compatibility cell, and it is the one that matters most for the live lane. It drives
the shape the FROZEN `payrollFacts_v1` worker sends today — eleven answers, no witness at all — and
pins that both witnesses read `not_asked` (reason `neither_channel_was_asked_this_question`), that
`facts` still carries exactly the eleven run-level keys, and that the plan's only refusal is
`completeness_unwitnessed`. Had an unasked witness read `unanswered` INSIDE `facts`, the verdict
would have folded it into `arithmetic_holds` and **every payroll run in the estate** would have been
refused on the grounds that the page does not add up. It also pins the two neighbours: one channel
answering and the other not is `not_asked` too (a half-configured prompt is a prompt problem, not a
page problem), while two channels reading DIFFERENT counts is `channels_disagree` and fails the
`channels_agree` rung rather than quietly parking a question about a page nobody has read.

**The entry balances exactly, and not by luck.** `500000 - (55000 + 2450 + 980 + 16000) = 425570` is
the row identity `gross - (epf + socso + eis + pcb) = net` that 0296's evaluator already checks on
every quoted row, holding at run level over the summed columns. The exact-balance rule 0297 set (no
rounding leg, ever) is untouched and still asserted.

### AC2 — "A cell parks a question for a summary with neither, and a named yes posts it with the answer recorded; a no leaves it unposted."

**W7** (parks): a page with no totals and no witness gives `rung=completeness_witness`,
`reason=completeness_unwitnessed`, `completeness.parked=true`, and the queue read
(`clara.list_review_queue` as a real human persona) returns **exactly one**
`payroll_completeness_question` row for the document and **zero** `payroll_posting_blocked` rows —
one document never produces two rows about one question. The row's `question_text` is byte-identical
to the verdict's own `sentence`, and matches `/prints no total; is this every employee for the
month\?/`, `/2 employee line/`, `/RM 5,000\.00 gross/` and `/RM 4,255\.70 net/`.

**W8** (a named yes): `clara.answer_payroll_completeness(document,'yes',note,op_key)` driven as a real
human returns `posted=true` with an `entry_id`; the entry is `approved`, dated `2026-05-31`, its
`posting_basis.kind` is `row_sum`, its `witness` is `answered_question`, and its
`posting_basis.answer.answer_id` points at the answer row itself. The stored row carries
`answer=yes`, `rows_read=2` (the line count the person affirmed, frozen), the note verbatim, and an
`extraction_id` equal to the verdict's own `extraction_id` — bound to the READING, so a re-read asks
again. The receipt's rationale matches `/ROW SUM/` and names the answering user. Afterwards the only
Needs-you row left for the document is #947's `payroll_net_pay_unsettled`, which is correct (the run
is posted, the net has not left the bank). A second answer is refused `/no parked completeness
question/i`.

**W9** (a no): `posted=false`, **zero** entries for the document,
`reason=completeness_declined`, `completeness.parked=false`, and the queue row for the document is
`payroll_posting_blocked` (beside the ordinary `uncoded_filing`, which is 0297 §H's own recorded
coexistence model) with a `question_text` naming the person who declined and matching `/not every
employee for the month/`.

**W10** (the door's own walls): answering a summary that posted on its printed totals is refused
`/no parked completeness question/i`; an answer that is neither `yes` nor `no` is refused; a blank
op key is refused `op_key is required`.

### AC3 — "A cell refuses a summary whose printed headcount disagrees with its lines."

**W6**: a page printing `payroll.run.employee_count = 3` whose reading found two agreed lines →
`posting.posted=false`, **zero** entries written, `rung=completeness_witness`,
`reason=completeness_contradicted`, `rung_vector.run_totals_printed='pass'` (the rung about a
printed total is not the one that failed), and `completeness.parked=false` — a contradiction is not
a question a person can answer away. The sentence names the printed headcount (`3`), the lines read
(`2`) and the month.

### AC4 — "The existing `run_totals_printed` cells still pass where a totals row exists (the printed total wins over the sum and a mismatch is `arithmetic_holds`)."

- **W4b** (this battery's own control): the #946 fixture that DOES print its totals still drafts the
  eleven-leg entry at `576145` both ways, `posting_basis.kind='printed_totals'`,
  `row_sum_fields=[]`, and no leg's basis carries `#row_sum` — a witness present alongside printed
  totals changes nothing.
- **`packages/db/tests/payroll-summary-posting.test.mjs`: 24 tests, 24 pass, 0 fail, 0 skipped** —
  every #946 cell, including the printed-total-wins cell and the `totals_mismatch → arithmetic_holds`
  cell, unchanged.
- **`packages/db/tests/payroll-summary-facts.test.mjs`: 23/23** and
  **`packages/db/tests/payroll-settlement.test.mjs`: 10/10**.

**Two neighbour cells moved with this file, and each says why at the line.** Both are subjects this
ticket deliberately changes, not collateral:

1. `payroll-summary-posting.test.mjs` **S1** — a page with rows but no totals row used to expect
   `run_totals_not_printed`; it now expects `completeness_unwitnessed` (plus the
   `period_not_established` that fixture also earns). That IS the ticket. A **new S1b** keeps
   `run_totals_not_printed` honest for the case it still owns: a page with **no rows to sum at all**,
   which parks nothing because there is nothing to ask about.
2. `payroll-summary-facts.test.mjs` **S5** — the banked `state_version` moved from `v1` to `v2`.

### AC5 — "Migration applies from scratch and on a populated database; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0."

- **On a populated database:** applied first at `pnpm --filter @clara/db migrate` (311 files, ledger
  max `0343`), then re-applied **seven times** under `CLARA_MIGRATION_REDO=0343_payroll_completeness_witness`
  with `CLARA_ALLOW_DESTRUCTIVE=1` as the lane grew — the supported redo mode #957 added
  (`packages/db/README.md`, "Redo (#957)"). Every redo took the guarded branch of every splice and
  every registration (`SectionD … splice already applied, nothing to do (redo)`, `SectionJ … (redo)`,
  and the prestate's own `already carries this file's marker -- redo path` notices). **I did use the
  redo mode, and this is the record of it.**
- **From scratch:** not run here (the lane rig forbids a second from-scratch chain on its own
  cluster — migration 0154 pins the cluster-wide role count, and the integrator runs the from-scratch
  proof on a disposable cluster). What I proved instead is the branch a from-scratch chain will take
  — see §5.
- **Lint:** `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` → **exit 0**.
  (`FREEZE_BASE_REF` is the wave-2 addendum's "wherever a rule says `origin/main`, use the lane base":
  see §7 for the 28 findings the DEFAULT base produces and why none of them is this ticket's.)

## 4 · The accounting judgement, and what it does and does not change

The brief calls this the lane's accounting decision, so it is recorded here rather than left in the
migration header alone.

**The risk.** Posting from a row sum means posting a figure the page never states. A reading that
missed an employee line understates staff cost, understates the net owed, and understates the
statutory payables (EPF, SOCSO, EIS, PCB) that are remitted against a filed return — a misstatement,
and in Malaysia a compliance exposure, not a rounding question.

**The three witnesses, and what each is actually worth.**

| witness | worth |
|---|---|
| a printed employee headcount equal to `rows.agreed` | the strongest: the document asserts how many employees are in the run and the reading found exactly that many |
| a printed page count of one | weaker, and stated as such: it witnesses that the DOCUMENT is not truncated, not that the RUN is complete — which is precisely the gap the row sum opens |
| a named person's `yes` | the professional judgement the standing owner ruling asks Clara to ask for |

A printed headcount the lines **contradict** is the one case where a witness is worse than silence,
and it refuses even against a page count of one.

**The second gap this file does NOT open.** "Is this document the whole firm's run?" is untouched: a
printed totals row is equally silent about it, and the lane has posted from printed totals since #946
without asking. The row sum opens only "did I read every line of this document?", and that is what
the witnesses close.

**The residual, named rather than hidden.** Only the six columns a payslip row prints have a sum, so a
row-sum entry books the gross, the four employee deductions and the net, and the employer's own
EPF/SOCSO/EIS and the HRDF levy get **no leg**. That is `0297:355-359`'s standing rule ("an unprinted
line produces no leg") applied unchanged — a printed totals row omitting those columns has produced
the same partial entry since #946. **This file changes WHICH FIGURE a leg may come from, never WHICH
LEGS exist.** A firm whose summary prints no employer contributions books them as before: by hand, or
through 0194's periodic payroll obligation, which this lane's duplicate guard already refuses to
double-book.

**A behaviour change for readings already banked, and it is the one the brief asks for.** Every
payroll pair read before 0343 carries `state_version: v1` with no `completeness` object, and the rows
the evaluator summed were stripped at the persist boundary (`0296:1876-1883`) so the state cannot be
re-derived. The recut plan admits both versions by name and treats a v1 state as "no witness", which
moves an already-read, never-posted summary off 0297's dead end and onto the parked question. This
applies to hosted readings.

## 5 · The migration, its prestate pins, and the first-apply proof

`packages/db/migrations/0343_payroll_completeness_witness.sql`. Sections: A prestate · B the
successor evaluator + its freeze · C the answer vocabulary · D the persist splice · E the drafting
body · F the answer table · G the answer read · H the posting gate · I the poster · J the queue
splices · K the answer door + its event type · Z the tail (in two blocks).

**Every pinned signature, with its sha, all MEASURED on `clara_l07` on 2026-09-25 after this lane's
#1061/#1059/#1060 and never transcribed from another file's header.** The integrator uses this list
to find a pin another lane recuts:

| signature | sha256(prosrc) | how it is pinned |
|---|---|---|
| `clara.evaluate_payroll_run_state_v1(jsonb,jsonb)` | `0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd` | exact, in **both** the prestate and the tail — this file never recuts it |
| `clara._payroll_period_month(text)` | `401f76cba102a8eea0be6e9852401bb2f1e469de7298387f857c1a4a1f39b7c1` | exact, in both — a neighbour the plan calls and this file does not touch |
| `clara._payroll_answers_ok(jsonb,text)` | `f3e22d9db2b65afecf369fea77e46bab3d0451d053b236374f1a7f2f867e3f02` | **bimodal**: this sha, or a body carrying the `#1048` marker (redo) |
| `clara._payroll_entry_plan(uuid,jsonb)` | `9889780c7abcf79d6c939b79706c521113e7aa6b77b138cee6af1457e4889d83` | bimodal |
| `clara._payroll_posting_verdict(uuid)` | `23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0` | bimodal |
| `clara._post_payroll_run(uuid)` | `482d3cebb2c80629b9785ee6fef76dd2b8dd3121a7268d6c31dbfa95e4afb05b` | bimodal |
| `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)` | `63633a3f06edcb6effebb7b2ca9a8a82c805bb2ca33537e49a1660b66c22f7aa` | bimodal: this sha, or a body already naming `evaluate_payroll_run_state_v2` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `d5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b` | bimodal: this sha, or a body already naming `payroll_completeness_question` |

Plus three non-sha prestate assertions: `clara.evaluator_versions` holds 1 (first apply) or 2 (redo)
`evaluate_payroll_run_state` rows; the queue projects 16 or 17 row kinds; `clara.event_types` holds 0
or 1 `document.payroll_completeness_answered` row.

**THE FIRST-APPLY BRANCH IS PROVEN** (wave-3 addendum: "`CLARA_MIGRATION_REDO` only ever takes the
'my own body is already live' branch. Prove the FIRST-APPLY branch yourself"). Inside ONE transaction
that was then rolled back, run by hand from the scratchpad (not committed, not a test):

1. the four recut bodies re-created from **0296's and 0297's own statements**, sliced out of those
   files by line range;
2. `persist_payroll_facts` and `list_review_queue` textually **un-spliced** (my replacement text
   replaced by the exact anchor it had displaced, the witness CTE and its union arm removed);
3. every object 0343 mints removed: the v2 registration and its member row, the event type and its
   taxonomy row (and the `domain_events` rows the battery had emitted), the answer table, the trigger
   function, `_payroll_completeness_answer`, `answer_payroll_completeness` and
   `evaluate_payroll_run_state_v2`;
4. **all seven pre-images then matched the prestate's pins BYTE FOR BYTE (7/7)**;
5. the prestate DO block, extracted verbatim from the migration by its own dollar-quote tag, ran and
   **PASSED**, emitting only its OK notice and **no `redo path` notice** — which is the assertion:
   it took the first-apply branch;
6. `rollback`.

Afterwards the battery re-ran **11/11**, so the lane database is unchanged by the proof.

**A data-dependent branch entered once (wave-3 addendum).** The prestate's and the tail's row-kind
counts, the evaluator-version counts and the event-type counts are all catalogue reads with no
row-dependent arm. The one genuinely data-dependent path in this file is the ANSWER read
(`clara._payroll_completeness_answer`) and the plan's answer arm, and both states were created
through the estate's own doors on this database before the file's final redo: a `yes` answer (W8) and
a `no` answer (W9) both exist in `clara.payroll_completeness_answers` on `clara_l07`, and the final
redo ran over both.

**One hand repair, recorded rather than quiet.** The first cut of §F created the answer table
**without** `set role clara_fn_owner`, so it landed owned by the migration principal and the
SECURITY DEFINER read refused it `permission denied` (measured). The migration now wraps §F in `set
role clara_fn_owner` / `reset role` like every other clara table; because `create table if not
exists` would not have re-owned the existing object, I dropped the mis-owned table (0 rows, this
migration's own unmerged object) and its trigger function by hand before the redo. The tail now
asserts the owner. Nothing else on the rig was touched by hand.

## 6 · The queue split, and why it is a split rather than an addition

A parked question and a posting block are the same document in the same state. Two arms would
produce two rows saying the same thing, one actionable and one not. So §J does **two** splices:

1. #946's `payroll_rows` gains ONE predicate — stand down when
   `pv.v->'completeness'->>'parked'` is true;
2. the new `payroll_witness_rows` arm takes exactly the rows it stood down from.

Both read the same flag, computed once by `clara._payroll_posting_verdict`, so neither can claim a
row the other claims and neither can miss one. The splice's postcheck re-reads the COMMITTED catalog
and asserts: all sixteen pre-existing row-kind markers at their exact counts, the seventeenth exactly
once, the split predicate exactly twice, the shared column vector at exactly one more occurrence than
before, and **seventeen** row kinds in total. W7 and W9 drive both sides of the split on a real queue
read.

## 7 · Gates, with counts

| gate | result |
|---|---|
| `packages/db/tests/payroll-completeness-witness.test.mjs` (focused, gate var UNSET) | **13 tests, 13 pass, 0 fail, 0 skipped** |
| the four payroll batteries + `operation-census` + `rig-isolation`, **with the full 126-flag `$GATES` chain** | **109 tests, 108 pass, 0 fail, 1 skipped** |
| the one skip | `rig-isolation` T19 (`poison-role: reset + re-migrate`) — `# SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`. The rig rule forbids that flag; **never set** |
| `operation-census.test.mjs` (alone) | 10 tests, 10 pass, 0 fail |
| `rig-isolation.test.mjs` (alone) | 23 tests, 22 pass, 0 fail, 1 skipped (T19) |
| `apps/web` WHOLE unit suite (`node scripts/run-tests.mjs`) | **5 181 tests, 5 179 pass, 0 fail, 2 skipped**, exit 0 |
| the two web skips | the two live-Supabase-auth cells, skipped for want of `CLARA_LIVE_SUPABASE_AUTH_URL`/`..._ANON_KEY` — pre-existing, not mine |
| `apps/web` `lib/firm/needs-you-payroll-completeness.test.ts` (focused) | 6 tests, 6 pass, 0 fail |
| `apps/web` `tests/firm-scope-db-pins.test.ts` (focused, the corpus rule (d)) | 22 tests, 22 pass, 0 fail |
| browser walk `home-board-walk` on MY triple (`3560/3561/3562`) | **28 passed** (1.2m), exit 0 |
| `pnpm typecheck` | clean (`apps/web` and `packages/runtime` both Done) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| `node scripts/check-frozen-evaluators.mjs` (DEFAULT base `origin/main`) | **OK — 12 evaluators verified, append-only** |
| `node scripts/check-frozen-workflows.mjs` (DEFAULT base `origin/main`) | 28 violations — **a base artifact, not this ticket's** (below) |

**The 28 workflow-freeze violations, and why none is mine.** They are all `REMOVED-VS-BASE` for
`chatTurn.v22.*`, `claraWork.v6.*` and `statementFacts.v4.*` plus three `REGISTRY-DOWNGRADE` lines
for the same three classes. Those files landed on `origin/main` in the **cut phase**, which merged
after this lane branch was cut: `git rev-list --count 7bc5a710f..origin/main` is **59**, and the
range's head is `061a6992b Merge pull request #1140 from BELCORT-SDN-BHD/integration/riders-cut`.
This ticket touches no workflow file at all — `git diff --stat 7bc5a710f..HEAD -- frozen-workflows.json
packages/runtime/` is **empty** — and against the lane's own base the whole lint chain exits 0. The
integrator will see these clear the moment the branch is on a base that carries the cut.

**Windows-only reds:** none encountered.

**One real finding the wiki lint caught, and the fix.** `scripts/wiki-lint-checks.mjs` classifies any
`do` block that reads `pg_get_functiondef` at a literal signature as a CHANGE-OF-RECORD PATCH SITE and
then scans every quoted literal inside it as text that could reach a persistent surface. My first tail
read the queue's definition (for the row-kind count) **and** called
`has_function_privilege(role, sig, 'EXECUTE')` — and that `'EXECUTE'` literal reads to the scanner as a
dynamic-SQL keyword with an unprovable target. Fail-closed, correctly. **The tail is now two blocks**:
one that reads a function definition and names no privilege, one that names privileges and reads no
function definition. Recorded in the migration's own §Z header, because the next person to write a
tail with a grant check in it will hit the same wall.

## 8 · Docs

- `packages/db/README.md` — a new `## 0343` section (the file's own; no existing section edited):
  what it settles, the accounting and the worth of each witness, the named residual, the section
  table, why a `_v2` and not a recut, why the two witness facts live outside `facts`, why a count is
  parsed as a count, the `rows.agreed` rule, the v1-state behaviour change, the one rung and its
  three reasons, the reading-bound answer, the queue split, the one human write, the entry's own
  basis, the gate/rig-meta/pins-corpus entries, the two neighbour batteries that moved, and the
  out-of-scope line.
- `CONTEXT.md` — one new term, **Completeness witness**, at the sorted position beside the payroll
  family, in the house "term / _Avoid_" shape. (The SWEEP-PLAN table lists `CONTEXT.md` as L3's file
  "only if #1049 stays in the wave"; the hunk here is one term at the sorted position, which is the
  shared-file rule's own answer, and work-order rule 9 owes a CONTEXT entry for new vocabulary.)
- `apps/web/lib/firm/needs-you.ts` — the grounding note gains 0343's paragraph and the live set moves
  from SIXTEEN to SEVENTEEN, with the split recorded.
- `frozen-evaluators.json` — ONE hand-inserted entry (never `--update`: measured here, `--update`
  re-serialized all twelve entries and moved four `deployed` keys, which is exactly the blast radius
  0111's own note says the hand-insert practice exists to avoid). Final diff: **6 insertions, 0
  deletions**.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — one reviewed barrier entry for 0343 at the
  file-sorted position (work order rule (d)).
- `packages/db/tests/rig-meta.mjs` — one cohort, `PAYROLL_COMPLETENESS_0343_HUMAN_FNS`.
- `packages/db/package.json` — one `$GATES` entry at the tail.
- `apps/web/test/manifest.txt` — one line at the sorted position.

## 9 · Successor contracts

Nothing in this ticket edits a frozen body. Two things a frozen family would need are delivered here
instead.

### 9.1 `payrollFacts_v2` — the prompt stanza that makes witnesses 1 and 2 reachable

`payrollFacts_v1` is a frozen workflow family, so its prompts still ask eleven run-level questions and
the two witness answers never arrive. **That is safe by construction** — the vocabulary admits them as
OPTIONAL and the evaluator calls an absent one `not_asked` — and the lane degrades to the parked
question, which is the brief's own fallback. To make the page-printed witnesses reachable, the
successor family needs exactly this, in `packages/runtime/workflows/payrollFacts.v2.prompts.mjs`:

- **`PAYROLL_WITNESS_FIELDS`**, a new frozen array beside `PAYROLL_RUN_FIELDS`:
  `["payroll.run.employee_count", "payroll.run.page_count"]`.
- **The wire schema**: `runAnswersShape()` gains those two keys **optionally** —
  `shape[f] = answerShape.optional()` — so an envelope without them is still valid. The `answerShape`
  itself is unchanged (`state: "value" | "not_printed"`, `raw: string | null`, 200 chars).
- **`PAYROLL_CITATION_FIELDS`** is NOT widened: 0343 mints no `document_regions` row for a witness, so
  a citation naming one would resolve to a region the persist door never writes.
- **The shared prompt stanza**, appended after "THE ELEVEN RUN-LEVEL QUESTIONS":

  ```
  TWO QUESTIONS ABOUT THE PAGE ITSELF, not about money. Answer both, or omit both.
    payroll.run.employee_count  the number of employees this run covers, if the page prints one
                                — a headcount, a "total employees", a "no. of staff" figure.
                                Quote the NUMBER only ("12"), never the label.
    payroll.run.page_count      the TOTAL number of pages this summary has, if the page says so
                                ("Page 1 of 3" → answer "3"; "Page 1 of 1" → answer "1").
                                Answer the TOTAL, never the page you are looking at.
  Both are counts, not amounts: no currency, no decimals. If the page prints neither, answer
  'not_printed' for both — that is a lawful reading, and a person is asked instead.
  ```

- **Nothing else moves.** The database half is already live: `clara._payroll_answers_ok` admits the
  two keys today, `clara.evaluate_payroll_run_state_v2` reads them today, and a v2-family envelope
  carrying them needs no further migration.

### 9.2 `read_payroll_posting_state` — the Work/chat tool the brief names

The ticket's "Key interfaces" names a successor contract `read_payroll_posting_state`. No frozen chat
or Work tool is edited by this ticket; here is what the next cut (`chatTurn_v23` / `claraWork_v7`, or
the cut phase's `_v22`/`_v6` if it takes it) needs:

- **name**: `read_payroll_posting_state`
- **zod input**:
  ```ts
  z.object({
    document_id: z.string().uuid()
      .describe("the payroll summary whose posting state to read"),
  })
  ```
- **door call, argument order**: `clara._payroll_posting_verdict(p_document uuid)` is **ungranted** and
  is reached from `clara._post_payroll_run`, `clara.list_review_queue` and
  `clara.answer_payroll_completeness` alone. A tool must NOT be granted it. The read a tool can have
  today is the queue itself — `clara.list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer)`
  with `p_scope = {"client_id": …}` — filtered to `row_kind in ('payroll_posting_blocked',
  'payroll_completeness_question')`, whose `question_text` IS the verdict's own sentence. If a
  document-scoped read is wanted instead, it needs its own granted wrapper in a later migration
  (`clara.get_payroll_posting_state(uuid)`, `clara_authenticated`, viewer floor, returning the
  verdict's `sentence` / `verdict` / `rung` / `reason` / `completeness` and **not** its whole
  `rung_vector`), and that wrapper is NOT built here — the ticket's own out-of-scope line does not
  cover it and no acceptance criterion asks for it.
- **refusal mapping**: `CLR11 → not_found` (the document is not this firm's);
  `CLR04 → not_permitted`; anything else surfaces verbatim as a `DoorRefusal`.
- **part kind**: the existing `needs_you_row` part the queue rows already render; no new part kind.
- **prompt stanza**:
  ```
  A payroll summary that was read and did not post appears in the Needs-you queue with the
  database's own sentence naming what stopped it. When the row is a completeness question ("this
  summary prints no total; is this every employee for the month?"), you may NOT answer it: it is a
  professional judgement, and clara.answer_payroll_completeness is a human door. Show the person
  the question, the number of lines Clara read and the gross and net those lines total, and say
  that answering yes posts the run from those lines.
  ```

### 9.3 The answer door's own web contract (already built here)

`apps/web/lib/firm/payroll-completeness.ts` exposes
`answerPayrollCompleteness(session, documentId, "yes" | "no", note?)` →
`callDoor("answer_payroll_completeness", { p_document, p_answer, p_note, p_op_key })`. Refusals:
`no_parked_completeness_question`, `payroll_completeness_answer_invalid`, `not_filed`.

## 10 · Follow-ups worth filing

1. **`clara.get_payroll_posting_state(uuid)` — a granted, document-scoped read of the posting
   verdict.** Today the only way to see the verdict is the Needs-you queue row (firm-wide or
   client-scoped) or the entry's own receipt. A document page that wanted to say "this payslip did not
   post because …" has no read to call, and §9.2's tool contract has to route through the queue
   because of it. Small: one `security definer` wrapper, viewer floor, projecting `sentence`,
   `verdict`, `rung`, `reason` and `completeness` (never the whole `rung_vector`).
2. **The shared FIFO settlement-candidate extraction now has its fourth instance — but not from this
   ticket.** #1060's second half is gated on a fourth instance appearing and this file adds none;
   recorded here only so the next reader of #1060 does not mistake `payroll_witness_rows` for one. It
   is a Needs-you arm, not a FIFO ledger read.
3. **`payrollFacts_v2` (§9.1).** Until it ships, witnesses 1 and 2 are unreachable in production and
   every no-totals summary takes the parked-question path. That is correct behaviour, not a defect —
   but it means AC1's page-printed-headcount path is exercised only by this battery, never by a real
   read, until the successor family lands.
4. **A `payroll_completeness_question` row for a document whose client has no payroll chart** will show
   the parked question, and answering `yes` will then be refused `account_missing` by the post while
   the ANSWER still stands. That is deliberate (the answer is a fact about what a person said), and
   the door returns the refusal — but the Needs-you row will then read `payroll_posting_blocked`
   naming the missing account, which is the honest next step. Worth a cell in a later ticket; not one
   the brief asks for.

## 11 · Anything unverified

- **From-scratch apply of the whole chain including 0343** — NOT run on this rig, by the rig rule (a
  second from-scratch chain on a cluster that already ran one needs the #867 recipe, and lanes never
  do it). What IS proven is the first-apply branch of every bimodal pin, inside a rolled-back
  transaction, with all seven pre-images restored byte for byte (§5). The integrator's disposable-
  cluster chain is what closes this.
- **The 28 `check-frozen-workflows.mjs` violations against the DEFAULT `origin/main` base** are
  asserted to be a base artifact on the evidence in §7 (the 59-commit gap, the empty
  `git diff … packages/runtime/`). I did not re-run that lint on a checkout rebased onto
  `origin/main`, because rebasing this lane is the integrator's act, not mine.
- **Browser walks other than `home-board-walk`** were not run. I touched no e2e spec; the walks that
  render the Needs-you inbox (`firm-navigation-walk`, `entry-faces-walk`, `shell-migration-walk`,
  `work-list-walk`, `work-question-walk`) exercise row kinds this ticket does not change, and the
  whole unit suite — which renders the real inbox through `needs-you-a11y.test.tsx` — is green.
- **`payroll.run.page_count` as a witness has no production instance yet**, for the same reason as
  follow-up 3: the frozen prompts do not ask it. Its behaviour IS proven at the evaluator and plan
  seams — **W4c** drives one page with no headcount (admitted, witness `single_page`), three pages
  with no headcount (parked), and both witnesses printed with a headcount that contradicts the lines
  (refused, because the headcount wins) — but no real read has ever produced one, and none will until
  the successor prompt family ships.
- **A row-sum post has never run against a page with more than two employee rows.** The battery's
  fixture is #945's own two-row worked example, deliberately, so this file and the two neighbour
  batteries agree about what the page says. Nothing in the sum, the identity or the witness
  comparison is row-count dependent, but a twelve-row payslip has not been driven.
- **Hosted data.** No claim is made about how many already-banked v1 payroll readings exist on hosted
  or how many would newly park a question. The behaviour change is described (§4); its population is
  not measured.
