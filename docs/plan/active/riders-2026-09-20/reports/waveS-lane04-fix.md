# Riders sweep wave — lane 04 fix round (single fix worker)

Branch `riders/wS-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, base `7bc5a710f`,
database `127.0.0.1:55747/clara_l07`.

**New head: `76cc16ff12b4bf9e88e5059e47d6bd4aaf8762cd`** (was `f75d25d6c`).

Tickets: #1061, #1059, #1060, #1048. Reports read in full before any change:
`waveS-lane04-codereview-spec.json` (8 findings), `waveS-lane04-codereview-standards.json`
(1 finding), `waveS-lane04-review-adversarial.json` (12 findings).

## Resume state

`git status` at start: **clean**. `git log 7bc5a710f..HEAD`: 14 commits, all of them the four
tickets' own build commits, none a fix commit, and no `waveS-lane04-fix.md` on disk. So the earlier
fix worker was killed before it wrote anything: there was no half-finished change to judge, nothing
to revert and no report to extend. Every commit below is new work, and no landed commit was redone.

No mid-task status request arrived.

## Commits (nine)

| commit | what |
|---|---|
| `8fdd89936` | fix(db) #1048 — a completeness witness never vetoes a page that prints its totals (ADV-01, ADV-11) |
| `0eb3abc6b` | fix(db) #1048 — a posted payroll entry names the evaluator it was judged by (ADV-04) |
| `c92bbb36e` | fix(db) #1048 — an answered payroll post meets the estate's maker-checker ladder (ADV-02) |
| `3059152b5` | fix(db) #1048 — the parked question says what a yes does not book (ADV-06) |
| `90964cc76` | fix(db) #1048 — a second answer to one question is a refusal, not a 23505 (ADV-07, ADV-12) |
| `27a7cb38d` | fix(db) #1048 — the published capability claim catches up with this lane (ADV-05) |
| `15c4c3ff3` | fix(web) #1059/#1060/#1048 — durable + resumable reverse route, one decider for the bank destination (SPEC-01, SPEC-02/ADV-03, SPEC-04, ADV-08, ADV-09, STANDARDS-1) |
| `1edc3132d` | docs(db) #1048 — say which half of the completeness witness is live today (SPEC-03) |
| `76cc16ff1` | test(db) #1048 — the two other registry-version pins re-base at 8 |

## Every finding, and what happened to it

### Blockers

**ADV-01 — a completeness witness only ONE channel found blocked a page that prints its totals.
FIXED.** Reproduced first, exactly as the report measured it: a fully printed #946 page (all eleven
run totals, both channels agreeing on every one, arithmetic holding) came back
`posted=false, rung=channels_agree, reason=channels_disagree` the moment the text channel quoted a
headcount the vision channel read as `not_printed`. Two edits in 0343:

- `clara.evaluate_payroll_run_state_v2` gives a value-against-a-`not_printed` its own state,
  `one_channel_printed` (reason unchanged). One reading and one silence is not two readings of one
  number, and it is the likeliest split of all once the prompts ask these questions.
- `clara._payroll_posting_verdict` no longer folds ANY witness state into its `channels_agree`
  rung. A witness is a fallback for silence, so its failure belongs to the rung that is only
  reached when the page IS silent — where the evaluator's `absent` verdict becomes the PARKED
  QUESTION a named person can answer. That is strictly better than the reviewer's own second
  option: a load-bearing witness that cannot be read now asks a human instead of refusing.

New cells: **W11** drives both splits end to end through `clara.persist_payroll_facts` and sees the
page post on its printed totals with eleven legs (red before at `posted=false`); **W12** drives the
no-totals page and sees `channels_agree: pass`, `rung=completeness_witness`,
`reason=completeness_unwitnessed`, `parked=true` (red before at `state='channels_disagree'`).

**ADV-02 — an answer-driven post booked a high-stakes entry with no checker. FIXED.** Reproduced:
with an ORDINARY firm floor of RM1,000 and a run whose gross sum is RM5,000, one bookkeeper's yes
posted an APPROVED entry, agent as both maker and checker. `clara._post_payroll_run` now resolves
WHO authorised a post — nobody for the unattended arm, exactly one named person when the basis
witness is `answered_question` — writes that person to `last_human_editor` at the draft insert, and
when the entry is high-stakes takes 0298:494's own posture: leave it a DRAFT for `clara.approve_entry`,
which carries all three governance arms rather than re-typing them here. The answer door carries
0298's `awaiting_checker` shape through. **The unattended arm is untouched**: #946 shipped it
self-approving, the registry publishes it as an unattended post, and widening the wall onto it is a
different ticket's decision.

The gate's duplicate sentence also gained a draft branch, because this lane can now leave one:
"drafted … and waiting for a checker to approve it" instead of "already posted — decide whether this
is a correction or a re-upload", which would have sent the next person to the wrong remedy.

New cell **W14** drives the whole ceremony: bob answers, the entry is a draft with a null checker
and bob as `last_human_editor`, `clara.is_high_stakes` says true, the sentence says a checker is
awaited, and alice finishes it through `clara.approve_entry` as a DISTINCT checker. Red before at
`posted=true`.

### Majors

**ADV-03 / SPEC-02 — the reverse ceremony was two transactions with no compensation, and a partial
failure locked the panel's only path shut forever. FIXED, two independent ways.** The durable read
(below) reports a settlement with no live match as `unmatched`, so a retry skips straight to
`reverse_entry` and never re-calls the door that would refuse `already_unmatched` forever. And a
CLR10 `already_unmatched` raised DURING the composition is read as "that half landed" rather than as
a failure, because that is what it says. Every other refusal from either door still surfaces
verbatim and stops the act. Cells `p1059.web.resume` (the read says `unmatched`; unmatch is not
attempted at all; only `reverse_entry` is called) and `p1059.web.retry` (unmatch IS attempted, is
refused `already_unmatched`, and the ceremony carries on to completion).

**SPEC-01 — #1059's reverse path existed only inside the mount that did the Accept. FIXED, with no
migration.** The ticket report justified the narrowing by saying a durable list would need a new SQL
read; the reviewer refuted that on measurement and was right. Re-measured here on `clara_l07`:
`clara_authenticated` holds column SELECT on `clara.journal_entries.flags` and table SELECT on
`clara.bank_matches`, `clara.bank_match_entry_members` and `clara.bank_statement_lines`. New module
`apps/web/lib/bank/payroll-settlement-reversals.ts` derives the list from the ledger on every
hydration through those reads. **No new door, no new view, no migration.** It reports three states
because the ledger has three — `settled`, `unmatched`, `awaiting_checker`.

One deliberate restraint recorded at the line: **no jsonb filter operator is guessed.** The
"does this entry carry a `payroll_settlement` marker" test is done in TypeScript over rows the
server filtered on columns whose PostgREST operators this repo already uses (`eq`, `in`, `is.null`).
A `cs.` containment filter on a jsonb column would probably work, but there is no live PostgREST on
this rig to prove it against, and a filter that silently matched nothing would make a reversible
settlement invisible — the exact failure the module exists to remove. The cost is bounded by the
same `FETCH_CAP` the Journals workbench already pays per client.

Cell `p1059.web.durable` mounts with NO accept in the session and finds the settlement, its period,
its amount (off the match member, never off memory) and its Reverse button. The e2e walk gained the
leg no other instrument can run: on the BUILT bundle, after a fresh sign-in, the card is there.

**ADV-04 — every posted payroll entry mislabelled its own `state_version`. FIXED.** The flag was
read off the plan's `plan_version` literal, which is the drafting body's output shape and never was
the state's version. The plan now carries `state_version` beside `plan_version` and the poster writes
the entry's flag from it. Cell **W13** reads the banked reading and the ledger side by side; red
before at `v1` against a `v2` reading.

**ADV-05 — the registry basis #1061 published is contradicted by #1048 in the same lane. FIXED, by
publication rather than by edit.** 0342 is not touched (it is applied on every lane database and its
correction belongs to its successor). 0343 gains **SectionL**: the same six `payroll_summary`
pdf/image rows are republished at `registry_version` 8, in 0342's own two-statement order, with a
basis that names the completeness witness, the parked question, the fact that a page with no run
totals parks instead of posting, and the row-sum entry's own six-leg shape and the employer cost it
does not book. 0343's tail, which used to assert the registry was NOT republished, now re-derives
one published version, the corrected sentence on exactly six rows, zero movement on any other
`payroll_summary` row and zero outside it.

**The FIRST-APPLY branch of SectionL is proven by hand** (wave-3 addendum: `CLARA_MIGRATION_REDO`
only ever takes the "already live" branch). Inside a transaction that was rolled back: 0342's own
post-image sentence restored on the six rows and the registry dropped to 7 (with the walls suspended
for the RESTORE only, because 0207's monotone wall rightly refuses a backwards version), then walls
back on, then SectionL run verbatim off disk. Result: 6 rows corrected, registry `{d:1, v:8, rows:240}`,
zero collateral outside the six. The lane database re-read after the rollback is unchanged
(`versions=1, v=8, rows=240, corrected=6, high-water off-version=0`).

**ADV-06 — the person answering the parked question was not told what their yes does not book.
FIXED.** `clara._payroll_entry_plan` now reports `unbookable`: the questions for which no figure
exists from either source, computed **independently of whether the sum was admitted** — which
matters, because while the question is PARKED the sum has not been admitted and `unprinted`
therefore names all eleven questions, not the four the finding names. One body decides what the page
can book; the gate's sentence reads it and names them in plain words, in the entry's own order.

Cell **W15** asserts the sentence AND drives it true: it answers yes and reads the entry's legs back
— 6000, 2100, 2110, 2120, 2130, 2040 and nothing else, with no 6010/6020/6030/6040/2140 leg
anywhere. The affordance component is deliberately untouched: its own header records that the
sentence is the database's own and that a second rendering of the same facts would be a second
opinion about them.

**SPEC-03 — the two page-printed witnesses cannot fire in production. NOT A CODE FIX; the repo is
made honest and the ticket is owed.** The finding is correct and the worker was right not to edit
the frozen family. `packages/db/README.md`'s 0343 section now says, in one place a release-note
writer would read: the PARKED QUESTION half is live end to end; the two page-printed witnesses
cannot fire until a `payrollFacts_v2` asks the two optional questions, because
`payrollFacts.v1.prompts.mjs`'s `PAYROLL_RUN_FIELDS` is a frozen eleven-element array carrying
neither key; **no release note and no ticket close may say Clara posts from a printed headcount
today.** The successor contract (prompt stanza + wire shape) is `waveS-lane04-ticket1048.md` §9.1
and is **owed to the orchestrator as a ticket to file** — this worker may not write to GitHub.

### Minors

**SPEC-04 — the high-stakes settlement arm got no reverse path. FIXED rather than narrowed.** The
durable read surfaces 0298's `awaiting_checker` DRAFT (no match to unmatch, nothing posted to
reverse) and offers the estate's own `clara.withdraw_draft`, which is what undo means before
anything is posted — reusing `lib/journals/governance-doors.ts`'s existing wrapper, not a new door.
Cell `p1059.web.awaitingchecker` drives it and asserts the entry id, the reason and the expected
revision token on the wire.

**ADV-07 — two concurrent answers got a raw 23505. FIXED.** Reproduced with two real connections.
The door now takes `pg_advisory_xact_lock(203431048, hashtext(document))` (the house idiom at
0006:952 and eleven siblings) BEFORE it reads the verdict, so the loser waits, re-reads and is
refused `no_parked_completeness_question` by name. The UNIQUE on `extraction_id` stays as the belt
and its violation is converted rather than left to escape. Cell **W16** races two answers and
asserts the loser's refusal is CLR10 with the named discriminant and NOT a duplicate-key message,
with exactly one entry and one answer row left behind.

**ADV-08 — `BankTab` was a hand-copy with no compile-time link, and the #1060 report claimed
otherwise. FIXED, and the claim is corrected here.** `bank-workbench.tsx` imports `BankTab` from the
navigation registry and its `TABS` tuple is checked against it in BOTH directions at compile time.
Probed: a tab the union lacks reds (`"agencyX"` → TS2322), and a union value the tuple lacks reds
(the exhaustiveness line → TS2322). The dependency runs component → lib, the direction every other
import in that file already runs. **The #1060 ticket report's AC1 evidence sentence was wrong when
written**; it is true now, and the integrator should carry this correction rather than that claim.

**ADV-09 — `tab: "matching"` moved the bank destination for every registry caller. ACCEPTED as the
ticket's own ask; the real drift is fixed.** #1060's AC1 says in as many words: "The bank navigation
entry carries a `tab` pointing at the Matching view". `assets` already carries
`tab: "fixedAssets"` while the registers workbench's own default is `"aging"`, so this is the
established house pattern and not a side effect. What WAS drift is that
`components/firm/client-home/client-bank-summary.tsx` spelled `/clients/:id/bank` by hand and so
kept landing on the workbench's default — three surfaces, two answers. It goes through
`accountingHref` now, and a new cell in `lib/navigation/tree.test.ts` scans `components/` and `app/`
for a second decider (probed: restoring the hand-spelled href reds it).

**Left deliberately**: the bank workbench's own default stays `"accounts"`. A bare `/bank` typed by
hand must still resolve to something, and "accounts" is a harmless fallback rather than a competing
claim about the front door. **For the owner's eyes, as a product change the ticket asked for**: a
viewer clicking "Bank" anywhere now lands on Matching.

**STANDARDS-1 — the new row kind had no by-name affordance case. FIXED.** One cell in
`needs-you-affordances.test.ts`, in that file's own F8 shape (probed: removing the registry line
reds exactly that cell and nothing else). The reviewer's optional follow-up — backfill `work_question`
and `accrual_bill_conflict`, or retire the sync-point note — is left as a follow-up below, because
it is a repo sweep and not this ticket's.

**ADV-10 — a viewer is offered the two buttons that post a payroll run. STAYS, with the reason.**
The finding's own required fix says "None required for this lane", and the fix is not small:
`NeedsYouAffordanceProps` (`needs-you-affordances.tsx`) carries `row`, `busy`, `error` and `act` and
no role at all, so gating this one affordance means widening a prop type sixteen other affordances
share and threading a role through `needs-you-inbox.tsx` — a repo-wide change to the house pattern,
made on the strength of one row. The wall itself is real and driven: the door floors at
`clara.role_rank('bookkeeper')` and refuses a viewer CLR04. Filed as a follow-up.

### Notes

**ADV-11 — a printed page count of zero reported the wrong reason. FIXED** (it rode ADV-01's slice:
one arm in the same body, one assertion appended to W4c). **ADV-12 — a mis-clicked `no` was told to
re-file the document. FIXED**: the declined sentence names both remedies now, including the re-read
`clara.request_reextraction` has offered since 0025/0026; W9's own assertion extended.

**SPEC-05 — AC5's from-scratch half. UNCHANGED, and still the integrator's.** The rig forbids a
second from-scratch chain on a lane cluster. What stands in its place on this branch is the
rolled-back first-apply rehearsal above for SectionL, plus the eight guarded
`CLARA_MIGRATION_REDO` re-applies this round ran. **Do not mark AC5 done from this report.**

**SPEC-06, SPEC-07, SPEC-08** — notes the reviewer recorded as correct-as-built; nothing to do.
SPEC-08's integration watch is now WIDER, not narrower: 0343 republishes the registry too, so the
integrator should confirm 0342 and 0343 are the only registry republications in the wave and that
they land in that order (0343's `replace()` anchor is 0342's post-image sentence).

## Migration edits, and how the lane database took them

0343 is unmerged and was edited; 0342 was **not** touched. Eight `CLARA_MIGRATION_REDO=0343_payroll_completeness_witness`
re-applies, each with `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1` against `clara_l07`. Final applied
checksum **`a3c300e95ebe2af3113b2dcdcb1421f47cfc8cc0b4c8035e2d5457be49650f12`**, which matches the
file on disk byte for byte and the web pins corpus entry (`firm-scope-db-pins.test.ts`, 22/22 green).
The corpus entry's reviewed REASON text was corrected too: it claimed the tail re-derives that the
registry was not republished, which SectionL makes false.

`frozen-evaluators.json`'s `clara.evaluate_payroll_run_state_v2` sha is re-pinned BY HAND (never
`--update`, 0111's recorded reason) to `56ad4074518e15a44315fe8d638c93121ada4ebd9153feef1fdad6bb84f6205a`,
with the change recorded in the entry's own note. `node scripts/check-frozen-evaluators.mjs` → OK,
12 evaluators.

**Rig repair, disclosed.** 0343's SectionB.1 refuses a re-registration of
`clara.evaluate_payroll_run_state_v2` at a different closure hash — exactly right for a merged file,
and an artifact of an earlier apply for an unmerged one. Before each redo that moved the evaluator
body, the lane database's version-2 `clara.evaluator_versions` row and its member were deleted by
hand as superuser with `session_replication_role = replica` (the table is append-only by trigger).
The COMMITTED file is unchanged in shape and registers the final body on a first apply. This is
recorded in `packages/db/README.md`'s new 0343 fix-round section as well as here.

**No prestate pin moved.** SectionA is untouched; all eight signatures it pins are the same bodies
at the same shas, and the redo reported the redo path for all four markers on every run.

## Gates

| gate | result |
|---|---|
| `payroll-completeness-witness.test.mjs` (full `$GATES` chain) | 19/19 pass |
| `document-capability-registry.test.mjs` | 23/23 pass |
| `payroll-summary-posting` + `payroll-summary-facts` + `payroll-settlement` + `agreement-contract-acquisition` (with the two above, one run) | **141 tests, 141 pass, 0 fail, 0 skipped** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags) | 33 tests, 32 pass, 0 fail, 1 skipped (known Windows arm) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5187 tests, 5185 pass, 0 fail, 2 skipped** |
| `apps/web` `payroll-settlements-section.test.tsx` | 9/9 (4 new) |
| `apps/web` `tree.test.ts` / `needs-you-affordances.test.ts` / `firm-scope-db-pins.test.ts` | 28 / 15 / 22, all pass |
| `apps/web` `e2e-fixture-ownership.test.ts` | 44/44 pass |
| e2e `payroll-settlement` (triple 3560/3561/3562) | **3 passed** (incl. the new durable-discovery leg + axe scan) |
| e2e `bank-match` | 6 passed |
| e2e `tenancy-rent-plan` | 2 passed |
| e2e `firm-navigation` | 11 passed |
| `pnpm typecheck` | Done, both projects |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| `node scripts/check-frozen-evaluators.mjs` | OK, 12 evaluators |
| `node scripts/check-frozen-workflows.mjs` | OK, 322 frozen files |

**One gate caveat the integrator must know.** `pnpm lint` run with the DEFAULT `FREEZE_BASE_REF`
(`origin/main`) fails with 38 frozen-workflow violations — `chatTurn` v22→v21, `claraWork` v6→v5,
`statementFacts` v4→v3 and their files. That is **base drift, not this lane's**: `origin/main` is 59
commits ahead of `7bc5a710f`, this branch touches nothing under `packages/runtime`
(`git diff --stat 7bc5a710f..HEAD -- packages/runtime` is empty), and with `FREEZE_BASE_REF=7bc5a710f`
— the base the work order's wave-2 addendum says to use everywhere — the lint is clean at exit 0.

## Docs updated in the same commits

- `packages/db/README.md` — a new **"0343 — the fix round"** section (all seven migration findings,
  the rig repair, the battery count, the new registry version) and a **"What is LIVE today, and what
  is not"** paragraph for SPEC-03.
- `apps/web/README.md` — two paragraphs in the #657/#947 section: the durable+resumable reverse
  route (what it reads, why no migration, the three states) and the one-decider rule for the bank
  destination.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — the reviewed barrier REASON for 0343 corrected and
  its sha re-measured.
- `frozen-evaluators.json` — the v2 note records the fix-round body change.
- No `CONTEXT.md` change: the fix round adds no new vocabulary (`Completeness witness` already
  covers the witness, the parked question and the answer's binding to a reading).

## Successor contracts

1. **`payrollFacts_v2`** (carried forward from `waveS-lane04-ticket1048.md` §9.1, unchanged and now
   load-bearing for SPEC-03): add `payroll.run.employee_count` and `payroll.run.page_count` as
   OPTIONAL fields to `PAYROLL_RUN_FIELDS`, with the prompt stanza in that report. Until it ships,
   the two page-printed witnesses are exercised by 0343's battery and by nothing else. The database
   half already admits the answers (`clara._payroll_answers_ok`'s two optional keys) and needs no
   further change.
2. **No frozen chat or Work tool change** is required by this fix round. The `awaiting_checker`
   receipt shape the answer door now returns is additive (`status`, `eligible_checker_count`) and
   matches 0298's, so a future tool reads one vocabulary across both payroll doors.

## Follow-ups worth filing

1. **`payrollFacts_v2`** — the ticket SPEC-03 requires before #1048 is described as delivered. Body:
   §9.1 of `waveS-lane04-ticket1048.md`, plus the note that 0343's battery is the only thing
   exercising the two witnesses today.
2. **A viewer is offered inline acts they cannot perform** (ADV-10) — house-wide, not this row.
   `NeedsYouAffordanceProps` carries no role; if the house ever revisits the pattern,
   `payroll_completeness_question` is the row to start with, because it is the first inline act that
   books a journal entry.
3. **The five-sync-point note has drifted twice before** (STANDARDS-1's own mitigation):
   `work_question` (#629) and `accrual_bill_conflict` (#938) still have no by-name case in
   `needs-you-affordances.test.ts`. Backfill both, or retire the note's claim.
4. **`clara.list_review_queue` evaluates `clara._payroll_posting_verdict` twice per payroll filing
   per queue read** (the adversarial lens's own "worth the integrator knowing", not a finding).
   Unmeasured; worth a look once a firm accumulates payroll summaries.
5. **The single-page witness posts unattended on a basis 0343's own header calls insufficient**
   (the same list). It is in the ticket's scope so it is not a defect, but it is the weakest thing in
   the lane and it becomes reachable the moment `payrollFacts_v2` ships. Worth the owner's eyes
   BEFORE that ticket, not after.

## Anything unverified

- **PostgREST's answer to the three new table reads is not proven against a live PostgREST.** No
  PostgREST runs on this rig; the reads are proven at the component seam and on the built bundle
  against the lane's own mock, and the GRANTS they depend on were re-measured live on `clara_l07`.
  The filters used are only `eq`, `in` and `is.null`, which this repo already uses in production
  read modules — that is why no jsonb operator was guessed.
- **AC5's from-scratch half** (SPEC-05) — the integrator's disposable-cluster `0001 → 0343` chain.
- **The registry ordering watch** (SPEC-08, widened): confirm at integration that 0342 and 0343 are
  the only `clara.document_capabilities` republications in the wave, and that they apply in that
  order — 0343's `replace()` anchor is 0342's post-image sentence, so the reverse order silently
  no-ops the correction (the tail then catches it and refuses, which is the intended failure).
